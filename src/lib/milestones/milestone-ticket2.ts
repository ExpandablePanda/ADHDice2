import type { Database, Milestone, Task } from "@/lib/database.types";
import { compareMilestoneCalendarDates, milestoneCalendarDaysBetween } from "@/lib/milestones/milestone-dates";
import { getMilestoneEligibility } from "@/lib/milestones/milestone-eligibility";
import type {
  MilestoneAnswersV1,
  MilestoneComplexity,
  MilestoneCurrentProgress,
  MilestoneDifficulty,
  MilestoneEstimatedDuration,
  MilestoneExternalDeadline,
  MilestoneMeaning,
  MilestoneRecommendationV1,
  MilestoneTier,
  MilestoneTimelinePredictability,
  MilestoneWeeklyCapacity,
  MilestoneWorkFrequency,
} from "@/lib/milestones/milestone-types";

export type MilestoneLockArgs = Database["public"]["Functions"]["adhdice_lock_milestone"]["Args"];
export type MilestoneCorrectionArgs = Database["public"]["Functions"]["adhdice_correct_milestone_setup"]["Args"];
export type MilestoneTaskLifecycleArgs = {
  p_task_id: string;
  p_milestone_id: string;
  p_expected_task_revision: number;
  p_expected_milestone_revision: number;
  p_operation_id: string;
};

export type MilestoneEstimatedDurationDraft =
  | { kind: "duration"; unit: Extract<MilestoneEstimatedDuration, { kind: "duration" }>["unit"]; value: number | null }
  | Extract<MilestoneEstimatedDuration, { kind: "target_date" | "not_sure" }>;

export type MilestoneWeeklyCapacityDraft =
  | { kind: "hours_per_week"; hours: number | null }
  | Extract<MilestoneWeeklyCapacity, { kind: "varies" | "not_sure" }>;

export type MilestoneAnswersDraft = {
  estimatedDuration: MilestoneEstimatedDurationDraft;
  weeklyCapacity: MilestoneWeeklyCapacityDraft | null;
  difficulty: MilestoneDifficulty | null;
  meaning: MilestoneMeaning | null;
  complexity: MilestoneComplexity | null;
  timelinePredictability: MilestoneTimelinePredictability | null;
  currentProgress: MilestoneCurrentProgress | null;
  workFrequency: MilestoneWorkFrequency | null;
  externalDeadline: MilestoneExternalDeadline | null;
};

const TIER_RANK: Record<MilestoneTier, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

export function createInitialMilestoneAnswersDraft(): MilestoneAnswersDraft {
  return {
    estimatedDuration: { kind: "duration", unit: "weeks", value: null },
    weeklyCapacity: null,
    difficulty: null,
    meaning: null,
    complexity: null,
    timelinePredictability: null,
    currentProgress: null,
    workFrequency: null,
    externalDeadline: null,
  };
}

export function validateMilestoneQuestion(draft: MilestoneAnswersDraft, questionIndex: number, localDate: string) {
  switch (questionIndex) {
    case 0: {
      const value = draft.estimatedDuration;
      if (value.kind === "duration" && (!value.value || value.value <= 0)) return "Enter a positive duration or choose Not sure.";
      if (value.kind === "target_date" && compareMilestoneCalendarDates(value.targetDate, localDate) <= 0) return "Choose a target date after today.";
      return null;
    }
    case 1: {
      const value = draft.weeklyCapacity;
      if (!value) return "Choose a realistic weekly capacity.";
      if (value.kind === "hours_per_week" && (!value.hours || value.hours <= 0)) return "Enter positive weekly hours.";
      return null;
    }
    case 2: return draft.difficulty ? null : "Choose a difficulty.";
    case 3: return draft.meaning ? null : "Choose what this goal means to you.";
    case 4: return draft.complexity ? null : "Choose a complexity level.";
    case 5: return draft.timelinePredictability ? null : "Choose a timeline predictability level.";
    case 6: return draft.currentProgress ? null : "Choose your current progress.";
    case 7: return draft.workFrequency ? null : "Choose a work frequency.";
    case 8: {
      const value = draft.externalDeadline;
      if (!value) return "Choose an external deadline option.";
      if ((value.kind === "preferred" || value.kind === "firm") && compareMilestoneCalendarDates(value.date, localDate) <= 0) return "Choose a deadline after today.";
      return null;
    }
    default: return "Unknown Milestone question.";
  }
}

export function finalizeMilestoneAnswers(draft: MilestoneAnswersDraft, localDate: string): MilestoneAnswersV1 {
  for (let index = 0; index < 9; index += 1) {
    const error = validateMilestoneQuestion(draft, index, localDate);
    if (error) throw new Error(error);
  }
  const estimatedDuration = draft.estimatedDuration.kind === "duration"
    ? { ...draft.estimatedDuration, value: draft.estimatedDuration.value! }
    : draft.estimatedDuration;
  const weeklyCapacity = draft.weeklyCapacity?.kind === "hours_per_week"
    ? { ...draft.weeklyCapacity, hours: draft.weeklyCapacity.hours! }
    : draft.weeklyCapacity!;
  return {
    estimatedDuration,
    weeklyCapacity,
    difficulty: draft.difficulty!,
    meaning: draft.meaning!,
    complexity: draft.complexity!,
    timelinePredictability: draft.timelinePredictability!,
    currentProgress: draft.currentProgress!,
    workFrequency: draft.workFrequency!,
    externalDeadline: draft.externalDeadline!,
  };
}

export function isTierAbove(candidate: MilestoneTier, baseline: MilestoneTier) {
  return TIER_RANK[candidate] > TIER_RANK[baseline];
}

export function validateMilestoneAdjustment(input: {
  allowedMax: string;
  allowedMin: string;
  recommendedTier: MilestoneTier;
  selectedTargetDate: string;
  selectedTier: MilestoneTier;
  tierRaiseExplanation: string;
}) {
  if (compareMilestoneCalendarDates(input.selectedTargetDate, input.allowedMin) < 0
    || compareMilestoneCalendarDates(input.selectedTargetDate, input.allowedMax) > 0) {
    return "Choose a target date inside the allowed range.";
  }
  if (isTierAbove(input.selectedTier, input.recommendedTier) && !input.tierRaiseExplanation.trim()) {
    return "Explain why you are raising the recommended tier.";
  }
  return null;
}

export function buildMilestoneLockArgs(input: {
  answers: MilestoneAnswersV1;
  completionTimezone: string;
  operationId: string;
  recommendation: MilestoneRecommendationV1;
  selectedTargetDate: string;
  selectedTier: MilestoneTier;
  task: Pick<Task, "id" | "revision">;
  tierRaiseExplanation: string;
}): MilestoneLockArgs {
  const { recommendation } = input;
  return {
    p_allowed_target_date_max: recommendation.target.allowedTargetDateMax,
    p_allowed_target_date_min: recommendation.target.allowedTargetDateMin,
    p_answers_snapshot: recommendation.answers as unknown as Record<string, unknown>,
    p_completion_timezone: input.completionTimezone,
    p_deadline_kind: recommendation.target.deadlineKind,
    p_expected_task_revision: input.task.revision,
    p_external_deadline: recommendation.target.externalDeadline,
    p_feasibility_warning: recommendation.target.feasibilityWarning,
    p_operation_id: input.operationId,
    p_questions_version: recommendation.questionsVersion,
    p_recommendation_snapshot: recommendation as unknown as Record<string, unknown>,
    p_recommended_target_date: recommendation.target.recommendedTargetDate,
    p_recommended_tier: recommendation.tier.tier,
    p_rules_explanation: recommendation.tier.explanation,
    p_rules_version: recommendation.rulesVersion,
    p_selected_target_date: input.selectedTargetDate,
    p_selected_tier: input.selectedTier,
    p_task_id: input.task.id,
    p_tier_raise_explanation: input.tierRaiseExplanation.trim() || null,
  };
}

export function buildMilestoneCorrectionArgs(input: {
  milestone: Milestone;
  operationId: string;
  selectedTargetDate: string;
  selectedTier: MilestoneTier;
  tierRaiseExplanation: string;
}): MilestoneCorrectionArgs {
  return {
    p_corrected_target_date: input.selectedTargetDate,
    p_corrected_tier: input.selectedTier,
    p_expected_revision: input.milestone.revision,
    p_milestone_id: input.milestone.id,
    p_operation_id: input.operationId,
    p_tier_raise_explanation: input.tierRaiseExplanation.trim() || null,
  };
}

export function getOrCreateMilestoneOperationId(current: string | null, create: () => string) {
  return current ?? create();
}

export function mergeMilestoneRows(current: Milestone[], incoming: Milestone) {
  const index = current.findIndex((row) => row.id === incoming.id);
  if (index < 0) return [...current, incoming];
  const existing = current[index]!;
  if (existing.revision > incoming.revision) return current;
  if (existing.revision === incoming.revision && existing.updated_at >= incoming.updated_at) return current;
  const next = [...current];
  next[index] = incoming;
  return next;
}

export function buildMilestoneLookups(milestones: Milestone[]) {
  const milestoneByTaskId = new Map<string, Milestone>();
  const activeMilestoneTaskIds = new Set<string>();
  const milestoneTaskIds = new Set<string>();
  const milestoneSearchTokensByTaskId = new Map<string, string[]>();
  for (const milestone of milestones) {
    if (!milestone.task_id) continue;
    milestoneByTaskId.set(milestone.task_id, milestone);
    if ((milestone.status === "active" || milestone.status === "completed") && milestone.task_trashed_at === null) {
      milestoneTaskIds.add(milestone.task_id);
      milestoneSearchTokensByTaskId.set(milestone.task_id, ["milestone", "milestones", milestone.current_tier]);
    }
    if (milestone.status === "active" && milestone.task_trashed_at === null) activeMilestoneTaskIds.add(milestone.task_id);
  }
  return { activeMilestoneCount: activeMilestoneTaskIds.size, activeMilestoneTaskIds, milestoneByTaskId, milestoneSearchTokensByTaskId, milestoneTaskIds };
}

export function shouldReverseCompletedMilestoneForStatusChange(
  task: Pick<Task, "status">,
  milestone: Pick<Milestone, "status"> | null | undefined,
  nextStatus: Task["status"],
) {
  return task.status === "complete" && nextStatus === "pending" && milestone?.status === "completed";
}

export function canPromoteTaskToMilestone(task: Task, milestoneByTaskId: ReadonlyMap<string, Milestone>) {
  return !milestoneByTaskId.has(task.id) && getMilestoneEligibility(task).eligible;
}

export function canDetachAndPromoteTaskToMilestone(task: Task, milestoneByTaskId: ReadonlyMap<string, Milestone>) {
  if (!task.parent_task_id || milestoneByTaskId.has(task.id)) return false;
  return getMilestoneEligibility({ ...task, parent_task_id: null }).eligible;
}

export function buildDetachAndPromoteUpdate(task: Task) {
  return { taskId: task.id, values: { parent_task_id: null as null } };
}

export function isActiveMilestoneTask(task: Task, milestone: Milestone | null | undefined) {
  return Boolean(milestone
    && milestone.status === "active"
    && milestone.task_trashed_at === null
    && task.status !== "complete"
    && task.status !== "archived"
    && task.status !== "trashed");
}

export function shouldBlockPermanentCompleteForMilestone(task: Task, milestone: Milestone | null | undefined) {
  return isActiveMilestoneTask(task, milestone);
}

export function canCorrectMilestoneSetup(milestone: Milestone, nowMs: number) {
  const lockedAt = Date.parse(milestone.locked_at);
  return milestone.status === "active"
    && !milestone.setup_correction_used
    && Number.isFinite(lockedAt)
    && nowMs <= lockedAt + 24 * 60 * 60 * 1000;
}

export function getMilestoneTimingSummary(milestone: Milestone, localDate: string) {
  const targetDelta = milestoneCalendarDaysBetween(localDate, milestone.current_target_date);
  if (targetDelta > 0) return { detail: `${targetDelta} day${targetDelta === 1 ? "" : "s"} remaining`, label: "On track" };
  if (targetDelta === 0) return { detail: "Target date is today", label: "Target today" };
  if (compareMilestoneCalendarDates(localDate, milestone.current_aura_deadline) <= 0) {
    const auraDays = milestoneCalendarDaysBetween(localDate, milestone.current_aura_deadline);
    return { detail: `${auraDays} aura day${auraDays === 1 ? "" : "s"} remaining`, label: "Grace period" };
  }
  const daysLate = milestoneCalendarDaysBetween(milestone.current_aura_deadline, localDate);
  return { detail: `${daysLate} day${daysLate === 1 ? "" : "s"} past the aura window`, label: "Aura expired / late" };
}

export function formatMilestoneRpcError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("revision conflict")) return "This task changed elsewhere. Refresh its details and try again.";
  if (normalized.includes("must be active")) return "This Milestone is no longer active. Refresh and try again.";
  if (normalized.includes("only an active milestone")) return "Only an active Milestone can be abandoned.";
  if (normalized.includes("must be completed")) return "This Milestone is no longer completed. Refresh and try again.";
  if (normalized.includes("trashed") && normalized.includes("cannot be completed")) return "Restore this task from Trash before completing its Milestone.";
  if (normalized.includes("already closed")) return "This task is already Complete, archived, or trashed.";
  if (normalized.includes("pre-completion task snapshot")) return "This completion cannot be undone because its restore snapshot is unavailable.";
  if (normalized.includes("attached") || normalized.includes("ownership mismatch")) return "The task and Milestone no longer match. Refresh before trying again.";
  if (normalized.includes("already has a milestone") || normalized.includes("milestone identity")) return "This task already has a Milestone.";
  if (normalized.includes("not eligible") || normalized.includes("closed tasks") || normalized.includes("detached")) return "This task is no longer eligible for Milestone promotion.";
  if (normalized.includes("outside") && normalized.includes("range")) return "Choose a target date inside the allowed range.";
  if (normalized.includes("requires an explanation")) return "Explain why you are raising the recommended tier.";
  if (normalized.includes("authentication") || normalized.includes("permission") || normalized.includes("row-level security")) return "Your session cannot update this Milestone. Sign in again and retry.";
  if (normalized.includes("correction window") || normalized.includes("already been used")) return "The one-time Milestone setup correction is no longer available.";
  return "The Milestone could not be saved. Check your connection and retry; the same operation will be reused safely.";
}

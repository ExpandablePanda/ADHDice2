import type { Task } from "@/lib/database.types";

export const MILESTONE_QUESTIONS_VERSION = "milestone-questions-v1" as const;
export const MILESTONE_RULES_VERSION = "milestone-rules-v1" as const;

export type MilestoneTier = "bronze" | "silver" | "gold" | "platinum";
export type MilestoneCompletionTiming = "on_time" | "grace_period" | "late";
export type MilestoneAuraKind = "none" | "standard" | "diamond";
export type MilestoneDeadlineKind = "none" | "preferred" | "firm";

export type MilestoneEstimatedDuration =
  | { kind: "duration"; unit: "hours" | "days" | "weeks" | "months" | "years"; value: number }
  | { kind: "target_date"; targetDate: string }
  | { kind: "not_sure" };

export type MilestoneWeeklyCapacity =
  | { kind: "hours_per_week"; hours: number }
  | { kind: "varies" }
  | { kind: "not_sure" };

export type MilestoneDifficulty =
  | "manageable"
  | "moderately_challenging"
  | "difficult"
  | "very_difficult"
  | "not_sure";

export type MilestoneMeaning =
  | "meaningful_personal_progress"
  | "significant_accomplishment"
  | "major_life_or_project_goal"
  | "exceptional_or_defining_achievement"
  | "not_sure";

export type MilestoneComplexity =
  | "one_clear_outcome"
  | "several_manageable_steps"
  | "many_connected_steps"
  | "large_multi_stage_project"
  | "not_sure";

export type MilestoneTimelinePredictability =
  | "very_predictable"
  | "some_uncertainty"
  | "highly_variable"
  | "depends_on_others"
  | "not_sure";

export type MilestoneCurrentProgress =
  | "not_started"
  | "planning_started"
  | "partly_complete"
  | "more_than_half"
  | "almost_finished"
  | "not_sure";

export type MilestoneWorkFrequency =
  | "most_days"
  | "few_days_per_week"
  | "about_once_per_week"
  | "irregularly"
  | "depends_on_others"
  | "not_sure";

export type MilestoneExternalDeadline =
  | { kind: "none"; date?: never }
  | { kind: "not_sure"; date?: never }
  | { kind: "preferred" | "firm"; date: string };

export type MilestoneAnswersV1 = {
  estimatedDuration: MilestoneEstimatedDuration;
  weeklyCapacity: MilestoneWeeklyCapacity;
  difficulty: MilestoneDifficulty;
  meaning: MilestoneMeaning;
  complexity: MilestoneComplexity;
  timelinePredictability: MilestoneTimelinePredictability;
  currentProgress: MilestoneCurrentProgress;
  workFrequency: MilestoneWorkFrequency;
  externalDeadline: MilestoneExternalDeadline;
};

export type MilestoneTierFactorScores = {
  duration: number;
  difficulty: number;
  meaning: number;
  complexity: number;
  predictability: number;
};

export type MilestoneTierRecommendation = {
  explanation: string;
  explanationPhrases: string[];
  factorScores: MilestoneTierFactorScores;
  tier: MilestoneTier;
  totalScore: number;
  version: typeof MILESTONE_RULES_VERSION;
};

export type MilestoneTargetRecommendation = {
  allowedTargetDateMax: string;
  allowedTargetDateMin: string;
  baseDurationDays: number;
  calculatedDurationDays: number;
  calculatedTargetDate: string;
  capacityMultiplier: number;
  complexityMultiplier: number;
  deadlineKind: MilestoneDeadlineKind;
  externalDeadline: string | null;
  feasibilityWarning: string | null;
  paceMultiplier: number;
  predictabilityMultiplier: number;
  progressMultiplier: number;
  recommendedDurationDays: number;
  recommendedTargetDate: string;
  version: typeof MILESTONE_RULES_VERSION;
  workFrequencyMultiplier: number;
};

export type MilestoneRecommendationV1 = {
  answers: MilestoneAnswersV1;
  questionsVersion: typeof MILESTONE_QUESTIONS_VERSION;
  rulesVersion: typeof MILESTONE_RULES_VERSION;
  target: MilestoneTargetRecommendation;
  tier: MilestoneTierRecommendation;
};

export type MilestoneEligibilityReason =
  | "eligible"
  | "child_task"
  | "indefinitely_recurring"
  | "closed_task";

export type MilestoneEligibilityResult = {
  eligible: boolean;
  reason: MilestoneEligibilityReason;
};

export type MilestoneEligibilityTask = Pick<Task, "parent_task_id" | "repeat_frequency" | "status">;

export type MilestoneReminderKind = "seven_days" | "three_days" | "target_day" | "final_aura_day";
export type MilestoneReminderOpportunity = {
  kind: MilestoneReminderKind;
  scheduledDate: string;
  status: "pending" | "skipped";
};

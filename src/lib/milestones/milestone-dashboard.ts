import type { Milestone, Task } from "@/lib/database.types";
import { compareMilestoneCalendarDates, milestoneCalendarDaysBetween } from "@/lib/milestones/milestone-dates";

export type ActiveMilestoneTimingState = "on_track" | "target_today" | "grace_period" | "past_aura_window";

export type HomeMilestonePreview = {
  milestone: Milestone;
  task: Task;
  timingDetail: string;
  timingState: ActiveMilestoneTimingState;
};

export type HomeMilestoneDashboard = {
  activeCount: number;
  completedCount: number;
  diamondAuraCount: number;
  earnedTierCounts: Record<Milestone["current_tier"], number>;
  gracePeriodCount: number;
  nearestActive: HomeMilestonePreview[];
  pastAuraWindowCount: number;
  recentCompletion: Milestone | null;
  remainingActiveCount: number;
  standardAuraCount: number;
};

export function classifyActiveMilestoneTiming(milestone: Pick<Milestone, "current_aura_deadline" | "current_target_date">, todayDateKey: string): ActiveMilestoneTimingState {
  if (compareMilestoneCalendarDates(todayDateKey, milestone.current_target_date) < 0) return "on_track";
  if (compareMilestoneCalendarDates(todayDateKey, milestone.current_target_date) === 0) return "target_today";
  if (compareMilestoneCalendarDates(todayDateKey, milestone.current_aura_deadline) <= 0) return "grace_period";
  return "past_aura_window";
}

export function formatActiveMilestoneTimingDetail(milestone: Pick<Milestone, "current_aura_deadline" | "current_target_date">, todayDateKey: string) {
  const state = classifyActiveMilestoneTiming(milestone, todayDateKey);
  if (state === "target_today") return "Target is today";
  if (state === "on_track") {
    const days = milestoneCalendarDaysBetween(todayDateKey, milestone.current_target_date);
    return `${days} day${days === 1 ? "" : "s"} remaining`;
  }
  if (state === "grace_period") {
    const days = milestoneCalendarDaysBetween(todayDateKey, milestone.current_aura_deadline);
    return days === 0 ? "Final grace day" : `${days} grace day${days === 1 ? "" : "s"} remaining`;
  }
  const days = milestoneCalendarDaysBetween(milestone.current_aura_deadline, todayDateKey);
  return `${days} day${days === 1 ? "" : "s"} past aura window`;
}

function hasValidEarnedTrophy(milestone: Milestone) {
  return milestone.status === "completed" && Boolean(milestone.trophy_awarded_at) && !milestone.trophy_revoked_at;
}

export function buildHomeMilestoneDashboard(milestones: Milestone[], tasksById: ReadonlyMap<string, Task>, todayDateKey: string): HomeMilestoneDashboard {
  const active = milestones.filter((milestone) => milestone.status === "active" && !milestone.task_trashed_at);
  const completed = milestones.filter((milestone) => milestone.status === "completed");
  const timingByMilestoneId = new Map(active.map((milestone) => [milestone.id, classifyActiveMilestoneTiming(milestone, todayDateKey)]));
  const taskBackedActive = active
    .flatMap((milestone) => {
      const task = milestone.task_id ? tasksById.get(milestone.task_id) : null;
      return task ? [{ milestone, task }] : [];
    })
    .sort((left, right) => left.milestone.current_target_date.localeCompare(right.milestone.current_target_date) || left.milestone.created_at.localeCompare(right.milestone.created_at));
  const earnedTierCounts: HomeMilestoneDashboard["earnedTierCounts"] = { bronze: 0, gold: 0, platinum: 0, silver: 0 };
  let standardAuraCount = 0;
  let diamondAuraCount = 0;

  for (const milestone of completed) {
    if (!hasValidEarnedTrophy(milestone)) continue;
    earnedTierCounts[milestone.current_tier] += 1;
    if (!milestone.aura_revoked_at && milestone.aura_kind === "standard") standardAuraCount += 1;
    if (!milestone.aura_revoked_at && milestone.aura_kind === "diamond") diamondAuraCount += 1;
  }

  const nearestActive = taskBackedActive.slice(0, 3).map(({ milestone, task }) => ({
    milestone,
    task,
    timingDetail: formatActiveMilestoneTimingDetail(milestone, todayDateKey),
    timingState: timingByMilestoneId.get(milestone.id)!,
  }));

  return {
    activeCount: active.length,
    completedCount: completed.length,
    diamondAuraCount,
    earnedTierCounts,
    gracePeriodCount: active.filter((milestone) => timingByMilestoneId.get(milestone.id) === "grace_period").length,
    nearestActive,
    pastAuraWindowCount: active.filter((milestone) => timingByMilestoneId.get(milestone.id) === "past_aura_window").length,
    recentCompletion: [...completed].sort((left, right) => (right.completion_date_key ?? "").localeCompare(left.completion_date_key ?? "") || (right.completed_at ?? right.updated_at).localeCompare(left.completed_at ?? left.updated_at))[0] ?? null,
    remainingActiveCount: Math.max(0, taskBackedActive.length - nearestActive.length),
    standardAuraCount,
  };
}

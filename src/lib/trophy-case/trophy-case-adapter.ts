import type { Milestone, Task } from "@/lib/database.types";
import type { MilestoneAuraKind, MilestoneCompletionTiming, MilestoneTier } from "@/lib/milestones";
import type { EarnedTrophy } from "@/lib/trophy-case/trophy-case-types";

const TIERS = new Set<MilestoneTier>(["bronze", "silver", "gold", "platinum"]);
const TIMINGS = new Set<MilestoneCompletionTiming>(["on_time", "grace_period", "late"]);
const AURAS = new Set<MilestoneAuraKind>(["none", "standard", "diamond"]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isCurrentlyEarnedTrophy(milestone: Milestone): boolean {
  return milestone.status === "completed"
    && Boolean(milestone.trophy_awarded_at)
    && !milestone.trophy_revoked_at
    && TIERS.has(milestone.current_tier)
    && Boolean(milestone.completed_at)
    && Boolean(milestone.completion_date_key && DATE_KEY.test(milestone.completion_date_key))
    && Boolean(milestone.current_target_date && DATE_KEY.test(milestone.current_target_date))
    && Boolean(milestone.completion_timing && TIMINGS.has(milestone.completion_timing))
    && Boolean(milestone.aura_kind && AURAS.has(milestone.aura_kind))
    && Boolean(milestone.task_title_snapshot?.trim());
}

export function adaptCurrentlyEarnedTrophies(milestones: readonly Milestone[], tasks: readonly Task[]): EarnedTrophy[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  return milestones.flatMap((milestone) => {
    if (!isCurrentlyEarnedTrophy(milestone)) return [];
    const title = (milestone.task_id ? tasksById.get(milestone.task_id)?.title : null)?.trim() || milestone.task_title_snapshot.trim();
    return [{
      auraKind: milestone.aura_revoked_at ? "none" : milestone.aura_kind!,
      completedAt: milestone.completed_at!,
      completionDate: milestone.completion_date_key!,
      completionTiming: milestone.completion_timing!,
      currentlyEarned: true as const,
      milestoneId: milestone.id,
      taskId: milestone.task_id,
      targetDate: milestone.current_target_date,
      tier: milestone.current_tier,
      title,
    }];
  });
}

export function resolveFeaturedTrophy(trophies: readonly EarnedTrophy[], featuredMilestoneId: string | null) {
  const featured = trophies.find((trophy) => trophy.milestoneId === featuredMilestoneId);
  if (featured) return featured;
  return [...trophies].sort((a, b) => b.completedAt.localeCompare(a.completedAt) || a.milestoneId.localeCompare(b.milestoneId))[0] ?? null;
}

export function isFeaturedTrophyValid(trophies: readonly EarnedTrophy[], featuredMilestoneId: string | null) {
  return featuredMilestoneId === null || trophies.some((trophy) => trophy.milestoneId === featuredMilestoneId);
}

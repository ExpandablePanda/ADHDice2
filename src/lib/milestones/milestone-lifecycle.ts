import type { Milestone, MilestoneAuraKind, MilestoneCompletionTiming, Task } from "@/lib/database.types";
import { compareMilestoneCalendarDates, milestoneCalendarDaysBetween } from "@/lib/milestones/milestone-dates";

export type MilestoneTaskMutationResult = {
  created_transition: boolean;
  milestone_row: Milestone;
  task_row: Task | null;
};

export type MilestoneOnlyMutationResult = {
  created_transition: boolean;
  milestone_row: Milestone;
};

export function classifyMilestoneLifecycleTiming(completionDate: string, targetDate: string, auraDeadline: string): MilestoneCompletionTiming {
  if (compareMilestoneCalendarDates(completionDate, targetDate) <= 0) return "on_time";
  if (compareMilestoneCalendarDates(completionDate, auraDeadline) <= 0) return "grace_period";
  return "late";
}

export function getLifecycleMilestoneAuraKind(tier: Milestone["current_tier"], timing: MilestoneCompletionTiming): MilestoneAuraKind {
  if (timing === "late") return "none";
  return tier === "platinum" ? "diamond" : "standard";
}

export function getMilestoneCompletionPresentation(milestone: Milestone) {
  const classification = milestone.completion_timing === "on_time"
    ? "On time"
    : milestone.completion_timing === "grace_period" ? "Grace period" : "Late";
  const aura = milestone.aura_kind === "diamond"
    ? "Diamond Aura"
    : milestone.aura_kind === "standard" ? "Standard Aura" : "No aura";
  const dayDelta = milestone.completion_date_key
    ? milestoneCalendarDaysBetween(milestone.completion_date_key, milestone.current_target_date)
    : 0;
  const dayDetail = dayDelta > 0
    ? `${dayDelta} day${dayDelta === 1 ? "" : "s"} early`
    : dayDelta < 0
      ? `${Math.abs(dayDelta)} day${dayDelta === -1 ? "" : "s"} late`
      : "Completed on the target date";
  return { aura, classification, dayDetail };
}

export function getCompletedMilestones(milestones: Milestone[]) {
  return milestones
    .filter((milestone) => milestone.status === "completed")
    .sort((left, right) => {
      const dateOrder = (right.completion_date_key ?? "").localeCompare(left.completion_date_key ?? "");
      return dateOrder || right.created_at.localeCompare(left.created_at);
    });
}

export function mergeAuthoritativeMilestoneTask(tasks: Task[], incoming: Task | null, deletedTaskId?: string) {
  if (deletedTaskId) return tasks.filter((task) => task.id !== deletedTaskId);
  if (!incoming) return tasks;
  const index = tasks.findIndex((task) => task.id === incoming.id);
  if (index < 0) return [...tasks, incoming];
  if (tasks[index]!.revision > incoming.revision) return tasks;
  const next = [...tasks];
  next[index] = incoming;
  return next;
}

export function buildMilestoneLifecycleArgs(task: Task, milestone: Milestone, operationId: string) {
  return {
    p_expected_milestone_revision: milestone.revision,
    p_expected_task_revision: task.revision,
    p_milestone_id: milestone.id,
    p_operation_id: operationId,
    p_task_id: task.id,
  };
}

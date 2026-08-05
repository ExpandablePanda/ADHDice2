import type { Task, TaskHistory, TaskUpdate } from "@/lib/database.types";
import { evaluateTaskScheduleAuthority } from "./action-authority.ts";

/**
 * Compatibility surface for callers that still import the old due-date
 * helper. Status decisions belong to evaluateTaskScheduleAuthority; this
 * adapter only exposes the schedule fields needed by legacy callers.
 */
export function buildManualDueDateTaskUpdate(
  task: Task,
  dueOn: string | null,
  history: readonly TaskHistory[],
  currentDayKey: string,
  options?: { logicalDayRollover?: string; now?: Date | string; timezone?: string },
): TaskUpdate {
  const authority = evaluateTaskScheduleAuthority({
    history: [...history],
    logicalDayRollover: options?.logicalDayRollover ?? "00:00",
    now: options?.now ?? `${currentDayKey}T12:00:00.000Z`,
    proposedTask: { ...task, due_on: dueOn },
    task,
    timezone: options?.timezone ?? "UTC",
  });
  return authority?.mutationPlan.taskUpdate ?? { due_on: dueOn };
}

/** @deprecated Use evaluateTaskScheduleAuthority directly. */
export function reconcileManualDueDateChange(
  task: Task,
  dueOn: string | null,
  history: readonly TaskHistory[],
  currentDayKey: string,
  options?: { logicalDayRollover?: string; now?: Date | string; timezone?: string },
) {
  const authority = evaluateTaskScheduleAuthority({
    history: [...history],
    logicalDayRollover: options?.logicalDayRollover ?? "00:00",
    now: options?.now ?? `${currentDayKey}T12:00:00.000Z`,
    proposedTask: { ...task, due_on: dueOn },
    task,
    timezone: options?.timezone ?? "UTC",
  });
  return {
    activeOccurrenceDueOn: task.status === "in_progress" ? task.active_occurrence_due_on : null,
    activeStatusLogicalDate: task.status === "in_progress" ? task.active_status_logical_date : null,
    status: authority?.mutationPlan.taskUpdate.status ?? task.status,
  };
}

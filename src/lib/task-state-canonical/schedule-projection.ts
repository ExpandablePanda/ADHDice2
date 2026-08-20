import type { Task } from "../database.types.ts";
import type { CanonicalTaskScheduleBoundary } from "./types.ts";

export type CanonicalProjectedTask = Task & {
  /** Read-only schedule seed; never persisted back to the legacy Task row. */
  canonical_schedule_anchor_date?: string | null;
  /** Full boundary retained for direct Task State reads; never persisted. */
  canonical_schedule_boundary?: CanonicalTaskScheduleBoundary | null;
};

export function latestCanonicalScheduleBoundary(boundaries: CanonicalTaskScheduleBoundary[]) {
  return [...boundaries].sort((left, right) => right.boundary_sequence - left.boundary_sequence)[0] ?? null;
}

export function projectTaskWithCanonicalScheduleBoundary(task: Task, boundary: CanonicalTaskScheduleBoundary): CanonicalProjectedTask {
  return {
    ...task,
    canonical_schedule_boundary: boundary,
    canonical_schedule_anchor_date: boundary.schedule_model === "one_time"
      ? boundary.one_time_due_on
      : boundary.schedule_model === "unscheduled"
        ? null
        : boundary.anchor_date,
    due_on: boundary.schedule_model === "one_time" ? boundary.one_time_due_on : boundary.schedule_model === "unscheduled" ? null : task.due_on,
    due_time: boundary.due_time,
    repeat_frequency: boundary.repeat_frequency,
    repeat_interval: boundary.repeat_interval,
    repeat_days_of_week: boundary.repeat_days_of_week,
    repeat_day_of_month: boundary.repeat_day_of_month,
    repeat_monthly_mode: boundary.repeat_monthly_mode,
    repeat_monthly_ordinal: boundary.repeat_monthly_ordinal,
    repeat_monthly_weekday: boundary.repeat_monthly_weekday,
  };
}

/**
 * Merge a legacy Task-row response without dropping the read-only canonical
 * schedule projection already attached to the local Task.
 */
export function mergeTaskWithCanonicalScheduleProjection(
  projectedTask: Task,
  taskRow: Task,
): CanonicalProjectedTask {
  const projection = projectedTask as Partial<CanonicalProjectedTask>;
  return {
    ...taskRow,
    ...(Object.hasOwn(projection, "canonical_schedule_boundary")
      ? { canonical_schedule_boundary: projection.canonical_schedule_boundary }
      : {}),
    ...(Object.hasOwn(projection, "canonical_schedule_anchor_date")
      ? { canonical_schedule_anchor_date: projection.canonical_schedule_anchor_date }
      : {}),
  };
}

export function projectTasksWithCanonicalScheduleBoundaries(tasks: Task[], boundaries: CanonicalTaskScheduleBoundary[]): CanonicalProjectedTask[] {
  const latestByTaskId = new Map<string, CanonicalTaskScheduleBoundary>();
  for (const boundary of boundaries) {
    const current = latestByTaskId.get(boundary.entity_id);
    if (!current || boundary.boundary_sequence > current.boundary_sequence) latestByTaskId.set(boundary.entity_id, boundary);
  }
  return tasks.map((task) => {
    const boundary = latestByTaskId.get(task.id);
    return boundary ? projectTaskWithCanonicalScheduleBoundary(task, boundary) : task;
  });
}

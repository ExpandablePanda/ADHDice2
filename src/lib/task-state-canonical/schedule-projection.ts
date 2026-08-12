import type { Task } from "../database.types.ts";
import type { CanonicalTaskScheduleBoundary } from "./types.ts";

export function latestCanonicalScheduleBoundary(boundaries: CanonicalTaskScheduleBoundary[]) {
  return [...boundaries].sort((left, right) => right.boundary_sequence - left.boundary_sequence)[0] ?? null;
}

export function projectTaskWithCanonicalScheduleBoundary(task: Task, boundary: CanonicalTaskScheduleBoundary): Task {
  return {
    ...task,
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

type CanonicalScheduleTaskChanges = Partial<Pick<Task, "due_on" | "due_time" | "repeat_frequency" | "repeat_interval" | "repeat_days_of_week" | "repeat_day_of_month" | "repeat_monthly_mode" | "repeat_monthly_ordinal" | "repeat_monthly_weekday">>;

export function projectTaskWithCanonicalScheduleChanges(task: Task, changes: CanonicalScheduleTaskChanges): Task {
  return {
    ...task,
    ...(Object.hasOwn(changes, "due_on") ? { due_on: changes.due_on ?? null } : {}),
    ...(Object.hasOwn(changes, "due_time") ? { due_time: changes.due_time ?? null } : {}),
    ...(Object.hasOwn(changes, "repeat_frequency") ? { repeat_frequency: changes.repeat_frequency ?? "none" } : {}),
    ...(Object.hasOwn(changes, "repeat_interval") ? { repeat_interval: changes.repeat_interval ?? 1 } : {}),
    ...(Object.hasOwn(changes, "repeat_days_of_week") ? { repeat_days_of_week: changes.repeat_days_of_week ?? [] } : {}),
    ...(Object.hasOwn(changes, "repeat_day_of_month") ? { repeat_day_of_month: changes.repeat_day_of_month ?? null } : {}),
    ...(Object.hasOwn(changes, "repeat_monthly_mode") ? { repeat_monthly_mode: changes.repeat_monthly_mode ?? "day_of_month" } : {}),
    ...(Object.hasOwn(changes, "repeat_monthly_ordinal") ? { repeat_monthly_ordinal: changes.repeat_monthly_ordinal ?? null } : {}),
    ...(Object.hasOwn(changes, "repeat_monthly_weekday") ? { repeat_monthly_weekday: changes.repeat_monthly_weekday ?? null } : {}),
  };
}

export function projectTasksWithCanonicalScheduleBoundaries(tasks: Task[], boundaries: CanonicalTaskScheduleBoundary[]) {
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

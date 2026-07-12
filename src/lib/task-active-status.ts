import type { Task, TaskUpdate } from "@/lib/database.types";

export function applyTaskActiveStatusTracking(
  task: Pick<Task, "active_occurrence_due_on" | "active_status_logical_date" | "due_on" | "status">,
  values: TaskUpdate,
  currentDayKey: string,
): TaskUpdate {
  const nextStatus = values.status ?? task.status;

  if (task.status !== "in_progress" && nextStatus === "in_progress") {
    return {
      ...values,
      active_occurrence_due_on: values.due_on !== undefined ? values.due_on : task.due_on,
      active_status_logical_date: currentDayKey,
    };
  }

  if (task.status === "in_progress" && nextStatus !== "in_progress") {
    return {
      ...values,
      active_occurrence_due_on: null,
      active_status_logical_date: null,
    };
  }

  return values;
}

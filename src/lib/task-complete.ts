import type { Task, TaskHistoryInsert, TaskRepeatFrequency, TaskStatus } from "@/lib/database.types";
import { getTaskDescendants } from "@/lib/task-hierarchy";

export const COMPLETE_CONFIRMATION_MESSAGE = "Mark permanently Complete? This task will stop recurring and move to Archive.";
export const CHILD_COMPLETE_CONFIRMATION_MESSAGE = "Mark this Step Complete? This will stop recurring but keep it with its parent until the parent is complete.";
export const COMPLETE_BLOCKED_MESSAGE = "Complete all Steps before completing this task.";
export const COMPLETE_CONFIRMATION_DESCRIPTION = "This task will stop recurring and move to Archive.";
export const CHILD_COMPLETE_CONFIRMATION_DESCRIPTION = "This will stop recurring but keep it with its parent until the parent is complete.";

const ONE_OFF_SELECTABLE_STATUSES: TaskStatus[] = [
  "pending",
  "in_progress",
  "missed",
  "complete",
  "upcoming",
  "not_due",
  "archived",
  "trashed",
];

const RECURRING_SELECTABLE_STATUSES: TaskStatus[] = [
  "pending",
  "in_progress",
  "done",
  "did_my_best",
  "missed",
  "complete",
  "upcoming",
  "not_due",
  "archived",
  "trashed",
];

export function getSelectableTaskStatusesForRepeatFrequency(repeatFrequency: TaskRepeatFrequency) {
  return repeatFrequency === "none"
    ? [...ONE_OFF_SELECTABLE_STATUSES]
    : [...RECURRING_SELECTABLE_STATUSES];
}

export function getSelectableTaskStatuses(task: Pick<Task, "repeat_frequency">) {
  return getSelectableTaskStatusesForRepeatFrequency(task.repeat_frequency);
}

export function getTaskHistoryCalendarActionStatuses(task: Pick<Task, "repeat_frequency">) {
  return task.repeat_frequency === "none"
    ? (["missed", "complete"] as const)
    : (["done", "did_my_best", "missed", "complete"] as const);
}

export function getIncompleteCompletionDescendants(taskId: string, tasks: Task[]) {
  return getTaskDescendants(taskId, tasks).filter((descendant) => descendant.status !== "complete");
}

export function canTaskBeMarkedComplete(taskId: string, tasks: Task[]) {
  const blockingDescendants = getIncompleteCompletionDescendants(taskId, tasks);
  return {
    blockingDescendants,
    canComplete: blockingDescendants.length === 0,
  };
}

export function shouldOptimisticallyPatchTaskStatus(status: TaskStatus) {
  return status !== "complete";
}

export function getTaskCompleteConfirmationCopy(task: Pick<Task, "parent_task_id">) {
  return task.parent_task_id ? CHILD_COMPLETE_CONFIRMATION_MESSAGE : COMPLETE_CONFIRMATION_MESSAGE;
}

export function getTaskCompleteConfirmationDescription(task: Pick<Task, "parent_task_id">) {
  return task.parent_task_id ? CHILD_COMPLETE_CONFIRMATION_DESCRIPTION : COMPLETE_CONFIRMATION_DESCRIPTION;
}

export function isArchiveLikeTask(task: Pick<Task, "parent_task_id" | "status">) {
  return task.status === "archived" || (task.status === "complete" && task.parent_task_id === null);
}

export function shouldHideTaskFromPrimaryViews(task: Pick<Task, "parent_task_id" | "status">) {
  return task.status === "trashed" || isArchiveLikeTask(task);
}

export function doesCompleteCountAsDueOccurrence(task: Pick<Task, "due_on" | "repeat_frequency">, currentDayKey: string) {
  if (task.repeat_frequency === "none") {
    return true;
  }

  return Boolean(task.due_on && task.due_on <= currentDayKey);
}

export function buildCompleteHistoryPayload(
  task: Pick<Task, "due_on" | "id" | "repeat_frequency">,
  currentDayKey: string,
  userId: string,
): TaskHistoryInsert {
  const countedAsDueOccurrence = doesCompleteCountAsDueOccurrence(task, currentDayKey);
  return {
    counted_as_due_occurrence: countedAsDueOccurrence,
    entry_date: currentDayKey,
    event_type: "completed_permanently",
    status: "complete",
    task_id: task.id,
    user_id: userId,
    was_completed: task.repeat_frequency === "none" || countedAsDueOccurrence,
  };
}

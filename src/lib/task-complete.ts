import type { Task, TaskHistory, TaskHistoryActionInput, TaskRepeatFrequency, TaskStatus } from "@/lib/database.types";
import type { TaskDisplayStatus } from "@/lib/task-display-status";
import { getTaskDescendants } from "@/lib/task-hierarchy";
import type { TaskCalendarOverride } from "@/lib/task-state-engine/types";

export const COMPLETE_CONFIRMATION_MESSAGE = "Mark permanently Complete? This task will stop recurring and move to Archive.";
export const CHILD_COMPLETE_CONFIRMATION_MESSAGE = "Mark this Step Complete? This will stop recurring but keep it with its parent until the parent is complete.";
export const COMPLETE_BLOCKED_MESSAGE = "Complete all Steps before completing this task.";
export const COMPLETE_CONFIRMATION_DESCRIPTION = "This task will stop recurring and move to Archive.";
export const CHILD_COMPLETE_CONFIRMATION_DESCRIPTION = "This will stop recurring but keep it with its parent until the parent is complete.";

const ONE_OFF_SELECTABLE_STATUSES: TaskStatus[] = [
  "pending",
  "in_progress",
  "delayed",
  "missed",
  "complete",
  "not_due",
  "archived",
];

const RECURRING_SELECTABLE_STATUSES: TaskStatus[] = [
  "pending",
  "in_progress",
  "delayed",
  "done",
  "did_my_best",
  "missed",
  "complete",
  "not_due",
  "archived",
];

const HISTORY_OVERRIDE_ACTION_STATUSES = [
  "done",
  "did_my_best",
  "delayed",
  "missed",
  "complete",
] as const;

const HISTORY_CALENDAR_OVERRIDE_ACTIONS = ["in_progress", "blank_due", "not_due", "due_open"] as const;
export type TaskHistoryCalendarOverrideAction = typeof HISTORY_CALENDAR_OVERRIDE_ACTIONS[number];

export function getSelectableTaskStatusesForRepeatFrequency(repeatFrequency: TaskRepeatFrequency) {
  if (repeatFrequency === "per_week" || repeatFrequency === "per_month") {
    return RECURRING_SELECTABLE_STATUSES.filter((status) => status !== "delayed");
  }
  return repeatFrequency === "none"
    ? [...ONE_OFF_SELECTABLE_STATUSES]
    : [...RECURRING_SELECTABLE_STATUSES];
}

export function getSelectableTaskStatuses(task: Pick<Task, "repeat_frequency">) {
  return getSelectableTaskStatusesForRepeatFrequency(task.repeat_frequency);
}

export function getSelectableTaskDisplayStatusesForRepeatFrequency(repeatFrequency: TaskRepeatFrequency): TaskDisplayStatus[] {
  return [...getSelectableTaskStatusesForRepeatFrequency(repeatFrequency), "unscheduled"];
}

export function canTaskDelay({
  dueOn,
  repeatFrequency,
  status,
}: {
  dueOn: string | null | undefined;
  repeatFrequency?: TaskRepeatFrequency;
  status: TaskDisplayStatus;
}) {
  return Boolean(dueOn)
    && repeatFrequency !== "per_week"
    && repeatFrequency !== "per_month"
    && status !== "unscheduled"
    && status !== "archived"
    && status !== "complete"
    && status !== "did_my_best"
    && status !== "done"
    && status !== "trashed";
}

export function getSelectableTaskStatusesForTask({
  dueOn,
  repeatFrequency,
  status,
}: {
  dueOn: string | null | undefined;
  repeatFrequency: TaskRepeatFrequency;
  status: TaskDisplayStatus;
}) {
  return getSelectableTaskStatusesForRepeatFrequency(repeatFrequency).filter((nextStatus) => (
    nextStatus !== "delayed" || canTaskDelay({ dueOn, repeatFrequency, status })
  ));
}

export function getSelectableTaskDisplayStatusesForTask(input: {
  dueOn: string | null | undefined;
  repeatFrequency: TaskRepeatFrequency;
  status: TaskDisplayStatus;
}) {
  return [...getSelectableTaskStatusesForTask(input), "unscheduled" as const];
}

export function getSelectableTaskDisplayStatuses(task: Pick<Task, "repeat_frequency">) {
  return getSelectableTaskDisplayStatusesForRepeatFrequency(task.repeat_frequency);
}

export function getBatchSelectableTaskStatuses() {
  return RECURRING_SELECTABLE_STATUSES.filter((status) => status !== "delayed");
}

export function getTaskHistoryCalendarActionStatuses(task: Pick<Task, "repeat_frequency">) {
  return task.repeat_frequency === "none"
    ? (["delayed", "missed", "complete"] as const)
    : task.repeat_frequency === "per_week" || task.repeat_frequency === "per_month"
      ? (["done", "did_my_best", "missed", "complete"] as const)
      : (["done", "did_my_best", "delayed", "missed", "complete"] as const);
}

export function isTaskHistoryEntryClearable({
  calendarOverride,
  entry,
  entryDate,
  task,
  todayDateKey,
}: {
  calendarOverride?: Pick<TaskCalendarOverride, "id" | "logicalDate"> | null;
  entry: Pick<TaskHistory, "status"> | null | undefined;
  entryDate: string;
  task: Pick<Task, "status">;
  todayDateKey: string;
}) {
  if (entryDate > todayDateKey
    || task.status === "complete"
    || task.status === "archived"
    || task.status === "trashed"
    || entry?.status === "complete"
    || entry?.status === "delayed") {
    return false;
  }

  const hasClearableHistoryOutcome = entry?.status === "done"
    || entry?.status === "did_my_best"
    || entry?.status === "missed";
  const hasRemovableCalendarOverride = !entry
    && Boolean(calendarOverride?.id)
    && calendarOverride?.logicalDate === entryDate;

  return hasClearableHistoryOutcome || hasRemovableCalendarOverride;
}

export function getTaskHistoryCalendarVisibleActionStatuses({
  engineStatuses,
  historicalOverride = false,
  isMultiSelect,
  task,
}: {
  engineStatuses: readonly TaskStatus[] | null;
  historicalOverride?: boolean;
  isMultiSelect: boolean;
  task: Pick<Task, "repeat_frequency">;
}) {
  const configuredStatuses = historicalOverride
    ? [...HISTORY_OVERRIDE_ACTION_STATUSES]
    : getTaskHistoryCalendarActionStatuses(task);
  const visibleStatuses = isMultiSelect
    ? configuredStatuses.filter((status) => status !== "complete" && status !== "delayed")
    : configuredStatuses;
  if (!engineStatuses) {
    return [...visibleStatuses];
  }
  return visibleStatuses.filter((status) => (
    engineStatuses.includes(status)
  ));
}

export function getTaskHistoryCalendarOverrideActions({
  entryStatuses = [],
  isMultiSelect,
  selectedDate,
  selectedDates,
  task,
  todayDateKey,
}: {
  entryStatuses?: readonly (Pick<TaskHistory, "status"> | null | undefined)[];
  isMultiSelect: boolean;
  selectedDate: string;
  selectedDates?: readonly string[];
  task: Pick<Task, "status">;
  todayDateKey: string;
}): TaskHistoryCalendarOverrideAction[] {
  if (task.status === "complete" || task.status === "archived" || task.status === "trashed") {
    return [] as TaskHistoryCalendarOverrideAction[];
  }
  if (entryStatuses.some((entry) => entry?.status === "complete" || entry?.status === "delayed")) {
    return [] as TaskHistoryCalendarOverrideAction[];
  }
  if (isMultiSelect) {
    const editableDates = (selectedDates ?? [selectedDate]).filter((dateKey) => dateKey <= todayDateKey);
    return editableDates.length > 0 ? ["not_due"] : [];
  }
  if (selectedDate > todayDateKey) {
    return [] as TaskHistoryCalendarOverrideAction[];
  }
  if (selectedDate < todayDateKey) return ["in_progress", "blank_due", "not_due"];
  return [...HISTORY_CALENDAR_OVERRIDE_ACTIONS];
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
): TaskHistoryActionInput {
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

import type { Task, TaskHistory as DbTaskHistory } from "./database.types.ts";
import { shiftDateKey } from "./date-key.ts";
import { deduplicateTaskHistoryByLogicalDate } from "./task-state-canonical/history-deduplication.ts";
import { buildTaskHistoryCalendarDateKeys } from "./task-history-calendar-focus.ts";

export const TASK_HISTORY_DETAIL_OLDER_CHUNK_DAYS = 140;

export type TaskHistoryDetailRange = {
  startDate: string;
  endDate: string;
};

export type TaskHistoryDetailWindow = {
  taskId: string;
  loadedStartDate: string;
  loadedEndDate: string;
  history: DbTaskHistory[];
  status: "error" | "loading" | "ready";
  error: string | null;
  generation: number;
  canLoadOlder: boolean;
  inFlightRequestId: string | null;
};

export function getTaskHistoryInitialDetailRange(todayDateKey: string): TaskHistoryDetailRange {
  const dateKeys = buildTaskHistoryCalendarDateKeys(todayDateKey);
  return {
    endDate: dateKeys.at(-1) ?? todayDateKey,
    startDate: dateKeys[0] ?? todayDateKey,
  };
}

export function getTaskHistoryOlderDetailRange(
  loadedStartDate: string,
  chunkDays = TASK_HISTORY_DETAIL_OLDER_CHUNK_DAYS,
): TaskHistoryDetailRange {
  const endDate = shiftDateKey(loadedStartDate, -1);
  return {
    endDate,
    startDate: shiftDateKey(endDate, -(chunkDays - 1)),
  };
}

export function mergeTaskHistoryDetailRows(
  current: readonly DbTaskHistory[],
  incoming: readonly DbTaskHistory[],
) {
  return deduplicateTaskHistoryByLogicalDate([...current, ...incoming])
    .sort((left, right) => right.entry_date.localeCompare(left.entry_date));
}

export function taskHistoryDetailCanLoadOlder(task: Pick<Task, "created_at" | "due_on" | "active_occurrence_due_on"> | null | undefined, loadedStartDate: string) {
  if (!task) return true;
  const earliestTaskDates = [task.created_at?.slice(0, 10), task.due_on, task.active_occurrence_due_on]
    .filter((date): date is string => Boolean(date));
  return earliestTaskDates.some((date) => date < loadedStartDate);
}

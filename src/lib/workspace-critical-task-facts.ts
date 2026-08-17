import type { Task, TaskHistory } from "@/lib/database.types";
import { shiftDateKey } from "@/lib/task-grid-layout";
import { scheduledOccurrences } from "@/lib/task-state-engine/recurrence";
import type { TaskRecurrence } from "@/lib/task-state-engine/types";

const HISTORY_DATE_QUERY_CHUNK_SIZE = 40;

/**
 * The active occurrence is not enough to resolve a prior Missed chain. Keep
 * one preceding scheduled occurrence as a bounded causal boundary so a later
 * canonical Done/Did My Best can resolve older compatibility evidence.
 */
export function getPreviousScheduledDueDate(task: Pick<
  Task,
  | "due_on"
  | "repeat_frequency"
  | "repeat_interval"
  | "repeat_days_of_week"
  | "repeat_day_of_month"
  | "repeat_monthly_mode"
  | "repeat_monthly_ordinal"
  | "repeat_monthly_weekday"
>) {
  if (!task.due_on || task.repeat_frequency === "none") return null;

  const recurrence: TaskRecurrence = task.repeat_frequency === "weekly"
    ? {
      kind: "weekly",
      intervalWeeks: Math.max(1, task.repeat_interval ?? 1),
      weekdays: [...(task.repeat_days_of_week ?? [])],
      anchorDate: task.due_on,
    }
    : task.repeat_frequency === "monthly"
      ? {
        kind: "monthly",
        intervalMonths: Math.max(1, task.repeat_interval ?? 1),
        mode: task.repeat_monthly_mode === "ordinal_weekday" ? "ordinal_weekday" : "day_of_month",
        dayOfMonth: task.repeat_day_of_month,
        ordinal: task.repeat_monthly_ordinal,
        weekday: task.repeat_monthly_weekday,
        anchorDate: task.due_on,
      }
      : {
        kind: "rolling",
        intervalDays: Math.max(1, task.repeat_interval ?? 1),
        ...(task.repeat_frequency === "daily_until_complete" ? { untilComplete: true } : {}),
      };

  return scheduledOccurrences(
    recurrence,
    task.due_on,
    shiftDateKey(task.due_on, -800),
    shiftDateKey(task.due_on, -1),
    { includeBeforeDueOn: true },
  ).at(-1) ?? null;
}

export function collectCriticalTaskHistoryDates(tasks: readonly Task[], logicalDayKey: string) {
  const dates = new Set<string>([logicalDayKey]);
  for (const task of tasks) {
    if (task.status === "archived" || task.status === "trashed" || task.status === "complete") continue;
    if (task.active_status_logical_date) dates.add(task.active_status_logical_date);
    if (task.active_occurrence_due_on) dates.add(task.active_occurrence_due_on);
    const previousDueDate = getPreviousScheduledDueDate(task);
    if (previousDueDate) dates.add(previousDueDate);
    const closedOneOff = task.repeat_frequency === "none"
      && (task.completed_at !== null || task.status === "done" || task.status === "missed" || task.status === "did_my_best");
    const needsDueDateForLiveOccurrence = task.due_on !== null
      && task.active_occurrence_due_on === null
      && (!closedOneOff || task.repeat_frequency !== "none");
    if (needsDueDateForLiveOccurrence) dates.add(task.due_on);
  }
  return Array.from(dates).sort();
}

export function chunkCriticalTaskHistoryDates(dates: readonly string[]) {
  const chunks: string[][] = [];
  for (let index = 0; index < dates.length; index += HISTORY_DATE_QUERY_CHUNK_SIZE) {
    chunks.push(dates.slice(index, index + HISTORY_DATE_QUERY_CHUNK_SIZE));
  }
  return chunks;
}

function historyRelevanceDate(row: TaskHistory) {
  return row.occurrence_due_on ?? row.entry_date;
}

/**
 * Keep only facts needed to resolve the live occurrence. Calendar/report rows
 * are loaded by their explicit consumers and never enter this startup cache.
 */
export function selectCriticalTaskHistoryFacts(
  tasks: readonly Task[],
  rows: readonly TaskHistory[],
  logicalDayKey: string,
) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const currentRows: TaskHistory[] = [];
  const latestRelevantByTaskId = new Map<string, TaskHistory>();

  for (const row of rows) {
    const task = taskById.get(row.task_id);
    if (!task) continue;
    if (row.entry_date === logicalDayKey) {
      currentRows.push(row);
      continue;
    }
    const relevanceDate = historyRelevanceDate(row);
    const declaredDates = new Set([
      task.active_status_logical_date,
      task.active_occurrence_due_on,
      task.due_on,
      getPreviousScheduledDueDate(task),
    ].filter((value): value is string => Boolean(value)));
    if (!declaredDates.has(relevanceDate) && !declaredDates.has(row.entry_date)) continue;
    const previous = latestRelevantByTaskId.get(row.task_id);
    if (!previous || `${row.entry_date}:${row.updated_at}` > `${previous.entry_date}:${previous.updated_at}`) {
      latestRelevantByTaskId.set(row.task_id, row);
    }
  }

  return [...currentRows, ...latestRelevantByTaskId.values()]
    .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
    .sort((left, right) => right.entry_date.localeCompare(left.entry_date) || right.updated_at.localeCompare(left.updated_at));
}

export function mergeTaskHistoryCache(current: readonly TaskHistory[], incoming: readonly TaskHistory[]) {
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return Array.from(byId.values()).sort(
    (left, right) => right.entry_date.localeCompare(left.entry_date) || right.updated_at.localeCompare(left.updated_at),
  );
}

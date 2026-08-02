import type { Task, TaskHistory } from "@/lib/database.types";

const HISTORY_DATE_QUERY_CHUNK_SIZE = 40;

export function collectCriticalTaskHistoryDates(tasks: readonly Task[], logicalDayKey: string) {
  const dates = new Set<string>([logicalDayKey]);
  for (const task of tasks) {
    if (task.active_status_logical_date) dates.add(task.active_status_logical_date);
    if (task.active_occurrence_due_on) dates.add(task.active_occurrence_due_on);
    if (task.due_on) dates.add(task.due_on);
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

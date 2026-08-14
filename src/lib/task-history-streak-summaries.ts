import type { Task, TaskHistory } from "@/lib/database.types";
import {
  deduplicateTaskHistoryByLogicalDate,
  getTaskHistoryLastDone,
  type TaskHistoryStreakEntry,
} from "@/lib/task-history";
import { resolveTaskHistoryCalendarRead } from "@/lib/task-state-engine/calendar-authority";
import { computeTaskEffectiveTimelineStreaks } from "@/lib/task-state-engine/effective-timeline";

export const TASK_HISTORY_STREAK_SUMMARY_COLUMNS = "id,task_id,entry_date,occurrence_key,occurrence_due_on,status,event_type,counted_as_due_occurrence,was_completed,created_at,updated_at";

export type TaskHistoryStreakSummary = {
  currentStreak: number;
  lastDoneAt: string | null;
  lastDoneDate: string | null;
  missedStreak: number;
};

export type TaskHistoryStreakSummaryMap = Record<string, TaskHistoryStreakSummary>;

export type TaskHistoryStreakSummaryContext = {
  logicalDayRollover?: string;
  now?: Date | string;
  timezone?: string;
};

function resolveCalendarRange(
  task: Task,
  history: readonly TaskHistoryStreakEntry[],
  todayDateKey: string,
) {
  const earliestDate = [
    task.due_on,
    task.active_occurrence_due_on,
    ...history.flatMap((entry) => [entry.entry_date, entry.occurrence_due_on]),
  ]
    .filter((date): date is string => typeof date === "string" && date <= todayDateKey)
    .sort()[0] ?? todayDateKey;
  return { calendarEnd: todayDateKey, calendarStart: earliestDate };
}

export function buildTaskHistoryStreakSummary(
  task: Task,
  history: readonly TaskHistoryStreakEntry[],
  todayDateKey: string,
  context: TaskHistoryStreakSummaryContext = {},
): TaskHistoryStreakSummary {
  const normalizedHistory = deduplicateTaskHistoryByLogicalDate(history);
  const { calendarStart } = resolveCalendarRange(task, normalizedHistory, todayDateKey);
  const calendarRead = resolveTaskHistoryCalendarRead({
    calendarStart,
    calendarEnd: todayDateKey,
    history: normalizedHistory as unknown as TaskHistory[],
    logicalDayRollover: context.logicalDayRollover ?? "00:00",
    now: context.now ?? `${todayDateKey}T12:00:00.000Z`,
    task,
    timezone: context.timezone ?? "UTC",
  });
  const streaks = calendarRead?.timeline
    ? calendarRead.timeline
    : calendarRead
      ? computeTaskEffectiveTimelineStreaks(calendarRead.states, todayDateKey)
      : { currentCompletedStreak: 0, currentMissedStreak: 0 };
  const lastDone = getTaskHistoryLastDone(normalizedHistory);
  return {
    currentStreak: streaks.currentCompletedStreak,
    lastDoneAt: lastDone?.timestamp ?? null,
    lastDoneDate: lastDone?.dateKey ?? null,
    missedStreak: streaks.currentMissedStreak,
  };
}

export function buildTaskHistoryStreakSummaryMap(
  tasks: readonly Task[],
  history: readonly TaskHistoryStreakEntry[],
  todayDateKey: string,
  context: TaskHistoryStreakSummaryContext = {},
): TaskHistoryStreakSummaryMap {
  const historyByTaskId = new Map<string, TaskHistoryStreakEntry[]>();
  for (const entry of deduplicateTaskHistoryByLogicalDate(history)) {
    const entries = historyByTaskId.get(entry.task_id) ?? [];
    entries.push(entry);
    historyByTaskId.set(entry.task_id, entries);
  }

  return Object.fromEntries(
    tasks.map((task) => [
      task.id,
      buildTaskHistoryStreakSummary(task, historyByTaskId.get(task.id) ?? [], todayDateKey, context),
    ]),
  );
}

export function updateTaskHistoryStreakSummaryMap(
  current: TaskHistoryStreakSummaryMap,
  task: Task,
  history: readonly TaskHistoryStreakEntry[],
  todayDateKey: string,
  context: TaskHistoryStreakSummaryContext = {},
): TaskHistoryStreakSummaryMap {
  return {
    ...current,
    [task.id]: buildTaskHistoryStreakSummary(task, history, todayDateKey, context),
  };
}

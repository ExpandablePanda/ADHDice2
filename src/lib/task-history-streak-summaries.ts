import type { Task, TaskHistory } from "@/lib/database.types";
import {
  deduplicateTaskHistoryByLogicalDate,
  getTaskHistoryLastDone,
  type TaskHistoryStreakEntry,
} from "@/lib/task-history";
import { resolveTaskHistoryCalendarRead } from "@/lib/task-state-engine/calendar-authority";
import { computeTaskEffectiveTimelineStreaks, taskEffectiveTimelineDaysFromStates } from "@/lib/task-state-engine/effective-timeline";
import type { TaskCalendarOverride } from "@/lib/task-state-engine/types";
import type { CanonicalTaskCommandOperation, CanonicalTaskCalendarOverride } from "@/lib/task-state-canonical/types";
import { buildTaskHistoryLastHandledSummaryMap, type TaskHistoryLastHandledSummaryMap } from "@/lib/task-history-last-handled";

export const TASK_HISTORY_STREAK_SUMMARY_COLUMNS = "id,task_id,entry_date,occurrence_key,occurrence_due_on,status,event_type,counted_as_due_occurrence,was_completed,created_at,updated_at";

export type TaskHistoryStreakSummary = {
  currentStreak: number;
  lastHandledAt?: string | null;
  lastHandledDate?: string | null;
  lastDoneAt: string | null;
  lastDoneDate: string | null;
  missedStreak: number;
};

export type TaskHistoryStreakSummaryMap = Record<string, TaskHistoryStreakSummary>;

export type TaskHistoryStreakSummaryContext = {
  compatibilityOnly?: boolean;
  calendarOverrides?: TaskCalendarOverride[];
  calendarOverridesByTaskId?: Readonly<Record<string, TaskCalendarOverride[]>>;
  manualActionCalendarOverrides?: CanonicalTaskCalendarOverride[];
  manualActionCommandOperations?: CanonicalTaskCommandOperation[];
  logicalDayRollover?: string;
  now?: Date | string;
  timezone?: string;
  manualActionSummaryByTaskId?: TaskHistoryLastHandledSummaryMap;
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
    compatibilityOnly: context.compatibilityOnly,
    calendarStart,
    calendarEnd: todayDateKey,
    history: normalizedHistory as unknown as TaskHistory[],
    logicalDayRollover: context.logicalDayRollover ?? "00:00",
    now: context.now ?? `${todayDateKey}T12:00:00.000Z`,
    task,
    timezone: context.timezone ?? "UTC",
    calendarOverrides: context.calendarOverrides,
  });
  const resolvedTimelineDays = calendarRead?.timeline?.days
    ?? (calendarRead ? taskEffectiveTimelineDaysFromStates(calendarRead.states) : null);
  const streaks = resolvedTimelineDays
    ? computeTaskEffectiveTimelineStreaks(resolvedTimelineDays, todayDateKey)
    : { currentCompletedStreak: 0, currentMissedStreak: 0 };
  const lastDone = getTaskHistoryLastDone(normalizedHistory, todayDateKey);
  const lastHandled = context.manualActionSummaryByTaskId?.[task.id];
  return {
    currentStreak: streaks.currentCompletedStreak,
    lastHandledAt: lastHandled?.timestamp ?? null,
    lastHandledDate: lastHandled?.dateKey ?? null,
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

  const manualActionSummaryByTaskId = context.manualActionSummaryByTaskId ?? buildTaskHistoryLastHandledSummaryMap(
    tasks,
    history as TaskHistory[],
    context.manualActionCalendarOverrides ?? [],
    context.manualActionCommandOperations ?? [],
    todayDateKey,
  );

  return Object.fromEntries(
    tasks.map((task) => [
      task.id,
      buildTaskHistoryStreakSummary(task, historyByTaskId.get(task.id) ?? [], todayDateKey, {
        ...context,
        calendarOverrides: context.calendarOverridesByTaskId?.[task.id] ?? context.calendarOverrides,
        manualActionSummaryByTaskId,
      }),
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
  const manualActionSummaryByTaskId = context.manualActionSummaryByTaskId ?? buildTaskHistoryLastHandledSummaryMap(
    [task],
    history as TaskHistory[],
    context.manualActionCalendarOverrides ?? [],
    context.manualActionCommandOperations ?? [],
    todayDateKey,
  );
  return {
    ...current,
    [task.id]: buildTaskHistoryStreakSummary(task, history, todayDateKey, {
      ...context,
      calendarOverrides: context.calendarOverridesByTaskId?.[task.id] ?? context.calendarOverrides,
      manualActionSummaryByTaskId,
    }),
  };
}

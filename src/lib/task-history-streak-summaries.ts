import type { Task } from "@/lib/database.types";
import {
  computeTaskSpecificHistoryStats,
  deduplicateTaskHistoryByLogicalDate,
  getTaskHistoryLastDone,
  type TaskHistoryStreakEntry,
} from "@/lib/task-history";
import { adaptLegacyTaskState } from "@/lib/task-state-engine/legacy-adapter";
import { buildTaskEffectiveTimeline } from "@/lib/task-state-engine/effective-timeline";

export const TASK_HISTORY_STREAK_SUMMARY_COLUMNS = "id,task_id,entry_date,occurrence_key,occurrence_due_on,status,event_type,counted_as_due_occurrence,was_completed,created_at,updated_at";

export type TaskHistoryStreakSummary = {
  currentStreak: number;
  lastDoneAt: string | null;
  lastDoneDate: string | null;
  missedStreak: number;
};

export type TaskHistoryStreakSummaryMap = Record<string, TaskHistoryStreakSummary>;

export function buildTaskHistoryStreakSummary(
  task: Task,
  history: readonly TaskHistoryStreakEntry[],
  todayDateKey: string,
): TaskHistoryStreakSummary {
  const normalizedHistory = deduplicateTaskHistoryByLogicalDate(history);
  const stats = computeTaskSpecificHistoryStats(task, normalizedHistory, todayDateKey);
  const lastDone = getTaskHistoryLastDone(normalizedHistory);
  const adapted = task.status === "archived" || task.status === "trashed"
    ? null
    : adaptLegacyTaskState(task, normalizedHistory, {
      now: `${todayDateKey}T12:00:00.000Z`,
      timezone: "UTC",
      logicalDayRollover: "00:00",
    });
  const timeline = adapted
    ? buildTaskEffectiveTimeline({
      task: adapted.engineInput.task,
      history: adapted.engineInput.history,
      logicalDate: todayDateKey,
      calendarStart: todayDateKey,
      calendarEnd: todayDateKey,
    })
    : null;
  const effectiveMissedStreak = timeline?.currentMissedStreak ?? stats.missedStreak;
  const effectiveCompletedStreak = timeline?.currentCompletedStreak ?? stats.currentStreak;
  return {
    currentStreak: effectiveMissedStreak > 0 ? 0 : effectiveCompletedStreak,
    lastDoneAt: lastDone?.timestamp ?? null,
    lastDoneDate: lastDone?.dateKey ?? null,
    missedStreak: effectiveMissedStreak,
  };
}

export function buildTaskHistoryStreakSummaryMap(
  tasks: readonly Task[],
  history: readonly TaskHistoryStreakEntry[],
  todayDateKey: string,
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
      buildTaskHistoryStreakSummary(task, historyByTaskId.get(task.id) ?? [], todayDateKey),
    ]),
  );
}

export function updateTaskHistoryStreakSummaryMap(
  current: TaskHistoryStreakSummaryMap,
  task: Task,
  history: readonly TaskHistoryStreakEntry[],
  todayDateKey: string,
): TaskHistoryStreakSummaryMap {
  return {
    ...current,
    [task.id]: buildTaskHistoryStreakSummary(task, history, todayDateKey),
  };
}

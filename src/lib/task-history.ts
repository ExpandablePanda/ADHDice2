import type { TaskHistory as DbTaskHistory, TaskStatus } from "@/lib/database.types";
import { shiftDateKey } from "@/lib/task-grid-layout";

export function isTaskCompletedForHistory(status: TaskStatus) {
  return status === "done" || status === "did_my_best";
}

export function isTaskHistoryStatus(status: TaskStatus) {
  return status === "done" || status === "did_my_best" || status === "missed";
}

export type TaskHistoryStats = {
  bestStreak: number;
  currentStreak: number;
  doneRate: number;
  loggedDays: number;
};

export function mapTaskHistoryRow(row: DbTaskHistory) {
  return row;
}

export function computeTaskHistoryStats(history: DbTaskHistory[], todayDateKey: string): TaskHistoryStats {
  const byDate = history.reduce<Map<string, { completed: boolean }>>((accumulator, entry) => {
    const existing = accumulator.get(entry.entry_date);
    accumulator.set(entry.entry_date, {
      completed: (existing?.completed ?? false) || entry.was_completed,
    });
    return accumulator;
  }, new Map());

  const loggedDates = [...byDate.keys()].sort();
  const completedDates = loggedDates.filter((date) => byDate.get(date)?.completed);
  const loggedDays = loggedDates.length;
  const doneRate = loggedDays === 0 ? 0 : Math.round((completedDates.length / loggedDays) * 100);

  let currentStreak = 0;
  let cursor = todayDateKey;
  while (completedDates.includes(cursor)) {
    currentStreak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  let bestStreak = 0;
  let runningStreak = 0;
  let previousDate: string | null = null;
  for (const date of completedDates) {
    if (!previousDate) {
      runningStreak = 1;
    } else {
      runningStreak = shiftDateKey(previousDate, 1) === date ? runningStreak + 1 : 1;
    }
    bestStreak = Math.max(bestStreak, runningStreak);
    previousDate = date;
  }

  return {
    bestStreak,
    currentStreak,
    doneRate,
    loggedDays,
  };
}

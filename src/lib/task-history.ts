import type { Task, TaskHistory as DbTaskHistory, TaskStatus } from "@/lib/database.types";
import { shiftDateKey } from "@/lib/task-grid-layout";

export function isTaskCompletedForHistory(status: TaskStatus) {
  return status === "done" || status === "did_my_best";
}

export function isTaskHistoryStatus(status: TaskStatus) {
  return status === "done" || status === "did_my_best" || status === "missed";
}

export type TaskHistoryStats = {
  bestStreak: number;
  completedDays: number;
  completionRate: number;
  currentStreak: number;
  doneRate: number;
  loggedDays: number;
  missedDays: number;
  missedStreak: number;
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
  const completedDays = completedDates.length;
  const missedDays = loggedDays - completedDays;
  const completionRate = loggedDays === 0 ? 0 : Math.round((completedDays / loggedDays) * 100);
  const doneRate = completionRate;

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

  let missedStreak = 0;
  let missedCursor = todayDateKey;
  while (loggedDates.includes(missedCursor) && !byDate.get(missedCursor)?.completed) {
    missedStreak += 1;
    missedCursor = shiftDateKey(missedCursor, -1);
  }

  return {
    bestStreak,
    completedDays,
    completionRate,
    currentStreak,
    doneRate,
    loggedDays,
    missedDays,
    missedStreak,
  };
}

function compareDateKeys(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function toDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function daysBetween(startDateKey: string, endDateKey: string) {
  const diff = toDate(endDateKey).getTime() - toDate(startDateKey).getTime();
  return Math.round(diff / 86_400_000);
}

function monthsBetween(startDateKey: string, endDateKey: string) {
  const start = toDate(startDateKey);
  const end = toDate(endDateKey);
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function getMonthlyOccurrenceDay(task: Task, dateKey: string) {
  const date = toDate(dateKey);
  const maxDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const targetDay = task.repeat_day_of_month ?? toDate(task.due_on ?? dateKey).getDate();
  return Math.min(targetDay, maxDay);
}

export function isTaskDueOnDate(task: Task, dateKey: string) {
  const anchorDateKey = task.due_on;
  if (!anchorDateKey) {
    return false;
  }

  if (compareDateKeys(dateKey, anchorDateKey) < 0) {
    return false;
  }

  if (task.repeat_frequency === "none") {
    return dateKey === anchorDateKey;
  }

  const interval = Math.max(1, task.repeat_interval ?? 1);

  if (task.repeat_frequency === "daily" || task.repeat_frequency === "custom") {
    return daysBetween(anchorDateKey, dateKey) % interval === 0;
  }

  if (task.repeat_frequency === "weekly") {
    const anchor = toDate(anchorDateKey);
    const current = toDate(dateKey);
    const scheduledDays = task.repeat_days_of_week?.length
      ? task.repeat_days_of_week
      : [anchor.getDay()];
    if (!scheduledDays.includes(current.getDay())) {
      return false;
    }
    const anchorWeekStart = new Date(anchor);
    anchorWeekStart.setDate(anchor.getDate() - anchor.getDay());
    const currentWeekStart = new Date(current);
    currentWeekStart.setDate(current.getDate() - current.getDay());
    const weekDiff = Math.round((currentWeekStart.getTime() - anchorWeekStart.getTime()) / (7 * 86_400_000));
    return weekDiff >= 0 && weekDiff % interval === 0;
  }

  if (task.repeat_frequency === "monthly") {
    const monthDiff = monthsBetween(anchorDateKey, dateKey);
    if (monthDiff < 0 || monthDiff % interval !== 0) {
      return false;
    }
    return toDate(dateKey).getDate() === getMonthlyOccurrenceDay(task, dateKey);
  }

  return false;
}

export function buildTaskDueDateSet(task: Task, startDateKey: string, endDateKey: string) {
  const dueDates = new Set<string>();
  if (!task.due_on) {
    return dueDates;
  }

  let cursor = startDateKey;
  while (compareDateKeys(cursor, endDateKey) <= 0) {
    if (isTaskDueOnDate(task, cursor)) {
      dueDates.add(cursor);
    }
    cursor = shiftDateKey(cursor, 1);
  }

  return dueDates;
}

export function computeTaskSpecificHistoryStats(
  task: Task,
  history: DbTaskHistory[],
  todayDateKey: string,
  startDateKey = shiftDateKey(todayDateKey, -139),
): TaskHistoryStats & { dueDays: number } {
  void todayDateKey;
  void startDateKey;

  const sortedHistory = [...history].sort((left, right) => compareDateKeys(left.entry_date, right.entry_date));
  const completedDays = sortedHistory.filter((entry) => entry.was_completed).length;
  const missedDays = sortedHistory.filter((entry) => !entry.was_completed).length;
  const loggedDays = sortedHistory.length;

  if (task.repeat_frequency === "none") {
    const latestEntry = sortedHistory.at(-1) ?? null;
    const currentStreak = latestEntry?.was_completed ? 1 : 0;
    const bestStreak = completedDays > 0 ? 1 : 0;
    const missedStreak = latestEntry && !latestEntry.was_completed ? 1 : 0;
    const completionRate = loggedDays === 0 ? 0 : Math.round((completedDays / loggedDays) * 100);
    return {
      bestStreak,
      completedDays,
      completionRate,
      currentStreak,
      doneRate: completionRate,
      dueDays: loggedDays,
      loggedDays,
      missedDays,
      missedStreak,
    };
  }

  let currentStreak = 0;
  for (let index = sortedHistory.length - 1; index >= 0; index -= 1) {
    if (!sortedHistory[index]?.was_completed) {
      break;
    }
    currentStreak += 1;
  }

  let bestStreak = 0;
  let runningCompleted = 0;
  for (const entry of sortedHistory) {
    if (entry.was_completed) {
      runningCompleted += 1;
      bestStreak = Math.max(bestStreak, runningCompleted);
    } else {
      runningCompleted = 0;
    }
  }

  let missedStreak = 0;
  for (let index = sortedHistory.length - 1; index >= 0; index -= 1) {
    if (sortedHistory[index]?.status !== "missed") {
      break;
    }
    missedStreak += 1;
  }

  const dueDays = loggedDays;
  const completionRate = dueDays === 0 ? 0 : Math.round((completedDays / dueDays) * 100);
  return {
    bestStreak,
    completedDays,
    completionRate,
    currentStreak,
    doneRate: completionRate,
    dueDays,
    loggedDays,
    missedDays,
    missedStreak,
  };
}

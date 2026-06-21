import type { Task, TaskHistory as DbTaskHistory, TaskStatus } from "@/lib/database.types";
import { shiftDateKey } from "@/lib/task-grid-layout";
import { isDailyCadenceRepeatFrequency, resolveRecurringLiveStatusFromNextDueDate } from "@/lib/task-repeat";

export function isTaskCompletedForHistory(status: TaskStatus) {
  return status === "done" || status === "did_my_best" || status === "complete";
}

export function isTaskHistoryStatus(status: TaskStatus) {
  return status === "done" || status === "did_my_best" || status === "missed" || status === "complete";
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

export const TASK_HISTORY_WINDOW_PRESETS = ["1", "3", "7", "14", "30"] as const;
export const TASK_HISTORY_STREAK_PRESETS = ["0", "1", "3", "7", "14", "30"] as const;

export type TaskHistoryWindowPreset = typeof TASK_HISTORY_WINDOW_PRESETS[number];
export type TaskHistoryStreakPreset = typeof TASK_HISTORY_STREAK_PRESETS[number];

export type TaskHistoryFacts = {
  completedToday: boolean;
  completedWithinLast: Record<TaskHistoryWindowPreset, boolean>;
  currentCompletedStreak: number;
  currentMissedStreak: number;
  hasEverCompleted: boolean;
  hasEverMissed: boolean;
  lastCompletedWithinLast: Record<TaskHistoryWindowPreset, boolean>;
  lastMissedWithinLast: Record<TaskHistoryWindowPreset, boolean>;
  missedToday: boolean;
  missedWithinLast: Record<TaskHistoryWindowPreset, boolean>;
};

export function mapTaskHistoryRow(row: DbTaskHistory) {
  return row;
}

export function isPermanentCompleteHistoryEntry(entry: Pick<DbTaskHistory, "event_type" | "status">) {
  return entry.status === "complete" && entry.event_type === "completed_permanently";
}

export function formatTaskHistoryEntryLabel(entry: Pick<DbTaskHistory, "event_type" | "status">) {
  if (isPermanentCompleteHistoryEntry(entry)) {
    return "Marked Complete";
  }

  if (entry.status === "did_my_best") {
    return "Did My Best";
  }

  if (entry.status === "missed") {
    return "Missed";
  }

  if (entry.status === "done") {
    return "Done";
  }

  if (entry.status === "complete") {
    return "Complete";
  }

  return entry.status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type TaskHistoryCalendarVirtualState = "due" | "not_due" | "upcoming";

export function getTaskHistoryCalendarVirtualState({
  dateKey,
  hasHistoryEntry,
  isDue,
  nextDueDateKey,
  todayDateKey,
}: {
  dateKey: string;
  hasHistoryEntry: boolean;
  isDue: boolean;
  nextDueDateKey: string | null;
  todayDateKey: string;
}): TaskHistoryCalendarVirtualState | null {
  if (hasHistoryEntry) {
    return null;
  }
  if (isDue) {
    return "due";
  }
  if (
    dateKey >= todayDateKey
    && nextDueDateKey
    && dateKey < nextDueDateKey
    && dateKey >= shiftDateKey(nextDueDateKey, -7)
  ) {
    return "upcoming";
  }
  return "not_due";
}

function createHistoryWindowFlags(initialValue = false): Record<TaskHistoryWindowPreset, boolean> {
  return {
    "1": initialValue,
    "3": initialValue,
    "7": initialValue,
    "14": initialValue,
    "30": initialValue,
  };
}

export function buildEmptyTaskHistoryFacts(): TaskHistoryFacts {
  return {
    completedToday: false,
    completedWithinLast: createHistoryWindowFlags(),
    currentCompletedStreak: 0,
    currentMissedStreak: 0,
    hasEverCompleted: false,
    hasEverMissed: false,
    lastCompletedWithinLast: createHistoryWindowFlags(),
    lastMissedWithinLast: createHistoryWindowFlags(),
    missedToday: false,
    missedWithinLast: createHistoryWindowFlags(),
  };
}

type TaskHistoryLiveStatusContext = {
  currentDayKey: string;
  dayStartTime: string;
  now: Date;
  timezone: string;
};

function getSortedHistoryThroughDay(history: DbTaskHistory[], currentDayKey: string) {
  return history
    .filter((entry) => entry.entry_date <= currentDayKey)
    .sort((left, right) => compareDateKeys(left.entry_date, right.entry_date));
}

export function resolveLiveTaskStatusFromHistory(
  task: Task,
  history: DbTaskHistory[],
  {
    currentDayKey,
    dayStartTime,
    now,
    timezone,
  }: TaskHistoryLiveStatusContext,
): { completedAt: string | null; status: TaskStatus } {
  const sortedHistory = getSortedHistoryThroughDay(history, currentDayKey);
  const latestEntry = sortedHistory.at(-1) ?? null;

  if (latestEntry?.status === "missed") {
    return {
      completedAt: null,
      status: "missed",
    };
  }

  if (latestEntry?.status === "complete") {
    return {
      completedAt: task.completed_at ?? now.toISOString(),
      status: "complete",
    };
  }

  if (task.repeat_frequency === "none") {
    if (latestEntry?.status === "done" || latestEntry?.status === "did_my_best" || latestEntry?.status === "complete") {
      return {
        completedAt: task.completed_at ?? now.toISOString(),
        status: latestEntry.status,
      };
    }

    return {
      completedAt: null,
      status: "pending",
    };
  }

  if (!task.due_on) {
    return {
      completedAt: null,
      status: "pending",
    };
  }

  return {
    completedAt: null,
    status: resolveRecurringLiveStatusFromNextDueDate(task, {
      currentDayKey,
      dayStartTime,
      nextDueDate: task.due_on,
      now,
      timezone,
    }),
  };
}

export function computeTaskHistoryStats(history: DbTaskHistory[], todayDateKey: string): TaskHistoryStats {
  const boundedHistory = history.filter((entry) => entry.entry_date <= todayDateKey);
  const byDate = boundedHistory.reduce<Map<string, { completed: boolean }>>((accumulator, entry) => {
    const existing = accumulator.get(entry.entry_date);
    accumulator.set(entry.entry_date, {
      completed: (existing?.completed ?? false) || entry.was_completed,
    });
    return accumulator;
  }, new Map());

  const loggedDates = [...byDate.keys()].sort();
  const loggedDateSet = new Set(loggedDates);
  const completedDates = loggedDates.filter((date) => byDate.get(date)?.completed);
  const loggedDays = loggedDates.length;
  const completedDays = completedDates.length;
  const missedDays = loggedDays - completedDays;
  const completionRate = loggedDays === 0 ? 0 : Math.round((completedDays / loggedDays) * 100);
  const doneRate = completionRate;
  const latestLoggedDate = loggedDates.at(-1) ?? null;
  const currentStreakStart = byDate.has(todayDateKey) ? todayDateKey : latestLoggedDate;

  let currentStreak = 0;
  let cursor = currentStreakStart;
  while (cursor && loggedDateSet.has(cursor) && byDate.get(cursor)?.completed) {
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
  let missedCursor = byDate.has(todayDateKey)
    ? todayDateKey
    : latestLoggedDate;
  while (missedCursor && loggedDateSet.has(missedCursor) && !byDate.get(missedCursor)?.completed) {
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

export function buildTaskHistoryFacts(history: DbTaskHistory[], todayDateKey: string): TaskHistoryFacts {
  const boundedHistory = history
    .filter((entry) => entry.entry_date <= todayDateKey)
    .sort((left, right) => {
      const dateOrder = compareDateKeys(left.entry_date, right.entry_date);
      if (dateOrder !== 0) {
        return dateOrder;
      }
      const leftTimestamp = left.updated_at || left.created_at;
      const rightTimestamp = right.updated_at || right.created_at;
      if (leftTimestamp === rightTimestamp) {
        return left.id.localeCompare(right.id);
      }
      return leftTimestamp < rightTimestamp ? -1 : 1;
    });
  if (boundedHistory.length === 0) {
    return buildEmptyTaskHistoryFacts();
  }

  const byDate = boundedHistory.reduce<Map<string, {
    completed: boolean;
    latestStatus: "completed" | "missed";
    latestTimestamp: string;
    missed: boolean;
  }>>((accumulator, entry) => {
    const existing = accumulator.get(entry.entry_date);
    const entryStatus = entry.status === "missed" ? "missed" : "completed";
    const entryTimestamp = entry.updated_at || entry.created_at;
    accumulator.set(entry.entry_date, {
      completed: (existing?.completed ?? false) || entry.was_completed,
      latestStatus: !existing || entryTimestamp >= existing.latestTimestamp ? entryStatus : existing.latestStatus,
      latestTimestamp: !existing || entryTimestamp >= existing.latestTimestamp ? entryTimestamp : existing.latestTimestamp,
      missed: (existing?.missed ?? false) || entry.status === "missed",
    });
    return accumulator;
  }, new Map());

  const loggedDates = [...byDate.keys()].sort();
  const latestLoggedDate = loggedDates.at(-1) ?? null;
  const completedDates = loggedDates.filter((date) => byDate.get(date)?.completed);
  const missedDates = loggedDates.filter((date) => byDate.get(date)?.missed);
  const lastCompletedDate = completedDates.at(-1) ?? null;
  const lastMissedDate = missedDates.at(-1) ?? null;
  const currentCompletedStreakStart = byDate.has(todayDateKey) ? todayDateKey : latestLoggedDate;
  const currentMissedStreakStart = byDate.has(todayDateKey) ? todayDateKey : latestLoggedDate;

  let currentCompletedStreak = 0;
  let completedCursor = currentCompletedStreakStart;
  while (completedCursor && byDate.get(completedCursor)?.latestStatus === "completed") {
    currentCompletedStreak += 1;
    completedCursor = shiftDateKey(completedCursor, -1);
  }

  let currentMissedStreak = 0;
  let missedCursor = currentMissedStreakStart;
  while (missedCursor && byDate.get(missedCursor)?.latestStatus === "missed") {
    currentMissedStreak += 1;
    missedCursor = shiftDateKey(missedCursor, -1);
  }

  const completedWithinLast = createHistoryWindowFlags();
  const missedWithinLast = createHistoryWindowFlags();
  const lastCompletedWithinLast = createHistoryWindowFlags();
  const lastMissedWithinLast = createHistoryWindowFlags();

  for (const preset of TASK_HISTORY_WINDOW_PRESETS) {
    const dayCount = Number.parseInt(preset, 10);
    completedWithinLast[preset] = completedDates.some((date) => isWithinLastWindow(date, todayDateKey, dayCount));
    missedWithinLast[preset] = missedDates.some((date) => isWithinLastWindow(date, todayDateKey, dayCount));
    lastCompletedWithinLast[preset] = lastCompletedDate ? isWithinLastWindow(lastCompletedDate, todayDateKey, dayCount) : false;
    lastMissedWithinLast[preset] = lastMissedDate ? isWithinLastWindow(lastMissedDate, todayDateKey, dayCount) : false;
  }

  return {
    completedToday: byDate.get(todayDateKey)?.completed ?? false,
    completedWithinLast,
    currentCompletedStreak,
    currentMissedStreak,
    hasEverCompleted: completedDates.length > 0,
    hasEverMissed: missedDates.length > 0,
    lastCompletedWithinLast,
    lastMissedWithinLast,
    missedToday: byDate.get(todayDateKey)?.missed ?? false,
    missedWithinLast,
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

function isWithinLastWindow(dateKey: string, todayDateKey: string, dayCount: number) {
  const distance = daysBetween(dateKey, todayDateKey);
  return distance >= 0 && distance < dayCount;
}

function monthsBetween(startDateKey: string, endDateKey: string) {
  const start = toDate(startDateKey);
  const end = toDate(endDateKey);
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function isAlignedToInterval(distance: number, interval: number) {
  return ((distance % interval) + interval) % interval === 0;
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

  if (isDailyCadenceRepeatFrequency(task.repeat_frequency)) {
    return isAlignedToInterval(daysBetween(anchorDateKey, dateKey), interval);
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
    return weekDiff >= 0 && isAlignedToInterval(weekDiff, interval);
  }

  if (task.repeat_frequency === "monthly") {
    const monthDiff = monthsBetween(anchorDateKey, dateKey);
    if (monthDiff < 0 || !isAlignedToInterval(monthDiff, interval)) {
      return false;
    }
    return toDate(dateKey).getDate() === getMonthlyOccurrenceDay(task, dateKey);
  }

  return false;
}

function isHistoricalRecurringDueDate(task: Task, dateKey: string) {
  const anchorDateKey = task.due_on;
  if (!anchorDateKey || task.repeat_frequency === "none") {
    return false;
  }

  const interval = Math.max(1, task.repeat_interval ?? 1);

  if (isDailyCadenceRepeatFrequency(task.repeat_frequency)) {
    return isAlignedToInterval(daysBetween(anchorDateKey, dateKey), interval);
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
    return isAlignedToInterval(weekDiff, interval);
  }

  if (task.repeat_frequency === "monthly") {
    const monthDiff = monthsBetween(anchorDateKey, dateKey);
    if (!isAlignedToInterval(monthDiff, interval)) {
      return false;
    }
    return toDate(dateKey).getDate() === getMonthlyOccurrenceDay(task, dateKey);
  }

  return false;
}

export function buildTaskDueDateSet(task: Task, startDateKey: string, endDateKey: string, history: DbTaskHistory[] = []) {
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

  if (task.repeat_frequency !== "none") {
    for (const entry of history) {
      if (compareDateKeys(entry.entry_date, startDateKey) < 0 || compareDateKeys(entry.entry_date, endDateKey) > 0) {
        continue;
      }
      if (isHistoricalRecurringDueDate(task, entry.entry_date)) {
        dueDates.add(entry.entry_date);
      }
    }
  }

  return dueDates;
}

function isUnresolvedTaskStatus(status: TaskStatus) {
  return status === "pending"
    || status === "in_progress"
    || status === "missed"
    || status === "upcoming"
    || status === "not_due";
}

export function buildTaskHistoryCalendarDueDateSet(
  task: Task,
  startDateKey: string,
  endDateKey: string,
  todayDateKey: string,
  history: DbTaskHistory[] = [],
) {
  const dueDates = buildTaskDueDateSet(task, startDateKey, endDateKey, history);
  if (
    task.repeat_frequency !== "none"
    || !task.due_on
    || task.due_on > todayDateKey
    || !isUnresolvedTaskStatus(task.status)
  ) {
    return dueDates;
  }

  let cursor = compareDateKeys(task.due_on, startDateKey) > 0 ? task.due_on : startDateKey;
  const lastOpportunityDate = compareDateKeys(todayDateKey, endDateKey) < 0 ? todayDateKey : endDateKey;
  while (compareDateKeys(cursor, lastOpportunityDate) <= 0) {
    dueDates.add(cursor);
    cursor = shiftDateKey(cursor, 1);
  }
  return dueDates;
}

export function buildOverdueTaskMissedDateKeys(task: Task, currentDayKey: string) {
  if (!task.due_on || task.due_on >= currentDayKey || !isUnresolvedTaskStatus(task.status)) {
    return [] as string[];
  }

  if (task.repeat_frequency === "none") {
    const missedDates: string[] = [];
    let cursor = task.due_on;
    const lastMissedDate = shiftDateKey(currentDayKey, -1);
    while (compareDateKeys(cursor, lastMissedDate) <= 0) {
      missedDates.push(cursor);
      cursor = shiftDateKey(cursor, 1);
    }
    return missedDates;
  }

  return [...buildTaskDueDateSet(task, task.due_on, shiftDateKey(currentDayKey, -1))].sort();
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
  let missedStreak = 0;
  for (let index = sortedHistory.length - 1; index >= 0; index -= 1) {
    if (sortedHistory[index]?.status !== "missed") {
      break;
    }
    missedStreak += 1;
  }

  if (task.repeat_frequency === "none") {
    const latestEntry = sortedHistory.at(-1) ?? null;
    const currentStreak = latestEntry?.was_completed ? 1 : 0;
    const bestStreak = completedDays > 0 ? 1 : 0;
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

import { formatDateKey, shiftDateKey } from "@/lib/task-grid-layout";
import type { Task, TaskStatus } from "@/lib/database.types";

type ResolveRecurringLiveStatusOptions = {
  currentDayKey: string;
  dayStartTime: string;
  nextDueDate: string;
  now: Date;
  timezone: string;
};

const REPEAT_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function isDailyUntilCompleteRepeatFrequency(repeatFrequency: Task["repeat_frequency"]) {
  return repeatFrequency === "daily_until_complete";
}

export function isDailyCadenceRepeatFrequency(repeatFrequency: Task["repeat_frequency"]) {
  return repeatFrequency === "daily" || repeatFrequency === "daily_until_complete" || repeatFrequency === "custom";
}

export function calcNextDueDate(task: Task): string | null {
  return calcNextDueDateFromDate(task, task.due_on ?? formatDateKey(new Date()));
}

export function calcNextDueDateFromDate(task: Task, referenceDateKey: string): string | null {
  if (task.repeat_frequency === "none") return null;
  const base = new Date(`${referenceDateKey}T12:00:00`);
  const interval = Math.max(1, task.repeat_interval ?? 1);

  if (isDailyCadenceRepeatFrequency(task.repeat_frequency)) {
    base.setDate(base.getDate() + interval);
    return formatDateKey(base);
  }

  if (task.repeat_frequency === "weekly") {
    const days = task.repeat_days_of_week ?? [];
    if (days.length === 0) {
      base.setDate(base.getDate() + 7 * interval);
      return formatDateKey(base);
    }
    const sortedDays = [...days].sort((a, b) => a - b);
    const baseDow = base.getDay();
    const nextDow = sortedDays.find((d) => d > baseDow) ?? sortedDays[0];
    const daysUntil = nextDow > baseDow ? nextDow - baseDow : 7 * interval - (baseDow - nextDow);
    base.setDate(base.getDate() + daysUntil);
    return formatDateKey(base);
  }

  if (task.repeat_frequency === "monthly") {
    const targetDay = task.repeat_day_of_month ?? base.getDate();
    base.setMonth(base.getMonth() + interval);
    const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(targetDay, maxDay));
    return formatDateKey(base);
  }

  base.setDate(base.getDate() + interval);
  return formatDateKey(base);
}

function getTimePartsInTimeZone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: timezone,
  });
  const parts = formatter.formatToParts(date);
  return {
    hour: Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "", 10),
    minute: Number.parseInt(parts.find((part) => part.type === "minute")?.value ?? "", 10),
  };
}

function parseTimeToMinutes(time: string | null) {
  if (!time) {
    return null;
  }

  const [hoursText, minutesText] = time.split(":");
  const hours = Number.parseInt(hoursText ?? "", 10);
  const minutes = Number.parseInt(minutesText ?? "", 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return (hours * 60) + minutes;
}

function normalizeMinutesWithinLogicalDay(totalMinutes: number, logicalDayStartMinutes: number) {
  return totalMinutes < logicalDayStartMinutes ? totalMinutes + 1440 : totalMinutes;
}

export function resolveRecurringLiveStatusFromNextDueDate(
  task: Pick<Task, "due_time">,
  {
    currentDayKey,
    dayStartTime,
    nextDueDate,
    now,
    timezone,
  }: ResolveRecurringLiveStatusOptions,
): TaskStatus {
  if (nextDueDate > currentDayKey) {
    return "not_due";
  }

  if (nextDueDate < currentDayKey) {
    return "pending";
  }

  const logicalDayStartMinutes = parseTimeToMinutes(dayStartTime);
  const dueMinutes = parseTimeToMinutes(task.due_time);
  if (logicalDayStartMinutes === null || dueMinutes === null) {
    return "pending";
  }

  const currentTimeParts = getTimePartsInTimeZone(now, timezone);
  if (!Number.isFinite(currentTimeParts.hour) || !Number.isFinite(currentTimeParts.minute)) {
    return "pending";
  }

  const currentMinutes = (currentTimeParts.hour * 60) + currentTimeParts.minute;
  const normalizedCurrentMinutes = normalizeMinutesWithinLogicalDay(currentMinutes, logicalDayStartMinutes);
  const normalizedDueMinutes = normalizeMinutesWithinLogicalDay(dueMinutes, logicalDayStartMinutes);

  return normalizedDueMinutes > normalizedCurrentMinutes ? "upcoming" : "pending";
}

export function formatRepeatSummary(task: Task) {
  if (task.repeat_frequency === "none") return null;

  if (task.repeat_frequency === "daily_until_complete") {
    return "Daily Until Complete";
  }

  if (task.repeat_frequency === "daily") {
    return task.repeat_interval > 1 ? `Every ${task.repeat_interval} days` : "Daily";
  }

  if (task.repeat_frequency === "weekly") {
    const weekdayLabels = (task.repeat_days_of_week ?? [])
      .map((day) => REPEAT_WEEKDAY_LABELS[day] ?? null)
      .filter((value): value is (typeof REPEAT_WEEKDAY_LABELS)[number] => value !== null);
    const weekdaySummary = weekdayLabels.length > 0 ? ` (${weekdayLabels.join(", ")})` : "";
    return task.repeat_interval > 1
      ? `Every ${task.repeat_interval} weeks${weekdaySummary}`
      : `Weekly${weekdaySummary}`;
  }

  if (task.repeat_frequency === "monthly") {
    const daySummary = task.repeat_day_of_month ? ` on ${task.repeat_day_of_month}` : "";
    return task.repeat_interval > 1
      ? `Every ${task.repeat_interval} months${daySummary}`
      : `Monthly${daySummary}`;
  }

  return "Custom repeat";
}

function compareDateKeys(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function buildDailyUntilCompleteMissedDateKeys(
  task: Pick<Task, "due_on" | "repeat_frequency">,
  currentDayKey: string,
  latestHistoryDate: string | null,
) {
  if (!isDailyUntilCompleteRepeatFrequency(task.repeat_frequency) || !task.due_on) {
    return [] as string[];
  }

  if (compareDateKeys(task.due_on, currentDayKey) >= 0) {
    return [] as string[];
  }

  const startDate = latestHistoryDate
    ? (compareDateKeys(shiftDateKey(latestHistoryDate, 1), task.due_on) > 0 ? shiftDateKey(latestHistoryDate, 1) : task.due_on)
    : task.due_on;
  const endDate = shiftDateKey(currentDayKey, -1);
  if (compareDateKeys(startDate, endDate) > 0) {
    return [] as string[];
  }

  const dates: string[] = [];
  let cursor = startDate;
  while (compareDateKeys(cursor, endDate) <= 0) {
    dates.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }
  return dates;
}

export function filterMissingTaskHistoryDateKeys(
  candidateDates: string[],
  existingDates: Iterable<string>,
) {
  const existingDateSet = new Set(existingDates);
  return candidateDates.filter((dateKey) => !existingDateSet.has(dateKey));
}

export function shouldReconcileOverdueTaskMisses(
  task: Pick<Task, "due_on">,
  currentDayKey: string,
) {
  return Boolean(task.due_on && task.due_on < currentDayKey);
}

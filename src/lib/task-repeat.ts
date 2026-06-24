import { formatDateKey, shiftDateKey } from "@/lib/task-grid-layout";
import type { Task, TaskRepeatMonthlyMode, TaskRepeatMonthlyOrdinal, TaskStatus } from "@/lib/database.types";

type ResolveRecurringLiveStatusOptions = {
  currentDayKey: string;
  dayStartTime: string;
  nextDueDate: string;
  now: Date;
  timezone: string;
};

export const REPEAT_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const REPEAT_WEEKDAY_FULL_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAYS_REPEAT_DAYS = [1, 2, 3, 4, 5] as const;
export const REPEAT_MONTHLY_MODE_OPTIONS: Array<{ label: string; value: TaskRepeatMonthlyMode }> = [
  { label: "Day of month", value: "day_of_month" },
  { label: "Ordinal weekday", value: "ordinal_weekday" },
];
export const REPEAT_MONTHLY_ORDINAL_OPTIONS: Array<{ label: string; value: TaskRepeatMonthlyOrdinal }> = [
  { label: "First", value: "first" },
  { label: "Second", value: "second" },
  { label: "Third", value: "third" },
  { label: "Fourth", value: "fourth" },
  { label: "Last", value: "last" },
];
const MONTHLY_ORDINAL_OFFSETS: Record<Exclude<TaskRepeatMonthlyOrdinal, "last">, number> = {
  first: 0,
  second: 1,
  third: 2,
  fourth: 3,
};

export function formatMonthlyOrdinalLabel(ordinal: TaskRepeatMonthlyOrdinal | null | undefined) {
  if (!ordinal) {
    return null;
  }
  return REPEAT_MONTHLY_ORDINAL_OPTIONS.find((option) => option.value === ordinal)?.label ?? null;
}

export function formatWeekdayLongLabel(weekday: number | null | undefined) {
  if (weekday === null || weekday === undefined) {
    return null;
  }
  return REPEAT_WEEKDAY_FULL_LABELS[weekday] ?? null;
}

export function isOrdinalMonthlyRepeatTask(task: Pick<Task, "repeat_monthly_mode" | "repeat_monthly_ordinal" | "repeat_monthly_weekday">) {
  return task.repeat_monthly_mode === "ordinal_weekday"
    && task.repeat_monthly_ordinal !== null
    && task.repeat_monthly_weekday !== null;
}

function getMonthlyOrdinalOccurrenceDate(year: number, monthIndex: number, ordinal: TaskRepeatMonthlyOrdinal, weekday: number) {
  if (ordinal === "last") {
    const date = new Date(year, monthIndex + 1, 0);
    const daysBack = (date.getDay() - weekday + 7) % 7;
    date.setDate(date.getDate() - daysBack);
    return date;
  }

  const date = new Date(year, monthIndex, 1);
  const daysForward = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + daysForward + (MONTHLY_ORDINAL_OFFSETS[ordinal] * 7));
  return date;
}

function getMonthlyOccurrenceDate(task: Pick<Task, "due_on" | "repeat_day_of_month" | "repeat_monthly_mode" | "repeat_monthly_ordinal" | "repeat_monthly_weekday">, year: number, monthIndex: number, fallbackDateKey: string) {
  if (isOrdinalMonthlyRepeatTask(task)) {
    return getMonthlyOrdinalOccurrenceDate(
      year,
      monthIndex,
      task.repeat_monthly_ordinal,
      task.repeat_monthly_weekday,
    );
  }

  const fallbackDate = new Date(`${fallbackDateKey}T12:00:00`);
  const maxDay = new Date(year, monthIndex + 1, 0).getDate();
  const targetDay = task.repeat_day_of_month ?? new Date(`${task.due_on ?? fallbackDateKey}T12:00:00`).getDate();
  return new Date(year, monthIndex, Math.min(targetDay, maxDay));
}

export function getMonthlyOccurrenceDateKey(
  task: Pick<Task, "due_on" | "repeat_day_of_month" | "repeat_monthly_mode" | "repeat_monthly_ordinal" | "repeat_monthly_weekday">,
  dateKey: string,
) {
  const date = new Date(`${dateKey}T12:00:00`);
  return formatDateKey(getMonthlyOccurrenceDate(task, date.getFullYear(), date.getMonth(), dateKey));
}

function formatOrdinalMonthlySummary(task: Pick<Task, "repeat_interval" | "repeat_monthly_ordinal" | "repeat_monthly_weekday">) {
  const ordinalLabel = formatMonthlyOrdinalLabel(task.repeat_monthly_ordinal);
  const weekdayLabel = formatWeekdayLongLabel(task.repeat_monthly_weekday);
  if (!ordinalLabel || !weekdayLabel) {
    return null;
  }
  return task.repeat_interval > 1
    ? `${ordinalLabel} ${weekdayLabel} every ${task.repeat_interval} months`
    : `${ordinalLabel} ${weekdayLabel} monthly`;
}

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
    base.setMonth(base.getMonth() + interval);
    const occurrenceDate = getMonthlyOccurrenceDate(task, base.getFullYear(), base.getMonth(), referenceDateKey);
    base.setDate(occurrenceDate.getDate());
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
    const isWeekdaysPreset = isWeekdaysRepeatSelection(
      task.repeat_frequency,
      task.repeat_days_of_week,
      task.repeat_interval,
    );
    if (isWeekdaysPreset) {
      return "Weekdays";
    }
    const weekdayLabels = (task.repeat_days_of_week ?? [])
      .map((day) => REPEAT_WEEKDAY_LABELS[day] ?? null)
      .filter((value): value is (typeof REPEAT_WEEKDAY_LABELS)[number] => value !== null);
    const weekdaySummary = weekdayLabels.length > 0 ? ` (${weekdayLabels.join(", ")})` : "";
    return task.repeat_interval > 1
      ? `Every ${task.repeat_interval} weeks${weekdaySummary}`
      : `Weekly${weekdaySummary}`;
  }

  if (task.repeat_frequency === "monthly") {
    if (isOrdinalMonthlyRepeatTask(task)) {
      return formatOrdinalMonthlySummary(task) ?? "Monthly";
    }
    const daySummary = task.repeat_day_of_month ? ` on ${task.repeat_day_of_month}` : "";
    return task.repeat_interval > 1
      ? `Every ${task.repeat_interval} months${daySummary}`
      : `Monthly${daySummary}`;
  }

  return "Custom repeat";
}

export function isWeekdaysRepeatSelection(
  repeatFrequency: string | null | undefined,
  repeatDaysOfWeek: number[] | null | undefined,
  repeatInterval: number | null | undefined,
) {
  const normalizedDays = repeatDaysOfWeek ?? [];
  return repeatFrequency === "weekly"
    && Math.max(1, repeatInterval ?? 1) === 1
    && normalizedDays.length === WEEKDAYS_REPEAT_DAYS.length
    && WEEKDAYS_REPEAT_DAYS.every((day, index) => normalizedDays[index] === day);
}

export function formatRepeatFrequencyLabel(
  repeatFrequency: string | null | undefined,
  repeatInterval: number | null | undefined,
  repeatDaysOfWeek?: number[] | null,
  repeatMonthlyMode?: TaskRepeatMonthlyMode | null,
  repeatMonthlyOrdinal?: TaskRepeatMonthlyOrdinal | null,
  repeatMonthlyWeekday?: number | null,
) {
  if (repeatFrequency === "none") return "No Repeat";
  if (repeatFrequency === "daily") {
    return Math.max(1, repeatInterval ?? 1) > 1 ? `Daily · ${Math.max(1, repeatInterval ?? 1)}` : "Daily";
  }
  if (repeatFrequency === "daily_until_complete") {
    return "Daily Until Complete";
  }
  if (repeatFrequency === "weekly") {
    if (isWeekdaysRepeatSelection(repeatFrequency, repeatDaysOfWeek, repeatInterval)) {
      return "Weekdays";
    }
    return Math.max(1, repeatInterval ?? 1) > 1 ? `Weekly · ${Math.max(1, repeatInterval ?? 1)}` : "Weekly";
  }
  if (repeatFrequency === "monthly") {
    if (
      repeatMonthlyMode === "ordinal_weekday"
      && repeatMonthlyOrdinal
      && repeatMonthlyWeekday !== null
      && repeatMonthlyWeekday !== undefined
    ) {
      const ordinalLabel = formatMonthlyOrdinalLabel(repeatMonthlyOrdinal);
      const weekdayLabel = formatWeekdayLongLabel(repeatMonthlyWeekday);
      if (ordinalLabel && weekdayLabel) {
        return Math.max(1, repeatInterval ?? 1) > 1
          ? `${ordinalLabel} ${weekdayLabel} every ${Math.max(1, repeatInterval ?? 1)} months`
          : `${ordinalLabel} ${weekdayLabel} monthly`;
      }
    }
    return Math.max(1, repeatInterval ?? 1) > 1 ? `Monthly · ${Math.max(1, repeatInterval ?? 1)}` : "Monthly";
  }
  if (repeatFrequency === "custom") {
    return "Custom Cadence";
  }
  return repeatFrequency ?? "No Repeat";
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
  task: Pick<Task, "due_on" | "status">,
  currentDayKey: string,
) {
  return Boolean(
    task.due_on
    && task.due_on < currentDayKey
    && (task.status === "pending"
      || task.status === "in_progress"
      || task.status === "missed"
      || task.status === "upcoming"
      || task.status === "not_due"),
  );
}

import { formatDateKey, shiftDateKey } from "./date-key.ts";
import type { Task, TaskRepeatFrequency, TaskRepeatMonthlyMode, TaskRepeatMonthlyOrdinal, TaskStatus } from "./database.types.ts";

export type TaskRepeatCategory = "none" | "daily" | "daily_until_complete" | "weekdays" | "weekly" | "monthly" | "custom";
export type TaskRepeatEditorUnit = "daily" | "weekly" | "monthly";
export type TaskRepeatCompletionMode = "keep_repeating" | "until_complete";
export type TaskRepeatEditorValue = {
  repeatFrequency: TaskRepeatFrequency;
  repeatInterval: number;
  repeatDaysOfWeek: number[];
  repeatDayOfMonth: number | null;
  repeatMonthlyMode: TaskRepeatMonthlyMode;
  repeatMonthlyOrdinal: TaskRepeatMonthlyOrdinal | null;
  repeatMonthlyWeekday: number | null;
};
export type TaskRepeatEditorDraft = TaskRepeatEditorValue & {
  completionMode: TaskRepeatCompletionMode;
  unit: TaskRepeatEditorUnit;
};
export type TaskRepeatSelection = TaskRepeatCategory;

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
  { label: "Week + weekday", value: "ordinal_weekday" },
];
export const REPEAT_MONTHLY_ORDINAL_OPTIONS: Array<{ label: string; value: TaskRepeatMonthlyOrdinal }> = [
  { label: "1st", value: "first" },
  { label: "2nd", value: "second" },
  { label: "3rd", value: "third" },
  { label: "4th", value: "fourth" },
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
  if (isOrdinalMonthlyRepeatTask(task) && task.repeat_monthly_ordinal && task.repeat_monthly_weekday !== null) {
    return getMonthlyOrdinalOccurrenceDate(
      year,
      monthIndex,
      task.repeat_monthly_ordinal,
      task.repeat_monthly_weekday,
    );
  }

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
    ? `Every ${task.repeat_interval} months (${ordinalLabel} ${weekdayLabel})`
    : `${ordinalLabel} ${weekdayLabel} monthly`;
}

export function isDailyUntilCompleteRepeatFrequency(repeatFrequency: Task["repeat_frequency"]) {
  return repeatFrequency === "daily_until_complete";
}

export function isDailyCadenceRepeatFrequency(repeatFrequency: Task["repeat_frequency"]) {
  return repeatFrequency === "daily" || repeatFrequency === "daily_until_complete" || repeatFrequency === "custom";
}

function normalizeRepeatInterval(value: number | null | undefined) {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : 1;
}

function normalizeRepeatDays(days: number[] | null | undefined) {
  return [...new Set((days ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((left, right) => left - right);
}

function getDateWeekday(dueOn: string | null | undefined) {
  if (!dueOn) {
    return null;
  }
  const date = new Date(`${dueOn}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

function getDateDayOfMonth(dueOn: string | null | undefined) {
  if (!dueOn) {
    return null;
  }
  const date = new Date(`${dueOn}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getDate();
}

function resolveWeekdaySelection(
  days: number[] | null | undefined,
  dueOn: string | null | undefined,
  fallbackWeekday: number = 1,
) {
  const normalizedDays = normalizeRepeatDays(days);
  if (normalizedDays.length > 0) {
    return normalizedDays;
  }
  const dueWeekday = getDateWeekday(dueOn);
  return [dueWeekday ?? fallbackWeekday];
}

function resolveMonthlySelection(
  current: Partial<TaskRepeatEditorValue>,
  dueOn: string | null | undefined,
) {
  const mode = current.repeatMonthlyMode === "ordinal_weekday" ? "ordinal_weekday" : "day_of_month" as const;
  if (mode === "ordinal_weekday") {
    return {
      repeatDayOfMonth: null,
      repeatMonthlyMode: mode,
      repeatMonthlyOrdinal: current.repeatMonthlyOrdinal ?? "first",
      repeatMonthlyWeekday: current.repeatMonthlyWeekday ?? getDateWeekday(dueOn) ?? 1,
    } satisfies Pick<TaskRepeatEditorValue, "repeatDayOfMonth" | "repeatMonthlyMode" | "repeatMonthlyOrdinal" | "repeatMonthlyWeekday">;
  }
  return {
    repeatDayOfMonth: current.repeatDayOfMonth && current.repeatDayOfMonth >= 1 && current.repeatDayOfMonth <= 31
      ? current.repeatDayOfMonth
      : getDateDayOfMonth(dueOn) ?? 1,
    repeatMonthlyMode: mode,
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  } satisfies Pick<TaskRepeatEditorValue, "repeatDayOfMonth" | "repeatMonthlyMode" | "repeatMonthlyOrdinal" | "repeatMonthlyWeekday">;
}

function clearMonthlyFields() {
  return {
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month" as const,
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  };
}

function clearWeeklyFields() {
  return {
    repeatDaysOfWeek: [],
  };
}

export function createTaskRepeatEditorDraft(value: TaskRepeatEditorValue): TaskRepeatEditorDraft {
  const repeatInterval = normalizeRepeatInterval(value.repeatInterval);
  const unit = value.repeatFrequency === "weekly"
    ? "weekly"
    : value.repeatFrequency === "monthly"
      ? "monthly"
      : "daily";
  return {
    ...value,
    repeatDaysOfWeek: normalizeRepeatDays(value.repeatDaysOfWeek),
    repeatInterval,
    completionMode: value.repeatFrequency === "daily_until_complete" && repeatInterval > 1 ? "until_complete" : "keep_repeating",
    unit,
  };
}

export function normalizePresetRepeatSelection(
  selection: Exclude<TaskRepeatSelection, "custom" | "weekdays"> | "weekdays",
  current: Partial<TaskRepeatEditorValue> = {},
  options: { dueOn?: string | null; fallbackWeekday?: number } = {},
): TaskRepeatEditorValue {
  if (selection === "none") {
    return {
      repeatFrequency: "none",
      repeatInterval: 1,
      ...clearWeeklyFields(),
      ...clearMonthlyFields(),
    };
  }

  if (selection === "daily" || selection === "daily_until_complete") {
    return {
      repeatFrequency: selection,
      repeatInterval: 1,
      ...clearWeeklyFields(),
      ...clearMonthlyFields(),
    };
  }

  if (selection === "weekdays") {
    return {
      repeatFrequency: "weekly",
      repeatInterval: 1,
      repeatDaysOfWeek: [...WEEKDAYS_REPEAT_DAYS],
      ...clearMonthlyFields(),
    };
  }

  if (selection === "weekly") {
    return {
      repeatFrequency: "weekly",
      repeatInterval: 1,
      repeatDaysOfWeek: resolveWeekdaySelection(
        current.repeatFrequency === undefined || current.repeatFrequency === "weekly" ? current.repeatDaysOfWeek : [],
        options.dueOn,
        options.fallbackWeekday,
      ),
      ...clearMonthlyFields(),
    };
  }

  const monthly = resolveMonthlySelection(
    current.repeatFrequency === undefined || current.repeatFrequency === "monthly" ? current : {},
    options.dueOn,
  );
  return {
    repeatFrequency: "monthly",
    repeatInterval: 1,
    ...clearWeeklyFields(),
    ...monthly,
  };
}

export function buildCustomCadenceMutation(
  draft: Pick<TaskRepeatEditorDraft, "unit" | "repeatInterval" | "repeatDaysOfWeek" | "repeatDayOfMonth" | "repeatMonthlyMode" | "repeatMonthlyOrdinal" | "repeatMonthlyWeekday"> & {
    completionMode?: TaskRepeatCompletionMode;
  },
  options: { dueOn?: string | null; fallbackWeekday?: number } = {},
): TaskRepeatEditorValue {
  const repeatInterval = normalizeRepeatInterval(draft.repeatInterval);
  if (draft.completionMode === "until_complete") {
    return {
      repeatFrequency: "daily_until_complete",
      repeatInterval,
      ...clearWeeklyFields(),
      ...clearMonthlyFields(),
    };
  }
  if (draft.unit === "daily") {
    return {
      repeatFrequency: "daily",
      repeatInterval,
      ...clearWeeklyFields(),
      ...clearMonthlyFields(),
    };
  }

  if (draft.unit === "weekly") {
    return {
      repeatFrequency: "weekly",
      repeatInterval,
      repeatDaysOfWeek: resolveWeekdaySelection(draft.repeatDaysOfWeek, options.dueOn, options.fallbackWeekday),
      ...clearMonthlyFields(),
    };
  }

  const monthly = resolveMonthlySelection(draft, options.dueOn);
  return {
    repeatFrequency: "monthly",
    repeatInterval,
    ...clearWeeklyFields(),
    ...monthly,
  };
}

export function taskRepeatEditorValueToUpdate(value: TaskRepeatEditorValue) {
  const repeatFrequency = value.repeatFrequency === "custom"
    ? value.repeatMonthlyMode === "ordinal_weekday" || value.repeatDayOfMonth !== null
      ? "monthly"
      : value.repeatDaysOfWeek.length > 0
        ? "weekly"
        : "daily"
    : value.repeatFrequency;
  return {
    repeat_frequency: repeatFrequency,
    repeat_interval: normalizeRepeatInterval(value.repeatInterval),
    repeat_days_of_week: repeatFrequency === "weekly" ? normalizeRepeatDays(value.repeatDaysOfWeek) : [],
    repeat_day_of_month: repeatFrequency === "monthly" && value.repeatMonthlyMode === "day_of_month"
      ? value.repeatDayOfMonth
      : null,
    repeat_monthly_mode: repeatFrequency === "monthly" ? value.repeatMonthlyMode : "day_of_month" as const,
    repeat_monthly_ordinal: repeatFrequency === "monthly" && value.repeatMonthlyMode === "ordinal_weekday"
      ? value.repeatMonthlyOrdinal
      : null,
    repeat_monthly_weekday: repeatFrequency === "monthly" && value.repeatMonthlyMode === "ordinal_weekday"
      ? value.repeatMonthlyWeekday
      : null,
  };
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
    const daysUntilDue = Math.round(
      (new Date(`${nextDueDate}T00:00:00`).getTime() - new Date(`${currentDayKey}T00:00:00`).getTime()) / 86_400_000,
    );
    if (daysUntilDue <= 7) {
      return "upcoming";
    }
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

export function formatRepeatSummary(task: Pick<Task, "repeat_frequency" | "repeat_interval" | "repeat_days_of_week" | "repeat_day_of_month" | "repeat_monthly_mode" | "repeat_monthly_ordinal" | "repeat_monthly_weekday">) {
  if (task.repeat_frequency === "none") return null;

  if (task.repeat_frequency === "daily_until_complete") {
    return task.repeat_interval > 1 ? `Every ${task.repeat_interval} days until complete` : "Daily Until Complete";
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

  return task.repeat_frequency === "custom"
    ? `Every ${Math.max(1, task.repeat_interval)} days`
    : "Custom";
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

export function getTaskRepeatCategory(
  repeatFrequency: Task["repeat_frequency"],
  repeatDaysOfWeek: number[] | null | undefined,
  repeatInterval: number | null | undefined,
): TaskRepeatCategory {
  const normalizedInterval = Math.max(1, repeatInterval ?? 1);
  if (repeatFrequency === "daily" || repeatFrequency === "weekly" || repeatFrequency === "monthly") {
    return normalizedInterval > 1
      ? "custom"
      : repeatFrequency === "weekly" && isWeekdaysRepeatSelection(repeatFrequency, repeatDaysOfWeek, repeatInterval)
        ? "weekdays"
        : repeatFrequency;
  }
  if (repeatFrequency === "daily_until_complete") {
    return normalizedInterval === 1 ? "daily_until_complete" : "custom";
  }
  return repeatFrequency;
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
    return Math.max(1, repeatInterval ?? 1) > 1 ? `Every ${Math.max(1, repeatInterval ?? 1)} days` : "Daily";
  }
  if (repeatFrequency === "daily_until_complete") {
    return Math.max(1, repeatInterval ?? 1) > 1 ? `Every ${Math.max(1, repeatInterval ?? 1)} days until complete` : "Daily Until Complete";
  }
  if (repeatFrequency === "weekly") {
    if (isWeekdaysRepeatSelection(repeatFrequency, repeatDaysOfWeek, repeatInterval)) {
      return "Weekdays";
    }
    const weekdayLabels = (repeatDaysOfWeek ?? [])
      .map((day) => REPEAT_WEEKDAY_LABELS[day] ?? null)
      .filter((value): value is (typeof REPEAT_WEEKDAY_LABELS)[number] => value !== null);
    const weekdaySummary = weekdayLabels.length > 0 ? ` (${weekdayLabels.join(", ")})` : "";
    return Math.max(1, repeatInterval ?? 1) > 1
      ? `Every ${Math.max(1, repeatInterval ?? 1)} weeks${weekdaySummary}`
      : `Weekly${weekdaySummary}`;
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
          ? `Every ${Math.max(1, repeatInterval ?? 1)} months (${ordinalLabel} ${weekdayLabel})`
          : `${ordinalLabel} ${weekdayLabel} monthly`;
      }
    }
    return Math.max(1, repeatInterval ?? 1) > 1 ? `Every ${Math.max(1, repeatInterval ?? 1)} months` : "Monthly";
  }
  if (repeatFrequency === "custom") {
    return "Custom";
  }
  return repeatFrequency ?? "No Repeat";
}

function formatOrdinalNumber(value: number) {
  const remainder100 = value % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1: return `${value}st`;
    case 2: return `${value}nd`;
    case 3: return `${value}rd`;
    default: return `${value}th`;
  }
}

export function formatRepeatCompactLabel(
  repeatFrequency: string | null | undefined,
  repeatInterval: number | null | undefined,
  repeatDaysOfWeek?: number[] | null,
  repeatMonthlyMode?: TaskRepeatMonthlyMode | null,
  repeatMonthlyOrdinal?: TaskRepeatMonthlyOrdinal | null,
  repeatMonthlyWeekday?: number | null,
  repeatDayOfMonth?: number | null,
) {
  if (repeatFrequency === "none") return "No Repeat";
  if (repeatFrequency === "monthly") {
    if (
      repeatMonthlyMode === "ordinal_weekday"
      && repeatMonthlyOrdinal
      && repeatMonthlyWeekday !== null
      && repeatMonthlyWeekday !== undefined
    ) {
      const ordinalLabel = formatMonthlyOrdinalLabel(repeatMonthlyOrdinal);
      const weekdayLabel = REPEAT_WEEKDAY_LABELS[repeatMonthlyWeekday] ?? null;
      if (ordinalLabel && weekdayLabel) return `${ordinalLabel} ${weekdayLabel}`;
    }
    if (Number.isInteger(repeatDayOfMonth) && (repeatDayOfMonth ?? 0) >= 1 && (repeatDayOfMonth ?? 0) <= 31) {
      return formatOrdinalNumber(repeatDayOfMonth as number);
    }
    return "Monthly";
  }
  if (repeatFrequency === "custom") return "Custom";
  return formatRepeatFrequencyLabel(
    repeatFrequency,
    repeatInterval,
    repeatDaysOfWeek,
    repeatMonthlyMode,
    repeatMonthlyOrdinal,
    repeatMonthlyWeekday,
  );
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
      || task.status === "delayed"
      || task.status === "missed"
      || task.status === "upcoming"
      || task.status === "not_due"),
  );
}

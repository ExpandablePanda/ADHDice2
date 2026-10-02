import { formatDateKey, shiftDateKey } from "./date-key.ts";
import type { Task, TaskRepeatFrequency, TaskRepeatMonthlyMode, TaskRepeatMonthlyOrdinal, TaskStatus } from "./database.types.ts";
import type { QuotaProgress } from "./task-state-engine/quota.ts";

export type TaskRepeatCategory = "none" | "daily" | "daily_until_complete" | "weekdays" | "weekly" | "monthly" | "custom" | "per_week" | "per_month";
export type TaskRepeatEditorUnit = "daily" | "weekly" | "monthly" | "per_week" | "per_month";
export type TaskRepeatCompletionMode = "keep_repeating" | "until_complete";
export type TaskRepeatEditorValue = {
  repeatFrequency: TaskRepeatFrequency;
  repeatInterval: number;
  repeatDaysOfWeek: number[];
  repeatDayOfMonth: number | null;
  repeatMonthlyMode: TaskRepeatMonthlyMode;
  repeatMonthlyOrdinal: TaskRepeatMonthlyOrdinal | null;
  repeatMonthlyWeekday: number | null;
  repeatQuotaCount?: number | null;
  repeatQuotaBalanceEnabled?: boolean;
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

function formatQuotaProgress(progress?: QuotaProgress | null) {
  return progress ? ` · ${progress.numerator}/${progress.denominator}` : "";
}

export const REPEAT_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const REPEAT_WEEKDAY_FULL_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAYS_REPEAT_DAYS = [1, 2, 3, 4, 5] as const;
export const REPEAT_MONTHLY_MODE_OPTIONS: Array<{ label: string; value: TaskRepeatMonthlyMode }> = [
  { label: "Day of month", value: "day_of_month" },
  { label: "X of Every Month", value: "ordinal_weekday" },
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

type RepeatShape = "daily" | "weekly" | "monthly";

function repeatShapeForFields(input: Pick<TaskRepeatEditorValue, "repeatFrequency" | "repeatDaysOfWeek" | "repeatDayOfMonth" | "repeatMonthlyMode">): RepeatShape {
  if (input.repeatFrequency === "per_week" || input.repeatFrequency === "per_month") {
    return "daily";
  }
  if (input.repeatFrequency === "monthly") {
    return "monthly";
  }
  if (input.repeatFrequency === "weekly") {
    return "weekly";
  }
  if (input.repeatFrequency === "daily_until_complete") {
    if (input.repeatMonthlyMode === "ordinal_weekday" || input.repeatDayOfMonth !== null) {
      return "monthly";
    }
    if (input.repeatDaysOfWeek.length > 0) {
      return "weekly";
    }
  }
  return "daily";
}

export function getTaskRepeatEditorUnit(value: Pick<TaskRepeatEditorValue, "repeatFrequency" | "repeatDaysOfWeek" | "repeatDayOfMonth" | "repeatMonthlyMode">): TaskRepeatEditorUnit {
  if (value.repeatFrequency === "per_week" || value.repeatFrequency === "per_month") {
    return value.repeatFrequency;
  }
  return repeatShapeForFields(value);
}

export function isFixedUntilCompleteRepeatTask(
  task: Pick<Task, "repeat_frequency" | "repeat_days_of_week" | "repeat_day_of_month" | "repeat_monthly_mode">,
) {
  return task.repeat_frequency === "daily_until_complete"
    && repeatShapeForFields({
      repeatFrequency: task.repeat_frequency,
      repeatDaysOfWeek: task.repeat_days_of_week ?? [],
      repeatDayOfMonth: task.repeat_day_of_month,
      repeatMonthlyMode: task.repeat_monthly_mode,
    }) !== "daily";
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

function isWeekdaysDaySet(days: number[] | null | undefined) {
  const normalizedDays = normalizeRepeatDays(days);
  return normalizedDays.length === WEEKDAYS_REPEAT_DAYS.length
    && WEEKDAYS_REPEAT_DAYS.every((day, index) => normalizedDays[index] === day);
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
  if (normalizedDays.length > 0 && !isWeekdaysDaySet(normalizedDays)) {
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
  const unit = getTaskRepeatEditorUnit(value);
  return {
    ...value,
    repeatDaysOfWeek: normalizeRepeatDays(value.repeatDaysOfWeek),
    repeatInterval,
    completionMode: value.repeatFrequency === "daily_until_complete" ? "until_complete" : "keep_repeating",
    unit,
  };
}

export function normalizeTaskRepeatQuotaCount(
  repeatFrequency: Extract<TaskRepeatFrequency, "per_week" | "per_month">,
  value: number | null | undefined,
) {
  if (!Number.isInteger(value) || (value ?? 0) < 1) {
    return null;
  }
  return Math.min(repeatFrequency === "per_week" ? 7 : 31, value as number);
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
      repeatQuotaCount: null,
      repeatQuotaBalanceEnabled: false,
    };
  }

  if (selection === "per_week" || selection === "per_month") {
    const currentIsQuota = current.repeatFrequency === undefined
      || current.repeatFrequency === "per_week"
      || current.repeatFrequency === "per_month";
    return {
      repeatFrequency: selection,
      repeatInterval: 1,
      ...clearWeeklyFields(),
      ...clearMonthlyFields(),
      repeatQuotaCount: currentIsQuota
        ? normalizeTaskRepeatQuotaCount(selection, current.repeatQuotaCount)
        : null,
      repeatQuotaBalanceEnabled: current.repeatQuotaBalanceEnabled === true,
    };
  }

  if (selection === "daily" || selection === "daily_until_complete") {
    return {
      repeatFrequency: selection,
      repeatInterval: 1,
      ...clearWeeklyFields(),
      ...clearMonthlyFields(),
      repeatQuotaCount: null,
      repeatQuotaBalanceEnabled: false,
    };
  }

  if (selection === "weekdays") {
    return {
      repeatFrequency: "weekly",
      repeatInterval: 1,
      repeatDaysOfWeek: [...WEEKDAYS_REPEAT_DAYS],
      ...clearMonthlyFields(),
      repeatQuotaCount: null,
      repeatQuotaBalanceEnabled: false,
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
      repeatQuotaCount: null,
      repeatQuotaBalanceEnabled: false,
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
    repeatQuotaCount: null,
    repeatQuotaBalanceEnabled: false,
  };
}

export function buildCustomCadenceMutation(
  draft: Pick<TaskRepeatEditorDraft, "unit" | "repeatInterval" | "repeatDaysOfWeek" | "repeatDayOfMonth" | "repeatMonthlyMode" | "repeatMonthlyOrdinal" | "repeatMonthlyWeekday"> & {
    completionMode?: TaskRepeatCompletionMode;
  },
  options: { dueOn?: string | null; fallbackWeekday?: number } = {},
): TaskRepeatEditorValue {
  const repeatInterval = normalizeRepeatInterval(draft.repeatInterval);
  const repeatFrequency = draft.completionMode === "until_complete" ? "daily_until_complete" : null;
  if (draft.unit === "daily") {
    return {
      repeatFrequency: repeatFrequency ?? "daily",
      repeatInterval,
      ...clearWeeklyFields(),
      ...clearMonthlyFields(),
    };
  }

  if (draft.unit === "weekly") {
    return {
      repeatFrequency: repeatFrequency ?? "weekly",
      repeatInterval,
      repeatDaysOfWeek: resolveWeekdaySelection(draft.repeatDaysOfWeek, options.dueOn, options.fallbackWeekday),
      ...clearMonthlyFields(),
    };
  }

  const monthly = resolveMonthlySelection(draft, options.dueOn);
  return {
    repeatFrequency: repeatFrequency ?? "monthly",
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
  const repeatShape = repeatShapeForFields(value);
  const usesWeeklyFields = repeatFrequency === "weekly" || (repeatFrequency === "daily_until_complete" && repeatShape === "weekly");
  const usesMonthlyFields = repeatFrequency === "monthly" || (repeatFrequency === "daily_until_complete" && repeatShape === "monthly");
  return {
    repeat_frequency: repeatFrequency,
    repeat_interval: normalizeRepeatInterval(value.repeatInterval),
    repeat_days_of_week: usesWeeklyFields ? normalizeRepeatDays(value.repeatDaysOfWeek) : [],
    repeat_day_of_month: usesMonthlyFields && value.repeatMonthlyMode === "day_of_month"
      ? value.repeatDayOfMonth
      : null,
    repeat_monthly_mode: usesMonthlyFields ? value.repeatMonthlyMode : "day_of_month" as const,
    repeat_monthly_ordinal: usesMonthlyFields && value.repeatMonthlyMode === "ordinal_weekday"
      ? value.repeatMonthlyOrdinal
      : null,
    repeat_monthly_weekday: usesMonthlyFields && value.repeatMonthlyMode === "ordinal_weekday"
      ? value.repeatMonthlyWeekday
      : null,
    repeat_quota_count: value.repeatFrequency === "per_week" || value.repeatFrequency === "per_month"
      ? normalizeTaskRepeatQuotaCount(value.repeatFrequency, value.repeatQuotaCount)
      : null,
    repeat_quota_balance_enabled: value.repeatFrequency === "per_week" || value.repeatFrequency === "per_month"
      ? value.repeatQuotaBalanceEnabled === true
      : false,
  };
}

export function calcNextDueDate(task: Task): string | null {
  return calcNextDueDateFromDate(task, task.due_on ?? formatDateKey(new Date()));
}

export function calcNextDueDateFromDate(task: Task, referenceDateKey: string): string | null {
  if (task.repeat_frequency === "none") return null;
  if (task.repeat_frequency === "per_week" || task.repeat_frequency === "per_month") return null;
  const base = new Date(`${referenceDateKey}T12:00:00`);
  const interval = Math.max(1, task.repeat_interval ?? 1);

  const repeatShape = repeatShapeForFields({
    repeatFrequency: task.repeat_frequency,
    repeatDaysOfWeek: task.repeat_days_of_week ?? [],
    repeatDayOfMonth: task.repeat_day_of_month,
    repeatMonthlyMode: task.repeat_monthly_mode,
  });

  if (task.repeat_frequency === "weekly" || (task.repeat_frequency === "daily_until_complete" && repeatShape === "weekly")) {
    const days = task.repeat_days_of_week ?? [];
    const sortedDays = [...days].sort((a, b) => a - b);
    const baseDow = base.getDay();
    const nextDow = sortedDays.find((day) => day > baseDow) ?? sortedDays[0];
    const daysUntil = nextDow === undefined
      ? 7 * interval
      : nextDow > baseDow ? nextDow - baseDow : 7 * interval - (baseDow - nextDow);
    base.setDate(base.getDate() + daysUntil);
    return formatDateKey(base);
  }

  if (task.repeat_frequency === "monthly" || (task.repeat_frequency === "daily_until_complete" && repeatShape === "monthly")) {
    base.setMonth(base.getMonth() + interval);
    const occurrenceDate = getMonthlyOccurrenceDate(task, base.getFullYear(), base.getMonth(), referenceDateKey);
    base.setDate(occurrenceDate.getDate());
    return formatDateKey(base);
  }

  if (isDailyCadenceRepeatFrequency(task.repeat_frequency)) {
    base.setDate(base.getDate() + interval);
    return formatDateKey(base);
  }

  base.setDate(base.getDate() + interval);
  return formatDateKey(base);
}

export function resolveRecurringLiveStatusFromNextDueDate(
  _task: Pick<Task, "due_time">,
  {
    currentDayKey,
    nextDueDate,
  }: ResolveRecurringLiveStatusOptions,
): TaskStatus {
  if (nextDueDate > currentDayKey) {
    return "not_due";
  }

  if (nextDueDate < currentDayKey) {
    return "pending";
  }

  return "pending";
}

export function formatRepeatSummary(task: Pick<Task, "repeat_frequency" | "repeat_interval" | "repeat_days_of_week" | "repeat_day_of_month" | "repeat_monthly_mode" | "repeat_monthly_ordinal" | "repeat_monthly_weekday"> & {
  repeat_quota_count?: number | null;
  repeat_quota_balance_enabled?: boolean | null;
  repeat_quota_balance?: number | null;
  repeat_quota_progress?: QuotaProgress | null;
}): string | null {
  if (task.repeat_frequency === "none") return null;

  if (task.repeat_frequency === "per_week" || task.repeat_frequency === "per_month") {
    const count = Math.max(1, Math.min(task.repeat_frequency === "per_week" ? 7 : 31, Math.trunc(task.repeat_quota_count ?? 1)));
    const balance = task.repeat_quota_balance_enabled && task.repeat_quota_balance
      ? ` (${task.repeat_quota_balance > 0 ? "+" : ""}${task.repeat_quota_balance})`
      : "";
    const progress = formatQuotaProgress(task.repeat_quota_progress);
    return `${count} Per ${task.repeat_frequency === "per_week" ? "Week" : "Month"}${progress}${balance}`;
  }

  if (task.repeat_frequency === "daily_until_complete") {
    const repeatShape = repeatShapeForFields({
      repeatFrequency: task.repeat_frequency,
      repeatDaysOfWeek: task.repeat_days_of_week ?? [],
      repeatDayOfMonth: task.repeat_day_of_month,
      repeatMonthlyMode: task.repeat_monthly_mode,
    });
    if (repeatShape === "weekly") {
      return `${formatRepeatSummary({ ...task, repeat_frequency: "weekly" })} until complete`;
    }
    if (repeatShape === "monthly") {
      return `${formatRepeatSummary({ ...task, repeat_frequency: "monthly" })} until complete`;
    }
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
  return repeatFrequency === "weekly"
    && Math.max(1, repeatInterval ?? 1) === 1
    && isWeekdaysDaySet(repeatDaysOfWeek);
}

export function getTaskRepeatCategory(
  repeatFrequency: Task["repeat_frequency"],
  repeatDaysOfWeek: number[] | null | undefined,
  repeatInterval: number | null | undefined,
  repeatDayOfMonth: number | null | undefined = null,
  repeatMonthlyMode: TaskRepeatMonthlyMode | null | undefined = "day_of_month",
): TaskRepeatCategory {
  const normalizedInterval = Math.max(1, repeatInterval ?? 1);
  if (repeatFrequency === "per_week" || repeatFrequency === "per_month") return repeatFrequency;
  if (repeatFrequency === "daily" || repeatFrequency === "weekly" || repeatFrequency === "monthly") {
    return normalizedInterval > 1
      ? "custom"
      : repeatFrequency === "weekly" && isWeekdaysRepeatSelection(repeatFrequency, repeatDaysOfWeek, repeatInterval)
        ? "weekdays"
        : repeatFrequency;
  }
  if (repeatFrequency === "daily_until_complete") {
    return repeatShapeForFields({
      repeatFrequency,
      repeatDaysOfWeek: repeatDaysOfWeek ?? [],
      repeatDayOfMonth,
      repeatMonthlyMode: repeatMonthlyMode ?? "day_of_month",
    }) === "daily" && normalizedInterval === 1 ? "daily_until_complete" : "custom";
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
  repeatDayOfMonth?: number | null,
  repeatQuotaCount?: number | null,
  repeatQuotaBalanceEnabled?: boolean | null,
  repeatQuotaBalance?: number | null,
  repeatQuotaProgress?: QuotaProgress | null,
): string {
  if (repeatFrequency === "none") return "No Repeat";
  if (repeatFrequency === "per_week" || repeatFrequency === "per_month") {
    const limit = repeatFrequency === "per_week" ? 7 : 31;
    const balance = repeatQuotaBalanceEnabled && repeatQuotaBalance
      ? ` (${repeatQuotaBalance > 0 ? "+" : ""}${repeatQuotaBalance})`
      : "";
    const progress = formatQuotaProgress(repeatQuotaProgress);
    return `${Math.max(1, Math.min(limit, Math.trunc(repeatQuotaCount ?? 1)))} Per ${repeatFrequency === "per_week" ? "Week" : "Month"}${progress}${balance}`;
  }
  if (repeatFrequency === "daily") {
    return Math.max(1, repeatInterval ?? 1) > 1 ? `Every ${Math.max(1, repeatInterval ?? 1)} days` : "Daily";
  }
  if (repeatFrequency === "daily_until_complete") {
    const repeatShape = repeatShapeForFields({
      repeatFrequency,
      repeatDaysOfWeek: repeatDaysOfWeek ?? [],
      repeatDayOfMonth: repeatDayOfMonth ?? null,
      repeatMonthlyMode: repeatMonthlyMode ?? "day_of_month",
    });
    if (repeatShape === "weekly" || repeatShape === "monthly") {
      return `${formatRepeatFrequencyLabel(
        repeatShape,
        repeatInterval,
        repeatDaysOfWeek,
        repeatMonthlyMode,
        repeatMonthlyOrdinal,
        repeatMonthlyWeekday,
        repeatDayOfMonth,
      )} until complete`;
    }
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
  repeatQuotaCount?: number | null,
  repeatQuotaBalanceEnabled?: boolean | null,
  repeatQuotaBalance?: number | null,
  repeatQuotaProgress?: QuotaProgress | null,
) {
  if (repeatFrequency === "none") return "No Repeat";
  if (repeatFrequency === "per_week" || repeatFrequency === "per_month") {
    return formatRepeatFrequencyLabel(
      repeatFrequency,
      repeatInterval,
      repeatDaysOfWeek,
      repeatMonthlyMode,
      repeatMonthlyOrdinal,
      repeatMonthlyWeekday,
      repeatDayOfMonth,
      repeatQuotaCount,
      repeatQuotaBalanceEnabled,
      repeatQuotaBalance,
      repeatQuotaProgress,
    );
  }
  const isUntilComplete = repeatFrequency === "daily_until_complete";
  const repeatShape = repeatShapeForFields({
    repeatFrequency: repeatFrequency as TaskRepeatFrequency,
    repeatDaysOfWeek: repeatDaysOfWeek ?? [],
    repeatDayOfMonth: repeatDayOfMonth ?? null,
    repeatMonthlyMode: repeatMonthlyMode ?? "day_of_month",
  });
  if (repeatFrequency === "monthly" || (isUntilComplete && repeatShape === "monthly")) {
    let monthlyLabel = "Monthly";
    let hasMonthlyPattern = false;
    if (
      repeatMonthlyMode === "ordinal_weekday"
      && repeatMonthlyOrdinal
      && repeatMonthlyWeekday !== null
      && repeatMonthlyWeekday !== undefined
    ) {
      const ordinalLabel = formatMonthlyOrdinalLabel(repeatMonthlyOrdinal);
      const weekdayLabel = REPEAT_WEEKDAY_LABELS[repeatMonthlyWeekday] ?? null;
      if (ordinalLabel && weekdayLabel) {
        monthlyLabel = `${ordinalLabel} ${weekdayLabel}`;
        hasMonthlyPattern = true;
      }
    }
    if (monthlyLabel === "Monthly" && Number.isInteger(repeatDayOfMonth) && (repeatDayOfMonth ?? 0) >= 1 && (repeatDayOfMonth ?? 0) <= 31) {
      monthlyLabel = formatOrdinalNumber(repeatDayOfMonth as number);
      hasMonthlyPattern = true;
    }
    const monthlyInterval = Math.max(1, repeatInterval ?? 1) > 1
      ? formatRepeatFrequencyLabel("monthly", repeatInterval)
      : null;
    const compactMonthlyLabel = monthlyInterval
      ? hasMonthlyPattern ? `${monthlyInterval} · ${monthlyLabel}` : monthlyInterval
      : monthlyLabel;
    return isUntilComplete ? `${compactMonthlyLabel} · Until Complete` : compactMonthlyLabel;
  }
  if (isUntilComplete && repeatShape === "weekly") {
    return `${formatRepeatFrequencyLabel(
      "weekly",
      repeatInterval,
      repeatDaysOfWeek,
      repeatMonthlyMode,
      repeatMonthlyOrdinal,
      repeatMonthlyWeekday,
      repeatDayOfMonth,
    )} · Until Complete`;
  }
  if (isUntilComplete && repeatShape === "daily") {
    return Math.max(1, repeatInterval ?? 1) > 1
      ? `${formatRepeatFrequencyLabel("daily", repeatInterval)} · Until Complete`
      : "Daily Until Complete";
  }
  if (repeatFrequency === "custom") return "Custom";
  return formatRepeatFrequencyLabel(
    repeatFrequency,
    repeatInterval,
    repeatDaysOfWeek,
    repeatMonthlyMode,
    repeatMonthlyOrdinal,
    repeatMonthlyWeekday,
    repeatDayOfMonth,
  );
}

function compareDateKeys(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function buildDailyUntilCompleteMissedDateKeys(
  task: Pick<Task, "due_on" | "repeat_frequency" | "repeat_days_of_week" | "repeat_day_of_month" | "repeat_monthly_mode">,
  currentDayKey: string,
  latestHistoryDate: string | null,
) {
  if (!isDailyUntilCompleteRepeatFrequency(task.repeat_frequency) || isFixedUntilCompleteRepeatTask(task) || !task.due_on) {
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

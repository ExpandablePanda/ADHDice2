import { shiftDateKey } from "@/lib/task-grid-layout";

export const LOGICAL_DAY_SETTINGS_STORAGE_KEY = "adhdice-logical-day-settings";
export const DEFAULT_LOGICAL_DAY_START = "06:00";
export const DEFAULT_LOGICAL_DAY_TIMEZONE = "America/New_York";

export type LogicalDaySettings = {
  dayStartTime: string;
  timezone: string;
};

function getFormatter(timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
}

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function getBrowserTimeZone() {
  if (typeof Intl === "undefined") {
    return DEFAULT_LOGICAL_DAY_TIMEZONE;
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_LOGICAL_DAY_TIMEZONE;
}

export function normalizeLogicalDaySettings(settings: Partial<LogicalDaySettings> | null | undefined): LogicalDaySettings {
  return {
    dayStartTime: settings?.dayStartTime || DEFAULT_LOGICAL_DAY_START,
    timezone: settings?.timezone || getBrowserTimeZone(),
  };
}

export function readLogicalDaySettings(): LogicalDaySettings {
  if (typeof window === "undefined") {
    return normalizeLogicalDaySettings(null);
  }

  try {
    const raw = window.localStorage.getItem(LOGICAL_DAY_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return normalizeLogicalDaySettings(null);
    }

    return normalizeLogicalDaySettings(JSON.parse(raw) as Partial<LogicalDaySettings>);
  } catch {
    return normalizeLogicalDaySettings(null);
  }
}

export function saveLogicalDaySettings(settings: Partial<LogicalDaySettings>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LOGICAL_DAY_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeLogicalDaySettings(settings)),
  );
}

export function formatDateKeyInTimeZone(date: Date, timezone: string) {
  const formatter = getFormatter(timezone);
  const parts = formatter.formatToParts(date);
  const year = readPart(parts, "year");
  const month = readPart(parts, "month");
  const day = readPart(parts, "day");
  return `${year}-${month}-${day}`;
}

export function getLogicalDayKey(
  date: Date = new Date(),
  settings: Partial<LogicalDaySettings> | null | undefined = null,
) {
  const { dayStartTime, timezone } = normalizeLogicalDaySettings(settings ?? readLogicalDaySettings());
  const formatter = getFormatter(timezone);
  const parts = formatter.formatToParts(date);
  const dateKey = formatDateKeyInTimeZone(date, timezone);
  const hour = Number.parseInt(readPart(parts, "hour"), 10);
  const minute = Number.parseInt(readPart(parts, "minute"), 10);
  const [startHour, startMinute] = dayStartTime.split(":").map((value) => Number.parseInt(value, 10));

  if (
    Number.isFinite(hour)
    && Number.isFinite(minute)
    && Number.isFinite(startHour)
    && Number.isFinite(startMinute)
    && (hour < startHour || (hour === startHour && minute < startMinute))
  ) {
    return shiftDateKey(dateKey, -1);
  }

  return dateKey;
}

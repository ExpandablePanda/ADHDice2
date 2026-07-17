import { getLogicalDayKey } from "@/lib/logical-day";

export type AchievementCalendarSettings = Readonly<{
  logicalDayStart: string;
  timezone: string;
}>;

export type AchievementWeekGrouping = Readonly<{
  endDate: string;
  key: string;
  startDate: string;
}>;

export type AchievementMonthGrouping = Readonly<{
  endDate: string;
  key: string;
  startDate: string;
}>;

export type AchievementGroupingSnapshot = Readonly<{
  logicalDate: string;
  logicalDayStart: string;
  month: AchievementMonthGrouping;
  timezone: string;
  week: AchievementWeekGrouping;
}>;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function parseDateKey(dateKey: string) {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) throw new Error(`Invalid calendar date key: ${dateKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid calendar date key: ${dateKey}`);
  }
  return { date, day, month, year };
}

function formatUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const { date } = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

export function isValidIanaTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone.trim().length > 0;
  } catch {
    return false;
  }
}

export function validateAchievementCalendarSettings(settings: AchievementCalendarSettings) {
  if (!isValidIanaTimezone(settings.timezone)) throw new Error(`Invalid IANA timezone: ${settings.timezone}`);
  if (!TIME_PATTERN.test(settings.logicalDayStart)) throw new Error(`Invalid logical-day start: ${settings.logicalDayStart}`);
  return settings;
}

export function getAchievementLogicalDate(timestamp: Date | string, settings: AchievementCalendarSettings) {
  validateAchievementCalendarSettings(settings);
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid Achievement occurrence timestamp.");
  return getLogicalDayKey(date, { dayStartTime: settings.logicalDayStart, timezone: settings.timezone });
}

export function getMondayWeekGrouping(dateKey: string): AchievementWeekGrouping {
  const { date } = parseDateKey(dateKey);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const startDate = shiftDateKey(dateKey, -daysSinceMonday);
  return Object.freeze({ endDate: shiftDateKey(startDate, 6), key: startDate, startDate });
}

export function getCalendarMonthGrouping(dateKey: string): AchievementMonthGrouping {
  const { month, year } = parseDateKey(dateKey);
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = formatUtcDate(new Date(Date.UTC(year, month, 0, 12)));
  return Object.freeze({ endDate, key: `${year}-${String(month).padStart(2, "0")}`, startDate });
}

export function buildAchievementGroupingSnapshot(
  timestamp: Date | string,
  settings: AchievementCalendarSettings,
): AchievementGroupingSnapshot {
  const logicalDate = getAchievementLogicalDate(timestamp, settings);
  return Object.freeze({
    logicalDate,
    logicalDayStart: settings.logicalDayStart,
    month: getCalendarMonthGrouping(logicalDate),
    timezone: settings.timezone,
    week: getMondayWeekGrouping(logicalDate),
  });
}

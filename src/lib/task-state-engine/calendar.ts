import type { TaskCalendarState, TaskHistoryOutcome, TaskStateHistoryRow } from "./types.ts";

const DAY_MS = 86_400_000;

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function shiftDateKey(dateKey: string, days: number) {
  return formatDateKey(new Date(parseDateKey(dateKey).getTime() + days * DAY_MS));
}

export function daysBetween(from: string, to: string) {
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / DAY_MS);
}

export function dateRange(from: string, through: string) {
  const result: string[] = [];
  for (let cursor = from; cursor <= through; cursor = shiftDateKey(cursor, 1)) {
    result.push(cursor);
  }
  return result;
}

export function logicalDateForTimestamp(timestamp: string | Date, timezone: string, rollover: string) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
  const values = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const localDate = `${values.year}-${values.month}-${values.day}`;
  const localMinutes = Number(values.hour) * 60 + Number(values.minute);
  const [rolloverHour, rolloverMinute] = rollover.split(":").map(Number);
  return localMinutes < rolloverHour * 60 + rolloverMinute
    ? shiftDateKey(localDate, -1)
    : localDate;
}

export function calendarStateForOutcome(outcome: TaskHistoryOutcome): TaskCalendarState {
  return outcome;
}

export function authoritativeRowsByDate(rows: TaskStateHistoryRow[]) {
  const byDate = new Map<string, TaskStateHistoryRow>();
  for (const row of [...rows].sort((a, b) =>
    a.logicalDate.localeCompare(b.logicalDate)
    || a.occurredAt.localeCompare(b.occurredAt)
    || a.id.localeCompare(b.id))) {
    byDate.set(row.logicalDate, row);
  }
  return byDate;
}

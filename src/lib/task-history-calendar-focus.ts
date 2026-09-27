import { shiftDateKey } from "./date-key.ts";

const TASK_HISTORY_PAST_DAY_COUNT = 140;
const TASK_HISTORY_FUTURE_DAY_COUNT = 42;

function utcWeekday(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

export function buildTaskHistoryCalendarDateKeys(todayDateKey: string) {
  const nominalStartDate = shiftDateKey(todayDateKey, -(TASK_HISTORY_PAST_DAY_COUNT - 1));
  const nominalEndDate = shiftDateKey(todayDateKey, TASK_HISTORY_FUTURE_DAY_COUNT);
  const daysFromMonday = (utcWeekday(nominalStartDate) + 6) % 7;
  const daysThroughSunday = (7 - utcWeekday(nominalEndDate)) % 7;
  const calendarStartDate = shiftDateKey(nominalStartDate, -daysFromMonday);
  const totalDays = TASK_HISTORY_PAST_DAY_COUNT + TASK_HISTORY_FUTURE_DAY_COUNT + daysFromMonday + daysThroughSunday;

  return Array.from({ length: totalDays }, (_, index) => shiftDateKey(calendarStartDate, index));
}

export function buildTaskHistoryCalendarDateKeysForRange(startDateKey: string, endDateKey: string) {
  const daysFromMonday = (utcWeekday(startDateKey) + 6) % 7;
  const daysThroughSunday = (7 - utcWeekday(endDateKey)) % 7;
  const calendarStartDate = shiftDateKey(startDateKey, -daysFromMonday);
  const totalDays = Math.max(1, daysFromMonday + daysThroughSunday + 1 + daysBetweenDateKeys(startDateKey, endDateKey));
  return Array.from({ length: totalDays }, (_, index) => shiftDateKey(calendarStartDate, index));
}

function daysBetweenDateKeys(startDateKey: string, endDateKey: string) {
  const start = new Date(`${startDateKey}T00:00:00Z`).getTime();
  const end = new Date(`${endDateKey}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function getTaskHistoryInitialFocusDateKey({
  initialDateKey,
  todayDateKey,
}: {
  initialDateKey?: string | null;
  todayDateKey: string;
}) {
  return initialDateKey ?? todayDateKey;
}

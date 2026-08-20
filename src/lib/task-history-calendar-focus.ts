import { shiftDateKey } from "./task-grid-layout.ts";

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

export function getTaskHistoryInitialFocusDateKey({
  initialDateKey,
  todayDateKey,
}: {
  initialDateKey?: string | null;
  todayDateKey: string;
}) {
  return initialDateKey ?? todayDateKey;
}

export function getComfortableTaskHistoryScrollOffset({
  containerSize,
  targetOffset,
  targetSize,
}: {
  containerSize: number;
  targetOffset: number;
  targetSize: number;
}) {
  return Math.max(0, targetOffset - Math.max(24, (containerSize - targetSize) / 2));
}

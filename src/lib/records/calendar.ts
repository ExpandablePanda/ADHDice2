const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateKey(value: string) {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid logical date: ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (formatDateKey(date) !== value) throw new Error(`Invalid logical date: ${value}`);
  return date;
}

function formatDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function shiftRecordDate(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateKey(date);
}

export function getRecordWeek(dateKey: string) {
  const date = parseDateKey(dateKey);
  const start = shiftRecordDate(dateKey, -((date.getUTCDay() + 6) % 7));
  return { end: shiftRecordDate(start, 6), key: start, start };
}

export function getRecordMonth(dateKey: string) {
  const date = parseDateKey(dateKey);
  const key = dateKey.slice(0, 7);
  const start = `${key}-01`;
  const end = formatDateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)));
  return { end, key, start };
}

export function isConsecutiveRecordDate(previous: string, next: string) {
  return shiftRecordDate(previous, 1) === next;
}

export const RECORDS_AUTO_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function isRecordsFresh(lastCalculatedAt: string | null | undefined, nowMs = Date.now()) {
  if (!lastCalculatedAt) return false;
  const calculatedAtMs = Date.parse(lastCalculatedAt);
  if (!Number.isFinite(calculatedAtMs)) return false;
  return nowMs - calculatedAtMs < RECORDS_AUTO_REFRESH_INTERVAL_MS;
}

export function normalizeRecordsLogicalDayStart(value: string) {
  const match = value.trim().match(/^(\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!match || (match[2] !== undefined && match[2] !== "00")) return null;
  return match[1];
}

export function isRecordsInvalidatedAfter(lastCalculatedAt: string | null | undefined, invalidatedAt: string | null | undefined) {
  if (!lastCalculatedAt || !invalidatedAt) return false;
  const calculatedAtMs = Date.parse(lastCalculatedAt);
  const invalidatedAtMs = Date.parse(invalidatedAt);
  return Number.isFinite(calculatedAtMs) && Number.isFinite(invalidatedAtMs) && invalidatedAtMs > calculatedAtMs;
}

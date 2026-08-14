export const TASK_STATE_HISTORY_CUTOVER_DATE = "2026-08-14";

export function isPreCutoverTaskStateHistoryDate(logicalDate: string | null | undefined) {
  return typeof logicalDate === "string" && logicalDate < TASK_STATE_HISTORY_CUTOVER_DATE;
}

export function isPostCutoverTaskStateHistoryDate(logicalDate: string | null | undefined) {
  return typeof logicalDate === "string" && logicalDate >= TASK_STATE_HISTORY_CUTOVER_DATE;
}

export function isHistoricalMigrationReconstructionEntry(entry: {
  canonical_provenance_kind?: string | null;
  entry_date?: string | null;
}) {
  return isPreCutoverTaskStateHistoryDate(entry.entry_date)
    && entry.canonical_provenance_kind === "migration_reconstruction";
}

export function shouldExposeHistoryEventTimestamp(entry: {
  canonical_provenance_kind?: string | null;
  entry_date?: string | null;
}) {
  return !isHistoricalMigrationReconstructionEntry(entry);
}

export function resolveTaskHistoryRecurrenceAuthority(
  logicalDate: string | null | undefined,
  requestedAuthority: boolean | null | undefined,
) {
  if (isPreCutoverTaskStateHistoryDate(logicalDate)) return false;
  return requestedAuthority === null ? undefined : requestedAuthority;
}

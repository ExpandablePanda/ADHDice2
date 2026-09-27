export const RECORDS_SOURCE_STATE_SCHEMA_VERSION = "records-source-state-v1" as const;

export type RecordsSourceState = Readonly<{
  schema_version: typeof RECORDS_SOURCE_STATE_SCHEMA_VERSION;
  history_sync_epoch: string;
  history_revision: number;
  task_row_count: number;
  task_digest: string;
  focus_row_count: number;
  focus_digest: string;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isRecordsSourceState(value: unknown): value is RecordsSourceState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<RecordsSourceState>;
  return state.schema_version === RECORDS_SOURCE_STATE_SCHEMA_VERSION
    && typeof state.history_sync_epoch === "string"
    && UUID_PATTERN.test(state.history_sync_epoch)
    && isNonNegativeInteger(state.history_revision)
    && isNonNegativeInteger(state.task_row_count)
    && typeof state.task_digest === "string"
    && DIGEST_PATTERN.test(state.task_digest)
    && isNonNegativeInteger(state.focus_row_count)
    && typeof state.focus_digest === "string"
    && DIGEST_PATTERN.test(state.focus_digest);
}

export function recordsSourceStatesMatch(left: RecordsSourceState | null | undefined, right: RecordsSourceState | null | undefined) {
  return Boolean(left && right && isRecordsSourceState(left) && isRecordsSourceState(right))
    && left!.schema_version === right!.schema_version
    && left!.history_sync_epoch === right!.history_sync_epoch
    && left!.history_revision === right!.history_revision
    && left!.task_row_count === right!.task_row_count
    && left!.task_digest === right!.task_digest
    && left!.focus_row_count === right!.focus_row_count
    && left!.focus_digest === right!.focus_digest;
}

export function recordsSourceStateFingerprint(state: RecordsSourceState | null | undefined) {
  if (!state || !isRecordsSourceState(state)) return "unavailable";
  return `${state.history_sync_epoch.slice(0, 8)}:${state.history_revision}:${state.task_digest.slice(-8)}:${state.focus_digest.slice(-8)}`;
}

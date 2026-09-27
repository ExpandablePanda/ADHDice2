import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TaskHistorySyncState } from "@/lib/database.types";
import {
  isCanonicalTaskHistoryFact,
  TASK_HISTORY_CACHE_SCHEMA_VERSION,
  TASK_HISTORY_SYNC_PROTOCOL_VERSION,
  type TaskHistoryCacheMetadata,
  type TaskHistoryCacheMutation,
} from "@/lib/task-history-sync-cache";
import type { CanonicalTaskHistoryFact } from "./task-state-canonical/types";

export type TaskHistorySyncServerState = Pick<TaskHistorySyncState, "current_revision" | "sync_epoch" | "protocol_version">;

export type TaskHistoryDeltaChange = TaskHistoryCacheMutation;

export type TaskHistoryDeltaResponse = {
  protocolVersion: typeof TASK_HISTORY_SYNC_PROTOCOL_VERSION;
  syncEpoch: string;
  fromRevision: number;
  toRevision: number;
  continuity: {
    isContiguous: true;
    firstRevision: number | null;
    lastRevision: number | null;
  };
  completeness: {
    isComplete: true;
    scope: "canonical-task-history";
  };
  changes: TaskHistoryDeltaChange[];
};

export type TaskHistorySyncClient = SupabaseClient<Database>;

export class TaskHistorySyncError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TaskHistorySyncError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asSafeNonNegativeInteger(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TaskHistorySyncError("malformed-response", `Task History sync response has an invalid ${field}.`);
  }
  return value as number;
}

function asRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TaskHistorySyncError("malformed-response", `Task History sync response has an invalid ${field}.`);
  }
  return value;
}

export async function readTaskHistorySyncState(client: TaskHistorySyncClient, userId: string) {
  const result = await client
    .from("adhdice_task_history_sync_state")
    .select("current_revision,sync_epoch,protocol_version")
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) {
    throw new TaskHistorySyncError("watermark-read-failed", result.error.message ?? "Could not read Task History sync state.");
  }
  if (!result.data) return null;
  const state = result.data as TaskHistorySyncServerState;
  if (state.protocol_version !== TASK_HISTORY_SYNC_PROTOCOL_VERSION) {
    throw new TaskHistorySyncError("protocol-mismatch", "The server Task History sync protocol is unsupported.");
  }
  if (!Number.isSafeInteger(state.current_revision) || state.current_revision < 0 || typeof state.sync_epoch !== "string" || state.sync_epoch.length === 0) {
    throw new TaskHistorySyncError("malformed-watermark", "The server Task History sync state is malformed.");
  }
  return state;
}

export function createTaskHistoryCacheMetadata(
  userId: string,
  state: Pick<TaskHistorySyncServerState, "sync_epoch" | "current_revision">,
  rowCount: number,
): TaskHistoryCacheMetadata {
  return {
    userId,
    cacheSchemaVersion: TASK_HISTORY_CACHE_SCHEMA_VERSION,
    protocolVersion: TASK_HISTORY_SYNC_PROTOCOL_VERSION,
    syncEpoch: state.sync_epoch,
    validatedRevision: state.current_revision,
    completeness: "complete",
    rowCount,
  };
}

function parseDeltaChange(value: unknown, userId: string): TaskHistoryDeltaChange {
  if (!isRecord(value)) {
    throw new TaskHistorySyncError("malformed-response", "Task History sync response contains a malformed change.");
  }
  const operation = value.operation;
  if (operation !== "upsert" && operation !== "delete") {
    throw new TaskHistorySyncError("malformed-response", "Task History sync response contains an invalid operation.");
  }
  const historyFactId = asRequiredString(value.historyFactId, "historyFactId");
  const entityId = asRequiredString(value.entityId, "entityId");
  const logicalDate = asRequiredString(value.logicalDate, "logicalDate");
  if (operation === "delete") return { operation, historyFactId, entityId, logicalDate };
  if (!isCanonicalTaskHistoryFact(value.fact, userId) || value.fact.id !== historyFactId) {
    throw new TaskHistorySyncError("missing-upsert-row", "Task History delta upsert is missing its canonical current row.");
  }
  if (value.fact.entity_id !== entityId || value.fact.logical_date !== logicalDate) {
    throw new TaskHistorySyncError("malformed-response", "Task History delta upsert identity does not match its ledger identity.");
  }
  return { operation, historyFactId, entityId, logicalDate, fact: value.fact };
}

export function parseTaskHistoryDeltaResponse(value: unknown, userId: string): TaskHistoryDeltaResponse {
  const responseValue = Array.isArray(value) ? value[0] : value;
  if (!isRecord(responseValue)) {
    throw new TaskHistorySyncError("malformed-response", "Task History sync response is missing.");
  }
  const protocolVersion = asRequiredString(responseValue.protocolVersion, "protocolVersion");
  if (protocolVersion !== TASK_HISTORY_SYNC_PROTOCOL_VERSION) {
    throw new TaskHistorySyncError("protocol-mismatch", "The server Task History delta protocol is unsupported.");
  }
  const syncEpoch = asRequiredString(responseValue.syncEpoch, "syncEpoch");
  const fromRevision = asSafeNonNegativeInteger(responseValue.fromRevision, "fromRevision");
  const toRevision = asSafeNonNegativeInteger(responseValue.toRevision, "toRevision");
  if (toRevision < fromRevision) {
    throw new TaskHistorySyncError("revision-regression", "The server Task History revision moved backwards.");
  }
  const continuity = responseValue.continuity;
  const completeness = responseValue.completeness;
  const expectedFirstRevision = toRevision === fromRevision ? null : fromRevision + 1;
  const expectedLastRevision = toRevision === fromRevision ? null : toRevision;
  if (!isRecord(continuity) || continuity.isContiguous !== true
    || continuity.firstRevision !== expectedFirstRevision
    || continuity.lastRevision !== expectedLastRevision
    || !isRecord(completeness) || completeness.isComplete !== true || completeness.scope !== "canonical-task-history") {
    throw new TaskHistorySyncError("incomplete-response", "The server Task History delta is not complete and contiguous.");
  }
  if (!Array.isArray(responseValue.changes)) {
    throw new TaskHistorySyncError("malformed-response", "The server Task History delta changes are missing.");
  }
  const changes = responseValue.changes.map((change) => parseDeltaChange(change, userId));
  const factIds = new Set<string>();
  for (const change of changes) {
    if (factIds.has(change.historyFactId)) {
      throw new TaskHistorySyncError("duplicate-final-change", "The server Task History delta contains redundant final changes.");
    }
    factIds.add(change.historyFactId);
  }
  return {
    protocolVersion: TASK_HISTORY_SYNC_PROTOCOL_VERSION,
    syncEpoch,
    fromRevision,
    toRevision,
    continuity: {
      isContiguous: true,
      firstRevision: expectedFirstRevision,
      lastRevision: expectedLastRevision,
    },
    completeness: { isComplete: true, scope: "canonical-task-history" },
    changes,
  };
}

export async function fetchTaskHistoryDelta(
  client: TaskHistorySyncClient,
  userId: string,
  state: TaskHistorySyncServerState,
  fromRevision: number,
) {
  if (state.protocol_version !== TASK_HISTORY_SYNC_PROTOCOL_VERSION) {
    throw new TaskHistorySyncError("protocol-mismatch", "The server Task History sync protocol is unsupported.");
  }
  if (!Number.isSafeInteger(fromRevision) || fromRevision < 0 || fromRevision > state.current_revision) {
    throw new TaskHistorySyncError("revision-out-of-range", "The requested Task History delta revision is out of range.");
  }
  const result = await client.rpc("adhdice_get_task_history_delta", {
    p_expected_protocol_version: TASK_HISTORY_SYNC_PROTOCOL_VERSION,
    p_expected_sync_epoch: state.sync_epoch,
    p_from_revision: fromRevision,
  });
  if (result.error) {
    throw new TaskHistorySyncError("delta-read-failed", result.error.message ?? "Could not read the Task History delta.");
  }
  const response = parseTaskHistoryDeltaResponse(result.data, userId);
  if (response.syncEpoch !== state.sync_epoch || response.fromRevision !== fromRevision || response.toRevision > state.current_revision) {
    throw new TaskHistorySyncError("delta-fence-mismatch", "The Task History delta did not match the server revision fence.");
  }
  return response;
}

export function applyTaskHistoryDelta(
  currentFacts: readonly CanonicalTaskHistoryFact[],
  response: TaskHistoryDeltaResponse,
  userId: string,
): CanonicalTaskHistoryFact[] {
  const facts = new Map(currentFacts.map((fact) => [fact.id, fact]));
  for (const change of response.changes) {
    if (change.operation === "delete") {
      facts.delete(change.historyFactId);
    } else {
      if (!change.fact || !isCanonicalTaskHistoryFact(change.fact, userId)) {
        throw new TaskHistorySyncError("missing-upsert-row", "The Task History delta contains an invalid upsert.");
      }
      facts.set(change.historyFactId, change.fact);
    }
  }
  return [...facts.values()];
}

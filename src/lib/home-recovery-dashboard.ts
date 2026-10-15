import type { Task } from "@/lib/database.types";

export const HOME_RECOVERY_APP_VERSION = "7.16.167";
export const HOME_RECOVERY_CHECKPOINT_INTERVAL_MS = 4 * 60 * 60 * 1000;

export type HomeRecoveryStatus = {
  recovery_storage_bytes: number;
  recovery_warning_bytes: number;
  recovery_limit_bytes: number;
  recovery_warning: boolean;
  recovery_capacity_exhausted: boolean;
  database_capture_suspended: boolean;
  database_bytes: number;
  database_limit_bytes: number;
  recovery_point_count: number;
  max_recovery_points: number;
  latest_successful_point_at: string | null;
  latest_attempt_at: string | null;
  latest_attempt_trigger: string | null;
  latest_attempt_result: string | null;
  latest_failure_at: string | null;
  latest_failure_reason: string | null;
  last_scheduled_attempt_at: string | null;
};

export type HomeRecoveryPoint = {
  id: string;
  created_at: string;
  app_version: string;
  schema_version: number;
  trigger_type: "manual" | "scheduled" | "protected" | string;
  domain_manifest: Record<string, unknown>;
  payload_schema_version: number;
  payload_bytes: number;
  checksum_algorithm: string;
  verification_status: string;
  is_protected: boolean;
  protected_at: string | null;
  protected_reason: string | null;
};

export type HomeRecoveryPreview = {
  status: string;
  id?: string;
  created_at?: string;
  app_version?: string;
  schema_version?: number;
  trigger_type?: string;
  domain_manifest?: Record<string, unknown>;
  payload_bytes?: number;
  verification_status?: string;
  is_protected?: boolean;
  integrity_valid?: boolean;
  schema_compatible?: boolean;
  home_state?: Record<string, unknown> | null;
  missing_task_ids?: string[];
  restorable?: boolean;
  current_state_revision?: number | null;
  current_restore_generation?: number;
  current_client_updated_at?: string | null;
};

export type HomeRecoveryRpcName =
  | "home_recovery_status"
  | "list_home_recovery_points"
  | "preview_home_recovery_point"
  | "create_home_recovery_point";

export type HomeRecoveryRpcResponse = {
  data: unknown;
  error: unknown | null;
};

export type HomeRecoveryRpcClient = {
  rpc: (name: HomeRecoveryRpcName, args?: Record<string, unknown>) => PromiseLike<HomeRecoveryRpcResponse>;
};

export type HomeRecoveryRequestResult<T> =
  | { kind: "available"; value: T }
  | { kind: "unavailable" | "error"; message: string };

export type HomeRecoveryCaptureResult =
  | { kind: "created"; recoveryPointId: string; unchanged: boolean }
  | { kind: "failed" | "unavailable" | "error"; message: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value;
}

function isUnavailableRpcError(error: Record<string, unknown>) {
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  return ["PGRST202", "PGRST203", "PGRST204", "PGRST205", "42883", "42P01"].includes(code)
    || /function .* does not exist|schema cache.*function|relation .* does not exist/i.test(message);
}

function rpcErrorMessage(error: unknown) {
  const record = asRecord(error) ?? {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  if (isUnavailableRpcError(record)) {
    return {
      kind: "unavailable" as const,
      message: "Home recovery functions are not available in this database. No saved-point count can be confirmed.",
    };
  }
  if (code === "28000" || code === "42501") {
    return {
      kind: "error" as const,
      message: "Recovery access was denied. Sign in again or ask an administrator to verify your account access.",
    };
  }
  if (!message || /failed to fetch|network|timeout/i.test(message)) {
    return { kind: "error" as const, message: "Could not reach the recovery service. Check your connection and refresh." };
  }
  return { kind: "error" as const, message: "Recovery information could not be loaded. Try refreshing the page." };
}

async function invokeRecoveryRpc(
  client: HomeRecoveryRpcClient,
  name: HomeRecoveryRpcName,
  args?: Record<string, unknown>,
): Promise<HomeRecoveryRpcResponse> {
  try {
    return await client.rpc(name, args);
  } catch (error) {
    return { data: null, error };
  }
}

export function parseHomeRecoveryStatus(value: unknown): HomeRecoveryStatus | null {
  const record = asRecord(value);
  if (!record) return null;
  const numericFields = [
    "recovery_storage_bytes",
    "recovery_warning_bytes",
    "recovery_limit_bytes",
    "database_bytes",
    "database_limit_bytes",
    "recovery_point_count",
    "max_recovery_points",
  ] as const;
  const numbers = Object.fromEntries(numericFields.map((field) => [field, nonNegativeNumber(record[field])]));
  if (numericFields.some((field) => numbers[field] === null)) return null;
  if (["recovery_warning", "recovery_capacity_exhausted", "database_capture_suspended"].some((field) => typeof record[field] !== "boolean")) return null;
  const timestampFields = [
    "latest_successful_point_at",
    "latest_attempt_at",
    "latest_failure_at",
    "last_scheduled_attempt_at",
  ] as const;
  const timestamps = Object.fromEntries(timestampFields.map((field) => [field, nullableString(record[field])]));
  if (timestampFields.some((field) => timestamps[field] === undefined)) return null;
  const stringFields = ["latest_attempt_trigger", "latest_attempt_result", "latest_failure_reason"] as const;
  const strings = Object.fromEntries(stringFields.map((field) => [field, nullableString(record[field])]));
  if (stringFields.some((field) => strings[field] === undefined)) return null;
  return {
    ...(numbers as Pick<HomeRecoveryStatus, typeof numericFields[number]>),
    recovery_warning: record.recovery_warning as boolean,
    recovery_capacity_exhausted: record.recovery_capacity_exhausted as boolean,
    database_capture_suspended: record.database_capture_suspended as boolean,
    ...(timestamps as Pick<HomeRecoveryStatus, typeof timestampFields[number]>),
    ...(strings as Pick<HomeRecoveryStatus, typeof stringFields[number]>),
  };
}

export function parseHomeRecoveryPoint(value: unknown): HomeRecoveryPoint | null {
  const record = asRecord(value);
  if (!record
    || typeof record.id !== "string"
    || typeof record.created_at !== "string"
    || typeof record.app_version !== "string"
    || typeof record.trigger_type !== "string"
    || typeof record.verification_status !== "string"
    || typeof record.checksum_algorithm !== "string"
    || typeof record.is_protected !== "boolean") return null;
  const schemaVersion = nonNegativeNumber(record.schema_version);
  const payloadSchemaVersion = nonNegativeNumber(record.payload_schema_version);
  const payloadBytes = nonNegativeNumber(record.payload_bytes);
  const protectedAt = nullableString(record.protected_at);
  const protectedReason = nullableString(record.protected_reason);
  const manifest = asRecord(record.domain_manifest);
  if (schemaVersion === null || payloadSchemaVersion === null || payloadBytes === null
    || protectedAt === undefined || protectedReason === undefined || !manifest) return null;
  return {
    id: record.id,
    created_at: record.created_at,
    app_version: record.app_version,
    schema_version: schemaVersion,
    trigger_type: record.trigger_type,
    domain_manifest: manifest,
    payload_schema_version: payloadSchemaVersion,
    payload_bytes: payloadBytes,
    checksum_algorithm: record.checksum_algorithm,
    verification_status: record.verification_status,
    is_protected: record.is_protected,
    protected_at: protectedAt,
    protected_reason: protectedReason,
  };
}

export function parseHomeRecoveryPointList(value: unknown): HomeRecoveryPoint[] | null {
  if (!Array.isArray(value)) return null;
  const points = value.map(parseHomeRecoveryPoint);
  return points.some((point) => point === null) ? null : points as HomeRecoveryPoint[];
}

export function parseHomeRecoveryPreview(value: unknown, expectedId: string): HomeRecoveryPreview | null {
  const record = asRecord(value);
  if (!record || typeof record.status !== "string") return null;
  if (record.status !== "preview") return { status: record.status };
  if (record.id !== expectedId || typeof record.integrity_valid !== "boolean"
    || typeof record.schema_compatible !== "boolean" || !Array.isArray(record.missing_task_ids)
    || record.missing_task_ids.some((id) => typeof id !== "string")) return null;
  const state = record.home_state === null ? null : asRecord(record.home_state);
  if (record.home_state !== null && !state) return null;
  const domainManifest = asRecord(record.domain_manifest);
  const payloadBytes = nonNegativeNumber(record.payload_bytes);
  if (typeof record.created_at !== "string" || typeof record.app_version !== "string"
    || typeof record.trigger_type !== "string" || typeof record.verification_status !== "string"
    || typeof record.is_protected !== "boolean" || !domainManifest || payloadBytes === null) return null;
  return {
    status: "preview",
    id: expectedId,
    created_at: record.created_at,
    app_version: record.app_version,
    schema_version: nonNegativeNumber(record.schema_version) ?? undefined,
    trigger_type: record.trigger_type,
    domain_manifest: domainManifest,
    payload_bytes: payloadBytes,
    verification_status: record.verification_status,
    is_protected: record.is_protected,
    integrity_valid: record.integrity_valid,
    schema_compatible: record.schema_compatible,
    home_state: state,
    missing_task_ids: record.missing_task_ids as string[],
    restorable: typeof record.restorable === "boolean" ? record.restorable : undefined,
    current_state_revision: nonNegativeNumber(record.current_state_revision),
    current_restore_generation: nonNegativeNumber(record.current_restore_generation) ?? undefined,
    current_client_updated_at: nullableString(record.current_client_updated_at) ?? null,
  };
}

export async function loadHomeRecoveryStatus(client: HomeRecoveryRpcClient): Promise<HomeRecoveryRequestResult<HomeRecoveryStatus>> {
  const response = await invokeRecoveryRpc(client, "home_recovery_status");
  if (response.error) return rpcErrorMessage(response.error);
  const value = parseHomeRecoveryStatus(response.data);
  return value
    ? { kind: "available", value }
    : { kind: "error", message: "Recovery status returned an unexpected response. Try refreshing." };
}

export async function loadHomeRecoveryPoints(client: HomeRecoveryRpcClient): Promise<HomeRecoveryRequestResult<HomeRecoveryPoint[]>> {
  const response = await invokeRecoveryRpc(client, "list_home_recovery_points", { p_limit: 10 });
  if (response.error) return rpcErrorMessage(response.error);
  const value = parseHomeRecoveryPointList(response.data);
  return value
    ? { kind: "available", value }
    : { kind: "error", message: "The recovery-point list returned an unexpected response. Try refreshing." };
}

export async function loadHomeRecoveryPreview(
  client: HomeRecoveryRpcClient,
  recoveryPointId: string,
): Promise<HomeRecoveryRequestResult<HomeRecoveryPreview>> {
  const response = await invokeRecoveryRpc(client, "preview_home_recovery_point", { p_recovery_point_id: recoveryPointId });
  if (response.error) return rpcErrorMessage(response.error);
  const value = parseHomeRecoveryPreview(response.data, recoveryPointId);
  return value
    ? { kind: "available", value }
    : { kind: "error", message: "This recovery point returned an unexpected preview. Refresh the list and try again." };
}

function describeCaptureFailure(reason: unknown) {
  switch (reason) {
    case "database_capacity_reached": return "The database storage limit has been reached. No new Home backup was saved.";
    case "recovery_storage_limit_reached": return "The recovery storage limit has been reached. No new Home backup was saved.";
    case "retention_blocked_by_protected_points": return "All recovery points are protected, so there is no safe space for another Home backup.";
    case "snapshot_verification_failed": return "The database could not verify this Home backup. No new point was saved.";
    case "invalid_home_state_schema": return "The current Home state is not compatible with the recovery system. No backup was saved.";
    default: return "The database could not create a verified Home backup. Existing recovery points were preserved.";
  }
}

export async function createManualHomeRecoveryPoint(
  client: HomeRecoveryRpcClient,
  appVersion = HOME_RECOVERY_APP_VERSION,
): Promise<HomeRecoveryCaptureResult> {
  const response = await invokeRecoveryRpc(client, "create_home_recovery_point", { p_app_version: appVersion });
  if (response.error) {
    const error = rpcErrorMessage(response.error);
    return { kind: error.kind, message: error.message };
  }
  const value = asRecord(response.data);
  if (!value || typeof value.status !== "string") {
    return { kind: "error", message: "The database returned an unexpected result. No success was reported." };
  }
  if (value.status === "created" || value.status === "unchanged") {
    if (typeof value.recovery_point_id !== "string" || !value.recovery_point_id) {
      return { kind: "error", message: "The database did not confirm a recovery-point ID. No success was reported." };
    }
    return { kind: "created", recoveryPointId: value.recovery_point_id, unchanged: value.status === "unchanged" };
  }
  if (value.status === "no_state") {
    return { kind: "failed", message: "No saved Home Todo state is available yet, so no recovery point was created." };
  }
  if (value.status === "failed") return { kind: "failed", message: describeCaptureFailure(value.reason) };
  return { kind: "error", message: "The database did not confirm a Home recovery point. Refresh and try again." };
}

export function canCreateHomeRecoveryPoint(input: {
  clientAvailable: boolean;
  userId: string | null | undefined;
  statusAvailable: boolean;
  pointsAvailable: boolean;
}) {
  return input.clientAvailable && Boolean(input.userId) && input.statusAvailable && input.pointsAvailable;
}

export function getHomeRecoveryListIds(state: Record<string, unknown> | null | undefined) {
  const ids = (key: string) => Array.isArray(state?.[key])
    ? (state?.[key] as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  return {
    todo: ids("taskIds"),
    urgent: ids("urgentTaskIds"),
    routine: ids("routineTaskIds"),
  };
}

export type HomeRecoveryListChange = {
  added: string[];
  removed: string[];
  orderChanged: boolean;
};

function compareIdLists(current: string[], previous: string[]): HomeRecoveryListChange {
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  const sharedCurrentOrder = current.filter((id) => previousSet.has(id));
  const sharedPreviousOrder = previous.filter((id) => currentSet.has(id));
  return {
    added: current.filter((id) => !previousSet.has(id)),
    removed: previous.filter((id) => !currentSet.has(id)),
    orderChanged: sharedCurrentOrder.some((id, index) => id !== sharedPreviousOrder[index]),
  };
}

export function compareHomeRecoveryLists(current: Record<string, unknown> | null, previous: Record<string, unknown> | null) {
  const currentIds = getHomeRecoveryListIds(current);
  const previousIds = getHomeRecoveryListIds(previous);
  return {
    todo: compareIdLists(currentIds.todo, previousIds.todo),
    urgent: compareIdLists(currentIds.urgent, previousIds.urgent),
    routine: compareIdLists(currentIds.routine, previousIds.routine),
  };
}

export function formatHomeRecoveryBytes(value: number) {
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}

export function formatHomeRecoveryDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

export function getNextHomeRecoveryEligibility(lastScheduledAttemptAt: string | null | undefined) {
  if (!lastScheduledAttemptAt) return null;
  const attemptTime = Date.parse(lastScheduledAttemptAt);
  return Number.isFinite(attemptTime) ? new Date(attemptTime + HOME_RECOVERY_CHECKPOINT_INTERVAL_MS).toISOString() : null;
}

export function createHomeOnlyBackupDocument(preview: HomeRecoveryPreview, exportedAt = new Date().toISOString()) {
  if (preview.status !== "preview" || preview.integrity_valid !== true || preview.schema_compatible !== true
    || preview.verification_status !== "verified" || !preview.home_state) return null;
  return {
    backup_type: "adhdice_home_only_backup",
    format_version: 1,
    scope: "Home-only backup",
    exported_at: exportedAt,
    app_version: HOME_RECOVERY_APP_VERSION,
    recovery_point: {
      id: preview.id,
      created_at: preview.created_at,
      source_app_version: preview.app_version,
      recovery_schema_version: preview.schema_version,
      payload_schema_version: 1,
      trigger_type: preview.trigger_type,
      verification_status: preview.verification_status,
      is_protected: preview.is_protected,
    },
    homeTodo: {
      schema_version: preview.home_state.schemaVersion ?? null,
      state: preview.home_state,
    },
    privacy_notice: "Home-only backup. This snapshot can include Scratchpad content. Keep this file private.",
  };
}

export function getHomeRecoveryPointType(point: HomeRecoveryPoint | HomeRecoveryPreview) {
  switch (point.trigger_type) {
    case "scheduled": return "Scheduled checkpoint";
    case "protected": return "Protected checkpoint";
    default: return "Manual checkpoint";
  }
}

export function getHomeRecoveryTaskLabel(taskId: string, tasks: readonly Task[], missingTaskIds: readonly string[]) {
  if (missingTaskIds.includes(taskId)) return `Missing Task · ${taskId}`;
  const task = tasks.find((candidate) => candidate.id === taskId);
  return task?.title?.trim() ? task.title : taskId;
}

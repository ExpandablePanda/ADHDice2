import { createBrowserSupabaseClient } from "@/lib/supabase";

const TASK_STATE_COMMAND_FUNCTION = "task-state-command";
const SIDE_EFFECT_ID_FIELDS = [
  "history_fact_id",
  "schedule_boundary_id",
  "occurrence_id",
  "effective_override_id",
  "calendar_override_id",
  "reward_entitlement_id",
] as const;

type JsonObject = Record<string, unknown>;
type TaskStateCommandState = "committed" | "rejected";
export type TaskStateCommandErrorKind =
  | "client_unavailable"
  | "authentication_failure"
  | "invocation_failure"
  | "command_rejected"
  | "malformed_response";

/**
 * Browser-only mirror of the Edge intent contract. The Edge remains the sole
 * validation and business-rule authority for these fields.
 */
export type TaskStateCommandIntent =
  | { type: "set_outcome"; task_id: string; replay_identity: string; expected_revision?: number; outcome: "done" | "did_my_best" | "missed"; logical_date?: string; occurrence_key?: string; scheduled_due_on?: string }
  | { type: "complete_task"; task_id: string; replay_identity: string; expected_revision?: number; logical_date?: string; occurrence_key?: string; scheduled_due_on?: string; milestone_id?: string; expected_milestone_revision?: number; milestone_operation_id?: string }
  | { type: "delay_occurrence"; task_id: string; replay_identity: string; expected_revision?: number; logical_date?: string; occurrence_key?: string; effective_due_on: string }
  | { type: "set_due_date"; task_id: string; replay_identity: string; expected_revision?: number; logical_date?: string; schedule: TaskStateScheduleChangeIntent; manual_action?: "unscheduled_status" }
  | { type: "set_repeat"; task_id: string; replay_identity: string; expected_revision?: number; logical_date?: string; schedule: TaskStateScheduleChangeIntent }
  | { type: "calendar_override"; task_id: string; replay_identity: string; expected_revision?: number; logical_date: string; override_state: "unscheduled" | "not_due" | "due_open"; reason?: string | null }
  | { type: "clear_outcome"; task_id: string; replay_identity: string; expected_revision?: number; logical_date: string; occurrence_key?: string; scheduled_due_on?: string }
  | { type: "archive_task" | "clear_in_progress" | "reconcile_rollover"; task_id: string; replay_identity: string; expected_revision?: number }
  | { type: "trash_task" | "restore_task"; task_id: string; replay_identity: string; expected_revision?: number; milestone_id?: string; expected_milestone_revision?: number; milestone_operation_id?: string }
  | { type: "start_in_progress"; task_id: string; replay_identity: string; expected_revision?: number; occurrence_key?: string };

export type TaskStateScheduleChangeIntent = {
  schedule_model: "unscheduled" | "one_time" | "rolling" | "fixed";
  repeat_frequency?: "none" | "daily" | "weekly" | "monthly" | "custom" | "daily_until_complete";
  repeat_interval?: number;
  repeat_days_of_week?: number[];
  repeat_day_of_month?: number | null;
  repeat_monthly_mode?: "day_of_month" | "ordinal_weekday";
  repeat_monthly_ordinal?: "first" | "second" | "third" | "fourth" | "last" | null;
  repeat_monthly_weekday?: number | null;
  one_time_due_on?: string | null;
  due_time?: string | null;
  anchor_date?: string | null;
};

export type TaskStateCommandSideEffectIds = Partial<{
  [Field in (typeof SIDE_EFFECT_ID_FIELDS)[number]]: string | null;
}>;

export type TaskStateCommandError = {
  kind: TaskStateCommandErrorKind;
  message: string;
  code: string | null;
  status: number | null;
};

type TaskStateCommandResultFields = {
  state: TaskStateCommandState | null;
  task_id: string | null;
  command_id: string | null;
  expected_revision: number | null;
  next_revision: number | null;
  was_replayed: boolean | null;
  conflict_code: string | null;
  no_action?: boolean;
  canonical_task_patch: JsonObject | null;
  compatibility_projection: JsonObject | null;
  side_effect_ids: TaskStateCommandSideEffectIds;
  task_row?: JsonObject;
  milestone_row?: JsonObject;
  created_transition?: boolean;
};

export type TaskStateCommandSuccess = TaskStateCommandResultFields & {
  success: true;
  state: "committed";
  error: null;
};

export type TaskStateCommandFailure = TaskStateCommandResultFields & {
  success: false;
  error: TaskStateCommandError;
};

export type TaskStateCommandResponse = TaskStateCommandSuccess | TaskStateCommandFailure;

type BrowserSupabaseClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

export type TaskStateCommandClient = Pick<BrowserSupabaseClient, "functions">;

export type InvokeTaskStateCommandOptions = {
  /** Test seam only; normal callers reuse createBrowserSupabaseClient(). */
  client?: TaskStateCommandClient | null;
};

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(object: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function requiredString(object: JsonObject, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Edge response field \"${key}\" must be a non-empty string.`);
  }
  return value;
}

function requiredInteger(object: JsonObject, key: string): number {
  const value = object[key];
  if (!Number.isInteger(value)) {
    throw new Error(`Edge response field \"${key}\" must be an integer.`);
  }
  return value as number;
}

function requiredNullableInteger(object: JsonObject, key: string): number | null {
  const value = object[key];
  if (value !== null && !Number.isInteger(value)) {
    throw new Error(`Edge response field \"${key}\" must be an integer or null.`);
  }
  return value as number | null;
}

function requiredNullableString(object: JsonObject, key: string): string | null {
  const value = object[key];
  if (value !== null && typeof value !== "string") {
    throw new Error(`Edge response field \"${key}\" must be a string or null.`);
  }
  return value;
}

function requiredBoolean(object: JsonObject, key: string): boolean {
  if (typeof object[key] !== "boolean") {
    throw new Error(`Edge response field \"${key}\" must be a boolean.`);
  }
  return object[key] as boolean;
}

function requiredObject(object: JsonObject, key: string): JsonObject {
  if (!isObject(object[key])) {
    throw new Error(`Edge response field \"${key}\" must be an object.`);
  }
  return object[key];
}

function sideEffectIds(payload: JsonObject): TaskStateCommandSideEffectIds {
  const ids: TaskStateCommandSideEffectIds = {};
  for (const field of SIDE_EFFECT_ID_FIELDS) {
    if (!hasOwn(payload, field)) continue;
    const value = payload[field];
    if (value !== null && typeof value !== "string") {
      throw new Error(`Edge response field \"${field}\" must be a string or null.`);
    }
    ids[field] = value as string | null;
  }
  return ids;
}

function resultFields(payload: JsonObject): TaskStateCommandResultFields {
  if (payload.state !== "committed" && payload.state !== "rejected") {
    throw new Error("Edge response field \"state\" must be committed or rejected.");
  }
  if (!hasOwn(payload, "command_id")) throw new Error("Edge response is missing command_id.");
  if (!hasOwn(payload, "expected_revision")) throw new Error("Edge response is missing expected_revision.");
  if (!hasOwn(payload, "next_revision")) throw new Error("Edge response is missing next_revision.");
  if (!hasOwn(payload, "was_replayed")) throw new Error("Edge response is missing was_replayed.");
  if (!hasOwn(payload, "conflict_code")) throw new Error("Edge response is missing conflict_code.");

  return {
    state: payload.state,
    task_id: hasOwn(payload, "task_id") ? requiredString(payload, "task_id") : null,
    command_id: requiredString(payload, "command_id"),
    expected_revision: requiredInteger(payload, "expected_revision"),
    next_revision: requiredNullableInteger(payload, "next_revision"),
    was_replayed: requiredBoolean(payload, "was_replayed"),
    conflict_code: requiredNullableString(payload, "conflict_code"),
    ...(payload.no_action === true ? { no_action: true } : {}),
    canonical_task_patch: payload.state === "committed" ? requiredObject(payload, "canonical_task_patch") : null,
    compatibility_projection: payload.state === "committed" ? requiredObject(payload, "compatibility_projection") : null,
    side_effect_ids: sideEffectIds(payload),
    ...(hasOwn(payload, "task_row") ? { task_row: requiredObject(payload, "task_row") } : {}),
    ...(hasOwn(payload, "milestone_row") ? { milestone_row: requiredObject(payload, "milestone_row") } : {}),
    ...(hasOwn(payload, "created_transition") ? { created_transition: requiredBoolean(payload, "created_transition") } : {}),
  };
}

function emptyResultFields(): TaskStateCommandResultFields {
  return {
    state: null,
    task_id: null,
    command_id: null,
    expected_revision: null,
    next_revision: null,
    was_replayed: null,
    conflict_code: null,
    canonical_task_patch: null,
    compatibility_projection: null,
    side_effect_ids: {},
  };
}

function failure(
  kind: TaskStateCommandErrorKind,
  message: string,
  details: Partial<Pick<TaskStateCommandError, "code" | "status">> = {},
  fields: Partial<TaskStateCommandResultFields> = {},
): TaskStateCommandFailure {
  return {
    ...emptyResultFields(),
    ...fields,
    success: false,
    error: {
      kind,
      message,
      code: details.code ?? null,
      status: details.status ?? null,
    },
  };
}

function errorRecord(value: unknown): JsonObject | null {
  return isObject(value) ? value : null;
}

async function functionErrorDetails(error: unknown): Promise<{
  code: string | null;
  message: string;
  status: number | null;
}> {
  const record = errorRecord(error);
  const context = record?.context;
  const contextRecord = errorRecord(context);
  const status = typeof contextRecord?.status === "number" ? contextRecord.status : null;
  let body: unknown = null;
  if (typeof contextRecord?.json === "function") {
    try {
      body = await (contextRecord.json as () => Promise<unknown>)();
    } catch {
      body = null;
    }
  }
  const bodyRecord = errorRecord(body);
  const nestedError = errorRecord(bodyRecord?.error) ?? bodyRecord;
  const code = typeof nestedError?.code === "string" ? nestedError.code : null;
  const bodyMessage = typeof nestedError?.message === "string" ? nestedError.message : null;
  const message = bodyMessage
    ?? (typeof record?.message === "string" ? record.message : "Canonical Task State command invocation failed.");
  return { code, message, status };
}

function failureKind(status: number | null, code: string | null): TaskStateCommandErrorKind {
  if (status === 401 || code === "authentication_failure") return "authentication_failure";
  if (status === 403 || status === 409 || status === 422 || code === "command_rejected") return "command_rejected";
  return "invocation_failure";
}

/**
 * Invoke the trusted Edge boundary with browser intent only. This helper does
 * not retry, generate replay identities, or fall back to legacy mutations.
 */
export async function invokeTaskStateCommand(
  intent: TaskStateCommandIntent,
  options: InvokeTaskStateCommandOptions = {},
): Promise<TaskStateCommandResponse> {
  const client = options.client === undefined ? createBrowserSupabaseClient() : options.client;
  if (!client) {
    return failure("client_unavailable", "The authenticated browser Supabase client is unavailable.");
  }

  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await client.functions.invoke<unknown>(TASK_STATE_COMMAND_FUNCTION, { body: intent }));
  } catch (caught) {
    const details = await functionErrorDetails(caught);
    return failure(failureKind(details.status, details.code), details.message, details);
  }

  if (error) {
    const details = await functionErrorDetails(error);
    return failure(failureKind(details.status, details.code), details.message, details);
  }

  if (!isObject(data)) {
    return failure("malformed_response", "The task-state-command response was not a JSON object.", { code: "MALFORMED_RESPONSE" });
  }

  try {
    const fields = resultFields(data);
    if (fields.state === "rejected") {
      return failure(
        "command_rejected",
        "Canonical Task State command was rejected.",
        { code: fields.conflict_code ?? "COMMAND_REJECTED" },
        fields,
      );
    }
    if (!fields.task_id) throw new Error("Committed Edge response is missing task_id.");
    return { ...fields, success: true, state: "committed", error: null };
  } catch (caught) {
    return failure(
      "malformed_response",
      caught instanceof Error ? caught.message : "The task-state-command response was malformed.",
      { code: "MALFORMED_RESPONSE" },
    );
  }
}

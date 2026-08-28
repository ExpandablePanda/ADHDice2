import { createBrowserSupabaseClient } from "@/lib/supabase";
import type {
  TaskStateCommandError,
  TaskStateCommandErrorKind,
  TaskStateCommandResponse,
  TaskStateCommandSideEffectIds,
  TaskStateCommandSuccess,
} from "@/lib/task-state-command-client";

const TASK_STATE_COMMAND_FUNCTION = "task-state-command";
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

type JsonObject = Record<string, unknown>;

export type HistoryOutcomeBatchEntryInput = {
  logical_date: string;
  occurrence_key?: string;
  scheduled_due_on?: string;
};

export type HistoryOutcomeBatchIntent = {
  type: "history_outcome_batch";
  task_id: string;
  replay_identity: string;
  expected_revision: number;
  outcome: "done" | "did_my_best" | "missed";
  entries: HistoryOutcomeBatchEntryInput[];
};

export type HistoryOutcomeBatchChildSuccess = TaskStateCommandSuccess & {
  index: number;
  logical_date: string;
  replay_identity: string;
};

export type HistoryOutcomeBatchChildFailure = {
  index: number;
  logical_date: string;
  replay_identity: string;
  expected_revision: number;
  success: false;
  state: "rejected" | null;
  response: TaskStateCommandResponse | null;
  error: TaskStateCommandError;
};

export type HistoryOutcomeBatchChildResult = HistoryOutcomeBatchChildSuccess | HistoryOutcomeBatchChildFailure;

export type HistoryOutcomeBatchAchievement = {
  status: "completed" | "inactive" | "failed" | "not_run";
  operation_id: string;
  error_code: string | null;
};

type HistoryOutcomeBatchBase = {
  task_id: string;
  batch_replay_identity: string;
  expected_revision: number;
  final_committed_revision: number;
  completed_entries: string[];
  failed_entry_index: number | null;
  child_results: HistoryOutcomeBatchChildResult[];
};

export type HistoryOutcomeBatchSuccess = HistoryOutcomeBatchBase & {
  success: true;
  state: "committed";
  achievement: HistoryOutcomeBatchAchievement;
  achievement_warning: string | null;
  error: null;
};

export type HistoryOutcomeBatchPartial = HistoryOutcomeBatchBase & {
  success: false;
  state: "partial";
  achievement: HistoryOutcomeBatchAchievement;
  achievement_warning: null;
  error: TaskStateCommandError;
};

export type HistoryOutcomeBatchInvocationFailure = {
  success: false;
  state: "unavailable";
  task_id: string;
  batch_replay_identity: string;
  expected_revision: number;
  final_committed_revision: number;
  completed_entries: [];
  failed_entry_index: number | null;
  child_results: [];
  achievement: HistoryOutcomeBatchAchievement;
  achievement_warning: null;
  error: TaskStateCommandError;
};

export type HistoryOutcomeBatchResponse = HistoryOutcomeBatchSuccess | HistoryOutcomeBatchPartial | HistoryOutcomeBatchInvocationFailure;

type BrowserSupabaseClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
export type HistoryOutcomeBatchClient = Pick<BrowserSupabaseClient, "functions">;

export type InvokeHistoryOutcomeBatchOptions = {
  /** Test seam only; normal callers reuse createBrowserSupabaseClient(). */
  client?: HistoryOutcomeBatchClient | null;
};

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(object: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function requiredString(object: JsonObject, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Batch response field \"${key}\" must be a non-empty string.`);
  return value;
}

function requiredInteger(object: JsonObject, key: string): number {
  const value = object[key];
  if (!Number.isInteger(value)) throw new Error(`Batch response field \"${key}\" must be an integer.`);
  return value as number;
}

function nullableInteger(object: JsonObject, key: string): number | null {
  if (!hasOwn(object, key)) return null;
  const value = object[key];
  if (value !== null && !Number.isInteger(value)) throw new Error(`Batch response field \"${key}\" must be an integer or null.`);
  return value as number | null;
}

function nullableString(object: JsonObject, key: string): string | null {
  if (!hasOwn(object, key)) return null;
  const value = object[key];
  if (value !== null && typeof value !== "string") throw new Error(`Batch response field \"${key}\" must be a string or null.`);
  return value as string | null;
}

function booleanField(object: JsonObject, key: string): boolean {
  if (typeof object[key] !== "boolean") throw new Error(`Batch response field \"${key}\" must be a boolean.`);
  return object[key] as boolean;
}

function objectField(object: JsonObject, key: string): JsonObject {
  if (!isObject(object[key])) throw new Error(`Batch response field \"${key}\" must be an object.`);
  return object[key];
}

function sideEffectIds(payload: JsonObject): TaskStateCommandSideEffectIds {
  const ids: TaskStateCommandSideEffectIds = {};
  for (const field of [
    "history_fact_id",
    "schedule_boundary_id",
    "occurrence_id",
    "effective_override_id",
    "calendar_override_id",
    "reward_entitlement_id",
  ] as const) {
    if (!hasOwn(payload, field)) continue;
    const value = payload[field];
    if (value !== null && typeof value !== "string") throw new Error(`Batch response field \"${field}\" must be a string or null.`);
    ids[field] = value as string | null;
  }
  return ids;
}

function canonicalChildSuccess(payload: unknown, metadata: { index: number; logical_date: string; replay_identity: string }): HistoryOutcomeBatchChildSuccess {
  const object = objectField({ payload }, "payload");
  if (object.state !== "committed") throw new Error("Batch child result was not committed.");
  const taskId = requiredString(object, "task_id");
  if (!hasOwn(object, "canonical_task_patch") || !hasOwn(object, "compatibility_projection")) {
    throw new Error("Batch child result is missing its canonical projection.");
  }
  return {
    ...metadata,
    success: true,
    state: "committed",
    task_id: taskId,
    command_id: requiredString(object, "command_id"),
    expected_revision: requiredInteger(object, "expected_revision"),
    next_revision: nullableInteger(object, "next_revision"),
    was_replayed: booleanField(object, "was_replayed"),
    conflict_code: nullableString(object, "conflict_code"),
    ...(object.no_action === true ? { no_action: true } : {}),
    canonical_task_patch: objectField(object, "canonical_task_patch"),
    compatibility_projection: objectField(object, "compatibility_projection"),
    side_effect_ids: sideEffectIds(object),
    ...(hasOwn(object, "task_row") ? { task_row: objectField(object, "task_row") } : {}),
    ...(hasOwn(object, "milestone_row") ? { milestone_row: objectField(object, "milestone_row") } : {}),
    ...(hasOwn(object, "created_transition") ? { created_transition: booleanField(object, "created_transition") } : {}),
    error: null,
  };
}

function invocationFailure(error: unknown, taskId: string, replayIdentity: string, expectedRevision: number): HistoryOutcomeBatchInvocationFailure {
  const record = isObject(error) ? error : null;
  const context = isObject(record?.context) ? record.context : null;
  const status = typeof context?.status === "number" ? context.status : null;
  const code = typeof record?.code === "string" ? record.code : null;
  const message = typeof record?.message === "string" ? record.message : "History outcome batch invocation failed.";
  return {
    success: false,
    state: "unavailable",
    task_id: taskId,
    batch_replay_identity: replayIdentity,
    expected_revision: expectedRevision,
    final_committed_revision: expectedRevision,
    completed_entries: [],
    failed_entry_index: null,
    child_results: [],
    achievement: { status: "not_run", operation_id: "", error_code: null },
    achievement_warning: null,
    error: {
      kind: status === 401 ? "authentication_failure" : "invocation_failure",
      message,
      code,
      status,
    },
  };
}

function batchError(message: string, code = "MALFORMED_RESPONSE"): HistoryOutcomeBatchInvocationFailure {
  return {
    success: false,
    state: "unavailable",
    task_id: "",
    batch_replay_identity: "",
    expected_revision: 0,
    final_committed_revision: 0,
    completed_entries: [],
    failed_entry_index: null,
    child_results: [],
    achievement: { status: "not_run", operation_id: "", error_code: null },
    achievement_warning: null,
    error: { kind: "malformed_response", message, code, status: null },
  };
}

function parseAchievement(value: unknown): HistoryOutcomeBatchAchievement {
  const object = isObject(value) ? value : null;
  const status = object?.status;
  if (status !== "completed" && status !== "inactive" && status !== "failed" && status !== "not_run") {
    throw new Error("Batch response achievement status is invalid.");
  }
  return {
    status,
    operation_id: typeof object?.operation_id === "string" ? object.operation_id : "",
    error_code: typeof object?.error_code === "string" ? object.error_code : null,
  };
}

function parseBatchResponse(value: unknown): HistoryOutcomeBatchResponse {
  const object = isObject(value) ? value : null;
  if (!object) throw new Error("The history outcome batch response was not a JSON object.");
  const taskId = requiredString(object, "task_id");
  const batchReplayIdentity = requiredString(object, "batch_replay_identity");
  const expectedRevision = requiredInteger(object, "expected_revision");
  const finalRevision = requiredInteger(object, "final_committed_revision");
  const completedEntries = object.completed_entries;
  if (!Array.isArray(completedEntries) || completedEntries.some((date) => typeof date !== "string" || !DATE_KEY.test(date))) {
    throw new Error("Batch response completed_entries is invalid.");
  }
  const failedEntryIndexValue = object.failed_entry_index;
  if (failedEntryIndexValue !== null && !Number.isInteger(failedEntryIndexValue)) throw new Error("Batch response failed_entry_index is invalid.");
  const failedEntryIndex = failedEntryIndexValue as number | null;
  const rawChildren = object.child_results;
  if (!Array.isArray(rawChildren)) throw new Error("Batch response child_results is invalid.");
  const childResults: HistoryOutcomeBatchChildResult[] = rawChildren.map((rawChild) => {
    const child = isObject(rawChild) ? rawChild : null;
    if (!child) throw new Error("Batch child result is invalid.");
    const index = requiredInteger(child, "index");
    const logicalDate = requiredString(child, "logical_date");
    if (!DATE_KEY.test(logicalDate)) throw new Error("Batch child logical_date is invalid.");
    const replayIdentity = requiredString(child, "replay_identity");
    if (child.state === "committed") return canonicalChildSuccess(child.result, { index, logical_date: logicalDate, replay_identity: replayIdentity });
    if (child.state !== "rejected") throw new Error("Batch child state is invalid.");
    const errorObject = objectField(child, "error");
    const kind = errorObject.kind;
    if (kind !== "command_rejected" && kind !== "invocation_failure" && kind !== "malformed_response" && kind !== "authentication_failure" && kind !== "client_unavailable") {
      throw new Error("Batch child error kind is invalid.");
    }
    return {
      index,
      logical_date: logicalDate,
      replay_identity: replayIdentity,
      expected_revision: requiredInteger(child, "expected_revision"),
      success: false,
      state: "rejected",
      response: null,
      error: {
        kind: kind as TaskStateCommandErrorKind,
        message: requiredString(errorObject, "message"),
        code: nullableString(errorObject, "code"),
        status: nullableInteger(errorObject, "status"),
      },
    };
  });
  const achievement = parseAchievement(object.achievement);
  if (object.state === "committed") {
    if (object.achievement_warning !== null && typeof object.achievement_warning !== "string") throw new Error("Batch achievement warning is invalid.");
    return {
      success: true,
      state: "committed",
      task_id: taskId,
      batch_replay_identity: batchReplayIdentity,
      expected_revision: expectedRevision,
      final_committed_revision: finalRevision,
      completed_entries: completedEntries,
      failed_entry_index: null,
      child_results: childResults,
      achievement,
      achievement_warning: object.achievement_warning as string | null,
      error: null,
    };
  }
  if (object.state !== "partial") throw new Error("Batch response state is invalid.");
  const errorObject = objectField(object, "error");
  const kind = errorObject.kind;
  if (kind !== "command_rejected" && kind !== "invocation_failure" && kind !== "malformed_response" && kind !== "authentication_failure" && kind !== "client_unavailable") {
    throw new Error("Batch error kind is invalid.");
  }
  return {
    success: false,
    state: "partial",
    task_id: taskId,
    batch_replay_identity: batchReplayIdentity,
    expected_revision: expectedRevision,
    final_committed_revision: finalRevision,
    completed_entries: completedEntries,
    failed_entry_index: failedEntryIndex,
    child_results: childResults,
    achievement,
    achievement_warning: null,
    error: {
      kind: kind as TaskStateCommandErrorKind,
      message: requiredString(errorObject, "message"),
      code: nullableString(errorObject, "code"),
      status: nullableInteger(errorObject, "status"),
    },
  };
}

export async function invokeHistoryOutcomeBatch(
  intent: HistoryOutcomeBatchIntent,
  options: InvokeHistoryOutcomeBatchOptions = {},
): Promise<HistoryOutcomeBatchResponse> {
  const client = options.client === undefined ? createBrowserSupabaseClient() : options.client;
  if (!client) return invocationFailure({ message: "The authenticated browser Supabase client is unavailable." }, intent.task_id, intent.replay_identity, intent.expected_revision);
  try {
    const { data, error } = await client.functions.invoke<unknown>(TASK_STATE_COMMAND_FUNCTION, { body: intent });
    if (error) return invocationFailure(error, intent.task_id, intent.replay_identity, intent.expected_revision);
    try {
      return parseBatchResponse(data);
    } catch (error) {
      return {
        ...batchError(error instanceof Error ? error.message : "The history outcome batch response was malformed."),
        task_id: intent.task_id,
        batch_replay_identity: intent.replay_identity,
        expected_revision: intent.expected_revision,
        final_committed_revision: intent.expected_revision,
      };
    }
  } catch (error) {
    return invocationFailure(error, intent.task_id, intent.replay_identity, intent.expected_revision);
  }
}

import type { Task } from "@/lib/database.types";
import type {
  CanonicalContainerState,
  CanonicalEntityKind,
  CanonicalPriorContainerState,
  CanonicalPriorContainerStateStatus,
  CanonicalTaskStateColumns,
  CanonicalTerminalState,
  CanonicalWorkflowState,
} from "@/lib/task-state-canonical/types";
import {
  invokeTaskStateCommand,
  type TaskStateCommandFailure,
  type TaskStateCommandIntent,
  type TaskStateCommandResponse,
  type TaskStateCommandSuccess,
} from "@/lib/task-state-command-client";
import {
  invokeHistoryOutcomeBatch,
  type HistoryOutcomeBatchEntryInput,
  type HistoryOutcomeBatchIntent,
  type HistoryOutcomeBatchResponse,
  type HistoryOutcomeBatchSuccess,
} from "@/lib/task-history-outcome-batch-client";
import { classifyTaskStateRuntimeAction, type TaskStateRuntimeAction } from "@/lib/task-state-runtime-actions";

export type TaskStateRuntimeCanonicalAction = Extract<TaskStateRuntimeAction, { kind: "canonical_action" }>;
export type TaskStateRuntimeLocalTask = Task
  & Pick<CanonicalTaskStateColumns, "canonical_revision">
  & Partial<Omit<CanonicalTaskStateColumns, "canonical_revision">>;

export type TaskStateRuntimeExecutorError = {
  kind: "authentication_failure" | "client_unavailable" | "command_rejected" | "invocation_failure" | "malformed_response";
  message: string;
  code: string | null;
  status: number | null;
};

export type TaskStateRuntimeExecutionResult =
  | {
      success: true;
      task: TaskStateRuntimeLocalTask;
      response: TaskStateCommandSuccess;
    }
  | {
      success: false;
      task: null;
      response: TaskStateCommandResponse | null;
      error: TaskStateRuntimeExecutorError;
    };

export type TaskStateRuntimeExecutorOptions = {
  /** Test seam; production uses the existing browser command client. */
  invoke?: (intent: TaskStateCommandIntent) => Promise<TaskStateCommandResponse>;
};

export type TaskHistoryOutcomeBatchExecutorInput = {
  task: TaskStateRuntimeLocalTask;
  replayIdentity: string;
  outcome: "done" | "did_my_best" | "missed";
  entries: HistoryOutcomeBatchEntryInput[];
  invoke?: (intent: HistoryOutcomeBatchIntent) => Promise<HistoryOutcomeBatchResponse>;
};

export type TaskHistoryOutcomeBatchCommittedChild = {
  logicalDate: string;
  previousTask: TaskStateRuntimeLocalTask;
  task: TaskStateRuntimeLocalTask;
  response: TaskStateCommandSuccess;
};

export type TaskHistoryOutcomeBatchExecutionResult =
  | {
      success: true;
      task: TaskStateRuntimeLocalTask;
      response: HistoryOutcomeBatchSuccess;
      completedChildren: TaskHistoryOutcomeBatchCommittedChild[];
      achievementWarning: string | null;
    }
  | {
      success: false;
      task: TaskStateRuntimeLocalTask | null;
      response: HistoryOutcomeBatchResponse;
      completedChildren: TaskHistoryOutcomeBatchCommittedChild[];
      error: TaskStateRuntimeExecutorError;
    };

const TASK_STATUS_VALUES = new Set<Task["status"]>([
  "pending",
  "in_progress",
  "done",
  "missed",
  "did_my_best",
  "upcoming",
  "not_due",
  "delayed",
  "archived",
  "trashed",
  "complete",
]);
const CANONICALIZATION_STATUS_VALUES = new Set<NonNullable<CanonicalTaskStateColumns["canonicalization_status"]>>([
  "legacy_uninitialized",
  "canonical_proven",
  "canonical_runtime",
  "needs_attention",
]);
const ENTITY_KIND_VALUES = new Set<CanonicalEntityKind>(["parent", "step", "substep"]);
const TERMINAL_STATE_VALUES = new Set<CanonicalTerminalState>(["active", "permanently_complete"]);
const CONTAINER_STATE_VALUES = new Set<CanonicalContainerState>(["active", "archived", "trashed"]);
const PRIOR_CONTAINER_STATE_VALUES = new Set<NonNullable<CanonicalPriorContainerState>>(["active", "archived"]);
const PRIOR_CONTAINER_STATE_STATUS_VALUES = new Set<CanonicalPriorContainerStateStatus>([
  "not_applicable",
  "proven",
  "unknown",
  "contradictory",
]);
const WORKFLOW_STATE_VALUES = new Set<CanonicalWorkflowState>(["none", "in_progress"]);
const CANONICAL_PATCH_FIELDS = [
  "canonicalization_status",
  "entity_kind",
  "terminal_state",
  "container_state",
  "prior_container_state",
  "prior_container_state_status",
  "terminal_completed_at",
  "container_trashed_at",
  "workflow_state",
  "workflow_started_at",
  "workflow_logical_date",
  "workflow_occurrence_id",
  "workflow_command_id",
  "workflow_revision",
  "canonical_created_at",
  "canonical_updated_at",
  "projection_source_canonical_revision",
  "projection_source_fingerprint",
  "projection_version",
] as const satisfies readonly (keyof CanonicalTaskStateColumns)[];
const STALE_CONFLICT_CODES = new Set([
  "STALE_REVISION",
  "STALE_BOUNDARY_SEQUENCE",
  "STALE_OCCURRENCE_REVISION",
  "STALE_FACTS_FINGERPRINT",
]);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(object: JsonObject, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function malformed(message: string, response: TaskStateCommandResponse | null = null): TaskStateRuntimeExecutionResult {
  return {
    success: false,
    task: null,
    response,
    error: {
      kind: "malformed_response",
      message,
      code: "MALFORMED_RESPONSE",
      status: null,
    },
  };
}

function thrownInvocation(error: unknown): TaskStateRuntimeExecutionResult {
  return {
    success: false,
    task: null,
    response: null,
    error: {
      kind: "invocation_failure",
      message: error instanceof Error ? error.message : "Canonical Task State command invocation failed.",
      code: null,
      status: null,
    },
  };
}

function commandFailure(response: TaskStateCommandFailure): TaskStateRuntimeExecutionResult {
  const code = response.error.code ?? response.conflict_code;
  const staleConflict = response.error.kind === "command_rejected" && code !== null && STALE_CONFLICT_CODES.has(code);
  return {
    success: false,
    task: null,
    response,
    error: {
      kind: response.error.kind,
      message: staleConflict
        ? "This task changed before the canonical action could be committed. Refresh the task and try again."
        : response.error.message,
      code,
      status: response.error.status,
    },
  };
}

function requiredNullableString(object: JsonObject, key: string): string | null {
  if (!hasOwn(object, key)) throw new Error(`Committed response is missing ${key}.`);
  const value = object[key];
  if (value !== null && typeof value !== "string") throw new Error(`Committed response field ${key} must be a string or null.`);
  return value;
}

function requiredString(object: JsonObject, key: string): string {
  if (!hasOwn(object, key) || typeof object[key] !== "string" || object[key].length === 0) {
    throw new Error(`Committed response field ${key} must be a non-empty string.`);
  }
  return object[key] as string;
}

function requiredInteger(object: JsonObject, key: string): number {
  if (!hasOwn(object, key) || !Number.isInteger(object[key])) {
    throw new Error(`Committed response field ${key} must be an integer.`);
  }
  return object[key] as number;
}

function validateNullableEnum<T extends string>(object: JsonObject, key: string, values: ReadonlySet<T>) {
  if (!hasOwn(object, key)) return;
  const value = object[key];
  if (value !== null && (typeof value !== "string" || !values.has(value as T))) {
    throw new Error(`Committed response field ${key} contains an invalid enum value.`);
  }
}

function validateWorkflowPatch(action: TaskStateRuntimeCanonicalAction, patch: JsonObject) {
  const workflowState = requiredString(patch, "workflow_state");
  if (workflowState !== (action.actionType === "start_in_progress" ? "in_progress" : action.actionType === "clear_in_progress" ? "none" : workflowState)) {
    throw new Error("Committed response returned an unexpected workflow_state.");
  }
  const workflowStartedAt = requiredNullableString(patch, "workflow_started_at");
  const workflowLogicalDate = requiredNullableString(patch, "workflow_logical_date");
  requiredNullableString(patch, "workflow_occurrence_id");
  const workflowCommandId = requiredNullableString(patch, "workflow_command_id");
  const workflowRevision = requiredInteger(patch, "workflow_revision");
  const canonicalizationStatus = requiredString(patch, "canonicalization_status");
  if (!CANONICALIZATION_STATUS_VALUES.has(canonicalizationStatus as NonNullable<CanonicalTaskStateColumns["canonicalization_status"]>)) {
    throw new Error("Committed response returned an unknown canonicalization_status.");
  }
  if (action.actionType === "start_in_progress" && (!workflowStartedAt || !workflowLogicalDate || !workflowCommandId)) {
    throw new Error("Committed workflow start response is missing authoritative workflow data.");
  }
  if (action.actionType === "clear_in_progress" && (workflowStartedAt !== null || workflowLogicalDate !== null || workflowCommandId !== null)) {
    throw new Error("Committed workflow clear response returned stale workflow data.");
  }
  return { workflowRevision };
}

function validateCanonicalPatch(
  action: TaskStateRuntimeCanonicalAction,
  patch: JsonObject,
): Partial<CanonicalTaskStateColumns> {
  const workflow = action.actionType === "start_in_progress" || action.actionType === "clear_in_progress"
    ? validateWorkflowPatch(action, patch)
    : null;
  const result: Partial<CanonicalTaskStateColumns> = {};
  for (const field of CANONICAL_PATCH_FIELDS) {
    if (!hasOwn(patch, field)) continue;
    const value = patch[field];
    if (field === "entity_kind") {
      validateNullableEnum(patch, field, ENTITY_KIND_VALUES);
    } else if (field === "terminal_state") {
      validateNullableEnum(patch, field, TERMINAL_STATE_VALUES);
    } else if (field === "container_state") {
      validateNullableEnum(patch, field, CONTAINER_STATE_VALUES);
    } else if (field === "prior_container_state") {
      validateNullableEnum(patch, field, PRIOR_CONTAINER_STATE_VALUES);
    } else if (field === "prior_container_state_status") {
      validateNullableEnum(patch, field, PRIOR_CONTAINER_STATE_STATUS_VALUES);
    } else if (field === "workflow_state") {
      validateNullableEnum(patch, field, WORKFLOW_STATE_VALUES);
    } else if (field === "workflow_revision" || field === "projection_source_canonical_revision") {
      if (!Number.isInteger(value)) throw new Error(`Committed response field ${field} must be an integer.`);
    } else if (field === "canonicalization_status") {
      if (typeof value !== "string" || !CANONICALIZATION_STATUS_VALUES.has(value as NonNullable<CanonicalTaskStateColumns["canonicalization_status"]>)) {
        throw new Error(`Committed response field ${field} is invalid.`);
      }
    } else if (value !== null && typeof value !== "string") {
      throw new Error(`Committed response field ${field} must be a string or null.`);
    }
    (result as Record<string, unknown>)[field] = value;
  }
  if (workflow && result.workflow_revision !== workflow.workflowRevision) {
    throw new Error("Committed response workflow_revision was not internally consistent.");
  }
  return result;
}

function reconcileProjection(projection: JsonObject): Pick<Task, "status" | "due_on" | "completed_at" | "active_status_logical_date" | "active_occurrence_due_on"> {
  if (!hasOwn(projection, "status") || !TASK_STATUS_VALUES.has(projection.status as Task["status"])) {
    throw new Error("Committed response is missing a valid compatibility status.");
  }
  return {
    status: projection.status as Task["status"],
    due_on: requiredNullableString(projection, "due_on"),
    completed_at: requiredNullableString(projection, "completed_at"),
    active_status_logical_date: requiredNullableString(projection, "active_status_logical_date"),
    active_occurrence_due_on: requiredNullableString(projection, "active_occurrence_due_on"),
  };
}

export function reconcileCommittedTask(
  action: TaskStateRuntimeCanonicalAction,
  task: TaskStateRuntimeLocalTask,
  response: TaskStateCommandSuccess,
): TaskStateRuntimeLocalTask {
  if (response.task_id !== task.id) throw new Error("Committed response task_id does not match the requested Task.");
  if (response.expected_revision !== action.expectedRevision) throw new Error("Committed response expected_revision does not match the classified action.");
  const nextRevision = response.next_revision;
  if (response.no_action) {
    if (nextRevision !== action.expectedRevision) {
      throw new Error("Semantic no-op response must preserve canonical_revision.");
    }
  } else if (typeof nextRevision !== "number" || !Number.isInteger(nextRevision) || nextRevision < 1 || nextRevision <= action.expectedRevision) {
    throw new Error("Committed response next_revision is not a valid successor revision.");
  }
  const committedRevision = response.no_action ? action.expectedRevision : nextRevision;
  if (!isObject(response.canonical_task_patch)) throw new Error("Committed response is missing canonical_task_patch.");
  if (!isObject(response.compatibility_projection)) throw new Error("Committed response is missing compatibility_projection.");

  const canonicalPatch = validateCanonicalPatch(action, response.canonical_task_patch);
  const projection = reconcileProjection(response.compatibility_projection);
  return {
    ...task,
    ...canonicalPatch,
    ...projection,
    // The canonical command response is the only source for this revision.
    canonical_revision: committedRevision,
  };
}

function batchFailureError(response: HistoryOutcomeBatchResponse): TaskStateRuntimeExecutorError {
  if (response.success) {
    return {
      kind: "malformed_response",
      message: "The History batch response did not contain a failure reason.",
      code: "MALFORMED_RESPONSE",
      status: null,
    };
  }
  return {
    kind: response.error.kind,
    message: response.error.message,
    code: response.error.code,
    status: response.error.status,
  };
}

export async function executeTaskHistoryOutcomeBatch(
  input: TaskHistoryOutcomeBatchExecutorInput,
): Promise<TaskHistoryOutcomeBatchExecutionResult> {
  const expectedRevision = input.task.canonical_revision;
  if (typeof expectedRevision !== "number" || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
    const error = {
      kind: "malformed_response" as const,
      message: "Canonical History batch requires a valid task.canonical_revision.",
      code: "MALFORMED_RESPONSE",
      status: null,
    };
    return {
      success: false,
      task: null,
      response: {
        success: false,
        state: "unavailable",
        task_id: input.task.id,
        batch_replay_identity: input.replayIdentity,
        expected_revision: expectedRevision ?? 0,
        final_committed_revision: expectedRevision ?? 0,
        completed_entries: [],
        failed_entry_index: null,
        child_results: [],
        achievement: { status: "not_run", operation_id: "", error_code: null },
        achievement_warning: null,
        error,
      },
      completedChildren: [],
      error,
    };
  }
  const validExpectedRevision = expectedRevision;
  const intent: HistoryOutcomeBatchIntent = {
    type: "history_outcome_batch",
    task_id: input.task.id,
    replay_identity: input.replayIdentity,
    expected_revision: validExpectedRevision,
    outcome: input.outcome,
    entries: input.entries,
  };
  let response: HistoryOutcomeBatchResponse;
  try {
    response = await (input.invoke ?? invokeHistoryOutcomeBatch)(intent);
  } catch (error) {
    return {
      success: false,
      task: null,
      response: {
        success: false,
        state: "unavailable",
        task_id: input.task.id,
        batch_replay_identity: input.replayIdentity,
        expected_revision: validExpectedRevision,
        final_committed_revision: validExpectedRevision,
        completed_entries: [],
        failed_entry_index: null,
        child_results: [],
        achievement: { status: "not_run", operation_id: "", error_code: null },
        achievement_warning: null,
        error: {
          kind: "invocation_failure",
          message: error instanceof Error ? error.message : "History outcome batch invocation failed.",
          code: null,
          status: null,
        },
      },
      completedChildren: [],
      error: {
        kind: "invocation_failure",
        message: error instanceof Error ? error.message : "History outcome batch invocation failed.",
        code: null,
        status: null,
      },
    };
  }

  let currentTask = input.task;
  const completedChildren: TaskHistoryOutcomeBatchCommittedChild[] = [];
  try {
    for (const child of response.child_results) {
      if (!child.success) break;
      const action = classifyTaskStateRuntimeAction({
        canonicalIntent: {
          type: "set_outcome",
          outcome: input.outcome,
          logical_date: child.logical_date,
        },
        replayIdentity: child.replay_identity,
        task: currentTask,
      });
      if (action.kind !== "canonical_action") {
        throw new Error(action.kind === "unsupported_state_mutation" ? action.reason : "The canonical History batch action could not be classified.");
      }
      const previousTask = currentTask;
      currentTask = reconcileCommittedTask(action, currentTask, child);
      completedChildren.push({
        logicalDate: child.logical_date,
        previousTask,
        task: currentTask,
        response: child,
      });
    }
    if (response.success) {
      if (completedChildren.length !== input.entries.length || response.final_committed_revision !== currentTask.canonical_revision) {
        throw new Error("The committed History batch did not return every canonical child revision.");
      }
      return {
        success: true,
        task: currentTask,
        response,
        completedChildren,
        achievementWarning: response.achievement_warning,
      };
    }
  } catch (error) {
    return {
      success: false,
      task: completedChildren.length > 0 ? currentTask : null,
      response,
      completedChildren,
      error: {
        kind: "malformed_response",
        message: error instanceof Error ? error.message : "The History batch response was malformed.",
        code: "MALFORMED_RESPONSE",
        status: null,
      },
    };
  }

  return {
    success: false,
    task: completedChildren.length > 0 ? currentTask : null,
    response,
    completedChildren,
    error: batchFailureError(response),
  };
}

/**
 * Executes one already-classified canonical action. This is deliberately a
 * response-driven adapter: it does not plan, retry, or write through legacy
 * Task/History/reward paths.
 */
export async function executeTaskStateRuntimeAction(
  action: TaskStateRuntimeCanonicalAction,
  task: TaskStateRuntimeLocalTask,
  options: TaskStateRuntimeExecutorOptions = {},
): Promise<TaskStateRuntimeExecutionResult> {
  const intent = action.intent;
  if (!intent
    || intent.task_id !== task.id
    || typeof intent.replay_identity !== "string"
    || intent.replay_identity.trim().length === 0
    || intent.expected_revision !== action.expectedRevision) {
    return malformed("Canonical runtime action is missing a concrete, identity-preserving intent.");
  }

  let response: TaskStateCommandResponse;
  try {
    response = await (options.invoke ?? invokeTaskStateCommand)(intent);
  } catch (error) {
    return thrownInvocation(error);
  }
  if (!response || (typeof response !== "object") || typeof response.success !== "boolean") {
    return malformed("The canonical command executor returned a malformed response.");
  }
  if (!response.success) {
    if (!isObject(response.error) || typeof response.error.kind !== "string" || typeof response.error.message !== "string") {
      return malformed("The canonical command executor returned a malformed failure response.", response);
    }
    return commandFailure(response);
  }

  try {
    return {
      success: true,
      task: reconcileCommittedTask(action, task, response),
      response,
    };
  } catch (error) {
    return malformed(error instanceof Error ? error.message : "Committed canonical response was malformed.", response);
  }
}

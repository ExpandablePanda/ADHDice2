import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task, TaskInsert, TaskUpdate } from "@/lib/database.types";
import type { CanonicalTaskRow } from "@/lib/task-state-canonical/read-model";

type TaskUpdateField = Exclude<keyof TaskUpdate, "revision">;

export type TaskRowUpdateOptions = {
  expectedTask?: Task | null;
};

export type TaskRowDeleteOptions = {
  expectedTask?: Task | null;
};

export type TaskRowUpdateConflictReason =
  | "high_risk_patch"
  | "same_field_changed_remotely"
  | "stale_revision_race"
  | "task_missing";

export type TaskRowUpdateConflict = {
  conflictingFields: TaskUpdateField[];
  latestTask: Task | null;
  reason: TaskRowUpdateConflictReason;
  attemptedReapply: boolean;
};

export type UpdateTaskRowResult = {
  data: Task | null;
  error: { message: string } | null;
  conflict: TaskRowUpdateConflict | null;
  reappliedOnLatestRevision: boolean;
  usedActualSecondsFallback: boolean;
  usedEnergyFallback: boolean;
};

export type DeleteTaskRowResult = {
  data: Task | null;
  error: { message: string } | null;
  conflict: TaskRowUpdateConflict | null;
};

export type CanonicalTaskCreationSource = "task_creation" | "task_import";

export type CanonicalTaskCreationResult = {
  data: CanonicalTaskRow | null;
  error: { message: string } | null;
  usedEnergyFallback: boolean;
  usedActualSecondsFallback: false;
};

export type CanonicalTaskCreator = (
  payload: TaskInsert,
  source?: CanonicalTaskCreationSource,
) => Promise<CanonicalTaskCreationResult>;

const HIGH_RISK_TASK_UPDATE_FIELDS: TaskUpdateField[] = [
  "actual_seconds",
  "completed_at",
  "due_on",
  "due_time",
  "parent_task_id",
  "repeat_day_of_month",
  "repeat_days_of_week",
  "repeat_frequency",
  "repeat_interval",
  "repeat_monthly_mode",
  "repeat_monthly_ordinal",
  "repeat_monthly_weekday",
  "scheduled_on",
  "status",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function creationErrorMessage(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : fallback;
}

function canonicalTaskFromResponse(value: unknown): CanonicalTaskRow | null {
  if (!isRecord(value) || !isRecord(value.task)) return null;
  const task = value.task;
  if (
    typeof task.id !== "string"
    || typeof task.user_id !== "string"
    || task.revision !== 1
    || task.canonicalization_status !== "canonical_runtime"
    || task.canonical_revision !== 1
    || !["parent", "step", "substep"].includes(String(task.entity_kind))
    || !["active", "permanently_complete"].includes(String(task.terminal_state))
    || !["active", "archived", "trashed"].includes(String(task.container_state))
    || task.prior_container_state !== null
    || task.prior_container_state_status !== "not_applicable"
    || !["none", "in_progress"].includes(String(task.workflow_state))
    || task.workflow_revision !== 1
    || typeof task.canonical_created_at !== "string"
    || typeof task.canonical_updated_at !== "string"
  ) {
    return null;
  }
  return task as unknown as CanonicalTaskRow;
}

/**
 * Browser creation intent only. The owner, canonical fields, and transaction
 * are derived by the authenticated trusted creator; this helper never writes
 * the Task table directly.
 */
export async function insertTaskRowWithCanonicalCreation(
  client: SupabaseClient,
  payload: TaskInsert,
  source: CanonicalTaskCreationSource = "task_creation",
): Promise<CanonicalTaskCreationResult> {
  const task = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== "id" && key !== "revision" && key !== "user_id"),
  ) as Omit<TaskInsert, "user_id" | "id" | "revision">;
  let response: { data: unknown; error: unknown };
  try {
    response = await client.functions.invoke<unknown>("task-create-canonical", {
      body: { source, task },
    });
  } catch (error) {
    return {
      data: null,
      error: { message: creationErrorMessage(error, "Canonical Task creation could not be invoked.") },
      usedEnergyFallback: false,
      usedActualSecondsFallback: false,
    };
  }

  if (response.error) {
    return {
      data: null,
      error: { message: creationErrorMessage(response.error, "Canonical Task creation failed.") },
      usedEnergyFallback: false,
      usedActualSecondsFallback: false,
    };
  }

  const data = canonicalTaskFromResponse(response.data);
  if (!data) {
    return {
      data: null,
      error: { message: "Canonical Task creation returned an unusable Task row." },
      usedEnergyFallback: false,
      usedActualSecondsFallback: false,
    };
  }

  return {
    data,
    error: null,
    usedEnergyFallback: isRecord(response.data) && response.data.used_energy_fallback === true,
    usedActualSecondsFallback: false,
  };
}

export async function updateTaskRowWithLegacyEnergyFallback(
  client: SupabaseClient,
  taskId: string,
  values: TaskUpdate,
  isMissingTaskActualSecondsColumnError: (message: string) => boolean,
  isMissingTaskEnergyNoneEnumError: (message: string) => boolean,
  options?: TaskRowUpdateOptions,
): Promise<UpdateTaskRowResult> {
  const expectedTask = options?.expectedTask ?? null;
  const expectedRevision = typeof expectedTask?.revision === "number" ? expectedTask.revision : undefined;
  const initialResult = await runTaskUpdateAttempt(
    client,
    taskId,
    values,
    expectedRevision,
    isMissingTaskActualSecondsColumnError,
    isMissingTaskEnergyNoneEnumError,
  );

  if (initialResult.error || initialResult.data || expectedRevision === undefined || !expectedTask) {
    return {
      ...initialResult,
      conflict: null,
      reappliedOnLatestRevision: false,
    };
  }

  const latestTaskResult = await fetchLatestTaskRow(client, taskId);
  if (latestTaskResult.error) {
    return {
      data: null,
      error: latestTaskResult.error,
      conflict: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: initialResult.usedActualSecondsFallback,
      usedEnergyFallback: initialResult.usedEnergyFallback,
    };
  }

  const latestTask = latestTaskResult.data;
  if (!latestTask) {
    return {
      data: null,
      error: null,
      conflict: {
        attemptedReapply: false,
        conflictingFields: [],
        latestTask: null,
        reason: "task_missing",
      },
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: initialResult.usedActualSecondsFallback,
      usedEnergyFallback: initialResult.usedEnergyFallback,
    };
  }

  if (taskUpdateAlreadyApplied(latestTask, values)) {
    return {
      data: latestTask,
      error: null,
      conflict: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: initialResult.usedActualSecondsFallback,
      usedEnergyFallback: initialResult.usedEnergyFallback,
    };
  }

  const reapplyPlan = analyzeTaskUpdateReapplySafety(expectedTask, latestTask, values);
  if (!reapplyPlan.canAutoReapply) {
    return {
      data: null,
      error: null,
      conflict: {
        attemptedReapply: false,
        conflictingFields: reapplyPlan.conflictingFields,
        latestTask,
        reason: reapplyPlan.reason,
      },
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: initialResult.usedActualSecondsFallback,
      usedEnergyFallback: initialResult.usedEnergyFallback,
    };
  }

  const retryResult = await runTaskUpdateAttempt(
    client,
    taskId,
    values,
    latestTask.revision,
    isMissingTaskActualSecondsColumnError,
    isMissingTaskEnergyNoneEnumError,
  );

  if (retryResult.error || retryResult.data) {
    return {
      ...retryResult,
      conflict: null,
      reappliedOnLatestRevision: Boolean(retryResult.data),
      usedActualSecondsFallback: initialResult.usedActualSecondsFallback || retryResult.usedActualSecondsFallback,
      usedEnergyFallback: initialResult.usedEnergyFallback || retryResult.usedEnergyFallback,
    };
  }

  const latestAfterRetryResult = await fetchLatestTaskRow(client, taskId);
  if (latestAfterRetryResult.error) {
    return {
      data: null,
      error: latestAfterRetryResult.error,
      conflict: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: initialResult.usedActualSecondsFallback || retryResult.usedActualSecondsFallback,
      usedEnergyFallback: initialResult.usedEnergyFallback || retryResult.usedEnergyFallback,
    };
  }

  return {
    data: null,
    error: null,
    conflict: {
      attemptedReapply: true,
      conflictingFields: getTaskUpdateFields(values),
      latestTask: latestAfterRetryResult.data,
      reason: latestAfterRetryResult.data ? "stale_revision_race" : "task_missing",
    },
    reappliedOnLatestRevision: false,
    usedActualSecondsFallback: initialResult.usedActualSecondsFallback || retryResult.usedActualSecondsFallback,
    usedEnergyFallback: initialResult.usedEnergyFallback || retryResult.usedEnergyFallback,
  };
}

export async function deleteTaskRow(
  client: SupabaseClient,
  taskId: string,
  options?: TaskRowDeleteOptions,
): Promise<DeleteTaskRowResult> {
  const expectedTask = options?.expectedTask ?? null;
  const expectedRevision = typeof expectedTask?.revision === "number" ? expectedTask.revision : undefined;

  let query = client
    .from("adhdice_clean_tasks")
    .delete()
    .eq("id", taskId);

  if (expectedRevision !== undefined) {
    query = query.eq("revision", expectedRevision);
  }

  const deleteResult = await query
    .select("*")
    .maybeSingle();

  if (deleteResult.error) {
    return {
      data: null,
      error: deleteResult.error,
      conflict: null,
    };
  }

  if (deleteResult.data) {
    return {
      data: deleteResult.data,
      error: null,
      conflict: null,
    };
  }

  if (expectedRevision === undefined) {
    return {
      data: null,
      error: null,
      conflict: null,
    };
  }

  const latestTaskResult = await fetchLatestTaskRow(client, taskId);
  if (latestTaskResult.error) {
    return {
      data: null,
      error: latestTaskResult.error,
      conflict: null,
    };
  }

  if (!latestTaskResult.data) {
    return {
      data: null,
      error: null,
      conflict: {
        attemptedReapply: false,
        conflictingFields: [],
        latestTask: null,
        reason: "task_missing",
      },
    };
  }

  return {
    data: null,
    error: null,
    conflict: {
      attemptedReapply: false,
      conflictingFields: [],
      latestTask: latestTaskResult.data,
      reason: "stale_revision_race",
    },
  };
}

export function analyzeTaskUpdateReapplySafety(
  expectedTask: Task,
  latestTask: Task,
  values: TaskUpdate,
): {
  canAutoReapply: boolean;
  conflictingFields: TaskUpdateField[];
  reason: Exclude<TaskRowUpdateConflictReason, "stale_revision_race" | "task_missing">;
} {
  const updatedFields = getTaskUpdateFields(values);
  const highRiskFields = updatedFields.filter((field) => HIGH_RISK_TASK_UPDATE_FIELDS.includes(field));
  if (highRiskFields.length > 0) {
    return {
      canAutoReapply: false,
      conflictingFields: highRiskFields,
      reason: "high_risk_patch",
    };
  }

  const conflictingFields = updatedFields.filter((field) => !taskFieldValueEquals(expectedTask[field], latestTask[field]));
  if (conflictingFields.length > 0) {
    return {
      canAutoReapply: false,
      conflictingFields,
      reason: "same_field_changed_remotely",
    };
  }

  return {
    canAutoReapply: true,
    conflictingFields: [],
    reason: "same_field_changed_remotely",
  };
}

export function buildTaskUpdateConflictMessage(conflict: TaskRowUpdateConflict) {
  if (conflict.reason === "task_missing") {
    return "This task changed in the cloud and the latest row could not be found. Reload before trying again.";
  }

  if (conflict.reason === "high_risk_patch") {
    return "This task changed in the cloud while you were editing higher-risk fields, so ADHDice refreshed the latest row instead of overwriting it.";
  }

  if (conflict.reason === "same_field_changed_remotely") {
    return "This task changed in the cloud on the same field you edited, so ADHDice refreshed the latest row instead of overwriting it.";
  }

  return "This task changed again in the cloud before your save finished, so ADHDice refreshed the latest row instead of overwriting it.";
}

async function runTaskUpdateAttempt(
  client: SupabaseClient,
  taskId: string,
  values: TaskUpdate,
  expectedRevision: number | undefined,
  isMissingTaskActualSecondsColumnError: (message: string) => boolean,
  isMissingTaskEnergyNoneEnumError: (message: string) => boolean,
): Promise<Omit<UpdateTaskRowResult, "conflict" | "reappliedOnLatestRevision">> {
  let nextValues = buildTaskUpdatePayload(values, expectedRevision);
  let usedActualSecondsFallback = false;
  let usedEnergyFallback = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let query = client
      .from("adhdice_clean_tasks")
      .update(nextValues)
      .eq("id", taskId);

    if (expectedRevision !== undefined) {
      query = query.eq("revision", expectedRevision);
    }

    const result = await query
      .select("*")
      .maybeSingle();

    if (!result.error) {
      return {
        data: result.data,
        error: null,
        usedActualSecondsFallback,
        usedEnergyFallback,
      };
    }

    if (nextValues.actual_seconds !== undefined && isMissingTaskActualSecondsColumnError(result.error.message)) {
      const { actual_seconds: _actualSeconds, ...fallbackValues } = nextValues;
      nextValues = fallbackValues;
      usedActualSecondsFallback = true;
      continue;
    }

    if (nextValues.energy === "none" && isMissingTaskEnergyNoneEnumError(result.error.message)) {
      nextValues = {
        ...nextValues,
        energy: "low",
      };
      usedEnergyFallback = true;
      continue;
    }

    return {
      data: null,
      error: result.error,
      usedActualSecondsFallback,
      usedEnergyFallback,
    };
  }

  return {
    data: null,
    error: { message: "Task update retries were exhausted." },
    usedActualSecondsFallback,
    usedEnergyFallback,
  };
}

async function fetchLatestTaskRow(client: SupabaseClient, taskId: string) {
  return client
    .from("adhdice_clean_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();
}

function buildTaskUpdatePayload(values: TaskUpdate, expectedRevision?: number): TaskUpdate {
  return stripUndefinedEntries({
    ...values,
    revision: expectedRevision === undefined ? values.revision : expectedRevision + 1,
  });
}

function stripUndefinedEntries<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}

function getTaskUpdateFields(values: TaskUpdate): TaskUpdateField[] {
  return Object.keys(values)
    .filter((field): field is TaskUpdateField => field !== "revision" && values[field as keyof TaskUpdate] !== undefined);
}

function taskUpdateAlreadyApplied(latestTask: Task, values: TaskUpdate) {
  return getTaskUpdateFields(values)
    .every((field) => taskFieldValueEquals(latestTask[field], values[field] as Task[TaskUpdateField]));
}

function taskFieldValueEquals(left: Task[TaskUpdateField], right: Task[TaskUpdateField]) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  return left === right;
}

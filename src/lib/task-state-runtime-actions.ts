import type { Task, TaskUpdate } from "@/lib/database.types";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";
import type { CanonicalTaskStateColumns } from "@/lib/task-state-canonical/types";
import type { TaskStateCommandIntent } from "@/lib/task-state-command-client";

/**
 * TaskUpdate fields whose meaning belongs to canonical Task State. This list
 * is intentionally explicit so a new field cannot become an accidental
 * legacy state write by falling through a default case.
 */
export const TASK_STATE_OWNED_UPDATE_FIELDS = [
  "status",
  "due_on",
  "active_status_logical_date",
  "active_occurrence_due_on",
  "scheduled_on",
  "due_time",
  "repeat_frequency",
  "repeat_interval",
  "repeat_days_of_week",
  "repeat_day_of_month",
  "repeat_monthly_mode",
  "repeat_monthly_ordinal",
  "repeat_monthly_weekday",
  "completed_at",
  "trashed_at",
  "parent_task_id",
] as const satisfies readonly (keyof TaskUpdate)[];

export type TaskStateOwnedUpdateField = typeof TASK_STATE_OWNED_UPDATE_FIELDS[number];

/** Every current non-state TaskUpdate field is named here as well. */
export const TASK_METADATA_UPDATE_FIELDS = [
  "title",
  "notes",
  "priority",
  "priority_level",
  "energy",
  "is_urgent",
  "is_important",
  "estimated_minutes",
  "actual_seconds",
  "tags",
  "external_link_label",
  "external_link_url",
  "one_step_at_a_time",
  "subtasks_auto_reset",
  "pinned_at",
  "pin_order",
  "sort_order",
] as const satisfies readonly (keyof TaskUpdate)[];

export type TaskMetadataUpdateField = typeof TASK_METADATA_UPDATE_FIELDS[number];
export type TaskRuntimeTask = Pick<Task, "id" | "status">
  & Partial<Omit<Task, "id" | "status">>
  & Pick<CanonicalTaskStateColumns, "canonical_revision">;

export type TaskStateRuntimeCanonicalIntent = TaskStateCommandIntent extends infer Intent
  ? Intent extends { task_id: string; replay_identity: string; expected_revision?: number }
    ? Omit<Intent, "task_id" | "replay_identity" | "expected_revision">
    : never
  : never;

type CanonicalIntentWithRevision = TaskStateCommandIntent & { expected_revision: number };
export type TaskStateScheduleChanges = Readonly<Partial<Pick<
  TaskUpdate,
  | "due_on"
  | "scheduled_on"
  | "due_time"
  | "repeat_frequency"
  | "repeat_interval"
  | "repeat_days_of_week"
  | "repeat_day_of_month"
  | "repeat_monthly_mode"
  | "repeat_monthly_ordinal"
  | "repeat_monthly_weekday"
>>>;

export type TaskStateRuntimeActionType =
  | "start_in_progress"
  | "clear_in_progress"
  | "set_outcome"
  | "complete_task"
  | "delay_occurrence"
  | "archive_task"
  | "trash_task"
  | "restore_task"
  | "set_due_date"
  | "set_repeat"
  | "calendar_override"
  | "reconcile_rollover";

type ClassificationBase = {
  changedFields: readonly string[];
  legacyStateFallback: "forbidden";
};

export type TaskStateRuntimeAction = ClassificationBase & ({
  kind: "canonical_action";
  actionType: TaskStateRuntimeActionType;
  taskId: string;
  replayIdentity: string;
  expectedRevision: number;
  intent?: CanonicalIntentWithRevision;
  scheduleChanges?: TaskStateScheduleChanges;
} | {
  kind: "metadata_only";
  changedFields: readonly TaskMetadataUpdateField[];
  legacyMetadataPersistence: "allowed";
} | {
  kind: "unsupported_state_mutation";
  reason: string;
  stateFields: readonly TaskStateOwnedUpdateField[];
  metadataFields: readonly TaskMetadataUpdateField[];
});

export type ClassifyTaskStateRuntimeActionInput = {
  task: TaskRuntimeTask;
  values?: TaskUpdate;
  /** Use for Calendar/rollover and other actions not expressible as TaskUpdate. */
  canonicalIntent?: TaskStateRuntimeCanonicalIntent & { replay_identity?: string };
  replayIdentity?: string;
};

const SCHEDULE_DUE_FIELDS = ["due_on", "scheduled_on", "due_time"] as const;
const SCHEDULE_REPEAT_FIELDS = [
  "repeat_frequency",
  "repeat_interval",
  "repeat_days_of_week",
  "repeat_day_of_month",
  "repeat_monthly_mode",
  "repeat_monthly_ordinal",
  "repeat_monthly_weekday",
] as const;

function valuesEqual(left: unknown, right: unknown) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

function changedFields(task: TaskRuntimeTask, values: TaskUpdate) {
  const rawValues = values as Record<string, unknown>;
  const rawTask = task as unknown as Record<string, unknown>;
  return Object.keys(values).filter((field): field is keyof TaskUpdate => (
    field !== "revision"
    && rawValues[field] !== undefined
    && !valuesEqual(rawValues[field], rawTask[field])
  ));
}

function isCanonicalRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function unsupported(
  fields: string[],
  stateFields: TaskStateOwnedUpdateField[],
  metadataFields: TaskMetadataUpdateField[],
  reason: string,
): TaskStateRuntimeAction {
  return {
    kind: "unsupported_state_mutation",
    changedFields: fields,
    stateFields,
    metadataFields,
    reason,
    legacyStateFallback: "forbidden",
  };
}

function commandTypeForIntent(intent: TaskStateCommandIntent): TaskStateRuntimeActionType {
  return intent.type;
}

function canonicalAction(
  task: TaskRuntimeTask,
  actionType: TaskStateRuntimeActionType,
  fields: string[],
  replayIdentity: string,
  intent?: TaskStateRuntimeCanonicalIntent,
  scheduleChanges?: TaskStateScheduleChanges,
): TaskStateRuntimeAction {
  const expectedRevision = task.canonical_revision;
  if (!isCanonicalRevision(expectedRevision)) {
    return unsupported(
      fields,
      fields.filter((field): field is TaskStateOwnedUpdateField => (TASK_STATE_OWNED_UPDATE_FIELDS as readonly string[]).includes(field)),
      fields.filter((field): field is TaskMetadataUpdateField => (TASK_METADATA_UPDATE_FIELDS as readonly string[]).includes(field)),
      "Canonical Task State action requires a valid task.canonical_revision; legacy task.revision is not an acceptable substitute.",
    );
  }

  const base = {
    kind: "canonical_action" as const,
    actionType,
    taskId: task.id,
    replayIdentity,
    expectedRevision,
    changedFields: fields,
    legacyStateFallback: "forbidden" as const,
    ...(scheduleChanges ? { scheduleChanges } : {}),
  };

  if (!intent) return base;
  return {
    ...base,
    intent: {
      ...intent,
      task_id: task.id,
      replay_identity: replayIdentity,
      expected_revision: expectedRevision,
    } as CanonicalIntentWithRevision,
  };
}

function buildStatusAction(
  task: TaskRuntimeTask,
  targetStatus: Task["status"],
  fields: string[],
  replayIdentity: string,
): TaskStateRuntimeAction | null {
  if (targetStatus === "in_progress") {
    return canonicalAction(task, "start_in_progress", fields, replayIdentity, { type: "start_in_progress" });
  }
  if (targetStatus === "done" || targetStatus === "did_my_best" || targetStatus === "missed") {
    return canonicalAction(task, "set_outcome", fields, replayIdentity, { type: "set_outcome", outcome: targetStatus });
  }
  if (targetStatus === "complete") {
    return canonicalAction(task, "complete_task", fields, replayIdentity, { type: "complete_task" });
  }
  if (targetStatus === "archived") {
    return canonicalAction(task, "archive_task", fields, replayIdentity, { type: "archive_task" });
  }
  if (targetStatus === "trashed") {
    return canonicalAction(task, "trash_task", fields, replayIdentity, { type: "trash_task" });
  }
  if (targetStatus === "pending" && task.status === "in_progress") {
    return canonicalAction(task, "clear_in_progress", fields, replayIdentity, { type: "clear_in_progress" });
  }
  if (targetStatus === "pending" && (task.status === "archived" || task.status === "trashed")) {
    return canonicalAction(task, "restore_task", fields, replayIdentity, { type: "restore_task" });
  }
  return null;
}

function normalizeReplayIdentity(input: ClassifyTaskStateRuntimeActionInput) {
  const supplied = input.replayIdentity ?? "";
  if (input.replayIdentity !== undefined && supplied.trim().length === 0) return null;
  return supplied || createBrowserUuidV4();
}

/**
 * Classifies a prospective runtime mutation. This module only coordinates the
 * boundary; it does not plan recurrence, History, rewards, or persistence.
 */
export function classifyTaskStateRuntimeAction(
  input: ClassifyTaskStateRuntimeActionInput,
): TaskStateRuntimeAction {
  const values = input.values ?? {};
  const fields = changedFields(input.task, values);
  const stateFields = fields.filter((field): field is TaskStateOwnedUpdateField => (
    (TASK_STATE_OWNED_UPDATE_FIELDS as readonly string[]).includes(field)
  ));
  const metadataFields = fields.filter((field): field is TaskMetadataUpdateField => (
    (TASK_METADATA_UPDATE_FIELDS as readonly string[]).includes(field)
  ));

  if (Object.hasOwn(values, "revision")) {
    return unsupported(fields, stateFields, metadataFields, "legacy task.revision is a concurrency field, not metadata or a canonical Task State precondition.");
  }
  if (input.canonicalIntent && fields.length > 0) {
    return unsupported(fields, stateFields, metadataFields, "A canonical action and a TaskUpdate cannot be combined without an explicit coordinator transaction.");
  }
  if (input.canonicalIntent) {
    const suppliedIntent = input.canonicalIntent;
    const replayIdentity = input.replayIdentity ?? suppliedIntent.replay_identity;
    if (input.replayIdentity !== undefined && suppliedIntent.replay_identity !== undefined && input.replayIdentity !== suppliedIntent.replay_identity) {
      return unsupported([], [], [], "The canonical action has conflicting replay identities.");
    }
    const replayIdentityWasSupplied = input.replayIdentity !== undefined || suppliedIntent.replay_identity !== undefined;
    if (replayIdentityWasSupplied && (!replayIdentity || replayIdentity.trim().length === 0)) {
      return unsupported([], [], [], "Canonical Task State action requires a non-empty replay identity.");
    }
    const resolvedReplayIdentity = replayIdentity ?? createBrowserUuidV4();
    const fullIntent = { ...suppliedIntent, task_id: input.task.id, replay_identity: resolvedReplayIdentity } as TaskStateCommandIntent;
    return canonicalAction(input.task, commandTypeForIntent(fullIntent), [], resolvedReplayIdentity, suppliedIntent);
  }
  if (metadataFields.length === fields.length) {
    return {
      kind: "metadata_only",
      changedFields: metadataFields,
      legacyMetadataPersistence: "allowed",
      legacyStateFallback: "forbidden",
    };
  }
  if (fields.length === 0) {
    return {
      kind: "metadata_only",
      changedFields: [],
      legacyMetadataPersistence: "allowed",
      legacyStateFallback: "forbidden",
    };
  }
  if (metadataFields.length > 0 && stateFields.length > 0) {
    return unsupported(fields, stateFields, metadataFields, "Metadata and canonical Task State changes must not be split silently across different persistence authorities.");
  }

  const replayIdentity = normalizeReplayIdentity(input);
  if (!replayIdentity) {
    return unsupported(fields, stateFields, metadataFields, "Canonical Task State action requires a non-empty replay identity.");
  }

  const statusFieldChanged = stateFields.includes("status");
  const scheduleDueFields = stateFields.filter((field): field is typeof SCHEDULE_DUE_FIELDS[number] => SCHEDULE_DUE_FIELDS.includes(field as typeof SCHEDULE_DUE_FIELDS[number]));
  const scheduleRepeatFields = stateFields.filter((field): field is typeof SCHEDULE_REPEAT_FIELDS[number] => SCHEDULE_REPEAT_FIELDS.includes(field as typeof SCHEDULE_REPEAT_FIELDS[number]));

  if (statusFieldChanged) {
    const targetStatus = values.status;
    if (!targetStatus) return unsupported(fields, stateFields, metadataFields, "A status mutation did not provide a target status.");
    if (scheduleDueFields.length > 0 || scheduleRepeatFields.length > 0) {
      return unsupported(fields, stateFields, metadataFields, "Status and schedule changes in one TaskUpdate are ambiguous; no legacy Task State fallback is allowed.");
    }
    const allowedProjectionFields = targetStatus === "done"
      || targetStatus === "did_my_best"
      || targetStatus === "complete"
      ? new Set(["status", "completed_at"])
      : targetStatus === "archived" || targetStatus === "trashed"
        ? new Set(["status", "trashed_at", "completed_at"])
        : new Set(["status"]);
    if (fields.some((field) => !allowedProjectionFields.has(field))) {
      return unsupported(fields, stateFields, metadataFields, "The state mutation contains projection fields that cannot be translated safely into one canonical command.");
    }
    const action = buildStatusAction(input.task, targetStatus, fields, replayIdentity);
    return action ?? unsupported(
      fields,
      stateFields,
      metadataFields,
      targetStatus === "pending" || targetStatus === "upcoming" || targetStatus === "not_due"
        ? "Pending, Upcoming, and Not Due are derived statuses, not independent canonical commands; this transition has no safe canonical action."
        : targetStatus === "delayed"
          ? "Delay requires canonical occurrence identity and effective date; a bare TaskUpdate cannot provide them."
          : "This status transition has no safe canonical command descriptor.",
    );
  }

  if (scheduleDueFields.length > 0 && scheduleRepeatFields.length > 0) {
    return unsupported(fields, stateFields, metadataFields, "Due-date and repeat/cadence changes in one TaskUpdate require an explicit canonical schedule intent.");
  }
  if (scheduleDueFields.length > 0) {
    return canonicalAction(input.task, "set_due_date", fields, replayIdentity, undefined, Object.fromEntries(scheduleDueFields.map((field) => [field, values[field]])) as TaskStateScheduleChanges);
  }
  if (scheduleRepeatFields.length > 0) {
    return canonicalAction(input.task, "set_repeat", fields, replayIdentity, undefined, Object.fromEntries(scheduleRepeatFields.map((field) => [field, values[field]])) as TaskStateScheduleChanges);
  }

  return unsupported(fields, stateFields, metadataFields, "The Task State fields do not identify one already-approved canonical action.");
}

/** Create one replay identity for one new logical user action. */
export function createTaskStateReplayIdentity() {
  return createBrowserUuidV4();
}

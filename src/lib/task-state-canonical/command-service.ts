import type { Task, TaskStatus } from "../database.types.ts";
import { daysBetween } from "../task-state-engine/calendar.ts";
import { evaluateTaskState } from "../task-state-engine/engine.ts";
import type {
  TaskHistoryOutcome,
  TaskStateEngineInput,
  TaskStateHistoryRow,
} from "../task-state-engine/types.ts";
import type {
  CanonicalCommandOperationState,
  CanonicalCommandSourceKind,
  CanonicalCommandType,
  CanonicalContainerState,
  CanonicalEntityKind,
  CanonicalJsonObject,
  CanonicalLogicalDayContext,
  CanonicalTaskCalendarOverride,
  CanonicalTaskHistoryFact,
  CanonicalTaskOccurrence,
  CanonicalTaskOccurrenceEffectiveOverride,
  CanonicalTaskRewardEntitlement,
  CanonicalTaskScheduleBoundary,
  CanonicalTaskStateColumns,
  CanonicalTerminalState,
  CanonicalWorkflowState,
} from "./types.ts";
import { sha256Digest } from "./digest.ts";
import type { CanonicalTaskRow } from "./read-model.ts";
import { recurrenceFromBoundary, taskCalendarOverrideFromCanonical } from "./engine-input.ts";

export type CanonicalHandledOutcome = Extract<TaskHistoryOutcome, "done" | "did_my_best" | "missed">;

export type CanonicalCompatibilityProjection = {
  status: TaskStatus;
  dueOn: string | null;
  completedAt: string | null;
  activeStatusLogicalDate: string | null;
  activeOccurrenceDueOn: string | null;
};

export type CanonicalTaskStateCommandBase = {
  commandId?: string;
  userId: string;
  taskId: string;
  entityKind: CanonicalEntityKind;
  /** Validated browser intent; unlike the plan, this excludes server-derived state. */
  acceptedIntent: CanonicalJsonObject;
  expectedRevision: number;
  expectedBoundarySequence?: number;
  logicalDay: CanonicalLogicalDayContext;
  idempotenceIdentity?: string;
  sourceKind?: CanonicalCommandSourceKind;
};

export type CanonicalHandledOutcomeCommand = CanonicalTaskStateCommandBase & {
  type: "handled_outcome";
  outcome: CanonicalHandledOutcome;
  logicalDate?: string;
  occurrenceId?: string | null;
  occurrenceKey?: string | null;
  scheduledDueOn?: string | null;
  effectiveDueOn?: string | null;
  occurrence?: CanonicalTaskOccurrence;
};

export type CanonicalCompleteCommand = CanonicalTaskStateCommandBase & {
  type: "complete";
  logicalDate?: string;
  completedAt?: string;
  occurrenceId?: string | null;
  occurrenceKey?: string | null;
  scheduledDueOn?: string | null;
  occurrence?: CanonicalTaskOccurrence;
};

export type CanonicalWorkflowCommand = CanonicalTaskStateCommandBase & (
  {
    type: "workflow_start";
    startedAt: string;
    occurrenceId?: string | null;
  }
  | { type: "workflow_clear" }
);

export type CanonicalLifecycleCommand = CanonicalTaskStateCommandBase & {
  type: "archive" | "trash" | "restore";
  changedAt?: string;
};

export type CanonicalDelayCommand = CanonicalTaskStateCommandBase & {
  type: "delay";
  logicalDate?: string;
  occurrenceId: string;
  scheduledDueOn: string;
  effectiveDueOn: string;
  override?: CanonicalTaskOccurrenceEffectiveOverride;
  occurrence?: CanonicalTaskOccurrence;
  scheduleBoundary?: CanonicalTaskScheduleBoundary;
};

export type CanonicalScheduleCommand = CanonicalTaskStateCommandBase & {
  type: "schedule_change";
  changeKind: "due_date" | "repeat";
  manual_action?: "unscheduled_status";
  scheduleBoundary: CanonicalTaskScheduleBoundary;
};

export type CanonicalCalendarOverrideCommand = CanonicalTaskStateCommandBase & {
  type: "calendar_override";
  calendarOverride: CanonicalTaskCalendarOverride;
};

export type CanonicalClearOutcomeCommand = CanonicalTaskStateCommandBase & {
  type: "clear_outcome";
  logicalDate: string;
  occurrenceId?: string | null;
  occurrenceKey?: string | null;
  scheduledDueOn?: string | null;
  occurrence?: CanonicalTaskOccurrence;
};

export type CanonicalRolloverCommand = CanonicalTaskStateCommandBase & {
  type: "rollover";
  /** Server-derived stale workflow evidence; never accepted from browser intent. */
  staleLogicalDate?: string | null;
  occurrenceId?: string | null;
  occurrenceKey?: string | null;
  scheduledDueOn?: string | null;
  scheduleBoundaryId?: string | null;
};

export type CanonicalTaskStateCommand =
  | CanonicalHandledOutcomeCommand
  | CanonicalCompleteCommand
  | CanonicalWorkflowCommand
  | CanonicalLifecycleCommand
  | CanonicalDelayCommand
  | CanonicalScheduleCommand
  | CanonicalCalendarOverrideCommand
  | CanonicalClearOutcomeCommand
  | CanonicalRolloverCommand;

export type CanonicalCommandEnvelope = {
  commandId: string;
  userId: string;
  taskId: string;
  entityKind: CanonicalEntityKind;
  commandType: CanonicalCommandType;
  expectedRevision: number;
  expectedBoundarySequence?: number;
  logicalDay: CanonicalLogicalDayContext;
  idempotenceIdentity: string;
  acceptedPayloadDigest: string;
  sourceKind: CanonicalCommandSourceKind;
  payload: CanonicalJsonObject;
};

export type CanonicalTaskPatch = Partial<Pick<
  CanonicalTaskStateColumns,
  | "terminal_state"
  | "container_state"
  | "prior_container_state"
  | "prior_container_state_status"
  | "terminal_completed_at"
  | "container_trashed_at"
  | "workflow_state"
  | "workflow_started_at"
  | "workflow_logical_date"
  | "workflow_occurrence_id"
  | "workflow_command_id"
  | "workflow_revision"
  | "canonicalization_status"
>>;

export type CanonicalHistoryFactPlan = Pick<
  CanonicalTaskHistoryFact,
  | "logical_date"
  | "outcome"
  | "event_kind"
  | "occurrence_id"
  | "scheduled_due_on"
  | "effective_due_on"
  | "schedule_boundary_id"
  | "recurrence_source_fingerprint"
  | "source"
  | "logical_day_settings_revision"
  | "timezone"
  | "day_start_time"
  | "idempotence_identity"
>;

export type CanonicalRewardEntitlementPlan = {
  identity: string;
  entityId: string;
  entityKind: CanonicalEntityKind;
  logicalDate: string;
  outcome: Extract<CanonicalHistoryFactPlan["outcome"], "done" | "did_my_best" | "complete">;
  rewardProgramVersion: string;
  effectiveObligationIdentity: string | null;
};

export type CanonicalNormalizedCommandResult = {
  commandId: string;
  commandType: CanonicalCommandType;
  state: Extract<CanonicalCommandOperationState, "accepted" | "rejected" | "committed">;
  conflictCode: string | null;
  expectedRevision: number;
  nextRevision: number | null;
  canonicalTaskPatch: CanonicalTaskPatch;
  compatibilityProjection: CanonicalCompatibilityProjection;
  historyFact: CanonicalHistoryFactPlan | null;
  automaticHistoryFacts: CanonicalHistoryFactPlan[];
  automaticHistoryDeleteIds: string[];
  occurrence: CanonicalTaskOccurrence | null;
  scheduleBoundary: CanonicalTaskScheduleBoundary | null;
  occurrenceEffectiveOverride: CanonicalTaskOccurrenceEffectiveOverride | null;
  calendarOverride: CanonicalTaskCalendarOverride | null;
  rewardEntitlement: CanonicalRewardEntitlementPlan | null;
  warnings: string[];
};

export type CanonicalTaskCommandPlan = {
  command: CanonicalCommandEnvelope;
  normalizedResult: CanonicalNormalizedCommandResult;
};

/**
 * Detects a plan whose canonical and compatibility projections, plus every
 * side-effect section, already equal the stored state. Callers can return the
 * current committed read model without creating an operation or revision.
 */
export function isCanonicalTaskStateCommandSemanticNoOp(input: {
  plan: CanonicalTaskCommandPlan;
  task: CanonicalTaskRow;
}) {
  const { normalizedResult } = input.plan;
  const patchChangesTask = Object.entries(normalizedResult.canonicalTaskPatch).some(([field, value]) => (
    input.task[field as keyof CanonicalTaskRow] !== value
  ));
  if (patchChangesTask) return false;

  const projection = normalizedResult.compatibilityProjection;
  if (projection.status !== input.task.status
    || projection.dueOn !== input.task.due_on
    || projection.completedAt !== input.task.completed_at
    || projection.activeStatusLogicalDate !== input.task.active_status_logical_date
    || projection.activeOccurrenceDueOn !== input.task.active_occurrence_due_on) {
    return false;
  }

  return normalizedResult.historyFact === null
    && (normalizedResult.automaticHistoryFacts ?? []).length === 0
    && (normalizedResult.automaticHistoryDeleteIds ?? []).length === 0
    && normalizedResult.occurrence === null
    && normalizedResult.scheduleBoundary === null
    && normalizedResult.occurrenceEffectiveOverride === null
    && normalizedResult.calendarOverride === null
    && normalizedResult.rewardEntitlement === null;
}

/**
 * Converts a pure plan to the snake_case JSON contract consumed by the M3A
 * RPC.  The active application does not call this adapter until M3B.
 */
export function serializeCanonicalTaskStateCommandForRpc(plan: CanonicalTaskCommandPlan): CanonicalJsonObject {
  const { command, normalizedResult } = plan;
  const projection = normalizedResult.compatibilityProjection;
  const history = normalizedResult.historyFact;
  const payload: CanonicalJsonObject = {
    task_patch: normalizedResult.canonicalTaskPatch,
    compatibility_projection: {
      status: projection.status,
      due_on: projection.dueOn,
      completed_at: projection.completedAt,
      active_status_logical_date: projection.activeStatusLogicalDate,
      active_occurrence_due_on: projection.activeOccurrenceDueOn,
    },
    ...(normalizedResult.rewardEntitlement
      ? { reward_program_version: normalizedResult.rewardEntitlement.rewardProgramVersion }
      : {}),
  };
  if (command.commandType === "clear_outcome") {
    payload.clear_logical_date = command.payload.clear_logical_date;
  }
  if (command.commandType === "set_due_date" && command.payload.manual_action === "unscheduled_status") {
    payload.manual_action = "unscheduled_status";
  }
  if (history) {
    payload.history_fact = {
      ...history,
      provenance_kind: command.sourceKind === "runtime" ? "user" : command.sourceKind === "repair" ? "repair" : "authorized_automation",
      actor_kind: command.sourceKind === "runtime" ? "user" : "authorized_automation",
      actor_id: command.sourceKind === "runtime" ? command.userId : null,
      source_legacy_history_id: null,
      revision: 1,
    };
  }
  if ((normalizedResult.automaticHistoryFacts ?? []).length > 0) {
    payload.automatic_history_facts = normalizedResult.automaticHistoryFacts.map((fact) => ({
      ...fact,
      provenance_kind: "authorized_automation",
      actor_kind: "authorized_automation",
      actor_id: null,
      source_legacy_history_id: null,
      revision: 1,
    }));
  }
  if ((normalizedResult.automaticHistoryDeleteIds ?? []).length > 0) {
    payload.automatic_history_delete_ids = normalizedResult.automaticHistoryDeleteIds;
  }
  if (normalizedResult.occurrence) payload.occurrence = normalizedResult.occurrence;
  if (normalizedResult.scheduleBoundary) payload.schedule_boundary = normalizedResult.scheduleBoundary;
  if (normalizedResult.occurrenceEffectiveOverride) {
    payload.occurrence_effective_override = normalizedResult.occurrenceEffectiveOverride;
  }
  if (normalizedResult.calendarOverride) payload.calendar_override = normalizedResult.calendarOverride;
  if ("occurrenceKey" in command && command.occurrenceKey) payload.occurrence_key = command.occurrenceKey;

  return {
    command_id: command.commandId,
    entity_id: command.taskId,
    entity_kind: command.entityKind,
    command_type: command.commandType,
    idempotence_identity: command.idempotenceIdentity,
    accepted_payload_digest: command.acceptedPayloadDigest,
    logical_day_context: {
      identity: command.logicalDay.identity,
      logical_date: command.logicalDay.logicalDate,
      timezone: command.logicalDay.timezone,
      day_start_time: command.logicalDay.dayStartTime,
      settings_revision: command.logicalDay.settingsRevision,
    },
    expected_entity_revision: command.expectedRevision,
    ...(command.expectedBoundarySequence !== undefined ? { expected_boundary_sequence: command.expectedBoundarySequence } : {}),
    source_kind: command.sourceKind,
    payload,
  };
}

export type CanonicalCommandPlanningState = {
  task: CanonicalTaskRow;
  /** Canonical History facts are mapped into the existing pure engine at M3B. */
  engineInput?: TaskStateEngineInput;
};

export class CanonicalCommandPlanningError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalCommandPlanningError";
    this.code = code;
  }
}

function requireCanonicalRevision(task: CanonicalTaskRow): number {
  const revision = task.canonical_revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) {
    throw new CanonicalCommandPlanningError(
      "CANONICAL_REVISION_REQUIRED",
      "Canonical Task State requires canonical_revision; legacy revision is not a substitute.",
    );
  }
  return revision;
}

function commandId() {
  const generated = globalThis.crypto?.randomUUID?.();
  if (!generated) throw new CanonicalCommandPlanningError("COMMAND_ID_REQUIRED", "A command ID is required when secure UUID generation is unavailable.");
  return generated;
}

function commandType(command: CanonicalTaskStateCommand): CanonicalCommandType {
  switch (command.type) {
    case "handled_outcome": return "set_outcome";
    case "complete": return "complete_task";
    case "workflow_start": return "start_in_progress";
    case "workflow_clear": return "clear_in_progress";
    case "archive": return "archive_task";
    case "trash": return "trash_task";
    case "restore": return "restore_task";
    case "delay": return "delay_occurrence";
    case "schedule_change": return command.changeKind === "due_date" ? "set_due_date" : "set_repeat";
    case "calendar_override": return "calendar_override";
    case "clear_outcome": return "clear_outcome";
    case "rollover": return "reconcile_rollover";
  }
}

function commandPayload(command: CanonicalTaskStateCommand): CanonicalJsonObject {
  const internalFields = new Set([
    "commandId", "acceptedIntent", "compatibilityProjection", "startedAt", "changedAt", "completedAt",
    "staleLogicalDate", "occurrenceId", "scheduledDueOn", "scheduleBoundaryId",
  ]);
  return Object.fromEntries(Object.entries(command).filter(([key]) => !internalFields.has(key)));
}

export function normalizeTaskStateCommand(command: CanonicalTaskStateCommand): CanonicalCommandEnvelope {
  const id = command.commandId ?? commandId();
  const payload = commandPayload(command);
  if (command.type === "clear_outcome") payload.clear_logical_date = command.logicalDate;
  return {
    commandId: id,
    userId: command.userId,
    taskId: command.taskId,
    entityKind: command.entityKind,
    commandType: commandType(command),
    expectedRevision: command.expectedRevision,
    ...(command.expectedBoundarySequence !== undefined ? { expectedBoundarySequence: command.expectedBoundarySequence } : {}),
    logicalDay: command.logicalDay,
    idempotenceIdentity: command.idempotenceIdentity ?? `task-state-command:${id}`,
    acceptedPayloadDigest: sha256Digest(command.acceptedIntent),
    sourceKind: command.sourceKind ?? "runtime",
    payload,
  };
}

function projectionFromEngine(
  task: Task,
  result: ReturnType<typeof evaluateTaskState>,
): CanonicalCompatibilityProjection {
  const status = result.activeStatus === "unscheduled" ? "pending" : result.activeStatus;
  return {
    status,
    dueOn: result.nextDueDate,
    completedAt: result.proposedTaskPatch.completedAt ?? task.completed_at,
    activeStatusLogicalDate: Object.hasOwn(result.proposedTaskPatch, "activeStatusLogicalDate")
      ? result.proposedTaskPatch.activeStatusLogicalDate ?? null
      : task.active_status_logical_date,
    activeOccurrenceDueOn: Object.hasOwn(result.proposedTaskPatch, "activeOccurrenceDueOn")
      ? result.proposedTaskPatch.activeOccurrenceDueOn ?? null
      : task.active_occurrence_due_on,
  };
}

function engineInputForScheduleBoundary(
  engineInput: TaskStateEngineInput,
  boundary: CanonicalTaskScheduleBoundary,
): TaskStateEngineInput {
  const dueOn = boundary.schedule_model === "unscheduled"
    ? null
    : boundary.schedule_model === "one_time"
      ? boundary.one_time_due_on
      : boundary.anchor_date ?? engineInput.task.dueOn;
  return {
    ...engineInput,
    task: {
      ...engineInput.task,
      dueOn,
      historicalScheduleAnchor: dueOn,
      historicalScheduleAnchorProven: dueOn !== null,
      recurrence: recurrenceFromBoundary(boundary),
    },
  };
}

function engineInputForCalendarOverride(
  engineInput: TaskStateEngineInput,
  override: CanonicalTaskCalendarOverride,
): TaskStateEngineInput {
  const remaining = (engineInput.calendarOverrides ?? [])
    .filter((candidate) => candidate.logicalDate !== override.logical_date);
  return {
    ...engineInput,
    calendarOverrides: override.is_active
      ? [...remaining, taskCalendarOverrideFromCanonical(override)]
      : remaining,
  };
}

function scheduleBoundaryDueOn(
  boundary: CanonicalTaskScheduleBoundary,
  fallback: string | null,
): string | null {
  if (boundary.schedule_model === "unscheduled") return null;
  if (boundary.schedule_model === "one_time") return boundary.one_time_due_on;
  return boundary.anchor_date ?? fallback;
}

function projectionForWorkflowClear(task: Task, logicalDate: string): CanonicalCompatibilityProjection {
  let status: TaskStatus = task.status;
  if (task.status === "in_progress") {
    if (!task.due_on) status = "pending";
    else if (task.due_on > logicalDate) status = daysBetween(logicalDate, task.due_on) <= 7 ? "upcoming" : "not_due";
    else status = "pending";
  }
  return {
    status,
    dueOn: task.due_on,
    completedAt: task.completed_at,
    activeStatusLogicalDate: null,
    activeOccurrenceDueOn: null,
  };
}

function requireProjection(
  engineResult?: ReturnType<typeof evaluateTaskState>,
  task?: Task,
): CanonicalCompatibilityProjection {
  if (engineResult && task) return projectionFromEngine(task, engineResult);
  throw new CanonicalCommandPlanningError(
    "ENGINE_SNAPSHOT_REQUIRED",
    "This command requires a canonical engine snapshot to derive its compatibility projection.",
  );
}

function projectionFromTask(task: Task): CanonicalCompatibilityProjection {
  return {
    status: task.status,
    dueOn: task.due_on,
    completedAt: task.completed_at,
    activeStatusLogicalDate: task.active_status_logical_date,
    activeOccurrenceDueOn: task.active_occurrence_due_on,
  };
}

function restoredContainerState(task: CanonicalTaskRow): "active" | "archived" {
  if (task.container_state === "trashed") {
    if (task.prior_container_state_status !== "proven"
      || (task.prior_container_state !== "active" && task.prior_container_state !== "archived")) {
      throw new CanonicalCommandPlanningError(
        "RESTORE_PROVENANCE_REQUIRED",
        "Trash restore requires a proven prior container state; explicit resolution is required.",
      );
    }
    return task.prior_container_state;
  }
  if (task.container_state === "archived") return "active";
  if (task.container_state === "active") return "active";
  throw new CanonicalCommandPlanningError(
    "RESTORE_PROVENANCE_REQUIRED",
    "Restore requires a canonical active, archived, or proven trashed container state.",
  );
}

function baseTaskPatch(task: CanonicalTaskRow): CanonicalTaskPatch {
  return {
    canonicalization_status: "canonical_runtime",
  };
}

function historyFactFor(
  command: CanonicalTaskStateCommand,
  envelope: CanonicalCommandEnvelope,
  logicalDate: string,
  outcome: CanonicalHistoryFactPlan["outcome"],
  effectiveDueOn: string | null = null,
): CanonicalHistoryFactPlan {
  const occurrenceId = "occurrenceId" in command ? command.occurrenceId ?? null : null;
  const scheduledDueOn = "scheduledDueOn" in command ? command.scheduledDueOn ?? null : null;
  return {
    logical_date: logicalDate,
    outcome,
    event_kind: envelope.sourceKind === "authorized_automation"
      ? "authorized_automation"
      : outcome === "complete" ? "terminal_complete" : outcome === "delayed" ? "delay_audit" : "explicit_outcome",
    occurrence_id: occurrenceId,
    scheduled_due_on: scheduledDueOn,
    effective_due_on: effectiveDueOn,
    schedule_boundary_id: "scheduleBoundary" in command
      ? command.scheduleBoundary?.id ?? null
      : "override" in command
        ? command.override?.schedule_boundary_id ?? null
        : null,
    recurrence_source_fingerprint: "scheduleBoundary" in command ? command.scheduleBoundary?.id ?? null : null,
    source: "task_state_command",
    logical_day_settings_revision: envelope.logicalDay.settingsRevision,
    timezone: envelope.logicalDay.timezone,
    day_start_time: envelope.logicalDay.dayStartTime,
    idempotence_identity: `${envelope.idempotenceIdentity}:history:${logicalDate}:${outcome}`,
  };
}

function automaticHistoryFactFor(
  command: CanonicalCommandEnvelope,
  row: TaskStateHistoryRow,
  scheduleBoundaryId: string | null,
): CanonicalHistoryFactPlan {
  return {
    logical_date: row.logicalDate,
    outcome: "missed",
    event_kind: "authorized_automation",
    occurrence_id: null,
    scheduled_due_on: row.occurrenceDueOn ?? null,
    effective_due_on: null,
    schedule_boundary_id: scheduleBoundaryId,
    recurrence_source_fingerprint: scheduleBoundaryId,
    source: "task_state_command",
    logical_day_settings_revision: command.logicalDay.settingsRevision,
    timezone: command.logicalDay.timezone,
    day_start_time: command.logicalDay.dayStartTime,
    idempotence_identity: `${command.idempotenceIdentity}:history:${row.logicalDate}:missed`,
  };
}

function engineOccurrenceDueOnFor(
  result: ReturnType<typeof evaluateTaskState> | undefined,
  engineInput: TaskStateEngineInput | undefined,
  logicalDate: string,
  outcome: TaskHistoryOutcome,
) {
  if (engineInput?.task.recurrence.kind !== "rolling"
    || engineInput.task.recurrence.intervalDays !== 1
    || engineInput.task.recurrence.untilComplete === true
    || !["done", "did_my_best", "complete"].includes(outcome)) return null;
  return result?.proposedHistoryChanges.find((change) => (
    change.type === "insert"
    && change.row.logicalDate === logicalDate
    && change.row.outcome === outcome
  ))?.row.occurrenceDueOn ?? null;
}

function rewardPlan(
  envelope: CanonicalCommandEnvelope,
  fact: CanonicalHistoryFactPlan | null,
): CanonicalRewardEntitlementPlan | null {
  if (!fact || !["done", "did_my_best", "complete"].includes(fact.outcome)) return null;
  const outcome = fact.outcome as "done" | "did_my_best" | "complete";
  return {
    identity: `task-reward-entitlement:${envelope.taskId}:${fact.logical_date}:v1`,
    entityId: envelope.taskId,
    entityKind: envelope.entityKind,
    logicalDate: fact.logical_date,
    outcome,
    rewardProgramVersion: "task-reward-v1",
    effectiveObligationIdentity: fact.occurrence_id ?? fact.scheduled_due_on,
  };
}

function initialResult(
  envelope: CanonicalCommandEnvelope,
  task: CanonicalTaskRow,
  projection: CanonicalCompatibilityProjection,
  canonicalTaskPatch: CanonicalTaskPatch,
): CanonicalNormalizedCommandResult {
  return {
    commandId: envelope.commandId,
    commandType: envelope.commandType,
    state: "accepted",
    conflictCode: null,
    expectedRevision: envelope.expectedRevision,
    nextRevision: requireCanonicalRevision(task) + 1,
    canonicalTaskPatch,
    compatibilityProjection: projection,
    historyFact: null,
    automaticHistoryFacts: [],
    automaticHistoryDeleteIds: [],
    occurrence: null,
    scheduleBoundary: null,
    occurrenceEffectiveOverride: null,
    calendarOverride: null,
    rewardEntitlement: null,
    warnings: [],
  };
}

export function planTaskStateCommand(
  state: CanonicalCommandPlanningState,
  input: CanonicalTaskStateCommand,
): CanonicalTaskCommandPlan {
  const command = normalizeTaskStateCommand(input);
  const task = state.task;
  const currentRevision = requireCanonicalRevision(task);
  if (task.user_id !== command.userId || task.id !== command.taskId || task.entity_kind !== command.entityKind) {
    throw new CanonicalCommandPlanningError("OWNERSHIP_MISMATCH", "The command entity is not owned by the command user or has a different entity kind.");
  }
  if (currentRevision !== command.expectedRevision) {
    return {
      command,
      normalizedResult: {
        ...initialResult(command, task, commandProjection(input, task), {}),
        state: "rejected",
        conflictCode: "STALE_REVISION",
        nextRevision: currentRevision,
      },
    };
  }

  let engineResult: ReturnType<typeof evaluateTaskState> | undefined;
  const needsEngineProjection = ["handled_outcome", "delay", "schedule_change", "calendar_override", "clear_outcome", "rollover"].includes(input.type)
    || (input.type === "restore" && task.container_state !== "active");
  if (needsEngineProjection && !state.engineInput) {
    throw new CanonicalCommandPlanningError(
      "ENGINE_SNAPSHOT_REQUIRED",
      `${input.type} planning requires the canonical engine snapshot; a client projection cannot substitute for it.`,
    );
  }
  const shouldEvaluateEngine = Boolean(state.engineInput && (
    ["handled_outcome", "complete", "delay", "schedule_change", "calendar_override", "clear_outcome", "rollover"].includes(input.type)
    || (input.type === "restore" && task.container_state !== "active")
  ));
  if (shouldEvaluateEngine) {
    const existingOutcomeRow = input.type === "handled_outcome" && state.engineInput
      ? state.engineInput.history.find((row) => row.logicalDate === (input.logicalDate ?? input.logicalDay.logicalDate)) ?? null
      : null;
    const outcomeDate = input.type === "handled_outcome"
      ? input.logicalDate ?? input.logicalDay.logicalDate
      : null;
    const action = input.type === "handled_outcome"
      ? {
          type: "record_outcome" as const,
          outcome: input.outcome,
          logicalDate: outcomeDate,
          occurrenceDueOn: input.scheduledDueOn ?? existingOutcomeRow?.occurrenceDueOn ?? null,
          occurrenceIdentity: input.occurrenceKey ?? existingOutcomeRow?.occurrenceIdentity ?? null,
          ...(existingOutcomeRow ? {
            replaceExisting: true,
            previousOutcome: existingOutcomeRow.outcome,
          } : {}),
          ...(outcomeDate < input.logicalDay.logicalDate ? { historicalOverride: true } : {}),
        }
      : input.type === "complete"
        ? { type: "record_outcome" as const, outcome: "complete" as const, logicalDate: input.logicalDate }
        : input.type === "delay"
          ? { type: "record_outcome" as const, outcome: "delayed" as const, logicalDate: input.logicalDate, delayUntilDate: input.effectiveDueOn }
        : input.type === "schedule_change"
            ? {
                type: "change_schedule" as const,
                changedLogicalDate: input.scheduleBoundary.effective_from_logical_date,
                replayKind: (input.changeKind === "due_date" ? "due_date" : "recurrence") as "due_date" | "recurrence",
                ...(input.changeKind === "due_date"
                  ? { manualDueOn: scheduleBoundaryDueOn(input.scheduleBoundary, state.engineInput?.task.dueOn ?? null) }
                  : {}),
              }
        : input.type === "rollover"
          ? { type: "reconcile_rollover" as const }
        : input.type === "calendar_override"
              ? { type: "recompute" as const, fromLogicalDate: input.calendarOverride.logical_date }
              : input.type === "clear_outcome"
                ? undefined
          : undefined;
    const engineInput = input.type === "restore"
      ? {
          ...state.engineInput!,
          task: {
            ...state.engineInput!.task,
            lifecycle: task.terminal_state === "permanently_complete" ? "complete" as const : "active" as const,
          },
          action: undefined,
        }
      : input.type === "clear_outcome"
        ? {
            ...state.engineInput!,
            task: {
              ...state.engineInput!.task,
              ...(state.engineInput!.task.activeStatus === "missed" ? { activeStatus: "pending" as const } : {}),
            },
            history: state.engineInput!.history.filter((row) => row.logicalDate !== input.logicalDate),
            action: undefined,
          }
      : input.type === "schedule_change"
        ? {
            ...engineInputForScheduleBoundary(state.engineInput!, input.scheduleBoundary),
            action,
          }
        : input.type === "calendar_override"
          ? {
              ...engineInputForCalendarOverride(state.engineInput!, input.calendarOverride),
              action,
            }
        : { ...state.engineInput!, ...(action ? { action } : {}) };
    engineResult = evaluateTaskState(engineInput);
    if (engineResult.validationErrors.length > 0) {
      throw new CanonicalCommandPlanningError("DOMAIN_VALIDATION_FAILED", engineResult.validationErrors.join(" "));
    }
  }

  const patch = input.type === "rollover" ? {} : baseTaskPatch(task);
  let projection: CanonicalCompatibilityProjection;
  let historyFact: CanonicalHistoryFactPlan | null = null;
  let automaticHistoryFacts: CanonicalHistoryFactPlan[] = [];
  let automaticHistoryDeleteIds: string[] = [];
  let occurrence: CanonicalTaskOccurrence | null = null;
  let scheduleBoundary: CanonicalTaskScheduleBoundary | null = null;
  let occurrenceEffectiveOverride: CanonicalTaskOccurrenceEffectiveOverride | null = null;
  let calendarOverride: CanonicalTaskCalendarOverride | null = null;

  switch (input.type) {
    case "handled_outcome": {
      projection = requireProjection(engineResult, task);
      historyFact = historyFactFor(input, command, input.logicalDate ?? command.logicalDay.logicalDate, input.outcome, input.effectiveDueOn ?? null);
      const outcomeDate = input.logicalDate ?? input.logicalDay.logicalDate;
      const existingOutcomeRow = state.engineInput?.history.find((row) => row.logicalDate === outcomeDate);
      if (historyFact && existingOutcomeRow) {
        historyFact.scheduled_due_on = input.scheduledDueOn ?? existingOutcomeRow.occurrenceDueOn ?? null;
      }
      if (historyFact && !historyFact.scheduled_due_on) {
        historyFact.scheduled_due_on = engineOccurrenceDueOnFor(engineResult, state.engineInput, outcomeDate, input.outcome);
      }
      occurrence = input.occurrence ?? null;
      automaticHistoryDeleteIds = engineResult?.proposedHistoryChanges.flatMap((change) => (
        change.type === "delete" ? [change.rowId] : []
      )) ?? [];
      patch.workflow_state = "none";
      patch.workflow_started_at = null;
      patch.workflow_logical_date = null;
      patch.workflow_occurrence_id = null;
      patch.workflow_command_id = null;
      patch.workflow_revision = (task.workflow_revision ?? 1) + 1;
      break;
    }
    case "complete": {
      projection = engineResult
        ? projectionFromEngine(task, engineResult)
        : {
            status: "complete",
            dueOn: null,
            completedAt: input.completedAt ?? `${input.logicalDate ?? input.logicalDay.logicalDate}T00:00:00.000Z`,
            activeStatusLogicalDate: null,
            activeOccurrenceDueOn: null,
          };
      projection.status = "complete";
      projection.dueOn = null;
      patch.terminal_state = "permanently_complete";
      patch.container_state = task.container_state ?? "active";
      patch.terminal_completed_at = projection.completedAt;
      patch.workflow_state = "none";
      patch.workflow_started_at = null;
      patch.workflow_logical_date = null;
      patch.workflow_occurrence_id = null;
      patch.workflow_command_id = null;
      patch.workflow_revision = (task.workflow_revision ?? 1) + 1;
      historyFact = historyFactFor(input, command, input.logicalDate ?? command.logicalDay.logicalDate, "complete");
      if (historyFact && !historyFact.scheduled_due_on) {
        historyFact.scheduled_due_on = engineOccurrenceDueOnFor(
          engineResult,
          state.engineInput,
          input.logicalDate ?? input.logicalDay.logicalDate,
          "complete",
        );
      }
      occurrence = input.occurrence ?? null;
      break;
    }
    case "workflow_start": {
      projection = { ...projectionForWorkflowClear(task, command.logicalDay.logicalDate), status: "in_progress" };
      patch.workflow_state = "in_progress";
      patch.workflow_started_at = input.startedAt;
      patch.workflow_logical_date = command.logicalDay.logicalDate;
      patch.workflow_occurrence_id = input.occurrenceId ?? null;
      patch.workflow_command_id = command.commandId;
      patch.workflow_revision = (task.workflow_revision ?? 1) + 1;
      break;
    }
    case "workflow_clear": {
      projection = projectionForWorkflowClear(task, command.logicalDay.logicalDate);
      patch.workflow_state = "none";
      patch.workflow_started_at = null;
      patch.workflow_logical_date = null;
      patch.workflow_occurrence_id = null;
      patch.workflow_command_id = null;
      patch.workflow_revision = (task.workflow_revision ?? 1) + 1;
      break;
    }
    case "archive":
    case "trash":
    case "restore": {
      patch.terminal_state = task.terminal_state ?? "active";
      const restoredState = input.type === "restore" ? restoredContainerState(task) : null;
      const restoredProjection = engineResult
        ? projectionFromEngine(task, engineResult)
        : projectionFromTask(task);
      if (input.type === "restore" && restoredState === "archived" && task.terminal_state !== "permanently_complete") {
        restoredProjection.status = "archived";
      }
      projection = {
        ...restoredProjection,
        status: input.type === "archive" ? "archived" : input.type === "trash" ? "trashed" : restoredProjection.status,
      };
      if (input.type === "archive") {
        patch.prior_container_state = task.container_state === "trashed" ? task.prior_container_state : "active";
        patch.prior_container_state_status = "proven";
        patch.container_state = "archived";
      } else if (input.type === "trash") {
        if (task.container_state === "trashed") {
          patch.prior_container_state = task.prior_container_state;
          patch.prior_container_state_status = task.prior_container_state_status;
          patch.container_state = "trashed";
          patch.container_trashed_at = task.container_trashed_at;
        } else {
          patch.prior_container_state = task.container_state === "active" || task.container_state === "archived" ? task.container_state : "active";
          patch.prior_container_state_status = "proven";
          patch.container_state = "trashed";
          patch.container_trashed_at = input.changedAt ?? new Date().toISOString();
        }
      } else {
        patch.container_state = restoredState;
        patch.prior_container_state = null;
        patch.prior_container_state_status = "not_applicable";
        patch.container_trashed_at = null;
      }
      break;
    }
    case "delay": {
      projection = requireProjection(engineResult, task);
      historyFact = historyFactFor(input, command, input.logicalDate ?? command.logicalDay.logicalDate, "delayed", input.effectiveDueOn);
      occurrence = input.occurrence ?? null;
      occurrenceEffectiveOverride = input.override ?? null;
      scheduleBoundary = input.scheduleBoundary ?? null;
      break;
    }
    case "schedule_change": {
      projection = requireProjection(engineResult, task);
      scheduleBoundary = input.scheduleBoundary;
      automaticHistoryFacts = engineResult?.proposedHistoryChanges.flatMap((change) => (
        change.type === "insert"
          && change.row.outcome === "missed"
          && change.row.provenance === "reconciliation"
          ? [automaticHistoryFactFor(command, change.row, input.scheduleBoundary.id)]
          : []
      )) ?? [];
      break;
    }
    case "calendar_override": {
      projection = requireProjection(engineResult, task);
      calendarOverride = input.calendarOverride;
      break;
    }
    case "clear_outcome": {
      projection = requireProjection(engineResult, task);
      occurrence = input.occurrence ?? null;
      break;
    }
    case "rollover": {
      projection = requireProjection(engineResult, task);
      const staleWorkflow = task.workflow_state === "in_progress"
        && task.workflow_logical_date !== null
        && task.workflow_logical_date === input.staleLogicalDate
        && task.workflow_logical_date < command.logicalDay.logicalDate;
      if (staleWorkflow) {
        patch.workflow_state = "none";
        patch.workflow_started_at = null;
        patch.workflow_logical_date = null;
        patch.workflow_occurrence_id = null;
        patch.workflow_command_id = null;
        patch.workflow_revision = (task.workflow_revision ?? 1) + 1;
      }
      const automaticHistory = engineResult?.proposedHistoryChanges.find((change) => (
        change.type === "insert"
        && change.row.outcome === "did_my_best"
        && change.row.provenance === "rollover"
        && change.row.logicalDate === input.staleLogicalDate
      ));
      if (automaticHistory?.type === "insert") {
        historyFact = historyFactFor(input, command, automaticHistory.row.logicalDate, "did_my_best");
        if (historyFact && !historyFact.scheduled_due_on) {
          historyFact.scheduled_due_on = engineOccurrenceDueOnFor(
            engineResult,
            state.engineInput,
            automaticHistory.row.logicalDate,
            "did_my_best",
          );
        }
      }
      automaticHistoryFacts = engineResult?.proposedHistoryChanges.flatMap((change) => {
        if (change.type !== "insert" || change.row.outcome !== "missed" || change.row.provenance !== "rollover") return [];
        return [automaticHistoryFactFor(command, change.row, input.scheduleBoundaryId ?? null)];
      }) ?? [];
      break;
    }
  }

  const normalizedResult = initialResult(command, task, projection, patch);
  normalizedResult.historyFact = historyFact;
  normalizedResult.automaticHistoryFacts = automaticHistoryFacts;
  normalizedResult.automaticHistoryDeleteIds = automaticHistoryDeleteIds;
  normalizedResult.occurrence = occurrence;
  normalizedResult.scheduleBoundary = scheduleBoundary;
  normalizedResult.occurrenceEffectiveOverride = occurrenceEffectiveOverride;
  normalizedResult.calendarOverride = calendarOverride;
  normalizedResult.rewardEntitlement = rewardPlan(command, historyFact);
  return { command, normalizedResult };
}

function commandProjection(command: CanonicalTaskStateCommand, task: CanonicalTaskRow): CanonicalCompatibilityProjection {
  if (command.type === "workflow_clear") return projectionForWorkflowClear(task, command.logicalDay.logicalDate);
  if (command.type === "archive") return { status: "archived", dueOn: task.due_on, completedAt: task.completed_at, activeStatusLogicalDate: task.active_status_logical_date, activeOccurrenceDueOn: task.active_occurrence_due_on };
  if (command.type === "trash") return { status: "trashed", dueOn: task.due_on, completedAt: task.completed_at, activeStatusLogicalDate: task.active_status_logical_date, activeOccurrenceDueOn: task.active_occurrence_due_on };
  return projectionFromTask(task);
}

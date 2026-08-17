import type { CanonicalTaskStateReadModel } from "../../../src/lib/task-state-canonical/read-model.ts";
import type { CanonicalEntityKind, CanonicalJsonObject, CanonicalLogicalDayContext, CanonicalTaskCalendarOverride, CanonicalTaskOccurrence, CanonicalTaskOccurrenceEffectiveOverride, CanonicalTaskScheduleBoundary } from "../../../src/lib/task-state-canonical/types.ts";
import type { CanonicalTaskStateCommand } from "../../../src/lib/task-state-canonical/command-service.ts";
import { deterministicUuid, sha256Digest } from "../../../src/lib/task-state-canonical/digest.ts";
import { resolveCanonicalWorkflowOccurrence } from "../../../src/lib/task-state-canonical/engine-input.ts";
import { occurrenceIdentity } from "../../../src/lib/task-state-engine/recurrence.ts";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const COMMAND_TYPES = new Set([
  "set_outcome", "complete_task", "delay_occurrence", "set_due_date", "set_repeat",
  "calendar_override", "archive_task", "trash_task", "restore_task", "start_in_progress",
  "clear_in_progress", "clear_outcome", "reconcile_rollover",
]);
const COMMON_KEYS = new Set(["type", "task_id", "replay_identity", "expected_revision"]);
const FORBIDDEN_KEYS = new Set([
  "user_id", "entity_id", "entity_kind", "command_id", "source_kind", "accepted_payload_digest",
  "task_patch", "canonical_task_patch", "compatibility_projection", "history_fact", "schedule_boundary",
  "occurrence", "occurrence_effective_override", "calendar_override", "reward_entitlement",
  "provenance_kind", "actor_kind", "actor_id", "source", "migration_operation_id", "migration_version",
  "classifier_version", "created_at", "updated_at", "revision", "source_legacy_history_id",
]);

export type ScheduleChangeIntent = {
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

export type TaskStateCommandIntent =
  | { type: "set_outcome"; task_id: string; replay_identity: string; expected_revision?: number; outcome: "done" | "did_my_best" | "missed"; logical_date?: string; occurrence_key?: string; scheduled_due_on?: string }
  | { type: "complete_task"; task_id: string; replay_identity: string; expected_revision?: number; logical_date?: string; occurrence_key?: string; scheduled_due_on?: string }
  | { type: "delay_occurrence"; task_id: string; replay_identity: string; expected_revision?: number; logical_date?: string; occurrence_key?: string; effective_due_on: string }
  | { type: "set_due_date"; task_id: string; replay_identity: string; expected_revision?: number; logical_date?: string; schedule: ScheduleChangeIntent; manual_action?: "unscheduled_status" }
  | { type: "set_repeat"; task_id: string; replay_identity: string; expected_revision?: number; logical_date?: string; schedule: ScheduleChangeIntent }
  | { type: "calendar_override"; task_id: string; replay_identity: string; expected_revision?: number; logical_date: string; override_state: "unscheduled" | "not_due" | "due_open"; reason?: string | null }
  | { type: "clear_outcome"; task_id: string; replay_identity: string; expected_revision?: number; logical_date: string; occurrence_key?: string; scheduled_due_on?: string }
  | { type: "archive_task" | "trash_task" | "restore_task" | "clear_in_progress" | "reconcile_rollover"; task_id: string; replay_identity: string; expected_revision?: number }
  | { type: "start_in_progress"; task_id: string; replay_identity: string; expected_revision?: number; occurrence_key?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY.test(value);
}

function isOptionalDate(value: unknown): value is string | null {
  return value === null || isDate(value);
}

function isString(value: unknown, min = 1, max = 256): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function exactOrSubsetKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function acceptedIntentValue(intent: TaskStateCommandIntent): CanonicalJsonObject {
  return Object.fromEntries(Object.entries(intent).filter(([, value]) => value !== undefined));
}

export type TrustedTaskStateCommandReplayDescriptor = {
  commandId: string;
  idempotenceIdentity: string;
  acceptedPayloadDigest: string;
  acceptedIntent: CanonicalJsonObject;
};

/**
 * The replay keys are derived only from verified owner identity and the
 * validated browser intent.  Server-derived canonical state never enters
 * this descriptor.
 */
export function buildTrustedTaskStateCommandReplayDescriptor(input: {
  userId: string;
  intent: TaskStateCommandIntent;
}): TrustedTaskStateCommandReplayDescriptor {
  const acceptedIntent = acceptedIntentValue(input.intent);
  return {
    commandId: deterministicUuid(`task-state-command:${input.userId}:${input.intent.replay_identity}`),
    idempotenceIdentity: `runtime:${input.intent.replay_identity}`,
    acceptedPayloadDigest: sha256Digest(acceptedIntent),
    acceptedIntent,
  };
}

function validScheduleIntent(value: unknown): value is ScheduleChangeIntent {
  if (!isRecord(value) || !exactOrSubsetKeys(value, new Set([
    "schedule_model", "repeat_frequency", "repeat_interval", "repeat_days_of_week", "repeat_day_of_month",
    "repeat_monthly_mode", "repeat_monthly_ordinal", "repeat_monthly_weekday", "one_time_due_on", "due_time", "anchor_date",
  ]))) return false;
  if (!["unscheduled", "one_time", "rolling", "fixed"].includes(String(value.schedule_model))) return false;
  if (value.repeat_frequency !== undefined && !["none", "daily", "weekly", "monthly", "custom", "daily_until_complete"].includes(String(value.repeat_frequency))) return false;
  if ((value.schedule_model === "unscheduled" || value.schedule_model === "one_time")
    && value.repeat_frequency !== undefined && value.repeat_frequency !== "none") return false;
  if (value.repeat_interval !== undefined && (!Number.isInteger(value.repeat_interval) || value.repeat_interval < 1)) return false;
  if (value.repeat_days_of_week !== undefined && (!Array.isArray(value.repeat_days_of_week) || value.repeat_days_of_week.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) return false;
  if (value.repeat_day_of_month !== undefined && value.repeat_day_of_month !== null && (!Number.isInteger(value.repeat_day_of_month) || value.repeat_day_of_month < 1 || value.repeat_day_of_month > 31)) return false;
  if (value.repeat_monthly_mode !== undefined && !["day_of_month", "ordinal_weekday"].includes(String(value.repeat_monthly_mode))) return false;
  if (value.repeat_monthly_ordinal !== undefined && value.repeat_monthly_ordinal !== null && !["first", "second", "third", "fourth", "last"].includes(String(value.repeat_monthly_ordinal))) return false;
  if (value.repeat_monthly_weekday !== undefined && value.repeat_monthly_weekday !== null && (!Number.isInteger(value.repeat_monthly_weekday) || value.repeat_monthly_weekday < 0 || value.repeat_monthly_weekday > 6)) return false;
  if (value.one_time_due_on !== undefined && !isOptionalDate(value.one_time_due_on)) return false;
  if (value.due_time !== undefined && value.due_time !== null && (typeof value.due_time !== "string" || !TIME_KEY.test(value.due_time))) return false;
  if (value.anchor_date !== undefined && !isOptionalDate(value.anchor_date)) return false;
  if (value.schedule_model === "one_time" && !isDate(value.one_time_due_on)) return false;
  return true;
}

export function validateTaskStateCommandIntent(value: unknown): TaskStateCommandIntent | null {
  if (!isRecord(value) || !COMMAND_TYPES.has(String(value.type))) return null;
  if (Object.keys(value).some((key) => FORBIDDEN_KEYS.has(key))) return null;
  if (!isString(value.task_id, 1, 128) || !isString(value.replay_identity, 1, 256)) return null;
  if (value.expected_revision !== undefined && (!Number.isInteger(value.expected_revision) || value.expected_revision < 1)) return null;
  const type = String(value.type);
  const allowed = new Set(COMMON_KEYS);
  if (type === "set_outcome") {
    ["outcome", "logical_date", "occurrence_key", "scheduled_due_on"].forEach((key) => allowed.add(key));
    if (!(value.outcome === "done" || value.outcome === "did_my_best" || value.outcome === "missed")) return null;
  } else if (type === "complete_task") {
    ["logical_date", "occurrence_key", "scheduled_due_on"].forEach((key) => allowed.add(key));
  } else if (type === "delay_occurrence") {
    ["logical_date", "occurrence_key", "effective_due_on"].forEach((key) => allowed.add(key));
    if (value.occurrence_key !== undefined && !isString(value.occurrence_key, 1, 256)) return null;
    if (!isDate(value.effective_due_on)) return null;
  } else if (type === "set_due_date" || type === "set_repeat") {
    ["logical_date", "schedule"].forEach((key) => allowed.add(key));
    if (type === "set_due_date") {
      allowed.add("manual_action");
      if (value.manual_action !== undefined && value.manual_action !== "unscheduled_status") return null;
    }
    if (!validScheduleIntent(value.schedule)) return null;
  } else if (type === "calendar_override") {
    ["logical_date", "override_state", "reason"].forEach((key) => allowed.add(key));
    if (!isDate(value.logical_date) || !["unscheduled", "not_due", "due_open"].includes(String(value.override_state))) return null;
    if (value.reason !== undefined && value.reason !== null && !isString(value.reason, 0, 512)) return null;
  } else if (type === "clear_outcome") {
    ["logical_date", "occurrence_key", "scheduled_due_on"].forEach((key) => allowed.add(key));
    if (!isDate(value.logical_date)) return null;
  } else if (type === "start_in_progress") {
    allowed.add("occurrence_key");
  }
  if (!exactOrSubsetKeys(value, allowed)) return null;
  for (const key of ["logical_date", "scheduled_due_on"]) {
    if (value[key] !== undefined && !isDate(value[key])) return null;
  }
  if (value.occurrence_key !== undefined && !isString(value.occurrence_key, 1, 256)) return null;
  return value as TaskStateCommandIntent;
}

function occurrenceFor(readModel: CanonicalTaskStateReadModel, key: string | undefined): CanonicalTaskOccurrence | null {
  if (!key) return null;
  const occurrence = readModel.occurrences.find((candidate) => candidate.occurrence_key === key);
  if (!occurrence) throw new Error("The requested canonical occurrence is unavailable.");
  return occurrence;
}

function currentBoundary(readModel: CanonicalTaskStateReadModel): CanonicalTaskScheduleBoundary {
  const boundary = [...readModel.scheduleBoundaries].sort((left, right) => right.boundary_sequence - left.boundary_sequence)[0];
  if (!boundary) throw new Error("The canonical schedule boundary is unavailable.");
  return boundary;
}

function materializeDelayOccurrence(readModel: CanonicalTaskStateReadModel, base: ReturnType<typeof commandBase>, now: string): CanonicalTaskOccurrence {
  const boundary = currentBoundary(readModel);
  if (boundary.schedule_model === "unscheduled") throw new Error("Delay requires a scheduled canonical occurrence.");
  const scheduledDueOn = boundary.schedule_model === "one_time"
    ? boundary.one_time_due_on
    : readModel.task.active_occurrence_due_on ?? readModel.task.due_on;
  if (!scheduledDueOn) throw new Error("Delay requires a scheduled canonical occurrence.");
  const occurrenceKey = occurrenceIdentity(base.taskId, scheduledDueOn);
  return {
    id: deterministicUuid(`${base.commandId}:occurrence:${occurrenceKey}`),
    user_id: base.userId,
    entity_id: base.taskId,
    entity_kind: base.entityKind,
    occurrence_key: occurrenceKey,
    scheduled_due_on: scheduledDueOn,
    source_boundary_id: boundary.id,
    recurrence_source_fingerprint: boundary.id,
    origin_kind: "proven",
    origin_confidence: boundary.anchor_confidence,
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: base.userId,
    source: "task_state_command",
    materialization_reason: "required_command_state",
    resolution_state: "unresolved",
    resolved_logical_date: null,
    resolved_outcome: null,
    resolved_history_id: null,
    command_id: base.commandId,
    migration_operation_id: null,
    revision: 1,
    created_at: now,
    updated_at: now,
  };
}

function commandBase(intent: TaskStateCommandIntent, userId: string, readModel: CanonicalTaskStateReadModel, logicalDay: CanonicalLogicalDayContext) {
  const entityKind = readModel.task.entity_kind;
  if (!entityKind) throw new Error("The canonical entity kind is unavailable.");
  if (!Number.isInteger(readModel.task.canonical_revision) || readModel.task.canonical_revision < 1) {
    throw new Error("Canonical Task State requires canonical_revision; legacy revision is not a substitute.");
  }
  const replay = buildTrustedTaskStateCommandReplayDescriptor({ userId, intent });
  const expectedBoundarySequence = readModel.scheduleBoundaries.length > 0
    ? readModel.scheduleBoundaries.reduce((latest, boundary) => Math.max(latest, boundary.boundary_sequence), 0)
    : undefined;
  return {
    commandId: replay.commandId,
    userId,
    taskId: readModel.task.id,
    entityKind,
    acceptedIntent: replay.acceptedIntent,
    expectedRevision: intent.expected_revision ?? readModel.task.canonical_revision,
    expectedBoundarySequence,
    logicalDay,
    idempotenceIdentity: replay.idempotenceIdentity,
    sourceKind: intent.type === "reconcile_rollover" ? "authorized_automation" as const : "runtime" as const,
  };
}

function serverScheduleBoundary(
  intent: Extract<TaskStateCommandIntent, { type: "set_due_date" | "set_repeat" }>,
  readModel: CanonicalTaskStateReadModel,
  base: ReturnType<typeof commandBase>,
  logicalDay: CanonicalLogicalDayContext,
  now: string,
): CanonicalTaskScheduleBoundary {
  const previous = currentBoundary(readModel);
  const schedule = intent.schedule;
  const scheduleModel = schedule.schedule_model;
  const recurring = scheduleModel === "rolling" || scheduleModel === "fixed";
  const repeatFrequency = recurring ? schedule.repeat_frequency ?? previous.repeat_frequency : "none";
  if (recurring && repeatFrequency === "none") throw new Error("A recurring schedule requires a repeat frequency.");
  const hasExplicitAnchor = schedule.anchor_date !== undefined && schedule.anchor_date !== null;
  const anchorDate = recurring ? schedule.anchor_date ?? previous.anchor_date : null;
  return {
    ...previous,
    id: deterministicUuid(`${base.commandId}:schedule`),
    entity_id: base.taskId,
    entity_kind: base.entityKind,
    effective_from_logical_date: intent.logical_date ?? logicalDay.logicalDate,
    boundary_sequence: previous.boundary_sequence + 1,
    boundary_type: intent.type === "set_repeat" ? "repeat_change" : "due_date_change",
    schedule_model: scheduleModel,
    repeat_frequency: repeatFrequency,
    repeat_interval: schedule.repeat_interval ?? previous.repeat_interval,
    repeat_days_of_week: schedule.repeat_days_of_week ?? previous.repeat_days_of_week,
    repeat_day_of_month: schedule.repeat_day_of_month ?? previous.repeat_day_of_month,
    repeat_monthly_mode: schedule.repeat_monthly_mode ?? previous.repeat_monthly_mode,
    repeat_monthly_ordinal: schedule.repeat_monthly_ordinal ?? previous.repeat_monthly_ordinal,
    repeat_monthly_weekday: schedule.repeat_monthly_weekday ?? previous.repeat_monthly_weekday,
    one_time_due_on: scheduleModel === "one_time" ? schedule.one_time_due_on ?? null : null,
    due_time: schedule.due_time ?? previous.due_time,
    anchor_date: anchorDate,
    anchor_kind: hasExplicitAnchor ? "user_selected" : recurring ? previous.anchor_kind : "unknown",
    anchor_confidence: hasExplicitAnchor ? "proven" : recurring ? previous.anchor_confidence : "unavailable",
    prior_boundary_id: previous.id,
    affected_occurrence_id: null,
    logical_day_settings_revision: logicalDay.settingsRevision,
    timezone: logicalDay.timezone,
    day_start_time: logicalDay.dayStartTime,
    actor_kind: "user",
    actor_id: base.userId,
    source: "task_state_command",
    command_id: base.commandId,
    idempotence_identity: base.idempotenceIdentity,
    migration_operation_id: null,
    migration_version: null,
    classifier_version: null,
    source_task_revision: readModel.task.revision,
    revision: 1,
    created_at: now,
    updated_at: now,
  };
}

function serverCalendarOverride(intent: Extract<TaskStateCommandIntent, { type: "calendar_override" }>, base: ReturnType<typeof commandBase>, logicalDay: CanonicalLogicalDayContext, now: string): CanonicalTaskCalendarOverride {
  return {
    id: deterministicUuid(`${base.commandId}:calendar`),
    user_id: base.userId,
    entity_id: base.taskId,
    entity_kind: base.entityKind,
    logical_date: intent.logical_date,
    override_state: intent.override_state,
    reason: intent.reason ?? null,
    is_active: true,
    cleared_at: null,
    cleared_by_command_id: null,
    provenance_kind: "manual",
    actor_kind: "user",
    actor_id: base.userId,
    source: "task_state_command",
    command_id: base.commandId,
    idempotence_identity: base.idempotenceIdentity,
    migration_operation_id: null,
    revision: 1,
    created_at: now,
  };
}

function serverDelayOverride(intent: Extract<TaskStateCommandIntent, { type: "delay_occurrence" }>, occurrence: CanonicalTaskOccurrence, readModel: CanonicalTaskStateReadModel, base: ReturnType<typeof commandBase>, now: string): CanonicalTaskOccurrenceEffectiveOverride {
  const previous = readModel.occurrenceEffectiveOverrides
    .filter((candidate) => candidate.occurrence_id === occurrence.id)
    .sort((left, right) => right.override_sequence - left.override_sequence)[0] ?? null;
  return {
    id: deterministicUuid(`${base.commandId}:delay`),
    user_id: base.userId,
    entity_id: base.taskId,
    occurrence_id: occurrence.id,
    scheduled_due_on: occurrence.scheduled_due_on,
    effective_due_on: intent.effective_due_on,
    action_logical_date: intent.logical_date ?? base.logicalDay.logicalDate,
    delay_kind: "delay",
    override_sequence: (previous?.override_sequence ?? 0) + 1,
    prior_override_id: previous?.id ?? null,
    prior_override_sequence: previous?.override_sequence ?? null,
    schedule_boundary_id: occurrence.source_boundary_id,
    history_id: null,
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: base.userId,
    source: "task_state_command",
    command_id: base.commandId,
    idempotence_identity: base.idempotenceIdentity,
    migration_operation_id: null,
    accepted_payload_digest: "server-computed",
    revision: 1,
    created_at: now,
    updated_at: now,
  };
}

export function buildTrustedTaskStateCommand(input: {
  intent: TaskStateCommandIntent;
  userId: string;
  readModel: CanonicalTaskStateReadModel;
  logicalDay: CanonicalLogicalDayContext;
  now: string;
}): CanonicalTaskStateCommand {
  const { intent, userId, readModel, logicalDay, now } = input;
  const base = commandBase(intent, userId, readModel, logicalDay);
  const occurrence = intent.type === "delay_occurrence" && !intent.occurrence_key
    ? materializeDelayOccurrence(readModel, base, now)
    : occurrenceFor(readModel, "occurrence_key" in intent ? intent.occurrence_key : undefined);
  const rolloverOccurrence = intent.type === "reconcile_rollover"
    ? resolveCanonicalWorkflowOccurrence(readModel)
    : null;
  switch (intent.type) {
    case "set_outcome":
      return { ...base, type: "handled_outcome", outcome: intent.outcome, logicalDate: intent.logical_date, occurrenceId: occurrence?.id ?? null, occurrenceKey: intent.occurrence_key ?? occurrence?.occurrence_key ?? null, scheduledDueOn: intent.scheduled_due_on ?? occurrence?.scheduled_due_on ?? null, occurrence: occurrence ?? undefined };
    case "complete_task":
      return { ...base, type: "complete", logicalDate: intent.logical_date, occurrenceId: occurrence?.id ?? null, occurrenceKey: intent.occurrence_key ?? occurrence?.occurrence_key ?? null, scheduledDueOn: intent.scheduled_due_on ?? occurrence?.scheduled_due_on ?? null, occurrence: occurrence ?? undefined };
    case "delay_occurrence": {
      if (!occurrence) throw new Error("Delay requires a canonical occurrence identity.");
      return { ...base, type: "delay", logicalDate: intent.logical_date, occurrenceId: occurrence.id, scheduledDueOn: occurrence.scheduled_due_on, effectiveDueOn: intent.effective_due_on, override: serverDelayOverride(intent, occurrence, readModel, base, now), occurrence };
    }
    case "set_due_date":
      return { ...base, type: "schedule_change", changeKind: "due_date", ...(intent.manual_action ? { manual_action: intent.manual_action } : {}), scheduleBoundary: serverScheduleBoundary(intent, readModel, base, logicalDay, now) };
    case "set_repeat":
      return { ...base, type: "schedule_change", changeKind: "repeat", scheduleBoundary: serverScheduleBoundary(intent, readModel, base, logicalDay, now) };
    case "calendar_override":
      return { ...base, type: "calendar_override", calendarOverride: serverCalendarOverride(intent, base, logicalDay, now) };
    case "clear_outcome":
      return { ...base, type: "clear_outcome", logicalDate: intent.logical_date, occurrenceId: occurrence?.id ?? null, occurrenceKey: intent.occurrence_key ?? occurrence?.occurrence_key ?? null, scheduledDueOn: intent.scheduled_due_on ?? occurrence?.scheduled_due_on ?? null, occurrence: occurrence ?? undefined };
    case "archive_task": return { ...base, type: "archive" };
    case "trash_task": return { ...base, type: "trash" };
    case "restore_task": return { ...base, type: "restore" };
    case "start_in_progress": return { ...base, type: "workflow_start", startedAt: now, occurrenceId: occurrence?.id ?? null };
    case "clear_in_progress": return { ...base, type: "workflow_clear" };
    case "reconcile_rollover":
      return {
        ...base,
        type: "rollover",
        staleLogicalDate: readModel.task.workflow_logical_date ?? null,
        occurrenceId: rolloverOccurrence?.id ?? null,
        occurrenceKey: rolloverOccurrence?.occurrence_key ?? null,
        scheduledDueOn: rolloverOccurrence?.scheduled_due_on ?? null,
      };
  }
}

export function commandIntentError(value: unknown) {
  return validateTaskStateCommandIntent(value) ? null : "Command intent is malformed or contains privileged persistence fields.";
}

export type { CanonicalEntityKind };

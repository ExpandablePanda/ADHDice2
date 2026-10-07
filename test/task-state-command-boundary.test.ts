import assert from "node:assert/strict";
import test from "node:test";
import { buildTrustedTaskStateCommand, buildTrustedTaskStateCommandReplayDescriptor, validateTaskStateCommandIntent, type ScheduleChangeIntent } from "../supabase/functions/task-state-command/domain.ts";
import { normalizeTaskStateCommand, planTaskStateCommand } from "../src/lib/task-state-canonical/command-service.ts";
import type { CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";
import type { CanonicalLogicalDayContext, CanonicalTaskOccurrence, CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";

const readModel = {
  task: {
    id: "task-1",
    user_id: "owner-1",
    entity_kind: "parent",
    revision: 3,
    canonical_revision: 3,
    status: "pending",
    due_on: "2026-08-10",
    repeat_frequency: "none",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    completed_at: null,
    active_status_logical_date: null,
    active_occurrence_due_on: null,
    terminal_state: "active",
    container_state: "active",
    workflow_state: "none",
  },
  scheduleBoundaries: [],
  occurrences: [],
  occurrenceEffectiveOverrides: [],
  historyFacts: [],
} as unknown as CanonicalTaskStateReadModel;

const logicalDay = {
  identity: "logical-day:owner-1:3:America/New_York:06:00:2026-08-10",
  logicalDate: "2026-08-10",
  timezone: "America/New_York",
  dayStartTime: "06:00",
  settingsRevision: 3,
};

function rebuiltReadModel(canonicalRevision: number, boundarySequence: number): CanonicalTaskStateReadModel {
  return {
    ...readModel,
    task: { ...readModel.task, canonical_revision: canonicalRevision, revision: canonicalRevision },
    scheduleBoundaries: [{ boundary_sequence: boundarySequence } as CanonicalTaskScheduleBoundary],
  } as CanonicalTaskStateReadModel;
}

function rebuiltLogicalDay(settingsRevision: number, logicalDate: string): CanonicalLogicalDayContext {
  return {
    identity: `logical-day:owner-1:${settingsRevision}:America/New_York:06:00:${logicalDate}`,
    logicalDate,
    timezone: "America/New_York",
    dayStartTime: "06:00",
    settingsRevision,
  };
}

function delayBoundary(overrides: Partial<CanonicalTaskScheduleBoundary> = {}): CanonicalTaskScheduleBoundary {
  return {
    id: "delay-boundary",
    user_id: "owner-1",
    entity_id: "task-1",
    entity_kind: "parent",
    effective_from_logical_date: "2026-08-10",
    boundary_sequence: 1,
    boundary_type: "initial",
    schedule_model: "fixed",
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    repeat_end_on: null,
    one_time_due_on: null,
    due_time: null,
    anchor_date: "2026-08-10",
    anchor_kind: "user_selected",
    anchor_confidence: "proven",
    historical_scope_known: true,
    prospective_only: false,
    prior_boundary_id: null,
    affected_occurrence_id: null,
    logical_day_settings_revision: 3,
    timezone: "America/New_York",
    day_start_time: "06:00",
    actor_kind: "user",
    actor_id: "owner-1",
    source: "task_state_command",
    command_id: null,
    idempotence_identity: "boundary:delay",
    schema_contract_version: "task-state-schema-v1",
    source_task_revision: 3,
    revision: 1,
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

function storedOccurrence(overrides: Partial<CanonicalTaskOccurrence> = {}): CanonicalTaskOccurrence {
  return {
    id: "stored-occurrence",
    user_id: "owner-1",
    entity_id: "task-1",
    entity_kind: "parent",
    occurrence_key: "task:task-1:occurrence:2026-08-10",
    scheduled_due_on: "2026-08-10",
    source_boundary_id: "delay-boundary",
    recurrence_source_fingerprint: "delay-boundary",
    origin_kind: "proven",
    origin_confidence: "proven",
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: "owner-1",
    source: "task-state-command",
    materialization_reason: "required_command_state",
    resolution_state: "unresolved",
    resolved_logical_date: null,
    resolved_outcome: null,
    resolved_history_id: null,
    command_id: null,
    revision: 1,
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

function delayReadModel(occurrences: CanonicalTaskOccurrence[], boundary = delayBoundary()): CanonicalTaskStateReadModel {
  return {
    ...readModel,
    task: { ...readModel.task, due_on: "2026-08-10", repeat_frequency: "daily" },
    scheduleBoundaries: [boundary],
    occurrences,
  } as unknown as CanonicalTaskStateReadModel;
}

function delayCommand(readModelForDelay: CanonicalTaskStateReadModel, replayIdentity: string, logicalDate = "2026-08-10") {
  return buildTrustedTaskStateCommand({
    intent: {
      type: "delay_occurrence",
      task_id: "task-1",
      replay_identity: replayIdentity,
      expected_revision: 3,
      logical_date: logicalDate,
      effective_due_on: "2026-08-11",
    },
    userId: "owner-1",
    readModel: readModelForDelay,
    logicalDay,
    now: "2026-08-10T12:00:00.000Z",
  });
}

test("browser intent accepts only command input and derives identity from the authenticated owner", () => {
  const intent = {
    type: "set_outcome",
    task_id: "task-1",
    replay_identity: "ui-action-1",
    expected_revision: 3,
    outcome: "done",
  } as const;
  assert.deepEqual(validateTaskStateCommandIntent(intent), intent);
  const command = buildTrustedTaskStateCommand({ intent, userId: "owner-1", readModel, logicalDay, now: "2026-08-10T12:00:00.000Z" });
  assert.equal(command.userId, "owner-1");
  assert.equal(command.sourceKind, "runtime");
  assert.equal(command.idempotenceIdentity, "runtime:ui-action-1");
  assert.equal(command.type, "handled_outcome");
  assert.equal("task_patch" in command, false);
  const descriptor = buildTrustedTaskStateCommandReplayDescriptor({ userId: "owner-1", intent });
  const normalized = normalizeTaskStateCommand(command);
  assert.equal(command.commandId, descriptor.commandId);
  assert.equal(command.idempotenceIdentity, descriptor.idempotenceIdentity);
  assert.equal(normalized.acceptedPayloadDigest, descriptor.acceptedPayloadDigest);
});

test("server Delay reuses an existing non-superseded occurrence for the logical date", () => {
  const existing = storedOccurrence();
  const command = delayCommand(delayReadModel([existing]), "delay-existing");

  assert.equal(command.type, "delay");
  assert.equal(command.occurrence?.id, existing.id);
  assert.equal(command.override?.occurrence_id, existing.id);
});

test("server Delay does not reuse a superseded occurrence", () => {
  const superseded = storedOccurrence({ id: "superseded-occurrence", resolution_state: "superseded" });
  const command = delayCommand(delayReadModel([superseded]), "delay-superseded");

  assert.equal(command.type, "delay");
  assert.notEqual(command.occurrence?.id, superseded.id);
  assert.equal(command.occurrence?.scheduled_due_on, "2026-08-10");
  assert.equal(command.occurrence?.source_boundary_id, "delay-boundary");
});

test("server Delay materializes a proven replacement when superseded is the only stored occurrence", () => {
  const superseded = storedOccurrence({ id: "superseded-only", resolution_state: "superseded" });
  const command = delayCommand(delayReadModel([superseded]), "delay-materialize");

  assert.equal(command.type, "delay");
  assert.equal(command.occurrence?.origin_kind, "proven");
  assert.equal(command.occurrence?.resolution_state, "unresolved");
  assert.equal(command.override?.scheduled_due_on, "2026-08-10");
  assert.notEqual(command.occurrence?.id, superseded.id);
});

test("server Delay fails closed when no canonical schedule boundary proves the requested date", () => {
  const oneTimeBoundary = delayBoundary({
    schedule_model: "one_time",
    repeat_frequency: "none",
    one_time_due_on: "2026-08-10",
    anchor_date: null,
  });

  assert.throws(
    () => delayCommand(delayReadModel([], oneTimeBoundary), "delay-unproven", "2026-08-11"),
    /No canonical schedule occurrence can be proven/,
  );
});

test("manual Blank uses the canonical blank_due Calendar override intent", () => {
  const intent = {
    type: "calendar_override",
    task_id: "task-1",
    replay_identity: "calendar-blank-1",
    logical_date: "2026-08-10",
    override_state: "blank_due",
  } as const;

  assert.deepEqual(validateTaskStateCommandIntent(intent), intent);
  const command = buildTrustedTaskStateCommand({ intent, userId: "owner-1", readModel, logicalDay, now: "2026-08-10T12:00:00.000Z" });
  assert.equal(command.type, "calendar_override");
  assert.equal(command.calendarOverride?.override_state, "blank_due");
});

test("dated In Progress uses the canonical Calendar override intent and is not a History outcome", () => {
  const intent = {
    type: "calendar_override",
    task_id: "task-1",
    replay_identity: "calendar-in-progress-1",
    logical_date: "2026-08-10",
    override_state: "in_progress",
  } as const;

  assert.deepEqual(validateTaskStateCommandIntent(intent), intent);
  const command = buildTrustedTaskStateCommand({ intent, userId: "owner-1", readModel, logicalDay, now: "2026-08-10T12:00:00.000Z" });
  assert.equal(command.type, "calendar_override");
  assert.equal(command.calendarOverride?.override_state, "in_progress");
  assert.equal("historyFact" in command, false);
});

test("explicit Unscheduled marker survives Edge validation and canonical command normalization", () => {
  const intent = {
    type: "set_due_date",
    task_id: "task-1",
    replay_identity: "ui-unscheduled-1",
    logical_date: "2026-08-10",
    manual_action: "unscheduled_status",
    schedule: { schedule_model: "unscheduled", repeat_frequency: "none" },
  } as const;
  assert.deepEqual(validateTaskStateCommandIntent(intent), intent);
  const command = buildTrustedTaskStateCommand({ intent, userId: "owner-1", readModel: rebuiltReadModel(3, 7), logicalDay, now: "2026-08-10T12:00:00.000Z" });
  assert.equal(command.type, "schedule_change");
  assert.equal(command.manual_action, "unscheduled_status");
  assert.equal(normalizeTaskStateCommand(command).payload.manual_action, "unscheduled_status");
});

test("repeat End Date is accepted only for validated recurring schedule intents", () => {
  const repeating = {
    type: "set_repeat",
    task_id: "task-1",
    replay_identity: "repeat-end-date-1",
    schedule: {
      schedule_model: "fixed",
      repeat_frequency: "weekly",
      repeat_interval: 1,
      repeat_days_of_week: [4],
      anchor_date: "2026-10-01",
      repeat_end_on: "2026-10-15",
    },
  } as const;
  assert.deepEqual(validateTaskStateCommandIntent(repeating), repeating);
  assert.equal(scheduleCommand(repeating.schedule, repeating.replay_identity).scheduleBoundary?.repeat_end_on, "2026-10-15");

  const cleared = {
    ...repeating,
    replay_identity: "repeat-end-date-clear-1",
    schedule: { ...repeating.schedule, repeat_end_on: null },
  } as const;
  assert.deepEqual(validateTaskStateCommandIntent(cleared), cleared);
  assert.equal(scheduleCommand(cleared.schedule, cleared.replay_identity).scheduleBoundary?.repeat_end_on, null);

  for (const invalid of ["2026-02-30", "2026-1-15", "not-a-date", 20261015, {}, []]) {
    assert.equal(validateTaskStateCommandIntent({
      ...repeating,
      replay_identity: `repeat-end-date-invalid-${String(invalid)}`,
      schedule: { ...repeating.schedule, repeat_end_on: invalid },
    }), null, `invalid End Date ${String(invalid)} must be rejected`);
  }

  assert.equal(validateTaskStateCommandIntent({
    ...repeating,
    replay_identity: "repeat-end-date-unscheduled",
    schedule: { schedule_model: "unscheduled", repeat_frequency: "none", repeat_end_on: "2026-10-15" },
  }), null);
  assert.equal(validateTaskStateCommandIntent({
    ...repeating,
    replay_identity: "repeat-end-date-one-time",
    schedule: { schedule_model: "one_time", repeat_frequency: "none", one_time_due_on: "2026-10-10", repeat_end_on: "2026-10-15" },
  }), null);
});

function monthlyBoundary(overrides: Partial<CanonicalTaskScheduleBoundary> = {}) {
  return {
    id: "previous-boundary",
    user_id: "owner-1",
    entity_id: "task-1",
    entity_kind: "parent",
    effective_from_logical_date: "2026-08-10",
    boundary_sequence: 4,
    boundary_type: "initial",
    schedule_model: "fixed",
    repeat_frequency: "monthly",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: 5,
    repeat_monthly_mode: "ordinal_weekday",
    repeat_monthly_ordinal: "third",
    repeat_monthly_weekday: 3,
    one_time_due_on: null,
    due_time: "09:30",
    anchor_date: "2026-08-10",
    anchor_kind: "user_selected",
    anchor_confidence: "proven",
    ...overrides,
  } as CanonicalTaskScheduleBoundary;
}

function scheduleCommand(schedule: ScheduleChangeIntent, replayIdentity: string, previousBoundary = monthlyBoundary()) {
  return buildTrustedTaskStateCommand({
    intent: {
      type: "set_repeat",
      task_id: "task-1",
      replay_identity: replayIdentity,
      expected_revision: 3,
      schedule,
    },
    userId: "owner-1",
    readModel: {
      ...readModel,
      scheduleBoundaries: [previousBoundary],
    } as unknown as CanonicalTaskStateReadModel,
    logicalDay,
    now: "2026-08-10T12:00:00.000Z",
  });
}

test("schedule-boundary construction treats explicit null as a clear", () => {
  const clearMonthly: ScheduleChangeIntent = {
    schedule_model: "rolling",
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
  };
  const cases: ScheduleChangeIntent[] = [
    clearMonthly,
    { ...clearMonthly, repeat_frequency: "daily_until_complete" },
    { ...clearMonthly, schedule_model: "fixed", repeat_frequency: "weekly", repeat_days_of_week: [3] },
    { ...clearMonthly, schedule_model: "fixed", repeat_frequency: "weekly", repeat_days_of_week: [1, 2, 3, 4, 5] },
  ];

  for (const [index, schedule] of cases.entries()) {
    const boundary = scheduleCommand(schedule, `clear-monthly-${index}`).scheduleBoundary;
    assert.equal(boundary?.repeat_day_of_month, null);
    assert.equal(boundary?.repeat_monthly_ordinal, null);
    assert.equal(boundary?.repeat_monthly_weekday, null);
  }
});

test("ordinal Monthly replacement clears day-of-month while omitted fields inherit", () => {
  const boundary = scheduleCommand({
    schedule_model: "fixed",
    repeat_frequency: "monthly",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "ordinal_weekday",
    repeat_monthly_ordinal: "third",
    repeat_monthly_weekday: 3,
  }, "ordinal-monthly").scheduleBoundary;
  assert.equal(boundary?.repeat_day_of_month, null);
  assert.equal(boundary?.repeat_monthly_ordinal, "third");
  assert.equal(boundary?.repeat_monthly_weekday, 3);

  const omitted = scheduleCommand({ schedule_model: "fixed", repeat_frequency: "weekly" }, "omitted-fields").scheduleBoundary;
  assert.equal(omitted?.repeat_day_of_month, 5);
  assert.equal(omitted?.repeat_monthly_ordinal, "third");
  assert.equal(omitted?.repeat_monthly_weekday, 3);
});

test("due_time preserves omission and clears explicit null", () => {
  const omitted = scheduleCommand({ schedule_model: "fixed", repeat_frequency: "weekly" }, "omitted-time").scheduleBoundary;
  assert.equal(omitted?.due_time, "09:30");
  const cleared = scheduleCommand({ schedule_model: "fixed", repeat_frequency: "weekly", due_time: null }, "cleared-time").scheduleBoundary;
  assert.equal(cleared?.due_time, null);
});

test("Quota to Weekdays clears quota state at the canonical schedule boundary", () => {
  const previous = monthlyBoundary({
    repeat_frequency: "per_week",
    repeat_quota_count: 5,
    repeat_quota_balance_enabled: true,
  });
  const boundary = scheduleCommand({
    schedule_model: "fixed",
    repeat_frequency: "weekly",
    repeat_interval: 1,
    repeat_days_of_week: [1, 2, 3, 4, 5],
  }, "quota-to-weekdays", previous).scheduleBoundary;

  assert.equal(boundary?.repeat_frequency, "weekly");
  assert.deepEqual(boundary?.repeat_days_of_week, [1, 2, 3, 4, 5]);
  assert.equal(boundary?.repeat_quota_count, null);
  assert.equal(boundary?.repeat_quota_balance_enabled, false);
});

test("accepted intent digest survives replay rebuilds with newer canonical and server-derived state", () => {
  const intent = {
    type: "start_in_progress",
    task_id: "task-1",
    replay_identity: "ui-replay-1",
  } as const;
  const firstReadModel = rebuiltReadModel(3, 7);
  const secondReadModel = rebuiltReadModel(4, 8);
  const firstCommand = buildTrustedTaskStateCommand({
    intent,
    userId: "owner-1",
    readModel: firstReadModel,
    logicalDay: rebuiltLogicalDay(3, "2026-08-10"),
    now: "2026-08-10T12:00:00.000Z",
  });
  const secondCommand = buildTrustedTaskStateCommand({
    intent,
    userId: "owner-1",
    readModel: secondReadModel,
    logicalDay: rebuiltLogicalDay(4, "2026-08-11"),
    now: "2026-08-11T12:01:00.000Z",
  });
  const first = planTaskStateCommand({ task: firstReadModel.task }, firstCommand);
  const second = planTaskStateCommand({ task: secondReadModel.task }, secondCommand);

  assert.equal(first.command.commandId, second.command.commandId);
  assert.equal(first.command.idempotenceIdentity, second.command.idempotenceIdentity);
  assert.equal(first.command.acceptedPayloadDigest, second.command.acceptedPayloadDigest);
  assert.notEqual(first.command.expectedRevision, second.command.expectedRevision);
  assert.notEqual(first.command.expectedBoundarySequence, second.command.expectedBoundarySequence);
  assert.notEqual(first.command.logicalDay.identity, second.command.logicalDay.identity);
  assert.notEqual(firstCommand.startedAt, secondCommand.startedAt);
});

test("explicit expected revision remains in the accepted intent while omitted revision stays rebuildable", () => {
  const omittedIntent = {
    type: "archive_task",
    task_id: "task-1",
    replay_identity: "ui-replay-2",
  } as const;
  const explicitIntent = { ...omittedIntent, expected_revision: 3 } as const;
  const firstReadModel = rebuiltReadModel(3, 7);
  const secondReadModel = rebuiltReadModel(4, 8);
  const omittedFirst = buildTrustedTaskStateCommand({ intent: omittedIntent, userId: "owner-1", readModel: firstReadModel, logicalDay, now: "2026-08-10T12:00:00.000Z" });
  const omittedRetry = buildTrustedTaskStateCommand({ intent: omittedIntent, userId: "owner-1", readModel: secondReadModel, logicalDay: rebuiltLogicalDay(4, "2026-08-11"), now: "2026-08-11T12:01:00.000Z" });
  const explicitFirst = buildTrustedTaskStateCommand({ intent: explicitIntent, userId: "owner-1", readModel: firstReadModel, logicalDay, now: "2026-08-10T12:00:00.000Z" });
  const explicitRetry = buildTrustedTaskStateCommand({ intent: explicitIntent, userId: "owner-1", readModel: secondReadModel, logicalDay: rebuiltLogicalDay(4, "2026-08-11"), now: "2026-08-11T12:01:00.000Z" });

  const omittedFirstPlan = planTaskStateCommand({ task: firstReadModel.task }, omittedFirst);
  const omittedRetryPlan = planTaskStateCommand({ task: secondReadModel.task }, omittedRetry);
  const explicitFirstPlan = planTaskStateCommand({ task: firstReadModel.task }, explicitFirst);
  const explicitRetryPlan = planTaskStateCommand({ task: secondReadModel.task }, explicitRetry);
  assert.equal(omittedFirst.expectedRevision, 3);
  assert.equal(omittedRetry.expectedRevision, 4);
  assert.equal(explicitFirst.expectedRevision, 3);
  assert.equal(explicitRetry.expectedRevision, 3);
  assert.equal(omittedFirstPlan.command.acceptedPayloadDigest, omittedRetryPlan.command.acceptedPayloadDigest);
  assert.equal(explicitFirstPlan.command.acceptedPayloadDigest, explicitRetryPlan.command.acceptedPayloadDigest);
  assert.notEqual(omittedFirstPlan.command.acceptedPayloadDigest, explicitFirstPlan.command.acceptedPayloadDigest);
});

test("changed intent with the same replay identity produces a different digest", () => {
  const firstIntent = { type: "archive_task", task_id: "task-1", replay_identity: "ui-replay-3" } as const;
  const changedIntent = { type: "trash_task", task_id: "task-1", replay_identity: "ui-replay-3" } as const;
  const first = planTaskStateCommand({ task: readModel.task }, buildTrustedTaskStateCommand({ intent: firstIntent, userId: "owner-1", readModel, logicalDay, now: "2026-08-10T12:00:00.000Z" }));
  const changed = planTaskStateCommand({ task: readModel.task }, buildTrustedTaskStateCommand({ intent: changedIntent, userId: "owner-1", readModel, logicalDay, now: "2026-08-10T12:00:01.000Z" }));
  assert.equal(first.command.commandId, changed.command.commandId);
  assert.equal(first.command.idempotenceIdentity, changed.command.idempotenceIdentity);
  assert.notEqual(first.command.acceptedPayloadDigest, changed.command.acceptedPayloadDigest);
});

test("intent validation rejects privileged canonical output and caller provenance", () => {
  const base = { type: "archive_task", task_id: "task-1", replay_identity: "ui-action-2" };
  for (const key of ["task_patch", "history_fact", "schedule_boundary", "compatibility_projection", "accepted_payload_digest", "source_kind", "user_id"]) {
    assert.equal(validateTaskStateCommandIntent({ ...base, [key]: {} }), null, key);
  }
  assert.equal(validateTaskStateCommandIntent({
    type: "set_repeat",
    task_id: "task-1",
    replay_identity: "ui-action-3",
    schedule: { id: "caller-row-id", schedule_model: "rolling" },
  }), null);
});

test("explicit Missed is a supported intent while unsupported planner commands fail closed", () => {
  assert.ok(validateTaskStateCommandIntent({
    type: "set_outcome",
    task_id: "task-1",
    replay_identity: "ui-action-4",
    outcome: "missed",
  }));
  assert.equal(validateTaskStateCommandIntent({
    type: "clear_outcome",
    task_id: "task-1",
    replay_identity: "ui-action-5",
  }), null);
});

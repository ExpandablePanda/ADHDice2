import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "../src/lib/database.types.ts";
import {
  planTaskStateCommand,
  serializeCanonicalTaskStateCommandForRpc,
  type CanonicalCommandPlanningState,
  type CanonicalTaskStateCommand,
} from "../src/lib/task-state-canonical/command-service.ts";
import { sha256Hex } from "../src/lib/task-state-canonical/digest.ts";
import { buildCanonicalTaskStateEngineInput } from "../src/lib/task-state-canonical/engine-input.ts";
import type { CanonicalTaskRow, CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";
import type { CanonicalTaskOccurrence, CanonicalTaskOccurrenceEffectiveOverride, CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";
import type { TaskStateHistoryRow } from "../src/lib/task-state-engine/types.ts";
import { buildTaskEffectiveTimeline } from "../src/lib/task-state-engine/effective-timeline.ts";
import { evaluateTaskState } from "../src/lib/task-state-engine/engine.ts";
import { buildTrustedTaskStateCommand } from "../supabase/functions/task-state-command/domain.ts";

const logicalDay = {
  identity: "user-1:2026-08-10:America/New_York:06:00:3",
  logicalDate: "2026-08-10",
  timezone: "America/New_York",
  dayStartTime: "06:00",
  settingsRevision: 3,
};

function task(overrides: Partial<CanonicalTaskRow> = {}): CanonicalTaskRow {
  return {
    id: "task-1",
    user_id: "user-1",
    parent_task_id: null,
    revision: 4,
    title: "Canonical task",
    notes: null,
    status: "pending",
    priority: "normal",
    energy: "none",
    is_urgent: false,
    is_important: false,
    due_on: "2026-08-10",
    active_status_logical_date: null,
    active_occurrence_due_on: null,
    scheduled_on: null,
    due_time: null,
    estimated_minutes: null,
    actual_seconds: 0,
    tags: [],
    external_link_label: null,
    external_link_url: null,
    one_step_at_a_time: false,
    subtasks_auto_reset: false,
    repeat_frequency: "none",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    pinned_at: null,
    pin_order: null,
    sort_order: 0,
    completed_at: null,
    trashed_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    canonicalization_status: "canonical_runtime",
    entity_kind: "parent",
    terminal_state: "active",
    container_state: "active",
    prior_container_state: null,
    prior_container_state_status: "not_applicable",
    terminal_completed_at: null,
    container_trashed_at: null,
    workflow_state: "none",
    workflow_started_at: null,
    workflow_logical_date: null,
    workflow_occurrence_id: null,
    workflow_command_id: null,
    workflow_revision: 1,
    canonical_revision: 4,
    canonical_created_at: "2026-08-01T00:00:00.000Z",
    canonical_updated_at: "2026-08-01T00:00:00.000Z",
    projection_source_canonical_revision: 4,
    projection_source_fingerprint: "seed",
    projection_version: "task-state-projection-v1",
    ...overrides,
  } as CanonicalTaskRow;
}

function state(overrides: Partial<CanonicalTaskRow> = {}): CanonicalCommandPlanningState {
  const row = task(overrides);
  return {
    task: row,
    engineInput: {
      task: {
        id: row.id,
        lifecycle: "active",
        activeStatus: row.status === "in_progress" ? "in_progress" : "pending",
        dueOn: row.due_on,
        activeStatusLogicalDate: row.active_status_logical_date,
        activeOccurrenceDueOn: row.active_occurrence_due_on,
        recurrence: row.repeat_frequency === "daily"
          ? { kind: "rolling", intervalDays: Math.max(1, row.repeat_interval) }
          : { kind: "none" },
      },
      history: [],
      now: "2026-08-10T12:00:00.000Z",
      timezone: logicalDay.timezone,
      logicalDayRollover: logicalDay.dayStartTime,
    },
  };
}

function missedHistory(logicalDate: string, occurrenceDueOn = logicalDate): TaskStateHistoryRow {
  return {
    id: `missed-${logicalDate}`,
    taskId: "task-1",
    logicalDate,
    outcome: "missed",
    provenance: "manual",
    occurredAt: `${logicalDate}T12:00:00.000Z`,
    occurrenceIdentity: `task-state:task-1:${occurrenceDueOn}`,
    occurrenceDueOn,
  };
}

function doneHistory(logicalDate: string, occurrenceDueOn = logicalDate): TaskStateHistoryRow {
  return {
    ...missedHistory(logicalDate, occurrenceDueOn),
    id: `done-${logicalDate}`,
    outcome: "done",
  };
}

function command(overrides: Partial<CanonicalTaskStateCommand> = {}): CanonicalTaskStateCommand {
  const result = {
    type: "handled_outcome",
    commandId: "00000000-0000-4000-8000-000000000001",
    userId: "user-1",
    taskId: "task-1",
    entityKind: "parent",
    expectedRevision: 4,
    logicalDay,
    outcome: "did_my_best",
    ...overrides,
  } as CanonicalTaskStateCommand;
  return {
    ...result,
    acceptedIntent: {
      type: result.type === "handled_outcome" ? "set_outcome" : result.type,
      task_id: result.taskId,
      replay_identity: result.idempotenceIdentity ?? "test-replay",
      ...(result.type === "handled_outcome" ? { outcome: result.outcome } : {}),
    },
  };
}

function boundary(scheduleModel: CanonicalTaskScheduleBoundary["schedule_model"]): CanonicalTaskScheduleBoundary {
  return {
    id: `boundary-${scheduleModel}`,
    user_id: "user-1",
    entity_id: "task-1",
    entity_kind: "parent",
    effective_from_logical_date: "2026-08-10",
    boundary_sequence: 2,
    boundary_type: "due_date_change",
    schedule_model: scheduleModel,
    repeat_frequency: scheduleModel === "unscheduled" || scheduleModel === "one_time" ? "none" : "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    one_time_due_on: scheduleModel === "one_time" ? "2026-08-10" : null,
    due_time: null,
    anchor_date: scheduleModel === "unscheduled" ? null : "2026-08-10",
    anchor_kind: scheduleModel === "unscheduled" ? "unknown" : "user_selected",
    anchor_confidence: scheduleModel === "unscheduled" ? "unavailable" : "proven",
    historical_scope_known: true,
    prospective_only: false,
    prior_boundary_id: "00000000-0000-4000-8000-000000000010",
    affected_occurrence_id: null,
    logical_day_settings_revision: 3,
    timezone: "America/New_York",
    day_start_time: "06:00",
    actor_kind: "user",
    actor_id: "user-1",
    source: "task_state_command",
    command_id: null,
    idempotence_identity: `boundary:${scheduleModel}`,
    migration_operation_id: null,
    migration_version: null,
    classifier_version: null,
    schema_contract_version: "task-state-schema-v1",
    source_task_revision: 4,
    revision: 1,
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:00:00.000Z",
  };
}

test("trusted digest uses SHA-256", () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("command ID and payload identity are stable for replay", () => {
  const first = planTaskStateCommand(state(), command());
  const second = planTaskStateCommand(state(), command());
  assert.equal(first.command.commandId, second.command.commandId);
  assert.equal(first.command.idempotenceIdentity, second.command.idempotenceIdentity);
  assert.equal(first.command.acceptedPayloadDigest, second.command.acceptedPayloadDigest);
  assert.equal(serializeCanonicalTaskStateCommandForRpc(first).command_id, first.command.commandId);
  assert.match(first.command.acceptedPayloadDigest, /^sha256-[0-9a-f]{64}$/);
});

test("clear_outcome RPC serialization preserves its clear date without side effects", () => {
  const plan = planTaskStateCommand(state(), command({
    type: "clear_outcome",
    commandId: "00000000-0000-4000-8000-000000000016",
    logicalDate: "2026-08-09",
  }));
  const serialized = serializeCanonicalTaskStateCommandForRpc(plan);
  const payload = serialized.payload as Record<string, unknown>;

  assert.equal(payload.clear_logical_date, "2026-08-09");
  assert.equal(plan.normalizedResult.historyFact, null);
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
  assert.equal(payload.history_fact, undefined);
  assert.equal(payload.reward_program_version, undefined);
  assert.equal(payload.schedule_boundary, undefined);
  assert.equal(payload.calendar_override, undefined);
  assert.equal(payload.occurrence, undefined);
  assert.equal(payload.occurrence_effective_override, undefined);
});

test("clearing today's explicit Missed recomputes Pending from the remaining schedule", () => {
  const planningState = state({ status: "missed", due_on: "2026-08-10" });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: { ...planningState.engineInput!.task, activeStatus: "missed", dueOn: "2026-08-10" },
    history: [missedHistory("2026-08-10")],
  };
  const plan = planTaskStateCommand(planningState, command({
    type: "clear_outcome",
    commandId: "00000000-0000-4000-8000-000000000017",
    logicalDate: "2026-08-10",
  }));

  assert.equal(plan.normalizedResult.compatibilityProjection.status, "pending");
  assert.equal(plan.normalizedResult.historyFact, null);
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
});

test("clearing an overdue explicit Missed preserves calculated Missed when still warranted", () => {
  const planningState = state({ status: "missed", due_on: "2026-08-09" });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: { ...planningState.engineInput!.task, activeStatus: "missed", dueOn: "2026-08-09" },
    history: [missedHistory("2026-08-09")],
  };
  const plan = planTaskStateCommand(planningState, command({
    type: "clear_outcome",
    commandId: "00000000-0000-4000-8000-000000000019",
    logicalDate: "2026-08-09",
  }));

  assert.equal(plan.normalizedResult.compatibilityProjection.status, "missed");
  assert.equal(plan.normalizedResult.historyFact, null);
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
});

test("reusing an idempotence identity with a different intent produces a different accepted digest", () => {
  const first = planTaskStateCommand(state(), command({ idempotenceIdentity: "runtime:replay-mismatch", outcome: "did_my_best" }));
  const second = planTaskStateCommand(state(), command({ idempotenceIdentity: "runtime:replay-mismatch", outcome: "missed" }));
  assert.equal(first.command.idempotenceIdentity, second.command.idempotenceIdentity);
  assert.notEqual(first.command.acceptedPayloadDigest, second.command.acceptedPayloadDigest);
});

test("explicit Missed remains a set_outcome History command without reward eligibility", () => {
  const plan = planTaskStateCommand(state(), command({ outcome: "missed" }));
  assert.equal(plan.command.commandType, "set_outcome");
  assert.equal(plan.normalizedResult.historyFact?.outcome, "missed");
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
});

test("handled Done uses the engine-derived projection for a recurring task", () => {
  const plan = planTaskStateCommand(state({ repeat_frequency: "daily" }), command({
    commandId: "00000000-0000-4000-8000-000000000014",
    outcome: "done",
  }));
  assert.equal(plan.normalizedResult.historyFact?.outcome, "done");
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "upcoming");
});

function staleRolloverState(overrides: Partial<CanonicalTaskRow> = {}): CanonicalCommandPlanningState {
  const planningState = state({
    status: "in_progress",
    due_on: "2026-08-09",
    repeat_frequency: "daily",
    workflow_state: "in_progress",
    workflow_logical_date: "2026-08-09",
    workflow_occurrence_id: null,
    workflow_command_id: "00000000-0000-4000-8000-000000000040",
    workflow_revision: 2,
    ...overrides,
  });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: {
      ...planningState.engineInput!.task,
      activeStatus: "in_progress",
      dueOn: "2026-08-09",
      activeStatusLogicalDate: "2026-08-09",
      activeOccurrenceDueOn: null,
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
    workflow: {
      state: "in_progress",
      logicalDate: "2026-08-09",
      occurrenceId: null,
      commandId: "00000000-0000-4000-8000-000000000040",
      revision: 2,
    },
  };
  return planningState;
}

function canonicalOccurrence(overrides: Partial<CanonicalTaskOccurrence> = {}): CanonicalTaskOccurrence {
  return {
    id: "occurrence-A",
    user_id: "user-1",
    entity_id: "task-1",
    entity_kind: "parent",
    occurrence_key: "task:task-1:occurrence:2026-08-09",
    scheduled_due_on: "2026-08-09",
    source_boundary_id: "boundary-rolling",
    recurrence_source_fingerprint: "boundary-rolling",
    origin_kind: "proven",
    origin_confidence: "proven",
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: "user-1",
    source: "task_state_command",
    materialization_reason: "required_command_state",
    resolution_state: "unresolved",
    resolved_logical_date: null,
    resolved_outcome: null,
    resolved_history_id: null,
    command_id: null,
    migration_operation_id: null,
    revision: 1,
    created_at: "2026-08-09T12:00:00.000Z",
    updated_at: "2026-08-09T12:00:00.000Z",
    ...overrides,
  };
}

function canonicalRolloverReadModel(scheduleModel: "rolling" | "fixed") {
  const occurrence = canonicalOccurrence({
    source_boundary_id: `boundary-${scheduleModel}`,
    recurrence_source_fingerprint: `boundary-${scheduleModel}`,
  });
  const scheduleBoundary = scheduleModel === "fixed"
    ? {
        ...boundary("fixed"),
        id: "boundary-fixed",
        repeat_frequency: "weekly" as const,
        repeat_days_of_week: [0],
        anchor_date: "2026-08-09",
      }
    : {
        ...boundary("rolling"),
        id: "boundary-rolling",
        anchor_date: "2026-08-09",
      };
  const readModel = {
    task: task({
      status: "in_progress",
      due_on: "2026-08-09",
      repeat_frequency: scheduleModel === "fixed" ? "weekly" : "daily",
      repeat_days_of_week: scheduleModel === "fixed" ? [0] : [],
      workflow_state: "in_progress",
      workflow_logical_date: "2026-08-09",
      workflow_occurrence_id: occurrence.id,
      workflow_command_id: "00000000-0000-4000-8000-000000000040",
      workflow_revision: 2,
    }),
    commandOperations: [],
    scheduleBoundaries: [scheduleBoundary],
    occurrences: [occurrence],
    occurrenceEffectiveOverrides: [],
    historyFacts: [],
    calendarOverrides: [],
    rewardEntitlements: [],
    rewardGrants: [],
    rewardClaimConsumptions: [],
    legacyHistoryEvidence: [],
    logicalDayProfile: {
      timezone: "America/New_York",
      day_start_time: "06:00",
      settings_revision: 3,
    },
  } as unknown as CanonicalTaskStateReadModel;
  return { occurrence, readModel };
}

test("trusted rollover derives one automatic DMB, preserves the stale logical date, and reuses reward parity", () => {
  const rolloverState = staleRolloverState();
  const rolloverCommand = trustedCommand({
    type: "reconcile_rollover",
    task_id: "task-1",
    replay_identity: "rollover:task-1:2026-08-10:stale-in-progress",
    expected_revision: 4,
  }, rolloverState.task, boundary("rolling"));
  const rolloverPlan = planTaskStateCommand(rolloverState, rolloverCommand);
  const payload = serializeCanonicalTaskStateCommandForRpc(rolloverPlan);
  const payloadBody = payload.payload as Record<string, Record<string, unknown>>;

  assert.equal(rolloverCommand.sourceKind, "authorized_automation");
  assert.equal(rolloverCommand.staleLogicalDate, "2026-08-09");
  assert.equal(rolloverPlan.normalizedResult.historyFact?.logical_date, "2026-08-09");
  assert.equal(rolloverPlan.normalizedResult.historyFact?.outcome, "did_my_best");
  assert.equal(rolloverPlan.normalizedResult.historyFact?.event_kind, "authorized_automation");
  assert.equal(rolloverPlan.normalizedResult.compatibilityProjection.dueOn, "2026-08-10");
  assert.equal(rolloverPlan.normalizedResult.compatibilityProjection.status, "pending");
  assert.equal(rolloverPlan.normalizedResult.compatibilityProjection.activeStatusLogicalDate, null);
  assert.equal(rolloverPlan.normalizedResult.canonicalTaskPatch.workflow_state, "none");
  assert.equal(rolloverPlan.normalizedResult.rewardEntitlement?.identity, "task-reward-entitlement:task-1:2026-08-09:v1");
  assert.equal(payload.source_kind, "authorized_automation");
  assert.equal(payloadBody.history_fact.outcome, "did_my_best");
  assert.equal(payloadBody.history_fact.logical_date, "2026-08-09");
  assert.equal(payloadBody.history_fact.provenance_kind, "authorized_automation");
  assert.equal(payloadBody.history_fact.actor_kind, "authorized_automation");
  assert.equal(payloadBody.reward_program_version, "task-reward-v1");

  const manualState = state({ due_on: "2026-08-09", repeat_frequency: "daily" });
  manualState.engineInput = {
    ...manualState.engineInput!,
    task: { ...manualState.engineInput!.task, dueOn: "2026-08-09", recurrence: { kind: "rolling", intervalDays: 1 } },
  };
  const manualPlan = planTaskStateCommand(manualState, trustedCommand({
    type: "set_outcome",
    task_id: "task-1",
    replay_identity: "manual:task-1:2026-08-09:did-my-best",
    outcome: "did_my_best",
    logical_date: "2026-08-09",
  }, manualState.task, boundary("rolling")));
  assert.equal(rolloverPlan.normalizedResult.rewardEntitlement?.identity, manualPlan.normalizedResult.rewardEntitlement?.identity);
  assert.equal(rolloverPlan.normalizedResult.rewardEntitlement?.outcome, manualPlan.normalizedResult.rewardEntitlement?.outcome);
  assert.equal(rolloverPlan.normalizedResult.rewardEntitlement?.effectiveObligationIdentity, manualPlan.normalizedResult.rewardEntitlement?.effectiveObligationIdentity);
});

test("automatic and manual DMB remain occurrence-coherent across rolling and fixed recurrence", () => {
  for (const scheduleModel of ["rolling", "fixed"] as const) {
    const { occurrence, readModel } = canonicalRolloverReadModel(scheduleModel);
    const engineInput = buildCanonicalTaskStateEngineInput(readModel, {
      logicalDayRollover: "06:00",
      now: "2026-08-10T12:00:00.000Z",
      timezone: "America/New_York",
    });
    assert.equal(engineInput.task.activeOccurrenceDueOn, occurrence.scheduled_due_on, scheduleModel);

    const automaticCommand = buildTrustedTaskStateCommand({
      intent: {
        type: "reconcile_rollover",
        task_id: "task-1",
        replay_identity: `rollover:real-occurrence:${scheduleModel}`,
        expected_revision: 4,
      },
      userId: "user-1",
      readModel,
      logicalDay: { ...logicalDay, logicalDate: "2026-08-10", dayStartTime: "06:00" },
      now: "2026-08-10T12:00:00.000Z",
    });
    const automaticPlan = planTaskStateCommand({ task: readModel.task, engineInput }, automaticCommand);
    const automaticEngineResult = evaluateTaskState({ ...engineInput, action: { type: "reconcile_rollover" } });
    const automaticHistory = automaticEngineResult.proposedHistoryChanges.find((change) => change.type === "insert")?.row;
    assert.equal(automaticCommand.occurrenceId, occurrence.id, scheduleModel);
    assert.equal(automaticCommand.scheduledDueOn, occurrence.scheduled_due_on, scheduleModel);
    assert.equal(automaticHistory?.logicalDate, "2026-08-09", scheduleModel);
    assert.equal(automaticHistory?.outcome, "did_my_best", scheduleModel);
    assert.equal(automaticHistory?.occurrenceIdentity, occurrence.occurrence_key, scheduleModel);
    assert.equal(automaticHistory?.occurrenceDueOn, occurrence.scheduled_due_on, scheduleModel);
    assert.equal(automaticHistory?.occurredAt, "2026-08-10T12:00:00.000Z", scheduleModel);
    assert.equal(automaticPlan.normalizedResult.historyFact?.occurrence_id, occurrence.id, scheduleModel);
    assert.equal(automaticPlan.normalizedResult.historyFact?.scheduled_due_on, occurrence.scheduled_due_on, scheduleModel);

    const manualTask = task({
      due_on: occurrence.scheduled_due_on,
      repeat_frequency: scheduleModel === "fixed" ? "weekly" : "daily",
      repeat_days_of_week: scheduleModel === "fixed" ? [0] : [],
    });
    const manualReadModel = { ...readModel, task: manualTask } as typeof readModel;
    const manualInput = buildCanonicalTaskStateEngineInput(manualReadModel, {
      logicalDayRollover: "06:00",
      now: "2026-08-10T12:00:00.000Z",
      timezone: "America/New_York",
    });
    const manualCommand = buildTrustedTaskStateCommand({
      intent: {
        type: "set_outcome",
        task_id: "task-1",
        replay_identity: `manual:real-occurrence:${scheduleModel}`,
        expected_revision: 4,
        outcome: "did_my_best",
        logical_date: "2026-08-09",
        occurrence_key: occurrence.occurrence_key,
      },
      userId: "user-1",
      readModel: manualReadModel,
      logicalDay: { ...logicalDay, logicalDate: "2026-08-10", dayStartTime: "06:00" },
      now: "2026-08-10T12:00:00.000Z",
    });
    const manualPlan = planTaskStateCommand({ task: manualTask, engineInput: manualInput }, manualCommand);
    const manualEngineResult = evaluateTaskState({
      ...manualInput,
      action: {
        type: "record_outcome",
        outcome: "did_my_best",
        logicalDate: "2026-08-09",
        occurredAt: "2026-08-10T12:00:00.000Z",
        occurrenceDueOn: occurrence.scheduled_due_on,
        occurrenceIdentity: occurrence.occurrence_key,
        historicalOverride: true,
      },
    });

    assert.equal(automaticPlan.normalizedResult.compatibilityProjection.dueOn, manualPlan.normalizedResult.compatibilityProjection.dueOn, scheduleModel);
    assert.equal(automaticPlan.normalizedResult.compatibilityProjection.status, manualPlan.normalizedResult.compatibilityProjection.status, scheduleModel);
    assert.equal(automaticPlan.normalizedResult.rewardEntitlement?.identity, manualPlan.normalizedResult.rewardEntitlement?.identity, scheduleModel);
    assert.equal(automaticPlan.normalizedResult.rewardEntitlement?.effectiveObligationIdentity, manualPlan.normalizedResult.rewardEntitlement?.effectiveObligationIdentity, scheduleModel);
    assert.equal(automaticEngineResult.nextDueDate, scheduleModel === "fixed" ? "2026-08-16" : "2026-08-10", scheduleModel);
    assert.equal(automaticEngineResult.activeStatus, manualEngineResult.activeStatus, scheduleModel);
    assert.equal(automaticEngineResult.timeline.currentCompletedStreak, manualEngineResult.timeline.currentCompletedStreak, scheduleModel);
    assert.equal(automaticEngineResult.timeline.currentMissedStreak, manualEngineResult.timeline.currentMissedStreak, scheduleModel);
  }
});

test("rollover keeps explicit stale-date History and creates no second DMB or reward", () => {
  const planningState = staleRolloverState();
  planningState.engineInput = { ...planningState.engineInput!, history: [doneHistory("2026-08-09")] };
  const plan = planTaskStateCommand(planningState, trustedCommand({
    type: "reconcile_rollover",
    task_id: "task-1",
    replay_identity: "rollover:task-1:2026-08-10:existing-history",
    expected_revision: 4,
  }, planningState.task, boundary("rolling")));

  assert.equal(plan.normalizedResult.historyFact, null);
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
  assert.equal(plan.normalizedResult.canonicalTaskPatch.workflow_state, "none");
  assert.equal(plan.normalizedResult.compatibilityProjection.activeStatusLogicalDate, null);
});

test("rollover without stale In Progress is a no-op with no History or reward", () => {
  const planningState = state();
  const plan = planTaskStateCommand(planningState, trustedCommand({
    type: "reconcile_rollover",
    task_id: "task-1",
    replay_identity: "rollover:task-1:2026-08-10:no-op",
    expected_revision: 4,
  }, planningState.task, boundary("rolling")));

  assert.deepEqual(plan.normalizedResult.canonicalTaskPatch, {});
  assert.equal(plan.normalizedResult.historyFact, null);
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
});

test("stale canonical revision is rejected before a normalized write plan", () => {
  const plan = planTaskStateCommand(state({ canonical_revision: 5 }), command());
  assert.equal(plan.normalizedResult.state, "rejected");
  assert.equal(plan.normalizedResult.conflictCode, "STALE_REVISION");
  assert.deepEqual(plan.normalizedResult.canonicalTaskPatch, {});
});

test("terminal, container, and workflow axes remain independent", () => {
  const complete = planTaskStateCommand(state(), {
    ...command(),
    type: "complete",
    commandId: "00000000-0000-4000-8000-000000000002",
  });
  assert.equal(complete.normalizedResult.canonicalTaskPatch.terminal_state, "permanently_complete");
  assert.equal(complete.normalizedResult.canonicalTaskPatch.container_state, "active");
  assert.equal(complete.normalizedResult.canonicalTaskPatch.workflow_state, "none");

  const archived = planTaskStateCommand(state({ terminal_state: "permanently_complete", canonical_revision: 4 }), {
    ...command(),
    type: "archive",
    commandId: "00000000-0000-4000-8000-000000000003",
  });
  assert.equal(archived.normalizedResult.canonicalTaskPatch.terminal_state, "permanently_complete");
  assert.equal(archived.normalizedResult.canonicalTaskPatch.container_state, "archived");

  const trashed = planTaskStateCommand(state({ terminal_state: "permanently_complete", canonical_revision: 4 }), {
    ...command(),
    type: "trash",
    commandId: "00000000-0000-4000-8000-000000000004",
  });
  assert.equal(trashed.normalizedResult.canonicalTaskPatch.terminal_state, "permanently_complete");
  assert.equal(trashed.normalizedResult.canonicalTaskPatch.container_state, "trashed");
});

test("Trash restore preserves proven Active and Archived container provenance", () => {
  const activeTrash = planTaskStateCommand(state(), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000015" }),
    type: "trash",
    changedAt: "2026-08-10T12:00:00.000Z",
  });
  assert.equal(activeTrash.normalizedResult.canonicalTaskPatch.prior_container_state, "active");

  const activeRestore = planTaskStateCommand(state({
    status: "trashed",
    container_state: "trashed",
    prior_container_state: activeTrash.normalizedResult.canonicalTaskPatch.prior_container_state,
    prior_container_state_status: "proven",
    container_trashed_at: "2026-08-10T12:00:00.000Z",
    canonical_revision: 5,
  }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000016", expectedRevision: 5 }),
    type: "restore",
  });
  assert.equal(activeRestore.normalizedResult.canonicalTaskPatch.container_state, "active");
  assert.equal(activeRestore.normalizedResult.canonicalTaskPatch.prior_container_state, null);
  assert.equal(activeRestore.normalizedResult.canonicalTaskPatch.prior_container_state_status, "not_applicable");

  const archivedTrash = planTaskStateCommand(state({ status: "archived", container_state: "archived" }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000017" }),
    type: "trash",
    changedAt: "2026-08-10T12:00:00.000Z",
  });
  assert.equal(archivedTrash.normalizedResult.canonicalTaskPatch.prior_container_state, "archived");

  const archivedRestore = planTaskStateCommand(state({
    status: "trashed",
    container_state: "trashed",
    prior_container_state: archivedTrash.normalizedResult.canonicalTaskPatch.prior_container_state,
    prior_container_state_status: "proven",
    container_trashed_at: "2026-08-10T12:00:00.000Z",
    canonical_revision: 5,
  }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000018", expectedRevision: 5 }),
    type: "restore",
  });
  assert.equal(archivedRestore.normalizedResult.canonicalTaskPatch.container_state, "archived");
  assert.equal(archivedRestore.normalizedResult.compatibilityProjection.status, "archived");
});

test("Active to Trash to Trash preserves Active provenance", () => {
  const firstTrash = planTaskStateCommand(state(), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000020" }),
    type: "trash",
    changedAt: "2026-08-10T12:00:00.000Z",
  });
  const secondTrash = planTaskStateCommand(state({
    status: "trashed",
    container_state: "trashed",
    prior_container_state: firstTrash.normalizedResult.canonicalTaskPatch.prior_container_state,
    prior_container_state_status: firstTrash.normalizedResult.canonicalTaskPatch.prior_container_state_status,
    container_trashed_at: firstTrash.normalizedResult.canonicalTaskPatch.container_trashed_at,
    canonical_revision: 5,
  }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000021", expectedRevision: 5 }),
    type: "trash",
    changedAt: "2026-08-10T13:00:00.000Z",
  });

  assert.equal(secondTrash.normalizedResult.canonicalTaskPatch.container_state, "trashed");
  assert.equal(secondTrash.normalizedResult.canonicalTaskPatch.prior_container_state, "active");
  assert.equal(secondTrash.normalizedResult.canonicalTaskPatch.prior_container_state_status, "proven");
});

test("Archived to Trash to Trash preserves Archived provenance", () => {
  const firstTrash = planTaskStateCommand(state({ status: "archived", container_state: "archived" }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000022" }),
    type: "trash",
    changedAt: "2026-08-10T12:00:00.000Z",
  });
  const secondTrash = planTaskStateCommand(state({
    status: "trashed",
    container_state: "trashed",
    prior_container_state: firstTrash.normalizedResult.canonicalTaskPatch.prior_container_state,
    prior_container_state_status: firstTrash.normalizedResult.canonicalTaskPatch.prior_container_state_status,
    container_trashed_at: firstTrash.normalizedResult.canonicalTaskPatch.container_trashed_at,
    canonical_revision: 5,
  }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000023", expectedRevision: 5 }),
    type: "trash",
    changedAt: "2026-08-10T13:00:00.000Z",
  });

  assert.equal(secondTrash.normalizedResult.canonicalTaskPatch.container_state, "trashed");
  assert.equal(secondTrash.normalizedResult.canonicalTaskPatch.prior_container_state, "archived");
  assert.equal(secondTrash.normalizedResult.canonicalTaskPatch.prior_container_state_status, "proven");
});

test("Second Trash preserves the original container_trashed_at", () => {
  const originalTrashAt = "2026-08-10T12:00:00.000Z";
  const firstTrash = planTaskStateCommand(state(), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000024" }),
    type: "trash",
    changedAt: originalTrashAt,
  });
  const secondTrash = planTaskStateCommand(state({
    status: "trashed",
    container_state: "trashed",
    prior_container_state: firstTrash.normalizedResult.canonicalTaskPatch.prior_container_state,
    prior_container_state_status: firstTrash.normalizedResult.canonicalTaskPatch.prior_container_state_status,
    container_trashed_at: originalTrashAt,
    canonical_revision: 5,
  }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000025", expectedRevision: 5 }),
    type: "trash",
    changedAt: "2026-08-11T12:00:00.000Z",
  });

  assert.equal(secondTrash.normalizedResult.canonicalTaskPatch.container_trashed_at, originalTrashAt);
});

test("Archived to Trash to Trash to Restore returns Archived", () => {
  const firstTrash = planTaskStateCommand(state({ status: "archived", container_state: "archived" }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000026" }),
    type: "trash",
    changedAt: "2026-08-10T12:00:00.000Z",
  });
  const secondTrash = planTaskStateCommand(state({
    status: "trashed",
    container_state: "trashed",
    prior_container_state: firstTrash.normalizedResult.canonicalTaskPatch.prior_container_state,
    prior_container_state_status: firstTrash.normalizedResult.canonicalTaskPatch.prior_container_state_status,
    container_trashed_at: firstTrash.normalizedResult.canonicalTaskPatch.container_trashed_at,
    canonical_revision: 5,
  }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000027", expectedRevision: 5 }),
    type: "trash",
    changedAt: "2026-08-10T13:00:00.000Z",
  });
  const restore = planTaskStateCommand(state({
    status: "trashed",
    container_state: "trashed",
    prior_container_state: secondTrash.normalizedResult.canonicalTaskPatch.prior_container_state,
    prior_container_state_status: secondTrash.normalizedResult.canonicalTaskPatch.prior_container_state_status,
    container_trashed_at: secondTrash.normalizedResult.canonicalTaskPatch.container_trashed_at,
    canonical_revision: 6,
  }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000028", expectedRevision: 6 }),
    type: "restore",
  });

  assert.equal(restore.normalizedResult.canonicalTaskPatch.container_state, "archived");
  assert.equal(restore.normalizedResult.compatibilityProjection.status, "archived");
});

test("Active to Trash to Trash to Restore returns Active", () => {
  const firstTrash = planTaskStateCommand(state(), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000029" }),
    type: "trash",
    changedAt: "2026-08-10T12:00:00.000Z",
  });
  const secondTrash = planTaskStateCommand(state({
    status: "trashed",
    container_state: "trashed",
    prior_container_state: firstTrash.normalizedResult.canonicalTaskPatch.prior_container_state,
    prior_container_state_status: firstTrash.normalizedResult.canonicalTaskPatch.prior_container_state_status,
    container_trashed_at: firstTrash.normalizedResult.canonicalTaskPatch.container_trashed_at,
    canonical_revision: 5,
  }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000030", expectedRevision: 5 }),
    type: "trash",
    changedAt: "2026-08-10T13:00:00.000Z",
  });
  const restore = planTaskStateCommand(state({
    status: "trashed",
    container_state: "trashed",
    prior_container_state: secondTrash.normalizedResult.canonicalTaskPatch.prior_container_state,
    prior_container_state_status: secondTrash.normalizedResult.canonicalTaskPatch.prior_container_state_status,
    container_trashed_at: secondTrash.normalizedResult.canonicalTaskPatch.container_trashed_at,
    canonical_revision: 6,
  }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000031", expectedRevision: 6 }),
    type: "restore",
  });

  assert.equal(restore.normalizedResult.canonicalTaskPatch.container_state, "active");
  assert.equal(restore.normalizedResult.compatibilityProjection.status, "pending");
});

test("Trash restore fails closed when prior container provenance is not proven", () => {
  assert.throws(
    () => planTaskStateCommand(state({
      status: "trashed",
      container_state: "trashed",
      prior_container_state: null,
      prior_container_state_status: "unknown",
    }), {
      ...command({ commandId: "00000000-0000-4000-8000-000000000019" }),
      type: "restore",
    }),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "RESTORE_PROVENANCE_REQUIRED",
  );
});

test("clearing workflow restores a future due projection without changing lifecycle state", () => {
  const upcoming = planTaskStateCommand(state({ status: "in_progress", due_on: "2026-08-13" }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000012" }),
    type: "workflow_clear",
  });
  assert.equal(upcoming.normalizedResult.compatibilityProjection.status, "upcoming");
  assert.equal(upcoming.normalizedResult.canonicalTaskPatch.workflow_state, "none");

  const notDue = planTaskStateCommand(state({ status: "in_progress", due_on: "2026-08-30" }), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000013" }),
    type: "workflow_clear",
  });
  assert.equal(notDue.normalizedResult.compatibilityProjection.status, "not_due");
});

test("one-time and unscheduled schedule boundaries stay distinct", () => {
  for (const [scheduleModel, boundaryType] of [["one_time", "due_date"], ["unscheduled", "due_date"]] as const) {
    const plan = planTaskStateCommand(state(), {
      ...command({ commandId: `00000000-0000-4000-8000-0000000000${scheduleModel === "one_time" ? "5" : "6"}` }),
      type: "schedule_change",
      changeKind: "due_date",
      scheduleBoundary: { ...boundary(scheduleModel), boundary_type: boundaryType === "due_date" ? "due_date_change" : "initial" },
    });
    assert.equal(plan.normalizedResult.scheduleBoundary?.schedule_model, scheduleModel);
    assert.equal(plan.normalizedResult.scheduleBoundary?.repeat_frequency, "none");
  }
});

test("rolling and fixed schedule plans preserve their model authority", () => {
  const rolling = planTaskStateCommand(state(), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000007" }),
    type: "schedule_change",
    changeKind: "repeat",
    scheduleBoundary: boundary("rolling"),
  });
  const fixed = planTaskStateCommand(state(), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000008" }),
    type: "schedule_change",
    changeKind: "repeat",
    scheduleBoundary: { ...boundary("fixed"), repeat_frequency: "weekly", repeat_days_of_week: [1, 3, 5] },
  });
  assert.equal(rolling.normalizedResult.scheduleBoundary?.schedule_model, "rolling");
  assert.equal(fixed.normalizedResult.scheduleBoundary?.schedule_model, "fixed");
  assert.deepEqual(fixed.normalizedResult.scheduleBoundary?.repeat_days_of_week, [1, 3, 5]);
});

function trustedReadModel(row: CanonicalTaskRow, schedule: CanonicalTaskScheduleBoundary) {
  return {
    task: row,
    scheduleBoundaries: [schedule],
    occurrences: [],
    occurrenceEffectiveOverrides: [],
    historyFacts: [],
    commandOperations: [],
    calendarOverrides: [],
    rewardEntitlements: [],
    rewardGrants: [],
    rewardClaimConsumptions: [],
    legacyHistoryEvidence: [],
    logicalDayProfile: { timezone: logicalDay.timezone, day_start_time: logicalDay.dayStartTime, settings_revision: logicalDay.settingsRevision },
  };
}

function trustedCommand(
  intent: Parameters<typeof buildTrustedTaskStateCommand>[0]["intent"],
  row: CanonicalTaskRow,
  schedule: CanonicalTaskScheduleBoundary,
  commandLogicalDay = logicalDay,
) {
  return buildTrustedTaskStateCommand({
    intent,
    userId: row.user_id,
    readModel: trustedReadModel(row, schedule),
    logicalDay: commandLogicalDay,
    now: "2026-08-10T12:00:00.000Z",
  });
}

test("trusted historical replacement derives replaceExisting and previous outcome from engine history", () => {
  const planningState = state({ due_on: "2026-08-08" });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: { ...planningState.engineInput!.task, dueOn: "2026-08-08", recurrence: { kind: "rolling", intervalDays: 3 } },
    history: [missedHistory("2026-08-08", "2026-08-08")],
  };
  const command = trustedCommand({
    type: "set_outcome",
    task_id: "task-1",
    replay_identity: "appanda:2026-08-08:did-my-best",
    outcome: "did_my_best",
    logical_date: "2026-08-08",
  }, planningState.task, boundary("rolling"));

  const plan = planTaskStateCommand(planningState, command);
  assert.equal(plan.normalizedResult.historyFact?.outcome, "did_my_best");
  assert.equal(plan.normalizedResult.historyFact?.scheduled_due_on, "2026-08-08");
  assert.equal(plan.normalizedResult.rewardEntitlement?.logicalDate, "2026-08-08");
  assert.equal(plan.command.payload.occurrenceKey, null);
});

test("historical rolling edit replays through a later canonical success", () => {
  const historicalLogicalDay = {
    ...logicalDay,
    identity: "user-1:2026-08-15:America/New_York:06:00:3",
    logicalDate: "2026-08-15",
  };
  const planningState = state({
    due_on: "2026-08-15",
    repeat_frequency: "daily",
    repeat_interval: 2,
  });
  planningState.engineInput = {
    ...planningState.engineInput!,
    now: "2026-08-15T12:00:00.000Z",
    task: {
      ...planningState.engineInput!.task,
      dueOn: "2026-08-15",
      recurrence: { kind: "rolling", intervalDays: 2 },
    },
    history: [doneHistory("2026-08-13")],
  };

  const plan = planTaskStateCommand(planningState, command({
    commandId: "00000000-0000-4000-8000-000000000032",
    logicalDay: historicalLogicalDay,
    logicalDate: "2026-08-12",
    // The canonical History fact is authoritative, but this older edit has no
    // materialized occurrence identity and must still replay through 8/13.
    scheduledDueOn: null,
    occurrenceKey: null,
  }));

  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-15");
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "pending");
  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn === "2026-08-14", false);
  assert.equal(planningState.engineInput.history.some((row) => row.logicalDate === "2026-08-13" && row.outcome === "done"), true);
});

test("replacing an older rolling outcome preserves a later authoritative success", () => {
  const historicalLogicalDay = {
    ...logicalDay,
    identity: "user-1:2026-08-15:America/New_York:06:00:3",
    logicalDate: "2026-08-15",
  };
  const planningState = state({ due_on: "2026-08-15", repeat_frequency: "daily", repeat_interval: 2 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    now: "2026-08-15T12:00:00.000Z",
    task: { ...planningState.engineInput!.task, dueOn: "2026-08-15", recurrence: { kind: "rolling", intervalDays: 2 } },
    history: [
      { ...missedHistory("2026-08-12"), occurrenceIdentity: null, occurrenceDueOn: null },
      doneHistory("2026-08-13"),
    ],
  };

  const plan = planTaskStateCommand(planningState, command({
    commandId: "00000000-0000-4000-8000-000000000033",
    logicalDay: historicalLogicalDay,
    logicalDate: "2026-08-12",
    outcome: "did_my_best",
    scheduledDueOn: null,
    occurrenceKey: null,
  }));

  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-15");
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "pending");
  assert.equal(plan.normalizedResult.historyFact?.logical_date, "2026-08-12");
  assert.equal(planningState.engineInput.history.some((row) => row.logicalDate === "2026-08-13" && row.outcome === "done"), true);
});

test("trusted planner accepts calculated-only historical success without an occurrence", () => {
  const planningState = state({ due_on: "2026-08-08" });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: { ...planningState.engineInput!.task, dueOn: "2026-08-08", recurrence: { kind: "rolling", intervalDays: 3 } },
    history: [],
  };
  const command = trustedCommand({
    type: "set_outcome",
    task_id: "task-1",
    replay_identity: "appanda:calculated:2026-08-08:done",
    outcome: "done",
    logical_date: "2026-08-08",
  }, planningState.task, boundary("rolling"));

  const plan = planTaskStateCommand(planningState, command);
  assert.equal(plan.normalizedResult.historyFact?.outcome, "done");
  assert.equal(plan.normalizedResult.occurrence, null);
  assert.equal(plan.normalizedResult.rewardEntitlement?.logicalDate, "2026-08-08");
});

test("trusted due-date planner replays with the proposed due date", () => {
  const planningState = state({ due_on: "2026-08-13", repeat_frequency: "daily", repeat_interval: 5 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: { ...planningState.engineInput!.task, dueOn: "2026-08-13", recurrence: { kind: "rolling", intervalDays: 5 } },
    history: [doneHistory("2026-08-08")],
  };
  const currentBoundary = { ...boundary("rolling"), repeat_interval: 5, anchor_date: "2026-08-13" };
  const command = trustedCommand({
    type: "set_due_date",
    task_id: "task-1",
    replay_identity: "table:due:2026-08-20",
    logical_date: "2026-08-13",
    schedule: { schedule_model: "one_time", repeat_frequency: "none", one_time_due_on: "2026-08-20" },
  }, planningState.task, currentBoundary);
  const plan = planTaskStateCommand(planningState, command);

  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-20");
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "not_due");
});

test("trusted repeat planner replays from the last success with the proposed cadence", () => {
  const planningState = state({ due_on: "2026-08-13", repeat_frequency: "daily", repeat_interval: 5 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: { ...planningState.engineInput!.task, dueOn: "2026-08-13", recurrence: { kind: "rolling", intervalDays: 5 } },
    history: [doneHistory("2026-08-08")],
  };
  const currentBoundary = { ...boundary("rolling"), repeat_interval: 5, anchor_date: "2026-08-13" };
  const command = trustedCommand({
    type: "set_repeat",
    task_id: "task-1",
    replay_identity: "table:repeat:6",
    logical_date: "2026-08-13",
    schedule: { schedule_model: "rolling", repeat_frequency: "daily", repeat_interval: 6, anchor_date: "2026-08-13" },
  }, planningState.task, currentBoundary);
  const plan = planTaskStateCommand(planningState, command);

  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-14");
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "upcoming");
});

test("trusted Calendar override planner evaluates the proposed override before commit", () => {
  const planningState = state({ due_on: "2026-08-10" });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: {
      ...planningState.engineInput!.task,
      dueOn: "2026-08-10",
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
  };
  const planned = trustedCommand({
    type: "calendar_override",
    task_id: "task-1",
    replay_identity: "calendar:2026-08-10:not-due",
    logical_date: "2026-08-10",
    override_state: "not_due",
  }, planningState.task, boundary("one_time"));

  const plan = planTaskStateCommand(planningState, planned);

  assert.equal(plan.normalizedResult.calendarOverride?.override_state, "not_due");
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "upcoming");
  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-11");
});

test("trusted planner accepts the Appanda 8/8-8/12 replacement range without occurrences", () => {
  const appandaLogicalDay = { ...logicalDay, logicalDate: "2026-08-13", identity: "user-1:2026-08-13:America/New_York:06:00:3" };
  const planningState = state({ due_on: "2026-08-08", repeat_frequency: "daily", repeat_interval: 1 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: { ...planningState.engineInput!.task, dueOn: "2026-08-08", recurrence: { kind: "rolling", intervalDays: 1 } },
    now: "2026-08-13T12:00:00.000Z",
    history: [
      doneHistory("2026-08-07"),
      ...["2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"].map((date) => missedHistory(date)),
    ],
  };
  const rewardIdentities = new Set<string>();

  for (const date of ["2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"]) {
    const command = trustedCommand({
      type: "set_outcome",
      task_id: "task-1",
      replay_identity: `appanda:range:${date}:did-my-best`,
      outcome: "did_my_best",
      logical_date: date,
    }, planningState.task, boundary("rolling"), appandaLogicalDay);
    const plan = planTaskStateCommand(planningState, command);
    assert.equal(plan.normalizedResult.historyFact?.outcome, "did_my_best", date);
    assert.equal(plan.normalizedResult.occurrence, null, date);
    assert.ok(plan.normalizedResult.rewardEntitlement, date);
    rewardIdentities.add(plan.normalizedResult.rewardEntitlement!.identity);
  }

  const finalHistory = planningState.engineInput.history.map((row) => (
    row.logicalDate >= "2026-08-08" && row.logicalDate <= "2026-08-12"
      ? { ...row, outcome: "did_my_best" as const }
      : row
  ));
  const timeline = buildTaskEffectiveTimeline({
    task: planningState.engineInput.task,
    history: finalHistory,
    logicalDate: "2026-08-13",
    calendarStart: "2026-08-07",
    calendarEnd: "2026-08-13",
  });
  assert.equal(rewardIdentities.size, 5);
  assert.equal(timeline.currentMissedStreak, 0);
  assert.equal(timeline.currentCompletedStreak, 6);
});

test("Delay preserves origin occurrence identity and only changes effective date", () => {
  const override = {
    id: "override-1",
    user_id: "user-1",
    entity_id: "task-1",
    occurrence_id: "occurrence-1",
    scheduled_due_on: "2026-08-10",
    effective_due_on: "2026-08-13",
    action_logical_date: "2026-08-10",
    delay_kind: "delay",
    override_sequence: 1,
    prior_override_id: null,
    prior_override_sequence: null,
    schedule_boundary_id: "boundary-1",
    history_id: null,
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: "user-1",
    source: "task_state_command",
    command_id: null,
    idempotence_identity: "delay:occurrence-1:2026-08-13",
    migration_operation_id: null,
    accepted_payload_digest: "digest",
    revision: 1,
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:00:00.000Z",
  } satisfies CanonicalTaskOccurrenceEffectiveOverride;
  const plan = planTaskStateCommand(state(), {
    ...command({ commandId: "00000000-0000-4000-8000-000000000009" }),
    type: "delay",
    occurrenceId: "occurrence-1",
    scheduledDueOn: "2026-08-10",
    effectiveDueOn: "2026-08-13",
    override,
  });
  assert.equal(plan.normalizedResult.occurrenceEffectiveOverride?.occurrence_id, "occurrence-1");
  assert.equal(plan.normalizedResult.occurrenceEffectiveOverride?.scheduled_due_on, "2026-08-10");
  assert.equal(plan.normalizedResult.occurrenceEffectiveOverride?.effective_due_on, "2026-08-13");
});

test("canonical Delay carries the effective due cursor through replay and RPC projection", () => {
  const delayDate = "2026-08-17";
  const effectiveDueOn = "2026-08-24";
  const delayLogicalDay = {
    ...logicalDay,
    identity: "user-1:2026-08-17:America/New_York:06:00:3",
    logicalDate: delayDate,
  };
  const planningState = state({ due_on: delayDate, repeat_frequency: "daily", repeat_interval: 1 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    now: "2026-08-17T12:00:00.000Z",
    task: {
      ...planningState.engineInput!.task,
      dueOn: delayDate,
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
    calendarOverrides: [],
    workflow: { state: "none", logicalDate: null, occurrenceId: null, commandId: null, revision: null },
  };
  const delayBoundary = {
    ...boundary("rolling"),
    id: "boundary-delay",
    effective_from_logical_date: delayDate,
    anchor_date: delayDate,
  };
  const delayCommand = trustedCommand({
    type: "delay_occurrence",
    task_id: planningState.task.id,
    replay_identity: "delay:task-1:2026-08-17:2026-08-24",
    logical_date: delayDate,
    effective_due_on: effectiveDueOn,
  }, planningState.task, delayBoundary, delayLogicalDay);

  const plan = planTaskStateCommand(planningState, delayCommand);
  const payload = serializeCanonicalTaskStateCommandForRpc(plan).payload as Record<string, Record<string, unknown>>;

  assert.equal(plan.normalizedResult.historyFact?.outcome, "delayed");
  assert.equal(plan.normalizedResult.historyFact?.scheduled_due_on, delayDate);
  assert.equal(plan.normalizedResult.historyFact?.effective_due_on, effectiveDueOn);
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "delayed");
  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, effectiveDueOn);
  assert.equal(plan.normalizedResult.scheduleBoundary, null);
  assert.equal(payload.compatibility_projection.due_on, effectiveDueOn);
  assert.equal(payload.history_fact.effective_due_on, effectiveDueOn);
  assert.equal(payload.occurrence_effective_override.effective_due_on, effectiveDueOn);
});

test("trusted Delay serializes the materialized occurrence consistently across payload facts", () => {
  const occurrence = {
    id: "occurrence-1",
    user_id: "user-1",
    entity_id: "task-1",
    entity_kind: "parent",
    occurrence_key: "task-state:task-1:2026-08-10",
    scheduled_due_on: "2026-08-10",
    source_boundary_id: "boundary-1",
    recurrence_source_fingerprint: "boundary-1",
    origin_kind: "proven",
    origin_confidence: "proven",
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: "user-1",
    source: "task_state_command",
    materialization_reason: "required_command_state",
    resolution_state: "unresolved",
    resolved_logical_date: null,
    resolved_outcome: null,
    resolved_history_id: null,
    command_id: "00000000-0000-4000-8000-000000000009",
    migration_operation_id: null,
    revision: 1,
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:00:00.000Z",
  } satisfies CanonicalTaskOccurrence;
  const override = {
    id: "override-1",
    user_id: "user-1",
    entity_id: "task-1",
    occurrence_id: occurrence.id,
    scheduled_due_on: occurrence.scheduled_due_on,
    effective_due_on: "2026-08-13",
    action_logical_date: "2026-08-10",
    delay_kind: "delay",
    override_sequence: 1,
    prior_override_id: null,
    prior_override_sequence: null,
    schedule_boundary_id: "boundary-1",
    history_id: null,
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: "user-1",
    source: "task_state_command",
    command_id: null,
    idempotence_identity: "delay:occurrence-1:2026-08-13",
    migration_operation_id: null,
    accepted_payload_digest: "digest",
    revision: 1,
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:00:00.000Z",
  } satisfies CanonicalTaskOccurrenceEffectiveOverride;
  const plan = planTaskStateCommand(state(), {
    ...command({ commandId: occurrence.command_id! }),
    type: "delay",
    occurrenceId: occurrence.id,
    scheduledDueOn: occurrence.scheduled_due_on,
    effectiveDueOn: "2026-08-13",
    occurrence,
    override,
  });
  const payload = serializeCanonicalTaskStateCommandForRpc(plan).payload as Record<string, Record<string, unknown>>;

  assert.equal(payload.occurrence.id, occurrence.id);
  assert.equal(payload.history_fact.occurrence_id, occurrence.id);
  assert.equal(payload.occurrence_effective_override.occurrence_id, occurrence.id);
});

test("reward entitlement identity is stable per entity and logical date", () => {
  const first = planTaskStateCommand(state(), command({ commandId: "00000000-0000-4000-8000-000000000010" }));
  const second = planTaskStateCommand(state(), command({ commandId: "00000000-0000-4000-8000-000000000011" }));
  assert.equal(first.normalizedResult.rewardEntitlement?.identity, second.normalizedResult.rewardEntitlement?.identity);
  assert.match(first.normalizedResult.rewardEntitlement?.identity ?? "", /task-1:2026-08-10/);
});

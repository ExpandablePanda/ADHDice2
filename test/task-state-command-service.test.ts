import assert from "node:assert/strict";
import test from "node:test";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import {
  planTaskStateCommand,
  isCanonicalTaskStateCommandSemanticNoOp,
  serializeCanonicalTaskStateCommandForRpc,
  type CanonicalCommandPlanningState,
  type CanonicalTaskStateCommand,
} from "../src/lib/task-state-canonical/command-service.ts";
import { sha256Hex } from "../src/lib/task-state-canonical/digest.ts";
import { buildCanonicalTaskStateEngineInput } from "../src/lib/task-state-canonical/engine-input.ts";
import type { CanonicalTaskRow, CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";
import type { CanonicalTaskHistoryFact, CanonicalTaskOccurrence, CanonicalTaskOccurrenceEffectiveOverride, CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";
import type { TaskQuotaPeriodFact, TaskStateHistoryRow } from "../src/lib/task-state-engine/types.ts";
import { buildTaskEffectiveTimeline } from "../src/lib/task-state-engine/effective-timeline.ts";
import { evaluateTaskState } from "../src/lib/task-state-engine/engine.ts";
import { buildTrustedTaskStateCommand } from "../supabase/functions/task-state-command/domain.ts";
import { normalizeTaskBehaviorProfile, STANDARD_TASK_BEHAVIOR_POLICY } from "../src/lib/task-state-engine/behavior-policy.ts";
import { createEngineRolloverPlan, engineRolloverPlanTaskMutationCandidates } from "../src/lib/task-state-engine/rollover-authority.ts";

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

function automaticMissedHistory(logicalDate: string, occurrenceDueOn: string): TaskStateHistoryRow {
  return {
    ...missedHistory(logicalDate, occurrenceDueOn),
    id: `automatic-missed-${logicalDate}`,
    provenance: "rollover",
    recurrenceAuthoritative: true,
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
    migration_version: null,
    classifier_version: null,
    schema_contract_version: "task-state-schema-v1",
    source_task_revision: 4,
    revision: 1,
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:00:00.000Z",
  };
}

function canonicalHistoryFact(
  logicalDate: string,
  outcome: CanonicalTaskHistoryFact["outcome"],
  scheduleBoundaryId: string,
): CanonicalTaskHistoryFact {
  return {
    id: `history-fact-${logicalDate}-${outcome}`,
    user_id: "user-1",
    entity_id: "task-1",
    entity_kind: "parent",
    logical_date: logicalDate,
    outcome,
    event_kind: "explicit_outcome",
    occurrence_id: null,
    scheduled_due_on: logicalDate,
    effective_due_on: null,
    schedule_boundary_id: scheduleBoundaryId,
    recurrence_source_fingerprint: scheduleBoundaryId,
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: "user-1",
    source: "task_state_command",
    logical_day_settings_revision: 3,
    timezone: "America/New_York",
    day_start_time: "06:00",
    command_id: null,
    idempotence_identity: `history-fact:${logicalDate}:${outcome}`,
    source_legacy_history_id: null,
    revision: 1,
    created_at: `${logicalDate}T12:00:00.000Z`,
    updated_at: `${logicalDate}T12:00:00.000Z`,
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
  assert.deepEqual(plan.normalizedResult.automaticHistoryDeleteIds, []);
  assert.equal(payload.history_fact, undefined);
  assert.equal(payload.reward_program_version, undefined);
  assert.equal(payload.schedule_boundary, undefined);
  assert.equal(payload.calendar_override, undefined);
  assert.equal(payload.occurrence, undefined);
  assert.equal(payload.occurrence_effective_override, undefined);
});

test("Clear Balance commits an auditable zero projection for enabled quota Tasks", () => {
  const planningState = state({
    repeat_frequency: "per_week",
    repeat_quota_count: 3,
    repeat_quota_balance_enabled: true,
    repeat_quota_balance: -3,
    repeat_quota_balance_period: "2026-08-10",
  });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: {
      ...planningState.engineInput!.task,
      recurrence: {
        kind: "quota",
        period: "week",
        count: 3,
        balanceEnabled: true,
        incomingBalance: -3,
        incomingBalancePeriodKey: "2026-08-10",
      },
    },
  };
  const plan = planTaskStateCommand(planningState, command({
    type: "clear_quota_balance",
    commandId: "00000000-0000-4000-8000-000000000099",
  }));
  const serialized = serializeCanonicalTaskStateCommandForRpc(plan);
  const payload = serialized.payload as Record<string, unknown>;
  const projection = payload.compatibility_projection as Record<string, unknown>;

  assert.equal(plan.command.commandType, "clear_quota_balance");
  assert.equal(plan.normalizedResult.historyFact, null);
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
  assert.equal(projection.repeat_quota_balance, 0);
  assert.equal(projection.repeat_quota_balance_period, "2026-08-10");
  assert.equal(payload.clear_quota_balance, true);
  assert.equal(isCanonicalTaskStateCommandSemanticNoOp({ plan, task: planningState.task }), false);
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
  assert.deepEqual(plan.normalizedResult.automaticHistoryDeleteIds, []);
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
  assert.deepEqual(plan.normalizedResult.automaticHistoryDeleteIds, []);
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

test("canonical planning rejects every unavailable manual occurrence action with one stable domain code", () => {
  const planningState = state();
  planningState.engineInput = {
    ...planningState.engineInput!,
    behaviorPolicy: normalizeTaskBehaviorProfile({
      ...STANDARD_TASK_BEHAVIOR_POLICY,
      id: "restricted",
      availableActions: [],
    }),
  };
  const commands: CanonicalTaskStateCommand[] = [
    command({ outcome: "done" }),
    command({ outcome: "did_my_best" }),
    command({ outcome: "missed" }),
    {
      ...command(),
      type: "delay",
      occurrenceId: "occurrence-1",
      scheduledDueOn: logicalDay.logicalDate,
      effectiveDueOn: "2026-08-12",
    },
    { ...command(), type: "complete" },
  ];
  for (const input of commands) {
    assert.throws(
      () => planTaskStateCommand(planningState, input),
      (error: unknown) => error instanceof Error
        && "code" in error
        && error.code === "TASK_ACTION_NOT_AVAILABLE"
        && error.message.endsWith("is not available for this Task Type."),
      input.type,
    );
  }
});

test("handled Done uses the engine-derived projection for a recurring task", () => {
  const plan = planTaskStateCommand(state({ repeat_frequency: "daily" }), command({
    commandId: "00000000-0000-4000-8000-000000000014",
    outcome: "done",
  }));
  assert.equal(plan.normalizedResult.historyFact?.outcome, "done");
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "not_due");
});

test("fixed weekly command persists the engine-resolved early-success occurrence", () => {
  const planningState = state({ status: "missed", due_on: "2026-09-06", repeat_frequency: "weekly", repeat_days_of_week: [0] });
  planningState.engineInput = {
    ...planningState.engineInput!,
    now: "2026-09-01T14:00:00.000Z",
    task: {
      ...planningState.engineInput!.task,
      activeStatus: "missed",
      dueOn: "2026-09-06",
      recurrence: { kind: "weekly", weekdays: [0], anchorDate: "2026-08-30" },
    },
    history: [missedHistory("2026-08-30", "2026-08-30")],
  };
  const plan = planTaskStateCommand(planningState, command({
    commandId: "00000000-0000-4000-8000-000000000041",
    logicalDay: { ...logicalDay, logicalDate: "2026-08-31" },
    logicalDate: "2026-08-31",
    outcome: "done",
  }));

  assert.equal(plan.normalizedResult.historyFact?.scheduled_due_on, "2026-09-06");
  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-09-13");
  assert.notEqual(plan.normalizedResult.compatibilityProjection.status, "missed");
  assert.equal(plan.normalizedResult.rewardEntitlement?.effectiveObligationIdentity, "2026-09-06");
});

test("rolling interval three command persists the current obligation resolved by the engine", () => {
  const planningState = state({ status: "missed", due_on: "2026-08-29", repeat_frequency: "daily", repeat_interval: 3 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    now: "2026-09-01T14:00:00.000Z",
    task: {
      ...planningState.engineInput!.task,
      activeStatus: "missed",
      dueOn: "2026-08-29",
      recurrence: { kind: "rolling", intervalDays: 3 },
    },
    history: [{
      ...automaticMissedHistory("2026-08-29", "2026-08-29"),
      occurrenceIdentity: "task:task-1:occurrence:2026-08-29",
    }],
  };
  const plan = planTaskStateCommand(planningState, command({
    commandId: "00000000-0000-4000-8000-000000000042",
    logicalDay: { ...logicalDay, logicalDate: "2026-09-01" },
    logicalDate: "2026-09-01",
    outcome: "done",
  }));

  assert.equal(plan.normalizedResult.historyFact?.scheduled_due_on, "2026-08-29");
  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-09-04");
  assert.notEqual(plan.normalizedResult.compatibilityProjection.status, "missed");
  assert.equal(plan.normalizedResult.rewardEntitlement?.effectiveObligationIdentity, "2026-08-29");
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

test("stale one-off workflow without an occurrence remains occurrence-unbound through the rollover payload", () => {
  const staleTask = task({
    status: "in_progress",
    due_on: "2026-09-21",
    repeat_frequency: "none",
    active_status_logical_date: "2026-09-22",
    active_occurrence_due_on: "2026-09-21",
    workflow_state: "in_progress",
    workflow_logical_date: "2026-09-22",
    workflow_occurrence_id: null,
    workflow_command_id: "00000000-0000-4000-8000-000000000040",
    workflow_revision: 2,
  });
  const scheduleBoundary = {
    ...boundary("one_time"),
    id: "boundary-one-off-2026-09-21",
    effective_from_logical_date: "2026-09-21",
    one_time_due_on: "2026-09-21",
    anchor_date: "2026-09-21",
  };
  const priorMissedFact = {
    id: "history-2026-09-21",
    user_id: "user-1",
    entity_id: "task-1",
    entity_kind: "parent",
    logical_date: "2026-09-21",
    outcome: "missed",
    event_kind: "status",
    occurrence_id: null,
    scheduled_due_on: "2026-09-21",
    effective_due_on: null,
    schedule_boundary_id: scheduleBoundary.id,
    recurrence_source_fingerprint: scheduleBoundary.id,
    provenance_kind: "authorized_automation",
    actor_kind: "authorized_automation",
    actor_id: null,
    source: "task_state_command",
    logical_day_settings_revision: 3,
    timezone: "America/New_York",
    day_start_time: "06:00",
    command_id: null,
    idempotence_identity: "history:2026-09-21",
    source_legacy_history_id: null,
    revision: 1,
    created_at: "2026-09-21T12:00:00.000Z",
    updated_at: "2026-09-21T12:00:00.000Z",
  } as unknown as CanonicalTaskStateReadModel["historyFacts"][number];
  const readModel = {
    task: staleTask,
    scheduleBoundaries: [scheduleBoundary],
    occurrences: [],
    occurrenceEffectiveOverrides: [],
    historyFacts: [priorMissedFact],
    commandOperations: [],
    calendarOverrides: [],
    rewardEntitlements: [],
    rewardGrants: [],
    rewardClaimConsumptions: [],
    logicalDayProfile: { timezone: "America/New_York", day_start_time: "06:00", settings_revision: 3 },
  } as unknown as CanonicalTaskStateReadModel;
  const plannerTask = { ...staleTask, canonical_schedule_boundary: scheduleBoundary } as Task;
  const context = {
    now: "2026-09-23T12:00:00.000Z",
    timezone: "America/New_York",
    logicalDayRollover: "06:00",
  };
  const rolloverPlan = createEngineRolloverPlan({
    history: [
      {
        id: priorMissedFact.id,
        task_id: "task-1",
        user_id: "user-1",
        entry_date: "2026-09-21",
        status: "missed",
        occurrence_key: null,
        occurrence_due_on: "2026-09-21",
        canonical_provenance_kind: "authorized_automation",
      } as unknown as TaskHistory,
    ],
    now: context.now,
    rolloverTime: context.logicalDayRollover,
    tasks: [plannerTask],
    timezone: context.timezone,
  });
  const mutationCandidates = engineRolloverPlanTaskMutationCandidates(rolloverPlan, [plannerTask]);
  assert.equal(mutationCandidates.length, 1);

  const engineInput = buildCanonicalTaskStateEngineInput(readModel, context);
  assert.equal(engineInput.task.activeOccurrenceDueOn, null);
  const command = buildTrustedTaskStateCommand({
    intent: {
      type: "reconcile_rollover",
      task_id: "task-1",
      replay_identity: "rollover:task-1:2026-09-23:stale-no-occurrence",
      expected_revision: 4,
    },
    userId: "user-1",
    readModel,
    logicalDay: {
      identity: "user-1:2026-09-23:America/New_York:06:00:3",
      logicalDate: "2026-09-23",
      timezone: "America/New_York",
      dayStartTime: "06:00",
      settingsRevision: 3,
    },
    now: context.now,
  });
  const plan = planTaskStateCommand({ task: staleTask, engineInput }, command);
  const payload = serializeCanonicalTaskStateCommandForRpc(plan).payload as Record<string, Record<string, unknown>>;

  assert.equal(plan.normalizedResult.historyFact?.logical_date, "2026-09-22");
  assert.equal(plan.normalizedResult.historyFact?.occurrence_id, null);
  assert.equal(plan.normalizedResult.historyFact?.scheduled_due_on, null);
  assert.equal(payload.history_fact.scheduled_due_on, null);
  assert.equal(plan.normalizedResult.canonicalTaskPatch.workflow_state, "none");
});

test("stale recurring workflow without an occurrence never fabricates an occurrence binding", () => {
  const { readModel } = canonicalRolloverReadModel("rolling");
  const recurringReadModel = {
    ...readModel,
    task: {
      ...readModel.task,
      active_occurrence_due_on: "2026-08-09",
      workflow_occurrence_id: null,
    },
    occurrences: [],
  } as unknown as CanonicalTaskStateReadModel;
  const context = {
    now: "2026-08-10T12:00:00.000Z",
    timezone: "America/New_York",
    logicalDayRollover: "06:00",
  };
  const engineInput = buildCanonicalTaskStateEngineInput(recurringReadModel, context);
  const engineResult = evaluateTaskState({ ...engineInput, action: { type: "reconcile_rollover" } });
  const history = engineResult.proposedHistoryChanges.find((change) => change.type === "insert")?.row;
  assert.equal(engineInput.task.activeOccurrenceDueOn, null);
  assert.equal(engineInput.task.activeStatusLogicalDate, "2026-08-09");
  assert.equal(engineInput.workflow?.occurrenceId, null);
  assert.equal(engineInput.history.length, 0);
  assert.equal(history?.logicalDate, "2026-08-09");
  assert.equal(engineResult.logicalDate, "2026-08-10");
  assert.equal(history?.outcome, "did_my_best");
  assert.deepEqual([history?.occurrenceIdentity, history?.occurrenceDueOn], [null, null]);

  const command = buildTrustedTaskStateCommand({
    intent: {
      type: "reconcile_rollover",
      task_id: "task-1",
      replay_identity: "rollover:task-1:2026-08-10:recurring-no-occurrence",
      expected_revision: 4,
    },
    userId: "user-1",
    readModel: recurringReadModel,
    logicalDay,
    now: context.now,
  });
  const plan = planTaskStateCommand({ task: recurringReadModel.task, engineInput }, command);
  assert.equal(command.occurrenceId, null);
  assert.equal(command.scheduledDueOn, null);
  assert.equal(plan.normalizedResult.historyFact?.occurrence_id, null);
  assert.equal(plan.normalizedResult.historyFact?.scheduled_due_on, null);
});

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
  rolloverState.engineInput = {
    ...rolloverState.engineInput!,
    behaviorPolicy: normalizeTaskBehaviorProfile({
      ...STANDARD_TASK_BEHAVIOR_POLICY,
      id: "manual-actions-hidden",
      availableActions: [],
    }),
  };
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
  assert.equal(isCanonicalTaskStateCommandSemanticNoOp({ plan, task: planningState.task }), true);
});

test("quota period-close and balance projection changes are never semantic no-ops", () => {
  const planningState = state({ repeat_quota_balance: -2, repeat_quota_balance_period: "2026-08-03" });
  const base = {
    command: { commandId: "quota-rollover", commandType: "reconcile_rollover" },
    normalizedResult: {
      commandId: "quota-rollover", commandType: "reconcile_rollover", state: "accepted", conflictCode: null,
      expectedRevision: 4, nextRevision: 5, canonicalTaskPatch: {},
      compatibilityProjection: {
        status: planningState.task.status, dueOn: planningState.task.due_on, completedAt: planningState.task.completed_at,
        activeStatusLogicalDate: planningState.task.active_status_logical_date,
        activeOccurrenceDueOn: planningState.task.active_occurrence_due_on,
        repeatQuotaBalance: planningState.task.repeat_quota_balance,
        repeatQuotaBalancePeriod: planningState.task.repeat_quota_balance_period,
      },
      historyFact: null, automaticHistoryFacts: [], automaticHistoryDeleteIds: [], occurrence: null,
      scheduleBoundary: null, occurrenceEffectiveOverride: null, calendarOverride: null,
      rewardEntitlement: null, quotaPeriodFacts: [], warnings: [],
    },
  } as ReturnType<typeof planTaskStateCommand>;
  assert.equal(isCanonicalTaskStateCommandSemanticNoOp({ plan: base, task: planningState.task }), true);
  assert.equal(isCanonicalTaskStateCommandSemanticNoOp({
    plan: { ...base, normalizedResult: { ...base.normalizedResult, quotaPeriodFacts: [{} as never] } },
    task: planningState.task,
  }), false);
  assert.equal(isCanonicalTaskStateCommandSemanticNoOp({
    plan: { ...base, normalizedResult: { ...base.normalizedResult, compatibilityProjection: { ...base.normalizedResult.compatibilityProjection, repeatQuotaBalance: 0 } } },
    task: planningState.task,
  }), false);
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

test("rewards-disabled quota Complete serializes without reward entitlement fields", () => {
  const planningState = state({
    repeat_frequency: "per_week",
    repeat_quota_count: 3,
    repeat_quota_balance_enabled: true,
    repeat_quota_balance: -2,
    repeat_quota_balance_period: "2026-08-03",
  });
  planningState.engineInput = {
    ...planningState.engineInput!,
    behaviorPolicy: { ...STANDARD_TASK_BEHAVIOR_POLICY, rewards: "disabled" },
    task: {
      ...planningState.engineInput!.task,
      dueOn: "2026-08-10",
      recurrence: {
        kind: "quota",
        period: "week",
        count: 3,
        balanceEnabled: true,
        activationDate: "2026-08-10",
        scheduleBoundaryId: "quota-boundary-disabled-rewards",
      },
    },
  };
  const plan = planTaskStateCommand(planningState, {
    ...command({ commandId: "00000000-0000-4000-8000-000000000101" }),
    type: "complete",
  });
  const payload = serializeCanonicalTaskStateCommandForRpc(plan).payload as Record<string, unknown>;
  const historyFact = payload.history_fact as Record<string, unknown>;

  assert.equal(plan.normalizedResult.historyFact?.outcome, "complete");
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
  assert.equal(payload.reward_eligible, undefined);
  assert.equal(payload.reward_program_version, undefined);
  assert.equal(historyFact.reward_eligible, false);
  assert.equal(plan.normalizedResult.compatibilityProjection.repeatQuotaBalance, null);
});

test("permanent Complete clears every quota compatibility balance while retaining its historical command fact", () => {
  for (const balance of [-3, 0, 4] as const) {
    const planningState = state({
      repeat_frequency: "per_week",
      repeat_quota_count: 3,
      repeat_quota_balance_enabled: true,
      repeat_quota_balance: balance,
      repeat_quota_balance_period: "2026-08-03",
    });
    const plan = planTaskStateCommand(planningState, {
      ...command({ commandId: `00000000-0000-4000-8000-0000000001${balance + 4}` }),
      type: "complete",
    });
    assert.equal(plan.normalizedResult.compatibilityProjection.repeatQuotaBalance, null);
    assert.equal(plan.normalizedResult.compatibilityProjection.repeatQuotaBalancePeriod, null);
    assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, null);
    assert.equal(plan.normalizedResult.historyFact?.outcome, "complete");
  }
  const disabled = planTaskStateCommand(state({
    repeat_frequency: "per_month", repeat_quota_count: 3, repeat_quota_balance_enabled: false,
    repeat_quota_balance: 0, repeat_quota_balance_period: null,
  }), { ...command({ commandId: "00000000-0000-4000-8000-000000000099" }), type: "complete" });
  assert.equal(disabled.normalizedResult.compatibilityProjection.repeatQuotaBalance, null);
  assert.equal(disabled.normalizedResult.compatibilityProjection.repeatQuotaBalancePeriod, null);

  const terminalState = state({
    terminal_state: "permanently_complete", status: "complete", due_on: null,
    repeat_frequency: "per_week", repeat_quota_count: 3, repeat_quota_balance_enabled: true,
    repeat_quota_balance: null, repeat_quota_balance_period: null,
  });
  terminalState.engineInput = {
    ...terminalState.engineInput!,
    task: {
      ...terminalState.engineInput!.task,
      lifecycle: "complete",
      activeStatus: "complete",
      dueOn: null,
      recurrence: { kind: "quota", period: "week", count: 3, balanceEnabled: true, scheduleBoundaryId: "quota-boundary" },
    },
  };
  const rollover = planTaskStateCommand(terminalState, trustedCommand({
    type: "reconcile_rollover", task_id: "task-1", replay_identity: "rollover:complete:quota", expected_revision: 4,
  }, terminalState.task, boundary("rolling")));
  assert.equal(rollover.normalizedResult.compatibilityProjection.dueOn, null);
  assert.deepEqual(rollover.normalizedResult.quotaPeriodFacts, []);
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
  assert.equal(upcoming.normalizedResult.compatibilityProjection.status, "not_due");
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

test("quota schedule changes start a new prospective balance projection", () => {
  const quotaState = state({
    repeat_frequency: "per_week",
    repeat_quota_count: 3,
    repeat_quota_balance_enabled: true,
    repeat_quota_balance: -4,
    repeat_quota_balance_period: "2026-08-10",
  });
  quotaState.engineInput = {
    ...quotaState.engineInput!,
    task: {
      ...quotaState.engineInput!.task,
      dueOn: "2026-08-10",
      recurrence: {
        kind: "quota",
        period: "week",
        count: 3,
        balanceEnabled: true,
        activationDate: "2026-08-10",
        scheduleBoundaryId: "boundary-old-quota",
      },
    },
  };

  let sequence = 0;
  const plan = (schedule: Partial<CanonicalTaskScheduleBoundary>) => planTaskStateCommand(quotaState, command({
    type: "schedule_change",
    changeKind: "repeat",
    commandId: `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    scheduleBoundary: {
      ...boundary("fixed"),
      id: "boundary-new-quota",
      repeat_frequency: "per_week",
      repeat_quota_count: 3,
      repeat_quota_balance_enabled: true,
      ...schedule,
    },
  }));

  const switchedPeriod = plan({
    repeat_frequency: "per_month",
    repeat_quota_count: 5,
  });
  assert.equal(switchedPeriod.normalizedResult.compatibilityProjection.repeatQuotaBalance, 0);
  assert.equal(switchedPeriod.normalizedResult.compatibilityProjection.repeatQuotaBalancePeriod, "2026-08");
  assert.equal(switchedPeriod.normalizedResult.scheduleBoundary?.repeat_frequency, "per_month");

  const changedCount = plan({ repeat_quota_count: 5 });
  assert.equal(changedCount.normalizedResult.compatibilityProjection.repeatQuotaBalance, 0);
  assert.equal(changedCount.normalizedResult.compatibilityProjection.repeatQuotaBalancePeriod, "2026-08-10");

  const balanceOff = plan({ repeat_quota_balance_enabled: false });
  assert.equal(balanceOff.normalizedResult.compatibilityProjection.repeatQuotaBalance, 0);
  assert.equal(balanceOff.normalizedResult.compatibilityProjection.repeatQuotaBalancePeriod, null);

  const normal = plan({ repeat_frequency: "none", repeat_quota_count: null, repeat_quota_balance_enabled: false });
  assert.equal(normal.normalizedResult.compatibilityProjection.repeatQuotaBalance, null);
  assert.equal(normal.normalizedResult.compatibilityProjection.repeatQuotaBalancePeriod, null);
});

test("quota rollover planner emits close evidence across skipped weekly and monthly periods and retries idempotently", () => {
  for (const scenario of [
    {
      period: "week" as const,
      today: "2026-10-13",
      activationDate: "2026-09-28",
      closePeriodKey: "2026-10-05",
      expectedMisses: [
        "2026-10-02", "2026-10-03", "2026-10-04",
        "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11",
        "2026-10-12",
      ],
    },
    {
      period: "month" as const,
      today: "2027-03-05",
      activationDate: "2027-01-01",
      closePeriodKey: "2027-02",
      expectedMisses: [
        "2027-01-29", "2027-01-30", "2027-01-31",
        "2027-02-23", "2027-02-24", "2027-02-25", "2027-02-26", "2027-02-27", "2027-02-28",
      ],
    },
  ]) {
    const planningState = state({
      due_on: scenario.activationDate,
      repeat_frequency: scenario.period === "week" ? "per_week" : "per_month",
      repeat_quota_count: 3,
      repeat_quota_balance_enabled: true,
      repeat_quota_balance: 0,
      repeat_quota_balance_period: scenario.period === "week" ? "2026-09-28" : "2027-01",
    });
    planningState.engineInput = {
      ...planningState.engineInput!,
      now: `${scenario.today}T14:00:00.000Z`,
      task: {
        ...planningState.engineInput!.task,
        dueOn: scenario.activationDate,
        recurrence: {
          kind: "quota",
          period: scenario.period,
          count: 3,
          balanceEnabled: true,
          activationDate: scenario.activationDate,
          scheduleBoundaryId: `boundary-quota-${scenario.period}`,
          incomingBalance: 0,
        },
      },
      history: [],
      quotaPeriodFacts: [],
    };
    const rollover = (revision: number, commandId: string) => command({
      type: "rollover",
      commandId,
      expectedRevision: revision,
      logicalDay: { ...logicalDay, logicalDate: scenario.today },
      scheduleBoundaryId: `boundary-quota-${scenario.period}`,
      idempotenceIdentity: `quota-rollover:${scenario.period}:${scenario.today}`,
    });
    const firstPlan = planTaskStateCommand(planningState, rollover(4, `00000000-0000-4000-8000-0000000002${scenario.period === "week" ? "1" : "2"}`));
    const automaticDates = firstPlan.normalizedResult.automaticHistoryFacts.map((fact) => fact.logical_date);
    assert.deepEqual(automaticDates, scenario.expectedMisses, scenario.period);
    const firstFact = firstPlan.normalizedResult.quotaPeriodFacts[0];
    assert.equal(firstFact?.period_key, scenario.closePeriodKey, scenario.period);
    assert.equal(firstFact?.incoming_balance, -3, scenario.period);
    assert.equal(firstFact?.successful_days, 0, scenario.period);
    assert.equal(firstFact?.next_balance, -6, scenario.period);

    const retryHistory = automaticDates.map((date) => automaticMissedHistory(date, date));
    const retryFacts: TaskQuotaPeriodFact[] = firstPlan.normalizedResult.quotaPeriodFacts.map((fact, index) => ({
      id: `planned-close-${scenario.period}-${index}`,
      entityId: "task-1",
      scheduleBoundaryId: fact.schedule_boundary_id,
      periodKind: fact.period_kind,
      periodKey: fact.period_key,
      periodStart: fact.period_start,
      periodEnd: fact.period_end,
      baseQuota: fact.base_quota,
      incomingBalance: fact.incoming_balance,
      successfulDays: fact.successful_days,
      nextBalance: fact.next_balance,
      balanceEnabled: fact.balance_enabled,
      eventKind: fact.event_kind,
      commandId: fact.command_id ?? null,
      idempotenceIdentity: fact.idempotence_identity,
      createdAt: "2027-03-06T01:00:00.000Z",
      revision: 1,
    }));
    const retryState = {
      task: { ...planningState.task, canonical_revision: 5 },
      engineInput: {
        ...planningState.engineInput!,
        history: retryHistory,
        quotaPeriodFacts: retryFacts,
      },
    };
    const retryPlan = planTaskStateCommand(retryState, rollover(5, `00000000-0000-4000-8000-0000000002${scenario.period === "week" ? "3" : "4"}`));
    assert.deepEqual(retryPlan.normalizedResult.automaticHistoryFacts, [], scenario.period);
    assert.equal(retryPlan.normalizedResult.quotaPeriodFacts[0]?.idempotence_identity, firstFact?.idempotence_identity, scenario.period);
    assert.equal(retryPlan.normalizedResult.quotaPeriodFacts[0]?.next_balance, -6, scenario.period);
  }
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

test("historical Every-3-Days success replacement preserves dependent automatic Missed facts", () => {
  for (const outcome of ["done", "did_my_best"] as const) {
    const planningState = state({ due_on: "2026-08-17", repeat_frequency: "daily", repeat_interval: 3 });
    planningState.engineInput = {
      ...planningState.engineInput!,
      now: "2026-08-20T12:00:00.000Z",
      task: {
        ...planningState.engineInput!.task,
        dueOn: "2026-08-17",
        recurrence: { kind: "rolling", intervalDays: 3 },
      },
      history: [
        automaticMissedHistory("2026-08-17", "2026-08-17"),
        automaticMissedHistory("2026-08-18", "2026-08-17"),
        automaticMissedHistory("2026-08-19", "2026-08-17"),
      ],
    };
    const commandLogicalDay = { ...logicalDay, logicalDate: "2026-08-20" };
    const plan = planTaskStateCommand(planningState, trustedCommand({
      type: "set_outcome",
      task_id: "task-1",
      replay_identity: `calendar:every-3-days:${outcome}`,
      outcome,
      logical_date: "2026-08-17",
    }, planningState.task, { ...boundary("rolling"), repeat_interval: 3, anchor_date: "2026-08-17" }, commandLogicalDay));
    const payload = serializeCanonicalTaskStateCommandForRpc(plan).payload as Record<string, unknown>;

    assert.equal(plan.normalizedResult.historyFact?.outcome, outcome);
    assert.deepEqual(plan.normalizedResult.automaticHistoryDeleteIds, [], outcome);
    assert.equal(payload.automatic_history_delete_ids, undefined, outcome);
    assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-20", outcome);
    assert.equal(plan.normalizedResult.rewardEntitlement?.logicalDate, "2026-08-17", outcome);
  }
});

test("same-day Every-3-Days success retains live dependent automatic Missed cleanup", () => {
  const planningState = state({ due_on: "2026-08-17", repeat_frequency: "daily", repeat_interval: 3 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    now: "2026-08-17T12:00:00.000Z",
    task: {
      ...planningState.engineInput!.task,
      dueOn: "2026-08-17",
      recurrence: { kind: "rolling", intervalDays: 3 },
    },
    history: [
      automaticMissedHistory("2026-08-17", "2026-08-17"),
      automaticMissedHistory("2026-08-18", "2026-08-17"),
    ],
  };
  const plan = planTaskStateCommand(planningState, trustedCommand({
    type: "set_outcome",
    task_id: "task-1",
    replay_identity: "calendar:every-3-days:live-done",
    outcome: "done",
    logical_date: "2026-08-17",
  }, planningState.task, { ...boundary("rolling"), repeat_interval: 3, anchor_date: "2026-08-17" }, {
    ...logicalDay,
    logicalDate: "2026-08-17",
    identity: "user-1:2026-08-17:America/New_York:06:00:3",
  }));
  const payload = serializeCanonicalTaskStateCommandForRpc(plan).payload as Record<string, unknown>;

  assert.deepEqual(plan.normalizedResult.automaticHistoryDeleteIds, ["automatic-missed-2026-08-18"]);
  assert.deepEqual(payload.automatic_history_delete_ids, ["automatic-missed-2026-08-18"]);
});

test("multi-date historical replacements preserve unselected later facts between canonical plans", () => {
  const planningState = state({ due_on: "2026-09-15", repeat_frequency: "daily", repeat_interval: 3 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    now: "2026-09-24T12:00:00.000Z",
    task: {
      ...planningState.engineInput!.task,
      activeStatus: "missed",
      dueOn: "2026-09-15",
      recurrence: { kind: "rolling", intervalDays: 3 },
    },
    history: [
      ...["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"]
        .map((logicalDate) => automaticMissedHistory(logicalDate, "2026-09-15")),
    ],
  };
  const originalLaterIds = planningState.engineInput.history
    .filter((row) => row.logicalDate > "2026-09-15")
    .map((row) => row.id);

  for (const [index, logicalDate] of ["2026-09-15", "2026-09-17"].entries()) {
    const plan = planTaskStateCommand(planningState, trustedCommand({
      type: "set_outcome",
      task_id: "task-1",
      replay_identity: `calendar:multi-date:${logicalDate}`,
      outcome: "done",
      logical_date: logicalDate,
    }, planningState.task, { ...boundary("rolling"), repeat_interval: 3, anchor_date: "2026-09-15" }, {
      ...logicalDay,
      logicalDate: "2026-09-24",
      identity: `user-1:2026-09-24:America/New_York:06:00:3:${index}`,
    }));

    assert.deepEqual(plan.normalizedResult.automaticHistoryDeleteIds, [], logicalDate);
    planningState.engineInput.history = planningState.engineInput.history.map((row) => (
      row.logicalDate === logicalDate
        ? { ...row, outcome: "done" as const, provenance: "manual" as const }
        : row
    ));
  }

  assert.deepEqual(
    planningState.engineInput.history.filter((row) => row.logicalDate > "2026-09-15").map((row) => row.id),
    originalLaterIds,
  );
  assert.deepEqual(
    planningState.engineInput.history.filter((row) => ["2026-09-15", "2026-09-17"].includes(row.logicalDate)).map((row) => row.outcome),
    ["done", "done"],
  );
});

test("canonical Daily success projection derives its own date after ambiguous old Missed rows", () => {
  for (const outcome of ["done", "did_my_best"] as const) {
    const planningState = state({ due_on: "2026-08-24", repeat_frequency: "daily", status: "missed" });
    planningState.engineInput = {
      ...planningState.engineInput!,
      now: "2026-08-23T12:00:00.000Z",
      task: { ...planningState.engineInput!.task, activeStatus: "missed", dueOn: "2026-08-24", recurrence: { kind: "rolling", intervalDays: 1 } },
      history: [
        missedHistory("2026-08-20"),
        missedHistory("2026-08-21"),
      ],
    };
    const plan = planTaskStateCommand(planningState, command({
      logicalDay: { ...logicalDay, logicalDate: "2026-08-23" },
      logicalDate: "2026-08-23",
      outcome,
      occurrenceKey: null,
      scheduledDueOn: null,
    }));

    assert.equal(plan.normalizedResult.compatibilityProjection.status, "not_due", outcome);
    assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-24", outcome);
    assert.equal(plan.normalizedResult.historyFact?.scheduled_due_on, "2026-08-23", outcome);
    assert.equal(plan.command.payload.occurrenceKey, null, outcome);
    assert.deepEqual(plan.normalizedResult.automaticHistoryDeleteIds, [], outcome);
  }
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

test("trusted backdated schedule planner uses the current Missed policy without rewards", () => {
  const planningState = state({ due_on: "2026-08-27", repeat_frequency: "daily", repeat_interval: 4 });
  const historicalBlank = {
    ...STANDARD_TASK_BEHAVIOR_POLICY,
    id: "standard-blank-before-current-missed",
    effectiveFromLogicalDate: "2026-08-01",
    unresolvedOccurrence: "blank" as const,
    missedStreakOnUnhandled: "ignore" as const,
  };
  const currentMissed = {
    ...STANDARD_TASK_BEHAVIOR_POLICY,
    id: "standard-missed-current",
    effectiveFromLogicalDate: "2026-08-27",
  };
  planningState.engineInput = {
    ...planningState.engineInput!,
    behaviorPolicy: currentMissed,
    behaviorPolicyRevisions: [historicalBlank, currentMissed],
    now: "2026-08-27T12:00:00.000Z",
    timezone: "UTC",
    logicalDayRollover: "00:00",
    task: {
      ...planningState.engineInput!.task,
      dueOn: "2026-08-27",
      historicalScheduleAnchor: "2026-08-27",
      historicalScheduleAnchorProven: true,
      recurrence: { kind: "rolling", intervalDays: 4 },
    },
    history: [],
  };
  const currentBoundary = {
    ...boundary("rolling"),
    id: "boundary-backdated",
    effective_from_logical_date: "2026-08-27",
    repeat_interval: 4,
    anchor_date: "2026-08-17",
  };
  const command = trustedCommand({
    type: "set_due_date",
    task_id: "task-1",
    replay_identity: "table:due:backdated-rolling-four",
    logical_date: "2026-08-27",
    schedule: { schedule_model: "rolling", repeat_frequency: "daily", repeat_interval: 4, anchor_date: "2026-08-17" },
  }, planningState.task, currentBoundary, {
    ...logicalDay,
    identity: "user-1:2026-08-27:UTC:00:00:3",
    logicalDate: "2026-08-27",
    timezone: "UTC",
    dayStartTime: "00:00",
  });
  const plan = planTaskStateCommand(planningState, command);
  const serialized = serializeCanonicalTaskStateCommandForRpc(plan);
  const payload = serialized.payload as Record<string, unknown>;
  const automaticFacts = payload.automatic_history_facts as Array<Record<string, unknown>>;

  assert.equal(plan.normalizedResult.compatibilityProjection.status, "missed");
  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-17");
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
  assert.deepEqual(plan.normalizedResult.automaticHistoryFacts.map((fact) => fact.logical_date), [
    "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21",
    "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26",
  ]);
  assert.equal(automaticFacts.every((fact) => (
    fact.provenance_kind === "authorized_automation"
      && fact.actor_kind === "authorized_automation"
      && fact.outcome === "missed"
      && fact.schedule_boundary_id === command.scheduleBoundary?.id
  )), true);
  assert.equal("reward_program_version" in payload, false);
});

test("trusted backdated Custom Daily schedule with a current blank policy does not materialize automatic Missed facts", () => {
  const planningState = state({ due_on: "2026-08-27", repeat_frequency: "daily", repeat_interval: 1, task_type: "custom" });
  const historicalStandard = {
    ...STANDARD_TASK_BEHAVIOR_POLICY,
    id: "standard-before-custom-blank",
    effectiveFromLogicalDate: "2026-08-01",
  };
  const customBaseline = {
    id: "custom-behavior-profile",
    effectiveFromLogicalDate: "2026-08-27",
    unresolvedOccurrence: "blank" as const,
    positiveStreakOnUnhandled: "break" as const,
    missedStreakOnUnhandled: "ignore" as const,
    rewards: "enabled" as const,
  };
  planningState.engineInput = {
    ...planningState.engineInput!,
    behaviorPolicy: customBaseline,
    behaviorPolicyRevisions: [historicalStandard, customBaseline],
    now: "2026-08-27T12:00:00.000Z",
    timezone: "UTC",
    logicalDayRollover: "00:00",
    task: {
      ...planningState.engineInput!.task,
      dueOn: "2026-08-27",
      historicalScheduleAnchor: "2026-08-27",
      historicalScheduleAnchorProven: true,
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
    history: [],
  };
  const currentBoundary = {
    ...boundary("rolling"),
    id: "boundary-custom-blank-backdate",
    effective_from_logical_date: "2026-08-27",
    repeat_interval: 1,
    anchor_date: "2026-08-17",
  };
  const command = trustedCommand({
    type: "set_due_date",
    task_id: "task-1",
    replay_identity: "table:due:custom-blank-backdate",
    logical_date: "2026-08-27",
    schedule: { schedule_model: "rolling", repeat_frequency: "daily", repeat_interval: 1, anchor_date: "2026-08-17" },
  }, planningState.task, currentBoundary, {
    ...logicalDay,
    identity: "user-1:2026-08-27:UTC:00:00:3",
    logicalDate: "2026-08-27",
    timezone: "UTC",
    dayStartTime: "00:00",
  });
  const plan = planTaskStateCommand(planningState, command);

  assert.equal(plan.normalizedResult.automaticHistoryFacts.length, 0);
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
});

test("trusted Daily backdate from 2026-08-17 to logical day 2026-08-27 preserves the exact automatic Missed facts", () => {
  const planningState = state({ due_on: "2026-08-27", repeat_frequency: "daily", repeat_interval: 1 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    now: "2026-08-27T12:00:00.000Z",
    task: {
      ...planningState.engineInput!.task,
      dueOn: "2026-08-27",
      historicalScheduleAnchor: "2026-08-27",
      historicalScheduleAnchorProven: true,
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
    history: [],
  };
  const currentBoundary = {
    ...boundary("rolling"),
    id: "boundary-ab3-daily-backdate",
    effective_from_logical_date: "2026-08-27",
    repeat_interval: 1,
    anchor_date: "2026-08-17",
  };
  const command = trustedCommand({
    type: "set_due_date",
    task_id: "task-1",
    replay_identity: "table:due:ab3-daily-backdate",
    logical_date: "2026-08-27",
    schedule: { schedule_model: "rolling", repeat_frequency: "daily", repeat_interval: 1, anchor_date: "2026-08-17" },
  }, planningState.task, currentBoundary, {
    ...logicalDay,
    identity: "user-1:2026-08-27:America/New_York:06:00:3",
    logicalDate: "2026-08-27",
  });
  const plan = planTaskStateCommand(planningState, command);
  const payload = serializeCanonicalTaskStateCommandForRpc(plan).payload as Record<string, unknown>;
  const automaticFacts = payload.automatic_history_facts as Array<Record<string, unknown>>;

  assert.equal(plan.normalizedResult.compatibilityProjection.status, "missed");
  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-17");
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
  assert.deepEqual(plan.normalizedResult.automaticHistoryFacts.map((fact) => [fact.logical_date, fact.outcome, fact.scheduled_due_on]), [
    ["2026-08-17", "missed", "2026-08-17"],
    ["2026-08-18", "missed", "2026-08-18"],
    ["2026-08-19", "missed", "2026-08-19"],
    ["2026-08-20", "missed", "2026-08-20"],
    ["2026-08-21", "missed", "2026-08-21"],
    ["2026-08-22", "missed", "2026-08-22"],
    ["2026-08-23", "missed", "2026-08-23"],
    ["2026-08-24", "missed", "2026-08-24"],
    ["2026-08-25", "missed", "2026-08-25"],
    ["2026-08-26", "missed", "2026-08-26"],
  ]);
  assert.equal(automaticFacts.length, 10);
  assert.equal(automaticFacts.every((fact) => (
    fact.provenance_kind === "authorized_automation"
      && fact.actor_kind === "authorized_automation"
      && fact.outcome === "missed"
      && fact.schedule_boundary_id === command.scheduleBoundary?.id
  )), true);
  assert.equal("reward_program_version" in payload, false);
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
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "not_due");
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
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "not_due");
  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-11");
  assert.deepEqual(plan.normalizedResult.automaticHistoryDeleteIds, []);
});

test("trusted Calendar override planner preserves manual blank_due authority without History", () => {
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
    replay_identity: "calendar:2026-08-10:blank-due",
    logical_date: "2026-08-10",
    override_state: "blank_due",
  }, planningState.task, boundary("one_time"));

  const plan = planTaskStateCommand(planningState, planned);

  assert.equal(plan.normalizedResult.calendarOverride?.override_state, "blank_due");
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "pending");
  assert.deepEqual(plan.normalizedResult.automaticHistoryDeleteIds, []);
});

test("Calendar manual authority retires only replaceable same-date History in the canonical plan", () => {
  const cases = [
    ["done", "in_progress"],
    ["done", "blank_due"],
    ["did_my_best", "not_due"],
    ["missed", "due_open"],
  ] as const;

  for (const [outcome, overrideState] of cases) {
    const planningState = state({ due_on: "2026-08-10", status: outcome === "missed" ? "missed" : "pending" });
    const existing = outcome === "done"
      ? doneHistory("2026-08-10")
      : outcome === "did_my_best"
        ? { ...doneHistory("2026-08-10"), outcome: "did_my_best" as const, id: "dmb-2026-08-10" }
        : missedHistory("2026-08-10");
    planningState.engineInput = {
      ...planningState.engineInput!,
      task: { ...planningState.engineInput!.task, dueOn: "2026-08-10", recurrence: { kind: "rolling", intervalDays: 1 } },
      history: [existing],
    };
    const command = trustedCommand({
      type: "calendar_override",
      task_id: "task-1",
      replay_identity: `calendar-authority:${outcome}:${overrideState}`,
      logical_date: "2026-08-10",
      override_state: overrideState,
    }, planningState.task, boundary("rolling"));
    const plan = planTaskStateCommand(planningState, command);
    const payload = serializeCanonicalTaskStateCommandForRpc(plan).payload as Record<string, unknown>;

    assert.equal(plan.normalizedResult.calendarOverride?.override_state, overrideState);
    assert.deepEqual(plan.normalizedResult.calendarOverrideHistoryDeleteIds, [existing.id]);
    assert.deepEqual(payload.history_fact_delete_ids, [existing.id]);
    assert.equal(plan.normalizedResult.rewardEntitlement, null);
  }
});

test("Done to In Progress leaves the Task projection unchanged while the reconstructed Effective Timeline is manual", () => {
  const planningState = state({ due_on: "2026-08-10", status: "pending" });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: { ...planningState.engineInput!.task, dueOn: "2026-08-10", recurrence: { kind: "rolling", intervalDays: 1 } },
    history: [doneHistory("2026-08-10")],
  };
  const plan = planTaskStateCommand(planningState, trustedCommand({
    type: "calendar_override",
    task_id: "task-1",
    replay_identity: "calendar-authority:done-to-in-progress",
    logical_date: "2026-08-10",
    override_state: "in_progress",
  }, planningState.task, boundary("rolling")));
  const timeline = buildTaskEffectiveTimeline({
    task: planningState.engineInput.task,
    history: [],
    calendarOverrides: [{ id: "override-1", logicalDate: "2026-08-10", overrideState: "in_progress" }],
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-10",
    calendarEnd: "2026-08-10",
  });

  assert.equal(plan.normalizedResult.compatibilityProjection.status, "pending");
  assert.equal(timeline.days["2026-08-10"]?.state, "in_progress");
  assert.equal(timeline.days["2026-08-10"]?.sourceKind, "calendar_override");
  assert.deepEqual(plan.normalizedResult.calendarOverrideHistoryDeleteIds, ["done-2026-08-10"]);
});

test("Complete and Delayed History remain protected from Calendar overrides", () => {
  for (const outcome of ["complete", "delayed"] as const) {
    const planningState = state({ due_on: "2026-08-10" });
    planningState.engineInput = {
      ...planningState.engineInput!,
      task: { ...planningState.engineInput!.task, dueOn: "2026-08-10", recurrence: { kind: "rolling", intervalDays: 1 } },
      history: [{ ...doneHistory("2026-08-10"), id: `${outcome}-2026-08-10`, outcome }],
    };
    assert.throws(
      () => planTaskStateCommand(planningState, trustedCommand({
        type: "calendar_override",
        task_id: "task-1",
        replay_identity: `calendar-authority:protected:${outcome}`,
        logical_date: "2026-08-10",
        override_state: "not_due",
      }, planningState.task, boundary("rolling"))),
      (error: unknown) => error instanceof Error
        && "code" in error
        && error.code === "CALENDAR_OVERRIDE_PROTECTED_HISTORY",
    );
  }
});

test("Automatic clears the manual Calendar authority and restores calculated planning", () => {
  const planningState = state({ due_on: "2026-08-10" });
  planningState.engineInput = {
    ...planningState.engineInput!,
    task: { ...planningState.engineInput!.task, dueOn: "2026-08-10", recurrence: { kind: "rolling", intervalDays: 1 } },
    history: [],
    calendarOverrides: [{ id: "override-1", logicalDate: "2026-08-10", overrideState: "not_due" }],
  };
  const plan = planTaskStateCommand(planningState, trustedCommand({
    type: "clear_outcome",
    task_id: "task-1",
    replay_identity: "calendar-authority:automatic",
    logical_date: "2026-08-10",
  }, planningState.task, boundary("rolling")));

  assert.equal(plan.normalizedResult.calendarOverride, null);
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "pending");
  assert.deepEqual(plan.normalizedResult.calendarOverrideHistoryDeleteIds, []);
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
  assert.deepEqual(plan.normalizedResult.automaticHistoryDeleteIds, []);
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

test("recalculate_history plans only post-boundary stale Missed deletion and Calendar override retirement", () => {
  const planningState = state({ status: "missed", due_on: "2026-09-07", repeat_frequency: "daily", repeat_interval: 5 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    now: "2026-09-10T14:00:00.000Z",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-10",
    task: {
      ...planningState.engineInput!.task,
      activeStatus: "missed",
      dueOn: "2026-09-02",
      recurrence: { kind: "rolling", intervalDays: 5 },
    },
    history: [
      missedHistory("2026-08-31"),
      doneHistory("2026-09-02"),
      ...["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"].map((logicalDate) => missedHistory(logicalDate)),
    ],
    calendarOverrides: [
      { id: "override-before", logicalDate: "2026-08-31", overrideState: "not_due" },
      { id: "override-from", logicalDate: "2026-09-01", overrideState: "blank_due" },
      { id: "override-after", logicalDate: "2026-09-06", overrideState: "due_open" },
    ],
  };
  const plan = planTaskStateCommand(planningState, command({
    type: "recalculate_history",
    commandId: "00000000-0000-4000-8000-000000000111",
    fromLogicalDate: "2026-09-01",
    scheduleBoundaryId: "boundary-current",
    logicalDay: { ...logicalDay, logicalDate: "2026-09-10", identity: "user-1:2026-09-10:America/New_York:06:00:3" },
  }));
  const payload = serializeCanonicalTaskStateCommandForRpc(plan).payload as Record<string, unknown>;

  assert.equal(plan.command.commandType, "recalculate_history");
  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-09-07");
  assert.deepEqual(plan.normalizedResult.recalculateHistoryDeleteIds, [
    "missed-2026-09-03",
    "missed-2026-09-04",
    "missed-2026-09-05",
    "missed-2026-09-06",
  ]);
  assert.deepEqual(plan.normalizedResult.recalculateCalendarOverrideIds, ["override-from", "override-after"]);
  assert.deepEqual(plan.normalizedResult.automaticHistoryFacts, []);
  assert.deepEqual(plan.normalizedResult.calendarOverrideHistoryDeleteIds, []);
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
  assert.equal(payload.recalculate_from_logical_date, "2026-09-01");
  assert.deepEqual(payload.recalculate_history_delete_ids, plan.normalizedResult.recalculateHistoryDeleteIds);
  assert.deepEqual(payload.recalculate_calendar_override_ids, plan.normalizedResult.recalculateCalendarOverrideIds);
  assert.equal("history_fact_delete_ids" in payload, false);
  assert.equal("reward_program_version" in payload, false);
});

test("recalculate_history does not persist a calculated Missed continuation day", () => {
  const planningState = state({ status: "missed", due_on: "2026-10-02", repeat_frequency: "daily", repeat_interval: 4 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    now: "2026-09-29T12:00:00.000Z",
    calendarStart: "2026-09-22",
    calendarEnd: "2026-09-29",
    task: {
      ...planningState.engineInput!.task,
      activeStatus: "missed",
      dueOn: "2026-09-22",
      recurrence: { kind: "rolling", intervalDays: 4 },
    },
    history: [
      doneHistory("2026-09-22"),
      missedHistory("2026-09-26"),
      doneHistory("2026-09-28", "2026-09-26"),
    ],
  };
  const plan = planTaskStateCommand(planningState, command({
    type: "recalculate_history",
    commandId: "00000000-0000-4000-8000-000000000119",
    fromLogicalDate: "2026-09-22",
    scheduleBoundaryId: "boundary-current",
    logicalDay: { ...logicalDay, logicalDate: "2026-09-29", identity: "user-1:2026-09-29:America/New_York:06:00:3" },
  }));

  assert.deepEqual(plan.normalizedResult.automaticHistoryFacts, []);
  assert.deepEqual(plan.normalizedResult.recalculateHistoryDeleteIds, []);
  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-10-02");
});

test("recalculate_history rejects quota recurrence before producing a mutation plan", () => {
  for (const repeatFrequency of ["per_week", "per_month"] as const) {
    const planningState = state({ repeat_frequency: repeatFrequency });
    planningState.engineInput = {
      ...planningState.engineInput!,
      task: {
        ...planningState.engineInput!.task,
        recurrence: {
          kind: "quota",
          period: repeatFrequency === "per_week" ? "week" : "month",
          count: 3,
          balanceEnabled: false,
          incomingBalance: 0,
          incomingBalancePeriodKey: null,
        },
      },
    };
    assert.throws(
      () => planTaskStateCommand(planningState, command({
        type: "recalculate_history",
        commandId: `00000000-0000-4000-8000-00000000011${repeatFrequency === "per_week" ? "2" : "3"}`,
        fromLogicalDate: "2026-08-01",
        scheduleBoundaryId: "boundary-current",
      })),
      (error: unknown) => error instanceof Error
        && "code" in error
        && error.code === "HISTORICAL_RECALCULATION_UNSUPPORTED",
      repeatFrequency,
    );
  }
});

test("recalculate_history materializes a newly required Missed fact through the current schedule boundary", () => {
  const planningState = state({ status: "missed", due_on: "2026-09-07", repeat_frequency: "daily", repeat_interval: 5 });
  planningState.engineInput = {
    ...planningState.engineInput!,
    now: "2026-09-10T14:00:00.000Z",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-10",
    task: {
      ...planningState.engineInput!.task,
      activeStatus: "missed",
      dueOn: "2026-09-02",
      recurrence: { kind: "rolling", intervalDays: 5 },
    },
    history: [
      doneHistory("2026-09-02"),
      ...["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"].map((logicalDate) => missedHistory(logicalDate)),
    ],
  };
  const plan = planTaskStateCommand(planningState, command({
    type: "recalculate_history",
    commandId: "00000000-0000-4000-8000-000000000114",
    fromLogicalDate: "2026-09-01",
    scheduleBoundaryId: "boundary-current",
    logicalDay: { ...logicalDay, logicalDate: "2026-09-10", identity: "user-1:2026-09-10:America/New_York:06:00:3" },
  }));

  assert.deepEqual(plan.normalizedResult.recalculateHistoryDeleteIds, [
    "missed-2026-09-03",
    "missed-2026-09-04",
    "missed-2026-09-05",
    "missed-2026-09-06",
  ]);
  assert.deepEqual(plan.normalizedResult.automaticHistoryFacts.map((fact) => [fact.logical_date, fact.schedule_boundary_id]), [["2026-09-07", "boundary-current"]]);
  assert.deepEqual(plan.normalizedResult.recalculateCalendarOverrideIds, []);
});

test("runtime-shaped recalculation carries the current read-model boundary without decorating the engine snapshot", () => {
  const currentBoundary = {
    ...boundary("rolling"),
    id: "boundary-runtime-current",
    effective_from_logical_date: "2026-09-01",
    boundary_sequence: 7,
    repeat_interval: 5,
    anchor_date: "2026-09-02",
  };
  const runtimeTask = task({
    status: "missed",
    due_on: "2026-09-07",
    repeat_frequency: "daily",
    repeat_interval: 5,
  });
  const readModel = {
    ...trustedReadModel(runtimeTask, currentBoundary),
    historyFacts: [
      canonicalHistoryFact("2026-09-02", "done", currentBoundary.id),
      ...["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]
        .map((logicalDate) => canonicalHistoryFact(logicalDate, "missed", currentBoundary.id)),
    ],
  } as unknown as CanonicalTaskStateReadModel;
  const context = {
    now: "2026-09-10T14:00:00.000Z",
    timezone: "America/New_York",
    logicalDayRollover: "06:00",
  };
  const engineInput = buildCanonicalTaskStateEngineInput(readModel, context);

  assert.equal("canonical_schedule_boundary" in engineInput.task, false);

  const intent = {
    type: "recalculate_history" as const,
    task_id: "task-1",
    replay_identity: "recalculate-history-runtime-shaped",
    expected_revision: runtimeTask.canonical_revision ?? undefined,
    from_logical_date: "2026-09-01",
  };
  const command = buildTrustedTaskStateCommand({
    intent,
    userId: "user-1",
    readModel,
    logicalDay: {
      identity: "user-1:2026-09-10:America/New_York:06:00:3",
      logicalDate: "2026-09-10",
      timezone: "America/New_York",
      dayStartTime: "06:00",
      settingsRevision: 3,
    },
    now: context.now,
  });
  assert.equal(command.scheduleBoundaryId, currentBoundary.id);

  const plan = planTaskStateCommand({ task: readModel.task, engineInput }, command);
  const serialized = serializeCanonicalTaskStateCommandForRpc(plan).payload as Record<string, unknown>;
  const automaticFacts = serialized.automatic_history_facts as Array<Record<string, unknown>>;

  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-09-07");
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "missed");
  assert.deepEqual(plan.normalizedResult.automaticHistoryFacts.map((fact) => [fact.logical_date, fact.schedule_boundary_id]), [
    ["2026-09-07", currentBoundary.id],
  ]);
  assert.deepEqual(automaticFacts.map((fact) => [fact.logical_date, fact.schedule_boundary_id]), [
    ["2026-09-07", currentBoundary.id],
  ]);
});

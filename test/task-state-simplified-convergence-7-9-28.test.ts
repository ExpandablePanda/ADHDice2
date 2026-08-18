import assert from "node:assert/strict";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { buildCanonicalTaskStateEngineInput } from "../src/lib/task-state-canonical/engine-input.ts";
import {
  planTaskStateCommand,
  type CanonicalTaskStateCommand,
} from "../src/lib/task-state-canonical/command-service.ts";
import type { CanonicalTaskHistoryFact, CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";
import type { CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";
import { evaluateTaskState } from "../src/lib/task-state-engine/engine.ts";
import { resolveActiveTaskStatuses } from "../src/lib/task-state-engine/read-authority.ts";

const TODAY = "2026-08-17";
const CONTEXT = {
  logicalDayRollover: "00:00",
  now: `${TODAY}T12:00:00.000Z`,
  timezone: "UTC",
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    active_occurrence_due_on: null,
    active_status_logical_date: null,
    actual_seconds: 0,
    completed_at: null,
    created_at: "2026-08-01T12:00:00.000Z",
    due_on: TODAY,
    due_time: null,
    energy: "medium",
    estimated_minutes: null,
    external_link_label: null,
    external_link_url: null,
    id: "task-7-9-28",
    is_important: false,
    is_urgent: false,
    notes: null,
    one_step_at_a_time: false,
    parent_task_id: null,
    pin_order: null,
    pinned_at: null,
    priority: "normal",
    repeat_day_of_month: null,
    repeat_days_of_week: [],
    repeat_frequency: "custom",
    repeat_interval: 3,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    revision: 1,
    scheduled_on: null,
    sort_order: 0,
    status: "pending",
    subtasks_auto_reset: false,
    tags: [],
    title: "7.9.28 convergence",
    trashed_at: null,
    updated_at: "2026-08-01T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function history(sourceTask: Task, logicalDate: string, status: TaskHistory["status"]): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${logicalDate}T12:00:00.000Z`,
    entry_date: logicalDate,
    event_type: status === "complete" ? "completed_permanently" : "status",
    id: `${sourceTask.id}:${logicalDate}:${status}`,
    occurrence_due_on: logicalDate,
    occurrence_key: `task:${sourceTask.id}:occurrence:${logicalDate}`,
    status,
    task_id: sourceTask.id,
    updated_at: `${logicalDate}T12:00:00.000Z`,
    user_id: sourceTask.user_id,
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
  };
}

function canonicalFact(sourceTask: Task, logicalDate: string, outcome: CanonicalTaskHistoryFact["outcome"]): CanonicalTaskHistoryFact {
  return {
    id: `${sourceTask.id}:${logicalDate}:${outcome}`,
    user_id: sourceTask.user_id,
    entity_id: sourceTask.id,
    entity_kind: "parent",
    logical_date: logicalDate,
    outcome,
    event_kind: outcome === "complete" ? "terminal_complete" : "explicit_outcome",
    occurrence_id: null,
    scheduled_due_on: logicalDate,
    effective_due_on: null,
    schedule_boundary_id: "boundary-7-9-28",
    recurrence_source_fingerprint: "fixture",
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: sourceTask.user_id,
    source: "test",
    logical_day_settings_revision: 1,
    timezone: "UTC",
    day_start_time: "00:00",
    command_id: null,
    idempotence_identity: `${sourceTask.id}:${logicalDate}:${outcome}`,
    source_legacy_history_id: null,
    revision: 1,
    created_at: `${logicalDate}T12:00:00.000Z`,
    updated_at: `${logicalDate}T12:00:00.000Z`,
  };
}

function canonicalTask(sourceTask: Task, overrides: Partial<Task> = {}) {
  return {
    ...sourceTask,
    ...overrides,
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
    canonical_created_at: "2026-08-01T12:00:00.000Z",
    canonical_updated_at: "2026-08-01T12:00:00.000Z",
    projection_source_canonical_revision: 4,
    projection_source_fingerprint: "fixture",
    projection_version: "task-state-projection-v1",
  };
}

function boundary(sourceTask: Task, scheduleModel: CanonicalTaskScheduleBoundary["schedule_model"] = "rolling"): CanonicalTaskScheduleBoundary {
  return {
    id: "boundary-7-9-28",
    user_id: sourceTask.user_id,
    entity_id: sourceTask.id,
    entity_kind: "parent",
    effective_from_logical_date: "2026-08-01",
    boundary_sequence: 1,
    boundary_type: "initial",
    schedule_model: scheduleModel,
    repeat_frequency: scheduleModel === "rolling" ? "custom" : "none",
    repeat_interval: sourceTask.repeat_interval,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    one_time_due_on: null,
    due_time: null,
    anchor_date: scheduleModel === "rolling" ? sourceTask.due_on : null,
    anchor_kind: scheduleModel === "rolling" ? "user_selected" : "unknown",
    anchor_confidence: scheduleModel === "rolling" ? "proven" : "unavailable",
    historical_scope_known: true,
    prospective_only: false,
    prior_boundary_id: null,
    affected_occurrence_id: null,
    logical_day_settings_revision: 1,
    timezone: "UTC",
    day_start_time: "00:00",
    actor_kind: "user",
    actor_id: sourceTask.user_id,
    source: "test",
    command_id: null,
    idempotence_identity: "boundary-7-9-28",
    migration_operation_id: null,
    migration_version: null,
    classifier_version: null,
    schema_contract_version: "task-state-schema-v1",
    source_task_revision: 1,
    revision: 1,
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
  };
}

function readModel(sourceTask: Task, facts: CanonicalTaskHistoryFact[] = [], scheduleModel: CanonicalTaskScheduleBoundary["schedule_model"] = "rolling") {
  return {
    task: canonicalTask(sourceTask),
    commandOperations: [],
    scheduleBoundaries: [boundary(sourceTask, scheduleModel)],
    occurrences: [],
    occurrenceEffectiveOverrides: [],
    historyFacts: facts,
    calendarOverrides: [],
    rewardEntitlements: [],
    rewardGrants: [],
    rewardClaimConsumptions: [],
    legacyHistoryEvidence: [],
    logicalDayProfile: { timezone: "UTC", day_start_time: "00:00", settings_revision: 1 },
  } as unknown as CanonicalTaskStateReadModel;
}

function canonicalInput(model: CanonicalTaskStateReadModel) {
  return buildCanonicalTaskStateEngineInput(model, CONTEXT);
}

function command(sourceTask: Task, outcome: "done" | "did_my_best", logicalDate = TODAY): CanonicalTaskStateCommand {
  const occurrenceKey = `task:${sourceTask.id}:occurrence:${logicalDate}`;
  return {
    type: "handled_outcome",
    commandId: `00000000-0000-4000-8000-${sourceTask.id.slice(-12).padStart(12, "0")}`,
    userId: sourceTask.user_id,
    taskId: sourceTask.id,
    entityKind: "parent",
    acceptedIntent: { type: "set_outcome", task_id: sourceTask.id, outcome, logical_date: logicalDate, occurrence_key: occurrenceKey },
    expectedRevision: 4,
    logicalDay: {
      identity: `${sourceTask.user_id}:${TODAY}:UTC:00:00:1`,
      logicalDate: TODAY,
      timezone: "UTC",
      dayStartTime: "00:00",
      settingsRevision: 1,
    },
    idempotenceIdentity: `${sourceTask.id}:${logicalDate}:${outcome}`,
    outcome,
    logicalDate,
    occurrenceKey,
    scheduledDueOn: logicalDate,
  };
}

function ordinaryStatus(sourceTask: Task, rows: TaskHistory[]) {
  return resolveActiveTaskStatuses({
    historyByTaskId: { [sourceTask.id]: rows },
    logicalDayRollover: CONTEXT.logicalDayRollover,
    now: CONTEXT.now,
    tasks: [sourceTask],
    timezone: CONTEXT.timezone,
  }).statusesByTaskId[sourceTask.id];
}

function futureScheduleBoundary(sourceTask: Task, dueOn: string, repeatInterval = sourceTask.repeat_interval): CanonicalTaskScheduleBoundary {
  return {
    ...boundary(sourceTask),
    id: `${sourceTask.id}:schedule:${dueOn}:${repeatInterval}`,
    effective_from_logical_date: TODAY,
    repeat_interval: repeatInterval,
    anchor_date: dueOn,
    idempotence_identity: `${sourceTask.id}:schedule:${dueOn}:${repeatInterval}`,
  };
}

for (const outcome of ["done", "did_my_best"] as const) {
  test(`recurring ${outcome} today keeps Calendar fact and advances Active Status through canonical planning`, () => {
    const sourceTask = task({ id: `recurring-${outcome}`, status: outcome, repeat_interval: 3 });
    const rows = [history(sourceTask, TODAY, outcome)];
    const model = readModel(sourceTask, [canonicalFact(sourceTask, TODAY, outcome)]);
    const input = canonicalInput(model);
    const evaluated = evaluateTaskState(input);
    const plan = planTaskStateCommand({ task: model.task, engineInput: input }, command(sourceTask, outcome));

    assert.equal(ordinaryStatus(sourceTask, rows), "upcoming");
    assert.equal(evaluated.calendar[TODAY], outcome);
    assert.equal(evaluated.activeStatus, "upcoming");
    assert.equal(evaluated.nextDueDate, "2026-08-20");
    assert.equal(plan.normalizedResult.compatibilityProjection.status, "upcoming");
    assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-20");
  });
}

for (const outcome of ["done", "did_my_best"] as const) {
  test(`schedule change derives future Active Status while preserving recurring ${outcome} History`, () => {
    const sourceTask = task({ id: `schedule-${outcome}`, status: outcome, due_on: TODAY, repeat_interval: 3 });
    const model = readModel(sourceTask, [canonicalFact(sourceTask, TODAY, outcome)]);
    const originalHistory = model.historyFacts.map((fact) => fact.outcome);
    const plan = planTaskStateCommand(
      { task: model.task, engineInput: canonicalInput(model) },
      {
        ...command(sourceTask, outcome),
        type: "schedule_change",
        changeKind: "due_date",
        commandId: `00000000-0000-0000-0000-${outcome === "done" ? "000000000021" : "000000000022"}`,
        acceptedIntent: { type: "set_due_date", task_id: sourceTask.id, due_on: "2026-08-20" },
        scheduleBoundary: futureScheduleBoundary(sourceTask, "2026-08-20"),
      },
    );

    assert.deepEqual(model.historyFacts.map((fact) => fact.outcome), originalHistory);
    assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-20");
    assert.equal(plan.normalizedResult.compatibilityProjection.status, "upcoming");
  });
}

test("repeat change resolves Active Status from the resulting schedule after a handled outcome", () => {
  const sourceTask = task({ id: "repeat-change-after-done", status: "done", due_on: TODAY, repeat_interval: 3 });
  const model = readModel(sourceTask, [canonicalFact(sourceTask, TODAY, "done")]);
  const plan = planTaskStateCommand(
    { task: model.task, engineInput: canonicalInput(model) },
    {
      ...command(sourceTask, "done"),
      type: "schedule_change",
      changeKind: "repeat",
      commandId: "00000000-0000-0000-0000-000000000023",
      acceptedIntent: { type: "set_repeat", task_id: sourceTask.id, repeat_interval: 10 },
      scheduleBoundary: futureScheduleBoundary(sourceTask, TODAY, 10),
    },
  );

  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-27");
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "not_due");
});

test("an unresolved saved Missed occurrence still outranks a future schedule change", () => {
  const sourceTask = task({ id: "missed-before-schedule", status: "missed", due_on: TODAY, active_occurrence_due_on: TODAY });
  const model = readModel(sourceTask, [canonicalFact(sourceTask, TODAY, "missed")]);
  const plan = planTaskStateCommand(
    { task: model.task, engineInput: canonicalInput(model) },
    {
      ...command(sourceTask, "done"),
      type: "schedule_change",
      changeKind: "due_date",
      commandId: "00000000-0000-0000-0000-000000000024",
      acceptedIntent: { type: "set_due_date", task_id: sourceTask.id, due_on: "2026-08-20" },
      scheduleBoundary: futureScheduleBoundary(sourceTask, "2026-08-20"),
    },
  );

  assert.equal(plan.normalizedResult.compatibilityProjection.status, "missed");
});

test("empty canonical Calendar/workflow inputs and omitted inputs cannot change Active Status", () => {
  const sourceTask = task({ status: "done", repeat_interval: 10 });
  const model = readModel(sourceTask, [canonicalFact(sourceTask, TODAY, "done")]);
  const input = canonicalInput(model);
  const withEmptyInputs = evaluateTaskState(input);
  const withOmittedInputs = evaluateTaskState({
    ...input,
    calendarOverrides: undefined,
    workflow: undefined,
  });

  assert.equal(withEmptyInputs.activeStatus, "not_due");
  assert.equal(withOmittedInputs.activeStatus, withEmptyInputs.activeStatus);
  assert.equal(withOmittedInputs.nextDueDate, withEmptyInputs.nextDueDate);
});

test("Unscheduled ignores stale stored Done and Missed while preserving engine lifecycle semantics", () => {
  for (const status of ["done", "missed"] as const) {
    const sourceTask = task({ id: `unscheduled-${status}`, due_on: null, repeat_frequency: "none", status });
    const model = readModel(sourceTask, [], "unscheduled");
    const evaluated = evaluateTaskState(canonicalInput(model));

    assert.equal(ordinaryStatus(sourceTask, []), "unscheduled", status);
    assert.equal(evaluated.activeStatus, "unscheduled", status);
  }
});

test("Every 3 Days correction replays the canonical command from Missed to the next calculated due date", () => {
  const sourceTask = task({ id: "every-3-days-correction", due_on: "2026-08-16", status: "missed", repeat_interval: 3 });
  const model = readModel(sourceTask, [canonicalFact(sourceTask, "2026-08-16", "missed")]);
  const input = canonicalInput(model);
  const plan = planTaskStateCommand(
    { task: model.task, engineInput: input },
    command(sourceTask, "done", "2026-08-16"),
  );

  assert.equal(input.task.dueOn, "2026-08-16");
  assert.equal(plan.normalizedResult.historyFact?.outcome, "done");
  assert.equal(plan.normalizedResult.compatibilityProjection.dueOn, "2026-08-19");
  assert.equal(plan.normalizedResult.compatibilityProjection.status, "upcoming");
});

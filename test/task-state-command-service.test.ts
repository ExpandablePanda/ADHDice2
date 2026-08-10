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
import type { CanonicalTaskRow } from "../src/lib/task-state-canonical/read-model.ts";
import type { CanonicalTaskOccurrenceEffectiveOverride, CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";

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

test("reward entitlement identity is stable per entity and logical date", () => {
  const first = planTaskStateCommand(state(), command({ commandId: "00000000-0000-4000-8000-000000000010" }));
  const second = planTaskStateCommand(state(), command({ commandId: "00000000-0000-4000-8000-000000000011" }));
  assert.equal(first.normalizedResult.rewardEntitlement?.identity, second.normalizedResult.rewardEntitlement?.identity);
  assert.match(first.normalizedResult.rewardEntitlement?.identity ?? "", /task-1:2026-08-10/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildTrustedTaskStateCommand, buildTrustedTaskStateCommandReplayDescriptor, validateTaskStateCommandIntent } from "../supabase/functions/task-state-command/domain.ts";
import { normalizeTaskStateCommand, planTaskStateCommand } from "../src/lib/task-state-canonical/command-service.ts";
import type { CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";
import type { CanonicalLogicalDayContext, CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";

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

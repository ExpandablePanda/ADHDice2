import assert from "node:assert/strict";
import test from "node:test";
import { buildTrustedTaskStateCommand, validateTaskStateCommandIntent } from "../supabase/functions/task-state-command/domain.ts";
import type { CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";

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

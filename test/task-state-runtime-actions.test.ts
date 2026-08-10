import assert from "node:assert/strict";
import test from "node:test";
import { classifyTaskStateRuntimeAction, createTaskStateReplayIdentity, type TaskRuntimeTask } from "../src/lib/task-state-runtime-actions.ts";
import type { TaskUpdate } from "../src/lib/database.types.ts";

function task(overrides: Partial<TaskRuntimeTask> = {}): TaskRuntimeTask {
  return { id: "task-1", status: "pending", canonical_revision: 4, ...overrides };
}

function classify(values: TaskUpdate, overrides: Partial<TaskRuntimeTask> = {}, replayIdentity = "action-1") {
  return classifyTaskStateRuntimeAction({ task: task(overrides), values, replayIdentity });
}

test("metadata-only edits remain eligible for ordinary metadata persistence", () => {
  const result = classify({ title: "Renamed", notes: "More context", priority_level: 3 });
  assert.equal(result.kind, "metadata_only");
  assert.deepEqual(result.changedFields, ["title", "notes", "priority_level"]);
  assert.equal(result.legacyMetadataPersistence, "allowed");
  assert.equal(result.legacyStateFallback, "forbidden");
});

test("workflow start and clear use canonical commands", () => {
  const start = classify({ status: "in_progress" });
  assert.equal(start.kind, "canonical_action");
  assert.equal(start.actionType, "start_in_progress");
  assert.equal(start.intent?.type, "start_in_progress");
  assert.equal(start.intent?.expected_revision, 4);

  const clear = classify({ status: "pending" }, { status: "in_progress" });
  assert.equal(clear.kind, "canonical_action");
  assert.equal(clear.actionType, "clear_in_progress");
  assert.equal(clear.intent?.type, "clear_in_progress");
});

test("Done, Did My Best, Missed, and Complete map to canonical descriptors", () => {
  for (const status of ["done", "did_my_best", "missed"] as const) {
    const result = classify({ status });
    assert.equal(result.kind, "canonical_action");
    assert.equal(result.actionType, "set_outcome");
    assert.equal(result.intent?.type, "set_outcome");
    assert.equal(result.intent?.outcome, status);
  }
  const complete = classify({ status: "complete" });
  assert.equal(complete.kind, "canonical_action");
  assert.equal(complete.actionType, "complete_task");
});

test("Archive, Trash, and Restore map to canonical lifecycle commands", () => {
  assert.equal(classify({ status: "archived" }).actionType, "archive_task");
  assert.equal(classify({ status: "trashed" }).actionType, "trash_task");
  assert.equal(classify({ status: "pending" }, { status: "trashed" }).actionType, "restore_task");
});

test("due-date and repeat changes are canonical schedule descriptors", () => {
  const due = classify({ due_on: "2026-08-12" });
  assert.equal(due.kind, "canonical_action");
  assert.equal(due.actionType, "set_due_date");
  assert.equal(due.expectedRevision, 4);
  assert.deepEqual(due.scheduleChanges, { due_on: "2026-08-12" });

  const repeat = classify({ repeat_frequency: "weekly", repeat_interval: 1 });
  assert.equal(repeat.kind, "canonical_action");
  assert.equal(repeat.actionType, "set_repeat");
});

test("explicit Delay, Calendar override, and rollover intents retain canonical ownership", () => {
  const delay = classifyTaskStateRuntimeAction({
    task: task(),
    canonicalIntent: {
      type: "delay_occurrence",
      occurrence_key: "occurrence-1",
      effective_due_on: "2026-08-13",
    },
    replayIdentity: "delay-action-1",
  });
  assert.equal(delay.kind, "canonical_action");
  assert.equal(delay.actionType, "delay_occurrence");
  assert.equal(delay.intent?.replay_identity, "delay-action-1");

  const calendar = classifyTaskStateRuntimeAction({
    task: task(),
    canonicalIntent: { type: "calendar_override", logical_date: "2026-08-10", override_state: "due_open" },
    replayIdentity: "calendar-action-1",
  });
  assert.equal(calendar.kind, "canonical_action");
  assert.equal(calendar.actionType, "calendar_override");

  const rollover = classifyTaskStateRuntimeAction({
    task: task(),
    canonicalIntent: { type: "reconcile_rollover" },
    replayIdentity: "rollover-action-1",
  });
  assert.equal(rollover.kind, "canonical_action");
  assert.equal(rollover.actionType, "reconcile_rollover");
});

test("mixed and ambiguous state mutations fail closed", () => {
  const mixed = classify({ status: "done", due_on: "2026-08-12" });
  assert.equal(mixed.kind, "unsupported_state_mutation");
  assert.match(mixed.reason, /Status and schedule/);
  assert.equal(mixed.legacyStateFallback, "forbidden");

  const delay = classify({ status: "delayed" });
  assert.equal(delay.kind, "unsupported_state_mutation");
  assert.match(delay.reason, /occurrence identity/);
});

test("canonical actions fail closed without a valid canonical revision", () => {
  for (const canonicalRevision of [null, 0, -1, 1.5, undefined]) {
    const result = classify({ status: "done" }, { canonical_revision: canonicalRevision });
    assert.equal(result.kind, "unsupported_state_mutation");
    assert.match(result.reason, /canonical_revision/);
  }
  const legacyRevisionOnly = classify({ revision: 99 });
  assert.equal(legacyRevisionOnly.kind, "unsupported_state_mutation");
  assert.match(legacyRevisionOnly.reason, /legacy task\.revision/);
});

test("derived statuses never invent set_pending, set_upcoming, or set_not_due", () => {
  for (const status of ["upcoming", "not_due"] as const) {
    const result = classify({ status });
    assert.equal(result.kind, "unsupported_state_mutation");
    assert.match(result.reason, /derived statuses/);
    assert.equal("set_pending" in result, false);
    assert.equal("set_upcoming" in result, false);
    assert.equal("set_not_due" in result, false);
  }
});

test("metadata fields are explicit and never become Task State actions", () => {
  for (const field of ["energy", "tags", "pinned_at", "sort_order"] as const) {
    const result = classify({ [field]: field === "tags" ? ["new"] : field === "sort_order" ? 2 : null } as TaskUpdate);
    assert.equal(result.kind, "metadata_only", field);
  }
});

test("replay identity is stable when supplied and generated per new logical action", () => {
  const first = classify({ status: "done" }, {}, "logical-action-1");
  const replay = classify({ status: "done" }, {}, "logical-action-1");
  assert.equal(first.kind, "canonical_action");
  assert.equal(replay.kind, "canonical_action");
  assert.equal(first.replayIdentity, "logical-action-1");
  assert.equal(replay.replayIdentity, "logical-action-1");
  assert.match(createTaskStateReplayIdentity(), /^[0-9a-f-]{36}$/i);
  assert.equal(classify({ status: "done" }, {}, "").kind, "unsupported_state_mutation");
});

test("no classification result authorizes legacy Task State fallback", () => {
  const results = [
    classify({ title: "metadata" }),
    classify({ status: "done" }),
    classify({ status: "done", due_on: "2026-08-12" }),
  ];
  for (const result of results) assert.equal(result.legacyStateFallback, "forbidden");
});

import assert from "node:assert/strict";
import test from "node:test";

import type { Task } from "../src/lib/database.types.ts";
import {
  areActiveStatusResultsSemanticallyEqual,
  areTaskCollectionsSemanticallyEqual,
  keepCurrentActiveStatusResult,
  keepCurrentTaskArrayIfSemanticallyEqual,
  type ActiveStatusResultLike,
} from "../src/lib/task-state-identity.ts";

function task(overrides: Partial<Task> = {}) {
  return {
    id: "task-1",
    title: "Task",
    revision: 1,
    canonical_revision: 1,
    ...overrides,
  } as Task;
}

function activeStatus(overrides: Partial<ActiveStatusResultLike> = {}) {
  return {
    authority: "engine",
    dueOnByTaskId: { "task-1": "2026-09-28" },
    statusesByTaskId: { "task-1": "upcoming" },
    ...overrides,
  } satisfies ActiveStatusResultLike;
}

test("equivalent incoming Task snapshots retain the existing array identity", () => {
  const current = [task()];
  const equivalent = [{ title: "Task", ...current[0] }];

  assert.equal(areTaskCollectionsSemanticallyEqual(current, equivalent), true);
  assert.strictEqual(keepCurrentTaskArrayIfSemanticallyEqual(current, equivalent), current);
});

test("a genuine Task field change produces new state", () => {
  const current = [task()];
  const changed = [task({ title: "Changed" })];

  assert.equal(areTaskCollectionsSemanticallyEqual(current, changed), false);
  assert.strictEqual(keepCurrentTaskArrayIfSemanticallyEqual(current, changed), changed);
});

test("Task additions and removals produce new state", () => {
  const first = task();
  const second = task({ id: "task-2" });
  const current = [first];
  const added = [first, second];
  const removed = [first];
  const reordered = [second, first];

  assert.strictEqual(keepCurrentTaskArrayIfSemanticallyEqual(current, added), added);
  assert.strictEqual(keepCurrentTaskArrayIfSemanticallyEqual(added, removed), removed);
  assert.strictEqual(keepCurrentTaskArrayIfSemanticallyEqual(added, reordered), reordered);
});

test("equivalent Active Status results retain the current object", () => {
  const current = activeStatus();
  const equivalent = activeStatus({ dueOnByTaskId: { "task-1": "2026-09-28" } });

  assert.equal(areActiveStatusResultsSemanticallyEqual(current, equivalent), true);
  assert.strictEqual(keepCurrentActiveStatusResult(current, equivalent), current);
});

test("changed Active Status results update", () => {
  const current = activeStatus();
  const changed = activeStatus({ statusesByTaskId: { "task-1": "missed" } });

  assert.equal(areActiveStatusResultsSemanticallyEqual(current, changed), false);
  assert.strictEqual(keepCurrentActiveStatusResult(current, changed), changed);
});

test("Active Status null transitions still clear and install", () => {
  const result = activeStatus();

  assert.strictEqual(keepCurrentActiveStatusResult(result, null), null);
  assert.strictEqual(keepCurrentActiveStatusResult(null, result), result);
});

test("repeated equivalent Task and Active Status inputs remain bounded", () => {
  const currentTasks = [task()];
  const incomingTasks = [{ ...currentTasks[0] }];
  let taskState = currentTasks;
  let taskStateChanges = 0;
  for (let index = 0; index < 100; index += 1) {
    const next = keepCurrentTaskArrayIfSemanticallyEqual(taskState, incomingTasks);
    if (next !== taskState) taskStateChanges += 1;
    taskState = next;
  }

  const currentResult = activeStatus();
  const incomingResult = activeStatus();
  let activeStatusState: ActiveStatusResultLike | null = currentResult;
  let activeStatusChanges = 0;
  for (let index = 0; index < 100; index += 1) {
    const next = keepCurrentActiveStatusResult(activeStatusState, incomingResult);
    if (next !== activeStatusState) activeStatusChanges += 1;
    activeStatusState = next;
  }

  assert.strictEqual(taskState, currentTasks);
  assert.equal(taskStateChanges, 0);
  assert.strictEqual(activeStatusState, currentResult);
  assert.equal(activeStatusChanges, 0);
});

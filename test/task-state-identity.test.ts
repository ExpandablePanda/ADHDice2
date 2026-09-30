import assert from "node:assert/strict";
import test from "node:test";

import type { Task } from "../src/lib/database.types.ts";
import {
  areActiveStatusResultsSemanticallyEqual,
  areTaskCollectionsSemanticallyEqual,
  keepCurrentActiveStatusResult,
  keepCurrentTaskIdArrayIfUnchanged,
  keepCurrentTaskArrayIfSemanticallyEqual,
  publishActiveStatusReadIfChanged,
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

test("unchanged ordered fallback Task IDs retain their array identity", () => {
  const current = ["task-a", "task-b"];

  assert.strictEqual(keepCurrentTaskIdArrayIfUnchanged(current, ["task-a", "task-b"]), current);
  assert.notStrictEqual(keepCurrentTaskIdArrayIfUnchanged(current, ["task-b", "task-a"]), current);
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

test("Active Status publication dispatches only real semantic transitions", () => {
  const current = activeStatus();
  const equivalent = activeStatus();
  const changed = activeStatus({ statusesByTaskId: { "task-1": "missed" } });
  const currentRef = { current: current as ActiveStatusResultLike | null };
  const dispatched: Array<ActiveStatusResultLike | null> = [];
  const publish = (next: ActiveStatusResultLike | null) => publishActiveStatusReadIfChanged(
    currentRef,
    next,
    (value) => dispatched.push(value),
  );

  assert.equal(publish(equivalent), false);
  assert.equal(publish(equivalent), false);
  assert.equal(dispatched.length, 0);

  assert.equal(publish(changed), true);
  assert.equal(dispatched.length, 1);
  assert.strictEqual(currentRef.current, changed);

  assert.equal(publish(null), true);
  assert.equal(dispatched.length, 2);
  assert.equal(publish(null), false);
  assert.equal(dispatched.length, 2);

  assert.equal(publish(activeStatus()), true);
  assert.equal(dispatched.length, 3);
  assert.strictEqual(currentRef.current, dispatched[2]);
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

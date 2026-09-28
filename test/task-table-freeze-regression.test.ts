import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveTaskTableFreezeTransition } from "../src/lib/task-table-freeze.ts";

const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const freezeStart = tableSource.indexOf("const [frozenDisplayedTaskIds");
const freezeEnd = tableSource.indexOf("const effectiveDisplayedTasks", freezeStart);
const freezeSource = tableSource.slice(freezeStart, freezeEnd);

test("freeze-sync dispatches only for capture and clear transitions", () => {
  assert.match(freezeSource, /resolveTaskTableFreezeTransition\(/);
  assert.match(freezeSource, /if \(freezeTransition\.shouldDispatch\)/);
  assert.match(freezeSource, /\}, \[displayedTasks, frozenDisplayedTaskIds, selectedTaskIds\.length\]\);/);
  assert.doesNotMatch(freezeSource, /setFrozenDisplayedTaskIds\(\(current\)/);
});

test("freeze transition captures once across recreated displayed rows and filter callbacks", () => {
  const taskIds = ["task-1", "task-2", "task-3", "task-4", "task-5", "task-6", "task-7"];
  const selectionCounts = [1, 2, 3, 4, 5, 6, ...Array.from({ length: 84 }, () => 6), 0];
  let frozenDisplayedTaskIds: string[] | null = null;
  let capturedDisplayedTaskIds: string[] | null = null;
  let previousDisplayedTasks: Array<{ id: string }> | null = null;
  let previousFilterCallbacks: Array<() => boolean> | null = null;
  let dispatchCount = 0;
  let renderCount = 0;
  let effectRunCount = 0;

  for (const selectedTaskCount of selectionCounts) {
    renderCount += 1;
    const filterCallbacks = [() => true, () => true];
    const displayedTasks = taskIds
      .map((id) => ({ id }))
      .filter((task) => filterCallbacks.every((callback) => callback() && Boolean(task.id)));

    assert.deepEqual(displayedTasks.map((task) => task.id), taskIds);
    if (previousDisplayedTasks) {
      assert.notEqual(displayedTasks, previousDisplayedTasks);
    }
    if (previousFilterCallbacks) {
      assert.notEqual(filterCallbacks[0], previousFilterCallbacks[0]);
    }

    effectRunCount += 1;
    const transition = resolveTaskTableFreezeTransition(
      selectedTaskCount,
      displayedTasks.map((task) => task.id),
      frozenDisplayedTaskIds,
    );
    if (transition.shouldDispatch) {
      dispatchCount += 1;
      frozenDisplayedTaskIds = transition.nextFrozenDisplayedTaskIds;
      if (capturedDisplayedTaskIds === null && selectedTaskCount > 0) {
        capturedDisplayedTaskIds = frozenDisplayedTaskIds;
      }

      // The frozen state is an effect dependency, so the setter causes one
      // bounded follow-up effect which must settle without another dispatch.
      renderCount += 1;
      effectRunCount += 1;
      const settledTransition = resolveTaskTableFreezeTransition(
        selectedTaskCount,
        displayedTasks.map((task) => task.id),
        frozenDisplayedTaskIds,
      );
      assert.equal(settledTransition.shouldDispatch, false);
    }

    previousDisplayedTasks = displayedTasks;
    previousFilterCallbacks = filterCallbacks;
  }

  assert.equal(dispatchCount, 2);
  assert.deepEqual(capturedDisplayedTaskIds, taskIds);
  assert.equal(frozenDisplayedTaskIds, null);
  assert.ok(renderCount <= selectionCounts.length + 2);
  assert.ok(effectRunCount <= selectionCounts.length + 2);
});

test("freeze transition is a no-op when state already matches selection", () => {
  const frozenDisplayedTaskIds = ["task-1", "task-2"];

  assert.deepEqual(
    resolveTaskTableFreezeTransition(0, ["task-1"], null),
    { nextFrozenDisplayedTaskIds: null, shouldDispatch: false },
  );
  assert.deepEqual(
    resolveTaskTableFreezeTransition(0, ["task-1"], frozenDisplayedTaskIds),
    { nextFrozenDisplayedTaskIds: null, shouldDispatch: true },
  );
  const activeTransition = resolveTaskTableFreezeTransition(6, ["task-3", "task-1"], frozenDisplayedTaskIds);
  assert.equal(activeTransition.shouldDispatch, false);
  assert.equal(activeTransition.nextFrozenDisplayedTaskIds, frozenDisplayedTaskIds);
});

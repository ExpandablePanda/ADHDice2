import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskPriorityUpdate,
  coerceTaskPriorityLevel,
  formatTaskPriorityMenuLabel,
  getTaskPrioritySelection,
  normalizeTaskPrioritySelectionInput,
  TASK_PRIORITY_LEVEL_OPTIONS,
} from "../src/lib/task-priority.ts";

test("priority domain supports priority 0 as the first selectable level", () => {
  assert.deepEqual(TASK_PRIORITY_LEVEL_OPTIONS, ["0", "1", "2", "3", "4", "5"]);
  assert.equal(coerceTaskPriorityLevel(0), 0);
  assert.equal(coerceTaskPriorityLevel("0"), 0);
  assert.equal(formatTaskPriorityMenuLabel(0), "0 - Unsorted");
  assert.equal(getTaskPrioritySelection(["0"]), "0");
});

test("priority 0 preserves legacy compatibility while storing the numeric level", () => {
  assert.deepEqual(buildTaskPriorityUpdate(0), {
    is_important: false,
    is_urgent: false,
    priority: "low",
    priority_level: 0,
  });
});

test("priority 0 selection input normalizes as a real persisted level", () => {
  assert.deepEqual(normalizeTaskPrioritySelectionInput("0"), {
    focusAction: "preserve",
    priorityLevel: 0,
  });
  assert.deepEqual(normalizeTaskPrioritySelectionInput("none"), {
    focusAction: "remove",
    priorityLevel: 0,
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildChildTaskPreviewLookup } from "../src/lib/task-app-derived.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { groupChildTaskPreviewItemsByStoredCompletion } from "../src/lib/task-child-preview-collapse.ts";

test("completed grouping preserves direct Step branches and preorder", () => {
  const parent = createTask({ id: "parent", sort_order: 1, status: "pending", title: "Parent" });
  const doneStep = createTask({ id: "done-step", parent_task_id: parent.id, sort_order: 1, status: "done", title: "Done" });
  const completeSubstep = createTask({ id: "complete-substep", parent_task_id: doneStep.id, sort_order: 1, status: "complete", title: "Complete substep" });
  const completeStep = createTask({ id: "complete-step", parent_task_id: parent.id, sort_order: 2, status: "complete", title: "Complete" });
  const activeSubstep = createTask({ id: "active-substep", parent_task_id: completeStep.id, sort_order: 1, status: "pending", title: "Active substep" });
  const missedStep = createTask({ id: "missed-step", parent_task_id: parent.id, sort_order: 3, status: "missed", title: "Missed" });
  const grouped = groupChildTaskPreviewItemsByStoredCompletion(
    buildChildTaskPreviewLookup([parent, doneStep, completeSubstep, completeStep, activeSubstep, missedStep])[parent.id]!.items,
  );

  assert.equal(grouped.completedStepCount, 1);
  assert.deepEqual(grouped.normalItems.map((item) => item.id), ["done-step", "complete-substep", "missed-step"]);
  assert.deepEqual(grouped.completedItems.map((item) => item.id), ["complete-step", "active-substep"]);
  assert.equal(new Set([...grouped.normalItems, ...grouped.completedItems].map((item) => item.id)).size, 5);
});

test("filtered ordering never hoists a Substep away from its owning completed Step", () => {
  const parent = createTask({ id: "filtered-parent", sort_order: 1, status: "pending", title: "Parent" });
  const activeStep = createTask({ id: "filtered-active-step", parent_task_id: parent.id, sort_order: 1, status: "pending", title: "Active" });
  const completedStep = createTask({ id: "filtered-complete-step", parent_task_id: parent.id, sort_order: 2, status: "complete", title: "Complete" });
  const completedSubstep = createTask({ id: "filtered-complete-substep", parent_task_id: completedStep.id, sort_order: 1, status: "complete", title: "Complete substep" });
  const items = buildChildTaskPreviewLookup([parent, activeStep, completedStep, completedSubstep])[parent.id]!.items;
  const grouped = groupChildTaskPreviewItemsByStoredCompletion([items[0]!, items[2]!, items[1]!]);

  assert.deepEqual(grouped.normalItems.map((item) => item.id), [activeStep.id]);
  assert.deepEqual(grouped.completedItems.map((item) => item.id), [completedSubstep.id, completedStep.id]);
});

test("Table, List, and shared editor use the same completed branch grouping", () => {
  const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
  const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");

  assert.match(listSource, /groupChildTaskPreviewItemsByStoredCompletion\(expandedItems\)/);
  assert.match(listSource, /Completed Steps \(\{groupedItems\.completedStepCount\}\)/);
  assert.match(tableSource, /renderEditorChildTaskRows\(selectedTask\.id, childTaskPreviewGroup\)/);
  assert.match(tableSource, /groupChildTaskPreviewItemsByStoredCompletion\(expandedItems\)/);
  assert.match(tableSource, /groupChildTaskPreviewItemsByStoredCompletion\(visibleItems\)/);
  assert.match(tableSource, /data-completed-steps-section=\{parentTaskId\}/);
  assert.match(listSource, /flex justify-center border-t border-\[#f0ebfb\]/);
  assert.match(tableSource, /grid w-max min-w-full border-t border-\[#f0ebfb\]/);
  assert.match(tableSource, /gridColumn: taskColumnIndex/);
  assert.match(tableSource, /hover:shadow-\[0_18px_40px_rgba\(109,61,208,0\.10\)\]/);
  assert.match(tableSource, /previewRevealTarget\?\.ancestorIds\[0\] \?\? highlightedActiveTaskId/);
  assert.match(tableSource, /focusTarget\?\.focus\(\{ preventScroll: true \}\)/);
});

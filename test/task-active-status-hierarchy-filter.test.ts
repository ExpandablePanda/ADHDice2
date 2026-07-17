import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTask } from "../src/lib/task-buckets.ts";
import { filterChildTaskPreviewItemsToMatchingHierarchy, buildChildTaskPreviewVisibility } from "../src/lib/task-child-preview-collapse.ts";
import { buildCanonicalActiveStatusCounts, computeTaskAppDerivedData } from "../src/lib/task-app-derived.ts";
import { getBuiltInTaskLists } from "../src/lib/task-lists.ts";
import { DEFAULT_TASK_UI_STATE } from "../src/lib/task-ui-state.ts";

function derive(
  tasks: ReturnType<typeof createTask>[],
  statuses: Array<ReturnType<typeof createTask>["status"]>,
  search = "",
) {
  return computeTaskAppDerivedData({
    activePage: "Tasks",
    availableTaskLists: getBuiltInTaskLists(),
    availableTaskNotes: [],
    bucketContext: { focusedTaskIds: new Set<string>(), routing: {} },
    deferredSearchQuery: search,
    focusedTaskIds: [],
    listColumnPickerOrder: [],
    listVisibleColumns: [],
    taskActualTimeEntryTaskId: null,
    taskEditorTaskId: null,
    taskGridLayout: [],
    taskGridWidgetTypes: [],
    taskHistoryByTaskId: {},
    taskListEvaluationContext: {
      currentStreakByTaskId: {}, focusedTaskIds: new Set<string>(), hasStepsByTaskId: {}, historyFactsByTaskId: {},
      isDueToday: () => false, isDueTomorrow: () => false, isLater: () => false,
      isOpen: (task) => task.status === "pending" || task.status === "in_progress",
      isOverdue: () => false, manualMembershipsByTaskId: {}, taskHistoryByTaskId: {}, todayDateKey: "2026-07-17",
    },
    taskSubtasksByTaskId: {},
    taskUiState: { ...DEFAULT_TASK_UI_STATE, statusFilters: statuses, view: "table" },
    todayDateKey: "2026-07-17",
    tasks,
  });
}

test("Table Active Status keeps parent context but only matching Steps/Substeps", () => {
  const parent = createTask({ id: "parent", sort_order: 1, status: "pending", title: "Parent" });
  const step = createTask({ id: "step", parent_task_id: parent.id, sort_order: 1, status: "pending", title: "Matching step" });
  const substep = createTask({ id: "substep", parent_task_id: step.id, sort_order: 1, status: "did_my_best", title: "Matching substep" });
  const sibling = createTask({ id: "sibling", parent_task_id: parent.id, sort_order: 2, status: "pending", title: "Hidden sibling" });
  const derived = derive([parent, step, substep, sibling], ["did_my_best"]);

  assert.deepEqual(derived.filteredTasksSorted.map((task) => task.id), [parent.id]);
  assert.deepEqual(derived.statusMatchedStepParentTaskIds, [parent.id]);
  assert.deepEqual(derived.statusMatchedChildTaskIds, [substep.id]);
  const group = derived.childTaskPreviewByParentTaskId[parent.id]!;
  const matchingHierarchy = filterChildTaskPreviewItemsToMatchingHierarchy(group.items, new Set(derived.statusMatchedChildTaskIds));
  assert.deepEqual(matchingHierarchy.map((item) => item.id), [step.id, substep.id]);
  assert.deepEqual(buildChildTaskPreviewVisibility(matchingHierarchy, new Set()).visibleItems.map((item) => item.id), [step.id, substep.id]);
  assert.deepEqual(buildChildTaskPreviewVisibility(group.items, new Set([step.id])).visibleItems.map((item) => item.id), [step.id, sibling.id]);
});

test("Table Active Status retains direct matches without duplicate context and clears normally", () => {
  const parent = createTask({ id: "parent-best", sort_order: 1, status: "did_my_best", title: "Matching parent" });
  const child = createTask({ id: "child-pending", parent_task_id: parent.id, sort_order: 1, status: "pending", title: "Pending child" });
  const ownMatch = derive([parent, child], ["did_my_best"]);
  assert.deepEqual(ownMatch.filteredTasksSorted.map((task) => task.id), [parent.id]);
  assert.deepEqual(ownMatch.statusMatchedStepParentTaskIds, []);
  assert.deepEqual(ownMatch.statusMatchedChildTaskIds, []);

  const parentAndChildMatch = derive([parent, { ...child, id: "child-best", status: "did_my_best" }], ["did_my_best"]);
  assert.deepEqual(parentAndChildMatch.filteredTasksSorted.map((task) => task.id), [parent.id]);

  for (const status of ["done", "missed", "pending"] as const) {
    const matchingParent = { ...parent, id: `parent-${status}`, status: "upcoming" as const };
    const matchingChild = { ...child, id: `child-${status}`, parent_task_id: matchingParent.id, status };
    const result = derive([matchingParent, matchingChild], [status]);
    assert.equal(result.statusMatchedChildTaskIds.includes(matchingChild.id), true, status);
  }

  const cleared = derive([parent, child], []);
  assert.deepEqual(cleared.filteredTasksSorted.map((task) => task.id), [parent.id]);
  assert.deepEqual(cleared.statusMatchedStepParentTaskIds, []);
  assert.deepEqual(cleared.statusMatchedChildTaskIds, []);
});

test("Table renderer consumes descendant matches as temporary expansion-only state", () => {
  const source = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
  assert.match(source, /statusMatchedStepParentTaskIdSet\.has\(task\.id\)/);
  assert.match(source, /filterChildTaskPreviewItemsToMatchingHierarchy/);
  assert.match(source, /new Set<string>\(\) : collapsedChildTaskIdSet/);
});

test("Table Active Status rail counts canonical parent, Step, and Substep statuses once", () => {
  const parent = createTask({ id: "count-parent", sort_order: 1, status: "pending", title: "Context parent" });
  const matchingSteps = Array.from({ length: 5 }, (_, index) => createTask({
    id: `count-step-${index}`,
    parent_task_id: parent.id,
    sort_order: index + 1,
    status: "did_my_best",
    title: `Did My Best ${index}`,
  }));
  const sibling = createTask({ id: "count-sibling", parent_task_id: parent.id, sort_order: 9, status: "pending", title: "Pending sibling" });
  const derived = derive([parent, ...matchingSteps, sibling], ["did_my_best"]);
  const counts = buildCanonicalActiveStatusCounts(
    derived.statusCountScopeTasksSorted,
    derived.childTaskPreviewByParentTaskId,
    {},
    "2026-07-17",
  );
  assert.equal(counts.did_my_best, 5);
  assert.equal(counts.pending, 2);

  const substep = createTask({ id: "count-substep", parent_task_id: matchingSteps[0]!.id, sort_order: 1, status: "done", title: "Done substep" });
  const withSubstep = derive([parent, ...matchingSteps, substep, sibling], []);
  const allCounts = buildCanonicalActiveStatusCounts(withSubstep.statusCountScopeTasksSorted, withSubstep.childTaskPreviewByParentTaskId, {}, "2026-07-17");
  assert.equal(allCounts.did_my_best, 5);
  assert.equal(allCounts.done, 1);

  const bothMatch = derive([{ ...parent, status: "did_my_best" }, matchingSteps[0]!], []);
  const bothCounts = buildCanonicalActiveStatusCounts(bothMatch.statusCountScopeTasksSorted, bothMatch.childTaskPreviewByParentTaskId, {}, "2026-07-17");
  assert.equal(bothCounts.did_my_best, 2);
});

test("Table Active Status rail counts only search-scoped parent rows before status projection", () => {
  const searchParent = createTask({ id: "search-parent", sort_order: 1, status: "pending", title: "Search scope" });
  const searchChild = createTask({ id: "search-child", parent_task_id: searchParent.id, sort_order: 1, status: "done", title: "Done child" });
  const otherParent = createTask({ id: "other-parent", sort_order: 2, status: "pending", title: "Other scope" });
  const otherChild = createTask({ id: "other-child", parent_task_id: otherParent.id, sort_order: 1, status: "did_my_best", title: "Other child" });
  const derived = derive([searchParent, searchChild, otherParent, otherChild], ["did_my_best"], "Done child");
  assert.deepEqual(derived.filteredTasksSorted, []);
  const scopedCounts = buildCanonicalActiveStatusCounts(
    derived.statusCountScopeTasksSorted,
    derived.childTaskPreviewByParentTaskId,
    {},
    "2026-07-17",
  );
  assert.equal(scopedCounts.done, 1);
  assert.equal(scopedCounts.did_my_best, 0);
});

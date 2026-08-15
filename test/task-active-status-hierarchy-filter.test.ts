import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTask } from "../src/lib/task-buckets.ts";
import { filterChildTaskPreviewItemsToMatchingHierarchy, buildChildTaskPreviewVisibility, groupChildTaskPreviewItemsByStoredCompletion } from "../src/lib/task-child-preview-collapse.ts";
import { buildCanonicalActiveStatusCounts, computeTaskAppDerivedData } from "../src/lib/task-app-derived.ts";
import { getBuiltInTaskLists, type TaskListDefinition, type TaskListId } from "../src/lib/task-lists.ts";
import { DEFAULT_TASK_UI_STATE } from "../src/lib/task-ui-state.ts";
import type { TaskDisplayStatus } from "../src/lib/task-display-status.ts";
import { sortListParentTasks } from "../src/lib/task-list-sort.ts";

function derive(
  tasks: ReturnType<typeof createTask>[],
  statuses: Array<ReturnType<typeof createTask>["status"]>,
  search = "",
  includeSteps = true,
  view: "list" | "table" = "table",
  options: {
    availableTaskLists?: TaskListDefinition[];
    manualMembershipsByTaskId?: Record<string, TaskListId[]>;
    selectedBucket?: string;
    tableColumnFilters?: typeof DEFAULT_TASK_UI_STATE.tableColumnFilters;
    taskDisplayStatusByTaskId?: Record<string, TaskDisplayStatus>;
  } = {},
) {
  return computeTaskAppDerivedData({
    activePage: "Tasks",
    availableTaskLists: options.availableTaskLists ?? getBuiltInTaskLists(),
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
      isOverdue: () => false, manualMembershipsByTaskId: options.manualMembershipsByTaskId ?? {}, taskHistoryByTaskId: {}, todayDateKey: "2026-07-17",
    },
    taskSubtasksByTaskId: {},
    taskDisplayStatusByTaskId: options.taskDisplayStatusByTaskId,
    taskUiState: {
      ...DEFAULT_TASK_UI_STATE,
      includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, [view]: includeSteps },
      selectedBucket: options.selectedBucket ?? "all",
      statusFilters: statuses,
      tableColumnFilters: options.tableColumnFilters ?? DEFAULT_TASK_UI_STATE.tableColumnFilters,
      view,
    },
    todayDateKey: "2026-07-17",
    tasks,
  });
}

test("Unscheduled is an independent status facet and filter for parents and Steps", () => {
  const parent = createTask({ id: "unscheduled-parent", status: "pending", due_on: null, title: "Parent" });
  const pendingToday = createTask({ id: "pending-today", status: "pending", due_on: "2026-07-17", title: "Today" });
  const step = createTask({ id: "unscheduled-step", parent_task_id: parent.id, status: "pending", due_on: null, title: "Step" });
  const displayStatusByTaskId: Record<string, TaskDisplayStatus> = {
    [parent.id]: "unscheduled",
    [pendingToday.id]: "pending",
    [step.id]: "unscheduled",
  };

  const parentOnly = derive([parent, pendingToday, step], ["unscheduled"], "", false, "table", { taskDisplayStatusByTaskId: displayStatusByTaskId });
  assert.deepEqual(parentOnly.filteredTasksSorted.map((task) => task.id), [parent.id]);
  assert.equal(parentOnly.tableStatusCounts.unscheduled, 1);
  assert.equal(parentOnly.tableStatusCounts.pending, 1);

  const withSteps = derive([parent, pendingToday, step], ["unscheduled"], "", true, "table", { taskDisplayStatusByTaskId: displayStatusByTaskId });
  assert.deepEqual(withSteps.filteredTasksSorted.map((task) => task.id), [parent.id]);
  assert.equal(withSteps.tableStatusCounts.unscheduled, 2);
  assert.equal(withSteps.tableStatusCounts.pending, 1);
});

test("Include Steps changes counters only; child search remains discoverable", () => {
  const parent = createTask({ id: "include-parent", sort_order: 1, status: "pending", title: "Parent" });
  const step = createTask({ id: "include-step", parent_task_id: parent.id, sort_order: 1, status: "done", title: "Discoverable step" });
  const substep = createTask({ id: "include-substep", parent_task_id: step.id, sort_order: 1, status: "done", title: "Discoverable substep" });
  const sibling = createTask({ id: "include-sibling", parent_task_id: parent.id, sort_order: 2, status: "pending", title: "Unrelated sibling" });

  const excluded = derive([parent, step, substep, sibling], [], "Discoverable", false);
  assert.deepEqual(excluded.filteredTasksSorted.map((task) => task.id), [parent.id]);
  assert.deepEqual(excluded.searchMatchedChildTaskIds, [step.id, substep.id]);
  const excludedCounts = buildCanonicalActiveStatusCounts(
    excluded.statusCountScopeTasksSorted,
    excluded.childTaskPreviewByParentTaskId,
    {},
    "2026-07-17",
    { childTaskIds: new Set(excluded.searchMatchedChildTaskIds), includeSteps: false, parentTaskIds: new Set(excluded.searchMatchedParentTaskIds) },
  );
  assert.equal(excludedCounts.done, 0);

  const included = derive([parent, step, substep, sibling], [], "substep", true);
  assert.deepEqual(included.filteredTasksSorted.map((task) => task.id), [parent.id]);
  assert.deepEqual(included.searchMatchedChildTaskIds, [substep.id]);
  const matchingHierarchy = filterChildTaskPreviewItemsToMatchingHierarchy(included.childTaskPreviewByParentTaskId[parent.id]!.items, new Set(included.searchMatchedChildTaskIds));
  assert.deepEqual(matchingHierarchy.map((item) => item.id), [step.id, substep.id]);
  const includedCounts = buildCanonicalActiveStatusCounts(
    included.statusCountScopeTasksSorted,
    included.childTaskPreviewByParentTaskId,
    {},
    "2026-07-17",
    { childTaskIds: new Set(included.searchMatchedChildTaskIds), includeSteps: true, parentTaskIds: new Set(included.searchMatchedParentTaskIds) },
  );
  assert.equal(includedCounts.done, 1);
});

test("Table status ordering and Unscheduled action use the display-only schedule path", () => {
  const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
  assert.match(tableSource, /const STATUS_SORT_ORDER[\s\S]*?"unscheduled",\s*"pending"/);
  const displayAction = tableSource.match(/function setTaskDisplayStatus[\s\S]*?\n  }/);
  assert.ok(displayAction);
  assert.match(displayAction[0], /status === "unscheduled"[\s\S]*?onTaskDueChange\?\.\(taskId, \{ dueOn: "", dueTime: "" \}\)/);
  assert.doesNotMatch(displayAction[0], /onTaskStatusChange/);
});

test("List status sorting places Unscheduled immediately before Pending", () => {
  const unscheduled = createTask({ id: "sort-unscheduled", status: "pending" });
  const pending = createTask({ id: "sort-pending", status: "pending" });
  const inProgress = createTask({ id: "sort-in-progress", status: "in_progress" });
  const sorted = sortListParentTasks([pending, inProgress, unscheduled], { field: "status", direction: "asc" }, {
    taskDisplayStatusByTaskId: {
      [unscheduled.id]: "unscheduled",
      [pending.id]: "pending",
      [inProgress.id]: "in_progress",
    },
  });
  assert.deepEqual(sorted.map((task) => task.id), [unscheduled.id, pending.id, inProgress.id]);
});

test("canonical facets use parents only when Include Steps is off and every entity once when on", () => {
  const parent = createTask({ id: "facet-parent", status: "pending", title: "Parent" });
  const step = createTask({ id: "facet-step", parent_task_id: parent.id, status: "done", title: "Step" });
  const substep = createTask({ id: "facet-substep", parent_task_id: step.id, status: "pending", title: "Substep" });

  const parentOnly = derive([parent, step, substep], [], "", false);
  assert.equal(parentOnly.visibleListCounts.all, 1);
  assert.equal(parentOnly.tableStatusCounts.pending, 1);
  assert.equal(parentOnly.tableStatusCounts.done, 0);

  const withChildren = derive([parent, step, substep], [], "", true);
  assert.equal(withChildren.visibleListCounts.all, 3);
  assert.equal(withChildren.tableStatusCounts.pending, 2);
  assert.equal(withChildren.tableStatusCounts.done, 1);
});

test("search overrides Include Steps without changing the persisted view setting", () => {
  const parent = createTask({ id: "search-override-parent", status: "missed", title: "Watchlist" });
  const child = createTask({ id: "search-override-child", parent_task_id: parent.id, status: "pending", title: "Family Guy" });
  const excluded = derive([parent, child], [], "Family", false);
  const included = derive([parent, child], [], "Family", true);

  assert.deepEqual(excluded.canonicalVisibleRootTasksSorted.map((task) => task.id), [parent.id]);
  assert.deepEqual(excluded.canonicalVisibleRootTasksSorted.map((task) => task.id), included.canonicalVisibleRootTasksSorted.map((task) => task.id));
  assert.deepEqual(excluded.visibleListCounts, included.visibleListCounts);
  assert.deepEqual(excluded.tableStatusCounts, included.tableStatusCounts);
  assert.equal(excluded.visibleListCounts.all, 1);
});

test("Trash is isolated at the canonical base scope while retaining hierarchy in Trash", () => {
  const activeParent = createTask({ id: "trash-parent-context", status: "pending", title: "Context parent" });
  const trashedStep = createTask({
    id: "trash-step",
    parent_task_id: activeParent.id,
    status: "trashed",
    title: "Water trashed step",
    trashed_at: new Date().toISOString(),
  });
  const activeSibling = createTask({ id: "trash-active-sibling", parent_task_id: activeParent.id, status: "pending", title: "Active sibling" });
  const trashedParent = createTask({
    id: "trash-root",
    status: "trashed",
    title: "Water trashed root",
    trashed_at: new Date().toISOString(),
  });

  const outsideTrash = derive([activeParent, trashedStep, activeSibling, trashedParent], [], "trashed", true);
  assert.equal(outsideTrash.visibleListCounts.all, 0);
  assert.equal(outsideTrash.tableStatusCounts.trashed, 0);
  assert.deepEqual(outsideTrash.canonicalVisibleRootTasksSorted, []);
  assert.deepEqual(outsideTrash.childTaskPreviewByParentTaskId[activeParent.id]!.items.map((item) => item.id), [activeSibling.id]);

  const trash = derive([activeParent, trashedStep, activeSibling, trashedParent], [], "water", true, "table", {
    selectedBucket: "trash",
  });
  assert.deepEqual(trash.canonicalVisibleRootTasksSorted.map((task) => task.id), [activeParent.id, trashedParent.id]);
  assert.equal(trash.tableStatusCounts.trashed, 2);
  assert.equal(trash.visibleListCounts.all, 0);
  assert.deepEqual(trash.childTaskPreviewByParentTaskId[activeParent.id]!.items.map((item) => item.id), [trashedStep.id]);
  assert.equal(trash.canonicalEntityProjection.contextAncestorIds.has(activeParent.id), true);
});

test("water search counts direct matches only until Include Steps expands a matching parent", () => {
  const drinkWater = createTask({ id: "drink-water", sort_order: 1, status: "pending", title: "Drink Water" });
  const cups = Array.from({ length: 4 }, (_, index) => createTask({
    id: `cup-${index + 1}`,
    parent_task_id: drinkWater.id,
    sort_order: index + 1,
    status: "missed",
    title: `${index + 1} Cup${index === 0 ? "" : "s"}`,
  }));
  const shop = createTask({ id: "shop", sort_order: 2, status: "pending", title: "Shop" });
  const shopWater = createTask({ id: "shop-water", parent_task_id: shop.id, status: "missed", title: "Water" });
  const tasks = [drinkWater, ...cups, shop, shopWater];

  const excluded = derive(tasks, [], "water", false);
  assert.equal(excluded.visibleListCounts.all, 2);
  assert.equal(excluded.tableStatusCounts.pending, 1);
  assert.equal(excluded.tableStatusCounts.missed, 1);
  assert.deepEqual(Array.from(excluded.canonicalEntityProjection.preStatusMatchedEntityIds).sort(), [drinkWater.id, shopWater.id].sort());
  assert.deepEqual(Array.from(excluded.canonicalEntityProjection.searchExpandedDescendantIds), []);
  assert.equal(excluded.canonicalEntityProjection.contextRootParentIds.has(shop.id), true);
  assert.deepEqual(excluded.statusMatchedStepParentTaskIds.sort(), [drinkWater.id, shop.id].sort());
  assert.deepEqual(filterChildTaskPreviewItemsToMatchingHierarchy(
    excluded.childTaskPreviewByParentTaskId[drinkWater.id]!.items,
    new Set(excluded.statusMatchedChildTaskIds),
  ), []);

  const included = derive(tasks, [], "water", true);
  assert.equal(included.visibleListCounts.all, 6);
  assert.equal(included.tableStatusCounts.pending, 1);
  assert.equal(included.tableStatusCounts.missed, 5);
  assert.deepEqual(
    Array.from(included.canonicalEntityProjection.searchExpandedDescendantIds).sort(),
    cups.map((task) => task.id).sort(),
  );
  assert.equal(included.canonicalEntityProjection.postStatusMatchedEntityIds.has(shop.id), false);

  const excludedMissed = derive(tasks, ["missed"], "water", false);
  assert.deepEqual(Array.from(excludedMissed.canonicalEntityProjection.postStatusMatchedEntityIds), [shopWater.id]);
  const includedMissed = derive(tasks, ["missed"], "water", true);
  assert.deepEqual(
    Array.from(includedMissed.canonicalEntityProjection.postStatusMatchedEntityIds).sort(),
    [...cups.map((task) => task.id), shopWater.id].sort(),
  );
});

test("matching parent expansion includes nested descendants once without counting context", () => {
  const parent = createTask({ id: "nested-water", status: "pending", title: "Water routine" });
  const step = createTask({ id: "nested-step", parent_task_id: parent.id, status: "missed", title: "First glass" });
  const substep = createTask({ id: "nested-substep", parent_task_id: step.id, status: "done", title: "Refill" });
  const result = derive([parent, step, substep], [], "water", true);

  assert.equal(result.visibleListCounts.all, 3);
  assert.equal(result.tableStatusCounts.pending, 1);
  assert.equal(result.tableStatusCounts.missed, 1);
  assert.equal(result.tableStatusCounts.done, 1);
  assert.deepEqual(Array.from(result.canonicalEntityProjection.searchExpandedDescendantIds).sort(), [step.id, substep.id].sort());
  assert.equal(result.canonicalEntityProjection.contextAncestorIds.size, 0);
});

test("manual list membership inherits from the root while smart facts stay entity-owned", () => {
  const parent = createTask({ energy: "high", id: "manual-parent", status: "pending", title: "Watchlist" });
  const step = createTask({ energy: "low", id: "manual-step", parent_task_id: parent.id, status: "pending", title: "Family Guy" });
  const substep = createTask({ id: "manual-substep", parent_task_id: step.id, status: "pending", title: "Family Notes" });
  const customLists: TaskListDefinition[] = [
    ...getBuiltInTaskLists(),
    { description: "", id: "list:tv", isDeletable: true, isEditable: true, isVisible: true, membershipMode: "manual", name: "TV", rules: null, sortOrder: 20, type: "custom" },
    { description: "", id: "list:night", isDeletable: true, isEditable: true, isVisible: true, membershipMode: "manual", name: "Night", rules: null, sortOrder: 21, type: "custom" },
    { description: "", id: "list:high-energy-smart", isDeletable: true, isEditable: true, isVisible: true, membershipMode: "rules", name: "High Energy Smart", rules: { rules: [{ rule: { field: "energy", op: "is", value: "high" } }] }, sortOrder: 22, type: "custom" },
  ];
  const result = derive([parent, step, substep], [], "Guy", false, "table", {
    availableTaskLists: customLists,
    manualMembershipsByTaskId: { [parent.id]: ["list:tv", "routine", "list:night"] },
  });

  assert.equal(result.visibleListCounts.all, 1);
  assert.equal(result.visibleListCounts["list:tv"], 1);
  assert.equal(result.visibleListCounts.routine, 1);
  assert.equal(result.visibleListCounts["list:night"], 1);
  assert.deepEqual(result.statusMatchedStepParentTaskIds, [parent.id]);
  assert.equal(result.canonicalEntityProjection.postStatusMatchedEntityIds.has(parent.id), false);
  assert.equal(result.taskListMembershipsByTaskId[step.id]!.some((membership) => membership.id === "list:high-energy-smart"), false);
  assert.equal(result.taskListMembershipsByTaskId[parent.id]!.some((membership) => membership.id === "list:high-energy-smart"), true);

  const selectedInheritedList = derive([parent, step, substep], [], "Guy", false, "table", {
    availableTaskLists: customLists,
    manualMembershipsByTaskId: { [parent.id]: ["list:tv", "routine", "list:night"] },
    selectedBucket: "list:tv",
  });
  assert.deepEqual(selectedInheritedList.canonicalVisibleRootTasksSorted.map((task) => task.id), [parent.id]);
  assert.equal(selectedInheritedList.tableStatusCounts.pending, 1);
});

test("parent and child independent matches count twice but render one root group", () => {
  const parent = createTask({ id: "both-parent", status: "pending", title: "Family Watchlist" });
  const child = createTask({ id: "both-child", parent_task_id: parent.id, status: "pending", title: "Family Guy" });
  const result = derive([parent, child], [], "Family", false);

  assert.equal(result.visibleListCounts.all, 2);
  assert.deepEqual(result.canonicalVisibleRootTasksSorted.map((task) => task.id), [parent.id]);
  assert.deepEqual(result.statusMatchedStepParentTaskIds, [parent.id]);
});

test("controlled Table column filters drive canonical rows and both facet families", () => {
  const parent = createTask({ id: "column-parent", status: "missed", title: "Watchlist" });
  const child = createTask({ id: "column-child", parent_task_id: parent.id, status: "pending", title: "Family Guy" });
  const unrelated = createTask({ id: "column-other", status: "pending", title: "Other" });
  const result = derive([parent, child, unrelated], [], "", true, "list", {
    tableColumnFilters: { priority: [], repeat: [], text: { title: "Family" } },
  });

  assert.deepEqual(result.canonicalVisibleRootTasksSorted.map((task) => task.id), [parent.id]);
  assert.equal(result.visibleListCounts.all, 1);
  assert.equal(result.tableStatusCounts.pending, 1);
  assert.equal(result.tableStatusCounts.missed, 0);
  assert.deepEqual(result.statusMatchedChildTaskIds, [child.id]);
});

test("only stored complete Steps move to the completed branch group", () => {
  const parent = createTask({ id: "closed-parent", sort_order: 1, status: "archived", title: "Archived parent" });
  const children = (["done", "did_my_best", "missed", "complete"] as const).map((status, index) => createTask({
    id: `closed-${status}`,
    parent_task_id: parent.id,
    sort_order: index + 1,
    status,
    title: status,
  }));
  const derived = derive([parent, ...children], []);
  const items = derived.childTaskPreviewByParentTaskId[parent.id]!.items;
  const grouped = groupChildTaskPreviewItemsByStoredCompletion(items);
  assert.deepEqual(items.map((item) => item.storedStatus), ["done", "did_my_best", "missed", "complete"]);
  assert.deepEqual(grouped.normalItems.map((item) => item.id), ["closed-done", "closed-did_my_best", "closed-missed"]);
  assert.deepEqual(grouped.completedItems.map((item) => item.id), ["closed-complete"]);
});

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

test("Include Steps immediately removes child-only status context while preserving own parent matches", () => {
  const missedParent = createTask({ id: "missed-parent", sort_order: 1, status: "missed", title: "Missed parent" });
  const pendingStep = createTask({ id: "pending-step", parent_task_id: missedParent.id, sort_order: 1, status: "pending", title: "Pending step" });
  const pendingParent = createTask({ id: "pending-parent", sort_order: 2, status: "pending", title: "Pending parent" });
  const missedStep = createTask({ id: "missed-step", parent_task_id: pendingParent.id, sort_order: 1, status: "missed", title: "Missed step" });

  const included = derive([missedParent, pendingStep, pendingParent, missedStep], ["pending"], "", true);
  assert.deepEqual(included.filteredTasksSorted.map((task) => task.id), [missedParent.id, pendingParent.id]);
  assert.deepEqual(included.statusMatchedChildTaskIds, [pendingStep.id]);

  const excluded = derive([missedParent, pendingStep, pendingParent, missedStep], ["pending"], "", false);
  assert.deepEqual(excluded.filteredTasksSorted.map((task) => task.id), [pendingParent.id]);
  assert.deepEqual(excluded.statusMatchedStepParentTaskIds, [pendingParent.id]);
  assert.deepEqual(excluded.statusMatchedChildTaskIds, []);
});

test("search and selected status intersect on the same child entity", () => {
  const watchlist = createTask({ id: "watchlist", sort_order: 1, status: "missed", title: "Watchlist" });
  const familyGuy = createTask({ id: "family-guy", parent_task_id: watchlist.id, sort_order: 1, status: "pending", title: "Family Guy" });
  const unrelatedMissedChild = createTask({ id: "watchlist-missed", parent_task_id: watchlist.id, sort_order: 2, status: "missed", title: "Other show" });
  const unrelatedPending = createTask({ id: "unrelated-pending", sort_order: 2, status: "pending", title: "Unrelated" });

  const familyPending = derive([watchlist, familyGuy, unrelatedMissedChild, unrelatedPending], ["pending"], "Family", true);
  assert.deepEqual(familyPending.filteredTasksSorted.map((task) => task.id), [watchlist.id]);
  assert.deepEqual(familyPending.searchMatchedChildTaskIds, [familyGuy.id]);
  assert.deepEqual(familyPending.statusMatchedChildTaskIds, [familyGuy.id]);

  const familyMissed = derive([watchlist, familyGuy, unrelatedMissedChild, unrelatedPending], ["missed"], "Family", true);
  assert.deepEqual(familyMissed.filteredTasksSorted, []);
  assert.deepEqual(familyMissed.statusMatchedChildTaskIds, []);

  const clearedSearch = derive([watchlist, familyGuy, unrelatedMissedChild, unrelatedPending], ["pending"], "", false);
  assert.deepEqual(clearedSearch.filteredTasksSorted.map((task) => task.id), [unrelatedPending.id]);
});

test("Substep status context participates only when Include Steps is enabled", () => {
  const parent = createTask({ id: "substep-parent", sort_order: 1, status: "missed", title: "Parent" });
  const step = createTask({ id: "substep-step", parent_task_id: parent.id, sort_order: 1, status: "missed", title: "Step" });
  const substep = createTask({ id: "substep-match", parent_task_id: step.id, sort_order: 1, status: "pending", title: "Substep" });
  const included = derive([parent, step, substep], ["pending"], "", true);
  assert.deepEqual(included.filteredTasksSorted.map((task) => task.id), [parent.id]);
  assert.deepEqual(filterChildTaskPreviewItemsToMatchingHierarchy(
    included.childTaskPreviewByParentTaskId[parent.id]!.items,
    new Set(included.statusMatchedChildTaskIds),
  ).map((item) => item.id), [step.id, substep.id]);
  assert.deepEqual(derive([parent, step, substep], ["pending"], "", false).filteredTasksSorted, []);
});

test("Table and List Show all Steps controls share the white compact hierarchy chip", () => {
  const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
  const listSource = readFileSync("src/components/task-app/tasks-list-adapter.tsx", "utf8");
  const primitiveSource = readFileSync("src/components/ui/task-table-primitives.tsx", "utf8");
  assert.match(tableSource, /<TaskHierarchySearchChip[\s\S]*Show all Steps[\s\S]*<\/TaskHierarchySearchChip>/);
  assert.match(listSource, /<TaskHierarchySearchChip[\s\S]*Show all Steps[\s\S]*<\/TaskHierarchySearchChip>/);
  assert.match(primitiveSource, /TASK_HIERARCHY_SEARCH_CHIP_CLASS = "h-\[15px\] px-1\.5 py-0/);
  assert.match(primitiveSource, /TASK_HIERARCHY_SEARCH_CHIP_TONE_CLASS = "[^"]*bg-white/);
  assert.doesNotMatch(tableSource, /flex h-0 justify-start/);
  assert.doesNotMatch(tableSource, /-translate-y-full[\s\S]*Show all Steps/);
});

test("Table and List derive identical scoped search and status results", () => {
  const parent = createTask({ id: "parity-parent", sort_order: 1, status: "missed", title: "Watchlist" });
  const matching = createTask({ id: "parity-family", parent_task_id: parent.id, sort_order: 1, status: "pending", title: "Family Guy" });
  const sibling = createTask({ id: "parity-sibling", parent_task_id: parent.id, sort_order: 2, status: "pending", title: "Other" });
  const tasks = [parent, matching, sibling];
  const table = derive(tasks, ["pending"], "Family", true, "table");
  const list = derive(tasks, ["pending"], "Family", true, "list");
  assert.deepEqual(list.filteredTasksSorted.map((task) => task.id), table.filteredTasksSorted.map((task) => task.id));
  assert.deepEqual(list.statusMatchedChildTaskIds, table.statusMatchedChildTaskIds);
  assert.deepEqual(list.searchMatchedChildTaskIds, table.searchMatchedChildTaskIds);
});

test("Table Active Status retains direct matches without duplicate context and clears normally", () => {
  const parent = createTask({ id: "parent-best", sort_order: 1, status: "did_my_best", title: "Matching parent" });
  const child = createTask({ id: "child-pending", parent_task_id: parent.id, sort_order: 1, status: "pending", title: "Pending child" });
  const ownMatch = derive([parent, child], ["did_my_best"]);
  assert.deepEqual(ownMatch.filteredTasksSorted.map((task) => task.id), [parent.id]);
  assert.deepEqual(ownMatch.statusMatchedStepParentTaskIds, [parent.id]);
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

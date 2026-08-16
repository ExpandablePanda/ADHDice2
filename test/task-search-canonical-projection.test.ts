import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import {
  buildStableCanonicalTaskIndex,
  queryCanonicalTaskEntityProjection,
} from "../src/lib/task-app-derived.ts";
import {
  getBuiltInTaskLists,
  type TaskListDefinition,
  type TaskListId,
  type TaskListEvaluationContext,
} from "../src/lib/task-lists.ts";
import { buildStableTaskSearchScope, queryTaskSearch } from "../src/lib/task-search-selector.ts";
import { DEFAULT_TASK_UI_STATE } from "../src/lib/task-ui-state.ts";

const smartList: TaskListDefinition = {
  description: "",
  id: "list:smart",
  isDeletable: true,
  isEditable: true,
  isVisible: true,
  membershipMode: "rules",
  name: "Smart",
  rules: { rules: [{ rule: { field: "energy", op: "is", value: "high" } }] },
  sortOrder: 20,
  type: "smart",
};

const manualList: TaskListDefinition = {
  description: "",
  id: "list:manual",
  isDeletable: true,
  isEditable: true,
  isVisible: true,
  membershipMode: "manual",
  name: "Manual",
  rules: null,
  sortOrder: 21,
  type: "custom",
};

function evaluationContext(manualMembershipsByTaskId: Record<string, TaskListId[]> = {}): TaskListEvaluationContext {
  return {
    currentStreakByTaskId: {},
    focusedTaskIds: new Set(),
    hasStepsByTaskId: {},
    isDueToday: () => false,
    isDueTomorrow: () => false,
    isLater: () => false,
    isOpen: (task) => task.status !== "complete" && task.status !== "archived" && task.status !== "trashed",
    isOverdue: () => false,
    historyFactsByTaskId: {},
    manualMembershipsByTaskId,
    taskHistoryByTaskId: {},
    todayDateKey: "2026-08-03",
  };
}

function project(
  tasks: ReturnType<typeof createTask>[],
  selectedBucket: string,
  search: string,
  availableTaskLists: TaskListDefinition[],
  manualMembershipsByTaskId: Record<string, TaskListId[]> = {},
  includeSteps = true,
) {
  const index = buildStableCanonicalTaskIndex({
    availableTaskLists,
    focusedTaskIds: [],
    taskHistoryByTaskId: {},
    taskListEvaluationContext: evaluationContext(manualMembershipsByTaskId),
    taskSubtasksByTaskId: {},
    tasks,
    todayDateKey: "2026-08-03",
  });
  return queryCanonicalTaskEntityProjection({
    index,
    normalizedSearchQuery: search,
    taskUiState: {
      ...DEFAULT_TASK_UI_STATE,
      includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, table: includeSteps },
      selectedBucket,
      view: "table",
    },
  });
}

function pinnedSearchFilters() {
  return {
    energyFilters: [],
    focusedTaskIds: [],
    matchAny: false,
    quickFilters: [],
    selectedBucket: "pinned",
    statusFilters: [],
    tableColumnFilters: { priority: [], repeat: [], text: {} },
  } as const;
}

function taskSearchEntities(tasks: ReturnType<typeof createTask>[]) {
  const index = buildStableCanonicalTaskIndex({
    availableTaskLists: getBuiltInTaskLists(),
    focusedTaskIds: [],
    taskHistoryByTaskId: {},
    taskListEvaluationContext: evaluationContext(),
    taskSubtasksByTaskId: {},
    tasks,
    todayDateKey: "2026-08-03",
  });
  return Array.from(index.entityFactsById.values()).map((fact) => ({
    ancestorIds: fact.ancestorIds,
    displayStatus: fact.displayStatus,
    id: fact.id,
    listIds: fact.listMemberships.map((membership) => membership.id),
    rootParentId: fact.rootParentId,
    searchDocument: fact.searchDocument,
    task: fact.task,
  }));
}

test("smart selected root makes an unlisted descendant searchable without smart membership inheritance", () => {
  const root = createTask({ created_at: "2026-08-03T08:00:00.000Z", energy: "high", id: "root", sort_order: 1, status: "pending", title: "Appanda" });
  const step = createTask({ created_at: "2026-08-03T08:01:00.000Z", energy: "low", id: "step", parent_task_id: root.id, sort_order: 1, status: "pending", title: "magic" });
  const tasks = [root, step];
  const result = project(tasks, smartList.id, "magic", [...getBuiltInTaskLists(), smartList]);

  assert.deepEqual([...result.directSearchMatchedEntityIds], [step.id]);
  assert.deepEqual([...result.postStatusMatchedEntityIds], [step.id]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get(root.id)!], [step.id]);
  assert.equal(result.contextRootParentIds.has(root.id), true);
  assert.equal(result.taskListMembershipsByTaskId[step.id]!.some((membership) => membership.id === smartList.id), false);
  assert.equal(result.listFacetCounts[smartList.id], 0);
});

test("manual selected root makes a depth-two descendant searchable while context stays out of facet IDs", () => {
  const root = createTask({ created_at: "2026-08-03T08:00:00.000Z", id: "root", sort_order: 1, status: "pending", title: "Appanda" });
  const step = createTask({ created_at: "2026-08-03T08:01:00.000Z", id: "step", parent_task_id: root.id, sort_order: 1, status: "pending", title: "Try Tools" });
  const substep = createTask({ created_at: "2026-08-03T08:02:00.000Z", id: "substep", parent_task_id: step.id, sort_order: 1, status: "pending", title: "goldy.website" });
  const result = project(
    [root, step, substep],
    manualList.id,
    "goldy",
    [...getBuiltInTaskLists(), manualList],
    { [root.id]: [manualList.id] },
  );

  assert.deepEqual([...result.directSearchMatchedEntityIds], [substep.id]);
  assert.deepEqual([...result.postStatusMatchedEntityIds], [substep.id]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get(root.id)!], [substep.id]);
  assert.deepEqual([...result.primaryFacetVisibleEntityIds], [substep.id]);
  assert.equal(result.contextRootParentIds.has(root.id), true);
});

test("canonical Pinned membership is exact-entity and preserves pinned children with Include Steps off", () => {
  const parent = createTask({ id: "pinned-context-parent", status: "pending", title: "Context parent" });
  const step = createTask({ id: "pinned-step", parent_task_id: parent.id, pinned_at: "2026-08-03T08:01:00Z", status: "pending", title: "Pinned step" });
  const substep = createTask({ id: "pinned-substep", parent_task_id: step.id, pinned_at: "2026-08-03T08:02:00Z", status: "pending", title: "Pinned substep" });
  const result = project([parent, step, substep], "pinned", "", getBuiltInTaskLists(), {}, false);

  assert.deepEqual([...result.postStatusMatchedEntityIds], [step.id, substep.id]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get(parent.id)!], [step.id, substep.id]);
  assert.equal(result.contextAncestorIds.has(parent.id), true);
  assert.equal(result.contextAncestorIds.has(step.id), false);
  assert.equal(result.hierarchyVisibleEntityIds.has(step.id), true);
  assert.equal(result.hierarchyVisibleEntityIds.has(substep.id), true);
  assert.equal(result.listFacetCounts.pinned, 2);
});

test("canonical Pinned membership does not expand an explicitly pinned parent", () => {
  const parent = createTask({ id: "pinned-parent", pinned_at: "2026-08-03T08:00:00Z", status: "pending", title: "Pinned parent" });
  const step = createTask({ id: "unpinned-step", parent_task_id: parent.id, status: "pending", title: "Unpinned step" });
  const result = project([parent, step], "pinned", "", getBuiltInTaskLists(), {}, true);

  assert.deepEqual([...result.postStatusMatchedEntityIds], [parent.id]);
  assert.equal(result.matchingDescendantIdsByRootParentId.has(parent.id), false);
  assert.equal(result.hierarchyVisibleEntityIds.has(step.id), true);
  assert.equal(result.listFacetCounts.pinned, 1);
});

test("canonical Pinned active search matches only the directly searched entity with or without Include Steps", () => {
  const parent = createTask({ id: "video-games", pinned_at: "2026-08-03T08:00:00Z", status: "pending", title: "Video Games" });
  const child = createTask({ id: "buy-groceries", parent_task_id: parent.id, pinned_at: "2026-08-03T08:01:00Z", status: "pending", title: "Buy Groceries" });
  const sibling = createTask({ id: "buy-medicine", parent_task_id: parent.id, pinned_at: "2026-08-03T08:02:00Z", status: "pending", title: "Buy Medicine" });

  for (const includeSteps of [true, false]) {
    const result = project([parent, child, sibling], "pinned", "video games", getBuiltInTaskLists(), {}, includeSteps);

    assert.deepEqual([...result.directSearchMatchedEntityIds], [parent.id]);
    assert.deepEqual([...result.preStatusMatchedEntityIds], [parent.id]);
    assert.deepEqual([...result.postStatusMatchedEntityIds], [parent.id]);
    assert.deepEqual([...result.searchExpandedDescendantIds], []);
    assert.equal(result.matchingDescendantIdsByRootParentId.has(parent.id), false);
    assert.equal(result.hierarchyVisibleEntityIds.has(child.id), false);
    assert.equal(result.listFacetCounts.pinned, 1);
    assert.equal(result.statusFacetCounts.pending, 1);
  }
});

test("canonical Pinned child search keeps the parent as context and excludes unrelated pinned siblings", () => {
  const parent = createTask({ id: "video-games", status: "pending", title: "Video Games" });
  const child = createTask({ id: "buy-groceries", parent_task_id: parent.id, pinned_at: "2026-08-03T08:01:00Z", status: "pending", title: "Buy Groceries" });
  const sibling = createTask({ id: "buy-medicine", parent_task_id: parent.id, pinned_at: "2026-08-03T08:02:00Z", status: "pending", title: "Buy Medicine" });
  const result = project([parent, child, sibling], "pinned", "groceries", getBuiltInTaskLists(), {}, true);

  assert.deepEqual([...result.directSearchMatchedEntityIds], [child.id]);
  assert.deepEqual([...result.preStatusMatchedEntityIds], [child.id]);
  assert.deepEqual([...result.postStatusMatchedEntityIds], [child.id]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get(parent.id)!], [child.id]);
  assert.equal(result.contextAncestorIds.has(parent.id), true);
  assert.equal(result.hierarchyVisibleEntityIds.has(parent.id), true);
  assert.equal(result.hierarchyVisibleEntityIds.has(sibling.id), false);
  assert.equal(result.postStatusMatchedEntityIds.has(parent.id), false);
  assert.equal(result.postStatusMatchedEntityIds.has(sibling.id), false);
  assert.equal(result.statusFacetCounts.pending, 1);
  assert.equal(result.listFacetCounts.pinned, 1);
});

test("canonical Pinned active search matches Task Search selector direct entities without expansion", () => {
  const parent = createTask({ id: "video-games", pinned_at: "2026-08-03T08:00:00Z", status: "pending", title: "Video Games" });
  const child = createTask({ id: "buy-groceries", parent_task_id: parent.id, pinned_at: "2026-08-03T08:01:00Z", status: "pending", title: "Buy Groceries" });
  const sibling = createTask({ id: "buy-medicine", parent_task_id: parent.id, pinned_at: "2026-08-03T08:02:00Z", status: "pending", title: "Buy Medicine" });
  const tasks = [parent, child, sibling];
  const canonicalParentResult = project(tasks, "pinned", "video games", getBuiltInTaskLists(), {}, true);
  const canonicalChildResult = project(tasks, "pinned", "groceries", getBuiltInTaskLists(), {}, true);
  const selectorParentResult = queryTaskSearch("video games", buildStableTaskSearchScope(taskSearchEntities(tasks), pinnedSearchFilters()), true);
  const selectorChildResult = queryTaskSearch("groceries", buildStableTaskSearchScope(taskSearchEntities(tasks), pinnedSearchFilters()), true);

  assert.deepEqual([...canonicalParentResult.directSearchMatchedEntityIds], [...selectorParentResult.directSearchMatchedEntityIds]);
  assert.deepEqual([...canonicalParentResult.searchExpandedDescendantIds], [...selectorParentResult.searchExpandedDescendantIds]);
  assert.deepEqual([...(canonicalParentResult.matchingDescendantIdsByRootParentId.get(parent.id) ?? [])], [...(selectorParentResult.matchingDescendantIdsByRootParentId.get(parent.id) ?? [])]);
  assert.equal(canonicalParentResult.listFacetCounts.pinned, selectorParentResult.listFacetCounts.pinned);
  assert.deepEqual([...canonicalChildResult.directSearchMatchedEntityIds], [...selectorChildResult.directSearchMatchedEntityIds]);
  assert.deepEqual([...canonicalChildResult.searchExpandedDescendantIds], [...selectorChildResult.searchExpandedDescendantIds]);
  assert.deepEqual([...(canonicalChildResult.matchingDescendantIdsByRootParentId.get(parent.id) ?? [])], [...(selectorChildResult.matchingDescendantIdsByRootParentId.get(parent.id) ?? [])]);
  assert.equal(canonicalChildResult.listFacetCounts.pinned, selectorChildResult.listFacetCounts.pinned);
});

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
      includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, table: true },
      selectedBucket,
      view: "table",
    },
  });
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

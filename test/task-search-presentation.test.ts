import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import {
  buildStableCanonicalTaskIndex,
  buildTaskSearchPresentationScope,
  selectTaskSearchPresentation,
} from "../src/lib/task-app-derived.ts";
import { sortTasksForCockpit } from "../src/lib/task-cockpit.ts";
import { getBuiltInTaskLists, type TaskListDefinition, type TaskListEvaluationContext, type TaskListId } from "../src/lib/task-lists.ts";
import type { Task } from "../src/lib/database.types.ts";
import { parseTaskSearchInput } from "../src/lib/task-search.ts";
import { buildStableTaskSearchScope, queryTaskSearch, shouldRunTaskSearch, type TaskSearchEntity } from "../src/lib/task-search-selector.ts";
import { DEFAULT_TASK_UI_STATE, type TaskUiState } from "../src/lib/task-ui-state.ts";

const alphaList: TaskListDefinition = {
  description: "",
  id: "list:alpha",
  isDeletable: true,
  isEditable: true,
  isVisible: true,
  membershipMode: "manual",
  name: "Alpha",
  rules: null,
  sortOrder: 20,
  type: "custom",
};

const betaList: TaskListDefinition = {
  ...alphaList,
  id: "list:beta",
  name: "Beta",
  sortOrder: 21,
};

function task(overrides: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return createTask({
    created_at: "2026-10-01T00:00:00.000Z",
    sort_order: 0,
    status: "pending",
    ...overrides,
  });
}

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
    todayDateKey: "2026-10-12",
  };
}

function createSearchFixture() {
  const alphaRoot = task({ id: "alpha-root", title: "Alpha plan", due_on: "2026-10-12" });
  const alphaStep = task({ id: "alpha-step", parent_task_id: alphaRoot.id, title: "Plan details", due_on: "2026-10-12" });
  const alphaLater = task({ id: "alpha-later", title: "Alpha later", due_on: "2026-10-15", created_at: "2026-10-02T00:00:00.000Z" });
  const alphaInProgress = task({ id: "alpha-in-progress", title: "Alpha in progress", status: "in_progress" });
  const betaRoot = task({ id: "beta-root", title: "Beta plan", status: "in_progress", is_urgent: true, due_on: "2026-10-12" });
  const betaStep = task({ id: "beta-step", parent_task_id: betaRoot.id, title: "Review details", status: "in_progress", is_urgent: true, due_on: "2026-10-12" });
  const betaNotUrgent = task({ id: "beta-not-urgent", title: "Beta secondary", status: "in_progress" });
  const tasks = [alphaRoot, alphaStep, alphaLater, alphaInProgress, betaRoot, betaStep, betaNotUrgent];
  const index = buildStableCanonicalTaskIndex({
    availableTaskLists: [...getBuiltInTaskLists(), alphaList, betaList],
    focusedTaskIds: [alphaRoot.id],
    taskHistoryByTaskId: {},
    taskListEvaluationContext: evaluationContext({
      [alphaRoot.id]: [alphaList.id],
      [alphaLater.id]: [alphaList.id],
      [alphaInProgress.id]: [alphaList.id],
      [betaRoot.id]: [betaList.id],
      [betaNotUrgent.id]: [betaList.id],
    }),
    taskSubtasksByTaskId: {},
    tasks,
    todayDateKey: "2026-10-12",
  });
  const entities: readonly TaskSearchEntity[] = Array.from(index.entityFactsById.values()).map((fact) => ({
    ancestorIds: fact.ancestorIds,
    displayStatus: fact.displayStatus,
    id: fact.id,
    listIds: fact.listMemberships.map((membership) => membership.id),
    rootParentId: fact.rootParentId,
    searchDocument: fact.searchDocument,
    task: fact.task,
  }));
  const bucketContext = { focusedTaskIds: new Set(index.focusedTaskIds), routing: {}, todayDateKey: index.todayDateKey };
  return { alphaInProgress, alphaLater, alphaList, alphaRoot, alphaStep, betaList, betaNotUrgent, betaRoot, betaStep, bucketContext, entities, index, tasks };
}

function makePresentation(overrides: Partial<TaskUiState>): TaskUiState {
  return { ...DEFAULT_TASK_UI_STATE, includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView }, ...overrides };
}

test("one canonical index supports independent list, filter, search, view, and Steps presentations", () => {
  const fixture = createSearchFixture();
  const tablePresentation = makePresentation({
    includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, table: true },
    quickFilters: ["active"],
    selectedBucket: fixture.alphaList.id,
    statusFilters: ["pending"],
    view: "table",
  });
  const listPresentation = makePresentation({
    includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, list: false },
    quickFilters: ["urgent"],
    selectedBucket: fixture.betaList.id,
    statusFilters: ["in_progress"],
    view: "list",
  });
  const firstPresentationBefore = structuredClone(tablePresentation);
  const secondPresentationBefore = structuredClone(listPresentation);
  const tasksBefore = fixture.tasks.map((task) => structuredClone(task));
  const factsBefore = Array.from(fixture.index.entityFactsById, ([id, fact]) => [id, structuredClone(fact)]);
  const parsedAlphaSearch = parseTaskSearchInput("  ALPHA duplicate:title  ", false);

  const tableScope = buildTaskSearchPresentationScope(fixture.index, tablePresentation, fixture.entities);
  const listScope = buildTaskSearchPresentationScope(fixture.index, listPresentation, fixture.entities);
  const tableResult = selectTaskSearchPresentation({
    bucketContext: fixture.bucketContext,
    index: fixture.index,
    page: "Tasks",
    presentation: tablePresentation,
    scope: tableScope,
    search: parsedAlphaSearch.cleanedQuery,
  });
  const listResult = selectTaskSearchPresentation({
    bucketContext: fixture.bucketContext,
    index: fixture.index,
    page: "Tasks",
    presentation: listPresentation,
    scope: listScope,
    search: "beta",
  });
  assert.equal(parsedAlphaSearch.duplicateTitleMode, true);
  assert.deepEqual(parseTaskSearchInput(" has:duplicate-title alpha ", false), parsedAlphaSearch);
  assert.deepEqual(parseTaskSearchInput("highlight:alpha", false), {
    cleanedQuery: "alpha",
    duplicateTitleMode: false,
    highlightMode: false,
  });
  assert.deepEqual([...tableScope.selectedScopeEligibleEntityIds].sort(), [fixture.alphaInProgress.id, fixture.alphaLater.id, fixture.alphaRoot.id, fixture.alphaStep.id].sort());
  assert.deepEqual([...listScope.selectedScopeEligibleEntityIds].sort(), [fixture.betaRoot.id, fixture.betaStep.id].sort());
  assert.equal(tableScope.entitiesById.get(fixture.alphaRoot.id)?.task, fixture.index.taskById.get(fixture.alphaRoot.id));
  assert.equal(listScope.entitiesById.get(fixture.betaRoot.id)?.task, fixture.index.taskById.get(fixture.betaRoot.id));
  assert.ok(tableResult);
  assert.ok(listResult);
  assert.equal(tableScope.selectedScopeEligibleEntityIds.has(fixture.alphaInProgress.id), true);
  assert.equal(listScope.selectedScopeEligibleEntityIds.has(fixture.betaNotUrgent.id), false);
  assert.deepEqual([...tableResult.directSearchMatchedEntityIds], [fixture.alphaRoot.id, fixture.alphaLater.id]);
  assert.deepEqual([...tableResult.matchingStepIds], [fixture.alphaStep.id]);
  assert.deepEqual(tableResult.visibleTasks.map((task) => task.id), sortTasksForCockpit(
    [fixture.alphaRoot, fixture.alphaLater], fixture.bucketContext,
  ).map((task) => task.id));
  assert.deepEqual([...listResult.directSearchMatchedEntityIds], [fixture.betaRoot.id]);
  assert.deepEqual([...listResult.matchingStepIds], []);
  assert.deepEqual(listResult.visibleTasks.map((task) => task.id), [fixture.betaRoot.id]);
  assert.equal([...tableResult.matchingEntityIds].includes(fixture.betaRoot.id), false);
  assert.equal([...listResult.matchingEntityIds].includes(fixture.alphaRoot.id), false);

  const expectedTableScope = buildStableTaskSearchScope(fixture.entities, {
    energyFilters: tablePresentation.energyFilters,
    focusedTaskIds: fixture.index.focusedTaskIds,
    listNameById: fixture.index.listNameById,
    matchAny: tablePresentation.matchAny,
    quickFilters: tablePresentation.quickFilters,
    selectedBucket: tablePresentation.selectedBucket,
    statusFilters: tablePresentation.statusFilters,
    tableColumnFilters: tablePresentation.tableColumnFilters,
  });
  const expectedTableQuery = queryTaskSearch(parsedAlphaSearch.cleanedQuery, expectedTableScope, true);
  assert.deepEqual(tableScope, expectedTableScope);
  assert.deepEqual(tableResult, {
    ...expectedTableQuery,
    visibleTasks: sortTasksForCockpit(
      expectedTableQuery.visibleRootTaskIds.map((taskId) => fixture.index.taskById.get(taskId)!).filter(Boolean),
      fixture.bucketContext,
    ),
  });
  assert.deepEqual(tablePresentation, firstPresentationBefore);
  assert.deepEqual(listPresentation, secondPresentationBefore);
  assert.deepEqual(fixture.tasks, tasksBefore);
  assert.deepEqual(Array.from(fixture.index.entityFactsById, ([id, fact]) => [id, fact]), factsBefore);
});

test("empty search stays safe and non-Tasks pages retain search gating", () => {
  const fixture = createSearchFixture();
  const presentation = makePresentation({ selectedBucket: "all" });
  const scope = buildTaskSearchPresentationScope(fixture.index, presentation, fixture.entities);
  const emptySearch = selectTaskSearchPresentation({
    bucketContext: fixture.bucketContext,
    index: fixture.index,
    page: "Tasks",
    presentation,
    scope,
    search: "",
  });
  const noMatchSearch = selectTaskSearchPresentation({
    bucketContext: fixture.bucketContext,
    index: fixture.index,
    page: "Tasks",
    presentation,
    scope,
    search: "not-a-task",
  });
  const inactivePage = selectTaskSearchPresentation({
    bucketContext: fixture.bucketContext,
    index: fixture.index,
    page: "Home",
    presentation,
    scope,
    search: "alpha",
  });
  const emptyIndex = buildStableCanonicalTaskIndex({
    availableTaskLists: getBuiltInTaskLists(),
    focusedTaskIds: [],
    taskHistoryByTaskId: {},
    taskListEvaluationContext: evaluationContext(),
    taskSubtasksByTaskId: {},
    tasks: [],
    todayDateKey: "2026-10-12",
  });
  const emptyScope = buildTaskSearchPresentationScope(emptyIndex, presentation, []);
  const emptyIndexResult = selectTaskSearchPresentation({
    bucketContext: { focusedTaskIds: new Set(), routing: {}, todayDateKey: emptyIndex.todayDateKey },
    index: emptyIndex,
    page: "Tasks",
    presentation,
    scope: emptyScope,
    search: "",
  });

  assert.deepEqual(new Set(emptySearch?.visibleTasks.map((task) => task.id)), new Set([fixture.alphaRoot.id, fixture.alphaLater.id, fixture.alphaInProgress.id, fixture.betaRoot.id, fixture.betaNotUrgent.id]));
  assert.deepEqual(noMatchSearch?.visibleTasks, []);
  assert.deepEqual([...noMatchSearch!.matchingEntityIds], []);
  assert.equal(inactivePage, null);
  assert.deepEqual(emptyIndexResult?.visibleTasks, []);
  assert.deepEqual([...emptyIndexResult!.matchingEntityIds], []);
  assert.equal(shouldRunTaskSearch("Home"), false);
  assert.equal(shouldRunTaskSearch("Tasks"), true);
});

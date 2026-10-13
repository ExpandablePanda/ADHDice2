import assert from "node:assert/strict";
import test from "node:test";
import { createTask } from "../src/lib/task-buckets.ts";
import {
  buildStableCanonicalTaskIndex,
  buildTaskAppStructuralData,
  buildTaskAppWorkspaceFacts,
  computeTaskAppDerivedData,
  prepareTaskAppDerivedPresentation,
  type TaskAppDerivedPresentation,
} from "../src/lib/task-app-derived.ts";
import { getBuiltInTaskLists } from "../src/lib/task-lists.ts";
import { createTaskDerivationRevisionKey } from "../src/lib/stable-task-projection.ts";
import { DEFAULT_TASK_UI_STATE, type TaskUiState } from "../src/lib/task-ui-state.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";

const TODAY = "2026-10-12";
const taskSubtasksByTaskId = {};
const focusedTaskIds: string[] = [];
const availableTaskLists = getBuiltInTaskLists();
const taskDisplayStatusByTaskId = {};
const bucketContext = { focusedTaskIds: new Set<string>(), routing: {}, todayDateKey: TODAY };

function createTaskHistory(tasks: Task[]): Record<string, TaskHistory[]> {
  return Object.fromEntries(tasks.map((task) => [task.id, [{
    counted_as_due_occurrence: false,
    created_at: TODAY,
    entry_date: TODAY,
    event_type: "status" as const,
    id: `history-${task.id}`,
    occurrence_due_on: null,
    occurrence_key: null,
    status: task.status,
    task_id: task.id,
    updated_at: TODAY,
    user_id: "presentation-test-user",
    was_completed: task.status === "done" || task.status === "complete" || task.status === "did_my_best",
  }]]));
}

function createEvaluationContext(historyByTaskId: Record<string, TaskHistory[]>) {
  return {
    currentStreakByTaskId: {},
    focusedTaskIds: new Set<string>(),
    hasStepsByTaskId: {},
    historyFactsByTaskId: {},
    isDueToday: (date: string | null) => date === TODAY,
    isDueTomorrow: () => false,
    isLater: () => false,
    isOpen: (task: Task) => task.status === "pending" || task.status === "in_progress",
    isOverdue: () => false,
    manualMembershipsByTaskId: {},
    taskHistoryByTaskId: historyByTaskId,
    todayDateKey: TODAY,
  };
}

function createFixture(tasks: Task[]) {
  const taskHistoryByTaskId = createTaskHistory(tasks);
  const taskListEvaluationContext = createEvaluationContext(taskHistoryByTaskId);
  const structuralData = buildTaskAppStructuralData({
    focusedTaskIds,
    taskHistoryByTaskId,
    taskDisplayStatusByTaskId,
    tasks,
    todayDateKey: TODAY,
  });
  const stableCanonicalTaskIndex = buildStableCanonicalTaskIndex({
    availableTaskLists,
    focusedTaskIds,
    taskHistoryByTaskId,
    taskListEvaluationContext,
    taskSubtasksByTaskId,
    taskDisplayStatusByTaskId,
    tasks,
    todayDateKey: TODAY,
    hierarchy: structuralData.hierarchy,
  });
  const workspaceFacts = buildTaskAppWorkspaceFacts({
    availableTaskNotes: [],
    bucketContext,
    focusedTaskIds,
    structuralData,
    stableCanonicalTaskIndex,
    taskDisplayStatusByTaskId,
    tasks,
  });
  const baseInput = {
    activePage: "Tasks",
    availableTaskLists,
    availableTaskNotes: [],
    bucketContext,
    focusedTaskIds,
    listColumnPickerOrder: ["due", "energy", "task_type", "tags", "priority", "signal"],
    taskHistoryByTaskId,
    taskListEvaluationContext,
    taskSubtasksByTaskId,
    taskDisplayStatusByTaskId,
    tasks,
    todayDateKey: TODAY,
    structuralData,
    stableCanonicalTaskIndex,
    workspaceFacts,
  };
  return { baseInput, stableCanonicalTaskIndex, structuralData, tasks, workspaceFacts };
}

function presentation(overrides: Partial<typeof DEFAULT_TASK_UI_STATE> = {}) {
  return prepareTaskAppDerivedPresentation({ ...DEFAULT_TASK_UI_STATE, ...overrides });
}

function deriveWithPresentation(
  fixture: ReturnType<typeof createFixture>,
  prepared: TaskAppDerivedPresentation,
  activePage = "Tasks",
) {
  return computeTaskAppDerivedData({ ...fixture.baseInput, activePage, presentation: prepared });
}

function derivationKey(prepared: TaskAppDerivedPresentation) {
  return createTaskDerivationRevisionKey({
    historyRevision: "history:stable",
    listRevision: "workspace:stable",
    settingsRevision: prepared.derivationSettingsRevision,
    taskRevision: "tasks:stable",
    viewRevision: prepared.derivationViewRevision,
  });
}

test("two view descriptors derive independently from the same canonical index and workspace facts", () => {
  const alpha = createTask({ energy: "high", id: "alpha", sort_order: 1, status: "pending", title: "Alpha task" });
  const beta = createTask({ energy: "low", id: "beta", sort_order: 2, status: "done", title: "Beta task" });
  const fixture = createFixture([alpha, beta]);
  const first = presentation({
    energyFilters: ["high"],
    search: "alpha",
    selectedBucket: "all",
    statusFilters: ["pending"],
    view: "table",
    visibleColumnsByView: { ...DEFAULT_TASK_UI_STATE.visibleColumnsByView, table: ["due", "energy"] },
  });
  const second = presentation({
    energyFilters: ["low"],
    search: "beta",
    selectedBucket: "all",
    statusFilters: ["done"],
    view: "list",
    visibleColumnsByView: {
      ...DEFAULT_TASK_UI_STATE.visibleColumnsByView,
      list: ["task_type", "tags"],
      table: ["tags", "priority"],
    },
  });
  const tasksBefore = structuredClone(fixture.tasks);
  const historyBefore = structuredClone(fixture.baseInput.taskHistoryByTaskId);
  const canonicalFactsBefore = structuredClone([...fixture.stableCanonicalTaskIndex.entityFactsById.entries()]);
  const workspaceFactsBefore = structuredClone(fixture.workspaceFacts);
  const firstResult = deriveWithPresentation(fixture, first);
  const secondResult = deriveWithPresentation(fixture, second);

  assert.deepEqual(firstResult.filteredTasksSorted.map((task) => task.id), [alpha.id]);
  assert.deepEqual(secondResult.filteredTasksSorted.map((task) => task.id), [beta.id]);
  assert.notDeepEqual(firstResult.canonicalEntityProjection.postStatusMatchedEntityIds, secondResult.canonicalEntityProjection.postStatusMatchedEntityIds);
  assert.deepEqual(firstResult.viewVisibleColumns, ["due", "energy"]);
  assert.deepEqual(secondResult.viewVisibleColumns, ["task_type", "tags"]);
  assert.deepEqual(first.visibleColumns, ["due", "energy"]);
  assert.deepEqual(second.visibleColumns, ["task_type", "tags"]);
  assert.deepEqual(firstResult.listColumnPickerColumns.slice(0, 2), ["due", "energy"]);
  assert.deepEqual(secondResult.listColumnPickerColumns.slice(0, 2), ["tags", "priority"]);
  assert.equal(firstResult.canonicalEntityProjection.entityFactsById, fixture.stableCanonicalTaskIndex.entityFactsById);
  assert.equal(secondResult.canonicalEntityProjection.entityFactsById, fixture.stableCanonicalTaskIndex.entityFactsById);
  assert.equal(firstResult.activeTasks, fixture.workspaceFacts.activeTasks);
  assert.equal(secondResult.activeTasks, fixture.workspaceFacts.activeTasks);
  assert.deepEqual(fixture.tasks, tasksBefore);
  assert.deepEqual(fixture.baseInput.taskHistoryByTaskId, historyBefore);
  assert.deepEqual([...fixture.stableCanonicalTaskIndex.entityFactsById.entries()], canonicalFactsBefore);
  assert.deepEqual(fixture.workspaceFacts, workspaceFactsBefore);
});

test("the prepared single-panel descriptor has exact parity with the existing derivation inputs", () => {
  const alpha = createTask({ energy: "high", id: "parity-alpha", sort_order: 1, status: "pending", title: "Alpha task" });
  const fixture = createFixture([alpha]);
  const state: TaskUiState = {
    ...DEFAULT_TASK_UI_STATE,
    energyFilters: ["high"],
    search: "  ALPHA  ",
    selectedBucket: "all",
    statusFilters: ["pending"],
  };
  const prepared = prepareTaskAppDerivedPresentation(state);
  const descriptorResult = deriveWithPresentation(fixture, prepared);
  const existingSinglePanelResult = computeTaskAppDerivedData({
    ...fixture.baseInput,
    deferredSearchQuery: prepared.derivationSearchQuery,
    listVisibleColumns: prepared.tableVisibleColumns,
    taskUiState: prepared.taskUiState,
  });

  assert.deepEqual(descriptorResult, existingSinglePanelResult);
  assert.equal(prepared.normalizedSearchQuery, "alpha");
});

test("search operators, view-specific Steps, and presentation cache revisions are preserved", () => {
  const parent = createTask({ energy: "medium", id: "steps-parent", sort_order: 1, status: "pending", title: "Parent" });
  const step = createTask({ energy: "medium", id: "steps-done", parent_task_id: parent.id, sort_order: 1, status: "done", title: "Needle Step" });
  const fixture = createFixture([parent, step]);
  const baseState: TaskUiState = {
    ...DEFAULT_TASK_UI_STATE,
    search: "has:duplicate-title NEEDLE",
    selectedBucket: "all",
    statusFilters: ["done"],
  };
  const withSteps = prepareTaskAppDerivedPresentation({
    ...baseState,
    includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, list: true },
    view: "list",
  });
  const withoutSteps = prepareTaskAppDerivedPresentation({
    ...baseState,
    includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, table: false },
    view: "table",
  });
  const withStepsResult = deriveWithPresentation(fixture, withSteps);
  const withoutStepsResult = deriveWithPresentation(fixture, withoutSteps);
  const searchOnly = prepareTaskAppDerivedPresentation({
    ...baseState,
    includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, list: true },
    search: "duplicate:title OTHER",
    view: "list",
  });
  const changedActiveViewColumns = prepareTaskAppDerivedPresentation({
    ...baseState,
    visibleColumnsByView: { ...DEFAULT_TASK_UI_STATE.visibleColumnsByView, table: ["due", "energy"] },
    view: "table",
  });
  const changedListViewColumns = prepareTaskAppDerivedPresentation({
    ...baseState,
    includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, list: true },
    visibleColumnsByView: { ...DEFAULT_TASK_UI_STATE.visibleColumnsByView, list: ["task_type"] },
    view: "list",
  });

  assert.equal(withSteps.normalizedSearchQuery, "needle");
  assert.equal(searchOnly.normalizedSearchQuery, "other");
  assert.equal(withSteps.duplicateTitleMode, true);
  assert.equal(withSteps.taskUiState.includeStepsByView.list, true);
  assert.deepEqual(withStepsResult.filteredTasksSorted.map((task) => task.id), [parent.id]);
  assert.deepEqual(withoutStepsResult.filteredTasksSorted, []);
  assert.equal(withSteps.derivationViewRevision !== withoutSteps.derivationViewRevision, true);
  assert.equal(withSteps.derivationViewRevision, searchOnly.derivationViewRevision);
  assert.equal(withSteps.derivationSettingsRevision, searchOnly.derivationSettingsRevision);
  assert.equal(derivationKey(withSteps), derivationKey(searchOnly));
  assert.equal(withoutSteps.derivationViewRevision, changedActiveViewColumns.derivationViewRevision);
  assert.notEqual(withoutSteps.derivationSettingsRevision, changedActiveViewColumns.derivationSettingsRevision);
  assert.notEqual(derivationKey(withoutSteps), derivationKey(changedActiveViewColumns));
  assert.equal(withSteps.derivationViewRevision, changedListViewColumns.derivationViewRevision);
  assert.notEqual(withSteps.derivationSettingsRevision, changedListViewColumns.derivationSettingsRevision);
  assert.notEqual(derivationKey(withSteps), derivationKey(changedListViewColumns));
});

test("empty Tasks and non-Tasks derivation remain safe", () => {
  const emptyFixture = createFixture([]);
  const emptyResult = deriveWithPresentation(emptyFixture, presentation());
  assert.deepEqual(emptyResult.filteredTasksSorted, []);
  assert.equal(emptyResult.canonicalEntityProjection.entityFactsById.size, 0);

  const task = createTask({ id: "home-task", sort_order: 1, status: "pending", title: "Home task" });
  const homeFixture = createFixture([task]);
  const homePresentation = presentation({ duplicateTitleMode: true, search: "home" });
  const homeResult = deriveWithPresentation(homeFixture, homePresentation, "Home");
  assert.deepEqual(homeResult.filteredTasksSorted, []);
  assert.deepEqual(homeResult.duplicateTitleGroups, []);
  assert.deepEqual(homeResult.manualListOptions, []);
});

test("preparation and derivation do not mutate the supplied TaskUiState", () => {
  const task = createTask({ id: "immutable-task", sort_order: 1, status: "pending", title: "Immutable" });
  const fixture = createFixture([task]);
  const state: TaskUiState = {
    ...DEFAULT_TASK_UI_STATE,
    search: "duplicate:title immutable",
    visibleColumnsByView: {
      ...DEFAULT_TASK_UI_STATE.visibleColumnsByView,
      table: ["due", "energy"],
    },
  };
  const stateBefore = structuredClone(state);
  const prepared = prepareTaskAppDerivedPresentation(state);
  deriveWithPresentation(fixture, prepared);

  assert.deepEqual(state, stateBefore);
});

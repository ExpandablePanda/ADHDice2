import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { TaskHistory } from "../src/lib/database.types.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { buildChildTaskCreationDraft } from "../src/lib/task-child-creation.ts";
import { hasActiveTaskFilters, resetTaskFiltersPreservingView } from "../src/lib/task-filter-state.ts";
import {
  formatDueTimeLabel,
  getTaskDisplayStatus,
  getTaskDisplayStatusWithHistory,
  getTaskDueDateBucket,
  getListPriorityLabel,
  matchesTaskQuickFilter,
  normalizeOpenTaskStatusForDueDate,
} from "../src/lib/task-cockpit.ts";
import {
  getMomentumMetric,
  getNextMomentumView,
  updateFocusedTaskIdsByDate,
} from "../src/lib/task-momentum.ts";
import {
  buildTaskGridWidget,
  formatDateKey,
  getMissingTaskGridWidgetTypes,
  getSpanFromDisplayRows,
  moveTaskGridItem,
  normalizeTaskGridLayout,
  reorderTaskGridItems,
  shiftDateKey,
} from "../src/lib/task-grid-layout.ts";
import { todayISO } from "../src/lib/utils.ts";
import { countImportedTaskNodes, parseImportedTaskLines } from "../src/lib/task-input-parsing.ts";
import {
  analyzeTaskUpdateReapplySafety,
  buildTaskUpdateConflictMessage,
  deleteTaskRow,
  updateTaskRowWithLegacyEnergyFallback,
} from "../src/lib/task-db-mutations.ts";
import {
  buildTaskHierarchyAdapter,
  buildTaskTree,
  detectTaskHierarchyIssues,
  getTaskAncestors,
  getTaskDescendants,
  groupTasksByParentId,
  isChildTask,
  isTopLevelTask,
  sortTaskSiblings,
} from "../src/lib/task-hierarchy.ts";
import { buildTaskSiblingReorderPlan } from "../src/lib/task-sibling-reorder.ts";
import { buildChildTaskPreviewVisibility } from "../src/lib/task-child-preview-collapse.ts";
import {
  buildChildTaskPreviewLookup,
  buildTaskPrimaryVisibility,
  buildTaskHierarchyDiagnostics,
  computeTaskAppDerivedData,
  formatChildTaskPreviewDepthLabel,
} from "../src/lib/task-app-derived.ts";
import { buildTaskCollections } from "../src/lib/task-selectors.ts";
import { DEFAULT_TASK_UI_STATE, type TaskUiState } from "../src/lib/task-ui-state.ts";
import { buildTaskListCounts, getBuiltInTaskLists } from "../src/lib/task-lists.ts";
import {
  buildSingleTaskReward,
  buildTaskRewardBankSession,
  getPendingRewardDiceCount,
  resolveTaskRewardTier,
} from "../src/lib/task-rewards.ts";

function computeDerivedForHierarchyDiagnostics(
  tasks: ReturnType<typeof createTask>[],
  overrides: Partial<{
    deferredSearchQuery: string;
    taskHistoryByTaskId: Record<string, TaskHistory[]>;
    taskSubtasksByTaskId: Record<string, ReturnType<typeof createTask>[]>;
    taskEditorTaskId: string | null;
    taskUiState: TaskUiState;
  }> = {},
) {
  return computeTaskAppDerivedData({
    activePage: "Tasks",
    availableTaskLists: getBuiltInTaskLists(),
    availableTaskNotes: [],
    bucketContext: {
      focusedTaskIds: new Set<string>(),
      routing: {},
    },
    deferredSearchQuery: overrides.deferredSearchQuery ?? "",
    focusedTaskIds: [],
    listColumnPickerOrder: [],
    listVisibleColumns: [],
    taskEditorTaskId: overrides.taskEditorTaskId ?? null,
    taskGridLayout: [],
    taskGridWidgetTypes: [],
    taskHistoryByTaskId: overrides.taskHistoryByTaskId ?? {},
    taskListEvaluationContext: {
      currentStreakByTaskId: {},
      focusedTaskIds: new Set<string>(),
      hasStepsByTaskId: {},
      historyFactsByTaskId: {},
      isDueToday: (date) => date === "2026-06-18",
      isDueTomorrow: () => false,
      isLater: () => false,
      isOpen: (task) => task.status === "pending" || task.status === "in_progress",
      isOverdue: () => false,
      manualMembershipsByTaskId: {},
      taskHistoryByTaskId: overrides.taskHistoryByTaskId ?? {},
      todayDateKey: "2026-06-18",
    },
    taskSubtasksByTaskId: overrides.taskSubtasksByTaskId ?? {},
    taskUiState: overrides.taskUiState ?? DEFAULT_TASK_UI_STATE,
    todayDateKey: "2026-06-18",
    tasks,
  });
}

test("primary derived source-child search ignores trashed titles but keeps active titles", () => {
  const parent = createTask({ id: "parent", status: "pending", title: "No Fast Food" });
  const trashedChild = createTask({ id: "trashed-child", status: "trashed", title: "test" });
  const activeChild = createTask({ id: "active-child", status: "pending", title: "keep" });
  const taskSubtasksByTaskId = { [parent.id]: [trashedChild, activeChild] };

  const trashedResult = computeDerivedForHierarchyDiagnostics([parent], {
    deferredSearchQuery: "test",
    taskSubtasksByTaskId,
  });
  assert.deepEqual(trashedResult.filteredTasksSorted.map((task) => task.id), []);

  const activeResult = computeDerivedForHierarchyDiagnostics([parent], {
    deferredSearchQuery: "KEEP",
    taskSubtasksByTaskId,
  });
  assert.deepEqual(activeResult.filteredTasksSorted.map((task) => task.id), [parent.id]);
});

test("primary derived hierarchy search excludes trashed preview evidence but keeps active title and tag evidence", () => {
  const parent = createTask({ id: "parent", status: "pending", title: "No Fast Food" });
  const trashedChild = createTask({
    id: "trashed-child",
    parent_task_id: parent.id,
    status: "trashed",
    title: "test",
  });

  const trashedResult = computeDerivedForHierarchyDiagnostics([parent, trashedChild], {
    deferredSearchQuery: "test",
  });
  assert.equal(trashedResult.filteredTasksSorted.some((task) => task.id === parent.id), false);
  const preview = buildChildTaskPreviewLookup([parent, trashedChild], [], {}, "2026-06-18");
  assert.deepEqual(
    preview[parent.id]?.items.map((item) => item.id),
    [trashedChild.id],
  );

  const activeTitleChild = createTask({
    id: "active-title-child",
    parent_task_id: parent.id,
    status: "pending",
    title: "test",
  });
  const activeTitleResult = computeDerivedForHierarchyDiagnostics([parent, activeTitleChild], {
    deferredSearchQuery: "test",
  });
  assert.equal(activeTitleResult.filteredTasksSorted.some((task) => task.id === parent.id), true);

  const activeTagChild = createTask({
    id: "active-tag-child",
    parent_task_id: parent.id,
    status: "pending",
    tags: ["test"],
    title: "Wash face",
  });
  const activeTagResult = computeDerivedForHierarchyDiagnostics([parent, activeTagChild], {
    deferredSearchQuery: "test",
  });
  assert.equal(activeTagResult.filteredTasksSorted.some((task) => task.id === parent.id), true);

  const activeMixedChild = createTask({
    id: "active-mixed-child",
    parent_task_id: parent.id,
    status: "pending",
    title: "purple zebra",
  });
  const mixedTrashedResult = computeDerivedForHierarchyDiagnostics([parent, trashedChild, activeMixedChild], {
    deferredSearchQuery: "test",
  });
  assert.equal(mixedTrashedResult.filteredTasksSorted.some((task) => task.id === parent.id), false);
  const mixedActiveResult = computeDerivedForHierarchyDiagnostics([parent, trashedChild, activeMixedChild], {
    deferredSearchQuery: "purple",
  });
  assert.equal(mixedActiveResult.filteredTasksSorted.some((task) => task.id === parent.id), true);

  const trashedParent = createTask({
    id: "trashed-parent",
    status: "trashed",
    title: "Trashed parent",
    trashed_at: new Date().toISOString(),
  });
  const trashedParentChild = createTask({
    id: "trashed-parent-child",
    parent_task_id: trashedParent.id,
    status: "trashed",
    title: "test",
    trashed_at: new Date().toISOString(),
  });
  const trashResult = computeDerivedForHierarchyDiagnostics([trashedParent, trashedParentChild], {
    deferredSearchQuery: "test",
    taskUiState: { ...DEFAULT_TASK_UI_STATE, selectedBucket: "trash" },
  });
  assert.deepEqual(trashResult.trashFilteredTasksSorted.map((task) => task.id), [trashedParent.id]);
});

function computeDerivedForQueueCount(tasks: ReturnType<typeof createTask>[], focusedTaskIds: string[], todayDateKey: string) {
  return computeTaskAppDerivedData({
    activePage: "Home",
    availableTaskLists: getBuiltInTaskLists(),
    availableTaskNotes: [],
    bucketContext: {
      focusedTaskIds: new Set(focusedTaskIds),
      routing: {},
    },
    deferredSearchQuery: "",
    focusedTaskIds,
    listColumnPickerOrder: [],
    listVisibleColumns: [],
    taskEditorTaskId: null,
    taskGridLayout: [],
    taskGridWidgetTypes: [],
    taskHistoryByTaskId: {},
    taskListEvaluationContext: {
      currentStreakByTaskId: {},
      focusedTaskIds: new Set(focusedTaskIds),
      hasStepsByTaskId: {},
      historyFactsByTaskId: {},
      isDueToday: (date) => date === todayDateKey,
      isDueTomorrow: () => false,
      isLater: () => false,
      isOpen: (task) => task.status === "pending" || task.status === "in_progress",
      isOverdue: () => false,
      manualMembershipsByTaskId: {},
      taskHistoryByTaskId: {},
      todayDateKey,
    },
    taskSubtasksByTaskId: {},
    taskUiState: DEFAULT_TASK_UI_STATE,
    todayDateKey,
    tasks,
  });
}

test("focus collections follow normal open-task visibility without extra focus filter tabs", () => {
  const today = "2026-06-25";
  const openFocusTask = createTask({
    created_at: `${today}T09:00:00.000Z`,
    due_on: today,
    id: "focus-open-parent",
    repeat_frequency: "daily",
    sort_order: 1,
    status: "pending",
    title: "Open focus parent",
  });
  const doneFocusTask = createTask({
    created_at: `${today}T09:05:00.000Z`,
    due_on: today,
    id: "focus-done-parent",
    repeat_frequency: "daily",
    sort_order: 2,
    status: "done",
    title: "Handled parent",
  });
  const missedFocusTask = createTask({
    created_at: `${today}T09:10:00.000Z`,
    due_on: "2026-06-20",
    id: "focus-missed-parent",
    repeat_frequency: "none",
    sort_order: 3,
    status: "missed",
    title: "Missed focus parent",
  });

  const collections = buildTaskCollections(
    [openFocusTask, doneFocusTask, missedFocusTask],
    {},
    [openFocusTask.id, doneFocusTask.id, missedFocusTask.id],
  );

  assert.deepEqual(
    collections.filteredFocusTasks.map((task) => task.id),
    [openFocusTask.id, missedFocusTask.id],
  );
});

test("normal task UI keeps Steps unified without migration-source labels", async () => {
  const taskUiSources = await Promise.all([
    readFile(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/task-editor-modal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
  ]);
  const [tableSource, listSource, , taskAppSource] = taskUiSources;
  const combinedTaskUiSource = taskUiSources.join("\n");
  const getSourceSlice = (source: string, start: string, end: string) => {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex);
    assert.notEqual(startIndex, -1);
    assert.notEqual(endIndex, -1);
    return source.slice(startIndex, endIndex);
  };
  const stepPreviewSources = [
    getSourceSlice(tableSource, "const renderEditorChildTaskRows", "const renderChildTaskMiniCell"),
    getSourceSlice(tableSource, "const renderChildTaskMiniRows", "const renderSourceStepMiniCell"),
    getSourceSlice(listSource, "function StepsCardPreview", "function MetadataChipButton"),
  ];

  assert.equal(combinedTaskUiSource.includes("Legacy checklist"), false);
  assert.equal(combinedTaskUiSource.includes("Steps are task rows nested"), false);
  assert.equal(/>\s*Task rows\s*</.test(combinedTaskUiSource), false);
  assert.equal(combinedTaskUiSource.includes("direct step"), false);
  assert.equal(combinedTaskUiSource.includes("total step row"), false);
  assert.equal(combinedTaskUiSource.includes("TaskCellSubtaskTree"), false);
  assert.equal(taskAppSource.includes("buildTaskHierarchyAdapter(tasks).childrenByParentId"), true);
  assert.equal(taskAppSource.includes("sameTableStepCount > 0"), true);
  assert.equal(combinedTaskUiSource.includes("data-task-table-source-step-rows"), true);
  assert.equal(tableSource.includes("metadataContextLabel"), true);
  assert.equal(tableSource.includes("Choose a field to edit."), false);
  assert.equal(tableSource.includes("data-step-metadata-controls"), false);
  assert.equal(tableSource.includes("data-step-row-controls"), true);
  assert.equal(tableSource.includes("data-step-row-add"), true);
  assert.equal(tableSource.includes("data-step-row-status-icons"), true);
  assert.equal(tableSource.includes("data-step-row-delete"), true);
  assert.equal(tableSource.includes("beginTableStepDraft(task.id)"), true);
  assert.equal(tableSource.includes("beginTableStepDraft(item.id)"), true);
  assert.equal(tableSource.includes("toggleInlineActionRow(task.id, mode"), true);
  assert.equal(tableSource.includes("toggleInlineActionRow(taskId, mode)"), true);
  assert.equal(tableSource.includes("data-same-table-step-add"), true);
  assert.equal(listSource.includes("data-same-table-step-add"), true);
  assert.equal(tableSource.includes("data-table-step-draft-row"), true);
  assert.equal(tableSource.includes("setEditingTaskTitleId(item.id)"), true);
  assert.equal(tableSource.includes("childPreviewToPrototypeTaskRow(item)"), true);
  assert.equal(tableSource.includes("renderInlineActionRow(task)"), true);
  assert.equal(tableSource.includes("renderInlineActionRow(inlineStepTask)"), true);
  assert.equal(tableSource.includes("data-same-table-step-delete"), true);
  assert.equal(listSource.includes("data-same-table-step-delete"), true);
  for (const source of stepPreviewSources) {
    assert.equal(/>\s*Open\s*</.test(source), false);
  }
});

test("filter state helpers detect active filters and preserve key UI state on reset", () => {
  const activeState = {
    ...DEFAULT_TASK_UI_STATE,
    search: "invoice",
    selectedBucket: "later",
    view: "matrix" as const,
  };

  assert.equal(hasActiveTaskFilters(DEFAULT_TASK_UI_STATE), false);
  assert.equal(hasActiveTaskFilters(activeState), true);

  const reset = resetTaskFiltersPreservingView(activeState);
  assert.equal(reset.search, "");
  assert.equal(reset.selectedBucket, "later");
  assert.equal(reset.view, "matrix");
});

test("filter state helpers treat routine and pinned as resettable active filters", () => {
  const routineState = {
    ...DEFAULT_TASK_UI_STATE,
    selectedBucket: "routine",
    view: "list" as const,
  };
  const pinnedState = {
    ...DEFAULT_TASK_UI_STATE,
    selectedBucket: "pinned",
  };

  assert.equal(hasActiveTaskFilters(routineState), true);
  assert.equal(hasActiveTaskFilters(pinnedState), true);

  const resetRoutine = resetTaskFiltersPreservingView(routineState);
  assert.equal(resetRoutine.selectedBucket, DEFAULT_TASK_UI_STATE.selectedBucket);
  assert.equal(resetRoutine.view, "list");
});

test("task selectors build expected filtered collections and list memberships", () => {
  const today = todayISO();
  const openTask = createTask({
    created_at: `${today}T09:00:00.000Z`,
    due_on: today,
    energy: "low",
    id: "task-open",
    sort_order: 1,
    status: "pending",
    title: "Open",
  });
  const doneTask = createTask({
    created_at: `${today}T10:00:00.000Z`,
    id: "task-done",
    sort_order: 2,
    status: "done",
    title: "Done",
  });

  const collections = buildTaskCollections(
    [openTask, doneTask],
    {
      "task-open": [{ id: "inbox" }, { id: "quick_wins" }],
      "task-done": [{ id: "completed" }],
    },
    ["task-open"],
  );

  assert.equal(collections.filteredActiveTasks.length, 1);
  assert.equal(collections.filteredDoneTasks.length, 1);
  assert.equal(collections.filteredFocusTasks.length, 1);
  assert.equal(collections.filteredLowEnergyTasks.length, 1);
  assert.equal(collections.inboxTasks.length, 1);
  assert.equal(collections.quickWinTasks.length, 1);
});

test("momentum helpers cycle view, update day buckets, and compute metrics", () => {
  const today = todayISO();
  const doneFocused = createTask({
    created_at: `${today}T08:00:00.000Z`,
    due_on: today,
    id: "task-focus-done",
    sort_order: 1,
    status: "done",
    title: "Focused done",
  });
  const openFocused = createTask({
    created_at: `${today}T09:00:00.000Z`,
    due_on: today,
    id: "task-focus-open",
    sort_order: 2,
    status: "pending",
    title: "Focused open",
  });

  assert.equal(getNextMomentumView("urgent"), "today");
  assert.equal(getNextMomentumView("today"), "focus");
  assert.equal(getNextMomentumView("focus"), "urgent");

  const updated = updateFocusedTaskIdsByDate({}, today, ["task-focus-open"]);
  assert.deepEqual(updated[today], ["task-focus-open"]);

  const metric = getMomentumMetric({
    doneTasks: [doneFocused],
    focusedTaskIds: ["task-focus-done", "task-focus-open"],
    tasks: [doneFocused, openFocused],
    todayTasks: [openFocused],
    urgentTasks: [],
  }, "focus");

  assert.equal(metric.totalCount, 2);
  assert.equal(metric.doneTasks.length, 1);
});

test("cockpit helpers format metadata and evaluate quick filters", () => {
  const today = todayISO();
  const task = createTask({
    created_at: `${today}T07:00:00.000Z`,
    due_on: today,
    id: "task-cockpit",
    is_urgent: true,
    sort_order: 1,
    status: "pending",
    title: "Cockpit",
  });

  assert.equal(formatDueTimeLabel("13:05"), "1:05 PM");
  assert.equal(matchesTaskQuickFilter(task, "today", []), true);
  assert.equal(matchesTaskQuickFilter(task, "urgent", []), true);
  assert.equal(getListPriorityLabel(task, new Set<string>()), "Urgent");
});

test("date bucket helpers classify due_on windows and normalize stale future statuses", () => {
  const today = todayISO();
  const tomorrow = shiftDateKey(today, 1);
  const sevenDaysOut = shiftDateKey(today, 7);
  const eightDaysOut = shiftDateKey(today, 8);
  const yesterday = shiftDateKey(today, -1);

  const todayTask = createTask({
    created_at: `${today}T07:30:00.000Z`,
    due_on: today,
    id: "task-due-today",
    sort_order: 11,
    status: "not_due",
    title: "Due today",
  });
  const tomorrowTask = createTask({
    created_at: `${today}T07:31:00.000Z`,
    due_on: tomorrow,
    id: "task-due-tomorrow",
    sort_order: 12,
    status: "not_due",
    title: "Due tomorrow",
  });
  const sevenDaysTask = createTask({
    created_at: `${today}T07:32:00.000Z`,
    due_on: sevenDaysOut,
    id: "task-due-seven-days",
    sort_order: 13,
    status: "not_due",
    title: "Due in seven days",
  });
  const eightDaysTask = createTask({
    created_at: `${today}T07:33:00.000Z`,
    due_on: eightDaysOut,
    id: "task-due-eight-days",
    sort_order: 14,
    status: "upcoming",
    title: "Due in eight days",
  });
  const overdueTask = createTask({
    created_at: `${today}T07:34:00.000Z`,
    due_on: yesterday,
    id: "task-overdue",
    sort_order: 15,
    status: "not_due",
    title: "Overdue task",
  });
  const noDueDateTask = createTask({
    created_at: `${today}T07:35:00.000Z`,
    id: "task-no-due-date",
    sort_order: 16,
    status: "upcoming",
    title: "No due date task",
  });
  const delayedFutureTask = createTask({
    created_at: `${today}T07:36:00.000Z`,
    due_on: tomorrow,
    id: "task-delayed-future",
    sort_order: 17,
    status: "delayed",
    title: "Delayed future task",
  });
  const delayedTodayTask = createTask({
    created_at: `${today}T07:37:00.000Z`,
    due_on: today,
    id: "task-delayed-today",
    sort_order: 18,
    status: "delayed",
    title: "Delayed today task",
  });
  const notDueTodayTask = createTask({
    created_at: `${today}T07:38:00.000Z`,
    due_on: today,
    id: "task-not-due-today",
    sort_order: 19,
    status: "not_due",
    title: "Not due today task",
  });
  const delayedOverdueTask = createTask({
    created_at: `${today}T07:39:00.000Z`,
    due_on: yesterday,
    id: "task-delayed-overdue",
    sort_order: 20,
    status: "delayed",
    title: "Delayed overdue task",
  });

  assert.equal(getTaskDueDateBucket(todayTask), "today");
  assert.equal(getTaskDueDateBucket(tomorrowTask), "upcoming");
  assert.equal(getTaskDueDateBucket(sevenDaysTask), "upcoming");
  assert.equal(getTaskDueDateBucket(eightDaysTask), "not_due");
  assert.equal(getTaskDueDateBucket(overdueTask), "overdue");
  assert.equal(getTaskDueDateBucket(noDueDateTask), "none");

  assert.equal(getTaskDisplayStatus(todayTask), "pending");
  assert.equal(getTaskDisplayStatus(tomorrowTask), "upcoming");
  assert.equal(getTaskDisplayStatus(sevenDaysTask), "upcoming");
  assert.equal(getTaskDisplayStatus(eightDaysTask), "not_due");
  assert.equal(getTaskDisplayStatus(overdueTask), "missed");
  assert.equal(getTaskDisplayStatus(noDueDateTask), "not_due");
  assert.equal(getTaskDisplayStatus(delayedFutureTask), "delayed");
  assert.equal(getTaskDisplayStatus(delayedTodayTask), "pending");
  assert.equal(getTaskDisplayStatus(notDueTodayTask), "pending");
  assert.equal(getTaskDisplayStatus(delayedOverdueTask), "missed");
  assert.equal(normalizeOpenTaskStatusForDueDate({ due_on: today, status: "pending" }, today), "pending");
  assert.equal(normalizeOpenTaskStatusForDueDate({ due_on: tomorrow, status: "pending" }, today), "upcoming");
  assert.equal(normalizeOpenTaskStatusForDueDate({ due_on: eightDaysOut, status: "pending" }, today), "not_due");
  assert.equal(normalizeOpenTaskStatusForDueDate({ due_on: tomorrow, status: "delayed" }, today), "delayed");
  assert.equal(normalizeOpenTaskStatusForDueDate({ due_on: today, status: "delayed" }, today), "pending");
  assert.equal(normalizeOpenTaskStatusForDueDate({ due_on: eightDaysOut, status: "in_progress" }, today), "in_progress");
});

test("recurring display status follows current-occurrence history without treating older history as the current row", () => {
  const recurringTask = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    due_on: "2026-06-24",
    id: "task-recurring-history-visible-status",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 21,
    status: "pending",
    title: "Recurring history status",
  });

  const baseEntry = {
    created_at: "2026-06-24T09:00:00.000Z",
    event_type: null,
    id: "history-entry",
    note: null,
    task_id: recurringTask.id,
    updated_at: "2026-06-24T09:00:00.000Z",
    user_id: "user-1",
    was_completed: true,
  };

  const doneTodayHistory: TaskHistory[] = [
    {
      ...baseEntry,
      entry_date: "2026-06-24",
      id: "history-done-today",
      status: "done",
    },
  ];
  const didMyBestTodayHistory: TaskHistory[] = [
    {
      ...baseEntry,
      entry_date: "2026-06-24",
      id: "history-dmb-today",
      status: "did_my_best",
    },
  ];
  const missedTodayHistory: TaskHistory[] = [
    {
      ...baseEntry,
      entry_date: "2026-06-24",
      id: "history-missed-today",
      status: "missed",
      was_completed: false,
    },
  ];
  const olderDoneOnlyHistory: TaskHistory[] = [
    {
      ...baseEntry,
      entry_date: "2026-06-23",
      id: "history-done-yesterday",
      status: "done",
    },
  ];

  assert.equal(getTaskDisplayStatusWithHistory(recurringTask, doneTodayHistory, "2026-06-24"), "done");
  assert.equal(getTaskDisplayStatusWithHistory(recurringTask, didMyBestTodayHistory, "2026-06-24"), "did_my_best");
  assert.equal(getTaskDisplayStatusWithHistory(recurringTask, missedTodayHistory, "2026-06-24"), "missed");
  assert.equal(getTaskDisplayStatusWithHistory(recurringTask, olderDoneOnlyHistory, "2026-06-24"), "pending");
});

test("rolled-forward recurring display status ignores today history for future active occurrences", () => {
  const baseTask = createTask({
    created_at: "2026-06-24T09:00:00.000Z",
    due_on: "2026-07-01",
    id: "task-recurring-rolled-forward",
    repeat_frequency: "weekly",
    repeat_interval: 1,
    sort_order: 22,
    status: "upcoming",
    title: "Rolled forward recurring task",
  });
  const baseEntry = {
    created_at: "2026-06-24T09:00:00.000Z",
    entry_date: "2026-06-24",
    event_type: null,
    id: "history-rolled-forward",
    note: null,
    status: "done" as const,
    task_id: baseTask.id,
    updated_at: "2026-06-24T09:00:00.000Z",
    user_id: "user-1",
    was_completed: true,
  };

  assert.equal(getTaskDisplayStatusWithHistory(baseTask, [baseEntry], "2026-06-24"), "upcoming");
  assert.equal(getTaskDisplayStatusWithHistory({
    ...baseTask,
    due_on: "2026-06-25",
    id: "task-daily-rolled-forward",
    repeat_frequency: "daily",
  }, [baseEntry], "2026-06-24"), "upcoming");
  assert.equal(getTaskDisplayStatusWithHistory({
    ...baseTask,
    due_on: "2026-07-02",
    id: "task-daily-until-complete-rolled-forward",
    repeat_frequency: "daily",
    status: "not_due",
  }, [baseEntry], "2026-06-24"), "not_due");
  assert.equal(getTaskDisplayStatusWithHistory(baseTask, [{
    ...baseEntry,
    id: "history-rolled-forward-missed",
    status: "missed",
    was_completed: false,
  }], "2026-06-24"), "upcoming");
});

test("grid layout helpers normalize, reorder, move, and date utilities behave consistently", () => {
  const isWidgetType = (value: string): value is "urgent" | "import" => value === "urgent" || value === "import";
  const layout = normalizeTaskGridLayout([
    { h: 7, id: "a", type: "urgent", w: 2, x: 0, y: 0 },
    { h: 6, id: "b", type: "import", w: 2, x: 0, y: 0 },
  ], isWidgetType, 4, 24);
  assert.equal(layout.length, 2);
  assert.equal(layout[0]?.x, 0);
  assert.equal(layout[1]?.x, 2);

  const reordered = reorderTaskGridItems(layout, "a", "b", isWidgetType, 4, 24);
  assert.equal(reordered[0]?.id, "b");

  const moved = moveTaskGridItem(reordered, "a", "up", isWidgetType, 4, 24);
  assert.equal(moved[0]?.id, "a");

  const nextWidget = buildTaskGridWidget("urgent", "grid-urgent-id");
  assert.equal(nextWidget.w, 2);
  assert.equal(nextWidget.id, "grid-urgent-id");

  const missing = getMissingTaskGridWidgetTypes(layout, ["urgent", "import"]);
  assert.deepEqual(missing, []);

  assert.equal(getSpanFromDisplayRows(2, 24), 4);
  assert.equal(shiftDateKey("2026-05-20", 1), "2026-05-21");
});

test("task list counts preserve built-in bucket memberships", () => {
  const today = formatDateKey(new Date());
  const inboxTask = createTask({
    created_at: `${today}T08:00:00.000Z`,
    id: "task-inbox",
    sort_order: 1,
    status: "pending",
    title: "Inbox task",
  });
  const todayTask = createTask({
    created_at: `${today}T09:00:00.000Z`,
    due_on: today,
    id: "task-today",
    sort_order: 2,
    status: "pending",
    title: "Today task",
  });

  const counts = buildTaskListCounts([inboxTask, todayTask], getBuiltInTaskLists(), {
    currentStreakByTaskId: {},
    focusedTaskIds: new Set<string>(),
    hasStepsByTaskId: {},
    historyFactsByTaskId: {},
    isDueToday: (date) => date === today,
    isDueTomorrow: () => false,
    isLater: () => false,
    isOpen: (task) => task.status === "pending" || task.status === "in_progress",
    isOverdue: () => false,
    manualMembershipsByTaskId: {},
    taskHistoryByTaskId: {},
    todayDateKey: today,
  });

  assert.equal(counts.inbox, 1);
  assert.equal(counts.today, 1);
});

test("import parser captures parent metadata and nested steps", () => {
  const parsed = parseImportedTaskLines([
    "Clean Ears #hygiene *due-Today *repeat-Daily",
    "Moisturize",
    "-AM",
    "--Face",
    "--Feet",
    "-PM",
  ], { todayDateKey: "2026-06-10" });

  assert.equal(parsed.tasks.length, 2);
  assert.equal(parsed.tasks[0]?.title, "Clean Ears");
  assert.deepEqual(parsed.tasks[0]?.tags, ["hygiene"]);
  assert.equal(parsed.tasks[0]?.dueOn, "2026-06-10");
  assert.equal(parsed.tasks[0]?.repeatFrequency, "daily");
  assert.equal(parsed.tasks[1]?.subtasks[0]?.title, "AM");
  assert.equal(parsed.tasks[1]?.subtasks[0]?.children[0]?.title, "Face");
  assert.equal(parsed.tasks[1]?.subtasks[0]?.children[1]?.title, "Feet");
  assert.equal(parsed.tasks[1]?.subtasks[1]?.title, "PM");
});

test("import progress counts parsed parents and every supported descendant", () => {
  const parsed = parseImportedTaskLines([
    "Task A",
    "- Step A",
    "-- Substep A",
    "Task B",
    "- Step B",
    "",
    "--",
    "- *status-Pending",
  ], { todayDateKey: "2026-06-10" });
  assert.equal(parsed.tasks.length, 2);
  assert.equal(countImportedTaskNodes(parsed.tasks), 5);
  assert.ok(parsed.warnings.length >= 2);
});

test("import parser preserves modern same-table step metadata", () => {
  const parsed = parseImportedTaskLines([
    "Clean Bathroom #home *due-Today",
    "-Sink #cleaning *estimate-5m *status-InProgress *priority-Important *energy-High",
    "-Floor *due-Tomorrow *repeat-Weekly",
  ], { todayDateKey: "2026-06-10" });

  assert.equal(parsed.tasks.length, 1);
  assert.equal(parsed.tasks[0]?.subtasks[0]?.title, "Sink");
  assert.equal(parsed.tasks[0]?.subtasks[0]?.status, "in_progress");
  assert.equal(parsed.tasks[0]?.subtasks[0]?.estimatedMinutes, 5);
  assert.deepEqual(parsed.tasks[0]?.subtasks[0]?.tags, ["cleaning"]);
  assert.equal(parsed.tasks[0]?.subtasks[0]?.isImportant, true);
  assert.equal(parsed.tasks[0]?.subtasks[0]?.energy, "high");
  assert.equal(parsed.tasks[0]?.subtasks[1]?.dueOn, "2026-06-11");
  assert.equal(parsed.tasks[0]?.subtasks[1]?.repeatFrequency, "weekly");
  assert.deepEqual(parsed.warnings, []);
});

test("import parser warns on orphan steps and unknown metadata", () => {
  const parsed = parseImportedTaskLines([
    "-Orphan step",
    "Task title *mood-Happy",
  ], { todayDateKey: "2026-06-10" });

  assert.equal(parsed.tasks.length, 1);
  assert.match(parsed.warnings.map((warning) => warning.message).join("\n"), /no parent task above it/i);
  assert.match(parsed.warnings.map((warning) => warning.message).join("\n"), /unknown metadata field "mood"/i);
});

test("child task preview lookup uses the same display status semantics as parent tasks", () => {
  const parent = createTask({
    created_at: "2026-06-22T09:00:00.000Z",
    due_on: "2026-06-29",
    id: "weekly-parent",
    repeat_frequency: "weekly",
    repeat_interval: 1,
    sort_order: 1,
    status: "upcoming",
    title: "Weekly parent",
  });
  const child = createTask({
    created_at: "2026-06-22T09:05:00.000Z",
    due_on: "2026-06-29",
    id: "weekly-step",
    parent_task_id: parent.id,
    repeat_frequency: "weekly",
    repeat_interval: 1,
    sort_order: 1,
    status: "not_due",
    title: "Weekly step",
  });

  const previewLookup = buildChildTaskPreviewLookup([parent, child], [], {}, "2026-06-22");

  assert.equal(previewLookup[parent.id]?.items[0]?.status, "upcoming");
});

test("task update conflict helpers only auto-reapply low-risk untouched fields", () => {
  const baseTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-conflict",
    notes: "base notes",
    revision: 3,
    sort_order: 1,
    status: "pending",
    title: "Base title",
  });
  const latestTask = {
    ...baseTask,
    energy: "high" as const,
    revision: 4,
  };

  const safePlan = analyzeTaskUpdateReapplySafety(baseTask, latestTask, { title: "Retitled" });
  assert.equal(safePlan.canAutoReapply, true);
  assert.deepEqual(safePlan.conflictingFields, []);

  const sameFieldConflictPlan = analyzeTaskUpdateReapplySafety(
    baseTask,
    { ...latestTask, title: "Remote title" },
    { title: "Local title" },
  );
  assert.equal(sameFieldConflictPlan.canAutoReapply, false);
  assert.equal(sameFieldConflictPlan.reason, "same_field_changed_remotely");
  assert.deepEqual(sameFieldConflictPlan.conflictingFields, ["title"]);

  const highRiskPlan = analyzeTaskUpdateReapplySafety(baseTask, latestTask, { status: "done" });
  assert.equal(highRiskPlan.canAutoReapply, false);
  assert.equal(highRiskPlan.reason, "high_risk_patch");
  assert.deepEqual(highRiskPlan.conflictingFields, ["status"]);

  assert.match(
    buildTaskUpdateConflictMessage({
      attemptedReapply: false,
      conflictingFields: ["status"],
      latestTask,
      reason: "high_risk_patch",
    }),
    /higher-risk fields/i,
  );
});

test("task hierarchy helpers identify roots, children, ancestry, descendants, and invalid links", () => {
  const tasks = [
    createTask({
      created_at: "2026-06-11T08:00:00.000Z",
      id: "root",
      sort_order: 0,
      status: "pending",
      title: "Root",
    }),
    createTask({
      created_at: "2026-06-11T08:05:00.000Z",
      id: "child-b",
      parent_task_id: "root",
      sort_order: 2,
      status: "pending",
      title: "Child B",
    }),
    createTask({
      created_at: "2026-06-11T08:04:00.000Z",
      id: "child-a",
      parent_task_id: "root",
      sort_order: 1,
      status: "pending",
      title: "Child A",
    }),
    createTask({
      created_at: "2026-06-11T08:06:00.000Z",
      id: "grandchild",
      parent_task_id: "child-b",
      sort_order: 0,
      status: "pending",
      title: "Grandchild",
    }),
    createTask({
      created_at: "2026-06-11T08:07:00.000Z",
      id: "orphan",
      parent_task_id: "missing-parent",
      sort_order: 3,
      status: "pending",
      title: "Orphan",
    }),
    createTask({
      created_at: "2026-06-11T08:08:00.000Z",
      id: "self-loop",
      parent_task_id: "self-loop",
      sort_order: 4,
      status: "pending",
      title: "Self loop",
    }),
    createTask({
      created_at: "2026-06-11T08:09:00.000Z",
      id: "cycle-a",
      parent_task_id: "cycle-b",
      sort_order: 5,
      status: "pending",
      title: "Cycle A",
    }),
    createTask({
      created_at: "2026-06-11T08:10:00.000Z",
      id: "cycle-b",
      parent_task_id: "cycle-a",
      sort_order: 6,
      status: "pending",
      title: "Cycle B",
    }),
  ];

  assert.equal(isTopLevelTask(tasks[0]!), true);
  assert.equal(isChildTask(tasks[0]!), false);
  assert.equal(isChildTask(tasks[1]!), true);

  assert.deepEqual(
    sortTaskSiblings(tasks.filter((task) => task.parent_task_id === "root")).map((task) => task.id),
    ["child-a", "child-b"],
  );

  const grouped = groupTasksByParentId(tasks);
  assert.deepEqual((grouped.get("root") ?? []).map((task) => task.id), ["child-a", "child-b"]);
  assert.deepEqual((grouped.get(null) ?? []).map((task) => task.id), ["root"]);

  assert.deepEqual(getTaskAncestors("grandchild", tasks).map((task) => task.id), ["child-b", "root"]);
  assert.deepEqual(getTaskDescendants("root", tasks).map((task) => task.id), ["child-a", "child-b", "grandchild"]);

  const tree = buildTaskTree(tasks);
  const rootNode = tree.find((node) => node.task.id === "root");
  assert.ok(rootNode);
  assert.deepEqual(rootNode.children.map((node) => node.task.id), ["child-a", "child-b"]);
  assert.deepEqual(rootNode.children[1]?.children.map((node) => node.task.id), ["grandchild"]);
  assert.ok(tree.some((node) => node.task.id === "orphan"));
  assert.ok(tree.some((node) => node.task.id === "self-loop"));
  assert.ok(tree.some((node) => node.task.id === "cycle-a"));
  assert.ok(tree.some((node) => node.task.id === "cycle-b"));

  const issues = detectTaskHierarchyIssues(tasks);
  assert.deepEqual(
    issues.filter((issue) => issue.type === "missing_parent").map((issue) => issue.taskId),
    ["orphan"],
  );
  assert.deepEqual(
    issues.filter((issue) => issue.type === "self_parent").map((issue) => issue.taskId),
    ["self-loop"],
  );
  assert.deepEqual(
    issues.filter((issue) => issue.type === "circular_parent").map((issue) => issue.taskId),
    ["cycle-a", "cycle-b"],
  );
});

test("same-parent sibling reorder normalizes only the affected sibling group", () => {
  const tasks = [
    createTask({ id: "parent", sort_order: 50, status: "pending", title: "Parent" }),
    createTask({ id: "step-a", parent_task_id: "parent", sort_order: 10, status: "pending", title: "A" }),
    createTask({ id: "step-b", parent_task_id: "parent", sort_order: 30, status: "pending", title: "B" }),
    createTask({ id: "step-c", parent_task_id: "parent", sort_order: 30, status: "pending", title: "C" }),
    createTask({ id: "other-parent", sort_order: 60, status: "pending", title: "Other" }),
    createTask({ id: "other-step", parent_task_id: "other-parent", sort_order: 99, status: "pending", title: "Other step" }),
  ];

  assert.deepEqual(buildTaskSiblingReorderPlan(tasks, "step-b", "down"), {
    ok: true,
    orderedTaskIds: ["step-a", "step-c", "step-b"],
    parentTaskId: "parent",
    updates: [
      { id: "step-a", sortOrder: 1 },
      { id: "step-c", sortOrder: 2 },
      { id: "step-b", sortOrder: 3 },
    ],
  });
});

test("same-parent sibling reorder supports substeps and rejects unsafe movement", () => {
  const tasks = [
    createTask({ id: "parent", sort_order: 1, status: "pending", title: "Parent" }),
    createTask({ id: "step", parent_task_id: "parent", sort_order: 1, status: "pending", title: "Step" }),
    createTask({ id: "sub-a", parent_task_id: "step", sort_order: 1, status: "pending", title: "Sub A" }),
    createTask({ id: "sub-b", parent_task_id: "step", sort_order: 2, status: "pending", title: "Sub B" }),
  ];

  assert.deepEqual(buildTaskSiblingReorderPlan(tasks, "sub-b", "up"), {
    ok: true,
    orderedTaskIds: ["sub-b", "sub-a"],
    parentTaskId: "step",
    updates: [
      { id: "sub-b", sortOrder: 1 },
      { id: "sub-a", sortOrder: 2 },
    ],
  });
  assert.deepEqual(buildTaskSiblingReorderPlan(tasks, "parent", "up"), { ok: false, reason: "not_child" });
  assert.deepEqual(buildTaskSiblingReorderPlan(tasks, "sub-a", "up"), { ok: false, reason: "boundary" });
});

test("same-parent sibling reorder supports drag-style before and after placement", () => {
  const tasks = [
    createTask({ id: "parent", sort_order: 1, status: "pending", title: "Parent" }),
    createTask({ id: "step-a", parent_task_id: "parent", sort_order: 10, status: "pending", title: "A" }),
    createTask({ id: "step-b", parent_task_id: "parent", sort_order: 20, status: "pending", title: "B" }),
    createTask({ id: "step-c", parent_task_id: "parent", sort_order: 30, status: "pending", title: "C" }),
    createTask({ id: "step-d", parent_task_id: "parent", sort_order: 40, status: "pending", title: "D" }),
  ];

  assert.deepEqual(buildTaskSiblingReorderPlan(tasks, "step-d", { placement: "before", targetTaskId: "step-b" }), {
    ok: true,
    orderedTaskIds: ["step-a", "step-d", "step-b", "step-c"],
    parentTaskId: "parent",
    updates: [
      { id: "step-a", sortOrder: 1 },
      { id: "step-d", sortOrder: 2 },
      { id: "step-b", sortOrder: 3 },
      { id: "step-c", sortOrder: 4 },
    ],
  });

  assert.deepEqual(buildTaskSiblingReorderPlan(tasks, "step-a", { placement: "after", targetTaskId: "step-c" }), {
    ok: true,
    orderedTaskIds: ["step-b", "step-c", "step-a", "step-d"],
    parentTaskId: "parent",
    updates: [
      { id: "step-b", sortOrder: 1 },
      { id: "step-c", sortOrder: 2 },
      { id: "step-a", sortOrder: 3 },
      { id: "step-d", sortOrder: 4 },
    ],
  });
});

test("same-parent sibling reorder drag placement rejects cross-parent and no-op drops", () => {
  const tasks = [
    createTask({ id: "parent", sort_order: 1, status: "pending", title: "Parent" }),
    createTask({ id: "step-a", parent_task_id: "parent", sort_order: 1, status: "pending", title: "A" }),
    createTask({ id: "step-b", parent_task_id: "parent", sort_order: 2, status: "pending", title: "B" }),
    createTask({ id: "other-parent", sort_order: 2, status: "pending", title: "Other Parent" }),
    createTask({ id: "other-step", parent_task_id: "other-parent", sort_order: 1, status: "pending", title: "Other Step" }),
  ];

  assert.deepEqual(buildTaskSiblingReorderPlan(tasks, "step-a", { placement: "before", targetTaskId: "other-step" }), {
    ok: false,
    reason: "boundary",
  });
  assert.deepEqual(buildTaskSiblingReorderPlan(tasks, "step-a", { placement: "before", targetTaskId: "step-b" }), {
    ok: false,
    reason: "boundary",
  });
});

test("child preview visibility collapses only descendants of the chosen step", () => {
  const items = [
    { depth: 1, id: "step-a", parentTaskId: "parent" },
    { depth: 2, id: "substep-a1", parentTaskId: "step-a" },
    { depth: 2, id: "substep-a2", parentTaskId: "step-a" },
    { depth: 1, id: "step-b", parentTaskId: "parent" },
    { depth: 2, id: "substep-b1", parentTaskId: "step-b" },
    { depth: 1, id: "step-c", parentTaskId: "parent" },
  ] as const;

  const visibility = buildChildTaskPreviewVisibility(items as Parameters<typeof buildChildTaskPreviewVisibility>[0], new Set(["step-a"]));

  assert.deepEqual(Array.from(visibility.collapsibleTaskIds).sort(), ["parent", "step-a", "step-b"]);
  assert.deepEqual(visibility.visibleItems.map((item) => item.id), ["step-a", "step-b", "substep-b1", "step-c"]);
});

test("read-only task hierarchy adapter classifies flat tasks as top-level without mutating input", () => {
  const tasks = [
    createTask({
      created_at: "2026-06-18T08:00:00.000Z",
      id: "flat-b",
      sort_order: 2,
      status: "pending",
      title: "Flat B",
    }),
    createTask({
      created_at: "2026-06-18T08:01:00.000Z",
      id: "flat-a",
      sort_order: 1,
      status: "pending",
      title: "Flat A",
    }),
  ];
  const originalOrder = tasks.map((task) => task.id);
  const originalReferences = [...tasks];

  const adapter = buildTaskHierarchyAdapter(tasks);

  assert.deepEqual(adapter.topLevelTaskIds, ["flat-a", "flat-b"]);
  assert.deepEqual(adapter.childTaskIds, []);
  assert.deepEqual(adapter.rootNodes.map((node) => node.task.id), ["flat-a", "flat-b"]);
  assert.deepEqual(adapter.issues, []);
  assert.deepEqual(tasks.map((task) => task.id), originalOrder);
  assert.equal(tasks[0], originalReferences[0]);
  assert.equal(tasks[1], originalReferences[1]);
});

test("read-only task hierarchy adapter detects children, grandchildren, depth, chains, descendants, and sorted siblings", () => {
  const tasks = [
    createTask({
      created_at: "2026-06-18T08:00:00.000Z",
      id: "root",
      sort_order: 0,
      status: "pending",
      title: "Root",
    }),
    createTask({
      created_at: "2026-06-18T08:05:00.000Z",
      id: "child-b",
      parent_task_id: "root",
      sort_order: 20,
      status: "pending",
      title: "Child B",
    }),
    createTask({
      created_at: "2026-06-18T08:04:00.000Z",
      id: "child-a",
      parent_task_id: "root",
      sort_order: 10,
      status: "pending",
      title: "Child A",
    }),
    createTask({
      created_at: "2026-06-18T08:06:00.000Z",
      id: "grandchild",
      parent_task_id: "child-b",
      sort_order: 1,
      status: "pending",
      title: "Grandchild",
    }),
  ];

  const adapter = buildTaskHierarchyAdapter(tasks);

  assert.deepEqual(adapter.topLevelTaskIds, ["root"]);
  assert.deepEqual(adapter.childTaskIds, ["grandchild", "child-a", "child-b"]);
  assert.deepEqual(adapter.validChildTaskIds, ["grandchild", "child-a", "child-b"]);
  assert.deepEqual(adapter.getChildren("root").map((task) => task.id), ["child-a", "child-b"]);
  assert.deepEqual((adapter.childrenByParentId.get("root") ?? []).map((task) => task.id), ["child-a", "child-b"]);
  assert.deepEqual(adapter.getDescendants("root").map((task) => task.id), ["child-a", "child-b", "grandchild"]);
  assert.deepEqual(adapter.getParentChain("grandchild").map((task) => task.id), ["child-b", "root"]);
  assert.equal(adapter.getParent("grandchild")?.id, "child-b");
  assert.equal(adapter.getDepth("root"), 0);
  assert.equal(adapter.getDepth("child-b"), 1);
  assert.equal(adapter.getDepth("grandchild"), 2);
  assert.equal(adapter.getNode("grandchild")?.depth, 2);
  assert.deepEqual(adapter.rootNodes.map((node) => node.task.id), ["root"]);
  assert.deepEqual(adapter.rootNodes[0]?.children.map((node) => node.task.id), ["child-a", "child-b"]);
});

test("read-only task hierarchy adapter classifies missing parents as orphans instead of normal children", () => {
  const orphan = createTask({
    created_at: "2026-06-18T08:00:00.000Z",
    id: "orphan",
    parent_task_id: "missing-parent",
    sort_order: 1,
    status: "pending",
    title: "Orphan",
  });

  const adapter = buildTaskHierarchyAdapter([orphan]);

  assert.deepEqual(adapter.topLevelTaskIds, []);
  assert.deepEqual(adapter.childTaskIds, ["orphan"]);
  assert.deepEqual(adapter.validChildTaskIds, []);
  assert.deepEqual(adapter.orphanTaskIds, ["orphan"]);
  assert.deepEqual(adapter.orphans.map((entry) => entry.missingParentTaskId), ["missing-parent"]);
  assert.equal(adapter.getParent("orphan"), null);
  assert.equal(adapter.getDepth("orphan"), null);
  assert.deepEqual(adapter.rootNodes.map((node) => node.task.id), ["orphan"]);
  assert.deepEqual(adapter.rootNodes[0]?.issueTypes, ["missing_parent"]);
  assert.deepEqual((adapter.rawChildrenByParentId.get("missing-parent") ?? []).map((task) => task.id), ["orphan"]);
  assert.equal(adapter.childrenByParentId.has("missing-parent"), false);
});

test("read-only task hierarchy adapter detects simple and longer cycles without infinite traversal", () => {
  const simpleCycleA = createTask({
    created_at: "2026-06-18T08:00:00.000Z",
    id: "simple-a",
    parent_task_id: "simple-b",
    sort_order: 1,
    status: "pending",
    title: "Simple A",
  });
  const simpleCycleB = createTask({
    created_at: "2026-06-18T08:01:00.000Z",
    id: "simple-b",
    parent_task_id: "simple-a",
    sort_order: 2,
    status: "pending",
    title: "Simple B",
  });
  const longCycleA = createTask({
    created_at: "2026-06-18T08:02:00.000Z",
    id: "long-a",
    parent_task_id: "long-c",
    sort_order: 3,
    status: "pending",
    title: "Long A",
  });
  const longCycleB = createTask({
    created_at: "2026-06-18T08:03:00.000Z",
    id: "long-b",
    parent_task_id: "long-a",
    sort_order: 4,
    status: "pending",
    title: "Long B",
  });
  const longCycleC = createTask({
    created_at: "2026-06-18T08:04:00.000Z",
    id: "long-c",
    parent_task_id: "long-b",
    sort_order: 5,
    status: "pending",
    title: "Long C",
  });

  const adapter = buildTaskHierarchyAdapter([
    simpleCycleA,
    simpleCycleB,
    longCycleA,
    longCycleB,
    longCycleC,
  ]);

  assert.deepEqual(
    adapter.cycles.map((cycle) => cycle.taskId),
    ["simple-a", "simple-b", "long-a", "long-b", "long-c"],
  );
  assert.deepEqual(
    adapter.cycles.find((cycle) => cycle.taskId === "simple-a")?.taskIds,
    ["simple-a", "simple-b", "simple-a"],
  );
  assert.deepEqual(
    adapter.cycles.find((cycle) => cycle.taskId === "long-a")?.taskIds,
    ["long-a", "long-c", "long-b", "long-a"],
  );
  assert.equal(adapter.getDepth("simple-a"), null);
  assert.equal(adapter.getDepth("long-c"), null);
  assert.deepEqual(adapter.getDescendants("simple-a"), []);
  assert.deepEqual(adapter.rootNodes.map((node) => node.task.id), ["simple-a", "simple-b", "long-a", "long-b", "long-c"]);
});

test("read-only task hierarchy adapter does not duplicate valid children as root nodes", () => {
  const root = createTask({
    created_at: "2026-06-18T08:00:00.000Z",
    id: "root",
    sort_order: 1,
    status: "pending",
    title: "Root",
  });
  const child = createTask({
    created_at: "2026-06-18T08:01:00.000Z",
    id: "child",
    parent_task_id: root.id,
    sort_order: 1,
    status: "pending",
    title: "Child",
  });
  const orphan = createTask({
    created_at: "2026-06-18T08:02:00.000Z",
    id: "orphan",
    parent_task_id: "missing-parent",
    sort_order: 2,
    status: "pending",
    title: "Orphan",
  });

  const adapter = buildTaskHierarchyAdapter([root, child, orphan]);

  assert.deepEqual(adapter.topLevelTaskIds, ["root"]);
  assert.deepEqual(adapter.rootNodes.map((node) => node.task.id), ["root", "orphan"]);
  assert.deepEqual(adapter.rootNodes[0]?.children.map((node) => node.task.id), ["child"]);
  assert.equal(adapter.rootNodes.some((node) => node.task.id === "child"), false);
});

test("hierarchy diagnostics classify flat derived tasks as roots without children or invalid links", () => {
  const tasks = [
    createTask({
      created_at: "2026-06-18T08:00:00.000Z",
      id: "flat-b",
      sort_order: 2,
      status: "pending",
      title: "Flat B",
    }),
    createTask({
      created_at: "2026-06-18T08:01:00.000Z",
      id: "flat-a",
      sort_order: 1,
      status: "pending",
      title: "Flat A",
    }),
  ];

  const diagnostics = buildTaskHierarchyDiagnostics(tasks);

  assert.equal(diagnostics.totalTaskCount, 2);
  assert.deepEqual(diagnostics.topLevelTaskIds, ["flat-a", "flat-b"]);
  assert.deepEqual(diagnostics.childTaskIds, []);
  assert.deepEqual(diagnostics.validChildTaskIds, []);
  assert.deepEqual(diagnostics.orphanTaskIds, []);
  assert.deepEqual(diagnostics.cycleTaskIds, []);
  assert.deepEqual(diagnostics.invalidTaskIds, []);
  assert.equal(diagnostics.maxDepth, 0);
  assert.deepEqual(diagnostics.childTaskIdsByParentTaskId, {});
  assert.deepEqual(diagnostics.rawChildTaskIdsByParentTaskId, {});
  assert.deepEqual(diagnostics.depthByTaskId, {
    "flat-a": 0,
    "flat-b": 0,
  });
});

test("primary task visibility keeps roots visible and hides valid descendants", () => {
  const root = createTask({ id: "root", sort_order: 1, status: "pending", title: "Root" });
  const child = createTask({
    id: "child",
    parent_task_id: "root",
    sort_order: 1,
    status: "pending",
    title: "Child",
  });
  const grandchild = createTask({
    id: "grandchild",
    parent_task_id: "child",
    sort_order: 1,
    status: "pending",
    title: "Grandchild",
  });

  const visibility = buildTaskPrimaryVisibility([root, child, grandchild]);

  assert.deepEqual(visibility.primaryVisibleTaskIds, ["root"]);
  assert.deepEqual(visibility.primaryHiddenChildTaskIds, ["child", "grandchild"]);
  assert.deepEqual(visibility.orphanTaskIds, []);
  assert.deepEqual(visibility.cycleTaskIds, []);
  assert.deepEqual(visibility.invalidTaskIds, []);
});

test("primary task visibility keeps orphans and invalid cycles findable as primary rows", () => {
  const root = createTask({ id: "root", sort_order: 1, status: "pending", title: "Root" });
  const orphan = createTask({
    id: "orphan",
    parent_task_id: "missing-parent",
    sort_order: 2,
    status: "pending",
    title: "Orphan",
  });
  const cycleA = createTask({
    id: "cycle-a",
    parent_task_id: "cycle-b",
    sort_order: 3,
    status: "pending",
    title: "Cycle A",
  });
  const cycleB = createTask({
    id: "cycle-b",
    parent_task_id: "cycle-a",
    sort_order: 4,
    status: "pending",
    title: "Cycle B",
  });
  const selfParent = createTask({
    id: "self-parent",
    parent_task_id: "self-parent",
    sort_order: 5,
    status: "pending",
    title: "Self parent",
  });

  const visibility = buildTaskPrimaryVisibility([root, orphan, cycleA, cycleB, selfParent]);

  assert.deepEqual(visibility.primaryVisibleTaskIds, ["root", "orphan", "cycle-a", "cycle-b", "self-parent"]);
  assert.deepEqual(visibility.primaryHiddenChildTaskIds, []);
  assert.deepEqual(visibility.orphanTaskIds, ["orphan"]);
  assert.deepEqual(visibility.cycleTaskIds, ["cycle-a", "cycle-b"]);
  assert.deepEqual(visibility.invalidTaskIds, ["orphan", "cycle-a", "cycle-b", "self-parent"]);
});

test("primary task visibility does not mutate the input task array or task references", () => {
  const tasks = [
    createTask({ id: "root", sort_order: 1, status: "pending", title: "Root" }),
    createTask({
      id: "child",
      parent_task_id: "root",
      sort_order: 1,
      status: "pending",
      title: "Child",
    }),
  ];
  const originalTaskSnapshots = tasks.map((task) => ({ ...task }));
  const originalReferences = [...tasks];

  buildTaskPrimaryVisibility(tasks);

  assert.deepEqual(tasks.map((task) => ({ ...task })), originalTaskSnapshots);
  assert.equal(tasks[0], originalReferences[0]);
  assert.equal(tasks[1], originalReferences[1]);
});

test("hierarchy diagnostics expose child and grandchild depth while primary arrays hide valid descendants", () => {
  const tasks = [
    createTask({
      created_at: "2026-06-18T08:00:00.000Z",
      id: "root",
      sort_order: 1,
      status: "pending",
      title: "Root",
    }),
    createTask({
      created_at: "2026-06-18T08:01:00.000Z",
      id: "child",
      parent_task_id: "root",
      sort_order: 1,
      status: "pending",
      title: "Child",
    }),
    createTask({
      created_at: "2026-06-18T08:02:00.000Z",
      id: "grandchild",
      parent_task_id: "child",
      sort_order: 1,
      status: "pending",
      title: "Grandchild",
    }),
  ];
  const derived = computeDerivedForHierarchyDiagnostics(tasks);

  assert.deepEqual(derived.taskHierarchyDiagnostics.topLevelTaskIds, ["root"]);
  assert.deepEqual(derived.taskHierarchyDiagnostics.childTaskIds, ["child", "grandchild"]);
  assert.deepEqual(derived.taskHierarchyDiagnostics.validChildTaskIds, ["child", "grandchild"]);
  assert.deepEqual(derived.taskHierarchyDiagnostics.childTaskIdsByParentTaskId, {
    child: ["grandchild"],
    root: ["child"],
  });
  assert.equal(derived.taskHierarchyDiagnostics.depthByTaskId.root, 0);
  assert.equal(derived.taskHierarchyDiagnostics.depthByTaskId.child, 1);
  assert.equal(derived.taskHierarchyDiagnostics.depthByTaskId.grandchild, 2);
  assert.equal(derived.taskHierarchyDiagnostics.maxDepth, 2);
  assert.deepEqual(derived.taskPrimaryVisibility.primaryVisibleTaskIds, ["root"]);
  assert.deepEqual(derived.taskPrimaryVisibility.primaryHiddenChildTaskIds, ["child", "grandchild"]);
  assert.deepEqual(derived.filteredTasksSorted.map((task) => task.id), ["root"]);
  assert.deepEqual(derived.activeTasks.map((task) => task.id), ["root"]);
  assert.deepEqual(derived.todayTasks.map((task) => task.id), []);
  assert.deepEqual(derived.overdueTasks.map((task) => task.id), []);
  assert.deepEqual(derived.archiveFilteredTasksSorted.map((task) => task.id), []);
  assert.deepEqual(derived.trashFilteredTasksSorted.map((task) => task.id), []);
  assert.equal(derived.taskStatusCounts.pending, 1);
  assert.equal(derived.visibleListCounts.all, 1);
  assert.deepEqual(derived.childTaskPreviewByParentTaskId.root.items.map((item) => item.id), ["child", "grandchild"]);
});

test("hierarchy diagnostics report missing parents while keeping normal derived arrays flat", () => {
  const root = createTask({
    created_at: "2026-06-18T08:00:00.000Z",
    id: "root",
    sort_order: 1,
    status: "pending",
    title: "Root",
  });
  const orphan = createTask({
    created_at: "2026-06-18T08:01:00.000Z",
    id: "orphan",
    parent_task_id: "missing-parent",
    sort_order: 2,
    status: "pending",
    title: "Orphan",
  });

  const derived = computeDerivedForHierarchyDiagnostics([root, orphan]);

  assert.deepEqual(derived.taskHierarchyDiagnostics.orphanTaskIds, ["orphan"]);
  assert.deepEqual(derived.taskHierarchyDiagnostics.childTaskIds, ["orphan"]);
  assert.deepEqual(derived.taskHierarchyDiagnostics.validChildTaskIds, []);
  assert.deepEqual(derived.taskHierarchyDiagnostics.invalidTaskIds, ["orphan"]);
  assert.deepEqual(derived.taskHierarchyDiagnostics.depthByTaskId, {
    orphan: null,
    root: 0,
  });
  assert.deepEqual(
    [...derived.filteredTasksSorted.map((task) => task.id)].sort(),
    ["orphan", "root"],
  );
  assert.deepEqual(
    [...derived.activeTasks.map((task) => task.id)].sort(),
    ["orphan", "root"],
  );
});

test("home queue count includes unique open today, focus, and priority 5 tasks", () => {
  const today = "2026-07-08";
  const todayOnly = createTask({
    created_at: `${today}T08:00:00.000Z`,
    due_on: today,
    id: "today-only",
    status: "pending",
    title: "Today only",
  });
  const focusOnly = createTask({
    created_at: `${today}T08:05:00.000Z`,
    due_on: "2026-07-09",
    id: "focus-only",
    status: "pending",
    title: "Focus only",
  });
  const priorityOnly = createTask({
    created_at: `${today}T08:10:00.000Z`,
    due_on: "2026-07-09",
    id: "priority-only",
    priority_level: 5,
    status: "pending",
    title: "Priority only",
  });
  const overlap = createTask({
    created_at: `${today}T08:15:00.000Z`,
    due_on: today,
    id: "overlap",
    priority_level: 5,
    status: "pending",
    title: "Overlap",
  });
  const doneToday = createTask({
    created_at: `${today}T08:20:00.000Z`,
    due_on: today,
    id: "done-today",
    status: "done",
    title: "Done today",
  });

  const derived = computeDerivedForQueueCount(
    [todayOnly, focusOnly, priorityOnly, overlap, doneToday],
    [focusOnly.id, overlap.id],
    today,
  );

  assert.equal(derived.todayQueueTaskCount, 4);
  assert.deepEqual(derived.todayTasks.map((task) => task.id), [todayOnly.id, overlap.id]);
});

test("primary derived search returns the parent when only a child task matches", () => {
  const parent = createTask({
    id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Parent",
  });
  const child = createTask({
    id: "child",
    parent_task_id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Needle child",
  });
  const sibling = createTask({
    id: "sibling",
    parent_task_id: "parent",
    sort_order: 2,
    status: "pending",
    title: "Sibling step",
  });

  const derived = computeDerivedForHierarchyDiagnostics([parent, child, sibling], {
    deferredSearchQuery: "needle",
  });

  assert.deepEqual(derived.filteredTasksSorted.map((task) => task.id), ["parent"]);
  assert.deepEqual(derived.searchMatchedStepParentTaskIds, ["parent"]);
  assert.deepEqual(derived.childTaskPreviewByParentTaskId.parent.items.map((item) => item.id), ["child", "sibling"]);
});

test("primary derived search matches task and child tags case-insensitively", () => {
  const taggedParent = createTask({
    id: "tagged-parent",
    sort_order: 1,
    status: "pending",
    tags: ["Hygiene"],
    title: "Brush teeth",
  });
  const taggedChildParent = createTask({
    id: "tagged-child-parent",
    sort_order: 2,
    status: "pending",
    title: "Evening reset",
  });
  const taggedChild = createTask({
    id: "tagged-child",
    parent_task_id: "tagged-child-parent",
    sort_order: 1,
    status: "pending",
    tags: ["HYGIENE"],
    title: "Wash face",
  });

  const derived = computeDerivedForHierarchyDiagnostics([taggedParent, taggedChildParent, taggedChild], {
    deferredSearchQuery: "hygiene",
  });

  assert.deepEqual(derived.filteredTasksSorted.map((task) => task.id), ["tagged-parent", "tagged-child-parent"]);
  assert.deepEqual(derived.searchMatchedStepParentTaskIds, ["tagged-child-parent"]);
});

test("task editor and actual-time lookup still find primary-hidden child tasks from full task data", () => {
  const parent = createTask({
    id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Parent",
  });
  const child = createTask({
    id: "child",
    parent_task_id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Child",
  });

  const derived = computeDerivedForHierarchyDiagnostics([parent, child], {
    taskEditorTaskId: "child",
  });

  assert.deepEqual(derived.filteredTasksSorted.map((task) => task.id), ["parent"]);
  assert.equal(derived.selectedTaskForEditor?.id, "child");
});

test("archive and trash primary arrays hide valid child tasks while keeping invalid rows findable", () => {
  const parent = createTask({
    id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Parent",
  });
  const archivedChild = createTask({
    id: "archived-child",
    parent_task_id: "parent",
    sort_order: 1,
    status: "archived",
    title: "Archived child",
  });
  const trashedChild = createTask({
    id: "trashed-child",
    parent_task_id: "parent",
    sort_order: 2,
    status: "trashed",
    title: "Trashed child",
    trashed_at: new Date().toISOString(),
  });
  const archivedOrphan = createTask({
    id: "archived-orphan",
    parent_task_id: "missing-parent",
    sort_order: 3,
    status: "archived",
    title: "Archived orphan",
  });
  const trashedOrphan = createTask({
    id: "trashed-orphan",
    parent_task_id: "missing-parent",
    sort_order: 4,
    status: "trashed",
    title: "Trashed orphan",
    trashed_at: new Date().toISOString(),
  });

  const derived = computeDerivedForHierarchyDiagnostics([
    parent,
    archivedChild,
    trashedChild,
    archivedOrphan,
    trashedOrphan,
  ]);

  assert.deepEqual(derived.archiveFilteredTasksSorted.map((task) => task.id), ["archived-orphan"]);
  assert.deepEqual(derived.trashFilteredTasksSorted.map((task) => task.id), ["trashed-orphan"]);
  assert.equal(derived.taskStatusCounts.archived, 1);
  assert.equal(derived.taskStatusCounts.trashed, 1);
  assert.deepEqual(
    derived.childTaskPreviewByParentTaskId.parent.items.map((item) => item.id),
    ["archived-child", "trashed-child"],
  );
});

test("hierarchy diagnostics report simple cycles without infinite loops", () => {
  const cycleA = createTask({
    created_at: "2026-06-18T08:00:00.000Z",
    id: "cycle-a",
    parent_task_id: "cycle-b",
    sort_order: 1,
    status: "pending",
    title: "Cycle A",
  });
  const cycleB = createTask({
    created_at: "2026-06-18T08:01:00.000Z",
    id: "cycle-b",
    parent_task_id: "cycle-a",
    sort_order: 2,
    status: "pending",
    title: "Cycle B",
  });

  const diagnostics = buildTaskHierarchyDiagnostics([cycleA, cycleB]);

  assert.deepEqual(diagnostics.topLevelTaskIds, []);
  assert.deepEqual(diagnostics.childTaskIds, ["cycle-a", "cycle-b"]);
  assert.deepEqual(diagnostics.validChildTaskIds, []);
  assert.deepEqual(diagnostics.cycleTaskIds, ["cycle-a", "cycle-b"]);
  assert.deepEqual(diagnostics.invalidTaskIds, ["cycle-a", "cycle-b"]);
  assert.equal(diagnostics.maxDepth, 0);
  assert.deepEqual(diagnostics.depthByTaskId, {
    "cycle-a": null,
    "cycle-b": null,
  });
  assert.deepEqual(
    diagnostics.cycleSummaries.map((cycle) => cycle.taskIds),
    [
      ["cycle-a", "cycle-b", "cycle-a"],
      ["cycle-b", "cycle-a", "cycle-b"],
    ],
  );
});

test("hierarchy diagnostics do not mutate the input task array or task references", () => {
  const tasks = [
    createTask({
      created_at: "2026-06-18T08:00:00.000Z",
      id: "root",
      sort_order: 2,
      status: "pending",
      title: "Root",
    }),
    createTask({
      created_at: "2026-06-18T08:01:00.000Z",
      id: "child",
      parent_task_id: "root",
      sort_order: 1,
      status: "pending",
      title: "Child",
    }),
  ];
  const originalTaskSnapshots = tasks.map((task) => ({ ...task }));
  const originalReferences = [...tasks];

  buildTaskHierarchyDiagnostics(tasks);

  assert.deepEqual(tasks.map((task) => ({ ...task })), originalTaskSnapshots);
  assert.equal(tasks[0], originalReferences[0]);
  assert.equal(tasks[1], originalReferences[1]);
});

test("child task preview lookup exposes direct same-table children", () => {
  const parent = createTask({
    created_at: "2026-06-18T08:00:00.000Z",
    id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Parent",
  });
  const child = createTask({
    actual_seconds: 900,
    created_at: "2026-06-18T08:01:00.000Z",
    due_on: "2026-06-19",
    due_time: "09:30",
    energy: "low",
    estimated_minutes: 25,
    external_link_label: "Brief",
    external_link_url: "https://example.com/brief",
    id: "child",
    is_important: true,
    notes: "Bring the small pieces together.",
    parent_task_id: "parent",
    repeat_frequency: "weekly",
    repeat_interval: 2,
    repeat_days_of_week: [1, 3],
    scheduled_on: "2026-06-20",
    sort_order: 1,
    status: "in_progress",
    tags: ["setup", "draft"],
    title: "Child",
  });

  const preview = buildChildTaskPreviewLookup([parent, child]);

  assert.deepEqual(Object.keys(preview), ["parent"]);
  assert.equal(preview.parent.summary.directChildCount, 1);
  assert.equal(preview.parent.summary.descendantCount, 1);
  assert.equal(preview.parent.summary.hasInvalidDescendants, false);
  assert.deepEqual(preview.parent.items, [{
    actualSeconds: 900,
    createdAt: "2026-06-18T08:01:00.000Z",
    currentStreak: 0,
    depth: 1,
    dueOn: "2026-06-19",
    dueTime: "09:30",
    energy: "low",
    estimatedMinutes: 25,
    id: "child",
    isFocused: false,
    issueTypes: [],
    lastDoneAt: null,
    lastDoneDate: null,
    lastHandledAt: null,
    lastHandledDate: null,
    linkLabel: "Brief",
    linkUrl: "https://example.com/brief",
    missedStreak: 0,
    notes: "Bring the small pieces together.",
    parentTaskId: "parent",
    pinnedAt: null,
    priorityFlags: ["4"],
    repeat: "weekly",
    repeatDayOfMonth: null,
    repeatDaysOfWeek: [1, 3],
    repeatInterval: 2,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
    scheduledOn: "2026-06-20",
    status: "in_progress",
    storedStatus: "in_progress",
    tags: ["setup", "draft"],
    title: "Child",
    updatedAt: "2026-06-18T08:01:00.000Z",
  }]);
});

test("child task preview lookup computes child task streak stats from child history", () => {
  const parent = createTask({
    created_at: "2026-06-18T08:00:00.000Z",
    id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Parent",
  });
  const child = createTask({
    created_at: "2026-06-18T08:01:00.000Z",
    id: "child",
    parent_task_id: "parent",
    repeat_frequency: "daily",
    sort_order: 1,
    status: "pending",
    title: "Child",
  });
  const history: TaskHistory[] = [
    {
      created_at: "2026-06-16T12:00:00.000Z",
      entry_date: "2026-06-16",
      id: "history-1",
      status: "did_my_best",
      task_id: "child",
      updated_at: "2026-06-16T12:00:00.000Z",
      user_id: "test-user",
      was_completed: true,
    },
    {
      created_at: "2026-06-17T12:00:00.000Z",
      entry_date: "2026-06-17",
      id: "history-2",
      status: "did_my_best",
      task_id: "child",
      updated_at: "2026-06-17T12:00:00.000Z",
      user_id: "test-user",
      was_completed: true,
    },
  ];

  const preview = buildChildTaskPreviewLookup([parent, child], [], { child: history }, "2026-06-18");

  assert.equal(preview.parent.items[0].currentStreak, 2);
  assert.equal(preview.parent.items[0].lastDoneAt, "2026-06-17T12:00:00.000Z");
  assert.equal(preview.parent.items[0].lastDoneDate, "2026-06-17");
  assert.equal(preview.parent.items[0].missedStreak, 0);
});

test("child task preview lookup is depth-aware for grandchildren", () => {
  const parent = createTask({ id: "parent", sort_order: 1, status: "pending", title: "Parent" });
  const child = createTask({
    id: "child",
    parent_task_id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Child",
  });
  const grandchild = createTask({
    id: "grandchild",
    parent_task_id: "child",
    sort_order: 1,
    status: "done",
    title: "Grandchild",
  });

  const preview = buildChildTaskPreviewLookup([parent, child, grandchild], ["grandchild"]);

  assert.deepEqual(preview.parent.items.map((item) => item.id), ["child", "grandchild"]);
  assert.deepEqual(preview.parent.items.map((item) => item.depth), [1, 2]);
  assert.deepEqual(preview.parent.items.map((item) => formatChildTaskPreviewDepthLabel(item.depth)), ["Step", "Substep"]);
  assert.deepEqual(preview.parent.items[1]?.priorityFlags, ["3"]);
  assert.equal(preview.parent.items[1]?.isFocused, true);
  assert.equal(preview.child.summary.directChildCount, 1);
  assert.deepEqual(preview.child.items.map((item) => item.id), ["grandchild"]);
  assert.deepEqual(preview.child.items.map((item) => item.depth), [1]);
});

test("child task preview lookup is built from the full task list", () => {
  const parent = createTask({
    due_on: "2026-06-18",
    id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Parent",
  });
  const child = createTask({
    due_on: "2026-06-21",
    id: "child",
    parent_task_id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Child outside current bucket",
  });

  const previewFromVisibleSubset = buildChildTaskPreviewLookup([parent]);
  const previewFromFullTasks = buildChildTaskPreviewLookup([parent, child]);

  assert.equal(previewFromVisibleSubset.parent, undefined);
  assert.deepEqual(previewFromFullTasks.parent.items.map((item) => item.id), ["child"]);
});

test("child task preview lookup keeps sibling and descendant order stable by sort order", () => {
  const parent = createTask({ id: "parent", sort_order: 1, status: "pending", title: "Parent" });
  const secondChild = createTask({
    created_at: "2026-06-18T08:01:00.000Z",
    id: "second-child",
    parent_task_id: "parent",
    sort_order: 2,
    status: "pending",
    title: "Second child",
  });
  const firstChild = createTask({
    created_at: "2026-06-18T08:02:00.000Z",
    id: "first-child",
    parent_task_id: "parent",
    sort_order: 1,
    status: "pending",
    title: "First child",
  });
  const grandchild = createTask({
    id: "grandchild",
    parent_task_id: "first-child",
    sort_order: 1,
    status: "pending",
    title: "Grandchild",
  });

  const preview = buildChildTaskPreviewLookup([parent, secondChild, firstChild, grandchild]);

  assert.deepEqual(preview.parent.items.map((item) => item.id), ["first-child", "grandchild", "second-child"]);
  assert.deepEqual(preview.parent.items.map((item) => `${item.id}:${item.depth}`), ["first-child:1", "grandchild:2", "second-child:1"]);
});

test("child task preview lookup does not recurse through cycles", () => {
  const cycleA = createTask({
    id: "cycle-a",
    parent_task_id: "cycle-b",
    sort_order: 1,
    status: "pending",
    title: "Cycle A",
  });
  const cycleB = createTask({
    id: "cycle-b",
    parent_task_id: "cycle-a",
    sort_order: 2,
    status: "pending",
    title: "Cycle B",
  });

  const preview = buildChildTaskPreviewLookup([cycleA, cycleB]);

  assert.deepEqual(preview["cycle-a"]?.items, []);
  assert.deepEqual(preview["cycle-b"]?.items, []);
  assert.equal(preview["cycle-a"]?.summary.hasInvalidDescendants, true);
  assert.equal(preview["cycle-b"]?.summary.hasInvalidDescendants, true);
  assert.equal(preview["cycle-a"]?.summary.invalidChildLinkCount, 1);
  assert.equal(preview["cycle-b"]?.summary.invalidChildLinkCount, 1);
});

test("child task preview lookup does not attach orphans under missing parents", () => {
  const orphan = createTask({
    id: "orphan",
    parent_task_id: "missing-parent",
    sort_order: 1,
    status: "pending",
    title: "Orphan",
  });

  const preview = buildChildTaskPreviewLookup([orphan]);

  assert.equal(preview["missing-parent"], undefined);
  assert.equal(preview.orphan, undefined);
});

test("child task preview lookup does not mutate the input task array or task references", () => {
  const tasks = [
    createTask({
      id: "parent",
      sort_order: 2,
      status: "pending",
      title: "Parent",
    }),
    createTask({
      id: "child",
      parent_task_id: "parent",
      sort_order: 1,
      status: "pending",
      title: "Child",
    }),
  ];
  const originalTaskSnapshots = tasks.map((task) => ({ ...task }));
  const originalReferences = [...tasks];

  buildChildTaskPreviewLookup(tasks);

  assert.deepEqual(tasks.map((task) => ({ ...task })), originalTaskSnapshots);
  assert.equal(tasks[0], originalReferences[0]);
  assert.equal(tasks[1], originalReferences[1]);
});

test("child task creation draft includes parent_task_id and default task fields", () => {
  const result = buildChildTaskCreationDraft({
    parentTaskId: "parent",
    title: "Child task",
  });

  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.equal(result.draft?.parent_task_id, "parent");
  assert.equal(result.draft?.title, "Child task");
  assert.equal(result.draft?.status, "pending");
  assert.equal(result.draft?.priority, "normal");
  assert.equal(result.draft?.energy, "none");
  assert.deepEqual(result.draft?.tags, []);
  assert.deepEqual(result.draft?.repeat_days_of_week, []);
  assert.equal(result.draft?.repeat_frequency, "none");
  assert.equal(result.draft?.repeat_interval, 1);
});

test("child task creation draft rejects blank titles", () => {
  const result = buildChildTaskCreationDraft({
    parentTaskId: "parent",
    title: "   ",
  });

  assert.deepEqual(result, { draft: null, error: "empty_title", ok: false });
});

test("child task creation draft trims whitespace", () => {
  const result = buildChildTaskCreationDraft({
    parentTaskId: "parent",
    title: "  Trimmed child  ",
  });

  assert.equal(result.ok, true);
  assert.equal(result.draft?.title, "Trimmed child");
});

test("child task creation draft allows grandchildren under child task ids", () => {
  const result = buildChildTaskCreationDraft({
    parentTaskId: "child",
    title: "Grandchild",
  });

  assert.equal(result.ok, true);
  assert.equal(result.draft?.parent_task_id, "child");
  assert.equal(result.draft?.title, "Grandchild");
});

test("child task creation draft blocks cycle participants", () => {
  const result = buildChildTaskCreationDraft({
    blockedParentTaskIds: ["cycle-parent"],
    parentTaskId: "cycle-parent",
    title: "Blocked child",
  });

  assert.deepEqual(result, { draft: null, error: "blocked_parent", ok: false });
});

test("guarded task update succeeds when the expected revision still matches", async () => {
  const task = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-guarded-success",
    notes: "Before",
    revision: 3,
    sort_order: 1,
    status: "pending",
    title: "Before",
  });
  const client = createTaskUpdateTestClient(task);

  const result = await updateTaskRowWithLegacyEnergyFallback(
    client as never,
    task.id,
    { notes: "After" },
    () => false,
    () => false,
    { expectedTask: task },
  );

  assert.equal(result.error, null);
  assert.equal(result.conflict, null);
  assert.equal(result.reappliedOnLatestRevision, false);
  assert.equal(result.data?.notes, "After");
  assert.equal(result.data?.revision, 4);
  assert.equal(client.getUpdateAttemptCount(), 1);
});

test("guarded task update reports a same-field remote conflict without retrying the write", async () => {
  const expectedTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-same-field-conflict",
    notes: "Before",
    revision: 3,
    sort_order: 1,
    status: "pending",
    title: "Before",
  });
  const remoteTask = {
    ...expectedTask,
    revision: 4,
    title: "Remote title",
  };
  const client = createTaskUpdateTestClient(remoteTask);

  const result = await updateTaskRowWithLegacyEnergyFallback(
    client as never,
    expectedTask.id,
    { title: "Local title" },
    () => false,
    () => false,
    { expectedTask },
  );

  assert.equal(result.data, null);
  assert.equal(result.error, null);
  assert.equal(result.reappliedOnLatestRevision, false);
  assert.equal(result.conflict?.reason, "same_field_changed_remotely");
  assert.deepEqual(result.conflict?.conflictingFields, ["title"]);
  assert.equal(result.conflict?.attemptedReapply, false);
  assert.equal(result.conflict?.latestTask?.title, "Remote title");
  assert.equal(client.getUpdateAttemptCount(), 1);
});

test("guarded task update treats an already-applied same-field write as success", async () => {
  const expectedTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-already-applied",
    notes: "Before",
    revision: 3,
    sort_order: 1,
    status: "pending",
    title: "Before",
  });
  const remoteTask = {
    ...expectedTask,
    notes: "After",
    revision: 4,
  };
  const client = createTaskUpdateTestClient(remoteTask);

  const result = await updateTaskRowWithLegacyEnergyFallback(
    client as never,
    expectedTask.id,
    { notes: "After" },
    () => false,
    () => false,
    { expectedTask },
  );

  assert.equal(result.error, null);
  assert.equal(result.conflict, null);
  assert.equal(result.reappliedOnLatestRevision, false);
  assert.equal(result.data?.notes, "After");
  assert.equal(result.data?.revision, 4);
  assert.equal(client.getUpdateAttemptCount(), 1);
});

test("single-task rewards preserve the shared streak-tier dice mapping", () => {
  const task = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-on-time",
    sort_order: 1,
    status: "done",
    title: "On-time task",
  });

  const reward = buildSingleTaskReward([task], [] as never, "2026-06-12");
  assert.equal(reward?.tier?.id, "on_time");
  assert.equal(reward?.diceCount, 1);
  assert.equal(resolveTaskRewardTier(14).diceCount, 5);
  assert.equal(resolveTaskRewardTier(30).diceCount, 6);
});

test("banked rewards sum pending dice across individual streak-based rewards", () => {
  const firstTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-three-dice",
    sort_order: 1,
    status: "done",
    title: "Three dice task",
  });
  const secondTask = createTask({
    created_at: "2026-06-11T12:01:00.000Z",
    id: "task-five-dice",
    sort_order: 2,
    status: "done",
    title: "Five dice task",
  });

  const firstReward = {
    ...buildSingleTaskReward([firstTask], [] as never, "2026-06-12")!,
    diceCount: 3,
  };
  const secondReward = {
    ...buildSingleTaskReward([secondTask], [] as never, "2026-06-12")!,
    diceCount: 5,
  };

  assert.equal(getPendingRewardDiceCount([firstReward, secondReward]), 8);
});

test("banked reward sessions chunk visual dice batches at six without losing totals", () => {
  const makeReward = (taskId: string, title: string, diceCount: number) => ({
    claimRefs: [{ subtaskId: null, taskId, title }],
    createdAt: "2026-06-12T12:00:00.000Z",
    diceCount,
    mode: "single" as const,
    rewardDate: "2026-06-12",
    streakLength: diceCount,
    tasks: [createTask({
      created_at: "2026-06-11T12:00:00.000Z",
      id: taskId,
      sort_order: 1,
      status: "done",
      title,
    })],
    tier: null,
  });
  let callIndex = 0;
  const scriptedRolls = [
    [1, 2, 3],
    [2],
    [4, 5, 6, 1, 2],
    [3],
    [6, 5, 4, 3, 2, 1, 6],
    [4],
  ];
  const rollDice = (count: number) => {
    const next = scriptedRolls[callIndex] ?? [];
    callIndex += 1;
    assert.equal(next.length, count);
    return next;
  };

  const session = buildTaskRewardBankSession([
    makeReward("task-a", "Task A", 3),
    makeReward("task-b", "Task B", 5),
    makeReward("task-c", "Task C", 7),
  ], rollDice);

  assert.deepEqual(session.baseRollBatches, [
    [1, 2, 3, 4, 5, 6],
    [1, 2, 6, 5, 4, 3],
    [2, 1, 6],
  ]);
  assert.equal(session.diceCount, 15);
  assert.equal(session.totalBasePoints, 51);
  assert.equal(session.totalFinalPoints, 174);
  assert.equal(session.totalXp, 87);
  assert.equal(session.totalTokens, 3);
});

test("guarded task update safely reapplies a low-risk patch onto the latest revision", async () => {
  const expectedTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-safe-reapply",
    notes: "Before",
    revision: 3,
    sort_order: 1,
    status: "pending",
    title: "Before",
  });
  const remoteTask = {
    ...expectedTask,
    energy: "high" as const,
    revision: 4,
  };
  const client = createTaskUpdateTestClient(remoteTask);

  const result = await updateTaskRowWithLegacyEnergyFallback(
    client as never,
    expectedTask.id,
    { title: "Local title" },
    () => false,
    () => false,
    { expectedTask },
  );

  assert.equal(result.error, null);
  assert.equal(result.conflict, null);
  assert.equal(result.reappliedOnLatestRevision, true);
  assert.equal(result.data?.title, "Local title");
  assert.equal(result.data?.energy, "high");
  assert.equal(result.data?.revision, 5);
  assert.equal(client.getLatestTaskSnapshot().energy, "high");
  assert.equal(client.getUpdateAttemptCount(), 2);
});

test("guarded task update does not reapply a stale high-risk patch", async () => {
  const expectedTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-high-risk-conflict",
    notes: "Before",
    revision: 3,
    sort_order: 1,
    status: "pending",
    title: "Before",
  });
  const remoteTask = {
    ...expectedTask,
    revision: 4,
    status: "in_progress" as const,
  };
  const client = createTaskUpdateTestClient(remoteTask);

  const result = await updateTaskRowWithLegacyEnergyFallback(
    client as never,
    expectedTask.id,
    { status: "done" },
    () => false,
    () => false,
    { expectedTask },
  );

  assert.equal(result.data, null);
  assert.equal(result.error, null);
  assert.equal(result.reappliedOnLatestRevision, false);
  assert.equal(result.conflict?.reason, "high_risk_patch");
  assert.deepEqual(result.conflict?.conflictingFields, ["status"]);
  assert.equal(result.conflict?.attemptedReapply, false);
  assert.equal(client.getUpdateAttemptCount(), 1);
  assert.equal(client.getLatestTaskSnapshot().status, "in_progress");
});

test("guarded task delete succeeds when the expected revision still matches", async () => {
  const task = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-delete-success",
    revision: 6,
    sort_order: 1,
    status: "archived",
    title: "Delete me",
  });
  const client = createTaskUpdateTestClient(task);

  const result = await deleteTaskRow(
    client as never,
    task.id,
    { expectedTask: task },
  );

  assert.equal(result.error, null);
  assert.equal(result.conflict, null);
  assert.equal(result.data?.id, task.id);
  assert.equal(client.getLatestTaskSnapshot(), null);
  assert.equal(client.getDeleteAttemptCount(), 1);
});

test("guarded task delete refreshes the latest row when the revision changed first", async () => {
  const expectedTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-delete-conflict",
    revision: 3,
    sort_order: 1,
    status: "archived",
    title: "Delete me",
  });
  const remoteTask = {
    ...expectedTask,
    revision: 4,
    title: "Changed remotely",
  };
  const client = createTaskUpdateTestClient(remoteTask);

  const result = await deleteTaskRow(
    client as never,
    expectedTask.id,
    { expectedTask },
  );

  assert.equal(result.data, null);
  assert.equal(result.error, null);
  assert.equal(result.conflict?.reason, "stale_revision_race");
  assert.equal(result.conflict?.latestTask?.title, "Changed remotely");
  assert.equal(client.getLatestTaskSnapshot()?.title, "Changed remotely");
  assert.equal(client.getDeleteAttemptCount(), 1);
});

function createTaskUpdateTestClient(initialTask: ReturnType<typeof createTask>) {
  let currentTask = { ...initialTask };
  let pendingUpdateValues: Record<string, unknown> = {};
  let pendingId: string | null = null;
  let pendingRevision: number | undefined;
  let updateAttemptCount = 0;
  let deleteAttemptCount = 0;

  return {
    from() {
      return {
        delete() {
          pendingId = null;
          pendingRevision = undefined;

          return {
            eq(field: string, value: string | number) {
              if (field === "id" && typeof value === "string") {
                pendingId = value;
              }
              if (field === "revision" && typeof value === "number") {
                pendingRevision = value;
              }

              return this;
            },
            is() {
              return this;
            },
            select() {
              return {
                maybeSingle: async () => {
                  deleteAttemptCount += 1;

                  if (!currentTask || pendingId !== currentTask.id) {
                    return { data: null, error: null };
                  }

                  if (pendingRevision !== undefined && currentTask.revision !== pendingRevision) {
                    return { data: null, error: null };
                  }

                  const deletedTask = { ...currentTask };
                  currentTask = null as unknown as typeof currentTask;
                  return {
                    data: deletedTask,
                    error: null,
                  };
                },
              };
            },
          };
        },
        select() {
          return {
            eq(field: string, value: string) {
              if (field === "id") {
                pendingId = value;
              }

              return {
                is() {
                  return this;
                },
                maybeSingle: async () => ({
                  data: currentTask && pendingId === currentTask.id ? { ...currentTask } : null,
                  error: null,
                }),
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          pendingUpdateValues = values;
          pendingId = null;
          pendingRevision = undefined;

          return {
            eq(field: string, value: string | number) {
              if (field === "id" && typeof value === "string") {
                pendingId = value;
              }
              if (field === "revision" && typeof value === "number") {
                pendingRevision = value;
              }

              return this;
            },
            is() {
              return this;
            },
            select() {
              return {
                maybeSingle: async () => {
                  updateAttemptCount += 1;

                  if (!currentTask || pendingId !== currentTask.id) {
                    return { data: null, error: null };
                  }

                  if (pendingRevision !== undefined && currentTask.revision !== pendingRevision) {
                    return { data: null, error: null };
                  }

                  currentTask = {
                    ...currentTask,
                    ...pendingUpdateValues,
                  };

                  return {
                    data: { ...currentTask },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
    getLatestTaskSnapshot() {
      return currentTask ? { ...currentTask } : null;
    },
    getDeleteAttemptCount() {
      return deleteAttemptCount;
    },
    getUpdateAttemptCount() {
      return updateAttemptCount;
    },
  };
}

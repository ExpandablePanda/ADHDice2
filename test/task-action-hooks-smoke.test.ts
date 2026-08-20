import test from "node:test";
import assert from "node:assert/strict";
import { useTaskRoutingActions } from "../src/hooks/useTaskRoutingActions.ts";
import { mergeTasksById, useTaskCrudActions } from "../src/hooks/useTaskCrudActions.ts";
import { useTaskUpdateAction } from "../src/hooks/useTaskUpdateAction.ts";
import { useTaskEditorSaveAction } from "../src/hooks/useTaskEditorSaveAction.ts";
import { useTaskBatchEditAction } from "../src/hooks/useTaskBatchEditAction.ts";
import { useTaskHistoryActions } from "../src/hooks/useTaskHistoryActions.ts";
import { useTaskNoteLinkActions } from "../src/hooks/useTaskNoteLinkActions.ts";
import { useTaskSubtaskActions } from "../src/hooks/useTaskSubtaskActions.ts";
import { useTaskActions } from "../src/hooks/useTaskActions.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { TaskHistory } from "../src/lib/database.types.ts";
import { resolveActiveTaskStatuses } from "../src/lib/task-state-engine/read-authority.ts";
import type { TaskListManualMembership as DbTaskListManualMembership } from "../src/lib/database.types.ts";
import type { TaskListManualMembership } from "../src/lib/task-lists.ts";

test("action hooks expose expected callable actions", async () => {
  let routingState: Record<string, "inbox" | "today" | "quick_wins" | "waiting" | "later"> = {};
  const setTaskRouting = (updater: (current: typeof routingState) => typeof routingState) => {
    routingState = updater(routingState);
  };

  const routing = useTaskRoutingActions({
    client: {} as never,
    currentUserId: "u1",
    isMissingTaskListManualMembershipsTableError: () => false,
    manualMembershipsByTaskId: {},
    mapTaskListManualMembershipRow: (row: DbTaskListManualMembership) => row as unknown as TaskListManualMembership,
    setMessage: () => {},
    setTaskListManualMemberships: () => {},
    setTaskRouting: setTaskRouting as never,
    taskListManualMemberships: [],
  });

  routing.routeTask("task-1", "today");
  assert.equal(routingState["task-1"], "today");
  routing.routeTask("task-1", null);
  assert.equal("task-1" in routingState, false);

  const crud = useTaskCrudActions({
    client: {} as never,
    currentUserId: "u1",
    deleteTaskRow: async () => ({ conflict: null, data: null, error: null }),
    setMessage: () => {},
    setTaskRouting: () => {},
    setTasks: () => {},
    shouldRouteTaskToInbox: () => false,
    sortTasksForUi: (tasks) => tasks,
    tasks: [],
    updateTaskRowWithLegacyEnergyFallback: async () => ({
      conflict: null,
      data: null,
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });
  assert.equal(typeof crud.importTasks, "function");
  assert.equal(typeof crud.deleteTasks, "function");

  let quickEditReconcileCalls = 0;
  const update = useTaskUpdateAction({
    currentDayKey: "2026-06-21",
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => {
      quickEditReconcileCalls += 1;
      return true;
    },
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => {
      dueOnlyHistorySyncCalls += 1;
      return true;
    },
    tasks: [],
    updateTaskRowWithLegacyEnergyFallback: async () => ({
      conflict: null,
      data: createTask({
        created_at: "2026-05-20T00:00:00.000Z",
        due_on: "2026-06-10",
        id: "task-update",
        repeat_frequency: "daily_until_complete",
        sort_order: 1,
        status: "pending",
        title: "Task",
      }),
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });
  assert.equal(typeof update.updateTask, "function");
  await update.updateTask("task-update", { due_on: "2026-06-10" });
  assert.equal(quickEditReconcileCalls, 1);

  const editor = useTaskEditorSaveAction({
    currentDayKey: "2026-06-21",
    focusedTaskIds: [],
    currentUserId: "u1",
    insertTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedEnergyFallback: false }),
    onTasksCompleted: async () => {},
    replaceTaskSubtasks: async () => ({ saved: true }),
    reconcileOverdueTaskMisses: async () => true,
    saveFocusSelection: async () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => {
      dueOnlyHistorySyncCalls += 1;
      return true;
    },
    syncTaskNoteLinks: async () => true,
    tasks: [],
    updateTaskRowWithLegacyEnergyFallback: async () => ({
      conflict: null,
      data: null,
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });
  assert.equal(typeof editor.saveTaskEditor, "function");

  const history = useTaskHistoryActions({
    client: {} as never,
    currentUserId: "u1",
    currentDayKey: "2026-06-11",
    dayStartTime: "06:00",
    isTaskCompletedForHistory: () => false,
    isTaskHistoryStatus: () => false,
    mapTaskHistoryRow: (row) => row,
    now: new Date("2026-06-11T12:00:00.000Z"),
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    tasks: [],
    timezone: "America/New_York",
    updateTaskRowWithLegacyEnergyFallback: async () => ({
      conflict: null,
      data: null,
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });
  assert.equal(typeof history.syncTaskHistoryEntry, "function");
  assert.equal(typeof history.syncTaskHistoryEntries, "function");

  const noteLinks = useTaskNoteLinkActions({
    client: {} as never,
    currentUserId: "u1",
    setAvailableTaskNotes: () => {},
    setMessage: () => {},
  });
  assert.equal(typeof noteLinks.syncTaskNoteLinks, "function");

  const subtasks = useTaskSubtaskActions({
    client: {} as never,
    currentUserId: "u1",
    canonicalTaskStateUpdate: async () => true,
    setMessage: () => {},
    setTasks: () => {},
    tasks: [],
  });
  assert.equal(typeof subtasks.replaceTaskSubtasks, "function");
  assert.equal(typeof subtasks.addTaskSubtask, "function");
  assert.equal(typeof subtasks.addChildTaskSubtask, "function");
  assert.equal(typeof subtasks.updateTaskSubtaskStatus, "function");
  assert.equal(typeof subtasks.renameTaskSubtask, "function");
  assert.equal(typeof subtasks.deleteTaskSubtask, "function");

  const actions = useTaskActions({
    crud: {
      client: {} as never,
      currentUserId: "u1",
      deleteTaskRow: async () => ({ conflict: null, data: null, error: null }),
      setMessage: () => {},
      setTaskRouting: () => {},
      setTasks: () => {},
      shouldRouteTaskToInbox: () => false,
      sortTasksForUi: (tasks) => tasks,
      tasks: [],
      updateTaskRowWithLegacyEnergyFallback: async () => ({
        conflict: null,
        data: null,
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      }),
    },
    create: {
      client: {} as never,
      currentUserId: "u1",
      setMessage: () => {},
      setTasks: () => {},
      shouldRouteTaskToInbox: () => false,
      sortTasksForUi: (tasks) => tasks,
    },
    editorSave: {
      currentUserId: "u1",
      focusedTaskIds: [],
      insertTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedEnergyFallback: false }),
      onTasksCompleted: async () => {},
      saveFocusSelection: async () => {},
      setMessage: () => {},
      setTasks: () => {},
      sortTasksForUi: (tasks) => tasks,
      tasks: [],
      updateTaskRowWithLegacyEnergyFallback: async () => ({
        conflict: null,
        data: null,
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      }),
    },
    batchEdit: {
      clearListTaskSelection: () => {},
      focusedTaskIds: [],
      onTasksCompleted: async () => {},
      parseDayOfMonth: () => null,
      parsePositiveInteger: () => null,
      selectedListTasks: [],
      setBatchEditProgress: () => {},
      setIsBatchEditModalOpen: () => {},
      setMessage: () => {},
      setTasks: () => {},
      sortTasksForUi: (tasks) => tasks,
      tasks: [],
      updateTaskRowWithLegacyEnergyFallback: async () => ({
        conflict: null,
        data: null,
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      }),
    },
    history: {
      client: {} as never,
      currentUserId: "u1",
      currentDayKey: "2026-06-11",
      dayStartTime: "06:00",
      isTaskCompletedForHistory: () => false,
      isTaskHistoryStatus: () => false,
      mapTaskHistoryRow: (row) => row,
      now: new Date("2026-06-11T12:00:00.000Z"),
      setMessage: () => {},
      setTaskHistory: () => {},
      setTasks: () => {},
      sortTasksForUi: (tasks) => tasks,
      tasks: [],
      timezone: "America/New_York",
      updateTaskRowWithLegacyEnergyFallback: async () => ({
        conflict: null,
        data: null,
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      }),
    },
    noteLinks: {
      client: {} as never,
      currentUserId: "u1",
      setAvailableTaskNotes: () => {},
      setMessage: () => {},
    },
    routing: {
      client: {} as never,
      currentUserId: "u1",
      isMissingTaskListManualMembershipsTableError: () => false,
      manualMembershipsByTaskId: {},
      mapTaskListManualMembershipRow: (row: DbTaskListManualMembership) => row as unknown as TaskListManualMembership,
      setMessage: () => {},
      setTaskListManualMemberships: () => {},
      setTaskRouting: () => {},
      taskListManualMemberships: [],
    },
    subtask: {
      client: {} as never,
      currentUserId: "u1",
      canonicalTaskStateUpdate: async () => true,
      setMessage: () => {},
      setTasks: () => {},
      tasks: [],
    },
    update: {
      onTasksCompleted: async () => {},
      reconcileOverdueTaskMisses: async () => true,
      setMessage: () => {},
      setTasks: () => {},
      sortTasksForUi: (tasks) => tasks,
      tasks: [],
      updateTaskRowWithLegacyEnergyFallback: async () => ({
        conflict: null,
        data: null,
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      }),
    },
  });
  assert.equal(typeof actions.updateTask, "function");
  assert.equal(typeof actions.saveTaskEditor, "function");
  assert.equal(typeof actions.applyBatchTaskEdit, "function");
});

test("import task merge replaces existing rows by task id", () => {
  const existingTask = createTask({
    created_at: "2026-06-12T12:00:00.000Z",
    id: "task-imported",
    sort_order: 1,
    status: "pending",
    title: "Already refreshed",
  });
  const importedTask = {
    ...existingTask,
    title: "Imported server row",
    updated_at: "2026-06-12T12:01:00.000Z",
  };
  const otherTask = createTask({
    created_at: "2026-06-12T11:00:00.000Z",
    id: "task-other",
    sort_order: 2,
    status: "pending",
    title: "Other task",
  });

  const merged = mergeTasksById([existingTask, otherTask], [importedTask]);

  assert.equal(merged.length, 2);
  assert.equal(merged.filter((task) => task.id === "task-imported").length, 1);
  assert.equal(merged.find((task) => task.id === "task-imported")?.title, "Imported server row");
  assert.equal(merged.find((task) => task.id === "task-other")?.title, "Other task");
});

test("canonical child completion writes the child Task state directly", async () => {
  const parentTask = createTask({
    created_at: "2026-06-11T08:00:00.000Z",
    due_on: "2026-06-11",
    id: "task-parent",
    repeat_frequency: "daily",
    sort_order: 1,
    status: "pending",
    subtasks_auto_reset: true,
    title: "Parent task",
  });
  const childTask = createTask({
    created_at: "2026-06-11T08:01:00.000Z",
    due_on: "2026-06-11",
    id: "task-child",
    parent_task_id: parentTask.id,
    repeat_frequency: "daily",
    sort_order: 0,
    status: "pending",
    title: "Child step",
  });
  let updateInput: { taskId: string; values: unknown } | null = null;

  const subtasks = useTaskSubtaskActions({
    client: {} as never,
    currentUserId: "u1",
    canonicalTaskStateUpdate: async (taskId, values) => {
      updateInput = { taskId, values };
      return true;
    },
    setMessage: () => {},
    setTasks: () => {},
    tasks: [parentTask],
  });

  const canonicalSubtasks = useTaskSubtaskActions({
    client: {} as never,
    currentUserId: "u1",
    canonicalTaskStateUpdate: async (taskId, values) => {
      updateInput = { taskId, values };
      return true;
    },
    setMessage: () => {},
    setTasks: () => {},
    tasks: [parentTask, childTask],
  });

  await canonicalSubtasks.updateTaskSubtaskStatus(childTask.id, "done");

  assert.deepEqual(updateInput, { taskId: childTask.id, values: { status: "done" } });
  assert.equal(typeof subtasks.updateTaskSubtaskStatus, "function");
});

test("updateTask forwards an explicit expected snapshot to guarded writes", async () => {
  const expectedTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-update-expected",
    revision: 7,
    sort_order: 1,
    status: "pending",
    title: "Before optimistic archive",
  });
  const localTask = {
    ...expectedTask,
    revision: 8,
    status: "archived" as const,
    updated_at: "2026-06-11T12:05:00.000Z",
  };
  let receivedExpectedTask: typeof expectedTask | null | undefined;

  const update = useTaskUpdateAction({
    currentDayKey: "2026-06-21",
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: [localTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, _values, options) => {
      receivedExpectedTask = options?.expectedTask ?? null;
      return {
        conflict: null,
        data: localTask,
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      };
    },
  });

  await update.updateTask("task-update-expected", { status: "archived" }, { expectedTask });
  assert.equal(receivedExpectedTask?.revision, 7);
  assert.equal(receivedExpectedTask?.status, "pending");
});

test("History failure returns false and requests compensation for the exact pre-action fields", async () => {
  const previousTask = createTask({
    active_occurrence_due_on: null,
    active_status_logical_date: null,
    created_at: "2026-08-03T12:00:00.000Z",
    due_on: "2026-08-03",
    id: "task-history-compensation",
    repeat_days_of_week: [1],
    repeat_frequency: "weekly",
    repeat_interval: 1,
    revision: 70,
    sort_order: 1,
    status: "pending",
    title: "History compensation",
  });
  const committedTask = {
    ...previousTask,
    due_on: "2026-08-10",
    revision: 71,
    status: "upcoming" as const,
  };
  let compensationInput: {
    committedTask: typeof previousTask;
    previousTask: typeof previousTask;
    rollbackValues: unknown;
    taskId: string;
  } | null = null;

  const update = useTaskUpdateAction({
    currentDayKey: "2026-08-03",
    onTaskHistoryFailure: async (input) => {
      compensationInput = input;
      return true;
    },
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => false,
    tasks: [previousTask],
    updateTaskRowWithLegacyEnergyFallback: async () => ({
      conflict: null,
      data: committedTask,
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });

  const result = await update.updateTask(
    previousTask.id,
    { due_on: committedTask.due_on, status: committedTask.status },
    { expectedTask: previousTask, historyStatus: "done" },
  );

  assert.equal(result, false);
  assert.equal(compensationInput?.taskId, previousTask.id);
  assert.equal(compensationInput?.previousTask.revision, 70);
  assert.equal(compensationInput?.committedTask.revision, 71);
  assert.deepEqual(compensationInput?.rollbackValues, {
    due_on: "2026-08-03",
    status: "pending",
  });
});

test("engine History outcome wins over recurring projected task status", async () => {
  const recurringTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    due_on: "2026-06-21",
    id: "task-recurring-history-authority",
    repeat_frequency: "daily",
    revision: 4,
    sort_order: 1,
    status: "pending",
    title: "Recurring History authority",
  });
  let projectedStatus: typeof recurringTask.status = "upcoming";
  let syncCalls = 0;
  let syncedStatus: typeof recurringTask.status | null = null;
  const update = useTaskUpdateAction({
    currentDayKey: "2026-06-21",
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async (_taskId, status) => {
      syncCalls += 1;
      syncedStatus = status;
      return true;
    },
    tasks: [recurringTask],
    updateTaskRowWithLegacyEnergyFallback: async () => ({
      conflict: null,
      data: { ...recurringTask, due_on: "2026-06-22", status: projectedStatus },
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });

  for (const [historyStatus, nextProjectedStatus] of [
    ["done", "upcoming"],
    ["did_my_best", "not_due"],
    ["done", "pending"],
  ] as const) {
    projectedStatus = nextProjectedStatus;
    syncCalls = 0;
    syncedStatus = null;
    await update.updateTask(
      recurringTask.id,
      { due_on: "2026-06-22", status: nextProjectedStatus },
      { expectedTask: recurringTask, historyStatus },
    );
    assert.equal(syncCalls, 1);
    assert.equal(syncedStatus, historyStatus);
  }
});

test("manual one-off History behavior still follows the persisted status", async () => {
  const oneOffTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    due_on: "2026-06-21",
    id: "task-one-off-history-authority",
    repeat_frequency: "none",
    sort_order: 1,
    status: "pending",
    title: "One-off History behavior",
  });
  const syncedStatuses: string[] = [];
  const update = useTaskUpdateAction({
    currentDayKey: "2026-06-21",
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async (_taskId, status) => {
      syncedStatuses.push(status);
      return true;
    },
    tasks: [oneOffTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => ({
      conflict: null,
      data: { ...oneOffTask, ...values, status: values.status ?? oneOffTask.status },
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });

  await update.updateTask(oneOffTask.id, { status: "done" });
  await update.updateTask(oneOffTask.id, { status: "pending" });
  assert.deepEqual(syncedStatuses, ["done", "pending"]);
});

test("due-date edits recalculate open status in update, editor, and batch flows", async () => {
  const baseTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    due_on: "2026-06-21",
    id: "task-due-normalize",
    repeat_frequency: "none",
    sort_order: 1,
    status: "pending",
    title: "Normalize me",
  });
  let updateValues: Record<string, unknown> | null = null;
  let editorValues: Record<string, unknown> | null = null;
  let editorForceRecurringFinalization: boolean | null = null;
  let batchValues: Record<string, unknown> | null = null;
  let dueOnlyHistorySyncCalls = 0;

  const update = useTaskUpdateAction({
    currentDayKey: "2026-06-21",
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: [baseTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => {
      updateValues = values as Record<string, unknown>;
      return {
        conflict: null,
        data: { ...baseTask, ...values, status: values.status as typeof baseTask.status },
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      };
    },
  });
  await update.updateTask(baseTask.id, { due_on: "2026-06-29" });
  assert.equal(updateValues?.status, "not_due");

  const doneTodayTask = createTask({
    ...baseTask,
    due_on: "2026-06-21",
    id: "task-due-preserves-history",
    status: "done",
    title: "Keep today's Done History",
  });
  const dueOnlyUpdate = useTaskUpdateAction({
    currentDayKey: "2026-06-21",
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => {
      dueOnlyHistorySyncCalls += 1;
      return true;
    },
    tasks: [doneTodayTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => ({
      conflict: null,
      data: { ...doneTodayTask, ...values, status: doneTodayTask.status },
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });
  await dueOnlyUpdate.updateTask(doneTodayTask.id, { due_on: "2026-06-29" });
  assert.equal(dueOnlyHistorySyncCalls, 0);

  const editorTask = createTask({
    ...baseTask,
    due_on: "2026-06-21",
    id: "task-due-recurring-anchor",
    repeat_frequency: "daily",
    status: "done",
    title: "Keep the manual anchor",
  });
  const editor = useTaskEditorSaveAction({
    currentDayKey: "2026-06-21",
    focusedTaskIds: [],
    currentUserId: "u1",
    insertTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedEnergyFallback: false }),
    onTasksCompleted: async (candidates) => {
      editorForceRecurringFinalization = candidates[0]?.forceRecurringFinalization ?? null;
    },
    replaceTaskSubtasks: async () => ({ saved: true }),
    reconcileOverdueTaskMisses: async () => true,
    saveFocusSelection: async () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    syncTaskNoteLinks: async () => true,
    tasks: [baseTask, editorTask],
    updateTaskRowWithLegacyEnergyFallback: async (taskId, values) => {
      editorValues = values as Record<string, unknown>;
      const savedTask = taskId === editorTask.id ? editorTask : baseTask;
      return {
        conflict: null,
        data: { ...savedTask, ...values, status: values.status as typeof savedTask.status },
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      };
    },
  });
  await editor.saveTaskEditor({ ...baseTask, due_on: "2026-06-24" }, { taskId: baseTask.id });
  assert.equal(editorValues?.status, "upcoming");

  await editor.saveTaskEditor({ ...editorTask, due_on: "2026-06-24" }, { taskId: editorTask.id });
  assert.equal(editorValues?.status, "done");
  assert.equal(editorForceRecurringFinalization, null);
  assert.equal(dueOnlyHistorySyncCalls, 0);

  const delayedTask = { ...baseTask, status: "delayed" as const };
  const batch = useTaskBatchEditAction({
    clearListTaskSelection: () => {},
    currentDayKey: "2026-06-21",
    focusedTaskIds: [],
    onTasksCompleted: async () => {},
    parseDayOfMonth: () => null,
    parsePositiveInteger: (value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : null;
    },
    routeTask: () => {},
    saveFocusSelection: async () => {},
    selectedListTasks: [delayedTask],
    setBatchEditProgress: () => {},
    setIsBatchEditModalOpen: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => {
      dueOnlyHistorySyncCalls += 1;
      return true;
    },
    tasks: [delayedTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => {
      batchValues = values as Record<string, unknown>;
      return {
        data: { ...delayedTask, ...values, status: values.status as typeof delayedTask.status },
        error: null,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      };
    },
  });
  await batch.applyBatchTaskEdit({
    dueOn: "2026-06-21",
    dueOnMode: "set",
    energy: "unchanged",
    estimatedMinutes: "",
    estimatedMinutesMode: "unchanged",
    focusToday: "unchanged",
    oneStepAtATime: "unchanged",
    priority: "unchanged",
    repeatDayOfMonth: "",
    repeatDaysOfWeek: [],
    repeatFrequency: "unchanged",
    repeatInterval: "",
    route: "unchanged",
    status: "unchanged",
    subtasksAutoReset: "unchanged",
    tags: [],
    tagsMode: "unchanged",
  });
  assert.equal(batchValues?.status, "pending");
  assert.equal(dueOnlyHistorySyncCalls, 0);
});

test("successful due-date edits reconcile the task-scoped History input before the next active-status read", async () => {
  const taskId = "task-live-due-reconciliation";
  const history: TaskHistory = {
    counted_as_due_occurrence: true,
    created_at: "2026-08-04T12:00:00.000Z",
    entry_date: "2026-08-04",
    event_type: "status",
    id: "history-live-due-reconciliation",
    occurrence_due_on: "2026-08-04",
    occurrence_key: "occurrence:2026-08-04",
    status: "done",
    task_id: taskId,
    updated_at: "2026-08-04T12:00:00.000Z",
    user_id: "u1",
    was_completed: true,
  };
  let localTask = createTask({
    due_on: "2026-08-05",
    id: taskId,
    repeat_frequency: "daily",
    status: "missed",
    title: "Breakfast",
    user_id: "u1",
  });
  let localHistory = [history];
  let historyReconciliations = 0;

  const useDueDate = (dueOn: string) => {
    const action = useTaskUpdateAction({
      currentDayKey: "2026-08-05",
      dayStartTime: "06:00",
      loadTaskHistoryForTasks: async () => ({
        [taskId]: { error: null, history: localHistory, status: "ready" as const },
      }),
      logicalDayNow: "2026-08-05T12:00:00.000Z",
      onTaskHistoryMutation: (_taskId, nextHistory) => {
        historyReconciliations += 1;
        localHistory = nextHistory;
      },
      onTasksCompleted: async () => {},
      reconcileOverdueTaskMisses: async () => true,
      routeTask: () => {},
      setMessage: () => {},
      setTasks: (updater) => {
        localTask = typeof updater === "function" ? updater([localTask])[0] ?? localTask : updater[0] ?? localTask;
      },
      sortTasksForUi: (tasks) => tasks,
      syncTaskHistoryEntry: async () => true,
      tasks: [localTask],
      timezone: "America/New_York",
      updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => ({
        conflict: null,
        data: { ...localTask, ...values, revision: localTask.revision + 1 },
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      }),
    });

    return action.updateTask(taskId, { due_on: dueOn }).then((result) => {
      assert.equal(result, true);
      return resolveActiveTaskStatuses({
      historyByTaskId: { [taskId]: localHistory },
      logicalDayRollover: "06:00",
      now: "2026-08-05T12:00:00.000Z",
      tasks: [localTask],
      timezone: "America/New_York",
      }).statusesByTaskId[taskId];
    });
  };

  assert.equal(await useDueDate("2026-08-13"), "not_due");
  assert.equal(await useDueDate("2026-08-05"), "pending");
  assert.equal(historyReconciliations, 2);
  assert.equal(localTask.status, "pending");
});

test("failed due-date persistence leaves the local Task and History reconciliation untouched", async () => {
  const task = createTask({
    due_on: "2026-08-05",
    id: "task-live-due-failure",
    repeat_frequency: "daily",
    status: "missed",
    title: "Breakfast failure",
    user_id: "u1",
  });
  let setTasksCalls = 0;
  let reconciliationCalls = 0;
  const messages: Array<{ tone: string; text: string }> = [];
  const action = useTaskUpdateAction({
    currentDayKey: "2026-08-05",
    dayStartTime: "06:00",
    loadTaskHistoryForTasks: async () => ({
      [task.id]: { error: null, history: [], status: "ready" as const },
    }),
    onTaskHistoryMutation: () => {
      reconciliationCalls += 1;
    },
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: (message) => {
      if (typeof message !== "function" && message) messages.push(message);
    },
    setTasks: () => {
      setTasksCalls += 1;
    },
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: [task],
    updateTaskRowWithLegacyEnergyFallback: async () => ({
      conflict: null,
      data: null,
      error: { message: "Persistence failed." },
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });

  assert.equal(await action.updateTask(task.id, { due_on: "2026-08-20" }), false);
  assert.equal(setTasksCalls, 0);
  assert.equal(reconciliationCalls, 0);
  assert.equal(task.status, "missed");
  assert.equal(task.due_on, "2026-08-05");
  assert.equal(messages.at(-1)?.tone, "warn");
  assert.match(messages.at(-1)?.text ?? "", /^Task wasn't updated:/);
});

test("ordinary Task mutation exceptions show a visible edit failure", async () => {
  const task = createTask({ id: "task-mutation-exception", status: "pending", title: "Mutation" });
  const messages: Array<{ tone: string; text: string }> = [];
  const action = useTaskUpdateAction({
    currentDayKey: "2026-08-05",
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: (message) => {
      if (typeof message !== "function" && message) messages.push(message);
    },
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: [task],
    updateTaskRowWithLegacyEnergyFallback: async () => {
      throw new Error("Supabase mutation failed.");
    },
  });

  assert.equal(await action.updateTask(task.id, { title: "Changed" }), false);
  assert.equal(messages.at(-1)?.tone, "warn");
  assert.equal(messages.at(-1)?.text, "Task wasn't updated: Supabase mutation failed.");
});

test("full Task Edit routes a recurring No Date change as an unscheduled intent", async () => {
  const task = createTask({
    due_on: "2026-08-19",
    id: "task-editor-unscheduled",
    repeat_frequency: "daily",
    status: "pending",
    title: "Recurring edit",
  });
  let receivedOptions: { manualAction?: "unscheduled_status" } | undefined;
  const editor = useTaskEditorSaveAction({
    canonicalTaskStateUpdate: async (_taskId, _values, options) => {
      receivedOptions = options;
      return true;
    },
    currentDayKey: "2026-08-19",
    currentUserId: "u1",
    focusedTaskIds: [],
    onTasksCompleted: async () => {},
    replaceTaskSubtasks: async () => ({ saved: true }),
    saveFocusSelection: async () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    syncTaskNoteLinks: async () => true,
    tasks: [task],
    updateTaskRowWithLegacyEnergyFallback: async () => ({
      conflict: null,
      data: null,
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });

  await editor.saveTaskEditor({ ...task, due_on: null, due_time: null, repeat_frequency: "daily" }, { taskId: task.id });
  assert.deepEqual(receivedOptions, { manualAction: "unscheduled_status" });
});

test("manual due-date edits preserve unresolved History and skip reconciliation, rewards, and recurrence callbacks", async () => {
  const taskId = "task-manual-due-history";
  const sourceTask = createTask({
    created_at: "2026-08-01T12:00:00.000Z",
    due_on: "2026-08-08",
    id: taskId,
    repeat_frequency: "daily",
    status: "upcoming",
    title: "Manual due anchor",
  });
  const missedHistory = {
    counted_as_due_occurrence: true,
    created_at: "2026-08-03T12:00:00.000Z",
    entry_date: "2026-08-03",
    event_type: "status" as const,
    id: "history-manual-due-missed",
    occurrence_due_on: "2026-08-03",
    occurrence_key: "occurrence:2026-08-03",
    status: "missed" as const,
    task_id: taskId,
    updated_at: "2026-08-03T12:00:00.000Z",
    user_id: "u1",
    was_completed: false,
  };
  const historySnapshot = JSON.stringify([missedHistory]);
  let historyWrites = 0;
  let rewardCallbacks = 0;
  let overdueReconciliations = 0;
  let savedUpdate: Record<string, unknown> | null = null;

  const update = useTaskUpdateAction({
    currentDayKey: "2026-08-08",
    onTasksCompleted: async () => { rewardCallbacks += 1; },
    reconcileOverdueTaskMisses: async () => {
      overdueReconciliations += 1;
      return true;
    },
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => {
      historyWrites += 1;
      return true;
    },
    taskHistory: [missedHistory],
    tasks: [sourceTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => {
      savedUpdate = values as Record<string, unknown>;
      return {
        conflict: null,
        data: { ...sourceTask, ...values, status: values.status as typeof sourceTask.status },
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      };
    },
  });
  await update.updateTask(taskId, { due_on: "2026-08-04" });
  assert.equal(savedUpdate?.due_on, "2026-08-04");
  assert.equal(savedUpdate?.status, "missed");
  assert.equal(savedUpdate?.active_occurrence_due_on, undefined);
  assert.equal(savedUpdate?.active_status_logical_date, undefined);
  assert.equal(historyWrites, 0);
  assert.equal(rewardCallbacks, 0);
  assert.equal(overdueReconciliations, 0);
  assert.equal(JSON.stringify([missedHistory]), historySnapshot);

  let editorSavedUpdate: Record<string, unknown> | null = null;
  const editor = useTaskEditorSaveAction({
    currentDayKey: "2026-08-08",
    currentUserId: "u1",
    focusedTaskIds: [],
    insertTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedEnergyFallback: false }),
    onTasksCompleted: async () => { rewardCallbacks += 1; },
    replaceTaskSubtasks: async () => ({ saved: true }),
    reconcileOverdueTaskMisses: async () => {
      overdueReconciliations += 1;
      return true;
    },
    saveFocusSelection: async () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => {
      historyWrites += 1;
      return true;
    },
    syncTaskNoteLinks: async () => true,
    taskHistory: [missedHistory],
    tasks: [sourceTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => {
      editorSavedUpdate = values as Record<string, unknown>;
      return {
        conflict: null,
        data: { ...sourceTask, ...values, status: values.status as typeof sourceTask.status },
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      };
    },
  });
  await editor.saveTaskEditor({ ...sourceTask, due_on: "2026-08-04" }, { taskId });
  assert.equal(editorSavedUpdate?.status, "missed");
  assert.equal(editorSavedUpdate?.active_occurrence_due_on, undefined);

  let batchSavedUpdate: Record<string, unknown> | null = null;
  const batch = useTaskBatchEditAction({
    clearListTaskSelection: () => {},
    currentDayKey: "2026-08-08",
    focusedTaskIds: [],
    onTasksCompleted: async () => { rewardCallbacks += 1; },
    parseDayOfMonth: () => null,
    parsePositiveInteger: (value) => Number.parseInt(value, 10),
    routeTask: () => {},
    saveFocusSelection: async () => {},
    selectedListTasks: [sourceTask],
    setBatchEditProgress: () => {},
    setIsBatchEditModalOpen: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => {
      historyWrites += 1;
      return true;
    },
    taskHistory: [missedHistory],
    tasks: [sourceTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => {
      batchSavedUpdate = values as Record<string, unknown>;
      return {
        data: { ...sourceTask, ...values, status: values.status as typeof sourceTask.status },
        error: null,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      };
    },
  });
  await batch.applyBatchTaskEdit({
    dueOn: "2026-08-04",
    dueOnMode: "set",
    energy: "unchanged",
    estimatedMinutes: "",
    estimatedMinutesMode: "unchanged",
    focusToday: "unchanged",
    oneStepAtATime: "unchanged",
    priority: "unchanged",
    repeatDayOfMonth: "",
    repeatDaysOfWeek: [],
    repeatFrequency: "unchanged",
    repeatInterval: "",
    route: "unchanged",
    status: "unchanged",
    subtasksAutoReset: "unchanged",
    tags: [],
    tagsMode: "unchanged",
  });
  assert.equal(batchSavedUpdate?.status, "missed");
  assert.equal(batchSavedUpdate?.active_occurrence_due_on, undefined);
  assert.equal(historyWrites, 0);
  assert.equal(rewardCallbacks, 0);
  assert.equal(overdueReconciliations, 0);
  assert.equal(JSON.stringify([missedHistory]), historySnapshot);
});

test("Test D keeps an identity-bearing Missed occurrence as historical evidence while the edited cursor becomes future", async () => {
  const taskId = "task-test-d";
  const missedHistory = {
    counted_as_due_occurrence: false,
    created_at: "2026-08-03T12:00:00.000Z",
    entry_date: "2026-08-03",
    event_type: "status" as const,
    id: "history-test-d-missed",
    occurrence_due_on: "2026-08-03",
    occurrence_key: "occurrence:2026-08-03",
    status: "missed" as const,
    task_id: taskId,
    updated_at: "2026-08-03T12:00:00.000Z",
    user_id: "u1",
    was_completed: false,
  };
  let committedTask = createTask({
    created_at: "2026-08-03T12:00:00.000Z",
    due_on: "2026-08-03",
    id: taskId,
    repeat_frequency: "daily",
    status: "pending",
    title: "Test D",
  });
  let optimisticTasks = [committedTask];
  let historyWrites = 0;
  let rewardCallbacks = 0;
  const useDueDate = (dueOn: string) => {
    const action = useTaskUpdateAction({
      currentDayKey: "2026-08-04",
      dayStartTime: "06:00",
      loadTaskHistoryForTasks: async () => ({ [taskId]: { error: null, history: [missedHistory], status: "ready" as const } }),
      logicalDayNow: "2026-08-04T12:00:00.000Z",
      onTasksCompleted: async () => { rewardCallbacks += 1; },
      reconcileOverdueTaskMisses: async () => true,
      routeTask: () => {},
      setMessage: () => {},
      setTasks: (updater) => {
        optimisticTasks = typeof updater === "function" ? updater(optimisticTasks) : updater;
      },
      sortTasksForUi: (tasks) => tasks,
      syncTaskHistoryEntry: async () => { historyWrites += 1; return true; },
      tasks: [committedTask],
      timezone: "America/New_York",
      updateTaskRowWithLegacyEnergyFallback: async (_taskId, values, options) => {
        assert.equal(options?.expectedTask?.revision, committedTask.revision);
        committedTask = { ...committedTask, ...values, revision: committedTask.revision + 1 };
        return {
          conflict: null,
          data: committedTask,
          error: null,
          reappliedOnLatestRevision: false,
          usedActualSecondsFallback: false,
          usedEnergyFallback: false,
        };
      },
    });
    return action.updateTask(taskId, { due_on: dueOn }).then(() => {
      // The explicit Missed row remains identity-bearing History. A future
      // cursor is Upcoming; moving the cursor onto today is Pending.
      const expectedStatus = dueOn > "2026-08-04" ? "upcoming" : "pending";
      assert.equal(committedTask.status, expectedStatus);
      assert.equal(optimisticTasks[0]?.status, expectedStatus);
    });
  };

  await useDueDate("2026-08-05");
  await useDueDate("2026-08-04");
  assert.equal(committedTask.due_on, "2026-08-04");
  assert.equal(committedTask.active_occurrence_due_on ?? null, null);
  assert.equal(committedTask.active_status_logical_date ?? null, null);
  assert.equal(historyWrites, 0);
  assert.equal(rewardCallbacks, 0);
  assert.equal(missedHistory.status, "missed");
});

test("deleteTasks forwards explicit expected snapshots to guarded trash writes", async () => {
  const expectedTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-delete-expected",
    revision: 11,
    sort_order: 1,
    status: "archived",
    title: "Delete me",
  });
  const localTask = {
    ...expectedTask,
    revision: 12,
  };
  let receivedExpectedTask: typeof expectedTask | null | undefined;
  let receivedUpdateValues: Record<string, unknown> | null = null;

  const crud = useTaskCrudActions({
    client: {} as never,
    currentUserId: "u1",
    deleteTaskRow: async () => ({ conflict: null, data: null, error: null }),
    setMessage: () => {},
    setTaskRouting: () => {},
    setTasks: () => {},
    shouldRouteTaskToInbox: () => false,
    sortTasksForUi: (tasks) => tasks,
    tasks: [localTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values, options) => {
      receivedExpectedTask = options?.expectedTask ?? null;
      receivedUpdateValues = values as Record<string, unknown>;
      return {
        conflict: null,
        data: { ...localTask, ...values, status: "trashed" as const },
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      };
    },
  });

  await crud.deleteTasks(["task-delete-expected"], {
    expectedTasks: new Map([["task-delete-expected", expectedTask]]),
  });
  assert.equal(receivedExpectedTask?.revision, 11);
  assert.equal(receivedExpectedTask?.status, "archived");
  assert.equal(receivedUpdateValues?.status, "trashed");
  assert.equal(typeof receivedUpdateValues?.trashed_at, "string");
});

test("permanent parent deletion immediately removes database-cascaded descendants from local task state", async () => {
  const parent = createTask({
    created_at: "2026-07-26T12:00:00.000Z",
    id: "trashed-parent",
    sort_order: 1,
    status: "trashed",
    title: "Trashed parent",
    trashed_at: "2026-07-26T12:00:00.000Z",
  });
  const child = createTask({
    created_at: "2026-07-26T12:01:00.000Z",
    id: "active-child",
    parent_task_id: parent.id,
    sort_order: 1,
    status: "pending",
    title: "Active child",
  });
  const grandchild = createTask({
    created_at: "2026-07-26T12:02:00.000Z",
    id: "active-grandchild",
    parent_task_id: child.id,
    sort_order: 1,
    status: "pending",
    title: "Active grandchild",
  });
  const unrelated = createTask({
    created_at: "2026-07-26T12:03:00.000Z",
    id: "unrelated-task",
    sort_order: 2,
    status: "pending",
    title: "Unrelated task",
  });
  let taskState = [parent, child, grandchild, unrelated];
  let routingState = Object.fromEntries(taskState.map((task) => [task.id, "inbox" as const]));

  const crud = useTaskCrudActions({
    client: {} as never,
    currentUserId: "u1",
    deleteTaskRow: async (_taskId, expectedTask) => ({ conflict: null, data: expectedTask ?? null, error: null }),
    setMessage: () => {},
    setTaskRouting: ((updater: typeof routingState | ((current: typeof routingState) => typeof routingState)) => {
      routingState = typeof updater === "function" ? updater(routingState) : updater;
    }) as never,
    setTasks: ((updater: typeof taskState | ((current: typeof taskState) => typeof taskState)) => {
      taskState = typeof updater === "function" ? updater(taskState) : updater;
    }) as never,
    shouldRouteTaskToInbox: () => false,
    sortTasksForUi: (tasks) => tasks,
    tasks: taskState,
    updateTaskRowWithLegacyEnergyFallback: async () => ({
      conflict: null,
      data: null,
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });

  const deleted = await crud.deleteTasks([parent.id]);

  assert.equal(deleted, true);
  assert.deepEqual(taskState.map((task) => task.id), [unrelated.id]);
  assert.deepEqual(Object.keys(routingState), [unrelated.id]);
});

function failedTaskHistoryLoad(taskId: string) {
  return async () => ({
    [taskId]: {
      error: "History is unavailable.",
      history: null,
      status: "error" as const,
    },
  });
}

function readyTaskHistoryLoad(taskId: string) {
  return async () => ({
    [taskId]: {
      error: null,
      history: [],
      status: "ready" as const,
    },
  });
}

test("generic due-date edits fail closed when authoritative History loading fails", async () => {
  const task = createTask({ id: "task-history-failure-due", status: "pending", title: "Due" });
  let taskWrites = 0;
  const update = useTaskUpdateAction({
    currentDayKey: "2026-08-05",
    loadTaskHistoryForTasks: failedTaskHistoryLoad(task.id),
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: [task],
    updateTaskRowWithLegacyEnergyFallback: async () => {
      taskWrites += 1;
      return { conflict: null, data: task, error: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(task.id, { due_on: "2026-08-10" }), false);
  assert.equal(taskWrites, 0);
});

test("generic status edits fail closed when authoritative History loading fails", async () => {
  const task = createTask({ id: "task-history-failure-status", status: "pending", title: "Status" });
  let taskWrites = 0;
  let historyWrites = 0;
  const update = useTaskUpdateAction({
    currentDayKey: "2026-08-05",
    loadTaskHistoryForTasks: failedTaskHistoryLoad(task.id),
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => { historyWrites += 1; return true; },
    tasks: [task],
    updateTaskRowWithLegacyEnergyFallback: async () => {
      taskWrites += 1;
      return { conflict: null, data: task, error: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(task.id, { status: "done" }), false);
  assert.equal(taskWrites, 0);
  assert.equal(historyWrites, 0);
});

test("generic recurrence edits fail closed when authoritative History loading fails", async () => {
  const task = createTask({ id: "task-history-failure-repeat", repeat_frequency: "none", status: "pending", title: "Repeat" });
  let taskWrites = 0;
  const update = useTaskUpdateAction({
    currentDayKey: "2026-08-05",
    loadTaskHistoryForTasks: failedTaskHistoryLoad(task.id),
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: [task],
    updateTaskRowWithLegacyEnergyFallback: async () => {
      taskWrites += 1;
      return { conflict: null, data: task, error: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(task.id, { repeat_frequency: "daily", repeat_interval: 1 }), false);
  assert.equal(taskWrites, 0);
});

test("generic metadata-only title and priority edits skip History loading", async () => {
  const task = createTask({ id: "task-metadata-no-history", priority: 1, status: "pending", title: "Metadata" });
  let historyLoads = 0;
  let taskWrites = 0;
  const update = useTaskUpdateAction({
    currentDayKey: "2026-08-05",
    loadTaskHistoryForTasks: async () => {
      historyLoads += 1;
      return failedTaskHistoryLoad(task.id)();
    },
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: [task],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => {
      taskWrites += 1;
      return { conflict: null, data: { ...task, ...values }, error: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(task.id, { title: "Renamed" }), true);
  assert.equal(await update.updateTask(task.id, { priority: 4 }), true);
  assert.equal(historyLoads, 0);
  assert.equal(taskWrites, 2);
});

test("full editor metadata-only title and priority edits skip History loading", async () => {
  const task = createTask({
    id: "task-editor-metadata-no-history",
    priority: 1,
    repeat_days_of_week: [1, 3],
    repeat_frequency: "weekly",
    status: "pending",
    title: "Editor metadata",
  });
  let historyLoads = 0;
  let taskWrites = 0;
  const editor = useTaskEditorSaveAction({
    currentDayKey: "2026-08-05",
    currentUserId: "u1",
    focusedTaskIds: [],
    insertTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedEnergyFallback: false }),
    loadTaskHistoryForTasks: async () => {
      historyLoads += 1;
      return failedTaskHistoryLoad(task.id)();
    },
    onTasksCompleted: async () => {},
    replaceTaskSubtasks: async () => ({ saved: true }),
    reconcileOverdueTaskMisses: async () => true,
    saveFocusSelection: async () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    syncTaskNoteLinks: async () => true,
    tasks: [task],
    updateTaskRowWithLegacyEnergyFallback: async () => {
      taskWrites += 1;
      return { conflict: null, data: task, error: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.ok(await editor.saveTaskEditor({ ...task, title: "Renamed" }, { taskId: task.id }));
  assert.ok(await editor.saveTaskEditor({ ...task, priority: 4 }, { taskId: task.id }));
  assert.equal(historyLoads, 0);
  assert.equal(taskWrites, 2);
});

test("full editor save rejects Task State validation before task or History writes", async () => {
  const task = createTask({ due_on: null, id: "task-editor-validation", repeat_frequency: "none", status: "pending", title: "Editor" });
  let taskWrites = 0;
  let historyWrites = 0;
  let rewardCalls = 0;
  const editor = useTaskEditorSaveAction({
    currentDayKey: "2026-08-05",
    currentUserId: "u1",
    focusedTaskIds: [],
    insertTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedEnergyFallback: false }),
    loadTaskHistoryForTasks: readyTaskHistoryLoad(task.id),
    onTasksCompleted: async () => { rewardCalls += 1; },
    replaceTaskSubtasks: async () => ({ saved: true }),
    reconcileOverdueTaskMisses: async () => true,
    saveFocusSelection: async () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => { historyWrites += 1; return true; },
    syncTaskNoteLinks: async () => true,
    tasks: [task],
    updateTaskRowWithLegacyEnergyFallback: async () => {
      taskWrites += 1;
      return { conflict: null, data: task, error: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await editor.saveTaskEditor({ ...task, status: "missed" }, { taskId: task.id }), null);
  assert.equal(taskWrites, 0);
  assert.equal(historyWrites, 0);
  assert.equal(rewardCalls, 0);
});

test("batch edit rejects Task State validation before any task or History writes", async () => {
  const task = createTask({ due_on: null, id: "task-batch-validation", repeat_frequency: "none", status: "pending", title: "Batch" });
  let taskWrites = 0;
  let historyWrites = 0;
  let rewardCalls = 0;
  const batch = useTaskBatchEditAction({
    clearListTaskSelection: () => {},
    currentDayKey: "2026-08-05",
    focusedTaskIds: [],
    loadTaskHistoryForTasks: readyTaskHistoryLoad(task.id),
    onTasksCompleted: async () => { rewardCalls += 1; },
    parseDayOfMonth: () => null,
    parsePositiveInteger: (value) => Number.parseInt(value, 10),
    routeTask: () => {},
    saveFocusSelection: async () => {},
    selectedListTasks: [task],
    setBatchEditProgress: () => {},
    setIsBatchEditModalOpen: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => { historyWrites += 1; return true; },
    tasks: [task],
    updateTaskRowWithLegacyEnergyFallback: async () => {
      taskWrites += 1;
      return { data: task, error: null, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  await batch.applyBatchTaskEdit({
    dueOn: "",
    dueOnMode: "unchanged",
    energy: "unchanged",
    estimatedMinutes: "",
    estimatedMinutesMode: "unchanged",
    focusToday: "unchanged",
    oneStepAtATime: "unchanged",
    priority: "unchanged",
    repeatDayOfMonth: "",
    repeatDaysOfWeek: [],
    repeatFrequency: "unchanged",
    repeatInterval: "",
    route: "unchanged",
    status: "missed",
    subtasksAutoReset: "unchanged",
    tags: [],
    tagsMode: "unchanged",
  });
  assert.equal(taskWrites, 0);
  assert.equal(historyWrites, 0);
  assert.equal(rewardCalls, 0);
});

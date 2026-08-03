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
    syncTaskHistoryEntry: async () => true,
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
    replaceTaskSubtasks: async () => ({ saved: true, usedNestedFallback: false }),
    reconcileOverdueTaskMisses: async () => true,
    saveFocusSelection: async () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
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
    isMissingParentSubtaskColumnError: () => false,
    mapTaskSubtaskRow: (row) => row,
    setMessage: () => {},
    setSupportsNestedSubtasks: () => {},
    setTaskSubtasks: () => {},
    supportsNestedSubtasks: true,
    taskSubtasks: [],
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
      isMissingParentSubtaskColumnError: () => false,
      mapTaskSubtaskRow: (row) => row,
      setMessage: () => {},
      setSupportsNestedSubtasks: () => {},
      setTaskSubtasks: () => {},
      supportsNestedSubtasks: true,
      taskSubtasks: [],
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

test("subtask completion keeps reward claims scoped to the subtask", async () => {
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
  const previousSubtask = {
    id: "subtask-1",
    parent_subtask_id: null,
    sort_order: 0,
    status: "pending" as const,
    task_id: parentTask.id,
    title: "Child step",
    user_id: "u1",
  };

  let rewardCandidates: Array<{
    claimRef: { subtaskId: string; taskId: string; title: string };
    previousStatus: "pending" | "in_progress" | "done" | "missed" | "did_my_best" | "upcoming" | "not_due" | "archived" | "trashed" | null;
    task: typeof parentTask;
  }> = [];

  const client = {
    from() {
      return {
        update() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    select() {
                      return {
                        single: async () => ({
                          data: { ...previousSubtask, status: "done" as const },
                          error: null,
                        }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const subtasks = useTaskSubtaskActions({
    client: client as never,
    currentUserId: "u1",
    isMissingParentSubtaskColumnError: () => false,
    mapTaskSubtaskRow: (row) => row,
    onSubtaskCompletedReward: async (candidates) => {
      rewardCandidates = candidates;
    },
    setMessage: () => {},
    setSupportsNestedSubtasks: () => {},
    setTaskSubtasks: () => {},
    supportsNestedSubtasks: true,
    tasks: [parentTask],
    taskSubtasks: [previousSubtask],
  });

  await subtasks.updateTaskSubtaskStatus(previousSubtask.id, "done");

  assert.equal(rewardCandidates.length, 1);
  assert.deepEqual(rewardCandidates[0]?.claimRef, {
    subtaskId: previousSubtask.id,
    taskId: parentTask.id,
    title: previousSubtask.title,
  });
  assert.equal(rewardCandidates[0]?.task.id, parentTask.id);
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
  let batchValues: Record<string, unknown> | null = null;

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

  const editor = useTaskEditorSaveAction({
    currentDayKey: "2026-06-21",
    focusedTaskIds: [],
    currentUserId: "u1",
    insertTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedEnergyFallback: false }),
    onTasksCompleted: async () => {},
    replaceTaskSubtasks: async () => ({ saved: true, usedNestedFallback: false }),
    reconcileOverdueTaskMisses: async () => true,
    saveFocusSelection: async () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    syncTaskNoteLinks: async () => true,
    tasks: [baseTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => {
      editorValues = values as Record<string, unknown>;
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
  await editor.saveTaskEditor({ ...baseTask, due_on: "2026-06-24" }, { taskId: baseTask.id });
  assert.equal(editorValues?.status, "upcoming");

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
    setIsBatchEditModalOpen: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
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

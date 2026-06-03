import test from "node:test";
import assert from "node:assert/strict";
import { useTaskRoutingActions } from "../src/hooks/useTaskRoutingActions.ts";
import { useTaskCrudActions } from "../src/hooks/useTaskCrudActions.ts";
import { useTaskUpdateAction } from "../src/hooks/useTaskUpdateAction.ts";
import { useTaskEditorSaveAction } from "../src/hooks/useTaskEditorSaveAction.ts";
import { useTaskHistoryActions } from "../src/hooks/useTaskHistoryActions.ts";
import { useTaskNoteLinkActions } from "../src/hooks/useTaskNoteLinkActions.ts";
import { useTaskSubtaskActions } from "../src/hooks/useTaskSubtaskActions.ts";
import { useTaskActions } from "../src/hooks/useTaskActions.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { TaskListManualMembership as DbTaskListManualMembership } from "../src/lib/database.types.ts";
import type { TaskListManualMembership } from "../src/lib/task-lists.ts";

test("action hooks expose expected callable actions", () => {
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
    setMessage: () => {},
    setTaskRouting: () => {},
    setTasks: () => {},
    shouldRouteTaskToInbox: () => false,
    sortTasksForUi: (tasks) => tasks,
  });
  assert.equal(typeof crud.importTasks, "function");
  assert.equal(typeof crud.deleteTasks, "function");

  const update = useTaskUpdateAction({
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: [],
    updateTaskRowWithLegacyEnergyFallback: async () => ({
      data: createTask({
        created_at: "2026-05-20T00:00:00.000Z",
        id: "task-update",
        sort_order: 1,
        status: "pending",
        title: "Task",
      }),
      error: null,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });
  assert.equal(typeof update.updateTask, "function");

  const editor = useTaskEditorSaveAction({
    focusedTaskIds: [],
    currentUserId: "u1",
    insertTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedEnergyFallback: false }),
    onTasksCompleted: async () => {},
    replaceTaskSubtasks: async () => ({ saved: true, usedNestedFallback: false }),
    saveFocusSelection: async () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    syncTaskNoteLinks: async () => true,
    tasks: [],
    updateTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedActualSecondsFallback: false, usedEnergyFallback: false }),
  });
  assert.equal(typeof editor.saveTaskEditor, "function");

  const history = useTaskHistoryActions({
    client: {} as never,
    currentUserId: "u1",
    isTaskCompletedForHistory: () => false,
    isTaskHistoryStatus: () => false,
    mapTaskHistoryRow: (row) => row,
    setMessage: () => {},
    setTaskHistory: () => {},
  });
  assert.equal(typeof history.syncTaskHistoryEntry, "function");

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
      setMessage: () => {},
      setTaskRouting: () => {},
      setTasks: () => {},
      shouldRouteTaskToInbox: () => false,
      sortTasksForUi: (tasks) => tasks,
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
      updateTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedActualSecondsFallback: false, usedEnergyFallback: false }),
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
      updateTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedActualSecondsFallback: false, usedEnergyFallback: false }),
    },
    history: {
      client: {} as never,
      currentUserId: "u1",
      isTaskCompletedForHistory: () => false,
      isTaskHistoryStatus: () => false,
      mapTaskHistoryRow: (row) => row,
      setMessage: () => {},
      setTaskHistory: () => {},
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
      setMessage: () => {},
      setTasks: () => {},
      sortTasksForUi: (tasks) => tasks,
      tasks: [],
      updateTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedActualSecondsFallback: false, usedEnergyFallback: false }),
    },
  });
  assert.equal(typeof actions.updateTask, "function");
  assert.equal(typeof actions.saveTaskEditor, "function");
  assert.equal(typeof actions.applyBatchTaskEdit, "function");
});

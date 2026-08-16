import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { useTaskBatchEditAction } from "../src/hooks/useTaskBatchEditAction.ts";
import { useTaskEditorSaveAction } from "../src/hooks/useTaskEditorSaveAction.ts";
import { useTaskHistoryActions } from "../src/hooks/useTaskHistoryActions.ts";
import { useTaskUpdateAction } from "../src/hooks/useTaskUpdateAction.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { buildTaskHistoryByTaskId } from "../src/lib/task-history.ts";
import { buildTaskHistoryStreakSummary } from "../src/lib/task-history-streak-summaries.ts";
import { resolveActiveTaskStatuses } from "../src/lib/task-state-engine/read-authority.ts";

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
  jsx: { runtime: "automatic" },
});
const { createStableTaskRowModelCache } = await jiti.import<typeof import("../src/lib/task-table-row.ts")>(
  "../src/lib/task-table-row.ts",
);

const today = "2026-08-05";
const future = "2026-08-13";
const timezone = "America/New_York";

function priorDayDone(taskId: string): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: "2026-08-04T12:00:00.000Z",
    entry_date: "2026-08-04",
    event_type: "status",
    id: `${taskId}-prior-done`,
    occurrence_due_on: "2026-08-04",
    occurrence_key: "occurrence:2026-08-04",
    status: "done",
    task_id: taskId,
    updated_at: "2026-08-04T12:00:00.000Z",
    user_id: "u1",
    was_completed: true,
  };
}

function todayMissed(taskId: string): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: "2026-08-05T12:00:00.000Z",
    entry_date: today,
    event_type: "status",
    id: `${taskId}-today-missed`,
    occurrence_due_on: today,
    occurrence_key: `occurrence:${today}`,
    status: "missed",
    task_id: taskId,
    updated_at: "2026-08-05T12:00:00.000Z",
    user_id: "u1",
    was_completed: false,
  };
}

function rowFor(
  cache: ReturnType<typeof createStableTaskRowModelCache>,
  task: Task,
  taskScopedHistory: TaskHistory[],
  workspaceHistory = taskScopedHistory,
) {
  const historyByTaskId = buildTaskHistoryByTaskId(workspaceHistory, {
    [task.id]: taskScopedHistory,
  });
  const displayStatus = resolveActiveTaskStatuses({
    historyByTaskId,
    logicalDayRollover: "06:00",
    now: "2026-08-05T12:00:00.000Z",
    tasks: [task],
    timezone,
  }).statusesByTaskId[task.id];
  const row = cache.getOrCreate(task, {
    displayStatus,
    focusedTaskIdSet: new Set(),
    linkedNotes: [],
    listDefinitions: [],
    listMemberships: [],
    subtasks: [],
    taskHistory: taskScopedHistory,
    todayDateKey: today,
  });
  return { displayStatus, row };
}

test("live due-date and History mutations reach the shared Table/List row status without remounting", async () => {
  const taskId = "task-live-render-status";
  const initialHistory = [priorDayDone(taskId)];
  let tasks = [createTask({
    due_on: today,
    id: taskId,
    repeat_frequency: "daily",
    revision: 1,
    status: "pending",
    title: "Live status",
    user_id: "u1",
  })];
  let history = initialHistory;
  const staleWorkspaceHistory = [todayMissed(taskId)];
  let historyReconciliationCalls = 0;
  let persistenceShouldFail = false;

  const tableCache = createStableTaskRowModelCache();
  const listCache = createStableTaskRowModelCache();
  const beforeMutation = rowFor(tableCache, tasks[0]!, history, staleWorkspaceHistory);
  assert.equal(beforeMutation.displayStatus, "pending");
  assert.equal(beforeMutation.row.status, "pending");

  const useDueDateAction = (responseStatus: Task["status"]) => {
    const action = useTaskUpdateAction({
      currentDayKey: today,
      dayStartTime: "06:00",
      loadTaskHistoryForTasks: async () => ({
        [taskId]: { error: null, history, status: "ready" as const },
      }),
      logicalDayNow: new Date("2026-08-05T12:00:00.000Z"),
      onTaskHistoryMutation: (_taskId, nextHistory) => {
        historyReconciliationCalls += 1;
        history = nextHistory;
      },
      onTasksCompleted: async () => {},
      reconcileOverdueTaskMisses: async () => true,
      routeTask: () => {},
      setMessage: () => {},
      setTasks: (updater) => {
        tasks = typeof updater === "function" ? updater(tasks) : updater;
      },
      sortTasksForUi: (nextTasks) => nextTasks,
      syncTaskHistoryEntry: async () => true,
      tasks,
      timezone,
      updateTaskRowWithLegacyEnergyFallback: async (_id, values) => persistenceShouldFail
        ? {
          conflict: null,
          data: null,
          error: { message: "Persistence failed." },
          reappliedOnLatestRevision: false,
          usedActualSecondsFallback: false,
          usedEnergyFallback: false,
        }
        : {
          conflict: null,
          data: { ...tasks[0]!, ...values, status: responseStatus, revision: tasks[0]!.revision + 1 },
          error: null,
          reappliedOnLatestRevision: false,
          usedActualSecondsFallback: false,
          usedEnergyFallback: false,
        },
    });
    return action;
  };

  assert.equal(await useDueDateAction("pending").updateTask(taskId, { due_on: future }), true);
  const futureRow = rowFor(tableCache, tasks[0]!, history, staleWorkspaceHistory);
  const futureListRow = rowFor(listCache, tasks[0]!, history, staleWorkspaceHistory);
  assert.equal(tasks[0]!.due_on, future);
  assert.equal(futureRow.displayStatus, "not_due");
  assert.equal(futureRow.row.status, "not_due");
  assert.equal(futureListRow.row.status, "not_due");
  assert.equal(futureRow.row, rowFor(tableCache, tasks[0]!, history, staleWorkspaceHistory).row);

  const refreshedTask = { ...tasks[0]!, status: "not_due" as const };
  const refreshedRow = rowFor(createStableTaskRowModelCache(), refreshedTask, history, staleWorkspaceHistory);
  assert.equal(refreshedRow.row.status, futureRow.row.status);

  assert.equal(await useDueDateAction("pending").updateTask(taskId, { due_on: today }), true);
  const todayRow = rowFor(tableCache, tasks[0]!, history, staleWorkspaceHistory);
  assert.equal(todayRow.displayStatus, "pending");
  assert.equal(todayRow.row.status, "pending");

  const taskBeforeFailedSave = tasks[0]!;
  const rowBeforeFailedSave = rowFor(tableCache, taskBeforeFailedSave, history, staleWorkspaceHistory).row;
  const historyReconciliationCallsBeforeFailedSave = historyReconciliationCalls;
  persistenceShouldFail = true;
  assert.equal(await useDueDateAction("pending").updateTask(taskId, { due_on: future }), false);
  assert.equal(tasks[0]!.due_on, taskBeforeFailedSave.due_on);
  assert.equal(rowFor(tableCache, tasks[0]!, history, staleWorkspaceHistory).row.status, rowBeforeFailedSave.status);
  assert.equal(historyReconciliationCalls, historyReconciliationCallsBeforeFailedSave);

  const historyTaskId = "task-live-history-render";
  let historyTasks = [createTask({
    due_on: today,
    id: historyTaskId,
    repeat_frequency: "daily",
    revision: 1,
    status: "missed",
    title: "History live status",
    user_id: "u1",
  })];
  let historyRows = [todayMissed(historyTaskId)];
  const doneHistoryRow = { ...historyRows[0]!, id: `${historyTaskId}-today-done`, status: "done" as const, was_completed: true };
  const historyActions = useTaskHistoryActions({
    client: {
      from: () => ({
        upsert: () => ({
          select: () => Promise.resolve({ data: [doneHistoryRow], error: null }),
        }),
      }),
    } as never,
    currentUserId: "u1",
    currentDayKey: today,
    dayStartTime: "06:00",
    isTaskCompletedForHistory: (status) => status === "done" || status === "did_my_best",
    isTaskHistoryStatus: (status) => ["done", "did_my_best", "delayed", "missed"].includes(status),
    mapTaskHistoryRow: (row) => row,
    now: new Date("2026-08-05T12:00:00.000Z"),
    onHistoryMutation: (_taskId, nextHistory) => {
      historyRows = nextHistory ?? [];
    },
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: (updater) => {
      historyTasks = typeof updater === "function" ? updater(historyTasks) : updater;
    },
    sortTasksForUi: (nextTasks) => nextTasks,
    taskHistory: historyRows,
    tasks: historyTasks,
    timezone,
    updateTaskRowWithLegacyEnergyFallback: async (_id, values) => ({
      conflict: null,
      data: { ...historyTasks[0]!, ...values, status: "missed", revision: historyTasks[0]!.revision + 1 },
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });

  assert.equal(await historyActions.syncTaskHistoryEntries(historyTaskId, "done", [today], {
    historySnapshot: historyRows,
    syncLiveTask: true,
  }), true);
  const historyRow = rowFor(createStableTaskRowModelCache(), historyTasks[0]!, historyRows);
  assert.equal(historyRow.displayStatus, "upcoming");
  assert.equal(historyRow.row.status, "upcoming");
});

test("schedule-only callbacks pass the returned task for immediate Effective Timeline streak refresh", async () => {
  const todayDateKey = "2026-08-10";
  const backdatedDueOn = "2026-08-01";

  function explicitDone(taskId: string): TaskHistory {
    return {
      counted_as_due_occurrence: true,
      created_at: "2026-08-05T12:00:00.000Z",
      entry_date: "2026-08-05",
      event_type: "status",
      id: `${taskId}-done`,
      occurrence_due_on: backdatedDueOn,
      occurrence_key: `task:${taskId}:occurrence:${backdatedDueOn}`,
      status: "done",
      task_id: taskId,
      updated_at: "2026-08-05T12:00:00.000Z",
      user_id: "u1",
      was_completed: true,
    };
  }

  function sourceTask(id: string): Task {
    return createTask({
      created_at: "2026-08-10T12:00:00.000Z",
      due_on: todayDateKey,
      id,
      repeat_frequency: "daily",
      revision: 1,
      sort_order: 0,
      status: "pending",
      title: "Immediate streak refresh",
    });
  }

  type MutationCall = { taskId: string; history: TaskHistory[]; task: Task };
  function assertMutation(call: MutationCall | null, expectedTaskId: string, expectedHistory: TaskHistory[]) {
    assert.equal(call?.taskId, expectedTaskId);
    assert.deepEqual(call?.history, expectedHistory);
    assert.equal(call?.task.due_on, backdatedDueOn);
    assert.equal(call?.task.revision, 2);
    assert.equal(buildTaskHistoryStreakSummary(call!.task, call!.history, todayDateKey).missedStreak, 4);
    assert.equal(call!.history.length, 1);
    assert.equal(call!.history[0]?.id, expectedHistory[0]?.id);
  }

  const genericTask = sourceTask("task-live-generic-callback");
  const genericHistory = [explicitDone(genericTask.id)];
  let genericCall: MutationCall | null = null;
  const genericAction = useTaskUpdateAction({
    currentDayKey: todayDateKey,
    dayStartTime: "00:00",
    onTaskHistoryMutation: (taskId, history, nextTask) => {
      if (nextTask) genericCall = { history, task: nextTask, taskId };
    },
    onTasksCompleted: async () => {},
    reconcileOverdueTaskMisses: async () => true,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    taskHistory: genericHistory,
    tasks: [genericTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => ({
      conflict: null,
      data: { ...genericTask, ...values, revision: 2, status: "pending" },
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });
  assert.equal(await genericAction.updateTask(genericTask.id, { due_on: backdatedDueOn }), true);
  assertMutation(genericCall, genericTask.id, genericHistory);

  const editorTask = sourceTask("task-live-editor-callback");
  const editorHistory = [explicitDone(editorTask.id)];
  let editorCall: MutationCall | null = null;
  const editorAction = useTaskEditorSaveAction({
    currentDayKey: todayDateKey,
    currentUserId: "u1",
    focusedTaskIds: [],
    insertTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, usedEnergyFallback: false }),
    onTaskHistoryMutation: (taskId, history, nextTask) => {
      if (nextTask) editorCall = { history, task: nextTask, taskId };
    },
    onTasksCompleted: async () => {},
    replaceTaskSubtasks: async () => ({ saved: true, usedNestedFallback: false }),
    reconcileOverdueTaskMisses: async () => true,
    saveFocusSelection: async () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    syncTaskNoteLinks: async () => true,
    taskHistory: editorHistory,
    tasks: [editorTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => ({
      conflict: null,
      data: { ...editorTask, ...values, id: editorTask.id, revision: 2, status: "pending" },
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });
  assert.ok(await editorAction.saveTaskEditor({ ...editorTask, due_on: backdatedDueOn }, { taskId: editorTask.id }));
  assertMutation(editorCall, editorTask.id, editorHistory);

  const batchTask = sourceTask("task-live-batch-callback");
  const batchHistory = [explicitDone(batchTask.id)];
  let batchCall: MutationCall | null = null;
  const batchAction = useTaskBatchEditAction({
    clearListTaskSelection: () => {},
    currentDayKey: todayDateKey,
    focusedTaskIds: [],
    onTaskHistoryMutation: (taskId, history, nextTask) => {
      if (nextTask) batchCall = { history, task: nextTask, taskId };
    },
    onTasksCompleted: async () => {},
    parseDayOfMonth: () => null,
    parsePositiveInteger: (value) => Number.parseInt(value, 10),
    routeTask: () => {},
    saveFocusSelection: async () => {},
    selectedListTasks: [batchTask],
    setBatchEditProgress: () => {},
    setIsBatchEditModalOpen: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    taskHistory: batchHistory,
    tasks: [batchTask],
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => ({
      data: { ...batchTask, ...values, revision: 2, status: "pending" },
      error: null,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });
  await batchAction.applyBatchTaskEdit({
    dueOn: backdatedDueOn,
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
  assertMutation(batchCall, batchTask.id, batchHistory);
});

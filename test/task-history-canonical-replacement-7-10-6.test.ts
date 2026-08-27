import assert from "node:assert/strict";
import test from "node:test";

import { useTaskHistoryActions } from "../src/hooks/useTaskHistoryActions.ts";
import { useTaskUpdateAction } from "../src/hooks/useTaskUpdateAction.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import type {
  TaskStateRuntimeExecutionResult,
  TaskStateRuntimeLocalTask,
} from "../src/lib/task-state-runtime-executor.ts";

const logicalDate = "2026-08-19";

function canonicalTask(revision = 25, status: Task["status"] = "pending"): TaskStateRuntimeLocalTask {
  return {
    ...createTask({
      created_at: "2026-08-01T12:00:00.000Z",
      id: "history-replacement-task",
      revision: 1,
      sort_order: 1,
      status,
      title: "History replacement",
    }),
    canonical_revision: revision,
    canonicalization_status: "canonical_proven",
    entity_kind: "parent",
  };
}

function historyEntry(taskId: string, status: TaskHistory["status"]): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: "2026-08-19T09:00:00.000Z",
    entry_date: logicalDate,
    event_type: "status",
    id: `${taskId}-${logicalDate}`,
    occurrence_due_on: logicalDate,
    occurrence_key: `occurrence:${logicalDate}`,
    status,
    task_id: taskId,
    updated_at: "2026-08-19T09:00:00.000Z",
    user_id: "user-1",
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
  };
}

function committed(task: TaskStateRuntimeLocalTask, status = task.status, rewardEntitlementId?: string): TaskStateRuntimeExecutionResult {
  const expectedRevision = task.canonical_revision ?? 0;
  return {
    success: true,
    task: {
      ...task,
      canonical_revision: expectedRevision + 1,
      status,
    },
    response: {
      success: true,
      state: "committed",
      task_id: task.id,
      command_id: `command-${expectedRevision}`,
      expected_revision: expectedRevision,
      next_revision: expectedRevision + 1,
      was_replayed: false,
      conflict_code: null,
      canonical_task_patch: {},
      compatibility_projection: {},
      side_effect_ids: rewardEntitlementId ? { reward_entitlement_id: rewardEntitlementId } : {},
      error: null,
    },
  };
}

function failed(message = "Canonical command failed."): TaskStateRuntimeExecutionResult {
  return {
    success: false,
    task: null,
    response: null,
    error: {
      kind: "command_rejected",
      message,
      code: "STALE_REVISION",
      status: 409,
    },
  };
}

function buildHistoryActions(
  initialTask: TaskStateRuntimeLocalTask,
  execute: NonNullable<Parameters<typeof useTaskHistoryActions>[0]["canonicalCommandExecutor"]>,
  messages: Array<{ tone: string; text: string }>,
  initialHistory: TaskHistory[] = [historyEntry(initialTask.id, "done")],
  onHistorySet?: (history: TaskHistory[]) => void,
) {
  let localTasks: Task[] = [initialTask];
  return useTaskHistoryActions({
    canonicalCommandExecutor: execute,
    client: {} as never,
    currentUserId: "user-1",
    currentDayKey: logicalDate,
    loadTaskHistoryForTasks: async (taskIds) => Object.fromEntries(taskIds.map((taskId) => [taskId, { status: "ready", history: [] }])),
    setMessage: (message) => {
      const next = typeof message === "function" ? message(messages.at(-1) ?? null) : message;
      if (next) messages.push(next);
    },
    setTaskHistory: (updater) => {
      const nextHistory = typeof updater === "function" ? updater(initialHistory) : updater;
      onHistorySet?.(nextHistory);
    },
    setTasks: (updater) => {
      localTasks = typeof updater === "function" ? updater(localTasks) : updater;
    },
    sortTasksForUi: (tasks) => tasks,
    taskHistory: initialHistory,
    tasks: localTasks,
    timezone: "UTC",
  });
}

test("clear revision 25 is carried into the following Done command", async () => {
  const initialTask = canonicalTask();
  const calls: Array<{ actionType: string; expectedRevision: number }> = [];
  const messages: Array<{ tone: string; text: string }> = [];
  const actions = buildHistoryActions(initialTask, async (action, task) => {
    calls.push({ actionType: action.actionType, expectedRevision: action.expectedRevision });
    return committed(task, action.actionType === "set_outcome" ? "done" : "pending", "entitlement-1");
  }, messages);

  let currentTask: TaskStateRuntimeLocalTask | null = initialTask;
  assert.equal(await actions.syncTaskHistoryEntries(initialTask.id, "pending", [logicalDate], {
    currentTask,
    onTaskCommitted: (task) => { currentTask = task; },
  }), true);
  assert.equal(currentTask?.canonical_revision, 26);
  assert.equal(await actions.syncTaskHistoryEntries(initialTask.id, "done", [logicalDate], {
    currentTask,
    onTaskCommitted: (task) => { currentTask = task; },
  }), true);

  assert.deepEqual(calls, [
    { actionType: "clear_outcome", expectedRevision: 25 },
    { actionType: "set_outcome", expectedRevision: 26 },
  ]);
  assert.equal(messages.length, 0);
});

test("Not Due to Done and Done to Missed replacements use the newest Task revision", async () => {
  const initialTask = canonicalTask();
  const expectedRevisions: number[] = [];
  const actions = buildHistoryActions(initialTask, async (action, task) => {
    expectedRevisions.push(action.expectedRevision);
    return committed(task, action.actionType === "set_outcome" ? "missed" : "pending");
  }, []);

  let currentTask: TaskStateRuntimeLocalTask | null = initialTask;
  for (const status of ["done", "missed"] as const) {
    assert.equal(await actions.syncTaskHistoryEntries(initialTask.id, "pending", [logicalDate], {
      currentTask,
      onTaskCommitted: (task) => { currentTask = task; },
    }), true);
    assert.equal(await actions.syncTaskHistoryEntries(initialTask.id, status, [logicalDate], {
      currentTask,
      onTaskCommitted: (task) => { currentTask = task; },
    }), true);
  }

  assert.deepEqual(expectedRevisions, [25, 26, 27, 28]);
});

test("multi-select sequential replacement carries the newest revision across every clear and outcome", async () => {
  const initialTask = canonicalTask();
  const expectedRevisions: number[] = [];
  const actions = buildHistoryActions(initialTask, async (action, task) => {
    expectedRevisions.push(action.expectedRevision);
    return committed(task, action.actionType === "set_outcome" ? "done" : "pending");
  }, []);

  let currentTask: TaskStateRuntimeLocalTask | null = initialTask;
  for (const entryDate of ["2026-08-17", "2026-08-18", logicalDate]) {
    assert.equal(await actions.syncTaskHistoryEntries(initialTask.id, "pending", [entryDate], {
      currentTask,
      onTaskCommitted: (task) => { currentTask = task; },
    }), true);
    assert.equal(await actions.syncTaskHistoryEntries(initialTask.id, "done", [entryDate], {
      currentTask,
      onTaskCommitted: (task) => { currentTask = task; },
    }), true);
  }

  assert.deepEqual(expectedRevisions, [25, 26, 27, 28, 29, 30]);
});

test("a failed clear prevents replacement, and a failed replacement stops the batch", async () => {
  const initialTask = canonicalTask();
  const clearCalls: string[] = [];
  const clearMessages: Array<{ tone: string; text: string }> = [];
  const clearActions = buildHistoryActions(initialTask, async (action) => {
    clearCalls.push(action.actionType);
    return failed("The clear command was rejected.");
  }, clearMessages);

  let currentTask: TaskStateRuntimeLocalTask | null = initialTask;
  const cleared = await clearActions.syncTaskHistoryEntries(initialTask.id, "pending", [logicalDate], {
    currentTask,
    onTaskCommitted: (task) => { currentTask = task; },
  });
  if (cleared) {
    await clearActions.syncTaskHistoryEntries(initialTask.id, "done", [logicalDate], { currentTask });
  }
  assert.equal(cleared, false);
  assert.deepEqual(clearCalls, ["clear_outcome"]);
  assert.match(clearMessages.at(-1)?.text ?? "", /clear command was rejected/i);

  const replacementCalls: string[] = [];
  const replacementMessages: Array<{ tone: string; text: string }> = [];
  const replacementActions = buildHistoryActions(initialTask, async (action) => {
    replacementCalls.push(action.actionType);
    return failed("The replacement command was rejected.");
  }, replacementMessages);
  assert.equal(await replacementActions.syncTaskHistoryEntries(initialTask.id, "done", ["2026-08-18", logicalDate]), false);
  assert.deepEqual(replacementCalls, ["set_outcome"]);
  assert.match(replacementMessages.at(-1)?.text ?? "", /replacement command was rejected/i);
});

test("a failed History outcome replacement leaves the original outcome untouched", async () => {
  const initialTask = canonicalTask();
  const original = historyEntry(initialTask.id, "missed");
  let visibleHistory = [original];
  const calls: string[] = [];
  const messages: Array<{ tone: string; text: string }> = [];
  const actions = buildHistoryActions(initialTask, async (action) => {
    calls.push(action.actionType);
    return failed("The outcome replacement was rejected.");
  }, messages, visibleHistory, (history) => {
    visibleHistory = history;
  });

  assert.equal(await actions.syncTaskHistoryEntries(initialTask.id, "done", [logicalDate], { historicalOverride: true }), false);
  assert.deepEqual(calls, ["set_outcome"]);
  assert.deepEqual(visibleHistory, [original]);
  assert.match(messages.at(-1)?.text ?? "", /outcome replacement was rejected/i);
});

test("the clear callback exposes the committed Task for the following Calendar override", async () => {
  const initialTask = canonicalTask();
  const calls: Array<{ actionType: string; expectedRevision: number }> = [];
  let localTasks: Task[] = [initialTask];
  let committedClearTask: TaskStateRuntimeLocalTask | null = null;
  const update = useTaskUpdateAction({
    canonicalCommandExecutor: async (action, task) => {
      calls.push({ actionType: action.actionType, expectedRevision: action.expectedRevision });
      return committed(task, action.actionType === "calendar_override" ? "not_due" : "pending");
    },
    currentDayKey: logicalDate,
    dayStartTime: "00:00",
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: () => {},
    setTasks: (updater) => {
      localTasks = typeof updater === "function" ? updater(localTasks) : updater;
    },
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: localTasks,
    timezone: "UTC",
    updateTaskRowWithLegacyEnergyFallback: async () => {
      throw new Error("Legacy Task writes must not run.");
    },
  });

  assert.equal(await update.updateTask(initialTask.id, {}, {
    canonicalIntent: { type: "clear_outcome", logical_date: logicalDate },
    expectedTask: initialTask,
    onCanonicalTaskCommitted: (task) => { committedClearTask = task; },
  }), true);
  assert.equal(committedClearTask?.canonical_revision, 26);
  assert.equal(await update.updateTask(initialTask.id, {}, {
    canonicalIntent: { type: "calendar_override", logical_date: logicalDate, override_state: "not_due" },
    expectedTask: committedClearTask,
  }), true);

  assert.deepEqual(calls, [
    { actionType: "clear_outcome", expectedRevision: 25 },
    { actionType: "calendar_override", expectedRevision: 26 },
  ]);
});

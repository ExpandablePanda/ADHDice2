import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { useTaskHistoryActions } from "../src/hooks/useTaskHistoryActions.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { TaskHistory } from "../src/lib/database.types.ts";
import type { TaskStateRuntimeExecutionResult, TaskStateRuntimeLocalTask } from "../src/lib/task-state-runtime-executor.ts";

function canonicalTask(id: string): TaskStateRuntimeLocalTask {
  return {
    ...createTask({ id, status: "pending", title: "Canonical Calendar", sort_order: 1 }),
    canonical_revision: 4,
    canonicalization_status: "canonical_proven",
    entity_kind: "parent",
  };
}

function historyEntry(taskId: string, status: TaskHistory["status"]): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: "2026-08-19T09:00:00.000Z",
    entry_date: "2026-08-19",
    event_type: "status",
    id: `${taskId}-2026-08-19`,
    occurrence_due_on: "2026-08-19",
    occurrence_key: "occurrence:2026-08-19",
    status,
    task_id: taskId,
    updated_at: "2026-08-19T09:00:00.000Z",
    user_id: "user-1",
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
  };
}

function commandResult(task: TaskStateRuntimeLocalTask, status: TaskStateRuntimeLocalTask["status"]): TaskStateRuntimeExecutionResult {
  return {
    success: true,
    task: { ...task, status, canonical_revision: (task.canonical_revision ?? 0) + 1 },
    response: {
      success: true,
      state: "committed",
      task_id: task.id,
      command_id: "command-calendar",
      expected_revision: task.canonical_revision ?? 0,
      next_revision: (task.canonical_revision ?? 0) + 1,
      was_replayed: false,
      conflict_code: null,
      canonical_task_patch: {},
      compatibility_projection: {},
      side_effect_ids: { reward_entitlement_id: "entitlement-calendar-1" },
      error: null,
    },
  };
}

function failedResult(message = "Canonical command failed."): TaskStateRuntimeExecutionResult {
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

test("canonical History Calendar outcome uses set_outcome and never writes legacy History", async () => {
  const task = canonicalTask("canonical-calendar");
  const existing: TaskHistory = {
    counted_as_due_occurrence: true,
    created_at: "2026-08-09T09:00:00.000Z",
    entry_date: "2026-08-09",
    event_type: "status",
    id: "canonical-history",
    occurrence_due_on: "2026-08-09",
    occurrence_key: "occurrence:2026-08-09",
    status: "missed",
    task_id: task.id,
    updated_at: "2026-08-09T09:00:00.000Z",
    user_id: "user-1",
    was_completed: false,
  };
  let actionType = "";
  let fromCalls = 0;
  let rewardCalls = 0;
  let localTask = task;
  const actions = useTaskHistoryActions({
    canonicalCommandExecutor: async (action, currentTask) => {
      actionType = action.actionType;
      return commandResult(currentTask, "done");
    },
    client: { from: () => { fromCalls += 1; throw new Error("legacy History write"); } } as never,
    currentDayKey: "2026-08-10",
    currentUserId: "user-1",
    dayStartTime: "06:00",
    isTaskCompletedForHistory: (status) => status === "done" || status === "did_my_best" || status === "complete",
    isTaskHistoryStatus: (status) => status === "done" || status === "did_my_best" || status === "missed" || status === "complete",
    mapTaskHistoryRow: (row) => row,
    now: new Date("2026-08-10T12:00:00.000Z"),
    onTasksCompleted: async (candidates) => { rewardCalls += candidates.length; },
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: (updater) => { localTask = (typeof updater === "function" ? updater([localTask]) : updater)[0] as TaskStateRuntimeLocalTask; },
    sortTasksForUi: (tasks) => tasks,
    taskHistory: [existing],
    tasks: [task],
    timezone: "UTC",
    updateTaskRowWithLegacyEnergyFallback: async () => { throw new Error("legacy Task write"); },
  });

  assert.equal(await actions.syncTaskHistoryEntries(task.id, "done", [existing.entry_date], { historicalOverride: true }), true);
  assert.equal(actionType, "set_outcome");
  assert.equal(rewardCalls, 1);
  assert.equal(fromCalls, 0);
  assert.equal(localTask.status, "done");
});

test("multi-date History sync threads revisions and reconciles once after the sequence", async () => {
  const task = canonicalTask("multi-date-calendar");
  const dates = ["2026-08-19", "2026-08-17", "2026-08-18"];
  const receivedTasks: TaskStateRuntimeLocalTask[] = [];
  const returnedTasks: TaskStateRuntimeLocalTask[] = [];
  const commandDates: string[] = [];
  const refreshedHistory = [historyEntry(task.id, "done")];
  let loadCalls = 0;
  let mutationCalls = 0;
  let visibleHistory: TaskHistory[] = [];
  let localTasks: Task[] = [task];
  const actions = useTaskHistoryActions({
    canonicalCommandExecutor: async (action, currentTask) => {
      receivedTasks.push(currentTask);
      commandDates.push(action.intent?.logical_date ?? "");
      const result = commandResult(currentTask, "done");
      returnedTasks.push(result.task);
      return result;
    },
    client: {} as never,
    currentDayKey: "2026-08-20",
    currentUserId: "user-1",
    loadTaskHistoryForTasks: async (taskIds) => {
      loadCalls += 1;
      assert.deepEqual(taskIds, [task.id]);
      return { [task.id]: { status: "ready", history: refreshedHistory } };
    },
    onHistoryMutation: (taskId, nextHistory) => {
      mutationCalls += 1;
      assert.equal(taskId, task.id);
      assert.deepEqual(nextHistory, refreshedHistory);
    },
    setMessage: () => {},
    setTaskHistory: (updater) => {
      visibleHistory = typeof updater === "function" ? updater(visibleHistory) : updater;
    },
    setTasks: (updater) => {
      localTasks = typeof updater === "function" ? updater(localTasks) : updater;
    },
    sortTasksForUi: (nextTasks) => nextTasks,
    taskHistory: [],
    tasks: [task],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(task.id, "done", dates, {
    historicalOverride: true,
    syncLiveTask: true,
  }), true);
  assert.deepEqual(commandDates, ["2026-08-17", "2026-08-18", "2026-08-19"]);
  assert.deepEqual(receivedTasks.map((received) => received.canonical_revision), [4, 5, 6]);
  assert.equal(receivedTasks[1], returnedTasks[0]);
  assert.equal(receivedTasks[2], returnedTasks[1]);
  assert.equal(loadCalls, 1);
  assert.equal(mutationCalls, 1);
  assert.deepEqual(visibleHistory, refreshedHistory);
  assert.equal(localTasks[0]?.canonical_revision, 7);
  assert.equal(localTasks[0]?.status, "done");
});

test("multi-date History sync stops on the first failed canonical command", async () => {
  const task = canonicalTask("failed-multi-date-calendar");
  const commandDates: string[] = [];
  const messages: Array<{ tone: string; text: string }> = [];
  let loadCalls = 0;
  const actions = useTaskHistoryActions({
    canonicalCommandExecutor: async (action, currentTask) => {
      commandDates.push(action.intent?.logical_date ?? "");
      return commandDates.length === 2 ? failedResult("The second command was rejected.") : commandResult(currentTask, "done");
    },
    client: {} as never,
    currentDayKey: "2026-08-20",
    currentUserId: "user-1",
    loadTaskHistoryForTasks: async () => {
      loadCalls += 1;
      return {};
    },
    setMessage: (message) => {
      const next = typeof message === "function" ? message(messages.at(-1) ?? null) : message;
      if (next) messages.push(next);
    },
    setTaskHistory: () => {},
    setTasks: () => {},
    sortTasksForUi: (nextTasks) => nextTasks,
    taskHistory: [],
    tasks: [task],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(task.id, "done", ["2026-08-17", "2026-08-18", "2026-08-19"], {
    historicalOverride: true,
  }), false);
  assert.deepEqual(commandDates, ["2026-08-17", "2026-08-18"]);
  assert.equal(loadCalls, 0);
  assert.match(messages.at(-1)?.text ?? "", /second command was rejected/i);
});

test("History mutation production code has no direct legacy History write or legacy status derivation", () => {
  const source = readFileSync(new URL("../src/hooks/useTaskHistoryActions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /adhdice_task_history|client\s*\.from\(|\.upsert\(/);
  assert.doesNotMatch(source, /resolveRecurringLiveStatusFromNextDueDate|calcNextDueDateFromDate/);
  assert.match(source, /classifyTaskStateRuntimeAction/);
  assert.match(source, /executeTaskStateRuntimeAction/);
});

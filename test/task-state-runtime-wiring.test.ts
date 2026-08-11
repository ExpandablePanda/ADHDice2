import assert from "node:assert/strict";
import test from "node:test";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task } from "../src/lib/database.types.ts";
import { useTaskUpdateAction } from "../src/hooks/useTaskUpdateAction.ts";
import type {
  TaskStateRuntimeExecutionResult,
  TaskStateRuntimeLocalTask,
} from "../src/lib/task-state-runtime-executor.ts";

function task(overrides: Partial<TaskStateRuntimeLocalTask> = {}): TaskStateRuntimeLocalTask {
  return {
    ...createTask({
      created_at: "2026-08-10T12:00:00.000Z",
      id: "task-1",
      sort_order: 1,
      status: "pending",
      title: "Workflow task",
    }),
    canonicalization_status: "canonical_proven",
    canonical_revision: 4,
    workflow_state: "none",
    workflow_started_at: null,
    workflow_logical_date: null,
    workflow_occurrence_id: null,
    workflow_command_id: null,
    workflow_revision: 1,
    ...overrides,
  };
}

function committedTask(currentTask: TaskStateRuntimeLocalTask, status: Task["status"]): TaskStateRuntimeLocalTask {
  return {
    ...currentTask,
    canonical_revision: (currentTask.canonical_revision ?? 0) + 1,
    canonicalization_status: "canonical_runtime",
    status,
    workflow_state: status === "in_progress" ? "in_progress" : "none",
    workflow_started_at: status === "in_progress" ? "2026-08-10T12:01:00.000Z" : null,
    workflow_logical_date: status === "in_progress" ? "2026-08-10" : null,
    workflow_command_id: status === "in_progress" ? "command-1" : null,
    workflow_revision: (currentTask.workflow_revision ?? 0) + 1,
  };
}

function success(taskResult: TaskStateRuntimeLocalTask): TaskStateRuntimeExecutionResult {
  return {
    success: true,
    task: taskResult,
    response: {
      success: true,
      state: "committed",
      task_id: taskResult.id,
      command_id: "command-1",
      expected_revision: 4,
      next_revision: taskResult.canonical_revision ?? 5,
      was_replayed: false,
      conflict_code: null,
      canonical_task_patch: {},
      compatibility_projection: {},
      side_effect_ids: {},
      error: null,
    },
  };
}

function failure(message = "Canonical command failed."): TaskStateRuntimeExecutionResult {
  return {
    success: false,
    task: null,
    response: null,
    error: { kind: "command_rejected", message, code: "STALE_REVISION", status: 409 },
  };
}

function useBuildUpdateAction(input: {
  currentTask: TaskStateRuntimeLocalTask;
  canonicalCommandsEnabled: boolean;
  execute?: (action: Parameters<NonNullable<Parameters<typeof useTaskUpdateAction>[0]["canonicalCommandExecutor"]>>[0], task: TaskStateRuntimeLocalTask) => Promise<TaskStateRuntimeExecutionResult>;
  updateLegacy: () => Promise<{ data: Task | null; error: { message: string } | null; conflict: null; reappliedOnLatestRevision: boolean; usedActualSecondsFallback: boolean; usedEnergyFallback: boolean }>;
  setTasks: (updater: (current: Task[]) => Task[]) => void;
  setMessage: (message: { tone: "neutral" | "good" | "warn"; text: string }) => void;
  onTasksCompleted: () => Promise<void>;
  syncHistory: () => Promise<boolean>;
  reconcileMisses: () => Promise<boolean>;
}) {
  return useTaskUpdateAction({
    canonicalCommandExecutor: input.execute,
    canonicalCommandsEnabled: input.canonicalCommandsEnabled,
    currentDayKey: "2026-08-10",
    onTasksCompleted: input.onTasksCompleted,
    reconcileOverdueTaskMisses: input.reconcileMisses,
    routeTask: () => {},
    setMessage: input.setMessage,
    setTasks: input.setTasks,
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: input.syncHistory,
    tasks: [input.currentTask],
    updateTaskRowWithLegacyEnergyFallback: input.updateLegacy,
  });
}

test("gate-enabled Pending to In Progress uses start_in_progress and bypasses every legacy state side effect", async () => {
  const currentTask = task();
  let legacyWrites = 0;
  let historyWrites = 0;
  let rewardCalls = 0;
  let overdueCalls = 0;
  let receivedActionType: string | null = null;
  let receivedRevision: number | null = null;
  let receivedReplayIdentity: string | null = null;
  let localTasks: Task[] = [currentTask];

  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: true,
    currentTask,
    execute: async (action, taskForAction) => {
      receivedActionType = action.actionType;
      receivedRevision = action.intent?.expected_revision ?? null;
      receivedReplayIdentity = action.intent?.replay_identity ?? null;
      return success(committedTask(taskForAction, "in_progress"));
    },
    onTasksCompleted: async () => { rewardCalls += 1; },
    reconcileMisses: async () => { overdueCalls += 1; return true; },
    setMessage: () => {},
    setTasks: (updater) => { localTasks = updater(localTasks); },
    syncHistory: async () => { historyWrites += 1; return true; },
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, { status: "in_progress" }), true);
  assert.equal(receivedActionType, "start_in_progress");
  assert.equal(receivedRevision, 4);
  assert.match(receivedReplayIdentity ?? "", /^[0-9a-f-]{36}$/i);
  assert.equal(legacyWrites, 0);
  assert.equal(historyWrites, 0);
  assert.equal(rewardCalls, 0);
  assert.equal(overdueCalls, 0);
  assert.equal(localTasks[0]?.status, "in_progress");
  assert.equal((localTasks[0] as TaskStateRuntimeLocalTask | undefined)?.canonical_revision, 5);
});

test("gate-enabled In Progress to Pending uses clear_in_progress with the same canonical-only boundary", async () => {
  const currentTask = task({ status: "in_progress", workflow_state: "in_progress", canonical_revision: 8 });
  let legacyWrites = 0;
  let historyWrites = 0;
  let rewardCalls = 0;
  let actionType: string | null = null;
  let expectedRevision: number | null = null;

  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: true,
    currentTask,
    execute: async (action, taskForAction) => {
      actionType = action.actionType;
      expectedRevision = action.intent?.expected_revision ?? null;
      return success(committedTask(taskForAction, "pending"));
    },
    onTasksCompleted: async () => { rewardCalls += 1; },
    reconcileMisses: async () => true,
    setMessage: () => {},
    setTasks: () => {},
    syncHistory: async () => { historyWrites += 1; return true; },
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, { status: "pending" }), true);
  assert.equal(actionType, "clear_in_progress");
  assert.equal(expectedRevision, 8);
  assert.equal(legacyWrites, 0);
  assert.equal(historyWrites, 0);
  assert.equal(rewardCalls, 0);
});

test("gate-enabled Archive, Trash, and Restore use canonical lifecycle commands and server projections", async () => {
  const cases = [
    { actionType: "archive_task", from: "pending" as const, requested: "archived" as const, projected: "archived" as const },
    { actionType: "trash_task", from: "archived" as const, requested: "trashed" as const, projected: "trashed" as const },
    { actionType: "restore_task", from: "trashed" as const, requested: "pending" as const, projected: "in_progress" as const },
  ] as const;

  for (const currentCase of cases) {
    const currentTask = task({ id: `task-${currentCase.actionType}`, status: currentCase.from });
    let legacyWrites = 0;
    let historyWrites = 0;
    let rewardCalls = 0;
    let receivedActionType: string | null = null;
    let receivedRevision: number | null = null;
    let receivedReplayIdentity: string | null = null;
    let localTasks: Task[] = [currentTask];

    // Each iteration is an isolated plain-function hook harness for one lifecycle case.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const update = useBuildUpdateAction({
      canonicalCommandsEnabled: true,
      currentTask,
      execute: async (action, taskForAction) => {
        receivedActionType = action.actionType;
        receivedRevision = action.intent?.expected_revision ?? null;
        receivedReplayIdentity = action.intent?.replay_identity ?? null;
        return success(committedTask(taskForAction, currentCase.projected));
      },
      onTasksCompleted: async () => { rewardCalls += 1; },
      reconcileMisses: async () => true,
      setMessage: () => {},
      setTasks: (updater) => { localTasks = updater(localTasks); },
      syncHistory: async () => { historyWrites += 1; return true; },
      updateLegacy: async () => {
        legacyWrites += 1;
        return { data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
      },
    });

    assert.equal(await update.updateTask(currentTask.id, { status: currentCase.requested }), true);
    assert.equal(receivedActionType, currentCase.actionType);
    assert.equal(receivedRevision, 4);
    assert.match(receivedReplayIdentity ?? "", /^[0-9a-f-]{36}$/i);
    assert.equal(localTasks[0]?.status, currentCase.projected);
    assert.equal(legacyWrites, 0);
    assert.equal(historyWrites, 0);
    assert.equal(rewardCalls, 0);
  }
});

test("gate-enabled canonical failure leaves the local Task uncommitted and surfaces a warning", async () => {
  const currentTask = task();
  let localTasks: Task[] = [currentTask];
  let legacyWrites = 0;
  let warning = "";
  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: true,
    currentTask,
    execute: async () => failure("This task changed before the canonical action could be committed."),
    onTasksCompleted: async () => {},
    reconcileMisses: async () => true,
    setMessage: (message) => { warning = message.text; },
    setTasks: (updater) => { localTasks = updater(localTasks); },
    syncHistory: async () => true,
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, { status: "in_progress" }), false);
  assert.equal(legacyWrites, 0);
  assert.deepEqual(localTasks[0], currentTask);
  assert.match(warning, /changed before/);
});

test("gate-enabled lifecycle failure never falls back to a legacy lifecycle write", async () => {
  const currentTask = task({ status: "pending" });
  let legacyWrites = 0;
  let warning = "";
  let localTasks: Task[] = [currentTask];
  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: true,
    currentTask,
    execute: async () => failure("Canonical Trash was rejected."),
    onTasksCompleted: async () => {},
    reconcileMisses: async () => true,
    setMessage: (message) => { warning = message.text; },
    setTasks: (updater) => { localTasks = updater(localTasks); },
    syncHistory: async () => true,
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, { status: "trashed" }), false);
  assert.equal(legacyWrites, 0);
  assert.deepEqual(localTasks[0], currentTask);
  assert.match(warning, /rejected/);
});

test("disabled gate preserves the existing legacy Task State path", async () => {
  const currentTask = task();
  let legacyWrites = 0;
  let historyWrites = 0;
  let rewardCalls = 0;
  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: false,
    currentTask,
    onTasksCompleted: async () => { rewardCalls += 1; },
    reconcileMisses: async () => true,
    setMessage: () => {},
    setTasks: () => {},
    syncHistory: async () => { historyWrites += 1; return true; },
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: { ...currentTask, status: "in_progress" }, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, { status: "in_progress" }), true);
  assert.equal(legacyWrites, 1);
  assert.equal(historyWrites, 1);
  assert.equal(rewardCalls, 1);
});

test("disabled gate preserves the legacy Archive path", async () => {
  const currentTask = task();
  let legacyWrites = 0;
  let historyWrites = 0;
  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: false,
    currentTask,
    onTasksCompleted: async () => {},
    reconcileMisses: async () => true,
    setMessage: () => {},
    setTasks: () => {},
    syncHistory: async () => { historyWrites += 1; return true; },
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: { ...currentTask, status: "archived" }, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, { status: "archived" }), true);
  assert.equal(legacyWrites, 1);
  assert.equal(historyWrites, 1);
});

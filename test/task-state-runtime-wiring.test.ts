import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  routeTask?: Parameters<typeof useTaskUpdateAction>[0]["routeTask"];
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
    routeTask: input.routeTask ?? (() => {}),
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

test("gate-enabled Restore waits for canonical commit and routes from the returned projection", async () => {
  const currentTask = task({ status: "trashed" });
  const events: string[] = [];
  let localTasks: Task[] = [currentTask];
  let projectedTask: TaskStateRuntimeLocalTask | null = null;
  let resolveCanonical!: (result: TaskStateRuntimeExecutionResult) => void;
  const canonicalResponse = new Promise<TaskStateRuntimeExecutionResult>((resolve) => {
    resolveCanonical = resolve;
  });
  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: true,
    currentTask,
    execute: async (action, taskForAction) => {
      events.push(`execute:${action.actionType}`);
      projectedTask = committedTask(taskForAction, "in_progress");
      const result = await canonicalResponse;
      events.push("canonical-committed");
      return result;
    },
    onTasksCompleted: async () => {},
    reconcileMisses: async () => true,
    routeTask: (_taskId, bucket) => { events.push(`route:${bucket ?? "none"}`); },
    setMessage: () => {},
    setTasks: (updater) => { localTasks = updater(localTasks); },
    syncHistory: async () => true,
    updateLegacy: async () => {
      throw new Error("Restore must not use the legacy writer when the gate is enabled.");
    },
  });

  const pendingRestore = update.updateTask(currentTask.id, { status: "pending" });
  await Promise.resolve();
  assert.deepEqual(events, ["execute:restore_task"]);
  assert.equal(localTasks[0]?.status, "trashed");

  resolveCanonical(success(projectedTask!));
  assert.equal(await pendingRestore, true);
  assert.deepEqual(events, ["execute:restore_task", "canonical-committed", "route:inbox"]);
  assert.equal(localTasks[0]?.status, "in_progress");
});

test("gate-enabled Restore failure leaves routing and legacy writes unchanged", async () => {
  const currentTask = task({ status: "trashed" });
  const routes: string[] = [];
  let localTasks: Task[] = [currentTask];
  let legacyWrites = 0;
  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: true,
    currentTask,
    execute: async () => failure("Restore was rejected at the canonical boundary."),
    onTasksCompleted: async () => {},
    reconcileMisses: async () => true,
    routeTask: (_taskId, bucket) => { routes.push(bucket ?? "none"); },
    setMessage: () => {},
    setTasks: (updater) => { localTasks = updater(localTasks); },
    syncHistory: async () => true,
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, { status: "pending" }), false);
  assert.deepEqual(routes, []);
  assert.equal(legacyWrites, 0);
  assert.deepEqual(localTasks[0], currentTask);
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

for (const [status, actionType] of [
  ["done", "set_outcome"],
  ["did_my_best", "set_outcome"],
  ["missed", "set_outcome"],
  ["complete", "complete_task"],
] as const) {
  test(`gate-enabled ${status} uses the canonical command without legacy History, reward, or recurrence work`, async () => {
    const currentTask = task();
    let receivedActionType: string | null = null;
    let legacyWrites = 0;
    let historyWrites = 0;
    let rewardCalls = 0;
    let overdueCalls = 0;
    const update = useBuildUpdateAction({
      canonicalCommandsEnabled: true,
      currentTask,
      execute: async (action, taskForAction) => {
        receivedActionType = action.actionType;
        return success(committedTask(taskForAction, status));
      },
      onTasksCompleted: async () => { rewardCalls += 1; },
      reconcileMisses: async () => { overdueCalls += 1; return true; },
      setMessage: () => {},
      setTasks: () => {},
      syncHistory: async () => { historyWrites += 1; return true; },
      updateLegacy: async () => {
        legacyWrites += 1;
        return { data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
      },
    });

    assert.equal(await update.updateTask(currentTask.id, { status }), true);
    assert.equal(receivedActionType, actionType);
    assert.equal(legacyWrites, 0);
    assert.equal(historyWrites, 0);
    assert.equal(rewardCalls, 0);
    assert.equal(overdueCalls, 0);
  });
}

test("gate-enabled due-date and repeat edits use canonical schedule commands and fail closed on invocation failure", async () => {
  const currentTask = task({ due_on: "2026-08-10", repeat_frequency: "daily", repeat_interval: 1 });
  const actionTypes: string[] = [];
  let legacyWrites = 0;
  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: true,
    currentTask,
    execute: async (action, taskForAction) => {
      actionTypes.push(action.actionType);
      return action.actionType === "set_repeat"
        ? failure("The repeat command was rejected.")
        : success({ ...taskForAction, due_on: "2026-08-12", canonical_revision: 5 });
    },
    onTasksCompleted: async () => {},
    reconcileMisses: async () => true,
    setMessage: () => {},
    setTasks: () => {},
    syncHistory: async () => true,
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, { due_on: "2026-08-12" }), true);
  assert.equal(await update.updateTask(currentTask.id, { repeat_frequency: "weekly", repeat_interval: 1 }), false);
  assert.deepEqual(actionTypes, ["set_due_date", "set_repeat"]);
  assert.equal(legacyWrites, 0);
});

test("same-client near-simultaneous due-date saves deduplicate in-flight commands and rebase later intent", async () => {
  const currentTask = task({ due_on: "2026-08-10" });
  const received: Array<{ dueOn: string | null; expectedRevision: number }> = [];
  let localTasks: Task[] = [currentTask];
  let releaseFirst!: () => void;
  const firstCommand = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let commandCount = 0;
  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: true,
    currentTask,
    execute: async (action, taskForAction) => {
      commandCount += 1;
      received.push({
        dueOn: action.scheduleChanges?.due_on ?? null,
        expectedRevision: action.expectedRevision,
      });
      if (commandCount === 1) await firstCommand;
      const dueOn = action.scheduleChanges?.due_on ?? taskForAction.due_on;
      return success({
        ...taskForAction,
        canonical_revision: (taskForAction.canonical_revision ?? 0) + 1,
        due_on: dueOn,
      });
    },
    onTasksCompleted: async () => {},
    reconcileMisses: async () => true,
    setMessage: () => {},
    setTasks: (updater) => { localTasks = updater(localTasks); },
    syncHistory: async () => true,
    updateLegacy: async () => {
      throw new Error("Canonical schedule saves must not use the legacy writer.");
    },
  });

  const firstSave = update.updateTask(currentTask.id, { due_on: "2026-08-12" });
  await Promise.resolve();
  const duplicateSave = update.updateTask(currentTask.id, { due_on: "2026-08-12" });
  await Promise.resolve();

  assert.equal(commandCount, 1);
  assert.deepEqual(received, [{ dueOn: "2026-08-12", expectedRevision: 4 }]);

  releaseFirst();
  assert.deepEqual(await Promise.all([firstSave, duplicateSave]), [true, true]);
  assert.equal((localTasks[0] as TaskStateRuntimeLocalTask).canonical_revision, 5);
  assert.equal(await update.updateTask(currentTask.id, { due_on: "2026-08-12" }), true);
  assert.equal(commandCount, 1);

  assert.equal(await update.updateTask(currentTask.id, { due_on: "2026-08-13" }), true);
  assert.deepEqual(received, [
    { dueOn: "2026-08-12", expectedRevision: 4 },
    { dueOn: "2026-08-13", expectedRevision: 5 },
  ]);
  assert.equal((localTasks[0] as TaskStateRuntimeLocalTask).canonical_revision, 6);
});

test("gate-enabled canonical rollover intent uses the per-Task command path", async () => {
  const currentTask = task();
  let receivedActionType = "";
  let legacyWrites = 0;
  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: true,
    currentTask,
    execute: async (action, taskForAction) => {
      receivedActionType = action.actionType;
      return success(taskForAction);
    },
    onTasksCompleted: async () => {},
    reconcileMisses: async () => true,
    setMessage: () => {},
    setTasks: () => {},
    syncHistory: async () => true,
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, {}, {
    canonicalIntent: { type: "reconcile_rollover" },
    replayIdentity: "rollover:task-1:2026-08-10",
  }), true);
  assert.equal(receivedActionType, "reconcile_rollover");
  assert.equal(legacyWrites, 0);
});

test("canonical gate is enabled and source keeps canonical activation boundaries explicit", () => {
  const gate = readFileSync(new URL("../src/lib/task-state-runtime-gate.ts", import.meta.url), "utf8");
  const reward = readFileSync(new URL("../src/hooks/useTaskRewardController.ts", import.meta.url), "utf8");
  const subtasks = readFileSync(new URL("../src/hooks/useTaskSubtaskActions.ts", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../src/hooks/useTaskEditorSaveAction.ts", import.meta.url), "utf8");
  const taskApp = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  assert.match(gate, /TASK_STATE_CANONICAL_COMMANDS_ENABLED = true/);
  assert.match(reward, /adhdice_fulfill_canonical_reward_entitlement/);
  assert.match(reward, /Calculated Missed reconciliation is owned by the canonical rollover command/);
  assert.match(subtasks, /Unpromoted checklist rows are intentionally legacy-only entities/);
  assert.match(editor, /Schedule committed, but metadata could not be synchronized/);
  assert.match(taskApp, /canonicalIntent: \{ type: "reconcile_rollover" \}/);
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

test("disabled gate preserves the legacy Restore write and returned pending Task", async () => {
  const currentTask = task({ status: "trashed" });
  let localTasks: Task[] = [currentTask];
  let legacyWrites = 0;
  let historyWrites = 0;
  const update = useBuildUpdateAction({
    canonicalCommandsEnabled: false,
    currentTask,
    onTasksCompleted: async () => {},
    reconcileMisses: async () => true,
    setMessage: () => {},
    setTasks: (updater) => { localTasks = updater(localTasks); },
    syncHistory: async () => { historyWrites += 1; return true; },
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: { ...currentTask, status: "pending" }, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, { status: "pending" }), true);
  assert.equal(legacyWrites, 1);
  assert.equal(historyWrites, 1);
  assert.equal(localTasks[0]?.status, "pending");
});

test("TaskApp keeps legacy Restore routing inside the disabled-gate branch", () => {
  const source = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const restoreStart = source.indexOf("async function restoreTaskFromTrash");
  const restoreEnd = source.indexOf("\n  async function confirmMilestoneLifecycle", restoreStart);
  assert.ok(restoreStart >= 0);
  assert.ok(restoreEnd > restoreStart);
  const restoreSource = source.slice(restoreStart, restoreEnd);

  assert.match(restoreSource, /if \(!TASK_STATE_CANONICAL_COMMANDS_ENABLED\) \{\s*optimisticallyRestoreTaskToInbox\(taskId\);\s*routeTask\(taskId, "inbox"\);\s*\}/);
  assert.equal([...restoreSource.matchAll(/routeTask\(taskId, "inbox"\)/g)].length, 1);
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

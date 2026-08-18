import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { useTaskUpdateAction } from "../src/hooks/useTaskUpdateAction.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task } from "../src/lib/database.types.ts";
import type {
  TaskStateRuntimeCanonicalAction,
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

function success(currentTask: TaskStateRuntimeLocalTask, status: Task["status"]): TaskStateRuntimeExecutionResult {
  return {
    success: true,
    task: { ...currentTask, canonical_revision: (currentTask.canonical_revision ?? 0) + 1, status },
    response: {
      success: true,
      state: "committed",
      task_id: currentTask.id,
      command_id: "command-1",
      expected_revision: currentTask.canonical_revision ?? 0,
      next_revision: (currentTask.canonical_revision ?? 0) + 1,
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

function buildUpdateAction(input: {
  currentTask: TaskStateRuntimeLocalTask;
  execute?: (action: TaskStateRuntimeCanonicalAction, task: TaskStateRuntimeLocalTask) => Promise<TaskStateRuntimeExecutionResult>;
  updateLegacy: () => Promise<{ data: Task | null; error: { message: string } | null; conflict: null; reappliedOnLatestRevision: boolean; usedActualSecondsFallback: boolean; usedEnergyFallback: boolean }>;
  setTasks: (updater: (current: Task[]) => Task[]) => void;
  setMessage: (message: { tone: "neutral" | "good" | "warn"; text: string }) => void;
}) {
  return useTaskUpdateAction({
    canonicalCommandExecutor: input.execute,
    currentDayKey: "2026-08-10",
    dayStartTime: "00:00",
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: input.setMessage,
    setTasks: input.setTasks,
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: [input.currentTask],
    timezone: "UTC",
    updateTaskRowWithLegacyEnergyFallback: input.updateLegacy,
  });
}

test("Task State status changes always use the canonical command boundary", async () => {
  const currentTask = task();
  let actionType = "";
  let legacyWrites = 0;
  let localTasks: Task[] = [currentTask];
  const update = buildUpdateAction({
    currentTask,
    execute: async (action, taskForAction) => {
      actionType = action.actionType;
      return success(taskForAction, "in_progress");
    },
    setMessage: () => {},
    setTasks: (updater) => { localTasks = updater(localTasks); },
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, { status: "in_progress" }), true);
  assert.equal(actionType, "start_in_progress");
  assert.equal(legacyWrites, 0);
  assert.equal(localTasks[0]?.status, "in_progress");
});

test("canonical command rejection does not fall back to a direct legacy Task write", async () => {
  const currentTask = task();
  let legacyWrites = 0;
  let warning = "";
  const update = buildUpdateAction({
    currentTask,
    execute: async () => failure("The canonical command was rejected."),
    setMessage: (message) => { warning = message.text; },
    setTasks: () => {},
    updateLegacy: async () => {
      legacyWrites += 1;
      return { data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await update.updateTask(currentTask.id, { status: "in_progress" }), false);
  assert.equal(legacyWrites, 0);
  assert.match(warning, /canonical command was rejected/i);
});

test("Task State runtime wiring has no legacy gate or rollover RPC fallback", () => {
  const taskApp = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const update = readFileSync(new URL("../src/hooks/useTaskUpdateAction.ts", import.meta.url), "utf8");
  assert.doesNotMatch(taskApp, /TASK_STATE_CANONICAL_COMMANDS_ENABLED|adhdice_reconcile_task_rollover|adhdice_apply_task_state_engine_rollover/);
  assert.doesNotMatch(update, /TASK_STATE_CANONICAL_COMMANDS_ENABLED|syncTaskHistoryEntry\(/);
  assert.match(taskApp, /taskRolloverCoordinator\.run/);
  assert.match(update, /canonicalCommandExecutor/);
});

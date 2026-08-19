import assert from "node:assert/strict";
import test from "node:test";
import { createTask } from "../src/lib/task-buckets.ts";
import { useTaskCrudActions } from "../src/hooks/useTaskCrudActions.ts";
import type { Task } from "../src/lib/database.types.ts";
import type {
  TaskStateRuntimeExecutionResult,
  TaskStateRuntimeLocalTask,
} from "../src/lib/task-state-runtime-executor.ts";

function task(id: string, overrides: Partial<TaskStateRuntimeLocalTask> = {}): TaskStateRuntimeLocalTask {
  return {
    ...createTask({
      created_at: "2026-08-10T12:00:00.000Z",
      id,
      sort_order: 1,
      status: "pending",
      title: `Task ${id}`,
    }),
    canonicalization_status: "canonical_proven",
    canonical_revision: 4,
    container_state: "active",
    entity_kind: "parent",
    prior_container_state: null,
    prior_container_state_status: "not_applicable",
    terminal_state: "active",
    workflow_state: "none",
    ...overrides,
  };
}

function canonicalSuccess(nextTask: TaskStateRuntimeLocalTask): TaskStateRuntimeExecutionResult {
  return {
    success: true,
    task: nextTask,
    response: {
      success: true,
      state: "committed",
      task_id: nextTask.id,
      command_id: `command-${nextTask.id}`,
      expected_revision: (nextTask.canonical_revision ?? 1) - 1,
      next_revision: nextTask.canonical_revision,
      was_replayed: false,
      conflict_code: null,
      canonical_task_patch: {},
      compatibility_projection: {},
      side_effect_ids: {},
      error: null,
    },
  };
}

function canonicalFailure(message: string): TaskStateRuntimeExecutionResult {
  return {
    success: false,
    task: null,
    response: null,
    error: { kind: "command_rejected", message, code: "COMMAND_REJECTED", status: 422 },
  };
}

function useBuildCrud({
  canonicalCommandExecutor,
  deleteTaskRow = async () => ({ conflict: null, data: null, error: null }),
  setMessage,
  tasks,
  updateTaskRowWithLegacyEnergyFallback,
}: {
  canonicalCommandExecutor?: Parameters<typeof useTaskCrudActions>[0]["canonicalCommandExecutor"];
  deleteTaskRow?: Parameters<typeof useTaskCrudActions>[0]["deleteTaskRow"];
  setMessage?: (message: { tone: "neutral" | "good" | "warn"; text: string }) => void;
  tasks: TaskStateRuntimeLocalTask[];
  updateTaskRowWithLegacyEnergyFallback?: Parameters<typeof useTaskCrudActions>[0]["updateTaskRowWithLegacyEnergyFallback"];
}) {
  let localTasks: Task[] = tasks;
  const messages: Array<{ tone: "neutral" | "good" | "warn"; text: string }> = [];
  const crud = useTaskCrudActions({
    canonicalCommandExecutor,
    client: {} as never,
    currentUserId: "user-1",
    deleteTaskRow,
    setMessage: (message) => {
      const next = typeof message === "function" ? message(messages.at(-1) ?? null) : message;
      if (next) messages.push(next);
      setMessage?.(next ?? { tone: "neutral", text: "" });
    },
    setTaskRouting: () => {},
    setTasks: (updater) => {
      // This is a plain-function state harness, not React render state.
      // eslint-disable-next-line react-hooks/immutability
      localTasks = typeof updater === "function" ? updater(localTasks) : updater;
    },
    shouldRouteTaskToInbox: () => false,
    sortTasksForUi: (nextTasks) => nextTasks,
    tasks,
    updateTaskRowWithLegacyEnergyFallback: updateTaskRowWithLegacyEnergyFallback ?? (async () => ({
      conflict: null,
      data: null,
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    })),
  });
  return { crud, messages, get localTasks() { return localTasks; } };
}

test("gate-enabled deleteTasks uses canonical trash without a legacy Task State write", async () => {
  const currentTask = task("task-1");
  let legacyWrites = 0;
  let receivedAction: { actionType: string; revision: number; replayIdentity: string } | null = null;
  const harness = useBuildCrud({
    tasks: [currentTask],
    canonicalCommandExecutor: async (action, taskForAction) => {
      receivedAction = {
        actionType: action.actionType,
        replayIdentity: action.replayIdentity,
        revision: taskForAction.canonical_revision ?? -1,
      };
      return canonicalSuccess({ ...taskForAction, canonical_revision: 5, status: "trashed", container_state: "trashed" });
    },
    updateTaskRowWithLegacyEnergyFallback: async () => {
      legacyWrites += 1;
      return { conflict: null, data: null, error: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await harness.crud.deleteTasks([currentTask.id]), true);
  assert.deepEqual(receivedAction, {
    actionType: "trash_task",
    replayIdentity: receivedAction?.replayIdentity,
    revision: 4,
  });
  assert.match(receivedAction?.replayIdentity ?? "", /^[0-9a-f-]{36}$/i);
  assert.equal(legacyWrites, 0);
  assert.equal(harness.localTasks[0]?.status, "trashed");
  assert.equal(harness.localTasks[0]?.canonical_revision, 5);
});

test("gate-enabled multi-task deleteTasks gives every Task its own replay identity and canonical revision", async () => {
  const first = task("task-1", { canonical_revision: 4 });
  const second = task("task-2", { canonical_revision: 11 });
  const received: Array<{ taskId: string; revision: number; replayIdentity: string }> = [];
  const harness = useBuildCrud({
    tasks: [first, second],
    canonicalCommandExecutor: async (action, taskForAction) => {
      received.push({
        replayIdentity: action.replayIdentity,
        revision: taskForAction.canonical_revision ?? -1,
        taskId: taskForAction.id,
      });
      return canonicalSuccess({ ...taskForAction, canonical_revision: (taskForAction.canonical_revision ?? 0) + 1, status: "trashed", container_state: "trashed" });
    },
  });

  assert.equal(await harness.crud.deleteTasks([first.id, second.id]), true);
  assert.equal(received.length, 2);
  assert.deepEqual(received.map((entry) => entry.taskId), [first.id, second.id]);
  assert.deepEqual(received.map((entry) => entry.revision), [4, 11]);
  assert.notEqual(received[0]?.replayIdentity, received[1]?.replayIdentity);
  assert.equal(new Set(received.map((entry) => entry.replayIdentity)).size, 2);
});

test("failed canonical Trash does not fall back while successful Tasks retain partial success", async () => {
  const failedTask = task("failed");
  const successfulTask = task("successful");
  let legacyWrites = 0;
  let invocation = 0;
  const harness = useBuildCrud({
    tasks: [failedTask, successfulTask],
    canonicalCommandExecutor: async (_action, taskForAction) => {
      invocation += 1;
      return invocation === 1
        ? canonicalFailure("Canonical Trash was rejected.")
        : canonicalSuccess({ ...taskForAction, canonical_revision: 5, status: "trashed", container_state: "trashed" });
    },
    updateTaskRowWithLegacyEnergyFallback: async () => {
      legacyWrites += 1;
      return { conflict: null, data: null, error: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });

  assert.equal(await harness.crud.deleteTasks([failedTask.id, successfulTask.id]), true);
  assert.equal(legacyWrites, 0);
  assert.equal(harness.localTasks.find((entry) => entry.id === failedTask.id)?.status, "pending");
  assert.equal(harness.localTasks.find((entry) => entry.id === successfulTask.id)?.status, "trashed");
  assert.match(harness.messages.at(-1)?.text ?? "", /Canonical Trash was rejected/);
});

test("already-trashed deleteTasks remains on the existing permanent-delete path", async () => {
  const trashedTask = task("trashed", { status: "trashed", container_state: "trashed" });
  let canonicalCalls = 0;
  let deleteCalls = 0;
  const harness = useBuildCrud({
    tasks: [trashedTask],
    canonicalCommandExecutor: async () => {
      canonicalCalls += 1;
      return canonicalFailure("must not run");
    },
    deleteTaskRow: async () => {
      deleteCalls += 1;
      return { conflict: null, data: trashedTask, error: null };
    },
  });

  assert.equal(await harness.crud.deleteTasks([trashedTask.id]), true);
  assert.equal(canonicalCalls, 0);
  assert.equal(deleteCalls, 1);
  assert.equal(harness.localTasks.length, 0);
});

test("Milestone Tasks use the same canonical first-stage Trash path", async () => {
  const milestoneTask = task("milestone", { entity_kind: "parent" });
  const harness = useBuildCrud({
    tasks: [milestoneTask],
    canonicalCommandExecutor: async (_action, taskForAction) => canonicalSuccess({ ...taskForAction, canonical_revision: 5, status: "trashed", container_state: "trashed" }),
  });

  assert.equal(await harness.crud.deleteTasks([milestoneTask.id]), true);
  assert.equal(harness.localTasks[0]?.status, "trashed");
});

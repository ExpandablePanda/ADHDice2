/* eslint-disable react-hooks/immutability */
import assert from "node:assert/strict";
import test from "node:test";
import { useTaskBatchEditAction } from "../src/hooks/useTaskBatchEditAction.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task } from "../src/lib/database.types.ts";
import type { TaskStateRuntimeExecutionResult, TaskStateRuntimeLocalTask } from "../src/lib/task-state-runtime-executor.ts";

function task(id: string): TaskStateRuntimeLocalTask {
  return {
    ...createTask({ id, status: "pending", title: id, sort_order: 1 }),
    canonical_revision: 4,
    canonicalization_status: "canonical_proven",
    entity_kind: "parent",
  };
}

function committed(currentTask: TaskStateRuntimeLocalTask, status: Task["status"]): TaskStateRuntimeExecutionResult {
  return {
    success: true,
    task: { ...currentTask, canonical_revision: (currentTask.canonical_revision ?? 0) + 1, status },
    response: {
      success: true,
      state: "committed",
      task_id: currentTask.id,
      command_id: `command-${currentTask.id}`,
      expected_revision: currentTask.canonical_revision,
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

function draft(status: "done" | "missed" = "done") {
  return {
    dueOn: "",
    dueOnMode: "unchanged" as const,
    energy: "unchanged" as const,
    estimatedMinutes: "",
    estimatedMinutesMode: "unchanged" as const,
    focusToday: "unchanged" as const,
    oneStepAtATime: "unchanged" as const,
    priority: "unchanged" as const,
    repeatDayOfMonth: "",
    repeatDaysOfWeek: [],
    repeatFrequency: "unchanged" as const,
    repeatInterval: "1",
    route: "unchanged" as const,
    status,
    subtasksAutoReset: "unchanged" as const,
    tags: [],
    tagsMode: "unchanged" as const,
  };
}

function useBatchForTest(tasks: TaskStateRuntimeLocalTask[], execute: NonNullable<Parameters<typeof useTaskBatchEditAction>[0]["canonicalCommandExecutor"]>, writes: { legacy: number; rewards: number }) {
  let localTasks: Task[] = tasks;
  const actions = useTaskBatchEditAction({
    canonicalCommandsEnabled: true,
    canonicalCommandExecutor: execute,
    clearListTaskSelection: () => {},
    currentDayKey: "2026-08-10",
    dayStartTime: "06:00",
    focusedTaskIds: [],
    onTasksCompleted: async () => { writes.rewards += 1; },
    parseDayOfMonth: (value) => Number.parseInt(value, 10) || null,
    parsePositiveInteger: (value) => Number.parseInt(value, 10) || null,
    routeTask: () => {},
    saveFocusSelection: async () => {},
    selectedListTasks: tasks,
    setBatchEditProgress: () => {},
    setIsBatchEditModalOpen: () => {},
    setMessage: () => {},
    setTasks: (updater) => { localTasks = typeof updater === "function" ? updater(localTasks) : updater; },
    sortTasksForUi: (next) => next,
    syncTaskHistoryEntry: async () => true,
    taskHistory: [],
    tasks,
    timezone: "UTC",
    updateTaskRowWithLegacyEnergyFallback: async () => {
      writes.legacy += 1;
      return { data: null, error: null, usedActualSecondsFallback: false, usedEnergyFallback: false };
    },
  });
  return { actions, get localTasks() { return localTasks; } };
}

test("canonical batch status commands use each Task revision and replay identity without legacy reward or History work", async () => {
  const tasks = [task("task-a"), task("task-b")];
  const received: Array<{ id: string; revision: number; replay: string }> = [];
  const writes = { legacy: 0, rewards: 0 };
  const harness = useBatchForTest(tasks, async (action, currentTask) => {
    received.push({ id: currentTask.id, revision: action.expectedRevision, replay: action.replayIdentity });
    return committed(currentTask, "done");
  }, writes);

  await harness.actions.applyBatchTaskEdit(draft());
  assert.deepEqual(received.map((entry) => entry.id), ["task-a", "task-b"]);
  assert.deepEqual(received.map((entry) => entry.revision), [4, 4]);
  assert.equal(new Set(received.map((entry) => entry.replay)).size, 2);
  assert.equal(writes.legacy, 0);
  assert.equal(writes.rewards, 0);
  assert.deepEqual(harness.localTasks.map((entry) => entry.status), ["done", "done"]);
});

test("a failed canonical batch Task is reported without legacy fallback while other Tasks remain committed", async () => {
  const tasks = [task("task-a"), task("task-b")];
  const writes = { legacy: 0, rewards: 0 };
  const harness = useBatchForTest(tasks, async (action, currentTask) => (
    currentTask.id === "task-a"
      ? { success: false, task: null, response: null, error: { kind: "command_rejected", message: "stale", code: "STALE_REVISION", status: 409 } }
      : committed(currentTask, "missed")
  ), writes);

  await harness.actions.applyBatchTaskEdit(draft("missed"));
  assert.deepEqual(harness.localTasks.map((entry) => entry.status), ["pending", "missed"]);
  assert.equal(writes.legacy, 0);
  assert.equal(writes.rewards, 0);
});

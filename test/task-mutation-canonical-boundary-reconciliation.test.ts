import assert from "node:assert/strict";
import test from "node:test";

import { useTaskUpdateAction } from "../src/hooks/useTaskUpdateAction.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { loadCanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/read-model.ts";
import type { CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";
import { resolveActiveTaskStatuses } from "../src/lib/task-state-engine/read-authority.ts";
import type { TaskStateRuntimeExecutionResult } from "../src/lib/task-state-runtime-executor.ts";
import { buildTaskHistoryStreakSummary } from "../src/lib/task-history-streak-summaries.ts";

const userId = "user-1";
const taskId = "task-boundary-reconcile";

function boundary(overrides: Partial<CanonicalTaskScheduleBoundary> = {}): CanonicalTaskScheduleBoundary {
  return {
    id: "boundary-initial",
    user_id: userId,
    entity_id: taskId,
    entity_kind: "parent",
    effective_from_logical_date: "2026-08-19",
    boundary_sequence: 1,
    boundary_type: "initial",
    schedule_model: "unscheduled",
    repeat_frequency: "none",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    one_time_due_on: null,
    due_time: null,
    anchor_date: null,
    anchor_kind: "unknown",
    anchor_confidence: "unavailable",
    historical_scope_known: false,
    prospective_only: true,
    prior_boundary_id: null,
    affected_occurrence_id: null,
    logical_day_settings_revision: 1,
    timezone: "UTC",
    day_start_time: "00:00",
    actor_kind: "user",
    actor_id: userId,
    source: "task_creation",
    command_id: null,
    idempotence_identity: "boundary-reconcile",
    schema_contract_version: "task-state-schema-v1",
    source_task_revision: 1,
    revision: 1,
    created_at: "2026-08-19T12:00:00.000Z",
    updated_at: "2026-08-19T12:00:00.000Z",
    ...overrides,
  };
}

function canonicalTask(initialBoundary: CanonicalTaskScheduleBoundary): Task {
  return {
    ...createTask({
      created_at: "2026-08-19T12:00:00.000Z",
      due_on: null,
      id: taskId,
      sort_order: 1,
      status: "pending",
      title: "Canonical task",
      user_id: userId,
    }),
    canonicalization_status: "canonical_runtime",
    entity_kind: "parent",
    terminal_state: "active",
    container_state: "active",
    prior_container_state: null,
    prior_container_state_status: "not_applicable",
    workflow_state: "none",
    workflow_revision: 1,
    canonical_revision: 1,
    canonical_schedule_boundary: initialBoundary,
    canonical_schedule_anchor_date: null,
  } as Task;
}

function commandResponse(boundaryId: string, expectedRevision: number) {
  return {
    success: true,
    state: "committed",
    error: null,
    task_id: taskId,
    command_id: `command-${boundaryId}`,
    expected_revision: expectedRevision,
    next_revision: expectedRevision + 1,
    was_replayed: false,
    conflict_code: null,
    no_action: false,
    canonical_task_patch: {},
    compatibility_projection: {
      status: "pending",
      due_on: null,
      completed_at: null,
      active_status_logical_date: null,
      active_occurrence_due_on: null,
    },
    side_effect_ids: { schedule_boundary_id: boundaryId },
  } as const;
}

test("canonical creation projection survives metadata and exact committed schedule boundaries", async () => {
  const initialBoundary = boundary();
  const dueBoundary = boundary({
    id: "boundary-due-today",
    boundary_sequence: 2,
    boundary_type: "due_date_change",
    schedule_model: "one_time",
    one_time_due_on: "2026-08-19",
    prospective_only: false,
    prior_boundary_id: initialBoundary.id,
    source: "set_due_date",
  });
  const repeatBoundary = boundary({
    id: "boundary-repeat-weekly",
    boundary_sequence: 3,
    boundary_type: "repeat_change",
    schedule_model: "fixed",
    repeat_frequency: "weekly",
    repeat_days_of_week: [1, 3],
    anchor_date: "2026-08-19",
    anchor_kind: "user_selected",
    anchor_confidence: "proven",
    prospective_only: false,
    prior_boundary_id: dueBoundary.id,
    source: "set_repeat",
  });
  const unscheduledBoundary = boundary({
    id: "boundary-unscheduled",
    boundary_sequence: 4,
    boundary_type: "due_date_change",
    prior_boundary_id: repeatBoundary.id,
    source: "set_due_date",
  });
  const localTasks = [canonicalTask(initialBoundary)];
  const committedBoundaries = new Map([
    [dueBoundary.id, dueBoundary],
    [repeatBoundary.id, repeatBoundary],
    [unscheduledBoundary.id, unscheduledBoundary],
  ]);
  const messages: Array<{ tone: string; text: string }> = [];
  const callbackEvents: string[] = [];

  const update = useTaskUpdateAction({
    canonicalCommandExecutor: async (action, currentTask): Promise<TaskStateRuntimeExecutionResult> => {
      callbackEvents.push("command");
      const nextBoundary = action.actionType === "set_due_date"
        ? action.intent?.type === "set_due_date" && action.intent.schedule.schedule_model === "unscheduled"
          ? unscheduledBoundary
          : dueBoundary
        : repeatBoundary;
      return {
        success: true,
        task: {
          ...currentTask,
          ...(action.actionType === "set_due_date"
            ? { due_on: nextBoundary.schedule_model === "unscheduled" ? null : "2026-08-19" }
            : { repeat_frequency: "weekly", repeat_days_of_week: [1, 3] }),
          canonical_revision: currentTask.canonical_revision + 1,
        },
        response: commandResponse(nextBoundary.id, action.expectedRevision),
      };
    },
    currentDayKey: "2026-08-19",
    loadCanonicalScheduleBoundary: async (_taskId, boundaryId) => {
      callbackEvents.push("schedule-reconciliation");
      return committedBoundaries.get(boundaryId) ?? null;
    },
    loadTaskHistoryForTasks: async () => ({
      [taskId]: { error: null, history: [], status: "ready" as const },
    }),
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: (message) => {
      const next = typeof message === "function" ? message(messages.at(-1) ?? null) : message;
      if (next) messages.push(next);
    },
    setTasks: (updater) => {
      const next = typeof updater === "function" ? updater(localTasks) : updater;
      localTasks.splice(0, localTasks.length, ...next);
    },
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: localTasks,
    timezone: "UTC",
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => {
      const rawTask = Object.fromEntries(
        Object.entries(localTasks[0]).filter(([key]) => !["canonical_schedule_boundary", "canonical_schedule_anchor_date"].includes(key)),
      ) as Task;
      return {
        conflict: null,
        data: { ...rawTask, ...values },
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      };
    },
  });

  assert.equal(await update.updateTask(taskId, { title: "Renamed" }), true);
  assert.equal(localTasks[0]?.title, "Renamed");
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.id, initialBoundary.id);

  callbackEvents.length = 0;
  assert.equal(await update.updateTask(taskId, { due_on: "2026-08-19" }, {
    onCanonicalMutationPersisted: () => callbackEvents.push("persisted"),
  }), true);
  assert.deepEqual(callbackEvents, ["command", "persisted", "schedule-reconciliation"]);
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.id, dueBoundary.id);
  assert.equal(localTasks[0]?.due_on, "2026-08-19");
  assert.doesNotThrow(() => resolveActiveTaskStatuses({
    historyByTaskId: { [taskId]: [] },
    logicalDayRollover: "00:00",
    now: "2026-08-19T12:00:00.000Z",
    tasks: localTasks as never,
    timezone: "UTC",
  }));

  assert.equal(await update.updateTask(taskId, { repeat_frequency: "weekly", repeat_days_of_week: [1, 3] }), true);
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.id, repeatBoundary.id);
  assert.deepEqual(localTasks[0]?.canonical_schedule_boundary?.repeat_days_of_week, [1, 3]);

  assert.equal(await update.updateTask(taskId, { due_on: null, due_time: null }, { manualAction: "unscheduled_status" }), true);
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.id, unscheduledBoundary.id);
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.schedule_model, "unscheduled");
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.repeat_frequency, "none");
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.one_time_due_on, null);
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.anchor_date, null);
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.due_time, null);
  assert.equal(localTasks[0]?.due_on, null);
  assert.equal(localTasks[0]?.repeat_frequency, "none");
  assert.equal(messages.length, 0);
});

test("canonical Due and Repeat commits reload fresh History before immediate streak reconciliation", async () => {
  const automaticMissed: TaskHistory = {
    counted_as_due_occurrence: true,
    created_at: "2026-08-01T00:00:00.000Z",
    entry_date: "2026-08-01",
    event_type: "status",
    id: "automatic-missed-after-schedule-replay",
    occurrence_due_on: "2026-08-01",
    occurrence_key: `task:${taskId}:occurrence:2026-08-01`,
    canonical_fact_id: "automatic-missed-after-schedule-replay",
    canonical_provenance_kind: "reconciliation",
    recurrence_authoritative: true,
    status: "missed",
    task_id: taskId,
    updated_at: "2026-08-01T00:00:00.000Z",
    user_id: userId,
    was_completed: false,
  };
  const initialBoundary = boundary({
    id: "schedule-history-initial",
    schedule_model: "one_time",
    one_time_due_on: "2026-08-03",
    prospective_only: false,
  });
  const dueBoundary = boundary({
    id: "schedule-history-due",
    boundary_type: "due_date_change",
    schedule_model: "one_time",
    one_time_due_on: "2026-08-01",
    prospective_only: false,
    prior_boundary_id: initialBoundary.id,
    source: "set_due_date",
  });
  const repeatBoundary = boundary({
    id: "schedule-history-repeat",
    boundary_type: "repeat_change",
    schedule_model: "fixed",
    repeat_frequency: "weekly",
    repeat_days_of_week: [6],
    anchor_date: "2026-08-01",
    anchor_kind: "user_selected",
    anchor_confidence: "proven",
    prospective_only: false,
    prior_boundary_id: dueBoundary.id,
    source: "set_repeat",
  });
  const localTasks = [{ ...canonicalTask(initialBoundary), due_on: "2026-08-03" } as Task];
  const events: string[] = [];
  const historyCallbacks: TaskHistory[][] = [];
  const taskCallbacks: Task[] = [];
  const historyReloads: string[][] = [];

  const update = useTaskUpdateAction({
    canonicalCommandExecutor: async (action, currentTask): Promise<TaskStateRuntimeExecutionResult> => {
      events.push("command");
      const nextBoundary = action.actionType === "set_due_date" ? dueBoundary : repeatBoundary;
      return {
        success: true,
        task: {
          ...currentTask,
          ...(action.actionType === "set_due_date"
            ? { due_on: "2026-08-01" }
            : { repeat_frequency: "weekly", repeat_days_of_week: [6] }),
          canonical_revision: currentTask.canonical_revision + 1,
        },
        response: commandResponse(nextBoundary.id, action.expectedRevision),
      };
    },
    currentDayKey: "2026-08-05",
    loadCanonicalScheduleBoundary: async (_taskId, boundaryId) => {
      events.push("schedule-reload");
      return boundaryId === dueBoundary.id ? dueBoundary : repeatBoundary;
    },
    loadTaskHistoryForTasks: async (taskIds) => {
      historyReloads.push(taskIds);
      events.push(`history-reload:${taskIds.join(",")}`);
      return {
        [taskId]: {
          error: null,
          history: historyReloads.length === 1 ? [automaticMissed] : [],
          status: "ready" as const,
        },
      };
    },
    onTaskHistoryMutation: (_taskId, history, nextTask) => {
      events.push("streak-reconciliation");
      historyCallbacks.push(history);
      if (nextTask) taskCallbacks.push(nextTask);
    },
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: () => {},
    setTasks: (updater) => localTasks.splice(0, localTasks.length, ...(typeof updater === "function" ? updater(localTasks) : updater)),
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    taskHistory: [automaticMissed],
    tasks: localTasks,
    timezone: "UTC",
    updateTaskRowWithLegacyEnergyFallback: async () => { throw new Error("Legacy fallback must not run."); },
  });

  assert.equal(await update.updateTask(taskId, { due_on: "2026-08-01" }), true);
  assert.equal(await update.updateTask(taskId, { repeat_frequency: "weekly", repeat_days_of_week: [6] }), true);
  assert.deepEqual(events, [
    "command", "schedule-reload", `history-reload:${taskId}`, "streak-reconciliation",
    "command", "schedule-reload", `history-reload:${taskId}`, "streak-reconciliation",
  ]);
  assert.deepEqual(historyCallbacks[0], [automaticMissed]);
  assert.deepEqual(historyCallbacks[1], []);
  assert.equal(taskCallbacks[0]?.canonical_schedule_boundary?.id, dueBoundary.id);
  assert.equal(taskCallbacks[1]?.canonical_schedule_boundary?.id, repeatBoundary.id);
  assert.equal(buildTaskHistoryStreakSummary(taskCallbacks[0]!, historyCallbacks[0]!, "2026-08-05", { timezone: "UTC", now: "2026-08-05T12:00:00.000Z" }).missedStreak, 1);
  assert.equal(buildTaskHistoryStreakSummary(taskCallbacks[1]!, historyCallbacks[1]!, "2026-08-05", { timezone: "UTC", now: "2026-08-05T12:00:00.000Z" }).missedStreak, 0);
});

test("backdating a canonical Due commit immediately recalculates the current streak from fresh History", async () => {
  const initialBoundary = boundary({
    id: "current-streak-initial",
    schedule_model: "one_time",
    one_time_due_on: "2026-08-10",
    prospective_only: false,
  });
  const committedBoundary = boundary({
    id: "current-streak-backdated",
    boundary_type: "due_date_change",
    schedule_model: "one_time",
    one_time_due_on: "2026-08-05",
    prospective_only: false,
    prior_boundary_id: initialBoundary.id,
    source: "set_due_date",
  });
  const doneHistory: TaskHistory = {
    counted_as_due_occurrence: true,
    created_at: "2026-08-05T12:00:00.000Z",
    entry_date: "2026-08-05",
    event_type: "status",
    id: "current-streak-done",
    occurrence_due_on: "2026-08-05",
    occurrence_key: `task:${taskId}:occurrence:2026-08-05`,
    status: "done",
    task_id: taskId,
    updated_at: "2026-08-05T12:00:00.000Z",
    user_id: userId,
    was_completed: true,
  };
  const localTasks = [{ ...canonicalTask(initialBoundary), due_on: "2026-08-10" } as Task];
  const events: string[] = [];
  let callbackTask: Task | undefined;
  let callbackHistory: TaskHistory[] | undefined;

  const update = useTaskUpdateAction({
    canonicalCommandExecutor: async (action, currentTask): Promise<TaskStateRuntimeExecutionResult> => {
      events.push("command");
      return {
        success: true,
        task: { ...currentTask, due_on: "2026-08-05", canonical_revision: currentTask.canonical_revision + 1 },
        response: commandResponse(committedBoundary.id, action.expectedRevision),
      };
    },
    currentDayKey: "2026-08-05",
    loadCanonicalScheduleBoundary: async () => {
      events.push("schedule-reload");
      return committedBoundary;
    },
    loadTaskHistoryForTasks: async () => {
      events.push("history-reload");
      return { [taskId]: { error: null, history: [doneHistory], status: "ready" as const } };
    },
    onTaskHistoryMutation: (_taskId, history, nextTask) => {
      events.push("streak-reconciliation");
      callbackHistory = history;
      callbackTask = nextTask;
    },
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: () => {},
    setTasks: (updater) => localTasks.splice(0, localTasks.length, ...(typeof updater === "function" ? updater(localTasks) : updater)),
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    taskHistory: [],
    tasks: localTasks,
    timezone: "UTC",
    updateTaskRowWithLegacyEnergyFallback: async () => { throw new Error("Legacy fallback must not run."); },
  });

  assert.equal(await update.updateTask(taskId, { due_on: "2026-08-05" }), true);
  assert.deepEqual(events, ["command", "schedule-reload", "history-reload", "streak-reconciliation"]);
  assert.deepEqual(callbackHistory, [doneHistory]);
  assert.equal(callbackTask?.due_on, "2026-08-05");
  assert.equal(buildTaskHistoryStreakSummary(callbackTask!, callbackHistory!, "2026-08-05", { timezone: "UTC", now: "2026-08-05T12:00:00.000Z" }).currentStreak, 1);
});

test("canonical boundary loader constrains the authenticated user, Task, and exact committed boundary", async () => {
  const calls: Array<[string, string]> = [];
  const expected = boundary({ id: "boundary-exact" });
  const query = {
    select: () => query,
    eq: (column: string, value: string) => {
      calls.push([column, value]);
      return query;
    },
    maybeSingle: async () => ({ data: expected, error: null }),
  };
  const result = await loadCanonicalTaskScheduleBoundary({
    from: () => query,
  } as never, { boundaryId: expected.id, taskId, userId });

  assert.equal(result.error, null);
  assert.equal(result.data?.id, expected.id);
  assert.deepEqual(calls, [["user_id", userId], ["entity_id", taskId], ["id", expected.id]]);
});

test("canonical command rejection is visible as a Task edit failure", async () => {
  const initialBoundary = boundary();
  const localTasks = [canonicalTask(initialBoundary)];
  const messages: Array<{ tone: string; text: string }> = [];
  let persistedCallbacks = 0;
  const update = useTaskUpdateAction({
    canonicalCommandExecutor: async (): Promise<TaskStateRuntimeExecutionResult> => ({
      success: false,
      task: null,
      response: null,
      error: { kind: "command_rejected", message: "The Task is stale.", code: "STALE_REVISION", status: 409 },
    }),
    currentDayKey: "2026-08-19",
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: (message) => {
      const next = typeof message === "function" ? message(messages.at(-1) ?? null) : message;
      if (next) messages.push(next);
    },
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: localTasks,
    updateTaskRowWithLegacyEnergyFallback: async () => {
      throw new Error("Legacy fallback must not run.");
    },
  });

  assert.equal(await update.updateTask(taskId, { due_on: "2026-08-19" }, {
    onCanonicalMutationPersisted: () => { persistedCallbacks += 1; },
  }), false);
  assert.equal(persistedCallbacks, 0);
  assert.equal(messages.at(-1)?.tone, "warn");
  assert.match(messages.at(-1)?.text ?? "", /^Task wasn't updated:/);
});

test("non-schedule canonical commands without a new boundary preserve the current projection", async () => {
  const initialBoundary = boundary();
  const localTasks = [canonicalTask(initialBoundary)];
  const update = useTaskUpdateAction({
    canonicalCommandExecutor: async (action, currentTask): Promise<TaskStateRuntimeExecutionResult> => ({
      success: true,
      task: { ...currentTask, status: "done", canonical_schedule_boundary: undefined, canonical_schedule_anchor_date: undefined },
      response: { ...commandResponse("unused", action.expectedRevision), side_effect_ids: {} },
    }),
    currentDayKey: "2026-08-19",
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: () => {},
    setTasks: (updater) => localTasks.splice(0, localTasks.length, ...(typeof updater === "function" ? updater(localTasks) : updater)),
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: localTasks,
    updateTaskRowWithLegacyEnergyFallback: async () => { throw new Error("Legacy fallback must not run."); },
  });

  assert.equal(await update.updateTask(taskId, { status: "done" }), true);
  assert.equal(localTasks[0]?.status, "done");
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.id, initialBoundary.id);
});

test("schedule-changing canonical commands without a boundary fail closed", async () => {
  const initialBoundary = boundary();
  const localTasks = [canonicalTask(initialBoundary)];
  const messages: Array<{ tone: string; text: string }> = [];
  const update = useTaskUpdateAction({
    canonicalCommandExecutor: async (action, currentTask): Promise<TaskStateRuntimeExecutionResult> => ({
      success: true,
      task: { ...currentTask, due_on: "2026-08-19", canonical_schedule_boundary: undefined, canonical_schedule_anchor_date: undefined },
      response: { ...commandResponse("unused", action.expectedRevision), side_effect_ids: {} },
    }),
    currentDayKey: "2026-08-19",
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: (message) => {
      const next = typeof message === "function" ? message(messages.at(-1) ?? null) : message;
      if (next) messages.push(next);
    },
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: localTasks,
    updateTaskRowWithLegacyEnergyFallback: async () => { throw new Error("Legacy fallback must not run."); },
  });

  assert.equal(await update.updateTask(taskId, { due_on: "2026-08-19" }), false);
  assert.match(messages.at(-1)?.text ?? "", /did not return a schedule boundary/);
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.id, initialBoundary.id);
});

test("committed Task edits report post-commit boundary reconciliation failures distinctly", async () => {
  const initialBoundary = boundary();
  const localTasks = [canonicalTask(initialBoundary)];
  const messages: Array<{ tone: string; text: string }> = [];
  let persistedCallbacks = 0;
  const update = useTaskUpdateAction({
    canonicalCommandExecutor: async (action, currentTask): Promise<TaskStateRuntimeExecutionResult> => ({
      success: true,
      task: { ...currentTask, due_on: "2026-08-19", canonical_revision: currentTask.canonical_revision + 1 },
      response: commandResponse("boundary-missing", action.expectedRevision),
    }),
    currentDayKey: "2026-08-19",
    loadCanonicalScheduleBoundary: async () => null,
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: (message) => {
      const next = typeof message === "function" ? message(messages.at(-1) ?? null) : message;
      if (next) messages.push(next);
    },
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: localTasks,
    updateTaskRowWithLegacyEnergyFallback: async () => {
      throw new Error("Legacy fallback must not run.");
    },
  });

  assert.equal(await update.updateTask(taskId, { due_on: "2026-08-19" }, {
    onCanonicalMutationPersisted: () => { persistedCallbacks += 1; },
  }), false);
  assert.equal(persistedCallbacks, 1);
  assert.equal(messages.at(-1)?.tone, "warn");
  assert.match(messages.at(-1)?.text ?? "", /^Task was saved, but ADHDice couldn't refresh the updated Task state\. Refresh before editing it again\./);
});

test("committed Task edits retain persistence acknowledgement when History refresh fails", async () => {
  const initialBoundary = boundary();
  const committedBoundary = boundary({ id: "boundary-history-refresh", boundary_sequence: 2, boundary_type: "due_date_change", source: "set_due_date" });
  const localTasks = [canonicalTask(initialBoundary)];
  const messages: Array<{ tone: string; text: string }> = [];
  let persistedCallbacks = 0;
  const update = useTaskUpdateAction({
    canonicalCommandExecutor: async (action, currentTask): Promise<TaskStateRuntimeExecutionResult> => ({
      success: true,
      task: { ...currentTask, due_on: "2026-08-19", canonical_revision: currentTask.canonical_revision + 1 },
      response: {
        ...commandResponse(committedBoundary.id, action.expectedRevision),
        side_effect_ids: { history_fact_id: "history-1", schedule_boundary_id: committedBoundary.id },
      },
    }),
    currentDayKey: "2026-08-19",
    loadCanonicalScheduleBoundary: async () => committedBoundary,
    loadTaskHistoryForTasks: async () => ({
      [taskId]: { error: "History refresh failed.", history: null, status: "error" as const },
    }),
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: (message) => {
      const next = typeof message === "function" ? message(messages.at(-1) ?? null) : message;
      if (next) messages.push(next);
    },
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: localTasks,
    updateTaskRowWithLegacyEnergyFallback: async () => {
      throw new Error("Legacy fallback must not run.");
    },
  });

  assert.equal(await update.updateTask(taskId, { due_on: "2026-08-19" }, {
    onCanonicalMutationPersisted: () => { persistedCallbacks += 1; },
  }), false);
  assert.equal(persistedCallbacks, 1);
  assert.match(messages.at(-1)?.text ?? "", /Task was saved, but ADHDice couldn't refresh/);
});

test("committed Task edits retain persistence acknowledgement when local reconciliation fails", async () => {
  const initialBoundary = boundary();
  const committedBoundary = boundary({ id: "boundary-local-refresh", boundary_sequence: 2, boundary_type: "due_date_change", source: "set_due_date" });
  const localTasks = [canonicalTask(initialBoundary)];
  const messages: Array<{ tone: string; text: string }> = [];
  let persistedCallbacks = 0;
  const update = useTaskUpdateAction({
    canonicalCommandExecutor: async (action, currentTask): Promise<TaskStateRuntimeExecutionResult> => ({
      success: true,
      task: { ...currentTask, due_on: "2026-08-19", canonical_revision: currentTask.canonical_revision + 1 },
      response: commandResponse(committedBoundary.id, action.expectedRevision),
    }),
    currentDayKey: "2026-08-19",
    loadCanonicalScheduleBoundary: async () => committedBoundary,
    onTaskHistoryMutation: async () => {
      throw new Error("Local reconciliation failed.");
    },
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: (message) => {
      const next = typeof message === "function" ? message(messages.at(-1) ?? null) : message;
      if (next) messages.push(next);
    },
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: localTasks,
    updateTaskRowWithLegacyEnergyFallback: async () => {
      throw new Error("Legacy fallback must not run.");
    },
  });

  assert.equal(await update.updateTask(taskId, { due_on: "2026-08-19" }, {
    onCanonicalMutationPersisted: () => { persistedCallbacks += 1; },
  }), false);
  assert.equal(persistedCallbacks, 1);
  assert.match(messages.at(-1)?.text ?? "", /Task was saved, but ADHDice couldn't refresh/);
});

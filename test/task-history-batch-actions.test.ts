import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { useTaskHistoryActions } from "../src/hooks/useTaskHistoryActions.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { parseBatchIntake } from "../src/lib/home-batch-intake.ts";
import { applyBatchIntakeTaskMatches } from "../src/lib/home-batch-intake-matching.ts";
import { buildBatchIntakeExecutionPlan } from "../src/lib/home-batch-intake-executor.ts";
import type { CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";
import { projectTaskWithCanonicalScheduleBoundary } from "../src/lib/task-state-canonical/schedule-projection.ts";
import type {
  TaskHistoryOutcomeBatchExecutionResult,
  TaskStateRuntimeExecutionResult,
  TaskStateRuntimeLocalTask,
} from "../src/lib/task-state-runtime-executor.ts";

function canonicalTask(id: string): TaskStateRuntimeLocalTask {
  return {
    ...createTask({ id, status: "pending", title: "Canonical Calendar", sort_order: 1 }),
    canonical_revision: 4,
    canonicalization_status: "canonical_proven",
    entity_kind: "parent",
  };
}

function canonicalBoundary(taskId: string, boundaryId = `boundary-${taskId}`): CanonicalTaskScheduleBoundary {
  return {
    id: boundaryId,
    user_id: "user-1",
    entity_id: taskId,
    entity_kind: "parent",
    boundary_sequence: 1,
    boundary_type: "initial",
    source: "task_creation",
    schedule_model: "rolling",
    repeat_frequency: "daily",
    repeat_interval: 3,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    repeat_quota_count: null,
    repeat_quota_balance_enabled: false,
    effective_from_logical_date: "2026-09-01",
    anchor_date: "2026-09-01",
    anchor_confidence: "proven",
    one_time_due_on: null,
    due_time: "08:15",
    prior_boundary_id: null,
    idempotence_identity: `${boundaryId}:initial`,
  } as CanonicalTaskScheduleBoundary;
}

function projectedCanonicalTask(id: string, boundaryId = `boundary-${id}`): TaskStateRuntimeLocalTask {
  return projectTaskWithCanonicalScheduleBoundary(canonicalTask(id), canonicalBoundary(id, boundaryId)) as TaskStateRuntimeLocalTask;
}

function rawTaskWithoutProjection(task: TaskStateRuntimeLocalTask): TaskStateRuntimeLocalTask {
  const rawTask = { ...task } as TaskStateRuntimeLocalTask & {
    canonical_schedule_boundary?: unknown;
    canonical_schedule_anchor_date?: unknown;
  };
  delete rawTask.canonical_schedule_boundary;
  delete rawTask.canonical_schedule_anchor_date;
  return rawTask as TaskStateRuntimeLocalTask;
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

function freshTaskClient(
  reads: Array<{ data: TaskStateRuntimeLocalTask | null; error: { message: string } | null }>,
  expectedTaskId: string | readonly string[] = "canonical-calendar",
) {
  const expectedTaskIds = typeof expectedTaskId === "string" ? [expectedTaskId] : expectedTaskId;
  let readIndex = 0;
  let readCalls = 0;
  const client = {
    from(table: string) {
      assert.equal(table, "adhdice_clean_tasks");
      const query = {
        select(columns: string) {
          assert.equal(columns, "*");
          return query;
        },
        eq(column: string, value: string) {
          assert.equal(column, "id");
          assert.equal(value, expectedTaskIds[Math.min(readIndex, expectedTaskIds.length - 1)]);
          return query;
        },
        is(column: string, value: null) {
          assert.equal(column, "permanently_deleted_at");
          assert.equal(value, null);
          return query;
        },
        async maybeSingle() {
          readCalls += 1;
          return reads[readIndex++] ?? { data: null, error: { message: "No test Task read available." } };
        },
      };
      return query;
    },
  };
  return { client: client as never, get readCalls() { return readCalls; } };
}

function successfulBatchResult(task: TaskStateRuntimeLocalTask): TaskHistoryOutcomeBatchExecutionResult {
  return {
    success: true,
    task,
    response: {
      achievement_warning: null,
      achievement: { status: "completed", operation_id: "achievement-operation", error_code: null },
    } as never,
    completedChildren: [],
    achievementWarning: null,
  };
}

function staleBatchResult(): TaskHistoryOutcomeBatchExecutionResult {
  return {
    success: false,
    task: null,
    response: {
      achievement_warning: null,
      achievement: { status: "not_run", operation_id: "", error_code: null },
    } as never,
    completedChildren: [],
    error: {
      kind: "command_rejected",
      message: "This task changed before the canonical action could be committed. Refresh the task and try again.",
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

test("canonical History Complete carries the selected logical date and terminal reward through the command", async () => {
  const task = canonicalTask("canonical-calendar-complete");
  let actionType = "";
  let actionLogicalDate = "";
  let rewardCalls = 0;
  let localTask = task;
  const actions = useTaskHistoryActions({
    canonicalCommandExecutor: async (action, currentTask) => {
      actionType = action.actionType;
      actionLogicalDate = action.intent?.logical_date ?? "";
      return commandResult(currentTask, "complete");
    },
    client: { from: () => { throw new Error("legacy History write"); } } as never,
    currentDayKey: "2026-08-20",
    currentUserId: "user-1",
    loadTaskHistoryForTasks: async () => ({
      [task.id]: { status: "ready", history: [] },
    }),
    onTasksCompleted: async (candidates) => { rewardCalls += candidates.length; },
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: (updater) => { localTask = (typeof updater === "function" ? updater([localTask]) : updater)[0] as TaskStateRuntimeLocalTask; },
    sortTasksForUi: (tasks) => tasks,
    tasks: [task],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(task.id, "complete", ["2026-08-17"], { historicalOverride: true }), true);
  assert.equal(actionType, "complete_task");
  assert.equal(actionLogicalDate, "2026-08-17");
  assert.equal(localTask.status, "complete");
  assert.equal(rewardCalls, 1);
});

test("historical multi-date sync refreshes the canonical Task once before the grouped commit", async () => {
  const staleTask = { ...projectedCanonicalTask("canonical-calendar"), canonical_revision: 10 };
  const freshTask = rawTaskWithoutProjection({ ...staleTask, title: "Fresh persisted title", canonical_revision: 12 });
  const reader = freshTaskClient([{ data: freshTask, error: null }]);
  let receivedTask: TaskStateRuntimeLocalTask | null = null;
  let batchCalls = 0;
  const actions = useTaskHistoryActions({
    client: reader.client,
    currentDayKey: "2026-08-20",
    currentUserId: "user-1",
    historyBatchExecutor: async (input) => {
      batchCalls += 1;
      receivedTask = input.task;
      assert.equal(input.entries.length, 3);
      return successfulBatchResult(input.task);
    },
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    tasks: [staleTask],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(staleTask.id, "done", ["2026-08-17", "2026-08-18", "2026-08-19"], {
    historicalOverride: true,
    refreshCanonicalTaskBeforeCommit: true,
  }), true);
  assert.equal(batchCalls, 1);
  assert.equal(reader.readCalls, 1);
  assert.equal(receivedTask?.canonical_revision, 12);
  assert.equal(receivedTask?.title, "Fresh persisted title");
  assert.equal(receivedTask?.canonical_schedule_boundary?.id, "boundary-canonical-calendar");
  assert.equal(receivedTask?.canonical_schedule_anchor_date, "2026-09-01");
});

test("historical multi-date sync retries one stale start with the same batch replay identity", async () => {
  const staleTask = { ...projectedCanonicalTask("canonical-calendar"), canonical_revision: 10 };
  const firstFreshTask = rawTaskWithoutProjection({ ...staleTask, canonical_revision: 12 });
  const secondFreshTask = rawTaskWithoutProjection({ ...staleTask, canonical_revision: 13 });
  const reader = freshTaskClient([
    { data: firstFreshTask, error: null },
    { data: secondFreshTask, error: null },
  ]);
  const revisions: number[] = [];
  const replayIdentities: string[] = [];
  const boundaryIds: Array<string | undefined> = [];
  const anchorDates: Array<string | null | undefined> = [];
  let batchCalls = 0;
  const messages: string[] = [];
  const actions = useTaskHistoryActions({
    client: reader.client,
    currentDayKey: "2026-08-20",
    currentUserId: "user-1",
    historyBatchExecutor: async (input) => {
      batchCalls += 1;
      revisions.push(input.task.canonical_revision);
      replayIdentities.push(input.replayIdentity);
      boundaryIds.push(input.task.canonical_schedule_boundary?.id);
      anchorDates.push(input.task.canonical_schedule_anchor_date);
      return batchCalls === 1 ? staleBatchResult() : successfulBatchResult(input.task);
    },
    setMessage: (message) => {
      const next = typeof message === "function" ? message(null) : message;
      if (next) messages.push(next.text);
    },
    setTaskHistory: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    tasks: [staleTask],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(staleTask.id, "done", ["2026-08-17", "2026-08-18"], {
    historicalOverride: true,
    refreshCanonicalTaskBeforeCommit: true,
  }), true);
  assert.equal(batchCalls, 2);
  assert.deepEqual(revisions, [12, 13]);
  assert.deepEqual(boundaryIds, ["boundary-canonical-calendar", "boundary-canonical-calendar"]);
  assert.deepEqual(anchorDates, ["2026-09-01", "2026-09-01"]);
  assert.equal(replayIdentities[0], replayIdentities[1]);
  assert.equal(reader.readCalls, 2);
  assert.equal(messages.some((message) => message.includes("This task changed before")), false);
});

test("raw committed History Tasks preserve the local projection in state and callbacks", async () => {
  const projectedTask = { ...projectedCanonicalTask("post-commit-calendar"), canonical_revision: 10 };
  const committedTask = rawTaskWithoutProjection({
    ...projectedTask,
    status: "done",
    title: "Committed persisted title",
    canonical_revision: 11,
  });
  let localTasks: TaskStateRuntimeLocalTask[] = [projectedTask];
  let callbackTask: TaskStateRuntimeLocalTask | null = null;
  let targetedReconciliationCalls = 0;
  const actions = useTaskHistoryActions({
    client: {} as never,
    currentDayKey: "2026-08-20",
    currentUserId: "user-1",
    historyBatchExecutor: async () => successfulBatchResult(committedTask),
    onTaskCommitted: (task) => {
      callbackTask = task;
    },
    reconcileTaskEntity: async () => {
      targetedReconciliationCalls += 1;
    },
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: (updater) => {
      localTasks = typeof updater === "function" ? updater(localTasks) as TaskStateRuntimeLocalTask[] : updater as TaskStateRuntimeLocalTask[];
    },
    sortTasksForUi: (tasks) => tasks,
    tasks: [projectedTask],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(projectedTask.id, "done", ["2026-08-19", "2026-08-20"], {
    historicalOverride: true,
  }), true);
  assert.equal(localTasks[0]?.canonical_revision, 11);
  assert.equal(localTasks[0]?.title, "Committed persisted title");
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.id, "boundary-post-commit-calendar");
  assert.equal(callbackTask?.canonical_revision, 11);
  assert.equal(callbackTask?.canonical_schedule_boundary?.id, "boundary-post-commit-calendar");
  assert.equal(targetedReconciliationCalls, 1);
});

test("historical multi-date sync stops after the second stale start and preserves the conflict warning", async () => {
  const staleTask = { ...canonicalTask("canonical-calendar"), canonical_revision: 10 };
  const reader = freshTaskClient([
    { data: { ...staleTask, canonical_revision: 12 }, error: null },
    { data: { ...staleTask, canonical_revision: 13 }, error: null },
  ]);
  let batchCalls = 0;
  const messages: string[] = [];
  const actions = useTaskHistoryActions({
    client: reader.client,
    currentDayKey: "2026-08-20",
    currentUserId: "user-1",
    historyBatchExecutor: async () => {
      batchCalls += 1;
      return staleBatchResult();
    },
    setMessage: (message) => {
      const next = typeof message === "function" ? message(null) : message;
      if (next) messages.push(next.text);
    },
    setTaskHistory: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    tasks: [staleTask],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(staleTask.id, "done", ["2026-08-17", "2026-08-18"], {
    historicalOverride: true,
    refreshCanonicalTaskBeforeCommit: true,
  }), false);
  assert.equal(batchCalls, 2);
  assert.equal(reader.readCalls, 2);
  assert.match(messages.at(-1) ?? "", /This task changed before the canonical action could be committed/);
});

test("historical multi-date sync does not retry after a partial canonical commit", async () => {
  const staleTask = { ...canonicalTask("canonical-calendar"), canonical_revision: 10 };
  const freshTask = { ...staleTask, canonical_revision: 12 };
  const committedTask = { ...freshTask, status: "done" as const, canonical_revision: 13 };
  const reader = freshTaskClient([{ data: freshTask, error: null }]);
  let batchCalls = 0;
  let historyRefreshCalls = 0;
  const actions = useTaskHistoryActions({
    client: reader.client,
    currentDayKey: "2026-08-20",
    currentUserId: "user-1",
    historyBatchExecutor: async (input) => {
      batchCalls += 1;
      return {
        success: false,
        task: committedTask,
        response: {
          achievement_warning: "Some History changes committed.",
          achievement: { status: "failed", operation_id: "achievement-operation", error_code: "ACHIEVEMENT_FAILED" },
        } as never,
        completedChildren: [{
          logicalDate: input.entries[0]?.logical_date ?? "2026-08-17",
          previousTask: freshTask,
          task: committedTask,
          response: commandResult(freshTask, "done").response,
        }],
        error: {
          kind: "command_rejected" as const,
          message: "This task changed before the canonical action could be committed. Refresh the task and try again.",
          code: "STALE_REVISION",
          status: 409,
        },
      };
    },
    loadTaskHistoryForTasks: async () => {
      historyRefreshCalls += 1;
      return { [staleTask.id]: { status: "ready" as const, history: [] } };
    },
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    tasks: [staleTask],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(staleTask.id, "done", ["2026-08-17", "2026-08-18"], {
    historicalOverride: true,
    refreshCanonicalTaskBeforeCommit: true,
  }), false);
  assert.equal(batchCalls, 1);
  assert.equal(reader.readCalls, 1);
  assert.equal(historyRefreshCalls, 1);
});

test("historical Task sync refuses to commit when the fresh canonical read fails", async () => {
  const staleTask = { ...canonicalTask("canonical-calendar"), canonical_revision: 10 };
  const reader = freshTaskClient([{ data: null, error: { message: "Task read failed" } }]);
  let commandCalls = 0;
  const messages: string[] = [];
  const actions = useTaskHistoryActions({
    canonicalCommandExecutor: async () => {
      commandCalls += 1;
      return commandResult(staleTask, "done");
    },
    client: reader.client,
    currentDayKey: "2026-08-20",
    currentUserId: "user-1",
    setMessage: (message) => {
      const next = typeof message === "function" ? message(null) : message;
      if (next) messages.push(next.text);
    },
    setTaskHistory: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    tasks: [staleTask],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(staleTask.id, "done", ["2026-08-17"], {
    historicalOverride: true,
    refreshCanonicalTaskBeforeCommit: true,
  }), false);
  assert.equal(commandCalls, 0);
  assert.equal(reader.readCalls, 1);
  assert.match(messages.at(-1) ?? "", /Could not refresh this Task before applying its historical changes/);
});

test("historical single-date sync reclassifies after one stale conflict and reuses its calendar replay identity", async () => {
  const staleTask = { ...projectedCanonicalTask("canonical-calendar"), canonical_revision: 10 };
  const reader = freshTaskClient([
    { data: rawTaskWithoutProjection({ ...staleTask, canonical_revision: 12 }), error: null },
    { data: rawTaskWithoutProjection({ ...staleTask, canonical_revision: 13 }), error: null },
  ]);
  const revisions: number[] = [];
  const replayIdentities: string[] = [];
  const boundaryIds: Array<string | undefined> = [];
  let commandCalls = 0;
  let rewardCalls = 0;
  const actions = useTaskHistoryActions({
    canonicalCommandExecutor: async (action, task) => {
      commandCalls += 1;
      revisions.push(action.expectedRevision);
      replayIdentities.push(action.replayIdentity);
      boundaryIds.push(task.canonical_schedule_boundary?.id);
      return commandCalls === 1
        ? failedResult("This task changed before the canonical action could be committed. Refresh the task and try again.")
        : (() => {
            const result = commandResult(task, "done");
            return { ...result, task: rawTaskWithoutProjection(result.task) };
          })();
    },
    client: reader.client,
    currentDayKey: "2026-08-20",
    currentUserId: "user-1",
    onTasksCompleted: async (candidates) => { rewardCalls += candidates.length; },
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    tasks: [staleTask],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(staleTask.id, "done", ["2026-08-17"], {
    historicalOverride: true,
    refreshCanonicalTaskBeforeCommit: true,
  }), true);
  assert.equal(commandCalls, 2);
  assert.deepEqual(revisions, [12, 13]);
  assert.deepEqual(boundaryIds, ["boundary-canonical-calendar", "boundary-canonical-calendar"]);
  assert.equal(replayIdentities[0], replayIdentities[1]);
  assert.equal(reader.readCalls, 2);
  assert.equal(rewardCalls, 1);
});

test("historical single-date sync does not retry a second stale conflict", async () => {
  const staleTask = { ...canonicalTask("canonical-calendar"), canonical_revision: 10 };
  const reader = freshTaskClient([
    { data: { ...staleTask, canonical_revision: 12 }, error: null },
    { data: { ...staleTask, canonical_revision: 13 }, error: null },
  ]);
  let commandCalls = 0;
  const messages: string[] = [];
  const actions = useTaskHistoryActions({
    canonicalCommandExecutor: async () => {
      commandCalls += 1;
      return failedResult("This task changed before the canonical action could be committed. Refresh the task and try again.");
    },
    client: reader.client,
    currentDayKey: "2026-08-20",
    currentUserId: "user-1",
    setMessage: (message) => {
      const next = typeof message === "function" ? message(null) : message;
      if (next) messages.push(next.text);
    },
    setTaskHistory: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    tasks: [staleTask],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(staleTask.id, "done", ["2026-08-17"], {
    historicalOverride: true,
    refreshCanonicalTaskBeforeCommit: true,
  }), false);
  assert.equal(commandCalls, 2);
  assert.equal(reader.readCalls, 2);
  assert.match(messages.at(-1) ?? "", /This task changed before the canonical action could be committed/);
});

test("7.16.57 QA fixture uses fresh precommit revisions for all three batches and Madden single-date history", async () => {
  const fixture = `t: NBA 2K - Done 9/27 9/28 9/29 9/30 10/2 10/3
t: NBA The Run - Done 9/29 9/30 10/2
t: Wolverine - Done 9/27 9/29 9/30 10/2 10/3
t: Madden 27 - Done 9/29`;
  const canonicalTasks = ["NBA 2K", "NBA The Run", "Wolverine", "Madden 27"].map((title, index) => ({
    ...projectedCanonicalTask(`fixture-task-${index}`),
    title,
  }));
  const parsed = parseBatchIntake(fixture, { referenceDate: "2026-10-03" });
  const matched = applyBatchIntakeTaskMatches(parsed, canonicalTasks as Task[]);
  const plan = buildBatchIntakeExecutionPlan(matched);
  assert.deepEqual(plan.taskGroups.map((group) => group.dates.length), [6, 3, 5, 1]);

  const staleTasks = plan.taskGroups.map((group, index) => ({
    ...canonicalTasks[index]!,
    id: group.taskId,
    canonical_revision: 10 + index,
  }));
  const freshTasks = staleTasks.map((task, index) => rawTaskWithoutProjection({ ...task, canonical_revision: 12 + index }));
  const receivedRevisions: number[] = [];
  let localTasks: TaskStateRuntimeLocalTask[] = staleTasks;
  const multiReader = freshTaskClient(
    freshTasks.slice(0, 3).map((task) => ({ data: task, error: null })),
    plan.taskGroups.slice(0, 3).map((group) => group.taskId),
  );
  const multiActions = useTaskHistoryActions({
    client: multiReader.client,
    currentDayKey: "2026-10-03",
    currentUserId: "user-1",
    historyBatchExecutor: async (input) => {
      receivedRevisions.push(input.task.canonical_revision);
      const committed = rawTaskWithoutProjection({
        ...input.task,
        status: "done",
        canonical_revision: input.task.canonical_revision + 1,
      });
      return {
        ...successfulBatchResult(committed),
        completedChildren: [{
          logicalDate: input.entries[0]?.logical_date ?? "2026-10-03",
          previousTask: input.task,
          task: committed,
          response: { side_effect_ids: {} },
        }],
      } as TaskHistoryOutcomeBatchExecutionResult;
    },
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: (updater) => {
      localTasks = typeof updater === "function" ? updater(localTasks) as TaskStateRuntimeLocalTask[] : updater as TaskStateRuntimeLocalTask[];
    },
    sortTasksForUi: (tasks) => tasks,
    tasks: staleTasks,
    timezone: "UTC",
  });
  for (const group of plan.taskGroups.slice(0, 3)) {
    assert.equal(await multiActions.syncTaskHistoryEntries(group.taskId, "done", group.dates, {
      historicalOverride: true,
      refreshCanonicalTaskBeforeCommit: true,
    }), true);
  }

  const singleGroup = plan.taskGroups[3]!;
  const singleReader = freshTaskClient([{ data: freshTasks[3]!, error: null }], singleGroup.taskId);
  const singleActions = useTaskHistoryActions({
    canonicalCommandExecutor: async (_action, task) => {
      receivedRevisions.push(task.canonical_revision);
      const result = commandResult(task, "done");
      return { ...result, task: rawTaskWithoutProjection(result.task) };
    },
    client: singleReader.client,
    currentDayKey: "2026-10-03",
    currentUserId: "user-1",
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: (updater) => {
      localTasks = typeof updater === "function" ? updater(localTasks) as TaskStateRuntimeLocalTask[] : updater as TaskStateRuntimeLocalTask[];
    },
    sortTasksForUi: (tasks) => tasks,
    tasks: staleTasks,
    timezone: "UTC",
  });
  assert.equal(await singleActions.syncTaskHistoryEntries(singleGroup.taskId, "done", singleGroup.dates, {
    historicalOverride: true,
    refreshCanonicalTaskBeforeCommit: true,
  }), true);
  assert.equal(multiReader.readCalls, 3);
  assert.equal(singleReader.readCalls, 1);
  assert.deepEqual(receivedRevisions, [12, 13, 14, 15]);
  assert.equal(localTasks.length, 4);
  assert.ok(localTasks.every((task) => task.canonical_schedule_boundary?.id === `boundary-${task.id}`));
  assert.ok(localTasks.every((task) => task.canonical_schedule_anchor_date === "2026-09-01"));
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

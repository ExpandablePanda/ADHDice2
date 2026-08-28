import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { useTaskHistoryActions } from "../src/hooks/useTaskHistoryActions.ts";
import {
  invokeHistoryOutcomeBatch,
  type HistoryOutcomeBatchPartial,
  type HistoryOutcomeBatchSuccess,
} from "../src/lib/task-history-outcome-batch-client.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import type {
  TaskHistoryOutcomeBatchCommittedChild,
  TaskHistoryOutcomeBatchExecutionResult,
  TaskStateRuntimeLocalTask,
} from "../src/lib/task-state-runtime-executor.ts";
import { executeTaskHistoryOutcomeBatch } from "../src/lib/task-state-runtime-executor.ts";

const historyActionsSource = readFileSync(new URL("../src/hooks/useTaskHistoryActions.ts", import.meta.url), "utf8");
const edgeSource = readFileSync(new URL("../supabase/functions/task-state-command/index.ts", import.meta.url), "utf8");

function childPayload(date: string, index: number, rewardEntitlementId?: string) {
  return {
    index,
    logical_date: date,
    replay_identity: `batch:history:${date}:done`,
    state: "committed",
    result: {
      state: "committed",
      task_id: "task-1",
      command_id: `command-${index}`,
      expected_revision: 10 + index,
      next_revision: 11 + index,
      was_replayed: false,
      conflict_code: null,
      canonical_task_patch: {},
      compatibility_projection: {
        status: "done",
        due_on: null,
        completed_at: null,
        active_status_logical_date: null,
        active_occurrence_due_on: null,
      },
      ...(rewardEntitlementId ? { reward_entitlement_id: rewardEntitlementId } : {}),
    },
  };
}

function batchPayload(
  outcome: "done" | "missed" = "done",
  achievementStatus: "completed" | "failed" = "completed",
  achievementWarning: string | null = null,
) {
  const dates = ["2026-08-17", "2026-08-18", "2026-08-19"];
  return {
    type: "history_outcome_batch",
    state: "committed",
    task_id: "task-1",
    batch_replay_identity: "calendar-batch-1",
    expected_revision: 10,
    final_committed_revision: 13,
    completed_entries: dates,
    failed_entry_index: null,
    child_results: dates.map((date, index) => childPayload(date, index, outcome === "done" ? `reward-${index + 1}` : undefined)),
    achievement: { status: achievementStatus, operation_id: "achievement-operation-1", error_code: achievementStatus === "failed" ? "ACHIEVEMENT_FAILED" : null },
    achievement_warning: achievementWarning,
    error: null,
  };
}

function partialPayload(achievementWarning: string | null) {
  const committed = batchPayload();
  return {
    ...committed,
    state: "partial",
    final_committed_revision: 12,
    completed_entries: ["2026-08-17", "2026-08-18"],
    failed_entry_index: 2,
    child_results: [
      ...committed.child_results.slice(0, 2),
      {
        index: 2,
        logical_date: "2026-08-19",
        replay_identity: "batch:history:2026-08-19:done",
        expected_revision: 12,
        state: "rejected",
        error: {
          kind: "command_rejected",
          message: "Canonical Task State command was rejected.",
          code: "STALE_REVISION",
          status: 409,
        },
      },
    ],
    achievement_warning: achievementWarning,
    error: {
      kind: "command_rejected",
      message: "Canonical Task State command was rejected.",
      code: "STALE_REVISION",
      status: 409,
    },
  };
}

function fakeClient(data: unknown) {
  const calls: Array<{ functionName: string; body: unknown }> = [];
  return {
    calls,
    client: {
      functions: {
        invoke: async (functionName: string, options: { body: unknown }) => {
          calls.push({ functionName, body: options.body });
          return { data, error: null };
        },
      },
    },
  };
}

test("History batch client performs one Edge invocation and preserves every child reward ID", async () => {
  const harness = fakeClient(batchPayload());
  const result = await invokeHistoryOutcomeBatch({
    type: "history_outcome_batch",
    task_id: "task-1",
    replay_identity: "calendar-batch-1",
    expected_revision: 10,
    outcome: "done",
    entries: [
      { logical_date: "2026-08-17" },
      { logical_date: "2026-08-18" },
      { logical_date: "2026-08-19" },
    ],
  }, { client: harness.client });

  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0]?.functionName, "task-state-command");
  assert.equal((harness.calls[0]?.body as { type: string }).type, "history_outcome_batch");
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.child_results.map((child) => child.success ? child.side_effect_ids.reward_entitlement_id : null), ["reward-1", "reward-2", "reward-3"]);
  }
});

test("History batch client preserves a partial child failure and its Achievement warning", async () => {
  const result = await invokeHistoryOutcomeBatch({
    type: "history_outcome_batch",
    task_id: "task-1",
    replay_identity: "calendar-batch-partial",
    expected_revision: 10,
    outcome: "done",
    entries: [
      { logical_date: "2026-08-17" },
      { logical_date: "2026-08-18" },
      { logical_date: "2026-08-19" },
    ],
  }, { client: fakeClient(partialPayload("Some History changes committed, but Achievement reconciliation did not complete.")).client });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.state, "partial");
    assert.equal(result.child_results.length, 3);
    assert.equal(result.failed_entry_index, 2);
    assert.equal(result.error.code, "STALE_REVISION");
    assert.match(result.achievement_warning ?? "", /Some History changes committed/);
  }
});

test("production History wiring selects the dedicated batch branch only for multi-date outcomes", () => {
  assert.match(historyActionsSource, /uniqueEntryDates\.length > 1/);
  assert.match(historyActionsSource, /status === "done" \|\| status === "did_my_best" \|\| status === "missed"/);
  assert.match(historyActionsSource, /executeTaskHistoryOutcomeBatch/);
  assert.match(historyActionsSource, /!suppliedCanonicalCommandExecutor/);
  assert.match(historyActionsSource, /calendarReplayAttempts\.get\(batchKey\)/);
  assert.match(historyActionsSource, /calendarReplayAttempts\.delete\(replayKey\)/);
  assert.match(edgeSource, /validateHistoryOutcomeBatchIntent/);
  assert.match(edgeSource, /executeHistoryOutcomeBatch/);
});

test("History batch client preserves Missed as reward-free", async () => {
  const result = await invokeHistoryOutcomeBatch({
    type: "history_outcome_batch",
    task_id: "task-1",
    replay_identity: "calendar-batch-missed",
    expected_revision: 10,
    outcome: "missed",
    entries: [{ logical_date: "2026-08-17" }, { logical_date: "2026-08-18" }, { logical_date: "2026-08-19" }],
  }, { client: fakeClient(batchPayload("missed")).client });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.child_results.every((child) => child.success && !child.side_effect_ids.reward_entitlement_id), true);
});

test("History batch client keeps committed History successful when only final Achievement reconciliation fails", async () => {
  const result = await invokeHistoryOutcomeBatch({
    type: "history_outcome_batch",
    task_id: "task-1",
    replay_identity: "calendar-batch-achievement-warning",
    expected_revision: 10,
    outcome: "done",
    entries: [{ logical_date: "2026-08-17" }, { logical_date: "2026-08-18" }, { logical_date: "2026-08-19" }],
  }, { client: fakeClient(batchPayload("done", "failed", "History committed, but Achievement reconciliation did not complete.")).client });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.achievement.status, "failed");
    assert.match(result.achievement_warning ?? "", /History committed/);
  }
});

test("runtime batch reconciliation applies each canonical child and ends at the authoritative final revision", async () => {
  const initialTask = task();
  const harness = fakeClient(batchPayload());
  const execution = await executeTaskHistoryOutcomeBatch({
    task: initialTask,
    replayIdentity: "calendar-batch-1",
    outcome: "done",
    entries: [
      { logical_date: "2026-08-17" },
      { logical_date: "2026-08-18" },
      { logical_date: "2026-08-19" },
    ],
    invoke: (intent) => invokeHistoryOutcomeBatch(intent, { client: harness.client }),
  });

  assert.equal(execution.success, true);
  if (execution.success) {
    assert.equal(execution.task.canonical_revision, 13);
    assert.deepEqual(execution.completedChildren.map((child: TaskHistoryOutcomeBatchCommittedChild) => child.task.canonical_revision), [11, 12, 13]);
  }
  assert.equal(harness.calls.length, 1);
});

function task(revision = 10): TaskStateRuntimeLocalTask {
  return {
    ...createTask({ id: "task-1", status: "pending", title: "Batch task", sort_order: 1 }),
    canonical_revision: revision,
    canonicalization_status: "canonical_proven",
    entity_kind: "parent",
  };
}

function responseFor(reward: string): TaskHistoryOutcomeBatchExecutionResult["response"] {
  const dates = ["2026-08-17", "2026-08-18", "2026-08-19"];
  const children = dates.map((date, childIndex) => ({
    index: childIndex,
    logical_date: date,
    replay_identity: `calendar-batch-1:history:${date}:done`,
    success: true as const,
    state: "committed" as const,
    task_id: "task-1",
    command_id: `command-${childIndex}`,
    expected_revision: 10 + childIndex,
    next_revision: 11 + childIndex,
    was_replayed: false,
    conflict_code: null,
    canonical_task_patch: {},
    compatibility_projection: {
      status: "done",
      due_on: null,
      completed_at: null,
      active_status_logical_date: null,
      active_occurrence_due_on: null,
    },
    side_effect_ids: { reward_entitlement_id: `${reward}-${childIndex + 1}` },
    error: null,
  }));
  return {
    success: true,
    state: "committed",
    task_id: "task-1",
    batch_replay_identity: "calendar-batch-1",
    expected_revision: 10,
    final_committed_revision: 13,
    completed_entries: dates,
    failed_entry_index: null,
    child_results: children,
    achievement: { status: "completed", operation_id: "achievement-operation-1", error_code: null },
    achievement_warning: null,
    error: null,
  } satisfies HistoryOutcomeBatchSuccess;
}

function partialResponseFor(reward: string, achievementWarning: string | null): HistoryOutcomeBatchPartial {
  const committed = responseFor(reward);
  return {
    ...committed,
    success: false,
    state: "partial",
    final_committed_revision: 12,
    completed_entries: ["2026-08-17", "2026-08-18"],
    failed_entry_index: 2,
    child_results: committed.child_results.slice(0, 2),
    achievement_warning: achievementWarning,
    error: {
      kind: "command_rejected",
      message: "Canonical Task State command was rejected.",
      code: "STALE_REVISION",
      status: 409,
    },
  };
}

test("multi-date History action invokes the injected batch seam once and forwards all rewards once", async () => {
  const initialTask = task();
  let batchCalls = 0;
  let localTasks: Task[] = [initialTask];
  let rewardCandidates: Array<{ id?: string }> = [];
  let historyRefreshCalls = 0;
  let mutationCalls = 0;
  const messages: string[] = [];
  const actions = useTaskHistoryActions({
    client: {} as never,
    currentUserId: "user-1",
    currentDayKey: "2026-08-20",
    historyBatchExecutor: async (input): Promise<TaskHistoryOutcomeBatchExecutionResult> => {
      batchCalls += 1;
      assert.equal(input.task.id, initialTask.id);
      assert.equal(input.entries.length, 3);
      return {
        success: true,
        task: { ...initialTask, status: "done", canonical_revision: 13 },
        response: responseFor("reward"),
        completedChildren: [0, 1, 2].map((index) => ({
          logicalDate: `2026-08-${17 + index}`,
          previousTask: { ...initialTask, canonical_revision: 10 + index },
          task: { ...initialTask, status: "done", canonical_revision: 11 + index },
          response: responseFor("reward").child_results[index] as never,
        })),
        achievementWarning: null,
      };
    },
    loadTaskHistoryForTasks: async () => {
      historyRefreshCalls += 1;
      return { [initialTask.id]: { status: "ready", history: [] } };
    },
    onHistoryMutation: async () => { mutationCalls += 1; },
    onTasksCompleted: async (candidates) => { rewardCandidates = candidates.map((candidate) => ({ id: candidate.canonicalRewardEntitlementId })); },
    setMessage: (message) => { if (message && typeof message === "object" && "text" in message) messages.push(String(message.text)); },
    setTaskHistory: () => {},
    setTasks: (updater) => { localTasks = typeof updater === "function" ? updater(localTasks) : updater; },
    sortTasksForUi: (nextTasks) => nextTasks,
    taskHistory: [] as TaskHistory[],
    tasks: [initialTask],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(initialTask.id, "done", ["2026-08-19", "2026-08-17", "2026-08-18"]), true, messages.at(-1));
  assert.equal(batchCalls, 1);
  assert.deepEqual(rewardCandidates.map((candidate) => candidate.id), ["reward-1", "reward-2", "reward-3"]);
  assert.equal(historyRefreshCalls, 1);
  assert.equal(mutationCalls, 1);
  assert.equal(localTasks[0]?.canonical_revision, 13);
});

test("partial History action keeps committed rewards and combines the child failure with the Achievement warning", async () => {
  const initialTask = task();
  const response = partialResponseFor("reward", "Some History changes committed, but Achievement reconciliation did not complete.");
  let localTasks: Task[] = [initialTask];
  let rewardCandidates: Array<{ id?: string }> = [];
  let historyRefreshCalls = 0;
  let mutationCalls = 0;
  const messages: string[] = [];
  const actions = useTaskHistoryActions({
    client: {} as never,
    currentUserId: "user-1",
    currentDayKey: "2026-08-20",
    historyBatchExecutor: async (): Promise<TaskHistoryOutcomeBatchExecutionResult> => ({
      success: false,
      task: { ...initialTask, status: "done", canonical_revision: 12 },
      response,
      completedChildren: [0, 1].map((index) => ({
        logicalDate: `2026-08-${17 + index}`,
        previousTask: { ...initialTask, canonical_revision: 10 + index },
        task: { ...initialTask, status: "done", canonical_revision: 11 + index },
        response: response.child_results[index] as never,
      })),
      error: response.error,
    }),
    loadTaskHistoryForTasks: async () => {
      historyRefreshCalls += 1;
      return { [initialTask.id]: { status: "ready", history: [] } };
    },
    onHistoryMutation: async () => { mutationCalls += 1; },
    onTasksCompleted: async (candidates) => { rewardCandidates = candidates.map((candidate) => ({ id: candidate.canonicalRewardEntitlementId })); },
    setMessage: (message) => { if (message && typeof message === "object" && "text" in message) messages.push(String(message.text)); },
    setTaskHistory: () => {},
    setTasks: (updater) => { localTasks = typeof updater === "function" ? updater(localTasks) : updater; },
    sortTasksForUi: (nextTasks) => nextTasks,
    taskHistory: [] as TaskHistory[],
    tasks: [initialTask],
    timezone: "UTC",
  });

  assert.equal(await actions.syncTaskHistoryEntries(initialTask.id, "done", ["2026-08-17", "2026-08-18", "2026-08-19"]), false);
  assert.deepEqual(rewardCandidates.map((candidate) => candidate.id), ["reward-1", "reward-2"]);
  assert.equal(historyRefreshCalls, 1);
  assert.equal(mutationCalls, 1);
  assert.equal(localTasks[0]?.canonical_revision, 12);
  assert.match(messages.at(-1) ?? "", /Canonical Task State command was rejected/);
  assert.match(messages.at(-1) ?? "", /Achievement reconciliation did not complete/);
});

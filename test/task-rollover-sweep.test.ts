import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock } from "node:test";
import test from "node:test";

import type { TaskRolloverSweepCandidate } from "../src/lib/task-rollover-sweep.ts";
import type {
  TaskRolloverSweepIntent,
  TaskRolloverSweepResponse,
  TaskStateCommandError,
} from "../src/lib/task-state-command-client.ts";
import type { TaskStateRuntimeLocalTask } from "../src/lib/task-state-runtime-executor.ts";

mock.module("@/lib/supabase", {
  exports: { createBrowserSupabaseClient: () => null },
});

const { executeTaskRolloverSweep } = await import("../src/lib/task-rollover-sweep.ts");

const sweepSource = readFileSync(new URL("../src/lib/task-rollover-sweep.ts", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

function candidates(count: number): TaskRolloverSweepCandidate[] {
  return Array.from({ length: count }, (_, index) => {
    const taskId = `task-${String(index + 1).padStart(2, "0")}`;
    const task = {
      id: taskId,
      user_id: "user-1",
      parent_task_id: null,
      revision: 1,
      title: `Task ${index + 1}`,
      task_type: "task",
      notes: null,
      status: "pending",
      priority: "normal",
      energy: "none",
      is_urgent: false,
      is_important: false,
      due_on: "2026-09-26",
      active_status_logical_date: "2026-09-25",
      active_occurrence_due_on: "2026-09-25",
      scheduled_on: null,
      due_time: null,
      estimated_minutes: null,
      actual_seconds: 0,
      tags: [],
      external_link_label: null,
      external_link_url: null,
      one_step_at_a_time: false,
      subtasks_auto_reset: false,
      repeat_frequency: "daily",
      repeat_interval: 1,
      repeat_days_of_week: [],
      repeat_day_of_month: null,
      repeat_monthly_mode: "day_of_month",
      repeat_monthly_ordinal: null,
      repeat_monthly_weekday: null,
      pinned_at: null,
      pin_order: null,
      sort_order: index,
      completed_at: null,
      trashed_at: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-25T00:00:00.000Z",
      canonical_revision: 1,
    } as unknown as TaskStateRuntimeLocalTask;
    return {
      task,
      replayIdentity: `rollover:${taskId}:2026-09-26:4`,
    };
  });
}

function committedResponse(intent: TaskRolloverSweepIntent): TaskRolloverSweepResponse {
  return {
    success: true,
    committedTaskIds: intent.commands.map((command) => command.task_id),
    childResults: intent.commands.map((command) => ({
      taskId: command.task_id,
      replayIdentity: command.replay_identity,
      response: {
        success: true,
        state: "committed",
        task_id: command.task_id,
        command_id: `command:${command.task_id}`,
        expected_revision: command.expected_revision ?? 1,
        next_revision: (command.expected_revision ?? 1) + 1,
        was_replayed: false,
        conflict_code: null,
        canonical_task_patch: {},
        compatibility_projection: {
          status: "pending",
          due_on: null,
          completed_at: null,
          active_status_logical_date: null,
          active_occurrence_due_on: null,
        },
        side_effect_ids: {},
      },
      error: null,
    })),
    achievementStatus: "completed",
    achievementOperationId: `achievement:${intent.replay_identity}`,
    achievementFinalizationPending: false,
    error: null,
  };
}

function failedResponse(
  intent: TaskRolloverSweepIntent,
  error: TaskStateCommandError,
): TaskRolloverSweepResponse {
  return {
    ...committedResponse(intent),
    success: false,
    committedTaskIds: [],
    childResults: [],
    achievementStatus: "not_run",
    error,
  };
}

function finalizationFailureResponse(intent: TaskRolloverSweepIntent): TaskRolloverSweepResponse {
  return {
    ...committedResponse(intent),
    success: false,
    achievementStatus: "failed",
    achievementFinalizationPending: true,
    error: {
      kind: "command_rejected",
      message: "Rollover Tasks committed, but Achievement reconciliation did not complete.",
      code: "ACHIEVEMENT_FINALIZATION_FAILED",
      status: 503,
    },
  };
}

async function runSuccessfulSweep(input: {
  candidates: TaskRolloverSweepCandidate[];
  settledTaskIds?: ReadonlySet<string>;
  achievementFinalizationPending?: boolean;
  payloads?: TaskRolloverSweepIntent[];
}) {
  return executeTaskRolloverSweep({
    client: null,
    candidates: input.candidates,
    settledTaskIds: input.settledTaskIds ?? new Set(),
    achievementFinalizationPending: input.achievementFinalizationPending ?? false,
    sweepReplayIdentity: "rollover-sweep:2026-09-26",
    invoke: async (intent) => {
      input.payloads?.push(intent);
      return committedResponse(intent);
    },
  });
}

test("33 candidates invoke exactly five serial chunks with stable order and replay identities", async () => {
  const input = candidates(33);
  const firstPayloads: TaskRolloverSweepIntent[] = [];
  const first = await runSuccessfulSweep({ candidates: input, payloads: firstPayloads });
  const secondPayloads: TaskRolloverSweepIntent[] = [];
  const second = await runSuccessfulSweep({ candidates: input, payloads: secondPayloads });

  assert.deepEqual(firstPayloads.map((payload) => payload.commands.length), [8, 8, 8, 8, 1]);
  assert.ok(firstPayloads.every((payload) => payload.commands.length <= 8));
  assert.deepEqual(
    firstPayloads.flatMap((payload) => payload.commands.map((command) => command.task_id)),
    input.map(({ task }) => task.id),
  );
  assert.deepEqual(
    firstPayloads.flatMap((payload) => payload.commands.map((command) => command.replay_identity)),
    input.map(({ replayIdentity }) => replayIdentity),
  );
  assert.deepEqual(
    firstPayloads.map((payload) => payload.replay_identity),
    secondPayloads.map((payload) => payload.replay_identity),
  );
  assert.deepEqual(
    firstPayloads.flatMap((payload) => payload.commands),
    secondPayloads.flatMap((payload) => payload.commands),
  );
  assert.equal(first.success, true);
  assert.equal(first.achievementFinalizationPending, false);
  assert.deepEqual(first.settledTaskIds, input.map(({ task }) => task.id));
  assert.deepEqual(first.committedTasks.map(({ taskId }) => taskId), input.map(({ task }) => task.id));
  assert.equal(second.success, true);
});

test("chunk N+1 is not invoked before chunk N resolves", async () => {
  let resolveFirst!: (response: TaskRolloverSweepResponse) => void;
  const firstResponse = new Promise<TaskRolloverSweepResponse>((resolve) => { resolveFirst = resolve; });
  const payloads: TaskRolloverSweepIntent[] = [];
  const run = executeTaskRolloverSweep({
    client: null,
    candidates: candidates(17),
    settledTaskIds: new Set(),
    achievementFinalizationPending: false,
    sweepReplayIdentity: "rollover-sweep:serial",
    invoke: async (intent) => {
      payloads.push(intent);
      if (payloads.length === 1) return firstResponse;
      return committedResponse(intent);
    },
  });

  assert.equal(payloads.length, 1);
  assert.deepEqual(payloads[0]?.commands.map((command) => command.task_id), ["task-01", "task-02", "task-03", "task-04", "task-05", "task-06", "task-07", "task-08"]);
  resolveFirst(committedResponse(payloads[0]!));
  assert.equal(payloads.length, 1, "the next chunk must wait for the first response");
  const result = await run;
  assert.equal(result.success, true);
  assert.deepEqual(payloads.map((payload) => payload.commands.length), [8, 8, 1]);
});

test("failure in chunk three preserves prior settlements and stops later chunks", async () => {
  const input = candidates(33);
  const payloads: TaskRolloverSweepIntent[] = [];
  const result = await executeTaskRolloverSweep({
    client: null,
    candidates: input,
    settledTaskIds: new Set(),
    achievementFinalizationPending: false,
    sweepReplayIdentity: "rollover-sweep:chunk-three-failure",
    invoke: async (intent) => {
      payloads.push(intent);
      return payloads.length === 3
        ? failedResponse(intent, {
          kind: "command_rejected",
          message: "chunk three failed",
          code: "ROLLOVER_CHILD_FAILED",
          status: 409,
        })
        : committedResponse(intent);
    },
  });

  assert.equal(payloads.length, 3);
  assert.deepEqual(result.settledTaskIds, input.slice(0, 16).map(({ task }) => task.id));
  assert.deepEqual(result.committedTasks.map(({ taskId }) => taskId), input.slice(0, 16).map(({ task }) => task.id));
  assert.equal(result.success, false);
  assert.equal(result.achievementFinalizationPending, false);
  assert.equal(payloads[3], undefined);
  assert.equal(payloads[4], undefined);
});

test("retry after partial failure excludes settled Tasks and completes unresolved Tasks", async () => {
  const input = candidates(33);
  const firstPayloads: TaskRolloverSweepIntent[] = [];
  const first = await executeTaskRolloverSweep({
    client: null,
    candidates: input,
    settledTaskIds: new Set(),
    achievementFinalizationPending: false,
    sweepReplayIdentity: "rollover-sweep:partial-retry",
    invoke: async (intent) => {
      firstPayloads.push(intent);
      return firstPayloads.length === 3
        ? failedResponse(intent, {
          kind: "command_rejected",
          message: "chunk three failed",
          code: "ROLLOVER_CHILD_FAILED",
          status: 409,
        })
        : committedResponse(intent);
    },
  });
  const retryPayloads: TaskRolloverSweepIntent[] = [];
  const retry = await runSuccessfulSweep({
    candidates: input,
    settledTaskIds: new Set(first.settledTaskIds),
    payloads: retryPayloads,
  });

  assert.deepEqual(
    retryPayloads.flatMap((payload) => payload.commands.map((command) => command.task_id)),
    input.slice(16).map(({ task }) => task.id),
  );
  assert.ok(retryPayloads.every((payload) => payload.commands.every((command) => !input.slice(0, 16).some(({ task }) => task.id === command.task_id))));
  assert.deepEqual(
    retryPayloads.flatMap((payload) => payload.commands.map((command) => command.replay_identity)),
    input.slice(16).map(({ replayIdentity }) => replayIdentity),
  );
  assert.equal(retry.success, true);
  assert.deepEqual(retry.settledTaskIds, input.slice(16).map(({ task }) => task.id));
});

test("Achievement finalization failure leaves that chunk retryable with the same child identities", async () => {
  const input = candidates(17);
  const firstPayloads: TaskRolloverSweepIntent[] = [];
  const first = await executeTaskRolloverSweep({
    client: null,
    candidates: input,
    settledTaskIds: new Set(),
    achievementFinalizationPending: false,
    sweepReplayIdentity: "rollover-sweep:achievement-retry",
    invoke: async (intent) => {
      firstPayloads.push(intent);
      return firstPayloads.length === 2 ? finalizationFailureResponse(intent) : committedResponse(intent);
    },
  });
  const retryPayloads: TaskRolloverSweepIntent[] = [];
  const retry = await runSuccessfulSweep({
    candidates: input,
    settledTaskIds: new Set(first.settledTaskIds),
    achievementFinalizationPending: first.achievementFinalizationPending,
    payloads: retryPayloads,
  });

  assert.equal(first.success, false);
  assert.equal(first.achievementFinalizationPending, true);
  assert.deepEqual(first.settledTaskIds, input.slice(0, 8).map(({ task }) => task.id));
  assert.deepEqual(first.committedTasks.map(({ taskId }) => taskId), input.slice(0, 16).map(({ task }) => task.id));
  assert.deepEqual(
    retryPayloads.flatMap((payload) => payload.commands.map((command) => command.replay_identity)),
    input.slice(8).map(({ replayIdentity }) => replayIdentity),
  );
  assert.equal(retry.success, true);
});

test("invocation failure after earlier chunks keeps those chunks excluded on retry", async () => {
  const input = candidates(17);
  const firstPayloads: TaskRolloverSweepIntent[] = [];
  const first = await executeTaskRolloverSweep({
    client: null,
    candidates: input,
    settledTaskIds: new Set(),
    achievementFinalizationPending: false,
    sweepReplayIdentity: "rollover-sweep:network-retry",
    invoke: async (intent) => {
      firstPayloads.push(intent);
      if (firstPayloads.length === 3) throw new Error("network unavailable");
      return committedResponse(intent);
    },
  });
  const retryPayloads: TaskRolloverSweepIntent[] = [];
  const retry = await runSuccessfulSweep({
    candidates: input,
    settledTaskIds: new Set(first.settledTaskIds),
    payloads: retryPayloads,
  });

  assert.equal(first.success, false);
  assert.deepEqual(first.settledTaskIds, input.slice(0, 16).map(({ task }) => task.id));
  assert.deepEqual(retryPayloads.flatMap((payload) => payload.commands.map((command) => command.task_id)), ["task-17"]);
  assert.equal(retry.success, true);
});

test("empty candidates succeed without pending finalization and fail closed when replay is pending", async () => {
  const input = candidates(0);
  const complete = await runSuccessfulSweep({ candidates: input });
  const pending = await runSuccessfulSweep({ candidates: input, achievementFinalizationPending: true });

  assert.equal(complete.success, true);
  assert.equal(complete.errorMessage, null);
  assert.equal(complete.achievementFinalizationPending, false);
  assert.equal(pending.success, false);
  assert.equal(pending.achievementFinalizationPending, true);
  assert.match(pending.errorMessage ?? "", /replayable child commands/);
});

test("incremental chunk finalization has no full Achievement rebuild path", () => {
  assert.doesNotMatch(sweepSource, /adhdice_rebuild_achievement_progress/);
});

test("chunk completion does not start a per-child projection repair", () => {
  assert.doesNotMatch(sweepSource, /reconcileRolloverWorkspace|requestCurrentTaskProjectionLogicalDayRefresh/);
  assert.match(taskAppSource, /onOwnedSettled:[\s\S]*await reconcileRolloverWorkspace\(\)/);
});

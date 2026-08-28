import assert from "node:assert/strict";
import test from "node:test";

import {
  executeHistoryOutcomeBatch,
  type TrustedTaskStateCommandClient,
} from "../supabase/functions/task-state-command/orchestration.ts";
import {
  buildTrustedTaskStateCommandReplayDescriptor,
  validateHistoryOutcomeBatchIntent,
  type HistoryOutcomeBatchIntent,
  type TaskStateCommandIntent,
} from "../supabase/functions/task-state-command/domain.ts";
import type { CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";

const taskId = "task-history-batch";
const userId = "owner-1";

const readModel = (revision: number) => ({
  task: {
    id: taskId,
    user_id: userId,
    entity_kind: "parent",
    revision,
    canonical_revision: revision,
    status: "pending",
    due_on: "2026-08-10",
    terminal_state: "active",
    container_state: "active",
    workflow_state: "none",
  },
  scheduleBoundaries: [],
  occurrences: [],
  occurrenceEffectiveOverrides: [],
  historyFacts: [],
  commandOperations: [],
  calendarOverrides: [],
  rewardEntitlements: [],
  rewardGrants: [],
  rewardClaimConsumptions: [],
  legacyHistoryEvidence: [],
  logicalDayProfile: { timezone: "UTC", day_start_time: "00:00", settings_revision: 1 },
}) as unknown as CanonicalTaskStateReadModel;

const batchIntent: HistoryOutcomeBatchIntent = {
  type: "history_outcome_batch",
  task_id: taskId,
  replay_identity: "calendar-batch-attempt-1",
  expected_revision: 10,
  outcome: "done",
  entries: [
    { logical_date: "2026-08-17" },
    { logical_date: "2026-08-18" },
    { logical_date: "2026-08-19" },
  ],
};

function dependenciesFor(options: {
  invoke: (input: { intent: TaskStateCommandIntent; deferAchievements?: boolean }) => Promise<{ data: unknown; error: null | { code?: string; message?: string } }>;
  finalize?: () => Promise<{ data: unknown; error: null | { code?: string; message?: string } }>;
}) {
  let revision = batchIntent.expected_revision;
  return {
    loadReplayOperation: async () => ({ data: null, error: null }),
    loadCanonicalState: async () => ({ data: readModel(revision), error: null }),
    buildEngineInput: (() => ({})) as never,
    buildCommand: ((input: { intent: TaskStateCommandIntent }) => ({
      commandId: input.intent.replay_identity,
      commandType: "handled_outcome",
    })) as never,
    planCommand: (({ task }: { task: { canonical_revision: number } }) => ({
      command: { commandId: "planned", commandType: "handled_outcome" },
      normalizedResult: {
        state: "accepted",
        conflictCode: null,
        expectedRevision: task.canonical_revision,
        nextRevision: task.canonical_revision + 1,
      },
    })) as never,
    serializePlan: (() => ({})) as never,
    invokeCommand: async (input: { intent: TaskStateCommandIntent; deferAchievements?: boolean }) => {
      const result = await options.invoke(input);
      if (!result.error && result.data && typeof result.data === "object" && "next_revision" in result.data) {
        revision = Number((result.data as { next_revision: number }).next_revision);
      }
      return result;
    },
    finalizeAchievements: options.finalize ?? (async () => ({ data: { status: "completed" }, error: null })),
    setRevision: (nextRevision: number) => { revision = nextRevision; },
  };
}

test("batch validation is bounded, exact, date-safe, and rejects duplicate or privileged fields", () => {
  assert.deepEqual(validateHistoryOutcomeBatchIntent(batchIntent), batchIntent);
  assert.equal(validateHistoryOutcomeBatchIntent({ ...batchIntent, entries: [] }), null);
  assert.equal(validateHistoryOutcomeBatchIntent({ ...batchIntent, entries: [{ logical_date: "2026-08-17" }, { logical_date: "2026-08-17" }] }), null);
  assert.equal(validateHistoryOutcomeBatchIntent({ ...batchIntent, user_id: userId }), null);
  assert.equal(validateHistoryOutcomeBatchIntent({ ...batchIntent, entries: [{ logical_date: "2026-02-30" }] }), null);
  assert.equal(validateHistoryOutcomeBatchIntent({ ...batchIntent, entries: Array.from({ length: 65 }, (_, index) => ({ logical_date: `2026-08-${String(index + 1).padStart(2, "0")}` })) }), null);
});

test("three-date batch invokes normal canonical children sequentially with threaded revisions and deterministic replay identities", async () => {
  const childCalls: Array<{ date: string; expectedRevision: number; replayIdentity: string; deferAchievements?: boolean }> = [];
  let finalizerCalls = 0;
  const result = await executeHistoryOutcomeBatch({
    userId,
    intent: batchIntent,
    adminClient: {} as TrustedTaskStateCommandClient,
    dependencies: dependenciesFor({
      invoke: async ({ intent, deferAchievements }) => {
        childCalls.push({
          date: intent.logical_date ?? "",
          expectedRevision: intent.expected_revision ?? 0,
          replayIdentity: intent.replay_identity,
          deferAchievements,
        });
        const nextRevision = (intent.expected_revision ?? 0) + 1;
        return {
          data: {
            state: "committed",
            task_id: taskId,
            command_id: intent.replay_identity,
            expected_revision: intent.expected_revision,
            next_revision: nextRevision,
            canonical_task_patch: {},
            compatibility_projection: {},
          },
          error: null,
        };
      },
      finalize: async () => {
        finalizerCalls += 1;
        return { data: { status: "completed" }, error: null };
      },
    }),
  });

  assert.equal(result.status, 200);
  const body = result.body as Record<string, unknown>;
  assert.equal(body.state, "committed");
  assert.deepEqual(childCalls.map((call) => call.date), ["2026-08-17", "2026-08-18", "2026-08-19"]);
  assert.deepEqual(childCalls.map((call) => call.expectedRevision), [10, 11, 12]);
  assert.deepEqual(childCalls.map((call) => call.replayIdentity), [
    "calendar-batch-attempt-1:history:2026-08-17:done",
    "calendar-batch-attempt-1:history:2026-08-18:done",
    "calendar-batch-attempt-1:history:2026-08-19:done",
  ]);
  assert.equal(childCalls.every((call) => call.deferAchievements === true), true);
  assert.equal(finalizerCalls, 1);
  assert.equal(body.final_committed_revision, 13);
});

test("stale child stops the batch after earlier commits and final Achievement failure remains post-commit metadata", async () => {
  const dates: string[] = [];
  const staleResult = await executeHistoryOutcomeBatch({
    userId,
    intent: batchIntent,
    adminClient: {} as TrustedTaskStateCommandClient,
    dependencies: dependenciesFor({
      invoke: async ({ intent }) => {
        dates.push(intent.logical_date ?? "");
        if (dates.length === 2) return { data: null, error: { code: "40001", message: "stale" } };
        return { data: { state: "committed", task_id: taskId, command_id: intent.replay_identity, expected_revision: intent.expected_revision, next_revision: (intent.expected_revision ?? 0) + 1 }, error: null };
      },
    }),
  });
  const staleBody = staleResult.body as Record<string, unknown>;
  assert.equal(staleBody.state, "partial");
  assert.deepEqual(dates, ["2026-08-17", "2026-08-18"]);
  assert.deepEqual(staleBody.completed_entries, ["2026-08-17"]);
  assert.equal(staleBody.failed_entry_index, 1);
  assert.equal(staleBody.final_committed_revision, 11);

  const finalFailure = await executeHistoryOutcomeBatch({
    userId,
    intent: batchIntent,
    adminClient: {} as TrustedTaskStateCommandClient,
    dependencies: dependenciesFor({
      invoke: async ({ intent }) => ({ data: { state: "committed", task_id: taskId, command_id: intent.replay_identity, expected_revision: intent.expected_revision, next_revision: (intent.expected_revision ?? 0) + 1 }, error: null }),
      finalize: async () => ({ data: { status: "failed", error_code: "ACHIEVEMENT_FAILED" }, error: null }),
    }),
  });
  const finalFailureBody = finalFailure.body as Record<string, unknown>;
  assert.equal(finalFailureBody.state, "committed");
  assert.deepEqual(finalFailureBody.completed_entries, ["2026-08-17", "2026-08-18", "2026-08-19"]);
  assert.deepEqual(finalFailureBody.achievement, {
    status: "failed",
    operation_id: finalFailureBody.achievement && typeof finalFailureBody.achievement === "object"
      ? (finalFailureBody.achievement as Record<string, unknown>).operation_id
      : null,
    error_code: "ACHIEVEMENT_FAILED",
  });
  assert.equal(typeof (finalFailureBody.achievement as Record<string, unknown>).operation_id, "string");
  assert.match(String(finalFailureBody.achievement_warning), /History committed/);
});

test("retry replays committed child identities and only executes the unresolved child", async () => {
  const operations = new Map<string, unknown>();
  const newChildCalls: string[] = [];
  const dependencies = dependenciesFor({
    invoke: async ({ intent }) => {
      newChildCalls.push(intent.replay_identity);
      const result = {
        state: "committed",
        task_id: taskId,
        command_id: intent.replay_identity,
        expected_revision: intent.expected_revision,
        next_revision: (intent.expected_revision ?? 0) + 1,
        was_replayed: false,
        conflict_code: null,
        canonical_task_patch: {},
        compatibility_projection: {},
      };
      if (newChildCalls.length <= 2) {
        const descriptor = buildTrustedTaskStateCommandReplayDescriptor({ userId, intent });
        operations.set(descriptor.idempotenceIdentity, {
          user_id: userId,
          entity_id: taskId,
          command_id: descriptor.commandId,
          idempotence_identity: descriptor.idempotenceIdentity,
          accepted_payload_digest: descriptor.acceptedPayloadDigest,
          state: "committed",
          result_references: result,
        });
      }
      return { data: result, error: null };
    },
  });
  dependencies.loadReplayOperation = async (_client: unknown, request: { idempotenceIdentity: string }) => ({
    data: operations.get(request.idempotenceIdentity) ?? null,
    error: null,
  }) as never;

  const first = await executeHistoryOutcomeBatch({ userId, intent: batchIntent, adminClient: {} as TrustedTaskStateCommandClient, dependencies });
  assert.equal((first.body as Record<string, unknown>).final_committed_revision, 13);
  assert.equal(newChildCalls.length, 3);
  dependencies.setRevision(12);
  const second = await executeHistoryOutcomeBatch({ userId, intent: batchIntent, adminClient: {} as TrustedTaskStateCommandClient, dependencies });
  const secondBody = second.body as Record<string, unknown>;
  assert.equal(secondBody.final_committed_revision, 13);
  assert.deepEqual(newChildCalls, [
    "calendar-batch-attempt-1:history:2026-08-17:done",
    "calendar-batch-attempt-1:history:2026-08-18:done",
    "calendar-batch-attempt-1:history:2026-08-19:done",
    "calendar-batch-attempt-1:history:2026-08-19:done",
  ]);
  const childResults = secondBody.child_results as Array<Record<string, unknown>>;
  assert.equal((childResults[0]?.result as Record<string, unknown>)?.was_replayed, true);
  assert.equal((childResults[1]?.result as Record<string, unknown>)?.was_replayed, true);
});

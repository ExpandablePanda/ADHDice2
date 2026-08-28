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
  finalize?: (input: { operationId: string }) => Promise<{ data: unknown; error: null | { code?: string; message?: string } }>;
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

test("stale child stops after a committed prefix and finalizes Achievement before returning", async () => {
  const dates: string[] = [];
  const operationIds: string[] = [];
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
      finalize: async ({ operationId }) => {
        operationIds.push(operationId);
        return { data: { status: "inactive" }, error: null };
      },
    }),
  });
  const staleBody = staleResult.body as Record<string, unknown>;
  assert.equal(staleBody.state, "partial");
  assert.deepEqual(dates, ["2026-08-17", "2026-08-18"]);
  assert.deepEqual(staleBody.completed_entries, ["2026-08-17"]);
  assert.equal(staleBody.failed_entry_index, 1);
  assert.equal(staleBody.final_committed_revision, 11);
  assert.deepEqual((staleBody.error as Record<string, unknown>).kind, "command_rejected");
  assert.equal(operationIds.length, 1);
  assert.match(operationIds[0] ?? "", /^[0-9a-f-]{36}$/);
  assert.deepEqual(staleBody.achievement, { status: "inactive", operation_id: operationIds[0], error_code: null });
  assert.equal(staleBody.achievement_warning, null);

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

test("partial batch preserves the child failure when final Achievement reconciliation fails", async () => {
  let finalizerCalls = 0;
  const result = await executeHistoryOutcomeBatch({
    userId,
    intent: batchIntent,
    adminClient: {} as TrustedTaskStateCommandClient,
    dependencies: dependenciesFor({
      invoke: async ({ intent }) => {
        if (intent.logical_date === "2026-08-19") return { data: null, error: { code: "40001", message: "stale revision" } };
        return { data: { state: "committed", task_id: taskId, command_id: intent.replay_identity, expected_revision: intent.expected_revision, next_revision: (intent.expected_revision ?? 0) + 1 }, error: null };
      },
      finalize: async () => {
        finalizerCalls += 1;
        return { data: { status: "failed", error_code: "ACHIEVEMENT_FAILED" }, error: null };
      },
    }),
  });
  const body = result.body as Record<string, unknown>;
  assert.equal(body.state, "partial");
  assert.deepEqual(body.completed_entries, ["2026-08-17", "2026-08-18"]);
  assert.equal((body.error as Record<string, unknown>).kind, "command_rejected");
  assert.equal((body.error as Record<string, unknown>).message, "Canonical Task State command was rejected.");
  assert.equal(finalizerCalls, 1);
  assert.deepEqual(body.achievement && typeof body.achievement === "object" ? body.achievement : null, {
    status: "failed",
    operation_id: body.achievement && typeof body.achievement === "object"
      ? (body.achievement as Record<string, unknown>).operation_id
      : null,
    error_code: "ACHIEVEMENT_FAILED",
  });
  assert.match(String(body.achievement_warning), /Some History changes committed/);
});

test("a first-child rejection does not run final Achievement evaluation", async () => {
  let finalizerCalls = 0;
  const result = await executeHistoryOutcomeBatch({
    userId,
    intent: batchIntent,
    adminClient: {} as TrustedTaskStateCommandClient,
    dependencies: dependenciesFor({
      invoke: async () => ({ data: null, error: { code: "40001", message: "stale revision" } }),
      finalize: async () => {
        finalizerCalls += 1;
        return { data: { status: "completed" }, error: null };
      },
    }),
  });
  const body = result.body as Record<string, unknown>;
  assert.equal(body.state, "partial");
  assert.equal(body.failed_entry_index, 0);
  assert.equal(finalizerCalls, 0);
  assert.deepEqual(body.achievement, { status: "not_run", operation_id: body.achievement && typeof body.achievement === "object" ? (body.achievement as Record<string, unknown>).operation_id : null, error_code: null });
  assert.equal(body.achievement_warning, null);
});

test("a malformed committed child still finalizes Achievement before returning", async () => {
  let finalizerCalls = 0;
  let operationId = "";
  const result = await executeHistoryOutcomeBatch({
    userId,
    intent: { ...batchIntent, entries: [batchIntent.entries[0]!] },
    adminClient: {} as TrustedTaskStateCommandClient,
    dependencies: dependenciesFor({
      invoke: async ({ intent }) => ({
        data: {
          state: "committed",
          task_id: taskId,
          command_id: intent.replay_identity,
          expected_revision: intent.expected_revision,
          canonical_task_patch: {},
          compatibility_projection: {},
        },
        error: null,
      }),
      finalize: async ({ operationId: id }) => {
        finalizerCalls += 1;
        operationId = id;
        return { data: { status: "completed" }, error: null };
      },
    }),
  });
  const body = result.body as Record<string, unknown>;
  assert.equal(body.state, "partial");
  assert.equal(body.failed_entry_index, 0);
  assert.equal(finalizerCalls, 1);
  assert.deepEqual(body.completed_entries, []);
  assert.equal((body.error as Record<string, unknown>).kind, "malformed_response");
  assert.deepEqual(body.achievement, { status: "completed", operation_id: operationId, error_code: null });
  assert.equal(body.achievement_warning, null);
});

test("retry replays the committed prefix, preserves rewards, and reuses the finalizer identity", async () => {
  const operations = new Map<string, unknown>();
  const canonicalCalls: string[] = [];
  const createdRewardIds = new Set<string>();
  const operationIds: string[] = [];
  let rejectThirdChild = true;
  const dependencies = dependenciesFor({
    invoke: async ({ intent }) => {
      canonicalCalls.push(intent.replay_identity);
      if (intent.logical_date === "2026-08-19" && rejectThirdChild) {
        return { data: null, error: { code: "40001", message: "stale revision" } };
      }
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
        side_effect_ids: { reward_entitlement_id: `reward-${intent.logical_date}` },
      };
      createdRewardIds.add(`reward-${intent.logical_date}`);
      if (intent.logical_date !== "2026-08-19") {
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
    finalize: async ({ operationId }) => {
      operationIds.push(operationId);
      return operationIds.length === 1
        ? { data: { status: "failed", error_code: "ACHIEVEMENT_RETRY_REQUIRED" }, error: null }
        : { data: { status: "completed" }, error: null };
    },
  });
  dependencies.loadReplayOperation = async (_client: unknown, request: { idempotenceIdentity: string }) => ({
    data: operations.get(request.idempotenceIdentity) ?? null,
    error: null,
  }) as never;

  const first = await executeHistoryOutcomeBatch({ userId, intent: batchIntent, adminClient: {} as TrustedTaskStateCommandClient, dependencies });
  const firstBody = first.body as Record<string, unknown>;
  assert.equal(firstBody.state, "partial");
  assert.deepEqual(firstBody.completed_entries, ["2026-08-17", "2026-08-18"]);
  assert.equal(operationIds.length, 1);
  assert.equal(createdRewardIds.size, 2);
  dependencies.setRevision(12);
  rejectThirdChild = false;
  const second = await executeHistoryOutcomeBatch({ userId, intent: batchIntent, adminClient: {} as TrustedTaskStateCommandClient, dependencies });
  const secondBody = second.body as Record<string, unknown>;
  assert.equal(secondBody.state, "committed");
  assert.equal(secondBody.final_committed_revision, 13);
  assert.deepEqual(canonicalCalls, [
    "calendar-batch-attempt-1:history:2026-08-17:done",
    "calendar-batch-attempt-1:history:2026-08-18:done",
    "calendar-batch-attempt-1:history:2026-08-19:done",
    "calendar-batch-attempt-1:history:2026-08-19:done",
  ]);
  assert.equal(createdRewardIds.size, 3);
  assert.equal(operationIds.length, 2);
  assert.equal(operationIds[0], operationIds[1]);
  const childResults = secondBody.child_results as Array<Record<string, unknown>>;
  assert.equal((childResults[0]?.result as Record<string, unknown>)?.was_replayed, true);
  assert.equal((childResults[1]?.result as Record<string, unknown>)?.was_replayed, true);
  assert.equal((childResults[2]?.result as Record<string, unknown>)?.was_replayed, false);
});

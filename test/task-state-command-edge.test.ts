import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTrustedTaskStateCommand, buildTrustedTaskStateCommandReplayDescriptor, type TaskStateCommandIntent, validateTaskStateCommandIntent } from "../supabase/functions/task-state-command/domain.ts";
import {
  executeTrustedTaskStateCommand,
  type TrustedTaskStateCommandClient,
} from "../supabase/functions/task-state-command/orchestration.ts";
import type { TaskStateEngineInput } from "../src/lib/task-state-engine/types.ts";
import type { CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";
import type { CanonicalTaskCommandOperation } from "../src/lib/task-state-canonical/types.ts";
import { planTaskStateCommand } from "../src/lib/task-state-canonical/command-service.ts";
import { buildCanonicalTaskStateEngineInput } from "../src/lib/task-state-canonical/engine-input.ts";

const edgeSource = readFileSync(new URL("../supabase/functions/task-state-command/index.ts", import.meta.url), "utf8");
const domainSource = readFileSync(new URL("../supabase/functions/task-state-command/domain.ts", import.meta.url), "utf8");
const orchestrationSource = readFileSync(new URL("../supabase/functions/task-state-command/orchestration.ts", import.meta.url), "utf8");

test("Edge boundary verifies the user, reads canonical state without legacy authority, and calls the backend RPC", () => {
  assert.match(edgeSource, /npm:@supabase\/server@1\.4\.1/);
  assert.doesNotMatch(edgeSource, /npm:@supabase\/server["']/);
  assert.match(edgeSource, /from "\.\/auth\.ts"/);
  assert.match(edgeSource, /withSupabase\(\{ auth: "user" \}/);
  assert.match(edgeSource, /const userId = userIdFromContext\(context\)/);
  assert.doesNotMatch(edgeSource, /context\.userClaims\?\.sub/);
  assert.match(edgeSource, /if \(!userId\) return json\(\{ error: \{ code: "authentication_failure"/);
  assert.match(edgeSource, /context\.supabaseAdmin/);
  assert.doesNotMatch(orchestrationSource, /includeLegacyHistoryEvidence|adhdice_task_history\b/);
  assert.match(orchestrationSource, /adhdice_execute_task_state_command/);
  assert.match(orchestrationSource, /buildTrustedTaskStateCommandReplayDescriptor/);
  assert.match(orchestrationSource, /initialReplay[\s\S]*loadCanonicalState/);
  assert.match(orchestrationSource, /normalizedResult\.state === "rejected"[\s\S]*lookupReplay/);
  assert.doesNotMatch(edgeSource, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY\s*=/);
  assert.doesNotMatch(edgeSource, /console\.(log|error|warn)/);
});

test("Edge intent validation owns the privileged-field rejection list", () => {
  assert.match(domainSource, /FORBIDDEN_KEYS/);
  assert.match(domainSource, /task_patch/);
  assert.match(domainSource, /accepted_payload_digest/);
  assert.match(domainSource, /migration_operation_id/);
  assert.match(domainSource, /source_kind/);
});

test("trusted Delay materializes the current canonical occurrence for the RPC without legacy writes", () => {
  const boundary = {
    id: "boundary-1",
    entity_id: "task-1",
    schedule_model: "one_time",
    one_time_due_on: "2026-08-11",
    boundary_sequence: 1,
    anchor_confidence: "proven",
  } as unknown as CanonicalTaskStateReadModel["scheduleBoundaries"][number];
  const intent: TaskStateCommandIntent = {
    type: "delay_occurrence",
    task_id: "task-1",
    replay_identity: "delay:task-1:2026-08-11:2026-08-12",
    effective_due_on: "2026-08-12",
    logical_date: "2026-08-11",
  };
  const command = buildTrustedTaskStateCommand({
    intent,
    userId: "owner-1",
    readModel: { ...canonicalReadModel, scheduleBoundaries: [boundary] },
    logicalDay: { logicalDate: "2026-08-11", timezone: "America/New_York", dayStartTime: "06:00", settingsRevision: 3 },
    now: "2026-08-11T12:00:00.000Z",
  });
  assert.equal(command.type, "delay");
  assert.equal(command.occurrence?.source_boundary_id, "boundary-1");
  assert.equal(command.occurrence?.scheduled_due_on, "2026-08-11");
  assert.equal(command.override?.occurrence_id, command.occurrence?.id);
});

test("historical outcome commands do not infer phantom occurrences from a scheduled date", () => {
  const intent: TaskStateCommandIntent = {
    type: "set_outcome",
    task_id: "task-1",
    replay_identity: "calendar:task-1:2026-08-08:did_my_best",
    outcome: "did_my_best",
    logical_date: "2026-08-08",
    scheduled_due_on: "2026-08-08",
  };
  const command = buildTrustedTaskStateCommand({
    intent,
    userId: "owner-1",
    readModel: canonicalReadModel,
    logicalDay: { logicalDate: "2026-08-10", timezone: "America/New_York", dayStartTime: "06:00", settingsRevision: 3 },
    now: "2026-08-10T12:00:00.000Z",
  });
  assert.equal(command.type, "handled_outcome");
  assert.equal(command.occurrenceId, null);
  assert.equal(command.occurrenceKey, null);
  assert.equal(command.scheduledDueOn, "2026-08-08");
});

test("rollover intent remains input-only while the trusted Edge command derives automation provenance and stale workflow evidence", () => {
  const intent: TaskStateCommandIntent = {
    type: "reconcile_rollover",
    task_id: "task-1",
    replay_identity: "rollover:task-1:2026-08-10:stale",
    expected_revision: 4,
  };
  assert.equal((buildTrustedTaskStateCommand({
    intent,
    userId: "owner-1",
    readModel: {
      ...canonicalReadModel,
      task: {
        ...canonicalReadModel.task,
        status: "in_progress",
        workflow_state: "in_progress",
        workflow_logical_date: "2026-08-09",
        workflow_occurrence_id: null,
        workflow_command_id: "00000000-0000-4000-8000-000000000040",
      },
    },
    logicalDay: { logicalDate: "2026-08-10", timezone: "America/New_York", dayStartTime: "06:00", settingsRevision: 3 },
    now: "2026-08-10T12:00:00.000Z",
  })).sourceKind, "authorized_automation");
  assert.equal(validateTaskStateCommandIntent({ ...intent, outcome: "done" }), null);
  const command = buildTrustedTaskStateCommand({
    intent,
    userId: "owner-1",
    readModel: {
      ...canonicalReadModel,
      task: {
        ...canonicalReadModel.task,
        status: "in_progress",
        workflow_state: "in_progress",
        workflow_logical_date: "2026-08-09",
        workflow_occurrence_id: null,
        workflow_command_id: "00000000-0000-4000-8000-000000000040",
      },
    },
    logicalDay: { logicalDate: "2026-08-10", timezone: "America/New_York", dayStartTime: "06:00", settingsRevision: 3 },
    now: "2026-08-10T12:00:00.000Z",
  });
  assert.equal(command.staleLogicalDate, "2026-08-09");
  assert.equal(command.occurrenceId, null);
  assert.equal("outcome" in command, false);
});

test("trusted rollover fails closed when a canonical workflow occurrence reference is broken", async () => {
  let rpcCalls = 0;
  let replayCalls = 0;
  const brokenReadModel = {
    ...canonicalReadModel,
    task: {
      ...canonicalReadModel.task,
      status: "in_progress",
      due_on: "2026-08-09",
      workflow_state: "in_progress",
      workflow_logical_date: "2026-08-09",
      workflow_occurrence_id: "missing-occurrence",
      workflow_command_id: "00000000-0000-4000-8000-000000000040",
      workflow_revision: 2,
    },
    scheduleBoundaries: [{
      id: "boundary-1",
      entity_id: "task-1",
      schedule_model: "rolling",
      repeat_frequency: "daily",
      repeat_interval: 1,
      repeat_days_of_week: [],
      repeat_day_of_month: null,
      repeat_monthly_mode: "day_of_month",
      repeat_monthly_ordinal: null,
      repeat_monthly_weekday: null,
      anchor_date: "2026-08-09",
      due_time: null,
      boundary_sequence: 1,
    }],
    occurrences: [],
  } as unknown as CanonicalTaskStateReadModel;
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "reconcile_rollover",
      task_id: "task-1",
      replay_identity: "rollover:broken-workflow-occurrence",
      expected_revision: 4,
    },
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: null, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    dependencies: {
      loadReplayOperation: async () => {
        replayCalls += 1;
        return { data: null, error: null };
      },
      loadCanonicalState: async () => ({ data: brokenReadModel, error: null }),
      buildEngineInput: buildCanonicalTaskStateEngineInput,
    },
  });

  assert.equal(result.status, 422);
  assert.deepEqual(result.body, {
    error: {
      code: "WORKFLOW_OCCURRENCE_REFERENCE_INVALID",
      message: "Canonical workflow occurrence missing-occurrence is unavailable.",
    },
  });
  assert.equal(replayCalls, 2);
  assert.equal(rpcCalls, 0);
});

const canonicalReadModel = {
  task: {
    id: "task-1",
    user_id: "owner-1",
    entity_kind: "parent",
    revision: 4,
    canonical_revision: 4,
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
  logicalDayProfile: {
    timezone: "America/New_York",
    day_start_time: "06:00",
    settings_revision: 3,
  },
} as unknown as CanonicalTaskStateReadModel;

function archiveIntent(replayIdentity: string, taskId = "task-1", expectedRevision = 4): TaskStateCommandIntent {
  return {
    type: "archive_task",
    task_id: taskId,
    replay_identity: replayIdentity,
    expected_revision: expectedRevision,
  };
}

function operationFor(
  intent: TaskStateCommandIntent,
  entityId = intent.task_id,
  overrides: Partial<CanonicalTaskCommandOperation> = {},
): CanonicalTaskCommandOperation {
  const descriptor = buildTrustedTaskStateCommandReplayDescriptor({ userId: "owner-1", intent });
  return {
    id: `operation-${entityId}`,
    user_id: "owner-1",
    entity_id: entityId,
    entity_kind: "parent",
    command_id: descriptor.commandId,
    command_type: "archive_task",
    idempotence_identity: descriptor.idempotenceIdentity,
    accepted_payload_digest: descriptor.acceptedPayloadDigest,
    logical_day_context_identity: null,
    requested_logical_date: null,
    requested_occurrence_key: null,
    expected_entity_revision: intent.expected_revision ?? null,
    expected_history_revision: null,
    expected_boundary_sequence: null,
    expected_occurrence_revision: null,
    expected_facts_fingerprint: null,
    state: "committed",
    result_digest: "result-digest",
    result_references: { command_id: descriptor.commandId, state: "committed", marker: "stored-result" },
    conflict_code: null,
    source_kind: "runtime",
    schema_contract_version: "task-state-schema-v1",
    created_at: "2026-08-10T12:00:00.000Z",
    completed_at: "2026-08-10T12:00:01.000Z",
    ...overrides,
  };
}

function harness(replayResults: Array<CanonicalTaskCommandOperation | null>) {
  let replayCalls = 0;
  let canonicalReads = 0;
  let planCalls = 0;
  let rpcCalls = 0;
  const adminClient = {
    rpc: async () => {
      rpcCalls += 1;
      return { data: { state: "committed", was_replayed: false }, error: null };
    },
  } as unknown as TrustedTaskStateCommandClient;
  const dependencies = {
    loadReplayOperation: async () => ({ data: replayResults[replayCalls++] ?? null, error: null }),
    loadCanonicalState: async () => {
      canonicalReads += 1;
      return { data: canonicalReadModel, error: null };
    },
    buildEngineInput: (() => undefined as unknown as TaskStateEngineInput),
    planCommand: ((...args: Parameters<typeof planTaskStateCommand>) => {
      planCalls += 1;
      return planTaskStateCommand(...args);
    }),
  };
  return { adminClient, dependencies, counts: () => ({ replayCalls, canonicalReads, planCalls, rpcCalls }) };
}

test("committed retry replays before a changed canonical revision can reject planning", async () => {
  const intent = archiveIntent("committed-retry", "task-1", 3);
  const harnessState = harness([operationFor(intent)]);
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent,
    adminClient: harnessState.adminClient,
    dependencies: harnessState.dependencies,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    command_id: buildTrustedTaskStateCommandReplayDescriptor({ userId: "owner-1", intent }).commandId,
    state: "committed",
    marker: "stored-result",
    was_replayed: true,
  });
  assert.deepEqual(harnessState.counts(), { replayCalls: 1, canonicalReads: 0, planCalls: 0, rpcCalls: 0 });
});

test("planning race fallback replays a commit found by the final lookup", async () => {
  const intent = archiveIntent("race-fallback", "task-1", 3);
  const harnessState = harness([null, operationFor(intent)]);
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent,
    adminClient: harnessState.adminClient,
    dependencies: harnessState.dependencies,
  });

  assert.equal(result.status, 200);
  assert.equal((result.body as { was_replayed?: boolean }).was_replayed, true);
  assert.deepEqual(harnessState.counts(), { replayCalls: 2, canonicalReads: 1, planCalls: 1, rpcCalls: 0 });
});

test("genuine stale first execution returns STALE_REVISION without invoking the privileged RPC", async () => {
  const intent = archiveIntent("genuine-stale", "task-1", 3);
  const harnessState = harness([null, null]);
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent,
    adminClient: harnessState.adminClient,
    dependencies: harnessState.dependencies,
  });

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: { code: "STALE_REVISION", message: "Canonical Task State command was rejected." } });
  assert.deepEqual(harnessState.counts(), { replayCalls: 2, canonicalReads: 1, planCalls: 1, rpcCalls: 0 });
});

test("changed intent with the same replay identity returns an identity-reuse conflict", async () => {
  const originalIntent = archiveIntent("changed-intent");
  const changedIntent = { ...originalIntent, type: "trash_task" } as const;
  const harnessState = harness([operationFor(originalIntent)]);
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: changedIntent,
    adminClient: harnessState.adminClient,
    dependencies: harnessState.dependencies,
  });

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: { code: "REPLAY_IDENTITY_REUSE_CONFLICT", message: "The replay identity was reused with a different accepted command." } });
  assert.deepEqual(harnessState.counts(), { replayCalls: 1, canonicalReads: 0, planCalls: 0, rpcCalls: 0 });
});

test("an accepted operation returns an explicit processing conflict", async () => {
  const intent = archiveIntent("accepted-operation");
  const harnessState = harness([operationFor(intent, intent.task_id, { state: "accepted" })]);
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent,
    adminClient: harnessState.adminClient,
    dependencies: harnessState.dependencies,
  });

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: { code: "REPLAY_IN_PROGRESS", message: "The command replay identity is already being processed." } });
  assert.deepEqual(harnessState.counts(), { replayCalls: 1, canonicalReads: 0, planCalls: 0, rpcCalls: 0 });
});

test("a replay string collision on another Task cannot return that Task's result", async () => {
  const requestIntent = archiveIntent("cross-task-collision", "task-1");
  const otherTaskIntent = archiveIntent("cross-task-collision", "task-2");
  const harnessState = harness([operationFor(otherTaskIntent, "task-2")]);
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: requestIntent,
    adminClient: harnessState.adminClient,
    dependencies: harnessState.dependencies,
  });

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: { code: "REPLAY_ENTITY_MISMATCH", message: "The replay identity belongs to a different Task entity." } });
  assert.deepEqual(harnessState.counts(), { replayCalls: 1, canonicalReads: 0, planCalls: 0, rpcCalls: 0 });
});

test("a normal fresh command reaches the existing RPC exactly once", async () => {
  const intent = archiveIntent("fresh-command");
  const harnessState = harness([null]);
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent,
    adminClient: harnessState.adminClient,
    dependencies: harnessState.dependencies,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { state: "committed", was_replayed: false });
  assert.deepEqual(harnessState.counts(), { replayCalls: 1, canonicalReads: 1, planCalls: 1, rpcCalls: 1 });
});

test("a true rollover semantic no-op returns success without invoking the canonical RPC", async () => {
  let rpcCalls = 0;
  const intent: TaskStateCommandIntent = {
    type: "reconcile_rollover",
    task_id: "task-1",
    replay_identity: "rollover:no-op:2026-08-10",
    expected_revision: 4,
  };
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent,
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: null, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      buildEngineInput: (() => ({} as TaskStateEngineInput)),
      planCommand: ({ task }) => ({
        command: { commandId: "no-op-command", commandType: "reconcile_rollover" },
        normalizedResult: {
          commandId: "no-op-command",
          commandType: "reconcile_rollover",
          state: "accepted",
          conflictCode: null,
          expectedRevision: task.canonical_revision,
          nextRevision: task.canonical_revision + 1,
          canonicalTaskPatch: {},
          compatibilityProjection: {
            status: task.status,
            dueOn: task.due_on,
            completedAt: task.completed_at,
            activeStatusLogicalDate: task.active_status_logical_date,
            activeOccurrenceDueOn: task.active_occurrence_due_on,
          },
          historyFact: null,
          occurrence: null,
          scheduleBoundary: null,
          occurrenceEffectiveOverride: null,
          calendarOverride: null,
          rewardEntitlement: null,
          warnings: [],
        },
      }) as ReturnType<typeof planTaskStateCommand>,
    },
  });

  assert.equal(result.status, 200);
  assert.equal((result.body as { no_action?: boolean }).no_action, true);
  assert.equal((result.body as { next_revision?: number }).next_revision, 4);
  assert.equal(rpcCalls, 0);
});

test("a non-rollover semantic no-op still uses the canonical RPC", async () => {
  let rpcCalls = 0;
  const intent: TaskStateCommandIntent = {
    type: "archive_task",
    task_id: "task-1",
    replay_identity: "archive:no-op-scope",
    expected_revision: 4,
  };
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent,
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: { state: "committed", was_replayed: false }, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      buildEngineInput: (() => ({} as TaskStateEngineInput)),
      serializePlan: (() => ({})),
      planCommand: ({ task }) => ({
        command: { commandId: "archive-no-op-command", commandType: "archive_task" },
        normalizedResult: {
          commandId: "archive-no-op-command",
          commandType: "archive_task",
          state: "accepted",
          conflictCode: null,
          expectedRevision: task.canonical_revision,
          nextRevision: task.canonical_revision + 1,
          canonicalTaskPatch: {},
          compatibilityProjection: {
            status: task.status,
            dueOn: task.due_on,
            completedAt: task.completed_at,
            activeStatusLogicalDate: task.active_status_logical_date,
            activeOccurrenceDueOn: task.active_occurrence_due_on,
          },
          historyFact: null,
          occurrence: null,
          scheduleBoundary: null,
          occurrenceEffectiveOverride: null,
          calendarOverride: null,
          rewardEntitlement: null,
          warnings: [],
        },
      }) as ReturnType<typeof planTaskStateCommand>,
    },
  });

  assert.equal(result.status, 200);
  assert.equal((result.body as { no_action?: boolean }).no_action, undefined);
  assert.equal(rpcCalls, 1);
});

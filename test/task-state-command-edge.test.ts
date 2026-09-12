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
import { buildCompatibilityTaskStateEngineInput } from "../src/lib/task-state-engine/direct-input.ts";
import { evaluateTaskState } from "../src/lib/task-state-engine/engine.ts";
import type { TaskBehaviorPolicyRevision, TaskBehaviorProfiles } from "../src/lib/task-state-engine/behavior-policy.ts";

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
  assert.doesNotMatch(domainSource, /migration_operation_id|migration_version|classifier_version/);
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
    due_on: "2026-09-01",
    task_type: "task",
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    canonicalization_status: "canonical_runtime",
    terminal_state: "active",
    container_state: "active",
    workflow_state: "none",
  },
  scheduleBoundaries: [{
    id: "boundary-task-1",
    user_id: "owner-1",
    entity_id: "task-1",
    entity_kind: "parent",
    effective_from_logical_date: "2026-09-01",
    boundary_sequence: 1,
    boundary_type: "initial",
    schedule_model: "rolling",
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    one_time_due_on: null,
    due_time: null,
    anchor_date: "2026-09-01",
    anchor_kind: "user_selected",
    anchor_confidence: "proven",
    historical_scope_known: true,
    prospective_only: false,
  }],
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

function behaviorRevision(
  effectiveFromLogicalDate: string,
  values: Partial<TaskBehaviorPolicyRevision> = {},
): TaskBehaviorPolicyRevision {
  return {
    id: `task-behavior-${effectiveFromLogicalDate}`,
    effectiveFromLogicalDate,
    unresolvedOccurrence: "missed",
    positiveStreakOnUnhandled: "break",
    missedStreakOnUnhandled: "increment",
    rewards: "enabled",
    availableActions: ["done", "did_my_best", "missed", "delay", "complete"],
    ...values,
  };
}

function behaviorProfile(revision: TaskBehaviorPolicyRevision): TaskBehaviorProfiles {
  return {
    task: {
      id: "task-behavior-profile",
      unresolvedOccurrence: revision.unresolvedOccurrence,
      positiveStreakOnUnhandled: revision.positiveStreakOnUnhandled,
      missedStreakOnUnhandled: revision.missedStreakOnUnhandled,
      rewards: revision.rewards,
      availableActions: revision.availableActions,
    },
  };
}

function emptyCustomRulesetsResult() {
  return {
    data: [],
    revisions: {},
    behaviorSelectionsByTaskId: {},
    error: null,
    behaviorSelectionError: null,
  };
}

test("trusted orchestration forwards the complete Task behavior revision timeline", async () => {
  const revisions = [
    behaviorRevision("2026-09-01"),
    behaviorRevision("2026-09-10", {
      unresolvedOccurrence: "blank",
      positiveStreakOnUnhandled: "preserve",
      missedStreakOnUnhandled: "ignore",
      rewards: "disabled",
    }),
  ];
  const customRevision = behaviorRevision("2026-09-01", { unresolvedOccurrence: "blank" });
  const behaviorRevisions = { task: revisions, custom: [customRevision] };
  const behaviorProfiles = {
    ...behaviorProfile(revisions[1]!),
    custom: {
      id: "custom-behavior-profile",
      unresolvedOccurrence: customRevision.unresolvedOccurrence,
      positiveStreakOnUnhandled: customRevision.positiveStreakOnUnhandled,
      missedStreakOnUnhandled: customRevision.missedStreakOnUnhandled,
      rewards: customRevision.rewards,
    },
  };
  let capturedContext: Parameters<typeof buildCanonicalTaskStateEngineInput>[1] | undefined;

  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: archiveIntent("behavior-revisions-forwarded"),
    adminClient: { rpc: async () => ({ data: { state: "committed" }, error: null }) } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      loadBehaviorProfiles: async () => ({ data: behaviorProfiles, revisions: behaviorRevisions, error: null }),
      buildEngineInput: (readModel, context) => {
        capturedContext = context;
        return buildCanonicalTaskStateEngineInput(readModel, context);
      },
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(capturedContext?.behaviorPolicyRevisions, behaviorRevisions);
  assert.equal(capturedContext?.behaviorProfiles?.task?.rewards, "disabled");
  assert.equal(capturedContext?.behaviorProfiles?.custom?.unresolvedOccurrence, "blank");
});

test("trusted cross-TaskType selection planning matches browser/direct policy resolution", async () => {
  const namedRevision = behaviorRevision("2026-09-01", {
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "preserve",
    missedStreakOnUnhandled: "ignore",
    rewards: "disabled",
  });
  const assignments = [
    { effectiveFromLogicalDate: "2026-09-01", taskType: "task" as const, customRulesetId: null },
    { effectiveFromLogicalDate: "2026-09-10", taskType: "custom" as const, customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", taskType: "task" as const, customRulesetId: null },
  ];
  const assignedReadModel = {
    ...canonicalReadModel,
    task: {
      ...canonicalReadModel.task,
      task_type: "task",
      // Current projection is Task; the historical selection was Practice.
      custom_ruleset_id: null,
    },
    behaviorSelections: assignments.map((assignment, index) => ({
      id: `assignment-${index + 1}`,
      user_id: "owner-1",
      task_id: "task-1",
      effective_from_logical_date: assignment.effectiveFromLogicalDate,
      task_type: assignment.taskType,
      custom_ruleset_id: assignment.customRulesetId,
      created_at: `${assignment.effectiveFromLogicalDate}T00:00:00.000Z`,
      updated_at: `${assignment.effectiveFromLogicalDate}T00:00:00.000Z`,
    })),
  } as unknown as CanonicalTaskStateReadModel;
  let capturedEngineInput: TaskStateEngineInput | undefined;
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: archiveIntent("cross-tasktype-selection"),
    adminClient: { rpc: async () => ({ data: { state: "committed" }, error: null }) } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: assignedReadModel, error: null }),
      loadBehaviorProfiles: async () => ({
        data: {
          custom: {
            id: "legacy-custom",
            unresolvedOccurrence: "missed",
            positiveStreakOnUnhandled: "break",
            missedStreakOnUnhandled: "increment",
            rewards: "enabled",
          },
        },
        revisions: { custom: [behaviorRevision("2026-09-01")] },
        error: null,
      }),
      loadCustomRulesets: async () => ({
        data: [],
        revisions: { "ruleset-practice": [namedRevision] },
        error: null,
      }),
      buildEngineInput: (readModel, context) => {
        capturedEngineInput = buildCanonicalTaskStateEngineInput(readModel, context);
        return capturedEngineInput;
      },
    },
  });

  assert.equal(result.status, 200);
  const browserInput = buildCompatibilityTaskStateEngineInput(assignedReadModel.task, [], {
    behaviorProfiles: {
      custom: {
        id: "legacy-custom",
        unresolvedOccurrence: "missed",
        positiveStreakOnUnhandled: "break",
        missedStreakOnUnhandled: "increment",
        rewards: "enabled",
      },
    },
    behaviorPolicyRevisions: { custom: [behaviorRevision("2026-09-01")] },
    behaviorSelectionsByTaskId: {
      "task-1": assignments,
    },
    namedCustomRulesetBehaviorPolicyRevisions: { "ruleset-practice": [namedRevision] },
    now: "2026-09-15T16:00:00.000Z",
    timezone: "America/New_York",
    logicalDayRollover: "06:00",
  });
  assert.equal(capturedEngineInput?.behaviorPolicy?.unresolvedOccurrence, "blank");
  assert.equal(capturedEngineInput?.behaviorPolicy?.rewards, "disabled");
  assert.deepEqual(capturedEngineInput?.behaviorPolicy, browserInput.behaviorPolicy);
  assert.deepEqual(capturedEngineInput?.behaviorPolicyRevisions, browserInput.behaviorPolicyRevisions);

  const laterServerInput = buildCanonicalTaskStateEngineInput(assignedReadModel, {
    behaviorPolicyRevisions: { custom: [behaviorRevision("2026-09-01")] },
    namedCustomRulesetBehaviorPolicyRevisions: { "ruleset-practice": [namedRevision] },
    now: "2026-09-25T16:00:00.000Z",
    timezone: "America/New_York",
    logicalDayRollover: "06:00",
  });
  const laterBrowserInput = buildCompatibilityTaskStateEngineInput(assignedReadModel.task, [], {
    behaviorPolicyRevisions: { custom: [behaviorRevision("2026-09-01")] },
    behaviorSelectionsByTaskId: { "task-1": assignments },
    namedCustomRulesetBehaviorPolicyRevisions: { "ruleset-practice": [namedRevision] },
    now: "2026-09-25T16:00:00.000Z",
    timezone: "America/New_York",
    logicalDayRollover: "06:00",
  });
  assert.equal(laterServerInput.behaviorPolicy?.unresolvedOccurrence, "missed");
  assert.deepEqual(laterServerInput.behaviorPolicy, laterBrowserInput.behaviorPolicy);
});

test("trusted orchestration uses the Standard fallback for empty or unavailable profile storage", async () => {
  for (const [label, behaviorResult] of [
    ["no rows", { data: {}, revisions: {}, error: null }],
    ["unavailable table", { data: {}, revisions: {}, error: { code: "42P01", message: "relation does not exist" } }],
  ] as const) {
    let capturedEngineInput: TaskStateEngineInput | undefined;
    const result = await executeTrustedTaskStateCommand({
      userId: "owner-1",
      intent: archiveIntent(`behavior-fallback:${label}`),
      adminClient: { rpc: async () => ({ data: { state: "committed" }, error: null }) } as unknown as TrustedTaskStateCommandClient,
      dependencies: {
        loadReplayOperation: async () => ({ data: null, error: null }),
        loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
        loadBehaviorProfiles: async () => behaviorResult,
        buildEngineInput: (readModel, context) => {
          capturedEngineInput = buildCanonicalTaskStateEngineInput(readModel, context);
          return capturedEngineInput;
        },
      },
    });

    assert.equal(result.status, 200, label);
    assert.equal(capturedEngineInput?.behaviorPolicy?.id, "standard-task", label);
    assert.equal(capturedEngineInput?.behaviorPolicyRevisions, undefined, label);
  }
});

test("trusted manual Complete fails closed when TaskType policy authority fails", async () => {
  let rpcCalls = 0;
  let engineInputCalls = 0;
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "complete_task",
      task_id: "task-1",
      replay_identity: "complete:policy-authority-failure",
      expected_revision: 4,
      logical_date: "2026-09-15",
    },
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: { state: "committed" }, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      loadBehaviorProfiles: async () => { throw new Error("permission denied"); },
      loadCustomRulesets: async () => emptyCustomRulesetsResult(),
      buildEngineInput: () => {
        engineInputCalls += 1;
        return buildCanonicalTaskStateEngineInput(canonicalReadModel, {});
      },
    },
  });

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: {
      code: "behavior_policy_unavailable",
      message: "Task behavior policy authority is unavailable.",
    },
  });
  assert.equal(engineInputCalls, 0);
  assert.equal(rpcCalls, 0);
});

test("trusted manual action fails closed for a malformed behavior loader result", async () => {
  let rpcCalls = 0;
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "set_outcome",
      task_id: "task-1",
      replay_identity: "outcome:malformed-policy-result",
      expected_revision: 4,
      outcome: "done",
    },
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: { state: "committed" }, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      loadBehaviorProfiles: async () => ({ data: {}, revisions: "malformed", error: null }),
      loadCustomRulesets: async () => emptyCustomRulesetsResult(),
    },
  });

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: {
      code: "behavior_policy_unavailable",
      message: "Task behavior policy authority is unavailable.",
    },
  });
  assert.equal(rpcCalls, 0);
});

test("trusted manual Complete uses a resolved policy and reaches persistence when allowed", async () => {
  let rpcCalls = 0;
  const allowedRevision = behaviorRevision("2026-09-01");
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "complete_task",
      task_id: "task-1",
      replay_identity: "complete:policy-allows",
      expected_revision: 4,
      logical_date: "2026-09-15",
    },
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: { state: "committed" }, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      loadBehaviorProfiles: async () => ({ data: behaviorProfile(allowedRevision), revisions: { task: [allowedRevision] }, error: null }),
      loadCustomRulesets: async () => emptyCustomRulesetsResult(),
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { state: "committed" });
  assert.equal(rpcCalls, 1);
});

test("missing Available Actions column keeps pre-deployment manual compatibility", async () => {
  let rpcCalls = 0;
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "complete_task",
      task_id: "task-1",
      replay_identity: "complete:missing-available-actions-column",
      expected_revision: 4,
      logical_date: "2026-09-15",
    },
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: { state: "committed" }, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      loadBehaviorProfiles: async () => ({
        data: {},
        revisions: {},
        error: { code: "42703", message: "column available_actions does not exist" },
      }),
      loadCustomRulesets: async () => emptyCustomRulesetsResult(),
    },
  });

  assert.equal(result.status, 200);
  assert.equal(rpcCalls, 1);
});

test("named Custom Task fails closed when named-ruleset authority fails", async () => {
  let rpcCalls = 0;
  const namedCustomReadModel = {
    ...canonicalReadModel,
    task: {
      ...canonicalReadModel.task,
      task_type: "custom",
      custom_ruleset_id: "ruleset-discipline",
    },
  } as unknown as CanonicalTaskStateReadModel;
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "complete_task",
      task_id: "task-1",
      replay_identity: "complete:named-ruleset-authority-failure",
      expected_revision: 4,
      logical_date: "2026-09-15",
    },
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: { state: "committed" }, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: namedCustomReadModel, error: null }),
      loadBehaviorProfiles: async () => ({ data: {}, revisions: {}, error: null }),
      loadCustomRulesets: async () => ({
        data: [],
        revisions: {},
        behaviorSelectionsByTaskId: {},
        error: { code: "42501", message: "permission denied for table adhdice_custom_behavior_ruleset_revisions" },
        behaviorSelectionError: null,
      }),
    },
  });

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: {
      code: "behavior_policy_unavailable",
      message: "Task behavior policy authority is unavailable.",
    },
  });
  assert.equal(rpcCalls, 0);
});

test("named Custom Task fails closed when behavior-selection authority fails", async () => {
  let rpcCalls = 0;
  const namedCustomReadModel = {
    ...canonicalReadModel,
    task: {
      ...canonicalReadModel.task,
      task_type: "custom",
      custom_ruleset_id: "ruleset-discipline",
    },
  } as unknown as CanonicalTaskStateReadModel;
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "complete_task",
      task_id: "task-1",
      replay_identity: "complete:selection-authority-failure",
      expected_revision: 4,
      logical_date: "2026-09-15",
    },
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: { state: "committed" }, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: namedCustomReadModel, error: null }),
      loadBehaviorProfiles: async () => ({ data: {}, revisions: {}, error: null }),
      loadCustomRulesets: async () => ({
        data: [],
        revisions: { "ruleset-discipline": [behaviorRevision("2026-09-01")] },
        behaviorSelectionsByTaskId: {},
        error: null,
        behaviorSelectionError: { code: "42501", message: "permission denied for table adhdice_task_behavior_selections" },
      }),
    },
  });

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: {
      code: "behavior_policy_unavailable",
      message: "Task behavior policy authority is unavailable.",
    },
  });
  assert.equal(rpcCalls, 0);
});

test("trusted manual Complete reports action-unavailable only for a resolved restrictive policy", async () => {
  let rpcCalls = 0;
  const restrictedRevision = behaviorRevision("2026-09-01", { availableActions: ["done", "missed"] });
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "complete_task",
      task_id: "task-1",
      replay_identity: "complete:resolved-policy-forbids",
      expected_revision: 4,
      logical_date: "2026-09-15",
    },
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: { state: "committed" }, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      loadBehaviorProfiles: async () => ({
        data: behaviorProfile(restrictedRevision),
        revisions: { task: [restrictedRevision] },
        error: null,
      }),
      loadCustomRulesets: async () => emptyCustomRulesetsResult(),
    },
  });

  assert.equal(result.status, 422);
  assert.deepEqual(result.body, {
    error: {
      code: "TASK_ACTION_NOT_AVAILABLE",
      message: "Complete is not available for this Task ruleset.",
    },
  });
  assert.equal(rpcCalls, 0);
});

test("trusted manual occurrence enforcement rejects a policy-hidden outcome before the RPC", async () => {
  let rpcCalls = 0;
  const restrictedRevision = behaviorRevision("2026-09-01", { availableActions: ["done"] });
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "set_outcome",
      task_id: "task-1",
      replay_identity: "outcome:unavailable-did-my-best",
      expected_revision: 4,
      outcome: "did_my_best",
      logical_date: "2026-09-15",
    },
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: { state: "committed" }, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      loadBehaviorProfiles: async () => ({
        data: behaviorProfile(restrictedRevision),
        revisions: { task: [restrictedRevision] },
        error: null,
      }),
      loadCustomRulesets: async () => ({
        data: [],
        revisions: {},
        behaviorSelectionsByTaskId: {},
        error: null,
        behaviorSelectionError: null,
      }),
      buildEngineInput: (readModel, context) => buildCanonicalTaskStateEngineInput(readModel, context),
    },
  });

  assert.equal(result.status, 422);
  assert.deepEqual(result.body, {
    error: {
      code: "TASK_ACTION_NOT_AVAILABLE",
      message: "Did My Best is not available for this Task ruleset.",
    },
  });
  assert.equal(rpcCalls, 0);
});

test("trusted reconciliation applies each historical Task behavior revision to its own logical date", async () => {
  const revisions = [
    behaviorRevision("2026-09-01"),
    behaviorRevision("2026-09-10", {
      unresolvedOccurrence: "blank",
      positiveStreakOnUnhandled: "preserve",
      missedStreakOnUnhandled: "ignore",
      rewards: "disabled",
    }),
    behaviorRevision("2026-09-20"),
  ];
  let capturedEngineInput: TaskStateEngineInput | undefined;
  let capturedPlan: ReturnType<typeof planTaskStateCommand> | undefined;

  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "reconcile_rollover",
      task_id: "task-1",
      replay_identity: "rollover:historical-behavior-revisions",
      expected_revision: 4,
    },
    adminClient: { rpc: async () => ({ data: { state: "committed" }, error: null }) } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-25T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      loadBehaviorProfiles: async () => ({ data: behaviorProfile(revisions[2]!), revisions: { task: revisions }, error: null }),
      buildEngineInput: (readModel, context) => {
        capturedEngineInput = buildCanonicalTaskStateEngineInput(readModel, context);
        return capturedEngineInput;
      },
      planCommand: (state, command) => {
        capturedPlan = planTaskStateCommand(state, command);
        return capturedPlan;
      },
    },
  });

  assert.equal(result.status, 200);
  assert.equal(capturedEngineInput?.behaviorPolicy?.unresolvedOccurrence, "missed");
  assert.deepEqual(capturedEngineInput?.behaviorPolicyRevisions, revisions);
  const automaticDates = capturedPlan?.normalizedResult.automaticHistoryFacts.map((fact) => fact.logical_date) ?? [];
  assert.ok(automaticDates.includes("2026-09-05"));
  assert.ok(automaticDates.includes("2026-09-20"));
  assert.ok(!automaticDates.some((date) => date >= "2026-09-10" && date <= "2026-09-19"));
  assert.ok(!automaticDates.includes("2026-09-25"));
});

test("automatic rollover remains permitted when behavior-policy loading fails unexpectedly", async () => {
  let rpcCalls = 0;
  let capturedPlan: ReturnType<typeof planTaskStateCommand> | undefined;
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "reconcile_rollover",
      task_id: "task-1",
      replay_identity: "rollover:behavior-policy-loader-failure",
      expected_revision: 4,
    },
    adminClient: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: { state: "committed" }, error: null };
      },
    } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      loadBehaviorProfiles: async () => { throw new Error("database query failed"); },
      loadCustomRulesets: async () => { throw new Error("network failure"); },
      planCommand: (state, command) => {
        capturedPlan = planTaskStateCommand(state, command);
        return capturedPlan;
      },
    },
  });

  assert.equal(result.status, 200);
  assert.equal(rpcCalls, 1);
  assert.ok(capturedPlan?.normalizedResult.automaticHistoryFacts.some((fact) => fact.outcome === "missed"));
});

test("canonical server and browser/direct normalization make the same historical policy decisions", () => {
  const revisions = [
    behaviorRevision("2026-09-01"),
    behaviorRevision("2026-09-10", {
      unresolvedOccurrence: "blank",
      positiveStreakOnUnhandled: "preserve",
      missedStreakOnUnhandled: "ignore",
      rewards: "disabled",
    }),
    behaviorRevision("2026-09-20"),
  ];
  const context = {
    behaviorProfiles: behaviorProfile(revisions[2]!),
    behaviorPolicyRevisions: { task: revisions },
    now: "2026-09-25T16:00:00.000Z",
    timezone: "America/New_York",
    logicalDayRollover: "06:00",
  };
  const serverInput = buildCanonicalTaskStateEngineInput(canonicalReadModel, context);
  const browserInput = buildCompatibilityTaskStateEngineInput(canonicalReadModel.task, [], context);
  const serverResult = evaluateTaskState({ ...serverInput, action: { type: "reconcile_rollover" } });
  const browserResult = evaluateTaskState({ ...browserInput, action: { type: "reconcile_rollover" } });

  assert.deepEqual(serverInput.behaviorPolicy, browserInput.behaviorPolicy);
  assert.deepEqual(serverInput.behaviorPolicyRevisions, browserInput.behaviorPolicyRevisions);
  assert.deepEqual(
    serverResult.proposedHistoryChanges.map((change) => change.type === "insert" ? change.row.logicalDate : change.rowId),
    browserResult.proposedHistoryChanges.map((change) => change.type === "insert" ? change.row.logicalDate : change.rowId),
  );
});

test("trusted current-logical-day reward policy prevents a new entitlement while earned rewards remain planning-safe", async () => {
  const revisions = [
    behaviorRevision("2026-09-01"),
    behaviorRevision("2026-09-10", {
      unresolvedOccurrence: "blank",
      positiveStreakOnUnhandled: "preserve",
      missedStreakOnUnhandled: "ignore",
      rewards: "disabled",
    }),
    behaviorRevision("2026-09-20"),
  ];
  let capturedPlan: ReturnType<typeof planTaskStateCommand> | undefined;
  const result = await executeTrustedTaskStateCommand({
    userId: "owner-1",
    intent: {
      type: "set_outcome",
      task_id: "task-1",
      replay_identity: "outcome:current-disabled-rewards",
      expected_revision: 4,
      outcome: "done",
    },
    adminClient: { rpc: async () => ({ data: { state: "committed" }, error: null }) } as unknown as TrustedTaskStateCommandClient,
    now: "2026-09-15T16:00:00.000Z",
    dependencies: {
      loadReplayOperation: async () => ({ data: null, error: null }),
      loadCanonicalState: async () => ({ data: canonicalReadModel, error: null }),
      loadBehaviorProfiles: async () => ({ data: behaviorProfile(revisions[2]!), revisions: { task: revisions }, error: null }),
      loadCustomRulesets: async () => ({
        data: [],
        revisions: {},
        behaviorSelectionsByTaskId: {},
        error: null,
        behaviorSelectionError: null,
      }),
      planCommand: (state, command) => {
        capturedPlan = planTaskStateCommand(state, command);
        return capturedPlan;
      },
    },
  });

  assert.equal(result.status, 200);
  assert.equal(capturedPlan?.command.logicalDay.logicalDate, "2026-09-15");
  assert.equal(capturedPlan?.normalizedResult.rewardEntitlement, null);
  assert.deepEqual(capturedPlan?.normalizedResult.automaticHistoryDeleteIds, []);
});

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

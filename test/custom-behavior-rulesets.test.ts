import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { loadCustomBehaviorRulesets } from "../src/lib/custom-behavior-rulesets.ts";
import { updateTaskRowWithLegacyEnergyFallback } from "../src/lib/task-db-mutations.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { buildCompatibilityTaskStateEngineInput } from "../src/lib/task-state-engine/direct-input.ts";
import { useTaskUpdateAction } from "../src/hooks/useTaskUpdateAction.ts";
import {
  evaluateTaskState,
  resolveTaskBehaviorPolicyForTask,
  STANDARD_TASK_BEHAVIOR_POLICY,
  type NamedCustomRulesetBehaviorPolicyRevisionMap,
  type TaskBehaviorPolicyRevision,
} from "../src/lib/task-state-engine/index.ts";

const context = {
  now: "2026-09-12T14:00:00.000Z",
  timezone: "UTC",
  logicalDayRollover: "00:00",
};

const migration = readFileSync(new URL("../supabase/add_custom_behavior_rulesets_7_13_27.sql", import.meta.url), "utf8");
const assignmentMigration = readFileSync(new URL("../supabase/add_task_custom_ruleset_assignments_7_13_28.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

const task = createTask({
  id: "task-1",
  title: "Ruleset task",
  status: "pending",
  due_on: "2026-09-01",
  repeat_frequency: "daily",
});

function revision(
  id: string,
  effectiveFromLogicalDate: string,
  values: Partial<Omit<TaskBehaviorPolicyRevision, "id" | "effectiveFromLogicalDate">> = {},
): TaskBehaviorPolicyRevision {
  return {
    id,
    effectiveFromLogicalDate,
    unresolvedOccurrence: "missed",
    positiveStreakOnUnhandled: "break",
    missedStreakOnUnhandled: "increment",
    rewards: "enabled",
    ...values,
  };
}

function namedRulesets(): NamedCustomRulesetBehaviorPolicyRevisionMap {
  return {
    "ruleset-practice": [revision("practice-baseline", "2026-09-01", {
      unresolvedOccurrence: "blank",
      positiveStreakOnUnhandled: "preserve",
      missedStreakOnUnhandled: "ignore",
      rewards: "disabled",
    })],
    "ruleset-routine": [revision("routine-baseline", "2026-09-01")],
  };
}

test("7.13.27 persistence source keeps identity, revisions, assignment, and ownership separate", () => {
  assert.match(migration, /create table if not exists public\.adhdice_custom_behavior_rulesets/);
  assert.match(migration, /primary key \(id\)/);
  assert.match(migration, /task_type text not null default 'custom'/);
  assert.match(migration, /check \(task_type = 'custom'\)/);
  assert.match(migration, /create table if not exists public\.adhdice_custom_behavior_ruleset_revisions/);
  assert.match(migration, /primary key \(ruleset_id, effective_from_logical_date\)/);
  assert.match(migration, /add column if not exists custom_ruleset_id uuid/);
  assert.match(migration, /custom_ruleset_id is null or task_type = 'custom'/);
  assert.match(migration, /foreign key \(user_id, custom_ruleset_id\)/);
  assert.match(migration, /enable row level security/);
  assert.doesNotMatch(migration, /\binsert into\b|\bupdate\b public\.adhdice_clean_tasks\b/i);
});

test("normal Task and unassigned Custom Task preserve the 7.13.26 profile paths", () => {
  const legacyCustom = [revision("legacy-custom", "2026-09-01", { unresolvedOccurrence: "blank" })];
  const behaviorPolicyRevisions = { task: [revision("task", "2026-09-01")], custom: legacyCustom };
  const normalInput = buildCompatibilityTaskStateEngineInput({ ...task, task_type: "task" }, [], {
    ...context,
    behaviorPolicyRevisions,
    behaviorProfiles: { custom: { id: "legacy-custom", unresolvedOccurrence: "blank", positiveStreakOnUnhandled: "break", missedStreakOnUnhandled: "increment", rewards: "enabled" } },
  });
  const customInput = buildCompatibilityTaskStateEngineInput({ ...task, task_type: "custom", custom_ruleset_id: null }, [], {
    ...context,
    behaviorPolicyRevisions,
    customRulesetAssignmentsByTaskId: {},
    behaviorProfiles: { custom: { id: "legacy-custom", unresolvedOccurrence: "blank", positiveStreakOnUnhandled: "break", missedStreakOnUnhandled: "increment", rewards: "enabled" } },
  });

  assert.equal(normalInput.behaviorPolicy.unresolvedOccurrence, "missed");
  assert.equal(customInput.behaviorPolicy.unresolvedOccurrence, "blank");
  assert.deepEqual(customInput.behaviorPolicyRevisions, legacyCustom);
});

test("two named Custom rulesets resolve independently and assignment wins over global Custom", () => {
  const named = namedRulesets();
  const legacyCustom = [revision("legacy-custom", "2026-09-01", { unresolvedOccurrence: "missed" })];
  const input = (rulesetId: string) => buildCompatibilityTaskStateEngineInput({
    ...task,
    task_type: "custom",
    custom_ruleset_id: rulesetId,
  }, [], {
    ...context,
    behaviorPolicyRevisions: { custom: legacyCustom },
    namedCustomRulesetBehaviorPolicyRevisions: named,
  });

  const practice = input("ruleset-practice");
  const routine = input("ruleset-routine");
  assert.equal(practice.behaviorPolicy.unresolvedOccurrence, "blank");
  assert.equal(practice.behaviorPolicy.rewards, "disabled");
  assert.equal(routine.behaviorPolicy.unresolvedOccurrence, "missed");
  assert.deepEqual(practice.behaviorPolicyRevisions, named["ruleset-practice"]);
  assert.deepEqual(routine.behaviorPolicyRevisions, named["ruleset-routine"]);
});

test("named ruleset earliest revision is the baseline and later revisions take effect by logical date", () => {
  const revisions = [
    revision("practice-baseline", "2026-09-10", { unresolvedOccurrence: "blank" }),
    revision("practice-later", "2026-09-20", { unresolvedOccurrence: "missed", rewards: "disabled" }),
  ];
  const resolve = (logicalDate: string) => resolveTaskBehaviorPolicyForTask({
    taskType: "custom",
    customRulesetId: "ruleset-practice",
    namedCustomRulesetBehaviorPolicyRevisions: { "ruleset-practice": revisions },
    logicalDate,
  }).policy;

  assert.equal(resolve("2026-09-01").unresolvedOccurrence, "blank");
  assert.equal(resolve("2026-09-15").unresolvedOccurrence, "blank");
  assert.equal(resolve("2026-09-25").unresolvedOccurrence, "missed");
  assert.equal(resolve("2026-09-25").rewards, "disabled");
});

test("the earliest Task ruleset assignment is the baseline and later assignments switch by logical date", () => {
  const assignments = [
    { effectiveFromLogicalDate: "2026-09-10", customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", customRulesetId: "ruleset-routine" },
  ];
  const resolve = (logicalDate: string) => resolveTaskBehaviorPolicyForTask({
    taskId: task.id,
    taskType: "custom",
    // The current projection is Routine; historical resolution must use the
    // effective-dated assignment rows instead.
    customRulesetId: "ruleset-routine",
    behaviorPolicyRevisions: { custom: [revision("legacy-custom", "2026-09-01")] },
    customRulesetAssignmentsByTaskId: { [task.id]: assignments },
    namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
    logicalDate,
  });

  assert.equal(resolve("2026-09-01").policy.unresolvedOccurrence, "blank");
  assert.equal(resolve("2026-09-20").policy.unresolvedOccurrence, "blank");
  assert.equal(resolve("2026-09-21").policy.unresolvedOccurrence, "missed");
  assert.equal(resolve("2026-09-25").policy.unresolvedOccurrence, "missed");
  assert.deepEqual(resolve("2026-09-15").revisions.map((item) => item.effectiveFromLogicalDate), ["2026-09-10", "2026-09-21"]);
});

test("returning a named ruleset to unassigned Custom preserves earlier history and uses generic Custom later", () => {
  const assignments = [
    { effectiveFromLogicalDate: "2026-09-10", customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", customRulesetId: null },
  ];
  const resolve = (logicalDate: string) => resolveTaskBehaviorPolicyForTask({
    taskId: task.id,
    taskType: "custom",
    customRulesetId: null,
    behaviorPolicyRevisions: { custom: [revision("legacy-custom", "2026-09-01", { unresolvedOccurrence: "missed" })] },
    customRulesetAssignmentsByTaskId: { [task.id]: assignments },
    namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
    logicalDate,
  }).policy;

  assert.equal(resolve("2026-09-20").unresolvedOccurrence, "blank");
  assert.equal(resolve("2026-09-21").unresolvedOccurrence, "missed");
  assert.equal(resolve("2026-09-25").unresolvedOccurrence, "missed");
});

test("Pursuit and Goal cannot activate a named Custom ruleset", () => {
  for (const taskType of ["pursuit", "goal"] as const) {
    const input = buildCompatibilityTaskStateEngineInput({
      ...task,
      task_type: taskType,
      custom_ruleset_id: "ruleset-practice",
    }, [], {
      ...context,
      behaviorProfiles: { custom: { id: "legacy", unresolvedOccurrence: "blank", positiveStreakOnUnhandled: "preserve", missedStreakOnUnhandled: "ignore", rewards: "disabled" } },
      behaviorPolicyRevisions: { custom: [revision("legacy", "2026-09-01", { unresolvedOccurrence: "blank" })] },
      customRulesetAssignmentsByTaskId: { [task.id]: [{ effectiveFromLogicalDate: "2026-09-01", customRulesetId: "ruleset-practice" }] },
      namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
    });
    assert.equal(input.behaviorPolicy, STANDARD_TASK_BEHAVIOR_POLICY, taskType);
    assert.equal(input.behaviorPolicyRevisions, undefined, taskType);
  }
});

test("explicit existing History remains factual across a Custom ruleset assignment change", () => {
  const history = [
    {
      id: "history-done-before-switch",
      task_id: task.id,
      entry_date: "2026-09-15",
      status: "done",
      event_type: "status",
      occurrence_key: "task:task-1:occurrence:2026-09-15",
      occurrence_due_on: "2026-09-15",
      counted_as_due_occurrence: true,
      was_completed: true,
      created_at: "2026-09-15T12:00:00.000Z",
      updated_at: "2026-09-15T12:00:00.000Z",
    },
    {
      id: "history-done-after-switch",
      task_id: task.id,
      entry_date: "2026-09-22",
      status: "done",
      event_type: "status",
      occurrence_key: "task:task-1:occurrence:2026-09-22",
      occurrence_due_on: "2026-09-22",
      counted_as_due_occurrence: true,
      was_completed: true,
      created_at: "2026-09-22T12:00:00.000Z",
      updated_at: "2026-09-22T12:00:00.000Z",
    },
  ] as never;
  const engineInput = buildCompatibilityTaskStateEngineInput({ ...task, task_type: "custom", custom_ruleset_id: "ruleset-routine" }, history, {
    ...context,
    customRulesetAssignmentsByTaskId: {
      [task.id]: [
        { effectiveFromLogicalDate: "2026-09-10", customRulesetId: "ruleset-practice" },
        { effectiveFromLogicalDate: "2026-09-21", customRulesetId: "ruleset-routine" },
      ],
    },
    namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
  });
  const result = evaluateTaskState({ ...engineInput, action: { type: "reconcile_rollover" } });
  assert.equal(result.behaviorPolicy.unresolvedOccurrence, "blank");
  assert.deepEqual(result.proposedHistoryChanges, []);
});

test("7.13.28 persistence source keeps assignment authority and deletion restrictive", () => {
  assert.match(assignmentMigration, /create table if not exists public\.adhdice_task_custom_ruleset_assignments/);
  assert.match(assignmentMigration, /unique \(user_id, task_id, effective_from_logical_date\)/);
  assert.match(assignmentMigration, /custom_ruleset_id uuid/);
  assert.match(assignmentMigration, /foreign key \(user_id, custom_ruleset_id\)[\s\S]*?on delete restrict/);
  assert.match(assignmentMigration, /adhdice_update_task_custom_ruleset_assignment/);
  assert.match(assignmentMigration, /set revision = v_task\.revision \+ 1/);
  assert.match(assignmentMigration, /v_previous_custom_ruleset_id/);
  assert.match(assignmentMigration, /v_creation_logical_date/);
  assert.match(assignmentMigration, /adhdice_create_canonical_task/);
  assert.match(assignmentMigration, /adhdice_validate_task_custom_ruleset_assignment/);
  assert.match(assignmentMigration, /adhdice_guard_task_custom_ruleset_projection_update/);
  assert.match(assignmentMigration, /grant select on table public\.adhdice_task_custom_ruleset_assignments to authenticated/);
  assert.doesNotMatch(assignmentMigration, /custom_ruleset_id[\s\S]{0,180}on delete set null/i);
  assert.match(schema, /create table public\.adhdice_task_custom_ruleset_assignments/);
  assert.match(schema, /adhdice_task_custom_ruleset_assignments_task_date_idx/);
  assert.match(schema, /adhdice_clean_tasks_custom_ruleset_owner_fkey[\s\S]*?on delete restrict/);
  assert.match(schema, /adhdice_guard_task_custom_ruleset_projection_update/);
  assert.match(schema, /adhdice_create_canonical_task\(uuid, jsonb\)/);
});

test("named ruleset loader keeps separate identities and ignores inactive rulesets", async () => {
  const rulesets = [
    { id: "ruleset-practice", user_id: "owner-1", name: "Practice", task_type: "custom" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { id: "ruleset-routine", user_id: "owner-1", name: "Routine", task_type: "custom" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { id: "ruleset-goal", user_id: "owner-1", name: "Goal", task_type: "goal" as never, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
  ];
  const revisions = [
    { ruleset_id: "ruleset-practice", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "blank" as const, positive_streak_on_unhandled: "preserve" as const, missed_streak_on_unhandled: "ignore" as const, rewards: "disabled" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { ruleset_id: "ruleset-routine", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "missed" as const, positive_streak_on_unhandled: "break" as const, missed_streak_on_unhandled: "increment" as const, rewards: "enabled" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { ruleset_id: "ruleset-goal", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "blank" as const, positive_streak_on_unhandled: "preserve" as const, missed_streak_on_unhandled: "ignore" as const, rewards: "disabled" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
  ];
  const assignments = [
    { id: "assignment-practice", user_id: "owner-1", task_id: task.id, effective_from_logical_date: "2026-09-01", custom_ruleset_id: "ruleset-practice", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { id: "assignment-routine", user_id: "owner-1", task_id: task.id, effective_from_logical_date: "2026-09-21", custom_ruleset_id: "ruleset-routine", created_at: "2026-09-21T00:00:00.000Z", updated_at: "2026-09-21T00:00:00.000Z" },
  ];
  const client = {
    from(table: string) {
      const data = table === "adhdice_custom_behavior_rulesets"
        ? rulesets
        : table === "adhdice_custom_behavior_ruleset_revisions"
          ? revisions
          : assignments;
      return {
        select() {
          return {
            eq: async () => ({ data, error: null }),
            then: (resolve: (value: { data: typeof data; error: null }) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
          };
        },
      };
    },
  };
  const loaded = await loadCustomBehaviorRulesets(client as never, "owner-1");
  assert.deepEqual(loaded.data.map((ruleset) => ruleset.id), ["ruleset-practice", "ruleset-routine"]);
  assert.deepEqual(Object.keys(loaded.revisions), ["ruleset-practice", "ruleset-routine"]);
  assert.equal(loaded.revisions["ruleset-practice"]?.[0]?.unresolvedOccurrence, "blank");
  assert.equal(loaded.revisions["ruleset-routine"]?.[0]?.unresolvedOccurrence, "missed");
  assert.deepEqual(loaded.assignmentsByTaskId[task.id], [
    { effectiveFromLogicalDate: "2026-09-01", customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", customRulesetId: "ruleset-routine" },
  ]);
});

test("successful browser assignment mutations refresh authority before local reconciliation", async () => {
  const assignmentTask = createTask({
    custom_ruleset_id: "ruleset-practice",
    due_on: "2026-09-01",
    id: "browser-assignment-task",
    repeat_frequency: "daily",
    status: "pending",
    task_type: "custom",
  });
  let assignmentAuthority = [
    { effectiveFromLogicalDate: "2026-09-01", customRulesetId: "ruleset-practice" },
  ];
  let nextAssignmentAuthority = [
    ...assignmentAuthority,
    { effectiveFromLogicalDate: "2026-09-21", customRulesetId: "ruleset-routine" },
  ];
  let refreshCalls = 0;
  const observedPolicies: string[] = [];
  const client = {
    rpc: async (_functionName: string, args: { p_task_patch: { custom_ruleset_id?: string | null } }) => ({
      data: {
        ...assignmentTask,
        custom_ruleset_id: args.p_task_patch.custom_ruleset_id ?? null,
        revision: assignmentTask.revision + refreshCalls + 1,
      },
      error: null,
    }),
  };
  const refreshCustomBehaviorRulesets = async () => {
    refreshCalls += 1;
    assignmentAuthority = nextAssignmentAuthority;
    return true;
  };
  const update = useTaskUpdateAction({
    behaviorProfiles: {
      custom: {
        id: "generic-custom",
        missedStreakOnUnhandled: "increment",
        positiveStreakOnUnhandled: "break",
        rewards: "enabled",
        unresolvedOccurrence: "missed",
      },
    },
    behaviorPolicyRevisions: { custom: [revision("generic-custom", "2026-09-01", { rewards: "disabled" })] },
    customRulesetAssignmentsByTaskId: { [assignmentTask.id]: assignmentAuthority },
    currentDayKey: "2026-09-21",
    namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
    onTaskHistoryMutation: (_taskId, _history, nextTask) => {
      const resolved = resolveTaskBehaviorPolicyForTask({
        behaviorPolicyRevisions: { custom: [revision("generic-custom", "2026-09-01", { rewards: "disabled" })] },
        behaviorProfiles: {
          custom: {
            id: "generic-custom",
            missedStreakOnUnhandled: "increment",
            positiveStreakOnUnhandled: "break",
            rewards: "disabled",
            unresolvedOccurrence: "missed",
          },
        },
        customRulesetAssignmentsByTaskId: { [assignmentTask.id]: assignmentAuthority },
        customRulesetId: nextTask?.custom_ruleset_id,
        logicalDate: "2026-09-21",
        namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
        taskId: assignmentTask.id,
        taskType: "custom",
      });
      observedPolicies.push(`${resolved.policy.unresolvedOccurrence}/${resolved.policy.rewards}`);
    },
    onTasksCompleted: async () => {},
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    syncTaskHistoryEntry: async () => true,
    tasks: [assignmentTask],
    updateTaskRowWithLegacyEnergyFallback: (taskId, values, options) => updateTaskRowWithLegacyEnergyFallback(
      client as never,
      taskId,
      values,
      () => false,
      () => false,
      { ...options, refreshCustomBehaviorRulesets },
    ),
  });

  assert.equal(await update.updateTask(assignmentTask.id, { custom_ruleset_id: "ruleset-routine" }), true);
  assert.equal(refreshCalls, 1);
  assert.deepEqual(assignmentAuthority, nextAssignmentAuthority);
  assert.equal(observedPolicies[0], "missed/enabled");

  nextAssignmentAuthority = [
    assignmentAuthority[0]!,
    { effectiveFromLogicalDate: "2026-09-21", customRulesetId: null },
  ];
  assert.equal(await update.updateTask(assignmentTask.id, { custom_ruleset_id: null }), true);
  assert.equal(refreshCalls, 2);
  assert.deepEqual(assignmentAuthority, [
    { effectiveFromLogicalDate: "2026-09-01", customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", customRulesetId: null },
  ]);
  assert.equal(observedPolicies[1], "missed/disabled");
});

test("a failed assignment mutation does not publish speculative browser authority", async () => {
  const failedTask = createTask({ id: "failed-browser-assignment", task_type: "custom", custom_ruleset_id: "ruleset-practice" });
  const assignmentAuthority = [
    { effectiveFromLogicalDate: "2026-09-01", customRulesetId: "ruleset-practice" },
  ];
  let refreshCalls = 0;
  const result = await updateTaskRowWithLegacyEnergyFallback(
    {
      rpc: async () => ({ data: null, error: { message: "assignment rejected" } }),
    } as never,
    failedTask.id,
    { custom_ruleset_id: "ruleset-routine" },
    () => false,
    () => false,
    {
      expectedTask: failedTask,
      refreshCustomBehaviorRulesets: async () => {
        refreshCalls += 1;
        return true;
      },
    },
  );

  assert.equal(result.data, null);
  assert.equal(result.error?.message, "assignment rejected");
  assert.equal(refreshCalls, 0);
  assert.equal(resolveTaskBehaviorPolicyForTask({
    customRulesetAssignmentsByTaskId: { [failedTask.id]: assignmentAuthority },
    customRulesetId: "ruleset-practice",
    logicalDate: "2026-09-12",
    namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
    taskId: failedTask.id,
    taskType: "custom",
  }).policy.unresolvedOccurrence, "blank");
});

test("a refreshed assignment loader retains earlier rows while replacing the same logical date", async () => {
  const rulesets = [
    { id: "ruleset-practice", user_id: "owner-1", name: "Practice", task_type: "custom" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { id: "ruleset-routine", user_id: "owner-1", name: "Routine", task_type: "custom" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
  ];
  const revisions = [
    { ruleset_id: "ruleset-practice", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "blank" as const, positive_streak_on_unhandled: "preserve" as const, missed_streak_on_unhandled: "ignore" as const, rewards: "disabled" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { ruleset_id: "ruleset-routine", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "missed" as const, positive_streak_on_unhandled: "break" as const, missed_streak_on_unhandled: "increment" as const, rewards: "enabled" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
  ];
  let assignmentRows = [
    { id: "assignment-practice", user_id: "owner-1", task_id: task.id, effective_from_logical_date: "2026-09-01", custom_ruleset_id: "ruleset-practice", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { id: "assignment-current", user_id: "owner-1", task_id: task.id, effective_from_logical_date: "2026-09-21", custom_ruleset_id: "ruleset-practice", created_at: "2026-09-21T00:00:00.000Z", updated_at: "2026-09-21T00:00:00.000Z" },
  ];
  const client = {
    from(table: string) {
      const data = table === "adhdice_custom_behavior_rulesets" ? rulesets : table === "adhdice_custom_behavior_ruleset_revisions" ? revisions : assignmentRows;
      return {
        select() {
          return {
            eq: async () => ({ data, error: null }),
            then: (resolve: (value: { data: typeof data; error: null }) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
          };
        },
      };
    },
  };

  const initial = await loadCustomBehaviorRulesets(client as never, "owner-1");
  assignmentRows = [assignmentRows[0]!, { ...assignmentRows[1]!, custom_ruleset_id: "ruleset-routine" }];
  const refreshed = await loadCustomBehaviorRulesets(client as never, "owner-1");

  assert.deepEqual(initial.assignmentsByTaskId[task.id], [
    { effectiveFromLogicalDate: "2026-09-01", customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", customRulesetId: "ruleset-practice" },
  ]);
  assert.deepEqual(refreshed.assignmentsByTaskId[task.id], [
    { effectiveFromLogicalDate: "2026-09-01", customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", customRulesetId: "ruleset-routine" },
  ]);
});

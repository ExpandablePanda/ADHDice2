import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { loadCustomBehaviorRulesets } from "../src/lib/custom-behavior-rulesets.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { buildCompatibilityTaskStateEngineInput } from "../src/lib/task-state-engine/direct-input.ts";
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
      namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
    });
    assert.equal(input.behaviorPolicy, STANDARD_TASK_BEHAVIOR_POLICY, taskType);
    assert.equal(input.behaviorPolicyRevisions, undefined, taskType);
  }
});

test("explicit existing History remains factual while a named ruleset supplies policy", () => {
  const history = [{
    id: "history-done",
    task_id: task.id,
    entry_date: "2026-09-01",
    status: "done",
    event_type: "status",
    occurrence_key: "task:task-1:occurrence:2026-09-01",
    occurrence_due_on: "2026-09-01",
    counted_as_due_occurrence: true,
    was_completed: true,
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
  }] as never;
  const engineInput = buildCompatibilityTaskStateEngineInput({ ...task, task_type: "custom", custom_ruleset_id: "ruleset-practice" }, history, {
    ...context,
    namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
  });
  const result = evaluateTaskState({ ...engineInput, action: { type: "reconcile_rollover" } });
  assert.equal(result.behaviorPolicy.unresolvedOccurrence, "blank");
  assert.deepEqual(result.proposedHistoryChanges, []);
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
  const client = {
    from(table: string) {
      const data = table.endsWith("rulesets") ? rulesets : revisions;
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
});

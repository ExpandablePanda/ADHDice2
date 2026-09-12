import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createCustomBehaviorRuleset,
  deleteCustomBehaviorRuleset,
  getCustomRulesetAssignedTaskCount,
  loadCustomBehaviorRulesets,
  renameCustomBehaviorRuleset,
  upsertCustomBehaviorRulesetRevision,
  validateCustomBehaviorRulesetName,
} from "../src/lib/custom-behavior-rulesets.ts";
import { moveAssignedTasksToTaskAndDeleteRuleset } from "../src/lib/custom-ruleset-delete-resolution.ts";
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
const behaviorSelectionMigration = readFileSync(new URL("../supabase/add_task_behavior_selections_7_13_31.sql", import.meta.url), "utf8");
const softDeleteMigration = readFileSync(new URL("../supabase/add_custom_behavior_ruleset_soft_delete_7_13_33.sql", import.meta.url), "utf8");
const tombstoneFixMigration = readFileSync(new URL("../supabase/fix_custom_behavior_ruleset_delete_tombstones_7_13_35.sql", import.meta.url), "utf8");
const ambiguityFixMigration = readFileSync(new URL("../supabase/fix_custom_behavior_ruleset_delete_ambiguity_7_13_36.sql", import.meta.url), "utf8");
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
    availableActions: ["done", "did_my_best", "missed", "delay", "complete"],
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
    behaviorSelectionsByTaskId: {},
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
    { effectiveFromLogicalDate: "2026-09-10", taskType: "custom" as const, customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", taskType: "custom" as const, customRulesetId: "ruleset-routine" },
  ];
  const resolve = (logicalDate: string) => resolveTaskBehaviorPolicyForTask({
    taskId: task.id,
    taskType: "custom",
    // The current projection is Routine; historical resolution must use the
    // effective-dated assignment rows instead.
    customRulesetId: "ruleset-routine",
    behaviorPolicyRevisions: { custom: [revision("legacy-custom", "2026-09-01")] },
    behaviorSelectionsByTaskId: { [task.id]: assignments },
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
    { effectiveFromLogicalDate: "2026-09-10", taskType: "custom" as const, customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", taskType: "custom" as const, customRulesetId: null },
  ];
  const resolve = (logicalDate: string) => resolveTaskBehaviorPolicyForTask({
    taskId: task.id,
    taskType: "custom",
    customRulesetId: null,
    behaviorPolicyRevisions: { custom: [revision("legacy-custom", "2026-09-01", { unresolvedOccurrence: "missed" })] },
    behaviorSelectionsByTaskId: { [task.id]: assignments },
    namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
    logicalDate,
  }).policy;

  assert.equal(resolve("2026-09-20").unresolvedOccurrence, "blank");
  assert.equal(resolve("2026-09-21").unresolvedOccurrence, "missed");
  assert.equal(resolve("2026-09-25").unresolvedOccurrence, "missed");
});

test("historical behavior selection resolves TaskType and named ruleset transitions before policy", () => {
  const behaviorPolicyRevisions = {
    task: [revision("task-default", "2026-09-01")],
    custom: [revision("custom-default", "2026-09-01")],
  };
  const resolve = (
    selections: Array<{ effectiveFromLogicalDate: string; taskType: "task" | "pursuit" | "goal" | "custom"; customRulesetId: string | null }>,
    logicalDate: string,
    taskType: "task" | "pursuit" | "goal" | "custom",
    customRulesetId: string | null = null,
  ) => resolveTaskBehaviorPolicyForTask({
    behaviorPolicyRevisions,
    behaviorSelectionsByTaskId: { [task.id]: selections },
    customRulesetId,
    logicalDate,
    namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
    taskId: task.id,
    taskType,
  }).policy;

  const taskToPractice = [
    { effectiveFromLogicalDate: "2026-09-01", taskType: "task" as const, customRulesetId: null },
    { effectiveFromLogicalDate: "2026-09-10", taskType: "custom" as const, customRulesetId: "ruleset-practice" },
  ];
  assert.equal(resolve(taskToPractice, "2026-09-05", "custom", "ruleset-practice").unresolvedOccurrence, "missed");
  assert.equal(resolve(taskToPractice, "2026-09-12", "custom", "ruleset-practice").unresolvedOccurrence, "blank");

  const customDefaultToPractice = [
    { effectiveFromLogicalDate: "2026-09-01", taskType: "custom" as const, customRulesetId: null },
    { effectiveFromLogicalDate: "2026-09-10", taskType: "custom" as const, customRulesetId: "ruleset-practice" },
  ];
  assert.equal(resolve(customDefaultToPractice, "2026-09-05", "custom", "ruleset-practice").unresolvedOccurrence, "missed");
  assert.equal(resolve(customDefaultToPractice, "2026-09-12", "custom", "ruleset-practice").unresolvedOccurrence, "blank");

  const practiceToRoutine = [
    { effectiveFromLogicalDate: "2026-09-01", taskType: "custom" as const, customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-10", taskType: "custom" as const, customRulesetId: "ruleset-routine" },
  ];
  assert.equal(resolve(practiceToRoutine, "2026-09-05", "custom", "ruleset-routine").unresolvedOccurrence, "blank");
  assert.equal(resolve(practiceToRoutine, "2026-09-12", "custom", "ruleset-routine").unresolvedOccurrence, "missed");

  const practiceToTask = [
    { effectiveFromLogicalDate: "2026-09-01", taskType: "custom" as const, customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-10", taskType: "task" as const, customRulesetId: null },
  ];
  assert.equal(resolve(practiceToTask, "2026-09-05", "task").unresolvedOccurrence, "blank");
  assert.equal(resolve(practiceToTask, "2026-09-12", "task").unresolvedOccurrence, "missed");

  const practiceToCustomDefault = [
    { effectiveFromLogicalDate: "2026-09-01", taskType: "custom" as const, customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-10", taskType: "custom" as const, customRulesetId: null },
  ];
  assert.equal(resolve(practiceToCustomDefault, "2026-09-05", "custom").unresolvedOccurrence, "blank");
  assert.equal(resolve(practiceToCustomDefault, "2026-09-12", "custom").unresolvedOccurrence, "missed");

  for (const taskType of ["pursuit", "goal"] as const) {
    const customToInactive = [
      { effectiveFromLogicalDate: "2026-09-01", taskType: "custom" as const, customRulesetId: "ruleset-practice" },
      { effectiveFromLogicalDate: "2026-09-10", taskType, customRulesetId: null },
    ];
    assert.equal(resolve(customToInactive, "2026-09-05", taskType).unresolvedOccurrence, "blank", taskType);
    assert.equal(resolve(customToInactive, "2026-09-12", taskType).unresolvedOccurrence, "missed", taskType);
  }
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
      behaviorSelectionsByTaskId: { [task.id]: [{ effectiveFromLogicalDate: "2026-09-01", taskType, customRulesetId: null }] },
      namedCustomRulesetBehaviorPolicyRevisions: namedRulesets(),
    });
    assert.equal(input.behaviorPolicy, STANDARD_TASK_BEHAVIOR_POLICY, taskType);
    assert.deepEqual(input.behaviorPolicyRevisions?.map((revision) => revision.effectiveFromLogicalDate), ["2026-09-01"], taskType);
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
    behaviorSelectionsByTaskId: {
      [task.id]: [
        { effectiveFromLogicalDate: "2026-09-10", taskType: "custom", customRulesetId: "ruleset-practice" },
        { effectiveFromLogicalDate: "2026-09-21", taskType: "custom", customRulesetId: "ruleset-routine" },
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
  assert.match(schema, /create table public\.adhdice_task_behavior_selections/);
  assert.match(schema, /adhdice_task_behavior_selections_task_date_idx/);
  assert.match(schema, /adhdice_clean_tasks_custom_ruleset_owner_fkey[\s\S]*?on delete restrict/);
  assert.match(schema, /adhdice_guard_task_behavior_selection_projection_update/);
  assert.match(schema, /adhdice_create_canonical_task\(uuid, jsonb\)/);
});

test("7.13.31 generalizes the assignment authority without retaining a second table", () => {
  assert.match(behaviorSelectionMigration, /alter table public\.adhdice_task_custom_ruleset_assignments\s+rename to adhdice_task_behavior_selections/);
  assert.match(behaviorSelectionMigration, /task_type text not null/);
  assert.match(behaviorSelectionMigration, /task_type = 'custom'/);
  assert.match(behaviorSelectionMigration, /adhdice_task_custom_ruleset_assignments as/);
  assert.match(behaviorSelectionMigration, /create or replace function public\.adhdice_update_task_behavior_selection/);
  assert.match(behaviorSelectionMigration, /adhdice_seed_task_behavior_selection/);
  assert.match(behaviorSelectionMigration, /v_previous_task_type/);
  assert.match(behaviorSelectionMigration, /v_creation_logical_date/);
  assert.match(behaviorSelectionMigration, /on conflict \(user_id, task_id, effective_from_logical_date\)/i);
});

test("7.13.33 tombstones named rulesets, protects current assignments, and keeps history addressable", () => {
  assert.match(softDeleteMigration, /add column if not exists deleted_at timestamptz null/i);
  assert.match(softDeleteMigration, /create or replace function public\.adhdice_delete_custom_behavior_ruleset\(\s*p_ruleset_id uuid/i);
  assert.match(softDeleteMigration, /task\.custom_ruleset_id = p_ruleset_id/);
  assert.match(softDeleteMigration, /currently assigned to % Task%/);
  assert.match(softDeleteMigration, /set deleted_at = now\(\)/);
  assert.match(softDeleteMigration, /deleted_at is null/);
  assert.match(softDeleteMigration, /adhdice_validate_active_custom_behavior_ruleset_reference/);
  assert.match(softDeleteMigration, /grant execute on function public\.adhdice_delete_custom_behavior_ruleset\(uuid\) to authenticated/);
  assert.doesNotMatch(softDeleteMigration, /delete from public\.adhdice_custom_behavior_ruleset_revisions/i);
  assert.doesNotMatch(softDeleteMigration, /delete from public\.adhdice_task_behavior_selections/i);
  assert.match(schema, /deleted_at timestamptz null/);
  assert.match(schema, /adhdice_delete_custom_behavior_ruleset/);
});

test("7.13.35 excludes permanently deleted Task tombstones from the current-assignment guard", () => {
  const deleteFunction = (source: string) => source.slice(source.indexOf("create or replace function public.adhdice_delete_custom_behavior_ruleset"));
  for (const source of [tombstoneFixMigration, schema]) {
    const functionBody = deleteFunction(source);
    assert.match(functionBody, /task\.user_id = auth\.uid\(\)\s+and task\.custom_ruleset_id = p_ruleset_id\s+and task\.permanently_deleted_at is null/i);
    assert.match(functionBody, /if v_assigned_task_count > 0/);
    assert.match(functionBody, /case when v_assigned_task_count = 1 then '' else 's' end/);
    assert.match(functionBody, /set deleted_at = now\(\)/);
  }

  const practiceTasks = [
    { id: "active", lifecycle: "active", userId: "owner-1", customRulesetId: "ruleset-practice", permanentlyDeletedAt: null },
    { id: "archived", lifecycle: "archived", userId: "owner-1", customRulesetId: "ruleset-practice", permanentlyDeletedAt: null },
    { id: "restorable-trash", lifecycle: "restorable-trash", userId: "owner-1", customRulesetId: "ruleset-practice", permanentlyDeletedAt: null },
    { id: "permanently-deleted", lifecycle: "permanently-deleted", userId: "owner-1", customRulesetId: "ruleset-practice", permanentlyDeletedAt: "2026-09-11T12:00:00.000Z" },
  ];
  const currentAssignments = practiceTasks.filter((task) =>
    task.userId === "owner-1"
    && task.customRulesetId === "ruleset-practice"
    && task.permanentlyDeletedAt === null,
  );
  assert.deepEqual(currentAssignments.map((task) => task.lifecycle), ["active", "archived", "restorable-trash"]);
  assert.equal(practiceTasks.find((task) => task.id === "permanently-deleted")?.customRulesetId, "ruleset-practice");
  assert.equal(practiceTasks.find((task) => task.id === "permanently-deleted")?.permanentlyDeletedAt, "2026-09-11T12:00:00.000Z");

  assert.doesNotMatch(tombstoneFixMigration, /update public\.adhdice_clean_tasks/i);
  assert.doesNotMatch(tombstoneFixMigration, /delete from public\.adhdice_(?:custom_behavior_ruleset_revisions|task_behavior_selections|task_history)/i);
});

test("7.13.36 qualifies the ruleset delete UPDATE columns without changing its guards", () => {
  const deleteFunction = (source: string) => source.slice(source.indexOf("create or replace function public.adhdice_delete_custom_behavior_ruleset"));
  for (const source of [ambiguityFixMigration, schema]) {
    const functionBody = deleteFunction(source);
    const finalUpdate = functionBody.slice(functionBody.indexOf("return query"));
    const predicateAndReturning = finalUpdate.slice(finalUpdate.indexOf("where"));

    assert.match(functionBody, /returns table\(\s*ruleset_id uuid,\s*ruleset_name text,\s*deleted_at timestamptz/i);
    assert.match(finalUpdate, /update public\.adhdice_custom_behavior_rulesets as ruleset/i);
    assert.match(finalUpdate, /where ruleset\.id = p_ruleset_id\s+and ruleset\.user_id = auth\.uid\(\)\s+and ruleset\.deleted_at is null/i);
    assert.match(finalUpdate, /returning ruleset\.id, ruleset\.name, ruleset\.deleted_at;/i);
    assert.doesNotMatch(predicateAndReturning.replaceAll("ruleset.deleted_at", ""), /\bdeleted_at\b/i);
    assert.match(functionBody, /task\.user_id = auth\.uid\(\)\s+and task\.custom_ruleset_id = p_ruleset_id\s+and task\.permanently_deleted_at is null/i);
    assert.match(functionBody, /update public\.adhdice_custom_behavior_rulesets as ruleset[\s\S]*?set deleted_at = now\(\)/i);
    assert.doesNotMatch(functionBody, /delete from public\.adhdice_(?:custom_behavior_ruleset_revisions|task_behavior_selections|task_history)/i);
    assert.match(functionBody, /security invoker[\s\S]*?set search_path = public, pg_temp/i);
  }

  for (const source of [ambiguityFixMigration, schema]) {
    assert.match(source, /revoke all on function public\.adhdice_delete_custom_behavior_ruleset\(uuid\) from public, anon, authenticated;/i);
    assert.match(source, /grant execute on function public\.adhdice_delete_custom_behavior_ruleset\(uuid\) to authenticated;/i);
  }
});

test("named ruleset loader keeps historical identities while ignoring non-Custom rows", async () => {
  const rulesets = [
    { id: "ruleset-practice", user_id: "owner-1", name: "Practice", task_type: "custom" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { id: "ruleset-routine", user_id: "owner-1", name: "Routine", task_type: "custom" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { id: "ruleset-retired", user_id: "owner-1", name: "Retired Practice", task_type: "custom" as const, deleted_at: "2026-09-11T00:00:00.000Z", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-11T00:00:00.000Z" },
    { id: "ruleset-goal", user_id: "owner-1", name: "Goal", task_type: "goal" as never, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
  ];
  const revisions = [
    { ruleset_id: "ruleset-practice", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "blank" as const, positive_streak_on_unhandled: "preserve" as const, missed_streak_on_unhandled: "ignore" as const, rewards: "disabled" as const, available_actions: ["missed", "done", "missed"], created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { ruleset_id: "ruleset-routine", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "missed" as const, positive_streak_on_unhandled: "break" as const, missed_streak_on_unhandled: "increment" as const, rewards: "enabled" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { ruleset_id: "ruleset-retired", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "missed" as const, positive_streak_on_unhandled: "break" as const, missed_streak_on_unhandled: "increment" as const, rewards: "enabled" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-11T00:00:00.000Z" },
    { ruleset_id: "ruleset-goal", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "blank" as const, positive_streak_on_unhandled: "preserve" as const, missed_streak_on_unhandled: "ignore" as const, rewards: "disabled" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
  ];
  const assignments = [
    { id: "assignment-practice", user_id: "owner-1", task_id: task.id, effective_from_logical_date: "2026-09-01", task_type: "custom" as const, custom_ruleset_id: "ruleset-practice", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { id: "assignment-routine", user_id: "owner-1", task_id: task.id, effective_from_logical_date: "2026-09-21", task_type: "custom" as const, custom_ruleset_id: "ruleset-routine", created_at: "2026-09-21T00:00:00.000Z", updated_at: "2026-09-21T00:00:00.000Z" },
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
  assert.deepEqual(loaded.data.map((ruleset) => ruleset.id), ["ruleset-practice", "ruleset-routine", "ruleset-retired"]);
  assert.deepEqual(Object.keys(loaded.revisions), ["ruleset-practice", "ruleset-routine", "ruleset-retired"]);
  assert.equal(loaded.revisions["ruleset-practice"]?.[0]?.unresolvedOccurrence, "blank");
  assert.deepEqual(loaded.revisions["ruleset-practice"]?.[0]?.availableActions, ["done", "missed"]);
  assert.equal(loaded.revisions["ruleset-routine"]?.[0]?.unresolvedOccurrence, "missed");
  assert.deepEqual(loaded.revisions["ruleset-routine"]?.[0]?.availableActions, ["done", "did_my_best", "missed", "delay", "complete"]);
  assert.equal(loaded.revisions["ruleset-retired"]?.[0]?.unresolvedOccurrence, "missed");
  assert.deepEqual(loaded.behaviorSelectionsByTaskId[task.id], [
    { effectiveFromLogicalDate: "2026-09-01", taskType: "custom", customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", taskType: "custom", customRulesetId: "ruleset-routine" },
  ]);
});

test("named ruleset management trims names, rejects blanks and loaded duplicates case-insensitively", () => {
  const loaded = [{ id: "practice", name: "Practice" }];
  assert.deepEqual(validateCustomBehaviorRulesetName("  Routine  ", loaded), { name: "Routine", error: null });
  assert.deepEqual(validateCustomBehaviorRulesetName("  ", loaded), { name: "", error: "Ruleset name cannot be blank." });
  assert.deepEqual(validateCustomBehaviorRulesetName(" practice ", loaded), { name: "practice", error: "A ruleset with that name already exists." });
  assert.deepEqual(validateCustomBehaviorRulesetName(" practice ", loaded, "practice"), { name: "practice", error: null });
  assert.deepEqual(validateCustomBehaviorRulesetName(" Practice ", [{ id: "deleted", name: "Practice", deleted_at: "2026-09-11T00:00:00.000Z" }]), { name: "Practice", error: null });
});

test("user-facing ruleset deletion delegates to the owner-scoped RPC and preserves server errors", async () => {
  const calls: Array<{ functionName: string; args: unknown }> = [];
  const client = {
    rpc: async (functionName: string, args: unknown) => {
      calls.push({ functionName, args });
      return { data: [{ ruleset_id: "ruleset-practice", ruleset_name: "Practice", deleted_at: "2026-09-11T00:00:00.000Z" }], error: null };
    },
  };
  assert.equal(await deleteCustomBehaviorRuleset(client as never, "ruleset-practice"), null);
  assert.deepEqual(calls, [{ functionName: "adhdice_delete_custom_behavior_ruleset", args: { p_ruleset_id: "ruleset-practice" } }]);

  const failed = await deleteCustomBehaviorRuleset({
    rpc: async () => ({ data: null, error: { message: "Practice is currently assigned to 1 Task. Change those Tasks to another type or ruleset before deleting it." } }),
  } as never, "ruleset-practice");
  assert.equal(failed?.message, "Practice is currently assigned to 1 Task. Change those Tasks to another type or ruleset before deleting it.");
});

test("named ruleset creation seeds Custom Default policy and does not publish a partial identity", async () => {
  const calls: Array<{ table: string; operation: string; values?: unknown }> = [];
  const identity = { id: "ruleset-practice", user_id: "owner-1", name: "Practice", task_type: "custom" as const, created_at: "2026-09-10T00:00:00.000Z", updated_at: "2026-09-10T00:00:00.000Z" };
  const client = {
    from(table: string) {
      if (table === "adhdice_custom_behavior_rulesets") {
        return {
          insert(values: unknown) {
            calls.push({ table, operation: "insert", values });
            return { select: async () => ({ data: [identity], error: null }) };
          },
          delete() {
            return {
              eq() { return this; },
              then: () => Promise.resolve({ data: [], error: null }),
            };
          },
        };
      }
      return {
        upsert(values: unknown, options: unknown) {
          calls.push({ table, operation: "upsert", values: { values, options } });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  const result = await createCustomBehaviorRuleset(client as never, "owner-1", "  Practice  ", {
    ...STANDARD_TASK_BEHAVIOR_POLICY,
    id: "custom-default",
    unresolvedOccurrence: "blank",
    rewards: "disabled",
    availableActions: ["done", "delay"],
  }, "2026-09-10");

  assert.equal(result.error, null);
  assert.equal(result.data?.id, identity.id);
  assert.deepEqual(calls, [
    { table: "adhdice_custom_behavior_rulesets", operation: "insert", values: { user_id: "owner-1", name: "Practice", task_type: "custom" } },
    {
      table: "adhdice_custom_behavior_ruleset_revisions",
      operation: "upsert",
      values: {
        values: {
          ruleset_id: "ruleset-practice",
          effective_from_logical_date: "2026-09-10",
          unresolved_occurrence: "blank",
          positive_streak_on_unhandled: "break",
          missed_streak_on_unhandled: "increment",
          rewards: "disabled",
          available_actions: ["done", "delay"],
        },
        options: { onConflict: "ruleset_id,effective_from_logical_date" },
      },
    },
  ]);
});

test("named ruleset revision updates replace today without rewriting prior revisions", async () => {
  let persisted: unknown = null;
  const client = {
    from() {
      return {
        upsert(values: unknown, options: unknown) {
          persisted = { values, options };
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  const error = await upsertCustomBehaviorRulesetRevision(client as never, "ruleset-practice", "2026-09-10", {
    ...STANDARD_TASK_BEHAVIOR_POLICY,
    id: "ruleset-practice",
    positiveStreakOnUnhandled: "preserve",
  });
  assert.equal(error, null);
  assert.deepEqual(persisted, {
    values: {
      ruleset_id: "ruleset-practice",
      effective_from_logical_date: "2026-09-10",
      unresolved_occurrence: "missed",
      positive_streak_on_unhandled: "break",
      missed_streak_on_unhandled: "increment",
      rewards: "enabled",
      available_actions: ["done", "did_my_best", "missed", "delay", "complete"],
    },
    options: { onConflict: "ruleset_id,effective_from_logical_date" },
  });
});

test("failed named ruleset creation removes only its unreferenced identity and returns no success", async () => {
  let deleteCalls = 0;
  const identity = { id: "ruleset-orphan", user_id: "owner-1", name: "Orphan", task_type: "custom" as const, created_at: "2026-09-10T00:00:00.000Z", updated_at: "2026-09-10T00:00:00.000Z" };
  const client = {
    from(table: string) {
      if (table === "adhdice_custom_behavior_rulesets") {
        return {
          insert: () => ({ select: async () => ({ data: [identity], error: null }) }),
          delete: () => ({
            eq() { deleteCalls += 1; return this; },
            then(resolve: (value: { data: never[]; error: null }) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); },
          }),
        };
      }
      return { upsert: async () => ({ error: { message: "revision rejected" } }) };
    },
  };
  const result = await createCustomBehaviorRuleset(client as never, "owner-1", "Orphan", STANDARD_TASK_BEHAVIOR_POLICY, "2026-09-10");
  assert.equal(result.data, null);
  assert.equal(result.error?.message, "revision rejected");
  assert.equal(deleteCalls, 2);
});

test("rename preserves identity and policy history, while persistence failures return no success", async () => {
  const identity = { id: "ruleset-practice", user_id: "owner-1", name: "Guitar Practice", task_type: "custom" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-10T00:00:00.000Z" };
  let updateValues: unknown = null;
  const client = {
    from() {
      return {
        update(values: unknown) {
          updateValues = values;
          return {
            eq() { return this; },
            select: async () => ({ data: [identity], error: null }),
          };
        },
      };
    },
  };
  const renamed = await renameCustomBehaviorRuleset(client as never, "owner-1", "ruleset-practice", " Guitar Practice ", [{ id: "ruleset-practice", name: "Practice" }]);
  assert.equal(renamed.data?.id, "ruleset-practice");
  assert.equal(renamed.data?.name, "Guitar Practice");
  assert.deepEqual(updateValues, { name: "Guitar Practice", updated_at: updateValues && typeof updateValues === "object" ? (updateValues as { updated_at: string }).updated_at : null });

  const failed = await renameCustomBehaviorRuleset({
    from: () => ({ update: () => ({ eq() { return this; }, select: async () => ({ data: null, error: { message: "rename rejected" } }) }) }),
  } as never, "owner-1", "ruleset-practice", "New Name", []);
  assert.equal(failed.data, null);
  assert.equal(failed.error?.message, "rename rejected");
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
    { effectiveFromLogicalDate: "2026-09-01", taskType: "custom" as const, customRulesetId: "ruleset-practice" },
  ];
  let nextAssignmentAuthority = [
    ...assignmentAuthority,
    { effectiveFromLogicalDate: "2026-09-21", taskType: "custom" as const, customRulesetId: "ruleset-routine" },
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
    behaviorSelectionsByTaskId: { [assignmentTask.id]: assignmentAuthority },
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
        behaviorSelectionsByTaskId: { [assignmentTask.id]: assignmentAuthority },
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
    { effectiveFromLogicalDate: "2026-09-21", taskType: "custom", customRulesetId: null },
  ];
  assert.equal(await update.updateTask(assignmentTask.id, { custom_ruleset_id: null }), true);
  assert.equal(refreshCalls, 2);
  assert.deepEqual(assignmentAuthority, [
    { effectiveFromLogicalDate: "2026-09-01", taskType: "custom", customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", taskType: "custom", customRulesetId: null },
  ]);
  assert.equal(observedPolicies[1], "missed/disabled");
});

test("a failed assignment mutation does not publish speculative browser authority", async () => {
  const failedTask = createTask({ id: "failed-browser-assignment", task_type: "custom", custom_ruleset_id: "ruleset-practice" });
  const assignmentAuthority = [
    { effectiveFromLogicalDate: "2026-09-01", taskType: "custom" as const, customRulesetId: "ruleset-practice" },
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
    behaviorSelectionsByTaskId: { [failedTask.id]: assignmentAuthority },
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
    { ruleset_id: "ruleset-practice", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "blank" as const, positive_streak_on_unhandled: "preserve" as const, missed_streak_on_unhandled: "ignore" as const, rewards: "disabled" as const, available_actions: ["missed", "done", "missed"], created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { ruleset_id: "ruleset-routine", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "missed" as const, positive_streak_on_unhandled: "break" as const, missed_streak_on_unhandled: "increment" as const, rewards: "enabled" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
  ];
  let assignmentRows = [
    { id: "assignment-practice", user_id: "owner-1", task_id: task.id, effective_from_logical_date: "2026-09-01", task_type: "custom" as const, custom_ruleset_id: "ruleset-practice", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
    { id: "assignment-current", user_id: "owner-1", task_id: task.id, effective_from_logical_date: "2026-09-21", task_type: "custom" as const, custom_ruleset_id: "ruleset-practice", created_at: "2026-09-21T00:00:00.000Z", updated_at: "2026-09-21T00:00:00.000Z" },
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

  assert.deepEqual(initial.behaviorSelectionsByTaskId[task.id], [
    { effectiveFromLogicalDate: "2026-09-01", taskType: "custom", customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", taskType: "custom", customRulesetId: "ruleset-practice" },
  ]);
  assert.deepEqual(refreshed.behaviorSelectionsByTaskId[task.id], [
    { effectiveFromLogicalDate: "2026-09-01", taskType: "custom", customRulesetId: "ruleset-practice" },
    { effectiveFromLogicalDate: "2026-09-21", taskType: "custom", customRulesetId: "ruleset-routine" },
  ]);
});

test("blocked deletion copy parses singular and plural assignment counts", () => {
  assert.equal(getCustomRulesetAssignedTaskCount("Practice is currently assigned to 1 Task. Change those Tasks before deleting it."), 1);
  assert.equal(getCustomRulesetAssignedTaskCount("Practice is currently assigned to 2 Tasks. Change those Tasks before deleting it."), 2);
  assert.equal(getCustomRulesetAssignedTaskCount("Could not delete the Custom ruleset."), null);
});

test("ruleset resolution moves every assigned Task before attempting tombstone deletion", async () => {
  const movedTaskIds: string[] = [];
  let deleteCalls = 0;
  const result = await moveAssignedTasksToTaskAndDeleteRuleset({
    taskIds: ["task-a", "task-b"],
    moveTask: async (taskId) => {
      movedTaskIds.push(taskId);
      return true;
    },
    deleteRuleset: async () => {
      deleteCalls += 1;
      return true;
    },
  });
  assert.deepEqual(movedTaskIds, ["task-a", "task-b"]);
  assert.deepEqual(result.movedTaskIds, ["task-a", "task-b"]);
  assert.equal(result.deleteAttempted, true);
  assert.equal(result.deleted, true);
  assert.equal(deleteCalls, 1);
});

test("ruleset resolution stops on the first move failure and leaves deletion blocked", async () => {
  const movedTaskIds: string[] = [];
  let deleteCalls = 0;
  const result = await moveAssignedTasksToTaskAndDeleteRuleset({
    taskIds: ["task-a", "task-b", "task-c"],
    moveTask: async (taskId) => {
      movedTaskIds.push(taskId);
      return taskId !== "task-b";
    },
    deleteRuleset: async () => {
      deleteCalls += 1;
      return true;
    },
  });
  assert.deepEqual(movedTaskIds, ["task-a", "task-b"]);
  assert.deepEqual(result.movedTaskIds, ["task-a"]);
  assert.equal(result.failedTaskId, "task-b");
  assert.equal(result.deleteAttempted, false);
  assert.equal(result.deleted, false);
  assert.equal(deleteCalls, 0);
});

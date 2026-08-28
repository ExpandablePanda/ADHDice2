import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type {
  HealthExercise,
  HealthFitnessGoal,
  HealthFitnessGoalLevel,
  HealthFitnessPerformanceMetric,
} from "@/lib/database.types";
import {
  HEALTH_FITNESS_GOALS_MIGRATION_MESSAGE,
  formatHealthFitnessGoalsError,
  normalizeHealthFitnessGoalDraft,
  validateHealthFitnessGoalDraft,
  validateHealthFitnessGoalLevelDraft,
  validateHealthFitnessGoalTargetAgainstLevels,
} from "@/lib/health-fitness-goals";
import { isCurrentFitnessReloadRequest, isCurrentFitnessScope } from "@/lib/fitness-reload-guard";

const migration = readFileSync(new URL("../supabase/add_health_fitness_goals_7_11_69.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/hooks/useFitnessGoals.ts", import.meta.url), "utf8");

function exercise(overrides: Partial<HealthExercise> = {}): Pick<HealthExercise, "id" | "archived_at"> {
  return { archived_at: null, id: "exercise-1", ...overrides };
}

function goal(overrides: Partial<Pick<HealthFitnessGoal, "id" | "target">> = {}): Pick<HealthFitnessGoal, "id" | "target"> {
  return { id: "goal-1", target: 100, ...overrides };
}

function level(overrides: Partial<Pick<HealthFitnessGoalLevel, "id" | "goal_id" | "target">> = {}): Pick<HealthFitnessGoalLevel, "id" | "goal_id" | "target"> {
  return { goal_id: "goal-1", id: "level-1", target: 50, ...overrides };
}

function draft(overrides: Partial<{
  exercise_id: string;
  metric: HealthFitnessPerformanceMetric;
  title: string;
  target: number;
}> = {}) {
  return {
    exercise_id: "exercise-1",
    metric: "session_total_reps" as HealthFitnessPerformanceMetric,
    target: 50,
    title: "Reach 50",
    ...overrides,
  };
}

test("Goal validation rejects blank titles and invalid targets", () => {
  assert.equal(validateHealthFitnessGoalDraft(draft({ title: "   " }), [exercise()]), "Goal title cannot be blank.");
  assert.equal(validateHealthFitnessGoalDraft(draft({ target: 0 }), [exercise()]), "Goal target must be a positive whole number.");
  assert.equal(validateHealthFitnessGoalDraft(draft({ target: 1.5 }), [exercise()]), "Goal target must be a positive whole number.");
});

test("Goal validation rejects unsupported metrics and missing Exercises", () => {
  assert.equal(validateHealthFitnessGoalDraft(draft({ metric: "not_supported" as HealthFitnessPerformanceMetric }), [exercise()]), "Choose a supported Fitness Goal metric.");
  assert.equal(validateHealthFitnessGoalDraft(draft({ exercise_id: "missing" }), [exercise()]), "Choose a valid Exercise Library exercise for this Goal.");
});

test("new Goals reject archived Exercises while existing archived targets remain editable", () => {
  const archived = [exercise({ archived_at: "2026-08-25T12:00:00.000Z" })];
  assert.equal(validateHealthFitnessGoalDraft(draft(), archived), "Choose an active Exercise Library exercise for a new Goal.");
  assert.equal(validateHealthFitnessGoalDraft(draft(), archived, { allowArchivedExercise: true }), null);
});

test("multiple Goals for one Exercise and metric remain allowed", () => {
  assert.equal(validateHealthFitnessGoalDraft(draft({ title: "First 50" }), [exercise()]), null);
  assert.equal(validateHealthFitnessGoalDraft(draft({ title: "Reach 100", target: 100 }), [exercise()]), null);
  assert.doesNotMatch(migration, /unique\s*\([^)]*exercise_id[^)]*metric/);
});

test("Goal target lowering is rejected when an existing Level would exceed it", () => {
  assert.equal(validateHealthFitnessGoalTargetAgainstLevels("goal-1", 50, [level({ target: 75 })]), "Goal target cannot be lower than an existing Level target.");
  assert.equal(validateHealthFitnessGoalTargetAgainstLevels("goal-1", 75, [level({ target: 75 })]), null);
});

test("Level validation rejects blank labels, invalid targets, and targets above the Goal", () => {
  assert.equal(validateHealthFitnessGoalLevelDraft({ goal_id: "goal-1", label: " ", sort_order: 0, target: 25 }, goal(), []), "Level label cannot be blank.");
  assert.equal(validateHealthFitnessGoalLevelDraft({ goal_id: "goal-1", label: "Quarter", sort_order: 0, target: 0 }, goal(), []), "Level target must be a positive whole number.");
  assert.equal(validateHealthFitnessGoalLevelDraft({ goal_id: "goal-1", label: "Beyond", sort_order: 0, target: 125 }, goal(), []), "Level target cannot exceed the parent Goal target.");
});

test("duplicate Level thresholds are rejected but labels may repeat", () => {
  assert.equal(validateHealthFitnessGoalLevelDraft({ goal_id: "goal-1", label: "Same label", sort_order: 1, target: 50 }, goal(), [level()]), "A Goal cannot have duplicate Level targets.");
  assert.equal(validateHealthFitnessGoalLevelDraft({ goal_id: "goal-1", label: "Same label", sort_order: 1, target: 50 }, goal(), [level({ id: "level-1" })], "level-1"), null);
});

test("Level ordering is explicit and nonnegative", () => {
  assert.equal(validateHealthFitnessGoalLevelDraft({ goal_id: "goal-1", label: "Out of order", sort_order: -1, target: 25 }, goal(), []), "Level order must be a nonnegative whole number.");
  assert.equal(validateHealthFitnessGoalLevelDraft({ goal_id: "goal-1", label: "Manual order", sort_order: 4, target: 25 }, goal(), []), null);
});

test("Goal and Level ownership validation requires the current parent Goal", () => {
  assert.equal(validateHealthFitnessGoalLevelDraft({ goal_id: "other-goal", label: "Wrong parent", sort_order: 0, target: 25 }, goal(), []), "Choose a valid Fitness Goal for this Level.");
});

test("normalization trims persisted Goal and Level text", () => {
  assert.equal(normalizeHealthFitnessGoalDraft(draft({ title: "  Trim me  " })).title, "Trim me");
});

test("missing migration errors return only the friendly message and unrelated errors stay unchanged", () => {
  for (const message of [
    '42P01 relation "public.adhdice_health_fitness_goals" does not exist',
    "Could not find the table in the schema cache",
    "PGRST205: Could not find the table 'public.adhdice_health_fitness_goals' in the schema cache",
    'relation "adhdice_health_fitness_goal_levels" does not exist',
  ]) {
    assert.equal(formatHealthFitnessGoalsError(message), HEALTH_FITNESS_GOALS_MIGRATION_MESSAGE);
  }
  assert.equal(formatHealthFitnessGoalsError("permission denied"), "permission denied");
  assert.equal(formatHealthFitnessGoalsError("validation failed"), "validation failed");
  assert.equal(HEALTH_FITNESS_GOALS_MIGRATION_MESSAGE, "Fitness Goals are unavailable until the 7.11.69 Fitness Goals migration is applied.");
  assert.doesNotMatch(hook, /useHealth|adhdice_health_workouts|adhdice_health_workout_exercises|adhdice_health_workout_sets/);
});

test("useFitnessGoals reloads Goals and Levels in parallel with owner scope", () => {
  const reload = hook.slice(hook.indexOf("const reload ="), hook.indexOf("useEffect(() =>"));
  assert.match(hook, /Promise\.all\(\[/);
  assert.match(hook, /from\("adhdice_health_fitness_goals"\)[\s\S]*?\.eq\("user_id", userId\)/);
  assert.match(hook, /from\("adhdice_health_fitness_goal_levels"\)[\s\S]*?\.eq\("user_id", userId\)/);
  assert.match(hook, /order\("archived_at", \{ ascending: true, nullsFirst: true \}\)/);
  assert.match(hook, /order\("sort_order", \{ ascending: true \}\)/);
  assert.match(reload, /reportError\(formatHealthFitnessGoalsError\(firstError\.message\)\)/);
  assert.doesNotMatch(reload, /HEALTH_FITNESS_GOALS_MIGRATION_MESSAGE/);
});

test("useFitnessGoals exposes narrow Goal and Level actions", () => {
  for (const action of ["createGoal", "updateGoal", "archiveGoal", "createLevel", "updateLevel", "deleteLevel", "reorderLevels"]) {
    assert.match(hook, new RegExp(`async function ${action}`));
  }
  assert.match(hook, /validateHealthFitnessGoalTargetAgainstLevels\(goalId, nextDraft\.target, levels\)/);
  assert.match(hook, /validateHealthFitnessGoalLevelDraft\(normalizedInput, goal \?\? null, levels/);
  assert.match(hook, /\.eq\("goal_id", goalId\)/);
  assert.match(hook, /\.eq\("user_id", userId\)/);
});

test("Fitness scope guard accepts only the active current client and user", () => {
  const clientA = {};
  const clientB = {};
  const current = { active: true, client: clientB, userId: "user-b" };
  assert.equal(isCurrentFitnessScope(current, current), true);
  assert.equal(isCurrentFitnessScope({ active: false, client: clientB, userId: "user-b" }, current), false);
  assert.equal(isCurrentFitnessScope(current, { active: false, client: clientB, userId: "user-b" }), false);
  assert.equal(isCurrentFitnessScope({ active: true, client: clientA, userId: "user-b" }, current), false);
  assert.equal(isCurrentFitnessScope({ active: true, client: clientB, userId: "user-a" }, current), false);
});

test("useFitnessGoals reload generations reject stale client, user, inactive, and re-entered results", () => {
  const clientA = {};
  const clientB = {};
  const current = { active: true, client: clientB, userId: "user-b" };
  assert.equal(isCurrentFitnessReloadRequest({ ...current, generation: 2 }, current, 2), true);
  assert.equal(isCurrentFitnessReloadRequest({ ...current, generation: 1 }, current, 2), false);
  assert.equal(isCurrentFitnessReloadRequest({ active: true, client: clientA, generation: 1, userId: "user-a" }, current, 2), false);
  assert.equal(isCurrentFitnessReloadRequest({ active: true, client: clientB, generation: 2, userId: "user-a" }, current, 2), false);
  assert.equal(isCurrentFitnessReloadRequest({ active: false, client: clientB, generation: 2, userId: "user-b" }, current, 2), false);
  assert.match(hook, /const reloadGenerationRef = useRef\(0\)/);
  assert.match(hook, /if \(!isCurrent\(\)\) return false;/);
  assert.match(hook, /setGoals\(\[\]\);\s*setLevels\(\[\]\)/);
});

test("Fitness mutation scope stays current when only reload generation changes", () => {
  const current = { active: true, client: {}, userId: "user-a" };
  for (const reloadGeneration of [2, 3]) {
    assert.equal(isCurrentFitnessScope(current, current), true, `reload generation ${reloadGeneration} must not affect mutation scope`);
  }
});

test("Goal and Level mutations use scope-only guards before state, errors, or follow-up reloads", () => {
  assert.match(hook, /type FitnessMutationScope = FitnessReloadScope<SupabaseClient>/);
  assert.match(hook, /const captureMutationScope = \(\): FitnessMutationScope/);
  assert.match(hook, /const isCurrentMutationScope = \(mutationScope: FitnessMutationScope\) => isCurrentFitnessScope/);
  assert.match(hook, /const reportMutationError = \(mutationScope: FitnessMutationScope, message: string\) => \{[\s\S]*if \(!isCurrentMutationScope\(mutationScope\)\) return false;/);
  assert.doesNotMatch(hook, /FitnessMutationRequest|isCurrentMutationRequest/);

  for (const action of ["createGoal", "updateGoal", "createLevel", "updateLevel", "deleteLevel", "reorderLevels"]) {
    const start = hook.indexOf(`async function ${action}`);
    const end = hook.indexOf("\n  async function", start + 1);
    const section = hook.slice(start, end === -1 ? hook.indexOf("\n  return {", start) : end);
    assert.notEqual(start, -1, `${action} is missing`);
    assert.match(section, /const mutationScope = captureMutationScope\(\)/, `${action} must capture its scope`);
    assert.match(section, /if \(!isCurrentMutationScope\(mutationScope\)\) return (null|false);/, `${action} must ignore stale responses`);
    assert.doesNotMatch(section, /isCurrentFitnessReloadRequest|reloadGenerationRef/, `${action} must not use reload identity`);
  }

  const updateGoal = hook.slice(hook.indexOf("async function updateGoal"), hook.indexOf("\n  async function archiveGoal"));
  assert.match(updateGoal, /await getGoalExercise\(nextDraft\.exercise_id, mutationScope\)/);
  assert.match(updateGoal, /await getGoalExercise\(nextDraft\.exercise_id, mutationScope\)[\s\S]*if \(!exercise \|\| !isCurrentMutationScope\(mutationScope\)\) return false;[\s\S]*const \{ data, error: updateError \}/);
  assert.match(hook, /setGoals\(\(current\) => isCurrentMutationScope\(mutationScope\)/);
  assert.match(hook, /setLevels\(\(current\) => isCurrentMutationScope\(mutationScope\)/);
  assert.match(hook, /async function reloadForMutation\(mutationScope: FitnessMutationScope\)/);
  assert.match(hook, /async function reloadForMutation[\s\S]*if \(!isCurrentMutationScope\(mutationScope\)\) return false;[\s\S]*await reload\(\);[\s\S]*return isCurrentMutationScope\(mutationScope\)/);
  assert.match(hook, /async function archiveGoal\(goalId: string\) \{[\s\S]*return updateGoal\(goalId, \{ archived_at:/);
  assert.match(hook, /async function restoreGoal\(goalId: string\) \{[\s\S]*return updateGoal\(goalId, \{ archived_at: null \}/);
});

test("Goals migration defines configuration-only persistence and owner-safe relationships", () => {
  for (const table of ["adhdice_health_fitness_goals", "adhdice_health_fitness_goal_levels"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon`));
    assert.match(migration, new RegExp(`grant select, insert, update, delete on table public\\.${table} to authenticated`));
    assert.match(migration, new RegExp(`Users can manage their own health fitness ${table.includes("levels") ? "goal levels" : "goals"}`));
    assert.match(migration, new RegExp(`adhdice_${table.replace("adhdice_", "")}.*set_updated_at`));
  }
  assert.match(migration, /foreign key \(user_id, exercise_id\)[\s\S]*references public\.adhdice_health_exercises \(user_id, id\)[\s\S]*on delete restrict/);
  assert.match(migration, /foreign key \(user_id, goal_id\)[\s\S]*references public\.adhdice_health_fitness_goals \(user_id, id\)[\s\S]*on delete cascade/);
  assert.match(migration, /unique \(user_id, goal_id, target\)/);
  assert.match(migration, /metric text not null check \(metric in \('single_set_reps', 'session_total_reps', 'longest_set_duration', 'session_total_duration'\)\)/);
});

test("schema.sql mirrors Goal and Level table constraints, indexes, RLS, grants, and triggers", () => {
  for (const fragment of [
    "adhdice_health_fitness_goals",
    "adhdice_health_fitness_goal_levels",
    "unique (user_id, goal_id, target)",
    "foreign key (user_id, exercise_id)",
    "foreign key (user_id, goal_id)",
    "enable row level security",
    "grant select, insert, update, delete on table public.adhdice_health_fitness_goals to authenticated",
    "grant select, insert, update, delete on table public.adhdice_health_fitness_goal_levels to authenticated",
    "adhdice_health_fitness_goals_set_updated_at",
    "adhdice_health_fitness_goal_levels_set_updated_at",
  ]) {
    assert.match(schema, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(schema, /metric text not null check \(metric in \('single_set_reps', 'session_total_reps', 'longest_set_duration', 'session_total_duration'\)\)/);

  for (const [table, policyName] of [
    ["adhdice_health_fitness_goals", "Users can manage their own health fitness goals"],
    ["adhdice_health_fitness_goal_levels", "Users can manage their own health fitness goal levels"],
  ] as const) {
    const expectedPolicy = `create policy "${policyName}" on public.${table} for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);`;
    for (const source of [migration, schema]) {
      const start = source.indexOf(`create policy "${policyName}"`);
      assert.notEqual(start, -1, `${table} policy is missing`);
      const end = source.indexOf(";", start);
      assert.equal(source.slice(start, end + 1).replace(/\s+/g, " ").trim(), expectedPolicy);
    }
  }
});

test("database types keep one metric union and add both tables", () => {
  const types = readFileSync(new URL("../src/lib/database.types.ts", import.meta.url), "utf8");
  assert.equal((types.match(/export type HealthFitnessPerformanceMetric =/g) ?? []).length, 1);
  for (const name of ["HealthFitnessGoal", "HealthFitnessGoalInsert", "HealthFitnessGoalUpdate", "HealthFitnessGoalLevel", "HealthFitnessGoalLevelInsert", "HealthFitnessGoalLevelUpdate"]) {
    assert.match(types, new RegExp(`export type ${name}`));
  }
  assert.match(types, /adhdice_health_fitness_goals: \{[\s\S]*Row: HealthFitnessGoal/);
  assert.match(types, /adhdice_health_fitness_goal_levels: \{[\s\S]*Row: HealthFitnessGoalLevel/);
});

test("deleting a Level only mutates the Level table and does not touch performance evidence", () => {
  const deleteSection = hook.slice(hook.indexOf("async function deleteLevel"), hook.indexOf("async function reorderLevels"));
  assert.match(deleteSection, /from\("adhdice_health_fitness_goal_levels"\)/);
  assert.doesNotMatch(deleteSection, /adhdice_health_workout/);
});

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { HealthExercise, HealthWorkoutExercise, HealthWorkoutSet } from "@/lib/database.types";
import {
  buildHealthWorkoutExerciseOptions,
  createHealthWorkoutExerciseDraft,
  formatHealthWorkoutDuration,
  getHealthWorkoutStructuredSummary,
  reconcileHealthWorkoutExerciseDraft,
  reconcileHealthWorkoutSetDraft,
  replaceHealthWorkoutExerciseIdentity,
  switchHealthWorkoutMeasurementType,
  validateHealthWorkoutStructuredDraft,
  type HealthWorkoutStructuredDraft,
} from "@/lib/health-fitness-session";
import { buildHealthWorkoutFormPayload } from "@/lib/health-fitness";
import { isCurrentFitnessReloadRequest } from "@/lib/fitness-reload-guard";

const migration = readFileSync(new URL("../supabase/add_health_fitness_sessions_7_11_46.sql", import.meta.url), "utf8");
const sortOrderMigration = readFileSync(new URL("../supabase/add_health_exercise_sort_order_7_11_50.sql", import.meta.url), "utf8");
const indexCorrectionMigration = readFileSync(new URL("../supabase/correct_health_fitness_sessions_index_7_11_46.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const sessionHook = readFileSync(new URL("../src/hooks/useFitnessSessionDetails.ts", import.meta.url), "utf8");
const sessionEditor = readFileSync(new URL("../src/components/task-app/health-fitness-session-editor.tsx", import.meta.url), "utf8");
const exerciseLibrary = readFileSync(new URL("../src/components/task-app/health-fitness-exercise-library.tsx", import.meta.url), "utf8");
const fitnessTab = readFileSync(new URL("../src/components/task-app/health-fitness-tab.tsx", import.meta.url), "utf8");
const taskApp = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const databaseTypes = readFileSync(new URL("../src/lib/database.types.ts", import.meta.url), "utf8");

function libraryExercise(overrides: Partial<HealthExercise> = {}): HealthExercise {
  return {
    archived_at: null,
    created_at: "2026-08-24T12:00:00.000Z",
    default_measurement: "reps",
    id: "exercise-1",
    name: "Push-Ups",
    sort_order: 0,
    updated_at: "2026-08-24T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function draft(overrides: Partial<HealthWorkoutStructuredDraft> = {}): HealthWorkoutStructuredDraft {
  return {
    exercises: [{
      exerciseId: "exercise-1",
      exerciseName: "Push-Ups",
      id: "workout-exercise-1",
      measurementType: "reps",
      notes: "",
      sets: [
        { durationSeconds: "", id: "set-1", notes: "", reps: "12" },
        { durationSeconds: "", id: "set-2", notes: "", reps: "10" },
      ],
    }],
    ...overrides,
  };
}

function workoutExercise(overrides: Partial<HealthWorkoutExercise> = {}): HealthWorkoutExercise {
  return {
    created_at: "2026-08-24T12:00:00.000Z",
    exercise_id: "exercise-1",
    exercise_name: "Push-Ups",
    id: "workout-exercise-1",
    measurement_type: "reps",
    notes: null,
    sort_order: 0,
    updated_at: "2026-08-24T12:00:00.000Z",
    user_id: "user-1",
    workout_id: "workout-1",
    ...overrides,
  };
}

function workoutSet(overrides: Partial<HealthWorkoutSet> = {}): HealthWorkoutSet {
  return {
    created_at: "2026-08-24T12:00:00.000Z",
    duration_seconds: null,
    id: "set-1",
    notes: null,
    reps: 12,
    sort_order: 0,
    updated_at: "2026-08-24T12:00:00.000Z",
    user_id: "user-1",
    workout_exercise_id: "workout-exercise-1",
    ...overrides,
  };
}

test("multiple Exercise Library entries can coexist", () => {
  const entries = [libraryExercise(), libraryExercise({ id: "exercise-2", name: "Squats" })];
  assert.deepEqual(entries.map((entry) => entry.name), ["Push-Ups", "Squats"]);
  assert.doesNotMatch(migration, /unique \(user_id, name\)/);
});

test("Exercise Library keeps default_measurement only for the existing database contract", () => {
  assert.equal(libraryExercise().default_measurement, "reps");
  assert.equal(libraryExercise({ default_measurement: "duration", name: "Plank" }).default_measurement, "duration");
  assert.match(migration, /default_measurement text not null check \(default_measurement in \('reps', 'duration'\)\)/);
  assert.match(sessionHook, /default_measurement: "reps"/);
});

test("Exercise Library sort order is durable, deterministic, and separate from historical snapshots", () => {
  assert.match(sortOrderMigration, /add column if not exists sort_order integer/);
  assert.match(sortOrderMigration, /partition by user_id[\s\S]*order by lower\(trim\(name\)\), created_at, id/);
  assert.match(sortOrderMigration, /row_number\(\) over[\s\S]*\) - 1 as next_sort_order/);
  assert.match(schema, /name text not null[\s\S]*sort_order integer not null default 0 check \(sort_order >= 0\)/);
  assert.match(databaseTypes, /export type HealthExercise = \{[\s\S]*sort_order: number/);
  assert.match(sessionHook, /order\("sort_order", \{ ascending: true \}\)[\s\S]*order\("created_at", \{ ascending: true \}\)[\s\S]*order\("id", \{ ascending: true \}\)/);
  assert.match(sessionHook, /sort_order: nextSortOrder/);
  assert.match(sessionHook, /setExerciseLibrary\(\(current\) => current\.map/);
  assert.match(sessionHook, /async function reorderExercises\(orderedExerciseIds: readonly string\[\]\)/);
  assert.match(sessionHook, /\.update\(\{ sort_order: sortOrder \}\)/);
  assert.match(sessionHook, /await reload\(\);[\s\S]*canonical order was reloaded/);
  assert.doesNotMatch(sessionHook, /setExerciseLibrary\([\s\S]*sort\(\(left, right\) => left\.name/);
});

test("Exercise Library settings expose only name and archive behavior", () => {
  assert.doesNotMatch(exerciseLibrary, /MeasurementSelector|measurementDraft|editingMeasurement|default_measurement:/);
  assert.match(exerciseLibrary, /createExercise\(\{ name: nameDraft \}\)/);
  assert.match(exerciseLibrary, /updateExercise\(exerciseId, \{ name: editingName \}\)/);
});

test("new Workout Exercise drafts default independently to reps and can choose duration", () => {
  const durationLibraryEntry = libraryExercise({ default_measurement: "duration", id: "exercise-duration", name: "Plank" });
  assert.equal(createHealthWorkoutExerciseDraft(durationLibraryEntry).measurementType, "reps");
  assert.equal(createHealthWorkoutExerciseDraft(durationLibraryEntry, "duration").measurementType, "duration");
  assert.match(sessionEditor, /MeasurementToggle ariaLabel="Measurement type for new exercise"/);
  assert.match(sessionEditor, /createHealthWorkoutExerciseDraft\(exercise, measurementToAdd\)/);
});

test("Exercise Library changes do not rewrite historical Workout Exercise snapshots", () => {
  const summary = getHealthWorkoutStructuredSummary("workout-1", [workoutExercise({ measurement_type: "reps" })], [workoutSet()]);
  assert.equal(libraryExercise({ default_measurement: "duration" }).default_measurement, "duration");
  assert.equal(summary[0]?.measurementType, "reps");
});

test("Fitness index correction migration is idempotent and limited to the intended index", () => {
  assert.match(indexCorrectionMigration, /drop index if exists public\.adhdice_health_workout_sets_user_exercise_order_indx/);
  assert.match(indexCorrectionMigration, /create index if not exists adhdice_health_workout_sets_user_exercise_order_idx/);
  assert.doesNotMatch(indexCorrectionMigration, /alter table|drop table|delete from|update public\./i);
});

test("archived exercises are excluded from normal selection", () => {
  assert.match(exerciseLibrary, /exercise\.archived_at === null/);
  assert.match(sessionEditor, /exercise\.archived_at === null/);
  assert.match(migration, /archived_at timestamptz/);
});

test("Workout Exercise selector keeps the current active exercise and active alternatives", () => {
  const pushUps = libraryExercise();
  const planks = libraryExercise({ id: "exercise-2", name: "Planks" });
  const options = buildHealthWorkoutExerciseOptions([pushUps, planks], pushUps.id);
  assert.deepEqual(options, [
    { label: "Push-Ups", value: "exercise-1" },
    { label: "Planks", value: "exercise-2" },
  ]);
  assert.equal(options.find((option) => option.value === "exercise-1")?.label, "Push-Ups");
  assert.match(sessionEditor, /buildHealthWorkoutExerciseOptions\(exerciseLibrary, exercise\.exerciseId\)/);
});

test("Workout Exercise selector keeps an archived current exercise beside active alternatives", () => {
  const archivedPushUps = libraryExercise({ archived_at: "2026-08-25T12:00:00.000Z" });
  const planks = libraryExercise({ id: "exercise-2", name: "Planks" });
  assert.deepEqual(buildHealthWorkoutExerciseOptions([archivedPushUps, planks], archivedPushUps.id), [
    { label: "Push-Ups (archived)", value: "exercise-1" },
    { label: "Planks", value: "exercise-2" },
  ]);
});

test("intentional exercise replacement updates identity without changing measurement or sets", () => {
  const next = libraryExercise({ id: "exercise-2", name: "Planks", default_measurement: "duration" });
  const replaced = replaceHealthWorkoutExerciseIdentity(draft().exercises[0]!, next);
  assert.equal(replaced.exerciseId, "exercise-2");
  assert.equal(replaced.exerciseName, "Planks");
  assert.equal(replaced.measurementType, "reps");
  assert.deepEqual(replaced.sets, draft().exercises[0]?.sets);
  assert.match(sessionEditor, /replaceHealthWorkoutExerciseIdentity\(exercise, nextExercise\)/);
  assert.doesNotMatch(sessionEditor, /measurementType: nextExercise\.default_measurement/);
});

test("Workout Exercise rows expose both measurement choices", () => {
  assert.match(sessionEditor, /ariaLabel=\{`Measurement type for \$\{exercise\.exerciseName\}`\}/);
  assert.match(sessionEditor, /selected=\{value === "reps"\}/);
  assert.match(sessionEditor, /selected=\{value === "duration"\}/);
  assert.match(sessionHook, /measurement_type: draftExercise\.measurementType/);
});

test("switching measurement clears incompatible values but preserves set structure and notes", () => {
  const sets = [
    { durationSeconds: "", id: "set-1", notes: "warmup", reps: "12" },
    { durationSeconds: "", id: "set-2", notes: "hard", reps: "10" },
  ];
  const durationSets = switchHealthWorkoutMeasurementType(sets, "duration");
  assert.deepEqual(durationSets, [
    { durationSeconds: "", id: "set-1", notes: "warmup", reps: "" },
    { durationSeconds: "", id: "set-2", notes: "hard", reps: "" },
  ]);
  const repsSets = switchHealthWorkoutMeasurementType([{ ...durationSets[0]!, durationSeconds: "45" }, { ...durationSets[1]!, durationSeconds: "30" }], "reps");
  assert.deepEqual(repsSets, [
    { durationSeconds: "", id: "set-1", notes: "warmup", reps: "" },
    { durationSeconds: "", id: "set-2", notes: "hard", reps: "" },
  ]);
  assert.match(sessionEditor, /switchHealthWorkoutMeasurementType\(exercise\.sets, measurementType\)/);
});

test("library rename does not rewrite historical Workout Exercise snapshots", () => {
  const summary = getHealthWorkoutStructuredSummary("workout-1", [workoutExercise({ exercise_name: "Push-Ups" })], [workoutSet()]);
  const renamedLibraryEntry = libraryExercise({ name: "Pushups" });
  assert.equal(renamedLibraryEntry.name, "Pushups");
  assert.equal(summary[0]?.exerciseName, "Push-Ups");
});

test("library default-measurement changes do not rewrite historical snapshots", () => {
  const summary = getHealthWorkoutStructuredSummary("workout-1", [workoutExercise({ measurement_type: "reps" })], [workoutSet()]);
  assert.equal(libraryExercise({ default_measurement: "duration" }).default_measurement, "duration");
  assert.equal(summary[0]?.measurementType, "reps");
});

test("one workout can contain multiple Workout Exercises", () => {
  const summaries = getHealthWorkoutStructuredSummary("workout-1", [workoutExercise(), workoutExercise({ id: "workout-exercise-2", exercise_id: "exercise-2", exercise_name: "Squats", sort_order: 1 })], [workoutSet(), workoutSet({ id: "set-2", workout_exercise_id: "workout-exercise-2", reps: 15 })]);
  assert.deepEqual(summaries.map((summary) => summary.exerciseName), ["Push-Ups", "Squats"]);
});

test("one Workout Exercise can contain multiple ordered Sets", () => {
  const summary = getHealthWorkoutStructuredSummary("workout-1", [workoutExercise()], [workoutSet(), workoutSet({ id: "set-2", reps: 10, sort_order: 1 }), workoutSet({ id: "set-3", reps: 8, sort_order: 2 })]);
  assert.deepEqual(summary[0]?.values, ["12 reps", "10 reps", "8 reps"]);
});

test("Set builder renders Add Set after the ordered Set rows", () => {
  const setsStart = sessionEditor.indexOf("{exercise.sets.map");
  const addSetIndex = sessionEditor.indexOf(">Add Set</AdhdChip>", setsStart);
  assert.ok(setsStart >= 0);
  assert.ok(addSetIndex > setsStart);
  assert.match(sessionEditor.slice(setsStart, addSetIndex), /Set \{index \+ 1\}/);
  assert.match(sessionEditor, /sets: \[\.\.\.exercise\.sets, createEmptyHealthWorkoutDraftSet\(\)\]/);
});

test("Workout Types use plain settings rows while Exercises use the shared reorder list", () => {
  assert.match(fitnessTab, /<HealthFitnessReorderList[\s\S]*label="workout type"/);
  assert.match(fitnessTab, /<p className="min-w-0 truncate text-sm font-semibold[\s\S]*>\{type\}<\/p>/);
  assert.doesNotMatch(fitnessTab, /<AdhdChip className="pointer-events-none min-w-0 truncate" tone="purple" type="button">\{type\}<\/AdhdChip>/);
  assert.match(exerciseLibrary, /<HealthFitnessReorderList[\s\S]*getItemId=\{\(exercise\) => exercise\.id\}/);
  assert.match(exerciseLibrary, /onSave=\{reorderExercises\}/);
  assert.match(exerciseLibrary, /archivedExercises\.map\(\(exercise\) => <ExerciseLibraryRow archived/);
});

test("reps exercise accepts ordered positive reps", () => {
  assert.equal(validateHealthWorkoutStructuredDraft(draft(), [libraryExercise()]), null);
});

test("duration exercise accepts ordered positive duration seconds", () => {
  const durationExercise = libraryExercise({ default_measurement: "duration", id: "exercise-duration", name: "Plank" });
  const result = validateHealthWorkoutStructuredDraft({ exercises: [{ ...draft().exercises[0]!, exerciseId: durationExercise.id, exerciseName: durationExercise.name, measurementType: "duration", sets: [{ durationSeconds: "45", id: "set-duration", notes: "", reps: "" }] }] }, [durationExercise]);
  assert.equal(result, null);
});

test("zero and negative reps are rejected", () => {
  for (const reps of ["0", "-1"]) {
    assert.match(validateHealthWorkoutStructuredDraft({ exercises: [{ ...draft().exercises[0]!, sets: [{ durationSeconds: "", id: "set-invalid", notes: "", reps }] }] }, [libraryExercise()]) ?? "", /positive whole-number reps/);
  }
});

test("zero and negative duration are rejected", () => {
  const durationExercise = libraryExercise({ default_measurement: "duration", id: "exercise-duration", name: "Plank" });
  for (const durationSeconds of ["0", "-1"]) {
    assert.match(validateHealthWorkoutStructuredDraft({ exercises: [{ ...draft().exercises[0]!, exerciseId: durationExercise.id, exerciseName: durationExercise.name, measurementType: "duration", sets: [{ durationSeconds, id: "set-invalid", notes: "", reps: "" }] }] }, [durationExercise]) ?? "", /positive duration seconds/);
  }
});

test("a workout with zero structured exercises remains valid", () => {
  assert.equal(validateHealthWorkoutStructuredDraft({ exercises: [] }, [libraryExercise()]), null);
  assert.match(fitnessTab, /structuredDraft\.exercises\.length > 0/);
});

test("Workout Exercises reference the canonical adhdice_health_workouts authority", () => {
  assert.match(migration, /foreign key \(user_id, workout_id\)[\s\S]*references public\.adhdice_health_workouts \(user_id, id\)[\s\S]*on delete cascade/);
  assert.match(schema, /create table public\.adhdice_health_workouts/);
  assert.doesNotMatch(migration, /create table if not exists public\.adhdice_health_sessions/);
});

test("no second workout or session authority is introduced", () => {
  assert.doesNotMatch(migration, /create table if not exists public\.adhdice_health_(sessions|fitness_sessions|workout_sessions)/);
  assert.match(fitnessTab, /saveHealthWorkoutBundle\(/);
  assert.match(fitnessTab, /saveWorkoutSessionDetails/);
});

test("owner-scoped foreign keys prevent cross-user relationships", () => {
  assert.match(migration, /foreign key \(user_id, workout_id\)[\s\S]*references public\.adhdice_health_workouts \(user_id, id\)/);
  assert.match(migration, /foreign key \(user_id, exercise_id\)[\s\S]*references public\.adhdice_health_exercises \(user_id, id\)/);
  assert.match(migration, /foreign key \(user_id, workout_exercise_id\)[\s\S]*references public\.adhdice_health_workout_exercises \(user_id, id\)/);
});

test("RLS and authenticated owner policies exist on every new table", () => {
  for (const table of ["adhdice_health_exercises", "adhdice_health_workout_exercises", "adhdice_health_workout_sets"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`grant select, insert, update, delete on table public\\.${table} to authenticated`));
  }
  assert.match(migration, /to authenticated[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/);
});

test("workout deletion cascades Workout Exercises and Sets", () => {
  assert.match(migration, /references public\.adhdice_health_workouts \(user_id, id\)\s+on delete cascade/);
  assert.match(migration, /references public\.adhdice_health_workout_exercises \(user_id, id\)\s+on delete cascade/);
  assert.match(taskApp, /removeLocalWorkoutSessionDetails\(workoutId\)/);
});

test("Exercise Library archive does not delete historical workout data", () => {
  assert.match(exerciseLibrary, /archiveExercise/);
  assert.match(sessionHook, /archived_at: new Date\(\)\.toISOString\(\)/);
  assert.match(migration, /references public\.adhdice_health_exercises \(user_id, id\)\s+on delete restrict/);
});

test("structured edits use stable IDs and additions/updates before removals", () => {
  assert.match(sessionHook, /\.eq\("id", existing\.id\)/);
  assert.match(sessionHook, /\.update\(toWorkoutExerciseUpdate/);
  assert.match(sessionHook, /\.update\(toWorkoutSetUpdate/);
  assert.match(sessionHook, /failStructuredSave[\s\S]*await reload\(\)/);
  assert.doesNotMatch(sessionHook, /delete\(\)[\s\S]*insert\([\s\S]*delete all/i);
});

test("Structured Fitness reload generations and scopes reject stale responses", () => {
  const clientA = {};
  const clientB = {};
  const current = { active: true, client: clientB, userId: "user-b" };
  assert.equal(isCurrentFitnessReloadRequest({ ...current, generation: 2 }, current, 2), true);
  assert.equal(isCurrentFitnessReloadRequest({ active: true, client: clientA, generation: 1, userId: "user-a" }, current, 2), false);
  assert.equal(isCurrentFitnessReloadRequest({ active: true, client: clientB, generation: 2, userId: "user-a" }, current, 2), false);
  assert.equal(isCurrentFitnessReloadRequest({ active: false, client: clientB, generation: 2, userId: "user-b" }, current, 2), false);
});

test("Structured Fitness guard success, error, loading, and inactive clears to the current request", () => {
  assert.match(sessionHook, /const reloadGenerationRef = useRef\(0\)/);
  assert.match(sessionHook, /const generation = \+\+reloadGenerationRef\.current/);
  assert.match(sessionHook, /if \(!isCurrent\(\)\) return false;/);
  assert.match(sessionHook, /if \(!isCurrent\(\)\) return false;[\s\S]*reportError\(/);
  assert.match(sessionHook, /if \(!active \|\| !userId \|\| !client\) \{[\s\S]*setExerciseLibrary\(\[\]\)[\s\S]*setWorkoutExercises\(\[\]\)[\s\S]*setWorkoutSets\(\[\]\)[\s\S]*setIsLoading\(false\)[\s\S]*setIsLoaded\(false\)/);
  assert.match(sessionHook, /setIsLoading\(false\);\s*setIsLoaded\(true\);\s*setError\(null\)/);
});

test("failed child persistence keeps retry in the existing workout edit flow", () => {
  assert.match(fitnessTab, /bundleSave\.canonicalWorkoutId/);
  assert.match(fitnessTab, /exercise details could not be saved\. Try again\./);
  assert.match(fitnessTab, /editingWorkoutId/);
});

test("a partially saved Workout Exercise is reconciled before child retry", () => {
  const newDraft = draft({ exercises: [{ ...draft().exercises[0]!, id: undefined, sets: [{ durationSeconds: "", id: undefined, notes: "", reps: "12" }, { durationSeconds: "", id: undefined, notes: "", reps: "10" }] }] });
  const afterExerciseInsert = reconcileHealthWorkoutExerciseDraft(newDraft, 0, "persisted-exercise");
  const afterFirstSetInsert = reconcileHealthWorkoutSetDraft(afterExerciseInsert, 0, 0, "persisted-set");
  assert.equal(afterFirstSetInsert.exercises[0]?.id, "persisted-exercise");
  assert.equal(afterFirstSetInsert.exercises[0]?.sets[0]?.id, "persisted-set");
  assert.equal(afterFirstSetInsert.exercises[0]?.sets[1]?.id, undefined);
  assert.equal(afterFirstSetInsert.exercises.filter((exercise) => !exercise.id).length, 0);
  assert.equal(afterFirstSetInsert.exercises[0]?.sets.filter((set) => !set.id).length, 1);
  assert.match(sessionHook, /return \{ draft: reconciledDraft, ok: false \}/);
  assert.match(fitnessTab, /setStructuredDraft\(bundleSave\.draft\)/);
});

test("structured retry reuses reconciled Exercise and Set IDs and the canonical workout edit path", () => {
  const reconciled = reconcileHealthWorkoutSetDraft(
    reconcileHealthWorkoutExerciseDraft(draft({ exercises: [{ ...draft().exercises[0]!, id: undefined, sets: [{ durationSeconds: "", id: undefined, notes: "", reps: "12" }] }] }), 0, "persisted-exercise"),
    0,
    0,
    "persisted-set",
  );
  assert.deepEqual(reconciled.exercises.map((exercise) => exercise.id), ["persisted-exercise"]);
  assert.deepEqual(reconciled.exercises[0]?.sets.map((set) => set.id), ["persisted-set"]);
  assert.match(fitnessTab, /canonicalWorkoutId: editingWorkoutId/);
  assert.match(sessionHook, /reconcileHealthWorkoutExerciseDraft\(reconciledDraft, exerciseIndex, data\.id\)/);
  assert.match(sessionHook, /reconcileHealthWorkoutSetDraft\(reconciledDraft, exerciseIndex, setIndex, data\.id\)/);
  assert.match(sessionHook, /additions\/updates before removals|setsToRemove/);
});

test("Fitness hooks are gated by the existing Health Fitness tab signal", () => {
  assert.match(taskApp, /const fitnessHooksActive = activePage === "Health" && activeHealthTab === "Fitness"/);
  assert.match(taskApp, /useFitnessPlans\([^\n]*fitnessHooksActive\)/);
  assert.match(taskApp, /useFitnessSessionDetails\([^\n]*fitnessHooksActive\)/);
});

test("Fitness Plan associations remain after structured details", () => {
  const structuredIndex = fitnessTab.indexOf("saveWorkoutSessionDetails");
  const planIndex = fitnessTab.indexOf("saveWorkoutPlanItemLinks", structuredIndex);
  assert.ok(structuredIndex >= 0 && planIndex > structuredIndex);
});

test("future workout validation remains intact", () => {
  const result = buildHealthWorkoutFormPayload({ activeCalories: "", date: "2026-08-25", durationMinutes: "30", notes: "", startTime: "", title: "", workoutType: "Strength Training" }, "2026-08-24");
  assert.equal(result.error, "Future workout dates cannot be saved.");
});

test("imported workouts remain non-editable", () => {
  assert.match(fitnessTab, /workout\.source === "manual"/);
  assert.match(fitnessTab, /Imported workout · editing unavailable/);
  assert.match(fitnessTab, /onEdit=\{openEditForm\}/);
});

test("Workout History derives compact structured summaries", () => {
  const summary = getHealthWorkoutStructuredSummary("workout-1", [workoutExercise({ exercise_name: "Plank", measurement_type: "duration" })], [workoutSet({ duration_seconds: 45, reps: null }), workoutSet({ duration_seconds: 40, id: "set-2", reps: null, sort_order: 1 })]);
  assert.deepEqual(summary[0]?.values, ["45s", "40s"]);
  assert.equal(summary[0]?.totalLabel, "Total 1m 25s");
  assert.match(fitnessTab, /structuredSummary\.map/);
  assert.match(fitnessTab, /summary\.totalLabel/);
});

test("Workout History totals preserve individual reps and sum canonical numeric fields", () => {
  const summary = getHealthWorkoutStructuredSummary("workout-1", [workoutExercise()], [
    workoutSet({ reps: 10 }),
    workoutSet({ id: "set-2", reps: 10, sort_order: 1 }),
    workoutSet({ id: "set-3", reps: 10, sort_order: 2 }),
    workoutSet({ id: "set-4", reps: 10, sort_order: 3 }),
  ]);
  assert.deepEqual(summary[0]?.values, ["10 reps", "10 reps", "10 reps", "10 reps"]);
  assert.equal(summary[0]?.totalLabel, "Total 40 reps");
});

test("Workout History duration formatter uses compact human-readable units", () => {
  assert.equal(formatHealthWorkoutDuration(45), "45s");
  assert.equal(formatHealthWorkoutDuration(60), "1m");
  assert.equal(formatHealthWorkoutDuration(65), "1m 5s");
  assert.equal(formatHealthWorkoutDuration(125), "2m 5s");
  assert.equal(formatHealthWorkoutDuration(3600), "1h");
});

test("database types expose the three structured tables without a second workout table", () => {
  assert.match(databaseTypes, /adhdice_health_exercises:/);
  assert.match(databaseTypes, /adhdice_health_workout_exercises:/);
  assert.match(databaseTypes, /adhdice_health_workout_sets:/);
  assert.doesNotMatch(databaseTypes, /adhdice_health_fitness_sessions/);
});

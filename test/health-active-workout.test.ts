import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { HealthWorkout } from "@/lib/database.types";
import {
  addActiveFitnessWorkoutExercise,
  addActiveFitnessWorkoutSet,
  applyActiveFitnessWorkoutFinishResult,
  buildActiveFitnessWorkoutFinishPayload,
  canDiscardActiveFitnessWorkout,
  completeActiveFitnessDurationSet,
  completeActiveFitnessRepsSet,
  createActiveFitnessWorkoutRuntime,
  getActiveFitnessWorkoutElapsedSeconds,
  getActiveFitnessWorkoutTotals,
  getActiveFitnessWorkoutSetElapsedSeconds,
  pauseActiveFitnessWorkout,
  parseActiveFitnessWorkoutRecord,
  readActiveFitnessWorkout,
  reopenActiveFitnessWorkoutSet,
  resumeActiveFitnessWorkout,
  startActiveFitnessDurationSet,
  startOrRestoreActiveFitnessWorkout,
  writeActiveFitnessWorkout,
  type ActiveFitnessWorkoutRuntime,
} from "@/lib/health-active-workout";
import { saveHealthWorkoutBundle } from "@/lib/health-workout-save";

const exercise = { id: "library-push-ups", name: "Push-Ups" };
const durationExercise = { id: "library-plank", name: "Plank" };

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key: string) { return values.get(key) ?? null; },
    removeItem(key: string) { values.delete(key); },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

function repsRuntime() {
  return addActiveFitnessWorkoutExercise(createActiveFitnessWorkoutRuntime("Strength Training", 0), exercise, "reps", 0);
}

function durationRuntime() {
  return addActiveFitnessWorkoutExercise(createActiveFitnessWorkoutRuntime("Strength Training", 0), durationExercise, "duration", 0);
}

test("starting creates one running runtime and an existing runtime is restored", () => {
  const created = createActiveFitnessWorkoutRuntime("Walking", 1_000, ["plan-1"]);
  assert.equal(created.state, "running");
  assert.equal(created.workoutStartedAt, iso(1_000));
  assert.deepEqual(created.selectedPlanItemIds, ["plan-1"]);
  assert.strictEqual(startOrRestoreActiveFitnessWorkout(created, "Running", 20_000), created);
});

test("overall elapsed time derives from accumulated seconds plus the active timestamp segment", () => {
  const runtime = { ...createActiveFitnessWorkoutRuntime("Walking", 0), accumulatedSeconds: 12, currentRunStartedAt: iso(20_000) };
  assert.equal(getActiveFitnessWorkoutElapsedSeconds(runtime, 23_900), 15);
});

test("pausing freezes the authoritative overall duration and pauses a running duration Set", () => {
  const runningSet = startActiveFitnessDurationSet(durationRuntime(), "runtime-exercise-missing", "runtime-set-missing", 1_000);
  const withSet = addActiveFitnessWorkoutSet(runningSet, runningSet.exercises[0]!.runtimeExerciseId, 1_000);
  const setId = withSet.exercises[0]!.sets[1]!.runtimeSetId;
  const running = startActiveFitnessDurationSet(withSet, withSet.exercises[0]!.runtimeExerciseId, setId, 2_000);
  const paused = pauseActiveFitnessWorkout(running, 7_500);
  assert.equal(paused.state, "paused");
  assert.equal(paused.currentRunStartedAt, null);
  assert.equal(getActiveFitnessWorkoutElapsedSeconds(paused, 99_000), 7);
  assert.equal(paused.exercises[0]!.sets[1]!.currentRunStartedAt, null);
  assert.equal(getActiveFitnessWorkoutSetElapsedSeconds(paused.exercises[0]!.sets[1]!, 99_000), 5);
});

test("resume starts a new overall running segment without automatically resuming a Set", () => {
  const runtime = pauseActiveFitnessWorkout(createActiveFitnessWorkoutRuntime("Walking", 0), 5_000);
  const resumed = resumeActiveFitnessWorkout(runtime, 9_000);
  assert.equal(resumed.state, "running");
  assert.equal(resumed.currentRunStartedAt, iso(9_000));
  assert.equal(resumed.accumulatedSeconds, 5);
  assert.equal(resumed.exercises.length, 0);
});

test("runtime storage is per-user and reload reconstruction preserves timestamps", () => {
  const store = storage();
  const runtime = createActiveFitnessWorkoutRuntime("Walking", 10_000);
  writeActiveFitnessWorkout(store, "user-a", runtime);
  assert.equal(readActiveFitnessWorkout(store, "user-b"), null);
  assert.deepEqual(readActiveFitnessWorkout(store, "user-a"), runtime);
  assert.equal(getActiveFitnessWorkoutElapsedSeconds(readActiveFitnessWorkout(store, "user-a")!, 15_000), 5);
});

test("malformed runtime JSON is safely rejected and only the active-user record is removed", () => {
  const store = storage();
  writeActiveFitnessWorkout(store, "user-a", createActiveFitnessWorkoutRuntime("Walking", 0));
  store.setItem("adhdice-health-active-workout:user-a", "not-json");
  store.setItem("adhdice-health-active-workout:user-b", "not-json");
  assert.equal(readActiveFitnessWorkout(store, "user-a"), null);
  assert.equal(store.getItem("adhdice-health-active-workout:user-a"), null);
  assert.equal(store.getItem("adhdice-health-active-workout:user-b"), "not-json");
  assert.equal(parseActiveFitnessWorkoutRecord("{}"), null);
});

test("Reps Set completion requires positive whole-number reps and incomplete Sets do not total", () => {
  const runtime = repsRuntime();
  const exerciseId = runtime.exercises[0]!.runtimeExerciseId;
  const setId = runtime.exercises[0]!.sets[0]!.runtimeSetId;
  const invalid = completeActiveFitnessRepsSet(runtime, exerciseId, setId, 1_000);
  assert.match(invalid.error ?? "", /positive whole-number reps/);
  const withValue = { ...runtime, exercises: runtime.exercises.map((candidate) => ({ ...candidate, sets: candidate.sets.map((set) => ({ ...set, reps: "12" })) })) };
  const completed = completeActiveFitnessRepsSet(withValue, exerciseId, setId, 1_000).runtime;
  assert.equal(completed.exercises[0]!.sets[0]!.completed, true);
  assert.deepEqual(getActiveFitnessWorkoutTotals(completed.exercises[0]!, 2_000), { completedSets: 1, totalDurationSeconds: 0, totalReps: 12 });
});

test("Duration Set pause/resume derives elapsed time from timestamps and completion freezes it", () => {
  const runtime = durationRuntime();
  const exerciseId = runtime.exercises[0]!.runtimeExerciseId;
  const setId = runtime.exercises[0]!.sets[0]!.runtimeSetId;
  const started = startActiveFitnessDurationSet(runtime, exerciseId, setId, 1_000);
  assert.equal(getActiveFitnessWorkoutSetElapsedSeconds(started.exercises[0]!.sets[0]!, 6_000), 5);
  const paused = pauseActiveFitnessWorkout(started, 6_000);
  const resumed = startActiveFitnessDurationSet(resumeActiveFitnessWorkout(paused, 9_000), exerciseId, setId, 9_000);
  assert.equal(getActiveFitnessWorkoutSetElapsedSeconds(resumed.exercises[0]!.sets[0]!, 12_000), 8);
  const completed = completeActiveFitnessDurationSet(resumed, exerciseId, setId, 12_000);
  assert.equal(completed.error, undefined);
  assert.equal(completed.runtime.exercises[0]!.sets[0]!.completed, true);
  assert.equal(completed.runtime.exercises[0]!.sets[0]!.currentRunStartedAt, null);
});

test("starting another Duration Set pauses the previous Set", () => {
  let runtime = durationRuntime();
  const exerciseId = runtime.exercises[0]!.runtimeExerciseId;
  runtime = addActiveFitnessWorkoutSet(runtime, exerciseId, 0);
  const firstSetId = runtime.exercises[0]!.sets[0]!.runtimeSetId;
  const secondSetId = runtime.exercises[0]!.sets[1]!.runtimeSetId;
  runtime = startActiveFitnessDurationSet(runtime, exerciseId, firstSetId, 1_000);
  runtime = startActiveFitnessDurationSet(runtime, exerciseId, secondSetId, 4_000);
  assert.equal(runtime.exercises[0]!.sets[0]!.currentRunStartedAt, null);
  assert.equal(runtime.exercises[0]!.sets[0]!.accumulatedSeconds, 3);
  assert.equal(runtime.exercises[0]!.sets[1]!.currentRunStartedAt, iso(4_000));
});

test("overall pause pauses a running Set and overall resume does not resume it", () => {
  let runtime = durationRuntime();
  const exerciseId = runtime.exercises[0]!.runtimeExerciseId;
  const setId = runtime.exercises[0]!.sets[0]!.runtimeSetId;
  runtime = startActiveFitnessDurationSet(runtime, exerciseId, setId, 1_000);
  runtime = pauseActiveFitnessWorkout(runtime, 5_000);
  runtime = resumeActiveFitnessWorkout(runtime, 8_000);
  assert.equal(runtime.exercises[0]!.sets[0]!.currentRunStartedAt, null);
  assert.equal(runtime.currentRunStartedAt, iso(8_000));
});

test("Finish uses original start time, excludes paused time, and omits unfinished or empty exercises", () => {
  let runtime = repsRuntime();
  const repsExerciseId = runtime.exercises[0]!.runtimeExerciseId;
  const repsSet = runtime.exercises[0]!.sets[0]!.runtimeSetId;
  runtime = { ...runtime, title: "Morning Strength", notes: "Keep form steady" };
  runtime = updateReps(runtime, repsExerciseId, repsSet, "12");
  runtime = completeActiveFitnessRepsSet(runtime, repsExerciseId, repsSet, 5_000).runtime;
  runtime = addActiveFitnessWorkoutExercise(runtime, durationExercise, "duration", 5_000);
  const emptyDuration = runtime.exercises[1]!.runtimeExerciseId;
  runtime = pauseActiveFitnessWorkout(runtime, 8_000);
  const payload = buildActiveFitnessWorkoutFinishPayload(runtime, 10_000);
  assert.equal(payload.workout.started_at, iso(0));
  assert.equal(payload.workout.ended_at, iso(10_000));
  assert.equal(payload.workout.duration_seconds, 8);
  assert.equal(payload.workout.title, "Morning Strength");
  assert.equal(payload.structuredDraft.exercises.length, 1);
  assert.equal(payload.structuredDraft.exercises[0]!.sets[0]!.reps, "12");
  assert.notEqual(payload.structuredDraft.exercises[0]!.exerciseId, emptyDuration);
});

test("reopening a Set removes sandbox completion without deleting its identity", () => {
  let runtime = repsRuntime();
  const exerciseId = runtime.exercises[0]!.runtimeExerciseId;
  const setId = runtime.exercises[0]!.sets[0]!.runtimeSetId;
  runtime = updateReps(runtime, exerciseId, setId, "10");
  runtime = completeActiveFitnessRepsSet(runtime, exerciseId, setId, 1_000).runtime;
  const reopened = reopenActiveFitnessWorkoutSet(runtime, exerciseId, setId, 2_000);
  assert.equal(reopened.exercises[0]!.sets[0]!.completed, false);
  assert.equal(reopened.exercises[0]!.sets[0]!.runtimeSetId, setId);
});

test("Discard is allowed before canonical creation and blocked after partial canonicalization", () => {
  const runtime = createActiveFitnessWorkoutRuntime("Walking", 0);
  assert.equal(canDiscardActiveFitnessWorkout(runtime), true);
  assert.equal(canDiscardActiveFitnessWorkout({ ...runtime, canonicalWorkoutId: "workout-1" }), false);
});

test("successful Finish clears the temporary runtime while partial Finish retains it", () => {
  const runtime = createActiveFitnessWorkoutRuntime("Walking", 0);
  assert.equal(applyActiveFitnessWorkoutFinishResult(runtime, { canonicalWorkoutId: "workout-1", ok: true }), null);
  assert.equal(applyActiveFitnessWorkoutFinishResult(runtime, { canonicalWorkoutId: "workout-1", ok: false })?.canonicalWorkoutId, "workout-1");
});

test("canonical bundle saves Workout, structured details, and Plan links in order", async () => {
  const calls: string[] = [];
  const result = await saveHealthWorkoutBundle({
    addWorkout: async (input) => { calls.push("workout"); return healthWorkout(input.id ?? "workout-1"); },
    draft: { exercises: [] },
    planItemIds: ["plan-item-1"],
    saveWorkoutPlanItemLinks: async () => { calls.push("plans"); return true; },
    saveWorkoutSessionDetails: async () => { calls.push("structured"); return { draft: { exercises: [] }, ok: true }; },
    workout: { duration_seconds: 60, title: "Walking", workout_date: "2026-08-25", workout_type: "Walking" },
    updateWorkout: async () => true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["workout", "structured", "plans"]);
});

test("structured failure retains canonical identity and retry updates instead of creating a second Workout", async () => {
  let creates = 0;
  let updates = 0;
  let structuredAttempts = 0;
  const input = { duration_seconds: 60, id: "runtime-1", title: "Walking", workout_date: "2026-08-25", workout_type: "Walking" };
  const first = await saveHealthWorkoutBundle({
    addWorkout: async () => { creates += 1; return healthWorkout("workout-1"); },
    draft: { exercises: [] },
    planItemIds: [],
    saveWorkoutPlanItemLinks: async () => true,
    saveWorkoutSessionDetails: async () => { structuredAttempts += 1; return { draft: { exercises: [] }, ok: false }; },
    workout: input,
    updateWorkout: async () => { updates += 1; return true; },
  });
  assert.equal(first.ok, false);
  assert.equal(first.canonicalWorkoutId, "workout-1");
  const retry = await saveHealthWorkoutBundle({
    addWorkout: async () => { creates += 1; return healthWorkout("workout-2"); },
    canonicalWorkoutId: first.canonicalWorkoutId,
    draft: first.draft,
    planItemIds: [],
    saveWorkoutPlanItemLinks: async () => true,
    saveWorkoutSessionDetails: async () => { structuredAttempts += 1; return { draft: { exercises: [] }, ok: true }; },
    workout: input,
    updateWorkout: async () => { updates += 1; return true; },
  });
  assert.equal(retry.ok, true);
  assert.equal(creates, 1);
  assert.equal(updates, 1);
  assert.equal(structuredAttempts, 2);
});

test("Plan-link failure retains canonical identity and a later successful retry finally clears the bundle", async () => {
  let creates = 0;
  let updates = 0;
  let planAttempts = 0;
  const input = { duration_seconds: 60, id: "runtime-2", title: "Walking", workout_date: "2026-08-25", workout_type: "Walking" };
  const first = await saveHealthWorkoutBundle({
    addWorkout: async () => { creates += 1; return healthWorkout("workout-2"); },
    draft: { exercises: [] },
    planItemIds: ["plan-item-1"],
    saveWorkoutPlanItemLinks: async () => { planAttempts += 1; return false; },
    saveWorkoutSessionDetails: async () => ({ draft: { exercises: [] }, ok: true }),
    workout: input,
    updateWorkout: async () => { updates += 1; return true; },
  });
  assert.equal(first.ok, false);
  const retry = await saveHealthWorkoutBundle({
    addWorkout: async () => { creates += 1; return healthWorkout("workout-3"); },
    canonicalWorkoutId: first.canonicalWorkoutId,
    draft: first.draft,
    planItemIds: ["plan-item-1"],
    saveWorkoutPlanItemLinks: async () => { planAttempts += 1; return true; },
    saveWorkoutSessionDetails: async () => ({ draft: { exercises: [] }, ok: true }),
    workout: input,
    updateWorkout: async () => { updates += 1; return true; },
  });
  assert.equal(retry.ok, true);
  assert.equal(creates, 1);
  assert.equal(updates, 1);
  assert.equal(planAttempts, 2);
});

function updateReps(runtime: ActiveFitnessWorkoutRuntime, exerciseId: string, setId: string, reps: string) {
  return {
    ...runtime,
    exercises: runtime.exercises.map((exercise) => exercise.runtimeExerciseId === exerciseId
      ? { ...exercise, sets: exercise.sets.map((set) => set.runtimeSetId === setId ? { ...set, reps } : set) }
      : exercise),
  };
}

function healthWorkout(id: string): HealthWorkout {
  return {
    active_calories: null,
    created_at: iso(0),
    duration_seconds: 60,
    ended_at: null,
    id,
    notes: "",
    source: "manual",
    source_external_id: null,
    started_at: null,
    title: "Walking",
    updated_at: iso(0),
    user_id: "user-1",
    workout_date: "2026-08-25",
    workout_type: "Walking",
  };
}

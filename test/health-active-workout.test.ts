import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { HealthWorkout } from "@/lib/database.types";
import {
  addActiveFitnessWorkoutExercise,
  addActiveFitnessWorkoutSet,
  applyActiveFitnessWorkoutFinishResult,
  buildActiveFitnessWorkoutTypeOptions,
  buildActiveFitnessWorkoutFinishPayload,
  canResumeActiveFitnessWorkout,
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
  updateActiveFitnessWorkoutDetails,
  writeActiveFitnessWorkout,
  type ActiveFitnessWorkoutRuntime,
} from "@/lib/health-active-workout";
import { saveHealthWorkoutBundle } from "@/lib/health-workout-save";

const activeWorkoutSource = readFileSync(new URL("../src/components/task-app/health-active-workout.tsx", import.meta.url), "utf8");
const activeWorkoutHookSource = readFileSync(new URL("../src/hooks/useActiveFitnessWorkout.ts", import.meta.url), "utf8");

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
  assert.equal(canResumeActiveFitnessWorkout(runtime), true);
  const resumed = resumeActiveFitnessWorkout(runtime, 9_000);
  assert.equal(resumed.state, "running");
  assert.equal(resumed.currentRunStartedAt, iso(9_000));
  assert.equal(resumed.accumulatedSeconds, 5);
  assert.equal(resumed.exercises.length, 0);
});

test("a failed parent Finish remains resumable and clears its obsolete finish timestamp", () => {
  const paused = pauseActiveFitnessWorkout(createActiveFitnessWorkoutRuntime("Walking", 0), 5_000);
  const attempted = buildActiveFitnessWorkoutFinishPayload(paused, 10_000);
  const retained = applyActiveFitnessWorkoutFinishResult(paused, { canonicalWorkoutId: null, ok: false })!;
  const failed = { ...retained, finishAttemptedAt: attempted.runtime.finishAttemptedAt };
  assert.equal(canResumeActiveFitnessWorkout(failed), true);
  const resumed = resumeActiveFitnessWorkout(failed, 20_000);
  assert.equal(resumed.finishAttemptedAt, undefined);
  assert.equal(resumed.accumulatedSeconds, 5);
  assert.equal(resumed.currentRunStartedAt, iso(20_000));
  assert.equal(buildActiveFitnessWorkoutFinishPayload(resumed, 30_000).workout.ended_at, iso(30_000));
  assert.equal(buildActiveFitnessWorkoutFinishPayload(resumed, 30_000).workout.duration_seconds, 15);
});

test("canonicalized partial Finish locks overall and Duration Set timing", () => {
  let runtime = durationRuntime();
  const exerciseId = runtime.exercises[0]!.runtimeExerciseId;
  const setId = runtime.exercises[0]!.sets[0]!.runtimeSetId;
  runtime = startActiveFitnessDurationSet(runtime, exerciseId, setId, 1_000);
  runtime = pauseActiveFitnessWorkout(runtime, 5_000);
  const attempted = buildActiveFitnessWorkoutFinishPayload(runtime, 10_000);
  const retained = applyActiveFitnessWorkoutFinishResult(attempted.runtime, { canonicalWorkoutId: "workout-locked", ok: false })!;
  assert.equal(canResumeActiveFitnessWorkout(retained), false);
  assert.strictEqual(resumeActiveFitnessWorkout(retained, 20_000), retained);
  assert.equal(getActiveFitnessWorkoutElapsedSeconds(retained, 100_000), attempted.workout.duration_seconds);
  assert.equal(getActiveFitnessWorkoutSetElapsedSeconds(retained.exercises[0]!.sets[0]!, 100_000), 4);
  assert.strictEqual(startActiveFitnessDurationSet(retained, exerciseId, setId, 100_000), retained);
});

test("Active Workout Workout Type options preserve configured and removed historical values without duplicates", () => {
  assert.deepEqual(buildActiveFitnessWorkoutTypeOptions("Walking", ["Walking", "Strength"]), [
    { label: "Walking", value: "Walking" },
    { label: "Strength", value: "Strength" },
  ]);
  assert.deepEqual(buildActiveFitnessWorkoutTypeOptions("Cardio", ["Walking", "Strength", "Walking"]), [
    { label: "Walking", value: "Walking" },
    { label: "Strength", value: "Strength" },
    { label: "Cardio (removed)", value: "Cardio" },
  ]);
  const changed = updateActiveFitnessWorkoutDetails(createActiveFitnessWorkoutRuntime("Cardio", 0), { workoutType: "Walking" });
  assert.equal(changed.workoutType, "Walking");
  assert.deepEqual(buildActiveFitnessWorkoutTypeOptions(changed.workoutType, ["Walking", "Strength"]), [
    { label: "Walking", value: "Walking" },
    { label: "Strength", value: "Strength" },
  ]);
  assert.match(activeWorkoutSource, /buildActiveFitnessWorkoutTypeOptions\(runtime\?\.workoutType/);
  assert.match(activeWorkoutSource, /options=\{activeWorkoutTypeOptions\}/);
});

test("Active Workout controller and UI enforce the canonical timing lock", () => {
  assert.match(activeWorkoutHookSource, /if \(runtime\?\.canonicalWorkoutId\) \{[\s\S]*ACTIVE_FITNESS_WORKOUT_TIMING_LOCKED_MESSAGE/);
  assert.match(activeWorkoutHookSource, /if \(!canResumeActiveFitnessWorkout\(runtime\)\) return;/);
  assert.match(activeWorkoutSource, /const canResume = canResumeActiveFitnessWorkout\(runtime\)/);
  assert.match(activeWorkoutSource, /Retry Finish Workout/);
  assert.match(activeWorkoutSource, /Workout timing is locked because the workout log was already created/);
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

test("partial structured Finish freezes its original timestamp and duration for retry", async () => {
  const paused = pauseActiveFitnessWorkout(createActiveFitnessWorkoutRuntime("Walking", 0), 5_000);
  const firstPayload = buildActiveFitnessWorkoutFinishPayload(paused, 10_000);
  const first = await saveHealthWorkoutBundle({
    addWorkout: async () => healthWorkout("workout-1"),
    draft: firstPayload.structuredDraft,
    planItemIds: [],
    saveWorkoutPlanItemLinks: async () => true,
    saveWorkoutSessionDetails: async () => ({ draft: firstPayload.structuredDraft, ok: false }),
    workout: firstPayload.workout,
    updateWorkout: async () => true,
  });
  const retained = applyActiveFitnessWorkoutFinishResult(firstPayload.runtime, first)!;
  const retryPayload = buildActiveFitnessWorkoutFinishPayload(retained, 50_000);
  assert.equal(retained.canonicalWorkoutId, "workout-1");
  assert.equal(retryPayload.runtime.finishAttemptedAt, firstPayload.runtime.finishAttemptedAt);
  assert.equal(retryPayload.workout.ended_at, firstPayload.workout.ended_at);
  assert.equal(retryPayload.workout.duration_seconds, firstPayload.workout.duration_seconds);
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

test("partial Plan-link Finish freezes timing while retry reuses the canonical Workout", async () => {
  let creates = 0;
  let updates = 0;
  const paused = pauseActiveFitnessWorkout(createActiveFitnessWorkoutRuntime("Walking", 0), 5_000);
  const firstPayload = buildActiveFitnessWorkoutFinishPayload(paused, 10_000);
  const first = await saveHealthWorkoutBundle({
    addWorkout: async (input) => { creates += 1; return healthWorkout(input.id ?? "workout-1"); },
    draft: firstPayload.structuredDraft,
    planItemIds: ["plan-item-1"],
    saveWorkoutPlanItemLinks: async () => false,
    saveWorkoutSessionDetails: async () => ({ draft: firstPayload.structuredDraft, ok: true }),
    shouldSaveStructuredDetails: false,
    workout: firstPayload.workout,
    updateWorkout: async () => { updates += 1; return true; },
  });
  const retained = applyActiveFitnessWorkoutFinishResult(firstPayload.runtime, first)!;
  const retryPayload = buildActiveFitnessWorkoutFinishPayload(retained, 50_000);
  const retry = await saveHealthWorkoutBundle({
    addWorkout: async () => { creates += 1; return healthWorkout("workout-2"); },
    canonicalWorkoutId: retained.canonicalWorkoutId,
    draft: retryPayload.structuredDraft,
    planItemIds: ["plan-item-1"],
    saveWorkoutPlanItemLinks: async () => true,
    saveWorkoutSessionDetails: async () => ({ draft: retryPayload.structuredDraft, ok: true }),
    shouldSaveStructuredDetails: false,
    workout: retryPayload.workout,
    updateWorkout: async () => { updates += 1; return true; },
  });
  assert.equal(retry.ok, true);
  assert.equal(creates, 1);
  assert.equal(updates, 1);
  assert.equal(retryPayload.workout.ended_at, firstPayload.workout.ended_at);
  assert.equal(retryPayload.workout.duration_seconds, firstPayload.workout.duration_seconds);
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

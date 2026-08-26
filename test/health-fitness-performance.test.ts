import { strict as assert } from "node:assert";
import { test } from "node:test";

import type {
  HealthFitnessGoal,
  HealthFitnessGoalLevel,
  HealthWorkout,
  HealthWorkoutExercise,
  HealthWorkoutSet,
} from "@/lib/database.types";
import {
  deriveHealthFitnessPerformanceObservations,
  findFirstHealthFitnessThresholdReachedEvidence,
  getHealthFitnessCurrentPersonalRecord,
  getHealthFitnessGoalLevelStatuses,
  getHealthFitnessGoalStatus,
  getHealthFitnessPersonalRecordHistory,
} from "@/lib/health-fitness-performance";

const userId = "user-1";

function workout(overrides: Partial<HealthWorkout> = {}): HealthWorkout {
  return {
    active_calories: null,
    created_at: "2026-08-01T08:00:00.000Z",
    duration_seconds: 1800,
    ended_at: null,
    id: "workout-1",
    notes: "",
    source: "manual",
    source_external_id: null,
    started_at: null,
    title: "Workout",
    updated_at: "2026-08-01T08:00:00.000Z",
    user_id: userId,
    workout_date: "2026-08-01",
    workout_type: "Strength",
    ...overrides,
  };
}

function workoutExercise(overrides: Partial<HealthWorkoutExercise> = {}): HealthWorkoutExercise {
  return {
    created_at: "2026-08-01T08:01:00.000Z",
    exercise_id: "exercise-1",
    exercise_name: "Push-ups",
    id: "workout-exercise-1",
    measurement_type: "reps",
    notes: null,
    sort_order: 0,
    updated_at: "2026-08-01T08:01:00.000Z",
    user_id: userId,
    workout_id: "workout-1",
    ...overrides,
  };
}

function workoutSet(overrides: Partial<HealthWorkoutSet> = {}): HealthWorkoutSet {
  return {
    created_at: "2026-08-01T08:02:00.000Z",
    duration_seconds: null,
    id: "set-1",
    notes: null,
    reps: 10,
    sort_order: 0,
    updated_at: "2026-08-01T08:02:00.000Z",
    user_id: userId,
    workout_exercise_id: "workout-exercise-1",
    ...overrides,
  };
}

function goal(overrides: Partial<HealthFitnessGoal> = {}): HealthFitnessGoal {
  return {
    archived_at: null,
    created_at: "2026-08-20T12:00:00.000Z",
    exercise_id: "exercise-1",
    id: "goal-1",
    metric: "session_total_reps",
    target: 50,
    title: "Reach 50 push-ups",
    updated_at: "2026-08-20T12:00:00.000Z",
    user_id: userId,
    ...overrides,
  };
}

function level(overrides: Partial<HealthFitnessGoalLevel> = {}): HealthFitnessGoalLevel {
  return {
    created_at: "2026-08-20T12:00:00.000Z",
    goal_id: "goal-1",
    id: "level-1",
    label: "First milestone",
    sort_order: 0,
    target: 25,
    updated_at: "2026-08-20T12:00:00.000Z",
    user_id: userId,
    ...overrides,
  };
}

test("reps Sets create single-set observations", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [workout()],
    [workoutExercise()],
    [workoutSet({ reps: 12 })],
  );
  const single = observations.find((observation) => observation.metric === "single_set_reps");
  assert.equal(single?.value, 12);
  assert.equal(single?.setId, "set-1");
});

test("duration Sets create longest-set observations in seconds", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [workout()],
    [workoutExercise({ measurement_type: "duration" })],
    [workoutSet({ duration_seconds: 90, reps: null })],
  );
  const longest = observations.find((observation) => observation.metric === "longest_set_duration");
  assert.equal(longest?.value, 90);
});

test("measurement families never cross-create metrics", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [workout()],
    [
      workoutExercise({ id: "reps-exercise", measurement_type: "reps" }),
      workoutExercise({ id: "duration-exercise", measurement_type: "duration", sort_order: 1 }),
    ],
    [
      workoutSet({ id: "duration-set", workout_exercise_id: "duration-exercise", reps: null, duration_seconds: 30 }),
      workoutSet({ id: "reps-set", workout_exercise_id: "reps-exercise", reps: 8 }),
    ],
  );
  assert.deepEqual(
    [...new Set(observations.map((observation) => observation.metric))].sort(),
    ["longest_set_duration", "session_total_duration", "session_total_reps", "single_set_reps"].sort(),
  );
  assert.equal(observations.some((observation) => observation.metric === "single_set_reps" && observation.value === 30), false);
  assert.equal(observations.some((observation) => observation.metric === "longest_set_duration" && observation.value === 8), false);
});

test("session totals sum all matching Sets and repeated exercise occurrences in one Workout", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [workout()],
    [
      workoutExercise({ id: "occurrence-1", sort_order: 0 }),
      workoutExercise({ id: "occurrence-2", sort_order: 1, created_at: "2026-08-01T08:03:00.000Z" }),
    ],
    [
      workoutSet({ id: "set-1", workout_exercise_id: "occurrence-1", reps: 10 }),
      workoutSet({ id: "set-2", workout_exercise_id: "occurrence-1", reps: 10, sort_order: 1 }),
      workoutSet({ id: "set-3", workout_exercise_id: "occurrence-2", reps: 8 }),
    ],
  );
  const totals = observations.filter((observation) => observation.metric === "session_total_reps");
  assert.equal(totals.length, 1);
  assert.equal(totals[0]?.value, 28);
  assert.deepEqual(totals[0]?.workoutExerciseIds, ["occurrence-1", "occurrence-2"]);
  assert.deepEqual(totals[0]?.setIds, ["set-1", "set-2", "set-3"]);
});

test("different Exercise Library IDs never combine, even with the same name snapshot", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [workout()],
    [
      workoutExercise({ id: "occurrence-1", exercise_id: "exercise-1", exercise_name: "Push-ups" }),
      workoutExercise({ id: "occurrence-2", exercise_id: "exercise-2", exercise_name: "Push-ups", sort_order: 1 }),
    ],
    [
      workoutSet({ id: "set-1", workout_exercise_id: "occurrence-1", reps: 10 }),
      workoutSet({ id: "set-2", workout_exercise_id: "occurrence-2", reps: 20 }),
    ],
  );
  const totals = observations.filter((observation) => observation.metric === "session_total_reps");
  assert.deepEqual(totals.map((observation) => [observation.exerciseId, observation.value]), [["exercise-1", 10], ["exercise-2", 20]]);
});

test("renaming the Workout Exercise snapshot does not change identity", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [workout()],
    [
      workoutExercise({ id: "occurrence-1", exercise_name: "Old name" }),
      workoutExercise({ id: "occurrence-2", exercise_name: "Renamed snapshot", sort_order: 1 }),
    ],
    [
      workoutSet({ id: "set-1", workout_exercise_id: "occurrence-1", reps: 6 }),
      workoutSet({ id: "set-2", workout_exercise_id: "occurrence-2", reps: 7 }),
    ],
  );
  assert.equal(observations.find((observation) => observation.metric === "session_total_reps")?.value, 13);
});

test("session total duration sums duration Sets", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [workout()],
    [workoutExercise({ measurement_type: "duration" })],
    [
      workoutSet({ id: "duration-1", duration_seconds: 30, reps: null }),
      workoutSet({ id: "duration-2", duration_seconds: 45, reps: null, sort_order: 1 }),
    ],
  );
  assert.equal(observations.find((observation) => observation.metric === "session_total_duration")?.value, 75);
});

test("malformed and nonpositive evidence is ignored defensively", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [workout()],
    [workoutExercise()],
    [
      workoutSet({ id: "zero", reps: 0 }),
      workoutSet({ id: "negative", reps: -1 }),
      workoutSet({ id: "mixed", reps: 10, duration_seconds: 20 }),
      workoutSet({ id: "duration-only", reps: null, duration_seconds: 10 }),
    ],
  );
  assert.equal(observations.length, 0);
});

test("orphan Sets and orphan Workout Exercises are ignored", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [workout()],
    [workoutExercise({ workout_id: "missing-workout" })],
    [workoutSet({ workout_exercise_id: "missing-workout-exercise" })],
  );
  assert.deepEqual(observations, []);
});

test("current PR returns the maximum and a tied maximum keeps earliest evidence", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [
      workout({ id: "workout-early", workout_date: "2026-08-01", created_at: "2026-08-01T08:00:00.000Z" }),
      workout({ id: "workout-late", workout_date: "2026-08-02", created_at: "2026-08-02T08:00:00.000Z" }),
    ],
    [
      workoutExercise({ workout_id: "workout-early" }),
      workoutExercise({ id: "workout-exercise-2", workout_id: "workout-late" }),
    ],
    [
      workoutSet({ id: "early-set", reps: 20 }),
      workoutSet({ id: "late-set", workout_exercise_id: "workout-exercise-2", reps: 20 }),
    ],
  );
  const current = getHealthFitnessCurrentPersonalRecord(observations, "exercise-1", "single_set_reps");
  assert.equal(current?.value, 20);
  assert.equal(current?.setId, "early-set");
});

test("PR history contains only strict improvements", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [
      workout({ id: "w1", workout_date: "2026-08-01" }),
      workout({ id: "w2", workout_date: "2026-08-02" }),
      workout({ id: "w3", workout_date: "2026-08-03" }),
      workout({ id: "w4", workout_date: "2026-08-04" }),
      workout({ id: "w5", workout_date: "2026-08-05" }),
    ],
    [
      workoutExercise({ workout_id: "w1" }),
      workoutExercise({ id: "we2", workout_id: "w2" }),
      workoutExercise({ id: "we3", workout_id: "w3" }),
      workoutExercise({ id: "we4", workout_id: "w4" }),
      workoutExercise({ id: "we5", workout_id: "w5" }),
    ],
    [
      workoutSet({ id: "s1", reps: 10 }),
      workoutSet({ id: "s2", workout_exercise_id: "we2", reps: 12 }),
      workoutSet({ id: "s3", workout_exercise_id: "we3", reps: 12 }),
      workoutSet({ id: "s4", workout_exercise_id: "we4", reps: 11 }),
      workoutSet({ id: "s5", workout_exercise_id: "we5", reps: 15 }),
    ],
  );
  assert.deepEqual(
    getHealthFitnessPersonalRecordHistory(observations, "exercise-1", "single_set_reps").map((item) => item.value),
    [10, 12, 15],
  );
});

test("corrections and Workout removal self-heal derived PRs", () => {
  const workouts = [
    workout({ id: "w1", workout_date: "2026-08-01" }),
    workout({ id: "w2", workout_date: "2026-08-02" }),
  ];
  const exercises = [
    workoutExercise({ workout_id: "w1" }),
    workoutExercise({ id: "we2", workout_id: "w2" }),
  ];
  const corrected = deriveHealthFitnessPerformanceObservations(workouts, exercises, [
    workoutSet({ id: "s1", reps: 40 }),
    workoutSet({ id: "s2", workout_exercise_id: "we2", reps: 20 }),
  ]);
  assert.equal(getHealthFitnessCurrentPersonalRecord(corrected, "exercise-1", "single_set_reps")?.value, 40);
  const removedWorkout = deriveHealthFitnessPerformanceObservations([workouts[1]!], exercises, [
    workoutSet({ id: "s2", workout_exercise_id: "we2", reps: 20 }),
  ]);
  assert.equal(getHealthFitnessCurrentPersonalRecord(removedWorkout, "exercise-1", "single_set_reps")?.value, 20);
});

test("session totals are per Workout, never cross-Workout", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [
      workout({ id: "w1", workout_date: "2026-08-01" }),
      workout({ id: "w2", workout_date: "2026-08-02" }),
    ],
    [
      workoutExercise({ workout_id: "w1" }),
      workoutExercise({ id: "we2", workout_id: "w2" }),
    ],
    [
      workoutSet({ id: "s1", reps: 10 }),
      workoutSet({ id: "s2", workout_exercise_id: "we2", reps: 20 }),
    ],
  );
  assert.deepEqual(
    observations.filter((observation) => observation.metric === "session_total_reps").map((item) => [item.workoutId, item.value]),
    [["w1", 10], ["w2", 20]],
  );
});

test("workout_date is the reached-date authority and same-day ordering is deterministic", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [
      workout({ id: "w-created-later", workout_date: "2026-08-10", created_at: "2026-08-10T10:00:00.000Z", started_at: "2026-08-10T18:00:00.000Z" }),
      workout({ id: "w-created-earlier", workout_date: "2026-08-10", created_at: "2026-08-10T09:00:00.000Z", started_at: "2026-08-10T18:00:00.000Z" }),
      workout({ id: "w-next-day", workout_date: "2026-08-11", created_at: "2026-08-11T08:00:00.000Z", started_at: "2026-08-11T06:00:00.000Z" }),
    ],
    [
      workoutExercise({ workout_id: "w-created-later" }),
      workoutExercise({ id: "we-earlier", workout_id: "w-created-earlier" }),
      workoutExercise({ id: "we-next", workout_id: "w-next-day" }),
    ],
    [
      workoutSet({ id: "s-later", reps: 10 }),
      workoutSet({ id: "s-earlier", workout_exercise_id: "we-earlier", reps: 12 }),
      workoutSet({ id: "s-next", workout_exercise_id: "we-next", reps: 20 }),
    ],
  );
  const history = getHealthFitnessPersonalRecordHistory(observations, "exercise-1", "single_set_reps");
  assert.deepEqual(history.map((item) => item.setId), ["s-earlier", "s-next"]);
  assert.equal(findFirstHealthFitnessThresholdReachedEvidence(observations, "exercise-1", "single_set_reps", 11)?.workoutDate, "2026-08-10");
});

test("Goal status and Level status derive from current canonical observations", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [workout()],
    [workoutExercise()],
    [workoutSet({ reps: 63 })],
  );
  const currentGoal = goal({ target: 100 });
  const levels = [level({ id: "level-25", target: 25 }), level({ id: "level-50", target: 50, sort_order: 1 }), level({ id: "level-75", target: 75, sort_order: 2 })];
  const status = getHealthFitnessGoalStatus(currentGoal, observations);
  assert.equal(status.currentValue, 63);
  assert.equal(status.reached, false);
  assert.equal(status.firstReachedEvidence, null);
  assert.deepEqual(getHealthFitnessGoalLevelStatuses(currentGoal, levels, observations).map((item) => item.reached), [true, true, false]);

  const corrected = deriveHealthFitnessPerformanceObservations([workout()], [workoutExercise()], [workoutSet({ reps: 10 })]);
  const correctedStatus = getHealthFitnessGoalStatus(currentGoal, corrected);
  assert.equal(correctedStatus.currentValue, 10);
  assert.equal(correctedStatus.reached, false);
});

test("a Goal can derive historical reach before its created_at and archived Goals remain readable", () => {
  const observations = deriveHealthFitnessPerformanceObservations(
    [workout({ workout_date: "2026-08-01" })],
    [workoutExercise()],
    [workoutSet({ reps: 60 })],
  );
  const archivedGoal = goal({ archived_at: "2026-08-21T12:00:00.000Z", created_at: "2026-08-20T12:00:00.000Z" });
  const status = getHealthFitnessGoalStatus(archivedGoal, observations);
  assert.equal(status.reached, true);
  assert.equal(status.firstReachedEvidence?.workoutDate, "2026-08-01");
  assert.equal(status.firstReachedEvidence?.workoutDate < archivedGoal.created_at.slice(0, 10), true);
});

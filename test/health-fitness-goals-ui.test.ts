import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type {
  HealthExercise,
  HealthFitnessGoal,
  HealthFitnessGoalLevel,
  HealthWorkout,
  HealthWorkoutExercise,
  HealthWorkoutSet,
} from "@/lib/database.types";
import {
  deriveHealthFitnessPerformanceObservations,
  getHealthFitnessCurrentPersonalRecord,
  getHealthFitnessGoalLevelStatuses,
  getHealthFitnessGoalStatus,
} from "@/lib/health-fitness-performance";

const panel = readFileSync(new URL("../src/components/task-app/health-fitness-goals-panel.tsx", import.meta.url), "utf8");
const taskApp = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const healthPage = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const fitnessTab = readFileSync(new URL("../src/components/task-app/health-fitness-tab.tsx", import.meta.url), "utf8");

const exercise: HealthExercise = {
  archived_at: null,
  created_at: "2026-08-01T08:00:00.000Z",
  default_measurement: "reps",
  id: "exercise-1",
  name: "Push-Ups",
  sort_order: 0,
  updated_at: "2026-08-01T08:00:00.000Z",
  user_id: "user-1",
};

const workout: HealthWorkout = {
  active_calories: null,
  created_at: "2026-08-01T08:00:00.000Z",
  duration_seconds: 600,
  ended_at: null,
  id: "workout-1",
  notes: "",
  source: "manual",
  source_external_id: null,
  started_at: "2026-08-01T08:00:00.000Z",
  title: "Strength",
  updated_at: "2026-08-01T08:00:00.000Z",
  user_id: "user-1",
  workout_date: "2026-08-01",
  workout_type: "Strength",
};

const workoutExercise: HealthWorkoutExercise = {
  created_at: "2026-08-01T08:01:00.000Z",
  exercise_id: exercise.id,
  exercise_name: exercise.name,
  id: "workout-exercise-1",
  measurement_type: "reps",
  notes: null,
  sort_order: 0,
  updated_at: "2026-08-01T08:01:00.000Z",
  user_id: "user-1",
  workout_id: workout.id,
};

const goal: HealthFitnessGoal = {
  archived_at: null,
  created_at: "2026-08-02T08:00:00.000Z",
  exercise_id: exercise.id,
  id: "goal-1",
  metric: "single_set_reps",
  target: 30,
  title: "Push-Ups — Single Set Reps",
  updated_at: "2026-08-02T08:00:00.000Z",
  user_id: "user-1",
};

function makeSet(value: number): HealthWorkoutSet {
  return {
    created_at: "2026-08-01T08:02:00.000Z",
    duration_seconds: null,
    id: "set-1",
    notes: null,
    reps: value,
    sort_order: 0,
    updated_at: "2026-08-01T08:02:00.000Z",
    user_id: "user-1",
    workout_exercise_id: workoutExercise.id,
  };
}

function presentationWithSet(value: number) {
  const observations = deriveHealthFitnessPerformanceObservations([workout], [workoutExercise], [makeSet(value)]);
  const levels = [
    { ...level("beginner", 10), sort_order: 0 },
    { ...level("intermediate", 20), sort_order: 1 },
    { ...level("advanced", 30), sort_order: 2 },
  ];
  return {
    currentRecord: getHealthFitnessCurrentPersonalRecord(observations, goal.exercise_id, goal.metric),
    levelStatuses: getHealthFitnessGoalLevelStatuses(goal, levels, observations),
    status: getHealthFitnessGoalStatus(goal, observations),
  };
}

function level(id: string, target: number): HealthFitnessGoalLevel {
  return {
    created_at: `2026-08-0${id === "beginner" ? "3" : id === "intermediate" ? "4" : "5"}T08:00:00.000Z`,
    goal_id: goal.id,
    id,
    label: id[0]!.toUpperCase() + id.slice(1),
    sort_order: 0,
    target,
    updated_at: "2026-08-01T08:00:00.000Z",
    user_id: "user-1",
  };
}

test("Every active Exercise Library identity offers all four Goal metrics", () => {
  assert.match(panel, /export function getHealthFitnessGoalMetricOptions\(\)/);
  assert.match(panel, /return HEALTH_FITNESS_PERFORMANCE_METRICS;/);
  assert.doesNotMatch(panel, /getHealthFitnessGoalMetricOptions\([^)]/);
  assert.doesNotMatch(panel, /default_measurement/);
  for (const metric of ["single_set_reps", "session_total_reps", "longest_set_duration", "session_total_duration"]) {
    assert.match(panel, new RegExp(metric));
  }
  assert.match(panel, /options=\{metricOptions\}/);
});

test("Goal editor preserves duration metrics and identity changes never rewrite the selected metric", () => {
  assert.match(panel, /const metric = goal\?\.metric \?\? getHealthFitnessGoalMetricOptions\(\)\[0\]/);
  assert.doesNotMatch(panel, /const nextMetric/);
  assert.doesNotMatch(panel, /metric: nextMetric/);
  assert.match(panel, /title: shouldRefreshDefaultTitle \? getDefaultGoalTitle\(exercise\.name, current\.metric\)/);
});

test("A duration Goal ignores reps-family observations", () => {
  const durationGoal = { ...goal, metric: "longest_set_duration" as const, target: 90 };
  const repsObservations = deriveHealthFitnessPerformanceObservations([workout], [workoutExercise], [makeSet(90)]);
  const status = getHealthFitnessGoalStatus(durationGoal, repsObservations);
  assert.equal(status.currentValue, 0);
  assert.equal(status.reached, false);
  assert.equal(status.progressRatio, 0);
});

test("Goals activate only on Health Fitness and stay inside the existing Fitness path", () => {
  assert.match(taskApp, /const fitnessHooksActive = activePage === "Health" && activeHealthTab === "Fitness"/);
  assert.match(taskApp, /useFitnessGoals\([^\n]*fitnessHooksActive\)/);
  assert.match(taskApp, /fitnessGoals=\{fitnessGoals\}/);
  assert.match(healthPage, /<HealthFitnessTab[\s\S]*fitnessGoals=\{fitnessGoals\}[\s\S]*fitnessGoalLevels=\{fitnessGoalLevels\}/);
  assert.match(fitnessTab, /<HealthFitnessGoalsPanel[\s\S]*<HealthFitnessPlansPanel/);
});

test("Goal presentation derives current PR, progress, and levels from canonical observations", () => {
  const presentation = presentationWithSet(18);
  assert.equal(presentation.currentRecord?.value, 18);
  assert.equal(presentation.status.progressRatio, 0.6);
  assert.equal(presentation.status.reached, false);
  assert.deepEqual(presentation.levelStatuses.map((item) => item.reached), [true, false, false]);
  assert.match(panel, /deriveHealthFitnessPerformanceObservations\(workouts, workoutExercises, workoutSets\)/);
  assert.match(panel, /getHealthFitnessCurrentPersonalRecord/);
  assert.match(panel, /getHealthFitnessGoalStatus/);
  assert.match(panel, /getHealthFitnessGoalLevelStatuses/);
  assert.match(panel, /progressRatio/);
});

test("No performance history stays unreached and displays No PR yet", () => {
  const presentation = {
    currentRecord: getHealthFitnessCurrentPersonalRecord([], goal.exercise_id, goal.metric),
    status: getHealthFitnessGoalStatus(goal, []),
  };
  assert.equal(presentation.currentRecord, null);
  assert.equal(presentation.status.reached, false);
  assert.equal(presentation.status.progressRatio, 0);
  assert.match(panel, /No PR yet/);
});

test("A reached Goal is derived only and does not persist reached or PR state", () => {
  const presentation = presentationWithSet(30);
  assert.equal(presentation.status.reached, true);
  assert.equal(presentation.status.firstReachedEvidence?.setId, "set-1");
  assert.doesNotMatch(panel, /reached_at|pr_history|record_history|createAchievement|grantXp|grantPoints|grantTokens|grantDice/);
});

test("Goal presentation self-heals when the observation supplying the PR is corrected", () => {
  assert.equal(presentationWithSet(30).status.currentValue, 30);
  assert.equal(presentationWithSet(12).status.currentValue, 12);
  assert.equal(presentationWithSet(12).status.reached, false);
});

test("Duration values remain seconds in persistence and display readably", () => {
  assert.match(panel, /return `\$\{value\} sec`/);
  assert.match(panel, /return seconds === 0 \? `\$\{minutes\}m` : `\$\{minutes\}m \$\{seconds\}s`/);
});

test("Goal creation uses active Exercise Library IDs and preserves archived existing identities", () => {
  const archived = { ...exercise, archived_at: "2026-08-20T08:00:00.000Z", id: "exercise-archived" };
  assert.equal(exercise.archived_at, null);
  assert.notEqual(archived.archived_at, null);
  assert.match(panel, /getActiveHealthFitnessGoalExercises/);
  assert.match(panel, /exercise_id: editor\.exerciseId/);
  assert.match(panel, /exercise\.archived_at === null \|\| exercise\.id === editor\?\.exerciseId/);
  assert.match(panel, /Archived exercise/);
});

test("Goal archive, restore, Level create/edit/delete, and existing Fitness sections use the approved actions", () => {
  assert.match(panel, /archiveGoal\(goal\.id\)/);
  assert.match(panel, /restoreGoal\(goal\.id\)/);
  assert.match(panel, /Archive Goal/);
  assert.match(panel, /createLevel\(\{/);
  assert.match(panel, /updateLevel\(levelEditor\.id/);
  assert.match(panel, /deleteLevel\(item\.level\.id\)/);
  assert.match(panel, /title="Fitness Goals"/);
});

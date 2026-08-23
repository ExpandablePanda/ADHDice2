import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { HealthMetricEntry, HealthWorkout } from "@/lib/database.types";
import {
  buildHealthWorkoutFormPayload,
  getHealthDailyMovementMetrics,
  getHealthWeeklyWorkoutSummary,
  sortHealthWorkouts,
} from "@/lib/health-fitness";
import { HEALTH_TABS } from "@/lib/health-utils";

const hookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/add_health_fitness_foundation_7_11_33.sql", import.meta.url), "utf8");

function workout(overrides: Partial<HealthWorkout> = {}): HealthWorkout {
  return {
    active_calories: null,
    created_at: "2026-08-23T12:00:00.000Z",
    duration_seconds: 1800,
    ended_at: null,
    id: "workout-1",
    notes: "",
    source: "manual",
    source_external_id: null,
    started_at: null,
    title: "Walking",
    updated_at: "2026-08-23T12:00:00.000Z",
    user_id: "user-1",
    workout_date: "2026-08-23",
    workout_type: "Walking",
    ...overrides,
  };
}

test("Fitness is a Health tab after Water", () => {
  assert.deepEqual(HEALTH_TABS, ["Today", "Food", "Water", "Fitness", "Journal", "Weight", "Sleep", "Insights", "Awards"]);
});

test("old saved Health tab values still normalize through the current tab list", () => {
  assert.match(pageSource, /return HEALTH_TABS\.includes\(stored as HealthTab\) \? stored as HealthTab : "Today"/);
  assert.match(pageSource, /const activeTab = useSyncExternalStore\(subscribeToHealthTabPreference, readHealthTabPreference, \(\) => "Today"\)/);
});

test("manual workout form converts duration minutes to canonical seconds and falls back to type title", () => {
  const result = buildHealthWorkoutFormPayload({
    activeCalories: "250",
    date: "2026-08-23",
    durationMinutes: "45",
    notes: "",
    startTime: "18:30",
    title: "",
    workoutType: "Strength Training",
  }, "2026-08-23");
  assert.equal(result.error, null);
  assert.equal(result.value?.duration_seconds, 2700);
  assert.equal(result.value?.title, "Strength Training");
  assert.equal(result.value?.started_at !== null, true);
});

test("workout dates cannot be in the future", () => {
  const result = buildHealthWorkoutFormPayload({
    activeCalories: "",
    date: "2026-08-24",
    durationMinutes: "30",
    notes: "",
    startTime: "",
    title: "Morning walk",
    workoutType: "Walking",
  }, "2026-08-23");
  assert.equal(result.value, null);
  assert.equal(result.error, "Future workout dates cannot be saved.");
});

test("workout duration must be positive", () => {
  const result = buildHealthWorkoutFormPayload({
    activeCalories: "",
    date: "2026-08-23",
    durationMinutes: "0",
    notes: "",
    startTime: "",
    title: "Walk",
    workoutType: "Walking",
  }, "2026-08-23");
  assert.equal(result.value, null);
  assert.equal(result.error, "Workout duration must be greater than zero.");
});

test("active calories are nullable and cannot be negative", () => {
  const nullable = buildHealthWorkoutFormPayload({
    activeCalories: "",
    date: "2026-08-23",
    durationMinutes: "20",
    notes: "",
    startTime: "",
    title: "Stretch",
    workoutType: "Stretching",
  }, "2026-08-23");
  assert.equal(nullable.value?.active_calories, null);

  const negative = buildHealthWorkoutFormPayload({
    activeCalories: "-1",
    date: "2026-08-23",
    durationMinutes: "20",
    notes: "",
    startTime: "",
    title: "Stretch",
    workoutType: "Stretching",
  }, "2026-08-23");
  assert.equal(negative.value, null);
  assert.equal(negative.error, "Active calories must be zero or greater.");
});

test("workout history sorts newest date and start time first", () => {
  const ordered = sortHealthWorkouts([
    workout({ id: "early", started_at: "2026-08-23T09:00:00.000Z" }),
    workout({ id: "yesterday", workout_date: "2026-08-22", started_at: "2026-08-22T20:00:00.000Z" }),
    workout({ id: "late", started_at: "2026-08-23T19:00:00.000Z" }),
  ]);
  assert.deepEqual(ordered.map((entry) => entry.id), ["late", "early", "yesterday"]);
});

test("weekly workout totals count sessions, seconds-derived minutes, and non-null calories", () => {
  const summary = getHealthWeeklyWorkoutSummary([
    workout({ active_calories: 250, duration_seconds: 2700, id: "one", workout_date: "2026-08-18" }),
    workout({ active_calories: null, duration_seconds: 1800, id: "two", workout_date: "2026-08-23" }),
    workout({ active_calories: 100, duration_seconds: 3600, id: "outside", workout_date: "2026-08-10" }),
  ], "2026-08-23");
  assert.equal(summary.workouts, 2);
  assert.equal(summary.workoutMinutes, 75);
  assert.equal(summary.workoutActiveCalories, 250);
});

test("daily Fitness cards read the existing steps, active energy, and exercise metric authorities", () => {
  const metrics = [
    { created_at: "", id: "steps", metric_date: "2026-08-23", metric_type: "steps", metric_value: 5000, source: "manual", source_fingerprint: "steps", updated_at: "", user_id: "user-1" },
    { created_at: "", id: "calories", metric_date: "2026-08-23", metric_type: "active_energy_kcal", metric_value: 300, source: "manual", source_fingerprint: "calories", updated_at: "", user_id: "user-1" },
    { created_at: "", id: "exercise", metric_date: "2026-08-23", metric_type: "exercise_minutes", metric_value: 45, source: "manual", source_fingerprint: "exercise", updated_at: "", user_id: "user-1" },
  ] as HealthMetricEntry[];
  const movement = getHealthDailyMovementMetrics(metrics, "2026-08-23");
  assert.deepEqual(movement, { activeEnergyKcal: 300, exerciseMinutes: 45, steps: 5000 });
});

test("workout CRUD remains isolated from daily metric rows and local persistence is user-scoped", () => {
  const addStart = hookSource.indexOf("async function addWorkout");
  const addEnd = hookSource.indexOf("async function updateWorkout");
  const updateStart = addEnd;
  const updateEnd = hookSource.indexOf("async function deleteWorkout");
  const deleteStart = updateEnd;
  const deleteEnd = hookSource.indexOf("async function importAppleHealthData");
  for (const section of [hookSource.slice(addStart, addEnd), hookSource.slice(updateStart, updateEnd), hookSource.slice(deleteStart, deleteEnd)]) {
    assert.doesNotMatch(section, /adhdice_health_metric_entries/);
    assert.match(section, /workouts/);
  }
  assert.match(hookSource, /storageKey\(userId, "workouts"\)/);
  assert.match(hookSource, /storageKey\(profile\.user_id, "workouts"\)/);
  assert.match(hookSource, /workoutsResult\.error[\s\S]*?setStorageMode\("remote"\)/);
});

test("existing Health areas remain wired while Fitness is isolated behind its component boundary", () => {
  assert.match(pageSource, /import \{ HealthFitnessTab \} from "\.\/health-fitness-tab"/);
  assert.match(pageSource, /<HealthFitnessTab[\s\S]*metricEntries=\{metricEntries\}[\s\S]*workouts=\{workouts\}/);
  assert.match(hookSource, /client\.from\("adhdice_health_meal_entries"\)/);
  assert.match(hookSource, /client\.from\("adhdice_health_water_entries"\)/);
  assert.match(hookSource, /client\.from\("adhdice_health_metric_entries"\)/);
});

test("Fitness migration is idempotent, text-typed, owner-scoped, and future-source ready", () => {
  assert.match(migrationSource, /create table if not exists public\.adhdice_health_workouts/);
  assert.match(migrationSource, /duration_seconds integer not null check \(duration_seconds > 0\)/);
  assert.match(migrationSource, /active_calories numeric check \(active_calories is null or active_calories >= 0\)/);
  assert.match(migrationSource, /source text not null default 'manual'/);
  assert.match(migrationSource, /create unique index if not exists adhdice_health_workouts_user_source_external_id_idx/);
  assert.match(migrationSource, /where source_external_id is not null/);
  assert.match(migrationSource, /grant select, insert, update, delete on table public\.adhdice_health_workouts to authenticated/);
  assert.match(migrationSource, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(migrationSource, /create type .*workout/i);
});

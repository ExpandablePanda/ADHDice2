import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { HealthMetricEntry, HealthWeightEntry } from "../src/lib/database.types.ts";
import { calculateHealthDailyCalorieAllowance, sumMetricValueForDate } from "../src/lib/health-utils.ts";
import {
  buildHealthKitMetricInputs,
  buildHealthKitWeightInputs,
  buildHealthKitWorkoutInputs,
  findLegacyWeightAdoptionCandidate,
  healthKitMetricFingerprint,
} from "../src/lib/healthkit-sync.ts";
import { getHealthKitDateKey, type HealthKitSnapshot } from "../src/lib/healthkit.ts";

const migration = readFileSync(new URL("../supabase/patch_healthkit_persistence_7_11_99.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

function snapshot(overrides: Partial<HealthKitSnapshot> = {}): HealthKitSnapshot {
  return {
    startDate: "2026-08-22T00:00:00.000Z",
    endDate: "2026-08-29T00:00:00.000Z",
    dailyMetrics: [],
    bodyMass: [],
    workouts: [],
    ...overrides,
  };
}

function metric(overrides: Partial<HealthMetricEntry> = {}): HealthMetricEntry {
  return {
    created_at: "",
    id: "metric",
    metric_date: "2026-08-28",
    metric_type: "steps",
    metric_value: 100,
    source: "manual",
    source_fingerprint: "metric",
    updated_at: "",
    user_id: "user-1",
    ...overrides,
  };
}

function weight(overrides: Partial<HealthWeightEntry> = {}): HealthWeightEntry {
  return {
    created_at: "",
    entry_date: "2026-08-28",
    id: "weight",
    logged_at: "2026-08-28T08:00:00.000Z",
    note: null,
    source: "apple_health_import",
    source_external_id: null,
    updated_at: "",
    user_id: "user-1",
    weight_kg: 80,
    ...overrides,
  };
}

test("HealthKit metrics map to positive canonical rows with stable fingerprints", () => {
  const inputs = buildHealthKitMetricInputs(snapshot({
    dailyMetrics: [{ date: "2026-08-28", steps: 1000, activeEnergyKcal: 200, exerciseMinutes: 30, asleepMinutes: 0 }],
  }));
  assert.deepEqual(inputs.map(({ metric_type, metric_value, source, source_fingerprint }) => ({ metric_type, metric_value, source, source_fingerprint })), [
    { metric_type: "steps", metric_value: 1000, source: "apple_health", source_fingerprint: "apple_health:v1:daily:steps:2026-08-28" },
    { metric_type: "active_energy_kcal", metric_value: 200, source: "apple_health", source_fingerprint: "apple_health:v1:daily:active_energy_kcal:2026-08-28" },
    { metric_type: "exercise_minutes", metric_value: 30, source: "apple_health", source_fingerprint: "apple_health:v1:daily:exercise_minutes:2026-08-28" },
  ]);
  assert.equal(healthKitMetricFingerprint("steps", "2026-08-28"), inputs[0]?.source_fingerprint);
});

test("live Apple Health metrics take precedence over XML imports without suppressing manual values", () => {
  const entries = [
    metric({ id: "xml", metric_value: 100, source: "apple_health_import" }),
    metric({ id: "live", metric_value: 200, source: "apple_health" }),
    metric({ id: "manual", metric_value: 5, source: "manual" }),
    metric({ id: "xml-calories", metric_type: "active_energy_kcal", metric_value: 40, source: "apple_health_import" }),
  ];
  assert.equal(sumMetricValueForDate(entries, "2026-08-28", ["steps"]), 205);
  assert.equal(sumMetricValueForDate(entries, "2026-08-28", ["active_energy_kcal"]), 40);
  assert.equal(sumMetricValueForDate(entries, "2026-08-28", ["steps", "active_energy_kcal"]), 245);
  assert.equal(sumMetricValueForDate([metric({ id: "manual-only", metric_value: 5 }), metric({ id: "xml-only", metric_value: 100, source: "apple_health_import" })], "2026-08-28", ["steps"]), 105);
});

test("calorie allowance consumes canonical Active Energy for the selected date", () => {
  const entries = [
    metric({ id: "selected-live", metric_date: "2026-08-27", metric_type: "active_energy_kcal", metric_value: 250, source: "apple_health" }),
    metric({ id: "selected-import", metric_date: "2026-08-27", metric_type: "active_energy_kcal", metric_value: 100, source: "apple_health_import" }),
    metric({ id: "selected-manual", metric_date: "2026-08-27", metric_type: "active_energy_kcal", metric_value: 25, source: "manual" }),
    metric({ id: "today", metric_date: "2026-08-28", metric_type: "active_energy_kcal", metric_value: 900 }),
  ];
  const selectedActiveEnergy = sumMetricValueForDate(entries, "2026-08-27", ["active_energy_kcal"]);

  assert.equal(selectedActiveEnergy, 275);
  assert.equal(calculateHealthDailyCalorieAllowance({ activeEnergyKcal: selectedActiveEnergy, addActiveEnergy: true, baseCalorieGoal: 1800 }), 2075);
  assert.equal(calculateHealthDailyCalorieAllowance({ activeEnergyKcal: sumMetricValueForDate(entries, "2026-08-28", ["active_energy_kcal"]), addActiveEnergy: true, baseCalorieGoal: 1800 }), 2700);
});

test("HealthKit weights use UUID identity and device-local sample date", () => {
  const timestamp = "2026-08-28T08:00:00.000Z";
  const inputs = buildHealthKitWeightInputs(snapshot({ bodyMass: [{ id: "hk-weight-1", timestamp, weightKg: 80.25 }] }));
  assert.deepEqual(inputs[0], {
    entry_date: getHealthKitDateKey(new Date(timestamp)),
    logged_at: timestamp,
    note: "Synced from Apple Health",
    source: "apple_health",
    source_external_id: "hk-weight-1",
    weight_kg: 80.25,
  });
});

test("legacy weight adoption requires one exact timestamp match", () => {
  const sample = { id: "hk-weight-1", timestamp: "2026-08-28T08:00:00.000Z", weightKg: 80 };
  assert.equal(findLegacyWeightAdoptionCandidate([weight()], sample)?.id, "weight");
  assert.equal(findLegacyWeightAdoptionCandidate([weight({ logged_at: "2026-08-28T09:00:00.000Z" })], sample), null);
  assert.equal(findLegacyWeightAdoptionCandidate([weight({ id: "one" }), weight({ id: "two" })], sample), null);
  assert.equal(findLegacyWeightAdoptionCandidate([weight({ source: "manual" })], sample), null);
});

test("HealthKit workouts map to one UUID-keyed workout row without exercise inference", () => {
  const inputs = buildHealthKitWorkoutInputs(snapshot({
    workouts: [{
      id: "hk-workout-1",
      activityType: 37,
      activityLabel: "Running",
      startDate: "2026-08-28T09:00:00.000Z",
      endDate: "2026-08-28T09:30:00.000Z",
      durationSeconds: 1800.4,
      activeCaloriesKcal: 250,
    }],
  }));
  assert.deepEqual(inputs[0], {
    active_calories: 250,
    ended_at: "2026-08-28T09:30:00.000Z",
    duration_seconds: 1800,
    notes: "",
    source: "apple_health",
    source_external_id: "hk-workout-1",
    started_at: "2026-08-28T09:00:00.000Z",
    title: "Running",
    workout_date: "2026-08-28",
    workout_type: "Running",
  });
  assert.equal("exercise_id" in (inputs[0] ?? {}), false);
  assert.equal("sets" in (inputs[0] ?? {}), false);
});

test("7.11.99 migration and schema mirror live source and normal upsert uniqueness", () => {
  assert.match(migration, /source in \('manual', 'apple_health_import', 'apple_health'\)/);
  assert.match(migration, /add column if not exists source_external_id text/);
  assert.match(migration, /unique \(user_id, source, source_external_id\)/g);
  assert.match(migration, /drop index if exists public\.adhdice_health_workouts_user_source_external_id_idx/);
  assert.match(schema, /unique \(user_id, source, source_external_id\)/g);
  assert.doesNotMatch(schema, /create unique index adhdice_health_workouts_user_source_external_id_idx/);
});

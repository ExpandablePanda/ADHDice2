import test from "node:test";
import assert from "node:assert/strict";

import {
  HEALTHKIT_READ_TYPES,
  getDefaultHealthKitDateRange,
  isHealthKitNativePlatform,
  normalizeHealthKitDateRange,
  normalizeHealthKitSnapshot,
  sumHealthKitSleepMinutes,
} from "../src/lib/healthkit.ts";

test("HealthKit requests only the six approved read categories", () => {
  assert.deepEqual(HEALTHKIT_READ_TYPES, [
    "Step Count",
    "Active Energy Burned",
    "Apple Exercise Time",
    "Sleep Analysis",
    "Body Mass",
    "Workouts",
  ]);
});

test("HealthKit default range covers seven local calendar dates", () => {
  const range = getDefaultHealthKitDateRange(new Date("2026-08-28T15:30:00-04:00"));
  assert.equal(new Date(range.endDate).getTime() - new Date(range.startDate).getTime(), 7 * 24 * 60 * 60 * 1000);
});

test("HealthKit date ranges reject invalid and unbounded requests", () => {
  assert.throws(() => normalizeHealthKitDateRange({ startDate: "not-a-date", endDate: "2026-08-28T00:00:00Z" }));
  assert.throws(() => normalizeHealthKitDateRange({ startDate: "2026-08-01T00:00:00Z", endDate: "2026-08-10T00:00:00Z" }));
});

test("HealthKit sleep aggregation ignores awake/in-bed and unions overlaps", () => {
  const minutes = sumHealthKitSleepMinutes([
    { startDate: "2026-08-28T00:00:00Z", endDate: "2026-08-28T02:00:00Z", value: "AsleepCore" },
    { startDate: "2026-08-28T01:00:00Z", endDate: "2026-08-28T03:00:00Z", value: "AsleepREM" },
    { startDate: "2026-08-28T03:00:00Z", endDate: "2026-08-28T03:30:00Z", value: "Awake" },
    { startDate: "2026-08-28T03:30:00Z", endDate: "2026-08-28T04:00:00Z", value: "InBed" },
  ]);
  assert.equal(minutes, 180);
});

test("HealthKit payload normalization preserves stable IDs and deduplicates daily keys safely", () => {
  const snapshot = normalizeHealthKitSnapshot({
    startDate: "2026-08-22T00:00:00Z",
    endDate: "2026-08-29T00:00:00Z",
    dailyMetrics: [
      { date: "2026-08-28", steps: 100, activeEnergyKcal: 20, exerciseMinutes: 4, asleepMinutes: 10 },
      { date: "2026-08-28", steps: 150, activeEnergyKcal: 15, exerciseMinutes: 6, asleepMinutes: 8 },
    ],
    bodyMass: [{ id: "weight-1", timestamp: "2026-08-28T08:00:00Z", weightKg: 80 }],
    workouts: [{ id: "workout-1", activityType: 37, activityLabel: "Running", startDate: "2026-08-28T09:00:00Z", endDate: "2026-08-28T09:30:00Z", durationSeconds: 1800, activeCaloriesKcal: 250 }],
  });
  assert.deepEqual(snapshot.dailyMetrics[0], { date: "2026-08-28", steps: 150, activeEnergyKcal: 20, exerciseMinutes: 6, asleepMinutes: 10 });
  assert.equal(snapshot.bodyMass[0]?.id, "weight-1");
  assert.equal(snapshot.workouts[0]?.id, "workout-1");
});

test("HealthKit integration is explicitly native iOS only", () => {
  assert.equal(isHealthKitNativePlatform("web"), false);
  assert.equal(isHealthKitNativePlatform("ios"), true);
});

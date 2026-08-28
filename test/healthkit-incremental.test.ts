import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  HealthKitNormalizationError,
  prepareIncrementalHealthChanges,
  normalizeHealthKitIncrementalResult,
  normalizeHealthKitScopeKey,
} from "../src/lib/healthkit.ts";

const validResult = {
  syncToken: "sync-token-1",
  initialized: true,
  baselineStartDate: "2026-08-22T04:00:00.000Z",
  types: {
    steps: { added: 4, deleted: 1 },
    activeEnergy: { added: 3, deleted: 0 },
    exerciseTime: { added: 2, deleted: 0 },
    sleep: { added: 1, deleted: 1 },
    bodyMass: { added: 2, deleted: 0 },
    workouts: { added: 1, deleted: 0 },
  },
  totalAdded: 13,
  totalDeleted: 2,
  failedTypes: {},
  metricChanges: [],
  bodyMass: [],
  deletedBodyMassIds: [],
  workouts: [],
  deletedWorkoutIds: [],
};

test("HealthKit incremental scope keys are required and trimmed", () => {
  assert.equal(normalizeHealthKitScopeKey(" user-a "), "user-a");
  assert.throws(() => normalizeHealthKitScopeKey(""), HealthKitNormalizationError);
  assert.throws(() => normalizeHealthKitScopeKey("   "), HealthKitNormalizationError);
  assert.throws(() => normalizeHealthKitScopeKey(null), HealthKitNormalizationError);
});

test("HealthKit incremental payload normalizes per-type and total counts", () => {
  const result = normalizeHealthKitIncrementalResult({
    ...validResult,
    failedTypes: { sleep: "Read access unavailable" },
  });
  assert.equal(result.initialized, true);
  assert.equal(result.baselineStartDate, "2026-08-22T04:00:00.000Z");
  assert.deepEqual(result.types.steps, { added: 4, deleted: 1 });
  assert.equal(result.types.workouts.added, 1);
  assert.equal(result.totalAdded, 13);
  assert.equal(result.totalDeleted, 2);
  assert.deepEqual(result.failedTypes, { sleep: "Read access unavailable" });
});

test("HealthKit incremental payload rejects malformed counts and totals", () => {
  assert.throws(() => normalizeHealthKitIncrementalResult({ ...validResult, types: { ...validResult.types, steps: { added: -1, deleted: 0 } } }), HealthKitNormalizationError);
  assert.throws(() => normalizeHealthKitIncrementalResult({ ...validResult, totalAdded: 12 }), HealthKitNormalizationError);
  assert.throws(() => normalizeHealthKitIncrementalResult({ ...validResult, types: { ...validResult.types, workouts: undefined } }), HealthKitNormalizationError);
});

test("HealthKit incremental bridge remains guarded off native iOS", async () => {
  await assert.rejects(() => prepareIncrementalHealthChanges("user-a"), /native iOS app/);
});

test("native incremental bridge stages opaque batches and commits anchors only explicitly", () => {
  const source = readFileSync(new URL("../ios/App/App/ADHDiceHealthKitPlugin.swift", import.meta.url), "utf8");
  assert.match(source, /prepareIncrementalHealthChanges/);
  assert.match(source, /commitIncrementalHealthChanges/);
  assert.match(source, /discardIncrementalHealthChanges/);
  assert.match(source, /HKAnchoredObjectQuery/);
  assert.match(source, /NSKeyedArchiver\.archivedData\(withRootObject: anchor, requiringSecureCoding: true\)/);
  assert.match(source, /NSKeyedUnarchiver\.unarchivedObject\(ofClass: HKQueryAnchor\.self/);
  assert.match(source, /pendingIncrementalBatches/);
  assert.match(source, /sample-index/);
  assert.doesNotMatch(source, /saveIncrementalAnchor\(read\.anchor/);
  for (const type of ["steps", "activeEnergy", "exerciseTime", "sleep", "bodyMass", "workouts"]) {
    assert.match(source, new RegExp(`case ${type}`));
  }
});

test("incremental payload carries authoritative zero metrics and exact deletion identities", () => {
  const result = normalizeHealthKitIncrementalResult({
    ...validResult,
    metricChanges: [{ date: "2026-08-28", metricType: "steps", value: 0 }],
    deletedBodyMassIds: ["weight-1"],
    deletedWorkoutIds: ["workout-1"],
  });
  assert.deepEqual(result.metricChanges, [{ date: "2026-08-28", metricType: "steps", value: 0 }]);
  assert.deepEqual(result.deletedBodyMassIds, ["weight-1"]);
  assert.deepEqual(result.deletedWorkoutIds, ["workout-1"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  hasTrustedAppleHealthEvidence,
  healthKitConnectionMarkerKey,
  isHealthKitConnectionEstablished,
  markHealthKitConnected,
} from "../src/lib/healthkit-connection.ts";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

test("available HealthKit without connection or live Apple Health data is not eligible", () => {
  assert.equal(isHealthKitConnectionEstablished("user-a", {
    metricEntries: [],
    weightEntries: [],
    workouts: [],
  }, createStorage()), false);
});

test("successful connection marker is account scoped and enables that account", () => {
  const storage = createStorage();
  assert.equal(markHealthKitConnected("user-a", storage), true);
  assert.equal(storage.getItem(healthKitConnectionMarkerKey("user-a")), "true");
  assert.equal(isHealthKitConnectionEstablished("user-a", {}, storage), true);
  assert.equal(isHealthKitConnectionEstablished("user-b", {}, storage), false);
});

test("canonical apple_health data is trusted backward-compatible evidence", () => {
  const storage = createStorage();
  assert.equal(isHealthKitConnectionEstablished("user-a", {
    metricEntries: [{ source: "manual" }],
    weightEntries: [{ source: "apple_health" }],
  }, storage), true);
  assert.equal(storage.getItem(healthKitConnectionMarkerKey("user-a")), "true");
  assert.equal(hasTrustedAppleHealthEvidence({ workouts: [{ source: "apple_health" }] }), true);
});

test("apple_health_import is not native HealthKit connection evidence", () => {
  assert.equal(hasTrustedAppleHealthEvidence({
    metricEntries: [{ source: "apple_health_import" }],
    weightEntries: [{ source: "apple_health_import" }],
    workouts: [{ source: "apple_health_import" }],
  }), false);
});

test("Connect Apple Health marks the account only after authorization completes", () => {
  const source = readFileSync(new URL("../src/components/task-app/apple-health-native-section.tsx", import.meta.url), "utf8");
  assert.match(source, /result\.authorizationCompleted === true[\s\S]*markHealthKitConnected\(healthKitScopeKey\)/);
});

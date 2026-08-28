import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildHealthKitIncrementalMetricInputs } from "../src/lib/healthkit-sync.ts";

const hookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const nativeSource = readFileSync(new URL("../ios/App/App/ADHDiceHealthKitPlugin.swift", import.meta.url), "utf8");

test("incremental metric persistence includes positive values and authoritative zero values", () => {
  assert.deepEqual(buildHealthKitIncrementalMetricInputs([
    { date: "2026-08-28", metricType: "steps", value: 1234 },
    { date: "2026-08-28", metricType: "active_energy_kcal", value: 0 },
  ]), [
    {
      metric_date: "2026-08-28",
      metric_type: "steps",
      metric_value: 1234,
      source: "apple_health",
      source_fingerprint: "apple_health:v1:daily:steps:2026-08-28",
    },
    {
      metric_date: "2026-08-28",
      metric_type: "active_energy_kcal",
      metric_value: 0,
      source: "apple_health",
      source_fingerprint: "apple_health:v1:daily:active_energy_kcal:2026-08-28",
    },
  ]);
});

test("incremental persistence is staged, scope-guarded, and retry-idempotent", () => {
  assert.match(hookSource, /prepared = await prepareIncrementalHealthChanges\(syncUserId\)/);
  assert.match(hookSource, /await commitIncrementalHealthChanges\(syncUserId, prepared\.syncToken\)/);
  assert.match(hookSource, /await discardIncrementalHealthChanges\(syncUserId, prepared\.syncToken\)/);
  assert.match(hookSource, /buildHealthKitIncrementalMetricInputs\(prepared\.metricChanges\)/);
  assert.match(hookSource, /onConflict: "user_id,source_fingerprint"/);
  assert.match(hookSource, /healthScopeRevisionRef\.current === syncScopeRevision/);
  assert.match(hookSource, /if \(!isCurrentScope\(\)\) throw new Error\("Health scope changed before incremental Apple Health commit\."\)/);
});

test("native staged index maps UUIDs across local midnights and fails unmapped deletions", () => {
  assert.match(nativeSource, /localDateKeys\(start: start, end: end, calendar: calendar\)/);
  assert.match(nativeSource, /sampleIndex\[id\] = dates/);
  assert.match(nativeSource, /guard let dates = sampleIndex\[deletedId\] else/);
  assert.match(nativeSource, /is not mapped to a local date/);
  assert.match(nativeSource, /sample-index/);
});

test("body mass and workout deletions are exact-source deletes and remain independent", () => {
  assert.match(hookSource, /\.eq\("source", APPLE_HEALTH_SOURCE\)/);
  assert.match(hookSource, /\.eq\("source_external_id", externalId\)/);
  assert.match(hookSource, /deletedBodyMassIds/);
  assert.match(hookSource, /deletedWorkoutIds/);
  assert.match(nativeSource, /case \.bodyMass/);
  assert.match(nativeSource, /case \.workouts/);
  assert.doesNotMatch(hookSource.slice(hookSource.indexOf("async function syncIncrementalAppleHealthData")), /active_energy_kcal.*delete|exercise_minutes.*delete/);
});

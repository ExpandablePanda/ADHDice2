import test from "node:test";
import assert from "node:assert/strict";

import { parseAppleHealthBuffer, parseAppleHealthXml } from "../src/lib/health-apple-import.ts";

test("apple health xml parses supported records into preview metrics", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <HealthData>
    <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Health" unit="count" creationDate="2026-05-01 09:00:00 -0400" startDate="2026-05-01 08:00:00 -0400" endDate="2026-05-01 09:00:00 -0400" value="1500"/>
    <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Health" unit="kcal" creationDate="2026-05-01 09:00:00 -0400" startDate="2026-05-01 08:00:00 -0400" endDate="2026-05-01 09:00:00 -0400" value="120"/>
    <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Health" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-05-01 00:00:00 -0400" endDate="2026-05-01 07:30:00 -0400"/>
    <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Health" unit="lb" startDate="2026-05-01 07:45:00 -0400" endDate="2026-05-01 07:45:00 -0400" value="180"/>
    <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="45" durationUnit="min" startDate="2026-05-01 18:00:00 -0400" endDate="2026-05-01 18:45:00 -0400"/>
    <Record type="HKQuantityTypeIdentifierFlightsClimbed" sourceName="Health" unit="count" startDate="2026-05-01 10:00:00 -0400" endDate="2026-05-01 10:30:00 -0400" value="3"/>
  </HealthData>`;

  const preview = parseAppleHealthXml(xml, "export.xml");

  assert.equal(preview.sampleCount, 5);
  assert.equal(preview.unsupportedCount, 1);
  assert.equal(preview.metricEntries.length, 5);
  assert.equal(preview.weightEntries.length, 1);
  assert.equal(preview.startDate, "2026-05-01");
  assert.equal(preview.endDate, "2026-05-01");

  const metricTypes = preview.metricEntries.map((entry) => entry.metric_type).sort();
  assert.deepEqual(metricTypes, [
    "active_energy_kcal",
    "body_mass_kg",
    "exercise_minutes",
    "sleep_minutes",
    "steps",
  ]);

  const weight = preview.weightEntries[0];
  assert.ok(weight);
  assert.ok(Math.abs(weight.weight_kg - 81.65) < 0.02);
});

test("apple health xml aggregates multiple samples from the same day", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <HealthData>
    <Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2026-05-02 08:00:00 -0400" endDate="2026-05-02 08:15:00 -0400" value="400"/>
    <Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2026-05-02 09:00:00 -0400" endDate="2026-05-02 09:15:00 -0400" value="600"/>
  </HealthData>`;

  const preview = parseAppleHealthXml(xml, "export.xml");
  assert.equal(preview.sampleCount, 2);
  assert.equal(preview.metricEntries.length, 1);
  assert.equal(preview.metricEntries[0]?.metric_type, "steps");
  assert.equal(preview.metricEntries[0]?.metric_value, 1000);
});

test("apple health array buffer parsing reports progress and returns a preview", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <HealthData>
    <Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2026-05-03 08:00:00 -0400" endDate="2026-05-03 08:15:00 -0400" value="800"/>
  </HealthData>`;

  const messages: string[] = [];
  const preview = await parseAppleHealthBuffer(
    new TextEncoder().encode(xml).buffer,
    "export.xml",
    {
      onProgress(progress) {
        messages.push(progress.message);
      },
    },
  );

  assert.equal(preview.metricEntries.length, 1);
  assert.equal(preview.metricEntries[0]?.metric_value, 800);
  assert.ok(messages.some((message) => message.includes("Parsing supported Apple Health records")));
});

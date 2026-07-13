import assert from "node:assert/strict";
import test from "node:test";
import { compareOnTimePlanPriority, createEmptyOnTimePlan, getOnTimePlanSchemaVersion, isMeaningfulOnTimePlan, normalizeOnTimePlan, onTimePlanSignature, updateOnTimePlan, withOnTimeDestinationLabel } from "../src/lib/on-time-plan-state.ts";

const v1 = {
  schemaVersion: 1,
  destinationLabel: "Airport",
  arriveAt: "2026-07-14T14:00:00Z",
  timezone: "America/New_York",
  travelMinutes: 35,
  arrivalBufferMinutes: 10,
  items: [{ id: "prep", kind: "temporary", title: "Pack", plannedSeconds: 600, completed: false }],
  clientUpdatedAt: "2026-07-13T12:00:00Z",
} as const;

test("valid v1 migrates to normalized v2 without losing manual plan data", () => {
  const plan = normalizeOnTimePlan(v1);
  assert.equal(plan.schemaVersion, 2);
  assert.deepEqual(plan.destination, { source: "manual", label: "Airport", placeId: null });
  assert.deepEqual(plan.travel, { selectedSource: "manual", manualDurationSeconds: 2100 });
  assert.equal(plan.items[0]?.id, "prep");
  assert.equal(getOnTimePlanSchemaVersion(v1), 1);
});

test("valid v2 normalizes and never downgrades", () => {
  const plan = normalizeOnTimePlan({ ...createEmptyOnTimePlan("UTC"), destination: { source: "google_place", label: "JFK Airport", placeId: "ChIJ_test-123" }, travel: { selectedSource: "traffic", manualDurationSeconds: 1800 } });
  assert.equal(plan.schemaVersion, 2);
  assert.deepEqual(plan.destination, { source: "google_place", label: "JFK Airport", placeId: "ChIJ_test-123" });
  assert.equal(plan.travel.selectedSource, "traffic");
  assert.equal("destinationLabel" in plan, false);
  assert.equal("travelMinutes" in plan, false);
});

test("malformed Google destination recovers safely to Manual mode", () => {
  const plan = normalizeOnTimePlan({ ...createEmptyOnTimePlan(), destination: { source: "google_place", label: "Airport", placeId: "bad place id" }, travel: { selectedSource: "traffic", manualDurationSeconds: 900 } });
  assert.deepEqual(plan.destination, { source: "manual", label: "Airport", placeId: null });
  assert.equal(plan.travel.selectedSource, "manual");
});

test("normalizes malformed plan and invalid preparation item fields safely", () => {
  const plan = normalizeOnTimePlan({ schemaVersion: 1, destinationLabel: 4, arriveAt: "bad", travelMinutes: -2, arrivalBufferMinutes: 99999, items: [null, { id: "x", kind: "task", taskId: "missing", titleSnapshot: "Saved", plannedSeconds: -1 }] }, "America/New_York");
  assert.equal(plan.destination.label, "");
  assert.equal(plan.arriveAt, null);
  assert.equal(plan.travel.manualDurationSeconds, null);
  assert.equal(plan.arrivalBufferMinutes, 10080);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0]?.plannedSeconds, null);
});

test("empty and immutable updates provide meaningful detection", () => {
  const empty = createEmptyOnTimePlan("UTC");
  assert.equal(isMeaningfulOnTimePlan(empty), false);
  const updated = updateOnTimePlan(empty, withOnTimeDestinationLabel("Airport"), new Date("2026-01-01T00:00:00Z"));
  assert.equal(isMeaningfulOnTimePlan(updated), true);
  assert.equal(empty.destination.label, "");
});

test("schema version wins before timestamp and v1 cannot overwrite v2", () => {
  const migratedV1 = normalizeOnTimePlan({ ...v1, clientUpdatedAt: "2026-07-15T12:00:00Z" });
  const v2 = updateOnTimePlan(createEmptyOnTimePlan(), withOnTimeDestinationLabel("Station"), new Date("2026-07-13T12:00:00Z"));
  assert.equal(compareOnTimePlanPriority({ plan: migratedV1, sourceSchemaVersion: 1 }, { plan: v2, sourceSchemaVersion: 2 }), -1);
});

test("same-version timestamp comparison remains whole-plan last-write-wins", () => {
  const older = updateOnTimePlan(createEmptyOnTimePlan(), withOnTimeDestinationLabel("Older"), new Date("2026-07-13T12:00:00Z"));
  const newer = updateOnTimePlan(older, withOnTimeDestinationLabel("Newer"), new Date("2026-07-13T12:01:00Z"));
  assert.equal(compareOnTimePlanPriority({ plan: newer, sourceSchemaVersion: 2 }, { plan: older, sourceSchemaVersion: 2 }), 1);
});

test("stable signatures suppress realtime echoes", () => {
  const plan = normalizeOnTimePlan(v1);
  const echo = normalizeOnTimePlan(JSON.parse(onTimePlanSignature(plan)));
  assert.equal(compareOnTimePlanPriority({ plan, sourceSchemaVersion: 2 }, { plan: echo, sourceSchemaVersion: 2 }), 0);
});

test("stale v1 local cache cannot downgrade remote v2", () => {
  const staleCache = normalizeOnTimePlan({ ...v1, clientUpdatedAt: "2026-07-15T12:00:00Z" });
  const remote = updateOnTimePlan(createEmptyOnTimePlan(), withOnTimeDestinationLabel("Remote v2"), new Date("2026-07-13T12:00:00Z"));
  assert.equal(compareOnTimePlanPriority({ plan: staleCache, sourceSchemaVersion: 1 }, { plan: remote, sourceSchemaVersion: 2 }), -1);
});

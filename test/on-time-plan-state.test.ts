import assert from "node:assert/strict";
import test from "node:test";
import { compareOnTimePlanPriority, createEmptyOnTimePlan, getOnTimePlanSchemaVersion, isMeaningfulOnTimePlan, normalizeOnTimePlan, onTimePlanSignature, reconcileOnTimeManualDurationAfterTaskSave, reconcileOnTimeManualDurationsFromTasks, updateOnTimePlan, withOnTimeDestinationLabel } from "../src/lib/on-time-plan-state.ts";

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

test("valid v1 migrates to normalized v3 without losing manual plan data", () => {
  const plan = normalizeOnTimePlan(v1);
  assert.equal(plan.schemaVersion, 3);
  assert.deepEqual(plan.destination, { source: "manual", label: "Airport", placeId: null });
  assert.deepEqual(plan.travel, { selectedSource: "manual", manualDurationSeconds: 2100 });
  assert.equal(plan.items[0]?.id, "prep");
  assert.equal(plan.items[0]?.execution, null);
  assert.equal(getOnTimePlanSchemaVersion(v1), 1);
});

test("valid v2 migrates to v3 and never loses destination or travel data", () => {
  const plan = normalizeOnTimePlan({ ...createEmptyOnTimePlan("UTC"), schemaVersion: 2, destination: { source: "google_place", label: "JFK Airport", placeId: "ChIJ_test-123" }, travel: { selectedSource: "traffic", manualDurationSeconds: 1800 } });
  assert.equal(plan.schemaVersion, 3);
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

test("schema version wins before timestamp and legacy plans cannot overwrite v3", () => {
  const migratedV1 = normalizeOnTimePlan({ ...v1, clientUpdatedAt: "2026-07-15T12:00:00Z" });
  const v3 = updateOnTimePlan(createEmptyOnTimePlan(), withOnTimeDestinationLabel("Station"), new Date("2026-07-13T12:00:00Z"));
  assert.equal(compareOnTimePlanPriority({ plan: migratedV1, sourceSchemaVersion: 1 }, { plan: v3, sourceSchemaVersion: 3 }), -1);
  const laterV2 = normalizeOnTimePlan({ ...v3, schemaVersion: 2, clientUpdatedAt: "2026-07-15T12:00:00Z" });
  assert.equal(compareOnTimePlanPriority({ plan: laterV2, sourceSchemaVersion: 2 }, { plan: v3, sourceSchemaVersion: 3 }), -1);
});

test("same-version timestamp comparison remains whole-plan last-write-wins", () => {
  const older = updateOnTimePlan(createEmptyOnTimePlan(), withOnTimeDestinationLabel("Older"), new Date("2026-07-13T12:00:00Z"));
  const newer = updateOnTimePlan(older, withOnTimeDestinationLabel("Newer"), new Date("2026-07-13T12:01:00Z"));
  assert.equal(compareOnTimePlanPriority({ plan: newer, sourceSchemaVersion: 3 }, { plan: older, sourceSchemaVersion: 3 }), 1);
});

test("stable signatures suppress realtime echoes", () => {
  const plan = normalizeOnTimePlan(v1);
  const echo = normalizeOnTimePlan(JSON.parse(onTimePlanSignature(plan)));
  assert.equal(compareOnTimePlanPriority({ plan, sourceSchemaVersion: 3 }, { plan: echo, sourceSchemaVersion: 3 }), 0);
});

test("stale v1 local cache cannot downgrade remote v3", () => {
  const staleCache = normalizeOnTimePlan({ ...v1, clientUpdatedAt: "2026-07-15T12:00:00Z" });
  const remote = updateOnTimePlan(createEmptyOnTimePlan(), withOnTimeDestinationLabel("Remote v2"), new Date("2026-07-13T12:00:00Z"));
  assert.equal(compareOnTimePlanPriority({ plan: staleCache, sourceSchemaVersion: 1 }, { plan: remote, sourceSchemaVersion: 3 }), -1);
});

test("valid execution survives normalization and persistence round-trip", () => {
  const plan = normalizeOnTimePlan({
    ...createEmptyOnTimePlan(),
    items: [{ id: "prep", kind: "temporary", title: "Pack", plannedSeconds: 900, completed: false, execution: { startedAt: "2026-07-14T12:00:00Z", plannedSeconds: 900 } }],
  });
  assert.deepEqual(plan.items[0]?.execution, { startedAt: "2026-07-14T12:00:00.000Z", plannedSeconds: 900 });
  assert.deepEqual(normalizeOnTimePlan(JSON.parse(onTimePlanSignature(plan))).items[0]?.execution, plan.items[0]?.execution);
});

test("malformed execution timestamps and nonpositive durations normalize to null", () => {
  const baseItem = { id: "prep", kind: "temporary", title: "Pack", plannedSeconds: 900, completed: false };
  const malformedTimestamp = normalizeOnTimePlan({ ...createEmptyOnTimePlan(), items: [{ ...baseItem, execution: { startedAt: "bad", plannedSeconds: 900 } }] });
  const zeroDuration = normalizeOnTimePlan({ ...createEmptyOnTimePlan(), items: [{ ...baseItem, execution: { startedAt: "2026-07-14T12:00:00Z", plannedSeconds: 0 } }] });
  const infiniteDuration = normalizeOnTimePlan({ ...createEmptyOnTimePlan(), items: [{ ...baseItem, execution: { startedAt: "2026-07-14T12:00:00Z", plannedSeconds: Number.POSITIVE_INFINITY } }] });
  assert.equal(malformedTimestamp.items[0]?.execution, null);
  assert.equal(zeroDuration.items[0]?.execution, null);
  assert.equal(infiniteDuration.items[0]?.execution, null);
});

test("saved manual estimates reconcile only matching linked Manual items and preserve execution", () => {
  const execution = { startedAt: "2026-07-14T12:00:00.000Z", plannedSeconds: 900 };
  const plan = normalizeOnTimePlan({
    ...createEmptyOnTimePlan(),
    items: [
      { id: "manual", kind: "task", taskId: "task-a", titleSnapshot: "A", hierarchySnapshot: ["Parent"], occurrenceKey: "occurrence:2026-07-14", occurrenceDueOn: "2026-07-14", plannedSeconds: 900, durationSource: "manual", execution },
      { id: "typical", kind: "task", taskId: "task-a", titleSnapshot: "A", hierarchySnapshot: [], occurrenceKey: null, occurrenceDueOn: null, plannedSeconds: 600, durationSource: "typical", execution: null },
      { id: "custom", kind: "task", taskId: "task-a", titleSnapshot: "A", hierarchySnapshot: [], occurrenceKey: null, occurrenceDueOn: null, plannedSeconds: 300, durationSource: "custom", execution: null },
      { id: "other", kind: "task", taskId: "task-b", titleSnapshot: "B", hierarchySnapshot: [], occurrenceKey: null, occurrenceDueOn: null, plannedSeconds: 300, durationSource: "manual", execution: null },
      { id: "temp", kind: "temporary", title: "Pack", plannedSeconds: 120, completed: false, execution: null },
    ],
  });
  const next = reconcileOnTimeManualDurationAfterTaskSave(plan, { id: "task-a" }, 20);
  assert.deepEqual(next.items.map((item) => item.plannedSeconds), [1200, 600, 300, 300, 120]);
  assert.deepEqual(next.items[0]?.execution, execution);
  assert.deepEqual(next.items.map((item) => item.id), plan.items.map((item) => item.id));
  for (const estimate of [null, 0, -1, Number.NaN]) {
    const cleared = reconcileOnTimeManualDurationAfterTaskSave(plan, { id: "task-a" }, estimate);
    assert.equal(cleared.items[0]?.plannedSeconds, null);
    assert.deepEqual(cleared.items[0]?.execution, execution);
    assert.deepEqual(cleared.items.slice(1), plan.items.slice(1));
    assert.equal(reconcileOnTimeManualDurationAfterTaskSave(cleared, { id: "task-a" }, estimate), cleared);
  }
});

test("authoritative task metadata reconciles every Manual save path without touching concurrent item edits", () => {
  const plan = normalizeOnTimePlan({
    ...createEmptyOnTimePlan(),
    destination: { source: "manual", label: "Keep destination", placeId: null },
    items: [
      { id: "manual", kind: "task", taskId: "task-a", titleSnapshot: "Newest title", hierarchySnapshot: ["Parent"], occurrenceKey: "occurrence:today", occurrenceDueOn: "2026-07-14", plannedSeconds: 600, durationSource: "manual", execution: { startedAt: "2026-07-14T12:00:00Z", plannedSeconds: 600 } },
      { id: "typical", kind: "task", taskId: "task-a", titleSnapshot: "A", hierarchySnapshot: [], occurrenceKey: null, occurrenceDueOn: null, plannedSeconds: 500, durationSource: "typical", execution: null },
      { id: "custom", kind: "task", taskId: "task-a", titleSnapshot: "A", hierarchySnapshot: [], occurrenceKey: null, occurrenceDueOn: null, plannedSeconds: 400, durationSource: "custom", execution: null },
      { id: "temporary", kind: "temporary", title: "Pack", plannedSeconds: 300, completed: false, execution: null },
    ],
  });
  const next = reconcileOnTimeManualDurationsFromTasks(plan, [{ id: "task-a", estimated_minutes: 25 }]);
  assert.equal(next.items[0]?.plannedSeconds, 1500);
  assert.deepEqual(next.items[0]?.execution, plan.items[0]?.execution);
  assert.deepEqual(next.items.slice(1), plan.items.slice(1));
  assert.equal(next.destination.label, "Keep destination");
  assert.equal(reconcileOnTimeManualDurationsFromTasks(next, [{ id: "task-a", estimated_minutes: 25 }]), next);
  const cleared = reconcileOnTimeManualDurationsFromTasks(plan, [{ id: "task-a", estimated_minutes: Number.NaN }]);
  assert.equal(cleared.items[0]?.plannedSeconds, null);
  assert.deepEqual(cleared.items[0]?.execution, plan.items[0]?.execution);
  assert.equal(reconcileOnTimeManualDurationsFromTasks(cleared, [{ id: "task-a", estimated_minutes: Number.NaN }]), cleared);
  assert.equal(reconcileOnTimeManualDurationsFromTasks(plan, []), plan);
});

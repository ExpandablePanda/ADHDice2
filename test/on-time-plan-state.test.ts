import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyOnTimePlan, isMeaningfulOnTimePlan, normalizeOnTimePlan, updateOnTimePlan } from "../src/lib/on-time-plan-state.ts";

test("normalizes malformed plan and invalid items safely", () => {
  const plan = normalizeOnTimePlan({ destinationLabel: 4, arriveAt: "bad", travelMinutes: -2, arrivalBufferMinutes: 99999, items: [null, { id: "x", kind: "task", taskId: "missing", titleSnapshot: "Saved", plannedSeconds: -1 }] }, "America/New_York");
  assert.equal(plan.destinationLabel, "");
  assert.equal(plan.arriveAt, null);
  assert.equal(plan.travelMinutes, null);
  assert.equal(plan.arrivalBufferMinutes, 10080);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0]?.kind, "task");
  assert.equal(plan.items[0]?.plannedSeconds, null);
});

test("empty and immutable updates provide meaningful detection", () => {
  const empty = createEmptyOnTimePlan("UTC");
  assert.equal(isMeaningfulOnTimePlan(empty), false);
  const updated = updateOnTimePlan(empty, { destinationLabel: "Airport" }, new Date("2026-01-01T00:00:00Z"));
  assert.equal(isMeaningfulOnTimePlan(updated), true);
  assert.equal(empty.destinationLabel, "");
});

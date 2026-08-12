import assert from "node:assert/strict";
import test from "node:test";

import { adaptLegacyTaskState } from "../src/lib/task-state-engine/legacy-adapter.ts";
import { SHADOW_NOW, legacyHistory, legacyTask } from "./task-state-engine-shadow-fixtures.ts";

const ADAPTER_OPTIONS = {
  now: SHADOW_NOW,
  timezone: "America/New_York",
  logicalDayRollover: "06:00",
};

test("legacy adapter maps every recurrence shape and keeps lifecycle separate", () => {
  const cases = [
    [legacyTask({ repeat_frequency: "none" }), "none"],
    [legacyTask({ repeat_frequency: "daily", repeat_interval: 1 }), "rolling"],
    [legacyTask({ repeat_frequency: "custom", repeat_interval: 9 }), "rolling"],
    [legacyTask({ repeat_frequency: "daily_until_complete", repeat_interval: 2 }), "rolling"],
    [legacyTask({ repeat_frequency: "weekly", repeat_interval: 2, repeat_days_of_week: [1, 4] }), "weekly"],
    [legacyTask({ repeat_frequency: "monthly", repeat_day_of_month: 15 }), "monthly"],
    [legacyTask({
      repeat_frequency: "monthly",
      repeat_monthly_mode: "ordinal_weekday",
      repeat_monthly_ordinal: "last",
      repeat_monthly_weekday: 5,
    }), "monthly"],
  ] as const;
  for (const [source, expectedKind] of cases) {
    assert.equal(adaptLegacyTaskState(source, [], ADAPTER_OPTIONS).engineInput.task.recurrence.kind, expectedKind);
  }
  const archived = adaptLegacyTaskState(legacyTask({ status: "archived", due_on: null }), [], ADAPTER_OPTIONS);
  assert.equal(archived.engineInput.task.lifecycle, "archived");
  assert.equal(archived.engineInput.task.activeStatus, "unscheduled");
  assert.equal(archived.unsupported[0]?.code, "lifecycle_active_status_unavailable");
});

test("legacy History mapping preserves explicit outcome and occurrence identity", () => {
  const task = legacyTask({ id: "mapped" });
  const source = legacyHistory("mapped", "2026-07-29", "done", {
    occurrence_due_on: "2026-07-30",
    occurrence_key: "canonical-occurrence",
    counted_as_due_occurrence: true,
  });
  const result = adaptLegacyTaskState(task, [source], ADAPTER_OPTIONS);
  const mapped = result.engineInput.history[0];
  assert.deepEqual({
    id: mapped?.id,
    taskId: mapped?.taskId,
    logicalDate: mapped?.logicalDate,
    outcome: mapped?.outcome,
    provenance: mapped?.provenance,
    occurredAt: mapped?.occurredAt,
    occurrenceIdentity: mapped?.occurrenceIdentity,
  }, {
    id: source.id,
    taskId: "mapped",
    logicalDate: "2026-07-29",
    outcome: "done",
    provenance: "import",
    occurredAt: source.updated_at,
    occurrenceIdentity: "canonical-occurrence",
  });
  assert.equal(mapped?.occurrenceDueOn, "2026-07-30");
  assert.equal(mapped?.countedAsDueOccurrence, true);
  assert.equal(mapped?.wasCompleted, true);
  assert.equal(mapped?.eventType, "status");
});

test("malformed legacy values warn and adaptation never mutates source objects", () => {
  const task = legacyTask({
    id: "malformed",
    repeat_frequency: "weekly",
    repeat_interval: 0,
    repeat_days_of_week: [1, 9],
  });
  const malformed = task as unknown as Record<string, unknown>;
  malformed.due_on = "not-a-date";
  const history = [legacyHistory("malformed", "2026-07-29", "done")];
  const before = structuredClone({ task, history });
  const result = adaptLegacyTaskState(task, history, ADAPTER_OPTIONS);
  assert.ok(result.warnings.some((warning) => warning.code === "malformed_date"));
  assert.ok(result.warnings.some((warning) => warning.code === "malformed_positive_integer"));
  assert.ok(result.warnings.some((warning) => warning.code === "malformed_weekdays"));
  assert.deepEqual({ task, history }, before);
});

test("legacy adapter diagnoses absent task-level recurrence metadata and accepts it when available", () => {
  const absent = adaptLegacyTaskState(
    legacyTask({ id: "metadata-absent", repeat_frequency: "daily" }),
    [],
    ADAPTER_OPTIONS,
  );
  assert.ok(absent.unsupported.some((item) => item.code === "recurrence_cursor_unavailable"));
  assert.ok(absent.unsupported.some((item) => item.code === "satisfied_occurrence_identity_unavailable"));

  const available = adaptLegacyTaskState({
    ...legacyTask({ id: "metadata-available", repeat_frequency: "daily" }),
    recurrence_cursor: "2026-07-29",
    satisfied_occurrence_identity: "task:metadata-available:occurrence:2026-07-29",
  }, [], ADAPTER_OPTIONS);
  assert.equal(available.engineInput.task.recurrenceCursor, "2026-07-29");
  assert.equal(
    available.engineInput.task.satisfiedOccurrenceIdentity,
    "task:metadata-available:occurrence:2026-07-29",
  );
  assert.equal(available.unsupported.some((item) => item.code.includes("_unavailable")), false);
});

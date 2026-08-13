import assert from "node:assert/strict";
import test from "node:test";
import { mapCanonicalTaskHistoryFact, mapCanonicalTaskHistoryFacts } from "@/lib/task-state-canonical/history-projection";
import type { CanonicalTaskHistoryFact } from "@/lib/task-state-canonical/types";
import { adaptLegacyTaskState } from "@/lib/task-state-engine/legacy-adapter";

function fact(overrides: Partial<CanonicalTaskHistoryFact> = {}): CanonicalTaskHistoryFact {
  return {
    id: "fact-1",
    user_id: "user-1",
    entity_id: "task-1",
    entity_kind: "parent",
    logical_date: "2026-08-10",
    outcome: "done",
    event_kind: "explicit_outcome",
    occurrence_id: "occurrence-1",
    scheduled_due_on: "2026-08-10",
    effective_due_on: "2026-08-10",
    schedule_boundary_id: "boundary-1",
    recurrence_source_fingerprint: null,
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: "user-1",
    source: "task-state-command",
    logical_day_settings_revision: 1,
    timezone: "America/New_York",
    day_start_time: "06:00",
    command_id: "command-1",
    idempotence_identity: "command-1:history",
    migration_operation_id: null,
    source_legacy_history_id: null,
    revision: 1,
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

test("canonical History facts project into the existing read shape with identity and provenance", () => {
  const projected = mapCanonicalTaskHistoryFact(fact());
  assert.deepEqual(projected, {
    id: "fact-1",
    task_id: "task-1",
    user_id: "user-1",
    entry_date: "2026-08-10",
    occurrence_key: "task:task-1:occurrence:2026-08-10",
    occurrence_due_on: "2026-08-10",
    status: "done",
    event_type: "status",
    counted_as_due_occurrence: true,
    was_completed: true,
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:00:00.000Z",
    canonical_fact_id: "fact-1",
    canonical_occurrence_id: "occurrence-1",
    canonical_provenance_kind: "user",
    canonical_command_id: "command-1",
    canonical_source: "task-state-command",
    recurrence_authoritative: true,
  });
});

test("migration reconstruction without a canonical occurrence is non-authoritative for recurrence", () => {
  assert.equal(mapCanonicalTaskHistoryFact(fact({ provenance_kind: "migration_reconstruction", occurrence_id: null, command_id: null })).recurrence_authoritative, false);
  assert.equal(mapCanonicalTaskHistoryFact(fact({ provenance_kind: "migration_reconstruction", occurrence_id: "occurrence-1", command_id: null })).recurrence_authoritative, true);
});

test("canonical recurrence-authority metadata survives the legacy engine adapter", () => {
  const projected = mapCanonicalTaskHistoryFact(fact({ provenance_kind: "migration_reconstruction", occurrence_id: null, command_id: null, scheduled_due_on: "2026-08-10" }));
  const adapted = adaptLegacyTaskState({
    id: "task-1",
    status: "pending",
    due_on: "2026-08-10",
    repeat_frequency: "daily",
    repeat_interval: 1,
  }, [projected], {
    now: "2026-08-12T12:00:00.000Z",
    timezone: "UTC",
    logicalDayRollover: "00:00",
  });
  assert.equal(adapted.engineInput.history[0]?.recurrenceAuthoritative, false);
});

test("projection does not manufacture calculated Missed rows", () => {
  const rows = mapCanonicalTaskHistoryFacts([
    fact({ outcome: "done" }),
    fact({ id: "fact-2", logical_date: "2026-08-09", outcome: "missed" }),
  ]);
  assert.deepEqual(rows.map((row) => [row.entry_date, row.status]), [["2026-08-10", "done"], ["2026-08-09", "missed"]]);
  assert.equal(rows.some((row) => row.entry_date === "2026-08-08"), false);
});

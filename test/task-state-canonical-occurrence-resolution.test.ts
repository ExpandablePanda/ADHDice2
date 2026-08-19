import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalTaskOccurrence } from "../src/lib/task-state-canonical/occurrence-resolution.ts";
import type { CanonicalTaskOccurrence } from "../src/lib/task-state-canonical/types.ts";

function occurrence(overrides: Partial<CanonicalTaskOccurrence> = {}): CanonicalTaskOccurrence {
  return {
    id: "occurrence-1",
    user_id: "user-1",
    entity_id: "task-1",
    entity_kind: "parent",
    occurrence_key: "task:task-1:occurrence:2026-08-10",
    scheduled_due_on: "2026-08-10",
    source_boundary_id: "boundary-1",
    recurrence_source_fingerprint: "fingerprint-1",
    origin_kind: "proven",
    origin_confidence: "proven",
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: "user-1",
    source: "task-state-command",
    materialization_reason: "required_command_state",
    resolution_state: "unresolved",
    resolved_logical_date: null,
    resolved_outcome: null,
    resolved_history_id: null,
    command_id: null,
    revision: 1,
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

function clientFor(rows: CanonicalTaskOccurrence[], error: { message: string } | null = null) {
  const query = {
    select: () => query,
    eq: () => query,
    order: async () => ({ data: rows, error }),
  };
  return { from: () => query } as never;
}

test("Delay resolution prefers trusted identity and ignores superseded occurrences", async () => {
  const trusted = occurrence({ id: "occurrence-trusted" });
  const superseded = occurrence({ id: "occurrence-old", resolution_state: "superseded" });
  const result = await resolveCanonicalTaskOccurrence(clientFor([superseded, trusted]), "user-1", "task-1", {
    logicalDate: "2026-08-10",
    occurrenceId: "occurrence-trusted",
    occurrenceKey: trusted.occurrence_key,
    scheduledDueOn: trusted.scheduled_due_on,
  });
  assert.equal(result.error, null);
  assert.equal(result.occurrence?.id, "occurrence-trusted");
});

test("Delay resolution fails closed when no materialized occurrence exists", async () => {
  const result = await resolveCanonicalTaskOccurrence(clientFor([]), "user-1", "task-1", {
    logicalDate: "2026-08-10",
    scheduledDueOn: "2026-08-10",
  });
  assert.equal(result.occurrence, null);
  assert.match(result.error ?? "", /No valid canonical occurrence exists/);
  assert.match(result.error ?? "", /Delay was not written/);
});

test("occurrence read failures remain fail-closed", async () => {
  const result = await resolveCanonicalTaskOccurrence(clientFor([], { message: "canonical occurrence read failed" }), "user-1", "task-1", {});
  assert.equal(result.occurrence, null);
  assert.equal(result.error, "canonical occurrence read failed");
});

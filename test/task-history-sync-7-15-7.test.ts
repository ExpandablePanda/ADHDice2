import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyTaskHistoryDelta,
  parseTaskHistoryDeltaResponse,
  TaskHistorySyncError,
} from "../src/lib/task-history-sync.ts";
import {
  createIndexedDbTaskHistoryCache,
  isCanonicalTaskHistoryFact,
  TASK_HISTORY_CACHE_SCHEMA_VERSION,
  TASK_HISTORY_SYNC_PROTOCOL_VERSION,
} from "../src/lib/task-history-sync-cache.ts";
import type { CanonicalTaskHistoryFact } from "../src/lib/task-state-canonical/types.ts";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const TASK_ID = "00000000-0000-4000-8000-000000000010";

function fact(id: string, logicalDate = "2026-09-22", outcome: CanonicalTaskHistoryFact["outcome"] = "done"): CanonicalTaskHistoryFact {
  return {
    id,
    user_id: USER_ID,
    entity_id: TASK_ID,
    entity_kind: "parent",
    logical_date: logicalDate,
    outcome,
    event_kind: "explicit_outcome",
    occurrence_id: null,
    scheduled_due_on: logicalDate,
    effective_due_on: null,
    schedule_boundary_id: null,
    recurrence_source_fingerprint: null,
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: USER_ID,
    source: "test",
    logical_day_settings_revision: 1,
    timezone: "America/New_York",
    day_start_time: "04:00:00",
    command_id: USER_ID,
    idempotence_identity: id,
    source_legacy_history_id: null,
    revision: 1,
    created_at: "2026-09-22T12:00:00.000Z",
    updated_at: "2026-09-22T12:00:00.000Z",
  };
}

function delta(changes: unknown[], fromRevision = 1, toRevision = 2) {
  return {
    protocolVersion: TASK_HISTORY_SYNC_PROTOCOL_VERSION,
    syncEpoch: "00000000-0000-4000-8000-000000000099",
    fromRevision,
    toRevision,
    continuity: { isContiguous: true, firstRevision: fromRevision + 1, lastRevision: toRevision },
    completeness: { isComplete: true, scope: "canonical-task-history" },
    changes,
  };
}

test("delta parser accepts complete upserts and deletes but rejects redundant final facts", () => {
  const nextFact = fact("00000000-0000-4000-8000-000000000011", "2026-09-23");
  const response = parseTaskHistoryDeltaResponse(delta([
    { operation: "upsert", historyFactId: nextFact.id, entityId: TASK_ID, logicalDate: nextFact.logical_date, fact: nextFact },
    { operation: "delete", historyFactId: "00000000-0000-4000-8000-000000000012", entityId: TASK_ID, logicalDate: "2026-09-24" },
  ]), USER_ID);
  assert.equal(response.changes.length, 2);
  assert.equal(response.changes[0]?.operation, "upsert");
  assert.equal(response.changes[1]?.operation, "delete");
  const unchanged = parseTaskHistoryDeltaResponse({
    ...delta([], 2, 2),
    continuity: { isContiguous: true, firstRevision: null, lastRevision: null },
  }, USER_ID);
  assert.deepEqual(unchanged.changes, []);
  assert.throws(
    () => parseTaskHistoryDeltaResponse(delta([
      { operation: "delete", historyFactId: nextFact.id, entityId: TASK_ID, logicalDate: nextFact.logical_date },
      { operation: "delete", historyFactId: nextFact.id, entityId: TASK_ID, logicalDate: nextFact.logical_date },
    ]), USER_ID),
    (error: unknown) => error instanceof TaskHistorySyncError && error.code === "duplicate-final-change",
  );
});

test("delta application atomically models upsert and tombstone semantics", () => {
  const original = fact("00000000-0000-4000-8000-000000000011");
  const replacement = fact(original.id, original.logical_date, "did_my_best");
  const added = fact("00000000-0000-4000-8000-000000000012", "2026-09-23");
  const response = parseTaskHistoryDeltaResponse(delta([
    { operation: "upsert", historyFactId: replacement.id, entityId: TASK_ID, logicalDate: replacement.logical_date, fact: replacement },
    { operation: "upsert", historyFactId: added.id, entityId: TASK_ID, logicalDate: added.logical_date, fact: added },
    { operation: "delete", historyFactId: "00000000-0000-4000-8000-000000000013", entityId: TASK_ID, logicalDate: "2026-09-24" },
  ]), USER_ID);
  const result = applyTaskHistoryDelta([original, fact("00000000-0000-4000-8000-000000000013", "2026-09-24")], response, USER_ID);
  assert.deepEqual(result.map((entry) => entry.id).sort(), [replacement.id, added.id].sort());
  assert.equal(result.find((entry) => entry.id === replacement.id)?.outcome, "did_my_best");
  assert.equal(isCanonicalTaskHistoryFact(result[0], USER_ID), true);
});

test("IndexedDB cache is schema-versioned, user-scoped, and recoverable when unavailable", async () => {
  assert.equal(TASK_HISTORY_CACHE_SCHEMA_VERSION, 1);
  const cache = createIndexedDbTaskHistoryCache();
  const result = await cache.read(USER_ID);
  assert.ok(result.status === "unavailable" || result.status === "miss");
  assert.match(JSON.stringify(cache), /^\{\}$/);
});

test("SQL delta source is owner-scoped, read-only, fenced, contiguous, and final-state collapsed", async () => {
  const migration = await readFile(new URL("../supabase/add_task_history_delta_sync_7_15_7.sql", import.meta.url), "utf8");
  const canonicalSchema = await readFile(new URL("../supabase/add_task_state_canonical_schema.sql", import.meta.url), "utf8");
  const functionBody = migration.slice(migration.indexOf("create or replace function"), migration.indexOf("revoke all on function"));
  for (const source of [migration, canonicalSchema]) {
    assert.match(source, /adhdice_get_task_history_delta/);
    assert.match(source, /security definer/);
    assert.match(source, /set search_path = ''/);
    assert.match(source, /auth\.uid\(\)/);
    assert.match(source, /for share/);
    assert.match(source, /generate_series/);
    assert.match(source, /select distinct on \(changes\.history_fact_id\)/);
    assert.match(source, /to_jsonb\(facts\)/);
    assert.match(source, /grant execute on function public\.adhdice_get_task_history_delta/);
  }
  assert.doesNotMatch(functionBody, /\b(insert|update|delete)\s+(into\s+)?public\./i);
  assert.doesNotMatch(migration, /p_user_id/);
});

test("workspace wiring uses the canonical cache/delta path and leaves Records authority untouched", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  assert.match(source, /indexedDbTaskHistoryCache/);
  assert.match(source, /readTaskHistorySyncState/);
  assert.match(source, /fetchTaskHistoryDelta/);
  assert.match(source, /replaceSnapshot/);
  assert.match(source, /applyDelta/);
  assert.match(source, /path: "validated-cache-hit"/);
  assert.match(source, /path: "delta-sync"/);
  assert.match(source, /path: "full-bootstrap"/);
  assert.match(source, /bootstrap-revision-raced/);
  assert.match(source, /scheduleTaskHistoryRevisionReconciliation/);
  assert.doesNotMatch(source, /runRecordsPipeline/);
});

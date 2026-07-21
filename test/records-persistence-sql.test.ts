import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/add_records_foundation.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

test("Records SQL owns narrow current/event tables with owner RLS and uniqueness", () => {
  for (const source of [migration, schema]) {
    assert.match(source, /adhdice_record_current/);
    assert.match(source, /adhdice_record_events/);
    assert.match(source, /enable row level security/);
    assert.match(source, /auth\.uid\(\) = user_id/);
    assert.match(source, /event_identity/);
    assert.match(source, /coalesce\(scope_id, ''\)/);
  }
});

test("reconciliation uses auth ownership, a Records lock, complete replacement, idempotent events, and correction invalidation", () => {
  for (const source of [migration, schema]) {
    assert.match(source, /v_user_id uuid := auth\.uid\(\)/);
    assert.match(source, /adhdice:records:/);
    assert.match(source, /delete from public\.adhdice_record_current/);
    assert.match(source, /on conflict \(user_id, rules_version, event_identity\) do update/);
    assert.match(source, /absent_from_complete_recalculation/);
    assert.doesNotMatch(source, /first_qualified_at = excluded\.first_qualified_at/, "matching replay must preserve first-qualified metadata");
  }
});

test("RPC rejects malformed versions/payloads and does not touch Achievement tables", () => {
  assert.match(migration, /\^records-v\[1-9\]\[0-9\]\*\$/);
  assert.match(migration, /Invalid Records recalculation payload/);
  assert.doesNotMatch(migration, /adhdice_achievement_(?:progress|tier_awards|notifications)/);
});

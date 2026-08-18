import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const preview = readFileSync(new URL("../supabase/preview_legacy_history_copy_7_9_33.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrate_legacy_history_copy_7_9_33.sql", import.meta.url), "utf8");
const verification = readFileSync(new URL("../supabase/verify_legacy_history_copy_7_9_33.sql", import.meta.url), "utf8");

test("7.9.33 migration dynamically copies every remaining legacy-only date", () => {
  for (const sql of [preview, migration, verification]) {
    assert.doesNotMatch(sql, /confirmed_task_ids|exact_task_id_count|\b55\b/);
    assert.match(sql, /adhdice_task_history_facts/);
    assert.match(sql, /source_legacy_history_id/);
  }
  assert.match(preview, /where fact\.id is null/);
  assert.match(preview, /ELIGIBLE_COPY/);
  assert.match(migration, /create temporary table adhdice_7_9_33_legacy_only/);
  assert.match(migration, /on conflict \(user_id, entity_id, logical_date\) do nothing/);
  assert.match(migration, /legacy\.occurrence_due_on as scheduled_due_on/);
  assert.match(migration, /candidate\.scheduled_due_on/);
  assert.match(migration, /to_jsonb\(task\) is distinct from snapshot\.task_snapshot/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.adhdice_task_history\b/i);
  assert.doesNotMatch(migration, /adhdice_task_occurrences\s*\(/i);
  assert.doesNotMatch(migration, /adhdice_task_schedule_boundaries\s*\(/i);
  assert.doesNotMatch(migration, /adhdice_task_reward_entitlements\s*\(/i);
  for (const metric of ["remaining_eligible_legacy_only_rows", "explicit_metadata_violations", "duplicate_source_fact_violations", "migrated_reward_violations", "task_state_fingerprint_violations"]) {
    assert.match(verification, new RegExp(metric));
  }
});

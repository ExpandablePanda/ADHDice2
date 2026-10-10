import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/patch_health_journal_tombstone_trigger_7_16_133.sql", import.meta.url), "utf8");
const functionDefinition = migration.match(/create or replace function private\.adhdice_guard_health_journal_record_tombstone\(\)[\s\S]*?\$function\$;/i)?.[0];

test("Journal tombstone repair nests child ownership access behind the child entity guard", () => {
  assert.ok(functionDefinition, "corrective migration must replace the existing trigger function");
  const normalized = functionDefinition.toLowerCase();

  assert.match(normalized, /language plpgsql\s+security definer\s+set search_path = ''/);
  assert.match(normalized, /if tg_op = 'update' and v_entity in \('signal_value', 'signal_occurrence', 'symptom_entry'\) then\s+if old\.journal_entry_id is distinct from new\.journal_entry_id then/);
  assert.equal((normalized.match(/(?:old|new)\.journal_entry_id/g) ?? []).length, 2);
  assert.doesNotMatch(normalized, /and v_entity in \([^)]*\)\s+and old\.journal_entry_id/);

  assert.match(normalized, /old\.user_id is distinct from new\.user_id or old\.id is distinct from new\.id/);
  assert.match(normalized, /pg_catalog\.pg_advisory_xact_lock\([\s\S]*hashtextextended\(v_user_id::text \|\| ':' \|\| v_entity \|\| ':' \|\| v_record_id::text, 0\)/);
  assert.match(normalized, /if found then\s+insert into public\.adhdice_health_journal_record_tombstones/);
  assert.match(normalized, /from auth\.users as account_user[\s\S]*for key share/);
  assert.match(normalized, /on conflict \(user_id, entity, record_id\) do nothing/);
  assert.match(normalized, /from public\.adhdice_health_journal_record_tombstones as tombstone[\s\S]*raise exception[\s\S]*this journal record was deleted and cannot be restored/);
  assert.match(normalized, /return old;[\s\S]*return new;/);
});

test("Journal tombstone correction is idempotent and leaves trigger bindings untouched", () => {
  assert.equal((migration.match(/create or replace function private\.adhdice_guard_health_journal_record_tombstone\(\)/gi) ?? []).length, 1);
  assert.match(migration, /revoke all on function private\.adhdice_guard_health_journal_record_tombstone\(\) from public, anon, authenticated;/i);
  assert.doesNotMatch(migration, /\b(?:drop|create)\s+trigger\b/i);
  assert.doesNotMatch(migration, /\balter\s+table\b/i);
  assert.match(migration, /begin;[\s\S]*commit;\s*$/i);
});

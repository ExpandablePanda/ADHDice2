import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("7.16.22 quota migration is source-only, bounded, and RLS-protected", async () => {
  const sql = await readFile(new URL("../supabase/patch_task_quota_recurrence_7_16_22.sql", import.meta.url), "utf8");
  const enumSql = await readFile(new URL("../supabase/patch_task_quota_recurrence_enum_7_16_22.sql", import.meta.url), "utf8");
  const canonicalSchema = await readFile(new URL("../supabase/add_task_state_canonical_schema.sql", import.meta.url), "utf8");
  const runtimeSql = await readFile(new URL("../supabase/patch_task_quota_recurrence_runtime_7_16_23.sql", import.meta.url), "utf8");
  assert.match(enumSql, /add value if not exists 'per_week'/);
  assert.match(enumSql, /add value if not exists 'per_month'/);
  assert.match(sql, /after patch_task_quota_recurrence_enum_7_16_22\.sql has committed/i);
  assert.doesNotMatch(sql, /add value if not exists 'per_(week|month)'/);
  assert.match(sql, /repeat_quota_count between 1 and 7/);
  assert.match(sql, /repeat_quota_count between 1 and 31/);
  assert.match(sql, /create table if not exists public\.adhdice_task_quota_period_facts/);
  assert.match(sql, /alter table public\.adhdice_task_quota_period_facts enable row level security/);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  for (const source of [canonicalSchema, runtimeSql]) {
    assert.match(source, /foreign key \(user_id, entity_id\)[\s\S]*references public\.adhdice_clean_tasks \(user_id, id\)/);
    assert.match(source, /foreign key \(user_id, schedule_boundary_id\)[\s\S]*references public\.adhdice_task_schedule_boundaries \(user_id, id\)/);
    assert.match(source, /foreign key \(user_id, command_id\)[\s\S]*references public\.adhdice_task_command_operations \(user_id, command_id\)/);
  }
  assert.doesNotMatch(sql, /apply_migration|supabase db push|supabase functions deploy/);
});

test("bootstrap ruleset revision constraint names are unique after PostgreSQL truncation", async () => {
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  const tableBody = schema.match(/create table public\.adhdice_custom_behavior_ruleset_revisions \(([\s\S]*?)\n\);/)?.[1];
  assert.ok(tableBody, "ruleset revision table missing from bootstrap schema");
  const names = [...tableBody.matchAll(/\bconstraint\s+([A-Za-z0-9_]+)/g)].map((match) => match[1]);
  const truncatedNames = names.map((name) => name.slice(0, 63));
  assert.equal(new Set(truncatedNames).size, truncatedNames.length, "bootstrap constraint names collide after PostgreSQL truncation");
  assert.deepEqual(
    names.filter((name) => name.startsWith("adhdice_ruleset_rev_needs_actions")),
    ["adhdice_ruleset_rev_needs_actions_check", "adhdice_ruleset_rev_needs_actions_no_null_check"],
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("7.16.22 quota migration is source-only, bounded, and RLS-protected", async () => {
  const sql = await readFile(new URL("../supabase/patch_task_quota_recurrence_7_16_22.sql", import.meta.url), "utf8");
  assert.match(sql, /add value if not exists 'per_week'/);
  assert.match(sql, /add value if not exists 'per_month'/);
  assert.match(sql, /repeat_quota_count between 1 and 7/);
  assert.match(sql, /repeat_quota_count between 1 and 31/);
  assert.match(sql, /create table if not exists public\.adhdice_task_quota_period_facts/);
  assert.match(sql, /alter table public\.adhdice_task_quota_period_facts enable row level security/);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(sql, /apply_migration|supabase db push|supabase functions deploy/);
});

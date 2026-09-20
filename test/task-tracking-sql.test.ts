import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/patch_task_tracking_exclusion_7_13_84.sql", import.meta.url), "utf8");

test("7.13.84 tracking SQL is additive, inherited, cycle-safe, and authenticated", () => {
  assert.match(sql, /add column if not exists exclude_from_tracking boolean not null default false/i);
  assert.match(sql, /with recursive ancestry as/i);
  assert.match(sql, /where not parent\.id = any\(ancestry\.path\)/i);
  assert.match(sql, /p_user_id uuid[\s\S]*p_task_id uuid/);
  assert.match(sql, /adhdice_set_task_tracking_exclusion/);
  assert.match(sql, /permanently_deleted_at is null/);
  assert.match(sql, /state = 'blocked'/);
  assert.match(sql, /before insert on public\.adhdice_task_reward_entitlements/);
  assert.match(sql, /before update of state on public\.adhdice_task_reward_entitlements/);
  assert.match(sql, /adhdice_recalculate_achievements/);
  assert.doesNotMatch(sql, /delete from public\.adhdice_task_reward_entitlements/i);
  assert.doesNotMatch(sql, /delete from public\.adhdice_task_reward_grants/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/add_focus_runtime_soft_close.sql", import.meta.url), "utf8");

test("follow-up migration adds constrained soft-closure fields without rewriting active rows", () => {
  assert.match(sql, /add column if not exists closed_at timestamptz/);
  assert.match(sql, /add column if not exists close_reason text/);
  assert.match(sql, /close_reason in \('reset', 'completed', 'stopped'\)/);
  assert.doesNotMatch(sql, /update public\.adhdice_focus_active_sessions\s+set closed_at/i);
});

test("active-slot indexes are catalog-checked and unique only for open rows", () => {
  assert.match(sql, /to_regclass\('public\.adhdice_focus_runtime_category_slot_unique'\)/);
  assert.match(sql, /where runtime_kind = 'category' and closed_at is null/);
  assert.match(sql, /where runtime_kind = 'standalone_countdown' and closed_at is null/);
  assert.doesNotMatch(sql, /unique[^;]+\(user_id\)\s*where runtime_kind = 'standalone_countdown';/);
});

test("reset and stop lock the runtime and close it with a revisioned UPDATE", () => {
  assert.match(sql, /where user_id = v_user_id and session_id = p_session_id for update/);
  assert.match(sql, /p_action in \('reset', 'delete'\)/);
  assert.match(sql, /closed_at = v_now/);
  assert.match(sql, /case when p_action = 'reset' then 'reset' else 'stopped' end/);
  assert.match(sql, /revision = revision \+ 1/);
  assert.doesNotMatch(sql, /delete from public\.adhdice_focus_active_sessions/);
});

test("completion preserves one history/economy transaction then soft-closes completed", () => {
  assert.match(sql, /runtime_session_id = p_session_id/);
  assert.match(sql, /create unique index if not exists adhdice_focus_sessions_runtime_session_unique/);
  assert.match(sql, /floor\(floor\(v_duration \/ 60\.0\) \* 1\.5\)/);
  assert.match(sql, /free_roll_bank = free_roll_bank \+ v_level_ups/);
  assert.match(sql, /close_reason = 'completed'/);
  assert.match(sql, /'completed_session', to_jsonb\(v_completed\)/);
});

test("repeated reset and completion return authoritative replay results", () => {
  assert.match(sql, /if found then return v_existing\.result_payload/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(v_user_id::text \|\| ':' \|\| p_operation_id::text/);
  assert.match(sql, /v_runtime\.closed_at is not null/);
  assert.match(sql, /'was_replayed', true/);
  assert.match(sql, /exception when unique_violation/);
});

test("creation and legacy migration ignore historical closed rows", () => {
  assert.match(sql, /insert into public\.adhdice_focus_active_sessions/);
  assert.match(sql, /runtime_kind = 'standalone_countdown' and closed_at is null for update/);
  assert.match(sql, /runtime_kind = 'category' and category_id = p_category_id and closed_at is null for update/);
});

test("RLS, grants, publication, and function replacement remain strict and rerunnable", () => {
  assert.match(sql, /^-- 6\.29\.14/);
  assert.match(sql, /begin;/);
  assert.match(sql, /create or replace function public\.adhdice_transition_focus_runtime/);
  assert.match(sql, /create or replace function public\.adhdice_complete_focus_runtime/);
  assert.match(sql, /revoke all on public\.adhdice_focus_active_sessions from anon, authenticated/);
  assert.match(sql, /for select using \(auth\.uid\(\) = user_id\)/);
  assert.match(sql, /drop policy if exists "Users can delete their own active focus sessions"/);
  assert.match(sql, /grant select on public\.adhdice_focus_active_sessions to authenticated/);
  assert.match(sql, /pg_publication_tables/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.match(sql, /commit;\s*$/);
});

test("soft-close follow-up does not touch counters, activity, or DELETE replication", () => {
  assert.doesNotMatch(sql, /focus_counter/i);
  assert.doesNotMatch(sql, /focus_activity/i);
  assert.doesNotMatch(sql, /replica identity/i);
  assert.doesNotMatch(sql, /broadcast/i);
});

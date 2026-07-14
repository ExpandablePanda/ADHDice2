import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/add_focus_counter_sync.sql", import.meta.url), "utf8");

test("counter schema, durable events, audit data, and required indexes are declared", () => {
  assert.match(sql, /create table if not exists public\.adhdice_focus_counters/);
  assert.match(sql, /value bigint not null default 0/);
  assert.match(sql, /sort_order bigint not null/);
  assert.match(sql, /deleted_at timestamptz/);
  assert.match(sql, /create table if not exists public\.adhdice_focus_counter_events/);
  assert.match(sql, /unique \(user_id, operation_id\)/);
  assert.match(sql, /create table if not exists public\.adhdice_focus_counter_migrations/);
  assert.match(sql, /unique \(user_id, device_installation_id, migration_batch_id\)/);
});

test("mutations are authenticated, user-scoped, locked, revisioned, and replay-safe", () => {
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/g);
  assert.match(sql, /where user_id = v_user_id and id = p_counter_id for update/);
  assert.match(sql, /p_expected_revision <> v_counter\.revision/);
  assert.match(sql, /where user_id = v_user_id and operation_id = p_operation_id/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(v_user_id::text \|\| ':' \|\| p_operation_id::text/);
  assert.match(sql, /'was_replayed', true/);
});

test("concurrent adjustments use the locked current step without rejecting stale revisions", () => {
  const adjustBranch = sql.slice(sql.indexOf("if p_action = 'adjust'"), sql.indexOf("elsif p_action in ('set_value', 'update')"));
  assert.match(adjustBranch, /v_delta := v_counter\.step/);
  assert.match(adjustBranch, /set value = value \+ v_delta, revision = revision \+ 1/);
  assert.doesNotMatch(adjustBranch, /p_expected_revision/);
});

test("absolute value edits append set_value snapshots and stale edits return server state", () => {
  assert.match(sql, /p_action_payload \? 'value' then 'set_value'/);
  assert.match(sql, /'conflict', true, 'counter', to_jsonb\(v_counter\)/);
  assert.match(sql, /previous_value, next_value/);
  assert.match(sql, /title_snapshot, step_snapshot/);
});

test("delete is a soft Realtime-compatible update and never removes events", () => {
  assert.match(sql, /set deleted_at = statement_timestamp\(\), revision = revision \+ 1/);
  assert.doesNotMatch(sql, /delete from public\.adhdice_focus_counter_events/);
  assert.doesNotMatch(sql, /references public\.adhdice_focus_counters\(id\) on delete cascade/);
});

test("first migration preserves order while later devices never merge by title or sum", () => {
  assert.match(sql, /v_ordinality - 1/);
  assert.match(sql, /v_legacy_id_map/);
  assert.match(sql, /if v_counter_count = 0 then/);
  const laterDeviceBranch = sql.slice(sql.indexOf("else\n    select coalesce(jsonb_agg"), sql.indexOf("select jsonb_build_object(\n    'ok'"));
  assert.doesNotMatch(laterDeviceBranch, /insert into public\.adhdice_focus_counters/);
  assert.doesNotMatch(laterDeviceBranch, /title\s*=/);
  assert.doesNotMatch(laterDeviceBranch, /value\s*\+/);
  assert.match(laterDeviceBranch, /v_local_differed/);
});

test("RLS exposes own rows read-only and mutation RPCs cannot accept user IDs", () => {
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /using \(auth\.uid\(\) = user_id\)/g);
  assert.match(sql, /revoke all on public\.adhdice_focus_counters from anon, authenticated/);
  assert.match(sql, /grant select on public\.adhdice_focus_counter_events to authenticated/);
  assert.match(sql, /grant execute on function public\.adhdice_mutate_focus_counter/);
  assert.doesNotMatch(sql, /adhdice_mutate_focus_counter\([\s\S]{0,220}p_user_id/);
});

test("schema, policies, publications, grants, and RPC definitions are rerunnable", () => {
  assert.match(sql, /^begin;/);
  assert.match(sql, /create table if not exists/g);
  assert.match(sql, /create (unique )?index if not exists/g);
  assert.match(sql, /drop policy if exists/g);
  assert.match(sql, /create or replace function public\.adhdice_mutate_focus_counter/);
  assert.match(sql, /create or replace function public\.adhdice_migrate_focus_counters/);
  assert.match(sql, /pg_publication_tables/g);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.match(sql, /commit;\s*$/);
});

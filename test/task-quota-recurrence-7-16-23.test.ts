import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => fs.readFileSync(new URL(path, root), "utf8");

test("7.16.23 migration installs the quota runtime RPCs in order", () => {
  const migration = read("supabase/patch_task_quota_recurrence_runtime_7_16_23.sql");
  assert.match(migration, /create or replace function public\.adhdice_execute_task_state_command\(/);
  assert.match(migration, /create or replace function public\.adhdice_create_canonical_task\(/);
  assert.match(migration, /create or replace function public\.adhdice_get_task_current_projection_source_fences\(/);
  assert.match(migration, /quota_period_facts/);
  assert.match(migration, /reward_eligible/);
  assert.doesNotMatch(migration, /\\i\s+/i);
  assert.match(migration, /commit;\s*$/);
});

test("quota ledger source definitions agree across bootstrap and runtime migration", () => {
  const bootstrap = read("supabase/add_task_state_canonical_schema.sql");
  const schema = read("supabase/schema.sql");
  const migration = read("supabase/patch_task_quota_recurrence_runtime_7_16_23.sql");
  for (const source of [bootstrap, schema, migration]) {
    for (const field of [
      "schedule_boundary_id", "period_kind", "period_key", "period_start", "period_end",
      "base_quota", "incoming_balance", "successful_days", "next_balance", "balance_enabled",
      "event_kind", "command_id", "idempotence_identity", "revision", "updated_at",
    ]) {
      assert.match(source, new RegExp(`\\b${field}\\b`), `${field} missing from source package`);
    }
  }
  assert.match(bootstrap, /foreign key \(user_id, schedule_boundary_id\)/);
  assert.match(bootstrap, /foreign key \(user_id, command_id\)/);
  assert.match(migration, /unique index if not exists adhdice_task_quota_period_facts_period_close_key/);
});

test("canonical creation SQL validates and persists quota fields", () => {
  const source = read("supabase/add_task_canonical_creation.sql");
  assert.match(source, /per_week.*per_month/);
  assert.match(source, /v_repeat_quota_count not between 1 and 7/);
  assert.match(source, /v_repeat_quota_count not between 1 and 31/);
  assert.match(source, /repeat_quota_count, repeat_quota_balance_enabled/);
  assert.match(source, /repeat_quota_balance_period/);
  assert.match(source, /boundary_type/);
  assert.match(source, /'initial'/);
});

test("reward persistence is gated by the explicit planner decision", () => {
  const source = read("supabase/add_task_state_command_rpc.sql");
  assert.match(source, /reward_eligible/);
  assert.match(source, /if v_history_id is not null and v_history_row\.outcome in \('done', 'did_my_best', 'complete'\) then/);
  assert.match(source, /if coalesce\(v_payload->>'reward_eligible', 'false'\) = 'true' then/);
});

test("projection source fences include quota ledger evidence", () => {
  assert.match(read("src/lib/task-current-projection.ts"), /quota_period_facts/);
  assert.match(read("src/lib/task-state-canonical/read-model.ts"), /adhdice_task_quota_period_facts/);
  assert.match(read("src/lib/task-state-canonical/engine-input.ts"), /scheduleBoundaryId: fact\.schedule_boundary_id/);
});

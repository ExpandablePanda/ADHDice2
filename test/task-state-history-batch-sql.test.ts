import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/patch_task_state_history_batch_achievement_boundary_7_11_84.sql", import.meta.url), "utf8");

test("History batch SQL adds only backend deferred-command and finalizer boundaries", () => {
  assert.match(migration, /create or replace function public\.adhdice_execute_task_state_command_deferred_achievements\(\s*p_user_id uuid,\s*p_command jsonb\s*\)/i);
  assert.match(migration, /set_config\('adhdice\.achievement_deferred_user_id', p_user_id::text, true\)/i);
  assert.match(migration, /return public\.adhdice_execute_task_state_command\(p_user_id, p_command\)/i);
  assert.match(migration, /create or replace function public\.adhdice_finalize_task_history_batch_achievements\(\s*p_user_id uuid,\s*p_operation_id uuid\s*\)/i);
  assert.match(migration, /return public\.adhdice_evaluate_achievements\(p_user_id, p_operation_id, 'immediate'\)/i);
  assert.match(migration, /revoke all on function public\.adhdice_execute_task_state_command_deferred_achievements\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.adhdice_execute_task_state_command_deferred_achievements\(uuid, jsonb\) to service_role/i);
  assert.match(migration, /revoke all on function public\.adhdice_finalize_task_history_batch_achievements\(uuid, uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.adhdice_finalize_task_history_batch_achievements\(uuid, uuid\) to service_role/i);
  assert.doesNotMatch(migration, /adhdice_task_command_operations\s*\(/i);
  assert.doesNotMatch(migration, /adhdice_task_history_facts\s*\(/i);
  assert.match(migration, /SOURCE ONLY/i);
});

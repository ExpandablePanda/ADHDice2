import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "../supabase/patch_task_reward_entitlement_permanence_7_10_5.sql";
const migration = readFileSync(new URL(migrationPath, import.meta.url), "utf8");
const commandSource = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const fulfillmentSource = readFileSync(new URL("../supabase/add_canonical_reward_entitlement_bridge.sql", import.meta.url), "utf8");

function extractFunction(source: string, functionPrefix: string, revokeSignature: string) {
  const start = source.indexOf(`create or replace function ${functionPrefix}`);
  assert.ok(start >= 0, `${revokeSignature} must be present`);
  const end = source.indexOf(`\nrevoke all on function ${revokeSignature}`, start);
  assert.ok(end > start, `${revokeSignature} must have its canonical revoke boundary`);
  return source.slice(start, end).trim();
}

const commandSignature = "public.adhdice_execute_task_state_command(uuid, jsonb)";
const fulfillmentSignature = "public.adhdice_fulfill_canonical_reward_entitlement(uuid)";
const commandDefinition = extractFunction(commandSource, "public.adhdice_execute_task_state_command(", commandSignature);
const fulfillmentDefinition = extractFunction(fulfillmentSource, "public.adhdice_fulfill_canonical_reward_entitlement(", fulfillmentSignature);

test("7.10.5 is the sole deployable reward permanence migration", () => {
  assert.equal(existsSync(new URL("../supabase/patch_task_reward_entitlement_permanence_7_10_3.sql", import.meta.url)), false);
  assert.equal(existsSync(new URL("../supabase/patch_task_reward_entitlement_permanence_7_10_4.sql", import.meta.url)), false);
  assert.match(migration, /^-- 7\.10\.5[\s\S]*\nbegin;/);
  assert.match(migration, /\ncommit;\s*$/);
  assert.ok(migration.includes(commandDefinition), "migration must embed the current Task State command definition");
  assert.ok(migration.includes(fulfillmentDefinition), "migration must embed the current fulfillment definition");
  assert.match(migration, /revoke all on function public\.adhdice_execute_task_state_command\(uuid, jsonb\)/);
  assert.match(migration, /grant execute on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) to service_role/);
  assert.match(migration, /revoke all on function public\.adhdice_fulfill_canonical_reward_entitlement\(uuid\)/);
  assert.match(migration, /grant execute on function public\.adhdice_fulfill_canonical_reward_entitlement\(uuid\) to authenticated/);
});

test("pending backfill accepts success-label edits but remains fail closed", () => {
  const historyGuardStart = migration.indexOf("select fact.* into v_fact");
  const historyGuardEnd = migration.indexOf("select task.* into v_task", historyGuardStart);
  assert.ok(historyGuardStart >= 0 && historyGuardEnd > historyGuardStart);
  const historyGuard = migration.slice(historyGuardStart, historyGuardEnd);

  assert.match(historyGuard, /fact\.user_id = v_entitlement\.user_id[\s\S]*fact\.id = v_entitlement\.canonical_history_id/);
  assert.match(historyGuard, /v_fact\.entity_id is distinct from v_entitlement\.entity_id/);
  assert.match(historyGuard, /v_fact\.logical_date is distinct from v_entitlement\.logical_date/);
  assert.match(historyGuard, /v_entitlement\.outcome_snapshot not in \('done', 'did_my_best', 'complete'\)/);
  assert.match(historyGuard, /v_fact\.outcome not in \('done', 'did_my_best', 'complete'\)/);
  assert.doesNotMatch(historyGuard, /v_fact\.outcome is distinct from v_entitlement\.outcome_snapshot/);
  assert.match(migration, /v_entitlement\.canonical_history_id is null/);
  assert.match(migration, /task\.user_id = v_entitlement\.user_id[\s\S]*task\.id = v_entitlement\.entity_id/);
  assert.match(migration, /set reward_units_snapshot = v_reward_units/);
  assert.doesNotMatch(historyGuard, /set\s+outcome_snapshot/);
});

test("pending and fulfilled backfills preserve their established reward calculations", () => {
  assert.match(migration, /if v_entitlement\.state = 'fulfilled' then[\s\S]*grant_kind = 'banked_roll'[\s\S]*v_grant_count <> 1[\s\S]*v_grant_units <= 0/);
  assert.match(migration, /if v_task\.repeat_frequency = 'none' then\s+v_streak := 1/);
  assert.match(migration, /when v_streak <= 1 then 1[\s\S]*when v_streak = 2 then 2[\s\S]*when v_streak <= 6 then 3[\s\S]*when v_streak <= 13 then 4[\s\S]*when v_streak <= 29 then 5[\s\S]*else 6/);
  assert.match(migration, /set reward_units_snapshot = v_grant_units[\s\S]*continue;/);
  assert.match(migration, /unique \(user_id, entity_id, logical_date\)/);
});

test("the deployable command definition contains the permanent Task/day reward contract", () => {
  const rewardBlock = commandDefinition.slice(
    commandDefinition.indexOf("-- The entitlement is canonical"),
    commandDefinition.indexOf("v_result := jsonb_build_object", commandDefinition.indexOf("-- The entitlement is canonical")),
  );
  const clearStart = commandDefinition.lastIndexOf("if v_command_type = 'clear_outcome' then");
  const clearEnd = commandDefinition.indexOf("elsif v_history <> '{}'::jsonb then", clearStart);
  const clearBranch = commandDefinition.slice(clearStart, clearEnd);

  assert.match(commandDefinition, /reward_units_snapshot/);
  assert.match(rewardBlock, /on conflict \(user_id, entity_id, logical_date\) do nothing/);
  assert.doesNotMatch(rewardBlock, /on conflict \(user_id, entity_id, logical_date, reward_program_version\)/);
  assert.doesNotMatch(clearBranch, /reward_entitlements|invalidate reward provenance/);
});

test("the deployable fulfillment definition uses only immutable reward provenance", () => {
  assert.match(fulfillmentDefinition, /v_entitlement\.reward_units_snapshot/);
  assert.match(fulfillmentDefinition, /v_entitlement\.outcome_snapshot not in \('done', 'did_my_best', 'complete'\)/);
  assert.doesNotMatch(fulfillmentDefinition, /from public\.adhdice_task_history_facts/);
  assert.doesNotMatch(fulfillmentDefinition, /v_streak/);
});

test("schema/backfill work completes before the embedded function replacements", () => {
  const snapshotConstraint = migration.indexOf("alter column reward_units_snapshot set not null");
  const commandStart = migration.indexOf("create or replace function public.adhdice_execute_task_state_command(");
  const fulfillmentStart = migration.indexOf("create or replace function public.adhdice_fulfill_canonical_reward_entitlement(");
  const finalCommit = migration.lastIndexOf("\ncommit;");
  assert.ok(snapshotConstraint >= 0 && snapshotConstraint < commandStart);
  assert.ok(commandStart < fulfillmentStart && fulfillmentStart < finalCommit);
});

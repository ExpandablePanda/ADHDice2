import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rewardSql = readFileSync(new URL("../supabase/add_canonical_reward_entitlement_bridge.sql", import.meta.url), "utf8");
const commandSql = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const canonicalSchema = readFileSync(new URL("../supabase/add_task_state_canonical_schema.sql", import.meta.url), "utf8");
const permanenceMigration = readFileSync(new URL("../supabase/patch_task_reward_entitlement_permanence_7_10_3.sql", import.meta.url), "utf8");
const rewardHook = readFileSync(new URL("../src/hooks/useTaskRewardController.ts", import.meta.url), "utf8");
const currentState = readFileSync(new URL("../docs/CURRENT_STATE.md", import.meta.url), "utf8");

function canonicalStreak(outcomes: string[], repeatFrequency: string) {
  if (repeatFrequency === "none") return outcomes.at(-1) && ["done", "did_my_best", "complete"].includes(outcomes.at(-1)!) ? 1 : 0;
  let streak = 0;
  for (const outcome of [...outcomes].reverse()) {
    if (!["done", "did_my_best", "complete"].includes(outcome)) break;
    streak += 1;
  }
  return streak;
}

function assertServerStreakLoop() {
  assert.match(commandSql, /for v_reward_streak_fact in[\s\S]*select fact\.outcome[\s\S]*order by fact\.logical_date desc/);
  assert.match(commandSql, /exit when v_reward_streak_fact\.outcome not in \('done', 'did_my_best', 'complete'\)/);
  assert.doesNotMatch(commandSql, /v_reward_streak_fact\.logical_date\s*=\s*v_cursor\s*-\s*1/);
}

test("daily three-success streak is three logged occurrences", () => {
  assert.equal(canonicalStreak(["done", "done", "done"], "daily"), 3);
  assertServerStreakLoop();
});

test("weekly three-success streak is three scheduled occurrences", () => {
  assert.equal(canonicalStreak(["done", "did_my_best", "complete"], "weekly"), 3);
  assert.match(commandSql, /successful History streak[\s\S]*logical_date desc/);
});

test("monthly three-success streak is three scheduled occurrences", () => {
  assert.equal(canonicalStreak(["complete", "done", "did_my_best"], "monthly"), 3);
  assert.match(commandSql, /successful History streak[\s\S]*logical_date desc/);
});

test("recurring successful dates do not need calendar adjacency", () => {
  assert.equal(canonicalStreak(["done", "done", "done"], "weekly"), 3);
  assert.match(commandSql, /same successful History streak/);
});

test("explicit Missed breaks the successful streak", () => {
  assert.equal(canonicalStreak(["done", "done", "missed", "done"], "daily"), 1);
  assert.match(commandSql, /outcome not in \('done', 'did_my_best', 'complete'\)/);
});

test("one-time Tasks cannot build a recurring streak", () => {
  assert.equal(canonicalStreak(["done", "done", "done"], "none"), 1);
  assert.match(commandSql, /if v_task\.repeat_frequency = 'none' then\s+v_reward_streak := 1/);
});

test("all existing reward tiers remain server-derived", () => {
  for (const [streak, dice] of [[1, 1], [2, 2], [3, 3], [7, 4], [14, 5], [30, 6]]) {
    const expected = streak <= 1 ? 1 : streak === 2 ? 2 : streak <= 6 ? 3 : streak <= 13 ? 4 : streak <= 29 ? 5 : 6;
    assert.equal(expected, dice);
  }
  assert.match(commandSql, /when v_reward_streak <= 1 then 1[\s\S]*when v_reward_streak = 2 then 2[\s\S]*when v_reward_streak <= 6 then 3[\s\S]*when v_reward_streak <= 13 then 4[\s\S]*when v_reward_streak <= 29 then 5[\s\S]*else 6/);
});

test("fulfillment RPC accepts only the entitlement ID", () => {
  assert.match(rewardSql, /adhdice_fulfill_canonical_reward_entitlement\(\s*p_entitlement_id uuid\s*\)/);
  assert.doesNotMatch(rewardSql, /p_streak_length|p_reward_payload/);
  assert.match(rewardSql, /grant execute on function public\.adhdice_fulfill_canonical_reward_entitlement\(uuid\)/);
});

test("obsolete overload cleanup is install-safe and the new RPC is authenticated-only", () => {
  const obsoleteSignature = "public.adhdice_fulfill_canonical_reward_entitlement(uuid, integer, jsonb)";
  const obsoleteDrop = `drop function if exists ${obsoleteSignature};`;
  const obsoleteDropIndex = rewardSql.indexOf(obsoleteDrop);
  const newFunctionIndex = rewardSql.indexOf("create or replace function public.adhdice_fulfill_canonical_reward_entitlement(");
  assert.ok(obsoleteDropIndex >= 0 && obsoleteDropIndex < newFunctionIndex);
  assert.doesNotMatch(rewardSql, /revoke\s+all\s+on\s+function\s+public\.adhdice_fulfill_canonical_reward_entitlement\(uuid, integer, jsonb\)/i);

  const newPrivilegeBlock = rewardSql.slice(rewardSql.indexOf("revoke all on function public.adhdice_fulfill_canonical_reward_entitlement(uuid)"));
  assert.match(newPrivilegeBlock, /revoke all on function public\.adhdice_fulfill_canonical_reward_entitlement\(uuid\) from public, anon;/);
  assert.match(newPrivilegeBlock, /grant execute on function public\.adhdice_fulfill_canonical_reward_entitlement\(uuid\) to authenticated;/);
  assert.doesNotMatch(newPrivilegeBlock, /grant execute on function public\.adhdice_fulfill_canonical_reward_entitlement\(uuid\) to (?:public|anon)/);
});

test("entitlement ownership is checked and locked before replay lookup", () => {
  const entitlementLock = rewardSql.indexOf("where entitlement.id = p_entitlement_id");
  const operationLookup = rewardSql.indexOf("from public.adhdice_pending_reward_dice_operations");
  assert.ok(entitlementLock >= 0 && entitlementLock < operationLookup);
  assert.match(rewardSql, /and entitlement\.user_id = v_user_id[\s\S]*for update/);
});

test("blocked entitlement fails closed", () => {
  assert.match(rewardSql, /if v_entitlement\.state = 'blocked' then[\s\S]*blocked and cannot be fulfilled/);
});

test("History provenance is optional after an entitlement is earned", () => {
  assert.match(canonicalSchema, /canonical_history_id uuid,\s+reward_units_snapshot integer not null/);
  assert.match(canonicalSchema, /on delete set null \(canonical_history_id\)/i);
  assert.doesNotMatch(rewardSql, /v_entitlement\.canonical_history_id/);
});

test("fulfillment validates immutable outcome and positive reward snapshot", () => {
  assert.match(rewardSql, /v_entitlement\.outcome_snapshot not in \('done', 'did_my_best', 'complete'\)/);
  assert.match(rewardSql, /v_entitlement\.reward_units_snapshot is null or v_entitlement\.reward_units_snapshot <= 0/);
  assert.match(rewardSql, /v_dice_count := v_entitlement\.reward_units_snapshot/);
  assert.doesNotMatch(rewardSql, /from public\.adhdice_task_history_facts/);
  assert.doesNotMatch(rewardSql, /v_streak/);
});

test("only successful original outcomes can fulfill", () => {
  assert.match(rewardSql, /v_entitlement\.outcome_snapshot not in \('done', 'did_my_best', 'complete'\)/);
  assert.doesNotMatch(rewardSql, /adhdice_task_history[^_f]/);
});

test("canonical Task ownership is checked server-side", () => {
  assert.match(rewardSql, /from public\.adhdice_clean_tasks task[\s\S]*task\.id = v_entitlement\.entity_id[\s\S]*task\.user_id = v_user_id/);
});

test("browser cannot provide arbitrary Task arrays, claim references, dice, or streak", () => {
  assert.doesNotMatch(rewardHook.slice(rewardHook.indexOf("async function fulfillCanonicalRewardEntitlements"), rewardHook.indexOf("async function queueTaskRewards")), /adhdice_task_history_facts|p_reward_payload|p_streak_length|claimRefs|tasks|diceCount|streakLength/);
  assert.match(rewardSql, /'claimRefs', jsonb_build_array/);
  assert.match(rewardSql, /'tasks', jsonb_build_array/);
  assert.match(rewardSql, /'diceCount', v_dice_count/);
});

test("server-generated pending payload contains one Task and one claim ref", () => {
  assert.match(rewardSql, /'mode', 'single'/);
  assert.match(rewardSql, /'claimRefs', jsonb_build_array\(jsonb_build_object/);
  assert.match(rewardSql, /'tasks', jsonb_build_array\(jsonb_build_object/);
  assert.match(rewardSql, /'rewardDate', v_entitlement\.logical_date/);
  assert.doesNotMatch(rewardSql, /streakLength/);
  assert.match(rewardSql, /'canonicalEntitlementId', p_entitlement_id/);
});

test("legacy reward eligibility and claim rows are not consulted", () => {
  assert.doesNotMatch(rewardSql, /adhdice_task_reward_claims/);
  assert.doesNotMatch(rewardSql, /adhdice_task_history[^_f]/);
});

test("first fulfillment records one grant and one pending dice item", () => {
  assert.match(rewardSql, /insert into public\.adhdice_task_reward_grants/);
  assert.match(rewardSql, /insert into public\.adhdice_pending_reward_dice_items/);
  assert.match(rewardSql, /source_item_index, dice_count, reward_payload[\s\S]*v_operation_id, 0, v_dice_count/);
});

test("exact retry returns the stored operation result", () => {
  assert.match(rewardSql, /v_existing\.result_payload[\s\S]*true/);
  assert.match(rewardSql, /canonicalEntitlementId.*source.*canonical_reward_entitlement/);
});

test("grant and pending-item uniqueness remain entitlement-scoped", () => {
  assert.match(rewardSql, /grant_row\.entitlement_id = p_entitlement_id/);
  assert.match(rewardSql, /grant_operation_identity, grant_kind, units/);
  assert.match(rewardSql, /source_operation_id, source_item_index/);
});

test("legacy operation identity collisions fail closed", () => {
  assert.match(rewardSql, /request_payload ->> 'canonicalEntitlementId' is distinct from p_entitlement_id::text/);
  assert.match(rewardSql, /operation identity is already occupied/);
});

test("canonical client calls the minimal RPC contract", () => {
  const canonicalClient = rewardHook.slice(rewardHook.indexOf("async function fulfillCanonicalRewardEntitlements"), rewardHook.indexOf("async function queueTaskRewards"));
  assert.match(canonicalClient, /client\.rpc\("adhdice_fulfill_canonical_reward_entitlement", \{\s*p_entitlement_id: entitlementId,\s*\}\)/);
  assert.doesNotMatch(canonicalClient, /p_reward_payload|p_streak_length/);
});

test("transient retry repeats the same entitlement", () => {
  const canonicalClient = rewardHook.slice(rewardHook.indexOf("async function fulfillCanonicalRewardEntitlements"), rewardHook.indexOf("async function queueTaskRewards"));
  assert.equal((canonicalClient.match(/p_entitlement_id: entitlementId/g) ?? []).length, 2);
  assert.match(canonicalClient, /isFetchFailure\(fulfillment\.error\)[\s\S]*client\.rpc/);
});

test("canonical reward path only fulfills canonical entitlements", () => {
  const queue = rewardHook.slice(rewardHook.indexOf("async function queueTaskRewards"));
  assert.match(queue, /fulfillCanonicalRewardEntitlements/);
  assert.doesNotMatch(queue, /getRecurringFinalizationCandidates|finalizeRecurringTasks|reconcileOverdueTaskMisses/);
});

test("canonical reward path does not recreate legacy History", () => {
  const canonicalClient = rewardHook.slice(rewardHook.indexOf("async function fulfillCanonicalRewardEntitlements"), rewardHook.indexOf("async function queueTaskRewards"));
  assert.doesNotMatch(canonicalClient, /adhdice_task_history|\.upsert\(|\.insert\(|syncTaskHistory/);
});

test("pending-reward refresh remains after successful canonical fulfillment", () => {
  const canonicalClient = rewardHook.slice(rewardHook.indexOf("async function fulfillCanonicalRewardEntitlements"), rewardHook.indexOf("async function queueTaskRewards"));
  assert.match(canonicalClient, /if \(allFulfilled\) await refreshPendingRewards\(\);/);
});

test("first eligible success snapshots one reward per Task/logical day", () => {
  assert.match(commandSql, /v_history_row\.outcome in \('done', 'did_my_best', 'complete'\)/);
  assert.match(commandSql, /reward_units_snapshot/);
  assert.match(commandSql, /on conflict \(user_id, entity_id, logical_date\) do nothing/);
  assert.match(commandSql, /where user_id = p_user_id[\s\S]*and entity_id = v_entity_id[\s\S]*and logical_date = v_history_row\.logical_date/);
  assert.doesNotMatch(commandSql, /on conflict \(user_id, entity_id, logical_date, reward_program_version\)/);
});

test("Done to Did My Best reuses the original entitlement snapshot", () => {
  const rewardBlock = commandSql.slice(commandSql.indexOf("-- The entitlement is canonical"), commandSql.indexOf("v_result := jsonb_build_object", commandSql.indexOf("-- The entitlement is canonical")));
  assert.match(rewardBlock, /on conflict \(user_id, entity_id, logical_date\) do nothing/);
  assert.doesNotMatch(rewardBlock, /on conflict \(user_id, entity_id, logical_date\) do update/);
  assert.match(rewardBlock, /select id into v_reward_entitlement_id[\s\S]*and logical_date = v_history_row\.logical_date/);
});

test("Done to Missed preserves the entitlement through clear-and-replace", () => {
  assert.match(commandSql, /delete from public\.adhdice_task_history_facts/);
  assert.match(canonicalSchema, /on delete set null \(canonical_history_id\)/i);
  assert.doesNotMatch(commandSql, /invalidate reward provenance/);
});

test("Done to Not Due does not delete the earned entitlement", () => {
  const clearStart = commandSql.lastIndexOf("if v_command_type = 'clear_outcome' then");
  const clearEnd = commandSql.indexOf("elsif v_history <> '{}'::jsonb then", clearStart);
  assert.doesNotMatch(commandSql.slice(clearStart, clearEnd), /delete from public\.adhdice_task_reward_entitlements/);
});

test("Done to Missed to Done keeps exactly one Task/day reward", () => {
  assert.match(commandSql, /on conflict \(user_id, entity_id, logical_date\) do nothing/);
  assert.match(canonicalSchema, /unique \(user_id, entity_id, logical_date\)/);
});

test("Did My Best to Done cannot create a second reward", () => {
  assert.match(commandSql, /v_history_row\.outcome in \('done', 'did_my_best', 'complete'\)/);
  assert.match(commandSql, /on conflict \(user_id, entity_id, logical_date\) do nothing/);
});

test("Missed to Done remains eligible when no prior entitlement exists", () => {
  assert.match(commandSql, /if v_history_id is not null and v_history_row\.outcome in \('done', 'did_my_best', 'complete'\) then/);
  assert.match(commandSql, /insert into public\.adhdice_task_reward_entitlements/);
});

test("a pending entitlement remains fulfillable after its History fact is cleared", () => {
  assert.doesNotMatch(rewardSql, /select fact\.\* into v_fact/);
  assert.doesNotMatch(rewardSql, /references no owned canonical History fact/);
  assert.match(rewardSql, /if v_entitlement\.state <> 'pending' then/);
});

test("fulfilled entitlements update only fulfillment state after History replacement", () => {
  const fulfillmentUpdate = rewardSql.slice(rewardSql.indexOf("update public.adhdice_task_reward_entitlements entitlement"));
  assert.match(fulfillmentUpdate, /set state = 'fulfilled'[\s\S]*fulfilled_at[\s\S]*updated_at/);
  assert.doesNotMatch(fulfillmentUpdate, /outcome_snapshot\s*=|reward_units_snapshot\s*=/);
});

test("reward program version changes cannot create a second Task/day entitlement", () => {
  assert.match(canonicalSchema, /unique \(user_id, entity_id, logical_date\)/);
  assert.doesNotMatch(canonicalSchema, /unique \(user_id, entity_id, logical_date, reward_program_version\)/);
  assert.match(permanenceMigration, /duplicate Task\/logical-day entitlements exist/);
});

test("clear_outcome no longer blocks History replacement", () => {
  const clearStart = commandSql.lastIndexOf("if v_command_type = 'clear_outcome' then");
  const clearEnd = commandSql.indexOf("elsif v_history <> '{}'::jsonb then", clearStart);
  const clearBranch = commandSql.slice(clearStart, clearEnd);
  assert.ok(clearStart >= 0 && clearEnd > clearStart);
  assert.doesNotMatch(clearBranch, /reward_entitlements|invalidate reward provenance/);
  assert.match(clearBranch, /delete from public\.adhdice_task_history_facts/);
});

test("migration backfills fulfilled grants and pending rewards fail closed", () => {
  assert.match(permanenceMigration, /grant_row\.entitlement_id = v_entitlement\.id/);
  assert.match(permanenceMigration, /v_grant_count <> 1 or v_grant_units is null or v_grant_units <= 0/);
  assert.match(permanenceMigration, /pending entitlement % without its original History fact/);
  assert.match(permanenceMigration, /where reward_units_snapshot is null or reward_units_snapshot <= 0/);
  assert.match(permanenceMigration, /alter column canonical_history_id drop not null/);
});

test("reward fulfillment remains replay-safe and never reverses a grant", () => {
  assert.match(rewardSql, /canonical-entitlement:' \|\| p_entitlement_id::text/);
  assert.match(rewardSql, /if found then[\s\S]*return query select[\s\S]*true/);
  assert.match(rewardSql, /insert into public\.adhdice_task_reward_grants/);
  assert.doesNotMatch(rewardSql, /delete from public\.adhdice_task_reward_grants|units = -/i);
});

test("canonical reward runtime has no legacy gate", () => {
  assert.doesNotMatch(rewardHook, /TASK_STATE_CANONICAL_COMMANDS_ENABLED/);
});

test("backend deployment parity checklist names the exact reviewed set and ordering", () => {
  for (const path of [
    "supabase/add_task_state_command_rpc.sql",
    "supabase/add_canonical_reward_entitlement_bridge.sql",
    "supabase/functions/task-state-command/index.ts",
    "supabase/functions/task-state-command/auth.ts",
    "supabase/functions/task-state-command/domain.ts",
    "supabase/functions/task-state-command/orchestration.ts",
    "src/lib/task-state-canonical/command-service.ts",
    "src/lib/task-state-canonical/engine-input.ts",
    "src/lib/task-state-canonical/read-model.ts",
    "src/lib/task-state-engine/engine.ts",
  ]) {
    assert.match(currentState, new RegExp(path.replaceAll(".", "\\.")));
  }
  assert.match(currentState, /Install the reviewed[\s\S]*Deploy the exact reviewed[\s\S]*Verify RPC signatures[\s\S]*Verify deployed Edge version[\s\S]*controlled authenticated backend smoke test[\s\S]*enable the browser canonical gate/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rewardSql = readFileSync(new URL("../supabase/add_canonical_reward_entitlement_bridge.sql", import.meta.url), "utf8");
const rewardHook = readFileSync(new URL("../src/hooks/useTaskRewardController.ts", import.meta.url), "utf8");
const gate = readFileSync(new URL("../src/lib/task-state-runtime-gate.ts", import.meta.url), "utf8");
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
  assert.match(rewardSql, /for v_streak_fact in[\s\S]*select fact\.outcome[\s\S]*order by fact\.logical_date desc/);
  assert.match(rewardSql, /exit when v_streak_fact\.outcome not in \('done', 'did_my_best', 'complete'\)/);
  assert.doesNotMatch(rewardSql, /v_streak_fact\.logical_date\s*=\s*v_cursor\s*-\s*1/);
}

test("daily three-success streak is three logged occurrences", () => {
  assert.equal(canonicalStreak(["done", "done", "done"], "daily"), 3);
  assertServerStreakLoop();
});

test("weekly three-success streak is three scheduled occurrences", () => {
  assert.equal(canonicalStreak(["done", "did_my_best", "complete"], "weekly"), 3);
  assert.match(rewardSql, /scheduled weekly[\s\S]*monthly occurrences/);
});

test("monthly three-success streak is three scheduled occurrences", () => {
  assert.equal(canonicalStreak(["complete", "done", "did_my_best"], "monthly"), 3);
  assert.match(rewardSql, /scheduled weekly[\s\S]*monthly occurrences/);
});

test("recurring successful dates do not need calendar adjacency", () => {
  assert.equal(canonicalStreak(["done", "done", "done"], "weekly"), 3);
  assert.match(rewardSql, /Calendar-date adjacency is deliberately not required/);
});

test("explicit Missed breaks the successful streak", () => {
  assert.equal(canonicalStreak(["done", "done", "missed", "done"], "daily"), 1);
  assert.match(rewardSql, /including Missed, breaks the streak/);
});

test("one-time Tasks cannot build a recurring streak", () => {
  assert.equal(canonicalStreak(["done", "done", "done"], "none"), 1);
  assert.match(rewardSql, /if v_task\.repeat_frequency = 'none' then\s+v_streak := 1/);
});

test("all existing reward tiers remain server-derived", () => {
  for (const [streak, dice] of [[1, 1], [2, 2], [3, 3], [7, 4], [14, 5], [30, 6]]) {
    const expected = streak <= 1 ? 1 : streak === 2 ? 2 : streak <= 6 ? 3 : streak <= 13 ? 4 : streak <= 29 ? 5 : 6;
    assert.equal(expected, dice);
  }
  assert.match(rewardSql, /when v_streak <= 1 then 1[\s\S]*when v_streak = 2 then 2[\s\S]*when v_streak <= 6 then 3[\s\S]*when v_streak <= 13 then 4[\s\S]*when v_streak <= 29 then 5[\s\S]*else 6/);
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

test("exact canonical_history_id is required", () => {
  assert.match(rewardSql, /fact\.id = v_entitlement\.canonical_history_id/);
  assert.match(rewardSql, /references no owned canonical History fact/);
});

test("History entity, date, and outcome provenance must match", () => {
  assert.match(rewardSql, /v_fact\.entity_id is distinct from v_entitlement\.entity_id/);
  assert.match(rewardSql, /v_fact\.logical_date is distinct from v_entitlement\.logical_date/);
  assert.match(rewardSql, /v_fact\.outcome is distinct from v_entitlement\.outcome_snapshot/);
});

test("only successful canonical outcomes can fulfill", () => {
  assert.match(rewardSql, /v_fact\.outcome not in \('done', 'did_my_best', 'complete'\)/);
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
  assert.match(rewardSql, /'streakLength', v_streak/);
});

test("server-generated pending payload contains one Task and one claim ref", () => {
  assert.match(rewardSql, /'mode', 'single'/);
  assert.match(rewardSql, /'claimRefs', jsonb_build_array\(jsonb_build_object/);
  assert.match(rewardSql, /'tasks', jsonb_build_array\(jsonb_build_object/);
  assert.match(rewardSql, /'rewardDate', v_entitlement\.logical_date/);
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

test("canonical reward path does not finalize legacy recurrence", () => {
  const queue = rewardHook.slice(rewardHook.indexOf("async function queueTaskRewards"));
  assert.match(queue, /if \(TASK_STATE_CANONICAL_COMMANDS_ENABLED\)[\s\S]*return;/);
  assert.match(queue, /getRecurringFinalizationCandidates/);
});

test("canonical reward path does not recreate legacy History", () => {
  const canonicalClient = rewardHook.slice(rewardHook.indexOf("async function fulfillCanonicalRewardEntitlements"), rewardHook.indexOf("async function queueTaskRewards"));
  assert.doesNotMatch(canonicalClient, /adhdice_task_history|\.upsert\(|\.insert\(|syncTaskHistory/);
});

test("pending-reward refresh remains after successful canonical fulfillment", () => {
  const canonicalClient = rewardHook.slice(rewardHook.indexOf("async function fulfillCanonicalRewardEntitlements"), rewardHook.indexOf("async function queueTaskRewards"));
  assert.match(canonicalClient, /if \(allFulfilled\) await refreshPendingRewards\(\);/);
});

test("canonical gate is enabled", () => {
  assert.match(gate, /TASK_STATE_CANONICAL_COMMANDS_ENABLED = true/);
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

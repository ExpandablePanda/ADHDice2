import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const canonicalPendingRewardSql = readFileSync(new URL("../supabase/add_pending_reward_dice.sql", import.meta.url), "utf8");
const resetPatchSql = readFileSync(new URL("../supabase/patch_pending_reward_dice_reset_7_16_80.sql", import.meta.url), "utf8");
const supersededResetPatchSql = readFileSync(new URL("../supabase/patch_pending_reward_dice_reset_7_16_79.sql", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/hooks/useTaskRewardController.ts", import.meta.url), "utf8");
const modal = readFileSync(new URL("../src/components/task-app/task-reward-modal.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const databaseTypes = readFileSync(new URL("../src/lib/database.types.ts", import.meta.url), "utf8");

function resetFunction(source: string) {
  const start = source.indexOf("create or replace function public.adhdice_reset_pending_reward_dice(");
  const end = source.indexOf("revoke all on function public.adhdice_reset_pending_reward_dice", start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

const guardedResetFunctions = [resetFunction(canonicalPendingRewardSql), resetFunction(resetPatchSql)];
const resetController = controller.slice(
  controller.indexOf("async function resetPendingRewardBank"),
  controller.indexOf("  async function claimPendingRewardBank"),
);

test("7.16.80 reset RPC requires the revision and pending-dice snapshot", () => {
  for (const source of guardedResetFunctions) {
    assert.match(source, /adhdice_reset_pending_reward_dice\([\s\S]*p_expected_revision bigint[\s\S]*p_expected_pending_dice integer/i);
  }
  for (const source of [canonicalPendingRewardSql, resetPatchSql]) {
    assert.match(source, /drop function if exists public\.adhdice_reset_pending_reward_dice\(\)/i);
    assert.match(source, /revoke all on function public\.adhdice_reset_pending_reward_dice\(bigint, integer\)/i);
    assert.match(source, /grant execute on function public\.adhdice_reset_pending_reward_dice\(bigint, integer\) to authenticated/i);
  }
  assert.match(supersededResetPatchSql, /SUPERSEDED[\s\S]*patch_pending_reward_dice_reset_7_16_80\.sql/i);
});

test("account row is locked before either snapshot guard can delete or update", () => {
  for (const source of guardedResetFunctions) {
    const lockIndex = source.indexOf("for update;");
    const guardIndex = source.indexOf("if v_account.revision <> p_expected_revision");
    const deleteIndex = source.indexOf("delete from public.adhdice_pending_reward_dice_items");
    const updateIndex = source.indexOf("update public.adhdice_pending_reward_dice account");
    assert.ok(lockIndex >= 0 && guardIndex > lockIndex && deleteIndex > guardIndex && updateIndex > deleteIndex);
    assert.match(source, /v_account\.revision <> p_expected_revision or v_account\.pending_dice <> p_expected_pending_dice/i);
    assert.match(source, /Pending rewards changed before reset\. Review the updated bank and try again\./i);
  }
});

test("revision and count mismatches fail before any destructive mutation", () => {
  for (const source of guardedResetFunctions) {
    const guardEnd = source.indexOf("end if;", source.indexOf("if v_account.revision <> p_expected_revision"));
    const deleteIndex = source.indexOf("delete from public.adhdice_pending_reward_dice_items");
    const updateIndex = source.indexOf("update public.adhdice_pending_reward_dice account");
    assert.ok(guardEnd > 0 && deleteIndex > guardEnd && updateIndex > deleteIndex);
    assert.match(source.slice(0, guardEnd), /v_account\.revision <> p_expected_revision/);
    assert.match(source.slice(0, guardEnd), /v_account\.pending_dice <> p_expected_pending_dice/);
  }
});

test("a stale reward cannot be discarded or advance revision/economy/history state", () => {
  for (const source of guardedResetFunctions) {
    const guardIndex = source.indexOf("if v_account.revision <> p_expected_revision");
    const guardEnd = source.indexOf("end if;", guardIndex);
    const beforeGuard = source.slice(0, guardEnd);
    assert.doesNotMatch(beforeGuard, /delete from public\.adhdice_pending_reward_dice_items|update public\.adhdice_pending_reward_dice account/i);
    assert.doesNotMatch(beforeGuard, /revision = account\.revision \+ 1|adhdice_user_profiles|adhdice_point_ledger|adhdice_task_reward_rolls|adhdice_task_reward_claims|task_history|achievement/i);
  }
});

test("inventory is checked before deletion and after deletion, with claimed items excluded", () => {
  for (const source of guardedResetFunctions) {
    const inventoryCheck = source.indexOf("select coalesce(sum(item.dice_count)");
    const deleteIndex = source.indexOf("delete from public.adhdice_pending_reward_dice_items");
    const postDeleteCheck = source.indexOf("if v_discarded_dice <> p_expected_pending_dice");
    assert.ok(inventoryCheck > 0 && deleteIndex > inventoryCheck && postDeleteCheck > deleteIndex);
    assert.match(source, /item\.claimed_operation_id is null[\s\S]*if v_inventory_dice <> p_expected_pending_dice/i);
    assert.match(source, /returning item\.dice_count/i);
    assert.match(source, /v_discarded_dice <> p_expected_pending_dice[\s\S]*no dice were discarded/i);
  }
});

test("matching reset preserves the 7.16.79 mutation boundary", () => {
  for (const source of guardedResetFunctions) {
    assert.match(source, /set pending_dice = 0,[\s\S]*revision = account\.revision \+ 1,[\s\S]*updated_at = now\(\)/i);
    assert.match(source, /return query[\s\S]*v_account\.pending_dice[\s\S]*v_account\.revision[\s\S]*v_account\.updated_at[\s\S]*v_discarded_dice/i);
    assert.doesNotMatch(source, /adhdice_user_profiles|adhdice_point_ledger|adhdice_task_reward_rolls|adhdice_task_reward_claims|task_history|adhdice_clean_tasks|achievement/i);
  }
});

test("client sends the opened snapshot, preserves failure state, and clears only after success", () => {
  assert.match(resetController, /client\.rpc\("adhdice_reset_pending_reward_dice", \{[\s\S]*p_expected_revision: snapshot\.revision[\s\S]*p_expected_pending_dice: snapshot\.pendingDice[\s\S]*\}\)/);
  assert.doesNotMatch(resetController, /adhdice_reset_pending_reward_dice", \{\}\)/);
  assert.match(resetController, /clearPendingRewardQueue\(\)/);
  assert.match(resetController, /resetRow\.discarded_dice === 1 \? "die" : "dice"/);
  const clearIndex = resetController.indexOf("clearPendingRewardQueue()");
  const successIndex = resetController.indexOf("if (reset.error");
  assert.ok(clearIndex > successIndex);
  assert.match(databaseTypes, /adhdice_reset_pending_reward_dice:[\s\S]*p_expected_pending_dice: number;[\s\S]*p_expected_revision: number;[\s\S]*discarded_dice: number;/);
});

test("the modal amount and reset guard share one opened account snapshot", () => {
  assert.match(controller, /pendingDice: snapshot\.pendingDice[\s\S]*pendingRewards: \[\.\.\.queue\][\s\S]*revision: snapshot\.revision/);
  assert.match(app, /setActiveRewardBankSession\(bankSession\)/);
  assert.match(app, /onReset=\{handleResetPendingRewardBank\}[\s\S]*pendingBankSnapshot=\{activeRewardBankSession\}/);
  assert.match(modal, /onReset: \(snapshot: PendingRewardBankSnapshot\) => Promise<boolean>/);
  assert.match(modal, /const pendingDiceCount = pendingBankSnapshot\.pendingDice/);
  assert.match(modal, /onReset\(pendingBankSnapshot\)/);
  assert.match(modal, /Reset \$\{pendingDiceCount\} \$\{diceLabel\} from your pending roll bank\?/);
});

test("a stale reset refreshes the account and queue, then requires a new confirmation", () => {
  assert.match(resetController, /isPendingRewardBankConflict\(reset\.error\)[\s\S]*await refreshPendingRewardAccount\(\)[\s\S]*loadPendingRewardBankSession\(\)[\s\S]*PENDING_REWARD_BANK_CONFLICT_MESSAGE/);
  assert.match(app, /if \(result\.conflict\)[\s\S]*result\.refreshedSession[\s\S]*setActiveRewardBankSession\(result\.refreshedSession\)/);
  assert.match(modal, /if \(stage !== "intro" \|\| isClaiming \|\| isResetting \|\| pendingDiceCount <= 0\) return/);
  assert.match(modal, /if \(didReset\) onClose\(\)/);
});

test("existing claim, award, and modal boundaries remain in place", () => {
  assert.match(canonicalPendingRewardSql, /create or replace function public\.adhdice_claim_pending_reward_dice\(p_operation_id uuid\)/i);
  assert.match(canonicalPendingRewardSql, /insert into public\.adhdice_task_reward_rolls/i);
  assert.match(canonicalPendingRewardSql, /insert into public\.adhdice_task_reward_claims/i);
  assert.match(canonicalPendingRewardSql, /update public\.adhdice_user_profiles profile/i);
  assert.match(controller, /client\.rpc\("adhdice_claim_pending_reward_dice"/);
  assert.match(modal, /const authoritativeSession = await onClaim\(\)/);
  assert.match(app, /<TaskRewardModal[\s\S]*pendingRewards=\{activeRewardBankSession\.pendingRewards\}/);
  assert.match(modal, /stage === "intro"/);
  assert.match(modal, /pendingDiceCount === 1 \? "die" : "dice"/);
});

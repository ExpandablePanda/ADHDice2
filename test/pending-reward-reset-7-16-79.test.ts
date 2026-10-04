import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const canonicalPendingRewardSql = readFileSync(new URL("../supabase/add_pending_reward_dice.sql", import.meta.url), "utf8");
const resetPatchSql = readFileSync(new URL("../supabase/patch_pending_reward_dice_reset_7_16_79.sql", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/hooks/useTaskRewardController.ts", import.meta.url), "utf8");
const modal = readFileSync(new URL("../src/components/task-app/task-reward-modal.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const databaseTypes = readFileSync(new URL("../src/lib/database.types.ts", import.meta.url), "utf8");

function resetFunction(source: string) {
  const start = source.indexOf("create or replace function public.adhdice_reset_pending_reward_dice()");
  const end = source.indexOf("revoke all on function public.adhdice_reset_pending_reward_dice()", start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

const canonicalResetFunction = resetFunction(canonicalPendingRewardSql);
const patchResetFunction = resetFunction(resetPatchSql);
const resetController = controller.slice(
  controller.indexOf("async function resetPendingRewardBank"),
  controller.indexOf("  async function claimPendingRewardBank"),
);

test("7.16.79 reset RPC is owner-scoped and locks the account before deleting unclaimed inventory", () => {
  for (const source of [canonicalResetFunction, patchResetFunction]) {
    assert.match(source, /auth\.uid\(\)/i);
    assert.match(source, /insert into public\.adhdice_pending_reward_dice \(user_id\)[\s\S]*values \(v_user_id\)[\s\S]*on conflict \(user_id\) do nothing/i);
    assert.match(source, /from public\.adhdice_pending_reward_dice account[\s\S]*where account\.user_id = v_user_id[\s\S]*for update/i);
    assert.match(source, /delete from public\.adhdice_pending_reward_dice_items item[\s\S]*item\.user_id = v_user_id[\s\S]*item\.claimed_operation_id is null/i);
    assert.match(source, /returning item\.dice_count/i);
  }
});

test("7.16.79 reset zeroes the account, increments its authority revision, and returns discarded dice", () => {
  for (const source of [canonicalResetFunction, patchResetFunction]) {
    assert.match(source, /returns table \(pending_dice integer, revision bigint, updated_at timestamptz, discarded_dice integer\)/i);
    assert.match(source, /set pending_dice = 0,[\s\S]*revision = account\.revision \+ 1,[\s\S]*updated_at = now\(\)/i);
    assert.match(source, /return query[\s\S]*v_account\.pending_dice[\s\S]*v_account\.revision[\s\S]*v_account\.updated_at[\s\S]*v_discarded_dice/i);
    assert.match(source, /coalesce\(sum\(deleted_items\.dice_count\), 0\)/i);
  }
});

test("7.16.79 reset retry on an empty bank is harmless and does not touch reward history or economy", () => {
  assert.match(canonicalResetFunction, /on conflict \(user_id\) do nothing/i);
  assert.doesNotMatch(canonicalResetFunction, /no pending reward dice|inventory is inconsistent/i);
  for (const source of [canonicalResetFunction, patchResetFunction]) {
    assert.doesNotMatch(source, /adhdice_user_profiles|adhdice_point_ledger|adhdice_task_reward_rolls|adhdice_task_reward_claims|task_history|adhdice_clean_tasks|achievement/i);
  }
});

test("7.16.79 reset client uses the RPC result as the authoritative snapshot and clears the loaded queue only after success", () => {
  assert.match(resetController, /client\.rpc\("adhdice_reset_pending_reward_dice", \{\}\)/);
  assert.match(resetController, /reset\.data\?\.\[0\] as PendingRewardDiceResetRow/);
  assert.match(resetController, /pendingDice: resetRow\.pending_dice/);
  assert.match(resetController, /revision,[\s\S]*updatedAt: resetRow\.updated_at/);
  assert.match(resetController, /clearPendingRewardQueue\(\)/);
  assert.match(resetController, /resetRow\.discarded_dice === 1 \? "die" : "dice"/);
  assert.match(databaseTypes, /adhdice_reset_pending_reward_dice:[\s\S]*Args: Record<string, never>;[\s\S]*discarded_dice: number;/);

  const successStart = resetController.indexOf("fetchGenerationRef.current += 1;");
  assert.ok(successStart > 0);
  assert.doesNotMatch(resetController.slice(0, successStart), /clearPendingRewardQueue\(\)/);
  assert.match(resetController.slice(0, successStart), /await refreshPendingRewardAccount\(\)[\s\S]*return false/);
});

test("7.16.79 reset is wired through TaskApp and is available only from the modal intro stage", () => {
  assert.match(app, /<TaskRewardModal[\s\S]*onReset=\{resetPendingRewardBank\}[\s\S]*pendingRewards=\{activeRewardBankSession\}/);
  assert.match(modal, /onReset: \(\) => Promise<boolean>/);
  assert.match(modal, /if \(stage !== "intro" \|\| isClaiming \|\| isResetting \|\| pendingDiceCount <= 0\) return/);
  assert.match(modal, /\{stage === "intro" \? \([\s\S]*Reset Bank/);
  assert.match(modal, /Reset \$\{pendingDiceCount\} \$\{diceLabel\} from your pending roll bank\?/);
  assert.match(modal, /pendingDiceCount === 1 \? "die" : "dice"/);
});

test("7.16.79 existing claim and roll authorities remain in place", () => {
  assert.match(canonicalPendingRewardSql, /create or replace function public\.adhdice_claim_pending_reward_dice\(p_operation_id uuid\)/i);
  assert.match(canonicalPendingRewardSql, /insert into public\.adhdice_task_reward_rolls/i);
  assert.match(canonicalPendingRewardSql, /insert into public\.adhdice_task_reward_claims/i);
  assert.match(canonicalPendingRewardSql, /update public\.adhdice_user_profiles profile/i);
  assert.match(controller, /client\.rpc\("adhdice_claim_pending_reward_dice"/);
  assert.match(modal, /const authoritativeSession = await onClaim\(\)/);
  assert.doesNotMatch(resetController, /adhdice_claim_pending_reward_dice|adhdice_task_reward_rolls|adhdice_user_profiles/i);
});

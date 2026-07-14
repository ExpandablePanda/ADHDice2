import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  createRollOperationId,
  shouldApplyAuthoritativeProfileSnapshot,
  shouldApplyProfileHydration,
} from "@/lib/roll-profile-sync";

const migration = fs.readFileSync("supabase/add_atomic_roll_operation.sql", "utf8");
const rollPage = fs.readFileSync("src/components/task-app/roll-page.tsx", "utf8");
const economyHook = fs.readFileSync("src/hooks/useEconomy.ts", "utf8");

test("atomic roll SQL locks the profile and makes operations idempotent", () => {
  assert.match(migration, /for update;/i);
  assert.match(migration, /adhdice_roll_history_user_operation_unique/i);
  assert.match(migration, /history\.operation_id = p_operation_id/i);
  assert.match(migration, /free_roll_bank = profile\.free_roll_bank - 1/i);
  assert.match(migration, /profile\.points < p_point_cost/i);
  assert.match(migration, /insert into public\.adhdice_point_ledger/i);
  assert.match(migration, /insert into public\.adhdice_roll_history/i);
});

test("same operation reward is applied once and conflicting retries are rejected", () => {
  assert.match(migration, /if v_history\.reward_applied then/i);
  assert.match(migration, /already has a different reward result/i);
  assert.match(migration, /reward_applied = true/i);
});

test("Realtime publication addition and RPC ownership are strict and idempotent", () => {
  assert.match(migration, /if not exists[\s\S]*pg_publication_tables[\s\S]*adhdice_user_profiles/i);
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /revoke all on function[\s\S]*from anon/i);
  assert.match(migration, /grant execute on function[\s\S]*to authenticated/i);
});

test("older hydration cannot replace a newer mutation or Realtime snapshot", () => {
  const oldSnapshot = { updated_at: "2026-07-13T12:00:00.000Z" };
  const newTimestamp = Date.parse("2026-07-13T12:00:05.000Z");
  assert.equal(shouldApplyAuthoritativeProfileSnapshot(oldSnapshot, newTimestamp), false);
  assert.equal(shouldApplyProfileHydration({
    currentAuthoritativeTimestamp: newTimestamp,
    currentGeneration: 2,
    snapshot: oldSnapshot,
    token: { authoritativeTimestamp: 0, generation: 1 },
  }), false);
});

test("current hydration applies and operation UUID is retained by its caller", () => {
  const snapshot = { updated_at: "2026-07-13T12:00:05.000Z" };
  const timestamp = Date.parse(snapshot.updated_at);
  assert.equal(shouldApplyProfileHydration({
    currentAuthoritativeTimestamp: timestamp,
    currentGeneration: 3,
    snapshot,
    token: { authoritativeTimestamp: timestamp, generation: 3 },
  }), true);
  assert.equal(createRollOperationId(() => "a27a8bd8-9fb0-4f10-8745-b1633f6c626d"), "a27a8bd8-9fb0-4f10-8745-b1633f6c626d");
});

test("Roll creates its operation ID through the shared helper and retains it for retries", () => {
  assert.match(rollPage, /operationId: createRollOperationId\(\)/);
  assert.match(rollPage, /pendingOperation\.current = operation/);
  assert.doesNotMatch(rollPage, /crypto\.randomUUID\(\)/);
});

test("Roll uses the RPC before animation and has resume recovery", () => {
  const rpcIndex = rollPage.indexOf('client.rpc("adhdice_execute_roll"');
  const animationIndex = rollPage.indexOf('setPhase("rolling")', rpcIndex);
  assert.ok(rpcIndex >= 0 && animationIndex > rpcIndex);
  assert.doesNotMatch(rollPage, /latestFreeRollBank\s*-\s*1/);
  assert.match(rollPage, /visibilitychange/);
  assert.match(rollPage, /pageshow/);
  assert.match(rollPage, /window\.addEventListener\("online"/);
  assert.match(rollPage, /Roll not completed/);
});

test("unrelated economy writes include free rolls only for intentional level-up awards", () => {
  assert.match(economyHook, /if \(levelUpsEarned > 0\) \{\s*profileUpdate\.free_roll_bank/s);
  assert.match(economyHook, /if \(levelUpsEarned > 0\) \{\s*nextProfileUpdate\.free_roll_bank/s);
});

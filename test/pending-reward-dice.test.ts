import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPendingRewardAwardOperationId,
  parseAuthoritativeClaimSession,
  shouldApplyPendingRewardDiceSnapshot,
} from "@/lib/pending-reward-dice";
import { resolveTaskRewardTier, type PendingTaskReward } from "@/lib/task-rewards";

const sql = readFileSync(new URL("../supabase/add_pending_reward_dice.sql", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/hooks/useTaskRewardController.ts", import.meta.url), "utf8");
const claimFunction = sql.slice(
  sql.indexOf("create or replace function public.adhdice_claim_pending_reward_dice"),
  sql.indexOf("revoke all on function public.adhdice_claim_pending_reward_dice"),
);

function reward(overrides: Partial<PendingTaskReward> = {}): PendingTaskReward {
  return {
    claimRefs: [{ subtaskId: null, taskId: "11111111-1111-4111-8111-111111111111", title: "Task" }],
    createdAt: "2026-07-13T12:00:00.000Z",
    diceCount: 3,
    mode: "single",
    rewardDate: "2026-07-13",
    streakLength: 4,
    tasks: [{ id: "11111111-1111-4111-8111-111111111111", title: "Task" } as PendingTaskReward["tasks"][number]],
    tier: resolveTaskRewardTier(4),
    ...overrides,
  };
}

test("task reward tiers remain 1, 2, 3, 4, 5, and 6 dice", () => {
  assert.deepEqual([0, 2, 3, 7, 14, 30].map((streak) => resolveTaskRewardTier(streak).diceCount), [1, 2, 3, 4, 5, 6]);
});

test("award operation IDs are stable per task completion reward and distinct across rewards", () => {
  const first = reward();
  assert.equal(buildPendingRewardAwardOperationId(first), buildPendingRewardAwardOperationId({ ...first, createdAt: "later" }));
  assert.notEqual(buildPendingRewardAwardOperationId(first), buildPendingRewardAwardOperationId(reward({ rewardDate: "2026-07-14" })));
});

test("older hydration cannot replace a newer mutation or Realtime revision", () => {
  const current = { pendingDice: 8, revision: 4, updatedAt: "2026-07-13T12:00:04.000Z" };
  assert.equal(shouldApplyPendingRewardDiceSnapshot(current, { pendingDice: 2, revision: 3, updatedAt: "2026-07-13T12:00:05.000Z" }), false);
  assert.equal(shouldApplyPendingRewardDiceSnapshot(current, { pendingDice: 9, revision: 5, updatedAt: "2026-07-13T12:00:03.000Z" }), true);
});

test("authoritative roll results retain six-die batching and breakdown inputs", () => {
  const first = reward({ diceCount: 6 });
  const second = reward({
    claimRefs: [{ subtaskId: null, taskId: "22222222-2222-4222-8222-222222222222", title: "Other" }],
    diceCount: 2,
    tasks: [{ id: "22222222-2222-4222-8222-222222222222", title: "Other" } as PendingTaskReward["tasks"][number]],
  });
  const session = parseAuthoritativeClaimSession({
    resolutions: [
      { ...first, awardedTokens: 1, basePoints: 21, baseRolls: [1, 2, 3, 4, 5, 6], finalPoints: 42, multiplierRoll: 2, xp: 21 },
      { ...second, awardedTokens: 1, basePoints: 7, baseRolls: [3, 4], finalPoints: 21, multiplierRoll: 3, xp: 11 },
    ],
  });
  assert.ok(session);
  assert.deepEqual(session.baseRollBatches.map((batch) => batch.length), [6, 2]);
  assert.equal(session.totalFinalPoints, 63);
  assert.equal(session.resolutions[1]?.claimRefs[0]?.title, "Other");
});

test("SQL contract locks mutations, rejects invalid inventory, and makes operations idempotent", () => {
  assert.match(sql, /for update;/i);
  assert.match(sql, /pending_dice >= 0/i);
  assert.match(sql, /unique \(user_id, operation_id\)/i);
  assert.match(sql, /inventory is inconsistent; no dice were consumed/i);
  assert.match(sql, /operation_type <> 'claim'/i);
  assert.doesNotMatch(sql, /adhdice_(?:award|migrate)_pending_reward_dice/i);
});

test("SQL contract is user-scoped, authenticated-only, and Realtime-published", () => {
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /task\.user_id = v_user_id/i);
  assert.match(sql, /grant execute .* to authenticated/si);
  assert.match(sql, /tablename = 'adhdice_pending_reward_dice'/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.adhdice_pending_reward_dice/i);
});

test("a deleted source Task cannot abort settlement of an already-owned pending reward", () => {
  assert.match(claimFunction, /if exists \([\s\S]*from public\.adhdice_clean_tasks task[\s\S]*task\.user_id = v_user_id\) then\s+insert into public\.adhdice_task_reward_claims/i);
  assert.doesNotMatch(claimFunction, /A pending reward task is not owned by the authenticated user/i);
});

test("canonical parent, Step, and Substep claim refs do not use a legacy table", () => {
  assert.match(claimFunction, /task\.id = \(v_claim ->> 'taskId'\)::uuid and task\.user_id = v_user_id[\s\S]*insert into public\.adhdice_task_reward_claims/i);
  assert.doesNotMatch(claimFunction, /adhdice_task_subtasks|subtask_id/i);
});

test("one stale reference in mixed claim refs does not lose the reward settlement", () => {
  const claimLoopEnd = claimFunction.indexOf("end loop;", claimFunction.indexOf("for v_claim in"));
  const economySettlement = claimFunction.indexOf("v_total_points := v_total_points + v_final_points", claimLoopEnd);
  assert.ok(claimLoopEnd >= 0 && economySettlement > claimLoopEnd);
  assert.match(claimFunction, /for v_claim in select value from jsonb_array_elements\(v_reward -> 'claimRefs'\)/i);
  assert.match(claimFunction, /end if;\s+end loop;[\s\S]*insert into public\.adhdice_point_ledger[\s\S]*update public\.adhdice_pending_reward_dice_items/i);
  assert.doesNotMatch(claimFunction, /raise exception[\s\S]*pending reward (?:task|subtask)/i);
});

test("claim settlement selects only unclaimed pending items owned by the authenticated user", () => {
  assert.match(claimFunction, /from public\.adhdice_pending_reward_dice_items item\s+where item\.user_id = v_user_id and item\.claimed_operation_id is null\s+order by item\.created_at, item\.id/i);
  assert.match(claimFunction, /select sum\(item\.dice_count\)[\s\S]*from public\.adhdice_pending_reward_dice_items item[\s\S]*item\.user_id = v_user_id and item\.claimed_operation_id is null/i);
});

test("pending rewards do not use the Roll-page bank or its RPC", () => {
  assert.doesNotMatch(sql, /free_roll_bank/i);
  assert.doesNotMatch(sql, /adhdice_execute_roll/i);
});

test("client synchronization covers Realtime, resume, reconnect, and request generations", () => {
  assert.match(controller, /fetchGenerationRef/);
  assert.match(controller, /postgres_changes/);
  assert.match(controller, /visibilitychange/);
  assert.match(controller, /pageshow/);
  assert.match(controller, /online/);
  assert.match(controller, /CHANNEL_ERROR/);
  assert.match(controller, /TIMED_OUT/);
  assert.match(controller, /CLOSED/);
});

test("pending-dice mutation IDs use the shared UUID helper and retain retry IDs", () => {
  assert.match(controller, /createBrowserUuidV4\(\)/);
  assert.match(controller, /claimOperationIdRef\.current \?\? createBrowserUuidV4\(\)/);
  assert.match(controller, /p_operation_id: operationId/);
  assert.doesNotMatch(controller, /window\.crypto\.randomUUID\(\)/);
});

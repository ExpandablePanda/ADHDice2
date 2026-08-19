import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rewardSql = await readFile(new URL("../supabase/add_canonical_reward_entitlement_bridge.sql", import.meta.url), "utf8");
const commandSql = await readFile(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const workspace = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const records = await readFile(new URL("../src/lib/record-repository.ts", import.meta.url), "utf8");
const report = await readFile(new URL("../src/components/task-app/task-report-workspace.tsx", import.meta.url), "utf8");
const settings = await readFile(new URL("../src/components/task-app/settings-page.tsx", import.meta.url), "utf8");
const taskApp = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

test("canonical reward bridge is trusted, canonical-eligible, and replay-safe", () => {
  assert.match(rewardSql, /security definer/);
  assert.match(rewardSql, /adhdice_task_reward_entitlements/);
  assert.match(rewardSql, /canonical-entitlement:/);
  assert.match(rewardSql, /adhdice_task_reward_grants/);
  assert.match(rewardSql, /unique|on conflict/i);
  assert.match(rewardSql, /adhdice_pending_reward_dice_items/);
  assert.doesNotMatch(rewardSql, /adhdice_task_history[^_f]/);
  assert.doesNotMatch(rewardSql, /adhdice_task_reward_claims/);
  assert.match(rewardSql, /grant execute .*authenticated/);
  assert.match(rewardSql, /revoke all .*anon/);
});

test("canonical clear outcome has a trusted command and removes only explicit canonical facts", () => {
  assert.match(commandSql, /v_command_type = 'clear_outcome'/);
  assert.match(commandSql, /clear_logical_date/);
  assert.match(commandSql, /delete from public\.adhdice_task_history_facts/);
  assert.match(commandSql, /on conflict \(user_id, entity_id, logical_date\) do update/);
  assert.match(commandSql, /reward entitlement references this outcome; clearing it would invalidate reward provenance/);
  assert.doesNotMatch(commandSql, /insert into public\.adhdice_task_history\s/);
});

test("workspace History source is canonical and remains projection-compatible", () => {
  assert.doesNotMatch(workspace, /TASK_STATE_CANONICAL_COMMANDS_ENABLED/);
  assert.match(workspace, /adhdice_task_history_facts/);
  assert.match(workspace, /mapCanonicalTaskHistoryFacts/);
  assert.doesNotMatch(workspace, /table:.*adhdice_task_history["']/);
});

test("secondary History consumers use the canonical projection", () => {
  for (const source of [records, report]) {
    assert.doesNotMatch(source, /TASK_STATE_CANONICAL_COMMANDS_ENABLED/);
    assert.match(source, /adhdice_task_history_facts/);
    assert.match(source, /mapCanonicalTaskHistoryFacts/);
  }
});

test("Milestone outcomes use canonical commands while atomic completion stays on the trusted seam", () => {
  assert.doesNotMatch(taskApp, /TASK_STATE_CANONICAL_COMMANDS_ENABLED/);
  assert.match(taskApp, /status === "done"[\s\S]*status === "did_my_best"[\s\S]*status === "missed"/);
  assert.match(taskApp, /const completion = await milestoneData\.completeMilestone/);
  assert.match(taskApp, /queueTaskRewards\(\[\{[\s\S]*canonicalRewardEntitlementId: completion\.result\.canonicalRewardEntitlementId,[\s\S]*previousStatus: task\.status,[\s\S]*task: completedTask/);
});

test("Settings JSON restore directs users to canonical Task import", () => {
  assert.doesNotMatch(settings, /TASK_STATE_CANONICAL_COMMANDS_ENABLED/);
  assert.match(settings, /JSON restore is retired\. Use the canonical Task import flow instead/);
  assert.doesNotMatch(settings, /\.upsert\(payload, \{ onConflict: "id" \}\)/);
});

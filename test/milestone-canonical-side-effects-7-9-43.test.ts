import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { responseMilestoneTaskResult } from "../src/hooks/useMilestoneData.ts";
import type { TaskStateCommandResponse } from "../src/lib/task-state-command-client.ts";

const hook = readFileSync(new URL("../src/hooks/useMilestoneData.ts", import.meta.url), "utf8");
const taskApp = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const milestoneHistoryLoad = "const historyLoad = (await loadTaskHistoryForTasks([task.id]))[task.id];";
const milestoneHistoryLoadStart = taskApp.indexOf(milestoneHistoryLoad, taskApp.indexOf("const activeMilestone = milestoneData.milestoneByTaskId.get(task.id);"));
const milestoneCompletePath = taskApp.slice(
  taskApp.indexOf("const activeMilestone = milestoneData.milestoneByTaskId.get(task.id);"),
  taskApp.indexOf(milestoneHistoryLoad, milestoneHistoryLoadStart + milestoneHistoryLoad.length),
);
const milestoneTrashPath = taskApp.slice(
  taskApp.indexOf("async function runMilestoneTaskTrash"),
  taskApp.indexOf("async function openSingleTaskDeleteModal"),
);
const milestoneRestorePath = taskApp.slice(
  taskApp.indexOf("async function restoreTaskFromTrash"),
  taskApp.indexOf("const didRestore = await updateTask", taskApp.indexOf("async function restoreTaskFromTrash")),
);

function committedMilestoneResponse(side_effect_ids: Record<string, string | null>): TaskStateCommandResponse {
  return {
    success: true,
    state: "committed",
    task_id: "task-1",
    command_id: "command-1",
    expected_revision: 4,
    next_revision: 5,
    was_replayed: false,
    conflict_code: null,
    canonical_task_patch: {},
    compatibility_projection: {},
    side_effect_ids,
    task_row: { id: "task-1" },
    milestone_row: { id: "milestone-1" },
    created_transition: true,
    error: null,
  };
}

test("canonical Milestone Complete preserves returned History and reward IDs", () => {
  const result = responseMilestoneTaskResult(committedMilestoneResponse({
    history_fact_id: "history-fact-1",
    reward_entitlement_id: "reward-entitlement-1",
  }));

  assert.equal(result?.canonicalHistoryFactId, "history-fact-1");
  assert.equal(result?.canonicalRewardEntitlementId, "reward-entitlement-1");
});

test("Milestone Complete fulfills only a returned canonical entitlement", () => {
  assert.match(milestoneCompletePath, /if \(completion\.result\.canonicalRewardEntitlementId\)/);
  assert.match(milestoneCompletePath, /canonicalRewardEntitlementId: completion\.result\.canonicalRewardEntitlementId/);
  assert.match(milestoneCompletePath, /previousStatus: task\.status/);
  assert.doesNotMatch(milestoneCompletePath, /calculate|claimRef|rewardEligible/);

  const withoutEntitlement = responseMilestoneTaskResult(committedMilestoneResponse({ history_fact_id: null }));
  assert.equal(withoutEntitlement?.canonicalRewardEntitlementId, undefined);
});

test("Milestone Complete refreshes and reconciles canonical History when identified", () => {
  assert.match(milestoneCompletePath, /if \(completion\.result\.canonicalHistoryFactId\)/);
  assert.match(milestoneCompletePath, /loadTaskHistoryForTasks\(\[task\.id\]\)/);
  assert.match(milestoneCompletePath, /reconcileTaskHistoryMutation\(task\.id, historyLoad\.history, completedTask\)/);
  assert.doesNotMatch(milestoneCompletePath, /adhdice_task_history(?!_facts)/);
  assert.doesNotMatch(hook, /adhdice_task_history(?!_facts)/);
});

test("Milestone Trash and Restore do not add reward or History side effects", () => {
  for (const source of [milestoneTrashPath, milestoneRestorePath]) {
    assert.doesNotMatch(source, /queueTaskRewards|loadTaskHistoryForTasks|syncTaskHistory/);
  }
});

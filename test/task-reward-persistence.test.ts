import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import {
  mergePendingTaskRewards,
  parsePendingTaskRewards,
  type PendingTaskReward,
} from "../src/lib/task-rewards.ts";

function createPendingReward(taskId: string, diceCount: number): PendingTaskReward {
  const task = createTask({
    created_at: "2026-06-21T09:00:00.000Z",
    id: taskId,
    sort_order: 1,
    status: "done",
    title: `Task ${taskId}`,
  });

  return {
    claimRefs: [{ subtaskId: null, taskId, title: task.title }],
    createdAt: "2026-06-21T10:00:00.000Z",
    diceCount,
    mode: "single",
    rewardDate: "2026-06-21",
    streakLength: 0,
    tasks: [task],
    tier: null,
  };
}

test("pending reward persistence hydrates valid rolls and rejects malformed storage", () => {
  const rewards = [createPendingReward("task-1", 2), createPendingReward("task-2", 3)];

  assert.deepEqual(parsePendingTaskRewards(JSON.stringify(rewards)), rewards);
  assert.deepEqual(parsePendingTaskRewards("not-json"), []);
  assert.deepEqual(parsePendingTaskRewards(JSON.stringify([{ diceCount: 5 }])), []);
});

test("new banked rolls append without duplicating already persisted rewards", () => {
  const first = createPendingReward("task-1", 2);
  const second = createPendingReward("task-2", 3);
  const current = [first, second];

  assert.deepEqual(mergePendingTaskRewards([first], [first, second]), [first, second]);
  assert.equal(mergePendingTaskRewards(current, [first]), current);
});

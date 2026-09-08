import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateTaskState,
  resolveTaskBehaviorPolicy,
  STANDARD_TASK_BEHAVIOR_POLICY,
  type TaskBehaviorPolicy,
  type TaskStateEngineInput,
} from "../src/lib/task-state-engine/index.ts";

const input: TaskStateEngineInput = {
  task: {
    id: "task-1",
    lifecycle: "active",
    activeStatus: "pending",
    dueOn: "2026-09-08",
    recurrence: { kind: "rolling", intervalDays: 1 },
  },
  history: [],
  now: "2026-09-08T14:00:00.000Z",
  timezone: "UTC",
  logicalDayRollover: "00:00",
};

test("omitted Task policies resolve to the frozen standard profile", () => {
  assert.equal(resolveTaskBehaviorPolicy(undefined), STANDARD_TASK_BEHAVIOR_POLICY);
  assert.equal(resolveTaskBehaviorPolicy(null), STANDARD_TASK_BEHAVIOR_POLICY);
  assert.equal(Object.isFrozen(STANDARD_TASK_BEHAVIOR_POLICY), true);
  assert.deepEqual(STANDARD_TASK_BEHAVIOR_POLICY, {
    id: "standard-task",
    occurrenceModel: "scheduled",
    recurrenceModel: "standard",
    rolloverModel: "standard",
    calendarModel: "standard",
    streakModel: "standard",
    rewardModel: "standard",
  });
});

test("the Task Engine resolves the standard policy without changing current evaluation", () => {
  const implicit = evaluateTaskState(input);
  const explicit = evaluateTaskState({ ...input, behaviorPolicy: STANDARD_TASK_BEHAVIOR_POLICY });

  assert.equal(implicit.behaviorPolicy, STANDARD_TASK_BEHAVIOR_POLICY);
  assert.deepEqual(implicit, explicit);
});

test("the policy boundary accepts a future profile without creating a second engine", () => {
  const futureProfile: TaskBehaviorPolicy = {
    ...STANDARD_TASK_BEHAVIOR_POLICY,
    id: "future-profile",
  };

  assert.equal(resolveTaskBehaviorPolicy(futureProfile), futureProfile);
  assert.equal(evaluateTaskState({ ...input, behaviorPolicy: futureProfile }).behaviorPolicy, futureProfile);
});

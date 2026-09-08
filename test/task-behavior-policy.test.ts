import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import { normalizeTaskType, type TaskType } from "../src/lib/task-type.ts";
import type { CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";
import {
  buildCompatibilityTaskStateEngineInput,
  buildDirectTaskStateEngineInput,
} from "../src/lib/task-state-engine/direct-input.ts";
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

const storedTask = {
  ...createTask({ id: "task-1", title: "Policy boundary", status: "pending", due_on: "2026-09-08", repeat_frequency: "daily" }),
  canonicalization_status: "canonical_proven" as const,
  entity_kind: "parent" as const,
  terminal_state: "active" as const,
  container_state: "active" as const,
  workflow_state: "none" as const,
  canonical_schedule_boundary: {
    schedule_model: "rolling",
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    one_time_due_on: null,
    anchor_date: "2026-09-08",
  } as unknown as CanonicalTaskScheduleBoundary,
};

test("missing and every persisted TaskType resolve to the frozen standard profile", () => {
  assert.equal(resolveTaskBehaviorPolicy(undefined), STANDARD_TASK_BEHAVIOR_POLICY);
  assert.equal(resolveTaskBehaviorPolicy(null), STANDARD_TASK_BEHAVIOR_POLICY);
  for (const taskType of ["task", "pursuit", "goal", "custom"] as TaskType[]) {
    assert.equal(normalizeTaskType(taskType), taskType);
    assert.equal(resolveTaskBehaviorPolicy(taskType), STANDARD_TASK_BEHAVIOR_POLICY);
  }
  assert.equal(normalizeTaskType("legacy-pursuit"), "task");
  assert.equal(resolveTaskBehaviorPolicy("legacy-pursuit" as TaskType), STANDARD_TASK_BEHAVIOR_POLICY);
  assert.equal(Object.isFrozen(STANDARD_TASK_BEHAVIOR_POLICY), true);
  assert.deepEqual(STANDARD_TASK_BEHAVIOR_POLICY, {
    id: "standard-task",
    unresolvedOccurrence: "missed",
    positiveStreakOnUnhandled: "break",
    missedStreakOnUnhandled: "increment",
    rewards: "enabled",
  });
});

test("stored Task normalization explicitly supplies Standard Task policy", () => {
  const context = { now: input.now, timezone: input.timezone, logicalDayRollover: input.logicalDayRollover };
  const direct = buildDirectTaskStateEngineInput(storedTask, [], context);
  const compatibility = buildCompatibilityTaskStateEngineInput(storedTask, [], context);

  assert.equal(direct.behaviorPolicy, STANDARD_TASK_BEHAVIOR_POLICY);
  assert.equal(compatibility.behaviorPolicy, STANDARD_TASK_BEHAVIOR_POLICY);
});

test("direct and compatibility inputs resolve policy from stored TaskType without changing the engine input", () => {
  const context = { now: input.now, timezone: input.timezone, logicalDayRollover: input.logicalDayRollover };
  for (const taskType of ["task", "pursuit", "goal", "custom"] as TaskType[]) {
    const direct = buildDirectTaskStateEngineInput({ ...storedTask, task_type: taskType }, [], context);
    const compatibility = buildCompatibilityTaskStateEngineInput({ ...storedTask, task_type: taskType }, [], context);
    assert.equal(direct.behaviorPolicy, STANDARD_TASK_BEHAVIOR_POLICY, taskType);
    assert.equal(compatibility.behaviorPolicy, STANDARD_TASK_BEHAVIOR_POLICY, taskType);
    assert.equal(direct.task.id, storedTask.id);
    assert.equal(compatibility.task.id, storedTask.id);
  }
});

test("the Task Engine resolves the standard policy without changing current evaluation", () => {
  const implicit = evaluateTaskState(input);
  const explicit = evaluateTaskState({ ...input, behaviorPolicy: STANDARD_TASK_BEHAVIOR_POLICY });

  assert.equal(implicit.behaviorPolicy, STANDARD_TASK_BEHAVIOR_POLICY);
  assert.deepEqual(implicit, explicit);
});

test("a future Pursuit-like semantic policy is representable but inactive", () => {
  const futurePursuitExample: TaskBehaviorPolicy = {
    id: "future-pursuit-example",
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "break",
    missedStreakOnUnhandled: "ignore",
    rewards: "enabled",
  };

  assert.deepEqual(futurePursuitExample, {
    id: "future-pursuit-example",
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "break",
    missedStreakOnUnhandled: "ignore",
    rewards: "enabled",
  });
  assert.equal(resolveTaskBehaviorPolicy(futurePursuitExample), futurePursuitExample);
  assert.equal(evaluateTaskState({ ...input, behaviorPolicy: futurePursuitExample }).behaviorPolicy, futurePursuitExample);
});

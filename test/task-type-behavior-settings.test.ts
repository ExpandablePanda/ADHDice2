import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { TASK_TYPE_BEHAVIOR_TABS, taskTypeBehaviorTabDescription } from "../src/lib/task-type-behavior-settings.ts";
import {
  normalizeTaskBehaviorProfile,
  STANDARD_TASK_BEHAVIOR_POLICY,
} from "../src/lib/task-state-engine/behavior-policy.ts";
import { loadTaskTypeBehaviorProfiles, taskTypeBehaviorProfileUpsertPayload } from "../src/lib/task-type-behavior-profiles.ts";
import { evaluateTaskState } from "../src/lib/task-state-engine/engine.ts";
import { resolveTaskBehaviorPolicy } from "../src/lib/task-state-engine/behavior-policy.ts";
import type { TaskStateEngineInput } from "../src/lib/task-state-engine/types.ts";

const input: TaskStateEngineInput = {
  task: {
    id: "task-settings-1",
    lifecycle: "active",
    activeStatus: "pending",
    dueOn: "2026-09-08",
    recurrence: { kind: "rolling", intervalDays: 1 },
  },
  history: [],
  now: "2026-09-09T14:00:00.000Z",
  timezone: "UTC",
  logicalDayRollover: "00:00",
};

test("missing Task profile falls back to the current Standard policy", () => {
  assert.deepEqual(normalizeTaskBehaviorProfile(null), STANDARD_TASK_BEHAVIOR_POLICY);
  assert.deepEqual(normalizeTaskBehaviorProfile({ unresolvedOccurrence: "invalid" }), STANDARD_TASK_BEHAVIOR_POLICY);
});

test("stored Task profile normalization and ownership filter are narrow", async () => {
  let filteredUserId = "";
  const client = {
    from: () => ({
      select: () => ({
        eq: async (_column: string, value: string) => {
          filteredUserId = value;
          return {
            data: [{
              task_type: "task",
              unresolved_occurrence: "blank",
              positive_streak_on_unhandled: "preserve",
              missed_streak_on_unhandled: "ignore",
              rewards: "disabled",
            }],
            error: null,
          };
        },
      }),
    }),
  };
  const result = await loadTaskTypeBehaviorProfiles(client, "user-a");
  assert.equal(filteredUserId, "user-a");
  assert.deepEqual(result.data.task, {
    id: "task-behavior-profile",
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "preserve",
    missedStreakOnUnhandled: "ignore",
    rewards: "disabled",
  });
  assert.deepEqual(taskTypeBehaviorProfileUpsertPayload("user-a", STANDARD_TASK_BEHAVIOR_POLICY), {
    user_id: "user-a",
    task_type: "task",
    unresolved_occurrence: "missed",
    positive_streak_on_unhandled: "break",
    missed_streak_on_unhandled: "increment",
    rewards: "enabled",
  });
  assert.equal(resolveTaskBehaviorPolicy("task", result.data), result.data.task);
  assert.equal(resolveTaskBehaviorPolicy("pursuit", result.data), STANDARD_TASK_BEHAVIOR_POLICY);
});

test("profile migration is additive, constrained, and review-only", () => {
  const migration = readFileSync("supabase/add_task_type_behavior_profiles_7_13_17.sql", "utf8");
  assert.match(migration, /create table if not exists public\.adhdice_task_type_behavior_profiles/i);
  assert.match(migration, /primary key \(user_id, task_type\)/i);
  assert.match(migration, /task_type in \('task', 'pursuit', 'goal', 'custom'\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /to authenticated/i);
  assert.match(migration, /select auth\.uid\(\)/i);
  assert.doesNotMatch(migration, /adhdice_pursuits|adhdice_pursuit_activities/i);
});

test("settings UI model exposes the four TaskTypes and separates future profiles", () => {
  const settingsSource = readFileSync("src/components/task-app/task-type-behavior-settings.tsx", "utf8");
  assert.deepEqual(TASK_TYPE_BEHAVIOR_TABS.map((tab) => tab.value), ["task", "pursuit", "goal", "custom"]);
  assert.match(settingsSource, /Unfinished scheduled occurrence/);
  assert.match(settingsSource, /Positive streak when scheduled occurrence is unfinished/);
  assert.match(settingsSource, /Missed streak when scheduled occurrence is unfinished/);
  assert.match(settingsSource, /Derived effects/);
  assert.match(settingsSource, /System rule/);
  assert.equal(taskTypeBehaviorTabDescription("pursuit"), "Behavior profile not configured yet.");
  assert.equal(taskTypeBehaviorTabDescription("goal"), "Behavior profile not configured yet.");
  assert.equal(taskTypeBehaviorTabDescription("custom"), "Behavior profile not configured yet.");
});

test("non-default policy fields affect only the shared engine decisions", () => {
  const blankResult = evaluateTaskState({
    ...input,
    behaviorPolicy: normalizeTaskBehaviorProfile({
      id: "task-custom",
      unresolvedOccurrence: "blank",
      positiveStreakOnUnhandled: "preserve",
      missedStreakOnUnhandled: "ignore",
      rewards: "disabled",
    }),
    action: { type: "reconcile_rollover" },
  });
  assert.equal(blankResult.proposedHistoryChanges.length, 0);
  assert.equal(blankResult.rewardEligibility.reason, "no_outcome");
  assert.equal(blankResult.timeline.days["2026-09-08"]?.state, "scheduled");

  const missedResult = evaluateTaskState({
    ...input,
    behaviorPolicy: normalizeTaskBehaviorProfile({
      id: "task-preserve-ignore",
      unresolvedOccurrence: "missed",
      positiveStreakOnUnhandled: "preserve",
      missedStreakOnUnhandled: "ignore",
      rewards: "enabled",
    }),
  });
  assert.equal(missedResult.streakDisposition, "preserve_positive");

  const ignoredMissedResult = evaluateTaskState({
    ...input,
    behaviorPolicy: normalizeTaskBehaviorProfile({
      id: "task-ignore-missed",
      unresolvedOccurrence: "missed",
      positiveStreakOnUnhandled: "break",
      missedStreakOnUnhandled: "ignore",
      rewards: "enabled",
    }),
  });
  assert.equal(ignoredMissedResult.streakDisposition, "preserve_missed");

  const rewardDisabledResult = evaluateTaskState({
    ...input,
    behaviorPolicy: normalizeTaskBehaviorProfile({
      id: "task-rewards-off",
      unresolvedOccurrence: "missed",
      positiveStreakOnUnhandled: "break",
      missedStreakOnUnhandled: "increment",
      rewards: "disabled",
    }),
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-09-09" },
  });
  assert.equal(rewardDisabledResult.rewardEligibility.eligible, false);
  assert.equal(rewardDisabledResult.rewardEligibility.reason, "disabled");
});

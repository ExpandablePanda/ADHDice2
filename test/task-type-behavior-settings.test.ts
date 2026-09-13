import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { TASK_TYPE_BEHAVIOR_TABS, taskTypeBehaviorTabDescription } from "../src/lib/task-type-behavior-settings.ts";
import {
  normalizeTaskBehaviorPolicyRevisions,
  normalizeTaskBehaviorProfile,
  resolveTaskBehaviorPolicyForLogicalDate,
  selectTaskBehaviorProjectionSemantics,
  STANDARD_TASK_BEHAVIOR_POLICY,
} from "../src/lib/task-state-engine/behavior-policy.ts";
import { loadTaskTypeBehaviorProfiles, replaceTaskTypeBehaviorProfileRevision, taskTypeBehaviorProfileUpsertPayload } from "../src/lib/task-type-behavior-profiles.ts";
import { customBehaviorRulesetRevisionUpsertPayload } from "../src/lib/custom-behavior-rulesets.ts";
import { evaluateTaskState } from "../src/lib/task-state-engine/engine.ts";
import { resolveTaskBehaviorPolicy } from "../src/lib/task-state-engine/behavior-policy.ts";
import { buildTaskEffectiveTimeline } from "../src/lib/task-state-engine/effective-timeline.ts";
import { resolveTaskHistoryCalendarRead } from "../src/lib/task-state-engine/calendar-authority.ts";
import { buildCompatibilityTaskStateEngineInput } from "../src/lib/task-state-engine/direct-input.ts";
import { buildTaskHistoryRowProjections } from "../src/lib/task-history.ts";
import type { TaskStateEngineInput } from "../src/lib/task-state-engine/types.ts";

const behaviorSettingsSource = readFileSync("src/components/task-app/task-type-behavior-settings.tsx", "utf8");
const behaviorProfilesHookSource = readFileSync("src/hooks/useTaskTypeBehaviorProfiles.ts", "utf8");
const filterRowsSource = readFileSync("src/components/task-app/task-filter-rows.tsx", "utf8");
const availableActionsMigration = readFileSync("supabase/add_available_actions_policy_7_13_38.sql", "utf8");
const needsActionTriggersMigration = readFileSync("supabase/add_needs_action_triggers_policy_7_13_41.sql", "utf8");
const schemaSource = readFileSync("supabase/schema.sql", "utf8");

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

test("Behavior Settings exposes only active named rulesets and gates deletion behind confirmation", () => {
  assert.match(behaviorSettingsSource, /buildTaskTypeSelectionOptions\(customBehaviorRulesets\)/);
  assert.match(behaviorSettingsSource, /deleted_at == null/);
  assert.match(behaviorSettingsSource, /Delete Ruleset/);
  assert.match(behaviorSettingsSource, /window\.confirm\(`Delete/);
  assert.doesNotMatch(behaviorSettingsSource, /Preserve positive streak/);
  assert.match(behaviorProfilesHookSource, /deleteCustomBehaviorRuleset/);
  assert.match(behaviorProfilesHookSource, /return refreshCustomBehaviorRulesets\(\)/);
});

test("blocked named-ruleset deletion exposes task resolution actions with singular/plural copy", () => {
  assert.match(behaviorSettingsSource, /is currently assigned to \{blockedDelete\.count\} Task\{blockedDelete\.count === 1 \? "" : "s"\}/);
  assert.match(behaviorSettingsSource, />Show Tasks<\/AdhdChip>/);
  assert.match(behaviorSettingsSource, /Move \$\{blockedDelete\.count\} Task.*to Task & Delete/);
  assert.match(behaviorSettingsSource, />Cancel<\/AdhdChip>/);
  assert.match(behaviorSettingsSource, /onMoveCustomRulesetTasksToTaskAndDelete/);
  assert.match(behaviorSettingsSource, /onShowCustomRulesetTasks/);
});

test("Task Type filters are represented in the shared active-filter row", () => {
  assert.match(filterRowsSource, /customBehaviorRulesets\?: readonly CustomBehaviorRuleset\[\]/);
  assert.match(filterRowsSource, /tableColumnFilters\?\.taskType\?\.length/);
  assert.match(filterRowsSource, /buildTaskTypeSelectionOptions\(customBehaviorRulesets\)/);
  assert.match(filterRowsSource, /dimension: "taskType"/);
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
              effective_from_logical_date: "2026-09-08",
              unresolved_occurrence: "blank",
              positive_streak_on_unhandled: "preserve",
              missed_streak_on_unhandled: "ignore",
              rewards: "disabled",
            }, {
              task_type: "custom",
              effective_from_logical_date: "2026-09-08",
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
    availableActions: ["done", "did_my_best", "missed", "delay", "complete"],
    needsActionTriggers: ["missed", "due_today", "overdue"],
  });
  assert.deepEqual(result.revisions, { task: [{
    id: "task-behavior-profile",
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "preserve",
    missedStreakOnUnhandled: "ignore",
    rewards: "disabled",
    availableActions: ["done", "did_my_best", "missed", "delay", "complete"],
    needsActionTriggers: ["missed", "due_today", "overdue"],
    effectiveFromLogicalDate: "2026-09-08",
  }], custom: [{
    id: "custom-behavior-profile",
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "preserve",
    missedStreakOnUnhandled: "ignore",
    rewards: "disabled",
    availableActions: ["done", "did_my_best", "missed", "delay", "complete"],
    needsActionTriggers: ["missed", "due_today", "overdue"],
    effectiveFromLogicalDate: "2026-09-08",
  }] });
  assert.deepEqual(taskTypeBehaviorProfileUpsertPayload("user-a", "custom", STANDARD_TASK_BEHAVIOR_POLICY, "2026-09-08"), {
    user_id: "user-a",
    task_type: "custom",
    effective_from_logical_date: "2026-09-08",
    unresolved_occurrence: "missed",
    positive_streak_on_unhandled: "break",
    missed_streak_on_unhandled: "increment",
    rewards: "enabled",
    available_actions: ["done", "did_my_best", "missed", "delay", "complete"],
    needs_action_triggers: ["missed", "due_today", "overdue"],
  });
  const legacyPreservePolicy = normalizeTaskBehaviorProfile({
    id: "legacy-preserve",
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "preserve",
    missedStreakOnUnhandled: "ignore",
    rewards: "disabled",
  }, "custom");
  assert.equal(taskTypeBehaviorProfileUpsertPayload("user-a", "custom", legacyPreservePolicy, "2026-09-08").positive_streak_on_unhandled, "break");
  assert.equal(customBehaviorRulesetRevisionUpsertPayload("ruleset-practice", "2026-09-08", legacyPreservePolicy).positive_streak_on_unhandled, "break");
  assert.equal(resolveTaskBehaviorPolicy("task", result.data), result.data.task);
  assert.equal(resolveTaskBehaviorPolicy("custom", result.data), result.data.custom);
  assert.equal(resolveTaskBehaviorPolicy("pursuit", result.data), STANDARD_TASK_BEHAVIOR_POLICY);
});

test("type-aware optimistic replacement and rollback do not cross TaskType boundaries", () => {
  const taskRevision = revision("2026-09-08");
  const customRevision = { ...taskRevision, id: "custom-revision", unresolvedOccurrence: "blank" as const };
  const initial = { task: [taskRevision], custom: [customRevision] };
  const optimisticCustom = replaceTaskTypeBehaviorProfileRevision(initial, "custom", "2026-09-08", { ...customRevision, rewards: "disabled" });
  assert.equal(optimisticCustom.task?.[0], taskRevision);
  assert.equal(optimisticCustom.custom?.[0]?.rewards, "disabled");
  const rolledBackCustom = replaceTaskTypeBehaviorProfileRevision(optimisticCustom, "custom", "2026-09-08", customRevision);
  assert.deepEqual(rolledBackCustom, initial);
  const resetTask = replaceTaskTypeBehaviorProfileRevision(initial, "task", "2026-09-08", {
    ...taskRevision,
    unresolvedOccurrence: "missed",
    positiveStreakOnUnhandled: "break",
    missedStreakOnUnhandled: "increment",
    rewards: "enabled",
  });
  assert.equal(resetTask.custom?.[0], customRevision);
});

test("profile migration is additive, constrained, and review-only", () => {
  assert.equal(existsSync("supabase/add_task_type_behavior_profiles_7_13_17.sql"), false);
  const migration = readFileSync("supabase/add_task_type_behavior_profiles_7_13_18.sql", "utf8");
  assert.match(migration, /create table if not exists public\.adhdice_task_type_behavior_profiles/i);
  assert.match(migration, /effective_from_logical_date date not null/i);
  assert.match(migration, /primary key \(user_id, task_type, effective_from_logical_date\)/i);
  assert.match(migration, /task_type in \('task', 'pursuit', 'goal', 'custom'\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /to authenticated/i);
  assert.match(migration, /select auth\.uid\(\)/i);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.doesNotMatch(migration, /adhdice_pursuits|adhdice_pursuit_activities/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.adhdice_/i);
});

test("7.13.38 adds only the additive Available Actions columns and preserves existing rows", () => {
  assert.match(availableActionsMigration, /alter table public\.adhdice_task_type_behavior_profiles[\s\S]*add column if not exists available_actions text\[\]/i);
  assert.match(availableActionsMigration, /alter table public\.adhdice_custom_behavior_ruleset_revisions[\s\S]*add column if not exists available_actions text\[\]/i);
  assert.match(availableActionsMigration, /array\['done', 'did_my_best', 'missed', 'delay', 'complete'\]::text\[\]/i);
  assert.match(availableActionsMigration, /set available_actions = \([\s\S]*unnest\(/i);
  assert.match(availableActionsMigration, /available_actions <@ array\['done', 'did_my_best', 'missed', 'delay', 'complete'\]::text\[\]/i);
  assert.match(availableActionsMigration, /array_position\(available_actions, null\) is null/i);
  assert.doesNotMatch(availableActionsMigration, /insert\s+into\s+public\.adhdice_(?:clean_tasks|task_history|task_behavior_selections)/i);
  assert.doesNotMatch(availableActionsMigration, /delete\s+from\s+public\.adhdice_/i);
  for (const table of ["adhdice_task_type_behavior_profiles", "adhdice_custom_behavior_ruleset_revisions"]) {
    assert.match(schemaSource, new RegExp(`create table public\\.${table}[\\s\\S]*available_actions text\\[\\] not null`, "i"));
  }
});

test("7.13.41 adds only additive Needs Action trigger columns and preserves existing rows", () => {
  assert.match(needsActionTriggersMigration, /alter table public\.adhdice_task_type_behavior_profiles[\s\S]*add column if not exists needs_action_triggers text\[\]/i);
  assert.match(needsActionTriggersMigration, /alter table public\.adhdice_custom_behavior_ruleset_revisions[\s\S]*add column if not exists needs_action_triggers text\[\]/i);
  assert.match(needsActionTriggersMigration, /array\['missed', 'due_today', 'overdue'\]::text\[\]/i);
  assert.match(needsActionTriggersMigration, /set needs_action_triggers = \([\s\S]*unnest\(/i);
  assert.match(needsActionTriggersMigration, /needs_action_triggers <@ array\['missed', 'due_today', 'overdue'\]::text\[\]/i);
  assert.match(needsActionTriggersMigration, /array_position\(needs_action_triggers, null\) is null/i);
  assert.doesNotMatch(needsActionTriggersMigration, /insert\s+into\s+public\.adhdice_(?:clean_tasks|task_history|task_behavior_selections)/i);
  assert.doesNotMatch(needsActionTriggersMigration, /delete\s+from\s+public\.adhdice_/i);
  for (const table of ["adhdice_task_type_behavior_profiles", "adhdice_custom_behavior_ruleset_revisions"]) {
    assert.match(schemaSource, new RegExp(`create table public\\.${table}[\\s\\S]*needs_action_triggers text\\[\\] not null`, "i"));
  }
});

test("profile revisions use the earliest revision as a baseline and remain deterministic by logical date", () => {
  const revisions = normalizeTaskBehaviorPolicyRevisions([
    { task_type: "task", effective_from_logical_date: "2026-09-20", unresolved_occurrence: "missed", positive_streak_on_unhandled: "break", missed_streak_on_unhandled: "increment", rewards: "enabled" },
    { task_type: "task", effective_from_logical_date: "2026-09-10", unresolved_occurrence: "missed", positive_streak_on_unhandled: "break", missed_streak_on_unhandled: "increment", rewards: "enabled" },
    { task_type: "task", effective_from_logical_date: "2026-09-01", unresolved_occurrence: "blank", positive_streak_on_unhandled: "preserve", missed_streak_on_unhandled: "ignore", rewards: "disabled" },
  ]);
  assert.equal(resolveTaskBehaviorPolicyForLogicalDate({ revisions: [], logicalDate: "2026-09-05" }), STANDARD_TASK_BEHAVIOR_POLICY);
  assert.equal(resolveTaskBehaviorPolicyForLogicalDate({ revisions, logicalDate: "2026-08-31" }).unresolvedOccurrence, "blank");
  assert.equal(resolveTaskBehaviorPolicyForLogicalDate({ revisions, logicalDate: "2026-09-05" }).missedStreakOnUnhandled, "ignore");
  assert.equal(resolveTaskBehaviorPolicyForLogicalDate({ revisions, logicalDate: "2026-09-15" }).unresolvedOccurrence, "missed");
  assert.equal(resolveTaskBehaviorPolicyForLogicalDate({ revisions, logicalDate: "2026-09-25" }).rewards, "enabled");
  assert.equal(revisions[1]?.effectiveFromLogicalDate, "2026-09-10");
});

test("one Task or Custom revision supplies the baseline before its effective date", () => {
  const taskRevision = revision("2026-09-09", {
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "preserve",
    missedStreakOnUnhandled: "ignore",
    rewards: "disabled",
  });
  const customRevision = revision("2026-09-15", {
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "break",
    missedStreakOnUnhandled: "ignore",
    rewards: "disabled",
  });
  assert.equal(resolveTaskBehaviorPolicyForLogicalDate({ revisions: [taskRevision], logicalDate: "2026-09-01" }).unresolvedOccurrence, "blank");
  assert.equal(resolveTaskBehaviorPolicyForLogicalDate({ revisions: [taskRevision], logicalDate: "2026-09-09" }).rewards, "disabled");
  assert.equal(resolveTaskBehaviorPolicyForLogicalDate({ revisions: [customRevision], logicalDate: "2026-09-01" }).missedStreakOnUnhandled, "ignore");
  assert.equal(resolveTaskBehaviorPolicyForLogicalDate({ revisions: [customRevision], logicalDate: "2026-09-15" }).positiveStreakOnUnhandled, "break");
});

test("behavior policy revisions invalidate only the projections that consume their semantics", () => {
  const base = selectTaskBehaviorProjectionSemantics({
    behaviorProfiles: {
      task: {
        id: "policy",
        missedStreakOnUnhandled: "increment",
        positiveStreakOnUnhandled: "break",
        rewards: "enabled",
        unresolvedOccurrence: "missed",
      },
    },
    behaviorPolicyRevisions: { task: [revision("2026-09-01")] },
  });
  const rewardsOnly = selectTaskBehaviorProjectionSemantics({
    behaviorProfiles: {
      task: {
        id: "policy",
        missedStreakOnUnhandled: "increment",
        positiveStreakOnUnhandled: "break",
        rewards: "disabled",
        unresolvedOccurrence: "missed",
      },
    },
    behaviorPolicyRevisions: { task: [revision("2026-09-01", { rewards: "disabled" })] },
  });
  const streakOnly = selectTaskBehaviorProjectionSemantics({
    behaviorProfiles: {
      task: {
        id: "policy",
        missedStreakOnUnhandled: "ignore",
        positiveStreakOnUnhandled: "preserve",
        rewards: "enabled",
        unresolvedOccurrence: "missed",
      },
    },
    behaviorPolicyRevisions: { task: [revision("2026-09-01", { missedStreakOnUnhandled: "ignore", positiveStreakOnUnhandled: "preserve" })] },
  });
  const unresolvedChange = selectTaskBehaviorProjectionSemantics({
    behaviorProfiles: {
      task: {
        id: "policy",
        missedStreakOnUnhandled: "increment",
        positiveStreakOnUnhandled: "break",
        rewards: "enabled",
        unresolvedOccurrence: "blank",
      },
    },
    behaviorPolicyRevisions: { task: [revision("2026-09-01", { unresolvedOccurrence: "blank" })] },
  });

  assert.deepEqual(rewardsOnly.activeStatus, base.activeStatus);
  assert.deepEqual(streakOnly.activeStatus, base.activeStatus);
  assert.notDeepEqual(unresolvedChange.activeStatus, base.activeStatus);
  assert.notDeepEqual(streakOnly.streak, base.streak);
  assert.notDeepEqual(rewardsOnly.rewards, base.rewards);
  assert.deepEqual(rewardsOnly.streak, base.streak);

  const availabilityOnly = selectTaskBehaviorProjectionSemantics({
    behaviorProfiles: {
      task: normalizeTaskBehaviorProfile({ ...STANDARD_TASK_BEHAVIOR_POLICY, id: "manual-actions-hidden", availableActions: [] }),
    },
    behaviorPolicyRevisions: {
      task: [{ ...STANDARD_TASK_BEHAVIOR_POLICY, effectiveFromLogicalDate: "2026-09-01", availableActions: [] }],
    },
  });
  const attentionOnly = selectTaskBehaviorProjectionSemantics({
    behaviorProfiles: {
      task: normalizeTaskBehaviorProfile({ ...STANDARD_TASK_BEHAVIOR_POLICY, id: "needs-action-hidden", needsActionTriggers: [] }),
    },
    behaviorPolicyRevisions: {
      task: [{ ...STANDARD_TASK_BEHAVIOR_POLICY, effectiveFromLogicalDate: "2026-09-01", needsActionTriggers: [] }],
    },
  });
  const namedAttentionOnly = selectTaskBehaviorProjectionSemantics({
    customRulesetId: "ruleset-needs-action",
    namedCustomRulesetBehaviorPolicyRevisions: {
      "ruleset-needs-action": [{ ...revision("2026-09-01"), needsActionTriggers: [] }],
    },
    taskType: "custom",
  });
  const namedStandard = selectTaskBehaviorProjectionSemantics({
    customRulesetId: "ruleset-needs-action",
    namedCustomRulesetBehaviorPolicyRevisions: {
      "ruleset-needs-action": [revision("2026-09-01")],
    },
    taskType: "custom",
  });
  const standardWithSameRevision = selectTaskBehaviorProjectionSemantics({
    behaviorProfiles: { task: STANDARD_TASK_BEHAVIOR_POLICY },
    behaviorPolicyRevisions: {
      task: [{ ...STANDARD_TASK_BEHAVIOR_POLICY, effectiveFromLogicalDate: "2026-09-01" }],
    },
  });
  assert.deepEqual(availabilityOnly, standardWithSameRevision);
  assert.deepEqual(attentionOnly, standardWithSameRevision);
  assert.deepEqual(namedAttentionOnly, namedStandard);
});

test("Custom policy changes invalidate the same semantic projections while staying independent from Task", () => {
  const task = revision("2026-09-01");
  const custom = revision("2026-09-01", {
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "preserve",
    missedStreakOnUnhandled: "ignore",
    rewards: "disabled",
  });
  const taskSemantics = selectTaskBehaviorProjectionSemantics({
    behaviorProfiles: { task: normalizeTaskBehaviorProfile(task), custom: normalizeTaskBehaviorProfile(custom, "custom") },
    behaviorPolicyRevisions: { task: [task], custom: [custom] },
    taskType: "task",
  });
  const customSemantics = selectTaskBehaviorProjectionSemantics({
    behaviorProfiles: { task: normalizeTaskBehaviorProfile(task), custom: normalizeTaskBehaviorProfile(custom, "custom") },
    behaviorPolicyRevisions: { task: [task], custom: [custom] },
    taskType: "custom",
  });
  assert.equal(taskSemantics.activeStatus.profile.unresolvedOccurrence, "missed");
  assert.equal(customSemantics.activeStatus.profile.unresolvedOccurrence, "blank");
  assert.notDeepEqual(customSemantics.activeStatus, taskSemantics.activeStatus);
  assert.notDeepEqual(customSemantics.streak, taskSemantics.streak);
  assert.notDeepEqual(customSemantics.rewards, taskSemantics.rewards);
  assert.deepEqual(
    selectTaskBehaviorProjectionSemantics({ behaviorPolicyRevisions: { task: [task], custom: [custom] }, taskType: "pursuit" }),
    selectTaskBehaviorProjectionSemantics({ taskType: "pursuit" }),
  );
  assert.deepEqual(
    selectTaskBehaviorProjectionSemantics({ behaviorPolicyRevisions: { task: [task], custom: [custom] }, taskType: "goal" }),
    selectTaskBehaviorProjectionSemantics({ taskType: "goal" }),
  );
});

test("Task profile selection follows the ADHDice logical-day rollover and first-revision baseline", () => {
  const task = {
    id: "task-settings-logical-day",
    due_on: "2026-09-09",
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    status: "pending",
    task_type: "task",
  } as never;
  const revisionAtNine = revision("2026-09-09", { unresolvedOccurrence: "blank" });
  const beforeRollover = buildCompatibilityTaskStateEngineInput(task, [], {
    behaviorPolicyRevisions: { task: [revisionAtNine] },
    logicalDayRollover: "06:00",
    now: "2026-09-09T04:30:00.000Z",
    timezone: "America/New_York",
  });
  const afterRollover = buildCompatibilityTaskStateEngineInput(task, [], {
    behaviorPolicyRevisions: { task: [revisionAtNine] },
    logicalDayRollover: "06:00",
    now: "2026-09-09T10:00:00.000Z",
    timezone: "America/New_York",
  });
  assert.equal(beforeRollover.behaviorPolicy?.unresolvedOccurrence, "blank");
  assert.equal(afterRollover.behaviorPolicy?.unresolvedOccurrence, "blank");
});

test("Custom blank/ignore baseline keeps backdated calculated Daily dates blank and out of missed streak", () => {
  const baseline = revision("2026-09-09", {
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "break",
    missedStreakOnUnhandled: "ignore",
  });
  const timeline = buildTaskEffectiveTimeline({
    behaviorPolicy: normalizeTaskBehaviorProfile(baseline, "custom"),
    behaviorPolicyRevisions: [baseline],
    task: { ...effectiveTask(), id: "custom-backdated-daily" },
    history: [],
    logicalDate: "2026-09-10",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-10",
  });
  assert.equal(timeline.days["2026-09-01"]?.state, "unhandled_blank");
  assert.equal(timeline.days["2026-09-01"]?.unhandled, true);
  assert.equal(timeline.days["2026-09-01"]?.behaviorPolicy.unresolvedOccurrence, "blank");
  assert.equal(timeline.currentMissedStreak, 0);
});

function effectiveTask() {
  return {
    id: "task-settings-timeline",
    lifecycle: "active" as const,
    activeStatus: "pending" as const,
    dueOn: "2026-09-01",
    recurrence: { kind: "rolling" as const, intervalDays: 1 },
  };
}

function revision(effectiveFromLogicalDate: string, values: Partial<TaskStateEngineInput["behaviorPolicy"]> = {}) {
  return {
    effectiveFromLogicalDate,
    id: `task-behavior-${effectiveFromLogicalDate}`,
    unresolvedOccurrence: "missed" as const,
    positiveStreakOnUnhandled: "break" as const,
    missedStreakOnUnhandled: "increment" as const,
    rewards: "enabled" as const,
    ...values,
  };
}

function effectiveHistory(logicalDate: string, outcome: "done" | "missed", provenance: "manual" | "rollover" = "manual") {
  return { id: `history-${logicalDate}`, taskId: "task-settings-timeline", logicalDate, outcome, provenance, occurredAt: `${logicalDate}T12:00:00.000Z` };
}

test("unfinished scheduled occurrences always break positive streak while missed streak remains independent", () => {
  const base = {
    task: effectiveTask(),
    history: [effectiveHistory("2026-09-01", "done")],
    logicalDate: "2026-09-03",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-03",
  };
  const breakIgnore = buildTaskEffectiveTimeline({ ...base, behaviorPolicyRevisions: [revision("2026-09-01", { unresolvedOccurrence: "blank", positiveStreakOnUnhandled: "break", missedStreakOnUnhandled: "ignore" })] });
  assert.equal(breakIgnore.days["2026-09-02"]?.state, "unhandled_blank");
  assert.equal(breakIgnore.days["2026-09-02"]?.unhandled, true);
  assert.equal(breakIgnore.currentCompletedStreak, 0);
  assert.equal(breakIgnore.currentMissedStreak, 0);

  const preserveIgnore = buildTaskEffectiveTimeline({ ...base, behaviorPolicyRevisions: [revision("2026-09-01", { unresolvedOccurrence: "blank", positiveStreakOnUnhandled: "preserve", missedStreakOnUnhandled: "ignore" })] });
  assert.equal(preserveIgnore.currentCompletedStreak, 0);
  assert.equal(preserveIgnore.currentMissedStreak, 0);
});

test("legacy Preserve does not survive an unfinished scheduled occurrence between successful outcomes", () => {
  const preservePolicy = revision("2026-09-01", {
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "preserve",
    missedStreakOnUnhandled: "ignore",
  });
  const timeline = buildTaskEffectiveTimeline({
    behaviorPolicy: normalizeTaskBehaviorProfile(preservePolicy),
    behaviorPolicyRevisions: [preservePolicy],
    task: effectiveTask(),
    history: [
      effectiveHistory("2026-09-01", "done"),
      effectiveHistory("2026-09-02", "done"),
      effectiveHistory("2026-09-04", "done"),
      effectiveHistory("2026-09-05", "done"),
    ],
    logicalDate: "2026-09-05",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-05",
  });
  assert.equal(timeline.days["2026-09-03"]?.state, "unhandled_blank");
  assert.equal(timeline.days["2026-09-03"]?.unhandled, true);
  assert.equal(timeline.currentCompletedStreak, 2);
});

test("automatic Missed policy independently controls both authoritative streaks", () => {
  const task = { ...effectiveTask(), dueOn: "2026-09-08" };
  const priorSuccess = effectiveHistory("2026-09-07", "done");
  const evaluatePolicy = (values: Partial<TaskStateEngineInput["behaviorPolicy"]>) => normalizeTaskBehaviorProfile({
    id: "automatic-missed-policy",
    unresolvedOccurrence: "missed",
    positiveStreakOnUnhandled: "break",
    missedStreakOnUnhandled: "increment",
    rewards: "enabled",
    ...values,
  });
  const project = (policy: TaskStateEngineInput["behaviorPolicy"]) => {
    const result = evaluateTaskState({
      task: { ...task, activeStatus: "pending" },
      history: [priorSuccess],
      behaviorPolicy: policy,
      action: { type: "reconcile_rollover" },
      now: "2026-09-09T12:00:00.000Z",
      timezone: "UTC",
      logicalDayRollover: "00:00",
    });
    const automaticMissed = result.proposedHistoryChanges
      .filter((change): change is Extract<typeof change, { type: "insert" }> => change.type === "insert")
      .map((change) => change.row);
    assert.equal(automaticMissed.length, 1);
    const timeline = buildTaskEffectiveTimeline({
      behaviorPolicy: policy,
      task: { ...task, behaviorPolicy: policy },
      history: [priorSuccess, ...automaticMissed],
      logicalDate: "2026-09-09",
      calendarStart: "2026-09-07",
      calendarEnd: "2026-09-09",
    });
    return { automaticMissed, timeline };
  };

  const preserveIncrement = project(evaluatePolicy({ positiveStreakOnUnhandled: "preserve", missedStreakOnUnhandled: "increment" }));
  assert.equal(preserveIncrement.automaticMissed[0]?.outcome, "missed");
  assert.equal(preserveIncrement.timeline.days["2026-09-08"]?.unhandled, true);
  assert.equal(preserveIncrement.timeline.currentCompletedStreak, 0);
  assert.equal(preserveIncrement.timeline.currentMissedStreak, 1);

  const breakIgnore = project(evaluatePolicy({ positiveStreakOnUnhandled: "break", missedStreakOnUnhandled: "ignore" }));
  assert.equal(breakIgnore.timeline.currentCompletedStreak, 0);
  assert.equal(breakIgnore.timeline.currentMissedStreak, 0);
});

test("historical policy revisions govern their own dates without rewriting facts", () => {
  const revisions = [
    revision("2026-09-01"),
    revision("2026-09-10", { unresolvedOccurrence: "blank", positiveStreakOnUnhandled: "preserve", missedStreakOnUnhandled: "ignore" }),
    revision("2026-09-20"),
  ];
  const timeline = buildTaskEffectiveTimeline({
    behaviorPolicy: STANDARD_TASK_BEHAVIOR_POLICY,
    behaviorPolicyRevisions: revisions,
    task: effectiveTask(),
    history: [effectiveHistory("2026-09-01", "done"), effectiveHistory("2026-09-15", "missed", "manual")],
    logicalDate: "2026-09-25",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-25",
  });
  assert.equal(timeline.days["2026-09-05"]?.behaviorPolicy.unresolvedOccurrence, "missed");
  assert.equal(timeline.days["2026-09-15"]?.state, "missed");
  assert.equal(timeline.days["2026-09-15"]?.unhandled, false);
  assert.equal(timeline.days["2026-09-25"]?.behaviorPolicy.unresolvedOccurrence, "missed");
  assert.equal(timeline.days["2026-09-25"]?.state, "open");
  assert.equal(timeline.days["2026-09-15"]?.outcome, "missed");
});

test("blank historical unhandled occurrences stay blank in Calendar authority", () => {
  const calendarTask = {
    id: "task-settings-calendar",
    user_id: "user-a",
    status: "pending",
    due_on: "2026-09-01",
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    task_type: "custom",
  } as never;
  const result = resolveTaskHistoryCalendarRead({
    compatibilityOnly: true,
    history: [],
    behaviorPolicyRevisions: { custom: [revision("2026-09-09", { unresolvedOccurrence: "blank", positiveStreakOnUnhandled: "preserve", missedStreakOnUnhandled: "ignore" })] },
    logicalDayRollover: "00:00",
    now: "2026-09-03T12:00:00.000Z",
    task: calendarTask,
    timezone: "UTC",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-03",
  });
  assert.equal(result?.states["2026-09-01"], "blank");
  assert.equal(result?.states["2026-09-02"], "blank");
  assert.equal(result?.timeline?.days["2026-09-01"]?.occurrenceIdentity, "task:task-settings-calendar:occurrence:2026-09-01");
  const rows = buildTaskHistoryRowProjections([], result?.timeline?.days);
  assert.equal(rows.find((row) => row.logicalDate === "2026-09-01")?.status, "blank");
  assert.equal(rows.find((row) => row.logicalDate === "2026-09-01")?.isDueOpportunity, false);
});

test("explicit persisted Missed History remains factual under a blank/ignore baseline", () => {
  const baseline = revision("2026-09-09", {
    unresolvedOccurrence: "blank",
    positiveStreakOnUnhandled: "break",
    missedStreakOnUnhandled: "ignore",
  });
  const timeline = buildTaskEffectiveTimeline({
    behaviorPolicy: normalizeTaskBehaviorProfile(baseline, "custom"),
    behaviorPolicyRevisions: [baseline],
    task: effectiveTask(),
    history: [effectiveHistory("2026-09-05", "missed")],
    logicalDate: "2026-09-10",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-10",
  });
  assert.equal(timeline.days["2026-09-05"]?.state, "missed");
  assert.equal(timeline.days["2026-09-05"]?.outcome, "missed");
  assert.equal(timeline.days["2026-09-05"]?.unhandled, false);
});

test("settings UI model exposes configurable Task and Custom tabs with inactive Pursuit and Goal tabs", () => {
  const settingsSource = readFileSync("src/components/task-app/task-type-behavior-settings.tsx", "utf8");
  assert.deepEqual(TASK_TYPE_BEHAVIOR_TABS.map((tab) => tab.value), ["task", "pursuit", "goal", "custom"]);
  assert.match(settingsSource, /Unfinished scheduled occurrence/);
  assert.match(settingsSource, /Missed streak when scheduled occurrence is unfinished/);
  assert.doesNotMatch(settingsSource, /positiveStreakOnUnhandled|Positive streak when scheduled occurrence is unfinished|Preserve streak/);
  assert.match(settingsSource, /Derived effects/);
  assert.doesNotMatch(settingsSource, /System rule/);
  assert.match(settingsSource, /\+ New Ruleset/);
  assert.match(settingsSource, /Ruleset name/);
  assert.match(settingsSource, /onCustomRulesetChange/);
  assert.equal(taskTypeBehaviorTabDescription("pursuit"), "Behavior profile not configured yet.");
  assert.equal(taskTypeBehaviorTabDescription("goal"), "Behavior profile not configured yet.");
  assert.equal(taskTypeBehaviorTabDescription("custom"), null);
  assert.match(settingsSource, /activeTab === "task" \|\| \(activeTab === "custom" && !selectedRuleset\)/);
  assert.match(settingsSource, /updateActiveProfile\("unresolvedOccurrence"/);
  assert.match(settingsSource, /Reset \$\{activeTab === "custom" \? "Custom Default" : "Task"\} Defaults/);
  assert.match(settingsSource, /leaves Task History unchanged/);
  assert.match(settingsSource, /Available Actions/);
  assert.match(settingsSource, /Done/);
  assert.match(settingsSource, /Did My Best/);
  assert.match(settingsSource, /Missed/);
  assert.match(settingsSource, /Delay/);
  assert.match(settingsSource, /Complete/);
  assert.doesNotMatch(settingsSource, /Needs Action/);
  assert.doesNotMatch(settingsSource, /needsActionTriggers/);
  assert.match(settingsSource, /isSavingPolicyArray/);
  assert.match(settingsSource, /disabled=\{resetting \|\| isSavingPolicyArray\}/);
  assert.match(settingsSource, /if \(isSavingPolicyArray \|\| isSavingPolicyArrayRef\.current\) return;/);
  assert.match(settingsSource, /onChange\(activeTab, "availableActions", nextActions\)/);
  assert.match(settingsSource, /onCustomRulesetChange\?\.\(selectedRuleset\.id, "availableActions", nextActions\)/);
  assert.doesNotMatch(settingsSource, /toggleNeedsActionTrigger/);
  assert.doesNotMatch(settingsSource, /nextTriggers/);
  assert.match(behaviorProfilesHookSource, /policySaveInFlightRef/);
  assert.match(behaviorProfilesHookSource, /replaceCurrentRevision\(taskType, previousRevision\)/);
  assert.match(behaviorProfilesHookSource, /finally \{[\s\S]*policySaveInFlightRef\.current\.delete/);
  assert.match(behaviorProfilesHookSource, /replaceCurrentRevision\(taskType, STANDARD_TASK_BEHAVIOR_POLICY\)/);
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
  assert.equal(blankResult.timeline.days["2026-09-08"]?.state, "unhandled_blank");

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
  assert.equal(missedResult.streakDisposition, "preserve_missed");

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

  const earnedRewardResult = evaluateTaskState({
    ...input,
    history: [{
      id: "earned-reward-history",
      taskId: input.task.id,
      logicalDate: "2026-09-09",
      outcome: "done",
      provenance: "manual",
      occurredAt: "2026-09-09T12:00:00.000Z",
      rewardClaimed: true,
    }],
    behaviorPolicy: STANDARD_TASK_BEHAVIOR_POLICY,
  });
  assert.equal(earnedRewardResult.rewardEligibility.eligible, false);
  assert.equal(earnedRewardResult.rewardEligibility.reason, "already_claimed");
});

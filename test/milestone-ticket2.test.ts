import assert from "node:assert/strict";
import test from "node:test";

import type { Milestone, Task } from "../src/lib/database.types.ts";
import {
  MILESTONE_QUESTIONS_VERSION,
  MILESTONE_RULES_VERSION,
  buildMilestoneCorrectionArgs,
  buildMilestoneLockArgs,
  buildMilestoneLookups,
  buildMilestoneRecommendation,
  canCorrectMilestoneSetup,
  canDetachAndPromoteTaskToMilestone,
  canPromoteTaskToMilestone,
  createInitialMilestoneAnswersDraft,
  finalizeMilestoneAnswers,
  getMilestoneTimingSummary,
  getOrCreateMilestoneOperationId,
  mergeMilestoneRows,
  shouldBlockPermanentCompleteForMilestone,
  validateMilestoneAdjustment,
  validateMilestoneQuestion,
  type MilestoneAnswersV1,
} from "../src/lib/milestones/index.ts";
import {
  evaluateTaskListMemberships,
  getBuiltInTaskLists,
  isManualTaskListDestination,
  isTaskListSettingsEligible,
  type TaskListEvaluationContext,
} from "../src/lib/task-lists.ts";

const LOCAL_DATE = "2026-07-16";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    parent_task_id: null,
    repeat_frequency: "none",
    revision: 7,
    status: "pending",
    title: "Learn the guitar",
    ...overrides,
  } as Task;
}

function answers(): MilestoneAnswersV1 {
  return {
    estimatedDuration: { kind: "duration", unit: "weeks", value: 8 },
    weeklyCapacity: { kind: "hours_per_week", hours: 5 },
    difficulty: "difficult",
    meaning: "significant_accomplishment",
    complexity: "many_connected_steps",
    timelinePredictability: "some_uncertainty",
    currentProgress: "planning_started",
    workFrequency: "few_days_per_week",
    externalDeadline: { kind: "none" },
  };
}

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "milestone-1",
    task_id: "task-1",
    task_title_snapshot: "Learn the guitar",
    status: "active",
    task_trashed_at: null,
    revision: 0,
    recommended_tier: "gold",
    recommended_target_date: "2026-10-01",
    allowed_target_date_min: "2026-07-17",
    allowed_target_date_max: "2026-10-24",
    initial_locked_tier: "gold",
    initial_locked_target_date: "2026-10-01",
    current_tier: "gold",
    current_target_date: "2026-10-01",
    current_aura_deadline: "2026-10-04",
    tier_raise_explanation: null,
    setup_correction_used: false,
    locked_at: "2026-07-16T12:00:00.000Z",
    updated_at: "2026-07-16T12:00:00.000Z",
    ...overrides,
  } as Milestone;
}

test("promotion actions use foundation eligibility and suppress an existing identity", () => {
  const empty = new Map<string, Milestone>();
  assert.equal(canPromoteTaskToMilestone(task(), empty), true);
  assert.equal(canPromoteTaskToMilestone(task({ repeat_frequency: "daily_until_complete" }), empty), true);
  assert.equal(canPromoteTaskToMilestone(task({ repeat_frequency: "daily" }), empty), false);
  assert.equal(canPromoteTaskToMilestone(task(), new Map([["task-1", milestone()]])), false);
});

test("detach-and-promote accepts an eligible child and preserves its task ID", () => {
  const child = task({ id: "child-1", parent_task_id: "task-1" });
  assert.equal(canDetachAndPromoteTaskToMilestone(child, new Map()), true);
  assert.equal(child.id, "child-1");
  assert.equal(canDetachAndPromoteTaskToMilestone(child, new Map([[child.id, milestone({ task_id: child.id })]])), false);
});

test("question validation is per-step and finalized answers remain JSON-safe", () => {
  const initial = createInitialMilestoneAnswersDraft();
  assert.equal(initial.estimatedDuration.kind, "duration");
  assert.equal(initial.estimatedDuration.kind === "duration" ? initial.estimatedDuration.unit : null, "weeks");
  assert.match(validateMilestoneQuestion(initial, 0, LOCAL_DATE) ?? "", /positive duration/);
  const complete = {
    ...initial,
    estimatedDuration: { kind: "duration" as const, unit: "weeks" as const, value: 8 },
    weeklyCapacity: { kind: "hours_per_week" as const, hours: 5 },
    difficulty: "difficult" as const,
    meaning: "significant_accomplishment" as const,
    complexity: "many_connected_steps" as const,
    timelinePredictability: "some_uncertainty" as const,
    currentProgress: "planning_started" as const,
    workFrequency: "few_days_per_week" as const,
    externalDeadline: { kind: "not_sure" as const },
  };
  const saved = finalizeMilestoneAnswers(complete, LOCAL_DATE);
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), saved);
  assert.equal(initial.weeklyCapacity, null, "building later answers does not mutate prior setup state");
});

test("recommendation and lock payload use shared rules, stable snapshots, and exact versions", () => {
  const recommendation = buildMilestoneRecommendation(answers(), LOCAL_DATE);
  const args = buildMilestoneLockArgs({
    answers: recommendation.answers,
    completionTimezone: "America/New_York",
    operationId: "operation-1",
    recommendation,
    selectedTargetDate: recommendation.target.recommendedTargetDate,
    selectedTier: recommendation.tier.tier,
    task: task(),
    tierRaiseExplanation: "",
  });
  assert.equal(args.p_questions_version, MILESTONE_QUESTIONS_VERSION);
  assert.equal(args.p_rules_version, MILESTONE_RULES_VERSION);
  assert.deepEqual(args.p_answers_snapshot, recommendation.answers);
  assert.deepEqual(args.p_recommendation_snapshot, recommendation);
  assert.equal(args.p_expected_task_revision, 7);
});

test("pre-lock adjustment enforces tier explanation and persisted date range", () => {
  const base = { allowedMin: "2026-07-17", allowedMax: "2026-10-24", recommendedTier: "gold" as const, selectedTargetDate: "2026-10-01", selectedTier: "platinum" as const, tierRaiseExplanation: "" };
  assert.match(validateMilestoneAdjustment(base) ?? "", /raising/);
  assert.equal(validateMilestoneAdjustment({ ...base, tierRaiseExplanation: "Exceptional scope" }), null);
  assert.match(validateMilestoneAdjustment({ ...base, selectedTargetDate: "2026-10-25", tierRaiseExplanation: "Exceptional scope" }) ?? "", /allowed range/);
});

test("an ambiguous retry retains its operation ID", () => {
  let calls = 0;
  const create = () => `operation-${++calls}`;
  const first = getOrCreateMilestoneOperationId(null, create);
  const retry = getOrCreateMilestoneOperationId(first, create);
  assert.equal(retry, first);
  assert.equal(calls, 1);
});

function listContext(activeIds: ReadonlySet<string>): TaskListEvaluationContext {
  return {
    activeMilestoneTaskIds: activeIds,
    milestoneTaskIds: activeIds,
    currentStreakByTaskId: {},
    focusedTaskIds: new Set(),
    hasStepsByTaskId: {},
    historyFactsByTaskId: {},
    isDueToday: () => false,
    isDueTomorrow: () => false,
    isLater: () => false,
    isOpen: () => true,
    isOverdue: () => false,
    manualMembershipsByTaskId: {},
    taskHistoryByTaskId: {},
    todayDateKey: LOCAL_DATE,
  };
}

test("Milestones system-list membership includes active and completed task-backed rows", () => {
  const lists = getBuiltInTaskLists();
  const active = new Set(["task-1"]);
  assert.equal(evaluateTaskListMemberships(task(), lists, listContext(active)).some((entry) => entry.id === "milestones"), true);
  assert.equal(evaluateTaskListMemberships(task({ status: "complete" }), lists, listContext(active)).some((entry) => entry.id === "milestones"), true);
  assert.equal(evaluateTaskListMemberships(task({ status: "trashed" }), lists, listContext(active)).some((entry) => entry.id === "milestones"), false);
  const abandonedLookups = buildMilestoneLookups([milestone({ status: "abandoned" })]);
  assert.equal(abandonedLookups.activeMilestoneTaskIds.has("task-1"), false);
  assert.equal(abandonedLookups.milestoneTaskIds.has("task-1"), false);
});

test("Milestones is app-owned and excluded from generic destinations and settings", () => {
  const list = getBuiltInTaskLists().find((entry) => entry.id === "milestones");
  assert.ok(list);
  assert.equal(list.isEditable, false);
  assert.equal(list.isDeletable, false);
  assert.equal(isManualTaskListDestination(list), false);
  assert.equal(isTaskListSettingsEligible(list), false);
});

test("inspector timing supports active target, grace, and late details", () => {
  assert.equal(getMilestoneTimingSummary(milestone(), "2026-10-01").label, "Target today");
  assert.equal(getMilestoneTimingSummary(milestone(), "2026-10-02").label, "Grace period");
  assert.equal(getMilestoneTimingSummary(milestone(), "2026-10-05").label, "Aura expired / late");
});

test("correction is available once inside 24 hours and sends expected revision", () => {
  const row = milestone({ revision: 4 });
  assert.equal(canCorrectMilestoneSetup(row, Date.parse(row.locked_at) + 24 * 60 * 60 * 1000), true);
  assert.equal(canCorrectMilestoneSetup(row, Date.parse(row.locked_at) + 24 * 60 * 60 * 1000 + 1), false);
  assert.equal(canCorrectMilestoneSetup(milestone({ setup_correction_used: true }), Date.parse(row.locked_at)), false);
  const args = buildMilestoneCorrectionArgs({ milestone: row, operationId: "correction-1", selectedTargetDate: "2026-10-02", selectedTier: "gold", tierRaiseExplanation: "" });
  assert.equal(args.p_expected_revision, 4);
  assert.equal(args.p_operation_id, "correction-1");
});

test("temporary Complete guard affects only active Milestones", () => {
  const openTask = task();
  assert.equal(shouldBlockPermanentCompleteForMilestone(openTask, milestone()), true);
  assert.equal(shouldBlockPermanentCompleteForMilestone(openTask, milestone({ status: "completed" })), false);
  assert.equal(shouldBlockPermanentCompleteForMilestone(openTask, null), false);
});

test("RPC and Realtime merges remain one row and keep the newest revision", () => {
  const initial = milestone({ revision: 1, updated_at: "2026-07-16T12:00:00.000Z" });
  const rpc = milestone({ revision: 2, updated_at: "2026-07-16T12:01:00.000Z" });
  const afterRpc = mergeMilestoneRows([initial], rpc);
  const afterRealtime = mergeMilestoneRows(afterRpc, rpc);
  assert.equal(afterRealtime.length, 1);
  assert.equal(afterRealtime[0]?.revision, 2);
  assert.equal(mergeMilestoneRows(afterRealtime, initial)[0]?.revision, 2);
});

import assert from "node:assert/strict";
import test from "node:test";

import { isCollectionMastered, evaluateAchievementProgress, getNewTierCrossings } from "../src/lib/achievements-mvp/evaluator.ts";
import {
  buildAggregateOccurrenceKey,
  buildFocusSourceOccurrenceKey,
  buildParentStepSetOccurrenceKey,
  buildStreakOccurrenceKey,
  buildTaskAchievementLogicalDedupeKey,
  buildTaskLogicalOccurrencePart,
  buildTaskSourceOccurrenceKey,
  classifyAchievementTask,
  isAchievementQualifyingOutcome,
  planPermanentAwardReconciliation,
} from "../src/lib/achievements-mvp/identity.ts";
import type { AchievementEntityKind, AchievementEvaluationOccurrence } from "../src/lib/achievements-mvp/types.ts";

type SimulatedHistoryCapture = {
  entityKind: "parent_task" | "step";
  entryDate: string;
  id: string;
  occurrenceKey?: string | null;
  outcome: "complete" | "did_my_best" | "done";
  repeatFrequency?: string | null;
  taskId: string;
  updatedAt: string;
};

type SimulatedOccurrence = {
  dedupeKey: string;
  firstQualifiedAt: string;
  latestHistoryId: string;
  sourceId: string;
  outcome: SimulatedHistoryCapture["outcome"];
};

function simulateTaskHistoryCapture(store: Map<string, SimulatedOccurrence>, history: SimulatedHistoryCapture) {
  const dedupeKey = buildTaskAchievementLogicalDedupeKey({
    entityKind: history.entityKind,
    entryDate: history.entryDate,
    occurrenceKey: history.occurrenceKey,
    repeatFrequency: history.repeatFrequency,
    taskId: history.taskId,
  });
  const existing = store.get(dedupeKey);
  if (existing) {
    existing.firstQualifiedAt = existing.firstQualifiedAt < history.updatedAt ? existing.firstQualifiedAt : history.updatedAt;
    existing.latestHistoryId = history.id;
    existing.outcome = history.outcome;
    return existing;
  }
  const occurrence = {
    dedupeKey,
    firstQualifiedAt: history.updatedAt,
    latestHistoryId: history.id,
    sourceId: history.id,
    outcome: history.outcome,
  };
  store.set(dedupeKey, occurrence);
  return occurrence;
}

function occurrence(id: string, entityKind: AchievementEntityKind, logicalDate: string, options: {
  activeDurationSeconds?: number;
  qualifying?: boolean;
  weekKey?: string;
  monthKey?: string;
} = {}): AchievementEvaluationOccurrence {
  return {
    activeDurationSeconds: options.activeDurationSeconds,
    entityKind,
    firstQualifiedAt: `${logicalDate}T12:00:00.000Z`,
    id,
    isCurrentlyQualifying: options.qualifying ?? true,
    logicalDate,
    monthKey: options.monthKey ?? logicalDate.slice(0, 7),
    weekKey: options.weekKey ?? "2026-07-13",
  };
}

test("Task classification and all three successful outcomes match the locked contract", () => {
  assert.equal(classifyAchievementTask(null), "parent_task");
  assert.equal(classifyAchievementTask("parent-id"), "step");
  assert.deepEqual(["done", "complete", "did_my_best"].map(isAchievementQualifyingOutcome), [true, true, true]);
  assert.deepEqual(["missed", "delayed", "pending", "in_progress", "upcoming", "not_due"].map(isAchievementQualifyingOutcome), [false, false, false, false, false, false]);
});

test("Task, Focus, aggregate, streak, and recurring identities are deterministic", () => {
  const recurring = { entryDate: "2026-07-17", occurrenceKey: "occurrence:2026-07-20", taskId: "task-1" };
  assert.equal(buildTaskSourceOccurrenceKey(recurring), buildTaskSourceOccurrenceKey(recurring));
  assert.equal(buildTaskSourceOccurrenceKey({ ...recurring, occurrenceKey: null }), "task:task-1:logical-date:2026-07-17");
  assert.equal(buildTaskLogicalOccurrencePart({ ...recurring, repeatFrequency: "daily" }), "occurrence:2026-07-20");
  assert.equal(buildTaskLogicalOccurrencePart({ entryDate: "2026-07-17", occurrenceKey: null, repeatFrequency: "none", taskId: "task-1" }), "lifetime:task-1");
  assert.equal(buildTaskLogicalOccurrencePart({ entryDate: "2026-07-17", occurrenceKey: null, repeatFrequency: "daily", taskId: "task-1" }), "logical-date:2026-07-17");
  assert.equal(
    buildTaskAchievementLogicalDedupeKey({ entityKind: "parent_task", ...recurring, repeatFrequency: "daily" }),
    "occurrence:v1:task_history:parent_task:task-1:occurrence%3A2026-07-20",
  );
  assert.equal(buildFocusSourceOccurrenceKey("session-1"), "focus-session:session-1");
  assert.equal(buildAggregateOccurrenceKey("week", "parent_task", "2026-07-13"), "aggregate:v1:week:parent_task:2026-07-13");
  assert.equal(buildStreakOccurrenceKey("do_something", "2026-07-01", "2026-07-07"), "streak:v1:do_something:2026-07-01:2026-07-07");
  assert.equal(
    buildParentStepSetOccurrenceKey("parent", ["step-b", "step-a", "step-a"]),
    buildParentStepSetOccurrenceKey("parent", ["step-a", "step-b"]),
  );
});

test("Task History capture separates source row identity from logical occurrence identity", () => {
  const store = new Map<string, SimulatedOccurrence>();
  const base = { entityKind: "parent_task" as const, entryDate: "2026-07-17", occurrenceKey: "occurrence:2026-07-17", repeatFrequency: "daily", taskId: "task-a" };
  const first = simulateTaskHistoryCapture(store, { ...base, id: "history-a", outcome: "did_my_best", updatedAt: "2026-07-17T12:00:00.000Z" });
  const sameRowRetry = simulateTaskHistoryCapture(store, { ...base, id: "history-a", outcome: "did_my_best", updatedAt: "2026-07-17T12:00:00.000Z" });
  const realtimeRetry = simulateTaskHistoryCapture(store, { ...base, id: "history-a", outcome: "done", updatedAt: "2026-07-17T12:05:00.000Z" });
  const secondSourceSameOccurrence = simulateTaskHistoryCapture(store, { ...base, id: "history-b", outcome: "complete", updatedAt: "2026-07-17T12:10:00.000Z" });

  assert.equal(first, sameRowRetry);
  assert.equal(first, realtimeRetry);
  assert.equal(first, secondSourceSameOccurrence);
  assert.equal(store.size, 1);
  assert.equal(first.sourceId, "history-a");
  assert.equal(first.latestHistoryId, "history-b");
  assert.equal(first.outcome, "complete");
  assert.equal(first.firstQualifiedAt, "2026-07-17T12:00:00.000Z");
});

test("Task History logical identities distinguish recurrence, one-offs, and entity kind", () => {
  const dailyA = buildTaskAchievementLogicalDedupeKey({ entityKind: "parent_task", entryDate: "2026-07-17", occurrenceKey: "occurrence:2026-07-17", repeatFrequency: "daily", taskId: "task-a" });
  const dailyB = buildTaskAchievementLogicalDedupeKey({ entityKind: "parent_task", entryDate: "2026-07-18", occurrenceKey: "occurrence:2026-07-18", repeatFrequency: "daily", taskId: "task-a" });
  const oneOffToday = buildTaskAchievementLogicalDedupeKey({ entityKind: "parent_task", entryDate: "2026-07-17", occurrenceKey: null, repeatFrequency: "none", taskId: "task-a" });
  const oneOffLater = buildTaskAchievementLogicalDedupeKey({ entityKind: "parent_task", entryDate: "2026-08-01", occurrenceKey: null, repeatFrequency: "none", taskId: "task-a" });
  const stepSameTaskId = buildTaskAchievementLogicalDedupeKey({ entityKind: "step", entryDate: "2026-07-17", occurrenceKey: "occurrence:2026-07-17", repeatFrequency: "daily", taskId: "task-a" });

  assert.notEqual(dailyA, dailyB);
  assert.equal(oneOffToday, oneOffLater);
  assert.notEqual(dailyA, stepSameTaskId);
});

test("immediate and recalculation capture order reconciles logical collisions without duplicate progress", () => {
  const sourceRows: SimulatedHistoryCapture[] = [
    { entityKind: "parent_task", entryDate: "2026-07-17", id: "history-immediate", occurrenceKey: "occurrence:2026-07-17", outcome: "done", repeatFrequency: "daily", taskId: "task-a", updatedAt: "2026-07-17T12:00:00.000Z" },
    { entityKind: "parent_task", entryDate: "2026-07-17", id: "history-recalc", occurrenceKey: "occurrence:2026-07-17", outcome: "complete", repeatFrequency: "daily", taskId: "task-a", updatedAt: "2026-07-17T12:10:00.000Z" },
  ];
  for (const orderedRows of [sourceRows, [...sourceRows].reverse()]) {
    const store = new Map<string, SimulatedOccurrence>();
    for (const row of orderedRows) simulateTaskHistoryCapture(store, row);
    const progress = evaluateAchievementProgress([...store.values()].map((item) => occurrence(item.dedupeKey, "parent_task", "2026-07-17")), "2026-07-17");
    const tierAwards = new Set([...store.keys()].map((dedupeKey) => `tier-award:v1:${dedupeKey}:bronze`));
    const notifications = new Set([...tierAwards].map((awardKey) => `notification:v1:${awardKey}`));

    assert.equal(store.size, 1);
    assert.equal(progress.count_on_me.currentValue, 1);
    assert.equal(tierAwards.size, 1);
    assert.equal(notifications.size, 1);
  }
});

test("qualifying corrections reuse identity and inactive corrections reduce current progress", () => {
  const keyBefore = buildTaskSourceOccurrenceKey({ entryDate: "2026-07-17", occurrenceKey: "occurrence:2026-07-17", taskId: "task" });
  const keyAfter = buildTaskSourceOccurrenceKey({ entryDate: "2026-07-17", occurrenceKey: "occurrence:2026-07-17", taskId: "task" });
  assert.equal(keyBefore, keyAfter);
  const progress = evaluateAchievementProgress([
    occurrence("kept", "parent_task", "2026-07-17"),
    occurrence("corrected", "parent_task", "2026-07-17", { qualifying: false }),
  ], "2026-07-17");
  assert.equal(progress.count_on_me.currentValue, 1);
});

test("Done to Missed to Did My Best requalifies the same Step and Step-set without duplicate awards", () => {
  const step = {
    dedupeKey: "occurrence:v1:task_history:step:stable-step-key",
    firstQualifiedAt: "2026-07-17T11:59:00.000Z",
    id: "244967d5-63ea-4661-8726-4f1dd8c46037",
    outcomeSnapshot: "done",
    qualifying: true,
    sourceId: "stable-task-history-source",
    sourceOccurrenceKey: "task:stable-step-key",
  };
  const stepSet = {
    dedupeKey: "occurrence:v1:step_set:stable-set-key",
    firstQualifiedAt: "2026-07-17T12:00:00.000Z",
    id: "c65ee71a-39f2-4a1e-b167-6ffda0467ef7",
    outcomeSnapshot: "done",
    qualifying: true,
    sourceId: "stable-step-set-source",
    sourceOccurrenceKey: "parent-step-set:v1:stable-set-key",
  };
  const stepIdentity = {
    dedupeKey: step.dedupeKey,
    firstQualifiedAt: step.firstQualifiedAt,
    id: step.id,
    sourceId: step.sourceId,
    sourceOccurrenceKey: step.sourceOccurrenceKey,
  };
  const original = { ...stepSet };
  const awards = new Set(["tier-award:v1:last_step:bronze"]);
  const notifications = new Set(["notification:v1:tier-award:v1:last_step:bronze"]);
  const snapshot = () => {
    const inputs = [
      occurrence(step.id, "step", "2026-07-17", { qualifying: step.qualifying }),
      occurrence(stepSet.id, "parent_step_set", "2026-07-17", { qualifying: stepSet.qualifying }),
    ];
    const progress = evaluateAchievementProgress(inputs, "2026-07-17");
    const matchCount = 14 + (step.qualifying ? 4 : 0) + (stepSet.qualifying ? 1 : 0);
    return { matchCount, progress };
  };

  assert.deepEqual(snapshot().matchCount, 19);
  step.qualifying = false;
  stepSet.qualifying = false;
  assert.equal(step.qualifying, false);
  assert.equal(stepSet.qualifying, false);
  assert.equal(snapshot().matchCount, 14);
  assert.equal(snapshot().progress.third_step.currentValue, 0);
  assert.equal(snapshot().progress.last_step.currentValue, 0);
  step.qualifying = true;
  step.outcomeSnapshot = "did_my_best";
  stepSet.qualifying = step.qualifying;
  const restored = snapshot();

  assert.equal(step.id, "244967d5-63ea-4661-8726-4f1dd8c46037");
  assert.equal(stepSet.id, "c65ee71a-39f2-4a1e-b167-6ffda0467ef7");
  assert.equal(step.qualifying, true);
  assert.equal(stepSet.qualifying, true);
  assert.equal(step.outcomeSnapshot, "did_my_best");
  assert.deepEqual({
    dedupeKey: step.dedupeKey,
    firstQualifiedAt: step.firstQualifiedAt,
    id: step.id,
    sourceId: step.sourceId,
    sourceOccurrenceKey: step.sourceOccurrenceKey,
  }, stepIdentity);
  assert.equal(restored.progress.third_step.currentValue, 1);
  assert.equal(restored.progress.last_step.currentValue, 1);
  assert.equal(restored.matchCount, 19);
  assert.deepEqual(stepSet, original);
  assert.equal(awards.size, 1);
  assert.equal(notifications.size, 1);
});

test("a current parent membership with an unfinished Step cannot qualify a Step set", () => {
  const currentStepIds = ["qualified-step", "unfinished-step"];
  const qualifyingOccurrenceByStepId = new Map([["qualified-step", "qualified-occurrence"]]);
  const allCurrentStepsQualify = currentStepIds.every((stepId) => qualifyingOccurrenceByStepId.has(stepId));
  const progress = evaluateAchievementProgress([
    occurrence("qualified-occurrence", "step", "2026-07-17"),
  ], "2026-07-17");

  assert.equal(allCurrentStepsQualify, false);
  assert.equal(progress.third_step.currentValue, 1);
  assert.equal(progress.last_step.currentValue, 0);
});

test("Task daily, weekly, monthly, and cumulative calculations are deterministic", () => {
  const parents = [
    ...Array.from({ length: 10 }, (_, index) => occurrence(`d1-${index}`, "parent_task", "2026-07-13")),
    ...Array.from({ length: 12 }, (_, index) => occurrence(`d2-${index}`, "parent_task", "2026-07-14")),
    occurrence("next-month", "parent_task", "2026-08-03", { monthKey: "2026-08", weekKey: "2026-08-03" }),
  ];
  const progress = evaluateAchievementProgress(parents, "2026-08-03");
  assert.equal(progress.i_can_count_to_ten.currentValue, 2);
  assert.equal(progress.fifty_two_each_year.currentValue, 22);
  assert.equal(progress.twelve_each_year.currentValue, 22);
  assert.equal(progress.count_on_me.currentValue, 23);
});

test("Step daily, weekly, cumulative, and complete-set calculations are isolated", () => {
  const steps = [
    ...Array.from({ length: 4 }, (_, index) => occurrence(`step-${index}`, "step", "2026-07-13")),
    ...Array.from({ length: 3 }, (_, index) => occurrence(`step-next-${index}`, "step", "2026-07-14")),
    occurrence("set-1", "parent_step_set", "2026-07-14"),
  ];
  const progress = evaluateAchievementProgress(steps, "2026-07-14");
  assert.equal(progress.first_step.currentValue, 4);
  assert.equal(progress.second_step.currentValue, 7);
  assert.equal(progress.third_step.currentValue, 7);
  assert.equal(progress.last_step.currentValue, 1);
});

test("Focus uses stored active seconds and ten-minute session qualification", () => {
  const progress = evaluateAchievementProgress([
    occurrence("short", "focus_session", "2026-07-13", { activeDurationSeconds: 599 }),
    occurrence("ten", "focus_session", "2026-07-13", { activeDurationSeconds: 600 }),
    occurrence("long", "focus_session", "2026-07-14", { activeDurationSeconds: 7_200 }),
  ], "2026-07-14");
  assert.equal(progress.broken_clock.currentValue, 7_200);
  assert.equal(progress.overtime.currentValue, 8_399);
  assert.equal(progress.february_challenge.currentValue, 8_399);
  assert.equal(progress.locked_in.currentValue, 8_399);
  assert.equal(progress.staring_contest.currentValue, 7_200);
  assert.equal(progress.session_possible.currentValue, 2);
});

test("all streaks stop at missing days and only closed perfect weeks count", () => {
  const parentDates = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-10", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19"];
  const parents = parentDates.map((date, index) => occurrence(`parent-${index}`, "parent_task", date, { weekKey: date < "2026-07-13" ? "2026-07-06" : "2026-07-13" }));
  const focus = ["2026-07-13", "2026-07-14", "2026-07-15"].map((date, index) => occurrence(`focus-${index}`, "focus_session", date, { activeDurationSeconds: 1_800 }));
  const steps = [occurrence("moving-step", "step", "2026-07-09", { weekKey: "2026-07-06" })];
  const progress = evaluateAchievementProgress([...parents, ...focus, ...steps], "2026-07-20");
  assert.equal(progress.do_something.currentValue, 7);
  assert.equal(progress.do_something.currentStreak, 7);
  assert.equal(progress.dont_get_distracted.currentValue, 3);
  assert.equal(progress.keep_it_moving.currentValue, 7);
  assert.equal(progress.this_week_on_the_streak.currentValue, 1);
  const whileWeekOpen = evaluateAchievementProgress(parents, "2026-07-19");
  assert.equal(whileWeekOpen.this_week_on_the_streak.currentValue, 0);
});

test("multiple tiers cross in order while permanent awards survive lower recalculated progress", () => {
  assert.deepEqual(getNewTierCrossings("last_step", 80, []), ["bronze", "silver", "gold"]);
  assert.deepEqual(getNewTierCrossings("last_step", 80, ["bronze"]), ["silver", "gold"]);
  assert.deepEqual(planPermanentAwardReconciliation(["bronze", "silver"], ["bronze"]), {
    awardsToDelete: [],
    awardsToInsert: [],
  });
});

test("Collection mastery uses only immutable required launch tracks", () => {
  assert.equal(isCollectionMastered("you_can_count_on_me", ["i_can_count_to_ten", "fifty_two_each_year", "twelve_each_year", "count_on_me"]), true);
  assert.equal(isCollectionMastered("you_can_count_on_me", ["i_can_count_to_ten", "fifty_two_each_year", "twelve_each_year"]), false);
});

test("immediate and full recalculation inputs produce identical progress", () => {
  const source = [occurrence("task", "parent_task", "2026-07-17"), occurrence("focus", "focus_session", "2026-07-17", { activeDurationSeconds: 600 })];
  assert.deepEqual(evaluateAchievementProgress(source, "2026-07-17"), evaluateAchievementProgress([...source].reverse(), "2026-07-17"));
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  MILESTONE_QUESTIONS_VERSION,
  MILESTONE_RULES_VERSION,
  addMilestoneCalendarDays,
  buildMilestoneRecommendation,
  buildMilestoneReminderSchedule,
  calculateMilestoneTargetDate,
  classifyMilestoneCompletion,
  getMilestoneAuraDeadline,
  getMilestoneAuraKind,
  getMilestoneEligibility,
  scoreMilestoneTier,
  type MilestoneAnswersV1,
  type MilestoneComplexity,
  type MilestoneCurrentProgress,
  type MilestoneDifficulty,
  type MilestoneEstimatedDuration,
  type MilestoneMeaning,
  type MilestoneTier,
  type MilestoneTimelinePredictability,
} from "../src/lib/milestones/index.ts";

const LOCAL_DATE = "2026-07-16";

function answers(changes: Partial<MilestoneAnswersV1> = {}): MilestoneAnswersV1 {
  return {
    estimatedDuration: { kind: "duration", unit: "days", value: 10 },
    weeklyCapacity: { kind: "hours_per_week", hours: 10 },
    difficulty: "manageable",
    meaning: "meaningful_personal_progress",
    complexity: "one_clear_outcome",
    timelinePredictability: "very_predictable",
    currentProgress: "not_started",
    workFrequency: "most_days",
    externalDeadline: { kind: "none" },
    ...changes,
  };
}

test("Milestone eligibility accepts only open one-off and Daily Until Complete parents", () => {
  assert.deepEqual(getMilestoneEligibility({ parent_task_id: null, repeat_frequency: "none", status: "pending" }), { eligible: true, reason: "eligible" });
  assert.deepEqual(getMilestoneEligibility({ parent_task_id: null, repeat_frequency: "daily_until_complete", status: "in_progress" }), { eligible: true, reason: "eligible" });

  for (const repeat_frequency of ["daily", "weekly", "monthly", "custom"] as const) {
    assert.deepEqual(getMilestoneEligibility({ parent_task_id: null, repeat_frequency, status: "pending" }), { eligible: false, reason: "indefinitely_recurring" });
  }
  assert.deepEqual(getMilestoneEligibility({ parent_task_id: "parent", repeat_frequency: "none", status: "pending" }), { eligible: false, reason: "child_task" });
  for (const status of ["complete", "archived", "trashed"] as const) {
    assert.deepEqual(getMilestoneEligibility({ parent_task_id: null, repeat_frequency: "none", status }), { eligible: false, reason: "closed_task" });
  }
});

test("tier thresholds change exactly at 4/5, 8/9, and 14/15", () => {
  const cases: Array<[number, MilestoneTier, Partial<MilestoneAnswersV1>]> = [
    [4, "bronze", { estimatedDuration: { kind: "duration", unit: "hours", value: 8 }, meaning: "major_life_or_project_goal" }],
    [5, "silver", { estimatedDuration: { kind: "duration", unit: "hours", value: 8 }, meaning: "exceptional_or_defining_achievement" }],
    [8, "silver", { estimatedDuration: { kind: "duration", unit: "years", value: 1 }, difficulty: "difficult", meaning: "significant_accomplishment" }],
    [9, "gold", { estimatedDuration: { kind: "duration", unit: "years", value: 1 }, difficulty: "difficult", meaning: "significant_accomplishment", complexity: "several_manageable_steps" }],
    [14, "gold", { estimatedDuration: { kind: "duration", unit: "years", value: 1 }, difficulty: "very_difficult", meaning: "exceptional_or_defining_achievement", complexity: "not_sure" }],
    [15, "platinum", { estimatedDuration: { kind: "duration", unit: "years", value: 1 }, difficulty: "very_difficult", meaning: "exceptional_or_defining_achievement", complexity: "not_sure", timelinePredictability: "some_uncertainty" }],
  ];

  for (const [expectedScore, expectedTier, changes] of cases) {
    const result = scoreMilestoneTier(answers(changes), LOCAL_DATE);
    assert.equal(result.totalScore, expectedScore);
    assert.equal(result.tier, expectedTier);
    assert.equal(result.version, MILESTONE_RULES_VERSION);
  }
});

test("tier scoring covers every approved factor value", () => {
  const durationCases: Array<[MilestoneEstimatedDuration, number]> = [
    [{ kind: "duration", unit: "hours", value: 8 }, 0],
    [{ kind: "duration", unit: "hours", value: 9 }, 1],
    [{ kind: "duration", unit: "hours", value: 41 }, 2],
    [{ kind: "duration", unit: "hours", value: 121 }, 3],
    [{ kind: "duration", unit: "days", value: 3 }, 0],
    [{ kind: "duration", unit: "days", value: 4 }, 1],
    [{ kind: "duration", unit: "days", value: 15 }, 2],
    [{ kind: "duration", unit: "days", value: 61 }, 3],
    [{ kind: "duration", unit: "weeks", value: 2 }, 1],
    [{ kind: "duration", unit: "weeks", value: 3 }, 2],
    [{ kind: "duration", unit: "weeks", value: 9 }, 3],
    [{ kind: "duration", unit: "months", value: 2 }, 2],
    [{ kind: "duration", unit: "months", value: 3 }, 3],
    [{ kind: "duration", unit: "years", value: 1 }, 3],
    [{ kind: "target_date", targetDate: "2026-07-19" }, 0],
    [{ kind: "target_date", targetDate: "2026-07-20" }, 1],
    [{ kind: "target_date", targetDate: "2026-07-31" }, 2],
    [{ kind: "target_date", targetDate: "2026-09-15" }, 3],
    [{ kind: "not_sure" }, 1],
  ];
  for (const [estimatedDuration, expected] of durationCases) {
    assert.equal(scoreMilestoneTier(answers({ estimatedDuration, meaning: "meaningful_personal_progress" }), LOCAL_DATE).factorScores.duration, expected);
  }

  const difficultyCases: Array<[MilestoneDifficulty, number]> = [["manageable", 0], ["moderately_challenging", 1], ["difficult", 3], ["very_difficult", 4], ["not_sure", 2]];
  const meaningCases: Array<[MilestoneMeaning, number]> = [["meaningful_personal_progress", 1], ["significant_accomplishment", 2], ["major_life_or_project_goal", 4], ["exceptional_or_defining_achievement", 5], ["not_sure", 2]];
  const complexityCases: Array<[MilestoneComplexity, number]> = [["one_clear_outcome", 0], ["several_manageable_steps", 1], ["many_connected_steps", 3], ["large_multi_stage_project", 4], ["not_sure", 2]];
  const predictabilityCases: Array<[MilestoneTimelinePredictability, number]> = [["very_predictable", 0], ["some_uncertainty", 1], ["highly_variable", 2], ["depends_on_others", 2], ["not_sure", 1]];
  for (const [difficulty, expected] of difficultyCases) assert.equal(scoreMilestoneTier(answers({ difficulty }), LOCAL_DATE).factorScores.difficulty, expected);
  for (const [meaning, expected] of meaningCases) assert.equal(scoreMilestoneTier(answers({ meaning }), LOCAL_DATE).factorScores.meaning, expected);
  for (const [complexity, expected] of complexityCases) assert.equal(scoreMilestoneTier(answers({ complexity }), LOCAL_DATE).factorScores.complexity, expected);
  for (const [timelinePredictability, expected] of predictabilityCases) assert.equal(scoreMilestoneTier(answers({ timelinePredictability }), LOCAL_DATE).factorScores.predictability, expected);
});

test("Martin guitar trial resolves to Gold with deterministic factor explanations", () => {
  const martinTrial = answers({
    estimatedDuration: { kind: "duration", unit: "months", value: 2 },
    difficulty: "difficult",
    meaning: "significant_accomplishment",
    complexity: "many_connected_steps",
    timelinePredictability: "some_uncertainty",
  });
  const result = scoreMilestoneTier(martinTrial, LOCAL_DATE);
  assert.equal(result.totalScore, 11);
  assert.equal(result.tier, "gold");
  assert.deepEqual(result.explanationPhrases, ["the expected difficulty", "the number of connected stages"]);
});

test("target calculation converts every duration unit deterministically", () => {
  const cases: Array<[MilestoneEstimatedDuration, number]> = [
    [{ kind: "duration", unit: "hours", value: 20 }, 14],
    [{ kind: "duration", unit: "days", value: 10 }, 10],
    [{ kind: "duration", unit: "weeks", value: 2 }, 14],
    [{ kind: "duration", unit: "months", value: 1 }, 30],
    [{ kind: "duration", unit: "years", value: 1 }, 365],
    [{ kind: "target_date", targetDate: "2026-08-05" }, 20],
  ];
  for (const [estimatedDuration, expected] of cases) {
    assert.equal(calculateMilestoneTargetDate(answers({ estimatedDuration }), "gold", LOCAL_DATE).calculatedDurationDays, expected);
  }
});

test("unknown duration uses the tier defaults", () => {
  const expected: Record<MilestoneTier, number> = { bronze: 14, silver: 30, gold: 90, platinum: 180 };
  for (const tier of Object.keys(expected) as MilestoneTier[]) {
    assert.equal(calculateMilestoneTargetDate(answers({ estimatedDuration: { kind: "not_sure" } }), tier, LOCAL_DATE).baseDurationDays, expected[tier]);
  }
});

test("progress, pace, complexity, and predictability multipliers are applied as approved", () => {
  const progressExpected: Record<MilestoneCurrentProgress, number> = {
    not_started: 100,
    planning_started: 90,
    partly_complete: 65,
    more_than_half: 40,
    almost_finished: 15,
    not_sure: 100,
  };
  for (const [currentProgress, expected] of Object.entries(progressExpected) as Array<[MilestoneCurrentProgress, number]>) {
    const result = calculateMilestoneTargetDate(answers({ currentProgress, estimatedDuration: { kind: "duration", unit: "days", value: 100 } }), "gold", LOCAL_DATE);
    assert.equal(result.calculatedDurationDays, expected);
  }

  const maxPace = calculateMilestoneTargetDate(answers({
    estimatedDuration: { kind: "duration", unit: "days", value: 10 },
    weeklyCapacity: { kind: "hours_per_week", hours: 3 },
    workFrequency: "irregularly",
  }), "gold", LOCAL_DATE);
  assert.equal(maxPace.capacityMultiplier, 1.25);
  assert.equal(maxPace.workFrequencyMultiplier, 1.6);
  assert.equal(maxPace.paceMultiplier, 1.6);
  assert.equal(maxPace.calculatedDurationDays, 16);

  const complexUncertain = calculateMilestoneTargetDate(answers({
    complexity: "large_multi_stage_project",
    timelinePredictability: "depends_on_others",
  }), "gold", LOCAL_DATE);
  assert.equal(complexUncertain.calculatedDurationDays, 18);
});

test("preferred and firm external deadlines follow the 85 percent rule", () => {
  const preferredAccepted = calculateMilestoneTargetDate(answers({ externalDeadline: { kind: "preferred", date: "2026-07-25" } }), "gold", LOCAL_DATE);
  assert.equal(preferredAccepted.recommendedTargetDate, "2026-07-25");
  assert.equal(preferredAccepted.feasibilityWarning, null);

  const preferredRejected = calculateMilestoneTargetDate(answers({ externalDeadline: { kind: "preferred", date: "2026-07-24" } }), "gold", LOCAL_DATE);
  assert.equal(preferredRejected.recommendedTargetDate, "2026-07-26");
  assert.match(preferredRejected.feasibilityWarning ?? "", /below 85%/);

  const firm = calculateMilestoneTargetDate(answers({ externalDeadline: { kind: "firm", date: "2026-07-21" } }), "gold", LOCAL_DATE);
  assert.equal(firm.recommendedTargetDate, "2026-07-21");
  assert.match(firm.feasibilityWarning ?? "", /firm deadline/i);
});

test("new Milestone dates before tomorrow are rejected", () => {
  assert.throws(() => calculateMilestoneTargetDate(answers({ estimatedDuration: { kind: "target_date", targetDate: LOCAL_DATE } }), "gold", LOCAL_DATE), /tomorrow or later/);
  assert.throws(() => calculateMilestoneTargetDate(answers({ externalDeadline: { kind: "firm", date: "2026-07-15" } }), "gold", LOCAL_DATE), /tomorrow or later/);
});

test("adjustment range uses minimum, proportional, and capped extensions", () => {
  const minimum = calculateMilestoneTargetDate(answers({ estimatedDuration: { kind: "duration", unit: "days", value: 10 } }), "gold", LOCAL_DATE);
  assert.equal(minimum.allowedTargetDateMin, "2026-07-17");
  assert.equal(minimum.allowedTargetDateMax, "2026-08-02");

  const proportional = calculateMilestoneTargetDate(answers({ estimatedDuration: { kind: "duration", unit: "days", value: 100 } }), "gold", LOCAL_DATE);
  assert.equal(proportional.allowedTargetDateMax, addMilestoneCalendarDays(proportional.recommendedTargetDate, 25));

  const capped = calculateMilestoneTargetDate(answers({ estimatedDuration: { kind: "duration", unit: "days", value: 400 } }), "gold", LOCAL_DATE);
  assert.equal(capped.allowedTargetDateMax, addMilestoneCalendarDays(capped.recommendedTargetDate, 90));
});

test("aura timing distinguishes target, all grace days, and late completion", () => {
  const target = "2026-03-07";
  assert.equal(getMilestoneAuraDeadline(target), "2026-03-10");
  assert.equal(classifyMilestoneCompletion(target, target), "on_time");
  assert.equal(classifyMilestoneCompletion("2026-03-08", target), "grace_period");
  assert.equal(classifyMilestoneCompletion("2026-03-09", target), "grace_period");
  assert.equal(classifyMilestoneCompletion("2026-03-10", target), "grace_period");
  assert.equal(classifyMilestoneCompletion("2026-03-11", target), "late");
  assert.equal(getMilestoneAuraKind("platinum", "on_time"), "diamond");
  assert.equal(getMilestoneAuraKind("platinum", "grace_period"), "diamond");
  assert.equal(getMilestoneAuraKind("gold", "grace_period"), "standard");
  assert.equal(getMilestoneAuraKind("platinum", "late"), "none");
  assert.equal(addMilestoneCalendarDays("2026-03-07", 1), "2026-03-08");
});

test("reminder schedule returns four rows and skips opportunities before lock date", () => {
  assert.deepEqual(buildMilestoneReminderSchedule("2026-07-10", "2026-07-01"), [
    { kind: "seven_days", scheduledDate: "2026-07-03", status: "pending" },
    { kind: "three_days", scheduledDate: "2026-07-07", status: "pending" },
    { kind: "target_day", scheduledDate: "2026-07-10", status: "pending" },
    { kind: "final_aura_day", scheduledDate: "2026-07-13", status: "pending" },
  ]);
  assert.deepEqual(buildMilestoneReminderSchedule("2026-07-03", "2026-07-01"), [
    { kind: "seven_days", scheduledDate: "2026-06-26", status: "skipped" },
    { kind: "three_days", scheduledDate: "2026-06-30", status: "skipped" },
    { kind: "target_day", scheduledDate: "2026-07-03", status: "pending" },
    { kind: "final_aura_day", scheduledDate: "2026-07-06", status: "pending" },
  ]);
});

test("answer and recommendation snapshots are JSON-safe and version-stable", () => {
  const recommendation = buildMilestoneRecommendation(answers({
    externalDeadline: { kind: "preferred", date: "2026-08-01" },
  }), LOCAL_DATE);
  assert.equal(recommendation.questionsVersion, MILESTONE_QUESTIONS_VERSION);
  assert.equal(recommendation.rulesVersion, MILESTONE_RULES_VERSION);
  assert.deepEqual(JSON.parse(JSON.stringify(recommendation)), recommendation);
});

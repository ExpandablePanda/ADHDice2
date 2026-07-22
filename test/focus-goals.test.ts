import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { FocusCategory, FocusDailyGoalAdjustment, HistoricalFocusSession } from "@/lib/types";
import {
  buildFocusGoalMonthPlan,
  buildFocusGoalPlan,
  detectDailySurplus,
  formatFocusGoalDuration,
  getAllocationSummary,
  getBaseTodayTargetSeconds,
  getEligibleSurplusTargets,
  getIncomingCarryoverCreditSeconds,
  getOverWeeklyDailyTargetReallocationPool,
  getPromptedDailySurplusSeconds,
  getSurplusOverrideTargets,
  normalizePriorityLevel,
  OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON,
  resolveFocusGoalSessionDateKey,
  resolveCountsTowardProductiveGoal,
} from "@/lib/focus-goals";

const HOUR = 3600;
const focusGoalsPanelSource = readFileSync(new URL("../src/components/focus-goals-panel.tsx", import.meta.url), "utf8");

function category(overrides: Partial<FocusCategory>): FocusCategory {
  return {
    id: overrides.id ?? "cat-1",
    title: overrides.title ?? "Coding",
    focusType: overrides.focusType ?? "Work",
    focusSubtype: overrides.focusSubtype ?? "Productive",
    focusSubtype2: overrides.focusSubtype2 ?? null,
    color: "#6f57f6",
    icon: "Code",
    dailyGoalSeconds: null,
    weeklyGoalSeconds: 7 * HOUR,
    priorityLevel: 3,
    targetDistributionMode: "auto",
    weekdayTargetSeconds: {},
    countTowardProductiveGoal: null,
    allowDailySurplusReduction: null,
    weeklySurplusCarryoverMode: "off",
    ...overrides,
  };
}

function session(overrides: Partial<HistoricalFocusSession>): HistoricalFocusSession {
  return {
    id: overrides.id ?? "session-1",
    categoryId: overrides.categoryId ?? "cat-1",
    title: overrides.title ?? "Coding",
    date: overrides.date ?? "2026-07-07",
    durationSeconds: overrides.durationSeconds ?? HOUR,
    focusType: overrides.focusType ?? "Work",
    focusSubtype: overrides.focusSubtype ?? "Productive",
    focusSubtype2: overrides.focusSubtype2 ?? null,
  };
}

function adjustment(overrides: Partial<FocusDailyGoalAdjustment>): FocusDailyGoalAdjustment {
  return {
    id: overrides.id ?? "adjust-1",
    userId: overrides.userId ?? "user-1",
    adjustmentDate: overrides.adjustmentDate ?? "2026-07-07",
    sourceCategoryId: overrides.sourceCategoryId ?? "cat-1",
    targetCategoryId: overrides.targetCategoryId ?? "target",
    sourceSessionId: overrides.sourceSessionId ?? null,
    reductionSeconds: overrides.reductionSeconds ?? HOUR,
    reason: overrides.reason ?? "daily_surplus_reallocation",
    createdAt: overrides.createdAt ?? "2026-07-07T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-07T12:00:00.000Z",
  };
}

test("Priority 5 outranks lower priorities", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "p3", title: "Admin", priorityLevel: 3 }),
      category({ id: "p5", title: "Deep Work", priorityLevel: 5 }),
    ],
    history: [],
    todayDate: "2026-07-07",
  });
  assert.equal(normalizePriorityLevel(5), 5);
  assert.equal(plan.recommendedCategoryId, "p5");
});

test("focus goal duration formatting carries residual minutes without rendering 60m", () => {
  assert.equal(formatFocusGoalDuration(7199), "1h 59m");
  assert.equal(formatFocusGoalDuration(7200), "2h");
});

test("monthly goal plan sums effective daily targets, adjustments, logged activity, and seven-day buckets", () => {
  const coding = category({ id: "coding", weeklyGoalSeconds: 7 * HOUR });
  const plan = buildFocusGoalMonthPlan({
    adjustments: [adjustment({ adjustmentDate: "2026-07-08", reductionSeconds: 30 * 60, targetCategoryId: "coding" })],
    categories: [coding],
    history: [
      session({ categoryId: "coding", date: "2026-07-01", durationSeconds: HOUR }),
      session({ categoryId: "coding", date: "2026-07-08", durationSeconds: 2 * HOUR, id: "session-2" }),
    ],
    monthDate: "2026-07-22",
  });
  const [summary] = plan.summaries;
  assert.equal(plan.startDate, "2026-07-01");
  assert.equal(plan.endDate, "2026-07-31");
  assert.equal(summary.actualSeconds, 3 * HOUR);
  assert.equal(summary.targetSeconds, (31 * HOUR) - (30 * 60));
  assert.equal(summary.buckets.length, 5);
  assert.equal(summary.buckets[0].actualSeconds, HOUR);
  assert.equal(summary.buckets[1].actualSeconds, 2 * HOUR);
  assert.equal(summary.buckets[4].endDate, "2026-07-31");
});

test("Focus Goals copies the Activity Summary shell with scoped and category chip controls", () => {
  assert.match(focusGoalsPanelSource, /max-w-6xl[\s\S]*?rounded-\[var\(--radius-modal\)\][\s\S]*?bg-\[var\(--surface-elevated\)\][\s\S]*?shadow-\[var\(--shadow-card\)\]/);
  assert.match(focusGoalsPanelSource, /\["daily", "weekly", "monthly"\] as const/);
  assert.match(focusGoalsPanelSource, /getConnectedGoalChipClass\(index, items\.length\)/);
  assert.match(focusGoalsPanelSource, /aria-label="Focus goal category"[\s\S]*?>\s*Overview[\s\S]*?filteredSummaries\.map/);
  assert.match(focusGoalsPanelSource, /effectiveSelectedCategoryId === summary\.category\.id/);
  assert.doesNotMatch(focusGoalsPanelSource, /xl:grid-cols-2/);
});

test("Focus Goals places an approved category search chip before Overview and filters category choices", () => {
  assert.match(focusGoalsPanelSource, /TASK_TABLE_CHIP_BASE_CLASS[\s\S]*?aria-label="Search focus goal categories"[\s\S]*?placeholder="Search categories"[\s\S]*?>\s*Overview/);
  assert.match(focusGoalsPanelSource, /text-\[13px\] font-medium leading-none/);
  assert.match(focusGoalsPanelSource, /summary\.category\.title\.toLowerCase\(\)\.includes\(normalizedSearch\)/);
  assert.match(focusGoalsPanelSource, /filteredSummaries\.map/);
});

test("Focus Goals category chips sort alphabetically without changing progress ranking", () => {
  assert.match(focusGoalsPanelSource, /categoryChipSummaries = useMemo[\s\S]*?category\.title\.localeCompare\(right\.category\.title/);
  assert.match(focusGoalsPanelSource, /if \(!normalizedSearch\) return categoryChipSummaries/);
  assert.match(focusGoalsPanelSource, /const rankedOverviewSummaries = sortedSummaries/);
});

test("Focus Goals renders one selected category with scope-specific daily weekly and monthly bars", () => {
  assert.match(focusGoalsPanelSource, /selectedSummary \? \([\s\S]*?selectedSummary\.category\.title/);
  assert.match(focusGoalsPanelSource, /scope === "daily"[\s\S]*?scope === "weekly"[\s\S]*?selectedMonthSummary\?\.buckets/);
  assert.match(focusGoalsPanelSource, /label: `W\$\{index \+ 1\}`/);
  assert.match(focusGoalsPanelSource, /label: "Month"/);
  assert.match(focusGoalsPanelSource, /adhdice-scrollbar min-w-0 overflow-x-auto/);
});

test("Focus Goals keeps selected-category metadata in one horizontally scrollable row", () => {
  assert.match(focusGoalsPanelSource, /adhdice-scrollbar flex flex-nowrap items-center gap-4 overflow-x-auto[\s\S]*?targetText\("Today"[\s\S]*?weeklyTargetText[\s\S]*?Status:/);
  assert.match(focusGoalsPanelSource, /<p className="shrink-0">\{targetText/);
});

test("Focus Goals Overview groups completed, in-progress, and not-started vertical bars", () => {
  assert.match(focusGoalsPanelSource, /rankedOverviewSummaries = sortedSummaries[\s\S]*?scope === "daily"[\s\S]*?scope === "weekly"[\s\S]*?monthSummary\?\.actualSeconds/);
  assert.match(focusGoalsPanelSource, /goalProgressGroup\(left\.actualSeconds, left\.targetSeconds\)[\s\S]*?leftGroup - rightGroup/);
  assert.match(focusGoalsPanelSource, /leftGroup === 2[\s\S]*?right\.targetSeconds - left\.targetSeconds[\s\S]*?right\.actualSeconds - left\.actualSeconds/);
  assert.match(focusGoalsPanelSource, /aria-label="Category progress ranked by total time"[\s\S]*?overflow-x-auto[\s\S]*?rankedOverviewSummaries\.map[\s\S]*?<GoalColumn/);
  assert.match(focusGoalsPanelSource, /Math\.min\(100, \(actualSeconds \/ targetSeconds\) \* 100\)/);
  assert.match(focusGoalsPanelSource, /color=\{summary\.category\.color\}[\s\S]*?label=\{summary\.category\.title\}/);
});

test("Focus Goals vertical bars keep fixed aligned label slots and even overview spacing", () => {
  assert.match(focusGoalsPanelSource, /GOAL_COLUMN_TEXT_CLASS[\s\S]*?flex h-11 w-full items-start justify-center whitespace-normal break-words pt-2 text-center leading-tight[\s\S]*?title=\{label\}/);
  assert.match(focusGoalsPanelSource, /flex min-w-max items-start gap-6 px-2 sm:gap-8/);
  assert.match(focusGoalsPanelSource, /className="w-28"/);
});

test("Focus Goals category labels stay black even when their bars are complete", () => {
  assert.match(focusGoalsPanelSource, /break-words pt-2 text-center leading-tight text-black dark:text-white/);
  assert.doesNotMatch(focusGoalsPanelSource, /isOver \? "text-\[#32734c\]/);
});

test("Focus Goals vertical-bar text shares the approved status typography", () => {
  assert.match(focusGoalsPanelSource, /const GOAL_COLUMN_TEXT_CLASS = "text-sm font-semibold"/);
  assert.equal((focusGoalsPanelSource.match(/GOAL_COLUMN_TEXT_CLASS/g) ?? []).length, 4);
});

test("Focus Goals vertical bars use the borderless muted progress-track treatment", () => {
  assert.match(focusGoalsPanelSource, /rounded-md bg-\[var\(--surface-muted\)\] shadow-inner sm:max-w-\[3rem\] dark:bg-white\/\[0\.06\]/);
  assert.doesNotMatch(focusGoalsPanelSource, /border-black\/20|dark:border-white\/20|shadow-\[inset_0_0_4px/);
});

test("Sleep is excluded from productive totals", () => {
  const sleep = category({ id: "sleep", title: "Sleep", focusType: "Sleep", countTowardProductiveGoal: true });
  const plan = buildFocusGoalPlan({
    categories: [sleep],
    history: [session({ categoryId: "sleep", durationSeconds: 8 * HOUR })],
    todayDate: "2026-07-07",
  });
  assert.equal(resolveCountsTowardProductiveGoal(sleep), false);
  assert.equal(plan.productiveTodaySeconds, 0);
  assert.equal(plan.productiveTodayTargetSeconds, 0);
  assert.equal(plan.productiveWeekTargetSeconds, 0);
});

test("Productive totals include Work Paid and Unpaid by smart default", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "paid", focusType: "Work", focusSubtype: "Paid", weeklyGoalSeconds: 7 * HOUR, countTowardProductiveGoal: null }),
      category({ id: "unpaid", focusType: "Work", focusSubtype: "Unpaid", weeklyGoalSeconds: 7 * HOUR, countTowardProductiveGoal: null }),
    ],
    history: [
      session({ id: "paid-session", categoryId: "paid", durationSeconds: HOUR }),
      session({ id: "unpaid-session", categoryId: "unpaid", durationSeconds: 2 * HOUR }),
    ],
    todayDate: "2026-07-07",
  });
  assert.equal(resolveCountsTowardProductiveGoal(plan.summaries[0].category), true);
  assert.equal(resolveCountsTowardProductiveGoal(plan.summaries[1].category), true);
  assert.equal(plan.productiveTodaySeconds, 3 * HOUR);
});

test("Productive totals include Personal Productive and Creative Productive by smart default", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "personal", focusType: "Personal", focusSubtype: "Productive", weeklyGoalSeconds: 7 * HOUR, countTowardProductiveGoal: null }),
      category({ id: "creative", focusType: "Creative", focusSubtype: "Productive", weeklyGoalSeconds: 7 * HOUR, countTowardProductiveGoal: null }),
    ],
    history: [
      session({ id: "personal-session", categoryId: "personal", durationSeconds: HOUR }),
      session({ id: "creative-session", categoryId: "creative", durationSeconds: HOUR }),
    ],
    todayDate: "2026-07-07",
  });
  assert.equal(plan.productiveTodaySeconds, 2 * HOUR);
});

test("Null productive toggle uses smart defaults and casing differences do not break inclusion", () => {
  const mixedCase = category({
    id: "mixed",
    focusType: " personal ",
    focusSubtype: " PRODUCTIVE ",
    weeklyGoalSeconds: 7 * HOUR,
    countTowardProductiveGoal: null,
  });
  assert.equal(resolveCountsTowardProductiveGoal(mixedCase), true);
});

test("Unproductive sessions are excluded from productive totals", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ id: "scroll", title: "Scrolling", focusType: "Personal", focusSubtype: "Unproductive", weeklyGoalSeconds: 7 * HOUR, countTowardProductiveGoal: null })],
    history: [session({ categoryId: "scroll", durationSeconds: HOUR })],
    todayDate: "2026-07-07",
  });
  assert.equal(plan.productiveTodaySeconds, 0);
  assert.equal(plan.productiveTodayExcludedUnproductiveSeconds, HOUR);
});

test("Productive Today uses the same effective date key as category today bars", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ id: "work", weeklyGoalSeconds: 7 * HOUR })],
    history: [
      session({ id: "today", categoryId: "work", date: "2026-07-07", endedAt: "2026-07-07T23:30:00.000Z", durationSeconds: HOUR }),
      session({ id: "other-day", categoryId: "work", date: "2026-07-08", endedAt: "2026-07-07T23:55:00.000Z", durationSeconds: 2 * HOUR }),
    ],
    todayDate: "2026-07-07",
  });
  assert.equal(resolveFocusGoalSessionDateKey(session({ date: "2026-07-07", endedAt: "2026-07-08T03:30:00.000Z" })), "2026-07-07");
  assert.equal(plan.productiveTodaySeconds, HOUR);
  assert.equal(plan.summaries[0].dailySummaries.find((day) => day.date === "2026-07-07")?.actualSeconds, HOUR);
});

test("Productive totals include actuals against fixed base daily and weekly targets", () => {
  const plan = buildFocusGoalPlan({
    adjustments: [{ id: "adjust-1", adjustmentDate: "2026-07-07", sourceCategoryId: "source", targetCategoryId: "work", reductionSeconds: HOUR, sourceSessionId: null, createdAt: "2026-07-07T12:00:00.000Z" }],
    categories: [
      category({ id: "work", weeklyGoalSeconds: 14 * HOUR }),
      category({ id: "sleep", title: "Sleep", focusType: "Sleep", weeklyGoalSeconds: 56 * HOUR, countTowardProductiveGoal: true }),
    ],
    history: [session({ categoryId: "work", durationSeconds: 3 * HOUR })],
    todayDate: "2026-07-07",
  });
  assert.equal(plan.productiveTodaySeconds, 3 * HOUR);
  assert.equal(plan.productiveTodayTargetSeconds, 2 * HOUR);
  assert.equal(plan.productiveTodayBaseTargetSeconds, 2 * HOUR);
  assert.equal(plan.productiveTodayReallocatedSeconds, HOUR);
  assert.equal(plan.productiveWeekTargetSeconds, 14 * HOUR);
});

test("Weekly target distributes equally by default", () => {
  assert.equal(getBaseTodayTargetSeconds(category({ weeklyGoalSeconds: 14 * HOUR }), "2026-07-07"), 2 * HOUR);
});

test("Manual weekday target overrides auto target", () => {
  assert.equal(getBaseTodayTargetSeconds(category({
    targetDistributionMode: "manual",
    weekdayTargetSeconds: { tue: 3 * HOUR },
  }), "2026-07-07"), 3 * HOUR);
});

test("Unused manual weekdays resolve to zero", () => {
  assert.equal(getBaseTodayTargetSeconds(category({
    targetDistributionMode: "manual",
    weekdayTargetSeconds: { mon: 3 * HOUR },
  }), "2026-07-07"), 0);
});

test("Missed Monday target spreads across Tuesday through Sunday as catch-up pace", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ weeklyGoalSeconds: 7 * HOUR })],
    history: [],
    todayDate: "2026-07-07",
  });
  assert.equal(plan.summaries[0].catchUpPaceSeconds, Math.round(7 * HOUR / 6));
});

test("Over daily target creates surplus", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ weeklyGoalSeconds: 7 * HOUR })],
    history: [session({ durationSeconds: 2 * HOUR })],
    todayDate: "2026-07-07",
  });
  assert.equal(detectDailySurplus(plan.summaries[0]), HOUR);
});

test("Prompted surplus is only the over-target portion when a session starts under target", () => {
  assert.equal(getPromptedDailySurplusSeconds({
    afterHistory: [session({ id: "before", durationSeconds: 45 * 60 }), session({ id: "new", durationSeconds: 30 * 60 })],
    beforeHistory: [session({ id: "before", durationSeconds: 45 * 60 })],
    categoryId: "cat-1",
    sourceSessionId: "new",
    targetSeconds: HOUR,
    todayDate: "2026-07-07",
  }), 15 * 60);
});

test("Prompted surplus is incremental when category was already over target before session", () => {
  assert.equal(getPromptedDailySurplusSeconds({
    afterHistory: [session({ id: "before", durationSeconds: 2 * HOUR }), session({ id: "new", durationSeconds: HOUR })],
    beforeHistory: [session({ id: "before", durationSeconds: 2 * HOUR })],
    categoryId: "cat-1",
    sourceSessionId: "new",
    targetSeconds: HOUR,
    todayDate: "2026-07-07",
  }), HOUR);
});

test("Prompted surplus is zero when category remains under target after session", () => {
  assert.equal(getPromptedDailySurplusSeconds({
    afterHistory: [session({ id: "new", durationSeconds: 45 * 60 })],
    beforeHistory: [],
    categoryId: "cat-1",
    sourceSessionId: "new",
    targetSeconds: HOUR,
    todayDate: "2026-07-07",
  }), 0);
});

test("Existing allocations do not make the same surplus prompt again", () => {
  assert.equal(getPromptedDailySurplusSeconds({
    adjustments: [adjustment({ sourceSessionId: "new", reductionSeconds: HOUR })],
    afterHistory: [session({ id: "new", durationSeconds: 2 * HOUR })],
    beforeHistory: [],
    categoryId: "cat-1",
    sourceSessionId: "new",
    targetSeconds: HOUR,
    todayDate: "2026-07-07",
  }), 0);
});

test("Prompted surplus is independent of total accumulated overage", () => {
  assert.equal(getPromptedDailySurplusSeconds({
    afterHistory: [session({ id: "before", durationSeconds: 6 * HOUR }), session({ id: "new", durationSeconds: HOUR })],
    beforeHistory: [session({ id: "before", durationSeconds: 6 * HOUR })],
    categoryId: "cat-1",
    sourceSessionId: "new",
    targetSeconds: HOUR,
    todayDate: "2026-07-07",
  }), HOUR);
});

test("Surplus does not auto-allocate", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "source", priorityLevel: 5 }),
      category({ id: "target", priorityLevel: 1, allowDailySurplusReduction: true }),
    ],
    history: [session({ categoryId: "source", durationSeconds: 2 * HOUR })],
    todayDate: "2026-07-07",
  });
  assert.equal(plan.summaries.find((summary) => summary.category.id === "target")?.adjustedTodayTargetSeconds, HOUR);
});

test("Daily reallocation reduces target category today target only", () => {
  const plan = buildFocusGoalPlan({
    adjustments: [{ id: "adjust-1", adjustmentDate: "2026-07-07", sourceCategoryId: "source", targetCategoryId: "coding", reductionSeconds: 2 * HOUR, sourceSessionId: null, createdAt: "2026-07-07T12:00:00.000Z" }],
    categories: [category({ id: "coding", weeklyGoalSeconds: 7 * HOUR })],
    history: [],
    todayDate: "2026-07-07",
  });
  const coding = plan.summaries[0];
  assert.equal(coding.baseTodayTargetSeconds, HOUR);
  assert.equal(coding.adjustedTodayTargetSeconds, 0);
  assert.equal(coding.baseWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(coding.adjustedWeeklyTargetSeconds, 7 * HOUR);
});

test("Daily reallocation does not reduce category weekly or productive total targets", () => {
  const plan = buildFocusGoalPlan({
    adjustments: [{ id: "adjust-1", adjustmentDate: "2026-07-07", sourceCategoryId: "source", targetCategoryId: "coding", reductionSeconds: 2 * HOUR, sourceSessionId: null, createdAt: "2026-07-07T12:00:00.000Z" }],
    categories: [category({ id: "coding", weeklyGoalSeconds: 7 * HOUR, weeklySurplusCarryoverMode: "off" })],
    history: [session({ categoryId: "coding", date: "2026-07-06", durationSeconds: 4 * HOUR })],
    todayDate: "2026-07-07",
  });
  const coding = plan.summaries[0];
  assert.equal(coding.incomingCarryoverCreditSeconds, 0);
  assert.equal(coding.adjustedWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(plan.productiveTodayTargetSeconds, HOUR);
  assert.equal(plan.productiveWeekTargetSeconds, 7 * HOUR);
});

test("Over-weekly category with base target today produces a reallocatable daily target pool", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ id: "coding", weeklyGoalSeconds: 7 * HOUR })],
    history: [session({ categoryId: "coding", date: "2026-07-06", durationSeconds: 7 * HOUR })],
    todayDate: "2026-07-07",
  });
  assert.equal(getOverWeeklyDailyTargetReallocationPool(plan.summaries[0]), HOUR);
});

test("Over-weekly category with no base target today produces no prompt pool", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({
      id: "coding",
      targetDistributionMode: "manual",
      weekdayTargetSeconds: { mon: 7 * HOUR },
      weeklyGoalSeconds: 7 * HOUR,
    })],
    history: [session({ categoryId: "coding", date: "2026-07-06", durationSeconds: 7 * HOUR })],
    todayDate: "2026-07-07",
  });
  assert.equal(plan.summaries[0].baseTodayTargetSeconds, 0);
  assert.equal(getOverWeeklyDailyTargetReallocationPool(plan.summaries[0]), 0);
});

test("Over-weekly category already fully reallocated today produces no duplicate prompt pool", () => {
  const plan = buildFocusGoalPlan({
    adjustments: [adjustment({
      adjustmentDate: "2026-07-07",
      sourceCategoryId: "coding",
      targetCategoryId: "chores",
      reductionSeconds: HOUR,
      reason: OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON,
    })],
    categories: [
      category({ id: "coding", weeklyGoalSeconds: 7 * HOUR }),
      category({ id: "chores", title: "Chores", weeklyGoalSeconds: 7 * HOUR }),
    ],
    history: [session({ categoryId: "coding", date: "2026-07-06", durationSeconds: 7 * HOUR })],
    todayDate: "2026-07-07",
  });
  const coding = plan.summaries.find((summary) => summary.category.id === "coding");
  assert.ok(coding);
  assert.equal(coding.todaySourceShiftedSeconds, HOUR);
  assert.equal(getOverWeeklyDailyTargetReallocationPool(coding), 0);
});

test("Reallocating today's base target from an over-weekly category reduces that category dynamic today target only", () => {
  const plan = buildFocusGoalPlan({
    adjustments: [adjustment({
      adjustmentDate: "2026-07-07",
      sourceCategoryId: "coding",
      targetCategoryId: "chores",
      reductionSeconds: HOUR,
      reason: OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON,
    })],
    categories: [
      category({ id: "coding", weeklyGoalSeconds: 7 * HOUR }),
      category({ id: "chores", title: "Chores", weeklyGoalSeconds: 7 * HOUR }),
    ],
    history: [session({ categoryId: "coding", date: "2026-07-06", durationSeconds: 7 * HOUR })],
    todayDate: "2026-07-07",
  });
  const coding = plan.summaries.find((summary) => summary.category.id === "coding");
  assert.ok(coding);
  assert.equal(coding.baseTodayTargetSeconds, HOUR);
  assert.equal(coding.adjustedTodayTargetSeconds, 0);
  assert.equal(coding.baseWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(coding.adjustedWeeklyTargetSeconds, 7 * HOUR);
});

test("Reallocating today's base target to another category increases that category dynamic today target only", () => {
  const plan = buildFocusGoalPlan({
    adjustments: [adjustment({
      adjustmentDate: "2026-07-07",
      sourceCategoryId: "coding",
      targetCategoryId: "chores",
      reductionSeconds: HOUR,
      reason: OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON,
    })],
    categories: [
      category({ id: "coding", weeklyGoalSeconds: 7 * HOUR }),
      category({ id: "chores", title: "Chores", weeklyGoalSeconds: 7 * HOUR }),
    ],
    history: [session({ categoryId: "coding", date: "2026-07-06", durationSeconds: 7 * HOUR })],
    todayDate: "2026-07-07",
  });
  const chores = plan.summaries.find((summary) => summary.category.id === "chores");
  assert.ok(chores);
  assert.equal(chores.baseTodayTargetSeconds, HOUR);
  assert.equal(chores.adjustedTodayTargetSeconds, 2 * HOUR);
  assert.equal(chores.todayReceivedShiftSeconds, HOUR);
  assert.equal(chores.baseWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(chores.adjustedWeeklyTargetSeconds, 7 * HOUR);
});

test("Total daily productive goal remains base total after over-weekly reallocation", () => {
  const plan = buildFocusGoalPlan({
    adjustments: [adjustment({
      adjustmentDate: "2026-07-07",
      sourceCategoryId: "coding",
      targetCategoryId: "chores",
      reductionSeconds: HOUR,
      reason: OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON,
    })],
    categories: [
      category({ id: "coding", weeklyGoalSeconds: 7 * HOUR }),
      category({ id: "chores", title: "Chores", weeklyGoalSeconds: 7 * HOUR }),
    ],
    history: [session({ categoryId: "coding", date: "2026-07-06", durationSeconds: 7 * HOUR })],
    todayDate: "2026-07-07",
  });
  assert.equal(plan.productiveTodayBaseTargetSeconds, 2 * HOUR);
  assert.equal(plan.productiveTodayTargetSeconds, 2 * HOUR);
});

test("Weekly targets remain unchanged after over-weekly reallocation", () => {
  const plan = buildFocusGoalPlan({
    adjustments: [adjustment({
      adjustmentDate: "2026-07-07",
      sourceCategoryId: "coding",
      targetCategoryId: "chores",
      reductionSeconds: HOUR,
      reason: OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON,
    })],
    categories: [
      category({ id: "coding", weeklyGoalSeconds: 7 * HOUR }),
      category({ id: "chores", title: "Chores", weeklyGoalSeconds: 7 * HOUR }),
    ],
    history: [session({ categoryId: "coding", date: "2026-07-06", durationSeconds: 7 * HOUR })],
    todayDate: "2026-07-07",
  });
  assert.equal(plan.productiveWeekBaseTargetSeconds, 14 * HOUR);
  assert.equal(plan.productiveWeekTargetSeconds, 14 * HOUR);
  assert.deepEqual(plan.summaries.map((summary) => summary.adjustedWeeklyTargetSeconds), [7 * HOUR, 7 * HOUR]);
});

test("Existing session-surplus delta reallocation behavior still reduces selected targets", () => {
  const plan = buildFocusGoalPlan({
    adjustments: [adjustment({
      adjustmentDate: "2026-07-07",
      sourceCategoryId: "coding",
      targetCategoryId: "chores",
      reductionSeconds: HOUR,
      reason: "daily_surplus_reallocation",
    })],
    categories: [
      category({ id: "coding", weeklyGoalSeconds: 7 * HOUR }),
      category({ id: "chores", title: "Chores", weeklyGoalSeconds: 7 * HOUR }),
    ],
    history: [session({ categoryId: "coding", durationSeconds: 2 * HOUR })],
    todayDate: "2026-07-07",
  });
  const coding = plan.summaries.find((summary) => summary.category.id === "coding");
  const chores = plan.summaries.find((summary) => summary.category.id === "chores");
  assert.ok(coding);
  assert.ok(chores);
  assert.equal(coding.adjustedTodayTargetSeconds, HOUR);
  assert.equal(chores.adjustedTodayTargetSeconds, 0);
});

test("Multiple daily adjustments reduce only their target categories today", () => {
  const plan = buildFocusGoalPlan({
    adjustments: [
      { id: "adjust-1", adjustmentDate: "2026-07-07", sourceCategoryId: "source", targetCategoryId: "personal", reductionSeconds: 30 * 60, sourceSessionId: null, createdAt: "2026-07-07T12:00:00.000Z" },
      { id: "adjust-2", adjustmentDate: "2026-07-07", sourceCategoryId: "source", targetCategoryId: "creative", reductionSeconds: 20 * 60, sourceSessionId: null, createdAt: "2026-07-07T12:00:00.000Z" },
      { id: "adjust-3", adjustmentDate: "2026-07-07", sourceCategoryId: "source", targetCategoryId: "cooking", reductionSeconds: 70 * 60, sourceSessionId: null, createdAt: "2026-07-07T12:00:00.000Z" },
    ],
    categories: [
      category({ id: "coding", weeklyGoalSeconds: 7 * HOUR }),
      category({ id: "personal", weeklyGoalSeconds: 7 * HOUR }),
      category({ id: "creative", weeklyGoalSeconds: 7 * HOUR }),
      category({ id: "cooking", weeklyGoalSeconds: 14 * HOUR }),
    ],
    history: [session({ categoryId: "coding", durationSeconds: 3 * HOUR })],
    todayDate: "2026-07-07",
  });
  const personal = plan.summaries.find((summary) => summary.category.id === "personal");
  const creative = plan.summaries.find((summary) => summary.category.id === "creative");
  const cooking = plan.summaries.find((summary) => summary.category.id === "cooking");
  assert.equal(personal?.adjustedTodayTargetSeconds, 30 * 60);
  assert.equal(creative?.adjustedTodayTargetSeconds, 40 * 60);
  assert.equal(cooking?.adjustedTodayTargetSeconds, 50 * 60);
  assert.equal(personal?.adjustedWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(cooking?.adjustedWeeklyTargetSeconds, 14 * HOUR);
  assert.equal(plan.productiveTodayTargetSeconds, 5 * HOUR);
  assert.equal(plan.productiveTodayReallocatedSeconds, 2 * HOUR);
  assert.equal(plan.productiveWeekTargetSeconds, 35 * HOUR);
});

test("Allocation summary reports allocated remaining and overallocated seconds", () => {
  assert.deepEqual(getAllocationSummary({ personal: 30 * 60, creative: 20 * 60, cooking: 70 * 60 }, 2 * HOUR), {
    allocatedSeconds: 2 * HOUR,
    remainingSeconds: 0,
    overallocatedSeconds: 0,
  });
  assert.deepEqual(getAllocationSummary({ personal: 30 * 60 }, 2 * HOUR), {
    allocatedSeconds: 30 * 60,
    remainingSeconds: 90 * 60,
    overallocatedSeconds: 0,
  });
  assert.deepEqual(getAllocationSummary({ personal: 3 * HOUR }, 2 * HOUR), {
    allocatedSeconds: 3 * HOUR,
    remainingSeconds: 0,
    overallocatedSeconds: HOUR,
  });
});

test("Eligible surplus targets are lower-priority flexible productive non-Sleep categories", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "source", priorityLevel: 5 }),
      category({ id: "target", priorityLevel: 2, allowDailySurplusReduction: true }),
      category({ id: "sleep", title: "Sleep", focusType: "Sleep", priorityLevel: 1, allowDailySurplusReduction: true }),
      category({ id: "higher", priorityLevel: 5, allowDailySurplusReduction: true }),
    ],
    history: [session({ categoryId: "source", durationSeconds: 2 * HOUR })],
    todayDate: "2026-07-07",
  });
  const source = plan.summaries.find((summary) => summary.category.id === "source");
  assert.ok(source);
  assert.deepEqual(getEligibleSurplusTargets(source, plan.summaries).map((summary) => summary.category.id), ["target"]);
});

test("Lower-priority flexible category already over today is not eligible for surplus reduction", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "source", priorityLevel: 5 }),
      category({ id: "target", priorityLevel: 2, allowDailySurplusReduction: true }),
    ],
    history: [
      session({ categoryId: "source", durationSeconds: 2 * HOUR }),
      session({ categoryId: "target", durationSeconds: 2 * HOUR }),
    ],
    todayDate: "2026-07-07",
  });
  const source = plan.summaries.find((summary) => summary.category.id === "source");
  assert.ok(source);
  assert.deepEqual(getEligibleSurplusTargets(source, plan.summaries).map((summary) => summary.category.id), []);
});

test("Multiple lower-priority flexible categories with remaining time are eligible for surplus reduction", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "source", priorityLevel: 5 }),
      category({ id: "chores", priorityLevel: 2, allowDailySurplusReduction: true }),
      category({ id: "practice", priorityLevel: 1, allowDailySurplusReduction: true }),
    ],
    history: [session({ categoryId: "source", durationSeconds: 2 * HOUR })],
    todayDate: "2026-07-07",
  });
  const source = plan.summaries.find((summary) => summary.category.id === "source");
  assert.ok(source);
  assert.deepEqual(getEligibleSurplusTargets(source, plan.summaries).map((summary) => summary.category.id), ["practice", "chores"]);
});

test("Surplus override targets include non-suggested productive categories", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "source", priorityLevel: 3 }),
      category({ id: "higher", priorityLevel: 5, allowDailySurplusReduction: true }),
      category({ id: "protected", priorityLevel: 1, allowDailySurplusReduction: false }),
      category({ id: "suggested", priorityLevel: 1, allowDailySurplusReduction: true }),
    ],
    history: [session({ categoryId: "source", durationSeconds: 2 * HOUR })],
    todayDate: "2026-07-07",
  });
  const source = plan.summaries.find((summary) => summary.category.id === "source");
  assert.ok(source);
  assert.deepEqual(getEligibleSurplusTargets(source, plan.summaries).map((summary) => summary.category.id), ["suggested"]);
  assert.deepEqual(getSurplusOverrideTargets(source, plan.summaries).map((target) => target.summary.category.id), ["protected", "suggested", "higher"]);
});

test("No suggested surplus targets can still produce override choices", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "source", priorityLevel: 5 }),
      category({ id: "same", priorityLevel: 5, allowDailySurplusReduction: true }),
      category({ id: "protected", priorityLevel: 2, allowDailySurplusReduction: false }),
    ],
    history: [session({ categoryId: "source", durationSeconds: 2 * HOUR })],
    todayDate: "2026-07-07",
  });
  const source = plan.summaries.find((summary) => summary.category.id === "source");
  assert.ok(source);
  assert.deepEqual(getEligibleSurplusTargets(source, plan.summaries).map((summary) => summary.category.id), []);
  assert.deepEqual(getSurplusOverrideTargets(source, plan.summaries).map((target) => target.summary.category.id), ["protected", "same"]);
});

test("Sleep stays excluded from productive surplus override choices by default", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "source", priorityLevel: 5 }),
      category({ id: "sleep", title: "Sleep", focusType: "Sleep", priorityLevel: 1, allowDailySurplusReduction: true, countTowardProductiveGoal: true }),
      category({ id: "chores", title: "Chores", priorityLevel: 1, allowDailySurplusReduction: true }),
    ],
    history: [session({ categoryId: "source", durationSeconds: 2 * HOUR })],
    todayDate: "2026-07-07",
  });
  const source = plan.summaries.find((summary) => summary.category.id === "source");
  assert.ok(source);
  assert.deepEqual(getSurplusOverrideTargets(source, plan.summaries).map((target) => target.summary.category.id), ["chores"]);
});

test("No eligible target creates today-over-capacity state", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ id: "source", priorityLevel: 1 })],
    history: [session({ categoryId: "source", durationSeconds: 2 * HOUR })],
    todayDate: "2026-07-07",
  });
  assert.equal(plan.todayOverCapacitySeconds, HOUR);
});

test("No eligible lower-priority flexible categories with remaining time produces today-over-capacity state", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "source", priorityLevel: 5 }),
      category({ id: "done", priorityLevel: 1, allowDailySurplusReduction: true }),
    ],
    history: [
      session({ categoryId: "source", durationSeconds: 2 * HOUR }),
      session({ categoryId: "done", durationSeconds: HOUR }),
    ],
    todayDate: "2026-07-07",
  });
  const source = plan.summaries.find((summary) => summary.category.id === "source");
  assert.ok(source?.warnings.includes("today-over-capacity"));
  assert.equal(plan.todayOverCapacitySeconds, HOUR);
});

test("Weekly carryover off cap25 cap50 and full work", () => {
  const base = category({ weeklyGoalSeconds: 10 * HOUR });
  assert.equal(getIncomingCarryoverCreditSeconds({ ...base, weeklySurplusCarryoverMode: "off" }, 12 * HOUR), 0);
  assert.equal(getIncomingCarryoverCreditSeconds({ ...base, weeklySurplusCarryoverMode: "cap25" }, 14 * HOUR), Math.round(2.5 * HOUR));
  assert.equal(getIncomingCarryoverCreditSeconds({ ...base, weeklySurplusCarryoverMode: "cap50" }, 16 * HOUR), 5 * HOUR);
  assert.equal(getIncomingCarryoverCreditSeconds({ ...base, weeklySurplusCarryoverMode: "full" }, 16 * HOUR), 6 * HOUR);
});

test("Previous completed week surplus becomes incoming credit without reducing base weekly target", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ weeklyGoalSeconds: 10 * HOUR, weeklySurplusCarryoverMode: "cap50" })],
    history: [session({ date: "2026-07-01", durationSeconds: 13 * HOUR })],
    todayDate: "2026-07-07",
  });
  assert.equal(plan.summaries[0].baseWeeklyTargetSeconds, 10 * HOUR);
  assert.equal(plan.summaries[0].incomingCarryoverCreditSeconds, 3 * HOUR);
  assert.equal(plan.summaries[0].adjustedWeeklyTargetSeconds, 10 * HOUR);
});

test("Weekly carryover records incoming credit while preserving current weekly target", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ id: "coding", weeklyGoalSeconds: 7 * HOUR, weeklySurplusCarryoverMode: "full" })],
    history: [session({ categoryId: "coding", date: "2026-07-01", durationSeconds: 8 * HOUR + 45 * 60 })],
    todayDate: "2026-07-07",
  });
  const coding = plan.summaries[0];
  assert.equal(coding.baseWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(coding.incomingCarryoverCreditSeconds, HOUR + 45 * 60);
  assert.equal(coding.adjustedWeeklyTargetSeconds, 7 * HOUR);
});

test("Current-week surplus does not reduce current-week adjusted target", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ id: "coding", weeklyGoalSeconds: 7 * HOUR, weeklySurplusCarryoverMode: "full" })],
    history: [session({ categoryId: "coding", date: "2026-07-07", durationSeconds: 7 * HOUR + 33 * 60 })],
    todayDate: "2026-07-07",
  });
  const coding = plan.summaries[0];
  assert.equal(coding.baseWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(coding.incomingCarryoverCreditSeconds, 0);
  assert.equal(coding.adjustedWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(coding.weekActualSeconds, 7 * HOUR + 33 * 60);
});

test("Previous-week carryover is the only incoming credit source for current week", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ id: "coding", weeklyGoalSeconds: 7 * HOUR, weeklySurplusCarryoverMode: "full" })],
    history: [session({ categoryId: "coding", date: "2026-07-01", durationSeconds: 8 * HOUR + 45 * 60 })],
    todayDate: "2026-07-07",
  });
  const coding = plan.summaries[0];
  assert.equal(coding.incomingCarryoverCreditSeconds, HOUR + 45 * 60);
  assert.equal(coding.adjustedWeeklyTargetSeconds, 7 * HOUR);
});

test("Current-week surplus produces next-week credit preview only", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ id: "coding", weeklyGoalSeconds: 7 * HOUR, weeklySurplusCarryoverMode: "full" })],
    history: [session({ categoryId: "coding", date: "2026-07-07", durationSeconds: 7 * HOUR + 33 * 60 })],
    todayDate: "2026-07-07",
  });
  const coding = plan.summaries[0];
  assert.equal(coding.incomingCarryoverCreditSeconds, 0);
  assert.equal(coding.adjustedWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(coding.outgoingCarryoverCreditSeconds, 33 * 60);
});

test("UI row model exposes base incoming carryover and next-week preview separately", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ id: "coding", weeklyGoalSeconds: 7 * HOUR, weeklySurplusCarryoverMode: "full" })],
    history: [
      session({ categoryId: "coding", date: "2026-07-01", durationSeconds: 8 * HOUR + 45 * 60 }),
      session({ categoryId: "coding", date: "2026-07-07", durationSeconds: 6 * HOUR }),
    ],
    todayDate: "2026-07-07",
  });
  const coding = plan.summaries[0];
  assert.equal(coding.baseWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(coding.incomingCarryoverCreditSeconds, HOUR + 45 * 60);
  assert.equal(coding.adjustedWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(coding.outgoingCarryoverCreditSeconds, 45 * 60);
  assert.equal(plan.productiveWeekBaseTargetSeconds, 7 * HOUR);
  assert.equal(plan.productiveWeekTargetSeconds, 7 * HOUR);
});

test("Weekly bar row model includes daily actuals and adjusted daily targets", () => {
  const plan = buildFocusGoalPlan({
    adjustments: [{ id: "adjust-1", adjustmentDate: "2026-07-08", sourceCategoryId: "source", targetCategoryId: "coding", reductionSeconds: 30 * 60, sourceSessionId: null, createdAt: "2026-07-08T12:00:00.000Z" }],
    categories: [category({ id: "coding", weeklyGoalSeconds: 7 * HOUR })],
    history: [
      session({ categoryId: "coding", date: "2026-07-07", durationSeconds: 2 * HOUR }),
      session({ categoryId: "coding", date: "2026-07-08", durationSeconds: 15 * 60 }),
    ],
    todayDate: "2026-07-08",
  });
  const coding = plan.summaries[0];
  assert.equal(coding.dailySummaries.length, 7);
  assert.deepEqual(coding.dailySummaries.map((day) => day.weekdayKey), ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  assert.equal(coding.dailySummaries[1].actualSeconds, 2 * HOUR);
  assert.equal(coding.dailySummaries[2].baseTargetSeconds, HOUR);
  assert.equal(coding.dailySummaries[2].adjustedTargetSeconds, 30 * 60);
});

test("No carryover means weekly target remains base weekly target", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ id: "coding", weeklyGoalSeconds: 7 * HOUR, weeklySurplusCarryoverMode: "off" })],
    history: [session({ categoryId: "coding", date: "2026-07-01", durationSeconds: 9 * HOUR })],
    todayDate: "2026-07-07",
  });
  const coding = plan.summaries[0];
  assert.equal(coding.incomingCarryoverCreditSeconds, 0);
  assert.equal(coding.baseWeeklyTargetSeconds, 7 * HOUR);
  assert.equal(coding.adjustedWeeklyTargetSeconds, 7 * HOUR);
});

test("Suggested surplus targets sort ahead categories before least-behind categories", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "source", priorityLevel: 5 }),
      category({ id: "ahead", priorityLevel: 1, allowDailySurplusReduction: true }),
      category({ id: "slightly-behind", priorityLevel: 1, allowDailySurplusReduction: true }),
      category({ id: "more-behind", priorityLevel: 1, allowDailySurplusReduction: true }),
    ],
    history: [
      session({ categoryId: "source", durationSeconds: 2 * HOUR }),
      session({ categoryId: "ahead", date: "2026-07-07", durationSeconds: 5 * HOUR }),
      session({ categoryId: "slightly-behind", date: "2026-07-07", durationSeconds: 4 * HOUR + 30 * 60 }),
    ],
    todayDate: "2026-07-10",
  });
  const source = plan.summaries.find((summary) => summary.category.id === "source");
  assert.ok(source);
  assert.deepEqual(
    getEligibleSurplusTargets(source, plan.summaries).map((summary) => summary.category.id),
    ["ahead", "slightly-behind", "more-behind"],
  );
});

test("Low-priority over-target while higher-priority behind creates priority drift warning", () => {
  const plan = buildFocusGoalPlan({
    categories: [
      category({ id: "low", priorityLevel: 1 }),
      category({ id: "high", priorityLevel: 5 }),
    ],
    history: [session({ categoryId: "low", durationSeconds: 2 * HOUR })],
    todayDate: "2026-07-07",
  });
  assert.ok(plan.summaries.find((summary) => summary.category.id === "low")?.warnings.includes("priority-drift"));
});

test("Session assigned to Tuesday counts in Tuesday Focus Goals even when completion is after midnight", () => {
  const plan = buildFocusGoalPlan({
    categories: [category({ id: "personal", title: "Personal", weeklyGoalSeconds: 7 * HOUR })],
    history: [session({ categoryId: "personal", date: "2026-07-07", endedAt: "2026-07-08T05:00:00.000Z", durationSeconds: 10 * 60 })],
    todayDate: "2026-07-07",
  });
  const personal = plan.summaries[0];
  assert.equal(personal.todayActualSeconds, 10 * 60);
  assert.equal(personal.dailySummaries[1].actualSeconds, 10 * 60);
  assert.equal(plan.productiveTodaySeconds, 10 * 60);
  assert.equal(detectDailySurplus(personal), 0);
});

import type { FocusCategory, FocusDailyGoalAdjustment, HistoricalFocusSession } from "@/lib/types";
import { getLogicalDayKey } from "@/lib/logical-day";

export type FocusGoalPriority = 1 | 2 | 3 | 4 | 5;
export type FocusGoalDistributionMode = "auto" | "manual";
export type FocusWeeklyCarryoverMode = "off" | "cap25" | "cap50" | "full";
export type FocusGoalWarning =
  | "approaching-daily-target"
  | "over-daily-target"
  | "over-weekly-target"
  | "priority-drift"
  | "today-over-capacity"
  | "weekly-carryover-active";

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type FocusWeekdayKey = typeof WEEKDAY_KEYS[number];

export type FocusGoalDaySummary = {
  date: string;
  weekdayKey: FocusWeekdayKey;
  baseTargetSeconds: number;
  adjustmentSeconds: number;
  adjustedTargetSeconds: number;
  actualSeconds: number;
};

export type FocusGoalCategorySummary = {
  category: FocusCategory;
  priorityLevel: FocusGoalPriority;
  countsTowardProductiveGoal: boolean;
  allowDailySurplusReduction: boolean;
  baseWeeklyTargetSeconds: number;
  incomingCarryoverCreditSeconds: number;
  adjustedWeeklyTargetSeconds: number;
  outgoingCarryoverCreditSeconds: number;
  baseTodayTargetSeconds: number;
  dailyAdjustmentSeconds: number;
  todaySourceShiftedSeconds: number;
  todayReceivedShiftSeconds: number;
  adjustedTodayTargetSeconds: number;
  todayActualSeconds: number;
  weekActualSeconds: number;
  todayDeltaSeconds: number;
  weekDeltaSeconds: number;
  catchUpPaceSeconds: number;
  weeklyPaceBehindSeconds: number;
  dailySummaries: FocusGoalDaySummary[];
  warnings: FocusGoalWarning[];
};

export type FocusGoalPlan = {
  weekStartDate: string;
  weekEndDate: string;
  todayDate: string;
  summaries: FocusGoalCategorySummary[];
  productiveTodaySeconds: number;
  productiveTodayExcludedSleepSeconds: number;
  productiveTodayExcludedUnproductiveSeconds: number;
  productiveTodayCategoryCount: number;
  productiveTodayBaseTargetSeconds: number;
  productiveTodayTargetSeconds: number;
  productiveWeekSeconds: number;
  productiveWeekBaseTargetSeconds: number;
  productiveWeekTargetSeconds: number;
  productiveTodayReallocatedSeconds: number;
  productiveNextWeekCreditPreviewSeconds: number;
  recommendedCategoryId: string | null;
  recommendationReason: string;
  todayOverCapacitySeconds: number;
};

export type FocusGoalSurplusOverrideTarget = {
  summary: FocusGoalCategorySummary;
  warningLabel: string | null;
  maxReductionSeconds: number;
};

export type FocusGoalAllocationDraft = Record<string, number>;

export const OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON = "over_weekly_daily_target_reallocation";

export function normalizePriorityLevel(value: unknown): FocusGoalPriority {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (parsed >= 5) return 5;
  if (parsed <= 1) return 1;
  if (parsed === 2 || parsed === 3 || parsed === 4) return parsed;
  return 3;
}

export function formatPriorityLabel(priority: unknown) {
  const normalized = normalizePriorityLevel(priority);
  if (normalized === 5) return "Priority 5 — Highest";
  if (normalized === 1) return "Priority 1 — Lowest";
  return `Priority ${normalized}`;
}

export function normalizeDistributionMode(value: unknown): FocusGoalDistributionMode {
  return value === "manual" ? "manual" : "auto";
}

export function normalizeCarryoverMode(value: unknown): FocusWeeklyCarryoverMode {
  return value === "cap25" || value === "cap50" || value === "full" ? value : "off";
}

export function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, (month || 1) - 1, day || 1);
}

export function getMondayWeekRange(dateKey: string) {
  const date = parseLocalDateKey(dateKey);
  const dayIndex = date.getDay();
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  const start = new Date(date);
  start.setDate(date.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    startDate: getLocalDateKey(start),
    endDate: getLocalDateKey(end),
  };
}

export function getWeekdayKey(dateKey: string): FocusWeekdayKey {
  const dayIndex = parseLocalDateKey(dateKey).getDay();
  return WEEKDAY_KEYS[dayIndex === 0 ? 6 : dayIndex - 1];
}

function addDays(dateKey: string, days: number) {
  const date = parseLocalDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return getLocalDateKey(date);
}

export function getRemainingActiveDays(todayDate: string, weekdayTargets: Record<string, number>, mode: FocusGoalDistributionMode) {
  const todayIndex = WEEKDAY_KEYS.indexOf(getWeekdayKey(todayDate));
  if (todayIndex < 0) return 1;
  if (mode === "manual") {
    const activeManualDays = WEEKDAY_KEYS.slice(todayIndex).filter((key) => (weekdayTargets[key] ?? 0) > 0).length;
    return Math.max(1, activeManualDays);
  }
  return Math.max(1, 7 - todayIndex);
}

function normalizedTitle(category: Pick<FocusCategory, "title">) {
  return category.title.trim().toLowerCase();
}

function normalizeProductiveToken(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

export function isSleepCategory(category: Pick<FocusCategory, "title" | "focusType" | "focusSubtype" | "focusSubtype2">) {
  const parts = [category.title, category.focusType, category.focusSubtype, category.focusSubtype2]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\bsleep\b/.test(parts);
}

export function resolveCountsTowardProductiveGoal(category: FocusCategory) {
  if (isSleepCategory(category)) return false;
  if (typeof category.countTowardProductiveGoal === "boolean") return category.countTowardProductiveGoal;
  const type = normalizeProductiveToken(category.focusType);
  const subtype = normalizeProductiveToken(category.focusSubtype);
  const subtype2 = normalizeProductiveToken(category.focusSubtype2);
  const title = normalizeProductiveToken(category.title);
  const tokens = [type, subtype, subtype2, title].filter(Boolean);
  if (tokens.includes("unproductive") || tokens.includes("non productive") || tokens.includes("nonproductive")) return false;
  if (type === "work") return true;
  if ((type === "personal" || type === "creative") && (subtype === "productive" || subtype2 === "productive")) return true;
  if (tokens.includes("productive")) return true;
  if (["coding", "writing", "study", "studying", "learning", "exercise", "workout", "practice"].some((word) => title.includes(word))) return true;
  return false;
}

export function resolveAllowDailySurplusReduction(category: FocusCategory) {
  if (typeof category.allowDailySurplusReduction === "boolean") return category.allowDailySurplusReduction;
  const title = normalizedTitle(category);
  return title.includes("cooking") || title.includes("chores") || title.includes("coding");
}

export function getBaseWeeklyTargetSeconds(category: FocusCategory) {
  return Math.max(0, Math.floor(category.weeklyGoalSeconds ?? 0));
}

export function getBaseTodayTargetSeconds(category: FocusCategory, dateKey: string) {
  const weeklyTarget = getBaseWeeklyTargetSeconds(category);
  if (normalizeDistributionMode(category.targetDistributionMode) === "manual") {
    return Math.max(0, Math.floor(category.weekdayTargetSeconds?.[getWeekdayKey(dateKey)] ?? 0));
  }
  return Math.round(weeklyTarget / 7);
}

export function getDailyAdjustmentSeconds(categoryId: string, dateKey: string, adjustments: FocusDailyGoalAdjustment[]) {
  return adjustments.reduce((total, adjustment) => {
    if (adjustment.adjustmentDate !== dateKey) return total;
    if (adjustment.reason === OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON) {
      if (adjustment.sourceCategoryId === categoryId) return total - adjustment.reductionSeconds;
      if (adjustment.targetCategoryId === categoryId) return total + adjustment.reductionSeconds;
      return total;
    }
    if (adjustment.targetCategoryId === categoryId) return total - adjustment.reductionSeconds;
    return total;
  }, 0);
}

export function getOverWeeklyDailyTargetShiftSeconds(categoryId: string, dateKey: string, adjustments: FocusDailyGoalAdjustment[]) {
  return adjustments.reduce((total, adjustment) => {
    if (adjustment.adjustmentDate !== dateKey) return total;
    if (adjustment.reason !== OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON) return total;
    if (adjustment.sourceCategoryId !== categoryId) return total;
    return total + Math.max(0, adjustment.reductionSeconds);
  }, 0);
}

export function getOverWeeklyDailyTargetReceivedSeconds(categoryId: string, dateKey: string, adjustments: FocusDailyGoalAdjustment[]) {
  return adjustments.reduce((total, adjustment) => {
    if (adjustment.adjustmentDate !== dateKey) return total;
    if (adjustment.reason !== OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON) return total;
    if (adjustment.targetCategoryId !== categoryId) return total;
    return total + Math.max(0, adjustment.reductionSeconds);
  }, 0);
}

export function getOverWeeklyDailyTargetReallocationPool(summary: Pick<FocusGoalCategorySummary, "baseTodayTargetSeconds" | "baseWeeklyTargetSeconds" | "weekActualSeconds" | "todaySourceShiftedSeconds">) {
  if (summary.baseWeeklyTargetSeconds <= 0) return 0;
  if (summary.weekActualSeconds < summary.baseWeeklyTargetSeconds) return 0;
  if (summary.baseTodayTargetSeconds <= 0) return 0;
  return Math.max(0, summary.baseTodayTargetSeconds - summary.todaySourceShiftedSeconds);
}

export function sumDailyAdjustmentReductions(dateKey: string, adjustments: FocusDailyGoalAdjustment[], categoryIds: Set<string>) {
  return adjustments.reduce((total, adjustment) => {
    if (adjustment.adjustmentDate !== dateKey || !categoryIds.has(adjustment.targetCategoryId)) return total;
    return total + Math.max(0, adjustment.reductionSeconds);
  }, 0);
}

export function getAllocationSummary(allocations: FocusGoalAllocationDraft, surplusSeconds: number) {
  const allocatedSeconds = Object.values(allocations).reduce((total, seconds) => total + Math.max(0, Math.floor(seconds || 0)), 0);
  return {
    allocatedSeconds,
    remainingSeconds: Math.max(0, surplusSeconds - allocatedSeconds),
    overallocatedSeconds: Math.max(0, allocatedSeconds - surplusSeconds),
  };
}

export function sumActualByCategory(
  history: HistoricalFocusSession[],
  startDate: string,
  endDate: string,
) {
  const totals = new Map<string, number>();
  for (const entry of history) {
    if (!entry.categoryId || entry.date < startDate || entry.date > endDate) continue;
    totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + Math.max(0, entry.durationSeconds));
  }
  return totals;
}

export function getIncomingCarryoverCreditSeconds(
  category: FocusCategory,
  previousWeekActualSeconds: number,
  previousIncomingCreditSeconds = 0,
) {
  const mode = normalizeCarryoverMode(category.weeklySurplusCarryoverMode);
  if (mode === "off") return 0;
  const baseWeeklyTarget = getBaseWeeklyTargetSeconds(category);
  const previousAdjustedTarget = Math.max(0, baseWeeklyTarget - Math.max(0, previousIncomingCreditSeconds));
  const outgoingSurplus = Math.max(0, previousWeekActualSeconds - previousAdjustedTarget);
  if (mode === "cap25") return Math.min(outgoingSurplus, Math.round(baseWeeklyTarget * 0.25));
  if (mode === "cap50") return Math.min(outgoingSurplus, Math.round(baseWeeklyTarget * 0.5));
  return outgoingSurplus;
}

export function getOutgoingCarryoverCreditSeconds(category: FocusCategory, currentWeekActualSeconds: number, incomingCreditSeconds = 0) {
  return getIncomingCarryoverCreditSeconds(category, currentWeekActualSeconds, incomingCreditSeconds);
}

export function getWeeklyPaceBehindSeconds(input: {
  dailySummaries: FocusGoalDaySummary[];
  todayDate: string;
  weekActualSeconds: number;
}) {
  const todayDate = input.todayDate;
  const elapsedTargetSeconds = input.dailySummaries.reduce((total, day) => {
    if (todayDate && day.date > todayDate) return total;
    return total + day.adjustedTargetSeconds;
  }, 0);
  return Math.max(0, elapsedTargetSeconds - input.weekActualSeconds);
}

export function detectDailySurplus(summary: Pick<FocusGoalCategorySummary, "todayActualSeconds" | "adjustedTodayTargetSeconds">) {
  return Math.max(0, summary.todayActualSeconds - summary.adjustedTodayTargetSeconds);
}

export function resolveFocusGoalSessionDateKey(session: Pick<HistoricalFocusSession, "date" | "endedAt">) {
  return session.date;
}

export function getPromptedDailySurplusSeconds(input: {
  adjustments?: FocusDailyGoalAdjustment[];
  afterHistory: HistoricalFocusSession[];
  beforeHistory: HistoricalFocusSession[];
  categoryId: string;
  sourceSessionId?: string | null;
  targetSeconds: number;
  todayDate: string;
}) {
  const beforeActual = sumActualByCategory(input.beforeHistory, input.todayDate, input.todayDate).get(input.categoryId) ?? 0;
  const afterActual = sumActualByCategory(input.afterHistory, input.todayDate, input.todayDate).get(input.categoryId) ?? 0;
  const targetSeconds = Math.max(0, input.targetSeconds);
  const previousSurplus = Math.max(0, beforeActual - targetSeconds);
  const nextSurplus = Math.max(0, afterActual - targetSeconds);
  const existingPromptedSeconds = (input.adjustments ?? []).reduce((total, adjustment) => {
    if (adjustment.adjustmentDate !== input.todayDate) return total;
    if (adjustment.sourceCategoryId !== input.categoryId) return total;
    if (input.sourceSessionId && adjustment.sourceSessionId !== input.sourceSessionId) return total;
    return total + Math.max(0, adjustment.reductionSeconds);
  }, 0);
  const unaccountedExistingPromptSeconds = Math.max(0, existingPromptedSeconds - previousSurplus);
  return Math.max(0, nextSurplus - previousSurplus - unaccountedExistingPromptSeconds);
}

export function getEligibleSurplusTargets(source: FocusGoalCategorySummary, summaries: FocusGoalCategorySummary[]) {
  return summaries
    .filter((summary) =>
      summary.category.id !== source.category.id &&
      summary.priorityLevel < source.priorityLevel &&
      summary.allowDailySurplusReduction &&
      summary.countsTowardProductiveGoal &&
      !isSleepCategory(summary.category) &&
      summary.adjustedTodayTargetSeconds > 0 &&
      summary.todayActualSeconds < summary.adjustedTodayTargetSeconds
    )
    .sort(compareSurplusReductionTargets);
}

export function getSurplusOverrideTargets(source: FocusGoalCategorySummary, summaries: FocusGoalCategorySummary[]) {
  return summaries
    .filter((summary) =>
      summary.category.id !== source.category.id &&
      summary.countsTowardProductiveGoal &&
      !isSleepCategory(summary.category)
    )
    .sort(compareSurplusReductionTargets)
    .map((summary): FocusGoalSurplusOverrideTarget => {
      const remainingSeconds = Math.max(0, summary.adjustedTodayTargetSeconds - summary.todayActualSeconds);
      const warningLabel = remainingSeconds <= 0
        ? summary.adjustedTodayTargetSeconds <= 0
          ? "No remaining target"
          : "Already over today"
        : summary.priorityLevel >= source.priorityLevel
          ? "Same/higher priority"
          : !summary.allowDailySurplusReduction
            ? "Protected"
            : null;

      return {
        summary,
        warningLabel,
        maxReductionSeconds: remainingSeconds > 0 ? remainingSeconds : Math.max(0, summary.adjustedTodayTargetSeconds),
      };
    });
}

export function compareSurplusReductionTargets(a: FocusGoalCategorySummary, b: FocusGoalCategorySummary) {
  if (a.weeklyPaceBehindSeconds !== b.weeklyPaceBehindSeconds) {
    return a.weeklyPaceBehindSeconds - b.weeklyPaceBehindSeconds;
  }
  if (a.priorityLevel !== b.priorityLevel) return a.priorityLevel - b.priorityLevel;
  const aRemainingToday = Math.max(0, a.adjustedTodayTargetSeconds - a.todayActualSeconds);
  const bRemainingToday = Math.max(0, b.adjustedTodayTargetSeconds - b.todayActualSeconds);
  if (aRemainingToday !== bRemainingToday) return bRemainingToday - aRemainingToday;
  return a.category.title.localeCompare(b.category.title, undefined, { sensitivity: "base" });
}

export function buildFocusGoalPlan(input: {
  categories: FocusCategory[];
  history: HistoricalFocusSession[];
  adjustments?: FocusDailyGoalAdjustment[];
  todayDate?: string;
}) {
  const todayDate = input.todayDate ?? getLogicalDayKey();
  const weekRange = getMondayWeekRange(todayDate);
  const previousWeekEnd = new Date(parseLocalDateKey(weekRange.startDate));
  previousWeekEnd.setDate(previousWeekEnd.getDate() - 1);
  const previousWeekRange = getMondayWeekRange(getLocalDateKey(previousWeekEnd));
  const todayTotals = sumActualByCategory(input.history, todayDate, todayDate);
  const weekTotals = sumActualByCategory(input.history, weekRange.startDate, weekRange.endDate);
  const previousWeekTotals = sumActualByCategory(input.history, previousWeekRange.startDate, previousWeekRange.endDate);
  const dailyTotals = WEEKDAY_KEYS.map((_, index) => {
    const date = addDays(weekRange.startDate, index);
    return {
      date,
      totals: sumActualByCategory(input.history, date, date),
    };
  });

  const summaries = input.categories.map((category) => {
    const priorityLevel = normalizePriorityLevel(category.priorityLevel);
    const countsTowardProductiveGoal = resolveCountsTowardProductiveGoal(category);
    const allowDailySurplusReduction = resolveAllowDailySurplusReduction(category);
    const baseWeeklyTargetSeconds = getBaseWeeklyTargetSeconds(category);
    const incomingCarryoverCreditSeconds = getIncomingCarryoverCreditSeconds(category, previousWeekTotals.get(category.id) ?? 0);
    const adjustedWeeklyTargetSeconds = baseWeeklyTargetSeconds;
    const todayActualSeconds = todayTotals.get(category.id) ?? 0;
    const weekActualSeconds = weekTotals.get(category.id) ?? 0;
    const baseTodayTargetSeconds = getBaseTodayTargetSeconds(category, todayDate);
    const dailyAdjustmentSeconds = getDailyAdjustmentSeconds(category.id, todayDate, input.adjustments ?? []);
    const todaySourceShiftedSeconds = getOverWeeklyDailyTargetShiftSeconds(category.id, todayDate, input.adjustments ?? []);
    const todayReceivedShiftSeconds = getOverWeeklyDailyTargetReceivedSeconds(category.id, todayDate, input.adjustments ?? []);
    const adjustedTodayTargetSeconds = Math.max(0, baseTodayTargetSeconds + dailyAdjustmentSeconds);
    const dailySummaries = dailyTotals.map((day): FocusGoalDaySummary => {
      const baseTargetSeconds = getBaseTodayTargetSeconds(category, day.date);
      const adjustmentSeconds = getDailyAdjustmentSeconds(category.id, day.date, input.adjustments ?? []);
      return {
        date: day.date,
        weekdayKey: getWeekdayKey(day.date),
        baseTargetSeconds,
        adjustmentSeconds,
        adjustedTargetSeconds: Math.max(0, baseTargetSeconds + adjustmentSeconds),
        actualSeconds: day.totals.get(category.id) ?? 0,
      };
    });
    const elapsedTargetSeconds = dailySummaries.reduce((total, day) => {
      if (day.date > todayDate) return total;
      return total + day.adjustedTargetSeconds;
    }, 0);
    const weeklyPaceBehindSeconds = Math.max(0, elapsedTargetSeconds - weekActualSeconds);
    const remainingWeeklySeconds = Math.max(0, baseWeeklyTargetSeconds - weekActualSeconds);
    const catchUpPaceSeconds = Math.round(remainingWeeklySeconds / getRemainingActiveDays(todayDate, category.weekdayTargetSeconds ?? {}, normalizeDistributionMode(category.targetDistributionMode)));
    const warnings: FocusGoalWarning[] = [];
    if (adjustedTodayTargetSeconds > 0 && todayActualSeconds >= adjustedTodayTargetSeconds * 0.85 && todayActualSeconds < adjustedTodayTargetSeconds) warnings.push("approaching-daily-target");
    if (todayActualSeconds > adjustedTodayTargetSeconds && adjustedTodayTargetSeconds > 0) warnings.push("over-daily-target");
    if (weekActualSeconds > baseWeeklyTargetSeconds && baseWeeklyTargetSeconds > 0) warnings.push("over-weekly-target");
    if (incomingCarryoverCreditSeconds > 0) warnings.push("weekly-carryover-active");

    return {
      category,
      priorityLevel,
      countsTowardProductiveGoal,
      allowDailySurplusReduction,
      baseWeeklyTargetSeconds,
      incomingCarryoverCreditSeconds,
      adjustedWeeklyTargetSeconds,
      outgoingCarryoverCreditSeconds: getOutgoingCarryoverCreditSeconds(category, weekActualSeconds, incomingCarryoverCreditSeconds),
      baseTodayTargetSeconds,
      dailyAdjustmentSeconds,
      todaySourceShiftedSeconds,
      todayReceivedShiftSeconds,
      adjustedTodayTargetSeconds,
      todayActualSeconds,
      weekActualSeconds,
      todayDeltaSeconds: todayActualSeconds - adjustedTodayTargetSeconds,
      weekDeltaSeconds: weekActualSeconds - baseWeeklyTargetSeconds,
      catchUpPaceSeconds,
      weeklyPaceBehindSeconds,
      dailySummaries,
      warnings,
    };
  });

  const productiveSummaries = summaries.filter((summary) => summary.countsTowardProductiveGoal && !isSleepCategory(summary.category));
  const productiveCategoryIds = new Set(productiveSummaries.map((summary) => summary.category.id));
  const sleepExcludedSummaries = summaries.filter((summary) => isSleepCategory(summary.category));
  const unproductiveExcludedSummaries = summaries.filter((summary) => !summary.countsTowardProductiveGoal && !isSleepCategory(summary.category));
  const behindSummaries = productiveSummaries.filter((summary) =>
    (summary.adjustedTodayTargetSeconds > 0 && summary.todayActualSeconds < summary.adjustedTodayTargetSeconds) ||
    (summary.catchUpPaceSeconds > 0 && summary.todayActualSeconds < summary.catchUpPaceSeconds)
  );
  const recommended = [...behindSummaries].sort((a, b) => {
    if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel;
    return (b.adjustedTodayTargetSeconds - b.todayActualSeconds) - (a.adjustedTodayTargetSeconds - a.todayActualSeconds);
  })[0] ?? null;

  let todayOverCapacitySeconds = 0;
  for (const summary of summaries) {
    const surplus = detectDailySurplus(summary);
    if (surplus > 0 && getEligibleSurplusTargets(summary, summaries).length === 0) {
      todayOverCapacitySeconds += surplus;
      summary.warnings.push("today-over-capacity");
    }
    const hasPriorityDrift = surplus > 0 && behindSummaries.some((candidate) => candidate.priorityLevel > summary.priorityLevel);
    if (hasPriorityDrift) {
      summary.warnings.push("priority-drift");
    }
  }

  return {
    weekStartDate: weekRange.startDate,
    weekEndDate: weekRange.endDate,
    todayDate,
    summaries,
    productiveTodaySeconds: productiveSummaries.reduce((total, summary) => total + summary.todayActualSeconds, 0),
    productiveTodayExcludedSleepSeconds: sleepExcludedSummaries.reduce((total, summary) => total + summary.todayActualSeconds, 0),
    productiveTodayExcludedUnproductiveSeconds: unproductiveExcludedSummaries.reduce((total, summary) => total + summary.todayActualSeconds, 0),
    productiveTodayCategoryCount: productiveSummaries.filter((summary) => summary.todayActualSeconds > 0 || summary.baseTodayTargetSeconds > 0).length,
    productiveTodayBaseTargetSeconds: productiveSummaries.reduce((total, summary) => total + summary.baseTodayTargetSeconds, 0),
    productiveTodayTargetSeconds: productiveSummaries.reduce((total, summary) => total + summary.baseTodayTargetSeconds, 0),
    productiveWeekSeconds: productiveSummaries.reduce((total, summary) => total + summary.weekActualSeconds, 0),
    productiveWeekBaseTargetSeconds: productiveSummaries.reduce((total, summary) => total + summary.baseWeeklyTargetSeconds, 0),
    productiveWeekTargetSeconds: productiveSummaries.reduce((total, summary) => total + summary.baseWeeklyTargetSeconds, 0),
    productiveTodayReallocatedSeconds: sumDailyAdjustmentReductions(todayDate, input.adjustments ?? [], productiveCategoryIds),
    productiveNextWeekCreditPreviewSeconds: productiveSummaries.reduce((total, summary) => total + summary.outgoingCarryoverCreditSeconds, 0),
    recommendedCategoryId: recommended?.category.id ?? null,
    recommendationReason: recommended
      ? `${formatPriorityLabel(recommended.priorityLevel)} is behind today's plan.`
      : "No productive category is behind today's plan.",
    todayOverCapacitySeconds,
  } satisfies FocusGoalPlan;
}

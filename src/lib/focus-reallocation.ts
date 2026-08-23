import type {
  FocusCategory,
  FocusDailyGoalAdjustment,
  FocusReallocationMode,
  HistoricalFocusSession,
  PendingFocusDailySurplus,
} from "@/lib/types";
import {
  buildFocusGoalPlan,
  detectDailySurplus,
  getOverWeeklyDailyTargetReallocationPool,
  OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON,
} from "@/lib/focus-goals";
import { getLogicalDayKey } from "@/lib/logical-day";

export const FOCUS_REALLOCATION_MODE_STORAGE_KEY = "adhdice_focus_reallocation_mode";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function normalizeFocusReallocationMode(value: unknown): FocusReallocationMode {
  return value === "automatic" ? "automatic" : "manual";
}

export function getFocusReallocationModeStorageKey(userId: string) {
  return `${FOCUS_REALLOCATION_MODE_STORAGE_KEY}:${userId}`;
}

function browserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readFocusReallocationMode(userId: string | null, storage: StorageLike | null = browserStorage()): FocusReallocationMode {
  if (!userId || !storage) return "manual";
  return normalizeFocusReallocationMode(storage.getItem(getFocusReallocationModeStorageKey(userId)));
}

export function writeFocusReallocationMode(userId: string | null, mode: unknown, storage: StorageLike | null = browserStorage()) {
  if (!userId || !storage) return;
  storage.setItem(getFocusReallocationModeStorageKey(userId), normalizeFocusReallocationMode(mode));
}

export function shouldPresentDailySurplusModal(
  mode: FocusReallocationMode,
  pending: PendingFocusDailySurplus | null,
  manualOpen: boolean,
) {
  return pending !== null && (mode === "automatic" || manualOpen);
}

export function shouldPresentManualDailySurplusModal(
  mode: FocusReallocationMode,
  opportunity: PendingFocusDailySurplus | null,
  manualOpen: boolean,
) {
  return mode === "manual" && manualOpen && opportunity !== null;
}

export function shouldShowManualDailySurplusAction(mode: FocusReallocationMode, opportunity: PendingFocusDailySurplus | null) {
  return mode === "manual" && opportunity !== null;
}

function ordinaryDailySurplusAllocatedSeconds(
  sourceCategoryId: string,
  adjustmentDate: string,
  adjustments: FocusDailyGoalAdjustment[],
) {
  return adjustments.reduce((total, adjustment) => {
    if (adjustment.adjustmentDate !== adjustmentDate || adjustment.sourceCategoryId !== sourceCategoryId) return total;
    if (adjustment.reason === OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON) return total;
    return total + Math.max(0, Math.floor(adjustment.reductionSeconds));
  }, 0);
}

export function deriveManualDailySurplusOpportunity(input: {
  adjustments?: FocusDailyGoalAdjustment[];
  categories: FocusCategory[];
  history: HistoricalFocusSession[];
  todayDate?: string;
}): PendingFocusDailySurplus | null {
  const todayDate = input.todayDate ?? getLogicalDayKey();
  const adjustments = input.adjustments ?? [];
  const plan = buildFocusGoalPlan({
    adjustments,
    categories: input.categories,
    history: input.history,
    todayDate,
  });
  const opportunities = plan.summaries.flatMap((summary) => {
    const overWeeklySeconds = getOverWeeklyDailyTargetReallocationPool(summary);
    if (overWeeklySeconds > 0) {
      return [{
        sourceCategoryId: summary.category.id,
        sourceCategoryTitle: summary.category.title,
        sourceSessionId: null,
        adjustmentDate: todayDate,
        surplusSeconds: overWeeklySeconds,
        reason: OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON,
      } satisfies PendingFocusDailySurplus];
    }

    const remainingSeconds = Math.max(
      0,
      detectDailySurplus(summary) - ordinaryDailySurplusAllocatedSeconds(summary.category.id, todayDate, adjustments),
    );
    return remainingSeconds > 0
      ? [{
        sourceCategoryId: summary.category.id,
        sourceCategoryTitle: summary.category.title,
        sourceSessionId: null,
        adjustmentDate: todayDate,
        surplusSeconds: remainingSeconds,
      } satisfies PendingFocusDailySurplus]
      : [];
  });

  opportunities.sort((left, right) => {
    if (right.surplusSeconds !== left.surplusSeconds) return right.surplusSeconds - left.surplusSeconds;
    const titleOrder = left.sourceCategoryTitle.localeCompare(right.sourceCategoryTitle, undefined, { sensitivity: "base" });
    if (titleOrder !== 0) return titleOrder;
    return left.sourceCategoryId.localeCompare(right.sourceCategoryId);
  });
  return opportunities[0] ?? null;
}

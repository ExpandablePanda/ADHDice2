import { buildFocusGoalPlan } from "@/lib/focus-goals";
import { getAuthoritativeFocusElapsedSeconds } from "@/lib/focus-runtime";
import { isSystemCountdownCategoryId } from "@/lib/focus-utils";
import {
  type ActiveFocusSession,
  type FocusCategory,
  type FocusDailyGoalAdjustment,
  type HistoricalFocusSession,
} from "@/lib/types";

export const FOCUS_SANDBOX_PAGE_COUNT = 2;
export const FOCUS_SANDBOX_SWIPE_THRESHOLD_PX = 56;
export const FOCUS_BAR_FALLBACK_SCALE_SECONDS = 60 * 60;

export type FocusBarRuntimeState = "inactive" | "paused" | "running";
export type FocusBarGoalState = "no-goal" | "in-progress" | "complete" | "overtime";

export type FocusBarRow = {
  categoryId: string;
  categoryLabel: string;
  categoryColor: string;
  displayOrder: number;
  savedTodaySeconds: number;
  runtimeSeconds: number;
  combinedSeconds: number;
  adjustedGoalSeconds: number | null;
  progressRatio: number | null;
  overtimeSeconds: number;
  runtimeState: FocusBarRuntimeState;
  goalState: FocusBarGoalState;
  eligible: boolean;
};

export type FocusSandboxSwipeIntent = "cancelled" | "horizontal" | "pending";

export type FocusBarGeometry = {
  fillPercent: number;
  goalMarkerPercent: number | null;
};

export function hasRunningFocusBarRuntime(
  categories: FocusCategory[],
  activeSessions: Record<string, ActiveFocusSession>,
) {
  return categories.some((category) => activeSessions[category.id]?.isRunning);
}

export function getFocusBarGeometry(row: FocusBarRow): FocusBarGeometry {
  if (row.adjustedGoalSeconds === null) {
    return {
      fillPercent: Math.min(100, Math.max(0, (row.combinedSeconds / FOCUS_BAR_FALLBACK_SCALE_SECONDS) * 100)),
      goalMarkerPercent: null,
    };
  }

  const { adjustedGoalSeconds, combinedSeconds } = row;
  if (combinedSeconds <= adjustedGoalSeconds) {
    return {
      fillPercent: Math.min(100, Math.max(0, (combinedSeconds / adjustedGoalSeconds) * 100)),
      goalMarkerPercent: 100,
    };
  }

  return {
    fillPercent: 100,
    goalMarkerPercent: (adjustedGoalSeconds / combinedSeconds) * 100,
  };
}

export function getBoundedFocusSandboxPage(page: number) {
  return Math.min(FOCUS_SANDBOX_PAGE_COUNT - 1, Math.max(0, page));
}

export function classifyFocusSandboxSwipe(deltaX: number, deltaY: number): FocusSandboxSwipeIntent {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  if (verticalDistance >= 12 && verticalDistance > horizontalDistance) return "cancelled";
  if (horizontalDistance >= FOCUS_SANDBOX_SWIPE_THRESHOLD_PX && horizontalDistance > verticalDistance) return "horizontal";
  return "pending";
}

export function deriveFocusBarRows(input: {
  categories: FocusCategory[];
  history: HistoricalFocusSession[];
  adjustments?: FocusDailyGoalAdjustment[];
  activeSessions: Record<string, ActiveFocusSession>;
  nowMs: number;
  todayDate?: string;
}): FocusBarRow[] {
  const userCategories = input.categories.filter((category) => !isSystemCountdownCategoryId(category.id));
  const plan = buildFocusGoalPlan({
    adjustments: input.adjustments,
    categories: userCategories,
    history: input.history,
    todayDate: input.todayDate,
  });
  const summaryByCategoryId = new Map(plan.summaries.map((summary) => [summary.category.id, summary]));

  const rows = userCategories.map((category, displayOrder) => {
    const summary = summaryByCategoryId.get(category.id);
    const session = input.activeSessions[category.id];
    const savedTodaySeconds = Math.max(0, summary?.todayActualSeconds ?? 0);
    const runtimeSeconds = session ? getAuthoritativeFocusElapsedSeconds(session, input.nowMs) : 0;
    const combinedSeconds = savedTodaySeconds + runtimeSeconds;
    const adjustedGoalSeconds = summary && summary.adjustedTodayTargetSeconds > 0
      ? summary.adjustedTodayTargetSeconds
      : null;
    const hasConfiguredTodayGoal = (summary?.baseTodayTargetSeconds ?? 0) > 0;
    const overtimeSeconds = adjustedGoalSeconds === null
      ? 0
      : Math.max(0, combinedSeconds - adjustedGoalSeconds);
    const runtimeState: FocusBarRuntimeState = !session
      ? "inactive"
      : session.isRunning
        ? "running"
        : "paused";
    const goalState: FocusBarGoalState = adjustedGoalSeconds === null
      ? "no-goal"
      : overtimeSeconds > 0
        ? "overtime"
        : combinedSeconds >= adjustedGoalSeconds
          ? "complete"
          : "in-progress";

    return {
      categoryId: category.id,
      categoryLabel: category.title,
      categoryColor: category.color,
      displayOrder,
      savedTodaySeconds,
      runtimeSeconds,
      combinedSeconds,
      adjustedGoalSeconds,
      progressRatio: adjustedGoalSeconds === null ? null : combinedSeconds / adjustedGoalSeconds,
      overtimeSeconds,
      runtimeState,
      goalState,
      eligible: adjustedGoalSeconds !== null || hasConfiguredTodayGoal || savedTodaySeconds > 0 || Boolean(session),
    };
  });

  return rows.sort((left, right) => {
    const leftIsRuntime = left.runtimeState !== "inactive";
    const rightIsRuntime = right.runtimeState !== "inactive";
    if (leftIsRuntime !== rightIsRuntime) return leftIsRuntime ? -1 : 1;
    if (leftIsRuntime && rightIsRuntime && left.combinedSeconds !== right.combinedSeconds) {
      return right.combinedSeconds - left.combinedSeconds;
    }

    const leftHasTime = left.combinedSeconds > 0;
    const rightHasTime = right.combinedSeconds > 0;
    if (!leftIsRuntime && leftHasTime !== rightHasTime) return leftHasTime ? -1 : 1;
    if (!leftIsRuntime && leftHasTime && rightHasTime && left.combinedSeconds !== right.combinedSeconds) {
      return right.combinedSeconds - left.combinedSeconds;
    }

    if (!leftIsRuntime && !leftHasTime && !rightIsRuntime && !rightHasTime) {
      const goalDifference = (right.adjustedGoalSeconds ?? 0) - (left.adjustedGoalSeconds ?? 0);
      if (goalDifference !== 0) return goalDifference;
    }

    return left.displayOrder - right.displayOrder;
  });
}

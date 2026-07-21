import { getAuthoritativeFocusElapsedSeconds } from "@/lib/focus-runtime";
import { type ActiveFocusSession } from "@/lib/types";

export const FOCUS_SANDBOX_PAGE_COUNT = 2;
export const FOCUS_SANDBOX_SWIPE_THRESHOLD_PX = 56;

export type FocusBarState = {
  elapsedSeconds: number;
  targetSeconds: number | null;
  progressRatio: number | null;
  overtimeSeconds: number;
  isOpenEnded: boolean;
  isPaused: boolean;
};

export type FocusSandboxSwipeIntent = "cancelled" | "horizontal" | "pending";

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

export function deriveFocusBarState(session: ActiveFocusSession, nowMs: number): FocusBarState {
  const elapsedSeconds = getAuthoritativeFocusElapsedSeconds(session, nowMs);
  const targetSeconds = session.countdownTargetSeconds && session.countdownTargetSeconds > 0
    ? session.countdownTargetSeconds
    : null;

  return {
    elapsedSeconds,
    targetSeconds,
    progressRatio: targetSeconds === null ? null : elapsedSeconds / targetSeconds,
    overtimeSeconds: targetSeconds === null ? 0 : Math.max(0, elapsedSeconds - targetSeconds),
    isOpenEnded: targetSeconds === null,
    isPaused: !session.isRunning,
  };
}

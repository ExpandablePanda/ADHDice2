import { SYSTEM_COUNTDOWN_CATEGORY_ID } from "./focus-utils";
import type { ActiveFocusSession, FocusCategory } from "./types";

export const FOCUS_WIDGET_APP_GROUP = "group.com.andrewschaffer.adhdice";
export const FOCUS_WIDGET_STORAGE_KEY = "adhdice.focus.widget.snapshot.v1";
export const FOCUS_WIDGET_KIND = "ADHDiceWidgets";

export type FocusWidgetMode = "countup" | "countdown";

export type FocusWidgetSnapshot = {
  sessionId: string;
  categoryId: string;
  categoryTitle: string;
  mode: FocusWidgetMode;
  isRunning: boolean;
  startedAt: string | null;
  accumulatedSeconds: number;
  countdownTargetSeconds: number | null;
  updatedAt: string;
};

export type PrimaryFocusSession = {
  categoryTitle: string;
  session: ActiveFocusSession;
};

function normalizedUpdatedAt(value: string | undefined) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function stableSessionKey(session: ActiveFocusSession) {
  return `${session.sessionId ?? ""}\u0000${session.categoryId}`;
}

function comparePrimaryFocusSessions(left: ActiveFocusSession, right: ActiveFocusSession) {
  if (left.isRunning !== right.isRunning) {
    return left.isRunning ? -1 : 1;
  }

  const updatedAtDifference = normalizedUpdatedAt(right.updatedAt) - normalizedUpdatedAt(left.updatedAt);
  if (updatedAtDifference !== 0) {
    return updatedAtDifference;
  }

  return stableSessionKey(left).localeCompare(stableSessionKey(right));
}

/**
 * Widget primary-session authority: running sessions win over paused sessions;
 * within either state the newest updatedAt wins; exact timestamp ties use the
 * stable sessionId/categoryId key so the result does not depend on object order.
 */
export function resolvePrimaryFocusSession(
  activeSessions: Record<string, ActiveFocusSession>,
  categories: FocusCategory[],
): PrimaryFocusSession | null {
  const sessions = Object.values(activeSessions).filter((session) => Boolean(session?.categoryId));
  if (sessions.length === 0) {
    return null;
  }

  const session = [...sessions].sort(comparePrimaryFocusSessions)[0];
  if (!session) {
    return null;
  }

  const categoryTitle = session.categoryId === SYSTEM_COUNTDOWN_CATEGORY_ID
    ? "Countdown"
    : categories.find((category) => category.id === session.categoryId)?.title.trim() ?? "";
  const sessionId = session.sessionId;
  const updatedAt = session.updatedAt;
  if (!categoryTitle || !sessionId || !updatedAt) {
    return null;
  }

  return { categoryTitle, session };
}

export function buildFocusWidgetSnapshot(
  activeSessions: Record<string, ActiveFocusSession>,
  categories: FocusCategory[],
): FocusWidgetSnapshot | null {
  const primary = resolvePrimaryFocusSession(activeSessions, categories);
  if (!primary) {
    return null;
  }

  const { session } = primary;
  const sessionId = session.sessionId;
  const updatedAt = session.updatedAt;
  if (!sessionId || !updatedAt) {
    return null;
  }
  const mode: FocusWidgetMode = session.mode === "countdown" ? "countdown" : "countup";
  const accumulatedSeconds = Number.isFinite(session.accumulatedSeconds)
    ? Math.max(0, Math.floor(session.accumulatedSeconds))
    : null;
  const countdownTargetSeconds = session.countdownTargetSeconds == null
    ? null
    : Number.isFinite(session.countdownTargetSeconds)
      ? Math.max(0, Math.floor(session.countdownTargetSeconds))
      : null;
  const startedAt = session.startTime != null && Number.isFinite(session.startTime)
    ? new Date(session.startTime).toISOString()
    : null;
  if (
    accumulatedSeconds === null
    || (session.isRunning && startedAt === null)
    || (mode === "countdown" && (!countdownTargetSeconds || countdownTargetSeconds <= 0))
  ) {
    return null;
  }

  return {
    sessionId,
    categoryId: session.categoryId,
    categoryTitle: primary.categoryTitle,
    mode,
    isRunning: session.isRunning,
    startedAt,
    accumulatedSeconds,
    countdownTargetSeconds: mode === "countdown" ? countdownTargetSeconds : null,
    updatedAt,
  };
}

export function focusWidgetSnapshotSignature(snapshot: FocusWidgetSnapshot | null) {
  return snapshot ? JSON.stringify(snapshot) : "idle";
}

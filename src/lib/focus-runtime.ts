import type { ActiveFocusSession } from "@/lib/types";
import { SYSTEM_COUNTDOWN_CATEGORY_ID } from "@/lib/focus-utils";

export type FocusRuntimeRow = {
  session_id: string;
  user_id: string;
  runtime_kind: "category" | "standalone_countdown";
  category_id: string | null;
  mode: "count_up" | "countdown";
  countdown_target_seconds: number | null;
  state: "running" | "paused";
  current_run_started_at: string | null;
  accumulated_seconds: number;
  revision: number;
  closed_at: string | null;
  close_reason: "reset" | "completed" | "stopped" | null;
  created_at: string;
  updated_at: string;
};

export function focusRuntimeSlotKey(row: Pick<FocusRuntimeRow, "runtime_kind" | "category_id">) {
  return row.runtime_kind === "standalone_countdown"
    ? SYSTEM_COUNTDOWN_CATEGORY_ID
    : row.category_id;
}

export function mapFocusRuntimeRow(row: FocusRuntimeRow): ActiveFocusSession | null {
  if (row.closed_at) return null;
  const categoryId = focusRuntimeSlotKey(row);
  if (!categoryId) return null;
  return {
    categoryId,
    sessionId: row.session_id,
    startTime: row.current_run_started_at ? Date.parse(row.current_run_started_at) : null,
    accumulatedSeconds: Math.max(0, row.accumulated_seconds),
    isRunning: row.state === "running",
    mode: row.mode === "countdown" ? "countdown" : "countup",
    countdownTargetSeconds: row.mode === "countdown" ? row.countdown_target_seconds : null,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

export function mapFocusRuntimeRows(rows: FocusRuntimeRow[]) {
  return rows.reduce<Record<string, ActiveFocusSession>>((sessions, row) => {
    const session = mapFocusRuntimeRow(row);
    if (session) sessions[session.categoryId] = session;
    return sessions;
  }, {});
}

export type FocusRuntimeDeleteIdentity = Partial<Pick<FocusRuntimeRow, "session_id" | "runtime_kind" | "category_id">>;

export function removeFocusRuntimeFromSessions(
  sessions: Record<string, ActiveFocusSession>,
  deleted: FocusRuntimeDeleteIdentity,
) {
  if (deleted.session_id) {
    return Object.fromEntries(
      Object.entries(sessions).filter(([, session]) => session.sessionId !== deleted.session_id),
    );
  }

  // Legacy DELETE payloads can lack session_id. Only then use the logical slot.
  const slotKey = deleted.runtime_kind === "standalone_countdown"
    ? SYSTEM_COUNTDOWN_CATEGORY_ID
    : deleted.category_id ?? null;
  if (!slotKey) return sessions;
  return Object.fromEntries(
    Object.entries(sessions).filter(([categoryId]) => categoryId !== slotKey),
  );
}

export function reconcileFocusRuntimeSnapshot(rows: FocusRuntimeRow[]) {
  // A server fetch is authoritative: this intentionally drops local rows omitted
  // from the snapshot, including the empty-snapshot case.
  return mapFocusRuntimeRows(rows);
}

export function applyFocusRuntimeRealtimeRow(
  sessions: Record<string, ActiveFocusSession>,
  row: FocusRuntimeRow,
  closedRevisions: Map<string, number>,
) {
  if (row.closed_at) {
    closedRevisions.set(row.session_id, Math.max(closedRevisions.get(row.session_id) ?? 0, row.revision));
    if (closedRevisions.size > 100) closedRevisions.delete(closedRevisions.keys().next().value!);
    return removeFocusRuntimeFromSessions(sessions, { session_id: row.session_id });
  }
  if ((closedRevisions.get(row.session_id) ?? 0) >= row.revision) return sessions;
  const session = mapFocusRuntimeRow(row);
  if (!session || !isNewerFocusRuntimeSnapshot(session, sessions[session.categoryId])) return sessions;
  return { ...sessions, [session.categoryId]: session };
}

export function isCurrentFocusRuntimeSnapshotRequest(requestGeneration: number, currentGeneration: number) {
  return requestGeneration === currentGeneration;
}

export function isNewerFocusRuntimeSnapshot(
  incoming: Pick<ActiveFocusSession, "revision" | "updatedAt">,
  current?: Pick<ActiveFocusSession, "revision" | "updatedAt">,
) {
  if (!current) return true;
  const incomingRevision = incoming.revision ?? 0;
  const currentRevision = current.revision ?? 0;
  if (incomingRevision !== currentRevision) return incomingRevision > currentRevision;
  return Date.parse(incoming.updatedAt ?? "") >= Date.parse(current.updatedAt ?? "");
}

export function getAuthoritativeFocusElapsedSeconds(session: ActiveFocusSession, nowMs: number) {
  const currentSegment = session.isRunning && session.startTime
    ? Math.max(0, Math.floor((nowMs - session.startTime) / 1000))
    : 0;
  return Math.max(0, session.accumulatedSeconds + currentSegment);
}

export function getAuthoritativeFocusRemainingSeconds(session: ActiveFocusSession, nowMs: number) {
  if (session.mode !== "countdown" || !session.countdownTargetSeconds) return null;
  return Math.max(0, session.countdownTargetSeconds - getAuthoritativeFocusElapsedSeconds(session, nowMs));
}

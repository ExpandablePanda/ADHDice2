export function upsertFocusHistoryEntry<TEntry extends { id: string }>(
  history: readonly TEntry[],
  entry: TEntry,
): TEntry[] {
  return [entry, ...history.filter((candidate) => candidate.id !== entry.id)];
}

export function getFocusActivityBarFillPercent(
  actualSeconds: number,
  goalSeconds: number | undefined,
  maxActivitySeconds: number,
) {
  const safeActualSeconds = Number.isFinite(actualSeconds) ? Math.max(0, actualSeconds) : 0;

  if (goalSeconds && goalSeconds > 0) {
    return Math.min(100, (safeActualSeconds / goalSeconds) * 100);
  }

  return maxActivitySeconds > 0
    ? Math.min(100, (safeActualSeconds / maxActivitySeconds) * 100)
    : 0;
}

export function getFocusActivityGoalMarkerPercent(actualSeconds: number, goalSeconds: number | undefined) {
  if (!Number.isFinite(actualSeconds) || !Number.isFinite(goalSeconds) || goalSeconds === undefined || goalSeconds <= 0) {
    return null;
  }

  const safeActualSeconds = Math.max(0, actualSeconds);
  return safeActualSeconds <= goalSeconds
    ? 100
    : Math.min(100, Math.max(0, (goalSeconds / safeActualSeconds) * 100));
}

export function attachDailyOverallGoalSeconds<
  TBar extends { key: string },
  TSession extends { id: string },
>(
  bars: TBar[],
  sessions: TSession[],
  getGoalSeconds: (session: TSession) => number,
): Array<TBar & { goalSeconds?: number }> {
  const sessionById = new Map(sessions.map((session) => [session.id, session]));

  return bars.map((bar) => {
    const session = sessionById.get(bar.key);
    const goalSeconds = session ? getGoalSeconds(session) : 0;

    return {
      ...bar,
      goalSeconds: goalSeconds || undefined,
    };
  });
}

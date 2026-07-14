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

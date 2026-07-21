"use client";

import React, { Component, type ReactNode, useEffect, useMemo, useState } from "react";
import { deriveFocusBarState } from "@/lib/focus-bars";
import { type ActiveFocusSession, type FocusCategory } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

export function FocusBars({
  activeSessions,
  categories,
}: {
  activeSessions: Record<string, ActiveFocusSession>;
  categories: FocusCategory[];
}) {
  const hasRunningTimer = Object.values(activeSessions).some((session) => session.isRunning);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!hasRunningTimer) return;
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [hasRunningTimer]);

  const rows = useMemo(() => categories.flatMap((category) => {
    const session = activeSessions[category.id];
    return session ? [{ category, session }] : [];
  }), [activeSessions, categories]);

  if (!rows.length) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-[#ddd4f4] bg-[#fbf9ff] px-5 py-8 text-center dark:border-white/12 dark:bg-white/[0.03]">
        <p className="text-sm font-semibold text-[var(--text-primary)]">No active Focus timers</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Running and paused Focus timers will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map(({ category, session }) => {
        const state = deriveFocusBarState(session, nowMs);
        const targetFillPercent = state.progressRatio === null ? 0 : Math.min(100, state.progressRatio * 100);
        const overtimeFillPercent = state.targetSeconds
          ? Math.min(100, (state.overtimeSeconds / state.targetSeconds) * 100)
          : 0;

        return (
          <article className="min-w-0 rounded-[1.35rem] border border-[#ebe4fb] bg-white px-4 py-3 shadow-[0_10px_28px_rgba(81,61,168,0.06)] dark:border-white/10 dark:bg-white/[0.045]" key={category.id}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                  <h3 className="truncate text-sm font-bold text-[var(--text-primary)]">{category.title}</h3>
                </div>
                <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">{state.isPaused ? "Paused" : "Running"}</p>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className="text-sm font-black text-[var(--text-primary)]">{formatDuration(state.elapsedSeconds)}</p>
                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                  {state.targetSeconds === null ? "Open-ended" : `of ${formatDuration(state.targetSeconds)}`}
                </p>
              </div>
            </div>

            {state.isOpenEnded ? (
              <div aria-label={`${state.isPaused ? "Paused" : "Live"} open-ended timer`} className="mt-3 overflow-hidden rounded-full bg-[#eee9f8] dark:bg-white/10">
                <svg aria-hidden="true" className="block h-3 w-full" preserveAspectRatio="none" viewBox="0 0 100 12">
                  <rect fill={category.color} height="12" opacity={state.isPaused ? 0.42 : 0.68} rx="6" width="24" x={state.isPaused ? 12 : -24}>
                    {!state.isPaused ? <animate attributeName="x" dur="2.2s" from="-24" repeatCount="indefinite" to="100" /> : null}
                  </rect>
                </svg>
              </div>
            ) : (
              <div className="mt-3">
                <div className="flex h-3 overflow-hidden rounded-full bg-[#eee9f8] dark:bg-white/10">
                  <div className="relative min-w-0 flex-1 overflow-hidden" aria-label={`${Math.round(targetFillPercent)}% of planned duration`}>
                    <div className="h-full rounded-l-full transition-[width] duration-500" style={{ backgroundColor: category.color, opacity: state.isPaused ? 0.58 : 0.82, width: `${targetFillPercent}%` }} />
                    <span aria-hidden="true" className="absolute bottom-0 right-0 top-0 w-0.5 bg-[var(--text-primary)] opacity-70" />
                  </div>
                  {state.overtimeSeconds > 0 ? (
                    <div aria-label={`Overtime ${formatDuration(state.overtimeSeconds)}`} className="w-[28%] border-l-2 border-white/90 bg-[#eee9f8] dark:border-[#211a38] dark:bg-white/10">
                      <div className="h-full transition-[width] duration-500" style={{ backgroundColor: category.color, opacity: state.isPaused ? 0.34 : 0.52, width: `${Math.max(12, overtimeFillPercent)}%` }} />
                    </div>
                  ) : null}
                </div>
                {state.overtimeSeconds > 0 ? (
                  <p className="mt-1.5 text-right text-xs font-bold tabular-nums text-[var(--text-primary)]">+{formatDuration(state.overtimeSeconds)} overtime</p>
                ) : null}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

export class FocusBarsErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

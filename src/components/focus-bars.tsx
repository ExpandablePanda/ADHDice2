"use client";

import React, { Component, type ReactNode, useEffect, useMemo, useState } from "react";
import { formatFocusGoalDuration } from "@/lib/focus-goals";
import { deriveFocusBarRows, getFocusBarGeometry, hasRunningFocusBarRuntime } from "@/lib/focus-bars";
import {
  type ActiveFocusSession,
  type FocusCategory,
  type FocusDailyGoalAdjustment,
  type HistoricalFocusSession,
} from "@/lib/types";
import { TaskTableChipButton } from "./ui/task-table-primitives";

const FOCUS_BAR_CONTROL_TONE = "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] hover:bg-[#e9e1ff] dark:border-white/15 dark:bg-white/8 dark:text-[#cabfff] dark:hover:bg-white/12";
const FOCUS_BAR_FINISH_TONE = "border-[#f0dbe1] bg-[#fff4f6] text-[#c84d68] hover:bg-[#ffecef] dark:border-[#6c3042] dark:bg-[#351b27] dark:text-[#ff9fbc]";

function formatFocusBarRuntimeDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return hours ? `${hours}h ${minutes}m ${remainingSeconds}s` : `${minutes}m ${remainingSeconds}s`;
}

export function FocusBars({
  activeSessions,
  adjustments,
  categories,
  history,
  onFinish,
  onToggle,
}: {
  activeSessions: Record<string, ActiveFocusSession>;
  adjustments: FocusDailyGoalAdjustment[];
  categories: FocusCategory[];
  history: HistoricalFocusSession[];
  onFinish: (categoryId: string) => void;
  onToggle: (categoryId: string, options?: { countdownTargetSeconds?: number | null; mode?: "countdown" | "countup" }) => void;
}) {
  const hasRunningTimer = hasRunningFocusBarRuntime(categories, activeSessions);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!hasRunningTimer) return;
    const frameId = window.requestAnimationFrame(() => setNowMs(Date.now()));
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(timerId);
    };
  }, [hasRunningTimer]);

  const rows = useMemo(() => deriveFocusBarRows({
    activeSessions,
    adjustments,
    categories,
    history,
    nowMs,
  }).filter((row) => row.eligible), [activeSessions, adjustments, categories, history, nowMs]);
  if (!rows.length) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-[#ddd4f4] bg-[#fbf9ff] px-5 py-8 text-center dark:border-white/12 dark:bg-white/[0.03]">
        <p className="text-sm font-semibold text-[var(--text-primary)]">No Focus Bars for today</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Add a daily goal, log Focus activity, or start a category timer.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-3 py-4 dark:border-white/10 dark:bg-white/[0.03] sm:px-4">
      <div className="mb-4 text-left">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Today</p>
        <h3 className="mt-1 text-xl font-black tracking-tight text-[var(--text-primary)]">Focus Bars</h3>
      </div>
      <div aria-label="Live daily Focus category bar chart" className="adhdice-scrollbar w-full overflow-x-auto overscroll-x-contain pb-3" role="region" tabIndex={0}>
        <div className="flex min-w-full items-end gap-4 px-2 sm:gap-5 sm:px-3">
          {rows.map((row) => {
            const { fillPercent, goalMarkerPercent } = getFocusBarGeometry(row);
            const isGoalComplete = row.goalState === "complete" || row.goalState === "overtime";
            const stateLabel = row.runtimeState === "running"
              ? "Running"
              : row.runtimeState === "paused"
                ? "Paused"
                : "Inactive";

            return (
              <article className="flex w-[6.5rem] min-w-[6.5rem] shrink-0 flex-col items-center" key={row.categoryId}>
                <p className="h-4 w-full whitespace-nowrap text-center text-[11px] font-bold tabular-nums text-[var(--text-primary)]">
                  Today {formatFocusBarRuntimeDuration(row.combinedSeconds)}
                </p>
                <p className="mt-2 h-4 w-full whitespace-nowrap text-center text-[10px] font-semibold text-[var(--text-muted)]">
                  {row.adjustedGoalSeconds === null ? "No goal" : `Goal ${formatFocusGoalDuration(row.adjustedGoalSeconds)}`}
                </p>
                <div className="mt-1 flex h-44 w-16 items-end justify-center">
                  <div
                    aria-label={`${row.categoryLabel}: ${formatFocusBarRuntimeDuration(row.combinedSeconds)}${row.adjustedGoalSeconds === null ? ", no goal" : ` of ${formatFocusGoalDuration(row.adjustedGoalSeconds)}`}`}
                    className="relative h-full w-full overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] shadow-inner dark:border-white/10 dark:bg-white/[0.06]"
                  >
                    <div
                      className="absolute bottom-0 left-0 w-full rounded-t-md transition-[height] duration-500"
                      style={{
                        backgroundColor: row.categoryColor,
                        height: row.combinedSeconds > 0 ? `${Math.min(100, Math.max(3, fillPercent))}%` : "0%",
                        opacity: row.runtimeState === "paused" ? 0.68 : 0.88,
                      }}
                    />
                    {goalMarkerPercent !== null ? (
                      <span
                        aria-label={`Goal marker ${formatFocusGoalDuration(row.adjustedGoalSeconds ?? 0)}`}
                        className="absolute left-0 z-10 w-full border-t-2 border-dashed border-[var(--text-primary)] opacity-80"
                        style={{ bottom: `${goalMarkerPercent}%` }}
                      />
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 min-h-8 w-full overflow-hidden break-words text-center text-[10px] font-semibold leading-tight text-[var(--text-secondary)]" title={row.categoryLabel}>
                  {row.categoryLabel}
                </p>
                <div className="flex min-h-10 w-full flex-col items-center justify-start text-center text-[10px] leading-tight">
                  <p className="min-h-4 font-semibold text-[var(--text-muted)]">{stateLabel}</p>
                  {row.runtimeState !== "inactive" ? (
                    <p className="min-h-4 font-semibold tabular-nums text-[var(--text-secondary)]">Session {formatFocusBarRuntimeDuration(row.runtimeSeconds)}</p>
                  ) : null}
                </div>
                <div className="min-h-4 w-full text-center text-[10px] font-semibold leading-tight text-[var(--text-secondary)]">
                  {isGoalComplete ? "Goal complete" : ""}
                </div>
                <div className="min-h-4 w-full text-center text-[10px] font-bold tabular-nums leading-tight text-[#c84d68]">
                  {row.overtimeSeconds > 0 ? `+ ${formatFocusGoalDuration(row.overtimeSeconds)} overtime` : ""}
                </div>
                <div className="mt-2 flex min-h-12 flex-wrap items-start justify-center gap-1" role="group" aria-label={`${row.categoryLabel} timer controls`}>
                  <TaskTableChipButton
                    aria-label={`${row.runtimeState === "paused" ? "Resume" : row.runtimeState === "running" ? "Pause" : "Start"} ${row.categoryLabel}`}
                    className="h-[22px] px-2 py-0"
                    onClick={() => onToggle(row.categoryId, row.runtimeState === "inactive" ? { mode: "countup" } : undefined)}
                    toneClassName={FOCUS_BAR_CONTROL_TONE}
                  >
                    {row.runtimeState === "paused" ? "Resume" : row.runtimeState === "running" ? "Pause" : "Start"}
                  </TaskTableChipButton>
                  {row.runtimeState !== "inactive" ? (
                    <TaskTableChipButton
                      aria-label={`Finish ${row.categoryLabel}`}
                      className="h-[22px] px-2 py-0"
                      onClick={() => onFinish(row.categoryId)}
                      toneClassName={FOCUS_BAR_FINISH_TONE}
                    >
                      Finish
                    </TaskTableChipButton>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
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

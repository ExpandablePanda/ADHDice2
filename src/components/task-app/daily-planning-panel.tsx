"use client";

import type { Task } from "@/lib/database.types";
import { describePlanningCandidate } from "@/lib/task-cockpit";

type DailyPlanningPanelProps = {
  focusCount: number;
  inboxCount: number;
  isCollapsed: boolean;
  missedCount: number;
  onOpenFocusPlanner: () => void;
  onSetTaskRecurring: (taskId: string, preset: "daily" | "weekly" | "monthly") => void;
  onToggleCollapsed: () => void;
  onSelectBucket: (bucket: string) => void;
  planningCandidates: Task[];
  recurringCount: number;
  routeTaskToToday: (taskId: string) => void;
  sendTaskToLater: (taskId: string) => void;
  sendTaskToWaiting: (taskId: string) => void;
  todayCount: number;
  waitingCount: number;
};

export function DailyPlanningPanel({
  focusCount,
  inboxCount,
  isCollapsed,
  missedCount,
  onOpenFocusPlanner,
  onSetTaskRecurring,
  onToggleCollapsed,
  onSelectBucket,
  planningCandidates,
  recurringCount,
  routeTaskToToday,
  sendTaskToLater,
  sendTaskToWaiting,
  todayCount,
  waitingCount,
}: DailyPlanningPanelProps) {
  return (
    <section className="mb-4 rounded-[1.45rem] border border-[#ece8f8] bg-white/90 p-4 shadow-[0_16px_40px_rgba(81,61,168,0.06)] dark:border-white/10 dark:bg-white/6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8e88a9] dark:text-white/35">Daily planning</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-[#1e2642] dark:text-white">Pick a realistic today list, then protect it.</h2>
            <button className="rounded-full border border-[#e5def9] px-3 py-1.5 text-xs font-semibold text-[#6f57f6] transition hover:bg-[#f6f1ff] dark:border-white/15 dark:text-[#cabfff] dark:hover:bg-white/8" onClick={onToggleCollapsed} type="button">
              {isCollapsed ? "Show" : "Hide"}
            </button>
          </div>
          <p className="mt-1 text-sm text-[#68738f] dark:text-white/55">
            {todayCount} in Today, {focusCount} in Focus, {inboxCount} in Inbox, {waitingCount} waiting, {recurringCount} recurring. Triage Inbox fast, then protect the real work.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-full bg-[#f3efff] px-4 py-2 text-sm font-semibold text-[#6f57f6] dark:bg-[#261e49] dark:text-[#cabfff]" onClick={onOpenFocusPlanner} type="button">
            Open Focus Planner
          </button>
          {missedCount > 0 ? (
            <button className="rounded-full bg-[#fff1f3] px-4 py-2 text-sm font-semibold text-[#f05566] dark:bg-[#44232f] dark:text-[#ff9eaf]" onClick={() => onSelectBucket("missed")} type="button">
              Review Missed
            </button>
          ) : null}
        </div>
      </div>
      {!isCollapsed && planningCandidates.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {planningCandidates.map((task) => (
            <div className="flex flex-col gap-3 rounded-[1rem] border border-[#f0ebfb] bg-[#fcfbff] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/[0.04]" key={task.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#22304b] dark:text-white">{task.title}</p>
                <p className="mt-1 text-xs text-[#7b86a1] dark:text-white/45">{describePlanningCandidate(task)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full bg-[#ede8ff] px-3 py-2 text-xs font-semibold text-[#6f57f6] dark:bg-[#261e49] dark:text-[#cabfff]" onClick={() => routeTaskToToday(task.id)} type="button">
                  Plan Today
                </button>
                <button className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#59627e] dark:bg-white/8 dark:text-white/65" onClick={() => sendTaskToWaiting(task.id)} type="button">
                  Waiting
                </button>
                <button className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#59627e] dark:bg-white/8 dark:text-white/65" onClick={() => sendTaskToLater(task.id)} type="button">
                  Later
                </button>
                <button className="rounded-full bg-[#fff6df] px-3 py-2 text-xs font-semibold text-[#a87200] dark:bg-[#44350d] dark:text-[#ffd36c]" onClick={() => onSetTaskRecurring(task.id, "weekly")} type="button">
                  Repeat Weekly
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useMemo } from "react";

import type { EconomyState } from "@/hooks/useEconomy";
import type { AchievementSummaryPresentation } from "@/lib/achievement-progress";
import type { Task, TaskEnergy, TaskHistory as DbTaskHistory } from "@/lib/database.types";
import { getLevelProgress } from "@/lib/economy-levels";
import type { HistoricalFocusSession } from "@/lib/types";
import { todayISO } from "@/lib/utils";

import { PageShellHeader } from "./page-shell-header";

type TaskHistoryStats = {
  bestStreak: number;
  currentStreak: number;
  doneRate: number;
};

type StatsPageProps = {
  achievementSummary: AchievementSummaryPresentation;
  economy: EconomyState;
  focusHistory: HistoricalFocusSession[];
  taskHistory: DbTaskHistory[];
  taskHistoryStats: TaskHistoryStats;
  tasks: Task[];
};

export function StatsPage({
  achievementSummary,
  economy,
  focusHistory,
  taskHistory,
  taskHistoryStats,
  tasks,
}: StatsPageProps) {
  const today = todayISO();
  const todayDone = taskHistory.filter((entry) => entry.entry_date === today && entry.was_completed).length;
  const weekDates = Array.from({ length: 7 }, (_, index) => shiftDateKey(today, -index));
  const weekDone = taskHistory.filter((entry) => weekDates.includes(entry.entry_date) && entry.was_completed).length;
  const todayFocusMinutes = Math.floor(
    focusHistory
      .filter((entry) => entry.date === today)
      .reduce((sum, entry) => sum + entry.durationSeconds, 0) / 60,
  );

  const { chartDays, maxScore } = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = shiftDateKey(today, -(6 - index));
      const done = taskHistory.filter((entry) => entry.entry_date === date && entry.was_completed).length;
      const focusSeconds = focusHistory
        .filter((entry) => entry.date === date)
        .reduce((sum, entry) => sum + entry.durationSeconds, 0);
      const score = done * 10 + Math.floor(focusSeconds / 60);
      return { date, score };
    });
    return { chartDays: days, maxScore: Math.max(...days.map((day) => day.score), 1) };
  }, [focusHistory, taskHistory, today]);

  const { energyCounts, totalEnergy } = useMemo(() => {
    const counts: Record<TaskEnergy, number> = { none: 0, low: 0, medium: 0, high: 0 };
    for (const task of tasks) {
      if (task.status !== "archived" && task.status !== "trashed" && task.status !== "done") {
        counts[task.energy]++;
      }
    }
    return { energyCounts: counts, totalEnergy: counts.low + counts.medium + counts.high || 1 };
  }, [tasks]);
  const xpProgress = useMemo(() => getLevelProgress(economy.xp), [economy.xp]);

  const statCard = (label: string, value: string, detail: string) => (
    <div className="flex-1 rounded-2xl bg-[#f7f5ff] px-4 py-4 dark:bg-white/5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">{label}</p>
      <p className="mt-1 text-3xl font-black tabular-nums text-[#17203a] dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs text-[#8e88a9] dark:text-white/40">{detail}</p>
    </div>
  );

  return (
    <section className="px-4 pb-32">
      <PageShellHeader title="Stats" subtitle="Insights" />

      <div className="mb-4 flex gap-3">
        {statCard("Today", String(todayDone), "tasks done")}
        {statCard("This Week", String(weekDone), "tasks done")}
      </div>
      <div className="mb-6 flex gap-3">
        {statCard("Streak", String(taskHistoryStats.currentStreak), taskHistoryStats.currentStreak === 1 ? "day" : "days")}
        {statCard("Focus Today", `${todayFocusMinutes}m`, "minutes logged")}
      </div>

      <div className="mb-6 rounded-2xl bg-[#f7f5ff] px-5 py-4 dark:bg-white/5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
          Economy
        </p>
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs text-[#8e88a9] dark:text-white/40">Level</p>
            <p className="text-2xl font-black text-[#17203a] dark:text-white">{economy.level}</p>
          </div>
          <div className="flex-1">
            <div className="mb-1 flex justify-between">
              <p className="text-xs text-[#8e88a9] dark:text-white/40">XP</p>
              <p className="text-xs tabular-nums text-[#8e88a9] dark:text-white/40">{xpProgress.xpIntoLevel} / {xpProgress.xpNeededForLevel}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#e5e0f5] dark:bg-white/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#7c63f7,#9b87ff)]"
                style={{ width: `${Math.min(100, Math.round(xpProgress.percentToNextLevel))}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-[#8e88a9] dark:text-white/35">Next level at {xpProgress.nextLevelThresholdXp} total XP</p>
          </div>
        </div>
        <div className="mt-3 flex gap-4">
          <div>
            <p className="text-xs text-[#8e88a9] dark:text-white/40">Points</p>
            <p className="font-bold tabular-nums text-[#27304c] dark:text-white">{economy.points}</p>
          </div>
          <div>
            <p className="text-xs text-[#8e88a9] dark:text-white/40">Tokens</p>
            <p className="font-bold tabular-nums text-[#27304c] dark:text-white">{economy.tokens}</p>
          </div>
          <div>
            <p className="text-xs text-[#8e88a9] dark:text-white/40">Best Streak</p>
            <p className="font-bold tabular-nums text-[#27304c] dark:text-white">{taskHistoryStats.bestStreak}d</p>
          </div>
          <div>
            <p className="text-xs text-[#8e88a9] dark:text-white/40">Done Rate</p>
            <p className="font-bold tabular-nums text-[#27304c] dark:text-white">{taskHistoryStats.doneRate}%</p>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl bg-[#f7f5ff] px-5 py-4 dark:bg-white/5">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
          7-Day Productivity
        </p>
        <div className="flex h-28 items-end gap-1.5">
          {chartDays.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t-lg transition-all ${day.date === today ? "bg-[linear-gradient(180deg,#7c63f7,#9b87ff)]" : "bg-[#cdc6f7] dark:bg-white/20"}`}
                  style={{ height: `${Math.max(4, Math.round((day.score / maxScore) * 100))}%` }}
                />
              </div>
              <p className="text-[9px] tabular-nums text-[#8e88a9] dark:text-white/40">
                {day.date.slice(5).replace("-", "/")}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-[#8e88a9] dark:text-white/30">
          Score = tasks × 10 + focus minutes
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-[#deebff] bg-[linear-gradient(135deg,#f8fbff_0%,#f7f5ff_55%,#fff7ef_100%)] px-5 py-4 shadow-[0_16px_42px_rgba(77,102,177,0.08)] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(18,28,47,0.96),rgba(31,22,42,0.92))]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#6f7ea4] dark:text-white/40">
              Achievements
            </p>
            <h3 className="mt-1 text-2xl font-black text-[#182544] dark:text-white">
              {achievementSummary.latestUnlockLabel}
            </h3>
            <p className="mt-1 text-sm text-[#68748f] dark:text-white/58">
              {achievementSummary.latestUnlockDetail}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {statCard("Tiers", achievementSummary.earnedTiersLabel, achievementSummary.isReady ? "earned" : "loading")}
            {statCard("Mastered", achievementSummary.completedCollectionsLabel, achievementSummary.isReady ? "collections" : "loading")}
            {statCard("Completion", achievementSummary.completionLabel, achievementSummary.isReady ? "all tiers" : "loading")}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#f7f5ff] px-5 py-4 dark:bg-white/5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
          Active Task Energy
        </p>
        {(["high", "medium", "low"] as TaskEnergy[]).map((level) => {
          const pct = Math.round((energyCounts[level] / totalEnergy) * 100);
          return (
            <div key={level} className="mb-2">
              <div className="mb-1 flex justify-between">
                <p className="text-xs capitalize text-[#27304c] dark:text-white/80">{level}</p>
                <p className="text-xs tabular-nums text-[#8e88a9] dark:text-white/40">{energyCounts[level]}</p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#e5e0f5] dark:bg-white/10">
                <div
                  className={`h-full rounded-full ${level === "high" ? "bg-[#f05566]" : level === "medium" ? "bg-[#f0a030]" : "bg-[#30c060]"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part ?? "", 10));
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

import { useEffect, useMemo, useState } from "react";
import type { ActiveFocusSession, FocusCategory, FocusDailyGoalAdjustment, HistoricalFocusSession } from "@/lib/types";
import {
  buildFocusGoalPlan,
  formatFocusGoalDuration,
  formatPriorityLabel,
  isSleepCategory,
  type FocusGoalCategorySummary,
} from "@/lib/focus-goals";

function formatCompactDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}/${String(end.getFullYear()).slice(-2)}`;
}

function typeLine(summary: FocusGoalCategorySummary) {
  return [summary.category.focusType, summary.category.focusSubtype, summary.category.focusSubtype2].filter(Boolean).join(" / ");
}

function progressPercent(actualSeconds: number, targetSeconds: number) {
  if (targetSeconds <= 0) return 0;
  return Math.max(0, Math.round((actualSeconds / targetSeconds) * 100));
}

function remainingTodaySeconds(summary: FocusGoalCategorySummary) {
  return Math.max(0, summary.adjustedTodayTargetSeconds - summary.todayActualSeconds);
}

function targetText(label: string, summary: FocusGoalCategorySummary) {
  const actualSeconds = summary.todayActualSeconds;
  const adjustedSeconds = summary.adjustedTodayTargetSeconds;
  const baseSeconds = summary.baseTodayTargetSeconds;
  const adjustedChanged = adjustedSeconds !== baseSeconds;
  if (summary.todaySourceShiftedSeconds > 0) {
    return `${label}: ${formatFocusGoalDuration(actualSeconds)} / ${formatFocusGoalDuration(adjustedSeconds)} · base ${formatFocusGoalDuration(baseSeconds)} shifted today`;
  }
  if (adjustedChanged) {
    return `${label}: ${formatFocusGoalDuration(actualSeconds)} / ${formatFocusGoalDuration(adjustedSeconds)} · base ${formatFocusGoalDuration(baseSeconds)}`;
  }
  return `${label}: ${formatFocusGoalDuration(actualSeconds)} / ${formatFocusGoalDuration(baseSeconds)}`;
}

function statusLabels(summary: FocusGoalCategorySummary) {
  const labels: { label: string; tone: "success" | "warning" | "credit" }[] = [];
  const isSatisfiedToday =
    summary.adjustedTodayTargetSeconds > 0 &&
    summary.todayActualSeconds >= summary.adjustedTodayTargetSeconds;

  if (isSatisfiedToday) labels.push({ label: "Done today", tone: "success" });
  if (summary.warnings.includes("over-daily-target")) labels.push({ label: "Over today", tone: "warning" });
  if (summary.warnings.includes("over-weekly-target")) labels.push({ label: "Over weekly", tone: summary.todaySourceShiftedSeconds > 0 ? "success" : "warning" });
  if (summary.todaySourceShiftedSeconds > 0) labels.push({ label: "Today target shifted", tone: "success" });
  if (summary.todayReceivedShiftSeconds > 0) labels.push({ label: `Received ${formatFocusGoalDuration(summary.todayReceivedShiftSeconds)} today`, tone: "credit" });
  if (summary.catchUpPaceSeconds > summary.todayActualSeconds) labels.push({ label: "Behind pace", tone: "warning" });
  if (summary.warnings.includes("priority-drift")) labels.push({ label: "Priority drift", tone: "warning" });
  if (summary.warnings.includes("today-over-capacity")) labels.push({ label: "Over capacity", tone: "warning" });
  if (summary.warnings.includes("weekly-carryover-active")) labels.push({ label: "Carryover active", tone: "credit" });
  return labels;
}

function statusTextClass(tone: "success" | "warning" | "credit") {
  if (tone === "success") {
    return "text-[#32734c] dark:text-[#9bd7b4]";
  }
  if (tone === "warning") {
    return "text-[#9a5a22] dark:text-[#f4bd82]";
  }
  return "text-[#6b5ab8] dark:text-[#b9a9ff]";
}

function weeklyTargetText(summary: FocusGoalCategorySummary) {
  const actual = formatFocusGoalDuration(summary.weekActualSeconds);
  const base = formatFocusGoalDuration(summary.baseWeeklyTargetSeconds);
  return `Week: ${actual} / ${base}`;
}

function ProgressBar({
  actualSeconds,
  targetSeconds,
  satisfied,
}: {
  actualSeconds: number;
  targetSeconds: number;
  satisfied: boolean;
}) {
  const percent = progressPercent(actualSeconds, targetSeconds);
  return (
    <div className="h-3 overflow-hidden rounded-full bg-[var(--surface-muted)] dark:bg-white/[0.05]">
      <div
        className={`h-3 rounded-full transition-[width] ${satisfied ? "bg-[#67b982]" : "bg-[#7c68f1]"}`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

function GoalColumn({
  actualSeconds,
  className = "",
  color,
  label,
  targetSeconds,
}: {
  actualSeconds: number;
  className?: string;
  color?: string;
  label: string;
  targetSeconds: number;
}) {
  const hasGoal = targetSeconds > 0;
  const actualFillPercent = hasGoal ? Math.min(100, (actualSeconds / targetSeconds) * 100) : actualSeconds > 0 ? 100 : 0;
  const actualFillHeight = actualSeconds > 0 ? `${Math.max(6, actualFillPercent)}%` : "0%";
  const isAtGoal = targetSeconds > 0 && actualSeconds >= targetSeconds;
  const isOver = targetSeconds > 0 && actualSeconds > targetSeconds;
  const fillColor = isAtGoal || (!hasGoal && actualSeconds > 0) ? "#67b982" : color ?? "#7c68f1";
  return (
    <div className={`flex min-w-0 flex-col items-center justify-end gap-1 ${className}`}>
      <span className="w-full whitespace-nowrap text-center text-[9px] font-bold leading-none text-[var(--text-primary)] sm:text-[10px]">
        {formatFocusGoalDuration(actualSeconds)}
      </span>
      <span className="w-full whitespace-nowrap text-center text-[8px] font-semibold leading-none text-[var(--text-muted)] sm:text-[9px]">
        {hasGoal ? formatFocusGoalDuration(targetSeconds) : "No goal"}
      </span>
      <div className="flex h-20 w-full min-w-0 items-end justify-center">
        <div
          className={`relative h-full w-full max-w-[1.8rem] overflow-hidden rounded-md border shadow-inner sm:max-w-[2rem] ${
            hasGoal
              ? isAtGoal
                ? "border-[#cfe8db] bg-[#eef8f2] dark:border-[#2f6b48] dark:bg-[#173125]"
                : "border-white/[0.8] bg-white/[0.85] dark:border-white/25 dark:bg-white/15"
              : actualSeconds > 0
                ? "border-[#cfe8db] bg-[#eef8f2] dark:border-[#2f6b48] dark:bg-[#173125]"
                : "border-[var(--border-soft)] bg-[var(--surface-muted)] opacity-70 dark:border-white/10 dark:bg-white/[0.06]"
          }`}
        >
          <div
            className="absolute bottom-0 left-0 w-full rounded-md transition-all duration-500"
            style={{
              backgroundColor: fillColor,
              height: actualFillHeight,
            }}
          />
        </div>
      </div>
      <span className={`text-[11px] font-black leading-none ${isOver ? "text-[#32734c] dark:text-[#9bd7b4]" : "text-[var(--text-muted)]"}`}>{label}</span>
    </div>
  );
}

export function FocusGoalsPanel({
  activeSessions,
  adjustments,
  categories,
  history,
}: {
  activeSessions: Record<string, ActiveFocusSession>;
  adjustments: FocusDailyGoalAdjustment[];
  categories: FocusCategory[];
  history: HistoricalFocusSession[];
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);
  const plan = useMemo(() => buildFocusGoalPlan({ adjustments, categories, history }), [adjustments, categories, history]);
  const recommended = plan.recommendedCategoryId
    ? plan.summaries.find((summary) => summary.category.id === plan.recommendedCategoryId)
    : null;
  const sortedSummaries = useMemo(
    () =>
      plan.summaries
        .map((summary, index) => ({ index, summary }))
        .sort((left, right) => {
          const priorityDifference = right.summary.priorityLevel - left.summary.priorityLevel;
          if (priorityDifference !== 0) return priorityDifference;

          const remainingDifference = remainingTodaySeconds(right.summary) - remainingTodaySeconds(left.summary);
          if (remainingDifference !== 0) return remainingDifference;

          return left.index - right.index;
        })
        .map(({ summary }) => summary),
    [plan.summaries],
  );
  const activeWarnings = Object.values(activeSessions)
    .map((session) => {
      const summary = plan.summaries.find((candidate) => candidate.category.id === session.categoryId);
      if (!summary) return null;
      const elapsed = session.isRunning && session.startTime ? Math.floor((now - session.startTime) / 1000) : 0;
      const projectedToday = summary.todayActualSeconds + session.accumulatedSeconds + elapsed;
      if (projectedToday > summary.adjustedTodayTargetSeconds && summary.adjustedTodayTargetSeconds > 0) {
        return `${summary.category.title} is over today’s target. ${recommended ? `Next: ${recommended.category.title}.` : ""}`;
      }
      if (projectedToday > summary.adjustedTodayTargetSeconds * 0.85 && summary.adjustedTodayTargetSeconds > 0) {
        return `${summary.category.title} is nearing today’s target.`;
      }
      return null;
    })
    .filter((warning): warning is string => Boolean(warning));
  if (categories.length === 0) {
    return null;
  }

  const productiveTodaySatisfied = plan.productiveTodayTargetSeconds > 0 && plan.productiveTodaySeconds >= plan.productiveTodayTargetSeconds;
  const productiveWeekSatisfied = plan.productiveWeekTargetSeconds > 0 && plan.productiveWeekSeconds >= plan.productiveWeekTargetSeconds;

  return (
    <section className="mx-auto mt-5 w-full max-w-[86rem] px-3 sm:px-0">
      <div className="rounded-[1.35rem] border border-[#ebe4fb] bg-white/82 p-4 text-center shadow-[0_14px_34px_rgba(81,61,168,0.08)] dark:border-white/10 dark:bg-white/[0.05]">
        <div className="flex flex-col items-center gap-1">
          <h2 className="text-lg font-black text-[var(--text-primary)]">Focus Goals</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {formatCompactDateRange(plan.weekStartDate, plan.weekEndDate)}
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_1.4fr]">
          <div className="rounded-[1rem] border border-[#e9e2f6] bg-white/82 p-3 dark:border-white/10 dark:bg-white/[0.05]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Recommended Now</p>
            <p className="mt-2 text-base font-black text-[var(--text-primary)]">{recommended?.category.title ?? "No category behind"}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{plan.recommendationReason}</p>
            {plan.todayOverCapacitySeconds > 0 ? (
              <span className="mt-3 inline-flex rounded-full border border-[#f4d4bb] bg-[#fff7ed] px-2 py-1 text-[13px] font-medium leading-none text-[#9a5a22] dark:border-[#70451f] dark:bg-[#2a1c12] dark:text-[#f4bd82]">
                Today over capacity by {formatFocusGoalDuration(plan.todayOverCapacitySeconds)}
              </span>
            ) : null}
            {activeWarnings.map((warning) => (
              <p className="mt-2 text-sm font-semibold text-[#8a5b17] dark:text-[#f0c476]" key={warning}>{warning}</p>
            ))}
          </div>

          <div className="rounded-[1rem] border border-[#e9e2f6] bg-white/82 p-3 dark:border-white/10 dark:bg-white/[0.05]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Productive Totals</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Sleep excluded</p>
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 flex justify-between gap-2 text-xs font-medium text-[var(--text-secondary)]">
                  <span>Productive Today</span>
                  <span>{formatFocusGoalDuration(plan.productiveTodaySeconds)} / {formatFocusGoalDuration(plan.productiveTodayBaseTargetSeconds)}</span>
                </div>
                <ProgressBar
                  actualSeconds={plan.productiveTodaySeconds}
                  satisfied={productiveTodaySatisfied}
                  targetSeconds={plan.productiveTodayBaseTargetSeconds}
                />
                {plan.productiveTodayReallocatedSeconds > 0 ? (
                  <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">{formatFocusGoalDuration(plan.productiveTodayReallocatedSeconds)} reallocated across categories today</p>
                ) : null}
                <p className="mt-1 text-[11px] font-medium text-[var(--text-muted)]">
                  Sleep excluded: {formatFocusGoalDuration(plan.productiveTodayExcludedSleepSeconds)} · Unproductive excluded: {formatFocusGoalDuration(plan.productiveTodayExcludedUnproductiveSeconds)} · Productive categories counted: {plan.productiveTodayCategoryCount}
                </p>
              </div>
              <div>
                <div className="mb-1 flex justify-between gap-2 text-xs font-medium text-[var(--text-secondary)]">
                  <span>Productive Weekly</span>
                  <span>{formatFocusGoalDuration(plan.productiveWeekSeconds)} / {formatFocusGoalDuration(plan.productiveWeekBaseTargetSeconds)}</span>
                </div>
                <ProgressBar
                  actualSeconds={plan.productiveWeekSeconds}
                  satisfied={productiveWeekSatisfied}
                  targetSeconds={plan.productiveWeekBaseTargetSeconds}
                />
                {plan.productiveNextWeekCreditPreviewSeconds > 0 ? (
                  <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">Next week credit preview {formatFocusGoalDuration(plan.productiveNextWeekCreditPreviewSeconds)}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <h3 className="text-sm font-black text-[var(--text-primary)]">Category Goals</h3>
            <div className="flex items-center gap-3 text-[11px] font-bold text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#7c68f1]" /> Logged</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#d7ccef]" /> Target</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {sortedSummaries.map((summary) => {
              const isSatisfiedToday =
                summary.adjustedTodayTargetSeconds > 0 &&
                summary.todayActualSeconds >= summary.adjustedTodayTargetSeconds;
              const labels = statusLabels(summary);
              return (
                <div
                  className={`rounded-[var(--radius-card)] border px-3 py-2.5 dark:border-white/10 ${
                    isSatisfiedToday
                      ? "border-[#cfe8db] bg-[#f1faf5] dark:bg-[#123024]/45"
                      : "border-[var(--border-soft)] bg-white/82 dark:bg-white/[0.05]"
                  }`}
                  key={summary.category.id}
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(11rem,0.72fr)_minmax(0,1.28fr)] lg:items-center">
                    <div className="flex min-w-0 flex-col justify-center">
                      <p className="text-sm font-bold leading-snug text-[var(--text-primary)]">{summary.category.title}</p>
                      <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                        {formatPriorityLabel(summary.priorityLevel)}
                      </p>
                      <p className="mt-1 text-xs leading-snug text-[var(--text-secondary)]">
                        {typeLine(summary)}
                        {isSleepCategory(summary.category) ? " · Excluded from productive totals" : ""}
                      </p>
                      <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">
                        {targetText("Today", summary)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">
                        {weeklyTargetText(summary)}
                      </p>
                      {summary.incomingCarryoverCreditSeconds > 0 ? (
                        <p className="mt-1 text-xs font-semibold text-[#6b5ab8] dark:text-[#b9a9ff]">
                          Incoming credit: {formatFocusGoalDuration(summary.incomingCarryoverCreditSeconds)}
                        </p>
                      ) : null}
                      {summary.outgoingCarryoverCreditSeconds > 0 ? (
                        <p className="mt-1 text-xs font-semibold text-[#32734c] dark:text-[#9bd7b4]">
                          Next week credit preview: {formatFocusGoalDuration(summary.outgoingCarryoverCreditSeconds)}
                        </p>
                      ) : null}
                      {labels.length ? (
                        <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">
                          <span className="text-[var(--text-muted)]">Status: </span>
                          {labels.map((item, index) => (
                            <span className={statusTextClass(item.tone)} key={item.label}>
                              {index > 0 ? " · " : ""}
                              {item.label}
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="overflow-hidden rounded-[0.9rem] border border-[#eee8f7] bg-white/82 px-1.5 py-2 dark:border-white/10 dark:bg-white/[0.05]">
                        <div className="grid w-full min-w-0 grid-cols-[repeat(7,minmax(0,1fr))_minmax(2.4rem,1.08fr)] justify-start gap-1">
                          {summary.dailySummaries.map((day, index) => (
                            <GoalColumn
                              actualSeconds={day.actualSeconds}
                              color={summary.category.color}
                              key={day.date}
                              label={["M", "T", "W", "T", "F", "S", "S"][index] ?? day.weekdayKey.slice(0, 1).toUpperCase()}
                              targetSeconds={day.adjustedTargetSeconds}
                            />
                          ))}
                          <GoalColumn
                            actualSeconds={summary.weekActualSeconds}
                            className="border-l border-[#eee8f7] pl-1 dark:border-white/10"
                            color={summary.category.color}
                            label="Wk"
                            targetSeconds={summary.baseWeeklyTargetSeconds}
                          />
                        </div>
                      </div>
                      {summary.weeklyPaceBehindSeconds > 0 ? (
                        <p className="mt-2 text-xs font-semibold text-[#9a5a22] dark:text-[#f4bd82]">
                          Behind weekly pace by {formatFocusGoalDuration(summary.weeklyPaceBehindSeconds)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

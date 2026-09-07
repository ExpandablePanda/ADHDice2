import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ActiveFocusSession, FocusCategory, FocusDailyGoalAdjustment, FocusReallocationMode, HistoricalFocusSession, PendingFocusDailySurplus } from "@/lib/types";
import {
  buildFocusGoalMonthPlan,
  buildFocusGoalPlan,
  formatFocusGoalDuration,
  formatPriorityLabel,
  isSleepCategory,
  resolveCountsTowardProductiveGoal,
  type FocusGoalCategorySummary,
} from "@/lib/focus-goals";
import {
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_CHIP_BASE_CLASS,
  TaskTableChipButton,
} from "./ui/task-table-primitives";
import { AdhdChip } from "./ui-system";
import { PageShellBody, PageShellSurface } from "./ui-system/reorderable-page-shells";
import { shouldShowManualDailySurplusAction } from "@/lib/focus-reallocation";

type FocusGoalScope = "daily" | "weekly" | "monthly";

const FOCUS_GOAL_OUTLINE_CHIP_CLASS = "border-[#e4deef] bg-[var(--surface-elevated)] text-[#68738c] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60";
const GOAL_COLUMN_TEXT_CLASS = "text-sm font-semibold";

function getConnectedGoalChipClass(index: number, total: number) {
  const overlapClass = index > 0 ? "-ml-px" : "";
  const shapeClass = index === 0
    ? "rounded-r-none"
    : index === total - 1
      ? "rounded-l-none"
      : "rounded-none";
  return `${overlapClass} ${shapeClass}`;
}

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

function goalProgressGroup(actualSeconds: number, targetSeconds: number) {
  if (targetSeconds > 0 && actualSeconds >= targetSeconds) return 0;
  if (actualSeconds > 0) return 1;
  return 2;
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
  const fillColor = isAtGoal || (!hasGoal && actualSeconds > 0) ? "#67b982" : color ?? "#7c68f1";
  return (
    <div className={`flex min-w-0 flex-col items-center justify-end gap-1 ${className}`}>
      <span className={`${GOAL_COLUMN_TEXT_CLASS} w-full whitespace-nowrap text-center text-[var(--text-primary)]`}>
        {formatFocusGoalDuration(actualSeconds)}
      </span>
      <span className={`${GOAL_COLUMN_TEXT_CLASS} w-full whitespace-nowrap text-center text-[var(--text-muted)]`}>
        {hasGoal ? formatFocusGoalDuration(targetSeconds) : "No goal"}
      </span>
      <div className="flex h-28 w-full min-w-0 items-end justify-center">
        <div className="relative h-full w-full max-w-[2.5rem] overflow-hidden rounded-md bg-[var(--surface-muted)] shadow-inner sm:max-w-[3rem] dark:bg-white/[0.06]">
          <div
            className="absolute bottom-0 left-0 w-full rounded-md transition-all duration-500"
            style={{
              backgroundColor: fillColor,
              height: actualFillHeight,
            }}
          />
        </div>
      </div>
      <span
        className={`${GOAL_COLUMN_TEXT_CLASS} flex h-11 w-full items-start justify-center whitespace-normal break-words pt-2 text-center leading-tight text-black dark:text-white`}
        title={label}
      >
        {label}
      </span>
    </div>
  );
}

export function FocusGoalsPanel({
  activeSessions,
  adjustments,
  categories,
  focusReallocationMode,
  history,
  onOpenDailyGoalSurplus,
  onSetFocusReallocationMode,
  manualDailySurplusOpportunity,
}: {
  activeSessions: Record<string, ActiveFocusSession>;
  adjustments: FocusDailyGoalAdjustment[];
  categories: FocusCategory[];
  focusReallocationMode: FocusReallocationMode;
  history: HistoricalFocusSession[];
  onOpenDailyGoalSurplus: () => void;
  onSetFocusReallocationMode: (mode: FocusReallocationMode) => void;
  manualDailySurplusOpportunity: PendingFocusDailySurplus | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [scope, setScope] = useState<FocusGoalScope>("daily");
  const [selectedCategoryId, setSelectedCategoryId] = useState("overview");
  const [categorySearch, setCategorySearch] = useState("");
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);
  const plan = useMemo(() => buildFocusGoalPlan({ adjustments, categories, history }), [adjustments, categories, history]);
  const monthPlan = useMemo(() => buildFocusGoalMonthPlan({
    adjustments,
    categories,
    history,
    monthDate: plan.todayDate,
  }), [adjustments, categories, history, plan.todayDate]);
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
  const categoryChipSummaries = useMemo(
    () => [...plan.summaries].sort((left, right) => left.category.title.localeCompare(right.category.title, undefined, { sensitivity: "base" })),
    [plan.summaries],
  );
  const filteredSummaries = useMemo(() => {
    const normalizedSearch = categorySearch.trim().toLowerCase();
    if (!normalizedSearch) return categoryChipSummaries;
    return categoryChipSummaries.filter((summary) => summary.category.title.toLowerCase().includes(normalizedSearch));
  }, [categoryChipSummaries, categorySearch]);
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
  const effectiveSelectedCategoryId = selectedCategoryId === "overview" || categories.some((category) => category.id === selectedCategoryId)
    ? selectedCategoryId
    : "overview";
  const productiveMonthSummaries = monthPlan.summaries.filter((summary) => resolveCountsTowardProductiveGoal(summary.category) && !isSleepCategory(summary.category));
  const productiveMonthActualSeconds = productiveMonthSummaries.reduce((total, summary) => total + summary.actualSeconds, 0);
  const productiveMonthTargetSeconds = productiveMonthSummaries.reduce((total, summary) => total + summary.targetSeconds, 0);
  const selectedSummary = sortedSummaries.find((summary) => summary.category.id === effectiveSelectedCategoryId) ?? null;
  const selectedMonthSummary = monthPlan.summaries.find((summary) => summary.category.id === effectiveSelectedCategoryId) ?? null;
  const rankedOverviewSummaries = sortedSummaries
    .map((summary, index) => {
      const monthSummary = monthPlan.summaries.find((candidate) => candidate.category.id === summary.category.id);
      const actualSeconds = scope === "daily"
        ? summary.todayActualSeconds
        : scope === "weekly"
          ? summary.weekActualSeconds
          : monthSummary?.actualSeconds ?? 0;
      const targetSeconds = scope === "daily"
        ? summary.adjustedTodayTargetSeconds
        : scope === "weekly"
          ? summary.baseWeeklyTargetSeconds
          : monthSummary?.targetSeconds ?? 0;
      return { actualSeconds, index, summary, targetSeconds };
    })
    .sort((left, right) => {
      const leftGroup = goalProgressGroup(left.actualSeconds, left.targetSeconds);
      const rightGroup = goalProgressGroup(right.actualSeconds, right.targetSeconds);
      if (leftGroup !== rightGroup) return leftGroup - rightGroup;
      if (leftGroup === 2) return right.targetSeconds - left.targetSeconds || left.index - right.index;
      return right.actualSeconds - left.actualSeconds || left.index - right.index;
    });
  const overviewActualSeconds = scope === "daily"
    ? plan.productiveTodaySeconds
    : scope === "weekly"
      ? plan.productiveWeekSeconds
      : productiveMonthActualSeconds;
  const overviewTargetSeconds = scope === "daily"
    ? plan.productiveTodayTargetSeconds
    : scope === "weekly"
      ? plan.productiveWeekTargetSeconds
      : productiveMonthTargetSeconds;
  const selectedActualSeconds = selectedSummary
    ? scope === "daily"
      ? selectedSummary.todayActualSeconds
      : scope === "weekly"
        ? selectedSummary.weekActualSeconds
        : selectedMonthSummary?.actualSeconds ?? 0
    : 0;
  const selectedTargetSeconds = selectedSummary
    ? scope === "daily"
      ? selectedSummary.adjustedTodayTargetSeconds
      : scope === "weekly"
        ? selectedSummary.baseWeeklyTargetSeconds
        : selectedMonthSummary?.targetSeconds ?? 0
    : 0;
  const selectedBars = selectedSummary
    ? scope === "daily"
      ? [{ actualSeconds: selectedSummary.todayActualSeconds, label: "Today", targetSeconds: selectedSummary.adjustedTodayTargetSeconds }]
      : scope === "weekly"
        ? [
            ...selectedSummary.dailySummaries.map((day, index) => ({
              actualSeconds: day.actualSeconds,
              label: ["M", "T", "W", "T", "F", "S", "S"][index] ?? day.weekdayKey.slice(0, 1).toUpperCase(),
              targetSeconds: day.adjustedTargetSeconds,
            })),
            { actualSeconds: selectedSummary.weekActualSeconds, label: "Week", targetSeconds: selectedSummary.baseWeeklyTargetSeconds },
          ]
        : [
            ...(selectedMonthSummary?.buckets.map((bucket, index) => ({
              actualSeconds: bucket.actualSeconds,
              label: `W${index + 1}`,
              targetSeconds: bucket.targetSeconds,
            })) ?? []),
            { actualSeconds: selectedMonthSummary?.actualSeconds ?? 0, label: "Month", targetSeconds: selectedMonthSummary?.targetSeconds ?? 0 },
          ]
    : [];
  const rangeLabel = scope === "daily"
    ? formatCompactDateRange(plan.todayDate, plan.todayDate)
    : scope === "weekly"
      ? formatCompactDateRange(plan.weekStartDate, plan.weekEndDate)
      : formatCompactDateRange(monthPlan.startDate, monthPlan.endDate);

  return (
    <PageShellSurface className="mx-auto w-full max-w-6xl rounded-[var(--radius-modal)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.03]">
        <div className="shrink-0 px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Focus Goals</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--text-primary)]">Goal Progress</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{rangeLabel} • {scope} targets</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start">
                <div aria-label="Focus goal range" className="inline-flex items-center" role="group">
                  {(["daily", "weekly", "monthly"] as const).map((value, index, items) => (
                    <TaskTableChipButton
                      aria-pressed={scope === value}
                      className={getConnectedGoalChipClass(index, items.length)}
                      key={value}
                      onClick={() => setScope(value)}
                      toneClassName={scope === value ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : FOCUS_GOAL_OUTLINE_CHIP_CLASS}
                    >
                      {value[0].toUpperCase() + value.slice(1)}
                    </TaskTableChipButton>
                  ))}
                </div>
                <div aria-label="Focus reallocation mode" className="inline-flex items-center" role="group">
                  <span className="mr-1 text-xs font-semibold text-[var(--text-muted)]">Reallocation</span>
                  {(["manual", "automatic"] as const).map((mode, index, modes) => (
                    <AdhdChip
                      aria-pressed={focusReallocationMode === mode}
                      className={getConnectedGoalChipClass(index, modes.length)}
                      key={mode}
                      onClick={() => onSetFocusReallocationMode(mode)}
                      selected={focusReallocationMode === mode}
                    >
                      {mode[0].toUpperCase() + mode.slice(1)}
                    </AdhdChip>
                  ))}
                </div>
                {shouldShowManualDailySurplusAction(focusReallocationMode, manualDailySurplusOpportunity) ? (
                  <AdhdChip onClick={onOpenDailyGoalSurplus} tone="purple">
                    Reallocate
                  </AdhdChip>
                ) : null}
              </div>
            </div>
            <div aria-label="Focus goal category" className="adhdice-scrollbar flex max-w-full items-center gap-2 overflow-x-auto pb-1" role="group">
              <label className={`${TASK_TABLE_CHIP_BASE_CLASS} gap-1.5 ${FOCUS_GOAL_OUTLINE_CHIP_CLASS}`}>
                <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#6f57f6] dark:text-[#c9bbff]" />
                <input
                  aria-label="Search focus goal categories"
                  className="w-36 bg-transparent text-[13px] font-medium leading-none text-[#68738c] outline-none placeholder:text-[#9b92be] dark:text-white/60 dark:placeholder:text-white/35"
                  onChange={(event) => setCategorySearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setCategorySearch("");
                  }}
                  placeholder="Search categories"
                  type="search"
                  value={categorySearch}
                />
              </label>
              <TaskTableChipButton
                aria-pressed={effectiveSelectedCategoryId === "overview"}
                onClick={() => setSelectedCategoryId("overview")}
                toneClassName={effectiveSelectedCategoryId === "overview" ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : FOCUS_GOAL_OUTLINE_CHIP_CLASS}
              >
                Overview
              </TaskTableChipButton>
              {filteredSummaries.map((summary) => (
                <TaskTableChipButton
                  aria-pressed={effectiveSelectedCategoryId === summary.category.id}
                  key={summary.category.id}
                  onClick={() => setSelectedCategoryId(summary.category.id)}
                  toneClassName={effectiveSelectedCategoryId === summary.category.id ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : FOCUS_GOAL_OUTLINE_CHIP_CLASS}
                >
                  {summary.category.title}
                </TaskTableChipButton>
              ))}
              {categorySearch.trim() && filteredSummaries.length === 0 ? (
                <span className="shrink-0 text-[13px] font-medium text-[var(--text-muted)]">No categories found</span>
              ) : null}
            </div>
          </div>
        </div>

        <PageShellBody className="px-5 pb-5 sm:px-6 sm:pb-6">
          {selectedSummary ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-secondary)]">{formatPriorityLabel(selectedSummary.priorityLevel)} • {typeLine(selectedSummary)}</p>
                  <h3 className="mt-1 text-3xl font-black tracking-tight text-[var(--text-primary)]">{selectedSummary.category.title}</h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {isSleepCategory(selectedSummary.category) ? "Excluded from productive totals" : selectedSummary.countsTowardProductiveGoal ? "Included in productive totals" : "Excluded from productive totals"}
                  </p>
                </div>
                <div className="text-left lg:text-right">
                  <p className="text-4xl font-bold tracking-tighter text-[var(--text-primary)]">{formatFocusGoalDuration(selectedActualSeconds)}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">of {formatFocusGoalDuration(selectedTargetSeconds)} {scope} goal</p>
                </div>
              </div>
              <ProgressBar actualSeconds={selectedActualSeconds} satisfied={selectedTargetSeconds > 0 && selectedActualSeconds >= selectedTargetSeconds} targetSeconds={selectedTargetSeconds} />
              <div className="adhdice-scrollbar min-w-0 overflow-x-auto pb-2">
                <div className="flex min-w-max items-end justify-center gap-4 px-2 sm:gap-6">
                  {selectedBars.map((bar, index) => (
                    <GoalColumn
                      actualSeconds={bar.actualSeconds}
                      className="w-14"
                      color={selectedSummary.category.color}
                      key={`${scope}-${index}`}
                      label={bar.label}
                      targetSeconds={bar.targetSeconds}
                    />
                  ))}
                </div>
              </div>
              <div className="adhdice-scrollbar flex flex-nowrap items-center gap-4 overflow-x-auto pb-1 text-sm text-[var(--text-secondary)]">
                <p className="shrink-0">{targetText("Today", selectedSummary)}</p>
                <p className="shrink-0">{weeklyTargetText(selectedSummary)}</p>
                {selectedSummary.weeklyPaceBehindSeconds > 0 ? <p className="shrink-0 font-semibold text-[#9a5a22] dark:text-[#f4bd82]">Behind weekly pace by {formatFocusGoalDuration(selectedSummary.weeklyPaceBehindSeconds)}</p> : null}
                {selectedSummary.incomingCarryoverCreditSeconds > 0 ? <p className="shrink-0 font-semibold text-[#6b5ab8] dark:text-[#b9a9ff]">Incoming credit: {formatFocusGoalDuration(selectedSummary.incomingCarryoverCreditSeconds)}</p> : null}
                {selectedSummary.outgoingCarryoverCreditSeconds > 0 ? <p className="shrink-0 font-semibold text-[#32734c] dark:text-[#9bd7b4]">Next week credit preview: {formatFocusGoalDuration(selectedSummary.outgoingCarryoverCreditSeconds)}</p> : null}
                {statusLabels(selectedSummary).length ? (
                  <p className="shrink-0"><span className="text-[var(--text-muted)]">Status: </span>{statusLabels(selectedSummary).map((item, index) => <span className={statusTextClass(item.tone)} key={item.label}>{index > 0 ? " · " : ""}{item.label}</span>)}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Productive Totals</p>
                  <p className="mt-2 text-5xl font-bold tracking-tighter text-[var(--text-primary)]">{formatFocusGoalDuration(overviewActualSeconds)}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">of {formatFocusGoalDuration(overviewTargetSeconds)} • Sleep excluded</p>
                </div>
                <div className="max-w-xl lg:text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Recommended Now</p>
                  <p className="mt-2 text-xl font-black text-[var(--text-primary)]">{recommended?.category.title ?? "No category behind"}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{plan.recommendationReason}</p>
                </div>
              </div>
              <ProgressBar
                actualSeconds={overviewActualSeconds}
                satisfied={scope === "daily" ? productiveTodaySatisfied : scope === "weekly" ? productiveWeekSatisfied : productiveMonthTargetSeconds > 0 && productiveMonthActualSeconds >= productiveMonthTargetSeconds}
                targetSeconds={overviewTargetSeconds}
              />
              <div aria-label="Category progress ranked by total time" className="adhdice-scrollbar min-w-0 overflow-x-auto pb-2">
                <div className="flex min-w-max items-start gap-6 px-2 sm:gap-8">
                  {rankedOverviewSummaries.map(({ actualSeconds, summary, targetSeconds }) => (
                    <GoalColumn
                      actualSeconds={actualSeconds}
                      className="w-28"
                      color={summary.category.color}
                      key={summary.category.id}
                      label={summary.category.title}
                      targetSeconds={targetSeconds}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                {scope === "daily" ? <p>Sleep excluded: {formatFocusGoalDuration(plan.productiveTodayExcludedSleepSeconds)} • Unproductive excluded: {formatFocusGoalDuration(plan.productiveTodayExcludedUnproductiveSeconds)} • Productive categories counted: {plan.productiveTodayCategoryCount}</p> : null}
                {scope === "daily" && plan.productiveTodayReallocatedSeconds > 0 ? <p>{formatFocusGoalDuration(plan.productiveTodayReallocatedSeconds)} reallocated across categories today</p> : null}
                {scope === "weekly" && plan.productiveNextWeekCreditPreviewSeconds > 0 ? <p>Next week credit preview {formatFocusGoalDuration(plan.productiveNextWeekCreditPreviewSeconds)}</p> : null}
                {scope === "monthly" ? <p>{productiveMonthSummaries.length} productive categories counted across the calendar month.</p> : null}
                {plan.todayOverCapacitySeconds > 0 ? <p className="font-semibold text-[#9a5a22] dark:text-[#f4bd82]">Today over capacity by {formatFocusGoalDuration(plan.todayOverCapacitySeconds)}</p> : null}
                {activeWarnings.map((warning) => <p className="font-semibold text-[#8a5b17] dark:text-[#f0c476]" key={warning}>{warning}</p>)}
              </div>
            </div>
          )}
        </PageShellBody>
    </PageShellSurface>
  );
}

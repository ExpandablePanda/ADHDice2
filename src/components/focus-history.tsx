import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { ModalShell } from "./modal-shell";
import { FocusPillSelect, FocusSuggestionInput } from "./focus-form-controls";
import {
  TaskTableChipButton,
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
} from "@/components/ui/task-table-primitives";
import { attachDailyOverallGoalSeconds } from "@/lib/focus-activity";
import { isSleepCategory } from "@/lib/focus-goals";
import { type FocusCategory, type HistoricalFocusSession, type FocusLabelOptions, type FocusSubtype, type FocusType } from "@/lib/types";
import { formatLocalDate } from "@/lib/utils";

type TimeScope = "daily" | "weekly" | "monthly";

type ScopeRange = {
  start: string;
  end: string;
  label: string;
  heading: string;
};

type GoalRow = {
  category: FocusCategory;
  actualSeconds: number;
  goalSeconds: number;
  completionRatio: number;
  expectedSeconds: number;
  previousDeltaLabel: string | null;
  shortfallScore: number;
  status: GoalStatus;
};

type GoalStatus = "behind" | "on pace" | "complete" | "no goal";

type PeriodStats = {
  actualByCategory: Record<string, number>;
  averageSessionSeconds: number;
  goalCompletionRate: number | null;
  headlineTotalSeconds: number;
  sessions: HistoricalFocusSession[];
  topCategory: { category: FocusCategory; seconds: number } | null;
  totalSeconds: number;
};

type DeltaTone = "positive" | "negative" | "neutral";

type DeltaChip = {
  label: string;
  tone: DeltaTone;
};

type OverviewMetric = {
  label: string;
  value: string;
  delta: DeltaChip | null;
};

type DistributionBar = {
  color?: string;
  goalSeconds?: number;
  key: string;
  label: string;
  shortLabel: string;
  seconds: number;
};

type ActivityLineBucket = {
  key: string;
  label: string;
  sessions: HistoricalFocusSession[];
};

type ActivityLinePoint = {
  key: string;
  label: string;
  seconds: number;
};

type ActivityLineSeries = {
  color: string;
  key: string;
  label: string;
  points: ActivityLinePoint[];
  totalSeconds: number;
};

type InteractiveActivityPoint = {
  color: string;
  key: string;
  label: string;
  pointLabel: string;
  pointKey: string;
  seconds: number;
  x: number;
  y: number;
};

type CategoryBreakdownRow = {
  color: string;
  detail: string;
  key: string;
  seconds: number;
  shareRatio: number;
  title: string;
  widthRatio: number;
};

type ActivityTrendSummary = {
  deltaLabel: string;
  tone: DeltaTone;
};

type ActivityDataPoint = {
  color?: string;
  day: string;
  goalSeconds: number;
  seconds: number;
  label: string;
};

type ActivitySummaryMode = "overall" | "categories";

type ActivityRangeOption = {
  date: string;
  entryCount: number;
  hint: string;
  isSelected: boolean;
  label: string;
  totalSeconds: number;
};

type FocusHistoryDerived = {
  averageSessionSeconds: number;
  activityCategoryBars: DistributionBar[];
  activityLineSeries: ActivityLineSeries[];
  activityOverallBars: DistributionBar[];
  activityTrend: ActivityTrendSummary | null;
  categorizedSeconds: number;
  categoryBreakdownRows: CategoryBreakdownRow[];
  goalCompletionRate: number | null;
  goalRows: GoalRow[];
  goalSummary: {
    behind: number;
    complete: number;
    goalCount: number;
    noGoal: number;
  };
  overviewMetrics: OverviewMetric[];
  scopedSessionCount: number;
  sessionsByDate: HistoricalFocusSession[];
  topCategory: { category: FocusCategory; seconds: number } | null;
  totalScopedSeconds: number;
};

const FOCUS_ACTIVITY_OUTLINE_CHIP_CLASS = "border-[#e4deef] bg-[var(--surface-elevated)] text-[#68738c] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60";
const FOCUS_ACTIVITY_GOALS_CHIP_CLASS = "border-[#e8defe] bg-[var(--surface-elevated)] text-[#7762f3] dark:border-[#3a2e63] dark:bg-white/[0.03] dark:text-[#c7bcff]";

function todayLocalISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftLocalISODate(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function startOfMonthISO(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(1);
  return formatLocalDate(date);
}

function endOfMonthISO(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  date.setMonth(date.getMonth() + 1, 0);
  return formatLocalDate(date);
}

function daysInMonthForISO(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function shiftScopeDate(scope: TimeScope, iso: string, direction: number) {
  if (scope === "daily") {
    return shiftLocalISODate(iso, direction);
  }

  if (scope === "weekly") {
    return shiftLocalISODate(iso, direction * 7);
  }

  const date = new Date(`${iso}T12:00:00`);
  date.setMonth(date.getMonth() + direction, 1);
  return formatLocalDate(date);
}

function formatMonthLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00`));
}

function formatDisplayDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

function formatWeekdayLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(new Date(`${iso}T12:00:00`));
}

function formatActivityRangeOptionLabel(scope: TimeScope, optionDate: string, range: ScopeRange) {
  if (scope === "daily") {
    return `${formatDisplayDate(optionDate)}, ${formatWeekdayLabel(optionDate)}`;
  }

  return range.label;
}

function getScopeRange(scope: TimeScope, currentDate: string): ScopeRange {
  if (scope === "daily") {
    return {
      start: currentDate,
      end: currentDate,
      label: formatDisplayDate(currentDate),
      heading: "Focus Dashboard",
    };
  }

  if (scope === "weekly") {
    const start = shiftLocalISODate(currentDate, -6);
    return {
      start,
      end: currentDate,
      label: `${formatDisplayDate(start)} – ${formatDisplayDate(currentDate)}`,
      heading: "Focus Dashboard",
    };
  }

  return {
    start: startOfMonthISO(currentDate),
    end: endOfMonthISO(currentDate),
    label: formatMonthLabel(currentDate),
    heading: "Focus Dashboard",
  };
}

function getPreviousScopeRange(scope: TimeScope, currentDate: string) {
  return getScopeRange(scope, shiftScopeDate(scope, currentDate, -1));
}

function getGoalSeconds(category: FocusCategory, scope: TimeScope, currentDate: string) {
  if (scope === "daily") {
    return category.dailyGoalSeconds ?? 0;
  }

  if (scope === "weekly") {
    return category.weeklyGoalSeconds ?? (category.dailyGoalSeconds ? category.dailyGoalSeconds * 7 : 0);
  }

  const daysInMonth = daysInMonthForISO(currentDate);
  if (category.dailyGoalSeconds) {
    return category.dailyGoalSeconds * daysInMonth;
  }
  if (category.weeklyGoalSeconds) {
    return Math.round((category.weeklyGoalSeconds / 7) * daysInMonth);
  }
  return 0;
}

function getTotalGoalSeconds(categories: FocusCategory[], scope: TimeScope, currentDate: string) {
  return categories.reduce((sum, category) => sum + getGoalSeconds(category, scope, currentDate), 0);
}

function getCompletionRatio(actualSeconds: number, goalSeconds: number) {
  if (goalSeconds <= 0) {
    return 0;
  }

  return actualSeconds / goalSeconds;
}

function getExpectedGoalSeconds(goalSeconds: number, scope: TimeScope, range: ScopeRange) {
  if (goalSeconds <= 0) {
    return 0;
  }

  const today = todayLocalISO();
  if (today < range.start) {
    return 0;
  }
  if (today > range.end) {
    return goalSeconds;
  }

  if (scope === "daily") {
    const now = new Date();
    const elapsedSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    return goalSeconds * Math.min(1, Math.max(0, elapsedSeconds / 86400));
  }

  const totalDays = Math.max(1, Math.round((new Date(`${range.end}T12:00:00`).getTime() - new Date(`${range.start}T12:00:00`).getTime()) / 86400000) + 1);
  const elapsedDays = Math.max(1, Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${range.start}T12:00:00`).getTime()) / 86400000) + 1);
  return goalSeconds * Math.min(1, elapsedDays / totalDays);
}

function getGoalStatus(actualSeconds: number, goalSeconds: number, expectedSeconds: number): GoalStatus {
  if (goalSeconds <= 0) {
    return "no goal";
  }
  if (actualSeconds >= goalSeconds) {
    return "complete";
  }
  return actualSeconds >= expectedSeconds ? "on pace" : "behind";
}

function formatGoalPair(actualSeconds: number, goalSeconds: number) {
  return goalSeconds > 0
    ? `${formatRoundedMinuteDuration(actualSeconds)} / ${formatRoundedMinuteDuration(goalSeconds)}`
    : `${formatRoundedMinuteDuration(actualSeconds)} / no goal`;
}

function formatEntriesHeading(scope: TimeScope, range: ScopeRange) {
  if (scope === "daily") {
    return `All Entries For ${range.start}`;
  }
  if (scope === "weekly") {
    return `All Entries For ${range.start} - ${range.end}`;
  }
  return `All Entries For ${range.label}`;
}

function getScopedSessions(history: HistoricalFocusSession[], range: ScopeRange) {
  return history.filter((session) => session.date >= range.start && session.date <= range.end);
}

function listDatesInRange(range: ScopeRange) {
  const dates: string[] = [];
  let cursor = range.start;

  while (cursor <= range.end) {
    dates.push(cursor);
    cursor = shiftLocalISODate(cursor, 1);
  }

  return dates;
}

function getActualByCategory(sessions: HistoricalFocusSession[]) {
  return sessions.reduce<Record<string, number>>((acc, session) => {
    if (!session.categoryId) {
      return acc;
    }
    acc[session.categoryId] = (acc[session.categoryId] || 0) + session.durationSeconds;
    return acc;
  }, {});
}

function getTopCategory(
  categories: FocusCategory[],
  actualByCategory: Record<string, number>,
) {
  return Object.entries(actualByCategory)
    .map(([categoryId, seconds]) => ({ category: categories.find((item) => item.id === categoryId), seconds }))
    .filter((item): item is { category: FocusCategory; seconds: number } => Boolean(item.category) && item.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds || a.category.title.localeCompare(b.category.title, undefined, { sensitivity: "base" }))[0] ?? null;
}

function getGoalCompletionRate(categories: FocusCategory[], actualByCategory: Record<string, number>, scope: TimeScope, currentDate: string) {
  const goals = categories
    .map((category) => ({
      actualSeconds: actualByCategory[category.id] ?? 0,
      goalSeconds: getGoalSeconds(category, scope, currentDate),
    }))
    .filter((row) => row.goalSeconds > 0);

  if (goals.length === 0) {
    return null;
  }

  const cappedActualSeconds = goals.reduce((sum, row) => sum + Math.min(row.actualSeconds, row.goalSeconds), 0);
  const totalGoalSeconds = goals.reduce((sum, row) => sum + row.goalSeconds, 0);
  return totalGoalSeconds > 0 ? cappedActualSeconds / totalGoalSeconds : null;
}

function getPeriodStats(categories: FocusCategory[], sessions: HistoricalFocusSession[], scope: TimeScope, currentDate: string): PeriodStats {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const headlineTotalSeconds = sessions.reduce((sum, session) => {
    const category = session.categoryId ? categoryById.get(session.categoryId) : null;
    return category && isSleepCategory(category) ? sum : sum + session.durationSeconds;
  }, 0);
  const actualByCategory = getActualByCategory(sessions);
  return {
    actualByCategory,
    averageSessionSeconds: sessions.length > 0 ? Math.round(totalSeconds / sessions.length) : 0,
    goalCompletionRate: getGoalCompletionRate(categories, actualByCategory, scope, currentDate),
    headlineTotalSeconds,
    sessions,
    topCategory: getTopCategory(categories, actualByCategory),
    totalSeconds,
  };
}

function formatSignedDurationDelta(deltaSeconds: number) {
  if (deltaSeconds === 0) {
    return "same as previous";
  }
  const prefix = deltaSeconds > 0 ? "+" : "-";
  return `${prefix}${formatRoundedMinuteDuration(Math.abs(deltaSeconds))}`;
}

function formatSignedCountDelta(delta: number, unit: string) {
  if (delta === 0) {
    return "same as previous";
  }
  const prefix = delta > 0 ? "+" : "-";
  const value = Math.abs(delta);
  return `${prefix}${value} ${unit}${value === 1 ? "" : "s"}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getRoundedMinuteCount(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const wholeMinutes = Math.floor(safeSeconds / 60);
  return wholeMinutes + (safeSeconds % 60 >= 30 ? 1 : 0);
}

function formatRoundedMinuteDuration(seconds: number) {
  const totalMinutes = getRoundedMinuteCount(seconds);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}`;
  }

  return `${totalMinutes}m`;
}

function getPreviousPeriodLabel(scope: TimeScope) {
  if (scope === "daily") {
    return "yesterday";
  }
  if (scope === "weekly") {
    return "last week";
  }
  return "last month";
}

function buildActivityTrendLabel(currentValue: number, previousValue: number, scope: TimeScope): ActivityTrendSummary {
  const previousPeriodLabel = getPreviousPeriodLabel(scope);
  if (previousValue <= 0) {
    return {
      deltaLabel: "No previous period logged",
      tone: "neutral",
    };
  }

  const deltaSeconds = currentValue - previousValue;
  if (deltaSeconds === 0) {
    return {
      deltaLabel: `No change from ${previousPeriodLabel}`,
      tone: "neutral",
    };
  }

  return {
    deltaLabel: `${formatRoundedMinuteDuration(Math.abs(deltaSeconds))} ${deltaSeconds > 0 ? "up" : "down"} from ${previousPeriodLabel}`,
    tone: deltaSeconds > 0 ? "positive" : "negative",
  };
}

function formatCompactDuration(seconds: number) {
  return formatRoundedMinuteDuration(seconds);
}

function formatActivityBarValue(seconds: number) {
  if (seconds <= 0) {
    return "0m";
  }

  return formatCompactDuration(seconds);
}

function getConnectedActivityChipClass(index: number, total: number) {
  const overlapClass = index > 0 ? "-ml-px" : "";
  const shapeClass = index === 0
    ? "rounded-r-none"
    : index === total - 1
      ? "rounded-l-none"
      : "rounded-none";
  return `${overlapClass} ${shapeClass}`;
}

function getActivityPickerOffsets(scope: TimeScope) {
  if (scope === "daily") {
    return { future: 14, past: 90 };
  }
  if (scope === "weekly") {
    return { future: 8, past: 52 };
  }
  return { future: 12, past: 36 };
}

function getActivityPickerAnchorDate(scope: TimeScope, currentDate: string) {
  return scope === "monthly" ? startOfMonthISO(currentDate) : currentDate;
}

function buildActivityRangeOptions(
  scope: TimeScope,
  currentDate: string,
  history: HistoricalFocusSession[],
): ActivityRangeOption[] {
  const { future, past } = getActivityPickerOffsets(scope);
  const anchorDate = getActivityPickerAnchorDate(scope, currentDate);

  return Array.from({ length: past + future + 1 }, (_, index) => {
    const offset = index - past;
    const optionDate = scope === "monthly"
      ? shiftScopeDate(scope, anchorDate, offset)
      : shiftScopeDate(scope, currentDate, offset);
    const range = getScopeRange(scope, optionDate);
    const sessions = getScopedSessions(history, range);
    const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
    const entryCount = sessions.length;
    return {
      date: optionDate,
      entryCount,
      hint: entryCount > 0
        ? `${entryCount} entr${entryCount === 1 ? "y" : "ies"} • ${formatRoundedMinuteDuration(totalSeconds)}`
        : "No entries",
      isSelected: optionDate === anchorDate,
      label: formatActivityRangeOptionLabel(scope, optionDate, range),
      totalSeconds,
    };
  });
}

function buildNumericDelta(currentValue: number, previousValue: number, formatter: (delta: number) => string): DeltaChip | null {
  if (previousValue <= 0) {
    return null;
  }
  const delta = currentValue - previousValue;
  return {
    label: formatter(delta),
    tone: delta > 0 ? "positive" : delta < 0 && currentValue > 0 ? "negative" : "neutral",
  };
}

function buildPreviousActualLabel(actualSeconds: number, previousActualSeconds: number | null) {
  if (previousActualSeconds === null) {
    return null;
  }
  return buildNumericDelta(actualSeconds, previousActualSeconds, formatSignedDurationDelta)?.label ?? null;
}

function formatDistributionDayLabel(date: string, scope: TimeScope) {
  const parsed = new Date(`${date}T12:00:00`);
  if (scope === "weekly") {
    return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(parsed);
  }

  return new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(parsed);
}

function formatDistributionSessionLabel(session: HistoricalFocusSession, index: number) {
  if (session.createdAt) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(session.createdAt));
  }

  return `S${index + 1}`;
}

function formatSessionAxisTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function getDayPeriod(value: Date) {
  const label = formatSessionAxisTime(value);
  const match = label.match(/\s(AM|PM)$/);
  return match?.[1] ?? "";
}

function trimDayPeriod(label: string) {
  return label.replace(/\s(AM|PM)$/, "");
}

function formatSessionAxisTimeRange(session: HistoricalFocusSession) {
  if (!session.createdAt) {
    return "";
  }

  const endTime = new Date(session.createdAt);
  const startTime = new Date(endTime.getTime() - session.durationSeconds * 1000);
  const startLabel = formatSessionAxisTime(startTime);
  const endLabel = formatSessionAxisTime(endTime);

  return getDayPeriod(startTime) === getDayPeriod(endTime)
    ? `${trimDayPeriod(startLabel)} - ${endLabel}`
    : `${startLabel} - ${endLabel}`;
}

function formatSessionAxisLabel(session: HistoricalFocusSession) {
  const labelParts = [
    session.title,
    session.focusSubtype,
    session.focusSubtype2,
    session.notes,
  ].map((part) => part?.trim()).filter(Boolean);
  const timeRange = formatSessionAxisTimeRange(session);

  return [...labelParts, timeRange].filter(Boolean).join(" • ");
}

function buildDistributionBars(
  sessions: HistoricalFocusSession[],
  scope: TimeScope,
  range: ScopeRange,
): DistributionBar[] {
  if (scope === "daily") {
    return [...sessions]
      .sort((a, b) => {
        const createdA = a.createdAt ?? "";
        const createdB = b.createdAt ?? "";
        if (createdA !== createdB) {
          return createdA.localeCompare(createdB);
        }
        return a.id.localeCompare(b.id);
      })
      .map((session, index) => {
        const axisLabel = formatSessionAxisLabel(session) || session.title || `Session ${index + 1}`;

        return {
          key: session.id,
          label: axisLabel,
          shortLabel: axisLabel || formatDistributionSessionLabel(session, index),
          seconds: session.durationSeconds,
        };
      });
  }

  const totalsByDate = sessions.reduce<Record<string, number>>((acc, session) => {
    acc[session.date] = (acc[session.date] ?? 0) + session.durationSeconds;
    return acc;
  }, {});

  return listDatesInRange(range).map((date) => ({
    key: date,
    label: date,
    shortLabel: formatDistributionDayLabel(date, scope),
    seconds: totalsByDate[date] ?? 0,
  }));
}

function buildCategoryBreakdownRows(
  categories: FocusCategory[],
  sessions: HistoricalFocusSession[],
  actualByCategory: Record<string, number>,
  totalSeconds: number,
): CategoryBreakdownRow[] {
  const rows = categories
    .map((category) => ({
      color: category.color || "var(--accent)",
      detail: [category.focusType, category.focusSubtype, category.focusSubtype2].filter(Boolean).join(" / ") || "Saved category",
      key: category.id,
      seconds: actualByCategory[category.id] ?? 0,
      title: category.title,
    }))
    .filter((row) => row.seconds > 0);

  const uncategorizedSeconds = sessions.reduce((sum, session) => (
    session.categoryId ? sum : sum + session.durationSeconds
  ), 0);

  if (uncategorizedSeconds > 0) {
    rows.push({
      color: "var(--text-muted)",
      detail: "Not saved to a category",
      key: "__uncategorized__",
      seconds: uncategorizedSeconds,
      title: "One-off sessions",
    });
  }

  const maxSeconds = rows.reduce((max, row) => Math.max(max, row.seconds), 0);

  return rows
    .sort((a, b) => b.seconds - a.seconds || a.title.localeCompare(b.title, undefined, { sensitivity: "base" }))
    .map((row) => ({
      ...row,
      shareRatio: totalSeconds > 0 ? row.seconds / totalSeconds : 0,
      widthRatio: maxSeconds > 0 ? row.seconds / maxSeconds : 0,
    }));
}

function buildDailyTotalsByDate(sessions: HistoricalFocusSession[]) {
  return sessions.reduce<Record<string, number>>((acc, session) => {
    acc[session.date] = (acc[session.date] ?? 0) + session.durationSeconds;
    return acc;
  }, {});
}

function getSessionCategoryDailyGoalSeconds(session: HistoricalFocusSession, categoryById: Map<string, FocusCategory>) {
  if (!session.categoryId) {
    return 0;
  }

  return categoryById.get(session.categoryId)?.dailyGoalSeconds ?? 0;
}

function getDailyGoalSecondsForLoggedCategories(
  sessions: HistoricalFocusSession[],
  categoryById: Map<string, FocusCategory>,
) {
  const seenCategoryIds = new Set<string>();

  return sessions.reduce((sum, session) => {
    if (!session.categoryId || seenCategoryIds.has(session.categoryId)) {
      return sum;
    }

    seenCategoryIds.add(session.categoryId);
    return sum + getSessionCategoryDailyGoalSeconds(session, categoryById);
  }, 0);
}


function getMondayFirstIndex(date: string) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 ? 6 : day - 1;
}

function buildActivityOverallBars(
  categories: FocusCategory[],
  sessions: HistoricalFocusSession[],
  scope: TimeScope,
  currentDate: string,
  range: ScopeRange,
): DistributionBar[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  if (scope === "daily") {
    return attachDailyOverallGoalSeconds(
      buildDistributionBars(sessions, scope, range),
      sessions,
      (session) => getSessionCategoryDailyGoalSeconds(session, categoryById),
    );
  }

  const totalsByDate = buildDailyTotalsByDate(sessions);
  const sessionsByDate = sessions.reduce<Record<string, HistoricalFocusSession[]>>((acc, session) => {
    if (!acc[session.date]) {
      acc[session.date] = [];
    }

    acc[session.date].push(session);
    return acc;
  }, {});
  const dates = listDatesInRange(range);

  if (scope === "weekly") {
    return dates
      .map((date) => {
        const goalSeconds = getDailyGoalSecondsForLoggedCategories(sessionsByDate[date] ?? [], categoryById);

        return {
          key: date,
          goalSeconds: goalSeconds || undefined,
          label: formatDisplayDate(date),
          shortLabel: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${date}T12:00:00`)),
          seconds: totalsByDate[date] ?? 0,
        };
      })
      .sort((a, b) => getMondayFirstIndex(a.key) - getMondayFirstIndex(b.key));
  }

  const totalMonthlyGoalSeconds = getTotalGoalSeconds(categories, scope, currentDate);
  const dailyDerivedGoalSeconds = totalMonthlyGoalSeconds > 0
    ? totalMonthlyGoalSeconds / daysInMonthForISO(currentDate)
    : 0;
  const bucketCount = Math.ceil(dates.length / 7);
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketDates = dates.slice(index * 7, index * 7 + 7);
    const seconds = bucketDates.reduce((sum, date) => sum + (totalsByDate[date] ?? 0), 0);
    const startDay = bucketDates[0] ? new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(new Date(`${bucketDates[0]}T12:00:00`)) : "";
    const endDay = bucketDates[bucketDates.length - 1] ? new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(new Date(`${bucketDates[bucketDates.length - 1]}T12:00:00`)) : "";

    return {
      key: `week-${index + 1}`,
      goalSeconds: dailyDerivedGoalSeconds > 0 ? Math.round(dailyDerivedGoalSeconds * bucketDates.length) : undefined,
      label: bucketDates.length > 1 ? `${formatDisplayDate(bucketDates[0])} - ${formatDisplayDate(bucketDates[bucketDates.length - 1])}` : bucketDates[0] ? formatDisplayDate(bucketDates[0]) : `Week ${index + 1}`,
      shortLabel: startDay && endDay ? `${startDay}-${endDay}` : `W${index + 1}`,
      seconds,
    };
  });
}

function buildActivityCategoryBars(
  categories: FocusCategory[],
  sessions: HistoricalFocusSession[],
  scope: TimeScope,
  currentDate: string,
): DistributionBar[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  let otherSeconds = 0;
  const categoryTotals = sessions.reduce<Record<string, number>>((acc, session) => {
    if (!session.categoryId || !categoryById.has(session.categoryId)) {
      otherSeconds += session.durationSeconds;
      return acc;
    }

    acc[session.categoryId] = (acc[session.categoryId] ?? 0) + session.durationSeconds;
    return acc;
  }, {});

  const rows = Object.entries(categoryTotals)
    .map(([categoryId, seconds]) => ({
      category: categoryById.get(categoryId),
      key: categoryId,
      seconds,
    }))
    .filter((row): row is { category: FocusCategory; key: string; seconds: number } => Boolean(row.category) && row.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds || a.category.title.localeCompare(b.category.title, undefined, { sensitivity: "base" }));

  const topRows = rows.slice(0, 6);
  otherSeconds += rows.slice(6).reduce((sum, row) => sum + row.seconds, 0);
  const bars = topRows.map((row) => ({
    color: row.category.color || "var(--accent)",
    goalSeconds: getGoalSeconds(row.category, scope, currentDate) || undefined,
    key: row.key,
    label: row.category.title,
    shortLabel: row.category.title,
    seconds: row.seconds,
  }));

  if (otherSeconds > 0) {
    bars.push({
      color: "var(--text-muted)",
      goalSeconds: undefined,
      key: "__other__",
      label: "Other",
      shortLabel: "Other",
      seconds: otherSeconds,
    });
  }

  return bars;
}

function buildDailyLineBuckets(sessions: HistoricalFocusSession[]): ActivityLineBucket[] {
  return [...sessions]
    .sort((a, b) => {
      const createdA = a.createdAt ?? "";
      const createdB = b.createdAt ?? "";
      if (createdA !== createdB) {
        return createdA.localeCompare(createdB);
      }
      return a.id.localeCompare(b.id);
    })
    .map((session, index) => ({
      key: session.id,
      label: formatDistributionSessionLabel(session, index),
      sessions: [session],
    }));
}

function buildScopeLineBuckets(
  sessions: HistoricalFocusSession[],
  scope: TimeScope,
  range: ScopeRange,
): ActivityLineBucket[] {
  if (scope === "daily") {
    return buildDailyLineBuckets(sessions);
  }

  const sessionsByDate = sessions.reduce<Record<string, HistoricalFocusSession[]>>((acc, session) => {
    if (!acc[session.date]) {
      acc[session.date] = [];
    }

    acc[session.date].push(session);
    return acc;
  }, {});
  const dates = listDatesInRange(range);

  if (scope === "weekly") {
    return dates
      .map((date) => ({
        key: date,
        label: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${date}T12:00:00`)),
        sessions: sessionsByDate[date] ?? [],
      }))
      .sort((a, b) => getMondayFirstIndex(a.key) - getMondayFirstIndex(b.key));
  }

  const bucketCount = Math.ceil(dates.length / 7);
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketDates = dates.slice(index * 7, index * 7 + 7);
    const startDay = bucketDates[0] ? new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(new Date(`${bucketDates[0]}T12:00:00`)) : "";
    const endDay = bucketDates[bucketDates.length - 1] ? new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(new Date(`${bucketDates[bucketDates.length - 1]}T12:00:00`)) : "";
    const bucketSessions = bucketDates.flatMap((date) => sessionsByDate[date] ?? []);

    return {
      key: `week-${index + 1}`,
      label: startDay && endDay ? `${startDay}-${endDay}` : `W${index + 1}`,
      sessions: bucketSessions,
    };
  });
}

function buildActivityLineSeries(
  categories: FocusCategory[],
  sessions: HistoricalFocusSession[],
  scope: TimeScope,
  range: ScopeRange,
): ActivityLineSeries[] {
  const buckets = buildScopeLineBuckets(sessions, scope, range);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryTotals = sessions.reduce<Record<string, number>>((acc, session) => {
    if (!session.categoryId || !categoryById.has(session.categoryId)) {
      return acc;
    }

    acc[session.categoryId] = (acc[session.categoryId] ?? 0) + session.durationSeconds;
    return acc;
  }, {});

  return categories
    .filter((category) => (categoryTotals[category.id] ?? 0) > 0)
    .sort((a, b) => (categoryTotals[b.id] ?? 0) - (categoryTotals[a.id] ?? 0) || a.title.localeCompare(b.title, undefined, { sensitivity: "base" }))
    .slice(0, 6)
    .map((category) => ({
      color: category.color || "var(--accent)",
      key: category.id,
      label: category.title,
      points: buckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        seconds: bucket.sessions.reduce((sum, session) => (
          session.categoryId === category.id ? sum + session.durationSeconds : sum
        ), 0),
      })),
      totalSeconds: categoryTotals[category.id] ?? 0,
    }));
}

function buildFocusHistoryDerived(
  categories: FocusCategory[],
  history: HistoricalFocusSession[],
  scope: TimeScope,
  currentDate: string,
  range: ScopeRange,
  previousRange: ScopeRange,
): FocusHistoryDerived {
  const scopedSessions = getScopedSessions(history, range);
  const previousSessions = getScopedSessions(history, previousRange);
  const currentStats = getPeriodStats(categories, scopedSessions, scope, currentDate);
  const previousStats = getPeriodStats(categories, previousSessions, scope, shiftScopeDate(scope, currentDate, -1));
  const activityOverallBars = buildActivityOverallBars(categories, scopedSessions, scope, currentDate, range);
  const activityCategoryBars = buildActivityCategoryBars(categories, scopedSessions, scope, currentDate);
  const activityLineSeries = buildActivityLineSeries(categories, scopedSessions, scope, range);
  const sessionsByDate = [...scopedSessions].sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id.localeCompare(a.id);
  });

  const goalRows = categories
    .map((category) => {
      const goalSeconds = getGoalSeconds(category, scope, currentDate);
      const actualSeconds = currentStats.actualByCategory[category.id] ?? 0;
      const previousActualSeconds = previousSessions.length > 0 ? previousStats.actualByCategory[category.id] ?? 0 : null;
      const completionRatio = getCompletionRatio(actualSeconds, goalSeconds);
      const expectedSeconds = getExpectedGoalSeconds(goalSeconds, scope, range);
      const status = getGoalStatus(actualSeconds, goalSeconds, expectedSeconds);
      return {
        category,
        actualSeconds,
        goalSeconds,
        completionRatio,
        expectedSeconds,
        previousDeltaLabel: buildPreviousActualLabel(actualSeconds, previousActualSeconds),
        shortfallScore: goalSeconds > 0 ? Math.max(0, goalSeconds - actualSeconds) / goalSeconds : -1,
        status,
      } satisfies GoalRow;
    })
    .sort((a, b) => {
      if (a.actualSeconds > 0 && b.actualSeconds === 0) {
        return -1;
      }
      if (a.actualSeconds === 0 && b.actualSeconds > 0) {
        return 1;
      }
      if (a.actualSeconds > 0 && b.actualSeconds > 0 && a.actualSeconds !== b.actualSeconds) {
        return b.actualSeconds - a.actualSeconds;
      }
      return a.category.title.localeCompare(b.category.title, undefined, { sensitivity: "base" });
    });

  const overviewMetrics: OverviewMetric[] = [
    {
      label: "Total focus time",
      value: formatRoundedMinuteDuration(currentStats.headlineTotalSeconds),
      delta: buildNumericDelta(currentStats.headlineTotalSeconds, previousStats.headlineTotalSeconds, formatSignedDurationDelta),
    },
    {
      label: "Sessions completed",
      value: String(currentStats.sessions.length),
      delta: buildNumericDelta(currentStats.sessions.length, previousStats.sessions.length, (delta) => formatSignedCountDelta(delta, "session")),
    },
    {
      label: "Average session length",
      value: currentStats.sessions.length > 0 ? formatRoundedMinuteDuration(currentStats.averageSessionSeconds) : "No sessions",
      delta: currentStats.sessions.length > 0
        ? buildNumericDelta(currentStats.averageSessionSeconds, previousStats.averageSessionSeconds, formatSignedDurationDelta)
        : null,
    },
    {
      label: "Top category",
      value: currentStats.topCategory ? currentStats.topCategory.category.title : "No data",
      delta: currentStats.topCategory && previousStats.topCategory
        ? {
            label: `prev ${previousStats.topCategory.category.title}`,
            tone: "neutral",
          }
        : null,
    },
    {
      label: "Goal completion rate",
      value: currentStats.goalCompletionRate === null ? "No goals" : formatPercent(currentStats.goalCompletionRate),
      delta: currentStats.goalCompletionRate !== null && previousStats.goalCompletionRate !== null && previousStats.sessions.length > 0
        ? buildNumericDelta(currentStats.goalCompletionRate, previousStats.goalCompletionRate, (delta) => {
            if (delta === 0) {
              return "same as previous";
            }
            return `${delta > 0 ? "+" : "-"}${Math.abs(Math.round(delta * 100))} pts`;
          })
        : null,
    },
  ];

  return {
    averageSessionSeconds: currentStats.averageSessionSeconds,
    sessionsByDate,
    goalRows,
    goalCompletionRate: currentStats.goalCompletionRate,
    goalSummary: {
      behind: goalRows.filter((row) => row.status === "behind").length,
      complete: goalRows.filter((row) => row.status === "complete").length,
      goalCount: goalRows.filter((row) => row.goalSeconds > 0).length,
      noGoal: goalRows.filter((row) => row.status === "no goal").length,
    },
    overviewMetrics,
    activityTrend: buildActivityTrendLabel(currentStats.headlineTotalSeconds, previousStats.headlineTotalSeconds, scope),
    activityOverallBars,
    activityCategoryBars,
    activityLineSeries,
    categorizedSeconds: Object.values(currentStats.actualByCategory).reduce((sum, seconds) => sum + seconds, 0),
    categoryBreakdownRows: buildCategoryBreakdownRows(categories, scopedSessions, currentStats.actualByCategory, currentStats.totalSeconds),
    scopedSessionCount: currentStats.sessions.length,
    topCategory: currentStats.topCategory,
    totalScopedSeconds: currentStats.headlineTotalSeconds,
  };
}

export function DailyHistoryGallery({
  categories,
  history,
  labelOptions,
  onDeleteEntry,
  onEditGoals,
  onUpdateEntry,
}: {
  categories: FocusCategory[];
  history: HistoricalFocusSession[];
  labelOptions: FocusLabelOptions;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onEditGoals: () => void;
  onUpdateEntry: (entryId: string, data: { categoryId: string | null; title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; durationSeconds: number; date: string; completionTime?: string; notes: string }) => Promise<void>;
}) {
  const [activityScope, setActivityScope] = useState<TimeScope>("daily");
  const [activityDate, setActivityDate] = useState(todayLocalISO());
  const [insightsScope, setInsightsScope] = useState<TimeScope>("daily");
  const [insightsDate, setInsightsDate] = useState(todayLocalISO());
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activityRange = useMemo(() => getScopeRange(activityScope, activityDate), [activityDate, activityScope]);
  const activityPreviousRange = useMemo(() => getPreviousScopeRange(activityScope, activityDate), [activityDate, activityScope]);
  const insightsRange = useMemo(() => getScopeRange(insightsScope, insightsDate), [insightsDate, insightsScope]);
  const insightsPreviousRange = useMemo(() => getPreviousScopeRange(insightsScope, insightsDate), [insightsDate, insightsScope]);

  const activityDerived = useMemo(() => (
    buildFocusHistoryDerived(categories, history, activityScope, activityDate, activityRange, activityPreviousRange)
  ), [activityDate, activityPreviousRange, activityRange, activityScope, categories, history]);

  const insightsDerived = useMemo(() => (
    buildFocusHistoryDerived(categories, history, insightsScope, insightsDate, insightsRange, insightsPreviousRange)
  ), [categories, history, insightsDate, insightsPreviousRange, insightsRange, insightsScope]);

  const filteredSessionsByDate = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return insightsDerived.sessionsByDate;
    }

    return insightsDerived.sessionsByDate.filter((entry) => {
      const categoryTitle = entry.categoryId
        ? categories.find((item) => item.id === entry.categoryId)?.title ?? ""
        : "";

      return [
        entry.title,
        categoryTitle,
        entry.focusType,
        entry.focusSubtype ?? "",
        entry.focusSubtype2 ?? "",
        entry.notes ?? "",
        entry.date,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [categories, insightsDerived.sessionsByDate, searchQuery]);

  const editingEntry = editingId ? history.find((entry) => entry.id === editingId) ?? null : null;

  const [entryDate, setEntryDate] = useState(todayLocalISO());
  const [entryCompletionTime, setEntryCompletionTime] = useState("12:00");
  const [entryCategoryId, setEntryCategoryId] = useState("__none__");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryType, setEntryType] = useState<FocusType>("Work");
  const [entryPrimarySubtype, setEntryPrimarySubtype] = useState<FocusSubtype>("");
  const [entrySecondarySubtype, setEntrySecondarySubtype] = useState("");
  const [entryHours, setEntryHours] = useState("0");
  const [entryMinutes, setEntryMinutes] = useState("30");
  const [entryNotes, setEntryNotes] = useState("");

  const openEdit = (entry: HistoricalFocusSession) => {
    setEditingId(entry.id);
    setEntryDate(entry.date);
    setEntryCompletionTime(entry.endedAt ? new Date(entry.endedAt).toTimeString().slice(0, 5) : "12:00");
    setEntryCategoryId(entry.categoryId ?? "__none__");
    setEntryTitle(entry.title);
    setEntryType(entry.focusType);
    setEntryPrimarySubtype(entry.focusSubtype ?? "");
    setEntrySecondarySubtype(entry.focusSubtype2 ?? "");
    setEntryHours(String(Math.floor(entry.durationSeconds / 3600)));
    setEntryMinutes(String(Math.floor((entry.durationSeconds % 3600) / 60)));
    setEntryNotes(entry.notes ?? "");
  };

  const handleCategoryChange = (value: string) => {
    setEntryCategoryId(value);
    if (value === "__none__") {
      return;
    }

    const category = categories.find((item) => item.id === value);
    if (category) {
      setEntryTitle(category.title);
      setEntryType(category.focusType);
      setEntryPrimarySubtype(category.focusSubtype ?? "");
      setEntrySecondarySubtype(category.focusSubtype2 ?? "");
    }
  };

  const saveEdit = async () => {
    if (!editingId || !entryTitle.trim() || !entryType.trim()) {
      return;
    }

    const parsedHours = Number(entryHours);
    const parsedMinutes = Number(entryMinutes);
    const safeHours = Number.isFinite(parsedHours) ? Math.max(0, Math.floor(parsedHours)) : 0;
    const safeMinutes = Number.isFinite(parsedMinutes) ? Math.max(0, Math.floor(parsedMinutes)) : 0;
    const nextSeconds = Math.max(60, (safeHours * 60 + safeMinutes) * 60);
    setSavingEntry(true);
    try {
      await onUpdateEntry(editingId, {
        categoryId: entryCategoryId === "__none__" ? null : entryCategoryId,
        title: entryTitle,
        focusType: entryType,
        focusSubtype: entryPrimarySubtype.trim() || null,
        focusSubtype2: entrySecondarySubtype.trim() || null,
        durationSeconds: nextSeconds,
        date: entryDate,
        completionTime: entryCompletionTime,
        notes: entryNotes,
      });
      setEditingId(null);
    } finally {
      setSavingEntry(false);
    }
  };

  const deleteEntry = async (entryId: string) => {
    setDeletingId(entryId);
    try {
      await onDeleteEntry(entryId);
    } finally {
      setDeletingId(null);
    }
  };

  const shiftActivityPeriod = (direction: number) => {
    setActivityDate((current) => shiftScopeDate(activityScope, current, direction));
  };

  const shiftInsightsPeriod = (direction: number) => {
    setInsightsDate((current) => shiftScopeDate(insightsScope, current, direction));
  };
  const shouldShowLowerFocusAnalytics = false;

  return (
    <>
      <section className="mx-auto mb-4 w-full max-w-6xl sm:mb-6">
        <div className="flex flex-col gap-4">
          <FocusActivitySummaryCard
            allHistory={history}
            categoryBars={activityDerived.activityCategoryBars}
            categories={categories}
            currentDate={activityDate}
            deletingId={deletingId}
            historyEntries={activityDerived.sessionsByDate}
            onDateChange={setActivityDate}
            onDeleteEntry={deleteEntry}
            onEditGoals={onEditGoals}
            onEditHistoryEntry={openEdit}
            onShiftPeriod={shiftActivityPeriod}
            onScopeChange={setActivityScope}
            overallBars={activityDerived.activityOverallBars}
            scope={activityScope}
            totalLabel={formatCompactDuration(activityDerived.totalScopedSeconds)}
            trend={activityDerived.activityTrend}
          />
          <FocusActivityLineCard
            range={activityRange}
            scope={activityScope}
            series={activityDerived.activityLineSeries}
          />
        </div>
      </section>

      {/* Lower Focus analytics temporarily hidden while Activity card direction is reviewed. */}
      {shouldShowLowerFocusAnalytics ? (
        <>
          <div className="w-full max-w-6xl">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Focus Dashboard</p>
                  <h2 className="mt-2 text-2xl font-black text-[var(--text-primary)]">{insightsRange.heading}</h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{insightsRange.label}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-full border border-[var(--border-soft)] bg-[var(--surface-muted)] p-1 dark:border-white/10 dark:bg-white/[0.04]">
                    {([
                      ["daily", "Daily"],
                      ["weekly", "Weekly"],
                      ["monthly", "Monthly"],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
                          insightsScope === value
                            ? "bg-white text-[var(--accent)] shadow-[0_10px_20px_rgba(111,87,246,0.12)] dark:bg-white/10 dark:text-white"
                            : "text-[var(--text-secondary)]"
                        }`}
                        onClick={() => setInsightsScope(value)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button className="flex h-9 w-9 shrink-0 items-center justify-center transition hover:bg-white/10 ui-icon-button-light dark:rounded-full dark:bg-white/5 dark:text-white" onClick={() => shiftInsightsPeriod(-1)} type="button">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <label className="inline-flex h-9 items-center gap-1 px-2 text-sm font-semibold sm:px-3 ui-pill-button-light dark:rounded-full dark:bg-white/5 dark:text-white">
                    <span className="hidden sm:inline">Calendar</span>
                    <input className="w-32 rounded-md border px-2 py-1 text-xs sm:w-auto ui-input-light dark:border-white/15 dark:bg-white/10 dark:text-white" onChange={(event) => setInsightsDate(event.target.value)} type="date" value={insightsDate} />
                  </label>
                  <button className="flex h-9 w-9 shrink-0 items-center justify-center transition hover:bg-white/10 ui-icon-button-light dark:rounded-full dark:bg-white/5 dark:text-white" onClick={() => shiftInsightsPeriod(1)} type="button">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <ActivityInsightCard
                  action={(
                    <button
                      className="inline-flex items-center justify-center rounded-full border px-3 py-1 text-[12px] font-medium leading-none whitespace-nowrap border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-secondary)] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/80"
                      onClick={onEditGoals}
                      type="button"
                    >
                      Edit Goals
                    </button>
                  )}
                  detail={insightsDerived.goalCompletionRate === null
                    ? "Add goals to track completion across your scoped categories."
                    : `${insightsDerived.goalSummary.complete} complete • ${insightsDerived.goalSummary.behind} behind • ${insightsDerived.goalSummary.noGoal} without goals`}
                  eyebrow="Goal Activity"
                  primaryValue={insightsDerived.goalCompletionRate === null ? "No goals" : formatPercent(insightsDerived.goalCompletionRate)}
                  secondaryValue={insightsDerived.goalSummary.goalCount > 0
                    ? `${insightsDerived.goalSummary.complete}/${insightsDerived.goalSummary.goalCount} categories complete`
                    : "Set category goals to compare target vs actual"}
                  title="Category goals"
                  visual={(
                    insightsDerived.goalRows.length === 0 ? (
                      <ActivityCardEmptyState label="Add focus categories to start tracking goals." />
                    ) : (
                      <div className="space-y-2">
                        {insightsDerived.goalRows.slice(0, 5).map((row) => (
                          <CompactGoalBar key={row.category.id} row={row} />
                        ))}
                      </div>
                    )
                  )}
                />

                <ActivityInsightCard
                  detail={insightsDerived.topCategory
                    ? `${formatCompactDuration(insightsDerived.topCategory.seconds)} logged in the current top category`
                    : "No scoped category totals yet."}
                  eyebrow="Category Activity"
                  primaryValue={insightsDerived.topCategory ? insightsDerived.topCategory.category.title : "No data"}
                  secondaryValue={insightsDerived.categorizedSeconds > 0
                    ? `${formatCompactDuration(insightsDerived.categorizedSeconds)} category-covered time`
                    : "Waiting on saved category time"}
                  title="Where focus time went"
                  visual={(
                    insightsDerived.categoryBreakdownRows.length === 0 ? (
                      <ActivityCardEmptyState label="No scoped focus time is available for category breakdown yet." />
                    ) : (
                      <div className="space-y-2">
                        {insightsDerived.categoryBreakdownRows.slice(0, 5).map((row) => (
                          <CompactCategoryBar key={row.key} row={row} />
                        ))}
                      </div>
                    )
                  )}
                />

                <ActivityInsightCard
                  detail={insightsDerived.activityTrend?.deltaLabel ?? "No prior period yet"}
                  eyebrow="Scope Snapshot"
                  primaryValue={formatCompactDuration(insightsDerived.totalScopedSeconds)}
                  secondaryValue={`${insightsDerived.scopedSessionCount} sessions • ${insightsDerived.averageSessionSeconds > 0 ? formatRoundedMinuteDuration(insightsDerived.averageSessionSeconds) : "No sessions"} avg`}
                  title="Scoped focus pulse"
                  visual={(
                    <div className="space-y-2">
                      {insightsDerived.overviewMetrics.slice(1, 5).map((metric) => (
                        <CompactMetricRow key={metric.label} metric={metric} />
                      ))}
                    </div>
                  )}
                />
              </div>

              <section className="rounded-[var(--radius-modal)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] dark:border-white/5 dark:bg-white/[0.03] dark:shadow-[0_24px_48px_rgba(0,0,0,0.24)] sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Session Log</p>
                    <h3 className="mt-1 text-lg font-black text-[var(--text-primary)]">{formatEntriesHeading(insightsScope, insightsRange)}</h3>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <label className="flex w-full items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 sm:w-[18rem]">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Search</span>
                      <input
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] dark:text-white"
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Find history entries"
                        type="text"
                        value={searchQuery}
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 xl:grid-cols-2">
                  {insightsDerived.sessionsByDate.length === 0 ? (
                    <p className="rounded-[var(--radius-card)] bg-[var(--surface-muted)] px-4 py-5 text-center text-sm text-[var(--text-secondary)] dark:bg-white/[0.04] xl:col-span-2">
                      {insightsScope === "daily" ? "No focus logged yet today." : "No focus logged in this period."}
                    </p>
                  ) : filteredSessionsByDate.length === 0 ? (
                    <p className="rounded-[var(--radius-card)] bg-[var(--surface-muted)] px-4 py-5 text-center text-sm text-[var(--text-secondary)] dark:bg-white/[0.04] xl:col-span-2">
                      No entries matched that search.
                    </p>
                  ) : (
                    filteredSessionsByDate.map((entry) => {
                      const category = entry.categoryId ? categories.find((item) => item.id === entry.categoryId) : null;
                      return (
                        <div key={entry.id} className="rounded-[var(--radius-card)] border px-4 py-3 border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-white/[0.03]">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-bold text-[var(--text-primary)]">{entry.title} • {formatRoundedMinuteDuration(entry.durationSeconds)}</p>
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                {formatEntryDateLabel(entry.date)}{entry.createdAt ? ` • Logged ${formatLoggedTime(entry.createdAt)}` : ""}
                                {category ? ` • ${category.title}` : " • One-off session"}
                              </p>
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                {[entry.focusType, entry.focusSubtype, entry.focusSubtype2].filter(Boolean).join(" / ")}
                                {entry.notes ? ` • ${entry.notes}` : ""}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                className="inline-flex items-center justify-center rounded-full border px-3 py-1 text-[13px] font-medium leading-none whitespace-nowrap border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-secondary)] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/80"
                                onClick={() => openEdit(entry)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                className="inline-flex items-center justify-center rounded-full border px-3 py-1 text-[13px] font-medium leading-none whitespace-nowrap border-[#ffd5df] bg-[#fff3f6] text-[#d64f78] dark:border-[#4d2230] dark:bg-[#301520] dark:text-[#ff9fbc]"
                                disabled={deletingId === entry.id}
                                onClick={() => void deleteEntry(entry.id)}
                                type="button"
                              >
                                {deletingId === entry.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          </div>

        </>
      ) : null}

      {editingEntry ? (
            <ModalShell className="max-h-[82vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-modal)] border p-6 shadow-[var(--shadow-modal)] border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-[#171329]" onClose={() => setEditingId(null)}>
              <h4 className="text-xl font-black text-[var(--text-primary)]">Edit Focus Entry</h4>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Update duration, date, and labels for this individual entry.</p>
              <p className="mt-2 text-sm font-semibold text-[var(--accent)]">Time logged: {formatLoggedTime(editingEntry.createdAt)}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FocusPillSelect
                    label="Saved Category"
                    onChange={handleCategoryChange}
                    options={[
                      { label: "No saved category", value: "__none__" },
                      ...categories.map((category) => ({ label: category.title, value: category.id })),
                    ]}
                    value={entryCategoryId}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FocusSuggestionInput label="Title" onChange={setEntryTitle} options={labelOptions.titles} value={entryTitle} />
                </div>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">Date</span>
                  <input className="h-10 w-full px-3 ui-input-light" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">Time</span>
                  <input className="h-10 w-full px-3 ui-input-light" type="time" value={entryCompletionTime} onChange={(event) => setEntryCompletionTime(event.target.value)} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">Hours</span>
                  <input className="h-10 w-full px-3 ui-input-light" min={0} type="number" value={entryHours} onChange={(event) => setEntryHours(event.target.value)} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">Minutes</span>
                  <input className="h-10 w-full px-3 ui-input-light" max={59} min={0} type="number" value={entryMinutes} onChange={(event) => setEntryMinutes(event.target.value)} />
                </label>
                <div className="text-sm">
                  <FocusSuggestionInput label="Type" onChange={(value) => setEntryType(value as FocusType)} options={labelOptions.types} value={entryType} />
                </div>
                <div className="text-sm">
                  <FocusSuggestionInput label="Subtype" onChange={(value) => setEntryPrimarySubtype(value as FocusSubtype)} options={labelOptions.primarySubtypes} value={entryPrimarySubtype} />
                </div>
                <div className="text-sm">
                  <FocusSuggestionInput label="Subtype 2" onChange={setEntrySecondarySubtype} options={labelOptions.secondarySubtypes} placeholder="Optional" value={entrySecondarySubtype} />
                </div>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-semibold">Notes</span>
                  <textarea className="min-h-20 w-full px-3 py-2 ui-input-light" value={entryNotes} onChange={(event) => setEntryNotes(event.target.value)} />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button className="px-4 py-2 text-sm font-semibold ui-pill-button-light dark:rounded-full dark:bg-white/10 dark:text-white" onClick={() => setEditingId(null)} type="button">Cancel</button>
                <button className="px-4 py-2 text-sm font-bold ui-pill-button-strong-light dark:rounded-full dark:bg-[#cabfff] dark:text-[#1a1431]" disabled={savingEntry} onClick={() => void saveEdit()} type="button">{savingEntry ? "Saving..." : "Save Entry"}</button>
              </div>
            </ModalShell>
      ) : null}
    </>
  );
}

function ActivityInsightCard({
  action,
  detail,
  eyebrow,
  primaryValue,
  secondaryValue,
  title,
  visual,
}: {
  action?: React.ReactNode;
  detail: string;
  eyebrow: string;
  primaryValue: string;
  secondaryValue: string;
  title: string;
  visual: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-modal)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] dark:border-white/5 dark:bg-white/[0.03] dark:shadow-[0_24px_48px_rgba(0,0,0,0.24)] sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">{eyebrow}</p>
            <h3 className="mt-1 text-lg font-black text-[var(--text-primary)]">{title}</h3>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:items-start">
          <div>
            <p className="text-3xl font-black tracking-tight text-[var(--text-primary)]">{primaryValue}</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">{detail}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">{secondaryValue}</p>
          </div>
          <div className="min-w-0">{visual}</div>
        </div>
      </div>
    </section>
  );
}

function ActivityCardEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--surface-muted)] px-4 py-6 text-center text-sm text-[var(--text-secondary)] dark:bg-white/[0.04]">
      {label}
    </div>
  );
}

function CompactGoalBar({ row }: { row: GoalRow }) {
  const progressPercent = row.goalSeconds > 0
    ? Math.min(100, row.completionRatio * 100)
    : 0;
  const expectedPercent = row.goalSeconds > 0
    ? Math.min(100, (row.expectedSeconds / row.goalSeconds) * 100)
    : 0;

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-3 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_auto] md:items-center">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[var(--text-primary)]">{row.category.title}</p>
          <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
            {[row.category.focusType, row.category.focusSubtype, row.category.focusSubtype2].filter(Boolean).join(" / ")}
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">{formatGoalPair(row.actualSeconds, row.goalSeconds)}</p>
            {row.previousDeltaLabel ? (
              <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] dark:bg-white/[0.05]">
                {row.previousDeltaLabel}
              </span>
            ) : null}
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-[var(--accent-soft)]">
            {row.goalSeconds > 0 ? (
              <div
                className="absolute top-0 z-10 h-full w-px bg-[var(--text-muted)]/50"
                style={{ left: `${expectedPercent}%` }}
              />
            ) : null}
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ backgroundColor: row.goalSeconds > 0 ? row.category.color : "var(--border-soft)", width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex lg:justify-end">
          <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none whitespace-nowrap bg-[var(--surface-muted)] text-[var(--text-secondary)] dark:bg-white/[0.05] dark:text-white/80">
            {row.status}
          </span>
        </div>
      </div>
    </div>
  );
}

function CompactMetricRow({ metric }: { metric: OverviewMetric }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-3 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase leading-tight tracking-[0.1em] text-[var(--text-muted)]">{metric.label}</p>
          <p className="mt-1 text-sm font-black leading-tight text-[var(--text-primary)]">{metric.value}</p>
        </div>
        {metric.delta ? (
          <DeltaPill delta={metric.delta} />
        ) : null}
      </div>
    </div>
  );
}

function DeltaPill({ delta }: { delta: DeltaChip }) {
  const toneClass = {
    positive: "bg-[#f4fbf7] text-[var(--success)] dark:bg-[#18261f]",
    negative: "bg-[var(--surface-muted)] text-[var(--text-secondary)] dark:bg-white/[0.05]",
    neutral: "bg-[var(--surface-muted)] text-[var(--text-secondary)] dark:bg-white/[0.05]",
  }[delta.tone];

  return (
    <span className={`inline-flex max-w-full rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {delta.label}
    </span>
  );
}

function CompactCategoryBar({ row }: { row: CategoryBreakdownRow }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-3 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[var(--text-primary)]">{row.title}</p>
          <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{row.detail}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black text-[var(--text-primary)]">{formatRoundedMinuteDuration(row.seconds)}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{formatPercent(row.shareRatio)}</p>
        </div>
      </div>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)] dark:bg-white/[0.05]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ backgroundColor: row.color, width: `${Math.max(6, row.widthRatio * 100)}%` }}
        />
      </div>
    </div>
  );
}

function getLinePointPosition(
  index: number,
  pointCount: number,
  seconds: number,
  maxSeconds: number,
  width: number,
  height: number,
) {
  const x = pointCount <= 1 ? width / 2 : (index / (pointCount - 1)) * width;
  const y = height - ((maxSeconds > 0 ? seconds / maxSeconds : 0) * height);

  return { x, y };
}

function FocusActivityLineCard({
  range,
  scope,
  series,
}: {
  range: ScopeRange;
  scope: TimeScope;
  series: ActivityLineSeries[];
}) {
  const chartWidth = 640;
  const chartHeight = 220;
  const padding = { top: 24, right: 24, bottom: 42, left: 44 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const maxSeconds = Math.max(
    1,
    ...series.flatMap((item) => item.points.map((point) => point.seconds)),
  );
  const axisPoints = series[0]?.points ?? [];
  const labelStep = Math.max(1, Math.ceil(axisPoints.length / 6));
  const hasData = series.length > 0 && axisPoints.length > 0;
  const [hoveredPointKey, setHoveredPointKey] = useState<string | null>(null);
  const [pinnedPointKey, setPinnedPointKey] = useState<string | null>(null);
  const interactivePoints = useMemo(() => (
    series.flatMap((item) => (
      item.points.map((point, index) => {
        const position = getLinePointPosition(index, item.points.length, point.seconds, maxSeconds, plotWidth, plotHeight);
        return {
          color: item.color,
          key: item.key,
          label: item.label,
          pointLabel: point.label,
          pointKey: `${item.key}:${point.key}`,
          seconds: point.seconds,
          x: padding.left + position.x,
          y: padding.top + position.y,
        } satisfies InteractiveActivityPoint;
      })
    ))
  ), [maxSeconds, padding.left, padding.top, plotHeight, plotWidth, series]);
  const activePoint = interactivePoints.find((point) => point.pointKey === (hoveredPointKey ?? pinnedPointKey))
    ?? interactivePoints.find((point) => point.pointKey === pinnedPointKey)
    ?? null;

  const setNearestPointFromPointer = (clientX: number, clientY: number, bounds: DOMRect) => {
    if (!interactivePoints.length) {
      return null;
    }
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    let nearestPoint = interactivePoints[0];
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const point of interactivePoints) {
      const distance = Math.hypot(point.x - localX, point.y - localY);
      if (distance < nearestDistance) {
        nearestPoint = point;
        nearestDistance = distance;
      }
    }

    setHoveredPointKey(nearestPoint.pointKey);
    return nearestPoint.pointKey;
  };

  return (
    <div
      aria-labelledby="activity-line-card-title"
      className="w-full overflow-hidden rounded-[var(--radius-modal)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.03]"
    >
      <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Activity Summary</p>
              <h4 className="mt-2 text-2xl font-black tracking-tight text-[var(--text-primary)]" id="activity-line-card-title">Focus Activity Lines</h4>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {range.label} • {scope === "daily" ? "session points" : scope === "weekly" ? "daily points" : "weekly buckets"}
              </p>
            </div>
            {series.length > 0 ? (
              <div className="flex max-w-2xl flex-wrap gap-2 lg:justify-end">
                {series.map((item) => (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#e4deef] bg-[var(--surface-elevated)] px-2.5 py-1 text-[11px] font-semibold leading-none text-[#68738c] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60"
                    key={item.key}
                    title={`${item.label}: ${formatRoundedMinuteDuration(item.totalSeconds)}`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.label}
                    <span className="text-[var(--text-muted)]">{formatRoundedMinuteDuration(item.totalSeconds)}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {hasData ? (
            <div className="min-w-0 overflow-x-auto pb-2">
              {activePoint ? (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3 flex flex-wrap items-center gap-3 rounded-[1.2rem] border border-[#e9e2fb] bg-white/90 px-4 py-3 text-left shadow-[0_12px_30px_rgba(81,61,168,0.08)] dark:border-white/10 dark:bg-white/[0.04]"
                  initial={{ opacity: 0, y: 6 }}
                >
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#f4efff] px-3 py-1 text-xs font-semibold text-[#6f57f6] dark:bg-[#261e49] dark:text-[#cabfff]">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activePoint.color }} />
                    {activePoint.label}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{activePoint.pointLabel}</span>
                  <span className="text-sm text-[var(--text-secondary)]">{activePoint.label}</span>
                  <span className="text-sm font-black text-[var(--text-primary)]">{formatCompactDuration(activePoint.seconds)}</span>
                  <span className="text-xs text-[var(--text-muted)]">{activePoint.pointLabel} • {range.label}</span>
                  {pinnedPointKey ? (
                    <button
                      className="ml-auto rounded-full border border-[#e4deef] px-3 py-1 text-xs font-semibold text-[#68738c] dark:border-white/10 dark:text-white/70"
                      onClick={() => setPinnedPointKey(null)}
                      type="button"
                    >
                      Clear pin
                    </button>
                  ) : null}
                </motion.div>
              ) : null}
              <svg
                aria-label="Category focus line graph"
                className="block min-w-[42rem]"
                onPointerLeave={() => setHoveredPointKey(null)}
                onPointerMove={(event) => {
                  setNearestPointFromPointer(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
                }}
                onPointerUp={(event) => {
                  const nextPointKey = setNearestPointFromPointer(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
                  if (nextPointKey) {
                    setPinnedPointKey(nextPointKey);
                  }
                }}
                role="img"
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              >
                {[0, 0.5, 1].map((ratio) => {
                  const y = padding.top + plotHeight - ratio * plotHeight;
                  return (
                    <g key={ratio}>
                      <line
                        stroke="var(--border-soft)"
                        strokeDasharray={ratio === 0 ? undefined : "4 8"}
                        strokeWidth="1"
                        x1={padding.left}
                        x2={padding.left + plotWidth}
                        y1={y}
                        y2={y}
                      />
                      <text
                        fill="var(--text-muted)"
                        fontSize="10"
                        fontWeight="600"
                        textAnchor="end"
                        x={padding.left - 8}
                        y={y + 3}
                      >
                        {ratio === 0 ? "0" : formatRoundedMinuteDuration(maxSeconds * ratio)}
                      </text>
                    </g>
                  );
                })}

                {series.map((item) => {
                  const points = item.points.map((point, index) => (
                    getLinePointPosition(index, item.points.length, point.seconds, maxSeconds, plotWidth, plotHeight)
                  ));
                  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${padding.left + point.x} ${padding.top + point.y}`).join(" ");

                  return (
                    <g key={item.key}>
                      {points.length > 1 ? (
                        <path
                          d={path}
                          fill="none"
                          stroke={item.color}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="3"
                        />
                      ) : null}
                      {points.map((point, index) => (
                        <circle
                          cx={padding.left + point.x}
                          cy={padding.top + point.y}
                          fill="var(--surface-elevated)"
                          key={`${item.key}-${item.points[index]?.key ?? index}`}
                          onClick={() => setPinnedPointKey(`${item.key}:${item.points[index]?.key ?? index}`)}
                          r={(hoveredPointKey === `${item.key}:${item.points[index]?.key ?? index}` || pinnedPointKey === `${item.key}:${item.points[index]?.key ?? index}`)
                            ? 6
                            : item.points[index]?.seconds ? 4 : 2.5}
                          stroke={item.color}
                          strokeWidth="2"
                          style={{ cursor: "pointer", transition: "r 180ms ease" }}
                        />
                      ))}
                    </g>
                  );
                })}

                {activePoint ? (
                  <g>
                    <line
                      stroke={activePoint.color}
                      strokeDasharray="5 7"
                      strokeWidth="1.5"
                      x1={activePoint.x}
                      x2={activePoint.x}
                      y1={padding.top}
                      y2={padding.top + plotHeight}
                    />
                    <circle
                      cx={activePoint.x}
                      cy={activePoint.y}
                      fill={activePoint.color}
                      r={6}
                      stroke="white"
                      strokeWidth="2.5"
                    />
                  </g>
                ) : null}

                {axisPoints.map((point, index) => {
                  if (index !== 0 && index !== axisPoints.length - 1 && index % labelStep !== 0) {
                    return null;
                  }

                  const { x } = getLinePointPosition(index, axisPoints.length, 0, maxSeconds, plotWidth, plotHeight);

                  return (
                    <text
                      fill="var(--text-muted)"
                      fontSize="11"
                      key={point.key}
                      textAnchor="middle"
                      x={padding.left + x}
                      y={chartHeight - 12}
                    >
                      {point.label}
                    </text>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="rounded-[var(--radius-card)] bg-[var(--surface-muted)] px-4 py-6 text-center text-sm text-[var(--text-secondary)] dark:bg-white/[0.04]">
              No category activity to graph for this range yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FocusActivitySummaryCard({
  allHistory,
  categoryBars,
  categories,
  currentDate,
  deletingId,
  historyEntries,
  onDateChange,
  onDeleteEntry,
  onEditGoals,
  onEditHistoryEntry,
  onScopeChange,
  onShiftPeriod,
  overallBars,
  scope,
  totalLabel,
  trend,
}: {
  allHistory: HistoricalFocusSession[];
  categoryBars: DistributionBar[];
  categories: FocusCategory[];
  currentDate: string;
  deletingId: string | null;
  historyEntries: HistoricalFocusSession[];
  onDateChange: (date: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onEditGoals: () => void;
  onEditHistoryEntry: (entry: HistoricalFocusSession) => void;
  onScopeChange: (scope: TimeScope) => void;
  onShiftPeriod: (direction: number) => void;
  overallBars: DistributionBar[];
  scope: TimeScope;
  totalLabel: string;
  trend: ActivityTrendSummary | null;
}) {
  const [selectedMode, setSelectedMode] = useState<ActivitySummaryMode>("overall");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const rangeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const rangePickerRef = useRef<HTMLDivElement | null>(null);
  const selectedRangeOptionRef = useRef<HTMLButtonElement | null>(null);
  const bars = selectedMode === "overall" ? overallBars : categoryBars;
  const currentRange = useMemo(() => getScopeRange(scope, currentDate), [currentDate, scope]);
  const rangeOptions = useMemo(
    () => buildActivityRangeOptions(scope, currentDate, allHistory),
    [allHistory, currentDate, scope],
  );
  const data = useMemo<ActivityDataPoint[]>(
    () => bars.map((bar) => ({
      color: bar.color,
      day: bar.shortLabel,
      goalSeconds: bar.goalSeconds ?? 0,
      label: bar.label,
      seconds: bar.seconds,
    })),
    [bars],
  );
  const maxSeconds = useMemo(() => (
    data.reduce((max, item) => Math.max(max, item.seconds, item.goalSeconds), 0)
  ), [data]);

  const chartVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const barVariants = {
    hidden: { scaleY: 0, opacity: 0, transformOrigin: "bottom" },
    visible: {
      scaleY: 1,
      opacity: 1,
      transformOrigin: "bottom",
      transition: {
        duration: 0.5,
        ease: [0.4, 0, 0.2, 1] as const,
      },
    },
  };

  const trendClassName = trend?.tone === "negative"
    ? "text-[#d64f78]"
    : trend?.tone === "positive"
      ? "text-emerald-500"
      : "text-[var(--text-muted)]";

  useEffect(() => {
    if (!isRangePickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (rangeTriggerRef.current?.contains(target) || rangePickerRef.current?.contains(target)) {
        return;
      }
      setIsRangePickerOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setIsRangePickerOpen(false);
      rangeTriggerRef.current?.focus();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRangePickerOpen]);

  useEffect(() => {
    if (!isRangePickerOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      selectedRangeOptionRef.current?.scrollIntoView({ block: "nearest" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentDate, isRangePickerOpen, scope]);

  const selectRangeOption = (optionDate: string) => {
    onDateChange(optionDate);
    setIsRangePickerOpen(false);
    rangeTriggerRef.current?.focus();
  };

  return (
    <div
      aria-labelledby="activity-card-title"
      className="w-full overflow-visible rounded-[var(--radius-modal)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.03]"
    >
      <div className="px-5 pb-3 pt-5 sm:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Activity Summary</p>
              <h4 className="mt-2 text-2xl font-black tracking-tight text-[var(--text-primary)]" id="activity-card-title">Focus Activity</h4>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <TaskTableChipButton aria-label="Previous focus range" className="h-[18px] w-[26px] px-0 py-0" onClick={() => onShiftPeriod(-1)} toneClassName={FOCUS_ACTIVITY_OUTLINE_CHIP_CLASS}>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" viewBox="0 0 24 24">
                    <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </TaskTableChipButton>
                <div className="relative">
                  <button
                    aria-controls="focus-activity-range-picker"
                    aria-expanded={isRangePickerOpen}
                    aria-haspopup="listbox"
                    className="inline-flex h-7 min-h-0 items-center gap-1 overflow-hidden rounded-full border border-[#e4deef] bg-[var(--surface-elevated)] px-3 py-0 text-[#5f6b83] shadow-none transition hover:border-[#ddd2ff] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6a7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70 dark:hover:border-white/20 dark:hover:bg-white/[0.06] dark:focus-visible:ring-[#7f67ff] dark:focus-visible:ring-offset-[#140f26]"
                    onClick={() => setIsRangePickerOpen((current) => !current)}
                    ref={rangeTriggerRef}
                    type="button"
                  >
                    <span className="text-sm font-medium leading-none">
                      {currentRange.label}
                    </span>
                    <svg aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" viewBox="0 0 24 24">
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isRangePickerOpen ? (
                    <div
                      aria-label="Choose focus activity range"
                      className="adhdice-scrollbar absolute left-0 z-40 mt-2 max-h-64 w-[min(20rem,calc(100vw-3rem))] overflow-y-auto rounded-[1.25rem] border border-[#ede6ff] bg-white/95 p-2 text-left shadow-[0_20px_60px_rgba(111,87,246,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95"
                      id="focus-activity-range-picker"
                      ref={rangePickerRef}
                      role="listbox"
                    >
                      {rangeOptions.map((option) => (
                        <button
                          aria-selected={option.isSelected}
                          className={`flex w-full flex-col rounded-[1rem] border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6a7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-[#7f67ff] dark:focus-visible:ring-offset-[#140f26] ${option.isSelected ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[#ede6ff] hover:bg-[#f8f5ff] dark:hover:border-white/10 dark:hover:bg-white/[0.06]"}`}
                          key={option.date}
                          onClick={() => selectRangeOption(option.date)}
                          ref={option.isSelected ? selectedRangeOptionRef : undefined}
                          role="option"
                          type="button"
                        >
                          <span className="text-sm font-bold leading-tight">{option.label}</span>
                          <span className={`mt-1 text-xs leading-tight ${option.isSelected ? "text-white/80" : "text-[var(--text-muted)]"}`}>
                            {option.hint}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <TaskTableChipButton aria-label="Next focus range" className="h-[18px] w-[26px] px-0 py-0" onClick={() => onShiftPeriod(1)} toneClassName={FOCUS_ACTIVITY_OUTLINE_CHIP_CLASS}>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" viewBox="0 0 24 24">
                    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </TaskTableChipButton>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <div aria-label="Focus activity range" className="inline-flex items-center" role="group">
                {([
                  ["daily", "Daily"],
                  ["weekly", "Weekly"],
                  ["monthly", "Monthly"],
                ] as const).map(([value, label], index, items) => (
                  <TaskTableChipButton
                    aria-pressed={scope === value}
                    className={getConnectedActivityChipClass(index, items.length)}
                    key={value}
                    onClick={() => onScopeChange(value)}
                    toneClassName={scope === value ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : FOCUS_ACTIVITY_OUTLINE_CHIP_CLASS}
                  >
                    {label}
                  </TaskTableChipButton>
                ))}
              </div>
              <div aria-label="Focus activity view" className="inline-flex items-center" role="group">
                {([
                  ["overall", "Overall"],
                  ["categories", "Categories"],
                ] as const).map(([value, label], index, items) => (
                  <TaskTableChipButton
                    aria-pressed={selectedMode === value}
                    className={getConnectedActivityChipClass(index, items.length)}
                    key={value}
                    onClick={() => setSelectedMode(value)}
                    toneClassName={selectedMode === value ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : FOCUS_ACTIVITY_OUTLINE_CHIP_CLASS}
                  >
                    {label}
                  </TaskTableChipButton>
                ))}
              </div>
              <TaskTableChipButton onClick={onEditGoals} toneClassName={FOCUS_ACTIVITY_GOALS_CHIP_CLASS}>
                Edit Goals
              </TaskTableChipButton>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="flex flex-col items-start gap-5">
          <div className="flex flex-col">
            <p className="text-5xl font-bold tracking-tighter text-[var(--text-primary)]">
              {totalLabel}
            </p>
            <p className="mt-1 flex items-center gap-1 text-sm text-[var(--text-secondary)]">
              <TrendingUp className={`h-4 w-4 ${trendClassName}`} />
              {trend?.deltaLabel ?? "No prior period yet"}
            </p>
          </div>

          {data.length === 0 ? (
            <div className="w-full rounded-[var(--radius-card)] bg-[var(--surface-muted)] px-4 py-6 text-center text-sm text-[var(--text-secondary)] dark:bg-white/[0.04]">
              {scope === "daily" ? "No sessions logged for this day yet." : "No focused time logged across this scope yet."}
            </div>
          ) : (
            <div
              aria-label="Activity chart"
              className="min-w-0 w-full overflow-x-auto overscroll-x-contain pb-7"
              role="group"
            >
              <motion.div
                animate="visible"
                className="flex h-48 min-w-full items-end justify-between gap-3 pb-1 sm:gap-4"
                initial="hidden"
                key={`${scope}-${selectedMode}-${currentDate}`}
                variants={chartVariants}
              >
                {data.map((item, index) => {
                  const hasGoal = item.goalSeconds > 0;
                  const trackSeconds = hasGoal ? item.goalSeconds : item.seconds;
                  const trackHeightPercent = maxSeconds > 0 && trackSeconds > 0 ? (trackSeconds / maxSeconds) * 100 : 0;
                  const trackHeight = trackSeconds > 0 ? `${Math.max(8, trackHeightPercent)}%` : "0%";
                  const actualFillPercent = trackSeconds > 0 ? Math.min(100, (item.seconds / trackSeconds) * 100) : 0;
                  const actualFillHeight = item.seconds > 0 ? `${Math.max(6, actualFillPercent)}%` : "0%";
                  const valueLabel = formatActivityBarValue(item.seconds);
                  const goalLabel = hasGoal ? `Goal ${formatRoundedMinuteDuration(item.goalSeconds)}` : "No goal";

                  return (
                    <div
                      className="flex h-full w-20 min-w-[5rem] shrink-0 flex-col items-center justify-end gap-1.5 sm:w-24 sm:min-w-[6rem]"
                      key={`${item.label}-${index}`}
                      role="presentation"
                    >
                      <span className="h-4 w-full text-center text-xs font-bold tracking-tight text-[var(--text-primary)]">
                        {valueLabel}
                      </span>
                      <span className="h-3 w-full truncate text-center text-[10px] font-semibold text-[var(--text-muted)]">
                        {goalLabel}
                      </span>
                      <div className="flex h-28 w-full items-end justify-center">
                        <motion.div
                          aria-label={`${item.label}: ${valueLabel}`}
                          className={`relative w-full rounded-md border shadow-inner ${hasGoal ? "border-white/[0.8] bg-white/[0.85] dark:border-white/25 dark:bg-white/15" : "border-[var(--border-soft)] bg-[var(--surface-muted)] dark:border-white/10 dark:bg-white/[0.06]"}`}
                          style={{ height: trackHeight }}
                          variants={barVariants}
                        >
                          <div
                            className="absolute bottom-0 left-0 w-full rounded-md transition-all duration-500"
                            style={{
                              backgroundColor: item.color ?? "var(--accent)",
                              height: actualFillHeight,
                            }}
                          />
                        </motion.div>
                      </div>
                      <span
                        className="max-h-12 w-full overflow-hidden break-words text-center text-[10px] leading-tight text-[var(--text-muted)]"
                        title={item.label}
                      >
                        {item.day}
                      </span>
                    </div>
                  );
                })}
              </motion.div>
            </div>
          )}

          <section className="w-full rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">Focus History</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {historyEntries.length === 0
                    ? "No entries in this range"
                    : `${historyEntries.length} entr${historyEntries.length === 1 ? "y" : "ies"} in this range`}
                </p>
              </div>
              <TaskTableChipButton
                aria-expanded={isHistoryOpen}
                onClick={() => setIsHistoryOpen((current) => !current)}
              >
                {isHistoryOpen ? "Hide Entries" : "Show Entries"}
              </TaskTableChipButton>
            </div>

            {isHistoryOpen ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {historyEntries.length === 0 ? (
                  <p className="rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-3 py-4 text-center text-sm text-[var(--text-secondary)] dark:border-white/10 dark:bg-white/[0.03] md:col-span-2 xl:col-span-3">
                    No focus entries logged in this range.
                  </p>
                ) : (
                  historyEntries.map((entry) => {
                    const category = entry.categoryId ? categories.find((item) => item.id === entry.categoryId) : null;
                    return (
                      <div
                        className="min-w-0 rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]"
                        key={entry.id}
                      >
                        <div className="flex h-full flex-col gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[var(--text-primary)]" title={`${entry.title} • ${formatRoundedMinuteDuration(entry.durationSeconds)}`}>
                              {entry.title} • {formatRoundedMinuteDuration(entry.durationSeconds)}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                              {formatEntryDateLabel(entry.date)}
                              {category ? ` • ${category.title}` : " • One-off session"}
                              {entry.createdAt ? ` • Logged ${formatLoggedTime(entry.createdAt)}` : ""}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                              {[entry.focusType, entry.focusSubtype, entry.focusSubtype2].filter(Boolean).join(" / ")}
                              {entry.notes ? ` • ${entry.notes}` : ""}
                            </p>
                          </div>
                          <div className="mt-auto flex flex-wrap gap-2">
                            <TaskTableChipButton onClick={() => onEditHistoryEntry(entry)}>
                              Edit
                            </TaskTableChipButton>
                            <TaskTableChipButton
                              disabled={deletingId === entry.id}
                              onClick={() => void onDeleteEntry(entry.id)}
                              toneClassName="border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]"
                            >
                              {deletingId === entry.id ? "Deleting..." : "Delete"}
                            </TaskTableChipButton>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function formatEntryDateLabel(date: string) {
  return formatDisplayDate(date);
}

function formatLoggedTime(value?: string) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

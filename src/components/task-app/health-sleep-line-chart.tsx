"use client";

import { ActivityLineChartCard, type NumericLineChartSeries } from "../activity-line-chart-card";
import { formatHealthSleepDuration, type HealthDailySleepPoint } from "@/lib/health-utils";

function formatSleepDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? dateKey
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function HealthSleepLineChart({ series, sleepGoalMinutes }: { series: HealthDailySleepPoint[]; sleepGoalMinutes?: number | null }) {
  const firstDate = series[0]?.date ?? "";
  const lastDate = series.at(-1)?.date ?? firstDate;
  const chartSeries: NumericLineChartSeries[] = [{
    color: "#5f79ff",
    key: "sleep",
    label: "Sleep",
    points: series.map((point) => ({
      detailLabel: formatSleepDate(point.date),
      key: point.date,
      label: point.label,
      value: point.totalMinutes,
    })),
    totalValue: series.reduce((total, point) => total + point.totalMinutes, 0),
  }];

  return (
    <ActivityLineChartCard
      activePointContext={`${formatSleepDate(firstDate)} – ${formatSleepDate(lastDate)}`}
      ariaLabel="7-day sleep total line graph"
      emptyText="No sleep logged in this 7-day range."
      emptyWhenAllZero
      eyebrow="SLEEP SUMMARY"
      formatAxisValue={(value) => value === 0 ? "0" : formatHealthSleepDuration(value)}
      formatValue={formatHealthSleepDuration}
      series={chartSeries}
      subtitle={`${formatSleepDate(firstDate)} – ${formatSleepDate(lastDate)} • daily totals`}
      title="Sleep Activity"
      referenceLines={sleepGoalMinutes && sleepGoalMinutes > 0 ? [{ key: "sleep-goal", label: "Goal", value: sleepGoalMinutes }] : undefined}
      variant="embedded"
    />
  );
}

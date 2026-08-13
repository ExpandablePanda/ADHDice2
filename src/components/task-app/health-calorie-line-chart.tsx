"use client";

import { ActivityLineChartCard, type NumericLineChartSeries } from "../activity-line-chart-card";
import type { HealthDailyCaloriePoint } from "@/lib/health-library";

export function HealthCalorieLineChart({ series }: { series: HealthDailyCaloriePoint[] }) {
  const firstDate = series[0]?.date ?? "";
  const lastDate = series.at(-1)?.date ?? firstDate;
  const formatDate = (dateKey: string) => {
    const date = new Date(`${dateKey}T12:00:00`);
    return Number.isNaN(date.getTime()) ? dateKey : date.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" });
  };
  const chartSeries: NumericLineChartSeries[] = [{
    color: "#7c5cff",
    key: "calories",
    label: "Calories",
    points: series.map((point) => ({
      detailLabel: formatDate(point.date),
      key: point.date,
      label: point.label,
      value: point.calories,
    })),
    totalValue: series.reduce((total, point) => total + point.calories, 0),
  }];
  return (
    <ActivityLineChartCard
      activePointContext={`${formatDate(firstDate)} – ${formatDate(lastDate)}`}
      ariaLabel="7-day calorie line graph"
      emptyText="No calories logged in this 7-day range."
      emptyWhenAllZero
      eyebrow="NUTRITION SUMMARY"
      formatValue={(value) => `${Math.round(value)} kcal`}
      series={chartSeries}
      subtitle={`${formatDate(firstDate)} – ${formatDate(lastDate)} • daily points`}
      title="Calorie Activity"
      variant="embedded"
    />
  );
}

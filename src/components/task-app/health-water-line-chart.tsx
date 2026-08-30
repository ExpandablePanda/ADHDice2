"use client";

import { ActivityLineChartCard, type NumericLineChartSeries } from "../activity-line-chart-card";
import { formatHealthDateLabel } from "@/lib/health-utils";
import { buildHealthWaterHistory, formatQuantity, millilitersToWaterAmount } from "@/lib/health-library";

type HealthWaterHistoryDay = ReturnType<typeof buildHealthWaterHistory>[number];

export function HealthWaterLineChart({ history, waterGoalMl }: { history: HealthWaterHistoryDay[]; waterGoalMl: number | null }) {
  const chronologicalHistory = [...history].reverse();
  const firstDate = chronologicalHistory[0]?.dateKey ?? "";
  const lastDate = chronologicalHistory.at(-1)?.dateKey ?? firstDate;
  const formatDate = (dateKey: string) => formatHealthDateLabel(dateKey);
  const chartSeries: NumericLineChartSeries[] = [{
    color: "#4f9fbb",
    key: "water",
    label: "Water",
    points: chronologicalHistory.map((day) => ({
      detailLabel: formatDate(day.dateKey),
      key: day.dateKey,
      label: formatDate(day.dateKey),
      value: day.totals.fluidOunces,
    })),
    totalValue: chronologicalHistory.reduce((total, day) => total + day.totals.fluidOunces, 0),
  }];

  return (
    <ActivityLineChartCard
      activePointContext={`${formatDate(firstDate)} – ${formatDate(lastDate)}`}
      ariaLabel="Water line graph"
      emptyText="No past water logged in this range."
      emptyWhenAllZero
      eyebrow="WATER SUMMARY"
      formatValue={(value) => `${formatQuantity(value)} fl oz`}
      series={chartSeries}
      subtitle={`${formatDate(firstDate)} – ${formatDate(lastDate)} • daily totals`}
      title="Water Activity"
      referenceLines={waterGoalMl && waterGoalMl > 0 ? [{
        key: "water-goal",
        label: "Goal",
        value: millilitersToWaterAmount(waterGoalMl, "fl_oz"),
      }] : undefined}
      variant="embedded"
    />
  );
}

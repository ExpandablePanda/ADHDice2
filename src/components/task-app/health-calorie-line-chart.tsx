"use client";

import { useMemo, useState } from "react";

import type { HealthDailyCaloriePoint } from "@/lib/health-library";

type HealthCalorieLineChartProps = {
  series: HealthDailyCaloriePoint[];
};

type ChartPoint = HealthDailyCaloriePoint & {
  x: number;
  y: number;
};

const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const CHART_PADDING = { top: 24, right: 24, bottom: 42, left: 44 };
const PLOT_WIDTH = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
const PLOT_HEIGHT = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

export function HealthCalorieLineChart({ series }: HealthCalorieLineChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const maxCalories = Math.max(1, ...series.map((point) => point.calories));
  const chartPoints = useMemo<ChartPoint[]>(() => series.map((point, index) => ({
    ...point,
    x: CHART_PADDING.left + (series.length <= 1 ? PLOT_WIDTH / 2 : (index / (series.length - 1)) * PLOT_WIDTH),
    y: CHART_PADDING.top + PLOT_HEIGHT - (point.calories / maxCalories) * PLOT_HEIGHT,
  })), [maxCalories, series]);
  const activeIndex = hoveredIndex ?? pinnedIndex;
  const activePoint = activeIndex === null ? null : chartPoints[activeIndex] ?? null;
  const hasCalories = series.some((point) => point.calories > 0);
  const path = chartPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  function selectNearestPoint(clientX: number, bounds: DOMRect) {
    if (chartPoints.length === 0) {
      return null;
    }
    const localX = ((clientX - bounds.left) / Math.max(bounds.width, 1)) * CHART_WIDTH;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    chartPoints.forEach((point, index) => {
      const distance = Math.abs(point.x - localX);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });
    setHoveredIndex(nearestIndex);
    return nearestIndex;
  }

  function formatCalories(value: number) {
    return `${Math.round(value)} kcal`;
  }

  return (
    <div className="mt-4 border-t border-[#eeeaf8] pt-4 dark:border-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">7-Day Calories</h4>
          <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">Daily totals from meal history</p>
        </div>
        {activePoint ? <p className="text-xs font-semibold text-[#5f4bd7] dark:text-[#cabfff]">{activePoint.date} · {formatCalories(activePoint.calories)}</p> : null}
      </div>
      <ul className="sr-only">
        {series.map((point) => <li key={point.date}>{point.date}: {formatCalories(point.calories)}</li>)}
      </ul>
      {!hasCalories ? (
        <p className="mt-3 rounded-[1rem] bg-[#fbfaff] px-4 py-4 text-center text-sm text-[#7d7598] dark:bg-white/[0.04] dark:text-white/55">No calories logged in this 7-day range.</p>
      ) : (
        <div className="mt-3 min-w-0 overflow-x-auto pb-1">
          <svg
            aria-label="7-day calorie line graph"
            className="block min-w-[36rem]"
            onPointerLeave={() => setHoveredIndex(null)}
            onPointerMove={(event) => {
              selectNearestPoint(event.clientX, event.currentTarget.getBoundingClientRect());
            }}
            onPointerUp={(event) => {
              const nextIndex = selectNearestPoint(event.clientX, event.currentTarget.getBoundingClientRect());
              if (nextIndex !== null) {
                setPinnedIndex(nextIndex);
              }
            }}
            role="img"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          >
            {[0, 0.5, 1].map((ratio) => {
              const y = CHART_PADDING.top + PLOT_HEIGHT - ratio * PLOT_HEIGHT;
              return (
                <g key={ratio}>
                  <line
                    stroke="var(--border-soft)"
                    strokeDasharray={ratio === 0 ? undefined : "4 8"}
                    strokeWidth="1"
                    x1={CHART_PADDING.left}
                    x2={CHART_PADDING.left + PLOT_WIDTH}
                    y1={y}
                    y2={y}
                  />
                  <text fill="var(--text-muted)" fontSize="10" fontWeight="600" textAnchor="end" x={CHART_PADDING.left - 8} y={y + 3}>
                    {Math.round(maxCalories * ratio)}
                  </text>
                </g>
              );
            })}
            {chartPoints.length > 1 ? <path d={path} fill="none" stroke="#7c5cff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /> : null}
            {chartPoints.map((point, index) => (
              <circle
                aria-label={`${point.date}: ${formatCalories(point.calories)}`}
                cx={point.x}
                cy={point.y}
                fill="var(--surface-elevated)"
                key={point.date}
                onClick={() => setPinnedIndex(index)}
                onFocus={() => setHoveredIndex(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setPinnedIndex(index);
                  }
                }}
                r={activeIndex === index ? 6 : point.calories > 0 ? 4 : 2.5}
                role="button"
                stroke="#7c5cff"
                strokeWidth="2"
                tabIndex={0}
              />
            ))}
            {activePoint ? (
              <g>
                <line stroke="#7c5cff" strokeDasharray="5 7" strokeWidth="1.5" x1={activePoint.x} x2={activePoint.x} y1={CHART_PADDING.top} y2={CHART_PADDING.top + PLOT_HEIGHT} />
                <circle cx={activePoint.x} cy={activePoint.y} fill="#7c5cff" r={6} stroke="white" strokeWidth="2.5" />
              </g>
            ) : null}
            {chartPoints.map((point) => (
              <text fill="var(--text-muted)" fontSize="11" key={`${point.date}-label`} textAnchor="middle" x={point.x} y={CHART_HEIGHT - 12}>{point.label}</text>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

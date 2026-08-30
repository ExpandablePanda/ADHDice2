"use client";

import { useId, useMemo, useState } from "react";

export type NumericLineChartPoint = {
  detailLabel?: string;
  key: string;
  label: string;
  value: number;
};

export type NumericLineChartSeries = {
  color: string;
  key: string;
  label: string;
  points: NumericLineChartPoint[];
  totalValue: number;
};

type ActivityLineChartCardProps = {
  activePointContext?: string;
  ariaLabel: string;
  emptyText: string;
  emptyWhenAllZero?: boolean;
  eyebrow: string;
  formatAxisValue?: (value: number) => string;
  formatValue: (value: number) => string;
  maxValue?: number;
  series: NumericLineChartSeries[];
  subtitle: string;
  title: string;
  variant?: "standalone" | "embedded";
};

type InteractivePoint = NumericLineChartPoint & {
  color: string;
  pointKey: string;
  seriesLabel: string;
  x: number;
  y: number;
};

const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const PADDING = { top: 24, right: 24, bottom: 42, left: 68 };
const PLOT_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

function getLinePointPosition(index: number, pointCount: number, value: number, maxValue: number) {
  const x = pointCount <= 1 ? PLOT_WIDTH / 2 : (index / (pointCount - 1)) * PLOT_WIDTH;
  const y = PLOT_HEIGHT - ((maxValue > 0 ? value / maxValue : 0) * PLOT_HEIGHT);
  return { x, y };
}

export function getNearestNumericLineChartPoint(
  points: ReadonlyArray<{ pointKey: string; x: number; y: number }>,
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
) {
  if (!points.length) {
    return null;
  }
  const localX = ((clientX - bounds.left) / Math.max(bounds.width, 1)) * CHART_WIDTH;
  const localY = ((clientY - bounds.top) / Math.max(bounds.height, 1)) * CHART_HEIGHT;
  let nearestPoint = points[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = Math.hypot(point.x - localX, point.y - localY);
    if (distance < nearestDistance) {
      nearestPoint = point;
      nearestDistance = distance;
    }
  }
  return nearestPoint.pointKey;
}

export function ActivityLineChartCard({
  activePointContext,
  ariaLabel,
  emptyText,
  emptyWhenAllZero = false,
  eyebrow,
  formatAxisValue,
  formatValue,
  maxValue: maxValueOverride,
  series,
  subtitle,
  title,
  variant = "standalone",
}: ActivityLineChartCardProps) {
  const titleId = useId();
  const [hoveredPointKey, setHoveredPointKey] = useState<string | null>(null);
  const [pinnedPointKey, setPinnedPointKey] = useState<string | null>(null);
  const axisValueFormatter = formatAxisValue ?? formatValue;
  const maxValue = Math.max(1, maxValueOverride ?? 0, ...series.flatMap((item) => item.points.map((point) => point.value)));
  const axisPoints = series[0]?.points ?? [];
  const labelStep = Math.max(1, Math.ceil(axisPoints.length / 6));
  const interactivePoints = useMemo(() => (
    series.flatMap((item) => item.points.map((point, index) => {
      const position = getLinePointPosition(index, item.points.length, point.value, maxValue);
      return {
        ...point,
        color: item.color,
        pointKey: `${item.key}:${point.key}`,
        seriesLabel: item.label,
        x: PADDING.left + position.x,
        y: PADDING.top + position.y,
      } satisfies InteractivePoint;
    }))
  ), [maxValue, series]);
  const activePoint = interactivePoints.find((point) => point.pointKey === (hoveredPointKey ?? pinnedPointKey))
    ?? interactivePoints.find((point) => point.pointKey === pinnedPointKey)
    ?? null;
  const hasData = series.length > 0 && axisPoints.length > 0 && !(emptyWhenAllZero && series.every((item) => item.points.every((point) => point.value === 0)));
  const isEmbedded = variant === "embedded";

  function setNearestPointFromPointer(clientX: number, clientY: number, bounds: DOMRect) {
    const nearestPointKey = getNearestNumericLineChartPoint(interactivePoints, clientX, clientY, bounds);
    if (nearestPointKey) {
      setHoveredPointKey(nearestPointKey);
    }
    return nearestPointKey;
  }

  return (
    <div aria-labelledby={titleId} className={isEmbedded ? "w-full border-t border-[#eeeaf8] pt-4 dark:border-white/10" : "w-full overflow-hidden rounded-[var(--radius-modal)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.03]"}>
      <div className={isEmbedded ? "px-0 pb-0 pt-0" : "px-5 pb-5 pt-5 sm:px-6 sm:pb-6"}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">{eyebrow}</p>
              <h4 className={`mt-2 font-black tracking-tight text-[var(--text-primary)] ${isEmbedded ? "text-lg" : "text-2xl"}`} id={titleId}>{title}</h4>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
            </div>
            {series.length > 0 ? (
              <div className="flex max-w-2xl flex-wrap gap-2 lg:justify-end">
                {series.map((item) => (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e4deef] bg-[var(--surface-elevated)] px-2.5 py-1 text-[11px] font-semibold leading-none text-[#68738c] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60" key={item.key}>
                    <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.label}
                    <span className="text-[var(--text-muted)]">{formatValue(item.totalValue)}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {hasData ? (
            <div className="min-w-0 overflow-x-auto pb-2">
              <ul className="sr-only">
                {interactivePoints.map((point) => (
                  <li key={`accessible-${point.pointKey}`}>
                    {point.seriesLabel}: {point.detailLabel ?? point.label}: {formatValue(point.value)}
                  </li>
                ))}
              </ul>
              <svg
                aria-label={ariaLabel}
                className={`block ${isEmbedded ? "w-[640px] min-w-[640px] sm:w-full sm:min-w-0" : "min-w-[42rem]"}`}
                onPointerLeave={() => setHoveredPointKey(null)}
                onPointerMove={(event) => { setNearestPointFromPointer(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()); }}
                onPointerUp={(event) => {
                  const nextPointKey = setNearestPointFromPointer(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
                  if (nextPointKey) setPinnedPointKey(nextPointKey);
                }}
                role="img"
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              >
                {[0, 0.5, 1].map((ratio) => {
                  const y = PADDING.top + PLOT_HEIGHT - ratio * PLOT_HEIGHT;
                  return (
                    <g key={ratio}>
                      <line stroke="var(--border-soft)" strokeDasharray={ratio === 0 ? undefined : "4 8"} strokeWidth="1" x1={PADDING.left} x2={PADDING.left + PLOT_WIDTH} y1={y} y2={y} />
                      <text fill="var(--text-muted)" fontSize="10" fontWeight="600" textAnchor="end" x={PADDING.left - 8} y={y + 3}>{axisValueFormatter(maxValue * ratio)}</text>
                    </g>
                  );
                })}
                {series.map((item) => {
                  const points = item.points.map((point, index) => getLinePointPosition(index, item.points.length, point.value, maxValue));
                  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${PADDING.left + point.x} ${PADDING.top + point.y}`).join(" ");
                  return (
                    <g key={item.key}>
                      {points.length > 1 ? <path d={path} fill="none" stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /> : null}
                      {points.map((point, index) => {
                        const pointKey = `${item.key}:${item.points[index]?.key ?? index}`;
                        const pointLabel = item.points[index]?.detailLabel ?? item.points[index]?.label ?? "Point";
                        return <circle aria-label={`${item.label}: ${pointLabel}: ${formatValue(item.points[index]?.value ?? 0)}`} cx={PADDING.left + point.x} cy={PADDING.top + point.y} fill="var(--surface-elevated)" key={pointKey} onClick={() => setPinnedPointKey(pointKey)} onFocus={() => setHoveredPointKey(pointKey)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPinnedPointKey(pointKey); } }} r={hoveredPointKey === pointKey || pinnedPointKey === pointKey ? 6 : item.points[index]?.value ? 4 : 2.5} role="button" stroke={item.color} strokeWidth="2" tabIndex={0} />;
                      })}
                    </g>
                  );
                })}
                {activePoint ? <g><line stroke={activePoint.color} strokeDasharray="5 7" strokeWidth="1.5" x1={activePoint.x} x2={activePoint.x} y1={PADDING.top} y2={PADDING.top + PLOT_HEIGHT} /><circle cx={activePoint.x} cy={activePoint.y} fill={activePoint.color} r={6} stroke="white" strokeWidth="2.5" /></g> : null}
                {axisPoints.map((point, index) => {
                  if (index !== 0 && index !== axisPoints.length - 1 && index % labelStep !== 0) return null;
                  const { x } = getLinePointPosition(index, axisPoints.length, 0, maxValue);
                  return <text fill="var(--text-muted)" fontSize="11" key={point.key} textAnchor="middle" x={PADDING.left + x} y={CHART_HEIGHT - 12}>{point.label}</text>;
                })}
              </svg>
            </div>
          ) : (
            <div className="rounded-[var(--radius-card)] bg-[var(--surface-muted)] px-4 py-6 text-center text-sm text-[var(--text-secondary)] dark:bg-white/[0.04]">{emptyText}</div>
          )}
          <div className="flex min-h-[3.5rem] flex-wrap items-center gap-3 rounded-[1.2rem] border border-[#e9e2fb] bg-white/90 px-4 py-3 text-left shadow-[0_12px_30px_rgba(81,61,168,0.08)] dark:border-white/10 dark:bg-white/[0.04]">
            {activePoint ? (
              <>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#f4efff] px-3 py-1 text-xs font-semibold text-[#6f57f6] dark:bg-[#261e49] dark:text-[#cabfff]">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activePoint.color }} />
                  {activePoint.seriesLabel}
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{activePoint.detailLabel ?? activePoint.label}</span>
                <span className="text-sm text-[var(--text-secondary)]">{activePoint.seriesLabel}</span>
                <span className="text-sm font-black text-[var(--text-primary)]">{formatValue(activePoint.value)}</span>
                {activePointContext ? <span className="text-xs text-[var(--text-muted)]">{activePointContext}</span> : null}
                {pinnedPointKey ? <button className="ml-auto rounded-full border border-[#e4deef] px-3 py-1 text-xs font-semibold text-[#68738c] dark:border-white/10 dark:text-white/70" onClick={() => setPinnedPointKey(null)} type="button">Clear pin</button> : null}
              </>
            ) : (
              <span className="text-sm text-[var(--text-muted)]">Hover over a point to see its details.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

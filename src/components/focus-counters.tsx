"use client";

import { Settings } from "lucide-react";
import {
  FOCUS_CLOCK_BASE_HEIGHT_PX,
  FOCUS_CLOCK_BASE_WIDTH_PX,
  FOCUS_CLOCK_DESKTOP_SCALE_CLASSNAME,
  FOCUS_CLOCK_MOBILE_SCALE,
} from "./focus-clocks";
import { CategoryIcon } from "./task-app";
import type { FocusCounter, FocusCounterHistoryEntry } from "@/lib/types";

function formatCounterDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta}`;
}

export function FocusCounterRow({
  counters,
  embedded = false,
  onAdjust,
  onEdit,
}: {
  counters: FocusCounter[];
  embedded?: boolean;
  onAdjust: (counterId: string, direction: 1 | -1) => void;
  onEdit: (counterId: string) => void;
}) {
  if (counters.length === 0) {
    return null;
  }

  return (
    <div className={embedded ? "" : "mt-6"}>
      <div className="adhdice-scrollbar w-full overflow-x-auto pb-4 pt-4 sm:hidden" style={{ WebkitOverflowScrolling: "touch" }}>
        <div
          style={{
            display: "grid",
            gridTemplateRows: "repeat(2, auto)",
            gridAutoFlow: "column",
            width: "max-content",
            minWidth: "100%",
            justifyContent: "center",
            columnGap: 24,
            rowGap: 10,
            paddingLeft: 16,
            paddingRight: 16,
          }}
        >
          {counters.map((counter) => (
            <div
              key={counter.id}
              style={{
                transform: `scale(${FOCUS_CLOCK_MOBILE_SCALE})`,
                transformOrigin: "top center",
                width: FOCUS_CLOCK_BASE_WIDTH_PX * FOCUS_CLOCK_MOBILE_SCALE,
                height: FOCUS_CLOCK_BASE_HEIGHT_PX * FOCUS_CLOCK_MOBILE_SCALE,
                flexShrink: 0,
              }}
            >
              <FocusCounterCard counter={counter} onAdjust={onAdjust} onEdit={onEdit} />
            </div>
          ))}
        </div>
      </div>
      <div className={`hidden justify-center pt-4 sm:flex ${FOCUS_CLOCK_DESKTOP_SCALE_CLASSNAME}`}>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-10">
        {counters.map((counter) => (
          <div
            className="relative h-[calc(344px*var(--clock-scale))] w-[calc(272px*var(--clock-scale))]"
            key={counter.id}
          >
            <div className="absolute left-1/2 top-0 h-[344px] w-[272px] -translate-x-1/2">
              <div
                className="h-[344px] w-[272px]"
                style={{
                  transform: "scale(var(--clock-scale))",
                  transformOrigin: "top center",
                }}
              >
                <FocusCounterCard counter={counter} onAdjust={onAdjust} onEdit={onEdit} />
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

function FocusCounterCard({
  counter,
  onAdjust,
  onEdit,
}: {
  counter: FocusCounter;
  onAdjust: (counterId: string, direction: 1 | -1) => void;
  onEdit: (counterId: string) => void;
}) {
  const progress = Math.min(1, Math.abs(counter.value) / Math.max(1, counter.goal));
  const radius = 128;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="group relative flex h-[344px] w-[272px] flex-col items-center gap-3 transition-all duration-500 hover:-translate-y-2">
      <div className="relative flex h-68 w-68 items-center justify-center transition-transform duration-500 group-hover:scale-[1.02]">
        <button
          aria-label={`Decrease ${counter.title}`}
          className="absolute left-6 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#f8d9dc] bg-[#fff1f2]/95 text-[#d64b5f] shadow-[0_8px_20px_rgba(214,75,95,0.14)] transition hover:scale-105 dark:border-[#5a2432] dark:bg-[#2e1820]/95 dark:text-[#ff9fbc]"
          onClick={() => onAdjust(counter.id, -1)}
          type="button"
        >
          <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.8" viewBox="0 0 24 24">
            <path d="M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          aria-label={`Increase ${counter.title}`}
          className="absolute right-6 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#bcebd8] bg-[#eef9f4]/95 text-[#12a876] shadow-[0_8px_20px_rgba(18,168,118,0.14)] transition hover:scale-105 dark:border-[#315f51] dark:bg-[#19352e]/95 dark:text-[#7de4b8]"
          onClick={() => onAdjust(counter.id, 1)}
          type="button"
        >
          <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.8" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <svg
          className="absolute inset-0 h-full w-full -rotate-90 scale-[1.01]"
          style={{ filter: `drop-shadow(0 0 18px ${counter.color}33)` }}
          viewBox="0 0 272 272"
        >
          <circle
            className="text-[#f0ecfc] dark:text-white/[0.03]"
            cx="136"
            cy="136"
            fill="transparent"
            r={radius}
            stroke="currentColor"
            strokeWidth="7"
          />
          <circle
            cx="136"
            cy="136"
            fill="transparent"
            r={radius}
            stroke={counter.color}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            strokeWidth="7"
            style={{
              transition: "stroke-dashoffset 0.35s ease-out",
              filter: `drop-shadow(0 0 8px ${counter.color}80)`,
            }}
          />
        </svg>
        <div className="relative z-10 flex h-60 w-60 flex-col items-center justify-center rounded-full border border-white/40 bg-white/45 px-5 text-center shadow-[0_8px_32px_rgba(31,38,135,0.07)] backdrop-blur-[8px] dark:border-white/5 dark:bg-white/[0.02] dark:shadow-[0_24px_48px_rgba(0,0,0,0.2)] dark:backdrop-blur-[12px]">
          <div className="mb-3 transition-transform duration-300" style={{ color: counter.color }}>
            <CategoryIcon className="h-9 w-9" name={counter.icon} />
          </div>
          <p className="text-[2.6rem] font-black tabular-nums tracking-tight text-[#1f2746] dark:text-white">
            {counter.value}
          </p>
          <div className="mt-3 flex max-w-[11.5rem] flex-col items-center">
            <p className="line-clamp-2 text-xl font-medium normal-case leading-snug tracking-normal break-words text-[var(--text-secondary)] dark:text-white/70">
              {counter.title}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Step {counter.step} • Goal {counter.goal}
            </p>
          </div>
        </div>
      </div>
      <button
        aria-label={`Open ${counter.title} counter settings`}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#ece8f8] bg-white text-[#6a738d] shadow-[0_8px_20px_rgba(0,0,0,0.05)] transition hover:scale-105 dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-[0_8px_20px_rgba(0,0,0,0.2)]"
        onClick={() => onEdit(counter.id)}
        type="button"
      >
        <Settings className="h-5 w-5" />
      </button>
    </div>
  );
}

export function FocusCounterHistoryCard({
  countersById,
  history,
}: {
  countersById: Map<string, FocusCounter>;
  history: FocusCounterHistoryEntry[];
}) {
  if (history.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto mt-6 w-full max-w-6xl">
      <div className="rounded-[1.6rem] border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Counter Activity</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-[var(--text-primary)]">Recent Counter Changes</h3>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">Separate from Focus timer history and minute totals.</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {history.slice(0, 8).map((entry) => {
            const counter = countersById.get(entry.counterId);
            return (
              <div
                className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-[#ece8f8] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]"
                key={entry.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{entry.counterTitleSnapshot}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Step {entry.stepSnapshot} • New total {entry.nextValue}
                    {counter ? ` • Goal ${counter.goal}` : ""}
                  </p>
                </div>
                <div className={`shrink-0 rounded-full px-3 py-1 text-sm font-black ${entry.delta > 0 ? "bg-[#eef9f4] text-[#12a876] dark:bg-[#19352e] dark:text-[#7de4b8]" : "bg-[#fff1f2] text-[#d64b5f] dark:bg-[#2e1820] dark:text-[#ff9fbc]"}`}>
                  {formatCounterDelta(entry.delta)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { AdhdChip, AdhdIconButton } from "@/components/ui-system";

export type CalendarMonthPresentationDay = {
  date: Date;
  dateKey: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
};

export type CalendarMonthPresentationProps = {
  ariaLabel: string;
  description?: ReactNode;
  headerLabel: string;
  legend?: ReactNode;
  monthDays: readonly CalendarMonthPresentationDay[];
  monthLabel: string;
  nextMonthDisabled?: boolean;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onToday?: () => void;
  previousMonthDisabled?: boolean;
  renderDay: (day: CalendarMonthPresentationDay) => ReactNode;
  toolbar?: ReactNode;
  weekdayLabels: readonly string[];
};

export function CalendarMonthPresentation({
  ariaLabel,
  description,
  headerLabel,
  legend,
  monthDays,
  monthLabel,
  nextMonthDisabled = false,
  onNextMonth,
  onPreviousMonth,
  onToday,
  previousMonthDisabled = false,
  renderDay,
  toolbar,
  weekdayLabels,
}: CalendarMonthPresentationProps) {
  return (
    <section aria-label={ariaLabel} className="rounded-[1.35rem] border border-[#ede7f7] bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">{headerLabel}</p>
          {description ? <p className="mt-1 text-sm text-[#827a97] dark:text-white/52">{description}</p> : null}
          {toolbar ? <div className="mt-3 flex flex-wrap gap-2">{toolbar}</div> : null}
        </div>
        <div className="flex items-center gap-1">
          <AdhdIconButton aria-label="Previous month" disabled={previousMonthDisabled} onClick={onPreviousMonth} size="sm" variant="rowToolbar">
            <ChevronLeft />
          </AdhdIconButton>
          <p className="min-w-32 text-center text-sm font-semibold text-[#4e4865] dark:text-white/80">{monthLabel}</p>
          <AdhdIconButton aria-label="Next month" disabled={nextMonthDisabled} onClick={onNextMonth} size="sm" variant="rowToolbar">
            <ChevronRight />
          </AdhdIconButton>
          {onToday ? <AdhdChip className="ml-1" onClick={onToday} tone="purple" type="button">Today</AdhdChip> : null}
        </div>
      </div>
      {legend ? <div className="mt-4 flex flex-wrap items-center gap-2">{legend}</div> : null}
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[38rem]">
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9b92be] dark:text-white/35" role="row">
            {weekdayLabels.map((label) => <span key={label} role="columnheader">{label}</span>)}
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1.5" role="grid">
            {monthDays.map((day) => <div key={day.dateKey}>{renderDay(day)}</div>)}
          </div>
        </div>
      </div>
    </section>
  );
}

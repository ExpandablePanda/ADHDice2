"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";

export const PURSUIT_CALENDAR_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type PursuitCalendarHistoryEntry = {
  detail?: ReactNode;
  key: string;
  label: ReactNode;
  status: ReactNode;
};

export type PursuitCalendarPresentationProps = {
  ariaLabel: string;
  description: ReactNode;
  historyEntries: readonly PursuitCalendarHistoryEntry[];
  historyDescription: string;
  historySummary: readonly { label: string; value: string }[];
  historyTitle: string;
  monthDays: readonly (string | null)[];
  monthLabel: string;
  onChangeMonth: (amount: number) => void;
  nextMonthDisabled?: boolean;
  previousMonthDisabled?: boolean;
  renderDay: (day: string | null, index: number) => ReactNode;
  selectedDayAction: ReactNode;
  selectedDayContent?: ReactNode;
  selectedDayLabel: ReactNode;
  selectedDayStatus: ReactNode;
};

export function getPursuitCalendarMonthDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: firstDay.getUTCDay() + dayCount }, (_, index) => {
    if (index < firstDay.getUTCDay()) return null;
    const day = index - firstDay.getUTCDay() + 1;
    return `${monthKey}-${String(day).padStart(2, "0")}`;
  });
}

export function shiftPursuitCalendarMonth(monthKey: string, amount: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatPursuitCalendarDay(logicalDay: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: timezone }).format(new Date(`${logicalDay}T12:00:00Z`));
}

export function formatPursuitCalendarMonth(monthKey: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: timezone }).format(new Date(`${monthKey}-01T12:00:00Z`));
}

export function PursuitCalendarDay({
  ariaLabel,
  day,
  disabled = false,
  muted = false,
  onClick,
  selected = false,
  stateClassName,
  title,
}: {
  ariaLabel?: string;
  day: string | null;
  disabled?: boolean;
  muted?: boolean;
  onClick?: () => void;
  selected?: boolean;
  stateClassName?: string;
  title?: string;
}) {
  const dayClassName = day
    ? stateClassName ?? "border-[#eee9f8] bg-[#fbfaff] text-[#7d7598] hover:border-[#cfc2fb] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55"
    : "cursor-default border-transparent bg-transparent";
  return (
    <button
      aria-label={ariaLabel}
      className={`min-h-10 rounded-[0.7rem] border text-sm transition ${dayClassName} ${selected ? "ring-2 ring-[#b9a8ff]" : ""} ${muted && day ? "cursor-default opacity-45" : ""}`}
      disabled={!day || disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {day ? day.slice(-2) : null}
    </button>
  );
}

export function PursuitSummaryStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[0.75rem] bg-[#f7f4ff] px-2.5 py-1.5 dark:bg-white/[0.05]"><p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#9b92be] dark:text-white/35">{label}</p><p className="mt-1 text-sm font-semibold text-[#4e4865] dark:text-white/80">{value}</p></div>;
}

export function PursuitSelectedDayPresentation({
  action,
  children,
  label,
  status,
}: {
  action: ReactNode;
  children?: ReactNode;
  label: ReactNode;
  status: ReactNode;
}) {
  return (
    <div className="mt-3 rounded-[0.85rem] bg-[#fbfaff] px-3 py-3 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#4e4865] dark:text-white/80">{label}</p>
          <p className="mt-1 text-xs text-[#827a97] dark:text-white/52">{status}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function PursuitHistoryPresentation({ emptyText = "No completed days yet.", entries, summary, summaryStats }: {
  emptyText?: string;
  entries: readonly PursuitCalendarHistoryEntry[];
  summary: { description: string; title: string };
  summaryStats: readonly { label: string; value: string }[];
}) {
  return (
    <div className="mt-4 border-t border-[#eee9f8] pt-3 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">{summary.title}</p>
          <p className="mt-1 text-xs text-[#827a97] dark:text-white/52">{summary.description}</p>
        </div>
        <div className="grid grid-cols-4 gap-1.5 text-right">
          {summaryStats.map((stat) => <PursuitSummaryStat key={stat.label} {...stat} />)}
        </div>
      </div>
      {entries.length === 0 ? <p className="mt-3 rounded-[0.75rem] bg-[#fbfaff] px-3 py-3 text-sm text-[#8d87a7] dark:bg-white/[0.04] dark:text-white/45">{emptyText}</p> : <div className="mt-3 divide-y divide-[#eee9f8] rounded-[0.75rem] border border-[#eee9f8] dark:divide-white/10 dark:border-white/10">{entries.map((entry) => <div className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm" key={entry.key}><div><span className="font-semibold text-[#4e4865] dark:text-white/78">{entry.label}</span>{entry.detail}</div>{entry.status}</div>)}</div>}
    </div>
  );
}

export function PursuitCalendarPresentation({
  ariaLabel,
  description,
  historyEntries,
  historyDescription,
  historySummary,
  historyTitle,
  monthDays,
  monthLabel,
  onChangeMonth,
  nextMonthDisabled = false,
  previousMonthDisabled = false,
  renderDay,
  selectedDayAction,
  selectedDayContent,
  selectedDayLabel,
  selectedDayStatus,
}: PursuitCalendarPresentationProps) {
  return (
    <section aria-label={ariaLabel} className="rounded-[1rem] border border-[#ede7f7] bg-white p-3 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">{ariaLabel}</p>
          <p className="mt-1 text-sm text-[#827a97] dark:text-white/52">{description}</p>
        </div>
        <div className="flex items-center gap-1">
          <AdhdIconButton aria-label="Previous month" disabled={previousMonthDisabled} onClick={() => onChangeMonth(-1)} size="sm" variant="rowToolbar"><ChevronLeft /></AdhdIconButton>
          <p className="min-w-32 text-center text-sm font-semibold text-[#4e4865] dark:text-white/80">{monthLabel}</p>
          <AdhdIconButton aria-label="Next month" disabled={nextMonthDisabled} onClick={() => onChangeMonth(1)} size="sm" variant="rowToolbar"><ChevronRight /></AdhdIconButton>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9b92be] dark:text-white/35">{PURSUIT_CALENDAR_WEEKDAY_LABELS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">{monthDays.map((day, index) => <Fragment key={day ?? `blank-${index}`}>{renderDay(day, index)}</Fragment>)}</div>
      <PursuitSelectedDayPresentation action={selectedDayAction} label={selectedDayLabel} status={selectedDayStatus}>{selectedDayContent}</PursuitSelectedDayPresentation>
      <PursuitHistoryPresentation entries={historyEntries} summary={{ description: historyDescription, title: historyTitle }} summaryStats={historySummary} />
    </section>
  );
}

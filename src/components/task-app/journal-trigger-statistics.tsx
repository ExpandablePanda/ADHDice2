"use client";

import { useMemo, useState } from "react";

import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import type {
  HealthCheckIn,
  HealthJournalSignal,
  HealthJournalSignalOccurrence,
  HealthJournalTrigger,
  HealthJournalTriggerLink,
  HealthSymptom,
  HealthSymptomEntry,
} from "@/lib/database.types";
import {
  buildHealthJournalTriggerStatistics,
  getHealthJournalTriggerTimelineForSelection,
  type HealthJournalTriggerStatisticsRange,
  type HealthJournalTriggerTimelinePeriod,
} from "@/lib/health-journal-trigger-statistics";
import { todayHealthDate } from "@/lib/health-utils";
import { HealthDropdown } from "./health-dropdown";

const RANGE_OPTIONS: Array<{ label: string; value: HealthJournalTriggerStatisticsRange }> = [
  { label: "7 days", value: "7_days" },
  { label: "30 days", value: "30_days" },
  { label: "90 days", value: "90_days" },
  { label: "All Time", value: "all_time" },
];

const EFFECT_LABELS = {
  associated: "Associated",
  improved: "Improved",
  worsened: "Worsened",
} as const;

function dateAtLocalNoon(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatDate(dateKey: string, includeYear = false) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
  }).format(dateAtLocalNoon(dateKey));
}

export function formatJournalTriggerTimelinePeriodLabel(
  period: HealthJournalTriggerTimelinePeriod,
  grouping: "day" | "week" | "month",
) {
  if (grouping === "month") {
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(dateAtLocalNoon(period.startDate));
  }
  if (grouping === "day") return formatDate(period.startDate);
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(period.startDate.slice(0, 4) !== period.endDate.slice(0, 4) ? { year: "numeric" as const } : {}),
  }).formatRange(dateAtLocalNoon(period.startDate), dateAtLocalNoon(period.endDate));
}

function formatOccurrenceTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function plural(count: number, singular: string, pluralLabel = singular + "s") {
  return count === 1 ? singular : pluralLabel;
}

function StatisticValue({ label, value }: { label: string; value: number }) {
  return (
    <AdhdCard className="grid gap-1" padding="md">
      <p className="text-sm leading-snug font-semibold text-[#7d7598] dark:text-white/50">{label}</p>
      <p className="text-2xl font-black text-[#26324f] dark:text-white">{value}</p>
    </AdhdCard>
  );
}

function LoadingState({ children }: { children: string }) {
  return <p aria-live="polite" className="rounded-[1rem] border border-[#ece8f8] bg-white/80 px-4 py-3 text-sm text-[#68738c] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60" role="status">{children}</p>;
}

function TriggerFrequencyChart({
  grouping,
  periods,
  selectedTriggerName,
}: {
  grouping: "day" | "week" | "month";
  periods: readonly HealthJournalTriggerTimelinePeriod[];
  selectedTriggerName: string | null;
}) {
  if (periods.length === 0) {
    return <p className="text-sm text-[#7d88a3] dark:text-white/50">No linked Trigger associations to chart yet.</p>;
  }
  const maximumCount = Math.max(1, ...periods.map((period) => period.count));
  const groupingLabel = grouping === "day" ? "day" : grouping === "week" ? "calendar week starting Monday" : "month";
  const distributePeriods = periods.length <= 4;
  return (
    <div className="grid gap-2">
      <p className="text-sm leading-snug text-[#7d88a3] dark:text-white/50">
        {selectedTriggerName ? selectedTriggerName + " · " : "All Triggers · "}Counts by {groupingLabel}
      </p>
      <ol aria-label={"Trigger frequency timeline, counts by " + groupingLabel} className="flex w-full min-w-0 min-h-44 items-end gap-3 overflow-x-auto rounded-[1rem] border border-[#eeeaf8] bg-[#fbfaff] px-3 pb-3 pt-4 dark:border-white/10 dark:bg-white/[0.025]">
        {periods.map((period) => {
          const periodLabel = formatJournalTriggerTimelinePeriodLabel(period, grouping);
          const accessiblePeriod = period.startDate === period.endDate
            ? period.startDate
            : period.startDate + " through " + period.endDate;
          const countLabel = period.count + " " + plural(period.count, "association");
          return (
            <li aria-label={accessiblePeriod + ": " + countLabel} className={"flex flex-col items-center justify-end gap-2.5 text-center text-xs leading-tight text-[#68738c] dark:text-white/55 " + (distributePeriods ? "min-w-32 flex-1" : "w-36 shrink-0")} key={period.key} title={accessiblePeriod}>
              <span className="sr-only">{accessiblePeriod}: {countLabel}</span>
              <div aria-hidden="true" className="flex h-32 w-full items-end justify-center rounded-t-md bg-[#f0ecfb] dark:bg-white/[0.04]">
                <div
                  className="w-7 rounded-t-md bg-[#7862df] dark:bg-[#a997ff]"
                  style={{ height: (period.count / maximumCount) * 100 + "%" }}
                />
              </div>
              <span aria-hidden="true" className="font-bold tabular-nums text-sm leading-none text-[#3b355b] dark:text-white/80">{period.count}</span>
              <span aria-hidden="true" className="min-h-8 w-full px-1 text-center text-xs leading-snug">{periodLabel}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function JournalTriggerStatistics({
  checkIns,
  healthDataError,
  healthDataLoading,
  hasLoadedJournalTriggerData,
  isLoadingJournalTriggers,
  journalSignals,
  journalSignalOccurrences,
  journalTriggerDataError,
  journalTriggers,
  journalTriggerLinks,
  loadJournalTriggerData,
  onViewInHistory,
  retryHealthData,
  symptomEntries,
  symptoms,
}: {
  checkIns: readonly HealthCheckIn[];
  healthDataError: string | null;
  healthDataLoading: boolean;
  hasLoadedJournalTriggerData: boolean;
  isLoadingJournalTriggers: boolean;
  journalSignals: readonly HealthJournalSignal[];
  journalSignalOccurrences: readonly HealthJournalSignalOccurrence[];
  journalTriggerDataError: string | null;
  journalTriggers: readonly HealthJournalTrigger[];
  journalTriggerLinks: readonly HealthJournalTriggerLink[];
  loadJournalTriggerData: () => Promise<boolean>;
  onViewInHistory: (journalEntryId: string) => void;
  retryHealthData: () => void;
  symptomEntries: readonly HealthSymptomEntry[];
  symptoms: readonly HealthSymptom[];
}) {
  const [range, setRange] = useState<HealthJournalTriggerStatisticsRange>("30_days");
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null);
  const todayDate = todayHealthDate();
  const statistics = useMemo(
    () => buildHealthJournalTriggerStatistics({
      checkIns,
      journalSignals,
      journalSignalOccurrences,
      journalTriggers,
      journalTriggerLinks,
      range,
      symptomEntries,
      symptoms,
      todayDate,
    }),
    [checkIns, journalSignals, journalSignalOccurrences, journalTriggers, journalTriggerLinks, range, symptomEntries, symptoms, todayDate],
  );

  if (healthDataLoading) {
    return <LoadingState>Loading Journal entries and Feeling occurrences…</LoadingState>;
  }
  if (healthDataError) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-[1rem] border border-[#f2cbd4] bg-[#fff7f8] px-4 py-3 dark:border-[#6f3341] dark:bg-[#351d26]">
        <p aria-live="polite" className="min-w-0 flex-1 text-sm font-semibold text-[#a33f58] dark:text-[#ffb0c1]" role="alert">
          {healthDataError}
        </p>
        <AdhdChip onClick={retryHealthData} type="button">Retry</AdhdChip>
      </div>
    );
  }
  if (journalTriggerDataError) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-[1rem] border border-[#f2cbd4] bg-[#fff7f8] px-4 py-3 dark:border-[#6f3341] dark:bg-[#351d26]">
        <p aria-live="polite" className="min-w-0 flex-1 text-sm font-semibold text-[#a33f58] dark:text-[#ffb0c1]" role="alert">
          Could not load Journal Trigger statistics: {journalTriggerDataError}
        </p>
        <AdhdChip disabled={isLoadingJournalTriggers} onClick={() => { void loadJournalTriggerData(); }} type="button">Retry</AdhdChip>
      </div>
    );
  }
  if (isLoadingJournalTriggers || !hasLoadedJournalTriggerData) {
    return (
      <div className="grid gap-2">
        <LoadingState>{isLoadingJournalTriggers ? "Loading Journal Trigger statistics…" : "Journal Trigger data have not loaded yet."}</LoadingState>
        {!isLoadingJournalTriggers ? <div><AdhdChip onClick={() => { void loadJournalTriggerData(); }} type="button">Retry</AdhdChip></div> : null}
      </div>
    );
  }

  const selectedTrigger = selectedTriggerId
    ? statistics.triggerOptions.find((option) => option.trigger.id === selectedTriggerId) ?? null
    : null;
  const timeline = getHealthJournalTriggerTimelineForSelection(statistics, selectedTriggerId);
  const triggerOptions = [
    { label: "All Triggers", value: "all" },
    ...statistics.triggerOptions.map((option) => ({
      label: option.trigger.name + (option.trigger.archived_at ? " · Archived" : ""),
      value: option.trigger.id,
    })),
  ];

  return (
    <div className="grid gap-4">
      <div aria-label="Journal Statistics date range" className="flex flex-wrap gap-2" role="group">
        {RANGE_OPTIONS.map((option) => (
          <AdhdChip
            aria-pressed={range === option.value}
            key={option.value}
            onClick={() => setRange(option.value)}
            selected={range === option.value}
            type="button"
          >
            {option.label}{option.value === "30_days" ? " (default)" : ""}
          </AdhdChip>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatisticValue label="Trigger associations" value={statistics.totalAssociationCount} />
        <StatisticValue label="Distinct Triggers used" value={statistics.distinctTriggerCount} />
        <StatisticValue label="Journal Entries with links" value={statistics.distinctJournalEntryCount} />
      </div>

      {statistics.ignoredAssociationCount > 0 ? (
        <p className="text-xs text-[#a36b28] dark:text-[#f2c27d]" role="status">
          {statistics.ignoredAssociationCount} malformed or orphaned {plural(statistics.ignoredAssociationCount, "association")} excluded.
        </p>
      ) : null}

      <AdhdCard className="grid gap-3" padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[#26324f] dark:text-white">Trigger frequency timeline</h3>
            <p className="text-xs text-[#7d88a3] dark:text-white/50">Each bar is an integer count of Trigger associations.</p>
          </div>
          <div className="min-w-48">
            <HealthDropdown
              ariaLabel="Trigger for frequency timeline"
              onChange={(value) => setSelectedTriggerId(value === "all" ? null : value)}
              options={triggerOptions}
              value={selectedTriggerId ?? "all"}
            />
          </div>
        </div>
        <TriggerFrequencyChart grouping={statistics.grouping} periods={timeline} selectedTriggerName={selectedTrigger?.trigger.name ?? null} />
      </AdhdCard>

      <AdhdCard className="grid gap-3" padding="md">
        <h3 className="font-semibold text-[#26324f] dark:text-white">Most Recorded Triggers</h3>
        {statistics.rankedTriggers.length > 0 ? (
          <ol className="grid gap-3">
            {statistics.rankedTriggers.map((trigger, index) => (
              <li className="grid min-w-0" key={trigger.trigger.id}>
                <AdhdChip
                  aria-pressed={selectedTriggerId === trigger.trigger.id}
                  className="w-full max-w-full rounded-xl py-2 whitespace-normal"
                  onClick={() => setSelectedTriggerId(trigger.trigger.id)}
                  selected={selectedTriggerId === trigger.trigger.id}
                  type="button"
                  title={trigger.trigger.name + (trigger.trigger.archived_at ? " · Archived" : "")}
                >
                  <span className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 whitespace-normal text-left">
                    <span className="shrink-0 font-bold tabular-nums">#{index + 1}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 break-words">{trigger.trigger.name}</span>
                      {trigger.trigger.archived_at ? <span className="shrink-0 text-xs font-semibold">Archived</span> : null}
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">{trigger.associationCount}</span>
                  </span>
                </AdhdChip>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-[#7d88a3] dark:text-white/50">No Trigger associations in this date range.</p>
        )}
      </AdhdCard>

      <AdhdCard className="grid gap-2" padding="md">
        <h3 className="font-semibold text-[#26324f] dark:text-white">Effect breakdown</h3>
        <ul className="grid gap-2 text-sm text-[#5f5876] dark:text-white/70 sm:grid-cols-3">
          {(["associated", "improved", "worsened"] as const).map((effect) => (
            <li className="flex min-w-0 items-center justify-between gap-3 rounded-[0.85rem] border border-[#eeeaf8] px-3 py-2 dark:border-white/10" key={effect}>
              <span className="leading-snug">{EFFECT_LABELS[effect]}</span>
              <strong className="shrink-0 tabular-nums text-[#26324f] dark:text-white">{statistics.effects[effect]}</strong>
            </li>
          ))}
        </ul>
      </AdhdCard>

      {selectedTrigger ? (
        <AdhdCard className="grid gap-4" padding="md">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-[#26324f] dark:text-white">{selectedTrigger.trigger.name}</h3>
              {selectedTrigger.trigger.archived_at ? <p className="mt-1 text-xs font-semibold text-[#7d7597] dark:text-white/58">Archived</p> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#5f5876] dark:text-white/70">
            <span>{selectedTrigger.associationCount} {plural(selectedTrigger.associationCount, "association")}</span>
            <span>{selectedTrigger.uniqueJournalEntryCount} {plural(selectedTrigger.uniqueJournalEntryCount, "Journal Entry", "Journal Entries")}</span>
            {(["associated", "improved", "worsened"] as const).map((effect) => (
              <span key={effect}>{EFFECT_LABELS[effect]}: {selectedTrigger.effects[effect]}</span>
            ))}
          </div>

          <section className="grid gap-2">
            <h4 className="text-sm font-semibold text-[#3c4966] dark:text-white/80">Associated Feelings</h4>
            {selectedTrigger.feelings.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {selectedTrigger.feelings.map((feeling) => (
                  <li className="flex gap-2 text-sm text-[#5f5876] dark:text-white/70" key={feeling.name}>
                    <span>{feeling.name}</span>
                    <span>{feeling.occurrenceCount} {plural(feeling.occurrenceCount, "occurrence")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#7d88a3] dark:text-white/50">No associated Feeling occurrences in this date range.</p>
            )}
          </section>

          <section className="grid gap-2">
            <h4 className="text-sm font-semibold text-[#3c4966] dark:text-white/80">Association history</h4>
            {selectedTrigger.history.length > 0 ? (
              <ol className="grid gap-2">
                {selectedTrigger.history.map((item) => (
                  <li className="grid gap-1 rounded-[0.9rem] border border-[#eeeaf8] px-3 py-2 text-sm dark:border-white/10" key={item.associationId}>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-semibold text-[#26324f] dark:text-white">{formatDate(item.entryDate, true)}</span>
                      {formatOccurrenceTime(item.occurredAt) ? <span className="text-xs text-[#7d88a3] dark:text-white/45">· {formatOccurrenceTime(item.occurredAt)}</span> : null}
                      <span className="text-[#68738c] dark:text-white/60">{item.feelingName}</span>
                      <span className="text-xs text-[#7d88a3] dark:text-white/45">· {EFFECT_LABELS[item.effect]}</span>
                    </div>
                    <p className="text-xs text-[#68738c] dark:text-white/60">
                      {item.previousScore === null
                        ? "Previous score not recorded"
                        : "Previous score " + item.previousScore}
                      {" · "}Recorded score {item.recordedScore}
                      {item.scoreDifference === null ? "" : " · Difference " + (item.scoreDifference > 0 ? "+" : "") + item.scoreDifference}
                    </p>
                    <div>
                      <AdhdChip onClick={() => onViewInHistory(item.journalEntryId)} type="button">View in History</AdhdChip>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-[#7d88a3] dark:text-white/50">No associations for this Trigger in the selected date range.</p>
            )}
          </section>
        </AdhdCard>
      ) : null}
    </div>
  );
}

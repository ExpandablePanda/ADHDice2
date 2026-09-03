"use client";

import type { ReactNode } from "react";
import type {
  HealthCheckIn,
  HealthJournalSignal,
  HealthJournalSignalOccurrence,
  HealthMealEntry,
  HealthMetricEntry,
  HealthProfile,
  HealthSymptom,
  HealthSymptomEntry,
  HealthWaterEntry,
  HealthWeightEntry,
  HealthWorkout,
} from "@/lib/database.types";
import {
  calculateHealthDailyCalorieBudget,
  formatHealthDateLabel,
  formatHealthNutritionNumber,
  formatHealthSleepDuration,
  type HealthTab,
} from "@/lib/health-utils";
import { formatQuantity, millilitersToWaterAmount } from "@/lib/health-library";
import { buildHealthTodaySnapshot, buildHealthTodayTimeline, type HealthTodayTimelineEvent } from "@/lib/health-today";
import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { PageShell, PageShellBody, PageShellSurface, ReorderablePageShells } from "@/components/ui-system/reorderable-page-shells";
import type { PageShellLayoutState } from "@/hooks/usePageShellLayout";

type HealthTodayTabProps = {
  checkIns: HealthCheckIn[];
  focusCategories: Parameters<typeof buildHealthTodaySnapshot>[0]["focusCategories"];
  focusHistory: Parameters<typeof buildHealthTodaySnapshot>[0]["focusHistory"];
  journalSignals: HealthJournalSignal[];
  journalSignalOccurrences: HealthJournalSignalOccurrence[];
  mealEntries: HealthMealEntry[];
  metricEntries: HealthMetricEntry[];
  onNavigate: (tab: HealthTab) => void;
  profile: HealthProfile;
  symptoms: HealthSymptom[];
  symptomEntries: HealthSymptomEntry[];
  today: string;
  waterEntries: HealthWaterEntry[];
  weightEntries: HealthWeightEntry[];
  workouts: HealthWorkout[];
  layout: PageShellLayoutState;
};

export function HealthTodayTab({
  checkIns,
  focusCategories,
  focusHistory,
  journalSignals,
  journalSignalOccurrences,
  mealEntries,
  metricEntries,
  onNavigate,
  profile,
  symptoms,
  symptomEntries,
  today,
  waterEntries,
  weightEntries,
  workouts,
  layout,
}: HealthTodayTabProps) {
  const snapshot = buildHealthTodaySnapshot({
    checkIns,
    date: today,
    focusCategories,
    focusHistory,
    journalSignalOccurrences,
    mealEntries,
    metricEntries,
    symptomEntries,
    waterEntries,
  });
  const timeline = buildHealthTodayTimeline({
    checkIns,
    date: today,
    focusCategories,
    focusHistory,
    journalSignals,
    journalSignalOccurrences,
    mealEntries,
    preferredWeightUnit: profile.preferred_weight_unit,
    workoutImportAliases: profile.workout_import_aliases,
    symptomEntries,
    symptoms,
    waterEntries,
    weightEntries,
    workouts,
  });
  const waterAmount = formatQuantity(snapshot.water.fluidOunces);
  const waterGoal = profile.water_goal_ml === null
    ? null
    : formatQuantity(millilitersToWaterAmount(profile.water_goal_ml, "fl_oz"));
  const journal = snapshot.journal.latestEntry;
  const foodGoal = calculateHealthDailyCalorieBudget(profile.calorie_goal, snapshot.movement.activeEnergyKcal);
  const formattedFoodGoal = foodGoal === null ? null : formatHealthNutritionNumber(foodGoal);
  const proteinGoal = profile.protein_goal_grams === null ? null : formatHealthNutritionNumber(profile.protein_goal_grams);
  const sleepGoal = profile.sleep_goal_minutes === null ? null : formatHealthSleepDuration(profile.sleep_goal_minutes);

  return (
    <div className="mt-5 grid gap-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Today · {formatHealthDateLabel(today).toUpperCase()}</p>
        <h2 className="mt-1 text-xl font-black text-[#1e2744] dark:text-white">Today&apos;s Snapshot</h2>
      </div>

      <ReorderablePageShells layout={layout}>
      <PageShell id="today-snapshot" label="Today Snapshot">
      <PageShellSurface>
      <PageShellBody>
      <section aria-labelledby="health-today-snapshot-heading" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <h3 className="sr-only" id="health-today-snapshot-heading">Today&apos;s Snapshot</h3>
        <HealthTodaySnapshotCard label="Journal" onClick={() => onNavigate("Journal")}>
          {journal ? (
            <>
              <p>Mood {formatTodayScore(journal.mood_score)} · Energy {formatTodayScore(journal.energy_score)} · Stress {formatTodayScore(journal.stress_score)}</p>
              <p className="mt-1 text-xs text-[#74809b] dark:text-white/50">{snapshot.journal.feelingOccurrenceCount} Feeling {snapshot.journal.feelingOccurrenceCount === 1 ? "occurrence" : "occurrences"} · {snapshot.journal.entryCount} {snapshot.journal.entryCount === 1 ? "entry" : "entries"} today</p>
            </>
          ) : <p>No entry yet</p>}
        </HealthTodaySnapshotCard>

        <HealthTodaySnapshotCard label="Food" onClick={() => onNavigate("Food")}>
          <p>{formattedFoodGoal === null ? `${formatHealthNutritionNumber(snapshot.food.calories)} kcal` : `${formatHealthNutritionNumber(snapshot.food.calories)} / ${formattedFoodGoal} kcal`}</p>
          <p className="mt-1 text-xs text-[#74809b] dark:text-white/50">{proteinGoal === null ? `Protein ${formatHealthNutritionNumber(snapshot.food.protein)}g` : `Protein ${formatHealthNutritionNumber(snapshot.food.protein)} / ${proteinGoal}g`}</p>
        </HealthTodaySnapshotCard>

        <HealthTodaySnapshotCard label="Water" onClick={() => onNavigate("Water")}>
          <p>{waterGoal === null ? `${waterAmount} fl oz` : `${waterAmount} / ${waterGoal} fl oz`}</p>
          {waterGoal === null ? <p className="mt-1 text-xs text-[#74809b] dark:text-white/50">No goal set</p> : null}
        </HealthTodaySnapshotCard>

        <HealthTodaySnapshotCard label="Sleep" onClick={() => onNavigate("Sleep")}>
          <p>{snapshot.sleep.totalMinutes === 0 ? "No sleep logged" : sleepGoal === null ? formatHealthSleepDuration(snapshot.sleep.totalMinutes) : `${formatHealthSleepDuration(snapshot.sleep.totalMinutes)} / ${sleepGoal}`}</p>
          {snapshot.sleep.totalMinutes === 0 && sleepGoal ? <p className="mt-1 text-xs text-[#74809b] dark:text-white/50">Goal {sleepGoal}</p> : null}
        </HealthTodaySnapshotCard>

        <HealthTodaySnapshotCard label="Movement" onClick={() => onNavigate("Fitness")}>
          <MovementLine label="steps" value={snapshot.movement.steps} goal={profile.movement_goal} />
          <MovementLine label="min" value={snapshot.movement.exerciseMinutes} goal={profile.movement_goal_minutes} />
          <MovementLine label="kcal" value={snapshot.movement.activeEnergyKcal} goal={profile.movement_goal_calories} />
        </HealthTodaySnapshotCard>
      </section>
      </PageShellBody>
      </PageShellSurface>
      </PageShell>

      <PageShell id="today-quick-log" label="Quick Log">
      <PageShellSurface>
      <PageShellBody>
      <section aria-labelledby="health-today-quick-log-heading" className="grid gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40" id="health-today-quick-log-heading">Quick Log</p>
        <div className="flex flex-wrap gap-2">
          {([
            ["Journal", "Journal"],
            ["Food", "Food"],
            ["Water", "Water"],
            ["Weight", "Weight"],
            ["Workout", "Fitness"],
            ["Sleep", "Sleep"],
          ] as const).map(([label, tab]) => (
            <AdhdChip key={label} onClick={() => onNavigate(tab)}>{`+ ${label}`}</AdhdChip>
          ))}
        </div>
      </section>
      </PageShellBody>
      </PageShellSurface>
      </PageShell>

      <PageShell id="today-timeline" label="Today Timeline">
      <PageShellSurface>
      <PageShellBody>
      <HealthTodayTimeline events={timeline} onNavigate={onNavigate} />
      </PageShellBody>
      </PageShellSurface>
      </PageShell>
      </ReorderablePageShells>
    </div>
  );
}

function HealthTodayTimeline({ events, onNavigate }: { events: HealthTodayTimelineEvent[]; onNavigate: (tab: HealthTodayTimelineEvent["targetTab"]) => void }) {
  return (
    <section aria-labelledby="health-today-timeline-heading" className="grid gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40" id="health-today-timeline-heading">TODAY TIMELINE</p>
      {events.length === 0 ? <p className="rounded-[1rem] border border-dashed border-[#e5e1f1] px-3 py-4 text-sm text-[#74809b] dark:border-white/10 dark:text-white/50">No Health activity logged yet today.</p> : (
        <div className="overflow-hidden rounded-[1rem] border border-[#edf0fb] bg-white/70 divide-y divide-[#edf0fb] dark:border-white/10 dark:bg-white/[0.03] dark:divide-white/10">
          {events.map((event) => (
            <button
              aria-label={`Open ${event.title}: ${event.detail}`}
              className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-3 py-3 text-left transition-colors hover:bg-[#faf9ff] focus-visible:bg-[#faf9ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8d7bf5] dark:hover:bg-white/[0.05] dark:focus-visible:bg-white/[0.05] sm:grid-cols-[6.5rem_minmax(0,1fr)]"
              data-timeline-kind={event.kind}
              key={event.id}
              onClick={() => onNavigate(event.targetTab)}
              type="button"
            >
              <span className="flex items-start gap-2 pt-0.5 text-xs font-semibold tabular-nums text-[#7c7698] dark:text-white/50">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9c8df2] dark:bg-[#b9adff]" />
                <span>{event.timeLabel}</span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#26324f] dark:text-white">{event.title}</span>
                <span className="mt-0.5 block break-words text-sm text-[#4f5872] dark:text-white/75">{event.detail}</span>
                {event.secondaryDetail ? <span className="mt-0.5 block break-words text-xs text-[#7d88a3] dark:text-white/50">{event.secondaryDetail}</span> : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function HealthTodaySnapshotCard({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <AdhdCard interactive padding="sm">
      <button aria-label={`Open ${label}`} className="block w-full appearance-none border-0 bg-transparent p-0 text-left" onClick={onClick} type="button">
        <h4 className="text-sm font-semibold text-[#26324f] dark:text-white">{label}</h4>
        <div className="mt-2 text-sm text-[#4f5872] dark:text-white/75">{children}</div>
      </button>
    </AdhdCard>
  );
}

function MovementLine({ goal, label, value }: { goal: number | null; label: string; value: number }) {
  const formattedValue = formatWholeNumber(value);
  const formattedGoal = goal === null ? null : formatWholeNumber(goal);
  return <p>{formattedGoal === null ? `${formattedValue} ${label}` : `${formattedValue} / ${formattedGoal} ${label}`}</p>;
}

function formatTodayScore(value: number | null) {
  return value === null ? "—" : String(value);
}

function formatWholeNumber(value: number) {
  return Math.round(value).toLocaleString();
}

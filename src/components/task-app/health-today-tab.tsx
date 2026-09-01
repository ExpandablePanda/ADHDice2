"use client";

import type { ReactNode } from "react";
import type {
  HealthCheckIn,
  HealthJournalSignalOccurrence,
  HealthMealEntry,
  HealthMetricEntry,
  HealthProfile,
  HealthSymptomEntry,
  HealthWaterEntry,
} from "@/lib/database.types";
import {
  formatHealthDateLabel,
  formatHealthNutritionNumber,
  formatHealthSleepDuration,
  type HealthTab,
} from "@/lib/health-utils";
import { formatQuantity, millilitersToWaterAmount } from "@/lib/health-library";
import { buildHealthTodaySnapshot } from "@/lib/health-today";
import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";

type HealthTodayTabProps = {
  checkIns: HealthCheckIn[];
  focusCategories: Parameters<typeof buildHealthTodaySnapshot>[0]["focusCategories"];
  focusHistory: Parameters<typeof buildHealthTodaySnapshot>[0]["focusHistory"];
  journalSignalOccurrences: HealthJournalSignalOccurrence[];
  mealEntries: HealthMealEntry[];
  metricEntries: HealthMetricEntry[];
  onNavigate: (tab: HealthTab) => void;
  profile: HealthProfile;
  symptomEntries: HealthSymptomEntry[];
  today: string;
  waterEntries: HealthWaterEntry[];
};

export function HealthTodayTab({
  checkIns,
  focusCategories,
  focusHistory,
  journalSignalOccurrences,
  mealEntries,
  metricEntries,
  onNavigate,
  profile,
  symptomEntries,
  today,
  waterEntries,
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
  const waterAmount = formatQuantity(snapshot.water.fluidOunces);
  const waterGoal = profile.water_goal_ml === null
    ? null
    : formatQuantity(millilitersToWaterAmount(profile.water_goal_ml, "fl_oz"));
  const journal = snapshot.journal.latestEntry;
  const foodGoal = profile.calorie_goal === null ? null : formatHealthNutritionNumber(profile.calorie_goal);
  const proteinGoal = profile.protein_goal_grams === null ? null : formatHealthNutritionNumber(profile.protein_goal_grams);
  const sleepGoal = profile.sleep_goal_minutes === null ? null : formatHealthSleepDuration(profile.sleep_goal_minutes);

  return (
    <div className="mt-5 grid gap-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Today · {formatHealthDateLabel(today).toUpperCase()}</p>
        <h2 className="mt-1 text-xl font-black text-[#1e2744] dark:text-white">Today&apos;s Snapshot</h2>
      </div>

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
          <p>{foodGoal === null ? `${formatHealthNutritionNumber(snapshot.food.calories)} kcal` : `${formatHealthNutritionNumber(snapshot.food.calories)} / ${foodGoal} kcal`}</p>
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
    </div>
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

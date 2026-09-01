import type {
  HealthCheckIn,
  HealthJournalSignalOccurrence,
  HealthMealEntry,
  HealthMetricEntry,
  HealthSymptomEntry,
  HealthWaterEntry,
} from "@/lib/database.types";
import { getHealthDailyMovementMetrics } from "@/lib/health-fitness";
import {
  getHealthSleepDayTotal,
  sumMealNutritionForDate,
  type HealthDailyNutritionTotals,
  type HealthSleepDayTotal,
} from "@/lib/health-utils";
import { sumWaterForDate } from "@/lib/health-library";
import { sortHealthJournalEntries } from "@/lib/health-journal";

export type HealthTodaySnapshot = {
  food: HealthDailyNutritionTotals;
  journal: {
    entryCount: number;
    feelingOccurrenceCount: number;
    latestEntry: HealthCheckIn | null;
  };
  movement: ReturnType<typeof getHealthDailyMovementMetrics>;
  sleep: HealthSleepDayTotal;
  water: ReturnType<typeof sumWaterForDate>;
};

export function buildHealthTodaySnapshot({
  checkIns,
  date,
  focusCategories,
  focusHistory,
  journalSignalOccurrences,
  mealEntries,
  metricEntries,
  symptomEntries,
  waterEntries,
}: {
  checkIns: HealthCheckIn[];
  date: string;
  focusCategories: Parameters<typeof getHealthSleepDayTotal>[0]["focusCategories"];
  focusHistory: Parameters<typeof getHealthSleepDayTotal>[0]["focusHistory"];
  journalSignalOccurrences: HealthJournalSignalOccurrence[];
  mealEntries: HealthMealEntry[];
  metricEntries: HealthMetricEntry[];
  symptomEntries: HealthSymptomEntry[];
  waterEntries: HealthWaterEntry[];
}): HealthTodaySnapshot {
  const journalEntries = checkIns.filter((entry) => entry.entry_date === date);
  const journalEntryIds = new Set(journalEntries.map((entry) => entry.id));
  const signalOccurrenceCount = journalSignalOccurrences.filter((occurrence) => (
    occurrence.entry_date === date && journalEntryIds.has(occurrence.journal_entry_id)
  )).length;
  const symptomOccurrenceCount = symptomEntries.filter((occurrence) => (
    occurrence.entry_date === date && journalEntryIds.has(occurrence.journal_entry_id)
  )).length;

  return {
    food: sumMealNutritionForDate(mealEntries, date),
    journal: {
      entryCount: journalEntries.length,
      feelingOccurrenceCount: signalOccurrenceCount + symptomOccurrenceCount,
      latestEntry: [...journalEntries].sort(sortHealthJournalEntries)[0] ?? null,
    },
    movement: getHealthDailyMovementMetrics(metricEntries, date),
    sleep: getHealthSleepDayTotal({ date, focusCategories, focusHistory, metricEntries }),
    water: sumWaterForDate(waterEntries, date),
  };
}

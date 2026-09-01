import type {
  HealthCheckIn,
  HealthJournalSignal,
  HealthJournalSignalOccurrence,
  HealthMealEntry,
  HealthMetricEntry,
  HealthSymptom,
  HealthSymptomEntry,
  HealthWaterEntry,
  HealthWeightEntry,
  HealthWorkout,
} from "@/lib/database.types";
import { getHealthDailyMovementMetrics } from "@/lib/health-fitness";
import {
  formatHealthNutritionNumber,
  formatHealthSleepDuration,
  formatHealthStandardTime,
  formatHealthTimestampTime,
  formatWeight,
  getHealthMealNutritionValue,
  getMealSlotLabel,
  getSleepFocusSessions,
  normalizeHealthMealTime,
  resolveHealthSleepKind,
  getHealthSleepDayTotal,
  sumMealNutritionForDate,
  type HealthDailyNutritionTotals,
  type HealthSleepDayTotal,
  type HealthTab,
} from "@/lib/health-utils";
import {
  formatHealthFoodDisplayName,
  formatQuantity,
  isHealthWaterEntryConfirmed,
  sumWaterForDate,
} from "@/lib/health-library";
import { getHealthJournalSignalDisplayName, sortHealthJournalEntries } from "@/lib/health-journal";
import type { FocusCategory, HistoricalFocusSession } from "@/lib/types";

export type HealthTodayTimelineEvent = {
  id: string;
  kind: "meal" | "water" | "feeling" | "workout" | "weight" | "journal" | "sleep";
  targetTab: HealthTab;
  timeLabel: string;
  sortMinutes: number | null;
  title: string;
  detail: string;
  secondaryDetail?: string | null;
};

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

export function buildHealthTodayTimeline({
  checkIns,
  date,
  focusCategories,
  focusHistory,
  journalSignals,
  journalSignalOccurrences,
  mealEntries,
  preferredWeightUnit = "lb",
  symptomEntries,
  symptoms,
  waterEntries,
  weightEntries,
  workouts,
}: {
  checkIns: HealthCheckIn[];
  date: string;
  focusCategories: FocusCategory[];
  focusHistory: HistoricalFocusSession[];
  journalSignals: HealthJournalSignal[];
  journalSignalOccurrences: HealthJournalSignalOccurrence[];
  mealEntries: HealthMealEntry[];
  preferredWeightUnit?: "kg" | "lb";
  symptomEntries: HealthSymptomEntry[];
  symptoms: HealthSymptom[];
  waterEntries: HealthWaterEntry[];
  weightEntries: HealthWeightEntry[];
  workouts: HealthWorkout[];
}): HealthTodayTimelineEvent[] {
  const events: HealthTodayTimelineEvent[] = [];
  const journalEntries = checkIns.filter((entry) => entry.entry_date === date);
  const journalEntryIds = new Set(journalEntries.map((entry) => entry.id));

  const mealGroups = new Map<string, HealthMealEntry[]>();
  mealEntries
    .filter((entry) => entry.entry_date === date)
    .forEach((entry) => {
      const activityTime = getTimestampParts(entry.logged_at);
      const representedMinute = activityTime ? activityTime.groupKey : `untimed:${entry.id}`;
      const key = `${entry.meal_slot}:${representedMinute}`;
      const group = mealGroups.get(key) ?? [];
      group.push(entry);
      mealGroups.set(key, group);
    });

  for (const group of mealGroups.values()) {
    const orderedGroup = [...group].sort((left, right) => left.id.localeCompare(right.id));
    const activityTime = getTimestampParts(orderedGroup[0]?.logged_at);
    const calories = orderedGroup.reduce(
      (total, entry) => total + getHealthMealNutritionValue(entry, "calories"),
      0,
    );
    events.push({
      detail: `${orderedGroup.map((entry) => formatHealthFoodDisplayName(entry)).join(" + ")} · ${formatHealthNutritionNumber(calories)} kcal`,
      id: `meal:${orderedGroup.map((entry) => entry.id).join(",")}`,
      kind: "meal",
      secondaryDetail: null,
      sortMinutes: activityTime?.sortMinutes ?? null,
      targetTab: "Food",
      timeLabel: activityTime?.timeLabel ?? "Time not logged",
      title: getMealSlotLabel(orderedGroup[0]!.meal_slot),
    });
  }

  waterEntries
    .filter((entry) => entry.entry_date === date && isHealthWaterEntryConfirmed(entry))
    .forEach((entry) => {
      const activityTime = getTimestampParts(entry.logged_at);
      const unit = entry.unit === "cup"
        ? entry.amount === 1 ? "cup" : "cups"
        : "fl oz";
      events.push({
        detail: `${formatQuantity(entry.amount)} ${unit}`,
        id: `water:${entry.id}`,
        kind: "water",
        secondaryDetail: null,
        sortMinutes: activityTime?.sortMinutes ?? null,
        targetTab: "Water",
        timeLabel: activityTime?.timeLabel ?? "Time not logged",
        title: "Water",
      });
    });

  symptomEntries
    .filter((entry) => entry.entry_date === date && journalEntryIds.has(entry.journal_entry_id))
    .forEach((entry) => {
      const activityTime = getTimestampParts(entry.logged_at);
      events.push({
        detail: `${symptoms.find((symptom) => symptom.id === entry.symptom_id)?.name ?? "Archived symptom"} · ${entry.severity}/10`,
        id: `symptom:${entry.id}`,
        kind: "feeling",
        secondaryDetail: normalizeSecondaryDetail(entry.note),
        sortMinutes: activityTime?.sortMinutes ?? null,
        targetTab: "Journal",
        timeLabel: activityTime?.timeLabel ?? "Time not logged",
        title: "Symptom",
      });
    });

  journalSignalOccurrences
    .filter((occurrence) => occurrence.entry_date === date && journalEntryIds.has(occurrence.journal_entry_id))
    .forEach((occurrence) => {
      const signal = journalSignals.find((candidate) => candidate.id === occurrence.signal_id);
      if (signal?.kind === "symptom") return;
      const activityTime = getTimestampParts(occurrence.occurred_at);
      const signalName = signal ? getHealthJournalSignalDisplayName(signal, symptoms) : "Archived Feeling";
      events.push({
        detail: `${signalName} · ${occurrence.score}/10`,
        id: `feeling:${occurrence.id}`,
        kind: "feeling",
        secondaryDetail: normalizeSecondaryDetail(occurrence.note),
        sortMinutes: activityTime?.sortMinutes ?? null,
        targetTab: "Journal",
        timeLabel: activityTime?.timeLabel ?? "Time not logged",
        title: signal?.kind === "emotion" ? "Emotion" : "Other Feeling",
      });
    });

  workouts
    .filter((workout) => workout.workout_date === date)
    .forEach((workout) => {
      const activityTime = getTimestampParts(workout.started_at);
      events.push({
        detail: `${workout.title || workout.workout_type} · ${formatHealthSleepDuration(workout.duration_seconds / 60)}`,
        id: `workout:${workout.id}`,
        kind: "workout",
        secondaryDetail: typeof workout.active_calories === "number" && Number.isFinite(workout.active_calories)
          ? `${formatHealthNutritionNumber(workout.active_calories)} kcal`
          : null,
        sortMinutes: activityTime?.sortMinutes ?? null,
        targetTab: "Fitness",
        timeLabel: activityTime?.timeLabel ?? "Time not logged",
        title: "Workout",
      });
    });

  weightEntries
    .filter((entry) => entry.entry_date === date)
    .forEach((entry) => {
      const activityTime = getTimestampParts(entry.logged_at);
      events.push({
        detail: formatWeight(entry.weight_kg, preferredWeightUnit),
        id: `weight:${entry.id}`,
        kind: "weight",
        secondaryDetail: normalizeSecondaryDetail(entry.note),
        sortMinutes: activityTime?.sortMinutes ?? null,
        targetTab: "Weight",
        timeLabel: activityTime?.timeLabel ?? "Time not logged",
        title: "Weight",
      });
    });

  journalEntries.forEach((entry) => {
    const activityTime = getJournalTimeParts(entry.entry_time);
    const metrics = [
      ["Mood", entry.mood_score],
      ["Energy", entry.energy_score],
      ["Stress", entry.stress_score],
      ["Clarity", entry.clarity_score],
    ]
      .filter(([, score]) => typeof score === "number" && Number.isFinite(score))
      .map(([label, score]) => `${label} ${score}`)
      .join(" · ");
    events.push({
      detail: metrics || (entry.reflection.trim() ? "Journal reflection" : "Journal entry"),
      id: `journal:${entry.id}`,
      kind: "journal",
      secondaryDetail: null,
      sortMinutes: activityTime?.sortMinutes ?? null,
      targetTab: "Journal",
      timeLabel: activityTime?.timeLabel ?? "Time not logged",
      title: "Journal Entry",
    });
  });

  getSleepFocusSessions(focusHistory, focusCategories)
    .filter((session) => session.date === date)
    .forEach((session) => {
      const activityTime = getTimestampParts(session.startedAt);
      const kind = resolveHealthSleepKind(
        session,
        session.categoryId ? focusCategories.find((category) => category.id === session.categoryId) : null,
      );
      events.push({
        detail: formatHealthSleepDuration(session.durationSeconds / 60),
        id: `sleep:${session.id}`,
        kind: "sleep",
        secondaryDetail: null,
        sortMinutes: activityTime?.sortMinutes ?? null,
        targetTab: "Sleep",
        timeLabel: activityTime?.timeLabel ?? "Time not logged",
        title: kind.includes("Nap") ? "Nap" : "Sleep",
      });
    });

  return events.sort(compareTimelineEvents);
}

function getTimestampParts(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return {
    groupKey: Math.floor(timestamp / 60_000),
    sortMinutes: date.getHours() * 60 + date.getMinutes(),
    timeLabel: formatHealthTimestampTime(value) ?? "Time not logged",
  };
}

function getJournalTimeParts(value: string | null | undefined) {
  const normalized = typeof value === "string" ? normalizeHealthMealTime(value) : null;
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  return {
    sortMinutes: hours * 60 + minutes,
    timeLabel: formatHealthStandardTime(normalized) ?? "Time not logged",
  };
}

function normalizeSecondaryDetail(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function compareTimelineEvents(left: HealthTodayTimelineEvent, right: HealthTodayTimelineEvent) {
  if (left.sortMinutes !== null && right.sortMinutes !== null && left.sortMinutes !== right.sortMinutes) {
    return left.sortMinutes - right.sortMinutes;
  }
  if ((left.sortMinutes !== null) !== (right.sortMinutes !== null)) {
    return left.sortMinutes !== null ? -1 : 1;
  }
  return timelineKindOrder(left.kind) - timelineKindOrder(right.kind)
    || left.title.localeCompare(right.title)
    || left.detail.localeCompare(right.detail)
    || left.id.localeCompare(right.id);
}

function timelineKindOrder(kind: HealthTodayTimelineEvent["kind"]) {
  return ["meal", "water", "feeling", "workout", "weight", "journal", "sleep"].indexOf(kind);
}

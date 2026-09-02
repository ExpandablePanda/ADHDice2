import type {
  HealthCheckIn,
  HealthJournalSignal,
  HealthJournalSignalOccurrence,
  HealthJournalSignalValue,
  HealthMealEntry,
  HealthMetricEntry,
  HealthProfile,
  HealthSymptom,
  HealthSymptomEntry,
  HealthWaterEntry,
  HealthWeightEntry,
  HealthWorkout,
} from "@/lib/database.types";
import { getHealthDailyMovementMetrics } from "@/lib/health-fitness";
import {
  formatHealthSleepDuration,
  formatHealthStandardTime,
  formatHealthTimestampTime,
  formatWeight,
  getHealthSleepDayTotal,
  getMealSlotLabel,
  getSleepFocusSessions,
  kilogramsToDisplayValue,
  type HealthSleepDayTotal,
} from "@/lib/health-utils";
import {
  formatQuantity,
  isHealthWaterEntryConfirmed,
  millilitersToWaterAmount,
} from "@/lib/health-library";
import { getHealthJournalSignalDisplayName } from "@/lib/health-journal";
import type { FocusCategory, HistoricalFocusSession } from "@/lib/types";
import type { ReportDateRange } from "@/lib/report-presentation";
import { formatReportDate, isReportDateInRange } from "@/lib/report-presentation";

export type HealthReportData = {
  checkIns: HealthCheckIn[];
  dateKeys: string[];
  isAvailable: boolean;
  journalSignalOccurrences: HealthJournalSignalOccurrence[];
  journalSignalValues: HealthJournalSignalValue[];
  journalSignals: HealthJournalSignal[];
  mealEntries: HealthMealEntry[];
  metricEntries: HealthMetricEntry[];
  profile: HealthProfile | null;
  symptomEntries: HealthSymptomEntry[];
  symptoms: HealthSymptom[];
  warnings: string[];
  waterEntries: HealthWaterEntry[];
  weightEntries: HealthWeightEntry[];
  workouts: HealthWorkout[];
};

export const EMPTY_HEALTH_REPORT_DATA: HealthReportData = {
  checkIns: [],
  dateKeys: [],
  isAvailable: true,
  journalSignalOccurrences: [],
  journalSignalValues: [],
  journalSignals: [],
  mealEntries: [],
  metricEntries: [],
  profile: null,
  symptomEntries: [],
  symptoms: [],
  warnings: [],
  waterEntries: [],
  weightEntries: [],
  workouts: [],
};

type HealthReportRange = ReportDateRange & { spanDays: number };

function knownNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function formatNumber(value: number | null, maximumFractionDigits = 1) {
  return value === null || !Number.isFinite(value)
    ? "unknown"
    : value.toLocaleString("en-US", { maximumFractionDigits });
}

function formatKnownValue(value: number | null, suffix: string) {
  return value === null ? "unknown" : `${formatNumber(value)}${suffix}`;
}

function getMealNutrient(entry: HealthMealEntry, key: "calories" | "protein_g" | "carbs_g" | "fat_g") {
  const snapshotValue = knownNumber(entry.nutrition_snapshot?.[key]);
  if (snapshotValue !== null) return snapshotValue;
  return knownNumber(entry[key]);
}

type FoodNutrientKey = "protein_g" | "carbs_g" | "fat_g";

type FoodNutrientCoverage = {
  average: number | null;
  knownEntries: number;
  totalEntries: number;
  knownDays: number;
  totalDays: number;
  fullyCoveredDays: number;
};

function formatNutritionCoverageNote(coverage: FoodNutrientCoverage, label: string) {
  return `${coverage.knownEntries} of ${coverage.totalEntries} Food entries had known ${label}; ${coverage.fullyCoveredDays} of ${coverage.totalDays} logged days fully covered`;
}

function formatNutritionTargetComparison(
  value: number | null,
  target: number | null,
  targetSuffix: string,
  differenceSuffix: string,
  coverage: FoodNutrientCoverage | null,
  nutrientLabel: string,
) {
  if (target === null) return null;
  const coverageNote = coverage && coverage.fullyCoveredDays !== coverage.totalDays
    ? ` (${formatNutritionCoverageNote(coverage, nutrientLabel)})`
    : "";
  if (value === null) return `Current target: ${formatNumber(target)}${targetSuffix}; comparison unavailable${coverageNote}`;
  const difference = value - target;
  const comparison = difference === 0
    ? "at target"
    : `${formatNumber(Math.abs(difference))}${differenceSuffix} ${difference > 0 ? "above" : "below"} target`;
  return `Current target: ${formatNumber(target)}${targetSuffix}; average ${formatNumber(value)}${targetSuffix}; ${comparison}${coverageNote}`;
}

function formatGoalLine(label: string, value: number | null, suffix: string) {
  return value === null ? null : `- ${label}: ${formatNumber(value)}${suffix}`;
}

function formatDateTime(dateKey: string, timestamp: string | null | undefined) {
  const time = formatHealthTimestampTime(timestamp) ?? formatHealthStandardTime(timestamp);
  return time ? `${formatReportDate(dateKey)} ${time}` : formatReportDate(dateKey);
}

function sortedDateKeys(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function getNutritionDetails(entry: HealthMealEntry) {
  return entry.nutrition_snapshot?.nutrition_details ?? entry.food_snapshot?.nutrition_details ?? null;
}

function formatNutritionDetails(entry: HealthMealEntry) {
  const details = getNutritionDetails(entry);
  if (!details) return null;
  const labels: Array<[keyof typeof details, string, string]> = [
    ["saturated_fat_g", "Sat fat", "g"],
    ["cholesterol_mg", "Cholesterol", "mg"],
    ["sodium_mg", "Sodium", "mg"],
    ["dietary_fiber_g", "Fiber", "g"],
    ["total_sugars_g", "Sugars", "g"],
    ["added_sugars_g", "Added sugar", "g"],
  ];
  const parts = labels.flatMap(([key, label, suffix]) => {
    const value = knownNumber(details[key]);
    return value === null ? [] : [`${label} ${formatNumber(value)}${suffix}`];
  });
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatFoodSection(data: HealthReportData, range: HealthReportRange, detailed: boolean) {
  const entries = data.mealEntries.filter((entry) => isReportDateInRange(entry.entry_date, range));
  const lines = ["### Food / Nutrition"];
  if (entries.length === 0) {
    lines.push("- No data in selected range.");
    return lines;
  }
  const dates = sortedDateKeys(entries.map((entry) => entry.entry_date));
  const sumKnownNutrient = (dayEntries: HealthMealEntry[], key: "calories" | "protein_g" | "carbs_g" | "fat_g") => {
    const values = dayEntries.map((entry) => getMealNutrient(entry, key)).filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const daily = dates.map((date) => {
    const dayEntries = entries.filter((entry) => entry.entry_date === date);
    return {
      carbs: sumKnownNutrient(dayEntries, "carbs_g"),
      calories: sumKnownNutrient(dayEntries, "calories"),
      fat: sumKnownNutrient(dayEntries, "fat_g"),
      protein: sumKnownNutrient(dayEntries, "protein_g"),
      date,
    };
  });
  const getCoverage = (key: FoodNutrientKey): FoodNutrientCoverage => {
    const knownEntries = entries.filter((entry) => getMealNutrient(entry, key) !== null).length;
    const dailyValues = daily.map((day) => day[key === "protein_g" ? "protein" : key === "carbs_g" ? "carbs" : "fat"]);
    return {
      average: average(dailyValues.filter((value): value is number => value !== null)),
      knownEntries,
      totalEntries: entries.length,
      knownDays: dailyValues.filter((value): value is number => value !== null).length,
      totalDays: dates.length,
      fullyCoveredDays: dates.filter((date) => {
        const dayEntries = entries.filter((entry) => entry.entry_date === date);
        return dayEntries.every((entry) => getMealNutrient(entry, key) !== null);
      }).length,
    };
  };
  const knownDailyValues = (key: "calories" | "protein" | "carbs" | "fat") => daily.map((day) => day[key]).filter((value): value is number => value !== null);
  const knownCalories = knownDailyValues("calories");
  const totalCalories = knownCalories.length > 0 ? knownCalories.reduce((sum, value) => sum + value, 0) : null;
  const averageCalories = average(knownDailyValues("calories"));
  const proteinCoverage = getCoverage("protein_g");
  const carbsCoverage = getCoverage("carbs_g");
  const fatCoverage = getCoverage("fat_g");
  lines.push(
    `- Days with food logged: ${dates.length}`,
    `- Total logged food entries: ${entries.length}`,
    `- Total calories: ${formatKnownValue(totalCalories, " kcal")}`,
    `- Average calories per logged day: ${formatKnownValue(averageCalories, " kcal")}`,
    `- Average protein${proteinCoverage.fullyCoveredDays === proteinCoverage.totalDays ? " per logged day" : " from known nutrition data"}: ${formatKnownValue(proteinCoverage.average, " g")}${proteinCoverage.fullyCoveredDays === proteinCoverage.totalDays ? "" : ` across ${proteinCoverage.knownDays} logged day${proteinCoverage.knownDays === 1 ? "" : "s"} (${formatNutritionCoverageNote(proteinCoverage, "protein")})`}`,
    `- Average carbs${carbsCoverage.fullyCoveredDays === carbsCoverage.totalDays ? " per logged day" : " from known nutrition data"}: ${formatKnownValue(carbsCoverage.average, " g")}${carbsCoverage.fullyCoveredDays === carbsCoverage.totalDays ? "" : ` across ${carbsCoverage.knownDays} logged day${carbsCoverage.knownDays === 1 ? "" : "s"} (${formatNutritionCoverageNote(carbsCoverage, "carbs")})`}`,
    `- Average fat${fatCoverage.fullyCoveredDays === fatCoverage.totalDays ? " per logged day" : " from known nutrition data"}: ${formatKnownValue(fatCoverage.average, " g")}${fatCoverage.fullyCoveredDays === fatCoverage.totalDays ? "" : ` across ${fatCoverage.knownDays} logged day${fatCoverage.knownDays === 1 ? "" : "s"} (${formatNutritionCoverageNote(fatCoverage, "fat")})`}`,
  );
  const profile = data.profile;
  const comparisons = [
    formatNutritionTargetComparison(averageCalories, profile?.calorie_goal ?? null, " kcal/day", " kcal", null, "calories"),
    formatNutritionTargetComparison(proteinCoverage.average, profile?.protein_goal_grams ?? null, " g/day protein", " g", proteinCoverage, "protein"),
    formatNutritionTargetComparison(carbsCoverage.average, profile?.carbs_goal_grams ?? null, " g/day carbs", " g", carbsCoverage, "carbs"),
    formatNutritionTargetComparison(fatCoverage.average, profile?.fat_goal_grams ?? null, " g/day fat", " g", fatCoverage, "fat"),
  ].filter((value): value is string => Boolean(value));
  lines.push(...comparisons.map((value) => `- ${value}`));
  if (!detailed) return lines;

  const entriesByDate = new Map<string, HealthMealEntry[]>();
  for (const entry of entries) entriesByDate.set(entry.entry_date, [...(entriesByDate.get(entry.entry_date) ?? []), entry]);
  for (const date of dates) {
    lines.push("", `#### ${formatReportDate(date)}`);
    const dayEntries = (entriesByDate.get(date) ?? []).sort((left, right) => left.logged_at.localeCompare(right.logged_at) || left.id.localeCompare(right.id));
    for (const entry of dayEntries) {
      const parts = [
        formatHealthTimestampTime(entry.logged_at),
        getMealSlotLabel(entry.meal_slot),
        entry.food_name.trim() || "Unnamed food",
        entry.brand_name?.trim() || null,
        entry.serving_label?.trim() || null,
        getMealNutrient(entry, "calories") === null ? null : `${formatNumber(getMealNutrient(entry, "calories"))} kcal`,
        getMealNutrient(entry, "protein_g") === null ? null : `Protein ${formatNumber(getMealNutrient(entry, "protein_g"))}g`,
        getMealNutrient(entry, "carbs_g") === null ? null : `Carbs ${formatNumber(getMealNutrient(entry, "carbs_g"))}g`,
        getMealNutrient(entry, "fat_g") === null ? null : `Fat ${formatNumber(getMealNutrient(entry, "fat_g"))}g`,
      ].filter((value): value is string => Boolean(value));
      lines.push(`- ${parts.join(" — ")}`);
      const details = formatNutritionDetails(entry);
      if (details) lines.push(`  - Nutrition details: ${details}`);
    }
  }
  return lines;
}

function formatWaterAmount(amountMl: number, unit: "cup" | "fl_oz" = "fl_oz") {
  return `${formatQuantity(millilitersToWaterAmount(amountMl, unit))} ${unit === "cup" ? "cups" : "fl oz"}`;
}

function formatWaterSection(data: HealthReportData, range: HealthReportRange, detailed: boolean) {
  const entries = data.waterEntries.filter((entry) => isReportDateInRange(entry.entry_date, range) && isHealthWaterEntryConfirmed(entry));
  const lines = ["### Water"];
  if (entries.length === 0) {
    lines.push("- No data in selected range.");
    return lines;
  }
  const dates = sortedDateKeys(entries.map((entry) => entry.entry_date));
  const dailyTotals = dates.map((date) => entries.filter((entry) => entry.entry_date === date).reduce((sum, entry) => sum + entry.amount_ml, 0));
  const totalMl = dailyTotals.reduce((sum, value) => sum + value, 0);
  const averageMl = average(dailyTotals);
  const goalMl = data.profile?.water_goal_ml ?? null;
  lines.push(
    `- Days with water logged: ${dates.length}`,
    `- Total consumed water: ${formatWaterAmount(totalMl)}`,
    `- Average per logged day: ${formatWaterAmount(averageMl ?? 0)}`,
    ...(goalMl === null ? [] : [`- Current water goal: ${formatWaterAmount(goalMl)}`, `- Logged days meeting current goal: ${dailyTotals.filter((value) => value >= goalMl).length}`]),
  );
  if (!detailed) return lines;
  for (const date of dates) {
    const dayEntries = entries.filter((entry) => entry.entry_date === date).sort((left, right) => left.logged_at.localeCompare(right.logged_at) || left.id.localeCompare(right.id));
    lines.push("", `#### ${formatReportDate(date)}`, `- Normalized daily total: ${formatWaterAmount(dayEntries.reduce((sum, entry) => sum + entry.amount_ml, 0))}`);
    for (const entry of dayEntries) {
      lines.push(`- ${formatHealthTimestampTime(entry.logged_at) ?? "Unknown time"} — Entered ${formatQuantity(entry.amount)} ${entry.unit === "fl_oz" ? "fl oz" : "cup"}`);
    }
  }
  return lines;
}

function formatScoreSummary(label: string, values: Array<number | null>) {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return known.length === 0 ? null : `- ${label}: ${known.length} logged; average ${formatNumber(average(known))}; min ${formatNumber(Math.min(...known))}; max ${formatNumber(Math.max(...known))}`;
}

function formatJournalSection(data: HealthReportData, range: HealthReportRange, detailed: boolean) {
  const entries = data.checkIns.filter((entry) => isReportDateInRange(entry.entry_date, range)).sort((left, right) => left.entry_date.localeCompare(right.entry_date) || left.entry_time.localeCompare(right.entry_time) || left.id.localeCompare(right.id));
  const lines = ["### Journal"];
  if (entries.length === 0) {
    lines.push("- No data in selected range.");
    return lines;
  }
  lines.push(
    `- Journal Entries: ${entries.length}`,
    `- Entries containing Reflection text: ${entries.filter((entry) => entry.reflection.trim()).length}`,
    ...[
      formatScoreSummary("Mood", entries.map((entry) => entry.mood_score)),
      formatScoreSummary("Energy", entries.map((entry) => entry.energy_score)),
      formatScoreSummary("Stress", entries.map((entry) => entry.stress_score)),
      formatScoreSummary("Mental Clarity", entries.map((entry) => entry.clarity_score)),
    ].filter((value): value is string => Boolean(value)),
  );
  const valuesByEntryId = new Map<string, HealthJournalSignalValue[]>();
  for (const value of data.journalSignalValues) {
    if (entries.some((entry) => entry.id === value.journal_entry_id)) valuesByEntryId.set(value.journal_entry_id, [...(valuesByEntryId.get(value.journal_entry_id) ?? []), value]);
  }
  const signalById = new Map(data.journalSignals.map((signal) => [signal.id, signal] as const));
  const symptomById = new Map(data.symptoms.map((symptom) => [symptom.id, symptom] as const));
  const snapshotLines = new Map<string, { count: number; none: number; positive: number[] }>();
  for (const value of data.journalSignalValues) {
    if (!entries.some((entry) => entry.id === value.journal_entry_id)) continue;
    const summary = snapshotLines.get(value.signal_id) ?? { count: 0, none: 0, positive: [] };
    summary.count += 1;
    if (value.score === 0) summary.none += 1;
    if (value.score > 0) summary.positive.push(value.score);
    snapshotLines.set(value.signal_id, summary);
  }
  if (snapshotLines.size > 0) {
    lines.push("", "#### Feelings in Journal snapshots");
    for (const [signalId, summary] of [...snapshotLines.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const signal = signalById.get(signalId);
      if (!signal) continue;
      const name = getHealthJournalSignalDisplayName(signal, [...symptomById.values()]);
      const averagePositive = average(summary.positive);
      lines.push(`- ${name}: ${summary.count} logged value${summary.count === 1 ? "" : "s"}; Explicit None ${summary.none}; Positive-value average ${averagePositive === null ? "unknown" : formatNumber(averagePositive)}`);
    }
  }
  if (!detailed) return lines;
  lines.push("", "#### Journal Entries");
  for (const entry of entries) {
    const parts = [
      formatDateTime(entry.entry_date, entry.entry_time),
      `Mood: ${entry.mood_score === null ? "Not logged" : entry.mood_score}`,
      `Energy: ${entry.energy_score === null ? "Not logged" : entry.energy_score}`,
      `Stress: ${entry.stress_score === null ? "Not logged" : entry.stress_score}`,
      `Mental Clarity: ${entry.clarity_score === null ? "Not logged" : entry.clarity_score}`,
    ];
    lines.push(`- ${parts.join(" — ")}`);
    if (entry.reflection.trim()) lines.push(`  - Reflection: ${entry.reflection.trim()}`);
    for (const value of (valuesByEntryId.get(entry.id) ?? []).sort((left, right) => left.signal_id.localeCompare(right.signal_id))) {
      const signal = signalById.get(value.signal_id);
      if (!signal) continue;
      const name = getHealthJournalSignalDisplayName(signal, [...symptomById.values()]);
      const scaleLabel = signal.scale_labels[value.score] ?? null;
      const scoreLabel = value.score === 0 ? "None" : scaleLabel ? `${scaleLabel} (${value.score}/10)` : `${value.score}/10`;
      lines.push(`  - ${name}: ${scoreLabel}`);
    }
  }
  return lines;
}

function formatFeelingsAndSymptomsSection(data: HealthReportData, range: HealthReportRange, detailed: boolean) {
  const symptomEntries = data.symptomEntries.filter((entry) => isReportDateInRange(entry.entry_date, range));
  const signalOccurrences = data.journalSignalOccurrences.filter((entry) => isReportDateInRange(entry.entry_date, range));
  const signalById = new Map(data.journalSignals.map((signal) => [signal.id, signal] as const));
  const symptomById = new Map(data.symptoms.map((symptom) => [symptom.id, symptom] as const));
  const lines = ["### Feelings and Symptoms"];
  if (symptomEntries.length === 0 && signalOccurrences.length === 0) {
    lines.push("- No data in selected range.");
    return lines;
  }
  lines.push("#### Symptoms");
  if (symptomEntries.length === 0) lines.push("- No symptom occurrences in selected range.");
  else {
    const grouped = new Map<string, HealthSymptomEntry[]>();
    for (const entry of symptomEntries) grouped.set(entry.symptom_id, [...(grouped.get(entry.symptom_id) ?? []), entry]);
    for (const [symptomId, entries] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const name = symptomById.get(symptomId)?.name ?? "Archived symptom";
      const severities = entries.map((entry) => entry.severity);
      lines.push(`- ${name}: ${entries.length} ${entries.length === 1 ? "occurrence" : "occurrences"}; average severity ${formatNumber(average(severities))}; min ${formatNumber(Math.min(...severities))}; max ${formatNumber(Math.max(...severities))}`);
    }
  }
  lines.push("", "#### Emotions and Other Feelings");
  const nonSymptomOccurrences = signalOccurrences.filter((entry) => signalById.get(entry.signal_id)?.kind !== "symptom");
  if (nonSymptomOccurrences.length === 0) lines.push("- No emotion or other Feeling occurrences in selected range.");
  else {
    const grouped = new Map<string, HealthJournalSignalOccurrence[]>();
    for (const entry of nonSymptomOccurrences) grouped.set(entry.signal_id, [...(grouped.get(entry.signal_id) ?? []), entry]);
    for (const [signalId, entries] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const signal = signalById.get(signalId);
      if (!signal) continue;
      lines.push(`- ${getHealthJournalSignalDisplayName(signal, [...symptomById.values()])}: ${entries.length} ${entries.length === 1 ? "occurrence" : "occurrences"}; average score ${formatNumber(average(entries.map((entry) => entry.score)))}; min ${Math.min(...entries.map((entry) => entry.score))}; max ${Math.max(...entries.map((entry) => entry.score))}`);
    }
  }
  if (!detailed) return lines;
  lines.push("", "#### Occurrence details");
  for (const entry of [...symptomEntries].sort((left, right) => left.entry_date.localeCompare(right.entry_date) || left.logged_at.localeCompare(right.logged_at) || left.id.localeCompare(right.id))) {
    lines.push(`- ${formatDateTime(entry.entry_date, entry.logged_at)} — Symptom: ${symptomById.get(entry.symptom_id)?.name ?? "Archived symptom"} — Severity: ${entry.severity}${entry.note?.trim() ? ` — Note: ${entry.note.trim()}` : ""}`);
  }
  for (const entry of [...nonSymptomOccurrences].sort((left, right) => left.entry_date.localeCompare(right.entry_date) || left.occurred_at.localeCompare(right.occurred_at) || left.id.localeCompare(right.id))) {
    const signal = signalById.get(entry.signal_id);
    if (!signal) continue;
    lines.push(`- ${formatDateTime(entry.entry_date, entry.occurred_at)} — ${getHealthJournalSignalDisplayName(signal, [...symptomById.values()])}: ${entry.score}/10${entry.note?.trim() ? ` — Note: ${entry.note.trim()}` : ""}`);
  }
  return lines;
}

function formatMovementSection(data: HealthReportData, range: HealthReportRange, detailed: boolean) {
  const entries = data.metricEntries.filter((entry) => isReportDateInRange(entry.metric_date, range));
  const lines = ["### Movement"];
  const metricDefinitions: Array<[HealthMetricEntry["metric_type"], string, string, number | null]> = [
    ["steps", "Steps", " steps", data.profile?.movement_goal ?? null],
    ["active_energy_kcal", "Active Energy", " kcal", data.profile?.movement_goal_calories ?? null],
    ["exercise_minutes", "Exercise Minutes", " min", data.profile?.movement_goal_minutes ?? null],
  ];
  const datesByType = new Map<string, Set<string>>();
  for (const entry of entries) datesByType.set(entry.metric_type, new Set([...(datesByType.get(entry.metric_type) ?? []), entry.metric_date]));
  for (const [type, label, suffix, goal] of metricDefinitions) {
    const dates = [...(datesByType.get(type) ?? [])].sort();
    if (dates.length === 0) continue;
    const values = dates.map((date) => getHealthDailyMovementMetrics(data.metricEntries, date)[type === "active_energy_kcal" ? "activeEnergyKcal" : type === "exercise_minutes" ? "exerciseMinutes" : "steps"]);
    lines.push(`- ${label}: ${dates.length} recorded day${dates.length === 1 ? "" : "s"}; average recorded day ${formatNumber(average(values))}${suffix}; total ${formatNumber(values.reduce((sum, value) => sum + value, 0))}${suffix}${goal === null ? "" : `; current goal ${formatNumber(goal)}${suffix}; days meeting goal ${values.filter((value) => value >= goal).length}`}`);
  }
  if (lines.length === 1) lines.push("- No data in selected range.");
  if (detailed && lines.length > 1) {
    lines.push("", "#### Movement records");
    for (const entry of [...entries].sort((left, right) => left.metric_date.localeCompare(right.metric_date) || left.metric_type.localeCompare(right.metric_type) || left.id.localeCompare(right.id))) {
      const label = metricDefinitions.find(([type]) => type === entry.metric_type)?.[1] ?? entry.metric_type;
      lines.push(`- ${formatReportDate(entry.metric_date)} — ${label}: ${formatNumber(entry.metric_value)}`);
    }
  }
  return lines;
}

function formatSleepSection(data: HealthReportData, range: HealthReportRange, focusCategories: FocusCategory[], focusHistory: HistoricalFocusSession[], detailed: boolean) {
  const metricDates = data.metricEntries.filter((entry) => entry.metric_type === "sleep_minutes" && isReportDateInRange(entry.metric_date, range)).map((entry) => entry.metric_date);
  const focusDates = getSleepFocusSessions(focusHistory, focusCategories).filter((session) => isReportDateInRange(session.date, range)).map((session) => session.date);
  const dates = sortedDateKeys([...metricDates, ...focusDates]);
  const lines = ["### Sleep"];
  if (dates.length === 0) {
    lines.push("- No data in selected range.");
    return lines;
  }
  const totals: HealthSleepDayTotal[] = dates.map((date) => getHealthSleepDayTotal({ date, focusCategories, focusHistory, metricEntries: data.metricEntries }));
  lines.push(`- Recorded sleep days/sessions: ${dates.length}`, `- Average duration per recorded day: ${formatHealthSleepDuration(average(totals.map((entry) => entry.totalMinutes)) ?? 0)}`);
  const goal = data.profile?.sleep_goal_minutes ?? null;
  if (goal !== null) lines.push(`- Current sleep goal: ${formatHealthSleepDuration(goal)}`, `- Recorded days meeting current goal: ${totals.filter((entry) => entry.totalMinutes >= goal).length}`);
  if (!detailed) return lines;
  for (const total of totals) {
    lines.push("", `#### ${formatReportDate(total.date)}`, `- Total: ${formatHealthSleepDuration(total.totalMinutes)}${total.importedMinutes > 0 ? ` — Health metric ${formatHealthSleepDuration(total.importedMinutes)}` : ""}`);
    for (const session of getSleepFocusSessions(focusHistory, focusCategories).filter((entry) => entry.date === total.date)) {
      lines.push(`- Focus sleep session: ${formatHealthSleepDuration(session.durationSeconds / 60)}${session.title.trim() ? ` — ${session.title.trim()}` : ""}`);
    }
  }
  return lines;
}

function formatWeightSection(data: HealthReportData, range: HealthReportRange, detailed: boolean) {
  const entries = data.weightEntries.filter((entry) => isReportDateInRange(entry.entry_date, range)).sort((left, right) => left.entry_date.localeCompare(right.entry_date) || left.logged_at.localeCompare(right.logged_at) || left.id.localeCompare(right.id));
  const unit = data.profile?.preferred_weight_unit ?? "lb";
  const lines = ["### Weight"];
  if (entries.length === 0) {
    lines.push("- No data in selected range.");
    return lines;
  }
  const first = entries[0];
  const latest = entries.at(-1)!;
  const changeKg = latest.weight_kg - first.weight_kg;
  lines.push(`- Measurements: ${entries.length}`, `- Earliest: ${formatDateTime(first.entry_date, first.logged_at)} — ${formatWeight(first.weight_kg, unit)}`, `- Latest: ${formatDateTime(latest.entry_date, latest.logged_at)} — ${formatWeight(latest.weight_kg, unit)}`);
  if (entries.length > 1) lines.push(`- Change from earliest to latest: ${changeKg >= 0 ? "+" : ""}${formatNumber(kilogramsToDisplayValue(changeKg, unit))} ${unit}`);
  if (data.profile?.target_weight_kg !== null && data.profile?.target_weight_kg !== undefined) lines.push(`- Current target weight: ${formatWeight(data.profile.target_weight_kg, unit)}`);
  if (!detailed) return lines;
  for (const entry of entries) lines.push(`- ${formatDateTime(entry.entry_date, entry.logged_at)} — ${formatWeight(entry.weight_kg, unit)}${entry.note?.trim() ? ` — Note: ${entry.note.trim()}` : ""}${entry.source ? ` — Source: ${entry.source === "apple_health_import" ? "Apple Health" : "Manual"}` : ""}`);
  return lines;
}

function formatWorkoutSection(data: HealthReportData, range: HealthReportRange, detailed: boolean) {
  const entries = data.workouts.filter((entry) => isReportDateInRange(entry.workout_date, range)).sort((left, right) => left.workout_date.localeCompare(right.workout_date) || (left.started_at ?? "").localeCompare(right.started_at ?? "") || left.id.localeCompare(right.id));
  const lines = ["### Workouts"];
  if (entries.length === 0) {
    lines.push("- No data in selected range.");
    return lines;
  }
  const activeCalories = entries.map((entry) => entry.active_calories).filter((value): value is number => value !== null && Number.isFinite(value));
  const types = new Map<string, number>();
  for (const entry of entries) types.set(entry.workout_type, (types.get(entry.workout_type) ?? 0) + 1);
  lines.push(`- Workout count: ${entries.length}`, `- Total duration: ${formatHealthSleepDuration(entries.reduce((sum, entry) => sum + entry.duration_seconds / 60, 0))}`, `- Average duration: ${formatHealthSleepDuration(average(entries.map((entry) => entry.duration_seconds / 60)) ?? 0)}`, `- Total active calories where known: ${activeCalories.length === 0 ? "unknown" : `${formatNumber(activeCalories.reduce((sum, value) => sum + value, 0))} kcal`}`, `- Count by workout type: ${[...types.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([type, count]) => `${type || "Unspecified"} ${count}`).join(", ")}`);
  if (!detailed) return lines;
  for (const entry of entries) {
    const time = entry.started_at && entry.ended_at ? `${formatHealthTimestampTime(entry.started_at) ?? "?"}-${formatHealthTimestampTime(entry.ended_at) ?? "?"}` : formatHealthTimestampTime(entry.started_at) ?? "Time unknown";
    lines.push(`- ${formatReportDate(entry.workout_date)} ${time} — ${entry.title.trim() || "Untitled workout"} — Type: ${entry.workout_type || "Unspecified"} — Duration: ${formatHealthSleepDuration(entry.duration_seconds / 60)}${entry.active_calories === null ? "" : ` — Active calories: ${formatNumber(entry.active_calories)} kcal`}${entry.notes.trim() ? ` — Notes: ${entry.notes.trim()}` : ""}${entry.source ? ` — Source: ${entry.source}` : ""}`);
  }
  return lines;
}

function formatCurrentGoals(profile: HealthProfile | null) {
  const lines = ["### Current Health Goals"];
  if (!profile) {
    lines.push("- Current Health goals/settings are unavailable.");
    return lines;
  }
  const goalLines = [
    formatGoalLine("Calories", profile.calorie_goal, "/day"),
    formatGoalLine("Protein", profile.protein_goal_grams, " g/day"),
    formatGoalLine("Carbs", profile.carbs_goal_grams, " g/day"),
    formatGoalLine("Fat", profile.fat_goal_grams, " g/day"),
    formatGoalLine("Water", profile.water_goal_ml === null ? null : millilitersToWaterAmount(profile.water_goal_ml, "fl_oz"), " fl oz/day"),
    formatGoalLine("Steps", profile.movement_goal, " /day"),
    formatGoalLine("Movement calories", profile.movement_goal_calories, " kcal/day"),
    formatGoalLine("Movement minutes", profile.movement_goal_minutes, " min/day"),
    profile.sleep_goal_minutes === null ? null : `- Sleep: ${formatHealthSleepDuration(profile.sleep_goal_minutes)}/night`,
    profile.target_weight_kg === null ? null : `- Target weight: ${formatWeight(profile.target_weight_kg, profile.preferred_weight_unit)}`,
    `- Preferred weight unit: ${profile.preferred_weight_unit}`,
  ].filter((value): value is string => Boolean(value));
  lines.push(...(goalLines.length > 0 ? goalLines : ["- No current goals configured."]), "- Note: Health goals are current settings, not historical goal snapshots.");
  return lines;
}

export function getHealthReportDateKeys(data: HealthReportData) {
  return sortedDateKeys([
    ...data.dateKeys,
    ...data.checkIns.map((entry) => entry.entry_date),
    ...data.journalSignalOccurrences.map((entry) => entry.entry_date),
    ...data.symptomEntries.map((entry) => entry.entry_date),
    ...data.mealEntries.map((entry) => entry.entry_date),
    ...data.waterEntries.map((entry) => entry.entry_date),
    ...data.weightEntries.map((entry) => entry.entry_date),
    ...data.metricEntries.map((entry) => entry.metric_date),
    ...data.workouts.map((entry) => entry.workout_date),
  ]);
}

export function formatHealthReportSection(
  data: HealthReportData,
  range: HealthReportRange,
  detailed: boolean,
  focusCategories: FocusCategory[] = [],
  focusHistory: HistoricalFocusSession[] = [],
) {
  const lines = ["## Health"];
  if (!data.isAvailable) {
    lines.push("- Health data is unavailable.", ...data.warnings.map((warning) => `- Warning: ${warning}`));
    return lines;
  }
  if (data.warnings.length > 0) lines.push(...data.warnings.map((warning) => `- Warning: ${warning}`));
  const sections = [
    formatJournalSection(data, range, detailed),
    formatFeelingsAndSymptomsSection(data, range, detailed),
    formatFoodSection(data, range, detailed),
    formatWaterSection(data, range, detailed),
    formatSleepSection(data, range, focusCategories, focusHistory, detailed),
    formatMovementSection(data, range, detailed),
    formatWeightSection(data, range, detailed),
    formatWorkoutSection(data, range, detailed),
  ];
  const nonEmptySections = sections.filter((section) => section.some((line) => line !== `- No data in selected range.` && !line.startsWith("### ")));
  lines.push("", ...formatCurrentGoals(data.profile));
  if (nonEmptySections.length === 0) {
    lines.push("", "- No Health records in the selected range.");
  } else {
    for (const section of nonEmptySections) lines.push("", ...section);
  }
  return lines;
}

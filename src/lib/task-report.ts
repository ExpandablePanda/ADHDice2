import type { AchievementProgressModel } from "@/lib/achievement-progress";
import { formatTierLabel } from "@/lib/achievement-progress";
import { shiftDateKey } from "@/lib/date-key";
import { formatReportDate } from "@/lib/report-presentation";
import {
  createEmptyUnifiedReportReadModel,
  type UnifiedReportFocusDay,
  type UnifiedReportHealthDay,
  type UnifiedReportReadModel,
  type UnifiedReportTaskDay,
} from "@/lib/unified-report-read-model";

export const TASK_REPORT_RANGE_OPTIONS = [
  { id: "today", label: "Today", days: 1 },
  { id: "last7", label: "Last 7 days", days: 7 },
  { id: "last30", label: "Last 30 days", days: 30 },
  { id: "last90", label: "Last 90 days", days: 90 },
  { id: "custom", label: "Custom range", days: "custom" },
  { id: "all", label: "All available", days: null },
] as const;

export type TaskReportRangeId = typeof TASK_REPORT_RANGE_OPTIONS[number]["id"];
export type TaskReportCustomRange = { endDateKey: string; startDateKey: string };

export type GenerateTaskReportInput = {
  achievementModel?: AchievementProgressModel | null;
  achievementWarning?: string | null;
  appVersion: string;
  generatedAt: Date;
  historySourceLabel: string;
  historyWarning: string | null;
  customRange?: TaskReportCustomRange | null;
  rangeId: TaskReportRangeId;
  reportData?: UnifiedReportReadModel | null;
  todayDateKey: string;
};

type ReportRange = { endDateKey: string; label: string; spanDays: number; startDateKey: string };

function normalizeCustomRange(customRange: TaskReportCustomRange | null | undefined, todayDateKey: string) {
  const startDateKey = customRange?.startDateKey || todayDateKey;
  const endDateKey = customRange?.endDateKey || startDateKey;
  return startDateKey <= endDateKey ? { startDateKey, endDateKey } : { startDateKey: endDateKey, endDateKey: startDateKey };
}

export function resolveTaskReportHistoryFetchRange(rangeId: TaskReportRangeId, todayDateKey: string, customRange?: TaskReportCustomRange | null) {
  const option = TASK_REPORT_RANGE_OPTIONS.find((entry) => entry.id === rangeId) ?? TASK_REPORT_RANGE_OPTIONS[0];
  if (option.days === "custom") return normalizeCustomRange(customRange, todayDateKey);
  if (option.days !== null) return { endDateKey: todayDateKey, startDateKey: shiftDateKey(todayDateKey, -(option.days - 1)) };
  return { endDateKey: null, startDateKey: null };
}

function countDays(startDateKey: string, endDateKey: string) {
  let count = 0;
  let cursor = startDateKey;
  while (cursor <= endDateKey) {
    count += 1;
    if (cursor === endDateKey) break;
    cursor = shiftDateKey(cursor, 1);
  }
  return count;
}

function buildRange(rangeId: TaskReportRangeId, todayDateKey: string, reportData: UnifiedReportReadModel, customRange?: TaskReportCustomRange | null): ReportRange {
  const option = TASK_REPORT_RANGE_OPTIONS.find((entry) => entry.id === rangeId) ?? TASK_REPORT_RANGE_OPTIONS[0];
  if (option.days === "custom") {
    const normalized = normalizeCustomRange(customRange, todayDateKey);
    return { ...normalized, label: option.label, spanDays: countDays(normalized.startDateKey, normalized.endDateKey) };
  }
  if (option.days !== null) return { endDateKey: todayDateKey, label: option.label, spanDays: option.days, startDateKey: shiftDateKey(todayDateKey, -(option.days - 1)) };
  return { endDateKey: reportData.dateRange.endDateKey, label: option.label, spanDays: countDays(reportData.dateRange.startDateKey, reportData.dateRange.endDateKey), startDateKey: reportData.dateRange.startDateKey };
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatNumber(value: number | null, digits = 1) {
  return value === null || !Number.isFinite(value) ? "unknown" : value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatRange(range: ReportRange) {
  return `${range.label} (${formatReportDate(range.startDateKey)} to ${formatReportDate(range.endDateKey)})`;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function macroLine(label: string, value: number | null, goal: number | null, suffix: string) {
  if (value === null || !Number.isFinite(value)) return null;
  return `- ${label}: ${formatNumber(value)}${suffix}${goal === null ? "" : ` / ${formatNumber(goal)}${suffix} goal`}`;
}

function nutritionLabel(key: string) {
  const labels: Record<string, string> = {
    added_sugars_g: "Added Sugars", calcium_mg: "Calcium", caffeine_mg: "Caffeine", cholesterol_mg: "Cholesterol", choline_mg: "Choline", copper_mg: "Copper", dietary_fiber_g: "Fiber", folate_b9_mcg_dfe: "Vitamin B9", iron_mg: "Iron", iodine_mcg: "Iodine", insoluble_fiber_g: "Insoluble Fiber", magnesium_mg: "Magnesium", manganese_mg: "Manganese", monounsaturated_fat_g: "Monounsaturated Fat", molybdenum_mcg: "Molybdenum", niacin_b3_mg: "Vitamin B3", omega_3_g: "Omega-3", omega_6_g: "Omega-6", pantothenic_acid_b5_mg: "Vitamin B5", phosphorus_mg: "Phosphorus", polyunsaturated_fat_g: "Polyunsaturated Fat", potassium_mg: "Potassium", riboflavin_b2_mg: "Vitamin B2", saturated_fat_g: "Saturated Fat", selenium_mcg: "Selenium", sodium_mg: "Sodium", soluble_fiber_g: "Soluble Fiber", sugar_alcohol_g: "Sugar Alcohol", thiamin_b1_mg: "Vitamin B1", total_sugars_g: "Total Sugars", trans_fat_g: "Trans Fat", vitamin_a_mcg_rae: "Vitamin A", vitamin_b12_mcg: "Vitamin B12", vitamin_b6_mg: "Vitamin B6", vitamin_c_mg: "Vitamin C", vitamin_d_mcg: "Vitamin D", vitamin_e_mg: "Vitamin E", vitamin_k_mcg: "Vitamin K", zinc_mg: "Zinc",
  };
  if (labels[key]) return labels[key];
  return humanize(key.replace(/_(?:mcg|mg|g)(?:_(?:rae|dfe))?$/, ""));
}

function nutritionUnit(key: string) {
  return key.endsWith("_g") ? "g" : key.endsWith("_mcg") || key.includes("_mcg_") ? "mcg" : "mg";
}

function formatWeight(valueKg: number, unit: "kg" | "lb") {
  const display = unit === "lb" ? valueKg * 2.2046226218 : valueKg;
  return `${formatNumber(display)} ${unit}`;
}

function formatWeightChange(valueKg: number, unit: "kg" | "lb") {
  const display = unit === "lb" ? valueKg * 2.2046226218 : valueKg;
  return `${display >= 0 ? "+" : ""}${formatNumber(display)} ${unit}`;
}

function formatAchievementSection(model: AchievementProgressModel | null | undefined, warning: string | null | undefined, range: ReportRange) {
  const lines = ["### Achievements"];
  if (warning) lines.push(`- Warning: ${warning}`);
  const earned: Array<{ collection: string; earnedDate: string; name: string; tier: string }> = [];
  for (const collection of model?.collections ?? []) {
    for (const track of collection.tracks) {
      for (const tier of track.tiers) {
        const earnedDate = tier.earnedAt?.slice(0, 10);
        if (earnedDate && earnedDate >= range.startDateKey && earnedDate <= range.endDateKey) earned.push({ collection: collection.title, earnedDate: tier.earnedAt!, name: track.title, tier: formatTierLabel(tier.id) });
      }
    }
    const masteredDate = collection.masteredAt?.slice(0, 10);
    if (masteredDate && masteredDate >= range.startDateKey && masteredDate <= range.endDateKey) earned.push({ collection: collection.title, earnedDate: collection.masteredAt!, name: collection.title, tier: "Collection mastery" });
  }
  if (earned.length === 0) lines.push("- None earned during the selected range.");
  else for (const entry of earned.sort((left, right) => left.earnedDate.localeCompare(right.earnedDate) || left.name.localeCompare(right.name))) lines.push(`- ${entry.name} — Collection: ${entry.collection} — Tier: ${entry.tier} — Earned: ${formatReportDate(entry.earnedDate)}`);
  return lines;
}

function formatTasksSummary(reportData: UnifiedReportReadModel, range: ReportRange) {
  const lines = ["### Tasks", `- Range: ${formatRange(range)}`, `- Done: ${reportData.tasks.totals.done}`, `- Did My Best: ${reportData.tasks.totals.didMyBest}`, `- Complete: ${reportData.tasks.totals.complete}`, `- New Misses: ${reportData.tasks.totals.newMisses}`];
  const best = reportData.tasks.days.reduce<UnifiedReportTaskDay | null>((current, day) => {
    const handled = day.done.length + day.didMyBest.length + day.complete.length;
    const currentHandled = current ? current.done.length + current.didMyBest.length + current.complete.length : 0;
    return handled > currentHandled ? day : current;
  }, null);
  const highestNewMiss = reportData.tasks.days.reduce<UnifiedReportTaskDay | null>((current, day) => day.newMisses.length > (current?.newMisses.length ?? 0) ? day : current, null);
  const highestBacklog = reportData.tasks.days.reduce<UnifiedReportTaskDay | null>((current, day) => day.totalMisses > (current?.totalMisses ?? 0) ? day : current, null);
  lines.push(`- Best completion day: ${best ? `${formatReportDate(best.dateKey)} (${best.done.length + best.didMyBest.length + best.complete.length} handled)` : "None"}`);
  lines.push(`- Highest new-miss day: ${highestNewMiss ? `${formatReportDate(highestNewMiss.dateKey)} (${highestNewMiss.newMisses.length})` : "None"}`);
  lines.push(`- Highest Total Misses backlog: ${highestBacklog ? `${formatReportDate(highestBacklog.dateKey)} (${highestBacklog.totalMisses})` : "None"}`);
  return lines;
}

function formatFocusSummary(reportData: UnifiedReportReadModel) {
  const average = reportData.focus.sessionCount > 0 ? reportData.focus.totalSeconds / reportData.focus.sessionCount : null;
  return ["### Focus", `- Total Focus time: ${formatDuration(reportData.focus.totalSeconds)}`, `- Session count: ${reportData.focus.sessionCount}`, `- Average session duration: ${formatDuration(average ?? 0)}`, `- Totals by category: ${Object.entries(reportData.focus.byCategorySeconds).sort(([left], [right]) => left.localeCompare(right)).map(([category, seconds]) => `${category} ${formatDuration(seconds)}`).join(", ") || "None"}`];
}

function formatHealthSummary(reportData: UnifiedReportReadModel) {
  const foodDays = reportData.days.filter((day) => Object.keys(day.food.foodsByMeal).length > 0);
  const averageMacro = (key: "calories" | "protein_g" | "carbs_g" | "fat_g") => {
    const values = foodDays.map((day) => day.food.macros[key]).filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const waterDays = reportData.days.filter((day) => day.water.logged);
  const workoutDays = reportData.days.filter((day) => day.fitness.workouts.length > 0);
  const sleepDays = reportData.days.map((day) => day.sleep.totalMinutes).filter((value): value is number => value !== null);
  const weightEntries = reportData.weightEntries;
  const workouts = reportData.days.flatMap((day) => day.fitness.workouts);
  const workoutTypes = workouts.reduce<Record<string, number>>((counts, workout) => { counts[workout.type] = (counts[workout.type] ?? 0) + 1; return counts; }, {});
  const averageCalories = macroLine("Average daily calories", averageMacro("calories"), reportData.healthGoals.calorieGoal, " kcal");
  const averageMacros = [
    { label: "protein", value: averageMacro("protein_g") },
    { label: "carbs", value: averageMacro("carbs_g") },
    { label: "fat", value: averageMacro("fat_g") },
  ].filter((entry): entry is { label: string; value: number } => entry.value !== null && Number.isFinite(entry.value));
  return [
    "### Food / Nutrition",
    `- Logged days: ${foodDays.length} of ${reportData.days.length}`,
    ...(averageCalories ? [averageCalories] : []),
    ...(averageMacros.length > 0 ? [`- Average ${averageMacros.map(({ label, value }) => `${label}: ${formatNumber(value)}g`).join("; ")}`] : []),
    "",
    "### Water",
    `- Days logged: ${waterDays.length} of ${reportData.days.length}`,
    `- Total: ${formatNumber(waterDays.reduce((sum, day) => sum + (day.water.amountMl ?? 0), 0) / 29.5735)} fl oz; average logged day: ${formatNumber(waterDays.length > 0 ? waterDays.reduce((sum, day) => sum + (day.water.amountMl ?? 0), 0) / waterDays.length / 29.5735 : null)} fl oz`,
    `- Days meeting goal: ${waterDays.filter((day) => day.water.goalMl !== null && (day.water.amountMl ?? 0) >= day.water.goalMl).length}`,
    "",
    "### Fitness",
    `- Workout count: ${workouts.length}; workout days: ${workoutDays.length}`,
    `- Total workout duration: ${formatDuration(workouts.reduce((sum, workout) => sum + workout.durationSeconds, 0))}`,
    `- Workout types: ${Object.entries(workoutTypes).map(([type, count]) => `${type} ${count}`).join(", ") || "None"}`,
    `- Movement totals: Steps ${formatNumber(reportData.days.reduce((sum, day) => sum + (day.fitness.steps ?? 0), 0), 0)}; Active Energy ${formatNumber(reportData.days.reduce((sum, day) => sum + (day.fitness.activeEnergyKcal ?? 0), 0), 0)} kcal; Exercise Minutes ${formatNumber(reportData.days.reduce((sum, day) => sum + (day.fitness.exerciseMinutes ?? 0), 0), 0)}`,
    "",
    "### Journal",
    `- Entries: ${reportData.days.reduce((sum, day) => sum + day.journal.entries.length, 0)}`,
    `- Recorded feeling/symptom observations: ${reportData.days.reduce((sum, day) => sum + day.journal.entries.reduce((entrySum, entry) => entrySum + entry.feelings.length + entry.symptoms.length, 0), 0)}`,
    "",
    "### Weight",
    weightEntries.length === 0 ? "- No weight entries in selected range." : `- Starting: ${formatWeight(weightEntries[0].weightKg, reportData.healthGoals.preferredWeightUnit)}; ending: ${formatWeight(weightEntries.at(-1)!.weightKg, reportData.healthGoals.preferredWeightUnit)}; change: ${formatWeightChange(weightEntries.at(-1)!.weightKg - weightEntries[0].weightKg, reportData.healthGoals.preferredWeightUnit)}`,
    "",
    "### Sleep",
    `- Average recorded sleep: ${sleepDays.length > 0 ? formatDuration((sleepDays.reduce((sum, value) => sum + value, 0) / sleepDays.length) * 60) : "unknown"}`,
    `- Goal: ${reportData.healthGoals.sleepGoalMinutes === null ? "Not configured" : formatDuration(reportData.healthGoals.sleepGoalMinutes * 60)}`,
    `- Days meeting goal: ${reportData.healthGoals.sleepGoalMinutes === null ? "Not available" : sleepDays.filter((value) => value >= reportData.healthGoals.sleepGoalMinutes!).length}`,
  ];
}

function formatPathsAndOnTime(reportData: UnifiedReportReadModel) {
  const lines: string[] = [];
  if (reportData.paths.available) lines.push("### PATHS", "- Paths used: available in report data.");
  if (reportData.onTime.available) lines.push(...(lines.length > 0 ? [""] : []), "### On-Time", "- On-Time sessions: available in report data.");
  return lines;
}

function formatRecords(reportData: UnifiedReportReadModel) {
  const lines = ["### Records", `- Events in selected range: ${reportData.records.length}`];
  if (reportData.records.length === 0) lines.push("- No Set, Broken, or Tied Record events in selected range.");
  else for (const event of reportData.records) lines.push(`- ${event.eventKind === "break" ? "Broken" : humanize(event.eventKind)}: ${humanize(event.metricKey)} — ${formatReportDate(event.creditedDate)} — ${formatNumber(event.value)} ${event.unit} — ${event.scopeLabel}`);
  return lines;
}

function formatFoodDay(day: UnifiedReportHealthDay, reportData: UnifiedReportReadModel) {
  const hasFood = Object.keys(day.food.foodsByMeal).length > 0;
  const macroLines = [
    macroLine("Calories", day.food.macros.calories, reportData.healthGoals.calorieGoal, " kcal"),
    macroLine("Protein", day.food.macros.protein_g, reportData.healthGoals.proteinGoalG, "g"),
    macroLine("Carbs", day.food.macros.carbs_g, reportData.healthGoals.carbsGoalG, "g"),
    macroLine("Fat", day.food.macros.fat_g, reportData.healthGoals.fatGoalG, "g"),
  ].filter((line): line is string => line !== null);
  const lines = ["#### Food / Nutrition", ...(hasFood ? macroLines : ["- Not logged"])]
  if (!hasFood) return lines;
  for (const [meal, foods] of Object.entries(day.food.foodsByMeal).sort(([left], [right]) => left.localeCompare(right))) {
    lines.push("", humanize(meal));
    for (const food of foods) {
      const macros = [
        food.calories === null || !Number.isFinite(food.calories) ? null : `${formatNumber(food.calories)} kcal`,
        food.proteinG === null || !Number.isFinite(food.proteinG) ? null : `${formatNumber(food.proteinG)}g protein`,
        food.carbsG === null || !Number.isFinite(food.carbsG) ? null : `${formatNumber(food.carbsG)}g carbs`,
        food.fatG === null || !Number.isFinite(food.fatG) ? null : `${formatNumber(food.fatG)}g fat`,
      ].filter((value): value is string => value !== null);
      lines.push(`- ${food.name}`);
      if (macros.length > 0) lines.push(`  - ${macros.join(" | ")}`);
    }
  }
  const knownNutrients = Object.entries(day.food.nutritionSummary?.values ?? {})
    .filter(([, value]) => Number.isFinite(value) && value !== 0 && formatNumber(value) !== "0" && formatNumber(value) !== "-0");
  if (day.food.nutritionSummary && knownNutrients.length > 0) {
    const partial = knownNutrients.some(([key]) => {
      const coverage = day.food.nutritionSummary?.coverage[key];
      return coverage !== undefined && coverage.knownEntries < coverage.totalEntries;
    });
    lines.push("", `Daily Nutrition Summary${partial ? " (partial known-data coverage)" : ""}`);
    for (const [key, value] of knownNutrients.sort(([left], [right]) => left.localeCompare(right))) {
      const coverage = day.food.nutritionSummary.coverage[key];
      lines.push(`- ${nutritionLabel(key)}: ${formatNumber(value)}${nutritionUnit(key)}${coverage && coverage.knownEntries < coverage.totalEntries ? ` (${coverage.knownEntries} of ${coverage.totalEntries} food entries known)` : ""}`);
    }
  }
  return lines;
}

function formatDailyDetail(reportData: UnifiedReportReadModel, range: ReportRange) {
  const tasksByDate = new Map(reportData.tasks.days.map((day) => [day.dateKey, day] as const));
  const focusByDate = new Map(reportData.focus.days.map((day) => [day.dateKey, day] as const));
  const healthByDate = new Map(reportData.days.map((day) => [day.dateKey, day] as const));
  const lines = ["## Daily Detail"];
  let dateKey = range.startDateKey;
  while (dateKey <= range.endDateKey) {
    const task = tasksByDate.get(dateKey) ?? { complete: [], didMyBest: [], done: [], dateKey, newMisses: [], totalMisses: 0 };
    const focus = focusByDate.get(dateKey) ?? { dateKey, sessions: [], totalSeconds: 0 } satisfies UnifiedReportFocusDay;
    const health = healthByDate.get(dateKey) ?? createEmptyUnifiedReportReadModel(dateKey, dateKey).days[0];
    lines.push("", `### ${formatReportDate(dateKey)}`, "#### Tasks", `- Done (${task.done.length})`, ...task.done.map((name) => `  - ${name}`), `- Did My Best (${task.didMyBest.length})`, ...task.didMyBest.map((name) => `  - ${name}`), `- Complete (${task.complete.length})`, ...task.complete.map((name) => `  - ${name}`), "- Missed", `  - New Misses: ${task.newMisses.length}`, ...task.newMisses.map((name) => `    - ${name}`), `  - Total Misses: ${task.totalMisses} (includes ${task.newMisses.length} new)`);
    lines.push("", "#### Focus", `- Total: ${formatDuration(focus.totalSeconds)} across ${focus.sessions.length} session${focus.sessions.length === 1 ? "" : "s"}`, ...(focus.sessions.length === 0 ? ["- No sessions logged."] : focus.sessions.map((session) => `- ${session.title} — ${session.category} — ${formatDuration(session.durationSeconds)}`)));
    const historicalSections: string[] = [];
    if (reportData.paths.available) historicalSections.push("#### PATHS", "- No Path activity logged.");
    if (reportData.onTime.available) historicalSections.push(...(historicalSections.length > 0 ? [""] : []), "#### On-Time", "- No On-Time activity logged.");
    lines.push("", ...historicalSections, ...(historicalSections.length > 0 ? [""] : []), ...formatFoodDay(health, reportData), "", "#### Water", health.water.logged ? `- ${formatNumber((health.water.amountMl ?? 0) / 29.5735)} fl oz${health.water.goalMl === null ? "" : ` / ${formatNumber(health.water.goalMl / 29.5735)} fl oz goal`}` : "- Not logged", "", "#### Fitness");
    const movement = [`Steps: ${formatNumber(health.fitness.steps, 0)}`, `Active Energy: ${formatNumber(health.fitness.activeEnergyKcal, 0)} kcal`, `Exercise Minutes: ${formatNumber(health.fitness.exerciseMinutes, 0)}`].filter((line) => !line.includes("unknown"));
    if (health.fitness.workouts.length === 0 && movement.length === 0) lines.push("- Not logged");
    else { lines.push(...movement.map((line) => `- ${line}`)); for (const workout of health.fitness.workouts) lines.push(`- ${workout.title} — ${workout.type} — ${formatDuration(workout.durationSeconds)}${workout.activeCalories === null ? "" : ` — ${formatNumber(workout.activeCalories, 0)} active kcal`}`); }
    lines.push("", "#### Journal");
    if (health.journal.entries.length === 0) lines.push("- No entries logged.");
    else for (const entry of health.journal.entries) { lines.push(`- ${entry.entryType}${entry.time ? ` — ${entry.time}` : ""}`); if (entry.reflection) lines.push(`  - Reflection: ${entry.reflection}`); if (entry.tags.length > 0) lines.push(`  - Tags: ${entry.tags.join(", ")}`); for (const [label, value] of Object.entries(entry.ratings)) lines.push(`  - ${label}: ${value}`); for (const field of entry.structured) lines.push(`  - ${field.label}: ${field.value}`); for (const feeling of entry.feelings) lines.push(`  - Feeling: ${feeling.name} (${feeling.score})`); for (const symptom of entry.symptoms) lines.push(`  - Symptom: ${symptom.name} (${symptom.severity})`); }
    lines.push("", "#### Weight", health.weightKg === null ? "- Not logged" : `- ${formatWeight(health.weightKg, reportData.healthGoals.preferredWeightUnit)}`, "", "#### Sleep", health.sleep.totalMinutes === null ? "- Not logged" : `- Total: ${formatDuration(health.sleep.totalMinutes * 60)}`, ...health.sleep.sessions.map((session) => `- Sleep session: ${session.title} — ${formatDuration(session.durationMinutes * 60)}`));
    dateKey = shiftDateKey(dateKey, 1);
  }
  return lines;
}

export function generateTaskReport({ achievementModel = null, achievementWarning = null, appVersion, generatedAt, historySourceLabel, historyWarning, customRange, rangeId, reportData: suppliedReportData = null, todayDateKey }: GenerateTaskReportInput) {
  const reportData = suppliedReportData ?? createEmptyUnifiedReportReadModel(todayDateKey, todayDateKey);
  const range = buildRange(rangeId, todayDateKey, reportData, customRange);
  const insights = [...reportData.insights];
  const foodDays = reportData.days.filter((day) => Object.keys(day.food.foodsByMeal).length > 0);
  const waterDays = reportData.days.filter((day) => day.water.logged);
  const sleepDays = reportData.days.filter((day) => day.sleep.totalMinutes !== null);
  insights.push(`Focus sessions: ${reportData.focus.sessionCount} across ${reportData.focus.days.filter((day) => day.totalSeconds > 0).length} logged day(s).`);
  insights.push(`Food logging: ${foodDays.length} of ${reportData.days.length} day(s).`);
  insights.push(`Hydration logging: ${waterDays.length} of ${reportData.days.length} day(s).`);
  insights.push(`Average recorded sleep: ${sleepDays.length > 0 ? formatDuration(sleepDays.reduce((sum, day) => sum + day.sleep.totalMinutes!, 0) / sleepDays.length * 60) : "unknown"}.`);
  return [
    "# ADHDice Report", "", "## Period Summary", `- Generated: ${generatedAt.toLocaleString("en-US")}`, `- App Version: ${appVersion}`, `- Selected Date Range: ${formatRange(range)}`, `- Read path: ${historySourceLabel}`,
    ...(historyWarning ? [`- Warning: ${historyWarning}`] : []), ...reportData.warnings.map((warning) => `- Warning: ${warning}`), "", ...formatTasksSummary(reportData, range), "", ...formatFocusSummary(reportData), "", ...formatPathsAndOnTime(reportData), "", ...formatHealthSummary(reportData), "", ...formatAchievementSection(achievementModel, achievementWarning, range), "", ...formatRecords(reportData), "", "## Period Insights", "### Insights", ...(insights.length > 0 ? insights.map((insight) => `- ${insight}`) : ["- No computed observations in selected range."]), "", ...formatDailyDetail(reportData, range),
  ].join("\n");
}

export { createEmptyUnifiedReportReadModel };

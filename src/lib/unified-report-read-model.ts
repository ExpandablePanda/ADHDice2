export type ReportMacroKey = "calories" | "protein_g" | "carbs_g" | "fat_g";

export type ReportMacroTotals = Record<ReportMacroKey, number | null>;

export type ReportNutrientCoverage = {
  knownEntries: number;
  totalEntries: number;
};

export type ReportNutritionSummary = {
  coverage: Record<string, ReportNutrientCoverage>;
  values: Record<string, number>;
};

const REPORT_NUTRIENT_KEYS = [
  "saturated_fat_g", "trans_fat_g", "monounsaturated_fat_g", "polyunsaturated_fat_g", "cholesterol_mg", "sodium_mg", "dietary_fiber_g", "soluble_fiber_g", "insoluble_fiber_g", "total_sugars_g", "added_sugars_g", "sugar_alcohol_g",
  "vitamin_a_mcg_rae", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_e_mg", "vitamin_k_mcg", "thiamin_b1_mg", "riboflavin_b2_mg", "niacin_b3_mg", "pantothenic_acid_b5_mg", "vitamin_b6_mg", "biotin_b7_mcg", "folate_b9_mcg_dfe", "vitamin_b12_mcg", "choline_mg",
  "calcium_mg", "iron_mg", "magnesium_mg", "phosphorus_mg", "potassium_mg", "zinc_mg", "copper_mg", "manganese_mg", "selenium_mcg", "iodine_mcg", "chromium_mcg", "molybdenum_mcg", "chloride_mg", "caffeine_mg", "omega_3_g", "omega_6_g",
] as const;

export type UnifiedReportTaskDay = {
  complete: string[];
  didMyBest: string[];
  done: string[];
  dateKey: string;
  newMisses: string[];
  totalMisses: number;
};

export type UnifiedReportFocusSession = {
  category: string;
  durationSeconds: number;
  title: string;
};

export type UnifiedReportFocusDay = {
  dateKey: string;
  sessions: UnifiedReportFocusSession[];
  totalSeconds: number;
};

export type UnifiedReportFood = {
  carbsG: number | null;
  calories: number | null;
  fatG: number | null;
  name: string;
  proteinG: number | null;
};

export type UnifiedReportJournalEntry = {
  entryType: string;
  feelings: Array<{ name: string; score: number }>;
  ratings: Record<string, number>;
  reflection: string;
  structured: Array<{ label: string; value: boolean | number | string }>;
  symptoms: Array<{ name: string; severity: number }>;
  tags: string[];
  time: string | null;
};

export type UnifiedReportWorkout = {
  activeCalories: number | null;
  durationSeconds: number;
  title: string;
  type: string;
};

export type UnifiedReportHealthDay = {
  dateKey: string;
  fitness: {
    activeEnergyKcal: number | null;
    exerciseMinutes: number | null;
    steps: number | null;
    workouts: UnifiedReportWorkout[];
  };
  food: {
    foodsByMeal: Record<string, UnifiedReportFood[]>;
    macros: ReportMacroTotals;
    nutritionSummary: ReportNutritionSummary | null;
  };
  journal: {
    entries: UnifiedReportJournalEntry[];
  };
  sleep: {
    sessions: Array<{ durationMinutes: number; title: string }>;
    totalMinutes: number | null;
  };
  water: {
    amountMl: number | null;
    goalMl: number | null;
    logged: boolean;
  };
  weightKg: number | null;
};

export type UnifiedReportRecordEvent = {
  creditedDate: string;
  eventKind: "set" | "break" | "tie" | string;
  metricKey: string;
  scopeId: string | null;
  scopeLabel: string;
  value: number;
  unit: string;
};

export type UnifiedReportAchievement = {
  collection: string;
  earnedDate: string;
  name: string;
  tier: string;
};

export type UnifiedReportReadModel = {
  achievements: UnifiedReportAchievement[];
  dateRange: {
    endDateKey: string;
    startDateKey: string;
  };
  days: UnifiedReportHealthDay[];
  focus: {
    byCategorySeconds: Record<string, number>;
    days: UnifiedReportFocusDay[];
    sessionCount: number;
    totalSeconds: number;
  };
  healthGoals: {
    calorieGoal: number | null;
    carbsGoalG: number | null;
    fatGoalG: number | null;
    preferredWeightUnit: "kg" | "lb";
    proteinGoalG: number | null;
    sleepGoalMinutes: number | null;
    waterGoalMl: number | null;
  };
  insights: string[];
  onTime: {
    available: boolean;
    limitation: string | null;
  };
  paths: {
    available: boolean;
    limitation: string | null;
  };
  records: UnifiedReportRecordEvent[];
  tasks: {
    days: UnifiedReportTaskDay[];
    totals: Record<"complete" | "didMyBest" | "done" | "newMisses", number>;
  };
  warnings: string[];
  weightEntries: Array<{ dateKey: string; weightKg: number }>;
};

export type ReportTaskSourceRow = {
  id: string;
  parent_task_id: string | null;
  permanently_deleted_at?: string | null;
  title: string;
};

export type ReportHistorySourceRow = {
  entity_id: string;
  logical_date: string;
  outcome: string;
  updated_at: string;
};

export type ReportFocusCategorySourceRow = {
  focus_subtype: string | null;
  focus_subtype_2: string | null;
  focus_type: string;
  id: string;
  title: string;
};

export type ReportFocusSourceRow = {
  category_id: string | null;
  duration_seconds: number;
  id: string;
  session_date: string;
  title_snapshot: string;
};

export type ReportHealthProfileSourceRow = {
  calorie_goal: number | null;
  carbs_goal_grams: number | null;
  fat_goal_grams: number | null;
  preferred_weight_unit: "kg" | "lb";
  protein_goal_grams: number | null;
  sleep_goal_minutes: number | null;
  water_goal_ml: number | null;
};

export type ReportMealSourceRow = {
  carbs_g: number | null;
  calories: number | null;
  entry_date: string;
  fat_g: number | null;
  food_name: string;
  food_snapshot: { nutrition_details?: Record<string, unknown> | null } | null;
  meal_slot: string;
  nutrition_snapshot: { calories?: number | null; carbs_g?: number | null; fat_g?: number | null; nutrition_details?: Record<string, unknown> | null; protein_g?: number | null } | null;
  protein_g: number | null;
};

export type ReportWaterSourceRow = {
  amount_ml: number | null;
  confirmed_at: string | null;
  entry_date: string;
};

export type ReportWeightSourceRow = {
  entry_date: string;
  logged_at: string;
  weight_kg: number;
};

export type ReportMetricSourceRow = {
  metric_date: string;
  metric_type: string;
  metric_value: number;
};

export type ReportWorkoutSourceRow = {
  active_calories: number | null;
  duration_seconds: number;
  title: string;
  workout_date: string;
  workout_type: string;
};

export type ReportCheckInSourceRow = {
  entry_date: string;
  entry_time: string;
  entry_type: string | null;
  energy_score: number | null;
  id: string;
  reflection: string;
  stress_score: number | null;
  mood_score: number | null;
  clarity_score: number | null;
  symptom_tags?: string[] | null;
  structured_answers?: Record<string, unknown> | null;
};

export type ReportSignalSourceRow = {
  id: string;
  kind: string;
  name: string | null;
  symptom_id: string | null;
};

export type ReportSignalValueSourceRow = {
  score: number;
  signal_id: string;
  journal_entry_id: string;
};

export type ReportSignalOccurrenceSourceRow = {
  entry_date: string;
  journal_entry_id?: string | null;
  score: number;
  signal_id: string;
};

export type ReportSymptomSourceRow = {
  id: string;
  name: string;
};

export type ReportSymptomEntrySourceRow = {
  entry_date: string;
  journal_entry_id?: string | null;
  severity: number;
  symptom_id: string;
};

export type ReportRecordSourceRow = {
  credited_date: string;
  event_kind: string;
  metric_key: string;
  scope_id: string | null;
  scope_kind: string;
  title_snapshot: string | null;
  unit: string;
  value: number;
};

export type UnifiedReportSourceRows = {
  checkIns: ReportCheckInSourceRow[];
  endDateKey: string;
  focusCategories: ReportFocusCategorySourceRow[];
  focusSessions: ReportFocusSourceRow[];
  history: ReportHistorySourceRow[];
  meals: ReportMealSourceRow[];
  metrics: ReportMetricSourceRow[];
  records: ReportRecordSourceRow[];
  signals: ReportSignalSourceRow[];
  signalOccurrences: ReportSignalOccurrenceSourceRow[];
  signalValues: ReportSignalValueSourceRow[];
  startDateKey: string;
  symptomEntries: ReportSymptomEntrySourceRow[];
  symptoms: ReportSymptomSourceRow[];
  tasks: ReportTaskSourceRow[];
  todayDateKey: string;
  water: ReportWaterSourceRow[];
  weight: ReportWeightSourceRow[];
  workouts: ReportWorkoutSourceRow[];
  profile: ReportHealthProfileSourceRow | null;
  warnings?: string[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sumKnown(values: Array<number | null>) {
  const known = values.filter(isFiniteNumber);
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0);
}

function dateKeysInRange(startDateKey: string, endDateKey: string) {
  const keys: string[] = [];
  const cursor = new Date(`${startDateKey}T12:00:00Z`);
  const end = new Date(`${endDateKey}T12:00:00Z`);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function taskPath(taskId: string, tasksById: Map<string, ReportTaskSourceRow>) {
  const path: string[] = [];
  const visited = new Set<string>();
  let current = tasksById.get(taskId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current.title.trim() || "Untitled task");
    current = current.parent_task_id ? tasksById.get(current.parent_task_id) : undefined;
  }
  return path.join(" > ");
}

function createEmptyHealthDay(dateKey: string): UnifiedReportHealthDay {
  return {
    dateKey,
    fitness: { activeEnergyKcal: null, exerciseMinutes: null, steps: null, workouts: [] },
    food: { foodsByMeal: {}, macros: { calories: null, carbs_g: null, fat_g: null, protein_g: null }, nutritionSummary: null },
    journal: { entries: [] },
    sleep: { sessions: [], totalMinutes: null },
    water: { amountMl: null, goalMl: null, logged: false },
    weightKg: null,
  };
}

function getMealNutrient(row: ReportMealSourceRow, key: ReportMacroKey) {
  const snapshot = row.nutrition_snapshot?.[key];
  return isFiniteNumber(snapshot) ? snapshot : isFiniteNumber(row[key]) ? row[key] : null;
}

function addNutritionDetail(
  totals: Record<string, number>,
  coverage: Record<string, ReportNutrientCoverage>,
  details: Record<string, unknown> | null | undefined,
) {
  for (const key of REPORT_NUTRIENT_KEYS) {
    const entry = coverage[key] ?? { knownEntries: 0, totalEntries: 0 };
    entry.totalEntries += 1;
    const value = details?.[key];
    if (isFiniteNumber(value)) {
      entry.knownEntries += 1;
      totals[key] = (totals[key] ?? 0) + value;
    }
    coverage[key] = entry;
  }
}

function humanizeStructuredLabel(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactStructuredAnswers(answers: Record<string, unknown> | null | undefined) {
  const values: Array<{ label: string; value: boolean | number | string }> = [];
  for (const [key, rawValue] of Object.entries(answers ?? {})) {
    if (key === "schema_version" || /(?:^|_)ids?$/i.test(key)) continue;
    if (typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean") values.push({ label: humanizeStructuredLabel(key), value: rawValue });
    else if (Array.isArray(rawValue) && rawValue.every((value) => typeof value === "string")) values.push({ label: humanizeStructuredLabel(key), value: rawValue.join(", ") });
    else if (key === "custom_answers" && Array.isArray(rawValue)) {
      for (const answer of rawValue) {
        if (!answer || typeof answer !== "object") continue;
        const record = answer as Record<string, unknown>;
        const label = [record.label, record.prompt, record.question].find((value): value is string => typeof value === "string" && value.trim().length > 0);
        const value = record.value;
        if (label && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) values.push({ label: label.trim(), value });
      }
    }
  }
  return values;
}

export function buildUnifiedReportReadModel(source: UnifiedReportSourceRows): UnifiedReportReadModel {
  const dateKeys = dateKeysInRange(source.startDateKey, source.endDateKey);
  const daysByDate = new Map(dateKeys.map((dateKey) => [dateKey, createEmptyHealthDay(dateKey)] as const));
  const tasksById = new Map(source.tasks.filter((task) => !task.permanently_deleted_at).map((task) => [task.id, task] as const));
  const history = [...source.history].sort((left, right) => left.logical_date.localeCompare(right.logical_date) || left.updated_at.localeCompare(right.updated_at));
  const latestByTask = new Map<string, ReportHistorySourceRow>();
  for (const entry of history.filter((candidate) => candidate.logical_date < source.startDateKey)) latestByTask.set(entry.entity_id, entry);
  const taskDays = dateKeys.map((dateKey): UnifiedReportTaskDay => {
    const dayFacts = history.filter((entry) => entry.logical_date === dateKey && tasksById.has(entry.entity_id));
    for (const entry of history.filter((candidate) => candidate.logical_date === dateKey)) latestByTask.set(entry.entity_id, entry);
    const names = (outcome: string) => dayFacts.filter((entry) => entry.outcome === outcome).map((entry) => taskPath(entry.entity_id, tasksById)).sort();
    const newMisses = names("missed");
    return {
      complete: names("complete"),
      didMyBest: names("did_my_best"),
      done: names("done"),
      dateKey,
      newMisses,
      totalMisses: [...latestByTask.values()].filter((entry) => entry.outcome === "missed" && tasksById.has(entry.entity_id)).length,
    };
  });

  const focusCategoryById = new Map(source.focusCategories.map((category) => [category.id, category] as const));
  const focusDaysByDate = new Map(dateKeys.map((dateKey) => [dateKey, { dateKey, sessions: [], totalSeconds: 0 } as UnifiedReportFocusDay]));
  const byCategorySeconds: Record<string, number> = {};
  for (const session of source.focusSessions) {
    const day = focusDaysByDate.get(session.session_date);
    if (!day) continue;
    const category = session.category_id ? focusCategoryById.get(session.category_id) : null;
    const categoryLabel = category?.title?.trim() || "Uncategorized";
    const durationSeconds = Math.max(0, session.duration_seconds || 0);
    day.sessions.push({ category: categoryLabel, durationSeconds, title: session.title_snapshot.trim() || "Untitled session" });
    day.totalSeconds += durationSeconds;
    byCategorySeconds[categoryLabel] = (byCategorySeconds[categoryLabel] ?? 0) + durationSeconds;
  }
  for (const day of focusDaysByDate.values()) day.sessions.sort((left, right) => left.title.localeCompare(right.title));

  const signalById = new Map(source.signals.map((signal) => [signal.id, signal] as const));
  const symptomById = new Map(source.symptoms.map((symptom) => [symptom.id, symptom] as const));
  const valuesByJournalId = new Map<string, ReportSignalValueSourceRow[]>();
  const journalEntryById = new Map<string, UnifiedReportJournalEntry>();
  for (const value of source.signalValues) valuesByJournalId.set(value.journal_entry_id, [...(valuesByJournalId.get(value.journal_entry_id) ?? []), value]);
  for (const entry of source.checkIns) {
    const day = daysByDate.get(entry.entry_date);
    if (!day) continue;
    const values = valuesByJournalId.get(entry.id) ?? [];
    const reportEntry: UnifiedReportJournalEntry = {
      entryType: entry.entry_type ?? "check-in",
      feelings: values.flatMap((value) => {
        const signal = signalById.get(value.signal_id);
        return signal && signal.kind !== "symptom" ? [{ name: signal.name?.trim() || "Feeling", score: value.score }] : [];
      }),
      ratings: Object.fromEntries([
        ["Mood", entry.mood_score],
        ["Energy", entry.energy_score],
        ["Stress", entry.stress_score],
        ["Mental Clarity", entry.clarity_score],
      ].filter((pair): pair is [string, number] => isFiniteNumber(pair[1]))),
      reflection: entry.reflection.trim(),
      structured: compactStructuredAnswers(entry.structured_answers),
      symptoms: [],
      tags: (entry.symptom_tags ?? []).filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim()),
      time: entry.entry_time || null,
    };
    day.journal.entries.push(reportEntry);
    journalEntryById.set(entry.id, reportEntry);
  }
  for (const occurrence of source.signalOccurrences) {
    const day = daysByDate.get(occurrence.entry_date);
    const signal = signalById.get(occurrence.signal_id);
    if (!day || !signal) continue;
    const target = (occurrence.journal_entry_id ? journalEntryById.get(occurrence.journal_entry_id) : null) ?? day.journal.entries[0];
    if (signal.kind === "symptom") target?.symptoms.push({ name: signal.name?.trim() || "Symptom", severity: occurrence.score });
    else target?.feelings.push({ name: signal.name?.trim() || "Feeling", score: occurrence.score });
  }
  for (const occurrence of source.symptomEntries) {
    const day = daysByDate.get(occurrence.entry_date);
    if (!day) continue;
    const target = (occurrence.journal_entry_id ? journalEntryById.get(occurrence.journal_entry_id) : null) ?? day.journal.entries[0] ?? { entryType: "occurrence", feelings: [], ratings: {}, reflection: "", structured: [], symptoms: [], tags: [], time: null };
    if (day.journal.entries.length === 0) day.journal.entries.push(target);
    target.symptoms.push({ name: symptomById.get(occurrence.symptom_id)?.name ?? "Symptom", severity: occurrence.severity });
  }

  const nutrientValuesByDate = new Map<string, Record<string, number>>();
  const nutrientCoverageByDate = new Map<string, Record<string, ReportNutrientCoverage>>();
  for (const meal of source.meals) {
    const day = daysByDate.get(meal.entry_date);
    if (!day) continue;
    const food: UnifiedReportFood = {
      carbsG: getMealNutrient(meal, "carbs_g"),
      calories: getMealNutrient(meal, "calories"),
      fatG: getMealNutrient(meal, "fat_g"),
      name: meal.food_name.trim() || "Unnamed food",
      proteinG: getMealNutrient(meal, "protein_g"),
    };
    day.food.foodsByMeal[meal.meal_slot] = [...(day.food.foodsByMeal[meal.meal_slot] ?? []), food];
    for (const key of ["calories", "protein_g", "carbs_g", "fat_g"] as const) {
      const value = key === "protein_g" ? food.proteinG : key === "carbs_g" ? food.carbsG : key === "fat_g" ? food.fatG : food.calories;
      day.food.macros[key] = sumKnown([day.food.macros[key], value]);
    }
    const details = meal.nutrition_snapshot?.nutrition_details ?? meal.food_snapshot?.nutrition_details;
    const totals = nutrientValuesByDate.get(meal.entry_date) ?? {};
    const coverage = nutrientCoverageByDate.get(meal.entry_date) ?? {};
    addNutritionDetail(totals, coverage, details);
    nutrientValuesByDate.set(meal.entry_date, totals);
    nutrientCoverageByDate.set(meal.entry_date, coverage);
  }
  for (const [dateKey, day] of daysByDate) {
    const totals = nutrientValuesByDate.get(dateKey);
    const coverage = nutrientCoverageByDate.get(dateKey);
    day.food.nutritionSummary = totals && coverage ? { coverage, values: totals } : null;
  }

  for (const water of source.water) {
    const day = daysByDate.get(water.entry_date);
    if (!day || !water.confirmed_at || !isFiniteNumber(water.amount_ml)) continue;
    day.water.amountMl = sumKnown([day.water.amountMl, water.amount_ml]);
    day.water.logged = true;
  }
  for (const metric of source.metrics) {
    const day = daysByDate.get(metric.metric_date);
    if (!day || !isFiniteNumber(metric.metric_value)) continue;
    if (metric.metric_type === "steps") day.fitness.steps = sumKnown([day.fitness.steps, metric.metric_value]);
    if (metric.metric_type === "active_energy_kcal") day.fitness.activeEnergyKcal = sumKnown([day.fitness.activeEnergyKcal, metric.metric_value]);
    if (metric.metric_type === "exercise_minutes") day.fitness.exerciseMinutes = sumKnown([day.fitness.exerciseMinutes, metric.metric_value]);
    if (metric.metric_type === "sleep_minutes") day.sleep.totalMinutes = sumKnown([day.sleep.totalMinutes, metric.metric_value]);
  }
  for (const workout of source.workouts) {
    const day = daysByDate.get(workout.workout_date);
    if (!day) continue;
    day.fitness.workouts.push({ activeCalories: workout.active_calories, durationSeconds: Math.max(0, workout.duration_seconds), title: workout.title.trim() || "Workout", type: workout.workout_type.trim() || "Unspecified" });
  }
  for (const focusDay of focusDaysByDate.values()) {
    const sleepSessions = focusDay.sessions.filter((session) => /\bsleep\b/i.test(session.category));
    const day = daysByDate.get(focusDay.dateKey);
    if (!day || sleepSessions.length === 0) continue;
    day.sleep.totalMinutes ??= sleepSessions.reduce((sum, session) => sum + session.durationSeconds / 60, 0);
  }

  const weightEntries = [...source.weight]
    .filter((entry) => daysByDate.has(entry.entry_date) && isFiniteNumber(entry.weight_kg))
    .sort((left, right) => left.entry_date.localeCompare(right.entry_date) || left.logged_at.localeCompare(right.logged_at));
  for (const entry of weightEntries) {
    const day = daysByDate.get(entry.entry_date);
    if (day) day.weightKg = entry.weight_kg;
  }
  for (const day of daysByDate.values()) day.water.goalMl = source.profile?.water_goal_ml ?? null;

  const taskTotals = {
    complete: taskDays.reduce((sum, day) => sum + day.complete.length, 0),
    didMyBest: taskDays.reduce((sum, day) => sum + day.didMyBest.length, 0),
    done: taskDays.reduce((sum, day) => sum + day.done.length, 0),
    newMisses: taskDays.reduce((sum, day) => sum + day.newMisses.length, 0),
  };
  const insights = [
    taskDays.reduce((best, day) => day.done.length + day.didMyBest.length + day.complete.length > (best?.count ?? 0) ? { count: day.done.length + day.didMyBest.length + day.complete.length, dateKey: day.dateKey } : best, null as { count: number; dateKey: string } | null),
    taskDays.reduce((best, day) => day.newMisses.length > (best?.count ?? 0) ? { count: day.newMisses.length, dateKey: day.dateKey } : best, null as { count: number; dateKey: string } | null),
  ].flatMap((entry, index) => entry ? [index === 0 ? `Best Task completion day: ${entry.dateKey} (${entry.count} handled outcomes).` : `Highest new-miss day: ${entry.dateKey} (${entry.count} new misses).`] : []);

  return {
    achievements: [],
    dateRange: { endDateKey: source.endDateKey, startDateKey: source.startDateKey },
    days: [...daysByDate.values()],
    focus: {
      byCategorySeconds,
      days: [...focusDaysByDate.values()],
      sessionCount: source.focusSessions.filter((session) => daysByDate.has(session.session_date)).length,
      totalSeconds: [...focusDaysByDate.values()].reduce((sum, day) => sum + day.totalSeconds, 0),
    },
    healthGoals: {
      calorieGoal: source.profile?.calorie_goal ?? null,
      carbsGoalG: source.profile?.carbs_goal_grams ?? null,
      fatGoalG: source.profile?.fat_goal_grams ?? null,
      preferredWeightUnit: source.profile?.preferred_weight_unit ?? "lb",
      proteinGoalG: source.profile?.protein_goal_grams ?? null,
      sleepGoalMinutes: source.profile?.sleep_goal_minutes ?? null,
      waterGoalMl: source.profile?.water_goal_ml ?? null,
    },
    insights,
    onTime: { available: false, limitation: "Historical On-Time sessions are not persisted; the current On-Time plan is not historical evidence." },
    paths: { available: false, limitation: "No persisted PATHS history/read model is available in this release, so progress is not synthesized." },
    records: source.records.filter((record) => daysByDate.has(record.credited_date)).map((record) => ({
      creditedDate: record.credited_date,
      eventKind: record.event_kind,
      metricKey: record.metric_key,
      scopeId: record.scope_id,
      scopeLabel: record.scope_kind === "global" ? "Global" : record.title_snapshot?.trim() || "Task",
      unit: record.unit,
      value: record.value,
    })),
    tasks: { days: taskDays, totals: taskTotals },
    warnings: [...new Set(source.warnings ?? [])].sort(),
    weightEntries: weightEntries.map((entry) => ({ dateKey: entry.entry_date, weightKg: entry.weight_kg })),
  };
}

export function createEmptyUnifiedReportReadModel(startDateKey: string, endDateKey: string): UnifiedReportReadModel {
  return buildUnifiedReportReadModel({
    checkIns: [],
    endDateKey,
    focusCategories: [],
    focusSessions: [],
    history: [],
    meals: [],
    metrics: [],
    records: [],
    signals: [],
    signalOccurrences: [],
    signalValues: [],
    startDateKey,
    symptomEntries: [],
    symptoms: [],
    tasks: [],
    todayDateKey: endDateKey,
    water: [],
    weight: [],
    workouts: [],
    profile: null,
  });
}

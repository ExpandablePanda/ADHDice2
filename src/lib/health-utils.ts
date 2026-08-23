"use client";

import type {
  HealthAchievementAward,
  HealthCheckIn,
  HealthMealEntry,
  HealthMetricEntry,
  HealthProfile,
  Task,
  HealthWeightEntry,
} from "@/lib/database.types";
import { isSleepCategory } from "@/lib/focus-goals";
import { formatHealthFoodQuantityUnit } from "@/lib/health-library";
import type { FocusCategory, HistoricalFocusSession } from "@/lib/types";

export type HealthTab = "Today" | "Food" | "Water" | "Fitness" | "Journal" | "Weight" | "Sleep" | "Insights" | "Awards";
export type HealthMealSlot = HealthMealEntry["meal_slot"];
export type WeightUnit = HealthProfile["preferred_weight_unit"];
export type HealthAchievementCode = HealthAchievementAward["achievement_code"];
export type HealthReminderTemplateKey = "daily_check_in" | "meal_log" | "weigh_in" | "movement_intention";
export type HealthSleepKind = "CPAP Sleep" | "CPAP Nap" | "Sleep" | "Nap";

export const HEALTH_TABS: HealthTab[] = ["Today", "Food", "Water", "Fitness", "Journal", "Weight", "Sleep", "Insights", "Awards"];
export const HEALTH_MEAL_SLOTS: HealthMealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
export const HEALTH_SLEEP_KINDS: readonly HealthSleepKind[] = ["CPAP Sleep", "CPAP Nap", "Sleep", "Nap"];
export const HEALTH_MOOD_OPTIONS = [1, 2, 3, 4, 5] as const;
export const HEALTH_SYMPTOM_TAGS = [
  "Calm",
  "Stressed",
  "Headache",
  "Low appetite",
  "Good appetite",
  "Brain fog",
  "Sore",
  "Rested",
  "Wired",
  "Tired",
] as const;
export const HEALTH_MOVEMENT_METRIC_TYPES = ["steps", "active_energy_kcal", "exercise_minutes"] as const;

export type HealthAchievementDefinition = {
  code: HealthAchievementCode;
  description: string;
  points: number;
  title: string;
  tokens: number;
  xp: number;
};

export type HealthReminderTemplate = {
  description: string;
  estimatedMinutes: number | null;
  key: HealthReminderTemplateKey;
  notes: string;
  repeatDayOfMonth: number | null;
  repeatDaysOfWeek: number[];
  repeatFrequency: Task["repeat_frequency"];
  repeatInterval: number;
  tags: string[];
  title: string;
};

export const HEALTH_ACHIEVEMENTS: HealthAchievementDefinition[] = [
  {
    code: "first_check_in",
    description: "Finish your first daily health check-in.",
    points: 5,
    title: "First Check-In",
    tokens: 0,
    xp: 10,
  },
  {
    code: "seven_gentle_days",
    description: "Log health check-ins on 7 different days.",
    points: 15,
    title: "Seven Gentle Days",
    tokens: 0,
    xp: 25,
  },
  {
    code: "nourishment_notes",
    description: "Record meals on 7 different days.",
    points: 15,
    title: "Nourishment Notes",
    tokens: 0,
    xp: 25,
  },
  {
    code: "scale_awareness",
    description: "Record weigh-ins on 3 different days.",
    points: 5,
    title: "Scale Awareness",
    tokens: 0,
    xp: 10,
  },
  {
    code: "connected_care",
    description: "Import Apple Health metrics for the first time.",
    points: 10,
    title: "Connected Care",
    tokens: 0,
    xp: 20,
  },
  {
    code: "rest_noticed",
    description: "Track sleep data on 7 imported days.",
    points: 10,
    title: "Rest Noticed",
    tokens: 0,
    xp: 20,
  },
  {
    code: "motion_noticed",
    description: "Track movement data on 7 imported days.",
    points: 10,
    title: "Motion Noticed",
    tokens: 0,
    xp: 20,
  },
  {
    code: "care_week",
    description: "Build a balanced 5-day week of care tracking.",
    points: 20,
    title: "Care Week",
    tokens: 1,
    xp: 30,
  },
  {
    code: "care_month",
    description: "Build a balanced 20-day month of care tracking.",
    points: 50,
    title: "Care Month",
    tokens: 2,
    xp: 80,
  },
];

export function buildHealthReminderTemplate(
  key: HealthReminderTemplateKey,
  anchorDate = todayHealthDate(),
): HealthReminderTemplate {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  const weekday = anchor.getDay();
  const dayOfMonth = anchor.getDate();

  switch (key) {
    case "daily_check_in":
      return {
        description: "Open a quick reflection loop each day.",
        estimatedMinutes: 5,
        key,
        notes: "Take a quick health check-in: mood, energy, signals, and a few words about what would help next.",
        repeatDayOfMonth: null,
        repeatDaysOfWeek: [],
        repeatFrequency: "daily",
        repeatInterval: 1,
        tags: ["health", "check-in"],
        title: "Daily health check-in",
      };
    case "meal_log":
      return {
        description: "Keep nourishment logging easy and visible.",
        estimatedMinutes: 10,
        key,
        notes: "Log meals or snacks in Health so the daily nutrition picture stays grounded.",
        repeatDayOfMonth: null,
        repeatDaysOfWeek: [],
        repeatFrequency: "daily",
        repeatInterval: 1,
        tags: ["health", "nutrition"],
        title: "Log meals in Health",
      };
    case "weigh_in":
      return {
        description: "Set a gentle weekly weigh-in reminder.",
        estimatedMinutes: 5,
        key,
        notes: "Record a weigh-in when it feels useful. The goal is trend awareness, not pressure.",
        repeatDayOfMonth: null,
        repeatDaysOfWeek: [weekday],
        repeatFrequency: "weekly",
        repeatInterval: 1,
        tags: ["health", "weight"],
        title: "Weekly weigh-in",
      };
    case "movement_intention":
      return {
        description: "Nudge yourself toward a small daily movement plan.",
        estimatedMinutes: 10,
        key,
        notes: "Pick one realistic movement intention for today and log it if you follow through.",
        repeatDayOfMonth: dayOfMonth,
        repeatDaysOfWeek: [],
        repeatFrequency: "daily",
        repeatInterval: 1,
        tags: ["health", "movement"],
        title: "Movement intention",
      };
  }
}

export const HEALTH_REMINDER_TEMPLATES: HealthReminderTemplate[] = [
  buildHealthReminderTemplate("daily_check_in", "2026-01-05"),
  buildHealthReminderTemplate("meal_log", "2026-01-05"),
  buildHealthReminderTemplate("weigh_in", "2026-01-05"),
  buildHealthReminderTemplate("movement_intention", "2026-01-05"),
];

export const DEFAULT_HEALTH_PROFILE: Omit<HealthProfile, "created_at" | "updated_at"> = {
  calorie_goal: 2200,
  carbs_goal_grams: 250,
  movement_goal: 8000,
  movement_goal_calories: 500,
  movement_goal_minutes: 30,
  preferred_weight_unit: "lb",
  protein_goal_grams: 140,
  sleep_goal_minutes: 480,
  target_weight_kg: null,
  user_id: "",
  fat_goal_grams: 75,
};

export function buildDefaultHealthProfile(userId: string): HealthProfile {
  const now = new Date().toISOString();
  return {
    ...DEFAULT_HEALTH_PROFILE,
    created_at: now,
    updated_at: now,
    user_id: userId,
  };
}

export function todayHealthDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCurrentHealthDateTimeInputs(now = new Date()) {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

export function normalizeHealthSleepKind(value: string | null | undefined): HealthSleepKind {
  return HEALTH_SLEEP_KINDS.includes(value as HealthSleepKind) ? value as HealthSleepKind : "Sleep";
}

function normalizeRecognizedHealthSleepKind(value: string | null | undefined): HealthSleepKind | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toLowerCase();
  switch (normalized) {
    case "cpap sleep":
      return "CPAP Sleep";
    case "cpap nap":
      return "CPAP Nap";
    case "sleep":
      return "Sleep";
    case "nap":
      return "Nap";
    default:
      return null;
  }
}

export function resolveHealthSleepKind(
  session: Pick<HistoricalFocusSession, "focusSubtype" | "title">,
  linkedCategory?: Pick<FocusCategory, "title"> | null,
): HealthSleepKind {
  const focusSubtype = normalizeRecognizedHealthSleepKind(session.focusSubtype);
  if (focusSubtype && focusSubtype !== "Sleep") {
    return focusSubtype;
  }

  const sessionTitle = normalizeRecognizedHealthSleepKind(session.title);
  if (sessionTitle) {
    return sessionTitle;
  }

  return focusSubtype
    ?? normalizeRecognizedHealthSleepKind(linkedCategory?.title)
    ?? "Sleep";
}

export function parseHealthSleepDuration(hours: string, minutes: string) {
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);
  if (
    !Number.isFinite(parsedHours)
    || !Number.isFinite(parsedMinutes)
    || !Number.isInteger(parsedHours)
    || !Number.isInteger(parsedMinutes)
    || parsedHours < 0
    || parsedMinutes < 0
    || parsedMinutes > 59
  ) {
    return null;
  }
  const durationSeconds = (parsedHours * 60 + parsedMinutes) * 60;
  return durationSeconds > 0 ? durationSeconds : null;
}

export function buildHealthSleepTimestamps({ date, time, durationSeconds }: { date: string; time: string; durationSeconds: number }) {
  const startedAt = buildHealthMealLoggedAt(date, time);
  if (!startedAt || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }
  const endedAtMs = Date.parse(startedAt) + durationSeconds * 1000;
  if (!Number.isFinite(endedAtMs)) {
    return null;
  }
  return { startedAt, endedAt: new Date(endedAtMs).toISOString() };
}

export function getHealthSleepStartTimestamp(session: Pick<HistoricalFocusSession, "startedAt" | "endedAt" | "durationSeconds">) {
  if (session.startedAt && Number.isFinite(Date.parse(session.startedAt))) {
    return session.startedAt;
  }
  if (session.endedAt && Number.isFinite(Date.parse(session.endedAt)) && Number.isFinite(session.durationSeconds) && session.durationSeconds > 0) {
    return new Date(Date.parse(session.endedAt) - session.durationSeconds * 1000).toISOString();
  }
  return null;
}

export function sortHealthSleepSessionsByStart(sessions: HistoricalFocusSession[]) {
  return sessions
    .map((session, index) => ({
      index,
      session,
      startTime: getHealthSleepStartTimestamp(session),
    }))
    .sort((left, right) => {
      const leftTime = left.startTime ? Date.parse(left.startTime) : Number.NaN;
      const rightTime = right.startTime ? Date.parse(right.startTime) : Number.NaN;
      const leftHasTime = Number.isFinite(leftTime);
      const rightHasTime = Number.isFinite(rightTime);

      if (leftHasTime && rightHasTime && leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      if (leftHasTime !== rightHasTime) {
        return leftHasTime ? -1 : 1;
      }
      return left.index - right.index;
    })
    .map(({ session }) => session);
}

export function getHealthSleepElapsedSeconds(session: { accumulatedSeconds: number; isRunning: boolean; startTime: number | null }, nowMs = Date.now()) {
  const runningSeconds = session.isRunning && session.startTime !== null
    ? Math.max(0, Math.floor((nowMs - session.startTime) / 1000))
    : 0;
  return Math.max(0, Math.floor(session.accumulatedSeconds)) + runningSeconds;
}

export function buildHealthMealLoggedAt(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const localDate = new Date(`${date}T${time}:00`);
  if (Number.isNaN(localDate.getTime())) {
    return null;
  }
  const [year, month, day] = date.split("-").map((part) => Number.parseInt(part, 10));
  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
  if (
    localDate.getFullYear() !== year
    || localDate.getMonth() + 1 !== month
    || localDate.getDate() !== day
    || localDate.getHours() !== hours
    || localDate.getMinutes() !== minutes
  ) {
    return null;
  }
  return localDate.toISOString();
}

export function isHealthMealTimestampFuture(date: string, time: string, now = new Date()) {
  const loggedAt = buildHealthMealLoggedAt(date, time);
  return loggedAt === null || Date.parse(loggedAt) > now.getTime();
}

export function shiftHealthDate(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part ?? "", 10));
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export function formatHealthDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function getMealSlotLabel(slot: HealthMealSlot) {
  switch (slot) {
    case "breakfast":
      return "Breakfast";
    case "lunch":
      return "Lunch";
    case "dinner":
      return "Dinner";
    case "snack":
      return "Snack";
  }
}

export function kilogramsToDisplayValue(weightKg: number, unit: WeightUnit) {
  return unit === "kg" ? weightKg : weightKg * 2.2046226218;
}

export function displayWeightToKilograms(value: number, unit: WeightUnit) {
  return unit === "kg" ? value : value / 2.2046226218;
}

export function formatEditableWeight(weightKg: number | null, unit: WeightUnit) {
  if (weightKg === null || !Number.isFinite(weightKg)) return "";
  return String(Number(kilogramsToDisplayValue(weightKg, unit).toFixed(1)));
}

export function formatMealLoggedTime(value: string, locale?: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(timestamp);
}

export function formatHealthNutritionNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return String(Number(value.toFixed(2)));
}

export function formatHealthMealSummary(entry: HealthMealEntry, locale?: string) {
  const loggedQuantity = typeof entry.consumed_quantity === "number"
    && Number.isFinite(entry.consumed_quantity)
    && entry.consumed_quantity > 0
    && entry.consumed_unit?.trim()
    ? formatHealthFoodQuantityUnit(entry.consumed_quantity, entry.consumed_unit)
    : null;
  const serving = loggedQuantity ?? (entry.serving_label?.trim() || "No serving");
  const loggedTime = formatMealLoggedTime(entry.logged_at, locale);
  const parts = [
    getMealSlotLabel(entry.meal_slot),
    serving,
    `${formatHealthNutritionNumber(entry.calories)} kcal`,
    `Protein ${formatHealthNutritionNumber(mealNutritionValue(entry, "protein_g"))}g`,
    `Carbs ${formatHealthNutritionNumber(mealNutritionValue(entry, "carbs_g"))}g`,
    `Fat ${formatHealthNutritionNumber(mealNutritionValue(entry, "fat_g"))}g`,
    loggedTime,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" / ");
}

export function formatWeight(weightKg: number | null, unit: WeightUnit) {
  if (weightKg === null || !Number.isFinite(weightKg)) {
    return `No ${unit === "kg" ? "kg" : "lb"} target`;
  }

  return `${kilogramsToDisplayValue(weightKg, unit).toFixed(1)} ${unit}`;
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function sumMealNutritionForDate(entries: HealthMealEntry[], entryDate: string) {
  return entries.reduce(
    (accumulator, entry) => {
      if (entry.entry_date !== entryDate) {
        return accumulator;
      }

      const snapshot = entry.nutrition_snapshot;
      accumulator.calories += finiteOrFallback(snapshot?.calories, entry.calories);
      accumulator.protein += finiteOrFallback(snapshot?.protein_g, entry.protein_g ?? 0);
      accumulator.carbs += finiteOrFallback(snapshot?.carbs_g, entry.carbs_g ?? 0);
      accumulator.fat += finiteOrFallback(snapshot?.fat_g, entry.fat_g ?? 0);
      return accumulator;
    },
    { calories: 0, carbs: 0, fat: 0, protein: 0 },
  );
}

function finiteOrFallback(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mealNutritionValue(entry: HealthMealEntry, key: "calories" | "protein_g" | "carbs_g" | "fat_g") {
  const snapshotValue = entry.nutrition_snapshot?.[key];
  if (typeof snapshotValue === "number" && Number.isFinite(snapshotValue)) {
    return snapshotValue;
  }
  return entry[key] ?? 0;
}

export function sumMetricValueForDate(
  entries: HealthMetricEntry[],
  entryDate: string,
  metricTypes: readonly HealthMetricEntry["metric_type"][],
) {
  return entries.reduce((total, entry) => {
    if (entry.metric_date !== entryDate || !metricTypes.includes(entry.metric_type)) {
      return total;
    }
    return total + entry.metric_value;
  }, 0);
}

export type HealthSleepDayTotal = {
  date: string;
  focusMinutes: number;
  importedMinutes: number;
  totalMinutes: number;
};

export type HealthDailySleepPoint = HealthSleepDayTotal & {
  label: string;
};

export function formatHealthSleepDuration(minutes: number) {
  const roundedMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function getSleepFocusSessions(
  focusHistory: HistoricalFocusSession[],
  focusCategories: FocusCategory[],
) {
  const categoryById = new Map(focusCategories.map((category) => [category.id, category]));

  return focusHistory.filter((session) => {
    const category = session.categoryId ? categoryById.get(session.categoryId) : null;
    return isSleepCategory(category ?? session);
  });
}

export function getHealthSleepDayTotal({
  date,
  focusCategories,
  focusHistory,
  metricEntries,
}: {
  date: string;
  focusCategories: FocusCategory[];
  focusHistory: HistoricalFocusSession[];
  metricEntries: HealthMetricEntry[];
}): HealthSleepDayTotal {
  const importedMinutes = sumMetricValueForDate(metricEntries, date, ["sleep_minutes"]);
  const focusMinutes = getSleepFocusSessions(focusHistory, focusCategories)
    .filter((session) => session.date === date)
    .reduce((total, session) => total + session.durationSeconds / 60, 0);

  return {
    date,
    focusMinutes,
    importedMinutes,
    totalMinutes: importedMinutes + focusMinutes,
  };
}

export function buildHealthDailySleepSeries({
  endDate,
  focusCategories,
  focusHistory,
  metricEntries,
  days = 7,
}: {
  endDate: string;
  focusCategories: FocusCategory[];
  focusHistory: HistoricalFocusSession[];
  metricEntries: HealthMetricEntry[];
  days?: number;
}) {
  const pointCount = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 7;
  return Array.from({ length: pointCount }, (_, index) => {
    const date = shiftHealthDate(endDate, index - pointCount + 1);
    const total = getHealthSleepDayTotal({ date, focusCategories, focusHistory, metricEntries });
    return {
      ...total,
      label: formatHealthDateLabel(date),
    } satisfies HealthDailySleepPoint;
  });
}

export function getLatestWeight(weights: HealthWeightEntry[]) {
  return [...weights].sort((left, right) => right.entry_date.localeCompare(left.entry_date) || right.logged_at.localeCompare(left.logged_at))[0] ?? null;
}

export function getWeightTrend(weights: HealthWeightEntry[], days: number) {
  const today = todayHealthDate();
  const floor = shiftHealthDate(today, -(days - 1));
  return [...weights]
    .filter((entry) => entry.entry_date >= floor && entry.entry_date <= today)
    .sort((left, right) => left.entry_date.localeCompare(right.entry_date) || left.logged_at.localeCompare(right.logged_at));
}

export type WeightGoalForecast = {
  currentWeightKg: number | null;
  estimatedDate: string | null;
  sampleCount: number;
  spanDays: number;
  status: "insufficient" | "reached" | "away" | "forecast";
  targetWeightKg: number | null;
  weeklyChangeKg: number | null;
};

export function buildWeightGoalForecast(
  weights: HealthWeightEntry[],
  targetWeightKg: number | null,
  asOfDate = todayHealthDate(),
): WeightGoalForecast {
  const floor = shiftHealthDate(asOfDate, -29);
  const latestByDate = new Map<string, HealthWeightEntry>();
  for (const entry of weights) {
    if (
      entry.entry_date < floor
      || entry.entry_date > asOfDate
      || !Number.isFinite(Date.parse(`${entry.entry_date}T12:00:00`))
      || !Number.isFinite(entry.weight_kg)
    ) {
      continue;
    }
    const current = latestByDate.get(entry.entry_date);
    if (!current || entry.logged_at > current.logged_at) latestByDate.set(entry.entry_date, entry);
  }
  const samples = [...latestByDate.values()].sort((left, right) => left.entry_date.localeCompare(right.entry_date));
  const latest = samples.at(-1) ?? null;
  const firstDateMs = samples[0] ? Date.parse(`${samples[0].entry_date}T12:00:00`) : Number.NaN;
  const lastDateMs = latest ? Date.parse(`${latest.entry_date}T12:00:00`) : Number.NaN;
  const spanDays = Number.isFinite(firstDateMs) && Number.isFinite(lastDateMs)
    ? Math.round((lastDateMs - firstDateMs) / 86_400_000)
    : 0;
  const base = {
    currentWeightKg: latest?.weight_kg ?? null,
    estimatedDate: null,
    sampleCount: samples.length,
    spanDays,
    targetWeightKg,
    weeklyChangeKg: null,
  };
  if (!latest || targetWeightKg === null || !Number.isFinite(targetWeightKg) || samples.length < 3 || spanDays < 7) {
    return { ...base, status: "insufficient" };
  }
  if (Math.abs(latest.weight_kg - targetWeightKg) <= 0.05) {
    return { ...base, status: "reached", weeklyChangeKg: 0 };
  }

  const points = samples.map((entry) => ({
    x: (Date.parse(`${entry.entry_date}T12:00:00`) - firstDateMs) / 86_400_000,
    y: entry.weight_kg,
  }));
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const slope = denominator > 0
    ? points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator
    : 0;
  const weeklyChangeKg = slope * 7;
  const distance = targetWeightKg - latest.weight_kg;
  if (!Number.isFinite(slope) || Math.abs(slope) < 0.0001 || Math.sign(slope) !== Math.sign(distance)) {
    return { ...base, status: "away", weeklyChangeKg };
  }
  const daysToTarget = distance / slope;
  if (!Number.isFinite(daysToTarget) || daysToTarget <= 0 || daysToTarget > 3650) {
    return { ...base, status: "away", weeklyChangeKg };
  }
  return {
    ...base,
    estimatedDate: shiftHealthDate(latest.entry_date, Math.ceil(daysToTarget)),
    status: "forecast",
    weeklyChangeKg,
  };
}

type DailyCareFacts = {
  hasCheckIn: boolean;
  hasMeal: boolean;
  hasMovement: boolean;
  hasSleep: boolean;
  hasWeight: boolean;
};

function buildDailyFacts(
  checkIns: HealthCheckIn[],
  mealEntries: HealthMealEntry[],
  metricEntries: HealthMetricEntry[],
  weightEntries: HealthWeightEntry[],
) {
  const byDate = new Map<string, DailyCareFacts>();

  function ensure(dateKey: string) {
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, {
        hasCheckIn: false,
        hasMeal: false,
        hasMovement: false,
        hasSleep: false,
        hasWeight: false,
      });
    }
    return byDate.get(dateKey)!;
  }

  for (const entry of checkIns) {
    ensure(entry.entry_date).hasCheckIn = true;
  }

  for (const entry of mealEntries) {
    ensure(entry.entry_date).hasMeal = true;
  }

  for (const entry of metricEntries) {
    const facts = ensure(entry.metric_date);
    if (entry.metric_type === "sleep_minutes") {
      facts.hasSleep = true;
    }
    if (HEALTH_MOVEMENT_METRIC_TYPES.includes(entry.metric_type as (typeof HEALTH_MOVEMENT_METRIC_TYPES)[number])) {
      facts.hasMovement = true;
    }
  }

  for (const entry of weightEntries) {
    ensure(entry.entry_date).hasWeight = true;
  }

  return byDate;
}

function countDistinctDates(values: string[]) {
  return new Set(values).size;
}

function hasBalancedWindow(factsByDate: Map<string, DailyCareFacts>, windowSize: number, requiredDays: number) {
  const dates = Array.from(factsByDate.keys()).sort();
  if (dates.length === 0) {
    return false;
  }

  for (const anchor of dates) {
    const windowEnd = shiftHealthDate(anchor, windowSize - 1);
    let total = 0;
    for (const [dateKey, facts] of factsByDate.entries()) {
      if (dateKey < anchor || dateKey > windowEnd) {
        continue;
      }
      if (facts.hasCheckIn && facts.hasMeal && (facts.hasWeight || facts.hasMovement || facts.hasSleep)) {
        total += 1;
      }
    }
    if (total >= requiredDays) {
      return true;
    }
  }

  return false;
}

export function getEligibleHealthAchievements({
  awards,
  checkIns,
  mealEntries,
  metricEntries,
  weightEntries,
}: {
  awards: HealthAchievementAward[];
  checkIns: HealthCheckIn[];
  mealEntries: HealthMealEntry[];
  metricEntries: HealthMetricEntry[];
  weightEntries: HealthWeightEntry[];
}) {
  const awardedCodes = new Set(awards.map((award) => award.achievement_code));
  const eligible: HealthAchievementDefinition[] = [];
  const factsByDate = buildDailyFacts(checkIns, mealEntries, metricEntries, weightEntries);
  const sleepDates = new Set(metricEntries.filter((entry) => entry.metric_type === "sleep_minutes").map((entry) => entry.metric_date));
  const movementDates = new Set(
    metricEntries
      .filter((entry) => HEALTH_MOVEMENT_METRIC_TYPES.includes(entry.metric_type as (typeof HEALTH_MOVEMENT_METRIC_TYPES)[number]))
      .map((entry) => entry.metric_date),
  );

  for (const achievement of HEALTH_ACHIEVEMENTS) {
    if (awardedCodes.has(achievement.code)) {
      continue;
    }

    switch (achievement.code) {
      case "first_check_in":
        if (checkIns.length > 0) eligible.push(achievement);
        break;
      case "seven_gentle_days":
        if (countDistinctDates(checkIns.map((entry) => entry.entry_date)) >= 7) eligible.push(achievement);
        break;
      case "nourishment_notes":
        if (countDistinctDates(mealEntries.map((entry) => entry.entry_date)) >= 7) eligible.push(achievement);
        break;
      case "scale_awareness":
        if (countDistinctDates(weightEntries.map((entry) => entry.entry_date)) >= 3) eligible.push(achievement);
        break;
      case "connected_care":
        if (metricEntries.length > 0) eligible.push(achievement);
        break;
      case "rest_noticed":
        if (sleepDates.size >= 7) eligible.push(achievement);
        break;
      case "motion_noticed":
        if (movementDates.size >= 7) eligible.push(achievement);
        break;
      case "care_week":
        if (hasBalancedWindow(factsByDate, 7, 5)) eligible.push(achievement);
        break;
      case "care_month":
        if (hasBalancedWindow(factsByDate, 30, 20)) eligible.push(achievement);
        break;
    }
  }

  return eligible;
}

export function buildHealthCoachMessage({
  checkIns,
  metricEntries,
  mealEntries,
  profile,
  weights,
}: {
  checkIns: HealthCheckIn[];
  metricEntries: HealthMetricEntry[];
  mealEntries: HealthMealEntry[];
  profile: HealthProfile;
  weights: HealthWeightEntry[];
}) {
  const today = todayHealthDate();
  const todayNutrition = sumMealNutritionForDate(mealEntries, today);
  const todayMovement = sumMetricValueForDate(metricEntries, today, HEALTH_MOVEMENT_METRIC_TYPES);
  const todaySleep = sumMetricValueForDate(metricEntries, today, ["sleep_minutes"]);
  const hasCheckInToday = checkIns.some((entry) => entry.entry_date === today);

  if (!hasCheckInToday) {
    return "A quick check-in would give the rest of today’s health picture more context.";
  }
  if (todayNutrition.calories === 0) {
    return "You’ve got the reflection piece in. Logging the first meal will make the day feel grounded.";
  }
  if (todayMovement === 0 && todaySleep === 0) {
    return "Today is tracking well so far. Imported movement or sleep data would round out the picture.";
  }
  if (profile.calorie_goal && todayNutrition.calories >= profile.calorie_goal) {
    return "Nutrition is fully logged against today’s goal. A short reflection or weigh-in could complete the ledger.";
  }
  if (weights.length === 0) {
    return "Meals and check-ins are moving. A weigh-in will unlock trend context when you’re ready.";
  }
  return "Steady care beats perfect care. Today already has enough signal to learn from.";
}

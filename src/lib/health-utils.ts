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

export type HealthTab = "Today" | "Food" | "Water" | "Journal" | "Weight" | "Insights" | "Awards";
export type HealthMealSlot = HealthMealEntry["meal_slot"];
export type WeightUnit = HealthProfile["preferred_weight_unit"];
export type HealthAchievementCode = HealthAchievementAward["achievement_code"];
export type HealthReminderTemplateKey = "daily_check_in" | "meal_log" | "weigh_in" | "movement_intention";

export const HEALTH_TABS: HealthTab[] = ["Today", "Food", "Water", "Journal", "Weight", "Insights", "Awards"];
export const HEALTH_MEAL_SLOTS: HealthMealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
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

      accumulator.calories += entry.calories;
      accumulator.protein += entry.protein_g ?? 0;
      accumulator.carbs += entry.carbs_g ?? 0;
      accumulator.fat += entry.fat_g ?? 0;
      return accumulator;
    },
    { calories: 0, carbs: 0, fat: 0, protein: 0 },
  );
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

"use client";

import type { HealthMetricEntry, HealthWorkout, HealthWorkoutInsert } from "@/lib/database.types";
import { buildHealthMealLoggedAt, sumMetricValueForDate, todayHealthDate } from "@/lib/health-utils";
import {
  HEALTH_WORKOUT_OPTION_MAX_LENGTH,
} from "@/lib/health-workout-options";

export { HEALTH_WORKOUT_OPTION_MAX_LENGTH, HEALTH_WORKOUT_TYPES, moveFitnessOption } from "@/lib/health-workout-options";

export const HEALTH_WORKOUT_TITLE_MAX_LENGTH = 120;

export type HealthWorkoutTitleOptionResult = {
  error: string | null;
  value: string[] | null;
};

export type HealthWorkoutTypeOptionResult = HealthWorkoutTitleOptionResult;

export type HealthWorkoutFormInput = {
  activeCalories: string;
  date: string;
  durationMinutes: string;
  notes: string;
  startTime: string;
  title: string;
  workoutType: string;
};

export type HealthWorkoutFormResult = {
  error: string | null;
  value: Omit<HealthWorkoutInsert, "user_id"> | null;
};

export type HealthWorkoutEditableInput = Pick<
  HealthWorkout,
  "workout_date" | "started_at" | "ended_at" | "duration_seconds" | "title" | "workout_type" | "active_calories" | "notes"
>;

export type HealthWorkoutWeeklySummary = {
  endDate: string;
  startDate: string;
  workoutActiveCalories: number;
  workoutMinutes: number;
  workouts: number;
};

export function addHealthWorkoutTitleOption(
  options: readonly string[],
  rawTitle: string,
): HealthWorkoutTitleOptionResult {
  const title = rawTitle.trim();
  if (!title) {
    return { error: "Enter a saved workout title.", value: null };
  }
  if (title.length > HEALTH_WORKOUT_TITLE_MAX_LENGTH) {
    return {
      error: `Saved workout titles must be ${HEALTH_WORKOUT_TITLE_MAX_LENGTH} characters or fewer.`,
      value: null,
    };
  }
  if (options.some((option) => option.trim().toLocaleLowerCase() === title.toLocaleLowerCase())) {
    return { error: "That saved workout title already exists.", value: null };
  }
  return { error: null, value: [...options, title] };
}

export function addHealthWorkoutTypeOption(
  options: readonly string[],
  rawType: string,
): HealthWorkoutTypeOptionResult {
  const type = rawType.trim();
  if (!type) {
    return { error: "Enter a workout type.", value: null };
  }
  if (type.length > HEALTH_WORKOUT_OPTION_MAX_LENGTH) {
    return {
      error: `Workout types must be ${HEALTH_WORKOUT_OPTION_MAX_LENGTH} characters or fewer.`,
      value: null,
    };
  }
  if (options.some((option) => option.trim().toLocaleLowerCase() === type.toLocaleLowerCase())) {
    return { error: "That workout type already exists.", value: null };
  }
  return { error: null, value: [...options, type] };
}

function renameHealthWorkoutOption(
  options: readonly string[],
  currentValue: string,
  rawValue: string,
  label: "workout type" | "saved workout title",
): HealthWorkoutTypeOptionResult {
  const nextValue = rawValue.trim();
  if (!nextValue) {
    return { error: `Enter a ${label}.`, value: null };
  }
  if (nextValue.length > HEALTH_WORKOUT_OPTION_MAX_LENGTH) {
    return {
      error: `${label === "workout type" ? "Workout types" : "Saved workout titles"} must be ${HEALTH_WORKOUT_OPTION_MAX_LENGTH} characters or fewer.`,
      value: null,
    };
  }
  if (options.some((option) => option !== currentValue && option.trim().toLocaleLowerCase() === nextValue.toLocaleLowerCase())) {
    return { error: `That ${label} already exists.`, value: null };
  }
  return {
    error: null,
    value: options.map((option) => option === currentValue ? nextValue : option),
  };
}

export function renameHealthWorkoutTypeOption(options: readonly string[], currentValue: string, rawValue: string) {
  return renameHealthWorkoutOption(options, currentValue, rawValue, "workout type");
}

export function renameHealthWorkoutTitleOption(options: readonly string[], currentValue: string, rawValue: string) {
  return renameHealthWorkoutOption(options, currentValue, rawValue, "saved workout title");
}

export function removeHealthWorkoutTypeOption(options: readonly string[], typeToRemove: string): HealthWorkoutTypeOptionResult {
  if (options.length <= 1) {
    return { error: "Keep at least one workout type.", value: null };
  }
  return { error: null, value: options.filter((type) => type !== typeToRemove) };
}

export function removeHealthWorkoutTitleOption(options: readonly string[], titleToRemove: string) {
  return options.filter((title) => title !== titleToRemove);
}

export function isValidHealthDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }
  const date = new Date(`${dateKey}T12:00:00`);
  const [year, month, day] = dateKey.split("-").map(Number);
  return Number.isFinite(date.getTime())
    && date.getFullYear() === year
    && date.getMonth() + 1 === month
    && date.getDate() === day;
}

export function isHealthWorkoutDateFuture(dateKey: string, asOfDate = todayHealthDate()) {
  return !isValidHealthDateKey(dateKey) || dateKey > asOfDate;
}

export function buildHealthWorkoutFormPayload(
  input: HealthWorkoutFormInput,
  asOfDate = todayHealthDate(),
): HealthWorkoutFormResult {
  const workoutType = input.workoutType.trim();
  if (!workoutType) {
    return { error: "Choose a workout type.", value: null };
  }
  if (isHealthWorkoutDateFuture(input.date, asOfDate)) {
    return { error: "Future workout dates cannot be saved.", value: null };
  }

  const durationMinutes = Number(input.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { error: "Workout duration must be greater than zero.", value: null };
  }
  const durationSeconds = Math.round(durationMinutes * 60);
  if (durationSeconds <= 0) {
    return { error: "Workout duration must be greater than zero.", value: null };
  }

  const activeCaloriesText = input.activeCalories.trim();
  const activeCalories = activeCaloriesText.length === 0 ? null : Number(activeCaloriesText);
  if (activeCalories !== null && (!Number.isFinite(activeCalories) || activeCalories < 0)) {
    return { error: "Active calories must be zero or greater.", value: null };
  }

  const startTime = input.startTime.trim();
  const startedAt = startTime.length === 0 ? null : buildHealthMealLoggedAt(input.date, startTime);
  if (startTime.length > 0 && startedAt === null) {
    return { error: "Choose a valid workout start time.", value: null };
  }
  const endedAt = startedAt
    ? new Date(Date.parse(startedAt) + durationSeconds * 1000).toISOString()
    : null;

  return {
    error: null,
    value: {
      active_calories: activeCalories,
      duration_seconds: durationSeconds,
      ended_at: endedAt,
      notes: input.notes.trim(),
      source: "manual",
      source_external_id: null,
      started_at: startedAt,
      title: input.title.trim() || workoutType,
      workout_date: input.date,
      workout_type: workoutType,
    },
  };
}

export function validateHealthWorkoutEditableInput(
  input: HealthWorkoutEditableInput,
  asOfDate = todayHealthDate(),
) {
  if (isHealthWorkoutDateFuture(input.workout_date, asOfDate)) {
    return "Future workout dates cannot be saved.";
  }
  if (!Number.isInteger(input.duration_seconds) || input.duration_seconds <= 0) {
    return "Workout duration must be greater than zero.";
  }
  if (!input.workout_type.trim()) {
    return "Choose a workout type.";
  }
  if (!input.title.trim()) {
    return "Workout title cannot be blank.";
  }
  if (input.active_calories !== null && (!Number.isFinite(input.active_calories) || input.active_calories < 0)) {
    return "Active calories must be zero or greater.";
  }
  if (input.started_at !== null && !Number.isFinite(Date.parse(input.started_at))) {
    return "Choose a valid workout start time.";
  }
  if (input.ended_at !== null && !Number.isFinite(Date.parse(input.ended_at))) {
    return "Choose a valid workout end time.";
  }
  return null;
}

export function sortHealthWorkouts(workouts: HealthWorkout[]) {
  return [...workouts].sort((left, right) => {
    const dateOrder = right.workout_date.localeCompare(left.workout_date);
    if (dateOrder !== 0) return dateOrder;

    const rightStartedAt = right.started_at ? Date.parse(right.started_at) : Number.NaN;
    const leftStartedAt = left.started_at ? Date.parse(left.started_at) : Number.NaN;
    if (Number.isFinite(rightStartedAt) && Number.isFinite(leftStartedAt) && rightStartedAt !== leftStartedAt) {
      return rightStartedAt - leftStartedAt;
    }
    if (Number.isFinite(rightStartedAt) !== Number.isFinite(leftStartedAt)) {
      return Number.isFinite(rightStartedAt) ? -1 : 1;
    }
    return right.created_at.localeCompare(left.created_at);
  });
}

export function getHealthWeekBounds(asOfDate = todayHealthDate()) {
  const date = new Date(`${asOfDate}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  const startDate = formatHealthWorkoutDateKey(date);
  date.setDate(date.getDate() + 6);
  return { endDate: formatHealthWorkoutDateKey(date), startDate };
}

export function getHealthWeeklyWorkoutSummary(workouts: HealthWorkout[], asOfDate = todayHealthDate()): HealthWorkoutWeeklySummary {
  const { endDate, startDate } = getHealthWeekBounds(asOfDate);
  const currentWeek = workouts.filter((workout) => workout.workout_date >= startDate && workout.workout_date <= endDate);
  return {
    endDate,
    startDate,
    workoutActiveCalories: currentWeek.reduce((total, workout) => total + (workout.active_calories ?? 0), 0),
    workoutMinutes: currentWeek.reduce((total, workout) => total + workout.duration_seconds / 60, 0),
    workouts: currentWeek.length,
  };
}

export function getHealthDailyMovementMetrics(metricEntries: HealthMetricEntry[], date: string) {
  return {
    activeEnergyKcal: sumMetricValueForDate(metricEntries, date, ["active_energy_kcal"]),
    exerciseMinutes: sumMetricValueForDate(metricEntries, date, ["exercise_minutes"]),
    steps: sumMetricValueForDate(metricEntries, date, ["steps"]),
  };
}

function formatHealthWorkoutDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

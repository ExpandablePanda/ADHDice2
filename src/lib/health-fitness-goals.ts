import type {
  HealthExercise,
  HealthFitnessGoal,
  HealthFitnessGoalLevel,
  HealthFitnessPerformanceMetric,
} from "@/lib/database.types";
import { HEALTH_FITNESS_PERFORMANCE_METRICS } from "@/lib/health-fitness-performance";

export const HEALTH_FITNESS_GOALS_MIGRATION_MESSAGE = "Fitness Goals are unavailable until the 7.11.69 Fitness Goals migration is applied.";

export type HealthFitnessGoalDraft = {
  exercise_id: string;
  metric: HealthFitnessPerformanceMetric;
  title: string;
  target: number;
};

export type HealthFitnessGoalLevelDraft = {
  goal_id: string;
  label: string;
  target: number;
  sort_order: number;
};

function isPositiveInteger(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isInteger(value) && value > 0;
}

export function normalizeHealthFitnessGoalDraft(draft: HealthFitnessGoalDraft): HealthFitnessGoalDraft {
  return { ...draft, title: draft.title.trim() };
}

export function validateHealthFitnessGoalDraft(
  draft: HealthFitnessGoalDraft,
  exercises: readonly Pick<HealthExercise, "id" | "archived_at">[],
  options: { allowArchivedExercise?: boolean } = {},
) {
  if (!draft.exercise_id || !exercises.some((exercise) => exercise.id === draft.exercise_id)) {
    return "Choose a valid Exercise Library exercise for this Goal.";
  }
  if (!options.allowArchivedExercise && exercises.find((exercise) => exercise.id === draft.exercise_id)?.archived_at !== null) {
    return "Choose an active Exercise Library exercise for a new Goal.";
  }
  if (!HEALTH_FITNESS_PERFORMANCE_METRICS.includes(draft.metric)) {
    return "Choose a supported Fitness Goal metric.";
  }
  if (!draft.title.trim()) {
    return "Goal title cannot be blank.";
  }
  if (!isPositiveInteger(draft.target)) {
    return "Goal target must be a positive whole number.";
  }
  return null;
}

export function validateHealthFitnessGoalTargetAgainstLevels(
  goalId: string,
  target: number,
  levels: readonly Pick<HealthFitnessGoalLevel, "goal_id" | "target">[],
) {
  if (levels.some((level) => level.goal_id === goalId && level.target > target)) {
    return "Goal target cannot be lower than an existing Level target.";
  }
  return null;
}

export function normalizeHealthFitnessGoalLevelDraft(draft: HealthFitnessGoalLevelDraft): HealthFitnessGoalLevelDraft {
  return { ...draft, label: draft.label.trim() };
}

export function validateHealthFitnessGoalLevelDraft(
  draft: HealthFitnessGoalLevelDraft,
  goal: Pick<HealthFitnessGoal, "id" | "target"> | null,
  levels: readonly Pick<HealthFitnessGoalLevel, "id" | "goal_id" | "target">[],
  currentLevelId?: string,
) {
  if (!goal || goal.id !== draft.goal_id) {
    return "Choose a valid Fitness Goal for this Level.";
  }
  if (!draft.label.trim()) {
    return "Level label cannot be blank.";
  }
  if (!isPositiveInteger(draft.target)) {
    return "Level target must be a positive whole number.";
  }
  if (draft.target > goal.target) {
    return "Level target cannot exceed the parent Goal target.";
  }
  if (draft.sort_order < 0 || !Number.isInteger(draft.sort_order)) {
    return "Level order must be a nonnegative whole number.";
  }
  if (levels.some((level) => level.goal_id === draft.goal_id && level.target === draft.target && level.id !== currentLevelId)) {
    return "A Goal cannot have duplicate Level targets.";
  }
  return null;
}

export function isMissingHealthFitnessGoalsMigrationError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("does not exist")
    || normalized.includes("schema cache")
    || normalized.includes("pgrst205")
    || normalized.includes("42p01");
}

export function formatHealthFitnessGoalsError(message: string | null | undefined) {
  if (!message) return HEALTH_FITNESS_GOALS_MIGRATION_MESSAGE;
  return isMissingHealthFitnessGoalsMigrationError(message)
    ? HEALTH_FITNESS_GOALS_MIGRATION_MESSAGE
    : message;
}

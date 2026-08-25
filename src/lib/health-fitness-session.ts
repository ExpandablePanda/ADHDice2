import type {
  HealthExercise,
  HealthFitnessMeasurement,
  HealthWorkoutExercise,
  HealthWorkoutSet,
} from "@/lib/database.types";

export const HEALTH_FITNESS_MEASUREMENTS: readonly HealthFitnessMeasurement[] = ["reps", "duration"];

export type HealthWorkoutDraftSet = {
  id?: string;
  durationSeconds: string;
  notes: string;
  reps: string;
};

export type HealthWorkoutExerciseDraft = {
  exerciseId: string;
  exerciseName: string;
  id?: string;
  measurementType: HealthFitnessMeasurement;
  notes: string;
  sets: HealthWorkoutDraftSet[];
};

export type HealthWorkoutStructuredDraft = {
  exercises: HealthWorkoutExerciseDraft[];
};

export function reconcileHealthWorkoutExerciseDraft(
  draft: HealthWorkoutStructuredDraft,
  exerciseIndex: number,
  persistedId: string,
): HealthWorkoutStructuredDraft {
  return {
    exercises: draft.exercises.map((exercise, index) => index === exerciseIndex ? { ...exercise, id: persistedId } : exercise),
  };
}

export function reconcileHealthWorkoutSetDraft(
  draft: HealthWorkoutStructuredDraft,
  exerciseIndex: number,
  setIndex: number,
  persistedId: string,
): HealthWorkoutStructuredDraft {
  return {
    exercises: draft.exercises.map((exercise, currentExerciseIndex) => currentExerciseIndex === exerciseIndex
      ? { ...exercise, sets: exercise.sets.map((set, currentSetIndex) => currentSetIndex === setIndex ? { ...set, id: persistedId } : set) }
      : exercise),
  };
}

export type HealthWorkoutStructuredSummary = {
  exerciseName: string;
  measurementType: HealthFitnessMeasurement;
  values: string[];
};

export function createEmptyHealthWorkoutDraftSet(): HealthWorkoutDraftSet {
  return { durationSeconds: "", notes: "", reps: "" };
}

export function createHealthWorkoutExerciseDraft(exercise: HealthExercise): HealthWorkoutExerciseDraft {
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    measurementType: exercise.default_measurement,
    notes: "",
    sets: [createEmptyHealthWorkoutDraftSet()],
  };
}

export function validateHealthWorkoutStructuredDraft(
  draft: HealthWorkoutStructuredDraft,
  library: readonly HealthExercise[],
) {
  const knownExerciseIds = new Set(library.map((exercise) => exercise.id));
  for (const [exerciseIndex, exercise] of draft.exercises.entries()) {
    if (!exercise.exerciseId || !knownExerciseIds.has(exercise.exerciseId)) {
      return `Exercise ${exerciseIndex + 1} is not a valid Exercise Library entry.`;
    }
    if (!exercise.exerciseName.trim()) {
      return `Exercise ${exerciseIndex + 1} needs a name snapshot.`;
    }
    if (!HEALTH_FITNESS_MEASUREMENTS.includes(exercise.measurementType)) {
      return `Exercise ${exerciseIndex + 1} has an unsupported tracking type.`;
    }
    if (exercise.sets.length === 0) {
      return `${exercise.exerciseName} needs at least one set.`;
    }
    for (const [setIndex, set] of exercise.sets.entries()) {
      const reps = set.reps.trim();
      const durationSeconds = set.durationSeconds.trim();
      if (exercise.measurementType === "reps") {
        if (!isPositiveInteger(reps) || durationSeconds.length > 0) {
          return `${exercise.exerciseName} Set ${setIndex + 1} needs positive whole-number reps.`;
        }
      } else if (!isPositiveInteger(durationSeconds) || reps.length > 0) {
        return `${exercise.exerciseName} Set ${setIndex + 1} needs positive duration seconds.`;
      }
    }
  }
  return null;
}

export function parsePositiveHealthFitnessInteger(value: string) {
  const trimmed = value.trim();
  if (!isPositiveInteger(trimmed)) return null;
  return Number(trimmed);
}

export function getHealthWorkoutStructuredSummary(
  workoutId: string,
  workoutExercises: readonly HealthWorkoutExercise[],
  workoutSets: readonly HealthWorkoutSet[],
): HealthWorkoutStructuredSummary[] {
  return workoutExercises
    .filter((exercise) => exercise.workout_id === workoutId)
    .sort(compareStructuredOrder)
    .map((exercise) => ({
      exerciseName: exercise.exercise_name,
      measurementType: exercise.measurement_type,
      values: workoutSets
        .filter((set) => set.workout_exercise_id === exercise.id)
        .sort(compareStructuredOrder)
        .map((set) => exercise.measurement_type === "reps" ? `${set.reps} reps` : `${set.duration_seconds}s`),
    }));
}

function compareStructuredOrder(left: { sort_order: number; created_at: string }, right: { sort_order: number; created_at: string }) {
  return left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at);
}

function isPositiveInteger(value: string) {
  return /^\d+$/.test(value) && Number(value) > 0;
}

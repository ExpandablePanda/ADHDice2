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

export type HealthExerciseOption = {
  label: string;
  value: string;
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
  totalLabel: string;
  values: string[];
};

export function createEmptyHealthWorkoutDraftSet(): HealthWorkoutDraftSet {
  return { durationSeconds: "", notes: "", reps: "" };
}

export function createHealthWorkoutExerciseDraft(
  exercise: HealthExercise,
  measurementType: HealthFitnessMeasurement = "reps",
): HealthWorkoutExerciseDraft {
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    // Exercise Library rows are reusable identities; the Workout Exercise owns this choice.
    measurementType,
    notes: "",
    sets: [createEmptyHealthWorkoutDraftSet()],
  };
}

export function buildHealthWorkoutExerciseOptions(
  library: readonly HealthExercise[],
  currentExerciseId: string,
): HealthExerciseOption[] {
  const current = library.find((exercise) => exercise.id === currentExerciseId);
  const options = current
    ? [{ label: current.archived_at === null ? current.name : `${current.name} (archived)`, value: current.id }]
    : [];
  const seenIds = new Set(options.map((option) => option.value));
  for (const exercise of library) {
    if (exercise.archived_at !== null || seenIds.has(exercise.id)) continue;
    options.push({ label: exercise.name, value: exercise.id });
    seenIds.add(exercise.id);
  }
  return options;
}

export function replaceHealthWorkoutExerciseIdentity(
  draft: HealthWorkoutExerciseDraft,
  exercise: HealthExercise,
): HealthWorkoutExerciseDraft {
  return {
    ...draft,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
  };
}

export function switchHealthWorkoutMeasurementType(
  sets: readonly HealthWorkoutDraftSet[],
  measurementType: HealthFitnessMeasurement,
): HealthWorkoutDraftSet[] {
  return sets.map((set) => ({
    ...set,
    durationSeconds: measurementType === "duration" ? set.durationSeconds : "",
    reps: measurementType === "reps" ? set.reps : "",
  }));
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
      totalLabel: exercise.measurement_type === "reps"
        ? `Total ${workoutSets.filter((set) => set.workout_exercise_id === exercise.id).reduce((total, set) => total + (set.reps ?? 0), 0)} reps`
        : `Total ${formatHealthWorkoutDuration(workoutSets.filter((set) => set.workout_exercise_id === exercise.id).reduce((total, set) => total + (set.duration_seconds ?? 0), 0))}`,
      values: workoutSets
        .filter((set) => set.workout_exercise_id === exercise.id)
        .sort(compareStructuredOrder)
        .map((set) => exercise.measurement_type === "reps" ? `${set.reps} reps` : `${set.duration_seconds}s`),
    }));
}

export function formatHealthWorkoutDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);
  return parts.join(" ");
}

function compareStructuredOrder(left: { sort_order: number; created_at: string }, right: { sort_order: number; created_at: string }) {
  return left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at);
}

function isPositiveInteger(value: string) {
  return /^\d+$/.test(value) && Number(value) > 0;
}

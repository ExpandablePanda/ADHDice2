import type {
  HealthFitnessGoal,
  HealthFitnessGoalLevel,
  HealthFitnessPerformanceMetric,
  HealthWorkout,
  HealthWorkoutExercise,
  HealthWorkoutSet,
} from "@/lib/database.types";

export type { HealthFitnessPerformanceMetric } from "@/lib/database.types";

export const HEALTH_FITNESS_PERFORMANCE_METRICS: readonly HealthFitnessPerformanceMetric[] = [
  "single_set_reps",
  "session_total_reps",
  "longest_set_duration",
  "session_total_duration",
];

export type HealthFitnessPerformanceObservation = {
  exerciseId: string;
  metric: HealthFitnessPerformanceMetric;
  value: number;
  workoutId: string;
  workoutDate: string;
  startedAt: string | null;
  workoutCreatedAt: string;
  workoutExerciseId?: string;
  setId?: string;
  workoutExerciseIds?: string[];
  setIds?: string[];
  workoutExerciseSortOrder?: number;
  workoutExerciseCreatedAt?: string;
  setSortOrder?: number;
  setCreatedAt?: string;
};

type SessionObservationBucket = {
  exerciseId: string;
  metric: HealthFitnessPerformanceMetric;
  workout: HealthWorkout;
  observations: HealthFitnessPerformanceObservation[];
  value: number;
};

function isPositiveInteger(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isInteger(value) && value > 0;
}

function isValidTimestamp(value: string | null | undefined) {
  return Boolean(value) && Number.isFinite(Date.parse(value as string));
}

function compareTimestamps(left: string | null | undefined, right: string | null | undefined) {
  const leftIsValid = isValidTimestamp(left);
  const rightIsValid = isValidTimestamp(right);
  if (leftIsValid && rightIsValid) return Date.parse(left as string) - Date.parse(right as string);
  if (leftIsValid) return -1;
  if (rightIsValid) return 1;
  return 0;
}

function compareNumbers(left: number | undefined, right: number | undefined) {
  if (left !== undefined && right !== undefined) return left - right;
  if (left !== undefined) return -1;
  if (right !== undefined) return 1;
  return 0;
}

function firstEvidence(observations: readonly HealthFitnessPerformanceObservation[]) {
  return [...observations].sort(compareHealthFitnessPerformanceObservations)[0] ?? null;
}

export function compareHealthFitnessPerformanceObservations(
  left: HealthFitnessPerformanceObservation,
  right: HealthFitnessPerformanceObservation,
) {
  return left.workoutDate.localeCompare(right.workoutDate)
    || compareTimestamps(left.startedAt, right.startedAt)
    || left.workoutCreatedAt.localeCompare(right.workoutCreatedAt)
    || left.workoutId.localeCompare(right.workoutId)
    || compareNumbers(left.workoutExerciseSortOrder, right.workoutExerciseSortOrder)
    || (left.workoutExerciseCreatedAt ?? "").localeCompare(right.workoutExerciseCreatedAt ?? "")
    || (left.workoutExerciseId ?? left.workoutExerciseIds?.join("\u0000") ?? "").localeCompare(right.workoutExerciseId ?? right.workoutExerciseIds?.join("\u0000") ?? "")
    || compareNumbers(left.setSortOrder, right.setSortOrder)
    || (left.setCreatedAt ?? "").localeCompare(right.setCreatedAt ?? "")
    || (left.setId ?? left.setIds?.join("\u0000") ?? "").localeCompare(right.setId ?? right.setIds?.join("\u0000") ?? "");
}

function createSetObservation(
  workout: HealthWorkout,
  workoutExercise: HealthWorkoutExercise,
  set: HealthWorkoutSet,
  metric: HealthFitnessPerformanceMetric,
  value: number,
): HealthFitnessPerformanceObservation {
  return {
    exerciseId: workoutExercise.exercise_id,
    metric,
    value,
    workoutId: workout.id,
    workoutDate: workout.workout_date,
    startedAt: workout.started_at,
    workoutCreatedAt: workout.created_at,
    workoutExerciseId: workoutExercise.id,
    setId: set.id,
    workoutExerciseSortOrder: workoutExercise.sort_order,
    workoutExerciseCreatedAt: workoutExercise.created_at,
    setSortOrder: set.sort_order,
    setCreatedAt: set.created_at,
  };
}

export function deriveHealthFitnessPerformanceObservations(
  workouts: readonly HealthWorkout[],
  workoutExercises: readonly HealthWorkoutExercise[],
  workoutSets: readonly HealthWorkoutSet[],
) {
  const workoutsById = new Map(workouts.map((workout) => [workout.id, workout]));
  const setsByWorkoutExerciseId = new Map<string, HealthWorkoutSet[]>();
  for (const set of workoutSets) {
    setsByWorkoutExerciseId.set(set.workout_exercise_id, [
      ...(setsByWorkoutExerciseId.get(set.workout_exercise_id) ?? []),
      set,
    ]);
  }

  const observations: HealthFitnessPerformanceObservation[] = [];
  const sessionBuckets = new Map<string, SessionObservationBucket>();
  const orderedWorkoutExercises = [...workoutExercises].sort((left, right) => (
    left.workout_id.localeCompare(right.workout_id)
      || left.sort_order - right.sort_order
      || left.created_at.localeCompare(right.created_at)
      || left.id.localeCompare(right.id)
  ));

  for (const workoutExercise of orderedWorkoutExercises) {
    const workout = workoutsById.get(workoutExercise.workout_id);
    if (!workout || workout.user_id !== workoutExercise.user_id) continue;
    if (!workoutExercise.exercise_id || workoutExercise.user_id !== workout.user_id) continue;

    const measurement = workoutExercise.measurement_type;
    if (measurement !== "reps" && measurement !== "duration") continue;
    const sets = [...(setsByWorkoutExerciseId.get(workoutExercise.id) ?? [])].sort((left, right) => (
      left.sort_order - right.sort_order
        || left.created_at.localeCompare(right.created_at)
        || left.id.localeCompare(right.id)
    ));

    for (const set of sets) {
      if (set.user_id !== workoutExercise.user_id) continue;
      const isRepsSet = measurement === "reps"
        && isPositiveInteger(set.reps)
        && set.duration_seconds === null;
      const isDurationSet = measurement === "duration"
        && isPositiveInteger(set.duration_seconds)
        && set.reps === null;
      if (!isRepsSet && !isDurationSet) continue;

      const metric = measurement === "reps" ? "single_set_reps" : "longest_set_duration";
      const value = measurement === "reps" ? set.reps : set.duration_seconds;
      if (!isPositiveInteger(value)) continue;
      const observation = createSetObservation(workout, workoutExercise, set, metric, value);
      observations.push(observation);

      const sessionMetric = measurement === "reps" ? "session_total_reps" : "session_total_duration";
      const bucketKey = `${workout.id}\u0000${workoutExercise.exercise_id}\u0000${measurement}`;
      const bucket = sessionBuckets.get(bucketKey) ?? {
        exerciseId: workoutExercise.exercise_id,
        metric: sessionMetric,
        observations: [],
        value: 0,
        workout,
      };
      bucket.observations.push(observation);
      bucket.value += value;
      sessionBuckets.set(bucketKey, bucket);
    }
  }

  for (const bucket of sessionBuckets.values()) {
    const earliestEvidence = firstEvidence(bucket.observations);
    if (!earliestEvidence) continue;
    observations.push({
      exerciseId: bucket.exerciseId,
      metric: bucket.metric,
      value: bucket.value,
      workoutId: bucket.workout.id,
      workoutDate: bucket.workout.workout_date,
      startedAt: bucket.workout.started_at,
      workoutCreatedAt: bucket.workout.created_at,
      workoutExerciseIds: [...new Set(bucket.observations.flatMap((observation) => [
        ...(observation.workoutExerciseId ? [observation.workoutExerciseId] : []),
        ...(observation.workoutExerciseIds ?? []),
      ]))],
      setIds: [...new Set(bucket.observations.flatMap((observation) => [
        ...(observation.setId ? [observation.setId] : []),
        ...(observation.setIds ?? []),
      ]))],
      workoutExerciseSortOrder: earliestEvidence.workoutExerciseSortOrder,
      workoutExerciseCreatedAt: earliestEvidence.workoutExerciseCreatedAt,
      setSortOrder: earliestEvidence.setSortOrder,
      setCreatedAt: earliestEvidence.setCreatedAt,
    });
  }

  return observations.sort(compareHealthFitnessPerformanceObservations);
}

export function filterHealthFitnessPerformanceObservations(
  observations: readonly HealthFitnessPerformanceObservation[],
  exerciseId: string,
  metric: HealthFitnessPerformanceMetric,
) {
  return observations
    .filter((observation) => observation.exerciseId === exerciseId && observation.metric === metric)
    .sort(compareHealthFitnessPerformanceObservations);
}

export function getHealthFitnessCurrentPersonalRecord(
  observations: readonly HealthFitnessPerformanceObservation[],
  exerciseId: string,
  metric: HealthFitnessPerformanceMetric,
) {
  return filterHealthFitnessPerformanceObservations(observations, exerciseId, metric)
    .reduce<HealthFitnessPerformanceObservation | null>((current, observation) => (
      !current || observation.value > current.value ? observation : current
    ), null);
}

export function getHealthFitnessPersonalRecordHistory(
  observations: readonly HealthFitnessPerformanceObservation[],
  exerciseId: string,
  metric: HealthFitnessPerformanceMetric,
) {
  let currentBest = 0;
  const history: HealthFitnessPerformanceObservation[] = [];
  for (const observation of filterHealthFitnessPerformanceObservations(observations, exerciseId, metric)) {
    if (observation.value <= currentBest) continue;
    currentBest = observation.value;
    history.push(observation);
  }
  return history;
}

export function findFirstHealthFitnessThresholdReachedEvidence(
  observations: readonly HealthFitnessPerformanceObservation[],
  exerciseId: string,
  metric: HealthFitnessPerformanceMetric,
  threshold: number,
) {
  if (!isPositiveInteger(threshold)) return null;
  return filterHealthFitnessPerformanceObservations(observations, exerciseId, metric)
    .find((observation) => observation.value >= threshold) ?? null;
}

export type HealthFitnessProgressStatus = {
  currentValue: number;
  target: number;
  reached: boolean;
  firstReachedEvidence: HealthFitnessPerformanceObservation | null;
  progressValue: number;
  progressRatio: number;
};

function getHealthFitnessProgressStatus(
  observations: readonly HealthFitnessPerformanceObservation[],
  exerciseId: string,
  metric: HealthFitnessPerformanceMetric,
  target: number,
): HealthFitnessProgressStatus {
  const currentRecord = getHealthFitnessCurrentPersonalRecord(observations, exerciseId, metric);
  const currentValue = currentRecord?.value ?? 0;
  const safeTarget = isPositiveInteger(target) ? target : 1;
  return {
    currentValue,
    target,
    reached: currentValue >= target,
    firstReachedEvidence: findFirstHealthFitnessThresholdReachedEvidence(observations, exerciseId, metric, target),
    progressValue: currentValue,
    progressRatio: Math.min(currentValue / safeTarget, 1),
  };
}

export function getHealthFitnessGoalStatus(
  goal: HealthFitnessGoal,
  observations: readonly HealthFitnessPerformanceObservation[],
) {
  return getHealthFitnessProgressStatus(observations, goal.exercise_id, goal.metric, goal.target);
}

export function getHealthFitnessGoalLevelStatus(
  goal: HealthFitnessGoal,
  level: HealthFitnessGoalLevel,
  observations: readonly HealthFitnessPerformanceObservation[],
) {
  return getHealthFitnessProgressStatus(observations, goal.exercise_id, goal.metric, level.target);
}

export function getHealthFitnessGoalLevelStatuses(
  goal: HealthFitnessGoal,
  levels: readonly HealthFitnessGoalLevel[],
  observations: readonly HealthFitnessPerformanceObservation[],
) {
  return levels
    .filter((level) => level.goal_id === goal.id)
    .map((level) => ({ level, ...getHealthFitnessGoalLevelStatus(goal, level, observations) }));
}

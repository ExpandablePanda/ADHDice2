import type { HealthExercise, HealthFitnessMeasurement, HealthWorkoutInsert } from "@/lib/database.types";
import {
  formatHealthWorkoutDuration,
  parsePositiveHealthFitnessInteger,
  type HealthWorkoutStructuredDraft,
} from "@/lib/health-fitness-session";

export const ACTIVE_FITNESS_WORKOUT_STORAGE_PREFIX = "adhdice-health-active-workout:";
export const ACTIVE_FITNESS_WORKOUT_VERSION = 1;

export type ActiveFitnessWorkoutSet = {
  accumulatedSeconds: number;
  completed: boolean;
  currentRunStartedAt: string | null;
  notes: string;
  reps: string;
  runtimeSetId: string;
};

export type ActiveFitnessWorkoutExercise = {
  exerciseId: string;
  exerciseName: string;
  measurementType: HealthFitnessMeasurement;
  notes: string;
  runtimeExerciseId: string;
  sets: ActiveFitnessWorkoutSet[];
};

export type ActiveFitnessWorkoutRuntime = {
  accumulatedSeconds: number;
  canonicalWorkoutId?: string;
  createdAt: string;
  currentRunStartedAt: string | null;
  exercises: ActiveFitnessWorkoutExercise[];
  finishAttemptedAt?: string;
  notes: string;
  runtimeId: string;
  selectedPlanItemIds: string[];
  state: "running" | "paused";
  title: string;
  updatedAt: string;
  version: typeof ACTIVE_FITNESS_WORKOUT_VERSION;
  workoutStartedAt: string;
  workoutType: string;
};

export type ActiveFitnessWorkoutStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type ActiveFitnessWorkoutOperationResult = {
  error?: string;
  runtime: ActiveFitnessWorkoutRuntime;
};

export type ActiveFitnessWorkoutTotals = {
  completedSets: number;
  totalDurationSeconds: number;
  totalReps: number;
};

export function applyActiveFitnessWorkoutFinishResult(
  runtime: ActiveFitnessWorkoutRuntime,
  result: { canonicalWorkoutId: string | null; ok: boolean },
) {
  if (result.ok) return null;
  return {
    ...runtime,
    canonicalWorkoutId: result.canonicalWorkoutId ?? runtime.canonicalWorkoutId,
  };
}

export function getActiveFitnessWorkoutStorageKey(userId: string) {
  return `${ACTIVE_FITNESS_WORKOUT_STORAGE_PREFIX}${userId}`;
}

export function createActiveFitnessWorkoutRuntime(
  workoutType: string,
  nowMs = Date.now(),
  selectedPlanItemIds: readonly string[] = [],
): ActiveFitnessWorkoutRuntime {
  const now = new Date(nowMs).toISOString();
  return {
    accumulatedSeconds: 0,
    createdAt: now,
    currentRunStartedAt: now,
    exercises: [],
    notes: "",
    runtimeId: createRuntimeId("active-workout"),
    selectedPlanItemIds: [...new Set(selectedPlanItemIds)],
    state: "running",
    title: "",
    updatedAt: now,
    version: ACTIVE_FITNESS_WORKOUT_VERSION,
    workoutStartedAt: now,
    workoutType: workoutType.trim(),
  };
}

export function startOrRestoreActiveFitnessWorkout(
  existing: ActiveFitnessWorkoutRuntime | null,
  workoutType: string,
  nowMs = Date.now(),
  selectedPlanItemIds: readonly string[] = [],
) {
  return existing ?? createActiveFitnessWorkoutRuntime(workoutType, nowMs, selectedPlanItemIds);
}

export function canDiscardActiveFitnessWorkout(runtime: Pick<ActiveFitnessWorkoutRuntime, "canonicalWorkoutId"> | null | undefined) {
  return !runtime?.canonicalWorkoutId;
}

export function updateActiveFitnessWorkoutDetails(
  runtime: ActiveFitnessWorkoutRuntime,
  patch: Partial<Pick<ActiveFitnessWorkoutRuntime, "notes" | "selectedPlanItemIds" | "title" | "workoutType">>,
  nowMs = Date.now(),
) {
  return touchRuntime({
    ...runtime,
    ...patch,
    selectedPlanItemIds: patch.selectedPlanItemIds ? [...new Set(patch.selectedPlanItemIds)] : runtime.selectedPlanItemIds,
    workoutType: patch.workoutType === undefined ? runtime.workoutType : patch.workoutType.trim(),
  }, nowMs);
}

export function getActiveFitnessWorkoutElapsedSeconds(runtime: Pick<ActiveFitnessWorkoutRuntime, "accumulatedSeconds" | "currentRunStartedAt" | "state">, nowMs: number) {
  return getElapsedSeconds(runtime.accumulatedSeconds, runtime.currentRunStartedAt, runtime.state === "running", nowMs);
}

export function getActiveFitnessWorkoutSetElapsedSeconds(
  set: Pick<ActiveFitnessWorkoutSet, "accumulatedSeconds" | "currentRunStartedAt">,
  nowMs: number,
) {
  return getElapsedSeconds(set.accumulatedSeconds, set.currentRunStartedAt, set.currentRunStartedAt !== null, nowMs);
}

export function pauseActiveFitnessWorkout(runtime: ActiveFitnessWorkoutRuntime, nowMs = Date.now()) {
  const now = new Date(nowMs).toISOString();
  let next = runtime;
  for (const exercise of runtime.exercises) {
    for (const set of exercise.sets) {
      if (set.currentRunStartedAt !== null) {
        next = pauseActiveFitnessWorkoutSet(next, exercise.runtimeExerciseId, set.runtimeSetId, nowMs).runtime;
      }
    }
  }
  return touchRuntime({
    ...next,
    accumulatedSeconds: getActiveFitnessWorkoutElapsedSeconds(next, nowMs),
    currentRunStartedAt: null,
    state: "paused",
  }, nowMs, now);
}

export function resumeActiveFitnessWorkout(runtime: ActiveFitnessWorkoutRuntime, nowMs = Date.now()) {
  if (runtime.state === "running") return runtime;
  const now = new Date(nowMs).toISOString();
  return touchRuntime({ ...runtime, currentRunStartedAt: now, state: "running" }, nowMs, now);
}

export function addActiveFitnessWorkoutExercise(
  runtime: ActiveFitnessWorkoutRuntime,
  exercise: Pick<HealthExercise, "id" | "name">,
  measurementType: HealthFitnessMeasurement = "reps",
  nowMs = Date.now(),
) {
  const set = createActiveFitnessWorkoutSet();
  return touchRuntime({
    ...runtime,
    exercises: [...runtime.exercises, {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      measurementType,
      notes: "",
      runtimeExerciseId: createRuntimeId("active-exercise"),
      sets: [set],
    }],
  }, nowMs);
}

export function removeActiveFitnessWorkoutExercise(runtime: ActiveFitnessWorkoutRuntime, runtimeExerciseId: string, nowMs = Date.now()) {
  return touchRuntime({
    ...runtime,
    exercises: runtime.exercises.filter((exercise) => exercise.runtimeExerciseId !== runtimeExerciseId),
  }, nowMs);
}

export function moveActiveFitnessWorkoutExercise(runtime: ActiveFitnessWorkoutRuntime, runtimeExerciseId: string, direction: -1 | 1, nowMs = Date.now()) {
  const index = runtime.exercises.findIndex((exercise) => exercise.runtimeExerciseId === runtimeExerciseId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= runtime.exercises.length) return runtime;
  const exercises = [...runtime.exercises];
  const [moved] = exercises.splice(index, 1);
  if (!moved) return runtime;
  exercises.splice(nextIndex, 0, moved);
  return touchRuntime({ ...runtime, exercises }, nowMs);
}

export function updateActiveFitnessWorkoutExercise(
  runtime: ActiveFitnessWorkoutRuntime,
  runtimeExerciseId: string,
  patch: Partial<Pick<ActiveFitnessWorkoutExercise, "measurementType" | "notes">>,
  nowMs = Date.now(),
) {
  return touchRuntime({
    ...runtime,
    exercises: runtime.exercises.map((exercise) => {
      if (exercise.runtimeExerciseId !== runtimeExerciseId) return exercise;
      if (patch.measurementType === undefined || patch.measurementType === exercise.measurementType) {
        return { ...exercise, ...patch };
      }
      return {
        ...exercise,
        ...patch,
        sets: exercise.sets.map((set) => ({
          ...set,
          completed: false,
          reps: patch.measurementType === "reps" ? set.reps : "",
          accumulatedSeconds: patch.measurementType === "duration" ? set.accumulatedSeconds : 0,
          currentRunStartedAt: null,
        })),
      };
    }),
  }, nowMs);
}

export function addActiveFitnessWorkoutSet(runtime: ActiveFitnessWorkoutRuntime, runtimeExerciseId: string, nowMs = Date.now()) {
  return touchRuntime({
    ...runtime,
    exercises: runtime.exercises.map((exercise) => exercise.runtimeExerciseId === runtimeExerciseId
      ? { ...exercise, sets: [...exercise.sets, createActiveFitnessWorkoutSet()] }
      : exercise),
  }, nowMs);
}

export function removeIncompleteActiveFitnessWorkoutSet(
  runtime: ActiveFitnessWorkoutRuntime,
  runtimeExerciseId: string,
  runtimeSetId: string,
  nowMs = Date.now(),
) {
  return touchRuntime({
    ...runtime,
    exercises: runtime.exercises.map((exercise) => exercise.runtimeExerciseId === runtimeExerciseId
      ? { ...exercise, sets: exercise.sets.filter((set) => set.runtimeSetId !== runtimeSetId || set.completed) }
      : exercise),
  }, nowMs);
}

export function updateActiveFitnessWorkoutSet(
  runtime: ActiveFitnessWorkoutRuntime,
  runtimeExerciseId: string,
  runtimeSetId: string,
  patch: Partial<Pick<ActiveFitnessWorkoutSet, "notes" | "reps">>,
  nowMs = Date.now(),
) {
  return touchRuntime({
    ...runtime,
    exercises: runtime.exercises.map((exercise) => exercise.runtimeExerciseId === runtimeExerciseId
      ? {
        ...exercise,
        sets: exercise.sets.map((set) => set.runtimeSetId === runtimeSetId ? { ...set, ...patch } : set),
      }
      : exercise),
  }, nowMs);
}

export function completeActiveFitnessRepsSet(
  runtime: ActiveFitnessWorkoutRuntime,
  runtimeExerciseId: string,
  runtimeSetId: string,
  nowMs = Date.now(),
): ActiveFitnessWorkoutOperationResult {
  const exercise = runtime.exercises.find((candidate) => candidate.runtimeExerciseId === runtimeExerciseId);
  const set = exercise?.sets.find((candidate) => candidate.runtimeSetId === runtimeSetId);
  if (!exercise || !set || parsePositiveHealthFitnessInteger(set.reps) === null) {
    return { error: "Enter positive whole-number reps before completing the Set.", runtime };
  }
  return {
    runtime: touchRuntime({
      ...runtime,
      exercises: runtime.exercises.map((candidate) => candidate.runtimeExerciseId === runtimeExerciseId
        ? { ...candidate, sets: candidate.sets.map((currentSet) => currentSet.runtimeSetId === runtimeSetId ? { ...currentSet, completed: true } : currentSet) }
        : candidate),
    }, nowMs),
  };
}

export function reopenActiveFitnessWorkoutSet(runtime: ActiveFitnessWorkoutRuntime, runtimeExerciseId: string, runtimeSetId: string, nowMs = Date.now()) {
  return touchRuntime({
    ...runtime,
    exercises: runtime.exercises.map((exercise) => exercise.runtimeExerciseId === runtimeExerciseId
      ? { ...exercise, sets: exercise.sets.map((set) => set.runtimeSetId === runtimeSetId ? { ...set, completed: false } : set) }
      : exercise),
  }, nowMs);
}

export function startActiveFitnessDurationSet(
  runtime: ActiveFitnessWorkoutRuntime,
  runtimeExerciseId: string,
  runtimeSetId: string,
  nowMs = Date.now(),
) {
  if (runtime.state !== "running") return runtime;
  const selectedSet = runtime.exercises
    .find((exercise) => exercise.runtimeExerciseId === runtimeExerciseId)
    ?.sets.find((set) => set.runtimeSetId === runtimeSetId);
  if (selectedSet && selectedSet.currentRunStartedAt !== null) return runtime;
  const now = new Date(nowMs).toISOString();
  let next = runtime;
  for (const exercise of runtime.exercises) {
    for (const set of exercise.sets) {
      if (set.currentRunStartedAt !== null && (exercise.runtimeExerciseId !== runtimeExerciseId || set.runtimeSetId !== runtimeSetId)) {
        next = pauseActiveFitnessWorkoutSet(next, exercise.runtimeExerciseId, set.runtimeSetId, nowMs).runtime;
      }
    }
  }
  return touchRuntime({
    ...next,
    exercises: next.exercises.map((exercise) => exercise.runtimeExerciseId === runtimeExerciseId
      ? { ...exercise, sets: exercise.sets.map((set) => set.runtimeSetId === runtimeSetId ? { ...set, completed: false, currentRunStartedAt: now } : set) }
      : exercise),
  }, nowMs, now);
}

export function pauseActiveFitnessWorkoutSet(
  runtime: ActiveFitnessWorkoutRuntime,
  runtimeExerciseId: string,
  runtimeSetId: string,
  nowMs = Date.now(),
): ActiveFitnessWorkoutOperationResult {
  const exercise = runtime.exercises.find((candidate) => candidate.runtimeExerciseId === runtimeExerciseId);
  const set = exercise?.sets.find((candidate) => candidate.runtimeSetId === runtimeSetId);
  if (!exercise || !set || set.currentRunStartedAt === null) return { runtime };
  return {
    runtime: touchRuntime({
      ...runtime,
      exercises: runtime.exercises.map((candidate) => candidate.runtimeExerciseId === runtimeExerciseId
        ? {
          ...candidate,
          sets: candidate.sets.map((currentSet) => currentSet.runtimeSetId === runtimeSetId
            ? { ...currentSet, accumulatedSeconds: getActiveFitnessWorkoutSetElapsedSeconds(currentSet, nowMs), currentRunStartedAt: null }
            : currentSet),
        }
        : candidate),
    }, nowMs),
  };
}

export function completeActiveFitnessDurationSet(
  runtime: ActiveFitnessWorkoutRuntime,
  runtimeExerciseId: string,
  runtimeSetId: string,
  nowMs = Date.now(),
): ActiveFitnessWorkoutOperationResult {
  const paused = pauseActiveFitnessWorkoutSet(runtime, runtimeExerciseId, runtimeSetId, nowMs).runtime;
  const exercise = paused.exercises.find((candidate) => candidate.runtimeExerciseId === runtimeExerciseId);
  const set = exercise?.sets.find((candidate) => candidate.runtimeSetId === runtimeSetId);
  if (!exercise || !set || getActiveFitnessWorkoutSetElapsedSeconds(set, nowMs) <= 0) {
    return { error: "Run the Duration Set for more than zero seconds before completing it.", runtime: paused };
  }
  return {
    runtime: touchRuntime({
      ...paused,
      exercises: paused.exercises.map((candidate) => candidate.runtimeExerciseId === runtimeExerciseId
        ? { ...candidate, sets: candidate.sets.map((currentSet) => currentSet.runtimeSetId === runtimeSetId ? { ...currentSet, completed: true } : currentSet) }
        : candidate),
    }, nowMs),
  };
}

export function getActiveFitnessWorkoutTotals(exercise: ActiveFitnessWorkoutExercise, nowMs: number): ActiveFitnessWorkoutTotals {
  const completedSets = exercise.sets.filter((set) => set.completed);
  return {
    completedSets: completedSets.length,
    totalDurationSeconds: completedSets.reduce((total, set) => total + getActiveFitnessWorkoutSetElapsedSeconds(set, nowMs), 0),
    totalReps: completedSets.reduce((total, set) => total + (parsePositiveHealthFitnessInteger(set.reps) ?? 0), 0),
  };
}

export function freezeActiveFitnessWorkout(runtime: ActiveFitnessWorkoutRuntime, finishAtMs = Date.now()) {
  return pauseActiveFitnessWorkout(runtime, finishAtMs);
}

export function buildActiveFitnessWorkoutFinishPayload(
  runtime: ActiveFitnessWorkoutRuntime,
  finishAtMs = Date.now(),
): { structuredDraft: HealthWorkoutStructuredDraft; workout: Omit<HealthWorkoutInsert, "user_id">; runtime: ActiveFitnessWorkoutRuntime } {
  const finishAt = runtime.finishAttemptedAt ?? new Date(finishAtMs).toISOString();
  const frozen = freezeActiveFitnessWorkout(runtime, Date.parse(finishAt));
  const durationSeconds = Math.max(1, getActiveFitnessWorkoutElapsedSeconds(frozen, Date.parse(finishAt)));
  return {
    runtime: { ...frozen, finishAttemptedAt: finishAt },
    structuredDraft: {
      exercises: frozen.exercises
        .map((exercise) => ({
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
          id: exercise.runtimeExerciseId,
          measurementType: exercise.measurementType,
          notes: exercise.notes,
          sets: exercise.sets
            .filter((set) => set.completed)
            .map((set) => ({
              durationSeconds: exercise.measurementType === "duration" ? String(getActiveFitnessWorkoutSetElapsedSeconds(set, Date.parse(finishAt))) : "",
              id: set.runtimeSetId,
              notes: set.notes,
              reps: exercise.measurementType === "reps" ? String(parsePositiveHealthFitnessInteger(set.reps) ?? 0) : "",
            }))
        }))
        .filter((exercise) => exercise.sets.length > 0),
    },
    workout: {
      active_calories: null,
      ended_at: finishAt,
      id: runtime.canonicalWorkoutId ?? runtime.runtimeId,
      notes: frozen.notes,
      source: "manual",
      started_at: frozen.workoutStartedAt,
      title: frozen.title.trim() || frozen.workoutType,
      workout_date: getLocalHealthDateFromIso(frozen.workoutStartedAt),
      workout_type: frozen.workoutType,
      duration_seconds: durationSeconds,
    },
  };
}

export function formatActiveFitnessWorkoutClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatActiveFitnessWorkoutTotal(exercise: ActiveFitnessWorkoutExercise, nowMs: number) {
  const totals = getActiveFitnessWorkoutTotals(exercise, nowMs);
  return exercise.measurementType === "reps"
    ? `${totals.completedSets} completed ${totals.completedSets === 1 ? "set" : "sets"} · ${totals.totalReps} reps`
    : `${totals.completedSets} completed ${totals.completedSets === 1 ? "set" : "sets"} · ${formatHealthWorkoutDuration(totals.totalDurationSeconds)}`;
}

export function parseActiveFitnessWorkoutRecord(rawValue: string | null): ActiveFitnessWorkoutRuntime | null {
  if (!rawValue) return null;
  try {
    const parsed: unknown = JSON.parse(rawValue);
    return isActiveFitnessWorkoutRuntime(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readActiveFitnessWorkout(storage: ActiveFitnessWorkoutStorage | null | undefined, userId: string | null | undefined) {
  if (!storage || !userId) return null;
  const key = getActiveFitnessWorkoutStorageKey(userId);
  const rawValue = storage.getItem(key);
  const runtime = parseActiveFitnessWorkoutRecord(rawValue);
  if (rawValue !== null && runtime === null) storage.removeItem(key);
  return runtime;
}

export function writeActiveFitnessWorkout(storage: ActiveFitnessWorkoutStorage | null | undefined, userId: string | null | undefined, runtime: ActiveFitnessWorkoutRuntime | null) {
  if (!storage || !userId) return;
  const key = getActiveFitnessWorkoutStorageKey(userId);
  if (!runtime) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(runtime));
}

export function getLocalHealthDateFromIso(isoTimestamp: string) {
  const date = new Date(isoTimestamp);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function createActiveFitnessWorkoutSet(): ActiveFitnessWorkoutSet {
  return {
    accumulatedSeconds: 0,
    completed: false,
    currentRunStartedAt: null,
    notes: "",
    reps: "",
    runtimeSetId: createRuntimeId("active-set"),
  };
}

function createRuntimeId(prefix: string) {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function touchRuntime(runtime: ActiveFitnessWorkoutRuntime, nowMs = Date.now(), nowIso = new Date(nowMs).toISOString()) {
  return { ...runtime, updatedAt: nowIso };
}

function getElapsedSeconds(accumulatedSeconds: number, currentRunStartedAt: string | null, isRunning: boolean, nowMs: number) {
  const currentSegment = isRunning && currentRunStartedAt
    ? Math.max(0, Math.floor((nowMs - Date.parse(currentRunStartedAt)) / 1000))
    : 0;
  return Math.max(0, Math.floor(accumulatedSeconds) + currentSegment);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isActiveFitnessWorkoutRuntime(value: unknown): value is ActiveFitnessWorkoutRuntime {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActiveFitnessWorkoutRuntime>;
  if (candidate.version !== ACTIVE_FITNESS_WORKOUT_VERSION || typeof candidate.runtimeId !== "string" || !candidate.runtimeId.trim()) return false;
  if (candidate.state !== "running" && candidate.state !== "paused") return false;
  if (!isTimestamp(candidate.workoutStartedAt) || !isTimestamp(candidate.createdAt) || !isTimestamp(candidate.updatedAt)) return false;
  if (candidate.currentRunStartedAt !== null && !isTimestamp(candidate.currentRunStartedAt)) return false;
  if (typeof candidate.accumulatedSeconds !== "number" || !Number.isFinite(candidate.accumulatedSeconds) || candidate.accumulatedSeconds < 0) return false;
  if (typeof candidate.workoutType !== "string" || typeof candidate.title !== "string" || typeof candidate.notes !== "string") return false;
  if (!Array.isArray(candidate.selectedPlanItemIds) || candidate.selectedPlanItemIds.some((id) => typeof id !== "string")) return false;
  if (candidate.canonicalWorkoutId !== undefined && typeof candidate.canonicalWorkoutId !== "string") return false;
  if (candidate.finishAttemptedAt !== undefined && !isTimestamp(candidate.finishAttemptedAt)) return false;
  return Array.isArray(candidate.exercises) && candidate.exercises.every(isActiveFitnessWorkoutExercise);
}

function isActiveFitnessWorkoutExercise(value: unknown): value is ActiveFitnessWorkoutExercise {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActiveFitnessWorkoutExercise>;
  return typeof candidate.exerciseId === "string"
    && typeof candidate.exerciseName === "string"
    && (candidate.measurementType === "reps" || candidate.measurementType === "duration")
    && typeof candidate.notes === "string"
    && typeof candidate.runtimeExerciseId === "string"
    && Array.isArray(candidate.sets)
    && candidate.sets.every(isActiveFitnessWorkoutSet);
}

function isActiveFitnessWorkoutSet(value: unknown): value is ActiveFitnessWorkoutSet {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActiveFitnessWorkoutSet>;
  return typeof candidate.runtimeSetId === "string"
    && typeof candidate.reps === "string"
    && typeof candidate.notes === "string"
    && typeof candidate.completed === "boolean"
    && candidate.currentRunStartedAt !== undefined
    && (candidate.currentRunStartedAt === null || isTimestamp(candidate.currentRunStartedAt))
    && typeof candidate.accumulatedSeconds === "number"
    && Number.isFinite(candidate.accumulatedSeconds)
    && candidate.accumulatedSeconds >= 0;
}

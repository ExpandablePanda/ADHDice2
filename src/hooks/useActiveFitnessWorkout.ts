"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  HealthExercise,
  HealthWorkout,
  HealthWorkoutInsert,
  HealthWorkoutUpdate,
} from "@/lib/database.types";
import type { HealthWorkoutSessionSaveResult } from "@/hooks/useFitnessSessionDetails";
import type { HealthWorkoutStructuredDraft } from "@/lib/health-fitness-session";
import {
  addActiveFitnessWorkoutExercise,
  addActiveFitnessWorkoutSet,
  ACTIVE_FITNESS_WORKOUT_TIMING_LOCKED_MESSAGE,
  applyActiveFitnessWorkoutFinishResult,
  buildActiveFitnessWorkoutFinishPayload,
  canResumeActiveFitnessWorkout,
  canDiscardActiveFitnessWorkout,
  completeActiveFitnessDurationSet,
  completeActiveFitnessRepsSet,
  getActiveFitnessWorkoutStorageKey,
  moveActiveFitnessWorkoutExercise,
  pauseActiveFitnessWorkout,
  pauseActiveFitnessWorkoutSet,
  readActiveFitnessWorkout,
  removeActiveFitnessWorkoutExercise,
  removeIncompleteActiveFitnessWorkoutSet,
  reopenActiveFitnessWorkoutSet,
  resumeActiveFitnessWorkout,
  startActiveFitnessDurationSet,
  startOrRestoreActiveFitnessWorkout,
  updateActiveFitnessWorkoutDetails,
  updateActiveFitnessWorkoutExercise,
  updateActiveFitnessWorkoutSet,
  writeActiveFitnessWorkout,
  type ActiveFitnessWorkoutRuntime,
} from "@/lib/health-active-workout";
import { saveHealthWorkoutBundle } from "@/lib/health-workout-save";
import type { HealthFitnessMeasurement } from "@/lib/database.types";

type SetMessage = (message: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;

export type UseActiveFitnessWorkoutOptions = {
  addWorkout: (input: Omit<HealthWorkoutInsert, "user_id">) => Promise<HealthWorkout | null>;
  saveWorkoutPlanItemLinks: (workoutId: string, planItemIds: readonly string[]) => Promise<boolean>;
  saveWorkoutSessionDetails: (workoutId: string, draft: HealthWorkoutStructuredDraft) => Promise<HealthWorkoutSessionSaveResult>;
  setMessage?: SetMessage;
  updateWorkout: (workoutId: string, input: HealthWorkoutUpdate) => Promise<boolean>;
  userId: string | null;
  workoutTypes: readonly string[];
};

export function useActiveFitnessWorkout({
  addWorkout,
  saveWorkoutPlanItemLinks,
  saveWorkoutSessionDetails,
  setMessage = () => undefined,
  updateWorkout,
  userId,
  workoutTypes,
}: UseActiveFitnessWorkoutOptions) {
  const [runtime, setRuntime] = useState<ActiveFitnessWorkoutRuntime | null>(null);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setRuntime(readActiveFitnessWorkout(window.localStorage, userId));
      setError(null);
      setHydratedUserId(userId);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (hydratedUserId !== userId || !userId || typeof window === "undefined") return;
    writeActiveFitnessWorkout(window.localStorage, userId, runtime);
  }, [hydratedUserId, runtime, userId]);

  const updateRuntime = useCallback((updater: (current: ActiveFitnessWorkoutRuntime) => ActiveFitnessWorkoutRuntime) => {
    setRuntime((current) => current ? updater(current) : current);
    setError(null);
  }, []);

  const startWorkout = useCallback((selectedPlanItemIds: readonly string[] = []) => {
    if (runtime) return runtime;
    const next = startOrRestoreActiveFitnessWorkout(runtime, workoutTypes[0] ?? "Other", Date.now(), selectedPlanItemIds);
    setRuntime(next);
    setError(null);
    return next;
  }, [runtime, workoutTypes]);

  const updateDetails = useCallback((patch: Parameters<typeof updateActiveFitnessWorkoutDetails>[1]) => {
    updateRuntime((current) => updateActiveFitnessWorkoutDetails(current, patch));
  }, [updateRuntime]);

  const pauseWorkout = useCallback(() => {
    updateRuntime((current) => pauseActiveFitnessWorkout(current));
  }, [updateRuntime]);

  const resumeWorkout = useCallback(() => {
    if (runtime?.canonicalWorkoutId) {
      setError(ACTIVE_FITNESS_WORKOUT_TIMING_LOCKED_MESSAGE);
      return;
    }
    if (!canResumeActiveFitnessWorkout(runtime)) return;
    updateRuntime((current) => resumeActiveFitnessWorkout(current));
  }, [runtime, updateRuntime]);

  const addExercise = useCallback((exercise: Pick<HealthExercise, "id" | "name">, measurementType: HealthFitnessMeasurement = "reps") => {
    updateRuntime((current) => addActiveFitnessWorkoutExercise(current, exercise, measurementType));
  }, [updateRuntime]);

  const removeExercise = useCallback((runtimeExerciseId: string) => {
    updateRuntime((current) => removeActiveFitnessWorkoutExercise(current, runtimeExerciseId));
  }, [updateRuntime]);

  const moveExercise = useCallback((runtimeExerciseId: string, direction: -1 | 1) => {
    updateRuntime((current) => moveActiveFitnessWorkoutExercise(current, runtimeExerciseId, direction));
  }, [updateRuntime]);

  const updateExercise = useCallback((runtimeExerciseId: string, patch: Parameters<typeof updateActiveFitnessWorkoutExercise>[2]) => {
    updateRuntime((current) => updateActiveFitnessWorkoutExercise(current, runtimeExerciseId, patch));
  }, [updateRuntime]);

  const addSet = useCallback((runtimeExerciseId: string) => {
    updateRuntime((current) => addActiveFitnessWorkoutSet(current, runtimeExerciseId));
  }, [updateRuntime]);

  const removeIncompleteSet = useCallback((runtimeExerciseId: string, runtimeSetId: string) => {
    updateRuntime((current) => removeIncompleteActiveFitnessWorkoutSet(current, runtimeExerciseId, runtimeSetId));
  }, [updateRuntime]);

  const updateSet = useCallback((runtimeExerciseId: string, runtimeSetId: string, patch: Parameters<typeof updateActiveFitnessWorkoutSet>[3]) => {
    updateRuntime((current) => updateActiveFitnessWorkoutSet(current, runtimeExerciseId, runtimeSetId, patch));
  }, [updateRuntime]);

  const completeRepsSet = useCallback((runtimeExerciseId: string, runtimeSetId: string) => {
    if (!runtime) return;
    const result = completeActiveFitnessRepsSet(runtime, runtimeExerciseId, runtimeSetId);
    setError(result.error ?? null);
    setRuntime(result.runtime);
  }, [runtime]);

  const reopenSet = useCallback((runtimeExerciseId: string, runtimeSetId: string) => {
    updateRuntime((current) => reopenActiveFitnessWorkoutSet(current, runtimeExerciseId, runtimeSetId));
  }, [updateRuntime]);

  const startDurationSet = useCallback((runtimeExerciseId: string, runtimeSetId: string) => {
    if (runtime?.canonicalWorkoutId) {
      setError(ACTIVE_FITNESS_WORKOUT_TIMING_LOCKED_MESSAGE);
      return;
    }
    if (runtime?.state !== "running") {
      setError("Resume the overall workout before starting a Duration Set.");
      return;
    }
    updateRuntime((current) => startActiveFitnessDurationSet(current, runtimeExerciseId, runtimeSetId));
  }, [runtime?.canonicalWorkoutId, runtime?.state, updateRuntime]);

  const pauseDurationSet = useCallback((runtimeExerciseId: string, runtimeSetId: string) => {
    updateRuntime((current) => pauseActiveFitnessWorkoutSet(current, runtimeExerciseId, runtimeSetId).runtime);
  }, [updateRuntime]);

  const completeDurationSet = useCallback((runtimeExerciseId: string, runtimeSetId: string) => {
    if (!runtime) return;
    const result = completeActiveFitnessDurationSet(runtime, runtimeExerciseId, runtimeSetId);
    setError(result.error ?? null);
    setRuntime(result.runtime);
  }, [runtime]);

  const discardWorkout = useCallback(() => {
    if (!canDiscardActiveFitnessWorkout(runtime)) {
      const message = "This workout already has a canonical log. Retry Finish Workout instead of discarding it.";
      setError(message);
      setMessage({ tone: "warn", text: message });
      return false;
    }
    setRuntime(null);
    setError(null);
    return true;
  }, [runtime, setMessage]);

  const finishWorkout = useCallback(async () => {
    if (!runtime || isFinishing) return false;
    setIsFinishing(true);
    const finishAtMs = runtime.finishAttemptedAt ? Date.parse(runtime.finishAttemptedAt) : Date.now();
    const payload = buildActiveFitnessWorkoutFinishPayload(runtime, finishAtMs);
    setRuntime(payload.runtime);
    const result = await saveHealthWorkoutBundle({
      addWorkout,
      canonicalWorkoutId: runtime.canonicalWorkoutId,
      draft: payload.structuredDraft,
      planItemIds: payload.runtime.selectedPlanItemIds,
      saveWorkoutPlanItemLinks,
      saveWorkoutSessionDetails,
      shouldSaveStructuredDetails: payload.structuredDraft.exercises.length > 0,
      updateWorkout,
      workout: payload.workout,
    });
    if (!result.ok) {
      const message = result.failedStage === "structured"
        ? "Workout was saved, but exercise details could not finish saving. Retry."
        : result.failedStage === "plans"
          ? "Workout and exercise details were saved, but Fitness Plan associations could not finish saving. Retry."
          : "Workout could not be finished. Retry.";
      setRuntime(applyActiveFitnessWorkoutFinishResult(payload.runtime, result));
      setError(message);
      setMessage({ tone: "warn", text: message });
      setIsFinishing(false);
      return false;
    }
    setRuntime(null);
    setError(null);
    setMessage({ tone: "good", text: "Workout saved." });
    setIsFinishing(false);
    return true;
  }, [addWorkout, isFinishing, runtime, saveWorkoutPlanItemLinks, saveWorkoutSessionDetails, setMessage, updateWorkout]);

  return {
    addExercise,
    addSet,
    completeDurationSet,
    completeRepsSet,
    discardWorkout,
    error,
    finishWorkout,
    isFinishing,
    moveExercise,
    pauseDurationSet,
    pauseWorkout,
    removeExercise,
    removeIncompleteSet,
    reopenSet,
    resumeWorkout,
    runtime,
    startDurationSet,
    startWorkout,
    updateDetails,
    updateExercise,
    updateSet,
    storageKey: userId ? getActiveFitnessWorkoutStorageKey(userId) : null,
  };
}

export type ActiveFitnessWorkoutController = ReturnType<typeof useActiveFitnessWorkout>;

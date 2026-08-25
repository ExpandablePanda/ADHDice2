"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  HealthExercise,
  HealthExerciseInsert,
  HealthExerciseUpdate,
  HealthWorkoutExercise,
  HealthWorkoutExerciseInsert,
  HealthWorkoutExerciseUpdate,
  HealthWorkoutSet,
  HealthWorkoutSetInsert,
  HealthWorkoutSetUpdate,
} from "@/lib/database.types";
import {
  parsePositiveHealthFitnessInteger,
  reconcileHealthWorkoutExerciseDraft,
  reconcileHealthWorkoutSetDraft,
  type HealthWorkoutStructuredDraft,
  validateHealthWorkoutStructuredDraft,
} from "@/lib/health-fitness-session";
import type { createBrowserSupabaseClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (message: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;

export type HealthWorkoutSessionDetails = {
  exercises: HealthWorkoutExercise[];
  sets: HealthWorkoutSet[];
};

export type HealthWorkoutSessionSaveResult = {
  draft: HealthWorkoutStructuredDraft;
  ok: boolean;
};

function normalizeExerciseInput(input: Omit<HealthExerciseInsert, "user_id" | "default_measurement">) {
  return {
    ...input,
    // Compatibility-only schema field. Measurement authority belongs to each Workout Exercise.
    default_measurement: "reps" as const,
    name: input.name.trim(),
  };
}

function normalizeWorkoutExerciseInput(
  input: Omit<HealthWorkoutExerciseInsert, "user_id">,
) {
  return {
    ...input,
    exercise_name: input.exercise_name.trim(),
    notes: input.notes?.trim() || null,
  };
}

function normalizeWorkoutSetInput(input: Omit<HealthWorkoutSetInsert, "user_id">) {
  return {
    ...input,
    notes: input.notes?.trim() || null,
  };
}

export function useFitnessSessionDetails(
  client: SupabaseClient,
  userId: string | null,
  setMessage: SetMessage,
  active = true,
) {
  const [exerciseLibrary, setExerciseLibrary] = useState<HealthExercise[]>([]);
  const [workoutExercises, setWorkoutExercises] = useState<HealthWorkoutExercise[]>([]);
  const [workoutSets, setWorkoutSets] = useState<HealthWorkoutSet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportError = useCallback((message: string) => {
    setError(message);
    setMessage({ tone: "warn", text: message });
  }, [setMessage]);

  const reload = useCallback(async () => {
    if (!client || !userId) {
      return false;
    }

    setIsLoading(true);
    setIsLoaded(false);
    setError(null);
    setExerciseLibrary([]);
    setWorkoutExercises([]);
    setWorkoutSets([]);
    const [libraryResult, workoutExercisesResult, workoutSetsResult] = await Promise.all([
      client.from("adhdice_health_exercises").select("*").eq("user_id", userId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }).order("id", { ascending: true }),
      client.from("adhdice_health_workout_exercises").select("*").eq("user_id", userId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      client.from("adhdice_health_workout_sets").select("*").eq("user_id", userId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    ]);
    const firstError = libraryResult.error ?? workoutExercisesResult.error ?? workoutSetsResult.error;
    if (firstError) {
      reportError(`Structured Fitness is unavailable until the 7.11.46 Fitness Sessions and 7.11.50 Exercise sort-order migrations are applied. ${firstError.message}`);
      setIsLoading(false);
      setIsLoaded(true);
      return false;
    }

    setExerciseLibrary(libraryResult.data ?? []);
    setWorkoutExercises(workoutExercisesResult.data ?? []);
    setWorkoutSets(workoutSetsResult.data ?? []);
    setIsLoading(false);
    setIsLoaded(true);
    setError(null);
    return true;
  }, [client, reportError, userId]);

  useEffect(() => {
    if (!active || !userId || !client) {
      queueMicrotask(() => {
        setExerciseLibrary([]);
        setWorkoutExercises([]);
        setWorkoutSets([]);
        setIsLoaded(false);
        setError(null);
      });
      return;
    }
    queueMicrotask(() => {
      void reload();
    });
  }, [active, client, reload, userId]);

  async function createExercise(input: Omit<HealthExerciseInsert, "user_id" | "default_measurement">) {
    if (!client || !userId) {
      reportError("Exercise Library is unavailable while Health is offline.");
      return null;
    }
    const normalizedInput = normalizeExerciseInput(input);
    if (!normalizedInput.name) {
      reportError("Exercise name cannot be blank.");
      return null;
    }
    const activeExercises = exerciseLibrary.filter((exercise) => exercise.archived_at === null);
    const nextSortOrder = activeExercises.reduce((maximum, exercise) => Math.max(maximum, exercise.sort_order), -1) + 1;
    const { data, error: insertError } = await client
      .from("adhdice_health_exercises")
      .insert({ ...normalizedInput, sort_order: nextSortOrder, user_id: userId })
      .select("*")
      .single();
    if (insertError || !data) {
      reportError(insertError?.message ?? "Exercise could not be added.");
      return null;
    }
    setExerciseLibrary((current) => {
      const active = current.filter((exercise) => exercise.archived_at === null);
      const archived = current.filter((exercise) => exercise.archived_at !== null);
      return [...active, data, ...archived];
    });
    setError(null);
    return data;
  }

  async function updateExercise(exerciseId: string, input: HealthExerciseUpdate) {
    if (!client || !userId) {
      reportError("Exercise Library is unavailable while Health is offline.");
      return false;
    }
    const normalizedInput = {
      ...input,
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
    };
    if (normalizedInput.name !== undefined && !normalizedInput.name) {
      reportError("Exercise name cannot be blank.");
      return false;
    }
    const { data, error: updateError } = await client
      .from("adhdice_health_exercises")
      .update(normalizedInput)
      .eq("id", exerciseId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (updateError || !data) {
      reportError(updateError?.message ?? "Exercise could not be updated.");
      return false;
    }
    setExerciseLibrary((current) => current.map((exercise) => exercise.id === exerciseId ? data : exercise));
    setError(null);
    return true;
  }

  async function archiveExercise(exerciseId: string) {
    return updateExercise(exerciseId, { archived_at: new Date().toISOString() });
  }

  async function reorderExercises(orderedExerciseIds: readonly string[]) {
    if (!client || !userId) {
      reportError("Exercise Library is unavailable while Health is offline.");
      return false;
    }
    const activeExercises = exerciseLibrary.filter((exercise) => exercise.archived_at === null);
    const expectedIds = activeExercises.map((exercise) => exercise.id);
    const expectedIdSet = new Set(expectedIds);
    const receivedIds = [...orderedExerciseIds];
    if (
      receivedIds.length !== expectedIds.length
      || new Set(receivedIds).size !== receivedIds.length
      || receivedIds.some((exerciseId) => !expectedIdSet.has(exerciseId))
    ) {
      reportError("Exercise order could not be saved because the list changed. Reload and try again.");
      return false;
    }

    const exerciseById = new Map(activeExercises.map((exercise) => [exercise.id, exercise]));
    const orderedExercises = receivedIds.map((exerciseId) => exerciseById.get(exerciseId)).filter((exercise): exercise is HealthExercise => Boolean(exercise));
    setExerciseLibrary((current) => [...orderedExercises, ...current.filter((exercise) => exercise.archived_at !== null)]);
    const writes = receivedIds.map((exerciseId, sortOrder) => client
      .from("adhdice_health_exercises")
      .update({ sort_order: sortOrder })
      .eq("id", exerciseId)
      .eq("user_id", userId)
      .is("archived_at", null));
    const results = await Promise.all(writes);
    const writeError = results.find((result) => result.error)?.error;
    if (writeError) {
      await reload();
      reportError(`Exercise order could not be saved. The canonical order was reloaded. ${writeError.message}`);
      return false;
    }
    setError(null);
    return true;
  }

  function getWorkoutSessionDetails(workoutId: string): HealthWorkoutSessionDetails {
    const exercises = workoutExercises
      .filter((exercise) => exercise.workout_id === workoutId)
      .sort(compareStructuredRows);
    const exerciseIds = new Set(exercises.map((exercise) => exercise.id));
    return {
      exercises,
      sets: workoutSets.filter((set) => exerciseIds.has(set.workout_exercise_id)).sort(compareStructuredRows),
    };
  }

  async function saveWorkoutSessionDetails(workoutId: string, draft: HealthWorkoutStructuredDraft): Promise<HealthWorkoutSessionSaveResult> {
    let reconciledDraft = draft;
    const validationError = validateHealthWorkoutStructuredDraft(reconciledDraft, exerciseLibrary);
    if (validationError) {
      reportError(validationError);
      return { draft: reconciledDraft, ok: false };
    }
    if (!client || !userId) {
      reportError("Structured Fitness is unavailable while Health is offline.");
      return { draft: reconciledDraft, ok: false };
    }

    const existingExercises = workoutExercises.filter((exercise) => exercise.workout_id === workoutId);
    const existingExerciseById = new Map(existingExercises.map((exercise) => [exercise.id, exercise]));
    const desiredExerciseIds = new Set(reconciledDraft.exercises.map((exercise) => exercise.id).filter((id): id is string => Boolean(id)));
    if ([...desiredExerciseIds].some((id) => !existingExerciseById.has(id) && workoutExercises.some((exercise) => exercise.id === id))) {
      return failStructuredSave(`Structured exercise identity is not owned by Workout ${workoutId}.`, reconciledDraft);
    }

    const preparedExercises = reconciledDraft.exercises.map((draftExercise, sortOrder) => normalizeWorkoutExerciseInput({
      ...(draftExercise.id ? { id: draftExercise.id } : {}),
      exercise_id: draftExercise.exerciseId,
      exercise_name: draftExercise.exerciseName,
      measurement_type: draftExercise.measurementType,
      notes: draftExercise.notes,
      sort_order: sortOrder,
      workout_id: workoutId,
    }));
    const persistedExercises: Array<HealthWorkoutExercise | undefined> = new Array(reconciledDraft.exercises.length);
    for (const [exerciseIndex, draftExercise] of reconciledDraft.exercises.entries()) {
      if (draftExercise.id && existingExerciseById.has(draftExercise.id)) continue;
      const input = preparedExercises[exerciseIndex];
      if (!input) return failStructuredSave("Structured exercise details could not be prepared for saving.", reconciledDraft);
      const { data, error: insertError } = await client
        .from("adhdice_health_workout_exercises")
        .insert({ ...input, user_id: userId })
        .select("*")
        .single();
      if (insertError || !data) {
        return failStructuredSave(`Exercise details could not be added. ${insertError?.message ?? "Try again."}`, reconciledDraft);
      }
      persistedExercises[exerciseIndex] = data;
      reconciledDraft = reconcileHealthWorkoutExerciseDraft(reconciledDraft, exerciseIndex, data.id);
    }
    for (const [exerciseIndex, draftExercise] of reconciledDraft.exercises.entries()) {
      const existing = draftExercise.id ? existingExerciseById.get(draftExercise.id) : undefined;
      if (!existing) continue;
      const input = preparedExercises[exerciseIndex];
      if (!input) return failStructuredSave("Structured exercise details could not be prepared for saving.", reconciledDraft);
      const { data, error: updateError } = await client
        .from("adhdice_health_workout_exercises")
        .update(toWorkoutExerciseUpdate(input))
        .eq("id", existing.id)
        .eq("user_id", userId)
        .eq("workout_id", workoutId)
        .select("*")
        .single();
      if (updateError || !data) {
        return failStructuredSave(`Exercise details could not be updated. ${updateError?.message ?? "Try again."}`, reconciledDraft);
      }
      persistedExercises[exerciseIndex] = data;
    }

    const existingSetsByExerciseId = new Map<string, HealthWorkoutSet[]>();
    for (const exercise of existingExercises) {
      existingSetsByExerciseId.set(exercise.id, workoutSets.filter((set) => set.workout_exercise_id === exercise.id));
    }
    const persistedSets: HealthWorkoutSet[] = [];
    const desiredSetIds = new Set<string>();
    const preparedSets = reconciledDraft.exercises.map((draftExercise, exerciseIndex) => {
      const persistedExercise = persistedExercises[exerciseIndex];
      return draftExercise.sets.map((draftSet, sortOrder) => ({
        draftSet,
        input: normalizeWorkoutSetInput({
          ...(draftSet.id ? { id: draftSet.id } : {}),
          duration_seconds: draftExercise.measurementType === "duration" ? parsePositiveHealthFitnessInteger(draftSet.durationSeconds) : null,
          notes: draftSet.notes,
          reps: draftExercise.measurementType === "reps" ? parsePositiveHealthFitnessInteger(draftSet.reps) : null,
          sort_order: sortOrder,
          workout_exercise_id: persistedExercise?.id ?? "",
        }),
      }));
    });
    for (const [exerciseIndex, sets] of preparedSets.entries()) {
      const persistedExercise = persistedExercises[exerciseIndex];
      if (!persistedExercise) return failStructuredSave("Structured exercise details could not be matched for saving.", reconciledDraft);
      const existingSetById = new Map((existingSetsByExerciseId.get(persistedExercise.id) ?? []).map((set) => [set.id, set]));
      for (const [setIndex, { draftSet, input }] of sets.entries()) {
        if (draftSet.id) desiredSetIds.add(draftSet.id);
        if (draftSet.id && !existingSetById.has(draftSet.id) && workoutSets.some((set) => set.id === draftSet.id)) {
          return failStructuredSave("Structured set identity is not owned by this Workout Exercise.", reconciledDraft);
        }
        if (draftSet.id && existingSetById.has(draftSet.id)) continue;
        const { data, error: insertError } = await client
          .from("adhdice_health_workout_sets")
          .insert({ ...input, user_id: userId })
          .select("*")
          .single();
        if (insertError || !data) {
          return failStructuredSave(`Set details could not be added. ${insertError?.message ?? "Try again."}`, reconciledDraft);
        }
        desiredSetIds.add(data.id);
        persistedSets.push(data);
        reconciledDraft = reconcileHealthWorkoutSetDraft(reconciledDraft, exerciseIndex, setIndex, data.id);
      }
    }
    for (const [exerciseIndex] of reconciledDraft.exercises.entries()) {
      const persistedExercise = persistedExercises[exerciseIndex];
      if (!persistedExercise) {
        return failStructuredSave("Structured exercise details could not be matched for saving.", reconciledDraft);
      }
      const existingSetById = new Map((existingSetsByExerciseId.get(persistedExercise.id) ?? []).map((set) => [set.id, set]));
      for (const { draftSet, input } of preparedSets[exerciseIndex] ?? []) {
        const existing = draftSet.id ? existingSetById.get(draftSet.id) : undefined;
        if (!existing) continue;
        const { data, error: updateError } = await client
          .from("adhdice_health_workout_sets")
          .update(toWorkoutSetUpdate(input))
          .eq("id", existing.id)
          .eq("user_id", userId)
          .eq("workout_exercise_id", persistedExercise.id)
          .select("*")
          .single();
        if (updateError || !data) {
          return failStructuredSave(`Set details could not be updated. ${updateError?.message ?? "Try again."}`, reconciledDraft);
        }
        persistedSets.push(data);
      }
    }

    const persistedExerciseRows = persistedExercises.filter((exercise): exercise is HealthWorkoutExercise => Boolean(exercise));
    const setsToRemove = workoutSets.filter((set) => {
      const belongsToWorkout = existingExerciseById.has(set.workout_exercise_id);
      const exerciseRemains = persistedExerciseRows.some((exercise) => exercise.id === set.workout_exercise_id);
      return belongsToWorkout && exerciseRemains && !desiredSetIds.has(set.id);
    });
    if (setsToRemove.length > 0) {
      const groupedSetIds = groupIdsByParent(setsToRemove, (set) => set.workout_exercise_id);
      for (const [workoutExerciseId, ids] of groupedSetIds) {
        const { error: deleteError } = await client
          .from("adhdice_health_workout_sets")
          .delete()
          .eq("user_id", userId)
          .eq("workout_exercise_id", workoutExerciseId)
          .in("id", ids);
        if (deleteError) {
          return failStructuredSave(`Some removed sets could not be deleted. ${deleteError.message}`, reconciledDraft);
        }
      }
    }

    const exercisesToRemove = existingExercises.filter((exercise) => !persistedExerciseRows.some((persisted) => persisted.id === exercise.id));
    if (exercisesToRemove.length > 0) {
      const { error: deleteError } = await client
        .from("adhdice_health_workout_exercises")
        .delete()
        .eq("user_id", userId)
        .eq("workout_id", workoutId)
        .in("id", exercisesToRemove.map((exercise) => exercise.id));
      if (deleteError) {
        return failStructuredSave(`Some removed exercises could not be deleted. ${deleteError.message}`, reconciledDraft);
      }
    }

    setWorkoutExercises((current) => [...current.filter((exercise) => exercise.workout_id !== workoutId), ...persistedExerciseRows]);
    const removedExerciseIds = new Set(exercisesToRemove.map((exercise) => exercise.id));
    setWorkoutSets((current) => [
      ...current.filter((set) => !existingExerciseById.has(set.workout_exercise_id) && !removedExerciseIds.has(set.workout_exercise_id)),
      ...persistedSets,
    ]);
    setError(null);
    return { draft: reconciledDraft, ok: true };
  }

  function removeLocalWorkoutSessionDetails(workoutId: string) {
    const exerciseIds = new Set(workoutExercises.filter((exercise) => exercise.workout_id === workoutId).map((exercise) => exercise.id));
    setWorkoutExercises((current) => current.filter((exercise) => exercise.workout_id !== workoutId));
    setWorkoutSets((current) => current.filter((set) => !exerciseIds.has(set.workout_exercise_id)));
  }

  async function failStructuredSave(message: string, draft: HealthWorkoutStructuredDraft): Promise<HealthWorkoutSessionSaveResult> {
    await reload();
    reportError(message);
    return { draft, ok: false };
  }

  return {
    archiveExercise,
    createExercise,
    error,
    exerciseLibrary,
    getWorkoutSessionDetails,
    isLoaded,
    isLoading,
    reload,
    removeLocalWorkoutSessionDetails,
    reorderExercises,
    saveWorkoutSessionDetails,
    updateExercise,
    workoutExercises,
    workoutSets,
  };
}

function compareStructuredRows(left: { sort_order: number; created_at: string }, right: { sort_order: number; created_at: string }) {
  return left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at);
}

function toWorkoutExerciseUpdate(input: Omit<HealthWorkoutExerciseInsert, "user_id">): HealthWorkoutExerciseUpdate {
  return {
    exercise_id: input.exercise_id,
    exercise_name: input.exercise_name,
    measurement_type: input.measurement_type,
    notes: input.notes,
    sort_order: input.sort_order,
  };
}

function toWorkoutSetUpdate(input: Omit<HealthWorkoutSetInsert, "user_id">): HealthWorkoutSetUpdate {
  return {
    duration_seconds: input.duration_seconds,
    notes: input.notes,
    reps: input.reps,
    sort_order: input.sort_order,
  };
}

function groupIdsByParent<T extends { id: string }>(rows: readonly T[], getParent: (row: T) => string) {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const parent = getParent(row);
    grouped.set(parent, [...(grouped.get(parent) ?? []), row.id]);
  }
  return grouped;
}

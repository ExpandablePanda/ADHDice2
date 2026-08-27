"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  HealthExercise,
  HealthFitnessGoal,
  HealthFitnessGoalInsert,
  HealthFitnessGoalLevel,
  HealthFitnessGoalLevelInsert,
  HealthFitnessGoalLevelUpdate,
  HealthFitnessGoalUpdate,
} from "@/lib/database.types";
import {
  formatHealthFitnessGoalsError,
  normalizeHealthFitnessGoalDraft,
  normalizeHealthFitnessGoalLevelDraft,
  validateHealthFitnessGoalDraft,
  validateHealthFitnessGoalLevelDraft,
  validateHealthFitnessGoalTargetAgainstLevels,
} from "@/lib/health-fitness-goals";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import { isCurrentFitnessReloadRequest, type FitnessReloadScope } from "@/lib/fitness-reload-guard";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (message: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;
type GoalExercise = Pick<HealthExercise, "id" | "archived_at">;

export function useFitnessGoals(
  client: SupabaseClient,
  userId: string | null,
  setMessage: SetMessage,
  active = true,
) {
  const [goals, setGoals] = useState<HealthFitnessGoal[]>([]);
  const [levels, setLevels] = useState<HealthFitnessGoalLevel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateScope, setStateScope] = useState<FitnessReloadScope<SupabaseClient> | null>(null);
  const reloadGenerationRef = useRef(0);
  const scopeRef = useRef<FitnessReloadScope<SupabaseClient>>({ active, client, userId });

  const reportError = useCallback((message: string) => {
    setError(message);
    setMessage({ tone: "warn", text: message });
  }, [setMessage]);

  const reload = useCallback(async () => {
    const generation = ++reloadGenerationRef.current;
    const requestedScope = { active, client, userId };
    if (!active || !client || !userId) return false;

    setStateScope(requestedScope);
    setGoals([]);
    setLevels([]);
    setError(null);
    setIsLoading(true);
    const [goalsResult, levelsResult] = await Promise.all([
      client
        .from("adhdice_health_fitness_goals")
        .select("*")
        .eq("user_id", userId)
        .order("archived_at", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true }),
      client
        .from("adhdice_health_fitness_goal_levels")
        .select("*")
        .eq("user_id", userId)
        .order("goal_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    const isCurrent = () => isCurrentFitnessReloadRequest({ ...requestedScope, generation }, scopeRef.current, reloadGenerationRef.current);
    if (!isCurrent()) return false;
    const firstError = goalsResult.error ?? levelsResult.error;
    if (firstError) {
      reportError(formatHealthFitnessGoalsError(firstError.message));
      setIsLoading(false);
      return false;
    }

    setGoals(goalsResult.data ?? []);
    setLevels(levelsResult.data ?? []);
    setError(null);
    setIsLoading(false);
    return true;
  }, [active, client, reportError, userId]);

  useEffect(() => {
    scopeRef.current = { active, client, userId };
    const effectGeneration = ++reloadGenerationRef.current;
    if (!active || !userId || !client) {
      queueMicrotask(() => {
        if (effectGeneration !== reloadGenerationRef.current) return;
        setGoals([]);
        setLevels([]);
        setIsLoading(false);
        setError(null);
        setStateScope(null);
      });
      return () => {
        reloadGenerationRef.current += 1;
      };
    }
    queueMicrotask(() => {
      if (effectGeneration !== reloadGenerationRef.current) return;
      void reload();
    });
    return () => {
      reloadGenerationRef.current += 1;
    };
  }, [active, client, reload, userId]);

  const isCurrentScope = Boolean(active && userId && client
    && stateScope?.active
    && stateScope.client === client
    && stateScope.userId === userId);

  async function getGoalExercise(exerciseId: string): Promise<GoalExercise | null> {
    if (!client || !userId) return null;
    const { data, error: exerciseError } = await client
      .from("adhdice_health_exercises")
      .select("id, archived_at")
      .eq("user_id", userId)
      .eq("id", exerciseId)
      .maybeSingle();
    if (exerciseError) {
      reportError(formatHealthFitnessGoalsError(exerciseError.message));
      return null;
    }
    if (!data) {
      reportError("Choose a valid Exercise Library exercise for this Goal.");
      return null;
    }
    return data;
  }

  async function createGoal(input: Omit<HealthFitnessGoalInsert, "user_id">) {
    if (!client || !userId) {
      reportError("Fitness Goals are unavailable while Health is offline.");
      return null;
    }
    const normalizedInput = { ...input, title: input.title.trim() };
    const exercise = await getGoalExercise(normalizedInput.exercise_id);
    if (!exercise) return null;
    const validationError = validateHealthFitnessGoalDraft(normalizedInput, [exercise]);
    if (validationError) {
      reportError(validationError);
      return null;
    }
    const { data, error: insertError } = await client
      .from("adhdice_health_fitness_goals")
      .insert({ ...normalizedInput, user_id: userId })
      .select("*")
      .single();
    if (insertError || !data) {
      reportError(formatHealthFitnessGoalsError(insertError?.message));
      return null;
    }
    setGoals((current) => [...current, data]);
    setError(null);
    return data;
  }

  async function updateGoal(goalId: string, input: HealthFitnessGoalUpdate) {
    if (!client || !userId) {
      reportError("Fitness Goals are unavailable while Health is offline.");
      return false;
    }
    const existingGoal = goals.find((goal) => goal.id === goalId);
    if (!existingGoal) {
      reportError("That Fitness Goal is not available in the current user scope.");
      return false;
    }
    const nextDraft = normalizeHealthFitnessGoalDraft({
      exercise_id: input.exercise_id ?? existingGoal.exercise_id,
      metric: input.metric ?? existingGoal.metric,
      target: input.target ?? existingGoal.target,
      title: input.title ?? existingGoal.title,
    });
    const exercise = await getGoalExercise(nextDraft.exercise_id);
    if (!exercise) return false;
    const allowArchivedExercise = existingGoal.exercise_id === nextDraft.exercise_id;
    const validationError = validateHealthFitnessGoalDraft(nextDraft, [exercise], { allowArchivedExercise });
    if (validationError) {
      reportError(validationError);
      return false;
    }
    const targetError = validateHealthFitnessGoalTargetAgainstLevels(goalId, nextDraft.target, levels);
    if (targetError) {
      reportError(targetError);
      return false;
    }
    const normalizedInput: HealthFitnessGoalUpdate = {
      ...input,
      ...(input.exercise_id === undefined ? {} : { exercise_id: nextDraft.exercise_id }),
      ...(input.metric === undefined ? {} : { metric: nextDraft.metric }),
      ...(input.target === undefined ? {} : { target: nextDraft.target }),
      ...(input.title === undefined ? {} : { title: nextDraft.title }),
    };
    const { data, error: updateError } = await client
      .from("adhdice_health_fitness_goals")
      .update(normalizedInput)
      .eq("id", goalId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (updateError || !data) {
      reportError(formatHealthFitnessGoalsError(updateError?.message));
      return false;
    }
    setGoals((current) => current.map((goal) => goal.id === goalId ? data : goal));
    setError(null);
    return true;
  }

  async function archiveGoal(goalId: string) {
    return updateGoal(goalId, { archived_at: new Date().toISOString() });
  }

  async function restoreGoal(goalId: string) {
    return updateGoal(goalId, { archived_at: null });
  }

  async function createLevel(input: Omit<HealthFitnessGoalLevelInsert, "user_id">) {
    if (!client || !userId) {
      reportError("Fitness Goals are unavailable while Health is offline.");
      return null;
    }
    const goal = goals.find((candidate) => candidate.id === input.goal_id);
    const normalizedInput = normalizeHealthFitnessGoalLevelDraft({ ...input, label: input.label.trim() });
    const validationError = validateHealthFitnessGoalLevelDraft(normalizedInput, goal ?? null, levels);
    if (validationError) {
      reportError(validationError);
      return null;
    }
    const { data, error: insertError } = await client
      .from("adhdice_health_fitness_goal_levels")
      .insert({ ...normalizedInput, user_id: userId })
      .select("*")
      .single();
    if (insertError || !data) {
      reportError(formatHealthFitnessGoalsError(insertError?.message));
      return null;
    }
    setLevels((current) => [...current, data]);
    setError(null);
    return data;
  }

  async function updateLevel(levelId: string, input: HealthFitnessGoalLevelUpdate) {
    if (!client || !userId) {
      reportError("Fitness Goals are unavailable while Health is offline.");
      return false;
    }
    const existingLevel = levels.find((level) => level.id === levelId);
    const goal = existingLevel ? goals.find((candidate) => candidate.id === existingLevel.goal_id) : undefined;
    if (!existingLevel || !goal) {
      reportError("That Fitness Level is not available in the current user scope.");
      return false;
    }
    const normalizedInput = normalizeHealthFitnessGoalLevelDraft({
      goal_id: existingLevel.goal_id,
      label: input.label ?? existingLevel.label,
      target: input.target ?? existingLevel.target,
      sort_order: input.sort_order ?? existingLevel.sort_order,
    });
    const validationError = validateHealthFitnessGoalLevelDraft(normalizedInput, goal, levels, levelId);
    if (validationError) {
      reportError(validationError);
      return false;
    }
    const { data, error: updateError } = await client
      .from("adhdice_health_fitness_goal_levels")
      .update({
        ...(input.label === undefined ? {} : { label: normalizedInput.label }),
        ...(input.target === undefined ? {} : { target: normalizedInput.target }),
        ...(input.sort_order === undefined ? {} : { sort_order: normalizedInput.sort_order }),
      })
      .eq("id", levelId)
      .eq("user_id", userId)
      .eq("goal_id", existingLevel.goal_id)
      .select("*")
      .single();
    if (updateError || !data) {
      reportError(formatHealthFitnessGoalsError(updateError?.message));
      return false;
    }
    setLevels((current) => current.map((level) => level.id === levelId ? data : level));
    setError(null);
    return true;
  }

  async function deleteLevel(levelId: string) {
    if (!client || !userId) {
      reportError("Fitness Goals are unavailable while Health is offline.");
      return false;
    }
    const { error: deleteError } = await client
      .from("adhdice_health_fitness_goal_levels")
      .delete()
      .eq("id", levelId)
      .eq("user_id", userId);
    if (deleteError) {
      reportError(formatHealthFitnessGoalsError(deleteError.message));
      return false;
    }
    setLevels((current) => current.filter((level) => level.id !== levelId));
    setError(null);
    return true;
  }

  async function reorderLevels(goalId: string, orderedLevelIds: readonly string[]) {
    if (!client || !userId) {
      reportError("Fitness Goals are unavailable while Health is offline.");
      return false;
    }
    const goalLevels = levels.filter((level) => level.goal_id === goalId);
    const expectedIds = goalLevels.map((level) => level.id);
    const receivedIds = [...orderedLevelIds];
    if (
      receivedIds.length !== expectedIds.length
      || new Set(receivedIds).size !== receivedIds.length
      || receivedIds.some((levelId) => !expectedIds.includes(levelId))
    ) {
      reportError("Level order could not be saved because the list changed. Reload and try again.");
      return false;
    }
    const results = await Promise.all(receivedIds.map((levelId, sortOrder) => client
      .from("adhdice_health_fitness_goal_levels")
      .update({ sort_order: sortOrder })
      .eq("id", levelId)
      .eq("goal_id", goalId)
      .eq("user_id", userId)));
    const writeError = results.find((result) => result.error)?.error;
    if (writeError) {
      await reload();
      reportError(`Level order could not be saved. The canonical order was reloaded. ${writeError.message}`);
      return false;
    }
    await reload();
    setError(null);
    return true;
  }

  return {
    archiveGoal,
    createGoal,
    createLevel,
    deleteLevel,
    error: isCurrentScope ? error : null,
    goals: isCurrentScope ? goals : [],
    isLoading: isCurrentScope ? isLoading : Boolean(active && userId && client),
    levels: isCurrentScope ? levels : [],
    reload,
    reorderLevels,
    restoreGoal,
    updateGoal,
    updateLevel,
  };
}

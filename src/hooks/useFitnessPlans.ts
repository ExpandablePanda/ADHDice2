"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  HealthFitnessPlan,
  HealthFitnessPlanInsert,
  HealthFitnessPlanItem,
  HealthFitnessPlanItemInsert,
  HealthFitnessPlanItemUpdate,
  HealthFitnessPlanUpdate,
  HealthWorkoutPlanItemLink,
  HealthWorkoutPlanItemLinkInsert,
} from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (message: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;

function createLocalId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizePlanInput(input: Omit<HealthFitnessPlanInsert, "user_id">) {
  return {
    ...input,
    name: input.name.trim(),
  };
}

function normalizePlanItemInput(input: Omit<HealthFitnessPlanItemInsert, "user_id">) {
  return {
    ...input,
    notes: input.notes?.trim() || null,
    title: input.title?.trim() || null,
    workout_type: input.workout_type.trim(),
  };
}

export function useFitnessPlans(
  client: SupabaseClient,
  userId: string | null,
  setMessage: SetMessage,
  active = true,
) {
  const [plans, setPlans] = useState<HealthFitnessPlan[]>([]);
  const [planItems, setPlanItems] = useState<HealthFitnessPlanItem[]>([]);
  const [workoutPlanItemLinks, setWorkoutPlanItemLinks] = useState<HealthWorkoutPlanItemLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportError = useCallback((message: string) => {
    setError(message);
    setMessage({ tone: "warn", text: message });
  }, [setMessage]);

  const reload = useCallback(async () => {
    if (!client || !userId) {
      return false;
    }

    setPlans([]);
    setPlanItems([]);
    setWorkoutPlanItemLinks([]);
    setError(null);
    setIsLoading(true);
    const [plansResult, planItemsResult, linksResult] = await Promise.all([
      client.from("adhdice_health_fitness_plans").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      client.from("adhdice_health_fitness_plan_items").select("*").eq("user_id", userId).order("sort_order", { ascending: true }).order("day_of_week", { ascending: true }),
      client.from("adhdice_health_workout_plan_item_links").select("*").eq("user_id", userId),
    ]);

    const firstError = plansResult.error ?? planItemsResult.error ?? linksResult.error;
    if (firstError) {
      reportError(`Fitness Plans are unavailable until the 7.11.44 Fitness Plans migration is applied. ${firstError.message}`);
      setIsLoading(false);
      return false;
    }

    setPlans(plansResult.data ?? []);
    setPlanItems(planItemsResult.data ?? []);
    setWorkoutPlanItemLinks(linksResult.data ?? []);
    setError(null);
    setIsLoading(false);
    return true;
  }, [client, reportError, userId]);

  useEffect(() => {
    if (!active || !userId || !client) {
      return;
    }
    queueMicrotask(() => {
      void reload();
    });
  }, [active, client, reload, userId]);

  async function createPlan(input: Omit<HealthFitnessPlanInsert, "user_id">) {
    if (!client || !userId) {
      reportError("Fitness Plans are unavailable while Health is offline.");
      return null;
    }
    const normalizedInput = normalizePlanInput(input);
    const { data, error: insertError } = await client
      .from("adhdice_health_fitness_plans")
      .insert({ ...normalizedInput, user_id: userId })
      .select("*")
      .single();
    if (insertError || !data) {
      reportError(insertError?.message ?? "Fitness Plan could not be created.");
      return null;
    }
    setPlans((current) => [...current, data]);
    setError(null);
    return data;
  }

  async function updatePlan(planId: string, input: HealthFitnessPlanUpdate) {
    if (!client || !userId) {
      reportError("Fitness Plans are unavailable while Health is offline.");
      return false;
    }
    const normalizedInput = input.name === undefined ? input : { ...input, name: input.name.trim() };
    const { data, error: updateError } = await client
      .from("adhdice_health_fitness_plans")
      .update(normalizedInput)
      .eq("id", planId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (updateError || !data) {
      reportError(updateError?.message ?? "Fitness Plan could not be updated.");
      return false;
    }
    setPlans((current) => current.map((plan) => plan.id === planId ? data : plan));
    setError(null);
    return true;
  }

  async function archivePlan(planId: string) {
    return updatePlan(planId, { archived_at: new Date().toISOString() });
  }

  async function createPlanItem(input: Omit<HealthFitnessPlanItemInsert, "user_id">) {
    if (!client || !userId) {
      reportError("Fitness Plans are unavailable while Health is offline.");
      return null;
    }
    const normalizedInput = normalizePlanItemInput(input);
    const { data, error: insertError } = await client
      .from("adhdice_health_fitness_plan_items")
      .insert({ ...normalizedInput, user_id: userId })
      .select("*")
      .single();
    if (insertError || !data) {
      reportError(insertError?.message ?? "Planned workout item could not be created.");
      return null;
    }
    setPlanItems((current) => [...current, data]);
    setError(null);
    return data;
  }

  async function updatePlanItem(itemId: string, input: HealthFitnessPlanItemUpdate) {
    if (!client || !userId) {
      reportError("Fitness Plans are unavailable while Health is offline.");
      return false;
    }
    const normalizedInput = {
      ...input,
      ...(input.notes === undefined ? {} : { notes: input.notes?.trim() || null }),
      ...(input.title === undefined ? {} : { title: input.title?.trim() || null }),
      ...(input.workout_type === undefined ? {} : { workout_type: input.workout_type.trim() }),
    };
    const { data, error: updateError } = await client
      .from("adhdice_health_fitness_plan_items")
      .update(normalizedInput)
      .eq("id", itemId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (updateError || !data) {
      reportError(updateError?.message ?? "Planned workout item could not be updated.");
      return false;
    }
    setPlanItems((current) => current.map((item) => item.id === itemId ? data : item));
    setError(null);
    return true;
  }

  async function archivePlanItem(itemId: string) {
    return updatePlanItem(itemId, { archived_at: new Date().toISOString() });
  }

  async function saveWorkoutPlanItemLinks(workoutId: string, planItemIds: readonly string[]) {
    if (!client || !userId) {
      reportError("Fitness Plan associations are unavailable while Health is offline.");
      return false;
    }

    const desiredIds = [...new Set(planItemIds)];
    const existingLinks = workoutPlanItemLinks.filter((link) => link.workout_id === workoutId);
    const existingIds = new Set(existingLinks.map((link) => link.plan_item_id));
    const desiredIdSet = new Set(desiredIds);
    const additions = desiredIds.filter((planItemId) => !existingIds.has(planItemId));
    const removals = existingLinks.filter((link) => !desiredIdSet.has(link.plan_item_id));
    let nextLinks = workoutPlanItemLinks;

    if (additions.length > 0) {
      const inserts: HealthWorkoutPlanItemLinkInsert[] = additions.map((planItemId) => ({
        plan_item_id: planItemId,
        user_id: userId,
        workout_id: workoutId,
      }));
      const { data, error: insertError } = await client
        .from("adhdice_health_workout_plan_item_links")
        .insert(inserts)
        .select("*");
      if (insertError) {
        reportError(`Workout saved, but Fitness Plan associations could not be added. ${insertError.message}`);
        return false;
      }
      const insertedLinks = data ?? inserts.map((insert) => ({
        ...insert,
        created_at: new Date().toISOString(),
        id: createLocalId("health-workout-plan-link"),
      }));
      nextLinks = [...nextLinks, ...insertedLinks];
      setWorkoutPlanItemLinks(nextLinks);
    }

    if (removals.length > 0) {
      const { error: deleteError } = await client
        .from("adhdice_health_workout_plan_item_links")
        .delete()
        .eq("user_id", userId)
        .eq("workout_id", workoutId)
        .in("plan_item_id", removals.map((link) => link.plan_item_id));
      if (deleteError) {
        reportError(`Workout saved, but some Fitness Plan associations could not be removed. ${deleteError.message}`);
        void reload();
        return false;
      }
      const removalIds = new Set(removals.map((link) => link.id));
      nextLinks = nextLinks.filter((link) => !removalIds.has(link.id));
      setWorkoutPlanItemLinks(nextLinks);
    }

    setError(null);
    return true;
  }

  return {
    archivePlan,
    archivePlanItem,
    createPlan,
    createPlanItem,
    error,
    isLoading,
    planItems,
    plans,
    reload,
    saveWorkoutPlanItemLinks,
    updatePlan,
    updatePlanItem,
    workoutPlanItemLinks,
  };
}

"use client";

import { useEffect, useRef, useState } from "react";

import type { EconomyState } from "@/hooks/useEconomy";
import type { AppendEconomyEventOpts } from "@/hooks/useEconomy";
import type {
  HealthAchievementAward,
  HealthAchievementAwardInsert,
  HealthCheckIn,
  HealthCheckInInsert,
  HealthFoodLibraryItem,
  HealthFoodLibraryItemInsert,
  HealthImportAudit,
  HealthImportAuditInsert,
  HealthMealEntry,
  HealthMealEntryInsert,
  HealthMealEntryUpdate,
  HealthMetricEntry,
  HealthMetricEntryInsert,
  HealthProfile,
  HealthProfileUpdate,
  HealthRecipe,
  HealthRecipeInsert,
  HealthSavedMeal,
  HealthSavedMealInsert,
  HealthWaterEntry,
  HealthWaterEntryInsert,
  HealthWaterEntryUpdate,
  HealthWeightEntry,
  HealthWeightEntryInsert,
} from "@/lib/database.types";
import type { AppleHealthImportPreview } from "@/lib/health-apple-import";
import {
  buildDefaultHealthProfile,
  getEligibleHealthAchievements,
  type HealthAchievementCode,
} from "@/lib/health-utils";
import {
  getHealthFoodIdentityKey,
  normalizeHealthFoodLibraryInput,
  normalizeHealthFoodLibraryItem,
  setHealthFoodFavoriteStatus,
} from "@/lib/health-library";
import type { createBrowserSupabaseClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (message: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;
export type HealthImportSaveProgress = {
  completed: number;
  message: string;
  phase: "audit" | "complete" | "metrics" | "weights";
  total: number;
};

type HealthStateSnapshot = {
  awards: HealthAchievementAward[];
  checkIns: HealthCheckIn[];
  favorites: HealthFoodLibraryItem[];
  importAudits: HealthImportAudit[];
  mealEntries: HealthMealEntry[];
  metricEntries: HealthMetricEntry[];
  profile: HealthProfile;
  recipes: HealthRecipe[];
  savedMeals: HealthSavedMeal[];
  waterEntries: HealthWaterEntry[];
  weightEntries: HealthWeightEntry[];
};

function buildEmptyState(userId: string): HealthStateSnapshot {
  return {
    awards: [],
    checkIns: [],
    favorites: [],
    importAudits: [],
    mealEntries: [],
    metricEntries: [],
    profile: buildDefaultHealthProfile(userId),
    recipes: [],
    savedMeals: [],
    waterEntries: [],
    weightEntries: [],
  };
}

function isMissingHealthPersistence(message: string) {
  return message.includes("adhdice_health_")
    || message.includes("Could not find the table")
    || message.includes("does not exist")
    || message.includes("schema cache");
}

function storageKey(userId: string, suffix: string) {
  return `adhdice-health:${userId}:${suffix}`;
}

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function readLocalHealthState(userId: string) {
  const emptyState = buildEmptyState(userId);
  return {
    awards: readStoredJson(storageKey(userId, "awards"), emptyState.awards),
    checkIns: readStoredJson(storageKey(userId, "checkins"), emptyState.checkIns),
    favorites: readStoredJson<HealthFoodLibraryItem[]>(storageKey(userId, "favorites"), emptyState.favorites)
      .map(normalizeHealthFoodLibraryItem),
    importAudits: readStoredJson(storageKey(userId, "imports"), emptyState.importAudits),
    mealEntries: readStoredJson(storageKey(userId, "meals"), emptyState.mealEntries),
    metricEntries: readStoredJson(storageKey(userId, "metrics"), emptyState.metricEntries),
    profile: readStoredJson(storageKey(userId, "profile"), emptyState.profile),
    recipes: readStoredJson(storageKey(userId, "recipes"), emptyState.recipes),
    savedMeals: readStoredJson(storageKey(userId, "saved-meals"), emptyState.savedMeals),
    waterEntries: readStoredJson(storageKey(userId, "water"), emptyState.waterEntries),
    weightEntries: readStoredJson(storageKey(userId, "weights"), emptyState.weightEntries),
  } satisfies HealthStateSnapshot;
}

function persistLocalHealthState(state: HealthStateSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  const {
    profile,
    checkIns,
    mealEntries,
    favorites,
    recipes,
    savedMeals,
    waterEntries,
    weightEntries,
    metricEntries,
    importAudits,
    awards,
  } = state;
  window.localStorage.setItem(storageKey(profile.user_id, "profile"), JSON.stringify(profile));
  window.localStorage.setItem(storageKey(profile.user_id, "checkins"), JSON.stringify(checkIns));
  window.localStorage.setItem(storageKey(profile.user_id, "meals"), JSON.stringify(mealEntries));
  window.localStorage.setItem(storageKey(profile.user_id, "favorites"), JSON.stringify(favorites));
  window.localStorage.setItem(storageKey(profile.user_id, "recipes"), JSON.stringify(recipes));
  window.localStorage.setItem(storageKey(profile.user_id, "saved-meals"), JSON.stringify(savedMeals));
  window.localStorage.setItem(storageKey(profile.user_id, "water"), JSON.stringify(waterEntries));
  window.localStorage.setItem(storageKey(profile.user_id, "weights"), JSON.stringify(weightEntries));
  window.localStorage.setItem(storageKey(profile.user_id, "metrics"), JSON.stringify(metricEntries));
  window.localStorage.setItem(storageKey(profile.user_id, "imports"), JSON.stringify(importAudits));
  window.localStorage.setItem(storageKey(profile.user_id, "awards"), JSON.stringify(awards));
}

function buildHealthSnapshot({
  awards,
  checkIns,
  favorites,
  importAudits,
  mealEntries,
  metricEntries,
  profile,
  recipes,
  savedMeals,
  waterEntries,
  weightEntries,
}: HealthStateSnapshot) {
  return {
    awards,
    checkIns,
    favorites,
    importAudits,
    mealEntries,
    metricEntries,
    profile,
    recipes,
    savedMeals,
    waterEntries,
    weightEntries,
  } satisfies HealthStateSnapshot;
}

function createLocalId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useHealth(
  client: SupabaseClient,
  userId: string | null,
  setMessage: SetMessage,
  appendEconomyEvent: (opts: AppendEconomyEventOpts) => Promise<void>,
  setEconomy: (updater: EconomyState | ((current: EconomyState) => EconomyState)) => void,
  active = true,
) {
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [checkIns, setCheckIns] = useState<HealthCheckIn[]>([]);
  const [mealEntries, setMealEntries] = useState<HealthMealEntry[]>([]);
  const [favorites, setFavorites] = useState<HealthFoodLibraryItem[]>([]);
  const [weightEntries, setWeightEntries] = useState<HealthWeightEntry[]>([]);
  const [metricEntries, setMetricEntries] = useState<HealthMetricEntry[]>([]);
  const [recipes, setRecipes] = useState<HealthRecipe[]>([]);
  const [savedMeals, setSavedMeals] = useState<HealthSavedMeal[]>([]);
  const [waterEntries, setWaterEntries] = useState<HealthWaterEntry[]>([]);
  const [importAudits, setImportAudits] = useState<HealthImportAudit[]>([]);
  const [awards, setAwards] = useState<HealthAchievementAward[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [storageMode, setStorageMode] = useState<"local" | "remote">("local");
  const healthSnapshotRef = useRef<HealthStateSnapshot | null>(null);
  const healthFoodMutationRevisionRef = useRef(0);

  function applySnapshot(snapshot: HealthStateSnapshot) {
    healthSnapshotRef.current = snapshot;
    setProfile(snapshot.profile);
    setCheckIns(snapshot.checkIns);
    setMealEntries(snapshot.mealEntries);
    setFavorites(snapshot.favorites);
    setWeightEntries(snapshot.weightEntries);
    setMetricEntries(snapshot.metricEntries);
    setRecipes(snapshot.recipes);
    setSavedMeals(snapshot.savedMeals);
    setWaterEntries(snapshot.waterEntries);
    setImportAudits(snapshot.importAudits);
    setAwards(snapshot.awards);
    persistLocalHealthState(snapshot);
  }

  async function claimEligibleAwards(
    snapshot: HealthStateSnapshot,
    options?: { persistRemotely?: boolean; silent?: boolean },
  ) {
    const eligible = getEligibleHealthAchievements({
      awards: snapshot.awards,
      checkIns: snapshot.checkIns,
      mealEntries: snapshot.mealEntries,
      metricEntries: snapshot.metricEntries,
      weightEntries: snapshot.weightEntries,
    });

    if (eligible.length === 0) {
      return snapshot;
    }

    const nextAwards = [...snapshot.awards];
    const now = new Date().toISOString();

    for (const achievement of eligible) {
      const awardRow: HealthAchievementAward = {
        achievement_code: achievement.code,
        awarded_points: 0,
        awarded_tokens: achievement.tokens,
        awarded_xp: achievement.xp,
        created_at: now,
        description: achievement.description,
        earned_at: now,
        id: createLocalId(`health-award-${achievement.code}`),
        title: achievement.title,
        user_id: snapshot.profile.user_id,
      };

      let insertedAward = awardRow;
      let usedAtomicRemoteClaim = false;

      if (client && options?.persistRemotely) {
        const rpcClient = client as unknown as {
          rpc: (
            fn: "adhdice_claim_health_achievement",
            params: {
              p_achievement_code: HealthAchievementCode;
              p_awarded_points: number;
              p_awarded_tokens: number;
              p_awarded_xp: number;
              p_description: string;
              p_earned_at: string;
              p_title: string;
              p_user_id: string;
            },
          ) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
        };
        const { data: rpcData, error: rpcError } = await rpcClient.rpc("adhdice_claim_health_achievement", {
          p_achievement_code: achievement.code,
          p_awarded_points: 0,
          p_awarded_tokens: achievement.tokens,
          p_awarded_xp: achievement.xp,
          p_description: achievement.description,
          p_earned_at: now,
          p_title: achievement.title,
          p_user_id: snapshot.profile.user_id,
        });

        const rpcRow = Array.isArray(rpcData) ? (rpcData[0] as Record<string, unknown> | null) : null;
        if (!rpcError && rpcRow && rpcRow.created === true) {
          usedAtomicRemoteClaim = true;
          insertedAward = {
            ...awardRow,
            earned_at: typeof rpcRow.earned_at === "string" ? rpcRow.earned_at : now,
            id: typeof rpcRow.award_id === "string" ? rpcRow.award_id : awardRow.id,
          };
          setEconomy({
            level: typeof rpcRow.level === "number" ? rpcRow.level : 1,
            points: 0,
            tokens: typeof rpcRow.tokens === "number" ? rpcRow.tokens : 0,
            xp: typeof rpcRow.xp === "number" ? rpcRow.xp : 0,
          });
        } else if (!rpcError && rpcRow && rpcRow.created === false) {
          continue;
        } else {
          const payload: HealthAchievementAwardInsert = {
            achievement_code: achievement.code,
            awarded_points: 0,
            awarded_tokens: achievement.tokens,
            awarded_xp: achievement.xp,
            description: achievement.description,
            earned_at: now,
            title: achievement.title,
            user_id: snapshot.profile.user_id,
          };
          const { data, error } = await client
            .from("adhdice_health_achievement_awards")
            .insert(payload)
            .select("*")
            .single();

          if (error) {
            if (error.message.includes("duplicate") || error.message.includes("unique")) {
              continue;
            }
            continue;
          }

          insertedAward = data ?? awardRow;
        }
      }

      nextAwards.push(insertedAward);
      if (client && options?.persistRemotely && !usedAtomicRemoteClaim) {
        await appendEconomyEvent({
          points: 0,
          reason: `Health achievement: ${achievement.title}`,
          refId: insertedAward.id,
          source: "health",
          xp: achievement.xp,
        });
      }
    }

    if (nextAwards.length === snapshot.awards.length) {
      return snapshot;
    }

    const nextSnapshot = buildHealthSnapshot({ ...snapshot, awards: nextAwards });
    applySnapshot(nextSnapshot);
    if (!options?.silent) {
      setMessage({
        tone: "good",
        text: `Unlocked ${nextAwards.length - snapshot.awards.length} health achievement${nextAwards.length - snapshot.awards.length === 1 ? "" : "s"}.`,
      });
    }
    return nextSnapshot;
  }

  useEffect(() => {
    if (!userId) {
      healthSnapshotRef.current = null;
      setProfile(null);
      setCheckIns([]);
      setMealEntries([]);
      setFavorites([]);
      setWeightEntries([]);
      setMetricEntries([]);
      setRecipes([]);
      setSavedMeals([]);
      setWaterEntries([]);
      setImportAudits([]);
      setAwards([]);
      setStorageMode("local");
      return;
    }

    if (!active) return;

    const localState = readLocalHealthState(userId);
    applySnapshot(localState);

    if (!client) {
      setStorageMode("local");
      return;
    }

    let isActive = true;
    setIsLoading(true);
    const foodMutationRevisionAtFetchStart = healthFoodMutationRevisionRef.current;

    void (async () => {
      const [
        profileResult,
        checkInsResult,
        mealEntriesResult,
        favoritesResult,
        recipesResult,
        savedMealsResult,
        waterEntriesResult,
        weightEntriesResult,
        metricEntriesResult,
        importAuditsResult,
        awardsResult,
      ] = await Promise.all([
        client.from("adhdice_health_profiles").select("*").eq("user_id", userId).maybeSingle(),
        client.from("adhdice_health_checkins").select("*").eq("user_id", userId).order("entry_date", { ascending: false }),
        client.from("adhdice_health_meal_entries").select("*").eq("user_id", userId).order("logged_at", { ascending: false }),
        client.from("adhdice_health_food_library").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        client.from("adhdice_health_recipes").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        client.from("adhdice_health_saved_meals").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        client.from("adhdice_health_water_entries").select("*").eq("user_id", userId).order("logged_at", { ascending: false }),
        client.from("adhdice_health_weight_entries").select("*").eq("user_id", userId).order("logged_at", { ascending: false }),
        client.from("adhdice_health_metric_entries").select("*").eq("user_id", userId).order("metric_date", { ascending: false }),
        client.from("adhdice_health_import_audits").select("*").eq("user_id", userId).order("started_at", { ascending: false }),
        client.from("adhdice_health_achievement_awards").select("*").eq("user_id", userId).order("earned_at", { ascending: false }),
      ]);

      if (!isActive) {
        return;
      }

      const errors = [
        profileResult.error,
        checkInsResult.error,
        mealEntriesResult.error,
        favoritesResult.error,
        recipesResult.error,
        savedMealsResult.error,
        waterEntriesResult.error,
        weightEntriesResult.error,
        metricEntriesResult.error,
        importAuditsResult.error,
        awardsResult.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        const firstError = errors[0];
        if (firstError && isMissingHealthPersistence(firstError.message)) {
          setStorageMode("local");
          setMessage({
            text: "Health is running in local mode until its Supabase tables are migrated. Apply the base Health migration, then the 7.5.22, 7.7.0, and 7.7.1 Health migrations.",
            tone: "neutral",
          });
        } else if (firstError) {
          setMessage({ tone: "warn", text: firstError.message });
        }
        setIsLoading(false);
        return;
      }

      const remoteSnapshot = buildHealthSnapshot({
        awards: awardsResult.data ?? [],
        checkIns: checkInsResult.data ?? [],
        favorites: (favoritesResult.data ?? []).map(normalizeHealthFoodLibraryItem),
        importAudits: importAuditsResult.data ?? [],
        mealEntries: mealEntriesResult.data ?? [],
        metricEntries: metricEntriesResult.data ?? [],
        profile: profileResult.data ?? buildDefaultHealthProfile(userId),
        recipes: recipesResult.data ?? [],
        savedMeals: savedMealsResult.data ?? [],
        waterEntries: waterEntriesResult.data ?? [],
        weightEntries: weightEntriesResult.data ?? [],
      });
      const currentSnapshot = healthSnapshotRef.current;
      const hydratedFavorites = currentSnapshot
        && healthFoodMutationRevisionRef.current !== foodMutationRevisionAtFetchStart
        ? [...new Map([
          ...remoteSnapshot.favorites.map((food) => [food.id, food] as const),
          ...currentSnapshot.favorites.map((food) => [food.id, food] as const),
        ]).values()]
        : remoteSnapshot.favorites;
      const snapshotToApply = hydratedFavorites === remoteSnapshot.favorites
        ? remoteSnapshot
        : buildHealthSnapshot({ ...remoteSnapshot, favorites: hydratedFavorites });
      setStorageMode("remote");
      applySnapshot(snapshotToApply);
      await claimEligibleAwards(snapshotToApply, { persistRemotely: true, silent: true });
      setIsLoading(false);
    })();

    return () => {
      isActive = false;
    };
  }, [active, client, userId]);

  async function saveProfile(updates: HealthProfileUpdate) {
    if (!userId || !profile) {
      return false;
    }

    const nextProfile: HealthProfile = {
      ...profile,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (client && storageMode === "remote") {
      const { error } = await client
        .from("adhdice_health_profiles")
        .upsert({
          ...updates,
          user_id: userId,
        });
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }

    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile: nextProfile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Health goals saved." });
    return true;
  }

  async function saveCheckIn(input: Omit<HealthCheckInInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }

    const now = new Date().toISOString();
    const localRow: HealthCheckIn = {
      created_at: now,
      energy_score: input.energy_score ?? null,
      entry_date: input.entry_date,
      id: input.id ?? createLocalId("health-checkin"),
      mood_score: input.mood_score ?? null,
      reflection: input.reflection ?? "",
      symptom_tags: input.symptom_tags ?? [],
      updated_at: now,
      user_id: userId,
    };

    let nextRow = localRow;
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_checkins")
        .upsert({
          ...input,
          user_id: userId,
        }, { onConflict: "user_id,entry_date" })
        .select("*")
        .single();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ?? localRow;
    }

    const nextCheckIns = [
      ...checkIns.filter((entry) => entry.entry_date !== nextRow.entry_date),
      nextRow,
    ].sort((left, right) => right.entry_date.localeCompare(left.entry_date));
    const nextSnapshot = buildHealthSnapshot({
      awards,
      checkIns: nextCheckIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    });
    applySnapshot(nextSnapshot);
    await claimEligibleAwards(nextSnapshot, { persistRemotely: storageMode === "remote" });
    setMessage({ tone: "good", text: "Daily check-in saved." });
    return true;
  }

  async function addMealEntry(input: Omit<HealthMealEntryInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }

    const now = new Date().toISOString();
    const localRow: HealthMealEntry = {
      attribution: input.attribution ?? null,
      barcode: input.barcode ?? null,
      brand_name: input.brand_name ?? null,
      calories: input.calories,
      carbs_g: input.carbs_g ?? null,
      created_at: now,
      entry_date: input.entry_date,
      fat_g: input.fat_g ?? null,
      food_name: input.food_name,
      id: input.id ?? createLocalId("health-meal"),
      logged_at: input.logged_at ?? now,
      meal_slot: input.meal_slot,
      protein_g: input.protein_g ?? null,
      provider: input.provider ?? "manual",
      provider_item_id: input.provider_item_id ?? null,
      serving_label: input.serving_label ?? null,
      source_food_id: input.source_food_id ?? null,
      consumed_quantity: input.consumed_quantity ?? null,
      consumed_unit: input.consumed_unit ?? null,
      serving_fraction: input.serving_fraction ?? null,
      food_snapshot: input.food_snapshot ?? null,
      nutrition_snapshot: input.nutrition_snapshot ?? null,
      updated_at: now,
      user_id: userId,
    };

    let nextRow = localRow;
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_meal_entries")
        .insert({
          ...input,
          user_id: userId,
        })
        .select("*")
        .single();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ?? localRow;
    }

    const nextMealEntries = [nextRow, ...mealEntries].sort((left, right) => right.logged_at.localeCompare(left.logged_at));
    const nextSnapshot = buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries: nextMealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    });
    applySnapshot(nextSnapshot);
    await claimEligibleAwards(nextSnapshot, { persistRemotely: storageMode === "remote" });
    setMessage({ tone: "good", text: "Meal saved." });
    return true;
  }

  async function deleteMealEntry(entryId: string) {
    if (!profile) {
      return false;
    }

    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_meal_entries").delete().eq("id", entryId);
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }

    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries: mealEntries.filter((entry) => entry.id !== entryId),
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Meal removed." });
    return true;
  }

  async function updateMealEntry(entryId: string, input: HealthMealEntryUpdate) {
    if (!userId || !profile) {
      return false;
    }

    const now = new Date().toISOString();
    const currentEntry = mealEntries.find((entry) => entry.id === entryId);
    if (!currentEntry) {
      return false;
    }

    const localRow: HealthMealEntry = {
      ...currentEntry,
      ...input,
      updated_at: now,
    };

    let nextRow = localRow;
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_meal_entries")
        .update(input)
        .eq("id", entryId)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ?? localRow;
    }

    const nextMealEntries = mealEntries
      .map((entry) => entry.id === entryId ? nextRow : entry)
      .sort((left, right) => right.logged_at.localeCompare(left.logged_at));
    const nextSnapshot = buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries: nextMealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    });
    applySnapshot(nextSnapshot);
    await claimEligibleAwards(nextSnapshot, { persistRemotely: storageMode === "remote" });
    setMessage({ tone: "good", text: "Meal updated." });
    return true;
  }

  async function saveFavoriteFood(input: Omit<HealthFoodLibraryItemInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }

    const currentFavorites = healthSnapshotRef.current?.favorites ?? favorites;
    let normalizedInput = input;
    const incomingIdentityKey = getHealthFoodIdentityKey(normalizedInput);
    const duplicateFavorite = incomingIdentityKey
      ? currentFavorites.find((item) => item.id !== normalizedInput.id && getHealthFoodIdentityKey(item) === incomingIdentityKey)
      : null;
    if (duplicateFavorite) {
      if (!normalizedInput.is_favorite || duplicateFavorite.is_favorite) {
        setMessage({ tone: "neutral", text: "That food is already in your library." });
        return true;
      }
      normalizedInput = { ...normalizedInput, id: duplicateFavorite.id };
    }
    const existingFood = normalizedInput.id
      ? currentFavorites.find((item) => item.id === normalizedInput.id)
      : null;
    normalizedInput = {
      ...normalizeHealthFoodLibraryInput(normalizedInput),
      is_favorite: normalizedInput.is_favorite ?? existingFood?.is_favorite ?? false,
    };

    const now = new Date().toISOString();
    healthFoodMutationRevisionRef.current += 1;
    const localRow: HealthFoodLibraryItem = {
      attribution: normalizedInput.attribution ?? null,
      barcode: normalizedInput.barcode ?? null,
      brand_name: normalizedInput.brand_name ?? null,
      calories: normalizedInput.calories,
      category: normalizedInput.category ?? normalizedInput.food_category ?? "Uncategorized",
      carbs_g: normalizedInput.carbs_g ?? null,
      created_at: now,
      fat_g: normalizedInput.fat_g ?? null,
      food_name: normalizedInput.food_name,
      id: normalizedInput.id ?? createLocalId("health-food"),
      is_favorite: normalizedInput.is_favorite ?? false,
      food_category: normalizedInput.food_category ?? normalizedInput.category ?? "Uncategorized",
      protein_g: normalizedInput.protein_g ?? null,
      provider: normalizedInput.provider ?? "manual",
      provider_item_id: normalizedInput.provider_item_id ?? null,
      serving_label: normalizedInput.serving_label ?? null,
      serving_size: normalizedInput.serving_size ?? normalizedInput.serving_label ?? null,
      serving_quantity: normalizedInput.serving_quantity ?? 1,
      serving_unit: normalizedInput.serving_unit ?? "serving",
      serving_measure_value: normalizedInput.serving_measure_value ?? null,
      serving_measure_unit: normalizedInput.serving_measure_unit ?? null,
      serving_weight_amount: normalizedInput.serving_weight_amount ?? null,
      serving_weight_unit: normalizedInput.serving_weight_unit ?? null,
      updated_at: now,
      user_id: userId,
    };

    let nextRow = localRow;
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_food_library")
        .upsert({
          ...normalizedInput,
          user_id: userId,
        })
        .select("*")
        .single();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ? normalizeHealthFoodLibraryItem(data) : localRow;
    }

    const currentSnapshot = healthSnapshotRef.current ?? buildHealthSnapshot({
      awards,
      checkIns,
      favorites: currentFavorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    });
    const nextFavorites = [
      ...currentSnapshot.favorites.filter((item) => item.id !== nextRow.id),
      nextRow,
    ].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    applySnapshot(buildHealthSnapshot({ ...currentSnapshot, favorites: nextFavorites }));
    setMessage({
      tone: "good",
      text: nextRow.is_favorite ? "Saved to favorites." : "Custom food saved.",
    });
    return true;
  }

  async function setFavoriteFoodStatus(itemId: string, isFavorite: boolean) {
    if (!userId || !profile) return false;
    const existingFood = favorites.find((item) => item.id === itemId);
    if (!existingFood) return false;

    const localRow = setHealthFoodFavoriteStatus(existingFood, isFavorite, new Date().toISOString());
    let nextRow = localRow;
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_food_library")
        .update({ is_favorite: isFavorite })
        .eq("id", itemId)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ? normalizeHealthFoodLibraryItem(data) : localRow;
    }

    const nextFavorites = [
      ...favorites.filter((item) => item.id !== itemId),
      nextRow,
    ].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites: nextFavorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: isFavorite ? "Saved to favorites." : "Custom food saved." });
    return true;
  }

  async function deleteFavoriteFood(itemId: string) {
    if (!profile) {
      return false;
    }

    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_food_library").delete().eq("id", itemId);
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }

    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites: favorites.filter((entry) => entry.id !== itemId),
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Favorite removed." });
    return true;
  }

  async function saveRecipe(input: Omit<HealthRecipeInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }

    const now = new Date().toISOString();
    const localRow: HealthRecipe = {
      created_at: now,
      id: input.id ?? createLocalId("health-recipe"),
      ingredients: input.ingredients,
      name: input.name,
      notes: input.notes ?? "",
      servings: input.servings,
      updated_at: now,
      user_id: userId,
    };
    let nextRow = localRow;
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_recipes")
        .upsert({ ...input, user_id: userId })
        .select("*")
        .single();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ?? localRow;
    }

    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes: [nextRow, ...recipes.filter((entry) => entry.id !== nextRow.id)]
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
      savedMeals,
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Recipe saved." });
    return true;
  }

  async function deleteRecipe(recipeId: string) {
    if (!profile) {
      return false;
    }
    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_recipes").delete().eq("id", recipeId);
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }
    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes: recipes.filter((entry) => entry.id !== recipeId),
      savedMeals,
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Recipe removed." });
    return true;
  }

  async function saveSavedMeal(input: Omit<HealthSavedMealInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }
    const now = new Date().toISOString();
    const localRow: HealthSavedMeal = {
      created_at: now,
      default_meal_slot: input.default_meal_slot,
      id: input.id ?? createLocalId("health-saved-meal"),
      items: input.items,
      name: input.name,
      updated_at: now,
      user_id: userId,
    };
    let nextRow = localRow;
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_saved_meals")
        .upsert({ ...input, user_id: userId })
        .select("*")
        .single();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ?? localRow;
    }

    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals: [nextRow, ...savedMeals.filter((entry) => entry.id !== nextRow.id)]
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Custom meal saved." });
    return true;
  }

  async function deleteSavedMeal(mealId: string) {
    if (!profile) {
      return false;
    }
    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_saved_meals").delete().eq("id", mealId);
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }
    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals: savedMeals.filter((entry) => entry.id !== mealId),
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Custom meal removed." });
    return true;
  }

  async function addWaterEntry(input: Omit<HealthWaterEntryInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }
    const now = new Date().toISOString();
    const localRow: HealthWaterEntry = {
      amount: input.amount,
      amount_ml: input.amount_ml,
      created_at: now,
      entry_date: input.entry_date,
      id: input.id ?? createLocalId("health-water"),
      logged_at: input.logged_at ?? now,
      unit: input.unit,
      user_id: userId,
    };
    let nextRow = localRow;
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_water_entries")
        .insert({ ...input, user_id: userId })
        .select("*")
        .single();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ?? localRow;
    }
    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries: [nextRow, ...waterEntries].sort((left, right) => right.logged_at.localeCompare(left.logged_at)),
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Water added." });
    return true;
  }

  async function deleteWaterEntry(entryId: string) {
    if (!profile) {
      return false;
    }
    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_water_entries").delete().eq("id", entryId);
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }
    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries: waterEntries.filter((entry) => entry.id !== entryId),
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Water entry removed." });
    return true;
  }

  async function updateWaterEntry(entryId: string, input: HealthWaterEntryUpdate) {
    if (!profile) {
      return false;
    }
    const existingEntry = waterEntries.find((entry) => entry.id === entryId);
    if (!existingEntry) {
      setMessage({ tone: "warn", text: "Water entry was not found." });
      return false;
    }
    let nextEntry: HealthWaterEntry = {
      ...existingEntry,
      ...input,
    };
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_water_entries")
        .update(input)
        .eq("id", entryId)
        .select("*")
        .single();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextEntry = data ?? nextEntry;
    }
    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries: waterEntries
        .map((entry) => (entry.id === entryId ? nextEntry : entry))
        .sort((left, right) => right.logged_at.localeCompare(left.logged_at)),
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Water entry updated." });
    return true;
  }

  async function addWeightEntry(input: Omit<HealthWeightEntryInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }

    const now = new Date().toISOString();
    const localRow: HealthWeightEntry = {
      created_at: now,
      entry_date: input.entry_date,
      id: input.id ?? createLocalId("health-weight"),
      logged_at: input.logged_at ?? now,
      note: input.note ?? null,
      source: input.source ?? "manual",
      updated_at: now,
      user_id: userId,
      weight_kg: input.weight_kg,
    };

    let nextRow = localRow;
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_weight_entries")
        .insert({
          ...input,
          user_id: userId,
        })
        .select("*")
        .single();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ?? localRow;
    }

    const nextWeightEntries = [nextRow, ...weightEntries].sort((left, right) => right.logged_at.localeCompare(left.logged_at));
    const nextSnapshot = buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries: nextWeightEntries,
    });
    applySnapshot(nextSnapshot);
    await claimEligibleAwards(nextSnapshot, { persistRemotely: storageMode === "remote" });
    setMessage({ tone: "good", text: "Weight saved." });
    return true;
  }

  async function importAppleHealthData(
    preview: AppleHealthImportPreview,
    options?: { onProgress?: (progress: HealthImportSaveProgress) => void },
  ) {
    if (!userId || !profile) {
      return false;
    }

    const existingFingerprints = new Set(metricEntries.map((entry) => entry.source_fingerprint));
    const freshMetricInputs = preview.metricEntries.filter((entry) => !existingFingerprints.has(entry.source_fingerprint));
    const existingWeightFingerprints = new Set(
      weightEntries.map((entry) => `${entry.entry_date}|${entry.logged_at}|${Number(entry.weight_kg.toFixed(4))}`),
    );
    const freshWeightInputs = preview.weightEntries.filter((entry) => {
      const fingerprint = `${entry.entry_date}|${entry.logged_at}|${Number(entry.weight_kg.toFixed(4))}`;
      return !existingWeightFingerprints.has(fingerprint);
    });

    const now = new Date().toISOString();
    const localMetricRows: HealthMetricEntry[] = freshMetricInputs.map((entry) => ({
      created_at: now,
      id: createLocalId("health-metric"),
      metric_date: entry.metric_date,
      metric_type: entry.metric_type,
      metric_value: entry.metric_value,
      source: entry.source ?? "apple_health_import",
      source_fingerprint: entry.source_fingerprint,
      updated_at: now,
      user_id: userId,
    }));
    const localWeightRows: HealthWeightEntry[] = freshWeightInputs.map((entry) => ({
      created_at: now,
      entry_date: entry.entry_date,
      id: createLocalId("health-weight-import"),
      logged_at: entry.logged_at ?? now,
      note: entry.note ?? "Imported from Apple Health",
      source: entry.source ?? "apple_health_import",
      updated_at: now,
      user_id: userId,
      weight_kg: entry.weight_kg,
    }));

    const auditPayload: HealthImportAuditInsert = {
      completed_at: now,
      duplicate_count: preview.metricEntries.length - freshMetricInputs.length,
      import_end_date: preview.endDate,
      imported_count: freshMetricInputs.length,
      import_start_date: preview.startDate,
      skipped_count: preview.skippedCount + preview.unsupportedCount + preview.malformedCount,
      source: "apple_health_import",
      started_at: now,
      summary_text: `${preview.fileName}: ${preview.sampleCount} samples parsed.`,
      user_id: userId,
    };

    let insertedMetricRows = localMetricRows;
    let insertedWeightRows = localWeightRows;
    let insertedAudit: HealthImportAudit = {
      completed_at: now,
      created_at: now,
      duplicate_count: auditPayload.duplicate_count ?? 0,
      id: createLocalId("health-import-audit"),
      imported_count: auditPayload.imported_count ?? 0,
      import_end_date: auditPayload.import_end_date ?? null,
      import_start_date: auditPayload.import_start_date ?? null,
      skipped_count: auditPayload.skipped_count ?? 0,
      source: auditPayload.source,
      started_at: auditPayload.started_at ?? now,
      summary_text: auditPayload.summary_text ?? null,
      user_id: userId,
    };

    const totalWrites = freshMetricInputs.length + freshWeightInputs.length + 1;
    let completedWrites = 0;
    const reportProgress = (phase: HealthImportSaveProgress["phase"], message: string) => {
      options?.onProgress?.({
        completed: completedWrites,
        message,
        phase,
        total: totalWrites,
      });
    };
    const advanceProgress = (phase: HealthImportSaveProgress["phase"], message: string, amount = 1) => {
      completedWrites += amount;
      reportProgress(phase, message);
    };

    reportProgress("metrics", freshMetricInputs.length > 0 ? "Saving imported metrics..." : "No new metrics to save.");

    if (client && storageMode === "remote") {
      if (freshMetricInputs.length > 0) {
        const metricRows: HealthMetricEntry[] = [];
        const metricChunkSize = 150;
        for (let index = 0; index < freshMetricInputs.length; index += metricChunkSize) {
          const chunk = freshMetricInputs
            .slice(index, index + metricChunkSize)
            .map((entry) => ({ ...entry, user_id: userId }) satisfies HealthMetricEntryInsert);
          const { data: metricData, error: metricError } = await client
            .from("adhdice_health_metric_entries")
            .insert(chunk)
            .select("*");
          if (metricError) {
            setMessage({ tone: "warn", text: metricError.message });
            return false;
          }
          metricRows.push(...(metricData ?? []));
          advanceProgress(
            "metrics",
            `Saved ${Math.min(index + chunk.length, freshMetricInputs.length)} of ${freshMetricInputs.length} imported metrics.`,
            chunk.length,
          );
        }
        insertedMetricRows = metricRows.length > 0 ? metricRows : localMetricRows;
      }
      if (freshMetricInputs.length === 0) {
        advanceProgress("metrics", "No new metrics found in this import.", 0);
      }

      reportProgress("weights", freshWeightInputs.length > 0 ? "Saving imported weigh-ins..." : "No new weigh-ins to save.");
      if (freshWeightInputs.length > 0) {
        const weightRows: HealthWeightEntry[] = [];
        const weightChunkSize = 100;
        for (let index = 0; index < freshWeightInputs.length; index += weightChunkSize) {
          const chunk = freshWeightInputs.slice(index, index + weightChunkSize).map((entry) => ({ ...entry, user_id: userId }));
          const { data: weightData, error: weightError } = await client
            .from("adhdice_health_weight_entries")
            .insert(chunk)
            .select("*");
          if (weightError) {
            setMessage({ tone: "warn", text: weightError.message });
            return false;
          }
          weightRows.push(...(weightData ?? []));
          advanceProgress(
            "weights",
            `Saved ${Math.min(index + chunk.length, freshWeightInputs.length)} of ${freshWeightInputs.length} imported weigh-ins.`,
            chunk.length,
          );
        }
        insertedWeightRows = weightRows.length > 0 ? weightRows : localWeightRows;
      }
      if (freshWeightInputs.length === 0) {
        advanceProgress("weights", "No new weigh-ins found in this import.", 0);
      }

      reportProgress("audit", "Saving import summary...");
      const { data: auditData, error: auditError } = await client
        .from("adhdice_health_import_audits")
        .insert(auditPayload)
        .select("*")
        .single();
      if (auditError) {
        setMessage({ tone: "warn", text: auditError.message });
        return false;
      }
      insertedAudit = auditData ?? insertedAudit;
      advanceProgress("audit", "Import summary saved.");
    } else {
      completedWrites = totalWrites;
      reportProgress("complete", "Import saved locally.");
    }

    const nextSnapshot = buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits: [insertedAudit, ...importAudits].sort((left, right) => right.started_at.localeCompare(left.started_at)),
      mealEntries,
      metricEntries: [...insertedMetricRows, ...metricEntries].sort((left, right) => right.metric_date.localeCompare(left.metric_date)),
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries: [...insertedWeightRows, ...weightEntries].sort((left, right) => right.logged_at.localeCompare(left.logged_at)),
    });
    applySnapshot(nextSnapshot);
    await claimEligibleAwards(nextSnapshot, { persistRemotely: storageMode === "remote" });
    options?.onProgress?.({
      completed: totalWrites,
      message: `Import saved with ${freshMetricInputs.length} new metrics and ${auditPayload.duplicate_count ?? 0} duplicates skipped.`,
      phase: "complete",
      total: totalWrites,
    });
    setMessage({
      tone: "good",
      text: `Apple Health import saved ${freshMetricInputs.length} metric ${freshMetricInputs.length === 1 ? "entry" : "entries"}${auditPayload.duplicate_count ? ` and skipped ${auditPayload.duplicate_count} duplicates` : ""}.`,
    });
    return true;
  }

  async function deleteWeightEntry(entryId: string) {
    if (!profile) {
      return false;
    }

    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_weight_entries").delete().eq("id", entryId);
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }

    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries: weightEntries.filter((entry) => entry.id !== entryId),
    }));
    setMessage({ tone: "good", text: "Weight entry removed." });
    return true;
  }

  return {
    awards,
    checkIns,
    deleteFavoriteFood,
    deleteMealEntry,
    deleteRecipe,
    deleteSavedMeal,
    deleteWaterEntry,
    deleteWeightEntry,
    favorites,
    importAudits,
    isLoading,
    importAppleHealthData,
    mealEntries,
    metricEntries,
    profile,
    recipes,
    saveCheckIn,
    saveFavoriteFood,
    setFavoriteFoodStatus,
    saveRecipe,
    savedMeals,
    saveSavedMeal,
    saveProfile,
    addMealEntry,
    addWaterEntry,
    addWeightEntry,
    updateWaterEntry,
    updateMealEntry,
    storageMode,
    waterEntries,
    weightEntries,
  };
}

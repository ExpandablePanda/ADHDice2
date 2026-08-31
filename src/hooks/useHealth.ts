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
  HealthJournalSignal,
  HealthJournalSignalInsert,
  HealthJournalSignalUpdate,
  HealthJournalSignalValue,
  HealthMealEntry,
  HealthMealEntryInsert,
  HealthMealEntryUpdate,
  HealthMealPlanEntry,
  HealthMealPlanEntryInsert,
  HealthMealPlanEntryUpdate,
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
  HealthWorkout,
  HealthWorkoutInsert,
  HealthWorkoutUpdate,
  HealthWeightEntry,
  HealthWeightEntryInsert,
  HealthSymptom,
  HealthSymptomEntry,
  HealthSymptomEntryInsert,
  HealthSymptomEntryUpdate,
  HealthSymptomInsert,
  HealthSymptomUpdate,
} from "@/lib/database.types";
import type { AppleHealthImportPreview } from "@/lib/health-apple-import";
import {
  buildDefaultHealthProfile,
  getEligibleHealthAchievements,
  normalizeHealthSymptom,
  normalizeHealthSymptomColor,
  normalizeHealthSymptomName,
  normalizeHealthSymptomNote,
  normalizeHealthProfile,
  reconcileHealthSymptoms,
  sortHealthSymptomEntries,
  sortHealthSymptoms,
  todayHealthDate,
  type HealthAchievementCode,
} from "@/lib/health-utils";
import {
  DEFAULT_HEALTH_JOURNAL_HIGH_LABEL,
  DEFAULT_HEALTH_JOURNAL_LOW_LABEL,
  getHealthJournalSignalDisplayName,
  normalizeHealthJournalLabel,
  normalizeHealthJournalScore,
  normalizeHealthJournalScaleLabels,
  normalizeHealthJournalSignal,
  sortHealthJournalSignals,
  type HealthJournalDraftValue,
} from "@/lib/health-journal";
import {
  getHealthFoodIdentityKey,
  normalizeHealthWaterEntry,
  normalizeHealthFoodLibraryInput,
  normalizeHealthFoodLibraryItem,
  setHealthFoodFavoriteStatus,
} from "@/lib/health-library";
import {
  reconcileHealthWorkouts,
  sortHealthWorkouts,
  validateHealthWorkoutEditableInput,
} from "@/lib/health-fitness";
import {
  buildActualMealEntryInputFromPlan,
  clearCompletedHealthMealPlanPendingMutations,
  clearHealthMealPlanPendingMutation,
  isHealthMealPlanConfirmEligible,
  normalizeHealthMealPlanPendingMutations,
  recordHealthMealPlanPendingDelete,
  recordHealthMealPlanPendingUpsert,
  replayHealthMealPlanPendingMutations,
  sortHealthMealPlans,
  type HealthMealPlanPendingMutation,
  type HealthMealPlanPendingMutationJournal,
} from "@/lib/health-meal-planning";
import type { createBrowserSupabaseClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (message: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;
export type HealthImportSaveProgress = {
  completed: number;
  message: string;
  phase: "audit" | "complete" | "metrics" | "weights";
  total: number;
};

export type HealthJournalEntrySaveInput = {
  checkIn: Omit<HealthCheckInInsert, "user_id">;
  signalValues: HealthJournalDraftValue[];
  symptomOccurrences: Omit<HealthSymptomEntryInsert, "user_id">[];
};

type HealthStateSnapshot = {
  awards: HealthAchievementAward[];
  checkIns: HealthCheckIn[];
  journalSignals: HealthJournalSignal[];
  journalSignalValues: HealthJournalSignalValue[];
  favorites: HealthFoodLibraryItem[];
  importAudits: HealthImportAudit[];
  mealEntries: HealthMealEntry[];
  mealPlanEntries: HealthMealPlanEntry[];
  metricEntries: HealthMetricEntry[];
  profile: HealthProfile;
  recipes: HealthRecipe[];
  savedMeals: HealthSavedMeal[];
  symptomEntries: HealthSymptomEntry[];
  symptoms: HealthSymptom[];
  waterEntries: HealthWaterEntry[];
  workouts: HealthWorkout[];
  weightEntries: HealthWeightEntry[];
};

type LocalHealthState = {
  snapshot: HealthStateSnapshot;
  mealPlanPendingMutations: HealthMealPlanPendingMutationJournal;
};

function buildEmptyState(userId: string): HealthStateSnapshot {
  return {
    awards: [],
    checkIns: [],
    journalSignals: [],
    journalSignalValues: [],
    favorites: [],
    importAudits: [],
    mealEntries: [],
    mealPlanEntries: [],
    metricEntries: [],
    profile: buildDefaultHealthProfile(userId),
    recipes: [],
    savedMeals: [],
    symptomEntries: [],
    symptoms: [],
    waterEntries: [],
    workouts: [],
    weightEntries: [],
  };
}

function isMissingHealthPersistence(message: string) {
  return message.includes("adhdice_health_")
    || message.includes("Could not find the table")
    || message.includes("does not exist")
    || message.includes("schema cache");
}

function isMissingHealthSymptomPersistence(message: string) {
  return message.includes("Could not find the table")
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

function normalizeHealthCheckIn(checkIn: HealthCheckIn): HealthCheckIn {
  return {
    ...checkIn,
    clarity_score: checkIn.clarity_score ?? null,
    stress_score: checkIn.stress_score ?? null,
    symptom_tags: Array.isArray(checkIn.symptom_tags) ? checkIn.symptom_tags : [],
    reflection: typeof checkIn.reflection === "string" ? checkIn.reflection : "",
  };
}

function normalizeHealthSymptomEntry(entry: HealthSymptomEntry): HealthSymptomEntry {
  return { ...entry, journal_entry_id: entry.journal_entry_id ?? null };
}

function readLocalHealthState(userId: string): LocalHealthState {
  const emptyState = buildEmptyState(userId);
  const snapshot: HealthStateSnapshot = {
    awards: readStoredJson(storageKey(userId, "awards"), emptyState.awards),
    checkIns: readStoredJson<HealthCheckIn[]>(storageKey(userId, "checkins"), emptyState.checkIns).map(normalizeHealthCheckIn),
    journalSignals: readStoredJson<HealthJournalSignal[]>(storageKey(userId, "journal-signals"), emptyState.journalSignals)
      .map(normalizeHealthJournalSignal)
      .sort(sortHealthJournalSignals),
    journalSignalValues: readStoredJson<HealthJournalSignalValue[]>(storageKey(userId, "journal-signal-values"), emptyState.journalSignalValues),
    favorites: readStoredJson<HealthFoodLibraryItem[]>(storageKey(userId, "favorites"), emptyState.favorites)
      .map(normalizeHealthFoodLibraryItem),
    importAudits: readStoredJson(storageKey(userId, "imports"), emptyState.importAudits),
    mealEntries: readStoredJson(storageKey(userId, "meals"), emptyState.mealEntries),
    mealPlanEntries: readStoredJson(storageKey(userId, "meal-plans"), emptyState.mealPlanEntries),
    metricEntries: readStoredJson(storageKey(userId, "metrics"), emptyState.metricEntries),
    profile: normalizeHealthProfile(
      readStoredJson<Partial<HealthProfile> | null>(storageKey(userId, "profile"), null),
      userId,
    ),
    recipes: readStoredJson(storageKey(userId, "recipes"), emptyState.recipes),
    savedMeals: readStoredJson(storageKey(userId, "saved-meals"), emptyState.savedMeals),
    symptomEntries: sortHealthSymptomEntries(readStoredJson<HealthSymptomEntry[]>(storageKey(userId, "symptom-entries"), emptyState.symptomEntries).map(normalizeHealthSymptomEntry)),
    symptoms: sortHealthSymptoms(readStoredJson<HealthSymptom[]>(storageKey(userId, "symptoms"), emptyState.symptoms).map(normalizeHealthSymptom)),
    waterEntries: readStoredJson<HealthWaterEntry[]>(storageKey(userId, "water"), emptyState.waterEntries)
      .map(normalizeHealthWaterEntry),
    workouts: sortHealthWorkouts(readStoredJson(storageKey(userId, "workouts"), emptyState.workouts)),
    weightEntries: readStoredJson(storageKey(userId, "weights"), emptyState.weightEntries),
  };
  const mealPlanPendingMutations = normalizeHealthMealPlanPendingMutations(
    readStoredJson<unknown>(storageKey(userId, "meal-plan-pending-mutations"), {}),
  );
  return {
    snapshot: {
      ...snapshot,
      mealPlanEntries: replayHealthMealPlanPendingMutations(snapshot.mealPlanEntries, mealPlanPendingMutations, userId),
    },
    mealPlanPendingMutations,
  };
}

function persistLocalHealthState(state: HealthStateSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  const {
    profile,
    checkIns,
    journalSignals,
    journalSignalValues,
    mealEntries,
    mealPlanEntries,
    favorites,
    recipes,
    savedMeals,
    waterEntries,
    weightEntries,
    metricEntries,
    importAudits,
    awards,
    workouts,
    symptoms,
    symptomEntries,
  } = state;
  window.localStorage.setItem(storageKey(profile.user_id, "profile"), JSON.stringify(profile));
  window.localStorage.setItem(storageKey(profile.user_id, "checkins"), JSON.stringify(checkIns));
  window.localStorage.setItem(storageKey(profile.user_id, "journal-signals"), JSON.stringify(journalSignals));
  window.localStorage.setItem(storageKey(profile.user_id, "journal-signal-values"), JSON.stringify(journalSignalValues));
  window.localStorage.setItem(storageKey(profile.user_id, "meals"), JSON.stringify(mealEntries));
  window.localStorage.setItem(storageKey(profile.user_id, "meal-plans"), JSON.stringify(mealPlanEntries));
  window.localStorage.setItem(storageKey(profile.user_id, "favorites"), JSON.stringify(favorites));
  window.localStorage.setItem(storageKey(profile.user_id, "recipes"), JSON.stringify(recipes));
  window.localStorage.setItem(storageKey(profile.user_id, "saved-meals"), JSON.stringify(savedMeals));
  window.localStorage.setItem(storageKey(profile.user_id, "water"), JSON.stringify(waterEntries));
  window.localStorage.setItem(storageKey(profile.user_id, "weights"), JSON.stringify(weightEntries));
  window.localStorage.setItem(storageKey(profile.user_id, "metrics"), JSON.stringify(metricEntries));
  window.localStorage.setItem(storageKey(profile.user_id, "imports"), JSON.stringify(importAudits));
  window.localStorage.setItem(storageKey(profile.user_id, "awards"), JSON.stringify(awards));
  window.localStorage.setItem(storageKey(profile.user_id, "workouts"), JSON.stringify(workouts));
  window.localStorage.setItem(storageKey(profile.user_id, "symptoms"), JSON.stringify(symptoms));
  window.localStorage.setItem(storageKey(profile.user_id, "symptom-entries"), JSON.stringify(symptomEntries));
}

function persistHealthMealPlanPendingMutations(userId: string, journal: HealthMealPlanPendingMutationJournal) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKey(userId, "meal-plan-pending-mutations"), JSON.stringify(journal));
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
  const [journalSignals, setJournalSignals] = useState<HealthJournalSignal[]>([]);
  const [journalSignalValues, setJournalSignalValues] = useState<HealthJournalSignalValue[]>([]);
  const [mealEntries, setMealEntries] = useState<HealthMealEntry[]>([]);
  const [mealPlanEntries, setMealPlanEntries] = useState<HealthMealPlanEntry[]>([]);
  const [favorites, setFavorites] = useState<HealthFoodLibraryItem[]>([]);
  const [weightEntries, setWeightEntries] = useState<HealthWeightEntry[]>([]);
  const [metricEntries, setMetricEntries] = useState<HealthMetricEntry[]>([]);
  const [recipes, setRecipes] = useState<HealthRecipe[]>([]);
  const [savedMeals, setSavedMeals] = useState<HealthSavedMeal[]>([]);
  const [symptoms, setSymptoms] = useState<HealthSymptom[]>([]);
  const [symptomEntries, setSymptomEntries] = useState<HealthSymptomEntry[]>([]);
  const [waterEntries, setWaterEntries] = useState<HealthWaterEntry[]>([]);
  const [workouts, setWorkouts] = useState<HealthWorkout[]>([]);
  const [importAudits, setImportAudits] = useState<HealthImportAudit[]>([]);
  const [awards, setAwards] = useState<HealthAchievementAward[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [storageMode, setStorageMode] = useState<"local" | "remote">("local");
  const healthSnapshotRef = useRef<HealthStateSnapshot | null>(null);
  const healthFoodMutationRevisionRef = useRef(0);
  const workoutRemoteEnabledRef = useRef(true);
  const mealPlanRemoteEnabledRef = useRef(true);
  const symptomDefinitionsRemoteEnabledRef = useRef(true);
  const symptomEntriesRemoteEnabledRef = useRef(true);
  const journalRemoteEnabledRef = useRef(true);
  const mealPlanPendingMutationsRef = useRef<HealthMealPlanPendingMutationJournal>({});

  function recordMealPlanPendingMutation(mutation: HealthMealPlanPendingMutation) {
    const currentJournal = mealPlanPendingMutationsRef.current;
    const nextJournal = mutation.operation === "upsert"
      ? recordHealthMealPlanPendingUpsert(currentJournal, mutation.plan)
      : recordHealthMealPlanPendingDelete(currentJournal, mutation.planId);
    mealPlanPendingMutationsRef.current = nextJournal;
    if (userId) {
      persistHealthMealPlanPendingMutations(userId, nextJournal);
    }
  }

  function clearMealPlanPendingMutation(planId: string) {
    const nextJournal = clearHealthMealPlanPendingMutation(mealPlanPendingMutationsRef.current, planId);
    if (nextJournal === mealPlanPendingMutationsRef.current) {
      return;
    }
    mealPlanPendingMutationsRef.current = nextJournal;
    if (userId) {
      persistHealthMealPlanPendingMutations(userId, nextJournal);
    }
  }

  function buildHealthSnapshot(
    snapshot: Omit<HealthStateSnapshot, "workouts" | "mealPlanEntries" | "symptoms" | "symptomEntries" | "journalSignals" | "journalSignalValues"> & {
      mealPlanEntries?: HealthMealPlanEntry[];
      journalSignals?: HealthJournalSignal[];
      journalSignalValues?: HealthJournalSignalValue[];
      symptomEntries?: HealthSymptomEntry[];
      symptoms?: HealthSymptom[];
      workouts?: HealthWorkout[];
    },
  ) {
    return {
      ...snapshot,
      mealPlanEntries: snapshot.mealPlanEntries ?? healthSnapshotRef.current?.mealPlanEntries ?? [],
      journalSignals: snapshot.journalSignals ?? healthSnapshotRef.current?.journalSignals ?? [],
      journalSignalValues: snapshot.journalSignalValues ?? healthSnapshotRef.current?.journalSignalValues ?? [],
      symptomEntries: snapshot.symptomEntries ?? healthSnapshotRef.current?.symptomEntries ?? [],
      symptoms: snapshot.symptoms ?? healthSnapshotRef.current?.symptoms ?? [],
      workouts: snapshot.workouts ?? healthSnapshotRef.current?.workouts ?? [],
    } satisfies HealthStateSnapshot;
  }

  function applySnapshot(snapshot: HealthStateSnapshot) {
    healthSnapshotRef.current = snapshot;
    setProfile(snapshot.profile);
    setCheckIns(snapshot.checkIns);
    setJournalSignals([...snapshot.journalSignals].sort(sortHealthJournalSignals));
    setJournalSignalValues(snapshot.journalSignalValues);
    setMealEntries(snapshot.mealEntries);
    setMealPlanEntries([...snapshot.mealPlanEntries].sort(sortHealthMealPlans));
    setFavorites(snapshot.favorites);
    setWeightEntries(snapshot.weightEntries);
    setMetricEntries(snapshot.metricEntries);
    setRecipes(snapshot.recipes);
    setSavedMeals(snapshot.savedMeals);
    setSymptoms(sortHealthSymptoms(snapshot.symptoms));
    setSymptomEntries(sortHealthSymptomEntries(snapshot.symptomEntries));
    setWaterEntries(snapshot.waterEntries);
    setWorkouts(sortHealthWorkouts(snapshot.workouts));
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
      setJournalSignals([]);
      setJournalSignalValues([]);
      setMealEntries([]);
      setMealPlanEntries([]);
      setFavorites([]);
      setWeightEntries([]);
      setMetricEntries([]);
      setRecipes([]);
      setSavedMeals([]);
      setSymptoms([]);
      setSymptomEntries([]);
      setWaterEntries([]);
      setWorkouts([]);
      setImportAudits([]);
      setAwards([]);
      setStorageMode("local");
      workoutRemoteEnabledRef.current = true;
      mealPlanRemoteEnabledRef.current = true;
      symptomDefinitionsRemoteEnabledRef.current = true;
      symptomEntriesRemoteEnabledRef.current = true;
      journalRemoteEnabledRef.current = true;
      mealPlanPendingMutationsRef.current = {};
      return;
    }

    if (!active) return;

    symptomDefinitionsRemoteEnabledRef.current = true;
    symptomEntriesRemoteEnabledRef.current = true;
    journalRemoteEnabledRef.current = true;
    const localState = readLocalHealthState(userId);
    mealPlanPendingMutationsRef.current = localState.mealPlanPendingMutations;
    applySnapshot(localState.snapshot);

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
        journalSignalsResult,
        journalSignalValuesResult,
        mealEntriesResult,
        mealPlanEntriesResult,
        favoritesResult,
        recipesResult,
        savedMealsResult,
        symptomsResult,
        symptomEntriesResult,
        waterEntriesResult,
        weightEntriesResult,
        metricEntriesResult,
        workoutsResult,
        importAuditsResult,
        awardsResult,
      ] = await Promise.all([
        client.from("adhdice_health_profiles").select("*").eq("user_id", userId).maybeSingle(),
        client.from("adhdice_health_checkins").select("*").eq("user_id", userId).order("entry_date", { ascending: false }),
        client.from("adhdice_health_journal_signals").select("*").eq("user_id", userId).order("in_template", { ascending: false }).order("template_sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
        client.from("adhdice_health_journal_signal_values").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        client.from("adhdice_health_meal_entries").select("*").eq("user_id", userId).order("logged_at", { ascending: false }),
        client.from("adhdice_health_meal_plan_entries").select("*").eq("user_id", userId).order("planned_date", { ascending: true }).order("planned_time", { ascending: true }),
        client.from("adhdice_health_food_library").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        client.from("adhdice_health_recipes").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        client.from("adhdice_health_saved_meals").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        client.from("adhdice_health_symptoms").select("*").eq("user_id", userId).order("archived_at", { ascending: true, nullsFirst: true }).order("name", { ascending: true }),
        client.from("adhdice_health_symptom_entries").select("*").eq("user_id", userId).order("logged_at", { ascending: false }),
        client.from("adhdice_health_water_entries").select("*").eq("user_id", userId).order("logged_at", { ascending: false }),
        client.from("adhdice_health_weight_entries").select("*").eq("user_id", userId).order("logged_at", { ascending: false }),
        client.from("adhdice_health_metric_entries").select("*").eq("user_id", userId).order("metric_date", { ascending: false }),
        client.from("adhdice_health_workouts").select("*").eq("user_id", userId).order("workout_date", { ascending: false }).order("started_at", { ascending: false }),
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

      const symptomPersistenceErrors = [symptomsResult.error, symptomEntriesResult.error].filter(Boolean);
      const journalPersistenceErrors = [journalSignalsResult.error, journalSignalValuesResult.error].filter(Boolean);
      symptomDefinitionsRemoteEnabledRef.current = !symptomsResult.error;
      symptomEntriesRemoteEnabledRef.current = !symptomEntriesResult.error;
      journalRemoteEnabledRef.current = journalPersistenceErrors.length === 0;

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

      workoutRemoteEnabledRef.current = !workoutsResult.error;
      mealPlanRemoteEnabledRef.current = !mealPlanEntriesResult.error;
      if (mealPlanEntriesResult.error && isMissingHealthPersistence(mealPlanEntriesResult.error.message)) {
        setMessage({
          text: "Meal planning is using local storage until the 7.11.61 meal-planning migration is applied. Existing Health data remains connected.",
          tone: "neutral",
        });
      } else if (mealPlanEntriesResult.error) {
        setMessage({ tone: "warn", text: mealPlanEntriesResult.error.message });
      }
      if (workoutsResult.error && !isMissingHealthPersistence(workoutsResult.error.message)) {
        setMessage({ tone: "warn", text: workoutsResult.error.message });
      } else if (workoutsResult.error) {
        setMessage({
          text: "Fitness workouts are running in local mode until the 7.11.33 Fitness migration is applied. Existing Health data remains connected.",
          tone: "neutral",
        });
      }

      if (symptomPersistenceErrors.length > 0) {
        const hasMissingSymptomPersistence = symptomPersistenceErrors.some((error) => error && isMissingHealthSymptomPersistence(error.message));
        setMessage({
          text: hasMissingSymptomPersistence
            ? "Symptom tracking is using local storage until the 7.12.7 and 7.12.21 Health Journal migrations are applied. Existing Health data remains connected."
            : symptomPersistenceErrors[0]?.message ?? "Symptom tracking could not connect and is using local storage.",
          tone: hasMissingSymptomPersistence ? "neutral" : "warn",
        });
      }

      if (journalPersistenceErrors.length > 0) {
        const hasMissingJournalPersistence = journalPersistenceErrors.some((error) => error && isMissingHealthPersistence(error.message));
        setMessage({
          text: hasMissingJournalPersistence
            ? "Journal Daily Log is using local storage until the 7.12.34 Health Journal migration is applied."
            : journalPersistenceErrors[0]?.message ?? "Journal Daily Log could not connect and is using local storage.",
          tone: hasMissingJournalPersistence ? "neutral" : "warn",
        });
      }

      const latestLocalSymptoms = healthSnapshotRef.current?.symptoms ?? localState.snapshot.symptoms;
      const latestLocalSymptomEntries = healthSnapshotRef.current?.symptomEntries ?? localState.snapshot.symptomEntries;
      let remoteSymptoms = symptomsResult.data ?? [];
      let remoteSymptomEntries = symptomEntriesResult.data ?? [];
      let symptomRecovery = reconcileHealthSymptoms(
        latestLocalSymptoms,
        remoteSymptoms,
        latestLocalSymptomEntries,
        remoteSymptomEntries,
      );
      let symptomDefinitionRecoveryError: { message: string } | null = null;
      let symptomEntryRecoveryError: { message: string } | null = null;

      if (!isActive) {
        return;
      }
      if (!symptomsResult.error && symptomRecovery.unreconciledLocalSymptoms.length > 0) {
        const { data, error } = await client
          .from("adhdice_health_symptoms")
          .upsert(
            symptomRecovery.unreconciledLocalSymptoms.map((symptom) => ({
              archived_at: symptom.archived_at,
              color: symptom.color,
              created_at: symptom.created_at,
              id: symptom.id,
              name: symptom.name,
              updated_at: symptom.updated_at,
              user_id: userId,
            })),
            { onConflict: "id" },
          )
          .select("*");
        if (!isActive) {
          return;
        }
        if (error) {
          symptomDefinitionRecoveryError = error;
          symptomDefinitionsRemoteEnabledRef.current = false;
          symptomEntriesRemoteEnabledRef.current = false;
        } else {
          remoteSymptoms = [...remoteSymptoms, ...(data && data.length > 0 ? data : symptomRecovery.unreconciledLocalSymptoms)];
          symptomRecovery = reconcileHealthSymptoms(
            latestLocalSymptoms,
            remoteSymptoms,
            latestLocalSymptomEntries,
            remoteSymptomEntries,
          );
        }
      }

      if (!isActive) {
        return;
      }
      if (!symptomsResult.error && !symptomDefinitionRecoveryError && !symptomEntriesResult.error) {
        if (symptomRecovery.unreconciledLocalEntries.length > 0) {
          const { data, error } = await client
            .from("adhdice_health_symptom_entries")
            .upsert(
              symptomRecovery.unreconciledLocalEntries.map((entry) => ({
                created_at: entry.created_at,
                entry_date: entry.entry_date,
                id: entry.id,
                journal_entry_id: entry.journal_entry_id,
                logged_at: entry.logged_at,
                note: entry.note,
                severity: entry.severity,
                symptom_id: entry.symptom_id,
                updated_at: entry.updated_at,
                user_id: userId,
              })),
              { onConflict: "id" },
            )
            .select("*");
          if (!isActive) {
            return;
          }
          if (error) {
            symptomEntryRecoveryError = error;
            symptomEntriesRemoteEnabledRef.current = false;
          } else {
            remoteSymptomEntries = [...remoteSymptomEntries, ...(data && data.length > 0 ? data : symptomRecovery.unreconciledLocalEntries)];
          }
        }
      }

      if (symptomDefinitionRecoveryError) {
        setMessage({
          tone: "warn",
          text: `Local symptom definitions remain visible; remote recovery will retry on the next Health hydration: ${symptomDefinitionRecoveryError.message}`,
        });
      } else if (symptomEntryRecoveryError) {
        setMessage({
          tone: "warn",
          text: `Local symptom entries remain visible; remote recovery will retry on the next Health hydration: ${symptomEntryRecoveryError.message}`,
        });
      }

      const currentLocalSymptoms = healthSnapshotRef.current?.symptoms ?? latestLocalSymptoms;
      const currentLocalSymptomEntries = healthSnapshotRef.current?.symptomEntries ?? latestLocalSymptomEntries;
      symptomRecovery = reconcileHealthSymptoms(
        currentLocalSymptoms,
        remoteSymptoms,
        currentLocalSymptomEntries,
        remoteSymptomEntries,
      );

      if (!isActive) {
        return;
      }

      const latestLocalJournalSignals = healthSnapshotRef.current?.journalSignals ?? localState.snapshot.journalSignals;
      const latestLocalJournalSignalValues = healthSnapshotRef.current?.journalSignalValues ?? localState.snapshot.journalSignalValues;
      let remoteJournalSignals = (journalSignalsResult.data ?? []).map(normalizeHealthJournalSignal);
      let remoteJournalSignalValues = journalSignalValuesResult.data ?? [];
      let journalRecoveryError: { message: string } | null = null;

      if (journalPersistenceErrors.length === 0) {
        const remoteSignalIds = new Set(remoteJournalSignals.map((signal) => signal.id));
        const localSignalsToRecover = latestLocalJournalSignals.filter((signal) => !remoteSignalIds.has(signal.id));
        if (localSignalsToRecover.length > 0) {
          const { data, error } = await client
            .from("adhdice_health_journal_signals")
            .upsert(localSignalsToRecover.map((signal) => ({
              archived_at: signal.archived_at,
              color: signal.color,
              high_label: signal.high_label,
              id: signal.id,
              in_template: signal.in_template,
              kind: signal.kind,
              low_label: signal.low_label,
              name: signal.name,
              scale_labels: signal.scale_labels,
              symptom_id: signal.symptom_id,
              template_sort_order: signal.template_sort_order,
              user_id: userId,
            })), { onConflict: "id" })
            .select("*");
          if (!isActive) return;
          if (error) {
            journalRecoveryError = error;
          } else {
            remoteJournalSignals = [...remoteJournalSignals, ...(data ?? localSignalsToRecover).map(normalizeHealthJournalSignal)];
          }
        }

        const remoteValueIds = new Set(remoteJournalSignalValues.map((value) => value.id));
        const localValuesToRecover = latestLocalJournalSignalValues.filter((value) => !remoteValueIds.has(value.id));
        if (!journalRecoveryError && localValuesToRecover.length > 0) {
          const { data, error } = await client
            .from("adhdice_health_journal_signal_values")
            .upsert(localValuesToRecover.map((value) => ({ ...value, user_id: userId })), { onConflict: "id" })
            .select("*");
          if (!isActive) return;
          if (error) {
            journalRecoveryError = error;
          } else {
            remoteJournalSignalValues = [...remoteJournalSignalValues, ...(data ?? localValuesToRecover)];
          }
        }
      }

      if (journalRecoveryError) {
        journalRemoteEnabledRef.current = false;
        setMessage({
          tone: "warn",
          text: `Local Journal Daily Log changes remain visible; remote recovery will retry on the next Health hydration: ${journalRecoveryError.message}`,
        });
      }

      const currentLocalJournalSignals = healthSnapshotRef.current?.journalSignals ?? latestLocalJournalSignals;
      const currentLocalJournalSignalValues = healthSnapshotRef.current?.journalSignalValues ?? latestLocalJournalSignalValues;

      const remoteWorkouts = sortHealthWorkouts(workoutsResult.data ?? []);
      const latestLocalWorkouts = healthSnapshotRef.current?.workouts ?? localState.snapshot.workouts;
      const workoutRecovery = workoutsResult.error
        ? { mergedWorkouts: latestLocalWorkouts, unreconciledLocalWorkouts: [] }
        : reconcileHealthWorkouts(latestLocalWorkouts, remoteWorkouts);

      if (!isActive) {
        return;
      }
      if (!workoutsResult.error && workoutRecovery.unreconciledLocalWorkouts.length > 0) {
        const { error: recoveryError } = await client
          .from("adhdice_health_workouts")
          .upsert(
            workoutRecovery.unreconciledLocalWorkouts.map((workout) => ({ ...workout, user_id: userId })),
            { ignoreDuplicates: true, onConflict: "id" },
          );
        if (!isActive) {
          return;
        }
        if (recoveryError) {
          workoutRemoteEnabledRef.current = false;
          setMessage({
            tone: "warn",
            text: "Fitness workout recovery could not finish. The local workout is still visible and will be retried.",
          });
        }
      }

      const pendingMealPlanMutations = mealPlanPendingMutationsRef.current;
      const completedMealPlanMutations: { planId: string; mutation: HealthMealPlanPendingMutation }[] = [];
      let mealPlanRecoveryError: { message: string } | null = null;
      if (!mealPlanEntriesResult.error) {
        for (const [planId, mutation] of Object.entries(pendingMealPlanMutations)) {
          if (!isActive) {
            return;
          }
          const result = mutation.operation === "upsert"
            ? await client
              .from("adhdice_health_meal_plan_entries")
              .upsert({ ...mutation.plan, user_id: userId }, { onConflict: "id" })
            : await client
              .from("adhdice_health_meal_plan_entries")
              .delete()
              .eq("id", mutation.planId)
              .eq("user_id", userId);
          if (!isActive) {
            return;
          }
          if (result.error) {
            mealPlanRecoveryError ??= result.error;
          } else {
            completedMealPlanMutations.push({ planId, mutation });
          }
        }
        const nextPendingMealPlanMutations = clearCompletedHealthMealPlanPendingMutations(
          mealPlanPendingMutationsRef.current,
          completedMealPlanMutations,
        );
        mealPlanPendingMutationsRef.current = nextPendingMealPlanMutations;
        persistHealthMealPlanPendingMutations(userId, nextPendingMealPlanMutations);
        if (mealPlanRecoveryError) {
          mealPlanRemoteEnabledRef.current = false;
          setMessage({
            tone: "warn",
            text: "Meal Plan recovery could not finish. Your local Meal Plan changes remain visible and will be retried.",
          });
        }
      }

      const replayedMealPlans = mealPlanEntriesResult.error
        ? localState.snapshot.mealPlanEntries
        : replayHealthMealPlanPendingMutations(
          replayHealthMealPlanPendingMutations(
            mealPlanEntriesResult.data ?? [],
            pendingMealPlanMutations,
            userId,
          ),
          mealPlanPendingMutationsRef.current,
          userId,
        );

      if (!isActive) {
        return;
      }

      const remoteSnapshot = buildHealthSnapshot({
        awards: awardsResult.data ?? [],
        checkIns: (checkInsResult.data ?? []).map(normalizeHealthCheckIn),
        journalSignals: journalSignalsResult.error ? currentLocalJournalSignals : remoteJournalSignals,
        journalSignalValues: journalSignalValuesResult.error ? currentLocalJournalSignalValues : remoteJournalSignalValues,
        favorites: (favoritesResult.data ?? []).map(normalizeHealthFoodLibraryItem),
        importAudits: importAuditsResult.data ?? [],
        mealEntries: mealEntriesResult.data ?? [],
        mealPlanEntries: replayedMealPlans,
        metricEntries: metricEntriesResult.data ?? [],
        profile: normalizeHealthProfile(profileResult.data, userId),
        recipes: recipesResult.data ?? [],
        savedMeals: savedMealsResult.data ?? [],
        symptomEntries: symptomEntriesResult.error ? currentLocalSymptomEntries : symptomRecovery.mergedEntries.map(normalizeHealthSymptomEntry),
        symptoms: symptomsResult.error ? currentLocalSymptoms : symptomRecovery.mergedSymptoms,
        waterEntries: (waterEntriesResult.data ?? []).map(normalizeHealthWaterEntry),
        workouts: workoutRecovery.mergedWorkouts,
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

  async function saveJournalEntry(input: HealthJournalEntrySaveInput) {
    if (!userId || !profile) {
      return false;
    }

    const currentSnapshot = healthSnapshotRef.current ?? buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      symptoms,
      symptomEntries,
      waterEntries,
      weightEntries,
    });
    const now = new Date().toISOString();
    const existingRow = currentSnapshot.checkIns.find((entry) =>
      input.checkIn.id ? entry.id === input.checkIn.id : entry.entry_date === input.checkIn.entry_date);
    const localRow: HealthCheckIn = {
      created_at: existingRow?.created_at ?? now,
      energy_score: input.checkIn.energy_score !== undefined ? input.checkIn.energy_score : existingRow?.energy_score ?? null,
      entry_date: input.checkIn.entry_date,
      id: input.checkIn.id ?? existingRow?.id ?? createLocalId("health-checkin"),
      mood_score: input.checkIn.mood_score !== undefined ? input.checkIn.mood_score : existingRow?.mood_score ?? null,
      stress_score: input.checkIn.stress_score !== undefined ? input.checkIn.stress_score : existingRow?.stress_score ?? null,
      clarity_score: input.checkIn.clarity_score !== undefined ? input.checkIn.clarity_score : existingRow?.clarity_score ?? null,
      reflection: input.checkIn.reflection !== undefined ? input.checkIn.reflection : existingRow?.reflection ?? "",
      symptom_tags: input.checkIn.symptom_tags !== undefined ? input.checkIn.symptom_tags : existingRow?.symptom_tags ?? [],
      updated_at: now,
      user_id: userId,
    };

    let nextRow = localRow;
    if (client && storageMode === "remote") {
      const remoteCheckInPayload: HealthCheckInInsert = {
        ...input.checkIn,
        clarity_score: input.checkIn.clarity_score !== undefined ? input.checkIn.clarity_score : existingRow?.clarity_score ?? null,
        energy_score: input.checkIn.energy_score !== undefined ? input.checkIn.energy_score : existingRow?.energy_score ?? null,
        mood_score: input.checkIn.mood_score !== undefined ? input.checkIn.mood_score : existingRow?.mood_score ?? null,
        reflection: input.checkIn.reflection !== undefined ? input.checkIn.reflection : existingRow?.reflection ?? "",
        stress_score: input.checkIn.stress_score !== undefined ? input.checkIn.stress_score : existingRow?.stress_score ?? null,
        symptom_tags: input.checkIn.symptom_tags !== undefined ? input.checkIn.symptom_tags : existingRow?.symptom_tags ?? [],
        user_id: userId,
      };
      const { data, error } = await client
        .from("adhdice_health_checkins")
        .upsert(remoteCheckInPayload, { onConflict: "user_id,entry_date" })
        .select("*")
        .single();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ?? localRow;
    }

    const currentValues = currentSnapshot.journalSignalValues.filter((value) => value.journal_entry_id === nextRow.id);
    if (input.signalValues.some((draft) => !currentSnapshot.journalSignals.some((signal) => signal.id === draft.signal_id))) {
      setMessage({ tone: "warn", text: "Choose valid Daily Log feelings before saving the Journal Entry." });
      return false;
    }
    if (input.signalValues.some((draft) => draft.score !== null && normalizeHealthJournalScore(draft.score) !== draft.score)) {
      setMessage({ tone: "warn", text: "Daily Log scores must be between 0 and 10." });
      return false;
    }
    for (const occurrence of input.symptomOccurrences) {
      const occurrenceSymptom = currentSnapshot.symptoms.find((symptom) => symptom.id === occurrence.symptom_id);
      const isExistingArchivedOccurrence = occurrence.id
        ? currentSnapshot.symptomEntries.some((entry) => entry.id === occurrence.id && entry.journal_entry_id === nextRow.id)
        : false;
      if (!occurrenceSymptom || (occurrenceSymptom.archived_at !== null && !isExistingArchivedOccurrence)) {
        setMessage({ tone: "warn", text: "Choose an active symptom for each occurrence." });
        return false;
      }
      if (!Number.isInteger(occurrence.severity) || occurrence.severity < 1 || occurrence.severity > 10) {
        setMessage({ tone: "warn", text: "Symptom occurrence severity must be between 1 and 10." });
        return false;
      }
    }
    const scoredValues = input.signalValues
      .map((draft) => ({
        draft,
        score: normalizeHealthJournalScore(draft.score),
      }))
      .filter(({ score }) => score !== null)
      .map(({ draft, score }) => {
        const current = currentValues.find((value) => value.signal_id === draft.signal_id);
        return {
          created_at: current?.created_at ?? now,
          id: draft.id ?? current?.id ?? createLocalId("health-journal-value"),
          journal_entry_id: nextRow.id,
          score: score as number,
          signal_id: draft.signal_id,
          updated_at: now,
          user_id: userId,
        } satisfies HealthJournalSignalValue;
      });
    const savedSignalIds = new Set(scoredValues.map((value) => value.signal_id));
    const removedValues = currentValues.filter((value) => !savedSignalIds.has(value.signal_id));

    const currentOwnedOccurrences = currentSnapshot.symptomEntries.filter((entry) => entry.journal_entry_id === nextRow.id);
    const occurrenceRows: HealthSymptomEntry[] = input.symptomOccurrences.map((occurrence) => {
      const current = occurrence.id ? currentOwnedOccurrences.find((entry) => entry.id === occurrence.id) : undefined;
      return {
        created_at: current?.created_at ?? now,
        entry_date: occurrence.entry_date,
        id: occurrence.id ?? current?.id ?? createLocalId("health-symptom-entry"),
        journal_entry_id: nextRow.id,
        logged_at: occurrence.logged_at ?? now,
        note: occurrence.note ?? null,
        severity: occurrence.severity,
        symptom_id: occurrence.symptom_id,
        updated_at: now,
        user_id: userId,
      } satisfies HealthSymptomEntry;
    });
    const keptOccurrenceIds = new Set(occurrenceRows.map((entry) => entry.id));
    const removedOccurrences = currentOwnedOccurrences.filter((entry) => !keptOccurrenceIds.has(entry.id));

    let childWriteError: { message: string } | null = null;
    if (client && storageMode === "remote" && journalRemoteEnabledRef.current) {
      if (scoredValues.length > 0) {
        const { data, error } = await client
          .from("adhdice_health_journal_signal_values")
          .upsert(scoredValues, { onConflict: "user_id,journal_entry_id,signal_id" })
          .select("*");
        if (error) childWriteError = error;
        else if (data) scoredValues.splice(0, scoredValues.length, ...data);
      }
      if (!childWriteError) {
        for (const value of removedValues) {
          const { error } = await client
            .from("adhdice_health_journal_signal_values")
            .delete()
            .eq("id", value.id)
            .eq("user_id", userId);
          if (error) {
            childWriteError = error;
            break;
          }
        }
      }
      if (!childWriteError && occurrenceRows.length > 0) {
        const { data, error } = await client
          .from("adhdice_health_symptom_entries")
          .upsert(occurrenceRows, { onConflict: "id" })
          .select("*");
        if (error) childWriteError = error;
        else if (data) occurrenceRows.splice(0, occurrenceRows.length, ...data);
      }
      if (!childWriteError) {
        for (const entry of removedOccurrences) {
          const { error } = await client
            .from("adhdice_health_symptom_entries")
            .delete()
            .eq("id", entry.id)
            .eq("user_id", userId)
            .eq("journal_entry_id", nextRow.id);
          if (error) {
            childWriteError = error;
            break;
          }
        }
      }
    }

    const nextJournalSignalValues = [
      ...currentSnapshot.journalSignalValues.filter((value) => value.journal_entry_id !== nextRow.id),
      ...scoredValues,
    ];
    const nextSymptomEntries = [
      ...currentSnapshot.symptomEntries.filter((entry) => entry.journal_entry_id !== nextRow.id),
      ...occurrenceRows,
    ];

    const nextCheckIns = [
      ...currentSnapshot.checkIns.filter((entry) => entry.entry_date !== nextRow.entry_date),
      nextRow,
    ].sort((left, right) => right.entry_date.localeCompare(left.entry_date));
    const nextSnapshot = buildHealthSnapshot({
      ...currentSnapshot,
      checkIns: nextCheckIns,
      journalSignalValues: nextJournalSignalValues,
      symptomEntries: sortHealthSymptomEntries(nextSymptomEntries),
    });
    applySnapshot(nextSnapshot);
    if (childWriteError) {
      if (isMissingHealthPersistence(childWriteError.message)) {
        journalRemoteEnabledRef.current = false;
      }
      setMessage({
        tone: "warn",
        text: `Journal Entry core fields were saved, but a Daily Log or symptom occurrence update failed: ${childWriteError.message}`,
      });
      return false;
    }
    await claimEligibleAwards(nextSnapshot, { persistRemotely: storageMode === "remote" });
    setMessage({ tone: "good", text: existingRow ? "Journal Entry updated." : "Journal Entry saved." });
    return true;
  }

  async function saveCheckIn(input: Omit<HealthCheckInInsert, "user_id">) {
    return saveJournalEntry({ checkIn: input, signalValues: [], symptomOccurrences: [] });
  }

  async function createJournalSignal(input: Omit<HealthJournalSignalInsert, "user_id">) {
    if (!userId || !profile) return null;
    const currentSnapshot = healthSnapshotRef.current ?? buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      symptoms,
      symptomEntries,
      waterEntries,
      weightEntries,
    });
    const kind = input.kind;
    const linkedSymptom = input.symptom_id
      ? currentSnapshot.symptoms.find((symptom) => symptom.id === input.symptom_id)
      : null;
    if (kind === "symptom" && (!linkedSymptom || linkedSymptom.archived_at !== null)) {
      setMessage({ tone: "warn", text: "Choose an active canonical symptom." });
      return null;
    }
    const existingSymptomSignal = kind === "symptom"
      ? currentSnapshot.journalSignals.find((signal) => signal.kind === "symptom" && signal.symptom_id === input.symptom_id)
      : null;
    if (existingSymptomSignal) {
      if (existingSymptomSignal.archived_at !== null) {
        const restored = await updateJournalSignal(existingSymptomSignal.id, {
          archived_at: null,
          in_template: input.in_template === true,
          template_sort_order: input.in_template === true ? existingSymptomSignal.template_sort_order : null,
        });
        if (!restored) return null;
        return healthSnapshotRef.current?.journalSignals.find((signal) => signal.id === existingSymptomSignal.id) ?? null;
      }
      return normalizeHealthJournalSignal(existingSymptomSignal);
    }
    const name = kind === "symptom" ? null : normalizeHealthJournalLabel(input.name, "");
    if (kind !== "symptom" && !name) {
      setMessage({ tone: "warn", text: "Enter a Journal feeling name." });
      return null;
    }
    const now = new Date().toISOString();
    const localRow: HealthJournalSignal = normalizeHealthJournalSignal({
      archived_at: null,
      color: kind === "symptom" ? null : input.color,
      created_at: now,
      high_label: normalizeHealthJournalLabel(input.high_label, DEFAULT_HEALTH_JOURNAL_HIGH_LABEL),
      id: input.id ?? createLocalId("health-journal-signal"),
      in_template: input.in_template === true,
      kind,
      low_label: normalizeHealthJournalLabel(input.low_label, DEFAULT_HEALTH_JOURNAL_LOW_LABEL),
      name,
      scale_labels: normalizeHealthJournalScaleLabels(input.scale_labels, kind, input.low_label, input.high_label),
      symptom_id: kind === "symptom" ? input.symptom_id ?? null : null,
      template_sort_order: input.in_template === true
        ? Math.max(-1, ...currentSnapshot.journalSignals.map((signal) => signal.template_sort_order ?? -1)) + 1
        : null,
      updated_at: now,
      user_id: userId,
    });
    let nextRow = localRow;
    if (client && storageMode === "remote" && journalRemoteEnabledRef.current) {
      const { data, error } = await client
        .from("adhdice_health_journal_signals")
        .insert({ ...localRow, user_id: userId })
        .select("*")
        .single();
      if (error) {
        if (isMissingHealthPersistence(error.message)) {
          journalRemoteEnabledRef.current = false;
        } else {
          setMessage({ tone: "warn", text: error.message });
          return null;
        }
      } else {
        nextRow = normalizeHealthJournalSignal(data ?? localRow);
      }
    }
    applySnapshot(buildHealthSnapshot({
      ...currentSnapshot,
      journalSignals: [...currentSnapshot.journalSignals, nextRow].sort(sortHealthJournalSignals),
    }));
    setMessage({ tone: "good", text: `${getHealthJournalSignalDisplayName(nextRow, currentSnapshot.symptoms)} added to Journal Library.` });
    return nextRow;
  }

  async function updateJournalSignal(signalId: string, input: HealthJournalSignalUpdate) {
    if (!userId || !profile) return false;
    const currentSnapshot = healthSnapshotRef.current ?? buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      symptoms,
      symptomEntries,
      waterEntries,
      weightEntries,
    });
    const current = currentSnapshot.journalSignals.find((signal) => signal.id === signalId);
    if (!current) return false;
    const nextScaleLabels = input.scale_labels === undefined
      ? normalizeHealthJournalScaleLabels(current.scale_labels, current.kind).map((label, index) => (
        index === 0
          ? normalizeHealthJournalLabel(input.low_label, label)
          : index === 10
            ? normalizeHealthJournalLabel(input.high_label, label)
            : label
      ))
      : normalizeHealthJournalScaleLabels(input.scale_labels, current.kind);
    const nextRow = normalizeHealthJournalSignal({
      ...current,
      ...input,
      archived_at: input.archived_at === undefined ? current.archived_at : input.archived_at,
      high_label: nextScaleLabels[10] ?? DEFAULT_HEALTH_JOURNAL_HIGH_LABEL,
      kind: current.kind,
      low_label: nextScaleLabels[0] ?? DEFAULT_HEALTH_JOURNAL_LOW_LABEL,
      name: current.kind === "symptom" ? null : normalizeHealthJournalLabel(input.name ?? current.name, ""),
      scale_labels: nextScaleLabels,
      symptom_id: current.kind === "symptom" ? current.symptom_id : null,
      updated_at: new Date().toISOString(),
    });
    if (nextRow.kind !== "symptom" && !nextRow.name) {
      setMessage({ tone: "warn", text: "Enter a Journal feeling name." });
      return false;
    }
    if (client && storageMode === "remote" && journalRemoteEnabledRef.current) {
      const { data, error } = await client
        .from("adhdice_health_journal_signals")
        .update({
          archived_at: nextRow.archived_at,
          color: nextRow.color,
          high_label: nextRow.high_label,
          in_template: nextRow.in_template,
          low_label: nextRow.low_label,
          name: nextRow.name,
          scale_labels: nextRow.scale_labels,
          template_sort_order: nextRow.template_sort_order,
        })
        .eq("id", signalId)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (error) {
        if (isMissingHealthPersistence(error.message)) journalRemoteEnabledRef.current = false;
        else {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
      } else if (data) {
        Object.assign(nextRow, normalizeHealthJournalSignal(data));
      }
    }
    applySnapshot(buildHealthSnapshot({
      ...currentSnapshot,
      journalSignals: currentSnapshot.journalSignals.map((signal) => signal.id === signalId ? nextRow : signal).sort(sortHealthJournalSignals),
    }));
    return true;
  }

  async function setJournalSignalTemplate(signalId: string, inTemplate: boolean) {
    const currentSnapshot = healthSnapshotRef.current;
    const nextOrder = inTemplate
      ? Math.max(-1, ...(currentSnapshot?.journalSignals ?? journalSignals).map((signal) => signal.template_sort_order ?? -1)) + 1
      : null;
    return updateJournalSignal(signalId, { in_template: inTemplate, template_sort_order: nextOrder });
  }

  async function archiveJournalSignal(signalId: string) {
    const saved = await updateJournalSignal(signalId, { archived_at: new Date().toISOString(), in_template: false, template_sort_order: null });
    if (saved) setMessage({ tone: "good", text: "Feeling archived." });
    return saved;
  }

  async function deleteJournalSignal(signalId: string) {
    if (!userId || !profile) return false;
    const currentSnapshot = healthSnapshotRef.current ?? buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      symptoms,
      symptomEntries,
      waterEntries,
      weightEntries,
    });
    if (currentSnapshot.journalSignalValues.some((value) => value.signal_id === signalId)) {
      setMessage({ tone: "warn", text: "This Feeling has history. Archive it instead of deleting it." });
      return false;
    }
    if (client && storageMode === "remote" && journalRemoteEnabledRef.current) {
      const { error } = await client
        .from("adhdice_health_journal_signals")
        .delete()
        .eq("id", signalId)
        .eq("user_id", userId);
      if (error) {
        if (isMissingHealthPersistence(error.message)) journalRemoteEnabledRef.current = false;
        else {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
      }
    }
    applySnapshot(buildHealthSnapshot({
      ...currentSnapshot,
      journalSignals: currentSnapshot.journalSignals.filter((signal) => signal.id !== signalId),
    }));
    setMessage({ tone: "good", text: "Feeling deleted." });
    return true;
  }

  async function reorderJournalSignals(orderedSignalIds: readonly string[]) {
    if (!userId || !profile) return false;
    const currentSnapshot = healthSnapshotRef.current ?? buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      symptoms,
      symptomEntries,
      waterEntries,
      weightEntries,
    });
    const orderById = new Map(orderedSignalIds.map((id, index) => [id, index] as const));
    const nextSignals = currentSnapshot.journalSignals.map((signal) => orderById.has(signal.id)
      ? { ...signal, in_template: true, template_sort_order: orderById.get(signal.id) ?? signal.template_sort_order, updated_at: new Date().toISOString() }
      : signal);
    if (client && storageMode === "remote" && journalRemoteEnabledRef.current) {
      for (const signal of nextSignals.filter((candidate) => orderById.has(candidate.id))) {
        const { error } = await client
          .from("adhdice_health_journal_signals")
          .update({ in_template: true, template_sort_order: signal.template_sort_order })
          .eq("id", signal.id)
          .eq("user_id", userId);
        if (error) {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
      }
    }
    applySnapshot(buildHealthSnapshot({ ...currentSnapshot, journalSignals: nextSignals.sort(sortHealthJournalSignals) }));
    return true;
  }

  async function deleteJournalEntry(entryId: string) {
    if (!userId || !profile) return false;
    if (client && storageMode === "remote") {
      const { error } = await client
        .from("adhdice_health_checkins")
        .delete()
        .eq("id", entryId)
        .eq("user_id", userId);
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }
    const currentSnapshot = healthSnapshotRef.current ?? buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      symptoms,
      symptomEntries,
      waterEntries,
      weightEntries,
    });
    applySnapshot(buildHealthSnapshot({
      ...currentSnapshot,
      checkIns: currentSnapshot.checkIns.filter((entry) => entry.id !== entryId),
      journalSignalValues: currentSnapshot.journalSignalValues.filter((value) => value.journal_entry_id !== entryId),
      symptomEntries: currentSnapshot.symptomEntries.filter((entry) => entry.journal_entry_id !== entryId),
    }));
    setMessage({ tone: "good", text: "Journal Entry deleted." });
    return true;
  }

  async function updateSymptomDefinition(
    symptomId: string,
    input: HealthSymptomUpdate,
    successText: string,
  ) {
    if (!userId || !profile) {
      return false;
    }

    const currentSymptom = symptoms.find((symptom) => symptom.id === symptomId);
    if (!currentSymptom) {
      return false;
    }

    const normalizedInput: HealthSymptomUpdate = {
      ...input,
      ...(input.name === undefined ? {} : { name: normalizeHealthSymptomName(input.name) }),
      ...(input.color === undefined ? {} : { color: normalizeHealthSymptomColor(input.color) }),
    };
    if (normalizedInput.name !== undefined && normalizedInput.name.length === 0) {
      setMessage({ tone: "warn", text: "Enter a symptom name." });
      return false;
    }
    if (
      normalizedInput.name !== undefined
      && currentSymptom.archived_at === null
      && symptoms.some((symptom) =>
        symptom.id !== symptomId
        && symptom.archived_at === null
        && normalizeHealthSymptomName(symptom.name).toLocaleLowerCase() === normalizedInput.name?.toLocaleLowerCase())
    ) {
      setMessage({ tone: "warn", text: "That symptom is already in your active library." });
      return false;
    }

    const now = new Date().toISOString();
    const localRow: HealthSymptom = {
      ...currentSymptom,
      ...normalizedInput,
      color: normalizeHealthSymptomColor(normalizedInput.color ?? currentSymptom.color),
      updated_at: now,
    };
    let nextRow = localRow;
    if (client && storageMode === "remote" && symptomDefinitionsRemoteEnabledRef.current) {
      const { data, error } = await client
        .from("adhdice_health_symptoms")
        .update(normalizedInput)
        .eq("id", symptomId)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (error) {
        if (isMissingHealthSymptomPersistence(error.message)) {
          symptomDefinitionsRemoteEnabledRef.current = false;
          setMessage({
            tone: "neutral",
            text: "Symptom tracking is using local storage until the 7.12.7 and 7.12.21 Health Journal migrations are applied.",
          });
        } else {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
      } else {
        nextRow = data ? normalizeHealthSymptom(data) : localRow;
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
      symptoms: sortHealthSymptoms(symptoms.map((symptom) => symptom.id === symptomId ? nextRow : symptom)),
      symptomEntries,
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: successText });
    return true;
  }

  async function createSymptom(input: Omit<HealthSymptomInsert, "user_id">) {
    if (!userId || !profile) {
      return null;
    }

    const name = normalizeHealthSymptomName(input.name);
    if (!name) {
      setMessage({ tone: "warn", text: "Enter a symptom name." });
      return null;
    }
    if (symptoms.some((symptom) =>
      symptom.archived_at === null
      && normalizeHealthSymptomName(symptom.name).toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setMessage({ tone: "warn", text: "That symptom is already in your active library." });
      return null;
    }

    const now = new Date().toISOString();
    const localRow: HealthSymptom = {
      archived_at: null,
      color: normalizeHealthSymptomColor(input.color),
      created_at: now,
      id: input.id ?? createLocalId("health-symptom"),
      name,
      updated_at: now,
      user_id: userId,
    };
    let nextRow = localRow;
    if (client && storageMode === "remote" && symptomDefinitionsRemoteEnabledRef.current) {
      const { data, error } = await client
        .from("adhdice_health_symptoms")
        .insert({ ...input, archived_at: null, color: localRow.color, name, user_id: userId })
        .select("*")
        .single();
      if (error) {
        if (isMissingHealthSymptomPersistence(error.message)) {
          symptomDefinitionsRemoteEnabledRef.current = false;
          setMessage({
            tone: "neutral",
            text: "Symptom tracking is using local storage until the 7.12.7 and 7.12.21 Health Journal migrations are applied.",
          });
        } else {
          setMessage({ tone: "warn", text: error.message });
          return null;
        }
      } else {
        nextRow = data ? normalizeHealthSymptom(data) : localRow;
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
      symptoms: sortHealthSymptoms([nextRow, ...symptoms]),
      symptomEntries,
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Symptom added." });
    return nextRow;
  }

  async function renameSymptom(symptomId: string, name: string) {
    return updateSymptomDefinition(symptomId, { name }, "Symptom renamed.");
  }

  async function setSymptomColor(symptomId: string, color: string) {
    return updateSymptomDefinition(symptomId, { color: normalizeHealthSymptomColor(color) }, "Symptom color saved.");
  }

  async function archiveSymptom(symptomId: string) {
    return updateSymptomDefinition(symptomId, { archived_at: new Date().toISOString() }, "Symptom archived.");
  }

  async function addSymptomEntry(input: Omit<HealthSymptomEntryInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }
    const currentSymptoms = healthSnapshotRef.current?.symptoms ?? symptoms;
    const currentSymptomEntries = healthSnapshotRef.current?.symptomEntries ?? symptomEntries;
    const symptom = currentSymptoms.find((candidate) => candidate.id === input.symptom_id);
    if (!symptom || symptom.archived_at !== null) {
      setMessage({ tone: "warn", text: "Choose an active symptom." });
      return false;
    }
    if (!Number.isInteger(input.severity) || input.severity < 1 || input.severity > 10) {
      setMessage({ tone: "warn", text: "Choose a severity from 1 to 10." });
      return false;
    }

    const now = new Date().toISOString();
    const localRow: HealthSymptomEntry = {
      created_at: now,
      entry_date: input.entry_date,
      id: input.id ?? createLocalId("health-symptom-entry"),
      journal_entry_id: input.journal_entry_id ?? null,
      logged_at: input.logged_at ?? now,
      note: normalizeHealthSymptomNote(input.note),
      severity: input.severity,
      symptom_id: input.symptom_id,
      updated_at: now,
      user_id: userId,
    };
    let nextRow = localRow;
    const normalizedInput: Omit<HealthSymptomEntryInsert, "user_id"> = {
      ...input,
      note: normalizeHealthSymptomNote(input.note),
    };
    if (client && storageMode === "remote" && symptomEntriesRemoteEnabledRef.current) {
      const { data, error } = await client
        .from("adhdice_health_symptom_entries")
        .insert({ ...normalizedInput, user_id: userId })
        .select("*")
        .single();
      if (error) {
        if (isMissingHealthSymptomPersistence(error.message)) {
          symptomEntriesRemoteEnabledRef.current = false;
          setMessage({
            tone: "neutral",
            text: "Symptom tracking is using local storage until the 7.12.7 and 7.12.21 Health Journal migrations are applied.",
          });
        } else {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
      } else {
        nextRow = data ?? localRow;
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
      symptoms: currentSymptoms,
      symptomEntries: sortHealthSymptomEntries([nextRow, ...currentSymptomEntries]),
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Symptom entry saved." });
    return true;
  }

  async function updateSymptomEntry(entryId: string, input: HealthSymptomEntryUpdate) {
    if (!userId || !profile) {
      return false;
    }
    const currentEntry = symptomEntries.find((entry) => entry.id === entryId);
    if (!currentEntry) {
      return false;
    }
    const nextSymptomId = input.symptom_id ?? currentEntry.symptom_id;
    const symptom = symptoms.find((candidate) => candidate.id === nextSymptomId);
    if (!symptom) {
      setMessage({ tone: "warn", text: "Choose a valid symptom." });
      return false;
    }
    const nextSeverity = input.severity ?? currentEntry.severity;
    if (!Number.isInteger(nextSeverity) || nextSeverity < 1 || nextSeverity > 10) {
      setMessage({ tone: "warn", text: "Choose a severity from 1 to 10." });
      return false;
    }

    const normalizedInput: HealthSymptomEntryUpdate = {
      ...input,
      ...(input.note === undefined ? {} : { note: normalizeHealthSymptomNote(input.note) }),
    };
    const now = new Date().toISOString();
    const localRow: HealthSymptomEntry = {
      ...currentEntry,
      ...normalizedInput,
      severity: nextSeverity,
      symptom_id: nextSymptomId,
      updated_at: now,
    };
    let nextRow = localRow;
    if (client && storageMode === "remote" && symptomEntriesRemoteEnabledRef.current) {
      const { data, error } = await client
        .from("adhdice_health_symptom_entries")
        .update(normalizedInput)
        .eq("id", entryId)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (error) {
        if (isMissingHealthSymptomPersistence(error.message)) {
          symptomEntriesRemoteEnabledRef.current = false;
          setMessage({
            tone: "neutral",
            text: "Symptom tracking is using local storage until the 7.12.7 and 7.12.21 Health Journal migrations are applied.",
          });
        } else {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
      } else {
        nextRow = data ?? localRow;
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
      symptoms,
      symptomEntries: sortHealthSymptomEntries(symptomEntries.map((entry) => entry.id === entryId ? nextRow : entry)),
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Symptom entry updated." });
    return true;
  }

  async function deleteSymptomEntry(entryId: string) {
    if (!userId || !profile) {
      return false;
    }
    if (client && storageMode === "remote" && symptomEntriesRemoteEnabledRef.current) {
      const { error } = await client
        .from("adhdice_health_symptom_entries")
        .delete()
        .eq("id", entryId)
        .eq("user_id", userId);
      if (error) {
        if (isMissingHealthSymptomPersistence(error.message)) {
          symptomEntriesRemoteEnabledRef.current = false;
          setMessage({
            tone: "neutral",
            text: "Symptom tracking is using local storage until the 7.12.7 and 7.12.21 Health Journal migrations are applied.",
          });
        } else {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
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
      symptoms,
      symptomEntries: symptomEntries.filter((entry) => entry.id !== entryId),
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Symptom entry removed." });
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

  async function addMealPlanEntry(input: Omit<HealthMealPlanEntryInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }

    const now = new Date().toISOString();
    const localRow: HealthMealPlanEntry = {
      attribution: input.attribution ?? null,
      barcode: input.barcode ?? null,
      brand_name: input.brand_name ?? null,
      calories: input.calories,
      carbs_g: input.carbs_g ?? null,
      confirmed_at: null,
      confirmed_meal_entry_id: null,
      created_at: now,
      fat_g: input.fat_g ?? null,
      food_name: input.food_name,
      id: input.id ?? createLocalId("health-meal-plan"),
      meal_slot: input.meal_slot,
      nutrition_snapshot: input.nutrition_snapshot ?? null,
      planned_at: input.planned_at,
      planned_date: input.planned_date,
      planned_time: input.planned_time,
      protein_g: input.protein_g ?? null,
      provider: input.provider ?? "manual",
      provider_item_id: input.provider_item_id ?? null,
      serving_fraction: input.serving_fraction ?? null,
      serving_label: input.serving_label ?? null,
      source_food_id: input.source_food_id ?? null,
      consumed_quantity: input.consumed_quantity ?? null,
      consumed_unit: input.consumed_unit ?? null,
      food_snapshot: input.food_snapshot ?? null,
      updated_at: now,
      user_id: userId,
    };

    let nextRow = localRow;
    let persistedRemotely = false;
    if (client && storageMode === "remote" && mealPlanRemoteEnabledRef.current) {
      const { data, error } = await client
        .from("adhdice_health_meal_plan_entries")
        .insert({ ...input, user_id: userId })
        .select("*")
        .single();
      if (error) {
        if (!isMissingHealthPersistence(error.message)) {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
        mealPlanRemoteEnabledRef.current = false;
        setMessage({ tone: "neutral", text: "Meal planning is saved locally until the 7.11.61 migration is applied." });
      } else {
        nextRow = data ?? localRow;
        persistedRemotely = true;
      }
    }

    if (persistedRemotely) {
      clearMealPlanPendingMutation(nextRow.id);
    } else {
      recordMealPlanPendingMutation({ operation: "upsert", plan: nextRow });
    }

    const nextSnapshot = buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      mealPlanEntries: [nextRow, ...mealPlanEntries.filter((entry) => entry.id !== nextRow.id)].sort(sortHealthMealPlans),
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    });
    applySnapshot(nextSnapshot);
    setMessage({ tone: "good", text: "Meal added to plan." });
    return true;
  }

  async function updateMealPlanEntry(entryId: string, input: HealthMealPlanEntryUpdate) {
    if (!userId || !profile) {
      return false;
    }
    const currentEntry = mealPlanEntries.find((entry) => entry.id === entryId);
    if (!currentEntry || currentEntry.confirmed_at !== null) {
      return false;
    }

    const now = new Date().toISOString();
    const localRow: HealthMealPlanEntry = { ...currentEntry, ...input, updated_at: now };
    let nextRow = localRow;
    let persistedRemotely = false;
    if (client && storageMode === "remote" && mealPlanRemoteEnabledRef.current) {
      const { data, error } = await client
        .from("adhdice_health_meal_plan_entries")
        .update(input)
        .eq("id", entryId)
        .eq("user_id", userId)
        .is("confirmed_at", null)
        .select("*")
        .single();
      if (error) {
        if (!isMissingHealthPersistence(error.message)) {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
        mealPlanRemoteEnabledRef.current = false;
        setMessage({ tone: "neutral", text: "Meal-plan edits are saved locally until the 7.11.61 migration is applied." });
      } else {
        nextRow = data ?? localRow;
        persistedRemotely = true;
      }
    }

    if (persistedRemotely) {
      clearMealPlanPendingMutation(nextRow.id);
    } else {
      recordMealPlanPendingMutation({ operation: "upsert", plan: nextRow });
    }

    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      mealPlanEntries: mealPlanEntries.map((entry) => entry.id === entryId ? nextRow : entry).sort(sortHealthMealPlans),
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Meal plan updated." });
    return true;
  }

  async function deleteMealPlanEntry(entryId: string) {
    if (!profile) {
      return false;
    }
    const currentEntry = mealPlanEntries.find((entry) => entry.id === entryId);
    if (!currentEntry || currentEntry.confirmed_at !== null) {
      return false;
    }

    let persistedRemotely = false;
    if (client && storageMode === "remote" && mealPlanRemoteEnabledRef.current) {
      const { error } = await client
        .from("adhdice_health_meal_plan_entries")
        .delete()
        .eq("id", entryId)
        .eq("user_id", profile.user_id)
        .is("confirmed_at", null);
      if (error) {
        if (!isMissingHealthPersistence(error.message)) {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
        mealPlanRemoteEnabledRef.current = false;
        setMessage({ tone: "neutral", text: "Meal-plan removal is local until the 7.11.61 migration is applied." });
      } else {
        persistedRemotely = true;
      }
    }

    if (persistedRemotely) {
      clearMealPlanPendingMutation(entryId);
    } else {
      recordMealPlanPendingMutation({ operation: "delete", planId: entryId });
    }

    applySnapshot(buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries,
      mealPlanEntries: mealPlanEntries.filter((entry) => entry.id !== entryId),
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Meal plan removed." });
    return true;
  }

  async function confirmMealPlanEntry(planId: string) {
    if (!userId || !profile) {
      return false;
    }
    const plan = mealPlanEntries.find((entry) => entry.id === planId);
    if (!plan || !isHealthMealPlanConfirmEligible(plan)) {
      setMessage({ tone: "neutral", text: "This meal plan cannot be marked Done yet." });
      return false;
    }

    const actualEntryDate = todayHealthDate();
    let actualMealEntryId = plan.confirmed_meal_entry_id ?? createLocalId("health-meal");
    let confirmedAt = new Date().toISOString();
    let newlyCreated = true;
    if (client && storageMode === "remote") {
      if (!mealPlanRemoteEnabledRef.current) {
        setMessage({ tone: "warn", text: "Apply the 7.11.63 meal-plan confirmation correction before marking a remotely stored plan Done." });
        return false;
      }
      const rpcClient = client as unknown as {
        rpc: (
          fn: "adhdice_confirm_health_meal_plan_entry",
          params: { p_actual_entry_date: string; p_plan_entry_id: string },
        ) => Promise<{ data: Array<Record<string, unknown>> | Record<string, unknown> | null; error: { message: string } | null }>;
      };
      const { data, error } = await rpcClient.rpc("adhdice_confirm_health_meal_plan_entry", { p_actual_entry_date: actualEntryDate, p_plan_entry_id: planId });
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      const rpcRow = Array.isArray(data) ? data[0] : data;
      if (!rpcRow || typeof rpcRow.actual_meal_entry_id !== "string") {
        setMessage({ tone: "warn", text: "Meal-plan confirmation returned no actual meal." });
        return false;
      }
      actualMealEntryId = rpcRow.actual_meal_entry_id;
      confirmedAt = typeof rpcRow.confirmed_at === "string" ? rpcRow.confirmed_at : confirmedAt;
      newlyCreated = rpcRow.newly_created !== false;
    }

    const actualInput = buildActualMealEntryInputFromPlan(plan, { entryDate: actualEntryDate, loggedAt: confirmedAt });
    const actualRow: HealthMealEntry = {
      attribution: actualInput.attribution ?? null,
      barcode: actualInput.barcode ?? null,
      brand_name: actualInput.brand_name ?? null,
      calories: actualInput.calories,
      carbs_g: actualInput.carbs_g ?? null,
      entry_date: actualInput.entry_date,
      fat_g: actualInput.fat_g ?? null,
      food_name: actualInput.food_name,
      id: actualMealEntryId,
      logged_at: actualInput.logged_at ?? confirmedAt,
      meal_slot: actualInput.meal_slot,
      nutrition_snapshot: actualInput.nutrition_snapshot ?? null,
      provider: actualInput.provider ?? "manual",
      provider_item_id: actualInput.provider_item_id ?? null,
      protein_g: actualInput.protein_g ?? null,
      serving_fraction: actualInput.serving_fraction ?? null,
      serving_label: actualInput.serving_label ?? null,
      source_food_id: actualInput.source_food_id ?? null,
      consumed_quantity: actualInput.consumed_quantity ?? null,
      consumed_unit: actualInput.consumed_unit ?? null,
      food_snapshot: actualInput.food_snapshot ?? null,
      created_at: confirmedAt,
      updated_at: confirmedAt,
      user_id: userId,
    };
    const nextMealEntries = mealEntries.some((entry) => entry.id === actualMealEntryId)
      ? mealEntries
      : [actualRow, ...mealEntries].sort((left, right) => right.logged_at.localeCompare(left.logged_at));
    const nextPlanEntries = mealPlanEntries.map((entry) => entry.id === planId
      ? { ...entry, confirmed_at: confirmedAt, confirmed_meal_entry_id: actualMealEntryId, updated_at: confirmedAt }
      : entry);
    const nextSnapshot = buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries: nextMealEntries,
      mealPlanEntries: nextPlanEntries,
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    });
    applySnapshot(nextSnapshot);
    await claimEligibleAwards(nextSnapshot, { persistRemotely: storageMode === "remote" });
    setMessage({ tone: "good", text: newlyCreated ? "Meal plan marked Done." : "Meal plan Done recovered." });
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
      nutrition_details: normalizedInput.nutrition_details ?? null,
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
      confirmed_at: input.confirmed_at === undefined ? now : input.confirmed_at,
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
      nextRow = data ? normalizeHealthWaterEntry(data) : localRow;
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
      nextEntry = data ? normalizeHealthWaterEntry(data) : nextEntry;
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

  async function confirmWaterEntry(entryId: string) {
    if (!profile) {
      return false;
    }
    const existingEntry = waterEntries.find((entry) => entry.id === entryId);
    if (!existingEntry || existingEntry.confirmed_at !== null) {
      return Boolean(existingEntry);
    }

    const confirmedAt = new Date().toISOString();
    let nextEntry: HealthWaterEntry = {
      ...existingEntry,
      confirmed_at: confirmedAt,
    };
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_water_entries")
        .update({ confirmed_at: confirmedAt })
        .eq("id", entryId)
        .is("confirmed_at", null)
        .select("*")
        .maybeSingle();
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      if (!data) {
        const { data: currentRow, error: currentRowError } = await client
          .from("adhdice_health_water_entries")
          .select("confirmed_at")
          .eq("id", entryId)
          .maybeSingle();
        if (currentRowError) {
          setMessage({ tone: "warn", text: currentRowError.message });
          return false;
        }
        return Boolean(currentRow && currentRow.confirmed_at !== null);
      }
      nextEntry = normalizeHealthWaterEntry(data);
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
    setMessage({ tone: "good", text: "Water entry confirmed." });
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

  async function addWorkout(input: Omit<HealthWorkoutInsert, "user_id">) {
    if (!userId || !profile) {
      return null;
    }

    const now = new Date().toISOString();
    const normalizedInput: Omit<HealthWorkoutInsert, "user_id"> = {
      ...input,
      notes: input.notes?.trim() ?? "",
      title: input.title.trim() || input.workout_type.trim(),
      workout_type: input.workout_type.trim(),
    };
    const localRow: HealthWorkout = {
      active_calories: normalizedInput.active_calories ?? null,
      created_at: normalizedInput.created_at ?? now,
      duration_seconds: normalizedInput.duration_seconds,
      ended_at: normalizedInput.ended_at ?? null,
      id: normalizedInput.id ?? createLocalId("health-workout"),
      notes: normalizedInput.notes ?? "",
      source: normalizedInput.source ?? "manual",
      source_external_id: normalizedInput.source_external_id ?? null,
      started_at: normalizedInput.started_at ?? null,
      title: normalizedInput.title,
      updated_at: now,
      user_id: userId,
      workout_date: normalizedInput.workout_date,
      workout_type: normalizedInput.workout_type,
    };
    const validationError = validateHealthWorkoutEditableInput(localRow);
    if (validationError) {
      setMessage({ tone: "warn", text: validationError });
      return null;
    }

    let nextRow = localRow;
    if (client && storageMode === "remote" && workoutRemoteEnabledRef.current) {
      const workoutQuery = client
        .from("adhdice_health_workouts");
      const { data, error } = normalizedInput.id
        ? await workoutQuery
          .upsert({ ...normalizedInput, user_id: userId }, { onConflict: "id" })
          .select("*")
          .single()
        : await workoutQuery
          .insert({ ...normalizedInput, user_id: userId })
          .select("*")
          .single();
      if (error) {
        if (isMissingHealthPersistence(error.message)) {
          workoutRemoteEnabledRef.current = false;
          setMessage({ tone: "neutral", text: "Fitness workouts are now being saved locally until the 7.11.33 Fitness migration is applied." });
        } else {
          setMessage({ tone: "warn", text: error.message });
          return null;
        }
      } else {
        nextRow = data ?? localRow;
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
      workouts: sortHealthWorkouts([nextRow, ...workouts.filter((entry) => entry.id !== nextRow.id)]),
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Workout saved." });
    return nextRow;
  }

  async function updateWorkout(workoutId: string, input: HealthWorkoutUpdate) {
    if (!profile) {
      return false;
    }
    const existingWorkout = workouts.find((workout) => workout.id === workoutId);
    if (!existingWorkout) {
      setMessage({ tone: "warn", text: "Workout was not found." });
      return false;
    }
    if (existingWorkout.source !== "manual") {
      setMessage({ tone: "warn", text: "Imported workouts cannot be edited yet." });
      return false;
    }

    const nextWorkout: HealthWorkout = {
      ...existingWorkout,
      ...input,
      updated_at: new Date().toISOString(),
    };
    const validationError = validateHealthWorkoutEditableInput(nextWorkout);
    if (validationError) {
      setMessage({ tone: "warn", text: validationError });
      return false;
    }

    let persistedWorkout = nextWorkout;
    if (client && storageMode === "remote" && workoutRemoteEnabledRef.current) {
      const { data, error } = await client
        .from("adhdice_health_workouts")
        .update(input)
        .eq("id", workoutId)
        .select("*")
        .single();
      if (error) {
        if (isMissingHealthPersistence(error.message)) {
          workoutRemoteEnabledRef.current = false;
          setMessage({ tone: "neutral", text: "Fitness workouts are now being saved locally until the 7.11.33 Fitness migration is applied." });
        } else {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
      } else {
        persistedWorkout = data ?? nextWorkout;
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
      workouts: sortHealthWorkouts(workouts.map((workout) => workout.id === workoutId ? persistedWorkout : workout)),
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Workout updated." });
    return true;
  }

  async function deleteWorkout(workoutId: string) {
    if (!profile) {
      return false;
    }
    const existingWorkout = workouts.find((workout) => workout.id === workoutId);
    if (!existingWorkout) {
      setMessage({ tone: "warn", text: "Workout was not found." });
      return false;
    }
    if (existingWorkout.source !== "manual") {
      setMessage({ tone: "warn", text: "Imported workouts cannot be deleted yet." });
      return false;
    }

    if (client && storageMode === "remote" && workoutRemoteEnabledRef.current) {
      const { error } = await client.from("adhdice_health_workouts").delete().eq("id", workoutId);
      if (error) {
        if (isMissingHealthPersistence(error.message)) {
          workoutRemoteEnabledRef.current = false;
          setMessage({ tone: "neutral", text: "Fitness workouts are now being saved locally until the 7.11.33 Fitness migration is applied." });
        } else {
          setMessage({ tone: "warn", text: error.message });
          return false;
        }
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
      workouts: workouts.filter((workout) => workout.id !== workoutId),
      weightEntries,
    }));
    setMessage({ tone: "good", text: "Workout deleted." });
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
    journalSignals,
    journalSignalValues,
    saveJournalEntry,
    createJournalSignal,
    updateJournalSignal,
    setJournalSignalTemplate,
    archiveJournalSignal,
    deleteJournalSignal,
    reorderJournalSignals,
    deleteJournalEntry,
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
    mealPlanEntries,
    addMealPlanEntry,
    updateMealPlanEntry,
    deleteMealPlanEntry,
    confirmMealPlanEntry,
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
    symptoms,
    createSymptom,
    renameSymptom,
    setSymptomColor,
    archiveSymptom,
    symptomEntries,
    addSymptomEntry,
    updateSymptomEntry,
    deleteSymptomEntry,
    addMealEntry,
    addWaterEntry,
    confirmWaterEntry,
    addWeightEntry,
    updateWaterEntry,
    updateMealEntry,
    storageMode,
    waterEntries,
    workouts,
    addWorkout,
    updateWorkout,
    deleteWorkout,
    weightEntries,
  };
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  HealthJournalCustomQuestion,
  HealthJournalSignal,
  HealthJournalSignalInsert,
  HealthJournalSignalOccurrence,
  HealthJournalSignalOccurrenceInsert,
  HealthJournalSignalUpdate,
  HealthJournalSignalValue,
  HealthJournalTrigger,
  HealthJournalTriggerLink,
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
  normalizeHealthMealTime,
  sortHealthSymptomEntries,
  sortHealthSymptoms,
  todayHealthDate,
  type HealthAchievementCode,
} from "@/lib/health-utils";
import {
  DEFAULT_HEALTH_JOURNAL_HIGH_LABEL,
  DEFAULT_HEALTH_JOURNAL_LOW_LABEL,
  getHealthJournalSignalDisplayName,
  normalizeHealthJournalEntryTime,
  normalizeHealthJournalLabel,
  normalizeHealthJournalScore,
  normalizeHealthJournalScaleLabels,
  normalizeHealthJournalSignalOccurrence,
  normalizeHealthJournalSignal,
  sortHealthJournalEntries,
  sortHealthJournalSignalOccurrences,
  sortHealthJournalSignals,
  type HealthJournalDraftValue,
} from "@/lib/health-journal";
import { getHealthJournalScaleDenominator, normalizeHealthJournalCustomQuestions, normalizeHealthJournalStructuredAnswers } from "@/lib/health-journal-checkins";
import {
  getHealthJournalOccurrenceOwnershipError,
  readHealthJournalOccurrenceOwners,
  type HealthJournalOccurrencePersistenceClient,
} from "@/lib/health-journal-occurrence-persistence";
import {
  clearCompletedHealthJournalPendingMutations,
  clearHealthJournalPendingMutation,
  getHealthJournalPendingMutationKey,
  normalizeHealthJournalPendingMutations,
  quarantineHealthJournalPendingUpsert,
  recordHealthJournalPendingDelete,
  recordHealthJournalPendingUpsert,
  replayHealthJournalPendingUpsertMutation,
  replayHealthJournalPendingMutations,
  type HealthJournalPendingEntity,
  type HealthJournalPendingMutation,
  type HealthJournalPendingMutationJournal,
  type HealthJournalPendingReplayClient,
  type HealthJournalPendingUpsert,
} from "@/lib/health-journal-pending-mutations";
import { deleteHealthJournalRecordWithTombstone } from "@/lib/health-journal-tombstones";
import {
  createHealthJournalTrigger,
  getHealthJournalTriggerNameIdentity,
  listHealthJournalTriggers,
  readHealthJournalTriggerLinks,
  replaceHealthJournalTriggerAssociations,
  validateHealthJournalTriggerAssociationDrafts,
  type HealthJournalTriggerOccurrenceReplacement,
} from "@/lib/health-journal-triggers";
import {
  getHealthFoodIdentityKey,
  normalizeHealthWaterEntry,
  normalizeHealthFoodLibraryInput,
  normalizeHealthFoodLibraryItem,
  setHealthFoodFavoriteStatus,
} from "@/lib/health-library";
import {
  buildHealthFoodHistoryMealEntryUpdate,
  formatHealthFoodHistoryRepairResult,
  normalizeHealthMealStoredCalories,
  selectHealthFoodMealEntriesBySourceId,
  type HealthFoodHistoryRepairResult,
} from "@/lib/health-meal-recalculation";
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
import { writeLocalStorageEntries, type LocalStorageWriteResult } from "@/lib/health-local-storage";
import {
  captureHealthOperation,
  isCurrentHealthOperation,
  type HealthOperationOwner,
  type HealthOperationToken,
} from "@/lib/health-operation-ownership";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import { fetchAllPagedRows, SUPABASE_READ_PAGE_SIZE, type PaginatedReadResult } from "@/lib/paginated-read";
import { isWorkspacePerformanceDiagnosticsEnabled } from "@/lib/workspace-performance-diagnostics";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (message: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;
type JournalPendingQueryResult = { data: { id: string; journal_entry_id?: string | null; user_id: string }[] | null; error: { message: string } | null };
type JournalPendingFilter = PromiseLike<JournalPendingQueryResult> & {
  eq(column: string, value: string): JournalPendingFilter;
  select(columns: string): JournalPendingFilter;
};
type JournalPendingMutationTable = {
  insert(values: Record<string, unknown>): { select(columns: string): JournalPendingFilter };
  select(columns: string): JournalPendingFilter;
  update(values: Record<string, unknown>): JournalPendingFilter;
};
type JournalPendingMutationClient = {
  from(table: string): JournalPendingMutationTable;
};

const JOURNAL_PENDING_TABLE_BY_ENTITY: Record<HealthJournalPendingEntity, string> = {
  checkin: "adhdice_health_checkins",
  signal: "adhdice_health_journal_signals",
  signal_value: "adhdice_health_journal_signal_values",
  signal_occurrence: "adhdice_health_journal_signal_occurrences",
  symptom: "adhdice_health_symptoms",
  symptom_entry: "adhdice_health_symptom_entries",
};

function createHealthJournalPendingReplayClient(client: SupabaseClient): HealthJournalPendingReplayClient {
  const remote = client as unknown as JournalPendingMutationClient;
  const selectRemoteRow = "*";
  return {
    read: async (entity, id, userId) => remote.from(JOURNAL_PENDING_TABLE_BY_ENTITY[entity])
      .select(selectRemoteRow)
      .eq("id", id)
      .eq("user_id", userId),
    insert: async (entity, row) => remote.from(JOURNAL_PENDING_TABLE_BY_ENTITY[entity])
      .insert(row)
      .select(selectRemoteRow),
    update: async ({ entity, id, journalEntryId, row, userId }) => {
      let query = remote.from(JOURNAL_PENDING_TABLE_BY_ENTITY[entity])
        .update(row)
        .eq("id", id)
        .eq("user_id", userId);
      if (journalEntryId) query = query.eq("journal_entry_id", journalEntryId);
      return query.select(selectRemoteRow);
    },
  };
}
export type HealthImportSaveProgress = {
  completed: number;
  message: string;
  phase: "audit" | "complete" | "metrics" | "weights";
  total: number;
};

export type HealthBatchWriteResult = {
  success: boolean;
  rows: Array<{ index: number; success: boolean; error?: string }>;
  error?: string;
};

export type HealthJournalEntrySaveInput = {
  allowInsertWithId?: boolean;
  checkIn: Omit<HealthCheckInInsert, "user_id">;
  signalValues: HealthJournalDraftValue[];
  symptomOccurrences: Omit<HealthSymptomEntryInsert, "user_id" | "journal_entry_id">[];
  journalSignalOccurrences: Omit<HealthJournalSignalOccurrenceInsert, "user_id" | "journal_entry_id">[];
  triggerAssociationReplacements?: HealthJournalTriggerOccurrenceReplacement[];
};

export type HealthJournalEntrySaveResult = {
  entry: HealthCheckIn;
  triggerAssociationError?: string;
};

type HealthStateSnapshot = {
  awards: HealthAchievementAward[];
  checkIns: HealthCheckIn[];
  journalSignals: HealthJournalSignal[];
  journalSignalValues: HealthJournalSignalValue[];
  journalSignalOccurrences: HealthJournalSignalOccurrence[];
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

type HealthRemoteAuthority = {
  client: SupabaseClient;
  hydratedAt: number;
  snapshot: HealthStateSnapshot;
  userId: string;
};

type HealthRemoteClient = NonNullable<SupabaseClient>;

async function loadHealthHydrationReads(client: HealthRemoteClient, userId: string) {
  let pageCount = 0;
  const loadRows = <T,>(fetchPage: (from: number, to: number) => PromiseLike<PaginatedReadResult<T>>) =>
    fetchAllPagedRows(fetchPage, SUPABASE_READ_PAGE_SIZE, () => {
      pageCount += 1;
    });
  const results = await Promise.all([
    client.from("adhdice_health_profiles").select("*").eq("user_id", userId).maybeSingle(),
    loadRows((from, to) => client.from("adhdice_health_checkins").select("id,user_id,entry_date,entry_time,mood_score,energy_score,stress_score,clarity_score,symptom_tags,reflection,entry_type,structured_answers,created_at,updated_at").eq("user_id", userId).order("entry_date", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_journal_signals").select("id,user_id,kind,symptom_id,name,color,low_label,high_label,scale_labels,in_template,template_sort_order,archived_at,created_at,updated_at").eq("user_id", userId).order("in_template", { ascending: false }).order("template_sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_journal_signal_values").select("id,user_id,journal_entry_id,signal_id,score,created_at,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_journal_signal_occurrences").select("id,user_id,journal_entry_id,signal_id,entry_date,occurred_at,score,time_is_estimated,note,created_at,updated_at").eq("user_id", userId).order("occurred_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_meal_entries").select("id,user_id,entry_date,meal_slot,logged_at,food_name,brand_name,serving_label,calories,protein_g,carbs_g,fat_g,barcode,provider,provider_item_id,attribution,source_food_id,consumed_quantity,consumed_unit,serving_fraction,food_snapshot,nutrition_snapshot,created_at,updated_at").eq("user_id", userId).order("logged_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_meal_plan_entries").select("id,user_id,planned_date,meal_slot,planned_time,planned_at,food_name,brand_name,serving_label,calories,protein_g,carbs_g,fat_g,barcode,provider,provider_item_id,attribution,source_food_id,consumed_quantity,consumed_unit,serving_fraction,food_snapshot,nutrition_snapshot,confirmed_at,confirmed_meal_entry_id,created_at,updated_at").eq("user_id", userId).order("planned_date", { ascending: true }).order("planned_time", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_food_library").select("id,user_id,food_name,brand_name,category,food_category,serving_label,serving_size,serving_quantity,serving_unit,serving_measure_value,serving_measure_unit,serving_weight_amount,serving_weight_unit,calories,protein_g,carbs_g,fat_g,nutrition_details,barcode,provider,provider_item_id,attribution,is_favorite,created_at,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_recipes").select("id,user_id,name,notes,servings,ingredients,created_at,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_saved_meals").select("id,user_id,name,default_meal_slot,items,created_at,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_symptoms").select("id,user_id,name,color,archived_at,created_at,updated_at").eq("user_id", userId).order("archived_at", { ascending: true, nullsFirst: true }).order("name", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_symptom_entries").select("id,user_id,symptom_id,journal_entry_id,entry_date,logged_at,severity,time_is_estimated,note,created_at,updated_at").eq("user_id", userId).order("logged_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_water_entries").select("id,user_id,entry_date,logged_at,amount,unit,amount_ml,confirmed_at,created_at").eq("user_id", userId).order("logged_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_weight_entries").select("id,user_id,entry_date,logged_at,weight_kg,source,note,created_at,updated_at").eq("user_id", userId).order("logged_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_metric_entries").select("id,user_id,metric_type,metric_date,metric_value,source,source_fingerprint,created_at,updated_at").eq("user_id", userId).order("metric_date", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_workouts").select("id,user_id,workout_date,started_at,ended_at,duration_seconds,title,workout_type,active_calories,notes,source,source_external_id,created_at,updated_at").eq("user_id", userId).order("workout_date", { ascending: false }).order("started_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_import_audits").select("id,user_id,source,imported_count,duplicate_count,skipped_count,import_start_date,import_end_date,summary_text,started_at,completed_at,created_at").eq("user_id", userId).order("started_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    loadRows((from, to) => client.from("adhdice_health_achievement_awards").select("id,user_id,achievement_code,title,description,awarded_points,awarded_xp,awarded_tokens,earned_at,created_at").eq("user_id", userId).order("earned_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
  ]);
  return { pageCount, results };
}

type HealthHydrationReads = Awaited<ReturnType<typeof loadHealthHydrationReads>>;

type LocalHealthState = {
  snapshot: HealthStateSnapshot;
  mealPlanPendingMutations: HealthMealPlanPendingMutationJournal;
  journalPendingMutations: HealthJournalPendingMutationJournal;
};

type HealthPersistenceMode = "local" | "remote";
type HealthLocalPersistenceFailure = {
  mode: HealthPersistenceMode;
  reason: "quota" | "storage";
  source: "health-cache" | "meal-plan-pending" | "journal-pending";
};

function buildEmptyState(userId: string): HealthStateSnapshot {
  return {
    awards: [],
    checkIns: [],
    journalSignals: [],
    journalSignalValues: [],
    journalSignalOccurrences: [],
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

  let rawValue: string | null;
  try {
    rawValue = window.localStorage.getItem(key);
  } catch {
    return fallback;
  }
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function normalizeHealthCheckIn(checkIn: HealthCheckIn): HealthCheckIn {
  return {
    ...checkIn,
    entry_time: normalizeHealthJournalEntryTime(checkIn.entry_time, checkIn.created_at),
    entry_type: checkIn.entry_type ?? "event",
    clarity_score: checkIn.clarity_score ?? null,
    stress_score: checkIn.stress_score ?? null,
    symptom_tags: Array.isArray(checkIn.symptom_tags) ? checkIn.symptom_tags : [],
    reflection: typeof checkIn.reflection === "string" ? checkIn.reflection : "",
    structured_answers: normalizeHealthJournalStructuredAnswers(checkIn.structured_answers),
  };
}

function normalizeHealthSymptomEntry(entry: HealthSymptomEntry): HealthSymptomEntry | null {
  return entry.journal_entry_id ? { ...entry, time_is_estimated: entry.time_is_estimated === true } : null;
}

function normalizeHealthSymptomEntries(entries: readonly HealthSymptomEntry[]) {
  return entries.map(normalizeHealthSymptomEntry).filter((entry): entry is HealthSymptomEntry => entry !== null);
}

function readLocalHealthState(userId: string): LocalHealthState {
  const emptyState = buildEmptyState(userId);
  const snapshot: HealthStateSnapshot = {
    awards: readStoredJson(storageKey(userId, "awards"), emptyState.awards),
    checkIns: readStoredJson<HealthCheckIn[]>(storageKey(userId, "checkins"), emptyState.checkIns).map(normalizeHealthCheckIn).sort(sortHealthJournalEntries),
    journalSignals: readStoredJson<HealthJournalSignal[]>(storageKey(userId, "journal-signals"), emptyState.journalSignals)
      .map(normalizeHealthJournalSignal)
      .sort(sortHealthJournalSignals),
    journalSignalValues: readStoredJson<HealthJournalSignalValue[]>(storageKey(userId, "journal-signal-values"), emptyState.journalSignalValues),
    journalSignalOccurrences: readStoredJson<HealthJournalSignalOccurrence[]>(storageKey(userId, "journal-signal-occurrences"), emptyState.journalSignalOccurrences)
      .map(normalizeHealthJournalSignalOccurrence)
      .sort(sortHealthJournalSignalOccurrences),
    favorites: readStoredJson<HealthFoodLibraryItem[]>(storageKey(userId, "favorites"), emptyState.favorites)
      .map(normalizeHealthFoodLibraryItem),
    importAudits: readStoredJson(storageKey(userId, "imports"), emptyState.importAudits),
    mealEntries: readStoredJson(storageKey(userId, "meals"), emptyState.mealEntries),
    mealPlanEntries: readStoredJson(storageKey(userId, "meal-plans"), emptyState.mealPlanEntries),
    metricEntries: readStoredJson(storageKey(userId, "metrics"), emptyState.metricEntries),
    profile: (() => {
      const storedProfile = normalizeHealthProfile(
        readStoredJson<Partial<HealthProfile> | null>(storageKey(userId, "profile"), null),
        userId,
      );
      return { ...storedProfile, journal_questions: normalizeHealthJournalCustomQuestions(storedProfile.journal_questions) };
    })(),
    recipes: readStoredJson(storageKey(userId, "recipes"), emptyState.recipes),
    savedMeals: readStoredJson(storageKey(userId, "saved-meals"), emptyState.savedMeals),
    symptomEntries: sortHealthSymptomEntries(normalizeHealthSymptomEntries(readStoredJson<HealthSymptomEntry[]>(storageKey(userId, "symptom-entries"), emptyState.symptomEntries))),
    symptoms: sortHealthSymptoms(readStoredJson<HealthSymptom[]>(storageKey(userId, "symptoms"), emptyState.symptoms).map(normalizeHealthSymptom)),
    waterEntries: readStoredJson<HealthWaterEntry[]>(storageKey(userId, "water"), emptyState.waterEntries)
      .map(normalizeHealthWaterEntry),
    workouts: sortHealthWorkouts(readStoredJson(storageKey(userId, "workouts"), emptyState.workouts)),
    weightEntries: readStoredJson(storageKey(userId, "weights"), emptyState.weightEntries),
  };
  const mealPlanPendingMutations = normalizeHealthMealPlanPendingMutations(
    readStoredJson<unknown>(storageKey(userId, "meal-plan-pending-mutations"), {}),
  );
  const journalPendingMutations = normalizeHealthJournalPendingMutations(
    readStoredJson<unknown>(storageKey(userId, "journal-pending-mutations"), {}),
  );
  return {
    snapshot: {
      ...snapshot,
      mealPlanEntries: replayHealthMealPlanPendingMutations(snapshot.mealPlanEntries, mealPlanPendingMutations, userId),
    },
    mealPlanPendingMutations,
    journalPendingMutations,
  };
}

function persistLocalHealthState(state: HealthStateSnapshot): LocalStorageWriteResult {
  if (typeof window === "undefined") {
    return { ok: true };
  }
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return { ok: false, reason: "storage" };
  }

  const {
    profile,
    checkIns,
    journalSignals,
    journalSignalValues,
    journalSignalOccurrences,
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
  return writeLocalStorageEntries(storage, [
    [storageKey(profile.user_id, "profile"), JSON.stringify(profile)],
    [storageKey(profile.user_id, "checkins"), JSON.stringify(checkIns)],
    [storageKey(profile.user_id, "journal-signals"), JSON.stringify(journalSignals)],
    [storageKey(profile.user_id, "journal-signal-values"), JSON.stringify(journalSignalValues)],
    [storageKey(profile.user_id, "journal-signal-occurrences"), JSON.stringify(journalSignalOccurrences)],
    [storageKey(profile.user_id, "meals"), JSON.stringify(mealEntries)],
    [storageKey(profile.user_id, "meal-plans"), JSON.stringify(mealPlanEntries)],
    [storageKey(profile.user_id, "favorites"), JSON.stringify(favorites)],
    [storageKey(profile.user_id, "recipes"), JSON.stringify(recipes)],
    [storageKey(profile.user_id, "saved-meals"), JSON.stringify(savedMeals)],
    [storageKey(profile.user_id, "water"), JSON.stringify(waterEntries)],
    [storageKey(profile.user_id, "weights"), JSON.stringify(weightEntries)],
    [storageKey(profile.user_id, "metrics"), JSON.stringify(metricEntries)],
    [storageKey(profile.user_id, "imports"), JSON.stringify(importAudits)],
    [storageKey(profile.user_id, "awards"), JSON.stringify(awards)],
    [storageKey(profile.user_id, "workouts"), JSON.stringify(workouts)],
    [storageKey(profile.user_id, "symptoms"), JSON.stringify(symptoms)],
    [storageKey(profile.user_id, "symptom-entries"), JSON.stringify(symptomEntries)],
  ]);
}

function persistHealthMealPlanPendingMutations(userId: string, journal: HealthMealPlanPendingMutationJournal): LocalStorageWriteResult {
  if (typeof window === "undefined") {
    return { ok: true };
  }
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return { ok: false, reason: "storage" };
  }
  return writeLocalStorageEntries(storage, [
    [storageKey(userId, "meal-plan-pending-mutations"), JSON.stringify(journal)],
  ]);
}

function persistHealthJournalPendingMutations(userId: string, journal: HealthJournalPendingMutationJournal): LocalStorageWriteResult {
  if (typeof window === "undefined") return { ok: true };
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return { ok: false, reason: "storage" };
  }
  return writeLocalStorageEntries(storage, [
    [storageKey(userId, "journal-pending-mutations"), JSON.stringify(journal)],
  ]);
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
  appendEconomyEvent: (opts: AppendEconomyEventOpts, isCurrent?: () => boolean) => Promise<void>,
  setEconomy: (updater: EconomyState | ((current: EconomyState) => EconomyState)) => void,
  active = true,
) {
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [checkIns, setCheckIns] = useState<HealthCheckIn[]>([]);
  const [journalSignals, setJournalSignals] = useState<HealthJournalSignal[]>([]);
  const [journalSignalValues, setJournalSignalValues] = useState<HealthJournalSignalValue[]>([]);
  const [journalSignalOccurrences, setJournalSignalOccurrences] = useState<HealthJournalSignalOccurrence[]>([]);
  const [journalTriggers, setJournalTriggers] = useState<HealthJournalTrigger[]>([]);
  const [journalTriggerLinks, setJournalTriggerLinks] = useState<HealthJournalTriggerLink[]>([]);
  const [journalTriggerDataError, setJournalTriggerDataError] = useState<string | null>(null);
  const [isLoadingJournalTriggers, setIsLoadingJournalTriggers] = useState(false);
  const [hasLoadedJournalTriggerData, setHasLoadedJournalTriggerData] = useState(false);
  const [journalTriggerDataOwnerId, setJournalTriggerDataOwnerId] = useState<string | null>(null);
  const [journalTriggerRequestOwnerId, setJournalTriggerRequestOwnerId] = useState<string | null>(null);
  const journalTriggerOwnerRef = useRef<string | null>(null);
  const journalTriggerLoadedOwnerRef = useRef<string | null>(null);
  const journalTriggerLoadGenerationRef = useRef(0);
  const journalTriggerLoadInFlightRef = useRef<{ client: SupabaseClient; promise: Promise<boolean>; userId: string } | null>(null);
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
  const healthRemoteAuthorityRef = useRef<HealthRemoteAuthority | null>(null);
  const healthHydrationInFlightRef = useRef<{ client: HealthRemoteClient; promise: Promise<HealthHydrationReads>; userId: string } | null>(null);
  const healthForceRemoteHydrationRef = useRef(false);
  const [healthRefreshNonce, setHealthRefreshNonce] = useState(0);
  const healthFoodMutationRevisionRef = useRef(0);
  const workoutRemoteEnabledRef = useRef(true);
  const mealPlanRemoteEnabledRef = useRef(true);
  const symptomDefinitionsRemoteEnabledRef = useRef(true);
  const symptomEntriesRemoteEnabledRef = useRef(true);
  const journalRemoteEnabledRef = useRef(true);
  const journalSignalOccurrencesRemoteEnabledRef = useRef(true);
  const mealPlanPendingMutationsRef = useRef<HealthMealPlanPendingMutationJournal>({});
  const journalPendingMutationsRef = useRef<HealthJournalPendingMutationJournal>({});
  const healthLocalPersistenceFailureRef = useRef<HealthLocalPersistenceFailure | null>(null);
  const healthOperationGenerationRef = useRef(0);
  const healthOwnerRef = useRef<Pick<HealthOperationOwner, "active" | "userId">>({ active, userId });
  const currentHealthOwner = (): HealthOperationOwner => ({
    ...healthOwnerRef.current,
    generation: healthOperationGenerationRef.current,
  });
  const captureOperation = () => captureHealthOperation(currentHealthOwner());
  const isCurrentOperation = (token: HealthOperationToken | null) => isCurrentHealthOperation(currentHealthOwner(), token);

  useLayoutEffect(() => {
    if (healthRemoteAuthorityRef.current && (healthRemoteAuthorityRef.current.userId !== userId || healthRemoteAuthorityRef.current.client !== client)) {
      healthRemoteAuthorityRef.current = null;
    }
    healthOperationGenerationRef.current += 1;
    journalTriggerLoadGenerationRef.current += 1;
    healthOwnerRef.current = { active, userId };
    healthFoodMutationRevisionRef.current = 0;
    return () => {
      healthOperationGenerationRef.current += 1;
      journalTriggerLoadGenerationRef.current += 1;
      healthOwnerRef.current = { active: false, userId: null };
    };
  }, [active, client, userId]);

  function refreshHealth() {
    if (!client || !userId) return;
    healthForceRemoteHydrationRef.current = true;
    setHealthRefreshNonce((current) => current + 1);
  }

  function rememberHealthLocalPersistenceFailure(
    result: LocalStorageWriteResult,
    mode: HealthPersistenceMode,
    source: HealthLocalPersistenceFailure["source"],
  ) {
    if (!result.ok) {
      healthLocalPersistenceFailureRef.current = { mode, reason: result.reason, source };
    }
  }

  function setHealthSuccessMessage(message: { tone: "good"; text: string }) {
    const failure = healthLocalPersistenceFailureRef.current;
    healthLocalPersistenceFailureRef.current = null;
    if (!failure) {
      setMessage(message);
      return;
    }

    const storageProblem = failure.reason === "quota"
      ? "browser storage is full"
      : "the browser could not update its local cache";
    if (failure.source === "meal-plan-pending") {
      setMessage({
        tone: "warn",
        text: `Meal Plan remains visible, but its pending recovery record could not be saved because ${storageProblem}. This change may not survive a refresh; no Health data was deleted.`,
      });
      return;
    }
    if (failure.source === "journal-pending") {
      setMessage({
        tone: "warn",
        text: `Journal remains visible, but its pending recovery record could not be saved because ${storageProblem}. This local-only change may not survive a refresh; no Health data was deleted.`,
      });
      return;
    }
    setMessage({
      tone: "warn",
      text: failure.mode === "remote"
        ? `Supabase saved this Health change, but ${storageProblem}. The cloud-backed data remains authoritative; no Health data was deleted.`
        : `Health updated in memory, but ${storageProblem}. This local-only change may not survive a refresh; no Health data was deleted.`,
    });
  }

  function recordMealPlanPendingMutation(mutation: HealthMealPlanPendingMutation) {
    const currentJournal = mealPlanPendingMutationsRef.current;
    const nextJournal = mutation.operation === "upsert"
      ? recordHealthMealPlanPendingUpsert(currentJournal, mutation.plan)
      : recordHealthMealPlanPendingDelete(currentJournal, mutation.planId);
    mealPlanPendingMutationsRef.current = nextJournal;
    if (userId) {
      rememberHealthLocalPersistenceFailure(
        persistHealthMealPlanPendingMutations(userId, nextJournal),
        "local",
        "meal-plan-pending",
      );
    }
  }

  function clearMealPlanPendingMutation(planId: string) {
    const nextJournal = clearHealthMealPlanPendingMutation(mealPlanPendingMutationsRef.current, planId);
    if (nextJournal === mealPlanPendingMutationsRef.current) {
      return;
    }
    mealPlanPendingMutationsRef.current = nextJournal;
    if (userId) {
      rememberHealthLocalPersistenceFailure(
        persistHealthMealPlanPendingMutations(userId, nextJournal),
        "local",
        "meal-plan-pending",
      );
    }
  }

  function persistJournalPendingMutations(journal: HealthJournalPendingMutationJournal): LocalStorageWriteResult {
    journalPendingMutationsRef.current = journal;
    if (userId) {
      const result = persistHealthJournalPendingMutations(userId, journal);
      rememberHealthLocalPersistenceFailure(result, "local", "journal-pending");
      return result;
    }
    return { ok: true };
  }

  function recordJournalPendingMutation(mutation: HealthJournalPendingMutation): LocalStorageWriteResult {
    const nextJournal = mutation.operation === "upsert"
      ? mutation.intent === "unknown"
        ? { ...journalPendingMutationsRef.current, [getHealthJournalPendingMutationKey(mutation.entity, mutation.row)]: mutation }
        : recordHealthJournalPendingUpsert(journalPendingMutationsRef.current, mutation)
      : recordHealthJournalPendingDelete(journalPendingMutationsRef.current, mutation.entity, mutation.id, mutation.journalEntryId);
    return persistJournalPendingMutations(nextJournal);
  }

  function clearJournalPendingMutation(entity: HealthJournalPendingEntity, rowOrId: { id: string; journal_entry_id?: string; signal_id?: string } | string) {
    const nextJournal = clearHealthJournalPendingMutation(journalPendingMutationsRef.current, entity, rowOrId);
    if (nextJournal !== journalPendingMutationsRef.current) persistJournalPendingMutations(nextJournal);
  }

  function prepareJournalPendingUpsertForSave(
    entity: HealthJournalPendingEntity,
    row: HealthJournalPendingUpsert["row"],
    preferredIntent: "create" | "update",
  ): { error?: string; intent: "create" | "update" | null } {
    const key = getHealthJournalPendingMutationKey(entity, row);
    const existing = journalPendingMutationsRef.current[key];
    if (existing?.operation === "delete") {
      return { error: "A pending Journal deletion takes precedence over this write.", intent: null };
    }

    let intent = preferredIntent;
    if (existing?.operation === "upsert") {
      if (existing.intent === "create" && existing.submissionState === "never_submitted") intent = "create";
      else if (existing.intent === "update" || (existing.intent === "create" && existing.submissionState === "confirmed" && preferredIntent === "update")) intent = "update";
      else return { error: "This Journal creation may already have reached Supabase and remains held locally.", intent: null };
    }

    const stored = recordJournalPendingMutation({ entity, intent, operation: "upsert", row } as HealthJournalPendingMutation);
    if (!stored.ok) {
      return { error: "The pending Journal write could not be saved locally, so no remote write was attempted.", intent: null };
    }
    return { intent };
  }

  async function saveJournalPendingUpsert(
    entity: HealthJournalPendingEntity,
    row: HealthJournalPendingUpsert["row"],
    preferredIntent: "create" | "update",
    remoteEnabled: boolean,
  ): Promise<{ error?: string; row: HealthJournalPendingUpsert["row"] }> {
    const activeUserId = userId;
    if (!activeUserId) return { error: "The Journal owner could not be confirmed locally.", row };
    const prepared = prepareJournalPendingUpsertForSave(entity, row, preferredIntent);
    if (prepared.error || !prepared.intent) return { error: prepared.error, row };
    const key = getHealthJournalPendingMutationKey(entity, row);
    const mutation = journalPendingMutationsRef.current[key];
    if (!mutation || mutation.operation !== "upsert") {
      return { error: "The pending Journal write could not be confirmed locally.", row };
    }
    if (!remoteEnabled || !client || storageMode !== "remote") return { row };

    const parentId = "journal_entry_id" in row ? row.journal_entry_id : undefined;
    const confirmedParentEntryIds = new Set<string>();
    if (typeof parentId === "string") {
      if (journalPendingMutationsRef.current[getHealthJournalPendingMutationKey("checkin", parentId)]?.operation === "delete") {
        return { error: "A pending Journal Entry deletion suppresses this Feeling write.", row };
      }
      const parentResult = await createHealthJournalPendingReplayClient(client).read("checkin", parentId, activeUserId);
      if (parentResult.error || !parentResult.data?.some((candidate) => candidate.id === parentId && candidate.user_id === activeUserId)) {
        return { error: parentResult.error?.message ?? "The parent Journal Entry is missing remotely; this Feeling write remains held locally.", row };
      }
      confirmedParentEntryIds.add(parentId);
    }

    const replay = await replayHealthJournalPendingUpsertMutation({
      confirmedParentEntryIds,
      journal: journalPendingMutationsRef.current,
      key,
      mutation: mutation as Extract<HealthJournalPendingMutation, { operation: "upsert" }>,
      persist: (nextJournal) => persistJournalPendingMutations(nextJournal).ok,
      remote: createHealthJournalPendingReplayClient(client),
      userId: activeUserId,
    });
    journalPendingMutationsRef.current = replay.journal;
    if (replay.status !== "completed" || !replay.row) {
      return { error: replay.error?.message ?? "The Journal write remains held locally and was not confirmed remotely.", row };
    }
    if (replay.alreadyPresent) {
      return { error: "The pending Journal creation already exists remotely; review and save it again to apply this edit.", row };
    }
    const cleared = clearHealthJournalPendingMutation(journalPendingMutationsRef.current, entity, row);
    if (cleared !== journalPendingMutationsRef.current && !persistJournalPendingMutations(cleared).ok) {
      return { error: "The Journal write succeeded remotely, but its pending state could not be cleared locally.", row };
    }
    return { row: replay.row as HealthJournalPendingUpsert["row"] };
  }

  function buildHealthSnapshot(
    snapshot: Omit<HealthStateSnapshot, "workouts" | "mealPlanEntries" | "symptoms" | "symptomEntries" | "journalSignals" | "journalSignalValues" | "journalSignalOccurrences"> & {
      mealPlanEntries?: HealthMealPlanEntry[];
      journalSignals?: HealthJournalSignal[];
      journalSignalValues?: HealthJournalSignalValue[];
      journalSignalOccurrences?: HealthJournalSignalOccurrence[];
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
      journalSignalOccurrences: snapshot.journalSignalOccurrences ?? healthSnapshotRef.current?.journalSignalOccurrences ?? [],
      symptomEntries: snapshot.symptomEntries ?? healthSnapshotRef.current?.symptomEntries ?? [],
      symptoms: snapshot.symptoms ?? healthSnapshotRef.current?.symptoms ?? [],
      workouts: snapshot.workouts ?? healthSnapshotRef.current?.workouts ?? [],
    } satisfies HealthStateSnapshot;
  }

  function applySnapshot(snapshot: HealthStateSnapshot, options?: { persistenceMode?: HealthPersistenceMode }) {
    const nextSnapshot = {
      ...snapshot,
      checkIns: [...snapshot.checkIns].sort(sortHealthJournalEntries),
      journalSignalOccurrences: [...snapshot.journalSignalOccurrences].sort(sortHealthJournalSignalOccurrences),
    };
    healthSnapshotRef.current = nextSnapshot;
    if (healthRemoteAuthorityRef.current?.userId === nextSnapshot.profile.user_id) {
      healthRemoteAuthorityRef.current.snapshot = nextSnapshot;
    }
    setProfile(nextSnapshot.profile);
    setCheckIns(nextSnapshot.checkIns);
    setJournalSignals([...nextSnapshot.journalSignals].sort(sortHealthJournalSignals));
    setJournalSignalValues(nextSnapshot.journalSignalValues);
    setJournalSignalOccurrences(nextSnapshot.journalSignalOccurrences);
    setMealEntries(nextSnapshot.mealEntries);
    setMealPlanEntries([...nextSnapshot.mealPlanEntries].sort(sortHealthMealPlans));
    setFavorites(nextSnapshot.favorites);
    setWeightEntries(nextSnapshot.weightEntries);
    setMetricEntries(nextSnapshot.metricEntries);
    setRecipes(nextSnapshot.recipes);
    setSavedMeals(nextSnapshot.savedMeals);
    setSymptoms(sortHealthSymptoms(nextSnapshot.symptoms));
    setSymptomEntries(sortHealthSymptomEntries(nextSnapshot.symptomEntries));
    setWaterEntries(nextSnapshot.waterEntries);
    setWorkouts(sortHealthWorkouts(nextSnapshot.workouts));
    setImportAudits(nextSnapshot.importAudits);
    setAwards(nextSnapshot.awards);
    const persistenceResult = persistLocalHealthState(nextSnapshot);
    if (persistenceResult.ok) {
      if (healthLocalPersistenceFailureRef.current?.source !== "meal-plan-pending") {
        healthLocalPersistenceFailureRef.current = null;
      }
    } else {
      rememberHealthLocalPersistenceFailure(
        persistenceResult,
        options?.persistenceMode ?? (storageMode === "remote" ? "remote" : "local"),
        "health-cache",
      );
    }
    return persistenceResult;
  }

  async function claimEligibleAwards(
    snapshot: HealthStateSnapshot,
    operation: HealthOperationToken,
    options?: { persistRemotely?: boolean; silent?: boolean },
  ) {
    if (!isCurrentOperation(operation)) return snapshot;
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
        if (!isCurrentOperation(operation)) return snapshot;

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

          if (!isCurrentOperation(operation)) return snapshot;

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
        if (!isCurrentOperation(operation)) return snapshot;
        await appendEconomyEvent({
          points: 0,
          reason: `Health achievement: ${achievement.title}`,
          refId: insertedAward.id,
          source: "health",
          xp: achievement.xp,
        }, () => isCurrentOperation(operation));
        if (!isCurrentOperation(operation)) return snapshot;
      }
    }

    if (nextAwards.length === snapshot.awards.length) {
      return snapshot;
    }

    if (!isCurrentOperation(operation)) return snapshot;
    const nextSnapshot = buildHealthSnapshot({ ...snapshot, awards: nextAwards });
    if (!isCurrentOperation(operation)) return snapshot;
    applySnapshot(nextSnapshot);
    if (!options?.silent) {
      setHealthSuccessMessage({
        tone: "good",
        text: `Unlocked ${nextAwards.length - snapshot.awards.length} health achievement${nextAwards.length - snapshot.awards.length === 1 ? "" : "s"}.`,
      });
    }
    return nextSnapshot;
  }

  useEffect(() => {
    if (!userId) {
      healthSnapshotRef.current = null;
      healthRemoteAuthorityRef.current = null;
      healthHydrationInFlightRef.current = null;
      healthForceRemoteHydrationRef.current = false;
      setProfile(null);
      setCheckIns([]);
      setJournalSignals([]);
      setJournalSignalValues([]);
      setJournalSignalOccurrences([]);
      setJournalTriggers([]);
      setJournalTriggerLinks([]);
      setJournalTriggerDataError(null);
      setIsLoadingJournalTriggers(false);
      setHasLoadedJournalTriggerData(false);
      setJournalTriggerDataOwnerId(null);
      setJournalTriggerRequestOwnerId(null);
      journalTriggerOwnerRef.current = null;
      journalTriggerLoadedOwnerRef.current = null;
      journalTriggerLoadInFlightRef.current = null;
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
      journalSignalOccurrencesRemoteEnabledRef.current = true;
      mealPlanPendingMutationsRef.current = {};
      journalPendingMutationsRef.current = {};
      healthLocalPersistenceFailureRef.current = null;
      return;
    }

    if (!active) return;

    if (journalTriggerOwnerRef.current !== userId) {
      journalTriggerOwnerRef.current = userId;
      setJournalTriggers([]);
      setJournalTriggerLinks([]);
      setJournalTriggerDataError(null);
      setHasLoadedJournalTriggerData(false);
      setJournalTriggerDataOwnerId(null);
      if (journalTriggerLoadInFlightRef.current?.userId !== userId) setIsLoadingJournalTriggers(false);
      journalTriggerLoadedOwnerRef.current = null;
    }

    healthOperationGenerationRef.current += 1;
    const hydrationOperation = captureOperation();
    if (!hydrationOperation) return;

    symptomDefinitionsRemoteEnabledRef.current = true;
    symptomEntriesRemoteEnabledRef.current = true;
    journalRemoteEnabledRef.current = true;
    journalSignalOccurrencesRemoteEnabledRef.current = true;
    healthLocalPersistenceFailureRef.current = null;
    const localState = readLocalHealthState(userId);
    mealPlanPendingMutationsRef.current = localState.mealPlanPendingMutations;
    journalPendingMutationsRef.current = localState.journalPendingMutations;
    applySnapshot(localState.snapshot, { persistenceMode: "local" });

    if (!client) {
      setStorageMode("local");
      return;
    }

    const forceRemoteHydration = healthForceRemoteHydrationRef.current;
    healthForceRemoteHydrationRef.current = false;
    const cachedRemoteAuthority = healthRemoteAuthorityRef.current;
    if (!forceRemoteHydration && cachedRemoteAuthority?.client === client && cachedRemoteAuthority.userId === userId) {
      setStorageMode("remote");
      applySnapshot(cachedRemoteAuthority.snapshot, { persistenceMode: "remote" });
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    const foodMutationRevisionAtFetchStart = healthFoodMutationRevisionRef.current;

    const existingHydration = healthHydrationInFlightRef.current;
    const hydrationRead = existingHydration && existingHydration.client === client && existingHydration.userId === userId
      ? existingHydration.promise
      : loadHealthHydrationReads(client, userId);
    if (!existingHydration || existingHydration.client !== client || existingHydration.userId !== userId) {
      const hydrationRequest = { client, promise: hydrationRead, userId };
      healthHydrationInFlightRef.current = hydrationRequest;
      const clearHydrationRequest = () => {
        if (healthHydrationInFlightRef.current === hydrationRequest) {
          healthHydrationInFlightRef.current = null;
        }
      };
      void hydrationRead.then(clearHydrationRequest, clearHydrationRequest);
    }

    void (async () => {
      const { pageCount: healthPageCount, results } = await hydrationRead;
      const [
        profileResult,
        checkInsResult,
        journalSignalsResult,
        journalSignalValuesResult,
        journalSignalOccurrencesResult,
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
      ] = results;

      if (!isActive || !isCurrentOperation(hydrationOperation)) {
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
      const journalSignalOccurrencePersistenceError = journalSignalOccurrencesResult.error;
      symptomDefinitionsRemoteEnabledRef.current = !symptomsResult.error;
      symptomEntriesRemoteEnabledRef.current = !symptomEntriesResult.error;
      journalRemoteEnabledRef.current = journalPersistenceErrors.length === 0;
      journalSignalOccurrencesRemoteEnabledRef.current = !journalSignalOccurrencePersistenceError;

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
            ? "Symptom tracking is using local storage until the 7.12.7, 7.12.21, and 7.16.112 Health Journal migrations are applied. Existing Health data remains connected."
            : symptomPersistenceErrors[0]?.message ?? "Symptom tracking could not connect and is using local storage.",
          tone: hasMissingSymptomPersistence ? "neutral" : "warn",
        });
      }

      if (journalPersistenceErrors.length > 0) {
        const hasMissingJournalPersistence = journalPersistenceErrors.some((error) => error && isMissingHealthPersistence(error.message));
        setMessage({
          text: hasMissingJournalPersistence
            ? "Journal is using local storage until its Health Journal migration is applied."
            : journalPersistenceErrors[0]?.message ?? "Journal could not connect and is using local storage.",
          tone: hasMissingJournalPersistence ? "neutral" : "warn",
        });
      }
      if (journalSignalOccurrencePersistenceError) {
        setMessage({
          text: isMissingHealthPersistence(journalSignalOccurrencePersistenceError.message)
            ? "Feeling Occurrences are using local storage until the 7.12.41 and 7.16.112 Health Journal migrations are applied."
            : journalSignalOccurrencePersistenceError.message,
          tone: isMissingHealthPersistence(journalSignalOccurrencePersistenceError.message) ? "neutral" : "warn",
        });
      }

      const latestLocalSymptoms = healthSnapshotRef.current?.symptoms ?? localState.snapshot.symptoms;
      const latestLocalSymptomEntries = healthSnapshotRef.current?.symptomEntries ?? localState.snapshot.symptomEntries;
      const latestLocalJournalSignals = healthSnapshotRef.current?.journalSignals ?? localState.snapshot.journalSignals;
      const latestLocalJournalSignalValues = healthSnapshotRef.current?.journalSignalValues ?? localState.snapshot.journalSignalValues;
      const latestLocalJournalSignalOccurrences = healthSnapshotRef.current?.journalSignalOccurrences ?? localState.snapshot.journalSignalOccurrences;
      const latestLocalCheckIns = healthSnapshotRef.current?.checkIns ?? localState.snapshot.checkIns;
      const pendingMutationsAtHydrationStart = journalPendingMutationsRef.current;
      let quarantinedJournal = pendingMutationsAtHydrationStart;
      let quarantinedJournalRowCount = 0;
      function quarantineMissingLocalJournalRows(localRows: readonly HealthJournalPendingUpsert[], remoteRows: readonly { id: string }[]) {
        const remoteIds = new Set(remoteRows.map((row) => row.id));
        for (const mutation of localRows) {
          const next = quarantineHealthJournalPendingUpsert(quarantinedJournal, mutation, remoteIds);
          if (next !== quarantinedJournal) {
            quarantinedJournal = next;
            quarantinedJournalRowCount += 1;
          }
        }
      }
      if (!checkInsResult.error) {
        quarantineMissingLocalJournalRows(latestLocalCheckIns.map((row) => ({ entity: "checkin", row })), checkInsResult.data ?? []);
      }
      if (!journalSignalsResult.error) {
        quarantineMissingLocalJournalRows(latestLocalJournalSignals.map((row) => ({ entity: "signal", row })), journalSignalsResult.data ?? []);
      }
      if (!journalSignalValuesResult.error) {
        quarantineMissingLocalJournalRows(latestLocalJournalSignalValues.map((row) => ({ entity: "signal_value", row })), journalSignalValuesResult.data ?? []);
      }
      if (!journalSignalOccurrencesResult.error) {
        quarantineMissingLocalJournalRows(latestLocalJournalSignalOccurrences.map((row) => ({ entity: "signal_occurrence", row })), journalSignalOccurrencesResult.data ?? []);
      }
      if (!symptomsResult.error) {
        quarantineMissingLocalJournalRows(latestLocalSymptoms.map((row) => ({ entity: "symptom", row })), symptomsResult.data ?? []);
      }
      if (!symptomEntriesResult.error) {
        quarantineMissingLocalJournalRows(latestLocalSymptomEntries.map((row) => ({ entity: "symptom_entry", row })), symptomEntriesResult.data ?? []);
      }
      if (quarantinedJournal !== pendingMutationsAtHydrationStart) {
        journalPendingMutationsRef.current = quarantinedJournal;
        const pendingWriteResult = persistHealthJournalPendingMutations(userId, quarantinedJournal);
        if (!pendingWriteResult.ok) {
          healthLocalPersistenceFailureRef.current = {
            mode: "local",
            reason: pendingWriteResult.reason,
            source: "journal-pending",
          };
          setMessage({
            tone: "warn",
            text: "Journal hydration stopped because ambiguous cached records could not be preserved locally. No recovery writes were made.",
          });
          return;
        }
        setMessage({
          tone: "warn",
          text: `${quarantinedJournalRowCount} cached Journal ${quarantinedJournalRowCount === 1 ? "record was" : "records were"} held locally because remote data could not confirm them. They were not restored or uploaded.`,
        });
      }
      const pendingMutationOrder: Record<HealthJournalPendingEntity, number> = {
        checkin: 0,
        symptom: 1,
        signal: 2,
        signal_value: 3,
        signal_occurrence: 4,
        symptom_entry: 5,
      };
      const pendingMutations = Object.entries(pendingMutationsAtHydrationStart).sort(([leftKey, left], [rightKey, right]) => {
        const getOrder = (mutation: HealthJournalPendingMutation) => mutation.operation === "delete"
          ? mutation.entity === "checkin" ? 0 : 1
          : mutation.entity === "checkin" ? 2 : 3 + pendingMutationOrder[mutation.entity];
        return getOrder(left) - getOrder(right) || leftKey.localeCompare(rightKey);
      });
      const completedPendingMutations: { key: string; mutation: HealthJournalPendingMutation }[] = [];
      let journalRecoveryError: { message: string } | null = null;
      let ambiguousPendingMutationCount = 0;
      const blockedParentEntryIds = new Set(Object.values(pendingMutationsAtHydrationStart)
        .filter((mutation) => mutation.entity === "checkin" && mutation.operation === "delete")
        .map((mutation) => mutation.operation === "delete" ? mutation.id : ""));
      const deletedParentEntryIds = new Set<string>();
      const confirmedParentEntryIds = new Set((checkInsResult.data ?? []).map((entry) => entry.id));
      const pendingReplayClient = createHealthJournalPendingReplayClient(client);

      for (const [key] of pendingMutations) {
        if (!isActive || !isCurrentOperation(hydrationOperation)) return;
        const mutation = journalPendingMutationsRef.current[key];
        if (!mutation) continue;
        const parentEntryId = mutation.operation === "delete"
          ? mutation.journalEntryId
          : "journal_entry_id" in mutation.row && typeof mutation.row.journal_entry_id === "string"
            ? mutation.row.journal_entry_id
            : undefined;

        if (parentEntryId && blockedParentEntryIds.has(parentEntryId)) {
          if (deletedParentEntryIds.has(parentEntryId)) {
            completedPendingMutations.push({ key, mutation });
          } else {
            ambiguousPendingMutationCount += 1;
            journalRecoveryError ??= { message: "A pending Journal Entry deletion is still being retried; related Feeling writes remain held locally." };
          }
          continue;
        }

        if (mutation.operation === "delete") {
          if (mutation.entity === "symptom") {
            ambiguousPendingMutationCount += 1;
            journalRecoveryError ??= { message: "Symptom definition deletion is not a supported Journal tombstone operation; the pending record remains held locally." };
            continue;
          }
          try {
            const tombstone = await deleteHealthJournalRecordWithTombstone({
              client: client as unknown as Parameters<typeof deleteHealthJournalRecordWithTombstone>[0]["client"],
              entity: mutation.entity,
              id: mutation.id,
              ...(mutation.journalEntryId ? { journalEntryId: mutation.journalEntryId } : {}),
            });
            if (!isActive || !isCurrentOperation(hydrationOperation)) return;
            if (!tombstone.tombstoned) {
              journalRecoveryError ??= { message: `Could not confirm the deletion tombstone for Journal ${mutation.entity.replaceAll("_", " ")} ${mutation.id}.` };
            } else {
              completedPendingMutations.push({ key, mutation });
              if (mutation.entity === "checkin") {
                deletedParentEntryIds.add(mutation.id);
                confirmedParentEntryIds.delete(mutation.id);
              }
            }
          } catch (error) {
            if (!isActive || !isCurrentOperation(hydrationOperation)) return;
            journalRecoveryError ??= { message: error instanceof Error ? error.message : "Could not persist a Journal deletion tombstone." };
          }
          continue;
        }

        const replayResult = await replayHealthJournalPendingUpsertMutation({
          blockedParentEntryIds,
          confirmedParentEntryIds,
          journal: journalPendingMutationsRef.current,
          key,
          mutation,
          persist: (nextJournal) => {
            journalPendingMutationsRef.current = nextJournal;
            const result = persistHealthJournalPendingMutations(userId, nextJournal);
            if (!result.ok) {
              healthLocalPersistenceFailureRef.current = {
                mode: "local",
                reason: result.reason,
                source: "journal-pending",
              };
            }
            return result.ok;
          },
          remote: pendingReplayClient,
          userId,
        });
        journalPendingMutationsRef.current = replayResult.journal;
        if (!isActive || !isCurrentOperation(hydrationOperation)) return;
        if (replayResult.status === "completed") {
          const confirmedMutation = replayResult.journal[key];
          if (confirmedMutation) completedPendingMutations.push({ key, mutation: confirmedMutation });
          if (mutation.entity === "checkin") confirmedParentEntryIds.add(mutation.row.id);
        } else {
          ambiguousPendingMutationCount += 1;
          journalRecoveryError ??= replayResult.error ?? { message: `Journal ${mutation.entity.replaceAll("_", " ")} ${mutation.row.id} remains held locally.` };
        }
      }

      const nextPendingJournalMutations = clearCompletedHealthJournalPendingMutations(
        journalPendingMutationsRef.current,
        completedPendingMutations,
      );
      if (nextPendingJournalMutations !== journalPendingMutationsRef.current) {
        journalPendingMutationsRef.current = nextPendingJournalMutations;
        const pendingWriteResult = persistHealthJournalPendingMutations(userId, nextPendingJournalMutations);
        if (!pendingWriteResult.ok) {
          healthLocalPersistenceFailureRef.current = {
            mode: "local",
            reason: pendingWriteResult.reason,
            source: "journal-pending",
          };
          journalRecoveryError ??= { message: "Completed Journal recovery could not be cleared from local storage; it will be checked again safely." };
        }
      }
      if (journalRecoveryError) {
        setMessage({
          tone: "warn",
          text: `Some explicitly pending Journal writes remain queued locally and will retry on a later Health hydration: ${journalRecoveryError.message}`,
        });
      }
      if (ambiguousPendingMutationCount > 0) {
        setMessage({
          tone: "warn",
          text: `${ambiguousPendingMutationCount} ambiguous cached Journal record${ambiguousPendingMutationCount === 1 ? " was" : "s were"} held locally. They were not restored or uploaded.`,
        });
      }

      const pendingMutationsForProjection = {
        ...pendingMutationsAtHydrationStart,
        ...journalPendingMutationsRef.current,
      };
      const remoteCheckIns = (checkInsResult.data ?? []).map(normalizeHealthCheckIn);
      const remoteJournalSignals = (journalSignalsResult.data ?? []).map(normalizeHealthJournalSignal);
      const remoteJournalSignalValues = journalSignalValuesResult.data ?? [];
      const remoteJournalSignalOccurrences = (journalSignalOccurrencesResult.data ?? []).map(normalizeHealthJournalSignalOccurrence);
      const remoteSymptoms = symptomsResult.data ?? [];
      const remoteSymptomEntries = normalizeHealthSymptomEntries(symptomEntriesResult.data ?? []);

      const remoteWorkouts = sortHealthWorkouts(workoutsResult.data ?? []);
      const latestLocalWorkouts = healthSnapshotRef.current?.workouts ?? localState.snapshot.workouts;
      const workoutRecovery = workoutsResult.error
        ? { mergedWorkouts: latestLocalWorkouts, unreconciledLocalWorkouts: [] }
        : reconcileHealthWorkouts(latestLocalWorkouts, remoteWorkouts);

      if (!isActive || !isCurrentOperation(hydrationOperation)) {
        return;
      }
      if (!workoutsResult.error && workoutRecovery.unreconciledLocalWorkouts.length > 0) {
        const { error: recoveryError } = await client
          .from("adhdice_health_workouts")
          .upsert(
            workoutRecovery.unreconciledLocalWorkouts.map((workout) => ({ ...workout, user_id: userId })),
            { ignoreDuplicates: true, onConflict: "id" },
          );
        if (!isActive || !isCurrentOperation(hydrationOperation)) {
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
          if (!isActive || !isCurrentOperation(hydrationOperation)) {
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
          if (!isActive || !isCurrentOperation(hydrationOperation)) {
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
        rememberHealthLocalPersistenceFailure(
          persistHealthMealPlanPendingMutations(userId, nextPendingMealPlanMutations),
          "local",
          "meal-plan-pending",
        );
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

      if (!isActive || !isCurrentOperation(hydrationOperation)) {
        return;
      }

      const remoteSnapshot = buildHealthSnapshot({
        awards: awardsResult.data ?? [],
        checkIns: checkInsResult.error
          ? latestLocalCheckIns
          : replayHealthJournalPendingMutations("checkin", remoteCheckIns, pendingMutationsForProjection, userId).sort(sortHealthJournalEntries),
        journalSignals: journalSignalsResult.error
          ? latestLocalJournalSignals
          : replayHealthJournalPendingMutations("signal", remoteJournalSignals, pendingMutationsForProjection, userId).map(normalizeHealthJournalSignal).sort(sortHealthJournalSignals),
        journalSignalValues: journalSignalValuesResult.error
          ? latestLocalJournalSignalValues
          : replayHealthJournalPendingMutations("signal_value", remoteJournalSignalValues, pendingMutationsForProjection, userId),
        journalSignalOccurrences: journalSignalOccurrencePersistenceError
          ? latestLocalJournalSignalOccurrences
          : replayHealthJournalPendingMutations("signal_occurrence", remoteJournalSignalOccurrences, pendingMutationsForProjection, userId).map(normalizeHealthJournalSignalOccurrence).sort(sortHealthJournalSignalOccurrences),
        favorites: (favoritesResult.data ?? []).map(normalizeHealthFoodLibraryItem),
        importAudits: importAuditsResult.data ?? [],
        mealEntries: mealEntriesResult.data ?? [],
        mealPlanEntries: replayedMealPlans,
        metricEntries: metricEntriesResult.data ?? [],
        profile: (() => {
          const remoteProfile = normalizeHealthProfile(profileResult.data, userId);
          return { ...remoteProfile, journal_questions: normalizeHealthJournalCustomQuestions(remoteProfile.journal_questions) };
        })(),
        recipes: recipesResult.data ?? [],
        savedMeals: savedMealsResult.data ?? [],
        symptomEntries: symptomEntriesResult.error
          ? latestLocalSymptomEntries
          : sortHealthSymptomEntries(replayHealthJournalPendingMutations("symptom_entry", remoteSymptomEntries, pendingMutationsForProjection, userId)),
        symptoms: symptomsResult.error
          ? latestLocalSymptoms
          : sortHealthSymptoms(replayHealthJournalPendingMutations("symptom", remoteSymptoms, pendingMutationsForProjection, userId).map(normalizeHealthSymptom)),
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
      if (!isActive || !isCurrentOperation(hydrationOperation)) {
        return;
      }
      setStorageMode("remote");
      applySnapshot(snapshotToApply, { persistenceMode: "remote" });
      healthRemoteAuthorityRef.current = {
        client,
        hydratedAt: Date.now(),
        snapshot: healthSnapshotRef.current ?? snapshotToApply,
        userId,
      };
      await claimEligibleAwards(snapshotToApply, hydrationOperation, { persistRemotely: true, silent: true });
      if (!isActive || !isCurrentOperation(hydrationOperation)) {
        return;
      }
      if (isWorkspacePerformanceDiagnosticsEnabled()) {
        console.info(`[health] hydrated pages=${healthPageCount} user=${userId}`);
      }
      setIsLoading(false);
    })();

    return () => {
      isActive = false;
    };
  }, [active, client, healthRefreshNonce, userId]);

  useEffect(() => {
    if (!active || !client || !userId || typeof window === "undefined") return;
    let wasOnline = window.navigator.onLine;
    const requestAuthorityReconciliation = () => {
      const authority = healthRemoteAuthorityRef.current;
      if (!authority || authority.client !== client || authority.userId !== userId) return;
      healthForceRemoteHydrationRef.current = true;
      setHealthRefreshNonce((current) => current + 1);
    };
    const handleOnline = () => {
      if (!wasOnline) requestAuthorityReconciliation();
      wasOnline = true;
    };
    const handleOffline = () => {
      wasOnline = false;
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) requestAuthorityReconciliation();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [active, client, userId]);

  async function saveProfile(updates: HealthProfileUpdate) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;

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
      if (!isCurrentOperation(operation)) return false;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }

    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Health goals saved." });
    return true;
  }

  async function saveJournalQuestions(questions: readonly HealthJournalCustomQuestion[]) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
    const nextQuestions = normalizeHealthJournalCustomQuestions(questions);
    const now = new Date().toISOString();
    const nextProfile: HealthProfile = {
      ...profile,
      journal_questions: nextQuestions,
      updated_at: now,
    };
    let savedLocallyBecauseMigrationIsPending = false;
    if (client && storageMode === "remote") {
      const { error } = await client
        .from("adhdice_health_profiles")
        .upsert({ journal_questions: nextQuestions, user_id: userId });
      if (!isCurrentOperation(operation)) return false;
      if (error && !isMissingHealthPersistence(error.message)) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      if (error) {
        savedLocallyBecauseMigrationIsPending = true;
        setMessage({ tone: "neutral", text: "Journal questions are saved locally until the 7.13.43 Journal migration is applied." });
      }
    }
    if (!isCurrentOperation(operation)) return false;
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
    if (!isCurrentOperation(operation)) return false;
    applySnapshot(buildHealthSnapshot({ ...currentSnapshot, profile: nextProfile }), {
      persistenceMode: client && storageMode === "remote" && !savedLocallyBecauseMigrationIsPending ? "remote" : "local",
    });
    if (!savedLocallyBecauseMigrationIsPending) {
      setHealthSuccessMessage({ tone: "good", text: "Journal check-in questions saved." });
    } else if (healthLocalPersistenceFailureRef.current) {
      setHealthSuccessMessage({ tone: "good", text: "Journal check-in questions saved." });
    }
    return true;
  }

  function loadJournalTriggerData() {
    if (!userId) return Promise.resolve(false);
    if (!active || !client) {
      setJournalTriggerRequestOwnerId(userId);
      setJournalTriggerDataError("Journal Triggers require an available remote connection. No remote Trigger data was loaded.");
      setIsLoadingJournalTriggers(false);
      return Promise.resolve(false);
    }
    if (journalTriggerLoadedOwnerRef.current === userId) return Promise.resolve(true);
    const existingLoad = journalTriggerLoadInFlightRef.current;
    if (existingLoad?.userId === userId && existingLoad.client === client) return existingLoad.promise;

    const loadGeneration = journalTriggerLoadGenerationRef.current;
    const isCurrentTriggerLoad = () => active
      && healthOwnerRef.current.active
      && healthOwnerRef.current.userId === userId
      && journalTriggerLoadGenerationRef.current === loadGeneration;
    setIsLoadingJournalTriggers(true);
    setJournalTriggerDataError(null);
    setJournalTriggerRequestOwnerId(userId);
    const promise = (async () => {
      try {
        const [nextTriggers, nextLinks] = await Promise.all([
          listHealthJournalTriggers(userId, client),
          readHealthJournalTriggerLinks(userId, client),
        ]);
        if (!isCurrentTriggerLoad()) return false;
        setJournalTriggers(nextTriggers);
        setJournalTriggerLinks(nextLinks);
        setHasLoadedJournalTriggerData(true);
        setJournalTriggerDataOwnerId(userId);
        journalTriggerLoadedOwnerRef.current = userId;
        journalTriggerOwnerRef.current = userId;
        return true;
      } catch (error) {
        if (!isCurrentTriggerLoad()) return false;
        const message = error instanceof Error ? error.message : "Could not load Journal Triggers.";
        setJournalTriggerDataError(message);
        return false;
      } finally {
        if (isCurrentTriggerLoad()) setIsLoadingJournalTriggers(false);
      }
    })();
    journalTriggerLoadInFlightRef.current = { client, promise, userId };
    void promise.then(() => {
      if (journalTriggerLoadInFlightRef.current?.promise === promise) journalTriggerLoadInFlightRef.current = null;
    });
    return promise;
  }

  async function createJournalTrigger(value: string) {
    if (!userId || !client) {
      setJournalTriggerDataError("Journal Triggers require an available remote connection. No local-only Trigger was created.");
      return null;
    }
    const identity = getHealthJournalTriggerNameIdentity(value);
    if (!identity) {
      setJournalTriggerDataError("Trigger name cannot be empty.");
      return null;
    }
    const existing = journalTriggers.find((trigger) => getHealthJournalTriggerNameIdentity(trigger.name) === identity);
    if (existing) {
      if (existing.archived_at !== null) {
        setJournalTriggerDataError("That Trigger name is archived. Restore it in the Trigger Library before using it again.");
        return null;
      }
      setJournalTriggerDataError(null);
      return existing;
    }
    const operation = captureOperation();
    if (!operation) return null;
    try {
      const created = await createHealthJournalTrigger(userId, value, client);
      if (!isCurrentOperation(operation)) return null;
      setJournalTriggers((current) => current.some((trigger) => trigger.id === created.id) ? current : [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
      setJournalTriggerDataError(null);
      return created;
    } catch (error) {
      if (!isCurrentOperation(operation)) return null;
      // A concurrent normalized-name insert may have won the unique constraint.
      try {
        const latest = await listHealthJournalTriggers(userId, client);
        if (!isCurrentOperation(operation)) return null;
        setJournalTriggers(latest);
        const matching = latest.find((trigger) => getHealthJournalTriggerNameIdentity(trigger.name) === identity && trigger.archived_at === null);
        if (matching) {
          setJournalTriggerDataError(null);
          return matching;
        }
      } catch {
        // Keep the original remote create failure visible below.
      }
      const message = error instanceof Error ? error.message : "Could not create Journal Trigger.";
      setJournalTriggerDataError(message);
      return null;
    }
  }

  async function saveJournalEntry(input: HealthJournalEntrySaveInput): Promise<HealthJournalEntrySaveResult | null> {
    if (!userId || !profile) {
      return null;
    }
    const operation = captureOperation();
    if (!operation) return null;
    const triggerReplacements = input.triggerAssociationReplacements ?? [];
    if (triggerReplacements.length > 0) {
      if (!client || storageMode !== "remote" || !journalRemoteEnabledRef.current) {
        setMessage({ tone: "warn", text: "Journal Triggers need remote Journal persistence. No local-only Trigger save was made." });
        return null;
      }
      if (triggerReplacements.some((replacement) => replacement.occurrence_kind === "symptom"
        ? !symptomEntriesRemoteEnabledRef.current
        : !journalSignalOccurrencesRemoteEnabledRef.current)) {
        setMessage({ tone: "warn", text: "Journal Trigger associations need remotely saved Feeling occurrences. No Trigger replacement was made." });
        return null;
      }
      const targets = new Set<string>();
      for (const replacement of triggerReplacements) {
        const occurrenceRows = replacement.occurrence_kind === "symptom" ? input.symptomOccurrences : input.journalSignalOccurrences;
        if (!replacement.occurrence_id || !occurrenceRows.some((occurrence) => occurrence.id === replacement.occurrence_id)) {
          setMessage({ tone: "warn", text: "A Trigger association must target an occurrence included in this Journal save." });
          return null;
        }
        const key = `${replacement.occurrence_kind}:${replacement.occurrence_id}`;
        if (targets.has(key)) {
          setMessage({ tone: "warn", text: "A Journal occurrence can only be replaced once per save." });
          return null;
        }
        targets.add(key);
        const associations = validateHealthJournalTriggerAssociationDrafts(replacement.associations);
        const expected = validateHealthJournalTriggerAssociationDrafts(replacement.expected_associations);
        if (!associations.valid || !expected.valid) {
          setMessage({ tone: "warn", text: !associations.valid ? associations.error : !expected.valid ? expected.error : "Journal Trigger association is invalid." });
          return null;
        }
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
      journalSignalOccurrences,
      symptoms,
      symptomEntries,
      waterEntries,
      weightEntries,
    });
    const isValidNativeJournalSignal = (signal: HealthJournalSignal | undefined) =>
      signal?.user_id === userId && (signal.kind === "emotion" || signal.kind === "other");
    const hasInvalidNativeOccurrenceSignal = input.journalSignalOccurrences.some((occurrence) => {
      const signal = currentSnapshot.journalSignals.find((candidate) => candidate.id === occurrence.signal_id);
      return !isValidNativeJournalSignal(signal);
    });
    if (hasInvalidNativeOccurrenceSignal) {
      setMessage({ tone: "warn", text: "Choose an Emotion or Other Feeling for each occurrence." });
      return null;
    }
    const now = new Date().toISOString();
    const requestedEntryId = input.checkIn.id;
    const existingRow = requestedEntryId
      ? currentSnapshot.checkIns.find((entry) => entry.id === requestedEntryId) ?? null
      : null;
    if (requestedEntryId && !existingRow && !input.allowInsertWithId) {
      setMessage({ tone: "warn", text: "That Journal Entry is no longer available." });
      return null;
    }
    const entryTime = normalizeHealthMealTime(input.checkIn.entry_time);
    if (!entryTime) {
      setMessage({ tone: "warn", text: "Journal Entry time is required." });
      return null;
    }
    const localRow: HealthCheckIn = {
      created_at: existingRow?.created_at ?? now,
      energy_score: input.checkIn.energy_score !== undefined ? input.checkIn.energy_score : existingRow?.energy_score ?? null,
      entry_date: input.checkIn.entry_date,
      entry_time: entryTime,
      entry_type: input.checkIn.entry_type ?? existingRow?.entry_type ?? "event",
      id: requestedEntryId ?? createLocalId("health-checkin"),
      mood_score: input.checkIn.mood_score !== undefined ? input.checkIn.mood_score : existingRow?.mood_score ?? null,
      stress_score: input.checkIn.stress_score !== undefined ? input.checkIn.stress_score : existingRow?.stress_score ?? null,
      clarity_score: input.checkIn.clarity_score !== undefined ? input.checkIn.clarity_score : existingRow?.clarity_score ?? null,
      reflection: input.checkIn.reflection !== undefined ? input.checkIn.reflection : existingRow?.reflection ?? "",
      symptom_tags: input.checkIn.symptom_tags !== undefined ? input.checkIn.symptom_tags : existingRow?.symptom_tags ?? [],
      structured_answers: input.checkIn.structured_answers ?? existingRow?.structured_answers ?? { custom_answers: [], schema_version: 1 },
      updated_at: now,
      user_id: userId,
    };

    let nextRow = localRow;
    const currentValues = currentSnapshot.journalSignalValues.filter((value) => value.journal_entry_id === nextRow.id);
    if (input.signalValues.some((draft) => !currentSnapshot.journalSignals.some((signal) => signal.id === draft.signal_id))) {
      setMessage({ tone: "warn", text: "Choose valid template Feelings before saving the Journal Entry." });
      return null;
    }
    if (input.signalValues.some((draft) => draft.score !== null && normalizeHealthJournalScore(draft.score) !== draft.score)) {
      setMessage({ tone: "warn", text: "Snapshot Feeling scores must be between 0 and 10." });
      return null;
    }
    const symptomOccurrenceOwnershipError = getHealthJournalOccurrenceOwnershipError(
      input.symptomOccurrences,
      currentSnapshot.symptomEntries,
      nextRow.id,
    );
    const journalSignalOccurrenceOwnershipError = getHealthJournalOccurrenceOwnershipError(
      input.journalSignalOccurrences,
      currentSnapshot.journalSignalOccurrences,
      nextRow.id,
    );
    const occurrenceOwnershipError = symptomOccurrenceOwnershipError ?? journalSignalOccurrenceOwnershipError;
    if (occurrenceOwnershipError) {
      setMessage({ tone: "warn", text: occurrenceOwnershipError });
      return null;
    }
    for (const occurrence of input.symptomOccurrences) {
      const occurrenceSymptom = currentSnapshot.symptoms.find((symptom) => symptom.id === occurrence.symptom_id);
      const occurrenceSignal = currentSnapshot.journalSignals.find((signal) => signal.kind === "symptom" && signal.symptom_id === occurrence.symptom_id);
      const occurrenceDenominator = getHealthJournalScaleDenominator(occurrenceSignal);
      const isExistingArchivedOccurrence = occurrence.id
        ? currentSnapshot.symptomEntries.some((entry) => entry.id === occurrence.id && entry.journal_entry_id === nextRow.id)
        : false;
      if (!occurrenceSymptom || (occurrenceSymptom.archived_at !== null && !isExistingArchivedOccurrence)) {
        setMessage({ tone: "warn", text: "Choose an active symptom for each occurrence." });
        return null;
      }
      if (!Number.isInteger(occurrence.severity) || occurrence.severity < 1 || occurrence.severity > occurrenceDenominator) {
        setMessage({ tone: "warn", text: `Feeling occurrence severity must be between 1 and ${occurrenceDenominator}.` });
        return null;
      }
    }
    for (const occurrence of input.journalSignalOccurrences) {
      const signal = currentSnapshot.journalSignals.find((candidate) => candidate.id === occurrence.signal_id);
      const occurrenceDenominator = getHealthJournalScaleDenominator(signal);
      const isExistingOccurrence = occurrence.id
        ? currentSnapshot.journalSignalOccurrences.some((candidate) => candidate.id === occurrence.id && candidate.journal_entry_id === nextRow.id)
        : false;
      if (!isValidNativeJournalSignal(signal) || (signal?.archived_at !== null && !isExistingOccurrence)) {
        setMessage({ tone: "warn", text: "Choose an active Emotion or Other Feeling for each occurrence." });
        return null;
      }
      if (!Number.isInteger(occurrence.score) || occurrence.score < 1 || occurrence.score > occurrenceDenominator || !occurrence.occurred_at || !Number.isFinite(Date.parse(occurrence.occurred_at))) {
        setMessage({ tone: "warn", text: `Feeling occurrences need a score from 1 to ${occurrenceDenominator} and a valid time.` });
        return null;
      }
    }
    if (client && storageMode === "remote" && journalRemoteEnabledRef.current) {
      try {
        const occurrenceClient = client as unknown as HealthJournalOccurrencePersistenceClient;
        const [symptomRemoteOwners, signalRemoteOwners] = await Promise.all([
          symptomEntriesRemoteEnabledRef.current
            ? readHealthJournalOccurrenceOwners(
            occurrenceClient,
            "adhdice_health_symptom_entries",
            userId,
            input.symptomOccurrences.flatMap((occurrence) => occurrence.id ? [occurrence.id] : []),
            )
            : Promise.resolve([]),
          journalSignalOccurrencesRemoteEnabledRef.current
            ? readHealthJournalOccurrenceOwners(
            occurrenceClient,
            "adhdice_health_journal_signal_occurrences",
            userId,
            input.journalSignalOccurrences.flatMap((occurrence) => occurrence.id ? [occurrence.id] : []),
            )
            : Promise.resolve([]),
        ]);
        if (!isCurrentOperation(operation)) return null;
        const remoteOwnershipError = getHealthJournalOccurrenceOwnershipError(input.symptomOccurrences, symptomRemoteOwners, nextRow.id)
          ?? getHealthJournalOccurrenceOwnershipError(input.journalSignalOccurrences, signalRemoteOwners, nextRow.id);
        if (remoteOwnershipError) {
          setMessage({ tone: "warn", text: remoteOwnershipError });
          return null;
        }
      } catch (error) {
        if (!isCurrentOperation(operation)) return null;
        setMessage({ tone: "warn", text: error instanceof Error ? error.message : "Could not confirm Feeling occurrence ownership." });
        return null;
      }
      const pendingDelete = journalPendingMutationsRef.current[getHealthJournalPendingMutationKey("checkin", localRow.id)];
      if (pendingDelete?.operation === "delete") {
        setMessage({ tone: "warn", text: "This Journal Entry is pending deletion and cannot be recreated." });
        return null;
      }
      const saveResult = await saveJournalPendingUpsert(
        "checkin",
        localRow,
        existingRow ? "update" : "create",
        journalRemoteEnabledRef.current,
      );
      if (!isCurrentOperation(operation)) return null;
      if (saveResult.error) {
        setMessage({ tone: "warn", text: saveResult.error });
        return null;
      }
      nextRow = normalizeHealthCheckIn(saveResult.row as HealthCheckIn);
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
        time_is_estimated: occurrence.time_is_estimated === true,
        updated_at: now,
        user_id: userId,
      } satisfies HealthSymptomEntry;
    });
    const keptOccurrenceIds = new Set(occurrenceRows.map((entry) => entry.id));
    const removedOccurrences = currentOwnedOccurrences.filter((entry) => !keptOccurrenceIds.has(entry.id));

    const currentOwnedJournalSignalOccurrences = currentSnapshot.journalSignalOccurrences.filter((entry) => entry.journal_entry_id === nextRow.id);
    const journalSignalOccurrenceRows: HealthJournalSignalOccurrence[] = input.journalSignalOccurrences.map((occurrence) => {
      const current = occurrence.id
        ? currentOwnedJournalSignalOccurrences.find((entry) => entry.id === occurrence.id)
        : undefined;
      return {
        created_at: current?.created_at ?? now,
        entry_date: nextRow.entry_date,
        id: occurrence.id ?? current?.id ?? createLocalId("health-journal-occurrence"),
        journal_entry_id: nextRow.id,
        note: occurrence.note ?? null,
        occurred_at: occurrence.occurred_at,
        score: occurrence.score,
        signal_id: occurrence.signal_id,
        time_is_estimated: occurrence.time_is_estimated === true,
        updated_at: now,
        user_id: userId,
      } satisfies HealthJournalSignalOccurrence;
    });
    const keptJournalSignalOccurrenceIds = new Set(journalSignalOccurrenceRows.map((entry) => entry.id));
    const removedJournalSignalOccurrences = currentOwnedJournalSignalOccurrences.filter((entry) => !keptJournalSignalOccurrenceIds.has(entry.id));

    let childWriteError: { message: string } | null = null;
    const saveChildRows = async <TRow extends HealthJournalPendingUpsert["row"]>(
      entity: HealthJournalPendingEntity,
      rows: TRow[],
      currentRows: readonly TRow[],
      enabled: boolean,
    ) => {
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!;
        const existedLocally = currentRows.some((current) => current.id === row.id);
        const result = await saveJournalPendingUpsert(
          entity,
          row,
          existedLocally ? "update" : "create",
          enabled,
        );
        if (!isCurrentOperation(operation)) return false;
        if (result.error) {
          childWriteError = { message: result.error };
          return false;
        }
        rows[index] = result.row as TRow;
      }
      return true;
    };
    const journalRemoteEnabled = Boolean(client && storageMode === "remote" && journalRemoteEnabledRef.current);
    const symptomEntriesRemoteEnabled = Boolean(client && storageMode === "remote" && symptomEntriesRemoteEnabledRef.current);
    const journalSignalOccurrencesRemoteEnabled = Boolean(client && storageMode === "remote" && journalSignalOccurrencesRemoteEnabledRef.current);

    if (scoredValues.length > 0) {
      await saveChildRows("signal_value", scoredValues, currentValues, journalRemoteEnabled);
    }
    if (!childWriteError) {
      for (const value of removedValues) {
        if (!recordJournalPendingMutation({ entity: "signal_value", id: value.id, journalEntryId: nextRow.id, operation: "delete" }).ok) {
          childWriteError = { message: "The Feeling value deletion could not be saved locally; no remote deletion was attempted." };
          break;
        }
        if (journalRemoteEnabled && client) {
          try {
            await deleteHealthJournalRecordWithTombstone({
              client: client as unknown as Parameters<typeof deleteHealthJournalRecordWithTombstone>[0]["client"],
              entity: "signal_value",
              id: value.id,
              journalEntryId: nextRow.id,
            });
            clearJournalPendingMutation("signal_value", value.id);
          } catch (error) {
            childWriteError = { message: error instanceof Error ? error.message : `Could not confirm removal of Journal Feeling value ${value.id}.` };
            break;
          }
        }
      }
    }
    if (!childWriteError && occurrenceRows.length > 0) {
      await saveChildRows("symptom_entry", occurrenceRows, currentOwnedOccurrences, symptomEntriesRemoteEnabled);
    }
    if (!childWriteError) {
      for (const entry of removedOccurrences) {
        if (!recordJournalPendingMutation({ entity: "symptom_entry", id: entry.id, journalEntryId: nextRow.id, operation: "delete" }).ok) {
          childWriteError = { message: "The Symptom occurrence deletion could not be saved locally; no remote deletion was attempted." };
          break;
        }
        if (symptomEntriesRemoteEnabled && client) {
          try {
            await deleteHealthJournalRecordWithTombstone({
              client: client as unknown as Parameters<typeof deleteHealthJournalRecordWithTombstone>[0]["client"],
              entity: "symptom_entry",
              id: entry.id,
              journalEntryId: nextRow.id,
            });
            clearJournalPendingMutation("symptom_entry", entry.id);
          } catch (error) {
            childWriteError = { message: error instanceof Error ? error.message : `Could not confirm removal of Journal symptom occurrence ${entry.id}.` };
            break;
          }
        }
      }
    }
    if (!childWriteError && journalSignalOccurrenceRows.length > 0) {
      await saveChildRows("signal_occurrence", journalSignalOccurrenceRows, currentOwnedJournalSignalOccurrences, journalSignalOccurrencesRemoteEnabled);
      for (let index = 0; index < journalSignalOccurrenceRows.length; index += 1) {
        journalSignalOccurrenceRows[index] = normalizeHealthJournalSignalOccurrence(journalSignalOccurrenceRows[index]!);
      }
    }
    if (!childWriteError) {
      for (const occurrence of removedJournalSignalOccurrences) {
        if (!recordJournalPendingMutation({ entity: "signal_occurrence", id: occurrence.id, journalEntryId: nextRow.id, operation: "delete" }).ok) {
          childWriteError = { message: "The Feeling occurrence deletion could not be saved locally; no remote deletion was attempted." };
          break;
        }
        if (journalSignalOccurrencesRemoteEnabled && client) {
          try {
            await deleteHealthJournalRecordWithTombstone({
              client: client as unknown as Parameters<typeof deleteHealthJournalRecordWithTombstone>[0]["client"],
              entity: "signal_occurrence",
              id: occurrence.id,
              journalEntryId: nextRow.id,
            });
            clearJournalPendingMutation("signal_occurrence", occurrence.id);
          } catch (error) {
            childWriteError = { message: error instanceof Error ? error.message : `Could not confirm removal of Journal Feeling occurrence ${occurrence.id}.` };
            break;
          }
        }
      }
    }
    if (!isCurrentOperation(operation)) return null;

    let triggerAssociationSaveError: string | null = null;
    if (triggerReplacements.length > 0 && !childWriteError) {
      const symptomTargetIds = triggerReplacements.filter((replacement) => replacement.occurrence_kind === "symptom").map((replacement) => replacement.occurrence_id);
      const signalTargetIds = triggerReplacements.filter((replacement) => replacement.occurrence_kind === "journal_signal").map((replacement) => replacement.occurrence_id);
      let occurrenceWritesContainTargets = false;
      if (client && symptomTargetIds.length > 0) {
        const { data, error } = await client.from("adhdice_health_symptom_entries").select("id")
          .eq("user_id", userId).eq("journal_entry_id", nextRow.id).in("id", symptomTargetIds);
        if (!isCurrentOperation(operation)) return null;
        occurrenceWritesContainTargets = !error && (data?.length ?? 0) === symptomTargetIds.length;
        if (error) triggerAssociationSaveError = `Could not confirm saved Symptom occurrences: ${error.message}`;
      } else {
        occurrenceWritesContainTargets = true;
      }
      if (client && signalTargetIds.length > 0) {
        const { data, error } = await client.from("adhdice_health_journal_signal_occurrences").select("id")
          .eq("user_id", userId).eq("journal_entry_id", nextRow.id).in("id", signalTargetIds);
        if (!isCurrentOperation(operation)) return null;
        occurrenceWritesContainTargets = occurrenceWritesContainTargets && !error && (data?.length ?? 0) === signalTargetIds.length;
        if (error) triggerAssociationSaveError = `Could not confirm saved Feeling occurrences: ${error.message}`;
      }
      if (!occurrenceWritesContainTargets) {
        triggerAssociationSaveError ??= "The Event was saved, but remote Feeling occurrence IDs could not be confirmed for Trigger associations.";
      } else if (!client || storageMode !== "remote") {
        triggerAssociationSaveError = "The Event was saved, but Journal Triggers were not saved remotely. Reconnect and retry.";
      } else {
        try {
          const replacementResult = await replaceHealthJournalTriggerAssociations(userId, nextRow.id, triggerReplacements, client);
          if (!isCurrentOperation(operation)) return null;
          if (!replacementResult || !Array.isArray(replacementResult.links)) {
            throw new Error("Journal Trigger replacement returned no refreshed association data.");
          }
          const replacedOccurrenceKeys = new Set(triggerReplacements.map((replacement) => `${replacement.occurrence_kind}:${replacement.occurrence_id}`));
          setJournalTriggerLinks((current) => [
            ...current.filter((link) => !replacedOccurrenceKeys.has(link.symptom_occurrence_id ? `symptom:${link.symptom_occurrence_id}` : `journal_signal:${link.journal_signal_occurrence_id}`)),
            ...replacementResult.links,
          ]);
        } catch (error) {
          if (!isCurrentOperation(operation)) return null;
          triggerAssociationSaveError = error instanceof Error ? error.message : "Could not save Journal Trigger associations.";
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
    const nextJournalSignalOccurrences = [
      ...currentSnapshot.journalSignalOccurrences.filter((entry) => entry.journal_entry_id !== nextRow.id),
      ...journalSignalOccurrenceRows,
    ];

    const nextCheckIns = [
      ...currentSnapshot.checkIns.filter((entry) => entry.id !== nextRow.id),
      nextRow,
    ].sort(sortHealthJournalEntries);
    const nextSnapshot = buildHealthSnapshot({
      ...currentSnapshot,
      checkIns: nextCheckIns,
      journalSignalValues: nextJournalSignalValues,
      journalSignalOccurrences: nextJournalSignalOccurrences,
      symptomEntries: sortHealthSymptomEntries(nextSymptomEntries),
    });
    if (!isCurrentOperation(operation)) return null;
    applySnapshot(nextSnapshot, {
      persistenceMode: client && storageMode === "remote" && journalRemoteEnabledRef.current ? "remote" : "local",
    });
    if (childWriteError) {
      if (isMissingHealthPersistence(childWriteError.message)) {
        journalRemoteEnabledRef.current = false;
        journalSignalOccurrencesRemoteEnabledRef.current = false;
      }
      setMessage({
        tone: "warn",
        text: `Journal Entry core fields were saved, but a Feeling value or occurrence update failed: ${childWriteError.message}`,
      });
      return null;
    }
    await claimEligibleAwards(nextSnapshot, operation, { persistRemotely: storageMode === "remote" });
    if (!isCurrentOperation(operation)) return null;
    if (triggerAssociationSaveError) {
      const partialMessage = `The Journal Event and Feeling occurrences were saved, but Trigger associations were not saved. Keep this draft and retry: ${triggerAssociationSaveError}`;
      setMessage({ tone: "warn", text: partialMessage });
      return { entry: nextRow, triggerAssociationError: partialMessage };
    }
    setHealthSuccessMessage({ tone: "good", text: existingRow ? "Journal Entry updated." : "Journal Entry saved." });
    return { entry: nextRow };
  }

  async function saveCheckIn(input: Omit<HealthCheckInInsert, "user_id">) {
    const result = await saveJournalEntry({ checkIn: input, journalSignalOccurrences: [], signalValues: [], symptomOccurrences: [] });
    return result?.entry ?? null;
  }

  async function createJournalSignal(input: Omit<HealthJournalSignalInsert, "user_id">) {
    if (!userId || !profile) return null;
    const operation = captureOperation();
    if (!operation) return null;
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
        if (!isCurrentOperation(operation)) return null;
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
      color: kind === "symptom" ? null : input.color ?? null,
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
    const remoteEnabled = Boolean(client && storageMode === "remote" && journalRemoteEnabledRef.current);
    const saveResult = await saveJournalPendingUpsert("signal", localRow, "create", remoteEnabled);
    if (!isCurrentOperation(operation)) return null;
    if (saveResult.error) {
      if (isMissingHealthPersistence(saveResult.error)) journalRemoteEnabledRef.current = false;
      setMessage({ tone: "warn", text: saveResult.error });
      return null;
    }
    const nextRow = normalizeHealthJournalSignal(saveResult.row as HealthJournalSignal);
    if (!isCurrentOperation(operation)) return null;
    applySnapshot(buildHealthSnapshot({
      ...currentSnapshot,
      journalSignals: [...currentSnapshot.journalSignals, nextRow].sort(sortHealthJournalSignals),
    }), {
      persistenceMode: client && storageMode === "remote" && journalRemoteEnabledRef.current ? "remote" : "local",
    });
    setHealthSuccessMessage({ tone: "good", text: `${getHealthJournalSignalDisplayName(nextRow, currentSnapshot.symptoms)} added to Journal Library.` });
    return nextRow;
  }

  async function updateJournalSignal(signalId: string, input: HealthJournalSignalUpdate) {
    if (!userId || !profile) return false;
    const operation = captureOperation();
    if (!operation) return false;
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
    const remoteEnabled = Boolean(client && storageMode === "remote" && journalRemoteEnabledRef.current);
    const saveResult = await saveJournalPendingUpsert("signal", nextRow, "update", remoteEnabled);
    if (!isCurrentOperation(operation)) return false;
    if (saveResult.error) {
      if (isMissingHealthPersistence(saveResult.error)) journalRemoteEnabledRef.current = false;
      setMessage({ tone: "warn", text: saveResult.error });
      return false;
    }
    if (!isCurrentOperation(operation)) return false;
    applySnapshot(buildHealthSnapshot({
      ...currentSnapshot,
      journalSignals: currentSnapshot.journalSignals.map((signal) => signal.id === signalId ? nextRow : signal).sort(sortHealthJournalSignals),
    }), {
      persistenceMode: client && storageMode === "remote" && journalRemoteEnabledRef.current ? "remote" : "local",
    });
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
    const operation = captureOperation();
    if (!operation) return false;
    const saved = await updateJournalSignal(signalId, { archived_at: new Date().toISOString(), in_template: false, template_sort_order: null });
    if (!isCurrentOperation(operation)) return false;
    if (saved) setHealthSuccessMessage({ tone: "good", text: "Feeling archived." });
    return saved;
  }

  async function deleteJournalSignal(signalId: string) {
    if (!userId || !profile) return false;
    const operation = captureOperation();
    if (!operation) return false;
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
    if (
      currentSnapshot.journalSignalValues.some((value) => value.signal_id === signalId)
      || currentSnapshot.journalSignalOccurrences.some((occurrence) => occurrence.signal_id === signalId)
    ) {
      setMessage({ tone: "warn", text: "This Feeling has history. Archive it instead of deleting it." });
      return false;
    }
    const pendingMutationKey = getHealthJournalPendingMutationKey("signal", signalId);
    const pendingSignalMutation = journalPendingMutationsRef.current[pendingMutationKey];
    const hasPendingNewSignal = pendingSignalMutation?.operation === "upsert" && pendingSignalMutation.intent === "create";
    if (!recordJournalPendingMutation({ entity: "signal", id: signalId, operation: "delete" }).ok) {
      setMessage({ tone: "warn", text: "The Feeling deletion could not be saved locally, so no remote deletion was attempted." });
      return false;
    }
    let deletedRemotely = false;
    if (client && storageMode === "remote" && journalRemoteEnabledRef.current) {
      if (!isCurrentOperation(operation)) return false;
      try {
        await deleteHealthJournalRecordWithTombstone({
          client: client as unknown as Parameters<typeof deleteHealthJournalRecordWithTombstone>[0]["client"],
          entity: "signal",
          id: signalId,
        });
        deletedRemotely = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not confirm the Feeling deletion tombstone.";
        if (isMissingHealthPersistence(message)) journalRemoteEnabledRef.current = false;
        setMessage({ tone: "warn", text: message });
        return false;
      }
    }
    if (!isCurrentOperation(operation)) return false;
    applySnapshot(buildHealthSnapshot({
      ...currentSnapshot,
      journalSignals: currentSnapshot.journalSignals.filter((signal) => signal.id !== signalId),
    }), {
      persistenceMode: client && storageMode === "remote" && journalRemoteEnabledRef.current ? "remote" : "local",
    });
    setHealthSuccessMessage({
      tone: "good",
      text: deletedRemotely ? "Feeling deleted." : hasPendingNewSignal ? "Unsynced Feeling removed." : "Feeling removed locally; deletion will sync.",
    });
    return true;
  }

  async function reorderJournalSignals(orderedSignalIds: readonly string[]) {
    if (!userId || !profile) return false;
    const operation = captureOperation();
    if (!operation) return false;
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
    const remoteEnabled = Boolean(client && storageMode === "remote" && journalRemoteEnabledRef.current);
    for (const signal of nextSignals.filter((candidate) => orderById.has(candidate.id))) {
      const result = await saveJournalPendingUpsert("signal", signal, "update", remoteEnabled);
      if (!isCurrentOperation(operation)) return false;
      if (result.error) {
        setMessage({ tone: "warn", text: result.error });
        return false;
      }
    }
    if (!isCurrentOperation(operation)) return false;
    applySnapshot(buildHealthSnapshot({ ...currentSnapshot, journalSignals: nextSignals.sort(sortHealthJournalSignals) }), {
      persistenceMode: client && storageMode === "remote" && journalRemoteEnabledRef.current ? "remote" : "local",
    });
    return true;
  }

  async function deleteJournalEntry(entryId: string) {
    if (!userId || !profile) return false;
    const operation = captureOperation();
    if (!operation) return false;
    const pendingEntryKey = getHealthJournalPendingMutationKey("checkin", entryId);
    const pendingJournalEntryMutation = journalPendingMutationsRef.current[pendingEntryKey];
    const hasPendingNewEntry = pendingJournalEntryMutation?.operation === "upsert" && pendingJournalEntryMutation.intent === "create";
    if (!recordJournalPendingMutation({ entity: "checkin", id: entryId, operation: "delete" }).ok) {
      setMessage({ tone: "warn", text: "The Journal Entry deletion could not be saved locally, so no remote deletion was attempted." });
      return false;
    }
    let deletedRemotely = false;
    if (client && storageMode === "remote") {
      if (!isCurrentOperation(operation)) return false;
      try {
        await deleteHealthJournalRecordWithTombstone({
          client: client as unknown as Parameters<typeof deleteHealthJournalRecordWithTombstone>[0]["client"],
          entity: "checkin",
          id: entryId,
        });
        deletedRemotely = true;
      } catch (error) {
        setMessage({ tone: "warn", text: error instanceof Error ? error.message : "Could not confirm the Journal Entry deletion tombstone." });
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
    if (!isCurrentOperation(operation)) return false;
    const removedOccurrenceIds = new Set([
      ...currentSnapshot.symptomEntries.filter((entry) => entry.journal_entry_id === entryId).map((entry) => entry.id),
      ...currentSnapshot.journalSignalOccurrences.filter((occurrence) => occurrence.journal_entry_id === entryId).map((occurrence) => occurrence.id),
    ]);
    applySnapshot(buildHealthSnapshot({
      ...currentSnapshot,
      checkIns: currentSnapshot.checkIns.filter((entry) => entry.id !== entryId),
      journalSignalValues: currentSnapshot.journalSignalValues.filter((value) => value.journal_entry_id !== entryId),
      journalSignalOccurrences: currentSnapshot.journalSignalOccurrences.filter((occurrence) => occurrence.journal_entry_id !== entryId),
      symptomEntries: currentSnapshot.symptomEntries.filter((entry) => entry.journal_entry_id !== entryId),
    }), {
      persistenceMode: client && storageMode === "remote" ? "remote" : "local",
    });
    setJournalTriggerLinks((current) => current.filter((link) => !removedOccurrenceIds.has(link.symptom_occurrence_id ?? "")
      && !removedOccurrenceIds.has(link.journal_signal_occurrence_id ?? "")));
    setHealthSuccessMessage({
      tone: "good",
      text: deletedRemotely ? "Journal Entry deleted." : hasPendingNewEntry ? "Unsynced Journal Entry removed." : "Journal Entry removed locally; deletion will sync.",
    });
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
    const operation = captureOperation();
    if (!operation) return false;

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
    const remoteEnabled = Boolean(client && storageMode === "remote" && symptomDefinitionsRemoteEnabledRef.current);
    const saveResult = await saveJournalPendingUpsert("symptom", localRow, "update", remoteEnabled);
    if (!isCurrentOperation(operation)) return false;
    if (saveResult.error) {
      if (isMissingHealthSymptomPersistence(saveResult.error)) symptomDefinitionsRemoteEnabledRef.current = false;
      setMessage({ tone: "warn", text: saveResult.error });
      return false;
    }
    const nextRow = saveResult.row as HealthSymptom;
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
    }), {
      persistenceMode: client && storageMode === "remote" && symptomDefinitionsRemoteEnabledRef.current ? "remote" : "local",
    });
    setHealthSuccessMessage({ tone: "good", text: successText });
    return true;
  }

  async function createSymptom(input: Omit<HealthSymptomInsert, "user_id">) {
    if (!userId || !profile) {
      return null;
    }
    const operation = captureOperation();
    if (!operation) return null;

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
    const remoteEnabled = Boolean(client && storageMode === "remote" && symptomDefinitionsRemoteEnabledRef.current);
    const saveResult = await saveJournalPendingUpsert("symptom", localRow, "create", remoteEnabled);
    if (!isCurrentOperation(operation)) return null;
    if (saveResult.error) {
      if (isMissingHealthSymptomPersistence(saveResult.error)) symptomDefinitionsRemoteEnabledRef.current = false;
      setMessage({ tone: "warn", text: saveResult.error });
      return null;
    }
    const nextRow = saveResult.row as HealthSymptom;
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
    }), {
      persistenceMode: client && storageMode === "remote" && symptomDefinitionsRemoteEnabledRef.current ? "remote" : "local",
    });
    setHealthSuccessMessage({ tone: "good", text: "Symptom added." });
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
    const operation = captureOperation();
    if (!operation) return false;
    const currentSymptoms = healthSnapshotRef.current?.symptoms ?? symptoms;
    const currentSymptomEntries = healthSnapshotRef.current?.symptomEntries ?? symptomEntries;
    const currentCheckIns = healthSnapshotRef.current?.checkIns ?? checkIns;
    const journalEntry = currentCheckIns.find((entry) => entry.id === input.journal_entry_id && entry.user_id === userId);
    if (!journalEntry) {
      setMessage({ tone: "warn", text: "Feeling occurrences must belong to a Journal Entry." });
      return false;
    }
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
      journal_entry_id: input.journal_entry_id,
      logged_at: input.logged_at ?? now,
      note: normalizeHealthSymptomNote(input.note),
      severity: input.severity,
      symptom_id: input.symptom_id,
      time_is_estimated: input.time_is_estimated === true,
      updated_at: now,
      user_id: userId,
    };
    const remoteEnabled = Boolean(client && storageMode === "remote" && symptomEntriesRemoteEnabledRef.current);
    const saveResult = await saveJournalPendingUpsert("symptom_entry", localRow, "create", remoteEnabled);
    if (!isCurrentOperation(operation)) return false;
    if (saveResult.error) {
      if (isMissingHealthSymptomPersistence(saveResult.error)) symptomEntriesRemoteEnabledRef.current = false;
      setMessage({ tone: "warn", text: saveResult.error });
      return false;
    }
    const nextRow = saveResult.row as HealthSymptomEntry;
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
    }), {
      persistenceMode: client && storageMode === "remote" && symptomEntriesRemoteEnabledRef.current ? "remote" : "local",
    });
    setHealthSuccessMessage({ tone: "good", text: "Symptom entry saved." });
    return true;
  }

  async function updateSymptomEntry(entryId: string, input: HealthSymptomEntryUpdate) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
    const currentEntry = symptomEntries.find((entry) => entry.id === entryId);
    if (!currentEntry) {
      return false;
    }
    const nextJournalEntryId = input.journal_entry_id ?? currentEntry.journal_entry_id;
    if (nextJournalEntryId !== currentEntry.journal_entry_id) {
      setMessage({ tone: "warn", text: "A Feeling occurrence cannot be moved between Journal Entries." });
      return false;
    }
    const currentCheckIns = healthSnapshotRef.current?.checkIns ?? checkIns;
    if (!nextJournalEntryId || !currentCheckIns.some((entry) => entry.id === nextJournalEntryId && entry.user_id === userId)) {
      setMessage({ tone: "warn", text: "Feeling occurrences must belong to a Journal Entry." });
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
      journal_entry_id: nextJournalEntryId,
      ...(input.note === undefined ? {} : { note: normalizeHealthSymptomNote(input.note) }),
    };
    const now = new Date().toISOString();
    const localRow: HealthSymptomEntry = {
      ...currentEntry,
      ...normalizedInput,
      journal_entry_id: nextJournalEntryId,
      severity: nextSeverity,
      symptom_id: nextSymptomId,
      updated_at: now,
    };
    const remoteEnabled = Boolean(client && storageMode === "remote" && symptomEntriesRemoteEnabledRef.current);
    const saveResult = await saveJournalPendingUpsert("symptom_entry", localRow, "update", remoteEnabled);
    if (!isCurrentOperation(operation)) return false;
    if (saveResult.error) {
      if (isMissingHealthSymptomPersistence(saveResult.error)) symptomEntriesRemoteEnabledRef.current = false;
      setMessage({ tone: "warn", text: saveResult.error });
      return false;
    }
    const nextRow = saveResult.row as HealthSymptomEntry;
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
    }), {
      persistenceMode: client && storageMode === "remote" && symptomEntriesRemoteEnabledRef.current ? "remote" : "local",
    });
    setHealthSuccessMessage({ tone: "good", text: "Symptom entry updated." });
    return true;
  }

  async function deleteSymptomEntry(entryId: string) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
    const pendingEntryKey = getHealthJournalPendingMutationKey("symptom_entry", entryId);
    const pendingSymptomEntryMutation = journalPendingMutationsRef.current[pendingEntryKey];
    const hasPendingNewEntry = pendingSymptomEntryMutation?.operation === "upsert" && pendingSymptomEntryMutation.intent === "create";
    const currentSymptomEntry = (healthSnapshotRef.current?.symptomEntries ?? symptomEntries).find((entry) => entry.id === entryId);
    const journalEntryId = currentSymptomEntry?.journal_entry_id
      ?? (pendingSymptomEntryMutation?.operation === "upsert" && "journal_entry_id" in pendingSymptomEntryMutation.row ? pendingSymptomEntryMutation.row.journal_entry_id ?? undefined : undefined)
      ?? (pendingSymptomEntryMutation?.operation === "delete" ? pendingSymptomEntryMutation.journalEntryId : undefined);
    if (!recordJournalPendingMutation({ entity: "symptom_entry", id: entryId, journalEntryId, operation: "delete" }).ok) {
      setMessage({ tone: "warn", text: "The Symptom occurrence deletion could not be saved locally, so no remote deletion was attempted." });
      return false;
    }
    let deletedRemotely = false;
    if (client && storageMode === "remote" && symptomEntriesRemoteEnabledRef.current) {
      if (!isCurrentOperation(operation)) return false;
      try {
        await deleteHealthJournalRecordWithTombstone({
          client: client as unknown as Parameters<typeof deleteHealthJournalRecordWithTombstone>[0]["client"],
          entity: "symptom_entry",
          id: entryId,
          ...(journalEntryId ? { journalEntryId } : {}),
        });
        deletedRemotely = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not confirm the Symptom occurrence deletion tombstone.";
        if (isMissingHealthSymptomPersistence(message)) {
          symptomEntriesRemoteEnabledRef.current = false;
          setMessage({ tone: "neutral", text: "Symptom tracking is using local storage until the Health Journal tombstone migration is applied." });
        } else {
          setMessage({ tone: "warn", text: message });
        }
        return false;
      }
    }

    if (!isCurrentOperation(operation)) return false;
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
    }), {
      persistenceMode: client && storageMode === "remote" && symptomEntriesRemoteEnabledRef.current ? "remote" : "local",
    });
    setHealthSuccessMessage({
      tone: "good",
      text: deletedRemotely ? "Symptom entry removed." : hasPendingNewEntry ? "Unsynced Symptom occurrence removed." : "Symptom occurrence removed locally; deletion will sync.",
    });
    return true;
  }

  async function addMealEntry(input: Omit<HealthMealEntryInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;

    const storedCalories = normalizeHealthMealStoredCalories(input.calories);
    if (storedCalories === null) {
      setMessage({ tone: "warn", text: "Calories must be a non-negative number." });
      return false;
    }

    const now = new Date().toISOString();
    const localRow: HealthMealEntry = {
      attribution: input.attribution ?? null,
      barcode: input.barcode ?? null,
      brand_name: input.brand_name ?? null,
      calories: storedCalories,
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
          calories: storedCalories,
          user_id: userId,
        })
        .select("*")
        .single();
      if (!isCurrentOperation(operation)) return false;
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
    if (!isCurrentOperation(operation)) return false;
    applySnapshot(nextSnapshot);
    await claimEligibleAwards(nextSnapshot, operation, { persistRemotely: storageMode === "remote" });
    if (!isCurrentOperation(operation)) return false;
    setHealthSuccessMessage({ tone: "good", text: "Meal saved." });
    return true;
  }

  async function addMealEntries(inputs: Array<Omit<HealthMealEntryInsert, "user_id">>): Promise<HealthBatchWriteResult> {
    if (inputs.length === 0) return { success: true, rows: [] };
    if (!userId || !profile) {
      return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health authority is not ready." })), error: "Health authority is not ready." };
    }
    const operation = captureOperation();
    if (!operation) {
      return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health operation is no longer active." })) };
    }

    const validationErrors = new Map<number, string>();
    const validInputs: Array<{ index: number; input: Omit<HealthMealEntryInsert, "user_id"> }> = [];
    inputs.forEach((input, index) => {
      if (!input.food_name.trim()) {
        validationErrors.set(index, "Food name is required.");
        return;
      }
      const storedCalories = normalizeHealthMealStoredCalories(input.calories);
      if (storedCalories === null) {
        validationErrors.set(index, "Calories must be a non-negative number.");
        return;
      }
      if ([input.protein_g, input.carbs_g, input.fat_g].some((value) => value !== null && value !== undefined && (!Number.isFinite(value) || value < 0))) {
        validationErrors.set(index, "Meal nutrition values must be non-negative numbers.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entry_date) || !input.logged_at || Number.isNaN(Date.parse(input.logged_at))) {
        validationErrors.set(index, "Choose a valid meal date and time.");
        return;
      }
      validInputs.push({ index, input: { ...input, calories: storedCalories } });
    });

    const now = new Date().toISOString();
    const localRows: HealthMealEntry[] = validInputs.map(({ input }) => ({
      attribution: input.attribution ?? null,
      barcode: input.barcode ?? null,
      brand_name: input.brand_name ?? null,
      calories: input.calories,
      carbs_g: input.carbs_g ?? null,
      created_at: now,
      entry_date: input.entry_date,
      fat_g: input.fat_g ?? null,
      food_name: input.food_name.trim(),
      id: input.id ?? createLocalId("health-meal"),
      logged_at: input.logged_at!,
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
    }));

    let nextRows = localRows;
    let batchError: string | undefined;
    if (client && storageMode === "remote" && localRows.length > 0) {
      const { data, error } = await client
        .from("adhdice_health_meal_entries")
        .upsert(localRows.map(({ created_at, updated_at, ...row }) => {
          void created_at;
          void updated_at;
          return row;
        }), { onConflict: "id" })
        .select("*");
      if (!isCurrentOperation(operation)) {
        return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health operation is no longer active." })) };
      }
      if (error) {
        batchError = error.message;
        setMessage({ tone: "warn", text: error.message });
      } else {
        const remoteById = new Map((data ?? []).map((row) => [row.id, row as HealthMealEntry]));
        if (localRows.some((row) => !remoteById.has(row.id))) {
          batchError = "Health did not return every Meal row after the batch write.";
          setMessage({ tone: "warn", text: batchError });
        } else {
          nextRows = localRows.map((row) => remoteById.get(row.id) ?? row);
        }
      }
    }

    const rows = inputs.map((_, index) => {
      const validationError = validationErrors.get(index);
      if (validationError) return { index, success: false, error: validationError };
      const validInput = validInputs.find((entry) => entry.index === index);
      const rowFailed = Boolean(batchError) || !validInput;
      return { index, success: !rowFailed, ...(rowFailed ? { error: batchError ?? "Meal batch write failed." } : {}) };
    });
    if (batchError || nextRows.length === 0) {
      return { success: false, rows, ...(batchError ? { error: batchError } : {}) };
    }

    if (!isCurrentOperation(operation)) {
      return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health operation is no longer active." })) };
    }
    const rowIds = new Set(nextRows.map((row) => row.id));
    const nextSnapshot = buildHealthSnapshot({
      awards,
      checkIns,
      favorites,
      importAudits,
      mealEntries: [...nextRows, ...mealEntries.filter((row) => !rowIds.has(row.id))].sort((left, right) => right.logged_at.localeCompare(left.logged_at)),
      metricEntries,
      profile,
      recipes,
      savedMeals,
      waterEntries,
      weightEntries,
    });
    applySnapshot(nextSnapshot);
    await claimEligibleAwards(nextSnapshot, operation, { persistRemotely: storageMode === "remote" });
    if (!isCurrentOperation(operation)) {
      return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health operation is no longer active." })) };
    }
    setHealthSuccessMessage({ tone: "good", text: `${nextRows.length} meal${nextRows.length === 1 ? "" : "s"} saved.` });
    return { success: rows.every((row) => row.success), rows };
  }

  async function deleteMealEntry(entryId: string) {
    if (!profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;

    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_meal_entries").delete().eq("id", entryId);
      if (!isCurrentOperation(operation)) return false;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }

    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Meal removed." });
    return true;
  }

  async function updateMealEntry(entryId: string, input: HealthMealEntryUpdate) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;

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
      if (!isCurrentOperation(operation)) return false;
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
    if (!isCurrentOperation(operation)) return false;
    applySnapshot(nextSnapshot);
    await claimEligibleAwards(nextSnapshot, operation, { persistRemotely: storageMode === "remote" });
    if (!isCurrentOperation(operation)) return false;
    setHealthSuccessMessage({ tone: "good", text: "Meal updated." });
    return true;
  }

  async function updatePreviousFoodLogs(food: HealthFoodLibraryItem): Promise<HealthFoodHistoryRepairResult> {
    let entries = selectHealthFoodMealEntriesBySourceId(mealEntries, food.id);
    const result: HealthFoodHistoryRepairResult = {
      failed: 0,
      failureMessages: [],
      requested: entries.length,
      skipped: 0,
      updated: 0,
    };
    if (!userId || !profile) {
      return result;
    }
    if (entries.length === 0 && !(client && storageMode === "remote")) {
      if (entries.length === 0) {
        setMessage({ tone: "neutral", text: formatHealthFoodHistoryRepairResult(result) });
      }
      return result;
    }
    const operation = captureOperation();
    if (!operation) {
      return result;
    }

    healthFoodMutationRevisionRef.current += 1;
    if (client && storageMode === "remote") {
      const remoteEntries = await fetchAllPagedRows(
        (from, to) => client
          .from("adhdice_health_meal_entries")
          .select("id,user_id,entry_date,meal_slot,logged_at,food_name,brand_name,serving_label,calories,protein_g,carbs_g,fat_g,barcode,provider,provider_item_id,attribution,source_food_id,consumed_quantity,consumed_unit,serving_fraction,food_snapshot,nutrition_snapshot,created_at,updated_at")
          .eq("user_id", userId)
          .eq("source_food_id", food.id)
          .order("logged_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
        SUPABASE_READ_PAGE_SIZE,
      );
      if (!isCurrentOperation(operation)) {
        return result;
      }
      if (remoteEntries.error) {
        result.failed = 1;
        result.failureMessages.push(remoteEntries.error.message);
        result.requested = 0;
        setMessage({ tone: "warn", text: formatHealthFoodHistoryRepairResult(result) });
        return result;
      }
      entries = (remoteEntries.data ?? []) as HealthMealEntry[];
      result.requested = entries.length;
    }
    const updatedRows = new Map<string, HealthMealEntry>();
    for (const entry of entries) {
      let update: HealthMealEntryUpdate;
      try {
        update = buildHealthFoodHistoryMealEntryUpdate(food, entry);
      } catch {
        result.skipped += 1;
        continue;
      }

      const now = new Date().toISOString();
      let nextRow: HealthMealEntry = { ...entry, ...update, updated_at: now };
      if (client && storageMode === "remote") {
        let data: HealthMealEntry | null = null;
        let error: { message?: string } | null = null;
        try {
          const response = await client
            .from("adhdice_health_meal_entries")
            .update(update)
            .eq("id", entry.id)
            .eq("user_id", userId)
            .eq("source_food_id", food.id)
            .select("id,user_id,entry_date,meal_slot,logged_at,food_name,brand_name,serving_label,calories,protein_g,carbs_g,fat_g,barcode,provider,provider_item_id,attribution,source_food_id,consumed_quantity,consumed_unit,serving_fraction,food_snapshot,nutrition_snapshot,created_at,updated_at")
            .single();
          data = response.data;
          error = response.error;
        } catch (caughtError) {
          error = { message: caughtError instanceof Error ? caughtError.message : String(caughtError) };
        }
        if (!isCurrentOperation(operation)) {
          return result;
        }
        if (error || !data) {
          result.failed += 1;
          if (error?.message) {
            result.failureMessages.push(error.message);
          }
          continue;
        }
        nextRow = data;
      }
      updatedRows.set(entry.id, nextRow);
      result.updated += 1;
    }

    if (!isCurrentOperation(operation)) {
      return result;
    }
    if (updatedRows.size > 0) {
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
        mealEntries: currentSnapshot.mealEntries
          .map((entry) => updatedRows.get(entry.id) ?? entry)
          .sort((left, right) => right.logged_at.localeCompare(left.logged_at)),
      }));
    }

    const message = formatHealthFoodHistoryRepairResult(result);
    if (result.skipped > 0 || result.failed > 0) {
      setMessage({ tone: "warn", text: message });
    } else {
      setHealthSuccessMessage({ tone: "good", text: message });
    }
    return result;
  }

  async function addMealPlanEntry(input: Omit<HealthMealPlanEntryInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;

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
      if (!isCurrentOperation(operation)) return false;
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

    if (!isCurrentOperation(operation)) return false;
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
    if (!isCurrentOperation(operation)) return false;
    applySnapshot(nextSnapshot, {
      persistenceMode: persistedRemotely ? "remote" : "local",
    });
    setHealthSuccessMessage({ tone: "good", text: "Meal added to plan." });
    return true;
  }

  async function updateMealPlanEntry(entryId: string, input: HealthMealPlanEntryUpdate) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
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
      if (!isCurrentOperation(operation)) return false;
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

    if (!isCurrentOperation(operation)) return false;
    if (persistedRemotely) {
      clearMealPlanPendingMutation(nextRow.id);
    } else {
      recordMealPlanPendingMutation({ operation: "upsert", plan: nextRow });
    }

    if (!isCurrentOperation(operation)) return false;
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
    }), {
      persistenceMode: persistedRemotely ? "remote" : "local",
    });
    setHealthSuccessMessage({ tone: "good", text: "Meal plan updated." });
    return true;
  }

  async function deleteMealPlanEntry(entryId: string) {
    if (!profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
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
      if (!isCurrentOperation(operation)) return false;
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

    if (!isCurrentOperation(operation)) return false;
    if (persistedRemotely) {
      clearMealPlanPendingMutation(entryId);
    } else {
      recordMealPlanPendingMutation({ operation: "delete", planId: entryId });
    }

    if (!isCurrentOperation(operation)) return false;
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
    }), {
      persistenceMode: persistedRemotely ? "remote" : "local",
    });
    setHealthSuccessMessage({ tone: "good", text: "Meal plan removed." });
    return true;
  }

  async function confirmMealPlanEntry(planId: string) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
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
      if (!isCurrentOperation(operation)) return false;
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
    if (!isCurrentOperation(operation)) return false;
    applySnapshot(nextSnapshot, {
      persistenceMode: client && storageMode === "remote" ? "remote" : "local",
    });
    await claimEligibleAwards(nextSnapshot, operation, { persistRemotely: storageMode === "remote" });
    if (!isCurrentOperation(operation)) return false;
    setHealthSuccessMessage({ tone: "good", text: newlyCreated ? "Meal plan marked Done." : "Meal plan Done recovered." });
    return true;
  }

  async function saveFavoriteFood(input: Omit<HealthFoodLibraryItemInsert, "user_id">): Promise<HealthFoodLibraryItem | null> {
    if (!userId || !profile) {
      return null;
    }
    const operation = captureOperation();
    if (!operation) return null;

    const currentFavorites = healthSnapshotRef.current?.favorites ?? favorites;
    let normalizedInput = input;
    const incomingIdentityKey = getHealthFoodIdentityKey(normalizedInput);
    const duplicateFavorite = incomingIdentityKey
      ? currentFavorites.find((item) => item.id !== normalizedInput.id && getHealthFoodIdentityKey(item) === incomingIdentityKey)
      : null;
    if (duplicateFavorite) {
      if (!normalizedInput.is_favorite || duplicateFavorite.is_favorite) {
        setMessage({ tone: "neutral", text: "That food is already in your library." });
        return duplicateFavorite;
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
      if (!isCurrentOperation(operation)) return null;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return null;
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
    if (!isCurrentOperation(operation)) return null;
    applySnapshot(buildHealthSnapshot({ ...currentSnapshot, favorites: nextFavorites }));
    setHealthSuccessMessage({
      tone: "good",
      text: nextRow.is_favorite ? "Saved to favorites." : "Custom food saved.",
    });
    return nextRow;
  }

  async function setFavoriteFoodStatus(itemId: string, isFavorite: boolean) {
    if (!userId || !profile) return false;
    const operation = captureOperation();
    if (!operation) return false;
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
      if (!isCurrentOperation(operation)) return false;
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
    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: isFavorite ? "Saved to favorites." : "Custom food saved." });
    return true;
  }

  async function deleteFavoriteFood(itemId: string) {
    if (!profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;

    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_food_library").delete().eq("id", itemId);
      if (!isCurrentOperation(operation)) return false;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }

    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Favorite removed." });
    return true;
  }

  async function saveRecipe(input: Omit<HealthRecipeInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;

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
      if (!isCurrentOperation(operation)) return false;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ?? localRow;
    }

    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Recipe saved." });
    return true;
  }

  async function deleteRecipe(recipeId: string) {
    if (!profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_recipes").delete().eq("id", recipeId);
      if (!isCurrentOperation(operation)) return false;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }
    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Recipe removed." });
    return true;
  }

  async function saveSavedMeal(input: Omit<HealthSavedMealInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
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
      if (!isCurrentOperation(operation)) return false;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ?? localRow;
    }

    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Custom meal saved." });
    return true;
  }

  async function deleteSavedMeal(mealId: string) {
    if (!profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_saved_meals").delete().eq("id", mealId);
      if (!isCurrentOperation(operation)) return false;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }
    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Custom meal removed." });
    return true;
  }

  async function addWaterEntry(input: Omit<HealthWaterEntryInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
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
      if (!isCurrentOperation(operation)) return false;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextRow = data ? normalizeHealthWaterEntry(data) : localRow;
    }
    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Water added." });
    return true;
  }

  async function addWaterEntries(inputs: Array<Omit<HealthWaterEntryInsert, "user_id">>): Promise<HealthBatchWriteResult> {
    if (inputs.length === 0) return { success: true, rows: [] };
    if (!userId || !profile) {
      return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health authority is not ready." })), error: "Health authority is not ready." };
    }
    const operation = captureOperation();
    if (!operation) {
      return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health operation is no longer active." })) };
    }
    const now = new Date().toISOString();
    const localRows: HealthWaterEntry[] = inputs.map((input) => ({
      amount: input.amount,
      amount_ml: input.amount_ml,
      created_at: now,
      entry_date: input.entry_date,
      id: input.id ?? createLocalId("health-water"),
      logged_at: input.logged_at ?? now,
      unit: input.unit,
      user_id: userId,
      confirmed_at: input.confirmed_at === undefined ? now : input.confirmed_at,
    }));
    let nextRows = localRows;
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_water_entries")
        .upsert(localRows.map((row) => ({ ...row })), { onConflict: "id" })
        .select("*");
      if (!isCurrentOperation(operation)) {
        return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health operation is no longer active." })) };
      }
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: error.message })), error: error.message };
      }
      const remoteById = new Map((data ?? []).map((row) => [row.id, normalizeHealthWaterEntry(row)]));
      if (localRows.some((row) => !remoteById.has(row.id))) {
        const missingRowsError = "Health did not return every Water row after the batch write.";
        setMessage({ tone: "warn", text: missingRowsError });
        return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: missingRowsError })), error: missingRowsError };
      }
      nextRows = localRows.map((row) => remoteById.get(row.id) ?? row);
    }
    if (!isCurrentOperation(operation)) {
      return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health operation is no longer active." })) };
    }
    const rowIds = new Set(nextRows.map((row) => row.id));
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
      waterEntries: [...nextRows, ...waterEntries.filter((row) => !rowIds.has(row.id))].sort((left, right) => right.logged_at.localeCompare(left.logged_at)),
      weightEntries,
    }));
    setHealthSuccessMessage({ tone: "good", text: `${nextRows.length} water entr${nextRows.length === 1 ? "y" : "ies"} added.` });
    return { success: true, rows: inputs.map((_, index) => ({ index, success: true })) };
  }

  async function deleteWaterEntry(entryId: string) {
    if (!profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_water_entries").delete().eq("id", entryId);
      if (!isCurrentOperation(operation)) return false;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }
    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Water entry removed." });
    return true;
  }

  async function updateWaterEntry(entryId: string, input: HealthWaterEntryUpdate) {
    if (!profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
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
      if (!isCurrentOperation(operation)) return false;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
      nextEntry = data ? normalizeHealthWaterEntry(data) : nextEntry;
    }
    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Water entry updated." });
    return true;
  }

  async function confirmWaterEntry(entryId: string) {
    if (!profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
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
      if (!isCurrentOperation(operation)) return false;
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
        if (!isCurrentOperation(operation)) return false;
        if (currentRowError) {
          setMessage({ tone: "warn", text: currentRowError.message });
          return false;
        }
        return Boolean(currentRow && currentRow.confirmed_at !== null);
      }
      nextEntry = normalizeHealthWaterEntry(data);
    }

    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Water entry confirmed." });
    return true;
  }

  async function addWeightEntry(input: Omit<HealthWeightEntryInsert, "user_id">) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;

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
      if (!isCurrentOperation(operation)) return false;
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
    if (!isCurrentOperation(operation)) return false;
    applySnapshot(nextSnapshot);
    await claimEligibleAwards(nextSnapshot, operation, { persistRemotely: storageMode === "remote" });
    if (!isCurrentOperation(operation)) return false;
    setHealthSuccessMessage({ tone: "good", text: "Weight saved." });
    return true;
  }

  async function addWeightEntries(inputs: Array<Omit<HealthWeightEntryInsert, "user_id">>): Promise<HealthBatchWriteResult> {
    if (inputs.length === 0) return { success: true, rows: [] };
    if (!userId || !profile) {
      return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health authority is not ready." })), error: "Health authority is not ready." };
    }
    const operation = captureOperation();
    if (!operation) {
      return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health operation is no longer active." })) };
    }
    const now = new Date().toISOString();
    const localRows: HealthWeightEntry[] = inputs.map((input) => ({
      created_at: now,
      entry_date: input.entry_date,
      id: input.id ?? createLocalId("health-weight"),
      logged_at: input.logged_at ?? now,
      note: input.note ?? null,
      source: input.source ?? "manual",
      updated_at: now,
      user_id: userId,
      weight_kg: input.weight_kg,
    }));
    let nextRows = localRows;
    if (client && storageMode === "remote") {
      const { data, error } = await client
        .from("adhdice_health_weight_entries")
        .upsert(localRows.map((row) => ({ ...row })), { onConflict: "id" })
        .select("*");
      if (!isCurrentOperation(operation)) {
        return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health operation is no longer active." })) };
      }
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: error.message })), error: error.message };
      }
      const remoteById = new Map((data ?? []).map((row) => [row.id, row as HealthWeightEntry]));
      if (localRows.some((row) => !remoteById.has(row.id))) {
        const missingRowsError = "Health did not return every Weight row after the batch write.";
        setMessage({ tone: "warn", text: missingRowsError });
        return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: missingRowsError })), error: missingRowsError };
      }
      nextRows = localRows.map((row) => remoteById.get(row.id) ?? row);
    }
    if (!isCurrentOperation(operation)) {
      return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health operation is no longer active." })) };
    }
    const rowIds = new Set(nextRows.map((row) => row.id));
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
      weightEntries: [...nextRows, ...weightEntries.filter((row) => !rowIds.has(row.id))].sort((left, right) => right.logged_at.localeCompare(left.logged_at)),
    });
    applySnapshot(nextSnapshot);
    await claimEligibleAwards(nextSnapshot, operation, { persistRemotely: storageMode === "remote" });
    if (!isCurrentOperation(operation)) {
      return { success: false, rows: inputs.map((_, index) => ({ index, success: false, error: "Health operation is no longer active." })) };
    }
    setHealthSuccessMessage({ tone: "good", text: `${nextRows.length} weight entr${nextRows.length === 1 ? "y" : "ies"} saved.` });
    return { success: true, rows: inputs.map((_, index) => ({ index, success: true })) };
  }

  async function addWorkout(input: Omit<HealthWorkoutInsert, "user_id">) {
    if (!userId || !profile) {
      return null;
    }
    const operation = captureOperation();
    if (!operation) return null;

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
      if (!isCurrentOperation(operation)) return null;
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

    if (!isCurrentOperation(operation)) return null;
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
    }), {
      persistenceMode: client && storageMode === "remote" && workoutRemoteEnabledRef.current ? "remote" : "local",
    });
    setHealthSuccessMessage({ tone: "good", text: "Workout saved." });
    return nextRow;
  }

  async function updateWorkout(workoutId: string, input: HealthWorkoutUpdate) {
    if (!profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
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
      if (!isCurrentOperation(operation)) return false;
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

    if (!isCurrentOperation(operation)) return false;
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
    }), {
      persistenceMode: client && storageMode === "remote" && workoutRemoteEnabledRef.current ? "remote" : "local",
    });
    setHealthSuccessMessage({ tone: "good", text: "Workout updated." });
    return true;
  }

  async function deleteWorkout(workoutId: string) {
    if (!profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;
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
      if (!isCurrentOperation(operation)) return false;
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

    if (!isCurrentOperation(operation)) return false;
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
    }), {
      persistenceMode: client && storageMode === "remote" && workoutRemoteEnabledRef.current ? "remote" : "local",
    });
    setHealthSuccessMessage({ tone: "good", text: "Workout deleted." });
    return true;
  }

  async function importAppleHealthData(
    preview: AppleHealthImportPreview,
    options?: { onProgress?: (progress: HealthImportSaveProgress) => void },
  ) {
    if (!userId || !profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;

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
          if (!isCurrentOperation(operation)) return false;
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
          if (!isCurrentOperation(operation)) return false;
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
      if (!isCurrentOperation(operation)) return false;
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
    if (!isCurrentOperation(operation)) return false;
    applySnapshot(nextSnapshot, {
      persistenceMode: client && storageMode === "remote" ? "remote" : "local",
    });
    await claimEligibleAwards(nextSnapshot, operation, { persistRemotely: storageMode === "remote" });
    if (!isCurrentOperation(operation)) return false;
    options?.onProgress?.({
      completed: totalWrites,
      message: `Import saved with ${freshMetricInputs.length} new metrics and ${auditPayload.duplicate_count ?? 0} duplicates skipped.`,
      phase: "complete",
      total: totalWrites,
    });
    setHealthSuccessMessage({
      tone: "good",
      text: `Apple Health import saved ${freshMetricInputs.length} metric ${freshMetricInputs.length === 1 ? "entry" : "entries"}${auditPayload.duplicate_count ? ` and skipped ${auditPayload.duplicate_count} duplicates` : ""}.`,
    });
    return true;
  }

  async function deleteWeightEntry(entryId: string) {
    if (!profile) {
      return false;
    }
    const operation = captureOperation();
    if (!operation) return false;

    if (client && storageMode === "remote") {
      const { error } = await client.from("adhdice_health_weight_entries").delete().eq("id", entryId);
      if (!isCurrentOperation(operation)) return false;
      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }
    }

    if (!isCurrentOperation(operation)) return false;
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
    setHealthSuccessMessage({ tone: "good", text: "Weight entry removed." });
    return true;
  }

  const hasCurrentJournalTriggerData = Boolean(userId && journalTriggerDataOwnerId === userId);
  const hasCurrentJournalTriggerRequest = Boolean(userId && journalTriggerRequestOwnerId === userId);

  return {
    awards,
    checkIns,
    journalTriggers: hasCurrentJournalTriggerData ? journalTriggers : [],
    journalTriggerLinks: hasCurrentJournalTriggerData ? journalTriggerLinks : [],
    journalTriggerDataError: hasCurrentJournalTriggerRequest ? journalTriggerDataError : null,
    isLoadingJournalTriggers: hasCurrentJournalTriggerRequest && isLoadingJournalTriggers,
    hasLoadedJournalTriggerData: hasCurrentJournalTriggerData && hasLoadedJournalTriggerData,
    loadJournalTriggerData,
    createJournalTrigger,
    journalSignals,
    journalSignalValues,
    journalSignalOccurrences,
    saveJournalEntry,
    saveJournalQuestions,
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
    addMealEntries,
    addWaterEntry,
    addWaterEntries,
    confirmWaterEntry,
    addWeightEntry,
    addWeightEntries,
    updateWaterEntry,
    updateMealEntry,
    updatePreviousFoodLogs,
    refreshHealth,
    storageMode,
    waterEntries,
    workouts,
    addWorkout,
    updateWorkout,
    deleteWorkout,
    weightEntries,
  };
}

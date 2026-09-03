"use client";

import { Activity, Apple, BookOpen, CalendarDays, Check, ChevronDown, ChevronUp, Heart, HeartPulse, History, MoonStar, Pencil, RotateCcw, Salad, ScanBarcode, Scale, Sparkles, Target, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref } from "react";

import type {
  HealthAchievementAward,
  HealthCheckIn,
  HealthExercise,
  HealthExerciseInsert,
  HealthExerciseUpdate,
  HealthFitnessGoal,
  HealthFitnessGoalInsert,
  HealthFitnessGoalLevel,
  HealthFitnessGoalLevelInsert,
  HealthFitnessGoalLevelUpdate,
  HealthFitnessGoalUpdate,
  HealthFitnessPlan,
  HealthFitnessPlanInsert,
  HealthFitnessPlanItem,
  HealthFitnessPlanItemInsert,
  HealthFitnessPlanItemUpdate,
  HealthFitnessPlanUpdate,
  HealthFoodLibraryItem,
  HealthImportAudit,
  HealthJournalSignal,
  HealthJournalSignalKind,
  HealthJournalSignalOccurrence,
  HealthJournalSignalOccurrenceInsert,
  HealthJournalSignalValue,
  HealthMealEntry,
  HealthMealEntryInsert,
  HealthMealEntryUpdate,
  HealthMealPlanEntry,
  HealthMealPlanEntryInsert,
  HealthMealPlanEntryUpdate,
  HealthMealFoodSnapshot,
  HealthMetricEntry,
  HealthNutritionDetails,
  HealthProfile,
  HealthProfileUpdate,
  HealthRecipe,
  HealthRecipeIngredient,
  HealthSavedMeal,
  HealthSavedMealItem,
  HealthServingMeasureUnit,
  HealthServingWeightUnit,
  HealthSymptom,
  HealthSymptomEntry,
  HealthSymptomEntryInsert,
  HealthSymptomInsert,
  HealthWaterEntry,
  HealthWaterUnit,
  HealthWorkout,
  HealthWorkoutExercise,
  HealthWorkoutInsert,
  HealthWorkoutPlanItemLink,
  HealthWorkoutSet,
  HealthWorkoutUpdate,
  HealthWeightEntry,
} from "@/lib/database.types";
import type { WeightGoalForecast } from "@/lib/health-utils";
import { ActivityLineChartCard, type NumericLineChartSeries } from "@/components/activity-line-chart-card";
import {
  parseAppleHealthFileInWorker,
  type AppleHealthImportParseProgress,
  type AppleHealthImportPreview,
} from "@/lib/health-apple-import";
import type { HealthImportSaveProgress, HealthJournalEntrySaveInput } from "@/hooks/useHealth";
import type { HealthWorkoutSessionDetails, HealthWorkoutSessionSaveResult } from "@/hooks/useFitnessSessionDetails";
import type { HealthWorkoutStructuredDraft } from "@/lib/health-fitness-session";
import {
  createDefaultMealDraft,
  hasMeaningfulMealDraft,
  prepareMealDraftForSelectedSlot,
  resetMealDraftForNextItem,
  type MealDraft,
} from "@/lib/health-meal-draft";
import { readHealthTabPreference, subscribeToHealthTabPreference, persistHealthTabPreference } from "@/lib/health-tab-preference";
import {
  calculateHealthDailyCalorieBudget,
  buildHealthDailyCalorieTargetSeries,
  clampPercent,
  buildHealthMealLoggedAt,
  buildWeightGoalForecast,
  displayWeightToKilograms,
  formatEditableWeight,
  formatHealthDateLabel,
  formatHealthCalorieTarget,
  formatHealthJournalDate,
  formatHealthJournalMetadataDate,
  formatMealLoggedTime,
  formatHealthStandardTime,
  formatHealthTimestampTime,
  formatHealthNutritionNumber,
  formatHealthSleepDuration,
  formatWeight,
  getCurrentHealthDateTimeInputs,
  getHealthSleepElapsedSeconds,
  getHealthSleepStartTimestamp,
  getHealthSleepDayTotal,
  getHealthMealNutritionValue,
  getHealthMealSummaryParts,
  buildHealthDailySleepSeries,
  getSleepFocusSessions,
  sortHealthSleepSessionsByStart,
  getLatestWeight,
  getMealSlotLabel,
  getWeightTrend,
  HEALTH_MEAL_SLOTS,
  HEALTH_SLEEP_KINDS,
  HEALTH_SCALE_OPTIONS,
  HEALTH_SEVERITY_OPTIONS,
  type HealthReminderTemplateKey,
  HEALTH_TABS,
  kilogramsToDisplayValue,
  normalizeHealthMealTime,
  normalizeHealthSymptomColor,
  normalizeHealthSymptomName,
  sumMealNutritionForDate,
  sumMetricValueForDate,
  shiftHealthDate,
  todayHealthDate,
  buildHealthSleepTimestamps,
  resolveHealthSleepKind,
  parseHealthSleepDuration,
  isHealthMealTimestampFuture,
  type HealthSleepKind,
  type HealthTab,
} from "@/lib/health-utils";
import {
  buildHealthFeelingTrendModel,
  formatHealthFeelingTrendScore,
  getHealthFeelingTrendPoints,
  getHealthFeelingTrendAverage,
  getHealthFeelingTrendSelectionSummary,
  HEALTH_FEELING_TREND_RANGES,
  toggleHealthFeelingTrendSelection,
  type FeelingTrendDefinition,
  type FeelingTrendPoint,
  type HealthFeelingTrendKind,
  type HealthFeelingTrendRange,
} from "@/lib/health-feeling-trends";
import {
  HEALTH_JOURNAL_SCORE_OPTIONS,
  buildHealthJournalDraftValues,
  ensureHealthJournalDraftValue,
  getDefaultHealthJournalScaleLabels,
  getHealthJournalSignalDisplayColor,
  getHealthJournalSignalDisplayName,
  getHealthJournalTemplateSignals,
  groupHealthJournalEntriesByDate,
  normalizeHealthJournalEntryTime,
  findHealthJournalReflectionTagMatches,
  replaceHealthJournalReflectionTag,
  type HealthJournalDraftValue,
  updateHealthJournalDraftValue,
} from "@/lib/health-journal";
import type { ActiveFocusSession, FocusCategory, HistoricalFocusSession } from "@/lib/types";
import { ADHDICE_ACCENT_COLORS } from "@/lib/accent-colors";
import {
  calculateHealthFoodNutrition,
  HEALTH_NUTRITION_FIELD_REGISTRY,
  getHealthFoodMeasurementOptions,
  lookupOpenFoodFactsByBarcode,
  normalizeHealthNutritionDetails,
  type HealthNutritionCoverage,
  type HealthNutritionFieldDefinition,
} from "@/lib/health-nutrition";
import {
  composeHealthFoodServingDefinition,
  buildHealthMealPickerSuggestions,
  buildHealthDailyCalorieSeries,
  buildHealthFoodLogHistoryIndex,
  formatHealthFoodDisplayName,
  formatHealthFoodQuantityUnit,
  getHealthFoodIdentityKey,
  getRecipeNutritionPerServing,
  getSavedMealNutrition,
  sortHealthFoodsForMealPicker,
  type HealthFoodLogHistory,
  type HealthMealPickerSuggestion,
} from "@/lib/health-library";
import {
  buildHealthMealPlanPayload,
  buildHealthMealPlanUpdateFromPayload,
  getActiveHealthMealPlans,
  isHealthMealPlanConfirmEligible,
  mealDraftFromHealthMealPlan,
  sumHealthMealPlanNutritionForDate,
} from "@/lib/health-meal-planning";
import {
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
} from "@/components/ui/task-table-primitives";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdDropdownPanel } from "@/components/ui-system/adhd-dropdown-panel";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import { PageShell, PageShellBody, PageShellLayoutControls, PageShellSurface, ReorderablePageShells } from "@/components/ui-system/reorderable-page-shells";
import { usePageShellLayout } from "@/hooks/usePageShellLayout";
import { HEALTH_PAGE_SHELL_IDS, HEALTH_PAGE_SHELL_SIZE_DEFAULTS, getHealthPageShellKey } from "@/lib/page-shell-layout";
import { HealthBarcodeScanner } from "./health-barcode-scanner";
import { HealthLibraryPanel } from "./health-library-panel";
import { HealthAutocomplete, HealthDropdown, HEALTH_COMPACT_CONTROL_CLASS, HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";
import { HealthCalorieLineChart } from "./health-calorie-line-chart";
import { HealthSleepLineChart } from "./health-sleep-line-chart";
import { HealthWaterPanel } from "./health-water-panel";
import { HealthFitnessTab } from "./health-fitness-tab";
import { HealthStandardTimeInput } from "./health-standard-time-input";
import { HealthTodayTab } from "./health-today-tab";
import { PageShellHeader } from "./page-shell-header";

type HealthPageProps = {
  awards: HealthAchievementAward[];
  checkIns: HealthCheckIn[];
  journalSignals: HealthJournalSignal[];
  journalSignalValues: HealthJournalSignalValue[];
  journalSignalOccurrences: HealthJournalSignalOccurrence[];
  symptoms: HealthSymptom[];
  symptomEntries: HealthSymptomEntry[];
  createSymptom: (input: Omit<HealthSymptomInsert, "user_id">) => Promise<HealthSymptom | null>;
  renameSymptom: (symptomId: string, name: string) => Promise<boolean>;
  setSymptomColor: (symptomId: string, color: string) => Promise<boolean>;
  archiveSymptom: (symptomId: string) => Promise<boolean>;
  deleteFavoriteFood: (itemId: string) => Promise<boolean>;
  deleteMealEntry: (entryId: string) => Promise<boolean>;
  deleteRecipe: (recipeId: string) => Promise<boolean>;
  deleteSavedMeal: (mealId: string) => Promise<boolean>;
  deleteWaterEntry: (entryId: string) => Promise<boolean>;
  deleteWorkout: (workoutId: string) => Promise<boolean>;
  archiveExercise: (exerciseId: string) => Promise<boolean>;
  createExercise: (input: Omit<HealthExerciseInsert, "user_id" | "default_measurement">) => Promise<HealthExercise | null>;
  fitnessSessionError: string | null;
  fitnessSessionLoaded: boolean;
  fitnessSessionLoading: boolean;
  exerciseLibrary: HealthExercise[];
  getWorkoutSessionDetails: (workoutId: string) => HealthWorkoutSessionDetails;
  reorderExercises: (orderedExerciseIds: readonly string[]) => Promise<boolean>;
  deleteWeightEntry: (entryId: string) => Promise<boolean>;
  favorites: HealthFoodLibraryItem[];
  importAudits: HealthImportAudit[];
  importAppleHealthData: (
    preview: AppleHealthImportPreview,
    options?: { onProgress?: (progress: HealthImportSaveProgress) => void },
  ) => Promise<boolean>;
  isLoading: boolean;
  focusCategories: FocusCategory[];
  focusHistory: HistoricalFocusSession[];
  sleepCategory: FocusCategory | null;
  sleepActiveSession: ActiveFocusSession | null;
  onToggleSleepClock: () => void;
  onFinishSleepClock: (kind: HealthSleepKind) => void;
  onLogManualSleep: (input: { date: string; durationSeconds: number; endedAt: string; kind: HealthSleepKind; startedAt: string }) => Promise<boolean>;
  onUpdateSleepSession: (entryId: string, input: { date: string; durationSeconds: number; endedAt: string; kind: HealthSleepKind; startedAt: string }) => Promise<void>;
  mealEntries: HealthMealEntry[];
  mealPlanEntries: HealthMealPlanEntry[];
  metricEntries: HealthMetricEntry[];
  profile: HealthProfile | null;
  recipes: HealthRecipe[];
  saveJournalEntry: (input: HealthJournalEntrySaveInput) => Promise<HealthCheckIn | null>;
  createJournalSignal: (input: Omit<import("@/lib/database.types").HealthJournalSignalInsert, "user_id">) => Promise<HealthJournalSignal | null>;
  updateJournalSignal: (signalId: string, input: import("@/lib/database.types").HealthJournalSignalUpdate) => Promise<boolean>;
  setJournalSignalTemplate: (signalId: string, inTemplate: boolean) => Promise<boolean>;
  archiveJournalSignal: (signalId: string) => Promise<boolean>;
  deleteJournalSignal: (signalId: string) => Promise<boolean>;
  reorderJournalSignals: (orderedSignalIds: readonly string[]) => Promise<boolean>;
  deleteJournalEntry: (entryId: string) => Promise<boolean>;
  saveFavoriteFood: (input: {
    attribution?: string | null;
    barcode?: string | null;
    brand_name?: string | null;
    category?: string | null;
    food_category?: string | null;
    calories: number;
    carbs_g?: number | null;
    fat_g?: number | null;
    nutrition_details?: HealthNutritionDetails | null;
    food_name: string;
    id?: string;
    protein_g?: number | null;
    provider?: string;
    provider_item_id?: string | null;
    serving_label?: string | null;
    serving_size?: string | null;
    serving_quantity?: number;
    serving_unit?: string;
    serving_measure_value?: number | null;
    serving_measure_unit?: HealthServingMeasureUnit | null;
    serving_weight_amount?: number | null;
    serving_weight_unit?: HealthServingWeightUnit | null;
    is_favorite?: boolean;
  }) => Promise<boolean>;
  setFavoriteFoodStatus: (itemId: string, isFavorite: boolean) => Promise<boolean>;
  saveRecipe: (input: {
    id?: string;
    name: string;
    notes?: string;
    servings: number;
    ingredients: HealthRecipeIngredient[];
  }) => Promise<boolean>;
  savedMeals: HealthSavedMeal[];
  saveSavedMeal: (input: {
    id?: string;
    name: string;
    default_meal_slot: HealthMealEntry["meal_slot"];
    items: HealthSavedMealItem[];
  }) => Promise<boolean>;
  saveProfile: (updates: HealthProfileUpdate) => Promise<boolean>;
  addMealEntry: (input: Omit<HealthMealEntryInsert, "user_id">) => Promise<boolean>;
  addMealPlanEntry: (input: Omit<HealthMealPlanEntryInsert, "user_id">) => Promise<boolean>;
  updateMealPlanEntry: (entryId: string, input: HealthMealPlanEntryUpdate) => Promise<boolean>;
  deleteMealPlanEntry: (entryId: string) => Promise<boolean>;
  confirmMealPlanEntry: (entryId: string) => Promise<boolean>;
  addWeightEntry: (input: {
    entry_date: string;
    logged_at?: string;
    note?: string | null;
    source?: HealthWeightEntry["source"];
    weight_kg: number;
  }) => Promise<boolean>;
  addWaterEntry: (input: {
    amount: number;
    amount_ml: number;
    confirmed_at: string | null;
    entry_date: string;
    logged_at: string;
    unit: HealthWaterUnit;
  }) => Promise<boolean>;
  confirmWaterEntry: (entryId: string) => Promise<boolean>;
  addWorkout: (input: Omit<HealthWorkoutInsert, "user_id">) => Promise<HealthWorkout | null>;
  archiveGoal: (goalId: string) => Promise<boolean>;
  archivePlan: (planId: string) => Promise<boolean>;
  archivePlanItem: (itemId: string) => Promise<boolean>;
  createGoal: (input: Omit<HealthFitnessGoalInsert, "user_id">) => Promise<HealthFitnessGoal | null>;
  createLevel: (input: Omit<HealthFitnessGoalLevelInsert, "user_id">) => Promise<HealthFitnessGoalLevel | null>;
  createPlan: (input: Omit<HealthFitnessPlanInsert, "user_id">) => Promise<HealthFitnessPlan | null>;
  createPlanItem: (input: Omit<HealthFitnessPlanItemInsert, "user_id">) => Promise<HealthFitnessPlanItem | null>;
  deleteLevel: (levelId: string) => Promise<boolean>;
  fitnessPlanError: string | null;
  fitnessPlansLoading: boolean;
  fitnessGoalsError: string | null;
  fitnessGoalsLoading: boolean;
  fitnessGoals: HealthFitnessGoal[];
  fitnessGoalLevels: HealthFitnessGoalLevel[];
  planItems: HealthFitnessPlanItem[];
  plans: HealthFitnessPlan[];
  saveWorkoutPlanItemLinks: (workoutId: string, planItemIds: readonly string[]) => Promise<boolean>;
  updatePlan: (planId: string, input: HealthFitnessPlanUpdate) => Promise<boolean>;
  updatePlanItem: (itemId: string, input: HealthFitnessPlanItemUpdate) => Promise<boolean>;
  restoreGoal: (goalId: string) => Promise<boolean>;
  updateWaterEntry: (entryId: string, input: {
    amount: number;
    amount_ml: number;
    entry_date: string;
    logged_at: string;
    unit: HealthWaterUnit;
  }) => Promise<boolean>;
  updateMealEntry: (entryId: string, input: HealthMealEntryUpdate) => Promise<boolean>;
  updateWorkout: (workoutId: string, input: HealthWorkoutUpdate) => Promise<boolean>;
  updateGoal: (goalId: string, input: HealthFitnessGoalUpdate) => Promise<boolean>;
  updateLevel: (levelId: string, input: HealthFitnessGoalLevelUpdate) => Promise<boolean>;
  saveWorkoutSessionDetails: (workoutId: string, draft: HealthWorkoutStructuredDraft) => Promise<HealthWorkoutSessionSaveResult>;
  updateExercise: (exerciseId: string, input: HealthExerciseUpdate) => Promise<boolean>;
  workoutPlanItemLinks: HealthWorkoutPlanItemLink[];
  workoutExercises: HealthWorkoutExercise[];
  workoutSets: HealthWorkoutSet[];
  storageMode: "local" | "remote";
  onOpenReminderTemplate: (templateKey: HealthReminderTemplateKey) => void;
  weightEntries: HealthWeightEntry[];
  waterEntries: HealthWaterEntry[];
  workouts: HealthWorkout[];
};

type SleepDraft = {
  date: string;
  hours: string;
  kind: HealthSleepKind;
  minutes: string;
  time: string;
};

type JournalOccurrenceDraft = {
  draftKey: string;
  id?: string;
  note: string;
  score: number;
  signalId: string;
  time: string;
};

type JournalLibraryEditDraft = {
  scaleLabels: string[];
  name: string;
};

type JournalTagQuery = {
  end: number;
  query: string;
  start: number;
};

type JournalTagOverlay =
  | {
      error: string | null;
      mode: "feeling_occurrence";
      score: number | null;
      signal: HealthJournalSignal;
      time: string;
    }
  | null;

type JournalTagOption = {
  kind: HealthJournalSignalKind;
  name: string;
  signal: HealthJournalSignal | null;
  symptomId?: string;
};

function buildHealthJournalSymptomOccurrenceSignal(symptom: HealthSymptom): HealthJournalSignal {
  return {
    archived_at: symptom.archived_at,
    color: null,
    created_at: symptom.created_at,
    high_label: getDefaultHealthJournalScaleLabels("symptom")[10] ?? "Extreme",
    id: `canonical-symptom:${symptom.id}`,
    in_template: false,
    kind: "symptom",
    low_label: getDefaultHealthJournalScaleLabels("symptom")[0] ?? "None",
    name: null,
    scale_labels: getDefaultHealthJournalScaleLabels("symptom"),
    symptom_id: symptom.id,
    template_sort_order: null,
    updated_at: symptom.updated_at,
    user_id: symptom.user_id,
  };
}

type JournalHistoryTagOverlay = {
  entryId: string;
  optionKey: string;
  start: number;
} | null;

type JournalSignalCreateKind = "emotion" | "other";
type JournalWorkspaceMode = "entry" | "history" | "split-history-left" | "split-history-right";

const CORE_JOURNAL_SCALE_LABELS: Readonly<Record<string, readonly string[]>> = {
  Mood: ["Very bad", "Bad", "Poor", "Low", "Okay", "Fair", "Good", "Very good", "Great", "Excellent"],
  Energy: ["Drained", "Very low", "Low", "Sluggish", "Okay", "Moderate", "Good", "High", "Very high", "Energized"],
  Stress: ["Calm", "Very low", "Low", "Mild", "Moderate", "Noticeable", "High", "Very high", "Severe", "Overwhelmed"],
  "Mental clarity": ["Foggy", "Very foggy", "Unclear", "Distracted", "Mixed", "Fair", "Clear", "Very clear", "Sharp", "Crystal clear"],
};

type MealEditDraft = {
  mode: "legacy" | "structured";
  calories: string;
  carbs: string;
  date: string;
  fat: string;
  mealSlot: HealthMealEntry["meal_slot"];
  protein: string;
  quantity: string;
  measurement: string;
  servingLabel: string;
  time: string;
};

type MealFoodSelection = {
  sourceFoodId: string | null;
  foodName: string;
  brandName: string;
  foodCategory: string | null;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  nutritionDetails: HealthNutritionDetails | null;
  attribution: string | null;
  barcode: string | null;
  provider: string | null;
  providerItemId: string | null;
  servingLabel: string | null;
  servingQuantity: number;
  servingUnit: string;
  servingMeasureValue: number | null;
  servingMeasureUnit: HealthServingMeasureUnit | null;
  consumedUnit?: string;
};

function createQuickFoodId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `quick-food-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createJournalDraftId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `health-journal-draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_IMPORT_STATUS = "Waiting for an Apple Health export.";

function formatHealthFeelingTrendTimestamp(point: FeelingTrendPoint) {
  const timestamp = Date.parse(point.occurredAt);
  if (!Number.isFinite(timestamp)) {
    return formatHealthDateLabel(point.entryDate);
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    month: "short",
  }).format(timestamp);
}

function buildHealthFeelingTrendSeries(
  definition: FeelingTrendDefinition,
  points: FeelingTrendPoint[],
): NumericLineChartSeries {
  const average = getHealthFeelingTrendAverage(points) ?? 0;
  return {
    color: definition.color,
    key: definition.key,
    label: definition.name,
    points: points.map((point) => {
      const timestampLabel = formatHealthFeelingTrendTimestamp(point);
      return {
        contextLabel: definition.scaleLabels[point.score] ?? "",
        detailLabel: point.note ? `${timestampLabel} · ${point.note}` : timestampLabel,
        key: point.id,
        label: formatHealthDateLabel(point.entryDate),
        value: point.score,
        xDomainKey: point.entryDate,
        xSubpositionKey: point.occurredAt,
      };
    }),
    summaryLabel: `${definition.name} · Avg.`,
    totalValue: average,
  };
}

function HealthAccentColorPalette({
  className,
  color,
  label,
  onSetColor,
}: {
  className?: string;
  color: string;
  label: string;
  onSetColor: (color: string) => void;
}) {
  return (
    <div aria-label={`Choose a color for ${label}`} className={`grid grid-cols-8 gap-1 rounded-[0.8rem] border border-[#e4deef] bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.05] ${className ?? ""}`} role="group">
      {ADHDICE_ACCENT_COLORS.map((paletteColor) => (
        <button
          aria-label={`Set ${label} color to ${paletteColor}`}
          aria-pressed={color === paletteColor}
          className={`h-5 w-5 rounded-full border-2 transition ${color === paletteColor ? "scale-110 border-[#2f294a] dark:border-white" : "border-transparent"}`}
          key={paletteColor}
          onClick={() => onSetColor(paletteColor)}
          onMouseDown={(event) => event.preventDefault()}
          style={{ backgroundColor: paletteColor }}
          title={`Set ${label} color to ${paletteColor}`}
          type="button"
        />
      ))}
    </div>
  );
}

function HealthColorControl({
  color,
  isOpen,
  label,
  onSetColor,
  onToggle,
}: {
  color: string;
  isOpen: boolean;
  label: string;
  onSetColor: (color: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="relative shrink-0">
      <AdhdIconButton
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Change color for ${label}`}
        onClick={onToggle}
        onMouseDown={(event) => event.preventDefault()}
        size="sm"
        tone="ghost"
        variant="rowToolbar"
      >
        <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-black/10 dark:border-white/20" style={{ backgroundColor: color }} />
      </AdhdIconButton>
      {isOpen ? (
        <HealthAccentColorPalette
          className="absolute right-0 top-full z-20 mt-1"
          color={color}
          label={label}
          onSetColor={onSetColor}
        />
      ) : null}
    </div>
  );
}

function HealthSymptomColorControl({
  isOpen,
  onSetColor,
  onToggle,
  symptom,
}: {
  isOpen: boolean;
  onSetColor: (color: string) => void;
  onToggle: () => void;
  symptom: HealthSymptom;
}) {
  return <HealthColorControl color={normalizeHealthSymptomColor(symptom.color)} isOpen={isOpen} label={symptom.name} onSetColor={onSetColor} onToggle={onToggle} />;
}

function getJournalTagOptionKey(option: JournalTagOption) {
  return `${option.kind}:${option.symptomId ?? option.signal?.id ?? option.name.toLowerCase()}`;
}

function getJournalTagOptionColor(option: JournalTagOption, symptoms: readonly HealthSymptom[]) {
  if (option.kind === "symptom" && option.symptomId) {
    return normalizeHealthSymptomColor(symptoms.find((symptom) => symptom.id === option.symptomId)?.color);
  }
  return option.signal ? getHealthJournalSignalDisplayColor(option.signal) : "#6f57f6";
}

function formatJournalHistoryOccurrenceTime(timestamp: string) {
  return formatHealthTimestampTime(timestamp) ?? "Time unavailable";
}

function formatJournalLoggedAt(timestamp: string) {
  const date = formatHealthJournalMetadataDate(timestamp);
  const time = formatHealthTimestampTime(timestamp);
  return date && time ? `${date} · ${time}` : "time unavailable";
}

const FEELING_TREND_GROUPS: ReadonlyArray<{
  allLabel: string;
  heading: string;
  kind: HealthFeelingTrendKind;
}> = [
  { allLabel: "All Symptoms", heading: "Symptoms", kind: "symptom" },
  { allLabel: "All Emotions", heading: "Emotions", kind: "emotion" },
  { allLabel: "All Other Feelings", heading: "Other Feelings", kind: "other" },
];

function FeelingTrendSelector({
  definitions,
  disabled,
  onToggleKeys,
  selectedKeys,
}: {
  definitions: readonly FeelingTrendDefinition[];
  disabled: boolean;
  onToggleKeys: (keys: readonly string[]) => void;
  selectedKeys: ReadonlySet<string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectorId = "feeling-trend-selector";
  const selectionSummary = getHealthFeelingTrendSelectionSummary(definitions, selectedKeys);

  useEffect(() => {
    function handleOutsidePointerDown(event: globalThis.PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, []);

  function renderCheckbox(label: string, keys: readonly string[], key: string) {
    const isChecked = keys.length > 0 && keys.every((definitionKey) => selectedKeys.has(definitionKey));
    return (
      <label className="flex min-w-0 cursor-pointer items-start gap-2 rounded-[0.8rem] px-2 py-1.5 text-left text-[13px] leading-5 text-[#5f5876] transition hover:bg-[#f7f5fb] dark:text-white/75 dark:hover:bg-white/8" key={key}>
        <input
          aria-label={label}
          checked={isChecked}
          className="mt-1 h-3.5 w-3.5 shrink-0 accent-[#6f57f6]"
          onChange={() => onToggleKeys(keys)}
          type="checkbox"
        />
        <span className="min-w-0 break-words whitespace-normal">{label}</span>
      </label>
    );
  }

  return (
    <div
      className="relative w-full"
      onBlur={(event) => {
        if (event.relatedTarget && !rootRef.current?.contains(event.relatedTarget as Node)) {
          setIsOpen(false);
        }
      }}
      ref={rootRef}
    >
      <button
        aria-controls={isOpen ? selectorId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Trend Feelings"
        className={`${HEALTH_COMPACT_CONTROL_CLASS} flex items-center justify-between gap-2 text-left`}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">{selectionSummary}</span>
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-[#8d87a7] transition-transform dark:text-white/45 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <AdhdDropdownPanel
          aria-label="Feeling trend selector"
          className="adhdice-scrollbar max-h-[min(32rem,calc(100dvh-2rem))] overflow-y-auto"
          id={selectorId}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setIsOpen(false);
            }
          }}
          role="dialog"
          widthClassName="w-[min(24rem,calc(100vw-2rem))]"
        >
          <div className="grid gap-3">
            <section aria-labelledby={`${selectorId}-all-heading`} className="grid gap-1">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40" id={`${selectorId}-all-heading`}>All</p>
              {renderCheckbox("All Feelings", definitions.map((definition) => definition.key), `${selectorId}-all`)}
            </section>
            {FEELING_TREND_GROUPS.map((group) => {
              const groupDefinitions = definitions.filter((definition) => definition.kind === group.kind);
              if (groupDefinitions.length === 0) return null;
              return (
                <section aria-labelledby={`${selectorId}-${group.kind}-heading`} className="grid gap-1" key={group.kind}>
                  <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40" id={`${selectorId}-${group.kind}-heading`}>{group.heading}</p>
                  {renderCheckbox(group.allLabel, groupDefinitions.map((definition) => definition.key), `${selectorId}-${group.kind}-all`)}
                  {groupDefinitions.map((definition) => renderCheckbox(
                    `${definition.name}${definition.archived ? " (archived)" : ""}`,
                    [definition.key],
                    `${selectorId}-${definition.key}`,
                  ))}
                </section>
              );
            })}
          </div>
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}

function JournalHistoryTagPopover({
  entry,
  entryValues,
  onClose,
  option,
  journalSignalOccurrences,
  symptomEntries,
  symptoms,
}: {
  entry: HealthCheckIn;
  entryValues: readonly HealthJournalSignalValue[];
  onClose: () => void;
  option: JournalTagOption;
  journalSignalOccurrences: readonly HealthJournalSignalOccurrence[];
  symptomEntries: readonly HealthSymptomEntry[];
  symptoms: readonly HealthSymptom[];
}) {
  const occurrenceRows = option.kind === "symptom" && option.symptomId
    ? symptomEntries
      .filter((occurrence) => occurrence.journal_entry_id === entry.id && occurrence.symptom_id === option.symptomId)
      .sort((left, right) => Date.parse(left.logged_at) - Date.parse(right.logged_at))
      .map((occurrence) => ({ id: occurrence.id, occurredAt: occurrence.logged_at, note: occurrence.note, score: occurrence.severity }))
    : option.signal
      ? journalSignalOccurrences
        .filter((occurrence) => occurrence.journal_entry_id === entry.id && occurrence.signal_id === option.signal?.id)
        .sort((left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at))
        .map((occurrence) => ({ id: occurrence.id, occurredAt: occurrence.occurred_at, note: occurrence.note, score: occurrence.score }))
      : [];
  const overallValue = option.signal
    ? entryValues.find((value) => value.signal_id === option.signal?.id) ?? null
    : null;
  const displayName = getHealthJournalSignalDisplayName(option.signal ?? {
    archived_at: null,
    color: null,
    created_at: entry.created_at,
    high_label: "Extreme",
    id: option.symptomId ?? getJournalTagOptionKey(option),
    in_template: false,
    kind: option.kind,
    low_label: "None",
    name: option.name,
    scale_labels: getDefaultHealthJournalScaleLabels(option.kind),
    symptom_id: option.symptomId ?? null,
    template_sort_order: null,
    updated_at: entry.updated_at,
    user_id: entry.user_id,
  }, symptoms);
  const scaleLabels = option.signal?.scale_labels ?? getDefaultHealthJournalScaleLabels(option.kind);

  return (
    <AdhdDropdownPanel
      aria-label={`View ${displayName} details from this Journal Entry`}
      className="left-0 top-[calc(100%+0.35rem)] z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto"
      role="dialog"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      widthClassName="w-[min(20rem,calc(100vw-2rem))]"
    >
      <div className="grid gap-3 text-xs text-[#68738c] dark:text-white/60">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{displayName}</p>
          <div className="mt-2 grid gap-2">
            <p className="font-semibold text-[#4f5872] dark:text-white/75">Occurrences</p>
            {occurrenceRows.length > 0 ? occurrenceRows.map((occurrence) => (
                <div className="grid gap-0.5" key={occurrence.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span>{formatJournalHistoryOccurrenceTime(occurrence.occurredAt)}</span>
                    <span className="text-right font-semibold text-[#26324f] dark:text-white">{occurrence.score} · {scaleLabels[occurrence.score] ?? ""}</span>
                  </div>
                  {occurrence.note?.trim() ? <p className="text-[#4f5872] dark:text-white/75">{occurrence.note}</p> : null}
                </div>
              )) : <span>None logged</span>}
          </div>
        </div>
        {overallValue ? (
          <div className="border-t border-[#eeeaf8] pt-2 dark:border-white/10">
            <p className="font-semibold text-[#4f5872] dark:text-white/75">Snapshot rating</p>
            <p className="mt-1 font-semibold text-[#26324f] dark:text-white">{overallValue.score} · {scaleLabels[overallValue.score] ?? ""}</p>
          </div>
        ) : null}
      </div>
    </AdhdDropdownPanel>
  );
}

function JournalHistoryReflection({
  entry,
  entryValues,
  historyTagOptions,
  historyTagOptionsByKey,
  onToggleTag,
  selectedTag,
  journalSignalOccurrences,
  symptomEntries,
  symptoms,
}: {
  entry: HealthCheckIn;
  entryValues: readonly HealthJournalSignalValue[];
  historyTagOptions: readonly JournalTagOption[];
  historyTagOptionsByKey: ReadonlyMap<string, JournalTagOption>;
  onToggleTag: (match: { key: string; start: number }) => void;
  selectedTag: JournalHistoryTagOverlay;
  journalSignalOccurrences: readonly HealthJournalSignalOccurrence[];
  symptomEntries: readonly HealthSymptomEntry[];
  symptoms: readonly HealthSymptom[];
}) {
  const matches = findHealthJournalReflectionTagMatches(
    entry.reflection,
    historyTagOptions.map((option) => ({ key: getJournalTagOptionKey(option), kind: option.kind, name: option.name })),
  );
  const nodes: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match) => {
    const option = historyTagOptionsByKey.get(match.key);
    if (!option) return;
    if (match.start > cursor) nodes.push(entry.reflection.slice(cursor, match.start));
    const isOpen = selectedTag?.entryId === entry.id
      && selectedTag.optionKey === match.key
      && selectedTag.start === match.start;
    nodes.push(
      <span className="relative inline-block align-baseline" key={`${match.start}:${match.key}`}>
        <button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={`View ${match.text.slice(1)} details from this Journal Entry`}
          className="rounded px-0.5 font-semibold underline decoration-current/30 underline-offset-2 transition hover:bg-[#f1edff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:hover:bg-white/[0.08]"
          onClick={() => onToggleTag({ key: match.key, start: match.start })}
          onKeyDown={(event) => {
            if (event.key === "Escape" && isOpen) {
              event.preventDefault();
              onToggleTag({ key: match.key, start: match.start });
            }
          }}
          style={{ color: getJournalTagOptionColor(option, symptoms) }}
          type="button"
        >
          {match.text}
        </button>
        {isOpen ? <JournalHistoryTagPopover entry={entry} entryValues={entryValues} journalSignalOccurrences={journalSignalOccurrences} onClose={() => onToggleTag({ key: match.key, start: match.start })} option={option} symptomEntries={symptomEntries} symptoms={symptoms} /> : null}
      </span>,
    );
    cursor = match.end;
  });
  if (cursor < entry.reflection.length) nodes.push(entry.reflection.slice(cursor));

  return <div className="mt-2 text-sm leading-6 text-[#66718f] dark:text-white/60">{nodes}</div>;
}

function HealthJournalColorControl({
  isOpen,
  onSetColor,
  onToggle,
  signal,
  symptoms,
}: {
  isOpen: boolean;
  onSetColor: (color: string) => void;
  onToggle: () => void;
  signal: HealthJournalSignal;
  symptoms: readonly HealthSymptom[];
}) {
  return <HealthColorControl color={getHealthJournalSignalDisplayColor(signal, symptoms.find((symptom) => symptom.id === signal.symptom_id))} isOpen={isOpen} label={getHealthJournalSignalDisplayName(signal, symptoms)} onSetColor={onSetColor} onToggle={onToggle} />;
}

function JournalScaleLabelsEditor({
  draft,
  nameDisabled = false,
  onCancel,
  onChange,
  onSave,
  signal,
  symptoms = [],
}: {
  draft: JournalLibraryEditDraft;
  nameDisabled?: boolean;
  onCancel: () => void;
  onChange: (draft: JournalLibraryEditDraft) => void;
  onSave: () => void;
  signal: HealthJournalSignal;
  symptoms?: readonly HealthSymptom[];
}) {
  const labels = Array.from({ length: HEALTH_JOURNAL_SCORE_OPTIONS.length }, (_, index) => draft.scaleLabels[index] ?? "");
  const displayName = getHealthJournalSignalDisplayName(signal, symptoms);
  return (
    <div className="grid gap-3 rounded-[0.9rem] border border-[#e4deef] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
      {signal.kind === "symptom" ? <p className="text-sm font-semibold text-[#26324f] dark:text-white">{displayName}</p> : <Field label="Name"><input aria-label={`Edit ${displayName} name`} className={HEALTH_COMPACT_INPUT_CLASS} disabled={nameDisabled} onChange={(event) => onChange({ ...draft, name: event.target.value })} value={draft.name} /></Field>}
      <div className="grid gap-2" id={`journal-scale-labels-${signal.id}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Scale labels</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {labels.map((label, index) => <label className="flex min-w-0 items-center gap-2 rounded-[0.7rem] border border-[#edf0fb] bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.04]" key={index}><span className="w-4 shrink-0 font-black text-[#6f57f6] dark:text-[#cabfff]">{index}</span><input aria-label={`${displayName} score ${index} label`} className="min-w-0 flex-1 bg-transparent text-sm text-[#3c4966] outline-none dark:text-white/75" onChange={(event) => { const nextLabels = [...labels]; nextLabels[index] = event.target.value; onChange({ ...draft, scaleLabels: nextLabels }); }} value={label} /></label>)}
        </div>
      </div>
      <div className="flex justify-end gap-2"><AdhdChip onClick={onCancel} type="button">Cancel</AdhdChip><AdhdChip onClick={onSave} tone="purple" type="button">Save</AdhdChip></div>
    </div>
  );
}

function JournalFeelingCreationRow({
  inTemplate,
  kind,
  name,
  onCancel,
  onChangeInTemplate,
  onChangeName,
  onSave,
}: {
  inTemplate: boolean;
  kind: JournalSignalCreateKind;
  name: string;
  onCancel: () => void;
  onChangeInTemplate: (inTemplate: boolean) => void;
  onChangeName: (name: string) => void;
  onSave: () => void;
}) {
  const feelingLabel = kind === "emotion" ? "Emotion" : "Other Feeling";
  return (
    <div className="grid gap-3 rounded-[1rem] border border-[#eeeaf8] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Name"><input aria-label={`${feelingLabel} name`} className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-0 w-full`} onChange={(event) => onChangeName(event.target.value)} value={name} /></Field>
        <label className="flex items-center gap-2 text-sm text-[#5d6783] dark:text-white/70"><input checked={inTemplate} onChange={(event) => onChangeInTemplate(event.target.checked)} type="checkbox" /> Add to Daily Template</label>
      </div>
      <div className="flex justify-end gap-2"><AdhdChip onClick={onCancel} type="button">Cancel</AdhdChip><AdhdChip onClick={onSave} tone="purple" type="button">Save</AdhdChip></div>
    </div>
  );
}

function JournalFeelingLibrarySection({
  deleteJournalSignal,
  draft,
  journalLibraryEditId,
  journalLibraryCreateKind,
  journalSignalOccurrences,
  journalSignalValues,
  kind,
  onCancelEdit,
  onCancelCreate,
  onChangeDraft,
  onChangeCreateInTemplate,
  onChangeCreateName,
  onCreate,
  onEdit,
  onOpenCreate,
  onSaveEdit,
  onToggleTemplate,
  onSetColor,
  onToggleColorPicker,
  journalSignalCreateInTemplate,
  journalSignalCreateName,
  signals,
  symptoms,
  archiveJournalSignal,
  moveJournalSignal,
  openColorPickerKey,
}: {
  deleteJournalSignal: (signalId: string) => Promise<boolean>;
  draft: JournalLibraryEditDraft;
  journalLibraryEditId: string | null;
  journalLibraryCreateKind: JournalSignalCreateKind | null;
  journalSignalOccurrences: HealthJournalSignalOccurrence[];
  journalSignalValues: HealthJournalSignalValue[];
  kind: JournalSignalCreateKind;
  onCancelEdit: () => void;
  onCancelCreate: () => void;
  onChangeDraft: (draft: JournalLibraryEditDraft) => void;
  onChangeCreateInTemplate: (inTemplate: boolean) => void;
  onChangeCreateName: (name: string) => void;
  onCreate: () => void;
  onEdit: (signal: HealthJournalSignal) => void;
  onOpenCreate: (kind: JournalSignalCreateKind) => void;
  onSaveEdit: (signal: HealthJournalSignal) => void;
  onSetColor: (signalId: string, color: string) => void;
  onToggleTemplate: (signal: HealthJournalSignal) => void;
  onToggleColorPicker: (key: string) => void;
  journalSignalCreateInTemplate: boolean;
  journalSignalCreateName: string;
  signals: HealthJournalSignal[];
  symptoms: HealthSymptom[];
  archiveJournalSignal: (signalId: string) => Promise<boolean>;
  moveJournalSignal: (signalId: string, direction: -1 | 1) => void;
  openColorPickerKey: string | null;
}) {
  const sectionSignals = signals.filter((signal) => signal.kind === kind && signal.archived_at === null);
  const templateSignals = getHealthJournalTemplateSignals(signals, symptoms);
  const sectionTitle = kind === "emotion" ? "Emotions" : "Other Feelings";
  const createLabel = kind === "emotion" ? "Emotion" : "Other Feeling";
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionMiniTitle title={sectionTitle} />
        <AdhdChip aria-label={`Add ${createLabel}`} onClick={() => onOpenCreate(kind)} type="button">+ {createLabel}</AdhdChip>
      </div>
      {journalLibraryCreateKind === kind ? <JournalFeelingCreationRow
        inTemplate={journalSignalCreateInTemplate}
        kind={kind}
        name={journalSignalCreateName}
        onCancel={onCancelCreate}
        onChangeInTemplate={onChangeCreateInTemplate}
        onChangeName={onChangeCreateName}
        onSave={onCreate}
      /> : null}
      {sectionSignals.map((signal) => {
        const templateIndex = templateSignals.findIndex((candidate) => candidate.id === signal.id);
        const hasHistory = journalSignalValues.some((value) => value.signal_id === signal.id)
          || journalSignalOccurrences.some((occurrence) => occurrence.signal_id === signal.id);
        const displayName = getHealthJournalSignalDisplayName(signal, symptoms);
        const isColorOpen = openColorPickerKey === `library:${signal.id}`;
        return (
          <div className="grid gap-2 rounded-[0.9rem] border border-[#edf0fb] px-3 py-2 dark:border-white/10" key={signal.id}>
            {journalLibraryEditId === signal.id ? <JournalScaleLabelsEditor draft={draft} onCancel={onCancelEdit} onChange={onChangeDraft} onSave={() => onSaveEdit(signal)} signal={signal} /> : <>
              <div className="flex flex-wrap items-center gap-2">
                <HealthJournalColorControl isOpen={isColorOpen} onSetColor={(color) => onSetColor(signal.id, color)} onToggle={() => onToggleColorPicker(`library:${signal.id}`)} signal={signal} symptoms={symptoms} />
                <span className="min-w-0 flex-1 font-semibold text-[#26324f] dark:text-white">{displayName}</span>
                <span className="text-xs text-[#7d88a3] dark:text-white/45">{signal.scale_labels[0]} → {signal.scale_labels[10]}</span>
                <AdhdChip onClick={() => onToggleTemplate(signal)} type="button">{signal.in_template ? "In Daily Template" : "Add to Template"}</AdhdChip>
                {signal.in_template ? <>
                  <AdhdIconButton aria-label={`Move ${displayName} up`} disabled={templateIndex <= 0} onClick={() => moveJournalSignal(signal.id, -1)} size="sm" tone="ghost" variant="rowToolbar"><ChevronUp aria-hidden="true" /></AdhdIconButton>
                  <AdhdIconButton aria-label={`Move ${displayName} down`} disabled={templateIndex < 0 || templateIndex >= templateSignals.length - 1} onClick={() => moveJournalSignal(signal.id, 1)} size="sm" tone="ghost" variant="rowToolbar"><ChevronDown aria-hidden="true" /></AdhdIconButton>
                </> : null}
                <AdhdIconButton aria-label={`Edit ${displayName}`} onClick={() => onEdit(signal)} size="sm" tone="ghost" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton>
                <AdhdIconButton aria-label={`Archive ${displayName}`} onClick={() => { void archiveJournalSignal(signal.id); }} size="sm" tone="danger" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton>
                {!hasHistory ? <AdhdIconButton aria-label={`Delete ${displayName}`} onClick={() => { void deleteJournalSignal(signal.id); }} size="sm" tone="danger" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton> : null}
              </div>
            </>}
          </div>
        );
      })}
    </section>
  );
}

function JournalSymptomLibrarySection({
  activeSymptoms,
  archiveSymptom,
  editingSymptomId,
  editingSymptomName,
  getJournalSignalForSymptom,
  handleRenameSymptom,
  handleSetSymptomColor,
  isSymptomCreateOpen,
  journalLibraryEditId,
  journalLibraryEditDraft,
  journalSignalValues,
  onCancelCreate,
  onChangeCreateName,
  onCancelEdit,
  onChangeDraft,
  onCreate,
  onEdit,
  onSaveEdit,
  onToggleColorPicker,
  onToggleTemplate,
  onAddSymptom,
  onMove,
  openSymptomColorPickerKey,
  setEditingSymptomId,
  setEditingSymptomName,
  startJournalSymptomEdit,
  symptoms,
  symptomCreateName,
  templateSignals,
}: {
  activeSymptoms: HealthSymptom[];
  archiveSymptom: (symptomId: string) => Promise<boolean>;
  editingSymptomId: string | null;
  editingSymptomName: string;
  getJournalSignalForSymptom: (symptomId: string) => HealthJournalSignal | null;
  handleRenameSymptom: (symptomId: string) => Promise<void>;
  handleSetSymptomColor: (symptomId: string, color: string) => void;
  isSymptomCreateOpen: boolean;
  journalLibraryEditId: string | null;
  journalLibraryEditDraft: JournalLibraryEditDraft;
  journalSignalValues: HealthJournalSignalValue[];
  onCancelCreate: () => void;
  onChangeCreateName: (name: string) => void;
  onCancelEdit: () => void;
  onChangeDraft: (draft: JournalLibraryEditDraft) => void;
  onCreate: () => void;
  onEdit: (signal: HealthJournalSignal) => void;
  onSaveEdit: (signal: HealthJournalSignal) => void;
  onToggleColorPicker: (key: string) => void;
  onToggleTemplate: (symptom: HealthSymptom, inTemplate: boolean) => void;
  onAddSymptom: () => void;
  onMove: (signalId: string, direction: -1 | 1) => void;
  openSymptomColorPickerKey: string | null;
  setEditingSymptomId: (id: string | null) => void;
  setEditingSymptomName: (name: string) => void;
  startJournalSymptomEdit: (symptom: HealthSymptom) => void;
  symptoms: HealthSymptom[];
  templateSignals: HealthJournalSignal[];
  symptomCreateName: string;
}) {
  return <section className="grid gap-2"><div className="flex items-center justify-between gap-2"><SectionMiniTitle title="Symptoms" /><AdhdChip aria-label="Add symptom" onClick={onAddSymptom} type="button">+ Symptom</AdhdChip></div>{isSymptomCreateOpen ? <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-[1rem] border border-[#eeeaf8] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.03]"><input aria-label="New symptom name" className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-0 w-full sm:min-w-[12rem] sm:flex-1 sm:w-auto`} onChange={(event) => onChangeCreateName(event.target.value)} value={symptomCreateName} /><div className="flex shrink-0 gap-2 sm:ml-auto"><AdhdChip onClick={onCancelCreate} type="button">Cancel</AdhdChip><AdhdChip onClick={onCreate} tone="purple" type="button">Save</AdhdChip></div></div> : null}<p className="text-xs text-[#7d7598] dark:text-white/50">Symptoms use the canonical Health name. Journal controls appear here only when needed.</p>{activeSymptoms.map((symptom) => { const signal = getJournalSignalForSymptom(symptom.id); const templateIndex = signal ? templateSignals.findIndex((candidate) => candidate.id === signal.id) : -1; const hasHistory = signal ? journalSignalValues.some((value) => value.signal_id === signal.id) : false; const isColorOpen = openSymptomColorPickerKey === `library:${symptom.id}`; return <div className="grid gap-2 rounded-[0.9rem] border border-[#edf0fb] px-3 py-2 dark:border-white/10" key={symptom.id}><div className="flex flex-wrap items-center gap-2">{editingSymptomId === symptom.id ? null : <HealthSymptomColorControl isOpen={isColorOpen} onSetColor={(color) => handleSetSymptomColor(symptom.id, color)} onToggle={() => onToggleColorPicker(`library:${symptom.id}`)} symptom={symptom} />}{editingSymptomId === symptom.id ? <input aria-label={`Rename ${symptom.name}`} className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-0 flex-1`} onChange={(event) => setEditingSymptomName(event.target.value)} value={editingSymptomName} /> : <span className="min-w-0 flex-1 font-semibold text-[#26324f] dark:text-white">{symptom.name}</span>}{signal ? <AdhdChip onClick={() => onToggleTemplate(symptom, !signal.in_template)} type="button">{signal.in_template ? "In Daily Template" : "Add to Template"}</AdhdChip> : <AdhdChip onClick={() => onToggleTemplate(symptom, true)} type="button">Add to Template</AdhdChip>}{signal?.in_template ? <><AdhdIconButton aria-label={`Move ${symptom.name} up`} disabled={templateIndex <= 0} onClick={() => signal && onMove(signal.id, -1)} size="sm" tone="ghost" variant="rowToolbar"><ChevronUp aria-hidden="true" /></AdhdIconButton><AdhdIconButton aria-label={`Move ${symptom.name} down`} disabled={templateIndex < 0 || templateIndex >= templateSignals.length - 1} onClick={() => signal && onMove(signal.id, 1)} size="sm" tone="ghost" variant="rowToolbar"><ChevronDown aria-hidden="true" /></AdhdIconButton></> : null}{editingSymptomId === symptom.id ? <><AdhdChip onClick={() => { void handleRenameSymptom(symptom.id); }} tone="purple" type="button">Save</AdhdChip><AdhdChip onClick={() => setEditingSymptomId(null)} type="button">Cancel</AdhdChip></> : <><AdhdIconButton aria-label={`Rename ${symptom.name}`} onClick={() => { setEditingSymptomId(symptom.id); setEditingSymptomName(symptom.name); }} size="sm" tone="ghost" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton><AdhdIconButton aria-label={`Archive ${symptom.name}`} onClick={() => { void archiveSymptom(symptom.id); }} size="sm" tone="danger" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton></>}{signal ? <AdhdIconButton aria-label={`Edit ${symptom.name} labels`} onClick={() => onEdit(signal)} size="sm" tone="ghost" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton> : <AdhdChip onClick={() => { void startJournalSymptomEdit(symptom); }} type="button">Edit labels</AdhdChip>}</div>{signal && journalLibraryEditId === signal.id ? <JournalScaleLabelsEditor draft={journalLibraryEditDraft} nameDisabled onCancel={onCancelEdit} onChange={onChangeDraft} onSave={() => onSaveEdit(signal)} signal={signal} symptoms={symptoms} /> : null}{hasHistory ? <span className="text-xs text-[#7d88a3] dark:text-white/45">Existing Journal history is retained.</span> : null}</div>; })}{activeSymptoms.length === 0 ? <EmptyCopy text="No active Symptoms yet." /> : null}</section>;
}

export function HealthPage({
  checkIns,
  journalSignals,
  journalSignalValues,
  journalSignalOccurrences,
  symptoms,
  symptomEntries,
  createSymptom,
  renameSymptom,
  setSymptomColor,
  archiveSymptom,
  deleteFavoriteFood,
  deleteMealEntry,
  deleteRecipe,
  deleteSavedMeal,
  deleteWaterEntry,
  deleteWorkout,
  deleteWeightEntry,
  favorites,
  importAudits,
  importAppleHealthData,
  isLoading,
  focusCategories,
  focusHistory,
  mealEntries,
  mealPlanEntries,
  metricEntries,
  profile,
  recipes,
  saveJournalEntry,
  createJournalSignal,
  updateJournalSignal,
  setJournalSignalTemplate,
  archiveJournalSignal,
  deleteJournalSignal,
  reorderJournalSignals,
  deleteJournalEntry,
  saveFavoriteFood,
  setFavoriteFoodStatus,
  saveRecipe,
  savedMeals,
  saveSavedMeal,
  saveProfile,
  addMealEntry,
  addMealPlanEntry,
  updateMealPlanEntry,
  deleteMealPlanEntry,
  confirmMealPlanEntry,
  addWeightEntry,
  addWaterEntry,
  confirmWaterEntry,
  addWorkout,
  archiveGoal,
  archiveExercise,
  archivePlan,
  archivePlanItem,
  createExercise,
  createGoal,
  createLevel,
  createPlan,
  createPlanItem,
  deleteLevel,
  fitnessPlanError,
  fitnessPlansLoading,
  fitnessGoalsError,
  fitnessGoalsLoading,
  fitnessGoals,
  fitnessGoalLevels,
  fitnessSessionError,
  fitnessSessionLoaded,
  fitnessSessionLoading,
  exerciseLibrary,
  getWorkoutSessionDetails,
  reorderExercises,
  updateWaterEntry,
  updateWorkout,
  updateMealEntry,
  saveWorkoutSessionDetails,
  updateExercise,
  updateGoal,
  updateLevel,
  saveWorkoutPlanItemLinks,
  updatePlan,
  updatePlanItem,
  restoreGoal,
  sleepCategory,
  sleepActiveSession,
  onToggleSleepClock,
  onFinishSleepClock,
  onLogManualSleep,
  onUpdateSleepSession,
  weightEntries,
  waterEntries,
  workouts,
  planItems,
  plans,
  workoutPlanItemLinks,
  workoutExercises,
  workoutSets,
}: HealthPageProps) {
  const activeTab = useSyncExternalStore(subscribeToHealthTabPreference, readHealthTabPreference, () => "Today");
  const pageShellLayout = usePageShellLayout(profile?.user_id ?? null, getHealthPageShellKey(activeTab), HEALTH_PAGE_SHELL_IDS[activeTab], HEALTH_PAGE_SHELL_SIZE_DEFAULTS[activeTab]);
  const [profileDraft, setProfileDraft] = useState<HealthProfileUpdate>({});
  const [mealDraft, setMealDraft] = useState<MealDraft>(() => createDefaultMealDraft());
  const [activeMealEntrySlot, setActiveMealEntrySlot] = useState<HealthMealEntry["meal_slot"] | null>(null);
  const [mealEditorMode, setMealEditorMode] = useState<"actual" | "plan">("actual");
  const [editingMealPlanId, setEditingMealPlanId] = useState<string | null>(null);
  const [customFoodSearchQuery, setCustomFoodSearchQuery] = useState("");
  const [selectedCustomFoodCategory, setSelectedCustomFoodCategory] = useState<string | null>(null);
  const [isCustomFoodCategoriesOpen, setIsCustomFoodCategoriesOpen] = useState(false);
  const [foodHistoryDate, setFoodHistoryDate] = useState(todayHealthDate());
  const [sleepLedgerDate, setSleepLedgerDate] = useState(todayHealthDate());
  const [expandedFavoriteId, setExpandedFavoriteId] = useState<string | null>(null);
  const [targetWeightDraft, setTargetWeightDraft] = useState("");
  const [barcodeLookupError, setBarcodeLookupError] = useState("");
  const [barcodeLookupStatus, setBarcodeLookupStatus] = useState<"idle" | "barcode">("idle");
  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState(false);
  const [saveQuickEntryToLibrary, setSaveQuickEntryToLibrary] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealEditDraft, setMealEditDraft] = useState<MealEditDraft>({
    mode: "legacy",
    calories: "",
    carbs: "",
    date: todayHealthDate(),
    fat: "",
    mealSlot: "breakfast",
    protein: "",
    quantity: "1",
    measurement: "serving",
    servingLabel: "",
    time: "12:00",
  });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<AppleHealthImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [importParseStatus, setImportParseStatus] = useState(DEFAULT_IMPORT_STATUS);
  const [isSavingImport, setIsSavingImport] = useState(false);
  const [importSaveStatus, setImportSaveStatus] = useState("");
  const [weightDraft, setWeightDraft] = useState("");
  const [weightNote, setWeightNote] = useState("");
  const [journalDate, setJournalDate] = useState(todayHealthDate());
  const [journalEntryTime, setJournalEntryTime] = useState(getCurrentHealthDateTimeInputs().time);
  const [selectedJournalEntryId, setSelectedJournalEntryId] = useState<string | null>(null);
  const [journalReflection, setJournalReflection] = useState("");
  const [journalMood, setJournalMood] = useState<number | null>(null);
  const [journalEnergy, setJournalEnergy] = useState<number | null>(null);
  const [journalStress, setJournalStress] = useState<number | null>(null);
  const [journalClarity, setJournalClarity] = useState<number | null>(null);
  const [journalDraftValues, setJournalDraftValues] = useState<HealthJournalDraftValue[]>([]);
  const [journalOccurrences, setJournalOccurrences] = useState<JournalOccurrenceDraft[]>([]);
  const [journalOccurrenceHydrationVersion, setJournalOccurrenceHydrationVersion] = useState(0);
  const [isJournalLibraryOpen, setIsJournalLibraryOpen] = useState(false);
  const [isJournalAddOpen, setIsJournalAddOpen] = useState(false);
  const [journalLibraryCreateKind, setJournalLibraryCreateKind] = useState<JournalSignalCreateKind | null>(null);
  const [journalSignalCreateName, setJournalSignalCreateName] = useState("");
  const [journalSignalCreateInTemplate, setJournalSignalCreateInTemplate] = useState(true);
  const [journalLibraryEditId, setJournalLibraryEditId] = useState<string | null>(null);
  const [journalLibraryEditDraft, setJournalLibraryEditDraft] = useState<JournalLibraryEditDraft>({ name: "", scaleLabels: [] });
  const [expandedJournalScaleKey, setExpandedJournalScaleKey] = useState<string | null>(null);
  const [journalTagQuery, setJournalTagQuery] = useState<JournalTagQuery | null>(null);
  const [journalTagOverlay, setJournalTagOverlay] = useState<JournalTagOverlay>(null);
  const [journalHistoryTagOverlay, setJournalHistoryTagOverlay] = useState<JournalHistoryTagOverlay>(null);
  const [journalTagHighlightIndex, setJournalTagHighlightIndex] = useState(0);
  const [journalOccurrenceEditorOpen, setJournalOccurrenceEditorOpen] = useState(false);
  const [journalOccurrenceEditKey, setJournalOccurrenceEditKey] = useState<string | null>(null);
  const [journalOccurrenceEditId, setJournalOccurrenceEditId] = useState<string | null>(null);
  const [journalOccurrenceSignalId, setJournalOccurrenceSignalId] = useState("");
  const [journalOccurrenceScore, setJournalOccurrenceScore] = useState<number | null>(null);
  const [journalOccurrenceTime, setJournalOccurrenceTime] = useState(getCurrentHealthDateTimeInputs().time);
  const [journalOccurrenceNote, setJournalOccurrenceNote] = useState("");
  const [journalFormError, setJournalFormError] = useState<string | null>(null);
  const [journalWorkspaceMode, setJournalWorkspaceMode] = useState<JournalWorkspaceMode>("entry");
  const [isJournalHistoryMenuOpen, setIsJournalHistoryMenuOpen] = useState(false);
  const [isJournalLoggedMetadataOpen, setIsJournalLoggedMetadataOpen] = useState(false);
  const [expandedJournalHistoryEntryIds, setExpandedJournalHistoryEntryIds] = useState<Set<string>>(() => new Set());
  const [collapsedJournalHistoryDates, setCollapsedJournalHistoryDates] = useState<Set<string>>(() => new Set());
  const [selectedFeelingTrendDefinitionKeys, setSelectedFeelingTrendDefinitionKeys] = useState<Set<string>>(() => new Set());
  const [openSymptomColorPickerKey, setOpenSymptomColorPickerKey] = useState<string | null>(null);
  const [isSymptomCreateOpen, setIsSymptomCreateOpen] = useState(false);
  const [isCreatingSymptom, setIsCreatingSymptom] = useState(false);
  const [symptomCreateName, setSymptomCreateName] = useState("");
  const [feelingTrendRange, setFeelingTrendRange] = useState<HealthFeelingTrendRange>("30D");
  const [editingSymptomId, setEditingSymptomId] = useState<string | null>(null);
  const [editingSymptomName, setEditingSymptomName] = useState("");
  const initialSleepInputs = useMemo(() => getCurrentHealthDateTimeInputs(), []);
  const [sleepKind, setSleepKind] = useState<HealthSleepKind>("Sleep");
  const [manualSleepDraft, setManualSleepDraft] = useState<SleepDraft>(() => ({
    date: initialSleepInputs.date,
    hours: "8",
    kind: "Sleep",
    minutes: "0",
    time: initialSleepInputs.time,
  }));
  const [editingSleepId, setEditingSleepId] = useState<string | null>(null);
  const [sleepEditDraft, setSleepEditDraft] = useState<SleepDraft | null>(null);
  const [sleepFormError, setSleepFormError] = useState<string | null>(null);
  const [sleepClockNow, setSleepClockNow] = useState(() => Date.now());
  const importAbortRef = useRef<AbortController | null>(null);
  const barcodeLookupGenerationRef = useRef(0);
  const mealSaveInFlightRef = useRef(false);
  const journalReflectionRef = useRef<HTMLTextAreaElement | null>(null);
  const journalTagCaretRef = useRef<number | null>(null);
  const journalLibraryRef = useRef<HTMLDivElement | null>(null);
  const journalSignalsRef = useRef(journalSignals);
  const journalDraftEntryIdRef = useRef<string | null>(null);
  const journalOccurrenceSaveStatusRef = useRef<"idle" | "saving" | "succeeded">("idle");
  const journalHistoryLongPressTimerRef = useRef<number | null>(null);
  const journalHistoryLongPressFiredRef = useRef(false);
  const previousFeelingTrendDefinitionKeysRef = useRef<string[]>([]);
  const hasInitializedFeelingTrendSelectionRef = useRef(false);
  const today = todayHealthDate();

  useEffect(() => {
    journalSignalsRef.current = journalSignals;
  }, [journalSignals]);

  useEffect(() => {
    if (!sleepActiveSession?.isRunning) return;
    const intervalId = window.setInterval(() => setSleepClockNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [sleepActiveSession?.isRunning]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    setProfileDraft({
      calorie_goal: profile.calorie_goal,
      carbs_goal_grams: profile.carbs_goal_grams,
      fat_goal_grams: profile.fat_goal_grams,
      movement_goal: profile.movement_goal,
      movement_goal_calories: profile.movement_goal_calories,
      movement_goal_minutes: profile.movement_goal_minutes,
      preferred_weight_unit: profile.preferred_weight_unit,
      protein_goal_grams: profile.protein_goal_grams,
      sleep_goal_minutes: profile.sleep_goal_minutes,
      target_weight_kg: profile.target_weight_kg,
      workout_title_options: profile.workout_title_options,
    });
    setTargetWeightDraft(
      profile.target_weight_kg === null
        ? ""
        : formatEditableWeight(profile.target_weight_kg, profile.preferred_weight_unit),
    );
  }, [profile]);

  useEffect(() => () => {
    importAbortRef.current?.abort();
  }, []);

  useEffect(() => () => {
    if (journalHistoryLongPressTimerRef.current !== null) {
      window.clearTimeout(journalHistoryLongPressTimerRef.current);
    }
  }, []);

  const selectedJournalEntry = useMemo(
    () => selectedJournalEntryId ? checkIns.find((entry) => entry.id === selectedJournalEntryId) ?? null : null,
    [checkIns, selectedJournalEntryId],
  );

  useEffect(() => {
    if (selectedJournalEntry) {
      setJournalDate(selectedJournalEntry.entry_date);
      setJournalEntryTime(normalizeHealthJournalEntryTime(selectedJournalEntry.entry_time, selectedJournalEntry.created_at));
      setJournalReflection(selectedJournalEntry.reflection);
      setJournalMood(selectedJournalEntry.mood_score);
      setJournalEnergy(selectedJournalEntry.energy_score);
      setJournalStress(selectedJournalEntry.stress_score);
      setJournalClarity(selectedJournalEntry.clarity_score);
    }
    setJournalFormError(null);
    setJournalOccurrenceEditorOpen(false);
    setJournalOccurrenceEditKey(null);
    setJournalOccurrenceEditId(null);
    setExpandedJournalScaleKey(null);
    setJournalTagQuery(null);
    setJournalTagOverlay(null);
    setJournalHistoryTagOverlay(null);
    setIsJournalLoggedMetadataOpen(false);
    journalTagCaretRef.current = null;
  }, [selectedJournalEntry, selectedJournalEntryId]);

  useEffect(() => {
    const preserveCurrentDraft = journalDraftEntryIdRef.current === selectedJournalEntryId;
    setJournalDraftValues((current) => {
      const next = buildHealthJournalDraftValues({
        journalEntryId: selectedJournalEntry?.id ?? null,
        signals: journalSignalsRef.current,
        values: journalSignalValues,
        symptoms,
      });
      if (!preserveCurrentDraft) return next;
      const nextIds = new Set(next.map((value) => value.signal_id));
      const preserved = current.filter((value) => !nextIds.has(value.signal_id) && journalSignalsRef.current.some((signal) => signal.id === value.signal_id));
      return [...next, ...preserved];
    });
    journalDraftEntryIdRef.current = selectedJournalEntryId;
    const nextOccurrences = selectedJournalEntry ? [
      ...symptomEntries
        .filter((entry) => entry.journal_entry_id === selectedJournalEntry.id)
        .map((entry) => {
          const loggedAt = new Date(entry.logged_at);
          const signal = journalSignalsRef.current.find((candidate) => candidate.kind === "symptom" && candidate.symptom_id === entry.symptom_id);
          return {
            id: entry.id,
            draftKey: entry.id,
            note: entry.note ?? "",
            score: entry.severity,
            signalId: signal?.id ?? `canonical-symptom:${entry.symptom_id}`,
            time: Number.isFinite(loggedAt.getTime())
              ? `${String(loggedAt.getHours()).padStart(2, "0")}:${String(loggedAt.getMinutes()).padStart(2, "0")}`
              : "",
            occurredAt: entry.logged_at,
          };
        }),
      ...journalSignalOccurrences
        .filter((occurrence) => occurrence.journal_entry_id === selectedJournalEntry.id)
        .map((occurrence) => {
          const occurredAt = new Date(occurrence.occurred_at);
          return {
            id: occurrence.id,
            draftKey: occurrence.id,
            note: occurrence.note ?? "",
            score: occurrence.score,
            signalId: occurrence.signal_id,
            time: Number.isFinite(occurredAt.getTime())
              ? `${String(occurredAt.getHours()).padStart(2, "0")}:${String(occurredAt.getMinutes()).padStart(2, "0")}`
              : "",
            occurredAt: occurrence.occurred_at,
          };
        }),
    ].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)).map((occurrence) => {
      const { occurredAt, ...withoutTimestamp } = occurrence;
      void occurredAt;
      return withoutTimestamp;
    })
      : [];
    if (journalOccurrenceSaveStatusRef.current === "succeeded") {
      journalOccurrenceSaveStatusRef.current = "idle";
      setJournalOccurrences(nextOccurrences);
    } else {
      setJournalOccurrences((current) => preserveCurrentDraft
        ? [...nextOccurrences, ...current.filter((occurrence) => !occurrence.id)]
        : nextOccurrences);
    }
  }, [journalOccurrenceHydrationVersion, journalSignalOccurrences, journalSignalValues, journalSignals, selectedJournalEntry, selectedJournalEntryId, symptomEntries, symptoms]);

  const activeSymptoms = useMemo(
    () => symptoms.filter((symptom) => symptom.archived_at === null),
    [symptoms],
  );
  const activeJournalSignals = useMemo(
    () => journalSignals.filter((signal) => signal.archived_at === null && signal.kind !== "symptom"),
    [journalSignals],
  );
  const getJournalSignalForSymptom = useCallback((symptomId: string) => journalSignals.find(
    (signal) => signal.kind === "symptom" && signal.symptom_id === symptomId && signal.archived_at === null,
  ) ?? null, [journalSignals]);
  const journalTagSymptom = useMemo(
    () => journalTagOverlay?.mode === "feeling_occurrence" && journalTagOverlay.signal.kind === "symptom"
      ? symptoms.find((symptom) => symptom.id === journalTagOverlay.signal.symptom_id) ?? null
      : null,
    [journalTagOverlay, symptoms],
  );
  const journalTagSignal = useMemo(
    () => journalTagOverlay?.mode === "feeling_occurrence"
      ? journalSignals.find((signal) => signal.id === journalTagOverlay.signal.id) ?? journalTagOverlay.signal
      : null,
    [journalSignals, journalTagOverlay],
  );
  const journalFeelingChoices = useMemo<JournalTagOption[]>(() => [
    ...activeSymptoms.map((symptom) => ({
      kind: "symptom" as const,
      name: symptom.name,
      signal: getJournalSignalForSymptom(symptom.id),
      symptomId: symptom.id,
    })),
    ...activeJournalSignals.map((signal) => ({
      kind: signal.kind,
      name: getHealthJournalSignalDisplayName(signal, symptoms),
      signal,
    })),
  ], [activeJournalSignals, activeSymptoms, getJournalSignalForSymptom, symptoms]);
  const visibleJournalTagOptions = useMemo(() => {
    const query = journalTagQuery?.query.trim().toLowerCase() ?? "";
    return journalFeelingChoices
      .filter((option) => !query || option.name.toLowerCase().includes(query))
      .sort((left, right) => {
        if (!query) return 0;
        return Number(!left.name.toLowerCase().startsWith(query)) - Number(!right.name.toLowerCase().startsWith(query))
          || left.name.localeCompare(right.name);
      });
  }, [journalFeelingChoices, journalTagQuery?.query]);
  const visibleJournalTagGroups = useMemo(
    () => (["symptom", "emotion", "other"] as const)
      .map((kind) => ({
        kind,
        options: visibleJournalTagOptions.filter((option) => option.kind === kind),
      }))
      .filter((group) => group.options.length > 0),
    [visibleJournalTagOptions],
  );
  const journalHistoryTagOptions = useMemo<JournalTagOption[]>(() => [
    ...symptoms.map((symptom) => ({
      kind: "symptom" as const,
      name: symptom.name,
      signal: journalSignals.find((signal) => signal.kind === "symptom" && signal.symptom_id === symptom.id && signal.archived_at === null)
        ?? journalSignals.find((signal) => signal.kind === "symptom" && signal.symptom_id === symptom.id)
        ?? null,
      symptomId: symptom.id,
    })),
    ...journalSignals
      .filter((signal) => signal.kind === "emotion" || signal.kind === "other")
      .map((signal) => ({
        kind: signal.kind,
        name: getHealthJournalSignalDisplayName(signal, symptoms),
        signal,
      })),
  ], [journalSignals, symptoms]);
  const journalHistoryTagOptionsByKey = useMemo(
    () => new Map(journalHistoryTagOptions.map((option) => [getJournalTagOptionKey(option), option] as const)),
    [journalHistoryTagOptions],
  );
  const journalHistoryGroups = useMemo(
    () => groupHealthJournalEntriesByDate(checkIns),
    [checkIns],
  );
  const journalOccurrenceChoices = useMemo(() => {
    const choices = journalFeelingChoices.map((choice) => {
      if (choice.signal || choice.kind !== "symptom" || !choice.symptomId) return choice;
      const symptom = symptoms.find((candidate) => candidate.id === choice.symptomId);
      return symptom ? { ...choice, signal: buildHealthJournalSymptomOccurrenceSignal(symptom) } : choice;
    });
    const knownSignalIds = new Set(choices.flatMap((choice) => choice.signal ? [choice.signal.id] : []));
    symptoms
      .filter((symptom) => journalOccurrences.some((occurrence) => occurrence.signalId === `canonical-symptom:${symptom.id}`) && !knownSignalIds.has(`canonical-symptom:${symptom.id}`))
      .forEach((symptom) => {
        choices.push({
          kind: "symptom",
          name: symptom.name,
          signal: buildHealthJournalSymptomOccurrenceSignal(symptom),
          symptomId: symptom.id,
        });
      });
    journalSignals
      .filter((signal) => journalOccurrences.some((occurrence) => occurrence.signalId === signal.id) && !knownSignalIds.has(signal.id))
      .forEach((signal) => {
        choices.push({
          kind: signal.kind,
          name: getHealthJournalSignalDisplayName(signal, symptoms),
          signal,
          ...(signal.kind === "symptom" && signal.symptom_id ? { symptomId: signal.symptom_id } : {}),
        });
      });
    return choices;
  }, [journalFeelingChoices, journalOccurrences, journalSignals, symptoms]);
  const journalOccurrenceSignal = useMemo(
    () => journalOccurrenceChoices.find((choice) => choice.signal?.id === journalOccurrenceSignalId)?.signal
      ?? journalSignals.find((signal) => signal.id === journalOccurrenceSignalId)
      ?? null,
    [journalOccurrenceChoices, journalOccurrenceSignalId, journalSignals],
  );
  const feelingTrendModel = useMemo(
    () => buildHealthFeelingTrendModel({ journalSignalOccurrences, journalSignals, symptomEntries, symptoms }),
    [journalSignalOccurrences, journalSignals, symptomEntries, symptoms],
  );
  const feelingTrendDefinitionKeys = useMemo(
    () => feelingTrendModel.definitions.map((definition) => definition.key),
    [feelingTrendModel.definitions],
  );
  useEffect(() => {
    const availableKeys = new Set(feelingTrendDefinitionKeys);
    const previousKeys = previousFeelingTrendDefinitionKeysRef.current;
    setSelectedFeelingTrendDefinitionKeys((current) => {
      if (!hasInitializedFeelingTrendSelectionRef.current && availableKeys.size > 0) {
        hasInitializedFeelingTrendSelectionRef.current = true;
        return new Set(availableKeys);
      }
      const wasShowingAllPreviousDefinitions = previousKeys.length > 0 && previousKeys.every((key) => current.has(key));
      if (wasShowingAllPreviousDefinitions) {
        return new Set(availableKeys);
      }
      const validKeys = new Set([...current].filter((key) => availableKeys.has(key)));
      return validKeys.size === current.size ? current : validKeys;
    });
    previousFeelingTrendDefinitionKeysRef.current = feelingTrendDefinitionKeys;
  }, [feelingTrendDefinitionKeys]);
  const selectedFeelingTrendDefinitions = useMemo(
    () => feelingTrendModel.definitions.filter((definition) => selectedFeelingTrendDefinitionKeys.has(definition.key)),
    [feelingTrendModel.definitions, selectedFeelingTrendDefinitionKeys],
  );
  const feelingTrendSelectionSummary = useMemo(
    () => getHealthFeelingTrendSelectionSummary(feelingTrendModel.definitions, selectedFeelingTrendDefinitionKeys),
    [feelingTrendModel.definitions, selectedFeelingTrendDefinitionKeys],
  );
  const isAllFeelingsTrendSelected = feelingTrendModel.definitions.length > 0
    && selectedFeelingTrendDefinitions.length === feelingTrendModel.definitions.length;
  const selectedFeelingTrendPointsByDefinition = useMemo(
    () => selectedFeelingTrendDefinitions.map((definition) => ({
      definition,
      points: getHealthFeelingTrendPoints({ asOfDate: today, feelingKey: definition.key, model: feelingTrendModel, range: feelingTrendRange }),
    })),
    [feelingTrendModel, feelingTrendRange, selectedFeelingTrendDefinitions, today],
  );
  const selectedFeelingTrendHistoryExists = useMemo(
    () => selectedFeelingTrendDefinitions.some((definition) => feelingTrendModel.points.some((point) => point.feelingKey === definition.key)),
    [feelingTrendModel.points, selectedFeelingTrendDefinitions],
  );
  const feelingTrendChartSeries = useMemo<NumericLineChartSeries[]>(() => {
    return selectedFeelingTrendPointsByDefinition
      .filter(({ points }) => points.length > 0)
      .map(({ definition, points }) => buildHealthFeelingTrendSeries(definition, points));
  }, [selectedFeelingTrendPointsByDefinition]);
  const feelingTrendChartTitle = isAllFeelingsTrendSelected
    ? "All Feelings"
    : selectedFeelingTrendDefinitions.length === 1
      ? `${selectedFeelingTrendDefinitions[0]?.name ?? "Feeling"} Occurrences`
      : "Selected Feeling Occurrences";
  const feelingTrendEmptyText = selectedFeelingTrendDefinitions.length === 1
    ? selectedFeelingTrendHistoryExists
      ? `No ${selectedFeelingTrendDefinitions[0]?.name ?? "Feeling"} Occurrences in the selected range.`
      : `No occurrences logged for ${selectedFeelingTrendDefinitions[0]?.name ?? "Feeling"} yet.`
    : selectedFeelingTrendHistoryExists
      ? "No selected Feeling Occurrences in the selected range."
      : "No occurrences logged for the selected Feelings yet.";

  const selectedMeals = useMemo(
    () => mealEntries.filter((entry) => entry.entry_date === foodHistoryDate),
    [foodHistoryDate, mealEntries],
  );
  const selectedNutrition = useMemo(
    () => sumMealNutritionForDate(mealEntries, foodHistoryDate),
    [foodHistoryDate, mealEntries],
  );
  const selectedActiveEnergyKcal = useMemo(
    () => sumMetricValueForDate(metricEntries, foodHistoryDate, ["active_energy_kcal"]),
    [foodHistoryDate, metricEntries],
  );
  const selectedCalorieBudget = useMemo(
    () => calculateHealthDailyCalorieBudget(
      profile?.calorie_goal,
      selectedActiveEnergyKcal,
    ),
    [profile?.calorie_goal, selectedActiveEnergyKcal],
  );
  const selectedCalorieTargetDetail = selectedCalorieBudget === null
    ? "set in goals"
    : `target ${formatHealthCalorieTarget(selectedCalorieBudget)} kcal${selectedActiveEnergyKcal > 0 ? ` (+${formatHealthCalorieTarget(selectedActiveEnergyKcal)} active kcal)` : ""}`;
  const selectedMealPlans = useMemo(
    () => getActiveHealthMealPlans(mealPlanEntries, foodHistoryDate),
    [foodHistoryDate, mealPlanEntries],
  );
  const selectedPlannedNutrition = useMemo(
    () => sumHealthMealPlanNutritionForDate(mealPlanEntries, foodHistoryDate),
    [foodHistoryDate, mealPlanEntries],
  );
  const foodLogHistoryIndex = useMemo(
    () => buildHealthFoodLogHistoryIndex(mealEntries),
    [mealEntries],
  );
  const dailyCalorieSeries = useMemo(
    () => buildHealthDailyCalorieSeries({ endDate: foodHistoryDate, mealEntries }),
    [foodHistoryDate, mealEntries],
  );
  const dailyCalorieTargetSeries = useMemo(
    () => buildHealthDailyCalorieTargetSeries({
      baseCalorieGoal: profile?.calorie_goal,
      metricEntries,
      points: dailyCalorieSeries,
    }),
    [dailyCalorieSeries, metricEntries, profile?.calorie_goal],
  );
  const todayMovement = useMemo(
    () => sumMetricValueForDate(metricEntries, today, ["steps", "active_energy_kcal", "exercise_minutes"]),
    [metricEntries, today],
  );
  const todaySleepTotal = useMemo(
    () => getHealthSleepDayTotal({ date: today, focusCategories, focusHistory, metricEntries }),
    [focusCategories, focusHistory, metricEntries, today],
  );
  const todaySleep = todaySleepTotal.totalMinutes;
  const sleepFocusSessions = useMemo(
    () => getSleepFocusSessions(focusHistory, focusCategories),
    [focusCategories, focusHistory],
  );
  const selectedSleepTotal = useMemo(
    () => getHealthSleepDayTotal({ date: sleepLedgerDate, focusCategories, focusHistory, metricEntries }),
    [focusCategories, focusHistory, metricEntries, sleepLedgerDate],
  );
  const selectedSleepFocusSessions = useMemo(
    () => sortHealthSleepSessionsByStart(sleepFocusSessions.filter((session) => session.date === sleepLedgerDate)),
    [sleepFocusSessions, sleepLedgerDate],
  );
  const sleepActivitySeries = useMemo(
    () => buildHealthDailySleepSeries({ endDate: sleepLedgerDate, focusCategories, focusHistory, metricEntries }),
    [focusCategories, focusHistory, metricEntries, sleepLedgerDate],
  );
  const sleepClockSeconds = sleepActiveSession ? getHealthSleepElapsedSeconds(sleepActiveSession, sleepClockNow) : 0;
  const latestWeight = useMemo(() => getLatestWeight(weightEntries), [weightEntries]);
  const weightTrend30 = useMemo(() => getWeightTrend(weightEntries, 30), [weightEntries]);
  const weightForecast = useMemo(
    () => buildWeightGoalForecast(weightEntries, profile?.target_weight_kg ?? null, today),
    [profile?.target_weight_kg, today, weightEntries],
  );
  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    return mealEntries
      .filter((entry) => {
        const key = `${entry.food_name.toLowerCase()}|${entry.brand_name ?? ""}|${entry.calories}|${entry.serving_label ?? ""}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }, [mealEntries]);
  const favoriteFoods = useMemo(
    () => [...favorites]
      .filter((item) => item.is_favorite)
      .sort((left, right) => {
        const countDifference = (foodLogHistoryIndex.get(getHealthFoodIdentityKey(right) ?? "")?.count ?? 0) - (foodLogHistoryIndex.get(getHealthFoodIdentityKey(left) ?? "")?.count ?? 0);
        return countDifference || right.updated_at.localeCompare(left.updated_at);
      }),
    [favorites, foodLogHistoryIndex],
  );
  const favoriteFoodKeys = useMemo(() => {
    const keys = new Set<string>();
    favoriteFoods.forEach((item) => {
      const key = getHealthFoodIdentityKey(item);
      if (key) {
        keys.add(key);
      }
    });
    return keys;
  }, [favoriteFoods]);
  const orderedCustomFoods = useMemo(
    () => sortHealthFoodsForMealPicker(favorites, mealEntries),
    [favorites, mealEntries],
  );
  const mealFoodSuggestions = useMemo(
    () => buildHealthMealPickerSuggestions({ foods: orderedCustomFoods, recipes, savedMeals }),
    [orderedCustomFoods, recipes, savedMeals],
  );
  const matchingCustomFoods = useMemo(() => {
    const query = customFoodSearchQuery.trim().toLowerCase();
    const category = selectedCustomFoodCategory;
    return orderedCustomFoods.filter((item) => {
      if (category && (item.food_category || "Uncategorized") !== category) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
      formatHealthFoodDisplayName(item),
      item.brand_name,
      item.category,
      item.food_category,
      item.food_name,
      item.serving_size,
      item.serving_label,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [customFoodSearchQuery, orderedCustomFoods, selectedCustomFoodCategory]);
  const customFoodCategories = useMemo(
    () => [...new Set(favorites.map((item) => item.food_category || "Uncategorized"))].sort((left, right) => left.localeCompare(right)),
    [favorites],
  );
  const recentWeekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const offset = 6 - index;
      const date = new Date(`${today}T12:00:00`);
      date.setDate(date.getDate() - offset);
      return date.toISOString().slice(0, 10);
    }),
    [today],
  );
  const recentSleepTotals = useMemo(
    () => recentWeekDates.map((date) => getHealthSleepDayTotal({ date, focusCategories, focusHistory, metricEntries })),
    [focusCategories, focusHistory, metricEntries, recentWeekDates],
  );
  const recentSleepTotalMinutes = recentSleepTotals.reduce((total, entry) => total + entry.totalMinutes, 0);
  const recentSleepFocusMinutes = recentSleepTotals.reduce((total, entry) => total + entry.focusMinutes, 0);
  const recentSleepImportedMinutes = recentSleepTotals.reduce((total, entry) => total + entry.importedMinutes, 0);
  const existingImportFingerprints = useMemo(
    () => new Set(metricEntries.map((entry) => entry.source_fingerprint)),
    [metricEntries],
  );
  const importDuplicateCount = useMemo(
    () => importPreview ? importPreview.metricEntries.filter((entry) => existingImportFingerprints.has(entry.source_fingerprint)).length : 0,
    [existingImportFingerprints, importPreview],
  );
  const importNewMetricCount = importPreview ? Math.max(0, importPreview.metricEntries.length - importDuplicateCount) : 0;
  const mealCalculation = useMemo(
    () => calculateMealDraft(mealDraft),
    [mealDraft],
  );
  const mealDate = mealEditorMode === "plan" ? mealDraft.date : foodHistoryDate;
  const mealLoggedAt = buildHealthMealLoggedAt(mealDate, mealDraft.time);
  const mealTimestampError = mealLoggedAt === null
    ? "Choose a valid meal date and time."
    : mealEditorMode === "actual" && isHealthMealTimestampFuture(foodHistoryDate, mealDraft.time)
      ? "Future meal times cannot be saved."
      : null;
  const canSaveMeal = activeMealEntrySlot !== null && mealDraft.foodName.trim().length > 0 && mealCalculation !== null && mealTimestampError === null;
  const weightValue = Number.parseFloat(weightDraft);
  const canSaveWeight = Number.isFinite(weightValue) && weightValue > 0;

  function resolveSleepDraft(draft: SleepDraft) {
    const durationSeconds = parseHealthSleepDuration(draft.hours, draft.minutes);
    const timestamps = durationSeconds === null
      ? null
      : buildHealthSleepTimestamps({ date: draft.date, time: draft.time, durationSeconds });
    if (durationSeconds === null || !timestamps) {
      setSleepFormError("Enter a valid local date and time with a duration greater than zero.");
      return null;
    }
    setSleepFormError(null);
    return { ...timestamps, durationSeconds, kind: draft.kind, date: draft.date };
  }

  async function handleSaveManualSleep() {
    const payload = resolveSleepDraft(manualSleepDraft);
    if (!payload) return;
    const saved = await onLogManualSleep(payload);
    if (saved) {
      const nextInputs = getCurrentHealthDateTimeInputs();
      setManualSleepDraft({ date: nextInputs.date, hours: "8", kind: sleepKind, minutes: "0", time: nextInputs.time });
    }
  }

  function openSleepEdit(session: HistoricalFocusSession) {
    const startTimestamp = getHealthSleepStartTimestamp(session);
    const startDate = startTimestamp ? new Date(startTimestamp) : null;
    setEditingSleepId(session.id);
    setSleepEditDraft({
      date: session.date,
      hours: String(Math.floor(session.durationSeconds / 3600)),
      kind: resolveHealthSleepKind(session, session.categoryId ? focusCategories.find((category) => category.id === session.categoryId) : null),
      minutes: String(Math.floor((session.durationSeconds % 3600) / 60)),
      time: startDate && Number.isFinite(startDate.getTime())
        ? `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`
        : "",
    });
    setSleepFormError(null);
  }

  async function handleSaveSleepEdit() {
    if (!editingSleepId || !sleepEditDraft) return;
    const payload = resolveSleepDraft(sleepEditDraft);
    if (!payload) return;
    await onUpdateSleepSession(editingSleepId, payload);
    setEditingSleepId(null);
    setSleepEditDraft(null);
  }

  if (!profile) {
    return (
      <section className="-mx-[15px] px-3 pb-32 sm:mx-0 sm:px-4">
        <PageShellHeader subtitle="Health, Diet, Fitness" title="Health" />
        <div className="rounded-[2rem] border border-[#ece8f8] bg-white/90 p-6 text-sm text-[#6e7892] shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/65">
          {isLoading ? "Loading Health..." : "Health becomes available after sign-in."}
        </div>
      </section>
    );
  }

  const activeProfile = profile;
  const effectiveSleepGoalMinutes = parseNullableInteger(profileDraft.sleep_goal_minutes ?? activeProfile.sleep_goal_minutes);
  const sleepGoalHours = effectiveSleepGoalMinutes === null ? "" : String(Math.floor(effectiveSleepGoalMinutes / 60));
  const sleepGoalRemainingMinutes = effectiveSleepGoalMinutes === null ? "" : String(effectiveSleepGoalMinutes % 60);
  const selectedSleepPercent = clampPercent(activeProfile.sleep_goal_minutes ? (selectedSleepTotal.totalMinutes / activeProfile.sleep_goal_minutes) * 100 : 0);

  function handleWeightUnitChange(nextUnit: HealthProfile["preferred_weight_unit"]) {
    const currentUnit = profileDraft.preferred_weight_unit ?? activeProfile.preferred_weight_unit;
    const parsedTargetWeight = parseNullableNumber(targetWeightDraft);
    setProfileDraft((current) => ({ ...current, preferred_weight_unit: nextUnit }));
    if (parsedTargetWeight !== null && currentUnit !== nextUnit) {
      const weightKg = displayWeightToKilograms(parsedTargetWeight, currentUnit);
      setTargetWeightDraft(String(Number(kilogramsToDisplayValue(weightKg, nextUnit).toFixed(1))));
    }
  }

  function handleSleepGoalHoursChange(nextHoursValue: string) {
    const parsedHours = parseNullableInteger(nextHoursValue);
    const currentMinutes = parseNullableInteger(profileDraft.sleep_goal_minutes ?? activeProfile.sleep_goal_minutes) ?? 0;
    const nextMinutes = parsedHours === null ? currentMinutes % 60 : Math.max(0, parsedHours) * 60 + (currentMinutes % 60);
    setProfileDraft((current) => ({ ...current, sleep_goal_minutes: nextHoursValue.trim().length === 0 && currentMinutes % 60 === 0 ? null : nextMinutes }));
  }

  function handleSleepGoalMinutesChange(nextMinutesValue: string) {
    const parsedMinutes = parseNullableInteger(nextMinutesValue);
    const currentHours = Math.floor((parseNullableInteger(profileDraft.sleep_goal_minutes ?? activeProfile.sleep_goal_minutes) ?? 0) / 60);
    const normalizedMinutes = parsedMinutes === null ? 0 : Math.min(Math.max(parsedMinutes, 0), 59);
    const nextTotalMinutes = currentHours * 60 + normalizedMinutes;
    setProfileDraft((current) => ({ ...current, sleep_goal_minutes: nextMinutesValue.trim().length === 0 && currentHours === 0 ? null : nextTotalMinutes }));
  }

  async function handleSaveProfile() {
    const parsedTargetWeight = parseNullableNumber(targetWeightDraft);
    await saveProfile({
      ...profileDraft,
      calorie_goal: parseNullableInteger(profileDraft.calorie_goal),
      carbs_goal_grams: parseNullableInteger(profileDraft.carbs_goal_grams),
      fat_goal_grams: parseNullableInteger(profileDraft.fat_goal_grams),
      movement_goal_calories: parseNullableInteger(profileDraft.movement_goal_calories),
      movement_goal_minutes: parseNullableInteger(profileDraft.movement_goal_minutes),
      protein_goal_grams: parseNullableInteger(profileDraft.protein_goal_grams),
      sleep_goal_minutes: parseNullableInteger(profileDraft.sleep_goal_minutes),
      target_weight_kg: parsedTargetWeight === null
        ? null
        : displayWeightToKilograms(parsedTargetWeight, profileDraft.preferred_weight_unit ?? activeProfile.preferred_weight_unit),
    });
  }

  async function handleSaveJournal() {
    const symptomOccurrenceInputs: Omit<HealthSymptomEntryInsert, "user_id" | "journal_entry_id">[] = [];
    const journalSignalOccurrenceInputs: Omit<HealthJournalSignalOccurrenceInsert, "user_id" | "journal_entry_id">[] = [];
    for (const occurrence of journalOccurrences) {
      const signal = journalOccurrenceChoices.find((choice) => choice.signal?.id === occurrence.signalId)?.signal
        ?? journalSignals.find((candidate) => candidate.id === occurrence.signalId);
      const occurredAt = buildHealthMealLoggedAt(journalDate, occurrence.time);
      if (!signal || !occurredAt || !Number.isInteger(occurrence.score) || occurrence.score < 1 || occurrence.score > 10) {
        setJournalFormError("Each Feeling occurrence needs a valid time and a score from 1 to 10.");
        return;
      }
      if (signal.kind === "symptom" && signal.symptom_id) {
        symptomOccurrenceInputs.push({
          entry_date: journalDate,
          logged_at: occurredAt,
          note: occurrence.note,
          severity: occurrence.score,
          symptom_id: signal.symptom_id,
          ...(occurrence.id ? { id: occurrence.id } : {}),
        });
      } else if (signal.kind === "emotion" || signal.kind === "other") {
        journalSignalOccurrenceInputs.push({
          entry_date: journalDate,
          note: occurrence.note,
          occurred_at: occurredAt,
          score: occurrence.score,
          signal_id: signal.id,
          ...(occurrence.id ? { id: occurrence.id } : {}),
        });
      }
    }
    const saved = await saveJournalEntry({
      checkIn: {
        ...(selectedJournalEntryId ? { id: selectedJournalEntryId } : {}),
        clarity_score: journalClarity,
        energy_score: journalEnergy,
        entry_date: journalDate,
        entry_time: journalEntryTime,
        mood_score: journalMood,
        reflection: journalReflection.trim(),
        stress_score: journalStress,
      },
      journalSignalOccurrences: journalSignalOccurrenceInputs,
      signalValues: journalDraftValues,
      symptomOccurrences: symptomOccurrenceInputs,
    });
    if (saved) {
      journalOccurrenceSaveStatusRef.current = "succeeded";
      setJournalOccurrenceHydrationVersion((current) => current + 1);
      startNewJournalEntry();
      setJournalFormError(null);
    } else {
      journalOccurrenceSaveStatusRef.current = "idle";
    }
  }

  function openJournalSignalCreateForm(kind: JournalSignalCreateKind) {
    setJournalLibraryCreateKind((current) => current === kind ? null : kind);
    setJournalSignalCreateName("");
    setJournalSignalCreateInTemplate(true);
  }

  function closeJournalSignalCreateForm() {
    setJournalLibraryCreateKind(null);
    setJournalSignalCreateName("");
    setJournalSignalCreateInTemplate(true);
  }

  async function handleCreateJournalSignal() {
    const kind = journalLibraryCreateKind;
    if (!kind) return;
    const scaleLabels = getDefaultHealthJournalScaleLabels(kind);
    const created = await createJournalSignal({
      high_label: scaleLabels.at(-1),
      in_template: journalSignalCreateInTemplate,
      kind,
      low_label: scaleLabels[0],
      name: journalSignalCreateName,
      scale_labels: scaleLabels,
      symptom_id: null,
    });
    if (created) {
      closeJournalSignalCreateForm();
      setJournalFormError(null);
    }
  }

  function startJournalSignalEdit(signal: HealthJournalSignal) {
    setJournalLibraryEditId(signal.id);
    setJournalLibraryEditDraft({
      scaleLabels: [...signal.scale_labels],
      name: signal.name ?? "",
    });
  }

  async function startJournalSymptomEdit(symptom: HealthSymptom) {
    const signal = getJournalSignalForSymptom(symptom.id) ?? await createJournalSignal({
      high_label: getDefaultHealthJournalScaleLabels("symptom")[10],
      in_template: false,
      kind: "symptom",
      color: null,
      low_label: getDefaultHealthJournalScaleLabels("symptom")[0],
      name: null,
      scale_labels: getDefaultHealthJournalScaleLabels("symptom"),
      symptom_id: symptom.id,
    });
    if (signal) startJournalSignalEdit(signal);
  }

  async function saveJournalSignalEdit(signal: HealthJournalSignal) {
    const saved = await updateJournalSignal(signal.id, {
      high_label: journalLibraryEditDraft.scaleLabels[10],
      low_label: journalLibraryEditDraft.scaleLabels[0],
      name: signal.kind === "symptom" ? null : journalLibraryEditDraft.name,
      scale_labels: journalLibraryEditDraft.scaleLabels,
    });
    if (saved) setJournalLibraryEditId(null);
  }

  function moveJournalSignal(signalId: string, direction: -1 | 1) {
    const templateSignals = getHealthJournalTemplateSignals(journalSignals, symptoms);
    const currentIndex = templateSignals.findIndex((signal) => signal.id === signalId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= templateSignals.length) return;
    const nextIds = templateSignals.map((signal) => signal.id);
    [nextIds[currentIndex], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[currentIndex]];
    void reorderJournalSignals(nextIds);
  }

  async function addJournalFeelingToToday(choice: JournalTagOption) {
    const signal = choice.kind === "symptom" && choice.symptomId
      ? choice.signal ?? await createJournalSignal({
        high_label: getDefaultHealthJournalScaleLabels("symptom")[10],
        in_template: false,
        kind: "symptom",
        color: null,
        low_label: getDefaultHealthJournalScaleLabels("symptom")[0],
        name: null,
        scale_labels: getDefaultHealthJournalScaleLabels("symptom"),
        symptom_id: choice.symptomId,
      })
      : choice.signal;
    if (!signal || journalDraftValues.some((value) => value.signal_id === signal.id)) {
      setIsJournalAddOpen(false);
      return;
    }
    setJournalDraftValues((current) => ensureHealthJournalDraftValue(current, signal.id));
    setIsJournalAddOpen(false);
  }

  function readJournalTagQuery(value: string, cursor: number): JournalTagQuery | null {
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(^|\s)#([^\s#]*)$/);
    if (!match) return null;
    const queryStart = cursor - match[0].length + (match[1] ? 1 : 0);
    return { end: cursor, query: match[2] ?? "", start: queryStart };
  }

  function syncJournalTagQuery(target: HTMLTextAreaElement, resetHighlight = true) {
    const nextQuery = readJournalTagQuery(target.value, target.selectionStart ?? target.value.length);
    setJournalTagQuery(nextQuery);
    if (resetHighlight) setJournalTagHighlightIndex(0);
  }

  async function selectJournalTag(option: JournalTagOption) {
    const selectedQuery = journalTagQuery;
    if (!selectedQuery) return;
    const signal = option.kind === "symptom" && option.symptomId
      ? option.signal ?? await createJournalSignal({
        high_label: getDefaultHealthJournalScaleLabels("symptom")[10],
        in_template: false,
        kind: "symptom",
        color: null,
        low_label: getDefaultHealthJournalScaleLabels("symptom")[0],
        name: null,
        scale_labels: getDefaultHealthJournalScaleLabels("symptom"),
        symptom_id: option.symptomId,
      })
      : option.signal;
    if (!signal) return;

    const replacement = `#${option.name} `;
    const nextCaret = selectedQuery.start + replacement.length;
    setJournalReflection((current) => replaceHealthJournalReflectionTag(current, selectedQuery.start, selectedQuery.end, replacement));
    journalTagCaretRef.current = nextCaret;
    setJournalTagQuery(null);
    setJournalTagHighlightIndex(0);
    setOpenSymptomColorPickerKey(null);
    setJournalTagOverlay({
      error: null,
      mode: "feeling_occurrence",
      score: null,
      signal,
      time: journalEntryTime || getCurrentHealthDateTimeInputs().time,
    });
  }

  function toggleJournalHistoryTag(entryId: string, tag: { key: string; start: number }) {
    setJournalHistoryTagOverlay((current) => current?.entryId === entryId
      && current.optionKey === tag.key
      && current.start === tag.start
      ? null
      : { entryId, optionKey: tag.key, start: tag.start });
  }

  function focusJournalReflectionAtCaret() {
    requestAnimationFrame(() => {
      const textarea = journalReflectionRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      if (journalTagCaretRef.current !== null) textarea.setSelectionRange(journalTagCaretRef.current, journalTagCaretRef.current);
    });
  }

  function closeJournalTagOverlay() {
    setJournalTagOverlay(null);
    focusJournalReflectionAtCaret();
  }

  function saveJournalTagOccurrence() {
    if (journalTagOverlay?.mode !== "feeling_occurrence") return;
    const normalizedTime = normalizeHealthMealTime(journalTagOverlay.time);
    if (journalTagOverlay.score === null || !Number.isInteger(journalTagOverlay.score) || journalTagOverlay.score < 1 || journalTagOverlay.score > 10 || !normalizedTime || !buildHealthMealLoggedAt(journalDate, normalizedTime)) {
      setJournalTagOverlay((current) => current?.mode === "feeling_occurrence"
        ? { ...current, error: "Choose a severity from 1 to 10 and a valid time." }
        : current);
      return;
    }
    const score = journalTagOverlay.score;
    setJournalOccurrences((current) => [...current, {
      draftKey: createJournalDraftId(),
      note: "",
      score,
      signalId: journalTagOverlay.signal.id,
      time: normalizedTime,
    }]);
    closeJournalTagOverlay();
  }

  function updateJournalTagOccurrence(update: Partial<Pick<Extract<Exclude<JournalTagOverlay, null>, { mode: "feeling_occurrence" }>, "score" | "time">>) {
    setJournalTagOverlay((current) => current?.mode === "feeling_occurrence" ? { ...current, ...update, error: null } : current);
  }

  function handleJournalReflectionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!journalTagQuery || visibleJournalTagOptions.length === 0) {
      if (event.key === "Escape") setJournalTagQuery(null);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setJournalTagHighlightIndex((current) => (current + 1) % visibleJournalTagOptions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setJournalTagHighlightIndex((current) => (current - 1 + visibleJournalTagOptions.length) % visibleJournalTagOptions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void selectJournalTag(visibleJournalTagOptions[journalTagHighlightIndex] ?? visibleJournalTagOptions[0]!);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setJournalTagQuery(null);
    }
  }

  async function toggleJournalSymptomTemplate(symptom: HealthSymptom, inTemplate: boolean) {
    const signal = getJournalSignalForSymptom(symptom.id) ?? await createJournalSignal({
      high_label: getDefaultHealthJournalScaleLabels("symptom")[10],
      in_template: false,
      kind: "symptom",
      color: null,
      low_label: getDefaultHealthJournalScaleLabels("symptom")[0],
      name: null,
      scale_labels: getDefaultHealthJournalScaleLabels("symptom"),
      symptom_id: symptom.id,
    });
    if (!signal) return;
    const saved = await setJournalSignalTemplate(signal.id, inTemplate);
    if (saved && inTemplate) {
      setJournalDraftValues((current) => current.some((value) => value.signal_id === signal.id)
        ? current
        : [...current, { score: null, signal_id: signal.id }]);
    }
  }

  async function toggleJournalFeelingTemplate(signal: HealthJournalSignal) {
    const saved = await setJournalSignalTemplate(signal.id, !signal.in_template);
    if (saved && !signal.in_template) {
      setJournalDraftValues((current) => current.some((value) => value.signal_id === signal.id)
        ? current
        : [...current, { score: null, signal_id: signal.id }]);
    }
  }

  async function archiveJournalFeeling(signalId: string) {
    const saved = await archiveJournalSignal(signalId);
    if (!saved || journalSignalValues.some((value) => value.journal_entry_id === selectedJournalEntry?.id && value.signal_id === signalId)) return saved;
    setJournalDraftValues((current) => current.filter((value) => value.signal_id !== signalId));
    return saved;
  }

  async function archiveJournalSymptom(symptomId: string) {
    const signal = getJournalSignalForSymptom(symptomId);
    const saved = await archiveSymptom(symptomId);
    if (!saved || !signal || journalSignalValues.some((value) => value.journal_entry_id === selectedJournalEntry?.id && value.signal_id === signal.id)) return saved;
    setJournalDraftValues((current) => current.filter((value) => value.signal_id !== signal.id));
    return saved;
  }

  function handleManageJournalLibrary() {
    setIsJournalLibraryOpen(true);
    window.setTimeout(() => {
      const library = journalLibraryRef.current;
      library?.scrollIntoView({ behavior: "smooth", block: "start" });
      library?.focus({ preventScroll: true });
    }, 0);
  }

  function resetJournalOccurrenceDraft() {
    setJournalOccurrenceEditorOpen(false);
    setJournalOccurrenceEditKey(null);
    setJournalOccurrenceEditId(null);
    setJournalOccurrenceSignalId("");
    setJournalOccurrenceScore(null);
    setJournalOccurrenceTime(journalEntryTime || getCurrentHealthDateTimeInputs().time);
    setJournalOccurrenceNote("");
  }

  function startJournalOccurrenceEdit(occurrence: JournalOccurrenceDraft) {
    setJournalOccurrenceEditorOpen(true);
    setJournalOccurrenceEditKey(occurrence.draftKey);
    setJournalOccurrenceEditId(occurrence.id ?? null);
    setJournalOccurrenceSignalId(occurrence.signalId);
    setJournalOccurrenceScore(occurrence.score);
    setJournalOccurrenceTime(occurrence.time);
    setJournalOccurrenceNote(occurrence.note);
  }

  function saveJournalOccurrenceDraft() {
    const normalizedTime = normalizeHealthMealTime(journalOccurrenceTime);
    if (!journalOccurrenceSignalId || journalOccurrenceScore === null || !normalizedTime || !buildHealthMealLoggedAt(journalDate, normalizedTime)) {
      setJournalFormError("Choose a Feeling, score from 1 to 10, and time for the occurrence.");
      return;
    }
    const nextOccurrence: JournalOccurrenceDraft = {
      draftKey: journalOccurrenceEditKey ?? createJournalDraftId(),
      note: journalOccurrenceNote,
      score: journalOccurrenceScore,
      signalId: journalOccurrenceSignalId,
      time: normalizedTime,
      ...(journalOccurrenceEditId ? { id: journalOccurrenceEditId } : {}),
    };
    setJournalOccurrences((current) => journalOccurrenceEditKey
      ? current.map((occurrence) => occurrence.draftKey === journalOccurrenceEditKey ? nextOccurrence : occurrence)
      : [...current, nextOccurrence]);
    resetJournalOccurrenceDraft();
    setJournalFormError(null);
  }

  function openJournalOccurrenceCreate() {
    resetJournalOccurrenceDraft();
    setJournalOccurrenceEditorOpen(true);
    setJournalOccurrenceTime(journalEntryTime || getCurrentHealthDateTimeInputs().time);
  }

  function clearJournalHistoryLongPressTimer() {
    if (journalHistoryLongPressTimerRef.current === null) return;
    window.clearTimeout(journalHistoryLongPressTimerRef.current);
    journalHistoryLongPressTimerRef.current = null;
  }

  function isJournalHistoryDesktopViewport() {
    return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
  }

  function openJournalHistoryMenu() {
    if (isJournalHistoryDesktopViewport()) setIsJournalHistoryMenuOpen(true);
  }

  function handleJournalHistoryPointerDown(event: PointerEvent<HTMLButtonElement>) {
    journalHistoryLongPressFiredRef.current = false;
    if (!isJournalHistoryDesktopViewport() || (event.pointerType === "mouse" && event.button !== 0)) return;
    clearJournalHistoryLongPressTimer();
    journalHistoryLongPressTimerRef.current = window.setTimeout(() => {
      journalHistoryLongPressTimerRef.current = null;
      journalHistoryLongPressFiredRef.current = true;
      openJournalHistoryMenu();
    }, 500);
  }

  function handleJournalHistoryPointerUp() {
    clearJournalHistoryLongPressTimer();
  }

  function handleJournalHistoryPointerCancel() {
    clearJournalHistoryLongPressTimer();
    journalHistoryLongPressFiredRef.current = false;
  }

  function handleJournalHistoryClick() {
    if (journalHistoryLongPressFiredRef.current) {
      journalHistoryLongPressFiredRef.current = false;
      return;
    }
    setIsJournalHistoryMenuOpen(false);
    setJournalWorkspaceMode((current) => current === "entry" ? "history" : "entry");
  }

  function handleJournalHistoryKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    openJournalHistoryMenu();
  }

  function selectJournalWorkspaceMode(mode: JournalWorkspaceMode) {
    setJournalWorkspaceMode(mode);
    setIsJournalHistoryMenuOpen(false);
  }

  function toggleJournalScale(key: string) {
    setExpandedJournalScaleKey((current) => current === key ? null : key);
  }

  function toggleJournalHistoryMetadata(entryId: string) {
    setExpandedJournalHistoryEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }

  function toggleJournalHistoryDate(date: string) {
    setCollapsedJournalHistoryDates((current) => {
      const next = new Set(current);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  function startNewJournalEntry() {
    if (journalWorkspaceMode === "history") {
      setJournalWorkspaceMode("entry");
    }
    setSelectedJournalEntryId(null);
    setJournalEntryTime(getCurrentHealthDateTimeInputs().time);
    setJournalReflection("");
    setJournalMood(null);
    setJournalEnergy(null);
    setJournalStress(null);
    setJournalClarity(null);
    setJournalDraftValues(buildHealthJournalDraftValues({ journalEntryId: null, signals: journalSignals, values: journalSignalValues, symptoms }));
    setJournalOccurrences([]);
    setIsJournalAddOpen(false);
    setJournalOccurrenceEditorOpen(false);
    setJournalOccurrenceEditKey(null);
    setJournalOccurrenceEditId(null);
    setExpandedJournalScaleKey(null);
    setIsJournalLoggedMetadataOpen(false);
    setIsJournalHistoryMenuOpen(false);
    setOpenSymptomColorPickerKey(null);
    setJournalTagQuery(null);
    setJournalTagOverlay(null);
    setJournalHistoryTagOverlay(null);
    journalTagCaretRef.current = null;
    setJournalFormError(null);
  }

  function selectJournalEntry(entry: HealthCheckIn) {
    if (journalWorkspaceMode === "history") {
      setJournalWorkspaceMode("entry");
    }
    setSelectedJournalEntryId(entry.id);
    setJournalDate(entry.entry_date);
  }

  function handleDeleteJournalEntry(entry: HealthCheckIn) {
    if (typeof window !== "undefined" && !window.confirm("Delete this Journal Entry? This will delete its scores, reflection, Feeling values, and Feeling Occurrences.")) {
      return;
    }
    void deleteJournalEntry(entry.id);
  }

  async function handleRenameSymptom(symptomId: string) {
    const saved = await renameSymptom(symptomId, normalizeHealthSymptomName(editingSymptomName));
    if (saved) {
      setEditingSymptomId(null);
      setEditingSymptomName("");
    }
  }

  function handleSetSymptomColor(symptomId: string, color: string) {
    setOpenSymptomColorPickerKey(null);
    void setSymptomColor(symptomId, color);
  }

  function handleSetJournalSignalColor(signalId: string, color: string) {
    setOpenSymptomColorPickerKey(null);
    void updateJournalSignal(signalId, { color });
  }

  function toggleSymptomColorPicker(pickerKey: string) {
    setOpenSymptomColorPickerKey((current) => current === pickerKey ? null : pickerKey);
  }

  function openSymptomCreateForm() {
    setOpenSymptomColorPickerKey(null);
    setSymptomCreateName("");
    setIsSymptomCreateOpen(true);
  }

  function closeSymptomCreateForm() {
    setSymptomCreateName("");
    setIsSymptomCreateOpen(false);
  }

  async function handleCreateSymptom() {
    if (isCreatingSymptom) {
      return;
    }
    setIsCreatingSymptom(true);
    try {
      const created = await createSymptom({ name: symptomCreateName });
      if (created) {
        closeSymptomCreateForm();
      }
    } finally {
      setIsCreatingSymptom(false);
    }
  }

  async function handleSaveMeal() {
    const calculation = mealCalculation;
    if (!activeMealEntrySlot) {
      return;
    }
    const selectedMealDate = mealEditorMode === "plan" ? mealDraft.date : foodHistoryDate;
    const loggedAt = buildHealthMealLoggedAt(selectedMealDate, mealDraft.time);
    if (!calculation || !loggedAt || (mealEditorMode === "actual" && isHealthMealTimestampFuture(foodHistoryDate, mealDraft.time))) {
      return;
    }

    let sourceFoodId = mealDraft.sourceFoodId;
    if (isQuickEntryOpen && saveQuickEntryToLibrary) {
      const libraryInput = {
        calories: Math.round(calculation.nutrientTotals.calories),
        carbs_g: calculation.nutrientTotals.carbs_g,
        food_name: mealDraft.foodName.trim(),
        fat_g: calculation.nutrientTotals.fat_g,
        food_category: "Uncategorized",
        id: createQuickFoodId(),
        protein_g: calculation.nutrientTotals.protein_g,
        provider: "manual",
        ...(calculation.nutrientTotals.nutrition_details
          ? { nutrition_details: calculation.nutrientTotals.nutrition_details }
          : {}),
        serving_label: "1 serving",
        serving_size: "1 serving",
        serving_quantity: 1,
        serving_unit: "serving",
        is_favorite: false,
      };
      const existingLibraryFood = favorites.find(
        (food) => getHealthFoodIdentityKey(food) === getHealthFoodIdentityKey(libraryInput),
      );
      const savedLibraryFood = await saveFavoriteFood(libraryInput);
      if (!savedLibraryFood) {
        return;
      }
      sourceFoodId = existingLibraryFood?.id ?? libraryInput.id;
    } else if (isQuickEntryOpen) {
      sourceFoodId = null;
    }

    const foodSnapshot = buildMealFoodSnapshot({ ...mealDraft, sourceFoodId });
    const saved = mealEditorMode === "plan"
      ? await (async () => {
        const payload = buildHealthMealPlanPayload({
          calculation,
          draft: { ...mealDraft, sourceFoodId },
          foodSnapshot,
          mealSlot: activeMealEntrySlot,
          plannedDate: selectedMealDate,
          plannedTime: mealDraft.time,
        });
        if (editingMealPlanId) {
          return updateMealPlanEntry(editingMealPlanId, buildHealthMealPlanUpdateFromPayload(payload));
        }
        return addMealPlanEntry(payload);
      })()
      : await addMealEntry({
        attribution: mealDraft.attribution,
        barcode: mealDraft.barcode,
        brand_name: emptyToNull(mealDraft.brandName),
        calories: Math.round(calculation.nutrientTotals.calories),
        carbs_g: calculation.nutrientTotals.carbs_g,
        entry_date: foodHistoryDate,
        fat_g: calculation.nutrientTotals.fat_g,
        food_name: mealDraft.foodName.trim(),
        meal_slot: activeMealEntrySlot,
        logged_at: loggedAt,
        protein_g: calculation.nutrientTotals.protein_g,
        provider: mealDraft.provider ?? "manual",
        provider_item_id: mealDraft.providerItemId,
        serving_label: formatConsumedMealLabel(calculation, mealDraft.servingLabel),
        source_food_id: sourceFoodId,
        consumed_quantity: calculation.consumed.quantity,
        consumed_unit: calculation.consumed.unit,
        serving_fraction: calculation.servingFraction,
        food_snapshot: foodSnapshot,
        nutrition_snapshot: calculation.nutrientTotals,
      });
    if (saved) {
      if (mealEditorMode === "plan" && editingMealPlanId) {
        setEditingMealPlanId(null);
        setMealEditorMode("actual");
        setActiveMealEntrySlot(null);
        setIsQuickEntryOpen(false);
        return;
      }
      setMealDraft((current) => {
        const nextDraft = {
          ...resetMealDraftForNextItem(current),
          date: selectedMealDate,
          mealSlot: activeMealEntrySlot,
        };
        return isQuickEntryOpen ? { ...nextDraft, servingQuantity: 1 } : nextDraft;
      });
      setCustomFoodSearchQuery("");
      setBarcodeLookupError("");
      setSaveQuickEntryToLibrary(false);
    }
  }

  async function submitMeal() {
    if (!canSaveMeal || mealSaveInFlightRef.current) {
      return;
    }
    mealSaveInFlightRef.current = true;
    try {
      await handleSaveMeal();
    } finally {
      mealSaveInFlightRef.current = false;
    }
  }

  function clearMealDraft() {
    barcodeLookupGenerationRef.current += 1;
    setMealDraft((current) => resetMealDraftForNextItem(current));
    setCustomFoodSearchQuery("");
    setBarcodeLookupError("");
    setBarcodeLookupStatus("idle");
    setIsScannerOpen(false);
    setSaveQuickEntryToLibrary(false);
  }

  function openMealComposerForSlot(slot: HealthMealEntry["meal_slot"], mode: "actual" | "plan" = "actual") {
    const preserveFoodDraft = hasMeaningfulMealDraft(mealDraft);
    setActiveMealEntrySlot(slot);
    setMealEditorMode(mode);
    setEditingMealPlanId(null);
    setMealDraft((current) => preserveFoodDraft
      ? { ...current, date: foodHistoryDate, mealSlot: slot }
      : prepareMealDraftForSelectedSlot(current, foodHistoryDate, slot));
    if (!preserveFoodDraft) {
      setIsQuickEntryOpen(false);
      setCustomFoodSearchQuery("");
      setBarcodeLookupError("");
      setSelectedCustomFoodCategory(null);
      setIsCustomFoodCategoriesOpen(false);
    }
    setSaveQuickEntryToLibrary(false);
  }

  function closeMealEntryEditor() {
    setActiveMealEntrySlot(null);
    setEditingMealPlanId(null);
    setMealEditorMode("actual");
    setIsScannerOpen(false);
    setSaveQuickEntryToLibrary(false);
  }

  function handleFoodHistoryDateChange(date: string) {
    setActiveMealEntrySlot(null);
    setEditingMealPlanId(null);
    setMealEditorMode("actual");
    setIsScannerOpen(false);
    setFoodHistoryDate(date);
  }

  function openQuickEntry() {
    setIsQuickEntryOpen(true);
    setSaveQuickEntryToLibrary(false);
    setCustomFoodSearchQuery("");
    setMealDraft((current) => ({
      ...resetMealDraftForNextItem(current),
      barcode: current.barcode,
      date: foodHistoryDate,
      mealSlot: activeMealEntrySlot ?? current.mealSlot,
      servingQuantity: 1,
    }));
  }

  function closeQuickEntry() {
    setIsQuickEntryOpen(false);
    setSaveQuickEntryToLibrary(false);
    setMealDraft((current) => ({
      ...resetMealDraftForNextItem(current),
    }));
  }

  function startEditingMeal(entry: HealthMealEntry) {
    const structuredMeal = getStructuredMealDefinition(entry);
    const parsedServing = parseQuantityServingLabel(entry.serving_label ?? "");
    const quantity = parsedServing.quantity;
    setMealEditorMode("actual");
    setEditingMealPlanId(null);
    setEditingMealId(entry.id);
    setMealEditDraft({
      mode: structuredMeal ? "structured" : "legacy",
      calories: structuredMeal ? String(structuredMeal.calories) : String(Math.round(entry.calories / quantity)),
      carbs: entry.carbs_g === null ? "" : String(scaleNullableNumber(entry.carbs_g / quantity, 1)),
      date: entry.entry_date,
      fat: entry.fat_g === null ? "" : String(scaleNullableNumber(entry.fat_g / quantity, 1)),
      mealSlot: entry.meal_slot,
      protein: entry.protein_g === null ? "" : String(scaleNullableNumber(entry.protein_g / quantity, 1)),
      quantity: structuredMeal ? String(entry.consumed_quantity) : String(quantity),
      measurement: structuredMeal?.consumedUnit ?? "serving",
      servingLabel: structuredMeal?.servingLabel ?? parsedServing.servingLabel,
      time: formatTimeInput(entry.logged_at),
    });
  }

  function startEditingMealPlan(plan: HealthMealPlanEntry) {
    setFoodHistoryDate(plan.planned_date);
    setActiveMealEntrySlot(plan.meal_slot);
    setMealEditorMode("plan");
    setEditingMealId(null);
    setEditingMealPlanId(plan.id);
    setMealDraft(mealDraftFromHealthMealPlan(plan));
    setCustomFoodSearchQuery(plan.brand_name ? `${plan.brand_name} · ${plan.food_name}` : plan.food_name);
    setIsQuickEntryOpen(false);
    setSaveQuickEntryToLibrary(false);
    setBarcodeLookupError("");
    setSelectedCustomFoodCategory(null);
    setIsCustomFoodCategoriesOpen(false);
  }

  async function saveMealEdit(entryId: string) {
    const currentEntry = mealEntries.find((entry) => entry.id === entryId);
    const structuredMeal = currentEntry ? getStructuredMealDefinition(currentEntry) : null;
    const loggedAt = buildHealthMealLoggedAt(mealEditDraft.date, mealEditDraft.time);
    if (!loggedAt || isHealthMealTimestampFuture(mealEditDraft.date, mealEditDraft.time)) {
      return;
    }
    if (!currentEntry) {
      return;
    }
    if (structuredMeal && mealEditDraft.mode === "structured") {
      const calculation = calculateMealSelection(
        structuredMeal,
        parsePositiveQuantity(mealEditDraft.quantity),
        mealEditDraft.measurement,
      );
      if (!calculation || !mealEditDraft.date || !mealEditDraft.time) {
        return;
      }
      const saved = await updateMealEntry(entryId, {
        calories: Math.round(calculation.nutrientTotals.calories),
        carbs_g: calculation.nutrientTotals.carbs_g,
        entry_date: mealEditDraft.date,
        fat_g: calculation.nutrientTotals.fat_g,
        logged_at: loggedAt,
        meal_slot: mealEditDraft.mealSlot,
        protein_g: calculation.nutrientTotals.protein_g,
        serving_label: formatConsumedMealLabel(calculation, structuredMeal.servingLabel),
        source_food_id: currentEntry.source_food_id ?? structuredMeal.sourceFoodId,
        consumed_quantity: calculation.consumed.quantity,
        consumed_unit: calculation.consumed.unit,
        serving_fraction: calculation.servingFraction,
        food_snapshot: currentEntry.food_snapshot ?? buildMealFoodSnapshot(structuredMeal),
        nutrition_snapshot: calculation.nutrientTotals,
      });
      if (saved) {
        setEditingMealId(null);
      }
      return;
    }

    const calories = Number.parseInt(mealEditDraft.calories, 10);
    const quantity = parsePositiveQuantity(mealEditDraft.quantity);
    if (!Number.isFinite(calories) || calories < 0 || quantity === null || !mealEditDraft.date || !mealEditDraft.time) {
      return;
    }

    const saved = await updateMealEntry(entryId, {
      calories: Math.round(calories * quantity),
      carbs_g: scaleNullableNumber(parseNullableNumber(mealEditDraft.carbs), quantity),
      entry_date: mealEditDraft.date,
      fat_g: scaleNullableNumber(parseNullableNumber(mealEditDraft.fat), quantity),
      logged_at: loggedAt,
      meal_slot: mealEditDraft.mealSlot,
      protein_g: scaleNullableNumber(parseNullableNumber(mealEditDraft.protein), quantity),
      serving_label: formatQuantityServingLabel(quantity, mealEditDraft.servingLabel),
    });
    if (saved) {
      setEditingMealId(null);
    }
  }

  async function handleSaveWeight() {
    if (!profile) {
      return;
    }
    const parsed = Number.parseFloat(weightDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    const saved = await addWeightEntry({
      entry_date: today,
      note: emptyToNull(weightNote),
      source: "manual",
      weight_kg: displayWeightToKilograms(parsed, profile.preferred_weight_unit),
    });
    if (saved) {
      setWeightDraft("");
      setWeightNote("");
    }
  }

  function handleFavoriteReuse(item: HealthFoodLibraryItem) {
    if (activeMealEntrySlot === null) {
      return;
    }
    const selection = mealFoodSelectionFromLibraryItem(item);
    applyLookupResult({
      attribution: selection.attribution,
      barcode: selection.barcode,
      brandName: selection.brandName,
      foodCategory: selection.foodCategory,
      calories: selection.calories,
      carbs: selection.carbs,
      fat: selection.fat,
      foodName: selection.foodName,
      protein: selection.protein,
      provider: selection.provider,
      providerItemId: selection.providerItemId,
      servingLabel: selection.servingLabel,
      sourceFoodId: selection.sourceFoodId,
      servingQuantity: selection.servingQuantity,
      servingUnit: selection.servingUnit,
      servingMeasureValue: selection.servingMeasureValue,
      servingMeasureUnit: selection.servingMeasureUnit,
      nutritionDetails: selection.nutritionDetails,
    });
  }

  function handleRecentFoodReuse(item: HealthMealEntry) {
    if (activeMealEntrySlot === null) {
      return;
    }
    applyLookupResult({
      attribution: item.attribution,
      barcode: item.barcode,
      brandName: item.brand_name,
      foodCategory: item.food_snapshot?.food_category,
      calories: item.calories,
      carbs: item.carbs_g,
      fat: item.fat_g,
      foodName: item.food_name,
      protein: item.protein_g,
      provider: item.provider,
      providerItemId: item.provider_item_id ?? item.id,
      servingLabel: item.serving_label,
      sourceFoodId: item.source_food_id ?? item.food_snapshot?.source_food_id,
      servingQuantity: item.food_snapshot?.serving_quantity,
      servingUnit: item.food_snapshot?.serving_unit,
      servingMeasureValue: item.food_snapshot?.serving_measure_value,
      servingMeasureUnit: item.food_snapshot?.serving_measure_unit,
      nutritionDetails: item.food_snapshot?.nutrition_details ?? null,
    });
  }

  async function handleRemoveFavorite(item: HealthFoodLibraryItem) {
    const saved = await setFavoriteFoodStatus(item.id, false);
    if (saved && expandedFavoriteId === item.id) {
      setExpandedFavoriteId(null);
    }
  }

  async function handleSaveFavoriteFromMeal(entry: HealthMealEntry) {
    if (isMealSavedAsFavorite(entry)) {
      return;
    }
    await saveFavoriteFood({
      attribution: entry.attribution,
      barcode: entry.barcode,
      brand_name: entry.brand_name,
      calories: entry.calories,
      carbs_g: entry.carbs_g,
      fat_g: entry.fat_g,
      food_category: entry.food_snapshot?.food_category,
      food_name: entry.food_name,
      ...(entry.food_snapshot?.nutrition_details
        ? { nutrition_details: entry.food_snapshot.nutrition_details }
        : {}),
      protein_g: entry.protein_g,
      provider: entry.provider,
      provider_item_id: entry.provider_item_id,
      serving_label: entry.food_snapshot?.serving_label ?? entry.serving_label,
      serving_quantity: entry.food_snapshot?.serving_quantity,
      serving_unit: entry.food_snapshot?.serving_unit,
      serving_measure_value: entry.food_snapshot?.serving_measure_value,
      serving_measure_unit: entry.food_snapshot?.serving_measure_unit,
      is_favorite: true,
    });
  }

  function isMealSavedAsFavorite(entry: HealthMealEntry) {
    const key = getHealthFoodIdentityKey(entry);
    return key ? favoriteFoodKeys.has(key) : false;
  }

  async function runBarcodeLookup(code: string) {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      return;
    }
    const requestGeneration = ++barcodeLookupGenerationRef.current;
    setBarcodeLookupError("");
    setBarcodeLookupStatus("barcode");
    setMealDraft((current) => ({ ...current, barcode: trimmedCode }));
    try {
      const result = await lookupOpenFoodFactsByBarcode(trimmedCode);
      if (requestGeneration !== barcodeLookupGenerationRef.current) {
        return;
      }
      if (!result) {
        setBarcodeLookupError("No food details found for this barcode. You can enter the food manually.");
        return;
      }
      applyLookupResult(result);
    } catch (error) {
      if (requestGeneration !== barcodeLookupGenerationRef.current) {
        return;
      }
      setBarcodeLookupError(error instanceof Error ? error.message : "Barcode lookup did not complete.");
    } finally {
      if (requestGeneration === barcodeLookupGenerationRef.current) {
        setBarcodeLookupStatus("idle");
      }
    }
  }

  function handleMealBarcodeDetected(barcode: string) {
    void runBarcodeLookup(barcode);
  }

  function applyLookupResult(result: {
    attribution?: string | null;
    barcode?: string | null;
    brandName: string | null;
    foodCategory?: string | null;
    calories: number | null;
    carbs: number | null;
    fat: number | null;
    foodName: string;
    protein: number | null;
    provider?: string | null;
    providerItemId?: string | null;
    servingLabel: string | null;
    sourceFoodId?: string | null;
    servingQuantity?: number | null;
    servingUnit?: string | null;
    servingMeasureValue?: number | null;
    servingMeasureUnit?: HealthServingMeasureUnit | null;
    nutritionDetails?: HealthNutritionDetails | null;
  }) {
    setIsQuickEntryOpen(false);
    setSaveQuickEntryToLibrary(false);
    const servingQuantity = positiveFiniteNumber(result.servingQuantity) ?? 1;
    const servingUnit = result.servingUnit?.trim() || "serving";
    setCustomFoodSearchQuery(result.brandName ? `${result.brandName} · ${result.foodName}` : result.foodName);
    setMealDraft((current) => ({
      ...current,
      attribution: result.attribution ?? null,
      barcode: result.barcode ?? current.barcode,
      brandName: result.brandName ?? "",
      calories: result.calories === null ? "" : String(result.calories),
      carbs: result.carbs === null ? "" : String(result.carbs),
      fat: result.fat === null ? "" : String(result.fat),
      foodName: result.foodName,
      protein: result.protein === null ? "" : String(result.protein),
      provider: result.provider ?? null,
      providerItemId: result.providerItemId ?? null,
      sourceFoodId: result.sourceFoodId ?? null,
      foodCategory: result.foodCategory ?? null,
      servingQuantity,
      servingUnit,
      servingMeasureValue: positiveFiniteNumber(result.servingMeasureValue),
      servingMeasureUnit: result.servingMeasureUnit ?? null,
      nutritionDetails: result.nutritionDetails ?? null,
      quantity: "1",
      measurement: "serving",
      servingLabel: result.servingLabel ?? "",
    }));
  }

  function applyMealFoodPickerSuggestion(suggestion: HealthMealPickerSuggestion) {
    if (suggestion.kind === "food") {
      const item = suggestion.item;
      applyLookupResult({
        attribution: item.attribution,
        barcode: item.barcode,
        brandName: item.brand_name,
        foodCategory: item.food_category ?? item.category,
        calories: item.calories,
        carbs: item.carbs_g,
        fat: item.fat_g,
        foodName: item.food_name,
        protein: item.protein_g,
        provider: item.provider,
        providerItemId: item.provider_item_id ?? item.id,
        servingLabel: item.serving_label,
        sourceFoodId: item.id,
        servingQuantity: item.serving_quantity,
        servingUnit: item.serving_unit,
        servingMeasureValue: item.serving_measure_value,
        servingMeasureUnit: item.serving_measure_unit,
        nutritionDetails: item.nutrition_details ?? null,
      });
      return;
    }

    if (suggestion.kind === "recipe") {
      const nutrition = getRecipeNutritionPerServing(suggestion.item);
      applyLookupResult({
        brandName: null,
        calories: nutrition.calories,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        foodName: suggestion.item.name,
        protein: nutrition.protein,
        provider: "recipe",
        providerItemId: suggestion.item.id,
        servingLabel: suggestion.item.servings === 1 ? "1 serving" : `1 of ${suggestion.item.servings} servings`,
        servingQuantity: 1,
        servingUnit: "serving",
        nutritionDetails: nutrition.nutrition_details ?? null,
      });
      return;
    }

    const nutrition = getSavedMealNutrition(suggestion.item);
    applyLookupResult({
      brandName: null,
      calories: nutrition.calories,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      foodName: suggestion.item.name,
      protein: nutrition.protein,
      provider: "saved_meal",
      providerItemId: suggestion.item.id,
      servingLabel: "1 saved meal",
      servingQuantity: 1,
      servingUnit: "serving",
      nutritionDetails: nutrition.nutrition_details ?? null,
    });
  }

  function updateImportParseStatus(progress: AppleHealthImportParseProgress) {
    setImportParseStatus(progress.message);
  }

  function updateImportSaveStatus(progress: HealthImportSaveProgress) {
    if (progress.phase === "complete") {
      setImportSaveStatus(progress.message);
      return;
    }
    setImportSaveStatus(`${progress.message} (${Math.min(progress.completed, progress.total)}/${progress.total})`);
  }

  function resetImportPreviewState() {
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    setImportPreview(null);
    setImportError("");
    setImportParseStatus(DEFAULT_IMPORT_STATUS);
    setImportSaveStatus("");
    setIsParsingImport(false);
    setIsSavingImport(false);
  }

  async function handleAppleFilePicked(file: File | null) {
    if (!file) {
      return;
    }
    importAbortRef.current?.abort();
    const abortController = new AbortController();
    importAbortRef.current = abortController;
    setIsParsingImport(true);
    setImportError("");
    setImportPreview(null);
    setImportSaveStatus("");
    setImportParseStatus("Preparing Apple Health import...");
    try {
      const preview = await parseAppleHealthFileInWorker(file, {
        onProgress: updateImportParseStatus,
        signal: abortController.signal,
      });
      setImportPreview(preview);
      setImportParseStatus(`Preview ready with ${preview.metricEntries.length} normalized metric rows.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setImportParseStatus("Apple Health import was canceled.");
      } else {
        setImportError(error instanceof Error ? error.message : "Apple Health import could not be parsed.");
      }
    } finally {
      if (importAbortRef.current === abortController) {
        importAbortRef.current = null;
      }
      setIsParsingImport(false);
    }
  }

  async function handleSaveImport() {
    if (!importPreview) {
      return;
    }
    setIsSavingImport(true);
    setImportSaveStatus("Preparing import save...");
    try {
      const saved = await importAppleHealthData(importPreview, { onProgress: updateImportSaveStatus });
      if (saved) {
        setImportPreview(null);
        setImportParseStatus(DEFAULT_IMPORT_STATUS);
      }
    } finally {
      setIsSavingImport(false);
    }
  }

  function renderMealBarcodeTools() {
    return <AdhdIconButton aria-label="Scan barcode" disabled={barcodeLookupStatus !== "idle"} onClick={() => setIsScannerOpen(true)} size="sm" title="Scan barcode"><ScanBarcode aria-hidden="true" /></AdhdIconButton>;
  }

  function renderMealCategoryFilter() {
    if (customFoodCategories.length === 0) {
      return null;
    }
    return (
      <div className="grid min-w-0 gap-2 sm:col-start-1 sm:row-start-2 sm:self-start">
        <div className="flex items-center gap-2">
          <AdhdChip
            aria-controls="inline-meal-food-categories"
            aria-expanded={isCustomFoodCategoriesOpen}
            contentClassName="gap-1"
            icon={<ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${isCustomFoodCategoriesOpen ? "rotate-180" : ""}`} />}
            onClick={() => setIsCustomFoodCategoriesOpen((current) => !current)}
            selected={isCustomFoodCategoriesOpen || selectedCustomFoodCategory !== null}
            title={selectedCustomFoodCategory ? `Filter by ${selectedCustomFoodCategory}` : "Filter custom foods by category"}
          >
            {selectedCustomFoodCategory && !isCustomFoodCategoriesOpen ? `Categories · ${selectedCustomFoodCategory}` : "Categories"}
          </AdhdChip>
        </div>
        {isCustomFoodCategoriesOpen ? (
          <div aria-label="Filter custom foods by category" className="flex flex-wrap gap-1.5" id="inline-meal-food-categories">
            {customFoodCategories.map((category) => <AdhdChip className="shrink-0" key={category} onClick={() => setSelectedCustomFoodCategory((current) => current === category ? null : category)} selected={selectedCustomFoodCategory === category} toneClassName="border-[#e4deef] bg-white text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60">{category}</AdhdChip>)}
          </div>
        ) : null}
      </div>
    );
  }

  function renderMealEntryEditor() {
    const isPlanMode = mealEditorMode === "plan";
    return (
      <div className="grid gap-3 rounded-[1.25rem] border border-[#e8e2f7] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1.35fr)_minmax(7rem,0.7fr)_minmax(4rem,0.4fr)_minmax(5.5rem,0.5fr)_auto] sm:items-end">
          <Field label="Food">
            <HealthAutocomplete
              ariaLabel="Search custom foods"
              onChange={setCustomFoodSearchQuery}
              onSelect={(suggestion) => {
                const selected = mealFoodSuggestions.find((candidate) => candidate.value === suggestion.value);
                if (selected) applyMealFoodPickerSuggestion(selected);
              }}
              placeholder="Search custom foods"
              suggestions={mealFoodSuggestions}
              value={customFoodSearchQuery}
            />
          </Field>
          {isQuickEntryOpen ? (
            <div className="rounded-[1rem] border border-[#e8e2f7] bg-white px-3 py-2 text-xs text-[#6d7894] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55">One-off entry</div>
          ) : (
            <Field composite label="Measurement">
              <HealthDropdown
                ariaLabel="Measurement"
                disabled={!mealDraft.foodName}
                onChange={(value) => setMealDraft((current) => ({ ...current, measurement: value }))}
                openOnFocus
                options={getHealthFoodMeasurementOptions({ servingMeasureUnit: mealDraft.servingMeasureUnit, servingUnit: mealDraft.servingUnit })}
                value={mealDraft.measurement}
              />
            </Field>
          )}
          {isQuickEntryOpen ? null : (
            <Field label="Amount">
              <input
                className={HEALTH_COMPACT_INPUT_CLASS}
                inputMode="decimal"
                onChange={(event) => setMealDraft((current) => ({ ...current, quantity: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.isComposing || event.nativeEvent.isComposing) {
                    return;
                  }
                  event.preventDefault();
                  if (canSaveMeal) {
                    void submitMeal();
                  }
                }}
                placeholder="1"
                value={mealDraft.quantity}
              />
            </Field>
          )}
          <Field label="Time">
            <HealthMealDateTimeInput onChange={(value) => setMealDraft((current) => ({ ...current, time: value }))} type="time" value={mealDraft.time} />
          </Field>
          <div className="flex min-w-0 items-center justify-end">{renderMealBarcodeTools()}</div>
          {renderMealCategoryFilter()}
        </div>
        {barcodeLookupStatus !== "idle" || barcodeLookupError ? (
          <div className="grid gap-2">
            {barcodeLookupStatus !== "idle" ? <InlineNotice text="Looking up barcode..." /> : null}
            {barcodeLookupError ? <EmptyCopy text={barcodeLookupError} /> : null}
          </div>
        ) : null}
        {isScannerOpen ? <HealthBarcodeScanner isOpen onClose={() => setIsScannerOpen(false)} onDetected={handleMealBarcodeDetected} /> : null}
        {isPlanMode ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Planned date">
              <HealthMealDateTimeInput onChange={(value) => { setFoodHistoryDate(value); setMealDraft((current) => ({ ...current, date: value })); }} type="date" value={mealDraft.date} />
            </Field>
            <Field composite label="Meal">
              <HealthDropdown
                ariaLabel="Planned meal"
                onChange={(value) => { const nextSlot = value as HealthMealEntry["meal_slot"]; setActiveMealEntrySlot(nextSlot); setMealDraft((current) => ({ ...current, mealSlot: nextSlot })); }}
                options={HEALTH_MEAL_SLOTS.map((slot) => ({ label: getMealSlotLabel(slot), value: slot }))}
                value={activeMealEntrySlot ?? mealDraft.mealSlot}
              />
            </Field>
          </div>
        ) : null}
        {isQuickEntryOpen ? (
          <div className="grid gap-3 rounded-[1.25rem] border border-[#e8e2f7] bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Food name"><input className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => setMealDraft((current) => ({ ...current, foodName: event.target.value }))} placeholder="Homemade snack" value={mealDraft.foodName} /></Field>
              <Field label="Calories"><input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="numeric" onChange={(event) => setMealDraft((current) => ({ ...current, calories: event.target.value }))} placeholder="250" value={mealDraft.calories} /></Field>
              <Field label="Protein (optional)"><input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" onChange={(event) => setMealDraft((current) => ({ ...current, protein: event.target.value }))} value={mealDraft.protein} /></Field>
              <Field label="Carbohydrates (optional)"><input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" onChange={(event) => setMealDraft((current) => ({ ...current, carbs: event.target.value }))} value={mealDraft.carbs} /></Field>
              <Field label="Fat (optional)"><input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" onChange={(event) => setMealDraft((current) => ({ ...current, fat: event.target.value }))} value={mealDraft.fat} /></Field>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#66718f] dark:text-white/60"><input checked={saveQuickEntryToLibrary} onChange={(event) => setSaveQuickEntryToLibrary(event.target.checked)} type="checkbox" />Save to Custom Nutrition Library</label>
            <p className="text-xs text-[#73809c] dark:text-white/50">The selected ledger date and meal section set this entry context.</p>
          </div>
        ) : null}
        {mealTimestampError ? <p className="text-xs text-[#a25b50] dark:text-[#ffb3a9]">{mealTimestampError}</p> : null}
        {mealDraft.foodName ? (
          <div aria-live="polite" className="rounded-[1rem] border border-[#e8e2f7] bg-white px-4 py-3 text-sm text-[#5d6783] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65">
            {mealCalculation ? <><div className="mb-1">{composeHealthFoodServingDefinition({ ...mealCalculation.serving, servingLabel: mealDraft.servingLabel })}</div><div>Nutrition preview: <strong className="text-[#3d4670] dark:text-white">{formatHealthNutritionNumber(mealCalculation.nutrientTotals.calories)} kcal</strong> / Protein {formatHealthNutritionNumber(mealCalculation.nutrientTotals.protein_g)}g / Carbs {formatHealthNutritionNumber(mealCalculation.nutrientTotals.carbs_g)}g / Fat {formatHealthNutritionNumber(mealCalculation.nutrientTotals.fat_g)}g</div><NutritionDetailsDisclosure details={mealCalculation.nutrientTotals.nutrition_details} /></> : "Enter a positive amount using one of this food’s supported measurements."}
          </div>
        ) : null}
        <div className="grid gap-3">
          {customFoodCategories.length > 0 ? <div aria-hidden="true" className="border-t border-[#ece8f6] dark:border-white/10" /> : null}
          {matchingCustomFoods.length === 0 ? <EmptyCopy text="No custom foods match this search." /> : (
            <div className="adhdice-scrollbar max-h-24 overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-2">
                {matchingCustomFoods.map((item) => (
                  <button className={`ui-pill-button-light inline-flex min-w-0 max-w-full whitespace-normal text-left ${mealDraft.providerItemId === (item.provider_item_id ?? item.id) ? "border-[#b9abff] bg-[#eee9ff] text-[#5f4bd7] dark:border-[#7561d8] dark:bg-[#2a2148] dark:text-[#d8d0ff]" : ""}`} key={item.id} onClick={() => { setCustomFoodSearchQuery(item.brand_name ? `${item.brand_name} · ${item.food_name}` : item.food_name); applyLookupResult({ attribution: item.attribution, barcode: item.barcode, brandName: item.brand_name, foodCategory: item.food_category ?? item.category, calories: item.calories, carbs: item.carbs_g, fat: item.fat_g, foodName: item.food_name, nutritionDetails: item.nutrition_details ?? null, protein: item.protein_g, provider: item.provider, providerItemId: item.provider_item_id ?? item.id, servingLabel: item.serving_label, sourceFoodId: item.id, servingQuantity: item.serving_quantity, servingUnit: item.serving_unit, servingMeasureValue: item.serving_measure_value, servingMeasureUnit: item.serving_measure_unit }); }} type="button">{formatBrandedFoodName(item)} · {item.calories} kcal</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <AdhdChip contentClassName="gap-1.5" onClick={isQuickEntryOpen ? closeQuickEntry : openQuickEntry} selected={isQuickEntryOpen}>Quick Entry</AdhdChip>
            <span className="text-xs text-[#73809c] dark:text-white/50">{isPlanMode ? "Add another food to this plan, or finish when you’re done." : "Add another food to this meal, or finish when you’re done."}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <AdhdChip contentClassName="gap-1.5" icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={clearMealDraft} title="Clear current food selection">Clear</AdhdChip>
            <AdhdChip onClick={closeMealEntryEditor}>Done</AdhdChip>
          <button className="ui-pill-button-strong-light disabled:cursor-not-allowed disabled:opacity-60" disabled={!canSaveMeal} onClick={() => { void submitMeal(); }} type="button">{isPlanMode ? (isQuickEntryOpen ? "Add Quick Entry to Plan" : editingMealPlanId ? "Save Plan" : "Add to Plan") : isQuickEntryOpen ? "Add Quick Entry" : "Add Food"}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="-mx-[15px] px-3 pb-32 sm:mx-0 sm:px-4">
      <PageShellHeader actions={<PageShellLayoutControls layout={pageShellLayout} />} subtitle="Health, Diet, Fitness" title="Health" />

      <div aria-label="Health sections" className="mt-5 flex flex-wrap gap-2" role="tablist">
        {HEALTH_TABS.map((tab) => (
          <button
            aria-controls={getHealthTabPanelId(tab)}
            aria-selected={activeTab === tab}
            className={`transition ${
              activeTab === tab
                ? "ui-pill-button-strong-light"
                : "ui-pill-button-light hover:bg-[#ebe6ff] dark:hover:bg-white/12"
            }`}
            id={`health-tab-${tab.toLowerCase()}`}
            key={tab}
            onClick={() => persistHealthTabPreference(tab)}
            role="tab"
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Today" ? (
        <div aria-labelledby="health-tab-today" id={getHealthTabPanelId("Today")} role="tabpanel">
          <HealthTodayTab
            checkIns={checkIns}
            focusCategories={focusCategories}
            focusHistory={focusHistory}
            journalSignals={journalSignals}
            journalSignalOccurrences={journalSignalOccurrences}
            mealEntries={mealEntries}
            metricEntries={metricEntries}
            onNavigate={persistHealthTabPreference}
            profile={activeProfile}
            symptoms={symptoms}
            symptomEntries={symptomEntries}
            today={today}
            waterEntries={waterEntries}
            weightEntries={weightEntries}
            workouts={workouts}
            layout={pageShellLayout}
          />
        </div>
      ) : null}

      {activeTab === "Fitness" ? (
        <HealthFitnessTab
          addWorkout={addWorkout}
          archiveGoal={archiveGoal}
          archiveExercise={archiveExercise}
          archivePlan={archivePlan}
          archivePlanItem={archivePlanItem}
          createExercise={createExercise}
          createGoal={createGoal}
          createLevel={createLevel}
          reorderExercises={reorderExercises}
          createPlan={createPlan}
          createPlanItem={createPlanItem}
          deleteWorkout={deleteWorkout}
          deleteLevel={deleteLevel}
          exerciseLibrary={exerciseLibrary}
          fitnessPlanError={fitnessPlanError}
          fitnessPlansLoading={fitnessPlansLoading}
          fitnessGoalsError={fitnessGoalsError}
          fitnessGoalsLoading={fitnessGoalsLoading}
          fitnessGoals={fitnessGoals}
          fitnessGoalLevels={fitnessGoalLevels}
          fitnessSessionError={fitnessSessionError}
          fitnessSessionLoaded={fitnessSessionLoaded}
          fitnessSessionLoading={fitnessSessionLoading}
          getWorkoutSessionDetails={getWorkoutSessionDetails}
          metricEntries={metricEntries}
          planItems={planItems}
          plans={plans}
          profile={activeProfile}
          saveProfile={saveProfile}
          saveWorkoutPlanItemLinks={saveWorkoutPlanItemLinks}
          updatePlan={updatePlan}
          updatePlanItem={updatePlanItem}
          updateExercise={updateExercise}
          updateGoal={updateGoal}
          updateLevel={updateLevel}
          updateWorkout={updateWorkout}
          restoreGoal={restoreGoal}
          saveWorkoutSessionDetails={saveWorkoutSessionDetails}
          workoutPlanItemLinks={workoutPlanItemLinks}
          workoutExercises={workoutExercises}
          workoutSets={workoutSets}
          workouts={workouts}
          layout={pageShellLayout}
        />
      ) : null}

      {activeTab === "Journal" ? (
        <>
          <ReorderablePageShells layout={pageShellLayout}>
          <PageShell id="journal-entry-history" label="Journal Entry and History">
            <HealthPanel
              aria-labelledby="health-tab-journal"
              className="mt-6 min-w-0"
              headerActions={(
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <div className="relative">
                    <AdhdIconButton
                      aria-controls="journal-history-layout-menu"
                      aria-expanded={isJournalHistoryMenuOpen}
                      aria-haspopup="menu"
                      aria-label={journalWorkspaceMode === "entry" ? "View Journal History" : "Return to Journal Entry"}
                      onClick={handleJournalHistoryClick}
                      onKeyDown={handleJournalHistoryKeyDown}
                      onPointerCancel={handleJournalHistoryPointerCancel}
                      onPointerDown={handleJournalHistoryPointerDown}
                      onPointerLeave={handleJournalHistoryPointerUp}
                      onPointerUp={handleJournalHistoryPointerUp}
                      size="sm"
                      title={journalWorkspaceMode === "entry" ? "View Journal History" : "Return to Journal Entry"}
                      tone="ghost"
                      variant="rowToolbar"
                    >
                      {journalWorkspaceMode === "entry" ? <History aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
                    </AdhdIconButton>
                    {isJournalHistoryMenuOpen ? (
                      <AdhdDropdownPanel
                        aria-label="Choose Journal History layout"
                        className="left-auto right-0 top-[calc(100%+0.35rem)]"
                        id="journal-history-layout-menu"
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setIsJournalHistoryMenuOpen(false);
                          }
                        }}
                        role="menu"
                        widthClassName="w-40"
                      >
                        <div className="grid gap-1">
                          <button className="min-h-9 rounded-[0.7rem] px-3 text-left text-sm font-semibold text-[#3c4966] hover:bg-[#f7f3ff] dark:text-white/75 dark:hover:bg-white/[0.08]" onClick={() => selectJournalWorkspaceMode("split-history-left")} role="menuitem" type="button">History Left</button>
                          <button className="min-h-9 rounded-[0.7rem] px-3 text-left text-sm font-semibold text-[#3c4966] hover:bg-[#f7f3ff] dark:text-white/75 dark:hover:bg-white/[0.08]" onClick={() => selectJournalWorkspaceMode("split-history-right")} role="menuitem" type="button">History Right</button>
                        </div>
                      </AdhdDropdownPanel>
                    ) : null}
                  </div>
                  {journalWorkspaceMode === "history" ? <AdhdChip onClick={startNewJournalEntry} type="button">+ New Entry</AdhdChip> : null}
                </div>
              )}
              id={getHealthTabPanelId("Journal")}
              icon={<HeartPulse />}
              shellSurface
              subtitle="Journal"
              title="Journal"
              role="tabpanel"
            >
            <div className={(journalWorkspaceMode === "split-history-left" || journalWorkspaceMode === "split-history-right") ? "grid min-w-0 gap-5 md:grid-cols-2" : "min-w-0"}>
            {journalWorkspaceMode !== "history" ? <div className={`min-w-0 ${(journalWorkspaceMode === "split-history-left" || journalWorkspaceMode === "split-history-right") ? journalWorkspaceMode === "split-history-left" ? "md:order-2" : "md:order-1" : ""}`}>
              <div className="grid min-w-0 gap-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-wrap gap-3">
                    <Field label="Journal Date">
                      <HealthMealDateTimeInput className="min-w-[8.5rem] justify-start" max={today} onChange={(date) => setJournalDate(date || today)} type="date" value={journalDate} />
                    </Field>
                    <Field label="Journal Time">
                      <HealthStandardTimeInput ariaLabel="Journal Time" onChange={setJournalEntryTime} value={journalEntryTime} />
                    </Field>
                    <AdhdIconButton
                      aria-controls="journal-logged-metadata"
                      aria-expanded={isJournalLoggedMetadataOpen}
                      aria-label={isJournalLoggedMetadataOpen ? "Hide Logged Date and Time" : "Show Logged Date and Time"}
                      onClick={() => setIsJournalLoggedMetadataOpen((open) => !open)}
                      size="sm"
                      title={isJournalLoggedMetadataOpen ? "Hide Logged Date and Time" : "Show Logged Date and Time"}
                      tone="ghost"
                      variant="rowToolbar"
                    >
                      <ChevronDown aria-hidden="true" className={`transition-transform ${isJournalLoggedMetadataOpen ? "rotate-180" : ""}`} />
                    </AdhdIconButton>
                    {isJournalLoggedMetadataOpen ? <div className="contents" id="journal-logged-metadata">
                      <Field label="Logged Date">
                        <span aria-label="Logged Date" aria-readonly="true" className={`${HEALTH_COMPACT_CONTROL_CLASS} inline-flex min-w-[8.5rem] items-center justify-start max-sm:!h-[32px] max-sm:!min-h-[32px]`}><span className="text-[13px] leading-normal max-sm:!text-[16px] max-sm:!leading-normal">{selectedJournalEntry ? formatHealthJournalMetadataDate(selectedJournalEntry.created_at) ?? "Date unavailable" : "When saved"}</span></span>
                      </Field>
                      <Field label="Logged Time">
                        {selectedJournalEntry ? <HealthStandardTimeInput ariaLabel="Logged Time" readOnly value={formatTimeInput(selectedJournalEntry.created_at)} /> : <HealthStandardTimeInput ariaLabel="Logged Time" readOnly readOnlyPlaceholder="When saved" value="" />}
                      </Field>
                    </div> : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="text-xs text-[#7d88a3] dark:text-white/45">{selectedJournalEntry ? "Existing entry" : "New entry · not saved yet"}</span>
                    <AdhdChip onClick={startNewJournalEntry} type="button">+ New Entry</AdhdChip>
                  </div>
                </div>

                <section className="grid gap-3" aria-labelledby="journal-feelings-heading">
                  <SectionMiniTitle
                    actions={(
                      <div className="flex flex-wrap gap-2">
                        <AdhdChip onClick={() => setIsJournalAddOpen((open) => !open)} type="button">+ Add Feeling</AdhdChip>
                        <AdhdChip onClick={handleManageJournalLibrary} type="button">Manage Journal Library</AdhdChip>
                      </div>
                    )}
                    title="How are you feeling?"
                  />
                  <h3 className="sr-only" id="journal-feelings-heading">How are you feeling?</h3>
                  {isJournalAddOpen ? (
                    <div className="grid gap-2 rounded-[1rem] border border-[#e4deef] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="text-xs text-[#68738c] dark:text-white/55">Add a feeling to this Journal Entry.</p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {(["symptom", "emotion", "other"] as const).map((kind) => {
                          const choices = journalFeelingChoices.filter((choice) => choice.kind === kind && !journalDraftValues.some((value) => choice.signal?.id === value.signal_id));
                          return <div className="grid content-start gap-2" key={kind}><SectionMiniTitle title={kind === "symptom" ? "Symptoms" : kind === "emotion" ? "Emotions" : "Other Feelings"} />{choices.map((choice) => <AdhdChip key={choice.symptomId ?? choice.signal?.id} onClick={() => { void addJournalFeelingToToday(choice); }} type="button">{choice.name}</AdhdChip>)}</div>;
                        })}
                      </div>
                      {journalFeelingChoices.every((choice) => journalDraftValues.some((value) => choice.signal?.id === value.signal_id)) ? <span className="text-xs text-[#7d7598] dark:text-white/50">All active Feelings are already in this entry.</span> : null}
                    </div>
                  ) : null}
                  <div className={`grid min-w-0 gap-4 md:grid-cols-2 ${journalWorkspaceMode === "split-history-left" || journalWorkspaceMode === "split-history-right" ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
                    <div className="min-w-0"><JournalRatingCard expanded={expandedJournalScaleKey === "core:mood"} expandedScaleKey="core:mood" label="Mood" onClear={() => { setJournalMood(null); setExpandedJournalScaleKey(null); }} onSelect={(score) => { setJournalMood(score); setExpandedJournalScaleKey(null); }} onToggle={() => toggleJournalScale("core:mood")} scaleLabelIndexOffset={-1} scaleLabels={CORE_JOURNAL_SCALE_LABELS.Mood} scoreOptions={HEALTH_SCALE_OPTIONS} value={journalMood} /></div>
                    <div className="min-w-0"><JournalRatingCard expanded={expandedJournalScaleKey === "core:energy"} expandedScaleKey="core:energy" label="Energy" onClear={() => { setJournalEnergy(null); setExpandedJournalScaleKey(null); }} onSelect={(score) => { setJournalEnergy(score); setExpandedJournalScaleKey(null); }} onToggle={() => toggleJournalScale("core:energy")} scaleLabelIndexOffset={-1} scaleLabels={CORE_JOURNAL_SCALE_LABELS.Energy} scoreOptions={HEALTH_SCALE_OPTIONS} value={journalEnergy} /></div>
                    <div className="min-w-0"><JournalRatingCard expanded={expandedJournalScaleKey === "core:stress"} expandedScaleKey="core:stress" label="Stress" onClear={() => { setJournalStress(null); setExpandedJournalScaleKey(null); }} onSelect={(score) => { setJournalStress(score); setExpandedJournalScaleKey(null); }} onToggle={() => toggleJournalScale("core:stress")} scaleLabelIndexOffset={-1} scaleLabels={CORE_JOURNAL_SCALE_LABELS.Stress} scoreOptions={HEALTH_SCALE_OPTIONS} value={journalStress} /></div>
                    <div className="min-w-0"><JournalRatingCard expanded={expandedJournalScaleKey === "core:clarity"} expandedScaleKey="core:clarity" label="Mental Clarity" onClear={() => { setJournalClarity(null); setExpandedJournalScaleKey(null); }} onSelect={(score) => { setJournalClarity(score); setExpandedJournalScaleKey(null); }} onToggle={() => toggleJournalScale("core:clarity")} scaleLabelIndexOffset={-1} scaleLabels={CORE_JOURNAL_SCALE_LABELS["Mental clarity"]} scoreOptions={HEALTH_SCALE_OPTIONS} value={journalClarity} /></div>
                    {journalDraftValues.length === 0 ? <div className="min-w-0"><EmptyCopy text="Add template Feelings from the Journal Library." /></div> : journalDraftValues.map((draftValue) => {
                      const signal = journalSignals.find((candidate) => candidate.id === draftValue.signal_id);
                      if (!signal) return null;
                      const isDayOnly = !signal.in_template;
                      return (
                        <div className="min-w-0" key={signal.id}>
                          <JournalRatingCard
                            expanded={expandedJournalScaleKey === `feeling:${signal.id}`}
                            expandedScaleKey={`feeling:${signal.id}`}
                            label={getHealthJournalSignalDisplayName(signal, symptoms)}
                            onClear={() => { setJournalDraftValues((current) => updateHealthJournalDraftValue(current, signal.id, null)); setExpandedJournalScaleKey(null); }}
                            onSelect={(score) => { setJournalDraftValues((current) => updateHealthJournalDraftValue(current, signal.id, score)); setExpandedJournalScaleKey(null); }}
                            onToggle={() => toggleJournalScale(`feeling:${signal.id}`)}
                            removeAction={isDayOnly ? <AdhdIconButton aria-label={`Remove ${getHealthJournalSignalDisplayName(signal, symptoms)} from this Journal Entry`} onClick={() => setJournalDraftValues((current) => current.filter((value) => value.signal_id !== signal.id))} size="sm" tone="danger" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton> : null}
                            scaleLabelIndexOffset={0}
                            scaleLabels={signal.scale_labels}
                            scoreOptions={HEALTH_JOURNAL_SCORE_OPTIONS}
                            value={draftValue.score}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="grid gap-3" aria-labelledby="journal-occurrences-heading">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SectionMiniTitle title="Feeling Occurrences" />
                    <AdhdChip onClick={openJournalOccurrenceCreate} type="button">+ Log occurrence</AdhdChip>
                  </div>
                  <h3 className="sr-only" id="journal-occurrences-heading">Feeling Occurrences</h3>
                  {journalOccurrenceEditorOpen ? (
                    <div className="grid gap-3 rounded-[1rem] border border-[#e4deef] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <Field composite label="Feeling">
                        <HealthDropdown
                          ariaLabel="Occurrence Feeling"
                          onChange={setJournalOccurrenceSignalId}
                          options={[{ label: "Choose a Feeling", value: "" }, ...journalOccurrenceChoices.filter((choice) => choice.signal).map((choice) => ({ label: choice.name, value: choice.signal!.id }))]}
                          value={journalOccurrenceSignalId}
                        />
                      </Field>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{journalOccurrenceSignal?.kind === "symptom" ? "Severity" : "Intensity"} · 1–10</p>
                        <div className="mt-2 grid grid-cols-5 gap-2 sm:flex sm:flex-wrap">
                          {HEALTH_SEVERITY_OPTIONS.map((score) => <button aria-label={`Occurrence score ${score} out of 10`} aria-pressed={journalOccurrenceScore === score} className={`flex h-9 w-full items-center justify-center rounded-full text-sm font-semibold sm:w-9 ${journalOccurrenceScore === score ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]" : "bg-[#f4f1ff] text-[#615b9c] dark:bg-white/8 dark:text-white/65"}`} key={score} onClick={() => setJournalOccurrenceScore(score)} type="button">{score}</button>)}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Occurrence Time"><HealthStandardTimeInput ariaLabel="Feeling occurrence time" onChange={setJournalOccurrenceTime} value={journalOccurrenceTime} /></Field>
                        <Field label="Note (optional)"><input aria-label="Occurrence note" className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => setJournalOccurrenceNote(event.target.value)} value={journalOccurrenceNote} /></Field>
                      </div>
                      <div className="flex justify-end gap-2"><AdhdChip onClick={resetJournalOccurrenceDraft} type="button">Cancel</AdhdChip><AdhdChip onClick={saveJournalOccurrenceDraft} tone="purple" type="button">{journalOccurrenceEditKey ? "Update occurrence" : "Add occurrence"}</AdhdChip></div>
                    </div>
                  ) : null}
                  {journalOccurrences.length === 0 ? <p className="text-xs text-[#7d7598] dark:text-white/50">No occurrences linked to this Journal Entry.</p> : (
                    <div className="grid gap-2">{journalOccurrences.map((occurrence) => {
                      const signal = journalOccurrenceChoices.find((choice) => choice.signal?.id === occurrence.signalId)?.signal ?? journalSignals.find((candidate) => candidate.id === occurrence.signalId);
                      const name = signal ? getHealthJournalSignalDisplayName(signal, symptoms) : "Archived Feeling";
                      return <div className="flex flex-wrap items-center gap-2 rounded-[0.9rem] border border-[#edf0fb] px-3 py-2 text-sm dark:border-white/10" key={occurrence.draftKey}><span className="font-semibold text-[#26324f] dark:text-white">{name}</span><span className="font-black text-[#6f57f6] dark:text-[#cabfff]">{occurrence.score}/10</span><span className="text-xs text-[#7d88a3] dark:text-white/45">{formatHealthStandardTime(occurrence.time) ?? "Time unavailable"}</span>{occurrence.note ? <span className="min-w-0 flex-1 text-xs text-[#73809c] dark:text-white/50">{occurrence.note}</span> : null}<AdhdIconButton aria-label={`Edit ${name} occurrence`} onClick={() => startJournalOccurrenceEdit(occurrence)} size="sm" tone="ghost" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton><AdhdIconButton aria-label={`Remove ${name} occurrence`} onClick={() => setJournalOccurrences((current) => current.filter((item) => item.draftKey !== occurrence.draftKey))} size="sm" tone="danger" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton></div>;
                    })}</div>
                  )}
                </section>

                <div className="grid gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Your day</span>
                  <span className="text-xs text-[#7d88a3] dark:text-white/45">Tip: Type # while writing to tag a symptom or feeling. Choosing one logs a timestamped Feeling Occurrence.</span>
                  <div className="relative w-full min-w-0">
                    <textarea
                      aria-activedescendant={journalTagQuery && visibleJournalTagOptions.length > 0 ? `journal-tag-option-${journalTagHighlightIndex}` : undefined}
                      aria-controls={journalTagQuery ? "journal-tag-picker" : journalTagOverlay ? "journal-tag-overlay" : undefined}
                      aria-label="Journal reflection"
                      className="health-journal-textarea block min-h-40 w-full min-w-0 max-w-full rounded-[1.5rem] border border-[#e6e8f5] bg-white px-4 py-4 text-sm text-[#22304b] outline-none transition focus:border-[#9e8cf9] dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                      onChange={(event) => { setJournalReflection(event.target.value); syncJournalTagQuery(event.currentTarget); }}
                      onClick={(event) => syncJournalTagQuery(event.currentTarget)}
                      onKeyDown={handleJournalReflectionKeyDown}
                      onKeyUp={(event) => {
                        if (!(["ArrowDown", "ArrowUp", "Enter", "Escape"] as string[]).includes(event.key)) syncJournalTagQuery(event.currentTarget, false);
                      }}
                      placeholder={'What happened today?\n\nWhat felt good or difficult?\nWhat was on your mind?\nDid your body feel different anywhere?\nAnything you want to remember about today?'}
                      ref={journalReflectionRef}
                      value={journalReflection}
                    />
                    {journalTagQuery ? (
                      <div aria-label="Journal feeling picker" className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-[1rem] border border-[#e4deef] bg-white p-2 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-[#211c34]" id="journal-tag-picker" role="listbox">
                        {visibleJournalTagGroups.map(({ kind, options: groupOptions }, groupIndex) => {
                          return <div className={`grid gap-1 ${groupIndex > 0 ? "mt-3" : ""}`} key={kind}><SectionMiniTitle title={kind === "symptom" ? "Symptoms" : kind === "emotion" ? "Emotions" : "Other Feelings"} />{groupOptions.map((option) => { const optionIndex = visibleJournalTagOptions.indexOf(option); return <button aria-selected={journalTagHighlightIndex === optionIndex} className={`flex min-h-9 w-full items-center rounded-[0.7rem] px-3 text-left text-sm font-semibold ${journalTagHighlightIndex === optionIndex ? "bg-[#efe9ff] text-[#5d49c7] dark:bg-[#3a2b61] dark:text-[#e0d9ff]" : "text-[#3c4966] hover:bg-[#f7f3ff] dark:text-white/75 dark:hover:bg-white/[0.08]"}`} id={`journal-tag-option-${optionIndex}`} key={`${option.kind}:${option.symptomId ?? option.signal?.id}`} onClick={() => { void selectJournalTag(option); }} onMouseDown={(event) => event.preventDefault()} role="option">{option.name}</button>; })}</div>;
                        })}
                        {visibleJournalTagOptions.length === 0 ? <p className="px-3 py-2 text-xs text-[#7d88a3] dark:text-white/45">No matching Feelings.</p> : null}
                      </div>
                    ) : null}
                    {journalTagOverlay ? (
                      <AdhdDropdownPanel
                        aria-label={`Log ${getHealthJournalSignalDisplayName(journalTagSignal ?? journalTagOverlay.signal, symptoms)}`}
                        className="right-0 bottom-2 left-auto top-auto z-40 grid max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto"
                        id="journal-tag-overlay"
                        role="dialog"
                        tabIndex={-1}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            closeJournalTagOverlay();
                          }
                        }}
                        widthClassName="w-[min(25rem,calc(100vw-2rem))]"
                      >
                        {journalTagSignal ? <>
                          <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Log {getHealthJournalSignalDisplayName(journalTagSignal, symptoms)}</p><div className="flex shrink-0 items-center gap-1">{journalTagSignal.kind === "symptom" && journalTagSymptom ? <HealthSymptomColorControl isOpen={openSymptomColorPickerKey === `journal-tag:${journalTagSymptom.id}`} onSetColor={(color) => handleSetSymptomColor(journalTagSymptom.id, color)} onToggle={() => toggleSymptomColorPicker(`journal-tag:${journalTagSymptom.id}`)} symptom={journalTagSymptom} /> : <HealthJournalColorControl isOpen={openSymptomColorPickerKey === `journal-tag:${journalTagSignal.id}`} onSetColor={(color) => handleSetJournalSignalColor(journalTagSignal.id, color)} onToggle={() => toggleSymptomColorPicker(`journal-tag:${journalTagSignal.id}`)} signal={journalTagSignal} symptoms={symptoms} />}<AdhdChip onClick={closeJournalTagOverlay} type="button">Skip</AdhdChip></div></div>
                          <div className="grid gap-2"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{journalTagSignal.kind === "symptom" ? "Severity" : "Intensity"} · 1–10</p><div className="grid grid-cols-2 gap-1.5">{HEALTH_SEVERITY_OPTIONS.map((score) => <button aria-label={`${getHealthJournalSignalDisplayName(journalTagSignal, symptoms)} ${journalTagSignal.kind === "symptom" ? "severity" : "intensity"} ${score}, ${journalTagSignal.scale_labels[score] ?? ""}`} aria-pressed={journalTagOverlay.score === score} className={`flex min-h-9 min-w-0 items-start justify-start gap-2 rounded-[0.7rem] px-2 py-2 text-left text-xs font-semibold ${journalTagOverlay.score === score ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]" : "bg-[#f4f1ff] text-[#615b9c] dark:bg-white/8 dark:text-white/65"}`} key={score} onClick={() => updateJournalTagOccurrence({ score })} type="button"><span className="shrink-0 font-black">{score}</span><span className="min-w-0 flex-1 break-words whitespace-normal">{journalTagSignal.scale_labels[score] ?? ""}</span></button>)}</div></div>
                          <Field label="Occurrence Time"><HealthStandardTimeInput ariaLabel="Feeling occurrence time" onChange={(time) => updateJournalTagOccurrence({ time })} value={journalTagOverlay.time} /></Field>
                          {journalTagOverlay.error ? <p aria-live="polite" className="text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]" role="alert">{journalTagOverlay.error}</p> : null}
                          <div className="flex justify-end gap-2"><AdhdChip onClick={closeJournalTagOverlay} type="button">Skip</AdhdChip><AdhdChip onClick={saveJournalTagOccurrence} tone="purple" type="button">Add occurrence</AdhdChip></div>
                        </> : null}
                      </AdhdDropdownPanel>
                    ) : null}
                  </div>
                </div>
                {journalFormError ? <p aria-live="polite" className="text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]" role="alert">{journalFormError}</p> : null}
                <div className="flex justify-end"><button className="ui-pill-button-strong-light" onClick={() => { void handleSaveJournal(); }} type="button">{selectedJournalEntry ? "Update Journal Entry" : "Save Journal Entry"}</button></div>
              </div>
            </div> : null}

            {journalWorkspaceMode !== "entry" ? <div className={`min-w-0 ${(journalWorkspaceMode === "split-history-left" || journalWorkspaceMode === "split-history-right") ? `${journalWorkspaceMode === "split-history-left" ? "md:order-1" : "md:order-2"} hidden md:block` : ""}`}>
              <div className="space-y-4">
                <SectionMiniTitle title="Journal History" />
                {journalHistoryGroups.length === 0 ? <EmptyCopy text="Your first Journal Entry will start history here." /> : journalHistoryGroups.slice(0, 12).map((group) => {
                  const isJournalHistoryDateCollapsed = collapsedJournalHistoryDates.has(group.date);
                  return (
                  <section className="grid gap-2" key={group.date}>
                        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">
                          <button
                            aria-controls={`journal-history-date-${group.date}`}
                            aria-expanded={!isJournalHistoryDateCollapsed}
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-left transition hover:bg-[#f7f3ff] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:hover:bg-white/[0.08] dark:hover:text-[#cabfff]"
                            onClick={() => toggleJournalHistoryDate(group.date)}
                            type="button"
                          >
                            <span>{formatHealthDateLabel(group.date)}</span>
                            <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${isJournalHistoryDateCollapsed ? "-rotate-90" : "rotate-180"}`} />
                          </button>
                        </h3>
                        <div className="grid gap-2" hidden={isJournalHistoryDateCollapsed} id={`journal-history-date-${group.date}`}>
                          {group.entries.map((entry) => {
                      const entryValues = journalSignalValues.filter((value) => value.journal_entry_id === entry.id);
                      const entryOccurrences = [
                        ...symptomEntries.filter((occurrence) => occurrence.journal_entry_id === entry.id).map((occurrence) => ({
                          id: occurrence.id,
                          label: symptoms.find((symptom) => symptom.id === occurrence.symptom_id)?.name ?? "Archived symptom",
                          score: occurrence.severity,
                          occurredAt: occurrence.logged_at,
                        })),
                        ...journalSignalOccurrences.filter((occurrence) => occurrence.journal_entry_id === entry.id).map((occurrence) => ({
                          id: occurrence.id,
                          label: getHealthJournalSignalDisplayName(journalSignals.find((signal) => signal.id === occurrence.signal_id) ?? { id: occurrence.signal_id, user_id: entry.user_id, kind: "other", symptom_id: null, name: "Archived Feeling", color: null, low_label: "None", high_label: "Extreme", scale_labels: getDefaultHealthJournalScaleLabels("other"), in_template: false, template_sort_order: null, archived_at: null, created_at: entry.created_at, updated_at: entry.updated_at }, symptoms),
                          score: occurrence.score,
                          occurredAt: occurrence.occurred_at,
                        })),
                      ].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
                      const isLoggedMetadataOpen = expandedJournalHistoryEntryIds.has(entry.id);
                      return <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={entry.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="grid gap-1">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Journal</p>
                              <div className="flex min-w-0 items-center gap-1">
                                <p className="min-w-0 text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthJournalDate(entry.entry_date)} · {formatHealthStandardTime(normalizeHealthJournalEntryTime(entry.entry_time, entry.created_at)) ?? "Time unavailable"}</p>
                                <button
                                  aria-controls={`journal-history-logged-${entry.id}`}
                                  aria-expanded={isLoggedMetadataOpen}
                                  aria-label={isLoggedMetadataOpen ? "Hide Logged Date and Time" : "Show Logged Date and Time"}
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#8d87a7] transition hover:bg-[#f1ecff] dark:text-white/45 dark:hover:bg-white/8"
                                  onClick={() => toggleJournalHistoryMetadata(entry.id)}
                                  title={isLoggedMetadataOpen ? "Hide Logged Date and Time" : "Show Logged Date and Time"}
                                  type="button"
                                >
                                  <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${isLoggedMetadataOpen ? "rotate-180" : ""}`} />
                                </button>
                              </div>
                            </div>
                            {isLoggedMetadataOpen ? <div id={`journal-history-logged-${entry.id}`}>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Logged</p>
                              <p className="text-xs text-[#7d88a3] dark:text-white/45">{formatJournalLoggedAt(entry.created_at)}</p>
                            </div> : null}
                          </div>
                          <div className="flex gap-1"><AdhdChip onClick={() => selectJournalEntry(entry)} type="button">Edit</AdhdChip><AdhdChip onClick={() => handleDeleteJournalEntry(entry)} tone="danger" type="button">Delete</AdhdChip></div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#68738c] dark:text-white/60">{entry.mood_score !== null ? <span>Mood {entry.mood_score}</span> : null}{entry.energy_score !== null ? <span>Energy {entry.energy_score}</span> : null}{entry.stress_score !== null ? <span>Stress {entry.stress_score}</span> : null}{entry.clarity_score !== null ? <span>Clarity {entry.clarity_score}</span> : null}</div>
                        {entryValues.length > 0 ? <p className="mt-2 text-xs text-[#68738c] dark:text-white/60"><span className="font-semibold">Snapshot ratings:</span> {entryValues.map((value) => { const signal = journalSignals.find((candidate) => candidate.id === value.signal_id); return `${signal ? getHealthJournalSignalDisplayName(signal, symptoms) : "Feeling"} ${value.score}`; }).join(" · ")}</p> : null}
                        {entryOccurrences.length > 0 ? <p className="mt-1 text-xs text-[#68738c] dark:text-white/60"><span className="font-semibold">Feeling Occurrences:</span> {entryOccurrences.map((occurrence) => `${occurrence.label} ${occurrence.score} @ ${formatJournalHistoryOccurrenceTime(occurrence.occurredAt)}`).join(" · ")}</p> : null}
                        {entry.reflection ? <JournalHistoryReflection entry={entry} entryValues={entryValues} historyTagOptions={journalHistoryTagOptions} historyTagOptionsByKey={journalHistoryTagOptionsByKey} journalSignalOccurrences={journalSignalOccurrences} onToggleTag={(tag) => toggleJournalHistoryTag(entry.id, tag)} selectedTag={journalHistoryTagOverlay} symptomEntries={symptomEntries} symptoms={symptoms} /> : null}
                        {entry.symptom_tags.length > 0 ? <p className="mt-2 text-xs text-[#7d7598] dark:text-white/50">Legacy tags: {entry.symptom_tags.join(", ")}</p> : null}
                          </div>;
                          })}
                        </div>
                  </section>
                  );
                })}
              </div>
            </div> : null}
            </div>
            </HealthPanel>

          </PageShell>
          <PageShell id="journal-library" label="Journal Library">
            <HealthPanel id="journal-library-section" isOpen={isJournalLibraryOpen} onOpenChange={setIsJournalLibraryOpen} ref={journalLibraryRef} shellSurface tabIndex={-1} icon={<Sparkles />} subtitle={`Journal Library · ${activeSymptoms.length} Symptoms · ${activeJournalSignals.filter((signal) => signal.kind === "emotion").length} Emotions · ${activeJournalSignals.filter((signal) => signal.kind === "other").length} Other Feelings`} title="Manage Journal Library">
              <div className="grid gap-5">
                <JournalSymptomLibrarySection
                  activeSymptoms={activeSymptoms}
                  archiveSymptom={archiveJournalSymptom}
                  editingSymptomId={editingSymptomId}
                  editingSymptomName={editingSymptomName}
                  getJournalSignalForSymptom={getJournalSignalForSymptom}
                  handleRenameSymptom={handleRenameSymptom}
                  handleSetSymptomColor={handleSetSymptomColor}
                  isSymptomCreateOpen={isSymptomCreateOpen}
                  journalLibraryEditDraft={journalLibraryEditDraft}
                  journalLibraryEditId={journalLibraryEditId}
                  journalSignalValues={journalSignalValues}
                  onAddSymptom={openSymptomCreateForm}
                  onCancelCreate={closeSymptomCreateForm}
                  onCancelEdit={() => setJournalLibraryEditId(null)}
                  onChangeCreateName={setSymptomCreateName}
                  onChangeDraft={setJournalLibraryEditDraft}
                  onCreate={() => { void handleCreateSymptom(); }}
                  onEdit={startJournalSignalEdit}
                  onMove={moveJournalSignal}
                  onSaveEdit={saveJournalSignalEdit}
                  onToggleColorPicker={toggleSymptomColorPicker}
                  onToggleTemplate={toggleJournalSymptomTemplate}
                  openSymptomColorPickerKey={openSymptomColorPickerKey}
                  setEditingSymptomId={setEditingSymptomId}
                  setEditingSymptomName={setEditingSymptomName}
                  startJournalSymptomEdit={startJournalSymptomEdit}
                  symptoms={symptoms}
                  symptomCreateName={symptomCreateName}
                  templateSignals={getHealthJournalTemplateSignals(journalSignals, symptoms)}
                />
                <JournalFeelingLibrarySection
                  archiveJournalSignal={archiveJournalFeeling}
                  deleteJournalSignal={deleteJournalSignal}
                  draft={journalLibraryEditDraft}
                  journalLibraryCreateKind={journalLibraryCreateKind}
                  journalLibraryEditId={journalLibraryEditId}
                  journalSignalOccurrences={journalSignalOccurrences}
                  journalSignalValues={journalSignalValues}
                  kind="emotion"
                  moveJournalSignal={moveJournalSignal}
                  onCancelCreate={closeJournalSignalCreateForm}
                  onCancelEdit={() => setJournalLibraryEditId(null)}
                  onChangeCreateInTemplate={setJournalSignalCreateInTemplate}
                  onChangeCreateName={setJournalSignalCreateName}
                  onChangeDraft={setJournalLibraryEditDraft}
                  onCreate={() => { void handleCreateJournalSignal(); }}
                  onEdit={startJournalSignalEdit}
                  onOpenCreate={openJournalSignalCreateForm}
                  onSaveEdit={saveJournalSignalEdit}
                  onSetColor={handleSetJournalSignalColor}
                  onToggleColorPicker={toggleSymptomColorPicker}
                  onToggleTemplate={toggleJournalFeelingTemplate}
                  journalSignalCreateInTemplate={journalSignalCreateInTemplate}
                  journalSignalCreateName={journalSignalCreateName}
                  openColorPickerKey={openSymptomColorPickerKey}
                  signals={journalSignals}
                  symptoms={symptoms}
                />
                <JournalFeelingLibrarySection
                  archiveJournalSignal={archiveJournalFeeling}
                  deleteJournalSignal={deleteJournalSignal}
                  draft={journalLibraryEditDraft}
                  journalLibraryCreateKind={journalLibraryCreateKind}
                  journalLibraryEditId={journalLibraryEditId}
                  journalSignalOccurrences={journalSignalOccurrences}
                  journalSignalValues={journalSignalValues}
                  kind="other"
                  moveJournalSignal={moveJournalSignal}
                  onCancelCreate={closeJournalSignalCreateForm}
                  onCancelEdit={() => setJournalLibraryEditId(null)}
                  onChangeCreateInTemplate={setJournalSignalCreateInTemplate}
                  onChangeCreateName={setJournalSignalCreateName}
                  onChangeDraft={setJournalLibraryEditDraft}
                  onCreate={() => { void handleCreateJournalSignal(); }}
                  onEdit={startJournalSignalEdit}
                  onOpenCreate={openJournalSignalCreateForm}
                  onSaveEdit={saveJournalSignalEdit}
                  onSetColor={handleSetJournalSignalColor}
                  onToggleColorPicker={toggleSymptomColorPicker}
                  onToggleTemplate={toggleJournalFeelingTemplate}
                  journalSignalCreateInTemplate={journalSignalCreateInTemplate}
                  journalSignalCreateName={journalSignalCreateName}
                  openColorPickerKey={openSymptomColorPickerKey}
                  signals={journalSignals}
                  symptoms={symptoms}
                />
              </div>
            </HealthPanel>

          </PageShell>
          <PageShell id="journal-feeling-trends" label="Feeling Trends">
          <HealthPanel className="mt-5 min-w-0" icon={<Activity />} shellSurface subtitle="Feelings" title="Feeling Trends">
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field composite label="Feelings">
                  <FeelingTrendSelector
                    definitions={feelingTrendModel.definitions}
                    disabled={feelingTrendModel.definitions.length === 0}
                    onToggleKeys={(keys) => {
                      setOpenSymptomColorPickerKey(null);
                      setSelectedFeelingTrendDefinitionKeys((current) => toggleHealthFeelingTrendSelection(current, keys));
                    }}
                    selectedKeys={selectedFeelingTrendDefinitionKeys}
                  />
                </Field>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Range</span>
                  <div aria-label="Feeling trend date range" className="mt-2 flex flex-wrap gap-2" role="group">
                    {HEALTH_FEELING_TREND_RANGES.map((range) => (
                      <button
                        aria-pressed={feelingTrendRange === range}
                        className={`ui-chip-button-base transition ${feelingTrendRange === range ? "bg-[#efe9ff] text-[#6f57f6] dark:bg-[#2b214d] dark:text-[#cabfff]" : "bg-[#f4f1ff] text-[#615b9c] dark:bg-white/8 dark:text-white/65"}`}
                        key={range}
                        onClick={() => setFeelingTrendRange(range)}
                        type="button"
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {selectedFeelingTrendDefinitions.length > 0 ? (
                <ActivityLineChartCard
                  activePointContext={`${feelingTrendRange} • occurrence score scale 1–10`}
                  ariaLabel={`${feelingTrendSelectionSummary} occurrence trend line graph`}
                  emptyText={feelingTrendEmptyText}
                  eyebrow="FEELING TRENDS"
                  formatAxisValue={(value) => String(Math.round(value))}
                  formatValue={(value) => `${formatHealthFeelingTrendScore(value)}/10`}
                  compactPlot
                  maxValue={10}
                  series={feelingTrendChartSeries}
                  subtitle={`${feelingTrendRange} • timestamped Feeling Occurrences only`}
                  title={feelingTrendChartTitle}
                  variant="embedded"
                />
              ) : (
                <EmptyCopy
                  text="Select one or more Feelings to see Feeling Trends here."
                />
              )}
            </div>
          </HealthPanel>
          </PageShell>
          </ReorderablePageShells>
        </>
      ) : null}

      {activeTab === "Food" ? (
        <div aria-labelledby="health-tab-food" className="mt-3 min-w-0" id={getHealthTabPanelId("Food")} role="tabpanel">
          <ReorderablePageShells layout={pageShellLayout} shellsClassName="grid min-w-0 gap-5 xl:grid-cols-12">
          <PageShell id="food-meal-log" label="Meal Log">
          <HealthPanel
            className="min-w-0"
            contentTopClassName="pt-1 sm:pt-1"
            headerChevronClassName="-translate-y-0.5"
            headerPaddingClassName="py-2 sm:py-2"
            icon={<Salad />}
            shellSurface
            subtitle="Meal logging"
          >
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{`${foodHistoryDate === today ? "Today’s Meals" : `Meals — ${formatHealthDateLabel(foodHistoryDate)}`} — ${formatHealthNutritionNumber(selectedNutrition.calories)} kcal`}</p>
                <FoodHistoryDateChip allowFuture date={foodHistoryDate} onChange={handleFoodHistoryDateChange} today={today} />
              </div>
              {HEALTH_MEAL_SLOTS.map((slot) => {
                const slotMeals = selectedMeals.filter((entry) => entry.meal_slot === slot);
                  const slotPlans = selectedMealPlans.filter((entry) => entry.meal_slot === slot);
                  const slotCaloriesTotal = slotMeals.reduce((total, entry) => total + getHealthMealNutritionValue(entry, "calories"), 0);
                  const slotPlannedCaloriesTotal = slotPlans.reduce((total, entry) => total + (entry.nutrition_snapshot?.calories ?? entry.calories), 0);
                  return (
                  <section className="grid gap-3" key={slot}>
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-[#4f5872] dark:text-white/70">
                        {getMealSlotLabel(slot)}{slotMeals.length > 0 ? ` — ${formatHealthNutritionNumber(slotCaloriesTotal)} kcal` : ""}
                      </h4>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <button
                          aria-label={`Add food to ${getMealSlotLabel(slot)}`}
                          className="ui-pill-button-light shrink-0 px-2 py-1 text-xs"
                          onClick={() => openMealComposerForSlot(slot)}
                          type="button"
                        >
                          + Add Food
                        </button>
                        <button
                          aria-label={`Plan food for ${getMealSlotLabel(slot)}`}
                          className="ui-pill-button-light shrink-0 px-2 py-1 text-xs"
                          onClick={() => openMealComposerForSlot(slot, "plan")}
                          type="button"
                        >
                          + Plan Food
                        </button>
                      </div>
                    </div>
                    {slotPlans.length > 0 ? (
                      <div className="grid gap-2 rounded-[1.1rem] border border-dashed border-[#d9d2f1] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.025]">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Planned</span>
                          <span className="text-xs font-semibold text-[#74809b] dark:text-white/45">{formatHealthNutritionNumber(slotPlannedCaloriesTotal)} kcal</span>
                        </div>
                        {slotPlans.map((plan) => {
                          const canMarkDone = isHealthMealPlanConfirmEligible(plan);
                          return (
                            <div className="rounded-[1rem] border border-[#e9e4f7] bg-white/80 px-3 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={plan.id}>
                              <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="break-words text-sm font-semibold text-[#26324f] dark:text-white">{formatBrandedFoodName(plan)}</p>
                                  <p className="mt-1 break-words text-xs text-[#74809b] dark:text-white/45">{plan.serving_label || "Planned serving"} · {formatHealthNutritionNumber(plan.nutrition_snapshot?.calories ?? plan.calories)} kcal · {formatPlanTime(plan.planned_date, plan.planned_time)}</p>
                                  <NutritionDetailsDisclosure details={plan.nutrition_snapshot?.nutrition_details} />
                                </div>
                                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                                  <button className="ui-pill-button-strong-light shrink-0 disabled:cursor-not-allowed disabled:opacity-50" disabled={!canMarkDone} onClick={() => { void confirmMealPlanEntry(plan.id); }} title={canMarkDone ? "Mark this planned food Done" : "This planned food cannot be marked Done"} type="button">Done</button>
                                  <button className="ui-pill-button-light shrink-0" onClick={() => startEditingMealPlan(plan)} type="button">Edit</button>
                                  <button className="ui-pill-button-danger-light shrink-0" onClick={() => { void deleteMealPlanEntry(plan.id); }} type="button">Remove</button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    {slotMeals.length === 0 ? (
                      <EmptyCopy text={`No ${getMealSlotLabel(slot).toLowerCase()} logged yet.`} />
                    ) : slotMeals.map((entry) => {
                  const structuredMeal = getStructuredMealDefinition(entry);
                  const editCalculation = editingMealId === entry.id && mealEditDraft.mode === "structured" && structuredMeal
                    ? calculateMealSelection(structuredMeal, parsePositiveQuantity(mealEditDraft.quantity), mealEditDraft.measurement)
                    : null;
                  return (
                  <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={entry.id}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-[#26324f] dark:text-white">{formatBrandedFoodName(entry)}</p>
                        <p className="mt-1 break-words text-xs text-[#74809b] dark:text-white/45">
                          {getHealthMealSummaryParts(entry).map((part, index) => (
                            <span key={part.kind}>
                              {index > 0 ? " / " : null}
                              {part.kind === "calories" ? <strong className="font-semibold text-[#4f5872] dark:text-white/70">{part.text}</strong> : part.text}
                            </span>
                            ))}
                        </p>
                        <NutritionDetailsDisclosure details={entry.nutrition_snapshot?.nutrition_details} />
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <button
                          className="ui-pill-button-light inline-flex shrink-0 items-center gap-1.5"
                          onClick={() => startEditingMeal(entry)}
                          type="button"
                        >
                          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          aria-label={isMealSavedAsFavorite(entry) ? "Saved to favorites" : "Save favorite"}
                          aria-pressed={isMealSavedAsFavorite(entry)}
                          className={`ui-pill-button-light inline-flex shrink-0 items-center gap-1.5 ${isMealSavedAsFavorite(entry) ? "border-[#ffd1dc] bg-[#fff0f4] text-[#d64b6b] dark:border-[#703043] dark:bg-[#341821] dark:text-[#ff9fb5]" : ""}`}
                          onClick={() => { void handleSaveFavoriteFromMeal(entry); }}
                          type="button"
                        >
                          <Heart aria-hidden="true" className="h-4 w-4" fill={isMealSavedAsFavorite(entry) ? "currentColor" : "none"} />
                          <span className="sr-only">Favorite</span>
                        </button>
                        <button className="ui-pill-button-danger-light shrink-0" onClick={() => { void deleteMealEntry(entry.id); }} type="button">
                          Remove
                        </button>
                      </div>
                    </div>
                    {editingMealId === entry.id && structuredMeal ? (
                      <div className="mt-4 grid gap-3 rounded-[1.25rem] border border-[#e8ecfb] bg-[#fbfcff] p-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="grid gap-3 sm:grid-cols-5">
                          <Field label="Amount">
                            <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" onChange={(event) => setMealEditDraft((current) => ({ ...current, quantity: event.target.value }))} value={mealEditDraft.quantity} />
                          </Field>
                          <Field composite label="Measurement">
                            <HealthDropdown
                              ariaLabel="Measurement"
                              onChange={(value) => setMealEditDraft((current) => ({ ...current, measurement: value }))}
                              options={getHealthFoodMeasurementOptions({
                                servingMeasureUnit: structuredMeal.servingMeasureUnit,
                                servingUnit: structuredMeal.servingUnit,
                              })}
                              value={mealEditDraft.measurement}
                            />
                          </Field>
                          <Field label="Date">
                            <HealthMealDateTimeInput onChange={(value) => setMealEditDraft((current) => ({ ...current, date: value }))} type="date" value={mealEditDraft.date} />
                          </Field>
                          <Field label="Time">
                            <HealthMealDateTimeInput onChange={(value) => setMealEditDraft((current) => ({ ...current, time: value }))} type="time" value={mealEditDraft.time} />
                          </Field>
                          <Field composite label="Meal">
                            <HealthDropdown
                              ariaLabel="Meal"
                              onChange={(value) => setMealEditDraft((current) => ({ ...current, mealSlot: value as HealthMealEntry["meal_slot"] }))}
                              options={HEALTH_MEAL_SLOTS.map((slot) => ({ label: getMealSlotLabel(slot), value: slot }))}
                              value={mealEditDraft.mealSlot}
                            />
                          </Field>
                        </div>
                        {isHealthMealTimestampFuture(mealEditDraft.date, mealEditDraft.time) ? <p className="text-xs text-[#a25b50] dark:text-[#ffb3a9]">Choose a past or current meal time.</p> : null}
                        <div aria-live="polite" className="text-sm text-[#5d6783] dark:text-white/65">
                          {editCalculation ? (
                            <>
                              <div className="mb-1">{composeHealthFoodServingDefinition({ ...editCalculation.serving, servingLabel: structuredMeal?.servingLabel })}</div>
                              <div>Nutrition preview: <strong className="text-[#3d4670] dark:text-white">{formatHealthNutritionNumber(editCalculation.nutrientTotals.calories)} kcal</strong> / Protein {formatHealthNutritionNumber(editCalculation.nutrientTotals.protein_g)}g / Carbs {formatHealthNutritionNumber(editCalculation.nutrientTotals.carbs_g)}g / Fat {formatHealthNutritionNumber(editCalculation.nutrientTotals.fat_g)}g</div>
                            </>
                          ) : "Enter a positive amount using one of this food’s supported measurements."}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <button className="ui-pill-button-light inline-flex items-center gap-1.5" onClick={() => setEditingMealId(null)} type="button">
                            <X aria-hidden="true" className="h-3.5 w-3.5" />
                            Cancel
                          </button>
                          <button className="ui-pill-button-strong-light inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60" disabled={!editCalculation} onClick={() => { void saveMealEdit(entry.id); }} type="button">
                            <Check aria-hidden="true" className="h-3.5 w-3.5" />
                            Save
                          </button>
                        </div>
                      </div>
                    ) : editingMealId === entry.id ? (
                      <div className="mt-4 grid gap-3 rounded-[1.25rem] border border-[#e8ecfb] bg-[#fbfcff] p-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="grid gap-3 sm:grid-cols-4">
                          <Field label="Amount">
                            <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" onChange={(event) => setMealEditDraft((current) => ({ ...current, quantity: event.target.value }))} value={mealEditDraft.quantity} />
                          </Field>
                          <Field label="Date">
                            <HealthMealDateTimeInput onChange={(value) => setMealEditDraft((current) => ({ ...current, date: value }))} type="date" value={mealEditDraft.date} />
                          </Field>
                          <Field label="Time">
                            <HealthMealDateTimeInput onChange={(value) => setMealEditDraft((current) => ({ ...current, time: value }))} type="time" value={mealEditDraft.time} />
                          </Field>
                          <Field composite label="Meal">
                            <HealthDropdown
                              ariaLabel="Meal"
                              onChange={(value) => setMealEditDraft((current) => ({ ...current, mealSlot: value as HealthMealEntry["meal_slot"] }))}
                              options={HEALTH_MEAL_SLOTS.map((slot) => ({ label: getMealSlotLabel(slot), value: slot }))}
                              value={mealEditDraft.mealSlot}
                            />
                          </Field>
                        </div>
                        {isHealthMealTimestampFuture(mealEditDraft.date, mealEditDraft.time) ? <p className="text-xs text-[#a25b50] dark:text-[#ffb3a9]">Choose a past or current meal time.</p> : null}
                        <div className="grid gap-3 sm:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
                          <Field label="Serving">
                            <input className="health-input" onChange={(event) => setMealEditDraft((current) => ({ ...current, servingLabel: event.target.value }))} value={mealEditDraft.servingLabel} />
                          </Field>
                          <Field label="Calories">
                            <input className="health-input" inputMode="numeric" onChange={(event) => setMealEditDraft((current) => ({ ...current, calories: event.target.value }))} value={mealEditDraft.calories} />
                          </Field>
                          <Field label="Protein">
                            <input className="health-input" inputMode="decimal" onChange={(event) => setMealEditDraft((current) => ({ ...current, protein: event.target.value }))} value={mealEditDraft.protein} />
                          </Field>
                          <Field label="Carbs">
                            <input className="health-input" inputMode="decimal" onChange={(event) => setMealEditDraft((current) => ({ ...current, carbs: event.target.value }))} value={mealEditDraft.carbs} />
                          </Field>
                          <Field label="Fat">
                            <input className="health-input" inputMode="decimal" onChange={(event) => setMealEditDraft((current) => ({ ...current, fat: event.target.value }))} value={mealEditDraft.fat} />
                          </Field>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <button className="ui-pill-button-light inline-flex items-center gap-1.5" onClick={() => setEditingMealId(null)} type="button">
                            <X aria-hidden="true" className="h-3.5 w-3.5" />
                            Cancel
                          </button>
                          <button className="ui-pill-button-strong-light inline-flex items-center gap-1.5" onClick={() => { void saveMealEdit(entry.id); }} type="button">
                            <Check aria-hidden="true" className="h-3.5 w-3.5" />
                            Save
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  );
                    })}
                    {activeMealEntrySlot === slot ? renderMealEntryEditor() : null}
                  </section>
                  );
                })}
            </div>
          </HealthPanel>

          </PageShell>
          <PageShell id="food-daily-totals" label="Daily Totals">
          <HealthPanel
            headerActions={<FoodHistoryDateChip allowFuture date={foodHistoryDate} onChange={handleFoodHistoryDateChange} today={today} />}
            className="min-w-0"
            icon={<Target />}
            shellSurface
            subtitle="Daily totals"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <CompactStat detail={selectedCalorieTargetDetail} label="Calories" progressPercent={selectedCalorieBudget ? clampPercent((selectedNutrition.calories / selectedCalorieBudget) * 100) : null} value={formatHealthNutritionNumber(selectedNutrition.calories)} />
              <CompactStat detail={profile.protein_goal_grams ? `goal ${profile.protein_goal_grams}g` : "set in goals"} label="Protein" progressPercent={profile.protein_goal_grams ? clampPercent((selectedNutrition.protein / profile.protein_goal_grams) * 100) : null} value={`${formatHealthNutritionNumber(selectedNutrition.protein)}g`} />
              <CompactStat detail={profile.carbs_goal_grams ? `goal ${profile.carbs_goal_grams}g` : "set in goals"} label="Carbs" progressPercent={profile.carbs_goal_grams ? clampPercent((selectedNutrition.carbs / profile.carbs_goal_grams) * 100) : null} value={`${formatHealthNutritionNumber(selectedNutrition.carbs)}g`} />
              <CompactStat detail={profile.fat_goal_grams ? `goal ${profile.fat_goal_grams}g` : "set in goals"} label="Fat" progressPercent={profile.fat_goal_grams ? clampPercent((selectedNutrition.fat / profile.fat_goal_grams) * 100) : null} value={`${formatHealthNutritionNumber(selectedNutrition.fat)}g`} />
            </div>
            <NutritionDetailsDisclosure
              coverage={selectedNutrition.nutrition_coverage}
              details={selectedNutrition.nutrition_details}
              groups={["Nutrition Details", "Other"]}
              title="Additional Nutrition"
            />
            <NutritionDetailsDisclosure
              coverage={selectedNutrition.nutrition_coverage}
              details={selectedNutrition.nutrition_details}
              groups={["Vitamins & Minerals"]}
              title="Vitamins & Minerals"
            />
            {selectedMealPlans.length > 0 ? (
              <div className="mt-4 rounded-[1.1rem] border border-dashed border-[#d9d2f1] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.025]">
                <SectionMiniTitle title="Planned" />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <CompactStat detail="planned foods" label="Calories" progressPercent={null} value={formatHealthNutritionNumber(selectedPlannedNutrition.calories)} />
                  <CompactStat detail="planned foods" label="Protein" progressPercent={null} value={`${formatHealthNutritionNumber(selectedPlannedNutrition.protein)}g`} />
                  <CompactStat detail="planned foods" label="Carbs" progressPercent={null} value={`${formatHealthNutritionNumber(selectedPlannedNutrition.carbs)}g`} />
                  <CompactStat detail="planned foods" label="Fat" progressPercent={null} value={`${formatHealthNutritionNumber(selectedPlannedNutrition.fat)}g`} />
                </div>
                <NutritionDetailsDisclosure
                  coverage={selectedPlannedNutrition.nutrition_coverage}
                  details={selectedPlannedNutrition.nutrition_details}
                  groups={["Nutrition Details", "Other"]}
                  title="Planned Additional Nutrition"
                />
                <NutritionDetailsDisclosure
                  coverage={selectedPlannedNutrition.nutrition_coverage}
                  details={selectedPlannedNutrition.nutrition_details}
                  groups={["Vitamins & Minerals"]}
                  title="Planned Vitamins & Minerals"
                />
              </div>
            ) : null}
            <HealthCalorieLineChart series={dailyCalorieSeries} targetSeries={dailyCalorieTargetSeries} />
          </HealthPanel>

          </PageShell>
          <PageShell id="food-favorites-recent" label="Favorites & Recent Foods">
          <HealthPanel className="min-w-0" icon={<Sparkles />} shellSurface subtitle="Food shortcuts" title="Favorites & Recent Foods">
              <div className="space-y-5">
                <section className="space-y-3" aria-labelledby="health-favorites-heading">
                  <SectionMiniTitle title="Favorites" />
                  <h3 className="sr-only" id="health-favorites-heading">Favorites</h3>
                  {favoriteFoods.length === 0 ? (
                    <EmptyCopy text="Save a meal as a favorite and it will show up here for one-tap reuse." />
                  ) : (
                    favoriteFoods.map((item) => (
                      <div className="min-w-0 rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={item.id}>
                        <div className="flex min-w-0 flex-wrap items-start gap-3">
                          <button
                            aria-controls={`favorite-history-${item.id}`}
                            aria-expanded={expandedFavoriteId === item.id}
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setExpandedFavoriteId((current) => current === item.id ? null : item.id)}
                            type="button"
                          >
                            <p className="break-words text-sm font-semibold text-[#26324f] dark:text-white">{formatBrandedFoodName(item)}</p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-[#74809b] dark:text-white/45">
                              <span>{item.serving_label || "Saved favorite"} / {item.calories} kcal</span>
                              <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 transition-transform ${expandedFavoriteId === item.id ? "rotate-180" : ""}`} />
                            </p>
                          </button>
                          <div className="flex min-w-0 max-w-full flex-wrap justify-end gap-2">
                            <button
                              aria-label={activeMealEntrySlot === null ? "Open a meal first" : `Use in ${getMealSlotLabel(activeMealEntrySlot)}`}
                              className="ui-pill-button-strong-light shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={activeMealEntrySlot === null}
                              onClick={() => handleFavoriteReuse(item)}
                              type="button"
                            >
                              {activeMealEntrySlot === null ? "Open a meal first" : `Use in ${getMealSlotLabel(activeMealEntrySlot)}`}
                            </button>
                            <button className="ui-pill-button-danger-light shrink-0" onClick={() => { void handleRemoveFavorite(item); }} type="button">
                              Remove
                            </button>
                          </div>
                        </div>
                        {expandedFavoriteId === item.id ? (
                          <FavoriteFoodHistoryInlay
                            history={foodLogHistoryIndex.get(getHealthFoodIdentityKey(item) ?? "")}
                            id={`favorite-history-${item.id}`}
                          />
                        ) : null}
                      </div>
                    ))
                  )}
                </section>
                <section className="space-y-3" aria-labelledby="health-recent-foods-heading">
                  <SectionMiniTitle title="Recent Foods" />
                  <h3 className="sr-only" id="health-recent-foods-heading">Recent Foods</h3>
                  {recentFoods.length === 0 ? (
                    <EmptyCopy text="Once you log a few meals, your recent foods will show up here for quick draft-filling." />
                  ) : (
                    recentFoods.map((item) => (
                      <div className="min-w-0 rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={item.id}>
                        <div className="flex min-w-0 flex-wrap items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-semibold text-[#26324f] dark:text-white">{formatBrandedFoodName(item)}</p>
                            <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">
                              {item.brand_name || "No brand"} / {item.serving_label || "Saved meal"} / {item.calories} kcal
                            </p>
                          </div>
                          <button
                            aria-label={activeMealEntrySlot === null ? "Open a meal first" : `Use in ${getMealSlotLabel(activeMealEntrySlot)}`}
                            className="ui-pill-button-strong-light shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={activeMealEntrySlot === null}
                            onClick={() => handleRecentFoodReuse(item)}
                            type="button"
                          >
                            {activeMealEntrySlot === null ? "Open a meal first" : `Use in ${getMealSlotLabel(activeMealEntrySlot)}`}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </section>
              </div>
          </HealthPanel>

          </PageShell>
          <PageShell id="food-library" label="Food Library">
          <HealthLibraryPanel
            deleteFood={deleteFavoriteFood}
            deleteRecipe={deleteRecipe}
            deleteSavedMeal={deleteSavedMeal}
            favorites={favorites}
            recipes={recipes}
            saveFood={saveFavoriteFood}
            saveRecipe={saveRecipe}
            savedMeals={savedMeals}
            saveSavedMeal={saveSavedMeal}
            shellSurface
          />
          </PageShell>

          </ReorderablePageShells>
        </div>
      ) : null}

      {activeTab === "Water" ? (
        <HealthWaterPanel
          addWaterEntry={addWaterEntry}
          confirmWaterEntry={confirmWaterEntry}
          deleteWaterEntry={deleteWaterEntry}
          saveWaterGoal={(waterGoalMl) => saveProfile({ water_goal_ml: waterGoalMl })}
          today={today}
          updateWaterEntry={updateWaterEntry}
          waterGoalMl={profile.water_goal_ml}
          waterEntries={waterEntries}
          layout={pageShellLayout}
        />
      ) : null}

      {activeTab === "Weight" ? (
        <div aria-labelledby="health-tab-weight" className="mt-6 min-w-0" id={getHealthTabPanelId("Weight")} role="tabpanel">
          <ReorderablePageShells layout={pageShellLayout} shellsClassName="grid gap-5 xl:grid-cols-12">
          <PageShell id="weight-entry" label="Weigh-in">
          <HealthPanel icon={<Scale />} shellSurface subtitle="Weigh-in" title="Track trend, not perfection">
            <div className="grid gap-4 sm:grid-cols-[0.8fr_1.2fr]">
              <Field label={`Weight (${profile.preferred_weight_unit})`}>
                <input className="health-input" inputMode="decimal" onChange={(event) => setWeightDraft(event.target.value)} placeholder={profile.preferred_weight_unit === "kg" ? "78.2" : "172.4"} value={weightDraft} />
              </Field>
              <Field label="Note">
                <input className="health-input" onChange={(event) => setWeightNote(event.target.value)} placeholder="Optional context" value={weightNote} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button className="ui-pill-button-strong-light disabled:cursor-not-allowed disabled:opacity-60" disabled={!canSaveWeight} onClick={() => { void handleSaveWeight(); }} type="button">
                Save Weight
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <CompactStat detail="latest entry" label="Current" value={latestWeight ? formatWeight(latestWeight.weight_kg, profile.preferred_weight_unit) : "None"} />
              <CompactStat detail="profile target" label="Target" value={formatWeight(profile.target_weight_kg, profile.preferred_weight_unit)} />
              <CompactStat
                detail="current vs target"
                label="Difference"
                value={latestWeight && profile.target_weight_kg !== null ? `${(kilogramsToDisplayValue(latestWeight.weight_kg - profile.target_weight_kg, profile.preferred_weight_unit)).toFixed(1)} ${profile.preferred_weight_unit}` : "N/A"}
              />
            </div>
          </HealthPanel>
          </PageShell>

          <PageShell id="weight-trend" label="Recent Trend">
          <HealthPanel icon={<Activity />} shellSurface subtitle="30 days" title="Recent trend">
            <div className="space-y-3">
              {weightTrend30.length === 0 ? (
                <EmptyCopy text="Your trend will appear once you log a weight entry." />
              ) : (
                weightTrend30.slice(-10).reverse().map((entry, index, items) => {
                  const displayValue = kilogramsToDisplayValue(entry.weight_kg, profile.preferred_weight_unit);
                  const maxValue = Math.max(...items.map((item) => kilogramsToDisplayValue(item.weight_kg, profile.preferred_weight_unit)));
                  return (
                    <div className="grid gap-1" key={entry.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthDateLabel(entry.entry_date)}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[#77849f] dark:text-white/50">{displayValue.toFixed(1)} {profile.preferred_weight_unit}</span>
                          <button className="ui-pill-button-danger-light" onClick={() => { void deleteWeightEntry(entry.id); }} type="button">
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#edf0fb] dark:bg-white/8">
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,#7bb8ff,#5f79ff)]" style={{ width: `${maxValue > 0 ? (displayValue / maxValue) * 100 : 0}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </HealthPanel>
          </PageShell>
          </ReorderablePageShells>
        </div>
      ) : null}

      {activeTab === "Sleep" ? (
        <div aria-labelledby="health-tab-sleep" className="mt-6 min-w-0" id={getHealthTabPanelId("Sleep")} role="tabpanel">
          <ReorderablePageShells layout={pageShellLayout} shellsClassName="grid gap-5 xl:grid-cols-12">
          <PageShell id="sleep-ledger" label="Health Sleep Totals">
          <HealthPanel
            collapseAfterHeaderActions
            headerActions={<FoodHistoryDateChip ariaLabel="Sleep ledger date" date={sleepLedgerDate} dayStepper today={today} onChange={setSleepLedgerDate} />}
            icon={<MoonStar />}
            shellSurface
            subtitle="Sleep ledger"
            title="Health sleep totals"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <CompactStat detail={formatHealthDateLabel(sleepLedgerDate)} label="Total" value={formatHealthSleepDuration(selectedSleepTotal.totalMinutes)} />
              <CompactStat detail={profile.sleep_goal_minutes ? `goal ${formatHealthSleepDuration(profile.sleep_goal_minutes)}` : "set in goals"} label="Goal" value={`${selectedSleepPercent}%`} />
              <CompactStat detail={formatHealthDateLabel(sleepLedgerDate)} label="Focus Clock" value={formatHealthSleepDuration(selectedSleepTotal.focusMinutes)} />
              <CompactStat detail={formatHealthDateLabel(sleepLedgerDate)} label="Imported" value={formatHealthSleepDuration(selectedSleepTotal.importedMinutes)} />
            </div>
            <HealthSleepLineChart series={sleepActivitySeries} sleepGoalMinutes={profile.sleep_goal_minutes} />
            <div className="mt-4 rounded-[1.25rem] border border-[#e6ebfb] bg-white/80 px-4 py-4 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#26324f] dark:text-white">Sleep Focus Clock</p>
                  <p className="mt-1 text-xs leading-5 text-[#73809c] dark:text-white/50">
                    {sleepCategory ? "The Focus Sleep runtime stays authoritative while you remain on Health." : "Create a Sleep Focus category to enable the clock."}
                  </p>
                </div>
                <div className="flex shrink-0 flex-nowrap items-center gap-2">
                  <span className="text-3xl font-black tabular-nums text-[#26324f] dark:text-white">{formatSleepClock(sleepClockSeconds)}</span>
                  <button className="ui-pill-button-strong-light shrink-0" onClick={onToggleSleepClock} type="button">
                    {!sleepActiveSession ? "Start Sleep" : sleepActiveSession.isRunning ? "Pause" : "Resume"}
                  </button>
                  {sleepActiveSession ? (
                    <button className="ui-pill-button-light shrink-0" onClick={() => onFinishSleepClock(sleepKind)} type="button">Finish</button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4"><SleepKindSelector onChange={setSleepKind} value={sleepKind} /></div>
            </div>
          </HealthPanel>

          </PageShell>

          <PageShell id="sleep-entry-and-sources" label="Sleep Entry and Sources">
          <PageShellSurface>
          <PageShellBody className="grid content-start gap-5">
          <HealthPanel icon={<MoonStar />} subtitle="Manual entry" title="Log sleep">
            <SleepKindSelector onChange={(kind) => setManualSleepDraft((current) => ({ ...current, kind }))} value={manualSleepDraft.kind} />
            <SleepDraftFields draft={manualSleepDraft} onChange={(next) => setManualSleepDraft(next)} />
            {sleepFormError ? <p className="mt-3 text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]">{sleepFormError}</p> : null}
            <div className="mt-4 flex justify-end">
              <button className="ui-pill-button-strong-light" onClick={() => { void handleSaveManualSleep(); }} type="button">Log Sleep</button>
            </div>
          </HealthPanel>

          <HealthPanel className="xl:order-2" icon={<Activity />} subtitle="Last 7 days" title="Sleep sources">
            <div className="grid gap-3 sm:grid-cols-3">
              <CompactStat detail="combined week" label="Total" value={formatHealthSleepDuration(recentSleepTotalMinutes)} />
              <CompactStat detail="Sleep Focus timers" label="Clock" value={formatHealthSleepDuration(recentSleepFocusMinutes)} />
              <CompactStat detail="Apple Health" label="Imported" value={formatHealthSleepDuration(recentSleepImportedMinutes)} />
            </div>
            <div className="mt-4 space-y-3">
              {recentSleepTotals.map((entry) => (
                <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={entry.date}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthDateLabel(entry.date)}</span>
                    <span className="text-xs font-semibold text-[#74809b] dark:text-white/45">{formatHealthSleepDuration(entry.totalMinutes)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#6a7793] dark:text-white/55">
                    <MetricPill icon={<MoonStar className="h-3.5 w-3.5" />} label={`${formatHealthSleepDuration(entry.focusMinutes)} clock`} />
                    <MetricPill icon={<Apple className="h-3.5 w-3.5" />} label={`${formatHealthSleepDuration(entry.importedMinutes)} import`} />
                  </div>
                </div>
              ))}
            </div>
          </HealthPanel>

          <HealthPanel className="xl:order-1" icon={<Sparkles />} subtitle="Selected date" title="Sleep Ledger">
            <div className="space-y-3">
              {selectedSleepFocusSessions.length === 0 ? (
                <EmptyCopy text={`No Sleep Focus sessions logged for ${formatHealthDateLabel(sleepLedgerDate)}.`} />
              ) : (
                selectedSleepFocusSessions.map((session) => (
                  <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={session.id}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <AdhdChip tone="purple">{resolveHealthSleepKind(session, session.categoryId ? focusCategories.find((category) => category.id === session.categoryId) : null)}</AdhdChip>
                          <span className="text-xs text-[#74809b] dark:text-white/45">{formatHealthDateLabel(session.date)}</span>
                          <span className="text-xs text-[#74809b] dark:text-white/45">{formatHealthSleepStartTime(session)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthSleepDuration(session.durationSeconds / 60)}</span>
                        <button className="ui-pill-button-light shrink-0" onClick={() => openSleepEdit(session)} type="button">Edit</button>
                      </div>
                    </div>
                    {editingSleepId === session.id && sleepEditDraft ? (
                      <div className="mt-3 border-t border-[#edf0fb] pt-3 dark:border-white/10">
                        <SleepKindSelector onChange={(kind) => setSleepEditDraft((current) => current ? { ...current, kind } : current)} value={sleepEditDraft.kind} />
                        <SleepDraftFields draft={sleepEditDraft} onChange={(next) => setSleepEditDraft(next)} />
                        {sleepFormError ? <p className="mt-3 text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]">{sleepFormError}</p> : null}
                        <div className="mt-3 flex justify-end gap-2">
                          <button className="ui-pill-button-light" onClick={() => { setEditingSleepId(null); setSleepEditDraft(null); }} type="button">Cancel</button>
                          <button className="ui-pill-button-strong-light" onClick={() => { void handleSaveSleepEdit(); }} type="button">Save</button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </HealthPanel>
          </PageShellBody>
          </PageShellSurface>
          </PageShell>
          </ReorderablePageShells>
        </div>
      ) : null}

      {activeTab === "Insights" ? (
        <div aria-labelledby="health-tab-insights" className="mt-6 min-w-0" id={getHealthTabPanelId("Insights")} role="tabpanel">
          <ReorderablePageShells layout={pageShellLayout} shellsClassName="grid gap-5 xl:grid-cols-12">
          <PageShell id="insights-import" label="Apple Health Import">
          <HealthPanel icon={<Apple />} shellSurface subtitle="Import pathway" title="Apple Health groundwork">
            <div className="rounded-[1.5rem] border border-dashed border-[#d6def4] bg-[#fbfcff] p-5 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-sm font-semibold text-[#22304b] dark:text-white">Upload an Apple Health export to preview what Health can import.</p>
              <p className="mt-2 text-sm leading-6 text-[#67728f] dark:text-white/60">
                Supported today: body mass, steps, active energy, workouts, and sleep duration. Raw files stay local to parsing; only normalized health entries and the import audit are saved.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="Apple export file">
                  <input
                    accept=".xml,.zip,text/xml,application/zip"
                    aria-describedby="apple-health-import-help"
                    className="health-input"
                    onChange={(event) => {
                      void handleAppleFilePicked(event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </Field>
                <button
                  className="rounded-full bg-[#eef3ff] px-4 py-2 text-sm font-semibold text-[#4e5ec8] dark:bg-[#1d2342] dark:text-[#c4d1ff]"
                  onClick={resetImportPreviewState}
                  type="button"
                >
                  {isParsingImport ? "Cancel Parse" : "Reset Import"}
                </button>
              </div>
              <p className="sr-only" id="apple-health-import-help">
                Upload an Apple Health export as xml or zip to preview supported records before saving them.
              </p>
            </div>
            {isParsingImport || importParseStatus !== DEFAULT_IMPORT_STATUS ? <div className="mt-4"><InlineNotice text={importParseStatus} /></div> : null}
            {importError ? <div className="mt-4"><EmptyCopy text={importError} /></div> : null}
            {importPreview ? (
              <div className="mt-4 rounded-[1.5rem] border border-[#e6ebfb] bg-white/85 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#22304b] dark:text-white">{importPreview.fileName}</p>
                    <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">
                      {importPreview.startDate ? formatHealthDateLabel(importPreview.startDate) : "Unknown start"} to {importPreview.endDate ? formatHealthDateLabel(importPreview.endDate) : "Unknown end"}
                    </p>
                  </div>
                  <button
                    className="shrink-0 rounded-full bg-[#6f57f6] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#cabfff] dark:text-[#1a1431]"
                    disabled={isSavingImport || importNewMetricCount === 0}
                    onClick={() => { void handleSaveImport(); }}
                    type="button"
                  >
                    {isSavingImport ? "Saving..." : "Save Import"}
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <CompactStat detail="supported observations" label="Samples" value={String(importPreview.sampleCount)} />
                  <CompactStat detail="ready to save" label="New Metrics" value={String(importNewMetricCount)} />
                  <CompactStat detail="already imported" label="Duplicates" value={String(importDuplicateCount)} />
                  <CompactStat detail="daily normalized rows" label="Metrics" value={String(importPreview.metricEntries.length)} />
                  <CompactStat detail="weight entries" label="Weigh-ins" value={String(importPreview.weightEntries.length)} />
                  <CompactStat detail="unsupported types" label="Unsupported" value={String(importPreview.unsupportedCount)} />
                  <CompactStat detail="missing or invalid rows" label="Malformed" value={String(importPreview.malformedCount)} />
                  <CompactStat detail="ignored rows" label="Skipped" value={String(importPreview.skippedCount)} />
                </div>
                {importNewMetricCount === 0 ? <div className="mt-4"><EmptyCopy text="Everything in this preview already appears to be imported, so there is nothing new to save." /></div> : null}
                {isSavingImport ? <div className="mt-4"><InlineNotice text={importSaveStatus || "Saving Apple Health import..."} /></div> : null}
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <CompactStat detail="today" label="Sleep" value={`${Math.round(todaySleep)}m`} />
              <CompactStat detail="today" label="Movement" value={`${Math.round(todayMovement)}`} />
              <CompactStat detail="imports logged" label="Runs" value={String(importAudits.length)} />
            </div>
          </HealthPanel>

          </PageShell>
          <PageShell id="insights-trends" label="Imported Trends">
          <HealthPanel icon={<MoonStar />} shellSurface subtitle="Imported trends" title="What will appear here">
            <div className="space-y-3">
              {metricEntries.length === 0 ? (
                <EmptyCopy text="Imported sleep, activity, energy, and Apple Health weight data will show up here when the import flow lands." />
              ) : (
                recentWeekDates.map((dateKey) => (
                  <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={dateKey}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthDateLabel(dateKey)}</span>
                      <span className="text-xs text-[#74809b] dark:text-white/45">Imported from Apple Health</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#6a7793] dark:text-white/55">
                      <MetricPill icon={<MoonStar className="h-3.5 w-3.5" />} label={`${Math.round(sumMetricValueForDate(metricEntries, dateKey, ["sleep_minutes"]))} min sleep`} />
                      <MetricPill icon={<Activity className="h-3.5 w-3.5" />} label={`${Math.round(sumMetricValueForDate(metricEntries, dateKey, ["steps", "active_energy_kcal", "exercise_minutes"]))} movement`} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </HealthPanel>
          </PageShell>
          </ReorderablePageShells>
        </div>
      ) : null}

      {activeTab === "Awards" ? (
        <div aria-labelledby="health-tab-awards" className="mt-6" id={getHealthTabPanelId("Awards")} role="tabpanel">
          <ReorderablePageShells layout={pageShellLayout}>
          <PageShell id="awards-content" label="Awards">
          <HealthPanel icon={<Trophy />} subtitle="Awards" title="Under construction">
            <EmptyCopy text="This tab is under construction." />
          </HealthPanel>
          </PageShell>
          </ReorderablePageShells>
        </div>
      ) : null}

      {activeTab === "Settings" ? (
        <div aria-labelledby="health-tab-settings" className="mt-6" id={getHealthTabPanelId("Settings")} role="tabpanel">
          <ReorderablePageShells layout={pageShellLayout}>
          <PageShell id="settings-content" label="Health Settings">
          <HealthPanel icon={<Target />} subtitle="Health settings">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Weight unit">
              <select className="health-input" onChange={(event) => handleWeightUnitChange(event.target.value as HealthProfile["preferred_weight_unit"])} value={profileDraft.preferred_weight_unit ?? profile.preferred_weight_unit}>
                <option value="lb">Pounds</option>
                <option value="kg">Kilograms</option>
              </select>
            </Field>
            <Field label="Calorie goal">
              <input className="health-input" inputMode="numeric" onChange={(event) => setProfileDraft((current) => ({ ...current, calorie_goal: event.target.value as unknown as number }))} value={String(profileDraft.calorie_goal ?? "")} />
            </Field>
            <Field label="Protein goal (g)">
              <input className="health-input" inputMode="numeric" onChange={(event) => setProfileDraft((current) => ({ ...current, protein_goal_grams: event.target.value as unknown as number }))} value={String(profileDraft.protein_goal_grams ?? "")} />
            </Field>
            <Field label="Carbs goal (g)">
              <input className="health-input" inputMode="numeric" onChange={(event) => setProfileDraft((current) => ({ ...current, carbs_goal_grams: event.target.value as unknown as number }))} value={String(profileDraft.carbs_goal_grams ?? "")} />
            </Field>
            <Field label="Fat goal (g)">
              <input className="health-input" inputMode="numeric" onChange={(event) => setProfileDraft((current) => ({ ...current, fat_goal_grams: event.target.value as unknown as number }))} value={String(profileDraft.fat_goal_grams ?? "")} />
            </Field>
            <Field label="Move goal (kcal)">
              <input className="health-input" inputMode="numeric" onChange={(event) => setProfileDraft((current) => ({ ...current, movement_goal_calories: event.target.value as unknown as number }))} value={String(profileDraft.movement_goal_calories ?? "")} />
            </Field>
            <Field label="Move goal (min)">
              <input className="health-input" inputMode="numeric" onChange={(event) => setProfileDraft((current) => ({ ...current, movement_goal_minutes: event.target.value as unknown as number }))} value={String(profileDraft.movement_goal_minutes ?? "")} />
            </Field>
            <Field label="Sleep goal">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Hours</span>
                  <input className="health-input" inputMode="numeric" onChange={(event) => handleSleepGoalHoursChange(event.target.value)} value={sleepGoalHours} />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Minutes</span>
                  <input className="health-input" inputMode="numeric" max={59} onChange={(event) => handleSleepGoalMinutesChange(event.target.value)} value={sleepGoalRemainingMinutes} />
                </label>
              </div>
            </Field>
            <Field label={`Target weight (${profileDraft.preferred_weight_unit ?? profile.preferred_weight_unit})`}>
              <input
                className="health-input"
                inputMode="decimal"
                onChange={(event) => setTargetWeightDraft(event.target.value)}
                value={targetWeightDraft}
              />
            </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button className="ui-pill-button-strong-light" onClick={() => { void handleSaveProfile(); }} type="button">
                Save Goals
              </button>
            </div>
            <WeightForecastCard forecast={weightForecast} unit={profileDraft.preferred_weight_unit ?? profile.preferred_weight_unit} />
          </HealthPanel>
          </PageShell>
          </ReorderablePageShells>
        </div>
      ) : null}
    </section>
  );
}

function HealthPanel({
  "aria-labelledby": ariaLabelledBy,
  className,
  collapseAfterHeaderActions = false,
  children,
  contentTopClassName = "pt-3 sm:pt-4",
  headerChevronClassName = "",
  headerPaddingClassName = "py-4 sm:py-5",
  headerActions,
  icon,
  id,
  ref,
  role,
  shellSurface = false,
  subtitle,
  tabIndex,
  title,
  isOpen: controlledIsOpen,
  onOpenChange,
}: {
  "aria-labelledby"?: string;
  className?: string;
  collapseAfterHeaderActions?: boolean;
  children: ReactNode;
  contentTopClassName?: string;
  headerChevronClassName?: string;
  headerPaddingClassName?: string;
  headerActions?: ReactNode;
  icon: ReactNode;
  id?: string;
  ref?: Ref<HTMLDivElement>;
  role?: string;
  shellSurface?: boolean;
  subtitle: string;
  tabIndex?: number;
  title?: string;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(true);
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const toggleOpen = () => {
    const nextIsOpen = !isOpen;
    onOpenChange?.(nextIsOpen);
    if (controlledIsOpen === undefined) setInternalIsOpen(nextIsOpen);
  };
  const collapseButtonChevronClassName = [
    "h-4 w-4 transition-transform",
    headerChevronClassName,
    isOpen ? "rotate-180" : "",
  ].filter(Boolean).join(" ");
  const inlineCollapseChevronClassName = [
    "h-4 w-4 shrink-0 text-[#8d87a7] transition-transform dark:text-white/45",
    headerChevronClassName,
    isOpen ? "rotate-180" : "",
  ].filter(Boolean).join(" ");
  const panelTitle = (
    <span className="flex min-w-0 items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[#6f57f6] dark:text-[#cabfff] [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </span>
      <span>
        <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{subtitle}</span>
        {title ? <span className="mt-1 block text-xl font-black text-[#1e2744] dark:text-white">{title}</span> : null}
      </span>
    </span>
  );
  const collapseButton = (
    <button
      aria-expanded={isOpen}
      aria-label={`${isOpen ? "Collapse" : "Expand"} ${title ?? subtitle}`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#8d87a7] transition hover:bg-[#f7f3ff] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:text-white/45 dark:hover:bg-white/[0.08] dark:hover:text-[#cabfff]"
      onClick={toggleOpen}
      type="button"
    >
      <ChevronDown
        aria-hidden="true"
        className={collapseButtonChevronClassName}
      />
    </button>
  );

  return (
    <div className={[
      "rounded-[2rem] border border-[#ece8f8] bg-white/85 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]",
      shellSurface ? "page-shell-surface flex h-full min-h-0 min-w-0 flex-col overflow-hidden" : "",
      className,
    ].filter(Boolean).join(" ")} aria-labelledby={ariaLabelledBy} id={id} ref={ref} role={role} tabIndex={tabIndex}>
      <div className={["flex min-w-0 items-center gap-2 px-3 sm:px-5", shellSurface ? "shrink-0" : "", headerPaddingClassName].filter(Boolean).join(" ")}>
        {collapseAfterHeaderActions ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              aria-expanded={isOpen}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={toggleOpen}
              type="button"
            >
              {panelTitle}
            </button>
            {headerActions}
          </div>
        ) : (
          <button
            aria-expanded={isOpen}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
            onClick={toggleOpen}
            type="button"
          >
            {panelTitle}
            <ChevronDown
              aria-hidden="true"
              className={inlineCollapseChevronClassName}
            />
          </button>
        )}
        {collapseAfterHeaderActions ? collapseButton : headerActions}
      </div>
      {isOpen ? shellSurface ? <PageShellBody className={`px-3 pb-4 sm:px-5 sm:pb-5 ${contentTopClassName}`}>{children}</PageShellBody> : <div className={`px-3 pb-4 sm:px-5 sm:pb-5 ${contentTopClassName}`}>{children}</div> : null}
    </div>
  );
}

function CompactStat({ detail, label, progressPercent, value }: { detail: string; label: string; progressPercent: number | null; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{label}</p>
        <p className="mt-1 text-2xl font-black text-[#1e2744] dark:text-white">{value}</p>
        <p className="mt-1 text-xs text-[#73809c] dark:text-white/50">{detail}</p>
      </div>
      {progressPercent === null ? null : (
        <div aria-label={`${label} ${Math.round(progressPercent)}% of goal`} className="w-20 shrink-0 rounded-full bg-[#ece8f8] p-1 dark:bg-white/10">
          <div className="h-2 rounded-full bg-[#6f57f6] transition-[width]" style={{ width: `${progressPercent}%` }} />
        </div>
      )}
    </div>
  );
}

function MetricPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-[#f4f6fc] px-3 py-1.5 dark:bg-white/8">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function formatSleepClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatHealthSleepStartTime(session: HistoricalFocusSession) {
  const startTimestamp = getHealthSleepStartTimestamp(session);
  if (!startTimestamp) return "Time unavailable";
  const startDate = new Date(startTimestamp);
  return Number.isFinite(startDate.getTime())
    ? startDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "Time unavailable";
}

function SleepKindSelector({ onChange, value }: { onChange: (kind: HealthSleepKind) => void; value: HealthSleepKind }) {
  return (
    <div aria-label="Sleep Type" className="flex flex-wrap gap-2">
      {HEALTH_SLEEP_KINDS.map((kind) => (
        <AdhdChip key={kind} onClick={() => onChange(kind)} selected={kind === value} type="button">{kind}</AdhdChip>
      ))}
    </div>
  );
}

function SleepDraftFields({ draft, onChange }: { draft: SleepDraft; onChange: (draft: SleepDraft) => void }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="space-y-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Date</span>
        <input aria-label="Sleep date" className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChange({ ...draft, date: event.target.value })} type="date" value={draft.date} />
      </label>
      <label className="space-y-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Start Time</span>
        <input aria-label="Sleep start time" className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChange({ ...draft, time: event.target.value })} type="time" value={draft.time} />
      </label>
      <label className="space-y-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Duration hours</span>
        <input aria-label="Sleep duration hours" className={HEALTH_COMPACT_INPUT_CLASS} min={0} onChange={(event) => onChange({ ...draft, hours: event.target.value })} type="number" value={draft.hours} />
      </label>
      <label className="space-y-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Duration minutes</span>
        <input aria-label="Sleep duration minutes" className={HEALTH_COMPACT_INPUT_CLASS} max={59} min={0} onChange={(event) => onChange({ ...draft, minutes: event.target.value })} type="number" value={draft.minutes} />
      </label>
    </div>
  );
}

function JournalRatingCard({
  expanded,
  expandedScaleKey,
  label,
  onClear,
  onSelect,
  onToggle,
  removeAction,
  scaleLabelIndexOffset,
  scaleLabels,
  scoreOptions,
  value,
}: {
  expanded: boolean;
  expandedScaleKey: string;
  label: string;
  onClear: () => void;
  onSelect: (value: number) => void;
  onToggle: () => void;
  removeAction?: ReactNode;
  scaleLabelIndexOffset: number;
  scaleLabels: readonly string[];
  scoreOptions: readonly number[];
  value: number | null;
}) {
  const firstScore = scoreOptions[0];
  const lastScore = scoreOptions[scoreOptions.length - 1];
  const scaleDescription = `${scaleLabels[0] ?? ""} · ${scaleLabels[scaleLabels.length - 1] ?? ""} · ${firstScore}–${lastScore}`;
  const getScoreLabel = (score: number) => scaleLabels[score + scaleLabelIndexOffset] ?? "";
  const renderScoreOption = (score: number) => <button aria-label={`${label} ${score}, ${getScoreLabel(score)}`} aria-pressed={value === score} className={`flex min-h-9 min-w-0 items-start justify-start gap-2 rounded-[0.7rem] px-2 py-2 text-left text-xs font-semibold ${value === score ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]" : "bg-[#f4f1ff] text-[#615b9c] dark:bg-white/8 dark:text-white/65"}`} key={score} onClick={() => onSelect(score)} type="button"><span className="shrink-0 font-black">{score}</span><span className="min-w-0 flex-1 break-words whitespace-normal">{getScoreLabel(score)}</span></button>;
  return (
    <div className="grid min-w-0 gap-2 rounded-[1rem] border border-[#edf0fb] bg-white/70 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#26324f] dark:text-white">{label}</p>
          <p className="text-[11px] text-[#7d88a3] dark:text-white/45">{scaleDescription}</p>
        </div>
        {removeAction ? <div className="flex flex-wrap gap-2">{removeAction}</div> : null}
      </div>
      <button aria-controls={expandedScaleKey} aria-expanded={expanded} className="flex min-h-10 items-center justify-between gap-3 rounded-[0.8rem] px-1 py-1 text-left" onClick={onToggle} type="button">
        <span className="min-w-0 flex-1 break-words whitespace-normal text-sm font-semibold text-[#4f5a76] dark:text-white/70">{value === null ? "Not logged" : `${value} · ${getScoreLabel(value)}`}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-[#8d87a7] transition-transform dark:text-white/45 ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded ? <div className="grid gap-2 rounded-[0.9rem] border border-[#eeeaf8] bg-[#fbfaff] p-2 dark:border-white/10 dark:bg-white/[0.03]" id={expandedScaleKey}>
        {firstScore === 0 ? <div className="grid gap-1.5"><div>{renderScoreOption(0)}</div><div className="grid grid-cols-2 gap-1.5">{scoreOptions.slice(1).map(renderScoreOption)}</div></div> : <div className="grid grid-cols-2 gap-1.5">{scoreOptions.map(renderScoreOption)}</div>}
        <button aria-label={`Clear ${label} score`} className="justify-self-start text-xs font-semibold text-[#7569a8] underline-offset-2 hover:underline dark:text-[#c4baff]" onClick={onClear} type="button">Not logged</button>
      </div> : null}
    </div>
  );
}

function FavoriteFoodHistoryInlay({
  history,
  id,
}: {
  history: HealthFoodLogHistory | undefined;
  id: string;
}) {
  const latestEntry = history?.entries[0];
  const latestDate = latestEntry
    ? `${formatHealthDateLabel(latestEntry.entry_date)}${formatMealLoggedTime(latestEntry.logged_at) ? ` · ${formatMealLoggedTime(latestEntry.logged_at)}` : ""}`
    : null;

  return (
    <div className="mt-3 grid gap-3 rounded-[1rem] border border-[#eeeaf8] bg-[#fbfaff] px-3 py-3 text-xs dark:border-white/10 dark:bg-white/[0.03]" id={id}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[#68738c] dark:text-white/60">
        <span className="font-semibold">Lifetime logs: {history?.count ?? 0}</span>
        <span>Last logged: {latestDate ?? "Never logged"}</span>
      </div>
      {history?.entries.length ? (
        <div className="grid gap-2">
          {history.entries.slice(0, 5).map((entry) => {
            const loggedTime = formatMealLoggedTime(entry.logged_at);
            return (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-[#eeeaf8] pt-2 first:border-t-0 first:pt-0 dark:border-white/10" key={entry.id}>
                <div className="min-w-0">
                  <p className="font-medium text-[#5d6783] dark:text-white/70">{formatHealthDateLabel(entry.entry_date)}{loggedTime ? ` · ${loggedTime}` : ""}</p>
                  <p className="mt-0.5 text-[#7d7598] dark:text-white/50">{getMealSlotLabel(entry.meal_slot)} · {formatFavoriteMealServing(entry)}</p>
                </div>
                <span className="shrink-0 font-semibold text-[#4f5872] dark:text-white/70">{formatHealthNutritionNumber(entry.calories)} kcal</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[#7d7598] dark:text-white/50">No logged meals yet.</p>
      )}
    </div>
  );
}

function formatFavoriteMealServing(entry: HealthMealEntry) {
  if (
    typeof entry.consumed_quantity === "number"
    && Number.isFinite(entry.consumed_quantity)
    && entry.consumed_quantity > 0
    && entry.consumed_unit?.trim()
  ) {
    return formatHealthFoodQuantityUnit(entry.consumed_quantity, entry.consumed_unit);
  }
  return entry.serving_label?.trim() || "No serving";
}

function Field({
  composite = false,
  children,
  label,
}: {
  composite?: boolean;
  children: ReactNode;
  label: string;
}) {
  const content = (
    <>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{label}</span>
      {children}
    </>
  );
  return composite ? <div className="grid gap-2">{content}</div> : <label className="grid gap-2">{content}</label>;
}

function HealthMealDateTimeInput({
  ariaLabel,
  className,
  inputRef,
  max,
  onChange,
  type,
  value,
}: {
  ariaLabel?: string;
  className?: string;
  inputRef?: { current: HTMLInputElement | null };
  max?: string;
  onChange: (value: string) => void;
  type: "date" | "time";
  value: string;
}) {
  return (
    <div className={`${HEALTH_COMPACT_CONTROL_CLASS} flex min-w-0 max-w-full items-center max-sm:!h-[32px] max-sm:!min-h-[32px] ${className ?? ""}`}>
      <input
        aria-label={ariaLabel}
        className="block min-w-0 w-full max-w-full box-border border-0 bg-transparent p-0 text-[13px] leading-normal text-[#2f294a] outline-none dark:text-white max-sm:!text-[16px] max-sm:!leading-normal"
        max={max}
        onChange={(event) => onChange(event.target.value)}
        ref={inputRef}
        type={type}
        value={type === "time" ? normalizeHealthMealTime(value) ?? "" : value}
      />
    </div>
  );
}

function SectionMiniTitle({ actions, title }: { actions?: ReactNode; title: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{title}</p>
      {actions}
    </div>
  );
}

function FoodHistoryDateChip({
  ariaLabel = "Food history date",
  allowFuture = false,
  date,
  dayStepper = false,
  onChange,
  today,
  }: {
  allowFuture?: boolean;
  ariaLabel?: string;
  date: string;
  dayStepper?: boolean;
  onChange: (date: string) => void;
  today: string;
}) {
  const dateInput = (
    <label className="relative inline-flex items-center">
      <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-[#6f57f6]" />
      <input
        aria-label={ariaLabel}
        className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_LIST_CHIP_CLASS} h-[26px] min-h-[26px] min-w-[9.5rem] pl-7 text-[13px] leading-none`}
        max={allowFuture ? undefined : today}
        onChange={(event) => onChange(event.target.value || today)}
        type="date"
        value={date}
      />
    </label>
  );
  const todayButton = (
    <AdhdChip
      aria-hidden={dayStepper && date === today}
      className={`!h-[26px] ${dayStepper && date === today ? "invisible" : ""}`}
      onClick={() => onChange(today)}
    >
      Today
    </AdhdChip>
  );
  const daySteppers = (
    <span className="flex h-[26px] flex-col justify-center gap-px" aria-label="Sleep date navigation">
      <AdhdIconButton
        aria-label="Next sleep date"
        className="!h-3 !w-5 !rounded-[3px] !border-transparent !bg-transparent !p-0 text-[#7b6bc8] hover:!bg-[#f3efff] dark:text-[#c1b5ff] dark:hover:!bg-white/[0.08]"
        disabled={date >= today}
        iconClassName="!h-3 !w-3"
        onClick={() => {
          const nextDate = shiftHealthDate(date, +1);
          onChange(nextDate > today ? today : nextDate);
        }}
        size="sm"
        tone="ghost"
      >
        <ChevronUp aria-hidden="true" />
      </AdhdIconButton>
      <AdhdIconButton
        aria-label="Previous sleep date"
        className="!h-3 !w-5 !rounded-[3px] !border-transparent !bg-transparent !p-0 text-[#7b6bc8] hover:!bg-[#f3efff] dark:text-[#c1b5ff] dark:hover:!bg-white/[0.08]"
        iconClassName="!h-3 !w-3"
        onClick={() => onChange(shiftHealthDate(date, -1))}
        size="sm"
        tone="ghost"
      >
        <ChevronDown aria-hidden="true" />
      </AdhdIconButton>
    </span>
  );

  if (dayStepper) {
    return (
      <span className="flex items-start gap-1.5">
        {daySteppers}
        <span className="flex flex-col items-start gap-1">
          {dateInput}
          <span className="flex h-[26px] w-full items-center justify-center">{todayButton}</span>
        </span>
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {dateInput}
      {date !== today ? todayButton : null}
    </span>
  );
}

function WeightForecastCard({
  forecast,
  unit,
}: {
  forecast: WeightGoalForecast;
  unit: HealthProfile["preferred_weight_unit"];
}) {
  let title = "More weigh-ins needed";
  let detail = "Log at least three weigh-ins across seven days to estimate your target date.";
  if (forecast.status === "reached") {
    title = "Goal reached";
    detail = "Your latest weigh-in is at your target weight.";
  } else if (forecast.status === "away") {
    title = "Current trend is not moving toward the target";
    detail = "Your recent 30-day trend does not currently produce a target-date estimate.";
  } else if (forecast.status === "forecast" && forecast.estimatedDate && forecast.weeklyChangeKg !== null) {
    title = `Estimated target: ${formatForecastDate(forecast.estimatedDate)}`;
    const displayWeeklyChange = kilogramsToDisplayValue(Math.abs(forecast.weeklyChangeKg), unit);
    const direction = forecast.weeklyChangeKg > 0 ? "gaining" : "losing";
    detail = `Recent trend: ${direction} ${displayWeeklyChange.toFixed(1)} ${unit} per week.`;
  }
  return (
    <div className="mt-5 rounded-[1.25rem] border border-[#e8e2f7] bg-[#fbf9ff] px-4 py-4 dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Weight target forecast</p>
      <p className="mt-1 text-sm font-semibold text-[#26324f] dark:text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#73809c] dark:text-white/50">{detail}</p>
    </div>
  );
}

function formatForecastDate(dateKey: string) {
  const timestamp = Date.parse(`${dateKey}T12:00:00`);
  if (!Number.isFinite(timestamp)) return dateKey;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(timestamp);
}

function EmptyCopy({ text }: { text: string }) {
  return <p className="rounded-[1.25rem] border border-dashed border-[#d7def3] bg-[#fbfcff] px-4 py-4 text-sm text-[#6f7a96] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55" role="note">{text}</p>;
}

function InlineNotice({ text }: { text: string }) {
  return <p aria-live="polite" className="rounded-[1rem] bg-[#eef3ff] px-4 py-3 text-sm text-[#4e5ec8] dark:bg-[#1d2342] dark:text-[#c4d1ff]" role="status">{text}</p>;
}

function NutritionDetailsDisclosure({
  coverage,
  details,
  groups,
  title = "Nutrition Details",
}: {
  coverage?: HealthNutritionCoverage;
  details?: HealthNutritionDetails | null;
  groups?: readonly HealthNutritionFieldDefinition["group"][];
  title?: string;
}) {
  const normalized = normalizeHealthNutritionDetails(details);
  const fields = HEALTH_NUTRITION_FIELD_REGISTRY.filter((field) => (groups ? groups.includes(field.group) : true) && typeof normalized?.[field.key] === "number");
  if (fields.length === 0) {
    return null;
  }
  return (
    <details className="mt-3 rounded-[1rem] border border-[#eeeaf8] bg-[#fbfaff] px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]">
      <summary className="cursor-pointer font-semibold text-[#5d6783] dark:text-white/70">{title}</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {fields.map((field) => {
          const value = normalized?.[field.key] as number;
          const fieldCoverage = coverage?.[field.key];
          return (
            <div className="flex min-w-0 items-baseline justify-between gap-3" key={field.key}>
              <span className="text-[#7d7598] dark:text-white/50">{field.label}</span>
              <span className="shrink-0 font-semibold text-[#4f5872] dark:text-white/70">
                {formatHealthNutritionNumber(value)} {field.unit}
                {fieldCoverage && !fieldCoverage.complete ? ` · ${fieldCoverage.knownEntries}/${fieldCoverage.totalEntries} foods known` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function calculateMealDraft(draft: MealDraft) {
  const selection = mealFoodSelectionFromDraft(draft);
  return selection ? calculateMealSelection(selection, parsePositiveQuantity(draft.quantity), draft.measurement) : null;
}

function calculateMealSelection(selection: MealFoodSelection, quantity: number | null, unit: string) {
  if (quantity === null) {
    return null;
  }
  try {
    return calculateHealthFoodNutrition({
      consumedQuantity: quantity,
      consumedUnit: unit,
      nutritionPerServing: {
        calories: selection.calories,
        carbs_g: selection.carbs,
        fat_g: selection.fat,
        protein_g: selection.protein,
        nutrition_details: selection.nutritionDetails,
      },
      servingMeasureUnit: selection.servingMeasureUnit,
      servingMeasureValue: selection.servingMeasureValue,
      servingQuantity: selection.servingQuantity,
      servingUnit: selection.servingUnit,
    });
  } catch {
    return null;
  }
}

function mealFoodSelectionFromDraft(draft: MealDraft): MealFoodSelection | null {
  const calories = finiteNumber(draft.calories);
  const servingQuantity = positiveFiniteNumber(draft.servingQuantity);
  if (!draft.foodName.trim() || calories === null || calories < 0 || servingQuantity === null || !draft.servingUnit.trim()) {
    return null;
  }
  return {
    attribution: draft.attribution,
    barcode: draft.barcode,
    brandName: draft.brandName,
    calories,
    carbs: nullableFiniteNumber(draft.carbs),
    fat: nullableFiniteNumber(draft.fat),
    foodCategory: draft.foodCategory,
    foodName: draft.foodName.trim(),
    nutritionDetails: draft.nutritionDetails,
    provider: draft.provider,
    providerItemId: draft.providerItemId,
    protein: nullableFiniteNumber(draft.protein),
    servingLabel: emptyToNull(draft.servingLabel),
    servingMeasureUnit: validServingMeasureUnit(draft.servingMeasureUnit),
    servingMeasureValue: positiveFiniteNumber(draft.servingMeasureValue),
    servingQuantity,
    servingUnit: draft.servingUnit.trim(),
    sourceFoodId: draft.sourceFoodId,
  };
}

function mealFoodSelectionFromLibraryItem(item: HealthFoodLibraryItem): MealFoodSelection {
  return {
    attribution: item.attribution,
    barcode: item.barcode,
    brandName: item.brand_name ?? "",
    calories: item.calories,
    carbs: item.carbs_g,
    fat: item.fat_g,
    foodCategory: item.food_category ?? item.category,
    foodName: item.food_name,
    provider: item.provider,
    providerItemId: item.provider_item_id ?? item.id,
    protein: item.protein_g,
    nutritionDetails: item.nutrition_details ?? null,
    servingLabel: item.serving_label,
    servingMeasureUnit: validServingMeasureUnit(item.serving_measure_unit),
    servingMeasureValue: positiveFiniteNumber(item.serving_measure_value),
    servingQuantity: positiveFiniteNumber(item.serving_quantity) ?? 1,
    servingUnit: item.serving_unit?.trim() || "serving",
    sourceFoodId: item.id,
  };
}

function getStructuredMealDefinition(entry: HealthMealEntry): MealFoodSelection | null {
  const snapshot = entry.food_snapshot;
  const consumedQuantity = positiveFiniteNumber(entry.consumed_quantity);
  const consumedUnit = entry.consumed_unit?.trim();
  const servingQuantity = positiveFiniteNumber(snapshot?.serving_quantity);
  const calories = finiteNumber(snapshot?.calories);
  if (!snapshot || consumedQuantity === null || !consumedUnit || servingQuantity === null || calories === null || calories < 0 || !snapshot.serving_unit?.trim()) {
    return null;
  }
  return {
    attribution: snapshot.attribution ?? entry.attribution,
    barcode: snapshot.barcode ?? entry.barcode,
    brandName: snapshot.brand_name ?? entry.brand_name ?? "",
    calories,
    carbs: nullableFiniteNumber(snapshot.carbs_g),
    consumedUnit,
    fat: nullableFiniteNumber(snapshot.fat_g),
    foodCategory: snapshot.food_category,
    foodName: snapshot.food_name || entry.food_name,
    provider: snapshot.provider || entry.provider,
    providerItemId: snapshot.provider_item_id ?? entry.provider_item_id,
    protein: nullableFiniteNumber(snapshot.protein_g),
    nutritionDetails: snapshot.nutrition_details ?? null,
    servingLabel: snapshot.serving_label ?? entry.serving_label,
    servingMeasureUnit: validServingMeasureUnit(snapshot.serving_measure_unit),
    servingMeasureValue: positiveFiniteNumber(snapshot.serving_measure_value),
    servingQuantity,
    servingUnit: snapshot.serving_unit.trim(),
    sourceFoodId: entry.source_food_id ?? snapshot.source_food_id,
  };
}

function buildMealFoodSnapshot(source: MealDraft | MealFoodSelection): HealthMealFoodSnapshot {
  return {
    attribution: source.attribution,
    barcode: source.barcode,
    brand_name: source.brandName || null,
    calories: finiteNumber(source.calories) ?? 0,
    carbs_g: nullableFiniteNumber(source.carbs),
    food_category: source.foodCategory,
    food_name: source.foodName.trim(),
    fat_g: nullableFiniteNumber(source.fat),
    provider: source.provider ?? "manual",
    provider_item_id: source.providerItemId,
    serving_label: source.servingLabel,
    serving_measure_unit: validServingMeasureUnit(source.servingMeasureUnit),
    serving_measure_value: positiveFiniteNumber(source.servingMeasureValue),
    serving_quantity: positiveFiniteNumber(source.servingQuantity) ?? 1,
    serving_unit: source.servingUnit.trim() || "serving",
    source_food_id: source.sourceFoodId,
    protein_g: nullableFiniteNumber(source.protein),
    nutrition_details: source.nutritionDetails,
  };
}

function formatConsumedMealLabel(
  calculation: ReturnType<typeof calculateHealthFoodNutrition>,
  servingLabel: string | null | undefined,
) {
  const consumedLabel = formatHealthFoodQuantityUnit(calculation.consumed.quantity, calculation.consumed.unit);
  const serving = emptyToNull(servingLabel ?? "");
  return serving ? `${consumedLabel} / ${serving}` : consumedLabel;
}

function validServingMeasureUnit(value: unknown): HealthServingMeasureUnit | null {
  return value === "g" || value === "oz" || value === "ml" || value === "fl_oz" ? value : null;
}

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableFiniteNumber(value: unknown) {
  return value === null || value === undefined || value === "" ? null : finiteNumber(value);
}

function positiveFiniteNumber(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseNullableInteger(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveQuantity(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function scaleNullableNumber(value: number | null, quantity: number) {
  return value === null ? null : Math.round(value * quantity * 10) / 10;
}

function formatQuantityServingLabel(quantity: number, servingLabel: string) {
  const serving = emptyToNull(servingLabel);
  if (quantity === 1) {
    return serving;
  }
  const quantityLabel = Number.isInteger(quantity) ? `x${quantity}` : `x${quantity.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
  return serving ? `${quantityLabel} / ${serving}` : quantityLabel;
}

function parseQuantityServingLabel(servingLabel: string) {
  const trimmed = servingLabel.trim();
  const match = /^x(\d+(?:\.\d+)?)\s*\/\s*(.*)$/i.exec(trimmed);
  if (!match) {
    return { quantity: 1, servingLabel: trimmed };
  }
  const quantity = parsePositiveQuantity(match[1]) ?? 1;
  return { quantity, servingLabel: match[2]?.trim() ?? "" };
}

function formatTimeInput(loggedAt: string) {
  const date = new Date(loggedAt);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatPlanTime(date: string, time: string) {
  const loggedAt = buildHealthMealLoggedAt(date, time);
  return loggedAt ? formatMealLoggedTime(loggedAt) : normalizeHealthMealTime(time) ?? "Invalid time";
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function formatBrandedFoodName(food: Pick<HealthMealEntry | HealthMealPlanEntry | HealthFoodLibraryItem, "brand_name" | "food_name">) {
  return food.brand_name?.trim()
    ? `${food.brand_name.trim()} · ${food.food_name}`
    : food.food_name;
}

function getHealthTabPanelId(tab: HealthTab) {
  return `health-panel-${tab.toLowerCase()}`;
}

"use client";

import { Activity, Apple, CalendarDays, Check, ChevronDown, ChevronUp, Heart, HeartPulse, MoonStar, Pencil, Plus, RotateCcw, Salad, ScanBarcode, Scale, Sparkles, Target, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

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
  HealthSymptomEntryUpdate,
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
import type { HealthImportSaveProgress } from "@/hooks/useHealth";
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
  clampPercent,
  ALL_HEALTH_SYMPTOMS_VALUE,
  buildHealthMealLoggedAt,
  buildWeightGoalForecast,
  displayWeightToKilograms,
  formatEditableWeight,
  formatHealthDateLabel,
  formatHealthMealSummary,
  formatMealLoggedTime,
  formatHealthNutritionNumber,
  formatHealthSleepDuration,
  formatWeight,
  getCurrentHealthDateTimeInputs,
  getDefaultHealthSymptomId,
  groupHealthSymptomEntriesByDate,
  getHealthSymptomTrendEntries,
  getHealthSymptomTrendEntriesBySymptom,
  getLatestHealthSymptomTrendSeverity,
  getSelectableHealthSymptoms,
  getHealthSleepElapsedSeconds,
  getHealthSleepStartTimestamp,
  getHealthSleepDayTotal,
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
  HEALTH_SYMPTOM_TREND_RANGES,
  type HealthReminderTemplateKey,
  HEALTH_SYMPTOM_TAGS,
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
  type HealthSymptomTrendRange,
} from "@/lib/health-utils";
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
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import { HealthBarcodeScanner } from "./health-barcode-scanner";
import { HealthLibraryPanel } from "./health-library-panel";
import { HealthAutocomplete, HealthDropdown, HEALTH_COMPACT_CONTROL_CLASS, HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";
import { HealthCalorieLineChart } from "./health-calorie-line-chart";
import { HealthSleepLineChart } from "./health-sleep-line-chart";
import { HealthWaterPanel } from "./health-water-panel";
import { HealthFitnessTab } from "./health-fitness-tab";
import { PageShellHeader } from "./page-shell-header";

type HealthPageProps = {
  awards: HealthAchievementAward[];
  checkIns: HealthCheckIn[];
  symptoms: HealthSymptom[];
  symptomEntries: HealthSymptomEntry[];
  createSymptom: (input: Omit<HealthSymptomInsert, "user_id">) => Promise<HealthSymptom | null>;
  renameSymptom: (symptomId: string, name: string) => Promise<boolean>;
  setSymptomColor: (symptomId: string, color: string) => Promise<boolean>;
  archiveSymptom: (symptomId: string) => Promise<boolean>;
  addSymptomEntry: (input: Omit<HealthSymptomEntryInsert, "user_id">) => Promise<boolean>;
  updateSymptomEntry: (entryId: string, input: HealthSymptomEntryUpdate) => Promise<boolean>;
  deleteSymptomEntry: (entryId: string) => Promise<boolean>;
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
  saveCheckIn: (input: {
    energy_score?: number | null;
    entry_date: string;
    mood_score?: number | null;
    reflection?: string;
    symptom_tags?: string[];
  }) => Promise<boolean>;
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
    entry_date: string;
    unit: HealthWaterUnit;
  }) => Promise<boolean>;
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

type SymptomDraft = {
  date: string;
  newName: string;
  note: string;
  severity: number | null;
  symptomId: string;
  time: string;
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

const DEFAULT_IMPORT_STATUS = "Waiting for an Apple Health export.";
const NEW_SYMPTOM_VALUE = "__new_symptom__";

function formatHealthSymptomTrendTimestamp(entry: HealthSymptomEntry) {
  const timestamp = Date.parse(entry.logged_at);
  if (!Number.isFinite(timestamp)) {
    return formatHealthDateLabel(entry.entry_date);
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(timestamp);
}

function buildHealthSymptomTrendSeries(
  symptom: HealthSymptom,
  entries: HealthSymptomEntry[],
  summaryLabel: string,
): NumericLineChartSeries {
  return {
    color: normalizeHealthSymptomColor(symptom.color),
    key: symptom.id,
    label: symptom.name,
    points: entries.map((entry) => {
      const timestampLabel = formatHealthSymptomTrendTimestamp(entry);
      return {
        detailLabel: entry.note ? `${timestampLabel} · ${entry.note}` : timestampLabel,
        key: entry.id,
        label: formatHealthDateLabel(entry.entry_date),
        value: entry.severity,
        xDomainKey: entry.entry_date,
        xSubpositionKey: entry.logged_at,
      };
    }),
    summaryLabel,
    totalValue: getLatestHealthSymptomTrendSeverity(entries) ?? 0,
  };
}

function HealthSymptomColorPalette({
  className,
  onSetColor,
  symptom,
}: {
  className?: string;
  onSetColor: (color: string) => void;
  symptom: HealthSymptom;
}) {
  const color = normalizeHealthSymptomColor(symptom.color);
  return (
    <div aria-label={`Choose a color for ${symptom.name}`} className={`grid grid-cols-8 gap-1 rounded-[0.8rem] border border-[#e4deef] bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.05] ${className ?? ""}`} role="group">
      {ADHDICE_ACCENT_COLORS.map((paletteColor) => (
        <button
          aria-label={`Set ${symptom.name} color to ${paletteColor}`}
          aria-pressed={color === paletteColor}
          className={`h-5 w-5 rounded-full border-2 transition ${color === paletteColor ? "scale-110 border-[#2f294a] dark:border-white" : "border-transparent"}`}
          key={paletteColor}
          onClick={() => onSetColor(paletteColor)}
          onMouseDown={(event) => event.preventDefault()}
          style={{ backgroundColor: paletteColor }}
          title={`Set ${symptom.name} color to ${paletteColor}`}
          type="button"
        />
      ))}
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
  const color = normalizeHealthSymptomColor(symptom.color);
  return (
    <div className="relative shrink-0">
      <AdhdIconButton
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Change color for ${symptom.name}`}
        onClick={onToggle}
        onMouseDown={(event) => event.preventDefault()}
        size="sm"
        tone="ghost"
        variant="rowToolbar"
      >
        <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-black/10 dark:border-white/20" style={{ backgroundColor: color }} />
      </AdhdIconButton>
      {isOpen ? (
        <HealthSymptomColorPalette
          className="absolute right-0 top-full z-20 mt-1"
          onSetColor={onSetColor}
          symptom={symptom}
        />
      ) : null}
    </div>
  );
}

function buildHealthSymptomDropdownOption(
  symptom: HealthSymptom,
  pickerKey: string,
  openPickerKey: string | null,
  onTogglePicker: (pickerKey: string) => void,
  onSetColor: (symptomId: string, color: string) => void,
) {
  const color = normalizeHealthSymptomColor(symptom.color);
  return {
    label: symptom.archived_at === null ? symptom.name : `${symptom.name} (archived)`,
    trailingAction: {
      ariaLabel: `Change color for ${symptom.name}`,
      content: <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-black/10 dark:border-white/20" style={{ backgroundColor: color }} />,
      expandedContent: openPickerKey === pickerKey
        ? <HealthSymptomColorPalette onSetColor={(nextColor) => onSetColor(symptom.id, nextColor)} symptom={symptom} />
        : null,
      onClick: () => onTogglePicker(pickerKey),
    },
    value: symptom.id,
  };
}

export function HealthPage({
  checkIns,
  symptoms,
  symptomEntries,
  createSymptom,
  renameSymptom,
  setSymptomColor,
  archiveSymptom,
  addSymptomEntry,
  updateSymptomEntry,
  deleteSymptomEntry,
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
  saveCheckIn,
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
  const [journalReflection, setJournalReflection] = useState("");
  const [journalMood, setJournalMood] = useState<number | null>(null);
  const [journalEnergy, setJournalEnergy] = useState<number | null>(null);
  const [journalTags, setJournalTags] = useState<string[]>([]);
  const [selectedSymptomTrendId, setSelectedSymptomTrendId] = useState("");
  const [openSymptomColorPickerKey, setOpenSymptomColorPickerKey] = useState<string | null>(null);
  const [isSymptomCreateOpen, setIsSymptomCreateOpen] = useState(false);
  const [isCreatingSymptom, setIsCreatingSymptom] = useState(false);
  const [symptomCreateName, setSymptomCreateName] = useState("");
  const [symptomTrendRange, setSymptomTrendRange] = useState<HealthSymptomTrendRange>("30D");
  const initialSymptomInputs = useMemo(() => getCurrentHealthDateTimeInputs(), []);
  const [symptomDraft, setSymptomDraft] = useState<SymptomDraft>(() => ({
    date: initialSymptomInputs.date,
    newName: "",
    note: "",
    severity: null,
    symptomId: "",
    time: initialSymptomInputs.time,
  }));
  const [editingSymptomEntryId, setEditingSymptomEntryId] = useState<string | null>(null);
  const [editingSymptomId, setEditingSymptomId] = useState<string | null>(null);
  const [editingSymptomName, setEditingSymptomName] = useState("");
  const [symptomFormError, setSymptomFormError] = useState<string | null>(null);
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
  const today = todayHealthDate();

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

  const todayCheckIn = useMemo(
    () => checkIns.find((entry) => entry.entry_date === today) ?? null,
    [checkIns, today],
  );

  useEffect(() => {
    setJournalReflection(todayCheckIn?.reflection ?? "");
    setJournalMood(todayCheckIn?.mood_score ?? null);
    setJournalEnergy(todayCheckIn?.energy_score ?? null);
    setJournalTags(todayCheckIn?.symptom_tags ?? []);
  }, [todayCheckIn]);

  const activeSymptoms = useMemo(
    () => symptoms.filter((symptom) => symptom.archived_at === null),
    [symptoms],
  );
  const editingArchivedSymptom = editingSymptomEntryId
    ? symptoms.find((symptom) => symptom.id === symptomDraft.symptomId && symptom.archived_at !== null) ?? null
    : null;
  const symptomOptions = [
    { label: "Choose a symptom", value: "" },
    ...activeSymptoms.map((symptom) => buildHealthSymptomDropdownOption(
      symptom,
      `log:${symptom.id}`,
      openSymptomColorPickerKey,
      toggleSymptomColorPicker,
      handleSetSymptomColor,
    )),
    { label: "+ Add a new symptom", value: NEW_SYMPTOM_VALUE },
  ];
  const symptomHistoryGroups = useMemo(
    () => groupHealthSymptomEntriesByDate(symptomEntries).slice(0, 14),
    [symptomEntries],
  );
  const selectableSymptomTrendSymptoms = useMemo(
    () => getSelectableHealthSymptoms(symptoms, symptomEntries),
    [symptomEntries, symptoms],
  );
  const symptomTrendOptions = [
    { label: "All Symptoms", value: ALL_HEALTH_SYMPTOMS_VALUE },
    ...(selectableSymptomTrendSymptoms.length > 0
      ? selectableSymptomTrendSymptoms.map((symptom) => buildHealthSymptomDropdownOption(
        symptom,
        `trend:${symptom.id}`,
        openSymptomColorPickerKey,
        toggleSymptomColorPicker,
        handleSetSymptomColor,
      ))
      : [{ label: "No symptoms available", value: "" }]),
  ];
  const defaultSymptomTrendId = useMemo(
    () => isLoading ? "" : getDefaultHealthSymptomId(symptoms, symptomEntries),
    [isLoading, symptomEntries, symptoms],
  );
  const isAllSymptomsTrendSelected = selectedSymptomTrendId === ALL_HEALTH_SYMPTOMS_VALUE;
  const selectedSymptomTrendIdForView = useMemo(
    () => isAllSymptomsTrendSelected
      ? ALL_HEALTH_SYMPTOMS_VALUE
      : selectableSymptomTrendSymptoms.some((symptom) => symptom.id === selectedSymptomTrendId)
      ? selectedSymptomTrendId
      : defaultSymptomTrendId,
    [defaultSymptomTrendId, isAllSymptomsTrendSelected, selectableSymptomTrendSymptoms, selectedSymptomTrendId],
  );
  const selectedSymptomTrend = useMemo(
    () => selectableSymptomTrendSymptoms.find((symptom) => symptom.id === selectedSymptomTrendIdForView) ?? null,
    [selectableSymptomTrendSymptoms, selectedSymptomTrendIdForView],
  );
  const selectedSymptomTrendEntries = useMemo(
    () => isAllSymptomsTrendSelected ? [] : getHealthSymptomTrendEntries({
      asOfDate: today,
      entries: symptomEntries,
      range: symptomTrendRange,
      symptomId: selectedSymptomTrendIdForView,
    }),
    [isAllSymptomsTrendSelected, selectedSymptomTrendIdForView, symptomEntries, symptomTrendRange, today],
  );
  const selectedSymptomAllTrendEntries = useMemo(
    () => !isAllSymptomsTrendSelected && selectedSymptomTrendIdForView
      ? getHealthSymptomTrendEntries({ asOfDate: today, entries: symptomEntries, range: "All", symptomId: selectedSymptomTrendIdForView })
      : [],
    [isAllSymptomsTrendSelected, selectedSymptomTrendIdForView, symptomEntries, today],
  );
  const allSymptomTrendEntriesBySymptom = useMemo(
    () => isAllSymptomsTrendSelected
      ? getHealthSymptomTrendEntriesBySymptom({
        asOfDate: today,
        entries: symptomEntries,
        range: symptomTrendRange,
        symptoms: selectableSymptomTrendSymptoms,
      })
      : [],
    [isAllSymptomsTrendSelected, selectableSymptomTrendSymptoms, symptomEntries, symptomTrendRange, today],
  );
  const allSymptomTrendHistoryExists = useMemo(
    () => getHealthSymptomTrendEntriesBySymptom({
      asOfDate: today,
      entries: symptomEntries,
      range: "All",
      symptoms: selectableSymptomTrendSymptoms,
    }).length > 0,
    [selectableSymptomTrendSymptoms, symptomEntries, today],
  );
  const symptomTrendChartSeries = useMemo<NumericLineChartSeries[]>(() => {
    if (isAllSymptomsTrendSelected) {
      return allSymptomTrendEntriesBySymptom.map(({ entries, symptom }) =>
        buildHealthSymptomTrendSeries(symptom, entries, symptom.name));
    }
    if (!selectedSymptomTrend) {
      return [];
    }
    return [buildHealthSymptomTrendSeries(selectedSymptomTrend, selectedSymptomTrendEntries, "Latest")];
  }, [allSymptomTrendEntriesBySymptom, isAllSymptomsTrendSelected, selectedSymptomTrend, selectedSymptomTrendEntries]);

  const selectedMeals = useMemo(
    () => mealEntries.filter((entry) => entry.entry_date === foodHistoryDate),
    [foodHistoryDate, mealEntries],
  );
  const selectedNutrition = useMemo(
    () => sumMealNutritionForDate(mealEntries, foodHistoryDate),
    [foodHistoryDate, mealEntries],
  );
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
    await saveCheckIn({
      energy_score: journalEnergy,
      entry_date: today,
      mood_score: journalMood,
      reflection: journalReflection.trim(),
      symptom_tags: journalTags,
    });
  }

  function resetSymptomDraft() {
    const nextInputs = getCurrentHealthDateTimeInputs();
    setSymptomDraft({
      date: nextInputs.date,
      newName: "",
      note: "",
      severity: null,
      symptomId: "",
      time: nextInputs.time,
    });
    setEditingSymptomEntryId(null);
    setSymptomFormError(null);
  }

  function openSymptomEntryEdit(entry: HealthSymptomEntry) {
    const loggedAt = new Date(entry.logged_at);
    setEditingSymptomEntryId(entry.id);
    setSymptomDraft({
      date: entry.entry_date,
      newName: "",
      note: entry.note ?? "",
      severity: entry.severity,
      symptomId: entry.symptom_id,
      time: Number.isFinite(loggedAt.getTime())
        ? `${String(loggedAt.getHours()).padStart(2, "0")}:${String(loggedAt.getMinutes()).padStart(2, "0")}`
        : "",
    });
    setSymptomFormError(null);
  }

  async function handleSaveSymptomEntry() {
    const loggedAt = buildHealthMealLoggedAt(symptomDraft.date, symptomDraft.time);
    if (!loggedAt) {
      setSymptomFormError("Choose a valid symptom date and time.");
      return;
    }
    if (symptomDraft.severity === null) {
      setSymptomFormError("Choose a severity from 1 to 10.");
      return;
    }

    let symptomId = symptomDraft.symptomId;
    if (!editingSymptomEntryId && symptomId === NEW_SYMPTOM_VALUE) {
      const created = await createSymptom({ name: symptomDraft.newName });
      if (!created) {
        setSymptomFormError("Enter a unique symptom name.");
        return;
      }
      symptomId = created.id;
    }
    if (!symptomId) {
      setSymptomFormError("Choose a symptom.");
      return;
    }

    const saved = editingSymptomEntryId
      ? await updateSymptomEntry(editingSymptomEntryId, {
        entry_date: symptomDraft.date,
        logged_at: loggedAt,
        note: symptomDraft.note,
        severity: symptomDraft.severity,
        symptom_id: symptomId,
      })
      : await addSymptomEntry({
        entry_date: symptomDraft.date,
        logged_at: loggedAt,
        note: symptomDraft.note,
        severity: symptomDraft.severity,
        symptom_id: symptomId,
      });
    if (saved) {
      resetSymptomDraft();
    }
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
      <PageShellHeader subtitle="Health, Diet, Fitness" title="Health" />

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
        <div aria-labelledby="health-tab-today" className="mt-6" id={getHealthTabPanelId("Today")} role="tabpanel" />
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
        />
      ) : null}

      {activeTab === "Journal" ? (
        <>
          <div aria-labelledby="health-tab-journal" className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]" id={getHealthTabPanelId("Journal")} role="tabpanel">
            <HealthPanel icon={<HeartPulse />} subtitle="Daily check-in" title="How are you actually doing?">
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ScorePicker hint="1 very bad · 10 excellent" label="Mood" value={journalMood} onSelect={setJournalMood} />
                  <ScorePicker hint="1 exhausted · 10 high energy" label="Energy" value={journalEnergy} onSelect={setJournalEnergy} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Signals</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {HEALTH_SYMPTOM_TAGS.map((tag) => {
                      const selected = journalTags.includes(tag);
                      return (
                        <button
                          aria-pressed={selected}
                          className={`ui-chip-button-base transition ${
                            selected
                              ? "bg-[#efe9ff] text-[#6f57f6] dark:bg-[#2b214d] dark:text-[#cabfff]"
                              : "bg-[#f4f1ff] text-[#615b9c] dark:bg-white/8 dark:text-white/65"
                          }`}
                          key={tag}
                          onClick={() =>
                            setJournalTags((current) =>
                              current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag],
                            )
                          }
                          type="button"
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="grid gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Reflection</span>
                  <textarea
                    className="health-journal-textarea min-h-40 rounded-[1.5rem] border border-[#e6e8f5] bg-white px-4 py-4 text-sm text-[#22304b] outline-none transition focus:border-[#9e8cf9] dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                    onChange={(event) => setJournalReflection(event.target.value)}
                    placeholder="What helped, what felt noisy, and what your body or mind might need next."
                    value={journalReflection}
                  />
                </label>
                <div className="flex justify-end">
                  <button
                    className="ui-pill-button-strong-light"
                    onClick={() => { void handleSaveJournal(); }}
                    type="button"
                  >
                    Save Check-In
                  </button>
                </div>
              </div>
            </HealthPanel>

            <HealthPanel icon={<Sparkles />} subtitle="History" title="Recent check-ins">
              <div className="space-y-3">
                {checkIns.length === 0 ? (
                  <EmptyCopy text="Your first check-in will start the journal history here." />
                ) : (
                  checkIns.slice(0, 8).map((entry) => (
                    <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={entry.id}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthDateLabel(entry.entry_date)}</p>
                        <span className="text-xs text-[#7d88a3] dark:text-white/45">Mood {entry.mood_score ?? "?"} / Energy {entry.energy_score ?? "?"}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#66718f] dark:text-white/60">{entry.reflection || "No reflection saved."}</p>
                    </div>
                  ))
                )}
              </div>
            </HealthPanel>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <HealthPanel icon={<Activity />} subtitle="Symptoms" title={editingSymptomEntryId ? "Edit symptom entry" : "Log a symptom"}>
              <div className="grid gap-3">
                <Field composite label="Symptom">
                  <HealthDropdown
                    ariaLabel="Symptom"
                    onChange={(value) => {
                      setOpenSymptomColorPickerKey(null);
                      setSymptomDraft((current) => ({ ...current, newName: value === NEW_SYMPTOM_VALUE ? current.newName : "", symptomId: value }));
                    }}
                    options={editingSymptomEntryId
                      ? [
                        ...symptomOptions.filter((option) => option.value !== NEW_SYMPTOM_VALUE),
                        ...(editingArchivedSymptom
                          ? [buildHealthSymptomDropdownOption(
                            editingArchivedSymptom,
                            `log:${editingArchivedSymptom.id}`,
                            openSymptomColorPickerKey,
                            toggleSymptomColorPicker,
                            handleSetSymptomColor,
                          )]
                          : []),
                      ]
                      : symptomOptions}
                    value={symptomDraft.symptomId}
                  />
                </Field>
                {!editingSymptomEntryId && symptomDraft.symptomId === NEW_SYMPTOM_VALUE ? (
                  <Field label="New symptom name">
                    <input
                      aria-label="New symptom name"
                      className={HEALTH_COMPACT_INPUT_CLASS}
                      onChange={(event) => setSymptomDraft((current) => ({ ...current, newName: event.target.value }))}
                      placeholder="e.g. Back Pain"
                      value={symptomDraft.newName}
                    />
                  </Field>
                ) : null}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Severity</p>
                  <div className="mt-2 grid grid-cols-5 gap-2 sm:flex sm:flex-wrap">
                    {HEALTH_SEVERITY_OPTIONS.map((severity) => (
                      <button
                        aria-label={`Severity ${severity} out of 10`}
                        aria-pressed={symptomDraft.severity === severity}
                        className={`flex h-9 w-full items-center justify-center rounded-full text-sm font-semibold transition sm:w-9 ${symptomDraft.severity === severity ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]" : "bg-[#f4f1ff] text-[#615b9c] dark:bg-white/8 dark:text-white/65"}`}
                        key={severity}
                        onClick={() => setSymptomDraft((current) => ({ ...current, severity }))}
                        type="button"
                      >
                        {severity}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Date">
                    <HealthMealDateTimeInput onChange={(date) => setSymptomDraft((current) => ({ ...current, date }))} type="date" value={symptomDraft.date} />
                  </Field>
                  <Field label="Time">
                    <HealthMealDateTimeInput onChange={(time) => setSymptomDraft((current) => ({ ...current, time }))} type="time" value={symptomDraft.time} />
                  </Field>
                </div>
                <Field label="Note (optional)">
                  <textarea
                    aria-label="Symptom note"
                    className="health-journal-textarea min-h-20 rounded-[1.25rem] border border-[#e6e8f5] bg-white px-3 py-3 text-sm text-[#22304b] outline-none transition focus:border-[#9e8cf9] dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                    onChange={(event) => setSymptomDraft((current) => ({ ...current, note: event.target.value }))}
                    placeholder="Context, trigger, or what helped"
                    value={symptomDraft.note}
                  />
                </Field>
                {symptomFormError ? <p aria-live="polite" className="text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]" role="alert">{symptomFormError}</p> : null}
                <div className="flex flex-wrap justify-end gap-2">
                  {editingSymptomEntryId ? <button className="ui-pill-button-light" onClick={resetSymptomDraft} type="button">Cancel</button> : null}
                  <button className="ui-pill-button-strong-light" onClick={() => { void handleSaveSymptomEntry(); }} type="button">
                    {editingSymptomEntryId ? "Update Entry" : "Save Symptom"}
                  </button>
                </div>
              </div>

              <div className="mt-5 rounded-[1.25rem] border border-[#eeeaf8] bg-[#fbfaff] px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Symptom library</p>
                  <AdhdIconButton aria-label="Add symptom" onClick={openSymptomCreateForm} size="sm" tone="ghost" variant="rowToolbar"><Plus aria-hidden="true" /></AdhdIconButton>
                </div>
                {isSymptomCreateOpen ? (
                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 rounded-[0.8rem] border border-[#e4deef] bg-white/70 p-2 dark:border-white/10 dark:bg-white/[0.04]">
                    <input
                      aria-label="New symptom name"
                      className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-0 w-full sm:min-w-[12rem] sm:flex-1 sm:w-auto`}
                      disabled={isCreatingSymptom}
                      onChange={(event) => setSymptomCreateName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCreateSymptom();
                        }
                      }}
                      placeholder="e.g. Back Pain"
                      value={symptomCreateName}
                    />
                    <div className="flex shrink-0 gap-2 sm:ml-auto">
                      <AdhdChip disabled={isCreatingSymptom} onClick={closeSymptomCreateForm} type="button">Cancel</AdhdChip>
                      <AdhdChip disabled={isCreatingSymptom} onClick={() => { void handleCreateSymptom(); }} tone="purple" type="button">Save</AdhdChip>
                    </div>
                  </div>
                ) : null}
                {activeSymptoms.length === 0 ? <p className="mt-2 text-xs text-[#7d7598] dark:text-white/50">Add your first custom symptom with + above.</p> : (
                  <div className="mt-2 grid gap-1.5">
                    {activeSymptoms.map((symptom) => (
                      <div className="flex min-h-8 items-center gap-2 rounded-[0.8rem] px-2 py-1 text-sm text-[#5d6783] dark:text-white/70" key={symptom.id}>
                        <HealthSymptomColorControl
                          isOpen={openSymptomColorPickerKey === `library:${symptom.id}`}
                          onSetColor={(color) => handleSetSymptomColor(symptom.id, color)}
                          onToggle={() => toggleSymptomColorPicker(`library:${symptom.id}`)}
                          symptom={symptom}
                        />
                        {editingSymptomId === symptom.id ? (
                          <input
                            aria-label={`Rename ${symptom.name}`}
                            className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-0 flex-1`}
                            onChange={(event) => setEditingSymptomName(event.target.value)}
                            onKeyDown={(event) => { if (event.key === "Enter") void handleRenameSymptom(symptom.id); }}
                            value={editingSymptomName}
                          />
                        ) : <span className="min-w-0 flex-1 truncate">{symptom.name}</span>}
                        {editingSymptomId === symptom.id ? (
                          <>
                            <AdhdChip onClick={() => { void handleRenameSymptom(symptom.id); }} tone="purple" type="button">Save</AdhdChip>
                            <AdhdChip onClick={() => { setEditingSymptomId(null); setEditingSymptomName(""); }} type="button">Cancel</AdhdChip>
                          </>
                        ) : (
                          <>
                            <AdhdIconButton aria-label={`Rename ${symptom.name}`} onClick={() => { setEditingSymptomId(symptom.id); setEditingSymptomName(symptom.name); }} size="sm" tone="ghost" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton>
                            <AdhdIconButton aria-label={`Archive ${symptom.name}`} onClick={() => { void archiveSymptom(symptom.id); }} size="sm" tone="danger" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </HealthPanel>

            <HealthPanel icon={<Sparkles />} subtitle="History" title="Recent symptoms">
              <div className="space-y-3">
                {symptomHistoryGroups.length === 0 ? <EmptyCopy text="Logged symptoms will appear here grouped by day." /> : symptomHistoryGroups.map((group) => (
                  <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-3 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={group.date}>
                    <p className="text-xs font-semibold text-[#68738c] dark:text-white/55">{formatHealthDateLabel(group.date)}</p>
                    <div className="mt-2 grid gap-2">
                      {group.entries.map((entry) => {
                        const symptom = symptoms.find((candidate) => candidate.id === entry.symptom_id);
                        const loggedAt = new Date(entry.logged_at);
                        const time = Number.isFinite(loggedAt.getTime())
                          ? loggedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                          : "Time unavailable";
                        return (
                          <div className="flex items-start gap-2 border-t border-[#eeeaf8] pt-2 first:border-t-0 first:pt-0 dark:border-white/10" key={entry.id}>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span className="font-semibold text-[#26324f] dark:text-white">{symptom?.name ?? "Archived symptom"}</span>
                                <span className="text-sm font-black text-[#6f57f6] dark:text-[#cabfff]">{entry.severity}/10</span>
                                <span className="text-xs text-[#7d88a3] dark:text-white/45">{time}</span>
                              </div>
                              {entry.note ? <p className="mt-1 text-xs leading-5 text-[#73809c] dark:text-white/50">{entry.note}</p> : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <AdhdIconButton aria-label={`Edit ${symptom?.name ?? "symptom"} entry`} onClick={() => openSymptomEntryEdit(entry)} size="sm" tone="ghost" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton>
                              <AdhdIconButton aria-label={`Delete ${symptom?.name ?? "symptom"} entry`} onClick={() => { void deleteSymptomEntry(entry.id); }} size="sm" tone="danger" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </HealthPanel>
          </div>

          <HealthPanel className="mt-5 min-w-0" icon={<Activity />} subtitle="Symptoms" title="Symptom Trends">
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field composite label="Symptom">
                  <HealthDropdown
                    ariaLabel="Trend symptom"
                    disabled={selectableSymptomTrendSymptoms.length === 0}
                    onChange={(value) => {
                      setOpenSymptomColorPickerKey(null);
                      setSelectedSymptomTrendId(value);
                    }}
                    options={symptomTrendOptions}
                    value={selectedSymptomTrendIdForView}
                  />
                </Field>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Range</span>
                  <div aria-label="Symptom trend date range" className="mt-2 flex flex-wrap gap-2" role="group">
                    {HEALTH_SYMPTOM_TREND_RANGES.map((range) => (
                      <button
                        aria-pressed={symptomTrendRange === range}
                        className={`ui-chip-button-base transition ${symptomTrendRange === range ? "bg-[#efe9ff] text-[#6f57f6] dark:bg-[#2b214d] dark:text-[#cabfff]" : "bg-[#f4f1ff] text-[#615b9c] dark:bg-white/8 dark:text-white/65"}`}
                        key={range}
                        onClick={() => setSymptomTrendRange(range)}
                        type="button"
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {isAllSymptomsTrendSelected || selectedSymptomTrend ? (
                <ActivityLineChartCard
                  activePointContext={`${symptomTrendRange} • severity scale 1–10`}
                  ariaLabel={isAllSymptomsTrendSelected
                    ? "All symptom severity trend line graph"
                    : `${selectedSymptomTrend?.name ?? "Symptom"} severity trend line graph`}
                  emptyText={isAllSymptomsTrendSelected
                    ? allSymptomTrendHistoryExists
                      ? "No symptom entries in the selected range."
                      : "No symptom history is available to graph yet."
                    : selectedSymptomAllTrendEntries.length === 0
                      ? `No history for ${selectedSymptomTrend?.name ?? "symptom"} yet.`
                      : `No ${selectedSymptomTrend?.name ?? "symptom"} entries in the selected range.`}
                  eyebrow="SYMPTOM TRENDS"
                  formatAxisValue={(value) => String(Math.round(value))}
                  formatValue={(value) => `${Math.round(value)}/10`}
                  compactPlot
                  maxValue={10}
                  series={symptomTrendChartSeries}
                  subtitle={`${symptomTrendRange} • timestamped severity entries`}
                  title={isAllSymptomsTrendSelected ? "All symptom severity" : `${selectedSymptomTrend?.name ?? "Symptom"} severity`}
                  variant="embedded"
                />
              ) : (
                <EmptyCopy
                  text={symptoms.length === 0
                    ? "Log a symptom to see symptom trends here."
                    : "No symptom history is available to graph yet."}
                />
              )}
            </div>
          </HealthPanel>
        </>
      ) : null}

      {activeTab === "Food" ? (
        <div aria-labelledby="health-tab-food" className="mt-3 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]" id={getHealthTabPanelId("Food")} role="tabpanel">
          <div className="grid min-w-0 content-start gap-5">
          <HealthPanel
            className="min-w-0"
            contentTopClassName="pt-1 sm:pt-1"
            headerChevronClassName="-translate-y-0.5"
            headerPaddingClassName="py-2 sm:py-2"
            icon={<Salad />}
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
                  const slotCaloriesTotal = slotMeals.reduce((total, entry) => total + mealNutritionValue(entry, "calories"), 0);
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
                        <p className="mt-1 break-words text-xs text-[#74809b] dark:text-white/45">{formatHealthMealSummary(entry)}</p>
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
          </div>

          <div className="grid min-w-0 content-start gap-5">
          <HealthPanel
            headerActions={<FoodHistoryDateChip allowFuture date={foodHistoryDate} onChange={handleFoodHistoryDateChange} today={today} />}
            className="min-w-0"
            icon={<Target />}
            subtitle="Daily totals"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <CompactStat detail={profile.calorie_goal ? `goal ${profile.calorie_goal}` : "set in goals"} label="Calories" progressPercent={profile.calorie_goal ? clampPercent((selectedNutrition.calories / profile.calorie_goal) * 100) : null} value={formatHealthNutritionNumber(selectedNutrition.calories)} />
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
            <HealthCalorieLineChart series={dailyCalorieSeries} />
          </HealthPanel>

          <HealthPanel className="min-w-0" icon={<Sparkles />} subtitle="Food shortcuts" title="Favorites & Recent Foods">
              <div className="adhdice-scrollbar max-h-[26rem] space-y-5 overflow-y-auto pr-1">
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
          </div>

          <div className="order-4 min-w-0 xl:col-span-2 xl:order-none">
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
          />
          </div>

        </div>
      ) : null}

      {activeTab === "Water" ? (
        <HealthWaterPanel
          addWaterEntry={addWaterEntry}
          deleteWaterEntry={deleteWaterEntry}
          today={today}
          updateWaterEntry={updateWaterEntry}
          waterEntries={waterEntries}
        />
      ) : null}

      {activeTab === "Weight" ? (
        <div aria-labelledby="health-tab-weight" className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]" id={getHealthTabPanelId("Weight")} role="tabpanel">
          <HealthPanel icon={<Scale />} subtitle="Weigh-in" title="Track trend, not perfection">
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

          <HealthPanel icon={<Activity />} subtitle="30 days" title="Recent trend">
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
        </div>
      ) : null}

      {activeTab === "Sleep" ? (
        <div aria-labelledby="health-tab-sleep" className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]" id={getHealthTabPanelId("Sleep")} role="tabpanel">
          <div className="grid content-start gap-5">
          <HealthPanel
            collapseAfterHeaderActions
            headerActions={<FoodHistoryDateChip ariaLabel="Sleep ledger date" date={sleepLedgerDate} dayStepper today={today} onChange={setSleepLedgerDate} />}
            icon={<MoonStar />}
            subtitle="Sleep ledger"
            title="Health sleep totals"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <CompactStat detail={formatHealthDateLabel(sleepLedgerDate)} label="Total" value={formatHealthSleepDuration(selectedSleepTotal.totalMinutes)} />
              <CompactStat detail={profile.sleep_goal_minutes ? `goal ${formatHealthSleepDuration(profile.sleep_goal_minutes)}` : "set in goals"} label="Goal" value={`${selectedSleepPercent}%`} />
              <CompactStat detail={formatHealthDateLabel(sleepLedgerDate)} label="Focus Clock" value={formatHealthSleepDuration(selectedSleepTotal.focusMinutes)} />
              <CompactStat detail={formatHealthDateLabel(sleepLedgerDate)} label="Imported" value={formatHealthSleepDuration(selectedSleepTotal.importedMinutes)} />
            </div>
            <HealthSleepLineChart series={sleepActivitySeries} />
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

          </div>

          <div className="grid content-start gap-5">
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
          </div>
        </div>
      ) : null}

      {activeTab === "Insights" ? (
        <div aria-labelledby="health-tab-insights" className="mt-6 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]" id={getHealthTabPanelId("Insights")} role="tabpanel">
          <HealthPanel icon={<Apple />} subtitle="Import pathway" title="Apple Health groundwork">
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

          <HealthPanel icon={<MoonStar />} subtitle="Imported trends" title="What will appear here">
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
        </div>
      ) : null}

      {activeTab === "Awards" ? (
        <div aria-labelledby="health-tab-awards" className="mt-6" id={getHealthTabPanelId("Awards")} role="tabpanel">
          <HealthPanel icon={<Trophy />} subtitle="Awards" title="Under construction">
            <EmptyCopy text="This tab is under construction." />
          </HealthPanel>
        </div>
      ) : null}

      <div className="mt-8">
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
      </div>
    </section>
  );
}

function HealthPanel({
  className,
  collapseAfterHeaderActions = false,
  children,
  contentTopClassName = "pt-3 sm:pt-4",
  headerChevronClassName = "",
  headerPaddingClassName = "py-4 sm:py-5",
  headerActions,
  icon,
  subtitle,
  title,
}: {
  className?: string;
  collapseAfterHeaderActions?: boolean;
  children: ReactNode;
  contentTopClassName?: string;
  headerChevronClassName?: string;
  headerPaddingClassName?: string;
  headerActions?: ReactNode;
  icon: ReactNode;
  subtitle: string;
  title?: string;
}) {
  const [isOpen, setIsOpen] = useState(true);
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
      onClick={() => setIsOpen((current) => !current)}
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
      className,
    ].filter(Boolean).join(" ")}>
      <div className={["flex items-center gap-2 px-3 sm:px-5", headerPaddingClassName].filter(Boolean).join(" ")}>
        {collapseAfterHeaderActions ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              aria-expanded={isOpen}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={() => setIsOpen((current) => !current)}
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
            onClick={() => setIsOpen((current) => !current)}
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
      {isOpen ? <div className={`px-3 pb-4 sm:px-5 sm:pb-5 ${contentTopClassName}`}>{children}</div> : null}
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

function ScorePicker({
  hint,
  label,
  onSelect,
  value,
}: {
  hint?: string;
  label: string;
  onSelect: (value: number) => void;
  value: number | null;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{label}</p>
        {hint ? <span className="text-[11px] text-[#8d87a3] dark:text-white/40">{hint}</span> : null}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-2 sm:flex sm:flex-wrap">
        {HEALTH_SCALE_OPTIONS.map((score) => (
          <button
            aria-label={`${label} ${score} out of 10`}
            aria-pressed={value === score}
            className={`flex h-9 w-full items-center justify-center rounded-full text-sm font-semibold transition sm:h-10 sm:w-10 ${
              value === score
                ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                : "bg-[#f4f1ff] text-[#615b9c] dark:bg-white/8 dark:text-white/65"
            }`}
            key={score}
            onClick={() => onSelect(score)}
            type="button"
          >
            {score}
          </button>
        ))}
      </div>
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
  max,
  onChange,
  type,
  value,
}: {
  max?: string;
  onChange: (value: string) => void;
  type: "date" | "time";
  value: string;
}) {
  return (
    <div className={`${HEALTH_COMPACT_CONTROL_CLASS} flex min-w-0 max-w-full items-center max-sm:!h-[32px] max-sm:!min-h-[32px]`}>
      <input
        className="block min-w-0 w-full max-w-full box-border border-0 bg-transparent p-0 text-[13px] leading-normal text-[#2f294a] outline-none dark:text-white max-sm:!text-[16px] max-sm:!leading-normal"
        max={max}
        onChange={(event) => onChange(event.target.value)}
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

function mealNutritionValue(entry: HealthMealEntry, key: "calories" | "protein_g" | "carbs_g" | "fat_g") {
  const snapshotValue = entry.nutrition_snapshot?.[key];
  if (typeof snapshotValue === "number" && Number.isFinite(snapshotValue)) {
    return snapshotValue;
  }
  return entry[key] ?? 0;
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

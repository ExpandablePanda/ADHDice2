"use client";

import { Activity, Apple, CalendarDays, Camera, Check, ChevronDown, Heart, HeartPulse, MoonStar, Pencil, Salad, Scale, ScanSearch, Search, Sparkles, Target, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type {
  HealthAchievementAward,
  HealthCheckIn,
  HealthFoodLibraryItem,
  HealthImportAudit,
  HealthMealEntry,
  HealthMealEntryUpdate,
  HealthMetricEntry,
  HealthProfile,
  HealthProfileUpdate,
  HealthRecipe,
  HealthRecipeIngredient,
  HealthSavedMeal,
  HealthSavedMealItem,
  HealthServingWeightUnit,
  HealthWaterEntry,
  HealthWaterUnit,
  HealthWeightEntry,
} from "@/lib/database.types";
import type { WeightGoalForecast } from "@/lib/health-utils";
import {
  parseAppleHealthFileInWorker,
  type AppleHealthImportParseProgress,
  type AppleHealthImportPreview,
} from "@/lib/health-apple-import";
import type { HealthImportSaveProgress } from "@/hooks/useHealth";
import {
  clampPercent,
  buildWeightGoalForecast,
  displayWeightToKilograms,
  formatEditableWeight,
  formatHealthDateLabel,
  formatMealLoggedTime,
  formatWeight,
  getHealthSleepDayTotal,
  getSleepFocusSessions,
  getLatestWeight,
  getMealSlotLabel,
  getWeightTrend,
  HEALTH_MEAL_SLOTS,
  HEALTH_MOOD_OPTIONS,
  type HealthReminderTemplateKey,
  HEALTH_SYMPTOM_TAGS,
  HEALTH_TABS,
  kilogramsToDisplayValue,
  sumMealNutritionForDate,
  sumMetricValueForDate,
  todayHealthDate,
  type HealthTab,
} from "@/lib/health-utils";
import type { FocusCategory, HistoricalFocusSession } from "@/lib/types";
import {
  lookupOpenFoodFactsByBarcode,
  searchHealthFoods,
  type HealthFoodLookupResult,
} from "@/lib/health-nutrition";
import {
  getHealthFoodIdentityKey,
} from "@/lib/health-library";
import {
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
} from "@/components/ui/task-table-primitives";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { HealthLibraryPanel } from "./health-library-panel";
import { HealthCollapsiblePanel } from "./health-collapsible-panel";
import { HealthWaterPanel } from "./health-water-panel";
import { PageShellHeader } from "./page-shell-header";

type HealthPageProps = {
  awards: HealthAchievementAward[];
  checkIns: HealthCheckIn[];
  deleteFavoriteFood: (itemId: string) => Promise<boolean>;
  deleteMealEntry: (entryId: string) => Promise<boolean>;
  deleteRecipe: (recipeId: string) => Promise<boolean>;
  deleteSavedMeal: (mealId: string) => Promise<boolean>;
  deleteWaterEntry: (entryId: string) => Promise<boolean>;
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
  mealEntries: HealthMealEntry[];
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
    calories: number;
    carbs_g?: number | null;
    fat_g?: number | null;
    food_name: string;
    id?: string;
    protein_g?: number | null;
    provider?: string;
    provider_item_id?: string | null;
    serving_label?: string | null;
    serving_size?: string | null;
    serving_weight_amount?: number | null;
    serving_weight_unit?: HealthServingWeightUnit | null;
    is_favorite?: boolean;
  }) => Promise<boolean>;
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
  addMealEntry: (input: {
    attribution?: string | null;
    barcode?: string | null;
    brand_name?: string | null;
    calories: number;
    carbs_g?: number | null;
    entry_date: string;
    fat_g?: number | null;
    food_name: string;
    id?: string;
    logged_at?: string;
    meal_slot: HealthMealEntry["meal_slot"];
    protein_g?: number | null;
    provider?: string;
    provider_item_id?: string | null;
    serving_label?: string | null;
  }) => Promise<boolean>;
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
  updateWaterEntry: (entryId: string, input: {
    amount: number;
    amount_ml: number;
    entry_date: string;
    logged_at: string;
    unit: HealthWaterUnit;
  }) => Promise<boolean>;
  updateMealEntry: (entryId: string, input: HealthMealEntryUpdate) => Promise<boolean>;
  storageMode: "local" | "remote";
  onOpenReminderTemplate: (templateKey: HealthReminderTemplateKey) => void;
  onStartSleepClock: () => void;
  weightEntries: HealthWeightEntry[];
  waterEntries: HealthWaterEntry[];
};

type MealDraft = {
  attribution: string | null;
  barcode: string | null;
  brandName: string;
  calories: string;
  carbs: string;
  fat: string;
  foodName: string;
  mealSlot: HealthMealEntry["meal_slot"];
  protein: string;
  provider: string | null;
  providerItemId: string | null;
  quantity: string;
  servingLabel: string;
};

type MealEditDraft = {
  calories: string;
  carbs: string;
  date: string;
  fat: string;
  mealSlot: HealthMealEntry["meal_slot"];
  protein: string;
  quantity: string;
  servingLabel: string;
  time: string;
};

const DEFAULT_MEAL_DRAFT: MealDraft = {
  attribution: null,
  barcode: null,
  brandName: "",
  calories: "",
  carbs: "",
  fat: "",
  foodName: "",
  mealSlot: "breakfast",
  protein: "",
  provider: null,
  providerItemId: null,
  quantity: "1",
  servingLabel: "",
};

const EMPTY_FOOD_LOOKUP_RESULTS: HealthFoodLookupResult[] = [];
const DEFAULT_IMPORT_STATUS = "Waiting for an Apple Health export.";

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

export function HealthPage({
  checkIns,
  deleteFavoriteFood,
  deleteMealEntry,
  deleteRecipe,
  deleteSavedMeal,
  deleteWaterEntry,
  deleteWeightEntry,
  favorites,
  importAudits,
  importAppleHealthData,
  isLoading,
  focusCategories,
  focusHistory,
  mealEntries,
  metricEntries,
  profile,
  recipes,
  saveCheckIn,
  saveFavoriteFood,
  saveRecipe,
  savedMeals,
  saveSavedMeal,
  saveProfile,
  addMealEntry,
  addWeightEntry,
  addWaterEntry,
  updateWaterEntry,
  updateMealEntry,
  onStartSleepClock,
  weightEntries,
  waterEntries,
}: HealthPageProps) {
  const [activeTab, setActiveTab] = useState<HealthTab>("Today");
  const [profileDraft, setProfileDraft] = useState<HealthProfileUpdate>({});
  const [mealDraft, setMealDraft] = useState<MealDraft>(DEFAULT_MEAL_DRAFT);
  const [foodSearchQuery, setFoodSearchQuery] = useState("");
  const [customFoodSearchQuery, setCustomFoodSearchQuery] = useState("");
  const [foodHistoryDate, setFoodHistoryDate] = useState(todayHealthDate());
  const [targetWeightDraft, setTargetWeightDraft] = useState("");
  const [barcodeLookup, setBarcodeLookup] = useState("");
  const [foodLookupResults, setFoodLookupResults] = useState<HealthFoodLookupResult[]>(EMPTY_FOOD_LOOKUP_RESULTS);
  const [foodLookupError, setFoodLookupError] = useState("");
  const [foodLookupStatus, setFoodLookupStatus] = useState<"idle" | "searching" | "barcode">("idle");
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealEditDraft, setMealEditDraft] = useState<MealEditDraft>({
    calories: "",
    carbs: "",
    date: todayHealthDate(),
    fat: "",
    mealSlot: "breakfast",
    protein: "",
    quantity: "1",
    servingLabel: "",
    time: "12:00",
  });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerSupport, setScannerSupport] = useState<"checking" | "ready" | "unsupported">("checking");
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
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const today = todayHealthDate();

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
    });
    setTargetWeightDraft(
      profile.target_weight_kg === null
        ? ""
        : formatEditableWeight(profile.target_weight_kg, profile.preferred_weight_unit),
    );
  }, [profile]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const detector = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    const hasCamera = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    setScannerSupport(detector && hasCamera ? "ready" : "unsupported");
  }, []);

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

  const selectedMeals = useMemo(
    () => mealEntries.filter((entry) => entry.entry_date === foodHistoryDate),
    [foodHistoryDate, mealEntries],
  );
  const selectedNutrition = useMemo(
    () => sumMealNutritionForDate(mealEntries, foodHistoryDate),
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
      })
      .slice(0, 8);
  }, [mealEntries]);
  const favoriteFoods = useMemo(
    () => favorites.filter((item) => item.is_favorite),
    [favorites],
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
  const matchingCustomFoods = useMemo(() => {
    const query = customFoodSearchQuery.trim().toLowerCase();
    if (!query) {
      return favorites.slice(0, 8);
    }
    return favorites.filter((item) => [
      item.brand_name,
      item.category,
      item.food_name,
      item.serving_size,
      item.serving_label,
    ].some((value) => value?.toLowerCase().includes(query))).slice(0, 8);
  }, [customFoodSearchQuery, favorites]);
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
  const mealCaloriesValue = Number.parseInt(mealDraft.calories, 10);
  const mealQuantityValue = parsePositiveQuantity(mealDraft.quantity);
  const canSaveMeal = mealDraft.foodName.trim().length > 0 && Number.isFinite(mealCaloriesValue) && mealCaloriesValue >= 0 && mealQuantityValue !== null;
  const weightValue = Number.parseFloat(weightDraft);
  const canSaveWeight = Number.isFinite(weightValue) && weightValue > 0;

  useEffect(() => {
    if (!isScannerOpen || scannerSupport !== "ready" || typeof window === "undefined") {
      return;
    }

    const detectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    const video = scannerVideoRef.current;
    if (!detectorCtor || !video || !navigator.mediaDevices?.getUserMedia) {
      setScannerError("Camera barcode scan is not supported in this browser.");
      return;
    }

    const videoElement = video;
    const detector = new detectorCtor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    let stream: MediaStream | null = null;
    let cancelled = false;
    let frameId = 0;

    async function startScanner() {
      try {
        setScannerError("");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        videoElement.srcObject = stream;
        await videoElement.play();

        const scanFrame = async () => {
          if (cancelled) {
            return;
          }
          try {
            const barcodes = await detector.detect(videoElement);
            const firstCode = barcodes.find((entry) => typeof entry.rawValue === "string" && entry.rawValue.trim().length > 0)?.rawValue?.trim();
            if (firstCode) {
              setBarcodeLookup(firstCode);
              setIsScannerOpen(false);
              void runBarcodeLookup(firstCode);
              return;
            }
          } catch {
            setScannerError("Camera is open, but a barcode has not been detected yet.");
          }
          frameId = window.requestAnimationFrame(() => {
            void scanFrame();
          });
        };

        await scanFrame();
      } catch (error) {
        setScannerError(error instanceof Error ? error.message : "Unable to start the camera scanner.");
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      if (video.srcObject) {
        const mediaStream = video.srcObject as MediaStream;
        mediaStream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isScannerOpen, scannerSupport]);

  if (!profile) {
    return (
      <section className="px-4 pb-32">
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
  const sleepPercent = clampPercent(activeProfile.sleep_goal_minutes ? (todaySleep / activeProfile.sleep_goal_minutes) * 100 : 0);

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

  async function handleSaveMeal() {
    const calories = Number.parseInt(mealDraft.calories, 10);
    const quantity = parsePositiveQuantity(mealDraft.quantity);
    if (!mealDraft.foodName.trim() || !Number.isFinite(calories) || calories < 0 || quantity === null) {
      return;
    }

    const saved = await addMealEntry({
      attribution: mealDraft.attribution,
      barcode: mealDraft.barcode,
      brand_name: emptyToNull(mealDraft.brandName),
      calories: Math.round(calories * quantity),
      carbs_g: scaleNullableNumber(parseNullableNumber(mealDraft.carbs), quantity),
      entry_date: today,
      fat_g: scaleNullableNumber(parseNullableNumber(mealDraft.fat), quantity),
      food_name: mealDraft.foodName.trim(),
      meal_slot: mealDraft.mealSlot,
      protein_g: scaleNullableNumber(parseNullableNumber(mealDraft.protein), quantity),
      provider: mealDraft.provider ?? "manual",
      provider_item_id: mealDraft.providerItemId,
      serving_label: formatQuantityServingLabel(quantity, mealDraft.servingLabel),
    });
    if (saved) {
      setMealDraft((current) => ({ ...DEFAULT_MEAL_DRAFT, mealSlot: current.mealSlot }));
      setCustomFoodSearchQuery("");
    }
  }

  function startEditingMeal(entry: HealthMealEntry) {
    const parsedServing = parseQuantityServingLabel(entry.serving_label ?? "");
    const quantity = parsedServing.quantity;
    setEditingMealId(entry.id);
    setMealEditDraft({
      calories: String(Math.round(entry.calories / quantity)),
      carbs: entry.carbs_g === null ? "" : String(scaleNullableNumber(entry.carbs_g / quantity, 1)),
      date: entry.entry_date,
      fat: entry.fat_g === null ? "" : String(scaleNullableNumber(entry.fat_g / quantity, 1)),
      mealSlot: entry.meal_slot,
      protein: entry.protein_g === null ? "" : String(scaleNullableNumber(entry.protein_g / quantity, 1)),
      quantity: String(quantity),
      servingLabel: parsedServing.servingLabel,
      time: formatTimeInput(entry.logged_at),
    });
  }

  async function saveMealEdit(entryId: string) {
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
      logged_at: buildLoggedAt(mealEditDraft.date, mealEditDraft.time),
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

  async function handleFavoriteReuse(item: HealthFoodLibraryItem) {
    await addMealEntry({
      attribution: item.attribution,
      barcode: item.barcode,
      brand_name: item.brand_name,
      calories: item.calories,
      carbs_g: item.carbs_g,
      entry_date: today,
      fat_g: item.fat_g,
      food_name: item.food_name,
      meal_slot: mealDraft.mealSlot,
      protein_g: item.protein_g,
      provider: item.provider,
      provider_item_id: item.provider_item_id,
      serving_label: item.serving_label,
    });
  }

  async function handleRemoveFavorite(item: HealthFoodLibraryItem) {
    await saveFavoriteFood({
      attribution: item.attribution,
      barcode: item.barcode,
      brand_name: item.brand_name,
      calories: item.calories,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      food_name: item.food_name,
      id: item.id,
      is_favorite: false,
      protein_g: item.protein_g,
      provider: item.provider,
      provider_item_id: item.provider_item_id,
      serving_label: item.serving_label,
    });
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
      food_name: entry.food_name,
      protein_g: entry.protein_g,
      provider: entry.provider,
      provider_item_id: entry.provider_item_id,
      serving_label: entry.serving_label,
      is_favorite: true,
    });
  }

  function isMealSavedAsFavorite(entry: HealthMealEntry) {
    const key = getHealthFoodIdentityKey(entry);
    return key ? favoriteFoodKeys.has(key) : false;
  }

  async function handleFoodSearch() {
    const query = foodSearchQuery.trim();
    if (!query) {
      setFoodLookupResults(EMPTY_FOOD_LOOKUP_RESULTS);
      setFoodLookupError("Type a food name before searching.");
      return;
    }
    setFoodLookupStatus("searching");
    setFoodLookupError("");
    setFoodLookupResults(EMPTY_FOOD_LOOKUP_RESULTS);
    try {
      const results = await searchHealthFoods(query);
      setFoodLookupResults(results);
      if (results.length === 0) {
        setFoodLookupError("No matching foods showed up. You can still log it manually below.");
      }
    } catch (error) {
      setFoodLookupResults(EMPTY_FOOD_LOOKUP_RESULTS);
      setFoodLookupError(error instanceof Error ? error.message : "Food search did not complete.");
    } finally {
      setFoodLookupStatus("idle");
    }
  }

  async function runBarcodeLookup(code: string) {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setFoodLookupResults(EMPTY_FOOD_LOOKUP_RESULTS);
      setFoodLookupError("Type a barcode before looking it up.");
      return;
    }
    setFoodLookupStatus("barcode");
    setFoodLookupError("");
    setFoodLookupResults(EMPTY_FOOD_LOOKUP_RESULTS);
    try {
      const result = await lookupOpenFoodFactsByBarcode(trimmedCode);
      if (!result) {
        setFoodLookupResults(EMPTY_FOOD_LOOKUP_RESULTS);
        setFoodLookupError("No barcode match found. You can type the meal in manually below.");
        return;
      }
      setFoodLookupResults([result]);
    } catch (error) {
      setFoodLookupResults(EMPTY_FOOD_LOOKUP_RESULTS);
      setFoodLookupError(error instanceof Error ? error.message : "Barcode lookup did not complete.");
    } finally {
      setFoodLookupStatus("idle");
    }
  }

  async function handleBarcodeLookup() {
    await runBarcodeLookup(barcodeLookup);
  }

  function applyLookupResult(result: {
    attribution?: string | null;
    barcode?: string | null;
    brandName: string | null;
    calories: number;
    carbs: number | null;
    fat: number | null;
    foodName: string;
    protein: number | null;
    provider?: string | null;
    providerItemId?: string | null;
    servingLabel: string | null;
  }) {
    setCustomFoodSearchQuery(result.brandName ? `${result.brandName} · ${result.foodName}` : result.foodName);
    setMealDraft((current) => ({
      ...current,
      attribution: result.attribution ?? null,
      barcode: result.barcode ?? null,
      brandName: result.brandName ?? "",
      calories: String(result.calories),
      carbs: result.carbs === null ? "" : String(result.carbs),
      fat: result.fat === null ? "" : String(result.fat),
      foodName: result.foodName,
      protein: result.protein === null ? "" : String(result.protein),
      provider: result.provider ?? null,
      providerItemId: result.providerItemId ?? null,
      quantity: "1",
      servingLabel: result.servingLabel ?? "",
    }));
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

  return (
    <section className="px-4 pb-32">
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
            onClick={() => setActiveTab(tab)}
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

      {activeTab === "Journal" ? (
        <div aria-labelledby="health-tab-journal" className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]" id={getHealthTabPanelId("Journal")} role="tabpanel">
          <HealthPanel icon={<HeartPulse />} subtitle="Daily check-in" title="How are you actually doing?">
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <ScorePicker label="Mood" value={journalMood} onSelect={setJournalMood} />
                <ScorePicker label="Energy" value={journalEnergy} onSelect={setJournalEnergy} />
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
                  className="min-h-40 rounded-[1.5rem] border border-[#e6e8f5] bg-white px-4 py-4 text-sm text-[#22304b] outline-none transition focus:border-[#9e8cf9] dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
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
      ) : null}

      {activeTab === "Food" ? (
        <div aria-labelledby="health-tab-food" className="mt-6 grid gap-5 xl:grid-cols-[1.08fr_0.92fr]" id={getHealthTabPanelId("Food")} role="tabpanel">
          <HealthPanel icon={<Salad />} subtitle="Meal logging">
            <HealthCollapsiblePanel
              className="mb-5"
              defaultOpen={false}
              onOpenChange={(isOpen) => {
                if (!isOpen) setIsScannerOpen(false);
              }}
              subtitle="Search public foods, enter a barcode, or scan with the camera."
              title="Search foods and barcodes"
              variant="subpanel"
            >
              <div className="grid gap-3 lg:grid-cols-[1.25fr_auto]">
                <Field label="Search foods">
                  <div className="flex gap-2">
                    <input
                      className="health-input"
                      onChange={(event) => setFoodSearchQuery(event.target.value)}
                      placeholder="Greek yogurt, protein bar, soup"
                      value={foodSearchQuery}
                    />
                    <button
                      className="ui-pill-button-strong-light inline-flex items-center gap-2"
                      disabled={foodLookupStatus !== "idle" || foodSearchQuery.trim().length === 0}
                      onClick={() => { void handleFoodSearch(); }}
                      type="button"
                    >
                      <Search className="h-4 w-4" />
                      Search
                    </button>
                  </div>
                </Field>
                <Field label="Typed barcode">
                  <div className="flex gap-2">
                    <input
                      className="health-input"
                      inputMode="numeric"
                      onChange={(event) => setBarcodeLookup(event.target.value)}
                      placeholder="012345678905"
                      value={barcodeLookup}
                    />
                    <button
                      className="ui-pill-button-strong-light inline-flex items-center gap-2"
                      disabled={foodLookupStatus !== "idle" || barcodeLookup.trim().length === 0}
                      onClick={() => { void handleBarcodeLookup(); }}
                      type="button"
                    >
                      <ScanSearch className="h-4 w-4" />
                      Lookup
                    </button>
                    <button
                      className="ui-pill-button-strong-light inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={scannerSupport !== "ready"}
                      onClick={() => {
                        setScannerError("");
                        setIsScannerOpen(true);
                      }}
                      type="button"
                    >
                      <Camera className="h-4 w-4" />
                      Scan
                    </button>
                  </div>
                </Field>
              </div>
              <p className="text-xs leading-5 text-[#6a7793] dark:text-white/50">
                Search uses USDA FoodData Central when available, with Open Food Facts fallback. Barcode lookup currently uses Open Food Facts.
              </p>
              {scannerSupport === "unsupported" ? (
                <EmptyCopy text="Camera barcode scanning is not available in this browser yet, but typed barcode lookup still works." />
              ) : null}
              {isScannerOpen ? (
                <div className="grid gap-3 rounded-[1.25rem] border border-[#dfe6fb] bg-white/90 p-4 dark:border-white/10 dark:bg-white/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#26324f] dark:text-white">Camera scanner</p>
                      <p className="mt-1 text-xs text-[#73809c] dark:text-white/50">Point the camera at a barcode. The first detected code will fill the lookup automatically.</p>
                    </div>
                    <button
                      aria-label="Close camera scanner"
                      className="rounded-full bg-[#fff1f3] p-2 text-[#d64b5f] dark:bg-[#44232f] dark:text-[#ff9eaf]"
                      onClick={() => setIsScannerOpen(false)}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <video
                    className="w-full overflow-hidden rounded-[1.25rem] border border-[#e5e9f7] bg-[#111827] object-cover dark:border-white/10"
                    muted
                    playsInline
                    ref={scannerVideoRef}
                  />
                  {scannerError ? <EmptyCopy text={scannerError} /> : <InlineNotice text="Camera active. Hold the barcode steady for a moment." />}
                </div>
              ) : null}
              {foodLookupError ? <EmptyCopy text={foodLookupError} /> : null}
              {foodLookupStatus !== "idle" ? <InlineNotice text={foodLookupStatus === "barcode" ? "Looking up barcode..." : "Searching foods..."} /> : null}
              {foodLookupResults.length > 0 ? (
                <div className="grid gap-3">
                  <SectionMiniTitle title="Lookup results" />
                  {foodLookupResults.map((result) => (
                    <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/90 px-4 py-3 dark:border-white/10 dark:bg-white/[0.05]" key={`${result.provider}-${result.providerItemId}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#26324f] dark:text-white">{result.foodName}</p>
                          <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">
                            {result.brandName || "No brand"} / {result.servingLabel || "Serving not listed"} / {result.calories} kcal
                          </p>
                          <p className="mt-2 text-xs text-[#6d7a96] dark:text-white/50">
                            Protein {Math.round(result.protein ?? 0)}g / Carbs {Math.round(result.carbs ?? 0)}g / Fat {Math.round(result.fat ?? 0)}g
                          </p>
                        </div>
                        <button
                          className="ui-pill-button-strong-light"
                          onClick={() => applyLookupResult(result)}
                          type="button"
                        >
                          Use This
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </HealthCollapsiblePanel>

            <div className="grid gap-3 lg:grid-cols-[0.7fr_1.5fr_0.45fr_auto]">
              <Field label="Meal">
                <select
                  className="health-input"
                  onChange={(event) => setMealDraft((current) => ({ ...current, mealSlot: event.target.value as HealthMealEntry["meal_slot"] }))}
                  value={mealDraft.mealSlot}
                >
                  {HEALTH_MEAL_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>{getMealSlotLabel(slot)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Custom food">
                <input
                  className="health-input"
                  onChange={(event) => setCustomFoodSearchQuery(event.target.value)}
                  placeholder="Search custom foods"
                  value={customFoodSearchQuery}
                />
              </Field>
              <Field label="Amount">
                <input className="health-input" inputMode="decimal" onChange={(event) => setMealDraft((current) => ({ ...current, quantity: event.target.value }))} placeholder="1" value={mealDraft.quantity} />
              </Field>
              <div className="flex items-end">
                <button
                  className="ui-pill-button-strong-light disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canSaveMeal}
                  onClick={() => { void handleSaveMeal(); }}
                  type="button"
                >
                  Log
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {matchingCustomFoods.length === 0 ? (
                <EmptyCopy text="No custom foods match this search." />
              ) : matchingCustomFoods.map((item) => (
                <button
                  className={`ui-pill-button-light ${mealDraft.providerItemId === (item.provider_item_id ?? item.id) ? "border-[#b9abff] bg-[#eee9ff] text-[#5f4bd7] dark:border-[#7561d8] dark:bg-[#2a2148] dark:text-[#d8d0ff]" : ""}`}
                  key={item.id}
                  onClick={() => {
                    setCustomFoodSearchQuery(item.brand_name ? `${item.brand_name} · ${item.food_name}` : item.food_name);
                    applyLookupResult({
                      attribution: item.attribution,
                      barcode: item.barcode,
                      brandName: item.brand_name,
                      calories: item.calories,
                      carbs: item.carbs_g,
                      fat: item.fat_g,
                      foodName: item.food_name,
                      protein: item.protein_g,
                      provider: item.provider,
                      providerItemId: item.provider_item_id ?? item.id,
                      servingLabel: item.serving_label,
                    });
                  }}
                  type="button"
                >
                  {item.brand_name ? `${item.brand_name} · ` : ""}{item.food_name}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-3">
              <SectionMiniTitle
                actions={<FoodHistoryDateChip date={foodHistoryDate} onChange={setFoodHistoryDate} today={today} />}
                title={foodHistoryDate === today ? "Today’s Meals" : `Meals — ${formatHealthDateLabel(foodHistoryDate)}`}
              />
              {selectedMeals.length === 0 ? (
                <EmptyCopy text={foodHistoryDate === today ? "Meals logged today will appear here with calories and macros." : "No meals were logged on this date."} />
              ) : (
                HEALTH_MEAL_SLOTS.map((slot) => {
                  const slotMeals = selectedMeals.filter((entry) => entry.meal_slot === slot);
                  const slotCaloriesTotal = slotMeals.reduce((total, entry) => total + entry.calories, 0);
                  return (
                  <section className="grid gap-3" key={slot}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-[#4f5872] dark:text-white/70">{getMealSlotLabel(slot)}</h4>
                      {slotMeals.length > 0 ? (
                        <span className="text-xs font-semibold text-[#74809b] dark:text-white/45">
                          {Math.round(slotCaloriesTotal)} kcal
                        </span>
                      ) : null}
                    </div>
                    {slotMeals.length === 0 ? (
                      <EmptyCopy text={`No ${getMealSlotLabel(slot).toLowerCase()} logged yet.`} />
                    ) : slotMeals.map((entry) => (
                  <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={entry.id}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-[#26324f] dark:text-white">{formatBrandedFoodName(entry)}</p>
                        <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">
                          {getMealSlotLabel(entry.meal_slot)} / {entry.serving_label || "No serving"} / {entry.calories} kcal{formatMealLoggedTime(entry.logged_at) ? ` / ${formatMealLoggedTime(entry.logged_at)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          className="ui-pill-button-light inline-flex items-center gap-1.5"
                          onClick={() => startEditingMeal(entry)}
                          type="button"
                        >
                          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          aria-label={isMealSavedAsFavorite(entry) ? "Saved to favorites" : "Save favorite"}
                          aria-pressed={isMealSavedAsFavorite(entry)}
                          className={`ui-pill-button-light inline-flex items-center gap-1.5 ${isMealSavedAsFavorite(entry) ? "border-[#ffd1dc] bg-[#fff0f4] text-[#d64b6b] dark:border-[#703043] dark:bg-[#341821] dark:text-[#ff9fb5]" : ""}`}
                          onClick={() => { void handleSaveFavoriteFromMeal(entry); }}
                          type="button"
                        >
                          <Heart aria-hidden="true" className="h-4 w-4" fill={isMealSavedAsFavorite(entry) ? "currentColor" : "none"} />
                          <span className="sr-only">Favorite</span>
                        </button>
                        <button className="ui-pill-button-danger-light" onClick={() => { void deleteMealEntry(entry.id); }} type="button">
                          Remove
                        </button>
                      </div>
                    </div>
                    {editingMealId === entry.id ? (
                      <div className="mt-4 grid gap-3 rounded-[1.25rem] border border-[#e8ecfb] bg-[#fbfcff] p-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="grid gap-3 sm:grid-cols-4">
                          <Field label="Amount">
                            <input className="health-input" inputMode="decimal" onChange={(event) => setMealEditDraft((current) => ({ ...current, quantity: event.target.value }))} value={mealEditDraft.quantity} />
                          </Field>
                          <Field label="Date">
                            <input className="health-input" onChange={(event) => setMealEditDraft((current) => ({ ...current, date: event.target.value }))} type="date" value={mealEditDraft.date} />
                          </Field>
                          <Field label="Time">
                            <input className="health-input" onChange={(event) => setMealEditDraft((current) => ({ ...current, time: event.target.value }))} type="time" value={mealEditDraft.time} />
                          </Field>
                          <Field label="Meal">
                            <select
                              className="health-input"
                              onChange={(event) => setMealEditDraft((current) => ({ ...current, mealSlot: event.target.value as HealthMealEntry["meal_slot"] }))}
                              value={mealEditDraft.mealSlot}
                            >
                              {HEALTH_MEAL_SLOTS.map((slot) => (
                                <option key={slot} value={slot}>{getMealSlotLabel(slot)}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
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
                    ))}
                  </section>
                  );
                })
              )}
            </div>
          </HealthPanel>

          <div className="grid gap-5">
            <HealthPanel
              headerActions={<FoodHistoryDateChip date={foodHistoryDate} onChange={setFoodHistoryDate} today={today} />}
              icon={<Target />}
              subtitle="Daily totals"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <CompactStat detail={profile.calorie_goal ? `goal ${profile.calorie_goal}` : "set in goals"} label="Calories" value={String(selectedNutrition.calories)} />
                <CompactStat detail={profile.protein_goal_grams ? `goal ${profile.protein_goal_grams}g` : "set in goals"} label="Protein" value={`${Math.round(selectedNutrition.protein)}g`} />
                <CompactStat detail={profile.carbs_goal_grams ? `goal ${profile.carbs_goal_grams}g` : "set in goals"} label="Carbs" value={`${Math.round(selectedNutrition.carbs)}g`} />
                <CompactStat detail={profile.fat_goal_grams ? `goal ${profile.fat_goal_grams}g` : "set in goals"} label="Fat" value={`${Math.round(selectedNutrition.fat)}g`} />
              </div>
            </HealthPanel>

            <HealthPanel icon={<Sparkles />} subtitle="Favorites">
              <div className="space-y-3">
                {favoriteFoods.length === 0 ? (
                  <EmptyCopy text="Save a meal as a favorite and it will show up here for one-tap reuse." />
                ) : (
                  favoriteFoods.slice(0, 8).map((item) => (
                    <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={item.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#26324f] dark:text-white">{formatBrandedFoodName(item)}</p>
                          <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">{item.serving_label || "Saved favorite"} / {item.calories} kcal</p>
                        </div>
                        <div className="flex gap-2">
                          <button className="ui-pill-button-strong-light" onClick={() => { void handleFavoriteReuse(item); }} type="button">
                            Add Today
                          </button>
                          <button className="ui-pill-button-danger-light" onClick={() => { void handleRemoveFavorite(item); }} type="button">
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </HealthPanel>

            <HealthPanel icon={<Search />} subtitle="Recent foods">
              <div className="space-y-3">
                {recentFoods.length === 0 ? (
                  <EmptyCopy text="Once you log a few meals, your recent foods will show up here for quick draft-filling." />
                ) : (
                  recentFoods.map((item) => (
                    <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={item.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#26324f] dark:text-white">{formatBrandedFoodName(item)}</p>
                          <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">
                            {item.brand_name || "No brand"} / {item.serving_label || "Saved meal"} / {item.calories} kcal
                          </p>
                        </div>
                        <button
                          className="ui-pill-button-strong-light"
                          onClick={() =>
                            applyLookupResult({
                              attribution: item.attribution,
                              barcode: item.barcode,
                              brandName: item.brand_name,
                              calories: item.calories,
                              carbs: item.carbs_g,
                              fat: item.fat_g,
                              foodName: item.food_name,
                              protein: item.protein_g,
                              provider: item.provider,
                              providerItemId: item.provider_item_id ?? item.id,
                              servingLabel: item.serving_label,
                            })
                          }
                          type="button"
                        >
                          Fill Draft
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </HealthPanel>
          </div>
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
          <HealthPanel icon={<MoonStar />} subtitle="Sleep ledger" title="Health sleep totals">
            <div className="grid gap-3 sm:grid-cols-2">
              <CompactStat detail="combined today" label="Today" value={formatSleepMinutes(todaySleep)} />
              <CompactStat detail={profile.sleep_goal_minutes ? `goal ${formatSleepMinutes(profile.sleep_goal_minutes)}` : "set in goals"} label="Goal" value={`${sleepPercent}%`} />
              <CompactStat detail="from Sleep Focus timers" label="Focus Clock" value={formatSleepMinutes(todaySleepTotal.focusMinutes)} />
              <CompactStat detail="from Apple Health imports" label="Imported" value={formatSleepMinutes(todaySleepTotal.importedMinutes)} />
            </div>
            <div className="mt-4 rounded-[1.25rem] border border-[#e6ebfb] bg-white/80 px-4 py-4 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#26324f] dark:text-white">Sleep Focus Clock</p>
                  <p className="mt-1 text-xs leading-5 text-[#73809c] dark:text-white/50">
                    Start or resume a Sleep timer in Focus when you want a manual sleep record.
                  </p>
                </div>
                <button className="ui-pill-button-strong-light" onClick={onStartSleepClock} type="button">
                  Start Sleep Clock
                </button>
              </div>
            </div>
          </HealthPanel>

          <HealthPanel icon={<Activity />} subtitle="Last 7 days" title="Sleep sources">
            <div className="grid gap-3 sm:grid-cols-3">
              <CompactStat detail="combined week" label="Total" value={formatSleepMinutes(recentSleepTotalMinutes)} />
              <CompactStat detail="Sleep Focus timers" label="Clock" value={formatSleepMinutes(recentSleepFocusMinutes)} />
              <CompactStat detail="Apple Health" label="Imported" value={formatSleepMinutes(recentSleepImportedMinutes)} />
            </div>
            <div className="mt-4 space-y-3">
              {recentSleepTotals.map((entry) => (
                <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={entry.date}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthDateLabel(entry.date)}</span>
                    <span className="text-xs font-semibold text-[#74809b] dark:text-white/45">{formatSleepMinutes(entry.totalMinutes)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#6a7793] dark:text-white/55">
                    <MetricPill icon={<MoonStar className="h-3.5 w-3.5" />} label={`${formatSleepMinutes(entry.focusMinutes)} clock`} />
                    <MetricPill icon={<Apple className="h-3.5 w-3.5" />} label={`${formatSleepMinutes(entry.importedMinutes)} import`} />
                  </div>
                </div>
              ))}
            </div>
          </HealthPanel>

          <HealthPanel icon={<Sparkles />} subtitle="Migrated history" title="Recent Sleep Focus sessions">
            <div className="space-y-3">
              {sleepFocusSessions.length === 0 ? (
                <EmptyCopy text="Sleep Focus timer sessions will appear here after you log them from the Sleep clock." />
              ) : (
                sleepFocusSessions.slice(0, 8).map((session) => (
                  <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={session.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#26324f] dark:text-white">{session.title}</p>
                        <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">{formatHealthDateLabel(session.date)}</p>
                      </div>
                      <span className="text-sm font-semibold text-[#26324f] dark:text-white">{formatSleepMinutes(session.durationSeconds / 60)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </HealthPanel>
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#22304b] dark:text-white">{importPreview.fileName}</p>
                    <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">
                      {importPreview.startDate ? formatHealthDateLabel(importPreview.startDate) : "Unknown start"} to {importPreview.endDate ? formatHealthDateLabel(importPreview.endDate) : "Unknown end"}
                    </p>
                  </div>
                  <button
                    className="rounded-full bg-[#6f57f6] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#cabfff] dark:text-[#1a1431]"
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
  children,
  headerActions,
  icon,
  subtitle,
  title,
}: {
  children: ReactNode;
  headerActions?: ReactNode;
  icon: ReactNode;
  subtitle: string;
  title?: string;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="rounded-[2rem] border border-[#ece8f8] bg-white/85 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center gap-2 px-5 py-5">
        <button
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[#6f57f6] dark:text-[#cabfff] [&_svg]:h-6 [&_svg]:w-6">
              {icon}
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{subtitle}</span>
              {title ? <span className="mt-1 block text-xl font-black text-[#1e2744] dark:text-white">{title}</span> : null}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-[#8d87a7] transition-transform dark:text-white/45 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
        {headerActions}
      </div>
      {isOpen ? <div className="px-5 pb-5 pt-4">{children}</div> : null}
    </div>
  );
}

function CompactStat({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#1e2744] dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-[#73809c] dark:text-white/50">{detail}</p>
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

function formatSleepMinutes(minutes: number) {
  const roundedMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  if (hours === 0) {
    return `${remainingMinutes}m`;
  }
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

function ScorePicker({
  label,
  onSelect,
  value,
}: {
  label: string;
  onSelect: (value: number) => void;
  value: number | null;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{label}</p>
      <div className="mt-2 flex gap-2">
        {HEALTH_MOOD_OPTIONS.map((score) => (
          <button
            aria-label={`${label} ${score} out of 5`}
            aria-pressed={value === score}
            className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition ${
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

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{label}</span>
      {children}
    </label>
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
  date,
  onChange,
  today,
}: {
  date: string;
  onChange: (date: string) => void;
  today: string;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <label className="relative inline-flex items-center">
        <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-[#6f57f6]" />
        <input
          aria-label="Food history date"
          className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_LIST_CHIP_CLASS} min-w-[9.5rem] pl-7`}
          max={today}
          onChange={(event) => onChange(event.target.value || today)}
          type="date"
          value={date}
        />
      </label>
      {date !== today ? <AdhdChip onClick={() => onChange(today)}>Today</AdhdChip> : null}
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
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
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

function buildLoggedAt(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function formatTimeInput(loggedAt: string) {
  const date = new Date(loggedAt);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function formatBrandedFoodName(food: Pick<HealthMealEntry | HealthFoodLibraryItem, "brand_name" | "food_name">) {
  return food.brand_name?.trim()
    ? `${food.brand_name.trim()} · ${food.food_name}`
    : food.food_name;
}

function getHealthTabPanelId(tab: HealthTab) {
  return `health-panel-${tab.toLowerCase()}`;
}

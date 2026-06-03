"use client";

import { Activity, Apple, Camera, HeartPulse, MoonStar, Salad, Scale, ScanSearch, Search, Sparkles, Target, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type {
  HealthAchievementAward,
  HealthCheckIn,
  HealthFoodLibraryItem,
  HealthImportAudit,
  HealthMealEntry,
  HealthMetricEntry,
  HealthProfile,
  HealthProfileUpdate,
  HealthWeightEntry,
} from "@/lib/database.types";
import {
  parseAppleHealthFileInWorker,
  type AppleHealthImportParseProgress,
  type AppleHealthImportPreview,
} from "@/lib/health-apple-import";
import type { HealthImportSaveProgress } from "@/hooks/useHealth";
import {
  ACHIEVEMENT_SET_META,
  type AchievementFaceLevel,
  buildHealthFaceSummaries,
} from "@/lib/achievements";
import {
  buildHealthCoachMessage,
  clampPercent,
  displayWeightToKilograms,
  formatHealthDateLabel,
  formatWeight,
  getEligibleHealthAchievements,
  getLatestWeight,
  getMealSlotLabel,
  getWeightTrend,
  HEALTH_MEAL_SLOTS,
  HEALTH_MOOD_OPTIONS,
  HEALTH_REMINDER_TEMPLATES,
  type HealthReminderTemplateKey,
  HEALTH_SYMPTOM_TAGS,
  HEALTH_TABS,
  kilogramsToDisplayValue,
  sumMealNutritionForDate,
  sumMetricValueForDate,
  todayHealthDate,
  type HealthTab,
} from "@/lib/health-utils";
import {
  lookupOpenFoodFactsByBarcode,
  searchHealthFoods,
  type HealthFoodLookupResult,
} from "@/lib/health-nutrition";
import { DieFaceTile } from "./achievement-dice-ui";
import { PageShellHeader } from "./page-shell-header";

type HealthPageProps = {
  awards: HealthAchievementAward[];
  checkIns: HealthCheckIn[];
  deleteFavoriteFood: (itemId: string) => Promise<boolean>;
  deleteMealEntry: (entryId: string) => Promise<boolean>;
  deleteWeightEntry: (entryId: string) => Promise<boolean>;
  favorites: HealthFoodLibraryItem[];
  importAudits: HealthImportAudit[];
  importAppleHealthData: (
    preview: AppleHealthImportPreview,
    options?: { onProgress?: (progress: HealthImportSaveProgress) => void },
  ) => Promise<boolean>;
  isLoading: boolean;
  mealEntries: HealthMealEntry[];
  metricEntries: HealthMetricEntry[];
  profile: HealthProfile | null;
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
    calories: number;
    carbs_g?: number | null;
    fat_g?: number | null;
    food_name: string;
    id?: string;
    protein_g?: number | null;
    provider?: string;
    provider_item_id?: string | null;
    serving_label?: string | null;
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
  storageMode: "local" | "remote";
  onOpenReminderTemplate: (templateKey: HealthReminderTemplateKey) => void;
  weightEntries: HealthWeightEntry[];
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
  servingLabel: string;
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
  awards,
  checkIns,
  deleteFavoriteFood,
  deleteMealEntry,
  deleteWeightEntry,
  favorites,
  importAudits,
  importAppleHealthData,
  isLoading,
  mealEntries,
  metricEntries,
  profile,
  saveCheckIn,
  saveFavoriteFood,
  saveProfile,
  addMealEntry,
  addWeightEntry,
  storageMode,
  onOpenReminderTemplate,
  weightEntries,
}: HealthPageProps) {
  const [activeTab, setActiveTab] = useState<HealthTab>("Today");
  const [profileDraft, setProfileDraft] = useState<HealthProfileUpdate>({});
  const [mealDraft, setMealDraft] = useState<MealDraft>(DEFAULT_MEAL_DRAFT);
  const [foodSearchQuery, setFoodSearchQuery] = useState("");
  const [barcodeLookup, setBarcodeLookup] = useState("");
  const [foodLookupResults, setFoodLookupResults] = useState<HealthFoodLookupResult[]>(EMPTY_FOOD_LOOKUP_RESULTS);
  const [foodLookupError, setFoodLookupError] = useState("");
  const [foodLookupStatus, setFoodLookupStatus] = useState<"idle" | "searching" | "barcode">("idle");
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
      preferred_weight_unit: profile.preferred_weight_unit,
      protein_goal_grams: profile.protein_goal_grams,
      sleep_goal_minutes: profile.sleep_goal_minutes,
      target_weight_kg: profile.target_weight_kg,
    });
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

  const todayMeals = useMemo(
    () => mealEntries.filter((entry) => entry.entry_date === today),
    [mealEntries, today],
  );
  const todayNutrition = useMemo(
    () => sumMealNutritionForDate(mealEntries, today),
    [mealEntries, today],
  );
  const todayMovement = useMemo(
    () => sumMetricValueForDate(metricEntries, today, ["steps", "active_energy_kcal", "exercise_minutes"]),
    [metricEntries, today],
  );
  const todaySleep = useMemo(
    () => sumMetricValueForDate(metricEntries, today, ["sleep_minutes"]),
    [metricEntries, today],
  );
  const latestWeight = useMemo(() => getLatestWeight(weightEntries), [weightEntries]);
  const weightTrend30 = useMemo(() => getWeightTrend(weightEntries, 30), [weightEntries]);
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
  const recentWeekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const offset = 6 - index;
      const date = new Date(`${today}T12:00:00`);
      date.setDate(date.getDate() - offset);
      return date.toISOString().slice(0, 10);
    }),
    [today],
  );
  const coachMessage = useMemo(() => {
    if (!profile) {
      return "";
    }
    return buildHealthCoachMessage({
      checkIns,
      mealEntries,
      metricEntries,
      profile,
      weights: weightEntries,
    });
  }, [checkIns, mealEntries, metricEntries, profile, weightEntries]);
  const lockedAchievements = useMemo(
    () =>
      getEligibleHealthAchievements({
        awards: [],
        checkIns,
        mealEntries,
        metricEntries,
        weightEntries,
      }).map((achievement) => achievement.code),
    [checkIns, mealEntries, metricEntries, weightEntries],
  );
  const healthFaceSummaries = useMemo(
    () => buildHealthFaceSummaries({
      earnedCodes: awards.map((award) => award.achievement_code),
      readyCodes: lockedAchievements,
    }),
    [awards, lockedAchievements],
  );
  const earnedHealthFaces = healthFaceSummaries.filter((face) => face.status === "earned").length;
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
  const canSaveMeal = mealDraft.foodName.trim().length > 0 && Number.isFinite(mealCaloriesValue) && mealCaloriesValue >= 0;
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
        video.srcObject = stream;
        await video.play();

        const scanFrame = async () => {
          if (cancelled) {
            return;
          }
          try {
            const barcodes = await detector.detect(video);
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
        <PageShellHeader subtitle="Wellness Ledger" title="Health" />
        <div className="rounded-[2rem] border border-[#ece8f8] bg-white/90 p-6 text-sm text-[#6e7892] shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/65">
          {isLoading ? "Loading Health..." : "Health becomes available after sign-in."}
        </div>
      </section>
    );
  }

  const nutritionPercent = clampPercent(profile.calorie_goal ? (todayNutrition.calories / profile.calorie_goal) * 100 : 0);
  const movementPercent = clampPercent(profile.movement_goal ? (todayMovement / profile.movement_goal) * 100 : 0);
  const sleepPercent = clampPercent(profile.sleep_goal_minutes ? (todaySleep / profile.sleep_goal_minutes) * 100 : 0);
  const checkInPercent = todayCheckIn ? 100 : 0;

  async function handleSaveProfile() {
    await saveProfile({
      ...profileDraft,
      calorie_goal: parseNullableInteger(profileDraft.calorie_goal),
      carbs_goal_grams: parseNullableInteger(profileDraft.carbs_goal_grams),
      fat_goal_grams: parseNullableInteger(profileDraft.fat_goal_grams),
      movement_goal: parseNullableInteger(profileDraft.movement_goal),
      protein_goal_grams: parseNullableInteger(profileDraft.protein_goal_grams),
      sleep_goal_minutes: parseNullableInteger(profileDraft.sleep_goal_minutes),
      target_weight_kg: parseNullableNumber(profileDraft.target_weight_kg),
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
    if (!mealDraft.foodName.trim() || !Number.isFinite(calories) || calories < 0) {
      return;
    }

    const saved = await addMealEntry({
      attribution: mealDraft.attribution,
      barcode: mealDraft.barcode,
      brand_name: emptyToNull(mealDraft.brandName),
      calories,
      carbs_g: parseNullableNumber(mealDraft.carbs),
      entry_date: today,
      fat_g: parseNullableNumber(mealDraft.fat),
      food_name: mealDraft.foodName.trim(),
      meal_slot: mealDraft.mealSlot,
      protein_g: parseNullableNumber(mealDraft.protein),
      provider: mealDraft.provider ?? "manual",
      provider_item_id: mealDraft.providerItemId,
      serving_label: emptyToNull(mealDraft.servingLabel),
    });
    if (saved) {
      setMealDraft(DEFAULT_MEAL_DRAFT);
    }
  }

  async function handleSaveWeight() {
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

  async function handleSaveFavoriteFromMeal(entry: HealthMealEntry) {
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
    });
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
      <PageShellHeader subtitle="Wellness Ledger" title="Health" />

      <div className="rounded-[2rem] border border-[#e9ecff] bg-[radial-gradient(circle_at_top_left,_rgba(118,214,172,0.28),_transparent_32%),linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] p-5 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,_rgba(125,228,184,0.12),_transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.03)_100%)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7d8ba4] dark:text-white/40">
              Daily Ledger
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-[#19243b] dark:text-white">
              A calmer picture of today
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66728f] dark:text-white/60">
              {coachMessage}
            </p>
          </div>
          <div className="rounded-full bg-[#f3f8f5] px-4 py-2 text-xs font-semibold text-[#247a5e] dark:bg-[#163226] dark:text-[#9ee0be]">
            {storageMode === "remote" ? "Synced to workspace" : "Local-only until health tables are migrated"}
          </div>
        </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
          <WellnessRing colorEnd="#23a26c" colorStart="#7ddfb5" detail={`${todayNutrition.calories}${profile.calorie_goal ? ` / ${profile.calorie_goal}` : ""} kcal`} label="Nutrition" value={nutritionPercent} />
          <WellnessRing colorEnd="#3f82f8" colorStart="#7bb8ff" detail={`${Math.round(todayMovement)}${profile.movement_goal ? ` / ${profile.movement_goal}` : ""}`} label="Movement" value={movementPercent} />
          <WellnessRing colorEnd="#f08f39" colorStart="#ffbe82" detail={`${Math.round(todaySleep)}${profile.sleep_goal_minutes ? ` / ${profile.sleep_goal_minutes}` : ""} min`} label="Sleep" value={sleepPercent} />
          <WellnessRing colorEnd="#da5f87" colorStart="#f59cb7" detail={todayCheckIn ? "Completed today" : "Still open"} label="Check-In" value={checkInPercent} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <LedgerAction label="Quick Add Meal" onClick={() => setActiveTab("Food")} />
          <LedgerAction label="Today Check-In" onClick={() => setActiveTab("Journal")} />
          <LedgerAction label="Log Weight" onClick={() => setActiveTab("Weight")} />
          <LedgerAction label="Import Insights" onClick={() => setActiveTab("Insights")} />
        </div>
      </div>

      <div aria-label="Health sections" className="mt-5 flex flex-wrap gap-2" role="tablist">
        {HEALTH_TABS.map((tab) => (
          <button
            aria-controls={getHealthTabPanelId(tab)}
            aria-selected={activeTab === tab}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab
                ? "bg-[#6f57f6] text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)] dark:bg-[#cabfff] dark:text-[#1a1431]"
                : "bg-[#f1effa] text-[#5f56a5] hover:bg-[#ebe6ff] dark:bg-white/8 dark:text-white/70 dark:hover:bg-white/12"
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
        <div aria-labelledby="health-tab-today" className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_0.95fr]" id={getHealthTabPanelId("Today")} role="tabpanel">
          <HealthPanel
            icon={<Sparkles className="h-4 w-4" />}
            subtitle="This week"
            title="7-day rhythm"
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {recentWeekDates.map((dateKey) => {
                const dayMeals = sumMealNutritionForDate(mealEntries, dateKey);
                const dayCheckIn = checkIns.find((entry) => entry.entry_date === dateKey);
                const dayWeight = weightEntries.find((entry) => entry.entry_date === dateKey);
                return (
                  <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={dateKey}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthDateLabel(dateKey)}</p>
                      <span className="text-xs text-[#7c88a3] dark:text-white/45">{dayCheckIn ? "Checked in" : "Open"}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[#6b7591] dark:text-white/55">
                      <MetricPill icon={<Salad className="h-3.5 w-3.5" />} label={`${dayMeals.calories} kcal`} />
                      <MetricPill icon={<MoonStar className="h-3.5 w-3.5" />} label={`${Math.round(sumMetricValueForDate(metricEntries, dateKey, ["sleep_minutes"]))}m`} />
                      <MetricPill icon={<Scale className="h-3.5 w-3.5" />} label={dayWeight ? formatWeight(dayWeight.weight_kg, profile.preferred_weight_unit) : "No weight"} />
                    </div>
                  </div>
                );
              })}
            </div>
          </HealthPanel>

          <div className="grid gap-5">
            <HealthPanel icon={<HeartPulse className="h-4 w-4" />} subtitle="Snapshot" title="Today at a glance">
              <div className="grid gap-3 sm:grid-cols-2">
                <CompactStat detail="logged today" label="Meals" value={String(todayMeals.length)} />
                <CompactStat detail="latest entry" label="Weight" value={latestWeight ? formatWeight(latestWeight.weight_kg, profile.preferred_weight_unit) : "None"} />
                <CompactStat detail="imported today" label="Sleep" value={`${Math.round(todaySleep)}m`} />
                <CompactStat detail="movement signal" label="Activity" value={`${Math.round(todayMovement)}`} />
              </div>
            </HealthPanel>

            <HealthPanel icon={<Target className="h-4 w-4" />} subtitle="Goals" title="Current targets">
              <div className="grid gap-3 sm:grid-cols-2">
                <GoalBadge label="Calories" value={profile.calorie_goal ? `${profile.calorie_goal} kcal` : "Unset"} />
                <GoalBadge label="Protein" value={profile.protein_goal_grams ? `${profile.protein_goal_grams} g` : "Unset"} />
                <GoalBadge label="Movement" value={profile.movement_goal ? `${profile.movement_goal}` : "Unset"} />
                <GoalBadge label="Target Weight" value={formatWeight(profile.target_weight_kg, profile.preferred_weight_unit)} />
              </div>
            </HealthPanel>

            <HealthPanel icon={<Sparkles className="h-4 w-4" />} subtitle="Task handoff" title="Set gentle reminders">
              <div className="grid gap-3">
                {HEALTH_REMINDER_TEMPLATES.map((template) => (
                  <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={template.key}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#26324f] dark:text-white">{template.title}</p>
                        <p className="mt-1 text-xs leading-5 text-[#73809c] dark:text-white/50">{template.description}</p>
                      </div>
                      <button
                        className="rounded-full bg-[#eef3ff] px-3 py-1.5 text-xs font-semibold text-[#4e5ec8] dark:bg-[#1d2342] dark:text-[#c4d1ff]"
                        onClick={() => onOpenReminderTemplate(template.key)}
                        type="button"
                      >
                        Open in Tasks
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </HealthPanel>
          </div>
        </div>
      ) : null}

      {activeTab === "Journal" ? (
        <div aria-labelledby="health-tab-journal" className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]" id={getHealthTabPanelId("Journal")} role="tabpanel">
          <HealthPanel icon={<HeartPulse className="h-4 w-4" />} subtitle="Daily check-in" title="How are you actually doing?">
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
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          selected
                            ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
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
                  className="rounded-full bg-[#6f57f6] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)] dark:bg-[#cabfff] dark:text-[#1a1431]"
                  onClick={() => { void handleSaveJournal(); }}
                  type="button"
                >
                  Save Check-In
                </button>
              </div>
            </div>
          </HealthPanel>

          <HealthPanel icon={<Sparkles className="h-4 w-4" />} subtitle="History" title="Recent check-ins">
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
          <HealthPanel icon={<Salad className="h-4 w-4" />} subtitle="Meal logging" title="Capture food without friction">
            <div className="mb-5 grid gap-4 rounded-[1.5rem] border border-[#e9ecff] bg-[linear-gradient(180deg,#fcfbff_0%,#f8fbff_100%)] p-4 dark:border-white/10 dark:bg-white/[0.03]">
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
                      className="inline-flex items-center gap-2 rounded-full bg-[#eef3ff] px-4 py-2 text-sm font-semibold text-[#4e5ec8] dark:bg-[#1d2342] dark:text-[#c4d1ff]"
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
                      className="inline-flex items-center gap-2 rounded-full bg-[#eef7f2] px-4 py-2 text-sm font-semibold text-[#23865f] dark:bg-[#173324] dark:text-[#9ce0bc]"
                      disabled={foodLookupStatus !== "idle" || barcodeLookup.trim().length === 0}
                      onClick={() => { void handleBarcodeLookup(); }}
                      type="button"
                    >
                      <ScanSearch className="h-4 w-4" />
                      Lookup
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-full bg-[#f4efff] px-4 py-2 text-sm font-semibold text-[#6f57f6] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#22193f] dark:text-[#cabfff]"
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
                Search uses USDA FoodData Central when available, with Open Food Facts fallback. Barcode lookup currently uses Open Food Facts. If a result is off or missing, the manual form below stays editable so your saved totals stay accurate.
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
                          className="rounded-full bg-[#6f57f6] px-4 py-2 text-xs font-semibold text-white shadow-[0_14px_32px_rgba(111,87,246,0.2)] dark:bg-[#cabfff] dark:text-[#1a1431]"
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
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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
              <Field label="Calories">
                <input className="health-input" inputMode="numeric" onChange={(event) => setMealDraft((current) => ({ ...current, calories: event.target.value }))} placeholder="420" value={mealDraft.calories} />
              </Field>
              <Field label="Food name">
                <input className="health-input" onChange={(event) => setMealDraft((current) => ({ ...current, foodName: event.target.value }))} placeholder="Chicken bowl" value={mealDraft.foodName} />
              </Field>
              <Field label="Brand">
                <input className="health-input" onChange={(event) => setMealDraft((current) => ({ ...current, brandName: event.target.value }))} placeholder="Optional" value={mealDraft.brandName} />
              </Field>
              <Field label="Serving">
                <input className="health-input" onChange={(event) => setMealDraft((current) => ({ ...current, servingLabel: event.target.value }))} placeholder="1 bowl / 180 g" value={mealDraft.servingLabel} />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Protein">
                  <input className="health-input" inputMode="decimal" onChange={(event) => setMealDraft((current) => ({ ...current, protein: event.target.value }))} placeholder="30" value={mealDraft.protein} />
                </Field>
                <Field label="Carbs">
                  <input className="health-input" inputMode="decimal" onChange={(event) => setMealDraft((current) => ({ ...current, carbs: event.target.value }))} placeholder="40" value={mealDraft.carbs} />
                </Field>
                <Field label="Fat">
                  <input className="health-input" inputMode="decimal" onChange={(event) => setMealDraft((current) => ({ ...current, fat: event.target.value }))} placeholder="14" value={mealDraft.fat} />
                </Field>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="rounded-full bg-[#6f57f6] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#cabfff] dark:text-[#1a1431]"
                disabled={!canSaveMeal}
                onClick={() => { void handleSaveMeal(); }}
                type="button"
              >
                Save Meal
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              <SectionMiniTitle title="Today’s Meals" />
              {todayMeals.length === 0 ? (
                <EmptyCopy text="Meals logged today will appear here with calories and macros." />
              ) : (
                todayMeals.map((entry) => (
                  <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={entry.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#26324f] dark:text-white">{entry.food_name}</p>
                        <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">
                          {getMealSlotLabel(entry.meal_slot)} / {entry.serving_label || "No serving"} / {entry.calories} kcal
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded-full bg-[#eef7f2] px-3 py-1.5 text-xs font-semibold text-[#23865f] dark:bg-[#173324] dark:text-[#9ce0bc]" onClick={() => { void handleSaveFavoriteFromMeal(entry); }} type="button">
                          Save Favorite
                        </button>
                        <button className="rounded-full bg-[#fff1f3] px-3 py-1.5 text-xs font-semibold text-[#d64b5f] dark:bg-[#44232f] dark:text-[#ff9eaf]" onClick={() => { void deleteMealEntry(entry.id); }} type="button">
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </HealthPanel>

          <div className="grid gap-5">
            <HealthPanel icon={<Target className="h-4 w-4" />} subtitle="Daily totals" title="Nutrition targets">
              <div className="grid gap-3 sm:grid-cols-2">
                <CompactStat detail={profile.calorie_goal ? `goal ${profile.calorie_goal}` : "set in goals"} label="Calories" value={String(todayNutrition.calories)} />
                <CompactStat detail={profile.protein_goal_grams ? `goal ${profile.protein_goal_grams}g` : "set in goals"} label="Protein" value={`${Math.round(todayNutrition.protein)}g`} />
                <CompactStat detail={profile.carbs_goal_grams ? `goal ${profile.carbs_goal_grams}g` : "set in goals"} label="Carbs" value={`${Math.round(todayNutrition.carbs)}g`} />
                <CompactStat detail={profile.fat_goal_grams ? `goal ${profile.fat_goal_grams}g` : "set in goals"} label="Fat" value={`${Math.round(todayNutrition.fat)}g`} />
              </div>
            </HealthPanel>

            <HealthPanel icon={<Sparkles className="h-4 w-4" />} subtitle="Favorites" title="Fast reuse">
              <div className="space-y-3">
                {favorites.length === 0 ? (
                  <EmptyCopy text="Save a meal as a favorite and it will show up here for one-tap reuse." />
                ) : (
                  favorites.slice(0, 8).map((item) => (
                    <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={item.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#26324f] dark:text-white">{item.food_name}</p>
                          <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">{item.serving_label || "Saved favorite"} / {item.calories} kcal</p>
                        </div>
                        <div className="flex gap-2">
                          <button className="rounded-full bg-[#eef7f2] px-3 py-1.5 text-xs font-semibold text-[#23865f] dark:bg-[#173324] dark:text-[#9ce0bc]" onClick={() => { void handleFavoriteReuse(item); }} type="button">
                            Add Today
                          </button>
                          <button className="rounded-full bg-[#fff1f3] px-3 py-1.5 text-xs font-semibold text-[#d64b5f] dark:bg-[#44232f] dark:text-[#ff9eaf]" onClick={() => { void deleteFavoriteFood(item.id); }} type="button">
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </HealthPanel>

            <HealthPanel icon={<Search className="h-4 w-4" />} subtitle="Recent foods" title="Reuse what you already eat">
              <div className="space-y-3">
                {recentFoods.length === 0 ? (
                  <EmptyCopy text="Once you log a few meals, your recent foods will show up here for quick draft-filling." />
                ) : (
                  recentFoods.map((item) => (
                    <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={item.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#26324f] dark:text-white">{item.food_name}</p>
                          <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">
                            {item.brand_name || "No brand"} / {item.serving_label || "Saved meal"} / {item.calories} kcal
                          </p>
                        </div>
                        <button
                          className="rounded-full bg-[#eef3ff] px-3 py-1.5 text-xs font-semibold text-[#4e5ec8] dark:bg-[#1d2342] dark:text-[#c4d1ff]"
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
        </div>
      ) : null}

      {activeTab === "Weight" ? (
        <div aria-labelledby="health-tab-weight" className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]" id={getHealthTabPanelId("Weight")} role="tabpanel">
          <HealthPanel icon={<Scale className="h-4 w-4" />} subtitle="Weigh-in" title="Track trend, not perfection">
            <div className="grid gap-4 sm:grid-cols-[0.8fr_1.2fr]">
              <Field label={`Weight (${profile.preferred_weight_unit})`}>
                <input className="health-input" inputMode="decimal" onChange={(event) => setWeightDraft(event.target.value)} placeholder={profile.preferred_weight_unit === "kg" ? "78.2" : "172.4"} value={weightDraft} />
              </Field>
              <Field label="Note">
                <input className="health-input" onChange={(event) => setWeightNote(event.target.value)} placeholder="Optional context" value={weightNote} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button className="rounded-full bg-[#6f57f6] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#cabfff] dark:text-[#1a1431]" disabled={!canSaveWeight} onClick={() => { void handleSaveWeight(); }} type="button">
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

          <HealthPanel icon={<Activity className="h-4 w-4" />} subtitle="30 days" title="Recent trend">
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
                          <button className="rounded-full bg-[#fff1f3] px-3 py-1.5 text-xs font-semibold text-[#d64b5f] dark:bg-[#44232f] dark:text-[#ff9eaf]" onClick={() => { void deleteWeightEntry(entry.id); }} type="button">
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

      {activeTab === "Insights" ? (
        <div aria-labelledby="health-tab-insights" className="mt-6 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]" id={getHealthTabPanelId("Insights")} role="tabpanel">
          <HealthPanel icon={<Apple className="h-4 w-4" />} subtitle="Import pathway" title="Apple Health groundwork">
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

          <HealthPanel icon={<MoonStar className="h-4 w-4" />} subtitle="Imported trends" title="What will appear here">
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
        <div aria-labelledby="health-tab-awards" className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]" id={getHealthTabPanelId("Awards")} role="tabpanel">
          <HealthPanel icon={<Trophy className="h-4 w-4" />} subtitle="Earned" title="Care achievements">
            <div className="space-y-3">
              {awards.length === 0 ? (
                <EmptyCopy text="Health awards will appear as your check-ins, meals, and trends build up." />
              ) : (
                awards.map((award) => (
                  <div className="rounded-[1.25rem] border border-[#f0e3ba] bg-[linear-gradient(180deg,#fff8e6_0%,#fffdf7_100%)] px-4 py-3 dark:border-[#4b3d12] dark:bg-[linear-gradient(180deg,rgba(255,229,143,0.12)_0%,rgba(255,255,255,0.03)_100%)]" key={award.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#43330a] dark:text-[#ffe4a3]">{award.title}</p>
                        <p className="mt-1 text-xs text-[#7e6b34] dark:text-[#e7d6a1]/75">{award.description}</p>
                      </div>
                      <div className="text-right text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]">
                        <div>+{award.awarded_points} pts</div>
                        <div>+{award.awarded_xp} xp</div>
                        {award.awarded_tokens > 0 ? <div>+{award.awarded_tokens} tok</div> : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </HealthPanel>

          <HealthPanel icon={<Sparkles className="h-4 w-4" />} subtitle="Care set" title="Health die faces">
            <div className="rounded-[1.5rem] border border-[#d8ebdf] bg-[linear-gradient(135deg,#f6fff8_0%,#fbfcff_62%,#f3fff5_100%)] p-4 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(17,40,27,0.72),rgba(17,24,40,0.5))]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6d9b7c] dark:text-[#a5d7b8]/70">
                    Unified set
                  </p>
                  <h4 className="mt-1 text-2xl font-black text-[#214130] dark:text-white">Health</h4>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-[#5e7c69] dark:text-white/58">
                    The Health page now tracks the same dice-face language as Achievements, while keeping your care tools local and gentle.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <DieFaceTile
                    accent={ACHIEVEMENT_SET_META.health.accent}
                    face={Math.max(1, earnedHealthFaces || 1) as AchievementFaceLevel}
                    glow={earnedHealthFaces === healthFaceSummaries.length}
                    size="md"
                  />
                  <div className="rounded-[1.2rem] bg-white/75 px-4 py-3 text-right shadow-[0_12px_24px_rgba(74,176,114,0.1)] dark:bg-white/[0.06]">
                    <p className="text-2xl font-black text-[#214130] dark:text-white">{earnedHealthFaces} / {healthFaceSummaries.length}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6d9b7c] dark:text-[#a5d7b8]/70">faces lit</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {healthFaceSummaries.map((face) => (
                  <div
                    className={`rounded-[1.35rem] border px-4 py-4 ${
                      face.status === "earned"
                        ? "border-[#d8ebdf] bg-white/88 dark:border-white/10 dark:bg-white/[0.06]"
                        : face.status === "ready"
                          ? "border-[#dfe3fb] bg-[#f8f5ff] dark:border-white/10 dark:bg-[#21193f]/45"
                          : "border-dashed border-[#d4dcf5] bg-[#fbfcff] dark:border-white/10 dark:bg-white/[0.03]"
                    }`}
                    key={face.definition.id}
                  >
                    <div className="flex items-start gap-4">
                      <DieFaceTile
                        accent={ACHIEVEMENT_SET_META.health.accent}
                        face={face.definition.face}
                        glow={face.status === "earned"}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7f8aa1] dark:text-white/40">
                              Face {face.definition.face}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#26324f] dark:text-white">{face.definition.title}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                            face.status === "earned"
                              ? "bg-[#eef7f2] text-[#23865f] dark:bg-[#173324] dark:text-[#9ce0bc]"
                              : face.status === "ready"
                                ? "bg-[#f4efff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"
                                : "bg-[#eef2fb] text-[#74809b] dark:bg-white/8 dark:text-white/55"
                          }`}>
                            {face.status === "earned" ? "Earned" : face.status === "ready" ? "Ready to claim" : "In progress"}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[#7080a0] dark:text-white/55">{face.definition.description}</p>
                        <p className="mt-2 text-sm font-medium text-[#4f7b61] dark:text-[#b9ecc8]">{face.definition.encouragement}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </HealthPanel>
        </div>
      ) : null}

      <div className="mt-8 rounded-[2rem] border border-[#ece8f8] bg-white/85 p-5 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8d87a7] dark:text-white/40">Health settings</p>
            <h3 className="mt-2 text-2xl font-black text-[#1d2744] dark:text-white">Goals and display</h3>
          </div>
          <button className="rounded-full bg-[#6f57f6] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)] dark:bg-[#cabfff] dark:text-[#1a1431]" onClick={() => { void handleSaveProfile(); }} type="button">
            Save Goals
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Weight unit">
            <select className="health-input" onChange={(event) => setProfileDraft((current) => ({ ...current, preferred_weight_unit: event.target.value as HealthProfile["preferred_weight_unit"] }))} value={profileDraft.preferred_weight_unit ?? profile.preferred_weight_unit}>
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
          <Field label="Movement goal">
            <input className="health-input" inputMode="numeric" onChange={(event) => setProfileDraft((current) => ({ ...current, movement_goal: event.target.value as unknown as number }))} value={String(profileDraft.movement_goal ?? "")} />
          </Field>
          <Field label="Sleep goal (min)">
            <input className="health-input" inputMode="numeric" onChange={(event) => setProfileDraft((current) => ({ ...current, sleep_goal_minutes: event.target.value as unknown as number }))} value={String(profileDraft.sleep_goal_minutes ?? "")} />
          </Field>
          <Field label={`Target weight (${profileDraft.preferred_weight_unit ?? profile.preferred_weight_unit})`}>
            <input
              className="health-input"
              inputMode="decimal"
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  target_weight_kg: event.target.value
                    ? displayWeightToKilograms(Number.parseFloat(event.target.value), (current.preferred_weight_unit ?? profile.preferred_weight_unit))
                    : null,
                }))
              }
              value={profileDraft.target_weight_kg === null || profileDraft.target_weight_kg === undefined ? "" : kilogramsToDisplayValue(profileDraft.target_weight_kg, profileDraft.preferred_weight_unit ?? profile.preferred_weight_unit).toFixed(1)}
            />
          </Field>
        </div>
      </div>
    </section>
  );
}

function WellnessRing({
  colorEnd,
  colorStart,
  detail,
  label,
  value,
}: {
  colorEnd: string;
  colorStart: string;
  detail: string;
  label: string;
  value: number;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (value / 100) * circumference;
  const gradientId = `health-ring-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={value}
      className="rounded-[1.75rem] border border-[#ecf0fb] bg-white/85 px-4 py-4 text-center shadow-[0_18px_40px_rgba(63,82,145,0.08)] dark:border-white/10 dark:bg-white/[0.04]"
      role="progressbar"
    >
      <div className="mx-auto h-28 w-28">
        <svg aria-hidden="true" className="h-full w-full -rotate-90" viewBox="0 0 110 110">
          <circle cx="55" cy="55" fill="none" r={radius} stroke="rgba(151,162,189,0.18)" strokeWidth="10" />
          <circle
            cx="55"
            cy="55"
            fill="none"
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth="10"
          />
          <defs>
            <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor={colorStart} />
              <stop offset="100%" stopColor={colorEnd} />
            </linearGradient>
          </defs>
        </svg>
        <div className="-mt-[4.7rem] text-center">
          <p className="text-2xl font-black text-[#1d2744] dark:text-white">{value}%</p>
        </div>
      </div>
      <span className="sr-only">{label}: {value} percent. {detail}</span>
      <p className="mt-1 text-sm font-semibold text-[#26324f] dark:text-white">{label}</p>
      <p className="mt-1 text-xs text-[#73809c] dark:text-white/50">{detail}</p>
    </div>
  );
}

function LedgerAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#42507a] shadow-[0_10px_24px_rgba(80,92,138,0.1)] transition hover:-translate-y-0.5 dark:bg-white/[0.07] dark:text-white/75"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function HealthPanel({
  children,
  icon,
  subtitle,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="rounded-[2rem] border border-[#ece8f8] bg-white/85 p-5 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
          {icon}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{subtitle}</p>
          <h3 className="mt-1 text-xl font-black text-[#1e2744] dark:text-white">{title}</h3>
        </div>
      </div>
      <div className="mt-4">{children}</div>
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

function GoalBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] bg-[#f5f3fc] px-4 py-3 dark:bg-white/[0.05]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#26324f] dark:text-white">{value}</p>
    </div>
  );
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

function SectionMiniTitle({ title }: { title: string }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{title}</p>;
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

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function getHealthTabPanelId(tab: HealthTab) {
  return `health-panel-${tab.toLowerCase()}`;
}

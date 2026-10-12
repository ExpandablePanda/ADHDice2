"use client";

import { Camera, Copy, FileUp, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type SetStateAction } from "react";

import { ModalShell } from "@/components/modal-shell";
import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import type {
  HealthFoodLibraryItem,
  HealthMealEntry,
  HealthMealSlot,
  HealthRecipe,
  HealthRecipeIngredient,
  HealthSavedMeal,
  HealthSavedMealItem,
  HealthServingMeasureUnit,
} from "@/lib/database.types";
import {
  buildRecipeIngredient,
  buildSavedMealFoodItem,
  buildSavedMealRecipeItem,
  countHealthFoodMealEntries,
  type HealthFoodLibrarySection,
  formatQuantity,
  getHealthFoodIdentityKey,
  getHealthFoodAutocompleteValues,
  getHealthFoodDisplaySuggestions,
  getRecipeNutritionPerServing,
  getSavedMealNutrition,
  hasHealthFoodNutritionOrServingChanges,
  searchHealthFoodLibrary,
  sortHealthFoodLibraryByCreatedAt,
} from "@/lib/health-library";
import {
  buildHealthCustomFoodImportTemplate,
  getHealthCustomFoodImportIdentityKey,
  HEALTH_CUSTOM_FOOD_IMPORT_FIELDS,
  parseHealthCustomFoodImport,
  validateHealthCustomFoodImportDraft,
  type HealthCustomFoodImportDraft,
  type HealthCustomFoodImportFieldKey,
} from "@/lib/health-food-import";
import { getMealSlotLabel, HEALTH_MEAL_SLOTS } from "@/lib/health-utils";
import {
  HEALTH_NUTRITION_FIELD_REGISTRY,
  lookupOpenFoodFactsByBarcode,
  normalizeHealthNutritionDetails,
  parseHealthNutritionDetailsInput,
} from "@/lib/health-nutrition";
import { HealthCollapsiblePanel } from "./health-collapsible-panel";
import { HealthBarcodeScanner } from "./health-barcode-scanner";
import { HealthAutocomplete, HealthDropdown, HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";
import { formatHealthFoodHistoryRepairResult, isHealthFoodHistoryRepairComplete, type HealthFoodHistoryRepairResult } from "@/lib/health-meal-recalculation";
import type { EditingSessionStore } from "@/lib/editing-session-store";
import type { MasterFoodWorkspaceView, MasterFoodWorkspaceViewUpdate } from "@/lib/master-workspace-state";
import {
  applyHealthCustomFoodBarcodeLookup,
  canDeleteHealthCustomFoodSession,
  createEmptyHealthCustomFoodFormDraft,
  createHealthCustomFoodNewDraft,
  createHealthCustomFoodSavedDraft,
  discardHealthCustomFoodDraft,
  getHealthCustomFoodDraftValidationMessage,
  HEALTH_CUSTOM_FOOD_IDENTITY_COLLISION_MESSAGE,
  HEALTH_CUSTOM_FOOD_SAVE_FAILURE_MESSAGE,
  healthCustomFoodNewCanonicalId,
  healthCustomFoodNewSessionId,
  healthCustomFoodSavedSessionId,
  isCurrentHealthCustomFoodBarcodeLookup,
  prepareHealthCustomFoodSaveInput,
  saveHealthCustomFoodEditingSession,
  type HealthCustomFoodEditingSessionDraft,
  type HealthCustomFoodFormDraft,
  type HealthCustomFoodSaveInput,
} from "@/lib/health-custom-food-editing-session";

type FoodDraft = HealthCustomFoodFormDraft;
type FoodSaveConfirmation = {
  affectedCount: number;
  draftId: string;
  revision: number;
};

const EMPTY_FOOD_DRAFT = createEmptyHealthCustomFoodFormDraft();

type FoodImportRow = {
  draft: HealthCustomFoodImportDraft;
  id: string;
  lineStart: number;
  selected: boolean;
  unknownFields: string[];
  warnings: string[];
};

type FoodImportReview = FoodImportRow & {
  duplicate: boolean;
  errors: string[];
  input: ReturnType<typeof validateHealthCustomFoodImportDraft>["input"];
};

type RecipeDraft = {
  id?: string;
  name: string;
  notes: string;
  servings: string;
  ingredients: HealthRecipeIngredient[];
};

const EMPTY_RECIPE_DRAFT: RecipeDraft = {
  name: "",
  notes: "",
  servings: "1",
  ingredients: [],
};

type MealDraft = {
  id?: string;
  name: string;
  mealSlot: HealthMealSlot;
  items: HealthSavedMealItem[];
};

const EMPTY_MEAL_DRAFT: MealDraft = {
  name: "",
  mealSlot: "breakfast",
  items: [],
};

type HealthLibraryPanelProps = {
  section: HealthFoodLibrarySection;
  onSectionChange: (section: HealthFoodLibrarySection) => void;
  foodSearchQuery: string;
  onFoodSearchQueryChange: (query: string) => void;
  ingredientSearchQuery: string;
  onIngredientSearchQueryChange: (query: string) => void;
  onDraftSafetyChange: (isUnsafe: boolean) => void;
  favorites: HealthFoodLibraryItem[];
  recipes: HealthRecipe[];
  savedMeals: HealthSavedMeal[];
  mealEntries: HealthMealEntry[];
  shellSurface?: boolean;
  deleteFood: (id: string) => Promise<boolean>;
  deleteRecipe: (id: string) => Promise<boolean>;
  deleteSavedMeal: (id: string) => Promise<boolean>;
  saveFood: (input: HealthCustomFoodSaveInput, options?: { createOnly?: boolean }) => Promise<HealthFoodLibraryItem | null>;
  updatePreviousFoodLogs: (food: HealthFoodLibraryItem, options?: { mode?: "all" | "pending" }) => Promise<HealthFoodHistoryRepairResult>;
  pendingFoodHistoryRepairIds: readonly string[];
  customFoodSessionStore?: EditingSessionStore<HealthCustomFoodEditingSessionDraft> | null;
  customFoodView?: MasterFoodWorkspaceView;
  onCustomFoodViewChange?: (view: MasterFoodWorkspaceViewUpdate) => void;
  editingViewId?: string;
  saveRecipe: (input: {
    id?: string;
    name: string;
    notes?: string;
    servings: number;
    ingredients: HealthRecipeIngredient[];
  }) => Promise<boolean>;
  saveSavedMeal: (input: {
    id?: string;
    name: string;
    default_meal_slot: HealthMealSlot;
    items: HealthSavedMealItem[];
  }) => Promise<boolean>;
};

export function HealthLibraryPanel({
  section,
  onSectionChange,
  foodSearchQuery,
  onFoodSearchQueryChange,
  ingredientSearchQuery,
  onIngredientSearchQueryChange,
  onDraftSafetyChange,
  favorites,
  recipes,
  savedMeals,
  shellSurface = false,
  deleteFood,
  deleteRecipe,
  deleteSavedMeal,
  mealEntries,
  saveFood,
  saveRecipe,
  saveSavedMeal,
  updatePreviousFoodLogs,
  pendingFoodHistoryRepairIds,
  customFoodSessionStore,
  customFoodView,
  onCustomFoodViewChange,
  editingViewId,
}: HealthLibraryPanelProps) {
  const [legacyFoodDraft, setLegacyFoodDraft] = useState<FoodDraft>(EMPTY_FOOD_DRAFT);
  const [foodImportText, setFoodImportText] = useState("");
  const [foodImportRows, setFoodImportRows] = useState<FoodImportRow[]>([]);
  const [foodImportStatus, setFoodImportStatus] = useState("");
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [barcodeLookupStatus, setBarcodeLookupStatus] = useState<"idle" | "lookup">("idle");
  const [barcodeLookupMessage, setBarcodeLookupMessage] = useState("");
  const barcodeLookupGenerationRef = useRef(0);
  const foodScanBaselineRef = useRef<{ draftId: string; form: FoodDraft } | null>(null);
  const [hasFoodScanBaseline, setHasFoodScanBaseline] = useState(false);
  const [isFoodImportOpen, setIsFoodImportOpen] = useState(false);
  const [isSavingFoodImport, setIsSavingFoodImport] = useState(false);
  const [foodSaveConfirmation, setFoodSaveConfirmation] = useState<FoodSaveConfirmation | null>(null);
  const [isSavingFood, setIsSavingFood] = useState(false);
  const [foodSaveFeedback, setFoodSaveFeedback] = useState("");
  const [foodDeleteFeedback, setFoodDeleteFeedback] = useState("");
  const [historyRepairFeedback, setHistoryRepairFeedback] = useState("");
  const [historyRepairFoodId, setHistoryRepairFoodId] = useState<string | null>(null);
  const [updatingFoodLogsId, setUpdatingFoodLogsId] = useState<string | null>(null);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>(EMPTY_RECIPE_DRAFT);
  const [mealDraft, setMealDraft] = useState<MealDraft>(EMPTY_MEAL_DRAFT);
  const hasSharedCustomFoodSessions = Boolean(customFoodSessionStore && customFoodView && editingViewId);
  const customFoodEditorMode = customFoodView?.customFoodEditorMode ?? "new";
  const selectedCustomFoodId = customFoodView?.selectedCustomFoodDefinitionId ?? null;
  const newCustomFoodSessionId = hasSharedCustomFoodSessions
    ? healthCustomFoodNewSessionId(editingViewId!, customFoodView!.newCustomFoodDraftId)
    : "";
  const savedCustomFoodSessionId = hasSharedCustomFoodSessions && selectedCustomFoodId
    ? healthCustomFoodSavedSessionId(selectedCustomFoodId)
    : "";
  const isSavedCustomFoodEditor = hasSharedCustomFoodSessions
    ? customFoodEditorMode === "saved" && Boolean(selectedCustomFoodId)
    : Boolean(legacyFoodDraft.id);
  const activeCustomFoodSessionId = hasSharedCustomFoodSessions
    ? isSavedCustomFoodEditor ? savedCustomFoodSessionId : newCustomFoodSessionId
    : "";
  const selectedCanonicalFood = isSavedCustomFoodEditor
    ? favorites.find((food) => food.id === (hasSharedCustomFoodSessions ? selectedCustomFoodId : legacyFoodDraft.id)) ?? null
    : null;
  const activeCustomFoodInitialDraft = useMemo<HealthCustomFoodEditingSessionDraft | null>(() => {
    if (!hasSharedCustomFoodSessions || !customFoodView) return null;
    if (isSavedCustomFoodEditor) return selectedCanonicalFood ? createHealthCustomFoodSavedDraft(selectedCanonicalFood) : null;
    return createHealthCustomFoodNewDraft(customFoodView.newCustomFoodDraftId);
  }, [customFoodView, hasSharedCustomFoodSessions, isSavedCustomFoodEditor, selectedCanonicalFood]);
  const subscribeToCustomFoodSession = useCallback((listener: () => void) => (
    customFoodSessionStore && activeCustomFoodSessionId
      ? customFoodSessionStore.subscribeToSession(activeCustomFoodSessionId, listener)
      : () => {}
  ), [activeCustomFoodSessionId, customFoodSessionStore]);
  const getCustomFoodSessionSnapshot = useCallback(
    () => customFoodSessionStore && activeCustomFoodSessionId
      ? customFoodSessionStore.getSnapshot(activeCustomFoodSessionId)
      : null,
    [activeCustomFoodSessionId, customFoodSessionStore],
  );
  const activeCustomFoodSession = useSyncExternalStore(subscribeToCustomFoodSession, getCustomFoodSessionSnapshot, () => null);
  const foodDraft = hasSharedCustomFoodSessions
    ? activeCustomFoodSession?.draft.form ?? activeCustomFoodInitialDraft?.form ?? EMPTY_FOOD_DRAFT
    : legacyFoodDraft;
  const activeCustomFoodDraftId = activeCustomFoodSessionId || "health-custom-food-legacy";
  const activeCustomFoodDraftIdRef = useRef(activeCustomFoodDraftId);

  useLayoutEffect(() => {
    activeCustomFoodDraftIdRef.current = activeCustomFoodDraftId;
  }, [activeCustomFoodDraftId]);
  useLayoutEffect(() => {
    if (!customFoodSessionStore || !activeCustomFoodSessionId || !activeCustomFoodInitialDraft || !editingViewId) return;
    const canonicalRecordId = isSavedCustomFoodEditor && selectedCustomFoodId
      ? healthCustomFoodSavedSessionId(selectedCustomFoodId)
      : healthCustomFoodNewCanonicalId(editingViewId, customFoodView!.newCustomFoodDraftId);
    customFoodSessionStore.ensureSession(activeCustomFoodSessionId, canonicalRecordId, activeCustomFoodInitialDraft);
    customFoodSessionStore.attachView(activeCustomFoodSessionId, editingViewId);
    return () => customFoodSessionStore.detachView(editingViewId);
  }, [activeCustomFoodInitialDraft, activeCustomFoodSessionId, customFoodSessionStore, customFoodView, editingViewId, isSavedCustomFoodEditor, selectedCustomFoodId]);
  useLayoutEffect(() => () => {
    barcodeLookupGenerationRef.current += 1;
  }, []);

  const orderedFoods = useMemo(() => sortHealthFoodLibraryByCreatedAt(favorites), [favorites]);
  const filteredFoods = useMemo(
    () => searchHealthFoodLibrary(orderedFoods, foodSearchQuery),
    [foodSearchQuery, orderedFoods],
  );
  const foodNameSuggestions = useMemo(() => getHealthFoodAutocompleteValues(orderedFoods, "food_name"), [orderedFoods]);
  const brandSuggestions = useMemo(() => getHealthFoodAutocompleteValues(orderedFoods, "brand_name"), [orderedFoods]);
  const categorySuggestions = useMemo(() => getHealthFoodAutocompleteValues(orderedFoods, "food_category"), [orderedFoods]);
  const servingUnitSuggestions = useMemo(() => getHealthFoodAutocompleteValues(orderedFoods, "serving_unit"), [orderedFoods]);
  const foodSearchSuggestions = useMemo(() => getHealthFoodDisplaySuggestions(orderedFoods), [orderedFoods]);
  const filteredIngredientFoods = useMemo(() => {
    const query = ingredientSearchQuery.trim().toLowerCase();
    if (!query) {
      return favorites;
    }
    return favorites.filter((food) => [
      food.brand_name,
      food.food_name,
      food.serving_label,
    ].some((value) => value?.toLowerCase().includes(query)));
  }, [favorites, ingredientSearchQuery]);
  const recipePreview = useMemo(
    () => getRecipeNutritionPerServing({
      ingredients: recipeDraft.ingredients,
      servings: parsePositive(recipeDraft.servings),
    }),
    [recipeDraft.ingredients, recipeDraft.servings],
  );
  const mealPreview = useMemo(
    () => getSavedMealNutrition({ items: mealDraft.items }),
    [mealDraft.items],
  );
  const foodImportReviews = useMemo(
    () => reviewFoodImportRows(foodImportRows, favorites),
    [favorites, foodImportRows],
  );
  const editingFood = isSavedCustomFoodEditor ? selectedCanonicalFood : null;
  const editingFoodLogCount = editingFood ? countHealthFoodMealEntries(mealEntries, editingFood.id) : 0;
  const editingFoodHasUnsavedChanges = hasSharedCustomFoodSessions
    ? Boolean(activeCustomFoodSession?.dirty)
    : editingFood ? hasFoodDraftChanges(editingFood, foodDraft) : JSON.stringify(foodDraft) !== JSON.stringify(EMPTY_FOOD_DRAFT);
  const hasPendingHistoryRepair = Boolean(editingFood && pendingFoodHistoryRepairIds.includes(editingFood.id));
  const activeHistoryRepairFeedback = editingFood?.id === historyRepairFoodId ? historyRepairFeedback : "";
  const hasUnsafeDraft = Boolean(
    (!hasSharedCustomFoodSessions && (isSavedCustomFoodEditor ? !editingFood || editingFoodHasUnsavedChanges : editingFoodHasUnsavedChanges))
    || (recipeDraft.id || JSON.stringify(recipeDraft) !== JSON.stringify(EMPTY_RECIPE_DRAFT))
    || (mealDraft.id || JSON.stringify(mealDraft) !== JSON.stringify(EMPTY_MEAL_DRAFT))
    || foodImportText.trim()
    || foodImportRows.length > 0
    || isBarcodeScannerOpen
    || isSavingFoodImport
    || isSavingFood
    || (!hasSharedCustomFoodSessions && foodSaveConfirmation)
  );

  useEffect(() => {
    onDraftSafetyChange(hasUnsafeDraft);
    return () => onDraftSafetyChange(false);
  }, [hasUnsafeDraft, onDraftSafetyChange]);

  function updateFoodDraftFor(draftId: string, update: SetStateAction<FoodDraft>) {
    if (hasSharedCustomFoodSessions && customFoodSessionStore) {
      customFoodSessionStore.updateDraft(draftId, (current) => ({
        ...current,
        form: typeof update === "function" ? update(current.form) : update,
      }));
      return;
    }
    setLegacyFoodDraft(update);
  }

  function setFoodDraft(update: SetStateAction<FoodDraft>) {
    updateFoodDraftFor(activeCustomFoodDraftId, update);
  }

  function updateCustomFoodView(update: (current: MasterFoodWorkspaceView) => MasterFoodWorkspaceView) {
    if (!customFoodView || !onCustomFoodViewChange) return;
    onCustomFoodViewChange(update);
  }

  function cancelFoodBarcodeLookup() {
    barcodeLookupGenerationRef.current += 1;
    foodScanBaselineRef.current = null;
    setHasFoodScanBaseline(false);
    setIsBarcodeScannerOpen(false);
    setBarcodeLookupStatus("idle");
    setBarcodeLookupMessage("");
  }

  function resetFoodDraft() {
    cancelFoodBarcodeLookup();
    setFoodSaveFeedback("");
    setFoodDeleteFeedback("");
    setLegacyFoodDraft(EMPTY_FOOD_DRAFT);
  }

  function clearFoodScan() {
    const baseline = foodScanBaselineRef.current;
    if (!baseline) {
      return;
    }
    if (baseline.draftId !== activeCustomFoodDraftIdRef.current) return;
    barcodeLookupGenerationRef.current += 1;
    foodScanBaselineRef.current = null;
    setHasFoodScanBaseline(false);
    setIsBarcodeScannerOpen(false);
    setBarcodeLookupStatus("idle");
    setBarcodeLookupMessage("");
    updateFoodDraftFor(baseline.draftId, cloneFoodDraft(baseline.form));
  }

  async function handleSaveFood() {
    if (isSavingFood) {
      return;
    }
    setFoodSaveFeedback("");
    if (hasPendingHistoryRepair) {
      setFoodSaveFeedback("Retry Update Previous Logs before changing this saved food.");
      return;
    }
    const validationMessage = getFoodDraftValidationMessage(foodDraft);
    if (validationMessage) {
      setFoodSaveFeedback(validationMessage);
      return;
    }
    const foodInput = prepareHealthCustomFoodSaveInput(foodDraft, editingFood);
    const session = hasSharedCustomFoodSessions && customFoodSessionStore
      ? customFoodSessionStore.getSnapshot(activeCustomFoodDraftId)
      : null;
    if (editingFood && editingFoodLogCount > 0 && hasHealthFoodNutritionOrServingChanges(editingFood, foodInput)) {
      setFoodSaveConfirmation({
        affectedCount: editingFoodLogCount,
        draftId: activeCustomFoodDraftId,
        revision: session?.revision ?? 0,
      });
      return;
    }
    await persistCustomFood("future");
  }

  async function completeFoodSave(choice: "update" | "future") {
    if (!foodSaveConfirmation || isSavingFood) {
      return;
    }
    const pending = foodSaveConfirmation;
    if (pending.draftId !== activeCustomFoodDraftId) {
      setFoodSaveConfirmation(null);
      setFoodSaveFeedback("The selected food changed while confirmation was open. Review the active draft and save again.");
      return;
    }
    if (hasSharedCustomFoodSessions && customFoodSessionStore) {
      const current = customFoodSessionStore.getSnapshot(pending.draftId);
      if (!current || current.revision !== pending.revision || current.isSaving) {
        setFoodSaveConfirmation(null);
        setFoodSaveFeedback("This shared food draft changed in another tab. Review it and save again.");
        return;
      }
    }
    setFoodSaveConfirmation(null);
    await persistCustomFood(choice);
  }

  async function handleUpdatePreviousLogs(food: HealthFoodLibraryItem) {
    if (updatingFoodLogsId || editingFoodHasUnsavedChanges) {
      return;
    }
    setUpdatingFoodLogsId(food.id);
    setHistoryRepairFeedback("");
    try {
      const result = await updatePreviousFoodLogs(food, {
        mode: pendingFoodHistoryRepairIds.includes(food.id) ? "pending" : "all",
      });
      if (!isHealthFoodHistoryRepairComplete(result)) {
        setHistoryRepairFoodId(food.id);
        setHistoryRepairFeedback(formatHealthFoodHistoryRepairResult(result));
      } else {
        setHistoryRepairFoodId(null);
        setHistoryRepairFeedback("");
      }
    } catch {
      setHistoryRepairFoodId(food.id);
      setHistoryRepairFeedback("The custom food is saved, but its previous logs could not be fully updated. Retry Update Previous Logs.");
    } finally {
      setUpdatingFoodLogsId(null);
    }
  }

  async function persistCustomFood(choice: "update" | "future") {
    if (isSavingFood) return;
    const originalNewDraftId = customFoodView?.newCustomFoodDraftId;
    const originalEditorMode = customFoodView?.customFoodEditorMode;
    setIsSavingFood(true);
    try {
      let saved: HealthFoodLibraryItem | null = null;
      const session = hasSharedCustomFoodSessions && customFoodSessionStore
        ? customFoodSessionStore.getSnapshot(activeCustomFoodDraftId)
        : null;
      const wasNew = session?.draft.kind === "new" || (!hasSharedCustomFoodSessions && !editingFood);
      if (hasSharedCustomFoodSessions && customFoodSessionStore && editingViewId) {
        const result = await saveHealthCustomFoodEditingSession({
          store: customFoodSessionStore,
          draftId: activeCustomFoodDraftId,
          save: (draft) => saveFood(
            prepareHealthCustomFoodSaveInput(
              draft.form,
              draft.kind === "new"
                ? null
                : favorites.find((food) => food.id === draft.form.id) ?? null,
            ),
            { createOnly: draft.kind === "new" },
          ),
        });
        if ("error" in result) {
          setFoodSaveFeedback(result.error);
          return;
        }
        saved = result.saved;
        if (wasNew) {
          const savedFoodId = saved.id;
          const newDraftId = createHealthCustomFoodDraftId();
          updateCustomFoodView((current) => current.customFoodEditorMode === "new"
            && current.newCustomFoodDraftId === originalNewDraftId
            && originalEditorMode === "new"
            ? {
              ...current,
              selectedCustomFoodDefinitionId: savedFoodId,
              newCustomFoodDraftId: newDraftId,
              customFoodEditorMode: "saved",
            }
            : current);
        }
      } else {
        const foodInput = prepareHealthCustomFoodSaveInput(foodDraft, editingFood);
        saved = await saveFood(foodInput);
        if (!saved) {
          setFoodSaveFeedback(HEALTH_CUSTOM_FOOD_SAVE_FAILURE_MESSAGE);
          return;
        }
        if (editingFood && saved.id !== editingFood.id) {
          setFoodSaveFeedback(HEALTH_CUSTOM_FOOD_IDENTITY_COLLISION_MESSAGE);
          return;
        }
        resetFoodDraft();
      }
      setFoodSaveFeedback("");
      setFoodDeleteFeedback("");
      if (choice === "update" && saved) {
        setHistoryRepairFoodId(saved.id);
        setHistoryRepairFeedback("");
        try {
          const result = await updatePreviousFoodLogs(saved, { mode: "all" });
          if (!isHealthFoodHistoryRepairComplete(result)) {
            setHistoryRepairFeedback(formatHealthFoodHistoryRepairResult(result));
          } else {
            setHistoryRepairFoodId(null);
          }
        } catch {
          setHistoryRepairFeedback("The custom food is saved, but its previous logs could not be fully updated. Retry Update Previous Logs.");
        }
      }
    } catch {
      setFoodSaveFeedback(HEALTH_CUSTOM_FOOD_SAVE_FAILURE_MESSAGE);
    } finally {
      setIsSavingFood(false);
    }
  }

  function handleFoodBarcodeDetected(barcode: string) {
    const scannedBarcode = barcode.trim();
    if (!scannedBarcode) {
      return;
    }
    const requestGeneration = ++barcodeLookupGenerationRef.current;
    const requestDraftId = activeCustomFoodDraftId;
    foodScanBaselineRef.current = { draftId: requestDraftId, form: cloneFoodDraft(foodDraft) };
    setHasFoodScanBaseline(true);
    setBarcodeLookupMessage("");
    setBarcodeLookupStatus("lookup");
    updateFoodDraftFor(requestDraftId, (current) => ({ ...current, barcode: scannedBarcode }));
    void lookupOpenFoodFactsByBarcode(scannedBarcode)
      .then((result) => {
        if (!isCurrentHealthCustomFoodBarcodeLookup({
          activeDraftId: activeCustomFoodDraftIdRef.current,
          requestDraftId,
          currentGeneration: barcodeLookupGenerationRef.current,
          requestGeneration,
        })) {
          return;
        }
        if (!result) {
          setBarcodeLookupMessage("Barcode scanned. No food details found, enter the remaining information manually.");
          return;
        }
        updateFoodDraftFor(requestDraftId, (current) => applyHealthCustomFoodBarcodeLookup({
          activeDraftId: activeCustomFoodDraftIdRef.current,
          currentGeneration: barcodeLookupGenerationRef.current,
          draft: current,
          requestDraftId,
          requestGeneration,
          result,
          scannedBarcode,
        }) ?? current);
        setBarcodeLookupMessage("Barcode details loaded. Review before saving.");
      })
      .catch((error) => {
        if (!isCurrentHealthCustomFoodBarcodeLookup({
          activeDraftId: activeCustomFoodDraftIdRef.current,
          requestDraftId,
          currentGeneration: barcodeLookupGenerationRef.current,
          requestGeneration,
        })) {
          return;
        }
        setBarcodeLookupMessage(error instanceof Error ? error.message : "Barcode lookup did not complete.");
      })
      .finally(() => {
        if (isCurrentHealthCustomFoodBarcodeLookup({
          activeDraftId: activeCustomFoodDraftIdRef.current,
          requestDraftId,
          currentGeneration: barcodeLookupGenerationRef.current,
          requestGeneration,
        })) {
          setBarcodeLookupStatus("idle");
        }
      });
  }

  function startEditingFood(food: HealthFoodLibraryItem) {
    cancelFoodBarcodeLookup();
    setFoodSaveConfirmation(null);
    setFoodSaveFeedback("");
    setFoodDeleteFeedback("");
    setHistoryRepairFeedback("");
    if (hasSharedCustomFoodSessions) {
      updateCustomFoodView((current) => ({
        ...current,
        selectedCustomFoodDefinitionId: food.id,
        customFoodEditorMode: "saved",
      }));
      return;
    }
    setLegacyFoodDraft(foodToDraft(food));
  }

  function startNewCustomFood() {
    cancelFoodBarcodeLookup();
    setFoodSaveConfirmation(null);
    setFoodSaveFeedback("");
    setFoodDeleteFeedback("");
    setHistoryRepairFeedback("");
    if (hasSharedCustomFoodSessions) {
      updateCustomFoodView((current) => ({ ...current, customFoodEditorMode: "new" }));
      return;
    }
    setLegacyFoodDraft(EMPTY_FOOD_DRAFT);
  }

  function discardCurrentFoodDraft() {
    cancelFoodBarcodeLookup();
    setFoodSaveFeedback("");
    if (hasSharedCustomFoodSessions && customFoodSessionStore && customFoodView) {
      const draftId = activeCustomFoodDraftId;
      const canonicalRecordId = isSavedCustomFoodEditor && selectedCustomFoodId
        ? healthCustomFoodSavedSessionId(selectedCustomFoodId)
        : healthCustomFoodNewCanonicalId(editingViewId!, customFoodView.newCustomFoodDraftId);
      const latestBaseline = isSavedCustomFoodEditor && editingFood
        ? createHealthCustomFoodSavedDraft(editingFood)
        : createHealthCustomFoodNewDraft(customFoodView.newCustomFoodDraftId);
      discardHealthCustomFoodDraft({ store: customFoodSessionStore, draftId, canonicalRecordId, latestBaseline });
      return;
    }
    setLegacyFoodDraft(editingFood ? foodToDraft(editingFood) : EMPTY_FOOD_DRAFT);
  }

  async function handleDeleteFood(food: HealthFoodLibraryItem) {
    const session = customFoodSessionStore?.getSnapshot(healthCustomFoodSavedSessionId(food.id));
    if (!canDeleteHealthCustomFoodSession(session)) {
      setFoodDeleteFeedback("This food has an unsaved definition draft in a Master Tab. Save or discard that draft before removing it.");
      return;
    }
    setFoodDeleteFeedback("");
    const deleted = await deleteFood(food.id);
    if (deleted && hasSharedCustomFoodSessions && selectedCustomFoodId === food.id) {
      updateCustomFoodView((current) => ({ ...current, customFoodEditorMode: "new", selectedCustomFoodDefinitionId: null }));
    }
  }

  function openFoodImport() {
    onSectionChange("foods");
    setIsFoodImportOpen(true);
    setFoodImportStatus("");
  }

  async function handleCopyFoodImportTemplate() {
    const template = buildHealthCustomFoodImportTemplate();
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(template);
        setFoodImportStatus("Template copied to the clipboard.");
        return;
      } catch {
        // Fall back to inserting the template so the action remains useful.
      }
    }
    setFoodImportText((current) => current.trim() ? current : template);
    setFoodImportStatus("Template inserted into the empty import box.");
  }

  function handleParseFoodImport() {
    const blocks = parseHealthCustomFoodImport(foodImportText);
    const rows = blocks.map((block, index) => ({
      draft: block.draft,
      id: `health-food-import-${index + 1}`,
      lineStart: block.lineStart,
      selected: true,
      unknownFields: block.unknownFields,
      warnings: block.warnings,
    }));
    setFoodImportRows(rows);
    setFoodImportStatus(rows.length ? `Preview ready for ${rows.length} proposed food${rows.length === 1 ? "" : "s"}.` : "No food blocks were found.");
  }

  function updateFoodImportField(id: string, key: HealthCustomFoodImportFieldKey, value: string) {
    setFoodImportRows((current) => current.map((row) => row.id === id
      ? { ...row, draft: { ...row.draft, [key]: value }, selected: true }
      : row));
  }

  function toggleFoodImportRow(id: string) {
    setFoodImportRows((current) => current.map((row) => row.id === id ? { ...row, selected: !row.selected } : row));
  }

  async function handleSaveFoodImport() {
    if (foodImportReviews.length === 0) {
      return;
    }
    setIsSavingFoodImport(true);
    let imported = 0;
    let failed = 0;
    for (const review of foodImportReviews) {
      if (!review.selected || review.duplicate || review.errors.length > 0 || !review.input) {
        continue;
      }
      if (await saveFood(review.input)) {
        imported += 1;
      } else {
        failed += 1;
      }
    }
    const duplicateCount = foodImportReviews.filter((review) => review.duplicate).length;
    const invalidCount = foodImportReviews.filter((review) => review.errors.length > 0).length;
    const skippedCount = foodImportReviews.filter((review) => !review.selected && !review.duplicate && review.errors.length === 0).length;
    setFoodImportStatus(`Imported ${imported}; skipped ${skippedCount}; duplicates ${duplicateCount}; invalid ${invalidCount}; failed ${failed}.`);
    setIsSavingFoodImport(false);
  }

  async function handleSaveRecipe() {
    if (!recipeDraft.name.trim() || recipeDraft.ingredients.length === 0) {
      return;
    }
    const saved = await saveRecipe({
      id: recipeDraft.id,
      ingredients: recipeDraft.ingredients,
      name: recipeDraft.name.trim(),
      notes: recipeDraft.notes.trim(),
      servings: parsePositive(recipeDraft.servings),
    });
    if (saved) {
      setRecipeDraft(EMPTY_RECIPE_DRAFT);
    }
  }

  async function handleSaveMeal() {
    if (!mealDraft.name.trim() || mealDraft.items.length === 0) {
      return;
    }
    const saved = await saveSavedMeal({
      id: mealDraft.id,
      default_meal_slot: mealDraft.mealSlot,
      items: mealDraft.items,
      name: mealDraft.name.trim(),
    });
    if (saved) {
      setMealDraft(EMPTY_MEAL_DRAFT);
    }
  }

  return (
    <>
    <HealthCollapsiblePanel
      className="min-w-0"
      shellSurface={shellSurface}
      subtitle="Create reusable foods, combine ingredients into recipes, or bundle foods and recipes into one-tap meals."
      title="Custom nutrition library"
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <AdhdChip count={favorites.length} onClick={() => onSectionChange("foods")} selected={section === "foods"}>
          Foods
        </AdhdChip>
        <AdhdChip count={recipes.length} onClick={() => onSectionChange("recipes")} selected={section === "recipes"}>
          Recipes
        </AdhdChip>
        <AdhdChip count={savedMeals.length} onClick={() => onSectionChange("meals")} selected={section === "meals"}>
          Meals
        </AdhdChip>
      </div>
      {section === "foods" ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <AdhdChip contentClassName="gap-1.5" icon={<FileUp aria-hidden="true" className="h-3 w-3" />} onClick={openFoodImport} selected={isFoodImportOpen}>
              Import Foods
            </AdhdChip>
          </div>
          {isFoodImportOpen ? (
            <HealthCollapsiblePanel
              className="mb-5"
              subtitle="Paste one or more quoted food blocks, review every field, then confirm the import."
              title="Import custom foods"
              variant="subpanel"
            >
              <div className="grid gap-3">
                <textarea
                  className="health-input min-h-64 resize-y font-mono text-xs leading-5"
                  onChange={(event) => setFoodImportText(event.target.value)}
                  placeholder={buildHealthCustomFoodImportTemplate()}
                  value={foodImportText}
                />
                <div className="flex flex-wrap gap-2">
                  <AdhdChip contentClassName="gap-1.5" icon={<Copy aria-hidden="true" className="h-3 w-3" />} onClick={() => { void handleCopyFoodImportTemplate(); }}>
                    Copy Template
                  </AdhdChip>
                  <AdhdChip onClick={handleParseFoodImport} selected>
                    Preview Foods
                  </AdhdChip>
                  <AdhdChip onClick={() => { setFoodImportRows([]); setFoodImportText(""); setFoodImportStatus(""); }}>
                    Clear Import
                  </AdhdChip>
                </div>
                {foodImportStatus ? <p aria-live="polite" className="text-xs text-[#6d7894] dark:text-white/55">{foodImportStatus}</p> : null}
              </div>
              {foodImportReviews.length > 0 ? (
                <div className="mt-5 grid gap-4">
                  <div className="flex items-center gap-2 text-xs text-[#6d7894] dark:text-white/55">
                    <span className="min-w-0 flex-1 break-words">
                      Ready {foodImportReviews.filter((review) => review.selected && !review.duplicate && review.errors.length === 0).length} / {foodImportReviews.length}
                      {" · "}Duplicates {foodImportReviews.filter((review) => review.duplicate).length}
                      {" · "}Invalid {foodImportReviews.filter((review) => review.errors.length > 0).length}
                    </span>
                    <AdhdChip className="shrink-0" disabled={isSavingFoodImport} onClick={() => { void handleSaveFoodImport(); }} selected>
                      {isSavingFoodImport ? "Importing..." : "Confirm Import"}
                    </AdhdChip>
                  </div>
                  {foodImportReviews.map((review, index) => (
                    <div className="grid gap-3 rounded-[1rem] border border-[#e8e2f7] bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]" key={review.id}>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold text-[#26324f] dark:text-white">Food {index + 1}</p>
                          <p className="mt-1 break-words text-xs text-[#74809b] dark:text-white/45">Source line {review.lineStart}</p>
                        </div>
                        <label className="flex shrink-0 items-center gap-2 text-xs text-[#66718f] dark:text-white/60">
                          <input
                            checked={review.selected && !review.duplicate}
                            disabled={review.duplicate}
                            onChange={() => toggleFoodImportRow(review.id)}
                            type="checkbox"
                          />
                          Include
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {HEALTH_CUSTOM_FOOD_IMPORT_FIELDS.map((field) => (
                          <label className="grid gap-1.5" key={field.key}>
                            <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">{field.label}</span>
                            <input
                              className="health-input"
                              inputMode={field.inputMode}
                              onChange={(event) => updateFoodImportField(review.id, field.key, event.target.value)}
                              value={review.draft[field.key]}
                            />
                          </label>
                        ))}
                      </div>
                      {review.unknownFields.length > 0 ? <p className="text-xs text-[#a25b50] dark:text-[#ffb3a9]">Unknown fields were not mapped: {review.unknownFields.join(", ")}.</p> : null}
                      {review.warnings.length > 0 ? <p className="text-xs text-[#8a6a31] dark:text-[#e8c878]">{review.warnings.join(" ")}</p> : null}
                      {review.errors.length > 0 ? <p className="text-xs text-[#a25b50] dark:text-[#ffb3a9]">Invalid: {review.errors.join(" ")}</p> : null}
                      {review.duplicate ? <p className="text-xs text-[#8a6a31] dark:text-[#e8c878]">Likely duplicate. Change the editable fields to make a distinct food before including it.</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </HealthCollapsiblePanel>
          ) : null}
          <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="grid min-w-0 gap-4">
            <HealthCollapsiblePanel subtitle="Filter saved custom foods in this library." title="Search custom foods" variant="subpanel">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <HealthAutocomplete
                  ariaLabel="Search custom foods"
                  onChange={onFoodSearchQueryChange}
                  placeholder="Food, brand, category, serving, barcode"
                  suggestions={foodSearchSuggestions}
                  value={foodSearchQuery}
                />
                <AdhdChip
                  contentClassName="gap-1.5"
                  icon={<Search aria-hidden="true" className="h-3 w-3" />}
                  onClick={() => onFoodSearchQueryChange("")}
                  selected
                >
                  Clear
                </AdhdChip>
              </div>
              <p className="mt-3 text-xs text-[#7d7598] dark:text-white/55">
                Showing {filteredFoods.length} of {favorites.length} custom {favorites.length === 1 ? "food" : "foods"}.
              </p>
            </HealthCollapsiblePanel>
            <HealthCollapsiblePanel subtitle="Nutrition is stored per serving." title={isSavedCustomFoodEditor ? "Edit custom food" : "New custom food"} variant="subpanel">
              {hasSharedCustomFoodSessions && isSavedCustomFoodEditor && !editingFood ? (
                <div className="grid gap-3" role="status">
                  <p className="text-sm text-[#716b8c] dark:text-white/60">This custom food was removed from the library. Select another food or start a new definition.</p>
                  <AdhdChip contentClassName="gap-1.5" icon={<Plus aria-hidden="true" className="h-3 w-3" />} onClick={startNewCustomFood}>New food</AdhdChip>
                </div>
              ) : (
                <>
              {hasSharedCustomFoodSessions && isSavedCustomFoodEditor ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  <AdhdChip contentClassName="gap-1.5" icon={<Plus aria-hidden="true" className="h-3 w-3" />} onClick={startNewCustomFood}>New food</AdhdChip>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <LibraryField label="Brand">
                  <HealthAutocomplete
                    ariaLabel="Brand"
                    onChange={(value) => setFoodDraft((current) => ({ ...current, brandName: value }))}
                    suggestions={brandSuggestions}
                    value={foodDraft.brandName}
                  />
                </LibraryField>
                <LibraryField label="Food name">
                  <HealthAutocomplete
                    ariaLabel="Food name"
                    onChange={(value) => setFoodDraft((current) => ({ ...current, foodName: value }))}
                    suggestions={foodNameSuggestions}
                    value={foodDraft.foodName}
                  />
                </LibraryField>
                <LibraryField label="Barcode">
                  <div className="flex min-w-0 flex-wrap gap-2">
                    <input className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-0 flex-1`} inputMode="numeric" onChange={(event) => setFoodDraft((current) => ({ ...current, barcode: event.target.value }))} placeholder="012345678905" value={foodDraft.barcode} />
                    <AdhdChip contentClassName="gap-1.5" disabled={barcodeLookupStatus !== "idle"} icon={<Camera aria-hidden="true" className="h-3 w-3" />} onClick={() => setIsBarcodeScannerOpen(true)}>Scan</AdhdChip>
                    {hasFoodScanBaseline ? <AdhdChip contentClassName="gap-1.5" icon={<RotateCcw aria-hidden="true" className="h-3 w-3" />} onClick={clearFoodScan}>Clear</AdhdChip> : null}
                  </div>
                </LibraryField>
                <div className="sm:col-span-2">
                  <HealthBarcodeScanner isOpen={isBarcodeScannerOpen} onClose={() => setIsBarcodeScannerOpen(false)} onDetected={handleFoodBarcodeDetected} />
                  {barcodeLookupStatus !== "idle" ? <p className="text-xs text-[#73809c] dark:text-white/50" role="status">Looking up barcode...</p> : null}
                  {barcodeLookupMessage ? <p aria-live="polite" className="text-xs text-[#5f6c88] dark:text-white/60" role="status">{barcodeLookupMessage}</p> : null}
                </div>
                <LibraryField label="Food category">
                  <HealthAutocomplete
                    ariaLabel="Food category"
                    onChange={(value) => setFoodDraft((current) => ({ ...current, foodCategory: value }))}
                    suggestions={categorySuggestions}
                    value={foodDraft.foodCategory}
                  />
                </LibraryField>
                <LibraryField label="Serving quantity">
                  <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" min="0" onChange={(event) => setFoodDraft((current) => ({ ...current, servingQuantity: event.target.value }))} placeholder="55" value={foodDraft.servingQuantity} />
                </LibraryField>
                <LibraryField label="Serving unit">
                  <HealthAutocomplete
                    ariaLabel="Serving unit"
                    onChange={(value) => setFoodDraft((current) => ({ ...current, servingUnit: value }))}
                    suggestions={servingUnitSuggestions}
                    value={foodDraft.servingUnit}
                  />
                </LibraryField>
                <LibraryField label="Serving measure (optional)">
                  <span className="grid grid-cols-[1fr_auto] gap-2">
                    <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" min="0" onChange={(event) => setFoodDraft((current) => ({ ...current, servingMeasureValue: event.target.value }))} placeholder="30" value={foodDraft.servingMeasureValue} />
                    <HealthDropdown
                      ariaLabel="Serving measure"
                      className="min-w-28"
                      onChange={(value) => setFoodDraft((current) => ({ ...current, servingMeasureUnit: value as HealthServingMeasureUnit | "" }))}
                      options={[
                        { label: "No measure", value: "" },
                        { label: "g", value: "g" },
                        { label: "oz", value: "oz" },
                        { label: "mL", value: "ml" },
                        { label: "fl oz", value: "fl_oz" },
                      ]}
                      value={foodDraft.servingMeasureUnit}
                    />
                  </span>
                </LibraryField>
                <LibraryField label="Calories per serving">
                  <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="numeric" onChange={(event) => setFoodDraft((current) => ({ ...current, calories: event.target.value }))} value={foodDraft.calories} />
                </LibraryField>
                <LibraryField label="Fat (g)">
                  <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" onChange={(event) => setFoodDraft((current) => ({ ...current, fat: event.target.value }))} value={foodDraft.fat} />
                </LibraryField>
                <LibraryField label="Carbs (g)">
                  <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" onChange={(event) => setFoodDraft((current) => ({ ...current, carbs: event.target.value }))} value={foodDraft.carbs} />
                </LibraryField>
                <LibraryField label="Protein (g)">
                  <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" onChange={(event) => setFoodDraft((current) => ({ ...current, protein: event.target.value }))} value={foodDraft.protein} />
                </LibraryField>
              </div>
              <div className="mt-4 grid gap-3">
                <details className="rounded-[1rem] border border-[#e8e2f7] bg-white/70 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <summary className="cursor-pointer text-sm font-semibold text-[#595378] dark:text-white/75">Nutrition Details</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {HEALTH_NUTRITION_FIELD_REGISTRY.filter((field) => field.group !== "Vitamins & Minerals").map((field) => (
                      <LibraryField label={`${field.label} (${field.unit})`} key={field.key}>
                        <input
                          className={HEALTH_COMPACT_INPUT_CLASS}
                          inputMode="decimal"
                          onChange={(event) => setFoodDraft((current) => ({ ...current, nutritionDetails: { ...current.nutritionDetails, [field.key]: event.target.value } }))}
                          value={foodDraft.nutritionDetails[field.key]}
                        />
                      </LibraryField>
                    ))}
                  </div>
                </details>
                <details className="rounded-[1rem] border border-[#e8e2f7] bg-white/70 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <summary className="cursor-pointer text-sm font-semibold text-[#595378] dark:text-white/75">Vitamins &amp; Minerals</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {HEALTH_NUTRITION_FIELD_REGISTRY.filter((field) => field.group === "Vitamins & Minerals").map((field) => (
                      <LibraryField label={`${field.label} (${field.unit})`} key={field.key}>
                        <input
                          className={HEALTH_COMPACT_INPUT_CLASS}
                          inputMode="decimal"
                          onChange={(event) => setFoodDraft((current) => ({ ...current, nutritionDetails: { ...current.nutritionDetails, [field.key]: event.target.value } }))}
                          value={foodDraft.nutritionDetails[field.key]}
                        />
                      </LibraryField>
                    ))}
                  </div>
                </details>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <AdhdChip disabled={isSavingFood} onClick={() => { void handleSaveFood(); }} selected>
                  {isSavingFood ? "Saving..." : "Save food"}
                </AdhdChip>
                {foodSaveFeedback ? <p aria-live="polite" className="basis-full text-xs text-[#b34b63] dark:text-[#ffabbc]" role="alert">{foodSaveFeedback}</p> : null}
                {foodDeleteFeedback ? <p aria-live="polite" className="basis-full text-xs text-[#b34b63] dark:text-[#ffabbc]" role="alert">{foodDeleteFeedback}</p> : null}
                {activeHistoryRepairFeedback ? <p aria-live="polite" className="basis-full text-xs text-[#a25b50] dark:text-[#ffb3a9]" role="alert">{activeHistoryRepairFeedback}</p> : null}
                {editingFood && editingFoodLogCount > 0 ? (
                  <AdhdChip
                    disabled={isSavingFood || Boolean(updatingFoodLogsId) || editingFoodHasUnsavedChanges}
                    onClick={() => { void handleUpdatePreviousLogs(editingFood); }}
                    title={editingFoodHasUnsavedChanges ? "Save or cancel the current food edits before updating previous logs." : undefined}
                  >
                    {updatingFoodLogsId === editingFood.id
                      ? "Updating previous logs..."
                      : `${hasPendingHistoryRepair ? "Retry " : ""}Update Previous Logs · ${editingFoodLogCount} ${editingFoodLogCount === 1 ? "entry" : "entries"}`}
                  </AdhdChip>
                ) : null}
                {hasSharedCustomFoodSessions
                  ? activeCustomFoodSession?.dirty || activeCustomFoodSession?.saveError
                    ? <AdhdChip disabled={isSavingFood} onClick={discardCurrentFoodDraft}>Discard Draft</AdhdChip>
                    : null
                  : editingFood || editingFoodHasUnsavedChanges
                    ? <AdhdChip disabled={isSavingFood} onClick={resetFoodDraft}>Cancel</AdhdChip>
                  : null}
              </div>
                </>
              )}
            </HealthCollapsiblePanel>
          </div>
          <div className="adhdice-scrollbar min-w-0 max-h-[36rem] overflow-y-auto pr-1">
            <LibraryCards empty={foodSearchQuery.trim() ? "No custom foods match this search." : "No custom foods yet."} items={filteredFoods.map((food) => (
              <AdhdCard key={food.id}>
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <LibraryCardHeader
                      detail={`${food.food_category || "Uncategorized"} / ${food.serving_label || "1 serving"} / ${food.calories} kcal`}
                      title={formatBrandedFoodName(food)}
                    />
                    <NutritionLine calories={food.calories} carbs={food.carbs_g} fat={food.fat_g} protein={food.protein_g} />
                  </div>
                  <div className="flex min-w-0 max-w-full flex-wrap justify-end gap-2">
                    <AdhdChip className="shrink-0" contentClassName="gap-1.5" icon={<Pencil aria-hidden="true" className="h-3 w-3" />} onClick={() => startEditingFood(food)}>Edit</AdhdChip>
                    <AdhdChip className="shrink-0" contentClassName="gap-1.5" icon={<Trash2 aria-hidden="true" className="h-3 w-3" />} onClick={() => { void handleDeleteFood(food); }} tone="danger">Remove</AdhdChip>
                  </div>
                </div>
              </AdhdCard>
            ))} />
          </div>
        </div>
        </>
      ) : null}

      {section === "recipes" ? (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4">
            <HealthCollapsiblePanel subtitle="Add foods below, then set the batch yield." title={recipeDraft.id ? "Edit recipe" : "New recipe"} variant="subpanel">
              <div className="grid gap-3 sm:grid-cols-2">
                <LibraryField label="Recipe name">
                  <input className="health-input" onChange={(event) => setRecipeDraft((current) => ({ ...current, name: event.target.value }))} value={recipeDraft.name} />
                </LibraryField>
                <LibraryField label="Servings in batch">
                  <input className="health-input" inputMode="decimal" onChange={(event) => setRecipeDraft((current) => ({ ...current, servings: event.target.value }))} value={recipeDraft.servings} />
                </LibraryField>
                <div className="sm:col-span-2">
                  <LibraryField label="Notes or instructions">
                    <textarea className="health-input min-h-20 resize-y" onChange={(event) => setRecipeDraft((current) => ({ ...current, notes: event.target.value }))} value={recipeDraft.notes} />
                  </LibraryField>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {recipeDraft.ingredients.map((ingredient, index) => (
                  <IngredientRow
                    key={`${ingredient.food_id ?? ingredient.food_name}-${index}`}
                    name={ingredient.food_name}
                    onQuantity={(quantity) => setRecipeDraft((current) => ({
                      ...current,
                      ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, quantity } : item),
                    }))}
                    onRemove={() => setRecipeDraft((current) => ({ ...current, ingredients: current.ingredients.filter((_, itemIndex) => itemIndex !== index) }))}
                    quantity={ingredient.quantity}
                  />
                ))}
              </div>
              <NutritionLine {...recipePreview} />
              <div className="mt-4 flex flex-wrap gap-2">
                <AdhdChip onClick={() => { void handleSaveRecipe(); }} selected>Save recipe</AdhdChip>
                {recipeDraft.id ? <AdhdChip onClick={() => setRecipeDraft(EMPTY_RECIPE_DRAFT)}>Cancel</AdhdChip> : null}
              </div>
            </HealthCollapsiblePanel>
            <HealthCollapsiblePanel subtitle="Search by brand, food, or serving before adding an ingredient." title="Add ingredients" variant="subpanel">
              <input
                className={`${HEALTH_COMPACT_INPUT_CLASS} mb-3`}
                onChange={(event) => onIngredientSearchQueryChange(event.target.value)}
                placeholder="Search custom foods"
                value={ingredientSearchQuery}
              />
              <SourcePicker
              empty={ingredientSearchQuery.trim() ? "No custom foods match this ingredient search." : "Create a custom food first, then add it as an ingredient."}
              items={filteredIngredientFoods.map((food) => ({
                id: food.id,
                label: formatBrandedFoodName(food),
                onAdd: () => setRecipeDraft((current) => ({ ...current, ingredients: [...current.ingredients, buildRecipeIngredient(food, 1)] })),
              }))}
              />
            </HealthCollapsiblePanel>
          </div>
          <LibraryCards empty="No recipes yet." items={recipes.map((recipe) => {
            const nutrition = getRecipeNutritionPerServing(recipe);
            return (
              <AdhdCard key={recipe.id}>
                <LibraryCardHeader detail={`${formatQuantity(recipe.servings)} servings / ${recipe.ingredients.length} ingredients`} title={recipe.name} />
                <NutritionLine {...nutrition} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <AdhdChip contentClassName="gap-1.5" icon={<Pencil aria-hidden="true" className="h-3 w-3" />} onClick={() => setRecipeDraft({
                    id: recipe.id,
                    ingredients: recipe.ingredients,
                    name: recipe.name,
                    notes: recipe.notes,
                    servings: String(recipe.servings),
                  })}>Edit</AdhdChip>
                  <AdhdChip contentClassName="gap-1.5" icon={<Trash2 aria-hidden="true" className="h-3 w-3" />} onClick={() => { void deleteRecipe(recipe.id); }} tone="danger">Remove</AdhdChip>
                </div>
              </AdhdCard>
            );
          })} />
        </div>
      ) : null}

      {section === "meals" ? (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4">
            <HealthCollapsiblePanel subtitle="A meal can contain custom foods and recipe servings." title={mealDraft.id ? "Edit custom meal" : "New custom meal"} variant="subpanel">
              <LibraryField label="Meal name">
                <input className="health-input" onChange={(event) => setMealDraft((current) => ({ ...current, name: event.target.value }))} value={mealDraft.name} />
              </LibraryField>
              <div className="mt-3 flex flex-wrap gap-2">
                {HEALTH_MEAL_SLOTS.map((slot) => (
                  <AdhdChip key={slot} onClick={() => setMealDraft((current) => ({ ...current, mealSlot: slot }))} selected={mealDraft.mealSlot === slot}>
                    {getMealSlotLabel(slot)}
                  </AdhdChip>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {mealDraft.items.map((item, index) => (
                  <IngredientRow
                    key={`${item.source_type}-${item.source_id ?? item.name}-${index}`}
                    name={item.name}
                    onQuantity={(quantity) => setMealDraft((current) => ({
                      ...current,
                      items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity } : entry),
                    }))}
                    onRemove={() => setMealDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}
                    quantity={item.quantity}
                  />
                ))}
              </div>
              <NutritionLine {...mealPreview} />
              <div className="mt-4 flex flex-wrap gap-2">
                <AdhdChip onClick={() => { void handleSaveMeal(); }} selected>Save meal</AdhdChip>
                {mealDraft.id ? <AdhdChip onClick={() => setMealDraft(EMPTY_MEAL_DRAFT)}>Cancel</AdhdChip> : null}
              </div>
            </HealthCollapsiblePanel>
            <SourcePicker
              empty="Create a custom food or recipe first."
              items={[
                ...favorites.map((food) => ({
                  id: `food-${food.id}`,
                  label: formatBrandedFoodName(food),
                  onAdd: () => setMealDraft((current) => ({ ...current, items: [...current.items, buildSavedMealFoodItem(food, 1)] })),
                })),
                ...recipes.map((recipe) => ({
                  id: `recipe-${recipe.id}`,
                  label: `${recipe.name} (recipe)`,
                  onAdd: () => setMealDraft((current) => ({ ...current, items: [...current.items, buildSavedMealRecipeItem(recipe, 1)] })),
                })),
              ]}
              title="Add meal items"
            />
          </div>
          <LibraryCards empty="No custom meals yet." items={savedMeals.map((meal) => {
            const nutrition = getSavedMealNutrition(meal);
            return (
              <AdhdCard key={meal.id}>
                <LibraryCardHeader detail={`${getMealSlotLabel(meal.default_meal_slot)} / ${meal.items.length} items`} title={meal.name} />
                <NutritionLine {...nutrition} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <AdhdChip contentClassName="gap-1.5" icon={<Pencil aria-hidden="true" className="h-3 w-3" />} onClick={() => setMealDraft({
                    id: meal.id,
                    items: meal.items,
                    mealSlot: meal.default_meal_slot,
                    name: meal.name,
                  })}>Edit</AdhdChip>
                  <AdhdChip contentClassName="gap-1.5" icon={<Trash2 aria-hidden="true" className="h-3 w-3" />} onClick={() => { void deleteSavedMeal(meal.id); }} tone="danger">Remove</AdhdChip>
                </div>
              </AdhdCard>
            );
          })} />
        </div>
      ) : null}
    </HealthCollapsiblePanel>
    {foodSaveConfirmation ? (
      <ModalShell label="Update previous logs" onClose={isSavingFood ? undefined : () => setFoodSaveConfirmation(null)}>
        <div className="w-[min(92vw,30rem)] rounded-[2rem] border border-[#ece8f8] bg-white p-6 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]">
          <h2 className="text-lg font-semibold text-[#342d53] dark:text-white">Update previous logs?</h2>
          <p className="mt-2 text-sm leading-6 text-[#716b8c] dark:text-white/60">This food appears in {foodSaveConfirmation.affectedCount} previous meal {foodSaveConfirmation.affectedCount === 1 ? "entry" : "entries"}.</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <AdhdChip disabled={isSavingFood} onClick={() => { void completeFoodSave("update"); }} selected>Update all previous logs</AdhdChip>
            <AdhdChip disabled={isSavingFood} onClick={() => { void completeFoodSave("future"); }}>Future entries only</AdhdChip>
            <AdhdChip disabled={isSavingFood} onClick={() => setFoodSaveConfirmation(null)}>Cancel</AdhdChip>
          </div>
        </div>
      </ModalShell>
    ) : null}
    </>
  );
}

function reviewFoodImportRows(rows: FoodImportRow[], favorites: HealthFoodLibraryItem[]): FoodImportReview[] {
  const existingIdentities = new Set(
    favorites.map((food) => getHealthFoodIdentityKey(food)).filter((identity): identity is string => Boolean(identity)),
  );
  const selectedIdentities = new Set<string>();

  return rows.map((row) => {
    const validation = validateHealthCustomFoodImportDraft(row.draft);
    const identity = getHealthCustomFoodImportIdentityKey(row.draft);
    const duplicate = Boolean(identity && (existingIdentities.has(identity) || selectedIdentities.has(identity)));
    if (row.selected && !duplicate && validation.input && identity) {
      selectedIdentities.add(identity);
    }
    return {
      ...row,
      duplicate,
      errors: validation.errors,
      input: validation.input,
    };
  });
}

function SourcePicker({ empty, items, title }: { empty: string; items: Array<{ id: string; label: string; onAdd: () => void }>; title?: string }) {
  const content = items.length === 0 ? <p className="text-sm text-[#7d7598] dark:text-white/55">{empty}</p> : (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <AdhdChip contentClassName="gap-1.5" icon={<Plus aria-hidden="true" className="h-3 w-3" />} key={item.id} onClick={item.onAdd}>
          {item.label}
        </AdhdChip>
      ))}
    </div>
  );

  if (!title) {
    return content;
  }
  return (
    <HealthCollapsiblePanel title={title} variant="subpanel">
      {content}
    </HealthCollapsiblePanel>
  );
}

function IngredientRow({ name, onQuantity, onRemove, quantity }: { name: string; onQuantity: (quantity: number) => void; onRemove: () => void; quantity: number }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-[1rem] border border-[#efe9ff] bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
      <span className="min-w-0 flex-1 break-words text-sm font-medium text-[#595378] dark:text-white/68">{name}</span>
      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-2 text-xs text-[#7d7598] dark:text-white/55">
          Servings
          <input className="health-input w-20" inputMode="decimal" min="0.01" onChange={(event) => onQuantity(parsePositive(event.target.value))} type="number" value={quantity} />
        </label>
        <AdhdChip onClick={onRemove} tone="danger">Remove</AdhdChip>
      </div>
    </div>
  );
}

function LibraryCards({ empty, items }: { empty: string; items: ReactNode[] }) {
  return items.length === 0
    ? <AdhdPanel variant="subpanel"><p className="text-sm text-[#7d7598] dark:text-white/55">{empty}</p></AdhdPanel>
    : <div className="grid content-start gap-3 sm:grid-cols-2">{items}</div>;
}

function LibraryField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">{label}</span>
      {children}
    </label>
  );
}

function LibraryCardHeader({ detail, title }: { detail: string; title: string }) {
  return (
    <div>
      <p className="break-words text-sm font-semibold text-[#26324f] dark:text-white">{title}</p>
      <p className="mt-1 break-words text-xs text-[#74809b] dark:text-white/45">{detail}</p>
    </div>
  );
}

function formatBrandedFoodName(food: Pick<HealthFoodLibraryItem, "brand_name" | "food_name">) {
  return food.brand_name?.trim()
    ? `${food.brand_name.trim()} · ${food.food_name}`
    : food.food_name;
}

function NutritionLine({ calories, protein, carbs, fat }: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) {
  return (
    <p className="mt-2 text-xs text-[#6d7a96] dark:text-white/50">
      {formatNutritionValue(calories)} kcal / Protein {formatNutritionValue(protein)}g / Carbs {formatNutritionValue(carbs)}g / Fat {formatNutritionValue(fat)}g
    </p>
  );
}

function formatNutritionValue(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "—";
}

function getFoodDraftValidationMessage(draft: FoodDraft) {
  return getHealthCustomFoodDraftValidationMessage(draft);
}

function foodToDraft(food: HealthFoodLibraryItem): FoodDraft {
  return createHealthCustomFoodSavedDraft(food).form;
}

function hasFoodDraftChanges(food: HealthFoodLibraryItem, draft: FoodDraft) {
  const foodDetails = normalizeHealthNutritionDetails(food.nutrition_details);
  const draftDetails = parseHealthNutritionDetailsInput(draft.nutritionDetails);
  return food.food_name !== draft.foodName.trim()
    || (food.brand_name ?? "") !== draft.brandName.trim()
    || (food.barcode ?? "") !== draft.barcode.trim()
    || (food.food_category ?? "Uncategorized") !== (draft.foodCategory.trim() || "Uncategorized")
    || food.calories !== Number.parseInt(draft.calories, 10)
    || food.protein_g !== nullableNumber(draft.protein)
    || food.carbs_g !== nullableNumber(draft.carbs)
    || food.fat_g !== nullableNumber(draft.fat)
    || food.serving_quantity !== nullablePositiveNumber(draft.servingQuantity)
    || food.serving_unit !== draft.servingUnit.trim()
    || food.serving_measure_value !== nullablePositiveNumber(draft.servingMeasureValue)
    || (food.serving_measure_unit ?? "") !== draft.servingMeasureUnit
    || HEALTH_NUTRITION_FIELD_REGISTRY.some((field) => foodDetails?.[field.key] !== draftDetails?.[field.key]);
}

function cloneFoodDraft(draft: FoodDraft): FoodDraft {
  return {
    ...draft,
    nutritionDetails: { ...draft.nutritionDetails },
  };
}

function parsePositive(value: string | number) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function nullableNumber(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nullablePositiveNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

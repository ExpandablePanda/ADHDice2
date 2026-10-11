import type {
  HealthFoodLibraryItem,
  HealthMealEntry,
  HealthMealEntryInsert,
  HealthNutritionDetails,
  HealthServingMeasureUnit,
} from "@/lib/database.types";
import type { EditingSessionStore } from "@/lib/editing-session-store";
import { getCurrentHealthDateTimeInputs } from "@/lib/health-utils";
import { buildHealthMealFoodSnapshot, formatHealthConsumedMealLabel, normalizeHealthMealStoredCalories } from "@/lib/health-meal-recalculation";
import { calculateHealthFoodNutrition } from "@/lib/health-nutrition";

export type MealDraft = {
  attribution: string | null;
  barcode: string | null;
  brandName: string;
  calories: string;
  carbs: string;
  date: string;
  fat: string;
  foodName: string;
  nutritionDetails: HealthNutritionDetails | null;
  mealSlot: HealthMealEntry["meal_slot"];
  protein: string;
  provider: string | null;
  providerItemId: string | null;
  quantity: string;
  measurement: string;
  sourceFoodId: string | null;
  foodCategory: string | null;
  servingQuantity: number | null;
  servingUnit: string;
  servingMeasureValue: number | null;
  servingMeasureUnit: HealthServingMeasureUnit | null;
  servingLabel: string;
  time: string;
};

export type MealEditDraft = {
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

export type HealthFoodNewEntryEditingSessionDraft = {
  kind: "new-entry";
  entryId: string;
  quickFoodId: string;
  mealDraft: MealDraft;
  saveToLibrary: boolean;
};

export type HealthFoodSavedEntryEditingSessionDraft = {
  kind: "saved-entry";
  mealEditDraft: MealEditDraft;
};

export type HealthFoodEditingSessionDraft =
  | HealthFoodNewEntryEditingSessionDraft
  | HealthFoodSavedEntryEditingSessionDraft;

export type HealthFoodEditingSessionSaveResult =
  | { savedDraft: HealthFoodEditingSessionDraft }
  | { error: string };

export function createHealthFoodDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function healthMealEntrySessionId(entryId: string) {
  return `health-meal-entry:${entryId}`;
}

export function healthMealNewEntrySessionId(draftId: string) {
  return `health-meal-new:${draftId}`;
}

export function createHealthFoodEditingSessionDraft(
  mealDraft: MealDraft,
  ids: { entryId?: string; quickFoodId?: string } = {},
): HealthFoodNewEntryEditingSessionDraft {
  return {
    kind: "new-entry",
    entryId: ids.entryId ?? createHealthFoodDraftId(),
    quickFoodId: ids.quickFoodId ?? createHealthFoodDraftId(),
    mealDraft,
    saveToLibrary: false,
  };
}

export function areHealthFoodEditingSessionDraftsEqual(
  left: HealthFoodEditingSessionDraft,
  right: HealthFoodEditingSessionDraft,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function saveHealthFoodEditingSession({
  store,
  draftId,
  save,
  removeAfterSuccess = false,
}: {
  store: EditingSessionStore<HealthFoodEditingSessionDraft>;
  draftId: string;
  save: (draft: HealthFoodEditingSessionDraft) => Promise<HealthFoodEditingSessionSaveResult>;
  removeAfterSuccess?: boolean;
}) {
  const session = store.getSnapshot(draftId);
  if (!session || session.isSaving) return false;
  const saveRevision = store.beginSave(draftId);
  if (saveRevision === null) return false;
  try {
    const result = await save(session.draft);
    if ("error" in result) {
      store.saveFailed(draftId, saveRevision, result.error);
      return false;
    }
    return removeAfterSuccess
      ? store.removeAfterSave(draftId, saveRevision)
      : store.saveSucceeded(draftId, saveRevision, result.savedDraft);
  } catch (error) {
    store.saveFailed(draftId, saveRevision, error instanceof Error ? error.message : "The meal could not be saved. Your draft is still here.");
    return false;
  }
}

export function healthMealEntryInsertMatches(
  entry: HealthMealEntry,
  input: Omit<HealthMealEntryInsert, "user_id">,
) {
  const expected: Partial<HealthMealEntry> = {
    attribution: input.attribution ?? null,
    barcode: input.barcode ?? null,
    brand_name: input.brand_name ?? null,
    calories: input.calories,
    carbs_g: input.carbs_g ?? null,
    consumed_quantity: input.consumed_quantity ?? null,
    consumed_unit: input.consumed_unit ?? null,
    entry_date: input.entry_date,
    fat_g: input.fat_g ?? null,
    food_name: input.food_name,
    food_snapshot: input.food_snapshot ?? null,
    id: input.id,
    logged_at: input.logged_at,
    meal_slot: input.meal_slot,
    nutrition_snapshot: input.nutrition_snapshot ?? null,
    protein_g: input.protein_g ?? null,
    provider: input.provider ?? "manual",
    provider_item_id: input.provider_item_id ?? null,
    serving_fraction: input.serving_fraction ?? null,
    serving_label: input.serving_label ?? null,
    source_food_id: input.source_food_id ?? null,
  };
  const valuesMatch = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left) && Array.isArray(right)
        && left.length === right.length
        && left.every((value, index) => valuesMatch(value, right[index]));
    }
    if (left && right && typeof left === "object" && typeof right === "object") {
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
      const leftKeys = Object.keys(leftRecord).sort();
      const rightKeys = Object.keys(rightRecord).sort();
      return leftKeys.length === rightKeys.length
        && leftKeys.every((key, index) => key === rightKeys[index] && valuesMatch(leftRecord[key], rightRecord[key]));
    }
    return false;
  };
  return Object.entries(expected).every(([key, value]) => valuesMatch(entry[key as keyof HealthMealEntry] ?? null, value ?? null));
}

export async function reconcileHealthMealEntryInsert({
  input,
  result,
  lookupById,
}: {
  input: Omit<HealthMealEntryInsert, "user_id">;
  result: { data: HealthMealEntry | null; error: { code?: string; message: string } | null };
  lookupById: (id: string) => Promise<{ row: HealthMealEntry | null; error?: string | null }>;
}): Promise<{ row: HealthMealEntry | null; error: string | null }> {
  if (!result.error && result.data) {
    return healthMealEntryInsertMatches(result.data, input)
      ? { row: result.data, error: null }
      : { row: null, error: "The saved meal did not match the draft. Your draft is still available to retry." };
  }
  const acknowledgmentMayBeAmbiguous = !result.error
    || result.error.code === "23505"
    || !result.error.code
    || result.error.code.startsWith("08")
    || result.error.code === "40003";
  if (!acknowledgmentMayBeAmbiguous) return { row: null, error: result.error?.message ?? "The meal could not be saved." };
  if (!input.id) {
    return { row: null, error: result.error?.message ?? "The meal save returned no record and could not be confirmed." };
  }
  const lookup = await lookupById(input.id);
  if (lookup.error || !lookup.row || !healthMealEntryInsertMatches(lookup.row, input)) {
    return {
      row: null,
      error: lookup.error ?? (result.error?.code === "23505"
        ? "The meal ID is already in use by a different saved entry."
        : result.error?.message ?? "The meal save could not be confirmed. Retry with the same draft."),
    };
  }
  return { row: lookup.row, error: null };
}

export type MealFoodSelection = {
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
  consumedQuantity?: number;
};

function validServingMeasureUnit(value: unknown): HealthServingMeasureUnit | null {
  return value === "g" || value === "oz" || value === "ml" || value === "fl_oz" ? value : null;
}

function positiveFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function mealFoodSelectionFromLibraryItem(item: HealthFoodLibraryItem): MealFoodSelection {
  return {
    attribution: item.attribution,
    barcode: item.barcode,
    brandName: item.brand_name ?? "",
    calories: item.calories,
    carbs: item.carbs_g,
    fat: item.fat_g,
    foodCategory: item.food_category ?? item.category,
    foodName: item.food_name,
    nutritionDetails: item.nutrition_details ?? null,
    provider: item.provider,
    providerItemId: item.provider_item_id ?? item.id,
    protein: item.protein_g,
    servingLabel: item.serving_label,
    servingMeasureUnit: validServingMeasureUnit(item.serving_measure_unit),
    servingMeasureValue: positiveFiniteNumber(item.serving_measure_value),
    servingQuantity: positiveFiniteNumber(item.serving_quantity) ?? 1,
    servingUnit: item.serving_unit?.trim() || "serving",
    sourceFoodId: item.id,
  };
}

export function buildHealthMealEntryInputFromSelection(
  selection: MealFoodSelection,
  options: {
    date: string;
    id: string;
    loggedAt: string;
    mealSlot: HealthMealEntry["meal_slot"];
  },
): Omit<HealthMealEntryInsert, "user_id"> {
  const servingQuantity = Number.isFinite(selection.servingQuantity) && selection.servingQuantity > 0 ? selection.servingQuantity : 1;
  const servingUnit = selection.servingUnit.trim() || "serving";
  const consumedQuantity = selection.consumedQuantity ?? servingQuantity;
  const consumedUnit = selection.consumedUnit ?? servingUnit;
  const calculation = selection.consumedQuantity === undefined ? null : calculateHealthFoodNutrition({
    consumedQuantity,
    consumedUnit,
    nutritionPerServing: {
      calories: selection.calories,
      carbs_g: selection.carbs,
      fat_g: selection.fat,
      nutrition_details: selection.nutritionDetails,
      protein_g: selection.protein,
    },
    servingMeasureUnit: selection.servingMeasureUnit,
    servingMeasureValue: selection.servingMeasureValue,
    servingQuantity,
    servingUnit,
  });
  const nutritionSnapshot = calculation?.nutrientTotals ?? {
    calories: Math.round(selection.calories),
    carbs_g: selection.carbs,
    fat_g: selection.fat,
    nutrition_details: selection.nutritionDetails,
    protein_g: selection.protein,
  };
  const storedCalories = normalizeHealthMealStoredCalories(nutritionSnapshot.calories);
  if (storedCalories === null) throw new Error("Calories must be a non-negative number.");
  return {
    attribution: selection.attribution,
    barcode: selection.barcode,
    brand_name: selection.brandName.trim() || null,
    calories: storedCalories,
    carbs_g: nutritionSnapshot.carbs_g,
    consumed_quantity: consumedQuantity,
    consumed_unit: consumedUnit,
    entry_date: options.date,
    fat_g: nutritionSnapshot.fat_g,
    food_name: selection.foodName.trim(),
    food_snapshot: buildHealthMealFoodSnapshot({
      attribution: selection.attribution,
      barcode: selection.barcode,
      brandName: selection.brandName,
      calories: selection.calories,
      carbs: selection.carbs,
      fat: selection.fat,
      foodCategory: selection.foodCategory,
      foodName: selection.foodName,
      nutritionDetails: selection.nutritionDetails,
      provider: selection.provider,
      providerItemId: selection.providerItemId,
      protein: selection.protein,
      servingLabel: selection.servingLabel,
      servingMeasureUnit: selection.servingMeasureUnit,
      servingMeasureValue: selection.servingMeasureValue,
      servingQuantity,
      servingUnit,
      sourceFoodId: selection.sourceFoodId,
    }),
    id: options.id,
    logged_at: options.loggedAt,
    meal_slot: options.mealSlot,
    nutrition_snapshot: nutritionSnapshot,
    provider: selection.provider ?? "manual",
    provider_item_id: selection.providerItemId,
    protein_g: nutritionSnapshot.protein_g,
    serving_fraction: calculation?.servingFraction ?? 1,
    serving_label: calculation ? formatHealthConsumedMealLabel(calculation, selection.servingLabel) : selection.servingLabel,
    source_food_id: selection.sourceFoodId,
  };
}

export function prepareHealthMealEntryFromDraft(
  draft: MealDraft,
  options: { date: string; id: string; loggedAt: string; mealSlot: HealthMealEntry["meal_slot"]; sourceFoodId?: string | null },
) {
  const calories = Number(draft.calories);
  const servingQuantity = positiveFiniteNumber(draft.servingQuantity);
  const consumedQuantity = positiveFiniteNumber(draft.quantity);
  const servingUnit = draft.servingUnit.trim() || "serving";
  if (!draft.foodName.trim() || !Number.isFinite(calories) || calories < 0 || !servingQuantity || !consumedQuantity) return null;
  const nullableDraftNumber = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const selection: MealFoodSelection = {
    attribution: draft.attribution,
    barcode: draft.barcode,
    brandName: draft.brandName,
    calories,
    carbs: nullableDraftNumber(draft.carbs),
    fat: nullableDraftNumber(draft.fat),
    foodCategory: draft.foodCategory,
    foodName: draft.foodName,
    nutritionDetails: draft.nutritionDetails,
    provider: draft.provider,
    providerItemId: draft.providerItemId,
    protein: nullableDraftNumber(draft.protein),
    servingLabel: draft.servingLabel,
    servingMeasureUnit: draft.servingMeasureUnit,
    servingMeasureValue: draft.servingMeasureValue,
    servingQuantity,
    servingUnit,
    sourceFoodId: options.sourceFoodId === undefined ? draft.sourceFoodId : options.sourceFoodId,
  };
  let calculation: ReturnType<typeof calculateHealthFoodNutrition>;
  try {
    calculation = calculateHealthFoodNutrition({
      consumedQuantity,
      consumedUnit: draft.measurement,
      nutritionPerServing: {
        calories: selection.calories,
        carbs_g: selection.carbs,
        fat_g: selection.fat,
        nutrition_details: selection.nutritionDetails,
        protein_g: selection.protein,
      },
      servingMeasureUnit: selection.servingMeasureUnit,
      servingMeasureValue: selection.servingMeasureValue,
      servingQuantity: selection.servingQuantity,
      servingUnit: selection.servingUnit,
    });
  } catch {
    return null;
  }
  const nutritionSnapshot = calculation.nutrientTotals;
  if (normalizeHealthMealStoredCalories(nutritionSnapshot.calories) === null) return null;
  const input = buildHealthMealEntryInputFromSelection({
    ...selection,
    consumedQuantity,
    consumedUnit: draft.measurement,
  }, options);
  return { calculation, input };
}

const DEFAULT_MEAL_DRAFT: MealDraft = {
  attribution: null,
  barcode: null,
  brandName: "",
  calories: "",
  carbs: "",
  date: "",
  fat: "",
  foodName: "",
  nutritionDetails: null,
  mealSlot: "breakfast",
  protein: "",
  provider: null,
  providerItemId: null,
  quantity: "1",
  measurement: "serving",
  sourceFoodId: null,
  foodCategory: null,
  servingQuantity: null,
  servingUnit: "serving",
  servingMeasureValue: null,
  servingMeasureUnit: null,
  servingLabel: "",
  time: "",
};

function isValidMealTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function createDefaultMealDraft(
  mealSlot: HealthMealEntry["meal_slot"] = "breakfast",
  now?: Date,
): MealDraft {
  return {
    ...DEFAULT_MEAL_DRAFT,
    ...getCurrentHealthDateTimeInputs(now),
    mealSlot,
  };
}

export function resetMealDraftForNextItem(currentDraft: MealDraft, now?: Date): MealDraft {
  const currentInputs = getCurrentHealthDateTimeInputs(now);
  return {
    ...DEFAULT_MEAL_DRAFT,
    date: currentDraft.date || currentInputs.date,
    mealSlot: currentDraft.mealSlot,
    time: isValidMealTime(currentDraft.time) ? currentDraft.time : currentInputs.time,
  };
}

export function prepareMealDraftForSelectedSlot(
  currentDraft: MealDraft,
  foodHistoryDate: string,
  mealSlot: HealthMealEntry["meal_slot"],
  now?: Date,
): MealDraft {
  return {
    ...resetMealDraftForNextItem(currentDraft, now),
    date: foodHistoryDate,
    mealSlot,
  };
}

export function hasMeaningfulMealDraft(currentDraft: MealDraft) {
  const hasFoodData = [
    currentDraft.attribution,
    currentDraft.barcode,
    currentDraft.brandName,
    currentDraft.calories,
    currentDraft.carbs,
    currentDraft.fat,
    currentDraft.foodName,
    currentDraft.nutritionDetails,
    currentDraft.protein,
    currentDraft.provider,
    currentDraft.providerItemId,
    currentDraft.sourceFoodId,
    currentDraft.foodCategory,
    currentDraft.servingLabel,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
  return hasFoodData
    || currentDraft.nutritionDetails !== null
    || currentDraft.servingMeasureValue !== null
    || currentDraft.servingMeasureUnit !== null
    || currentDraft.quantity !== "1"
    || currentDraft.measurement !== "serving";
}

export function hasUnsafeUnconvertedHealthFoodDraft({
  activeMealSlot,
  editingMealPlanId,
  mealDraft,
  mealEditorMode,
  isSaving,
}: {
  activeMealSlot: HealthMealEntry["meal_slot"] | null;
  editingMealPlanId: string | null;
  mealDraft: MealDraft;
  mealEditorMode: "actual" | "plan";
  isSaving: boolean;
}) {
  return Boolean(isSaving || (mealEditorMode === "plan" && (
    (activeMealSlot && hasMeaningfulMealDraft(mealDraft)) || editingMealPlanId
  )));
}

import type {
  HealthFoodLibraryItem,
  HealthMealEntry,
  HealthMealEntryInsert,
  HealthNutritionDetails,
  HealthServingMeasureUnit,
} from "@/lib/database.types";
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

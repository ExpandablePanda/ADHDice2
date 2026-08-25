import type { HealthMealEntry, HealthNutritionDetails, HealthServingMeasureUnit } from "@/lib/database.types";
import { getCurrentHealthDateTimeInputs } from "@/lib/health-utils";

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

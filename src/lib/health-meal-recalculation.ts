import type {
  HealthFoodLibraryItem,
  HealthMealEntry,
  HealthMealEntryUpdate,
  HealthMealFoodSnapshot,
  HealthNutritionDetails,
} from "@/lib/database.types";
import { formatHealthFoodQuantityUnit } from "@/lib/health-library";
import { calculateHealthFoodNutrition } from "@/lib/health-nutrition";

export type HealthMealFoodSnapshotSource = {
  attribution?: string | null;
  barcode?: string | null;
  brandName?: string | null;
  calories: number;
  carbs?: number | null;
  fat?: number | null;
  foodCategory?: string | null;
  foodName: string;
  nutritionDetails?: HealthNutritionDetails | null;
  provider?: string | null;
  providerItemId?: string | null;
  protein?: number | null;
  servingLabel?: string | null;
  servingMeasureUnit?: HealthFoodLibraryItem["serving_measure_unit"];
  servingMeasureValue?: number | null;
  servingQuantity: number;
  servingUnit: string;
  sourceFoodId?: string | null;
};

export type HealthFoodHistoryRepairResult = {
  requested: number;
  updated: number;
  skipped: number;
  failed: number;
  failureMessages: string[];
};

export function selectHealthFoodMealEntriesBySourceId(
  mealEntries: HealthMealEntry[],
  sourceFoodId: string,
) {
  return mealEntries.filter((entry) => entry.source_food_id === sourceFoodId);
}

export function buildHealthMealFoodSnapshot(source: HealthMealFoodSnapshotSource): HealthMealFoodSnapshot {
  return {
    attribution: source.attribution ?? null,
    barcode: source.barcode ?? null,
    brand_name: source.brandName ?? null,
    calories: Number.isFinite(source.calories) ? source.calories : 0,
    carbs_g: source.carbs ?? null,
    food_category: source.foodCategory ?? null,
    food_name: source.foodName.trim(),
    fat_g: source.fat ?? null,
    provider: source.provider ?? "manual",
    provider_item_id: source.providerItemId ?? null,
    serving_label: source.servingLabel ?? null,
    serving_measure_unit: source.servingMeasureUnit ?? null,
    serving_measure_value: source.servingMeasureValue ?? null,
    serving_quantity: source.servingQuantity > 0 ? source.servingQuantity : 1,
    serving_unit: source.servingUnit.trim() || "serving",
    source_food_id: source.sourceFoodId ?? null,
    protein_g: source.protein ?? null,
    nutrition_details: source.nutritionDetails ?? null,
  };
}

export function formatHealthConsumedMealLabel(
  calculation: ReturnType<typeof calculateHealthFoodNutrition>,
  servingLabel: string | null | undefined,
) {
  const consumedLabel = formatHealthFoodQuantityUnit(calculation.consumed.quantity, calculation.consumed.unit);
  const serving = servingLabel?.trim() || null;
  return serving ? `${consumedLabel} / ${serving}` : consumedLabel;
}

export function buildHealthFoodHistoryMealEntryUpdate(
  food: HealthFoodLibraryItem,
  entry: HealthMealEntry,
): HealthMealEntryUpdate {
  const consumedQuantity = entry.consumed_quantity;
  const consumedUnit = entry.consumed_unit?.trim();
  if (typeof consumedQuantity !== "number" || !Number.isFinite(consumedQuantity) || consumedQuantity <= 0 || !consumedUnit) {
    throw new Error("The saved serving amount is unavailable.");
  }

  const calculation = calculateHealthFoodNutrition({
    consumedQuantity,
    consumedUnit,
    nutritionPerServing: {
      calories: food.calories,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
      protein_g: food.protein_g,
      nutrition_details: food.nutrition_details ?? null,
    },
    servingMeasureUnit: food.serving_measure_unit,
    servingMeasureValue: food.serving_measure_value,
    servingQuantity: food.serving_quantity,
    servingUnit: food.serving_unit,
  });
  const foodSnapshot = buildHealthMealFoodSnapshot({
    attribution: food.attribution,
    barcode: food.barcode,
    brandName: food.brand_name,
    calories: food.calories,
    carbs: food.carbs_g,
    fat: food.fat_g,
    foodCategory: food.food_category ?? food.category,
    foodName: food.food_name,
    nutritionDetails: food.nutrition_details ?? null,
    provider: food.provider,
    providerItemId: food.provider_item_id,
    protein: food.protein_g,
    servingLabel: food.serving_label,
    servingMeasureUnit: food.serving_measure_unit,
    servingMeasureValue: food.serving_measure_value,
    servingQuantity: food.serving_quantity,
    servingUnit: food.serving_unit,
    sourceFoodId: food.id,
  });

  return {
    attribution: food.attribution,
    barcode: food.barcode,
    brand_name: food.brand_name,
    calories: Math.round(calculation.nutrientTotals.calories),
    carbs_g: calculation.nutrientTotals.carbs_g,
    fat_g: calculation.nutrientTotals.fat_g,
    food_name: food.food_name,
    nutrition_snapshot: calculation.nutrientTotals,
    provider: food.provider,
    provider_item_id: food.provider_item_id,
    protein_g: calculation.nutrientTotals.protein_g,
    serving_fraction: calculation.servingFraction,
    serving_label: formatHealthConsumedMealLabel(calculation, food.serving_label),
    food_snapshot: foodSnapshot,
  };
}

export function formatHealthFoodHistoryRepairResult(result: HealthFoodHistoryRepairResult) {
  if (result.requested === 0) {
    return "No previous logs were found.";
  }
  const updatedLabel = `${result.updated} previous log${result.updated === 1 ? "" : "s"}`;
  let message = `Updated ${updatedLabel}.`;
  if (result.skipped > 0) {
    message += ` ${result.skipped} ${result.skipped === 1 ? "entry was" : "entries were"} skipped because ${result.skipped === 1 ? "its serving amount" : "their serving amounts"} could not be reconciled.`;
  }
  if (result.failed > 0) {
    const failureDetail = result.failureMessages[0] ? ` ${result.failureMessages[0]}` : "";
    message += ` ${result.failed} ${result.failed === 1 ? "entry failed" : "entries failed"} to update.${failureDetail} Retry Update Previous Logs.`;
  }
  return message;
}

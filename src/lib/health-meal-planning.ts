import type {
  HealthMealEntryInsert,
  HealthMealPlanEntry,
  HealthMealPlanEntryInsert,
  HealthMealPlanEntryUpdate,
  HealthMealSlot,
  HealthNutritionDetails,
} from "@/lib/database.types";
import { aggregateHealthNutritionDetails } from "@/lib/health-nutrition";
import { buildHealthMealLoggedAt, isHealthMealTimestampFuture } from "@/lib/health-utils";
import type { MealDraft } from "@/lib/health-meal-draft";

export type MealCalculationSnapshot = {
  consumed: { quantity: number; unit: string };
  nutrientTotals: {
    calories: number;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    nutrition_details?: HealthNutritionDetails | null;
  };
  servingFraction: number;
};

export type PlannedNutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutrition_details?: HealthNutritionDetails;
  nutrition_coverage?: ReturnType<typeof aggregateHealthNutritionDetails>["coverage"];
};

export function buildHealthMealPlanPayload({
  calculation,
  draft,
  mealSlot,
  plannedDate,
  plannedTime,
  foodSnapshot,
}: {
  calculation: MealCalculationSnapshot;
  draft: MealDraft;
  mealSlot: HealthMealSlot;
  plannedDate: string;
  plannedTime: string;
  foodSnapshot: NonNullable<HealthMealPlanEntryInsert["food_snapshot"]>;
}): Omit<HealthMealPlanEntryInsert, "user_id"> {
  const plannedAt = buildHealthMealLoggedAt(plannedDate, plannedTime);
  if (!plannedAt) {
    throw new Error("Choose a valid planned date and time.");
  }
  return {
    attribution: draft.attribution,
    barcode: draft.barcode,
    brand_name: draft.brandName.trim() || null,
    calories: Math.round(calculation.nutrientTotals.calories),
    carbs_g: calculation.nutrientTotals.carbs_g,
    food_name: draft.foodName.trim(),
    fat_g: calculation.nutrientTotals.fat_g,
    meal_slot: mealSlot,
    nutrition_snapshot: calculation.nutrientTotals,
    planned_at: plannedAt,
    planned_date: plannedDate,
    planned_time: plannedTime,
    provider: draft.provider ?? "manual",
    provider_item_id: draft.providerItemId,
    protein_g: calculation.nutrientTotals.protein_g,
    serving_fraction: calculation.servingFraction,
    serving_label: formatPlanServingLabel(calculation, draft.servingLabel),
    source_food_id: draft.sourceFoodId,
    consumed_quantity: calculation.consumed.quantity,
    consumed_unit: calculation.consumed.unit,
    food_snapshot: foodSnapshot,
  };
}

export function buildActualMealEntryInputFromPlan(plan: HealthMealPlanEntry): Omit<HealthMealEntryInsert, "user_id"> {
  return {
    attribution: plan.attribution,
    barcode: plan.barcode,
    brand_name: plan.brand_name,
    calories: plan.calories,
    carbs_g: plan.carbs_g,
    entry_date: plan.planned_date,
    fat_g: plan.fat_g,
    food_name: plan.food_name,
    id: plan.confirmed_meal_entry_id ?? undefined,
    logged_at: plan.planned_at,
    meal_slot: plan.meal_slot,
    nutrition_snapshot: plan.nutrition_snapshot ?? null,
    provider: plan.provider,
    provider_item_id: plan.provider_item_id,
    protein_g: plan.protein_g,
    serving_fraction: plan.serving_fraction ?? null,
    serving_label: plan.serving_label,
    source_food_id: plan.source_food_id ?? null,
    consumed_quantity: plan.consumed_quantity ?? null,
    consumed_unit: plan.consumed_unit ?? null,
    food_snapshot: plan.food_snapshot ?? null,
  };
}

export function buildHealthMealPlanUpdateFromPayload(payload: Omit<HealthMealPlanEntryInsert, "user_id">): HealthMealPlanEntryUpdate {
  const update = { ...payload };
  delete update.id;
  return update;
}

export function getActiveHealthMealPlans(entries: HealthMealPlanEntry[], plannedDate?: string) {
  return entries
    .filter((entry) => entry.confirmed_at === null && (!plannedDate || entry.planned_date === plannedDate))
    .sort(sortHealthMealPlans);
}

export function sortHealthMealPlans(left: HealthMealPlanEntry, right: HealthMealPlanEntry) {
  return `${left.planned_date}T${left.planned_time}`.localeCompare(`${right.planned_date}T${right.planned_time}`)
    || left.created_at.localeCompare(right.created_at)
    || left.id.localeCompare(right.id);
}

export function sumHealthMealPlanNutritionForDate(entries: HealthMealPlanEntry[], plannedDate: string): PlannedNutritionTotals {
  const datedEntries = getActiveHealthMealPlans(entries, plannedDate);
  const expanded = aggregateHealthNutritionDetails(datedEntries.map((entry) => ({
    nutritionDetails: entry.nutrition_snapshot?.nutrition_details,
  })));
  const totals = datedEntries.reduce((result, entry) => ({
    calories: result.calories + (entry.nutrition_snapshot?.calories ?? entry.calories),
    protein: result.protein + (entry.nutrition_snapshot?.protein_g ?? entry.protein_g ?? 0),
    carbs: result.carbs + (entry.nutrition_snapshot?.carbs_g ?? entry.carbs_g ?? 0),
    fat: result.fat + (entry.nutrition_snapshot?.fat_g ?? entry.fat_g ?? 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return {
    ...totals,
    ...(expanded.nutritionDetails ? { nutrition_details: expanded.nutritionDetails } : {}),
    ...(Object.keys(expanded.coverage).length > 0 ? { nutrition_coverage: expanded.coverage } : {}),
  };
}

export function isHealthMealPlanConfirmEligible(plan: HealthMealPlanEntry, now = new Date()) {
  return plan.confirmed_at === null
    && Boolean(buildHealthMealLoggedAt(plan.planned_date, plan.planned_time))
    && !isHealthMealTimestampFuture(plan.planned_date, plan.planned_time, now);
}

export function mealDraftFromHealthMealPlan(plan: HealthMealPlanEntry): MealDraft {
  return {
    attribution: plan.attribution,
    barcode: plan.barcode,
    brandName: plan.brand_name ?? "",
    calories: String(plan.food_snapshot?.calories ?? plan.calories),
    carbs: plan.food_snapshot?.carbs_g == null ? "" : String(plan.food_snapshot.carbs_g),
    date: plan.planned_date,
    fat: plan.food_snapshot?.fat_g == null ? "" : String(plan.food_snapshot.fat_g),
    foodName: plan.food_snapshot?.food_name ?? plan.food_name,
    nutritionDetails: plan.food_snapshot?.nutrition_details ?? plan.nutrition_snapshot?.nutrition_details ?? null,
    mealSlot: plan.meal_slot,
    protein: plan.food_snapshot?.protein_g == null ? "" : String(plan.food_snapshot.protein_g),
    provider: plan.provider,
    providerItemId: plan.provider_item_id,
    quantity: String(plan.consumed_quantity ?? 1),
    measurement: plan.consumed_unit ?? "serving",
    sourceFoodId: plan.source_food_id ?? plan.food_snapshot?.source_food_id ?? null,
    foodCategory: plan.food_snapshot?.food_category ?? null,
    servingQuantity: plan.food_snapshot?.serving_quantity ?? 1,
    servingUnit: plan.food_snapshot?.serving_unit ?? "serving",
    servingMeasureValue: plan.food_snapshot?.serving_measure_value ?? null,
    servingMeasureUnit: plan.food_snapshot?.serving_measure_unit ?? null,
    servingLabel: plan.food_snapshot?.serving_label ?? plan.serving_label ?? "",
    time: plan.planned_time,
  };
}

function formatPlanServingLabel(calculation: MealCalculationSnapshot, servingLabel: string | null | undefined) {
  const consumedLabel = `${calculation.consumed.quantity} ${calculation.consumed.unit}`;
  return servingLabel?.trim() ? `${consumedLabel} / ${servingLabel.trim()}` : consumedLabel;
}

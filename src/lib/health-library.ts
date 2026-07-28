import type {
  HealthFoodLibraryItem,
  HealthServingWeightUnit,
  HealthRecipe,
  HealthRecipeIngredient,
  HealthSavedMeal,
  HealthSavedMealItem,
  HealthWaterEntry,
  HealthWaterUnit,
} from "@/lib/database.types";

export type HealthNutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type HealthFoodIdentityInput = {
  barcode?: string | null;
  brand_name?: string | null;
  brandName?: string | null;
  category?: string | null;
  calories?: number | null;
  carbs_g?: number | null;
  carbs?: number | null;
  fat_g?: number | null;
  fat?: number | null;
  food_name?: string | null;
  foodName?: string | null;
  id?: string | null;
  protein_g?: number | null;
  protein?: number | null;
  provider?: string | null;
  provider_item_id?: string | null;
  providerItemId?: string | null;
  serving_label?: string | null;
  servingLabel?: string | null;
  serving_size?: string | null;
  servingSize?: string | null;
  serving_weight_amount?: number | null;
  servingWeightAmount?: number | null;
  serving_weight_unit?: HealthServingWeightUnit | null;
  servingWeightUnit?: HealthServingWeightUnit | null;
};

const MILLILITERS_PER_CUP = 236.588;
const MILLILITERS_PER_FLUID_OUNCE = 29.5735;

export function buildRecipeIngredient(
  food: HealthFoodLibraryItem,
  quantity: number,
): HealthRecipeIngredient {
  return {
    food_id: food.id,
    food_name: food.food_name,
    serving_label: food.serving_label,
    quantity: positiveNumber(quantity),
    calories: food.calories,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
  };
}

export function buildSavedMealFoodItem(
  food: HealthFoodLibraryItem,
  quantity: number,
): HealthSavedMealItem {
  return {
    source_id: food.id,
    source_type: "food",
    name: food.food_name,
    serving_label: food.serving_label,
    quantity: positiveNumber(quantity),
    calories: food.calories,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
  };
}

export function buildSavedMealRecipeItem(
  recipe: HealthRecipe,
  quantity: number,
): HealthSavedMealItem {
  const perServing = getRecipeNutritionPerServing(recipe);
  return {
    source_id: recipe.id,
    source_type: "recipe",
    name: recipe.name,
    serving_label: recipe.servings === 1 ? "1 serving" : `1 of ${formatQuantity(recipe.servings)} servings`,
    quantity: positiveNumber(quantity),
    calories: perServing.calories,
    protein_g: perServing.protein,
    carbs_g: perServing.carbs,
    fat_g: perServing.fat,
  };
}

export function getRecipeNutrition(recipe: Pick<HealthRecipe, "ingredients">) {
  return sumNutritionItems(recipe.ingredients);
}

export function getRecipeNutritionPerServing(
  recipe: Pick<HealthRecipe, "ingredients" | "servings">,
) {
  const totals = getRecipeNutrition(recipe);
  const servings = positiveNumber(recipe.servings);
  return {
    calories: Math.round(totals.calories / servings),
    protein: roundNutrition(totals.protein / servings),
    carbs: roundNutrition(totals.carbs / servings),
    fat: roundNutrition(totals.fat / servings),
  };
}

export function getSavedMealNutrition(meal: Pick<HealthSavedMeal, "items">) {
  return sumNutritionItems(meal.items);
}

export function getHealthFoodIdentityKey(food: HealthFoodIdentityInput) {
  const provider = normalizeIdentityPart(food.provider);
  const providerItemId = normalizeIdentityPart(food.provider_item_id ?? food.providerItemId);
  if (provider && providerItemId) {
    return `provider:${provider}:${providerItemId}`;
  }

  const barcode = normalizeIdentityPart(food.barcode);
  if (barcode) {
    return `barcode:${barcode}`;
  }

  const id = normalizeIdentityPart(food.id);
  if (id && provider !== "manual") {
    return `id:${id}`;
  }

  const name = normalizeIdentityPart(food.food_name ?? food.foodName);
  if (!name) {
    return null;
  }

  const brand = normalizeIdentityPart(food.brand_name ?? food.brandName) ?? "no-brand";
  const serving = normalizeIdentityPart(
    food.serving_label
      ?? food.servingLabel
      ?? composeHealthFoodServingLabel({
        servingSize: food.serving_size ?? food.servingSize,
        servingWeightAmount: food.serving_weight_amount ?? food.servingWeightAmount,
        servingWeightUnit: food.serving_weight_unit ?? food.servingWeightUnit,
      }),
  ) ?? "no-serving";
  return [
    "manual",
    name,
    brand,
    serving,
    Math.round(food.calories ?? 0),
    roundNutrition(food.protein_g ?? food.protein ?? 0),
    roundNutrition(food.carbs_g ?? food.carbs ?? 0),
    roundNutrition(food.fat_g ?? food.fat ?? 0),
  ].join(":");
}

export function formatHealthServingWeightUnit(unit: HealthServingWeightUnit) {
  return unit === "fl_oz" ? "fl oz" : unit;
}

export function composeHealthFoodServingLabel({
  servingSize,
  servingWeightAmount,
  servingWeightUnit,
}: {
  servingSize?: string | null;
  servingWeightAmount?: number | null;
  servingWeightUnit?: HealthServingWeightUnit | null;
}) {
  const size = servingSize?.trim() || null;
  const hasWeight = typeof servingWeightAmount === "number"
    && Number.isFinite(servingWeightAmount)
    && servingWeightAmount > 0
    && servingWeightUnit;
  const weight = hasWeight
    ? `${formatQuantity(servingWeightAmount)} ${formatHealthServingWeightUnit(servingWeightUnit)}`
    : null;
  return [size, weight].filter(Boolean).join(" / ") || null;
}

export function normalizeHealthFoodLibraryItem(food: HealthFoodLibraryItem): HealthFoodLibraryItem {
  const servingSize = food.serving_size ?? food.serving_label ?? null;
  const servingWeightAmount = food.serving_weight_amount ?? null;
  const servingWeightUnit = food.serving_weight_unit ?? null;
  return {
    ...food,
    category: food.category ?? null,
    serving_label: food.serving_label ?? composeHealthFoodServingLabel({
      servingSize,
      servingWeightAmount,
      servingWeightUnit,
    }),
    serving_size: servingSize,
    serving_weight_amount: servingWeightAmount,
    serving_weight_unit: servingWeightUnit,
  };
}

export function waterAmountToMilliliters(amount: number, unit: HealthWaterUnit) {
  const multiplier = unit === "cup" ? MILLILITERS_PER_CUP : MILLILITERS_PER_FLUID_OUNCE;
  return roundNutrition(positiveNumber(amount) * multiplier);
}

export function millilitersToWaterAmount(amountMl: number, unit: HealthWaterUnit) {
  const divisor = unit === "cup" ? MILLILITERS_PER_CUP : MILLILITERS_PER_FLUID_OUNCE;
  return roundNutrition(Math.max(0, amountMl) / divisor);
}

export function sumWaterForDate(entries: HealthWaterEntry[], dateKey: string) {
  const amountMl = entries
    .filter((entry) => entry.entry_date === dateKey)
    .reduce((sum, entry) => sum + entry.amount_ml, 0);
  return {
    amountMl: roundNutrition(amountMl),
    cups: millilitersToWaterAmount(amountMl, "cup"),
    fluidOunces: millilitersToWaterAmount(amountMl, "fl_oz"),
  };
}

export function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(roundNutrition(value));
}

function normalizeIdentityPart(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function sumNutritionItems(
  items: Array<{
    calories: number;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    quantity: number;
  }>,
): HealthNutritionTotals {
  const totals = items.reduce<HealthNutritionTotals>(
    (sum, item) => {
      const quantity = positiveNumber(item.quantity);
      sum.calories += Math.max(0, item.calories) * quantity;
      sum.protein += Math.max(0, item.protein_g ?? 0) * quantity;
      sum.carbs += Math.max(0, item.carbs_g ?? 0) * quantity;
      sum.fat += Math.max(0, item.fat_g ?? 0) * quantity;
      return sum;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return {
    calories: Math.round(totals.calories),
    protein: roundNutrition(totals.protein),
    carbs: roundNutrition(totals.carbs),
    fat: roundNutrition(totals.fat),
  };
}

function positiveNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function roundNutrition(value: number) {
  return Number(value.toFixed(2));
}

import type {
  HealthFoodLibraryItem,
  HealthFoodLibraryItemInsert,
  HealthMealEntry,
  HealthServingMeasureUnit,
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

export function searchHealthFoodLibrary(items: HealthFoodLibraryItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }
  return items.filter((food) => [
    food.food_name,
    food.brand_name,
    food.food_category,
    food.category,
    food.serving_label,
    food.provider,
    food.barcode,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery)));
}

export type HealthFoodAutocompleteField = "food_name" | "brand_name" | "food_category" | "serving_unit";

export function sortHealthFoodLibraryByCreatedAt(items: HealthFoodLibraryItem[]) {
  return [...items].sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id));
}

export function getHealthFoodAutocompleteValues(
  items: HealthFoodLibraryItem[],
  field: HealthFoodAutocompleteField,
) {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const food of sortHealthFoodLibraryByCreatedAt(items)) {
    const value = food[field];
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    const normalized = value.toLocaleLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    values.push(value);
  }
  return values;
}

export function sortHealthFoodsForMealPicker(
  foods: HealthFoodLibraryItem[],
  mealEntries: HealthMealEntry[],
) {
  const latestLoggedAtByIdentity = new Map<string, number>();
  mealEntries.forEach((entry) => {
    const identity = getHealthFoodIdentityKey(entry);
    if (!identity) {
      return;
    }
    const parsedLoggedAt = Date.parse(entry.logged_at);
    const parsedEntryDate = Date.parse(`${entry.entry_date}T00:00:00`);
    const loggedAt = Number.isFinite(parsedLoggedAt) ? parsedLoggedAt : parsedEntryDate;
    if (!Number.isFinite(loggedAt)) {
      return;
    }
    const current = latestLoggedAtByIdentity.get(identity);
    if (current === undefined || loggedAt > current) {
      latestLoggedAtByIdentity.set(identity, loggedAt);
    }
  });

  return [...foods].sort((left, right) => {
    const leftLoggedAt = latestLoggedAtByIdentity.get(getHealthFoodIdentityKey(left) ?? "");
    const rightLoggedAt = latestLoggedAtByIdentity.get(getHealthFoodIdentityKey(right) ?? "");
    if (leftLoggedAt !== undefined || rightLoggedAt !== undefined) {
      if (leftLoggedAt === undefined) return 1;
      if (rightLoggedAt === undefined) return -1;
      if (leftLoggedAt !== rightLoggedAt) return rightLoggedAt - leftLoggedAt;
    }
    return right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id);
  });
}

export function formatHealthServingWeightUnit(unit: HealthServingWeightUnit) {
  return unit === "fl_oz" ? "fl oz" : unit;
}

export function formatHealthServingMeasureUnit(unit: HealthServingMeasureUnit) {
  if (unit === "fl_oz") {
    return "fl oz";
  }
  if (unit === "ml") {
    return "mL";
  }
  return unit;
}

function formatHealthFoodUnitPlural(unit: string) {
  const trimmed = unit.trim();
  if (!trimmed || /s$/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed === trimmed.toUpperCase() ? `${trimmed}S` : `${trimmed}s`;
}

function getHealthFoodMeasureLabel(unit: string) {
  const normalized = unit.trim().toLowerCase();
  if (normalized === "g" || normalized === "oz") {
    return normalized;
  }
  if (normalized === "ml") {
    return "mL";
  }
  if (normalized === "fl_oz" || normalized === "fl oz") {
    return "fl oz";
  }
  return null;
}

export function formatHealthFoodQuantityUnit(quantity: number, unit: string) {
  const formattedQuantity = formatQuantity(quantity);
  const trimmedUnit = unit.trim();
  if (!trimmedUnit) {
    return formattedQuantity;
  }
  const measureLabel = getHealthFoodMeasureLabel(trimmedUnit);
  if (measureLabel) {
    return `${formattedQuantity} ${measureLabel}`;
  }
  return `${formattedQuantity} ${quantity === 1 ? trimmedUnit : formatHealthFoodUnitPlural(trimmedUnit)}`;
}

export function composeHealthFoodServingDefinition({
  servingQuantity,
  servingUnit,
  servingMeasureValue,
  servingMeasureUnit,
  servingLabel,
}: {
  servingQuantity?: number | null;
  servingUnit?: string | null;
  servingMeasureValue?: number | null;
  servingMeasureUnit?: HealthServingMeasureUnit | null;
  servingLabel?: string | null;
}) {
  const trimmedUnit = servingUnit?.trim() ?? "";
  const quantity = typeof servingQuantity === "number" && Number.isFinite(servingQuantity) && servingQuantity > 0
    ? servingQuantity
    : null;
  const measure = typeof servingMeasureValue === "number"
    && Number.isFinite(servingMeasureValue)
    && servingMeasureValue > 0
    && servingMeasureUnit
    ? formatHealthFoodQuantityUnit(servingMeasureValue, servingMeasureUnit)
    : null;
  const quantityLabel = quantity !== null && trimmedUnit
    ? formatHealthFoodQuantityUnit(quantity, trimmedUnit)
    : null;
  const isMeasureOnly = Boolean(getHealthFoodMeasureLabel(trimmedUnit));
  const representation = isMeasureOnly
    ? quantityLabel
    : quantityLabel && trimmedUnit.toLowerCase() !== "serving"
      ? measure ? `${quantityLabel} / ${measure}` : quantityLabel
      : measure ?? servingLabel?.trim() ?? quantityLabel ?? "1 serving";
  return `1 serving = ${representation || "1 serving"}`;
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

export function composeHealthFoodStructuredServingLabel({
  servingQuantity,
  servingUnit,
  servingMeasureValue,
  servingMeasureUnit,
}: {
  servingQuantity: number;
  servingUnit: string;
  servingMeasureValue?: number | null;
  servingMeasureUnit?: HealthServingMeasureUnit | null;
}) {
  const quantity = Number.isFinite(servingQuantity) && servingQuantity > 0 && servingUnit.trim()
    ? formatHealthFoodQuantityUnit(servingQuantity, servingUnit)
    : null;
  const measure = typeof servingMeasureValue === "number"
    && Number.isFinite(servingMeasureValue)
    && servingMeasureValue > 0
    && servingMeasureUnit
    ? formatHealthFoodQuantityUnit(servingMeasureValue, servingMeasureUnit)
    : null;
  return [quantity, measure].filter(Boolean).join(" / ") || null;
}

export function normalizeHealthFoodLibraryInput(input: Omit<HealthFoodLibraryItemInsert, "user_id">) {
  const foodCategory = input.food_category?.trim() || input.category?.trim() || "Uncategorized";
  const servingQuantity = typeof input.serving_quantity === "number"
    && Number.isFinite(input.serving_quantity)
    && input.serving_quantity > 0
    ? input.serving_quantity
    : 1;
  const servingUnit = input.serving_unit?.trim() || "serving";
  const servingMeasureUnit = input.serving_measure_unit === "g"
    || input.serving_measure_unit === "oz"
    || input.serving_measure_unit === "ml"
    || input.serving_measure_unit === "fl_oz"
    ? input.serving_measure_unit
    : null;
  const servingMeasureValue = typeof input.serving_measure_value === "number"
    && Number.isFinite(input.serving_measure_value)
    && input.serving_measure_value > 0
    && servingMeasureUnit
    ? input.serving_measure_value
    : null;
  const servingLabel = input.serving_label
    ?? composeHealthFoodStructuredServingLabel({
      servingQuantity,
      servingUnit,
      servingMeasureValue,
      servingMeasureUnit,
    });
  return {
    ...input,
    category: foodCategory,
    food_category: foodCategory,
    serving_label: servingLabel,
    serving_size: input.serving_size ?? servingLabel,
    serving_quantity: servingQuantity,
    serving_unit: servingUnit,
    serving_measure_value: servingMeasureValue,
    serving_measure_unit: servingMeasureUnit,
  };
}

export function normalizeHealthFoodLibraryItem(food: HealthFoodLibraryItem): HealthFoodLibraryItem {
  const rawFood = food as HealthFoodLibraryItem & {
    food_category?: string | null;
    serving_measure_unit?: HealthServingMeasureUnit | null;
    serving_measure_value?: number | null;
    serving_quantity?: number | null;
    serving_unit?: string | null;
  };
  const foodCategory = rawFood.food_category?.trim() || rawFood.category?.trim() || "Uncategorized";
  const servingSize = rawFood.serving_size ?? rawFood.serving_label ?? null;
  const servingQuantity = typeof rawFood.serving_quantity === "number"
    && Number.isFinite(rawFood.serving_quantity)
    && rawFood.serving_quantity > 0
    ? rawFood.serving_quantity
    : 1;
  const servingUnit = rawFood.serving_unit?.trim() || "serving";
  const servingMeasureUnit = rawFood.serving_measure_unit === "g"
    || rawFood.serving_measure_unit === "oz"
    || rawFood.serving_measure_unit === "ml"
    || rawFood.serving_measure_unit === "fl_oz"
    ? rawFood.serving_measure_unit
    : null;
  const servingMeasureValue = typeof rawFood.serving_measure_value === "number"
    && Number.isFinite(rawFood.serving_measure_value)
    && rawFood.serving_measure_value > 0
    && servingMeasureUnit
    ? rawFood.serving_measure_value
    : null;
  const servingWeightAmount = food.serving_weight_amount ?? null;
  const servingWeightUnit = food.serving_weight_unit ?? null;
  return {
    ...food,
    category: food.category?.trim() || foodCategory,
    food_category: foodCategory,
    serving_label: food.serving_label
      ?? composeHealthFoodStructuredServingLabel({
        servingQuantity,
        servingUnit,
        servingMeasureValue,
        servingMeasureUnit,
      })
      ?? composeHealthFoodServingLabel({ servingSize, servingWeightAmount, servingWeightUnit }),
    serving_size: servingSize,
    serving_quantity: servingQuantity,
    serving_unit: servingUnit,
    serving_measure_value: servingMeasureValue,
    serving_measure_unit: servingMeasureUnit,
    serving_weight_amount: servingWeightAmount,
    serving_weight_unit: servingWeightUnit,
  };
}

export function setHealthFoodFavoriteStatus(
  food: HealthFoodLibraryItem,
  isFavorite: boolean,
  updatedAt = food.updated_at,
): HealthFoodLibraryItem {
  return {
    ...food,
    is_favorite: isFavorite,
    updated_at: updatedAt,
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

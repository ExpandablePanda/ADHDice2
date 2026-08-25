import type {
  HealthFoodLibraryItem,
  HealthFoodLibraryItemInsert,
  HealthMealEntry,
  HealthNutritionDetails,
  HealthServingMeasureUnit,
  HealthServingWeightUnit,
  HealthRecipe,
  HealthRecipeIngredient,
  HealthSavedMeal,
  HealthSavedMealItem,
  HealthWaterEntry,
  HealthWaterUnit,
} from "@/lib/database.types";
import {
  aggregateHealthNutritionDetails,
  normalizeHealthNutritionDetails,
  scaleHealthNutritionDetails,
  type HealthNutritionCoverage,
} from "@/lib/health-nutrition";

export type HealthNutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutrition_details?: HealthNutritionDetails | null;
  nutrition_coverage?: HealthNutritionCoverage;
};

export type HealthMealPickerSuggestion =
  | { item: HealthFoodLibraryItem; kind: "food"; label: string; value: string }
  | { item: HealthRecipe; kind: "recipe"; label: string; value: string }
  | { item: HealthSavedMeal; kind: "saved_meal"; label: string; value: string };

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
    nutrition_details: food.nutrition_details ?? null,
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
    nutrition_details: food.nutrition_details ?? null,
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
    nutrition_details: perServing.nutrition_details ?? null,
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
    ...(totals.nutrition_details
      ? {
          nutrition_details: scaleHealthNutritionDetails(totals.nutrition_details, 1 / servings),
          nutrition_coverage: scaleHealthNutritionCoverage(totals.nutrition_coverage, 1 / servings),
        }
      : {}),
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

export type HealthFoodLogHistory = {
  count: number;
  latestLoggedAt: string | null;
  entries: HealthMealEntry[];
};

export type HealthDailyCaloriePoint = {
  date: string;
  label: string;
  calories: number;
};

function compareHealthMealEntriesNewestFirst(left: HealthMealEntry, right: HealthMealEntry) {
  const leftLoggedAt = Date.parse(left.logged_at);
  const rightLoggedAt = Date.parse(right.logged_at);
  if (Number.isFinite(leftLoggedAt) && Number.isFinite(rightLoggedAt) && leftLoggedAt !== rightLoggedAt) {
    return rightLoggedAt - leftLoggedAt;
  }
  if (Number.isFinite(leftLoggedAt) !== Number.isFinite(rightLoggedAt)) {
    return Number.isFinite(rightLoggedAt) ? 1 : -1;
  }
  return right.entry_date.localeCompare(left.entry_date)
    || right.created_at.localeCompare(left.created_at)
    || right.id.localeCompare(left.id);
}

export function buildHealthFoodLogHistoryIndex(mealEntries: HealthMealEntry[]) {
  const history = new Map<string, HealthFoodLogHistory>();
  mealEntries.forEach((entry) => {
    const identity = getHealthFoodIdentityKey(entry);
    if (!identity) {
      return;
    }
    const current = history.get(identity);
    if (current) {
      current.entries.push(entry);
      current.count += 1;
      return;
    }
    history.set(identity, {
      count: 1,
      entries: [entry],
      latestLoggedAt: null,
    });
  });

  history.forEach((value) => {
    value.entries.sort(compareHealthMealEntriesNewestFirst);
    value.latestLoggedAt = value.entries
      .map((entry) => entry.logged_at)
      .find((loggedAt) => Number.isFinite(Date.parse(loggedAt))) ?? null;
  });
  return history;
}

function shiftHealthAnalyticsDate(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part ?? "", 10));
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatHealthCaloriePointLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime()) ? dateKey : date.toLocaleDateString(undefined, { weekday: "short" });
}

export function buildHealthDailyCalorieSeries({
  endDate,
  mealEntries,
  days = 7,
}: {
  endDate: string;
  mealEntries: HealthMealEntry[];
  days?: number;
}) {
  const pointCount = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 7;
  const caloriesByDate = new Map<string, number>();
  mealEntries.forEach((entry) => {
    caloriesByDate.set(entry.entry_date, (caloriesByDate.get(entry.entry_date) ?? 0) + (Number.isFinite(entry.calories) ? entry.calories : 0));
  });

  return Array.from({ length: pointCount }, (_, index) => {
    const date = shiftHealthAnalyticsDate(endDate, index - pointCount + 1);
    return {
      calories: caloriesByDate.get(date) ?? 0,
      date,
      label: formatHealthCaloriePointLabel(date),
    } satisfies HealthDailyCaloriePoint;
  });
}

export function searchHealthFoodLibrary(items: HealthFoodLibraryItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }
  return items.filter((food) => [
    formatHealthFoodDisplayName(food),
    food.food_name,
    food.brand_name,
    food.food_category,
    food.category,
    food.serving_label,
    food.provider,
    food.barcode,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery)));
}

export function formatHealthFoodDisplayName(
  food: Pick<HealthFoodLibraryItem, "brand_name" | "food_name">,
) {
  return food.brand_name?.trim()
    ? `${food.brand_name.trim()} · ${food.food_name}`
    : food.food_name;
}

export function getHealthFoodDisplaySuggestions(
  items: Array<Pick<HealthFoodLibraryItem, "brand_name" | "food_name">>,
) {
  const suggestions: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const suggestion = formatHealthFoodDisplayName(item);
    const normalized = suggestion.toLocaleLowerCase();
    if (!suggestion.trim() || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    suggestions.push(suggestion);
  }
  return suggestions;
}

export function buildHealthMealPickerSuggestions({
  foods,
  recipes,
  savedMeals,
}: {
  foods: HealthFoodLibraryItem[];
  recipes: HealthRecipe[];
  savedMeals: HealthSavedMeal[];
}): HealthMealPickerSuggestion[] {
  return [
    ...foods.map((item) => ({
      item,
      kind: "food" as const,
      label: formatHealthFoodDisplayName(item),
      value: `food:${item.id}`,
    })),
    ...recipes.map((item) => ({
      item,
      kind: "recipe" as const,
      label: `${item.name} · Recipe`,
      value: `recipe:${item.id}`,
    })),
    ...savedMeals.map((item) => ({
      item,
      kind: "saved_meal" as const,
      label: `${item.name} · Saved Meal`,
      value: `saved-meal:${item.id}`,
    })),
  ];
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
    ...(Object.prototype.hasOwnProperty.call(input, "nutrition_details")
      ? { nutrition_details: normalizeHealthNutritionDetails(input.nutrition_details) }
      : {}),
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
    nutrition_details: normalizeHealthNutritionDetails(rawFood.nutrition_details),
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
    nutrition_details?: HealthNutritionDetails | null;
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
  const nutrition = aggregateHealthNutritionDetails(items.map((item) => ({
    nutritionDetails: item.nutrition_details,
    quantity: positiveNumber(item.quantity),
  })));
  return {
    calories: Math.round(totals.calories),
    protein: roundNutrition(totals.protein),
    carbs: roundNutrition(totals.carbs),
    fat: roundNutrition(totals.fat),
    ...(nutrition.nutritionDetails
      ? {
          nutrition_details: nutrition.nutritionDetails,
          nutrition_coverage: nutrition.coverage,
        }
      : {}),
  };
}

function positiveNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function roundNutrition(value: number) {
  return Number(value.toFixed(2));
}

function scaleHealthNutritionCoverage(coverage: HealthNutritionCoverage | undefined, factor: number): HealthNutritionCoverage | undefined {
  if (!coverage) return undefined;
  return Object.fromEntries(Object.entries(coverage).map(([key, value]) => [
    key,
    value ? { ...value, value: value.value * factor } : value,
  ])) as HealthNutritionCoverage;
}

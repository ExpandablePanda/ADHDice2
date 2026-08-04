"use client";

import type { HealthServingMeasureUnit } from "@/lib/database.types";

export type HealthNutritionPerServing = {
  calories: number;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
};

export type HealthFoodNutritionCalculation = {
  servingFraction: number;
  consumed: {
    quantity: number;
    unit: string;
  };
  serving: {
    quantity: number;
    unit: string;
    measureValue: number | null;
    measureUnit: HealthServingMeasureUnit | null;
  };
  basis: {
    quantity: number;
    unit: string;
    dimension: "servings" | "count" | "mass" | "volume";
  };
  nutrientTotals: {
    calories: number;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
};

export type HealthFoodMeasurementOption = {
  value: string;
  label: string;
};

type MeasurementDimension = HealthFoodNutritionCalculation["basis"]["dimension"];

const GRAMS_PER_OUNCE = 28.349523125;
const MILLILITERS_PER_FLUID_OUNCE = 29.5735295625;

export function calculateHealthFoodNutrition({
  nutritionPerServing,
  servingQuantity,
  servingUnit,
  servingMeasureValue = null,
  servingMeasureUnit = null,
  consumedQuantity,
  consumedUnit,
}: {
  nutritionPerServing: HealthNutritionPerServing;
  servingQuantity: number;
  servingUnit: string;
  servingMeasureValue?: number | null;
  servingMeasureUnit?: HealthServingMeasureUnit | null;
  consumedQuantity: number;
  consumedUnit: string;
}): HealthFoodNutritionCalculation {
  assertPositiveFinite(servingQuantity, "Serving quantity");
  assertPositiveFinite(consumedQuantity, "Consumed quantity");

  const normalizedServingUnit = normalizeNutritionUnit(servingUnit);
  const normalizedConsumedUnit = normalizeNutritionUnit(consumedUnit);
  if (!normalizedServingUnit) {
    throw new Error("Serving unit is required.");
  }
  if (!normalizedConsumedUnit) {
    throw new Error("Consumed unit is required.");
  }

  const hasMeasureValue = servingMeasureValue !== null && servingMeasureValue !== undefined;
  const hasMeasureUnit = servingMeasureUnit !== null && servingMeasureUnit !== undefined && Boolean(normalizeNutritionUnit(servingMeasureUnit));
  if (hasMeasureValue !== hasMeasureUnit) {
    throw new Error("Serving measure value and unit must be provided together.");
  }
  if (hasMeasureValue) {
    assertPositiveFinite(servingMeasureValue, "Serving measure value");
  }

  const measureUnit = hasMeasureUnit ? normalizeNutritionUnit(servingMeasureUnit) : null;
  const measureDimension = measureUnit ? getMeasurementDimension(measureUnit) : null;
  const servingDimension = getMeasurementDimension(normalizedServingUnit);
  const consumedDimension = getMeasurementDimension(normalizedConsumedUnit);
  if (measureUnit && measureDimension === "count") {
    throw new Error("Serving measure unit must be g, oz, ml, or fl oz.");
  }

  let basis: HealthFoodNutritionCalculation["basis"];
  let servingBasisAmount: number;
  let consumedBasisAmount: number;

  if (normalizedConsumedUnit === "serving") {
    basis = { dimension: "servings", quantity: 1, unit: "serving" };
    servingBasisAmount = 1;
    consumedBasisAmount = consumedQuantity;
  } else if (servingDimension === consumedDimension && servingDimension !== "count" && servingDimension !== "servings") {
    basis = { dimension: servingDimension, quantity: servingQuantity, unit: normalizedServingUnit };
    servingBasisAmount = convertToBaseUnit(servingQuantity, normalizedServingUnit);
    consumedBasisAmount = convertToBaseUnit(consumedQuantity, normalizedConsumedUnit);
  } else if (servingDimension === "count" && consumedDimension === "count" && unitsMatch(normalizedServingUnit, normalizedConsumedUnit)) {
    basis = { dimension: "count", quantity: servingQuantity, unit: normalizedServingUnit };
    servingBasisAmount = servingQuantity;
    consumedBasisAmount = consumedQuantity;
  } else if (measureUnit && measureDimension === consumedDimension && measureDimension !== "count" && measureDimension !== "servings") {
    basis = { dimension: measureDimension, quantity: servingMeasureValue as number, unit: measureUnit };
    servingBasisAmount = convertToBaseUnit(servingMeasureValue as number, measureUnit);
    consumedBasisAmount = convertToBaseUnit(consumedQuantity, normalizedConsumedUnit);
  } else {
    throw new Error("Consumed quantity is incompatible with this serving definition.");
  }

  if (!Number.isFinite(servingBasisAmount) || servingBasisAmount <= 0 || !Number.isFinite(consumedBasisAmount) || consumedBasisAmount <= 0) {
    throw new Error("Serving quantities must be positive and finite.");
  }

  const servingFraction = consumedBasisAmount / servingBasisAmount;
  return {
    servingFraction,
    consumed: { quantity: consumedQuantity, unit: consumedUnit.trim() },
    serving: {
      quantity: servingQuantity,
      unit: servingUnit.trim(),
      measureValue: hasMeasureValue ? servingMeasureValue as number : null,
      measureUnit: measureUnit as HealthServingMeasureUnit | null,
    },
    basis,
    nutrientTotals: {
      calories: scaleNutritionValue(nutritionPerServing.calories, servingFraction, "Calories per serving"),
      protein_g: scaleNullableNutritionValue(nutritionPerServing.protein_g, servingFraction, "Protein per serving"),
      carbs_g: scaleNullableNutritionValue(nutritionPerServing.carbs_g, servingFraction, "Carbohydrates per serving"),
      fat_g: scaleNullableNutritionValue(nutritionPerServing.fat_g, servingFraction, "Fat per serving"),
    },
  };
}

export function getHealthFoodMeasurementOptions({
  servingUnit,
  servingMeasureUnit,
}: {
  servingUnit?: string | null;
  servingMeasureUnit?: HealthServingMeasureUnit | null;
}): HealthFoodMeasurementOption[] {
  const options: HealthFoodMeasurementOption[] = [{ value: "serving", label: "servings" }];
  const normalizedServingUnit = normalizeNutritionUnit(servingUnit);
  if (normalizedServingUnit && normalizedServingUnit !== "serving" && getMeasurementDimension(normalizedServingUnit) === "count") {
    options.push({ value: servingUnit?.trim() ?? normalizedServingUnit, label: servingUnit?.trim() ?? normalizedServingUnit });
  }
  const normalizedMeasureUnit = normalizeNutritionUnit(servingMeasureUnit);
  const equivalentUnits = normalizedMeasureUnit === "g" || normalizedMeasureUnit === "oz"
    ? ["g", "oz"]
    : normalizedMeasureUnit === "ml" || normalizedMeasureUnit === "fl_oz"
      ? ["ml", "fl_oz"]
      : [];
  equivalentUnits.forEach((unit) => {
    options.push({ value: unit, label: formatNutritionUnitLabel(unit) });
  });
  return options;
}

export type HealthFoodLookupProvider = "open_food_facts" | "usda";

export type HealthFoodLookupResult = {
  attribution: string;
  barcode: string | null;
  brandName: string | null;
  calories: number;
  carbs: number | null;
  fat: number | null;
  foodName: string;
  protein: number | null;
  provider: HealthFoodLookupProvider;
  providerItemId: string;
  servingLabel: string | null;
};

type OpenFoodFactsProduct = {
  _id?: string;
  brands?: string;
  code?: string;
  generic_name?: string;
  nutriments?: {
    "carbohydrates_serving"?: number | string;
    "carbohydrates_100g"?: number | string;
    "energy-kcal_serving"?: number | string;
    "energy-kcal_100g"?: number | string;
    "fat_serving"?: number | string;
    "fat_100g"?: number | string;
    "proteins_serving"?: number | string;
    "proteins_100g"?: number | string;
  };
  product_name?: string;
  product_quantity?: string;
  quantity?: string;
  serving_quantity?: string | number;
  serving_size?: string;
};

type OpenFoodFactsSearchResponse = {
  products?: OpenFoodFactsProduct[];
};

type OpenFoodFactsBarcodeResponse = {
  product?: OpenFoodFactsProduct;
  status?: number;
};

type UsdaFoodSearchResult = {
  attribution?: string | null;
  barcode?: string | null;
  brandName?: string | null;
  calories?: number | null;
  carbs?: number | null;
  fat?: number | null;
  foodName?: string | null;
  id?: string | number | null;
  protein?: number | null;
  provider?: string | null;
  servingLabel?: string | null;
};

type UsdaFunctionResponse = {
  error?: string;
  results?: UsdaFoodSearchResult[];
};

const OPEN_FOOD_FACTS_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const OPEN_FOOD_FACTS_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
const OPEN_FOOD_FACTS_ATTRIBUTION = "Open Food Facts";

export async function lookupOpenFoodFactsByBarcode(barcode: string) {
  const normalizedBarcode = barcode.replace(/\D/g, "");
  if (normalizedBarcode.length < 8) {
    throw new Error("Enter at least 8 digits for a barcode lookup.");
  }

  const response = await fetch(`${OPEN_FOOD_FACTS_PRODUCT_URL}/${normalizedBarcode}.json`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Barcode lookup is unavailable right now.");
  }

  const payload = (await response.json()) as OpenFoodFactsBarcodeResponse;
  if (payload.status !== 1 || !payload.product) {
    return null;
  }

  return normalizeOpenFoodFactsProduct(payload.product);
}

export async function searchHealthFoods(query: string) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    throw new Error("Enter at least 2 characters to search foods.");
  }

  const usdaResults = await searchUsdaFoods(trimmedQuery).catch(() => []);
  if (usdaResults.length > 0) {
    return usdaResults;
  }

  return searchOpenFoodFactsFoods(trimmedQuery);
}

export async function searchOpenFoodFactsFoods(query: string) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    throw new Error("Enter at least 2 characters to search foods.");
  }

  const searchUrl = new URL(OPEN_FOOD_FACTS_SEARCH_URL);
  searchUrl.searchParams.set("search_terms", trimmedQuery);
  searchUrl.searchParams.set("search_simple", "1");
  searchUrl.searchParams.set("action", "process");
  searchUrl.searchParams.set("json", "1");
  searchUrl.searchParams.set("page_size", "8");
  searchUrl.searchParams.set("fields", "id,code,product_name,generic_name,brands,serving_size,quantity,product_quantity,nutriments");

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Food search is unavailable right now.");
  }

  const payload = (await response.json()) as OpenFoodFactsSearchResponse;
  return dedupeLookupResults(
    (payload.products ?? [])
      .map((product) => normalizeOpenFoodFactsProduct(product))
      .filter((product): product is HealthFoodLookupResult => product !== null),
  );
}

export async function searchUsdaFoods(query: string) {
  const functionUrl = resolveSupabaseFunctionUrl("health-food-search");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!functionUrl || !anonKey) {
    return [];
  }

  const response = await fetch(functionUrl, {
    body: JSON.stringify({ query }),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("USDA search is unavailable right now.");
  }

  const payload = (await response.json()) as UsdaFunctionResponse;
  if (payload.error) {
    throw new Error(payload.error);
  }

  return dedupeLookupResults(
    (payload.results ?? [])
      .map((result) => normalizeUsdaFoodResult(result))
      .filter((result): result is HealthFoodLookupResult => result !== null),
  );
}

export function normalizeOpenFoodFactsProduct(product: OpenFoodFactsProduct): HealthFoodLookupResult | null {
  const foodName = firstNonEmpty(product.product_name, product.generic_name);
  const providerItemId = firstNonEmpty(product._id, product.code);
  if (!foodName || !providerItemId) {
    return null;
  }

  const calories = numberOrNull(
    product.nutriments?.["energy-kcal_serving"],
    product.nutriments?.["energy-kcal_100g"],
  );

  return {
    attribution: OPEN_FOOD_FACTS_ATTRIBUTION,
    barcode: firstNonEmpty(product.code) ?? null,
    brandName: firstNonEmpty(product.brands) ?? null,
    calories: calories !== null ? Math.max(0, Math.round(calories)) : 0,
    carbs: clampNutritionValue(numberOrNull(
      product.nutriments?.["carbohydrates_serving"],
      product.nutriments?.["carbohydrates_100g"],
    )),
    fat: clampNutritionValue(numberOrNull(
      product.nutriments?.["fat_serving"],
      product.nutriments?.["fat_100g"],
    )),
    foodName,
    protein: clampNutritionValue(numberOrNull(
      product.nutriments?.["proteins_serving"],
      product.nutriments?.["proteins_100g"],
    )),
    provider: "open_food_facts",
    providerItemId,
    servingLabel: firstNonEmpty(
      product.serving_size,
      typeof product.serving_quantity === "number" || typeof product.serving_quantity === "string"
        ? `${product.serving_quantity}`
        : null,
      product.product_quantity,
      product.quantity,
    ) ?? null,
  };
}

export function normalizeUsdaFoodResult(result: UsdaFoodSearchResult): HealthFoodLookupResult | null {
  const foodName = firstNonEmpty(result.foodName);
  const providerItemId = result.id === null || result.id === undefined ? null : String(result.id);
  if (!foodName || !providerItemId) {
    return null;
  }

  return {
    attribution: firstNonEmpty(result.attribution) ?? "USDA FoodData Central",
    barcode: firstNonEmpty(result.barcode) ?? null,
    brandName: firstNonEmpty(result.brandName) ?? null,
    calories: Math.max(0, Math.round(result.calories ?? 0)),
    carbs: clampNutritionValue(result.carbs ?? null),
    fat: clampNutritionValue(result.fat ?? null),
    foodName,
    protein: clampNutritionValue(result.protein ?? null),
    provider: "usda",
    providerItemId,
    servingLabel: firstNonEmpty(result.servingLabel) ?? null,
  };
}

export function dedupeLookupResults(results: HealthFoodLookupResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.provider}:${result.providerItemId}:${result.foodName.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveSupabaseFunctionUrl(functionName: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`;
}

function assertPositiveFinite(value: number | null | undefined, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
}

function normalizeNutritionUnit(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, "_") ?? "";
  switch (normalized) {
    case "servings":
      return "serving";
    case "milliliter":
    case "milliliters":
    case "millilitre":
    case "millilitres":
      return "ml";
    case "fluid_ounce":
    case "fluid_ounces":
    case "fl_ounce":
    case "fl_ounces":
      return "fl_oz";
    default:
      return normalized;
  }
}

function formatNutritionUnitLabel(unit: string) {
  if (unit === "ml") return "mL";
  if (unit === "fl_oz") return "fl oz";
  return unit;
}

function getMeasurementDimension(unit: string): MeasurementDimension {
  if (unit === "serving") {
    return "servings";
  }
  if (unit === "g" || unit === "oz") {
    return "mass";
  }
  if (unit === "ml" || unit === "fl_oz") {
    return "volume";
  }
  return "count";
}

function unitsMatch(left: string, right: string) {
  return left === right;
}

function convertToBaseUnit(quantity: number, unit: string) {
  if (unit === "oz") {
    return quantity * GRAMS_PER_OUNCE;
  }
  if (unit === "fl_oz") {
    return quantity * MILLILITERS_PER_FLUID_OUNCE;
  }
  return quantity;
}

function scaleNutritionValue(value: number, servingFraction: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value * servingFraction;
}

function scaleNullableNutritionValue(value: number | null | undefined, servingFraction: number, label: string) {
  return value === null || value === undefined
    ? null
    : scaleNutritionValue(value, servingFraction, label);
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function numberOrNull(...values: Array<number | string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function clampNutritionValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Number(value.toFixed(1)));
}

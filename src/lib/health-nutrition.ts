"use client";

import type {
  HealthNutritionDetailKey,
  HealthNutritionDetails,
  HealthServingMeasureUnit,
} from "@/lib/database.types";

export type HealthNutritionUnit = "g" | "mg" | "mcg";

export type HealthNutritionFieldDefinition = {
  key: HealthNutritionDetailKey;
  label: string;
  group: "Nutrition Details" | "Vitamins & Minerals" | "Other";
  unit: HealthNutritionUnit;
  providerKeys: readonly string[];
};

export const HEALTH_NUTRITION_FIELD_REGISTRY: readonly HealthNutritionFieldDefinition[] = [
  { key: "saturated_fat_g", label: "Saturated Fat", group: "Nutrition Details", unit: "g", providerKeys: ["saturated-fat"] },
  { key: "trans_fat_g", label: "Trans Fat", group: "Nutrition Details", unit: "g", providerKeys: ["trans-fat"] },
  { key: "monounsaturated_fat_g", label: "Monounsaturated Fat", group: "Nutrition Details", unit: "g", providerKeys: ["monounsaturated-fat"] },
  { key: "polyunsaturated_fat_g", label: "Polyunsaturated Fat", group: "Nutrition Details", unit: "g", providerKeys: ["polyunsaturated-fat"] },
  { key: "cholesterol_mg", label: "Cholesterol", group: "Nutrition Details", unit: "mg", providerKeys: ["cholesterol"] },
  { key: "sodium_mg", label: "Sodium", group: "Nutrition Details", unit: "mg", providerKeys: ["sodium"] },
  { key: "dietary_fiber_g", label: "Dietary Fiber", group: "Nutrition Details", unit: "g", providerKeys: ["fiber"] },
  { key: "soluble_fiber_g", label: "Soluble Fiber", group: "Nutrition Details", unit: "g", providerKeys: ["soluble-fiber"] },
  { key: "insoluble_fiber_g", label: "Insoluble Fiber", group: "Nutrition Details", unit: "g", providerKeys: ["insoluble-fiber"] },
  { key: "total_sugars_g", label: "Total Sugars", group: "Nutrition Details", unit: "g", providerKeys: ["sugars"] },
  { key: "added_sugars_g", label: "Added Sugars", group: "Nutrition Details", unit: "g", providerKeys: ["added-sugars"] },
  { key: "sugar_alcohol_g", label: "Sugar Alcohol", group: "Nutrition Details", unit: "g", providerKeys: ["sugar-alcohol"] },
  { key: "vitamin_a_mcg_rae", label: "Vitamin A", group: "Vitamins & Minerals", unit: "mcg", providerKeys: ["vitamin-a"] },
  { key: "vitamin_c_mg", label: "Vitamin C", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["vitamin-c"] },
  { key: "vitamin_d_mcg", label: "Vitamin D", group: "Vitamins & Minerals", unit: "mcg", providerKeys: ["vitamin-d"] },
  { key: "vitamin_e_mg", label: "Vitamin E", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["vitamin-e"] },
  { key: "vitamin_k_mcg", label: "Vitamin K", group: "Vitamins & Minerals", unit: "mcg", providerKeys: ["vitamin-k"] },
  { key: "thiamin_b1_mg", label: "Thiamin (B1)", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["vitamin-b1", "thiamin"] },
  { key: "riboflavin_b2_mg", label: "Riboflavin (B2)", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["vitamin-b2", "riboflavin"] },
  { key: "niacin_b3_mg", label: "Niacin (B3)", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["vitamin-b3", "niacin"] },
  { key: "pantothenic_acid_b5_mg", label: "Pantothenic Acid (B5)", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["vitamin-b5", "pantothenic-acid"] },
  { key: "vitamin_b6_mg", label: "Vitamin B6", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["vitamin-b6"] },
  { key: "biotin_b7_mcg", label: "Biotin (B7)", group: "Vitamins & Minerals", unit: "mcg", providerKeys: ["vitamin-b7", "biotin"] },
  { key: "folate_b9_mcg_dfe", label: "Folate (B9)", group: "Vitamins & Minerals", unit: "mcg", providerKeys: ["vitamin-b9", "folates", "folate"] },
  { key: "vitamin_b12_mcg", label: "Vitamin B12", group: "Vitamins & Minerals", unit: "mcg", providerKeys: ["vitamin-b12"] },
  { key: "choline_mg", label: "Choline", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["choline"] },
  { key: "calcium_mg", label: "Calcium", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["calcium"] },
  { key: "iron_mg", label: "Iron", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["iron"] },
  { key: "magnesium_mg", label: "Magnesium", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["magnesium"] },
  { key: "phosphorus_mg", label: "Phosphorus", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["phosphorus"] },
  { key: "potassium_mg", label: "Potassium", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["potassium"] },
  { key: "zinc_mg", label: "Zinc", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["zinc"] },
  { key: "copper_mg", label: "Copper", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["copper"] },
  { key: "manganese_mg", label: "Manganese", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["manganese"] },
  { key: "selenium_mcg", label: "Selenium", group: "Vitamins & Minerals", unit: "mcg", providerKeys: ["selenium"] },
  { key: "iodine_mcg", label: "Iodine", group: "Vitamins & Minerals", unit: "mcg", providerKeys: ["iodine"] },
  { key: "chromium_mcg", label: "Chromium", group: "Vitamins & Minerals", unit: "mcg", providerKeys: ["chromium"] },
  { key: "molybdenum_mcg", label: "Molybdenum", group: "Vitamins & Minerals", unit: "mcg", providerKeys: ["molybdenum"] },
  { key: "chloride_mg", label: "Chloride", group: "Vitamins & Minerals", unit: "mg", providerKeys: ["chloride"] },
  { key: "caffeine_mg", label: "Caffeine", group: "Other", unit: "mg", providerKeys: ["caffeine"] },
  { key: "omega_3_g", label: "Omega-3", group: "Other", unit: "g", providerKeys: ["omega-3", "omega_3"] },
  { key: "omega_6_g", label: "Omega-6", group: "Other", unit: "g", providerKeys: ["omega-6", "omega_6"] },
] as const;

const NUTRITION_DETAIL_KEYS = new Set<HealthNutritionDetailKey>(HEALTH_NUTRITION_FIELD_REGISTRY.map((field) => field.key));

export type HealthNutritionCoverageValue = {
  value: number;
  knownEntries: number;
  totalEntries: number;
  complete: boolean;
};

export type HealthNutritionCoverage = Partial<Record<HealthNutritionDetailKey, HealthNutritionCoverageValue>>;

export type HealthNutritionAggregation = {
  nutritionDetails: HealthNutritionDetails | null;
  coverage: HealthNutritionCoverage;
};

export function convertHealthNutritionValue(value: number, fromUnit: HealthNutritionUnit | "µg", toUnit: HealthNutritionUnit | "µg") {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalizedFrom = fromUnit === "µg" ? "mcg" : fromUnit;
  const normalizedTo = toUnit === "µg" ? "mcg" : toUnit;
  const inMicrograms = normalizedFrom === "g" ? value * 1_000_000 : normalizedFrom === "mg" ? value * 1_000 : value;
  return normalizedTo === "g" ? inMicrograms / 1_000_000 : normalizedTo === "mg" ? inMicrograms / 1_000 : inMicrograms;
}

export function normalizeHealthNutritionDetails(value: unknown): HealthNutritionDetails | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const normalized: HealthNutritionDetails = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!NUTRITION_DETAIL_KEYS.has(key as HealthNutritionDetailKey)) {
      continue;
    }
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < 0) {
      continue;
    }
    normalized[key as HealthNutritionDetailKey] = rawValue;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function parseHealthNutritionDetailsInput(input: Partial<Record<HealthNutritionDetailKey, string | number | null | undefined>>): HealthNutritionDetails | null {
  const values: Partial<Record<HealthNutritionDetailKey, number | null>> = {};
  for (const field of HEALTH_NUTRITION_FIELD_REGISTRY) {
    const rawValue = input[field.key];
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      continue;
    }
    const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (Number.isFinite(parsed) && parsed >= 0) {
      values[field.key] = parsed;
    }
  }
  return normalizeHealthNutritionDetails(values);
}

export function scaleHealthNutritionDetails(details: HealthNutritionDetails | null | undefined, servingFraction: number) {
  const normalized = normalizeHealthNutritionDetails(details);
  if (!normalized || !Number.isFinite(servingFraction)) {
    return null;
  }
  const scaled: HealthNutritionDetails = {};
  for (const field of HEALTH_NUTRITION_FIELD_REGISTRY) {
    const value = normalized[field.key];
    if (typeof value === "number") {
      scaled[field.key] = value * servingFraction;
    }
  }
  return normalizeHealthNutritionDetails(scaled);
}

export function aggregateHealthNutritionDetails(
  items: Array<{ nutritionDetails?: HealthNutritionDetails | null; quantity?: number }>,
): HealthNutritionAggregation {
  const totals: Partial<Record<HealthNutritionDetailKey, number>> = {};
  const knownEntries: Partial<Record<HealthNutritionDetailKey, number>> = {};
  const totalEntries = items.length;

  for (const item of items) {
    const details = normalizeHealthNutritionDetails(item.nutritionDetails);
    const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 1;
    for (const field of HEALTH_NUTRITION_FIELD_REGISTRY) {
      const value = details?.[field.key];
      if (typeof value !== "number") {
        continue;
      }
      totals[field.key] = (totals[field.key] ?? 0) + value * quantity;
      knownEntries[field.key] = (knownEntries[field.key] ?? 0) + 1;
    }
  }

  const nutritionDetails = normalizeHealthNutritionDetails(totals);
  const coverage: HealthNutritionCoverage = {};
  for (const field of HEALTH_NUTRITION_FIELD_REGISTRY) {
    const known = knownEntries[field.key] ?? 0;
    if (known === 0 || totals[field.key] === undefined) {
      continue;
    }
    coverage[field.key] = {
      value: totals[field.key] as number,
      knownEntries: known,
      totalEntries,
      complete: known === totalEntries,
    };
  }
  return { nutritionDetails, coverage };
}

export type HealthNutritionPerServing = {
  calories: number;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  nutrition_details?: HealthNutritionDetails | null;
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
    nutrition_details?: HealthNutritionDetails | null;
  };
};

export type HealthFoodMeasurementOption = {
  value: string;
  label: string;
};

type MeasurementDimension = HealthFoodNutritionCalculation["basis"]["dimension"];
type NutritionBasis = "serving" | "100g";

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
  if (!normalizedServingUnit) throw new Error("Serving unit is required.");
  if (!normalizedConsumedUnit) throw new Error("Consumed unit is required.");

  const hasMeasureValue = servingMeasureValue !== null && servingMeasureValue !== undefined;
  const hasMeasureUnit = servingMeasureUnit !== null && servingMeasureUnit !== undefined && Boolean(normalizeNutritionUnit(servingMeasureUnit));
  if (hasMeasureValue !== hasMeasureUnit) throw new Error("Serving measure value and unit must be provided together.");
  if (hasMeasureValue) assertPositiveFinite(servingMeasureValue, "Serving measure value");

  const measureUnit = hasMeasureUnit ? normalizeNutritionUnit(servingMeasureUnit) : null;
  const measureDimension = measureUnit ? getMeasurementDimension(measureUnit) : null;
  const servingDimension = getMeasurementDimension(normalizedServingUnit);
  const consumedDimension = getMeasurementDimension(normalizedConsumedUnit);
  if (measureUnit && measureDimension === "count") throw new Error("Serving measure unit must be g, oz, ml, or fl oz.");

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
  const scaledNutritionDetails = scaleHealthNutritionDetails(nutritionPerServing.nutrition_details, servingFraction);
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
      ...(scaledNutritionDetails ? { nutrition_details: scaledNutritionDetails } : {}),
    },
  };
}

export function getHealthFoodMeasurementOptions({ servingUnit, servingMeasureUnit }: { servingUnit?: string | null; servingMeasureUnit?: HealthServingMeasureUnit | null }): HealthFoodMeasurementOption[] {
  const options: HealthFoodMeasurementOption[] = [{ value: "serving", label: "servings" }];
  const normalizedServingUnit = normalizeNutritionUnit(servingUnit);
  if (normalizedServingUnit && normalizedServingUnit !== "serving" && getMeasurementDimension(normalizedServingUnit) === "count") {
    options.push({ value: servingUnit?.trim() ?? normalizedServingUnit, label: servingUnit?.trim() ?? normalizedServingUnit });
  }
  const normalizedMeasureUnit = normalizeNutritionUnit(servingMeasureUnit);
  const equivalentUnits = normalizedMeasureUnit === "g" || normalizedMeasureUnit === "oz" ? ["g", "oz"] : normalizedMeasureUnit === "ml" || normalizedMeasureUnit === "fl_oz" ? ["ml", "fl_oz"] : [];
  equivalentUnits.forEach((unit) => options.push({ value: unit, label: formatNutritionUnitLabel(unit) }));
  return options;
}

export type HealthFoodLookupProvider = "open_food_facts";

export type HealthFoodLookupResult = {
  attribution: string;
  barcode: string | null;
  brandName: string | null;
  calories: number | null;
  carbs: number | null;
  foodCategory?: string | null;
  fat: number | null;
  foodName: string;
  nutritionBasis: NutritionBasis;
  nutritionDetails: HealthNutritionDetails | null;
  protein: number | null;
  provider: HealthFoodLookupProvider;
  providerItemId: string;
  servingLabel: string | null;
  servingMeasureUnit: HealthServingMeasureUnit | null;
  servingMeasureValue: number | null;
  servingQuantity: number;
  servingUnit: string;
};

type OpenFoodFactsNutriments = Record<string, number | string | undefined>;

type OpenFoodFactsProduct = {
  _id?: string;
  brands?: string;
  categories?: string;
  code?: string;
  generic_name?: string;
  nutriments?: OpenFoodFactsNutriments;
  product_name?: string;
  product_quantity?: string;
  quantity?: string;
  serving_quantity?: string | number;
  serving_size?: string;
};

type OpenFoodFactsBarcodeResponse = { product?: OpenFoodFactsProduct; status?: number };
const OPEN_FOOD_FACTS_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
const OPEN_FOOD_FACTS_ATTRIBUTION = "Open Food Facts";

const OPEN_FOOD_FACTS_PRIMARY_FIELDS = [
  { key: "calories", providerKeys: ["energy-kcal"], unit: "kcal" },
  { key: "protein", providerKeys: ["proteins"], unit: "g" },
  { key: "carbs", providerKeys: ["carbohydrates"], unit: "g" },
  { key: "fat", providerKeys: ["fat"], unit: "g" },
] as const;

export async function lookupOpenFoodFactsByBarcode(barcode: string) {
  const normalizedBarcode = barcode.replace(/\D/g, "");
  if (normalizedBarcode.length < 8) throw new Error("Enter at least 8 digits for a barcode lookup.");
  const response = await fetch(`${OPEN_FOOD_FACTS_PRODUCT_URL}/${normalizedBarcode}.json`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Barcode lookup is unavailable right now.");
  const payload = (await response.json()) as OpenFoodFactsBarcodeResponse;
  if (payload.status !== 1 || !payload.product) return null;
  return normalizeOpenFoodFactsProduct(payload.product);
}

export function normalizeOpenFoodFactsProduct(product: OpenFoodFactsProduct): HealthFoodLookupResult | null {
  const foodName = firstNonEmpty(product.product_name, product.generic_name);
  const providerItemId = firstNonEmpty(product._id, product.code);
  if (!foodName || !providerItemId) return null;

  const nutriments = product.nutriments ?? {};
  const servingLabel = firstNonEmpty(
    product.serving_size,
    typeof product.serving_quantity === "number" || typeof product.serving_quantity === "string" ? `${product.serving_quantity}` : null,
    product.product_quantity,
    product.quantity,
  );
  const servingMassGrams = parseServingMassGrams(servingLabel) ?? parseServingMassGrams(typeof product.serving_quantity === "string" ? product.serving_quantity : null);
  const hasServingValue = [...OPEN_FOOD_FACTS_PRIMARY_FIELDS, ...HEALTH_NUTRITION_FIELD_REGISTRY].some((field) => field.providerKeys.some((key) => numberOrNull(nutriments[`${key}_serving`]) !== null));
  const nutritionBasis: NutritionBasis = hasServingValue || servingMassGrams !== null ? "serving" : "100g";

  const valueForBasis = (providerKeys: readonly string[]) => {
    const servingValue = providerKeys.map((key) => numberOrNull(nutriments[`${key}_serving`])).find((value): value is number => value !== null);
    if (nutritionBasis === "100g") {
      return providerKeys.map((key) => numberOrNull(nutriments[`${key}_100g`])).find((value): value is number => value !== null) ?? null;
    }
    if (servingValue !== undefined) return servingValue;
    const per100g = providerKeys.map((key) => numberOrNull(nutriments[`${key}_100g`])).find((value): value is number => value !== null);
    return per100g !== undefined && servingMassGrams !== null ? per100g * servingMassGrams / 100 : null;
  };

  const caloriesValue = valueForBasis(OPEN_FOOD_FACTS_PRIMARY_FIELDS[0].providerKeys);
  const primaryValue = (providerKeys: readonly string[]) => clampNutritionValue(valueForBasis(providerKeys));
  const details: HealthNutritionDetails = {};
  for (const field of HEALTH_NUTRITION_FIELD_REGISTRY) {
    const value = valueForBasis(field.providerKeys);
    const providerUnit = field.providerKeys
      .map((key) => normalizeProviderUnit(nutriments[`${key}_unit`]))
      .find((unit): unit is HealthNutritionUnit => unit !== null)
      ?? field.unit;
    if (value !== null) {
      const converted = convertHealthNutritionValue(value, providerUnit, field.unit);
      if (converted !== null) details[field.key] = clampNutritionValue(converted);
    }
  }

  const resolvedServing = nutritionBasis === "100g"
    ? { servingQuantity: 100, servingUnit: "g", servingMeasureValue: null, servingMeasureUnit: null as HealthServingMeasureUnit | null, servingLabel: "100 g" }
    : { servingQuantity: 1, servingUnit: "serving", servingMeasureValue: servingMassGrams, servingMeasureUnit: servingMassGrams === null ? null : "g" as const, servingLabel };

  return {
    attribution: OPEN_FOOD_FACTS_ATTRIBUTION,
    barcode: firstNonEmpty(product.code) ?? null,
    brandName: firstNonEmpty(product.brands) ?? null,
    calories: caloriesValue === null ? null : Math.max(0, Math.round(caloriesValue)),
    carbs: primaryValue(OPEN_FOOD_FACTS_PRIMARY_FIELDS[2].providerKeys),
    foodCategory: firstNonEmpty(product.categories)?.split(",")[0]?.trim() || null,
    fat: primaryValue(OPEN_FOOD_FACTS_PRIMARY_FIELDS[3].providerKeys),
    foodName,
    nutritionBasis,
    nutritionDetails: normalizeHealthNutritionDetails(details),
    protein: primaryValue(OPEN_FOOD_FACTS_PRIMARY_FIELDS[1].providerKeys),
    provider: "open_food_facts",
    providerItemId,
    servingLabel: resolvedServing.servingLabel,
    servingMeasureUnit: resolvedServing.servingMeasureUnit,
    servingMeasureValue: resolvedServing.servingMeasureValue,
    servingQuantity: resolvedServing.servingQuantity,
    servingUnit: resolvedServing.servingUnit,
  };
}

function parseServingMassGrams(value: string | null | undefined) {
  const match = /(?:\(|\b)(\d+(?:\.\d+)?)\s*(kg|g)\b/i.exec(value ?? "");
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? (match[2]?.toLowerCase() === "kg" ? amount * 1000 : amount) : null;
}

function normalizeProviderUnit(value: unknown): HealthNutritionUnit | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[μµ]/, "u");
  if (normalized === "g") return "g";
  if (normalized === "mg") return "mg";
  if (normalized === "mcg" || normalized === "ug") return "mcg";
  return null;
}

function assertPositiveFinite(value: number | null | undefined, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
}

function normalizeNutritionUnit(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, "_") ?? "";
  switch (normalized) {
    case "servings": return "serving";
    case "milliliter":
    case "milliliters":
    case "millilitre":
    case "millilitres": return "ml";
    case "fluid_ounce":
    case "fluid_ounces":
    case "fl_ounce":
    case "fl_ounces": return "fl_oz";
    default: return normalized;
  }
}

function formatNutritionUnitLabel(unit: string) {
  if (unit === "ml") return "mL";
  if (unit === "fl_oz") return "fl oz";
  return unit;
}

function getMeasurementDimension(unit: string): MeasurementDimension {
  if (unit === "serving") return "servings";
  if (unit === "g" || unit === "oz") return "mass";
  if (unit === "ml" || unit === "fl_oz") return "volume";
  return "count";
}

function unitsMatch(left: string, right: string) { return left === right; }

function convertToBaseUnit(quantity: number, unit: string) {
  if (unit === "oz") return quantity * GRAMS_PER_OUNCE;
  if (unit === "fl_oz") return quantity * MILLILITERS_PER_FLUID_OUNCE;
  return quantity;
}

function scaleNutritionValue(value: number, servingFraction: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value * servingFraction;
}

function scaleNullableNutritionValue(value: number | null | undefined, servingFraction: number, label: string) {
  return value === null || value === undefined ? null : scaleNutritionValue(value, servingFraction, label);
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function numberOrNull(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampNutritionValue(value: number | null) {
  return value === null || !Number.isFinite(value) ? null : Math.max(0, Number(value.toFixed(4)));
}

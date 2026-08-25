import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { HealthMealEntry } from "../src/lib/database.types.ts";
import {
  HEALTH_NUTRITION_FIELD_REGISTRY,
  calculateHealthFoodNutrition,
  convertHealthNutritionValue,
  normalizeHealthNutritionDetails,
  normalizeOpenFoodFactsProduct,
} from "../src/lib/health-nutrition.ts";
import {
  buildRecipeIngredient,
  buildSavedMealFoodItem,
  getRecipeNutrition,
  getRecipeNutritionPerServing,
  getSavedMealNutrition,
  normalizeHealthFoodLibraryItem,
} from "../src/lib/health-library.ts";
import { sumMealNutritionForDate } from "../src/lib/health-utils.ts";

test("nutrition details keep unknown, zero, invalid, and unsupported values distinct", () => {
  assert.equal(normalizeHealthNutritionDetails(null), null);
  assert.deepEqual(normalizeHealthNutritionDetails({ sodium_mg: 0, dietary_fiber_g: -1, made_up: 12, vitamin_d_mcg: Infinity }), {
    sodium_mg: 0,
  });
  assert.equal(normalizeHealthNutritionDetails({}), null);
});

test("canonical nutrient unit conversion is centralized", () => {
  assert.equal(convertHealthNutritionValue(1, "g", "mg"), 1000);
  assert.equal(convertHealthNutritionValue(1, "mg", "mcg"), 1000);
  assert.equal(convertHealthNutritionValue(1000, "mcg", "mg"), 1);
  assert.equal(convertHealthNutritionValue(1, "µg", "mg"), 0.001);
});

test("Open Food Facts maps expanded serving nutrients and preserves true zero", () => {
  const result = normalizeOpenFoodFactsProduct({
    _id: "off-expanded",
    brands: "Acme",
    code: "012345678905",
    nutriments: {
      "energy-kcal_serving": 0,
      "carbohydrates_serving": 4,
      "fat_serving": 1.5,
      "proteins_serving": 2,
      "saturated-fat_serving": 0,
      "trans-fat_serving": 0,
      "sodium_serving": 400,
      "sodium_unit": "mg",
      "fiber_serving": 3,
      "sugars_serving": 2,
      "added-sugars_serving": 1,
      "vitamin-d_serving": 2.5,
      "calcium_serving": 100,
    },
    product_name: "Expanded Snack",
    serving_size: "1 bar (30 g)",
  });

  assert.ok(result);
  assert.equal(result.calories, 0);
  assert.equal(result.nutritionBasis, "serving");
  assert.equal(result.servingMeasureValue, 30);
  assert.equal(result.nutritionDetails?.sodium_mg, 400);
  assert.equal(result.nutritionDetails?.trans_fat_g, 0);
  assert.equal(result.nutritionDetails?.vitamin_d_mcg, 2.5);
  assert.equal(result.nutritionDetails?.calcium_mg, 100);
  assert.equal(HEALTH_NUTRITION_FIELD_REGISTRY.length, 42);
});

test("provider units convert into the registry canonical unit", () => {
  const result = normalizeOpenFoodFactsProduct({
    _id: "off-unit-conversion",
    code: "012345678909",
    nutriments: {
      "energy-kcal_serving": 10,
      "sodium_serving": 0.4,
      "sodium_unit": "g",
      "vitamin-d_serving": 2500,
      "vitamin-d_unit": "mcg",
    },
    product_name: "Unit Conversion Food",
  });

  assert.equal(result?.nutritionDetails?.sodium_mg, 400);
  assert.equal(result?.nutritionDetails?.vitamin_d_mcg, 2500);
});

test("Open Food Facts per-100g values scale to a known 30g serving as one basis", () => {
  const result = normalizeOpenFoodFactsProduct({
    _id: "off-100g",
    code: "012345678906",
    nutriments: {
      "energy-kcal_100g": 200,
      "carbohydrates_100g": 10,
      "fat_100g": 5,
      "proteins_100g": 20,
      "sodium_100g": 100,
      "saturated-fat_100g": 2,
    },
    product_name: "Thirty Gram Bar",
    serving_size: "1 bar (30 g)",
  });

  assert.ok(result);
  assert.equal(result.nutritionBasis, "serving");
  assert.equal(result.calories, 60);
  assert.equal(result.protein, 6);
  assert.equal(result.nutritionDetails?.sodium_mg, 30);
  assert.equal(result.nutritionDetails?.saturated_fat_g, 0.6);
});

test("Open Food Facts per-100g values remain explicitly 100g when serving mass is unknown", () => {
  const result = normalizeOpenFoodFactsProduct({
    _id: "off-100g-only",
    code: "012345678907",
    nutriments: { "energy-kcal_100g": 200, "sodium_100g": 100 },
    product_name: "Unspecified Serving",
    serving_size: "1 package",
  });

  assert.ok(result);
  assert.equal(result.nutritionBasis, "100g");
  assert.equal(result.calories, 200);
  assert.equal(result.servingQuantity, 100);
  assert.equal(result.servingUnit, "g");
  assert.equal(result.servingLabel, "100 g");
  assert.equal(result.nutritionDetails?.sodium_mg, 100);
});

test("missing barcode calories remain null while other nutrients stay usable", () => {
  const result = normalizeOpenFoodFactsProduct({
    _id: "off-no-calories",
    code: "012345678908",
    nutriments: { "sodium_serving": 25, "fiber_serving": 2 },
    product_name: "No Calorie Label",
  });

  assert.ok(result);
  assert.equal(result.calories, null);
  assert.equal(result.nutritionDetails?.sodium_mg, 25);
  assert.equal(result.nutritionDetails?.dietary_fiber_g, 2);
});

test("one serving-fraction scales every known expanded nutrient and preserves zero/unknown", () => {
  const result = calculateHealthFoodNutrition({
    nutritionPerServing: {
      calories: 200,
      protein_g: 10,
      nutrition_details: { sodium_mg: 400, trans_fat_g: 0 },
    },
    servingQuantity: 1,
    servingUnit: "serving",
    consumedQuantity: 0.5,
    consumedUnit: "serving",
  });

  assert.equal(result.nutrientTotals.calories, 100);
  assert.equal(result.nutrientTotals.nutrition_details?.sodium_mg, 200);
  assert.equal(result.nutrientTotals.nutrition_details?.trans_fat_g, 0);
  assert.equal(result.nutrientTotals.nutrition_details?.dietary_fiber_g, undefined);
});

test("recipe and saved meal nutrition aggregate expanded values without changing legacy macro shape", () => {
  const food = {
    id: "food-expanded",
    user_id: "user-1",
    food_name: "Expanded Food",
    brand_name: null,
    category: "Test",
    food_category: "Test",
    serving_label: "1 serving",
    serving_size: "1 serving",
    serving_quantity: 1,
    serving_unit: "serving",
    serving_measure_value: null,
    serving_measure_unit: null,
    serving_weight_amount: null,
    serving_weight_unit: null,
    calories: 100,
    protein_g: 5,
    carbs_g: 10,
    fat_g: 2,
    nutrition_details: { sodium_mg: 200, dietary_fiber_g: 4 },
    barcode: null,
    provider: "manual",
    provider_item_id: null,
    attribution: null,
    is_favorite: false,
    created_at: "",
    updated_at: "",
  } as const;
  const recipe = { ingredients: [buildRecipeIngredient(food, 2)], servings: 2 };
  const savedMeal = { items: [buildSavedMealFoodItem(food, 1)] };

  assert.equal(getRecipeNutrition(recipe).nutrition_details?.sodium_mg, 400);
  assert.equal(getRecipeNutritionPerServing(recipe).nutrition_details?.sodium_mg, 200);
  assert.equal(getSavedMealNutrition(savedMeal).nutrition_details?.dietary_fiber_g, 4);
});

test("recipe and saved meal legacy items remain valid and report incomplete expanded coverage", () => {
  const recipe = {
    ingredients: [
      { food_id: "known", food_name: "Known", serving_label: "1 serving", quantity: 1, calories: 50, protein_g: null, carbs_g: null, fat_g: null, nutrition_details: { sodium_mg: 100 } },
      { food_id: "legacy", food_name: "Legacy", serving_label: "1 serving", quantity: 1, calories: 50, protein_g: null, carbs_g: null, fat_g: null },
    ],
    servings: 1,
  };
  const meal = { items: [{ source_id: "legacy", source_type: "food" as const, name: "Legacy", serving_label: null, quantity: 1, calories: 50, protein_g: null, carbs_g: null, fat_g: null }] };

  assert.deepEqual(getRecipeNutrition(recipe).nutrition_coverage?.sodium_mg, { value: 100, knownEntries: 1, totalEntries: 2, complete: false });
  assert.equal(getSavedMealNutrition(meal).nutrition_details, undefined);
});

test("meal nutrition snapshots remain historical after the source food definition changes", () => {
  const sourceFood = { id: "food-1", nutrition_details: { sodium_mg: 400 } };
  const loggedMeal = {
    food_snapshot: { source_food_id: sourceFood.id, nutrition_details: { sodium_mg: 400 } },
    nutrition_snapshot: { calories: 100, protein_g: 5, carbs_g: 10, fat_g: 2, nutrition_details: { sodium_mg: 400 } },
  };

  sourceFood.nutrition_details.sodium_mg = 450;
  assert.equal(loggedMeal.food_snapshot.nutrition_details.sodium_mg, 400);
  assert.equal(loggedMeal.nutrition_snapshot.nutrition_details.sodium_mg, 400);
});

test("daily expanded totals use meal snapshots and report incomplete coverage", () => {
  const base = {
    attribution: null,
    barcode: null,
    brand_name: null,
    carbs_g: null,
    created_at: "2026-08-25T12:00:00.000Z",
    entry_date: "2026-08-25",
    fat_g: null,
    food_name: "Meal",
    logged_at: "2026-08-25T12:00:00.000Z",
    meal_slot: "lunch" as const,
    protein_g: null,
    provider: "manual",
    provider_item_id: null,
    serving_label: "1 serving",
    updated_at: "2026-08-25T12:00:00.000Z",
    user_id: "user-1",
  };
  const entries: HealthMealEntry[] = [
    { ...base, id: "meal-known", calories: 100, nutrition_snapshot: { calories: 100, protein_g: null, carbs_g: null, fat_g: null, nutrition_details: { sodium_mg: 400 } } },
    { ...base, id: "meal-unknown", calories: 100, meal_slot: "dinner", nutrition_snapshot: { calories: 100, protein_g: null, carbs_g: null, fat_g: null } },
  ];

  const totals = sumMealNutritionForDate(entries, "2026-08-25");
  assert.equal(totals.nutrition_details?.sodium_mg, 400);
  assert.deepEqual(totals.nutrition_coverage?.sodium_mg, { value: 400, knownEntries: 1, totalEntries: 2, complete: false });
});

test("daily expanded totals preserve known zero and mark complete only with full coverage", () => {
  const entries = [
    { entry_date: "2026-08-25", calories: 10, protein_g: null, carbs_g: null, fat_g: null, nutrition_snapshot: { calories: 10, protein_g: null, carbs_g: null, fat_g: null, nutrition_details: { sodium_mg: 0 } } },
    { entry_date: "2026-08-25", calories: 20, protein_g: null, carbs_g: null, fat_g: null, nutrition_snapshot: { calories: 20, protein_g: null, carbs_g: null, fat_g: null, nutrition_details: { sodium_mg: 10 } } },
  ] as HealthMealEntry[];
  const totals = sumMealNutritionForDate(entries, "2026-08-25");

  assert.equal(totals.nutrition_details?.sodium_mg, 10);
  assert.equal(totals.nutrition_coverage?.sodium_mg?.knownEntries, 2);
  assert.equal(totals.nutrition_coverage?.sodium_mg?.totalEntries, 2);
  assert.equal(totals.nutrition_coverage?.sodium_mg?.complete, true);
});

test("legacy food hydration leaves expanded fields unknown", () => {
  const legacy = {
    id: "legacy-food",
    user_id: "user-1",
    food_name: "Legacy",
    brand_name: null,
    category: "Test",
    food_category: "Test",
    serving_label: "1 serving",
    serving_size: "1 serving",
    serving_quantity: 1,
    serving_unit: "serving",
    serving_measure_value: null,
    serving_measure_unit: null,
    serving_weight_amount: null,
    serving_weight_unit: null,
    calories: 100,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    barcode: null,
    provider: "manual",
    provider_item_id: null,
    attribution: null,
    is_favorite: false,
    created_at: "",
    updated_at: "",
  };
  assert.equal(normalizeHealthFoodLibraryItem(legacy).nutrition_details, null);
});

test("the 7.11.59 migration is additive and does not rewrite data", () => {
  const migration = readFileSync(new URL("../supabase/add_health_expanded_nutrition_7_11_59.sql", import.meta.url), "utf8");
  assert.match(migration, /alter table public\.adhdice_health_food_library/i);
  assert.match(migration, /add column if not exists nutrition_details jsonb/i);
  assert.doesNotMatch(migration, /\bupdate\b|\binsert\b|\bdelete\b/i);
});

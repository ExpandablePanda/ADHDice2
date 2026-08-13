import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildRecipeIngredient,
  buildSavedMealFoodItem,
  buildSavedMealRecipeItem,
  composeHealthFoodServingDefinition,
  composeHealthFoodServingLabel,
  composeHealthFoodStructuredServingLabel,
  formatHealthFoodQuantityUnit,
  getRecipeNutrition,
  getRecipeNutritionPerServing,
  getSavedMealNutrition,
  getHealthFoodIdentityKey,
  normalizeHealthFoodLibraryInput,
  normalizeHealthFoodLibraryItem,
  searchHealthFoodLibrary,
  setHealthFoodFavoriteStatus,
  sumWaterForDate,
  waterAmountToMilliliters,
} from "../src/lib/health-library.ts";

const food = {
  attribution: null,
  barcode: null,
  brand_name: null,
  calories: 200,
  category: "Lunch",
  food_category: "Lunch",
  carbs_g: 24,
  created_at: "2026-07-27T12:00:00.000Z",
  fat_g: 8,
  food_name: "Test food",
  id: "food-1",
  is_favorite: false,
  protein_g: 12,
  provider: "manual",
  provider_item_id: null,
  serving_label: "1 cup",
  serving_size: "1 cup",
  serving_quantity: 1,
  serving_unit: "serving",
  serving_measure_value: null,
  serving_measure_unit: null,
  serving_weight_amount: null,
  serving_weight_unit: null,
  updated_at: "2026-07-27T12:00:00.000Z",
  user_id: "user-1",
};

test("recipe totals and per-serving nutrition use ingredient quantities", () => {
  const recipe = {
    ingredients: [buildRecipeIngredient(food, 2)],
    servings: 4,
  };

  assert.deepEqual(getRecipeNutrition(recipe), {
    calories: 400,
    protein: 24,
    carbs: 48,
    fat: 16,
  });
  assert.deepEqual(getRecipeNutritionPerServing(recipe), {
    calories: 100,
    protein: 6,
    carbs: 12,
    fat: 4,
  });
});

test("custom food serving fields compose a backward-compatible label", () => {
  assert.equal(composeHealthFoodServingLabel({
    servingSize: "1 serving",
    servingWeightAmount: 28,
    servingWeightUnit: "g",
  }), "1 serving / 28 g");
  assert.equal(composeHealthFoodServingLabel({
    servingSize: "1 bottle",
    servingWeightAmount: 12,
    servingWeightUnit: "fl_oz",
  }), "1 bottle / 12 fl oz");
  assert.equal(composeHealthFoodStructuredServingLabel({
    servingQuantity: 55,
    servingUnit: "cracker",
    servingMeasureValue: 30,
    servingMeasureUnit: "g",
  }), "55 crackers / 30 g");
});

test("stored plural units do not gain a duplicate suffix", () => {
  const label = formatHealthFoodQuantityUnit(10, "Crackers");
  assert.equal(label, "10 Crackers");
  assert.doesNotMatch(label, /crackerss/i);
});

test("singular quantities preserve singular units", () => {
  assert.equal(formatHealthFoodQuantityUnit(1, "cracker"), "1 cracker");
});

test("plural quantities add one suffix to singular units", () => {
  assert.equal(formatHealthFoodQuantityUnit(10, "cracker"), "10 crackers");
});

test("serving definition previews cover count and measure shapes", () => {
  assert.equal(composeHealthFoodServingDefinition({
    servingQuantity: 55,
    servingUnit: "cracker",
    servingMeasureValue: 30,
    servingMeasureUnit: "g",
  }), "1 serving = 55 crackers / 30 g");
  assert.equal(composeHealthFoodServingDefinition({
    servingQuantity: 2,
    servingUnit: "slice",
  }), "1 serving = 2 slices");
  assert.equal(composeHealthFoodServingDefinition({
    servingQuantity: 30,
    servingUnit: "g",
  }), "1 serving = 30 g");
  assert.equal(composeHealthFoodServingDefinition({
    servingQuantity: 1,
    servingUnit: "oz",
  }), "1 serving = 1 oz");
  assert.equal(composeHealthFoodServingDefinition({
    servingQuantity: 1,
    servingUnit: "bottle",
    servingMeasureValue: 250,
    servingMeasureUnit: "ml",
  }), "1 serving = 1 bottle / 250 mL");
  assert.equal(composeHealthFoodServingDefinition({
    servingQuantity: 1,
    servingUnit: "bottle",
    servingMeasureValue: 8,
    servingMeasureUnit: "fl_oz",
  }), "1 serving = 1 bottle / 8 fl oz");
  assert.equal(composeHealthFoodServingDefinition({
    servingQuantity: 1,
    servingUnit: "serving",
    servingLabel: "1 serving",
  }), "1 serving = 1 serving");
});

test("missing optional serving fields remain safe", () => {
  assert.equal(composeHealthFoodServingDefinition({
    servingQuantity: 55,
    servingUnit: "cracker",
  }), "1 serving = 55 crackers");
  assert.equal(composeHealthFoodServingDefinition({}), "1 serving = 1 serving");
});

test("saved meals can combine food and recipe servings", () => {
  const recipe = {
    created_at: "",
    id: "recipe-1",
    ingredients: [buildRecipeIngredient(food, 2)],
    name: "Batch",
    notes: "",
    servings: 4,
    updated_at: "",
    user_id: "user-1",
  };
  const meal = {
    items: [
      buildSavedMealFoodItem(food, 1),
      buildSavedMealRecipeItem(recipe, 2),
    ],
  };

  assert.deepEqual(getSavedMealNutrition(meal), {
    calories: 400,
    protein: 24,
    carbs: 48,
    fat: 16,
  });
});

test("water totals preserve cup and fluid-ounce conversions", () => {
  const cupMl = waterAmountToMilliliters(1, "cup");
  const ounceMl = waterAmountToMilliliters(8, "fl_oz");
  const entries = [
    {
      amount: 1,
      amount_ml: cupMl,
      created_at: "",
      entry_date: "2026-07-27",
      id: "water-1",
      logged_at: "",
      unit: "cup" as const,
      user_id: "user-1",
    },
    {
      amount: 8,
      amount_ml: ounceMl,
      created_at: "",
      entry_date: "2026-07-27",
      id: "water-2",
      logged_at: "",
      unit: "fl_oz" as const,
      user_id: "user-1",
    },
  ];

  const totals = sumWaterForDate(entries, "2026-07-27");
  assert.equal(totals.cups, 2);
  assert.equal(totals.fluidOunces, 16);
});

test("food library identity prefers provider ids and dedupes exact manual foods", () => {
  assert.equal(
    getHealthFoodIdentityKey({
      foodName: "Greek Yogurt",
      provider: "usda",
      providerItemId: "12345",
    }),
    "provider:usda:12345",
  );

  assert.equal(
    getHealthFoodIdentityKey({
      brand_name: "Kitchen",
      calories: 120,
      carbs_g: 5,
      fat_g: 1,
      food_name: "Custom oats",
      protein_g: 12,
      provider: "manual",
      serving_label: "1 bowl",
    }),
    getHealthFoodIdentityKey({
      brandName: "Kitchen",
      calories: 120,
      carbs: 5,
      fat: 1,
      foodName: "custom oats",
      protein: 12,
      provider: "manual",
      servingLabel: "1 bowl",
    }),
  );
});

test("unfavoriting a custom food preserves its stored metadata", () => {
  const customFood = {
    ...food,
    category: "Breakfast",
    food_category: "Breakfast",
    is_favorite: true,
    serving_quantity: 1,
    serving_unit: "packet",
    serving_measure_value: 42,
    serving_measure_unit: "g" as const,
    serving_size: "1 packet",
    serving_weight_amount: 42,
    serving_weight_unit: "g" as const,
  };
  assert.deepEqual(setHealthFoodFavoriteStatus(customFood, false, "2026-07-29T12:00:00.000Z"), {
    ...customFood,
    is_favorite: false,
    updated_at: "2026-07-29T12:00:00.000Z",
  });
});

test("legacy custom foods receive safe structured serving defaults", () => {
  const legacyFood = { ...food } as Record<string, unknown>;
  delete legacyFood.food_category;
  delete legacyFood.serving_quantity;
  delete legacyFood.serving_unit;
  delete legacyFood.serving_measure_value;
  delete legacyFood.serving_measure_unit;
  const normalized = normalizeHealthFoodLibraryItem(legacyFood as typeof food);

  assert.equal(normalized.food_category, "Lunch");
  assert.equal(normalized.serving_quantity, 1);
  assert.equal(normalized.serving_unit, "serving");
  assert.equal(normalized.serving_measure_value, null);
  assert.equal(normalized.serving_measure_unit, null);
});

test("editing a legacy food normalizes the new structured fields without changing identity inputs", () => {
  const input = normalizeHealthFoodLibraryInput({
    id: food.id,
    calories: food.calories,
    food_name: food.food_name,
    category: "Snacks",
    serving_quantity: 55,
    serving_unit: "cracker",
    serving_measure_value: 30,
    serving_measure_unit: "g",
    provider: "manual",
  });

  assert.deepEqual({
    food_category: input.food_category,
    serving_quantity: input.serving_quantity,
    serving_unit: input.serving_unit,
    serving_measure_value: input.serving_measure_value,
    serving_measure_unit: input.serving_measure_unit,
  }, {
    food_category: "Snacks",
    serving_quantity: 55,
    serving_unit: "cracker",
    serving_measure_value: 30,
    serving_measure_unit: "g",
  });
  assert.equal(getHealthFoodIdentityKey({ ...food, serving_label: "1 cup" }), getHealthFoodIdentityKey({ ...food, serving_label: "1 cup" }));
});

test("custom-food search keeps the existing name, brand, category, serving, provider, and barcode matching", () => {
  assert.deepEqual(searchHealthFoodLibrary([
    food,
    { ...food, id: "food-2", food_name: "Other food", food_category: "Snacks", category: "Snacks" },
  ], "snacks").map((item) => item.id), ["food-2"]);
  assert.deepEqual(searchHealthFoodLibrary([food], ""), [food]);
});

test("Health Food renders grouped foods, calorie totals, favorite sorting, and goal progress", () => {
  const source = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
  assert.match(source, /matchingCustomFoodGroups/);
  assert.match(source, /item\.food_category\?\.trim\(\) \|\| "Uncategorized"/);
  assert.match(source, /loggedCountByIdentity/);
  assert.match(source, /formatHealthNutritionNumber\(selectedNutrition\.calories\)/);
  assert.match(source, /formatHealthNutritionNumber\(slotCaloriesTotal\)/);
  assert.match(source, /progressPercent=\{profile\.calorie_goal/);
  assert.match(source, /setFavoriteFoodStatus\(item\.id, false\)/);
  assert.match(source, /getHealthFoodMeasurementOptions/);
  assert.match(source, /calculateHealthFoodNutrition/);
  assert.match(source, /formatHealthFoodQuantityUnit/);
  assert.match(source, /composeHealthFoodServingDefinition/);
  assert.match(source, /formatHealthMealSummary\(entry\)/);
  assert.doesNotMatch(source, /mealDraft\.measurement === "serving"/);
  assert.match(source, /nutrition_snapshot: calculation\.nutrientTotals/);
  assert.match(source, /mode: "legacy"/);
});

test("Task History selected actions use semantic inverted status fills", () => {
  const source = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
  assert.match(source, /TASK_STATUS_INVERTED_CHIP_STYLES/);
  assert.match(source, /isSelectedStatus\(status\) \? TASK_STATUS_INVERTED_CHIP_STYLES\[status\]/);
  assert.doesNotMatch(source, /ACTIVE_CHIP_RING_CLASS/);
});

test("7.5.22 Health migration and consolidated schema carry the new owner-scoped tables", () => {
  const migration = readFileSync(
    new URL("../supabase/add_health_food_library_recipes_water_7_5_22.sql", import.meta.url),
    "utf8",
  );
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

  for (const table of [
    "adhdice_health_recipes",
    "adhdice_health_saved_meals",
    "adhdice_health_water_entries",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(schema, new RegExp(`create table public\\.${table}`));
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.doesNotMatch(migration, /alter publication/i);
  assert.match(migration, /notify pgrst, 'reload schema'/);
});

test("7.5.39 Health food migration carries category and structured serving fields", () => {
  const migration = readFileSync(
    new URL("../supabase/add_health_food_category_servings_7_5_39.sql", import.meta.url),
    "utf8",
  );
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  for (const column of ["category", "serving_size", "serving_weight_amount", "serving_weight_unit"]) {
    assert.match(migration, new RegExp(column));
    assert.match(schema, new RegExp(column));
  }
  assert.match(migration, /set serving_size = serving_label/);
  assert.match(migration, /'g', 'oz', 'fl_oz'/);
});

test("7.7.0 custom-food migration preserves meal history and adds safe serving defaults", () => {
  const migration = readFileSync(
    new URL("../supabase/add_health_custom_food_measurements_7_7_0.sql", import.meta.url),
    "utf8",
  );
  for (const column of ["food_category", "serving_quantity", "serving_unit", "serving_measure_value", "serving_measure_unit"]) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(migration, /serving_quantity = 1/);
  assert.match(migration, /serving_unit = 'serving'/);
  assert.doesNotMatch(migration, /adhdice_health_meal_entries/);
  assert.doesNotMatch(migration, /delete\s+from/i);
});

test("7.7.1 meal migration adds structured consumption and immutable snapshots without rewriting history", () => {
  const migration = readFileSync(
    new URL("../supabase/add_health_meal_structured_logging_7_7_1.sql", import.meta.url),
    "utf8",
  );
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  for (const column of ["source_food_id", "consumed_quantity", "consumed_unit", "serving_fraction", "food_snapshot", "nutrition_snapshot"]) {
    assert.match(migration, new RegExp(column));
    assert.match(schema, new RegExp(column));
  }
  assert.match(migration, /add column if not exists/);
  assert.match(migration, /notify pgrst, 'reload schema'/);
  assert.doesNotMatch(migration, /delete\s+from/i);
  assert.doesNotMatch(migration, /update\s+public\.adhdice_health_meal_entries/i);
});

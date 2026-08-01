import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildRecipeIngredient,
  buildSavedMealFoodItem,
  buildSavedMealRecipeItem,
  composeHealthFoodServingLabel,
  getRecipeNutrition,
  getRecipeNutritionPerServing,
  getSavedMealNutrition,
  getHealthFoodIdentityKey,
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
    is_favorite: true,
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

test("Health Food renders grouped foods, calorie totals, favorite sorting, and goal progress", () => {
  const source = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
  assert.match(source, /matchingCustomFoodGroups/);
  assert.match(source, /item\.category\?\.trim\(\) \|\| "Uncategorized"/);
  assert.match(source, /loggedCountByIdentity/);
  assert.match(source, /Math\.round\(selectedNutrition\.calories\)\} kcal/);
  assert.match(source, /Math\.round\(slotCaloriesTotal\)\} kcal/);
  assert.match(source, /progressPercent=\{profile\.calorie_goal/);
  assert.match(source, /setFavoriteFoodStatus\(item\.id, false\)/);
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

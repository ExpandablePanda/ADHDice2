import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { HealthFoodLibraryItem, HealthMealEntry } from "../src/lib/database.types.ts";
import {
  buildHealthFoodHistoryMealEntryUpdate,
  formatHealthFoodHistoryRepairResult,
  selectHealthFoodMealEntriesBySourceId,
} from "../src/lib/health-meal-recalculation.ts";

const food: HealthFoodLibraryItem = {
  attribution: null,
  barcode: null,
  brand_name: null,
  calories: 150,
  category: "Meat",
  carbs_g: 0,
  created_at: "2026-09-27T12:00:00.000Z",
  fat_g: 9,
  food_category: "Meat",
  food_name: "Whole Young Chicken",
  id: "food-chicken",
  is_favorite: true,
  nutrition_details: { sodium_mg: 100, vitamin_b12_mcg: 2 },
  protein_g: 18,
  provider: "manual",
  provider_item_id: null,
  serving_label: "1 serving / 84 g",
  serving_measure_unit: "g",
  serving_measure_value: 84,
  serving_quantity: 1,
  serving_size: "1 serving / 84 g",
  serving_unit: "serving",
  serving_weight_amount: 84,
  serving_weight_unit: "g",
  updated_at: "2026-09-27T12:00:00.000Z",
  user_id: "user-1",
};

function meal(overrides: Partial<HealthMealEntry> = {}): HealthMealEntry {
  return {
    attribution: null,
    barcode: null,
    brand_name: null,
    calories: 100,
    carbs_g: 0,
    created_at: "2026-09-01T12:00:00.000Z",
    entry_date: "2026-09-01",
    fat_g: 6,
    food_name: "Whole Young Chicken",
    id: "meal-1",
    logged_at: "2026-09-01T18:30:00.000Z",
    meal_slot: "dinner",
    nutrition_snapshot: { calories: 100, carbs_g: 0, fat_g: 6, protein_g: 12, nutrition_details: { sodium_mg: 66.6666666667 } },
    protein_g: 12,
    provider: "manual",
    provider_item_id: null,
    serving_label: "1 serving / 56 g",
    source_food_id: "food-chicken",
    consumed_quantity: 56,
    consumed_unit: "g",
    serving_fraction: 1,
    food_snapshot: {
      attribution: null,
      barcode: null,
      brand_name: null,
      calories: 100,
      carbs_g: 0,
      food_category: "Meat",
      food_name: "Whole Young Chicken",
      fat_g: 6,
      nutrition_details: { sodium_mg: 66.6666666667 },
      provider: "manual",
      provider_item_id: null,
      serving_label: "1 serving / 56 g",
      serving_measure_unit: "g",
      serving_measure_value: 56,
      serving_quantity: 1,
      serving_unit: "serving",
      source_food_id: "food-chicken",
      protein_g: 12,
    },
    updated_at: "2026-09-01T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

test("history selection is strictly source_food_id based, including same-name foods", () => {
  const selected = selectHealthFoodMealEntriesBySourceId([
    meal({ id: "linked" }),
    meal({ id: "same-name-unrelated", source_food_id: "other-food" }),
    meal({ id: "legacy-name-only", source_food_id: null }),
  ], food.id);

  assert.deepEqual(selected.map((entry) => entry.id), ["linked"]);
});

test("multiple historical entries update while identity, date, slot, time, and consumed amount remain unchanged", () => {
  const first = meal({ id: "meal-1", consumed_quantity: 316, consumed_unit: "g", serving_fraction: 5 });
  const second = meal({ id: "meal-2", entry_date: "2026-09-02", meal_slot: "lunch", logged_at: "2026-09-02T12:30:00.000Z", consumed_quantity: 84, consumed_unit: "g" });

  for (const entry of [first, second]) {
    const update = buildHealthFoodHistoryMealEntryUpdate(food, entry);
    const rewrittenEntry = { ...entry, ...update };
    assert.equal(update.calories, Math.round(150 * entry.consumed_quantity! / 84));
    assert.equal(update.protein_g, 18 * entry.consumed_quantity! / 84);
    assert.equal(update.fat_g, 9 * entry.consumed_quantity! / 84);
    assert.equal(update.serving_fraction, entry.consumed_quantity! / 84);
    assert.equal(update.food_snapshot?.source_food_id, food.id);
    assert.equal(update.nutrition_snapshot?.nutrition_details?.sodium_mg, 100 * entry.consumed_quantity! / 84);
    assert.equal(update.nutrition_snapshot?.nutrition_details?.vitamin_b12_mcg, 2 * entry.consumed_quantity! / 84);
    assert.equal(rewrittenEntry.id, entry.id);
    assert.equal(rewrittenEntry.entry_date, entry.entry_date);
    assert.equal(rewrittenEntry.meal_slot, entry.meal_slot);
    assert.equal(rewrittenEntry.logged_at, entry.logged_at);
    assert.equal(rewrittenEntry.consumed_quantity, entry.consumed_quantity);
    assert.equal(rewrittenEntry.consumed_unit, entry.consumed_unit);
  }
});

test("serving-definition changes recompute the fraction from actual consumed grams", () => {
  const entry = meal({ consumed_quantity: 316, consumed_unit: "g", serving_fraction: 316 / 56 });
  const update = buildHealthFoodHistoryMealEntryUpdate(food, entry);

  assert.equal(update.serving_fraction, 316 / 84);
  assert.equal(update.calories, Math.round(150 * 316 / 84));
  assert.equal(update.food_snapshot?.serving_measure_value, 84);
  assert.notEqual(update.serving_fraction, entry.serving_fraction);
});

test("nutrition-only corrections rescale macros and micronutrients without changing the serving fraction", () => {
  const correctedFood = { ...food, calories: 200, protein_g: 24, fat_g: 12, nutrition_details: { sodium_mg: 160 } };
  const entry = meal({ consumed_quantity: 2, consumed_unit: "serving", serving_fraction: 2 });
  const update = buildHealthFoodHistoryMealEntryUpdate(correctedFood, entry);

  assert.equal(update.serving_fraction, 2);
  assert.equal(update.calories, 400);
  assert.equal(update.protein_g, 48);
  assert.equal(update.fat_g, 24);
  assert.equal(update.nutrition_snapshot?.nutrition_details?.sodium_mg, 320);
});

test("unreconcilable serving entries are rejected instead of guessed", () => {
  assert.throws(
    () => buildHealthFoodHistoryMealEntryUpdate(food, meal({ consumed_quantity: null, consumed_unit: null })),
    /saved serving amount is unavailable/i,
  );
  assert.throws(
    () => buildHealthFoodHistoryMealEntryUpdate(food, meal({ consumed_quantity: 1, consumed_unit: "ml" })),
    /incompatible/i,
  );
});

test("partial history repair is reported as incomplete and retryable", () => {
  assert.equal(
    formatHealthFoodHistoryRepairResult({ requested: 9, updated: 8, skipped: 1, failed: 0, failureMessages: [] }),
    "Updated 8 previous logs. 1 entry was skipped because its serving amount could not be reconciled.",
  );
  assert.match(
    formatHealthFoodHistoryRepairResult({ requested: 9, updated: 7, skipped: 1, failed: 1, failureMessages: ["Network error"] }),
    /Network error.*Retry Update Previous Logs/,
  );
});

test("Custom Food save prompt and persistent repair action use the source-id history path", () => {
  const panel = readFileSync(new URL("../src/components/task-app/health-library-panel.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");

  assert.match(panel, /Update previous logs\?/);
  assert.match(panel, /Update all previous logs/);
  assert.match(panel, /Future entries only/);
  assert.match(panel, /Update Previous Logs ·/);
  assert.match(panel, /hasHealthFoodNutritionOrServingChanges/);
  assert.match(panel, /updatePreviousFoodLogs\(saved\)/);
  assert.match(panel, /updatePreviousFoodLogs\(food\)/);
  assert.match(hook, /selectHealthFoodMealEntriesBySourceId\(mealEntries, food\.id\)/);
  assert.match(hook, /\.eq\("source_food_id", food\.id\)/);
  assert.match(hook, /setMessage\(\{ tone: "warn", text: message \}\)/);
  assert.match(hook, /formatHealthFoodHistoryRepairResult/);
});

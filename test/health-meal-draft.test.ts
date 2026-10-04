import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHealthMealEntryInputFromSelection,
  createDefaultMealDraft,
  hasMeaningfulMealDraft,
  prepareMealDraftForSelectedSlot,
  resetMealDraftForNextItem,
  type MealFoodSelection,
  type MealDraft,
} from "../src/lib/health-meal-draft.ts";
import { normalizeHealthMealStoredCalories } from "../src/lib/health-meal-recalculation.ts";

function draft(overrides: Partial<MealDraft> = {}): MealDraft {
  return {
    ...createDefaultMealDraft("breakfast", new Date(2026, 7, 25, 14, 32)),
    date: "2026-08-20",
    time: "12:14",
    ...overrides,
  };
}

function fractionalMealSelection(overrides: Partial<MealFoodSelection> = {}): MealFoodSelection {
  return {
    attribution: null,
    barcode: null,
    brandName: "Example Brand",
    calories: 142.8,
    carbs: 22.25,
    fat: 3.75,
    foodCategory: "Test",
    foodName: "Fractional Meal",
    nutritionDetails: null,
    protein: 12.5,
    provider: "custom",
    providerItemId: "fractional-food",
    servingLabel: "1 serving",
    servingMeasureUnit: "g",
    servingMeasureValue: 59,
    servingQuantity: 1,
    servingUnit: "serving",
    sourceFoodId: "fractional-food",
    consumedQuantity: 50,
    consumedUnit: "g",
    ...overrides,
  };
}

test("Meal input rounds the integer calories column while preserving precise nutrition", () => {
  const input = buildHealthMealEntryInputFromSelection(fractionalMealSelection(), {
    date: "2026-10-04",
    id: "fractional-meal",
    loggedAt: "2026-10-04T12:00:00.000Z",
    mealSlot: "breakfast",
  });

  assert.equal(input.calories, 121);
  assert.equal(input.calories, Math.round(121.01694915254238));
  assert.equal(input.nutrition_snapshot?.calories, 121.01694915254238);
  assert.equal(input.protein_g, input.nutrition_snapshot?.protein_g);
  assert.equal(input.carbs_g, input.nutrition_snapshot?.carbs_g);
  assert.equal(input.fat_g, input.nutrition_snapshot?.fat_g);
  assert.equal(input.consumed_quantity, 50);
  assert.equal(input.serving_fraction, 50 / 59);
  assert.equal(Number.isInteger(input.calories), true);
});

test("stored Meal calorie normalization preserves valid integers and rejects invalid values", () => {
  assert.equal(normalizeHealthMealStoredCalories(121.01694915254238), 121);
  assert.equal(normalizeHealthMealStoredCalories(121), 121);
  assert.equal(normalizeHealthMealStoredCalories(0), 0);
  assert.equal(normalizeHealthMealStoredCalories(Number.NaN), null);
  assert.equal(normalizeHealthMealStoredCalories(-1), null);
});

test("successful meal reset preserves the logging date", () => {
  assert.equal(resetMealDraftForNextItem(draft()).date, "2026-08-20");
});

test("successful meal reset preserves the meal slot", () => {
  assert.equal(resetMealDraftForNextItem(draft({ mealSlot: "lunch" })).mealSlot, "lunch");
});

test("successful meal reset preserves the selected time", () => {
  assert.equal(resetMealDraftForNextItem(draft()).time, "12:14");
});

test("successful meal reset clears food-specific selection and serving fields", () => {
  const nextDraft = resetMealDraftForNextItem(draft({
    attribution: "USDA",
    barcode: "012345",
    brandName: "Brand",
    calories: "450",
    carbs: "40",
    fat: "12",
    foodName: "Sandwich",
    protein: "22",
    provider: "usda",
    providerItemId: "food-1",
    quantity: "2",
    measurement: "slice",
    sourceFoodId: "library-1",
    foodCategory: "Lunch",
    servingQuantity: 2,
    servingUnit: "slice",
    servingMeasureValue: 100,
    servingMeasureUnit: "g",
    servingLabel: "2 slices",
    mealSlot: "lunch",
  }));

  assert.deepEqual(nextDraft, {
    ...createDefaultMealDraft("lunch", new Date(2026, 7, 25, 14, 32)),
    date: "2026-08-20",
    time: "12:14",
  });
});

test("invalid draft time falls back to the current local time while preserving date and slot", () => {
  assert.deepEqual(
    resetMealDraftForNextItem(draft({ time: "25:90", mealSlot: "dinner" }), new Date(2026, 7, 25, 8, 6)),
    {
      ...createDefaultMealDraft("dinner", new Date(2026, 7, 25, 8, 6)),
      date: "2026-08-20",
    },
  );
});

test("clean section targeting prepares breakfast for the selected history date", () => {
  const prepared = prepareMealDraftForSelectedSlot(draft(), "2026-08-20", "breakfast");
  assert.equal(prepared.date, "2026-08-20");
  assert.equal(prepared.mealSlot, "breakfast");
  assert.equal(prepared.time, "12:14");
});

test("clean section targeting prepares lunch for the selected history date", () => {
  const prepared = prepareMealDraftForSelectedSlot(draft(), "2026-08-20", "lunch");
  assert.equal(prepared.date, "2026-08-20");
  assert.equal(prepared.mealSlot, "lunch");
});

test("clean section targeting prepares dinner for the selected history date", () => {
  const prepared = prepareMealDraftForSelectedSlot(draft(), "2026-08-20", "dinner");
  assert.equal(prepared.date, "2026-08-20");
  assert.equal(prepared.mealSlot, "dinner");
});

test("clean section targeting prepares snack for the selected history date", () => {
  const prepared = prepareMealDraftForSelectedSlot(draft(), "2026-08-20", "snack");
  assert.equal(prepared.date, "2026-08-20");
  assert.equal(prepared.mealSlot, "snack");
});

test("section targeting never replaces the selected history date with today", () => {
  const prepared = prepareMealDraftForSelectedSlot(
    draft({ date: "2026-08-25" }),
    "2026-08-20",
    "lunch",
    new Date(2026, 7, 25, 14, 32),
  );
  assert.equal(prepared.date, "2026-08-20");
});

test("a second item can reuse the same past-day meal context without reselecting it", () => {
  const firstTarget = prepareMealDraftForSelectedSlot(draft(), "2026-08-20", "lunch");
  const afterFirstSave = resetMealDraftForNextItem({ ...firstTarget, foodName: "Turkey sandwich" });
  const secondItem = { ...afterFirstSave, foodName: "Chips" };

  assert.equal(afterFirstSave.date, "2026-08-20");
  assert.equal(afterFirstSave.mealSlot, "lunch");
  assert.equal(secondItem.date, "2026-08-20");
  assert.equal(secondItem.mealSlot, "lunch");
});

test("a clean draft is safe to replace from another section", () => {
  assert.equal(hasMeaningfulMealDraft(draft()), false);
});

test("an empty Quick Entry draft with its default serving quantity is safe to replace", () => {
  assert.equal(hasMeaningfulMealDraft(draft({ servingQuantity: 1 })), false);
});

test("a selected food makes a draft meaningful for dirty-draft preservation", () => {
  assert.equal(hasMeaningfulMealDraft(draft({ foodName: "Turkey sandwich", calories: "450", servingQuantity: 1 })), true);
});

test("partial quick-entry nutrition is also treated as meaningful draft data", () => {
  assert.equal(hasMeaningfulMealDraft(draft({ calories: "250" })), true);
});

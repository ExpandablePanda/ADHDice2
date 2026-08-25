import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultMealDraft,
  hasMeaningfulMealDraft,
  prepareMealDraftForSelectedSlot,
  resetMealDraftForNextItem,
  type MealDraft,
} from "../src/lib/health-meal-draft.ts";

function draft(overrides: Partial<MealDraft> = {}): MealDraft {
  return {
    ...createDefaultMealDraft("breakfast", new Date(2026, 7, 25, 14, 32)),
    date: "2026-08-20",
    time: "12:14",
    ...overrides,
  };
}

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

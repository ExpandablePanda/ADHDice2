import test from "node:test";
import assert from "node:assert/strict";

import { normalizeOpenFoodFactsProduct, normalizeUsdaFoodResult } from "../src/lib/health-nutrition.ts";

test("open food facts products normalize into health lookup results", () => {
  const result = normalizeOpenFoodFactsProduct({
    _id: "12345",
    brands: "Acme",
    code: "012345678905",
    nutriments: {
      "carbohydrates_serving": 23.4,
      "energy-kcal_serving": 190.2,
      "fat_serving": 7.8,
      "proteins_serving": 14.1,
    },
    product_name: "Crunchy Yogurt Cup",
    serving_size: "1 cup (170 g)",
  });

  assert.ok(result);
  assert.equal(result.foodName, "Crunchy Yogurt Cup");
  assert.equal(result.brandName, "Acme");
  assert.equal(result.barcode, "012345678905");
  assert.equal(result.calories, 190);
  assert.equal(result.protein, 14.1);
  assert.equal(result.carbs, 23.4);
  assert.equal(result.fat, 7.8);
  assert.equal(result.provider, "open_food_facts");
  assert.equal(result.servingLabel, "1 cup (170 g)");
});

test("normalization returns null when a product lacks required identity fields", () => {
  const result = normalizeOpenFoodFactsProduct({
    brands: "Acme",
    nutriments: {
      "energy-kcal_serving": 120,
    },
  });

  assert.equal(result, null);
});

test("usda search results normalize into health lookup results", () => {
  const result = normalizeUsdaFoodResult({
    attribution: "USDA FoodData Central",
    brandName: "USDA Brand",
    calories: 210,
    carbs: 28.6,
    fat: 8.2,
    foodName: "Roasted chickpea bowl",
    id: 98765,
    protein: 11.4,
    provider: "usda",
    servingLabel: "1 bowl (240 g)",
  });

  assert.ok(result);
  assert.equal(result.foodName, "Roasted chickpea bowl");
  assert.equal(result.provider, "usda");
  assert.equal(result.providerItemId, "98765");
  assert.equal(result.calories, 210);
  assert.equal(result.protein, 11.4);
  assert.equal(result.carbs, 28.6);
  assert.equal(result.fat, 8.2);
});

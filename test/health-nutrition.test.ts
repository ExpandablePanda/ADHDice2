import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateHealthFoodNutrition,
  getHealthFoodMeasurementOptions,
  normalizeOpenFoodFactsProduct,
  normalizeUsdaFoodResult,
} from "../src/lib/health-nutrition.ts";

const goldfishServing = {
  nutritionPerServing: {
    calories: 140,
    protein_g: 2,
    carbs_g: 20,
    fat_g: 5,
  },
  servingQuantity: 55,
  servingUnit: "cracker",
  servingMeasureValue: 30,
  servingMeasureUnit: "g" as const,
};

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

test("20 of a 55-cracker serving applies one precise serving fraction", () => {
  const result = calculateHealthFoodNutrition({
    ...goldfishServing,
    consumedQuantity: 20,
    consumedUnit: "cracker",
  });

  assert.equal(result.servingFraction, 20 / 55);
  assert.ok(Math.abs(result.nutrientTotals.calories - (140 * 20 / 55)) < 1e-12);
  assert.ok(Math.abs(result.nutrientTotals.calories - 50.90909090909091) < 1e-12);
});

test("15 g of a 30 g labeled serving calculates as half a serving", () => {
  const result = calculateHealthFoodNutrition({
    ...goldfishServing,
    consumedQuantity: 15,
    consumedUnit: "g",
  });

  assert.equal(result.servingFraction, 0.5);
  assert.equal(result.nutrientTotals.calories, 70);
});

test("every supported nutrient uses the same serving fraction without double multiplication", () => {
  const result = calculateHealthFoodNutrition({
    ...goldfishServing,
    consumedQuantity: 20,
    consumedUnit: "cracker",
  });
  const fraction = 20 / 55;

  assert.deepEqual(result.nutrientTotals, {
    calories: 140 * fraction,
    protein_g: 2 * fraction,
    carbs_g: 20 * fraction,
    fat_g: 5 * fraction,
  });
});

test("mass conversions keep g and oz equivalent", () => {
  const grams = calculateHealthFoodNutrition({
    nutritionPerServing: { calories: 100 },
    servingQuantity: 1,
    servingUnit: "oz",
    consumedQuantity: 28.349523125,
    consumedUnit: "g",
  });
  const ounces = calculateHealthFoodNutrition({
    nutritionPerServing: { calories: 100 },
    servingQuantity: 28.349523125,
    servingUnit: "g",
    consumedQuantity: 1,
    consumedUnit: "oz",
  });

  assert.equal(grams.servingFraction, 1);
  assert.equal(ounces.servingFraction, 1);
});

test("volume conversions keep mL and fl oz equivalent", () => {
  const milliliters = calculateHealthFoodNutrition({
    nutritionPerServing: { calories: 100 },
    servingQuantity: 1,
    servingUnit: "fl_oz",
    consumedQuantity: 29.5735295625,
    consumedUnit: "ml",
  });
  const fluidOunces = calculateHealthFoodNutrition({
    nutritionPerServing: { calories: 100 },
    servingQuantity: 29.5735295625,
    servingUnit: "ml",
    consumedQuantity: 1,
    consumedUnit: "fl oz",
  });

  assert.equal(milliliters.servingFraction, 1);
  assert.equal(fluidOunces.servingFraction, 1);
});

test("mass-to-volume, zero, negative, and incomplete measures are rejected", () => {
  assert.throws(() => calculateHealthFoodNutrition({
    ...goldfishServing,
    consumedQuantity: 15,
    consumedUnit: "ml",
  }), /incompatible/i);
  assert.throws(() => calculateHealthFoodNutrition({
    ...goldfishServing,
    consumedQuantity: 0,
    consumedUnit: "cracker",
  }), /greater than zero/i);
  assert.throws(() => calculateHealthFoodNutrition({
    ...goldfishServing,
    servingQuantity: -1,
    consumedQuantity: 1,
    consumedUnit: "cracker",
  }), /greater than zero/i);
  assert.throws(() => calculateHealthFoodNutrition({
    ...goldfishServing,
    servingMeasureValue: 30,
    servingMeasureUnit: null,
    consumedQuantity: 1,
    consumedUnit: "cracker",
  }), /provided together/i);
});

test("calculation retains precision until presentation rounding", () => {
  const result = calculateHealthFoodNutrition({
    nutritionPerServing: { calories: 100 },
    servingQuantity: 3,
    servingUnit: "piece",
    consumedQuantity: 1,
    consumedUnit: "piece",
  });

  assert.ok(Math.abs(result.nutrientTotals.calories - 100 / 3) < 1e-12);
  assert.notEqual(result.nutrientTotals.calories, Math.round(result.nutrientTotals.calories));
});

test("count-only foods work without a serving measure", () => {
  const result = calculateHealthFoodNutrition({
    nutritionPerServing: { calories: 90 },
    servingQuantity: 2,
    servingUnit: "slice",
    consumedQuantity: 1,
    consumedUnit: "slice",
  });

  assert.equal(result.servingFraction, 0.5);
  assert.equal(result.nutrientTotals.calories, 45);
  assert.equal(result.serving.measureValue, null);
});

test("one-serving quick entries preserve optional macro totals without a library serving definition", () => {
  const result = calculateHealthFoodNutrition({
    nutritionPerServing: { calories: 275, protein_g: 18.5, carbs_g: 22, fat_g: 9.25 },
    servingQuantity: 1,
    servingUnit: "serving",
    consumedQuantity: 1,
    consumedUnit: "serving",
  });
  assert.equal(result.servingFraction, 1);
  assert.deepEqual(result.nutrientTotals, { calories: 275, protein_g: 18.5, carbs_g: 22, fat_g: 9.25 });
});

test("supported measurement options always include servings and only expose the food dimension", () => {
  assert.deepEqual(getHealthFoodMeasurementOptions({
    servingMeasureUnit: "g",
    servingUnit: "cracker",
  }), [
    { value: "serving", label: "servings" },
    { value: "cracker", label: "cracker" },
    { value: "g", label: "g" },
    { value: "oz", label: "oz" },
  ]);
  assert.deepEqual(getHealthFoodMeasurementOptions({
    servingMeasureUnit: "ml",
    servingUnit: "bottle",
  }).map((option) => option.value), ["serving", "bottle", "ml", "fl_oz"]);
  assert.deepEqual(getHealthFoodMeasurementOptions({
    servingMeasureUnit: null,
    servingUnit: "slice",
  }).map((option) => option.value), ["serving", "slice"]);
});

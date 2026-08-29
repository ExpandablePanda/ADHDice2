import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildRecipeIngredient,
  buildHealthMealPickerSuggestions,
  buildSavedMealFoodItem,
  buildSavedMealRecipeItem,
  composeHealthFoodServingDefinition,
  composeHealthFoodServingLabel,
  composeHealthFoodStructuredServingLabel,
  formatHealthFoodQuantityUnit,
  getRecipeNutrition,
  getRecipeNutritionPerServing,
  getSavedMealNutrition,
  getHealthFoodAutocompleteValues,
  getHealthFoodDisplaySuggestions,
  getHealthFoodIdentityKey,
  buildHealthDailyCalorieSeries,
  buildHealthFoodLogHistoryIndex,
  normalizeHealthFoodLibraryInput,
  normalizeHealthFoodLibraryItem,
  searchHealthFoodLibrary,
  setHealthFoodFavoriteStatus,
  sortHealthFoodLibraryByCreatedAt,
  sortHealthFoodsForMealPicker,
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

test("Food Logging picker exposes custom Foods, Recipes, and Saved Meals by name", () => {
  const recipe = {
    created_at: "2026-07-27T12:00:00.000Z",
    id: "recipe-1",
    ingredients: [buildRecipeIngredient(food, 2)],
    name: "Test recipe",
    notes: "",
    servings: 2,
    updated_at: "2026-07-27T12:00:00.000Z",
    user_id: "user-1",
  };
  const savedMeal = {
    created_at: "2026-07-27T12:00:00.000Z",
    default_meal_slot: "lunch" as const,
    id: "saved-meal-1",
    items: [buildSavedMealFoodItem(food, 1)],
    name: "Test saved meal",
    updated_at: "2026-07-27T12:00:00.000Z",
    user_id: "user-1",
  };

  const suggestions = buildHealthMealPickerSuggestions({
    foods: [food],
    recipes: [recipe],
    savedMeals: [savedMeal],
  });

  assert.deepEqual(suggestions.map((suggestion) => suggestion.kind), ["food", "recipe", "saved_meal"]);
  assert.deepEqual(suggestions.map((suggestion) => suggestion.label), ["Test food", "Test recipe · Recipe", "Test saved meal · Saved Meal"]);
  assert.deepEqual(getRecipeNutritionPerServing(recipe), { calories: 200, protein: 12, carbs: 24, fat: 8 });
  assert.deepEqual(getSavedMealNutrition(savedMeal), { calories: 200, protein: 12, carbs: 24, fat: 8 });

  const source = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
  const dropdown = readFileSync(new URL("../src/components/task-app/health-dropdown.tsx", import.meta.url), "utf8");
  assert.match(source, /onSelect=\{\(suggestion\) =>/);
  assert.match(source, /applyMealFoodPickerSuggestion\(selected\)/);
  assert.match(source, /provider: "recipe"/);
  assert.match(source, /provider: "saved_meal"/);
  assert.match(dropdown, /onSelect\?\.\(suggestion\)/);
  assert.match(dropdown, /event\.key === "Enter"[\s\S]*chooseSuggestion\(highlightedIndex\)/);
  assert.match(dropdown, /scrollIntoView\(\{ block: "nearest" \}\)/);
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
  assert.deepEqual(searchHealthFoodLibrary([{ ...food, brand_name: "Acme", food_name: "Granola" }], "acme · granola").map((item) => item.food_name), ["Granola"]);
});

test("custom food ordering uses creation time and newer values win autocomplete deduplication", () => {
  const older = { ...food, id: "food-older", food_name: "Test food", created_at: "2026-07-27T12:00:00.000Z" };
  const newer = { ...food, id: "food-newer", food_name: "TEST FOOD", created_at: "2026-07-29T12:00:00.000Z" };
  assert.deepEqual(sortHealthFoodLibraryByCreatedAt([older, newer]).map((item) => item.id), ["food-newer", "food-older"]);
  assert.deepEqual(getHealthFoodAutocompleteValues([older, newer], "food_name"), ["TEST FOOD"]);
  assert.deepEqual(getHealthFoodDisplaySuggestions([
    { ...older, brand_name: "Acme" },
    { ...newer, brand_name: "ACME" },
    { ...food, brand_name: null, food_name: "Other" },
  ]), ["Acme · Test food", "Other"]);
});

test("meal picker ordering prefers most recent matching log, then newest unlogged food", () => {
  const loggedFood = { ...food, id: "food-logged", created_at: "2026-07-20T12:00:00.000Z" };
  const unloggedFood = { ...food, id: "food-unlogged", food_name: "Unlogged", created_at: "2026-07-28T12:00:00.000Z" };
  const mealEntry = {
    ...loggedFood,
    entry_date: "2026-07-29",
    logged_at: "2026-07-30T12:00:00.000Z",
    meal_slot: "lunch" as const,
  };
  assert.deepEqual(sortHealthFoodsForMealPicker([unloggedFood, loggedFood], [mealEntry]).map((item) => item.id), ["food-logged", "food-unlogged"]);
});

test("daily calorie series includes seven local dates, sums meals, and preserves empty dates", () => {
  const entries = [
    {
      ...food,
      calories: 120,
      entry_date: "2026-08-12",
      id: "meal-1",
      logged_at: "2026-08-12T08:00:00.000Z",
      meal_slot: "breakfast" as const,
      source_food_id: "deleted-food",
    },
    {
      ...food,
      calories: 280,
      entry_date: "2026-08-12",
      id: "meal-2",
      logged_at: "2026-08-12T18:00:00.000Z",
      meal_slot: "dinner" as const,
      source_food_id: "deleted-food",
    },
  ];
  const originalEntries = [...entries];
  const series = buildHealthDailyCalorieSeries({ endDate: "2026-08-13", mealEntries: entries });
  assert.equal(series.length, 7);
  assert.deepEqual(series.map((point) => point.date), [
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
  ]);
  assert.deepEqual(series.map((point) => point.calories), [0, 0, 0, 0, 0, 400, 0]);
  assert.deepEqual(entries, originalEntries);
});

test("food history index counts and sorts identity-matched meals without mutating input", () => {
  const newest = {
    ...food,
    entry_date: "2026-08-12",
    id: "meal-newest",
    logged_at: "2026-08-12T20:00:00.000Z",
    meal_slot: "dinner" as const,
  };
  const older = {
    ...food,
    entry_date: "2026-08-10",
    id: "meal-older",
    logged_at: "2026-08-10T20:00:00.000Z",
    meal_slot: "dinner" as const,
  };
  const otherFood = { ...food, food_name: "Other food", id: "meal-other", logged_at: "2026-08-11T20:00:00.000Z" };
  const noIdentity = { ...food, food_name: "", id: null, logged_at: "2026-08-13T20:00:00.000Z" };
  const entries = [older, noIdentity, otherFood, newest];
  const originalEntries = [...entries];
  const index = buildHealthFoodLogHistoryIndex(entries);
  const identity = getHealthFoodIdentityKey(food);
  assert.ok(identity);
  assert.equal(index.get(identity)?.count, 2);
  assert.deepEqual(index.get(identity)?.entries.map((entry) => entry.id), ["meal-newest", "meal-older"]);
  assert.equal(index.get(identity)?.latestLoggedAt, "2026-08-12T20:00:00.000Z");
  assert.equal(index.get(getHealthFoodIdentityKey(otherFood) ?? "")?.count, 1);
  assert.equal(index.size, 2);
  assert.deepEqual(entries, originalEntries);

  const topFiveHistory = buildHealthFoodLogHistoryIndex(Array.from({ length: 6 }, (_, index) => ({
    ...food,
    entry_date: `2026-08-${String(13 - index).padStart(2, "0")}`,
    id: `meal-many-${index}`,
    logged_at: `2026-08-${String(13 - index).padStart(2, "0")}T12:00:00.000Z`,
    meal_slot: "lunch" as const,
  })));
  assert.deepEqual(topFiveHistory.get(identity)?.entries.slice(0, 5).map((entry) => entry.id), [
    "meal-many-0",
    "meal-many-1",
    "meal-many-2",
    "meal-many-3",
    "meal-many-4",
  ]);
});

test("Health Food preserves nutrition behavior while using flat category-filtered picker and local tab preference", () => {
  const source = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
  const chart = readFileSync(new URL("../src/components/task-app/health-calorie-line-chart.tsx", import.meta.url), "utf8");
  const sharedChart = readFileSync(new URL("../src/components/activity-line-chart-card.tsx", import.meta.url), "utf8");
  const library = readFileSync(new URL("../src/components/task-app/health-library-panel.tsx", import.meta.url), "utf8");
  const dropdown = readFileSync(new URL("../src/components/task-app/health-dropdown.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(library, /filteredFoodGroups/);
  assert.match(library, /sortHealthFoodLibraryByCreatedAt/);
  assert.match(library, /HealthAutocomplete/);
  assert.match(dropdown, /aria-autocomplete="list"/);
  assert.match(dropdown, /onChange\(event\.target\.value\)/);
  assert.match(dropdown, /adhdice-scrollbar max-h-64 overflow-y-auto/);
  assert.match(library, /HealthAutocomplete[\s\S]*ariaLabel="Search custom foods"/);
  assert.match(source, /HealthAutocomplete[\s\S]*ariaLabel="Search custom foods"/);
  assert.match(source, /formatHealthFoodDisplayName\(item\)/);
  assert.match(source, /applyLookupResult\(/);
  assert.match(source, /<HealthBarcodeScanner/);
  assert.doesNotMatch(source, /Search foods and barcodes|USDA FoodData Central/);
  assert.match(source, /border-t border-\[#ece8f6\]/);
  assert.match(source, /sortHealthFoodsForMealPicker/);
  assert.match(source, /selectedCustomFoodCategory/);
  assert.doesNotMatch(source, /matchingCustomFoodGroups/);
  assert.match(source, /getHealthFoodIdentityKey/);
  assert.match(source, /readHealthTabPreference/);
  assert.match(source, /HEALTH_TABS/);
  assert.match(source, /adhdice-scrollbar max-h-\[26rem\].*overflow-y-auto/);
  assert.match(source, /adhdice-scrollbar max-h-24 overflow-y-auto/);
  assert.match(library, /grid min-w-0 items-start gap-5 xl:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(0,1\.1fr\)\]/);
  assert.match(library, /adhdice-scrollbar min-w-0 max-h-\[36rem\] overflow-y-auto/);
  assert.match(source, /foodLogHistoryIndex/);
  assert.doesNotMatch(source, /loggedCountByIdentity/);
  assert.match(source, /formatHealthNutritionNumber\(selectedNutrition\.calories\)/);
  assert.match(source, /formatHealthNutritionNumber\(slotCaloriesTotal\)/);
  assert.match(source, /buildHealthDailyCalorieSeries/);
  assert.match(source, /HealthCalorieLineChart/);
  assert.match(source, /buildHealthFoodLogHistoryIndex/);
  assert.match(source, /FavoriteFoodHistoryInlay/);
  assert.match(source, /expandedFavoriteId/);
  assert.match(chart, /ActivityLineChartCard/);
  assert.match(chart, /buildHealthDailyCalorieSeries|HealthDailyCaloriePoint/);
  assert.doesNotMatch(chart, /<svg/);
  assert.match(sharedChart, /aria-label=\{ariaLabel\}/);
  assert.match(sharedChart, /<svg/);
  assert.match(sharedChart, /emptyText/);
  assert.match(sharedChart, /Clear pin/);
  assert.match(source, /<HealthCalorieLineChart series=\{dailyCalorieSeries\} \/>/);
  assert.match(source, /subtitle="Daily totals"[\s\S]*?<HealthCalorieLineChart series=\{dailyCalorieSeries\} \/>[\s\S]*?<\/HealthPanel>/);
  assert.doesNotMatch(source, /<div className="xl:col-span-2">\s*<HealthCalorieLineChart/);
  assert.match(chart, /variant="embedded"/);
  assert.match(sharedChart, /variant\?: "standalone" \| "embedded"/);
  assert.match(sharedChart, /variant = "standalone"/);
  assert.match(chart, /No calories logged in this 7-day range/);
  assert.match(chart, /series\.map/);
  assert.doesNotMatch(source, /Recent Foods[\s\S]{0,2500}FavoriteFoodHistoryInlay/);
  assert.match(source, /calculateHealthDailyCalorieAllowance/);
  assert.match(source, /sumMetricValueForDate\(metricEntries, foodHistoryDate, \["active_energy_kcal"\]\)/);
  assert.match(source, /progressPercent=\{selectedCalorieAllowance === null/);
  assert.match(source, /Add Active Energy to calorie allowance/);
  assert.match(source, /profileDraft\.add_active_energy_to_calorie_goal/);
  assert.match(source, /setFavoriteFoodStatus\(item\.id, false\)/);
  assert.match(source, /getHealthFoodMeasurementOptions/);
  assert.match(source, /calculateHealthFoodNutrition/);
  assert.match(source, /formatHealthFoodQuantityUnit/);
  assert.match(source, /composeHealthFoodServingDefinition/);
  assert.match(source, /formatHealthMealSummary\(entry\)/);
  assert.doesNotMatch(source, /mealDraft\.measurement === "serving"/);
  assert.match(source, /nutrition_snapshot: calculation\.nutrientTotals/);
  assert.match(source, /mode: "legacy"/);
  assert.doesNotMatch(source, /sortHealthFoodsForMealPicker\(favorites, mealEntries\)[\s\S]{0,1000}\.slice\(0, 8\)/);
});

test("Custom Food barcode Clear restores its scan baseline and ignores stale lookup responses", () => {
  const library = readFileSync(new URL("../src/components/task-app/health-library-panel.tsx", import.meta.url), "utf8");
  const scanHandler = library.slice(library.indexOf("function handleFoodBarcodeDetected"), library.indexOf("function startEditingFood"));
  const clearHandler = library.slice(library.indexOf("function clearFoodScan"), library.indexOf("async function handleSaveFood"));
  assert.match(library, /const barcodeLookupGenerationRef = useRef\(0\)/);
  assert.match(library, /const foodScanBaselineRef = useRef<FoodDraft \| null>\(null\)/);
  assert.match(scanHandler, /const requestGeneration = \+\+barcodeLookupGenerationRef\.current/);
  assert.match(scanHandler, /foodScanBaselineRef\.current = cloneFoodDraft\(foodDraft\)/);
  assert.match(scanHandler, /if \(requestGeneration !== barcodeLookupGenerationRef\.current\)/);
  assert.match(scanHandler, /if \(requestGeneration === barcodeLookupGenerationRef\.current\)/);
  assert.match(clearHandler, /const baseline = foodScanBaselineRef\.current/);
  assert.match(clearHandler, /barcodeLookupGenerationRef\.current \+= 1/);
  assert.match(clearHandler, /foodScanBaselineRef\.current = null/);
  assert.match(clearHandler, /setFoodDraft\(cloneFoodDraft\(baseline\)\)/);
  assert.match(clearHandler, /setBarcodeLookupStatus\("idle"\)/);
  assert.match(clearHandler, /setBarcodeLookupMessage\(""\)/);
  assert.match(clearHandler, /setIsBarcodeScannerOpen\(false\)/);
  assert.match(library, /hasFoodScanBaseline \? <AdhdChip[\s\S]*?onClick=\{clearFoodScan\}>Clear<\/AdhdChip>/);
  assert.match(library, /function startEditingFood\(food: HealthFoodLibraryItem\)/);
  assert.match(library, /onClick=\{\(\) => startEditingFood\(food\)\}/);
  assert.doesNotMatch(scanHandler, /saveFood\(/);
  assert.match(library, /onClick=\{\(\) => \{ void handleSaveFood\(\); \}\}/);
  assert.doesNotMatch(library, />Lookup<\//);
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

"use client";

import { Camera, Copy, FileUp, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import type {
  HealthFoodLibraryItem,
  HealthMealSlot,
  HealthRecipe,
  HealthRecipeIngredient,
  HealthSavedMeal,
  HealthSavedMealItem,
  HealthNutritionDetailKey,
  HealthNutritionDetails,
  HealthServingMeasureUnit,
  HealthServingWeightUnit,
} from "@/lib/database.types";
import {
  buildRecipeIngredient,
  buildSavedMealFoodItem,
  buildSavedMealRecipeItem,
  composeHealthFoodStructuredServingLabel,
  formatQuantity,
  getHealthFoodIdentityKey,
  getHealthFoodAutocompleteValues,
  getHealthFoodDisplaySuggestions,
  getRecipeNutritionPerServing,
  getSavedMealNutrition,
  searchHealthFoodLibrary,
  sortHealthFoodLibraryByCreatedAt,
} from "@/lib/health-library";
import {
  buildHealthCustomFoodImportTemplate,
  getHealthCustomFoodImportIdentityKey,
  HEALTH_CUSTOM_FOOD_IMPORT_FIELDS,
  parseHealthCustomFoodImport,
  validateHealthCustomFoodImportDraft,
  type HealthCustomFoodImportDraft,
  type HealthCustomFoodImportFieldKey,
} from "@/lib/health-food-import";
import { getMealSlotLabel, HEALTH_MEAL_SLOTS } from "@/lib/health-utils";
import {
  HEALTH_NUTRITION_FIELD_REGISTRY,
  lookupOpenFoodFactsByBarcode,
  normalizeHealthNutritionDetails,
  parseHealthNutritionDetailsInput,
  type HealthFoodLookupResult,
} from "@/lib/health-nutrition";
import { HealthCollapsiblePanel } from "./health-collapsible-panel";
import { HealthBarcodeScanner } from "./health-barcode-scanner";
import { HealthAutocomplete, HealthDropdown, HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";

type LibrarySection = "foods" | "recipes" | "meals";

type FoodDraft = {
  id?: string;
  barcode: string;
  foodName: string;
  brandName: string;
  foodCategory: string;
  servingQuantity: string;
  servingUnit: string;
  servingMeasureValue: string;
  servingMeasureUnit: HealthServingMeasureUnit | "";
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  nutritionDetails: Record<HealthNutritionDetailKey, string>;
};

function createEmptyNutritionDetailDraft() {
  return Object.fromEntries(HEALTH_NUTRITION_FIELD_REGISTRY.map((field) => [field.key, ""])) as Record<HealthNutritionDetailKey, string>;
}

const EMPTY_FOOD_DRAFT: FoodDraft = {
  barcode: "",
  foodName: "",
  brandName: "",
  foodCategory: "",
  servingQuantity: "1",
  servingUnit: "serving",
  servingMeasureValue: "",
  servingMeasureUnit: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  nutritionDetails: createEmptyNutritionDetailDraft(),
};

type FoodImportRow = {
  draft: HealthCustomFoodImportDraft;
  id: string;
  lineStart: number;
  selected: boolean;
  unknownFields: string[];
  warnings: string[];
};

type FoodImportReview = FoodImportRow & {
  duplicate: boolean;
  errors: string[];
  input: ReturnType<typeof validateHealthCustomFoodImportDraft>["input"];
};

type RecipeDraft = {
  id?: string;
  name: string;
  notes: string;
  servings: string;
  ingredients: HealthRecipeIngredient[];
};

const EMPTY_RECIPE_DRAFT: RecipeDraft = {
  name: "",
  notes: "",
  servings: "1",
  ingredients: [],
};

type MealDraft = {
  id?: string;
  name: string;
  mealSlot: HealthMealSlot;
  items: HealthSavedMealItem[];
};

const EMPTY_MEAL_DRAFT: MealDraft = {
  name: "",
  mealSlot: "breakfast",
  items: [],
};

type HealthLibraryPanelProps = {
  favorites: HealthFoodLibraryItem[];
  recipes: HealthRecipe[];
  savedMeals: HealthSavedMeal[];
  shellSurface?: boolean;
  deleteFood: (id: string) => Promise<boolean>;
  deleteRecipe: (id: string) => Promise<boolean>;
  deleteSavedMeal: (id: string) => Promise<boolean>;
  saveFood: (input: {
    id?: string;
    attribution?: string | null;
    barcode?: string | null;
    food_name: string;
    brand_name?: string | null;
    category?: string | null;
    food_category?: string | null;
    serving_label?: string | null;
    serving_size?: string | null;
    serving_quantity?: number;
    serving_unit?: string;
    serving_measure_value?: number | null;
    serving_measure_unit?: HealthServingMeasureUnit | null;
    serving_weight_amount?: number | null;
    serving_weight_unit?: HealthServingWeightUnit | null;
    calories: number;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
    nutrition_details?: HealthNutritionDetails | null;
    provider?: string;
    provider_item_id?: string | null;
  }) => Promise<boolean>;
  saveRecipe: (input: {
    id?: string;
    name: string;
    notes?: string;
    servings: number;
    ingredients: HealthRecipeIngredient[];
  }) => Promise<boolean>;
  saveSavedMeal: (input: {
    id?: string;
    name: string;
    default_meal_slot: HealthMealSlot;
    items: HealthSavedMealItem[];
  }) => Promise<boolean>;
};

export function HealthLibraryPanel({
  favorites,
  recipes,
  savedMeals,
  shellSurface = false,
  deleteFood,
  deleteRecipe,
  deleteSavedMeal,
  saveFood,
  saveRecipe,
  saveSavedMeal,
}: HealthLibraryPanelProps) {
  const [section, setSection] = useState<LibrarySection>("foods");
  const [foodDraft, setFoodDraft] = useState<FoodDraft>(EMPTY_FOOD_DRAFT);
  const [foodSearchQuery, setFoodSearchQuery] = useState("");
  const [foodImportText, setFoodImportText] = useState("");
  const [foodImportRows, setFoodImportRows] = useState<FoodImportRow[]>([]);
  const [foodImportStatus, setFoodImportStatus] = useState("");
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [barcodeLookupStatus, setBarcodeLookupStatus] = useState<"idle" | "lookup">("idle");
  const [barcodeLookupMessage, setBarcodeLookupMessage] = useState("");
  const barcodeLookupGenerationRef = useRef(0);
  const foodScanBaselineRef = useRef<FoodDraft | null>(null);
  const [hasFoodScanBaseline, setHasFoodScanBaseline] = useState(false);
  const [isFoodImportOpen, setIsFoodImportOpen] = useState(false);
  const [isSavingFoodImport, setIsSavingFoodImport] = useState(false);
  const [ingredientSearchQuery, setIngredientSearchQuery] = useState("");
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>(EMPTY_RECIPE_DRAFT);
  const [mealDraft, setMealDraft] = useState<MealDraft>(EMPTY_MEAL_DRAFT);

  const orderedFoods = useMemo(() => sortHealthFoodLibraryByCreatedAt(favorites), [favorites]);
  const filteredFoods = useMemo(
    () => searchHealthFoodLibrary(orderedFoods, foodSearchQuery),
    [foodSearchQuery, orderedFoods],
  );
  const foodNameSuggestions = useMemo(() => getHealthFoodAutocompleteValues(orderedFoods, "food_name"), [orderedFoods]);
  const brandSuggestions = useMemo(() => getHealthFoodAutocompleteValues(orderedFoods, "brand_name"), [orderedFoods]);
  const categorySuggestions = useMemo(() => getHealthFoodAutocompleteValues(orderedFoods, "food_category"), [orderedFoods]);
  const servingUnitSuggestions = useMemo(() => getHealthFoodAutocompleteValues(orderedFoods, "serving_unit"), [orderedFoods]);
  const foodSearchSuggestions = useMemo(() => getHealthFoodDisplaySuggestions(orderedFoods), [orderedFoods]);
  const filteredIngredientFoods = useMemo(() => {
    const query = ingredientSearchQuery.trim().toLowerCase();
    if (!query) {
      return favorites;
    }
    return favorites.filter((food) => [
      food.brand_name,
      food.food_name,
      food.serving_label,
    ].some((value) => value?.toLowerCase().includes(query)));
  }, [favorites, ingredientSearchQuery]);
  const recipePreview = useMemo(
    () => getRecipeNutritionPerServing({
      ingredients: recipeDraft.ingredients,
      servings: parsePositive(recipeDraft.servings),
    }),
    [recipeDraft.ingredients, recipeDraft.servings],
  );
  const mealPreview = useMemo(
    () => getSavedMealNutrition({ items: mealDraft.items }),
    [mealDraft.items],
  );
  const foodImportReviews = useMemo(
    () => reviewFoodImportRows(foodImportRows, favorites),
    [favorites, foodImportRows],
  );

  function resetFoodDraft() {
    barcodeLookupGenerationRef.current += 1;
    foodScanBaselineRef.current = null;
    setHasFoodScanBaseline(false);
    setIsBarcodeScannerOpen(false);
    setBarcodeLookupStatus("idle");
    setBarcodeLookupMessage("");
    setFoodDraft(EMPTY_FOOD_DRAFT);
  }

  function clearFoodScan() {
    const baseline = foodScanBaselineRef.current;
    if (!baseline) {
      return;
    }
    barcodeLookupGenerationRef.current += 1;
    foodScanBaselineRef.current = null;
    setHasFoodScanBaseline(false);
    setIsBarcodeScannerOpen(false);
    setBarcodeLookupStatus("idle");
    setBarcodeLookupMessage("");
    setFoodDraft(cloneFoodDraft(baseline));
  }

  async function handleSaveFood() {
    const calories = Number.parseInt(foodDraft.calories, 10);
    const servingQuantity = nullablePositiveNumber(foodDraft.servingQuantity);
    const servingMeasureValue = nullablePositiveNumber(foodDraft.servingMeasureValue);
    const nutritionDetails = parseHealthNutritionDetailsInput(foodDraft.nutritionDetails);
    const hasInvalidNutritionDetail = HEALTH_NUTRITION_FIELD_REGISTRY.some((field) => {
      const rawValue = foodDraft.nutritionDetails[field.key]?.trim() ?? "";
      return rawValue.length > 0 && typeof nutritionDetails?.[field.key] !== "number";
    });
    const hasMeasureValue = foodDraft.servingMeasureValue.trim().length > 0;
    const hasMeasureUnit = Boolean(foodDraft.servingMeasureUnit);
    if (
      !foodDraft.foodName.trim()
      || !Number.isFinite(calories)
      || calories < 0
      || servingQuantity === null
      || !foodDraft.servingUnit.trim()
      || (hasMeasureValue && (servingMeasureValue === null || !hasMeasureUnit))
      || (!hasMeasureValue && hasMeasureUnit)
      || hasInvalidNutritionDetail
    ) {
      return;
    }
    const servingLabel = composeHealthFoodStructuredServingLabel({
      servingQuantity,
      servingUnit: foodDraft.servingUnit,
      servingMeasureValue,
      servingMeasureUnit: foodDraft.servingMeasureUnit || null,
    });
    const saved = await saveFood({
      id: foodDraft.id,
      brand_name: emptyToNull(foodDraft.brandName),
      barcode: emptyToNull(foodDraft.barcode),
      calories,
      category: emptyToNull(foodDraft.foodCategory) ?? "Uncategorized",
      food_category: emptyToNull(foodDraft.foodCategory) ?? "Uncategorized",
      carbs_g: nullableNumber(foodDraft.carbs),
      fat_g: nullableNumber(foodDraft.fat),
      food_name: foodDraft.foodName.trim(),
      protein_g: nullableNumber(foodDraft.protein),
      provider: "manual",
      serving_label: servingLabel,
      serving_size: servingLabel,
      serving_quantity: servingQuantity,
      serving_unit: foodDraft.servingUnit.trim(),
      serving_measure_value: servingMeasureValue,
      serving_measure_unit: foodDraft.servingMeasureUnit || null,
      serving_weight_amount: foodDraft.servingMeasureUnit === "g" || foodDraft.servingMeasureUnit === "oz" || foodDraft.servingMeasureUnit === "fl_oz" ? servingMeasureValue : null,
      serving_weight_unit: foodDraft.servingMeasureUnit === "g" || foodDraft.servingMeasureUnit === "oz" || foodDraft.servingMeasureUnit === "fl_oz" ? foodDraft.servingMeasureUnit : null,
      ...(nutritionDetails ? { nutrition_details: nutritionDetails } : {}),
    });
    if (saved) {
      resetFoodDraft();
    }
  }

  function handleFoodBarcodeDetected(barcode: string) {
    const scannedBarcode = barcode.trim();
    if (!scannedBarcode) {
      return;
    }
    const requestGeneration = ++barcodeLookupGenerationRef.current;
    foodScanBaselineRef.current = cloneFoodDraft(foodDraft);
    setHasFoodScanBaseline(true);
    setBarcodeLookupMessage("");
    setBarcodeLookupStatus("lookup");
    setFoodDraft((current) => ({ ...current, barcode: scannedBarcode }));
    void lookupOpenFoodFactsByBarcode(scannedBarcode)
      .then((result) => {
        if (requestGeneration !== barcodeLookupGenerationRef.current) {
          return;
        }
        if (!result) {
          setBarcodeLookupMessage("Barcode scanned. No food details found, enter the remaining information manually.");
          return;
        }
        setFoodDraft((current) => mergeFoodDraftWithBarcodeResult(current, result, scannedBarcode));
        setBarcodeLookupMessage("Barcode details loaded. Review before saving.");
      })
      .catch((error) => {
        if (requestGeneration !== barcodeLookupGenerationRef.current) {
          return;
        }
        setBarcodeLookupMessage(error instanceof Error ? error.message : "Barcode lookup did not complete.");
      })
      .finally(() => {
        if (requestGeneration === barcodeLookupGenerationRef.current) {
          setBarcodeLookupStatus("idle");
        }
      });
  }

  function startEditingFood(food: HealthFoodLibraryItem) {
    barcodeLookupGenerationRef.current += 1;
    foodScanBaselineRef.current = null;
    setHasFoodScanBaseline(false);
    setIsBarcodeScannerOpen(false);
    setBarcodeLookupStatus("idle");
    setBarcodeLookupMessage("");
    setFoodDraft(foodToDraft(food));
  }

  function openFoodImport() {
    setSection("foods");
    setIsFoodImportOpen(true);
    setFoodImportStatus("");
  }

  async function handleCopyFoodImportTemplate() {
    const template = buildHealthCustomFoodImportTemplate();
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(template);
        setFoodImportStatus("Template copied to the clipboard.");
        return;
      } catch {
        // Fall back to inserting the template so the action remains useful.
      }
    }
    setFoodImportText((current) => current.trim() ? current : template);
    setFoodImportStatus("Template inserted into the empty import box.");
  }

  function handleParseFoodImport() {
    const blocks = parseHealthCustomFoodImport(foodImportText);
    const rows = blocks.map((block, index) => ({
      draft: block.draft,
      id: `health-food-import-${index + 1}`,
      lineStart: block.lineStart,
      selected: true,
      unknownFields: block.unknownFields,
      warnings: block.warnings,
    }));
    setFoodImportRows(rows);
    setFoodImportStatus(rows.length ? `Preview ready for ${rows.length} proposed food${rows.length === 1 ? "" : "s"}.` : "No food blocks were found.");
  }

  function updateFoodImportField(id: string, key: HealthCustomFoodImportFieldKey, value: string) {
    setFoodImportRows((current) => current.map((row) => row.id === id
      ? { ...row, draft: { ...row.draft, [key]: value }, selected: true }
      : row));
  }

  function toggleFoodImportRow(id: string) {
    setFoodImportRows((current) => current.map((row) => row.id === id ? { ...row, selected: !row.selected } : row));
  }

  async function handleSaveFoodImport() {
    if (foodImportReviews.length === 0) {
      return;
    }
    setIsSavingFoodImport(true);
    let imported = 0;
    let failed = 0;
    for (const review of foodImportReviews) {
      if (!review.selected || review.duplicate || review.errors.length > 0 || !review.input) {
        continue;
      }
      if (await saveFood(review.input)) {
        imported += 1;
      } else {
        failed += 1;
      }
    }
    const duplicateCount = foodImportReviews.filter((review) => review.duplicate).length;
    const invalidCount = foodImportReviews.filter((review) => review.errors.length > 0).length;
    const skippedCount = foodImportReviews.filter((review) => !review.selected && !review.duplicate && review.errors.length === 0).length;
    setFoodImportStatus(`Imported ${imported}; skipped ${skippedCount}; duplicates ${duplicateCount}; invalid ${invalidCount}; failed ${failed}.`);
    setIsSavingFoodImport(false);
  }

  async function handleSaveRecipe() {
    if (!recipeDraft.name.trim() || recipeDraft.ingredients.length === 0) {
      return;
    }
    const saved = await saveRecipe({
      id: recipeDraft.id,
      ingredients: recipeDraft.ingredients,
      name: recipeDraft.name.trim(),
      notes: recipeDraft.notes.trim(),
      servings: parsePositive(recipeDraft.servings),
    });
    if (saved) {
      setRecipeDraft(EMPTY_RECIPE_DRAFT);
    }
  }

  async function handleSaveMeal() {
    if (!mealDraft.name.trim() || mealDraft.items.length === 0) {
      return;
    }
    const saved = await saveSavedMeal({
      id: mealDraft.id,
      default_meal_slot: mealDraft.mealSlot,
      items: mealDraft.items,
      name: mealDraft.name.trim(),
    });
    if (saved) {
      setMealDraft(EMPTY_MEAL_DRAFT);
    }
  }

  return (
    <HealthCollapsiblePanel
      className="min-w-0"
      shellSurface={shellSurface}
      subtitle="Create reusable foods, combine ingredients into recipes, or bundle foods and recipes into one-tap meals."
      title="Custom nutrition library"
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <AdhdChip count={favorites.length} onClick={() => setSection("foods")} selected={section === "foods"}>
          Foods
        </AdhdChip>
        <AdhdChip count={recipes.length} onClick={() => setSection("recipes")} selected={section === "recipes"}>
          Recipes
        </AdhdChip>
        <AdhdChip count={savedMeals.length} onClick={() => setSection("meals")} selected={section === "meals"}>
          Meals
        </AdhdChip>
      </div>
      {section === "foods" ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <AdhdChip contentClassName="gap-1.5" icon={<FileUp aria-hidden="true" className="h-3 w-3" />} onClick={openFoodImport} selected={isFoodImportOpen}>
              Import Foods
            </AdhdChip>
          </div>
          {isFoodImportOpen ? (
            <HealthCollapsiblePanel
              className="mb-5"
              subtitle="Paste one or more quoted food blocks, review every field, then confirm the import."
              title="Import custom foods"
              variant="subpanel"
            >
              <div className="grid gap-3">
                <textarea
                  className="health-input min-h-64 resize-y font-mono text-xs leading-5"
                  onChange={(event) => setFoodImportText(event.target.value)}
                  placeholder={buildHealthCustomFoodImportTemplate()}
                  value={foodImportText}
                />
                <div className="flex flex-wrap gap-2">
                  <AdhdChip contentClassName="gap-1.5" icon={<Copy aria-hidden="true" className="h-3 w-3" />} onClick={() => { void handleCopyFoodImportTemplate(); }}>
                    Copy Template
                  </AdhdChip>
                  <AdhdChip onClick={handleParseFoodImport} selected>
                    Preview Foods
                  </AdhdChip>
                  <AdhdChip onClick={() => { setFoodImportRows([]); setFoodImportText(""); setFoodImportStatus(""); }}>
                    Clear Import
                  </AdhdChip>
                </div>
                {foodImportStatus ? <p aria-live="polite" className="text-xs text-[#6d7894] dark:text-white/55">{foodImportStatus}</p> : null}
              </div>
              {foodImportReviews.length > 0 ? (
                <div className="mt-5 grid gap-4">
                  <div className="flex items-center gap-2 text-xs text-[#6d7894] dark:text-white/55">
                    <span className="min-w-0 flex-1 break-words">
                      Ready {foodImportReviews.filter((review) => review.selected && !review.duplicate && review.errors.length === 0).length} / {foodImportReviews.length}
                      {" · "}Duplicates {foodImportReviews.filter((review) => review.duplicate).length}
                      {" · "}Invalid {foodImportReviews.filter((review) => review.errors.length > 0).length}
                    </span>
                    <AdhdChip className="shrink-0" disabled={isSavingFoodImport} onClick={() => { void handleSaveFoodImport(); }} selected>
                      {isSavingFoodImport ? "Importing..." : "Confirm Import"}
                    </AdhdChip>
                  </div>
                  {foodImportReviews.map((review, index) => (
                    <div className="grid gap-3 rounded-[1rem] border border-[#e8e2f7] bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]" key={review.id}>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold text-[#26324f] dark:text-white">Food {index + 1}</p>
                          <p className="mt-1 break-words text-xs text-[#74809b] dark:text-white/45">Source line {review.lineStart}</p>
                        </div>
                        <label className="flex shrink-0 items-center gap-2 text-xs text-[#66718f] dark:text-white/60">
                          <input
                            checked={review.selected && !review.duplicate}
                            disabled={review.duplicate}
                            onChange={() => toggleFoodImportRow(review.id)}
                            type="checkbox"
                          />
                          Include
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {HEALTH_CUSTOM_FOOD_IMPORT_FIELDS.map((field) => (
                          <label className="grid gap-1.5" key={field.key}>
                            <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">{field.label}</span>
                            <input
                              className="health-input"
                              inputMode={field.inputMode}
                              onChange={(event) => updateFoodImportField(review.id, field.key, event.target.value)}
                              value={review.draft[field.key]}
                            />
                          </label>
                        ))}
                      </div>
                      {review.unknownFields.length > 0 ? <p className="text-xs text-[#a25b50] dark:text-[#ffb3a9]">Unknown fields were not mapped: {review.unknownFields.join(", ")}.</p> : null}
                      {review.warnings.length > 0 ? <p className="text-xs text-[#8a6a31] dark:text-[#e8c878]">{review.warnings.join(" ")}</p> : null}
                      {review.errors.length > 0 ? <p className="text-xs text-[#a25b50] dark:text-[#ffb3a9]">Invalid: {review.errors.join(" ")}</p> : null}
                      {review.duplicate ? <p className="text-xs text-[#8a6a31] dark:text-[#e8c878]">Likely duplicate. Change the editable fields to make a distinct food before including it.</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </HealthCollapsiblePanel>
          ) : null}
          <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="grid min-w-0 gap-4">
            <HealthCollapsiblePanel subtitle="Filter saved custom foods in this library." title="Search custom foods" variant="subpanel">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <HealthAutocomplete
                  ariaLabel="Search custom foods"
                  onChange={setFoodSearchQuery}
                  placeholder="Food, brand, category, serving, barcode"
                  suggestions={foodSearchSuggestions}
                  value={foodSearchQuery}
                />
                <AdhdChip
                  contentClassName="gap-1.5"
                  icon={<Search aria-hidden="true" className="h-3 w-3" />}
                  onClick={() => setFoodSearchQuery("")}
                  selected
                >
                  Clear
                </AdhdChip>
              </div>
              <p className="mt-3 text-xs text-[#7d7598] dark:text-white/55">
                Showing {filteredFoods.length} of {favorites.length} custom {favorites.length === 1 ? "food" : "foods"}.
              </p>
            </HealthCollapsiblePanel>
            <HealthCollapsiblePanel subtitle="Nutrition is stored per serving." title={foodDraft.id ? "Edit custom food" : "New custom food"} variant="subpanel">
              <div className="grid gap-3 sm:grid-cols-2">
                <LibraryField label="Food name">
                  <HealthAutocomplete
                    ariaLabel="Food name"
                    onChange={(value) => setFoodDraft((current) => ({ ...current, foodName: value }))}
                    suggestions={foodNameSuggestions}
                    value={foodDraft.foodName}
                  />
                </LibraryField>
                <LibraryField label="Brand">
                  <HealthAutocomplete
                    ariaLabel="Brand"
                    onChange={(value) => setFoodDraft((current) => ({ ...current, brandName: value }))}
                    suggestions={brandSuggestions}
                    value={foodDraft.brandName}
                  />
                </LibraryField>
                <LibraryField label="Barcode">
                  <div className="flex min-w-0 flex-wrap gap-2">
                    <input className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-0 flex-1`} inputMode="numeric" onChange={(event) => setFoodDraft((current) => ({ ...current, barcode: event.target.value }))} placeholder="012345678905" value={foodDraft.barcode} />
                    <AdhdChip contentClassName="gap-1.5" disabled={barcodeLookupStatus !== "idle"} icon={<Camera aria-hidden="true" className="h-3 w-3" />} onClick={() => setIsBarcodeScannerOpen(true)}>Scan</AdhdChip>
                    {hasFoodScanBaseline ? <AdhdChip contentClassName="gap-1.5" icon={<RotateCcw aria-hidden="true" className="h-3 w-3" />} onClick={clearFoodScan}>Clear</AdhdChip> : null}
                  </div>
                </LibraryField>
                <div className="sm:col-span-2">
                  <HealthBarcodeScanner isOpen={isBarcodeScannerOpen} onClose={() => setIsBarcodeScannerOpen(false)} onDetected={handleFoodBarcodeDetected} />
                  {barcodeLookupStatus !== "idle" ? <p className="text-xs text-[#73809c] dark:text-white/50" role="status">Looking up barcode...</p> : null}
                  {barcodeLookupMessage ? <p aria-live="polite" className="text-xs text-[#5f6c88] dark:text-white/60" role="status">{barcodeLookupMessage}</p> : null}
                </div>
                <LibraryField label="Food category">
                  <HealthAutocomplete
                    ariaLabel="Food category"
                    onChange={(value) => setFoodDraft((current) => ({ ...current, foodCategory: value }))}
                    suggestions={categorySuggestions}
                    value={foodDraft.foodCategory}
                  />
                </LibraryField>
                <LibraryField label="Serving quantity">
                  <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" min="0" onChange={(event) => setFoodDraft((current) => ({ ...current, servingQuantity: event.target.value }))} placeholder="55" value={foodDraft.servingQuantity} />
                </LibraryField>
                <LibraryField label="Serving unit">
                  <HealthAutocomplete
                    ariaLabel="Serving unit"
                    onChange={(value) => setFoodDraft((current) => ({ ...current, servingUnit: value }))}
                    suggestions={servingUnitSuggestions}
                    value={foodDraft.servingUnit}
                  />
                </LibraryField>
                <LibraryField label="Serving measure (optional)">
                  <span className="grid grid-cols-[1fr_auto] gap-2">
                    <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" min="0" onChange={(event) => setFoodDraft((current) => ({ ...current, servingMeasureValue: event.target.value }))} placeholder="30" value={foodDraft.servingMeasureValue} />
                    <HealthDropdown
                      ariaLabel="Serving measure"
                      className="min-w-28"
                      onChange={(value) => setFoodDraft((current) => ({ ...current, servingMeasureUnit: value as HealthServingMeasureUnit | "" }))}
                      options={[
                        { label: "No measure", value: "" },
                        { label: "g", value: "g" },
                        { label: "oz", value: "oz" },
                        { label: "mL", value: "ml" },
                        { label: "fl oz", value: "fl_oz" },
                      ]}
                      value={foodDraft.servingMeasureUnit}
                    />
                  </span>
                </LibraryField>
                <LibraryField label="Calories per serving">
                  <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="numeric" onChange={(event) => setFoodDraft((current) => ({ ...current, calories: event.target.value }))} value={foodDraft.calories} />
                </LibraryField>
                <LibraryField label="Protein (g)">
                  <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" onChange={(event) => setFoodDraft((current) => ({ ...current, protein: event.target.value }))} value={foodDraft.protein} />
                </LibraryField>
                <LibraryField label="Carbs (g)">
                  <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" onChange={(event) => setFoodDraft((current) => ({ ...current, carbs: event.target.value }))} value={foodDraft.carbs} />
                </LibraryField>
                <LibraryField label="Fat (g)">
                  <input className={HEALTH_COMPACT_INPUT_CLASS} inputMode="decimal" onChange={(event) => setFoodDraft((current) => ({ ...current, fat: event.target.value }))} value={foodDraft.fat} />
                </LibraryField>
              </div>
              <div className="mt-4 grid gap-3">
                <details className="rounded-[1rem] border border-[#e8e2f7] bg-white/70 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <summary className="cursor-pointer text-sm font-semibold text-[#595378] dark:text-white/75">Nutrition Details</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {HEALTH_NUTRITION_FIELD_REGISTRY.filter((field) => field.group !== "Vitamins & Minerals").map((field) => (
                      <LibraryField label={`${field.label} (${field.unit})`} key={field.key}>
                        <input
                          className={HEALTH_COMPACT_INPUT_CLASS}
                          inputMode="decimal"
                          onChange={(event) => setFoodDraft((current) => ({ ...current, nutritionDetails: { ...current.nutritionDetails, [field.key]: event.target.value } }))}
                          value={foodDraft.nutritionDetails[field.key]}
                        />
                      </LibraryField>
                    ))}
                  </div>
                </details>
                <details className="rounded-[1rem] border border-[#e8e2f7] bg-white/70 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <summary className="cursor-pointer text-sm font-semibold text-[#595378] dark:text-white/75">Vitamins &amp; Minerals</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {HEALTH_NUTRITION_FIELD_REGISTRY.filter((field) => field.group === "Vitamins & Minerals").map((field) => (
                      <LibraryField label={`${field.label} (${field.unit})`} key={field.key}>
                        <input
                          className={HEALTH_COMPACT_INPUT_CLASS}
                          inputMode="decimal"
                          onChange={(event) => setFoodDraft((current) => ({ ...current, nutritionDetails: { ...current.nutritionDetails, [field.key]: event.target.value } }))}
                          value={foodDraft.nutritionDetails[field.key]}
                        />
                      </LibraryField>
                    ))}
                  </div>
                </details>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <AdhdChip onClick={() => { void handleSaveFood(); }} selected>
                  Save food
                </AdhdChip>
                {foodDraft.id ? <AdhdChip onClick={resetFoodDraft}>Cancel</AdhdChip> : null}
              </div>
            </HealthCollapsiblePanel>
          </div>
          <div className="adhdice-scrollbar min-w-0 max-h-[36rem] overflow-y-auto pr-1">
            <LibraryCards empty={foodSearchQuery.trim() ? "No custom foods match this search." : "No custom foods yet."} items={filteredFoods.map((food) => (
              <AdhdCard key={food.id}>
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <LibraryCardHeader
                      detail={`${food.food_category || "Uncategorized"} / ${food.serving_label || "1 serving"} / ${food.calories} kcal`}
                      title={formatBrandedFoodName(food)}
                    />
                    <NutritionLine calories={food.calories} carbs={food.carbs_g} fat={food.fat_g} protein={food.protein_g} />
                  </div>
                  <div className="flex min-w-0 max-w-full flex-wrap justify-end gap-2">
                    <AdhdChip className="shrink-0" contentClassName="gap-1.5" icon={<Pencil aria-hidden="true" className="h-3 w-3" />} onClick={() => startEditingFood(food)}>Edit</AdhdChip>
                    <AdhdChip className="shrink-0" contentClassName="gap-1.5" icon={<Trash2 aria-hidden="true" className="h-3 w-3" />} onClick={() => { void deleteFood(food.id); }} tone="danger">Remove</AdhdChip>
                  </div>
                </div>
              </AdhdCard>
            ))} />
          </div>
        </div>
        </>
      ) : null}

      {section === "recipes" ? (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4">
            <HealthCollapsiblePanel subtitle="Add foods below, then set the batch yield." title={recipeDraft.id ? "Edit recipe" : "New recipe"} variant="subpanel">
              <div className="grid gap-3 sm:grid-cols-2">
                <LibraryField label="Recipe name">
                  <input className="health-input" onChange={(event) => setRecipeDraft((current) => ({ ...current, name: event.target.value }))} value={recipeDraft.name} />
                </LibraryField>
                <LibraryField label="Servings in batch">
                  <input className="health-input" inputMode="decimal" onChange={(event) => setRecipeDraft((current) => ({ ...current, servings: event.target.value }))} value={recipeDraft.servings} />
                </LibraryField>
                <div className="sm:col-span-2">
                  <LibraryField label="Notes or instructions">
                    <textarea className="health-input min-h-20 resize-y" onChange={(event) => setRecipeDraft((current) => ({ ...current, notes: event.target.value }))} value={recipeDraft.notes} />
                  </LibraryField>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {recipeDraft.ingredients.map((ingredient, index) => (
                  <IngredientRow
                    key={`${ingredient.food_id ?? ingredient.food_name}-${index}`}
                    name={ingredient.food_name}
                    onQuantity={(quantity) => setRecipeDraft((current) => ({
                      ...current,
                      ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, quantity } : item),
                    }))}
                    onRemove={() => setRecipeDraft((current) => ({ ...current, ingredients: current.ingredients.filter((_, itemIndex) => itemIndex !== index) }))}
                    quantity={ingredient.quantity}
                  />
                ))}
              </div>
              <NutritionLine {...recipePreview} />
              <div className="mt-4 flex flex-wrap gap-2">
                <AdhdChip onClick={() => { void handleSaveRecipe(); }} selected>Save recipe</AdhdChip>
                {recipeDraft.id ? <AdhdChip onClick={() => setRecipeDraft(EMPTY_RECIPE_DRAFT)}>Cancel</AdhdChip> : null}
              </div>
            </HealthCollapsiblePanel>
            <HealthCollapsiblePanel subtitle="Search by brand, food, or serving before adding an ingredient." title="Add ingredients" variant="subpanel">
              <input
                className={`${HEALTH_COMPACT_INPUT_CLASS} mb-3`}
                onChange={(event) => setIngredientSearchQuery(event.target.value)}
                placeholder="Search custom foods"
                value={ingredientSearchQuery}
              />
              <SourcePicker
              empty={ingredientSearchQuery.trim() ? "No custom foods match this ingredient search." : "Create a custom food first, then add it as an ingredient."}
              items={filteredIngredientFoods.map((food) => ({
                id: food.id,
                label: formatBrandedFoodName(food),
                onAdd: () => setRecipeDraft((current) => ({ ...current, ingredients: [...current.ingredients, buildRecipeIngredient(food, 1)] })),
              }))}
              />
            </HealthCollapsiblePanel>
          </div>
          <LibraryCards empty="No recipes yet." items={recipes.map((recipe) => {
            const nutrition = getRecipeNutritionPerServing(recipe);
            return (
              <AdhdCard key={recipe.id}>
                <LibraryCardHeader detail={`${formatQuantity(recipe.servings)} servings / ${recipe.ingredients.length} ingredients`} title={recipe.name} />
                <NutritionLine {...nutrition} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <AdhdChip contentClassName="gap-1.5" icon={<Pencil aria-hidden="true" className="h-3 w-3" />} onClick={() => setRecipeDraft({
                    id: recipe.id,
                    ingredients: recipe.ingredients,
                    name: recipe.name,
                    notes: recipe.notes,
                    servings: String(recipe.servings),
                  })}>Edit</AdhdChip>
                  <AdhdChip contentClassName="gap-1.5" icon={<Trash2 aria-hidden="true" className="h-3 w-3" />} onClick={() => { void deleteRecipe(recipe.id); }} tone="danger">Remove</AdhdChip>
                </div>
              </AdhdCard>
            );
          })} />
        </div>
      ) : null}

      {section === "meals" ? (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4">
            <HealthCollapsiblePanel subtitle="A meal can contain custom foods and recipe servings." title={mealDraft.id ? "Edit custom meal" : "New custom meal"} variant="subpanel">
              <LibraryField label="Meal name">
                <input className="health-input" onChange={(event) => setMealDraft((current) => ({ ...current, name: event.target.value }))} value={mealDraft.name} />
              </LibraryField>
              <div className="mt-3 flex flex-wrap gap-2">
                {HEALTH_MEAL_SLOTS.map((slot) => (
                  <AdhdChip key={slot} onClick={() => setMealDraft((current) => ({ ...current, mealSlot: slot }))} selected={mealDraft.mealSlot === slot}>
                    {getMealSlotLabel(slot)}
                  </AdhdChip>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {mealDraft.items.map((item, index) => (
                  <IngredientRow
                    key={`${item.source_type}-${item.source_id ?? item.name}-${index}`}
                    name={item.name}
                    onQuantity={(quantity) => setMealDraft((current) => ({
                      ...current,
                      items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity } : entry),
                    }))}
                    onRemove={() => setMealDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}
                    quantity={item.quantity}
                  />
                ))}
              </div>
              <NutritionLine {...mealPreview} />
              <div className="mt-4 flex flex-wrap gap-2">
                <AdhdChip onClick={() => { void handleSaveMeal(); }} selected>Save meal</AdhdChip>
                {mealDraft.id ? <AdhdChip onClick={() => setMealDraft(EMPTY_MEAL_DRAFT)}>Cancel</AdhdChip> : null}
              </div>
            </HealthCollapsiblePanel>
            <SourcePicker
              empty="Create a custom food or recipe first."
              items={[
                ...favorites.map((food) => ({
                  id: `food-${food.id}`,
                  label: formatBrandedFoodName(food),
                  onAdd: () => setMealDraft((current) => ({ ...current, items: [...current.items, buildSavedMealFoodItem(food, 1)] })),
                })),
                ...recipes.map((recipe) => ({
                  id: `recipe-${recipe.id}`,
                  label: `${recipe.name} (recipe)`,
                  onAdd: () => setMealDraft((current) => ({ ...current, items: [...current.items, buildSavedMealRecipeItem(recipe, 1)] })),
                })),
              ]}
              title="Add meal items"
            />
          </div>
          <LibraryCards empty="No custom meals yet." items={savedMeals.map((meal) => {
            const nutrition = getSavedMealNutrition(meal);
            return (
              <AdhdCard key={meal.id}>
                <LibraryCardHeader detail={`${getMealSlotLabel(meal.default_meal_slot)} / ${meal.items.length} items`} title={meal.name} />
                <NutritionLine {...nutrition} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <AdhdChip contentClassName="gap-1.5" icon={<Pencil aria-hidden="true" className="h-3 w-3" />} onClick={() => setMealDraft({
                    id: meal.id,
                    items: meal.items,
                    mealSlot: meal.default_meal_slot,
                    name: meal.name,
                  })}>Edit</AdhdChip>
                  <AdhdChip contentClassName="gap-1.5" icon={<Trash2 aria-hidden="true" className="h-3 w-3" />} onClick={() => { void deleteSavedMeal(meal.id); }} tone="danger">Remove</AdhdChip>
                </div>
              </AdhdCard>
            );
          })} />
        </div>
      ) : null}
    </HealthCollapsiblePanel>
  );
}

function reviewFoodImportRows(rows: FoodImportRow[], favorites: HealthFoodLibraryItem[]): FoodImportReview[] {
  const existingIdentities = new Set(
    favorites.map((food) => getHealthFoodIdentityKey(food)).filter((identity): identity is string => Boolean(identity)),
  );
  const selectedIdentities = new Set<string>();

  return rows.map((row) => {
    const validation = validateHealthCustomFoodImportDraft(row.draft);
    const identity = getHealthCustomFoodImportIdentityKey(row.draft);
    const duplicate = Boolean(identity && (existingIdentities.has(identity) || selectedIdentities.has(identity)));
    if (row.selected && !duplicate && validation.input && identity) {
      selectedIdentities.add(identity);
    }
    return {
      ...row,
      duplicate,
      errors: validation.errors,
      input: validation.input,
    };
  });
}

function SourcePicker({ empty, items, title }: { empty: string; items: Array<{ id: string; label: string; onAdd: () => void }>; title?: string }) {
  const content = items.length === 0 ? <p className="text-sm text-[#7d7598] dark:text-white/55">{empty}</p> : (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <AdhdChip contentClassName="gap-1.5" icon={<Plus aria-hidden="true" className="h-3 w-3" />} key={item.id} onClick={item.onAdd}>
          {item.label}
        </AdhdChip>
      ))}
    </div>
  );

  if (!title) {
    return content;
  }
  return (
    <HealthCollapsiblePanel title={title} variant="subpanel">
      {content}
    </HealthCollapsiblePanel>
  );
}

function IngredientRow({ name, onQuantity, onRemove, quantity }: { name: string; onQuantity: (quantity: number) => void; onRemove: () => void; quantity: number }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-[1rem] border border-[#efe9ff] bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
      <span className="min-w-0 flex-1 break-words text-sm font-medium text-[#595378] dark:text-white/68">{name}</span>
      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-2 text-xs text-[#7d7598] dark:text-white/55">
          Servings
          <input className="health-input w-20" inputMode="decimal" min="0.01" onChange={(event) => onQuantity(parsePositive(event.target.value))} type="number" value={quantity} />
        </label>
        <AdhdChip onClick={onRemove} tone="danger">Remove</AdhdChip>
      </div>
    </div>
  );
}

function LibraryCards({ empty, items }: { empty: string; items: ReactNode[] }) {
  return items.length === 0
    ? <AdhdPanel variant="subpanel"><p className="text-sm text-[#7d7598] dark:text-white/55">{empty}</p></AdhdPanel>
    : <div className="grid content-start gap-3 sm:grid-cols-2">{items}</div>;
}

function LibraryField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">{label}</span>
      {children}
    </label>
  );
}

function LibraryCardHeader({ detail, title }: { detail: string; title: string }) {
  return (
    <div>
      <p className="break-words text-sm font-semibold text-[#26324f] dark:text-white">{title}</p>
      <p className="mt-1 break-words text-xs text-[#74809b] dark:text-white/45">{detail}</p>
    </div>
  );
}

function formatBrandedFoodName(food: Pick<HealthFoodLibraryItem, "brand_name" | "food_name">) {
  return food.brand_name?.trim()
    ? `${food.brand_name.trim()} · ${food.food_name}`
    : food.food_name;
}

function NutritionLine({ calories, protein, carbs, fat }: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) {
  return (
    <p className="mt-2 text-xs text-[#6d7a96] dark:text-white/50">
      {formatNutritionValue(calories)} kcal / Protein {formatNutritionValue(protein)}g / Carbs {formatNutritionValue(carbs)}g / Fat {formatNutritionValue(fat)}g
    </p>
  );
}

function formatNutritionValue(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "—";
}

function foodToDraft(food: HealthFoodLibraryItem): FoodDraft {
  const servingMeasureUnit = food.serving_measure_unit ?? "";
  const nutritionDetails = normalizeHealthNutritionDetails(food.nutrition_details);
  return {
    id: food.id,
    barcode: food.barcode ?? "",
    brandName: food.brand_name ?? "",
    calories: String(food.calories),
    foodCategory: food.food_category ?? "Uncategorized",
    carbs: food.carbs_g === null ? "" : String(food.carbs_g),
    fat: food.fat_g === null ? "" : String(food.fat_g),
    foodName: food.food_name,
    protein: food.protein_g === null ? "" : String(food.protein_g),
    servingQuantity: String(food.serving_quantity > 0 ? food.serving_quantity : 1),
    servingUnit: food.serving_unit || "serving",
    servingMeasureValue: food.serving_measure_value == null ? "" : String(food.serving_measure_value),
    servingMeasureUnit: servingMeasureUnit,
    nutritionDetails: Object.fromEntries(HEALTH_NUTRITION_FIELD_REGISTRY.map((field) => [field.key, typeof nutritionDetails?.[field.key] === "number" ? String(nutritionDetails[field.key]) : ""])) as Record<HealthNutritionDetailKey, string>,
  };
}

function cloneFoodDraft(draft: FoodDraft): FoodDraft {
  return {
    ...draft,
    nutritionDetails: { ...draft.nutritionDetails },
  };
}

function mergeFoodDraftWithBarcodeResult(draft: FoodDraft, result: HealthFoodLookupResult, scannedBarcode: string): FoodDraft {
  const parsedServing = parseBarcodeServingLabel(result.servingLabel);
  const serving = {
    quantity: result.servingQuantity > 0 ? String(result.servingQuantity) : parsedServing.quantity,
    unit: result.servingUnit || parsedServing.unit,
    measureValue: result.servingMeasureValue === null ? parsedServing.measureValue : String(result.servingMeasureValue),
    measureUnit: result.servingMeasureUnit ?? parsedServing.measureUnit,
  };
  const hasEditedServing = draft.servingQuantity.trim() !== "1"
    || draft.servingUnit.trim() !== "serving"
    || draft.servingMeasureValue.trim().length > 0
    || draft.servingMeasureUnit.length > 0;
  return {
    ...draft,
    barcode: result.barcode ?? scannedBarcode,
    brandName: draft.brandName.trim() ? draft.brandName : result.brandName ?? "",
    calories: draft.calories.trim() ? draft.calories : result.calories === null ? "" : String(result.calories),
    carbs: draft.carbs.trim() ? draft.carbs : result.carbs === null ? "" : String(result.carbs),
    foodCategory: draft.foodCategory.trim() ? draft.foodCategory : result.foodCategory ?? "",
    foodName: draft.foodName.trim() ? draft.foodName : result.foodName,
    fat: draft.fat.trim() ? draft.fat : result.fat === null ? "" : String(result.fat),
    protein: draft.protein.trim() ? draft.protein : result.protein === null ? "" : String(result.protein),
    servingQuantity: hasEditedServing ? draft.servingQuantity : serving.quantity,
    servingUnit: hasEditedServing ? draft.servingUnit : serving.unit,
    servingMeasureValue: hasEditedServing ? draft.servingMeasureValue : serving.measureValue,
    servingMeasureUnit: hasEditedServing ? draft.servingMeasureUnit : serving.measureUnit,
    nutritionDetails: Object.fromEntries(HEALTH_NUTRITION_FIELD_REGISTRY.map((field) => {
      const existing = draft.nutritionDetails[field.key]?.trim() ?? "";
      const incoming = result.nutritionDetails?.[field.key];
      return [field.key, existing || (typeof incoming === "number" ? String(incoming) : "")];
    })) as Record<HealthNutritionDetailKey, string>,
  };
}

function parseBarcodeServingLabel(label: string | null) {
  const servingMatch = /^\s*(\d+(?:\.\d+)?)\s*([a-z][a-z-]*)?/i.exec(label ?? "");
  const servingUnit = servingMatch?.[2]?.toLowerCase();
  const measureMatch = /(\d+(?:\.\d+)?)\s*(fl\s*oz|g|oz|ml)\b/i.exec(label ?? "");
  const normalizedMeasureUnit = measureMatch?.[2]?.toLowerCase().replace(/\s+/g, "_");
  const measureUnit: HealthServingMeasureUnit | "" = normalizedMeasureUnit === "g"
    || normalizedMeasureUnit === "oz"
    || normalizedMeasureUnit === "ml"
    || normalizedMeasureUnit === "fl_oz"
    ? normalizedMeasureUnit
    : "";
  const isMeasureServingUnit = servingUnit === "g" || servingUnit === "oz" || servingUnit === "ml" || servingUnit === "fl";
  return {
    quantity: servingMatch?.[1] ?? "1",
    unit: isMeasureServingUnit || !servingUnit ? "serving" : servingUnit.replace(/s$/, ""),
    measureValue: measureMatch?.[1] ?? "",
    measureUnit: measureUnit ?? "",
  };
}

function parsePositive(value: string | number) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function nullableNumber(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nullablePositiveNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

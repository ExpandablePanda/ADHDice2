"use client";

import { Copy, FileUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

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
  getRecipeNutritionPerServing,
  getSavedMealNutrition,
  searchHealthFoodLibrary,
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
import { HealthCollapsiblePanel } from "./health-collapsible-panel";

type LibrarySection = "foods" | "recipes" | "meals";

type FoodDraft = {
  id?: string;
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
};

const EMPTY_FOOD_DRAFT: FoodDraft = {
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
  const [isFoodImportOpen, setIsFoodImportOpen] = useState(false);
  const [isSavingFoodImport, setIsSavingFoodImport] = useState(false);
  const [ingredientSearchQuery, setIngredientSearchQuery] = useState("");
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>(EMPTY_RECIPE_DRAFT);
  const [mealDraft, setMealDraft] = useState<MealDraft>(EMPTY_MEAL_DRAFT);

  const filteredFoods = useMemo(
    () => searchHealthFoodLibrary(favorites, foodSearchQuery),
    [favorites, foodSearchQuery],
  );
  const categorySuggestions = useMemo(
    () => [...new Set(favorites.map((food) => food.food_category?.trim() || food.category?.trim()).filter((category): category is string => Boolean(category)))]
      .sort((left, right) => left.localeCompare(right)),
    [favorites],
  );
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

  async function handleSaveFood() {
    const calories = Number.parseInt(foodDraft.calories, 10);
    const servingQuantity = nullablePositiveNumber(foodDraft.servingQuantity);
    const servingMeasureValue = nullablePositiveNumber(foodDraft.servingMeasureValue);
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
    });
    if (saved) {
      setFoodDraft(EMPTY_FOOD_DRAFT);
    }
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
      className="xl:col-span-2"
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
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6d7894] dark:text-white/55">
                    <span>
                      Ready {foodImportReviews.filter((review) => review.selected && !review.duplicate && review.errors.length === 0).length} / {foodImportReviews.length}
                      {" · "}Duplicates {foodImportReviews.filter((review) => review.duplicate).length}
                      {" · "}Invalid {foodImportReviews.filter((review) => review.errors.length > 0).length}
                    </span>
                    <AdhdChip disabled={isSavingFoodImport} onClick={() => { void handleSaveFoodImport(); }} selected>
                      {isSavingFoodImport ? "Importing..." : "Confirm Import"}
                    </AdhdChip>
                  </div>
                  {foodImportReviews.map((review, index) => (
                    <div className="grid gap-3 rounded-[1rem] border border-[#e8e2f7] bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]" key={review.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#26324f] dark:text-white">Food {index + 1}</p>
                          <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">Source line {review.lineStart}</p>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-[#66718f] dark:text-white/60">
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
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4">
            <HealthCollapsiblePanel subtitle="Filter saved custom foods in this library." title="Search custom foods" variant="subpanel">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  className="health-input"
                  onChange={(event) => setFoodSearchQuery(event.target.value)}
                  placeholder="Food, brand, category, serving, barcode"
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
                  <input className="health-input" onChange={(event) => setFoodDraft((current) => ({ ...current, foodName: event.target.value }))} value={foodDraft.foodName} />
                </LibraryField>
                <LibraryField label="Brand">
                  <input className="health-input" onChange={(event) => setFoodDraft((current) => ({ ...current, brandName: event.target.value }))} value={foodDraft.brandName} />
                </LibraryField>
                <LibraryField label="Food category">
                  <input
                    className="health-input"
                    onChange={(event) => setFoodDraft((current) => ({ ...current, foodCategory: event.target.value }))}
                    placeholder="Protein, Produce, Snack"
                    value={foodDraft.foodCategory}
                  />
                </LibraryField>
                <LibraryField label="Serving quantity">
                  <input className="health-input" inputMode="decimal" min="0" onChange={(event) => setFoodDraft((current) => ({ ...current, servingQuantity: event.target.value }))} placeholder="55" value={foodDraft.servingQuantity} />
                </LibraryField>
                <LibraryField label="Serving unit">
                  <input className="health-input" onChange={(event) => setFoodDraft((current) => ({ ...current, servingUnit: event.target.value }))} placeholder="cracker, slice, serving" value={foodDraft.servingUnit} />
                </LibraryField>
                <LibraryField label="Serving measure (optional)">
                  <span className="grid grid-cols-[1fr_auto] gap-2">
                    <input className="health-input" inputMode="decimal" min="0" onChange={(event) => setFoodDraft((current) => ({ ...current, servingMeasureValue: event.target.value }))} placeholder="30" value={foodDraft.servingMeasureValue} />
                    <select className="health-input min-w-28" onChange={(event) => setFoodDraft((current) => ({ ...current, servingMeasureUnit: event.target.value as HealthServingMeasureUnit | "" }))} value={foodDraft.servingMeasureUnit}>
                      <option value="">No measure</option>
                      <optgroup label="Mass">
                        <option value="g">g</option>
                        <option value="oz">oz</option>
                      </optgroup>
                      <optgroup label="Volume">
                        <option value="ml">mL</option>
                        <option value="fl_oz">fl oz</option>
                      </optgroup>
                    </select>
                  </span>
                </LibraryField>
                <LibraryField label="Calories per serving">
                  <input className="health-input" inputMode="numeric" onChange={(event) => setFoodDraft((current) => ({ ...current, calories: event.target.value }))} value={foodDraft.calories} />
                </LibraryField>
                <LibraryField label="Protein (g)">
                  <input className="health-input" inputMode="decimal" onChange={(event) => setFoodDraft((current) => ({ ...current, protein: event.target.value }))} value={foodDraft.protein} />
                </LibraryField>
                <LibraryField label="Carbs (g)">
                  <input className="health-input" inputMode="decimal" onChange={(event) => setFoodDraft((current) => ({ ...current, carbs: event.target.value }))} value={foodDraft.carbs} />
                </LibraryField>
                <LibraryField label="Fat (g)">
                  <input className="health-input" inputMode="decimal" onChange={(event) => setFoodDraft((current) => ({ ...current, fat: event.target.value }))} value={foodDraft.fat} />
                </LibraryField>
              </div>
              {categorySuggestions.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Previously used food categories">
                  {categorySuggestions.slice(0, 8).map((category) => (
                    <AdhdChip key={category} onClick={() => setFoodDraft((current) => ({ ...current, foodCategory: category }))}>
                      {category}
                    </AdhdChip>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <AdhdChip onClick={() => { void handleSaveFood(); }} selected>
                  Save food
                </AdhdChip>
                {foodDraft.id ? <AdhdChip onClick={() => setFoodDraft(EMPTY_FOOD_DRAFT)}>Cancel</AdhdChip> : null}
              </div>
            </HealthCollapsiblePanel>
          </div>
          <LibraryCards empty={foodSearchQuery.trim() ? "No custom foods match this search." : "No custom foods yet."} items={filteredFoods.map((food) => (
            <AdhdCard key={food.id}>
              <LibraryCardHeader
                detail={`${food.food_category || food.category || "Uncategorized"} / ${food.serving_label || "1 serving"} / ${food.calories} kcal`}
                title={formatBrandedFoodName(food)}
              />
              <NutritionLine calories={food.calories} carbs={food.carbs_g ?? 0} fat={food.fat_g ?? 0} protein={food.protein_g ?? 0} />
              <div className="mt-3 flex flex-wrap gap-2">
                <AdhdChip contentClassName="gap-1.5" icon={<Pencil aria-hidden="true" className="h-3 w-3" />} onClick={() => setFoodDraft(foodToDraft(food))}>Edit</AdhdChip>
                <AdhdChip contentClassName="gap-1.5" icon={<Trash2 aria-hidden="true" className="h-3 w-3" />} onClick={() => { void deleteFood(food.id); }} tone="danger">Remove</AdhdChip>
              </div>
            </AdhdCard>
          ))} />
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
                className="health-input mb-3"
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-[#efe9ff] bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
      <span className="text-sm font-medium text-[#595378] dark:text-white/68">{name}</span>
      <div className="flex items-center gap-2">
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
      <p className="text-sm font-semibold text-[#26324f] dark:text-white">{title}</p>
      <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">{detail}</p>
    </div>
  );
}

function formatBrandedFoodName(food: Pick<HealthFoodLibraryItem, "brand_name" | "food_name">) {
  return food.brand_name?.trim()
    ? `${food.brand_name.trim()} · ${food.food_name}`
    : food.food_name;
}

function NutritionLine({ calories, protein, carbs, fat }: { calories: number; protein: number; carbs: number; fat: number }) {
  return (
    <p className="mt-2 text-xs text-[#6d7a96] dark:text-white/50">
      {Math.round(calories)} kcal / Protein {Math.round(protein)}g / Carbs {Math.round(carbs)}g / Fat {Math.round(fat)}g
    </p>
  );
}

function foodToDraft(food: HealthFoodLibraryItem): FoodDraft {
  const servingMeasureUnit = food.serving_measure_unit ?? "";
  return {
    id: food.id,
    brandName: food.brand_name ?? "",
    calories: String(food.calories),
    foodCategory: food.food_category ?? food.category ?? "Uncategorized",
    carbs: food.carbs_g === null ? "" : String(food.carbs_g),
    fat: food.fat_g === null ? "" : String(food.fat_g),
    foodName: food.food_name,
    protein: food.protein_g === null ? "" : String(food.protein_g),
    servingQuantity: String(food.serving_quantity > 0 ? food.serving_quantity : 1),
    servingUnit: food.serving_unit || "serving",
    servingMeasureValue: food.serving_measure_value == null ? "" : String(food.serving_measure_value),
    servingMeasureUnit: servingMeasureUnit,
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

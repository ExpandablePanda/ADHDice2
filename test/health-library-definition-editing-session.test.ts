import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { HealthFoodLibraryItem, HealthRecipe, HealthSavedMeal } from "../src/lib/database.types.ts";
import { createEditingSessionStore } from "../src/lib/editing-session-store.ts";
import {
  appendHealthRecipeIngredient,
  appendHealthSavedMealFoodItem,
  appendHealthSavedMealRecipeItem,
  areHealthRecipeEditingSessionDraftsEqual,
  areHealthSavedMealEditingSessionDraftsEqual,
  createHealthRecipeNewDraft,
  createHealthRecipeSavedDraft,
  createHealthSavedMealNewDraft,
  createHealthSavedMealSavedDraft,
  deleteHealthRecipeDefinitionWithSession,
  deleteHealthSavedMealDefinitionWithSession,
  healthRecipeNewCanonicalId,
  healthRecipeNewSessionId,
  healthRecipeSavedSessionId,
  healthRecipeWriteMatchesCanonicalRow,
  healthSavedMealNewCanonicalId,
  healthSavedMealNewSessionId,
  healthSavedMealSavedSessionId,
  healthSavedMealWriteMatchesCanonicalRow,
  getHealthRecipeDefinitionDraftValidationMessage,
  getHealthSavedMealDefinitionDraftValidationMessage,
  removeHealthRecipeIngredient,
  removeHealthSavedMealItem,
  reconcileHealthRecipeCollection,
  reconcileHealthSavedMealCollection,
  saveHealthRecipeEditingSession,
  saveHealthSavedMealEditingSession,
  updateHealthRecipeIngredientQuantity,
  updateHealthSavedMealItemQuantity,
  type HealthRecipeEditingSessionDraft,
  type HealthSavedMealEditingSessionDraft,
} from "../src/lib/health-library-definition-editing-session.ts";
import { buildRecipeIngredient, buildSavedMealFoodItem, getRecipeNutritionPerServing, getSavedMealNutrition } from "../src/lib/health-library.ts";
import {
  createDefaultMasterFoodWorkspaceView,
  createDefaultMasterWorkspaceState,
  createMasterTab,
  getMasterTabFoodView,
} from "../src/lib/master-workspace-state.ts";

function food(id: string, name: string, calories: number): HealthFoodLibraryItem {
  return {
    attribution: null,
    barcode: null,
    brand_name: null,
    calories,
    category: "Food",
    food_category: "Food",
    carbs_g: calories / 10,
    created_at: "2026-10-11T12:00:00.000Z",
    fat_g: calories / 40,
    food_name: name,
    id,
    is_favorite: true,
    nutrition_details: { sodium_mg: calories / 2, dietary_fiber_g: 2 },
    protein_g: calories / 20,
    provider: "manual",
    provider_item_id: null,
    serving_label: "1 serving",
    serving_size: "1 serving",
    serving_quantity: 1,
    serving_unit: "serving",
    serving_measure_value: null,
    serving_measure_unit: null,
    serving_weight_amount: null,
    serving_weight_unit: null,
    updated_at: "2026-10-11T12:00:00.000Z",
    user_id: "user-1",
  };
}

function recipe(id: string, name = "Oat bowl", updatedAt = "2026-10-11T12:00:00.000Z"): HealthRecipe {
  return {
    created_at: "2026-10-10T12:00:00.000Z",
    id,
    ingredients: [buildRecipeIngredient(food("food-oats", "Oats", 200), 1)],
    name,
    notes: "Mix gently",
    servings: 2,
    updated_at: updatedAt,
    user_id: "user-1",
  };
}

function meal(id: string, name = "Morning set", updatedAt = "2026-10-11T12:00:00.000Z"): HealthSavedMeal {
  return {
    created_at: "2026-10-10T12:00:00.000Z",
    default_meal_slot: "breakfast",
    id,
    items: [buildSavedMealFoodItem(food("food-oats", "Oats", 200), 1)],
    name,
    updated_at: updatedAt,
    user_id: "user-1",
  };
}

function recipeStore() {
  return createEditingSessionStore<HealthRecipeEditingSessionDraft>("user-1", areHealthRecipeEditingSessionDraftsEqual);
}

function savedMealStore() {
  return createEditingSessionStore<HealthSavedMealEditingSessionDraft>("user-1", areHealthSavedMealEditingSessionDraftsEqual);
}

test("each Master Tab has separate stable Recipe and Saved Meal draft IDs and namespaces", () => {
  const first = createDefaultMasterFoodWorkspaceView();
  const state = createMasterTab(createDefaultMasterWorkspaceState(), "master-panel-1", {
    id: "master-tab-second",
    destination: { kind: "page", page: "Health" },
    presentation: { healthSection: "Food" },
  }, false);
  const second = getMasterTabFoodView(state.panels[0].tabs.find((tab) => tab.id === "master-tab-second")!);
  const firstRecipeSession = healthRecipeNewSessionId("master-tab-1", first.newRecipeDraftId);
  const secondRecipeSession = healthRecipeNewSessionId("master-tab-second", second.newRecipeDraftId);
  const firstMealSession = healthSavedMealNewSessionId("master-tab-1", first.newSavedMealDraftId);

  assert.notEqual(first.newRecipeDraftId, second.newRecipeDraftId);
  assert.notEqual(first.newSavedMealDraftId, second.newSavedMealDraftId);
  assert.notEqual(first.newRecipeDraftId, first.newSavedMealDraftId);
  assert.notEqual(first.newRecipeDraftId, first.newCustomFoodDraftId);
  assert.notEqual(first.newRecipeDraftId, first.newMealDraftId);
  assert.notEqual(first.newRecipeDraftId, first.newPlannedMealDraftId);
  assert.notEqual(firstRecipeSession, secondRecipeSession);
  assert.notEqual(firstRecipeSession, firstMealSession);
  assert.notEqual(healthRecipeSavedSessionId("definition-1"), healthSavedMealSavedSessionId("definition-1"));
  assert.equal(createDefaultMasterFoodWorkspaceView().recipeEditorMode, "new");
});

test("saved Recipe edits are shared by canonical ID and different recipes remain independent", () => {
  const store = recipeStore();
  const original = recipe("recipe-a");
  const other = recipe("recipe-b", "Rice bowl");
  const sessionId = healthRecipeSavedSessionId(original.id);
  store.ensureSession(sessionId, sessionId, createHealthRecipeSavedDraft(original));
  store.attachView(sessionId, "tab-a");
  store.ensureSession(sessionId, sessionId, createHealthRecipeSavedDraft(original));
  store.attachView(sessionId, "tab-b");
  const otherId = healthRecipeSavedSessionId(other.id);
  store.ensureSession(otherId, otherId, createHealthRecipeSavedDraft(other));

  store.updateDraft(sessionId, (current) => ({ ...current, notes: "Updated note", servings: "4" }));
  store.updateDraft(otherId, (current) => ({ ...current, name: "Other recipe" }));

  assert.equal(store.getSnapshot(sessionId)?.draft.notes, "Updated note");
  assert.equal(store.getSnapshot(sessionId)?.draft.servings, "4");
  assert.deepEqual(store.getSnapshot(sessionId)?.viewIds, ["tab-a", "tab-b"]);
  assert.equal(store.getSnapshot(otherId)?.draft.name, "Other recipe");
  assert.equal(store.getSnapshot(sessionId)?.canonicalRecordId, sessionId);
});

test("leaving and reopening a dirty definition keeps its session and tab close protection", () => {
  const recipes = recipeStore();
  const savedRecipe = recipe("recipe-navigation");
  const recipeSessionId = healthRecipeSavedSessionId(savedRecipe.id);
  recipes.ensureSession(recipeSessionId, recipeSessionId, createHealthRecipeSavedDraft(savedRecipe));
  recipes.attachView(recipeSessionId, "tab-a");
  recipes.updateDraft(recipeSessionId, (current) => ({ ...current, notes: "Kept across navigation" }));
  const otherRecipe = recipe("recipe-other", "Other");
  const otherRecipeSessionId = healthRecipeSavedSessionId(otherRecipe.id);
  recipes.ensureSession(otherRecipeSessionId, otherRecipeSessionId, createHealthRecipeSavedDraft(otherRecipe));
  recipes.attachView(otherRecipeSessionId, "tab-a");
  recipes.ensureSession(recipeSessionId, recipeSessionId, createHealthRecipeSavedDraft(savedRecipe));

  const meals = savedMealStore();
  const savedMeal = meal("meal-navigation");
  const mealSessionId = healthSavedMealSavedSessionId(savedMeal.id);
  meals.ensureSession(mealSessionId, mealSessionId, createHealthSavedMealSavedDraft(savedMeal));
  meals.attachView(mealSessionId, "tab-a");
  meals.updateDraft(mealSessionId, (current) => ({ ...current, name: "Kept across navigation" }));
  meals.ensureSession(healthSavedMealSavedSessionId("meal-other"), healthSavedMealSavedSessionId("meal-other"), createHealthSavedMealSavedDraft(meal("meal-other")));
  meals.attachView(healthSavedMealSavedSessionId("meal-other"), "tab-a");
  meals.ensureSession(mealSessionId, mealSessionId, createHealthSavedMealSavedDraft(savedMeal));

  assert.equal(recipes.getSnapshot(recipeSessionId)?.draft.notes, "Kept across navigation");
  assert.equal(recipes.getSnapshot(recipeSessionId)?.dirty, true);
  assert.equal(recipes.canCloseView("tab-a"), false);
  assert.equal(meals.getSnapshot(mealSessionId)?.draft.name, "Kept across navigation");
  assert.equal(meals.getSnapshot(mealSessionId)?.dirty, true);
  assert.equal(meals.canCloseView("tab-a"), false);
});

test("Recipe ingredient add, quantity, and remove updates compose from the latest shared draft", () => {
  const store = recipeStore();
  const stableId = "new-recipe-record";
  const sessionId = healthRecipeNewSessionId("tab-a", stableId);
  store.ensureSession(sessionId, healthRecipeNewCanonicalId("tab-a", stableId), createHealthRecipeNewDraft(stableId));
  store.attachView(sessionId, "tab-a");
  store.attachView(sessionId, "tab-b");
  const oats = food("food-oats", "Oats", 200);
  const berries = food("food-berries", "Berries", 80);

  store.updateDraft(sessionId, (current) => appendHealthRecipeIngredient(current, oats));
  store.updateDraft(sessionId, (current) => appendHealthRecipeIngredient(current, berries));
  store.updateDraft(sessionId, (current) => updateHealthRecipeIngredientQuantity({ ...current, name: "Breakfast", notes: "Shared notes", servings: "2" }, 0, 3));
  store.updateDraft(sessionId, (current) => removeHealthRecipeIngredient(current, 1));
  const draft = store.getSnapshot(sessionId)!.draft;

  assert.equal(draft.name, "Breakfast");
  assert.equal(draft.notes, "Shared notes");
  assert.equal(draft.ingredients.length, 1);
  assert.equal(draft.ingredients[0].food_id, oats.id);
  assert.equal(draft.ingredients[0].quantity, 3);
  assert.equal(draft.ingredients[0].calories, 200);
  assert.equal(getRecipeNutritionPerServing({ ingredients: draft.ingredients, servings: 2 }).calories, 300);
});

test("new Recipe and Saved Meal drafts remain independent and can be discarded per tab", () => {
  const recipes = recipeStore();
  const meals = savedMealStore();
  const recipeAId = "recipe-draft-tab-a";
  const recipeBId = "recipe-draft-tab-b";
  const mealAId = "meal-draft-tab-a";
  const recipeA = healthRecipeNewSessionId("tab-a", recipeAId);
  const recipeB = healthRecipeNewSessionId("tab-b", recipeBId);
  const mealA = healthSavedMealNewSessionId("tab-a", mealAId);
  recipes.ensureSession(recipeA, healthRecipeNewCanonicalId("tab-a", recipeAId), createHealthRecipeNewDraft(recipeAId));
  recipes.ensureSession(recipeB, healthRecipeNewCanonicalId("tab-b", recipeBId), createHealthRecipeNewDraft(recipeBId));
  meals.ensureSession(mealA, healthSavedMealNewCanonicalId("tab-a", mealAId), createHealthSavedMealNewDraft(mealAId));

  recipes.updateDraft(recipeA, (current) => ({ ...current, name: "Tab A recipe" }));
  recipes.updateDraft(recipeB, (current) => ({ ...current, name: "Tab B recipe" }));
  meals.updateDraft(mealA, (current) => ({ ...current, name: "Tab A meal" }));
  recipes.discardDraft(recipeA, createHealthRecipeNewDraft(recipeAId));

  assert.equal(recipes.getSnapshot(recipeA)?.draft.name, "");
  assert.equal(recipes.getSnapshot(recipeB)?.draft.name, "Tab B recipe");
  assert.equal(meals.getSnapshot(mealA)?.draft.name, "Tab A meal");
  assert.equal(recipes.getSnapshot(recipeA)?.draft.newRecordId, recipeAId);
  assert.equal(recipes.getSnapshot(recipeB)?.dirty, true);
});

test("Recipe and Saved Meal validation reports missing content without changing either draft", () => {
  const recipeDraft = { ...createHealthRecipeNewDraft("recipe-validation"), name: "Incomplete recipe" };
  const mealDraft = { ...createHealthSavedMealNewDraft("meal-validation"), name: "Incomplete meal" };
  const beforeRecipe = structuredClone(recipeDraft);
  const beforeMeal = structuredClone(mealDraft);

  assert.equal(getHealthRecipeDefinitionDraftValidationMessage(recipeDraft), "Add a recipe name and at least one ingredient before saving.");
  assert.equal(getHealthSavedMealDefinitionDraftValidationMessage(mealDraft), "Add a saved meal name and at least one item before saving.");
  assert.deepEqual(recipeDraft, beforeRecipe);
  assert.deepEqual(mealDraft, beforeMeal);
  assert.equal(getHealthRecipeDefinitionDraftValidationMessage({ ...recipeDraft, ingredients: [buildRecipeIngredient(food("food-oats", "Oats", 200), 1)] }), null);
  assert.equal(getHealthSavedMealDefinitionDraftValidationMessage({ ...mealDraft, items: [buildSavedMealFoodItem(food("food-oats", "Oats", 200), 1)] }), null);
});

test("saved Saved Meal sessions share edits while retaining mixed item order and snapshot nutrition", () => {
  const store = savedMealStore();
  const originalRecipe = recipe("recipe-a");
  const original = meal("meal-a");
  const initial = createHealthSavedMealSavedDraft({
    ...original,
    items: [
      ...original.items,
      { ...buildSavedMealRecipeItemForTest(originalRecipe), quantity: 2 },
    ],
  });
  const sessionId = healthSavedMealSavedSessionId(original.id);
  store.ensureSession(sessionId, sessionId, initial);
  store.attachView(sessionId, "tab-a");
  store.ensureSession(sessionId, sessionId, initial);
  store.attachView(sessionId, "tab-b");
  const otherId = healthSavedMealSavedSessionId("meal-b");
  store.ensureSession(otherId, otherId, createHealthSavedMealSavedDraft(meal("meal-b", "Other meal")));

  store.updateDraft(sessionId, (current) => ({ ...current, name: "Shared meal", mealSlot: "lunch" }));
  store.updateDraft(sessionId, (current) => updateHealthSavedMealItemQuantity(current, 1, 3));
  store.updateDraft(otherId, (current) => ({ ...current, name: "Independent meal" }));
  const draft = store.getSnapshot(sessionId)!.draft;
  const updatedSourceRecipe = {
    ...originalRecipe,
    ingredients: originalRecipe.ingredients.map((ingredient) => ({ ...ingredient, calories: 900 })),
  };

  assert.equal(draft.name, "Shared meal");
  assert.equal(draft.mealSlot, "lunch");
  assert.deepEqual(draft.items.map((item) => item.source_type), ["food", "recipe"]);
  assert.equal(draft.items[1].source_id, originalRecipe.id);
  assert.equal(draft.items[1].quantity, 3);
  assert.equal(draft.items[1].calories, 100);
  assert.equal(updatedSourceRecipe.ingredients[0].calories, 900);
  assert.equal(draft.items[1].calories, 100, "saved meal nutrition remains its original recipe snapshot");
  assert.equal(getSavedMealNutrition({ items: draft.items }).calories, 500);
  assert.equal(store.getSnapshot(otherId)?.draft.name, "Independent meal");
});

test("mixed Saved Meal item add/remove uses existing snapshot builders without live recalculation", () => {
  const recipeOriginal = recipe("recipe-snapshot");
  const updatedFood = food("food-oats", "Renamed oats", 900);
  const store = savedMealStore();
  const id = "new-meal-id";
  const sessionId = healthSavedMealNewSessionId("tab-a", id);
  store.ensureSession(sessionId, healthSavedMealNewCanonicalId("tab-a", id), createHealthSavedMealNewDraft(id));
  store.updateDraft(sessionId, (current) => appendHealthSavedMealFoodItem(current, food("food-oats", "Oats", 200)));
  store.updateDraft(sessionId, (current) => appendHealthSavedMealRecipeItem(current, recipeOriginal));
  store.updateDraft(sessionId, (current) => updateHealthSavedMealItemQuantity(current, 0, 2));
  store.updateDraft(sessionId, (current) => removeHealthSavedMealItem(current, 1));
  const savedItems = store.getSnapshot(sessionId)!.draft.items;

  assert.equal(savedItems.length, 1);
  assert.equal(savedItems[0].source_id, "food-oats");
  assert.equal(savedItems[0].quantity, 2);
  assert.equal(savedItems[0].calories, 200);
  assert.equal(savedItems[0].nutrition_details?.sodium_mg, 100);
  assert.equal(updatedFood.calories, 900);
  assert.equal(getSavedMealNutrition({ items: savedItems }).calories, 400);
  assert.equal(recipeOriginal.ingredients[0].calories, 200);
});

test("new Recipe saves retry with one ID, reconcile, and reopen from the canonical record", async () => {
  const store = recipeStore();
  const recordId = "stable-recipe-id";
  const sessionId = healthRecipeNewSessionId("tab-a", recordId);
  const canonicalId = healthRecipeNewCanonicalId("tab-a", recordId);
  store.ensureSession(sessionId, canonicalId, createHealthRecipeNewDraft(recordId));
  store.attachView(sessionId, "tab-a");
  store.updateDraft(sessionId, (current) => appendHealthRecipeIngredient({ ...current, name: "Retry recipe" }, food("food-oats", "Oats", 200)));
  const attemptedIds: string[] = [];
  let attempt = 0;
  let confirmed: HealthRecipe | null = null;
  const save = async (draft: HealthRecipeEditingSessionDraft, options: { recordId?: string; mode?: string }) => {
    attemptedIds.push(options.recordId ?? "");
    attempt += 1;
    if (attempt === 1) return null;
    confirmed = {
      ...recipe(options.recordId!, draft.name),
      ingredients: draft.ingredients,
      notes: draft.notes,
      servings: Number(draft.servings),
    };
    return confirmed;
  };

  const failed = await saveHealthRecipeEditingSession({ store, draftId: sessionId, canonicalRecordId: canonicalId, isNew: true, save });
  assert.equal("error" in failed, true);
  assert.equal(store.getSnapshot(sessionId)?.draft.name, "Retry recipe");
  assert.equal(store.getSnapshot(sessionId)?.dirty, true);
  const saved = await saveHealthRecipeEditingSession({ store, draftId: sessionId, canonicalRecordId: canonicalId, isNew: true, save });
  assert.equal("saved" in saved, true);
  assert.deepEqual(attemptedIds, [recordId, recordId]);
  assert.equal(store.getSnapshot(sessionId), null);

  const persisted = confirmed!;
  const savedSessionId = healthRecipeSavedSessionId(persisted.id);
  store.ensureSession(savedSessionId, savedSessionId, createHealthRecipeSavedDraft(persisted));
  assert.equal(store.getSnapshot(savedSessionId)?.draft.name, "Retry recipe");
  assert.equal(store.getSnapshot(savedSessionId)?.dirty, false);
});

test("Saved Meal failed updates keep draft and successful save advances the shared baseline", async () => {
  const store = savedMealStore();
  const original = meal("saved-meal-id");
  const sessionId = healthSavedMealSavedSessionId(original.id);
  store.ensureSession(sessionId, sessionId, createHealthSavedMealSavedDraft(original));
  store.attachView(sessionId, "tab-a");
  store.attachView(sessionId, "tab-b");
  store.updateDraft(sessionId, (current) => ({ ...current, name: "Updated meal", mealSlot: "dinner" }));
  const failed = await saveHealthSavedMealEditingSession({
    store,
    draftId: sessionId,
    canonicalRecordId: sessionId,
    isNew: false,
    save: async () => null,
  });
  assert.equal("error" in failed, true);
  assert.equal(store.getSnapshot(sessionId)?.draft.name, "Updated meal");
  assert.equal(store.getSnapshot(sessionId)?.dirty, true);

  const saved = await saveHealthSavedMealEditingSession({
    store,
    draftId: sessionId,
    canonicalRecordId: sessionId,
    isNew: false,
    save: async (draft) => ({ ...original, name: draft.name, default_meal_slot: draft.mealSlot, updated_at: "2026-10-12T12:00:00.000Z" }),
  });
  assert.equal("saved" in saved, true);
  assert.equal(store.getSnapshot(sessionId)?.dirty, false);
  assert.equal(store.getSnapshot(sessionId)?.baseline.name, "Updated meal");
  assert.equal(store.getSnapshot(sessionId)?.baseline.updatedAt, "2026-10-12T12:00:00.000Z");
});

test("discard replaces a dirty saved baseline with the latest confirmed canonical record", () => {
  const store = recipeStore();
  const original = recipe("recipe-discard");
  const sessionId = healthRecipeSavedSessionId(original.id);
  store.ensureSession(sessionId, sessionId, createHealthRecipeSavedDraft(original));
  store.updateDraft(sessionId, (current) => ({ ...current, name: "Unsaved" }));
  const latest = recipe(original.id, "Server confirmed", "2026-10-12T12:00:00.000Z");
  store.discardDraft(sessionId, createHealthRecipeSavedDraft(latest));
  assert.equal(store.getSnapshot(sessionId)?.draft.name, "Server confirmed");
  assert.equal(store.getSnapshot(sessionId)?.baseline.updatedAt, latest.updated_at);
  assert.equal(store.getSnapshot(sessionId)?.dirty, false);
});

test("delete is blocked for dirty drafts and locks a clean session while removal is in flight", async () => {
  const store = recipeStore();
  const original = recipe("recipe-remove");
  const sessionId = healthRecipeSavedSessionId(original.id);
  store.ensureSession(sessionId, sessionId, createHealthRecipeSavedDraft(original));
  store.attachView(sessionId, "tab-a");
  store.updateDraft(sessionId, (current) => ({ ...current, notes: "Keep this draft" }));
  let removeCalls = 0;
  const blocked = await deleteHealthRecipeDefinitionWithSession({ store, recipe: original, viewId: "tab-b", remove: async () => { removeCalls += 1; return true; } });
  assert.equal("error" in blocked, true);
  assert.equal(removeCalls, 0);
  assert.equal(store.getSnapshot(sessionId)?.draft.notes, "Keep this draft");

  store.discardDraft(sessionId);
  const inFlightSaveRevision = store.beginSave(sessionId);
  assert.notEqual(inFlightSaveRevision, null);
  const blockedDuringSave = await deleteHealthRecipeDefinitionWithSession({ store, recipe: original, viewId: "tab-b", remove: async () => { removeCalls += 1; return true; } });
  assert.equal("error" in blockedDuringSave, true);
  assert.equal(removeCalls, 0);
  store.saveFailed(sessionId, inFlightSaveRevision!, "Save still pending.");

  let resolveRemoval!: (deleted: boolean) => void;
  const pending = deleteHealthRecipeDefinitionWithSession({
    store,
    recipe: original,
    viewId: "tab-b",
    remove: async () => {
      removeCalls += 1;
      return new Promise((resolve) => { resolveRemoval = resolve; });
    },
  });
  assert.equal(store.getSnapshot(sessionId)?.isSaving, true);
  assert.equal(store.updateDraft(sessionId, (current) => ({ ...current, name: "Racing edit" })), false);
  const blockedDuringDelete = await deleteHealthRecipeDefinitionWithSession({ store, recipe: original, viewId: "tab-a", remove: async () => true });
  assert.equal("error" in blockedDuringDelete, true);
  resolveRemoval(true);
  assert.deepEqual(await pending, { deleted: true });
  assert.equal(store.getSnapshot(sessionId), null);
  assert.equal(removeCalls, 1);
});

test("removing a Saved Meal is blocked while its shared session has unsaved changes", async () => {
  const store = savedMealStore();
  const original = meal("meal-remove");
  const sessionId = healthSavedMealSavedSessionId(original.id);
  store.ensureSession(sessionId, sessionId, createHealthSavedMealSavedDraft(original));
  store.attachView(sessionId, "tab-a");
  store.updateDraft(sessionId, (current) => ({ ...current, name: "Unsaved meal" }));
  let removeCalls = 0;

  const result = await deleteHealthSavedMealDefinitionWithSession({
    store,
    meal: original,
    viewId: "tab-b",
    remove: async () => { removeCalls += 1; return true; },
  });

  assert.equal("error" in result, true);
  assert.equal(removeCalls, 0);
  assert.equal(store.getSnapshot(sessionId)?.draft.name, "Unsaved meal");
});

test("new Saved Meal create retries with the same stable ID and reconciles the session", async () => {
  const store = savedMealStore();
  const recordId = "stable-saved-meal-id";
  const sessionId = healthSavedMealNewSessionId("tab-a", recordId);
  const canonicalId = healthSavedMealNewCanonicalId("tab-a", recordId);
  store.ensureSession(sessionId, canonicalId, createHealthSavedMealNewDraft(recordId));
  store.updateDraft(sessionId, (current) => appendHealthSavedMealFoodItem({ ...current, name: "Retry meal", mealSlot: "dinner" }, food("food-oats", "Oats", 200)));
  const attemptedIds: string[] = [];
  let attempt = 0;

  const save = async (draft: HealthSavedMealEditingSessionDraft, options: { recordId?: string }) => {
    attemptedIds.push(options.recordId ?? "");
    attempt += 1;
    if (attempt === 1) return null;
    return {
      ...meal(options.recordId!, draft.name),
      default_meal_slot: draft.mealSlot,
      items: draft.items,
    };
  };

  const failed = await saveHealthSavedMealEditingSession({ store, draftId: sessionId, canonicalRecordId: canonicalId, isNew: true, save });
  assert.equal("error" in failed, true);
  assert.equal(store.getSnapshot(sessionId)?.draft.items[0].calories, 200);
  const saved = await saveHealthSavedMealEditingSession({ store, draftId: sessionId, canonicalRecordId: canonicalId, isNew: true, save });

  assert.equal("saved" in saved, true);
  assert.deepEqual(attemptedIds, [recordId, recordId]);
  assert.equal(store.getSnapshot(sessionId), null);
  const savedRecord = "saved" in saved ? saved.saved : null;
  assert.ok(savedRecord);
  const reopenedId = healthSavedMealSavedSessionId(savedRecord.id);
  store.ensureSession(reopenedId, reopenedId, createHealthSavedMealSavedDraft(savedRecord));
  assert.equal(store.getSnapshot(reopenedId)?.draft.name, "Retry meal");
  assert.equal(store.getSnapshot(reopenedId)?.draft.items[0].source_id, "food-oats");
});

test("confirmed Recipe and Saved Meal records reconcile by ID without duplicates", () => {
  const olderRecipe = recipe("recipe-older", "Older", "2026-10-09T12:00:00.000Z");
  const currentRecipe = recipe("recipe-current", "Current", "2026-10-10T12:00:00.000Z");
  const updatedRecipe = { ...currentRecipe, name: "Updated current", updated_at: "2026-10-12T12:00:00.000Z" };
  const recipes = reconcileHealthRecipeCollection([currentRecipe, olderRecipe], updatedRecipe);
  assert.deepEqual(recipes.map((entry) => entry.id), [currentRecipe.id, olderRecipe.id]);
  assert.equal(recipes[0].name, "Updated current");

  const olderMeal = meal("meal-older", "Older", "2026-10-09T12:00:00.000Z");
  const currentMeal = meal("meal-current", "Current", "2026-10-10T12:00:00.000Z");
  const updatedMeal = { ...currentMeal, name: "Updated current", updated_at: "2026-10-12T12:00:00.000Z" };
  const meals = reconcileHealthSavedMealCollection([currentMeal, olderMeal], updatedMeal);
  assert.deepEqual(meals.map((entry) => entry.id), [currentMeal.id, olderMeal.id]);
  assert.equal(meals[0].name, "Updated current");
});

test("exact-record reconciliation rejects ID, owner, snapshot, or item-order collisions", () => {
  const expectedRecipe = {
    ...recipe("recipe-exact"),
    ingredients: [
      ...recipe("recipe-exact").ingredients,
      buildRecipeIngredient(food("food-2", "Other", 10), 1),
    ],
  };
  assert.equal(healthRecipeWriteMatchesCanonicalRow(expectedRecipe, expectedRecipe), true);
  assert.equal(healthRecipeWriteMatchesCanonicalRow({ ...expectedRecipe, id: "other" }, expectedRecipe), false);
  assert.equal(healthRecipeWriteMatchesCanonicalRow({ ...expectedRecipe, user_id: "other-user" }, expectedRecipe), false);
  assert.equal(healthRecipeWriteMatchesCanonicalRow({ ...expectedRecipe, ingredients: [...expectedRecipe.ingredients].reverse() }, expectedRecipe), false);

  const item = buildSavedMealFoodItem(food("food-2", "Other", 10), 1);
  const expectedMeal = { ...meal("meal-exact"), items: [...meal("meal-exact").items, item] };
  assert.equal(healthSavedMealWriteMatchesCanonicalRow(expectedMeal, expectedMeal), true);
  assert.equal(healthSavedMealWriteMatchesCanonicalRow({ ...expectedMeal, items: [...expectedMeal.items].reverse() }, expectedMeal), false);
  assert.equal(healthSavedMealWriteMatchesCanonicalRow({ ...expectedMeal, user_id: "other-user" }, expectedMeal), false);
});

test("actual session wiring keeps legacy mode and exact scoped persistence branches", () => {
  const panel = readFileSync(new URL("../src/components/task-app/health-library-panel.tsx", import.meta.url), "utf8");
  const taskApp = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const health = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
  assert.match(panel, /if \(hasSharedRecipeSessions && recipeSessionStore/);
  assert.match(panel, /if \(hasSharedSavedMealSessions && savedMealSessionStore/);
  assert.match(panel, /setLegacyRecipeDraft\(update\)/);
  assert.match(panel, /setLegacyMealDraft\(update\)/);
  assert.match(taskApp, /recipeSessionStore=\{masterWorkspace\.isEnabled \? healthRecipeDraftSessionStore : null\}/);
  assert.match(taskApp, /savedMealSessionStore=\{masterWorkspace\.isEnabled \? healthSavedMealDraftSessionStore : null\}/);
  assert.match(health, /\.insert\(\{[\s\S]*?user_id: userId,[\s\S]*?\}\)\.select\("\*"\)\.maybeSingle\(\)/);
  assert.match(health, /\.update\(\{[\s\S]*?\}\)\.eq\("id", recordId!\)\.eq\("user_id", userId\)\.eq\("updated_at", options\.expectedUpdatedAt!\)/);
  assert.match(health, /healthRecipeWriteMatchesCanonicalRow\(data, expected!\)/);
  assert.match(health, /healthSavedMealWriteMatchesCanonicalRow\(data, expected!\)/);
});

function buildSavedMealRecipeItemForTest(source: HealthRecipe) {
  return {
    source_id: source.id,
    source_type: "recipe" as const,
    name: source.name,
    serving_label: "1 serving",
    quantity: 1,
    calories: getRecipeNutritionPerServing(source).calories,
    protein_g: getRecipeNutritionPerServing(source).protein,
    carbs_g: getRecipeNutritionPerServing(source).carbs,
    fat_g: getRecipeNutritionPerServing(source).fat,
    nutrition_details: getRecipeNutritionPerServing(source).nutrition_details ?? null,
  };
}

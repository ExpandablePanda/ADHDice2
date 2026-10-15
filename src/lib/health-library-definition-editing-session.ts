import type {
  HealthRecipe,
  HealthRecipeIngredient,
  HealthFoodLibraryItem,
  HealthSavedMeal,
  HealthSavedMealItem,
  HealthMealSlot,
} from "./database.types";
import { buildRecipeIngredient, buildSavedMealFoodItem, buildSavedMealRecipeItem } from "./health-library";
import type { EditingSessionStore } from "./editing-session-store";

export type HealthRecipeEditingSessionDraft = {
  id: string | null;
  newRecordId: string;
  name: string;
  notes: string;
  servings: string;
  ingredients: HealthRecipeIngredient[];
  updatedAt: string | null;
};

export type HealthSavedMealEditingSessionDraft = {
  id: string | null;
  newRecordId: string;
  name: string;
  mealSlot: HealthMealSlot;
  items: HealthSavedMealItem[];
  updatedAt: string | null;
};

export type HealthLibraryDefinitionSaveMode = "create-only" | "update-only" | "legacy-upsert";
export type HealthLibraryDefinitionSaveOptions = {
  mode?: HealthLibraryDefinitionSaveMode;
  recordId?: string;
  expectedUpdatedAt?: string | null;
};

export const HEALTH_RECIPE_SAVE_FAILURE_MESSAGE = "Could not verify this recipe save. Your draft is still here; try again.";
export const HEALTH_SAVED_MEAL_SAVE_FAILURE_MESSAGE = "Could not verify this saved meal. Your draft is still here; try again.";
export const HEALTH_RECIPE_IDENTITY_CONFLICT_MESSAGE = "This recipe ID belongs to a different saved recipe. Your draft is still here.";
export const HEALTH_SAVED_MEAL_IDENTITY_CONFLICT_MESSAGE = "This saved meal ID belongs to a different saved meal. Your draft is still here.";

function createUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function createHealthLibraryDefinitionDraftId() {
  return createUuid();
}

export function healthRecipeSavedSessionId(recipeId: string) {
  return `health-recipe-definition:${recipeId}`;
}

export function healthRecipeNewSessionId(tabId: string, draftId: string) {
  return `health-recipe-new:${tabId}:${draftId}`;
}

export function healthRecipeNewCanonicalId(tabId: string, draftId: string) {
  return `health-recipe-new-record:${tabId}:${draftId}`;
}

export function healthSavedMealSavedSessionId(mealId: string) {
  return `health-saved-meal-definition:${mealId}`;
}

export function healthSavedMealNewSessionId(tabId: string, draftId: string) {
  return `health-saved-meal-new:${tabId}:${draftId}`;
}

export function healthSavedMealNewCanonicalId(tabId: string, draftId: string) {
  return `health-saved-meal-new-record:${tabId}:${draftId}`;
}

export function createHealthRecipeNewDraft(draftId = createUuid()): HealthRecipeEditingSessionDraft {
  return { id: null, newRecordId: draftId, name: "", notes: "", servings: "1", ingredients: [], updatedAt: null };
}

export function createHealthRecipeSavedDraft(recipe: HealthRecipe): HealthRecipeEditingSessionDraft {
  return {
    id: recipe.id,
    newRecordId: recipe.id,
    name: recipe.name,
    notes: recipe.notes ?? "",
    servings: String(recipe.servings),
    ingredients: recipe.ingredients,
    updatedAt: recipe.updated_at,
  };
}

export function createHealthSavedMealNewDraft(draftId = createUuid()): HealthSavedMealEditingSessionDraft {
  return { id: null, newRecordId: draftId, name: "", mealSlot: "breakfast", items: [], updatedAt: null };
}

export function createHealthSavedMealSavedDraft(meal: HealthSavedMeal): HealthSavedMealEditingSessionDraft {
  return {
    id: meal.id,
    newRecordId: meal.id,
    name: meal.name,
    mealSlot: meal.default_meal_slot,
    items: meal.items,
    updatedAt: meal.updated_at,
  };
}

export function getHealthRecipeDefinitionDraftValidationMessage(draft: HealthRecipeEditingSessionDraft) {
  return !draft.name.trim() || draft.ingredients.length === 0
    ? "Add a recipe name and at least one ingredient before saving."
    : null;
}

export function getHealthSavedMealDefinitionDraftValidationMessage(draft: HealthSavedMealEditingSessionDraft) {
  return !draft.name.trim() || draft.items.length === 0
    ? "Add a saved meal name and at least one item before saving."
    : null;
}

export function appendHealthRecipeIngredient(draft: HealthRecipeEditingSessionDraft, food: HealthFoodLibraryItem) {
  return { ...draft, ingredients: [...draft.ingredients, buildRecipeIngredient(food, 1)] };
}

export function updateHealthRecipeIngredientQuantity(draft: HealthRecipeEditingSessionDraft, index: number, quantity: number) {
  return {
    ...draft,
    ingredients: draft.ingredients.map((ingredient, itemIndex) => itemIndex === index ? { ...ingredient, quantity } : ingredient),
  };
}

export function removeHealthRecipeIngredient(draft: HealthRecipeEditingSessionDraft, index: number) {
  return { ...draft, ingredients: draft.ingredients.filter((_, itemIndex) => itemIndex !== index) };
}

export function appendHealthSavedMealFoodItem(draft: HealthSavedMealEditingSessionDraft, food: HealthFoodLibraryItem) {
  return { ...draft, items: [...draft.items, buildSavedMealFoodItem(food, 1)] };
}

export function appendHealthSavedMealRecipeItem(draft: HealthSavedMealEditingSessionDraft, recipe: HealthRecipe) {
  return { ...draft, items: [...draft.items, buildSavedMealRecipeItem(recipe, 1)] };
}

export function updateHealthSavedMealItemQuantity(draft: HealthSavedMealEditingSessionDraft, index: number, quantity: number) {
  return {
    ...draft,
    items: draft.items.map((item, itemIndex) => itemIndex === index ? { ...item, quantity } : item),
  };
}

export function removeHealthSavedMealItem(draft: HealthSavedMealEditingSessionDraft, index: number) {
  return { ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function areHealthRecipeEditingSessionDraftsEqual(left: HealthRecipeEditingSessionDraft, right: HealthRecipeEditingSessionDraft) {
  return left.id === right.id
    && left.newRecordId === right.newRecordId
    && left.name === right.name
    && left.notes === right.notes
    && left.servings === right.servings
    && left.updatedAt === right.updatedAt
    && stableJson(left.ingredients) === stableJson(right.ingredients);
}

export function areHealthSavedMealEditingSessionDraftsEqual(left: HealthSavedMealEditingSessionDraft, right: HealthSavedMealEditingSessionDraft) {
  return left.id === right.id
    && left.newRecordId === right.newRecordId
    && left.name === right.name
    && left.mealSlot === right.mealSlot
    && left.updatedAt === right.updatedAt
    && stableJson(left.items) === stableJson(right.items);
}

export function healthRecipeWriteMatchesCanonicalRow(
  actual: HealthRecipe | null | undefined,
  expected: Pick<HealthRecipe, "id" | "user_id" | "name" | "notes" | "servings" | "ingredients">,
) {
  return Boolean(actual
    && actual.id === expected.id
    && actual.user_id === expected.user_id
    && actual.name === expected.name
    && (actual.notes ?? "") === (expected.notes ?? "")
    && Number(actual.servings) === Number(expected.servings)
    && stableJson(actual.ingredients) === stableJson(expected.ingredients));
}

export function healthSavedMealWriteMatchesCanonicalRow(
  actual: HealthSavedMeal | null | undefined,
  expected: Pick<HealthSavedMeal, "id" | "user_id" | "name" | "default_meal_slot" | "items">,
) {
  return Boolean(actual
    && actual.id === expected.id
    && actual.user_id === expected.user_id
    && actual.name === expected.name
    && actual.default_meal_slot === expected.default_meal_slot
    && stableJson(actual.items) === stableJson(expected.items));
}

export function reconcileHealthRecipeCollection(current: readonly HealthRecipe[], saved: HealthRecipe) {
  return [saved, ...current.filter((recipe) => recipe.id !== saved.id)]
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export function reconcileHealthSavedMealCollection(current: readonly HealthSavedMeal[], saved: HealthSavedMeal) {
  return [saved, ...current.filter((meal) => meal.id !== saved.id)]
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

type DefinitionSaveResult<Record> = { saved: Record } | { error: string };

async function saveDefinitionSession<Draft extends { id: string | null; newRecordId: string; updatedAt: string | null }, Record extends { id: string; user_id: string }>({
  store,
  draftId,
  canonicalRecordId,
  isNew,
  failureMessage,
  identityConflictMessage,
  createSavedDraft,
  save,
}: {
  store: EditingSessionStore<Draft>;
  draftId: string;
  canonicalRecordId: string;
  isNew: boolean;
  failureMessage: string;
  identityConflictMessage: string;
  createSavedDraft: (record: Record) => Draft;
  save: (draft: Draft, options: HealthLibraryDefinitionSaveOptions) => Promise<Record | null>;
}): Promise<DefinitionSaveResult<Record>> {
  const session = store.getSnapshot(draftId);
  if (!session) return { error: failureMessage };
  if (session.canonicalRecordId !== canonicalRecordId) return { error: identityConflictMessage };
  if (session.isSaving) return { error: "This definition is already being saved." };
  const saveRevision = store.beginSave(draftId);
  if (saveRevision === null) return { error: "This definition is already being saved." };
  const recordId = isNew ? session.draft.newRecordId : session.draft.id;
  if (!recordId) {
    store.saveFailed(draftId, saveRevision, identityConflictMessage);
    return { error: identityConflictMessage };
  }

  try {
    const record = await save(session.draft, {
      mode: isNew ? "create-only" : "update-only",
      recordId,
      expectedUpdatedAt: isNew ? null : session.baseline.updatedAt,
    });
    if (!record) {
      store.saveFailed(draftId, saveRevision, failureMessage);
      return { error: failureMessage };
    }
    if (record.id !== recordId || record.user_id !== store.ownerId) {
      store.saveFailed(draftId, saveRevision, identityConflictMessage);
      return { error: identityConflictMessage };
    }

    if (isNew) {
      if (!store.removeAfterSave(draftId, saveRevision)) {
        return { error: "The definition was saved, but its shared draft could not be reconciled. Reopen it to continue." };
      }
    } else if (!store.saveSucceeded(draftId, saveRevision, createSavedDraft(record))) {
      return { error: "The definition was saved, but its shared draft could not be reconciled. Reopen it to continue." };
    }
    return { saved: record };
  } catch (error) {
    const message = error instanceof Error ? error.message : failureMessage;
    store.saveFailed(draftId, saveRevision, message);
    return { error: message };
  }
}

export function saveHealthRecipeEditingSession({
  store,
  draftId,
  canonicalRecordId,
  isNew,
  save,
}: {
  store: EditingSessionStore<HealthRecipeEditingSessionDraft>;
  draftId: string;
  canonicalRecordId: string;
  isNew: boolean;
  save: (draft: HealthRecipeEditingSessionDraft, options: HealthLibraryDefinitionSaveOptions) => Promise<HealthRecipe | null>;
}) {
  return saveDefinitionSession<HealthRecipeEditingSessionDraft, HealthRecipe>({
    store,
    draftId,
    canonicalRecordId,
    isNew,
    failureMessage: HEALTH_RECIPE_SAVE_FAILURE_MESSAGE,
    identityConflictMessage: HEALTH_RECIPE_IDENTITY_CONFLICT_MESSAGE,
    createSavedDraft: createHealthRecipeSavedDraft,
    save,
  });
}

export function saveHealthSavedMealEditingSession({
  store,
  draftId,
  canonicalRecordId,
  isNew,
  save,
}: {
  store: EditingSessionStore<HealthSavedMealEditingSessionDraft>;
  draftId: string;
  canonicalRecordId: string;
  isNew: boolean;
  save: (draft: HealthSavedMealEditingSessionDraft, options: HealthLibraryDefinitionSaveOptions) => Promise<HealthSavedMeal | null>;
}) {
  return saveDefinitionSession<HealthSavedMealEditingSessionDraft, HealthSavedMeal>({
    store,
    draftId,
    canonicalRecordId,
    isNew,
    failureMessage: HEALTH_SAVED_MEAL_SAVE_FAILURE_MESSAGE,
    identityConflictMessage: HEALTH_SAVED_MEAL_IDENTITY_CONFLICT_MESSAGE,
    createSavedDraft: createHealthSavedMealSavedDraft,
    save,
  });
}

type DefinitionDeleteResult = { deleted: true } | { error: string };

async function deleteDefinitionWithSession<Draft, Record extends { id: string }>({
  store,
  record,
  draftId,
  viewId,
  createSavedDraft,
  dirtyMessage,
  remove,
}: {
  store: EditingSessionStore<Draft>;
  record: Record;
  draftId: string;
  viewId: string;
  createSavedDraft: (record: Record) => Draft;
  dirtyMessage: string;
  remove: (recordId: string) => Promise<boolean>;
}): Promise<DefinitionDeleteResult> {
  const savedDraft = createSavedDraft(record);
  const session = store.ensureSession(draftId, draftId, savedDraft);
  if (session.dirty || session.isSaving) return { error: dirtyMessage };
  store.attachView(draftId, viewId);
  const saveRevision = store.beginSave(draftId);
  if (saveRevision === null) return { error: dirtyMessage };
  try {
    const deleted = await remove(record.id);
    if (deleted) {
      if (!store.removeAfterSave(draftId, saveRevision)) return { error: "The definition was removed, but its shared session could not be reconciled." };
      return { deleted: true };
    }
    store.saveSucceeded(draftId, saveRevision, savedDraft);
    return { error: "Could not remove this definition. It is still in your library." };
  } catch (error) {
    store.saveSucceeded(draftId, saveRevision, savedDraft);
    return { error: error instanceof Error ? error.message : "Could not remove this definition." };
  }
}

export function deleteHealthRecipeDefinitionWithSession({
  store,
  recipe,
  viewId,
  remove,
}: {
  store: EditingSessionStore<HealthRecipeEditingSessionDraft>;
  recipe: HealthRecipe;
  viewId: string;
  remove: (recordId: string) => Promise<boolean>;
}) {
  return deleteDefinitionWithSession({
    store,
    record: recipe,
    draftId: healthRecipeSavedSessionId(recipe.id),
    viewId,
    createSavedDraft: createHealthRecipeSavedDraft,
    dirtyMessage: "Save or discard this recipe draft in a Master Tab before removing the recipe.",
    remove,
  });
}

export function deleteHealthSavedMealDefinitionWithSession({
  store,
  meal,
  viewId,
  remove,
}: {
  store: EditingSessionStore<HealthSavedMealEditingSessionDraft>;
  meal: HealthSavedMeal;
  viewId: string;
  remove: (recordId: string) => Promise<boolean>;
}) {
  return deleteDefinitionWithSession({
    store,
    record: meal,
    draftId: healthSavedMealSavedSessionId(meal.id),
    viewId,
    createSavedDraft: createHealthSavedMealSavedDraft,
    dirtyMessage: "Save or discard this saved meal draft in a Master Tab before removing the meal.",
    remove,
  });
}

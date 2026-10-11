import assert from "node:assert/strict";
import test from "node:test";
import type { HealthMealEntry, HealthMealEntryInsert } from "../src/lib/database.types.ts";
import { createEditingSessionStore } from "../src/lib/editing-session-store.ts";
import {
  areHealthFoodEditingSessionDraftsEqual,
  createDefaultMealDraft,
  createHealthFoodEditingSessionDraft,
  healthMealEntrySessionId,
  healthMealNewEntrySessionId,
  hasUnsafeUnconvertedHealthFoodDraft,
  prepareHealthMealEntryFromDraft,
  reconcileHealthMealEntryInsert,
  saveHealthFoodEditingSession,
  type HealthFoodEditingSessionDraft,
  type MealEditDraft,
} from "../src/lib/health-meal-draft.ts";
import {
  activateMasterTab,
  createMasterTab,
  getMasterTabFoodView,
  initializeMasterWorkspaceState,
  replaceFocusedMasterTabDestination,
  updateMasterTabFoodView,
} from "../src/lib/master-workspace-state.ts";
import { DEFAULT_TASK_WORKSPACE_TABS_STATE } from "../src/lib/task-ui-state.ts";

function createFoodDraft(date = "2026-10-11", mealSlot: "breakfast" | "lunch" | "dinner" | "snack" = "lunch") {
  return {
    ...createDefaultMealDraft(mealSlot, new Date(2026, 9, 11, 12, 30)),
    attribution: "Food provider",
    brandName: "Example Brand",
    calories: "142.8",
    carbs: "22.25",
    date,
    fat: "3.75",
    foodCategory: "Grains",
    foodName: "Oats",
    measurement: "g",
    nutritionDetails: null,
    protein: "12.5",
    provider: "custom",
    providerItemId: "provider-food-1",
    quantity: "50",
    servingLabel: "1 serving",
    servingMeasureUnit: "g",
    servingMeasureValue: 59,
    servingQuantity: 1,
    servingUnit: "serving",
    sourceFoodId: "food-1",
    time: "12:30",
  };
}

function createMealEditDraft(date = "2026-10-10"): MealEditDraft {
  return {
    mode: "structured",
    calories: "142.8",
    carbs: "22.25",
    date,
    fat: "3.75",
    mealSlot: "lunch",
    measurement: "g",
    protein: "12.5",
    quantity: "50",
    servingLabel: "1 serving",
    time: "12:30",
  };
}

function createMealRow(input: Omit<HealthMealEntryInsert, "user_id">): HealthMealEntry {
  return {
    attribution: null,
    barcode: null,
    brand_name: null,
    calories: 0,
    carbs_g: null,
    consumed_quantity: null,
    consumed_unit: null,
    created_at: "2026-10-11T16:30:00.000Z",
    entry_date: "2026-10-11",
    fat_g: null,
    food_name: "",
    food_snapshot: null,
    id: "meal-id",
    logged_at: "2026-10-11T16:30:00.000Z",
    meal_slot: "lunch",
    nutrition_snapshot: null,
    protein_g: null,
    provider: "manual",
    provider_item_id: null,
    serving_fraction: null,
    serving_label: null,
    source_food_id: null,
    updated_at: "2026-10-11T16:30:00.000Z",
    user_id: "user-1",
    ...input,
  };
}

function createStore() {
  return createEditingSessionStore<HealthFoodEditingSessionDraft>("user-1", areHealthFoodEditingSessionDraftsEqual);
}

test("saved meal entries share by canonical ID while different entries keep independent drafts", () => {
  const store = createStore();
  const entryOneId = healthMealEntrySessionId("meal-1");
  const entryTwoId = healthMealEntrySessionId("meal-2");
  const entryOne = store.ensureSession(entryOneId, "meal-1", { kind: "saved-entry", mealEditDraft: createMealEditDraft() });
  const sameEntry = store.ensureSession(entryOneId, "meal-1", { kind: "saved-entry", mealEditDraft: createMealEditDraft() });
  const entryTwo = store.ensureSession(healthMealEntrySessionId("meal-2"), "meal-2", {
    kind: "saved-entry",
    mealEditDraft: createMealEditDraft("2026-10-09"),
  });
  store.attachView(entryOneId, "tab-a");
  store.attachView(entryOneId, "tab-b");
  store.attachView(entryTwoId, "tab-a");

  store.updateDraft(entryOneId, (current) => current.kind === "saved-entry"
    ? { ...current, mealEditDraft: { ...current.mealEditDraft, date: "2026-10-08" } }
    : current);

  assert.equal(sameEntry, entryOne);
  assert.equal(store.getSnapshot(entryOneId)?.draft.kind, "saved-entry");
  assert.equal(store.getSnapshot(entryOneId)?.draft.kind === "saved-entry" ? store.getSnapshot(entryOneId)?.draft.mealEditDraft.date : null, "2026-10-08");
  assert.equal(store.getSnapshot(entryTwo.draftId)?.draft.kind === "saved-entry" ? store.getSnapshot(entryTwo.draftId)?.draft.mealEditDraft.date : null, "2026-10-09");
  assert.equal(store.getSnapshot(entryOneId)?.dirty, true);
  assert.equal(store.getSnapshot(entryTwoId)?.dirty, false);
});

test("Food presentation stays per tab across page changes while a new draft survives remount", () => {
  const initial = initializeMasterWorkspaceState("Health", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Food");
  const panelId = initial.panels[0].id;
  const withSecond = createMasterTab(initial, panelId, {
    id: "food-tab-b",
    destination: { kind: "health-tab", page: "Health", tab: "Food" },
    presentation: { healthSection: "Food" },
  }, false);
  const firstTab = withSecond.panels[0].tabs[0];
  const secondTab = withSecond.panels[0].tabs[1];
  const firstView = getMasterTabFoodView(firstTab);
  const secondView = getMasterTabFoodView(secondTab);
  assert.notEqual(firstView.newMealDraftId, secondView.newMealDraftId);

  const selectedFirst = updateMasterTabFoodView(withSecond, panelId, firstTab.id, {
    ...firstView,
    activeMealEntrySlot: "lunch",
    historyDate: "2026-10-07",
    isQuickEntryOpen: true,
    selectedMealEntryId: "meal-1",
    librarySection: "recipes",
    foodLibrarySearchQuery: "banana",
    ingredientSearchQuery: "oats",
  });
  const foodStore = createStore();
  const newDraftId = healthMealNewEntrySessionId(firstView.newMealDraftId);
  foodStore.ensureSession(newDraftId, `unsaved-health-meal:${firstView.newMealDraftId}`, createHealthFoodEditingSessionDraft(createFoodDraft("2026-10-07", "lunch"), {
    entryId: firstView.newMealDraftId,
    quickFoodId: firstView.newMealDraftId,
  }));
  foodStore.attachView(newDraftId, firstTab.id);
  const secondDraftId = healthMealNewEntrySessionId(secondView.newMealDraftId);
  foodStore.ensureSession(secondDraftId, "unsaved-health-meal:" + secondView.newMealDraftId, createHealthFoodEditingSessionDraft(createFoodDraft("2026-10-11", "dinner"), {
    entryId: secondView.newMealDraftId,
    quickFoodId: secondView.newMealDraftId,
  }));
  foodStore.attachView(secondDraftId, secondTab.id);
  foodStore.updateDraft(newDraftId, (current) => current.kind === "new-entry"
    ? { ...current, mealDraft: { ...current.mealDraft, foodName: "Oats" } }
    : current);
  foodStore.updateDraft(secondDraftId, (current) => current.kind === "new-entry"
    ? { ...current, mealDraft: { ...current.mealDraft, foodName: "Rice" } }
    : current);

  const onNotes = replaceFocusedMasterTabDestination(selectedFirst, { kind: "page", page: "Notes" });
  const backOnHealth = replaceFocusedMasterTabDestination(onNotes, { kind: "health-tab", page: "Health", tab: "Food" });
  const activatedSecond = activateMasterTab(backOnHealth, panelId, secondTab.id);
  const backOnFirst = activateMasterTab(activatedSecond, panelId, firstTab.id);
  foodStore.attachView(newDraftId, firstTab.id);

  assert.deepEqual(getMasterTabFoodView(backOnFirst.panels[0].tabs[0]), {
    ...firstView,
    activeMealEntrySlot: "lunch",
    historyDate: "2026-10-07",
    isQuickEntryOpen: true,
    selectedMealEntryId: "meal-1",
    librarySection: "recipes",
    foodLibrarySearchQuery: "banana",
    ingredientSearchQuery: "oats",
  });
  assert.equal(getMasterTabFoodView(backOnFirst.panels[0].tabs[1]).historyDate, secondView.historyDate);
  assert.equal(getMasterTabFoodView(backOnFirst.panels[0].tabs[1]).librarySection, "foods");
  assert.equal(getMasterTabFoodView(backOnFirst.panels[0].tabs[1]).foodLibrarySearchQuery, "");
  assert.equal(foodStore.getSnapshot(newDraftId)?.draft.kind === "new-entry" ? foodStore.getSnapshot(newDraftId)?.draft.mealDraft.foodName : null, "Oats");
  assert.equal(foodStore.getSnapshot(secondDraftId)?.draft.kind === "new-entry" ? foodStore.getSnapshot(secondDraftId)?.draft.mealDraft.foodName : null, "Rice");
});

test("save reconciles shared baseline, discard restores it, and failed save retains input for retry", async () => {
  const store = createStore();
  const savedId = healthMealEntrySessionId("meal-saved");
  const savedBaseline = { kind: "saved-entry", mealEditDraft: createMealEditDraft() } satisfies HealthFoodEditingSessionDraft;
  store.ensureSession(savedId, "meal-saved", savedBaseline);
  store.attachView(savedId, "tab-a");
  store.attachView(savedId, "tab-b");
  store.updateDraft(savedId, (current) => current.kind === "saved-entry"
    ? { ...current, mealEditDraft: { ...current.mealEditDraft, date: "2026-10-08" } }
    : current);
  assert.equal(store.discardDraft(savedId), true);
  assert.deepEqual(store.getSnapshot(savedId)?.draft, savedBaseline);
  assert.equal(store.getSnapshot(savedId)?.dirty, false);

  store.updateDraft(savedId, (current) => current.kind === "saved-entry"
    ? { ...current, mealEditDraft: { ...current.mealEditDraft, date: "2026-10-09" } }
    : current);
  assert.equal(await saveHealthFoodEditingSession({
    store,
    draftId: savedId,
    save: async (draft) => ({ savedDraft: draft }),
  }), true);
  assert.equal(store.getSnapshot(savedId)?.dirty, false);
  assert.equal(store.getSnapshot(savedId)?.draft.kind === "saved-entry" ? store.getSnapshot(savedId)?.draft.mealEditDraft.date : null, "2026-10-09");
  assert.equal(store.canCloseView("tab-a"), true);
});

test("new meal draft uses exact nutrition serialization and an idempotent same-ID retry", async () => {
  const store = createStore();
  const recordId = "3ac9177d-741f-4a6c-83f5-40ca7c448ae7";
  const draftId = healthMealNewEntrySessionId("tab-a-draft");
  const initialDraft = createHealthFoodEditingSessionDraft(createFoodDraft(), { entryId: recordId, quickFoodId: recordId });
  store.ensureSession(draftId, "unsaved-health-meal:tab-a-draft", initialDraft);
  store.attachView(draftId, "tab-a");
  store.updateDraft(draftId, (current) => current.kind === "new-entry"
    ? { ...current, mealDraft: { ...current.mealDraft, foodName: "Rolled oats" } }
    : current);
  assert.equal(store.getSnapshot(draftId)?.dirty, true);

  const authority = new Map<string, HealthMealEntry>();
  let insertAttempts = 0;
  const save = async (sessionDraft: HealthFoodEditingSessionDraft) => {
    if (sessionDraft.kind !== "new-entry") return { error: "New meal draft expected." } as const;
    const prepared = prepareHealthMealEntryFromDraft(sessionDraft.mealDraft, {
      date: sessionDraft.mealDraft.date,
      id: sessionDraft.entryId,
      loggedAt: "2026-10-11T16:30:00.000Z",
      mealSlot: sessionDraft.mealDraft.mealSlot,
    });
    assert.ok(prepared);
    insertAttempts += 1;
    const existing = authority.get(sessionDraft.entryId);
    const result = existing
      ? { data: null, error: { code: "23505", message: "duplicate meal ID" } }
      : { data: null, error: { code: "08006", message: "write acknowledgment was lost" } };
    if (!existing) authority.set(sessionDraft.entryId, createMealRow(prepared.input as unknown as Record<string, unknown>));
    const reconciled = await reconcileHealthMealEntryInsert({
      input: prepared.input,
      result,
      lookupById: async (id) => ({
        row: authority.get(id) ?? null,
        error: insertAttempts === 1 ? "lookup acknowledgment was also unavailable" : null,
      }),
    });
    if (!reconciled.row) return { error: reconciled.error ?? "Meal save failed." } as const;
    return { savedDraft: sessionDraft } as const;
  };

  assert.equal(await saveHealthFoodEditingSession({ store, draftId, removeAfterSuccess: true, save }), false);
  assert.equal(store.getSnapshot(draftId)?.dirty, true);
  assert.equal(store.getSnapshot(draftId)?.saveError, "lookup acknowledgment was also unavailable");
  assert.equal(authority.size, 1);
  assert.equal(await saveHealthFoodEditingSession({ store, draftId, removeAfterSuccess: true, save }), true);
  assert.equal(authority.size, 1);
  assert.equal(insertAttempts, 2);
  const saved = authority.get(recordId);
  assert.ok(saved);
  assert.equal(saved.id, recordId);
  assert.equal(saved.entry_date, "2026-10-11");
  assert.equal(saved.meal_slot, "lunch");
  assert.equal(saved.food_name, "Rolled oats");
  assert.equal(saved.calories, 121);
  assert.equal(saved.consumed_quantity, 50);
  assert.equal(saved.consumed_unit, "g");
  assert.equal(saved.source_food_id, "food-1");
  assert.equal(saved.food_snapshot?.source_food_id, "food-1");
  assert.equal(saved.nutrition_snapshot?.calories, 121.01694915254238);
  assert.equal(saved.protein_g, saved.nutrition_snapshot?.protein_g);
  assert.equal(saved.carbs_g, saved.nutrition_snapshot?.carbs_g);
  assert.equal(saved.fat_g, saved.nutrition_snapshot?.fat_g);
  assert.equal(store.getSnapshot(draftId), null);
  const reopenedId = healthMealEntrySessionId(recordId);
  store.ensureSession(reopenedId, recordId, { kind: "saved-entry", mealEditDraft: createMealEditDraft(saved.entry_date) });
  assert.equal(store.getSnapshot(reopenedId)?.draft.kind, "saved-entry");
  assert.equal(store.getSnapshot(reopenedId)?.dirty, false);
});

test("unconverted Food plans remain guarded while shared actual-food drafts can navigate", () => {
  const planDraft = { ...createDefaultMealDraft("dinner"), foodName: "Dinner", calories: "400" };
  assert.equal(hasUnsafeUnconvertedHealthFoodDraft({
    activeMealSlot: "dinner",
    editingMealPlanId: null,
    isSaving: false,
    mealDraft: planDraft,
    mealEditorMode: "plan",
  }), true);
  assert.equal(hasUnsafeUnconvertedHealthFoodDraft({
    activeMealSlot: "dinner",
    editingMealPlanId: "plan-1",
    isSaving: false,
    mealDraft: createDefaultMealDraft("dinner"),
    mealEditorMode: "plan",
  }), true);
  assert.equal(hasUnsafeUnconvertedHealthFoodDraft({
    activeMealSlot: "dinner",
    editingMealPlanId: null,
    isSaving: false,
    mealDraft: planDraft,
    mealEditorMode: "actual",
  }), false);
});

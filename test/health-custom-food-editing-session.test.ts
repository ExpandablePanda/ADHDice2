import assert from "node:assert/strict";
import test from "node:test";

import type { HealthFoodLibraryItem } from "../src/lib/database.types.ts";
import { createEditingSessionStore } from "../src/lib/editing-session-store.ts";
import {
  areHealthCustomFoodEditingSessionDraftsEqual,
  applyHealthCustomFoodBarcodeLookup,
  canDeleteHealthCustomFoodSession,
  createHealthCustomFoodDraftId,
  createHealthCustomFoodNewDraft,
  createHealthCustomFoodSavedDraft,
  discardHealthCustomFoodDraft,
  getHealthCustomFoodDraftValidationMessage,
  healthCustomFoodNewCanonicalId,
  healthCustomFoodNewSessionId,
  healthCustomFoodSavedSessionId,
  healthCustomFoodWriteMatchesCanonicalRow,
  isCurrentHealthCustomFoodBarcodeLookup,
  prepareHealthCustomFoodSaveInput,
  saveHealthCustomFoodEditingSession,
  type HealthCustomFoodEditingSessionDraft,
} from "../src/lib/health-custom-food-editing-session.ts";
import {
  formatHealthFoodHistoryRepairResult,
  isHealthFoodHistoryRepairComplete,
  selectHealthFoodHistoryRepairRetryEntries,
} from "../src/lib/health-meal-recalculation.ts";
import {
  activateMasterTab,
  createDefaultMasterWorkspaceState,
  createMasterTab,
  getMasterTabFoodView,
  replaceFocusedMasterTabDestination,
} from "../src/lib/master-workspace-state.ts";

function createFood(id = "food-1", overrides: Partial<HealthFoodLibraryItem> = {}): HealthFoodLibraryItem {
  return {
    attribution: "Source attribution",
    barcode: "012345678905",
    brand_name: "Example Brand",
    calories: 180,
    category: "Grains",
    carbs_g: 24.5,
    created_at: "2026-10-11T12:00:00.000Z",
    fat_g: 5.25,
    food_category: "Grains",
    food_name: "Oats",
    id,
    is_favorite: true,
    nutrition_details: { dietary_fiber_g: 4.2, sodium_mg: 140 },
    protein_g: 6.15,
    provider: "open_food_facts",
    provider_item_id: "provider-oats-1",
    serving_label: "1 cup (80 g)",
    serving_size: "1 cup (80 g)",
    serving_quantity: 1,
    serving_unit: "cup",
    serving_measure_value: 80,
    serving_measure_unit: "g",
    serving_weight_amount: 80,
    serving_weight_unit: "g",
    updated_at: "2026-10-11T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function createStore() {
  return createEditingSessionStore<HealthCustomFoodEditingSessionDraft>("user-1", areHealthCustomFoodEditingSessionDraftsEqual);
}

test("new Custom Food drafts have independent per-tab identities and separate session namespaces", () => {
  const firstView = getMasterTabFoodView(createDefaultMasterWorkspaceState().panels[0].tabs[0]);
  const state = createMasterTab(createDefaultMasterWorkspaceState(), "master-panel-1", {
    id: "master-tab-second",
    destination: { kind: "page", page: "Health" },
    presentation: { healthSection: "Food" },
  }, false);
  const secondView = getMasterTabFoodView(state.panels[0].tabs.find((tab) => tab.id === "master-tab-second")!);

  assert.notEqual(firstView.newCustomFoodDraftId, secondView.newCustomFoodDraftId);
  assert.notEqual(
    healthCustomFoodNewSessionId("master-tab-first", firstView.newCustomFoodDraftId),
    healthCustomFoodNewSessionId("master-tab-second", secondView.newCustomFoodDraftId),
  );
  assert.notEqual(healthCustomFoodSavedSessionId("food-1"), healthCustomFoodNewSessionId("master-tab-first", firstView.newCustomFoodDraftId));
  assert.equal(createHealthCustomFoodDraftId().match(/^[0-9a-f-]{36}$/i)?.[0]?.length, 36);

  const store = createStore();
  const firstId = healthCustomFoodNewSessionId("master-tab-first", firstView.newCustomFoodDraftId);
  const secondId = healthCustomFoodNewSessionId("master-tab-second", secondView.newCustomFoodDraftId);
  store.ensureSession(firstId, healthCustomFoodNewCanonicalId("master-tab-first", firstView.newCustomFoodDraftId), createHealthCustomFoodNewDraft(firstView.newCustomFoodDraftId));
  store.ensureSession(secondId, healthCustomFoodNewCanonicalId("master-tab-second", secondView.newCustomFoodDraftId), createHealthCustomFoodNewDraft(secondView.newCustomFoodDraftId));
  store.updateDraft(firstId, (current) => ({ ...current, form: { ...current.form, foodName: "Oats" } }));
  store.updateDraft(secondId, (current) => ({ ...current, form: { ...current.form, foodName: "Rice" } }));

  assert.equal(store.getSnapshot(firstId)?.draft.form.foodName, "Oats");
  assert.equal(store.getSnapshot(secondId)?.draft.form.foodName, "Rice");
});

test("saved Custom Food drafts share across tabs while different definitions remain independent", () => {
  const store = createStore();
  const oats = createFood("food-oats");
  const rice = createFood("food-rice", { food_name: "Rice", id: "food-rice" });
  const oatsSessionId = healthCustomFoodSavedSessionId(oats.id);
  const riceSessionId = healthCustomFoodSavedSessionId(rice.id);
  store.ensureSession(oatsSessionId, oatsSessionId, createHealthCustomFoodSavedDraft(oats));
  store.attachView(oatsSessionId, "tab-a");
  store.ensureSession(oatsSessionId, oatsSessionId, createHealthCustomFoodSavedDraft(oats));
  store.attachView(oatsSessionId, "tab-b");
  store.ensureSession(riceSessionId, riceSessionId, createHealthCustomFoodSavedDraft(rice));
  store.attachView(riceSessionId, "tab-b");

  store.updateDraft(oatsSessionId, (current) => ({ ...current, form: { ...current.form, foodName: "Steel-cut oats" } }));
  store.updateDraft(riceSessionId, (current) => ({ ...current, form: { ...current.form, foodName: "Jasmine rice" } }));

  assert.equal(store.getSnapshot(oatsSessionId)?.draft.form.foodName, "Steel-cut oats");
  assert.equal(store.getSnapshot(oatsSessionId)?.dirty, true);
  assert.deepEqual(store.getSnapshot(oatsSessionId)?.viewIds, ["tab-a", "tab-b"]);
  assert.equal(store.getSnapshot(riceSessionId)?.draft.form.foodName, "Jasmine rice");
  assert.notEqual(oatsSessionId, riceSessionId);
});

test("new draft content survives tab navigation and panel remount under its stable workspace identity", () => {
  const store = createStore();
  const initial = createDefaultMasterWorkspaceState();
  const firstPanel = initial.panels[0];
  const firstTab = firstPanel.tabs[0];
  const firstView = getMasterTabFoodView(firstTab);
  let state = createMasterTab(initial, firstPanel.id, {
    id: "master-tab-second",
    destination: { kind: "page", page: "Health" },
    presentation: { healthSection: "Food" },
  }, false);
  const secondTab = state.panels[0].tabs.find((tab) => tab.id === "master-tab-second")!;
  const secondView = getMasterTabFoodView(secondTab);
  const firstDraftId = healthCustomFoodNewSessionId(firstTab.id, firstView.newCustomFoodDraftId);
  const secondDraftId = healthCustomFoodNewSessionId(secondTab.id, secondView.newCustomFoodDraftId);

  store.ensureSession(firstDraftId, healthCustomFoodNewCanonicalId(firstTab.id, firstView.newCustomFoodDraftId), createHealthCustomFoodNewDraft(firstView.newCustomFoodDraftId));
  store.attachView(firstDraftId, firstTab.id);
  store.updateDraft(firstDraftId, (current) => ({ ...current, form: { ...current.form, foodName: "Retained food" } }));
  store.detachView(firstTab.id);
  state = replaceFocusedMasterTabDestination(state, { kind: "page", page: "Tasks" });
  state = replaceFocusedMasterTabDestination(state, { kind: "page", page: "Health" });
  state = activateMasterTab(state, firstPanel.id, secondTab.id);
  assert.equal(getMasterTabFoodView(state.panels[0].tabs.find((tab) => tab.id === secondTab.id)!).newCustomFoodDraftId, secondView.newCustomFoodDraftId);
  store.ensureSession(secondDraftId, healthCustomFoodNewCanonicalId(secondTab.id, secondView.newCustomFoodDraftId), createHealthCustomFoodNewDraft(secondView.newCustomFoodDraftId));
  store.attachView(secondDraftId, secondTab.id);
  store.updateDraft(secondDraftId, (current) => ({ ...current, form: { ...current.form, foodName: "Other tab" } }));

  state = activateMasterTab(state, firstPanel.id, firstTab.id);
  const restoredView = getMasterTabFoodView(state.panels[0].tabs.find((tab) => tab.id === firstTab.id)!);
  const remountedDraftId = healthCustomFoodNewSessionId(firstTab.id, restoredView.newCustomFoodDraftId);
  store.ensureSession(remountedDraftId, healthCustomFoodNewCanonicalId(firstTab.id, restoredView.newCustomFoodDraftId), createHealthCustomFoodNewDraft(restoredView.newCustomFoodDraftId));
  store.attachView(remountedDraftId, firstTab.id);
  assert.equal(store.getSnapshot(remountedDraftId)?.draft.form.foodName, "Retained food");
  assert.equal(store.getSnapshot(secondDraftId)?.draft.form.foodName, "Other tab");
});

test("discard restores the latest saved baseline and clears only the chosen new draft", () => {
  const store = createStore();
  const saved = createFood("food-oats");
  const savedId = healthCustomFoodSavedSessionId(saved.id);
  store.ensureSession(savedId, savedId, createHealthCustomFoodSavedDraft(saved));
  store.updateDraft(savedId, (current) => ({ ...current, form: { ...current.form, foodName: "Unsaved name" } }));
  const latestCanonical = createFood(saved.id, { food_name: "Confirmed name", updated_at: "2026-10-11T13:00:00.000Z" });
  discardHealthCustomFoodDraft({
    store,
    draftId: savedId,
    canonicalRecordId: savedId,
    latestBaseline: createHealthCustomFoodSavedDraft(latestCanonical),
  });
  assert.equal(store.getSnapshot(savedId)?.draft.form.foodName, "Confirmed name");
  assert.equal(store.getSnapshot(savedId)?.dirty, false);

  const firstNewId = "new-draft-a";
  const secondNewId = "new-draft-b";
  const firstSessionId = healthCustomFoodNewSessionId("tab-a", firstNewId);
  const secondSessionId = healthCustomFoodNewSessionId("tab-b", secondNewId);
  const firstCanonicalId = healthCustomFoodNewCanonicalId("tab-a", firstNewId);
  const secondCanonicalId = healthCustomFoodNewCanonicalId("tab-b", secondNewId);
  store.ensureSession(firstSessionId, firstCanonicalId, createHealthCustomFoodNewDraft(firstNewId));
  store.ensureSession(secondSessionId, secondCanonicalId, createHealthCustomFoodNewDraft(secondNewId));
  store.updateDraft(firstSessionId, (current) => ({ ...current, form: { ...current.form, foodName: "Discard only this" } }));
  store.updateDraft(secondSessionId, (current) => ({ ...current, form: { ...current.form, foodName: "Keep this" } }));
  discardHealthCustomFoodDraft({ store, draftId: firstSessionId, canonicalRecordId: firstCanonicalId, latestBaseline: createHealthCustomFoodNewDraft(firstNewId) });
  assert.equal(store.getSnapshot(firstSessionId)?.draft.form.foodName, "");
  assert.equal(store.getSnapshot(secondSessionId)?.draft.form.foodName, "Keep this");
});

test("validation retains the draft and serializer preserves nutrition, serving, source, and favorite data", () => {
  const store = createStore();
  const original = createFood("food-oats");
  const sessionId = healthCustomFoodSavedSessionId(original.id);
  const savedDraft = createHealthCustomFoodSavedDraft(original);
  store.ensureSession(sessionId, sessionId, savedDraft);
  store.updateDraft(sessionId, (current) => ({ ...current, form: { ...current.form, calories: "", foodName: "Oats draft" } }));
  assert.equal(getHealthCustomFoodDraftValidationMessage(store.getSnapshot(sessionId)!.draft.form), "Calories per serving must be a valid non-negative number.");
  assert.equal(store.getSnapshot(sessionId)?.draft.form.foodName, "Oats draft");
  assert.equal(store.getSnapshot(sessionId)?.dirty, true);

  const form = {
    ...savedDraft.form,
    calories: "190",
    foodName: "Oats draft",
    servingMeasureValue: "82",
    nutritionDetails: { ...savedDraft.form.nutritionDetails, dietary_fiber_g: "4.75", sodium_mg: "150" },
  };
  const input = prepareHealthCustomFoodSaveInput(form, original);
  assert.equal(input.id, original.id);
  assert.equal(input.provider, original.provider);
  assert.equal(input.provider_item_id, original.provider_item_id);
  assert.equal(input.attribution, original.attribution);
  assert.equal(input.is_favorite, true);
  assert.equal(input.serving_measure_value, 82);
  assert.equal(input.serving_weight_amount, 82);
  assert.equal(input.serving_weight_unit, "g");
  assert.equal(input.nutrition_details?.dietary_fiber_g, 4.75);
  assert.equal(input.nutrition_details?.sodium_mg, 150);
  assert.equal(input.serving_label, "1 cup / 82 g");
  assert.equal(prepareHealthCustomFoodSaveInput({
    ...form,
    nutritionDetails: createHealthCustomFoodSavedDraft(original).form.nutritionDetails,
  }, original).nutrition_details?.sodium_mg, 140);
  const clearedNutrition = Object.fromEntries(Object.keys(form.nutritionDetails).map((key) => [key, ""])) as typeof form.nutritionDetails;
  assert.equal(prepareHealthCustomFoodSaveInput({ ...form, nutritionDetails: clearedNutrition }, original).nutrition_details, null);
});

test("failed saves and identity collisions retain a stable record ID for retry", async () => {
  const store = createStore();
  const recordId = createHealthCustomFoodDraftId();
  const draftId = healthCustomFoodNewSessionId("master-tab-a", recordId);
  store.ensureSession(draftId, healthCustomFoodNewCanonicalId("master-tab-a", recordId), createHealthCustomFoodNewDraft(recordId));
  store.attachView(draftId, "master-tab-a");
  store.updateDraft(draftId, (current) => ({ ...current, form: { ...current.form, calories: "180", foodName: "New oats" } }));
  const attemptedIds: string[] = [];

  const collision = await saveHealthCustomFoodEditingSession({
    store,
    draftId,
    save: async (draft) => {
      attemptedIds.push(draft.form.id);
      return createFood("different-food", { food_name: draft.form.foodName });
    },
  });
  assert.equal("error" in collision, true);
  assert.equal(store.getSnapshot(draftId)?.dirty, true);
  assert.equal(store.getSnapshot(draftId)?.draft.form.id, recordId);

  const failed = await saveHealthCustomFoodEditingSession({
    store,
    draftId,
    save: async (draft) => {
      attemptedIds.push(draft.form.id);
      return null;
    },
  });
  assert.equal("error" in failed, true);
  assert.equal(store.getSnapshot(draftId)?.draft.form.id, recordId);

  const saved = createFood(recordId, { calories: 180, food_name: "New oats" });
  const retried = await saveHealthCustomFoodEditingSession({
    store,
    draftId,
    save: async (draft) => {
      attemptedIds.push(draft.form.id);
      return saved;
    },
  });
  assert.deepEqual(attemptedIds, [recordId, recordId, recordId]);
  assert.deepEqual(retried, { saved });
  assert.equal(store.getSnapshot(draftId), null);
  const sharedSavedId = healthCustomFoodSavedSessionId(recordId);
  assert.equal(store.getSnapshot(sharedSavedId)?.dirty, false);
  assert.equal(store.getSnapshot(sharedSavedId)?.draft.form.foodName, "New oats");
  assert.deepEqual(store.getSnapshot(sharedSavedId)?.viewIds, []);
});

test("barcode lookup merges into only its initiating draft and preserves manual serving edits", () => {
  const draft = createHealthCustomFoodNewDraft("draft-id").form;
  const manuallyEditedDraft = { ...draft, servingQuantity: "2", servingUnit: "slices", servingMeasureValue: "", servingMeasureUnit: "" as const };
  const result = {
    attribution: "Open Food Facts",
    barcode: "012345678905",
    brandName: "Lookup brand",
    calories: 120,
    carbs: 20,
    foodCategory: "Grains",
    fat: 2,
    foodName: "Lookup oats",
    nutritionBasis: "serving" as const,
    nutritionDetails: { dietary_fiber_g: 4.5 },
    protein: 5,
    provider: "open_food_facts" as const,
    providerItemId: "provider-item-1",
    servingLabel: "1 cup (80 g)",
    servingMeasureUnit: "g" as const,
    servingMeasureValue: 80,
    servingQuantity: 1,
    servingUnit: "cup",
  };
  assert.equal(isCurrentHealthCustomFoodBarcodeLookup({ activeDraftId: "food-a", requestDraftId: "food-a", currentGeneration: 3, requestGeneration: 3 }), true);
  assert.equal(isCurrentHealthCustomFoodBarcodeLookup({ activeDraftId: "food-b", requestDraftId: "food-a", currentGeneration: 3, requestGeneration: 3 }), false);
  assert.equal(isCurrentHealthCustomFoodBarcodeLookup({ activeDraftId: "food-a", requestDraftId: "food-a", currentGeneration: 4, requestGeneration: 3 }), false);
  const merged = applyHealthCustomFoodBarcodeLookup({
    activeDraftId: "food-a",
    currentGeneration: 3,
    draft: manuallyEditedDraft,
    requestDraftId: "food-a",
    requestGeneration: 3,
    result,
    scannedBarcode: "012345678905",
  });
  assert.equal(merged?.foodName, "Lookup oats");
  assert.equal(merged?.servingQuantity, "2");
  assert.equal(merged?.servingUnit, "slices");
  assert.equal(merged?.provider, "open_food_facts");
  assert.equal(merged?.providerItemId, "provider-item-1");
  assert.equal(merged?.attribution, "Open Food Facts");
  assert.equal(merged?.nutritionDetails.dietary_fiber_g, "4.5");
  assert.equal(applyHealthCustomFoodBarcodeLookup({
    activeDraftId: "food-b",
    currentGeneration: 3,
    draft,
    requestDraftId: "food-a",
    requestGeneration: 3,
    result,
    scannedBarcode: "012345678905",
  }), null);
});

test("deletion is blocked while a shared definition session is dirty or saving", () => {
  assert.equal(canDeleteHealthCustomFoodSession({ dirty: true, isSaving: false }), false);
  assert.equal(canDeleteHealthCustomFoodSession({ dirty: false, isSaving: true }), false);
  assert.equal(canDeleteHealthCustomFoodSession({ dirty: false, isSaving: false }), true);
  assert.equal(canDeleteHealthCustomFoodSession(null), true);
});

test("history repair retry scopes only unfinished IDs and reports partial work as incomplete", () => {
  const entries = [{ id: "done-1" }, { id: "pending-1" }, { id: "done-2" }, { id: "pending-2" }];
  assert.deepEqual(selectHealthFoodHistoryRepairRetryEntries(entries, ["pending-2"]), [{ id: "pending-2" }]);
  assert.deepEqual(selectHealthFoodHistoryRepairRetryEntries(entries, null), entries);
  assert.deepEqual(selectHealthFoodHistoryRepairRetryEntries(entries, []), []);
  assert.equal(isHealthFoodHistoryRepairComplete({ requested: 4, updated: 2, skipped: 1, failed: 1, failureMessages: [], pendingEntryIds: ["pending-1", "pending-2"] }), false);
  assert.equal(isHealthFoodHistoryRepairComplete({ requested: 2, updated: 2, skipped: 0, failed: 0, failureMessages: [], pendingEntryIds: [] }), true);
  assert.equal(isHealthFoodHistoryRepairComplete({ requested: 2, updated: 2, skipped: 0, failed: 0, failureMessages: [], pendingEntryIds: null }), false);
  const message = formatHealthFoodHistoryRepairResult({ requested: 0, updated: 0, skipped: 0, failed: 1, failureMessages: ["Network unavailable"], pendingEntryIds: null });
  assert.match(message, /could not be checked/);
  assert.match(message, /Retry Update Previous Logs/);
  assert.doesNotMatch(message, /No previous logs were found/);
});

test("exact-record reconciliation allows PostgreSQL numeric normalization but rejects another ID or owner", () => {
  const expected = createFood("food-exact", { protein_g: 6.156, carbs_g: 24.504, fat_g: 5.254 });
  const normalized = createFood("food-exact", { protein_g: 6.16, carbs_g: 24.5, fat_g: 5.25 });
  assert.equal(healthCustomFoodWriteMatchesCanonicalRow(normalized, expected, "user-1"), true);
  assert.equal(healthCustomFoodWriteMatchesCanonicalRow(
    createFood("food-exact", { protein_g: 6.16, carbs_g: 24.5, fat_g: 5.25 }),
    createFood("food-exact", { protein_g: 6.151, carbs_g: 24.5, fat_g: 5.25 }),
    "user-1",
  ), false);
  assert.equal(healthCustomFoodWriteMatchesCanonicalRow(createFood("food-other"), expected, "user-1"), false);
  assert.equal(healthCustomFoodWriteMatchesCanonicalRow(normalized, expected, "user-2"), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import type { HealthMealEntry, HealthMealPlanEntry, HealthMealPlanEntryInsert } from "../src/lib/database.types.ts";
import { createEditingSessionStore } from "../src/lib/editing-session-store.ts";
import {
  createDefaultMealDraft,
  createHealthFoodEditingSessionDraft,
  healthMealNewEntrySessionId,
} from "../src/lib/health-meal-draft.ts";
import {
  areHealthMealPlanEditingSessionDraftsEqual,
  createHealthMealPlanEditingSessionDraft,
  ensureHealthMealPlanNewSession,
  ensureHealthMealPlanSavedSession,
  healthMealPlanEntrySessionId,
  healthMealPlanNewEntryCanonicalId,
  healthMealPlanNewEntrySessionId,
  openHealthMealPlanComposerForSlot,
  runHealthMealPlanLifecycleAction,
  saveHealthMealPlanEditingSession,
  type HealthMealPlanEditingSessionDraft,
} from "../src/lib/health-meal-plan-editing-session.ts";
import {
  buildActualMealEntryInputFromPlan,
  recordHealthMealPlanPendingUpsert,
  reconcileHealthMealPlanConfirmation,
  replayHealthMealPlanPendingMutations,
  sumHealthMealPlanNutritionForDate,
} from "../src/lib/health-meal-planning.ts";
import { healthMealPlanEntryInsertMatches, reconcileHealthMealPlanEntryInsert } from "../src/lib/health-meal-draft.ts";
import { sumMealNutritionForDate } from "../src/lib/health-utils.ts";
import { createDefaultMasterFoodWorkspaceView, initializeMasterWorkspaceState, updateMasterTabFoodView } from "../src/lib/master-workspace-state.ts";
import { DEFAULT_TASK_WORKSPACE_TABS_STATE } from "../src/lib/task-ui-state.ts";

const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const healthHookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");

function foodSnapshot() {
  return {
    attribution: "Custom Food",
    barcode: null,
    brand_name: "Kitchen",
    calories: 160.5,
    carbs_g: 20.1,
    fat_g: 4.25,
    food_category: "Breakfast",
    food_name: "Overnight oats",
    nutrition_details: { fiber_g: 4.2 },
    protein_g: 8.125,
    provider: "manual",
    provider_item_id: "food-oats",
    serving_label: "1 cup",
    serving_quantity: 1,
    serving_unit: "cup",
    serving_measure_value: null,
    serving_measure_unit: null,
    serving_weight_amount: null,
    serving_weight_unit: null,
    source_food_id: "food-oats-id",
  };
}

function nutritionSnapshot() {
  return {
    calories: 242.8,
    carbs_g: 32.1,
    fat_g: 6.005,
    nutrition_details: { fiber_g: 6.3, sodium_mg: 95 },
    protein_g: 12.345,
  };
}

function plan(overrides: Partial<HealthMealPlanEntry> = {}): HealthMealPlanEntry {
  return {
    attribution: "Custom Food",
    barcode: null,
    brand_name: "Kitchen",
    calories: 243,
    carbs_g: 32.1,
    confirmed_at: null,
    confirmed_meal_entry_id: null,
    consumed_quantity: 1.5,
    consumed_unit: "serving",
    created_at: "2026-10-11T12:00:00.000Z",
    fat_g: 6.01,
    food_name: "Overnight oats",
    food_snapshot: foodSnapshot(),
    id: "plan-1",
    meal_slot: "dinner",
    nutrition_snapshot: nutritionSnapshot(),
    planned_at: "2026-10-12T22:30:00.000Z",
    planned_date: "2026-10-12",
    planned_time: "18:30",
    protein_g: 12.35,
    provider: "manual",
    provider_item_id: "food-oats",
    serving_fraction: 1.5,
    serving_label: "1.5 servings / 1 cup",
    source_food_id: "food-oats-id",
    updated_at: "2026-10-11T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function planInput(id: string, draft?: HealthMealPlanEditingSessionDraft): Omit<HealthMealPlanEntryInsert, "user_id"> {
  const mealDraft = draft?.mealDraft;
  return {
    attribution: "Custom Food",
    barcode: null,
    brand_name: "Kitchen",
    calories: 243,
    carbs_g: 32.1,
    consumed_quantity: 1.5,
    consumed_unit: "serving",
    fat_g: 6.005,
    food_name: mealDraft?.foodName || "Overnight oats",
    food_snapshot: foodSnapshot(),
    id,
    meal_slot: mealDraft?.mealSlot ?? "dinner",
    nutrition_snapshot: nutritionSnapshot(),
    planned_at: "2026-10-12T22:30:00.000Z",
    planned_date: mealDraft?.date ?? "2026-10-12",
    planned_time: mealDraft?.time ?? "18:30",
    protein_g: 12.345,
    provider: "manual",
    provider_item_id: "food-oats",
    serving_fraction: 1.5,
    serving_label: "1.5 servings / 1 cup",
    source_food_id: "food-oats-id",
  };
}

function postgrestPlan(input: Omit<HealthMealPlanEntryInsert, "user_id">): HealthMealPlanEntry {
  return {
    ...plan(),
    ...input,
    calories: Number(input.calories),
    carbs_g: input.carbs_g == null ? null : Number(Number(input.carbs_g).toFixed(2)),
    fat_g: input.fat_g == null ? null : input.fat_g === 6.005 ? 6.01 : Number(Number(input.fat_g).toFixed(2)),
    planned_at: "2026-10-12T18:30:00-04:00",
    planned_time: `${input.planned_time}:00`,
    protein_g: input.protein_g == null ? null : Number(Number(input.protein_g).toFixed(2)),
    user_id: "user-1",
  };
}

function createPlanStore() {
  return createEditingSessionStore<HealthMealPlanEditingSessionDraft>("user-1", areHealthMealPlanEditingSessionDraftsEqual);
}

test("new Planned Meal gets its own per-tab session and never reuses actual Food identity", () => {
  const firstView = createDefaultMasterFoodWorkspaceView();
  const secondView = createDefaultMasterFoodWorkspaceView();
  assert.notEqual(firstView.newPlannedMealDraftId, secondView.newPlannedMealDraftId);
  assert.notEqual(firstView.newPlannedMealDraftId, firstView.newMealDraftId);
  assert.notEqual(secondView.newPlannedMealDraftId, secondView.newMealDraftId);

  const store = createPlanStore();
  const firstDraftId = healthMealPlanNewEntrySessionId(firstView.newPlannedMealDraftId);
  const secondDraftId = healthMealPlanNewEntrySessionId(secondView.newPlannedMealDraftId);
  const firstInitial = createHealthMealPlanEditingSessionDraft("new-plan", firstView.newPlannedMealDraftId, {
    ...createDefaultMealDraft("lunch"), date: "2026-10-12", mealSlot: "lunch",
  });
  const secondInitial = createHealthMealPlanEditingSessionDraft("new-plan", secondView.newPlannedMealDraftId, {
    ...createDefaultMealDraft("dinner"), date: "2026-10-13", mealSlot: "dinner",
  });
  ensureHealthMealPlanNewSession({ store, draftId: firstDraftId, canonicalRecordId: healthMealPlanNewEntryCanonicalId(firstView.newPlannedMealDraftId), initialDraft: firstInitial, viewId: "tab-a" });
  ensureHealthMealPlanNewSession({ store, draftId: secondDraftId, canonicalRecordId: healthMealPlanNewEntryCanonicalId(secondView.newPlannedMealDraftId), initialDraft: secondInitial, viewId: "tab-b" });

  store.updateDraft(firstDraftId, (current) => ({ ...current, mealDraft: { ...current.mealDraft, foodName: "First tab oats" } }));
  assert.equal(store.getSnapshot(firstDraftId)?.draft.mealDraft.foodName, "First tab oats");
  assert.equal(store.getSnapshot(secondDraftId)?.draft.mealDraft.foodName, "");

  const actualStore = createEditingSessionStore("user-1", (left, right) => JSON.stringify(left) === JSON.stringify(right));
  const actualId = healthMealNewEntrySessionId(firstView.newMealDraftId);
  actualStore.ensureSession(actualId, `unsaved-health-meal:${firstView.newMealDraftId}`, createHealthFoodEditingSessionDraft(createDefaultMealDraft("lunch")));
  assert.equal(actualStore.getSnapshot(actualId)?.draft.kind, "new-entry");
  assert.equal(store.getSnapshot(firstDraftId)?.draft.kind, "new-plan");
});

test("Plan Food opens with its date and slot; changing history presentation and remounting retain draft contents", () => {
  const view = createDefaultMasterFoodWorkspaceView();
  const store = createPlanStore();
  const draftId = healthMealPlanNewEntrySessionId(view.newPlannedMealDraftId);
  const initialDraft = createHealthMealPlanEditingSessionDraft("new-plan", view.newPlannedMealDraftId, {
    ...createDefaultMealDraft("breakfast"), date: "2026-10-11", mealSlot: "breakfast",
  });
  const opened = openHealthMealPlanComposerForSlot({
    store,
    draftId,
    canonicalRecordId: healthMealPlanNewEntryCanonicalId(view.newPlannedMealDraftId),
    initialDraft,
    historyDate: "2026-10-12",
    mealSlot: "dinner",
    viewId: "tab-a",
  });
  assert.equal(opened.preserved, false);
  assert.equal(opened.session.draft.mealDraft.date, "2026-10-12");
  assert.equal(opened.session.draft.mealDraft.mealSlot, "dinner");
  store.updateDraft(draftId, (current) => ({
    ...current,
    mealDraft: { ...current.mealDraft, foodName: "Saved-in-progress", date: "2026-10-14" },
  }));

  const workspace = initializeMasterWorkspaceState("Health", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Food");
  const tab = workspace.panels[0].tabs[0];
  const changedHistory = updateMasterTabFoodView(workspace, workspace.panels[0].id, tab.id, (current) => ({ ...current, historyDate: "2026-10-22" }));
  assert.equal(changedHistory.panels[0].tabs[0].presentation.foodView?.historyDate, "2026-10-22");
  assert.equal(store.getSnapshot(draftId)?.draft.mealDraft.date, "2026-10-14");

  const reopened = ensureHealthMealPlanNewSession({
    store,
    draftId,
    canonicalRecordId: healthMealPlanNewEntryCanonicalId(view.newPlannedMealDraftId),
    initialDraft: createHealthMealPlanEditingSessionDraft("new-plan", view.newPlannedMealDraftId, { ...createDefaultMealDraft("snack"), date: "2026-10-22", mealSlot: "snack" }),
    viewId: "tab-a",
  });
  assert.equal(reopened?.draft.mealDraft.foodName, "Saved-in-progress");
  assert.equal(reopened?.draft.mealDraft.date, "2026-10-14");
  assert.equal(reopened?.draft.mealDraft.mealSlot, "dinner");
});

test("saved plans share one canonical session across tabs while different plans stay independent", () => {
  const store = createPlanStore();
  const firstPlan = plan({ id: "plan-a" });
  const secondPlan = plan({ id: "plan-b", food_name: "Different plan", food_snapshot: { ...foodSnapshot(), food_name: "Different plan" } });
  ensureHealthMealPlanSavedSession({ store, plan: firstPlan, viewId: "tab-a" });
  ensureHealthMealPlanSavedSession({ store, plan: firstPlan, viewId: "tab-b" });
  ensureHealthMealPlanSavedSession({ store, plan: secondPlan, viewId: "tab-c" });
  const firstId = healthMealPlanEntrySessionId(firstPlan.id);
  const secondId = healthMealPlanEntrySessionId(secondPlan.id);
  let firstSessionUpdates = 0;
  const unsubscribe = store.subscribeToSession(firstId, () => { firstSessionUpdates += 1; });
  store.updateDraft(firstId, (current) => ({ ...current, mealDraft: { ...current.mealDraft, foodName: "Shared edit" } }));
  assert.equal(store.getSnapshot(firstId)?.draft.mealDraft.foodName, "Shared edit");
  assert.equal(store.getSnapshot(secondId)?.draft.mealDraft.foodName, "Different plan");
  assert.equal(firstSessionUpdates, 1);
  unsubscribe();
});

test("saved-plan save, reopen, and discard use the shared session baseline", async () => {
  const store = createPlanStore();
  const savedPlan = plan({ id: "plan-reopen" });
  const draftId = healthMealPlanEntrySessionId(savedPlan.id);
  ensureHealthMealPlanSavedSession({ store, plan: savedPlan, viewId: "tab-a" });
  store.updateDraft(draftId, (current) => ({ ...current, mealDraft: { ...current.mealDraft, foodName: "Saved edit" } }));
  assert.equal(await saveHealthMealPlanEditingSession({
    store,
    draftId,
    save: async (draft) => ({ savedDraft: draft }),
  }), true);
  assert.equal(store.getSnapshot(draftId)?.dirty, false);
  ensureHealthMealPlanSavedSession({
    store,
    plan: { ...savedPlan, food_name: "Saved edit", food_snapshot: { ...foodSnapshot(), food_name: "Saved edit" } },
    viewId: "tab-b",
  });
  assert.equal(store.getSnapshot(draftId)?.draft.mealDraft.foodName, "Saved edit");
  store.updateDraft(draftId, (current) => ({ ...current, mealDraft: { ...current.mealDraft, foodName: "Discard this edit" } }));
  assert.equal(store.discardDraft(draftId), true);
  assert.equal(store.getSnapshot(draftId)?.draft.mealDraft.foodName, "Saved edit");
});

test("failed plan save retains the exact draft and reports an actionable error", async () => {
  const store = createPlanStore();
  const draftId = healthMealPlanNewEntrySessionId("new-plan-id");
  const draft = createHealthMealPlanEditingSessionDraft("new-plan", "new-plan-id", { ...createDefaultMealDraft("dinner"), date: "2026-10-12", mealSlot: "dinner" });
  store.ensureSession(draftId, healthMealPlanNewEntryCanonicalId("new-plan-id"), draft);
  store.attachView(draftId, "tab-a");
  store.updateDraft(draftId, (current) => ({ ...current, mealDraft: { ...current.mealDraft, foodName: "Retry oats", calories: "243" } }));
  const attemptedDraft = store.getSnapshot(draftId)!.draft;
  assert.equal(await saveHealthMealPlanEditingSession({
    store,
    draftId,
    save: async () => ({ error: "The plan write could not be confirmed; retry with this draft." }),
  }), false);
  assert.deepEqual(store.getSnapshot(draftId)?.draft, attemptedDraft);
  assert.equal(store.getSnapshot(draftId)?.dirty, true);
  assert.match(store.getSnapshot(draftId)?.saveError ?? "", /retry with this draft/);
});

test("ambiguous acknowledgment retry reconciles by stable plan ID without duplicating the record", async () => {
  const store = createPlanStore();
  const persisted = new Map<string, HealthMealPlanEntry>();
  const draftId = healthMealPlanNewEntrySessionId("stable-plan-id");
  const initial = createHealthMealPlanEditingSessionDraft("new-plan", "stable-plan-id", {
    ...createDefaultMealDraft("dinner"), date: "2026-10-12", time: "18:30", mealSlot: "dinner",
  });
  store.ensureSession(draftId, healthMealPlanNewEntryCanonicalId("stable-plan-id"), initial);
  store.attachView(draftId, "tab-a");
  store.updateDraft(draftId, (current) => ({ ...current, mealDraft: { ...current.mealDraft, foodName: "Overnight oats", calories: "243" } }));
  let attempts = 0;
  const save = async (draft: HealthMealPlanEditingSessionDraft) => {
    const input = planInput(draft.planId, draft);
    attempts += 1;
    const existing = persisted.get(draft.planId);
    if (!existing) persisted.set(draft.planId, postgrestPlan(input));
    const result = existing
      ? { data: null, error: { code: "23505", message: "duplicate plan ID" } }
      : { data: null, error: { code: "08006", message: "write acknowledgment was lost" } };
    const reconciled = await reconcileHealthMealPlanEntryInsert({
      input,
      result,
      lookupById: async (id) => ({
        row: persisted.get(id) ?? null,
        error: attempts === 1 ? "exact plan lookup was unavailable" : null,
      }),
    });
    if (!reconciled.row) return { error: reconciled.error ?? "Plan save failed." } as const;
    return { savedDraft: draft } as const;
  };

  assert.equal(await saveHealthMealPlanEditingSession({ store, draftId, removeAfterSuccess: true, save }), false);
  assert.equal(store.getSnapshot(draftId)?.dirty, true);
  assert.match(store.getSnapshot(draftId)?.saveError ?? "", /lookup was unavailable/);
  assert.equal(persisted.size, 1);
  assert.equal(await saveHealthMealPlanEditingSession({ store, draftId, removeAfterSuccess: true, save }), true);
  assert.equal(attempts, 2);
  assert.equal(persisted.size, 1);
  assert.equal(store.getSnapshot(draftId), null);
  const saved = persisted.get("stable-plan-id");
  assert.ok(saved);
  assert.equal(saved.id, "stable-plan-id");
  assert.equal(saved.planned_date, "2026-10-12");
  assert.equal(saved.meal_slot, "dinner");
  assert.equal(saved.source_food_id, "food-oats-id");
  assert.equal(saved.food_snapshot?.source_food_id, "food-oats-id");
  assert.equal(saved.protein_g, 12.35);
  assert.equal(saved.food_snapshot?.calories, 160.5);
});

test("plan insert reconciliation matches PostgreSQL timestamp, numeric, and JSONB normalization", async () => {
  const input = planInput("stable-id");
  const row = postgrestPlan(input);
  assert.equal(healthMealPlanEntryInsertMatches(row, input), true);
  assert.equal(healthMealPlanEntryInsertMatches({ ...row, planned_at: "2026-10-12T22:30:00.001Z" }, input), false);
  assert.equal(healthMealPlanEntryInsertMatches({ ...row, fat_g: 6.02 }, input), false);
  assert.equal(healthMealPlanEntryInsertMatches({ ...row, food_snapshot: { ...foodSnapshot(), source_food_id: "different" } }, input), false);

  const reconciled = await reconcileHealthMealPlanEntryInsert({
    input,
    result: { data: null, error: { code: "08006", message: "connection closed after insert" } },
    lookupById: async (id) => ({ row: id === "stable-id" ? row : null }),
  });
  assert.equal(reconciled.row?.id, "stable-id");
  assert.equal(reconciled.error, null);
});

test("pending local Meal Plan recovery replays one ID and preserves per-user visibility", () => {
  const localPlan = plan({ id: "pending-plan", user_id: "someone-else" });
  const journal = recordHealthMealPlanPendingUpsert({}, localPlan);
  const recovered = replayHealthMealPlanPendingMutations([], journal, "user-1");
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0]?.id, "pending-plan");
  assert.equal(recovered[0]?.user_id, "user-1");
  assert.equal(replayHealthMealPlanPendingMutations(recovered, journal, "user-1").length, 1);
});

test("planned totals stay separate from consumed calories until idempotent Done reconciliation", () => {
  const savedPlan = plan({ id: "confirmed-plan" });
  const actualEntries: HealthMealEntry[] = [];
  assert.equal(sumHealthMealPlanNutritionForDate([savedPlan], savedPlan.planned_date).calories, 242.8);
  assert.equal(sumMealNutritionForDate(actualEntries, savedPlan.planned_date).calories, 0);

  const actualInput = buildActualMealEntryInputFromPlan(savedPlan, {
    entryDate: "2026-10-13",
    loggedAt: "2026-10-13T12:00:00.000Z",
  });
  const actualEntry: HealthMealEntry = {
    ...actualInput,
    id: savedPlan.confirmed_meal_entry_id ?? "confirmed-actual-id",
    created_at: "2026-10-13T12:00:00.000Z",
    updated_at: "2026-10-13T12:00:00.000Z",
    user_id: "user-1",
    calories: actualInput.calories,
    carbs_g: actualInput.carbs_g ?? null,
    fat_g: actualInput.fat_g ?? null,
    protein_g: actualInput.protein_g ?? null,
  };
  const firstDone = reconcileHealthMealPlanConfirmation({
    mealEntries: actualEntries,
    mealPlanEntries: [savedPlan],
    planId: savedPlan.id,
    actualEntry,
    confirmedAt: "2026-10-13T12:00:00.000Z",
  });
  const retryDone = reconcileHealthMealPlanConfirmation({
    ...firstDone,
    planId: savedPlan.id,
    actualEntry,
    confirmedAt: "2026-10-13T12:00:00.000Z",
  });
  assert.equal(firstDone.mealEntries.length, 1);
  assert.equal(retryDone.mealEntries.length, 1);
  assert.equal(retryDone.mealEntries[0]?.id, "confirmed-actual-id");
  assert.equal(retryDone.mealPlanEntries[0]?.confirmed_meal_entry_id, "confirmed-actual-id");
  assert.equal(retryDone.mealEntries[0]?.source_food_id, savedPlan.source_food_id);
  assert.equal(retryDone.mealEntries[0]?.food_snapshot?.source_food_id, savedPlan.source_food_id);
  assert.equal(retryDone.mealEntries[0]?.consumed_quantity, savedPlan.consumed_quantity);
});

test("Done and Remove stay blocked while a shared saved-plan draft is dirty", async () => {
  for (const actionName of ["Done", "Remove"]) {
    const store = createPlanStore();
    const savedPlan = plan({ id: `plan-${actionName.toLowerCase()}` });
    const draftId = healthMealPlanEntrySessionId(savedPlan.id);
    ensureHealthMealPlanSavedSession({ store, plan: savedPlan, viewId: "tab-a" });
    store.updateDraft(draftId, (current) => ({ ...current, mealDraft: { ...current.mealDraft, foodName: "Dirty edit" } }));
    let actionCalls = 0;
    const blocked = await runHealthMealPlanLifecycleAction({
      store,
      draftId,
      action: async () => { actionCalls += 1; return true; },
      errorMessage: `${actionName} failed`,
    });
    assert.equal(blocked.blockedByDraft, true);
    assert.equal(blocked.success, false);
    assert.equal(actionCalls, 0);
    assert.equal(store.getSnapshot(draftId)?.draft.mealDraft.foodName, "Dirty edit");
    store.discardDraft(draftId);
    const completed = await runHealthMealPlanLifecycleAction({
      store,
      draftId,
      action: async () => { actionCalls += 1; return true; },
      errorMessage: `${actionName} failed`,
    });
    assert.equal(completed.success, true);
    assert.equal(actionCalls, 1);
    assert.equal(store.getSnapshot(draftId), null);
  }
});

test("plan session setup converges without repeated store updates", () => {
  const store = createPlanStore();
  const initial = createHealthMealPlanEditingSessionDraft("new-plan", "stable-id", createDefaultMealDraft("lunch"));
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });
  const setup = { store, draftId: healthMealPlanNewEntrySessionId("stable-id"), canonicalRecordId: healthMealPlanNewEntryCanonicalId("stable-id"), initialDraft: initial, viewId: "tab-a" };
  ensureHealthMealPlanNewSession(setup);
  const afterFirstSetup = store.getStoreSnapshot().revision;
  ensureHealthMealPlanNewSession(setup);
  assert.equal(store.getStoreSnapshot().revision, afterFirstSetup);
  assert.equal(notifications, 2);
});

test("production wiring keeps plan and actual Food stores separate and history date out of draft-date edits", () => {
  assert.match(taskAppSource, /healthMealPlanDraftSessionStore = useMemo/);
  assert.match(taskAppSource, /mealPlanSessionStore=\{masterWorkspace\.isEnabled \? healthMealPlanDraftSessionStore : null\}/);
  assert.match(pageSource, /openHealthMealPlanComposerForSlot\(/);
  assert.match(pageSource, /onChange=\{\(value\) => setMealDraft\(\(current\) => \(\{ \.\.\.current, date: value \}\)\)\}/);
  assert.doesNotMatch(pageSource.match(/<Field label="Planned date">[\s\S]*?<\/Field>/)?.[0] ?? "", /setFoodHistoryDate/);
  assert.match(healthHookSource, /\.eq\("id", id\)[\s\S]*?\.eq\("user_id", userId\)/);
});

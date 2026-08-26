import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { HealthMealPlanEntry, HealthMealFoodSnapshot, HealthMealEntry } from "../src/lib/database.types.ts";
import {
  buildActualMealEntryInputFromPlan,
  buildHealthMealPlanPayload,
  getActiveHealthMealPlans,
  isHealthMealPlanConfirmEligible,
  sumHealthMealPlanNutritionForDate,
} from "../src/lib/health-meal-planning.ts";
import { sumMealNutritionForDate } from "../src/lib/health-utils.ts";
import { createDefaultMealDraft } from "../src/lib/health-meal-draft.ts";

const pageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/add_health_meal_planning_7_11_61.sql", import.meta.url), "utf8");
const correctionMigrationSource = readFileSync(new URL("../supabase/fix_health_meal_plan_done_ambiguity_7_11_63.sql", import.meta.url), "utf8");

function plan(overrides: Partial<HealthMealPlanEntry> = {}): HealthMealPlanEntry {
  return {
    attribution: "Custom Food",
    barcode: "0123456789012",
    brand_name: "Kitchen",
    calories: 300,
    carbs_g: 20,
    confirmed_at: null,
    confirmed_meal_entry_id: null,
    consumed_quantity: 2,
    consumed_unit: "serving",
    created_at: "2026-08-25T12:00:00.000Z",
    fat_g: 10,
    food_name: "Chicken",
    food_snapshot: foodSnapshot(),
    id: "plan-1",
    meal_slot: "dinner",
    nutrition_snapshot: {
      calories: 300,
      carbs_g: 20,
      fat_g: 10,
      nutrition_details: { sodium_mg: 500 },
      protein_g: 35,
    },
    planned_at: "2026-08-25T23:00:00.000Z",
    planned_date: "2026-08-25",
    planned_time: "19:00",
    protein_g: 35,
    provider: "manual",
    provider_item_id: "food-v1",
    serving_fraction: 2,
    serving_label: "2 servings / 1 serving",
    source_food_id: "food-1",
    updated_at: "2026-08-25T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function foodSnapshot(): HealthMealFoodSnapshot {
  return {
    attribution: "Custom Food",
    barcode: "0123456789012",
    brand_name: "Kitchen",
    calories: 150,
    carbs_g: 10,
    fat_g: 5,
    food_category: "Dinner",
    food_name: "Chicken",
    nutrition_details: { sodium_mg: 250 },
    protein_g: 17.5,
    provider: "manual",
    provider_item_id: "food-v1",
    serving_label: "1 serving",
    serving_measure_unit: null,
    serving_measure_value: null,
    serving_quantity: 1,
    serving_unit: "serving",
    source_food_id: "food-1",
  };
}

function actual(overrides: Partial<HealthMealEntry> = {}): HealthMealEntry {
  return {
    attribution: null,
    barcode: null,
    brand_name: null,
    calories: 100,
    carbs_g: 10,
    created_at: "2026-08-25T10:00:00.000Z",
    entry_date: "2026-08-25",
    fat_g: 2,
    food_name: "Coffee",
    id: "actual-1",
    logged_at: "2026-08-25T10:00:00.000Z",
    meal_slot: "breakfast",
    nutrition_snapshot: { calories: 100, carbs_g: 10, fat_g: 2, protein_g: 1 },
    protein_g: 1,
    provider: "manual",
    provider_item_id: null,
    serving_label: "1 cup",
    updated_at: "2026-08-25T10:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

test("planned rows are a separate authority and cannot change actual totals, history, or active plans", () => {
  const planned = plan();
  const actualRows = [actual()];
  assert.equal(sumMealNutritionForDate(actualRows, "2026-08-25").calories, 100);
  assert.equal(sumHealthMealPlanNutritionForDate([planned], "2026-08-25").calories, 300);
  assert.deepEqual(getActiveHealthMealPlans([planned], "2026-08-25").map((entry) => entry.id), ["plan-1"]);
  assert.equal(getActiveHealthMealPlans([planned], "2026-08-24").length, 0);
  assert.equal(actualRows.length, 1);
});
test("planned expanded nutrition preserves unknown coverage instead of converting it to zero", () => {
  const totals = sumHealthMealPlanNutritionForDate([plan()], "2026-08-25");
  assert.deepEqual(totals.nutrition_details, { sodium_mg: 500 });
  assert.equal(totals.nutrition_coverage?.sodium_mg?.complete, true);
  assert.equal(totals.nutrition_coverage?.dietary_fiber_g, undefined);
});

test("confirmation input copies the current plan snapshot exactly and never looks up the source food", () => {
  const currentPlan = plan({
    calories: 320,
    food_snapshot: { ...foodSnapshot(), calories: 160, nutrition_details: { sodium_mg: 275 } },
    nutrition_snapshot: { calories: 320, carbs_g: 22, fat_g: 11, nutrition_details: { sodium_mg: 550 }, protein_g: 36 },
    confirmed_meal_entry_id: "actual-from-rpc",
  });
  const input = buildActualMealEntryInputFromPlan(currentPlan, { entryDate: "2026-08-26", loggedAt: "2026-08-26T21:42:00.000Z" });
  assert.equal(input.id, "actual-from-rpc");
  assert.equal(input.calories, 320);
  assert.equal(input.entry_date, "2026-08-26");
  assert.equal(input.logged_at, "2026-08-26T21:42:00.000Z");
  assert.equal(input.meal_slot, currentPlan.meal_slot);
  assert.deepEqual(input.food_snapshot, currentPlan.food_snapshot);
  assert.deepEqual(input.nutrition_snapshot, currentPlan.nutrition_snapshot);
});

test("plan payload stores selected date, slot, time, serving fraction, and immutable snapshots", () => {
  const draft = createDefaultMealDraft("lunch", new Date(2026, 7, 25, 8, 0));
  const payload = buildHealthMealPlanPayload({
    calculation: {
      consumed: { quantity: 1.5, unit: "serving" },
      nutrientTotals: { calories: 225, carbs_g: 15, fat_g: 7.5, nutrition_details: { sodium_mg: 375 }, protein_g: 26.25 },
      servingFraction: 1.5,
    },
    draft: { ...draft, barcode: "0123456789012", foodName: "Chicken", sourceFoodId: "food-v1" },
    foodSnapshot: foodSnapshot(),
    mealSlot: "lunch",
    plannedDate: "2026-08-27",
    plannedTime: "19:00",
  });
  assert.equal(payload.planned_date, "2026-08-27");
  assert.equal(payload.planned_time, "19:00");
  assert.equal(payload.meal_slot, "lunch");
  assert.equal(payload.serving_fraction, 1.5);
  assert.deepEqual(payload.food_snapshot, foodSnapshot());
  assert.deepEqual(payload.nutrition_snapshot?.nutrition_details, { sodium_mg: 375 });
});

test("future and past plans can be marked Done; only invalid or confirmed plans are ineligible", () => {
  const futurePlan = plan({
    planned_at: "2026-08-27T23:00:00.000Z",
    planned_date: "2026-08-27",
    planned_time: "19:00",
  });
  const pastPlan = plan({
    planned_at: "2026-08-20T23:00:00.000Z",
    planned_date: "2026-08-20",
    planned_time: "19:00",
  });
  assert.equal(isHealthMealPlanConfirmEligible(futurePlan), true);
  assert.equal(isHealthMealPlanConfirmEligible(pastPlan), true);
  assert.equal(isHealthMealPlanConfirmEligible(plan({ planned_time: "not-a-time" })), false);
  assert.equal(isHealthMealPlanConfirmEligible(plan({ confirmed_at: "2026-08-25T23:05:00.000Z", confirmed_meal_entry_id: "actual-1" })), false);
});

test("confirmed rows stop appearing as active plans and retain their audit anchor", () => {
  const confirmed = plan({ confirmed_at: "2026-08-25T23:05:00.000Z", confirmed_meal_entry_id: "actual-1" });
  assert.deepEqual(getActiveHealthMealPlans([confirmed], "2026-08-25"), []);
  assert.equal(confirmed.confirmed_meal_entry_id, "actual-1");
});

test("Health production wiring keeps meal plans out of actual and achievement inputs", () => {
  assert.match(hookSource, /mealPlanEntries/);
  assert.match(hookSource, /from\("adhdice_health_meal_plan_entries"\)/);
  assert.match(hookSource, /adhdice_confirm_health_meal_plan_entry/);
  assert.match(hookSource, /getEligibleHealthAchievements\(\{[\s\S]*?mealEntries: snapshot\.mealEntries/);
  assert.doesNotMatch(hookSource.slice(hookSource.indexOf("function addMealPlanEntry"), hookSource.indexOf("async function updateMealPlanEntry")), /addMealEntry\(/);
  assert.match(pageSource, /mealEditorMode/);
  assert.match(pageSource, /\+ Plan Food/);
  assert.match(pageSource, /Add to Plan/);
  assert.match(pageSource, />Done<\/button>/);
  assert.match(pageSource, /selectedPlannedNutrition/);
});

test("7.11.61 migration isolates the table, RLS, and atomic idempotent confirmation", () => {
  assert.match(migrationSource, /create table if not exists public\.adhdice_health_meal_plan_entries/);
  for (const column of ["planned_date", "meal_slot", "planned_time", "planned_at", "food_snapshot", "nutrition_snapshot", "confirmed_at", "confirmed_meal_entry_id"]) {
    assert.match(migrationSource, new RegExp(`\\b${column}\\b`));
  }
  assert.match(migrationSource, /enable row level security/);
  assert.match(migrationSource, /to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(migrationSource, /adhdice_confirm_health_meal_plan_entry/);
  assert.match(migrationSource, /for update/);
  assert.match(migrationSource, /if v_plan\.confirmed_at is not null/);
  assert.match(migrationSource, /insert into public\.adhdice_health_meal_entries/);
  assert.match(migrationSource, /update public\.adhdice_health_meal_plan_entries/);
  assert.match(migrationSource, /revoke all on function/);
  assert.match(migrationSource, /grant execute on function .* to authenticated/);
  assert.doesNotMatch(migrationSource, /alter table public\.adhdice_health_meal_entries[\s\S]*planned/);
});

test("7.11.63 correction qualifies the Done update while preserving local date, server time, snapshots, and idempotency", () => {
  assert.match(correctionMigrationSource, /create or replace function public\.adhdice_confirm_health_meal_plan_entry/);
  assert.match(correctionMigrationSource, /adhdice_confirm_health_meal_plan_entry\(\s*p_plan_entry_id uuid,\s*p_actual_entry_date date/);
  assert.match(correctionMigrationSource, /for update/);
  assert.match(correctionMigrationSource, /if v_plan\.confirmed_at is not null/);
  assert.match(correctionMigrationSource, /select v_plan\.confirmed_meal_entry_id, v_plan\.confirmed_at, false/);
  assert.match(correctionMigrationSource, /entry_date,[\s\S]*p_actual_entry_date/);
  assert.match(correctionMigrationSource, /logged_at,[\s\S]*v_confirmed_at/);
  assert.match(correctionMigrationSource, /food_snapshot,[\s\S]*v_plan\.food_snapshot/);
  assert.match(correctionMigrationSource, /nutrition_snapshot[\s\S]*v_plan\.nutrition_snapshot/);
  assert.match(correctionMigrationSource, /update public\.adhdice_health_meal_plan_entries as plan_row/);
  assert.match(correctionMigrationSource, /and plan_row\.confirmed_at is null/);
  assert.doesNotMatch(correctionMigrationSource, /and confirmed_at is null/);
  assert.match(correctionMigrationSource, /newly_created/);
  assert.doesNotMatch(correctionMigrationSource, /v_plan\.planned_at\s*>\s*now\(\)/);
  assert.doesNotMatch(correctionMigrationSource, /select .*from public\.adhdice_health_food_library/);
});

test("Done transitions planned nutrition to actual nutrition exactly once", () => {
  const planned = plan();
  assert.equal(sumHealthMealPlanNutritionForDate([planned], planned.planned_date).calories, 300);
  assert.equal(sumMealNutritionForDate([], "2026-08-26").calories, 0);
  const confirmed = plan({ confirmed_at: "2026-08-26T21:42:00.000Z", confirmed_meal_entry_id: "actual-1" });
  const actualEntry = actual({
    calories: confirmed.calories,
    entry_date: "2026-08-26",
    food_name: confirmed.food_name,
    logged_at: "2026-08-26T21:42:00.000Z",
    meal_slot: confirmed.meal_slot,
    nutrition_snapshot: confirmed.nutrition_snapshot,
  });
  assert.equal(sumHealthMealPlanNutritionForDate([confirmed], confirmed.planned_date).calories, 0);
  assert.equal(sumMealNutritionForDate([actualEntry], "2026-08-26").calories, 300);
});

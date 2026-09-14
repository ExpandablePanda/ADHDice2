import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isLocalStorageQuotaError,
  writeLocalStorageEntries,
} from "../src/lib/health-local-storage.ts";
import type { HealthMealPlanEntry } from "../src/lib/database.types.ts";
import {
  recordHealthMealPlanPendingUpsert,
  replayHealthMealPlanPendingMutations,
} from "../src/lib/health-meal-planning.ts";

const healthHookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");

class MemoryStorage {
  readonly values = new Map<string, string>();
  writes: string[] = [];
  removals = 0;

  setItem(key: string, value: string) {
    this.writes.push(key);
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.removals += 1;
    this.values.delete(key);
  }
}

class QuotaStorage extends MemoryStorage {
  override setItem(key: string) {
    this.writes.push(key);
    throw new DOMException("The quota has been exceeded", "QuotaExceededError");
  }
}

class UnexpectedStorage extends MemoryStorage {
  override setItem(key: string) {
    this.writes.push(key);
    throw new Error("storage backend unavailable");
  }
}

function mealPlan(overrides: Partial<HealthMealPlanEntry> = {}): HealthMealPlanEntry {
  return {
    attribution: null,
    barcode: null,
    brand_name: null,
    calories: 300,
    carbs_g: null,
    confirmed_at: null,
    confirmed_meal_entry_id: null,
    consumed_quantity: null,
    consumed_unit: null,
    created_at: "2026-09-12T12:00:00.000Z",
    fat_g: null,
    food_name: "Planned meal",
    food_snapshot: null,
    id: "plan-1",
    meal_slot: "dinner",
    nutrition_snapshot: null,
    planned_at: "2026-09-12T18:00:00.000Z",
    planned_date: "2026-09-12",
    planned_time: "18:00",
    protein_g: null,
    provider: "manual",
    provider_item_id: null,
    serving_fraction: null,
    serving_label: null,
    source_food_id: null,
    updated_at: "2026-09-12T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

test("normal Health local-cache writes persist every requested key", () => {
  const storage = new MemoryStorage();
  const result = writeLocalStorageEntries(storage, [["health:profile", "{}"], ["health:meals", "[]"]]);

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(storage.writes, ["health:profile", "health:meals"]);
  assert.equal(storage.values.get("health:meals"), "[]");
});

test("quota failures are recognized by cross-browser names and codes", () => {
  assert.equal(isLocalStorageQuotaError(new DOMException("The quota has been exceeded", "QuotaExceededError")), true);
  assert.equal(isLocalStorageQuotaError({ code: 22, name: "INVALID_STATE_ERR" }), true);
  assert.equal(isLocalStorageQuotaError({ code: 1014, name: "NS_ERROR_FAILURE" }), true);
  assert.equal(isLocalStorageQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" }), true);
  assert.equal(isLocalStorageQuotaError(new Error("network unavailable")), false);
});

test("QuotaExceededError does not throw and stops the cache pass before later keys", () => {
  const storage = new QuotaStorage();

  const result = writeLocalStorageEntries(storage, [
    ["health:profile", "{}"],
    ["health:checkins", "[]"],
    ["health:journal-signals", "[]"],
  ]);

  assert.deepEqual(result, { ok: false, reason: "quota" });
  assert.deepEqual(storage.writes, ["health:profile"]);
  assert.equal(storage.removals, 0);
});

test("an unexpected storage failure is contained and stops the pass intentionally", () => {
  const storage = new UnexpectedStorage();

  const result = writeLocalStorageEntries(storage, [["health:profile", "{}"], ["health:checkins", "[]"]]);

  assert.deepEqual(result, { ok: false, reason: "storage" });
  assert.deepEqual(storage.writes, ["health:profile"]);
});

test("the production applySnapshot path updates state before safe persistence and retains remote hydration", () => {
  const applyStart = healthHookSource.indexOf("function applySnapshot(");
  const applyEnd = healthHookSource.indexOf("async function claimEligibleAwards", applyStart);
  const applySource = healthHookSource.slice(applyStart, applyEnd);

  assert.ok(applyStart >= 0);
  assert.match(applySource, /setAwards\(nextSnapshot\.awards\);[\s\S]*?const persistenceResult = persistLocalHealthState\(nextSnapshot\);/);
  assert.match(applySource, /persistLocalHealthState\(nextSnapshot\)/);
  assert.match(healthHookSource, /const localState = readLocalHealthState\(userId\);[\s\S]*?applySnapshot\(localState\.snapshot, \{ persistenceMode: "local" \}\);/);
  assert.match(healthHookSource, /const snapshotToApply = hydratedFavorites === remoteSnapshot\.favorites/);
  assert.match(healthHookSource, /setStorageMode\("remote"\);\s*applySnapshot\(snapshotToApply, \{ persistenceMode: "remote" \}\);/);
  assert.doesNotMatch(healthHookSource, /window\.localStorage\.setItem/);
});

test("cache failures never delete Health keys and local-only success messaging stays honest", () => {
  const storage = new QuotaStorage();
  storage.values.set("health:existing", "preserve-me");
  const result = writeLocalStorageEntries(storage, [["health:existing", "replacement"]]);

  assert.deepEqual(result, { ok: false, reason: "quota" });
  assert.equal(storage.values.get("health:existing"), "preserve-me");
  assert.equal(storage.removals, 0);
  assert.doesNotMatch(healthHookSource, /localStorage\.removeItem/);
  assert.match(healthHookSource, /Health updated in memory, but \$\{storageProblem\}/);
  assert.match(healthHookSource, /This local-only change may not survive a refresh/);
  assert.match(healthHookSource, /Supabase saved this Health change, but \$\{storageProblem\}/);
});

test("meal-plan pending mutation recovery remains a separate, replayable journal", () => {
  const pendingPlan = mealPlan();
  const journal = recordHealthMealPlanPendingUpsert({}, pendingPlan);

  assert.deepEqual(replayHealthMealPlanPendingMutations([], journal), [pendingPlan]);
  assert.match(healthHookSource, /storageKey\(userId, "meal-plan-pending-mutations"\)/);
  assert.match(healthHookSource, /persistHealthMealPlanPendingMutations[\s\S]*?writeLocalStorageEntries\(storage, \[[\s\S]*?meal-plan-pending-mutations/);
  assert.match(healthHookSource, /persistHealthMealPlanPendingMutations\(userId, nextPendingMealPlanMutations\)/);
});

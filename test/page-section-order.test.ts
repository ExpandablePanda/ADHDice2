import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  getPageSectionOrderStorageKey,
  normalizePageSectionOrder,
  readPageSectionOrder,
  removePageSectionOrder,
  reorderPageSectionOrder,
  writePageSectionOrder,
} from "@/lib/page-section-order";

const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
const statsSource = readFileSync(new URL("../src/components/task-app/stats-page.tsx", import.meta.url), "utf8");
const healthSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const fitnessSource = readFileSync(new URL("../src/components/task-app/health-fitness-tab.tsx", import.meta.url), "utf8");
const todaySource = readFileSync(new URL("../src/components/task-app/health-today-tab.tsx", import.meta.url), "utf8");
const waterSource = readFileSync(new URL("../src/components/task-app/health-water-panel.tsx", import.meta.url), "utf8");
const reorderableSource = readFileSync(new URL("../src/components/ui-system/reorderable-page-sections.tsx", import.meta.url), "utf8");

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

test("page section normalization preserves valid order and appends new defaults", () => {
  assert.deepEqual(normalizePageSectionOrder(["C", "A", "C", "stale"], ["A", "B", "C", "D"]), ["C", "A", "B", "D"]);
  assert.deepEqual(normalizePageSectionOrder(null, ["A", "B"]), ["A", "B"]);
  assert.deepEqual(normalizePageSectionOrder(["B"], ["A", "B", "C"]), ["B", "A", "C"]);
});

test("page section reorder moves a semantic ID without using indexes", () => {
  assert.deepEqual(reorderPageSectionOrder(["A", "B", "C"], "C", "A"), ["C", "A", "B"]);
  assert.deepEqual(reorderPageSectionOrder(["A", "B", "C"], "A", "C"), ["B", "A", "C"]);
  assert.deepEqual(reorderPageSectionOrder(["A", "B"], "missing", "A"), ["A", "B"]);
});

test("page section storage is user-scoped, page-independent, and resettable", () => {
  const store = storage();
  const key = getPageSectionOrderStorageKey("user-1");
  writePageSectionOrder(store, key, "home", ["tasks", "focus"]);
  writePageSectionOrder(store, key, "health:fitness", ["history", "goals"]);
  assert.equal(key, "adhdice-page-section-order:user-1");
  assert.deepEqual(readPageSectionOrder(store, key, "home", ["tasks", "milestones", "focus"]), ["tasks", "focus", "milestones"]);
  assert.deepEqual(readPageSectionOrder(store, key, "health:fitness", ["goals", "history"]), ["history", "goals"]);
  assert.deepEqual(readPageSectionOrder(store, getPageSectionOrderStorageKey("user-2"), "home", ["tasks", "focus"]), ["tasks", "focus"]);
  removePageSectionOrder(store, key, "home");
  assert.deepEqual(readPageSectionOrder(store, key, "home", ["tasks", "focus"]), ["tasks", "focus"]);
  assert.deepEqual(readPageSectionOrder(store, key, "health:fitness", ["goals", "history"]), ["history", "goals"]);
});

test("corrupt page section storage falls back to defaults", () => {
  const store = storage();
  const key = getPageSectionOrderStorageKey("user-1");
  store.setItem(key, "{not json");
  assert.deepEqual(readPageSectionOrder(store, key, "stats", ["overview", "records"]), ["overview", "records"]);
});

test("eligible Home, Stats, and Health surfaces use independent semantic section IDs", () => {
  assert.match(homeSource, /<ReorderablePageSections pageKey="home"/);
  assert.match(homeSource, /id="home-task-search"/);
  assert.match(statsSource, /<ReorderablePageSections pageKey="stats"/);
  assert.match(statsSource, /id="stats-overview"/);
  assert.match(fitnessSource, /pageKey="health:fitness"/);
  assert.match(todaySource, /pageKey="health:today"/);
  assert.match(healthSource, /pageKey="health:food"/);
  assert.match(healthSource, /pageKey="health:journal"/);
  assert.match(healthSource, /pageKey="health:weight"/);
  assert.match(healthSource, /pageKey="health:sleep"/);
  assert.match(healthSource, /pageKey="health:insights"/);
  assert.match(waterSource, /pageKey="health:water"/);
  assert.doesNotMatch(healthSource, /pageKey="tasks"/);
  assert.match(reorderableSource, /onPointerMove={updatePreview}/);
  assert.match(reorderableSource, /data-page-section-arrange-mode=/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  FOCUS_PAGE_SHELL_IDS,
  HEALTH_PAGE_SHELL_IDS,
  STATS_PAGE_SHELL_IDS,
  getHealthPageShellKey,
  getPageShellLayoutStorageKey,
  normalizePageShellOrder,
  readPageShellOrder,
  removePageShellOrder,
  reorderPageShellOrder,
  writePageShellOrder,
} from "@/lib/page-shell-layout";

const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
const statsSource = readFileSync(new URL("../src/components/task-app/stats-page.tsx", import.meta.url), "utf8");
const healthSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const fitnessSource = readFileSync(new URL("../src/components/task-app/health-fitness-tab.tsx", import.meta.url), "utf8");
const todaySource = readFileSync(new URL("../src/components/task-app/health-today-tab.tsx", import.meta.url), "utf8");
const waterSource = readFileSync(new URL("../src/components/task-app/health-water-panel.tsx", import.meta.url), "utf8");
const focusSource = readFileSync(new URL("../src/components/focus-page.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("../src/components/task-app/page-shell-header.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/ui-system/reorderable-page-shells.tsx", import.meta.url), "utf8");

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

test("page shell normalization preserves valid order and appends new defaults", () => {
  assert.deepEqual(normalizePageShellOrder(["C", "A", "C", "stale"], ["A", "B", "C", "D"]), ["C", "A", "B", "D"]);
  assert.deepEqual(normalizePageShellOrder(null, ["A", "B"]), ["A", "B"]);
  assert.deepEqual(normalizePageShellOrder(["B"], ["A", "B", "C"]), ["B", "A", "C"]);
});

test("page shell reorder moves a semantic shell ID without using indexes", () => {
  assert.deepEqual(reorderPageShellOrder(["A", "B", "C"], "C", "A"), ["C", "A", "B"]);
  assert.deepEqual(reorderPageShellOrder(["A", "B", "C"], "A", "C"), ["B", "A", "C"]);
  assert.deepEqual(reorderPageShellOrder(["A", "B"], "missing", "A"), ["A", "B"]);
});

test("page shell storage is user-scoped, page-independent, and resettable", () => {
  const store = storage();
  const key = getPageShellLayoutStorageKey("user-1");
  writePageShellOrder(store, key, "health:fitness", ["fitness-week", "fitness-today"]);
  writePageShellOrder(store, key, "focus", ["focus-goals", "focus-timer-workspace"]);
  assert.equal(key, "adhdice-page-section-order:user-1");
  assert.deepEqual(readPageShellOrder(store, key, "health:fitness", ["fitness-today", "fitness-week", "fitness-goals"]), ["fitness-week", "fitness-today", "fitness-goals"]);
  assert.deepEqual(readPageShellOrder(store, key, "focus", ["focus-timer-workspace", "focus-goals"]), ["focus-goals", "focus-timer-workspace"]);
  assert.deepEqual(readPageShellOrder(store, getPageShellLayoutStorageKey("user-2"), "focus", ["focus-timer-workspace", "focus-goals"]), ["focus-timer-workspace", "focus-goals"]);
  removePageShellOrder(store, key, "health:fitness");
  assert.deepEqual(readPageShellOrder(store, key, "health:fitness", ["fitness-today", "fitness-week"]), ["fitness-today", "fitness-week"]);
  assert.deepEqual(readPageShellOrder(store, key, "focus", ["focus-timer-workspace", "focus-goals"]), ["focus-goals", "focus-timer-workspace"]);
});

test("corrupt page shell storage falls back to defaults", () => {
  const store = storage();
  const key = getPageShellLayoutStorageKey("user-1");
  store.setItem(key, "{not json");
  assert.deepEqual(readPageShellOrder(store, key, "stats", ["stats-overview", "stats-energy"]), ["stats-overview", "stats-energy"]);
});

test("Home keeps Task Search and To-do content inside its canonical shell", () => {
  assert.doesNotMatch(homeSource, /ReorderablePageShells|PageShell id=|home-task-search|home-todo-list/);
  assert.match(homeSource, /<AdhdPanel/);
});

test("page-level layout controls are header actions and only render for two or more shells", () => {
  assert.match(headerSource, /actions\?: ReactNode/);
  assert.match(shellSource, /aria-label="Edit page layout"/);
  assert.match(shellSource, /title="Edit layout"/);
  assert.match(shellSource, /layout\.canEdit/);
  assert.match(shellSource, /Reset Layout/);
  assert.match(shellSource, /Done/);
  assert.match(statsSource, /PageShellHeader actions=\{<PageShellLayoutControls layout=\{layout\} \/>\}/);
  assert.match(healthSource, /PageShellHeader actions=\{<PageShellLayoutControls layout=\{pageShellLayout\} \/>\}/);
  assert.match(focusSource, /PageShellHeader actions=\{<PageShellLayoutControls layout=\{layout\} \/>\}/);
  assert.doesNotMatch(homeSource, /Edit page layout|PageShellLayoutControls/);
});

test("Health tabs use independent semantic shell IDs and preserve grouped internals", () => {
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Today], ["today-snapshot", "today-quick-log", "today-timeline"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Food], ["food-meal-log", "food-daily-totals", "food-library"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Water], ["water-log", "water-history"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Fitness], ["fitness-active-workout", "fitness-today", "fitness-week", "fitness-goals", "fitness-plans", "fitness-workout-history"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Journal], ["journal-entry-history", "journal-library", "journal-feeling-trends"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Weight], ["weight-entry", "weight-trend"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Sleep], ["sleep-ledger", "sleep-entry-and-sources"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Insights], ["insights-import", "insights-trends"]);
  assert.equal(getHealthPageShellKey("Fitness"), "health:fitness");
  assert.match(healthSource, /HEALTH_PAGE_SHELL_IDS\[activeTab\]/);
  assert.match(healthSource, /layout=\{pageShellLayout\}/);
  assert.match(todaySource, /<PageShell id="today-snapshot"/);
  assert.match(todaySource, /<PageShell id="today-quick-log"/);
  assert.match(todaySource, /<PageShell id="today-timeline"/);
  assert.match(waterSource, /<PageShell id="water-log"/);
  assert.match(waterSource, /<PageShell id="water-history"/);
});

test("Fitness reorders whole shells while keeping Today cards and Week content together", () => {
  assert.doesNotMatch(fitnessSource, /fitness-day-week/);
  assert.match(fitnessSource, /shellsClassName="grid gap-5 xl:grid-cols-\[1\.08fr_0\.92fr\]"/);
  const todayShell = fitnessSource.slice(fitnessSource.indexOf('<PageShell id="fitness-today"'), fitnessSource.indexOf("</PageShell>", fitnessSource.indexOf('<PageShell id="fitness-today"')));
  const weekShell = fitnessSource.slice(fitnessSource.indexOf('<PageShell id="fitness-week"'), fitnessSource.indexOf("</PageShell>", fitnessSource.indexOf('<PageShell id="fitness-week"')));
  for (const label of ["Steps", "Total Active Calories", "Workout Active Calories", "Exercise"]) assert.match(todayShell, new RegExp(`label="${label}"`));
  for (const label of ["Workouts", "Workout Minutes", "Total Active Calories", "Workout Active Calories"]) assert.match(weekShell, new RegExp(`label="${label}"`));
  assert.match(fitnessSource, /<PageShell className="xl:col-span-2" id="fitness-goals"/);
  assert.match(fitnessSource, /<PageShell className="xl:col-span-2" id="fitness-plans"/);
  assert.match(fitnessSource, /<PageShell className="xl:col-span-2" id="fitness-workout-history"/);
});

test("Focus reorders top-level workspace shells, not individual clocks or bars", () => {
  assert.deepEqual([...FOCUS_PAGE_SHELL_IDS], ["focus-timer-workspace", "focus-goals", "focus-counter-history", "focus-history"]);
  assert.match(focusSource, /<PageShell id="focus-timer-workspace"/);
  assert.match(focusSource, /<PageShell id="focus-goals"/);
  assert.match(focusSource, /<PageShell id="focus-history"/);
  assert.match(focusSource, /focusSandboxTabOrder/);
  assert.match(shellSource, /onPointerDown=\{\(event\) => handlePointerDown\(event, shell\.id\)\}/);
  assert.match(shellSource, /<button/);
  assert.match(shellSource, /layout\.isEditing \? \(/);
  assert.match(shellSource, /\{shell\.node\}/);
  assert.doesNotMatch(shellSource, /draggable/);
  assert.match(shellSource, /data-page-shell-id=\{shell\.id\}/);
});

test("Stats remains a multi-shell page with stable responsive shell layout", () => {
  assert.deepEqual([...STATS_PAGE_SHELL_IDS], ["stats-overview", "stats-economy", "stats-productivity", "stats-achievements", "stats-energy"]);
  assert.match(statsSource, /<ReorderablePageShells layout=\{layout\}>/);
  for (const id of STATS_PAGE_SHELL_IDS) assert.match(statsSource, new RegExp(`id="${id}"`));
});

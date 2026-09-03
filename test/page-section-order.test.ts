import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FOCUS_PAGE_SHELL_IDS,
  HEALTH_PAGE_SHELL_IDS,
  STATS_PAGE_SHELL_IDS,
  getPageShellDragAutoScrollDelta,
  getHealthPageShellKey,
  getPageShellInsertionIndex,
  getPageShellLayoutStorageKey,
  HEALTH_PAGE_SHELL_SIZE_DEFAULTS,
  mergeVisiblePageShellOrder,
  normalizePageShellLayout,
  normalizePageShellSize,
  normalizePageShellOrder,
  PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX,
  PAGE_SHELL_HEIGHT_SNAP,
  PAGE_SHELL_MIN_HEIGHT,
  readPageShellLayout,
  reorderPageShellOrder,
  reorderPageShellOrderAt,
  removePageShellLayout,
  projectVisiblePageShellOrder,
  snapPageShellHeight,
  writePageShellLayout,
} from "@/lib/page-shell-layout";
import { PageShell, PageShellBody, PageShellSurface, ReorderablePageShells } from "@/components/ui-system/reorderable-page-shells";
import type { PageShellLayoutState } from "@/hooks/usePageShellLayout";

const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
const statsSource = readFileSync(new URL("../src/components/task-app/stats-page.tsx", import.meta.url), "utf8");
const healthSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const fitnessSource = readFileSync(new URL("../src/components/task-app/health-fitness-tab.tsx", import.meta.url), "utf8");
const todaySource = readFileSync(new URL("../src/components/task-app/health-today-tab.tsx", import.meta.url), "utf8");
const waterSource = readFileSync(new URL("../src/components/task-app/health-water-panel.tsx", import.meta.url), "utf8");
const focusSource = readFileSync(new URL("../src/components/focus-page.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("../src/components/task-app/page-shell-header.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/ui-system/reorderable-page-shells.tsx", import.meta.url), "utf8");
const collapsiblePanelSource = readFileSync(new URL("../src/components/task-app/health-collapsible-panel.tsx", import.meta.url), "utf8");
const layoutHookSource = readFileSync(new URL("../src/hooks/usePageShellLayout.ts", import.meta.url), "utf8");
const globalSource = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

function staticShellLayout(isEditing: boolean): PageShellLayoutState {
  return {
    beginPreview: () => undefined,
    canEdit: true,
    cancelPreview: () => undefined,
    commitPreview: () => undefined,
    finishEditing: () => undefined,
    isEditing,
    order: ["conditional", "regular"],
    pageKey: "test",
    reset: () => undefined,
    setPreviewOrder: () => undefined,
    setPreviewSizes: () => undefined,
    sizes: {
      conditional: { heightPx: 288, span: 6 },
      regular: { heightPx: null, span: 12 },
    },
    startEditing: () => undefined,
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

test("shell layout storage is user-scoped, page-independent, and resettable", () => {
  const store = storage();
  const key = getPageShellLayoutStorageKey("user-1");
  const fitnessDefaults = HEALTH_PAGE_SHELL_IDS.Fitness;
  const fitnessSizes = HEALTH_PAGE_SHELL_SIZE_DEFAULTS.Fitness;
  store.setItem("adhdice-page-section-order:user-1", JSON.stringify({ "health:fitness": ["fitness-week", "fitness-today"] }));
  assert.equal(key, "adhdice-page-shell-layout-v1:user-1");
  assert.deepEqual(readPageShellLayout(store, key, "health:fitness", fitnessDefaults, fitnessSizes).order, [...fitnessDefaults]);
  store.setItem(key, JSON.stringify({ focus: { order: ["focus-history", "focus-goals"], sizes: { "focus-history": { heightPx: 432, span: 6 } } } }));
  writePageShellLayout(store, key, "health:fitness", { order: ["fitness-week", "fitness-today", ...fitnessDefaults.slice(0, 1), ...fitnessDefaults.slice(3)], sizes: { "fitness-today": { heightPx: 384, span: 8 } } });
  assert.deepEqual(readPageShellLayout(store, key, "health:fitness", fitnessDefaults, fitnessSizes).order, ["fitness-week", "fitness-today", "fitness-active-workout", "fitness-goals", "fitness-plans", "fitness-workout-history"]);
  assert.deepEqual(readPageShellLayout(store, key, "health:fitness", fitnessDefaults, fitnessSizes).sizes["fitness-today"], { heightPx: 384, span: 8 });
  const focusLayout = readPageShellLayout(store, key, "focus", FOCUS_PAGE_SHELL_IDS, {});
  assert.deepEqual(focusLayout.order, ["focus-activity-summary", "focus-activity-trend", "focus-goals", "focus-timer-workspace", "focus-counter-history"]);
  assert.deepEqual(focusLayout.sizes["focus-activity-summary"], { heightPx: 432, span: 6 });
  assert.deepEqual(focusLayout.sizes["focus-activity-trend"], { heightPx: 432, span: 6 });
  assert.equal(focusLayout.sizes["focus-history"], undefined);
  assert.deepEqual(readPageShellLayout(store, getPageShellLayoutStorageKey("user-2"), "focus", FOCUS_PAGE_SHELL_IDS, {}).order, [...FOCUS_PAGE_SHELL_IDS]);
  removePageShellLayout(store, key, "health:fitness");
  assert.deepEqual(readPageShellLayout(store, key, "health:fitness", ["fitness-today", "fitness-week"], {}).order, ["fitness-today", "fitness-week"]);
  assert.deepEqual(readPageShellLayout(store, key, "health:fitness", ["fitness-today", "fitness-week"], {}).sizes["fitness-today"], { heightPx: null, span: 12 });
  removePageShellLayout(store, key, "focus");
  assert.deepEqual(readPageShellLayout(store, key, "focus", FOCUS_PAGE_SHELL_IDS, {}).order, [...FOCUS_PAGE_SHELL_IDS]);
});

test("corrupt page shell storage falls back to defaults", () => {
  const store = storage();
  const key = getPageShellLayoutStorageKey("user-1");
  store.setItem(key, "{not json");
  assert.deepEqual(readPageShellLayout(store, key, "stats", ["stats-overview", "stats-energy"], {}).order, ["stats-overview", "stats-energy"]);
});

test("conditional shells disappear normally and become editable placeholders", () => {
  const children = [
    createElement(PageShell, { hiddenDescription: "Hidden until ready", id: "conditional", label: "Conditional", visible: false }, createElement("div", { "data-hidden-node": true }, "real content")),
    createElement(PageShell, { id: "regular", label: "Regular" }, createElement("div", { "data-regular-node": true }, "regular content")),
  ];
  const normalMarkup = renderToStaticMarkup(createElement(ReorderablePageShells, { layout: staticShellLayout(false) }, children));
  assert.doesNotMatch(normalMarkup, /data-page-shell-id="conditional"/);
  assert.doesNotMatch(normalMarkup, /data-hidden-node/);
  assert.match(normalMarkup, /data-page-shell-id="regular"/);

  const editMarkup = renderToStaticMarkup(createElement(ReorderablePageShells, { layout: staticShellLayout(true) }, children));
  assert.match(editMarkup, /data-page-shell-id="conditional"/);
  assert.match(editMarkup, /data-page-shell-placeholder/);
  assert.match(editMarkup, /Hidden until ready/);
  assert.doesNotMatch(editMarkup, /data-hidden-node/);
  assert.match(editMarkup, /aria-label="Resize Conditional"/);
  assert.match(editMarkup, /data-page-shell-height="288"/);
  assert.match(editMarkup, /data-page-shell-size-span="6"/);
  assert.match(editMarkup, /aria-label="Use natural height for Conditional"/);
  assert.match(editMarkup, /6\/12 · 288px/);
});

test("shell surfaces keep the visual frame fixed while the body owns constrained scrolling", () => {
  const markup = renderToStaticMarkup(createElement(
    PageShellSurface,
    { "data-test-surface": true },
    createElement(PageShellBody, { "data-test-body": true }, createElement("span", null, "content")),
  ));
  assert.match(markup, /data-test-surface/);
  assert.match(markup, /page-shell-surface/);
  assert.match(markup, /overflow-hidden/);
  assert.match(markup, /data-test-body/);
  assert.match(markup, /page-shell-body/);
  assert.doesNotMatch(markup, /page-shell-body[^\"]*overflow-y-auto/);
});

test("Health collapsible shell surfaces keep collapse state canonical and scroll only their open body", () => {
  assert.match(collapsiblePanelSource, /shellSurface = false/);
  assert.match(collapsiblePanelSource, /page-shell-surface flex h-full min-h-0 flex-col overflow-hidden/);
  assert.match(collapsiblePanelSource, /<PageShellBody className="mt-4">\{children\}<\/PageShellBody>/);
  assert.match(collapsiblePanelSource, /aria-expanded=\{isOpen\}/);
  assert.match(collapsiblePanelSource, /if \(open === undefined\)/);
});

test("legacy minHeight shell storage is read as a safe custom height", () => {
  const store = storage();
  const key = getPageShellLayoutStorageKey("user-legacy");
  store.setItem(key, JSON.stringify({
    focus: {
      order: ["focus-timer-workspace", "focus-goals"],
      sizes: { "focus-timer-workspace": { minHeight: 384, span: 8 } },
    },
  }));
  assert.deepEqual(
    readPageShellLayout(store, key, "focus", ["focus-timer-workspace", "focus-goals"], {}).sizes["focus-timer-workspace"],
    { heightPx: 384, span: 8 },
  );
});

test("shell layout sizes and 2D insertion boundaries normalize defensively", () => {
  const layout = normalizePageShellLayout({
    order: ["C", "C", "stale"],
    sizes: { C: { heightPx: 401, span: 7 }, stale: { heightPx: 999, span: 12 } },
  }, ["A", "B", "C"], { A: { heightPx: null, span: 12 }, B: { heightPx: null, span: 6 }, C: { heightPx: null, span: 12 } });
  assert.deepEqual(layout.order, ["C", "A", "B"]);
  assert.deepEqual(layout.sizes.C, { heightPx: 384, span: 7 });
  assert.deepEqual(layout.sizes.B, { heightPx: null, span: 6 });
  assert.deepEqual(normalizePageShellSize({ heightPx: -1, span: 1 }), { heightPx: null, span: 6 });
  assert.deepEqual(normalizePageShellSize({ heightPx: 99, span: 99 }), { heightPx: PAGE_SHELL_MIN_HEIGHT, span: 12 });
  assert.deepEqual(normalizePageShellSize({ minHeight: 384, span: 8 }), { heightPx: 384, span: 8 });
  assert.deepEqual(normalizePageShellSize({ minHeight: 96, span: 8 }), { heightPx: PAGE_SHELL_MIN_HEIGHT, span: 8 });
  assert.equal(snapPageShellHeight(192), 192);
  assert.equal(snapPageShellHeight(400), 384);
  assert.equal(snapPageShellHeight(400), snapPageShellHeight(400));
  assert.equal(snapPageShellHeight(800), 816);
  assert.equal(PAGE_SHELL_HEIGHT_SNAP, 48);
  const geometries = [
    { bottom: 100, id: "A", left: 0, right: 100, top: 0 },
    { bottom: 100, id: "B", left: 110, right: 210, top: 0 },
    { bottom: 220, id: "C", left: 0, right: 210, top: 120 },
  ];
  assert.equal(getPageShellInsertionIndex(geometries, ["A", "B", "C"], "A", 0, 160), 1);
  assert.equal(getPageShellInsertionIndex(geometries, ["A", "B", "C"], "A", 0, 160), 1);
  assert.equal(getPageShellInsertionIndex(geometries, ["A", "B", "C"], "A", 0, -20), 0);
  assert.equal(getPageShellInsertionIndex(geometries, ["A", "B", "C"], "A", 0, 260), 2);
  assert.deepEqual(reorderPageShellOrderAt(["A", "B", "C"], "A", 2), ["B", "C", "A"]);
});

test("page shell insertion is stable insertion rather than swapping", () => {
  assert.deepEqual(reorderPageShellOrderAt(["A", "B", "C", "D"], "D", 1), ["A", "D", "B", "C"]);
  assert.deepEqual(reorderPageShellOrderAt(["A", "B", "C", "D"], "B", 2), ["A", "C", "B", "D"]);
  assert.deepEqual(reorderPageShellOrderAt(["A", "B", "C", "D"], "C", 1), ["A", "C", "B", "D"]);
});

test("visible shell reorders preserve hidden semantic slots and restore deterministically", () => {
  const fullOrder = ["A", "B", "hidden-C", "D", "E"];
  const visibleOrder = ["D", "A", "B", "E"];
  const merged = mergeVisiblePageShellOrder(fullOrder, visibleOrder, ["A", "B", "D", "E"]);
  assert.deepEqual(merged, ["D", "A", "hidden-C", "B", "E"]);
  assert.deepEqual(projectVisiblePageShellOrder(merged, ["A", "B", "D", "E"]), visibleOrder);
  assert.deepEqual(mergeVisiblePageShellOrder(merged, merged, ["D", "A", "hidden-C", "B", "E"]), merged);
  const focusHiddenOrder = ["focus-timer-workspace", "focus-goals", "focus-counter-history", "focus-history"];
  const focusHiddenVisible = ["focus-timer-workspace", "focus-goals", "focus-history"];
  const focusHiddenNextVisible = ["focus-timer-workspace", "focus-history", "focus-goals"];
  const focusHiddenMerged = mergeVisiblePageShellOrder(focusHiddenOrder, focusHiddenNextVisible, focusHiddenVisible);
  assert.deepEqual(projectVisiblePageShellOrder(focusHiddenMerged, focusHiddenVisible), focusHiddenNextVisible);
  const focusVisibleNext = ["focus-timer-workspace", "focus-history", "focus-goals", "focus-counter-history"];
  assert.deepEqual(projectVisiblePageShellOrder(
    mergeVisiblePageShellOrder(focusHiddenOrder, focusVisibleNext, focusVisibleNext),
    focusVisibleNext,
  ), focusVisibleNext);
});

test("drag auto-scroll is bounded, directional, and inactive outside the edge zones", () => {
  assert.equal(getPageShellDragAutoScrollDelta(400, 800, 300, 1800), 0);
  assert.ok(getPageShellDragAutoScrollDelta(PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX - 1, 800, 300, 1800) < 0);
  assert.ok(getPageShellDragAutoScrollDelta(800 - PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX + 1, 800, 300, 1800) > 0);
  assert.equal(getPageShellDragAutoScrollDelta(0, 800, 0, 1800), 0);
  assert.equal(getPageShellDragAutoScrollDelta(800, 800, 1000, 1800), 0);
  assert.equal(getPageShellDragAutoScrollDelta(0, 800, 300, 800), 0);
});

test("Focus-like zero-gap full-width shells remain separate rows and use vertical hysteresis", () => {
  const geometries = [
    { bottom: 120, id: "timer", left: 0, right: 960, top: 0 },
    { bottom: 260, id: "goals", left: 0, right: 960, top: 120 },
    { bottom: 380, id: "history", left: 0, right: 960, top: 260 },
  ];
  assert.equal(getPageShellInsertionIndex(geometries, ["timer", "goals", "history"], "history", 8, 108), 1);
  assert.equal(getPageShellInsertionIndex(geometries, ["timer", "goals", "history"], "history", 940, 185, 2), 2);
  assert.equal(getPageShellInsertionIndex(geometries, ["timer", "goals", "history"], "history", 940, 170, 2), 1);
  assert.equal(getPageShellInsertionIndex(geometries, ["timer", "goals", "history"], "history", 940, 195, 1), 1);
  assert.equal(getPageShellInsertionIndex(geometries, ["timer", "goals", "history"], "history", 940, 205, 1), 2);
  assert.equal(getPageShellInsertionIndex(geometries, ["timer", "goals", "history"], "history", 940, 100), 1);
});

test("document-space geometry keeps insertion targets stable after page scrolling", () => {
  const geometries = [
    { bottom: 360, id: "A", left: 0, right: 960, top: 240 },
    { bottom: 500, id: "B", left: 0, right: 960, top: 360 },
    { bottom: 640, id: "C", left: 0, right: 960, top: 500 },
  ];
  assert.equal(getPageShellInsertionIndex(geometries, ["A", "B", "C"], "C", 12, 120 + 240), 1);
});

test("side-by-side shells still use horizontal placement within one row", () => {
  const geometries = [
    { bottom: 240, id: "left", left: 0, right: 470, top: 0 },
    { bottom: 240, id: "right", left: 490, right: 960, top: 0 },
    { bottom: 360, id: "below", left: 0, right: 960, top: 260 },
  ];
  assert.equal(getPageShellInsertionIndex(geometries, ["left", "right", "below"], "below", 20, 100), 0);
  assert.equal(getPageShellInsertionIndex(geometries, ["left", "right", "below"], "below", 800, 100), 2);
  assert.equal(getPageShellInsertionIndex(geometries, ["left", "right", "below"], "left", 20, 100), 0);
  assert.equal(getPageShellInsertionIndex(geometries, ["left", "right", "below"], "left", 800, 100), 1);
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
  assert.equal(HEALTH_PAGE_SHELL_IDS.Awards.length, 1);
  assert.equal(HEALTH_PAGE_SHELL_IDS.Settings.length, 1);
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
  assert.equal(HEALTH_PAGE_SHELL_SIZE_DEFAULTS.Fitness["fitness-today"].span, 6);
  assert.equal(HEALTH_PAGE_SHELL_SIZE_DEFAULTS.Fitness["fitness-week"].span, 6);
  assert.equal(HEALTH_PAGE_SHELL_SIZE_DEFAULTS.Fitness["fitness-goals"].span, 12);
  assert.match(healthSource, /HEALTH_PAGE_SHELL_IDS\[activeTab\]/);
  assert.match(healthSource, /layout=\{pageShellLayout\}/);
  assert.match(todaySource, /<PageShell id="today-snapshot"/);
  assert.match(todaySource, /<PageShell id="today-quick-log"/);
  assert.match(todaySource, /<PageShell id="today-timeline"/);
  assert.match(waterSource, /<PageShell id="water-log"/);
  assert.match(waterSource, /<PageShell id="water-history"/);
});

test("Fitness reorders whole shells while Today and This Week adapt inside their surfaces", () => {
  assert.doesNotMatch(fitnessSource, /fitness-day-week/);
  assert.match(fitnessSource, /shellsClassName="grid gap-5 xl:grid-cols-12"/);
  const todayShell = fitnessSource.slice(fitnessSource.indexOf('<PageShell id="fitness-today"'), fitnessSource.indexOf("</PageShell>", fitnessSource.indexOf('<PageShell id="fitness-today"')));
  const weekShell = fitnessSource.slice(fitnessSource.indexOf('<PageShell id="fitness-week"'), fitnessSource.indexOf("</PageShell>", fitnessSource.indexOf('<PageShell id="fitness-week"')));
  for (const label of ["Steps", "Total Active Calories", "Workout Active Calories", "Exercise"]) assert.match(todayShell, new RegExp(`label="${label}"`));
  for (const label of ["Workouts", "Workout Minutes", "Total Active Calories", "Workout Active Calories"]) assert.match(weekShell, new RegExp(`label="${label}"`));
  assert.match(fitnessSource, /<PageShell id="fitness-goals"/);
  assert.match(fitnessSource, /<PageShell id="fitness-plans"/);
  assert.match(fitnessSource, /<PageShell id="fitness-workout-history"/);
  assert.match(fitnessSource, /visible=\{Boolean\(activeWorkout\.runtime\)\}/);
  assert.match(fitnessSource, /hiddenDescription="Hidden until a workout is active"/);
  assert.match(todayShell, /shellSurface/);
  assert.match(weekShell, /shellSurface/);
  assert.match(fitnessSource, /fitness-stat-grid grid gap-3/);
  assert.match(fitnessSource, /fitness-week-grid grid gap-3/);
  assert.match(fitnessSource, /fitness-stat-main flex min-w-0/);
  assert.match(fitnessSource, /fitness-stat-progress mt-1 shrink-0/);
  assert.doesNotMatch(fitnessSource, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.doesNotMatch(fitnessSource, /sm:grid-cols-2 xl:grid-cols-1/);
});

test("Focus reorders top-level workspace shells, not individual clocks or bars", () => {
  assert.deepEqual([...FOCUS_PAGE_SHELL_IDS], ["focus-timer-workspace", "focus-goals", "focus-counter-history", "focus-activity-summary", "focus-activity-trend"]);
  assert.match(focusSource, /<PageShell id="focus-timer-workspace"/);
  assert.match(focusSource, /<PageShell id="focus-goals"/);
  assert.match(focusSource, /<PageShell id="focus-activity-summary" label="Focus Activity"/);
  assert.match(focusSource, /<PageShell id="focus-activity-trend" label="Focus Activity Trend"/);
  assert.match(focusSource, /<FocusHistoryProvider/);
  assert.match(focusSource, /<FocusActivitySummaryShell \/>/);
  assert.match(focusSource, /<FocusActivityLineShell \/>/);
  assert.deepEqual(
    reorderPageShellOrder([...FOCUS_PAGE_SHELL_IDS], "focus-activity-trend", "focus-activity-summary"),
    ["focus-timer-workspace", "focus-goals", "focus-counter-history", "focus-activity-trend", "focus-activity-summary"],
  );
  assert.match(focusSource, /visible=\{counterHistory\.length > 0\}/);
  assert.match(focusSource, /hiddenDescription="Hidden until counter history exists"/);
  assert.match(focusSource, /focusSandboxTabOrder/);
  assert.match(shellSource, /onPointerDown=\{\(event\) => beginMove\(event, shell\.id\)\}/);
  assert.match(shellSource, /<button/);
  assert.match(shellSource, /layout\.isEditing \? \(/);
  assert.match(shellSource, /shell\.visible \? shell\.node/);
  assert.match(shellSource, /renderedShells = useMemo/);
  assert.match(shellSource, /layout\.isEditing \? shells : shells\.filter/);
  assert.match(shellSource, /data-page-shell-placeholder/);
  assert.match(shellSource, /hiddenDescription/);
  assert.doesNotMatch(shellSource, /<div[^>]+draggable/);
  assert.match(shellSource, /data-page-shell-id=\{shell\.id\}/);
  assert.match(shellSource, /data-page-shell-layout-strip/);
  assert.match(shellSource, /shellsClassName = "grid gap-3 xl:grid-cols-12"/);
  assert.match(shellSource, /layout\.beginPreview/);
  assert.match(shellSource, /layout\.commitPreview/);
  assert.match(shellSource, /layout\.cancelPreview/);
  assert.match(shellSource, /getPageShellInsertionIndex/);
  assert.match(shellSource, /startVisibleOrder/);
  assert.match(shellSource, /mergeVisiblePageShellOrder/);
  assert.match(shellSource, /data-page-shell-insertion-indicator/);
  assert.match(shellSource, /interaction\.targetIndex/);
  assert.match(shellSource, /renderedShellOrder/);
  assert.match(shellSource, /rect\.top \+ scrollTop/);
  assert.match(shellSource, /pointerY \+ getPageScrollTop\(\)/);
  assert.match(shellSource, /requestAnimationFrame\(runDragAutoScroll\)/);
  assert.match(shellSource, /cancelDragAutoScroll/);
  assert.match(shellSource, /window\.scrollTo\(\{ behavior: "auto", top: nextScrollTop \}\)/);
  assert.match(shellSource, /heightPx: snapPageShellHeight\(initialHeight\)/);
  const moveUpdateSource = shellSource.slice(shellSource.indexOf('if (interaction.kind === "move")'), shellSource.indexOf("const deltaColumns"));
  assert.match(moveUpdateSource, /updateMovePreview/);
  assert.match(shellSource, /function updateMovePreview[\s\S]*layout\.setPreviewOrder/);
  assert.doesNotMatch(moveUpdateSource, /setDraggingId/);
  assert.match(shellSource, /if \(cancelled\) layout\.cancelPreview\(\);\s+else layout\.commitPreview\(\);/);
  assert.match(shellSource, /aria-label=\{`Resize \$\{shell\.label\}`\}/);
  assert.match(shellSource, /measureNaturalShellHeight/);
  assert.match(shellSource, /data-page-shell-height=\{size\.heightPx \?\? "natural"\}/);
  assert.match(shellSource, /export function PageShellSurface/);
  assert.match(shellSource, /export function PageShellBody/);
  assert.match(shellSource, /page-shell-custom-height/);
  assert.doesNotMatch(shellSource, /page-shell-custom-height[^\"]*overflow-y-auto/);
  assert.doesNotMatch(shellSource, /data-page-shell-min-height/);
  assert.doesNotMatch(shellSource, /minHeight: \$\{/);
  assert.match(globalSource, /@media \(max-width: 1279px\)/);
  assert.match(globalSource, /\.page-shell-surface[\s\S]*container-type: inline-size/);
  assert.match(globalSource, /\.page-shell-body[\s\S]*overflow-y: auto/);
  assert.match(globalSource, /\.page-shell-chart-header/);
  assert.match(globalSource, /\.fitness-stat-progress[\s\S]*max-width: 100%/);
  assert.match(globalSource, /\.page-shell-custom-height:not\(:has\(> \.page-shell-surface\)\)[\s\S]*overflow-y: auto/);
  assert.match(globalSource, /@container page-shell \(min-width: 36rem\)/);
  assert.match(globalSource, /@container page-shell \(min-width: 64rem\)/);
  assert.match(globalSource, /@container page-shell \(max-width: 24rem\)/);
  assert.match(globalSource, /@container page-shell/);
  assert.match(globalSource, /\.page-shell-custom-height[\s\S]*height: auto !important/);
  assert.match(shellSource, /setShellToNaturalHeight/);
  assert.match(shellSource, /aria-label=\{`Use natural height for \$\{shell\.label\}`\}/);
  assert.match(shellSource, /\{size\.span\}\/12 · \{hasCustomHeight \? `\$\{size\.heightPx\}px` : "Auto"\}/);
  assert.match(shellSource, /xl:col-span-6/);
  assert.match(shellSource, /xl:col-span-12/);
  assert.equal((shellSource.match(/<GripVertical/g) ?? []).length, 1);
  assert.doesNotMatch(shellSource, /localStorage/);
  assert.match(layoutHookSource, /const \[committedLayout/);
  assert.match(layoutHookSource, /const \[previewLayout/);
  assert.match(layoutHookSource, /writePageShellLayout/);
  assert.match(layoutHookSource, /commitPreview/);
  assert.match(layoutHookSource, /cancelPreview/);
  assert.doesNotMatch(layoutHookSource, /setPreviewOrder[\s\S]{0,500}writePageShellLayout/);
});

test("Stats remains a multi-shell page with stable responsive shell layout", () => {
  assert.deepEqual([...STATS_PAGE_SHELL_IDS], ["stats-overview", "stats-economy", "stats-productivity", "stats-achievements", "stats-energy"]);
  assert.match(statsSource, /<ReorderablePageShells layout=\{layout\}>/);
  for (const id of STATS_PAGE_SHELL_IDS) assert.match(statsSource, new RegExp(`id="${id}"`));
});

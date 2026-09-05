import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FOCUS_PAGE_SHELL_IDS,
  FOCUS_PAGE_SHELL_CANONICAL_LAYOUT,
  HOME_PAGE_SHELL_CANONICAL_LAYOUT,
  HOME_PAGE_SHELL_IDS,
  HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS,
  HEALTH_PAGE_SHELL_IDS,
  NOTES_PAGE_SHELL_CANONICAL_LAYOUT,
  NOTES_PAGE_SHELL_IDS,
  SETTINGS_PAGE_SHELL_CANONICAL_LAYOUT,
  SETTINGS_PAGE_SHELL_IDS,
  STATS_PAGE_SHELL_IDS,
  STATS_PAGE_SHELL_CANONICAL_LAYOUT,
  TEST_PAGE_SHELL_CANONICAL_LAYOUT,
  TEST_PAGE_SHELL_IDS,
  TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT,
  TEST_D20_PAGE_SHELL_IDS,
  getPageShellDragAutoScrollDelta,
  getHealthPageShellKey,
  getPageShellDropTarget,
  getPageShellEmptyHorizontalColumnStart,
  getPageShellGridColumnGeometry,
  getPageShellInsertionIndex,
  getPageShellDirectionalInsertionIndex,
  getPageShellLayoutStorageKey,
  hasPageShellLayout,
  clampPageShellHeight,
  buildPageShellLayoutExport,
  createPageShellView,
  derivePageShellVisualOrder,
  derivePageShellColumns,
  formatPageShellDimensions,
  getPageShellColumnLabel,
  getPageShellColumnSlot,
  getPageShellColumnOptions,
  getPageShellExportFilename,
  getPageShellRowOrder,
  getPageShellViewsStorageKey,
  getRegisteredPageShellPages,
  getPageShellShrinkHeight,
  isLegacyTestD20LayoutPreference,
  mergeVisiblePageShellOrder,
  movePageShellOneLane,
  movePageShellToCenterRow,
  movePageShellToColumn,
  movePageShellToSlot,
  normalizePageShellLayout,
  normalizePageShellSpan,
  normalizePageShellSize,
  normalizePageShellOrder,
  normalizePageShellPlacement,
  migrateLegacyTestD20Storage,
  packPageShellLayout,
  PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX,
  PAGE_SHELL_HEIGHT_SNAP,
  PAGE_SHELL_MAX_HEIGHT,
  PAGE_SHELL_MIN_HEIGHT,
  PAGE_SHELL_SPAN_OPTIONS,
  readPageShellLayout,
  reorderPageShellOrder,
  reorderPageShellOrderAt,
  removePageShellLayout,
  projectVisiblePageShellOrder,
  readPageShellViews,
  removePageShellView,
  resolvePageShellViewLayout,
  PAGE_SHELL_EXPORT_SCHEMA,
  PAGE_SHELL_EXPORT_SCHEMA_VERSION,
  PAGE_SHELL_VIEWS_SCHEMA_VERSION,
  writePageShellView,
  snapPageShellHeight,
  writePageShellLayout,
  placePageShellAtDrop,
} from "@/lib/page-shell-layout";
import { isPageShellPointerMatch, isStalePageShellMouseMove, PageShell, PageShellBody, PageShellLayoutControls, PageShellSurface, ReorderablePageShells, shouldUsePageShellPackedPresentation } from "@/components/ui-system/reorderable-page-shells";
import type { PageShellLayoutState } from "@/hooks/usePageShellLayout";

const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
const settingsPageSource = readFileSync(new URL("../src/components/task-app/settings-page.tsx", import.meta.url), "utf8");
const notesSource = readFileSync(new URL("../src/components/task-app/notes-page.tsx", import.meta.url), "utf8");
const testD20Source = readFileSync(new URL("../src/components/task-app/test-d20-face-mapper.tsx", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const statsSource = readFileSync(new URL("../src/components/task-app/stats-page.tsx", import.meta.url), "utf8");
const healthSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const activeWorkoutSource = readFileSync(new URL("../src/components/task-app/health-active-workout.tsx", import.meta.url), "utf8");
const fitnessSource = readFileSync(new URL("../src/components/task-app/health-fitness-tab.tsx", import.meta.url), "utf8");
const todaySource = readFileSync(new URL("../src/components/task-app/health-today-tab.tsx", import.meta.url), "utf8");
const waterSource = readFileSync(new URL("../src/components/task-app/health-water-panel.tsx", import.meta.url), "utf8");
const focusSource = readFileSync(new URL("../src/components/focus-page.tsx", import.meta.url), "utf8");
const focusGoalsSource = readFileSync(new URL("../src/components/focus-goals-panel.tsx", import.meta.url), "utf8");
const focusCountersSource = readFileSync(new URL("../src/components/focus-counters.tsx", import.meta.url), "utf8");
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

function canonicalEditLayout(canonical: typeof HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food) {
  return normalizePageShellLayout({
    order: [...canonical.order],
    placements: canonical.placements,
    sizes: canonical.sizes,
  }, canonical.order, canonical.sizes);
}

function staticShellLayout(isEditing: boolean): PageShellLayoutState {
  return {
    applyView: () => undefined,
    beginPreview: () => undefined,
    canEdit: true,
    canReorder: true,
    canResize: true,
    canonicalLayout: {
      order: ["conditional", "regular"],
      sizes: {
        conditional: { heightPx: 288, span: 6 },
        regular: { heightPx: null, span: 12 },
      },
    },
    cancelPreview: () => undefined,
    commitPreview: () => undefined,
    deleteView: () => undefined,
    exportLayouts: () => { throw new Error("not used in static render"); },
    finishEditing: () => undefined,
    isEditing,
    isLayoutReady: true,
    isPreviewing: false,
    isCanonical: false,
    order: ["conditional", "regular"],
    pageKey: "test",
    placements: {
      conditional: { columnStart: 1, laneOrder: 0 },
      regular: { columnStart: 7, laneOrder: 0 },
    },
    reset: () => undefined,
    saveView: () => null,
    setPreviewOrder: () => undefined,
    setPreviewPlacements: () => undefined,
    setPreviewSizes: () => undefined,
    sizes: {
      conditional: { heightPx: 288, span: 6 },
      regular: { heightPx: null, span: 12 },
    },
    startEditing: () => undefined,
    views: [],
  };
}

test("page shell normalization preserves valid order and appends new defaults", () => {
  assert.deepEqual(normalizePageShellOrder(["C", "A", "C", "stale"], ["A", "B", "C", "D"]), ["C", "A", "B", "D"]);
  assert.deepEqual(normalizePageShellOrder(null, ["A", "B"]), ["A", "B"]);
  assert.deepEqual(normalizePageShellOrder(["B"], ["A", "B", "C"]), ["B", "A", "C"]);
});

test("page shell spans support 3 through 12 columns and clamp narrower values", () => {
  assert.deepEqual(PAGE_SHELL_SPAN_OPTIONS, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (const span of PAGE_SHELL_SPAN_OPTIONS) {
    assert.equal(normalizePageShellSize({ heightPx: null, span }).span, span);
  }
  assert.equal(normalizePageShellSize({ heightPx: null, span: 1 }).span, 3);
  assert.equal(normalizePageShellSize({ heightPx: null, span: 2 }).span, 3);
  assert.equal(normalizePageShellSize({ heightPx: null, span: 99 }).span, 12);
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
  const fitnessSizes = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Fitness.sizes;
  store.setItem("adhdice-page-section-order:user-1", JSON.stringify({ "health:fitness": ["fitness-week", "fitness-today"] }));
  assert.equal(key, "adhdice-page-shell-layout-v1:user-1");
  assert.deepEqual(readPageShellLayout(store, key, "health:fitness", fitnessDefaults, fitnessSizes).order, [...fitnessDefaults]);
  store.setItem(key, JSON.stringify({ focus: { order: ["focus-history", "focus-goals"], sizes: { "focus-history": { heightPx: 432, span: 6 } } } }));
  writePageShellLayout(store, key, "health:fitness", { order: ["fitness-week", "fitness-today", ...fitnessDefaults.slice(0, 1), ...fitnessDefaults.slice(3)], sizes: { "fitness-today": { heightPx: 384, span: 8 } } });
  assert.deepEqual(readPageShellLayout(store, key, "health:fitness", fitnessDefaults, fitnessSizes).order, ["fitness-week", "fitness-today", "fitness-active-workout", "fitness-goals", "fitness-plans", "fitness-workout-history"]);
  assert.deepEqual(readPageShellLayout(store, key, "health:fitness", fitnessDefaults, fitnessSizes).sizes["fitness-today"], { heightPx: 384, span: 8 });
  store.setItem(key, JSON.stringify({
    focus: { order: ["focus-history", "focus-goals"], sizes: { "focus-history": { heightPx: 432, span: 6 } } },
    "health:food": {
      order: ["food-meal-log", "food-daily-totals", "food-library"],
      sizes: { "food-daily-totals": { heightPx: 288, span: 4 } },
    },
  }));
  const foodLayout = readPageShellLayout(store, key, "health:food", HEALTH_PAGE_SHELL_IDS.Food, HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food.sizes);
  assert.deepEqual(foodLayout.order, ["food-meal-log", "food-daily-totals", "food-favorites-recent", "food-library"]);
  assert.deepEqual(foodLayout.sizes["food-daily-totals"], { heightPx: 288, span: 4 });
  assert.deepEqual(foodLayout.sizes["food-favorites-recent"], { heightPx: 288, span: 4 });
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

test("named page-shell views use a separate versioned local store and remain page-scoped", () => {
  const store = storage();
  const key = getPageShellViewsStorageKey("user-views");
  const customLayout = {
    order: ["food", "totals"],
    placements: {
      food: { columnStart: 1, laneOrder: 0 },
      totals: { columnStart: 7, laneOrder: 0 },
    },
    sizes: {
      food: { heightPx: 288, span: 6 as const },
      totals: { heightPx: null, span: 6 as const },
    },
  };
  writePageShellView(store, key, createPageShellView({
    createdAt: "2026-09-04T10:00:00.000Z",
    layout: customLayout,
    name: "Desktop Food",
    pageKey: "health:food",
    presentation: "custom",
    target: "web",
    viewport: { height: 900, width: 1440 },
  }));
  writePageShellView(store, key, createPageShellView({
    createdAt: "2026-09-04T11:00:00.000Z",
    name: "Default Focus",
    pageKey: "focus",
    presentation: "canonical",
    target: "iphone",
    viewport: { height: 844, width: 390 },
  }));

  const raw = JSON.parse(store.values.get(key) ?? "null") as { version: number; views: unknown[] };
  assert.equal(raw.version, PAGE_SHELL_VIEWS_SCHEMA_VERSION);
  assert.equal(readPageShellViews(store, key, "health:food").length, 1);
  assert.equal(readPageShellViews(store, key, "focus")[0]?.target, "iphone");
  assert.deepEqual(readPageShellViews(store, key, "health:food")[0]?.layout, customLayout);
  assert.equal(JSON.stringify(readPageShellViews(store, key)).includes("user-1"), false);

  const foodView = readPageShellViews(store, key, "health:food")[0];
  assert.ok(foodView);
  removePageShellView(store, key, foodView.id);
  assert.equal(readPageShellViews(store, key, "health:food").length, 0);
  assert.equal(readPageShellViews(store, key, "focus").length, 1);
});

test("custom and canonical views resolve to the current page's layout without sharing pages", () => {
  const canonical = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food;
  const customView = createPageShellView({
    createdAt: "2026-09-04T10:00:00.000Z",
    layout: { order: ["food-library", "food-meal-log"], sizes: { "food-meal-log": { heightPx: 288, span: 6 } } },
    name: "Compact Food",
    pageKey: "health:food",
    presentation: "custom",
    target: "web",
    viewport: { height: 800, width: 390 },
  });
  const custom = resolvePageShellViewLayout(customView, canonical);
  assert.equal(custom.presentation, "custom");
  assert.deepEqual(custom.layout.order, ["food-library", "food-meal-log", "food-daily-totals", "food-favorites-recent"]);
  assert.deepEqual(custom.layout.sizes["food-meal-log"], { heightPx: 288, span: 6 });

  const canonicalView = createPageShellView({
    createdAt: "2026-09-04T10:00:00.000Z",
    name: "My Default Food",
    pageKey: "health:food",
    presentation: "canonical",
    target: "iphone",
    viewport: { height: 844, width: 390 },
  });
  const resolvedCanonical = resolvePageShellViewLayout(canonicalView, canonical);
  assert.equal(resolvedCanonical.presentation, "canonical");
  assert.deepEqual(resolvedCanonical.layout.order, [...canonical.order]);
  assert.deepEqual(resolvedCanonical.layout.sizes, canonical.sizes);
  assert.deepEqual(resolvedCanonical.layout.placements?.["food-daily-totals"], { columnStart: 8, laneOrder: 0 });
  assert.equal(canonicalView.layout, undefined);
});

test("layout export includes registered canonical pages, customized pages, and metadata only", () => {
  const store = storage();
  const layoutKey = getPageShellLayoutStorageKey("export-user");
  const viewsKey = "adhdice-page-shell-views-v1:export-user";
  writePageShellLayout(store, layoutKey, "health:fitness", {
    order: ["fitness-week", "fitness-today", "fitness-active-workout", "fitness-goals", "fitness-plans", "fitness-workout-history"],
    sizes: { "fitness-today": { heightPx: 288, span: 7 } },
  });
  const view = createPageShellView({
    createdAt: "2026-09-04T10:00:00.000Z",
    layout: { order: ["fitness-week", "fitness-today"], sizes: { "fitness-today": { heightPx: 288, span: 7 } } },
    name: "Compact Fitness",
    pageKey: "health:fitness",
    presentation: "custom",
    target: "web",
    viewport: { height: 900, width: 1200 },
  });
  writePageShellView(store, viewsKey, view);
  const exported = buildPageShellLayoutExport({
    appVersion: "7.12.80",
    currentLayout: readPageShellLayout(store, layoutKey, "health:food", HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food.order, HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food.sizes),
    currentPageKey: "health:food",
    currentPresentation: "canonical",
    exportedAt: "2026-09-04T12:00:00.000Z",
    storage: store,
    storageKey: layoutKey,
    viewsStorageKey: viewsKey,
  });
  assert.equal(exported.schema, PAGE_SHELL_EXPORT_SCHEMA);
  assert.equal(exported.schemaVersion, PAGE_SHELL_EXPORT_SCHEMA_VERSION);
  assert.equal(exported.appVersion, "7.12.80");
  assert.equal(exported.pages.find((page) => page.pageKey === "health:food")?.presentation, "canonical");
  const fitness = exported.pages.find((page) => page.pageKey === "health:fitness");
  assert.equal(fitness?.presentation, "custom");
  assert.equal(fitness?.layout?.sizes["fitness-today"].heightPx, 288);
  assert.equal(exported.views[0]?.target, "web");
  assert.equal(exported.views[0]?.viewport.width, 1200);
  for (const registeredPage of getRegisteredPageShellPages()) {
    assert.ok(exported.pages.some((page) => page.pageKey === registeredPage.pageKey), registeredPage.pageKey);
  }
  for (const pageKey of ["home", "settings", "notes", "test"]) {
    assert.equal(exported.pages.find((page) => page.pageKey === pageKey)?.presentation, "canonical");
  }
  const json = JSON.stringify(exported);
  assert.doesNotMatch(json, /export-user|user_id|tasks|food records|personal notes/i);
  assert.equal(exported.pages.some((page) => page.presentation === "canonical"), true);
  assert.equal(exported.pages.some((page) => page.presentation === "custom"), true);
});

test("Reset Layout removes only the current preference and restores canonical order, width, and natural height", () => {
  const store = storage();
  const key = getPageShellLayoutStorageKey("user-reset");
  const foodCanonical = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food;
  writePageShellLayout(store, key, "health:food", {
    order: ["food-library", "food-favorites-recent", "food-daily-totals", "food-meal-log"],
    sizes: { "food-meal-log": { heightPx: 384, span: 12 } },
  });
  writePageShellLayout(store, key, "focus", {
    order: ["focus-goals", ...FOCUS_PAGE_SHELL_IDS.filter((id) => id !== "focus-goals")],
    sizes: { "focus-goals": { heightPx: 384, span: 8 } },
  });

  const savedFood = readPageShellLayout(store, key, "health:food", HEALTH_PAGE_SHELL_IDS.Food, foodCanonical.sizes);
  assert.deepEqual(savedFood.order[0], "food-library");
  assert.deepEqual(savedFood.sizes["food-meal-log"], { heightPx: 384, span: 12 });
  assert.equal(hasPageShellLayout(store, key, "health:food"), true);

  removePageShellLayout(store, key, "health:food");
  const resetFood = readPageShellLayout(store, key, "health:food", foodCanonical.order, foodCanonical.sizes);
  assert.deepEqual(resetFood.order, [...foodCanonical.order]);
  assert.deepEqual(resetFood.sizes, foodCanonical.sizes);
  assert.equal(hasPageShellLayout(store, key, "health:food"), false);
  assert.equal(hasPageShellLayout(store, key, "focus"), true);
  assert.deepEqual(readPageShellLayout(store, key, "health:food", foodCanonical.order, foodCanonical.sizes), resetFood);
});

test("canonical Health metadata preserves pre-shell placement and proportions", () => {
  const food = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food;
  assert.equal(food.gridClassName, "xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]");
  assert.deepEqual(food.groups, [
    { className: "xl:col-start-1 xl:col-end-2", shellIds: ["food-meal-log"] },
    { className: "grid gap-5 xl:col-start-2 xl:col-end-3", shellIds: ["food-daily-totals", "food-favorites-recent"] },
    { className: "xl:col-span-full", shellIds: ["food-library"] },
  ]);
  assert.equal(food.shellClassNames, undefined);
  assert.equal(food.sizes["food-meal-log"].heightPx, null);

  for (const [tab, expectedGroups] of [
    ["Water", [["water-log"], ["water-pending", "water-today", "water-history"]]],
    ["Sleep", [["sleep-ledger"], ["sleep-log", "sleep-focus-ledger", "sleep-sources"]]],
  ] as const) {
    const layout = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS[tab];
    assert.deepEqual(layout.groups?.map((group) => group.shellIds), expectedGroups);
    assert.equal(layout.shellClassNames, undefined);
  }

  const fitness = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Fitness;
  assert.equal(fitness.gridClassName, "xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]");
  assert.equal(fitness.shellClassNames?.["fitness-active-workout"], "xl:col-span-full");
  assert.equal(fitness.shellClassNames?.["fitness-today"], "xl:col-start-1 xl:col-end-2");
  assert.equal(fitness.shellClassNames?.["fitness-week"], "xl:col-start-2 xl:col-end-3");
  assert.equal(fitness.sizes["fitness-today"].span, 7);
  assert.equal(fitness.sizes["fitness-week"].span, 5);
  assert.equal(fitness.sizes["fitness-today"].heightPx, null);
});

test("canonical groups render independent lanes and vertically stacked shells", () => {
  const food = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food;
  const layout: PageShellLayoutState = {
    ...staticShellLayout(false),
    canonicalLayout: food,
    isCanonical: true,
    order: [...food.order],
    pageKey: "health:food",
    sizes: Object.fromEntries(Object.entries(food.sizes).map(([id, size]) => [id, { ...size }])),
  };
  const markup = renderToStaticMarkup(createElement(
    ReorderablePageShells,
    { layout },
    createElement(PageShell, { id: "food-meal-log", label: "Meal Log" }, createElement("span", null, "meal")),
    createElement(PageShell, { id: "food-daily-totals", label: "Daily Totals" }, createElement("span", null, "totals")),
    createElement(PageShell, { id: "food-favorites-recent", label: "Favorites" }, createElement("span", null, "favorites")),
    createElement(PageShell, { id: "food-library", label: "Food Library" }, createElement("span", null, "library")),
  ));
  assert.equal((markup.match(/data-page-shell-group=/g) ?? []).length, 3);
  assert.match(markup, /class="[^"]*xl:col-start-1 xl:col-end-2[^"]*" data-page-shell-group="0"/);
  assert.match(markup, /class="[^"]*grid gap-5 xl:col-start-2 xl:col-end-3[^"]*" data-page-shell-group="1"/);
  assert.match(markup, /class="[^"]*xl:col-span-full[^"]*" data-page-shell-group="2"/);
  const stackedGroup = markup.match(/data-page-shell-group="1"[\s\S]*?data-page-shell-group="2"/)?.[0] ?? "";
  assert.match(stackedGroup, /data-page-shell-id="food-daily-totals"[\s\S]*data-page-shell-id="food-favorites-recent"/);
});

test("canonical pages switch to packed edit topology before interaction", () => {
  const canonical = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food;
  const editLayout = canonicalEditLayout(canonical);
  const children = [
    createElement(PageShell, { id: "food-meal-log", label: "Meal Log" }, createElement("span", null, "meal")),
    createElement(PageShell, { id: "food-daily-totals", label: "Daily Totals" }, createElement("span", null, "totals")),
    createElement(PageShell, { id: "food-favorites-recent", label: "Favorites" }, createElement("span", null, "favorites")),
    createElement(PageShell, { id: "food-library", label: "Food Library" }, createElement("span", null, "library")),
  ];
  const baseLayout = {
    ...staticShellLayout(false),
    canonicalLayout: canonical,
    isCanonical: true,
    order: [...editLayout.order],
    placements: editLayout.placements ?? {},
    sizes: editLayout.sizes,
  };
  const canonicalMarkup = renderToStaticMarkup(createElement(ReorderablePageShells, { layout: baseLayout }, children));
  const editMarkup = renderToStaticMarkup(createElement(ReorderablePageShells, {
    layout: { ...baseLayout, isEditing: true },
  }, children));
  const previewMarkup = renderToStaticMarkup(createElement(ReorderablePageShells, {
    layout: { ...baseLayout, isEditing: true, isPreviewing: true },
  }, children));

  assert.equal((canonicalMarkup.match(/data-page-shell-group=/g) ?? []).length, 3);
  assert.match(canonicalMarkup, /data-page-shell-packed="false"/);
  for (const markup of [editMarkup, previewMarkup]) {
    assert.equal((markup.match(/data-page-shell-group=/g) ?? []).length, 0);
    assert.match(markup, /class="[^"]*page-shell-packed/);
    assert.match(markup, /data-page-shell-edit-mode="true"/);
    assert.match(markup, /data-page-shell-packed="true"/);
    assert.match(markup, /data-page-shell-presentation="canonical"/);
  }
  assert.equal(shouldUsePageShellPackedPresentation(true, false), false);
  assert.equal(shouldUsePageShellPackedPresentation(true, true), true);
  assert.equal(shouldUsePageShellPackedPresentation(false, false), true);
  assert.match(shellSource, /const usePackedPlacement = shouldUsePageShellPackedPresentation\(layout\.isCanonical, layout\.isEditing\)/);
  assert.match(layoutHookSource, /setHasCustomLayoutPreference\(true\)/);
  assert.match(layoutHookSource, /if \(!preview \|\| pageShellLayoutsEqual\(preview, committedLayout\)\) return;/);
});

test("canonical edit seeds match the visible left and right lanes", () => {
  const water = canonicalEditLayout(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Water);
  assert.deepEqual(
    Object.fromEntries(["water-log", "water-pending", "water-today", "water-history"].map((id) => [
      id,
      getPageShellColumnSlot(water.order, water.sizes, water.placements ?? {}, id),
    ])),
    {
      "water-log": { columnLabel: "A", columnStart: 1, slot: 1, slotCount: 1 },
      "water-pending": { columnLabel: "B", columnStart: 6, slot: 1, slotCount: 3 },
      "water-today": { columnLabel: "B", columnStart: 6, slot: 2, slotCount: 3 },
      "water-history": { columnLabel: "B", columnStart: 6, slot: 3, slotCount: 3 },
    },
  );

  for (const [canonical, expected] of [
    [HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food, {
      "food-meal-log": { columnLabel: "A", slot: 1 },
      "food-daily-totals": { columnLabel: "B", slot: 1 },
      "food-favorites-recent": { columnLabel: "B", slot: 2 },
    }],
    [HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Weight, {
      "weight-entry": { columnLabel: "A", slot: 1 },
      "weight-trend": { columnLabel: "B", slot: 1 },
    }],
    [HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Sleep, {
      "sleep-ledger": { columnLabel: "A", slot: 1 },
      "sleep-log": { columnLabel: "B", slot: 1 },
      "sleep-focus-ledger": { columnLabel: "B", slot: 2 },
      "sleep-sources": { columnLabel: "B", slot: 3 },
    }],
    [HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Insights, {
      "insights-import": { columnLabel: "A", slot: 1 },
      "insights-trends": { columnLabel: "B", slot: 1 },
    }],
    [TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT, {
      "test-d20-sandbox": { columnLabel: "A", slot: 1 },
      "test-d20-controls": { columnLabel: "B", slot: 1 },
    }],
  ] as const) {
    const editLayout = canonicalEditLayout(canonical);
    for (const [id, coordinate] of Object.entries(expected)) {
      const actual = getPageShellColumnSlot(editLayout.order, editLayout.sizes, editLayout.placements ?? {}, id);
      assert.equal(actual?.columnLabel, coordinate.columnLabel, id);
      assert.equal(actual?.slot, coordinate.slot, id);
    }
  }
});

test("Fitness canonical side-by-side region survives full-width boundaries", () => {
  const canonical = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Fitness;
  const editLayout = canonicalEditLayout(canonical);
  const positions = packPageShellLayout(canonical.order, canonical.sizes, { placements: canonical.placements });
  const active = positions["fitness-active-workout"];
  const today = positions["fitness-today"];
  const week = positions["fitness-week"];
  const goals = positions["fitness-goals"];
  const plans = positions["fitness-plans"];
  const history = positions["fitness-workout-history"];
  assert.equal(today.columnStart, 1);
  assert.equal(week.columnStart, 8);
  assert.equal(today.rowStart, active.rowStart + active.rowSpan);
  assert.equal(week.rowStart, today.rowStart);
  assert.ok(goals.rowStart >= Math.max(today.rowStart + today.rowSpan, week.rowStart + week.rowSpan));
  assert.ok(plans.rowStart >= goals.rowStart + goals.rowSpan);
  assert.ok(history.rowStart >= plans.rowStart + plans.rowSpan);
  assert.deepEqual(getPageShellColumnSlot(editLayout.order, editLayout.sizes, editLayout.placements ?? {}, "fitness-today")?.columnLabel, "A");
  assert.deepEqual(getPageShellColumnSlot(editLayout.order, editLayout.sizes, editLayout.placements ?? {}, "fitness-week")?.columnLabel, "B");
});

test("Health, Focus, and Stats canonical defaults are explicit and natural", () => {
  for (const [tab, layout] of Object.entries(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS)) {
    assert.ok(layout.order.length > 0, `${tab} should have canonical shells`);
    for (const id of layout.order) assert.equal(layout.sizes[id].heightPx, null, `${tab}/${id} should be natural height`);
  }
  assert.deepEqual([...HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Sleep.order], ["sleep-ledger", "sleep-log", "sleep-focus-ledger", "sleep-sources"]);
  assert.equal(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Water.gridClassName, "xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]");
  assert.equal(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Insights.gridClassName, "xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]");
  assert.equal(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Weight.gridClassName, "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]");
  assert.deepEqual([...FOCUS_PAGE_SHELL_CANONICAL_LAYOUT.order], [...FOCUS_PAGE_SHELL_IDS]);
  assert.deepEqual([...STATS_PAGE_SHELL_CANONICAL_LAYOUT.order], [...STATS_PAGE_SHELL_IDS]);
  for (const layout of [FOCUS_PAGE_SHELL_CANONICAL_LAYOUT, STATS_PAGE_SHELL_CANONICAL_LAYOUT]) {
    for (const id of layout.order) assert.equal(layout.sizes[id].heightPx, null);
  }
});

test("Water and Sleep legacy composite slots migrate their order and size to replacement shells", () => {
  const store = storage();
  const key = getPageShellLayoutStorageKey("user-shell-migration");
  store.setItem(key, JSON.stringify({
    "health:water": {
      order: ["water-log", "water-history"],
      sizes: { "water-history": { heightPx: 432, span: 8 } },
    },
    "health:sleep": {
      order: ["sleep-entry-and-sources", "sleep-ledger"],
      sizes: {
        "sleep-entry-and-sources": { heightPx: 384, span: 7 },
        "sleep-ledger": { heightPx: 288, span: 6 },
      },
    },
  }));

  const water = readPageShellLayout(store, key, "health:water", HEALTH_PAGE_SHELL_IDS.Water, HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Water.sizes);
  assert.deepEqual(water.order, ["water-log", "water-pending", "water-today", "water-history"]);
  for (const id of ["water-pending", "water-today", "water-history"]) {
    assert.deepEqual(water.sizes[id], { heightPx: 432, span: 8 });
  }

  const sleep = readPageShellLayout(store, key, "health:sleep", HEALTH_PAGE_SHELL_IDS.Sleep, HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Sleep.sizes);
  assert.deepEqual(sleep.order, ["sleep-log", "sleep-sources", "sleep-focus-ledger", "sleep-ledger"]);
  for (const id of ["sleep-log", "sleep-sources", "sleep-focus-ledger"]) {
    assert.deepEqual(sleep.sizes[id], { heightPx: 384, span: 7 });
  }
  assert.deepEqual(sleep.sizes["sleep-ledger"], { heightPx: 288, span: 6 });
});

test("corrupt page shell storage falls back to defaults", () => {
  const store = storage();
  const key = getPageShellLayoutStorageKey("user-1");
  store.setItem(key, "{not json");
  assert.deepEqual(readPageShellLayout(store, key, "stats", ["stats-overview", "stats-energy"], {}).order, ["stats-overview", "stats-energy"]);
});

test("shell height controls preserve the 144px floor and let short shells enter snapped custom heights", () => {
  assert.equal(normalizePageShellSpan(2), 3);
  assert.equal(normalizePageShellSpan(12.6), 12);
  assert.equal(getPageShellShrinkHeight(912), PAGE_SHELL_MIN_HEIGHT);
  assert.equal(getPageShellShrinkHeight(120), 120);
  assert.equal(clampPageShellHeight(PAGE_SHELL_MIN_HEIGHT, 912), PAGE_SHELL_MIN_HEIGHT);
  assert.equal(clampPageShellHeight(5000, 912), PAGE_SHELL_MAX_HEIGHT);
  assert.ok((clampPageShellHeight(960, 912) ?? 0) > 912);
  assert.equal(clampPageShellHeight(110, 114), null);
  assert.equal(clampPageShellHeight(114, 114), null);
  assert.equal(clampPageShellHeight(130, 114), PAGE_SHELL_MIN_HEIGHT);
  assert.equal(clampPageShellHeight(170, 114), 192);
  assert.equal(clampPageShellHeight(300, 114), 288);
  assert.equal(clampPageShellHeight(360, 114), 384);
  assert.equal(clampPageShellHeight(5000, 114), PAGE_SHELL_MAX_HEIGHT);
  assert.equal(formatPageShellDimensions(6, 288, 912), "W 6/12 · H 288px · Natural 912px");
  assert.equal(formatPageShellDimensions(6, 288, 912, 842), "W 6/12 · 842px · H 288px · Natural 912px");
  assert.equal(formatPageShellDimensions(6, null, 912), "W 6/12 · H 912px · Natural 912px");
  assert.equal(formatPageShellDimensions(6, 288, null), "W 6/12 · H 288px · Natural —px");
  assert.equal(getPageShellExportFilename(new Date("2026-09-04T12:00:00.000Z")), "adhdice-layout-templates-2026-09-04.json");
  assert.doesNotMatch(globalSource, /@media \(max-width: 1279px\)[\s\S]*page-shell-custom-height/);
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
  assert.match(editMarkup, /style="height:288px"/);
  assert.match(editMarkup, /data-page-shell-size-span="6"/);
  assert.match(editMarkup, /aria-label="Shrink Conditional"/);
  assert.match(editMarkup, /aria-label="Expand Conditional"/);
  assert.match(editMarkup, /W 6\/12 · H 288px · Natural —px/);
  assert.match(editMarkup, /aria-label="Set Conditional placement"/);
  assert.match(editMarkup, /aria-label="Set Conditional slot"/);
  assert.doesNotMatch(editMarkup, /Set Conditional position/);
  assert.doesNotMatch(editMarkup, /Set Regular placement/);
  assert.doesNotMatch(editMarkup, /Set Regular slot/);
  assert.match(editMarkup, /Full/);
});

test("shell editor renders semantic Column + Slot controls and no global position input", () => {
  const layout: PageShellLayoutState = {
    ...staticShellLayout(true),
    canonicalLayout: {
      order: ["a", "b", "c", "full"],
      sizes: {
        a: { heightPx: null, span: 6 },
        b: { heightPx: null, span: 6 },
        c: { heightPx: null, span: 6 },
        full: { heightPx: null, span: 12 },
      },
    },
    isCanonical: false,
    order: ["a", "b", "c", "full"],
    placements: {
      a: { columnStart: 1, laneOrder: 0 },
      b: { columnStart: 1, laneOrder: 1 },
      c: { columnStart: 1, laneOrder: 2 },
      full: { columnStart: 1, laneOrder: 3 },
    },
    sizes: {
      a: { heightPx: null, span: 6 },
      b: { heightPx: null, span: 6 },
      c: { heightPx: null, span: 6 },
      full: { heightPx: null, span: 12 },
    },
  };
  const markup = renderToStaticMarkup(createElement(
    ReorderablePageShells,
    { layout },
    createElement(PageShell, { id: "a", label: "Shell A" }, createElement("span", null, "a")),
    createElement(PageShell, { id: "b", label: "Shell B" }, createElement("span", null, "b")),
    createElement(PageShell, { id: "c", label: "Shell C" }, createElement("span", null, "c")),
    createElement(PageShell, { id: "full", label: "Full Shell" }, createElement("span", null, "full")),
  ));
  assert.match(markup, /<span>Col A<\/span>/);
  assert.match(markup, /aria-label="Set Shell B slot"[\s\S]*max="3"[\s\S]*value="2"/);
  assert.match(markup, /<span>Slot<\/span>[\s\S]*<span>\/3<\/span>/);
  assert.doesNotMatch(markup, /Pos|Set Shell [ABC] position/);
  assert.doesNotMatch(markup, /aria-label="Set Full Shell (column|slot)"/);
});

test("shell editor presents a centered placement without Column or Slot controls", () => {
  const layout: PageShellLayoutState = {
    ...staticShellLayout(true),
    canonicalLayout: {
      order: ["left", "center", "right"],
      sizes: {
        left: { heightPx: null, span: 6 },
        center: { heightPx: null, span: 6 },
        right: { heightPx: null, span: 6 },
      },
    },
    isCanonical: false,
    order: ["left", "center", "right"],
    placements: {
      left: { columnStart: 1, laneOrder: 0 },
      center: { columnStart: 7, laneOrder: 1, mode: "centered" },
      right: { columnStart: 7, laneOrder: 0 },
    },
    sizes: {
      left: { heightPx: null, span: 6 },
      center: { heightPx: null, span: 6 },
      right: { heightPx: null, span: 6 },
    },
  };
  const markup = renderToStaticMarkup(createElement(
    ReorderablePageShells,
    { layout },
    createElement(PageShell, { id: "left", label: "Left Shell" }, createElement("span", null, "left")),
    createElement(PageShell, { id: "center", label: "Centered Shell" }, createElement("span", null, "center")),
    createElement(PageShell, { id: "right", label: "Right Shell" }, createElement("span", null, "right")),
  ));
  const centeredShell = markup.match(/data-page-shell-id="center"[\s\S]*?data-page-shell-id="right"/)?.[0] ?? "";
  assert.match(centeredShell, /--page-shell-grid-column-start:4/);
  assert.match(centeredShell, /data-page-shell-centered="true"/);
  assert.match(centeredShell, /<span>Center<\/span>/);
  assert.match(centeredShell, /aria-label="Set Centered Shell placement"/);
  assert.doesNotMatch(centeredShell, /aria-label="Set Centered Shell slot"/);
  assert.match(centeredShell, /Centered Shell row movement controls/);
  assert.match(centeredShell, /aria-label="Move Centered Shell up"/);
  assert.match(centeredShell, /aria-label="Move Centered Shell down"/);
  assert.match(shellSource, /getPageShellRowOrder\(/);
  assert.match(globalSource, /data-page-shell-centered="true"/);
});

test("shell editor keeps identity fixed and contains the complete tool row in a horizontal scroller", () => {
  const layout: PageShellLayoutState = {
    ...staticShellLayout(true),
    canonicalLayout: {
      order: ["narrow", "full"],
      sizes: {
        narrow: { heightPx: null, span: 3 },
        full: { heightPx: null, span: 12 },
      },
    },
    isCanonical: false,
    order: ["narrow", "full"],
    pageKey: "toolbar-scroll",
    placements: {
      narrow: { columnStart: 1, laneOrder: 0 },
      full: { columnStart: 1, laneOrder: 1 },
    },
    sizes: {
      narrow: { heightPx: null, span: 3 },
      full: { heightPx: null, span: 12 },
    },
  };
  const markup = renderToStaticMarkup(createElement(
    ReorderablePageShells,
    { layout },
    createElement(PageShell, { id: "narrow", label: "Narrow Shell" }, createElement("span", null, "narrow")),
    createElement(PageShell, { id: "full", label: "Full Shell" }, createElement("span", null, "full")),
  ));
  const narrowStrip = markup.match(/data-page-shell-id="narrow"[\s\S]*?data-page-shell-id="full"/)?.[0] ?? "";
  assert.match(narrowStrip, /data-page-shell-layout-identity/);
  assert.match(narrowStrip, /data-page-shell-layout-identity[\s\S]*data-page-shell-layout-tools-scroll/);
  assert.match(narrowStrip, /adhdice-scrollbar[^<]*adhdice-horizontal-scroll[^<]*min-w-0[^<]*overflow-x-auto[^<]*touch-pan-x[^<]*data-page-shell-layout-tools-scroll/);
  assert.match(narrowStrip, /flex w-max min-w-max flex-nowrap[^<]*data-page-shell-layout-tools/);
  for (const control of [
    'aria-label="Resize Narrow Shell width"',
    'aria-label="Set Narrow Shell width in columns"',
    'aria-label="Set Narrow Shell placement"',
    'aria-label="Set Narrow Shell slot"',
    'aria-label="Move Narrow Shell up"',
    'aria-label="Move Narrow Shell down"',
    'aria-label="Shrink Narrow Shell"',
    'aria-label="Expand Narrow Shell"',
  ]) assert.match(narrowStrip, new RegExp(control));
  assert.match(markup, /data-page-shell-id="full"[\s\S]*>Full<\/span>/);
  assert.match(shellSource, /createPortal\([\s\S]*document\.body/);
  assert.match(shellSource, /window\.addEventListener\("scroll", updateColumnMenuPosition, true\)/);
  assert.match(shellSource, /function commitShellColumn[\s\S]*movePageShellToColumn/);
  assert.match(shellSource, /function commitShellCenterRow[\s\S]*movePageShellToCenterRow/);
  assert.match(shellSource, /!isFullWidth && openColumnShellId === shell\.id/);
  assert.doesNotMatch(shellSource, /scrollLeft\s*=/);
  assert.doesNotMatch(shellSource, /data-page-shell-layout-tools-scroll[\s\S]*beginMove/);
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
  assert.doesNotMatch(shellSource, /page-shell-custom-height overflow-hidden/);
  assert.doesNotMatch(globalSource, /page-shell-custom-height:not\(:has/);
});

test("single-shell layouts can edit and resize without exposing reorder controls", () => {
  const layout: PageShellLayoutState = {
    ...staticShellLayout(true),
    canReorder: false,
    canonicalLayout: {
      order: ["only"],
      sizes: { only: { heightPx: null, span: 12 } },
    },
    isCanonical: true,
    order: ["only"],
    pageKey: "single-shell",
    sizes: { only: { heightPx: 288, span: 12 } },
  };
  const markup = renderToStaticMarkup(createElement(
    ReorderablePageShells,
    { layout },
    createElement(PageShell, { id: "only", label: "Only Shell" }, createElement("div", null, "content")),
  ));
  const controls = renderToStaticMarkup(createElement(PageShellLayoutControls, { layout }));
  assert.equal(layout.canEdit, true);
  assert.equal(layout.canResize, true);
  assert.equal(layout.canReorder, false);
  assert.match(controls, /Reset Layout/);
  assert.match(controls, /Done/);
  assert.match(markup, /aria-label="Resize Only Shell"/);
  assert.match(markup, /aria-label="Shrink Only Shell"/);
  assert.match(markup, /aria-label="Expand Only Shell"/);
  assert.doesNotMatch(markup, /aria-label="Move Only Shell"/);
  assert.match(markup, /Full/);
  assert.doesNotMatch(markup, /Set Only Shell column/);
  assert.doesNotMatch(markup, /Set Only Shell slot/);
});

test("two-or-more-shell layouts retain reorder capability", () => {
  assert.equal(staticShellLayout(false).canEdit, true);
  assert.equal(staticShellLayout(false).canResize, true);
  assert.equal(staticShellLayout(false).canReorder, true);
});

test("page shell pointer lifecycle finalizes only the active pointer and guards stale mouse movement", () => {
  assert.equal(isPageShellPointerMatch(17, 17), true);
  assert.equal(isPageShellPointerMatch(17, 18), false);
  assert.equal(isStalePageShellMouseMove("mouse", 0), true);
  assert.equal(isStalePageShellMouseMove("mouse", 1), false);
  assert.equal(isStalePageShellMouseMove("touch", 0), false);
  assert.equal(isStalePageShellMouseMove("pen", 0), false);
  assert.match(shellSource, /const updateInteractionRef = useRef/);
  assert.match(shellSource, /const endInteractionRef = useRef/);
  assert.match(shellSource, /window\.addEventListener\("pointermove", handlePointerMove, listenerOptions\)/);
  assert.match(shellSource, /window\.addEventListener\("pointerup", handlePointerUp, listenerOptions\)/);
  assert.match(shellSource, /window\.addEventListener\("pointercancel", handlePointerCancel, listenerOptions\)/);
  assert.match(shellSource, /window\.addEventListener\("blur", handleWindowBlur\)/);
  assert.match(shellSource, /const listenerOptions = \{ capture: true \}/);
  assert.match(shellSource, /endInteractionRef\.current\(event, false\)/);
  assert.match(shellSource, /endInteractionRef\.current\(event, true\)/);
  assert.match(shellSource, /endInteractionRef\.current\(null, true\)/);
  assert.equal((shellSource.match(/onPointerDown=\{\(event\) => beginMove\(event, shell\.id\)\}/g) ?? []).length, 1);
  assert.equal((shellSource.match(/onPointerDown=\{\(event\) => beginWidthResize\(event, shell\.id\)\}/g) ?? []).length, 1);
  assert.equal((shellSource.match(/onPointerDown=\{\(event\) => beginResize\(event, shell\.id\)\}/g) ?? []).length, 1);
  assert.equal((shellSource.match(/onPointerUp=\{\(event\) => endInteraction\(event, false\)\}/g) ?? []).length, 3);
  assert.equal((shellSource.match(/onPointerMove=\{updateInteraction\}/g) ?? []).length, 0);
  const endSource = shellSource.slice(shellSource.indexOf("function endInteraction"), shellSource.indexOf("useEffect(() => {", shellSource.indexOf("function endInteraction")));
  assert.ok(endSource.indexOf("interactionRef.current = null") < endSource.indexOf("layout.commitPreview()"));
  assert.match(endSource, /cancelDragAutoScroll\(\)/);
  assert.match(shellSource, /function releasePointerCaptureSafely\(interaction: ShellInteraction\)/);
  assert.match(endSource, /releasePointerCaptureSafely\(interaction\)/);
  assert.match(endSource, /if \(cancelled\) layout\.cancelPreview\(\);\s+else layout\.commitPreview\(\);/);
  assert.match(shellSource, /isStalePageShellMouseMove\(interaction\.pointerType, event\.buttons\)/);
  assert.match(shellSource, /if \(layout\.isEditing && layout\.isPreviewing\) return/);
  assert.match(shellSource, /window\.cancelAnimationFrame\(autoScrollFrameRef\.current\)/);
  assert.match(shellSource, /if \(!interaction\) \{\s+if \(!event\) \{\s+cancelDragAutoScroll\(\);\s+cancelMovePreview\(\);/);
  assert.match(shellSource, /grabOffsetX: sourceGeometry \? event\.clientX - sourceGeometry\.left : 0/);
  assert.match(shellSource, /interaction\.grabOffsetX/);
  assert.match(shellSource, /dropTarget\?\.targetId === null/);
  assert.match(shellSource, /getPageShellGridColumnGeometry/);
});

test("Health collapsible shell surfaces keep collapse state canonical and scroll only their open body", () => {
  assert.match(collapsiblePanelSource, /shellSurface = false/);
  assert.match(collapsiblePanelSource, /page-shell-surface flex h-full min-h-0 min-w-0 flex-col overflow-hidden/);
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
  assert.deepEqual(normalizePageShellSize({ heightPx: -1, span: 1 }), { heightPx: null, span: 3 });
  assert.deepEqual(normalizePageShellSize({ heightPx: 99, span: 99 }), { heightPx: PAGE_SHELL_MIN_HEIGHT, span: 12 });
  assert.deepEqual(normalizePageShellSize({ minHeight: 384, span: 8 }), { heightPx: 384, span: 8 });
  assert.deepEqual(normalizePageShellSize({ minHeight: 96, span: 8 }), { heightPx: PAGE_SHELL_MIN_HEIGHT, span: 8 });
  assert.equal(snapPageShellHeight(192), 192);
  assert.equal(snapPageShellHeight(400), 384);
  assert.equal(snapPageShellHeight(400), snapPageShellHeight(400));
  assert.equal(snapPageShellHeight(800), 816);
  assert.equal(PAGE_SHELL_HEIGHT_SNAP, 48);
  assert.equal(getPageShellShrinkHeight(400), PAGE_SHELL_MIN_HEIGHT);
  assert.equal(getPageShellShrinkHeight(120), 120);
  assert.equal(getPageShellShrinkHeight(PAGE_SHELL_MIN_HEIGHT), PAGE_SHELL_MIN_HEIGHT);
  assert.equal(clampPageShellHeight(700, 500), 720);
  assert.equal(clampPageShellHeight(100, 500), PAGE_SHELL_MIN_HEIGHT);
  assert.equal(clampPageShellHeight(100, 120), null);
  assert.equal(clampPageShellHeight(700, 120), 720);
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

test("packed placement fills vertical holes deterministically without overlap", () => {
  const sizes = {
    water: { heightPx: 700, span: 6 as const },
    today: { heightPx: 144, span: 6 as const },
    history: { heightPx: 144, span: 6 as const },
    pending: { heightPx: 144, span: 6 as const },
  };
  const packed = packPageShellLayout(["water", "today", "history", "pending"], sizes);
  assert.equal(packed.water.columnStart, 1);
  assert.equal(packed.today.columnStart, 7);
  assert.equal(packed.history.columnStart, 7);
  assert.equal(packed.pending.columnStart, 7);
  assert.ok(packed.history.rowStart > packed.today.rowStart);
  assert.ok(packed.pending.rowStart > packed.history.rowStart);
  assert.deepEqual(packed, packPageShellLayout(["water", "today", "history", "pending"], sizes));
});

test("packed placement supports mixed spans within the 12-column grid", () => {
  const sizes = {
    three: { heightPx: 144, span: 3 as const },
    four: { heightPx: 192, span: 4 as const },
    six: { heightPx: 240, span: 6 as const },
    eight: { heightPx: 288, span: 8 as const },
    full: { heightPx: 144, span: 12 as const },
  };
  const packed = packPageShellLayout(Object.keys(sizes), sizes);
  const entries = Object.entries(packed);
  for (const [id, left] of entries) {
    assert.ok(left.columnStart >= 1 && left.columnStart + left.columnSpan - 1 <= 12, id);
    for (const [otherId, right] of entries) {
      if (id >= otherId) continue;
      const columnsOverlap = left.columnStart < right.columnStart + right.columnSpan && right.columnStart < left.columnStart + left.columnSpan;
      const rowsOverlap = left.rowStart < right.rowStart + right.rowSpan && right.rowStart < left.rowStart + left.rowSpan;
      assert.equal(columnsOverlap && rowsOverlap, false, `${id} overlaps ${otherId}`);
    }
  }
});

test("semantic placement keeps the Water-style right lane stable through a persistence round trip", () => {
  const sizes = {
    water: { heightPx: 700, span: 6 as const },
    a: { heightPx: 144, span: 6 as const },
    b: { heightPx: 144, span: 6 as const },
    c: { heightPx: 144, span: 6 as const },
  };
  const legacy = normalizePageShellLayout({ order: ["water", "a", "b", "c"], sizes }, Object.keys(sizes), sizes);
  assert.deepEqual(legacy.placements, {
    water: { columnStart: 1, laneOrder: 0 },
    a: { columnStart: 7, laneOrder: 0 },
    b: { columnStart: 7, laneOrder: 1 },
    c: { columnStart: 7, laneOrder: 2 },
  });

  const dropped = placePageShellAtDrop(legacy, legacy.order, "b", {
    columnStart: 7,
    insertionIndex: 2,
    laneOrder: 1,
    targetId: "a",
  });
  assert.deepEqual(dropped.order, ["water", "a", "b", "c"]);
  assert.deepEqual(dropped.placements?.b, { columnStart: 7, laneOrder: 1 });

  const store = storage();
  const key = getPageShellLayoutStorageKey("water-placement");
  writePageShellLayout(store, key, "health:water", dropped);
  const roundTrip = readPageShellLayout(store, key, "health:water", Object.keys(sizes), sizes);
  assert.deepEqual(roundTrip.placements, dropped.placements);
  assert.deepEqual(getPageShellColumnSlot(roundTrip.order, roundTrip.sizes, roundTrip.placements ?? {}, "c"), { columnLabel: "B", columnStart: 7, slot: 3, slotCount: 3 });

  const withNewShell = normalizePageShellLayout({
    order: [...roundTrip.order, "d"],
    placements: roundTrip.placements,
    sizes: { ...sizes, d: { heightPx: 144, span: 6 as const } },
  }, [...roundTrip.order, "d"], { ...sizes, d: { heightPx: 144, span: 6 as const } });
  const packed = packPageShellLayout(withNewShell.order, withNewShell.sizes, { placements: withNewShell.placements });
  assert.equal(packed.d.columnStart, 7);
  assert.ok(packed.d.rowStart > packed.c.rowStart);
});

test("short custom shell heights persist without changing Column or Slot", () => {
  const sizes = {
    water: { heightPx: 700, span: 6 as const },
    today: { heightPx: clampPageShellHeight(300, 114), span: 6 as const },
    history: { heightPx: null, span: 6 as const },
  };
  const placements = {
    water: { columnStart: 1, laneOrder: 0 },
    today: { columnStart: 7, laneOrder: 0 },
    history: { columnStart: 7, laneOrder: 1 },
  };
  const layout = normalizePageShellLayout({ order: ["water", "today", "history"], placements, sizes }, Object.keys(sizes), sizes);
  const beforeHeight = getPageShellColumnSlot(layout.order, layout.sizes, layout.placements ?? {}, "today");
  const store = storage();
  const key = getPageShellLayoutStorageKey("short-height-placement");
  writePageShellLayout(store, key, "health:water", layout);
  const restored = readPageShellLayout(store, key, "health:water", Object.keys(sizes), sizes);

  assert.equal(restored.sizes.today.heightPx, 288);
  assert.deepEqual(getPageShellColumnSlot(restored.order, restored.sizes, restored.placements ?? {}, "today"), beforeHeight);
  assert.deepEqual(getPageShellColumnSlot(restored.order, restored.sizes, restored.placements ?? {}, "history"), { columnLabel: "B", columnStart: 7, slot: 2, slotCount: 2 });
  const packed = packPageShellLayout(restored.order, restored.sizes, { placements: restored.placements, naturalHeights: { today: 114 } });
  assert.equal(packed.today.columnStart, 7);
  assert.ok(packed.history.rowStart > packed.today.rowStart);
});

test("custom semantic placements normalize to visual column-major order", () => {
  const sizes = {
    A: { heightPx: 144, span: 6 as const },
    B: { heightPx: 144, span: 6 as const },
    C: { heightPx: 144, span: 6 as const },
    D: { heightPx: 144, span: 6 as const },
    E: { heightPx: 144, span: 6 as const },
    F: { heightPx: 144, span: 3 as const },
  };
  const placements = {
    A: { columnStart: 1, laneOrder: 0 },
    B: { columnStart: 1, laneOrder: 1 },
    C: { columnStart: 1, laneOrder: 2 },
    D: { columnStart: 7, laneOrder: 0 },
    E: { columnStart: 7, laneOrder: 1 },
    F: { columnStart: 10, laneOrder: 0 },
  };
  const layout = normalizePageShellLayout({
    order: ["A", "D", "B", "F", "C", "E"],
    placements,
    sizes,
  }, Object.keys(sizes), sizes);
  assert.deepEqual(layout.order, ["A", "B", "C", "D", "E", "F"]);
  assert.deepEqual(derivePageShellVisualOrder(["A", "D", "B", "F", "C", "E"], sizes, placements), layout.order);
});

test("moving one shell across columns preserves its neighbors' physical column and lane relationship", () => {
  const sizes = {
    A: { heightPx: 144, span: 6 as const },
    B: { heightPx: 144, span: 6 as const },
    C: { heightPx: 144, span: 6 as const },
    D: { heightPx: 144, span: 6 as const },
  };
  const placements = {
    A: { columnStart: 1, laneOrder: 0 },
    B: { columnStart: 7, laneOrder: 0 },
    C: { columnStart: 7, laneOrder: 1 },
    D: { columnStart: 7, laneOrder: 2 },
  };
  const result = placePageShellAtDrop(
    { order: ["A", "B", "C", "D"], placements, sizes },
    ["A", "B", "C", "D"],
    "D",
    { columnStart: 1, insertionIndex: 1, laneOrder: 1, targetId: null },
  );
  assert.deepEqual(result.order, ["A", "D", "B", "C"]);
  assert.deepEqual(result.placements, {
    A: { columnStart: 1, laneOrder: 0 },
    D: { columnStart: 1, laneOrder: 1 },
    B: { columnStart: 7, laneOrder: 0 },
    C: { columnStart: 7, laneOrder: 1 },
  });
  const sourceOrderResult = placePageShellAtDrop(
    { order: ["A", "B", "C", "D"], placements, sizes },
    ["B", "C", "D", "A"],
    "D",
    { columnStart: 1, insertionIndex: 1, laneOrder: 1, targetId: null },
  );
  assert.deepEqual(sourceOrderResult.order, result.order);
  assert.deepEqual(sourceOrderResult.placements, result.placements);

  const movedBack = placePageShellAtDrop(
    { ...result, sizes },
    result.order,
    "D",
    { columnStart: 7, insertionIndex: 3, laneOrder: 2, targetId: "C" },
  );
  assert.deepEqual(movedBack.order, ["A", "B", "C", "D"]);
  assert.deepEqual(movedBack.placements, {
    A: { columnStart: 1, laneOrder: 0 },
    B: { columnStart: 7, laneOrder: 0 },
    C: { columnStart: 7, laneOrder: 1 },
    D: { columnStart: 7, laneOrder: 2 },
  });
});

test("full-width shells divide visual column-major regions without taking column one early", () => {
  const sizes = {
    A: { heightPx: 144, span: 6 as const },
    B: { heightPx: 144, span: 6 as const },
    C: { heightPx: 144, span: 6 as const },
    D: { heightPx: 144, span: 6 as const },
    Library: { heightPx: 144, span: 12 as const },
    E: { heightPx: 144, span: 6 as const },
    F: { heightPx: 144, span: 6 as const },
  };
  const placements = {
    A: { columnStart: 1, laneOrder: 0 },
    B: { columnStart: 1, laneOrder: 1 },
    C: { columnStart: 7, laneOrder: 0 },
    D: { columnStart: 7, laneOrder: 1 },
    Library: { columnStart: 1, laneOrder: 2 },
    E: { columnStart: 1, laneOrder: 3 },
    F: { columnStart: 7, laneOrder: 2 },
  };
  assert.deepEqual(
    derivePageShellVisualOrder(Object.keys(sizes), sizes, placements),
    ["A", "B", "C", "D", "Library", "E", "F"],
  );
});

test("full-width shells are vertical region boundaries for semantic packing", () => {
  const order = ["active", "today", "week", "goals", "plans", "history"];
  const sizes = {
    active: { heightPx: 144, span: 12 as const },
    today: { heightPx: 240, span: 7 as const },
    week: { heightPx: 480, span: 5 as const },
    goals: { heightPx: 144, span: 12 as const },
    plans: { heightPx: 144, span: 12 as const },
    history: { heightPx: 144, span: 12 as const },
  };
  const placements = {
    today: { columnStart: 1, laneOrder: 0 },
    week: { columnStart: 8, laneOrder: 0 },
  };
  const packed = packPageShellLayout(order, sizes, { placements });
  assert.equal(packed.today.columnStart, 1);
  assert.equal(packed.week.columnStart, 8);
  assert.equal(packed.today.rowStart, packed.active.rowStart + packed.active.rowSpan);
  assert.equal(packed.week.rowStart, packed.today.rowStart);
  assert.ok(packed.goals.rowStart >= Math.max(packed.today.rowStart + packed.today.rowSpan, packed.week.rowStart + packed.week.rowSpan));
  assert.ok(packed.plans.rowStart >= packed.goals.rowStart + packed.goals.rowSpan);
  assert.ok(packed.history.rowStart >= packed.plans.rowStart + packed.plans.rowSpan);
});

test("Center Row is a persisted placement mode and a semantic row boundary, not a Column", () => {
  const order = ["left", "right", "center", "below-left", "below-right"];
  const sizes = Object.fromEntries(order.map((id) => [id, { heightPx: 144, span: 6 as const }]));
  const placements = {
    left: { columnStart: 1, laneOrder: 0 },
    right: { columnStart: 7, laneOrder: 0 },
    center: { columnStart: 7, laneOrder: 1, mode: "centered" as const },
    "below-left": { columnStart: 1, laneOrder: 1 },
    "below-right": { columnStart: 7, laneOrder: 2 },
  };
  const packed = packPageShellLayout(order, sizes, { placements });
  assert.equal(packed.center.columnStart, 4);
  assert.equal(packed.center.columnSpan, 6);
  assert.ok(packed.center.rowStart >= Math.max(
    packed.left.rowStart + packed.left.rowSpan,
    packed.right.rowStart + packed.right.rowSpan,
  ));
  assert.ok(packed["below-left"].rowStart >= packed.center.rowStart + packed.center.rowSpan);
  assert.ok(packed["below-right"].rowStart >= packed.center.rowStart + packed.center.rowSpan);
  assert.deepEqual(placements.center, { columnStart: 7, laneOrder: 1, mode: "centered" });
  assert.deepEqual(derivePageShellColumns(order, sizes, placements), [
    { columnStart: 1, label: "A", shellIds: ["left", "below-left"] },
    { columnStart: 7, label: "B", shellIds: ["right", "below-right"] },
  ]);
  assert.equal(getPageShellColumnSlot(order, sizes, placements, "center"), null);
  assert.deepEqual(derivePageShellVisualOrder(order, sizes, placements), order);
  assert.deepEqual(normalizePageShellLayout({ order, placements, sizes }, order, sizes).placements?.center, placements.center);
  const view = createPageShellView({
    createdAt: "2026-09-05T00:00:00.000Z",
    layout: { order, placements, sizes },
    name: "Centered workspace",
    pageKey: "test",
    presentation: "custom",
    target: "web",
    viewport: { height: 900, width: 1440 },
  });
  assert.deepEqual(resolvePageShellViewLayout(view, { order, sizes }).layout.placements?.center, placements.center);

  const centered = movePageShellToCenterRow({ order, placements: { ...placements, center: { columnStart: 7, laneOrder: 1 } }, sizes }, order, "center");
  assert.deepEqual(centered.placements?.center, placements.center);
  assert.deepEqual(movePageShellToColumn({ ...centered, sizes }, order, "center", 1).placements?.center, { columnStart: 1, laneOrder: 1 });
  assert.deepEqual(getPageShellColumnOptions(order, sizes, placements, "center").map((option) => option.label), ["Center row", "Column A", "Column B"]);
  assert.deepEqual(getPageShellRowOrder(order, sizes, placements, "center"), { row: 1, rowCount: 3 });
  const centeredDragged = placePageShellAtDrop({ order, placements, sizes }, order, "center", {
    columnStart: 1,
    insertionIndex: 1,
    laneOrder: 1,
    targetId: "left",
  });
  assert.equal(centeredDragged.placements?.center?.mode, "centered");
  assert.deepEqual(centeredDragged.placements, placements);
  const centeredMovedUp = movePageShellOneLane({ order, placements, sizes }, order, "center", "up");
  assert.equal(centeredMovedUp.order[0], "center");
  assert.deepEqual(centeredMovedUp.placements?.center, placements.center);
  assert.deepEqual(getPageShellRowOrder(centeredMovedUp.order, sizes, centeredMovedUp.placements ?? {}, "center"), { row: 0, rowCount: 2 });
  const centeredMovedDown = movePageShellOneLane({ ...centeredMovedUp, sizes }, centeredMovedUp.order, "center", "down");
  assert.equal(centeredMovedDown.order.at(-1), "center");
  assert.deepEqual(centeredMovedDown.placements?.center, placements.center);
  assert.equal(
    getPageShellDropTarget(
      [
        { bottom: 144, id: "left", left: 0, right: 590, top: 0 },
        { bottom: 308, id: "center", left: 300, right: 900, top: 164 },
      ],
      packed,
      order,
      "left",
      600,
      236,
      { left: 0, width: 1200 },
      0,
      placements,
    ).columnStart,
    7,
  );
});

test("odd-width Center Row shells receive the exact half-track centering offset", () => {
  const order = ["five", "seven"];
  const sizes = {
    five: { heightPx: 144, span: 5 as const },
    seven: { heightPx: 144, span: 7 as const },
  };
  const placements = {
    five: { columnStart: 1, laneOrder: 0, mode: "centered" as const },
    seven: { columnStart: 1, laneOrder: 1, mode: "centered" as const },
  };
  const packed = packPageShellLayout(order, sizes, { placements });
  assert.equal(packed.five.columnStart, 4);
  assert.equal(packed.seven.columnStart, 3);
  const layout: PageShellLayoutState = {
    ...staticShellLayout(true),
    canonicalLayout: { order, sizes },
    isCanonical: false,
    order,
    placements,
    sizes,
  };
  const markup = renderToStaticMarkup(createElement(
    ReorderablePageShells,
    { layout },
    createElement(PageShell, { id: "five", label: "Five Shell" }, createElement("span", null, "five")),
    createElement(PageShell, { id: "seven", label: "Seven Shell" }, createElement("span", null, "seven")),
  ));
  const fiveMarkup = markup.match(/data-page-shell-id="five"[\s\S]*?data-page-shell-id="seven"/)?.[0] ?? "";
  const sevenMarkup = markup.match(/data-page-shell-id="seven"[\s\S]*$/)?.[0] ?? "";
  assert.match(fiveMarkup, /--page-shell-grid-center-offset:calc\(\(100% \+ 1\.25rem\) \/ 10\)/);
  assert.match(sevenMarkup, /--page-shell-grid-center-offset:calc\(\(100% \+ 1\.25rem\) \/ 14\)/);
});

test("Column + Slot coordinates derive from semantic placement and reorder only one column", () => {
  const sizes = {
    a: { heightPx: 144, span: 3 as const },
    b: { heightPx: 144, span: 3 as const },
    c: { heightPx: 144, span: 3 as const },
    d: { heightPx: 144, span: 3 as const },
    e: { heightPx: 144, span: 3 as const },
    f: { heightPx: 144, span: 3 as const },
  };
  const placements = {
    a: { columnStart: 1, laneOrder: 0 },
    b: { columnStart: 1, laneOrder: 1 },
    c: { columnStart: 1, laneOrder: 2 },
    d: { columnStart: 5, laneOrder: 0 },
    e: { columnStart: 5, laneOrder: 1 },
    f: { columnStart: 9, laneOrder: 0 },
  };
  const order = Object.keys(sizes);
  const layout = { order, placements, sizes };
  assert.deepEqual(getPageShellColumnSlot(order, sizes, placements, "a"), { columnLabel: "A", columnStart: 1, slot: 1, slotCount: 3 });
  assert.deepEqual(getPageShellColumnSlot(order, sizes, placements, "c"), { columnLabel: "A", columnStart: 1, slot: 3, slotCount: 3 });
  assert.deepEqual(getPageShellColumnSlot(order, sizes, placements, "d"), { columnLabel: "B", columnStart: 5, slot: 1, slotCount: 2 });
  assert.deepEqual(getPageShellColumnSlot(order, sizes, placements, "f"), { columnLabel: "C", columnStart: 9, slot: 1, slotCount: 1 });

  const movedToTop = movePageShellToSlot(layout, order, "c", 1);
  assert.deepEqual(movedToTop.order, ["c", "a", "b", "d", "e", "f"]);
  assert.deepEqual(movedToTop.placements, {
    c: { columnStart: 1, laneOrder: 0 },
    a: { columnStart: 1, laneOrder: 1 },
    b: { columnStart: 1, laneOrder: 2 },
    d: { columnStart: 5, laneOrder: 0 },
    e: { columnStart: 5, laneOrder: 1 },
    f: { columnStart: 9, laneOrder: 0 },
  });
  assert.deepEqual(getPageShellColumnSlot(movedToTop.order, sizes, movedToTop.placements, "c"), { columnLabel: "A", columnStart: 1, slot: 1, slotCount: 3 });

  const movedToBottom = movePageShellToSlot({ ...movedToTop, sizes }, order, "c", 99);
  assert.deepEqual(movedToBottom.order, order);
  assert.deepEqual(movedToBottom.placements, placements);
  assert.deepEqual(movePageShellToSlot(layout, order, "a", 0).placements, placements);
  assert.deepEqual(movePageShellToSlot(layout, order, "a", Number.NaN).placements, placements);
  assert.deepEqual(derivePageShellVisualOrder(movedToTop.order, sizes, movedToTop.placements ?? {}), movedToTop.order);
});

test("Column changes preserve the approximate Slot, normalize both lanes, and support direct A to C moves", () => {
  const sizes = Object.fromEntries([
    ["a1", { heightPx: 144, span: 3 as const }],
    ["a2", { heightPx: 144, span: 3 as const }],
    ["a3", { heightPx: 144, span: 3 as const }],
    ["b1", { heightPx: 144, span: 3 as const }],
    ["b2", { heightPx: 144, span: 3 as const }],
    ["b3", { heightPx: 144, span: 3 as const }],
    ["b4", { heightPx: 144, span: 3 as const }],
    ["b5", { heightPx: 144, span: 3 as const }],
    ["c1", { heightPx: 144, span: 3 as const }],
  ]);
  const order = Object.keys(sizes);
  const placements = {
    a1: { columnStart: 1, laneOrder: 0 },
    a2: { columnStart: 1, laneOrder: 1 },
    a3: { columnStart: 1, laneOrder: 2 },
    b1: { columnStart: 5, laneOrder: 0 },
    b2: { columnStart: 5, laneOrder: 1 },
    b3: { columnStart: 5, laneOrder: 2 },
    b4: { columnStart: 5, laneOrder: 3 },
    b5: { columnStart: 5, laneOrder: 4 },
    c1: { columnStart: 9, laneOrder: 0 },
  };
  const movedToB = movePageShellToColumn({ order, placements, sizes }, order, "a2", 5);
  assert.deepEqual(movedToB.placements?.a1, { columnStart: 1, laneOrder: 0 });
  assert.deepEqual(movedToB.placements?.a3, { columnStart: 1, laneOrder: 1 });
  assert.deepEqual(movedToB.placements?.a2, { columnStart: 5, laneOrder: 1 });
  assert.deepEqual(movedToB.placements?.b1, { columnStart: 5, laneOrder: 0 });
  assert.deepEqual(movedToB.placements?.b2, { columnStart: 5, laneOrder: 2 });
  assert.deepEqual(movedToB.placements?.c1, placements.c1);
  assert.deepEqual(movedToB.order, ["a1", "a3", "b1", "a2", "b2", "b3", "b4", "b5", "c1"]);

  const shortDestination = movePageShellToColumn({
    order: ["a1", "a2", "a3", "b1", "c1"],
    placements: {
      a1: placements.a1,
      a2: placements.a2,
      a3: placements.a3,
      b1: placements.b1,
      c1: placements.c1,
    },
    sizes: { a1: sizes.a1, a2: sizes.a2, a3: sizes.a3, b1: sizes.b1, c1: sizes.c1 },
  }, ["a1", "a2", "a3", "b1", "c1"], "a3", 5);
  assert.deepEqual(shortDestination.placements?.a1, { columnStart: 1, laneOrder: 0 });
  assert.deepEqual(shortDestination.placements?.a2, { columnStart: 1, laneOrder: 1 });
  assert.deepEqual(shortDestination.placements?.b1, { columnStart: 5, laneOrder: 0 });
  assert.deepEqual(shortDestination.placements?.a3, { columnStart: 5, laneOrder: 1 });
  assert.deepEqual(shortDestination.placements?.c1, placements.c1);

  const directToC = movePageShellToColumn({
    order: ["a1", "b1", "c1"],
    placements: { a1: placements.a1, b1: placements.b1, c1: placements.c1 },
    sizes: { a1: sizes.a1, b1: sizes.b1, c1: sizes.c1 },
  }, ["a1", "b1", "c1"], "a1", 9);
  assert.deepEqual(directToC.placements?.a1, { columnStart: 9, laneOrder: 0 });
  assert.deepEqual(directToC.placements?.b1, placements.b1);
  assert.deepEqual(directToC.placements?.c1, { columnStart: 9, laneOrder: 1 });
  assert.deepEqual(directToC.order, ["b1", "a1", "c1"]);

  const relabeledAfterEmptyingA = movePageShellToColumn({
    order: ["a1", "b1", "c1"],
    placements: { a1: placements.a1, b1: placements.b1, c1: placements.c1 },
    sizes: { a1: sizes.a1, b1: sizes.b1, c1: sizes.c1 },
  }, ["a1", "b1", "c1"], "a1", 5);
  assert.deepEqual(getPageShellColumnSlot(relabeledAfterEmptyingA.order, sizes, relabeledAfterEmptyingA.placements ?? {}, "b1"), { columnLabel: "A", columnStart: 5, slot: 2, slotCount: 2 });
  assert.deepEqual(getPageShellColumnSlot(relabeledAfterEmptyingA.order, sizes, relabeledAfterEmptyingA.placements ?? {}, "c1"), { columnLabel: "B", columnStart: 9, slot: 1, slotCount: 1 });
});

test("semantic columns derive presentation labels from distinct column starts", () => {
  const sizes = {
    a: { heightPx: 144, span: 3 as const },
    b: { heightPx: 144, span: 3 as const },
    c: { heightPx: 144, span: 3 as const },
    d: { heightPx: 144, span: 3 as const },
  };
  const placements = {
    a: { columnStart: 1, laneOrder: 0 },
    b: { columnStart: 7, laneOrder: 0 },
    c: { columnStart: 7, laneOrder: 1 },
    d: { columnStart: 1, laneOrder: 1 },
  };
  assert.deepEqual(derivePageShellColumns(["a", "d", "b", "c"], sizes, placements), [
    { columnStart: 1, label: "A", shellIds: ["a", "d"] },
    { columnStart: 7, label: "B", shellIds: ["b", "c"] },
  ]);
  assert.equal(getPageShellColumnLabel(0), "A");
  assert.equal(getPageShellColumnLabel(25), "Z");
  assert.equal(getPageShellColumnLabel(26), "AA");
});

test("explicit column moves change only the selected shell column and preserve its lane", () => {
  const order = ["a", "d", "b", "c", "other"];
  const sizes = Object.fromEntries(order.map((id) => [id, { heightPx: 144, span: 3 as const }]));
  const placements = {
    a: { columnStart: 1, laneOrder: 0 },
    d: { columnStart: 1, laneOrder: 1 },
    b: { columnStart: 7, laneOrder: 0 },
    c: { columnStart: 7, laneOrder: 1 },
    other: { columnStart: 10, laneOrder: 0 },
  };
  const moved = movePageShellToColumn({ order, placements, sizes }, order, "d", 7);
  assert.deepEqual(moved.order, ["a", "b", "d", "c", "other"]);
  assert.deepEqual(moved.placements, {
    a: { columnStart: 1, laneOrder: 0 },
    d: { columnStart: 7, laneOrder: 1 },
    b: { columnStart: 7, laneOrder: 0 },
    c: { columnStart: 7, laneOrder: 2 },
    other: { columnStart: 10, laneOrder: 0 },
  });
  const movedBack = movePageShellToColumn({ ...moved, sizes }, order, "d", 1);
  assert.deepEqual(movedBack.order, order);
  assert.deepEqual(movedBack.placements, placements);
});

test("column moves are deterministic across repeated A to C and back selections", () => {
  const order = ["a", "b", "c"];
  const sizes = {
    a: { heightPx: 144, span: 3 as const },
    b: { heightPx: 144, span: 3 as const },
    c: { heightPx: 144, span: 3 as const },
  };
  const placements = {
    a: { columnStart: 1, laneOrder: 0 },
    b: { columnStart: 5, laneOrder: 0 },
    c: { columnStart: 9, laneOrder: 0 },
  };
  const layout = { order, placements, sizes };
  const once = movePageShellToColumn(layout, order, "a", 9);
  const twice = movePageShellToColumn({ ...once, sizes }, order, "a", 5);
  const thrice = movePageShellToColumn({ ...twice, sizes }, order, "a", 9);
  assert.deepEqual(twice.placements, {
    a: { columnStart: 5, laneOrder: 0 },
    b: { columnStart: 5, laneOrder: 1 },
    c: { columnStart: 9, laneOrder: 0 },
  });
  assert.deepEqual(thrice, once);
  assert.deepEqual(getPageShellColumnOptions(order, sizes, placements, "a").map((option) => option.label), ["Center row", "Column A", "Column B", "Column C"]);
});

test("new adjacent columns are offered only when the selected span fits, and full-width shells have none", () => {
  const sixSizes = { source: { heightPx: 144, span: 6 as const } };
  const sixPlacements = { source: { columnStart: 1, laneOrder: 0 } };
  assert.deepEqual(getPageShellColumnOptions(["source"], sixSizes, sixPlacements, "source").map((option) => option.label), ["Center row", "Column A", "New column right"]);
  const wideSizes = { source: { heightPx: 144, span: 8 as const } };
  const widePlacements = { source: { columnStart: 1, laneOrder: 0 } };
  assert.deepEqual(getPageShellColumnOptions(["source"], wideSizes, widePlacements, "source").map((option) => option.label), ["Center row", "Column A"]);
  const fullSizes = { source: { heightPx: 144, span: 12 as const } };
  const fullPlacements = { source: { columnStart: 1, laneOrder: 0 } };
  assert.deepEqual(getPageShellColumnOptions(["source"], fullSizes, fullPlacements, "source"), []);
  assert.deepEqual(movePageShellToColumn({ order: ["source"], placements: fullPlacements, sizes: fullSizes }, ["source"], "source", 7), {
    order: ["source"],
    placements: fullPlacements,
  });

  const newColumnLayout = {
    order: ["first", "second"],
    placements: {
      first: { columnStart: 1, laneOrder: 0 },
      second: { columnStart: 1, laneOrder: 1 },
    },
    sizes: {
      first: { heightPx: 144, span: 6 as const },
      second: { heightPx: 144, span: 6 as const },
    },
  };
  const movedToNewColumn = movePageShellToColumn(newColumnLayout, newColumnLayout.order, "second", 7);
  assert.deepEqual(movedToNewColumn.placements, {
    first: { columnStart: 1, laneOrder: 0 },
    second: { columnStart: 7, laneOrder: 0 },
  });
  assert.deepEqual(getPageShellColumnSlot(movedToNewColumn.order, newColumnLayout.sizes, movedToNewColumn.placements, "second"), { columnLabel: "B", columnStart: 7, slot: 1, slotCount: 1 });
});

test("up and down move only lane order inside the current semantic column", () => {
  const order = ["a", "b", "c"];
  const sizes = {
    a: { heightPx: 144, span: 6 as const },
    b: { heightPx: 144, span: 6 as const },
    c: { heightPx: 144, span: 6 as const },
  };
  const placements = {
    a: { columnStart: 1, laneOrder: 0 },
    b: { columnStart: 1, laneOrder: 1 },
    c: { columnStart: 7, laneOrder: 0 },
  };
  const movedUp = movePageShellOneLane({ order, placements, sizes }, order, "b", "up");
  assert.deepEqual(movedUp, movePageShellToSlot({ order, placements, sizes }, order, "b", 1));
  assert.deepEqual(movedUp.order, ["b", "a", "c"]);
  assert.deepEqual(movedUp.placements?.c, placements.c);
  const movedDown = movePageShellOneLane({ ...movedUp, sizes }, order, "b", "down");
  assert.deepEqual(movedDown, movePageShellToSlot({ ...movedUp, sizes }, order, "b", 2));
  assert.deepEqual(movedDown, { order, placements });
  assert.deepEqual(movePageShellOneLane({ order, placements, sizes }, order, "a", "up"), { order, placements });
  assert.deepEqual(movePageShellOneLane({ order, placements, sizes }, order, "b", "down"), { order, placements });
});

test("drop targeting agrees with rendered packed destination instead of replacing its preceding shell", () => {
  const order = ["water", "a", "b", "c"];
  const positions = packPageShellLayout(order, {
    water: { heightPx: 700, span: 6 },
    a: { heightPx: 144, span: 6 },
    b: { heightPx: 144, span: 6 },
    c: { heightPx: 144, span: 6 },
  }, {
    placements: {
      water: { columnStart: 1, laneOrder: 0 },
      a: { columnStart: 7, laneOrder: 0 },
      b: { columnStart: 7, laneOrder: 1 },
      c: { columnStart: 7, laneOrder: 2 },
    },
  });
  const geometries = [
    { bottom: 700, id: "water", left: 0, right: 480, top: 0 },
    { bottom: 144, id: "a", left: 500, right: 960, top: 0 },
    { bottom: 308, id: "b", left: 500, right: 960, top: 164 },
    { bottom: 472, id: "c", left: 500, right: 960, top: 328 },
  ];
  const target = getPageShellDropTarget(geometries, positions, order, "b", 720, 130);
  assert.deepEqual(target, { columnStart: 7, insertionIndex: 2, laneOrder: 1, targetId: "a" });
  const result = placePageShellAtDrop({
    order,
    placements: {
      water: { columnStart: 1, laneOrder: 0 },
      a: { columnStart: 7, laneOrder: 0 },
      b: { columnStart: 7, laneOrder: 1 },
      c: { columnStart: 7, laneOrder: 2 },
    },
    sizes: {
      water: { heightPx: 700, span: 6 },
      a: { heightPx: 144, span: 6 },
      b: { heightPx: 144, span: 6 },
      c: { heightPx: 144, span: 6 },
    },
  }, order, "b", target);
  assert.deepEqual(result.order, order);
  assert.deepEqual(result.placements?.b, { columnStart: 7, laneOrder: 1 });
});

test("drop targeting maps empty horizontal grid space to a new semantic column", () => {
  const order = ["source", "left"];
  const sizes = {
    source: { heightPx: 144, span: 3 as const },
    left: { heightPx: 144, span: 3 as const },
  };
  const placements = {
    source: { columnStart: 1, laneOrder: 0 },
    left: { columnStart: 4, laneOrder: 0 },
  };
  const positions = packPageShellLayout(order, sizes, { placements });
  const geometries = [
    { bottom: 144, id: "source", left: 0, right: 285, top: 0 },
    { bottom: 144, id: "left", left: 305, right: 590, top: 0 },
  ];
  const target = getPageShellDropTarget(geometries, positions, order, "source", 650, 72, { left: 0, width: 1200 });
  assert.deepEqual(target, { columnStart: 7, insertionIndex: 1, laneOrder: 0, targetId: null });
  const result = placePageShellAtDrop({ order, placements, sizes }, order, "source", target);
  assert.deepEqual(result.order, ["left", "source"]);
  assert.deepEqual(result.placements?.source, { columnStart: 7, laneOrder: 0 });
});

test("drop targeting preserves the horizontal grab offset", () => {
  const gridBounds = { left: 0, width: 1200 };
  const order = ["source"];
  const sizes = { source: { heightPx: 144, span: 3 as const } };
  const placements = { source: { columnStart: 1, laneOrder: 0 } };
  const positions = packPageShellLayout(order, sizes, { placements });
  const geometries = [{ bottom: 144, id: "source", left: 0, right: 285, top: 0 }];
  const initial = getPageShellDropTarget(geometries, positions, order, "source", 240, 72, gridBounds, 240);
  assert.equal(initial.columnStart, 1);

  const targetColumn = getPageShellGridColumnGeometry(gridBounds, 7, 3);
  assert.ok(targetColumn);
  const leftGrab = getPageShellDropTarget(geometries, positions, order, "source", targetColumn.left + 24, 72, gridBounds, 24);
  const rightGrab = getPageShellDropTarget(geometries, positions, order, "source", targetColumn.left + 261, 72, gridBounds, 261);
  assert.equal(leftGrab.columnStart, 7);
  assert.equal(rightGrab.columnStart, 7);

  const farRight = getPageShellDropTarget(geometries, positions, order, "source", 1600, 72, gridBounds, 0);
  assert.equal(farRight.columnStart, 10);
});

test("empty horizontal movement chooses adjacent legal semantic columns and clamps span", () => {
  const sixAtLeft = packPageShellLayout(["source"], { source: { heightPx: 144, span: 6 } }, {
    placements: { source: { columnStart: 1, laneOrder: 0 } },
  });
  assert.equal(getPageShellEmptyHorizontalColumnStart(sixAtLeft, "source", "right"), 7);
  assert.equal(getPageShellEmptyHorizontalColumnStart(sixAtLeft, "source", "left"), null);

  const sixAtRight = packPageShellLayout(["source"], { source: { heightPx: 144, span: 6 } }, {
    placements: { source: { columnStart: 7, laneOrder: 0 } },
  });
  assert.equal(getPageShellEmptyHorizontalColumnStart(sixAtRight, "source", "left"), 1);
  assert.equal(getPageShellEmptyHorizontalColumnStart(sixAtRight, "source", "right"), null);

  const sideBySide = packPageShellLayout(["source", "right"], {
    source: { heightPx: 144, span: 6 },
    right: { heightPx: 144, span: 6 },
  }, { placements: { source: { columnStart: 1, laneOrder: 0 }, right: { columnStart: 7, laneOrder: 0 } } });
  assert.equal(getPageShellEmptyHorizontalColumnStart(sideBySide, "source", "right"), null);
});

test("mixed shell spans retain explicit side-by-side and packed grid placements", () => {
  const sixSix = packPageShellLayout(["left", "right"], {
    left: { heightPx: 144, span: 6 },
    right: { heightPx: 144, span: 6 },
  }, { placements: { left: { columnStart: 1, laneOrder: 0 }, right: { columnStart: 7, laneOrder: 0 } } });
  assert.deepEqual(
    { left: sixSix.left.columnStart, right: sixSix.right.columnStart },
    { left: 1, right: 7 },
  );

  const eightFour = packPageShellLayout(["wide", "narrow"], {
    wide: { heightPx: 144, span: 8 },
    narrow: { heightPx: 144, span: 4 },
  }, { placements: { wide: { columnStart: 1, laneOrder: 0 }, narrow: { columnStart: 9, laneOrder: 0 } } });
  assert.deepEqual(
    { wide: eightFour.wide.columnStart, narrow: eightFour.narrow.columnStart },
    { wide: 1, narrow: 9 },
  );

  const threeThreeSix = packPageShellLayout(["first", "second", "third"], {
    first: { heightPx: 144, span: 3 },
    second: { heightPx: 144, span: 3 },
    third: { heightPx: 144, span: 6 },
  }, { placements: {
    first: { columnStart: 1, laneOrder: 0 },
    second: { columnStart: 4, laneOrder: 0 },
    third: { columnStart: 7, laneOrder: 0 },
  } });
  assert.deepEqual(
    Object.fromEntries(Object.entries(threeThreeSix).map(([id, position]) => [id, position.columnStart])),
    { first: 1, second: 4, third: 7 },
  );
});

test("legacy layouts and saved Views without placement metadata derive deterministic portable placement", () => {
  const store = storage();
  const key = getPageShellLayoutStorageKey("legacy-placement");
  const viewKey = getPageShellViewsStorageKey("legacy-placement");
  const legacy = { order: ["left", "right"], sizes: { left: { heightPx: 600, span: 6 as const }, right: { heightPx: 144, span: 6 as const } } };
  writePageShellLayout(store, key, "health:water", legacy);
  const loaded = readPageShellLayout(store, key, "health:water", legacy.order, legacy.sizes);
  assert.deepEqual(loaded.placements, {
    left: { columnStart: 1, laneOrder: 0 },
    right: { columnStart: 7, laneOrder: 0 },
  });
  writePageShellView(store, viewKey, createPageShellView({
    createdAt: "2026-09-04T12:00:00.000Z",
    layout: legacy,
    name: "Legacy Water",
    pageKey: "health:water",
    presentation: "custom",
    target: "web",
    viewport: { height: 900, width: 1440 },
  }));
  const saved = readPageShellViews(store, viewKey, "health:water")[0];
  assert.deepEqual(saved?.layout?.placements, loaded.placements);
  assert.deepEqual(normalizePageShellPlacement({ columnStart: 99, laneOrder: -3 }, 6), { columnStart: 7, laneOrder: 0 });
});

test("directional movement resolves neighbors from packed geometry into the shared order", () => {
  const geometries = [
    { bottom: 700, id: "tall", left: 0, right: 480, top: 0 },
    { bottom: 144, id: "small-a", left: 500, right: 960, top: 0 },
    { bottom: 288, id: "small-b", left: 500, right: 960, top: 164 },
    { bottom: 432, id: "small-c", left: 500, right: 960, top: 308 },
  ];
  assert.equal(getPageShellDirectionalInsertionIndex(geometries, ["tall", "small-a", "small-b", "small-c"], "small-c", "up"), 2);
  assert.equal(getPageShellDirectionalInsertionIndex(geometries, ["tall", "small-a", "small-b", "small-c"], "small-c", "left"), 0);
  assert.equal(getPageShellDirectionalInsertionIndex(geometries, ["tall", "small-a", "small-b", "small-c"], "small-c", "right"), null);
});

test("width-only editing keeps height out of the width preview path and uses shared persistence", () => {
  const widthBranchStart = shellSource.indexOf('if (interaction.kind === "width-resize")');
  const heightBranchStart = shellSource.indexOf("const heightPx", widthBranchStart);
  assert.ok(widthBranchStart >= 0);
  assert.ok(heightBranchStart > widthBranchStart);
  assert.doesNotMatch(shellSource.slice(widthBranchStart, heightBranchStart), /heightPx:/);
  assert.match(shellSource, /normalizePageShellSpan\(numericValue, currentSize\.span\)/);
  assert.match(shellSource, /packedPositions[\s\S]*layout\.sizes/);
  assert.match(shellSource, /data-page-shell-rendered-width/);
  assert.match(shellSource, /formatPageShellDimensions\(size\.span, size\.heightPx, naturalHeight, renderedWidths/);
  assert.match(shellSource, /layout\.setPreviewSizes/);
  assert.match(shellSource, /layout\.commitPreview\(\)/);
  assert.match(shellSource, /function beginWidthResize[\s\S]*layout\.beginPreview\(startLayout\)/);
  assert.match(shellSource, /kind: "width-resize"/);
  assert.equal(normalizePageShellSpan(6 + 1), 7);
  assert.match(shellSource, /onLostPointerCapture=\{\(event\) => endInteraction\(event, true\)\}/);
  assert.doesNotMatch(shellSource, /PageShellPackedPosition.*PageShellSize/);
});

test("Test D20 legacy layout and Views migrate to the nested namespace without overwriting valid data", () => {
  const store = storage();
  const layoutKey = getPageShellLayoutStorageKey("test-migration");
  const viewsKey = getPageShellViewsStorageKey("test-migration");
  const legacyLayout = {
    order: ["test-d20-controls", "test-d20-sandbox"],
    sizes: {
      "test-d20-controls": { heightPx: 384, span: 5 },
      "test-d20-sandbox": { heightPx: 432, span: 7 },
    },
  };
  assert.equal(isLegacyTestD20LayoutPreference(legacyLayout), true);
  writePageShellLayout(store, layoutKey, "test", legacyLayout);
  writePageShellView(store, viewsKey, createPageShellView({
    createdAt: "2026-09-04T10:00:00.000Z",
    layout: legacyLayout,
    name: "D20 Workbench",
    pageKey: "test",
    presentation: "custom",
    target: "web",
    viewport: { height: 900, width: 1440 },
  }));
  const existing = createPageShellView({
    createdAt: "2026-09-04T11:00:00.000Z",
    layout: { order: [...TEST_D20_PAGE_SHELL_IDS], sizes: TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.sizes },
    name: "Existing D20",
    pageKey: "test:d20",
    presentation: "custom",
    target: "iphone",
    viewport: { height: 844, width: 390 },
  });
  writePageShellView(store, viewsKey, existing);

  const result = migrateLegacyTestD20Storage(store, layoutKey, viewsKey);
  assert.deepEqual(result, { layoutMigrated: true, viewsMigrated: true });
  assert.equal(hasPageShellLayout(store, layoutKey, "test"), false);
  assert.deepEqual(readPageShellLayout(store, layoutKey, "test:d20", TEST_D20_PAGE_SHELL_IDS, TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.sizes).order, ["test-d20-controls", "test-d20-sandbox"]);
  assert.equal(readPageShellViews(store, viewsKey, "test").length, 0);
  assert.equal(readPageShellViews(store, viewsKey, "test:d20").length, 2);
  assert.deepEqual(readPageShellLayout(store, layoutKey, "test", TEST_PAGE_SHELL_IDS, TEST_PAGE_SHELL_CANONICAL_LAYOUT.sizes).order, [...TEST_PAGE_SHELL_IDS]);
  const rerun = migrateLegacyTestD20Storage(store, layoutKey, viewsKey);
  assert.deepEqual(rerun, { layoutMigrated: false, viewsMigrated: false });
});

test("Home, Settings, Notes, and Test register their intended semantic shells", () => {
  assert.deepEqual([...HOME_PAGE_SHELL_IDS], ["home-todo"]);
  assert.deepEqual([...SETTINGS_PAGE_SHELL_IDS], ["settings-appearance", "settings-day-reset", "settings-economy", "settings-import-export"]);
  assert.deepEqual([...NOTES_PAGE_SHELL_IDS], ["notes-scratch-paper", "notes-library"]);
  assert.deepEqual([...TEST_PAGE_SHELL_IDS], ["test-task-table", "test-d20", "test-dice-face", "test-dice-material", "test-task-table-prototype", "test-bucket-tray", "test-rule-builder"]);
  assert.deepEqual([...TEST_D20_PAGE_SHELL_IDS], ["test-d20-sandbox", "test-d20-controls"]);
  assert.equal(HOME_PAGE_SHELL_IDS.length >= 1, true);
  assert.equal(HOME_PAGE_SHELL_IDS.length >= 2, false);
  assert.equal(SETTINGS_PAGE_SHELL_IDS.length >= 2, true);
  assert.equal(NOTES_PAGE_SHELL_IDS.length >= 2, true);
  assert.equal(TEST_PAGE_SHELL_IDS.length >= 2, true);
  assert.match(homeSource, /usePageShellLayout\(userId, "home", HOME_PAGE_SHELL_IDS/);
  assert.match(homeSource, /<PageShell id="home-todo" label="Home To-do List">/);
  assert.match(homeSource, /<PageShellHeader actions=\{<PageShellLayoutControls layout=\{layout\} \/>\}/);
  assert.doesNotMatch(homeSource, /GripVertical|Move Home To-do List/);
  assert.match(settingsPageSource, /usePageShellLayout\(userId \?\? null, "settings", SETTINGS_PAGE_SHELL_IDS/);
  for (const [id, section] of [
    ["settings-appearance", "appearance"],
    ["settings-day-reset", "day-reset"],
    ["settings-economy", "economy"],
    ["settings-import-export", "import-export"],
  ] as const) {
    assert.match(settingsPageSource, new RegExp(`<PageShell id="${id}"`));
    assert.match(settingsPageSource, new RegExp(`data-settings-section="${section}" id="settings-section-${section}"`));
  }
  assert.match(notesSource, /usePageShellLayout\(currentUser\.id, "notes", NOTES_PAGE_SHELL_IDS/);
  assert.equal((notesSource.match(/<PageShell id="notes-/g) ?? []).length, 2);
  assert.match(taskAppSource, /usePageShellLayout\(userId, "test", TEST_PAGE_SHELL_IDS/);
  for (const id of TEST_PAGE_SHELL_IDS) assert.match(taskAppSource, new RegExp(`<PageShell id="${id}"`));
  assert.match(testD20Source, /usePageShellLayout\(userId, "test:d20", TEST_D20_PAGE_SHELL_IDS/);
  assert.match(testD20Source, /<PageShell id="test-d20-sandbox" label="D20 Sandbox">/);
  assert.match(testD20Source, /<PageShell id="test-d20-controls" label="Face Mapping Controls">/);
});

test("new page shells preserve editor boundaries, canonical placement, and shared surface bodies", () => {
  const editorBranch = notesSource.slice(notesSource.indexOf("if (editing)"), notesSource.indexOf("return (\n    <section"));
  assert.doesNotMatch(editorBranch, /PageShell/);
  assert.match(notesSource, /<PageShell id="notes-scratch-paper"[\s\S]*<ScratchPaperPageSection/);
  assert.match(notesSource, /<PageShell id="notes-library"[\s\S]*Quick capture/);
  assert.match(testD20Source, /<ReorderablePageShells layout=\{layout\} shellsClassName="mt-6 grid gap-5 xl:grid-cols-12">/);
  const sandboxShell = testD20Source.slice(testD20Source.indexOf('<PageShell id="test-d20-sandbox"'), testD20Source.indexOf("</PageShell>", testD20Source.indexOf('<PageShell id="test-d20-sandbox"')));
  const controlsShell = testD20Source.slice(testD20Source.indexOf('<PageShell id="test-d20-controls"'), testD20Source.indexOf("</PageShell>", testD20Source.indexOf('<PageShell id="test-d20-controls"')));
  assert.match(sandboxShell, /PageShellSurface[\s\S]*PageShellBody[\s\S]*D20CalibrationCanvas/);
  assert.match(controlsShell, /PageShellSurface[\s\S]*PageShellBody[\s\S]*Face \{face\}[\s\S]*Export Mapping/);
  for (const source of [homeSource, settingsPageSource, notesSource, testD20Source]) {
    assert.match(source, /PageShellSurface/);
    assert.match(source, /PageShellBody/);
  }
  assert.equal(TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.gridClassName, "xl:grid-cols-[minmax(0,0.56fr)_minmax(20rem,0.44fr)]");
  assert.equal(TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.sizes["test-d20-sandbox"].span, 7);
  assert.equal(TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.sizes["test-d20-controls"].span, 5);
  assert.deepEqual(TEST_PAGE_SHELL_CANONICAL_LAYOUT.order, [...TEST_PAGE_SHELL_IDS]);
  assert.deepEqual(TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.order, [...TEST_D20_PAGE_SHELL_IDS]);
  assert.match(layoutHookSource, /const canEdit = defaults\.length >= 1/);
  assert.match(layoutHookSource, /const canResize = defaults\.length >= 1/);
  assert.match(layoutHookSource, /const canReorder = defaults\.length >= 2/);
  assert.match(layoutHookSource, /isLayoutReady: hydratedInstanceKey === instanceKey/);
});

test("Settings Navigator resolves semantic sections to outer shells and resets inner body scroll", () => {
  assert.match(settingsPageSource, /const shellIdBySection: Record<NavigatorSettingsSection, string>/);
  for (const [section, shellId] of [
    ["appearance", "settings-appearance"],
    ["day-reset", "settings-day-reset"],
    ["economy", "settings-economy"],
    ["import-export", "settings-import-export"],
  ] as const) {
    const sourceKey = section.includes("-") ? `"${section}"` : section;
    assert.match(settingsPageSource, new RegExp(`${sourceKey}: "${shellId}"`));
  }
  assert.match(settingsPageSource, /document\.querySelector<HTMLElement>\(\`\[data-page-shell-id=/);
  assert.match(settingsPageSource, /body\.scrollTop = 0/);
  assert.match(settingsPageSource, /shell\.scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(settingsPageSource, /!layout\.isLayoutReady/);
  assert.match(settingsPageSource, /requestAnimationFrame/);
  assert.ok(settingsPageSource.indexOf("shell.scrollIntoView") < settingsPageSource.indexOf("onSectionRequestHandled?."));
  assert.doesNotMatch(settingsPageSource, /settings-section-[^"`]+.*scrollIntoView/);
  assert.match(homeSource, /layout\.isCanonical \? "max-w-4xl" : "max-w-none"/);
  assert.match(settingsPageSource, /layout\.isCanonical \? "max-w-lg" : "max-w-none"/);
});

test("new page canonical resets preserve pre-shell order and natural heights", () => {
  for (const canonical of [
    HOME_PAGE_SHELL_CANONICAL_LAYOUT,
    SETTINGS_PAGE_SHELL_CANONICAL_LAYOUT,
    NOTES_PAGE_SHELL_CANONICAL_LAYOUT,
    TEST_PAGE_SHELL_CANONICAL_LAYOUT,
    TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT,
  ]) {
    const reset = normalizePageShellLayout(null, canonical.order, canonical.sizes);
    assert.deepEqual(reset.order, [...canonical.order]);
    assert.deepEqual(reset.sizes, canonical.sizes);
  }
  assert.equal(HOME_PAGE_SHELL_CANONICAL_LAYOUT.sizes["home-todo"].heightPx, null);
  assert.equal(SETTINGS_PAGE_SHELL_CANONICAL_LAYOUT.sizes["settings-appearance"].heightPx, null);
  assert.equal(NOTES_PAGE_SHELL_CANONICAL_LAYOUT.sizes["notes-scratch-paper"].heightPx, null);
  assert.equal(TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.sizes["test-d20-sandbox"].heightPx, null);
});

test("page-level layout controls are header actions and render for every valid shell layout", () => {
  assert.match(headerSource, /actions\?: ReactNode/);
  assert.match(shellSource, /aria-label="Edit page layout"/);
  assert.match(shellSource, /title="Edit layout"/);
  assert.match(shellSource, /layout\.canEdit/);
  assert.match(shellSource, /layout\.canReorder/);
  assert.match(shellSource, /layout\.canResize/);
  assert.match(shellSource, /Reset Layout/);
  assert.match(shellSource, /Done/);
  assert.match(statsSource, /PageShellHeader actions=\{<PageShellLayoutControls layout=\{layout\} \/>\}/);
  assert.match(healthSource, /PageShellHeader actions=\{<PageShellLayoutControls layout=\{pageShellLayout\} \/>\}/);
  assert.match(focusSource, /PageShellHeader actions=\{<PageShellLayoutControls layout=\{layout\} \/>\}/);
  assert.match(homeSource, /PageShellHeader actions=\{<PageShellLayoutControls layout=\{layout\} \/>\}/);
  assert.match(settingsPageSource, /PageShellHeader actions=\{<PageShellLayoutControls layout=\{layout\} \/>\}/);
  assert.match(notesSource, /PageShellHeader actions=\{<PageShellLayoutControls layout=\{layout\} \/>\}/);
  assert.match(testD20Source, /PageShellLayoutControls layout=\{layout\}/);
  assert.match(taskAppSource, /PageShellLayoutControls layout=\{layout\}/);
  assert.equal(HEALTH_PAGE_SHELL_IDS.Awards.length, 1);
  assert.equal(HEALTH_PAGE_SHELL_IDS.Settings.length, 1);
  assert.match(healthSource, /HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS/);
  assert.match(focusSource, /FOCUS_PAGE_SHELL_CANONICAL_LAYOUT/);
  assert.match(statsSource, /STATS_PAGE_SHELL_CANONICAL_LAYOUT/);
});

test("Health tabs use independent semantic shell IDs and preserve grouped internals", () => {
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Today], ["today-snapshot", "today-quick-log", "today-timeline"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Food], ["food-meal-log", "food-daily-totals", "food-favorites-recent", "food-library"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Water], ["water-log", "water-pending", "water-today", "water-history"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Fitness], ["fitness-active-workout", "fitness-today", "fitness-week", "fitness-goals", "fitness-plans", "fitness-workout-history"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Journal], ["journal-entry-history", "journal-library", "journal-feeling-trends"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Weight], ["weight-entry", "weight-trend"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Sleep], ["sleep-ledger", "sleep-log", "sleep-sources", "sleep-focus-ledger"]);
  assert.deepEqual([...HEALTH_PAGE_SHELL_IDS.Insights], ["insights-import", "insights-trends"]);
  assert.equal(getHealthPageShellKey("Fitness"), "health:fitness");
  assert.equal(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Fitness.sizes["fitness-today"].span, 7);
  assert.equal(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Fitness.sizes["fitness-week"].span, 5);
  assert.equal(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Fitness.sizes["fitness-goals"].span, 12);
  assert.match(healthSource, /HEALTH_PAGE_SHELL_IDS\[activeTab\]/);
  assert.match(healthSource, /layout=\{pageShellLayout\}/);
  assert.match(todaySource, /<PageShell id="today-snapshot"/);
  assert.match(todaySource, /<PageShell id="today-quick-log"/);
  assert.match(todaySource, /<PageShell id="today-timeline"/);
  assert.match(waterSource, /<PageShell id="water-log"/);
  assert.match(waterSource, /<PageShell hiddenDescription="Hidden until pending water exists" id="water-pending" label="Pending Water" visible=\{pendingEntries\.length > 0\}>/);
  assert.match(waterSource, /<PageShell id="water-today" label="Today's Water">/);
  assert.match(waterSource, /<PageShell id="water-history"/);
});

test("Journal spacing belongs to the reorder grid while its shell surfaces stay margin-free", () => {
  const journal = healthSource.slice(healthSource.indexOf('activeTab === "Journal"'), healthSource.indexOf('activeTab === "Food"'));
  assert.match(journal, /<ReorderablePageShells layout=\{pageShellLayout\} shellsClassName="mt-6 grid min-w-0 gap-5 xl:grid-cols-12"/);
  assert.doesNotMatch(journal, /className="mt-6 min-w-0"/);
  assert.doesNotMatch(journal, /className="mt-5 min-w-0"/);
  assert.match(journal, /<PageShell id="journal-library"/);
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
  const historyShell = fitnessSource.slice(fitnessSource.indexOf('<PageShell id="fitness-workout-history"'), fitnessSource.indexOf("</PageShell>", fitnessSource.indexOf('<PageShell id="fitness-workout-history"')));
  assert.match(historyShell, /shellSurface/);
  assert.match(activeWorkoutSource, /page-shell-surface flex h-full min-h-0 min-w-0 flex-col overflow-hidden/);
  assert.match(activeWorkoutSource, /<PageShellBody className="grid gap-4 pt-4">/);
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
  assert.match(shellSource, /getPageShellDropTarget/);
  assert.match(shellSource, /placePageShellAtDrop/);
  assert.doesNotMatch(shellSource, /movePageShellToVisualPosition/);
  assert.match(shellSource, /getPageShellColumnOptions/);
  assert.match(shellSource, /movePageShellToColumn/);
  assert.match(shellSource, /movePageShellToSlot/);
  assert.match(shellSource, /movePageShellOneLane/);
  assert.match(shellSource, /startVisibleOrder/);
  assert.match(shellSource, /currentVisibleOrder/);
  assert.match(shellSource, /currentGeometries/);
  assert.match(shellSource, /currentPackedPositions/);
  assert.match(shellSource, /captureCurrentMoveFrame/);
  assert.match(shellSource, /scheduleMovePreview/);
  assert.match(shellSource, /cancelMovePreview/);
  assert.match(shellSource, /placePageShellAtDrop\(interaction\.startLayout/);
  assert.doesNotMatch(shellSource, /getPageShellDropTarget\(\s*interaction\.geometries/);
  assert.doesNotMatch(shellSource, /mergeVisiblePageShellOrder/);
  assert.match(shellSource, /data-page-shell-insertion-indicator/);
  assert.match(shellSource, /interaction\.target/);
  assert.match(shellSource, /renderedShellOrder/);
  assert.match(shellSource, /rect\.top \+ scrollTop/);
  assert.match(shellSource, /pointerY \+ getPageScrollTop\(\)/);
  assert.match(shellSource, /requestAnimationFrame\(runDragAutoScroll\)/);
  assert.match(shellSource, /cancelDragAutoScroll/);
  assert.match(shellSource, /window\.scrollTo\(\{ behavior: "auto", top: nextScrollTop \}\)/);
  const resizeBeginSource = shellSource.slice(shellSource.indexOf("function beginResize"), shellSource.indexOf("function beginWidthResize"));
  const resizeUpdateSource = shellSource.slice(shellSource.indexOf("const heightPx = clampPageShellHeight"), shellSource.indexOf("function endInteraction"));
  assert.match(resizeBeginSource, /const initialHeight = clampPageShellHeight\(initialSize\.heightPx \?\? naturalHeight, naturalHeight\) \?\? naturalHeight/);
  assert.match(resizeBeginSource, /heightPx: initialSize\.heightPx/);
  assert.doesNotMatch(resizeBeginSource, /naturalHeight < PAGE_SHELL_MIN_HEIGHT/);
  assert.match(resizeUpdateSource, /const heightPx = clampPageShellHeight\(interaction\.initialHeight/);
  assert.doesNotMatch(resizeUpdateSource, /naturalHeight < PAGE_SHELL_MIN_HEIGHT/);
  const moveUpdateSource = shellSource.slice(shellSource.indexOf('if (interaction.kind === "move")'), shellSource.indexOf("const deltaColumns"));
  assert.match(moveUpdateSource, /scheduleMovePreview/);
  assert.match(shellSource, /function updateMovePreview[\s\S]*layout\.setPreviewOrder/);
  assert.doesNotMatch(moveUpdateSource, /setDraggingId/);
  assert.match(shellSource, /if \(cancelled\) layout\.cancelPreview\(\);\s+else layout\.commitPreview\(\);/);
  assert.match(shellSource, /aria-label=\{`Resize \$\{shell\.label\}`\}/);
  assert.match(shellSource, /aria-label=\{`Resize \$\{shell\.label\} width`\}/);
  assert.match(shellSource, /MoveHorizontal/);
  assert.match(shellSource, /Set \$\{shell\.label\} width in columns/);
  assert.match(shellSource, /Set \$\{shell\.label\} slot/);
  assert.match(shellSource, /slotDrafts/);
  assert.doesNotMatch(shellSource, /positionDrafts|handlePositionCommit|commitShellPosition/);
  assert.match(shellSource, /moveShellLane\(event, shell\.id, "up"\)/);
  assert.match(shellSource, /moveShellLane\(event, shell\.id, "down"\)/);
  const laneControlSource = shellSource.slice(shellSource.indexOf("function moveShellLane"), shellSource.indexOf("function updateInteraction"));
  assert.doesNotMatch(laneControlSource, /captureShellGeometry|packedPositions|Geometry/);
  assert.doesNotMatch(shellSource, /Move \$\{shell\.label\} left/);
  assert.doesNotMatch(shellSource, /Move \$\{shell\.label\} right/);
  assert.doesNotMatch(shellSource, /getPageShellDirectionalInsertionIndex/);
  assert.doesNotMatch(shellSource, /getPageShellEmptyHorizontalColumnStart/);
  assert.match(shellSource, /aria-haspopup="listbox"/);
  assert.match(shellSource, /Full/);
  assert.match(shellSource, /packPageShellLayout/);
  assert.match(shellSource, /data-page-shell-packed/);
  assert.match(shellSource, /measureNaturalShellHeight/);
  assert.match(shellSource, /data-page-shell-height=\{size\.heightPx \?\? "natural"\}/);
  assert.match(shellSource, /export function PageShellSurface/);
  assert.match(shellSource, /export function PageShellBody/);
  assert.match(shellSource, /page-shell-custom-height/);
  assert.doesNotMatch(shellSource, /page-shell-custom-height[^\"]*overflow-y-auto/);
  assert.doesNotMatch(shellSource, /data-page-shell-min-height/);
  assert.doesNotMatch(shellSource, /minHeight: \$\{/);
  assert.match(globalSource, /\.page-shell-surface[\s\S]*container-type: inline-size/);
  assert.match(globalSource, /\.page-shell-body[\s\S]*overflow-y: auto/);
  assert.match(globalSource, /\.page-shell-chart-header/);
  assert.match(globalSource, /\.fitness-stat-progress[\s\S]*max-width: 100%/);
  assert.doesNotMatch(globalSource, /\.page-shell-custom-height:not\(:has/);
  assert.match(globalSource, /@container page-shell \(min-width: 36rem\)/);
  assert.match(globalSource, /@container page-shell \(min-width: 64rem\)/);
  assert.match(globalSource, /@container page-shell \(max-width: 24rem\)/);
  assert.match(globalSource, /@container page-shell/);
  assert.doesNotMatch(globalSource, /\.page-shell-custom-height[\s\S]*height: auto !important/);
  assert.match(shellSource, /setShellToShrinkHeight/);
  assert.match(shellSource, /setShellToNaturalHeight/);
  assert.match(shellSource, /naturalHeight < PAGE_SHELL_MIN_HEIGHT \? null : getPageShellShrinkHeight/);
  assert.match(shellSource, /function setShellToNaturalHeight[\s\S]*setShellHeight\(event, id, null\)/);
  assert.match(shellSource, /aria-label=\{`Shrink \$\{shell\.label\}`\}/);
  assert.match(shellSource, /aria-label=\{`Expand \$\{shell\.label\}`\}/);
  assert.match(shellSource, /formatPageShellDimensions\(size\.span, size\.heightPx, naturalHeight, renderedWidths\[shell\.id\]\)/);
  assert.match(shellSource, /page-shell-number-input/);
  assert.match(shellSource, /Save View/);
  assert.match(shellSource, /Views/);
  assert.match(shellSource, /Export Layouts/);
  assert.match(shellSource, /useNativeIosPlatform/);
  assert.match(shellSource, /setViewTarget\(isNativeIosPlatform \? "iphone" : "web"\)/);
  assert.match(shellSource, /layout\.applyView/);
  assert.match(shellSource, /layout\.deleteView/);
  assert.match(shellSource, /layout\.exportLayouts/);
  assert.match(shellSource, /xl:col-span-6/);
  assert.match(shellSource, /xl:col-span-3/);
  assert.match(shellSource, /xl:col-span-4/);
  assert.match(shellSource, /xl:col-span-5/);
  assert.match(shellSource, /xl:col-span-12/);
  assert.equal((shellSource.match(/<GripVertical/g) ?? []).length, 1);
  assert.doesNotMatch(shellSource, /localStorage/);
  assert.match(layoutHookSource, /const \[committedLayout/);
  assert.match(layoutHookSource, /const \[previewLayout/);
  assert.match(layoutHookSource, /writePageShellLayout/);
  assert.match(layoutHookSource, /commitPreview/);
  assert.match(layoutHookSource, /cancelPreview/);
  assert.match(layoutHookSource, /getPageShellViewsStorageKey/);
  assert.match(layoutHookSource, /registerPageShellPage/);
  assert.match(layoutHookSource, /resolvePageShellViewLayout/);
  assert.doesNotMatch(layoutHookSource, /setPreviewOrder[\s\S]{0,500}writePageShellLayout/);
});

test("remaining Focus shells use the shared surface/body contract", () => {
  assert.match(focusSource, /<PageShell id="focus-timer-workspace"[\s\S]*<PageShellSurface>[\s\S]*<PageShellBody/);
  assert.match(focusGoalsSource, /<PageShellSurface[\s\S]*<PageShellBody/);
  assert.doesNotMatch(focusGoalsSource, /<section className="mx-auto mt-5/);
  assert.match(focusCountersSource, /<PageShellSurface[\s\S]*<PageShellBody/);
  assert.doesNotMatch(focusCountersSource, /<section className="mx-auto mt-6/);
});

test("Stats remains a multi-shell page with stable responsive shell layout", () => {
  assert.deepEqual([...STATS_PAGE_SHELL_IDS], ["stats-overview", "stats-economy", "stats-productivity", "stats-achievements", "stats-energy"]);
  assert.match(statsSource, /<ReorderablePageShells layout=\{layout\} shellsClassName="grid min-w-0 gap-5">/);
  assert.equal((statsSource.match(/<PageShellSurface/g) ?? []).length, 5);
  assert.equal((statsSource.match(/<PageShellBody/g) ?? []).length, 5);
  for (const id of STATS_PAGE_SHELL_IDS) assert.match(statsSource, new RegExp(`id="${id}"`));
});

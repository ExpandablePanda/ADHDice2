import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FOCUS_PAGE_SHELL_CANONICAL_LAYOUT,
  HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS,
  HOME_PAGE_SHELL_CANONICAL_LAYOUT,
  NOTES_PAGE_SHELL_CANONICAL_LAYOUT,
  SETTINGS_PAGE_SHELL_CANONICAL_LAYOUT,
  STATS_PAGE_SHELL_CANONICAL_LAYOUT,
  TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT,
  TEST_PAGE_SHELL_CANONICAL_LAYOUT,
  PAGE_SHELL_CENTER_SNAP_HYSTERESIS_PX,
  PAGE_SHELL_CENTER_SNAP_ZONE_PX,
  PAGE_SHELL_DRAG_AXIS_LOCK_PX,
  PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX,
  PAGE_SHELL_DRAG_AUTO_SCROLL_MAX_PX,
  PAGE_SHELL_DROP_ZONE_HYSTERESIS_PX,
  PAGE_SHELL_EXPORT_SCHEMA,
  PAGE_SHELL_EXPORT_SCHEMA_VERSION,
  PAGE_SHELL_HEIGHT_SNAP,
  PAGE_SHELL_MAX_HEIGHT,
  PAGE_SHELL_MIN_HEIGHT,
  PAGE_SHELL_PACKING_GAP_PX,
  PAGE_SHELL_PACKING_ROW_UNIT_PX,
  PAGE_SHELL_SPAN_OPTIONS,
  PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX,
  PAGE_SHELL_MAX_VERTICAL_OFFSET_STEPS,
  PAGE_SHELL_VIEWS_SCHEMA_VERSION,
  buildPageShellLayoutExport,
  clampPageShellHeight,
  clonePageShellLayout,
  compactPageShellRows,
  createPageShellView,
  formatPageShellDimensions,
  getHealthPageShellKey,
  getPageShellDirectionalMoveTarget,
  getPageShellDragAutoScrollDelta,
  getPageShellDropTarget,
  getPageShellExplicitRows,
  getPageShellExplicitRowMajorOrder,
  getPageShellGridColumnGeometry,
  getPageShellGridStartFromPointer,
  getPageShellPlacementRowOffsetSteps,
  getPageShellInsertionIndex,
  getPageShellStructuralRowInsertionIndex,
  getPageShellLayoutStorageKey,
  getPageShellStructuralRowIds,
  getPageShellStructuralRowStart,
  getPageShellViewsStorageKey,
  getPageShellShrinkHeight,
  getPageShellVerticalOffsetSteps,
  getPageShellCanonicalLayoutValidationErrors,
  getRegisteredPageShellPages,
  hasCompletePageShellRows,
  hasPageShellLayout,
  isPageShellCenteredPlacement,
  normalizePageShellLayout,
  normalizePageShellPlacement,
  normalizePageShellRowIndex,
  normalizePageShellRowOffsetSteps,
  normalizePageShellSize,
  packPageShellLayout,
  planPageShellMove,
  placePageShellAtDrop,
  readPageShellLayout,
  readPageShellViews,
  resolvePageShellDropRelationship,
  resolvePageShellDragAxisIntent,
  resolvePageShellViewLayout,
  snapPageShellHeight,
  writePageShellLayout,
  writePageShellView,
  inferPageShellRowsFromPackedLayout,
  isLegacyPageShellLayout,
} from "@/lib/page-shell-layout";
import {
  isPageShellPointerMatch,
  isStalePageShellMouseMove,
  PageShellBody,
  PageShell,
  PageShellLayoutControls,
  ReorderablePageShells,
  PageShellSurface,
} from "@/components/ui-system/reorderable-page-shells";
import type {
  PageShellCanonicalLayout,
  PageShellGeometry,
  PageShellLayoutPreference,
  PageShellPlacement,
  PageShellPackedPosition,
  PageShellDropTarget,
  PageShellSize,
  PageShellSpan,
} from "@/lib/page-shell-layout";
import type { PageShellLayoutState } from "@/hooks/usePageShellLayout";

const shellSource = readFileSync(new URL("../src/components/ui-system/reorderable-page-shells.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("../src/lib/page-shell-layout.ts", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/hooks/usePageShellLayout.ts", import.meta.url), "utf8");
const globalSource = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function sizesFor(spans: Record<string, PageShellSpan>, heights: Record<string, number | null> = {}) {
  return Object.fromEntries(Object.entries(spans).map(([id, span]) => [
    id,
    { heightPx: heights[id] ?? null, span },
  ])) as Record<string, PageShellSize>;
}

function positionsFor(
  order: readonly string[],
  sizes: Readonly<Record<string, PageShellSize>>,
  placements: Readonly<Record<string, PageShellPlacement>> = {},
) {
  return packPageShellLayout(order, sizes, { placements });
}

function geometriesFor(
  order: readonly string[],
  positions: Readonly<Record<string, PageShellPackedPosition>>,
  gridBounds = { left: 0, width: 1200 },
): PageShellGeometry[] {
  return order.flatMap((id) => {
    const position = positions[id];
    const column = position && getPageShellGridColumnGeometry(gridBounds, position.columnStart, position.columnSpan);
    if (!position || !column) return [];
    const top = (position.rowStart - 1) * 220;
    return [{ id, left: column.left, right: column.left + column.width, top, bottom: top + 160 }];
  });
}

function sameRow(
  positions: Readonly<Record<string, PageShellPackedPosition>>,
  left: string,
  right: string,
) {
  return positions[left]?.rowStart === positions[right]?.rowStart;
}

function canonicalEditLayout(canonical: PageShellCanonicalLayout): PageShellLayoutPreference {
  return normalizePageShellLayout({
    order: [...canonical.order],
    placements: canonical.placements,
    sizes: canonical.sizes,
  }, canonical.order, canonical.sizes);
}

function staticLayout(isEditing: boolean): PageShellLayoutState {
  const canonical = {
    order: ["conditional", "regular"],
    sizes: {
      conditional: { heightPx: 288, span: 6 as const },
      regular: { heightPx: null, span: 12 as const },
    },
  };
  return {
    applyView: () => undefined,
    beginPreview: () => undefined,
    canEdit: true,
    canReorder: true,
    canResize: true,
    canonicalLayout: canonical,
    cancelPreview: () => undefined,
    commitPreview: () => undefined,
    deleteView: () => undefined,
    exportLayouts: () => {
      throw new Error("not used in static render");
    },
    finishEditing: () => undefined,
    isEditing,
    isLayoutReady: true,
    isPreviewing: false,
    isCanonical: false,
    order: [...canonical.order],
    pageKey: "test",
    placements: {
      conditional: { columnStart: 1 },
      regular: { columnStart: 7 },
    },
    reset: () => undefined,
    saveView: () => null,
    setPreviewOrder: () => undefined,
    setPreviewPlacements: () => undefined,
    setPreviewSizes: () => undefined,
    sizes: canonical.sizes,
    startEditing: () => undefined,
    views: [],
  };
}

test("normalization keeps persisted order as the vertical authority", () => {
  const result = normalizePageShellLayout({
    order: ["B", "A"],
    placements: {
      A: { columnStart: 1, laneOrder: 0 },
      B: { columnStart: 7, laneOrder: 99 },
    },
    sizes: sizesFor({ A: 6, B: 6 }),
  }, ["A", "B"], sizesFor({ A: 6, B: 6 }));
  assert.deepEqual(result.order, ["B", "A"]);
  assert.equal(result.placements?.B?.columnStart, 7);
});

test("semantic rowIndex normalization is additive and rejects malformed values", () => {
  assert.equal(normalizePageShellRowIndex(0), 0);
  assert.equal(normalizePageShellRowIndex(7), 7);
  assert.equal(normalizePageShellRowIndex(2.5), undefined);
  assert.equal(normalizePageShellRowIndex(-1), undefined);
  assert.equal(normalizePageShellRowIndex(Number.NaN), undefined);
  assert.equal(normalizePageShellRowIndex(Number.POSITIVE_INFINITY), undefined);
  assert.equal(normalizePageShellRowIndex("2"), undefined);
  assert.equal(normalizePageShellRowIndex(undefined), undefined);
  assert.deepEqual(normalizePageShellPlacement({ columnStart: 7, rowIndex: 2 }, 6), { columnStart: 7, rowIndex: 2, laneOrder: 0 });
  assert.deepEqual(normalizePageShellPlacement({ columnStart: 7 }, 6), { columnStart: 7, laneOrder: 0 });
  assert.deepEqual(normalizePageShellPlacement({ columnStart: 7, rowIndex: 2.5 }, 6), { columnStart: 7, laneOrder: 0 });
});

test("explicit row detection distinguishes complete, legacy, filtered, and malformed layouts", () => {
  const complete = {
    order: ["hidden", "a", "b"],
    placements: {
      hidden: { columnStart: 1 },
      a: { columnStart: 1, rowIndex: 0 },
      b: { columnStart: 7, rowIndex: 1 },
    },
    sizes: sizesFor({ hidden: 12, a: 6, b: 6 }),
  } satisfies PageShellLayoutPreference;
  assert.equal(hasCompletePageShellRows(complete, ["a", "b"]), true);
  assert.equal(hasCompletePageShellRows(complete, ["hidden", "a", "b"]), false);
  assert.equal(isLegacyPageShellLayout(complete, ["a", "b"]), false);
  assert.equal(isLegacyPageShellLayout({ ...complete, placements: { ...complete.placements, b: { columnStart: 7 } } }, ["a", "b"]), true);
  assert.equal(hasCompletePageShellRows({ ...complete, placements: { ...complete.placements, b: { columnStart: 7, rowIndex: -1 } } }, ["a", "b"]), false);
});

test("explicit row compaction preserves membership and placement fields without mutation", () => {
  const layout: PageShellLayoutPreference = {
    order: ["a", "b", "c", "d"],
    placements: {
      a: { columnStart: 1, rowIndex: 2, rowOffsetSteps: 3 },
      b: { columnStart: 7, rowIndex: 2, mode: "centered" },
      c: { columnStart: 1, rowIndex: 7 },
      d: { columnStart: 5, rowIndex: 10 },
    },
    sizes: sizesFor({ a: 5, b: 5, c: 7, d: 8 }),
  };
  const before = clonePageShellLayout(layout);
  const compacted = compactPageShellRows(layout);
  assert.deepEqual(compacted.placements, {
    a: { columnStart: 1, rowIndex: 0, rowOffsetSteps: 3 },
    b: { columnStart: 7, rowIndex: 0, mode: "centered" },
    c: { columnStart: 1, rowIndex: 1 },
    d: { columnStart: 5, rowIndex: 2 },
  });
  assert.deepEqual(layout, before);
  assert.deepEqual(compacted.sizes, layout.sizes);
});

test("explicit grouping is row ordered, layout-order stable, and independent of packed coordinates", () => {
  const layout: PageShellLayoutPreference = {
    order: ["b", "a", "d", "c"],
    placements: {
      a: { columnStart: 9, rowIndex: 2 },
      b: { columnStart: 1, rowIndex: 2 },
      c: { columnStart: 1, rowIndex: 0 },
      d: { columnStart: 7, rowIndex: 0 },
    },
    sizes: sizesFor({ a: 3, b: 3, c: 6, d: 6 }),
  };
  assert.deepEqual(getPageShellExplicitRows(layout), [
    { rowIndex: 0, shellIds: ["d", "c"] },
    { rowIndex: 2, shellIds: ["b", "a"] },
  ]);
  assert.deepEqual(getPageShellExplicitRowMajorOrder(layout), ["d", "c", "b", "a"]);
  assert.deepEqual(getPageShellExplicitRows({ ...layout, placements: { ...layout.placements, c: { columnStart: 1 } } }), []);
});

test("measured legacy row inference subtracts visual offsets and is idempotent", () => {
  const layout: PageShellLayoutPreference = {
    order: ["a", "b", "c", "d"],
    placements: {
      a: { columnStart: 1, rowOffsetSteps: 0 },
      b: { columnStart: 7, rowOffsetSteps: 3 },
      c: { columnStart: 1, rowOffsetSteps: 0 },
      d: { columnStart: 1, mode: "centered", rowOffsetSteps: 0 },
    },
    sizes: sizesFor({ a: 5, b: 7, c: 12, d: 5 }),
  };
  const packedPositions = {
    a: { columnStart: 1, columnSpan: 5, rowStart: 1, rowSpan: 20 },
    b: { columnStart: 7, columnSpan: 7, rowStart: 1 + 3 * 3, rowSpan: 15 },
    c: { columnStart: 1, columnSpan: 12, rowStart: 40, rowSpan: 20 },
    d: { columnStart: 4, columnSpan: 5, rowStart: 61, rowSpan: 20 },
  } satisfies Record<string, PageShellPackedPosition>;
  const inferred = inferPageShellRowsFromPackedLayout({ layout, packedPositions, shellIds: layout.order });
  assert.deepEqual(layout.placements && Object.fromEntries(Object.entries(inferred.placements ?? {}).map(([id, placement]) => [id, placement.rowIndex])), {
    a: 0,
    b: 0,
    c: 1,
    d: 2,
  });
  assert.equal(inferred.placements?.b?.columnStart, 7);
  assert.equal(inferred.placements?.b?.rowOffsetSteps, 3);
  assert.equal(inferred.placements?.d?.mode, "centered");
  assert.deepEqual(inferPageShellRowsFromPackedLayout({ layout: inferred, packedPositions, shellIds: layout.order }), inferred);
  assert.deepEqual(layout.placements?.a, { columnStart: 1, rowOffsetSteps: 0 });
});

test("all registered canonical layouts have valid explicit rows and preserve approved compositions", () => {
  for (const { canonicalLayout } of getRegisteredPageShellPages()) {
    assert.deepEqual(getPageShellCanonicalLayoutValidationErrors(canonicalLayout), [], canonicalLayout.order.join(","));
    assert.equal(hasCompletePageShellRows(canonicalLayout, canonicalLayout.order), true);
  }
  const water = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Water.placements ?? {};
  assert.deepEqual([
    [water["water-log"]?.columnStart, water["water-log"]?.rowIndex],
    [water["water-pending"]?.columnStart, water["water-pending"]?.rowIndex],
    [water["water-today"]?.columnStart, water["water-today"]?.rowIndex],
    [water["water-history"]?.columnStart, water["water-history"]?.rowIndex],
  ], [[1, 0], [6, 0], [6, 1], [6, 2]]);
  const food = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food.placements ?? {};
  assert.deepEqual([
    [food["food-meal-log"]?.columnStart, food["food-meal-log"]?.rowIndex],
    [food["food-daily-totals"]?.columnStart, food["food-daily-totals"]?.rowIndex],
    [food["food-favorites-recent"]?.columnStart, food["food-favorites-recent"]?.rowIndex],
    [food["food-library"]?.columnStart, food["food-library"]?.rowIndex],
  ], [[1, 0], [8, 0], [8, 1], [1, 2]]);
  const fitness = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Fitness.placements ?? {};
  assert.deepEqual([fitness["fitness-active-workout"]?.rowIndex, fitness["fitness-today"]?.rowIndex, fitness["fitness-week"]?.rowIndex, fitness["fitness-goals"]?.rowIndex, fitness["fitness-plans"]?.rowIndex, fitness["fitness-workout-history"]?.rowIndex], [0, 1, 1, 2, 3, 4]);
  assert.equal(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Weight.placements?.["weight-entry"]?.rowIndex, 0);
  assert.equal(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Weight.placements?.["weight-trend"]?.rowIndex, 0);
  assert.equal(TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.placements?.["test-d20-sandbox"]?.rowIndex, 0);
  assert.equal(TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.placements?.["test-d20-controls"]?.rowIndex, 0);
  for (const layout of [FOCUS_PAGE_SHELL_CANONICAL_LAYOUT, HOME_PAGE_SHELL_CANONICAL_LAYOUT, NOTES_PAGE_SHELL_CANONICAL_LAYOUT, SETTINGS_PAGE_SHELL_CANONICAL_LAYOUT, STATS_PAGE_SHELL_CANONICAL_LAYOUT, TEST_PAGE_SHELL_CANONICAL_LAYOUT]) {
    assert.equal(hasCompletePageShellRows(layout, layout.order), true);
  }
});

test("page shell spans remain the 12-column 3-through-12 range", () => {
  assert.deepEqual(PAGE_SHELL_SPAN_OPTIONS, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(normalizePageShellSize({ heightPx: null, span: 2 }).span, 3);
  assert.equal(normalizePageShellSize({ heightPx: null, span: 99 }).span, 12);
});

test("legacy placements normalize odd Center mode and exact even center starts", () => {
  const normalized = normalizePageShellPlacement({ columnStart: 99, laneOrder: 4, mode: "centered" }, 5);
  assert.deepEqual(normalized, { columnStart: 8, laneOrder: 4, mode: "centered" });
  const expectedEvenStarts: Array<[PageShellSpan, number]> = [[4, 5], [6, 4], [8, 3], [10, 2], [12, 1]];
  expectedEvenStarts.forEach(([span, columnStart]) => {
    assert.deepEqual(
      normalizePageShellPlacement({ columnStart: 99, laneOrder: 4, mode: "centered" }, span),
      { columnStart, laneOrder: 4 },
    );
    const packed = positionsFor(["source"], sizesFor({ source: span }), {
      source: { columnStart: 99, mode: "centered" },
    });
    assert.equal(packed.source.columnStart, columnStart);
    assert.equal(packed.source.rowStart, 1);
  });
  assert.equal(normalizePageShellPlacement({ columnStart: 1 }, 6).laneOrder, 0);
});

test("storage remains user-scoped and resettable without a schema migration", () => {
  const store = storage();
  const key = getPageShellLayoutStorageKey("user-1");
  const canonical = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Water;
  const custom = canonicalEditLayout(canonical);
  custom.order = ["water-pending", "water-log", "water-today", "water-history"];
  custom.placements = {
    ...custom.placements,
    "water-pending": { columnStart: 5, laneOrder: 8 },
  };
  writePageShellLayout(store, key, "health:water", custom);
  assert.equal(hasPageShellLayout(store, key, "health:water"), true);
  assert.equal(getHealthPageShellKey("Water"), "health:water");
  assert.deepEqual(readPageShellLayout(store, key, "health:water", canonical.order, canonical.sizes).order, custom.order);
  assert.equal(readPageShellLayout(store, key, "health:water", canonical.order, canonical.sizes).placements?.["water-pending"]?.columnStart, 5);
  assert.equal(readPageShellLayout(store, key, "health:water", canonical.order, canonical.sizes).placements?.["water-log"]?.rowIndex, 0);

  const legacyKey = getPageShellLayoutStorageKey("legacy-user");
  store.setItem(legacyKey, JSON.stringify({ "health:water": { order: canonical.order, placements: { "water-log": { columnStart: 1 } }, sizes: canonical.sizes } }));
  const legacy = readPageShellLayout(store, legacyKey, "health:water", canonical.order, canonical.sizes);
  assert.equal(legacy.placements?.["water-log"]?.rowIndex, undefined);
  assert.equal(isLegacyPageShellLayout(legacy, canonical.order), true);
});

test("legacy ID replacements preserve one-to-one placement metadata without inventing rows", () => {
  const sizes = sizesFor({ old: 6, next: 6, first: 5, second: 7 });
  const oneToOne = normalizePageShellLayout({
    order: ["old"],
    placements: { old: { columnStart: 7, rowIndex: 4, rowOffsetSteps: 2, laneOrder: 3 } },
    sizes,
  }, ["next"], sizes, { old: ["next"] });
  assert.deepEqual(oneToOne.placements?.next, { columnStart: 7, rowIndex: 4, laneOrder: 3, rowOffsetSteps: 2 });

  const oneToMany = normalizePageShellLayout({
    order: ["old"],
    placements: { old: { columnStart: 7, rowIndex: 4, rowOffsetSteps: 2, laneOrder: 3 } },
    sizes,
  }, ["first", "second"], sizes, { old: ["first", "second"] });
  assert.equal(oneToMany.placements?.first?.columnStart, 7);
  assert.equal(oneToMany.placements?.second?.columnStart, 6);
  assert.equal(oneToMany.placements?.first?.rowIndex, undefined);
  assert.equal(oneToMany.placements?.second?.rowIndex, undefined);
  assert.equal(isLegacyPageShellLayout(oneToMany, ["first", "second"]), true);
});

test("5 plus 7 compatible shells share one row", () => {
  const order = ["left", "right"];
  const positions = positionsFor(order, sizesFor({ left: 5, right: 7 }), {
    left: { columnStart: 1 },
    right: { columnStart: 6 },
  });
  assert.equal(sameRow(positions, "left", "right"), true);
  assert.equal(positions.right.columnStart, 6);
});

test("7 plus 5 compatible shells share one row", () => {
  const order = ["left", "right"];
  const positions = positionsFor(order, sizesFor({ left: 7, right: 5 }), {
    left: { columnStart: 1 },
    right: { columnStart: 8 },
  });
  assert.equal(sameRow(positions, "left", "right"), true);
  assert.equal(positions.right.columnStart, 8);
});

test("three four-column shells share one row", () => {
  const order = ["a", "b", "c"];
  const positions = positionsFor(order, sizesFor({ a: 4, b: 4, c: 4 }), {
    a: { columnStart: 1 },
    b: { columnStart: 5 },
    c: { columnStart: 9 },
  });
  assert.equal(sameRow(positions, "a", "b"), true);
  assert.equal(sameRow(positions, "b", "c"), true);
});

test("8 plus 7 cannot share one row", () => {
  const positions = positionsFor(["wide", "overflow"], sizesFor({ wide: 8, overflow: 7 }), {
    wide: { columnStart: 1 },
    overflow: { columnStart: 6 },
  });
  assert.notEqual(positions.wide.rowStart, positions.overflow.rowStart);
});

test("overlapping preferred starts resolve vertically without overlap", () => {
  const positions = positionsFor(["first", "second"], sizesFor({ first: 6, second: 6 }), {
    first: { columnStart: 1 },
    second: { columnStart: 1 },
  });
  assert.equal(positions.first.columnStart, positions.second.columnStart);
  assert.ok(positions.second.rowStart > positions.first.rowStart);
});

test("legacy lane order no longer reorders or creates semantic lane packing", () => {
  const order = ["first", "right", "second"];
  const sizes = sizesFor({ first: 3, right: 3, second: 3 });
  const positions = positionsFor(order, sizes, {
    first: { columnStart: 1, laneOrder: 20 },
    right: { columnStart: 7, laneOrder: 0 },
    second: { columnStart: 1, laneOrder: 0 },
  });
  assert.equal(positions.first.rowStart, 1);
  assert.equal(positions.right.rowStart, 1);
  assert.ok(positions.second.rowStart > positions.first.rowStart);
});

test("changing order changes vertical packing while preserving each preferred start", () => {
  const sizes = sizesFor({ first: 6, second: 6 });
  const placements = {
    first: { columnStart: 1 },
    second: { columnStart: 1 },
  };
  const positions = positionsFor(["second", "first"], sizes, placements);
  assert.equal(positions.second.rowStart, 1);
  assert.ok(positions.first.rowStart > positions.second.rowStart);
  assert.equal(positions.first.columnStart, 1);
});

test("pointer X snaps to valid starts and preserves the grab offset", () => {
  const grid = { left: 100, width: 1200 };
  const first = getPageShellGridColumnGeometry(grid, 1, 5);
  const eighth = getPageShellGridColumnGeometry(grid, 8, 5);
  assert.ok(first);
  assert.ok(eighth);
  assert.equal(getPageShellGridStartFromPointer(grid, first.left + 24, 5, 24), 1);
  assert.equal(getPageShellGridStartFromPointer(grid, eighth.left + 24, 5, 24), 8);
});

test("pointer X clamps at the left edge and right legal edge", () => {
  const grid = { left: 100, width: 1200 };
  assert.equal(getPageShellGridStartFromPointer(grid, -500, 5, 0), 1);
  assert.equal(getPageShellGridStartFromPointer(grid, 5000, 5, 0), 8);
  assert.equal(getPageShellGridStartFromPointer(grid, 5000, 12, 0), 1);
});

test("drag axis intent waits for movement, then locks to the dominant axis", () => {
  assert.equal(PAGE_SHELL_DRAG_AXIS_LOCK_PX, 12);
  assert.equal(resolvePageShellDragAxisIntent(100, 100, 108, 108), null);
  assert.equal(resolvePageShellDragAxisIntent(100, 100, 112, 112), null);
  assert.equal(resolvePageShellDragAxisIntent(100, 100, 124, 116), "horizontal");
  assert.equal(resolvePageShellDragAxisIntent(100, 100, 116, 124), "vertical");
  assert.equal(resolvePageShellDragAxisIntent(100, 100, 118, 110, 20), null);
});

test("directional target zones resolve above, below, left, right, and replace", () => {
  const targetGeometry: PageShellGeometry = { bottom: 500, id: "target", left: 100, right: 500, top: 100 };
  assert.equal(resolvePageShellDropRelationship(targetGeometry, 300, 120), "before");
  assert.equal(resolvePageShellDropRelationship(targetGeometry, 300, 480), "after");
  assert.equal(resolvePageShellDropRelationship(targetGeometry, 120, 300), "left");
  assert.equal(resolvePageShellDropRelationship(targetGeometry, 480, 300), "right");
  assert.equal(resolvePageShellDropRelationship(targetGeometry, 300, 300), "replace");
});

test("directional target hysteresis holds a relationship through the edge band", () => {
  const targetGeometry: PageShellGeometry = { bottom: 500, id: "target", left: 100, right: 500, top: 100 };
  assert.equal(PAGE_SHELL_DROP_ZONE_HYSTERESIS_PX, 12);
  assert.equal(resolvePageShellDropRelationship(targetGeometry, 195, 300), "left");
  assert.equal(resolvePageShellDropRelationship(targetGeometry, 204, 300, "left"), "left");
  assert.equal(resolvePageShellDropRelationship(targetGeometry, 220, 300, "left"), "replace");
  assert.equal(resolvePageShellDropRelationship(targetGeometry, 300, 194, "replace"), "replace");
  assert.equal(resolvePageShellDropRelationship(targetGeometry, 300, 150, "replace"), "before");
});

test("a physical shell hit takes precedence over the previous target sticky region", () => {
  const order = ["source", "b", "c"];
  const positions: Record<string, PageShellPackedPosition> = {
    source: { columnSpan: 4, columnStart: 1, rowSpan: 1, rowStart: 1 },
    b: { columnSpan: 4, columnStart: 5, rowSpan: 1, rowStart: 1 },
    c: { columnSpan: 4, columnStart: 9, rowSpan: 1, rowStart: 1 },
  };
  const geometries: PageShellGeometry[] = [
    { bottom: 300, id: "source", left: 0, right: 100, top: 100 },
    { bottom: 300, id: "b", left: 120, right: 220, top: 100 },
    { bottom: 300, id: "c", left: 240, right: 340, top: 100 },
  ];
  const previousTarget: PageShellDropTarget = { columnStart: 5, insertionIndex: 1, laneOrder: 0, relationship: "replace", targetId: "b" };
  const directCenter = getPageShellDropTarget(geometries, positions, order, "source", 290, 200, undefined, 0, {}, undefined, 0, previousTarget);
  assert.equal(directCenter.targetId, "c");
  assert.equal(directCenter.relationship, "replace");
  const directPlan = planPageShellMove({
    layout: { order, placements: { source: { columnStart: 1 }, b: { columnStart: 5 }, c: { columnStart: 9 } }, sizes: sizesFor({ source: 4, b: 4, c: 4 }) },
    visibleShellIds: order,
    sourceId: "source",
    target: directCenter,
    packedPositions: positions,
  });
  assert.equal(directPlan.valid, true);
  if (directPlan.valid) assert.deepEqual(directPlan.layout.order, ["c", "b", "source"]);
  assert.equal(getPageShellDropTarget(geometries, positions, order, "source", 230, 200, undefined, 0, {}, undefined, 0, previousTarget).targetId, "b");
  assert.equal(getPageShellDropTarget(geometries, positions, order, "source", 290, 200, undefined, 0, {}, undefined, 0, previousTarget).targetId, "c");
});

test("direct shell bounds resolve every C edge relationship while gap hysteresis remains available", () => {
  const order = ["source", "b", "c"];
  const positions: Record<string, PageShellPackedPosition> = {
    source: { columnSpan: 4, columnStart: 1, rowSpan: 1, rowStart: 1 },
    b: { columnSpan: 4, columnStart: 5, rowSpan: 1, rowStart: 1 },
    c: { columnSpan: 4, columnStart: 9, rowSpan: 1, rowStart: 1 },
  };
  const geometries: PageShellGeometry[] = [
    { bottom: 300, id: "source", left: 0, right: 100, top: 100 },
    { bottom: 300, id: "b", left: 120, right: 220, top: 100 },
    { bottom: 300, id: "c", left: 240, right: 340, top: 100 },
  ];
  const targetAt = (x: number, y: number) => getPageShellDropTarget(geometries, positions, order, "source", x, y).relationship;
  assert.equal(targetAt(290, 200), "replace");
  assert.equal(targetAt(240, 200), "left");
  assert.equal(targetAt(340, 200), "right");
  assert.equal(targetAt(290, 100), "before");
  assert.equal(targetAt(290, 300), "after");
  assert.equal(getPageShellDropTarget(geometries, positions, order, "source", 230, 200, undefined, 0, {}, undefined, 0, { columnStart: 5, insertionIndex: 1, laneOrder: 0, relationship: "right", targetId: "b" }).targetId, "b");
});

test("directional placement uses the target anchor and replace swaps without deleting it", () => {
  const order = ["source", "target"];
  const sizes = sizesFor({ source: 4, target: 4 });
  const placements = { source: { columnStart: 1 }, target: { columnStart: 5 } };
  const positions = positionsFor(order, sizes, placements);
  const grid = { left: 0, width: 1200 };
  const targetColumn = getPageShellGridColumnGeometry(grid, 5, 4);
  assert.ok(targetColumn);
  const geometries = geometriesFor(order, positions, grid);
  const above = getPageShellDropTarget(geometries, positions, order, "source", targetColumn.left + targetColumn.width / 2, 20, grid, targetColumn.width / 2, placements);
  assert.equal(above.relationship, "before");
  assert.equal(above.targetId, "target");
  const below = getPageShellDropTarget(geometries, positions, order, "source", targetColumn.left + targetColumn.width / 2, 140, grid, targetColumn.width / 2, placements);
  assert.equal(below.relationship, "after");
  assert.equal(below.insertionIndex, 1);
  const left = getPageShellDropTarget(geometries, positions, order, "source", targetColumn.left + 20, 80, grid, 20, placements);
  assert.equal(left.relationship, "left");
  assert.equal(left.targetId, "target");
  assert.equal(left.columnStart, 1);
  assert.equal(left.insertionIndex, 0);
  const right = getPageShellDropTarget(geometries, positions, order, "source", targetColumn.left + targetColumn.width - 20, 80, grid, 20, placements);
  assert.equal(right.relationship, "right");
  assert.equal(right.columnStart, 9);
  assert.equal(right.insertionIndex, 1);
  const replace = getPageShellDropTarget(geometries, positions, order, "source", targetColumn.left + targetColumn.width / 2, 80, grid, targetColumn.width / 2, placements);
  assert.equal(replace.relationship, "replace");
  assert.equal(replace.targetId, "target");
  const placed = placePageShellAtDrop({ order, sizes, placements }, order, "source", replace);
  assert.deepEqual(placed.order, ["target", "source"]);
  assert.equal(Object.keys(placed.placements).length, 2);
  assert.equal(placed.placements.target.columnStart, 1);
  assert.equal(placed.placements.source.columnStart, 5);
  assert.equal(placed.placements.source.rowOffsetSteps ?? 0, 0);
});

test("planned moves are pure, preserve widths, and lock directional semantics", () => {
  const order = ["a", "b", "c"];
  const sizes = sizesFor({ a: 4, b: 4, c: 4 });
  const placements = { a: { columnStart: 1 }, b: { columnStart: 5 }, c: { columnStart: 9 } };
  const layout = { order, placements, sizes };
  const packedPositions = positionsFor(order, sizes, placements);
  const original = JSON.stringify(layout);
  const right = planPageShellMove({
    layout,
    visibleShellIds: order,
    sourceId: "a",
    target: { columnStart: 9, insertionIndex: 2, laneOrder: 0, relationship: "right", targetId: "c" },
    packedPositions,
  });
  assert.equal(right.valid, true);
  if (right.valid) {
    assert.deepEqual(right.layout.order, ["b", "c", "a"]);
    assert.deepEqual(right.layout.sizes, sizes);
    assert.deepEqual(packPageShellLayout(right.layout.order, right.layout.sizes, { placements: right.layout.placements }), {
      a: { columnSpan: 4, columnStart: 9, rowSpan: packedPositions.a.rowSpan, rowStart: 1 },
      b: { columnSpan: 4, columnStart: 1, rowSpan: packedPositions.b.rowSpan, rowStart: 1 },
      c: { columnSpan: 4, columnStart: 5, rowSpan: packedPositions.c.rowSpan, rowStart: 1 },
    });
  }
  const left = planPageShellMove({
    layout,
    visibleShellIds: order,
    sourceId: "c",
    target: { columnStart: 1, insertionIndex: 0, laneOrder: 0, relationship: "left", targetId: "a" },
    packedPositions,
  });
  assert.equal(left.valid, true);
  if (left.valid) assert.deepEqual(left.layout.order, ["c", "a", "b"]);
  const swap = planPageShellMove({
    layout,
    visibleShellIds: order,
    sourceId: "a",
    target: { columnStart: 9, insertionIndex: 2, laneOrder: 0, relationship: "replace", targetId: "c" },
    packedPositions,
  });
  assert.equal(swap.valid, true);
  if (swap.valid) {
    assert.deepEqual(swap.layout.order, ["c", "b", "a"]);
    assert.deepEqual(swap.layout.placements, { a: { columnStart: 9, laneOrder: 0 }, b: { columnStart: 5 }, c: { columnStart: 1, laneOrder: 0 } });
    assert.ok(swap.layout.order.includes("c"));
  }
  assert.equal(JSON.stringify(layout), original);
});

test("directional arrows resolve one same-row position through the shared planner", () => {
  const order = ["a", "b", "c"];
  const sizes = sizesFor({ a: 4, b: 4, c: 4 });
  const placements = { a: { columnStart: 1 }, b: { columnStart: 5 }, c: { columnStart: 9 } };
  const layout = { order, placements, sizes };
  const packedPositions = positionsFor(order, sizes, placements);
  const leftTarget = getPageShellDirectionalMoveTarget({ direction: "left", layout, packedPositions, sourceId: "b", visibleShellIds: order });
  assert.equal(leftTarget?.targetId, "a");
  assert.equal(leftTarget?.relationship, "left");
  const leftPlan = leftTarget && planPageShellMove({ layout, visibleShellIds: order, sourceId: "b", target: leftTarget, packedPositions });
  assert.equal(leftPlan?.valid, true);
  if (leftPlan?.valid) assert.deepEqual(leftPlan.layout.order, ["b", "a", "c"]);

  const rightTarget = getPageShellDirectionalMoveTarget({ direction: "right", layout, packedPositions, sourceId: "b", visibleShellIds: order });
  assert.equal(rightTarget?.targetId, "c");
  assert.equal(rightTarget?.relationship, "right");
  const rightPlan = rightTarget && planPageShellMove({ layout, visibleShellIds: order, sourceId: "b", target: rightTarget, packedPositions });
  assert.equal(rightPlan?.valid, true);
  if (rightPlan?.valid) assert.deepEqual(rightPlan.layout.order, ["a", "c", "b"]);
  assert.equal(getPageShellDirectionalMoveTarget({ direction: "left", layout, packedPositions, sourceId: "a", visibleShellIds: order }), null);
  assert.equal(getPageShellDirectionalMoveTarget({ direction: "right", layout, packedPositions, sourceId: "c", visibleShellIds: order }), null);
});

test("directional vertical arrows swap with the best overlapping adjacent-row shell", () => {
  const order = ["a", "b", "c", "d", "e"];
  const sizes = sizesFor({ a: 4, b: 4, c: 4, d: 4, e: 4 });
  const placements = {
    a: { columnStart: 1 },
    b: { columnStart: 5 },
    c: { columnStart: 1 },
    d: { columnStart: 5 },
    e: { columnStart: 1 },
  };
  const layout = { order, placements, sizes };
  const packedPositions = positionsFor(order, sizes, placements);
  const upTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout, packedPositions, sourceId: "e", visibleShellIds: order });
  assert.equal(upTarget?.targetId, "c");
  assert.equal(upTarget?.relationship, "replace");
  assert.equal(upTarget?.rowOffsetSteps, 0);
  const upPlan = upTarget && planPageShellMove({ layout, visibleShellIds: order, sourceId: "e", target: upTarget, packedPositions });
  assert.equal(upPlan?.valid, true);
  if (upPlan?.valid) {
    assert.deepEqual(upPlan.layout.order, ["a", "b", "e", "d", "c"]);
    assert.deepEqual(upPlan.layout.sizes, sizes);
    assert.equal(upPlan.layout.placements?.e?.columnStart, 1);
    assert.equal(upPlan.layout.placements?.c?.columnStart, 1);
  }
  const downTarget = getPageShellDirectionalMoveTarget({ direction: "down", layout, packedPositions, sourceId: "a", visibleShellIds: order });
  assert.equal(downTarget?.targetId, "c");
  assert.equal(downTarget?.relationship, "replace");
  assert.equal(getPageShellDirectionalMoveTarget({ direction: "up", layout, packedPositions, sourceId: "a", visibleShellIds: order }), null);
  assert.equal(getPageShellDirectionalMoveTarget({ direction: "down", layout, packedPositions, sourceId: "e", visibleShellIds: order }), null);
});

test("vertical arrows target empty adjacent space directly at the source X", () => {
  const order = ["a", "source"];
  const sizes = sizesFor({ a: 4, source: 4 });
  const placements = { a: { columnStart: 1 }, source: { columnStart: 7 } };
  const layout = { order, placements, sizes };
  const packedPositions = {
    a: { columnSpan: 4 as const, columnStart: 1, rowSpan: 41, rowStart: 1 },
    source: { columnSpan: 4 as const, columnStart: 7, rowSpan: 41, rowStart: 42 },
  };
  const target = getPageShellDirectionalMoveTarget({ direction: "up", layout, packedPositions, sourceId: "source", visibleShellIds: order });
  assert.equal(target?.targetId, null);
  assert.equal(target?.relationship, undefined);
  assert.equal(target?.destinationStructuralRowStart, 1);
  assert.equal(target?.insertionIndex, 1);
  assert.equal(target?.columnStart, 7);
  assert.equal(target?.structuralRow, "above");
  const plan = target && planPageShellMove({ layout, visibleShellIds: order, sourceId: "source", target, packedPositions });
  assert.equal(plan?.valid, true);
  if (plan?.valid) {
    assert.deepEqual(plan.layout.order, ["a", "source"]);
    assert.equal(plan.layout.placements?.source?.columnStart, 7);
    assert.equal(plan.layout.placements?.a?.columnStart, 1);
    assert.deepEqual(plan.layout.sizes, sizes);
    const repacked = positionsFor(plan.layout.order, plan.layout.sizes, plan.layout.placements);
    assert.equal(repacked.source.columnStart, 7);
    assert.equal(repacked.source.rowStart, repacked.a.rowStart);
  }

  const offsetLayout = {
    order,
    placements: { a: { columnStart: 1 }, source: { columnStart: 7, rowOffsetSteps: 4 } },
    sizes,
  };
  const offsetPositions = {
    a: { columnSpan: 4 as const, columnStart: 1, rowSpan: 41, rowStart: 1 },
    source: { columnSpan: 4 as const, columnStart: 7, rowSpan: 41, rowStart: 54 },
  };
  const offsetTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout: offsetLayout, packedPositions: offsetPositions, sourceId: "source", visibleShellIds: order });
  assert.equal(offsetTarget?.targetId, null);
  assert.equal(offsetTarget?.destinationStructuralRowStart, 1);
  assert.equal(offsetTarget?.rowOffsetSteps, 0);
  const offsetPlan = offsetTarget && planPageShellMove({ layout: offsetLayout, visibleShellIds: order, sourceId: "source", target: offsetTarget, packedPositions: offsetPositions });
  assert.equal(offsetPlan?.valid, true);
  if (offsetPlan?.valid) assert.equal(offsetPlan.layout.placements?.source?.rowOffsetSteps ?? 0, 0);
});

test("empty vertical targets insert inside the destination row by snapped column", () => {
  const positions = {
    left: { columnSpan: 3 as const, columnStart: 1, rowSpan: 1, rowStart: 1 },
    right: { columnSpan: 3 as const, columnStart: 10, rowSpan: 1, rowStart: 1 },
    middle: { columnSpan: 4 as const, columnStart: 5, rowSpan: 1, rowStart: 42 },
    source: { columnSpan: 4 as const, columnStart: 5, rowSpan: 1, rowStart: 42 },
  };
  assert.equal(getPageShellStructuralRowInsertionIndex(
    ["left", "right", "middle", "source"],
    "source",
    ["left", "right"],
    positions,
    5,
  ), 1);
});

test("Water-like mixed-height empty movement uses real packing and preserves downstream X", () => {
  const order = ["water-log", "water-today", "water-history"];
  const sizes = sizesFor(
    { "water-log": 4, "water-today": 4, "water-history": 4 },
    { "water-log": 240, "water-today": 520, "water-history": 192 },
  );
  const placements = {
    "water-log": { columnStart: 1 },
    "water-today": { columnStart: 1 },
    "water-history": { columnStart: 7 },
  };
  const packOptions = {
    chromeHeightPx: 28,
    naturalHeights: { "water-log": 240, "water-today": 520, "water-history": 192 },
    placements,
  };
  const layout = { order, placements, sizes };
  const packedPositions = packPageShellLayout(order, sizes, packOptions);
  assert.notEqual(getPageShellStructuralRowStart("water-log", layout, packedPositions), getPageShellStructuralRowStart("water-history", layout, packedPositions));
  assert.equal(packedPositions["water-history"]?.columnStart, 7);

  const target = getPageShellDirectionalMoveTarget({ direction: "up", layout, packedPositions, sourceId: "water-history", visibleShellIds: order });
  assert.equal(target?.targetId, null);
  assert.equal(target?.columnStart, 7);
  assert.equal(target?.destinationStructuralRowStart, getPageShellStructuralRowStart("water-log", layout, packedPositions));
  assert.equal(target?.insertionIndex, 1);

  const plan = target && planPageShellMove({
    chromeHeightPx: packOptions.chromeHeightPx,
    layout,
    naturalHeights: packOptions.naturalHeights,
    packedPositions,
    sourceId: "water-history",
    target,
    visibleShellIds: order,
  });
  assert.equal(plan?.valid, true);
  if (!plan?.valid) return;
  const after = packPageShellLayout(plan.layout.order, plan.layout.sizes, {
    ...packOptions,
    placements: plan.layout.placements,
  });
  assert.equal(after["water-log"]?.columnStart, 1);
  assert.equal(after["water-history"]?.columnStart, 7);
  assert.equal(getPageShellStructuralRowStart("water-log", plan.layout, after), getPageShellStructuralRowStart("water-history", plan.layout, after));
  assert.ok((after["water-today"]?.rowStart ?? 0) > (after["water-history"]?.rowStart ?? 0));
  assert.equal(after["water-today"]?.columnStart, 1);
  assert.deepEqual(plan.layout.sizes, sizes);

  const downPositions = packPageShellLayout(plan.layout.order, plan.layout.sizes, {
    ...packOptions,
    placements: plan.layout.placements,
  });
  const downTarget = getPageShellDirectionalMoveTarget({
    direction: "down",
    layout: plan.layout,
    packedPositions: downPositions,
    sourceId: "water-history",
    visibleShellIds: plan.layout.order,
  });
  assert.equal(downTarget?.targetId, null);
  assert.equal(downTarget?.columnStart, 7);
  const downPlan = downTarget && planPageShellMove({
    chromeHeightPx: packOptions.chromeHeightPx,
    layout: plan.layout,
    naturalHeights: packOptions.naturalHeights,
    packedPositions: downPositions,
    sourceId: "water-history",
    target: downTarget,
    visibleShellIds: plan.layout.order,
  });
  assert.equal(downPlan?.valid, true);
  if (downPlan?.valid) {
    assert.deepEqual(downPlan.layout.order, order);
    assert.equal(downPlan.layout.placements?.["water-history"]?.columnStart, 7);
    assert.equal(downPlan.layout.placements?.["water-history"]?.rowOffsetSteps ?? 0, 0);
  }
});

test("empty vertical planning rejects a wrong row, changed X, and overlap without mutating the layout", () => {
  const order = ["peer", "source"];
  const sizes = sizesFor({ peer: 4, source: 4 });
  const placements = { peer: { columnStart: 1 }, source: { columnStart: 7 } };
  const layout = { order, placements, sizes };
  const packedPositions = {
    peer: { columnSpan: 4 as const, columnStart: 1, rowSpan: 41, rowStart: 1 },
    source: { columnSpan: 4 as const, columnStart: 7, rowSpan: 41, rowStart: 42 },
  };
  const directTarget = {
    columnStart: 7,
    destinationStructuralRowStart: 1,
    insertionIndex: 1,
    laneOrder: 0,
    rowOffsetSteps: 0,
    structuralRow: "above" as const,
    targetId: null,
  };
  const before = JSON.stringify(layout);
  const wrongRow = planPageShellMove({
    layout,
    packedPositions,
    sourceId: "source",
    target: { ...directTarget, destinationStructuralRowStart: 42 },
    visibleShellIds: order,
  });
  assert.equal(wrongRow.valid, false);
  if (!wrongRow.valid) assert.equal(wrongRow.reason, "INVALID_TARGET");

  const changedX = planPageShellMove({ layout, packedPositions, sourceId: "source", target: { ...directTarget, columnStart: 10 }, visibleShellIds: order });
  assert.equal(changedX.valid, false);
  if (!changedX.valid) assert.equal(changedX.reason, "COLLISION");

  const overlap = planPageShellMove({ layout, packedPositions, sourceId: "source", target: { ...directTarget, columnStart: 3 }, visibleShellIds: order });
  assert.equal(overlap.valid, false);
  assert.equal(JSON.stringify(layout), before);
});

test("vertical occupancy uses partial overlap and deterministic overlap, center, and visible-order tie breaks", () => {
  const overlapOrder = ["left", "right", "source"];
  const overlapSizes = sizesFor({ left: 6, right: 6, source: 6 });
  const overlapPlacements = { left: { columnStart: 1 }, right: { columnStart: 7 }, source: { columnStart: 5 } };
  const overlapLayout = { order: overlapOrder, placements: overlapPlacements, sizes: overlapSizes };
  const overlapPositions = positionsFor(overlapOrder, overlapSizes, overlapPlacements);
  const overlapTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout: overlapLayout, packedPositions: overlapPositions, sourceId: "source", visibleShellIds: overlapOrder });
  assert.equal(overlapTarget?.targetId, "right");
  assert.equal(overlapTarget?.relationship, "replace");
  assert.equal(overlapTarget?.columnStart, 7);
  const overlapPlan = overlapTarget && planPageShellMove({ layout: overlapLayout, visibleShellIds: overlapOrder, sourceId: "source", target: overlapTarget, packedPositions: overlapPositions });
  assert.equal(overlapPlan?.valid, true);
  if (overlapPlan?.valid) {
    assert.equal(overlapPlan.layout.placements?.source?.columnStart, 7);
    assert.equal(overlapPlan.layout.placements?.right?.columnStart, 5);
  }

  const tieOrder = ["left", "right", "source"];
  const tieSizes = sizesFor({ left: 6, right: 6, source: 6 });
  const tiePlacements = { left: { columnStart: 1 }, right: { columnStart: 7 }, source: { columnStart: 4 } };
  const tieLayout = { order: tieOrder, placements: tiePlacements, sizes: tieSizes };
  const tiePositions = positionsFor(tieOrder, tieSizes, tiePlacements);
  const tieTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout: tieLayout, packedPositions: tiePositions, sourceId: "source", visibleShellIds: tieOrder });
  assert.equal(tieTarget?.targetId, "left");
  assert.equal(tieTarget?.relationship, "replace");

  const visibleTieOrder = ["right", "left", "source"];
  const visibleTieLayout = { order: visibleTieOrder, placements: tiePlacements, sizes: tieSizes };
  const visibleTiePositions = positionsFor(visibleTieOrder, tieSizes, tiePlacements);
  const visibleTieTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout: visibleTieLayout, packedPositions: visibleTiePositions, sourceId: "source", visibleShellIds: visibleTieOrder });
  assert.equal(visibleTieTarget?.targetId, "right");
});

test("vertical replace planning exchanges exact logical destinations without changing widths", () => {
  const order = ["a", "b"];
  const sizes = sizesFor({ a: 7, b: 5 });
  const placements = { a: { columnStart: 1 }, b: { columnStart: 1 } };
  const layout = { order, placements, sizes };
  const packedPositions = positionsFor(order, sizes, placements);
  const target = getPageShellDirectionalMoveTarget({ direction: "up", layout, packedPositions, sourceId: "b", visibleShellIds: order });
  assert.equal(target?.relationship, "replace");
  const plan = target && planPageShellMove({ layout, visibleShellIds: order, sourceId: "b", target, packedPositions });
  assert.equal(plan?.valid, true);
  if (plan?.valid) {
    assert.deepEqual(plan.layout.order, ["b", "a"]);
    assert.deepEqual(plan.layout.sizes, sizes);
    assert.equal(plan.layout.placements?.a?.columnStart, 1);
    assert.equal(plan.layout.placements?.b?.columnStart, 1);
  }
});

test("invalid vertical replace leaves both rows unchanged and reports strict capacity failure", () => {
  const order = ["aa", "ab", "ac", "source"];
  const sizes = sizesFor({ aa: 4, ab: 4, ac: 4, source: 8 });
  const placements = { aa: { columnStart: 1 }, ab: { columnStart: 5 }, ac: { columnStart: 9 }, source: { columnStart: 1 } };
  const layout = { order, placements, sizes };
  const before = JSON.stringify(layout);
  const packedPositions = positionsFor(order, sizes, placements);
  const target = getPageShellDirectionalMoveTarget({ direction: "up", layout, packedPositions, sourceId: "source", visibleShellIds: order });
  assert.equal(target?.targetId, "aa");
  assert.equal(target?.relationship, "replace");
  const plan = target && planPageShellMove({ layout, visibleShellIds: order, sourceId: "source", target, packedPositions });
  assert.equal(plan?.valid, false);
  if (plan && !plan.valid) {
    assert.equal(plan.reason, "ROW_WIDTH_EXCEEDED");
    assert.equal(plan.targetRowWidth, 16);
    assert.match(plan.message, /4\/12/);
  }
  assert.equal(JSON.stringify(layout), before);
});

test("vertical arrows swap full-width standalone shells and retain Center semantics", () => {
  const fullOrder = ["a", "b"];
  const fullSizes = sizesFor({ a: 12, b: 12 });
  const fullPlacements = { a: { columnStart: 1 }, b: { columnStart: 1 } };
  const fullLayout = { order: fullOrder, placements: fullPlacements, sizes: fullSizes };
  const fullPositions = positionsFor(fullOrder, fullSizes, fullPlacements);
  const fullTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout: fullLayout, packedPositions: fullPositions, sourceId: "b", visibleShellIds: fullOrder });
  assert.equal(fullTarget?.relationship, "replace");
  const fullPlan = fullTarget && planPageShellMove({ layout: fullLayout, visibleShellIds: fullOrder, sourceId: "b", target: fullTarget, packedPositions: fullPositions });
  assert.equal(fullPlan?.valid, true);
  if (fullPlan?.valid) assert.deepEqual(fullPlan.layout.order, ["b", "a"]);

  const occupiedFullOrder = ["left", "right", "source"];
  const occupiedFullSizes = sizesFor({ left: 6, right: 6, source: 12 });
  const occupiedFullPlacements = { left: { columnStart: 1 }, right: { columnStart: 7 }, source: { columnStart: 1 } };
  const occupiedFullLayout = { order: occupiedFullOrder, placements: occupiedFullPlacements, sizes: occupiedFullSizes };
  const occupiedFullPositions = positionsFor(occupiedFullOrder, occupiedFullSizes, occupiedFullPlacements);
  const occupiedFullTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout: occupiedFullLayout, packedPositions: occupiedFullPositions, sourceId: "source", visibleShellIds: occupiedFullOrder });
  assert.equal(occupiedFullTarget?.relationship, "replace");
  const occupiedFullPlan = occupiedFullTarget && planPageShellMove({ layout: occupiedFullLayout, visibleShellIds: occupiedFullOrder, sourceId: "source", target: occupiedFullTarget, packedPositions: occupiedFullPositions });
  assert.equal(occupiedFullPlan?.valid, false);
  if (occupiedFullPlan && !occupiedFullPlan.valid) assert.equal(occupiedFullPlan.reason, "ROW_WIDTH_EXCEEDED");

  const centeredOrder = ["above", "center", "below"];
  const centeredSizes = sizesFor({ above: 12, center: 5, below: 12 });
  const centeredPlacements = { above: { columnStart: 1 }, center: { columnStart: 4, mode: "centered" as const }, below: { columnStart: 1 } };
  const centeredLayout = { order: centeredOrder, placements: centeredPlacements, sizes: centeredSizes };
  const centeredPositions = positionsFor(centeredOrder, centeredSizes, centeredPlacements);
  const centeredTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout: centeredLayout, packedPositions: centeredPositions, sourceId: "center", visibleShellIds: centeredOrder });
  assert.equal(centeredTarget?.relationship, "replace");
  assert.equal(centeredTarget?.mode, "centered");
  assert.equal(centeredTarget?.columnStart, 4);
  const centeredPlan = centeredTarget && planPageShellMove({ layout: centeredLayout, visibleShellIds: centeredOrder, sourceId: "center", target: centeredTarget, packedPositions: centeredPositions });
  assert.equal(centeredPlan?.valid, true);
  if (centeredPlan?.valid) {
    assert.equal(centeredPlan.layout.placements?.center?.mode, "centered");
    assert.equal(centeredPlan.layout.placements?.center?.columnStart, 4);
  }
});

test("vertical arrows are symmetric and repack after each committed swap", () => {
  const sizes = sizesFor({ a: 4, b: 4, c: 4 });
  let layout: PageShellLayoutPreference = {
    order: ["a", "b", "c"],
    sizes,
    placements: { a: { columnStart: 1 }, b: { columnStart: 1 }, c: { columnStart: 1 } },
  };

  const move = (sourceId: string, direction: "up" | "down") => {
    const packedPositions = positionsFor(layout.order, sizes, layout.placements);
    const target = getPageShellDirectionalMoveTarget({ direction, layout, packedPositions, sourceId, visibleShellIds: layout.order });
    assert.equal(target?.relationship, "replace");
    const plan = target && planPageShellMove({ layout, visibleShellIds: layout.order, sourceId, target, packedPositions });
    assert.equal(plan?.valid, true);
    if (plan?.valid) layout = plan.layout;
  };

  move("b", "up");
  assert.deepEqual(layout.order, ["b", "a", "c"]);
  move("b", "down");
  assert.deepEqual(layout.order, ["a", "b", "c"]);
  move("c", "up");
  assert.deepEqual(layout.order, ["a", "c", "b"]);
  move("c", "up");
  assert.deepEqual(layout.order, ["c", "a", "b"]);
  move("c", "down");
  assert.deepEqual(layout.order, ["a", "c", "b"]);
  move("c", "down");
  assert.deepEqual(layout.order, ["a", "b", "c"]);
});

test("vertical peer selection ties by stable visible order and ignores rendered offset differences", () => {
  const tieOrder = ["a", "b", "source"];
  const tieSizes = sizesFor({ a: 6, b: 6, source: 4 });
  const tiePlacements = { a: { columnStart: 1 }, b: { columnStart: 7 }, source: { columnStart: 5 } };
  const tieLayout = { order: tieOrder, placements: tiePlacements, sizes: tieSizes };
  const tiePositions = positionsFor(tieOrder, tieSizes, tiePlacements);
  const tieTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout: tieLayout, packedPositions: tiePositions, sourceId: "source", visibleShellIds: tieOrder });
  assert.equal(tieTarget?.targetId, "a");

  const offsetOrder = ["a", "b", "below"];
  const offsetSizes = sizesFor({ a: 4, b: 4, below: 12 });
  const offsetPlacements = { a: { columnStart: 1 }, b: { columnStart: 5, rowOffsetSteps: 4 }, below: { columnStart: 1 } };
  const offsetLayout = { order: offsetOrder, placements: offsetPlacements, sizes: offsetSizes };
  const offsetPositions = positionsFor(offsetOrder, offsetSizes, offsetPlacements);
  assert.notEqual(offsetPositions.a.rowStart, offsetPositions.b.rowStart);
  const rightTarget = getPageShellDirectionalMoveTarget({ direction: "right", layout: offsetLayout, packedPositions: offsetPositions, sourceId: "a", visibleShellIds: offsetOrder });
  assert.equal(rightTarget?.targetId, "b");
  assert.equal(rightTarget?.rowOffsetSteps, 0);
});

test("structural row baselines remove detents, keep Center unoffset, and sort peers deterministically", () => {
  const order = ["a", "b", "c", "center"];
  const sizes = sizesFor({ a: 4, b: 4, c: 4, center: 5 });
  const placements = {
    a: { columnStart: 5 },
    b: { columnStart: 1, rowOffsetSteps: 4 },
    c: { columnStart: 1 },
    center: { columnStart: 4, mode: "centered" as const },
  };
  const layout = { order, placements, sizes };
  const positions = positionsFor(order, sizes, placements);
  const offsetRows = Math.round(4 * PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX / PAGE_SHELL_PACKING_ROW_UNIT_PX);

  assert.equal(getPageShellStructuralRowStart("b", layout, positions), positions.b.rowStart - offsetRows);
  assert.equal(getPageShellStructuralRowStart("a", layout, positions), getPageShellStructuralRowStart("b", layout, positions));
  assert.equal(getPageShellStructuralRowStart("center", layout, positions), positions.center.rowStart);

  const tiedPositions = {
    a: { columnSpan: 4 as const, columnStart: 5, rowSpan: 1, rowStart: 1 },
    b: { columnSpan: 4 as const, columnStart: 1, rowSpan: 1, rowStart: 1 + offsetRows },
    c: { columnSpan: 4 as const, columnStart: 1, rowSpan: 1, rowStart: 1 },
  };
  const tiedLayout = {
    placements: {
      a: { columnStart: 5 },
      b: { columnStart: 1, rowOffsetSteps: 4 },
      c: { columnStart: 1 },
    },
  };
  assert.deepEqual(getPageShellStructuralRowIds(["a", "b", "c"], tiedLayout, tiedPositions, 1), ["b", "c", "a"]);
});

test("offset peers use one structural row for planner targets, sources, width, and symmetric arrows", () => {
  const order = ["a", "b", "c"];
  const sizes = sizesFor({ a: 4, b: 4, c: 4 });
  const placements = {
    a: { columnStart: 1 },
    b: { columnStart: 5, rowOffsetSteps: 4 },
    c: { columnStart: 9 },
  };
  const layout = { order, placements, sizes };
  const packedPositions = positionsFor(order, sizes, placements);
  const structuralRowStart = getPageShellStructuralRowStart("b", layout, packedPositions);
  assert.equal(structuralRowStart, getPageShellStructuralRowStart("a", layout, packedPositions));
  assert.equal(structuralRowStart, getPageShellStructuralRowStart("c", layout, packedPositions));
  assert.deepEqual(getPageShellStructuralRowIds(order, layout, packedPositions, structuralRowStart ?? -1), ["a", "b", "c"]);

  const leftTarget = getPageShellDirectionalMoveTarget({ direction: "left", layout, packedPositions, sourceId: "b", visibleShellIds: order });
  assert.equal(leftTarget?.targetId, "a");
  assert.equal(leftTarget?.rowOffsetSteps, 4);
  const leftPlan = leftTarget && planPageShellMove({ layout, visibleShellIds: order, sourceId: "b", target: leftTarget, packedPositions });
  assert.equal(leftPlan?.valid, true);
  if (leftPlan?.valid) {
    assert.deepEqual(leftPlan.layout.order, ["b", "a", "c"]);
    assert.equal(leftPlan.layout.placements?.b?.rowOffsetSteps, 4);
    const leftPositions = positionsFor(leftPlan.layout.order, sizes, leftPlan.layout.placements);
    assert.deepEqual(getPageShellStructuralRowIds(leftPlan.layout.order, leftPlan.layout, leftPositions, getPageShellStructuralRowStart("b", leftPlan.layout, leftPositions) ?? -1), ["b", "a", "c"]);
  }

  const rightTarget = getPageShellDirectionalMoveTarget({ direction: "right", layout, packedPositions, sourceId: "b", visibleShellIds: order });
  assert.equal(rightTarget?.targetId, "c");
  assert.equal(rightTarget?.rowOffsetSteps, 4);
  const rightPlan = rightTarget && planPageShellMove({ layout, visibleShellIds: order, sourceId: "b", target: rightTarget, packedPositions });
  assert.equal(rightPlan?.valid, true);
  if (rightPlan?.valid) {
    assert.deepEqual(rightPlan.layout.order, ["a", "c", "b"]);
    assert.equal(rightPlan.layout.placements?.b?.rowOffsetSteps, 4);
    const rightPositions = positionsFor(rightPlan.layout.order, sizes, rightPlan.layout.placements);
    assert.deepEqual(getPageShellStructuralRowIds(rightPlan.layout.order, rightPlan.layout, rightPositions, getPageShellStructuralRowStart("b", rightPlan.layout, rightPositions) ?? -1), ["a", "c", "b"]);
  }
});

test("structural row width includes offset peers and rejects an over-wide destination", () => {
  const validOrder = ["a", "b", "c"];
  const validSizes = sizesFor({ a: 4, b: 4, c: 4 });
  const validPlacements = {
    a: { columnStart: 1 },
    b: { columnStart: 5, rowOffsetSteps: 4 },
    c: { columnStart: 9 },
  };
  const validLayout = { order: validOrder, placements: validPlacements, sizes: validSizes };
  const validPositions = positionsFor(validOrder, validSizes, validPlacements);
  const validTarget = getPageShellDirectionalMoveTarget({ direction: "right", layout: validLayout, packedPositions: validPositions, sourceId: "b", visibleShellIds: validOrder });
  const validPlan = validTarget && planPageShellMove({ layout: validLayout, visibleShellIds: validOrder, sourceId: "b", target: validTarget, packedPositions: validPositions });
  assert.equal(validPlan?.valid, true);

  const invalidOrder = ["a", "b", "c"];
  const invalidSizes = sizesFor({ a: 4, b: 7, c: 4 });
  const invalidPlacements = {
    a: { columnStart: 1 },
    b: { columnStart: 5, rowOffsetSteps: 4 },
    c: { columnStart: 1 },
  };
  const invalidLayout = { order: invalidOrder, placements: invalidPlacements, sizes: invalidSizes };
  const invalidPositions = {
    a: { columnSpan: 4 as const, columnStart: 1, rowSpan: 1, rowStart: 1 },
    b: { columnSpan: 7 as const, columnStart: 5, rowSpan: 1, rowStart: 4 },
    c: { columnSpan: 4 as const, columnStart: 1, rowSpan: 1, rowStart: 1 },
  };
  const invalidPlan = planPageShellMove({
    layout: invalidLayout,
    visibleShellIds: invalidOrder,
    sourceId: "b",
    target: { columnStart: 9, insertionIndex: 2, laneOrder: 0, relationship: "right", targetId: "c", rowOffsetSteps: 4 },
    packedPositions: invalidPositions,
  });
  assert.equal(invalidPlan.valid, false);
  if (!invalidPlan.valid) {
    assert.equal(invalidPlan.reason, "ROW_WIDTH_EXCEEDED");
    assert.equal(invalidPlan.targetRowWidth, 15);
  }
});

test("alternating horizontal arrows repack each committed layout before the next target", () => {
  const sizes = sizesFor({ a: 4, b: 4, c: 4 });
  let layout: PageShellLayoutPreference = {
    order: ["a", "b", "c"],
    sizes,
    placements: {
      a: { columnStart: 1 },
      b: { columnStart: 5, rowOffsetSteps: 4 },
      c: { columnStart: 9 },
    },
  };

  const move = (direction: "left" | "right") => {
    const packedPositions = positionsFor(layout.order, sizes, layout.placements);
    const target = getPageShellDirectionalMoveTarget({ direction, layout, packedPositions, sourceId: "b", visibleShellIds: layout.order });
    assert.ok(target);
    const plan = planPageShellMove({ layout, visibleShellIds: layout.order, sourceId: "b", target, packedPositions });
    assert.equal(plan.valid, true);
    if (plan.valid) {
      layout = plan.layout;
      const repacked = positionsFor(layout.order, sizes, layout.placements);
      assert.equal(getPageShellStructuralRowStart("a", layout, repacked), getPageShellStructuralRowStart("b", layout, repacked));
      assert.equal(getPageShellStructuralRowStart("b", layout, repacked), getPageShellStructuralRowStart("c", layout, repacked));
      assert.equal(layout.placements?.b?.rowOffsetSteps, 4);
    }
  };

  move("left");
  assert.deepEqual(layout.order, ["b", "a", "c"]);
  move("right");
  assert.deepEqual(layout.order, ["a", "b", "c"]);
  move("right");
  assert.deepEqual(layout.order, ["a", "c", "b"]);
  move("left");
  assert.deepEqual(layout.order, ["a", "b", "c"]);
  const finalPositions = positionsFor(layout.order, sizes, layout.placements);
  assert.equal(getPageShellDirectionalMoveTarget({ direction: "right", layout, packedPositions: finalPositions, sourceId: "c", visibleShellIds: layout.order }), null);
});

test("full-width arrows remain structural rows, while centered standalone shells keep Center", () => {
  const fullOrder = ["full", "below"];
  const fullSizes = sizesFor({ full: 12, below: 12 });
  const fullPlacements = { full: { columnStart: 1 }, below: { columnStart: 1 } };
  const fullLayout = { order: fullOrder, placements: fullPlacements, sizes: fullSizes };
  const fullPositions = positionsFor(fullOrder, fullSizes, fullPlacements);
  const fullUp = getPageShellDirectionalMoveTarget({ direction: "up", layout: fullLayout, packedPositions: fullPositions, sourceId: "below", visibleShellIds: fullOrder });
  const fullDown = getPageShellDirectionalMoveTarget({ direction: "down", layout: fullLayout, packedPositions: fullPositions, sourceId: "full", visibleShellIds: fullOrder });
  assert.equal(fullUp?.targetId, "full");
  assert.equal(fullDown?.targetId, "below");
  assert.equal(getPageShellDirectionalMoveTarget({ direction: "left", layout: fullLayout, packedPositions: fullPositions, sourceId: "full", visibleShellIds: fullOrder }), null);
  assert.equal(getPageShellDirectionalMoveTarget({ direction: "right", layout: fullLayout, packedPositions: fullPositions, sourceId: "full", visibleShellIds: fullOrder }), null);
  const fullPlan = fullDown && planPageShellMove({ layout: fullLayout, visibleShellIds: fullOrder, sourceId: "full", target: fullDown, packedPositions: fullPositions });
  assert.equal(fullPlan?.valid, true);
  if (fullPlan?.valid) assert.equal(fullPlan.layout.sizes.full.span, 12);
  const unmarkedFullPlan = fullDown && planPageShellMove({
    layout: fullLayout,
    visibleShellIds: fullOrder,
    sourceId: "full",
    target: { ...fullDown, structuralRow: undefined },
    packedPositions: fullPositions,
  });
  assert.equal(unmarkedFullPlan?.valid, true);

  const centeredOrder = ["above", "center", "below"];
  const centeredSizes = sizesFor({ above: 12, center: 5, below: 12 });
  const centeredPlacements = { above: { columnStart: 1 }, center: { columnStart: 4, mode: "centered" as const }, below: { columnStart: 1 } };
  const centeredLayout = { order: centeredOrder, placements: centeredPlacements, sizes: centeredSizes };
  const centeredPositions = positionsFor(centeredOrder, centeredSizes, centeredPlacements);
  const centeredTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout: centeredLayout, packedPositions: centeredPositions, sourceId: "center", visibleShellIds: centeredOrder });
  assert.equal(centeredTarget?.targetId, "above");
  assert.equal(centeredTarget?.mode, "centered");
  assert.equal(centeredTarget?.columnStart, 4);
  assert.equal(getPageShellDirectionalMoveTarget({ direction: "left", layout: centeredLayout, packedPositions: centeredPositions, sourceId: "center", visibleShellIds: centeredOrder }), null);
  const centeredPlan = centeredTarget && planPageShellMove({ layout: centeredLayout, visibleShellIds: centeredOrder, sourceId: "center", target: centeredTarget, packedPositions: centeredPositions });
  assert.equal(centeredPlan?.valid, true);
  if (centeredPlan?.valid) assert.equal(centeredPlan.layout.placements?.center?.mode, "centered");
});

test("invalid directional plans stay unchanged while valid arrow moves retain downstream reflow", () => {
  const invalidOrder = ["above-a", "above-b", "above-c", "source"];
  const invalidSizes = sizesFor({ "above-a": 4, "above-b": 4, "above-c": 4, source: 8 });
  const invalidPlacements = {
    "above-a": { columnStart: 1 },
    "above-b": { columnStart: 5 },
    "above-c": { columnStart: 9 },
    source: { columnStart: 1 },
  };
  const invalidLayout = { order: invalidOrder, placements: invalidPlacements, sizes: invalidSizes };
  const invalidPositions = positionsFor(invalidOrder, invalidSizes, invalidPlacements);
  const invalidTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout: invalidLayout, packedPositions: invalidPositions, sourceId: "source", visibleShellIds: invalidOrder });
  assert.equal(invalidTarget?.targetId, "above-a");
  const invalidPlan = invalidTarget && planPageShellMove({ layout: invalidLayout, visibleShellIds: invalidOrder, sourceId: "source", target: invalidTarget, packedPositions: invalidPositions });
  assert.equal(invalidPlan?.valid, false);
  if (invalidPlan && !invalidPlan.valid) assert.equal(invalidPlan.reason, "ROW_WIDTH_EXCEEDED");
  assert.deepEqual(invalidLayout.order, invalidOrder);

  const reflowOrder = ["a", "b", "source", "downstream"];
  const reflowSizes = sizesFor({ a: 4, b: 4, source: 4, downstream: 12 }, { source: 480, a: 144, b: 144, downstream: 144 });
  const reflowPlacements = { a: { columnStart: 1 }, b: { columnStart: 5 }, source: { columnStart: 1 }, downstream: { columnStart: 1 } };
  const reflowLayout = { order: reflowOrder, placements: reflowPlacements, sizes: reflowSizes };
  const reflowPositions = positionsFor(reflowOrder, reflowSizes, reflowPlacements);
  const reflowTarget = getPageShellDirectionalMoveTarget({ direction: "up", layout: reflowLayout, packedPositions: reflowPositions, sourceId: "source", visibleShellIds: reflowOrder });
  assert.equal(reflowTarget?.targetId, "a");
  const reflowPlan = reflowTarget && planPageShellMove({ layout: reflowLayout, visibleShellIds: reflowOrder, sourceId: "source", target: reflowTarget, packedPositions: reflowPositions });
  assert.equal(reflowPlan?.valid, true);
  if (reflowPlan?.valid) {
    const after = positionsFor(reflowPlan.layout.order, reflowPlan.layout.sizes, reflowPlan.layout.placements);
    assert.ok(after.downstream.rowStart > after.source.rowStart);
    assert.equal(after.source.columnSpan, 4);
  }
});

test("planned row width failure reports the actual maximum and leaves no candidate", () => {
  const order = ["aa", "ab", "ac", "ba", "bb"];
  const sizes = sizesFor({ aa: 4, ab: 4, ac: 4, ba: 5, bb: 7 });
  const placements = {
    aa: { columnStart: 1 },
    ab: { columnStart: 5 },
    ac: { columnStart: 9 },
    ba: { columnStart: 1 },
    bb: { columnStart: 6 },
  };
  const layout = { order, placements, sizes };
  const before = JSON.stringify(layout);
  const plan = planPageShellMove({
    layout,
    visibleShellIds: order,
    sourceId: "bb",
    target: { columnStart: 5, insertionIndex: 1, laneOrder: 0, relationship: "replace", targetId: "ab" },
    packedPositions: positionsFor(order, sizes, placements),
  });
  assert.equal(plan.valid, false);
  assert.equal(JSON.stringify(layout), before);
  if (!plan.valid) {
    assert.equal(plan.reason, "ROW_WIDTH_EXCEEDED");
    assert.equal(plan.maxWidth, 4);
    assert.equal(plan.targetRowWidth, 15);
    assert.match(plan.message, /4\/12/);
  }
});

test("a valid tall same-row reorder allows a later row to reflow downward", () => {
  const order = ["source", "left", "target", "downstream"];
  const sizes = sizesFor(
    { source: 4, left: 4, target: 4, downstream: 12 },
    { source: 480, left: 144, target: 144, downstream: 144 },
  );
  const placements = {
    source: { columnStart: 1 },
    left: { columnStart: 5 },
    target: { columnStart: 9 },
    downstream: { columnStart: 1 },
  };
  const layout = { order, placements, sizes };
  const packedPositions = positionsFor(order, sizes, placements);
  const originalDownstream = packedPositions.downstream;
  packedPositions.downstream = { ...originalDownstream, rowStart: 2 };
  const plan = planPageShellMove({
    layout,
    visibleShellIds: order,
    sourceId: "source",
    target: { columnStart: 9, insertionIndex: 2, laneOrder: 0, relationship: "right", targetId: "target" },
    packedPositions,
  });
  assert.equal(plan.valid, true);
  if (!plan.valid) return;
  const repacked = positionsFor(plan.layout.order, plan.layout.sizes, plan.layout.placements);
  assert.deepEqual(plan.layout.order, ["left", "target", "source", "downstream"]);
  assert.equal(repacked.source.columnStart, 9);
  assert.equal(repacked.source.rowStart, repacked.left.rowStart);
  assert.equal(repacked.target.columnStart, 5);
  assert.ok(repacked.downstream.rowStart > repacked.source.rowStart);
  assert.equal(repacked.downstream.columnStart, 1);
  assert.equal(repacked.downstream.columnSpan, 12);
});

test("cross-row swap validates both rows and valid cross-row placement remains exact", () => {
  const invalidOrder = ["aa", "ab", "ac", "ba", "bb"];
  const invalidSizes = sizesFor({ aa: 4, ab: 4, ac: 4, ba: 5, bb: 7 });
  const invalidPlacements = {
    aa: { columnStart: 1 },
    ab: { columnStart: 5 },
    ac: { columnStart: 9 },
    ba: { columnStart: 1 },
    bb: { columnStart: 6 },
  };
  const invalidLayout = { order: invalidOrder, placements: invalidPlacements, sizes: invalidSizes };
  const invalid = planPageShellMove({
    layout: invalidLayout,
    visibleShellIds: invalidOrder,
    sourceId: "bb",
    target: { columnStart: 5, insertionIndex: 1, laneOrder: 0, relationship: "replace", targetId: "ab" },
    packedPositions: positionsFor(invalidOrder, invalidSizes, invalidPlacements),
  });
  assert.equal(invalid.valid, false);

  const order = ["aa", "ab", "boundary", "source"];
  const sizes = sizesFor({ aa: 4, ab: 4, boundary: 12, source: 4 });
  const placements = { aa: { columnStart: 1 }, ab: { columnStart: 5 }, boundary: { columnStart: 1 }, source: { columnStart: 9 } };
  const layout = { order, placements, sizes };
  const plan = planPageShellMove({
    layout,
    visibleShellIds: order,
    sourceId: "source",
    target: { columnStart: 5, insertionIndex: 1, laneOrder: 0, relationship: "replace", targetId: "ab" },
    packedPositions: positionsFor(order, sizes, placements),
  });
  assert.equal(plan.valid, true);
  if (plan.valid) {
    assert.deepEqual(plan.layout.order, ["aa", "source", "boundary", "ab"]);
    assert.equal(plan.layout.sizes.source.span, 4);
    assert.deepEqual(plan.layout.placements?.boundary, placements.boundary);
    assert.equal(packPageShellLayout(plan.layout.order, plan.layout.sizes, { placements: plan.layout.placements }).source.rowStart, 1);
    assert.equal(packPageShellLayout(plan.layout.order, plan.layout.sizes, { placements: plan.layout.placements }).ab.rowStart, 83);
  }
});

test("a valid tall cross-row swap permits multiple downstream rows to reflow without changing X placement", () => {
  const order = ["target", "peer", "source", "other", "later", "final"];
  const sizes = sizesFor(
    { target: 4, peer: 8, source: 4, other: 8, later: 12, final: 12 },
    { target: 144, peer: 144, source: 480, other: 144, later: 144, final: 144 },
  );
  const placements = {
    target: { columnStart: 1 },
    peer: { columnStart: 5 },
    source: { columnStart: 1 },
    other: { columnStart: 5 },
    later: { columnStart: 1 },
    final: { columnStart: 1 },
  };
  const layout = { order, placements, sizes };
  const before = positionsFor(order, sizes, placements);
  const plan = planPageShellMove({
    layout,
    visibleShellIds: order,
    sourceId: "source",
    target: { columnStart: 1, insertionIndex: 0, laneOrder: 0, relationship: "replace", targetId: "target" },
    packedPositions: before,
  });
  assert.equal(plan.valid, true);
  if (!plan.valid) return;
  const after = positionsFor(plan.layout.order, plan.layout.sizes, plan.layout.placements);
  assert.deepEqual(plan.layout.order, ["source", "peer", "target", "other", "later", "final"]);
  assert.equal(after.source.columnStart, before.target.columnStart);
  assert.equal(after.source.rowStart, after.peer.rowStart);
  assert.equal(after.target.columnStart, before.source.columnStart);
  assert.equal(after.other.columnStart, before.other.columnStart);
  assert.equal(after.other.columnSpan, before.other.columnSpan);
  assert.ok(after.target.rowStart > before.target.rowStart);
  assert.ok(after.other.rowStart > before.other.rowStart);
  assert.ok(after.later.rowStart > after.other.rowStart);
  assert.ok(after.final.rowStart > after.later.rowStart);
  assert.equal(after.later.columnStart, before.later.columnStart);
  assert.equal(after.final.columnStart, before.final.columnStart);
});

test("invalid direct insertion and vertical collision never fall back to another row", () => {
  const order = ["source", "target"];
  const sizes = sizesFor({ source: 8, target: 7 });
  const placements = { source: { columnStart: 1 }, target: { columnStart: 6 } };
  const layout = { order, placements, sizes };
  const plan = planPageShellMove({
    layout,
    visibleShellIds: order,
    sourceId: "source",
    target: { columnStart: 6, insertionIndex: 1, laneOrder: 0, relationship: "right", targetId: "target" },
    packedPositions: positionsFor(order, sizes, placements),
  });
  assert.equal(plan.valid, false);
  if (!plan.valid) assert.equal(plan.reason, "ROW_WIDTH_EXCEEDED");

  const collisionOrder = ["source", "target", "peer"];
  const collisionSizes = sizesFor({ source: 5, target: 4, peer: 3 }, { source: 144, target: 144, peer: 480 });
  const collisionPlacements = { source: { columnStart: 1 }, target: { columnStart: 6 }, peer: { columnStart: 10 } };
  const collisionLayout = { order: collisionOrder, placements: collisionPlacements, sizes: collisionSizes };
  const collisionPlan = planPageShellMove({
    layout: collisionLayout,
    visibleShellIds: collisionOrder,
    sourceId: "source",
    target: { columnStart: 6, insertionIndex: 1, laneOrder: 0, relationship: "replace", targetId: "target" },
    packedPositions: positionsFor(collisionOrder, collisionSizes, collisionPlacements),
  });
  assert.equal(collisionPlan.valid, false);
  if (!collisionPlan.valid) assert.equal(collisionPlan.reason, "COLLISION");
});

test("Center plans are exact, odd Center remains special, and even Center stays ordinary", () => {
  const oddOrder = ["source", "other"];
  const oddSizes = sizesFor({ source: 5, other: 7 });
  const oddPlacements = { source: { columnStart: 1 }, other: { columnStart: 6 } };
  const oddLayout = { order: oddOrder, placements: oddPlacements, sizes: oddSizes };
  const oddPlan = planPageShellMove({
    layout: oddLayout,
    visibleShellIds: oddOrder,
    sourceId: "source",
    target: { columnStart: 4, insertionIndex: 0, laneOrder: 0, mode: "centered", targetId: null },
    packedPositions: positionsFor(oddOrder, oddSizes, oddPlacements),
  });
  assert.equal(oddPlan.valid, true);
  if (oddPlan.valid) assert.equal(oddPlan.layout.placements?.source?.mode, "centered");

  const evenSizes = sizesFor({ source: 4 });
  const evenLayout = { order: ["source"], placements: { source: { columnStart: 1 } }, sizes: evenSizes };
  const evenPlan = planPageShellMove({
    layout: evenLayout,
    visibleShellIds: ["source"],
    sourceId: "source",
    target: { columnStart: 5, insertionIndex: 0, laneOrder: 0, mode: "centered", targetId: null },
    packedPositions: positionsFor(["source"], evenSizes, evenLayout.placements),
  });
  assert.equal(evenPlan.valid, true);
  if (evenPlan.valid) assert.equal(evenPlan.layout.placements?.source?.mode, undefined);
});

test("vertical placement normalization is optional, non-negative, integral, and bounded", () => {
  assert.equal(normalizePageShellRowOffsetSteps(undefined), 0);
  assert.equal(normalizePageShellRowOffsetSteps("bad"), 0);
  assert.equal(normalizePageShellRowOffsetSteps(-4), 0);
  assert.equal(normalizePageShellRowOffsetSteps(2.6), 3);
  assert.equal(normalizePageShellRowOffsetSteps(999), PAGE_SHELL_MAX_VERTICAL_OFFSET_STEPS);
  assert.deepEqual(normalizePageShellPlacement({ columnStart: 1 }, 5), { columnStart: 1, laneOrder: 0 });
  assert.deepEqual(normalizePageShellPlacement({ columnStart: 1, rowOffsetSteps: -1 }, 5), { columnStart: 1, laneOrder: 0 });
  assert.deepEqual(normalizePageShellPlacement({ columnStart: 1, rowOffsetSteps: 3.4 }, 5), { columnStart: 1, laneOrder: 0, rowOffsetSteps: 3 });
  assert.equal(getPageShellPlacementRowOffsetSteps(undefined), 0);
  assert.equal(getPageShellPlacementRowOffsetSteps({ columnStart: 1, rowOffsetSteps: 4 }), 4);
});

test("vertical detents honor grab offset and magnetic top, center, and bottom alignment", () => {
  assert.equal(PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX, 12);
  assert.equal(getPageShellVerticalOffsetSteps(0, 0, 192, 384), 0);
  assert.equal(getPageShellVerticalOffsetSteps(12, 0, 192, 384), 1);
  assert.equal(getPageShellVerticalOffsetSteps(24, 0, 192, 384), 2);
  assert.equal(getPageShellVerticalOffsetSteps(96, 0, 192, 384), 8);
  assert.equal(getPageShellVerticalOffsetSteps(192, 0, 192, 384), 16);
  assert.equal(getPageShellVerticalOffsetSteps(-12, 0, 192, 384), 0);

  const order = ["source", "tall"];
  const sizes = sizesFor({ source: 4, tall: 8 }, { source: 192, tall: 384 });
  const placements = { source: { columnStart: 1 }, tall: { columnStart: 5 } };
  const positions = positionsFor(order, sizes, placements);
  const grid = { left: 0, width: 1200 };
  const geometries = geometriesFor(order, positions, grid).map((geometry) => geometry.id === "source"
    ? { ...geometry, bottom: geometry.top + 192 }
    : { ...geometry, bottom: geometry.top + 384 });
  const tallGeometry = geometries.find((geometry) => geometry.id === "tall");
  assert.ok(tallGeometry);
  const pointerX = tallGeometry.left + 20;
  const topDrop = getPageShellDropTarget(geometries, positions, order, "source", pointerX, tallGeometry.top + 30, grid, 20, placements, undefined, 30, undefined, "vertical");
  assert.equal(topDrop.relationship, "left");
  assert.equal(topDrop.rowOffsetSteps, 0);
  const centerDrop = getPageShellDropTarget(geometries, positions, order, "source", pointerX, tallGeometry.top + 126, grid, 20, placements, undefined, 30, undefined, "vertical");
  assert.equal(centerDrop.rowOffsetSteps, 8);
  const bottomDrop = getPageShellDropTarget(geometries, positions, order, "source", pointerX, tallGeometry.top + 222, grid, 20, placements, undefined, 30, undefined, "vertical");
  assert.equal(bottomDrop.rowOffsetSteps, 16);
});

test("horizontal drag intent preserves the source vertical offset", () => {
  const order = ["source", "target"];
  const sizes = sizesFor({ source: 4, target: 8 }, { source: 192, target: 384 });
  const placements = { source: { columnStart: 1, rowOffsetSteps: 4 }, target: { columnStart: 5 } };
  const positions = positionsFor(order, sizes, placements);
  const grid = { left: 0, width: 1200 };
  const targetGeometry = geometriesFor(order, positions, grid).find((geometry) => geometry.id === "target");
  assert.ok(targetGeometry);
  const pointerX = targetGeometry.left + 20;
  const horizontal = getPageShellDropTarget(geometriesFor(order, positions, grid), positions, order, "source", pointerX, targetGeometry.top + 180, grid, 20, placements, undefined, 0, undefined, "horizontal");
  const vertical = getPageShellDropTarget(geometriesFor(order, positions, grid), positions, order, "source", pointerX, targetGeometry.top + 180, grid, 20, placements, undefined, 0, undefined, "vertical");
  assert.equal(horizontal.relationship, "left");
  assert.equal(horizontal.rowOffsetSteps, 4);
  assert.equal(vertical.rowOffsetSteps, 15);
});

test("same-row vertical offsets remain side-by-side while intersecting tracks stay collision-safe", () => {
  const sizes = sizesFor({ short: 4, tall: 8, next: 12 }, { short: 192, tall: 384, next: 144 });
  const positions = positionsFor(["short", "tall", "next"], sizes, {
    short: { columnStart: 1, rowOffsetSteps: 8 },
    tall: { columnStart: 5 },
    next: { columnStart: 1 },
  });
  assert.equal(positions.short.columnStart, 1);
  assert.equal(positions.tall.columnStart, 5);
  assert.ok(positions.short.rowStart > positions.tall.rowStart);
  assert.ok(positions.next.rowStart > positions.short.rowStart);
  assert.ok(positions.next.rowStart >= positions.short.rowStart + positions.short.rowSpan);

  const intersecting = positionsFor(["first", "second"], sizesFor({ first: 6, second: 6 }, { first: 384, second: 192 }), {
    first: { columnStart: 1 },
    second: { columnStart: 1, rowOffsetSteps: 10 },
  });
  assert.ok(intersecting.second.rowStart >= intersecting.first.rowStart + intersecting.first.rowSpan);
});

test("left directional targeting keeps horizontal placement snapped beside the target", () => {
  const order = ["source", "neighbor"];
  const sizes = sizesFor({ source: 5, neighbor: 7 });
  const placements = { source: { columnStart: 1 }, neighbor: { columnStart: 6 } };
  const positions = positionsFor(order, sizes, placements);
  const grid = { left: 0, width: 1200 };
  const targetColumn = getPageShellGridColumnGeometry(grid, 6, 5);
  assert.ok(targetColumn);
  const target = getPageShellDropTargetForTest(order, placements, positions, targetColumn.left + 24, 80, grid, 24);
  assert.equal(target.relationship, "left");
  assert.equal(target.targetId, "neighbor");
  assert.equal(target.columnStart, 1);
  assert.equal(target.insertionIndex, 0);
  const placed = placePageShellAtDrop({ order, sizes, placements }, order, "source", target);
  assert.deepEqual(placed.order, order);
  assert.equal(placed.placements.source.columnStart, 1);
});

test("a drop beside an incompatible shell is rejected instead of packing below it", () => {
  const order = ["source", "neighbor"];
  const sizes = sizesFor({ source: 8, neighbor: 7 });
  const placements = { source: { columnStart: 1 }, neighbor: { columnStart: 6 } };
  const positions = positionsFor(order, sizes, placements);
  const grid = { left: 0, width: 1200 };
  const neighborColumn = getPageShellGridColumnGeometry(grid, 6, 8);
  assert.ok(neighborColumn);
  const geometries = geometriesFor(order, positions, grid);
  const target = getPageShellDropTarget(
    geometries,
    positions,
    order,
    "source",
    neighborColumn.left + 12,
    500,
    grid,
    12,
    placements,
  );
  const plan = planPageShellMove({
    layout: { order, sizes, placements },
    visibleShellIds: order,
    sourceId: "source",
    target,
    packedPositions: positions,
  });
  assert.equal(plan.valid, false);
  if (!plan.valid) assert.equal(plan.reason, "ROW_WIDTH_EXCEEDED");
});

test("center snap yields a normal middle grid placement when three four-column shells fit one row", () => {
  const order = ["left", "right", "source"];
  const sizes = sizesFor({ left: 4, right: 4, source: 4 });
  const placements = {
    left: { columnStart: 1 },
    right: { columnStart: 9 },
    source: { columnStart: 1 },
  };
  const positions = positionsFor(order, sizes, placements);
  const grid = { left: 0, width: 1200 };
  const middleColumn = getPageShellGridColumnGeometry(grid, 5, 4);
  assert.ok(middleColumn);
  const target = getPageShellDropTargetForTest(order, placements, positions, middleColumn.left + 24, 80, grid, 24);
  assert.equal(target.mode, undefined);
  assert.equal(target.columnStart, 5);
  const placed = placePageShellAtDrop({ order, sizes, placements }, order, "source", target);
  const repacked = packPageShellLayout(placed.order, sizes, { placements: placed.placements });
  assert.equal(repacked.left.rowStart, 1);
  assert.equal(repacked.source.rowStart, 1);
  assert.equal(repacked.right.rowStart, 1);
});

test("center snap does not turn an adjacent open-space drop into a row boundary", () => {
  const order = ["left", "source"];
  const sizes = sizesFor({ left: 4, source: 4 });
  const placements = {
    left: { columnStart: 1 },
    source: { columnStart: 1 },
  };
  const positions = positionsFor(order, sizes, placements);
  const grid = { left: 0, width: 1200 };
  const rightColumn = getPageShellGridColumnGeometry(grid, 5, 4);
  assert.ok(rightColumn);
  const target = getPageShellDropTargetForTest(order, placements, positions, rightColumn.left + 24, 80, grid, 24);
  assert.equal(target.mode, undefined);
  assert.equal(target.columnStart, 5);
  const placed = placePageShellAtDrop({ order, sizes, placements }, order, "source", target);
  const repacked = packPageShellLayout(placed.order, sizes, { placements: placed.placements });
  assert.equal(repacked.left.columnStart, 1);
  assert.equal(repacked.source.columnStart, 5);
  assert.equal(repacked.left.rowStart, repacked.source.rowStart);
});

function getPageShellDropTargetForTest(
  order: readonly string[],
  placements: Readonly<Record<string, PageShellPlacement>>,
  positions: Readonly<Record<string, PageShellPackedPosition>>,
  pointerX: number,
  pointerY: number,
  gridBounds: { left: number; width: number },
  grabOffsetX: number,
) {
  return getPageShellDropTarget(
    geometriesFor(order, positions, gridBounds),
    positions,
    order,
    "source",
    pointerX,
    pointerY,
    gridBounds,
    grabOffsetX,
    placements,
  );
}

test("even-width center snaps remain ordinary placements at exact integer starts", () => {
  const grid = { left: 0, width: 1200 };
  const expectedEvenStarts: Array<[PageShellSpan, number]> = [[4, 5], [6, 4], [8, 3], [10, 2], [12, 1]];
  expectedEvenStarts.forEach(([span, columnStart]) => {
    const order = ["source"];
    const sizes = sizesFor({ source: span });
    const placements = { source: { columnStart: 1 } };
    const positions = positionsFor(order, sizes, placements);
    const centered = getPageShellGridColumnGeometry(grid, columnStart, span);
    assert.ok(centered);
    const target = getPageShellDropTargetForTest(order, placements, positions, centered.left, 80, grid, 0);
    assert.equal(target.mode, undefined);
    assert.equal(target.columnStart, columnStart);
  });
  const placed = placePageShellAtDrop({
    order: ["source"],
    placements: { source: { columnStart: 1 } },
    sizes: sizesFor({ source: 4 }),
  }, ["source"], "source", {
    columnStart: 5,
    insertionIndex: 0,
    laneOrder: 0,
    mode: "centered",
    targetId: null,
  });
  assert.deepEqual(placed.placements?.source, { columnStart: 5, laneOrder: 0 });
  assert.equal(Math.abs(PAGE_SHELL_CENTER_SNAP_ZONE_PX - 48), 0);
});

test("odd-width standalone center snaps retain special Center mode", () => {
  const grid = { left: 0, width: 1200 };
  const expectedOddStarts: Array<[PageShellSpan, number]> = [[3, 5], [5, 4], [7, 3], [9, 2], [11, 1]];
  expectedOddStarts.forEach(([span, columnStart]) => {
    const order = ["source"];
    const sizes = sizesFor({ source: span });
    const placements = { source: { columnStart: 1 } };
    const positions = positionsFor(order, sizes, placements);
    const centered = getPageShellGridColumnGeometry(grid, columnStart, span);
    assert.ok(centered);
    const target = getPageShellDropTargetForTest(order, placements, positions, centered.left, 80, grid, 0);
    assert.equal(target.mode, "centered");
    assert.equal(target.columnStart, columnStart);
  });
});

test("centered mode persists through a centered drop and layout normalization", () => {
  const order = ["source", "other"];
  const sizes = sizesFor({ source: 5, other: 7 });
  const placements = { source: { columnStart: 1 }, other: { columnStart: 6 } };
  const positions = positionsFor(order, sizes, placements);
  const grid = { left: 0, width: 1200 };
  const centered = getPageShellGridColumnGeometry(grid, 4, 5);
  assert.ok(centered);
  const target = getPageShellDropTargetForTest(order, placements, positions, centered.left, 80, grid, 0);
  const placed = placePageShellAtDrop({ order, sizes, placements }, order, "source", target);
  assert.equal(placed.placements.source.mode, "centered");
  assert.equal(isPageShellCenteredPlacement(placed.placements.source), true);
  assert.equal(normalizePageShellLayout(placed, order, sizes).placements?.source?.mode, "centered");
});

test("dragging a centered shell away from the center clears centered mode", () => {
  const order = ["source", "other"];
  const sizes = sizesFor({ source: 5, other: 7 });
  const placements = { source: { columnStart: 4, mode: "centered" as const }, other: { columnStart: 6 } };
  const positions = positionsFor(order, sizes, placements);
  const grid = { left: 0, width: 1200 };
  const target = getPageShellDropTargetForTest(order, placements, positions, 20, 80, grid, 0);
  const placed = placePageShellAtDrop({ order, sizes, placements }, order, "source", target);
  assert.equal(target.mode, undefined);
  assert.equal(placed.placements.source.mode, undefined);
  assert.equal(placed.placements.source.columnStart, 1);
});

test("odd centered widths retain exact deterministic grid starts", () => {
  const sizes = sizesFor({ five: 5, seven: 7 });
  const positions = positionsFor(["five", "seven"], sizes, {
    five: { columnStart: 1, mode: "centered" },
    seven: { columnStart: 1, mode: "centered" },
  });
  assert.equal(positions.five.columnStart, 4);
  assert.equal(positions.seven.columnStart, 3);
});

test("width changes clamp normal preferred starts to the new legal edge", () => {
  assert.deepEqual(normalizePageShellPlacement({ columnStart: 8, laneOrder: 0 }, 7), { columnStart: 6, laneOrder: 0 });
  const positions = positionsFor(["shell"], sizesFor({ shell: 7 }), { shell: { columnStart: 8 } });
  assert.equal(positions.shell.columnStart, 6);
});

test("centered width changes preserve center mode and recalculate exact placement", () => {
  const placement = normalizePageShellPlacement({ columnStart: 8, mode: "centered" }, 7);
  assert.equal(placement.mode, "centered");
  const positions = positionsFor(["shell"], sizesFor({ shell: 7 }), { shell: placement });
  assert.equal(positions.shell.columnStart, 3);
});

test("legacy even Center placements normalize safely through width changes", () => {
  assert.deepEqual(
    normalizePageShellPlacement({ columnStart: 4, laneOrder: 2, mode: "centered", rowOffsetSteps: 8 }, 6),
    { columnStart: 4, laneOrder: 2 },
  );
  assert.deepEqual(
    normalizePageShellPlacement({ columnStart: 3, laneOrder: 2, mode: "centered" }, 8),
    { columnStart: 3, laneOrder: 2 },
  );
  assert.deepEqual(
    normalizePageShellPlacement({ columnStart: 4, laneOrder: 2, mode: "centered", rowOffsetSteps: 8 }, 7),
    { columnStart: 4, laneOrder: 2, mode: "centered" },
  );
  assert.deepEqual(
    normalizePageShellPlacement({ columnStart: 1, laneOrder: 2 }, 7),
    { columnStart: 1, laneOrder: 2 },
  );
  assert.match(shellSource, /clampPlacementForSpan[\s\S]*normalizePageShellPlacement\(placement, span\)/);
});

test("layout normalization preserves order, dimensions, and unrelated placements while clearing even Center", () => {
  const order = ["even", "odd", "other"];
  const sizes = sizesFor({ even: 4, odd: 5, other: 6 }, { even: 288, odd: 336, other: 192 });
  const normalized = normalizePageShellLayout({
    order,
    placements: {
      even: { columnStart: 1, laneOrder: 3, mode: "centered" },
      odd: { columnStart: 4, laneOrder: 2, mode: "centered" },
      other: { columnStart: 7, laneOrder: 1 },
    },
    sizes,
  }, order, sizes);
  assert.deepEqual(normalized.order, order);
  assert.deepEqual(normalized.sizes, sizes);
  assert.deepEqual(normalized.placements?.even, { columnStart: 5, laneOrder: 3 });
  assert.deepEqual(normalized.placements?.odd, { columnStart: 4, laneOrder: 2, mode: "centered" });
  assert.deepEqual(normalized.placements?.other, { columnStart: 7, laneOrder: 1 });
});

test("height changes preserve horizontal placement while repacking below shells", () => {
  const sizes = sizesFor({ first: 5, second: 7 }, { first: 144, second: 144 });
  const placements = { first: { columnStart: 1 }, second: { columnStart: 6 } };
  const short = positionsFor(["first", "second"], sizes, placements);
  const tall = positionsFor(["first", "second"], { ...sizes, first: { span: 5, heightPx: 600 } }, placements);
  assert.equal(short.second.columnStart, tall.second.columnStart);
  assert.equal(short.second.rowStart, tall.second.rowStart);
  const stacked = positionsFor(["first", "second"], sizesFor({ first: 12, second: 12 }, { first: 144, second: 144 }), {
    first: { columnStart: 1 },
    second: { columnStart: 1 },
  });
  const stackedTall = positionsFor(["first", "second"], sizesFor({ first: 12, second: 12 }, { first: 600, second: 144 }), {
    first: { columnStart: 1 },
    second: { columnStart: 1 },
  });
  assert.ok(stackedTall.second.rowStart > stacked.second.rowStart);
  assert.equal(stackedTall.second.columnStart, stacked.second.columnStart);
});

test("short-shell height, Natural, Shrink, and dimension formatting remain intact", () => {
  assert.equal(getPageShellShrinkHeight(96), 96);
  assert.equal(clampPageShellHeight(96, 96), null);
  assert.equal(snapPageShellHeight(220), 240);
  assert.equal(formatPageShellDimensions(5, null, 96), "W 5/12 · H 96px · Natural 96px");
  assert.equal(PAGE_SHELL_HEIGHT_SNAP, 48);
  assert.equal(PAGE_SHELL_MIN_HEIGHT, 144);
  assert.equal(PAGE_SHELL_MAX_HEIGHT, 1536);
});

test("the edit toolbar keeps direct manipulation controls and removes Column, Slot, and placement UI", () => {
  const markup = renderToStaticMarkup(createElement(PageShellLayoutControls, { layout: staticLayout(true) }));
  assert.match(markup, /Save View/);
  assert.match(markup, /Reset Layout/);
  assert.doesNotMatch(markup, /Col |Column|Slot|placement|slot/i);
  assert.doesNotMatch(markup, /Center row|Move .* (up|down)/i);
});

test("editable shell toolbars render all four directional controls inside the scrollable tools", () => {
  const markup = renderToStaticMarkup(createElement(
    ReorderablePageShells,
    { layout: staticLayout(true) },
    createElement(PageShell, { id: "conditional", label: "Conditional" }, "Conditional content"),
    createElement(PageShell, { id: "regular", label: "Regular" }, "Regular content"),
  ));
  assert.match(markup, /data-page-shell-movement-controls/);
  for (const label of ["Move Conditional up", "Move Conditional down", "Move Conditional left", "Move Conditional right", "Move Regular up", "Move Regular down", "Move Regular left", "Move Regular right"]) {
    assert.match(markup, new RegExp(`aria-label="${label}"`));
  }
  assert.match(shellSource, /ArrowLeft/);
  assert.match(shellSource, /ArrowRight/);
  assert.match(shellSource, /aria-label=\{`\$\{shell\.label\} movement controls`\}/);
});

test("directional arrow actions use the normal planner and warning path", () => {
  const moveStart = shellSource.indexOf("  function moveShellDirection");
  const moveEnd = shellSource.indexOf("\n  function clampPlacementForSpan", moveStart);
  assert.ok(moveStart >= 0);
  assert.ok(moveEnd > moveStart);
  const moveSource = shellSource.slice(moveStart, moveEnd);
  assert.match(moveSource, /getPageShellDirectionalMoveTarget\(/);
  assert.match(moveSource, /planPageShellMove\(/);
  assert.match(moveSource, /layout\.beginPreview\(startLayout\)/);
  assert.match(moveSource, /layout\.setPreviewOrder\(plan\.layout\.order\)/);
  assert.match(moveSource, /layout\.setPreviewPlacements\(plan\.layout\.placements \?\? \{\}\)/);
  assert.match(moveSource, /showDragMoveWarning\(plan\.message\)/);
});

test("the toolbar keeps fixed identity and horizontally scrollable tool regions", () => {
  const markup = renderToStaticMarkup(createElement(PageShellLayoutControls, { layout: staticLayout(true) }));
  assert.match(shellSource, /data-page-shell-layout-identity/);
  assert.match(shellSource, /data-page-shell-layout-tools-scroll/);
  assert.match(shellSource, /data-page-shell-layout-tools/);
  assert.match(markup, /Reset Layout/);
});

test("Natural display and resize handles remain in the production toolbar source", () => {
  assert.match(shellSource, /Natural/);
  assert.match(shellSource, /Resize \$\{shell.label\} width/);
  assert.match(shellSource, /Resize \$\{shell.label\}/);
  assert.match(shellSource, /setPreviewSizes/);
  assert.match(shellSource, /setPreviewPlacements/);
});

test("legacy lane and semantic helper state is absent from the editor", () => {
  assert.doesNotMatch(shellSource, /getPageShellColumnOptions|movePageShellToColumn|movePageShellToSlot|movePageShellOneLane/);
  assert.doesNotMatch(shellSource, /slotDrafts|openColumnShellId|columnMenuPosition|createPortal/);
  assert.doesNotMatch(shellSource, /Center row|Column A|Column B|Column C/);
});

test("Water canonical defaults render the intended 5/7 composition", () => {
  const canonical = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Water;
  const positions = positionsFor(canonical.order, canonical.sizes, canonical.placements);
  assert.equal(canonical.placements?.["water-log"]?.columnStart, 1);
  assert.equal(canonical.placements?.["water-pending"]?.columnStart, 6);
  assert.equal(sameRow(positions, "water-log", "water-pending"), true);
  assert.ok(positions["water-today"].rowStart > positions["water-pending"].rowStart);
});

test("Food canonical defaults render the intended 7/5 composition", () => {
  const canonical = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Food;
  const positions = positionsFor(canonical.order, canonical.sizes, canonical.placements);
  assert.equal(canonical.placements?.["food-meal-log"]?.columnStart, 1);
  assert.equal(canonical.placements?.["food-daily-totals"]?.columnStart, 8);
  assert.equal(sameRow(positions, "food-meal-log", "food-daily-totals"), true);
  assert.ok(positions["food-favorites-recent"].rowStart > positions["food-daily-totals"].rowStart);
});

test("Reset Layout still resolves to the coded canonical layout", () => {
  const canonical = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Water;
  const reset = normalizePageShellLayout(null, canonical.order, canonical.sizes, {}, canonical.placements);
  assert.deepEqual(reset.order, [...canonical.order]);
  assert.equal(reset.placements?.["water-log"]?.columnStart, 1);
  assert.equal(reset.placements?.["water-pending"]?.columnStart, 6);
  assert.equal(reset.placements?.["water-log"]?.rowIndex, 0);
  assert.equal(reset.placements?.["water-log"]?.rowOffsetSteps ?? 0, 0);
});

test("saved Views restore snapped starts and centered modes", () => {
  const store = storage();
  const key = getPageShellViewsStorageKey("user-views");
  const canonical = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Water;
  const layout = canonicalEditLayout(canonical);
  layout.placements = {
    ...layout.placements,
    "water-log": { columnStart: 4, rowIndex: 0, rowOffsetSteps: 5 },
    "water-pending": { columnStart: 6, rowIndex: 0, mode: "centered" },
  };
  const view = createPageShellView({
    id: "view-grid",
    createdAt: "2026-09-05T12:00:00.000Z",
    layout,
    name: "Grid",
    pageKey: "health:water",
    presentation: "custom",
    target: "web",
    viewport: { height: 900, width: 1440 },
  });
  writePageShellView(store, key, view);
  const saved = readPageShellViews(store, key, "health:water")[0];
  assert.equal(saved.layout?.placements?.["water-log"]?.columnStart, 4);
  assert.equal(saved.layout?.placements?.["water-log"]?.rowIndex, 0);
  assert.equal(saved.layout?.placements?.["water-log"]?.rowOffsetSteps, 5);
  assert.equal(resolvePageShellViewLayout(saved, canonical).layout.placements?.["water-pending"]?.mode, "centered");
  assert.equal(resolvePageShellViewLayout(saved, canonical).layout.placements?.["water-log"]?.rowOffsetSteps, 5);
});

test("saved Views normalize legacy even Center placements while retaining odd Center", () => {
  const store = storage();
  const key = getPageShellViewsStorageKey("user-legacy-even-center");
  const order = ["four", "five"];
  const sizes = sizesFor({ four: 4, five: 5 });
  const view = createPageShellView({
    createdAt: "2026-09-05T12:00:00.000Z",
    id: "view-legacy-even-center",
    layout: {
      order,
      placements: {
        four: { columnStart: 1, mode: "centered" },
        five: { columnStart: 4, mode: "centered" },
      },
      sizes,
    },
    name: "Legacy Center",
    pageKey: "test:legacy-center",
    presentation: "custom",
    target: "web",
    viewport: { height: 900, width: 1440 },
  });
  writePageShellView(store, key, view);
  const saved = readPageShellViews(store, key, "test:legacy-center")[0];
  assert.deepEqual(saved.layout?.placements?.four, { columnStart: 5, laneOrder: 0 });
  assert.deepEqual(saved.layout?.placements?.five, { columnStart: 4, laneOrder: 0, mode: "centered" });
});

test("export and import preserve snapped placement data", () => {
  const store = storage();
  const layoutKey = getPageShellLayoutStorageKey("user-export");
  const canonical = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Water;
  const layout = canonicalEditLayout(canonical);
  layout.placements = { ...layout.placements, "water-log": { columnStart: 3, rowIndex: 0, rowOffsetSteps: 7 } };
  writePageShellLayout(store, layoutKey, "health:water", layout);
  const exported = buildPageShellLayoutExport({
    appVersion: "7.12.99",
    currentLayout: layout,
    currentPageKey: "health:water",
    currentPresentation: "custom",
    exportedAt: "2026-09-05T12:00:00.000Z",
    registeredPages: [{ pageKey: "health:water", canonicalLayout: canonical }],
    storage: store,
    storageKey: layoutKey,
  });
  assert.equal(exported.schema, PAGE_SHELL_EXPORT_SCHEMA);
  assert.equal(exported.schemaVersion, PAGE_SHELL_EXPORT_SCHEMA_VERSION);
  const imported = exported.pages[0].layout;
  assert.equal(imported?.placements?.["water-log"]?.columnStart, 3);
  assert.equal(imported?.placements?.["water-log"]?.rowIndex, 0);
  assert.equal(imported?.placements?.["water-log"]?.rowOffsetSteps, 7);
  assert.equal(normalizePageShellLayout(imported, canonical.order, canonical.sizes).placements?.["water-log"]?.columnStart, 3);
  assert.equal(normalizePageShellLayout(imported, canonical.order, canonical.sizes).placements?.["water-log"]?.rowIndex, 0);
  assert.equal(normalizePageShellLayout(imported, canonical.order, canonical.sizes).placements?.["water-log"]?.rowOffsetSteps, 7);
});

test("view and layout storage keys retain their existing v1 namespaces", () => {
  assert.match(getPageShellLayoutStorageKey("u"), /adhdice-page-shell-layout-v1:u/);
  assert.match(getPageShellViewsStorageKey("u"), /adhdice-page-shell-views-v1:u/);
  assert.equal(PAGE_SHELL_VIEWS_SCHEMA_VERSION, 1);
});

test("narrow presentation remains a single-column flow without horizontal overflow", () => {
  assert.match(globalSource, /\.page-shell-packed[\s\S]*grid-template-columns:\s*repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(globalSource, /grid-column:\s*1\s*\/\s*-1/);
  assert.match(globalSource, /min-width:\s*0/);
  assert.match(shellSource, /overflow-x-auto/);
});

test("packed placement uses the shared 12-column geometry and direct order-first model", () => {
  assert.match(layoutSource, /preferred snapped 12-column grid start/);
  assert.match(layoutSource, /Order is the[\s\S]*vertical packing authority/);
  assert.match(layoutSource, /getPageShellGridStartFromPointer/);
  assert.match(shellSource, /getPageShellDropTarget/);
  assert.match(layoutSource, /PAGE_SHELL_PACKING_GAP_PX/);
  assert.equal(PAGE_SHELL_PACKING_GAP_PX, 20);
  assert.equal(PAGE_SHELL_PACKING_ROW_UNIT_PX, 4);
});

test("7.12.110 keeps the legacy packer, planner, drag, and hydration authorities unchanged", () => {
  const order = ["left", "right", "full"];
  const sizes = sizesFor({ left: 5, right: 7, full: 12 });
  const legacy = positionsFor(order, sizes, {
    left: { columnStart: 1 },
    right: { columnStart: 6 },
    full: { columnStart: 1 },
  });
  const explicit = positionsFor(order, sizes, {
    left: { columnStart: 1, rowIndex: 4 },
    right: { columnStart: 6, rowIndex: 4 },
    full: { columnStart: 1, rowIndex: 9 },
  });
  assert.deepEqual(explicit, legacy);
  const packStart = layoutSource.indexOf("export function packPageShellLayout");
  const packEnd = layoutSource.indexOf("\nexport function normalizePageShellSpan", packStart);
  assert.doesNotMatch(layoutSource.slice(packStart, packEnd), /rowIndex/);
  assert.doesNotMatch(hookSource, /inferPageShellRowsFromPackedLayout/);
});

test("pointer lifecycle and drag auto-scroll contracts remain intact", () => {
  assert.equal(isPageShellPointerMatch(4, 4), true);
  assert.equal(isPageShellPointerMatch(4, 5), false);
  assert.equal(isStalePageShellMouseMove("mouse", 0), true);
  assert.equal(isStalePageShellMouseMove("touch", 0), false);
  assert.equal(getPageShellDragAutoScrollDelta(20, 800, 100, 2000) < 0, true);
  assert.equal(getPageShellDragAutoScrollDelta(790, 800, 0, 2000) > 0, true);
  assert.equal(PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX, 80);
  assert.equal(PAGE_SHELL_DRAG_AUTO_SCROLL_MAX_PX, 18);
});

test("move preview keeps the pointer-down reference frame and commits order and placement only on release", () => {
  const previewStart = shellSource.indexOf("  function updateMovePreview");
  const commitStart = shellSource.indexOf("  function commitMovePreview");
  const commitEnd = shellSource.indexOf("  function cancelMovePreview");
  assert.ok(previewStart >= 0);
  assert.ok(commitStart > previewStart);
  assert.ok(commitEnd > commitStart);
  const previewSource = shellSource.slice(previewStart, commitStart);
  const commitSource = shellSource.slice(commitStart, commitEnd);

  assert.match(shellSource, /const referenceFrame = captureMoveReferenceFrame\(\);/);
  assert.match(shellSource, /referenceGeometries: referenceFrame\.referenceGeometries/);
  assert.match(shellSource, /referenceGridBounds: referenceFrame\.referenceGridBounds/);
  assert.match(shellSource, /referencePackedPositions: referenceFrame\.referencePackedPositions/);
  assert.match(shellSource, /referenceVisibleOrder: referenceFrame\.referenceVisibleOrder/);
  assert.doesNotMatch(previewSource, /captureMoveReferenceFrame|captureShellGeometry|captureShellGridBounds|packPageShellLayout/);
  assert.doesNotMatch(previewSource, /placePageShellAtDrop|setPreviewOrder|setPreviewPlacements/);
  assert.match(previewSource, /planPageShellMove\([\s\S]*interaction\.startLayout/);
  assert.match(commitSource, /interaction\.plan\?\.valid/);
  assert.equal((commitSource.match(/setPreviewOrder/g) ?? []).length, 1);
  assert.equal((commitSource.match(/setPreviewPlacements/g) ?? []).length, 1);
  assert.match(shellSource, /const previousInsertionIndex = interaction\.target\?\.insertionIndex \?\? interaction\.targetIndex/);
  assert.match(shellSource, /grabOffsetY: sourceGeometry \? event\.clientY \+ getPageScrollTop\(\) - sourceGeometry\.top : 0/);
  assert.match(shellSource, /interaction\.grabOffsetY/);
  assert.match(shellSource, /resolvePageShellDragAxisIntent\(/);
  assert.match(shellSource, /startPointerX: event\.clientX/);
  assert.match(shellSource, /startPointerY: event\.clientY/);
  assert.match(previewSource, /interaction\.axisIntent \?\? "horizontal"/);
  assert.match(shellSource, /interaction\.target/);
});

test("directional drag feedback is target-aware and non-destructive", () => {
  assert.match(layoutSource, /type PageShellDropRelationship = "before" \| "after" \| "left" \| "right" \| "replace"/);
  assert.match(layoutSource, /export function planPageShellMove/);
  assert.match(shellSource, /data-page-shell-drop-relationship/);
  assert.match(shellSource, /data-page-shell-drop-target/);
  assert.match(shellSource, /planPageShellMove\(/);
  assert.match(shellSource, /dragIndicator\.valid === false/);
  assert.match(shellSource, /data-page-shell-move-warning/);
  assert.match(shellSource, /ring-2 ring-\[#6f57f6\]\/55/);
  assert.match(shellSource, /ring-2 ring-\[#d65775\]/);
  assert.match(shellSource, /pointer-events-none/);
  assert.match(layoutSource, /target\.relationship === "replace"/);
  assert.match(layoutSource, /nextVisibleOrder\[sourceIndex\] = target\.targetId/);
});

test("drop targeting passes the previous insertion index into the existing hysteresis", () => {
  const order = ["source", "first", "second"];
  const positions: Record<string, PageShellPackedPosition> = {
    source: { columnSpan: 12, columnStart: 1, rowSpan: 1, rowStart: 1 },
    first: { columnSpan: 12, columnStart: 1, rowSpan: 1, rowStart: 2 },
    second: { columnSpan: 12, columnStart: 1, rowSpan: 1, rowStart: 3 },
  };
  const geometries: PageShellGeometry[] = [
    { bottom: 160, id: "source", left: 0, right: 1200, top: 0 },
    { bottom: 380, id: "first", left: 0, right: 1200, top: 220 },
    { bottom: 600, id: "second", left: 0, right: 1200, top: 440 },
  ];
  const candidate = getPageShellDropTarget(geometries, positions, order, "source", 20, 300);
  const stabilized = getPageShellDropTarget(geometries, positions, order, "source", 20, 300, undefined, 0, {}, 0);
  assert.equal(candidate.relationship, "left");
  assert.equal(candidate.targetId, "first");
  assert.equal(candidate.insertionIndex, 0);
  assert.equal(stabilized.insertionIndex, 0);
  assert.equal(stabilized.relationship, "left");
});

test("successful pointer-up uses release coordinates while cancelled paths preserve no partial destination", () => {
  const endStart = shellSource.indexOf("  function endInteraction");
  const effectStart = shellSource.indexOf("\n  useEffect", endStart);
  assert.ok(endStart >= 0);
  assert.ok(effectStart > endStart);
  const endSource = shellSource.slice(endStart, effectStart);
  assert.match(endSource, /let shouldCommitPreview = !cancelled && event !== null;/);
  assert.match(endSource, /if \(!cancelled && interaction\.kind === "move" && event\) \{[\s\S]*updateMovePreview\(interaction, event\.clientX, event\.clientY\);\s*shouldCommitPreview = commitMovePreview\(interaction\);/);
  assert.doesNotMatch(endSource, /updateMovePreview\(interaction, interaction\.pointerX, interaction\.pointerY\)/);
  assert.match(endSource, /if \(cancelled \|\| !shouldCommitPreview\) layout\.cancelPreview\(\);\s*else layout\.commitPreview\(\);/);
  assert.match(shellSource, /onPointerCancel=\{\(event\) => endInteraction\(event, true\)\}/);
  assert.match(shellSource, /onLostPointerCapture=\{\(event\) => endInteraction\(event, true\)\}/);
  assert.match(shellSource, /const handleWindowBlur = \(\) => endInteractionRef\.current\(null, true\)/);
  assert.match(shellSource, /pointerY \+ getPageScrollTop\(\)/);
  assert.match(shellSource, /window\.scrollTo\(\{ behavior: "auto", top: nextScrollTop \}\)/);
});

test("width and height resize paths remain separate from move preview mechanics", () => {
  assert.match(shellSource, /function beginResize\(event/);
  assert.match(shellSource, /function beginWidthResize\(event/);
  assert.match(shellSource, /interaction\.kind === "width-resize"/);
  assert.match(shellSource, /interaction\.initialHeight \+ \(event\.clientY - interaction\.startY\)/);
  assert.match(shellSource, /layout\.setPreviewSizes/);
  assert.match(shellSource, /layout\.setPreviewPlacements/);
});

test("shared shell surface and body preserve the scrolling content boundary", () => {
  const surface = renderToStaticMarkup(createElement(PageShellSurface, null, createElement(PageShellBody, null, "content")));
  assert.match(surface, /page-shell-surface/);
  assert.match(surface, /page-shell-body/);
  assert.match(surface, /overflow-hidden/);
  assert.match(surface, /adhdice-scrollbar/);
});

test("center snap hysteresis remains a small intentional drag zone", () => {
  assert.equal(PAGE_SHELL_CENTER_SNAP_ZONE_PX, 48);
  assert.equal(PAGE_SHELL_CENTER_SNAP_HYSTERESIS_PX, 16);
  assert.match(layoutSource, /centerSnapZone/);
  assert.match(layoutSource, /sourceIsCentered/);
});

test("insertion geometry continues to derive vertical order from pointer Y", () => {
  const order = ["a", "b", "c"];
  const sizes = sizesFor({ a: 6, b: 6, c: 12 });
  const positions = positionsFor(order, sizes, {
    a: { columnStart: 1 },
    b: { columnStart: 7 },
    c: { columnStart: 1 },
  });
  const geometries = geometriesFor(order, positions);
  assert.equal(getPageShellInsertionIndex(geometries, order, "c", 20, 10), 0);
  assert.equal(getPageShellInsertionIndex(geometries, order, "c", 20, 1000), 2);
});

test("the hook keeps placement compatibility fields while using direct grid interpretation", () => {
  assert.match(hookSource, /canonicalPlacementsKey/);
  assert.match(hookSource, /columnStart/);
  assert.match(hookSource, /laneOrder/);
  assert.match(hookSource, /normalizePageShellLayout/);
  assert.doesNotMatch(hookSource, /getPageShellColumnSlot|movePageShellToColumn|slotDraft/);
});

test("no SQL or schema migration is involved in the direct placement change", () => {
  assert.doesNotMatch(layoutSource, /CREATE TABLE|ALTER TABLE|supabase/);
  assert.equal(PAGE_SHELL_EXPORT_SCHEMA_VERSION, 1);
  assert.equal(PAGE_SHELL_VIEWS_SCHEMA_VERSION, 1);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS,
  PAGE_SHELL_CENTER_SNAP_HYSTERESIS_PX,
  PAGE_SHELL_CENTER_SNAP_ZONE_PX,
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
  createPageShellView,
  formatPageShellDimensions,
  getHealthPageShellKey,
  getPageShellDragAutoScrollDelta,
  getPageShellDropTarget,
  getPageShellGridColumnGeometry,
  getPageShellGridStartFromPointer,
  getPageShellPlacementRowOffsetSteps,
  getPageShellInsertionIndex,
  getPageShellLayoutStorageKey,
  getPageShellViewsStorageKey,
  getPageShellShrinkHeight,
  getPageShellVerticalOffsetSteps,
  hasPageShellLayout,
  isPageShellCenteredPlacement,
  normalizePageShellLayout,
  normalizePageShellPlacement,
  normalizePageShellRowOffsetSteps,
  normalizePageShellSize,
  packPageShellLayout,
  placePageShellAtDrop,
  readPageShellLayout,
  readPageShellViews,
  resolvePageShellDropRelationship,
  resolvePageShellViewLayout,
  snapPageShellHeight,
  writePageShellLayout,
  writePageShellView,
} from "@/lib/page-shell-layout";
import {
  isPageShellPointerMatch,
  isStalePageShellMouseMove,
  PageShellBody,
  PageShellLayoutControls,
  PageShellSurface,
} from "@/components/ui-system/reorderable-page-shells";
import type {
  PageShellCanonicalLayout,
  PageShellGeometry,
  PageShellLayoutPreference,
  PageShellPlacement,
  PageShellPackedPosition,
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
  const topDrop = getPageShellDropTarget(geometries, positions, order, "source", pointerX, tallGeometry.top + 30, grid, 20, placements, undefined, 30);
  assert.equal(topDrop.relationship, "left");
  assert.equal(topDrop.rowOffsetSteps, 0);
  const centerDrop = getPageShellDropTarget(geometries, positions, order, "source", pointerX, tallGeometry.top + 126, grid, 20, placements, undefined, 30);
  assert.equal(centerDrop.rowOffsetSteps, 8);
  const bottomDrop = getPageShellDropTarget(geometries, positions, order, "source", pointerX, tallGeometry.top + 222, grid, 20, placements, undefined, 30);
  assert.equal(bottomDrop.rowOffsetSteps, 16);
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

test("a drop beside an incompatible shell packs below it", () => {
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
  const placed = placePageShellAtDrop({ order, sizes, placements }, order, "source", target);
  const repacked = packPageShellLayout(placed.order, sizes, { placements: placed.placements });
  assert.equal(repacked.source.rowStart, 1);
  assert.ok(repacked.neighbor.rowStart > repacked.source.rowStart);
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
  assert.equal(reset.placements?.["water-log"]?.rowOffsetSteps ?? 0, 0);
});

test("saved Views restore snapped starts and centered modes", () => {
  const store = storage();
  const key = getPageShellViewsStorageKey("user-views");
  const canonical = HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS.Water;
  const layout = canonicalEditLayout(canonical);
  layout.placements = {
    ...layout.placements,
    "water-log": { columnStart: 4, rowOffsetSteps: 5 },
    "water-pending": { columnStart: 6, mode: "centered" },
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
  layout.placements = { ...layout.placements, "water-log": { columnStart: 3, rowOffsetSteps: 7 } };
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
  assert.equal(imported?.placements?.["water-log"]?.rowOffsetSteps, 7);
  assert.equal(normalizePageShellLayout(imported, canonical.order, canonical.sizes).placements?.["water-log"]?.columnStart, 3);
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
  assert.match(commitSource, /placePageShellAtDrop\([\s\S]*interaction\.startLayout/);
  assert.equal((commitSource.match(/setPreviewOrder/g) ?? []).length, 1);
  assert.equal((commitSource.match(/setPreviewPlacements/g) ?? []).length, 1);
  assert.match(shellSource, /const previousInsertionIndex = interaction\.target\?\.insertionIndex \?\? interaction\.targetIndex/);
  assert.match(shellSource, /grabOffsetY: sourceGeometry \? event\.clientY \+ getPageScrollTop\(\) - sourceGeometry\.top : 0/);
  assert.match(shellSource, /interaction\.grabOffsetY/);
  assert.match(shellSource, /interaction\.target/);
});

test("directional drag feedback is target-aware and non-destructive", () => {
  assert.match(layoutSource, /type PageShellDropRelationship = "before" \| "after" \| "left" \| "right" \| "replace"/);
  assert.match(shellSource, /data-page-shell-drop-relationship/);
  assert.match(shellSource, /data-page-shell-drop-target/);
  assert.match(shellSource, /ring-2 ring-\[#6f57f6\]\/55/);
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
  assert.equal(candidate.relationship, "replace");
  assert.equal(candidate.targetId, "first");
  assert.equal(candidate.insertionIndex, 0);
  assert.equal(stabilized.insertionIndex, 0);
  assert.equal(stabilized.relationship, "replace");
});

test("successful and cancelled pointer lifecycle paths preserve one commit or no partial destination", () => {
  const endStart = shellSource.indexOf("  function endInteraction");
  const effectStart = shellSource.indexOf("\n  useEffect", endStart);
  assert.ok(endStart >= 0);
  assert.ok(effectStart > endStart);
  const endSource = shellSource.slice(endStart, effectStart);
  assert.match(endSource, /updateMovePreview\(interaction, interaction\.pointerX, interaction\.pointerY\);\s*commitMovePreview\(interaction\);/);
  assert.match(endSource, /if \(cancelled\) layout\.cancelPreview\(\);\s*else layout\.commitPreview\(\);/);
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

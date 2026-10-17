import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  getSortableListDragAutoScrollDelta,
  getSortableListDragAutoScrollTarget,
  getSortableListDragPreviewTop,
  getSortableListDropIndicatorTop,
  getSortableListReorderCommit,
  getSortableListVisibleScrollBounds,
  SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX,
  SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX,
} from "../src/lib/list-reorder.ts";

const viewport = {
  clientHeight: 400,
  scrollHeight: 1200,
  viewportBottom: 500,
  viewportTop: 100,
};

test("SortableList intersects owner, viewport, and clipping ancestor boundaries", () => {
  assert.deepEqual(getSortableListVisibleScrollBounds({
    clipBounds: [{ bottom: 650, top: 150 }],
    scrollPortBottom: 900,
    scrollPortTop: 80,
    viewportBottom: 800,
    viewportTop: 0,
  }), { bottom: 650, top: 150 });
  assert.equal(getSortableListVisibleScrollBounds({
    clipBounds: [{ bottom: 100, top: 200 }],
    scrollPortBottom: 900,
    scrollPortTop: 80,
    viewportBottom: 800,
    viewportTop: 0,
  }), null);
});

test("SortableList auto-scrolls upward and downward at visible boundaries", () => {
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 499, scrollTop: 0 }), SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX);
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 101, scrollTop: 100 }), -SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX);
  const clipped = { ...viewport, viewportBottom: 650, viewportTop: 150 };
  assert.equal(getSortableListDragAutoScrollDelta({ ...clipped, pointerY: 150, scrollTop: 100 }), -SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX);
  assert.equal(getSortableListDragAutoScrollDelta({ ...clipped, pointerY: 650, scrollTop: 0 }), SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX);
});

test("SortableList does not auto-scroll outside edge zones or beyond scroll limits", () => {
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 300, scrollTop: 100 }), 0);
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 490, scrollTop: 800 }), 0);
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 110, scrollTop: 0 }), 0);
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 10, scrollTop: 100 }), 0);
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 490, scrollHeight: 400, scrollTop: 0 }), 0);
});

test("SortableList chooses an outer scroll owner when the inner owner is at its limit", () => {
  const candidates = [
    {
      bounds: { bottom: 500, top: 100 },
      clientHeight: 400,
      scrollHeight: 1200,
      scrollTop: 800,
    },
    {
      bounds: { bottom: 700, top: 50 },
      clientHeight: 650,
      scrollHeight: 1800,
      scrollTop: 0,
    },
  ];
  assert.deepEqual(getSortableListDragAutoScrollTarget(candidates, 690), { delta: 16, index: 1 });

  candidates[0]!.scrollTop = 0;
  candidates[1]!.scrollTop = 900;
  assert.deepEqual(getSortableListDragAutoScrollTarget(candidates, 60), { delta: -16, index: 1 });
});

test("SortableList cancels auto-scroll targeting at the active owner limits", () => {
  const atBottom = [{
    bounds: { bottom: 500, top: 100 },
    clientHeight: 400,
    scrollHeight: 1200,
    scrollTop: 800,
  }];
  const atTop = [{ ...atBottom[0]!, scrollTop: 0 }];
  assert.equal(getSortableListDragAutoScrollTarget(atBottom, 490), null);
  assert.equal(getSortableListDragAutoScrollTarget(atTop, 110), null);
});

test("SortableList keeps the floating preview anchored to pointer viewport coordinates", () => {
  assert.equal(getSortableListDragPreviewTop(320, 24), 296);
});

test("SortableList drop indicator follows the insertion slot without moving rows", () => {
  const rows = [
    { bottom: 50, top: 10 },
    { bottom: 100, top: 60 },
    { bottom: 150, top: 110 },
  ];
  assert.equal(getSortableListDropIndicatorTop({ rows, sourceIndex: 1, targetIndex: 0 }), 6);
  assert.equal(getSortableListDropIndicatorTop({ rows, sourceIndex: 1, targetIndex: 1 }), 106);
  assert.equal(getSortableListDropIndicatorTop({ rows, sourceIndex: 1, targetIndex: 2 }), 154);
});

test("SortableList persists a valid reorder and preserves drop-zone insertion context", () => {
  assert.deepEqual(getSortableListReorderCommit({
    active: true,
    cancelled: false,
    dropZoneId: null,
    items: ["urgent-a", "urgent-b", "urgent-c"],
    sourceIndex: 0,
    targetIndex: 2,
  }), {
    context: { dropZoneId: null, sourceIndex: 0, targetIndex: 2 },
    items: ["urgent-b", "urgent-c", "urgent-a"],
  });
  assert.deepEqual(getSortableListReorderCommit({
    active: true,
    cancelled: false,
    dropZoneId: "day-2",
    items: ["task-a", "task-b"],
    sourceIndex: 0,
    targetIndex: 0,
  })?.context, { dropZoneId: "day-2", sourceIndex: 0, targetIndex: 0 });
});

test("SortableList does not commit inactive, cancelled, or unchanged unzoned drags", () => {
  const base = {
    dropZoneId: null,
    items: ["task-a", "task-b"],
    sourceIndex: 0,
    targetIndex: 0,
  };
  assert.equal(getSortableListReorderCommit({ ...base, active: false, cancelled: false }), null);
  assert.equal(getSortableListReorderCommit({ ...base, active: true, cancelled: true }), null);
  assert.equal(getSortableListReorderCommit({ ...base, active: true, cancelled: false }), null);
});

test("SortableList recalculates drop targeting after scroll and cleans up drag ownership", () => {
  const source = readFileSync(new URL("../src/components/ui/sortable-list.tsx", import.meta.url), "utf8");
  assert.match(source, /owner\.scrollTop =/);
  assert.match(source, /processPointerMove\(pointerY\);/);
  assert.match(source, /window\.cancelAnimationFrame\(autoScrollFrameRef\.current\)/);
  assert.match(source, /window\.cancelAnimationFrame\(frameRef\.current\)/);
  assert.match(source, /releasePointerCapture\(captured\.pointerId\)/);
  assert.match(source, /if \(event\.key === "Escape"\) cancelDrag\(\)/);
  assert.match(source, /onPointerCancel=\{\(event\) => finish\(event\.pointerId, true\)\}/);
  assert.match(source, /onLostPointerCapture=\{\(event\) => finish\(event\.pointerId, true\)\}/);
  assert.match(source, /if \(event\.pointerType === "mouse"\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*setPointerCapture/);
  assert.match(source, /window\.setTimeout\(\(\) => \{[\s\S]*active: true[\s\S]*\}, 350\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => cancelDrag\(\), \[cancelDrag\]\)/);
  assert.match(source, /document\.scrollingElement/);
  assert.match(source, /getVisibleScrollBounds\(owner\)/);
  assert.match(source, /createPortal\([\s\S]*document\.body/);
  assert.match(source, /getSortableListDragPreviewTop\(drag\.pointerY, drag\.pointerOffsetY\)/);
  assert.match(source, /getSortableListDropIndicatorTop\(/);
  assert.match(source, /onReorder\(commit\.items, commit\.context\)/);
  assert.doesNotMatch(source, /my-2 flex min-h-14/);
  assert.equal(SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX, 80);
});

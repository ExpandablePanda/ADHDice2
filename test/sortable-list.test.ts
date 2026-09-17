import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  getSortableListDragAutoScrollDelta,
  SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX,
  SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX,
} from "../src/lib/list-reorder.ts";

const viewport = {
  clientHeight: 400,
  scrollHeight: 1200,
  viewportBottom: 500,
  viewportTop: 100,
};

test("SortableList auto-scrolls the nearest owner toward the bottom edge", () => {
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 499, scrollTop: 0 }), SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX);
});

test("SortableList auto-scrolls the nearest owner toward the top edge", () => {
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 101, scrollTop: 100 }), -SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX);
});

test("SortableList does not auto-scroll away from the edge zones", () => {
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 300, scrollTop: 100 }), 0);
});

test("SortableList auto-scroll stops at either scroll boundary", () => {
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 490, scrollTop: 800 }), 0);
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 110, scrollTop: 0 }), 0);
});

test("SortableList ignores owners without vertical overflow", () => {
  assert.equal(getSortableListDragAutoScrollDelta({ ...viewport, pointerY: 490, scrollHeight: 400, scrollTop: 0 }), 0);
});

test("SortableList recalculates drop state after scrolling and cancels its loop", () => {
  const source = readFileSync(new URL("../src/components/ui/sortable-list.tsx", import.meta.url), "utf8");
  assert.match(source, /owner\.scrollTop =/);
  assert.match(source, /if \(owner\.scrollTop === previousScrollTop\) return;/);
  assert.match(source, /processPointerMove\(pointerY\);/);
  assert.match(source, /window\.cancelAnimationFrame\(autoScrollFrameRef\.current\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => cancelDrag\(\), \[cancelDrag\]\)/);
  assert.equal(SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX, 80);
});

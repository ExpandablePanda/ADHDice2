import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER,
  normalizeTestIosTaskDetailTileOrder,
  reorderTestIosTaskDetailTiles,
  reorderTestIosTaskDetailTilesByInsertionIndex,
} from "../src/components/task-app/test-ios-task-detail.tsx";

const source = readFileSync(new URL("../src/components/task-app/test-ios-task-detail.tsx", import.meta.url), "utf8");

test("iOS Task Detail exposes the canonical 3x3 metadata order", () => {
  assert.deepEqual(TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER, [
    "priority",
    "repeat",
    "estimate",
    "streak",
    "last-done",
    "steps",
    "pursuit",
    "tags",
    "history",
  ]);
});

test("tile-order normalization rejects malformed values, removes duplicates, and appends known tiles", () => {
  assert.deepEqual(normalizeTestIosTaskDetailTileOrder(null), [...TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER]);
  assert.deepEqual(
    normalizeTestIosTaskDetailTileOrder(["history", "unknown", "history", 42, "priority"]),
    ["history", "priority", "repeat", "estimate", "streak", "last-done", "steps", "pursuit", "tags"],
  );
  assert.equal(new Set(normalizeTestIosTaskDetailTileOrder(["priority", "priority"])).size, 9);
});

test("row-major tile moves preserve all IDs and repack predictably", () => {
  assert.deepEqual(
    reorderTestIosTaskDetailTilesByInsertionIndex(["priority", "repeat", "estimate", "streak"], "streak", 2),
    ["priority", "repeat", "streak", "estimate", "last-done", "steps", "pursuit", "tags", "history"],
  );
  assert.deepEqual(
    reorderTestIosTaskDetailTiles(TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER, "steps", "tags"),
    ["priority", "repeat", "estimate", "streak", "last-done", "pursuit", "tags", "steps", "history"],
  );
  assert.deepEqual(
    reorderTestIosTaskDetailTiles(TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER, "priority", "priority"),
    [...TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER],
  );
});

test("prototype keeps the hero outside the reorderable grid and includes the long-press escape path", () => {
  assert.match(source, />Call UGI</);
  assert.match(source, /Today · 2:00 PM/);
  assert.match(source, />In Progress</);
  assert.match(source, /className=\{`mt-4 grid grid-cols-3 gap-2/);
  assert.match(source, /LONG_PRESS_DELAY_MS = 350/);
  assert.match(source, /PRE_ACTIVATION_MOVE_THRESHOLD_PX = 8/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /pointercancel/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /TEST_IOS_TASK_DETAIL_TILE_ORDER_STORAGE_KEY/);
  assert.match(source, /Reset Layout/);
});

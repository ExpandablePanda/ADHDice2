import assert from "node:assert/strict";
import test from "node:test";
import {
  getComfortableTaskHistoryScrollOffset,
  getTaskHistoryInitialFocusDateKey,
} from "../src/lib/task-history-calendar-focus.ts";

test("task history focus prefers an explicitly selected date and otherwise uses today", () => {
  assert.equal(getTaskHistoryInitialFocusDateKey({ initialDateKey: "2026-07-04", todayDateKey: "2026-07-12" }), "2026-07-04");
  assert.equal(getTaskHistoryInitialFocusDateKey({ initialDateKey: null, todayDateKey: "2026-07-12" }), "2026-07-12");
});

test("task history focus centers the target in a three-row mobile viewport", () => {
  assert.equal(getComfortableTaskHistoryScrollOffset({ containerSize: 300, targetOffset: 560, targetSize: 36 }), 428);
  assert.equal(getComfortableTaskHistoryScrollOffset({ containerSize: 120, targetOffset: 560, targetSize: 36 }), 518);
  assert.equal(getComfortableTaskHistoryScrollOffset({ containerSize: 300, targetOffset: 10, targetSize: 36 }), 0);
});

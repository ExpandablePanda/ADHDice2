import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getComfortableTaskHistoryScrollOffset,
  getTaskHistoryInitialFocusDateKey,
} from "../src/lib/task-history-calendar-focus.ts";

const modalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const taskHistoryModalSource = modalSource.slice(modalSource.indexOf("export function TaskHistoryModal"));
const focusEffectSource = taskHistoryModalSource.slice(
  taskHistoryModalSource.indexOf("  useEffect(() => {"),
  taskHistoryModalSource.indexOf("\n\n  if (taskHistoryLoadStatus !== \"ready\")"),
);

test("task history focus prefers an explicitly selected date and otherwise uses today", () => {
  assert.equal(getTaskHistoryInitialFocusDateKey({ initialDateKey: "2026-07-04", todayDateKey: "2026-07-12" }), "2026-07-04");
  assert.equal(getTaskHistoryInitialFocusDateKey({ initialDateKey: null, todayDateKey: "2026-07-12" }), "2026-07-12");
});

test("task history focus centers the target in a three-row mobile viewport", () => {
  assert.equal(getComfortableTaskHistoryScrollOffset({ containerSize: 300, targetOffset: 560, targetSize: 36 }), 428);
  assert.equal(getComfortableTaskHistoryScrollOffset({ containerSize: 120, targetOffset: 560, targetSize: 36 }), 518);
  assert.equal(getComfortableTaskHistoryScrollOffset({ containerSize: 300, targetOffset: 10, targetSize: 36 }), 0);
});

test("task history date-strip focus makes no scroll attempt while History is loading", () => {
  const loadingGuard = focusEffectSource.indexOf('if (taskHistoryLoadStatus !== "ready")');
  const animationFrame = focusEffectSource.indexOf("window.requestAnimationFrame");
  assert.ok(loadingGuard >= 0 && loadingGuard < animationFrame);
  assert.match(focusEffectSource, /if \(taskHistoryLoadStatus !== "ready"\) \{\s*return;/);
});

test("task history date-strip focus scrolls the selected date when readiness becomes ready", () => {
  assert.match(focusEffectSource, /window\.requestAnimationFrame/);
  assert.match(focusEffectSource, /data-history-date=\"\$\{initialFocusDate\}\"/);
  assert.match(focusEffectSource, /container\.scrollTo\(/);
  assert.match(focusEffectSource, /taskHistoryLoadStatus/);
});

test("reopening a cached task keeps the ready-on-mount date-strip focus path", () => {
  assert.match(taskHistoryModalSource, /taskHistoryLoadStatus = "ready"/);
  assert.match(focusEffectSource, /return \(\) => window\.cancelAnimationFrame\(frame\)/);
  assert.match(focusEffectSource, /taskHistoryLoadStatus/);
});

test("switching tasks retriggers date-strip focus from the selected task ID", () => {
  assert.match(focusEffectSource, /\}, \[initialFocusDate, task\.id, taskHistoryLoadStatus\]\);/);
});

test("later History mutations do not retrigger date-strip focus", () => {
  assert.equal(
    focusEffectSource.match(/\}, \[[^\]]+\]\);/)?.[0],
    "}, [initialFocusDate, task.id, taskHistoryLoadStatus]);",
  );
});

test("History Calendar warning is bound to the shared due-date set", () => {
  const dueDateSelection = taskHistoryModalSource.indexOf("const selectedIsDue = dueDates.has(selectedDate);");
  const warningCopy = taskHistoryModalSource.indexOf("This date is outside the inferred due schedule");

  assert.ok(dueDateSelection >= 0);
  assert.ok(warningCopy > dueDateSelection);
  assert.match(taskHistoryModalSource, /buildTaskHistoryCalendarDueDateSet\(task, days\[0\]/);
});

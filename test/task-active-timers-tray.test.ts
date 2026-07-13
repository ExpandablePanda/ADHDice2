import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getTaskTimerDisplaySeconds } from "../src/hooks/useTaskTimers.ts";

const runningTimer = {
  baseSeconds: 90,
  pausedAt: null,
  startedActualSeconds: 60,
  startedAt: 1_000,
  taskId: "task-1",
  title: "Shop",
};

test("task timer elapsed counts focused running time and excludes paused time", () => {
  assert.equal(getTaskTimerDisplaySeconds(runningTimer, 31_500), 120);
  assert.equal(getTaskTimerDisplaySeconds({ ...runningTimer, pausedAt: 11_000 }, 31_500), 100);
});

test("active timers tray keeps auto-open tied to a successful local start", async () => {
  const source = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const startTimerSource = source.slice(
    source.indexOf("async function startHudTaskTimer"),
    source.indexOf("function pauseHudTaskTimer"),
  );
  assert.match(source, /const started = await persistTaskTimer\(/);
  assert.match(source, /if \(started\) \{\s*setIsActiveTimersTrayOpen\(true\);/);
  assert.doesNotMatch(startTimerSource, /useEffect/);
});

test("tray uses the shared actual-time handoff and the dedicated delete-only discard action", async () => {
  const [appSource, hookSource, listSource, tableSource, traySource] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useTaskTimers.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/task-active-timers-tray.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /source: "task_timer"/);
  assert.match(hookSource, /async function discardTaskTimer/);
  assert.match(hookSource, /discardTaskTimer,/);
  assert.match(tableSource, /if \(onDiscardTaskTimer\) \{\s*onDiscardTaskTimer\(taskId\);/);
  assert.match(traySource, /aria-expanded=\{isOpen\}/);
  assert.match(traySource, /createPortal\(/);
  assert.match(listSource, /TaskTimerStateChip onClick=\{\(\) => openQuickPanel\(task\.id, "actual"\)\} timer=\{runningTimerByTaskId\.get\(task\.id\)!\}/);
  assert.match(traySource, /Discard \{formatElapsed\(unsavedSeconds\)\}/);
  assert.match(appSource, /view: current\.view === "list" \? "list" : "table"/);
  assert.match(appSource, /setRequestedListOverlayTaskId\(taskId\)/);
  assert.doesNotMatch(tableSource, /setLocalTimerNow\(Date\.now\(\)\);\s*}, 1000\)/);
});

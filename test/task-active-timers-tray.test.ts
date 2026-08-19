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
  assert.match(hookSource, /async function discardTaskTimer/);
  assert.match(hookSource, /discardTaskTimer,/);
  assert.match(tableSource, /if \(onDiscardTaskTimer\) \{\s*onDiscardTaskTimer\(taskId\);/);
  assert.match(traySource, /aria-expanded=\{isOpen\}/);
  assert.match(traySource, /createPortal\(/);
  assert.match(listSource, /TaskTimerStateChip onClick=\{\(\) => openQuickPanel\(task\.id, "actual"\)\} timer=\{runningTimerByTaskId\.get\(task\.id\)!\}/);
  assert.match(traySource, /Discard \{formatElapsed\(unsavedSeconds\)\}/);
  const goToTaskSource = appSource.slice(appSource.indexOf("function goToActiveTimerTask"), appSource.indexOf("function cycleHudTaskTimer"));
  const sharedOpenerSource = appSource.slice(appSource.indexOf("function openSharedTaskEditor"), appSource.indexOf("function goToActiveTimerTask"));
  assert.match(traySource, />Open task<\/TaskTableChipButton>/);
  assert.doesNotMatch(traySource, /Go to Task/);
  assert.match(goToTaskSource, /openSharedTaskEditor\(taskId, \{ preserveActivePage: true, timer \}\)/);
  assert.match(goToTaskSource, /if \(openSharedTaskEditor[\s\S]*setIsActiveTimersTrayOpen\(false\)/);
  assert.match(sharedOpenerSource, /text: "Task unavailable\."/);
  assert.match(sharedOpenerSource, /if \(!task \|\| task\.status === "trashed" \|\| task\.status === "archived" \|\| occurrenceIsClearlyStale\) \{[\s\S]*return false;/);
  assert.doesNotMatch(sharedOpenerSource, /setActivePage/);
  assert.match(sharedOpenerSource, /setSharedTaskEditorOverlayTaskId\(taskId\)/);
  assert.doesNotMatch(goToTaskSource, /tasksSurface|view:|setRequestedListOverlayTaskId|highlight|scroll|pause|resume|stop|discard|evidence/i);
  assert.match(traySource, /onClick=\{\(\) => onGoToTask\(timer\.taskId\)\}/);
  assert.doesNotMatch(tableSource, /setLocalTimerNow\(Date\.now\(\)\);\s*}, 1000\)/);
});

test("terminal task actions record active timer seconds before the canonical action", async () => {
  const [appSource, hookSource] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useTaskTimers.ts", import.meta.url), "utf8"),
  ]);
  const updateStatusSource = appSource.slice(appSource.indexOf("async function updateTaskStatus"), appSource.indexOf("async function toggleTaskPinned"));
  const completeSource = appSource.slice(appSource.indexOf("async function confirmPendingTaskComplete"), appSource.indexOf("function buildTaskStatusUpdate"));
  assert.match(updateStatusSource, /status === "done" \|\| status === "did_my_best"/);
  assert.match(updateStatusSource, /stageTimedTaskCompletion/);
  assert.match(completeSource, /stageTimedTaskCompletion\(task, \{ kind: "complete" \}, completeAction\.onTimeOrigin\)/);
  assert.match(appSource, /const stoppedTimer = await persistStoppedTaskTimer\(task\.id\)/);
  assert.match(appSource, /async function recordStoppedTaskTimer/);
  assert.match(appSource, /actual_seconds: nextActualSeconds/);
  assert.doesNotMatch(appSource, /adhdice_task_actual_time_entries|TaskActualTimeEntry|evidence_saved_awaiting_completion/);
  assert.doesNotMatch(hookSource, /restoreStoppedTaskTimer/);
});

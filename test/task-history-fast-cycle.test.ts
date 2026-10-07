import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createTaskHistoryFastCycleController,
  getNextTaskHistoryFastCycleAction,
  getTaskHistoryFastCycleActionLabel,
  getTaskHistoryFastCycleActions,
  getTaskHistoryFastCycleCurrentAction,
  TASK_HISTORY_FAST_CYCLE_DELAY_MS,
  TASK_HISTORY_FAST_CYCLE_ORDER,
  type TaskHistoryFastCyclePending,
} from "../src/lib/task-history-fast-cycle.ts";

const adapterSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const presentationSource = readFileSync(new URL("../src/components/task-app/task-history-calendar-presentation.tsx", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const engineTypesSource = readFileSync(new URL("../src/lib/task-state-engine/types.ts", import.meta.url), "utf8");

function fakeTimerHarness() {
  let activeCallback: (() => void) | null = null;
  let lastDelay = 0;
  let clearCount = 0;
  return {
    clearCount: () => clearCount,
    clearTimer: () => {
      clearCount += 1;
    },
    getCallback: () => activeCallback,
    getDelay: () => lastDelay,
    setTimer: (callback: () => void, delayMs: number) => {
      activeCallback = callback;
      lastDelay = delayMs;
      return 1 as ReturnType<typeof setTimeout>;
    },
  };
}

function pending(action: TaskHistoryFastCyclePending["action"]): TaskHistoryFastCyclePending {
  return { action, dateKey: "2026-10-05", taskId: "task-1" };
}

test("fast-cycle order is exact, excludes Automatic, and waits 5 seconds", () => {
  assert.deepEqual(TASK_HISTORY_FAST_CYCLE_ORDER, [
    "in_progress",
    "done",
    "did_my_best",
    "delayed",
    "missed",
    "complete",
    "blank",
    "not_due",
    "due",
  ]);
  assert.deepEqual(getTaskHistoryFastCycleActions({
    canClear: true,
    calendarActionStatuses: ["done", "did_my_best", "delayed", "missed", "complete"],
    calendarOverrideActions: ["blank_due", "not_due", "due_open"],
  }), [...TASK_HISTORY_FAST_CYCLE_ORDER]);
  assert.equal(TASK_HISTORY_FAST_CYCLE_DELAY_MS, 5_000);
  assert.equal(getTaskHistoryFastCycleActionLabel("in_progress"), "In Progress");
  assert.equal(getTaskHistoryFastCycleActionLabel("complete"), "Complete");
});

test("calculated states use an internal null position and visible states advance in locked order", () => {
  const actions = [...TASK_HISTORY_FAST_CYCLE_ORDER];
  assert.equal(getTaskHistoryFastCycleCurrentAction({ sourceKind: "calculated", state: "open" }), null);
  assert.equal(getNextTaskHistoryFastCycleAction(actions, null), "in_progress");
  for (let index = 0; index < actions.length; index += 1) {
    const current = actions[index]!;
    const next = actions[(index + 1) % actions.length]!;
    assert.equal(getNextTaskHistoryFastCycleAction(actions, current), next, current);
  }
  assert.equal(getTaskHistoryFastCycleCurrentAction({ calendarOverrideState: "in_progress", sourceKind: "calendar_override" }), "in_progress");
  assert.equal(getTaskHistoryFastCycleCurrentAction({ entryStatus: "delayed", sourceKind: "history_fact" }), "delayed");
  assert.equal(getTaskHistoryFastCycleCurrentAction({ entryStatus: "complete", sourceKind: "history_fact" }), "complete");
});

test("controller debounces repeated clicks and writes only the final idle selection once", async () => {
  const timer = fakeTimerHarness();
  const calls: TaskHistoryFastCyclePending[] = [];
  const pendingStates: Array<TaskHistoryFastCyclePending | null> = [];
  const controller = createTaskHistoryFastCycleController({
    commit: async (next) => {
      calls.push(next);
      return true;
    },
    onPendingChange: (next) => pendingStates.push(next),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  controller.schedule(pending("in_progress"));
  controller.schedule(pending("done"));
  controller.schedule(pending("did_my_best"));
  assert.equal(timer.getDelay(), 5_000);
  timer.getCallback()?.();
  await controller.flush();
  assert.deepEqual(calls.map((call) => call.action), ["did_my_best"]);
  assert.equal(pendingStates.at(-1), null);
});

test("controller survives Strict Mode setup-cleanup-setup replay and commits after reactivation", async () => {
  const timer = fakeTimerHarness();
  const calls: TaskHistoryFastCyclePending[] = [];
  const pendingStates: Array<TaskHistoryFastCyclePending | null> = [];
  const controller = createTaskHistoryFastCycleController({
    commit: async (next) => {
      calls.push(next);
      return true;
    },
    onPendingChange: (next) => pendingStates.push(next),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  controller.activate();
  controller.dispose();
  controller.activate();
  controller.schedule(pending("in_progress"));
  assert.equal(timer.getDelay(), TASK_HISTORY_FAST_CYCLE_DELAY_MS);
  timer.getCallback()?.();

  assert.equal(await controller.flush(), true);
  assert.deepEqual(calls.map((call) => call.action), ["in_progress"]);
  assert.equal(pendingStates.at(-1), null);
});

test("disposed controller rejects scheduling, reactivation does not restore stale pending work, and stale timers stay fenced", async () => {
  const timer = fakeTimerHarness();
  const calls: TaskHistoryFastCyclePending[] = [];
  const pendingStates: Array<TaskHistoryFastCyclePending | null> = [];
  const controller = createTaskHistoryFastCycleController({
    commit: async (next) => {
      calls.push(next);
      return true;
    },
    onPendingChange: (next) => pendingStates.push(next),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  controller.dispose();
  controller.schedule(pending("done"));
  assert.deepEqual(pendingStates, []);

  controller.activate();
  controller.schedule(pending("done"));
  const staleTimer = timer.getCallback();
  controller.dispose();
  controller.activate();
  controller.schedule(pending("did_my_best"));
  assert.equal(pendingStates.at(-1)?.action, "did_my_best");
  staleTimer?.();
  timer.getCallback()?.();

  assert.equal(await controller.flush(), true);
  assert.deepEqual(calls.map((call) => call.action), ["did_my_best"]);
  assert.equal(pendingStates.at(-1), null);
});

test("generation fencing keeps a stale pre-cancel timer from clearing the newer pending action", async () => {
  const timer = fakeTimerHarness();
  const calls: TaskHistoryFastCyclePending[] = [];
  const pendingStates: Array<TaskHistoryFastCyclePending | null> = [];
  const controller = createTaskHistoryFastCycleController({
    commit: async (next) => {
      calls.push(next);
      return true;
    },
    onPendingChange: (next) => pendingStates.push(next),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  controller.schedule(pending("done"));
  const staleTimer = timer.getCallback();
  controller.cancel();
  controller.schedule(pending("missed"));
  staleTimer?.();
  timer.getCallback()?.();

  assert.equal(await controller.flush(), true);
  assert.deepEqual(calls.map((call) => call.action), ["missed"]);
  assert.equal(pendingStates.at(-1), null);
});

test("failed commits clear the misleading pending preview", async () => {
  const timer = fakeTimerHarness();
  const pendingStates: Array<TaskHistoryFastCyclePending | null> = [];
  const controller = createTaskHistoryFastCycleController({
    commit: async () => false,
    onPendingChange: (next) => pendingStates.push(next),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  controller.schedule(pending("done"));
  timer.getCallback()?.();

  assert.equal(await controller.flush(), false);
  assert.equal(pendingStates.at(-1), null);
});

test("first click selects only, multi-select and future dates remain outside cycling", () => {
  assert.match(adapterSource, /if \(dateKey !== selectedDate\) \{[\s\S]*?await fastCycleController\.flush\(\);[\s\S]*?setSelectedDate\(dateKey\);[\s\S]*?return;/);
  assert.match(adapterSource, /if \(dateKey <= today\) cycleSelectedDate\(dateKey\);/);
  assert.match(adapterSource, /fastCycleController\.schedule\(\{ action: nextAction, dateKey, taskId: task\.id \}\);/);
  assert.match(adapterSource, /if \(isMultiSelect \|\| isSavingRef\.current \|\| dateKey > today\) return/);
  assert.match(adapterSource, /if \(!isMultiSelect\) await fastCycleController\.flush\(\)/);
  assert.match(adapterSource, /onRequestComplete\?: \(logicalDate: string\)/);
  assert.match(adapterSource, /if \(pendingEdit\.action === "delayed"\)[\s\S]*?setShowDelayEditor\(true\);[\s\S]*?return true;/);
  assert.match(adapterSource, /if \(pendingEdit\.action === "complete"\)[\s\S]*?return onRequestComplete\(pendingEdit\.dateKey\) !== false;/);
});

test("Delayed opens the existing picker and Complete opens shared confirmation without immediate writes", () => {
  assert.match(adapterSource, /onSave=\{\(nextDueOn\) => handleSaveDelayedStatus\(nextDueOn\)\}/);
  assert.match(adapterSource, /onCancel=\{\(\) => setShowDelayEditor\(false\)\}/);
  assert.match(taskAppSource, /onRequestComplete: \(logicalDate: string\) => requestTaskComplete\(taskHistoryModalTask, \{ logicalDate \}\)/);
  assert.match(adapterSource, /if \(pendingEdit\.action === "in_progress"\) return handleSetCalendarOverride\("in_progress", pendingEdit\.dateKey\);/);
  assert.match(taskAppSource, /if \(overrideState === "in_progress"\) \{[\s\S]*?return setTaskHistoryInProgress\(taskHistoryModalTaskId, logicalDate\);/);
  assert.match(adapterSource, /if \(pendingEdit\.action === "complete"\)/);
});

test("temporary Calendar fast-cycle diagnostics are absent", () => {
  assert.equal(adapterSource.includes("[calendar-fast-cycle]"), false);
  assert.equal(presentationSource.includes("[calendar-fast-cycle]"), false);
});

test("In Progress is a Calendar override state, never a History outcome", () => {
  assert.match(engineTypesSource, /TaskCalendarOverrideState = .*"in_progress"/);
  assert.doesNotMatch(engineTypesSource, /TaskHistoryOutcome =[^\n]*in_progress/);
});

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
  type TaskHistoryFastCyclePending,
} from "../src/lib/task-history-fast-cycle.ts";

const adapterSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");

const fullCycleActions = getTaskHistoryFastCycleActions({
  canClear: true,
  calendarActionStatuses: ["done", "did_my_best", "delayed", "missed", "complete"],
  calendarOverrideActions: ["blank_due", "not_due", "due_open"],
});

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
      return 1;
    },
  };
}

function pending(action: TaskHistoryFastCyclePending["action"]): TaskHistoryFastCyclePending {
  return { action, dateKey: "2026-10-05", taskId: "task-1" };
}

test("fast-cycle eligibility preserves the exact common-state order and excludes Delayed and Complete", () => {
  assert.deepEqual(fullCycleActions, ["automatic", "blank", "done", "did_my_best", "missed", "not_due", "due"]);
  assert.deepEqual(getTaskHistoryFastCycleActions({
    canClear: false,
    calendarActionStatuses: ["done", "did_my_best", "delayed", "missed", "complete"],
    calendarOverrideActions: ["blank_due", "not_due", "due_open"],
  }), ["blank", "done", "did_my_best", "missed", "not_due", "due"]);
  assert.equal(getTaskHistoryFastCycleActionLabel("did_my_best"), "Did My Best");
});

test("engine-calculated Not Due starts with Blank, while a manual Not Due override advances to Due", () => {
  const calculatedNotDue = getTaskHistoryFastCycleCurrentAction({
    sourceKind: "calculated",
    state: "not_due",
  });
  assert.equal(calculatedNotDue, "automatic");
  assert.equal(getNextTaskHistoryFastCycleAction(fullCycleActions.slice(1), calculatedNotDue), "blank");

  const manualNotDue = getTaskHistoryFastCycleCurrentAction({
    calendarOverrideState: "not_due",
    sourceKind: "calendar_override",
    state: "not_due",
  });
  assert.equal(manualNotDue, "not_due");
  assert.equal(getNextTaskHistoryFastCycleAction(fullCycleActions, manualNotDue), "due");
});

test("controller debounces repeated clicks and commits only the final pending choice", async () => {
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

  controller.schedule(pending("blank"));
  const staleTimer = timer.getCallback();
  controller.schedule(pending("done"));
  controller.schedule(pending("did_my_best"));
  assert.equal(timer.getDelay(), TASK_HISTORY_FAST_CYCLE_DELAY_MS);
  assert.equal(timer.clearCount(), 2);
  staleTimer?.();
  assert.deepEqual(calls, []);

  timer.getCallback()?.();
  await controller.flush();
  assert.deepEqual(calls.map((call) => call.action), ["did_my_best"]);
  assert.equal(pendingStates.at(-1), null);
});

test("cycling through Missed without stopping there never commits Missed", async () => {
  const timer = fakeTimerHarness();
  const calls: TaskHistoryFastCyclePending[] = [];
  const controller = createTaskHistoryFastCycleController({
    commit: async (next) => {
      calls.push(next);
      return true;
    },
    onPendingChange: () => undefined,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  controller.schedule(pending("missed"));
  controller.schedule(pending("not_due"));
  timer.getCallback()?.();
  await controller.flush();
  assert.deepEqual(calls.map((call) => call.action), ["not_due"]);
});

test("flush is safe to call at date change, modal close, or multi-select entry and stale cleanup cannot commit", async () => {
  const timer = fakeTimerHarness();
  const calls: TaskHistoryFastCyclePending[] = [];
  const controller = createTaskHistoryFastCycleController({
    commit: async (next) => {
      calls.push(next);
      return true;
    },
    onPendingChange: () => undefined,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  controller.schedule(pending("blank"));
  await controller.flush();
  await controller.flush();
  assert.deepEqual(calls.map((call) => call.action), ["blank"]);

  controller.schedule(pending("done"));
  const staleTimer = timer.getCallback();
  controller.cancel();
  staleTimer?.();
  assert.deepEqual(calls.map((call) => call.action), ["blank"]);

  controller.schedule(pending("missed"));
  const unmountedTimer = timer.getCallback();
  controller.dispose();
  unmountedTimer?.();
  assert.deepEqual(calls.map((call) => call.action), ["blank"]);
});

test("failed commit clears the misleading pending preview", async () => {
  const timer = fakeTimerHarness();
  const pendingStates: Array<TaskHistoryFastCyclePending | null> = [];
  const controller = createTaskHistoryFastCycleController({
    commit: async () => false,
    onPendingChange: (next) => pendingStates.push(next),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  controller.schedule(pending("done"));
  const committed = await controller.flush();
  assert.equal(committed, false);
  assert.equal(pendingStates.at(-1), null);
});

test("Task History production wiring selects first, cycles only on the selected date, and routes through canonical handlers", () => {
  assert.match(adapterSource, /function getFastCycleContext\(dateKey: string\)/);
  assert.match(adapterSource, /historyByDate\.get\(dateKey\)/);
  assert.match(adapterSource, /calendarOverridesByDate\.get\(dateKey\)/);
  assert.match(adapterSource, /calendarRead\?\.timeline\?\.days\[dateKey\]/);
  assert.match(adapterSource, /canClearDates\(\[dateKey\]\)/);
  assert.match(adapterSource, /logicalDate: dateKey/);
  assert.match(adapterSource, /if \(dateKey !== selectedDate\) \{[\s\S]*?await fastCycleController\.flush\(\);[\s\S]*?setSelectedDate\(dateKey\)/);
  assert.match(adapterSource, /if \(dateKey <= today\) cycleSelectedDate\(dateKey\);/);
  assert.match(adapterSource, /fastCycleController\.schedule\(\{ action: nextAction, dateKey, taskId: task\.id \}\)/);
  assert.match(adapterSource, /pendingCycleForSelectedDate \? `Pending: \$\{getTaskHistoryFastCycleActionLabel/);
  assert.match(adapterSource, /handleSetStatus\("clear", \[pendingEdit\.dateKey\]\)/);
  assert.match(adapterSource, /handleSetCalendarOverride\("blank_due", pendingEdit\.dateKey\)/);
  assert.match(adapterSource, /handleSetCalendarOverride\("not_due", pendingEdit\.dateKey\)/);
  assert.match(adapterSource, /handleSetCalendarOverride\("due_open", pendingEdit\.dateKey\)/);
  assert.match(adapterSource, /return handleSetStatus\(pendingEdit\.action, \[pendingEdit\.dateKey\]\)/);
  assert.match(adapterSource, /if \(isMultiSelect \|\| isSavingRef\.current \|\| dateKey > today\) return/);
  assert.match(adapterSource, /if \(!isMultiSelect\) await fastCycleController\.flush\(\)/);
  assert.match(adapterSource, /await fastCycleController\.flush\(\);[\s\S]*?onClose\(\);/);
  assert.match(adapterSource, /void runAfterPendingCycle\(async \(\) =>/);
  assert.match(adapterSource, /fastCycleController\.dispose\(\)/);
});

test("one-click interaction model selects the target, previews immediately, and flushes the prior date before cycling the new date", async () => {
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
  const contexts = {
    "2026-10-05": { actions: ["blank", "done", "did_my_best"] as const, currentAction: "automatic" as const },
    "2026-10-06": { actions: fullCycleActions, currentAction: "not_due" as const },
  };
  let selectedDate = "2026-10-04";

  async function clickDate(dateKey: keyof typeof contexts) {
    if (dateKey !== selectedDate) {
      await controller.flush();
      selectedDate = dateKey;
    }
    const context = contexts[dateKey];
    const existing = pendingStates.at(-1)?.dateKey === dateKey ? pendingStates.at(-1) : null;
    const nextAction = getNextTaskHistoryFastCycleAction(context.actions, existing?.action ?? context.currentAction);
    assert.ok(nextAction);
    controller.schedule({ action: nextAction, dateKey, taskId: "task-1" });
  }

  await clickDate("2026-10-05");
  assert.equal(selectedDate, "2026-10-05");
  assert.equal(pendingStates.at(-1)?.action, "blank");
  await clickDate("2026-10-05");
  assert.equal(pendingStates.at(-1)?.action, "done");
  await clickDate("2026-10-06");
  assert.deepEqual(calls.map((call) => call.action), ["done"]);
  assert.equal(selectedDate, "2026-10-06");
  assert.equal(pendingStates.at(-1)?.action, "due");
});

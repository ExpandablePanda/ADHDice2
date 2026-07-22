import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyFocusSandboxSwipe,
  deriveFocusBarRows,
  FOCUS_BAR_FALLBACK_SCALE_SECONDS,
  getFocusBarGeometry,
  getBoundedFocusSandboxPage,
  hasRunningFocusBarRuntime,
} from "../src/lib/focus-bars.ts";
import { SYSTEM_COUNTDOWN_CATEGORY_ID } from "../src/lib/focus-utils.ts";
import type {
  ActiveFocusSession,
  FocusCategory,
  FocusDailyGoalAdjustment,
  HistoricalFocusSession,
} from "../src/lib/types.ts";

const TODAY = "2026-07-21";
const NOW_MS = 100_000;
const focusBarsSource = readFileSync(new URL("../src/components/focus-bars.tsx", import.meta.url), "utf8");
const focusBarsHelperSource = readFileSync(new URL("../src/lib/focus-bars.ts", import.meta.url), "utf8");
const focusPageSource = readFileSync(new URL("../src/components/focus-page.tsx", import.meta.url), "utf8");
const focusClocksSource = readFileSync(new URL("../src/components/focus-clocks.tsx", import.meta.url), "utf8");

function category(id: string, weeklyGoalSeconds: number | null = null): FocusCategory {
  return {
    id,
    title: id.toUpperCase(),
    focusType: "Work",
    color: `#${id.padEnd(6, "0").slice(0, 6)}`,
    icon: "Clock3",
    weeklyGoalSeconds,
  };
}

function historyEntry(categoryId: string, durationSeconds: number, date = TODAY): HistoricalFocusSession {
  return {
    id: `${categoryId}-${durationSeconds}`,
    categoryId,
    title: categoryId,
    date,
    durationSeconds,
    focusType: "Work",
  };
}

function session(categoryId: string, isRunning: boolean, accumulatedSeconds: number, startTime = 40_000): ActiveFocusSession {
  return { categoryId, isRunning, accumulatedSeconds, startTime: isRunning ? startTime : null, mode: "countup" };
}

function derive(input: {
  categories: FocusCategory[];
  history?: HistoricalFocusSession[];
  activeSessions?: Record<string, ActiveFocusSession>;
  adjustments?: FocusDailyGoalAdjustment[];
  nowMs?: number;
}) {
  return deriveFocusBarRows({
    activeSessions: input.activeSessions ?? {},
    adjustments: input.adjustments,
    categories: input.categories,
    history: input.history ?? [],
    nowMs: input.nowMs ?? NOW_MS,
    todayDate: TODAY,
  });
}

test("goal-only category is eligible at zero activity", () => {
  const [row] = derive({ categories: [category("goal", 4_200)] });
  assert.equal(row.adjustedGoalSeconds, 600);
  assert.equal(row.combinedSeconds, 0);
  assert.equal(row.eligible, true);
});

test("configured category remains eligible when its adjusted target is zero", () => {
  const adjustment: FocusDailyGoalAdjustment = {
    id: "zero-adjustment",
    userId: "user",
    adjustmentDate: TODAY,
    sourceCategoryId: "source",
    targetCategoryId: "zeroed",
    reductionSeconds: 600,
    reason: "daily_goal_completion",
    createdAt: TODAY,
    updatedAt: TODAY,
  };
  const [row] = derive({ categories: [category("zeroed", 4_200)], adjustments: [adjustment] });
  assert.equal(row.adjustedGoalSeconds, null);
  assert.equal(row.eligible, true);
});

test("saved-activity-only category is eligible", () => {
  const [row] = derive({ categories: [category("saved")], history: [historyEntry("saved", 300)] });
  assert.equal(row.savedTodaySeconds, 300);
  assert.equal(row.eligible, true);
});

test("running and paused categories are eligible with their runtime state", () => {
  const rows = derive({
    categories: [category("run"), category("pause")],
    activeSessions: {
      run: session("run", true, 30),
      pause: session("pause", false, 90),
    },
  });
  assert.deepEqual(rows.map((row) => [row.runtimeState, row.eligible]), [["running", true], ["paused", true]]);
});

test("saved and authoritative runtime seconds combine", () => {
  const [row] = derive({
    categories: [category("work")],
    history: [historyEntry("work", 120)],
    activeSessions: { work: session("work", true, 30) },
  });
  assert.equal(row.runtimeSeconds, 90);
  assert.equal(row.combinedSeconds, 210);
});

test("finished runtime is not double-counted after saved history appears", () => {
  const [row] = derive({ categories: [category("done")], history: [historyEntry("done", 240)] });
  assert.equal(row.runtimeSeconds, 0);
  assert.equal(row.combinedSeconds, 240);
});

test("paused runtime remains fixed as wall-clock time advances", () => {
  const activeSessions = { pause: session("pause", false, 180) };
  const first = derive({ categories: [category("pause")], activeSessions, nowMs: NOW_MS })[0];
  const later = derive({ categories: [category("pause")], activeSessions, nowMs: NOW_MS + 60_000 })[0];
  assert.equal(first.runtimeSeconds, 180);
  assert.equal(later.runtimeSeconds, 180);
});

test("running runtime increases elapsed and combined totals with authoritative time", () => {
  const activeSessions = { run: session("run", true, 30) };
  const first = derive({ categories: [category("run")], history: [historyEntry("run", 120)], activeSessions, nowMs: NOW_MS })[0];
  const later = derive({ categories: [category("run")], history: [historyEntry("run", 120)], activeSessions, nowMs: NOW_MS + 10_000 })[0];
  assert.equal(later.runtimeSeconds - first.runtimeSeconds, 10);
  assert.equal(later.combinedSeconds - first.combinedSeconds, 10);
});

test("resumed runtime continues from its accumulated paused time", () => {
  const activeSessions = { resume: session("resume", true, 180, 90_000) };
  const [row] = derive({ categories: [category("resume")], activeSessions, nowMs: 100_000 });
  assert.equal(row.runtimeSeconds, 190);
  assert.equal(row.combinedSeconds, 190);
});

test("running overtime continues increasing beyond its adjusted goal", () => {
  const activeSessions = { over: session("over", true, 600, 40_000) };
  const first = derive({ categories: [category("over", 4_200)], activeSessions, nowMs: 100_000 })[0];
  const later = derive({ categories: [category("over", 4_200)], activeSessions, nowMs: 110_000 })[0];
  assert.equal(first.overtimeSeconds, 60);
  assert.equal(later.overtimeSeconds, 70);
  assert.ok(getFocusBarGeometry(later).goalMarkerPercent! < getFocusBarGeometry(first).goalMarkerPercent!);
});

test("goal rows normalize fill and marker percentages against their own goal", () => {
  const fiveMinutesOfTen = derive({ categories: [category("ten-minute", 4_200)], history: [historyEntry("ten-minute", 300)] })[0];
  const fiveHoursOfTen = derive({ categories: [category("ten-hour", 252_000)], history: [historyEntry("ten-hour", 18_000)] })[0];
  assert.deepEqual(getFocusBarGeometry(fiveMinutesOfTen), { fillPercent: 50, goalMarkerPercent: 100 });
  assert.deepEqual(getFocusBarGeometry(fiveHoursOfTen), { fillPercent: 50, goalMarkerPercent: 100 });
});

test("goal geometry covers zero, exact-goal, and overtime marker positions", () => {
  const zero = derive({ categories: [category("goal", 4_200)] })[0];
  const exact = derive({ categories: [category("goal", 4_200)], history: [historyEntry("goal", 600)] })[0];
  const fifteen = derive({ categories: [category("goal", 4_200)], history: [historyEntry("goal", 900)] })[0];
  const twenty = derive({ categories: [category("goal", 4_200)], history: [historyEntry("goal", 1_200)] })[0];
  assert.deepEqual(getFocusBarGeometry(zero), { fillPercent: 0, goalMarkerPercent: 100 });
  assert.deepEqual(getFocusBarGeometry(exact), { fillPercent: 100, goalMarkerPercent: 100 });
  assert.deepEqual(getFocusBarGeometry(fifteen), { fillPercent: 100, goalMarkerPercent: 600 / 900 * 100 });
  assert.deepEqual(getFocusBarGeometry(twenty), { fillPercent: 100, goalMarkerPercent: 50 });
});

test("goal geometry is independent of other categories and preserves no-goal fallback", () => {
  const rows = derive({
    categories: [category("goal", 4_200), category("outlier", 252_000), category("open")],
    history: [historyEntry("goal", 300), historyEntry("outlier", 99_999), historyEntry("open", 99_999)],
  });
  const goal = rows.find((row) => row.categoryId === "goal")!;
  assert.deepEqual(getFocusBarGeometry(goal), { fillPercent: 50, goalMarkerPercent: 100 });
  const noGoalRows = derive({ categories: [category("open")], history: [historyEntry("open", 99_999)] });
  assert.deepEqual(getFocusBarGeometry(noGoalRows[0]), { fillPercent: 100, goalMarkerPercent: null });
  assert.equal(FOCUS_BAR_FALLBACK_SCALE_SECONDS, 3_600);
});

test("overtime stays exact while the Focus Bars fill is capped", () => {
  const [row] = derive({ categories: [category("over", 4_200)], history: [historyEntry("over", 1_800)] });
  assert.equal(row.combinedSeconds, 1_800);
  assert.equal(row.overtimeSeconds, 1_200);
  assert.match(focusBarsSource, /Math\.min\(100, Math\.max\(3, fillPercent\)\)/);
});

test("Focus Bars labels Today from combined time and Session from runtime only", () => {
  const rows = derive({
    categories: [category("run"), category("saved")],
    history: [historyEntry("run", 120), historyEntry("saved", 180)],
    activeSessions: { run: session("run", true, 30) },
  });
  const running = rows.find((row) => row.categoryId === "run")!;
  const inactive = rows.find((row) => row.categoryId === "saved")!;
  assert.equal(running.combinedSeconds, running.savedTodaySeconds + running.runtimeSeconds);
  assert.equal(inactive.runtimeState, "inactive");
  assert.match(focusBarsSource, /Today \{formatFocusBarRuntimeDuration\(row\.combinedSeconds\)\}/);
  assert.match(focusBarsSource, /row\.runtimeState !== "inactive"[\s\S]*?Session \{formatFocusBarRuntimeDuration\(row\.runtimeSeconds\)\}/);
});

test("rows sort runtime first, then nonzero activity, zero-time goals, and display order", () => {
  const rows = derive({
    categories: [category("tie-a"), category("low", 4_200), category("run", 4_200), category("high", 4_200), category("pause"), category("tie-b"), category("goal", 8_400)],
    history: [historyEntry("low", 120), historyEntry("high", 240), historyEntry("tie-a", 60), historyEntry("tie-b", 60)],
    activeSessions: { run: session("run", true, 90), pause: session("pause", false, 180) },
  });
  assert.deepEqual(rows.map((row) => row.categoryId), ["pause", "run", "high", "low", "tie-a", "tie-b", "goal"]);
});

test("Focus Bars reserves independent state, completion, overtime, and control regions", () => {
  assert.match(focusBarsSource, /h-10[\s\S]*?\{stateLabel\}[\s\S]*?Session/);
  assert.match(focusBarsSource, /min-h-4[\s\S]*?\{isGoalComplete \? "Goal complete"/);
  assert.match(focusBarsSource, /min-h-4[\s\S]*?row\.overtimeSeconds > 0/);
  assert.match(focusBarsSource, /mt-2 flex min-h-16 w-full flex-wrap content-start/);
});

test("Focus Bars adds horizontal end-lane insets without shared scrolling changes", () => {
  assert.match(focusBarsSource, /flex min-w-full items-start gap-4 px-2 sm:gap-5 sm:px-3/);
  assert.doesNotMatch(focusBarsSource, /-mx-|translate-x-|scrollLeft/);
});

test("Today and Goal render as separate nonwrapping label rows", () => {
  assert.match(focusBarsSource, /h-4 w-full whitespace-nowrap text-center text-\[11px\]/);
  assert.match(focusBarsSource, /mt-2 h-4 w-full whitespace-nowrap text-center text-\[10px\]/);
});

test("only running category runtimes require the Focus Bars tick", () => {
  const categories = [category("run"), category("pause")];
  assert.equal(hasRunningFocusBarRuntime(categories, {}), false);
  assert.equal(hasRunningFocusBarRuntime(categories, { pause: session("pause", false, 120) }), false);
  assert.equal(hasRunningFocusBarRuntime(categories, { run: session("run", true, 0) }), true);
});

test("adjustedTodayTargetSeconds is used instead of a raw category goal", () => {
  const adjustment: FocusDailyGoalAdjustment = {
    id: "adjustment",
    userId: "user",
    adjustmentDate: TODAY,
    sourceCategoryId: "source",
    targetCategoryId: "adjusted",
    reductionSeconds: 120,
    reason: "daily_goal_completion",
    createdAt: TODAY,
    updatedAt: TODAY,
  };
  const [row] = derive({ categories: [{ ...category("adjusted", 4_200), dailyGoalSeconds: 9_999 }], adjustments: [adjustment] });
  assert.equal(row.adjustedGoalSeconds, 480);
});

test("overtime and uncapped progress use combined activity", () => {
  const [row] = derive({ categories: [category("over", 4_200)], history: [historyEntry("over", 750)] });
  assert.equal(row.overtimeSeconds, 150);
  assert.equal(row.progressRatio, 1.25);
  assert.equal(row.goalState, "overtime");
});

test("no-goal category has no fake percentage or completion state", () => {
  const [row] = derive({ categories: [category("open")], history: [historyEntry("open", 60)] });
  assert.equal(row.adjustedGoalSeconds, null);
  assert.equal(row.progressRatio, null);
  assert.equal(row.goalState, "no-goal");
});

test("rows preserve category editor/display order", () => {
  const rows = derive({ categories: [category("third", 4_200), category("first", 4_200), category("second", 4_200)] });
  assert.deepEqual(rows.map((row) => [row.categoryId, row.displayOrder]), [["third", 0], ["first", 1], ["second", 2]]);
});

test("standalone Countdown is excluded", () => {
  const countdown = { ...category(SYSTEM_COUNTDOWN_CATEGORY_ID, 4_200), title: "Countdown" };
  const rows = derive({
    categories: [countdown, category("work", 4_200)],
    activeSessions: { [SYSTEM_COUNTDOWN_CATEGORY_ID]: session(SYSTEM_COUNTDOWN_CATEGORY_ID, true, 30) },
  });
  assert.deepEqual(rows.map((row) => row.categoryId), ["work"]);
});

test("Focus Bars wires icon controls and Finish to the existing category handlers", () => {
  assert.match(focusBarsSource, /onToggle\(row\.categoryId, row\.runtimeState === "inactive" \? \{ mode: "countup" \} : undefined\)/);
  assert.match(focusBarsSource, /onFinish\(row\.categoryId\)/);
  assert.match(focusBarsSource, /row\.runtimeState === "running" \? <FocusTimerPauseIcon[\s\S]*?<FocusTimerPlayIcon/);
  assert.match(focusPageSource, /onFinish=\{handleFinishClick\}/);
  assert.match(focusPageSource, /onToggle=\{onToggleTimer\}/);
});

test("Focus Bars exposes Clocks reset and compact adjustment controls only for active runtimes", () => {
  assert.match(focusBarsSource, /row\.runtimeState !== "inactive"[\s\S]*?onReset\(row\.categoryId\)/);
  assert.match(focusBarsSource, /row\.runtimeState !== "inactive"[\s\S]*?<FocusTimerQuickAdjustmentControls compact onAdjust=\{\(deltaSeconds\) => onAdjust\(row\.categoryId, deltaSeconds\)\}/);
  assert.match(focusBarsSource, /onAdjust: \(categoryId: string, deltaSeconds: number\) => Promise<boolean>/);
  assert.match(focusBarsSource, /onReset: \(categoryId: string\) => Promise<void>/);
  assert.match(focusPageSource, /<FocusBars[\s\S]*?onAdjust=\{onAdjustTimer\}[\s\S]*?onReset=\{onResetTimer\}/);
});

test("Focus Bars adjustment trigger uses the approved compact chip height", () => {
  assert.match(focusClocksSource, /!clockFace[\s\S]*?className="h-\[26px\] px-2 py-0"/);
  assert.match(focusBarsSource, /<FocusTimerQuickAdjustmentControls compact/);
});

test("Clocks opens the complete larger adjustment group directly in the centered clock-face region", () => {
  assert.match(focusClocksSource, /aria-label=\{isCountdown \? `Choose \$\{category\.title\} countdown duration` : `Adjust \$\{category\.title\} timer`\}[\s\S]*?setShowAdjustMenu\(\(prev\) => !prev\)/);
  assert.match(focusClocksSource, /className="absolute inset-4[^"]*items-center justify-center[^"]*rounded-full/);
  assert.match(focusClocksSource, /data-focus-clock-adjustment-region="centered-clock-face"[\s\S]*?<FocusTimerQuickAdjustmentControls clockFace onAdjust=/);
  assert.match(focusClocksSource, /\{clockFace \|\| isOpen \? \([\s\S]*?aria-label="Adjust session time options"/);
  assert.match(focusClocksSource, /compact \? "h-5 min-w-5 px-1 py-0 text-\[10px\]" : undefined/);
  assert.match(focusClocksSource, /compact \? FOCUS_BAR_ADJUSTMENT_INPUT_CLASS : TASK_TABLE_COMPACT_CADENCE_INPUT_CLASS/);
  assert.match(focusClocksSource, /compact \? "gap-0\.5" : "gap-2"/);
  assert.equal([...focusClocksSource.matchAll(/<FocusTimerQuickAdjustmentControls/g)].length, 1);
});

test("Clocks omits the intermediate launcher and gear Adjust time opens the same adjustment state", () => {
  assert.match(focusClocksSource, /\{!clockFace \? \([\s\S]*?aria-label="Adjust session time"[\s\S]*?>\+ \/ −<\/TaskTableChipButton>/);
  assert.match(focusClocksSource, /<FocusTimerQuickAdjustmentControls clockFace/);
  assert.match(focusClocksSource, /aria-label="Adjust session time"[\s\S]*?setShowSettingsMenu\(false\);[\s\S]*?setShowAdjustMenu\(true\);[\s\S]*?\+ \/ − Adjust time/);
  assert.doesNotMatch(focusClocksSource, /<FocusTimerQuickAdjustmentControls[^>]*>[\s\S]*?<FocusTimerQuickAdjustmentControls/);
});

test("Focus Bars uses approved semantic icon controls with explicit accessible labels", () => {
  assert.match(focusBarsSource, /aria-label=\{row\.runtimeState === "paused" \? "Resume timer" : row\.runtimeState === "running" \? "Pause timer" : "Start timer"\}/);
  assert.match(focusBarsSource, /title=\{row\.runtimeState === "paused" \? "Resume timer" : row\.runtimeState === "running" \? "Pause timer" : "Start timer"\}/);
  assert.match(focusBarsSource, /toneClassName=\{row\.runtimeState === "running" \? FOCUS_TIMER_PAUSE_CHIP_TONE : FOCUS_TIMER_SUCCESS_CHIP_TONE\}/);
  assert.match(focusBarsSource, /aria-label="Finish session"[\s\S]*?title="Finish session"[\s\S]*?<FocusTimerFinishIcon/);
  assert.match(focusBarsSource, /aria-label="Reset session"[\s\S]*?title="Reset session"[\s\S]*?<FocusTimerResetIcon/);
  assert.match(focusBarsSource, /FOCUS_TIMER_RESET_CHIP_TONE/);
  assert.match(focusClocksSource, /aria-label="Adjust session time"[\s\S]*?>\+ \/ −</);
  assert.match(focusClocksSource, /export function FocusTimerResetIcon/);
  assert.match(focusBarsSource, /disabled=\{pendingRuntimeActionCategoryId === row\.categoryId\}/);
  assert.match(focusBarsSource, /runRuntimeAction\(row\.categoryId/);
});

test("Clocks and Bars share direction-first adjustment controls without legacy signed groups", () => {
  assert.match(focusClocksSource, /export const FOCUS_TIMER_QUICK_ADJUSTMENT_MINUTES = \[5, 10\] as const/);
  assert.match(focusClocksSource, /<FocusTimerQuickAdjustmentControls clockFace onAdjust=\{\(deltaSeconds\) => onAdjust\(category\.id, deltaSeconds\)\}/);
  assert.match(focusClocksSource, /setAdjustmentDirection\(1\)/);
  assert.match(focusClocksSource, /aria-pressed=\{adjustmentDirection === direction\}/);
  assert.match(focusBarsSource, /FocusTimerQuickAdjustmentControls/);
  assert.match(focusBarsSource, /onAdjust\(row\.categoryId, deltaSeconds\)/);
  assert.match(focusClocksSource, /getFocusTimerAdjustmentDeltaSeconds\(adjustmentDirection, minutes\)/);
  assert.match(focusClocksSource, /return direction \* minutes \* 60/);
  assert.match(focusClocksSource, />\s*\{minutes\}m\s*</);
  assert.doesNotMatch(focusClocksSource, /Remove custom minutes|Add custom minutes|− Apply|\+ Apply/);
});

test("custom minute adjustments validate whole positive values and retain directional submission", () => {
  const positiveWholeMinutes = /^[1-9]\d*$/;
  for (const invalidValue of ["", "0", "-7", "7.5", "seven"]) assert.equal(positiveWholeMinutes.test(invalidValue), false);
  assert.equal(positiveWholeMinutes.test("7"), true);
  assert.match(focusClocksSource, /function parseFocusTimerCustomAdjustmentMinutes[\s\S]*?\^\[1-9\]\\d\*\$/);
  assert.match(focusClocksSource, /getFocusTimerAdjustmentDeltaSeconds\(adjustmentDirection, customMinuteValue\), true/);
  assert.match(focusClocksSource, /if \(succeeded && clearCustomMinutes\) setCustomMinutes\(""\)/);
  assert.match(focusClocksSource, /disabled=\{customMinuteValue === null \|\| isAdjustmentPending\}/);
  assert.match(focusClocksSource, /if \(adjustmentPendingRef\.current\) return/);
  assert.match(focusClocksSource, /if \(event\.key === "Enter"\) event\.preventDefault\(\)/);
});

test("custom adjustment uses digit entry without native spinners and renders a separate minute suffix", () => {
  assert.match(focusClocksSource, /inputMode="numeric"/);
  assert.match(focusClocksSource, /pattern="\[0-9\]\*"/);
  assert.match(focusClocksSource, /type="text"/);
  assert.doesNotMatch(focusClocksSource, /type="number"/);
  assert.doesNotMatch(focusClocksSource, /placeholder="min"/);
  assert.match(focusClocksSource, /<span aria-hidden="true"[^>]*>min<\/span>/);
});

test("Focus Bars keep graph content fixed while adjustment controls expand below", () => {
  assert.match(focusBarsSource, /flex min-w-full items-start/);
  assert.match(focusBarsSource, /flex h-\[21rem\][\s\S]*?overflow-hidden[\s\S]*?<\/div>\s*<div className="mt-2 flex min-h-16/);
  assert.match(focusClocksSource, /compact \? "basis-full gap-0\.5 pt-1" : "gap-2"/);
});

test("Focus tabs copy the approved centered task-tab grouped-chip formatting without arrows", () => {
  assert.match(focusPageSource, /className="mb-3 flex justify-center" data-focus-pager-alignment="centered-sandbox">\s*<nav/);
  assert.match(focusPageSource, /className=\{TASKS_SURFACE_GROUP_CLASS\}/);
  assert.match(focusPageSource, /<AdhdChip[\s\S]*?TASKS_SURFACE_ACTIVE_CHIP_CLASS[\s\S]*?TASKS_SURFACE_INACTIVE_CHIP_CLASS/);
  assert.match(focusPageSource, /aria-pressed=\{focusSandboxPage === page\}/);
  assert.doesNotMatch(focusPageSource, /Previous Focus sandbox page|Next Focus sandbox page|ChevronLeft|ChevronRight/);
  assert.match(focusPageSource, /event\.key === "ArrowLeft" \|\| event\.key === "ArrowRight"/);
  assert.match(focusPageSource, /focusSandboxPage === 0[\s\S]*?<FocusClockRow[\s\S]*?: \([\s\S]*?<FocusBarsErrorBoundary/);
});

test("Focus tabs copy Tasks native drag reorder with persisted visual navigation order", () => {
  assert.match(focusPageSource, /FOCUS_SANDBOX_TAB_ORDER_STORAGE_KEY = "adhdice\.focusSandboxTabOrder\.v1"/);
  assert.match(focusPageSource, /focusSandboxTabOrder\.map\(\(page, visualIndex\)/);
  assert.match(focusPageSource, /aria-description="Drag horizontally to reorder this Focus tab\."[\s\S]*?draggable[\s\S]*?onDragStart/);
  assert.match(focusPageSource, /event\.dataTransfer\.setData\("text\/plain", String\(page\)\)/);
  assert.match(focusPageSource, /reorderFocusSandboxTab\(sourcePage, visualIndex\)/);
  assert.match(focusPageSource, /writeFocusSandboxTabOrder\(next\)/);
  assert.match(focusPageSource, /changeFocusSandboxPageByOffset\(event\.key === "ArrowRight" \? 1 : -1\)/);
  assert.match(focusPageSource, /changeFocusSandboxPageByOffset\(deltaX < 0 \? 1 : -1\)/);
});

test("Focus Bars expanded adjustment controls use the approved micro treatment", () => {
  assert.match(focusClocksSource, /FOCUS_BAR_ADJUSTMENT_INPUT_CLASS = "[^"]*h-5 w-10[^"]*px-1 text-center text-\[10px\]/);
  assert.match(focusClocksSource, /compact \? "h-5 px-1 py-0 text-\[10px\]" : undefined/);
  assert.match(focusClocksSource, /compact \? "text-\[9px\]" : "text-\[13px\]"/);
});

test("Focus Bars action circles use the approved small icon-button size with proportional icons", () => {
  assert.match(focusBarsSource, /FOCUS_BAR_ICON_CONTROL_CLASS = "h-7 w-7 p-0"/);
  assert.match(focusBarsSource, /<FocusTimerPauseIcon className="h-4 w-4" \/>[\s\S]*?<FocusTimerPlayIcon className="h-4 w-4" \/>/);
  assert.match(focusBarsSource, /<FocusTimerFinishIcon className="h-4 w-4" \/>/);
  assert.match(focusBarsSource, /<FocusTimerResetIcon className="h-4 w-4" \/>/);
});

test("Add Focus Timer matches the Manual Entry chip shell and fixed chip typography", () => {
  assert.match(focusPageSource, /w-\[min\(12rem,calc\(100vw-2rem\)\)\]/);
  assert.match(focusPageSource, /ui-pill-button-strong-light flex items-center gap-1\.5 transition hover:-translate-y-0\.5/);
  assert.match(focusPageSource, /className="min-w-0 flex-1 border-0 bg-transparent p-0 text-\[13px\] font-medium leading-none[^"]*focus:text-\[13px\]"/);
  assert.doesNotMatch(focusPageSource, /TASK_TABLE_INPUT_CLASS/);
  assert.match(focusPageSource, /placeholder="Add focus timer\.\.\."[\s\S]*?role="combobox"/);
});

test("Focus toolbar controls copy the inactive Focus Goals category-chip tone", () => {
  assert.match(focusPageSource, /const FOCUS_TOOLBAR_CHIP_TONE_CLASS = "border-\[#e4deef\] bg-\[var\(--surface-elevated\)\] text-\[#68738c\] dark:border-white\/10 dark:bg-white\/\[0\.03\] dark:text-white\/60"/);
  assert.equal((focusPageSource.match(/FOCUS_TOOLBAR_CHIP_TONE_CLASS/g) ?? []).length, 6);
  assert.match(focusPageSource, /Edit Categories[\s\S]*?Edit Goals[\s\S]*?Manual Entry[\s\S]*?<FocusTimerPicker[\s\S]*?Add Counter/);
});

test("Focus Timer dropdown highlight matches the active Clocks chip with white text", () => {
  assert.match(focusPageSource, /index === safeHighlightedIndex \? "bg-\[#6f57f6\] text-white"/);
  assert.match(focusPageSource, /<Clock3[\s\S]*?index === safeHighlightedIndex \? "text-white" : "text-\[#7b68ee\]/);
  assert.doesNotMatch(focusPageSource, /bg-\[#f1ecff\] text-\[#6249e8\]/);
});

test("Focus Bars renders directly in the outer sandbox without a nested card shell", () => {
  assert.match(focusBarsSource, /return \(\s*<div className="min-w-0 py-1">[\s\S]*?>Focus Bars<\/h3>/);
  assert.doesNotMatch(focusBarsSource, /rounded-\[var\(--radius-card\)\][\s\S]*?Live daily Focus category bar chart/);
  assert.match(focusPageSource, /max-w-4xl rounded-\[2rem\][\s\S]*?<FocusBarsErrorBoundary[\s\S]*?<FocusBars/);
});

test("Focus Bars shows an empty state when no category is eligible", () => {
  const [row] = derive({ categories: [category("empty")] });
  assert.equal(row.eligible, false);
  assert.match(focusBarsSource, /No Focus Bars for today/);
});

test("Focus Bars delegates elapsed time to the authoritative runtime helper", () => {
  assert.match(focusBarsHelperSource, /getAuthoritativeFocusElapsedSeconds\(session, input\.nowMs\)/);
  assert.doesNotMatch(focusBarsSource, /Date\.now\(\)\s*-\s*session\.startTime/);
  assert.match(focusBarsSource, /window\.setInterval\(\(\) => setNowMs\(Date\.now\(\)\), 1000\)/);
  assert.match(focusBarsSource, /deriveFocusBarRows\([\s\S]*?nowMs/);
  assert.match(focusBarsSource, /formatFocusBarRuntimeDuration\(row\.combinedSeconds\)/);
});

test("Clocks remains the default bounded sandbox page", () => {
  assert.match(focusPageSource, /focusSandboxPage, setFocusSandboxPage\] = useState\(0\)/);
  assert.match(focusPageSource, /focusSandboxPage === 0[\s\S]*?<FocusClockRow/);
  assert.equal(getBoundedFocusSandboxPage(-1), 0);
  assert.equal(getBoundedFocusSandboxPage(2), 1);
});

test("sandbox gestures preserve deliberate horizontal paging only", () => {
  assert.equal(classifyFocusSandboxSwipe(-70, 8), "horizontal");
  assert.equal(classifyFocusSandboxSwipe(9, 35), "cancelled");
  assert.equal(classifyFocusSandboxSwipe(30, 4), "pending");
  assert.match(focusClocksSource, /data-focus-clock-scroll-region/);
});

test("Focus Bars failure stays isolated from Clocks", () => {
  assert.match(focusPageSource, /<nav[\s\S]*?<FocusBarsErrorBoundary/);
  assert.match(focusPageSource, /Your timers are unchanged; use the pager to return to Clocks/);
});

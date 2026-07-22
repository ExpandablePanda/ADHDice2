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
  assert.match(focusBarsSource, /min-h-10[\s\S]*?\{stateLabel\}[\s\S]*?Session/);
  assert.match(focusBarsSource, /min-h-4[\s\S]*?\{isGoalComplete \? "Goal complete"/);
  assert.match(focusBarsSource, /min-h-4[\s\S]*?row\.overtimeSeconds > 0/);
  assert.match(focusBarsSource, /mt-2 flex min-h-12/);
});

test("Focus Bars adds horizontal end-lane insets without shared scrolling changes", () => {
  assert.match(focusBarsSource, /flex min-w-full items-end gap-4 px-2 sm:gap-5 sm:px-3/);
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

test("Focus Bars wires Start/Resume/Pause and Finish to category handlers", () => {
  assert.match(focusBarsSource, /onToggle\(row\.categoryId, row\.runtimeState === "inactive" \? \{ mode: "countup" \} : undefined\)/);
  assert.match(focusBarsSource, /onFinish\(row\.categoryId\)/);
  assert.match(focusBarsSource, /"Resume" : row\.runtimeState === "running" \? "Pause" : "Start"/);
  assert.match(focusPageSource, /onFinish=\{handleFinishClick\}/);
  assert.match(focusPageSource, /onToggle=\{onToggleTimer\}/);
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

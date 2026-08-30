import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachDailyOverallGoalSeconds, upsertFocusHistoryEntry } from "../src/lib/focus-activity.ts";
import { getFocusActivityScrollAvailability, getFocusActivityScrollBehavior, getFocusActivityScrollDistance } from "../src/lib/focus-activity-scroll.ts";
import { ALL_FOCUS_ACTIVITY_FILTER, filterFocusActivityHistory, getFocusActivitySubtypeOptions, getFocusActivityTypeOptions } from "../src/lib/focus-activity-filters.ts";

const source = readFileSync(new URL("../src/components/focus-history.tsx", import.meta.url), "utf8");
const sharedChart = readFileSync(new URL("../src/components/activity-line-chart-card.tsx", import.meta.url), "utf8");

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const overallBuilder = sourceBetween(
  "function buildActivityOverallBars(",
  "function buildActivityCategoryBars(",
);
const dailyOverallBranch = sourceBetween(
  '  if (scope === "daily") {\n    return attachDailyOverallGoalSeconds(',
  "  const totalsByDate = buildDailyTotalsByDate(sessions);",
);
const categoryBuilder = sourceBetween(
  "function buildActivityCategoryBars(",
  "function buildDailyLineBuckets(",
);

const activityHistory = [
  { id: "work-paid", date: "2026-08-19", durationSeconds: 3600, focusType: "Productive", focusSubtype: "Paid Work" },
  { id: "work-study", date: "2026-08-19", durationSeconds: 1800, focusType: "Productive", focusSubtype: "Study" },
  { id: "personal", date: "2026-08-19", durationSeconds: 900, focusType: "Personal", focusSubtype: "Errands" },
] as const;

test("Focus history upserts keep chart identities unique without removing separate sessions", () => {
  const replacement = { id: "session-1", title: "Updated session" };
  const result = upsertFocusHistoryEntry(
    [
      { id: "session-1", title: "Realtime session" },
      { id: "session-1", title: "Stale duplicate" },
      { id: "session-2", title: "Separate session" },
    ],
    replacement,
  );

  assert.deepEqual(result, [replacement, { id: "session-2", title: "Separate session" }]);
  assert.equal(result.filter((entry) => entry.id === replacement.id).length, 1);

  const renderedPointKeys = result.map((entry) => `focus-category:${entry.id}`);
  const accessiblePointKeys = renderedPointKeys.map((key) => `accessible-${key}`);
  assert.equal(new Set(renderedPointKeys).size, renderedPointKeys.length);
  assert.equal(new Set(accessiblePointKeys).size, accessiblePointKeys.length);
  assert.equal(result.some((entry) => entry.id === "session-2"), true);
});

test("Activity Summary filters sessions and subtype choices by Focus Type", () => {
  assert.deepEqual(getFocusActivityTypeOptions([...activityHistory] as never[]), ["Personal", "Productive"]);
  assert.deepEqual(getFocusActivitySubtypeOptions([...activityHistory] as never[], "Productive"), ["Paid Work", "Study"]);
  assert.deepEqual(getFocusActivitySubtypeOptions([...activityHistory] as never[], ALL_FOCUS_ACTIVITY_FILTER), ["Errands", "Paid Work", "Study"]);
  assert.deepEqual(filterFocusActivityHistory([...activityHistory] as never[], "Productive", "Paid Work").map((session) => session.id), ["work-paid"]);
  assert.deepEqual(filterFocusActivityHistory([...activityHistory] as never[], "Productive", ALL_FOCUS_ACTIVITY_FILTER).map((session) => session.id), ["work-paid", "work-study"]);
  assert.match(source, /current === ALL_FOCUS_ACTIVITY_FILTER[\s\S]*ALL_FOCUS_ACTIVITY_FILTER/);
  assert.match(source, /buildFocusHistoryDerived\(categories, filteredActivityHistory/);
});

test("Daily Overall keeps every session bar, including eight and more than eight", () => {
  for (const sessionCount of [8, 11]) {
    const sessions = Array.from({ length: sessionCount }, (_, index) => ({
      id: `session-${index + 1}`,
      seconds: (index + 1) * 60,
    }));
    const bars = sessions.map((session) => ({
      key: session.id,
      seconds: session.seconds,
    }));
    const result = attachDailyOverallGoalSeconds(bars, sessions, () => 1_800);

    assert.equal(result.length, sessionCount);
    assert.deepEqual(result.map((bar) => bar.key), bars.map((bar) => bar.key));
    assert.equal(result.reduce((sum, bar) => sum + bar.seconds, 0), sessions.reduce((sum, session) => sum + session.seconds, 0));
    assert.ok(result.every((bar) => bar.goalSeconds === 1_800));
  }
  assert.match(dailyOverallBranch, /buildDistributionBars\(sessions, scope, range\)/);
  assert.doesNotMatch(dailyOverallBranch, /\.slice\(/);
});

test("Daily total and session count still use every scoped session", () => {
  assert.match(source, /const totalSeconds = sessions\.reduce\(/);
  assert.match(source, /value: String\(currentStats\.sessions\.length\)/);
  assert.match(source, /scopedSessionCount: currentStats\.sessions\.length/);
});

test("Weekly Overall still returns the seven dates in its range", () => {
  assert.match(source, /const start = shiftLocalISODate\(currentDate, -6\)/);
  assert.match(overallBuilder, /const dates = listDatesInRange\(range\)/);
  assert.match(overallBuilder, /if \(scope === "weekly"\) \{\n    return dates/);
});

test("Monthly Overall still aggregates consecutive seven-day buckets", () => {
  assert.match(overallBuilder, /const bucketCount = Math\.ceil\(dates\.length \/ 7\)/);
  assert.match(overallBuilder, /dates\.slice\(index \* 7, index \* 7 \+ 7\)/);
});

test("Categories still return the top six plus optional Other", () => {
  assert.match(categoryBuilder, /const topRows = rows\.slice\(0, 6\)/);
  assert.match(categoryBuilder, /otherSeconds \+= rows\.slice\(6\)/);
  assert.match(categoryBuilder, /if \(otherSeconds > 0\)/);
  assert.match(categoryBuilder, /key: "__other__"/);
});

test("horizontal chart overflow availability, distance, and reduced motion stay direction-aware", () => {
  assert.deepEqual(getFocusActivityScrollAvailability({ clientWidth: 500, scrollLeft: 0, scrollWidth: 500 }), { canScrollLeft: false, canScrollRight: false });
  assert.deepEqual(getFocusActivityScrollAvailability({ clientWidth: 500, scrollLeft: 0, scrollWidth: 900 }), { canScrollLeft: false, canScrollRight: true });
  assert.deepEqual(getFocusActivityScrollAvailability({ clientWidth: 500, scrollLeft: 200, scrollWidth: 900 }), { canScrollLeft: true, canScrollRight: true });
  assert.deepEqual(getFocusActivityScrollAvailability({ clientWidth: 500, scrollLeft: 400, scrollWidth: 900 }), { canScrollLeft: true, canScrollRight: false });
  assert.equal(getFocusActivityScrollDistance(100), 160);
  assert.equal(getFocusActivityScrollDistance(800), 600);
  assert.equal(getFocusActivityScrollBehavior(true), "auto");
  assert.equal(getFocusActivityScrollBehavior(false), "smooth");
  assert.match(source, /adhdice-scrollbar min-w-0 w-full overflow-x-auto/);
  assert.match(source, /Scroll activity chart left/);
  assert.match(source, /Scroll activity chart right/);
  assert.match(source, /ResizeObserver/);
});

test("Focus Activity Lines adapts its existing series into the shared chart card", () => {
  assert.match(source, /ActivityLineChartCard/);
  assert.match(source, /NumericLineChartSeries/);
  assert.match(source, /activityLineSeries/);
  assert.match(source, /formatRoundedMinuteDuration/);
  assert.doesNotMatch(source, /xSubpositionKey/);
  assert.doesNotMatch(source, /variant="embedded"/);
  assert.match(sharedChart, /NumericLineChartSeries/);
  assert.match(sharedChart, /onPointerMove/);
  assert.match(sharedChart, /onPointerUp/);
});

test("shared line chart hover uses scaled X/Y distance for the nearest point", () => {
  assert.match(sharedChart, /const localX = \(\(clientX - bounds\.left\) \/ Math\.max\(bounds\.width, 1\)\) \* CHART_WIDTH/);
  assert.match(sharedChart, /const localY = \(\(clientY - bounds\.top\) \/ Math\.max\(bounds\.height, 1\)\) \* CHART_HEIGHT/);
  assert.match(sharedChart, /Math\.hypot\(point\.x - localX, point\.y - localY\)/);
  assert.match(sharedChart, /left: 68/);
  assert.match(sharedChart, /min-h-\[3\.5rem\]/);
  assert.match(sharedChart, /Hover over a point to see its details/);
});

test("shared line chart uses one collision-adjusted X map for paths, circles, and active markers", () => {
  assert.match(sharedChart, /const pointXPositions = useMemo/);
  assert.match(sharedChart, /pointXPositions\.get\(pointKey\)/);
  assert.match(sharedChart, /pointXPositions\.get\(`\$\{item\.key\}:\$\{point\.key\}`\)/);
  assert.match(sharedChart, /x: PADDING\.left \+ position\.x/);
  assert.match(sharedChart, /x1=\{activePoint\.x\} x2=\{activePoint\.x\}/);
  assert.match(sharedChart, /getNearestNumericLineChartPoint\(interactivePoints/);
});

test("Focus config preserves a plain zero axis label and duration values", () => {
  assert.match(source, /formatAxisValue=\{\(value\) => value === 0 \? "0" : formatRoundedMinuteDuration\(value\)\}/);
  assert.match(sharedChart, /axisValueFormatter = formatAxisValue \?\? formatValue/);
});

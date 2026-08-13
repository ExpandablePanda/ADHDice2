import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachDailyOverallGoalSeconds } from "../src/lib/focus-activity.ts";
import { getFocusActivityScrollAvailability, getFocusActivityScrollBehavior, getFocusActivityScrollDistance } from "../src/lib/focus-activity-scroll.ts";

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
  assert.match(sharedChart, /NumericLineChartSeries/);
  assert.match(sharedChart, /onPointerMove/);
  assert.match(sharedChart, /onPointerUp/);
});

test("shared line chart hover uses scaled X/Y distance for the nearest point", () => {
  assert.match(sharedChart, /const localX = \(\(clientX - bounds\.left\) \/ Math\.max\(bounds\.width, 1\)\) \* CHART_WIDTH/);
  assert.match(sharedChart, /const localY = \(\(clientY - bounds\.top\) \/ Math\.max\(bounds\.height, 1\)\) \* CHART_HEIGHT/);
  assert.match(sharedChart, /Math\.hypot\(point\.x - localX, point\.y - localY\)/);
});

test("Focus config preserves a plain zero axis label and duration values", () => {
  assert.match(source, /formatAxisValue=\{\(value\) => value === 0 \? "0" : formatRoundedMinuteDuration\(value\)\}/);
  assert.match(sharedChart, /axisValueFormatter = formatAxisValue \?\? formatValue/);
});

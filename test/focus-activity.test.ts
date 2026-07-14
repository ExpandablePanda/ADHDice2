import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachDailyOverallGoalSeconds } from "../src/lib/focus-activity.ts";

const source = readFileSync(new URL("../src/components/focus-history.tsx", import.meta.url), "utf8");

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

test("Daily Overall keeps every session bar, including eight or more", () => {
  const sessions = Array.from({ length: 8 }, (_, index) => ({
    id: `session-${index + 1}`,
    seconds: (index + 1) * 60,
  }));
  const bars = sessions.map((session) => ({
    key: session.id,
    seconds: session.seconds,
  }));
  const result = attachDailyOverallGoalSeconds(bars, sessions, () => 1_800);

  assert.equal(result.length, 8);
  assert.deepEqual(result.map((bar) => bar.key), bars.map((bar) => bar.key));
  assert.equal(result.reduce((sum, bar) => sum + bar.seconds, 0), 2_160);
  assert.ok(result.every((bar) => bar.goalSeconds === 1_800));
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

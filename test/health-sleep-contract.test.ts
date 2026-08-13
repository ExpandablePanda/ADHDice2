import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { FocusSession } from "../src/lib/database.types.ts";
import { mapFocusSessionRow } from "../src/hooks/useFocus.ts";

test("Focus history maps started_at for Health Sleep editing", () => {
  const row: FocusSession = {
    category_id: "sleep-category",
    created_at: "2026-08-04T08:00:00.000Z",
    duration_seconds: 3600,
    ended_at: "2026-08-04T08:00:00.000Z",
    focus_subtype_2_snapshot: "Routine",
    focus_subtype_snapshot: "CPAP Sleep",
    focus_type_snapshot: "Sleep",
    id: "sleep-session",
    notes: null,
    runtime_session_id: null,
    session_date: "2026-08-04",
    source: "manual",
    started_at: "2026-08-04T07:00:00.000Z",
    title_snapshot: "Sleep",
    user_id: "user-1",
  };
  assert.equal(mapFocusSessionRow(row).startedAt, row.started_at);
});

test("Health Sleep stays on the existing Focus authorities", async () => {
  const [app, health, focus] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useFocus.ts", import.meta.url), "utf8"),
  ]);
  const sleepBridge = app.slice(app.indexOf("const sleepCategory"), app.indexOf("const {\n    reorderListColumns"));
  assert.match(sleepBridge, /isSleepCategory/);
  assert.doesNotMatch(sleepBridge, /setActivePage\(["']Focus["']\)/);
  assert.match(sleepBridge, /handleToggleTimer\(sleepCategory\.id, sleepActiveSession \? undefined : \{ mode: "countup" \}\)/);
  assert.match(sleepBridge, /focusSubtype: kind/);
  assert.match(health, /getSleepFocusSessions\(focusHistory, focusCategories\)/);
  assert.match(app, /activePage === "Focus" \|\| activePage === "Stats" \|\| activePage === "Health"/);
  assert.match(focus, /data\.endedAt !== undefined/);
  assert.match(focus, /started_at: data\.startedAt/);
});

test("Health Sleep selected date controls the ledger totals and graph range", async () => {
  const [health, chart, utils] = await Promise.all([
    readFile(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/health-sleep-line-chart.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/health-utils.ts", import.meta.url), "utf8"),
  ]);
  assert.match(health, /const \[sleepLedgerDate, setSleepLedgerDate\] = useState\(todayHealthDate\(\)\)/);
  assert.match(health, /ariaLabel="Sleep ledger date"[\s\S]*?max=\{today\}/);
  assert.match(health, /onChange=\{setSleepLedgerDate\}/);
  assert.match(health, /dayStepper/);
  assert.match(health, /aria-label="Previous sleep date"[\s\S]*?shiftHealthDate\(date, -1\)/);
  assert.match(health, /aria-label="Next sleep date"[\s\S]*?shiftHealthDate\(date, \+1\)/);
  assert.match(health, /disabled=\{date >= today\}/);
  assert.match(health, /nextDate > today \? today : nextDate/);
  assert.equal((health.match(/<FoodHistoryDateChip[^>]*dayStepper/g) ?? []).length, 1);
  assert.match(health, /aria-hidden=\{dayStepper && date === today\}/);
  assert.match(health, /if \(dayStepper\) \{[\s\S]*?dateInput[\s\S]*?todayButton[\s\S]*?daySteppers/);
  assert.match(health, /onClick=\{\(\) => onChange\(today\)\}/);
  assert.match(health, /const selectedSleepTotal = useMemo\([\s\S]*?date: sleepLedgerDate/);
  assert.match(health, /sleepFocusSessions\.filter\(\(session\) => session\.date === sleepLedgerDate\)/);
  assert.equal((health.match(/resolveHealthSleepKind\(session,/g) ?? []).length, 2);
  assert.match(health, /kind: resolveHealthSleepKind\(session, session\.categoryId \? focusCategories\.find/);
  assert.doesNotMatch(health, /normalizeHealthSleepKind\(session\.focusSubtype\)/);
  assert.doesNotMatch(health, /selectedSleepFocusSessions\.slice\(/);
  assert.match(health, /<HealthSleepLineChart series=\{sleepActivitySeries\} \/>/);
  assert.match(utils, /buildHealthDailySleepSeries\([\s\S]*?getHealthSleepDayTotal/);
  assert.match(chart, /ActivityLineChartCard/);
  assert.match(chart, /variant="embedded"/);
  assert.match(chart, /value: point\.totalMinutes/);
  assert.doesNotMatch(chart, /<svg/);
});

test("Apple Health sleep remains separate from Focus Sleep totals", async () => {
  const healthUtils = await readFile(new URL("../src/lib/health-utils.ts", import.meta.url), "utf8");
  assert.match(healthUtils, /const importedMinutes = sumMetricValueForDate\(metricEntries, date, \["sleep_minutes"\]\)/);
  assert.match(healthUtils, /const focusMinutes = getSleepFocusSessions\(focusHistory, focusCategories\)/);
  assert.match(healthUtils, /totalMinutes: importedMinutes \+ focusMinutes/);
});

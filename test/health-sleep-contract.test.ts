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
  assert.match(health, /ariaLabel="Sleep ledger date"[\s\S]*?today=\{today\}/);
  assert.match(health, /onChange=\{setSleepLedgerDate\}/);
  assert.match(health, /dayStepper/);
  assert.match(health, /aria-label="Previous sleep date"[\s\S]*?shiftHealthDate\(date, -1\)/);
  assert.match(health, /aria-label="Next sleep date"[\s\S]*?shiftHealthDate\(date, \+1\)/);
  assert.match(health, /disabled=\{date >= today\}/);
  assert.match(health, /nextDate > today \? today : nextDate/);
  assert.equal((health.match(/<FoodHistoryDateChip[^>]*dayStepper/g) ?? []).length, 1);
  assert.match(health, /aria-hidden=\{dayStepper && date === today\}/);
  assert.match(health, /if \(dayStepper\) \{[\s\S]*?daySteppers[\s\S]*?dateInput[\s\S]*?todayButton/);
  assert.match(health, /collapseAfterHeaderActions/);
  assert.match(health, /onClick=\{\(\) => onChange\(today\)\}/);
  assert.match(health, /const selectedSleepTotal = useMemo\([\s\S]*?date: sleepLedgerDate/);
  assert.match(health, /sleepFocusSessions\.filter\(\(session\) => session\.date === sleepLedgerDate\)/);
  assert.equal((health.match(/resolveHealthSleepKind\(session,/g) ?? []).length, 2);
  assert.match(health, /kind: resolveHealthSleepKind\(session, session\.categoryId \? focusCategories\.find/);
  assert.doesNotMatch(health, /normalizeHealthSleepKind\(session\.focusSubtype\)/);
  assert.doesNotMatch(health, /selectedSleepFocusSessions\.slice\(/);
  assert.match(health, /<HealthSleepLineChart series=\{sleepActivitySeries\} sleepGoalMinutes=\{profile\.sleep_goal_minutes\} \/>/);
  assert.match(utils, /buildHealthDailySleepSeries\([\s\S]*?getHealthSleepDayTotal/);
  assert.match(chart, /ActivityLineChartCard/);
  assert.match(chart, /variant="embedded"/);
  assert.match(chart, /value: point\.totalMinutes/);
  assert.match(chart, /referenceLines=\{sleepGoalMinutes && sleepGoalMinutes > 0/);
  assert.match(chart, /key: "sleep-goal", label: "Goal", value: sleepGoalMinutes/);
  assert.doesNotMatch(chart, /<svg/);
});

test("Apple Health sleep remains separate from Focus Sleep totals", async () => {
  const healthUtils = await readFile(new URL("../src/lib/health-utils.ts", import.meta.url), "utf8");
  assert.match(healthUtils, /const importedMinutes = sumMetricValueForDate\(metricEntries, date, \["sleep_minutes"\]\)/);
  assert.match(healthUtils, /const focusMinutes = getSleepFocusSessions\(focusHistory, focusCategories\)/);
  assert.match(healthUtils, /totalMinutes: importedMinutes \+ focusMinutes/);
});

test("Health stacked tabs use independent columns and preserve narrow-screen order", async () => {
  const [health, water] = await Promise.all([
    readFile(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/health-water-panel.tsx", import.meta.url), "utf8"),
  ]);
  const food = health.slice(health.indexOf('activeTab === "Food"'), health.indexOf('activeTab === "Water"'));
  const sleep = health.slice(health.indexOf('activeTab === "Sleep"'), health.indexOf('activeTab === "Insights"'));

  assert.equal((food.match(/<PageShell id="food-/g) ?? []).length, 4);
  assert.match(food, /<HealthPanel[\s\S]*?subtitle="Meal logging"/);
  assert.match(food, /<HealthPanel[\s\S]*?subtitle="Daily totals"/);
  assert.match(food, /title="Favorites & Recent Foods"/);
  assert.match(food, /<PageShell id="food-favorites-recent" label="Favorites & Recent Foods">/);
  assert.match(food, /<HealthLibraryPanel[\s\S]*shellSurface/);
  assert.equal((food.match(/subtitle="Meal logging"/g) ?? []).length, 1);
  assert.equal((food.match(/subtitle="Daily totals"/g) ?? []).length, 1);
  assert.equal((food.match(/title="Favorites & Recent Foods"/g) ?? []).length, 1);
  assert.equal((food.match(/<HealthLibraryPanel/g) ?? []).length, 1);
  assert.ok(food.indexOf('subtitle="Meal logging"') < food.indexOf('subtitle="Daily totals"'));
  assert.ok(food.indexOf('title="Favorites & Recent Foods"') < food.indexOf("<HealthLibraryPanel"));

  assert.equal((sleep.match(/className="grid content-start gap-5"/g) ?? []).length, 1);
  assert.doesNotMatch(sleep, /contents xl:grid/);
  assert.match(sleep, /<PageShell id="sleep-ledger"[\s\S]*shellSurface[\s\S]*title="Health sleep totals"/);
  assert.match(sleep, /<PageShell id="sleep-entry-and-sources"[\s\S]*<PageShellSurface>[\s\S]*<PageShellBody className="grid content-start gap-5"/);
  assert.match(sleep, /subtitle="Manual entry"[\s\S]*?className="xl:order-2"[\s\S]*?title="Sleep sources"[\s\S]*?className="xl:order-1"[\s\S]*?title="Sleep Ledger"/);
  assert.equal((sleep.match(/<HealthPanel/g) ?? []).length, 4);

  assert.equal((water.match(/<PageShellSurface>/g) ?? []).length, 2);
  assert.equal((water.match(/<PageShellBody className="grid content-start gap-5">/g) ?? []).length, 2);
});

test("Health descriptive rows let text wrap before responsive actions", async () => {
  const [health, library, water, scanner] = await Promise.all([
    readFile(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/health-library-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/health-water-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/health-barcode-scanner.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(health, /<HealthBarcodeScanner[\s\S]*onDetected=\{handleMealBarcodeDetected\}/);
  assert.match(scanner, /<video[\s\S]*aria-label="Barcode camera preview"/);
  assert.match(health, /getHealthMealSummaryParts\(entry\)[\s\S]*?flex shrink-0 flex-wrap justify-end gap-2/);
  assert.match(health, /title="Favorites & Recent Foods">[\s\S]*?<div className="space-y-5">/);
  assert.doesNotMatch(health, /title="Favorites & Recent Foods">[\s\S]*?overflow-y-auto/);
  assert.match(health, /Sleep Focus Clock[\s\S]*?className="flex shrink-0 flex-nowrap items-center gap-2"/);
  assert.match(health, /resolveHealthSleepKind\(session,[\s\S]*?className="flex shrink-0 items-center gap-2"/);
  assert.match(health, /importPreview\.fileName[\s\S]*?className="shrink-0 rounded-full/);
  assert.match(library, /className="flex min-w-0 items-start gap-3 rounded-\[1rem\]/);
  assert.match(library, /className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2"/);
  assert.match(water, /className="flex items-start gap-3">[\s\S]*?className="min-w-0 flex-1"[\s\S]*?flex shrink-0 flex-nowrap justify-end gap-2/);
});

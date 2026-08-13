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

test("Apple Health sleep remains separate from Focus Sleep totals", async () => {
  const healthUtils = await readFile(new URL("../src/lib/health-utils.ts", import.meta.url), "utf8");
  assert.match(healthUtils, /const importedMinutes = sumMetricValueForDate\(metricEntries, date, \["sleep_minutes"\]\)/);
  assert.match(healthUtils, /const focusMinutes = getSleepFocusSessions\(focusHistory, focusCategories\)/);
  assert.match(healthUtils, /totalMinutes: importedMinutes \+ focusMinutes/);
});

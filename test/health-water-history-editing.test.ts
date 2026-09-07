import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { createJiti } from "jiti";

import type { HealthWaterEntry, HealthWaterUnit } from "../src/lib/database.types.ts";
import { buildHealthWaterHistory, normalizeHealthWaterEntry, waterAmountToMilliliters } from "../src/lib/health-library.ts";
import { normalizeHealthProfile } from "../src/lib/health-utils.ts";

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
  jsx: { runtime: "automatic" },
});
const { getHealthWaterGoalPointContext } = await jiti.import<{
  getHealthWaterGoalPointContext: (value: number, waterGoalMl: number | null) => {
    contextLabel: string;
    contextTone: "negative" | "positive" | "neutral";
  } | null;
}>("../src/components/task-app/health-water-line-chart.tsx");

const waterPanelSource = readFileSync(
  new URL("../src/components/task-app/health-water-panel.tsx", import.meta.url),
  "utf8",
);
const waterChartSource = readFileSync(
  new URL("../src/components/task-app/health-water-line-chart.tsx", import.meta.url),
  "utf8",
);
const activityChartSource = readFileSync(
  new URL("../src/components/activity-line-chart-card.tsx", import.meta.url),
  "utf8",
);
const healthHookSource = readFileSync(
  new URL("../src/hooks/useHealth.ts", import.meta.url),
  "utf8",
);
const healthPageSource = readFileSync(
  new URL("../src/components/task-app/health-page.tsx", import.meta.url),
  "utf8",
);

function waterEntry(
  id: string,
  entryDate: string,
  amount: number,
  unit: HealthWaterUnit,
  loggedAt = `${entryDate}T12:00:00.000Z`,
): HealthWaterEntry {
  return {
    amount,
    amount_ml: waterAmountToMilliliters(amount, unit),
    confirmed_at: loggedAt,
    created_at: loggedAt,
    entry_date: entryDate,
    id,
    logged_at: loggedAt,
    unit,
    user_id: "user-1",
  };
}

test("Water History exposes historical individual entries through WaterEntryCard", () => {
  const history = buildHealthWaterHistory([
    waterEntry("water-1", "2026-08-27", 1, "cup"),
  ], "2026-08-28");

  assert.deepEqual(history[0]?.entries.map((entry) => entry.id), ["water-1"]);
  assert.match(waterPanelSource, /aria-expanded=\{expandedHistoryDates\.has\(day\.dateKey\)\}/);
  assert.match(waterPanelSource, /day\.entries\.map\(\(entry\) => \(/);
  assert.doesNotMatch(waterPanelSource, /water-history-entries-\$\{day\.dateKey\}"[^>]*sm:grid-cols-2/);
  assert.doesNotMatch(waterPanelSource, /showRemove=\{false\}/);
});

test("legacy local water rows normalize as confirmed and invalid water goals clear safely", () => {
  const legacy = normalizeHealthWaterEntry({
    amount: 1,
    amount_ml: waterAmountToMilliliters(1, "cup"),
    created_at: "2026-08-27T12:00:00.000Z",
    entry_date: "2026-08-27",
    id: "legacy-water",
    logged_at: "2026-08-27T12:00:00.000Z",
    unit: "cup",
    user_id: "user-1",
  } as HealthWaterEntry);
  assert.equal(legacy.confirmed_at, legacy.logged_at);
  assert.equal(normalizeHealthProfile({ water_goal_ml: -1 }, "user-1").water_goal_ml, null);
  assert.equal(normalizeHealthProfile({ water_goal_ml: 2365.88 }, "user-1").water_goal_ml, 2365.88);
});

test("Water entry mode uses fl oz defaults, requested presets, custom mode, and selected date/time", () => {
  assert.match(waterPanelSource, /useState<HealthWaterUnit>\("fl_oz"\)/);
  assert.match(waterPanelSource, /const \[entryStatus, setEntryStatus\] = useState<"confirmed" \| "pending">\("confirmed"\)/);
  assert.match(waterPanelSource, /Entry status/);
  assert.match(waterPanelSource, /Entry mode/);
  assert.match(waterPanelSource, /const WATER_FL_OZ_PRESETS = \[5, 10, 20\]/);
  assert.match(waterPanelSource, /const WATER_CUP_PRESETS = \[1\]/);
  assert.doesNotMatch(waterPanelSource, /addAmount\((?:8|12|16), "fl_oz"\)/);
  assert.match(waterPanelSource, /isCustomAmountSelected/);
  const customAmountSource = waterPanelSource.slice(waterPanelSource.indexOf("Custom water amount"));
  assert.match(customAmountSource, /className=\{`\$\{HEALTH_COMPACT_INPUT_CLASS\} w-20`\} inputMode="decimal"/);
  assert.match(waterPanelSource, /getCurrentHealthDateTimeInputs\(\)/);
  assert.match(waterPanelSource, /entry_date: entryDateTime\.date/);
  assert.match(waterPanelSource, /logged_at: buildLoggedAt\(entryDateTime\.date, entryDateTime\.time\)/);
  assert.match(waterPanelSource, /logged_at: string/);
  assert.match(healthHookSource, /logged_at: input\.logged_at \?\? now/);
});

test("new Water entry Date and Time use compact inline controls that wrap on mobile", () => {
  assert.match(waterPanelSource, /flex flex-wrap items-center gap-x-3 gap-y-2 border-t border/);
  assert.match(waterPanelSource, /<span className="shrink-0 font-medium">Date<\/span>/);
  assert.match(waterPanelSource, /\$\{HEALTH_COMPACT_INPUT_CLASS\} w-40 max-w-full`\}[^\n]*type="date"/);
  assert.match(waterPanelSource, /<span className="shrink-0 font-medium">Time<\/span>/);
  assert.match(waterPanelSource, /\$\{HEALTH_COMPACT_INPUT_CLASS\} w-28 max-w-full`\}[^\n]*type="time"/);
});

test("Daily Water Goal starts compact when saved and keeps a compact editor", () => {
  assert.match(waterPanelSource, /goalEditorOpenOverride/);
  assert.match(waterPanelSource, /const isGoalEditorOpen = goalEditorOpenOverride \?\? waterGoalMl === null/);
  assert.match(waterPanelSource, /No active goal/);
  assert.match(waterPanelSource, /aria-label="Edit daily water goal"/);
  assert.match(waterPanelSource, /mt-2 flex flex-wrap items-end gap-2 sm:flex-nowrap/);
  assert.match(waterPanelSource, /label className="grid w-20 max-w-20 shrink-0/);
  assert.match(waterPanelSource, /setGoalEditorOpenOverride\(false\)/);
  assert.match(waterPanelSource, /setGoalAmountOverride\(""\)/);
});

test("Water graph points expose current-goal over, under, at-goal, and no-goal context", () => {
  const goalMl = waterAmountToMilliliters(80, "fl_oz");
  assert.deepEqual(getHealthWaterGoalPointContext(60, goalMl), { contextLabel: "20 fl oz under goal", contextTone: "negative" });
  assert.deepEqual(getHealthWaterGoalPointContext(95, goalMl), { contextLabel: "15 fl oz over goal", contextTone: "positive" });
  assert.deepEqual(getHealthWaterGoalPointContext(80, goalMl), { contextLabel: "At goal", contextTone: "positive" });
  assert.equal(getHealthWaterGoalPointContext(80, null), null);
  assert.match(waterChartSource, /getHealthWaterGoalPointContext/);
  assert.match(waterChartSource, /contextLabel/);
  assert.match(activityChartSource, /contextLabel\?: string/);
  assert.match(activityChartSource, /contextTone\?: "negative" \| "positive" \| "neutral"/);
  assert.match(activityChartSource, /point\.contextLabel/);
  assert.match(activityChartSource, /activePoint\.contextLabel/);
});

test("historical entry editing uses the existing startEditing, saveEditing, and updateWaterEntry path", () => {
  assert.match(waterPanelSource, /function startEditing\(entry: HealthWaterEntry\)/);
  assert.match(waterPanelSource, /function saveEditing\(entryId: string\)/);
  assert.match(waterPanelSource, /amount_ml: waterAmountToMilliliters\(nextAmount, editDraft\.unit\)/);
  assert.match(waterPanelSource, /logged_at: buildLoggedAt\(editDraft\.date, editDraft\.time\)/);
  assert.match(waterPanelSource, /const saved = await updateWaterEntry\(entryId, \{/);
  assert.equal((waterPanelSource.match(/onStartEdit=\{startEditing\}/g) ?? []).length, 3);
  assert.equal((waterPanelSource.match(/onSaveEdit=\{saveEditing\}/g) ?? []).length, 3);
});

test("historical Water edit controls use one full-width row with compact usable sizing", () => {
  const editingSource = waterPanelSource.slice(
    waterPanelSource.indexOf("if (isEditing)"),
    waterPanelSource.indexOf("\n  return (\n    <AdhdCard>", waterPanelSource.indexOf("if (isEditing)")),
  );

  assert.match(editingSource, /flex flex-wrap items-end gap-x-3 gap-y-2/);
  assert.doesNotMatch(editingSource, /sm:grid-cols-2/);
  assert.match(editingSource, /HEALTH_COMPACT_INPUT_CLASS\} w-20 max-w-full/);
  assert.match(editingSource, /HEALTH_COMPACT_INPUT_CLASS\} w-28 max-w-full/);
  assert.match(editingSource, /HEALTH_COMPACT_INPUT_CLASS\} w-40 max-w-full/);
  assert.match(editingSource, /text-\[13px\]/);
});

test("Water History exposes Delete through the existing deleteWaterEntry authority", () => {
  assert.equal((waterPanelSource.match(/deleteWaterEntry=\{deleteWaterEntry\}/g) ?? []).length, 3);
  assert.match(waterPanelSource, /onClick=\{\(\) => \{ void deleteWaterEntry\(entry\.id\); \}\}/);
  assert.match(waterPanelSource, />\s*Delete\s*<\/AdhdChip>/);
  assert.doesNotMatch(waterPanelSource, />\s*Remove\s*<\/AdhdChip>/);
});

test("editing amount and unit recalculates displayed historical totals", () => {
  const editedEntry = waterEntry("water-1", "2026-08-27", 2, "fl_oz");
  const history = buildHealthWaterHistory([
    editedEntry,
    waterEntry("water-2", "2026-08-27", 1, "cup"),
  ], "2026-08-28");

  assert.equal(history[0]?.totals.cups, 1.25);
  assert.equal(history[0]?.totals.fluidOunces, 10);
  assert.equal(editedEntry.amount_ml, waterAmountToMilliliters(2, "fl_oz"));
});

test("changing a historical entry date moves it to the correct history group", () => {
  const movedEntry = waterEntry("water-1", "2026-08-26", 1, "cup");
  const history = buildHealthWaterHistory([movedEntry], "2026-08-28");

  assert.deepEqual(history.map((day) => ({ dateKey: day.dateKey, ids: day.entries.map((entry) => entry.id) })), [
    { dateKey: "2026-08-26", ids: ["water-1"] },
  ]);
});

test("changing a historical entry date to today removes it from History and adds it to Today’s water", () => {
  const movedEntry = waterEntry("water-1", "2026-08-28", 1, "cup");
  const todayEntries = [movedEntry].filter((entry) => entry.entry_date === "2026-08-28");

  assert.equal(buildHealthWaterHistory(todayEntries, "2026-08-28").length, 0);
  assert.deepEqual(todayEntries.map((entry) => entry.id), ["water-1"]);
  assert.match(waterPanelSource, /waterEntries\.filter\(\(entry\) => entry\.entry_date === today && isHealthWaterEntryConfirmed\(entry\)\)/);
});

test("Today’s Water keeps its existing editing binding", () => {
  assert.match(waterPanelSource, /todayEntries\.map\(\(entry\) => \(/);
  assert.match(waterPanelSource, /todayEntries\.map\(\(entry\) => \([\s\S]*?onStartEdit=\{startEditing\}/);
  assert.match(waterPanelSource, /todayEntries\.map\(\(entry\) => \([\s\S]*?onSaveEdit=\{saveEditing\}/);
});

test("Health Page destructures and forwards the Water confirmation callback", () => {
  const propsSource = healthPageSource.slice(
    healthPageSource.indexOf("export function HealthPage({"),
    healthPageSource.indexOf("}: HealthPageProps)") + "}: HealthPageProps)".length,
  );

  assert.match(propsSource, /addWaterEntry,\s*confirmWaterEntry,\s*addWorkout/);
  assert.match(healthPageSource, /confirmWaterEntry=\{confirmWaterEntry\}/);
});

test("Water History keeps the existing 14-day limit", () => {
  const entries = Array.from({ length: 15 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 7, 27 - index)).toISOString().slice(0, 10);
    return waterEntry(`water-${index + 1}`, date, 1, "cup");
  });
  const history = buildHealthWaterHistory(entries, "2026-08-28");

  assert.equal(history.length, 14);
  assert.equal(history[0]?.dateKey, "2026-08-27");
  assert.equal(history.at(-1)?.dateKey, "2026-08-14");
  assert.doesNotMatch(waterPanelSource, /\.slice\(0, 15\)/);
});

test("Water adds the shared daily fl oz line graph without synthetic days", () => {
  assert.match(waterPanelSource, /<HealthWaterLineChart history=\{waterHistory\} waterGoalMl=\{waterGoalMl\} \/>/);
  assert.match(waterChartSource, /ActivityLineChartCard/);
  assert.match(waterChartSource, /points: chronologicalHistory\.map\(\(day\) =>/);
  assert.match(waterChartSource, /value: day\.totals\.fluidOunces/);
  assert.match(waterChartSource, /formatQuantity\(value\)\} fl oz/);
  assert.match(waterChartSource, /referenceLines=\{waterGoalMl && waterGoalMl > 0/);
  assert.match(waterChartSource, /millilitersToWaterAmount\(waterGoalMl, "fl_oz"\)/);
  assert.doesNotMatch(waterChartSource, /Array\.from|fill\(0\)/);
  assert.doesNotMatch(waterChartSource, /<svg/);
});

test("Water exposes the persisted goal and Pending to Confirm row workflow", () => {
  const migration = readFileSync(new URL("../supabase/add_health_water_goal_and_confirmation_7_12_27.sql", import.meta.url), "utf8");
  assert.match(migration, /add column if not exists water_goal_ml numeric null/i);
  assert.match(migration, /water_goal_ml is null or water_goal_ml > 0/i);
  assert.match(migration, /add column confirmed_at timestamptz null/i);
  assert.match(migration, /coalesce\(logged_at, created_at\)/i);
  assert.match(migration, /alter column confirmed_at set default now\(\)/i);
  assert.match(waterPanelSource, /confirmed_at: entryStatus === "pending" \? null : new Date\(\)\.toISOString\(\)/);
  assert.match(waterPanelSource, /title="Pending water"/);
  assert.match(waterPanelSource, /confirmWaterEntry=\{confirmWaterEntry\}/);
  assert.match(waterPanelSource, /<span[^>]*>Pending<\/span>/);
  assert.match(waterPanelSource, /Confirm/);
  assert.match(waterPanelSource, />\s*Delete\s*<\/AdhdChip>/);
  assert.match(waterPanelSource, /saveWaterGoal\(/);
  const confirmationSource = healthHookSource.slice(
    healthHookSource.indexOf("async function confirmWaterEntry"),
    healthHookSource.indexOf("async function addWeightEntry"),
  );
  assert.match(confirmationSource, /existingEntry\.confirmed_at !== null/);
  assert.match(confirmationSource, /\.update\(\{ confirmed_at: confirmedAt \}\)/);
  assert.match(confirmationSource, /\.is\("confirmed_at", null\)/);
  assert.match(confirmationSource, /waterEntries\s*\.map\(\(entry\) => \(entry\.id === entryId \? nextEntry : entry\)/);
  const updateSource = healthHookSource.slice(
    healthHookSource.indexOf("async function updateWaterEntry"),
    healthHookSource.indexOf("async function confirmWaterEntry"),
  );
  assert.match(updateSource, /\.\.\.existingEntry,[\s\S]*\.\.\.input/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { HealthWaterEntry, HealthWaterUnit } from "../src/lib/database.types.ts";
import { buildHealthWaterHistory, waterAmountToMilliliters } from "../src/lib/health-library.ts";

const waterPanelSource = readFileSync(
  new URL("../src/components/task-app/health-water-panel.tsx", import.meta.url),
  "utf8",
);
const waterChartSource = readFileSync(
  new URL("../src/components/task-app/health-water-line-chart.tsx", import.meta.url),
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
  assert.match(waterPanelSource, /entry=\{entry\}[\s\S]*?showRemove=\{false\}/);
});

test("historical entry editing uses the existing startEditing, saveEditing, and updateWaterEntry path", () => {
  assert.match(waterPanelSource, /function startEditing\(entry: HealthWaterEntry\)/);
  assert.match(waterPanelSource, /function saveEditing\(entryId: string\)/);
  assert.match(waterPanelSource, /amount_ml: waterAmountToMilliliters\(nextAmount, editDraft\.unit\)/);
  assert.match(waterPanelSource, /logged_at: buildLoggedAt\(editDraft\.date, editDraft\.time\)/);
  assert.match(waterPanelSource, /const saved = await updateWaterEntry\(entryId, \{/);
  assert.equal((waterPanelSource.match(/onStartEdit=\{startEditing\}/g) ?? []).length, 2);
  assert.equal((waterPanelSource.match(/onSaveEdit=\{saveEditing\}/g) ?? []).length, 2);
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
  assert.match(waterPanelSource, /waterEntries\.filter\(\(entry\) => entry\.entry_date === today\)/);
});

test("Today’s Water keeps its existing editing binding", () => {
  assert.match(waterPanelSource, /todayEntries\.map\(\(entry\) => \(/);
  assert.match(waterPanelSource, /todayEntries\.map\(\(entry\) => \([\s\S]*?onStartEdit=\{startEditing\}/);
  assert.match(waterPanelSource, /todayEntries\.map\(\(entry\) => \([\s\S]*?onSaveEdit=\{saveEditing\}/);
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

test("Water adds the shared daily fl oz line graph without synthetic days or a goal", () => {
  assert.match(waterPanelSource, /<HealthWaterLineChart history=\{waterHistory\} \/>/);
  assert.match(waterChartSource, /ActivityLineChartCard/);
  assert.match(waterChartSource, /points: chronologicalHistory\.map\(\(day\) =>/);
  assert.match(waterChartSource, /value: day\.totals\.fluidOunces/);
  assert.match(waterChartSource, /formatQuantity\(value\)\} fl oz/);
  assert.doesNotMatch(waterChartSource, /referenceLines|Array\.from|fill\(0\)/);
  assert.doesNotMatch(waterChartSource, /<svg/);
});

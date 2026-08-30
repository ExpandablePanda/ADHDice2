import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { HealthSymptom, HealthSymptomEntry } from "../src/lib/database.types.ts";
import { getNumericLineChartDomainKeys, getNumericLineChartXPositions } from "../src/components/activity-line-chart-card.tsx";
import { ADHDICE_ACCENT_COLORS } from "../src/lib/accent-colors.ts";
import {
  ALL_HEALTH_SYMPTOMS_VALUE,
  DEFAULT_HEALTH_SYMPTOM_COLOR,
  groupHealthSymptomEntriesByDate,
  getDefaultHealthSymptomId,
  getHealthSymptomTrendEntries,
  getHealthSymptomTrendEntriesBySymptom,
  getLatestHealthSymptomTrendSeverity,
  getSelectableHealthSymptoms,
  HEALTH_MOOD_OPTIONS,
  HEALTH_SCALE_OPTIONS,
  HEALTH_SEVERITY_OPTIONS,
  HEALTH_SYMPTOM_TREND_RANGES,
  normalizeHealthSymptom,
  normalizeHealthSymptomColor,
  normalizeHealthSymptomName,
  normalizeHealthSymptomNote,
  reconcileHealthSymptoms,
} from "../src/lib/health-utils.ts";

const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../supabase/add_health_journal_symptom_tracking_7_12_7.sql", import.meta.url),
  "utf8",
);
const colorMigrationSource = readFileSync(
  new URL("../supabase/add_health_journal_symptom_colors_7_12_21.sql", import.meta.url),
  "utf8",
);
const healthHookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const healthPageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const activityChartSource = readFileSync(new URL("../src/components/activity-line-chart-card.tsx", import.meta.url), "utf8");

function symptomEntry(
  id: string,
  entryDate: string,
  loggedAt: string,
  severity: number,
  symptomId = "symptom-1",
) {
  return {
    created_at: loggedAt,
    entry_date: entryDate,
    id,
    logged_at: loggedAt,
    note: null,
    severity,
    symptom_id: symptomId,
    updated_at: loggedAt,
    user_id: "user-1",
  };
}

function symptomDefinition(
  id: string,
  name: string,
  archivedAt: string | null = null,
  color = DEFAULT_HEALTH_SYMPTOM_COLOR,
): HealthSymptom {
  const timestamp = `${id}-timestamp`;
  return {
    archived_at: archivedAt,
    color,
    created_at: timestamp,
    id,
    name,
    updated_at: timestamp,
    user_id: "user-1",
  };
}

test("symptom colors use the approved palette and safely normalize legacy values", () => {
  assert.deepEqual([...ADHDICE_ACCENT_COLORS], [
    "#6f57f6",
    "#3b82f6",
    "#06b6d4",
    "#14b8a6",
    "#12a876",
    "#84cc16",
    "#f59e0b",
    "#ea580c",
    "#f97316",
    "#ef4444",
    "#f05566",
    "#ec4899",
    "#d946ef",
    "#8b5cf6",
    "#6366f1",
    "#64748b",
  ]);
  assert.equal(DEFAULT_HEALTH_SYMPTOM_COLOR, "#6f57f6");
  assert.equal(normalizeHealthSymptomColor(undefined), DEFAULT_HEALTH_SYMPTOM_COLOR);
  assert.equal(normalizeHealthSymptomColor("not-a-color"), DEFAULT_HEALTH_SYMPTOM_COLOR);
  assert.equal(normalizeHealthSymptomColor(" #EC4899 "), "#ec4899");
  const legacySymptom = { ...symptomDefinition("legacy", "Legacy"), color: undefined } as unknown as HealthSymptom;
  assert.equal(normalizeHealthSymptom(legacySymptom).color, DEFAULT_HEALTH_SYMPTOM_COLOR);
});

test("Journal scales use 1 through 10 and normalize symptom input", () => {
  assert.deepEqual([...HEALTH_SCALE_OPTIONS], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual([...HEALTH_MOOD_OPTIONS], [...HEALTH_SCALE_OPTIONS]);
  assert.deepEqual([...HEALTH_SEVERITY_OPTIONS], [...HEALTH_SCALE_OPTIONS]);
  assert.equal(normalizeHealthSymptomName("  Back   Pain  "), "Back Pain");
  assert.equal(normalizeHealthSymptomNote("  after walking  "), "after walking");
  assert.equal(normalizeHealthSymptomNote("   "), null);
});

test("same symptom entries coexist and remain individually grouped by day and time", () => {
  const groups = groupHealthSymptomEntriesByDate([
    symptomEntry("morning", "2026-08-29", "2026-08-29T09:00:00.000Z", 3),
    symptomEntry("afternoon", "2026-08-29", "2026-08-29T13:30:00.000Z", 6),
    symptomEntry("prior-day", "2026-08-28", "2026-08-28T19:30:00.000Z", 4),
  ]);

  assert.deepEqual(groups.map((group) => group.date), ["2026-08-29", "2026-08-28"]);
  assert.deepEqual(groups[0]?.entries.map((entry) => [entry.id, entry.severity]), [
    ["afternoon", 6],
    ["morning", 3],
  ]);
  assert.equal(groups[0]?.entries.length, 2);
});

test("symptom trends order timestamped entries and preserve multiple same-day points", () => {
  const entries = [
    symptomEntry("afternoon", "2026-08-29", "2026-08-29T13:30:00.000Z", 6),
    symptomEntry("prior-day", "2026-08-28", "2026-08-28T19:30:00.000Z", 4),
    symptomEntry("morning", "2026-08-29", "2026-08-29T09:00:00.000Z", 3),
    symptomEntry("other-symptom", "2026-08-29", "2026-08-29T15:00:00.000Z", 9, "symptom-2"),
  ];
  const trendEntries = getHealthSymptomTrendEntries({
    asOfDate: "2026-08-29",
    entries,
    range: "All",
    symptomId: "symptom-1",
  });

  assert.deepEqual(trendEntries.map((entry) => [entry.id, entry.severity]), [
    ["prior-day", 4],
    ["morning", 3],
    ["afternoon", 6],
  ]);
  assert.equal(trendEntries.filter((entry) => entry.entry_date === "2026-08-29").length, 2);
  assert.equal(getLatestHealthSymptomTrendSeverity(trendEntries), 6);
});

test("symptom trend calendar domains align same-day points without changing legacy index positioning", () => {
  const points = [
    { key: "morning", xDomainKey: "2026-08-29" },
    { key: "afternoon", xDomainKey: "2026-08-29" },
    { key: "evening", xDomainKey: "2026-08-29" },
    { key: "next-day", xDomainKey: "2026-08-30" },
  ];
  const datePositions = getNumericLineChartXPositions(points);
  const legacyPositions = getNumericLineChartXPositions([{ key: "first" }, { key: "second" }, { key: "third" }]);

  assert.equal(datePositions[0]?.x, datePositions[1]?.x);
  assert.equal(datePositions[1]?.x, datePositions[2]?.x);
  assert.ok((datePositions[3]?.x ?? 0) > (datePositions[2]?.x ?? 0));
  assert.notEqual(legacyPositions[0]?.x, legacyPositions[1]?.x);
  assert.notEqual(legacyPositions[1]?.x, legacyPositions[2]?.x);
});

test("symptom trend summary uses the latest visible severity, never a sum, and follows range-filtered points", () => {
  const entries = [
    symptomEntry("older", "2026-08-01", "2026-08-01T09:00:00.000Z", 3),
    symptomEntry("visible", "2026-08-23", "2026-08-23T09:00:00.000Z", 7),
    symptomEntry("future", "2026-08-30", "2026-08-30T09:00:00.000Z", 4),
  ];
  const visibleEntries = getHealthSymptomTrendEntries({
    asOfDate: "2026-08-29",
    entries,
    range: "7D",
    symptomId: "symptom-1",
  });
  const allEntries = getHealthSymptomTrendEntries({
    asOfDate: "2026-08-29",
    entries,
    range: "All",
    symptomId: "symptom-1",
  });

  assert.deepEqual(visibleEntries.map((entry) => entry.severity), [7]);
  assert.deepEqual(allEntries.map((entry) => entry.severity), [3, 7, 4]);
  assert.equal(getLatestHealthSymptomTrendSeverity(visibleEntries), 7);
  assert.equal(getLatestHealthSymptomTrendSeverity(allEntries), 4);
  assert.notEqual(getLatestHealthSymptomTrendSeverity(allEntries), 14);
  assert.equal(getLatestHealthSymptomTrendSeverity([]), null);
});

test("symptom trends filter calendar ranges without synthesizing or aggregating points", () => {
  const entries = [
    symptomEntry("older", "2026-07-01", "2026-07-01T09:00:00.000Z", 2),
    symptomEntry("month", "2026-08-01", "2026-08-01T09:00:00.000Z", 4),
    symptomEntry("seven", "2026-08-23", "2026-08-23T09:00:00.000Z", 7),
    symptomEntry("today", "2026-08-29", "2026-08-29T09:00:00.000Z", 5),
    symptomEntry("future", "2026-08-30", "2026-08-30T09:00:00.000Z", 10),
  ];

  assert.deepEqual(getHealthSymptomTrendEntries({ asOfDate: "2026-08-29", entries, range: "7D", symptomId: "symptom-1" }).map((entry) => entry.id), ["seven", "today"]);
  assert.deepEqual(getHealthSymptomTrendEntries({ asOfDate: "2026-08-29", entries, range: "30D", symptomId: "symptom-1" }).map((entry) => entry.id), ["month", "seven", "today"]);
  assert.deepEqual(getHealthSymptomTrendEntries({ asOfDate: "2026-08-29", entries, range: "90D", symptomId: "symptom-1" }).map((entry) => entry.id), ["older", "month", "seven", "today"]);
  assert.deepEqual(getHealthSymptomTrendEntries({ asOfDate: "2026-08-29", entries, range: "All", symptomId: "symptom-1" }).map((entry) => entry.id), ["older", "month", "seven", "today", "future"]);
});

test("symptom trends keep archived symptoms selectable when they have ledger history and choose the latest logged symptom", () => {
  const activeSymptom = symptomDefinition("active", "Active Symptom");
  const archivedWithHistory = symptomDefinition("archived-with-history", "Old Symptom", "2026-08-28T12:00:00.000Z");
  const archivedWithoutHistory = symptomDefinition("archived-without-history", "Unused Symptom", "2026-08-28T12:00:00.000Z");
  const entries = [
    symptomEntry("active-entry", "2026-08-29", "2026-08-29T09:00:00.000Z", 3, activeSymptom.id),
    symptomEntry("archived-entry", "2026-08-29", "2026-08-29T13:00:00.000Z", 8, archivedWithHistory.id),
  ];

  assert.deepEqual(getSelectableHealthSymptoms([archivedWithoutHistory, archivedWithHistory, activeSymptom], entries).map((symptom) => symptom.id), [activeSymptom.id, archivedWithHistory.id]);
  assert.equal(getDefaultHealthSymptomId([archivedWithoutHistory, archivedWithHistory, activeSymptom], entries), archivedWithHistory.id);
});

test("all symptom trends keep selectable order, raw entries, independent latest values, and archived history", () => {
  const backPain = symptomDefinition("back", "Back Pain", null, "#ef4444");
  const archivedHeadache = symptomDefinition("headache", "Headache", "2026-08-28T12:00:00.000Z", "#3b82f6");
  const reflux = symptomDefinition("reflux", "Reflux", null, "#14b8a6");
  const entries = [
    symptomEntry("back-30", "2026-08-30", "2026-08-30T13:00:00.000Z", 4, backPain.id),
    symptomEntry("back-28", "2026-08-28", "2026-08-28T09:00:00.000Z", 3, backPain.id),
    symptomEntry("headache-29", "2026-08-29", "2026-08-29T11:00:00.000Z", 7, archivedHeadache.id),
    symptomEntry("reflux-old", "2026-07-01", "2026-07-01T11:00:00.000Z", 2, reflux.id),
  ];
  const selectableSymptoms = getSelectableHealthSymptoms([archivedHeadache, reflux, backPain], entries);
  const visibleSeries = getHealthSymptomTrendEntriesBySymptom({
    asOfDate: "2026-08-30",
    entries,
    range: "7D",
    symptoms: selectableSymptoms,
  });

  assert.equal(ALL_HEALTH_SYMPTOMS_VALUE, "__all_symptoms__");
  assert.deepEqual(selectableSymptoms.map((symptom) => symptom.id), [backPain.id, reflux.id, archivedHeadache.id]);
  assert.deepEqual(visibleSeries.map(({ symptom }) => symptom.id), [backPain.id, archivedHeadache.id]);
  assert.deepEqual(visibleSeries[0]?.entries.map((entry) => entry.id), ["back-28", "back-30"]);
  assert.equal(getLatestHealthSymptomTrendSeverity(visibleSeries[0]?.entries ?? []), 4);
  assert.equal(getLatestHealthSymptomTrendSeverity(visibleSeries[1]?.entries ?? []), 7);
  assert.equal(visibleSeries.find(({ symptom }) => symptom.id === reflux.id), undefined);
  assert.equal(getDefaultHealthSymptomId(selectableSymptoms, entries), backPain.id);
  assert.notEqual(getDefaultHealthSymptomId(selectableSymptoms, entries), ALL_HEALTH_SYMPTOMS_VALUE);
});

test("shared chart unions chronological date domains across series while preserving same-day and legacy positions", () => {
  const backPainPoints = [
    { key: "back-28", xDomainKey: "2026-08-28" },
    { key: "back-30", xDomainKey: "2026-08-30" },
  ];
  const headachePoints = [
    { key: "headache-29", xDomainKey: "2026-08-29" },
    { key: "headache-30", xDomainKey: "2026-08-30" },
    { key: "headache-31", xDomainKey: "2026-08-31" },
  ];
  const domainKeys = getNumericLineChartDomainKeys([...backPainPoints, ...headachePoints]);
  const backPainPositions = getNumericLineChartXPositions(backPainPoints, domainKeys);
  const headachePositions = getNumericLineChartXPositions(headachePoints, domainKeys);
  const legacyPositions = getNumericLineChartXPositions([{ key: "first" }, { key: "second" }, { key: "third" }]);

  assert.deepEqual(domainKeys, ["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31"]);
  assert.equal(backPainPositions[1]?.x, headachePositions[1]?.x);
  assert.ok((backPainPositions[1]?.x ?? 0) > (backPainPositions[0]?.x ?? 0));
  assert.notEqual(legacyPositions[0]?.x, legacyPositions[1]?.x);
  assert.notEqual(legacyPositions[1]?.x, legacyPositions[2]?.x);
});

test("symptom colors survive reconciliation and archived definitions retain their assigned color", () => {
  const localRemoteDefinition = symptomDefinition("same-id", "Headache", null, "#ef4444");
  const remoteDefinition = symptomDefinition("same-id", "Headache", null, "#3b82f6");
  const archivedDefinition = symptomDefinition("archived", "Old Pain", "2026-08-28T12:00:00.000Z", "#06b6d4");
  const recovery = reconcileHealthSymptoms(
    [localRemoteDefinition, archivedDefinition],
    [remoteDefinition],
    [],
    [],
  );

  assert.equal(recovery.mergedSymptoms.find((symptom) => symptom.id === remoteDefinition.id)?.color, remoteDefinition.color);
  assert.equal(recovery.mergedSymptoms.find((symptom) => symptom.id === archivedDefinition.id)?.color, archivedDefinition.color);
  assert.equal(getSelectableHealthSymptoms(recovery.mergedSymptoms, [symptomEntry("archived-entry", "2026-08-29", "2026-08-29T09:00:00.000Z", 5, archivedDefinition.id)])[1]?.color, archivedDefinition.color);
});

test("Journal symptom trends adapt into the shared chart with a fixed 1 to 10 severity scale", () => {
  assert.deepEqual([...HEALTH_SYMPTOM_TREND_RANGES], ["7D", "30D", "90D", "All"]);
  assert.match(healthPageSource, /ActivityLineChartCard/);
  assert.match(healthPageSource, /getHealthSymptomTrendEntries/);
  assert.match(healthPageSource, /HEALTH_SYMPTOM_TREND_RANGES/);
  assert.match(healthPageSource, /title="Symptom Trends"/);
  assert.match(healthPageSource, /key: entry\.id/);
  assert.match(healthPageSource, /summaryLabel,/);
  assert.match(healthPageSource, /buildHealthSymptomTrendSeries\(selectedSymptomTrend, selectedSymptomTrendEntries, "Latest"\)/);
  assert.match(healthPageSource, /buildHealthSymptomTrendSeries\(symptom, entries, symptom\.name\)/);
  assert.match(healthPageSource, /label: "All Symptoms", value: ALL_HEALTH_SYMPTOMS_VALUE/);
  const allSymptomsOptionStart = healthPageSource.indexOf('label: "All Symptoms"');
  const allSymptomsOptionSource = healthPageSource.slice(allSymptomsOptionStart, allSymptomsOptionStart + 90);
  assert.doesNotMatch(allSymptomsOptionSource, /trailingAction/);
  assert.match(healthPageSource, /getHealthSymptomTrendEntriesBySymptom/);
  assert.match(healthPageSource, /title=\{isAllSymptomsTrendSelected \? "All symptom severity"/);
  assert.match(healthPageSource, /No symptom history is available to graph yet\./);
  assert.match(healthPageSource, /No symptom entries in the selected range\./);
  assert.match(healthPageSource, /ariaLabel=\{isAllSymptomsTrendSelected/);
  assert.match(healthPageSource, /color: normalizeHealthSymptomColor\(symptom\.color\)/);
  assert.doesNotMatch(healthPageSource, /totalValue: selectedSymptomTrendEntries\.reduce/);
  assert.match(healthPageSource, /xDomainKey: entry\.entry_date/);
  assert.match(healthPageSource, /label: formatHealthDateLabel\(entry\.entry_date\)/);
  assert.match(healthPageSource, /compactPlot/);
  assert.match(healthPageSource, /maxValue=\{10\}/);
  assert.match(activityChartSource, /xDomainKey\?: string/);
  assert.match(activityChartSource, /compactPlot\?: boolean/);
  assert.match(activityChartSource, /const plotClassName = compactPlot\s+\? "min-w-\[42rem\]"/);
  assert.match(activityChartSource, /axisLabelPoints/);
  assert.match(activityChartSource, /const chartDomainPoints = series\.flatMap\(\(item\) => item\.points\)/);
  assert.match(activityChartSource, /const axisDomainKeys = getNumericLineChartDomainKeys\(chartDomainPoints\)/);
  assert.doesNotMatch(activityChartSource, /const axisDomainKeys = getNumericLineChartDomainKeys\(axisPoints\)/);
  assert.match(activityChartSource, /maxValue\?: number/);
  assert.match(activityChartSource, /maxValueOverride/);
  assert.match(activityChartSource, /item\.summaryLabel \?\? item\.label/);
});

test("local symptom recovery keeps an empty remote response visible and recovers definitions before entries", () => {
  const localDefinition = symptomDefinition("local-back-pain", "Back Pain");
  const archivedDefinition = symptomDefinition("local-archived", "Old Pain", "2026-08-28T12:00:00.000Z");
  const existingRemoteDefinition = symptomDefinition("remote-headache", "Headache");
  const localEntry = {
    ...symptomEntry("local-entry", "2026-08-29", "2026-08-29T09:00:00.000Z", 3, localDefinition.id),
    note: "after walking",
  };
  const archivedEntry = symptomEntry("archived-entry", "2026-08-28", "2026-08-28T12:00:00.000Z", 8, archivedDefinition.id);
  const existingRemoteEntry = symptomEntry("remote-entry", "2026-08-29", "2026-08-29T08:00:00.000Z", 2, existingRemoteDefinition.id);
  const localDefinitions = [localDefinition, archivedDefinition];
  const localEntries: HealthSymptomEntry[] = [localEntry, archivedEntry];

  let remoteDefinitions: HealthSymptom[] = [];
  let remoteEntries: HealthSymptomEntry[] = [];
  const recoveryCalls: string[] = [];
  let plan = reconcileHealthSymptoms(localDefinitions, remoteDefinitions, localEntries, remoteEntries);

  assert.deepEqual(plan.mergedSymptoms.map((symptom) => symptom.id).sort(), localDefinitions.map((symptom) => symptom.id).sort());
  assert.deepEqual(plan.mergedEntries.map((entry) => entry.id).sort(), localEntries.map((entry) => entry.id).sort());
  assert.deepEqual(plan.unreconciledLocalSymptoms.map((symptom) => symptom.id).sort(), [archivedDefinition.id, localDefinition.id].sort());
  assert.deepEqual(plan.unreconciledLocalEntries, []);

  recoveryCalls.push("definitions");
  remoteDefinitions = [localDefinition, archivedDefinition];
  plan = reconcileHealthSymptoms(localDefinitions, remoteDefinitions, localEntries, remoteEntries);
  assert.deepEqual(plan.unreconciledLocalEntries.map((entry) => entry.id).sort(), [archivedEntry.id, localEntry.id].sort());

  assert.ok(remoteDefinitions.some((symptom) => symptom.id === localDefinition.id));
  recoveryCalls.push("entries");
  remoteEntries = [localEntry, archivedEntry];
  plan = reconcileHealthSymptoms(localDefinitions, remoteDefinitions, localEntries, remoteEntries);

  assert.deepEqual(recoveryCalls, ["definitions", "entries"]);
  assert.deepEqual(plan.unreconciledLocalSymptoms, []);
  assert.deepEqual(plan.unreconciledLocalEntries, []);
  assert.equal(plan.mergedSymptoms.filter((symptom) => symptom.id === localDefinition.id).length, 1);
  assert.equal(plan.mergedEntries.filter((entry) => entry.id === localEntry.id).length, 1);
  assert.equal(plan.mergedSymptoms.find((symptom) => symptom.id === archivedDefinition.id)?.archived_at, archivedDefinition.archived_at);
  assert.deepEqual(plan.mergedEntries.find((entry) => entry.id === localEntry.id), localEntry);
  assert.equal(plan.mergedEntries.find((entry) => entry.id === archivedEntry.id)?.symptom_id, archivedDefinition.id);

  const existingRemotePlan = reconcileHealthSymptoms(
    [existingRemoteDefinition],
    [existingRemoteDefinition],
    [existingRemoteEntry],
    [existingRemoteEntry],
  );
  assert.deepEqual(existingRemotePlan.unreconciledLocalSymptoms, []);
  assert.deepEqual(existingRemotePlan.unreconciledLocalEntries, []);
  assert.equal(existingRemotePlan.mergedSymptoms.length, 1);
  assert.equal(existingRemotePlan.mergedEntries.length, 1);

  const staleLocalDefinition = symptomDefinition(existingRemoteDefinition.id, "Stale Headache");
  const remoteWinsPlan = reconcileHealthSymptoms(
    [staleLocalDefinition],
    [existingRemoteDefinition],
    [],
    [],
  );
  assert.equal(remoteWinsPlan.mergedSymptoms[0]?.name, existingRemoteDefinition.name);

  const repeated = reconcileHealthSymptoms(
    [...localDefinitions],
    [...remoteDefinitions],
    [...localEntries],
    [...remoteEntries],
  );
  assert.deepEqual(repeated.unreconciledLocalSymptoms, []);
  assert.deepEqual(repeated.unreconciledLocalEntries, []);
  assert.equal(new Set(repeated.mergedSymptoms.map((symptom) => symptom.id)).size, 2);
  assert.equal(new Set(repeated.mergedEntries.map((entry) => entry.id)).size, 2);
});

test("remote active symptom names canonicalize local IDs and remap dependent entries", () => {
  const localDefinition = symptomDefinition("local-headache", "headache");
  const remoteDefinition = symptomDefinition("remote-headache", "Headache");
  const localEntry = {
    ...symptomEntry("local-headache-entry", "2026-08-29", "2026-08-29T09:00:00.000Z", 7, localDefinition.id),
    note: "still present",
  };

  const recovery = reconcileHealthSymptoms(
    [localDefinition],
    [remoteDefinition],
    [localEntry],
    [],
  );

  assert.deepEqual(recovery.unreconciledLocalSymptoms, []);
  assert.deepEqual(recovery.mergedSymptoms.map((symptom) => symptom.id), [remoteDefinition.id]);
  assert.deepEqual(recovery.unreconciledLocalEntries, [{ ...localEntry, symptom_id: remoteDefinition.id }]);
  assert.deepEqual(recovery.mergedEntries, [{ ...localEntry, symptom_id: remoteDefinition.id }]);
  assert.equal(recovery.mergedEntries[0]?.id, localEntry.id);
  assert.equal(recovery.mergedEntries[0]?.entry_date, localEntry.entry_date);
  assert.equal(recovery.mergedEntries[0]?.logged_at, localEntry.logged_at);
  assert.equal(recovery.mergedEntries[0]?.severity, localEntry.severity);
  assert.equal(recovery.mergedEntries[0]?.note, localEntry.note);
});

test("multiple active name collisions are canonicalized while archived definitions remain ID-based", () => {
  const localHeadache = symptomDefinition("local-headache", "HEADACHE");
  const localFatigue = symptomDefinition("local-fatigue", "  fatigue  ");
  const localArchivedHeadache = symptomDefinition("local-archived-headache", "Headache", "2026-08-28T12:00:00.000Z");
  const remoteHeadache = symptomDefinition("remote-headache", "Headache");
  const remoteFatigue = symptomDefinition("remote-fatigue", "Fatigue");
  const localEntries = [
    symptomEntry("headache-entry", "2026-08-29", "2026-08-29T09:00:00.000Z", 3, localHeadache.id),
    symptomEntry("fatigue-entry", "2026-08-29", "2026-08-29T10:00:00.000Z", 4, localFatigue.id),
    symptomEntry("archived-entry", "2026-08-28", "2026-08-28T10:00:00.000Z", 5, localArchivedHeadache.id),
  ];

  const recovery = reconcileHealthSymptoms(
    [localHeadache, localFatigue, localArchivedHeadache],
    [remoteHeadache, remoteFatigue],
    localEntries,
    [],
  );

  assert.deepEqual(recovery.unreconciledLocalSymptoms.map((symptom) => symptom.id), [localArchivedHeadache.id]);
  assert.deepEqual(recovery.mergedSymptoms.map((symptom) => symptom.id).sort(), [
    localArchivedHeadache.id,
    remoteFatigue.id,
    remoteHeadache.id,
  ].sort());
  assert.deepEqual(
    recovery.unreconciledLocalEntries.map((entry) => [entry.id, entry.symptom_id]).sort(),
    [
      ["fatigue-entry", remoteFatigue.id],
      ["headache-entry", remoteHeadache.id],
    ].sort(),
  );
  assert.equal(recovery.mergedEntries.find((entry) => entry.id === "archived-entry")?.symptom_id, localArchivedHeadache.id);
});

test("genuinely new local symptoms remain eligible for definition recovery", () => {
  const localDefinition = symptomDefinition("local-nausea", "Nausea");
  const localEntry = symptomEntry("local-nausea-entry", "2026-08-29", "2026-08-29T11:00:00.000Z", 2, localDefinition.id);
  const recovery = reconcileHealthSymptoms([localDefinition], [], [localEntry], []);

  assert.deepEqual(recovery.unreconciledLocalSymptoms, [localDefinition]);
  assert.deepEqual(recovery.mergedSymptoms, [localDefinition]);
  assert.deepEqual(recovery.unreconciledLocalEntries, []);
  assert.deepEqual(recovery.mergedEntries, [localEntry]);
});

test("the migration expands daily scores without rewriting existing values", () => {
  assert.match(migrationSource, /mood_score_range_check[\s\S]*?mood_score >= 1 and mood_score <= 10/i);
  assert.match(migrationSource, /energy_score_range_check[\s\S]*?energy_score >= 1 and energy_score <= 10/i);
  assert.match(schemaSource, /mood_score_range_check[\s\S]*?mood_score >= 1 and mood_score <= 10/i);
  assert.match(schemaSource, /energy_score_range_check[\s\S]*?energy_score >= 1 and energy_score <= 10/i);
  assert.match(schemaSource, /symptom_tags text\[\] not null default '\{\}'/);
  assert.match(schemaSource, /unique \(user_id, entry_date\)/);
});

test("symptom storage is normalized, unlimited per day, and preserves history on archive", () => {
  for (const source of [schemaSource, migrationSource]) {
    assert.match(source, /create table[^;]+adhdice_health_symptoms/i);
    assert.match(source, /create table[^;]+adhdice_health_symptom_entries/i);
    assert.match(source, /archived_at timestamptz/i);
    assert.match(source, /severity integer not null check \(severity >= 1 and severity <= 10\)/i);
    assert.match(source, /foreign key \(user_id, symptom_id\)[\s\S]*?on delete restrict/i);
    assert.match(source, /unique index[^;]+lower\(regexp_replace\(trim\(name\)/i);
    assert.doesNotMatch(source, /unique\s*\(\s*user_id\s*,\s*symptom_id\s*,\s*entry_date\s*\)/i);
  }
});

test("symptom definition colors are persisted with a safe default and never added to entries", () => {
  assert.match(schemaSource, /color text not null default '#6f57f6'[\s\S]*?constraint adhdice_health_symptoms_color_hex_check check \(color ~ '\^#\[0-9A-Fa-f\]\{6\}\$'\)/i);
  assert.match(colorMigrationSource, /add column if not exists color text/i);
  assert.match(colorMigrationSource, /set color = '#6f57f6'/i);
  assert.match(colorMigrationSource, /alter column color set default '#6f57f6'/i);
  assert.match(colorMigrationSource, /alter column color set not null/i);
  assert.match(colorMigrationSource, /add constraint adhdice_health_symptoms_color_hex_check/i);
  assert.doesNotMatch(colorMigrationSource, /adhdice_health_symptom_entries[\s\S]*color/i);
  assert.match(healthHookSource, /color: symptom\.color/);
  assert.match(healthHookSource, /color: normalizeHealthSymptomColor\(input\.color\)/);
  assert.match(healthHookSource, /insert\(\{ \.\.\.input, archived_at: null, color: localRow\.color/);
});

test("new symptom tables use authenticated owner-scoped Data API access", () => {
  for (const source of [schemaSource, migrationSource]) {
    assert.match(source, /enable row level security[\s\S]*adhdice_health_symptoms/i);
    assert.match(source, /enable row level security[\s\S]*adhdice_health_symptom_entries/i);
    assert.match(source, /revoke all on table public\.adhdice_health_symptoms from anon, authenticated/i);
    assert.match(source, /revoke all on table public\.adhdice_health_symptom_entries from anon, authenticated/i);
    assert.match(source, /grant select, insert, update on table public\.adhdice_health_symptoms to authenticated/i);
    assert.match(source, /grant select, insert, update, delete on table public\.adhdice_health_symptom_entries to authenticated/i);
    assert.match(source, /for update[\s\S]*?to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  }
});

test("symptom persistence has its own optional fallback and CRUD paths", () => {
  assert.match(healthHookSource, /symptomsResult\.error, symptomEntriesResult\.error/);
  assert.match(healthHookSource, /const symptomPersistenceErrors = \[symptomsResult\.error, symptomEntriesResult\.error\]/);
  assert.match(healthHookSource, /function isMissingHealthSymptomPersistence/);
  assert.match(healthHookSource, /symptomDefinitionsRemoteEnabledRef/);
  assert.match(healthHookSource, /symptomEntriesRemoteEnabledRef/);
  assert.match(healthHookSource, /storageKey\(userId, "symptoms"\)/);
  assert.match(healthHookSource, /storageKey\(userId, "symptom-entries"\)/);
  assert.match(healthHookSource, /async function createSymptom/);
  assert.match(healthHookSource, /async function renameSymptom/);
  assert.match(healthHookSource, /async function setSymptomColor\(symptomId: string, color: string\)/);
  assert.match(healthHookSource, /return updateSymptomDefinition\(symptomId, \{ color: normalizeHealthSymptomColor\(color\) \}/);
  assert.match(healthHookSource, /\.\.\.\(input\.color === undefined \? \{\} : \{ color: normalizeHealthSymptomColor\(input\.color\) \}\)/);
  const symptomDefinitionUpdate = healthHookSource.slice(
    healthHookSource.indexOf("async function updateSymptomDefinition"),
    healthHookSource.indexOf("async function createSymptom"),
  );
  assert.match(symptomDefinitionUpdate, /\.update\(normalizedInput\)[\s\S]*?\.eq\("id", symptomId\)[\s\S]*?\.eq\("user_id", userId\)/);
  assert.match(healthHookSource, /async function archiveSymptom/);
  assert.match(healthHookSource, /async function addSymptomEntry/);
  assert.match(healthHookSource, /async function updateSymptomEntry/);
  assert.match(healthHookSource, /async function deleteSymptomEntry/);
  assert.match(healthHookSource, /\.eq\("id", entryId\)\n\s+\.eq\("user_id", userId\)/);
  const recoverySectionStart = healthHookSource.indexOf("let remoteSymptoms =");
  const recoverySectionEnd = healthHookSource.indexOf("const remoteWorkouts =", recoverySectionStart);
  const recoverySection = healthHookSource.slice(recoverySectionStart, recoverySectionEnd);
  const definitionUpsert = recoverySection.indexOf('.from("adhdice_health_symptoms")');
  const entryUpsert = recoverySection.indexOf('.from("adhdice_health_symptom_entries")');
  assert.ok(definitionUpsert >= 0 && entryUpsert > definitionUpsert);
  assert.match(recoverySection, /symptomRecovery\.unreconciledLocalSymptoms/);
  assert.match(recoverySection, /symptomRecovery\.unreconciledLocalEntries/);
  assert.match(healthHookSource, /symptoms: symptomsResult\.error \? currentLocalSymptoms : symptomRecovery\.mergedSymptoms/);
  assert.match(healthHookSource, /symptomEntries: symptomEntriesResult\.error \? currentLocalSymptomEntries : symptomRecovery\.mergedEntries/);
  const baseHealthErrorsStart = healthHookSource.indexOf("const errors = [");
  const baseHealthErrorsEnd = healthHookSource.indexOf("].filter(Boolean);", baseHealthErrorsStart);
  assert.doesNotMatch(healthHookSource.slice(baseHealthErrorsStart, baseHealthErrorsEnd), /symptom/i);
  assert.doesNotMatch(schemaSource, /alter publication supabase_realtime add table public\.adhdice_health_symptoms/);
  assert.doesNotMatch(schemaSource, /alter publication supabase_realtime add table public\.adhdice_health_symptom_entries/);
  assert.doesNotMatch(migrationSource, /alter publication supabase_realtime add table public\.adhdice_health_symptoms/);
  assert.doesNotMatch(migrationSource, /alter publication supabase_realtime add table public\.adhdice_health_symptom_entries/);
  assert.match(healthPageSource, /HEALTH_SEVERITY_OPTIONS\.map/);
  assert.match(healthPageSource, /title="Recent symptoms"/);
  assert.match(healthPageSource, /entry\.severity}\/10/);
  assert.match(healthPageSource, /Save Symptom/);
  assert.match(healthPageSource, /deleteSymptomEntry\(entry\.id\)/);
});

test("Journal symptom pickers expose palette actions and the trend series uses the selected symptom color", () => {
  assert.equal((healthPageSource.match(/buildHealthSymptomDropdownOption\(/g) ?? []).length >= 3, true);
  assert.match(healthPageSource, /ADHDICE_ACCENT_COLORS\.map/);
  const paletteSourceStart = healthPageSource.indexOf("ADHDICE_ACCENT_COLORS.map");
  const paletteSource = healthPageSource.slice(paletteSourceStart, healthPageSource.indexOf("</div>", paletteSourceStart));
  assert.match(paletteSource, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(paletteSource, /onClick=\{\(\) => onSetColor\(paletteColor\)\}/);
  assert.doesNotMatch(paletteSource, /chooseOption\(|setSymptomDraft|setSelectedSymptomTrendId/);
  assert.match(healthPageSource, /ariaLabel="Symptom"[\s\S]*?options=\{editingSymptomEntryId/);
  assert.match(healthPageSource, /ariaLabel="Trend symptom"[\s\S]*?options=\{symptomTrendOptions}/);
  assert.doesNotMatch(healthPageSource, /color: "#7c5cff"/);
  assert.match(healthPageSource, /label: "\+ Add a new symptom", value: NEW_SYMPTOM_VALUE/);
  const syntheticOptionSource = healthPageSource.slice(healthPageSource.indexOf('label: "+ Add a new symptom"'), healthPageSource.indexOf('label: "+ Add a new symptom"') + 90);
  assert.doesNotMatch(syntheticOptionSource, /trailingAction/);
});

test("Symptom Library supports definition-only creation and shared color editing", () => {
  assert.match(healthPageSource, /aria-label="Add symptom"/);
  assert.match(healthPageSource, /isSymptomCreateOpen/);
  assert.match(healthPageSource, /aria-label="New symptom name"/);
  assert.match(healthPageSource, /createSymptom\(\{ name: symptomCreateName \}\)/);
  const createHandlerStart = healthPageSource.indexOf("async function handleCreateSymptom");
  const createHandlerEnd = healthPageSource.indexOf("async function handleSaveMeal", createHandlerStart);
  const createHandlerSource = healthPageSource.slice(createHandlerStart, createHandlerEnd);
  assert.doesNotMatch(createHandlerSource, /addSymptomEntry|setSymptomDraft|severity|entry_date|logged_at/);
  assert.match(healthPageSource, /Cancel/);
  assert.match(healthPageSource, /HealthSymptomColorControl/);
  assert.match(healthPageSource, /library:\$\{symptom\.id\}/);
  assert.match(healthPageSource, /handleSetSymptomColor\(symptom\.id, color\)/);
  assert.match(healthPageSource, /setOpenSymptomColorPickerKey\(null\)/);
  assert.match(healthPageSource, /onClick=\{onToggle\}/);
  assert.match(healthPageSource, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
});

test("Health hydration checks lifecycle before and after each recovery mutation phase", () => {
  const recoveryStart = healthHookSource.indexOf("let remoteSymptoms =");
  const recoveryEnd = healthHookSource.indexOf("const remoteSnapshot =", recoveryStart);
  const recoverySection = healthHookSource.slice(recoveryStart, recoveryEnd);
  const phaseWrites = [
    '.from("adhdice_health_symptoms")',
    '.from("adhdice_health_symptom_entries")',
    '.from("adhdice_health_workouts")',
    '.from("adhdice_health_meal_plan_entries")',
  ];

  for (const phaseWrite of phaseWrites) {
    const writeIndex = recoverySection.indexOf(phaseWrite);
    assert.ok(writeIndex >= 0, `expected ${phaseWrite} recovery write`);
    assert.ok(recoverySection.lastIndexOf("if (!isActive) {", writeIndex) >= 0, `expected lifecycle guard before ${phaseWrite}`);
  }

  assert.match(recoverySection, /\.from\("adhdice_health_symptoms"\)[\s\S]*?\.select\("\*"\);\s*if \(!isActive\) \{\s*return;\s*\}/);
  assert.match(recoverySection, /\.from\("adhdice_health_symptom_entries"\)[\s\S]*?\.select\("\*"\);\s*if \(!isActive\) \{\s*return;\s*\}/);
  assert.match(recoverySection, /\.from\("adhdice_health_workouts"\)[\s\S]*?\);\s*if \(!isActive\) \{\s*return;\s*\}/);
  assert.match(recoverySection, /await client[\s\S]*?adhdice_health_meal_plan_entries[\s\S]*?\.eq\("user_id", userId\);\s*if \(!isActive\) \{\s*return;\s*\}/);
  assert.match(recoverySection, /for \(const \[planId, mutation\] of Object\.entries\(pendingMealPlanMutations\)\) \{\s*if \(!isActive\) \{\s*return;/);
});

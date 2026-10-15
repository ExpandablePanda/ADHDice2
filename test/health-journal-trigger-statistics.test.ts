import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  formatJournalTriggerTimelinePeriodLabel,
  JournalTriggerStatistics,
} from "../src/components/task-app/journal-trigger-statistics.tsx";
import {
  getHealthJournalHistoryGroupsIncludingEntry,
  groupHealthJournalEntriesByDate,
} from "../src/lib/health-journal.ts";
import {
  buildHealthJournalTriggerStatistics,
  getHealthJournalTriggerTimelineForSelection,
  type HealthJournalTriggerStatisticsInput,
  type HealthJournalTriggerStatisticsRange,
} from "../src/lib/health-journal-trigger-statistics.ts";
import { todayHealthDate } from "../src/lib/health-utils.ts";

const USER_ID = "user-1";
type StatisticsLink = HealthJournalTriggerStatisticsInput["journalTriggerLinks"][number];
type StatisticsTrigger = HealthJournalTriggerStatisticsInput["journalTriggers"][number];
type StatisticsSymptomEntry = HealthJournalTriggerStatisticsInput["symptomEntries"][number];
type StatisticsFeelingOccurrence = HealthJournalTriggerStatisticsInput["journalSignalOccurrences"][number];

function entry(id: string) {
  return { id, user_id: USER_ID };
}

function trigger(id: string, name = id, archivedAt: string | null = null): StatisticsTrigger {
  return { id, user_id: USER_ID, name, archived_at: archivedAt };
}

function symptomEntry(
  id: string,
  journalEntryId: string,
  entryDate: string,
  symptomId = "symptom-1",
  severity = 5,
): StatisticsSymptomEntry {
  return {
    id,
    user_id: USER_ID,
    journal_entry_id: journalEntryId,
    entry_date: entryDate,
    logged_at: entryDate + "T12:00:00.000Z",
    symptom_id: symptomId,
    severity,
  };
}

function feelingOccurrence(
  id: string,
  journalEntryId: string,
  entryDate: string,
  signalId: string,
  score = 5,
): StatisticsFeelingOccurrence {
  return {
    id,
    user_id: USER_ID,
    journal_entry_id: journalEntryId,
    entry_date: entryDate,
    occurred_at: entryDate + "T13:00:00.000Z",
    signal_id: signalId,
    score,
  };
}

function link(
  id: string,
  triggerId: string,
  kind: "symptom" | "feeling",
  occurrenceId: string,
  effect: "associated" | "improved" | "worsened" = "associated",
  previousScore: number | null = null,
  createdAt = "2020-01-01T00:00:00.000Z",
): StatisticsLink {
  return {
    id,
    user_id: USER_ID,
    trigger_id: triggerId,
    symptom_occurrence_id: kind === "symptom" ? occurrenceId : null,
    journal_signal_occurrence_id: kind === "feeling" ? occurrenceId : null,
    effect,
    previous_score: previousScore,
    created_at: createdAt,
  };
}

function input(
  range: HealthJournalTriggerStatisticsRange = "all_time",
  overrides: Partial<HealthJournalTriggerStatisticsInput> = {},
): HealthJournalTriggerStatisticsInput {
  return {
    checkIns: [],
    journalSignals: [],
    journalSignalOccurrences: [],
    journalTriggers: [],
    journalTriggerLinks: [],
    range,
    symptomEntries: [],
    symptoms: [],
    todayDate: "2026-10-11",
    ...overrides,
  };
}

test("counts unique association IDs, distinct entries, and multiple Triggers on one occurrence", () => {
  const first = link("link-1", "trigger-a", "symptom", "occurrence-a", "associated");
  const result = buildHealthJournalTriggerStatistics(input("all_time", {
    checkIns: [entry("entry-1")],
    journalTriggers: [
      trigger("trigger-a", "Noise"),
      trigger("trigger-b", "Weather", "2026-01-01T00:00:00.000Z"),
    ],
    journalTriggerLinks: [
      first,
      { ...first },
      link("link-2", "trigger-b", "symptom", "occurrence-a", "improved"),
      link("link-3", "trigger-a", "symptom", "occurrence-b", "worsened"),
    ],
    symptomEntries: [
      symptomEntry("occurrence-a", "entry-1", "2026-10-10"),
      symptomEntry("occurrence-b", "entry-1", "2026-10-11"),
    ],
    symptoms: [{ id: "symptom-1", user_id: USER_ID, name: "Headache" }],
  }));

  assert.equal(result.totalAssociationCount, 3);
  assert.equal(result.distinctTriggerCount, 2);
  assert.equal(result.distinctJournalEntryCount, 1);
  assert.deepEqual(result.effects, { associated: 1, improved: 1, worsened: 1 });
  assert.equal(result.rankedTriggers[0]?.trigger.name, "Noise");
  assert.equal(result.rankedTriggers[0]?.associationCount, 2);
  assert.equal(result.rankedTriggers[0]?.uniqueJournalEntryCount, 1);
  assert.deepEqual(result.rankedTriggers[0]?.feelings, [{ name: "Headache", occurrenceCount: 2 }]);
  assert.equal(result.rankedTriggers.find((row) => row.trigger.id === "trigger-b")?.trigger.archived_at, "2026-01-01T00:00:00.000Z");
});

test("legacy Journal values and tags without linked occurrences do not become Trigger associations", () => {
  const statisticsSource = readFileSync(new URL("../src/lib/health-journal-trigger-statistics.ts", import.meta.url), "utf8");
  const result = buildHealthJournalTriggerStatistics(input("all_time", {
    checkIns: [entry("entry-with-snapshot")],
    journalSignals: [{ id: "signal", user_id: USER_ID, name: "Anxious" }],
    journalTriggers: [trigger("trigger-a")],
  }));
  assert.equal(result.totalAssociationCount, 0);
  assert.equal(result.distinctJournalEntryCount, 0);
  assert.doesNotMatch(statisticsSource, /journalSignalValues|symptom_tags/);
});

test("date ranges use linked occurrence entry_date with inclusive local calendar boundaries", () => {
  const dateRows = [
    ["before-7", "2026-01-24"],
    ["start-7", "2026-01-25"],
    ["before-30", "2026-01-01"],
    ["start-30", "2026-01-02"],
    ["before-90", "2025-11-02"],
    ["start-90", "2025-11-03"],
    ["today", "2026-01-31"],
    ["after-today", "2026-02-01"],
  ] as const;
  const associations = dateRows.map(([id]) => link(id, "trigger-a", "symptom", "occurrence-" + id, "associated", null, "2026-01-15T12:00:00.000Z"));
  const checkIns = dateRows.map(([id]) => entry("entry-" + id));
  const symptomEntries = dateRows.map(([id, date]) => symptomEntry("occurrence-" + id, "entry-" + id, date));

  const expected = [
    { range: "7_days" as const, startDate: "2026-01-25", included: ["start-7", "today"] },
    { range: "30_days" as const, startDate: "2026-01-02", included: ["before-7", "start-30", "start-7", "today"] },
    { range: "90_days" as const, startDate: "2025-11-03", included: ["start-90", "before-30", "before-7", "start-30", "start-7", "today"] },
  ];
  for (const scenario of expected) {
    const result = buildHealthJournalTriggerStatistics(input(scenario.range, {
      checkIns,
      journalTriggers: [trigger("trigger-a")],
      journalTriggerLinks: associations,
      symptomEntries,
      symptoms: [{ id: "symptom-1", user_id: USER_ID, name: "Headache" }],
      todayDate: "2026-01-31",
    }));
    assert.equal(result.rangeStartDate, scenario.startDate, scenario.range);
    assert.equal(result.rangeEndDate, "2026-01-31", scenario.range);
    assert.equal(result.totalAssociationCount, scenario.included.length, scenario.range);
    assert.deepEqual(result.rankedTriggers[0]?.history.map((row) => row.associationId).sort(), [...scenario.included].sort());
  }

  const allTime = buildHealthJournalTriggerStatistics(input("all_time", {
    checkIns,
    journalTriggers: [trigger("trigger-a")],
    journalTriggerLinks: associations,
    symptomEntries,
    symptoms: [{ id: "symptom-1", user_id: USER_ID, name: "Headache" }],
    todayDate: "2026-01-31",
  }));
  assert.equal(allTime.totalAssociationCount, dateRows.length);
  assert.equal(allTime.rangeStartDate, "2025-11-02");
  assert.equal(allTime.rangeEndDate, "2026-02-01");
});

test("daily and weekly timelines retain zero periods and calendar boundaries", () => {
  const daily = buildHealthJournalTriggerStatistics(input("7_days", {
    checkIns: [entry("entry-today")],
    journalTriggers: [trigger("trigger-a")],
    journalTriggerLinks: [link("link-today", "trigger-a", "symptom", "occurrence-today")],
    symptomEntries: [symptomEntry("occurrence-today", "entry-today", "2026-02-02")],
    symptoms: [{ id: "symptom-1", user_id: USER_ID, name: "Headache" }],
    todayDate: "2026-02-02",
  }));
  assert.equal(daily.grouping, "day");
  assert.deepEqual(daily.timeline.map((period) => period.startDate), [
    "2026-01-27", "2026-01-28", "2026-01-29", "2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02",
  ]);
  assert.deepEqual(daily.timeline.map((period) => period.count), [0, 0, 0, 0, 0, 0, 1]);

  const weekly = buildHealthJournalTriggerStatistics(input("30_days", {
    checkIns: [entry("entry-first"), entry("entry-last")],
    journalTriggers: [trigger("trigger-a")],
    journalTriggerLinks: [
      link("link-first", "trigger-a", "symptom", "occurrence-first"),
      link("link-last", "trigger-a", "symptom", "occurrence-last"),
    ],
    symptomEntries: [
      symptomEntry("occurrence-first", "entry-first", "2026-01-04"),
      symptomEntry("occurrence-last", "entry-last", "2026-02-02"),
    ],
    symptoms: [{ id: "symptom-1", user_id: USER_ID, name: "Headache" }],
    todayDate: "2026-02-02",
  }));
  assert.equal(weekly.grouping, "week");
  assert.equal(weekly.timeline.length, 6);
  assert.deepEqual(weekly.timeline[0], {
    key: "2025-12-29",
    startDate: "2025-12-29",
    endDate: "2026-01-04",
    count: 1,
  });
  assert.equal(weekly.timeline.at(-1)?.startDate, "2026-02-02");
  assert.equal(weekly.timeline.at(-1)?.count, 1);
  assert.equal(weekly.timeline.some((period) => period.count === 0), true);
});

test("90-day timelines are weekly and All Time timelines are monthly across year rollover", () => {
  const rows = [
    { entryId: "entry-nov", occurrenceId: "occ-nov", date: "2025-11-30", linkId: "link-nov" },
    { entryId: "entry-jan", occurrenceId: "occ-jan", date: "2026-01-03", linkId: "link-jan" },
  ];
  const shared = {
    checkIns: rows.map((row) => entry(row.entryId)),
    journalTriggers: [trigger("trigger-a")],
    journalTriggerLinks: rows.map((row) => link(row.linkId, "trigger-a", "symptom", row.occurrenceId)),
    symptomEntries: rows.map((row) => symptomEntry(row.occurrenceId, row.entryId, row.date)),
    symptoms: [{ id: "symptom-1", user_id: USER_ID, name: "Headache" }],
    todayDate: "2026-02-02",
  };
  const ninetyDays = buildHealthJournalTriggerStatistics(input("90_days", shared));
  assert.equal(ninetyDays.grouping, "week");
  assert.equal(ninetyDays.rangeStartDate, "2025-11-05");

  const allTime = buildHealthJournalTriggerStatistics(input("all_time", shared));
  assert.equal(allTime.grouping, "month");
  assert.deepEqual(allTime.timeline.map((period) => period.key), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(allTime.timeline.map((period) => period.count), [1, 0, 1, 0]);
  assert.equal(allTime.timeline[0]?.startDate, "2025-11-01");
  assert.equal(allTime.timeline[0]?.endDate, "2025-11-30");
});

test("Symptom, Emotion, and Other Feeling occurrences join by their linked occurrence IDs", () => {
  const result = buildHealthJournalTriggerStatistics(input("all_time", {
    checkIns: [entry("entry-1")],
    journalSignals: [
      { id: "emotion", user_id: USER_ID, name: "Anxious" },
      { id: "other", user_id: USER_ID, name: "Hopeful" },
    ],
    journalSignalOccurrences: [
      feelingOccurrence("emotion-occurrence", "entry-1", "2026-10-10", "emotion", 7),
      feelingOccurrence("other-occurrence", "entry-1", "2026-10-11", "other", 4),
    ],
    journalTriggers: [trigger("trigger-a", "Schedule change")],
    journalTriggerLinks: [
      link("symptom-link", "trigger-a", "symptom", "symptom-occurrence"),
      link("emotion-link", "trigger-a", "feeling", "emotion-occurrence"),
      link("other-link", "trigger-a", "feeling", "other-occurrence"),
    ],
    symptomEntries: [symptomEntry("symptom-occurrence", "entry-1", "2026-10-09", "symptom-1", 6)],
    symptoms: [{ id: "symptom-1", user_id: USER_ID, name: "Fatigue" }],
  }));
  const detail = result.triggerOptions[0]!;
  assert.equal(result.totalAssociationCount, 3);
  assert.equal(detail.uniqueJournalEntryCount, 1);
  assert.deepEqual(detail.feelings, [
    { name: "Anxious", occurrenceCount: 1 },
    { name: "Fatigue", occurrenceCount: 1 },
    { name: "Hopeful", occurrenceCount: 1 },
  ]);
  assert.deepEqual(detail.history.map((item) => item.entryDate), ["2026-10-09", "2026-10-10", "2026-10-11"]);
});

test("previous score zero is recorded and effect labels remain explicit", () => {
  const result = buildHealthJournalTriggerStatistics(input("all_time", {
    checkIns: [entry("entry-1")],
    journalSignals: [{ id: "signal", user_id: USER_ID, name: "Mood" }],
    journalSignalOccurrences: [
      feelingOccurrence("zero-before", "entry-1", "2026-10-09", "signal", 9),
      feelingOccurrence("missing-before", "entry-1", "2026-10-10", "signal", 8),
      feelingOccurrence("improved", "entry-1", "2026-10-11", "signal", 2),
    ],
    journalTriggers: [trigger("trigger-a")],
    journalTriggerLinks: [
      link("associated", "trigger-a", "feeling", "zero-before", "associated", 0),
      link("worsened", "trigger-a", "feeling", "missing-before", "worsened", null),
      link("improved", "trigger-a", "feeling", "improved", "improved", 4),
    ],
  }));
  const detail = result.triggerOptions[0]!;
  assert.deepEqual(detail.effects, { associated: 1, improved: 1, worsened: 1 });
  assert.equal(detail.history[0]?.previousScore, 0);
  assert.equal(detail.history[0]?.recordedScore, 9);
  assert.equal(detail.history[0]?.scoreDifference, 9);
  assert.equal(detail.history[0]?.effect, "associated");
  assert.equal(detail.history[1]?.previousScore, null);
  assert.equal(detail.history[1]?.scoreDifference, null);
  assert.equal(detail.history[1]?.effect, "worsened");
  assert.equal(detail.history[2]?.scoreDifference, -2);
  assert.equal(detail.history[2]?.effect, "improved");
});

test("orphaned and malformed associations are excluded and reported once per association ID", () => {
  const valid = link("valid", "trigger-a", "symptom", "occurrence-valid");
  const result = buildHealthJournalTriggerStatistics(input("all_time", {
    checkIns: [entry("entry-1")],
    journalTriggers: [trigger("trigger-a")],
    journalTriggerLinks: [
      valid,
      { ...valid },
      link("missing-occurrence", "trigger-a", "symptom", "missing"),
      { ...link("no-endpoint", "trigger-a", "symptom", "occurrence-valid"), symptom_occurrence_id: null },
      { ...link("two-endpoints", "trigger-a", "symptom", "occurrence-valid"), journal_signal_occurrence_id: "also-set" },
      link("missing-entry", "trigger-a", "symptom", "occurrence-orphan"),
      link("missing-trigger", "deleted-trigger", "symptom", "occurrence-valid"),
      link("invalid-symptom-score", "trigger-a", "symptom", "occurrence-invalid-score"),
    ],
    symptomEntries: [
      symptomEntry("occurrence-valid", "entry-1", "2026-10-11"),
      symptomEntry("occurrence-orphan", "missing-entry", "2026-10-11"),
      symptomEntry("occurrence-invalid-score", "entry-1", "2026-10-11", "symptom-1", 0),
    ],
    symptoms: [{ id: "symptom-1", user_id: USER_ID, name: "Headache" }],
  }));
  assert.equal(result.totalAssociationCount, 1);
  assert.equal(result.ignoredAssociationCount, 6);
});

test("selecting a Trigger changes its timeline while retaining the selected date range", () => {
  const statistics = buildHealthJournalTriggerStatistics(input("30_days", {
    checkIns: [entry("entry-1"), entry("entry-2")],
    journalTriggers: [trigger("trigger-a", "Noise"), trigger("trigger-b", "Weather")],
    journalTriggerLinks: [
      link("link-a", "trigger-a", "symptom", "occurrence-a"),
      link("link-b", "trigger-b", "symptom", "occurrence-b"),
    ],
    symptomEntries: [
      symptomEntry("occurrence-a", "entry-1", "2026-10-10"),
      symptomEntry("occurrence-b", "entry-2", "2026-10-11"),
    ],
    symptoms: [{ id: "symptom-1", user_id: USER_ID, name: "Headache" }],
    todayDate: "2026-10-11",
  }));
  const allTimeline = getHealthJournalTriggerTimelineForSelection(statistics, null);
  const selectedTimeline = getHealthJournalTriggerTimelineForSelection(statistics, "trigger-a");
  assert.equal(statistics.range, "30_days");
  assert.equal(statistics.rangeStartDate, "2026-09-12");
  assert.equal(statistics.distinctJournalEntryCount, 2);
  assert.equal(selectedTimeline.length, allTimeline.length);
  assert.equal(allTimeline.reduce((total, period) => total + period.count, 0), 2);
  assert.equal(selectedTimeline.reduce((total, period) => total + period.count, 0), 1);
});

test("History can reveal an older Journal date group without expanding the History window", () => {
  const allEntries = Array.from({ length: 15 }, (_, index) => ({
    id: "entry-" + String(index + 1),
    entry_date: "2026-10-" + String(15 - index).padStart(2, "0"),
    user_id: USER_ID,
    entry_time: "12:00",
    mood_score: null,
    energy_score: null,
    stress_score: null,
    clarity_score: null,
    symptom_tags: [],
    reflection: "",
    created_at: "2026-10-11T12:00:00.000Z",
    updated_at: "2026-10-11T12:00:00.000Z",
  }));
  const groups = groupHealthJournalEntriesByDate(allEntries);
  const normalWindow = getHealthJournalHistoryGroupsIncludingEntry(groups, null);
  const revealed = getHealthJournalHistoryGroupsIncludingEntry(groups, "entry-15");
  assert.equal(normalWindow.length, 12);
  assert.equal(normalWindow.some((group) => group.entries.some((row) => row.id === "entry-15")), false);
  assert.equal(revealed.length, 13);
  assert.equal(revealed.some((group) => group.entries.some((row) => row.id === "entry-15")), true);
  assert.deepEqual(revealed.map((group) => group.date), [...revealed.map((group) => group.date)].sort().reverse());
});

test("Statistics loading, failure, retry, and loaded empty states are distinct", () => {
  const render = (props: Partial<Parameters<typeof JournalTriggerStatistics>[0]> = {}) => renderToStaticMarkup(
    createElement(JournalTriggerStatistics, {
      checkIns: [],
      healthDataError: null,
      healthDataLoading: false,
      hasLoadedJournalTriggerData: true,
      isLoadingJournalTriggers: false,
      journalSignals: [],
      journalSignalOccurrences: [],
      journalTriggerDataError: null,
      journalTriggers: [],
      journalTriggerLinks: [],
      loadJournalTriggerData: async () => true,
      onViewInHistory: () => {},
      retryHealthData: () => {},
      symptomEntries: [],
      symptoms: [],
      ...props,
    }),
  );

  const loading = render({ healthDataLoading: true, hasLoadedJournalTriggerData: false });
  assert.match(loading, /Loading Journal entries and Feeling occurrences/);
  assert.doesNotMatch(loading, /Trigger associations/);

  const healthFailure = render({ healthDataError: "Journal occurrence read failed" });
  assert.match(healthFailure, /role="alert"/);
  assert.match(healthFailure, /Journal occurrence read failed/);
  assert.match(healthFailure, />Retry</);
  assert.doesNotMatch(healthFailure, /Distinct Triggers used/);

  const failure = render({ journalTriggerDataError: "network unavailable" });
  assert.match(failure, /role="alert"/);
  assert.match(failure, /network unavailable/);
  assert.match(failure, />Retry</);
  assert.doesNotMatch(failure, /Distinct Triggers used/);

  const empty = render();
  assert.match(empty, /Trigger associations/);
  assert.match(empty, />0</);
  assert.match(empty, /No Trigger associations in this date range/);
  assert.match(empty, /Trigger frequency timeline/);
});

test("timeline labels use compact readable date ranges for each grouping", () => {
  const day = { key: "2026-10-11", startDate: "2026-10-11", endDate: "2026-10-11", count: 2 };
  const sameMonthWeek = { key: "2026-10-05", startDate: "2026-10-05", endDate: "2026-10-11", count: 2 };
  const crossMonthWeek = { key: "2026-09-28", startDate: "2026-09-28", endDate: "2026-10-04", count: 0 };
  const crossYearWeek = { key: "2025-12-29", startDate: "2025-12-29", endDate: "2026-01-04", count: 1 };
  const month = { key: "2026-10", startDate: "2026-10-01", endDate: "2026-10-31", count: 3 };
  const dateAtNoon = (date: string) => {
    const [year, monthValue, dayValue] = date.split("-").map(Number);
    return new Date(year!, monthValue! - 1, dayValue!, 12);
  };

  assert.equal(
    formatJournalTriggerTimelinePeriodLabel(day, "day"),
    new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(dateAtNoon(day.startDate)),
  );
  assert.equal(
    formatJournalTriggerTimelinePeriodLabel(sameMonthWeek, "week"),
    new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).formatRange(dateAtNoon(sameMonthWeek.startDate), dateAtNoon(sameMonthWeek.endDate)),
  );
  assert.equal(
    formatJournalTriggerTimelinePeriodLabel(crossMonthWeek, "week"),
    new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).formatRange(dateAtNoon(crossMonthWeek.startDate), dateAtNoon(crossMonthWeek.endDate)),
  );
  const yearRange = formatJournalTriggerTimelinePeriodLabel(crossYearWeek, "week");
  assert.equal(
    yearRange,
    new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).formatRange(dateAtNoon(crossYearWeek.startDate), dateAtNoon(crossYearWeek.endDate)),
  );
  assert.match(yearRange, /2025/);
  assert.match(yearRange, /2026/);
  assert.equal(
    formatJournalTriggerTimelinePeriodLabel(month, "month"),
    new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(dateAtNoon(month.startDate)),
  );
});

test("Statistics render separates chart labels, ranking fields, and effect counts", () => {
  const today = todayHealthDate();
  const props = {
    checkIns: [entry("entry-1")],
    healthDataError: null,
    healthDataLoading: false,
    hasLoadedJournalTriggerData: true,
    isLoadingJournalTriggers: false,
    journalSignals: [{ id: "signal", user_id: USER_ID, name: "Mood" }],
    journalSignalOccurrences: [feelingOccurrence("occurrence-1", "entry-1", today, "signal", 5)],
    journalTriggerDataError: null,
    journalTriggers: [trigger("trigger-a", "A deliberately long Trigger name for layout wrapping", "2026-01-01T00:00:00.000Z")],
    journalTriggerLinks: [link("link-1", "trigger-a", "feeling", "occurrence-1", "improved", 0)],
    loadJournalTriggerData: async () => true,
    onViewInHistory: () => {},
    retryHealthData: () => {},
    symptomEntries: [],
    symptoms: [],
  } as unknown as Parameters<typeof JournalTriggerStatistics>[0];
  const markup = renderToStaticMarkup(createElement(JournalTriggerStatistics, props));

  const selectedRangeChip = markup.match(/<button\b(?=[^>]*aria-pressed="true")[\s\S]*?<\/button>/)?.[0];
  assert.ok(selectedRangeChip);
  assert.match(selectedRangeChip, /30 days/);
  assert.doesNotMatch(selectedRangeChip, /\(default\)/);
  assert.match(selectedRangeChip, /px-2 py-1/);
  assert.match(markup, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(markup, /w-full min-w-0 min-h-44/);
  assert.match(markup, /w-36 shrink-0/);
  assert.match(markup, /title="\d{4}-\d{2}-\d{2} through \d{4}-\d{2}-\d{2}"/);
  assert.match(markup, /A deliberately long Trigger name for layout wrapping/);
  assert.match(markup, />Archived</);
  assert.match(markup, /sm:grid-cols-3/);
  assert.match(markup, /Associated/);
  assert.match(markup, /Improved/);
  assert.match(markup, /Worsened/);
});

test("Journal view navigation preserves Entry and split History controls and keeps the editor mounted", () => {
  const healthPage = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
  const useHealth = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
  assert.match(healthPage, /aria-label="Journal views"/);
  assert.match(healthPage, />\s*Entry\s*</);
  assert.match(healthPage, />\s*History\s*</);
  assert.match(healthPage, />\s*Statistics\s*</);
  assert.match(healthPage, /selectJournalWorkspaceMode\("split-history-left"\)/);
  assert.match(healthPage, /selectJournalWorkspaceMode\("split-history-right"\)/);
  assert.match(healthPage, /hidden=\{visibleJournalWorkspaceMode === "history" \|\| visibleJournalWorkspaceMode === "statistics"\}[^>]*>\s*<JournalCheckInForm/);
  assert.match(healthPage, /onViewInHistory=\{viewJournalEntryInHistory\}/);
  assert.match(healthPage, /healthDataError=\{journalStatisticsDataError\}/);
  assert.match(healthPage, /retryHealthData=\{refreshJournalStatisticsData\}/);
  assert.match(healthPage, /setJournalWorkspaceMode\("history"\)/);
  assert.match(healthPage, /getHealthJournalHistoryGroupsIncludingEntry\(journalHistoryGroups, journalHistoryRevealEntryId\)/);
  assert.match(healthPage, /document\.getElementById\("journal-history-entry-" \+ journalHistoryRevealEntryId\)/);
  assert.match(healthPage, /id=\{"journal-history-entry-" \+ entry\.id\}/);
  assert.match(useHealth, /Could not load required Journal statistics data/);
  assert.match(useHealth, /Could not refresh required Journal statistics data/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { FocusCategory, HistoricalFocusSession } from "../src/lib/types.ts";
import type {
  HealthJournalSignal,
  HealthMetricEntry,
} from "../src/lib/database.types.ts";
import {
  buildHealthJournalCustomAnswer,
  buildHealthJournalSleepLink,
  findRelevantHealthSleepContext,
  formatHealthJournalOccurrenceReference,
  getHealthJournalOccurrenceDisplay,
  getHealthJournalCustomQuestionsForEntry,
  getHealthJournalEntryType,
  getHealthJournalScaleDenominator,
  normalizeHealthJournalCustomQuestions,
  normalizeHealthJournalLinkedOccurrences,
  normalizeHealthJournalReframes,
  normalizeHealthJournalStructuredAnswers,
  normalizeHealthJournalWins,
} from "../src/lib/health-journal-checkins.ts";
import { formatHealthTimestampDate, formatHealthTimestampTime } from "../src/lib/health-utils.ts";

const formSource = readFileSync(new URL("../src/components/task-app/journal-check-in-form.tsx", import.meta.url), "utf8");
const eventCaptureSource = readFileSync(new URL("../src/components/task-app/journal-event-capture.tsx", import.meta.url), "utf8");
const summarySource = readFileSync(new URL("../src/components/task-app/journal-entry-summary.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/components/task-app/journal-question-settings.tsx", import.meta.url), "utf8");
const healthPageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const healthHookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/add_health_journal_checkin_types_7_13_43.sql", import.meta.url), "utf8");

function signal(overrides: Partial<HealthJournalSignal> = {}): HealthJournalSignal {
  return {
    archived_at: null,
    color: "#6f57f6",
    created_at: "2026-09-12T00:00:00.000Z",
    high_label: "Severe",
    id: "back-pain-signal",
    in_template: false,
    kind: "symptom",
    low_label: "Minimal",
    name: "Back Pain",
    scale_labels: ["", "Minimal", "Low", "Moderate", "Severe"],
    symptom_id: "back-pain",
    template_sort_order: null,
    updated_at: "2026-09-12T00:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function metric(id: string, date: string, value: number): HealthMetricEntry {
  return {
    created_at: `${date}T08:00:00.000Z`,
    id,
    metric_date: date,
    metric_type: "sleep_minutes",
    metric_value: value,
    source: "apple_health_import",
    source_fingerprint: id,
    updated_at: `${date}T08:00:00.000Z`,
    user_id: "user-1",
  };
}

const sleepCategory: FocusCategory = {
  color: "#6f57f6",
  focusType: "Personal",
  icon: "moon",
  id: "sleep-category",
  title: "Sleep",
};

const sleepSession: HistoricalFocusSession = {
  categoryId: sleepCategory.id,
  date: "2026-09-11",
  durationSeconds: 7 * 60 * 60,
  endedAt: "2026-09-12T06:00:00.000Z",
  focusType: "Personal",
  id: "sleep-session-1",
  startedAt: "2026-09-11T23:00:00.000Z",
  title: "Sleep",
};

test("Journal entry types, legacy fallback, optional answers, paired rows, and wins are normalized", () => {
  assert.equal(getHealthJournalEntryType(undefined), "event");
  assert.equal(getHealthJournalEntryType({ entry_type: "start_of_day" }), "start_of_day");
  assert.deepEqual(normalizeHealthJournalStructuredAnswers(undefined), { custom_answers: [], schema_version: 1 });
  assert.deepEqual(normalizeHealthJournalStructuredAnswers({ linked_event_ids: ["event-1", "", "event-1", "event-2"] }).linked_event_ids, ["event-1", "event-2"]);
  assert.deepEqual(normalizeHealthJournalStructuredAnswers({ linked_event_ids: [] }).linked_event_ids, []);
  assert.equal(normalizeHealthJournalStructuredAnswers({ linked_event_ids: "not-an-array" }).linked_event_ids, undefined);
  assert.deepEqual(normalizeHealthJournalReframes([{ negative: "one", positive: "reframe" }, {}, {}, {}, {}, { negative: "ignored" }]), [
    { negative: "one", positive: "reframe" },
    { negative: "", positive: "" },
    { negative: "", positive: "" },
    { negative: "", positive: "" },
    { negative: "", positive: "" },
  ]);
  assert.deepEqual(normalizeHealthJournalWins(["Win one", "Win two", "Win three", "Win four", "Win five", "ignored"]), ["Win one", "Win two", "Win three", "Win four", "Win five"]);
});

test("Start and End custom question targeting preserves order and historical answer snapshots", () => {
  const questions = normalizeHealthJournalCustomQuestions([
    { id: "end", question: "End question", target: "end_of_day", input_type: "number", options: [], enabled: true, sort_order: 2 },
    { id: "both", question: "Both question", target: "both", input_type: "multiple_choice", options: ["A", "B"], enabled: true, sort_order: 1 },
    { id: "disabled", question: "Disabled question", target: "start_of_day", input_type: "short_text", options: [], enabled: false, sort_order: 0 },
  ]);
  assert.deepEqual(getHealthJournalCustomQuestionsForEntry(questions, "start_of_day").map((question) => question.id), ["both"]);
  assert.deepEqual(getHealthJournalCustomQuestionsForEntry(questions, "end_of_day").map((question) => question.id), ["both", "end"]);
  const historicalAnswer = buildHealthJournalCustomAnswer(questions[1]!, ["A"]);
  const renamed = normalizeHealthJournalCustomQuestions(questions.map((question) => question.id === "both" ? { ...question, question: "Renamed later" } : question));
  const deleted = renamed.filter((question) => question.id !== "both");
  assert.equal(historicalAnswer.question, "Both question");
  assert.equal(deleted.some((question) => question.id === historicalAnswer.question_id), false);
  assert.equal(historicalAnswer.options.join(","), "A,B");
});

test("Sleep context uses the existing Sleep Focus and imported sleep records, and reports absence without creating data", () => {
  const found = findRelevantHealthSleepContext({
    date: "2026-09-12",
    focusCategories: [sleepCategory],
    focusHistory: [sleepSession],
    metricEntries: [metric("sleep-metric-1", "2026-09-11", 30)],
  });
  assert.ok(found);
  assert.equal(found.date, "2026-09-11");
  assert.deepEqual(found.focus_session_ids, ["sleep-session-1"]);
  assert.deepEqual(found.imported_metric_ids, ["sleep-metric-1"]);
  assert.equal(buildHealthJournalSleepLink(found)?.total_minutes, 450);
  assert.equal(findRelevantHealthSleepContext({ date: "2026-09-12", focusCategories: [], focusHistory: [], metricEntries: [] }), null);
  assert.match(formSource, /No sleep data was found/);
  assert.match(formSource, /Open Sleep/);
});

test("Occurrence references include local date and time while preserving identity and canonical scales", () => {
  const customScale = signal();
  assert.equal(getHealthJournalScaleDenominator(customScale), 4);
  const occurredAt = "2026-09-12T16:30:00.000Z";
  const localDate = formatHealthTimestampDate(occurredAt);
  const localTime = formatHealthTimestampTime(occurredAt);
  assert.equal(formatHealthJournalOccurrenceReference({ name: "Back Pain", occurredAt, score: 3, signal: customScale }), `Back Pain (3/4) · ${localDate} · ${localTime}`);
  assert.equal(getHealthJournalOccurrenceDisplay({ id: "symptom-occurrence", kind: "symptom", name: "Back Pain", occurredAt, score: 3, denominator: 4 }), `Back Pain (3/4) · ${localDate} · ${localTime}`);
  assert.equal(getHealthJournalOccurrenceDisplay({ id: "feeling-occurrence", kind: "feeling", name: "Anxiety", occurredAt, score: 8, denominator: 10 }), `Anxiety (8/10) · ${localDate} · ${localTime}`);
  const priorDateOccurrenceAt = "2026-09-11T01:15:00.000Z";
  const currentDateOccurrenceAt = "2026-09-12T01:15:00.000Z";
  const priorDateOccurrence = formatHealthJournalOccurrenceReference({ name: "Back Pain", occurredAt: priorDateOccurrenceAt, score: 4, signal: customScale });
  const currentDateOccurrence = formatHealthJournalOccurrenceReference({ name: "Back Pain", occurredAt: currentDateOccurrenceAt, score: 4, signal: customScale });
  assert.notEqual(priorDateOccurrence, currentDateOccurrence);
  assert.equal(priorDateOccurrence, `Back Pain (4/4) · ${formatHealthTimestampDate(priorDateOccurrenceAt)} · ${formatHealthTimestampTime(priorDateOccurrenceAt)}`);
  assert.equal(currentDateOccurrence, `Back Pain (4/4) · ${formatHealthTimestampDate(currentDateOccurrenceAt)} · ${formatHealthTimestampTime(currentDateOccurrenceAt)}`);
  const nearLocalMidnight = "2026-09-12T01:30:00.000Z";
  const nearLocalMidnightDate = formatHealthTimestampDate(nearLocalMidnight);
  const nearLocalMidnightTime = formatHealthTimestampTime(nearLocalMidnight);
  assert.equal(getHealthJournalOccurrenceDisplay({ id: "boundary-occurrence", kind: "symptom", name: "Headache", occurredAt: nearLocalMidnight, score: 2, denominator: 4 }), `Headache (2/4) · ${nearLocalMidnightDate} · ${nearLocalMidnightTime}`);
  const references = normalizeHealthJournalLinkedOccurrences([
    { id: "occurrence-morning", kind: "symptom" },
    { id: "occurrence-evening", kind: "symptom" },
    { id: "occurrence-morning", kind: "symptom" },
  ]);
  assert.deepEqual(references.map((reference) => reference.id), ["occurrence-morning", "occurrence-evening"]);
  assert.doesNotMatch(formSource, /FeelingQuestionSection|How did you feel\?|How do you feel waking up\?|How do you feel right now\?|specific logged occurrence/);
  assert.match(formSource, /JournalEventCapture/);
  assert.match(formSource, /Any feelings or events to log\?/);
  assert.match(formSource, /linked_event_ids/);
  assert.match(formSource, /eventWasSaved/);
  assert.match(formSource, /allowInsertWithId: true/);
  assert.match(eventCaptureSource, /readJournalTagQuery/);
  assert.match(eventCaptureSource, /replaceHealthJournalReflectionTag/);
  assert.match(eventCaptureSource, /onCreateSignal/);
  assert.match(eventCaptureSource, /Symptoms/);
  assert.match(eventCaptureSource, /Emotions/);
  assert.match(eventCaptureSource, /Other Feelings/);
  assert.match(eventCaptureSource, /formatHealthJournalOccurrenceReference/);
  assert.match(eventCaptureSource, /occurredAt: occurrence\.logged_at/);
  assert.match(eventCaptureSource, /occurredAt: occurrence\.occurred_at/);
  assert.match(eventCaptureSource, /Array\.from\(\{ length: denominator \}/);
  assert.match(eventCaptureSource, /scale_labels\[score\]/);
  assert.match(eventCaptureSource, /HealthStandardTimeInput/);
  assert.match(formSource, /journal_entry_id/);
  assert.match(formSource, /saveJournalEntry\({\n        allowInsertWithId: true,\n        checkIn: \{\n          id: nextEventId/);
  assert.match(formSource, /eventDateTime=\{entryType !== "event"\}/);
  assert.match(formSource, /sm:grid-cols-\[auto_auto_auto\]/);
  assert.match(formSource, /The Event was saved, but the check-in could not be saved/);
  assert.match(formSource, /hydrateJournalEventOccurrences/);
  assert.match(healthHookSource, /allowInsertWithId/);
  assert.match(healthHookSource, /insert\(\{ \.\.\.\(requestedEntryId \? \{ id: requestedEntryId \} : \{\}\)/);
  assert.match(summarySource, /Feeling occurrences/);
  assert.match(summarySource, /Linked Event/);
  assert.match(summarySource, /checkIns: readonly HealthCheckIn\[\]/);
  assert.match(healthPageSource, /formatHealthJournalOccurrenceReference\(\{ name: displayName, occurredAt: occurrence\.occurredAt/);
  assert.match(healthPageSource, /historyReflection/);
  assert.match(healthPageSource, /reflection=\{historyReflection\}/);
  assert.doesNotMatch(healthPageSource, /formatJournalHistoryOccurrenceTime/);
  assert.match(healthPageSource, /JournalScaleLabelsEditor/);
  assert.match(formSource, /hasStructuredJournalContent/);
  assert.match(formSource, /selectedJournalEntry\?\.reflection/);
});

test("7.13.47 Journal QA corrections keep compact controls, floating Event Feeling editing, and legacy Event notes", () => {
  const eventChoiceSource = formSource.slice(formSource.indexOf("function EventCaptureChoice"), formSource.indexOf("function StartOfDayQuestions"));

  assert.match(formSource, /HealthStandardTimeInput ariaLabel=\{topTimeLabel\} compact/);
  assert.match(eventCaptureSource, /HealthStandardTimeInput ariaLabel="When did it happen\?" compact/);
  assert.match(eventCaptureSource, /HealthStandardTimeInput ariaLabel="Event Feeling occurrence time" compact/);
  assert.doesNotMatch(eventCaptureSource, /What do you want to record about it\?/);
  assert.doesNotMatch(eventCaptureSource, /Event notes/);
  assert.match(eventCaptureSource, /createPortal/);
  assert.match(eventCaptureSource, /data-journal-floating-overlay="true"/);
  assert.match(eventCaptureSource, /style=\{\{ left: position\.left, position: "fixed", top: position\.top \}\}/);
  assert.match(eventCaptureSource, /max-h-\[calc\(100dvh-1rem\)\].*overflow-y-auto/);
  assert.match(eventCaptureSource, /window\.addEventListener\("scroll", updatePosition, true\)/);
  assert.match(eventCaptureSource, /event\.key === "Escape"/);

  assert.match(eventChoiceSource, /role="radiogroup"/);
  assert.match(eventChoiceSource, /role="radio"/);
  assert.match(eventChoiceSource, />Yes<\/AdhdChip>/);
  assert.match(eventChoiceSource, />No<\/AdhdChip>/);
  assert.doesNotMatch(eventChoiceSource, /type="checkbox"/);
  assert.match(formSource, /setEventCaptureEnabled\(false\)/);
  assert.match(formSource, /setEventCaptureEnabled\(nextEntryType !== "event" && Boolean\(linkedEventId\)\)/);
  assert.match(formSource, /linked_event_ids: entryType === "event" \? answers\.linked_event_ids : eventCaptureEnabled && eventDraft\.id \? \[eventDraft\.id\] : \[\]/);
  assert.match(formSource, /event_record: eventDraft\.notes/);
  assert.match(summarySource, /label: "Event notes"/);
  assert.match(formSource, /eventWasSaved/);
  assert.match(eventCaptureSource, /journal_entry_id === entry\.id/);
});

test("Breakfast states link consumed Food snapshots and keep planned breakfast out of Food persistence", () => {
  assert.match(formSource, /Already ate/);
  assert.match(formSource, /Planning to eat/);
  assert.match(formSource, /planned_breakfast/);
  assert.match(formSource, /will not create consumed Food or calories/);
  assert.match(formSource, /breakfast_meals/);
  assert.doesNotMatch(formSource, /addMealEntry/);
  assert.match(summarySource, /breakfast_meals/);
});

test("Settings supports all V1 input types, targeting, ordering, disable/re-enable, deletion, and choice configuration", () => {
  for (const inputType of ["short_text", "long_text", "number", "scale_1_10", "yes_no", "single_choice", "multiple_choice"]) {
    assert.match(settingsSource, new RegExp(inputType));
  }
  assert.match(settingsSource, /Start of Day/);
  assert.match(settingsSource, /End of Day/);
  assert.match(settingsSource, /Both/);
  assert.match(settingsSource, /Move .* up/);
  assert.match(settingsSource, /Move .* down/);
  assert.match(settingsSource, /Disable/);
  assert.match(settingsSource, /Re-enable/);
  assert.match(settingsSource, /Delete/);
  assert.match(settingsSource, /One choice per line/);
  assert.match(healthPageSource, /JournalQuestionSettings/);
  assert.match(healthHookSource, /saveJournalQuestions/);
});

test("Schema and migration keep Journal additions additive and backward-compatible", () => {
  for (const source of [schemaSource, migrationSource]) {
    assert.match(source, /journal_questions jsonb/);
    assert.match(source, /entry_type text/);
    assert.match(source, /structured_answers jsonb/);
    assert.match(source, /start_of_day/);
    assert.match(source, /end_of_day/);
    assert.match(source, /event/);
  }
  assert.match(migrationSource, /add column if not exists/);
  assert.match(healthHookSource, /entry_type: checkIn\.entry_type \?\? "event"/);
  assert.match(healthHookSource, /structured_answers/);
});

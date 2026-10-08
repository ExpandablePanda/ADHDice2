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
  formatHealthJournalEventInterval,
  findRelevantHealthSleepContext,
  formatHealthJournalOccurrenceReference,
  getHealthJournalOccurrenceDisplay,
  getHealthJournalCustomQuestionsForEntry,
  getHealthJournalEntryType,
  getHealthJournalScaleDenominator,
  normalizeHealthJournalCustomQuestions,
  normalizeHealthJournalDate,
  normalizeHealthJournalEventEnd,
  normalizeHealthJournalLinkedOccurrences,
  normalizeHealthJournalReframes,
  normalizeHealthJournalStructuredAnswers,
  normalizeHealthJournalWins,
  sortHealthJournalOccurrenceRows,
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
const timeEstimatesMigrationSource = readFileSync(new URL("../supabase/add_health_journal_time_estimates_7_16_112.sql", import.meta.url), "utf8");

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

test("Event timing fields validate independently, preserve legacy answers, and render estimated intervals", () => {
  const legacy = normalizeHealthJournalStructuredAnswers({ event_description: "Legacy event" });
  assert.equal("event_end_date" in legacy, false);
  assert.equal(normalizeHealthJournalDate("2026-02-30"), null);
  const normalized = normalizeHealthJournalStructuredAnswers({
    event_end_date: "2026-10-08",
    event_end_time: "03:40:00",
    event_end_time_estimated: true,
    event_start_time_estimated: true,
  });
  assert.equal(normalized.event_end_date, "2026-10-08");
  assert.equal(normalized.event_end_time, "03:40");
  assert.equal(normalized.event_end_time_estimated, true);
  assert.equal(formatHealthJournalEventInterval({
    endDate: normalized.event_end_date,
    endTime: normalized.event_end_time,
    endTimeEstimated: normalized.event_end_time_estimated,
    startDate: "2026-10-07",
    startTime: "13:15",
    startTimeEstimated: normalized.event_start_time_estimated,
  }), "Oct 7, 2026 · ~1:15 PM → Oct 8, 2026 · ~3:40 AM");
  assert.match(formSource, /event_end_date/);
  assert.match(formSource, /event_start_time_estimated/);
  assert.match(eventCaptureSource, /Event end date \(optional\)/);
  assert.match(eventCaptureSource, /Event start time.*Estimated/);
  assert.match(healthPageSource, /Event interval/);
  assert.doesNotMatch(summarySource, /label="Event interval"/);
});

test("Event end timing accepts same-day time-only input and requires explicit overnight dates", () => {
  assert.deepEqual(normalizeHealthJournalEventEnd({ endDate: "", endTime: "15:40", startDate: "2026-10-07", startTime: "13:15" }), {
    endDate: "2026-10-07",
    endTime: "15:40",
    error: null,
  });
  assert.deepEqual(normalizeHealthJournalEventEnd({ endDate: "", endTime: "", startDate: "2026-10-07", startTime: "13:15" }), {
    endDate: null,
    endTime: null,
    error: null,
  });
  assert.deepEqual(normalizeHealthJournalEventEnd({ endDate: "2026-10-08", endTime: "03:40", startDate: "2026-10-07", startTime: "13:15" }), {
    endDate: "2026-10-08",
    endTime: "03:40",
    error: null,
  });
  assert.match(normalizeHealthJournalEventEnd({ endDate: "", endTime: "03:40", startDate: "2026-10-07", startTime: "13:15" }).error ?? "", /later Event end date/);
  assert.match(formSource, /endDate: normalizeHealthJournalDate\(eventAnswers\.event_end_date\)/);
  assert.match(formSource, /normalizeHealthJournalEventEnd/);
  assert.match(formSource, /lg:grid-cols-\[minmax\(8rem,auto\)_repeat\(4,minmax\(0,1fr\)\)\]/);
  assert.match(eventCaptureSource, /lg:grid-cols-4/);
});

test("Editing an existing Event preserves its explicit end date and accepts a changed end time", () => {
  const existing = normalizeHealthJournalEventEnd({ endDate: "2026-10-08", endTime: "03:40", startDate: "2026-10-07", startTime: "13:15" });
  const edited = normalizeHealthJournalEventEnd({ endDate: existing.endDate ?? "", endTime: "04:10", startDate: "2026-10-07", startTime: "13:15" });
  assert.deepEqual(existing, { endDate: "2026-10-08", endTime: "03:40", error: null });
  assert.deepEqual(edited, { endDate: "2026-10-08", endTime: "04:10", error: null });
});

test("Standalone Event History keeps upper content and only exposes additional lower details", () => {
  assert.match(summarySource, /const isStandaloneEvent = entry\.entry_type === "event"/);
  assert.match(summarySource, /const additionalEventNotes/);
  assert.match(summarySource, /!isStandaloneEvent && linkedOccurrenceKeys\.size > 0/);
  assert.equal(summarySource.includes('label="Event interval"'), false);
  assert.equal(summarySource.includes('label="Event"'), false);
  assert.match(summarySource, /entry\.entry_type === "end_of_day"/);
  assert.match(summarySource, /Morning thoughts/);
  assert.match(healthPageSource, /Event interval/);
  assert.match(healthPageSource, /historyReflection/);
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
  assert.equal(getHealthJournalOccurrenceDisplay({ id: "estimated-occurrence", kind: "feeling", name: "Anxiety", occurredAt, score: 8, denominator: 10, timeIsEstimated: true }), `Anxiety (8/10) · ${localDate} · ~${localTime}`);
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
  assert.match(eventCaptureSource, /timeIsEstimated/);
  assert.match(formSource, /journal_entry_id/);
  assert.match(formSource, /saveJournalEntry\({\n        allowInsertWithId: true,\n        checkIn: \{\n          id: nextEventId/);
  assert.match(formSource, /eventDateTime=\{entryType !== "event"\}/);
  assert.match(formSource, /lg:grid-cols-\[minmax\(8rem,auto\)_repeat\(4,minmax\(0,1fr\)\)\]/);
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

test("Occurrence display rows interleave kinds chronologically with stable identity ties", () => {
  const rows = sortHealthJournalOccurrenceRows([
    { id: "back-pain-late", occurredAt: "2026-10-07T13:15:00.000Z", signalId: "back-pain" },
    { id: "symptom-tie", occurredAt: "2026-10-07T12:00:00.000Z" },
    { id: "feeling-tie", occurredAt: "2026-10-07T12:00:00.000Z" },
    { id: "symptom-early", occurredAt: "2026-10-07T09:00:00.000Z" },
    { id: "back-pain-early", occurredAt: "2026-10-07T11:15:00.000Z", signalId: "back-pain" },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["symptom-early", "back-pain-early", "feeling-tie", "symptom-tie", "back-pain-late"]);
  assert.deepEqual(rows.filter((row) => row.signalId === "back-pain").map((row) => row.id), ["back-pain-early", "back-pain-late"]);
});

test("7.13.51 Journal QA correction reduces Event Feeling scale-description typography and preserves legacy behavior", () => {
  const eventChoiceSource = formSource.slice(formSource.indexOf("function EventCaptureChoice"), formSource.indexOf("function StartOfDayQuestions"));
  const centeredHeaderClass = /className=\{`\$\{QUESTION_HINT_CLASS\} text-center font-semibold uppercase tracking-\[0\.16em\]`\}/g;

  assert.match(formSource, /HealthStandardTimeInput ariaLabel=\{topTimeLabel\} compact/);
  assert.match(eventCaptureSource, /HealthStandardTimeInput ariaLabel="When did it happen\?" compact/);
  assert.match(eventCaptureSource, /HealthStandardTimeInput ariaLabel="Event Feeling occurrence time" compact/);
  assert.doesNotMatch(eventCaptureSource, /What do you want to record about it\?/);
  assert.doesNotMatch(eventCaptureSource, /Event notes/);
  assert.match(eventCaptureSource, /createPortal/);
  assert.match(eventCaptureSource, /data-journal-floating-overlay="true"/);
  assert.match(eventCaptureSource, /style=\{\{ left: "50%", position: "fixed", top: "50%", transform: "translate\(-50%, -50%\)" \}\}/);
  assert.doesNotMatch(eventCaptureSource, /useLayoutEffect|updatePosition|getBoundingClientRect|window\.addEventListener\("scroll"/);
  assert.match(eventCaptureSource, /w-\[min\(44rem,calc\(100vw-1rem\)\)\]/);
  assert.doesNotMatch(eventCaptureSource, /w-\[min\(23rem/);
  assert.match(eventCaptureSource, /className="grid grid-cols-2 gap-1\.5 sm:grid-cols-3"/);
  assert.match(eventCaptureSource, /Array\.from\(\{ length: denominator \}, \(_, index\) => index \+ 1\)\.map\(\(score\)/);
  assert.match(eventCaptureSource, /className=\{`flex min-h-8 w-full min-w-0/);
  assert.match(eventCaptureSource, /<span className="shrink-0 text-xs font-semibold">\{score\}<\/span>/);
  assert.match(eventCaptureSource, /<span className="min-w-0 flex-1 text-\[11px\] font-medium leading-tight break-words whitespace-normal">\{signal\.scale_labels\[score\] \?\? ""\}<\/span>/);
  assert.doesNotMatch(eventCaptureSource, /text-left text-xs font-semibold/);
  assert.doesNotMatch(eventCaptureSource, /col-span/);
  assert.equal(eventCaptureSource.match(centeredHeaderClass)?.length, 2);
  assert.match(eventCaptureSource, /border-\[#5d49c7\] bg-\[#6f57f6\] text-white/);
  assert.match(eventCaptureSource, /border-\[#6f57f6\] bg-white text-\[#615b9c\]/);
  assert.doesNotMatch(eventCaptureSource, /bg-\[#f4f1ff\]/);
  assert.match(eventCaptureSource, /max-w-\[calc\(100vw-1rem\)\]/);
  assert.match(eventCaptureSource, /max-h-\[calc\(100dvh-1rem\)\].*overflow-y-auto/);
  assert.match(eventCaptureSource, /event\.key === "Escape"/);
  assert.match(eventCaptureSource, /readJournalTagQuery/);
  assert.match(eventCaptureSource, /replaceHealthJournalReflectionTag/);
  assert.match(eventCaptureSource, /const normalizedTime = normalizeHealthMealTime\(tagOverlay\.time\)/);
  assert.match(eventCaptureSource, /const occurredAt = normalizedTime \? buildHealthMealLoggedAt\(date, normalizedTime\) : null/);
  assert.match(eventCaptureSource, /if \(existing\) onUpdateOccurrence\(nextDraft\);\s+else onSaveOccurrence\(nextDraft\);/);
  assert.match(eventCaptureSource, /textarea\.focus\(\{ preventScroll: true \}\)/);

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

test("Estimated occurrence times use one additive legacy-safe migration and complete the persistence path", () => {
  assert.match(timeEstimatesMigrationSource, /add column if not exists time_is_estimated boolean not null default false/);
  assert.equal((timeEstimatesMigrationSource.match(/add column if not exists time_is_estimated/g) ?? []).length, 2);
  assert.match(timeEstimatesMigrationSource, /adhdice_health_symptom_entries/);
  assert.match(timeEstimatesMigrationSource, /adhdice_health_journal_signal_occurrences/);
  assert.match(healthHookSource, /time_is_estimated/);
  assert.match(healthHookSource, /select\("id,user_id,journal_entry_id,signal_id,entry_date,occurred_at,score,time_is_estimated/);
  assert.match(healthHookSource, /select\("id,user_id,symptom_id,journal_entry_id,entry_date,logged_at,severity,time_is_estimated/);
  assert.match(schemaSource, /time_is_estimated boolean not null default false/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  HealthCheckIn,
  HealthJournalSignal,
  HealthJournalSignalValue,
  HealthSymptom,
} from "../src/lib/database.types.ts";
import {
  buildHealthJournalDraftValues,
  DEFAULT_HEALTH_JOURNAL_HIGH_LABEL,
  DEFAULT_HEALTH_JOURNAL_FEELING_COLOR,
  DEFAULT_HEALTH_JOURNAL_LOW_LABEL,
  ensureHealthJournalDraftValue,
  getDefaultHealthJournalScaleLabels,
  getHealthJournalSignalDisplayColor,
  getHealthJournalSignalDisplayName,
  getHealthJournalTemplateSignals,
  groupHealthJournalEntriesByDate,
  HEALTH_JOURNAL_DEFAULT_SCALE_LABELS,
  HEALTH_JOURNAL_SCORE_OPTIONS,
  findHealthJournalReflectionTagMatches,
  normalizeHealthJournalScaleLabels,
  normalizeHealthJournalScore,
  normalizeHealthJournalSignal,
  normalizeHealthJournalEntryTime,
  replaceHealthJournalReflectionTag,
  updateHealthJournalDraftValue,
} from "../src/lib/health-journal.ts";
import {
  buildHealthMealLoggedAt,
  getCurrentHealthDateTimeInputs,
  HEALTH_SEVERITY_OPTIONS,
  normalizeHealthMealTime,
} from "../src/lib/health-utils.ts";

const migrationSource = readFileSync(
  new URL("../supabase/add_health_journal_daily_log_7_12_34.sql", import.meta.url),
  "utf8",
);
const scaleLabelsMigrationSource = readFileSync(
  new URL("../supabase/add_health_journal_scale_labels_7_12_35.sql", import.meta.url),
  "utf8",
);
const feelingColorsMigrationSource = readFileSync(
  new URL("../supabase/add_health_journal_feeling_colors_7_12_37.sql", import.meta.url),
  "utf8",
);
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const multipleEntriesMigrationSource = readFileSync(
  new URL("../supabase/add_health_journal_multiple_entries_7_12_41.sql", import.meta.url),
  "utf8",
);
const healthHookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const healthPageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");

function signal(id: string, overrides: Partial<HealthJournalSignal> = {}): HealthJournalSignal {
  return {
    archived_at: null,
    created_at: `${id}-created`,
    high_label: DEFAULT_HEALTH_JOURNAL_HIGH_LABEL,
    id,
    in_template: false,
    kind: "other",
    low_label: DEFAULT_HEALTH_JOURNAL_LOW_LABEL,
    name: id,
    color: DEFAULT_HEALTH_JOURNAL_FEELING_COLOR,
    scale_labels: getDefaultHealthJournalScaleLabels("other"),
    symptom_id: null,
    template_sort_order: null,
    updated_at: `${id}-updated`,
    user_id: "user-1",
    ...overrides,
  };
}

function value(signalId: string, entryId: string, score: number): HealthJournalSignalValue {
  return {
    created_at: "2026-08-30T09:00:00.000Z",
    id: `${entryId}-${signalId}`,
    journal_entry_id: entryId,
    score,
    signal_id: signalId,
    updated_at: "2026-08-30T09:00:00.000Z",
    user_id: "user-1",
  };
}

function journalEntry(
  id: string,
  entryDate: string,
  entryTime: string,
  createdAt: string,
): HealthCheckIn {
  return {
    clarity_score: null,
    created_at: createdAt,
    energy_score: null,
    entry_date: entryDate,
    entry_time: entryTime,
    id,
    mood_score: null,
    reflection: "",
    stress_score: null,
    symptom_tags: [],
    updated_at: createdAt,
    user_id: "user-1",
  };
}

test("Daily Log scores support explicit none, blank Not logged, and only integer values from 0 to 10", () => {
  assert.deepEqual([...HEALTH_JOURNAL_SCORE_OPTIONS], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(normalizeHealthJournalScore(0), 0);
  assert.equal(normalizeHealthJournalScore("10"), 10);
  assert.equal(normalizeHealthJournalScore(""), null);
  assert.equal(normalizeHealthJournalScore(11), null);
  assert.equal(normalizeHealthJournalScore(2.5), null);
});

test("Journal hashtag replacement preserves the full latest reflection across repeated and async-created tags", async () => {
  let reflection = "Today was pretty good. I had #Anx";
  const replaceTag = (current: string, query: string, name: string) => {
    const start = current.lastIndexOf(query);
    return replaceHealthJournalReflectionTag(current, start, start + query.length, `#${name} `);
  };

  reflection = replaceTag(reflection, "#Anx", "Anxiety");
  reflection += "in the morning, then some #Back";
  reflection = replaceTag(reflection, "#Back", "Back Pain");
  reflection += "after lunch, but later I noticed #Pan";
  const selectedQuery = { start: reflection.lastIndexOf("#Pan"), end: reflection.length };
  await Promise.resolve();
  reflection += "after the selection";
  reflection = replaceHealthJournalReflectionTag(reflection, selectedQuery.start, selectedQuery.end, "#Panic ");

  assert.equal(reflection, "Today was pretty good. I had #Anxiety in the morning, then some #Back Pain after lunch, but later I noticed #Panic after the selection");
});

test("Journal History tag matching resolves known display names without changing surrounding reflection text", () => {
  const reflection = "I had #Brain Fog after #Reflux, then #Reflux and #Unknown.";
  const matches = findHealthJournalReflectionTagMatches(reflection, [
    { key: "symptom:reflux", kind: "symptom", name: "Reflux" },
    { key: "emotion:brain-fog", kind: "emotion", name: "Brain Fog" },
  ]);

  assert.deepEqual(matches.map((match) => [match.text, match.key]), [
    ["#Brain Fog", "emotion:brain-fog"],
    ["#Reflux", "symptom:reflux"],
    ["#Reflux", "symptom:reflux"],
  ]);
  assert.equal(matches.reduceRight((current, match) => `${current.slice(0, match.start)}${match.text}${current.slice(match.end)}`, reflection), reflection);
  assert.equal(reflection.slice(matches[1]!.end, matches[2]!.start), ", then ");
  assert.equal(reflection.includes("#Unknown"), true);
});

test("Daily Log draft helpers keep one row while preserving 0 and Not logged semantics", () => {
  const duplicate = [
    { id: "value-1", score: 0, signal_id: "reflux" },
    { id: "value-2", score: 7, signal_id: "reflux" },
  ];
  const ensured = ensureHealthJournalDraftValue(duplicate, "reflux");
  assert.equal(ensured.length, 1);
  assert.equal(ensured[0]?.score, 0);
  assert.equal(updateHealthJournalDraftValue(ensured, "reflux", 0)[0]?.score, 0);
  assert.equal(updateHealthJournalDraftValue(ensured, "reflux", null)[0]?.score, null);
});

test("Journal Entry loads active template signals plus saved day-only and archived history", () => {
  const signals = [
    signal("day-only", { in_template: false }),
    signal("archived", { archived_at: "2026-08-29T12:00:00.000Z", in_template: false }),
    signal("template-late", { in_template: true, template_sort_order: 2 }),
    signal("template-first", { in_template: true, template_sort_order: 1 }),
  ];
  const draft = buildHealthJournalDraftValues({
    journalEntryId: "entry-1",
    signals,
    values: [value("day-only", "entry-1", 0), value("archived", "entry-1", 7)],
  });

  assert.deepEqual(draft.map((item) => [item.signal_id, item.score]), [
    ["template-first", null],
    ["template-late", null],
    ["day-only", 0],
    ["archived", 7],
  ]);
  assert.deepEqual(getHealthJournalTemplateSignals(signals).map((item) => item.id), ["template-first", "template-late"]);
});

test("Journal snapshots keep same-date entries separate and order by Entry time", () => {
  const groups = groupHealthJournalEntriesByDate([
    journalEntry("late", "2026-08-31", "22:00", "2026-09-01T02:00:00.000Z"),
    journalEntry("morning", "2026-08-31", "09:00", "2026-08-31T13:00:00.000Z"),
    journalEntry("other-day", "2026-08-30", "18:00", "2026-08-30T22:00:00.000Z"),
  ]);

  assert.deepEqual(groups.map((group) => group.date), ["2026-08-31", "2026-08-30"]);
  assert.deepEqual(groups[0]?.entries.map((entry) => entry.id), ["late", "morning"]);
  assert.equal(groups[0]?.entries.length, 2);
});

test("legacy Journal rows get a safe Entry time from created_at without changing Logged time", () => {
  const loggedAt = "2026-09-01T00:08:00.000Z";
  const expectedLocalTime = new Date(loggedAt);
  assert.equal(normalizeHealthJournalEntryTime(undefined, loggedAt), `${String(expectedLocalTime.getHours()).padStart(2, "0")}:08`);
  assert.equal(normalizeHealthJournalEntryTime("16:00:00", loggedAt), "16:00");
  assert.equal(loggedAt, "2026-09-01T00:08:00.000Z");
});

test("symptom Journal signals resolve their current canonical Health symptom name", () => {
  const symptom: HealthSymptom = {
    archived_at: null,
    color: "#6f57f6",
    created_at: "2026-08-30T09:00:00.000Z",
    id: "symptom-1",
    name: "Renamed symptom",
    updated_at: "2026-08-30T09:00:00.000Z",
    user_id: "user-1",
  };
  const journalSignal = normalizeHealthJournalSignal(signal("journal-1", {
    kind: "symptom",
    name: "stale duplicate",
    symptom_id: symptom.id,
  }));

  assert.equal(getHealthJournalSignalDisplayName(journalSignal, [symptom]), "Renamed symptom");
  assert.equal(journalSignal.name, null);
});

test("Journal-native colors normalize and display separately from canonical symptom colors", () => {
  const emotion = normalizeHealthJournalSignal(signal("emotion", { kind: "emotion", color: " #EC4899 " }));
  const invalidOther = normalizeHealthJournalSignal(signal("other", { color: "not-a-color" }));
  const symptom = normalizeHealthJournalSignal(signal("symptom", { kind: "symptom", color: "#ef4444", symptom_id: "symptom-1" }));
  assert.equal(emotion.color, "#ec4899");
  assert.equal(invalidOther.color, DEFAULT_HEALTH_JOURNAL_FEELING_COLOR);
  assert.equal(symptom.color, null);
  assert.equal(getHealthJournalSignalDisplayColor(emotion), "#ec4899");
  assert.equal(getHealthJournalSignalDisplayColor(symptom, { color: "#3b82f6" }), "#3b82f6");
  assert.equal(getHealthJournalSignalDisplayColor(symptom, { color: "#ef4444" }), "#ef4444");
});

test("Journal Feelings normalize to eleven labels and preserve legacy endpoint customization", () => {
  for (const kind of ["symptom", "emotion", "other"] as const) {
    assert.equal(getDefaultHealthJournalScaleLabels(kind).length, 11);
    assert.deepEqual(getDefaultHealthJournalScaleLabels(kind), [...HEALTH_JOURNAL_DEFAULT_SCALE_LABELS[kind]]);
  }

  const legacy = normalizeHealthJournalSignal(signal("legacy", {
    kind: "symptom",
    low_label: "Absent",
    high_label: "Unbearable",
    scale_labels: undefined as unknown as string[],
  }));
  assert.equal(legacy.scale_labels.length, 11);
  assert.equal(legacy.scale_labels[0], "Absent");
  assert.equal(legacy.scale_labels[10], "Unbearable");
  assert.equal(legacy.low_label, "Absent");
  assert.equal(legacy.high_label, "Unbearable");

  const edited = normalizeHealthJournalScaleLabels(
    ["None", "Barely", "Very slight", "Slight", "Mild", "Middle custom", "Noticeable", "Strong", "Very strong", "Intense", "Extreme"],
    "emotion",
    "Old low",
    "Old high",
  );
  assert.equal(edited[5], "Middle custom");
  assert.equal(edited[0], "None");
  assert.equal(edited[10], "Extreme");
});

test("7.12.35 source contract covers scale-label migration, unified Symptoms, collapsed scales, and hashtags", () => {
  assert.match(scaleLabelsMigrationSource, /add column if not exists scale_labels text\[\]/);
  assert.match(scaleLabelsMigrationSource, /cardinality\(scale_labels\) <> 11/);
  assert.match(scaleLabelsMigrationSource, /set low_label = scale_labels\[1\],[\s\S]*high_label = scale_labels\[11\]/);
  assert.match(schemaSource, /scale_labels text\[\] not null/);
  assert.match(schemaSource, /check \(cardinality\(scale_labels\) = 11\)/);
  assert.match(healthHookSource, /scale_labels: signal\.scale_labels/);
  assert.match(healthHookSource, /scale_labels: nextRow\.scale_labels/);
  assert.match(healthPageSource, /expandedJournalScaleKey/);
  assert.match(healthPageSource, /Type # while writing to tag a symptom or feeling/);
  assert.match(healthPageSource, /journal-tag-picker/);
  assert.match(healthPageSource, /JournalSymptomLibrarySection/);
  assert.match(healthPageSource, /title="Symptoms"/);
  assert.doesNotMatch(healthPageSource, /title="Symptom signals"/);
  assert.doesNotMatch(healthPageSource, /title="Canonical Health symptoms"/);
});

test("7.12.36 source contract covers readable scales, section-local creation, and picker spacing", () => {
  const scorePickerSource = healthPageSource.slice(
    healthPageSource.indexOf("function ScorePicker"),
    healthPageSource.indexOf("function JournalScalePicker"),
  );
  const journalScalePickerSource = healthPageSource.slice(
    healthPageSource.indexOf("function JournalScalePicker"),
    healthPageSource.indexOf("function FavoriteFoodHistoryInlay"),
  );

  assert.match(scorePickerSource, /HEALTH_SCALE_OPTIONS\.map/);
  assert.match(scorePickerSource, /className="grid grid-cols-2 gap-1\.5"/);
  assert.match(scorePickerSource, /break-words whitespace-normal/);
  assert.doesNotMatch(scorePickerSource, /HEALTH_JOURNAL_SCORE_OPTIONS/);
  assert.doesNotMatch(scorePickerSource, /sm:grid-cols-5/);
  assert.doesNotMatch(scorePickerSource, /<span className="truncate">/);

  assert.match(journalScalePickerSource, /renderScoreOption\(0, "w-full"\)/);
  assert.match(journalScalePickerSource, /HEALTH_JOURNAL_SCORE_OPTIONS\.filter\(\(score\) => score > 0\)/);
  assert.match(journalScalePickerSource, /className="grid grid-cols-2 gap-1\.5"/);
  assert.match(journalScalePickerSource, /onClick=\{onClear\}[^>]*>Not logged</);
  assert.match(journalScalePickerSource, /break-words whitespace-normal/);
  assert.doesNotMatch(journalScalePickerSource, /<span className="min-w-0 truncate/);
  assert.equal(normalizeHealthJournalScore(0), 0);
  assert.equal(normalizeHealthJournalScore(null), null);
  assert.match(healthPageSource, /setJournalMood\(score\); setExpandedJournalScaleKey\(null\)/);
  assert.match(healthPageSource, /updateHealthJournalDraftValue\(current, signal\.id, null\)/);

  assert.match(healthPageSource, /className="relative w-full min-w-0"/);
  assert.match(healthPageSource, /className="health-journal-textarea block min-h-40 w-full min-w-0 max-w-full/);
  assert.match(healthPageSource, /journalLibraryCreateKind: JournalSignalCreateKind \| null/);
  assert.match(healthPageSource, /<JournalFeelingCreationRow/);
  assert.match(healthPageSource, /\+ \{createLabel\}/);
  assert.match(healthPageSource, /kind === "emotion" \? "Emotion" : "Other Feeling"/);
  assert.match(healthPageSource, /getDefaultHealthJournalScaleLabels\(kind\)/);
  assert.doesNotMatch(healthPageSource, /New Feeling/);
  assert.match(healthPageSource, /kind="emotion"/);
  assert.match(healthPageSource, /kind="other"/);

  assert.match(healthPageSource, /visibleJournalTagGroups\.map\(\(\{ kind, options: groupOptions \}, groupIndex\)/);
  assert.match(healthPageSource, /groupIndex > 0 \? "mt-3" : ""/);
  assert.match(healthPageSource, /handleJournalReflectionKeyDown/);
  assert.match(healthPageSource, /ArrowDown/);
  assert.match(healthPageSource, /ArrowUp/);
  assert.match(healthPageSource, /selectJournalTag/);
});

test("7.12.41 source contract covers unified tag occurrence overlays and shared Feeling colors", () => {
  assert.match(healthPageSource, /const selectedQuery = journalTagQuery/);
  assert.match(healthPageSource, /setJournalReflection\(\(current\) => replaceHealthJournalReflectionTag\(current, selectedQuery\.start, selectedQuery\.end, replacement\)\)/);
  assert.doesNotMatch(healthPageSource, /setJournalReflection\(nextReflection\)/);
  assert.doesNotMatch(healthPageSource, /journalReflection\.slice\(0, journalTagQuery\.start\)/);
  assert.match(healthPageSource, /const \[journalTagOverlay, setJournalTagOverlay\] = useState<JournalTagOverlay>\(null\)/);
  assert.match(healthPageSource, /mode: "feeling_occurrence"/);
  assert.doesNotMatch(healthPageSource, /mode: "feeling_rating"/);
  assert.match(healthPageSource, /id="journal-tag-overlay"/);
  assert.match(healthPageSource, /inputRef=\{journalTagTimeRef\}/);
  assert.match(healthPageSource, /time: journalEntryTime \|\| getCurrentHealthDateTimeInputs\(\)\.time/);
  assert.match(healthPageSource, /HEALTH_SEVERITY_OPTIONS\.map/);
  assert.doesNotMatch(healthPageSource, /journalTagRatingSignalId/);
  assert.doesNotMatch(healthPageSource, /Skip for now/);
  assert.doesNotMatch(healthPageSource, /updateJournalTagRating/);
  assert.doesNotMatch(healthPageSource, /this Journal Entry&apos;s Daily Log/);
  assert.match(healthPageSource, /draftKey: createJournalDraftId\(\)/);
  assert.match(healthPageSource, /setJournalOccurrences\(\(current\) => \[\.\.\.current/);
  assert.match(healthPageSource, /\.\.\.\(occurrence\.id \? \{ id: occurrence\.id \} : \{\}\)/);
  assert.match(healthPageSource, /journalOccurrenceSaveStatusRef/);
  assert.match(healthPageSource, /setJournalOccurrences\(\(current\) => preserveCurrentDraft/);
  assert.match(healthPageSource, /<AdhdDropdownPanel/);
  assert.match(healthPageSource, /HealthJournalColorControl/);
  assert.doesNotMatch(healthPageSource, /HealthJournalColorPalette/);
  assert.match(healthPageSource, /HealthSymptomColorControl isOpen=\{isColorOpen\}/);
  assert.match(healthPageSource, /ADHDICE_ACCENT_COLORS/);

  const tagSelectionSource = healthPageSource.slice(
    healthPageSource.indexOf("async function selectJournalTag"),
    healthPageSource.indexOf("function toggleJournalHistoryTag"),
  );
  assert.doesNotMatch(tagSelectionSource, /setJournalDraftValues/);
  assert.doesNotMatch(tagSelectionSource, /updateHealthJournalDraftValue/);
  assert.match(healthPageSource, /setJournalOccurrences\(\(current\) => \[\.\.\.current/);

  assert.match(feelingColorsMigrationSource, /add column if not exists color text/);
  assert.match(feelingColorsMigrationSource, /kind in \('emotion', 'other'\)/);
  assert.match(feelingColorsMigrationSource, /color is null or color !~/);
  assert.match(feelingColorsMigrationSource, /color is not null and color ~/);
  assert.match(feelingColorsMigrationSource, /kind = 'symptom' and color is null/);
  assert.match(feelingColorsMigrationSource, /notify pgrst, 'reload schema'/);
  assert.match(schemaSource, /color text,[\s\S]*scale_labels text\[\] not null/);
  assert.match(schemaSource, /adhdice_health_journal_signals_color_check/);
  assert.match(schemaSource, /kind in \('emotion', 'other'\) and color is not null and color ~/);
  assert.match(healthHookSource, /color: signal\.color/);
  assert.match(healthHookSource, /color: nextRow\.color/);
  assert.match(healthHookSource, /color: kind === "symptom" \? null : input\.color/);
  assert.match(healthHookSource, /update\([\s\S]*color: nextRow\.color/);
});

test("7.12.39 source contract covers interactive History tags, exact ownership details, no-scroll overlays, and canonical symptom color reuse", () => {
  const journalTagSource = healthPageSource.slice(
    healthPageSource.indexOf("const [journalTagQuery"),
    healthPageSource.indexOf("async function toggleJournalSymptomTemplate"),
  );

  assert.match(healthPageSource, /findHealthJournalReflectionTagMatches/);
  assert.match(healthPageSource, /<JournalHistoryReflection/);
  assert.match(healthPageSource, /aria-label=\{`View \$\{match\.text\.slice\(1\)\} details from this Journal Entry`\}/);
  assert.match(healthPageSource, /type="button"/);
  assert.match(healthPageSource, /role="dialog"/);
  assert.match(healthPageSource, /occurrence\.journal_entry_id === entry\.id && occurrence\.symptom_id === option\.symptomId/);
  assert.match(healthPageSource, /value\.signal_id === option\.signal\?\.id/);
  assert.match(healthPageSource, /Snapshot rating/);
  assert.match(healthPageSource, /Not logged/);
  assert.match(healthPageSource, /getJournalTagOptionColor/);
  assert.match(healthPageSource, /scaleLabels\[overallValue\.score\]/);
  assert.match(healthPageSource, /subtitle="Feeling Occurrences"/);
  assert.doesNotMatch(healthPageSource, /Standalone symptom history/);

  assert.doesNotMatch(journalTagSource, /journalTagTimeRef\.current\?\.focus/);
  assert.doesNotMatch(journalTagSource, /journalTagOverlayRef\.current\?\.focus/);
  assert.doesNotMatch(journalTagSource, /scrollIntoView/);
  assert.match(healthPageSource, /textarea\.focus\(\{ preventScroll: true \}\)/);
  assert.match(healthPageSource, /bottom-2 left-auto top-auto z-40/);
  assert.match(healthPageSource, /HealthSymptomColorControl isOpen=\{openSymptomColorPickerKey === `journal-tag:/);
  assert.match(healthPageSource, /onSetColor=\{\(color\) => handleSetSymptomColor\(journalTagSymptom\.id, color\)\}/);
  assert.match(healthPageSource, /setSymptomColor\(symptomId, color\)/);
  assert.match(healthPageSource, /setJournalOccurrences\(\(current\) => \[\.\.\.current/);
  assert.match(healthPageSource, /saveJournalEntry\(\{/);
});

test("7.12.41 source contract keeps all Feeling tag overlays on the shared palette", () => {
  const tagOverlaySource = healthPageSource.slice(
    healthPageSource.indexOf("{journalTagOverlay ? ("),
    healthPageSource.indexOf("</AdhdDropdownPanel>", healthPageSource.indexOf("{journalTagOverlay ? (")),
  );

  assert.match(healthPageSource, /activeJournalSignals\.map\(\(signal\) => \(\{/);
  assert.match(healthPageSource, /kind: signal\.kind/);
  assert.match(tagOverlaySource, /HealthJournalColorControl/);
  assert.match(tagOverlaySource, /handleSetJournalSignalColor\(journalTagSignal\.id, color\)/);
  assert.match(tagOverlaySource, /HealthSymptomColorControl/);
  assert.match(tagOverlaySource, /handleSetSymptomColor\(journalTagSymptom\.id, color\)/);
  assert.match(healthPageSource, /function handleSetJournalSignalColor\(signalId: string, color: string\)[\s\S]*?void updateJournalSignal\(signalId, \{ color \}\)/);
  assert.match(healthPageSource, /function handleSetSymptomColor\(symptomId: string, color: string\)[\s\S]*?void setSymptomColor\(symptomId, color\)/);
  assert.match(healthPageSource, /function HealthJournalColorControl\([\s\S]*?return <HealthColorControl/);
  assert.match(healthPageSource, /function HealthColorControl\([\s\S]*?<HealthAccentColorPalette/);
  assert.match(tagOverlaySource, /journalTagSignal\.kind === "symptom" \? "Severity" : "Intensity"/);
  assert.match(healthPageSource, /score: null/);
  assert.doesNotMatch(tagOverlaySource, /JournalScalePicker/);
});

test("symptom hashtag occurrence defaults to a valid local time and accepts severity 1 through 10 only", () => {
  const inputs = getCurrentHealthDateTimeInputs(new Date());
  assert.match(inputs.time, /^([01]\d|2[0-3]):[0-5]\d$/);
  assert.equal(normalizeHealthMealTime(inputs.time), inputs.time);
  assert.deepEqual([...HEALTH_SEVERITY_OPTIONS], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(buildHealthMealLoggedAt("2026-08-31", inputs.time) !== null, true);
  assert.equal(buildHealthMealLoggedAt("2026-08-31", "24:00"), null);
});

test("archived canonical symptoms are excluded from current templates but saved history remains readable", () => {
  const archivedSymptom: HealthSymptom = {
    archived_at: "2026-08-30T10:00:00.000Z",
    color: "#6f57f6",
    created_at: "2026-08-29T10:00:00.000Z",
    id: "archived-symptom",
    name: "Archived reflux",
    updated_at: "2026-08-30T10:00:00.000Z",
    user_id: "user-1",
  };
  const archivedSignal = signal("archived-reflux-signal", {
    kind: "symptom",
    symptom_id: archivedSymptom.id,
    in_template: true,
    template_sort_order: 1,
  });
  assert.deepEqual(getHealthJournalTemplateSignals([archivedSignal], [archivedSymptom]), []);
  assert.deepEqual(buildHealthJournalDraftValues({
    journalEntryId: "entry-1",
    signals: [archivedSignal],
    symptoms: [archivedSymptom],
    values: [value(archivedSignal.id, "entry-1", 6)],
  }).map((item) => [item.signal_id, item.score]), [[archivedSignal.id, 6]]);
});

test("7.12.41 source contract covers multiple entries, occurrence ownership, RLS, and exact-ID save behavior", () => {
  assert.match(migrationSource, /add column if not exists stress_score integer/);
  assert.match(migrationSource, /add column if not exists clarity_score integer/);
  assert.match(migrationSource, /stress_score is null or \(stress_score >= 1 and stress_score <= 10\)/);
  assert.match(migrationSource, /create table if not exists public\.adhdice_health_journal_signals/);
  assert.match(migrationSource, /kind in \('emotion', 'other'\)[\s\S]*name is not null[\s\S]*char_length\(trim\(name\)\) > 0/);
  assert.match(migrationSource, /create table if not exists public\.adhdice_health_journal_signal_values/);
  assert.match(migrationSource, /unique \(user_id, journal_entry_id, signal_id\)/);
  assert.match(migrationSource, /references public\.adhdice_health_checkins \(user_id, id\)\s+on delete cascade/);
  assert.match(migrationSource, /references public\.adhdice_health_journal_signals \(user_id, id\)\s+on delete restrict/);
  assert.match(migrationSource, /alter table public\.adhdice_health_symptom_entries\s+add column if not exists journal_entry_id uuid/);
  assert.match(migrationSource, /alter table public\.adhdice_health_journal_signals enable row level security/);
  assert.match(migrationSource, /grant select, insert, update, delete on table public\.adhdice_health_journal_signal_values to authenticated/);
  assert.match(migrationSource, /notify pgrst, 'reload schema'/);

  assert.match(multipleEntriesMigrationSource, /add column if not exists entry_time time without time zone/);
  assert.match(multipleEntriesMigrationSource, /created_at at time zone 'UTC'/);
  assert.match(multipleEntriesMigrationSource, /alter column entry_time set not null/);
  assert.match(multipleEntriesMigrationSource, /drop constraint if exists adhdice_health_checkins_user_id_entry_date_key/);
  assert.match(multipleEntriesMigrationSource, /create table if not exists public\.adhdice_health_journal_signal_occurrences/);
  assert.match(multipleEntriesMigrationSource, /score integer not null check \(score between 1 and 10\)/);
  assert.match(multipleEntriesMigrationSource, /occurred_at timestamptz not null/);
  assert.match(multipleEntriesMigrationSource, /notify pgrst, 'reload schema'/);
  assert.doesNotMatch(schemaSource, /unique \(user_id, entry_date\)/);
  assert.match(schemaSource, /entry_time time without time zone not null/);
  assert.match(healthHookSource, /\.from\("adhdice_health_checkins"\)[\s\S]*\.insert\(\{ \.\.\.remoteCheckInFields, user_id: userId \}\)/);
  assert.match(healthHookSource, /\.from\("adhdice_health_checkins"\)[\s\S]*\.update\(remoteCheckInFields\)[\s\S]*\.eq\("id", requestedEntryId\)/);
  assert.doesNotMatch(healthHookSource, /onConflict: "user_id,entry_date"/);
  assert.match(healthHookSource, /\.from\("adhdice_health_journal_signal_values"\)[\s\S]*\.upsert\(scoredValues/);
  assert.match(healthHookSource, /\.from\("adhdice_health_symptom_entries"\)[\s\S]*\.upsert\(occurrenceRows/);
  assert.match(healthHookSource, /\.from\("adhdice_health_journal_signal_occurrences"\)[\s\S]*\.upsert\(journalSignalOccurrenceRows/);
  assert.match(healthHookSource, /journal_entry_id: nextRow\.id/);
  assert.match(healthHookSource, /checkIns\.filter\(\(entry\) => entry\.id !== nextRow\.id\)/);
  assert.match(healthHookSource, /journalSignalOccurrences.*storageKey\(userId, "journal-signal-occurrences"\)/s);
  assert.match(healthPageSource, /Save Journal Entry/);
  assert.match(healthPageSource, /Manage Journal Library/);
  assert.match(healthPageSource, /selectedJournalEntryId/);
  assert.match(healthPageSource, /Entry time/);
  assert.match(healthPageSource, /\+ New Entry/);
  assert.match(healthPageSource, /Your Daily Template/);
  assert.match(healthPageSource, /Feeling Occurrences/);
  assert.match(healthPageSource, /buildHealthJournalSymptomOccurrenceSignal/);
  assert.match(healthPageSource, /canonical-symptom:/);
  assert.match(healthPageSource, /Not logged/);
  assert.doesNotMatch(healthPageSource, /Save Check-In/);
  assert.doesNotMatch(healthPageSource, />Log a symptom</);
});

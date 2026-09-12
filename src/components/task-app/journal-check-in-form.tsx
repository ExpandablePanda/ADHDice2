"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  HealthCheckIn,
  HealthJournalCustomAnswer,
  HealthJournalCustomAnswerValue,
  HealthJournalCustomQuestion,
  HealthJournalEntryType,
  HealthJournalLinkedOccurrence,
  HealthJournalSignal,
  HealthJournalSignalOccurrence,
  HealthJournalStructuredAnswers,
  HealthMealEntry,
  HealthMetricEntry,
  HealthSymptom,
  HealthSymptomEntry,
} from "@/lib/database.types";
import type { HealthJournalEntrySaveInput } from "@/hooks/useHealth";
import { getDefaultHealthJournalScaleLabels, type HealthJournalDraftValue } from "@/lib/health-journal";
import {
  buildHealthJournalCustomAnswer,
  buildHealthJournalSleepLink,
  findRelevantHealthSleepContext,
  formatHealthJournalOccurrenceReference,
  formatHealthJournalSleepLink,
  getHealthJournalCustomQuestionsForEntry,
  getHealthJournalEntryType,
  getHealthJournalEntryTypeLabel,
  getHealthJournalScaleDenominator,
  HEALTH_JOURNAL_ENTRY_TYPES,
  normalizeHealthJournalCustomQuestions,
  normalizeHealthJournalLinkedOccurrences,
  normalizeHealthJournalReframes,
  normalizeHealthJournalStructuredAnswers,
  normalizeHealthJournalWins,
} from "@/lib/health-journal-checkins";
import {
  buildHealthMealLoggedAt,
  formatHealthNutritionNumber,
  formatHealthStandardTime,
  formatHealthTimestampTime,
  formatHealthSleepDuration,
  getCurrentHealthDateTimeInputs,
  HEALTH_SCALE_OPTIONS,
  normalizeHealthMealTime,
} from "@/lib/health-utils";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import { HEALTH_COMPACT_INPUT_CLASS, HealthDropdown, type HealthDropdownOption } from "./health-dropdown";
import { HealthStandardTimeInput } from "./health-standard-time-input";

const LONG_TEXT_CLASS = "block min-h-24 w-full rounded-[1.2rem] border border-[#e6e8f5] bg-white px-4 py-3 text-sm text-[#22304b] outline-none transition focus:border-[#9e8cf9] dark:border-white/10 dark:bg-white/[0.04] dark:text-white";
const MAIN_TEXT_CLASS = `${LONG_TEXT_CLASS} min-h-36`;
const QUESTION_LABEL_CLASS = "text-sm font-semibold text-[#26324f] dark:text-white";
const QUESTION_HINT_CLASS = "text-xs text-[#7d88a3] dark:text-white/50";

type JournalOccurrenceDraft = {
  id: string;
  name: string;
  signalId: string;
  score: number;
  time: string;
  note: string;
};

type JournalOccurrenceOption = {
  id: string;
  kind: "symptom" | "feeling";
  name: string;
  score: number;
  denominator: number;
  occurredAt: string;
  signal: HealthJournalSignal | null;
};

type JournalCheckInFormProps = {
  checkIns: readonly HealthCheckIn[];
  customQuestions: readonly HealthJournalCustomQuestion[];
  focusCategories: Parameters<typeof findRelevantHealthSleepContext>[0]["focusCategories"];
  focusHistory: Parameters<typeof findRelevantHealthSleepContext>[0]["focusHistory"];
  journalSignalOccurrences: readonly HealthJournalSignalOccurrence[];
  journalSignalValues: readonly (HealthJournalDraftValue & { journal_entry_id: string })[];
  journalSignals: readonly HealthJournalSignal[];
  mealEntries: readonly HealthMealEntry[];
  metricEntries: readonly HealthMetricEntry[];
  onAfterSave: () => void;
  onOpenFood: () => void;
  onOpenSleep: () => void;
  saveJournalEntry: (input: HealthJournalEntrySaveInput) => Promise<HealthCheckIn | null>;
  selectedJournalEntry: HealthCheckIn | null;
  symptomEntries: readonly HealthSymptomEntry[];
  symptoms: readonly HealthSymptom[];
};

function createDraftId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function occurrenceKey(kind: JournalOccurrenceOption["kind"], id: string) {
  return `${kind}:${id}`;
}

function occurrenceDraftsForEntry(
  entry: HealthCheckIn | null,
  symptomEntries: readonly HealthSymptomEntry[],
  journalSignalOccurrences: readonly HealthJournalSignalOccurrence[],
  journalSignals: readonly HealthJournalSignal[],
  symptoms: readonly HealthSymptom[],
) {
  if (!entry) return [];
  return [
    ...symptomEntries
      .filter((occurrence) => occurrence.journal_entry_id === entry.id)
      .map((occurrence) => ({
        id: occurrence.id,
        name: symptoms.find((symptom) => symptom.id === occurrence.symptom_id)?.name ?? "Archived symptom",
        signalId: journalSignals.find((signal) => signal.kind === "symptom" && signal.symptom_id === occurrence.symptom_id)?.id ?? `canonical-symptom:${occurrence.symptom_id}`,
        score: occurrence.severity,
        time: timeInputFromTimestamp(occurrence.logged_at),
        note: occurrence.note ?? "",
      })),
    ...journalSignalOccurrences
      .filter((occurrence) => occurrence.journal_entry_id === entry.id)
      .map((occurrence) => ({
        id: occurrence.id,
        name: journalSignals.find((signal) => signal.id === occurrence.signal_id)?.name ?? "Archived feeling",
        signalId: occurrence.signal_id,
        score: occurrence.score,
        time: timeInputFromTimestamp(occurrence.occurred_at),
        note: occurrence.note ?? "",
      })),
  ];
}

function timeInputFromTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime())
    ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
    : "";
}

function snapshotBreakfastMeal(entry: HealthMealEntry) {
  return {
    brand_name: entry.brand_name,
    calories: entry.calories,
    food_name: entry.food_name,
    id: entry.id,
    logged_at: entry.logged_at,
  };
}

function getCustomQuestionDefinition(
  question: HealthJournalCustomQuestion | HealthJournalCustomAnswer,
): HealthJournalCustomQuestion {
  return "question" in question && "enabled" in question
    ? question
    : {
      created_at: new Date(0).toISOString(),
      enabled: false,
      id: question.question_id,
      input_type: question.input_type,
      options: question.options,
      question: question.question,
      sort_order: Number.MAX_SAFE_INTEGER,
      target: question.target,
      updated_at: new Date(0).toISOString(),
    };
}

export function JournalCheckInForm({
  checkIns,
  customQuestions,
  focusCategories,
  focusHistory,
  journalSignalOccurrences,
  journalSignalValues,
  journalSignals,
  mealEntries,
  metricEntries,
  onAfterSave,
  onOpenFood,
  onOpenSleep,
  saveJournalEntry,
  selectedJournalEntry,
  symptomEntries,
  symptoms,
}: JournalCheckInFormProps) {
  const initialInputs = getCurrentHealthDateTimeInputs();
  const [entryType, setEntryType] = useState<HealthJournalEntryType>(() => getHealthJournalEntryType(selectedJournalEntry));
  const [entryDate, setEntryDate] = useState(selectedJournalEntry?.entry_date ?? initialInputs.date);
  const [entryTime, setEntryTime] = useState(selectedJournalEntry?.entry_time ?? initialInputs.time);
  const [answers, setAnswers] = useState<HealthJournalStructuredAnswers>(() => normalizeHealthJournalStructuredAnswers(selectedJournalEntry?.structured_answers));
  const [linkedOccurrenceKeys, setLinkedOccurrenceKeys] = useState<Set<string>>(() => new Set());
  const [occurrenceDrafts, setOccurrenceDrafts] = useState<JournalOccurrenceDraft[]>([]);
  const [occurrenceEditorOpen, setOccurrenceEditorOpen] = useState(false);
  const [occurrenceSignalId, setOccurrenceSignalId] = useState("");
  const [occurrenceScore, setOccurrenceScore] = useState<number | null>(null);
  const [occurrenceTime, setOccurrenceTime] = useState(initialInputs.time);
  const [occurrenceNote, setOccurrenceNote] = useState("");
  const [searchBreakfast, setSearchBreakfast] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const nextInputs = selectedJournalEntry
      ? { date: selectedJournalEntry.entry_date, time: selectedJournalEntry.entry_time }
      : getCurrentHealthDateTimeInputs();
    const nextAnswers = normalizeHealthJournalStructuredAnswers(selectedJournalEntry?.structured_answers);
    const hasStructuredJournalContent = Boolean(
      nextAnswers.event_description?.trim()
      || nextAnswers.event_record?.trim()
      || nextAnswers.anything_else?.trim()
      || nextAnswers.morning_thoughts?.trim()
      || nextAnswers.evening_reflection?.trim()
      || nextAnswers.custom_answers?.some((answer) => answer.value !== null && answer.value !== "" && (!Array.isArray(answer.value) || answer.value.length > 0))
      || nextAnswers.linked_occurrence_ids?.length
      || nextAnswers.wins?.some(Boolean)
      || nextAnswers.morning_reframes?.some((row) => row.negative || row.positive)
      || nextAnswers.evening_reframes?.some((row) => row.negative || row.positive)
    );
    if (selectedJournalEntry && !hasStructuredJournalContent && selectedJournalEntry.reflection.trim()) {
      nextAnswers.event_record = selectedJournalEntry.reflection;
    }
    const ownedDrafts = occurrenceDraftsForEntry(selectedJournalEntry, symptomEntries, journalSignalOccurrences, journalSignals, symptoms);
    const persistedLinks = normalizeHealthJournalLinkedOccurrences(nextAnswers.linked_occurrence_ids);
    const availableOccurrenceKeys = new Set([
      ...symptomEntries.map((occurrence) => `symptom:${occurrence.id}`),
      ...journalSignalOccurrences.map((occurrence) => `feeling:${occurrence.id}`),
    ]);
    const validPersistedLinks = persistedLinks.filter((reference) => availableOccurrenceKeys.has(occurrenceKey(reference.kind, reference.id)));
    const ownedDraftLinks = ownedDrafts
      .map((draft) => ({ id: draft.id, kind: journalSignals.find((signal) => signal.id === draft.signalId)?.kind === "symptom" ? "symptom" as const : "feeling" as const }))
      .filter((reference) => !validPersistedLinks.some((candidate) => candidate.kind === reference.kind && candidate.id === reference.id));
    const nextLinks = [...validPersistedLinks, ...ownedDraftLinks];
    // This effect rehydrates the local editor when the selected history entry changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntryType(getHealthJournalEntryType(selectedJournalEntry));
    setEntryDate(nextInputs.date);
    setEntryTime(nextInputs.time);
    setAnswers(nextAnswers);
    setOccurrenceDrafts(ownedDrafts);
    setLinkedOccurrenceKeys(new Set(nextLinks.map((reference) => occurrenceKey(reference.kind, reference.id))));
    setOccurrenceEditorOpen(false);
    setOccurrenceSignalId("");
    setOccurrenceScore(null);
    setOccurrenceTime(nextInputs.time);
    setOccurrenceNote("");
    setFormError(null);
  }, [journalSignalOccurrences, journalSignals, selectedJournalEntry, symptomEntries, symptoms]);

  const normalizedQuestions = useMemo(() => normalizeHealthJournalCustomQuestions(customQuestions), [customQuestions]);
  const visibleCustomQuestions = useMemo(
    () => getHealthJournalCustomQuestionsForEntry(normalizedQuestions, entryType),
    [entryType, normalizedQuestions],
  );
  const savedCustomAnswers = answers.custom_answers ?? [];
  const historicalCustomAnswers = savedCustomAnswers.filter((answer) => !visibleCustomQuestions.some((question) => question.id === answer.question_id));
  const questionsToRender: Array<HealthJournalCustomQuestion | HealthJournalCustomAnswer> = [...visibleCustomQuestions, ...historicalCustomAnswers];

  const sleepContext = useMemo(
    () => findRelevantHealthSleepContext({ date: entryDate, focusCategories, focusHistory, metricEntries }),
    [entryDate, focusCategories, focusHistory, metricEntries],
  );
  const linkedSleep = answers.sleep_link ?? null;
  const breakfastEntries = useMemo(
    () => mealEntries.filter((entry) => entry.entry_date === entryDate && entry.meal_slot === "breakfast"),
    [entryDate, mealEntries],
  );
  const filteredBreakfastEntries = useMemo(() => {
    const query = searchBreakfast.trim().toLowerCase();
    return breakfastEntries.filter((entry) => !query || `${entry.brand_name ?? ""} ${entry.food_name}`.toLowerCase().includes(query));
  }, [breakfastEntries, searchBreakfast]);
  const linkedOccurrenceOptions = useMemo<JournalOccurrenceOption[]>(() => {
    const options: JournalOccurrenceOption[] = [
      ...symptomEntries.map((occurrence) => {
        const signal = journalSignals.find((candidate) => candidate.kind === "symptom" && candidate.symptom_id === occurrence.symptom_id) ?? null;
        return {
          denominator: getHealthJournalScaleDenominator(signal),
          id: occurrence.id,
          kind: "symptom" as const,
          name: symptoms.find((symptom) => symptom.id === occurrence.symptom_id)?.name ?? "Archived symptom",
          occurredAt: occurrence.logged_at,
          score: occurrence.severity,
          signal,
        };
      }),
      ...journalSignalOccurrences.map((occurrence) => {
        const signal = journalSignals.find((candidate) => candidate.id === occurrence.signal_id) ?? null;
        return {
          denominator: getHealthJournalScaleDenominator(signal),
          id: occurrence.id,
          kind: "feeling" as const,
          name: signal?.name ?? "Archived feeling",
          occurredAt: occurrence.occurred_at,
          score: occurrence.score,
          signal,
        };
      }),
    ];
    return options
      .filter((option) => !occurrenceDrafts.some((draft) => draft.id === option.id))
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  }, [journalSignalOccurrences, journalSignals, occurrenceDrafts, symptomEntries, symptoms]);
  const occurrenceSignalOptions = useMemo(() => [
    ...symptoms.map((symptom) => {
      const signal = journalSignals.find((candidate) => candidate.kind === "symptom" && candidate.symptom_id === symptom.id);
      return signal
        ? { ...signal, name: signal.name ?? symptom.name }
        : {
          archived_at: null,
          color: null,
          created_at: "",
          high_label: "Extreme",
          id: `canonical-symptom:${symptom.id}`,
          in_template: false,
          kind: "symptom" as const,
          low_label: "None",
          name: symptom.name,
          scale_labels: getDefaultHealthJournalScaleLabels("symptom"),
          symptom_id: symptom.id,
          template_sort_order: null,
          updated_at: "",
          user_id: symptom.user_id,
        } satisfies HealthJournalSignal;
    }),
    ...journalSignals.filter((signal) => signal.kind !== "symptom" && signal.archived_at === null),
  ], [journalSignals, symptoms]);
  const occurrenceSignal = occurrenceSignalOptions.find((signal) => signal.id === occurrenceSignalId) ?? null;
  const occurrenceDenominator = getHealthJournalScaleDenominator(occurrenceSignal);
  const selectedBreakfastIds = answers.breakfast_meal_ids ?? [];

  function updateAnswer<Key extends keyof HealthJournalStructuredAnswers>(key: Key, value: HealthJournalStructuredAnswers[Key]) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function updateCustomAnswer(question: HealthJournalCustomQuestion, value: HealthJournalCustomAnswerValue) {
    setAnswers((current) => {
      const nextAnswer = buildHealthJournalCustomAnswer(question, value);
      const currentAnswers = current.custom_answers ?? [];
      const nextAnswers = currentAnswers.some((answer) => answer.question_id === question.id)
        ? currentAnswers.map((answer) => answer.question_id === question.id ? nextAnswer : answer)
        : [...currentAnswers, nextAnswer];
      return { ...current, custom_answers: nextAnswers };
    });
  }

  function toggleLinkedOccurrence(reference: HealthJournalLinkedOccurrence) {
    setLinkedOccurrenceKeys((current) => {
      const next = new Set(current);
      const key = occurrenceKey(reference.kind, reference.id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openOccurrenceEditor() {
    setOccurrenceEditorOpen(true);
    setOccurrenceSignalId(occurrenceSignalOptions[0]?.id ?? "");
    setOccurrenceScore(null);
    setOccurrenceTime(entryTime || getCurrentHealthDateTimeInputs().time);
    setOccurrenceNote("");
  }

  function saveOccurrenceDraft() {
    const normalizedTime = normalizeHealthMealTime(occurrenceTime);
    if (!occurrenceSignal || occurrenceScore === null || occurrenceScore < 1 || occurrenceScore > occurrenceDenominator || !normalizedTime || !buildHealthMealLoggedAt(entryDate, normalizedTime)) {
      setFormError(`Choose a Feeling, score from 1 to ${occurrenceDenominator}, and a valid local time.`);
      return;
    }
    const draft = { id: createDraftId("journal-occurrence"), name: occurrenceSignal.kind === "symptom" ? symptoms.find((symptom) => symptom.id === occurrenceSignal.symptom_id)?.name ?? "Archived symptom" : occurrenceSignal.name ?? "Archived feeling", note: occurrenceNote, score: occurrenceScore, signalId: occurrenceSignal.id, time: normalizedTime };
    setOccurrenceDrafts((current) => [...current, draft]);
    setLinkedOccurrenceKeys((current) => new Set([...current, occurrenceKey(occurrenceSignal.kind === "symptom" ? "symptom" : "feeling", draft.id)]));
    setOccurrenceEditorOpen(false);
    setFormError(null);
  }

  function removeOccurrenceDraft(id: string) {
    setOccurrenceDrafts((current) => current.filter((draft) => draft.id !== id));
    setLinkedOccurrenceKeys((current) => {
      const next = new Set(current);
      next.delete(occurrenceKey("symptom", id));
      next.delete(occurrenceKey("feeling", id));
      return next;
    });
  }

  function toggleBreakfast(entry: HealthMealEntry) {
    const nextIds = selectedBreakfastIds.includes(entry.id)
      ? selectedBreakfastIds.filter((id) => id !== entry.id)
      : [...selectedBreakfastIds, entry.id];
    updateAnswer("breakfast_state", "already_ate");
    updateAnswer("breakfast_meal_ids", nextIds);
    updateAnswer("breakfast_meals", breakfastEntries.filter((meal) => nextIds.includes(meal.id)).map(snapshotBreakfastMeal));
  }

  function resetFormForNewEntry() {
    const current = getCurrentHealthDateTimeInputs();
    setEntryType("start_of_day");
    setEntryDate(current.date);
    setEntryTime(current.time);
    setAnswers({ custom_answers: [], schema_version: 1 });
    setLinkedOccurrenceKeys(new Set());
    setOccurrenceDrafts([]);
    setOccurrenceEditorOpen(false);
    setOccurrenceSignalId("");
    setOccurrenceScore(null);
    setOccurrenceTime(current.time);
    setOccurrenceNote("");
    setSearchBreakfast("");
    setFormError(null);
  }

  async function handleSave() {
    if (isSaving) return;
    const ownedOccurrenceKeys = new Set([
      ...symptomEntries.filter((occurrence) => occurrence.journal_entry_id === selectedJournalEntry?.id).map((occurrence) => `symptom:${occurrence.id}`),
      ...journalSignalOccurrences.filter((occurrence) => occurrence.journal_entry_id === selectedJournalEntry?.id).map((occurrence) => `feeling:${occurrence.id}`),
    ]);
    const selectedOccurrenceReferences = [...linkedOccurrenceKeys].flatMap((key) => {
      const [kind, ...idParts] = key.split(":");
      const id = idParts.join(":");
      return (kind === "symptom" || kind === "feeling") && (!occurrenceDrafts.some((draft) => draft.id === id) || ownedOccurrenceKeys.has(key)) ? [{ id, kind }] : [];
    }) as HealthJournalLinkedOccurrence[];
    const symptomOccurrenceInputs = [] as HealthJournalEntrySaveInput["symptomOccurrences"];
    const feelingOccurrenceInputs = [] as HealthJournalEntrySaveInput["journalSignalOccurrences"];
    for (const draft of occurrenceDrafts) {
      const signal = occurrenceSignalOptions.find((candidate) => candidate.id === draft.signalId);
      const occurredAt = buildHealthMealLoggedAt(entryDate, draft.time);
      const denominator = getHealthJournalScaleDenominator(signal);
      const persistedSymptomOccurrence = symptomEntries.some((occurrence) => occurrence.id === draft.id && occurrence.journal_entry_id === selectedJournalEntry?.id);
      const persistedFeelingOccurrence = journalSignalOccurrences.some((occurrence) => occurrence.id === draft.id && occurrence.journal_entry_id === selectedJournalEntry?.id);
      if (!signal || !occurredAt || !Number.isInteger(draft.score) || draft.score < 1 || draft.score > denominator) {
        setFormError(`Each new Feeling occurrence needs a score from 1 to ${denominator} and a valid local time.`);
        return;
      }
      if (signal.kind === "symptom" && signal.symptom_id) {
        symptomOccurrenceInputs.push({ ...(persistedSymptomOccurrence ? { id: draft.id } : {}), entry_date: entryDate, logged_at: occurredAt, note: draft.note, severity: draft.score, symptom_id: signal.symptom_id });
      } else if (signal.kind === "emotion" || signal.kind === "other") {
        feelingOccurrenceInputs.push({ ...(persistedFeelingOccurrence ? { id: draft.id } : {}), entry_date: entryDate, note: draft.note, occurred_at: occurredAt, score: draft.score, signal_id: signal.id });
      }
    }
    const nextAnswers: HealthJournalStructuredAnswers = {
      ...answers,
      anything_else: typeof answers.anything_else === "string" ? answers.anything_else : "",
      custom_answers: answers.custom_answers ?? [],
      event_time: entryType === "event" ? answers.event_time ?? `${entryDate}T${entryTime}` : answers.event_time,
      linked_occurrence_ids: selectedOccurrenceReferences,
      schema_version: 1,
    };
    const nextReflection = entryType === "event"
      ? nextAnswers.event_record ?? nextAnswers.anything_else ?? selectedJournalEntry?.reflection ?? ""
      : nextAnswers.anything_else ?? selectedJournalEntry?.reflection ?? "";
    setIsSaving(true);
    setFormError(null);
    const saved = await saveJournalEntry({
      checkIn: {
        ...(selectedJournalEntry ? { id: selectedJournalEntry.id } : {}),
        clarity_score: selectedJournalEntry?.clarity_score ?? null,
        energy_score: entryType === "start_of_day" ? nextAnswers.energy_now ?? null : entryType === "end_of_day" ? nextAnswers.energy_overall ?? null : selectedJournalEntry?.energy_score ?? null,
        entry_date: entryDate,
        entry_time: entryTime,
        entry_type: entryType,
        mood_score: selectedJournalEntry?.mood_score ?? null,
        reflection: nextReflection.trim(),
        stress_score: selectedJournalEntry?.stress_score ?? null,
        structured_answers: nextAnswers,
      },
      journalSignalOccurrences: feelingOccurrenceInputs,
      signalValues: selectedJournalEntry
        ? journalSignalValues.filter((value) => value.journal_entry_id === selectedJournalEntry.id).map(({ id, signal_id, score }) => ({ id, signal_id, score }))
        : [],
      symptomOccurrences: symptomOccurrenceInputs,
    });
    setIsSaving(false);
    if (saved) {
      resetFormForNewEntry();
      onAfterSave();
    }
  }

  const topDateLabel = entryType === "event" ? "Event date" : "Check-in date";
  const topTimeLabel = entryType === "event" ? "When did it happen?" : "Check-in time";
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid min-w-0 gap-3 sm:grid-cols-[auto_auto_minmax(14rem,1fr)] sm:items-end">
          <label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Entry type</span><select aria-label="Journal entry type" className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => setEntryType(event.target.value as HealthJournalEntryType)} value={entryType}>{HEALTH_JOURNAL_ENTRY_TYPES.map((type) => <option key={type} value={type}>{getHealthJournalEntryTypeLabel(type)}</option>)}</select></label>
          <label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{topDateLabel}</span><input aria-label={topDateLabel} className={HEALTH_COMPACT_INPUT_CLASS} max={getCurrentHealthDateTimeInputs().date} onChange={(event) => setEntryDate(event.target.value)} type="date" value={entryDate} /></label>
          <div className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{topTimeLabel}</span><HealthStandardTimeInput ariaLabel={topTimeLabel} onChange={setEntryTime} value={entryTime} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><span className={QUESTION_HINT_CLASS}>{selectedJournalEntry ? "Existing entry" : "New entry · not saved yet"}</span><AdhdChip onClick={resetFormForNewEntry} type="button">+ New entry</AdhdChip></div>
      </div>

      {entryType === "start_of_day" ? <StartOfDayQuestions answers={answers} breakfastEntries={filteredBreakfastEntries} breakfastSearch={searchBreakfast} feelingQuestion={<FeelingQuestionSection answers={answers} entryType="start_of_day" linkedOccurrenceKeys={linkedOccurrenceKeys} occurrenceDrafts={occurrenceDrafts} occurrenceOptions={linkedOccurrenceOptions} occurrenceSignalOptions={occurrenceSignalOptions} onOpenEditor={openOccurrenceEditor} onRemoveDraft={removeOccurrenceDraft} onToggleLinkedOccurrence={toggleLinkedOccurrence} onUpdateAnswer={updateAnswer} />} linkedBreakfastIds={selectedBreakfastIds} linkedSleep={linkedSleep} onOpenFood={onOpenFood} onOpenSleep={onOpenSleep} onSearchBreakfast={setSearchBreakfast} onToggleBreakfast={toggleBreakfast} onUpdateAnswer={updateAnswer} sleepContext={sleepContext} /> : null}
      {entryType === "end_of_day" ? <EndOfDayQuestions answers={answers} feelingQuestion={<FeelingQuestionSection answers={answers} entryType="end_of_day" linkedOccurrenceKeys={linkedOccurrenceKeys} occurrenceDrafts={occurrenceDrafts} occurrenceOptions={linkedOccurrenceOptions} occurrenceSignalOptions={occurrenceSignalOptions} onOpenEditor={openOccurrenceEditor} onRemoveDraft={removeOccurrenceDraft} onToggleLinkedOccurrence={toggleLinkedOccurrence} onUpdateAnswer={updateAnswer} />} onUpdateAnswer={updateAnswer} /> : null}
      {entryType === "event" ? <EventQuestions answers={answers} entryDate={entryDate} entryTime={entryTime} feelingQuestion={<FeelingQuestionSection answers={answers} entryType="event" linkedOccurrenceKeys={linkedOccurrenceKeys} occurrenceDrafts={occurrenceDrafts} occurrenceOptions={linkedOccurrenceOptions} occurrenceSignalOptions={occurrenceSignalOptions} onOpenEditor={openOccurrenceEditor} onRemoveDraft={removeOccurrenceDraft} onToggleLinkedOccurrence={toggleLinkedOccurrence} onUpdateAnswer={updateAnswer} />} onChangeDate={(date) => { setEntryDate(date); updateAnswer("event_time", `${date}T${entryTime}`); }} onUpdateAnswer={updateAnswer} onUpdateEventTime={(time) => { setEntryTime(time); updateAnswer("event_time", `${entryDate}T${time}`); }} /> : null}
      {occurrenceEditorOpen ? <OccurrenceEditor occurrenceDenominator={occurrenceDenominator} occurrenceNote={occurrenceNote} occurrenceScore={occurrenceScore} occurrenceSignal={occurrenceSignal} occurrenceSignalId={occurrenceSignalId} occurrenceSignalOptions={occurrenceSignalOptions} occurrenceTime={occurrenceTime} onCancel={() => setOccurrenceEditorOpen(false)} onChangeNote={setOccurrenceNote} onChangeScore={setOccurrenceScore} onChangeSignal={setOccurrenceSignalId} onChangeTime={setOccurrenceTime} onSave={saveOccurrenceDraft} /> : null}

      {entryType !== "event" ? <CustomQuestionsSection questions={questionsToRender} answers={savedCustomAnswers} onChange={updateCustomAnswer} /> : null}
      {entryType !== "event" ? <TextQuestion label="Anything else?" long value={answers.anything_else ?? ""} onChange={(value) => updateAnswer("anything_else", value)} /> : null}
      {formError ? <p aria-live="polite" className="text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]" role="alert">{formError}</p> : null}
      <div className="flex justify-end"><button className="ui-pill-button-strong-light disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} onClick={() => { void handleSave(); }} type="button">{isSaving ? "Saving..." : selectedJournalEntry ? "Update Journal Entry" : "Save Journal Entry"}</button></div>
      {checkIns.length === 0 ? null : <p className="text-right text-xs text-[#7d88a3] dark:text-white/45">Saved Journal history remains available beside this form.</p>}
    </div>
  );
}

function QuestionSection({ children, title }: { children: ReactNode; title: string }) {
  return <section className="grid gap-3 rounded-[1.1rem] border border-[#edf0fb] bg-white/45 p-4 dark:border-white/10 dark:bg-white/[0.02]"><h3 className="text-sm font-black text-[#26324f] dark:text-white">{title}</h3>{children}</section>;
}

function TextQuestion({ label, long = false, onChange, value }: { label: string; long?: boolean; onChange: (value: string) => void; value: string }) {
  return <label className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>{label}</span>{long ? <textarea className={LONG_TEXT_CLASS} onChange={(event) => onChange(event.target.value)} value={value} /> : <input className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChange(event.target.value)} value={value} />}</label>;
}

function ScaleQuestion({ label, note, onChangeNote, onChangeScore, score, scaleLabel = "1–10" }: { label: string; note: string; onChangeNote: (value: string) => void; onChangeScore: (value: number | null) => void; score: number | null; scaleLabel?: string }) {
  return <div className="grid gap-2"><div className="flex flex-wrap items-baseline justify-between gap-2"><span className={QUESTION_LABEL_CLASS}>{label}</span><span className={QUESTION_HINT_CLASS}>{scaleLabel}</span></div><div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">{HEALTH_SCALE_OPTIONS.map((value) => <button aria-label={`${label} ${value} out of 10`} aria-pressed={score === value} className={`min-h-9 rounded-[0.7rem] text-sm font-semibold ${score === value ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]" : "bg-[#f4f1ff] text-[#615b9c] dark:bg-white/8 dark:text-white/65"}`} key={value} onClick={() => onChangeScore(score === value ? null : value)} type="button">{value}</button>)}</div><input aria-label={`${label} note`} className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChangeNote(event.target.value)} placeholder="Optional note" value={note} /></div>;
}

function StartOfDayQuestions({ answers, breakfastEntries, breakfastSearch, feelingQuestion, linkedBreakfastIds, linkedSleep, onOpenFood, onOpenSleep, onSearchBreakfast, onToggleBreakfast, onUpdateAnswer, sleepContext }: { answers: HealthJournalStructuredAnswers; breakfastEntries: readonly HealthMealEntry[]; breakfastSearch: string; feelingQuestion: ReactNode; linkedBreakfastIds: readonly string[]; linkedSleep: HealthJournalStructuredAnswers["sleep_link"]; onOpenFood: () => void; onOpenSleep: () => void; onSearchBreakfast: (value: string) => void; onToggleBreakfast: (entry: HealthMealEntry) => void; onUpdateAnswer: <Key extends keyof HealthJournalStructuredAnswers>(key: Key, value: HealthJournalStructuredAnswers[Key]) => void; sleepContext: ReturnType<typeof findRelevantHealthSleepContext> }) {
  const reframes = normalizeHealthJournalReframes(answers.morning_reframes);
  return <div className="grid gap-4"><QuestionSection title="How did you sleep?"><div className="rounded-[0.9rem] border border-[#edf0fb] bg-white/70 px-3 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]"><p className="font-semibold text-[#26324f] dark:text-white">{linkedSleep ? formatHealthJournalSleepLink(linkedSleep) : sleepContext ? `${formatHealthJournalSleepLink(sleepContext)} found` : "No sleep data was found for the previous night or most relevant overnight period."}</p>{sleepContext ? <div className="mt-2 grid gap-1 text-xs text-[#7d88a3] dark:text-white/50">{sleepContext.records.map((record) => <span key={`${record.source}:${record.id}`}>{record.source === "focus" ? "Sleep Focus" : "Apple Health"} · {formatHealthSleepDuration(record.minutes)}{record.started_at ? ` · ${formatHealthTimestampTime(record.started_at)}` : ""}</span>)}</div> : null}</div><div className="flex flex-wrap gap-2">{sleepContext && !linkedSleep ? <AdhdChip onClick={() => onUpdateAnswer("sleep_link", buildHealthJournalSleepLink(sleepContext))} tone="purple" type="button">Attach sleep data</AdhdChip> : null}<AdhdChip onClick={onOpenSleep} type="button">Open Sleep</AdhdChip></div><ScaleQuestion label="Subjective sleep quality" note={answers.sleep_quality_note ?? ""} onChangeNote={(value) => onUpdateAnswer("sleep_quality_note", value)} onChangeScore={(value) => onUpdateAnswer("sleep_quality_score", value)} score={answers.sleep_quality_score ?? null} /></QuestionSection><QuestionSection title="Did you have breakfast, or are you going to have it?"><div className="flex flex-wrap gap-2">{(["already_ate", "planning_to_eat", "skipping", "not_sure_yet"] as const).map((state) => <AdhdChip key={state} onClick={() => { onUpdateAnswer("breakfast_state", state); if (state !== "already_ate") { onUpdateAnswer("breakfast_meal_ids", []); onUpdateAnswer("breakfast_meals", []); } }} selected={answers.breakfast_state === state} type="button">{state === "already_ate" ? "Already ate" : state === "planning_to_eat" ? "Planning to eat" : state === "skipping" ? "Skipping / not having breakfast" : "Not sure yet"}</AdhdChip>)}</div>{answers.breakfast_state === "already_ate" ? <div className="grid gap-2"><div className="flex flex-wrap items-center gap-2"><input aria-label="Find breakfast food" className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-[12rem] flex-1`} onChange={(event) => onSearchBreakfast(event.target.value)} placeholder="Find logged breakfast" value={breakfastSearch} /><AdhdChip onClick={onOpenFood} type="button">Open Food</AdhdChip></div>{breakfastEntries.length === 0 ? <p className={QUESTION_HINT_CLASS}>No consumed breakfast Food records were found for this date.</p> : breakfastEntries.map((entry) => <label className="flex flex-wrap items-center gap-2 rounded-[0.8rem] border border-[#edf0fb] px-3 py-2 text-sm dark:border-white/10" key={entry.id}><input checked={linkedBreakfastIds.includes(entry.id)} onChange={() => onToggleBreakfast(entry)} type="checkbox" /><span className="min-w-0 flex-1 font-semibold text-[#26324f] dark:text-white">{entry.brand_name ? `${entry.brand_name} · ` : ""}{entry.food_name}</span><span className="text-xs text-[#7d88a3] dark:text-white/50">{formatHealthNutritionNumber(entry.calories)} kcal</span></label>)}</div> : null}{answers.breakfast_state === "planning_to_eat" ? <TextQuestion label="Planned breakfast (optional)" value={answers.planned_breakfast ?? ""} onChange={(value) => onUpdateAnswer("planned_breakfast", value)} /> : null}<p className={QUESTION_HINT_CLASS}>{answers.breakfast_state === "planning_to_eat" ? "Planning is saved as a Journal answer and will not create consumed Food or calories." : "Linked breakfast records remain owned by Food."}</p></QuestionSection>{feelingQuestion}<ScaleQuestion label="How is your energy right now?" note={answers.energy_note ?? ""} onChangeNote={(value) => onUpdateAnswer("energy_note", value)} onChangeScore={(value) => onUpdateAnswer("energy_now", value)} score={answers.energy_now ?? null} /><ScaleQuestion label="How is your focus right now?" note={answers.focus_note ?? ""} onChangeNote={(value) => onUpdateAnswer("focus_note", value)} onChangeScore={(value) => onUpdateAnswer("focus_now", value)} score={answers.focus_now ?? null} /><TextQuestion label="What is on your mind this morning?" long value={answers.morning_thoughts ?? ""} onChange={(value) => onUpdateAnswer("morning_thoughts", value)} /><ReframeRows label="List up to 5 negative thoughts on your mind and turn them positive" rows={reframes} onChange={(rows) => onUpdateAnswer("morning_reframes", rows)} /><TextQuestion label="What matters most today?" long value={answers.matters_most ?? ""} onChange={(value) => onUpdateAnswer("matters_most", value)} /><TextQuestion label="Is there anything that could make today harder?" long value={answers.harder_today ?? ""} onChange={(value) => onUpdateAnswer("harder_today", value)} /><TextQuestion label="What would make today feel successful?" long value={answers.successful_today ?? ""} onChange={(value) => onUpdateAnswer("successful_today", value)} /></div>;
}

function EndOfDayQuestions({ answers, feelingQuestion, onUpdateAnswer }: { answers: HealthJournalStructuredAnswers; feelingQuestion: ReactNode; onUpdateAnswer: <Key extends keyof HealthJournalStructuredAnswers>(key: Key, value: HealthJournalStructuredAnswers[Key]) => void }) {
  return <div className="grid gap-4">{feelingQuestion}<ScaleQuestion label="How was your energy today overall?" note={answers.energy_note ?? ""} onChangeNote={(value) => onUpdateAnswer("energy_note", value)} onChangeScore={(value) => onUpdateAnswer("energy_overall", value)} score={answers.energy_overall ?? null} /><ScaleQuestion label="How was your focus today overall?" note={answers.focus_note ?? ""} onChangeNote={(value) => onUpdateAnswer("focus_note", value)} onChangeScore={(value) => onUpdateAnswer("focus_overall", value)} score={answers.focus_overall ?? null} /><TextQuestion label="How did today go?" long value={answers.evening_reflection ?? ""} onChange={(value) => onUpdateAnswer("evening_reflection", value)} /><TextQuestion label="What went well today?" long value={answers.went_well ?? ""} onChange={(value) => onUpdateAnswer("went_well", value)} /><WinRows rows={normalizeHealthJournalWins(answers.wins)} onChange={(rows) => onUpdateAnswer("wins", rows)} /><TextQuestion label="What was difficult today?" long value={answers.difficult_today ?? ""} onChange={(value) => onUpdateAnswer("difficult_today", value)} /><ReframeRows label="List up to 5 negative thoughts from today and turn them into positives" rows={normalizeHealthJournalReframes(answers.evening_reframes)} onChange={(rows) => onUpdateAnswer("evening_reframes", rows)} /><TextQuestion label="Is anything still on your mind?" long value={answers.still_on_mind ?? ""} onChange={(value) => onUpdateAnswer("still_on_mind", value)} /><TextQuestion label="What do you want to remember for tomorrow?" long value={answers.remember_tomorrow ?? ""} onChange={(value) => onUpdateAnswer("remember_tomorrow", value)} /></div>;
}

function EventQuestions({ answers, entryDate, entryTime, feelingQuestion, onChangeDate, onUpdateAnswer, onUpdateEventTime }: { answers: HealthJournalStructuredAnswers; entryDate: string; entryTime: string; feelingQuestion: ReactNode; onChangeDate: (value: string) => void; onUpdateAnswer: <Key extends keyof HealthJournalStructuredAnswers>(key: Key, value: HealthJournalStructuredAnswers[Key]) => void; onUpdateEventTime: (value: string) => void }) {
  return <div className="grid gap-4"><QuestionSection title="What happened?"><label className="grid gap-2"><span className={`${QUESTION_LABEL_CLASS} text-base`}>Primary event description</span><textarea autoFocus={!answers.event_description} className={MAIN_TEXT_CLASS} onChange={(event) => onUpdateAnswer("event_description", event.target.value)} placeholder="Describe what happened..." value={answers.event_description ?? ""} /></label></QuestionSection><QuestionSection title="When did it happen?"><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>Date</span><input aria-label="Event date" className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChangeDate(event.target.value)} type="date" value={entryDate} /></label><label className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>Time</span><HealthStandardTimeInput ariaLabel="Event time" onChange={onUpdateEventTime} value={answers.event_time?.includes("T") ? answers.event_time.split("T")[1] ?? entryTime : entryTime} /></label></div></QuestionSection>{feelingQuestion}<QuestionSection title="What do you want to record about it?"><TextQuestion label="Event notes" long value={answers.event_record ?? ""} onChange={(value) => onUpdateAnswer("event_record", value)} /></QuestionSection></div>;
}

function FeelingQuestionSection({ answers, entryType, linkedOccurrenceKeys, occurrenceDrafts, occurrenceOptions, occurrenceSignalOptions, onOpenEditor, onRemoveDraft, onToggleLinkedOccurrence, onUpdateAnswer }: { answers: HealthJournalStructuredAnswers; entryType: HealthJournalEntryType; linkedOccurrenceKeys: ReadonlySet<string>; occurrenceDrafts: readonly JournalOccurrenceDraft[]; occurrenceOptions: readonly JournalOccurrenceOption[]; occurrenceSignalOptions: readonly HealthJournalSignal[]; onOpenEditor: () => void; onRemoveDraft: (id: string) => void; onToggleLinkedOccurrence: (reference: HealthJournalLinkedOccurrence) => void; onUpdateAnswer: <Key extends keyof HealthJournalStructuredAnswers>(key: Key, value: HealthJournalStructuredAnswers[Key]) => void }) {
  const noteKey = entryType === "start_of_day" ? "waking_feeling_note" : entryType === "end_of_day" ? "current_feeling_note" : "event_feeling_note";
  return <QuestionSection title={entryType === "start_of_day" ? "How do you feel waking up?" : entryType === "end_of_day" ? "How do you feel right now?" : "How did you feel?"}><p className={QUESTION_HINT_CLASS}>Each reference is a specific logged occurrence with its severity/intensity and local time.</p>{occurrenceOptions.length === 0 && occurrenceDrafts.length === 0 ? <p className={QUESTION_HINT_CLASS}>No other logged Feeling occurrences are available yet. You can log one here.</p> : null}<div className="grid gap-2">{occurrenceOptions.map((option) => { const reference = { id: option.id, kind: option.kind }; const key = occurrenceKey(reference.kind, reference.id); return <label className="flex min-w-0 items-start gap-2 rounded-[0.8rem] border border-[#edf0fb] px-3 py-2 dark:border-white/10" key={key}><input checked={linkedOccurrenceKeys.has(key)} onChange={() => onToggleLinkedOccurrence(reference)} type="checkbox" /><span className="min-w-0 flex-1 text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthJournalOccurrenceReference({ name: option.name, occurredAt: option.occurredAt, score: option.score, signal: option.signal })}</span></label>; })}{occurrenceDrafts.map((draft) => { const signal = occurrenceSignalOptions.find((candidate) => candidate.id === draft.signalId) ?? null; const name = draft.name; const denominator = getHealthJournalScaleDenominator(signal); return <div className="flex flex-wrap items-center gap-2 rounded-[0.8rem] border border-[#edf0fb] px-3 py-2 dark:border-white/10" key={draft.id}><span className="min-w-0 flex-1 text-sm font-semibold text-[#26324f] dark:text-white">{name} ({draft.score}/{denominator}) {formatHealthStandardTime(draft.time) ?? "Time unavailable"}</span><AdhdIconButton aria-label={`Remove ${name} occurrence`} onClick={() => onRemoveDraft(draft.id)} size="sm" tone="danger" variant="rowToolbar">×</AdhdIconButton></div>; })}</div><AdhdChip onClick={onOpenEditor} type="button">+ Log a new occurrence</AdhdChip><TextQuestion label="Optional note" value={String(answers[noteKey] ?? "")} onChange={(value) => onUpdateAnswer(noteKey, value)} /></QuestionSection>;
}

function OccurrenceEditor({ occurrenceDenominator, occurrenceNote, occurrenceScore, occurrenceSignal, occurrenceSignalId, occurrenceSignalOptions, occurrenceTime, onCancel, onChangeNote, onChangeScore, onChangeSignal, onChangeTime, onSave }: { occurrenceDenominator: number; occurrenceNote: string; occurrenceScore: number | null; occurrenceSignal: HealthJournalSignal | null; occurrenceSignalId: string; occurrenceSignalOptions: readonly HealthJournalSignal[]; occurrenceTime: string; onCancel: () => void; onChangeNote: (value: string) => void; onChangeScore: (value: number | null) => void; onChangeSignal: (value: string) => void; onChangeTime: (value: string) => void; onSave: () => void }) {
  const options: HealthDropdownOption[] = [{ label: "Choose a Feeling", value: "" }, ...occurrenceSignalOptions.map((signal) => ({ label: signal.name ?? (signal.kind === "symptom" ? "Symptom" : "Feeling"), value: signal.id }))];
  return <div className="grid gap-3 rounded-[1rem] border border-[#e4deef] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.03]"><label className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>Feeling</span><HealthDropdown ariaLabel="New occurrence Feeling" onChange={onChangeSignal} options={options} value={occurrenceSignalId} /></label><div className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>{occurrenceSignal?.kind === "symptom" ? "Severity" : "Intensity"} · 1–{occurrenceDenominator}</span><div className="grid grid-cols-2 gap-1.5">{Array.from({ length: occurrenceDenominator }, (_, index) => index + 1).map((score) => <button aria-label={`Occurrence score ${score} out of ${occurrenceDenominator}${occurrenceSignal?.scale_labels[score] ? ` · ${occurrenceSignal.scale_labels[score]}` : ""}`} aria-pressed={occurrenceScore === score} className={`flex min-h-9 min-w-0 items-start gap-2 rounded-[0.7rem] px-2 py-2 text-left text-xs font-semibold ${occurrenceScore === score ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]" : "bg-[#f4f1ff] text-[#615b9c] dark:bg-white/8 dark:text-white/65"}`} key={score} onClick={() => onChangeScore(score)} type="button"><span className="shrink-0 font-black">{score}</span><span className="min-w-0 break-words whitespace-normal">{occurrenceSignal?.scale_labels[score] ?? ""}</span></button>)}</div></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>Occurrence time</span><HealthStandardTimeInput ariaLabel="New occurrence time" onChange={onChangeTime} value={occurrenceTime} /></label><label className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>Note (optional)</span><input className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChangeNote(event.target.value)} value={occurrenceNote} /></label></div><div className="flex justify-end gap-2"><AdhdChip onClick={onCancel} type="button">Cancel</AdhdChip><AdhdChip onClick={onSave} tone="purple" type="button">Add occurrence</AdhdChip></div></div>;
}

function ReframeRows({ label, onChange, rows }: { label: string; onChange: (rows: Array<{ negative: string; positive: string }>) => void; rows: readonly { negative: string; positive: string }[] }) {
  const nextRows = [...Array.from({ length: Math.max(1, Math.min(5, rows.length + 1)) }, (_, index) => rows[index] ?? { negative: "", positive: "" })];
  return <QuestionSection title={label}><div className="grid gap-2">{nextRows.map((row, index) => <div className="grid gap-2 rounded-[0.9rem] border border-[#edf0fb] p-3 dark:border-white/10 sm:grid-cols-2" key={index}><label className="grid gap-2"><span className={QUESTION_HINT_CLASS}>Negative thought {index + 1}</span><input className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => { const next = [...nextRows]; next[index] = { ...next[index]!, negative: event.target.value }; onChange(next); }} value={row.negative} /></label><label className="grid gap-2"><span className={QUESTION_HINT_CLASS}>Positive / constructive reframing</span><input className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => { const next = [...nextRows]; next[index] = { ...next[index]!, positive: event.target.value }; onChange(next); }} value={row.positive} /></label></div>)}</div></QuestionSection>;
}

function WinRows({ onChange, rows }: { onChange: (rows: string[]) => void; rows: readonly string[] }) {
  const nextRows = [...Array.from({ length: Math.max(1, Math.min(5, rows.length + 1)) }, (_, index) => rows[index] ?? "")];
  return <QuestionSection title="Name up to 5 wins from today"><div className="grid gap-2">{nextRows.map((row, index) => <label className="grid gap-2" key={index}><span className={QUESTION_HINT_CLASS}>Win {index + 1}</span><input className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => { const next = [...nextRows]; next[index] = event.target.value; onChange(next); }} value={row} /></label>)}</div></QuestionSection>;
}

function CustomQuestionsSection({ answers, onChange, questions }: { answers: readonly HealthJournalCustomAnswer[]; onChange: (question: HealthJournalCustomQuestion, value: HealthJournalCustomAnswerValue) => void; questions: readonly (HealthJournalCustomQuestion | HealthJournalCustomAnswer)[] }) {
  if (questions.length === 0) return null;
  return <QuestionSection title="Custom check-in questions">{questions.map((question) => { const definition = getCustomQuestionDefinition(question); const answer = answers.find((candidate) => candidate.question_id === definition.id); return <CustomQuestionInput answer={answer} definition={definition} historical={!(("enabled" in question))} key={definition.id} onChange={(value) => onChange(definition, value)} />; })}</QuestionSection>;
}

function CustomQuestionInput({ answer, definition, historical, onChange }: { answer?: HealthJournalCustomAnswer; definition: HealthJournalCustomQuestion; historical: boolean; onChange: (value: HealthJournalCustomAnswerValue) => void }) {
  const value = answer?.value ?? null;
  const label = <span className={QUESTION_LABEL_CLASS}>{definition.question}{historical ? " · historical question" : ""}</span>;
  const selectOptions = definition.options.map((option) => <option key={option} value={option}>{option}</option>);
  if (definition.input_type === "long_text") return <label className="grid gap-2">{label}<textarea className={LONG_TEXT_CLASS} onChange={(event) => onChange(event.target.value)} value={typeof value === "string" ? value : ""} /></label>;
  if (definition.input_type === "single_choice") return <label className="grid gap-2">{label}<select className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChange(event.target.value || null)} value={typeof value === "string" ? value : ""}><option value="">Not answered</option>{selectOptions}</select></label>;
  if (definition.input_type === "multiple_choice") return <label className="grid gap-2">{label}<span className="grid gap-2 sm:grid-cols-2">{definition.options.map((option) => <span className="flex items-center gap-2 text-sm text-[#4f5a76] dark:text-white/70" key={option}><input checked={Array.isArray(value) && value.includes(option)} onChange={(event) => { const current = Array.isArray(value) ? value : []; onChange(event.target.checked ? [...current, option] : current.filter((candidate) => candidate !== option)); }} type="checkbox" />{option}</span>)}</span></label>;
  if (definition.input_type === "yes_no") return <label className="grid gap-2">{label}<span className="flex flex-wrap gap-2">{(["Yes", "No"] as const).map((option) => <AdhdChip key={option} onClick={() => onChange(value === option ? null : option)} selected={value === option} type="button">{option}</AdhdChip>)}</span></label>;
  if (definition.input_type === "scale_1_10") return <ScaleQuestion label={definition.question} note="" onChangeNote={() => undefined} onChangeScore={onChange} score={typeof value === "number" ? value : value === null ? null : Number(value)} />;
  return <label className="grid gap-2">{label}<input className={HEALTH_COMPACT_INPUT_CLASS} inputMode={definition.input_type === "number" ? "decimal" : "text"} onChange={(event) => onChange(definition.input_type === "number" ? event.target.value === "" ? null : Number(event.target.value) : event.target.value)} type={definition.input_type === "number" ? "number" : "text"} value={typeof value === "number" || typeof value === "string" ? value : ""} /></label>;
}

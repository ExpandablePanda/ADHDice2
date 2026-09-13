"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type {
  HealthCheckIn,
  HealthJournalCustomAnswer,
  HealthJournalCustomAnswerValue,
  HealthJournalCustomQuestion,
  HealthJournalEntryType,
  HealthJournalSignal,
  HealthJournalSignalInsert,
  HealthJournalSignalOccurrence,
  HealthJournalStructuredAnswers,
  HealthMealEntry,
  HealthMetricEntry,
  HealthSymptom,
  HealthSymptomEntry,
} from "@/lib/database.types";
import type { HealthJournalEntrySaveInput } from "@/hooks/useHealth";
import type { HealthJournalDraftValue } from "@/lib/health-journal";
import {
  buildHealthJournalCustomAnswer,
  buildHealthJournalSleepLink,
  findRelevantHealthSleepContext,
  formatHealthJournalSleepLink,
  getHealthJournalCustomQuestionsForEntry,
  getHealthJournalEntryType,
  getHealthJournalEntryTypeLabel,
  getHealthJournalScaleDenominator,
  HEALTH_JOURNAL_ENTRY_TYPES,
  normalizeHealthJournalCustomQuestions,
  normalizeHealthJournalReframes,
  normalizeHealthJournalStructuredAnswers,
  normalizeHealthJournalWins,
} from "@/lib/health-journal-checkins";
import {
  buildHealthMealLoggedAt,
  formatHealthTimestampTime,
  formatHealthNutritionNumber,
  formatHealthSleepDuration,
  getCurrentHealthDateTimeInputs,
  HEALTH_SCALE_OPTIONS,
} from "@/lib/health-utils";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";
import {
  getJournalEventSignalForDraft,
  hydrateJournalEventOccurrences,
  JournalEventCapture,
  type JournalEventOccurrenceDraft,
} from "./journal-event-capture";
import { HealthStandardTimeInput } from "./health-standard-time-input";

const LONG_TEXT_CLASS = "block min-h-24 w-full rounded-[1.2rem] border border-[#e6e8f5] bg-white px-4 py-3 text-sm text-[#22304b] outline-none transition focus:border-[#9e8cf9] dark:border-white/10 dark:bg-white/[0.04] dark:text-white";
const QUESTION_LABEL_CLASS = "text-sm font-semibold text-[#26324f] dark:text-white";
const QUESTION_HINT_CLASS = "text-xs text-[#7d88a3] dark:text-white/50";

type JournalCheckInFormProps = {
  checkIns: readonly HealthCheckIn[];
  customQuestions: readonly HealthJournalCustomQuestion[];
  focusCategories: Parameters<typeof findRelevantHealthSleepContext>[0]["focusCategories"];
  focusHistory: Parameters<typeof findRelevantHealthSleepContext>[0]["focusHistory"];
  journalSignalOccurrences: readonly HealthJournalSignalOccurrence[];
  journalSignalValues: readonly (HealthJournalDraftValue & { journal_entry_id: string })[];
  journalSignals: readonly HealthJournalSignal[];
  createJournalSignal: (input: Omit<HealthJournalSignalInsert, "user_id">) => Promise<HealthJournalSignal | null>;
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
  createJournalSignal,
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
  const [eventCaptureEnabled, setEventCaptureEnabled] = useState(false);
  const [eventDraft, setEventDraft] = useState<{
    date: string;
    description: string;
    id: string | null;
    notes: string;
    occurrences: JournalEventOccurrenceDraft[];
    time: string;
  }>({ date: initialInputs.date, description: "", id: null, notes: "", occurrences: [], time: initialInputs.time });
  const [searchBreakfast, setSearchBreakfast] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const hydratedSelectedEntryKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const nextSelectedEntryId = selectedJournalEntry?.id ?? null;
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
      || nextAnswers.linked_event_ids?.length
      || nextAnswers.custom_answers?.some((answer) => answer.value !== null && answer.value !== "" && (!Array.isArray(answer.value) || answer.value.length > 0))
      || nextAnswers.wins?.some(Boolean)
      || nextAnswers.morning_reframes?.some((row) => row.negative || row.positive)
      || nextAnswers.evening_reframes?.some((row) => row.negative || row.positive)
    );
    if (selectedJournalEntry && !hasStructuredJournalContent && selectedJournalEntry.reflection.trim()) {
      nextAnswers.event_record = selectedJournalEntry.reflection;
    }
    const nextEntryType = getHealthJournalEntryType(selectedJournalEntry);
    const linkedEventId = nextAnswers.linked_event_ids?.[0] ?? null;
    const linkedEvent = linkedEventId ? checkIns.find((entry) => entry.id === linkedEventId) ?? null : null;
    const eventEntry = nextEntryType === "event" ? selectedJournalEntry : linkedEvent;
    const eventOccurrenceKey = eventEntry
      ? [...symptomEntries.filter((occurrence) => occurrence.journal_entry_id === eventEntry.id).map((occurrence) => occurrence.id), ...journalSignalOccurrences.filter((occurrence) => occurrence.journal_entry_id === eventEntry.id).map((occurrence) => occurrence.id)].sort().join(",")
      : "";
    const hydrationKey = `${nextSelectedEntryId}:${linkedEventId ?? ""}:${eventEntry?.id ?? ""}:${eventOccurrenceKey}`;
    if (hydratedSelectedEntryKeyRef.current === hydrationKey) return;
    hydratedSelectedEntryKeyRef.current = hydrationKey;
    const eventAnswers = normalizeHealthJournalStructuredAnswers(eventEntry?.structured_answers);
    const hasEventAnswers = Boolean(eventAnswers.event_description?.trim() || eventAnswers.event_record?.trim());
    // This effect rehydrates the local editor when the selected history entry changes.
    setEntryType(nextEntryType);
    setEntryDate(nextInputs.date);
    setEntryTime(nextInputs.time);
    setAnswers(nextAnswers);
    setEventCaptureEnabled(nextEntryType !== "event" && Boolean(linkedEventId));
    setEventDraft({
      date: eventEntry?.entry_date ?? nextInputs.date,
      description: eventAnswers.event_description ?? (!hasEventAnswers && eventEntry?.reflection ? eventEntry.reflection : ""),
      id: eventEntry?.id ?? linkedEventId,
      notes: eventAnswers.event_record ?? "",
      occurrences: hydrateJournalEventOccurrences(eventEntry, symptomEntries, journalSignalOccurrences, journalSignals),
      time: eventEntry?.entry_time ?? nextInputs.time,
    });
    setFormError(null);
  }, [checkIns, journalSignalOccurrences, journalSignals, selectedJournalEntry, symptomEntries, symptoms]);

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
    setEventCaptureEnabled(false);
    setEventDraft({ date: current.date, description: "", id: null, notes: "", occurrences: [], time: current.time });
    setSearchBreakfast("");
    setFormError(null);
  }

  async function handleSave() {
    if (isSaving) return;
    const existingEvent = entryType === "event"
      ? selectedJournalEntry
      : eventDraft.id ? checkIns.find((entry) => entry.id === eventDraft.id) ?? null : null;

    function buildOccurrenceInputs(drafts: readonly JournalEventOccurrenceDraft[], date: string) {
      const symptomOccurrenceInputs = [] as HealthJournalEntrySaveInput["symptomOccurrences"];
      const feelingOccurrenceInputs = [] as HealthJournalEntrySaveInput["journalSignalOccurrences"];
      for (const draft of drafts) {
        const signal = getJournalEventSignalForDraft(draft.signalId, journalSignals, symptoms);
        const occurredAt = buildHealthMealLoggedAt(date, draft.time);
        const denominator = signal ? getHealthJournalScaleDenominator(signal) : 10;
        if (!signal || !occurredAt || !Number.isInteger(draft.score) || draft.score < 1 || draft.score > denominator) {
          setFormError(`Each Feeling occurrence needs a score from 1 to ${denominator} and a valid local time.`);
          return null;
        }
        if (signal.kind === "symptom" && signal.symptom_id) {
          symptomOccurrenceInputs.push({ ...(draft.id ? { id: draft.id } : {}), entry_date: date, logged_at: occurredAt, note: draft.note, severity: draft.score, symptom_id: signal.symptom_id });
        } else if (signal.kind === "emotion" || signal.kind === "other") {
          feelingOccurrenceInputs.push({ ...(draft.id ? { id: draft.id } : {}), entry_date: date, note: draft.note, occurred_at: occurredAt, score: draft.score, signal_id: signal.id });
        }
      }
      return { journalSignalOccurrences: feelingOccurrenceInputs, symptomOccurrences: symptomOccurrenceInputs };
    }

    const legacySymptomOccurrences = selectedJournalEntry
      ? symptomEntries.filter((occurrence) => occurrence.journal_entry_id === selectedJournalEntry.id).map((occurrence) => ({ entry_date: occurrence.entry_date, id: occurrence.id, logged_at: occurrence.logged_at, note: occurrence.note, severity: occurrence.severity, symptom_id: occurrence.symptom_id }))
      : [];
    const legacyFeelingOccurrences = selectedJournalEntry
      ? journalSignalOccurrences.filter((occurrence) => occurrence.journal_entry_id === selectedJournalEntry.id).map((occurrence) => ({ entry_date: occurrence.entry_date, id: occurrence.id, note: occurrence.note, occurred_at: occurrence.occurred_at, score: occurrence.score, signal_id: occurrence.signal_id }))
      : [];
    const nextAnswers: HealthJournalStructuredAnswers = {
      ...answers,
      anything_else: typeof answers.anything_else === "string" ? answers.anything_else : "",
      custom_answers: answers.custom_answers ?? [],
      linked_event_ids: entryType === "event" ? answers.linked_event_ids : eventCaptureEnabled && eventDraft.id ? [eventDraft.id] : [],
      schema_version: 1,
    };

    let nextEventId = eventDraft.id;
    let eventWasSaved = false;
    if (entryType === "event" || eventCaptureEnabled) {
      nextEventId = nextEventId ?? createDraftId("journal-event");
      const eventOccurrenceInputs = buildOccurrenceInputs(eventDraft.occurrences, eventDraft.date);
      if (!eventOccurrenceInputs) return;
      const eventAnswers = normalizeHealthJournalStructuredAnswers(existingEvent?.structured_answers);
      const nextEventAnswers: HealthJournalStructuredAnswers = {
        ...eventAnswers,
        custom_answers: eventAnswers.custom_answers ?? [],
        event_description: eventDraft.description,
        event_record: eventDraft.notes,
        event_time: `${eventDraft.date}T${eventDraft.time}`,
        schema_version: 1,
      };
      setEventDraft((current) => ({ ...current, id: nextEventId }));
      setIsSaving(true);
      setFormError(null);
      const eventSaved = await saveJournalEntry({
        allowInsertWithId: true,
        checkIn: {
          id: nextEventId,
          clarity_score: existingEvent?.clarity_score ?? null,
          energy_score: existingEvent?.energy_score ?? null,
          entry_date: eventDraft.date,
          entry_time: eventDraft.time,
          entry_type: "event",
          mood_score: existingEvent?.mood_score ?? null,
          reflection: eventDraft.notes.trim(),
          stress_score: existingEvent?.stress_score ?? null,
          structured_answers: nextEventAnswers,
        },
        journalSignalOccurrences: eventOccurrenceInputs.journalSignalOccurrences,
        signalValues: existingEvent
          ? journalSignalValues.filter((value) => value.journal_entry_id === existingEvent.id).map(({ id, signal_id, score }) => ({ id, signal_id, score }))
          : [],
        symptomOccurrences: eventOccurrenceInputs.symptomOccurrences,
      });
      if (!eventSaved) {
        setIsSaving(false);
        setFormError("The Event could not be saved. Check the warning above and retry; your Event draft is still here.");
        return;
      }
      nextEventId = eventSaved.id;
      eventWasSaved = true;
      if (entryType === "event") {
        setIsSaving(false);
        resetFormForNewEntry();
        onAfterSave();
        return;
      }
      nextAnswers.linked_event_ids = [nextEventId];
    }

    const nextReflection = nextAnswers.anything_else ?? selectedJournalEntry?.reflection ?? "";
    setAnswers(nextAnswers);
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
      journalSignalOccurrences: legacyFeelingOccurrences,
      signalValues: selectedJournalEntry
        ? journalSignalValues.filter((value) => value.journal_entry_id === selectedJournalEntry.id).map(({ id, signal_id, score }) => ({ id, signal_id, score }))
        : [],
      symptomOccurrences: legacySymptomOccurrences,
    });
    setIsSaving(false);
    if (saved) {
      resetFormForNewEntry();
      onAfterSave();
    } else if (eventWasSaved) {
      setFormError("The Event was saved, but the check-in could not be saved. The Event was kept; retry to link it without creating another Event.");
    }
  }

  const topDateLabel = entryType === "event" ? "Event date" : "Check-in date";
  const topTimeLabel = entryType === "event" ? "When did it happen?" : "Check-in time";
  const eventCapture = <JournalEventCapture
    date={entryType === "event" ? entryDate : eventDraft.date}
    description={eventDraft.description}
    eventDateTime={entryType !== "event"}
    occurrences={eventDraft.occurrences}
    onChangeDate={entryType !== "event" ? (date) => setEventDraft((current) => ({ ...current, date })) : undefined}
    onChangeDescription={(description) => setEventDraft((current) => ({ ...current, description }))}
    onChangeTime={entryType !== "event" ? (time) => setEventDraft((current) => ({ ...current, time })) : undefined}
    onCreateSignal={createJournalSignal}
    onRemoveOccurrence={(draftKey) => setEventDraft((current) => ({ ...current, occurrences: current.occurrences.filter((occurrence) => occurrence.draftKey !== draftKey) }))}
    onSaveOccurrence={(occurrence) => setEventDraft((current) => ({ ...current, occurrences: [...current.occurrences, occurrence] }))}
    onUpdateOccurrence={(occurrence) => setEventDraft((current) => ({ ...current, occurrences: current.occurrences.map((candidate) => candidate.draftKey === occurrence.draftKey ? occurrence : candidate) }))}
    signals={journalSignals}
    symptoms={symptoms}
    time={entryType === "event" ? entryTime : eventDraft.time}
  />;
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid min-w-0 gap-3 sm:grid-cols-[auto_auto_auto] sm:items-end">
          <label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a3] dark:text-white/40">Entry type</span><select aria-label="Journal entry type" className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => { const nextType = event.target.value as HealthJournalEntryType; setEntryType(nextType); setEventDraft((current) => ({ ...current, date: entryDate, time: entryTime })); }} value={entryType}>{HEALTH_JOURNAL_ENTRY_TYPES.map((type) => <option key={type} value={type}>{getHealthJournalEntryTypeLabel(type)}</option>)}</select></label>
          <label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a3] dark:text-white/40">{topDateLabel}</span><input aria-label={topDateLabel} className={HEALTH_COMPACT_INPUT_CLASS} max={getCurrentHealthDateTimeInputs().date} onChange={(event) => { setEntryDate(event.target.value); if (entryType === "event") setEventDraft((current) => ({ ...current, date: event.target.value })); }} type="date" value={entryDate} /></label>
          <div className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a3] dark:text-white/40">{topTimeLabel}</span><HealthStandardTimeInput ariaLabel={topTimeLabel} compact onChange={(time) => { setEntryTime(time); if (entryType === "event") setEventDraft((current) => ({ ...current, time })); }} value={entryTime} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><span className={QUESTION_HINT_CLASS}>{selectedJournalEntry ? "Existing entry" : "New entry · not saved yet"}</span><AdhdChip onClick={resetFormForNewEntry} type="button">+ New entry</AdhdChip></div>
      </div>

      {entryType === "start_of_day" ? <StartOfDayQuestions answers={answers} breakfastEntries={filteredBreakfastEntries} breakfastSearch={searchBreakfast} eventCapture={eventCapture} eventCaptureEnabled={eventCaptureEnabled} linkedBreakfastIds={selectedBreakfastIds} linkedSleep={linkedSleep} onOpenFood={onOpenFood} onOpenSleep={onOpenSleep} onSearchBreakfast={setSearchBreakfast} onToggleBreakfast={toggleBreakfast} onToggleEventCapture={(enabled) => { setEventCaptureEnabled(enabled); if (enabled) setEventDraft((current) => ({ ...current, date: current.id ? current.date : entryDate, time: current.id ? current.time : entryTime })); }} onUpdateAnswer={updateAnswer} sleepContext={sleepContext} /> : null}
      {entryType === "end_of_day" ? <EndOfDayQuestions answers={answers} eventCapture={eventCapture} eventCaptureEnabled={eventCaptureEnabled} onToggleEventCapture={(enabled) => { setEventCaptureEnabled(enabled); if (enabled) setEventDraft((current) => ({ ...current, date: current.id ? current.date : entryDate, time: current.id ? current.time : entryTime })); }} onUpdateAnswer={updateAnswer} /> : null}
      {entryType === "event" ? <EventQuestions eventCapture={eventCapture} /> : null}

      {entryType !== "event" ? <CustomQuestionsSection questions={questionsToRender} answers={savedCustomAnswers} onChange={updateCustomAnswer} /> : null}
      {entryType !== "event" ? <TextQuestion label="Anything else?" long value={answers.anything_else ?? ""} onChange={(value) => updateAnswer("anything_else", value)} /> : null}
      {formError ? <p aria-live="polite" className="text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]" role="alert">{formError}</p> : null}
      <div className="flex justify-end"><button className="ui-pill-button-strong-light disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} onClick={() => { void handleSave(); }} type="button">{isSaving ? "Saving..." : selectedJournalEntry ? "Update Journal Entry" : "Save Journal Entry"}</button></div>
      {checkIns.length === 0 ? null : <p className="text-right text-xs text-[#7d88a3] dark:text-white/45">Saved Journal history remains available beside this form.</p>}
    </div>
  );
}

function QuestionSection({ children, title }: { children: ReactNode; title: string }) {
  return <section className="grid gap-3 rounded-[1.1rem] border border-[#edf0fb] bg-white/45 p-4 dark:border-white/10 dark:bg-white/[0.02]"><h3 className="text-sm font-semibold text-[#26324f] dark:text-white">{title}</h3>{children}</section>;
}

function TextQuestion({ label, long = false, onChange, value }: { label: string; long?: boolean; onChange: (value: string) => void; value: string }) {
  return <label className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>{label}</span>{long ? <textarea className={LONG_TEXT_CLASS} onChange={(event) => onChange(event.target.value)} value={value} /> : <input className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChange(event.target.value)} value={value} />}</label>;
}

function ScaleQuestion({ label, note, onChangeNote, onChangeScore, score, scaleLabel = "1–10" }: { label: string; note: string; onChangeNote: (value: string) => void; onChangeScore: (value: number | null) => void; score: number | null; scaleLabel?: string }) {
  return <div className="grid gap-2"><div className="flex flex-wrap items-baseline justify-between gap-2"><span className={QUESTION_LABEL_CLASS}>{label}</span><span className={QUESTION_HINT_CLASS}>{scaleLabel}</span></div><div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">{HEALTH_SCALE_OPTIONS.map((value) => <button aria-label={`${label} ${value} out of 10`} aria-pressed={score === value} className={`min-h-9 rounded-[0.7rem] text-sm font-semibold ${score === value ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]" : "bg-[#f4f1ff] text-[#615b9c] dark:bg-white/8 dark:text-white/65"}`} key={value} onClick={() => onChangeScore(score === value ? null : value)} type="button">{value}</button>)}</div><input aria-label={`${label} note`} className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChangeNote(event.target.value)} placeholder="Optional note" value={note} /></div>;
}

function EventCaptureChoice({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return <QuestionSection title="Any feelings or events to log?"><div aria-label="Any feelings or events to log?" className="flex flex-wrap gap-2" role="radiogroup"><AdhdChip aria-checked={enabled} onClick={() => onChange(true)} role="radio" selected={enabled} type="button">Yes</AdhdChip><AdhdChip aria-checked={!enabled} onClick={() => onChange(false)} role="radio" selected={!enabled} type="button">No</AdhdChip></div></QuestionSection>;
}

function StartOfDayQuestions({ answers, breakfastEntries, breakfastSearch, eventCapture, eventCaptureEnabled, linkedBreakfastIds, linkedSleep, onOpenFood, onOpenSleep, onSearchBreakfast, onToggleBreakfast, onToggleEventCapture, onUpdateAnswer, sleepContext }: { answers: HealthJournalStructuredAnswers; breakfastEntries: readonly HealthMealEntry[]; breakfastSearch: string; eventCapture: ReactNode; eventCaptureEnabled: boolean; linkedBreakfastIds: readonly string[]; linkedSleep: HealthJournalStructuredAnswers["sleep_link"]; onOpenFood: () => void; onOpenSleep: () => void; onSearchBreakfast: (value: string) => void; onToggleBreakfast: (entry: HealthMealEntry) => void; onToggleEventCapture: (enabled: boolean) => void; onUpdateAnswer: <Key extends keyof HealthJournalStructuredAnswers>(key: Key, value: HealthJournalStructuredAnswers[Key]) => void; sleepContext: ReturnType<typeof findRelevantHealthSleepContext> }) {
  const reframes = normalizeHealthJournalReframes(answers.morning_reframes);
  return <div className="grid gap-4"><QuestionSection title="How did you sleep?"><div className="rounded-[0.9rem] border border-[#edf0fb] bg-white/70 px-3 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]"><p className="font-semibold text-[#26324f] dark:text-white">{linkedSleep ? formatHealthJournalSleepLink(linkedSleep) : sleepContext ? formatHealthJournalSleepLink(sleepContext) + " found" : "No sleep data was found for the previous night or most relevant overnight period."}</p>{sleepContext ? <div className="mt-2 grid gap-1 text-xs text-[#7d88a3] dark:text-white/50">{sleepContext.records.map((record) => <span key={record.source + ":" + record.id}>{record.source === "focus" ? "Sleep Focus" : "Apple Health"} · {formatHealthSleepDuration(record.minutes)}{record.started_at ? " · " + formatHealthTimestampTime(record.started_at) : ""}</span>)}</div> : null}</div><div className="flex flex-wrap gap-2">{sleepContext && !linkedSleep ? <AdhdChip onClick={() => onUpdateAnswer("sleep_link", buildHealthJournalSleepLink(sleepContext))} tone="purple" type="button">Attach sleep data</AdhdChip> : null}<AdhdChip onClick={onOpenSleep} type="button">Open Sleep</AdhdChip></div><ScaleQuestion label="Subjective sleep quality" note={answers.sleep_quality_note ?? ""} onChangeNote={(value) => onUpdateAnswer("sleep_quality_note", value)} onChangeScore={(value) => onUpdateAnswer("sleep_quality_score", value)} score={answers.sleep_quality_score ?? null} /></QuestionSection><QuestionSection title="Did you have breakfast, or are you going to have it?"><div className="flex flex-wrap gap-2">{(["already_ate", "planning_to_eat", "skipping", "not_sure_yet"] as const).map((state) => <AdhdChip key={state} onClick={() => { onUpdateAnswer("breakfast_state", state); if (state !== "already_ate") { onUpdateAnswer("breakfast_meal_ids", []); onUpdateAnswer("breakfast_meals", []); } }} selected={answers.breakfast_state === state} type="button">{state === "already_ate" ? "Already ate" : state === "planning_to_eat" ? "Planning to eat" : state === "skipping" ? "Skipping / not having breakfast" : "Not sure yet"}</AdhdChip>)}</div>{answers.breakfast_state === "already_ate" ? <div className="grid gap-2"><div className="flex flex-wrap items-center gap-2"><input aria-label="Find breakfast food" className={HEALTH_COMPACT_INPUT_CLASS + " min-w-[12rem] flex-1"} onChange={(event) => onSearchBreakfast(event.target.value)} placeholder="Find logged breakfast" value={breakfastSearch} /><AdhdChip onClick={onOpenFood} type="button">Open Food</AdhdChip></div>{breakfastEntries.length === 0 ? <p className={QUESTION_HINT_CLASS}>No consumed breakfast Food records were found for this date.</p> : breakfastEntries.map((entry) => <label className="flex flex-wrap items-center gap-2 rounded-[0.8rem] border border-[#edf0fb] px-3 py-2 text-sm dark:border-white/10" key={entry.id}><input checked={linkedBreakfastIds.includes(entry.id)} onChange={() => onToggleBreakfast(entry)} type="checkbox" /><span className="min-w-0 flex-1 font-semibold text-[#26324f] dark:text-white">{entry.brand_name ? entry.brand_name + " · " : ""}{entry.food_name}</span><span className="text-xs text-[#7d88a3] dark:text-white/50">{formatHealthNutritionNumber(entry.calories)} kcal</span></label>)}</div> : null}{answers.breakfast_state === "planning_to_eat" ? <TextQuestion label="Planned breakfast (optional)" value={answers.planned_breakfast ?? ""} onChange={(value) => onUpdateAnswer("planned_breakfast", value)} /> : null}<p className={QUESTION_HINT_CLASS}>{answers.breakfast_state === "planning_to_eat" ? "Planning is saved as a Journal answer and will not create consumed Food or calories." : "Linked breakfast records remain owned by Food."}</p></QuestionSection><EventCaptureChoice enabled={eventCaptureEnabled} onChange={onToggleEventCapture} />{eventCaptureEnabled ? eventCapture : null}<ScaleQuestion label="How is your energy right now?" note={answers.energy_note ?? ""} onChangeNote={(value) => onUpdateAnswer("energy_note", value)} onChangeScore={(value) => onUpdateAnswer("energy_now", value)} score={answers.energy_now ?? null} /><ScaleQuestion label="How is your focus right now?" note={answers.focus_note ?? ""} onChangeNote={(value) => onUpdateAnswer("focus_note", value)} onChangeScore={(value) => onUpdateAnswer("focus_now", value)} score={answers.focus_now ?? null} /><TextQuestion label="What is on your mind this morning?" long value={answers.morning_thoughts ?? ""} onChange={(value) => onUpdateAnswer("morning_thoughts", value)} /><ReframeRows label="List up to 5 negative thoughts on your mind and turn them positive" rows={reframes} onChange={(rows) => onUpdateAnswer("morning_reframes", rows)} /><TextQuestion label="What matters most today?" long value={answers.matters_most ?? ""} onChange={(value) => onUpdateAnswer("matters_most", value)} /><TextQuestion label="Is there anything that could make today harder?" long value={answers.harder_today ?? ""} onChange={(value) => onUpdateAnswer("harder_today", value)} /><TextQuestion label="What would make today feel successful?" long value={answers.successful_today ?? ""} onChange={(value) => onUpdateAnswer("successful_today", value)} /></div>;
}

function EndOfDayQuestions({ answers, eventCapture, eventCaptureEnabled, onToggleEventCapture, onUpdateAnswer }: { answers: HealthJournalStructuredAnswers; eventCapture: ReactNode; eventCaptureEnabled: boolean; onToggleEventCapture: (enabled: boolean) => void; onUpdateAnswer: <Key extends keyof HealthJournalStructuredAnswers>(key: Key, value: HealthJournalStructuredAnswers[Key]) => void }) {
  return <div className="grid gap-4"><EventCaptureChoice enabled={eventCaptureEnabled} onChange={onToggleEventCapture} />{eventCaptureEnabled ? eventCapture : null}<ScaleQuestion label="How was your energy today overall?" note={answers.energy_note ?? ""} onChangeNote={(value) => onUpdateAnswer("energy_note", value)} onChangeScore={(value) => onUpdateAnswer("energy_overall", value)} score={answers.energy_overall ?? null} /><ScaleQuestion label="How was your focus today overall?" note={answers.focus_note ?? ""} onChangeNote={(value) => onUpdateAnswer("focus_note", value)} onChangeScore={(value) => onUpdateAnswer("focus_overall", value)} score={answers.focus_overall ?? null} /><TextQuestion label="How did today go?" long value={answers.evening_reflection ?? ""} onChange={(value) => onUpdateAnswer("evening_reflection", value)} /><TextQuestion label="What went well today?" long value={answers.went_well ?? ""} onChange={(value) => onUpdateAnswer("went_well", value)} /><WinRows rows={normalizeHealthJournalWins(answers.wins)} onChange={(rows) => onUpdateAnswer("wins", rows)} /><TextQuestion label="What was difficult today?" long value={answers.difficult_today ?? ""} onChange={(value) => onUpdateAnswer("difficult_today", value)} /><ReframeRows label="List up to 5 negative thoughts from today and turn them into positives" rows={normalizeHealthJournalReframes(answers.evening_reframes)} onChange={(rows) => onUpdateAnswer("evening_reframes", rows)} /><TextQuestion label="Is anything still on your mind?" long value={answers.still_on_mind ?? ""} onChange={(value) => onUpdateAnswer("still_on_mind", value)} /><TextQuestion label="What do you want to remember for tomorrow?" long value={answers.remember_tomorrow ?? ""} onChange={(value) => onUpdateAnswer("remember_tomorrow", value)} /></div>;
}

function EventQuestions({ eventCapture }: { eventCapture: ReactNode }) {
  return <div className="grid gap-4">{eventCapture}</div>;
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

"use client";

import { Pencil, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import type { HealthJournalSignal, HealthJournalSignalInsert, HealthSymptom } from "@/lib/database.types";
import {
  getDefaultHealthJournalScaleLabels,
  getHealthJournalSignalDisplayName,
  replaceHealthJournalReflectionTag,
} from "@/lib/health-journal";
import { formatHealthJournalOccurrenceReference, getHealthJournalScaleDenominator } from "@/lib/health-journal-checkins";
import { buildHealthMealLoggedAt, getCurrentHealthDateTimeInputs, normalizeHealthMealTime } from "@/lib/health-utils";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdDropdownPanel } from "@/components/ui-system/adhd-dropdown-panel";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import { HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";
import { HealthStandardTimeInput } from "./health-standard-time-input";

const LONG_TEXT_CLASS = "block min-h-24 w-full rounded-[1.2rem] border border-[#e6e8f5] bg-white px-4 py-3 text-sm text-[#22304b] outline-none transition focus:border-[#9e8cf9] dark:border-white/10 dark:bg-white/[0.04] dark:text-white";
const QUESTION_LABEL_CLASS = "text-sm font-semibold text-[#26324f] dark:text-white";
const QUESTION_HINT_CLASS = "text-xs text-[#7d88a3] dark:text-white/50";

export type JournalEventOccurrenceDraft = {
  draftKey: string;
  id?: string;
  note: string;
  occurredAt: string;
  score: number;
  signalId: string;
  time: string;
};

type JournalTagOption = {
  kind: HealthJournalSignal["kind"];
  name: string;
  signal: HealthJournalSignal;
  symptomId?: string;
};

type JournalTagQuery = {
  end: number;
  query: string;
  start: number;
};

type JournalTagOverlay = {
  draftKey: string | null;
  error: string | null;
  score: number | null;
  signal: HealthJournalSignal;
  time: string;
} | null;

export function buildJournalEventSymptomSignal(symptom: HealthSymptom): HealthJournalSignal {
  return {
    archived_at: symptom.archived_at,
    color: null,
    created_at: symptom.created_at,
    high_label: getDefaultHealthJournalScaleLabels("symptom")[10] ?? "Extreme",
    id: `canonical-symptom:${symptom.id}`,
    in_template: false,
    kind: "symptom",
    low_label: getDefaultHealthJournalScaleLabels("symptom")[0] ?? "None",
    name: null,
    scale_labels: getDefaultHealthJournalScaleLabels("symptom"),
    symptom_id: symptom.id,
    template_sort_order: null,
    updated_at: symptom.updated_at,
    user_id: symptom.user_id,
  };
}

function createDraftId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function timeInputFromTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime())
    ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
    : "";
}

function readJournalTagQuery(value: string, cursor: number): JournalTagQuery | null {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)#([^\s#]*)$/);
  if (!match) return null;
  const queryStart = cursor - match[0].length + (match[1] ? 1 : 0);
  return { end: cursor, query: match[2] ?? "", start: queryStart };
}

function QuestionSection({ children, title }: { children: ReactNode; title: string }) {
  return <section className="grid gap-3 rounded-[1.1rem] border border-[#edf0fb] bg-white/45 p-4 dark:border-white/10 dark:bg-white/[0.02]"><h3 className="text-sm font-semibold text-[#26324f] dark:text-white">{title}</h3>{children}</section>;
}

export function JournalEventCapture({
  date,
  description,
  eventDateTime = false,
  occurrences,
  onChangeDate,
  onChangeDescription,
  onChangeTime,
  onCreateSignal,
  onRemoveOccurrence,
  onSaveOccurrence,
  onUpdateOccurrence,
  signals,
  symptoms,
  time,
}: {
  date: string;
  description: string;
  eventDateTime?: boolean;
  occurrences: readonly JournalEventOccurrenceDraft[];
  onChangeDate?: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeTime?: (value: string) => void;
  onCreateSignal?: (input: Omit<HealthJournalSignalInsert, "user_id">) => Promise<HealthJournalSignal | null>;
  onRemoveOccurrence: (draftKey: string) => void;
  onSaveOccurrence: (draft: JournalEventOccurrenceDraft) => void;
  onUpdateOccurrence: (draft: JournalEventOccurrenceDraft) => void;
  signals: readonly HealthJournalSignal[];
  symptoms: readonly HealthSymptom[];
  time: string;
}) {
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const tagCaretRef = useRef<number | null>(null);
  const [tagQuery, setTagQuery] = useState<JournalTagQuery | null>(null);
  const [tagHighlightIndex, setTagHighlightIndex] = useState(0);
  const [tagOverlay, setTagOverlay] = useState<JournalTagOverlay>(null);

  const occurrenceSignalById = useMemo(() => new Map(signals.map((signal) => [signal.id, signal] as const)), [signals]);
  const tagOptions = useMemo<JournalTagOption[]>(() => [
    ...symptoms
      .filter((symptom) => symptom.archived_at === null)
      .map((symptom) => ({
        kind: "symptom" as const,
        name: symptom.name,
        signal: occurrenceSignalById.get(`canonical-symptom:${symptom.id}`)
          ?? signals.find((signal) => signal.kind === "symptom" && signal.symptom_id === symptom.id)
          ?? buildJournalEventSymptomSignal(symptom),
        symptomId: symptom.id,
      })),
    ...signals
      .filter((signal) => (signal.kind === "emotion" || signal.kind === "other") && signal.archived_at === null)
      .map((signal) => ({
        kind: signal.kind,
        name: getHealthJournalSignalDisplayName(signal, symptoms),
        signal,
      })),
  ], [occurrenceSignalById, signals, symptoms]);
  const visibleTagOptions = useMemo(() => {
    const query = tagQuery?.query.trim().toLowerCase() ?? "";
    return tagOptions
      .filter((option) => !query || option.name.toLowerCase().includes(query))
      .sort((left, right) => {
        if (!query) return 0;
        return Number(!left.name.toLowerCase().startsWith(query)) - Number(!right.name.toLowerCase().startsWith(query))
          || left.name.localeCompare(right.name);
      });
  }, [tagOptions, tagQuery?.query]);
  const visibleTagGroups = useMemo(
    () => (["symptom", "emotion", "other"] as const)
      .map((kind) => ({ kind, options: visibleTagOptions.filter((option) => option.kind === kind) }))
      .filter((group) => group.options.length > 0),
    [visibleTagOptions],
  );
  const overlaySignal = tagOverlay ? getJournalEventSignalForDraft(tagOverlay.signal.id, signals, symptoms) ?? tagOverlay.signal : null;

  function syncTagQuery(target: HTMLTextAreaElement, resetHighlight = true) {
    const nextQuery = readJournalTagQuery(target.value, target.selectionStart ?? target.value.length);
    setTagQuery(nextQuery);
    if (resetHighlight) setTagHighlightIndex(0);
  }

  async function selectTag(option: JournalTagOption) {
    if (!tagQuery) return;
    const signal = option.kind === "symptom" && option.symptomId && option.signal.id.startsWith("canonical-symptom:") && onCreateSignal
      ? await onCreateSignal({
        high_label: getDefaultHealthJournalScaleLabels("symptom")[10],
        in_template: false,
        kind: "symptom",
        low_label: getDefaultHealthJournalScaleLabels("symptom")[0],
        name: null,
        scale_labels: getDefaultHealthJournalScaleLabels("symptom"),
        symptom_id: option.symptomId,
      })
      : option.signal;
    if (!signal) return;
    const replacement = `#${option.name} `;
    const nextCaret = tagQuery.start + replacement.length;
    onChangeDescription(replaceHealthJournalReflectionTag(description, tagQuery.start, tagQuery.end, replacement));
    tagCaretRef.current = nextCaret;
    setTagQuery(null);
    setTagHighlightIndex(0);
    setTagOverlay({ draftKey: null, error: null, score: null, signal, time: time || getCurrentHealthDateTimeInputs().time });
  }

  function beginOccurrenceEdit(draft: JournalEventOccurrenceDraft) {
    const signal = getJournalEventSignalForDraft(draft.signalId, signals, symptoms);
    if (!signal) return;
    setTagOverlay({ draftKey: draft.draftKey, error: null, score: draft.score, signal, time: draft.time });
  }

  function saveTagOccurrence() {
    if (!tagOverlay) return;
    const normalizedTime = normalizeHealthMealTime(tagOverlay.time);
    const occurredAt = normalizedTime ? buildHealthMealLoggedAt(date, normalizedTime) : null;
    const denominator = getHealthJournalScaleDenominator(overlaySignal);
    if (!overlaySignal || tagOverlay.score === null || !Number.isInteger(tagOverlay.score) || tagOverlay.score < 1 || tagOverlay.score > denominator || !normalizedTime || !occurredAt) {
      setTagOverlay((current) => current ? { ...current, error: `Choose a score from 1 to ${denominator} and a valid occurrence time.` } : current);
      return;
    }
    const existing = tagOverlay.draftKey ? occurrences.find((draft) => draft.draftKey === tagOverlay.draftKey) : undefined;
    const nextDraft: JournalEventOccurrenceDraft = {
      draftKey: tagOverlay.draftKey ?? createDraftId("journal-event-occurrence"),
      ...(existing?.id ? { id: existing.id } : {}),
      note: existing?.note ?? "",
      occurredAt,
      score: tagOverlay.score,
      signalId: overlaySignal.id,
      time: normalizedTime,
    };
    if (existing) onUpdateOccurrence(nextDraft);
    else onSaveOccurrence(nextDraft);
    setTagOverlay(null);
    requestAnimationFrame(() => {
      const textarea = descriptionRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      if (tagCaretRef.current !== null) textarea.setSelectionRange(tagCaretRef.current, tagCaretRef.current);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!tagQuery || visibleTagOptions.length === 0) {
      if (event.key === "Escape") setTagQuery(null);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setTagHighlightIndex((current) => (current + 1) % visibleTagOptions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setTagHighlightIndex((current) => (current - 1 + visibleTagOptions.length) % visibleTagOptions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void selectTag(visibleTagOptions[tagHighlightIndex] ?? visibleTagOptions[0]!);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setTagQuery(null);
    }
  }

  return <div className="grid gap-4">
    <QuestionSection title="What happened?">
      <label className="grid gap-2">
        <span className={QUESTION_HINT_CLASS}>Primary event description</span>
        <div className="relative min-w-0">
          <textarea
            aria-activedescendant={tagQuery && visibleTagOptions.length > 0 ? `journal-event-tag-option-${tagHighlightIndex}` : undefined}
            aria-controls={tagQuery ? "journal-event-tag-picker" : tagOverlay ? "journal-event-tag-overlay" : undefined}
            aria-label="What happened?"
            autoFocus={!description}
            className={`${LONG_TEXT_CLASS} min-h-36`}
            onChange={(event) => { onChangeDescription(event.target.value); syncTagQuery(event.currentTarget); }}
            onClick={(event) => syncTagQuery(event.currentTarget)}
            onKeyDown={handleKeyDown}
            onKeyUp={(event) => {
              if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) syncTagQuery(event.currentTarget, false);
            }}
            placeholder="Describe what happened... Type # to tag a Feeling."
            ref={descriptionRef}
            value={description}
          />
          {tagQuery ? <div aria-label="Event Feeling picker" className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-[1rem] border border-[#e4deef] bg-white p-2 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-[#211c34]" id="journal-event-tag-picker" role="listbox">
            {visibleTagGroups.map(({ kind, options }, groupIndex) => <div className={`grid gap-1 ${groupIndex > 0 ? "mt-3" : ""}`} key={kind}>
              <p className={`${QUESTION_HINT_CLASS} px-2 uppercase tracking-[0.16em]`}>{kind === "symptom" ? "Symptoms" : kind === "emotion" ? "Emotions" : "Other Feelings"}</p>
              {options.map((option) => { const optionIndex = visibleTagOptions.indexOf(option); return <button aria-selected={tagHighlightIndex === optionIndex} className={`flex min-h-9 w-full items-center rounded-[0.7rem] px-3 text-left text-sm font-semibold ${tagHighlightIndex === optionIndex ? "bg-[#efe9ff] text-[#5d49c7] dark:bg-[#3a2b61] dark:text-[#e0d9ff]" : "text-[#3c4966] hover:bg-[#f7f3ff] dark:text-white/75 dark:hover:bg-white/[0.08]"}`} id={`journal-event-tag-option-${optionIndex}`} key={`${option.kind}:${option.symptomId ?? option.signal.id}`} onClick={() => { void selectTag(option); }} onMouseDown={(event) => event.preventDefault()} role="option" type="button">{option.name}</button>; })}
            </div>)}
            {visibleTagOptions.length === 0 ? <p className={`${QUESTION_HINT_CLASS} px-3 py-2`}>No matching Feelings.</p> : null}
          </div> : null}
          {tagOverlay ? <JournalEventOccurrenceOverlay
            anchorRef={descriptionRef}
            onChange={(updates) => setTagOverlay((current) => current ? { ...current, ...updates } : current)}
            onClose={() => setTagOverlay(null)}
            onSave={saveTagOccurrence}
            overlay={tagOverlay}
            signal={overlaySignal ?? tagOverlay.signal}
            symptoms={symptoms}
          /> : null}
        </div>
      </label>
      <p className={QUESTION_HINT_CLASS}>Type # while writing to tag a symptom or feeling. Choosing one logs a timestamped occurrence owned by this Event.</p>
    </QuestionSection>
    {eventDateTime ? <QuestionSection title="When did it happen?"><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>Event date</span><input aria-label="Event date" className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChangeDate?.(event.target.value)} type="date" value={date} /></label><label className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>When did it happen?</span><HealthStandardTimeInput ariaLabel="When did it happen?" compact onChange={(value) => onChangeTime?.(value)} value={time} /></label></div></QuestionSection> : null}
    {occurrences.length > 0 ? <QuestionSection title="Tagged Feeling occurrences"><div className="grid gap-2">{occurrences.map((occurrence) => { const signal = getJournalEventSignalForDraft(occurrence.signalId, signals, symptoms); const name = signal ? getHealthJournalSignalDisplayName(signal, symptoms) : "Archived Feeling"; const occurredAt = buildHealthMealLoggedAt(date, occurrence.time) ?? occurrence.occurredAt; return <div className="flex flex-wrap items-center gap-2 rounded-[0.8rem] border border-[#edf0fb] px-3 py-2 dark:border-white/10" key={occurrence.draftKey}><span className="min-w-0 flex-1 text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthJournalOccurrenceReference({ name, occurredAt, score: occurrence.score, signal })}</span><span className="text-xs text-[#7d88a3] dark:text-white/50">{signal?.scale_labels[occurrence.score] ?? ""}</span><AdhdIconButton aria-label={`Edit ${name} occurrence`} onClick={() => beginOccurrenceEdit(occurrence)} size="sm" tone="ghost" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton><AdhdIconButton aria-label={`Remove ${name} occurrence`} onClick={() => onRemoveOccurrence(occurrence.draftKey)} size="sm" tone="danger" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton></div>; })}</div></QuestionSection> : null}
  </div>;
}

function JournalEventOccurrenceOverlay({
  anchorRef,
  onChange,
  onClose,
  onSave,
  overlay,
  signal,
  symptoms,
}: {
  anchorRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (updates: Partial<Pick<JournalTagOverlay, "error" | "score" | "time">>) => void;
  onClose: () => void;
  onSave: () => void;
  overlay: Exclude<JournalTagOverlay, null>;
  signal: HealthJournalSignal;
  symptoms: readonly HealthSymptom[];
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const denominator = getHealthJournalScaleDenominator(signal);
  const displayName = getHealthJournalSignalDisplayName(signal, symptoms);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [anchorRef, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AdhdDropdownPanel
      aria-label={`Log ${displayName}`}
      className="z-[160] grid max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] gap-2 overflow-y-auto"
      data-journal-floating-overlay="true"
      id="journal-event-tag-overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      ref={panelRef}
      role="dialog"
      style={{ left: "50%", position: "fixed", top: "50%", transform: "translate(-50%, -50%)" }}
      tabIndex={-1}
      widthClassName="w-[min(44rem,calc(100vw-1rem))]"
    >
      <div className="grid gap-2">
        <p className={`${QUESTION_HINT_CLASS} text-center font-semibold uppercase tracking-[0.16em]`}>Log {displayName}</p>
        <div className="grid gap-1.5"><p className={`${QUESTION_HINT_CLASS} text-center font-semibold uppercase tracking-[0.16em]`}>{signal.kind === "symptom" ? "Severity" : "Intensity"} · 1–{denominator}</p><div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{Array.from({ length: denominator }, (_, index) => index + 1).map((score) => <button aria-label={`${displayName} ${score}, ${signal.scale_labels[score] ?? ""}`} aria-pressed={overlay.score === score} className={`flex min-h-8 w-full min-w-0 items-start justify-start gap-2 rounded-[0.7rem] border px-2 py-1.5 text-left ${overlay.score === score ? "border-[#5d49c7] bg-[#6f57f6] text-white dark:border-[#cabfff] dark:bg-[#cabfff] dark:text-[#1a1431]" : "border-[#6f57f6] bg-white text-[#615b9c] dark:bg-white/8 dark:text-white/65"}`} key={score} onClick={() => onChange({ error: null, score })} type="button"><span className="shrink-0 text-xs font-semibold">{score}</span><span className="min-w-0 flex-1 text-[11px] font-medium leading-tight break-words whitespace-normal">{signal.scale_labels[score] ?? ""}</span></button>)}</div></div>
        <label className="grid gap-1.5"><span className={QUESTION_HINT_CLASS}>Occurrence time</span><HealthStandardTimeInput ariaLabel="Event Feeling occurrence time" compact onChange={(value) => onChange({ error: null, time: value })} value={overlay.time} /></label>
        {overlay.error ? <p aria-live="polite" className="text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]" role="alert">{overlay.error}</p> : null}
        <div className="flex justify-end gap-1.5"><AdhdChip onClick={onClose} type="button">Skip</AdhdChip><AdhdChip onClick={onSave} tone="purple" type="button">{overlay.draftKey ? "Update occurrence" : "Add occurrence"}</AdhdChip></div>
      </div>
    </AdhdDropdownPanel>,
    document.body,
  );
}

export function hydrateJournalEventOccurrences(
  entry: { id: string } | null,
  symptomEntries: ReadonlyArray<{ id: string; journal_entry_id: string; symptom_id: string; logged_at: string; severity: number; note: string | null }>,
  journalSignalOccurrences: ReadonlyArray<{ id: string; journal_entry_id: string; signal_id: string; occurred_at: string; score: number; note: string | null }>,
  journalSignals: readonly HealthJournalSignal[],
) {
  if (!entry) return [];
  return [
    ...symptomEntries.filter((occurrence) => occurrence.journal_entry_id === entry.id).map((occurrence) => ({
      draftKey: occurrence.id,
      id: occurrence.id,
      note: occurrence.note ?? "",
      occurredAt: occurrence.logged_at,
      score: occurrence.severity,
      signalId: journalSignals.find((signal) => signal.kind === "symptom" && signal.symptom_id === occurrence.symptom_id)?.id ?? `canonical-symptom:${occurrence.symptom_id}`,
      time: timeInputFromTimestamp(occurrence.logged_at),
    })),
    ...journalSignalOccurrences.filter((occurrence) => occurrence.journal_entry_id === entry.id).map((occurrence) => ({
      draftKey: occurrence.id,
      id: occurrence.id,
      note: occurrence.note ?? "",
      occurredAt: occurrence.occurred_at,
      score: occurrence.score,
      signalId: occurrence.signal_id,
      time: timeInputFromTimestamp(occurrence.occurred_at),
    })),
  ];
}

export function getJournalEventSignalForDraft(signalId: string, journalSignals: readonly HealthJournalSignal[], symptoms: readonly HealthSymptom[]) {
  const signal = journalSignals.find((candidate) => candidate.id === signalId);
  if (signal) return signal;
  if (!signalId.startsWith("canonical-symptom:")) return undefined;
  const symptom = symptoms.find((candidate) => candidate.id === signalId.slice("canonical-symptom:".length));
  return symptom ? buildJournalEventSymptomSignal(symptom) : undefined;
}

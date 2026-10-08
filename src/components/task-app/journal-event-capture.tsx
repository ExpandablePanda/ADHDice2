"use client";

import { Pencil, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import type { HealthJournalSignal, HealthJournalSignalInsert, HealthSymptom } from "@/lib/database.types";
import type { HealthJournalTrigger, HealthJournalTriggerLink } from "@/lib/database.types";
import { getHealthJournalTriggerNameIdentity, type HealthJournalTriggerAssociationDraft } from "@/lib/health-journal-triggers";
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
  timeIsEstimated: boolean;
  triggerAssociations: HealthJournalTriggerAssociationDraft[];
  expectedTriggerAssociations: HealthJournalTriggerAssociationDraft[];
  triggerAssociationsEdited: boolean;
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
  tagEnd: number | null;
  tagStart: number | null;
  tagText: string | null;
  time: string;
  timeIsEstimated: boolean;
  triggerAssociations: HealthJournalTriggerAssociationDraft[];
  triggerAssociationsEdited: boolean;
} | null;

type JournalTagOverlayState = Exclude<JournalTagOverlay, null>;

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

export function JournalEstimatedToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7d88a3] dark:text-white/55"><input aria-label={`${label} estimated`} checked={checked} className="h-3.5 w-3.5 accent-[#6f57f6]" onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>Estimated</span></label>;
}

export function JournalEventCapture({
  date,
  description,
  eventDateTime = false,
  endDate,
  endTime,
  endTimeEstimated = false,
  occurrences,
  onChangeDate,
  onChangeDescription,
  onChangeEndDate,
  onChangeEndTime,
  onChangeEndTimeEstimated,
  onChangeStartTimeEstimated,
  onChangeTime,
  onCreateSignal,
  onRemoveOccurrence,
  onSaveOccurrence,
  onUpdateOccurrence,
  signals,
  symptoms,
  journalTriggers = [],
  triggerLibraryError = null,
  isLoadingTriggers = false,
  onCreateTrigger,
  onRetryTriggerLoad,
  time,
  timeEstimated = false,
}: {
  date: string;
  description: string;
  eventDateTime?: boolean;
  endDate: string;
  endTime: string;
  endTimeEstimated?: boolean;
  occurrences: readonly JournalEventOccurrenceDraft[];
  onChangeDate?: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeEndDate?: (value: string) => void;
  onChangeEndTime?: (value: string) => void;
  onChangeEndTimeEstimated?: (value: boolean) => void;
  onChangeStartTimeEstimated?: (value: boolean) => void;
  onChangeTime?: (value: string) => void;
  onCreateSignal?: (input: Omit<HealthJournalSignalInsert, "user_id">) => Promise<HealthJournalSignal | null>;
  onRemoveOccurrence: (draftKey: string) => void;
  onSaveOccurrence: (draft: JournalEventOccurrenceDraft) => void;
  onUpdateOccurrence: (draft: JournalEventOccurrenceDraft) => void;
  signals: readonly HealthJournalSignal[];
  symptoms: readonly HealthSymptom[];
  journalTriggers?: readonly HealthJournalTrigger[];
  triggerLibraryError?: string | null;
  isLoadingTriggers?: boolean;
  onCreateTrigger?: (name: string) => Promise<HealthJournalTrigger | null>;
  onRetryTriggerLoad?: () => void;
  time: string;
  timeEstimated?: boolean;
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
  const orderedOccurrences = useMemo(
    () => [...occurrences].sort((left, right) => {
      const leftOccurredAt = buildHealthMealLoggedAt(date, left.time) ?? left.occurredAt;
      const rightOccurredAt = buildHealthMealLoggedAt(date, right.time) ?? right.occurredAt;
      return Date.parse(leftOccurredAt) - Date.parse(rightOccurredAt) || left.draftKey.localeCompare(right.draftKey);
    }),
    [date, occurrences],
  );

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
    const currentDescription = descriptionRef.current?.value ?? description;
    onChangeDescription(replaceHealthJournalReflectionTag(currentDescription, tagQuery.start, tagQuery.end, replacement));
    tagCaretRef.current = nextCaret;
    setTagQuery(null);
    setTagHighlightIndex(0);
    setTagOverlay({ draftKey: null, error: null, score: null, signal, tagEnd: nextCaret, tagStart: tagQuery.start, tagText: replacement, time: time || getCurrentHealthDateTimeInputs().time, timeIsEstimated: false, triggerAssociations: [], triggerAssociationsEdited: false });
  }

  function beginOccurrenceEdit(draft: JournalEventOccurrenceDraft) {
    const signal = getJournalEventSignalForDraft(draft.signalId, signals, symptoms);
    if (!signal) return;
    setTagOverlay({ draftKey: draft.draftKey, error: null, score: draft.score, signal, tagEnd: null, tagStart: null, tagText: null, time: draft.time, timeIsEstimated: draft.timeIsEstimated, triggerAssociations: draft.triggerAssociations, triggerAssociationsEdited: draft.triggerAssociationsEdited });
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
    const scoreLabel = `(${tagOverlay.score}/${denominator})`;
    if (tagOverlay.draftKey === null && tagOverlay.tagStart !== null && tagOverlay.tagEnd !== null && tagOverlay.tagText) {
      const currentDescription = descriptionRef.current?.value ?? description;
      if (currentDescription.slice(tagOverlay.tagStart, tagOverlay.tagEnd) !== tagOverlay.tagText) {
        setTagOverlay((current) => current ? { ...current, error: "The selected tag changed. Cancel it and choose the Feeling again." } : current);
        return;
      }
      const signalName = getHealthJournalSignalDisplayName(overlaySignal, symptoms);
      const scoredTag = `#${signalName} ${scoreLabel} `;
      onChangeDescription(replaceHealthJournalReflectionTag(currentDescription, tagOverlay.tagStart, tagOverlay.tagEnd, scoredTag));
      tagCaretRef.current = tagOverlay.tagStart + scoredTag.length;
    }
    const nextDraft: JournalEventOccurrenceDraft = {
      draftKey: tagOverlay.draftKey ?? createDraftId("journal-event-occurrence"),
      ...(existing?.id ? { id: existing.id } : {}),
      note: existing?.note ?? "",
      occurredAt,
      score: tagOverlay.score,
      signalId: overlaySignal.id,
      time: normalizedTime,
      timeIsEstimated: tagOverlay.timeIsEstimated,
      triggerAssociations: tagOverlay.triggerAssociations,
      expectedTriggerAssociations: existing?.expectedTriggerAssociations ?? [],
      triggerAssociationsEdited: tagOverlay.triggerAssociationsEdited,
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

  function cancelTagOverlay() {
    if (tagOverlay?.draftKey === null && tagOverlay.tagStart !== null && tagOverlay.tagEnd !== null && tagOverlay.tagText) {
      const currentDescription = descriptionRef.current?.value ?? description;
      if (currentDescription.slice(tagOverlay.tagStart, tagOverlay.tagEnd) === tagOverlay.tagText) {
        onChangeDescription(replaceHealthJournalReflectionTag(currentDescription, tagOverlay.tagStart, tagOverlay.tagEnd, ""));
        tagCaretRef.current = tagOverlay.tagStart;
      }
    }
    setTagOverlay(null);
    if (tagCaretRef.current !== null) {
      requestAnimationFrame(() => {
        const textarea = descriptionRef.current;
        if (!textarea) return;
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(tagCaretRef.current ?? textarea.value.length, tagCaretRef.current ?? textarea.value.length);
      });
    }
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
            onClose={cancelTagOverlay}
            onSave={saveTagOccurrence}
            overlay={tagOverlay}
            signal={overlaySignal ?? tagOverlay.signal}
            symptoms={symptoms}
            journalTriggers={journalTriggers}
            triggerAssociations={tagOverlay.triggerAssociations}
            onChangeTriggerAssociations={(associations) => setTagOverlay((current) => current ? { ...current, triggerAssociations: associations, triggerAssociationsEdited: true } : current)}
            triggerLibraryError={triggerLibraryError}
            isLoadingTriggers={isLoadingTriggers}
            onCreateTrigger={onCreateTrigger}
            onRetryTriggerLoad={onRetryTriggerLoad}
          /> : null}
        </div>
      </label>
      <p className={QUESTION_HINT_CLASS}>Type # while writing to tag a symptom or feeling. Choosing one logs a timestamped occurrence owned by this Event.</p>
    </QuestionSection>
    {eventDateTime ? <QuestionSection title="When did it happen?"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>Event date</span><input aria-label="Event date" className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChangeDate?.(event.target.value)} type="date" value={date} /></label><div className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>When did it happen?</span><div className="flex flex-wrap items-center gap-2"><HealthStandardTimeInput ariaLabel="When did it happen?" compact onChange={(value) => onChangeTime?.(value)} value={time} /><JournalEstimatedToggle checked={timeEstimated} label="Event start time" onChange={(value) => onChangeStartTimeEstimated?.(value)} /></div></div><label className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>Event end date (optional)</span><input aria-label="Event end date" className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChangeEndDate?.(event.target.value)} type="date" value={endDate} /></label><div className="grid gap-2"><span className={QUESTION_LABEL_CLASS}>When did it end? (optional)</span><div className="flex flex-wrap items-center gap-2"><HealthStandardTimeInput ariaLabel="When did it end?" compact onChange={(value) => onChangeEndTime?.(value)} value={endTime} /><JournalEstimatedToggle checked={endTimeEstimated} label="Event end time" onChange={(value) => onChangeEndTimeEstimated?.(value)} /></div></div></div></QuestionSection> : null}
    {orderedOccurrences.length > 0 ? <QuestionSection title="Tagged Feeling occurrences"><div className="grid gap-2">{orderedOccurrences.map((occurrence) => { const signal = getJournalEventSignalForDraft(occurrence.signalId, signals, symptoms); const name = signal ? getHealthJournalSignalDisplayName(signal, symptoms) : "Archived Feeling"; const occurredAt = buildHealthMealLoggedAt(date, occurrence.time) ?? occurrence.occurredAt; return <div className="flex flex-wrap items-center gap-2 rounded-[0.8rem] border border-[#edf0fb] px-3 py-2 dark:border-white/10" key={occurrence.draftKey}><span className="min-w-0 flex-1 text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthJournalOccurrenceReference({ name, occurredAt, score: occurrence.score, signal, timeIsEstimated: occurrence.timeIsEstimated })}</span><span className="text-xs text-[#7d88a3] dark:text-white/50">{signal?.scale_labels[occurrence.score] ?? ""}</span><AdhdIconButton aria-label={`Edit ${name} occurrence`} onClick={() => beginOccurrenceEdit(occurrence)} size="sm" tone="ghost" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton><AdhdIconButton aria-label={`Remove ${name} occurrence`} onClick={() => onRemoveOccurrence(occurrence.draftKey)} size="sm" tone="danger" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton></div>; })}</div></QuestionSection> : null}
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
  journalTriggers,
  triggerAssociations,
  onChangeTriggerAssociations,
  triggerLibraryError,
  isLoadingTriggers,
  onCreateTrigger,
  onRetryTriggerLoad,
}: {
  anchorRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (updates: Partial<Pick<JournalTagOverlayState, "error" | "score" | "time" | "timeIsEstimated">>) => void;
  onClose: () => void;
  onSave: () => void;
  overlay: JournalTagOverlayState;
  signal: HealthJournalSignal;
  symptoms: readonly HealthSymptom[];
  journalTriggers: readonly HealthJournalTrigger[];
  triggerAssociations: readonly HealthJournalTriggerAssociationDraft[];
  onChangeTriggerAssociations: (associations: HealthJournalTriggerAssociationDraft[]) => void;
  triggerLibraryError: string | null;
  isLoadingTriggers: boolean;
  onCreateTrigger?: (name: string) => Promise<HealthJournalTrigger | null>;
  onRetryTriggerLoad?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const denominator = getHealthJournalScaleDenominator(signal);
  const displayName = getHealthJournalSignalDisplayName(signal, symptoms);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
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
        <div className="grid gap-1.5"><span className={QUESTION_HINT_CLASS}>Occurrence time</span><div className="flex flex-wrap items-center gap-2"><HealthStandardTimeInput ariaLabel="Event Feeling occurrence time" compact onChange={(value) => onChange({ error: null, time: value })} value={overlay.time} /><JournalEstimatedToggle checked={overlay.timeIsEstimated} label="Feeling occurrence time" onChange={(value) => onChange({ error: null, timeIsEstimated: value })} /></div></div>
        <JournalTriggerAssociations associations={triggerAssociations} error={triggerLibraryError} isLoading={isLoadingTriggers} onChange={onChangeTriggerAssociations} onCreateTrigger={onCreateTrigger} onRetry={onRetryTriggerLoad} triggers={journalTriggers} />
        {overlay.error ? <p aria-live="polite" className="text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]" role="alert">{overlay.error}</p> : null}
        <div className="flex justify-end gap-1.5"><AdhdChip onClick={onClose} type="button">Skip</AdhdChip><AdhdChip onClick={onSave} tone="purple" type="button">{overlay.draftKey ? "Update occurrence" : "Add occurrence"}</AdhdChip></div>
      </div>
    </AdhdDropdownPanel>,
    document.body,
  );
}

function JournalTriggerAssociations({
  associations,
  error,
  isLoading,
  onChange,
  onCreateTrigger,
  onRetry,
  triggers,
}: {
  associations: readonly HealthJournalTriggerAssociationDraft[];
  error: string | null;
  isLoading: boolean;
  onChange: (associations: HealthJournalTriggerAssociationDraft[]) => void;
  onCreateTrigger?: (name: string) => Promise<HealthJournalTrigger | null>;
  onRetry?: () => void;
  triggers: readonly HealthJournalTrigger[];
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const activeTriggers = useMemo(() => {
    const normalizedQuery = getHealthJournalTriggerNameIdentity(query);
    return triggers.filter((trigger) => trigger.archived_at === null
      && !associations.some((association) => association.trigger_id === trigger.id)
      && (!normalizedQuery || getHealthJournalTriggerNameIdentity(trigger.name).includes(normalizedQuery)));
  }, [associations, query, triggers]);
  const exactActiveTrigger = triggers.find((trigger) => trigger.archived_at === null
    && getHealthJournalTriggerNameIdentity(trigger.name) === getHealthJournalTriggerNameIdentity(query));
  const createName = query.trim().replace(/\s+/g, " ");

  useEffect(() => {
    if (!isOpen) return;
    searchRef.current?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  function addTrigger(trigger: HealthJournalTrigger) {
    if (associations.some((association) => association.trigger_id === trigger.id)) return;
    onChange([...associations, { effect: "associated", previous_score: null, trigger_id: trigger.id }]);
    setQuery("");
    setIsOpen(false);
    setPickerError(null);
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }

  async function createTrigger() {
    if (!createName || !onCreateTrigger || isCreating) return;
    setIsCreating(true);
    setPickerError(null);
    try {
      const trigger = await onCreateTrigger(createName);
      if (trigger) addTrigger(trigger);
      else setPickerError("Trigger was not created remotely. Review the Trigger Library message and retry.");
    } catch (caught) {
      setPickerError(caught instanceof Error ? caught.message : "Could not create Trigger.");
    } finally {
      setIsCreating(false);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
      return;
    }
    if (event.key === "ArrowDown" && activeTriggers.length > 0) {
      event.preventDefault();
      setHighlightIndex((index) => (index + 1) % activeTriggers.length);
    } else if (event.key === "ArrowUp" && activeTriggers.length > 0) {
      event.preventDefault();
      setHighlightIndex((index) => (index - 1 + activeTriggers.length) % activeTriggers.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeTriggers.length > 0) addTrigger(activeTriggers[highlightIndex] ?? activeTriggers[0]!);
      else if (createName && !exactActiveTrigger) void createTrigger();
    }
  }

  return <section aria-label="Triggers" className="grid gap-2 rounded-[0.8rem] border border-[#edf0fb] p-3 dark:border-white/10">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className={QUESTION_LABEL_CLASS}>Triggers</span><span className={QUESTION_HINT_CLASS}>Optional · tied to this Feeling occurrence</span></div>
    {associations.map((association) => {
      const trigger = triggers.find((candidate) => candidate.id === association.trigger_id);
      const name = trigger?.name ?? "Archived Trigger";
      return <div className="grid gap-2 rounded-[0.75rem] bg-[#f8f6ff] p-2 dark:bg-white/[0.04] sm:grid-cols-[minmax(0,1fr)_minmax(8rem,auto)_minmax(8rem,auto)_auto] sm:items-end" key={association.trigger_id}>
        <div className="min-w-0 text-sm font-semibold text-[#26324f] dark:text-white">{name}{trigger?.archived_at ? <span className="ml-1 text-[10px] font-medium text-[#7d88a3]">Archived</span> : null}</div>
        <label className="grid gap-1"><span className={QUESTION_HINT_CLASS}>Effect</span><select aria-label={`${name} effect`} className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChange(associations.map((candidate) => candidate.trigger_id === association.trigger_id ? { ...candidate, effect: event.target.value as HealthJournalTriggerAssociationDraft["effect"], previous_score: event.target.value === "associated" ? null : candidate.previous_score } : candidate))} value={association.effect}><option value="associated">Associated</option><option value="worsened">Worsened</option><option value="improved">Improved</option></select></label>
        {association.effect !== "associated" ? <label className="grid gap-1"><span className={QUESTION_HINT_CLASS}>Previous score (optional)</span><select aria-label={`${name} previous score`} className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => onChange(associations.map((candidate) => candidate.trigger_id === association.trigger_id ? { ...candidate, previous_score: event.target.value === "" ? null : Number(event.target.value) } : candidate))} value={association.previous_score ?? ""}><option value="">Unknown / None</option>{Array.from({ length: 11 }, (_, score) => <option key={score} value={score}>{score}</option>)}</select></label> : <span className={`${QUESTION_HINT_CLASS} hidden sm:block`}>No previous score</span>}
        <AdhdIconButton aria-label={`Remove ${name} Trigger`} onClick={() => onChange(associations.filter((candidate) => candidate.trigger_id !== association.trigger_id))} size="sm" tone="danger" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton>
      </div>;
    })}
    <div className="relative" ref={rootRef}>
      <div className="flex flex-wrap gap-2"><AdhdChip aria-expanded={isOpen} onClick={() => { setPickerError(null); setIsOpen((open) => !open); }} type="button">+ Add Trigger</AdhdChip>{isLoading ? <span className={`${QUESTION_HINT_CLASS} self-center`}>Loading Trigger Library…</span> : null}</div>
      {isOpen ? <div className="absolute inset-x-0 top-full z-40 mt-1 grid max-h-56 gap-1 overflow-y-auto rounded-[0.9rem] border border-[#e4deef] bg-white p-2 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-[#211c34]">
        <input aria-label="Search Triggers" aria-controls="journal-trigger-picker-options" aria-activedescendant={activeTriggers.length ? `journal-trigger-option-${highlightIndex}` : undefined} className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => { setQuery(event.target.value); setHighlightIndex(0); setPickerError(null); }} onKeyDown={handleSearchKeyDown} placeholder="Search or create a Trigger" ref={searchRef} value={query} />
        <div className="grid gap-1" id="journal-trigger-picker-options" role="listbox">
          {activeTriggers.map((trigger, index) => <button aria-selected={index === highlightIndex} className={`min-h-9 rounded-[0.65rem] px-3 text-left text-sm font-semibold ${index === highlightIndex ? "bg-[#efe9ff] text-[#5d49c7] dark:bg-[#3a2b61] dark:text-[#e0d9ff]" : "text-[#3c4966] hover:bg-[#f7f3ff] dark:text-white/75 dark:hover:bg-white/[0.08]"}`} id={`journal-trigger-option-${index}`} key={trigger.id} onClick={() => addTrigger(trigger)} onMouseDown={(event) => event.preventDefault()} role="option" type="button">{trigger.name}</button>)}
          {activeTriggers.length === 0 && !createName ? <p className={`${QUESTION_HINT_CLASS} px-2 py-1`}>Search saved Triggers or enter a name to create one.</p> : null}
        </div>
        {createName && !exactActiveTrigger && onCreateTrigger ? <AdhdChip disabled={isCreating} onClick={() => { void createTrigger(); }} selected type="button">{isCreating ? "Creating remotely…" : `Create “${createName}”`}</AdhdChip> : null}
        {pickerError || error ? <div><p aria-live="polite" className="text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]" role="alert">{pickerError ?? error}</p>{error && onRetry ? <AdhdChip className="mt-1" disabled={isLoading} onClick={onRetry} type="button">Retry Trigger Library</AdhdChip> : null}</div> : null}
      </div> : null}
    </div>
  </section>;
}

export function hydrateJournalEventOccurrences(
  entry: { id: string } | null,
  symptomEntries: ReadonlyArray<{ id: string; journal_entry_id: string; symptom_id: string; logged_at: string; severity: number; note: string | null; time_is_estimated?: boolean }>,
  journalSignalOccurrences: ReadonlyArray<{ id: string; journal_entry_id: string; signal_id: string; occurred_at: string; score: number; note: string | null; time_is_estimated?: boolean }>,
  journalSignals: readonly HealthJournalSignal[],
  triggerLinks: readonly HealthJournalTriggerLink[] = [],
) {
  if (!entry) return [];
  const associationsFor = (kind: "symptom" | "journal_signal", occurrenceId: string) => triggerLinks
    .filter((link) => kind === "symptom" ? link.symptom_occurrence_id === occurrenceId : link.journal_signal_occurrence_id === occurrenceId)
    .map((link) => ({ effect: link.effect, previous_score: link.previous_score, trigger_id: link.trigger_id }));
  return [
    ...symptomEntries.filter((occurrence) => occurrence.journal_entry_id === entry.id).map((occurrence) => ({
      draftKey: occurrence.id,
      id: occurrence.id,
      note: occurrence.note ?? "",
      occurredAt: occurrence.logged_at,
      score: occurrence.severity,
      signalId: journalSignals.find((signal) => signal.kind === "symptom" && signal.symptom_id === occurrence.symptom_id)?.id ?? `canonical-symptom:${occurrence.symptom_id}`,
      time: timeInputFromTimestamp(occurrence.logged_at),
      timeIsEstimated: occurrence.time_is_estimated === true,
      triggerAssociations: associationsFor("symptom", occurrence.id),
      expectedTriggerAssociations: associationsFor("symptom", occurrence.id),
      triggerAssociationsEdited: false,
    })),
    ...journalSignalOccurrences.filter((occurrence) => occurrence.journal_entry_id === entry.id).map((occurrence) => ({
      draftKey: occurrence.id,
      id: occurrence.id,
      note: occurrence.note ?? "",
      occurredAt: occurrence.occurred_at,
      score: occurrence.score,
      signalId: occurrence.signal_id,
      time: timeInputFromTimestamp(occurrence.occurred_at),
      timeIsEstimated: occurrence.time_is_estimated === true,
      triggerAssociations: associationsFor("journal_signal", occurrence.id),
      expectedTriggerAssociations: associationsFor("journal_signal", occurrence.id),
      triggerAssociationsEdited: false,
    })),
  ].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.draftKey.localeCompare(right.draftKey));
}

export function getJournalEventSignalForDraft(signalId: string, journalSignals: readonly HealthJournalSignal[], symptoms: readonly HealthSymptom[]) {
  const signal = journalSignals.find((candidate) => candidate.id === signalId);
  if (signal) return signal;
  if (!signalId.startsWith("canonical-symptom:")) return undefined;
  const symptom = symptoms.find((candidate) => candidate.id === signalId.slice("canonical-symptom:".length));
  return symptom ? buildJournalEventSymptomSignal(symptom) : undefined;
}

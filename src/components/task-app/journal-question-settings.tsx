"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";

import type {
  HealthJournalCustomInputType,
  HealthJournalCustomQuestion,
  HealthJournalQuestionTarget,
} from "@/lib/database.types";
import {
  HEALTH_JOURNAL_CUSTOM_INPUT_TYPES,
  HEALTH_JOURNAL_CUSTOM_QUESTION_TARGETS,
  normalizeHealthJournalCustomQuestions,
} from "@/lib/health-journal-checkins";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import { HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";

const LONG_TEXT_CLASS = "block min-h-24 w-full rounded-[1.2rem] border border-[#e6e8f5] bg-white px-4 py-3 text-sm text-[#22304b] outline-none transition focus:border-[#9e8cf9] dark:border-white/10 dark:bg-white/[0.04] dark:text-white";

const INPUT_TYPE_LABELS: Record<HealthJournalCustomInputType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  scale_1_10: "1–10 scale",
  yes_no: "Yes / No",
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
};

const TARGET_LABELS: Record<HealthJournalQuestionTarget, string> = {
  start_of_day: "Start of Day",
  end_of_day: "End of Day",
  both: "Both",
};

type QuestionDraft = {
  id: string | null;
  input_type: HealthJournalCustomInputType;
  optionsText: string;
  question: string;
  target: HealthJournalQuestionTarget;
};

const EMPTY_DRAFT: QuestionDraft = {
  id: null,
  input_type: "short_text",
  optionsText: "",
  question: "",
  target: "both",
};

function createQuestionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `journal-question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function questionDraftFrom(question: HealthJournalCustomQuestion): QuestionDraft {
  return {
    id: question.id,
    input_type: question.input_type,
    optionsText: question.options.join("\n"),
    question: question.question,
    target: question.target,
  };
}

function optionsFromText(value: string) {
  return [...new Set(value.split("\n").map((option) => option.trim()).filter(Boolean))];
}

function normalizeDraftQuestion(draft: QuestionDraft, sortOrder: number, existing?: HealthJournalCustomQuestion): HealthJournalCustomQuestion | null {
  const question = draft.question.trim().replace(/\s+/g, " ");
  if (!question) return null;
  const now = new Date().toISOString();
  return {
    created_at: existing?.created_at ?? now,
    enabled: existing?.enabled ?? true,
    id: draft.id ?? createQuestionId(),
    input_type: draft.input_type,
    options: draft.input_type === "single_choice" || draft.input_type === "multiple_choice" ? optionsFromText(draft.optionsText) : [],
    question,
    sort_order: sortOrder,
    target: draft.target,
    updated_at: now,
  };
}

export function JournalQuestionSettings({
  onSave,
  questions,
}: {
  onSave: (questions: readonly HealthJournalCustomQuestion[]) => Promise<boolean>;
  questions: readonly HealthJournalCustomQuestion[];
}) {
  const normalizedQuestions = useMemo(() => normalizeHealthJournalCustomQuestions(questions), [questions]);
  const [localQuestions, setLocalQuestions] = useState<HealthJournalCustomQuestion[]>(normalizedQuestions);
  const [draft, setDraft] = useState<QuestionDraft>(EMPTY_DRAFT);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Keep the local draft list aligned after profile hydration or a remote save.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalQuestions(normalizedQuestions);
  }, [normalizedQuestions]);

  function startCreate() {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setIsEditorOpen(true);
  }

  function startEdit(question: HealthJournalCustomQuestion) {
    setDraft(questionDraftFrom(question));
    setError(null);
    setIsEditorOpen(true);
  }

  async function saveDraft() {
    const existing = draft.id ? localQuestions.find((question) => question.id === draft.id) : undefined;
    const nextQuestion = normalizeDraftQuestion(draft, existing?.sort_order ?? localQuestions.length, existing);
    if (!nextQuestion) {
      setError("Enter a question before saving.");
      return;
    }
    if ((nextQuestion.input_type === "single_choice" || nextQuestion.input_type === "multiple_choice") && nextQuestion.options.length < 1) {
      setError("Add at least one choice for this input type.");
      return;
    }
    const nextQuestions = existing
      ? localQuestions.map((question) => question.id === existing.id ? nextQuestion : question)
      : [...localQuestions, nextQuestion];
    const saved = await persistQuestions(nextQuestions);
    if (!saved) return;
    setDraft(EMPTY_DRAFT);
    setIsEditorOpen(false);
    setError(null);
  }

  async function persistQuestions(nextQuestions: HealthJournalCustomQuestion[]) {
    setIsSaving(true);
    const saved = await onSave(nextQuestions.map((question, index) => ({ ...question, sort_order: index })));
    setIsSaving(false);
    if (!saved) return false;
    setLocalQuestions(normalizeHealthJournalCustomQuestions(nextQuestions));
    return true;
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= localQuestions.length) return;
    const next = [...localQuestions];
    [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    void persistQuestions(next);
  }

  function toggleQuestion(question: HealthJournalCustomQuestion) {
    void persistQuestions(localQuestions.map((candidate) => candidate.id === question.id ? { ...candidate, enabled: !candidate.enabled } : candidate));
  }

  function deleteQuestion(question: HealthJournalCustomQuestion) {
    void persistQuestions(localQuestions.filter((candidate) => candidate.id !== question.id));
  }

  return (
    <section className="mt-6 grid gap-3 border-t border-[#edf0fb] pt-5 dark:border-white/10" aria-labelledby="journal-check-in-questions-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-[#26324f] dark:text-white" id="journal-check-in-questions-heading">Journal · Check-in Questions</h3>
          <p className="mt-1 max-w-2xl text-xs text-[#7d88a3] dark:text-white/50">Custom questions appear after the built-in questions. Existing answers keep a snapshot of their question text and choices for historical readability.</p>
        </div>
        <AdhdChip onClick={startCreate} tone="purple" type="button">+ Add question</AdhdChip>
      </div>

      {isEditorOpen ? (
        <div className="grid gap-3 rounded-[1rem] border border-[#e4deef] bg-[#fbfaff] p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <label className="grid gap-2"><span className="text-sm font-semibold text-[#26324f] dark:text-white">Question text</span><input autoFocus className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))} value={draft.question} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2"><span className="text-sm font-semibold text-[#26324f] dark:text-white">Show in</span><select className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value as HealthJournalQuestionTarget }))} value={draft.target}>{HEALTH_JOURNAL_CUSTOM_QUESTION_TARGETS.map((target) => <option key={target} value={target}>{TARGET_LABELS[target]}</option>)}</select></label>
            <label className="grid gap-2"><span className="text-sm font-semibold text-[#26324f] dark:text-white">Input type</span><select className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => setDraft((current) => ({ ...current, input_type: event.target.value as HealthJournalCustomInputType }))} value={draft.input_type}>{HEALTH_JOURNAL_CUSTOM_INPUT_TYPES.map((inputType) => <option key={inputType} value={inputType}>{INPUT_TYPE_LABELS[inputType]}</option>)}</select></label>
          </div>
          {draft.input_type === "single_choice" || draft.input_type === "multiple_choice" ? <label className="grid gap-2"><span className="text-sm font-semibold text-[#26324f] dark:text-white">Choices</span><textarea className={LONG_TEXT_CLASS} onChange={(event) => setDraft((current) => ({ ...current, optionsText: event.target.value }))} placeholder="One choice per line" value={draft.optionsText} /></label> : null}
          {error ? <p aria-live="polite" className="text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2"><AdhdChip onClick={() => { setIsEditorOpen(false); setDraft(EMPTY_DRAFT); setError(null); }} type="button">Cancel</AdhdChip><AdhdChip onClick={saveDraft} tone="purple" type="button">Save question</AdhdChip></div>
        </div>
      ) : null}

      {localQuestions.length === 0 ? <p className="text-sm text-[#7d88a3] dark:text-white/50">No custom check-in questions yet.</p> : <div className="grid gap-2">{localQuestions.map((question, index) => <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-[0.9rem] border border-[#edf0fb] bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]" key={question.id}><span className="min-w-0 flex-1"><span className={`block text-sm font-semibold ${question.enabled ? "text-[#26324f] dark:text-white" : "text-[#9299ab] line-through dark:text-white/40"}`}>{question.question}</span><span className="block text-xs text-[#7d88a3] dark:text-white/50">{TARGET_LABELS[question.target]} · {INPUT_TYPE_LABELS[question.input_type]}{question.options.length > 0 ? ` · ${question.options.length} choices` : ""}</span></span><AdhdChip onClick={() => toggleQuestion(question)} type="button">{question.enabled ? "Disable" : "Re-enable"}</AdhdChip><AdhdIconButton aria-label={`Edit ${question.question}`} onClick={() => startEdit(question)} size="sm" tone="ghost" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton><AdhdIconButton aria-label={`Delete ${question.question}`} onClick={() => deleteQuestion(question)} size="sm" tone="danger" variant="rowToolbar"><Trash2 aria-hidden="true" /></AdhdIconButton><AdhdIconButton aria-label={`Move ${question.question} up`} disabled={index === 0 || isSaving} onClick={() => moveQuestion(index, -1)} size="sm" tone="ghost" variant="rowToolbar"><ChevronUp aria-hidden="true" /></AdhdIconButton><AdhdIconButton aria-label={`Move ${question.question} down`} disabled={index === localQuestions.length - 1 || isSaving} onClick={() => moveQuestion(index, 1)} size="sm" tone="ghost" variant="rowToolbar"><ChevronDown aria-hidden="true" /></AdhdIconButton></div>)}</div>}
    </section>
  );
}

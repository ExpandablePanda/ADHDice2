"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Cloud, CloudOff, Copy, Download, Plus, Sparkles, Trash2 } from "lucide-react";
import { TaskTableChipButton, TASK_TABLE_INPUT_CLASS } from "@/components/ui/task-table-primitives";
import { AdhdChip, AdhdPanel } from "@/components/ui-system";
import { BrainstormQaWorkspace } from "@/components/task-app/brainstorm-qa-workspace";
import { parseBrainstormMarkdown, type BrainstormDefinition, type BrainstormParseResult, type BrainstormQuestion } from "@/lib/brainstorm-markdown";
import {
  createEmptyBrainstormAnswer,
  createBrainstormQuestionnaireSession,
  deleteBrainstormQuestionnaireSession,
  duplicateBrainstormQuestionnaireSession,
  generateBrainstormSummary,
  isBrainstormQuestionAnswered,
  migrateBrainstormAnswers,
  updateBrainstormQuestionnaireSession,
  type BrainstormAnswer,
  type BrainstormAnswers,
  type BrainstormPersistedState,
  type BrainstormStateChanges,
} from "@/lib/brainstorm-state";
import type { BrainstormSyncState } from "@/hooks/useBrainstormState";

type BrainstormWorkspaceProps = {
  appVersion: string;
  error: string | null;
  remoteUpdateNotice: boolean;
  state: BrainstormPersistedState;
  syncState: BrainstormSyncState;
  updateState: (changes: BrainstormStateChanges) => void;
};

const labelClass = "text-sm font-semibold text-[#40385f] dark:text-white/85";

function renderPlainParagraphs(paragraphs: string[]) {
  return paragraphs.map((paragraph, index) => <p className="text-sm leading-6 text-[#716b8c] dark:text-white/62" key={`${index}-${paragraph}`}>{paragraph}</p>);
}

function answerFor(question: BrainstormQuestion, answers: BrainstormAnswers) {
  const answer = answers[question.id];
  return answer?.type === question.type ? answer : createEmptyBrainstormAnswer(question);
}

function QuestionField({
  answer,
  onChange,
  question,
}: {
  answer: BrainstormAnswer;
  onChange: (answer: BrainstormAnswer) => void;
  question: BrainstormQuestion;
}) {
  const questionTitleId = `brainstorm-question-${question.id}-title`;
  const toggleOption = (option: string) => {
    const selected = question.type === "single"
      ? [option]
      : answer.selected.includes(option)
        ? answer.selected.filter((value) => value !== option)
        : [...answer.selected, option];
    onChange({ ...answer, selected });
  };

  return (
    <section className="rounded-[1.15rem] border border-[#eee9f8] bg-[#fcfbff] p-4 dark:border-white/8 dark:bg-white/[0.025]">
      <h3 className="text-base font-semibold text-[#342d53] dark:text-white" id={questionTitleId}>{question.title}</h3>
      <fieldset aria-labelledby={questionTitleId} className="m-0 mt-3 space-y-3 border-0 p-0">
        <div className="rounded-[0.95rem] border border-[#e6ddff] bg-[#f6f2ff] px-3 py-2.5 dark:border-[#45366f] dark:bg-[#21183d]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7963ec] dark:text-[#c9bdff]">What this decision means</p>
          <p className="mt-1 text-sm leading-5 text-[#655e7d] dark:text-white/65">{question.explanation || "No explanation was provided."}</p>
        </div>
        {question.type === "single" || question.type === "multiple" ? (
          <div className="space-y-2">
            {question.options.map((option) => {
              const checked = answer.selected.includes(option);
              return (
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[0.9rem] border border-[#e8e2f3] bg-white px-3 py-2 text-sm text-[#514a6c] transition hover:border-[#cfc2ff] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75" key={option}>
                  <input
                    checked={checked}
                    className="h-5 w-5 accent-[#6f57f6]"
                    name={question.type === "single" ? question.id : undefined}
                    onChange={() => toggleOption(option)}
                    type={question.type === "single" ? "radio" : "checkbox"}
                  />
                  <span className="flex flex-1 flex-wrap items-center gap-2">
                    <span>{option}</span>
                    {question.recommended.includes(option) ? <span className="rounded-full border border-[#cfc2ff] bg-[#f1edff] px-2 py-0.5 text-[11px] font-semibold text-[#6f57f6] dark:border-[#59488f] dark:bg-[#2b204b] dark:text-[#cabfff]">Recommended</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        ) : question.type === "short-text" ? (
          <input
            aria-label={`${question.title} answer`}
            className={TASK_TABLE_INPUT_CLASS}
            onChange={(event) => onChange({ ...answer, text: event.target.value })}
            type="text"
            value={answer.text}
          />
        ) : (
          <textarea
            aria-label={`${question.title} answer`}
            className={`${TASK_TABLE_INPUT_CLASS} min-h-32 resize-y`}
            onChange={(event) => onChange({ ...answer, text: event.target.value })}
            value={answer.text}
          />
        )}
        {question.other ? (
          <label className="block space-y-1.5">
            <span className={labelClass}>Other / override</span>
            <input
              className={TASK_TABLE_INPUT_CLASS}
              onChange={(event) => onChange({ ...answer, other: event.target.value })}
              placeholder="Enter another answer or override"
              type="text"
              value={answer.other}
            />
          </label>
        ) : null}
      </fieldset>
    </section>
  );
}

function initialParse(source: string): BrainstormParseResult | null {
  return source.trim() ? parseBrainstormMarkdown(source) : null;
}

export function BrainstormWorkspace({ appVersion, error, remoteUpdateNotice, state, syncState, updateState }: BrainstormWorkspaceProps) {
  const [activeView, setActiveView] = useState<"questionnaire" | "qa">("questionnaire");
  const [sourceDraft, setSourceDraft] = useState(state.sourceMarkdown);
  const [parseResult, setParseResult] = useState<BrainstormParseResult | null>(() => initialParse(state.sourceMarkdown));
  const [showSummary, setShowSummary] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const locallyEditedRef = useRef(false);
  const hydratedRef = useRef(false);
  const handledRemoteNoticeRef = useRef(false);
  const definition: BrainstormDefinition | null = parseResult?.definition ?? null;
  const activeQuestionnaire = state.questionnaireState.sessions.find((session) => session.id === state.questionnaireState.activeSessionId) ?? null;

  const updateQuestionnaireState = (questionnaireState: typeof state.questionnaireState) => {
    const active = questionnaireState.sessions.find((session) => session.id === questionnaireState.activeSessionId) ?? null;
    updateState({ answers: active?.answers ?? {}, questionnaireState, sourceMarkdown: active?.sourceMarkdown ?? "" });
  };

  const setActiveQuestionnaire = (session: NonNullable<typeof activeQuestionnaire>) => {
    const questionnaireState = {
      ...state.questionnaireState,
      sessions: state.questionnaireState.sessions.map((current) => current.id === session.id ? session : current),
    };
    updateQuestionnaireState(questionnaireState);
  };

  useEffect(() => {
    if (syncState === "loading" || hydratedRef.current) return;
    hydratedRef.current = true;
    if (!locallyEditedRef.current) {
      setSourceDraft(state.sourceMarkdown);
      setParseResult(initialParse(state.sourceMarkdown));
    }
  }, [state.sourceMarkdown, syncState]);

  useEffect(() => {
    if (!remoteUpdateNotice) {
      handledRemoteNoticeRef.current = false;
      return;
    }
    if (handledRemoteNoticeRef.current) return;
    handledRemoteNoticeRef.current = true;
    window.queueMicrotask(() => {
      locallyEditedRef.current = false;
      setSourceDraft(state.sourceMarkdown);
      setParseResult(initialParse(state.sourceMarkdown));
      setFeedback("A newer Brainstorm was loaded from another device.");
    });
  }, [remoteUpdateNotice, state.sourceMarkdown]);

  const progress = useMemo(() => {
    if (!definition) return { answered: 0, total: 0 };
    return {
      answered: definition.questions.filter((question) => isBrainstormQuestionAnswered(question, activeQuestionnaire?.answers[question.id])).length,
      total: definition.questions.length,
    };
  }, [activeQuestionnaire?.answers, definition]);
  const summary = useMemo(() => definition ? generateBrainstormSummary(definition, activeQuestionnaire?.answers ?? {}) : "", [activeQuestionnaire?.answers, definition]);

  const parseSource = () => {
    const nextResult = parseBrainstormMarkdown(sourceDraft);
    setParseResult(nextResult);
    setFeedback(null);
    if (nextResult.definition) {
      if (activeQuestionnaire) {
        setActiveQuestionnaire(updateBrainstormQuestionnaireSession(activeQuestionnaire, {
          answers: migrateBrainstormAnswers(nextResult.definition, activeQuestionnaire.answers),
          sourceMarkdown: sourceDraft,
        }));
      }
    }
  };

  const updateAnswer = (question: BrainstormQuestion, answer: BrainstormAnswer) => {
    if (activeQuestionnaire) setActiveQuestionnaire(updateBrainstormQuestionnaireSession(activeQuestionnaire, { answers: { ...activeQuestionnaire.answers, [question.id]: answer } }));
  };

  const copySummary = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(summary);
      setFeedback("Summary copied.");
    } catch {
      setFeedback("Could not copy the summary. Clipboard access is unavailable.");
    }
  };

  const downloadSummary = () => {
    try {
      const blob = new Blob([summary], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${definition?.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "brainstorm-summary"}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setFeedback("Summary download started.");
    } catch {
      setFeedback("Could not create the Markdown download.");
    }
  };

  const syncLabel = syncState === "unavailable" ? "Cloud sync unavailable" : syncState === "offline" ? "Offline — cached locally" : syncState === "loading" ? "Loading…" : syncState === "saving" ? "Saving…" : "Synced";
  const updatedLabel = Date.parse(state.clientUpdatedAt) > 0 ? `Updated ${new Date(state.clientUpdatedAt).toLocaleString()}` : "Not updated yet";

  return (
    <section className="mx-auto mt-5 w-full max-w-[1500px] space-y-4 px-1 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#938ab8]">Brainstorm</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#30294d] dark:text-white">{activeView === "questionnaire" ? "Questionnaire builder" : "QA Checklist"}</h2>
          <p className="mt-1 text-sm text-[#716b8c] dark:text-white/60">{activeView === "questionnaire" ? "Saved questionnaire sessions" : "Saved manual QA sessions"}, synced across your devices. {updatedLabel}</p>
          <div aria-label="Brainstorm workspace navigation" className="mt-3 flex flex-wrap gap-2" role="tablist">
            <AdhdChip aria-controls="brainstorm-questionnaire-panel" aria-selected={activeView === "questionnaire"} onClick={() => setActiveView("questionnaire")} role="tab" selected={activeView === "questionnaire"}>Questionnaire</AdhdChip>
            <AdhdChip aria-controls="brainstorm-qa-panel" aria-selected={activeView === "qa"} onClick={() => setActiveView("qa")} role="tab" selected={activeView === "qa"}>QA Checklist</AdhdChip>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <div aria-live="polite" className="inline-flex items-center gap-2 rounded-full border border-[#e5def5] bg-[#faf8ff] px-3 py-1.5 text-xs font-semibold text-[#716b8c] dark:border-white/10 dark:bg-white/5 dark:text-white/65">
            {syncState === "unavailable" || syncState === "offline" ? <CloudOff size={14} /> : <Cloud size={14} />}{syncLabel}
          </div>
          {activeView === "questionnaire" && activeQuestionnaire ? <TaskTableChipButton onClick={() => { if (window.confirm("Clear this questionnaire session? Other saved questionnaires will remain.")) { const session = updateBrainstormQuestionnaireSession(activeQuestionnaire, { answers: {}, sourceMarkdown: "" }); setActiveQuestionnaire(session); setSourceDraft(""); setParseResult(null); setShowSummary(false); setFeedback("Questionnaire cleared."); } }} toneClassName="border-rose-200 bg-rose-50 text-rose-700">Clear questionnaire</TaskTableChipButton> : null}
        </div>
      </div>

      {error ? <div className="rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">{error} Local recovery remains available, but changes are not fully synced.</div> : null}
      {remoteUpdateNotice ? <div className="rounded-[1rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">A newer Brainstorm was loaded from another device.</div> : null}

      {activeView === "qa" ? <div id="brainstorm-qa-panel" role="tabpanel"><BrainstormQaWorkspace appVersion={appVersion} qaState={state.qaState} updateQaState={(qaState) => updateState({ qaState })} /></div> : <div className="space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]" id="brainstorm-questionnaire-panel" role="tabpanel">
      <AdhdPanel padding="lg">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="min-w-0 flex-1 space-y-1.5 sm:min-w-72"><span className={labelClass}>Questionnaire session</span><select className={TASK_TABLE_INPUT_CLASS} onChange={(event) => { const next = state.questionnaireState.sessions.find((session) => session.id === event.target.value); if (next) { updateQuestionnaireState({ ...state.questionnaireState, activeSessionId: next.id }); setSourceDraft(next.sourceMarkdown); setParseResult(initialParse(next.sourceMarkdown)); setShowSummary(false); } }} value={activeQuestionnaire?.id ?? ""}>{state.questionnaireState.sessions.map((session) => <option key={session.id} value={session.id}>{session.title || "Untitled Questionnaire"}</option>)}</select></label>
          <div className="flex flex-wrap gap-2">
            <TaskTableChipButton className="inline-flex items-center gap-1.5" onClick={() => { const session = createBrainstormQuestionnaireSession(); updateQuestionnaireState({ ...state.questionnaireState, activeSessionId: session.id, sessions: [...state.questionnaireState.sessions, session] }); setSourceDraft(""); setParseResult(null); setShowSummary(false); setFeedback("New questionnaire session saved."); }}><Plus aria-hidden="true" size={13} />New Session</TaskTableChipButton>
            {activeQuestionnaire ? <TaskTableChipButton onClick={() => { const session = duplicateBrainstormQuestionnaireSession(activeQuestionnaire); updateQuestionnaireState({ ...state.questionnaireState, activeSessionId: session.id, sessions: [...state.questionnaireState.sessions, session] }); setSourceDraft(session.sourceMarkdown); setParseResult(initialParse(session.sourceMarkdown)); setShowSummary(false); setFeedback("Questionnaire session duplicated."); }}>Duplicate</TaskTableChipButton> : null}
            {activeQuestionnaire ? <TaskTableChipButton className="inline-flex items-center gap-1.5" onClick={() => { if (window.confirm("Delete this questionnaire session? Other saved questionnaires will remain.")) { const next = deleteBrainstormQuestionnaireSession(state.questionnaireState, activeQuestionnaire.id); updateQuestionnaireState(next); const replacement = next.sessions.find((session) => session.id === next.activeSessionId); setSourceDraft(replacement?.sourceMarkdown ?? ""); setParseResult(initialParse(replacement?.sourceMarkdown ?? "")); setShowSummary(false); setFeedback("Questionnaire session deleted."); } }} toneClassName="border-rose-200 bg-rose-50 text-rose-700"><Trash2 aria-hidden="true" size={13} />Delete session</TaskTableChipButton> : null}
          </div>
        </div>
        {activeQuestionnaire ? <label className="mt-4 block space-y-1.5"><span className={labelClass}>Title or feature name</span><input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => setActiveQuestionnaire(updateBrainstormQuestionnaireSession(activeQuestionnaire, { title: event.target.value }))} value={activeQuestionnaire.title} /></label> : <p className="mt-4 text-sm text-[#716b8c] dark:text-white/60">Create a saved questionnaire session to begin.</p>}
      </AdhdPanel>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <AdhdPanel padding="lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#938ab8]">Source</p><h3 className="mt-1 text-lg font-semibold text-[#342d53] dark:text-white">Markdown</h3></div>
            <TaskTableChipButton disabled={!activeQuestionnaire} onClick={parseSource} toneClassName="border-[#6f57f6] bg-[#6f57f6] text-white"><span className="inline-flex min-w-0 items-center gap-1.5"><Sparkles className="shrink-0" size={13} /> Parse / Update Form</span></TaskTableChipButton>
          </div>
          <textarea
            aria-label="Brainstorm Markdown source"
            className={`${TASK_TABLE_INPUT_CLASS} mt-4 min-h-[28rem] resize-y font-mono text-[13px] leading-5 lg:min-h-[36rem]`}
            disabled={!activeQuestionnaire}
            onChange={(event) => {
              locallyEditedRef.current = true;
              setSourceDraft(event.target.value);
              if (activeQuestionnaire) setActiveQuestionnaire(updateBrainstormQuestionnaireSession(activeQuestionnaire, { sourceMarkdown: event.target.value }));
            }}
            placeholder="# Form Title\n\nOptional introduction.\n\n## Question title\n@type single\n> What this decision means.\n- Option one\n- Option two"
            spellCheck={false}
            value={sourceDraft}
          />
          {parseResult?.errors.length ? (
            <div className="mt-3 space-y-2 rounded-[1rem] border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
              <p className="text-sm font-semibold text-rose-800 dark:text-rose-100">Please fix these Markdown issues:</p>
              <ul className="space-y-1 text-sm text-rose-700 dark:text-rose-100/85">
                {parseResult.errors.map((parseError, index) => <li key={`${parseError.line}-${index}`}>Line {parseError.line}: {parseError.message}</li>)}
              </ul>
            </div>
          ) : null}
        </AdhdPanel>

        <AdhdPanel padding="lg">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#938ab8]">Form</p><h3 className="mt-1 text-lg font-semibold text-[#342d53] dark:text-white">{definition?.title || "Questionnaire preview"}</h3></div>
            {definition ? <p className="text-sm font-semibold text-[#716b8c] dark:text-white/60">{progress.answered} of {progress.total} answered</p> : null}
          </div>
          {!sourceDraft.trim() ? <p className="mt-4 rounded-[1rem] border border-dashed border-[#dcd4ed] px-4 py-8 text-center text-sm text-[#81799b] dark:border-white/15 dark:text-white/45">Paste controlled Markdown in Source, then choose Parse / Update Form.</p> : null}
          {sourceDraft.trim() && !definition && !parseResult?.errors.length ? <p className="mt-4 text-sm text-[#716b8c] dark:text-white/60">Choose Parse / Update Form to preview this source.</p> : null}
          {definition ? (
            <div className="mt-4 space-y-4">
              {definition.introduction.length ? <div className="space-y-2">{renderPlainParagraphs(definition.introduction)}</div> : null}
              {definition.questions.map((question) => <QuestionField answer={answerFor(question, activeQuestionnaire?.answers ?? {})} key={question.id} onChange={(answer) => updateAnswer(question, answer)} question={question} />)}
            </div>
          ) : null}
        </AdhdPanel>
      </div>

      <AdhdPanel padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#938ab8]">Summary</p><h3 className="mt-1 text-lg font-semibold text-[#342d53] dark:text-white">Markdown output</h3></div>
          <div className="flex flex-wrap gap-2">
            <TaskTableChipButton disabled={!definition} onClick={() => setShowSummary((value) => !value)}>{showSummary ? "Hide Summary" : "Show Summary"}</TaskTableChipButton>
            <TaskTableChipButton disabled={!definition} onClick={() => { void copySummary(); }}><span className="inline-flex min-w-0 items-center gap-1.5"><Copy className="shrink-0" size={13} /> Copy Summary</span></TaskTableChipButton>
            <TaskTableChipButton disabled={!definition} onClick={downloadSummary}><span className="inline-flex min-w-0 items-center gap-1.5"><Download className="shrink-0" size={13} /> Download .md</span></TaskTableChipButton>
          </div>
        </div>
        {!definition ? <p className="mt-4 text-sm text-[#81799b] dark:text-white/45">Parse a valid questionnaire to generate its summary.</p> : null}
        {showSummary && definition ? <pre className="adhdice-scrollbar mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-[1rem] border border-[#e6e0f1] bg-[#faf9fd] p-4 text-sm leading-6 text-[#514a6c] dark:border-white/10 dark:bg-black/15 dark:text-white/70">{summary}</pre> : null}
        <p aria-live="polite" className="mt-3 flex min-h-5 items-center gap-2 text-sm text-[#716b8c] dark:text-white/60">{feedback ? <><Check size={14} />{feedback}</> : null}</p>
      </AdhdPanel>
      </div>}
    </section>
  );
}

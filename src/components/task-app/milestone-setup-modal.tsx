"use client";

import { Trophy, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Milestone, Task } from "@/lib/database.types";
import { ModalShell } from "@/components/modal-shell";
import {
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_ICON_LABEL_GAP_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TASK_TABLE_INPUT_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";
import {
  buildMilestoneCorrectionArgs,
  buildMilestoneLockArgs,
  createInitialMilestoneAnswersDraft,
  finalizeMilestoneAnswers,
  formatMilestoneDisplayDate,
  formatMilestoneRpcError,
  getMilestoneAuraDeadline,
  getOrCreateMilestoneOperationId,
  isTierAbove,
  validateMilestoneAdjustment,
  validateMilestoneQuestion,
  type MilestoneAnswersDraft,
  type MilestoneCorrectionArgs,
  type MilestoneLockArgs,
} from "@/lib/milestones";
import { buildMilestoneRecommendation } from "@/lib/milestones/milestone-rules";
import type { MilestoneRecommendationV1, MilestoneTier } from "@/lib/milestones/milestone-types";

const TIERS: MilestoneTier[] = ["bronze", "silver", "gold", "platinum"];
const QUESTION_TITLES = [
  "Estimated duration",
  "Realistic weekly capacity",
  "Difficulty",
  "Meaning",
  "Complexity",
  "Timeline predictability",
  "Current progress",
  "Work frequency",
  "External deadline",
] as const;

const OPTION_LABELS = {
  manageable: "Manageable",
  moderately_challenging: "Moderately challenging",
  difficult: "Difficult",
  very_difficult: "Very difficult",
  meaningful_personal_progress: "Meaningful personal progress",
  significant_accomplishment: "Significant accomplishment",
  major_life_or_project_goal: "Major life or project goal",
  exceptional_or_defining_achievement: "Exceptional or defining achievement",
  one_clear_outcome: "One clear outcome",
  several_manageable_steps: "Several manageable steps",
  many_connected_steps: "Many connected steps",
  large_multi_stage_project: "Large multi-stage project",
  very_predictable: "Very predictable",
  some_uncertainty: "Some uncertainty",
  highly_variable: "Highly variable",
  depends_on_others: "Depends on others",
  not_started: "Not started",
  planning_started: "Planning started",
  partly_complete: "Partly complete",
  more_than_half: "More than half",
  almost_finished: "Almost finished",
  most_days: "Most days",
  few_days_per_week: "A few days per week",
  about_once_per_week: "About once per week",
  irregularly: "Irregularly",
  not_sure: "Not sure",
} as const;

type SetupStage = "intro" | "questions" | "recommendation" | "confirm";
type MutationResult = Promise<{ error: string | null; milestone: Milestone | null }>;

function ChoiceGroup<T extends string>({ onChange, options, value }: {
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <TaskTableChipButton
          key={option.value}
          onClick={() => onChange(option.value)}
          toneClassName={value === option.value ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}
        >
          {option.label}
        </TaskTableChipButton>
      ))}
    </div>
  );
}

function enumOptions<T extends keyof typeof OPTION_LABELS>(values: T[]) {
  return values.map((value) => ({ label: OPTION_LABELS[value], value }));
}

function QuestionContent({ draft, onChange, questionIndex }: {
  draft: MilestoneAnswersDraft;
  onChange: (next: MilestoneAnswersDraft) => void;
  questionIndex: number;
}) {
  if (questionIndex === 0) {
    const mode = draft.estimatedDuration.kind;
    return (
      <div className="space-y-4">
        <ChoiceGroup
          onChange={(kind) => onChange({
            ...draft,
            estimatedDuration: kind === "duration"
              ? { kind, unit: mode === "duration" ? draft.estimatedDuration.unit : "weeks", value: mode === "duration" ? draft.estimatedDuration.value : null }
              : kind === "target_date" ? { kind, targetDate: "" } : { kind },
          })}
          options={[{ label: "Duration", value: "duration" }, { label: "Choose target date", value: "target_date" }, { label: "Not sure", value: "not_sure" }]}
          value={mode}
        />
        {draft.estimatedDuration.kind === "duration" ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              aria-label="Estimated duration value"
              className={TASK_TABLE_INPUT_CLASS}
              min="0.1"
              onChange={(event) => onChange({ ...draft, estimatedDuration: { ...draft.estimatedDuration, value: event.target.value ? Number(event.target.value) : null } })}
              placeholder="Enter duration"
              step="0.1"
              type="number"
              value={draft.estimatedDuration.value ?? ""}
            />
            <select
              aria-label="Estimated duration unit"
              className={TASK_TABLE_INPUT_CLASS}
              onChange={(event) => onChange({ ...draft, estimatedDuration: { ...draft.estimatedDuration, unit: event.target.value as Extract<typeof draft.estimatedDuration, { kind: "duration" }>["unit"] } })}
              value={draft.estimatedDuration.unit}
            >
              {(["hours", "days", "weeks", "months", "years"] as const).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </div>
        ) : draft.estimatedDuration.kind === "target_date" ? (
          <input aria-label="Explicit Milestone target date" className={TASK_TABLE_INPUT_CLASS} onChange={(event) => onChange({ ...draft, estimatedDuration: { kind: "target_date", targetDate: event.target.value } })} type="date" value={draft.estimatedDuration.targetDate} />
        ) : null}
      </div>
    );
  }
  if (questionIndex === 1) {
    return (
      <div className="space-y-4">
        <ChoiceGroup
          onChange={(kind) => onChange({ ...draft, weeklyCapacity: kind === "hours_per_week" ? { kind, hours: null } : { kind } })}
          options={[{ label: "Hours per week", value: "hours_per_week" }, { label: "Varies week to week", value: "varies" }, { label: "Not sure", value: "not_sure" }]}
          value={draft.weeklyCapacity?.kind ?? null}
        />
        {draft.weeklyCapacity?.kind === "hours_per_week" ? (
          <input aria-label="Weekly capacity hours" className={TASK_TABLE_INPUT_CLASS} min="0.1" onChange={(event) => onChange({ ...draft, weeklyCapacity: { kind: "hours_per_week", hours: event.target.value ? Number(event.target.value) : null } })} placeholder="Hours per week" step="0.1" type="number" value={draft.weeklyCapacity.hours ?? ""} />
        ) : null}
      </div>
    );
  }
  if (questionIndex === 2) return <ChoiceGroup onChange={(difficulty) => onChange({ ...draft, difficulty })} options={enumOptions(["manageable", "moderately_challenging", "difficult", "very_difficult", "not_sure"])} value={draft.difficulty} />;
  if (questionIndex === 3) return <ChoiceGroup onChange={(meaning) => onChange({ ...draft, meaning })} options={enumOptions(["meaningful_personal_progress", "significant_accomplishment", "major_life_or_project_goal", "exceptional_or_defining_achievement", "not_sure"])} value={draft.meaning} />;
  if (questionIndex === 4) return <ChoiceGroup onChange={(complexity) => onChange({ ...draft, complexity })} options={enumOptions(["one_clear_outcome", "several_manageable_steps", "many_connected_steps", "large_multi_stage_project", "not_sure"])} value={draft.complexity} />;
  if (questionIndex === 5) return <ChoiceGroup onChange={(timelinePredictability) => onChange({ ...draft, timelinePredictability })} options={enumOptions(["very_predictable", "some_uncertainty", "highly_variable", "depends_on_others", "not_sure"])} value={draft.timelinePredictability} />;
  if (questionIndex === 6) return <ChoiceGroup onChange={(currentProgress) => onChange({ ...draft, currentProgress })} options={enumOptions(["not_started", "planning_started", "partly_complete", "more_than_half", "almost_finished", "not_sure"])} value={draft.currentProgress} />;
  if (questionIndex === 7) return <ChoiceGroup onChange={(workFrequency) => onChange({ ...draft, workFrequency })} options={enumOptions(["most_days", "few_days_per_week", "about_once_per_week", "irregularly", "depends_on_others", "not_sure"])} value={draft.workFrequency} />;

  const deadlineKind = draft.externalDeadline?.kind ?? null;
  return (
    <div className="space-y-4">
      <ChoiceGroup
        onChange={(kind) => onChange({ ...draft, externalDeadline: kind === "preferred" || kind === "firm" ? { kind, date: "" } : { kind } })}
        options={[{ label: "No deadline", value: "none" }, { label: "Preferred date", value: "preferred" }, { label: "Firm deadline", value: "firm" }, { label: "Not sure", value: "not_sure" }]}
        value={deadlineKind}
      />
      {draft.externalDeadline?.kind === "preferred" || draft.externalDeadline?.kind === "firm" ? (
        <input aria-label="External deadline date" className={TASK_TABLE_INPUT_CLASS} onChange={(event) => onChange({ ...draft, externalDeadline: { kind: draft.externalDeadline!.kind as "preferred" | "firm", date: event.target.value } })} type="date" value={draft.externalDeadline.date} />
      ) : null}
    </div>
  );
}

function RecommendationSummary({ recommendation, selectedTargetDate, selectedTier }: {
  recommendation: MilestoneRecommendationV1;
  selectedTargetDate: string;
  selectedTier: MilestoneTier;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-[1.25rem] border border-[#e8e0fb] bg-[#fbf9ff] p-4 dark:border-white/10 dark:bg-white/[0.04]">
        <div aria-label={`${selectedTier} trophy placeholder`} className="flex min-h-28 items-center justify-center rounded-[1rem] border border-dashed border-[#d9cdf8] text-[#6f57f6] dark:border-white/15 dark:text-[#cabfff]">
          <Trophy aria-hidden="true" className="h-8 w-8" />
        </div>
        <p className="mt-3 text-lg font-semibold capitalize text-[#30284f] dark:text-white">{selectedTier}</p>
        <p className="mt-1 text-sm leading-6 text-[#756d92] dark:text-white/60">Recommended: <span className="capitalize">{recommendation.tier.tier}</span> · Score {recommendation.tier.totalScore}</p>
      </div>
      <div className="rounded-[1.25rem] border border-[#e8e0fb] bg-[#fbf9ff] p-4 text-sm leading-6 text-[#756d92] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
        <p><strong className="text-[#30284f] dark:text-white">Target:</strong> {formatMilestoneDisplayDate(selectedTargetDate)}</p>
        <p><strong className="text-[#30284f] dark:text-white">Aura deadline:</strong> {formatMilestoneDisplayDate(getMilestoneAuraDeadline(selectedTargetDate))}</p>
        <p><strong className="text-[#30284f] dark:text-white">Allowed range:</strong> {formatMilestoneDisplayDate(recommendation.target.allowedTargetDateMin)} through {formatMilestoneDisplayDate(recommendation.target.allowedTargetDateMax)}</p>
        <p><strong className="text-[#30284f] dark:text-white">Rules:</strong> {recommendation.rulesVersion}</p>
      </div>
    </div>
  );
}

export function MilestoneSetupModal({ localDate, onClose, onLock, onSuccess, task, timezone }: {
  localDate: string;
  onClose: () => void;
  onLock: (args: MilestoneLockArgs) => MutationResult;
  onSuccess: (milestone: Milestone) => void;
  task: Task;
  timezone: string;
}) {
  const [stage, setStage] = useState<SetupStage>("intro");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [draft, setDraft] = useState(createInitialMilestoneAnswersDraft);
  const [recommendation, setRecommendation] = useState<MilestoneRecommendationV1 | null>(null);
  const [selectedTier, setSelectedTier] = useState<MilestoneTier>("bronze");
  const [selectedTargetDate, setSelectedTargetDate] = useState("");
  const [tierRaiseExplanation, setTierRaiseExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);

  function buildRecommendation() {
    const answers = finalizeMilestoneAnswers(draft, localDate);
    const next = buildMilestoneRecommendation(answers, localDate);
    setRecommendation(next);
    setSelectedTier(next.tier.tier);
    setSelectedTargetDate(next.target.recommendedTargetDate);
    setTierRaiseExplanation("");
    setStage("recommendation");
  }

  function goBack() {
    setError(null);
    if (stage === "confirm") return setStage("recommendation");
    if (stage === "recommendation") {
      setQuestionIndex(8);
      return setStage("questions");
    }
    if (stage === "questions" && questionIndex > 0) return setQuestionIndex((value) => value - 1);
    setStage("intro");
  }

  async function confirmLock() {
    if (!recommendation || pending) return;
    const adjustmentError = validateMilestoneAdjustment({
      allowedMax: recommendation.target.allowedTargetDateMax,
      allowedMin: recommendation.target.allowedTargetDateMin,
      recommendedTier: recommendation.tier.tier,
      selectedTargetDate,
      selectedTier,
      tierRaiseExplanation,
    });
    if (adjustmentError) return setError(adjustmentError);
    const nextOperationId = getOrCreateMilestoneOperationId(operationId, createBrowserUuidV4);
    setOperationId(nextOperationId);
    setPending(true);
    setError(null);
    const result = await onLock(buildMilestoneLockArgs({ answers: recommendation.answers, completionTimezone: timezone, operationId: nextOperationId, recommendation, selectedTargetDate, selectedTier, task, tierRaiseExplanation }));
    setPending(false);
    if (result.error || !result.milestone) return setError(formatMilestoneRpcError(result.error ?? "Unknown lock error"));
    onSuccess(result.milestone);
  }

  return (
    <ModalShell className="adhdice-scrollbar max-h-[92vh] w-full max-w-[44rem] overflow-y-auto rounded-[2rem] border border-[#ece8f8] bg-white p-5 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label="Milestone setup" onClose={pending ? undefined : onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#7b63f7] dark:text-[#c9bbff]">Milestone setup</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#242044] dark:text-white">{task.title}</h2>
        </div>
        <button aria-label="Close Milestone setup" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e4deef] text-[#8a82a7]" disabled={pending} onClick={onClose} type="button"><X className="h-4 w-4" /></button>
      </div>

      {stage === "intro" ? (
        <div className="mt-5 space-y-4 text-sm leading-6 text-[#756d92] dark:text-white/60">
          <p>Milestones turn finite, meaningful goals into a locked trophy tier and target date.</p>
          <p>Completing by the target—or within the three-day aura grace period—will qualify for the timely aura once awards are enabled.</p>
          <p>Tier and target lock at confirmation. One setup correction is available during the first 24 hours.</p>
          {task.due_on ? <p className="rounded-[1rem] bg-[#f8f5ff] px-3 py-2 dark:bg-white/[0.04]">Task due date: {formatMilestoneDisplayDate(task.due_on)}. It stays separate and will not be selected automatically.</p> : null}
        </div>
      ) : stage === "questions" ? (
        <div className="mt-5">
          <p className="text-sm font-medium text-[#7b63f7] dark:text-[#c9bbff]">Question {questionIndex + 1} of 9</p>
          <h3 className="mt-2 text-xl font-semibold text-[#2f294a] dark:text-white">{QUESTION_TITLES[questionIndex]}</h3>
          <div className="mt-5"><QuestionContent draft={draft} onChange={(next) => { setDraft(next); setError(null); }} questionIndex={questionIndex} /></div>
        </div>
      ) : recommendation ? (
        <div className="mt-5 space-y-4">
          <RecommendationSummary recommendation={recommendation} selectedTargetDate={selectedTargetDate} selectedTier={selectedTier} />
          <p className="text-sm leading-6 text-[#756d92] dark:text-white/60">{recommendation.tier.explanation}</p>
          {recommendation.target.feasibilityWarning ? <p className="rounded-[1rem] border border-[#f3d89b] bg-[#fff8e8] px-3 py-2 text-sm text-[#7b5b12] dark:border-[#5c4920] dark:bg-[#362814] dark:text-[#f3d38a]">{recommendation.target.feasibilityWarning}</p> : null}
          <p className="text-sm text-[#756d92] dark:text-white/60">The ordinary task due date remains separate and editable.</p>
          {stage === "recommendation" ? (
            <div className="rounded-[1.25rem] border border-[#ece6fa] p-4 dark:border-white/10">
              <p className="mb-3 text-sm font-semibold text-[#30284f] dark:text-white">Adjust before locking</p>
              <ChoiceGroup onChange={setSelectedTier} options={TIERS.map((tier) => ({ label: tier[0]!.toUpperCase() + tier.slice(1), value: tier }))} value={selectedTier} />
              {isTierAbove(selectedTier, recommendation.tier.tier) ? <textarea aria-label="Tier raise explanation" className={`${TASK_TABLE_INPUT_CLASS} mt-3 min-h-20`} onChange={(event) => setTierRaiseExplanation(event.target.value)} placeholder="Why does this deserve a higher tier?" value={tierRaiseExplanation} /> : null}
              <label className="mt-3 block text-sm text-[#756d92] dark:text-white/60">Target date
                <input className={`${TASK_TABLE_INPUT_CLASS} mt-1`} max={recommendation.target.allowedTargetDateMax} min={recommendation.target.allowedTargetDateMin} onChange={(event) => setSelectedTargetDate(event.target.value)} type="date" value={selectedTargetDate} />
              </label>
            </div>
          ) : (
            <p className="rounded-[1rem] bg-[#f8f5ff] px-3 py-2 text-sm text-[#5f557c] dark:bg-white/[0.04] dark:text-white/60">Confirming creates the Milestone, audit events, and durable reminder schedule through the authoritative lock operation.</p>
          )}
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded-[1rem] border border-[#ffd6de] bg-[#fff1f3] px-3 py-2 text-sm text-[#b64055] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]">{error}</p> : null}
      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <TaskTableChipButton disabled={pending} onClick={stage === "intro" ? onClose : goBack}> {stage === "intro" ? "Cancel" : "Back"} </TaskTableChipButton>
        <TaskTableChipButton
          className={TASK_TABLE_ICON_LABEL_GAP_CLASS}
          disabled={pending}
          onClick={() => {
            setError(null);
            if (stage === "intro") return setStage("questions");
            if (stage === "questions") {
              const validationError = validateMilestoneQuestion(draft, questionIndex, localDate);
              if (validationError) return setError(validationError);
              if (questionIndex < 8) return setQuestionIndex((value) => value + 1);
              return buildRecommendation();
            }
            if (stage === "recommendation") {
              const validationError = recommendation ? validateMilestoneAdjustment({ allowedMax: recommendation.target.allowedTargetDateMax, allowedMin: recommendation.target.allowedTargetDateMin, recommendedTier: recommendation.tier.tier, selectedTargetDate, selectedTier, tierRaiseExplanation }) : "Recommendation unavailable.";
              if (validationError) return setError(validationError);
              return setStage("confirm");
            }
            void confirmLock();
          }}
          toneClassName="border-[#6f57f6] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff]"
        >
          {pending ? "Locking…" : stage === "confirm" ? "Lock Milestone" : stage === "recommendation" ? "Review confirmation" : "Next"}
        </TaskTableChipButton>
      </div>
    </ModalShell>
  );
}

export function MilestoneCorrectionModal({ milestone, onClose, onCorrect, onSuccess }: {
  milestone: Milestone;
  onClose: () => void;
  onCorrect: (args: MilestoneCorrectionArgs) => MutationResult;
  onSuccess: (milestone: Milestone) => void;
}) {
  const [selectedTier, setSelectedTier] = useState<MilestoneTier>(milestone.current_tier);
  const [selectedTargetDate, setSelectedTargetDate] = useState(milestone.current_target_date);
  const [tierRaiseExplanation, setTierRaiseExplanation] = useState(milestone.tier_raise_explanation ?? "");
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const adjustmentError = useMemo(() => validateMilestoneAdjustment({ allowedMax: milestone.allowed_target_date_max, allowedMin: milestone.allowed_target_date_min, recommendedTier: milestone.recommended_tier, selectedTargetDate, selectedTier, tierRaiseExplanation }), [milestone, selectedTargetDate, selectedTier, tierRaiseExplanation]);

  async function submit() {
    if (pending) return;
    if (adjustmentError) return setError(adjustmentError);
    if (selectedTier === milestone.current_tier && selectedTargetDate === milestone.current_target_date) return setError("Change the tier, target date, or both.");
    const nextOperationId = getOrCreateMilestoneOperationId(operationId, createBrowserUuidV4);
    setOperationId(nextOperationId);
    setPending(true);
    const result = await onCorrect(buildMilestoneCorrectionArgs({ milestone, operationId: nextOperationId, selectedTargetDate, selectedTier, tierRaiseExplanation }));
    setPending(false);
    if (result.error || !result.milestone) return setError(formatMilestoneRpcError(result.error ?? "Unknown correction error"));
    onSuccess(result.milestone);
  }

  return (
    <ModalShell className="w-full max-w-[40rem] rounded-[2rem] border border-[#ece8f8] bg-white p-5 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label="Correct Milestone setup" onClose={pending ? undefined : onClose}>
      <h2 className="text-2xl font-semibold text-[#242044] dark:text-white">Correct Milestone setup</h2>
      <div className="mt-3 rounded-[1rem] bg-[#f8f5ff] px-3 py-2 text-sm leading-6 text-[#756d92] dark:bg-white/[0.04] dark:text-white/60">
        <p>Original recommendation: <span className="capitalize">{milestone.recommended_tier}</span> · {formatMilestoneDisplayDate(milestone.recommended_target_date)}</p>
        <p>Initially locked: <span className="capitalize">{milestone.initial_locked_tier}</span> · {formatMilestoneDisplayDate(milestone.initial_locked_target_date)}</p>
      </div>
      <div className="mt-4 space-y-4">
        <ChoiceGroup onChange={setSelectedTier} options={TIERS.map((tier) => ({ label: tier[0]!.toUpperCase() + tier.slice(1), value: tier }))} value={selectedTier} />
        {isTierAbove(selectedTier, milestone.recommended_tier) ? <textarea aria-label="Correction tier raise explanation" className={`${TASK_TABLE_INPUT_CLASS} min-h-20`} onChange={(event) => setTierRaiseExplanation(event.target.value)} placeholder="Why does this deserve a higher tier?" value={tierRaiseExplanation} /> : null}
        <label className="block text-sm text-[#756d92] dark:text-white/60">Target date · allowed {formatMilestoneDisplayDate(milestone.allowed_target_date_min)} through {formatMilestoneDisplayDate(milestone.allowed_target_date_max)}
          <input className={`${TASK_TABLE_INPUT_CLASS} mt-1`} disabled={milestone.deadline_kind === "firm"} max={milestone.allowed_target_date_max} min={milestone.allowed_target_date_min} onChange={(event) => setSelectedTargetDate(event.target.value)} type="date" value={selectedTargetDate} />
        </label>
        <p className="text-sm text-[#756d92] dark:text-white/60">Aura deadline: {formatMilestoneDisplayDate(getMilestoneAuraDeadline(selectedTargetDate))}. This correction does not restart the original 24-hour window.</p>
      </div>
      {error ? <p className="mt-4 text-sm text-[#b64055] dark:text-[#ff9eaf]">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <TaskTableChipButton disabled={pending} onClick={onClose}>Cancel</TaskTableChipButton>
        <TaskTableChipButton disabled={pending} onClick={() => { void submit(); }} toneClassName="border-[#6f57f6] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff]">{pending ? "Saving…" : "Save correction"}</TaskTableChipButton>
      </div>
    </ModalShell>
  );
}

export function DetachAndPromoteMilestoneModal({ onCancel, onConfirm, pending, task }: {
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  task: Task;
}) {
  return (
    <ModalShell className="w-full max-w-lg rounded-[2rem] border border-[#ece8f8] bg-white p-6 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label="Detach and promote to Milestone" onClose={pending ? undefined : onCancel}>
      <h2 className="text-2xl font-semibold text-[#242044] dark:text-white">Detach and promote to Milestone?</h2>
      <div className="mt-4 space-y-3 text-sm leading-6 text-[#756d92] dark:text-white/60">
        <p><strong className="text-[#30284f] dark:text-white">{task.title}</strong> will become a parent task while retaining the same task identity and metadata.</p>
        <p>Canceling Milestone setup afterward will not automatically reattach it.</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <TaskTableChipButton disabled={pending} onClick={onCancel}>Cancel</TaskTableChipButton>
        <TaskTableChipButton disabled={pending} onClick={onConfirm} toneClassName="border-[#6f57f6] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff]">{pending ? "Detaching…" : "Detach and continue"}</TaskTableChipButton>
      </div>
    </ModalShell>
  );
}

"use client";

import { LockKeyhole, Trophy } from "lucide-react";
import { useState } from "react";
import type { Milestone, Task } from "@/lib/database.types";
import { TASK_TABLE_ICON_LABEL_GAP_CLASS, TaskTableChipButton } from "@/components/ui/task-table-primitives";
import { canCorrectMilestoneSetup, formatMilestoneDisplayDate, getMilestoneCompletionPresentation, getMilestoneTimingSummary } from "@/lib/milestones";

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.getMonth() + 1}-${date.getDate()}-${String(date.getFullYear()).slice(-2)}`;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return "Not answered";
  if (typeof value === "string" || typeof value === "number") return humanize(String(value));
  if (typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  if (record.kind === "duration") return `${record.value} ${record.unit}`;
  if (record.kind === "hours_per_week") return `${record.hours} hours per week`;
  if (record.kind === "target_date") return `Target date ${formatMilestoneDisplayDate(String(record.targetDate))}`;
  if ((record.kind === "preferred" || record.kind === "firm") && record.date) return `${humanize(String(record.kind))}: ${formatMilestoneDisplayDate(String(record.date))}`;
  if (record.kind) return humanize(String(record.kind));
  return "Saved";
}

const ANSWER_LABELS: Array<[string, string]> = [
  ["estimatedDuration", "Estimated duration"],
  ["weeklyCapacity", "Weekly capacity"],
  ["difficulty", "Difficulty"],
  ["meaning", "Meaning"],
  ["complexity", "Complexity"],
  ["timelinePredictability", "Timeline predictability"],
  ["currentProgress", "Current progress"],
  ["workFrequency", "Work frequency"],
  ["externalDeadline", "External deadline"],
];

export function MilestoneInspectorSection({ localDate, milestone, nowMs, onAbandon, onComplete, onCorrect, onPromote, onReverse, promotionBlockedReason, task }: {
  localDate: string;
  milestone: Milestone | null;
  nowMs: number;
  onAbandon: () => void;
  onComplete: () => void;
  onCorrect: () => void;
  onPromote: () => void;
  onReverse: () => void;
  promotionBlockedReason?: string | null;
  task: Task;
}) {
  const [showAnswers, setShowAnswers] = useState(false);
  if (!milestone) {
    return (
      <section className="min-w-0 max-w-full rounded-[1.25rem] border border-[#ede7f7] bg-white px-5 py-4 shadow-[0_18px_45px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#1b1530]">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">Milestone</p>
        {promotionBlockedReason ? <p className="mt-2 text-sm leading-6 text-[#7d7597] dark:text-white/55">{promotionBlockedReason}</p> : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#7d7597] dark:text-white/55">Promote this finite parent task without changing its task identity.</p>
            <TaskTableChipButton className={TASK_TABLE_ICON_LABEL_GAP_CLASS} onClick={onPromote} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"><Trophy aria-hidden="true" className="h-3.5 w-3.5" />Promote to Milestone</TaskTableChipButton>
          </div>
        )}
      </section>
    );
  }

  if (milestone.status === "completed") {
    const presentation = getMilestoneCompletionPresentation(milestone);
    return (
      <section className="min-w-0 max-w-full rounded-[1.25rem] border border-[#ded3fb] bg-[#fcfaff] px-5 py-4 shadow-[0_18px_45px_rgba(81,61,168,0.12)] dark:border-[#44366f] dark:bg-[#1d1635]">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#7b63f7] dark:text-[#c9bbff]">Completed Milestone</p>
        <div className="mt-3 flex flex-wrap items-center gap-2"><Trophy aria-hidden="true" className="h-5 w-5 text-[#6f57f6]" /><span className="font-semibold capitalize text-[#30284f] dark:text-white">{milestone.current_tier} trophy</span><span className="text-sm text-[#7d7597] dark:text-white/55">{presentation.aura}</span></div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-[#9b92be]">Classification</p><p className="mt-1 font-medium">{presentation.classification}</p></div>
          <div><p className="text-[#9b92be]">Completed</p><p className="mt-1 font-medium">{milestone.completion_date_key ? formatMilestoneDisplayDate(milestone.completion_date_key) : "Date unavailable"}</p></div>
          <div><p className="text-[#9b92be]">Target</p><p className="mt-1 font-medium">{formatMilestoneDisplayDate(milestone.current_target_date)}</p></div>
          <div><p className="text-[#9b92be]">Aura deadline</p><p className="mt-1 font-medium">{formatMilestoneDisplayDate(milestone.current_aura_deadline)}</p></div>
        </div>
        <p className="mt-3 text-sm text-[#7d7597] dark:text-white/55">{presentation.dayDetail}</p>
        {milestone.task_id ? <TaskTableChipButton className="mt-4" onClick={onReverse}>Undo Milestone completion</TaskTableChipButton> : <p className="mt-4 text-xs text-[#9189aa]">The task was permanently deleted; its trophy record is preserved.</p>}
      </section>
    );
  }

  if (milestone.status === "abandoned") {
    return (
      <section className="min-w-0 max-w-full rounded-[1.25rem] border border-[#ece7f5] bg-white px-5 py-4 dark:border-white/10 dark:bg-[#1b1530]">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be]">Milestone</p>
        <p className="mt-2 font-semibold text-[#40385f] dark:text-white/75">Abandoned</p>
        <p className="mt-2 text-sm text-[#7d7597] dark:text-white/55">{milestone.abandoned_at ? formatTimestamp(milestone.abandoned_at) : "Date unavailable"}{milestone.abandonment_reason ? ` · ${humanize(milestone.abandonment_reason)}` : ""}</p>
        <p className="mt-2 text-sm capitalize text-[#7d7597] dark:text-white/55">Original: {milestone.initial_locked_tier} · {formatMilestoneDisplayDate(milestone.initial_locked_target_date)}</p>
      </section>
    );
  }

  const timing = getMilestoneTimingSummary(milestone, localDate);
  const correctionAvailable = canCorrectMilestoneSetup(milestone, nowMs);
  const answers = milestone.answers_snapshot;
  return (
    <section className="min-w-0 max-w-full rounded-[1.25rem] border border-[#ded3fb] bg-[#fcfaff] px-5 py-4 shadow-[0_18px_45px_rgba(81,61,168,0.12)] dark:border-[#44366f] dark:bg-[#1d1635]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#7b63f7] dark:text-[#c9bbff]">Milestone</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span aria-label={`${milestone.current_tier} trophy`} className="inline-flex items-center gap-1.5 rounded-full border border-[#ddd2ff] bg-[#f1ecff] px-2 py-1 text-[13px] font-medium capitalize text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"><Trophy aria-hidden="true" className="h-3.5 w-3.5" />{milestone.current_tier}</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-[#7d7597] dark:text-white/55"><LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />Locked</span>
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold text-[#30284f] dark:text-white">{timing.label}</p>
          <p className="mt-1 text-[#7d7597] dark:text-white/55">{timing.detail}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-[#9b92be] dark:text-white/35">Target</p><p className="mt-1 font-medium text-[#40385f] dark:text-white/75">{formatMilestoneDisplayDate(milestone.current_target_date)}</p></div>
        <div><p className="text-[#9b92be] dark:text-white/35">Aura deadline</p><p className="mt-1 font-medium text-[#40385f] dark:text-white/75">{formatMilestoneDisplayDate(milestone.current_aura_deadline)}</p></div>
        <div><p className="text-[#9b92be] dark:text-white/35">Recommended</p><p className="mt-1 font-medium capitalize text-[#40385f] dark:text-white/75">{milestone.recommended_tier} · {formatMilestoneDisplayDate(milestone.recommended_target_date)}</p></div>
        <div><p className="text-[#9b92be] dark:text-white/35">Promoted / locked</p><p className="mt-1 font-medium text-[#40385f] dark:text-white/75">{formatTimestamp(milestone.locked_at)}</p></div>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#6f6788] dark:text-white/60">{milestone.rules_explanation}</p>
      {milestone.feasibility_warning ? <p className="mt-3 rounded-[1rem] border border-[#f3d89b] bg-[#fff8e8] px-3 py-2 text-sm text-[#7b5b12] dark:border-[#5c4920] dark:bg-[#362814] dark:text-[#f3d38a]">{milestone.feasibility_warning}</p> : null}
      {milestone.tier_raise_explanation ? <p className="mt-3 text-sm text-[#6f6788] dark:text-white/60"><strong>Tier raise:</strong> {milestone.tier_raise_explanation}</p> : null}
      <p className="mt-3 text-xs text-[#9189aa] dark:text-white/40">{milestone.questions_version} · {milestone.rules_version} · Task due date remains separate.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <TaskTableChipButton onClick={onComplete} toneClassName="border-[#6f57f6] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff]">Complete Milestone</TaskTableChipButton>
        <TaskTableChipButton onClick={onAbandon}>Abandon Milestone</TaskTableChipButton>
        <TaskTableChipButton onClick={() => setShowAnswers((value) => !value)}>{showAnswers ? "Hide setup answers" : "View setup answers"}</TaskTableChipButton>
        {correctionAvailable ? <TaskTableChipButton onClick={onCorrect} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">Correct Milestone setup</TaskTableChipButton> : null}
      </div>
      {showAnswers ? (
        <dl className="mt-4 grid gap-2 rounded-[1rem] border border-[#ece6fa] bg-white/70 p-3 text-sm dark:border-white/10 dark:bg-white/[0.03] sm:grid-cols-2">
          {ANSWER_LABELS.map(([key, label]) => <div key={key}><dt className="text-[#9b92be] dark:text-white/35">{label}</dt><dd className="mt-0.5 text-[#4f476d] dark:text-white/70">{formatAnswer(answers[key])}</dd></div>)}
        </dl>
      ) : null}
      {!correctionAvailable && !milestone.setup_correction_used && milestone.status === "active" ? <p className="mt-3 text-xs text-[#9189aa] dark:text-white/40">The 24-hour setup-correction window has expired.</p> : null}
      {milestone.setup_correction_used ? <p className="mt-3 text-xs text-[#9189aa] dark:text-white/40">The one-time setup correction was used.</p> : null}
      <span className="sr-only">Task: {task.title}</span>
    </section>
  );
}

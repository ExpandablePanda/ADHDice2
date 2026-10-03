"use client";

import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import { OperationProgressBar } from "./operation-progress";
import { useState } from "react";
import type { HealthProfile, Task } from "@/lib/database.types";
import {
  getBatchIntakeTaskCandidates,
  isBatchIntakeTaskSelectable,
  setBatchIntakeTaskSelection,
} from "@/lib/home-batch-intake-matching";
import {
  getBatchIntakeApplyCount,
  isBatchIntakeTaskDraftReady,
  isBatchIntakeWaterDraftReady,
  isBatchIntakeWeightDraftReady,
  type BatchIntakeApplyProgress,
  type BatchIntakeExecutionResult,
} from "@/lib/home-batch-intake-executor";
import type {
  BatchIntakeDraft,
  BatchIntakeTaskDraft,
  BatchIntakeWaterDraft,
  BatchIntakeWeightDraft,
} from "@/lib/home-batch-intake";

type Props = {
  drafts: BatchIntakeDraft[];
  tasks: Task[];
  healthProfile: HealthProfile | null;
  healthLoading: boolean;
  onChange: (draft: BatchIntakeDraft) => void;
  onCancel: () => void;
  onApply: () => void;
  isApplying: boolean;
  applyProgress: BatchIntakeApplyProgress | null;
  executionResult: BatchIntakeExecutionResult | null;
};

function resultFor(result: BatchIntakeExecutionResult | null, rowId: string) {
  return result?.rows.find((row) => row.rowId === rowId) ?? null;
}

function statusText(status: ReturnType<typeof resultFor>) {
  if (!status) return null;
  return status.status === "applied" ? "Applied" : status.status === "failed" ? `Failed: ${status.error}` : "Skipped";
}

function batchIntakeStageLabel(stage: NonNullable<Props["applyProgress"]>["stage"]) {
  if (stage === "tasks") return "Task History";
  if (stage === "water") return "Water";
  if (stage === "weight") return "Weight";
  return "Complete";
}

function taskDraftWithSelection(draft: BatchIntakeTaskDraft, taskId: string | null, tasks: Task[]) {
  return setBatchIntakeTaskSelection(draft, taskId, tasks);
}

function draftWithDate(draft: BatchIntakeDraft, value: string): BatchIntakeDraft {
  return {
    ...draft,
    date: value || null,
    issues: value ? draft.issues.filter((issue) => issue !== "Missing date heading") : [...draft.issues.filter((issue) => issue !== "Missing date heading"), "Missing date heading"],
  };
}

function TaskReviewRow({ draft, tasks, result, onChange }: { draft: BatchIntakeTaskDraft; tasks: Task[]; result: ReturnType<typeof resultFor>; onChange: (draft: BatchIntakeTaskDraft) => void }) {
  const [taskSearch, setTaskSearch] = useState(draft.taskTitle);
  const candidates = getBatchIntakeTaskCandidates(taskSearch, tasks);
  const selected = tasks.find((task) => task.id === draft.selectedTaskId);
  return (
    <div className="grid gap-2 rounded-xl border border-[#ece8f8] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start gap-2">
        <input aria-label={`Include task ${draft.taskTitle}`} checked={draft.included} onChange={(event) => onChange({ ...draft, included: event.target.checked })} type="checkbox" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[#332c55] dark:text-white">Task · {draft.taskTitle || "Untitled"}</p>
          <p className="text-[11px] text-[#8b82a7] dark:text-white/50">{draft.sourceText} · line {draft.sourceLineNumber}</p>
        </div>
        {statusText(result) ? <span className="text-[11px] font-semibold text-[#23815b]">{statusText(result)}</span> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
        <div>
          <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Canonical Task
            <input
              aria-label={`Search canonical Task for ${draft.taskTitle}`}
              className="health-input h-9"
              onChange={(event) => {
                setTaskSearch(event.target.value);
                const exact = tasks.filter((task) => isBatchIntakeTaskSelectable(task) && task.title.trim().toLocaleLowerCase() === event.target.value.trim().toLocaleLowerCase());
                onChange(taskDraftWithSelection(draft, exact.length === 1 ? exact[0].id : null, tasks));
              }}
              placeholder="Search existing Tasks"
              value={taskSearch}
            />
            {selected ? <p className="mt-1 text-[11px] text-[#5d49d6]">Selected: {selected.title}</p> : null}
          </label>
          {candidates.length > 0 ? (
            <div className="mt-1 grid max-h-28 gap-1 overflow-y-auto">
              {candidates.map(({ task, context }) => (
                <button className={`rounded-md px-2 py-1 text-left text-[11px] ${task.id === draft.selectedTaskId ? "bg-[#eee8ff] text-[#5d49d6]" : "bg-[#faf8fe] text-[#6f6787] hover:bg-[#f0ebff] dark:bg-white/5 dark:text-white/65"}`} key={task.id} onClick={() => onChange(taskDraftWithSelection(draft, task.id, tasks))} type="button">
                  <span className="block font-semibold">{task.title}</span>
                  <span className="block opacity-75">{context}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Outcome
          <select className="health-input h-9" onChange={(event) => onChange({ ...draft, outcome: event.target.value === "none" ? null : event.target.value as BatchIntakeTaskDraft["outcome"] })} value={draft.outcome ?? "none"}>
            <option value="none">No change</option>
            <option value="done">Done</option>
            <option value="did_my_best">Did My Best</option>
            <option value="missed">Missed</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Date
          <input className="health-input h-9" onChange={(event) => onChange({ ...draft, date: event.target.value || null, issues: event.target.value ? draft.issues.filter((issue) => issue !== "Missing date heading") : [...draft.issues.filter((issue) => issue !== "Missing date heading"), "Missing date heading"] })} type="date" value={draft.date ?? ""} />
        </label>
      </div>
      {draft.issues.length > 0 ? <p className="text-[11px] text-[#b34860]">{draft.issues.join(" · ")}</p> : null}
    </div>
  );
}

function WaterReviewRow({ draft, result, onChange }: { draft: BatchIntakeWaterDraft; result: ReturnType<typeof resultFor>; onChange: (draft: BatchIntakeWaterDraft) => void }) {
  return (
    <div className="grid gap-2 rounded-xl border border-[#ece8f8] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start gap-2">
        <input aria-label={`Include water ${draft.sourceText}`} checked={draft.included} onChange={(event) => onChange({ ...draft, included: event.target.checked })} type="checkbox" />
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[#332c55] dark:text-white">Water</p><p className="text-[11px] text-[#8b82a7] dark:text-white/50">{draft.sourceText} · line {draft.sourceLineNumber}</p></div>
        {statusText(result) ? <span className="text-[11px] font-semibold text-[#23815b]">{statusText(result)}</span> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-[8rem_10rem_minmax(0,1fr)]">
        <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Amount<input className="health-input h-9" min="0" onChange={(event) => { const amount = Number(event.target.value) || null; onChange({ ...draft, amount, issues: amount && amount > 0 ? draft.issues.filter((issue) => issue !== "Choose a positive water amount") : [...draft.issues.filter((issue) => issue !== "Choose a positive water amount"), "Choose a positive water amount"] }); }} step="0.1" type="number" value={draft.amount ?? ""} /></label>
        <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Status<select className="health-input h-9" onChange={(event) => onChange({ ...draft, status: event.target.value === "pending" ? "pending" : event.target.value === "confirmed" ? "confirmed" : null, issues: event.target.value ? draft.issues.filter((issue) => issue !== "Choose Pending or Confirmed") : [...draft.issues.filter((issue) => issue !== "Choose Pending or Confirmed"), "Choose Pending or Confirmed"] })} value={draft.status ?? ""}><option value="">Choose…</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option></select></label>
        <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Date<input className="health-input h-9" onChange={(event) => onChange({ ...draft, date: event.target.value || null, issues: event.target.value ? draft.issues.filter((issue) => issue !== "Missing date heading") : [...draft.issues.filter((issue) => issue !== "Missing date heading"), "Missing date heading"] })} type="date" value={draft.date ?? ""} /></label>
      </div>
      <p className="text-[11px] text-[#8b82a7]">Unit: fl oz · confirmed rows use a neutral local-noon timestamp because the source has no exact time.</p>
      {draft.issues.length > 0 ? <p className="text-[11px] text-[#b34860]">{draft.issues.join(" · ")}</p> : null}
    </div>
  );
}

function WeightReviewRow({ draft, profile, result, onChange }: { draft: BatchIntakeWeightDraft; profile: HealthProfile | null; result: ReturnType<typeof resultFor>; onChange: (draft: BatchIntakeWeightDraft) => void }) {
  const displayUnit = draft.unit ?? profile?.preferred_weight_unit ?? null;
  return (
    <div className="grid gap-2 rounded-xl border border-[#ece8f8] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start gap-2"><input aria-label={`Include weight ${draft.sourceText}`} checked={draft.included} onChange={(event) => onChange({ ...draft, included: event.target.checked })} type="checkbox" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[#332c55] dark:text-white">Weight</p><p className="text-[11px] text-[#8b82a7] dark:text-white/50">{draft.sourceText} · line {draft.sourceLineNumber}</p></div>{statusText(result) ? <span className="text-[11px] font-semibold text-[#23815b]">{statusText(result)}</span> : null}</div>
      <div className="grid gap-2 sm:grid-cols-[8rem_10rem_minmax(0,1fr)]">
        <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Value<input className="health-input h-9" min="0" onChange={(event) => { const value = Number(event.target.value) || null; onChange({ ...draft, value, issues: value && value > 0 ? draft.issues.filter((issue) => issue !== "Choose a positive weight value") : [...draft.issues.filter((issue) => issue !== "Choose a positive weight value"), "Choose a positive weight value"] }); }} step="0.1" type="number" value={draft.value ?? ""} /></label>
        <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Unit<select className="health-input h-9" onChange={(event) => onChange({ ...draft, unit: event.target.value === "lb" || event.target.value === "kg" ? event.target.value : null, unitSource: event.target.value ? "explicit" : "missing", issues: draft.issues.filter((issue) => issue !== "Health preferred weight unit is not ready") })} value={displayUnit ?? ""}><option value="">Choose…</option><option value="lb">lb</option><option value="kg">kg</option></select></label>
        <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Date<input className="health-input h-9" onChange={(event) => onChange({ ...draft, date: event.target.value || null, issues: event.target.value ? draft.issues.filter((issue) => issue !== "Missing date heading") : [...draft.issues.filter((issue) => issue !== "Missing date heading"), "Missing date heading"] })} type="date" value={draft.date ?? ""} /></label>
      </div>
      <p className="text-[11px] text-[#8b82a7]">{(draft.unitSource === "profile" || (draft.unitSource === "missing" && displayUnit !== null)) ? `Unit resolved from Health profile: ${displayUnit}.` : "Canonical storage uses kilograms; the selected display unit is shown above."}</p>
      {draft.issues.filter((issue) => !(issue === "Health preferred weight unit is not ready" && displayUnit)).length > 0 ? <p className="text-[11px] text-[#b34860]">{draft.issues.filter((issue) => !(issue === "Health preferred weight unit is not ready" && displayUnit)).join(" · ")}</p> : null}
    </div>
  );
}

export function HomeBatchIntakeReview({ applyProgress, drafts, tasks, healthProfile, healthLoading, onChange, onCancel, onApply, isApplying, executionResult }: Props) {
  const preferredWeightUnit = healthProfile?.preferred_weight_unit ?? null;
  const applyCount = getBatchIntakeApplyCount(drafts, { preferredWeightUnit });
  const healthRows = drafts.filter((draft) => draft.kind === "water" || draft.kind === "weight");
  const healthReady = healthRows.length === 0 || (!healthLoading && Boolean(healthProfile));
  const counts = {
    task: drafts.filter((draft) => draft.kind === "task").length,
    water: drafts.filter((draft) => draft.kind === "water").length,
    weight: drafts.filter((draft) => draft.kind === "weight").length,
    meal: drafts.filter((draft) => draft.kind === "meal").length,
    unsupported: drafts.filter((draft) => draft.kind === "unsupported").length,
    needsReview: drafts.filter((draft) => draft.issues.length > 0).length,
  };
  const groupedDates = [...new Set(drafts.map((draft) => draft.date ?? "needs-date"))].sort();
  const isReady = (draft: BatchIntakeDraft) => draft.kind === "task" ? isBatchIntakeTaskDraftReady(draft) : draft.kind === "water" ? isBatchIntakeWaterDraftReady(draft) : draft.kind === "weight" ? isBatchIntakeWeightDraftReady(draft, preferredWeightUnit) : false;

  return (
    <AdhdPanel className="mt-3" padding="md" title="Batch Intake Review" subtitle="Review proposed records before anything is written. Your Scratchpad text stays unchanged.">
      <div className="grid gap-2 text-xs text-[#6f6787] dark:text-white/65 sm:grid-cols-3">
        <p>Dates {new Set(drafts.map((draft) => draft.date).filter(Boolean)).size}</p><p>Tasks {counts.task}</p><p>Water {counts.water}</p><p>Weight {counts.weight}</p><p>Meals {counts.meal} · review only</p><p>Unsupported {counts.unsupported}</p>
      </div>
      <div className="mt-3 rounded-lg bg-[#faf8fe] px-3 py-2 text-xs text-[#625b7b] dark:bg-white/5 dark:text-white/70">Ready to apply: <strong>{applyCount}</strong> · Needs review: {counts.needsReview} · Excluded or review-only rows are not counted.</div>
      {applyProgress ? (
        <div className="mt-3 rounded-lg border border-[#e7e0fb] bg-white/70 px-3 py-2 text-[#5f5878] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/75">
          <p className="text-xs font-semibold">Applying Batch Intake</p>
          <OperationProgressBar progress={{ completed: applyProgress.processed, failed: applyProgress.failed, label: batchIntakeStageLabel(applyProgress.stage), total: applyProgress.total }} />
          <p className="mt-1 text-xs tabular-nums">{applyProgress.applied} applied{applyProgress.failed > 0 ? ` · ${applyProgress.failed} failed` : ""}</p>
        </div>
      ) : null}
      {healthRows.length > 0 && !healthReady ? <p className="mt-3 rounded-lg border border-[#f2d9a6] bg-[#fff9ed] px-3 py-2 text-xs text-[#8a641c]" role="status">{healthLoading ? "Loading Health authority…" : "Health profile is not ready. Health rows cannot be applied yet."}</p> : null}
      {executionResult?.rows.some((row) => row.status === "failed") ? <p className="mt-3 rounded-lg border border-[#ffd6de] bg-[#fff1f3] px-3 py-2 text-xs text-[#a53f56]" role="alert">Some rows failed. Successful rows remain Applied; failed rows stay visible and can be retried.</p> : null}
      <div className="mt-4 grid gap-4">
        {groupedDates.map((date) => (
          <section className="grid gap-2" key={date}>
            <h3 className="text-xs font-semibold text-[#5d49d6] dark:text-[#b8aaff]">{date === "needs-date" ? "Needs date" : date}</h3>
            {drafts.filter((draft) => (draft.date ?? "needs-date") === date).map((draft) => {
              const result = resultFor(executionResult, draft.id);
              if (draft.kind === "task") return <TaskReviewRow draft={draft} key={draft.id} onChange={onChange} result={result} tasks={tasks} />;
              if (draft.kind === "water") return <WaterReviewRow draft={draft} key={draft.id} onChange={onChange} result={result} />;
              if (draft.kind === "weight") return <WeightReviewRow draft={draft} key={draft.id} onChange={onChange} profile={healthProfile} result={result} />;
              if (draft.kind === "meal") return <div className="grid gap-2 rounded-xl border border-[#ece8f8] bg-[#fbfaff] p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]" key={draft.id}><div><p className="font-semibold text-[#332c55] dark:text-white">Meal · {draft.mealSlot}</p><p className="mt-1 text-[#6f6787] dark:text-white/65">{draft.rawText || "(no meal text)"}</p><p className="mt-2 text-[11px] text-[#8b82a7]">Needs nutrition matching — not applied in Phase 1.</p></div><label className="grid max-w-40 gap-1 text-[11px] font-medium text-[#7d7598]">Date<input className="health-input h-9" onChange={(event) => onChange(draftWithDate(draft, event.target.value))} type="date" value={draft.date ?? ""} /></label></div>;
              return <div className="grid gap-2 rounded-xl border border-dashed border-[#ddd6ee] bg-[#fcfbff] p-3 text-xs dark:border-white/15 dark:bg-white/[0.03]" key={draft.id}><div><p className="font-semibold text-[#6f6787] dark:text-white/75">Unsupported</p><p className="mt-1 text-[#6f6787] dark:text-white/65">{draft.sourceText}</p><p className="mt-1 text-[11px] text-[#8b82a7]">{draft.reason}</p></div><label className="grid max-w-40 gap-1 text-[11px] font-medium text-[#7d7598]">Date<input className="health-input h-9" onChange={(event) => onChange(draftWithDate(draft, event.target.value))} type="date" value={draft.date ?? ""} /></label></div>;
            })}
          </section>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <AdhdChip onClick={onCancel} type="button">Close review</AdhdChip>
        <AdhdChip disabled={isApplying || applyCount === 0 || !healthReady || drafts.some((draft) => draft.included && (draft.kind === "task" || draft.kind === "water" || draft.kind === "weight") && isReady(draft) === false && draft.issues.length === 0)} onClick={onApply} selected type="button">{isApplying ? "Applying…" : `Apply ${applyCount} changes`}</AdhdChip>
      </div>
    </AdhdPanel>
  );
}

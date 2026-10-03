"use client";

import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import { buildHealthMealLoggedAt } from "@/lib/health-utils";
import { OperationProgressBar } from "./operation-progress";
import { useState } from "react";
import type { HealthFoodLibraryItem, HealthMealSlot, HealthProfile, Task } from "@/lib/database.types";
import type { FocusCategory, HistoricalFocusSession } from "@/lib/types";
import { formatHealthFoodDisplayName, searchHealthFoodLibrary } from "@/lib/health-library";
import { mealFoodSelectionFromLibraryItem } from "@/lib/health-meal-draft";
import { getBatchIntakeTaskCandidates, isBatchIntakeTaskSelectable, setBatchIntakeTaskSelection } from "@/lib/home-batch-intake-matching";
import { getBatchIntakeApplyCount, isBatchIntakeFocusDraftReady, isBatchIntakeMealDraftReady, isBatchIntakeTaskDraftReady, isBatchIntakeWaterDraftReady, isBatchIntakeWeightDraftReady, type BatchIntakeApplyProgress, type BatchIntakeExecutionResult } from "@/lib/home-batch-intake-executor";
import type { BatchIntakeDraft, BatchIntakeFocusDraft, BatchIntakeManualKind, BatchIntakeManualMealDraft, BatchIntakeParsedMealDraft, BatchIntakeTaskDraft, BatchIntakeWaterDraft, BatchIntakeWeightDraft } from "@/lib/home-batch-intake";

type Props = {
  drafts: BatchIntakeDraft[];
  tasks: Task[];
  healthProfile: HealthProfile | null;
  healthFoods: HealthFoodLibraryItem[];
  healthLoading: boolean;
  focusCategories: FocusCategory[];
  focusHistory: HistoricalFocusSession[];
  onAddRow: (kind: BatchIntakeManualKind) => void;
  onAddAnother: (draft: BatchIntakeDraft) => void;
  onAddMealFromParsed: (draft: BatchIntakeParsedMealDraft, food: HealthFoodLibraryItem) => void;
  onChange: (draft: BatchIntakeDraft) => void;
  onRemoveRow: (rowId: string) => void;
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
  if (stage === "meals") return "Meals";
  if (stage === "focus") return "Focus Sessions";
  return "Complete";
}

function draftSource(draft: BatchIntakeDraft) {
  if (draft.kind === "meal" && draft.origin === "manual" && draft.sourceParsedMealId) {
    return `From parsed ${draft.mealSlot}: ${draft.sourceText}`;
  }
  return draft.origin === "parsed" && draft.sourceLineNumber !== null ? `${draft.sourceText} · line ${draft.sourceLineNumber}` : draft.sourceText;
}

function setIssue<T extends BatchIntakeDraft>(draft: T, issue: string, present: boolean): T {
  const issues = draft.issues.filter((candidate) => candidate !== issue);
  return { ...draft, issues: present ? [...issues, issue] : issues };
}

function withDate<T extends BatchIntakeDraft>(draft: T, value: string): T {
  return setIssue({ ...draft, date: value || null }, "Missing date heading", !value);
}

function withTimeIssue<T extends BatchIntakeDraft>(draft: T, valid: boolean) {
  return setIssue(draft, "Choose a valid date and time", !valid);
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function taskDraftWithSelection(draft: BatchIntakeTaskDraft, taskId: string | null, tasks: Task[]) {
  return setBatchIntakeTaskSelection(draft, taskId, tasks);
}

function RowHeader({ draft, result, label, onRemove, onAddAnother, onToggleIncluded, disabled = false }: { draft: BatchIntakeDraft; result: ReturnType<typeof resultFor>; label: string; onRemove?: () => void; onAddAnother?: () => void; onToggleIncluded?: (included: boolean) => void; disabled?: boolean }) {
  const locked = result?.status === "applied";
  return (
    <div className="flex items-start gap-2">
      <input aria-label={`Include ${label.toLowerCase()} ${draft.sourceText}`} checked={draft.included} disabled={locked} onChange={(event) => onToggleIncluded?.(event.target.checked)} type="checkbox" />
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[#332c55] dark:text-white">{label}</p><p className="text-[11px] text-[#8b82a7] dark:text-white/50">{draftSource(draft)}</p></div>
      {statusText(result) ? <span className={`text-[11px] font-semibold ${result?.status === "failed" ? "text-[#b34860]" : "text-[#23815b]"}`}>{statusText(result)}</span> : null}
      {onAddAnother ? <button aria-label={`Add another ${label.toLowerCase()} occurrence`} className="text-[11px] font-semibold text-[#5d49d6] hover:underline disabled:opacity-50" disabled={disabled && !locked} onClick={onAddAnother} type="button">+ Another</button> : null}
      {onRemove && !locked ? <button aria-label={`Remove ${label.toLowerCase()} row`} className="text-[11px] font-semibold text-[#b34860] hover:underline" onClick={onRemove} type="button">Remove</button> : null}
    </div>
  );
}

function TaskReviewRow({ draft, tasks, result, onChange, onRemove, onAddAnother, disabled }: { draft: BatchIntakeTaskDraft; tasks: Task[]; result: ReturnType<typeof resultFor>; onChange: (draft: BatchIntakeTaskDraft) => void; onRemove?: () => void; onAddAnother: () => void; disabled: boolean }) {
  const [taskSearch, setTaskSearch] = useState(draft.taskTitle);
  const candidates = getBatchIntakeTaskCandidates(taskSearch, tasks);
  const selected = tasks.find((task) => task.id === draft.selectedTaskId);
  return (
    <div className="grid gap-2 rounded-xl border border-[#ece8f8] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <RowHeader disabled={disabled} draft={draft} label="Task History" onAddAnother={onAddAnother} onRemove={draft.origin === "manual" ? onRemove : undefined} onToggleIncluded={(included) => onChange({ ...draft, included })} result={result} />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
        <div><label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Canonical Task
          <input aria-label={`Search canonical Task for ${draft.taskTitle}`} className="health-input h-9" disabled={disabled} onChange={(event) => { const value = event.target.value; setTaskSearch(value); const nextDraft = draft.origin === "manual" ? { ...draft, taskTitle: value } : draft; const exact = tasks.filter((task) => isBatchIntakeTaskSelectable(task) && task.title.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase()); onChange(taskDraftWithSelection(nextDraft, exact.length === 1 ? exact[0].id : null, tasks)); }} placeholder="Search existing Tasks" value={taskSearch} />
          {selected ? <p className="mt-1 text-[11px] text-[#5d49d6]">Selected: {selected.title}</p> : null}</label>
          {candidates.length > 0 ? <div className="mt-1 grid max-h-28 gap-1 overflow-y-auto">{candidates.map(({ task, context }) => <button className={`rounded-md px-2 py-1 text-left text-[11px] ${task.id === draft.selectedTaskId ? "bg-[#eee8ff] text-[#5d49d6]" : "bg-[#faf8fe] text-[#6f6787] hover:bg-[#f0ebff] dark:bg-white/5 dark:text-white/65"}`} disabled={disabled} key={task.id} onClick={() => onChange(taskDraftWithSelection(draft, task.id, tasks))} type="button"><span className="block font-semibold">{task.title}</span><span className="block opacity-75">{context}</span></button>)}</div> : null}
        </div>
        <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Outcome<select className="health-input h-9" disabled={disabled} onChange={(event) => onChange(setIssue({ ...draft, outcome: event.target.value === "none" ? null : event.target.value as BatchIntakeTaskDraft["outcome"] }, "Choose an outcome", event.target.value === "none"))} value={draft.outcome ?? "none"}><option value="none">No change</option><option value="done">Done</option><option value="did_my_best">Did My Best</option><option value="missed">Missed</option></select></label>
        <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Date<input className="health-input h-9" disabled={disabled} onChange={(event) => onChange(withDate(draft, event.target.value))} type="date" value={draft.date ?? ""} /></label>
      </div>
      {draft.issues.length > 0 ? <p className="text-[11px] text-[#b34860]">{draft.issues.join(" · ")}</p> : null}
    </div>
  );
}

function WaterReviewRow({ draft, result, onChange, onRemove, onAddAnother, disabled }: { draft: BatchIntakeWaterDraft; result: ReturnType<typeof resultFor>; onChange: (draft: BatchIntakeWaterDraft) => void; onRemove?: () => void; onAddAnother: () => void; disabled: boolean }) {
  const isManual = draft.origin === "manual";
  return <div className="grid gap-2 rounded-xl border border-[#ece8f8] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
    <RowHeader disabled={disabled} draft={draft} label="Water" onAddAnother={onAddAnother} onRemove={isManual ? onRemove : undefined} onToggleIncluded={(included) => onChange({ ...draft, included })} result={result} />
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[7rem_8rem_9rem_10rem_minmax(0,1fr)]">
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Amount<input className="health-input h-9" disabled={disabled} min="0" onChange={(event) => { const amount = numberOrNull(event.target.value); onChange(setIssue({ ...draft, amount }, "Choose a positive water amount", amount === null || amount <= 0)); }} step="0.1" type="number" value={draft.amount ?? ""} /></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Unit<select className="health-input h-9" disabled={disabled || !isManual} onChange={(event) => onChange({ ...draft, unit: event.target.value === "cup" ? "cup" : "fl_oz" })} value={draft.unit}><option value="fl_oz">fl oz</option><option value="cup">cup</option></select></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Status<select className="health-input h-9" disabled={disabled} onChange={(event) => onChange(setIssue({ ...draft, status: event.target.value === "pending" ? "pending" : event.target.value === "confirmed" ? "confirmed" : null }, "Choose Pending or Confirmed", !event.target.value))} value={draft.status ?? ""}><option value="">Choose…</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option></select></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Date<input className="health-input h-9" disabled={disabled} onChange={(event) => onChange(withDate(draft, event.target.value))} type="date" value={draft.date ?? ""} /></label>
      {isManual ? <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Time<input className="health-input h-9" disabled={disabled} onChange={(event) => onChange(withTimeIssue({ ...draft, time: event.target.value }, !event.target.value || buildHealthMealLoggedAt(draft.date ?? "", event.target.value) !== null))} type="time" value={draft.time} /></label> : null}
    </div>
    <p className="text-[11px] text-[#8b82a7]">{isManual ? "Blank time uses the deterministic local-noon timestamp." : "Unit: fl oz · source rows use a neutral local-noon timestamp because the source has no exact time."}</p>
    {draft.issues.length > 0 ? <p className="text-[11px] text-[#b34860]">{draft.issues.join(" · ")}</p> : null}
  </div>;
}

function WeightReviewRow({ draft, profile, result, onChange, onRemove, onAddAnother, disabled }: { draft: BatchIntakeWeightDraft; profile: HealthProfile | null; result: ReturnType<typeof resultFor>; onChange: (draft: BatchIntakeWeightDraft) => void; onRemove?: () => void; onAddAnother: () => void; disabled: boolean }) {
  const isManual = draft.origin === "manual";
  const displayUnit = draft.unit ?? profile?.preferred_weight_unit ?? null;
  return <div className="grid gap-2 rounded-xl border border-[#ece8f8] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
    <RowHeader disabled={disabled} draft={draft} label="Weight" onAddAnother={onAddAnother} onRemove={isManual ? onRemove : undefined} onToggleIncluded={(included) => onChange({ ...draft, included })} result={result} />
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[7rem_8rem_10rem_minmax(0,1fr)]">
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Value<input className="health-input h-9" disabled={disabled} min="0" onChange={(event) => { const value = numberOrNull(event.target.value); onChange(setIssue({ ...draft, value }, "Choose a positive weight value", value === null || value <= 0)); }} step="0.1" type="number" value={draft.value ?? ""} /></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Unit<select className="health-input h-9" disabled={disabled || !isManual} onChange={(event) => onChange({ ...draft, unit: event.target.value === "lb" || event.target.value === "kg" ? event.target.value : null, unitSource: event.target.value ? "explicit" : "missing", issues: draft.issues.filter((issue) => issue !== "Health preferred weight unit is not ready") })} value={displayUnit ?? ""}><option value="">Choose…</option><option value="lb">lb</option><option value="kg">kg</option></select></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Date<input className="health-input h-9" disabled={disabled} onChange={(event) => onChange(withDate(draft, event.target.value))} type="date" value={draft.date ?? ""} /></label>
      {isManual ? <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Time<input className="health-input h-9" disabled={disabled} onChange={(event) => onChange(withTimeIssue({ ...draft, time: event.target.value }, !event.target.value || buildHealthMealLoggedAt(draft.date ?? "", event.target.value) !== null))} type="time" value={draft.time} /></label> : null}
    </div>
    <p className="text-[11px] text-[#8b82a7]">{draft.unitSource === "profile" || (draft.unitSource === "missing" && displayUnit !== null) ? `Unit resolved from Health profile: ${displayUnit}.` : "Canonical storage uses kilograms; the selected display unit is shown above."}</p>
    {draft.issues.filter((issue) => !(issue === "Health preferred weight unit is not ready" && displayUnit)).length > 0 ? <p className="text-[11px] text-[#b34860]">{draft.issues.filter((issue) => !(issue === "Health preferred weight unit is not ready" && displayUnit)).join(" · ")}</p> : null}
  </div>;
}

function MealReviewRow({ allDrafts, draft, foods, result, onAddMealFromParsed, onChange, onRemove, onAddAnother, disabled }: { allDrafts: BatchIntakeDraft[]; draft: Extract<BatchIntakeDraft, { kind: "meal" }>; foods: HealthFoodLibraryItem[]; result: ReturnType<typeof resultFor>; onAddMealFromParsed: (draft: BatchIntakeParsedMealDraft, food: HealthFoodLibraryItem) => void; onChange: (draft: BatchIntakeDraft) => void; onRemove?: () => void; onAddAnother: () => void; disabled: boolean }) {
  const [foodSearch, setFoodSearch] = useState("");
  const foodResults = searchHealthFoodLibrary(foods, foodSearch);
  if (draft.origin === "parsed") {
    const addedFoodIds = new Set(allDrafts.filter((candidate): candidate is BatchIntakeManualMealDraft => candidate.kind === "meal" && candidate.origin === "manual" && candidate.sourceParsedMealId === draft.id && Boolean(candidate.sourceFoodId)).map((candidate) => candidate.sourceFoodId));
    return <div className="grid gap-2 rounded-xl border border-[#ece8f8] bg-[#fbfaff] p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
      <RowHeader draft={draft} label="Meal · review only" onToggleIncluded={(included) => onChange({ ...draft, included })} result={result} />
      <p className="text-[#6f6787] dark:text-white/65"><span className="font-semibold">Original:</span> {draft.sourceText || draft.rawText || "(no meal text)"}</p>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Search custom foods…<input aria-label="Search custom foods for parsed Meal" className="health-input h-9" disabled={disabled} onChange={(event) => setFoodSearch(event.target.value)} placeholder="Search custom foods…" value={foodSearch} /></label>
      {foodResults.length > 0 ? <div className="grid max-h-36 gap-1 overflow-y-auto">{foodResults.map((food) => { const added = addedFoodIds.has(food.id); return <button aria-pressed={added} className={`rounded-md px-2 py-1 text-left text-[11px] ${added ? "bg-[#e7f6ee] text-[#23815b] dark:bg-[#143b2a]" : "bg-white text-[#6f6787] hover:bg-[#f0ebff] dark:bg-white/5 dark:text-white/65"}`} disabled={disabled || added} key={food.id} onClick={() => onAddMealFromParsed(draft, food)} type="button">{added ? "Added · " : "+ "}{formatHealthFoodDisplayName(food)} · {food.calories} kcal</button>; })}</div> : null}
      <label className="grid max-w-40 gap-1 text-[11px] font-medium text-[#7d7598]">Date<input className="health-input h-9" disabled={disabled} onChange={(event) => onChange(withDate(draft, event.target.value))} type="date" value={draft.date ?? ""} /></label>
      <p className="text-[11px] text-[#8b82a7]">Each selected food creates a new structured Meal occurrence. This parsed source stays review-only.</p>
    </div>;
  }
  const update = (next: BatchIntakeManualMealDraft) => onChange(next);
  const timeIsValid = buildHealthMealLoggedAt(draft.date ?? "", draft.time) !== null;
  const selectFood = (food: HealthFoodLibraryItem) => {
    const selection = mealFoodSelectionFromLibraryItem(food);
    update({
      ...draft,
      attribution: selection.attribution,
      barcode: selection.barcode,
      brandName: selection.brandName,
      calories: selection.calories,
      carbsG: selection.carbs,
      fatG: selection.fat,
      foodCategory: selection.foodCategory,
      foodName: selection.foodName,
      nutritionDetails: selection.nutritionDetails,
      provider: selection.provider,
      providerItemId: selection.providerItemId,
      proteinG: selection.protein,
      servingLabel: selection.servingLabel ?? "",
      servingMeasureUnit: selection.servingMeasureUnit,
      servingMeasureValue: selection.servingMeasureValue,
      servingQuantity: selection.servingQuantity,
      servingUnit: selection.servingUnit,
      sourceFoodId: selection.sourceFoodId,
      issues: draft.issues.filter((issue) => issue !== "Food name is required" && issue !== "Calories are required"),
    });
    setFoodSearch(formatHealthFoodDisplayName(food));
  };
  return <div className="grid gap-2 rounded-xl border border-[#ece8f8] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
    <RowHeader disabled={disabled} draft={draft} label="Meal · structured" onAddAnother={onAddAnother} onRemove={onRemove} onToggleIncluded={(included) => update({ ...draft, included })} result={result} />
    <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Search custom foods…<input aria-label="Search custom foods for manual Meal" className="health-input h-9" disabled={disabled} onChange={(event) => setFoodSearch(event.target.value)} placeholder="Search custom foods…" value={foodSearch} /></label>
    {foodResults.length > 0 ? <div className="grid max-h-36 gap-1 overflow-y-auto">{foodResults.map((food) => <button className="rounded-md bg-[#faf8fe] px-2 py-1 text-left text-[11px] text-[#6f6787] hover:bg-[#f0ebff] dark:bg-white/5 dark:text-white/65" disabled={disabled} key={food.id} onClick={() => selectFood(food)} type="button">{formatHealthFoodDisplayName(food)} · {food.calories} kcal</button>)}</div> : null}
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Meal slot<select className="health-input h-9" disabled={disabled} onChange={(event) => update({ ...draft, mealSlot: event.target.value as HealthMealSlot })} value={draft.mealSlot}><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option></select></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598] lg:col-span-2">Food name<input className="health-input h-9" disabled={disabled} onChange={(event) => update(setIssue({ ...draft, foodName: event.target.value }, "Food name is required", !event.target.value.trim()))} value={draft.foodName} /></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Calories<input className="health-input h-9" disabled={disabled} min="0" onChange={(event) => { const calories = numberOrNull(event.target.value); update(setIssue({ ...draft, calories }, "Calories are required", calories === null || calories < 0)); }} step="1" type="number" value={draft.calories ?? ""} /></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Protein<input className="health-input h-9" disabled={disabled} min="0" onChange={(event) => { const value = numberOrNull(event.target.value); update(setIssue({ ...draft, proteinG: value }, "Protein must be non-negative", value !== null && value < 0)); }} step="0.1" type="number" value={draft.proteinG ?? ""} /></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Carbohydrates<input className="health-input h-9" disabled={disabled} min="0" onChange={(event) => { const value = numberOrNull(event.target.value); update(setIssue({ ...draft, carbsG: value }, "Carbohydrates must be non-negative", value !== null && value < 0)); }} step="0.1" type="number" value={draft.carbsG ?? ""} /></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Fat<input className="health-input h-9" disabled={disabled} min="0" onChange={(event) => { const value = numberOrNull(event.target.value); update(setIssue({ ...draft, fatG: value }, "Fat must be non-negative", value !== null && value < 0)); }} step="0.1" type="number" value={draft.fatG ?? ""} /></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Serving label<input className="health-input h-9" disabled={disabled} placeholder="Optional" onChange={(event) => update({ ...draft, servingLabel: event.target.value })} value={draft.servingLabel} /></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Date<input className="health-input h-9" disabled={disabled} onChange={(event) => update(withDate(draft, event.target.value))} type="date" value={draft.date ?? ""} /></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Time<input className="health-input h-9" disabled={disabled} onChange={(event) => update(withTimeIssue({ ...draft, time: event.target.value }, buildHealthMealLoggedAt(draft.date ?? "", event.target.value) !== null))} type="time" value={draft.time} /></label>
    </div>
    {!timeIsValid ? <p className="text-[11px] text-[#b34860]">Choose a valid meal date and time.</p> : null}
    {draft.issues.length > 0 ? <p className="text-[11px] text-[#b34860]">{draft.issues.join(" · ")}</p> : null}
  </div>;
}

function FocusReviewRow({ draft, categories, history, result, onChange, onRemove, onAddAnother, disabled }: { draft: BatchIntakeFocusDraft; categories: FocusCategory[]; history: HistoricalFocusSession[]; result: ReturnType<typeof resultFor>; onChange: (draft: BatchIntakeFocusDraft) => void; onRemove?: () => void; onAddAnother: () => void; disabled: boolean }) {
  const labels = {
    titles: [...new Set([...categories.map((category) => category.title), ...history.map((entry) => entry.title)])].filter(Boolean).sort(),
    types: [...new Set(["Work", ...categories.map((category) => category.focusType), ...history.map((entry) => entry.focusType)])].filter(Boolean).sort(),
    primary: [...new Set([...categories.map((category) => category.focusSubtype ?? ""), ...history.map((entry) => entry.focusSubtype ?? "")])].filter(Boolean).sort(),
    secondary: [...new Set([...categories.map((category) => category.focusSubtype2 ?? ""), ...history.map((entry) => entry.focusSubtype2 ?? "")])].filter(Boolean).sort(),
  };
  const totalMinutes = draft.durationSeconds === null ? "" : String(Math.floor(draft.durationSeconds / 60));
  const hours = totalMinutes === "" ? "" : String(Math.floor(Number(totalMinutes) / 60));
  const minutes = totalMinutes === "" ? "" : String(Number(totalMinutes) % 60);
  const updateDuration = (hoursValue: string, minutesValue: string) => {
    const hoursNumber = hoursValue.trim() ? Number(hoursValue) : 0;
    const minutesNumber = minutesValue.trim() ? Number(minutesValue) : 0;
    const valid = Number.isInteger(hoursNumber) && Number.isInteger(minutesNumber) && hoursNumber >= 0 && minutesNumber >= 0 && minutesNumber <= 59;
    const durationSeconds = valid && (hoursValue.trim() !== "" || minutesValue.trim() !== "") ? hoursNumber * 3600 + minutesNumber * 60 : null;
    const resolvedDuration = durationSeconds && durationSeconds > 0 ? durationSeconds : null;
    onChange(setIssue({ ...draft, durationSeconds: resolvedDuration }, "Focus duration must be greater than zero", resolvedDuration === null));
  };
  const updateCategory = (value: string) => {
    const category = categories.find((candidate) => candidate.id === value);
    onChange({ ...draft, categoryId: value || null, ...(category ? { title: category.title, focusType: category.focusType, focusSubtype: category.focusSubtype ?? null, focusSubtype2: category.focusSubtype2 ?? null } : {}) });
  };
  return <div className="grid gap-2 rounded-xl border border-[#ece8f8] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
    <RowHeader disabled={disabled} draft={draft} label="Focus Session" onAddAnother={onAddAnother} onRemove={onRemove} onToggleIncluded={(included) => onChange({ ...draft, included })} result={result} />
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598] lg:col-span-2">Category<select className="health-input h-9" disabled={disabled} onChange={(event) => updateCategory(event.target.value)} value={draft.categoryId ?? ""}><option value="">No saved category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598] lg:col-span-2">Title<input className="health-input h-9" disabled={disabled} list={`${draft.id}-focus-titles`} onChange={(event) => onChange(setIssue({ ...draft, title: event.target.value }, "Focus title is required", !event.target.value.trim()))} value={draft.title} /><datalist id={`${draft.id}-focus-titles`}>{labels.titles.map((value) => <option key={value} value={value} />)}</datalist></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Focus type<input className="health-input h-9" disabled={disabled} list={`${draft.id}-focus-types`} onChange={(event) => onChange({ ...draft, focusType: event.target.value })} value={draft.focusType} /><datalist id={`${draft.id}-focus-types`}>{labels.types.map((value) => <option key={value} value={value} />)}</datalist></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Primary subtype<input className="health-input h-9" disabled={disabled} list={`${draft.id}-focus-primary`} onChange={(event) => onChange({ ...draft, focusSubtype: event.target.value || null })} value={draft.focusSubtype ?? ""} /><datalist id={`${draft.id}-focus-primary`}>{labels.primary.map((value) => <option key={value} value={value} />)}</datalist></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Secondary subtype<input className="health-input h-9" disabled={disabled} list={`${draft.id}-focus-secondary`} onChange={(event) => onChange({ ...draft, focusSubtype2: event.target.value || null })} placeholder="Optional" value={draft.focusSubtype2 ?? ""} /><datalist id={`${draft.id}-focus-secondary`}>{labels.secondary.map((value) => <option key={value} value={value} />)}</datalist></label>
      <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Hours<input className="health-input h-9" disabled={disabled} min="0" onChange={(event) => updateDuration(event.target.value, minutes)} type="number" value={hours} /></label><label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Minutes<input className="health-input h-9" disabled={disabled} max="59" min="0" onChange={(event) => updateDuration(hours, event.target.value)} type="number" value={minutes} /></label></div>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Date<input className="health-input h-9" disabled={disabled} onChange={(event) => onChange(withDate(draft, event.target.value))} type="date" value={draft.date ?? ""} /></label>
      <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Completion time<input className="health-input h-9" disabled={disabled} onChange={(event) => onChange(setIssue(withTimeIssue({ ...draft, completionTime: event.target.value }, buildHealthMealLoggedAt(draft.date ?? "", event.target.value) !== null), "Choose a Focus completion time", !event.target.value))} type="time" value={draft.completionTime} /></label>
    </div>
    <label className="grid gap-1 text-[11px] font-medium text-[#7d7598]">Notes<textarea className="health-input min-h-16 resize-y" disabled={disabled} onChange={(event) => onChange({ ...draft, notes: event.target.value })} value={draft.notes} /></label>
    {draft.origin === "parsed" && !draft.completionTime ? <p className="text-[11px] text-[#8a641c]">Choose time before Apply; the source supplied duration only.</p> : null}
    {draft.issues.length > 0 ? <p className="text-[11px] text-[#b34860]">{draft.issues.join(" · ")}</p> : null}
  </div>;
}

export function HomeBatchIntakeReview({ applyProgress, drafts, tasks, healthProfile, healthFoods, healthLoading, focusCategories, focusHistory, onAddRow, onAddAnother, onAddMealFromParsed, onChange, onRemoveRow, onCancel, onApply, isApplying, executionResult }: Props) {
  const preferredWeightUnit = healthProfile?.preferred_weight_unit ?? null;
  const applyCount = getBatchIntakeApplyCount(drafts, { preferredWeightUnit });
  const healthRows = drafts.filter((draft) => draft.kind === "water" || draft.kind === "weight" || draft.kind === "meal");
  const executableHealthRows = healthRows.filter((draft) => draft.kind !== "meal" || draft.origin === "manual");
  const healthReady = executableHealthRows.length === 0 || (!healthLoading && Boolean(healthProfile));
  const isReady = (draft: BatchIntakeDraft) => draft.kind === "task" ? isBatchIntakeTaskDraftReady(draft) : draft.kind === "water" ? isBatchIntakeWaterDraftReady(draft) : draft.kind === "weight" ? isBatchIntakeWeightDraftReady(draft, preferredWeightUnit) : draft.kind === "meal" ? draft.origin === "manual" && isBatchIntakeMealDraftReady(draft) : draft.kind === "focus" ? isBatchIntakeFocusDraftReady(draft) : false;
  const counts = {
    task: drafts.filter((draft) => draft.kind === "task").length,
    water: drafts.filter((draft) => draft.kind === "water").length,
    weight: drafts.filter((draft) => draft.kind === "weight").length,
    mealReady: drafts.filter((draft) => draft.kind === "meal" && draft.origin === "manual" && isReady(draft)).length,
    mealReviewOnly: drafts.filter((draft) => draft.kind === "meal" && draft.origin === "parsed").length,
    focus: drafts.filter((draft) => draft.kind === "focus").length,
    unsupported: drafts.filter((draft) => draft.kind === "unsupported").length,
    needsReview: drafts.filter((draft) => draft.included && ((draft.kind !== "meal" && draft.kind !== "unsupported" && !isReady(draft)) || (draft.kind === "meal" && draft.origin === "manual" && !isReady(draft)))).length,
  };
  const blockedExecutableRow = drafts.some((draft) => draft.included && resultFor(executionResult, draft.id)?.status !== "applied" && ((["task", "water", "weight", "focus"].includes(draft.kind) && !isReady(draft)) || (draft.kind === "meal" && draft.origin === "manual" && !isReady(draft))));
  const groupedDates = [...new Set(drafts.map((draft) => draft.date ?? "needs-date"))].sort();
  return <AdhdPanel className="mt-3" padding="md" title="Batch Intake Review" subtitle="Review proposed records before anything is written. Your Scratchpad text stays unchanged.">
    <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Add manual Batch Intake row">{(["task", "water", "weight", "meal", "focus"] as BatchIntakeManualKind[]).map((kind) => <AdhdChip key={kind} disabled={isApplying} onClick={() => onAddRow(kind)} type="button">+ {kind === "task" ? "Task" : kind === "focus" ? "Focus Session" : kind[0].toUpperCase() + kind.slice(1)}</AdhdChip>)}</div>
    <div className="mt-3 grid gap-2 text-xs text-[#6f6787] dark:text-white/65 sm:grid-cols-3"><p>Tasks {counts.task}</p><p>Water {counts.water}</p><p>Weight {counts.weight}</p><p>Meals ready {counts.mealReady}</p><p>Meals review-only {counts.mealReviewOnly}</p><p>Focus {counts.focus}</p><p>Unsupported {counts.unsupported}</p></div>
    <div className="mt-3 rounded-lg bg-[#faf8fe] px-3 py-2 text-xs text-[#625b7b] dark:bg-white/5 dark:text-white/70">Ready to apply: <strong>{applyCount}</strong> · Needs review: {counts.needsReview} · Excluded, parsed Meals, and unsupported rows are not counted.</div>
    {applyProgress ? <div className="mt-3 rounded-lg border border-[#e7e0fb] bg-white/70 px-3 py-2 text-[#5f5878] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/75"><p className="text-xs font-semibold">Applying Batch Intake</p><OperationProgressBar progress={{ completed: applyProgress.processed, failed: applyProgress.failed, label: batchIntakeStageLabel(applyProgress.stage), total: applyProgress.total }} /><p className="mt-1 text-xs tabular-nums">{applyProgress.applied} applied{applyProgress.failed > 0 ? ` · ${applyProgress.failed} failed` : ""}</p></div> : null}
    {healthRows.length > 0 && !healthReady ? <p className="mt-3 rounded-lg border border-[#f2d9a6] bg-[#fff9ed] px-3 py-2 text-xs text-[#8a641c]" role="status">{healthLoading ? "Loading Health authority…" : "Health profile is not ready. Health rows cannot be applied yet."}</p> : null}
    {executionResult?.rows.some((row) => row.status === "failed") ? <p className="mt-3 rounded-lg border border-[#ffd6de] bg-[#fff1f3] px-3 py-2 text-xs text-[#a53f56]" role="alert">Some rows failed. Successful rows remain Applied; failed rows stay visible and can be retried.</p> : null}
    {drafts.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-[#ddd6ee] px-3 py-4 text-sm text-[#8b82a7]">Add a structured row above to build this manual batch.</p> : null}
    <div className="mt-4 grid gap-4">{groupedDates.map((date) => <section className="grid gap-2" key={date}><h3 className="text-xs font-semibold text-[#5d49d6] dark:text-[#b8aaff]">{date === "needs-date" ? "Needs date" : date}</h3>{drafts.filter((draft) => (draft.date ?? "needs-date") === date).map((draft) => { const result = resultFor(executionResult, draft.id); const locked = result?.status === "applied"; const addAnother = () => onAddAnother(draft); if (draft.kind === "task") return <TaskReviewRow disabled={locked || isApplying} draft={draft} key={draft.id} onAddAnother={addAnother} onChange={onChange} onRemove={draft.origin === "manual" ? () => onRemoveRow(draft.id) : undefined} result={result} tasks={tasks} />; if (draft.kind === "water") return <WaterReviewRow disabled={locked || isApplying} draft={draft} key={draft.id} onAddAnother={addAnother} onChange={onChange} onRemove={draft.origin === "manual" ? () => onRemoveRow(draft.id) : undefined} result={result} />; if (draft.kind === "weight") return <WeightReviewRow disabled={locked || isApplying} draft={draft} key={draft.id} onAddAnother={addAnother} onChange={onChange} onRemove={draft.origin === "manual" ? () => onRemoveRow(draft.id) : undefined} profile={healthProfile} result={result} />; if (draft.kind === "meal") return <MealReviewRow allDrafts={drafts} disabled={locked || isApplying} draft={draft} foods={healthFoods} key={draft.id} onAddAnother={addAnother} onAddMealFromParsed={onAddMealFromParsed} onChange={onChange} onRemove={draft.origin === "manual" ? () => onRemoveRow(draft.id) : undefined} result={result} />; if (draft.kind === "focus") return <FocusReviewRow categories={focusCategories} disabled={locked || isApplying} draft={draft} history={focusHistory} key={draft.id} onAddAnother={addAnother} onChange={onChange} onRemove={() => onRemoveRow(draft.id)} result={result} />; return <div className="grid gap-2 rounded-xl border border-dashed border-[#ddd6ee] bg-[#fcfbff] p-3 text-xs dark:border-white/15 dark:bg-white/[0.03]" key={draft.id}><div><p className="font-semibold text-[#6f6787] dark:text-white/75">Unsupported</p><p className="mt-1 text-[#6f6787] dark:text-white/65">{draft.sourceText}</p><p className="mt-1 text-[11px] text-[#8b82a7]">{draft.reason}</p></div><label className="grid max-w-40 gap-1 text-[11px] font-medium text-[#7d7598]">Date<input className="health-input h-9" disabled={isApplying} onChange={(event) => onChange(withDate(draft, event.target.value))} type="date" value={draft.date ?? ""} /></label></div>; })}</section>)}</div>
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2"><AdhdChip onClick={onCancel} type="button">Close review</AdhdChip><AdhdChip disabled={isApplying || applyCount === 0 || !healthReady || blockedExecutableRow} onClick={onApply} selected type="button">{isApplying ? "Applying…" : `Apply ${applyCount} changes`}</AdhdChip></div>
  </AdhdPanel>;
}

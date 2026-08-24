"use client";

import { Archive, ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import type {
  HealthFitnessPlan,
  HealthFitnessPlanInsert,
  HealthFitnessPlanItem,
  HealthFitnessPlanItemInsert,
  HealthFitnessPlanItemUpdate,
  HealthFitnessPlanUpdate,
  HealthWorkout,
  HealthWorkoutPlanItemLink,
} from "@/lib/database.types";
import {
  buildActiveHealthFitnessPlanWeekViews,
  getHealthPlanItemDurationSeconds,
  getHealthPlanWeekdayLabel,
  HEALTH_PLAN_WEEKDAYS,
  validateHealthFitnessPlanItemDraft,
  type HealthFitnessPlanItemDraft,
} from "@/lib/health-fitness-plans";
import { formatHealthDateLabel, todayHealthDate } from "@/lib/health-utils";
import { HealthCollapsiblePanel } from "./health-collapsible-panel";
import { HealthDropdown, HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";

type HealthFitnessPlansPanelProps = {
  archivePlan: (planId: string) => Promise<boolean>;
  archivePlanItem: (itemId: string) => Promise<boolean>;
  createPlan: (input: Omit<HealthFitnessPlanInsert, "user_id">) => Promise<HealthFitnessPlan | null>;
  createPlanItem: (input: Omit<HealthFitnessPlanItemInsert, "user_id">) => Promise<HealthFitnessPlanItem | null>;
  createPlanTypes: readonly string[];
  error: string | null;
  isLoading: boolean;
  planItems: HealthFitnessPlanItem[];
  plans: HealthFitnessPlan[];
  updatePlan: (planId: string, input: HealthFitnessPlanUpdate) => Promise<boolean>;
  updatePlanItem: (itemId: string, input: HealthFitnessPlanItemUpdate) => Promise<boolean>;
  workoutPlanItemLinks: HealthWorkoutPlanItemLink[];
  workouts: HealthWorkout[];
  onLogPlannedItem: (item: HealthFitnessPlanItem) => void;
};

type PlanEditorState = {
  archivedItemIds: string[];
  id: string | null;
  items: HealthFitnessPlanItemDraft[];
  name: string;
  startsOn: string;
};

function createDefaultPlanItem(workoutType: string): HealthFitnessPlanItemDraft {
  return {
    day_of_week: 1,
    expected_duration_minutes: "",
    notes: "",
    title: "",
    workout_type: workoutType,
  };
}

function createPlanEditor(plan: HealthFitnessPlan | null, planItems: readonly HealthFitnessPlanItem[], workoutType: string): PlanEditorState {
  if (!plan) {
    return {
      archivedItemIds: [],
      id: null,
      items: [createDefaultPlanItem(workoutType)],
      name: "",
      startsOn: todayHealthDate(),
    };
  }
  return {
    archivedItemIds: [],
    id: plan.id,
    items: planItems
      .filter((item) => item.plan_id === plan.id && item.archived_at === null)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((item) => ({
        day_of_week: item.day_of_week,
        expected_duration_minutes: item.expected_duration_seconds === null ? "" : String(item.expected_duration_seconds / 60),
        id: item.id,
        notes: item.notes ?? "",
        title: item.title ?? "",
        workout_type: item.workout_type,
      })),
    name: plan.name,
    startsOn: plan.starts_on,
  };
}

export function HealthFitnessPlansPanel({
  archivePlan,
  archivePlanItem,
  createPlan,
  createPlanItem,
  createPlanTypes,
  error,
  isLoading,
  planItems,
  plans,
  updatePlan,
  updatePlanItem,
  workoutPlanItemLinks,
  workouts,
  onLogPlannedItem,
}: HealthFitnessPlansPanelProps) {
  const [editor, setEditor] = useState<PlanEditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const today = todayHealthDate();
  const planViews = useMemo(
    () => buildActiveHealthFitnessPlanWeekViews(plans, planItems, workoutPlanItemLinks, workouts, today),
    [planItems, plans, today, workoutPlanItemLinks, workouts],
  );

  function openCreatePlan() {
    setEditor(createPlanEditor(null, [], createPlanTypes[0] ?? "Other"));
    setEditorError(null);
  }

  function openEditPlan(plan: HealthFitnessPlan) {
    setEditor(createPlanEditor(plan, planItems, createPlanTypes[0] ?? "Other"));
    setEditorError(null);
  }

  function removeEditorItem(index: number) {
    setEditor((current) => {
      if (!current) return current;
      const removed = current.items[index];
      return {
        ...current,
        archivedItemIds: removed?.id ? [...current.archivedItemIds, removed.id] : current.archivedItemIds,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  }

  function moveEditorItem(index: number, direction: -1 | 1) {
    setEditor((current) => {
      if (!current) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.items.length) return current;
      const items = [...current.items];
      const [moved] = items.splice(index, 1);
      if (!moved) return current;
      items.splice(nextIndex, 0, moved);
      return { ...current, items };
    });
  }

  async function handleSavePlan() {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      setEditorError("Enter a Fitness Plan name.");
      return;
    }
    if (!editor.startsOn) {
      setEditorError("Choose a Fitness Plan start date.");
      return;
    }
    if (editor.items.length === 0) {
      setEditorError("Add at least one Planned Item.");
      return;
    }
    const itemError = editor.items.map((item) => validateHealthFitnessPlanItemDraft(item)).find(Boolean);
    if (itemError) {
      setEditorError(itemError);
      return;
    }

    setIsSaving(true);
    let plan: HealthFitnessPlan | null = null;
    if (editor.id) {
      if (!(await updatePlan(editor.id, { name, starts_on: editor.startsOn }))) {
        setIsSaving(false);
        setEditorError("Fitness Plan could not be saved.");
        return;
      }
      plan = plans.find((candidate) => candidate.id === editor.id) ?? null;
    } else {
      plan = await createPlan({ name, starts_on: editor.startsOn });
    }
    if (!plan) {
      setIsSaving(false);
      setEditorError("Fitness Plan could not be saved.");
      return;
    }

    let saved = true;
    for (const [index, item] of editor.items.entries()) {
      const input = toPlanItemInput(item, plan.id, index);
      const itemSaved = item.id
        ? await updatePlanItem(item.id, toPlanItemUpdate(input))
        : Boolean(await createPlanItem(input));
      if (!itemSaved) {
        saved = false;
        break;
      }
    }
    if (saved) {
      for (const itemId of editor.archivedItemIds) {
        if (!(await archivePlanItem(itemId))) {
          saved = false;
          break;
        }
      }
    }
    setIsSaving(false);
    if (!saved) {
      setEditorError("The plan was partly saved. Review the items and try again.");
      return;
    }
    setEditor(null);
    setEditorError(null);
  }

  return (
    <HealthCollapsiblePanel
      header={<Check aria-hidden="true" className="mt-0.5 h-6 w-6 text-[#6f57f6] dark:text-[#cabfff]" />}
      subtitle="Intent stays separate from the workout ledger"
      title="Active Fitness Plans"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-2xl text-sm text-[#73809c] dark:text-white/55">Maintain multiple plans at the same time. A workout can satisfy more than one planned item through explicit links.</p>
          <AdhdChip icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={openCreatePlan} tone="purple" type="button">Add Plan</AdhdChip>
        </div>
        {error ? <p className="rounded-[1rem] border border-[#ffd8df] bg-[#fff2f4] px-3 py-2 text-xs text-[#bd4057] dark:border-[#5b2430] dark:bg-[#31141b] dark:text-[#ffb3bf]" role="alert">{error}</p> : null}
        {isLoading ? <p className="text-sm text-[#7d7598] dark:text-white/50">Loading Fitness Plans…</p> : null}
        {!isLoading && !error && planViews.length === 0 ? <p className="rounded-[1rem] border border-dashed border-[#ddd7ef] px-3 py-4 text-sm text-[#7d7598] dark:border-white/15 dark:text-white/50">Create a plan to schedule workouts across your week.</p> : null}
        {planViews.map(({ plan, items }) => (
          <article className="grid gap-3 rounded-[1.25rem] border border-[#edf0fb] bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]" key={plan.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#26324f] dark:text-white">{plan.name}</h3>
                <p className="mt-1 text-xs text-[#74809b] dark:text-white/50">Starts {formatHealthDateLabel(plan.starts_on)} · current Monday–Sunday week</p>
              </div>
              <div className="flex items-center gap-1">
                <AdhdIconButton aria-label={`Edit Fitness Plan ${plan.name}`} onClick={() => openEditPlan(plan)} size="sm" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton>
                <AdhdIconButton aria-label={`Archive Fitness Plan ${plan.name}`} onClick={() => { void archivePlan(plan.id); }} size="sm" tone="danger" variant="rowToolbar"><Archive aria-hidden="true" /></AdhdIconButton>
              </div>
            </div>
            <div className="grid gap-2">
              {items.length === 0 ? <p className="text-xs text-[#8d87a7] dark:text-white/40">No active planned items.</p> : items.map((item) => (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[0.95rem] border border-[#eeeaf8] bg-[#fbfaff] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]" key={item.id}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#3f4966] dark:text-white/80">{getHealthPlanWeekdayLabel(item.day_of_week)} · {item.title?.trim() || item.workout_type}</p>
                    <p className="mt-0.5 text-xs text-[#7d7598] dark:text-white/50">{item.expected_duration_seconds === null ? "Duration flexible" : `${item.expected_duration_seconds / 60} min`}{item.notes?.trim() ? ` · ${item.notes.trim()}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <AdhdChip className="pointer-events-none" tone={!item.activeForCurrentWeek ? "notDue" : item.completedForCurrentWeek ? "done" : "upcoming"} type="button">
                      {!item.activeForCurrentWeek ? "Not active yet" : item.completedForCurrentWeek ? "Completed" : "Incomplete"}
                    </AdhdChip>
                    {item.activeForCurrentWeek && !item.completedForCurrentWeek ? <AdhdChip onClick={() => onLogPlannedItem(item)} tone="purple" type="button">Log Workout</AdhdChip> : null}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
        {editor ? (
          <div aria-label={editor.id ? "Edit Fitness Plan" : "Create Fitness Plan"} className="grid gap-4 rounded-[1.25rem] border border-[#ddd2ff] bg-[#fbfaff] p-4 dark:border-[#42306f] dark:bg-white/[0.04]" role="dialog">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[#26324f] dark:text-white">{editor.id ? "Edit Fitness Plan" : "Create Fitness Plan"}</h3>
              <AdhdIconButton aria-label="Close Fitness Plan editor" disabled={isSaving} onClick={() => setEditor(null)} size="sm" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Plan Name</span><input aria-label="Plan Name" className={HEALTH_COMPACT_INPUT_CLASS} disabled={isSaving} onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : current)} type="text" value={editor.name} /></label>
              <label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Start Date</span><input aria-label="Plan Start Date" className={HEALTH_COMPACT_INPUT_CLASS} disabled={isSaving} onChange={(event) => setEditor((current) => current ? { ...current, startsOn: event.target.value } : current)} type="date" value={editor.startsOn} /></label>
            </div>
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6f57f6] dark:text-[#cabfff]">Planned Items</h4><p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Multiple items may use the same weekday.</p></div><AdhdChip disabled={isSaving} icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setEditor((current) => current ? { ...current, items: [...current.items, createDefaultPlanItem(createPlanTypes[0] ?? "Other")] } : current)} type="button">Add Planned Item</AdhdChip></div>
              {editor.items.map((item, index) => <PlanItemEditor key={item.id ?? `new-${index}`} createPlanTypes={createPlanTypes} disabled={isSaving} index={index} item={item} itemCount={editor.items.length} onChange={(patch) => setEditor((current) => current ? { ...current, items: current.items.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, ...patch } : candidate) } : current)} onMove={moveEditorItem} onRemove={removeEditorItem} />)}
            </div>
            {editorError ? <p className="text-sm text-[#d65775] dark:text-[#ffb0c1]" role="alert">{editorError}</p> : null}
            <div className="flex flex-wrap gap-2"><AdhdChip disabled={isSaving} onClick={() => { void handleSavePlan(); }} tone="purple" type="button">{isSaving ? "Saving…" : "Save Plan"}</AdhdChip><AdhdChip disabled={isSaving} onClick={() => setEditor(null)} type="button">Cancel</AdhdChip></div>
          </div>
        ) : null}
      </div>
    </HealthCollapsiblePanel>
  );
}

export function FitnessPlanAssociationPicker({
  onToggle,
  planItems,
  plans,
  selectedPlanItemIds,
}: {
  onToggle: (planItemId: string) => void;
  planItems: HealthFitnessPlanItem[];
  plans: HealthFitnessPlan[];
  selectedPlanItemIds: readonly string[];
}) {
  const selectedIds = new Set(selectedPlanItemIds);
  const selectedArchivedIds = planItems.filter((item) => selectedIds.has(item.id) && (item.archived_at !== null || plans.find((plan) => plan.id === item.plan_id)?.archived_at !== null)).map((item) => item.id);
  const activePlans = plans.filter((plan) => plan.archived_at === null);
  const activeItemsByPlan = activePlans.map((plan) => ({
    items: planItems.filter((item) => item.plan_id === plan.id && item.archived_at === null),
    plan,
  })).filter(({ items }) => items.length > 0);
  const archivedItems = planItems.filter((item) => selectedArchivedIds.includes(item.id));
  if (activeItemsByPlan.length === 0 && archivedItems.length === 0) {
    return <p className="text-xs text-[#8d87a7] dark:text-white/40">No active planned items are available yet.</p>;
  }

  return (
    <div className="grid gap-2 rounded-[1rem] border border-[#eeeaf8] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6f57f6] dark:text-[#cabfff]">Fitness Plans</p><p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Optional explicit associations. Matching is never automatic.</p></div>
      {activeItemsByPlan.map(({ plan, items }) => <div className="grid gap-1.5" key={plan.id}><p className="text-xs font-semibold text-[#4a5470] dark:text-white/75">{plan.name}</p>{items.map((item) => <PlanAssociationCheckbox checked={selectedIds.has(item.id)} item={item} key={item.id} onToggle={onToggle} />)}</div>)}
      {archivedItems.length > 0 ? <div className="grid gap-1.5 border-t border-[#eeeaf8] pt-2 dark:border-white/10"><p className="text-xs font-semibold text-[#7d7598] dark:text-white/55">Existing archived associations</p>{archivedItems.map((item) => <PlanAssociationCheckbox checked item={item} key={item.id} onToggle={onToggle} plans={plans} />)}</div> : null}
    </div>
  );
}

function PlanAssociationCheckbox({ checked, item, onToggle, plans }: { checked: boolean; item: HealthFitnessPlanItem; onToggle: (planItemId: string) => void; plans?: HealthFitnessPlan[] }) {
  const plan = plans?.find((candidate) => candidate.id === item.plan_id);
  return <label className="flex items-center gap-2 rounded-[0.8rem] px-2 py-1.5 text-sm text-[#5d6783] hover:bg-[#f3efff] dark:text-white/70 dark:hover:bg-white/[0.06]"><input aria-label={`${plan?.name ?? "Archived plan"} ${getHealthPlanWeekdayLabel(item.day_of_week)} ${item.title?.trim() || item.workout_type}`} checked={checked} onChange={() => onToggle(item.id)} type="checkbox" /><span>{getHealthPlanWeekdayLabel(item.day_of_week)} · {item.title?.trim() || item.workout_type}{plan ? " (archived)" : ""}</span></label>;
}

function PlanItemEditor({ createPlanTypes, disabled, index, item, itemCount, onChange, onMove, onRemove }: { createPlanTypes: readonly string[]; disabled: boolean; index: number; item: HealthFitnessPlanItemDraft; itemCount: number; onChange: (patch: Partial<HealthFitnessPlanItemDraft>) => void; onMove: (index: number, direction: -1 | 1) => void; onRemove: (index: number) => void }) {
  const workoutTypeOptions = item.workout_type && !createPlanTypes.includes(item.workout_type) ? [{ label: `${item.workout_type} (historical)`, value: item.workout_type }, ...createPlanTypes.map((type) => ({ label: type, value: type }))] : createPlanTypes.map((type) => ({ label: type, value: type }));
  return <div className="grid gap-3 rounded-[1rem] border border-[#eeeaf8] bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-[#4a5470] dark:text-white/75">Planned Item {index + 1}</p><div className="flex items-center gap-1"><AdhdIconButton aria-label={`Move Planned Item ${index + 1} up`} disabled={disabled || index === 0} onClick={() => onMove(index, -1)} size="sm" variant="rowToolbar"><ArrowUp aria-hidden="true" /></AdhdIconButton><AdhdIconButton aria-label={`Move Planned Item ${index + 1} down`} disabled={disabled || index === itemCount - 1} onClick={() => onMove(index, 1)} size="sm" variant="rowToolbar"><ArrowDown aria-hidden="true" /></AdhdIconButton><AdhdIconButton aria-label={`Remove Planned Item ${index + 1}`} disabled={disabled} onClick={() => onRemove(index)} size="sm" tone="danger" variant="rowToolbar"><Trash2 aria-hidden="true" /></AdhdIconButton></div></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Weekday</span><HealthDropdown ariaLabel={`Planned Item ${index + 1} weekday`} disabled={disabled} onChange={(value) => onChange({ day_of_week: Number(value) })} options={HEALTH_PLAN_WEEKDAYS.map((day) => ({ label: day.label, value: String(day.value) }))} value={String(item.day_of_week)} /></label><label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Workout Type</span><HealthDropdown ariaLabel={`Planned Item ${index + 1} workout type`} disabled={disabled} onChange={(value) => onChange({ workout_type: value })} options={workoutTypeOptions} value={item.workout_type} /></label><label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Title (optional)</span><input aria-label={`Planned Item ${index + 1} title`} className={HEALTH_COMPACT_INPUT_CLASS} disabled={disabled} onChange={(event) => onChange({ title: event.target.value })} type="text" value={item.title} /></label><label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Expected Duration (minutes)</span><input aria-label={`Planned Item ${index + 1} expected duration`} className={HEALTH_COMPACT_INPUT_CLASS} disabled={disabled} min="1" onChange={(event) => onChange({ expected_duration_minutes: event.target.value })} step="1" type="number" value={item.expected_duration_minutes} /></label></div><label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Notes (optional)</span><textarea aria-label={`Planned Item ${index + 1} notes`} className="health-input min-h-16 w-full resize-y rounded-[1rem] px-3 py-2 text-[13px] max-sm:text-[16px]" disabled={disabled} onChange={(event) => onChange({ notes: event.target.value })} value={item.notes} /></label></div>;
}

function toPlanItemInput(item: HealthFitnessPlanItemDraft, planId: string, sortOrder: number): Omit<HealthFitnessPlanItemInsert, "user_id"> {
  return {
    day_of_week: item.day_of_week,
    expected_duration_seconds: getHealthPlanItemDurationSeconds(item),
    id: item.id,
    notes: item.notes.trim() || null,
    plan_id: planId,
    sort_order: sortOrder,
    title: item.title.trim() || null,
    workout_type: item.workout_type.trim(),
  };
}

function toPlanItemUpdate(input: Omit<HealthFitnessPlanItemInsert, "user_id">): HealthFitnessPlanItemUpdate {
  return {
    day_of_week: input.day_of_week,
    expected_duration_seconds: input.expected_duration_seconds,
    notes: input.notes,
    sort_order: input.sort_order,
    title: input.title,
    workout_type: input.workout_type,
  };
}

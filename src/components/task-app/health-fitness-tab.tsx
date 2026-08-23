"use client";

import { Activity, Bookmark, Flame, Pencil, Plus, Timer, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import type {
  HealthMetricEntry,
  HealthProfile,
  HealthProfileUpdate,
  HealthWorkout,
  HealthWorkoutInsert,
  HealthWorkoutUpdate,
} from "@/lib/database.types";
import {
  buildHealthWorkoutFormPayload,
  addHealthWorkoutTitleOption,
  getHealthDailyMovementMetrics,
  getHealthWeeklyWorkoutSummary,
  HEALTH_WORKOUT_TYPES,
  HEALTH_WORKOUT_TITLE_MAX_LENGTH,
  removeHealthWorkoutTitleOption,
  sortHealthWorkouts,
  type HealthWorkoutFormInput,
} from "@/lib/health-fitness";
import {
  clampPercent,
  formatHealthDateLabel,
  formatMealLoggedTime,
  getCurrentHealthDateTimeInputs,
  todayHealthDate,
} from "@/lib/health-utils";
import { HealthCollapsiblePanel } from "./health-collapsible-panel";
import { HealthAutocomplete, HealthDropdown, HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";

type HealthFitnessTabProps = {
  addWorkout: (input: Omit<HealthWorkoutInsert, "user_id">) => Promise<boolean>;
  deleteWorkout: (workoutId: string) => Promise<boolean>;
  metricEntries: HealthMetricEntry[];
  profile: HealthProfile;
  saveProfile: (updates: HealthProfileUpdate) => Promise<boolean>;
  updateWorkout: (workoutId: string, input: HealthWorkoutUpdate) => Promise<boolean>;
  workouts: HealthWorkout[];
};

const WORKOUT_TYPE_OPTIONS = HEALTH_WORKOUT_TYPES.map((type) => ({ label: type, value: type }));

function createDefaultWorkoutDraft(): HealthWorkoutFormInput {
  const { date } = getCurrentHealthDateTimeInputs();
  return {
    activeCalories: "",
    date,
    durationMinutes: "",
    notes: "",
    startTime: "",
    title: "",
    workoutType: HEALTH_WORKOUT_TYPES[0],
  };
}

export function HealthFitnessTab({
  addWorkout,
  deleteWorkout,
  metricEntries,
  profile,
  saveProfile,
  updateWorkout,
  workouts,
}: HealthFitnessTabProps) {
  const today = todayHealthDate();
  const [draft, setDraft] = useState<HealthWorkoutFormInput>(() => createDefaultWorkoutDraft());
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(true);
  const [revealRequest, setRevealRequest] = useState(0);
  const [savedTitleDraft, setSavedTitleDraft] = useState("");
  const [savedTitleError, setSavedTitleError] = useState<string | null>(null);
  const [isSavingTitleOptions, setIsSavingTitleOptions] = useState(false);
  const workoutFormRef = useRef<HTMLFormElement | null>(null);
  const pendingRevealRef = useRef(false);
  const dailyMovement = useMemo(() => getHealthDailyMovementMetrics(metricEntries, today), [metricEntries, today]);
  const weeklySummary = useMemo(() => getHealthWeeklyWorkoutSummary(workouts, today), [today, workouts]);
  const orderedWorkouts = useMemo(() => sortHealthWorkouts(workouts), [workouts]);
  const savedWorkoutTitles = profile.workout_title_options ?? [];

  useEffect(() => {
    if (!isFormOpen || !pendingRevealRef.current) {
      return;
    }
    pendingRevealRef.current = false;
    workoutFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isFormOpen, revealRequest]);

  function resetForm() {
    setDraft(createDefaultWorkoutDraft());
    setEditingWorkoutId(null);
    setFormError(null);
    setIsFormOpen(false);
    pendingRevealRef.current = false;
  }

  function queueFormReveal() {
    setIsHistoryPanelOpen(true);
    pendingRevealRef.current = true;
    setRevealRequest((current) => current + 1);
  }

  function openCreateForm() {
    setDraft(createDefaultWorkoutDraft());
    setEditingWorkoutId(null);
    setFormError(null);
    setIsFormOpen(true);
    queueFormReveal();
  }

  function openEditForm(workout: HealthWorkout) {
    const startedAt = workout.started_at ? new Date(workout.started_at) : null;
    setDraft({
      activeCalories: workout.active_calories === null ? "" : String(workout.active_calories),
      date: workout.workout_date,
      durationMinutes: String(Number((workout.duration_seconds / 60).toFixed(2))),
      notes: workout.notes,
      startTime: startedAt && Number.isFinite(startedAt.getTime())
        ? `${String(startedAt.getHours()).padStart(2, "0")}:${String(startedAt.getMinutes()).padStart(2, "0")}`
        : "",
      title: workout.title,
      workoutType: workout.workout_type,
    });
    setEditingWorkoutId(workout.id);
    setFormError(null);
    setIsFormOpen(true);
    queueFormReveal();
  }

  async function handleAddSavedTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = addHealthWorkoutTitleOption(savedWorkoutTitles, savedTitleDraft);
    if (result.error || !result.value) {
      setSavedTitleError(result.error);
      return;
    }

    setIsSavingTitleOptions(true);
    const saved = await saveProfile({ workout_title_options: result.value });
    setIsSavingTitleOptions(false);
    if (saved) {
      setSavedTitleDraft("");
      setSavedTitleError(null);
    } else {
      setSavedTitleError("Saved workout titles could not be saved.");
    }
  }

  async function handleRemoveSavedTitle(title: string) {
    setIsSavingTitleOptions(true);
    const saved = await saveProfile({
      workout_title_options: removeHealthWorkoutTitleOption(savedWorkoutTitles, title),
    });
    setIsSavingTitleOptions(false);
    if (!saved) {
      setSavedTitleError("Saved workout titles could not be saved.");
    } else {
      setSavedTitleError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = buildHealthWorkoutFormPayload(draft, today);
    if (!result.value || result.error) {
      setFormError(result.error ?? "Enter the workout details.");
      return;
    }

    const saved = editingWorkoutId
      ? await updateWorkout(editingWorkoutId, {
        active_calories: result.value.active_calories ?? null,
        duration_seconds: result.value.duration_seconds,
        ended_at: result.value.ended_at ?? null,
        notes: result.value.notes ?? "",
        started_at: result.value.started_at ?? null,
        title: result.value.title,
        workout_date: result.value.workout_date,
        workout_type: result.value.workout_type,
      })
      : await addWorkout(result.value);
    if (saved) {
      resetForm();
    }
  }

  return (
    <div aria-labelledby="health-tab-fitness" className="mt-6 grid gap-5" id="health-panel-fitness" role="tabpanel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Fitness</p>
          <p className="mt-1 text-sm text-[#73809c] dark:text-white/55">Keep daily movement metrics separate from individual workout sessions.</p>
        </div>
        <AdhdChip icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={isFormOpen ? resetForm : openCreateForm} tone="purple" type="button">
          {isFormOpen ? "Cancel" : "Log Workout"}
        </AdhdChip>
      </div>

      <div className="rounded-[1.25rem] border border-[#eeeaf8] bg-[#fbfaff] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bookmark aria-hidden="true" className="h-4 w-4 text-[#6f57f6] dark:text-[#cabfff]" />
              <h2 className="text-sm font-bold text-[#26324f] dark:text-white">Saved Workout Titles</h2>
            </div>
            <p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Reusable suggestions for the free-text workout title.</p>
          </div>
          <form className="flex min-w-0 flex-1 flex-wrap justify-end gap-2 sm:flex-none" onSubmit={(event) => { void handleAddSavedTitle(event); }}>
            <input
              aria-label="Saved workout title"
              className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-[12rem] flex-1 sm:w-52 sm:flex-none`}
              disabled={isSavingTitleOptions}
              maxLength={HEALTH_WORKOUT_TITLE_MAX_LENGTH}
              onChange={(event) => {
                setSavedTitleDraft(event.target.value);
                setSavedTitleError(null);
              }}
              placeholder="Add a reusable title"
              type="text"
              value={savedTitleDraft}
            />
            <AdhdChip disabled={isSavingTitleOptions} tone="purple" type="submit">Add</AdhdChip>
          </form>
        </div>
        {savedTitleError ? <p className="mt-2 text-xs text-[#d65775] dark:text-[#ffb0c1]" role="alert">{savedTitleError}</p> : null}
        {savedWorkoutTitles.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {savedWorkoutTitles.map((title) => (
              <div className="inline-flex items-center gap-1" key={title}>
                <AdhdChip className="pointer-events-none" tone="purple" type="button">{title}</AdhdChip>
                <AdhdIconButton
                  aria-label={`Remove saved workout title ${title}`}
                  disabled={isSavingTitleOptions}
                  onClick={() => { void handleRemoveSavedTitle(title); }}
                  size="sm"
                  tone="danger"
                  variant="rowToolbar"
                >
                  <X aria-hidden="true" />
                </AdhdIconButton>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-[#8d87a7] dark:text-white/40">No saved titles yet.</p>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <HealthCollapsiblePanel
          header={<Activity aria-hidden="true" className="mt-0.5 h-6 w-6 text-[#6f57f6] dark:text-[#cabfff]" />}
          subtitle="Existing daily movement goals"
          title="Today"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <FitnessStatCard
              detail={profile.movement_goal === null ? "No goal set" : `goal ${formatWholeNumber(profile.movement_goal)}`}
              label="Steps"
              progressPercent={progressForGoal(dailyMovement.steps, profile.movement_goal)}
              value={formatWholeNumber(dailyMovement.steps)}
            />
            <FitnessStatCard
              detail={profile.movement_goal_calories === null ? "No goal set" : `goal ${formatWholeNumber(profile.movement_goal_calories)} kcal`}
              label="Active Calories"
              progressPercent={progressForGoal(dailyMovement.activeEnergyKcal, profile.movement_goal_calories)}
              value={`${formatWholeNumber(dailyMovement.activeEnergyKcal)} kcal`}
            />
            <FitnessStatCard
              detail={profile.movement_goal_minutes === null ? "No goal set" : `goal ${formatWholeNumber(profile.movement_goal_minutes)} min`}
              label="Exercise"
              progressPercent={progressForGoal(dailyMovement.exerciseMinutes, profile.movement_goal_minutes)}
              value={`${formatWholeNumber(dailyMovement.exerciseMinutes)} min`}
            />
          </div>
        </HealthCollapsiblePanel>

        <HealthCollapsiblePanel
          header={<Timer aria-hidden="true" className="mt-0.5 h-6 w-6 text-[#6f57f6] dark:text-[#cabfff]" />}
          subtitle={`${formatHealthDateLabel(weeklySummary.startDate)} – ${formatHealthDateLabel(weeklySummary.endDate)}`}
          title="This Week"
        >
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <FitnessStatCard detail="logged sessions" label="Workouts" value={String(weeklySummary.workouts)} />
            <FitnessStatCard detail="workout ledger only" label="Workout Minutes" value={formatMinutes(weeklySummary.workoutMinutes)} />
            <FitnessStatCard detail="workout ledger only" label="Workout Active Calories" value={`${formatWholeNumber(weeklySummary.workoutActiveCalories)} kcal`} />
          </div>
        </HealthCollapsiblePanel>
      </div>

      <HealthCollapsiblePanel
        header={<Flame aria-hidden="true" className="mt-0.5 h-6 w-6 text-[#6f57f6] dark:text-[#cabfff]" />}
        onOpenChange={setIsHistoryPanelOpen}
        open={isFormOpen || isHistoryPanelOpen}
        subtitle="Canonical workout ledger"
        title="Workout History"
      >
        {isFormOpen ? (
          <form className="mb-5 grid gap-4 rounded-[1.25rem] border border-[#eeeaf8] bg-[#fbfaff] p-4 dark:border-white/10 dark:bg-white/[0.03]" onSubmit={handleSubmit} ref={workoutFormRef}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[#26324f] dark:text-white">{editingWorkoutId ? "Edit Workout" : "Log Workout"}</h3>
              <span className="text-xs text-[#7d7598] dark:text-white/50">Manual workouts do not change daily movement metrics.</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FitnessField label="Workout type">
                <HealthDropdown ariaLabel="Workout type" onChange={(value) => setDraft((current) => ({ ...current, workoutType: value }))} options={WORKOUT_TYPE_OPTIONS} value={draft.workoutType} />
              </FitnessField>
              <FitnessField label="Title (optional)">
                <HealthAutocomplete
                  ariaLabel="Workout title"
                  onChange={(value) => setDraft((current) => ({ ...current, title: value }))}
                  placeholder="Uses workout type if blank"
                  suggestions={savedWorkoutTitles}
                  value={draft.title}
                />
              </FitnessField>
              <FitnessField label="Date">
                <input aria-label="Workout date" className={HEALTH_COMPACT_INPUT_CLASS} max={today} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} type="date" value={draft.date} />
              </FitnessField>
              <FitnessField label="Start time (optional)">
                <input aria-label="Workout start time" className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))} type="time" value={draft.startTime} />
              </FitnessField>
              <FitnessField label="Duration (minutes)">
                <input aria-label="Workout duration minutes" className={HEALTH_COMPACT_INPUT_CLASS} min="1" onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: event.target.value }))} step="1" type="number" value={draft.durationMinutes} />
              </FitnessField>
              <FitnessField label="Active calories (optional)">
                <input aria-label="Workout active calories" className={HEALTH_COMPACT_INPUT_CLASS} min="0" onChange={(event) => setDraft((current) => ({ ...current, activeCalories: event.target.value }))} step="1" type="number" value={draft.activeCalories} />
              </FitnessField>
            </div>
            <FitnessField label="Notes (optional)">
              <textarea aria-label="Workout notes" className="health-input min-h-20 w-full resize-y rounded-[1rem] px-3 py-2 text-[13px] max-sm:text-[16px]" onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} value={draft.notes} />
            </FitnessField>
            {formError ? <p className="text-sm text-[#d65775] dark:text-[#ffb0c1]" role="alert">{formError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <AdhdChip tone="purple" type="submit">{editingWorkoutId ? "Save Changes" : "Save Workout"}</AdhdChip>
              <AdhdChip onClick={resetForm} type="button">Cancel</AdhdChip>
            </div>
          </form>
        ) : null}

        {orderedWorkouts.length === 0 ? (
          <p className="rounded-[1.25rem] border border-dashed border-[#ddd7ef] px-4 py-5 text-sm text-[#7d7598] dark:border-white/15 dark:text-white/50">Logged workouts will appear here.</p>
        ) : (
          <div className="grid gap-3">
            {orderedWorkouts.map((workout) => (
              <WorkoutHistoryRow key={workout.id} onDelete={deleteWorkout} onEdit={openEditForm} workout={workout} />
            ))}
          </div>
        )}
      </HealthCollapsiblePanel>
    </div>
  );
}

function WorkoutHistoryRow({
  onDelete,
  onEdit,
  workout,
}: {
  onDelete: (workoutId: string) => Promise<boolean>;
  onEdit: (workout: HealthWorkout) => void;
  workout: HealthWorkout;
}) {
  const startTime = formatMealLoggedTime(workout.started_at ?? "");
  return (
    <article className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-[#26324f] dark:text-white">{workout.title}</h3>
            <AdhdChip className="pointer-events-none" tone="purple" type="button">{workout.workout_type}</AdhdChip>
          </div>
          <p className="mt-1 text-xs text-[#74809b] dark:text-white/50">
            {formatHealthDateLabel(workout.workout_date)}{startTime ? ` · ${startTime}` : ""} · {formatWorkoutDuration(workout.duration_seconds)}
            {workout.active_calories === null ? "" : ` · ${formatWholeNumber(workout.active_calories)} kcal`}
          </p>
          {workout.notes.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#5d6783] dark:text-white/65">{workout.notes}</p> : null}
        </div>
        {workout.source === "manual" ? (
          <div className="flex shrink-0 items-center gap-1">
            <AdhdIconButton aria-label={`Edit ${workout.title}`} onClick={() => onEdit(workout)} size="sm" variant="rowToolbar">
              <Pencil aria-hidden="true" />
            </AdhdIconButton>
            <AdhdIconButton aria-label={`Delete ${workout.title}`} onClick={() => void onDelete(workout.id)} size="sm" tone="danger" variant="rowToolbar">
              <Trash2 aria-hidden="true" />
            </AdhdIconButton>
          </div>
        ) : null}
      </div>
      {workout.source !== "manual" ? <p className="mt-2 text-[11px] font-medium text-[#8d87a7] dark:text-white/40">Imported workout · editing unavailable</p> : null}
    </article>
  );
}

function FitnessStatCard({ detail, label, progressPercent, value }: { detail: string; label: string; progressPercent?: number | null; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-[#edf0fb] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{label}</p>
          <p className="mt-1 text-2xl font-black text-[#1e2744] dark:text-white">{value}</p>
          <p className="mt-1 text-xs text-[#73809c] dark:text-white/50">{detail}</p>
        </div>
        {progressPercent === undefined || progressPercent === null ? null : (
          <div aria-label={`${label} ${Math.round(progressPercent)}% of goal`} className="mt-1 w-16 shrink-0 rounded-full bg-[#ece8f8] p-1 dark:bg-white/10">
            <div className="h-2 rounded-full bg-[#6f57f6] transition-[width]" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function FitnessField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">{label}</span>
      {children}
    </label>
  );
}

function progressForGoal(value: number, goal: number | null) {
  return goal !== null && goal > 0 ? clampPercent((value / goal) * 100) : null;
}

function formatWholeNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function formatMinutes(minutes: number) {
  return `${Number(minutes.toFixed(1))} min`;
}

function formatWorkoutDuration(durationSeconds: number) {
  const minutes = durationSeconds / 60;
  return `${formatMinutes(minutes)}`;
}

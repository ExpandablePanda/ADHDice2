"use client";

import { Activity, Check, Flame, GripVertical, Pencil, Plus, Settings2, Timer, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import type {
  HealthExercise,
  HealthExerciseInsert,
  HealthExerciseUpdate,
  HealthFitnessPlan,
  HealthFitnessPlanInsert,
  HealthFitnessPlanItem,
  HealthFitnessPlanItemInsert,
  HealthFitnessPlanItemUpdate,
  HealthFitnessPlanUpdate,
  HealthMetricEntry,
  HealthProfile,
  HealthProfileUpdate,
  HealthWorkout,
  HealthWorkoutExercise,
  HealthWorkoutInsert,
  HealthWorkoutPlanItemLink,
  HealthWorkoutSet,
  HealthWorkoutUpdate,
} from "@/lib/database.types";
import type { HealthWorkoutSessionDetails, HealthWorkoutSessionSaveResult } from "@/hooks/useFitnessSessionDetails";
import {
  buildHealthWorkoutFormPayload,
  addHealthWorkoutTypeOption,
  addHealthWorkoutTitleOption,
  getHealthDailyMovementMetrics,
  getHealthWeeklyWorkoutSummary,
  HEALTH_WORKOUT_TYPES,
  HEALTH_WORKOUT_OPTION_MAX_LENGTH,
  HEALTH_WORKOUT_TITLE_MAX_LENGTH,
  renameHealthWorkoutTypeOption,
  renameHealthWorkoutTitleOption,
  removeHealthWorkoutTypeOption,
  removeHealthWorkoutTitleOption,
  sortHealthWorkouts,
  moveFitnessOption,
  type HealthWorkoutFormInput,
} from "@/lib/health-fitness";
import { getHealthWorkoutStructuredSummary, type HealthWorkoutStructuredDraft } from "@/lib/health-fitness-session";
import { getHealthWorkoutPlanItemIds } from "@/lib/health-fitness-plans";
import {
  clampPercent,
  formatHealthDateLabel,
  formatMealLoggedTime,
  getCurrentHealthDateTimeInputs,
  todayHealthDate,
} from "@/lib/health-utils";
import { HealthCollapsiblePanel } from "./health-collapsible-panel";
import { HealthAutocomplete, HealthDropdown, HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";
import { FitnessPlanAssociationPicker, HealthFitnessPlansPanel } from "./health-fitness-plans-panel";
import { HealthFitnessExerciseLibrary } from "./health-fitness-exercise-library";
import { HealthFitnessSessionEditor } from "./health-fitness-session-editor";

type HealthFitnessTabProps = {
  addWorkout: (input: Omit<HealthWorkoutInsert, "user_id">) => Promise<HealthWorkout | null>;
  archiveExercise: (exerciseId: string) => Promise<boolean>;
  archivePlan: (planId: string) => Promise<boolean>;
  archivePlanItem: (itemId: string) => Promise<boolean>;
  createExercise: (input: Omit<HealthExerciseInsert, "user_id" | "default_measurement">) => Promise<HealthExercise | null>;
  createPlan: (input: Omit<HealthFitnessPlanInsert, "user_id">) => Promise<HealthFitnessPlan | null>;
  createPlanItem: (input: Omit<HealthFitnessPlanItemInsert, "user_id">) => Promise<HealthFitnessPlanItem | null>;
  deleteWorkout: (workoutId: string) => Promise<boolean>;
  exerciseLibrary: HealthExercise[];
  metricEntries: HealthMetricEntry[];
  fitnessPlanError: string | null;
  fitnessPlansLoading: boolean;
  fitnessSessionError: string | null;
  fitnessSessionLoaded: boolean;
  fitnessSessionLoading: boolean;
  getWorkoutSessionDetails: (workoutId: string) => HealthWorkoutSessionDetails;
  planItems: HealthFitnessPlanItem[];
  plans: HealthFitnessPlan[];
  profile: HealthProfile;
  saveProfile: (updates: HealthProfileUpdate) => Promise<boolean>;
  saveWorkoutPlanItemLinks: (workoutId: string, planItemIds: readonly string[]) => Promise<boolean>;
  updatePlan: (planId: string, input: HealthFitnessPlanUpdate) => Promise<boolean>;
  updatePlanItem: (itemId: string, input: HealthFitnessPlanItemUpdate) => Promise<boolean>;
  updateExercise: (exerciseId: string, input: HealthExerciseUpdate) => Promise<boolean>;
  updateWorkout: (workoutId: string, input: HealthWorkoutUpdate) => Promise<boolean>;
  saveWorkoutSessionDetails: (workoutId: string, draft: HealthWorkoutStructuredDraft) => Promise<HealthWorkoutSessionSaveResult>;
  workoutPlanItemLinks: HealthWorkoutPlanItemLink[];
  workoutExercises: HealthWorkoutExercise[];
  workoutSets: HealthWorkoutSet[];
  workouts: HealthWorkout[];
};

function createDefaultWorkoutDraft(workoutTypes: readonly string[] = HEALTH_WORKOUT_TYPES, plannedItem?: HealthFitnessPlanItem): HealthWorkoutFormInput {
  const { date } = getCurrentHealthDateTimeInputs();
  return {
    activeCalories: "",
    date,
    durationMinutes: plannedItem?.expected_duration_seconds === null || plannedItem?.expected_duration_seconds === undefined ? "" : String(plannedItem.expected_duration_seconds / 60),
    notes: plannedItem?.notes ?? "",
    startTime: "",
    title: plannedItem?.title ?? "",
    workoutType: plannedItem?.workout_type ?? workoutTypes[0] ?? HEALTH_WORKOUT_TYPES[0],
  };
}

export function HealthFitnessTab({
  addWorkout,
  archiveExercise,
  archivePlan,
  archivePlanItem,
  createExercise,
  createPlan,
  createPlanItem,
  deleteWorkout,
  exerciseLibrary,
  fitnessPlanError,
  fitnessPlansLoading,
  fitnessSessionError,
  fitnessSessionLoaded,
  fitnessSessionLoading,
  getWorkoutSessionDetails,
  metricEntries,
  planItems,
  plans,
  profile,
  saveProfile,
  saveWorkoutPlanItemLinks,
  updatePlan,
  updatePlanItem,
  updateExercise,
  updateWorkout,
  saveWorkoutSessionDetails,
  workoutPlanItemLinks,
  workoutExercises,
  workoutSets,
  workouts,
}: HealthFitnessTabProps) {
  const today = todayHealthDate();
  const [draft, setDraft] = useState<HealthWorkoutFormInput>(() => createDefaultWorkoutDraft());
  const [structuredDraft, setStructuredDraft] = useState<HealthWorkoutStructuredDraft>({ exercises: [] });
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedPlanItemIds, setSelectedPlanItemIds] = useState<string[]>([]);
  const [revealRequest, setRevealRequest] = useState(0);
  const [workoutTypeDraft, setWorkoutTypeDraft] = useState("");
  const [workoutTypeError, setWorkoutTypeError] = useState<string | null>(null);
  const [editingWorkoutType, setEditingWorkoutType] = useState<string | null>(null);
  const [editingWorkoutTypeDraft, setEditingWorkoutTypeDraft] = useState("");
  const [savedTitleDraft, setSavedTitleDraft] = useState("");
  const [savedTitleError, setSavedTitleError] = useState<string | null>(null);
  const [editingSavedTitle, setEditingSavedTitle] = useState<string | null>(null);
  const [editingSavedTitleDraft, setEditingSavedTitleDraft] = useState("");
  const [isSavingTitleOptions, setIsSavingTitleOptions] = useState(false);
  const workoutFormRef = useRef<HTMLFormElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingRevealRef = useRef(false);
  const dailyMovement = useMemo(() => getHealthDailyMovementMetrics(metricEntries, today), [metricEntries, today]);
  const weeklySummary = useMemo(() => getHealthWeeklyWorkoutSummary(workouts, today), [today, workouts]);
  const orderedWorkouts = useMemo(() => sortHealthWorkouts(workouts), [workouts]);
  const structuredSummaries = useMemo(
    () => new Map(orderedWorkouts.map((workout) => [workout.id, getHealthWorkoutStructuredSummary(workout.id, workoutExercises, workoutSets)])),
    [orderedWorkouts, workoutExercises, workoutSets],
  );
  const workoutTypes = useMemo(
    () => profile.workout_type_options?.length ? profile.workout_type_options : [...HEALTH_WORKOUT_TYPES],
    [profile.workout_type_options],
  );
  const workoutTypeOptions = useMemo(() => {
    const options = workoutTypes.map((type) => ({ label: type, value: type }));
    if (editingWorkoutId && draft.workoutType && !workoutTypes.includes(draft.workoutType)) {
      return [{ label: `${draft.workoutType} (historical)`, value: draft.workoutType }, ...options];
    }
    return options;
  }, [draft.workoutType, editingWorkoutId, workoutTypes]);
  const savedWorkoutTitles = profile.workout_title_options ?? [];

  useEffect(() => {
    if (!isFormOpen || !pendingRevealRef.current) {
      return;
    }
    pendingRevealRef.current = false;
    workoutFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isFormOpen, revealRequest]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }
    function handleOutsidePointerDown(event: PointerEvent) {
      if (!settingsMenuRef.current?.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isSettingsOpen]);

  function resetForm() {
    setDraft(createDefaultWorkoutDraft());
    setStructuredDraft({ exercises: [] });
    setEditingWorkoutId(null);
    setFormError(null);
    setSelectedPlanItemIds([]);
    setIsFormOpen(false);
    pendingRevealRef.current = false;
  }

  function queueFormReveal() {
    setIsHistoryPanelOpen(true);
    pendingRevealRef.current = true;
    setRevealRequest((current) => current + 1);
  }

  function openCreateForm() {
    openWorkoutForm();
  }

  function openPlannedItemForm(plannedItem: HealthFitnessPlanItem) {
    openWorkoutForm(plannedItem);
  }

  function openWorkoutForm(plannedItem?: HealthFitnessPlanItem) {
    setDraft(createDefaultWorkoutDraft(workoutTypes, plannedItem));
    setStructuredDraft({ exercises: [] });
    setEditingWorkoutId(null);
    setFormError(null);
    setSelectedPlanItemIds(plannedItem ? [plannedItem.id] : []);
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
    const details = getWorkoutSessionDetails(workout.id);
    setStructuredDraft({
      exercises: details.exercises.map((exercise) => ({
        exerciseId: exercise.exercise_id,
        exerciseName: exercise.exercise_name,
        id: exercise.id,
        measurementType: exercise.measurement_type,
        notes: exercise.notes ?? "",
        sets: details.sets
          .filter((set) => set.workout_exercise_id === exercise.id)
          .sort((left, right) => left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at))
          .map((set) => ({
            durationSeconds: set.duration_seconds === null ? "" : String(set.duration_seconds),
            id: set.id,
            notes: set.notes ?? "",
            reps: set.reps === null ? "" : String(set.reps),
          })),
      })),
    });
    setEditingWorkoutId(workout.id);
    setFormError(null);
    setSelectedPlanItemIds(getHealthWorkoutPlanItemIds(workout.id, workoutPlanItemLinks));
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

  async function saveWorkoutTypeOptions(nextOptions: string[], errorMessage: string) {
    setIsSavingTitleOptions(true);
    const saved = await saveProfile({ workout_type_options: nextOptions });
    setIsSavingTitleOptions(false);
    if (!saved) {
      setWorkoutTypeError(errorMessage);
    } else {
      setWorkoutTypeError(null);
    }
    return saved;
  }

  async function handleAddWorkoutType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = addHealthWorkoutTypeOption(workoutTypes, workoutTypeDraft);
    if (result.error || !result.value) {
      setWorkoutTypeError(result.error);
      return;
    }
    if (await saveWorkoutTypeOptions(result.value, "Workout types could not be saved.")) {
      setWorkoutTypeDraft("");
    }
  }

  async function handleRenameWorkoutType(currentValue: string) {
    const result = renameHealthWorkoutTypeOption(workoutTypes, currentValue, editingWorkoutTypeDraft);
    if (result.error || !result.value) {
      setWorkoutTypeError(result.error);
      return;
    }
    if (await saveWorkoutTypeOptions(result.value, "Workout types could not be saved.")) {
      setEditingWorkoutType(null);
      setEditingWorkoutTypeDraft("");
    }
  }

  async function handleRemoveWorkoutType(type: string) {
    const result = removeHealthWorkoutTypeOption(workoutTypes, type);
    if (result.error || !result.value) {
      setWorkoutTypeError(result.error);
      return;
    }
    await saveWorkoutTypeOptions(result.value, "Workout types could not be saved.");
  }

  async function handleRenameSavedTitle(currentValue: string) {
    const result = renameHealthWorkoutTitleOption(savedWorkoutTitles, currentValue, editingSavedTitleDraft);
    if (result.error || !result.value) {
      setSavedTitleError(result.error);
      return;
    }
    setIsSavingTitleOptions(true);
    const saved = await saveProfile({ workout_title_options: result.value });
    setIsSavingTitleOptions(false);
    if (saved) {
      setEditingSavedTitle(null);
      setEditingSavedTitleDraft("");
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

    if (editingWorkoutId) {
      const saved = await updateWorkout(editingWorkoutId, {
        active_calories: result.value.active_calories ?? null,
        duration_seconds: result.value.duration_seconds,
        ended_at: result.value.ended_at ?? null,
        notes: result.value.notes ?? "",
        started_at: result.value.started_at ?? null,
        title: result.value.title,
        workout_date: result.value.workout_date,
        workout_type: result.value.workout_type,
      });
      if (!saved) {
        return;
      }
      const structuredSave = await saveWorkoutSessionDetails(editingWorkoutId, structuredDraft);
      setStructuredDraft(structuredSave.draft);
      if (!structuredSave.ok) {
        setFormError("Workout updated, but exercise details could not be saved. Try again.");
        return;
      }
      const hasExistingOrSelectedLinks = workoutPlanItemLinks.some((link) => link.workout_id === editingWorkoutId) || selectedPlanItemIds.length > 0;
      if (hasExistingOrSelectedLinks && !(await saveWorkoutPlanItemLinks(editingWorkoutId, selectedPlanItemIds))) {
        setFormError("Workout updated, but its Fitness Plan associations could not be saved. Try again.");
        return;
      }
      resetForm();
      return;
    }

    const savedWorkout = await addWorkout(result.value);
    if (!savedWorkout) {
      return;
    }
    setEditingWorkoutId(savedWorkout.id);
    if (structuredDraft.exercises.length > 0) {
      const structuredSave = await saveWorkoutSessionDetails(savedWorkout.id, structuredDraft);
      setStructuredDraft(structuredSave.draft);
      if (!structuredSave.ok) {
        setFormError("Workout saved, but exercise details could not be saved. Try again.");
        return;
      }
    }
    if (selectedPlanItemIds.length > 0 && !(await saveWorkoutPlanItemLinks(savedWorkout.id, selectedPlanItemIds))) {
      setFormError("Workout saved, but its Fitness Plan associations could not be saved. Try again.");
      return;
    }
    resetForm();
  }

  return (
    <div aria-labelledby="health-tab-fitness" className="mt-6 grid gap-5" id="health-panel-fitness" role="tabpanel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Fitness</p>
          <p className="mt-1 text-sm text-[#73809c] dark:text-white/55">Keep daily movement metrics separate from individual workout sessions.</p>
        </div>
        <div className="relative flex flex-wrap items-center justify-end gap-2" ref={settingsMenuRef}>
          <AdhdChip
            aria-expanded={isSettingsOpen}
            aria-haspopup="dialog"
            icon={<Settings2 aria-hidden="true" className="h-3.5 w-3.5" />}
            onClick={() => setIsSettingsOpen((current) => !current)}
            selected={isSettingsOpen}
            tone="purple"
            type="button"
          >
            Fitness Settings
          </AdhdChip>
          <AdhdChip icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={isFormOpen ? resetForm : openCreateForm} tone="purple" type="button">
            {isFormOpen ? "Cancel" : "Log Workout"}
          </AdhdChip>
          {isSettingsOpen ? (
            <div
              aria-label="Fitness Settings"
              className="adhdice-scrollbar absolute right-0 top-[calc(100%+0.55rem)] z-40 grid max-h-[min(70vh,34rem)] w-[min(36rem,calc(100vw-2rem))] gap-4 overflow-y-auto rounded-[1.25rem] border border-[#ede6ff] bg-white/95 p-4 text-left shadow-[0_20px_60px_rgba(111,87,246,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95"
            >
              <div>
                <h2 className="text-sm font-bold text-[#26324f] dark:text-white">Fitness Settings</h2>
                <p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Configure future workout entry choices. Existing workouts keep their logged values.</p>
              </div>

              <section className="grid gap-2" aria-labelledby="fitness-settings-types">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6f57f6] dark:text-[#cabfff]" id="fitness-settings-types">Workout Types</h3>
                    <p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Available in the manual workout dropdown.</p>
                  </div>
                </div>
                <form className="flex flex-wrap gap-2" onSubmit={(event) => { void handleAddWorkoutType(event); }}>
                  <input
                    aria-label="Add workout type"
                    className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-[12rem] flex-1`}
                    disabled={isSavingTitleOptions}
                    maxLength={HEALTH_WORKOUT_OPTION_MAX_LENGTH}
                    onChange={(event) => {
                      setWorkoutTypeDraft(event.target.value);
                      setWorkoutTypeError(null);
                    }}
                    placeholder="Add a workout type"
                    type="text"
                    value={workoutTypeDraft}
                  />
                  <AdhdChip disabled={isSavingTitleOptions} tone="purple" type="submit">Add</AdhdChip>
                </form>
                {workoutTypeError ? <p className="text-xs text-[#d65775] dark:text-[#ffb0c1]" role="alert">{workoutTypeError}</p> : null}
                <FitnessOptionReorderList
                  disabled={isSavingTitleOptions}
                  label="workout type"
                  onSave={(nextOptions) => saveWorkoutTypeOptions(nextOptions, "Workout types could not be saved.")}
                  options={workoutTypes}
                  renderOption={(type) => editingWorkoutType === type ? (
                    <form className="flex min-w-0 flex-1 flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void handleRenameWorkoutType(type); }}>
                      <input
                        aria-label={`Rename workout type ${type}`}
                        className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-[12rem] flex-1`}
                        disabled={isSavingTitleOptions}
                        maxLength={HEALTH_WORKOUT_OPTION_MAX_LENGTH}
                        onChange={(event) => {
                          setEditingWorkoutTypeDraft(event.target.value);
                          setWorkoutTypeError(null);
                        }}
                        type="text"
                        value={editingWorkoutTypeDraft}
                      />
                      <AdhdIconButton aria-label="Save workout type rename" disabled={isSavingTitleOptions} size="sm" tone="purple" variant="rowToolbar" type="submit"><Check aria-hidden="true" /></AdhdIconButton>
                      <AdhdIconButton aria-label="Cancel workout type rename" disabled={isSavingTitleOptions} onClick={() => setEditingWorkoutType(null)} size="sm" tone="default" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton>
                    </form>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <AdhdChip className="pointer-events-none min-w-0 truncate" tone="purple" type="button">{type}</AdhdChip>
                      <div className="flex items-center gap-1">
                        <AdhdIconButton aria-label={`Rename workout type ${type}`} disabled={isSavingTitleOptions} onClick={() => { setEditingWorkoutType(type); setEditingWorkoutTypeDraft(type); }} size="sm" tone="default" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton>
                        <AdhdIconButton aria-label={`Remove workout type ${type}`} disabled={isSavingTitleOptions || workoutTypes.length <= 1} onClick={() => { void handleRemoveWorkoutType(type); }} size="sm" tone="danger" variant="rowToolbar"><Trash2 aria-hidden="true" /></AdhdIconButton>
                      </div>
                    </div>
                  )}
                />
              </section>

              <section className="grid gap-2 border-t border-[#eeeaf8] pt-4 dark:border-white/10" aria-labelledby="fitness-settings-titles">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6f57f6] dark:text-[#cabfff]" id="fitness-settings-titles">Workout Titles</h3>
                  <p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Reusable suggestions for the free-text workout title.</p>
                </div>
                <form className="flex flex-wrap gap-2" onSubmit={(event) => { void handleAddSavedTitle(event); }}>
                  <input
                    aria-label="Saved workout title"
                    className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-[12rem] flex-1`}
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
                {savedTitleError ? <p className="text-xs text-[#d65775] dark:text-[#ffb0c1]" role="alert">{savedTitleError}</p> : null}
                {savedWorkoutTitles.length > 0 ? (
                  <FitnessOptionReorderList
                    disabled={isSavingTitleOptions}
                    label="saved workout title"
                    onSave={(nextOptions) => saveProfile({ workout_title_options: nextOptions })}
                    options={savedWorkoutTitles}
                    renderOption={(title) => editingSavedTitle === title ? (
                      <form className="flex min-w-0 flex-1 flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void handleRenameSavedTitle(title); }}>
                        <input
                          aria-label={`Rename saved workout title ${title}`}
                          className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-[12rem] flex-1`}
                          disabled={isSavingTitleOptions}
                          maxLength={HEALTH_WORKOUT_TITLE_MAX_LENGTH}
                          onChange={(event) => {
                            setEditingSavedTitleDraft(event.target.value);
                            setSavedTitleError(null);
                          }}
                          type="text"
                          value={editingSavedTitleDraft}
                        />
                        <AdhdIconButton aria-label="Save saved workout title rename" disabled={isSavingTitleOptions} size="sm" tone="purple" variant="rowToolbar" type="submit"><Check aria-hidden="true" /></AdhdIconButton>
                        <AdhdIconButton aria-label="Cancel saved workout title rename" disabled={isSavingTitleOptions} onClick={() => setEditingSavedTitle(null)} size="sm" tone="default" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton>
                      </form>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <AdhdChip className="pointer-events-none min-w-0 truncate" tone="purple" type="button">{title}</AdhdChip>
                        <div className="flex items-center gap-1">
                          <AdhdIconButton aria-label={`Rename saved workout title ${title}`} disabled={isSavingTitleOptions} onClick={() => { setEditingSavedTitle(title); setEditingSavedTitleDraft(title); }} size="sm" tone="default" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton>
                          <AdhdIconButton aria-label={`Remove saved workout title ${title}`} disabled={isSavingTitleOptions} onClick={() => { void handleRemoveSavedTitle(title); }} size="sm" tone="danger" variant="rowToolbar"><Trash2 aria-hidden="true" /></AdhdIconButton>
                        </div>
                      </div>
                    )}
                  />
                ) : (
                  <p className="text-xs text-[#8d87a7] dark:text-white/40">No saved titles yet.</p>
                )}
              </section>

              <HealthFitnessExerciseLibrary
                archiveExercise={archiveExercise}
                createExercise={createExercise}
                error={fitnessSessionError}
                exerciseLibrary={exerciseLibrary}
                isLoading={fitnessSessionLoading}
                updateExercise={updateExercise}
              />
            </div>
          ) : null}
        </div>
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

      <HealthFitnessPlansPanel
        archivePlan={archivePlan}
        archivePlanItem={archivePlanItem}
        createPlan={createPlan}
        createPlanItem={createPlanItem}
        createPlanTypes={workoutTypes}
        error={fitnessPlanError}
        isLoading={fitnessPlansLoading}
        onLogPlannedItem={openPlannedItemForm}
        planItems={planItems}
        plans={plans}
        updatePlan={updatePlan}
        updatePlanItem={updatePlanItem}
        workoutPlanItemLinks={workoutPlanItemLinks}
        workouts={workouts}
      />

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
                <HealthDropdown ariaLabel="Workout type" onChange={(value) => setDraft((current) => ({ ...current, workoutType: value }))} options={workoutTypeOptions} value={draft.workoutType} />
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
            {fitnessSessionLoading && !fitnessSessionLoaded ? <p className="text-xs text-[#7d7598] dark:text-white/50">Loading structured exercise details…</p> : null}
            <HealthFitnessSessionEditor draft={structuredDraft} exerciseLibrary={exerciseLibrary} onChange={setStructuredDraft} />
            <FitnessPlanAssociationPicker
              onToggle={(planItemId) => setSelectedPlanItemIds((current) => current.includes(planItemId) ? current.filter((id) => id !== planItemId) : [...current, planItemId])}
              planItems={planItems}
              plans={plans}
              selectedPlanItemIds={selectedPlanItemIds}
            />
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
              <WorkoutHistoryRow key={workout.id} onDelete={deleteWorkout} onEdit={openEditForm} structuredSummary={structuredSummaries.get(workout.id) ?? []} workout={workout} />
            ))}
          </div>
        )}
      </HealthCollapsiblePanel>
    </div>
  );
}

type FitnessOptionReorderListProps = {
  disabled?: boolean;
  label: string;
  onSave: (options: string[]) => Promise<boolean>;
  options: readonly string[];
  renderOption: (option: string, index: number) => ReactNode;
};

type FitnessOptionDragState = {
  currentIndex: number;
  fromIndex: number;
  handle: HTMLButtonElement;
  pointerId: number;
  startingOptions: string[];
};

type FitnessOptionRowGeometry = {
  midpoint: number;
};

function areFitnessOptionOrdersEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((option, index) => option === right[index]);
}

function FitnessOptionReorderList({
  disabled = false,
  label,
  onSave,
  options,
  renderOption,
}: FitnessOptionReorderListProps) {
  const [previewOptions, setPreviewOptions] = useState<string[] | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragRef = useRef<FitnessOptionDragState | null>(null);
  const optionsRef = useRef<string[]>([...options]);
  const previewRef = useRef<string[] | null>(null);
  const committedPreviewRef = useRef<string[] | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const rowGeometryRef = useRef<Array<FitnessOptionRowGeometry | null>>([]);
  const pendingPointerYRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const visibleOptions = previewOptions ?? options;

  useEffect(() => {
    optionsRef.current = [...options];
    const committedOptions = committedPreviewRef.current;
    if (committedOptions && !dragRef.current && areFitnessOptionOrdersEqual(options, committedOptions)) {
      committedPreviewRef.current = null;
      previewRef.current = null;
      setPreviewOptions(null);
    }
  }, [options]);

  function clearCommittedPreview(committedOptions: string[]) {
    if (committedPreviewRef.current !== committedOptions) {
      return;
    }
    committedPreviewRef.current = null;
    if (previewRef.current === committedOptions) {
      previewRef.current = null;
      setPreviewOptions(null);
    }
  }

  async function persistCommittedPreview(committedOptions: string[]) {
    let saved = false;
    try {
      saved = await onSave(committedOptions);
    } catch {
      saved = false;
    }
    if (!saved) {
      clearCommittedPreview(committedOptions);
    }
  }

  function cancelScheduledPointerMove() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    pendingPointerYRef.current = null;
  }

  function clearDragState(pointerId?: number) {
    const drag = dragRef.current;
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) {
      return;
    }

    cancelScheduledPointerMove();
    dragRef.current = null;
    setDraggingIndex(null);
    const nextOptions = previewRef.current;
    rowGeometryRef.current = [];
    if (drag.handle.hasPointerCapture(drag.pointerId)) {
      drag.handle.releasePointerCapture(drag.pointerId);
    }
    if (!nextOptions || areFitnessOptionOrdersEqual(nextOptions, drag.startingOptions)) {
      const committedOptions = committedPreviewRef.current;
      if (!committedOptions) {
        previewRef.current = null;
        setPreviewOptions(null);
      } else if (areFitnessOptionOrdersEqual(optionsRef.current, committedOptions)) {
        clearCommittedPreview(committedOptions);
      }
      return;
    }
    const committedOptions = [...nextOptions];
    committedPreviewRef.current = committedOptions;
    previewRef.current = committedOptions;
    void persistCommittedPreview(committedOptions);
  }

  function getTargetIndex(clientY: number, currentIndex: number) {
    let targetIndex = currentIndex;
    for (let index = 0; index < rowGeometryRef.current.length; index += 1) {
      const geometry = rowGeometryRef.current[index];
      if (!geometry) {
        continue;
      }
      if (clientY < geometry.midpoint) {
        return index;
      }
      targetIndex = index;
    }
    return targetIndex;
  }

  function cacheRowGeometry(optionCount: number) {
    rowGeometryRef.current = rowRefs.current.slice(0, optionCount).map((row) => {
      if (!row) {
        return null;
      }
      const bounds = row.getBoundingClientRect();
      return { midpoint: bounds.top + bounds.height / 2 };
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startingOptions = [...(previewRef.current ?? optionsRef.current)];
    cacheRowGeometry(startingOptions.length);
    dragRef.current = {
      currentIndex: index,
      fromIndex: index,
      handle: event.currentTarget,
      pointerId: event.pointerId,
      startingOptions,
    };
    previewRef.current = startingOptions;
    setPreviewOptions(startingOptions);
    setDraggingIndex(index);
  }

  function processPointerMove(clientY: number) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const currentOptions = previewRef.current ?? optionsRef.current;
    const targetIndex = getTargetIndex(clientY, drag.currentIndex);
    if (targetIndex === drag.currentIndex) {
      return;
    }
    const nextOptions = moveFitnessOption(currentOptions, drag.currentIndex, targetIndex);
    drag.currentIndex = targetIndex;
    previewRef.current = nextOptions;
    setPreviewOptions(nextOptions);
    setDraggingIndex(targetIndex);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pendingPointerYRef.current = event.clientY;
    if (animationFrameRef.current !== null) {
      return;
    }
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const pointerY = pendingPointerYRef.current;
      pendingPointerYRef.current = null;
      if (pointerY !== null) {
        processPointerMove(pointerY);
      }
    });
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "pointerup" && pendingPointerYRef.current !== null) {
      const pointerY = pendingPointerYRef.current;
      cancelScheduledPointerMove();
      processPointerMove(pointerY);
    }
    clearDragState(event.pointerId);
  }

  useEffect(() => () => {
    cancelScheduledPointerMove();
    dragRef.current = null;
    previewRef.current = null;
    committedPreviewRef.current = null;
    rowGeometryRef.current = [];
  }, []);

  return (
    <div className="grid gap-1.5" data-fitness-option-list={label}>
      {visibleOptions.map((option, index) => (
        <div
          className={`flex min-w-0 items-center gap-1.5 rounded-[0.9rem] ${draggingIndex === index ? "bg-[#f7f3ff] dark:bg-white/[0.06]" : ""}`}
          key={option}
          ref={(element) => {
            rowRefs.current[index] = element;
          }}
        >
          <button
            aria-grabbed={draggingIndex === index}
            aria-label={`Reorder ${label} ${option}`}
            className="touch-none inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-full text-[#8d87a7] hover:bg-[#f1ecff] hover:text-[#6f57f6] active:cursor-grabbing dark:text-white/45 dark:hover:bg-white/[0.08] dark:hover:text-[#cabfff]"
            disabled={disabled}
            draggable={false}
            onLostPointerCapture={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onPointerDown={(event) => handlePointerDown(event, index)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            type="button"
          >
            <GripVertical aria-hidden="true" className="h-4 w-4" />
          </button>
          {renderOption(option, index)}
        </div>
      ))}
    </div>
  );
}

function WorkoutHistoryRow({
  onDelete,
  onEdit,
  structuredSummary,
  workout,
}: {
  onDelete: (workoutId: string) => Promise<boolean>;
  onEdit: (workout: HealthWorkout) => void;
  structuredSummary: ReturnType<typeof getHealthWorkoutStructuredSummary>;
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
          {structuredSummary.length > 0 ? (
            <div className="mt-3 grid gap-1.5 border-t border-[#eeeaf8] pt-2 dark:border-white/10">
              {structuredSummary.map((summary, summaryIndex) => (
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm" key={`${summary.exerciseName}-${summaryIndex}`}>
                  <span className="font-semibold text-[#4a5470] dark:text-white/75">{summary.exerciseName}</span>
                  <span className="text-xs text-[#74809b] dark:text-white/50">{summary.values.join(" · ")}</span>
                </div>
              ))}
            </div>
          ) : null}
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

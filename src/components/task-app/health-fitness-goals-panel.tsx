"use client";

import { ArrowRight, Check, Pencil, Target, Trash2, Trophy, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import type {
  HealthExercise,
  HealthFitnessGoal,
  HealthFitnessGoalInsert,
  HealthFitnessGoalLevel,
  HealthFitnessGoalLevelInsert,
  HealthFitnessGoalLevelUpdate,
  HealthFitnessGoalUpdate,
  HealthFitnessPerformanceMetric,
  HealthWorkout,
  HealthWorkoutExercise,
  HealthWorkoutSet,
} from "@/lib/database.types";
import {
  deriveHealthFitnessPerformanceObservations,
  getHealthFitnessCurrentPersonalRecord,
  getHealthFitnessGoalLevelStatuses,
  getHealthFitnessGoalStatus,
  HEALTH_FITNESS_PERFORMANCE_METRICS,
} from "@/lib/health-fitness-performance";
import { HealthCollapsiblePanel } from "./health-collapsible-panel";
import { HealthAutocomplete, HealthDropdown, HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";

const HEALTH_FITNESS_GOAL_METRIC_LABELS: Record<HealthFitnessPerformanceMetric, string> = {
  single_set_reps: "Single Set Reps",
  session_total_reps: "Session Total Reps",
  longest_set_duration: "Longest Set Duration",
  session_total_duration: "Session Total Duration",
};

export function getHealthFitnessGoalMetricOptions() {
  return HEALTH_FITNESS_PERFORMANCE_METRICS;
}

export function getHealthFitnessGoalMetricLabel(metric: HealthFitnessPerformanceMetric) {
  return HEALTH_FITNESS_GOAL_METRIC_LABELS[metric];
}

export function formatHealthFitnessGoalValue(metric: HealthFitnessPerformanceMetric, value: number) {
  if (metric === "single_set_reps" || metric === "session_total_reps") {
    return `${value} reps`;
  }
  if (value < 60) {
    return `${value} sec`;
  }
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

export function buildHealthFitnessGoalPresentation(
  goal: HealthFitnessGoal,
  levels: readonly HealthFitnessGoalLevel[],
  observations: ReturnType<typeof deriveHealthFitnessPerformanceObservations>,
) {
  return {
    currentRecord: getHealthFitnessCurrentPersonalRecord(observations, goal.exercise_id, goal.metric),
    levelStatuses: getHealthFitnessGoalLevelStatuses(goal, levels, observations),
    status: getHealthFitnessGoalStatus(goal, observations),
  };
}

export function getActiveHealthFitnessGoalExercises(exercises: readonly HealthExercise[]) {
  return exercises.filter((exercise) => exercise.archived_at === null);
}

type HealthFitnessGoalsPanelProps = {
  archiveGoal: (goalId: string) => Promise<boolean>;
  createGoal: (input: Omit<HealthFitnessGoalInsert, "user_id">) => Promise<HealthFitnessGoal | null>;
  createLevel: (input: Omit<HealthFitnessGoalLevelInsert, "user_id">) => Promise<HealthFitnessGoalLevel | null>;
  deleteLevel: (levelId: string) => Promise<boolean>;
  error: string | null;
  exerciseLibrary: HealthExercise[];
  goals: HealthFitnessGoal[];
  isLoading: boolean;
  levels: HealthFitnessGoalLevel[];
  restoreGoal: (goalId: string) => Promise<boolean>;
  updateGoal: (goalId: string, input: HealthFitnessGoalUpdate) => Promise<boolean>;
  updateLevel: (levelId: string, input: HealthFitnessGoalLevelUpdate) => Promise<boolean>;
  workoutExercises: HealthWorkoutExercise[];
  workoutSets: HealthWorkoutSet[];
  workouts: HealthWorkout[];
};

type GoalEditorState = {
  exerciseId: string;
  exerciseName: string;
  id: string | null;
  metric: HealthFitnessPerformanceMetric;
  target: string;
  title: string;
};

function getDefaultGoalTitle(exerciseName: string, metric: HealthFitnessPerformanceMetric) {
  return `${exerciseName} — ${getHealthFitnessGoalMetricLabel(metric)}`;
}

function createGoalEditor(exerciseLibrary: readonly HealthExercise[], goal?: HealthFitnessGoal): GoalEditorState {
  const exercise = exerciseLibrary.find((candidate) => candidate.id === goal?.exercise_id)
    ?? getActiveHealthFitnessGoalExercises(exerciseLibrary)[0];
  const metric = goal?.metric ?? getHealthFitnessGoalMetricOptions()[0] ?? "single_set_reps";
  return {
    exerciseId: goal?.exercise_id ?? exercise?.id ?? "",
    exerciseName: exercise?.name ?? "",
    id: goal?.id ?? null,
    metric,
    target: goal ? String(goal.target) : "",
    title: goal?.title ?? (exercise ? getDefaultGoalTitle(exercise.name, metric) : ""),
  };
}

export function HealthFitnessGoalsPanel({
  archiveGoal,
  createGoal,
  createLevel,
  deleteLevel,
  error,
  exerciseLibrary,
  goals,
  isLoading,
  levels,
  restoreGoal,
  updateGoal,
  updateLevel,
  workoutExercises,
  workoutSets,
  workouts,
}: HealthFitnessGoalsPanelProps) {
  const [editor, setEditor] = useState<GoalEditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const observations = useMemo(
    () => deriveHealthFitnessPerformanceObservations(workouts, workoutExercises, workoutSets),
    [workoutExercises, workoutSets, workouts],
  );
  const activeGoals = goals.filter((goal) => goal.archived_at === null);
  const archivedGoals = goals.filter((goal) => goal.archived_at !== null);

  function openCreateGoal() {
    setEditor(createGoalEditor(exerciseLibrary));
    setEditorError(null);
  }

  function openEditGoal(goal: HealthFitnessGoal) {
    setEditor(createGoalEditor(exerciseLibrary, goal));
    setEditorError(null);
  }

  function closeEditor() {
    if (isSaving) return;
    setEditor(null);
    setEditorError(null);
  }

  async function handleSaveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setIsSaving(true);
    const input = {
      exercise_id: editor.exerciseId,
      metric: editor.metric,
      target: Number(editor.target),
      title: editor.title,
    };
    const saved = editor.id ? await updateGoal(editor.id, input) : await createGoal(input);
    setIsSaving(false);
    if (!saved) {
      setEditorError("Fitness Goal could not be saved. Review the fields and try again.");
      return;
    }
    setEditor(null);
    setEditorError(null);
  }

  function selectExercise(exerciseId: string) {
    const exercise = exerciseLibrary.find((candidate) => candidate.id === exerciseId);
    if (!exercise) return;
    setEditor((current) => {
      if (!current) return current;
      const shouldRefreshDefaultTitle = !current.id
        && (!current.title.trim() || current.title === getDefaultGoalTitle(current.exerciseName, current.metric));
      return {
        ...current,
        exerciseId,
        exerciseName: exercise.name,
        title: shouldRefreshDefaultTitle ? getDefaultGoalTitle(exercise.name, current.metric) : current.title,
      };
    });
  }

  const activeExerciseSuggestions = exerciseLibrary
    .filter((exercise) => exercise.archived_at === null || exercise.id === editor?.exerciseId)
    .map((exercise) => ({
      label: exercise.archived_at === null ? exercise.name : `${exercise.name} (Archived exercise)`,
      value: exercise.id,
    }));
  const metricOptions = getHealthFitnessGoalMetricOptions();

  return (
    <HealthCollapsiblePanel
      header={<Target aria-hidden="true" className="mt-0.5 h-6 w-6 text-[#6f57f6] dark:text-[#cabfff]" />}
      shellSurface
      subtitle="Derived from your canonical workout observations"
      title="Fitness Goals"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-2xl text-sm text-[#73809c] dark:text-white/55">Goals and Levels save definitions only. Current PR and reached state update from the workout ledger.</p>
          <AdhdChip onClick={openCreateGoal} tone="purple" type="button">+ Goal</AdhdChip>
        </div>
        {error ? <p className="rounded-[1rem] border border-[#ffd8df] bg-[#fff2f4] px-3 py-2 text-xs text-[#bd4057] dark:border-[#5b2430] dark:bg-[#31141b] dark:text-[#ffb3bf]" role="alert">{error}</p> : null}
        {isLoading ? <p className="text-sm text-[#7d7598] dark:text-white/50">Loading Fitness Goals…</p> : null}
        {!isLoading && activeGoals.length === 0 ? (
          <div className="grid gap-2 rounded-[1rem] border border-dashed border-[#ddd7ef] px-3 py-4 dark:border-white/15">
            <p className="text-sm font-semibold text-[#4a5470] dark:text-white/75">No fitness goals yet.</p>
            <p className="text-sm text-[#7d7598] dark:text-white/50">Create a goal to track progress from your logged workouts.</p>
            <div><AdhdChip onClick={openCreateGoal} tone="purple" type="button">+ Goal</AdhdChip></div>
          </div>
        ) : null}
        {activeGoals.map((goal) => (
          <HealthFitnessGoalCard
            archived={false}
            deleteLevel={deleteLevel}
            exercise={exerciseLibrary.find((candidate) => candidate.id === goal.exercise_id)}
            goal={goal}
            key={goal.id}
            levels={levels}
            observations={observations}
            onArchive={() => { void archiveGoal(goal.id); }}
            onEdit={() => openEditGoal(goal)}
            updateLevel={updateLevel}
            createLevel={createLevel}
          />
        ))}
        {editor ? (
          <form aria-label={editor.id ? "Edit Fitness Goal" : "Create Fitness Goal"} className="grid gap-4 rounded-[1.25rem] border border-[#ddd2ff] bg-[#fbfaff] p-4 dark:border-[#42306f] dark:bg-white/[0.04]" onSubmit={(event) => { void handleSaveGoal(event); }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#26324f] dark:text-white">{editor.id ? "Edit Fitness Goal" : "Create Fitness Goal"}</h3>
                <p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Choose how you want to measure this goal.</p>
              </div>
              <AdhdIconButton aria-label="Close Fitness Goal editor" disabled={isSaving} onClick={closeEditor} size="sm" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 sm:col-span-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Exercise</span><HealthAutocomplete ariaLabel="Fitness Goal Exercise" onChange={(value) => setEditor((current) => current ? { ...current, exerciseId: "", exerciseName: value } : current)} onSelect={(suggestion) => selectExercise(suggestion.value)} placeholder="Search active exercises" suggestions={activeExerciseSuggestions} value={editor.exerciseName} /></label>
              <label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Metric</span><HealthGoalMetricDropdown metric={editor.metric} onChange={(metric) => setEditor((current) => current ? { ...current, metric, title: !current.id && current.title === getDefaultGoalTitle(current.exerciseName, current.metric) ? getDefaultGoalTitle(current.exerciseName, metric) : current.title } : current)} options={metricOptions} /></label>
              <label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Goal title</span><input aria-label="Fitness Goal title" className={HEALTH_COMPACT_INPUT_CLASS} disabled={isSaving} onChange={(event) => setEditor((current) => current ? { ...current, title: event.target.value } : current)} type="text" value={editor.title} /></label>
              <label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Target</span><input aria-label="Fitness Goal target" className={HEALTH_COMPACT_INPUT_CLASS} disabled={isSaving} min="1" step="1" type="number" onChange={(event) => setEditor((current) => current ? { ...current, target: event.target.value } : current)} value={editor.target} /></label>
            </div>
            {editorError ? <p className="text-sm text-[#d65775] dark:text-[#ffb0c1]" role="alert">{editorError}</p> : null}
            <div className="flex flex-wrap gap-2"><AdhdChip disabled={isSaving} tone="purple" type="submit">{isSaving ? "Saving…" : "Save Goal"}</AdhdChip><AdhdChip disabled={isSaving} onClick={closeEditor} type="button">Cancel</AdhdChip></div>
          </form>
        ) : null}
        {archivedGoals.length > 0 ? (
          <section className="grid gap-3 border-t border-[#eeeaf8] pt-4 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-sm font-bold text-[#4a5470] dark:text-white/75">Archived Goals</h3><p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Archived definitions stay available without mixing into active progress.</p></div>
              <AdhdChip aria-expanded={showArchived} onClick={() => setShowArchived((current) => !current)} selected={showArchived} type="button">{showArchived ? "Hide" : "Show"} Archived Goals</AdhdChip>
            </div>
            {showArchived ? archivedGoals.map((goal) => (
              <HealthFitnessGoalCard
                archived
                createLevel={createLevel}
                deleteLevel={deleteLevel}
                exercise={exerciseLibrary.find((candidate) => candidate.id === goal.exercise_id)}
                goal={goal}
                key={goal.id}
                levels={levels}
                observations={observations}
                onEdit={() => openEditGoal(goal)}
                onRestore={() => { void restoreGoal(goal.id); }}
                updateLevel={updateLevel}
              />
            )) : null}
          </section>
        ) : null}
      </div>
    </HealthCollapsiblePanel>
  );
}

function HealthGoalMetricDropdown({
  metric,
  onChange,
  options,
}: {
  metric: HealthFitnessPerformanceMetric;
  onChange: (metric: HealthFitnessPerformanceMetric) => void;
  options: readonly HealthFitnessPerformanceMetric[];
}) {
  const selectedOption = options.includes(metric) ? metric : options[0];
  return <HealthDropdown ariaLabel="Fitness Goal metric" onChange={(value) => onChange(value as HealthFitnessPerformanceMetric)} options={options.map((option) => ({ label: getHealthFitnessGoalMetricLabel(option), value: option }))} value={selectedOption ?? ""} />;
}

function HealthFitnessGoalCard({
  archived,
  createLevel,
  deleteLevel,
  exercise,
  goal,
  levels,
  observations,
  onArchive,
  onEdit,
  onRestore,
  updateLevel,
}: {
  archived: boolean;
  createLevel: (input: Omit<HealthFitnessGoalLevelInsert, "user_id">) => Promise<HealthFitnessGoalLevel | null>;
  deleteLevel: (levelId: string) => Promise<boolean>;
  exercise: HealthExercise | undefined;
  goal: HealthFitnessGoal;
  levels: HealthFitnessGoalLevel[];
  observations: ReturnType<typeof deriveHealthFitnessPerformanceObservations>;
  onArchive?: () => void;
  onEdit: () => void;
  onRestore?: () => void;
  updateLevel: (levelId: string, input: HealthFitnessGoalLevelUpdate) => Promise<boolean>;
}) {
  const [levelEditor, setLevelEditor] = useState<{ id: string | null; label: string; target: string } | null>(null);
  const [levelError, setLevelError] = useState<string | null>(null);
  const [isSavingLevel, setIsSavingLevel] = useState(false);
  const presentation = buildHealthFitnessGoalPresentation(goal, levels, observations);
  const goalLevels = presentation.levelStatuses
    .sort((left, right) => left.level.sort_order - right.level.sort_order || left.level.created_at.localeCompare(right.level.created_at));
  const nextLevelIndex = goalLevels.findIndex((item) => !item.reached);
  const exerciseName = exercise?.name ?? "Exercise unavailable";

  function openNewLevel() {
    setLevelEditor({ id: null, label: "", target: "" });
    setLevelError(null);
  }

  function openEditLevel(level: HealthFitnessGoalLevel) {
    setLevelEditor({ id: level.id, label: level.label, target: String(level.target) });
    setLevelError(null);
  }

  async function handleSaveLevel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!levelEditor) return;
    setIsSavingLevel(true);
    const saved = levelEditor.id
      ? await updateLevel(levelEditor.id, { label: levelEditor.label, target: Number(levelEditor.target) })
      : await createLevel({ goal_id: goal.id, label: levelEditor.label, sort_order: Math.max(-1, ...goalLevels.map((item) => item.level.sort_order)) + 1, target: Number(levelEditor.target) });
    setIsSavingLevel(false);
    if (!saved) {
      setLevelError("Level could not be saved. Review the fields and try again.");
      return;
    }
    setLevelEditor(null);
    setLevelError(null);
  }

  return (
    <article className={`grid gap-3 rounded-[1.25rem] border p-4 ${archived ? "border-[#eeeaf8] bg-[#faf9fd] dark:border-white/10 dark:bg-white/[0.02]" : "border-[#edf0fb] bg-white/80 dark:border-white/10 dark:bg-white/[0.04]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-[#26324f] dark:text-white">{goal.title}</h3>
            {presentation.status.reached ? <AdhdChip className="pointer-events-none" icon={<Trophy aria-hidden="true" className="h-3.5 w-3.5" />} tone="complete" type="button">Reached</AdhdChip> : null}
            {archived ? <AdhdChip className="pointer-events-none" tone="archived" type="button">Archived Goal</AdhdChip> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#74809b] dark:text-white/50">
            <span>{exerciseName}</span>
            {exercise && exercise.archived_at !== null ? <AdhdChip className="pointer-events-none" tone="archived" type="button">Archived exercise</AdhdChip> : null}
            <span>· {getHealthFitnessGoalMetricLabel(goal.metric)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <AdhdIconButton aria-label={`Edit Fitness Goal ${goal.title}`} onClick={onEdit} size="sm" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton>
          {archived ? <AdhdChip onClick={onRestore} type="button">Restore</AdhdChip> : <AdhdChip onClick={onArchive} tone="danger" type="button">Archive Goal</AdhdChip>}
        </div>
      </div>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Current PR</p><p className="mt-1 text-lg font-bold text-[#3f4966] dark:text-white/85">{presentation.currentRecord ? formatHealthFitnessGoalValue(goal.metric, presentation.currentRecord.value) : "No PR yet"}</p></div>
          <div className="text-right"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Goal</p><p className="mt-1 text-lg font-bold text-[#3f4966] dark:text-white/85">{formatHealthFitnessGoalValue(goal.metric, goal.target)}</p></div>
        </div>
        <div aria-label={`${goal.title} progress`} className="h-2 overflow-hidden rounded-full bg-[#eeeaf8] dark:bg-white/10" role="progressbar" aria-valuemax={goal.target} aria-valuemin={0} aria-valuenow={presentation.status.currentValue}>
          <div className={`h-full rounded-full transition-[width] ${presentation.status.reached ? "bg-[#5aaf78]" : "bg-[#7b66ef]"}`} style={{ width: `${presentation.status.progressRatio * 100}%` }} />
        </div>
        <p className="text-xs text-[#7d7598] dark:text-white/50">{presentation.currentRecord ? `${formatHealthFitnessGoalValue(goal.metric, presentation.status.progressValue)} / ${formatHealthFitnessGoalValue(goal.metric, goal.target)}` : `No PR yet · Target ${formatHealthFitnessGoalValue(goal.metric, goal.target)}`}</p>
      </div>
      <div className="grid gap-2 border-t border-[#eeeaf8] pt-3 dark:border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6f57f6] dark:text-[#cabfff]">Levels</h4><p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Progress is derived from the same current PR.</p></div><AdhdChip onClick={openNewLevel} tone="purple" type="button">+ Level</AdhdChip></div>
        {goalLevels.length === 0 ? <p className="text-xs text-[#8d87a7] dark:text-white/40">Add levels to mark intermediate targets.</p> : goalLevels.map((item, index) => {
          const isNext = index === nextLevelIndex;
          return <div className={`flex flex-wrap items-center gap-2 rounded-[0.9rem] border px-3 py-2 ${item.reached ? "border-[#d8ecd9] bg-[#eef9f0] dark:border-[#284a32] dark:bg-[#13281a]" : isNext ? "border-[#ddd2ff] bg-[#f7f3ff] dark:border-[#42306f] dark:bg-[#22193f]" : "border-[#eeeaf8] bg-white/70 dark:border-white/10 dark:bg-white/[0.02]"}`} key={item.level.id}>
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${item.reached ? "bg-[#d8ecd9] text-[#368155] dark:bg-[#284a32] dark:text-[#a7d7b8]" : isNext ? "bg-[#e9e1ff] text-[#6f57f6] dark:bg-[#3a2c62] dark:text-[#cabfff]" : "bg-[#f1eff7] text-[#9a93b4] dark:bg-white/8 dark:text-white/45"}`}>{item.reached ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : isNext ? <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /> : <span className="text-[10px]">·</span>}</span>
            <span className={`min-w-0 flex-1 text-sm font-semibold ${item.reached ? "text-[#368155] dark:text-[#a7d7b8]" : isNext ? "text-[#5f4bd7] dark:text-[#d8d0ff]" : "text-[#7d7598] dark:text-white/50"}`}>{item.level.label} — {formatHealthFitnessGoalValue(goal.metric, item.level.target)}<span className="ml-1 text-xs font-normal opacity-75">({presentation.currentRecord ? `${formatHealthFitnessGoalValue(goal.metric, item.progressValue)} progress` : "No PR yet"})</span></span>
            <div className="flex items-center gap-1"><AdhdIconButton aria-label={`Edit Level ${item.level.label}`} onClick={() => openEditLevel(item.level)} size="sm" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton><AdhdIconButton aria-label={`Delete Level ${item.level.label}`} onClick={() => { void deleteLevel(item.level.id); }} size="sm" tone="danger" variant="rowToolbar"><Trash2 aria-hidden="true" /></AdhdIconButton></div>
          </div>;
        })}
        {levelEditor ? <form aria-label={levelEditor.id ? `Edit Level for ${goal.title}` : `Add Level to ${goal.title}`} className="grid gap-3 rounded-[1rem] border border-[#ddd2ff] bg-[#fbfaff] p-3 dark:border-[#42306f] dark:bg-white/[0.03]" onSubmit={(event) => { void handleSaveLevel(event); }}><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Level label</span><input aria-label="Fitness Level label" className={HEALTH_COMPACT_INPUT_CLASS} disabled={isSavingLevel} onChange={(event) => setLevelEditor((current) => current ? { ...current, label: event.target.value } : current)} type="text" value={levelEditor.label} /></label><label className="grid gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Level target</span><input aria-label="Fitness Level target" className={HEALTH_COMPACT_INPUT_CLASS} disabled={isSavingLevel} min="1" step="1" onChange={(event) => setLevelEditor((current) => current ? { ...current, target: event.target.value } : current)} type="number" value={levelEditor.target} /></label></div>{levelError ? <p className="text-xs text-[#d65775] dark:text-[#ffb0c1]" role="alert">{levelError}</p> : null}<div className="flex flex-wrap gap-2"><AdhdChip disabled={isSavingLevel} tone="purple" type="submit">{isSavingLevel ? "Saving…" : "Save Level"}</AdhdChip><AdhdChip disabled={isSavingLevel} onClick={() => setLevelEditor(null)} type="button">Cancel</AdhdChip></div></form> : null}
      </div>
    </article>
  );
}

"use client";

import { ArrowDown, ArrowUp, Check, Pause, Play, Plus, Timer, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import type { ActiveFitnessWorkoutController } from "@/hooks/useActiveFitnessWorkout";
import type { HealthExercise, HealthFitnessMeasurement, HealthFitnessPlan, HealthFitnessPlanItem } from "@/lib/database.types";
import {
  formatActiveFitnessWorkoutClock,
  formatActiveFitnessWorkoutTotal,
  getActiveFitnessWorkoutElapsedSeconds,
  getActiveFitnessWorkoutSetElapsedSeconds,
} from "@/lib/health-active-workout";
import { FitnessPlanAssociationPicker } from "./health-fitness-plans-panel";
import { HealthDropdown, HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";

type HealthActiveWorkoutProps = {
  controller: ActiveFitnessWorkoutController;
  exerciseLibrary: HealthExercise[];
  planItems: HealthFitnessPlanItem[];
  plans: HealthFitnessPlan[];
  workoutTypes: readonly string[];
};

export function HealthActiveWorkout({ controller, exerciseLibrary, planItems, plans, workoutTypes }: HealthActiveWorkoutProps) {
  const { runtime } = controller;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [exerciseToAdd, setExerciseToAdd] = useState("");
  const [measurementToAdd, setMeasurementToAdd] = useState<HealthFitnessMeasurement>("reps");
  const activeExercises = useMemo(() => exerciseLibrary.filter((exercise) => exercise.archived_at === null), [exerciseLibrary]);
  const selectedExerciseId = activeExercises.some((exercise) => exercise.id === exerciseToAdd) ? exerciseToAdd : activeExercises[0]?.id ?? "";

  useEffect(() => {
    if (!runtime) return;
    const shouldTick = runtime.state === "running" || runtime.exercises.some((exercise) => exercise.sets.some((set) => set.currentRunStartedAt !== null));
    if (!shouldTick) {
      const timeoutId = window.setTimeout(() => setNowMs(Date.now()), 0);
      return () => window.clearTimeout(timeoutId);
    }
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(intervalId);
  }, [runtime]);

  if (!runtime) return null;

  const elapsedSeconds = getActiveFitnessWorkoutElapsedSeconds(runtime, nowMs);
  const selectedPlanItemIds = runtime.selectedPlanItemIds;

  function addExercise() {
    const exercise = activeExercises.find((candidate) => candidate.id === selectedExerciseId);
    if (exercise) controller.addExercise(exercise, measurementToAdd);
  }

  function discard() {
    if (runtime?.canonicalWorkoutId) {
      controller.discardWorkout();
      return;
    }
    if (window.confirm("Discard this active workout?\nThis removes the unfinished sandbox and does not create a workout log.")) {
      controller.discardWorkout();
    }
  }

  return (
    <section aria-labelledby="health-active-workout-title" className="grid gap-4 rounded-[1.25rem] border border-[#cfc5ff] bg-[linear-gradient(135deg,#fbfaff,#f4f0ff)] p-4 shadow-[0_12px_36px_rgba(111,87,246,0.08)] dark:border-[#5e4cad]/60 dark:bg-[linear-gradient(135deg,rgba(111,87,246,0.14),rgba(255,255,255,0.03))]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Timer aria-hidden="true" className="h-5 w-5 text-[#6f57f6] dark:text-[#cabfff]" />
            <h2 className="text-base font-bold text-[#26324f] dark:text-white" id="health-active-workout-title">Active Workout</h2>
          </div>
          <p className="mt-1 text-xs text-[#746d93] dark:text-white/55">Live workout tracking. Nothing is added to Workout History until you finish.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xl font-bold tabular-nums text-[#31256d] dark:text-[#e2dcff]">{formatActiveFitnessWorkoutClock(elapsedSeconds)}</span>
          {runtime.state === "running" ? (
            <AdhdChip icon={<Pause aria-hidden="true" className="h-3.5 w-3.5" />} onClick={controller.pauseWorkout} type="button">Pause</AdhdChip>
          ) : (
            <AdhdChip icon={<Play aria-hidden="true" className="h-3.5 w-3.5" />} onClick={controller.resumeWorkout} tone="purple" type="button">Resume</AdhdChip>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Workout Type</span>
          <HealthDropdown ariaLabel="Active workout type" onChange={(value) => controller.updateDetails({ workoutType: value })} options={workoutTypes.map((type) => ({ label: type, value: type }))} value={runtime.workoutType} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Title (optional)</span>
          <input aria-label="Active workout title" className={HEALTH_COMPACT_INPUT_CLASS} onChange={(event) => controller.updateDetails({ title: event.target.value })} placeholder="Uses workout type if blank" type="text" value={runtime.title} />
        </label>
      </div>
      <label className="grid gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Notes (optional)</span>
        <textarea aria-label="Active workout notes" className="health-input min-h-16 w-full resize-y rounded-[0.9rem] px-3 py-2 text-[13px] max-sm:text-[16px]" onChange={(event) => controller.updateDetails({ notes: event.target.value })} value={runtime.notes} />
      </label>

      <div className="grid gap-3 rounded-[1rem] border border-[#e3ddf6] bg-white/65 p-3 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6f57f6] dark:text-[#cabfff]">Exercises</h3>
            <p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Complete only the Sets you want included in the finished workout.</p>
          </div>
          {activeExercises.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <HealthDropdown ariaLabel="Choose active exercise to add" onChange={setExerciseToAdd} options={activeExercises.map((exercise) => ({ label: exercise.name, value: exercise.id }))} value={selectedExerciseId} />
              <MeasurementToggle onChange={setMeasurementToAdd} value={measurementToAdd} />
              <AdhdChip icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={addExercise} tone="purple" type="button">Add Exercise</AdhdChip>
            </div>
          ) : null}
        </div>
        {activeExercises.length === 0 ? <p className="text-xs text-[#7d7598] dark:text-white/50">Add an Exercise Library entry in Fitness Settings before tracking structured Sets.</p> : null}
        {runtime.exercises.length === 0 ? <p className="text-xs text-[#8d87a7] dark:text-white/40">No exercises added yet. The workout can still be finished without structured Sets.</p> : null}
        <div className="grid gap-3">
          {runtime.exercises.map((exercise, index) => (
            <ActiveWorkoutExerciseCard
              controller={controller}
              exercise={exercise}
              exerciseCount={runtime.exercises.length}
              exerciseIndex={index}
              key={exercise.runtimeExerciseId}
              nowMs={nowMs}
            />
          ))}
        </div>
      </div>

      <FitnessPlanAssociationPicker
        onToggle={(planItemId) => controller.updateDetails({ selectedPlanItemIds: selectedPlanItemIds.includes(planItemId) ? selectedPlanItemIds.filter((id) => id !== planItemId) : [...selectedPlanItemIds, planItemId] })}
        planItems={planItems}
        plans={plans}
        selectedPlanItemIds={selectedPlanItemIds}
      />

      {controller.error ? <p className="text-sm text-[#d65775] dark:text-[#ffb0c1]" role="alert">{controller.error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e3ddf6] pt-3 dark:border-white/10">
        <AdhdChip disabled={controller.isFinishing} onClick={discard} type="button">Discard Workout</AdhdChip>
        <AdhdChip disabled={controller.isFinishing} onClick={() => { void controller.finishWorkout(); }} tone="purple" type="button">{controller.isFinishing ? "Saving…" : controller.runtime?.canonicalWorkoutId ? "Retry Finish Workout" : "Finish Workout"}</AdhdChip>
      </div>
    </section>
  );
}

function ActiveWorkoutExerciseCard({ controller, exercise, exerciseCount, exerciseIndex, nowMs }: { controller: ActiveFitnessWorkoutController; exercise: NonNullable<ActiveFitnessWorkoutController["runtime"]>["exercises"][number]; exerciseCount: number; exerciseIndex: number; nowMs: number }) {
  return (
    <article className="grid gap-3 rounded-[1rem] border border-[#e3ddf6] bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h4 className="truncate text-sm font-bold text-[#3d4770] dark:text-white/85">{exercise.exerciseName}</h4>
          <MeasurementToggle onChange={(measurementType) => controller.updateExercise(exercise.runtimeExerciseId, { measurementType })} value={exercise.measurementType} />
        </div>
        <div className="flex items-center gap-1">
          <AdhdIconButton aria-label={`Move ${exercise.exerciseName} up`} disabled={exerciseIndex === 0} onClick={() => controller.moveExercise(exercise.runtimeExerciseId, -1)} size="sm" variant="rowToolbar"><ArrowUp aria-hidden="true" /></AdhdIconButton>
          <AdhdIconButton aria-label={`Move ${exercise.exerciseName} down`} disabled={exerciseIndex === exerciseCount - 1} onClick={() => controller.moveExercise(exercise.runtimeExerciseId, 1)} size="sm" variant="rowToolbar"><ArrowDown aria-hidden="true" /></AdhdIconButton>
          <AdhdIconButton aria-label={`Remove ${exercise.exerciseName}`} onClick={() => controller.removeExercise(exercise.runtimeExerciseId)} size="sm" tone="danger" variant="rowToolbar"><Trash2 aria-hidden="true" /></AdhdIconButton>
        </div>
      </div>
      <label className="grid gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Exercise notes (optional)</span>
        <textarea aria-label={`${exercise.exerciseName} active notes`} className="health-input min-h-14 w-full resize-y rounded-[0.9rem] px-3 py-2 text-[13px] max-sm:text-[16px]" onChange={(event) => controller.updateExercise(exercise.runtimeExerciseId, { notes: event.target.value })} value={exercise.notes} />
      </label>
      <div className="grid gap-2">
        {exercise.sets.map((set, index) => {
          const seconds = getActiveFitnessWorkoutSetElapsedSeconds(set, nowMs);
          const isRunning = set.currentRunStartedAt !== null;
          return (
            <div className={`flex flex-wrap items-center gap-2 rounded-[0.85rem] border px-2.5 py-2 ${set.completed ? "border-[#cfc5ff] bg-[#f4f0ff] dark:border-[#6759b0] dark:bg-[#6f57f6]/10" : "border-[#eeeaf8] bg-[#fbfaff] dark:border-white/10 dark:bg-white/[0.03]"}`} key={set.runtimeSetId}>
              <span className="w-14 text-xs font-semibold text-[#4a5470] dark:text-white/70">Set {index + 1}</span>
              {exercise.measurementType === "reps" ? (
                <input aria-label={`${exercise.exerciseName} Set ${index + 1} reps`} className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-24 flex-1`} disabled={set.completed} min="1" onChange={(event) => controller.updateSet(exercise.runtimeExerciseId, set.runtimeSetId, { reps: event.target.value })} step="1" type="number" value={set.reps} />
              ) : (
                <span className="min-w-24 flex-1 font-mono text-sm tabular-nums text-[#4a5470] dark:text-white/75">{formatSetClock(seconds)}</span>
              )}
              <span className="text-xs text-[#7d7598] dark:text-white/50">{exercise.measurementType === "reps" ? "reps" : "duration"}</span>
              {exercise.measurementType === "duration" && !set.completed ? (
                isRunning ? <AdhdChip icon={<Pause aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => controller.pauseDurationSet(exercise.runtimeExerciseId, set.runtimeSetId)} type="button">Pause</AdhdChip> : <AdhdChip icon={<Play aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => controller.startDurationSet(exercise.runtimeExerciseId, set.runtimeSetId)} type="button">{seconds > 0 ? "Resume" : "Start"}</AdhdChip>
              ) : null}
              {set.completed ? <AdhdChip icon={<Check aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => controller.reopenSet(exercise.runtimeExerciseId, set.runtimeSetId)} selected tone="purple" type="button">Reopen</AdhdChip> : <AdhdChip onClick={() => exercise.measurementType === "reps" ? controller.completeRepsSet(exercise.runtimeExerciseId, set.runtimeSetId) : controller.completeDurationSet(exercise.runtimeExerciseId, set.runtimeSetId)} tone="purple" type="button">Complete</AdhdChip>}
              <AdhdIconButton aria-label={`Remove ${exercise.exerciseName} Set ${index + 1}`} disabled={set.completed} onClick={() => controller.removeIncompleteSet(exercise.runtimeExerciseId, set.runtimeSetId)} size="sm" tone="danger" variant="rowToolbar"><Trash2 aria-hidden="true" /></AdhdIconButton>
            </div>
          );
        })}
        <AdhdChip className="justify-self-start" icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => controller.addSet(exercise.runtimeExerciseId)} type="button">Add Set</AdhdChip>
      </div>
      <p className="text-xs font-medium text-[#6f57f6] dark:text-[#cabfff]">{formatActiveFitnessWorkoutTotal(exercise, nowMs)}</p>
    </article>
  );
}

function MeasurementToggle({ onChange, value }: { onChange: (value: HealthFitnessMeasurement) => void; value: HealthFitnessMeasurement }) {
  return (
    <div aria-label="Measurement type" className="inline-flex w-fit items-center gap-1 rounded-full border border-[#e4deef] bg-[#f4f5f8] p-1 dark:border-white/10 dark:bg-white/8" role="group">
      <AdhdChip aria-pressed={value === "reps"} onClick={() => onChange("reps")} selected={value === "reps"} type="button">Reps</AdhdChip>
      <AdhdChip aria-pressed={value === "duration"} onClick={() => onChange("duration")} selected={value === "duration"} type="button">Duration</AdhdChip>
    </div>
  );
}

function formatSetClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

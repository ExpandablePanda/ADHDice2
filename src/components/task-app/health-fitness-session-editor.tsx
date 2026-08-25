"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import type { HealthExercise, HealthFitnessMeasurement } from "@/lib/database.types";
import {
  buildHealthWorkoutExerciseOptions,
  createEmptyHealthWorkoutDraftSet,
  createHealthWorkoutExerciseDraft,
  replaceHealthWorkoutExerciseIdentity,
  switchHealthWorkoutMeasurementType,
  type HealthWorkoutExerciseDraft,
  type HealthWorkoutStructuredDraft,
} from "@/lib/health-fitness-session";
import { HealthDropdown, HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";

type HealthFitnessSessionEditorProps = {
  draft: HealthWorkoutStructuredDraft;
  exerciseLibrary: HealthExercise[];
  onChange: (draft: HealthWorkoutStructuredDraft) => void;
};

export function HealthFitnessSessionEditor({ draft, exerciseLibrary, onChange }: HealthFitnessSessionEditorProps) {
  const activeExercises = exerciseLibrary.filter((exercise) => exercise.archived_at === null);
  const [exerciseToAdd, setExerciseToAdd] = useState(activeExercises[0]?.id ?? "");
  const [measurementToAdd, setMeasurementToAdd] = useState<HealthFitnessMeasurement>("reps");
  const selectedExerciseId = activeExercises.some((exercise) => exercise.id === exerciseToAdd) ? exerciseToAdd : activeExercises[0]?.id ?? "";

  function updateExercise(index: number, patch: Partial<HealthWorkoutExerciseDraft>) {
    onChange({ exercises: draft.exercises.map((exercise, exerciseIndex) => exerciseIndex === index ? { ...exercise, ...patch } : exercise) });
  }

  function addExercise() {
    const exercise = activeExercises.find((candidate) => candidate.id === selectedExerciseId);
    if (!exercise) return;
    onChange({ exercises: [...draft.exercises, createHealthWorkoutExerciseDraft(exercise, measurementToAdd)] });
  }

  function removeExercise(index: number) {
    onChange({ exercises: draft.exercises.filter((_, exerciseIndex) => exerciseIndex !== index) });
  }

  function moveExercise(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.exercises.length) return;
    const exercises = [...draft.exercises];
    const [moved] = exercises.splice(index, 1);
    if (!moved) return;
    exercises.splice(nextIndex, 0, moved);
    onChange({ exercises });
  }

  return (
    <section className="grid gap-3 rounded-[1rem] border border-[#eeeaf8] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.03]" aria-labelledby="fitness-workout-exercises">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6f57f6] dark:text-[#cabfff]" id="fitness-workout-exercises">Exercises &amp; Sets</h3>
          <p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Optional structured details for this manual workout.</p>
        </div>
        {activeExercises.length > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <HealthDropdown ariaLabel="Choose exercise to add" onChange={setExerciseToAdd} options={activeExercises.map((exercise) => ({ label: exercise.name, value: exercise.id }))} value={selectedExerciseId} />
            <MeasurementToggle ariaLabel="Measurement type for new exercise" onChange={setMeasurementToAdd} value={measurementToAdd} />
            <AdhdChip icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={addExercise} tone="purple" type="button">Add Exercise</AdhdChip>
          </div>
        ) : null}
      </div>
      {activeExercises.length === 0 ? <p className="rounded-[0.9rem] border border-dashed border-[#ddd7ef] px-3 py-3 text-xs text-[#7d7598] dark:border-white/15 dark:text-white/50">No active Exercise Library entries. Add one in Fitness Settings → Exercises.</p> : null}
      {draft.exercises.length === 0 ? <p className="text-xs text-[#8d87a7] dark:text-white/40">No exercises added to this workout.</p> : null}
      <div className="grid gap-3">
        {draft.exercises.map((exercise, index) => (
          <WorkoutExerciseDraftRow
            exercise={exercise}
            exerciseIndex={index}
            exerciseLibrary={exerciseLibrary}
            exerciseCount={draft.exercises.length}
            key={exercise.id ?? `exercise-${index}`}
            onChange={(patch) => updateExercise(index, patch)}
            onMove={moveExercise}
            onRemove={removeExercise}
          />
        ))}
      </div>
    </section>
  );
}

function WorkoutExerciseDraftRow({
  exercise,
  exerciseIndex,
  exerciseLibrary,
  exerciseCount,
  onChange,
  onMove,
  onRemove,
}: {
  exercise: HealthWorkoutExerciseDraft;
  exerciseIndex: number;
  exerciseLibrary: HealthExercise[];
  exerciseCount: number;
  onChange: (patch: Partial<HealthWorkoutExerciseDraft>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
}) {
  const exerciseOptions = buildHealthWorkoutExerciseOptions(exerciseLibrary, exercise.exerciseId);

  function changeExercise(exerciseId: string) {
    const nextExercise = exerciseLibrary.find((candidate) => candidate.id === exerciseId);
    if (!nextExercise) return;
    onChange(replaceHealthWorkoutExerciseIdentity(exercise, nextExercise));
  }

  function changeMeasurementType(measurementType: HealthFitnessMeasurement) {
    if (measurementType === exercise.measurementType) return;
    onChange({
      measurementType,
      sets: switchHealthWorkoutMeasurementType(exercise.sets, measurementType),
    });
  }

  function updateSet(index: number, patch: Partial<HealthWorkoutExerciseDraft["sets"][number]>) {
    onChange({ sets: exercise.sets.map((set, setIndex) => setIndex === index ? { ...set, ...patch } : set) });
  }

  return (
    <article className="grid gap-3 rounded-[1rem] border border-[#e3ddf6] bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#4a5470] dark:text-white/75">Exercise {exerciseIndex + 1}</span>
          <HealthDropdown ariaLabel={`Exercise ${exerciseIndex + 1}`} onChange={changeExercise} options={exerciseOptions} value={exercise.exerciseId} />
          <MeasurementToggle ariaLabel={`Measurement type for ${exercise.exerciseName}`} onChange={changeMeasurementType} value={exercise.measurementType} />
        </div>
        <div className="flex items-center gap-1">
          <AdhdIconButton aria-label={`Move Exercise ${exerciseIndex + 1} up`} disabled={exerciseIndex === 0} onClick={() => onMove(exerciseIndex, -1)} size="sm" variant="rowToolbar"><ArrowUp aria-hidden="true" /></AdhdIconButton>
          <AdhdIconButton aria-label={`Move Exercise ${exerciseIndex + 1} down`} disabled={exerciseIndex === exerciseCount - 1} onClick={() => onMove(exerciseIndex, 1)} size="sm" variant="rowToolbar"><ArrowDown aria-hidden="true" /></AdhdIconButton>
          <AdhdIconButton aria-label={`Remove Exercise ${exercise.exerciseName}`} onClick={() => onRemove(exerciseIndex)} size="sm" tone="danger" variant="rowToolbar"><Trash2 aria-hidden="true" /></AdhdIconButton>
        </div>
      </div>
      <label className="grid gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Exercise notes (optional)</span>
        <textarea aria-label={`${exercise.exerciseName} notes`} className="health-input min-h-14 w-full resize-y rounded-[0.9rem] px-3 py-2 text-[13px] max-sm:text-[16px]" onChange={(event) => onChange({ notes: event.target.value })} value={exercise.notes} />
      </label>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Sets</p>
          <AdhdChip icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => onChange({ sets: [...exercise.sets, createEmptyHealthWorkoutDraftSet()] })} type="button">Add Set</AdhdChip>
        </div>
        {exercise.sets.map((set, index) => (
          <div className="flex flex-wrap items-end gap-2 rounded-[0.85rem] border border-[#eeeaf8] bg-[#fbfaff] p-2 dark:border-white/10 dark:bg-white/[0.03]" key={set.id ?? `set-${index}`}>
            <label className="grid min-w-[10rem] flex-1 gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Set {index + 1} · {exercise.measurementType === "reps" ? "Reps" : "Duration (seconds)"}</span>
              <input
                aria-label={`${exercise.exerciseName} Set ${index + 1} ${exercise.measurementType === "reps" ? "reps" : "duration seconds"}`}
                className={HEALTH_COMPACT_INPUT_CLASS}
                min="1"
                onChange={(event) => exercise.measurementType === "reps" ? updateSet(index, { durationSeconds: "", reps: event.target.value }) : updateSet(index, { durationSeconds: event.target.value, reps: "" })}
                step="1"
                type="number"
                value={exercise.measurementType === "reps" ? set.reps : set.durationSeconds}
              />
            </label>
            <AdhdIconButton aria-label={`Remove ${exercise.exerciseName} Set ${index + 1}`} disabled={exercise.sets.length <= 1} onClick={() => onChange({ sets: exercise.sets.filter((_, setIndex) => setIndex !== index) })} size="sm" tone="danger" variant="rowToolbar"><Trash2 aria-hidden="true" /></AdhdIconButton>
          </div>
        ))}
      </div>
    </article>
  );
}

function MeasurementToggle({
  ariaLabel,
  disabled = false,
  onChange,
  value,
}: {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: HealthFitnessMeasurement) => void;
  value: HealthFitnessMeasurement;
}) {
  return (
    <div aria-label={ariaLabel} className="inline-flex w-fit items-center gap-1 rounded-full border border-[#e4deef] bg-[#f4f5f8] p-1 dark:border-white/10 dark:bg-white/8" role="group">
      <AdhdChip aria-pressed={value === "reps"} disabled={disabled} onClick={() => onChange("reps")} selected={value === "reps"} type="button">Reps</AdhdChip>
      <AdhdChip aria-pressed={value === "duration"} disabled={disabled} onClick={() => onChange("duration")} selected={value === "duration"} type="button">Duration</AdhdChip>
    </div>
  );
}

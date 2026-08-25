"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import type { HealthExercise, HealthExerciseInsert, HealthExerciseUpdate } from "@/lib/database.types";
import { HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";
import { HealthFitnessReorderList } from "./health-fitness-reorder-list";

type HealthFitnessExerciseLibraryProps = {
  archiveExercise: (exerciseId: string) => Promise<boolean>;
  createExercise: (input: Omit<HealthExerciseInsert, "user_id" | "default_measurement">) => Promise<HealthExercise | null>;
  error: string | null;
  exerciseLibrary: HealthExercise[];
  isLoading: boolean;
  reorderExercises: (orderedExerciseIds: readonly string[]) => Promise<boolean>;
  updateExercise: (exerciseId: string, input: HealthExerciseUpdate) => Promise<boolean>;
};

export function HealthFitnessExerciseLibrary({
  archiveExercise,
  createExercise,
  error,
  exerciseLibrary,
  isLoading,
  reorderExercises,
  updateExercise,
}: HealthFitnessExerciseLibraryProps) {
  const [nameDraft, setNameDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const activeExercises = exerciseLibrary.filter((exercise) => exercise.archived_at === null);
  const archivedExercises = exerciseLibrary.filter((exercise) => exercise.archived_at !== null);

  async function handleAddExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    const created = await createExercise({ name: nameDraft });
    setIsSaving(false);
    if (created) {
      setNameDraft("");
    }
  }

  function beginEdit(exercise: HealthExercise) {
    setEditingId(exercise.id);
    setEditingName(exercise.name);
  }

  async function handleSaveEdit(exerciseId: string) {
    setIsSaving(true);
    const saved = await updateExercise(exerciseId, { name: editingName });
    setIsSaving(false);
    if (saved) {
      setEditingId(null);
      setEditingName("");
    }
  }

  return (
    <section className="grid gap-2 border-t border-[#eeeaf8] pt-4 dark:border-white/10" aria-labelledby="fitness-settings-exercises">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6f57f6] dark:text-[#cabfff]" id="fitness-settings-exercises">Exercises</h3>
        <p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Reusable exercise identities. Choose Reps or Duration for each exercise inside a workout.</p>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { void handleAddExercise(event); }}>
        <label className="grid min-w-[12rem] flex-1 gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Name</span>
          <input aria-label="Add exercise name" className={HEALTH_COMPACT_INPUT_CLASS} disabled={isSaving} onChange={(event) => setNameDraft(event.target.value)} placeholder="Add an exercise" type="text" value={nameDraft} />
        </label>
        <AdhdChip disabled={isSaving} tone="purple" type="submit">Add Exercise</AdhdChip>
      </form>
      {error ? <p className="text-xs text-[#d65775] dark:text-[#ffb0c1]" role="alert">{error}</p> : null}
      {isLoading ? <p className="text-xs text-[#7d7598] dark:text-white/50">Loading exercises…</p> : null}
      <div className="grid gap-1.5">
        {activeExercises.length > 0 ? (
          <HealthFitnessReorderList
            disabled={isSaving}
            getItemId={(exercise) => exercise.id}
            getItemLabel={(exercise) => exercise.name}
            items={activeExercises}
            label="exercise"
            onSave={reorderExercises}
            renderItem={(exercise) => (
              <ExerciseLibraryRow
                editing={editingId === exercise.id}
                exercise={exercise}
                editingName={editingName}
                isSaving={isSaving}
                onArchive={() => { void archiveExercise(exercise.id); }}
                onCancel={() => setEditingId(null)}
                onEdit={() => beginEdit(exercise)}
                onSave={() => { void handleSaveEdit(exercise.id); }}
                setEditingName={setEditingName}
              />
            )}
          />
        ) : null}
        {activeExercises.length === 0 ? <p className="rounded-[0.9rem] border border-dashed border-[#ddd7ef] px-3 py-3 text-xs text-[#7d7598] dark:border-white/15 dark:text-white/50">No active exercises yet.</p> : null}
      </div>
      {archivedExercises.length > 0 ? (
        <div className="grid gap-1.5 border-t border-[#eeeaf8] pt-2 dark:border-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Archived exercises</p>
          {archivedExercises.map((exercise) => <ExerciseLibraryRow archived exercise={exercise} key={exercise.id} />)}
        </div>
      ) : null}
    </section>
  );
}

function ExerciseLibraryRow({
  archived = false,
  editing,
  exercise,
  editingName,
  isSaving = false,
  onArchive,
  onCancel,
  onEdit,
  onSave,
  setEditingName,
}: {
  archived?: boolean;
  editing?: boolean;
  exercise: HealthExercise;
  editingName?: string;
  isSaving?: boolean;
  onArchive?: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
  onSave?: () => void;
  setEditingName?: (value: string) => void;
}) {
  if (editing && !archived && editingName !== undefined && setEditingName) {
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 rounded-[0.9rem] border border-[#ddd2ff] bg-[#fbfaff] p-2 dark:border-[#42306f] dark:bg-white/[0.03]">
        <input aria-label={`Rename exercise ${exercise.name}`} className={`${HEALTH_COMPACT_INPUT_CLASS} min-w-[12rem] flex-1`} disabled={isSaving} onChange={(event) => setEditingName(event.target.value)} type="text" value={editingName} />
        <AdhdIconButton aria-label={`Save exercise ${exercise.name}`} disabled={isSaving} onClick={onSave} size="sm" tone="purple" variant="rowToolbar"><Check aria-hidden="true" /></AdhdIconButton>
        <AdhdIconButton aria-label={`Cancel editing ${exercise.name}`} disabled={isSaving} onClick={onCancel} size="sm" variant="rowToolbar"><X aria-hidden="true" /></AdhdIconButton>
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 rounded-[0.9rem] border px-3 py-2 ${archived ? "border-[#eeeaf8] bg-[#faf9fd] dark:border-white/10 dark:bg-white/[0.02]" : "border-[#eeeaf8] bg-white/80 dark:border-white/10 dark:bg-white/[0.03]"}`}>
      <div className="min-w-0">
        <p className={`truncate text-sm font-semibold ${archived ? "text-[#7d7598] dark:text-white/50" : "text-[#4a5470] dark:text-white/75"}`}>{exercise.name}</p>
        {archived ? <p className="mt-0.5 text-xs text-[#8d87a7] dark:text-white/40">Archived</p> : null}
      </div>
      {!archived ? (
        <div className="flex items-center gap-1">
          <AdhdIconButton aria-label={`Rename exercise ${exercise.name}`} disabled={isSaving} onClick={onEdit} size="sm" variant="rowToolbar"><Pencil aria-hidden="true" /></AdhdIconButton>
          <AdhdIconButton aria-label={`Archive exercise ${exercise.name}`} disabled={isSaving} onClick={onArchive} size="sm" tone="danger" variant="rowToolbar"><Trash2 aria-hidden="true" /></AdhdIconButton>
        </div>
      ) : null}
    </div>
  );
}

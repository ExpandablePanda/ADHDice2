"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Note, Task } from "@/lib/database.types";
import type { EditingSessionStore } from "@/lib/editing-session-store";
import type { NotesEditingSessionDraft } from "@/lib/note-draft-safety";
import { areNoteDraftsEqual } from "@/lib/note-draft-safety";

type NoteEditorProps = {
  isNew: boolean;
  note: Note;
  onClose: () => void;
  onDraftSafetyChange: (isUnsafe: boolean) => void;
  onDelete: (id: string) => Promise<boolean>;
  onSave: (note: Note) => Promise<boolean>;
  isSaving: boolean;
  saveError: string | null;
  tasks: Task[];
  sessionStore?: EditingSessionStore<NotesEditingSessionDraft> | null;
  sessionDraftId?: string;
  viewId?: string;
};

export function NoteEditorComponent({
  isNew,
  note,
  onClose,
  onDraftSafetyChange,
  onDelete,
  onSave,
  isSaving,
  saveError,
  sessionStore,
  sessionDraftId,
  viewId,
}: NoteEditorProps) {
  const [localDraft, setLocalDraft] = useState<Note>(note);
  const [tagInput, setTagInput] = useState("");
  const hasSharedSession = Boolean(sessionStore && sessionDraftId);
  const subscribe = useCallback((listener: () => void) => (
    hasSharedSession && sessionStore && sessionDraftId
      ? sessionStore.subscribeToSession(sessionDraftId, listener)
      : () => {}
  ), [hasSharedSession, sessionDraftId, sessionStore]);
  const getSnapshot = useCallback(() => (
    hasSharedSession && sessionStore && sessionDraftId ? sessionStore.getSnapshot(sessionDraftId) : null
  ), [hasSharedSession, sessionDraftId, sessionStore]);
  const session = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const sharedNote = session?.draft.kind === "note" ? session.draft.note : null;
  const draft = hasSharedSession ? sharedNote ?? note : localDraft;
  const isSavingNow = hasSharedSession ? Boolean(session?.isSaving) : isSaving;
  const isDraftDirty = hasSharedSession ? Boolean(session?.dirty) : !areNoteDraftsEqual(draft, note);
  const isDraftUnsafe = isSavingNow || Boolean(tagInput.trim()) || isDraftDirty;
  const isTransitionUnsafe = isSavingNow || Boolean(tagInput.trim()) || (!hasSharedSession && isDraftDirty);
  const visibleSaveError = hasSharedSession ? session?.saveError ?? null : saveError;

  useEffect(() => {
    if (hasSharedSession && sessionStore && sessionDraftId && viewId) {
      sessionStore.attachView(sessionDraftId, viewId);
    }
  }, [hasSharedSession, sessionDraftId, sessionStore, viewId]);

  useEffect(() => {
    onDraftSafetyChange(isTransitionUnsafe);
    return () => onDraftSafetyChange(false);
  }, [isTransitionUnsafe, onDraftSafetyChange]);

  function updateDraft(update: (current: Note) => Note) {
    if (hasSharedSession && sessionStore && sessionDraftId) {
      sessionStore.updateDraft(sessionDraftId, (current) => current.kind === "note"
        ? { ...current, note: update(current.note) }
        : current);
      return;
    }
    setLocalDraft(update);
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !draft.tags.includes(tag)) updateDraft((current) => ({ ...current, tags: [...current.tags, tag] }));
    setTagInput("");
  }

  if (hasSharedSession && (!session || session.draft.kind !== "note")) {
    return <section className="px-4 pb-32"><p role="status">This Note is no longer available.</p></section>;
  }

  return (
    <section className="px-4 pb-32">
      <div className="flex items-center gap-3 pt-4 pb-4">
        <button disabled={isSavingNow} onClick={onClose} type="button" className="ui-pill-button-light">
          {isDraftUnsafe && !isSavingNow ? "Discard Draft" : "← Back"}
        </button>
        <div className="flex-1" />
        {!isNew ? (
          <button
            disabled={isSavingNow}
            onClick={() => { void onDelete(draft.id); }}
            type="button"
            className="ui-pill-button-danger-light"
          >
            Delete
          </button>
        ) : null}
        <button
          disabled={isSavingNow}
          onClick={() => { void onSave(draft); }}
          type="button"
          className="ui-pill-button-strong-light"
        >
          {isSavingNow ? "Saving…" : "Save"}
        </button>
      </div>
      {visibleSaveError ? <p aria-live="polite" className="mb-3 text-sm font-semibold text-[#c64c62] dark:text-[#ffb1c0]" role="alert">{visibleSaveError}</p> : null}

      <input
        autoFocus
        className="mb-3 w-full border-b-2 bg-transparent pb-2 text-2xl font-bold outline-none border-[#6f57f6] text-[#1e2540] placeholder:text-[#bbb8d0] dark:border-[#cabfff]/50 dark:text-white dark:placeholder:text-white/25"
        onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))}
        disabled={isSavingNow}
        placeholder="Title"
        value={draft.title}
      />

      <textarea
        className="mb-4 min-h-40 w-full resize-y rounded-2xl px-4 py-3 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
        onChange={(event) => updateDraft((current) => ({ ...current, body: event.target.value }))}
        disabled={isSavingNow}
        placeholder="Write something…"
        value={draft.body}
      />

      <div className="mb-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Tags</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {draft.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => updateDraft((current) => ({ ...current, tags: current.tags.filter((item) => item !== tag) }))}
              disabled={isSavingNow}
              type="button"
              className="ui-pill-button-strong-light"
            >
              {tag} ×
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none bg-[#f7f5ff] text-[#1e2540] dark:bg-white/5 dark:text-white"
            onKeyDown={(event) => { if (event.key === "Enter") addTag(); }}
            onChange={(event) => setTagInput(event.target.value)}
            disabled={isSavingNow}
            placeholder="Add tag…"
            value={tagInput}
          />
          <button
            className="ui-pill-button-strong-light"
            onClick={addTag}
            disabled={isSavingNow}
            type="button"
          >
            Add
          </button>
        </div>
      </div>
    </section>
  );
}

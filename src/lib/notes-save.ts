import type { Note } from "./database.types.ts";
import type { EditingSessionStore } from "./editing-session-store.ts";
import type { createBrowserSupabaseClient } from "./supabase.ts";
import { areNoteDraftsEqual, type NotesEditingSessionDraft } from "./note-draft-safety.ts";

export type SharedNoteSaveClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

type SharedNoteSaveResult =
  | { ok: true; note: Note }
  | { ok: false; error: string };

type SaveDiagnosticDetails = Record<string, boolean | number | string | null | undefined>;

export function logNotesSaveDiagnostic(stage: string, details: SaveDiagnosticDetails) {
  if (process.env.NODE_ENV === "development") {
    console.debug("[ADHDice Notes save]", { stage, ...details });
  }
}

export async function reconcilePersistedNote(
  client: SharedNoteSaveClient,
  userId: string,
  id: string,
  expected: Note,
): Promise<Note | null> {
  const { data, error } = await client
    .from("adhdice_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  const matches = !error && Boolean(data && areNoteDraftsEqual(data, expected));
  logNotesSaveDiagnostic("persisted-row-reconciliation", {
    noteId: id,
    rowFound: Boolean(data),
    rowIdentityMatches: Boolean(data && data.id === id && data.user_id === userId),
    editableFieldsMatch: matches,
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
  });
  return matches ? data : null;
}

export function upsertSavedNoteInCollection(current: Note[], savedNote: Note): Note[] {
  return [savedNote, ...current.filter((note) => note.id !== savedNote.id)]
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export async function saveSharedNoteSession({
  client,
  userId,
  sessionStore,
  draftId,
  isNew,
  onNotesChange,
  onCollectionUpdate,
}: {
  client: SharedNoteSaveClient;
  userId: string;
  sessionStore: EditingSessionStore<NotesEditingSessionDraft>;
  draftId: string;
  isNew: boolean;
  onNotesChange: (update: (current: Note[]) => Note[]) => void;
  onCollectionUpdate?: (savedNote: Note) => void;
}): Promise<SharedNoteSaveResult> {
  const session = sessionStore.getSnapshot(draftId);
  if (!session || session.draft.kind !== "note") {
    logNotesSaveDiagnostic("save-not-started", { draftId, reason: "note-session-unavailable" });
    return { ok: false, error: "Note draft is no longer available." };
  }
  const saveRevision = sessionStore.beginSave(draftId);
  if (saveRevision === null) {
    logNotesSaveDiagnostic("save-not-started", {
      draftId,
      noteId: session.draft.note.id,
      reason: "session-already-saving-or-missing",
    });
    return { ok: false, error: "Note is already being saved." };
  }

  const draft = session.draft.note;
  const operation = isNew ? "insert" : "update";
  let persistenceError = "Note could not be saved. Check your connection and try again.";
  logNotesSaveDiagnostic("save-started", {
    operation,
    noteId: draft.id,
    draftId,
    saveRevision,
    dirty: session.dirty,
    attachedViewCount: session.viewIds.length,
  });

  try {
    let savedNote: Note | null = null;
    if (isNew) {
      const { data, error } = await client
        .from("adhdice_notes")
        .insert({
          id: draft.id,
          user_id: userId,
          title: draft.title,
          body: draft.body,
          tags: draft.tags,
          linked_task_ids: draft.linked_task_ids,
        })
        .select("*")
        .single();
      if (error) persistenceError = error.message;
      logNotesSaveDiagnostic("supabase-write-response", {
        operation,
        noteId: draft.id,
        returnedNoteId: data?.id ?? null,
        returnedRowMatchesRequestedDraft: Boolean(
          data
          && data.id === draft.id
          && data.user_id === userId
          && areNoteDraftsEqual(data, draft),
        ),
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
      });
      savedNote = !error && data ? data : await reconcilePersistedNote(client, userId, draft.id, draft);
    } else {
      const { data, error } = await client
        .from("adhdice_notes")
        .update({
          title: draft.title,
          body: draft.body,
          tags: draft.tags,
          linked_task_ids: draft.linked_task_ids,
        })
        .eq("id", draft.id)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (error) persistenceError = error.message;
      logNotesSaveDiagnostic("supabase-write-response", {
        operation,
        noteId: draft.id,
        returnedNoteId: data?.id ?? null,
        returnedRowMatchesRequestedDraft: Boolean(
          data
          && data.id === draft.id
          && data.user_id === userId
          && areNoteDraftsEqual(data, draft),
        ),
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
      });
      savedNote = !error && data ? data : await reconcilePersistedNote(client, userId, draft.id, draft);
    }

    if (!savedNote) {
      const saveFailed = sessionStore.saveFailed(draftId, saveRevision, persistenceError);
      const retained = sessionStore.getSnapshot(draftId);
      logNotesSaveDiagnostic("save-failed", {
        operation,
        noteId: draft.id,
        saveRevision,
        sessionAcceptedFailure: saveFailed,
        dirtyDraftRetained: Boolean(
          retained?.draft.kind === "note"
          && areNoteDraftsEqual(retained.draft.note, draft)
          && retained.dirty,
        ),
        errorMessage: persistenceError,
      });
      return { ok: false, error: persistenceError };
    }

    const sessionReconciled = sessionStore.saveSucceeded(draftId, saveRevision, { kind: "note", note: savedNote });
    const reconciledSession = sessionStore.getSnapshot(draftId);
    logNotesSaveDiagnostic("session-baseline-reconciled", {
      operation,
      noteId: draft.id,
      saveRevision,
      sessionReconciled,
      sessionBaselineMatchesRequestedDraft: Boolean(
        reconciledSession?.baseline.kind === "note"
        && areNoteDraftsEqual(reconciledSession.baseline.note, draft),
      ),
      baselineMatchesPersistedRow: Boolean(
        reconciledSession?.baseline.kind === "note"
        && areNoteDraftsEqual(reconciledSession.baseline.note, savedNote),
      ),
      attachedViewCount: reconciledSession?.viewIds.length ?? 0,
    });
    onCollectionUpdate?.(savedNote);
    onNotesChange((current) => upsertSavedNoteInCollection(current, savedNote!));
    logNotesSaveDiagnostic("shared-collection-update-dispatched", {
      operation,
      noteId: savedNote.id,
      persistedUpdatedAt: savedNote.updated_at,
    });
    return { ok: true, note: savedNote };
  } catch (caught) {
    const errorMessage = caught instanceof Error ? caught.message : "Note could not be saved.";
    const saveFailed = sessionStore.saveFailed(draftId, saveRevision, errorMessage);
    const retained = sessionStore.getSnapshot(draftId);
    logNotesSaveDiagnostic("save-exception", {
      operation,
      noteId: draft.id,
      saveRevision,
      sessionAcceptedFailure: saveFailed,
      dirtyDraftRetained: Boolean(
        retained?.draft.kind === "note"
        && areNoteDraftsEqual(retained.draft.note, draft)
        && retained.dirty,
      ),
      errorMessage,
    });
    return { ok: false, error: errorMessage };
  }
}

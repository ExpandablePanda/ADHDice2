import type { EditingSessionStore } from "./editing-session-store.ts";
import {
  normalizeScratchPaperDraft,
  type ScratchPaperDraftValues,
  type ScratchPaperEditingSessionDraft,
} from "./scratch-paper-draft.ts";

export type ScratchPaperNoteCore = {
  body: string;
  id: string;
  title: string | null;
  user_id: string;
};

export type ScratchPaperLinkRepository = {
  listTaskIds(noteId: string, userId: string): Promise<readonly string[]>;
  insertTaskIds(noteId: string, userId: string, taskIds: readonly string[]): Promise<void>;
  deleteTaskIds(noteId: string, userId: string, taskIds: readonly string[]): Promise<void>;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function replaceScratchPaperTaskLinksSafely(
  noteId: string,
  userId: string,
  taskIds: readonly string[],
  repository: ScratchPaperLinkRepository,
) {
  const existing = [...new Set(await repository.listTaskIds(noteId, userId))];
  const desired = [...new Set(taskIds)];
  const existingSet = new Set(existing);
  const desiredSet = new Set(desired);
  const missing = desired.filter((taskId) => !existingSet.has(taskId));
  const stale = existing.filter((taskId) => !desiredSet.has(taskId));

  // Add first so a failed insert cannot erase the previously saved links.
  if (missing.length > 0) await repository.insertTaskIds(noteId, userId, missing);
  // A failed cleanup leaves a harmless superset that the next save can finish.
  if (stale.length > 0) await repository.deleteTaskIds(noteId, userId, stale);
}

export function isScratchPaperCoreMatch(
  record: ScratchPaperNoteCore | null,
  noteId: string,
  userId: string,
  draft: ScratchPaperDraftValues,
) {
  const normalized = normalizeScratchPaperDraft(draft);
  return Boolean(
    record
    && record.id === noteId
    && record.user_id === userId
    && record.body === normalized.body
    && record.title === (normalized.title || null),
  );
}

export async function persistScratchPaperNoteInStages({
  draft,
  noteId,
  readNote,
  replaceLinks,
  userId,
  writeNote,
}: {
  draft: ScratchPaperDraftValues;
  noteId: string;
  readNote: () => Promise<ScratchPaperNoteCore | null>;
  replaceLinks: () => Promise<void>;
  userId: string;
  writeNote: () => Promise<ScratchPaperNoteCore | null>;
}): Promise<{ corePersisted: boolean; error: string | null; ok: boolean }> {
  let core: ScratchPaperNoteCore | null = null;
  let coreError: unknown = null;
  try {
    core = await writeNote();
  } catch (caught) {
    coreError = caught;
  }

  if (!isScratchPaperCoreMatch(core, noteId, userId, draft)) {
    try {
      core = await readNote();
    } catch (caught) {
      return {
        corePersisted: false,
        error: errorMessage(caught, "Scratch Paper could not verify the saved note."),
        ok: false,
      };
    }
  }

  if (!isScratchPaperCoreMatch(core, noteId, userId, draft)) {
    return {
      corePersisted: false,
      error: errorMessage(coreError, "Scratch Paper note changes could not be confirmed."),
      ok: false,
    };
  }

  try {
    await replaceLinks();
    return { corePersisted: true, error: null, ok: true };
  } catch (caught) {
    return {
      corePersisted: true,
      error: errorMessage(caught, "Scratch Paper task links could not be saved."),
      ok: false,
    };
  }
}

export async function saveScratchPaperEditingSession({
  createNote,
  draftId,
  isNew,
  noteId,
  sessionStore,
  updateNote,
}: {
  createNote: (draft: ScratchPaperDraftValues, noteId: string) => Promise<string | null>;
  draftId: string;
  isNew: boolean;
  noteId: string;
  sessionStore: EditingSessionStore<ScratchPaperEditingSessionDraft>;
  updateNote: (noteId: string, draft: ScratchPaperDraftValues) => Promise<boolean>;
}) {
  const session = sessionStore.getSnapshot(draftId);
  if (!session) return false;
  const saveRevision = sessionStore.beginSave(draftId);
  if (saveRevision === null) return false;

  try {
    const saved = isNew
      ? await createNote(session.draft, noteId) === noteId
      : await updateNote(noteId, session.draft);
    if (!saved) {
      sessionStore.saveFailed(draftId, saveRevision, "Scratch Paper could not be saved. Check the error and retry.");
      return false;
    }
    sessionStore.saveSucceeded(draftId, saveRevision, normalizeScratchPaperDraft(session.draft));
    return true;
  } catch (caught) {
    sessionStore.saveFailed(draftId, saveRevision, errorMessage(caught, "Scratch Paper could not be saved."));
    return false;
  }
}

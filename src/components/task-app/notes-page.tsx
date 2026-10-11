"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { NoteEditorComponent } from "./note-editor";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Note, Task } from "@/lib/database.types";
import { PageShell, PageShellBody, PageShellLayoutControls, PageShellSurface, ReorderablePageShells } from "@/components/ui-system/reorderable-page-shells";
import { usePageShellLayout } from "@/hooks/usePageShellLayout";
import { NOTES_PAGE_SHELL_CANONICAL_LAYOUT, NOTES_PAGE_SHELL_IDS } from "@/lib/page-shell-layout";
import { PageShellHeader } from "./page-shell-header";
import { ScratchPaperPageSection, type ScratchPaperData } from "./scratch-paper";
import { VoiceMemoLibrary } from "./voice-memo";
import type { VoiceMemoData } from "@/hooks/useVoiceMemos";
import type { EditingSessionStore } from "@/lib/editing-session-store";
import type { MasterNotesWorkspaceView } from "@/lib/master-workspace-state";
import { areNoteDraftsEqual, createNoteRecordId, type NotesEditingSessionDraft } from "@/lib/note-draft-safety";
import { logNotesSaveDiagnostic, reconcilePersistedNote, saveSharedNoteSession } from "@/lib/notes-save";

type NotesPageProps = {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  notes: Note[];
  onNotesChange: (update: (current: Note[]) => Note[]) => void;
  onDraftSafetyChange: (isUnsafe: boolean) => void;
  notesSessionStore?: EditingSessionStore<NotesEditingSessionDraft> | null;
  activeMasterTabId?: string;
  notesView?: MasterNotesWorkspaceView;
  onNotesViewChange?: (notesView: MasterNotesWorkspaceView) => boolean;
  onOpenNoteHandled?: () => void;
  openNoteId?: string | null;
  tasks: Task[];
  scratchPaper: ScratchPaperData;
  voiceMemos: VoiceMemoData;
};

function makeEmptyNote(id: string, userId: string): Note {
  return {
    id,
    user_id: userId,
    title: "",
    body: "",
    tags: [],
    linked_task_ids: [],
    created_at: "",
    updated_at: "",
  };
}

function noteSessionId(noteId: string) {
  return `note:${noteId}`;
}

function newestFirst(notes: Note[]) {
  return [...notes].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export function NotesPageComponent({
  client,
  currentUser,
  notes,
  onNotesChange,
  onDraftSafetyChange,
  notesSessionStore,
  activeMasterTabId,
  notesView,
  onNotesViewChange,
  onOpenNoteHandled,
  openNoteId,
  tasks,
  scratchPaper,
  voiceMemos,
}: NotesPageProps) {
  const layout = usePageShellLayout(currentUser.id, "notes", NOTES_PAGE_SHELL_IDS, NOTES_PAGE_SHELL_CANONICAL_LAYOUT.sizes, NOTES_PAGE_SHELL_CANONICAL_LAYOUT);
  const [legacyView, setLegacyView] = useState<MasterNotesWorkspaceView>({ selection: { kind: "list" }, search: "", activeTag: null });
  const [legacyEditing, setLegacyEditing] = useState<Note | null>(null);
  const [legacyIsNew, setLegacyIsNew] = useState(false);
  const [legacyQuickCapture, setLegacyQuickCapture] = useState("");
  const [legacyQuickCaptureSaving, setLegacyQuickCaptureSaving] = useState(false);
  const [legacyNoteSaving, setLegacyNoteSaving] = useState(false);
  const [whitespaceQuickCapture, setWhitespaceQuickCapture] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [requestedScratchNoteId, setRequestedScratchNoteId] = useState<string | null>(null);
  const pendingSavedNoteCollectionCheckRef = useRef<Note | null>(null);
  const unsafeDraftSourcesRef = useRef(new Set<string>());
  const sharedSessionsEnabled = Boolean(notesSessionStore && activeMasterTabId && notesView && onNotesViewChange);
  const viewId = activeMasterTabId ?? "legacy-notes-view";
  const view = notesView ?? legacyView;
  const updateView = useCallback((update: (current: MasterNotesWorkspaceView) => MasterNotesWorkspaceView) => {
    const next = update(view);
    if (onNotesViewChange) onNotesViewChange(next);
    else setLegacyView(next);
  }, [onNotesViewChange, view]);
  const reportDraftSafety = useCallback((source: string, isUnsafe: boolean) => {
    if (isUnsafe) unsafeDraftSourcesRef.current.add(source);
    else unsafeDraftSourcesRef.current.delete(source);
    onDraftSafetyChange(unsafeDraftSourcesRef.current.size > 0);
  }, [onDraftSafetyChange]);
  const reportNoteEditorDraftSafety = useCallback((isUnsafe: boolean) => {
    reportDraftSafety("note-editor", isUnsafe);
  }, [reportDraftSafety]);
  const handleScratchNoteRevealHandled = useCallback(() => setRequestedScratchNoteId(null), []);

  useEffect(() => {
    const expected = pendingSavedNoteCollectionCheckRef.current;
    if (!expected) return;
    const observed = notes.find((note) => note.id === expected.id) ?? null;
    const session = notesSessionStore?.getSnapshot(noteSessionId(expected.id)) ?? null;
    logNotesSaveDiagnostic("shared-collection-update-observed", {
      noteId: expected.id,
      rowPresent: Boolean(observed),
      editableFieldsMatchPersistedRow: Boolean(observed && areNoteDraftsEqual(observed, expected)),
      sessionBaselineMatchesPersistedRow: Boolean(
        session?.baseline.kind === "note"
        && areNoteDraftsEqual(session.baseline.note, expected),
      ),
      sharedViewCount: session?.viewIds.length ?? 0,
    });
    pendingSavedNoteCollectionCheckRef.current = null;
  }, [notes, notesSessionStore]);

  const captureDraftId = `quick-capture:${viewId}`;
  const subscribeCapture = useCallback((listener: () => void) => (
    sharedSessionsEnabled && notesSessionStore
      ? notesSessionStore.subscribeToSession(captureDraftId, listener)
      : () => {}
  ), [captureDraftId, notesSessionStore, sharedSessionsEnabled]);
  const getCaptureSnapshot = useCallback(() => (
    sharedSessionsEnabled && notesSessionStore ? notesSessionStore.getSnapshot(captureDraftId) : null
  ), [captureDraftId, notesSessionStore, sharedSessionsEnabled]);
  const captureSession = useSyncExternalStore(subscribeCapture, getCaptureSnapshot, getCaptureSnapshot);
  const sharedCaptureText = captureSession?.draft.kind === "quick-capture" ? captureSession.draft.text : "";
  const quickCapture = sharedSessionsEnabled ? sharedCaptureText || whitespaceQuickCapture : legacyQuickCapture;
  const isSavingQuickCapture = sharedSessionsEnabled ? Boolean(captureSession?.isSaving) : legacyQuickCaptureSaving;

  useEffect(() => {
    if (!sharedSessionsEnabled || !notesSessionStore) return;
    notesSessionStore.ensureSession(captureDraftId, captureDraftId, {
      kind: "quick-capture",
      text: "",
      pendingNoteId: null,
    });
    notesSessionStore.attachView(captureDraftId, viewId);
  }, [captureDraftId, notesSessionStore, sharedSessionsEnabled, viewId]);

  useEffect(() => {
    reportDraftSafety("quick-capture", sharedSessionsEnabled
      ? Boolean(captureSession?.isSaving)
      : Boolean(quickCapture.trim()) || isSavingQuickCapture);
  }, [captureSession?.isSaving, isSavingQuickCapture, quickCapture, reportDraftSafety, sharedSessionsEnabled]);

  const selection = view.selection;
  const selectedNote = selection.kind === "saved"
    ? notes.find((note) => note.id === selection.noteId) ?? null
    : null;
  const selectedDraftId = selection.kind === "saved"
    ? noteSessionId(selection.noteId)
    : selection.kind === "new" ? noteSessionId(selection.draftId) : null;
  const subscribeSelected = useCallback((listener: () => void) => (
    sharedSessionsEnabled && notesSessionStore && selectedDraftId
      ? notesSessionStore.subscribeToSession(selectedDraftId, listener)
      : () => {}
  ), [notesSessionStore, selectedDraftId, sharedSessionsEnabled]);
  const getSelectedSnapshot = useCallback(() => (
    sharedSessionsEnabled && notesSessionStore && selectedDraftId
      ? notesSessionStore.getSnapshot(selectedDraftId)
      : null
  ), [notesSessionStore, selectedDraftId, sharedSessionsEnabled]);
  const selectedSession = useSyncExternalStore(subscribeSelected, getSelectedSnapshot, getSelectedSnapshot);

  useEffect(() => {
    if (!sharedSessionsEnabled || !notesSessionStore || !selectedDraftId) return;
    if (view.selection.kind === "saved") {
      if (!selectedNote) return;
      notesSessionStore.ensureSession(selectedDraftId, selectedNote.id, { kind: "note", note: selectedNote });
    } else if (view.selection.kind === "new") {
      const note = makeEmptyNote(view.selection.draftId, currentUser.id);
      notesSessionStore.ensureSession(selectedDraftId, note.id, { kind: "note", note });
    } else return;
    notesSessionStore.attachView(selectedDraftId, viewId);
  }, [currentUser.id, notesSessionStore, selectedDraftId, selectedNote, sharedSessionsEnabled, view.selection, viewId]);

  useEffect(() => {
    if (!sharedSessionsEnabled || view.selection.kind !== "saved" || selectedNote || selectedSession) return;
    // This repairs persisted navigation that points to a Note removed from the authoritative list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateView((current) => ({ ...current, selection: { kind: "list" } }));
  }, [selectedNote, selectedSession, sharedSessionsEnabled, updateView, view.selection]);

  const openSavedNote = useCallback((note: Note) => {
    if (sharedSessionsEnabled && notesSessionStore) {
      const draftId = noteSessionId(note.id);
      const priorSession = notesSessionStore.getSnapshot(draftId);
      notesSessionStore.ensureSession(draftId, note.id, { kind: "note", note });
      notesSessionStore.attachView(draftId, viewId);
      const openedSession = notesSessionStore.getSnapshot(draftId);
      logNotesSaveDiagnostic("note-opened", {
        noteId: note.id,
        collectionMatchesSessionBaseline: Boolean(
          openedSession?.baseline.kind === "note"
          && areNoteDraftsEqual(openedSession.baseline.note, note),
        ),
        priorSessionWasDirty: priorSession?.dirty ?? false,
        sharedViewCount: openedSession?.viewIds.length ?? 0,
      });
      updateView((current) => ({ ...current, selection: { kind: "saved", noteId: note.id } }));
    } else {
      setLegacyEditing(note);
      setLegacyIsNew(false);
    }
    setSaveError(null);
  }, [notesSessionStore, sharedSessionsEnabled, updateView, viewId]);

  const requestedOpenNote = openNoteId ? notes.find((note) => note.id === openNoteId) ?? null : null;
  const isOpenNoteBlockedByDraft = Boolean(
    sharedSessionsEnabled
    && requestedOpenNote
    && (selectedSession?.dirty || selectedSession?.isSaving)
    && !(view.selection.kind === "saved" && view.selection.noteId === requestedOpenNote.id),
  );

  useEffect(() => {
    if (!openNoteId) return;
    const targetNote = requestedOpenNote;
    if (!targetNote) return;
    if (view.selection.kind === "saved" && view.selection.noteId === targetNote.id) {
      onOpenNoteHandled?.();
      return;
    }
    if (selectedSession?.dirty || selectedSession?.isSaving) {
      return;
    }
    openSavedNote(targetNote);
    onOpenNoteHandled?.();
  }, [onOpenNoteHandled, openNoteId, openSavedNote, requestedOpenNote, selectedSession, view.selection]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const note of notes) for (const tag of note.tags) set.add(tag);
    return [...set].sort();
  }, [notes]);
  const filtered = useMemo(() => notes.filter((note) => {
    const matchSearch = !view.search
      || note.title.toLowerCase().includes(view.search.toLowerCase())
      || note.body.toLowerCase().includes(view.search.toLowerCase());
    const matchTag = !view.activeTag || note.tags.includes(view.activeTag);
    return matchSearch && matchTag;
  }), [notes, view.activeTag, view.search]);

  function openNew() {
    if (sharedSessionsEnabled && notesSessionStore) {
      const id = createNoteRecordId();
      const draftId = noteSessionId(id);
      const note = makeEmptyNote(id, currentUser.id);
      notesSessionStore.ensureSession(draftId, id, { kind: "note", note });
      notesSessionStore.attachView(draftId, viewId);
      updateView((current) => ({ ...current, selection: { kind: "new", draftId: id } }));
    } else {
      setLegacyEditing(makeEmptyNote(createNoteRecordId(), currentUser.id));
      setLegacyIsNew(true);
    }
    setSaveError(null);
  }

  async function reconcileQuickCapture(id: string, expected: Note): Promise<Note | null> {
    const { data, error } = await client
      .from("adhdice_notes")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    if (areNoteDraftsEqual(data, expected)) return data;
    const { data: updated, error: updateError } = await client
      .from("adhdice_notes")
      .update({ title: expected.title, body: expected.body, tags: expected.tags, linked_task_ids: expected.linked_task_ids })
      .eq("id", id)
      .eq("user_id", currentUser.id)
      .select("*")
      .single();
    return !updateError && updated ? updated : null;
  }

  function finishEditing() {
    if (sharedSessionsEnabled) {
      if (selectedSession?.isSaving || !selectedDraftId || !notesSessionStore) return;
      notesSessionStore.discardDraft(selectedDraftId);
      updateView((current) => ({ ...current, selection: { kind: "list" } }));
    } else {
      if (legacyNoteSaving) return;
      setLegacyEditing(null);
      setLegacyIsNew(false);
    }
    setSaveError(null);
  }

  async function saveSharedNote(): Promise<boolean> {
    if (!notesSessionStore || !selectedDraftId) return false;
    const result = await saveSharedNoteSession({
      client,
      userId: currentUser.id,
      sessionStore: notesSessionStore,
      draftId: selectedDraftId,
      isNew: view.selection.kind === "new",
      onCollectionUpdate: (savedNote) => { pendingSavedNoteCollectionCheckRef.current = savedNote; },
      onNotesChange,
    });
    if (!result.ok) return false;
    updateView((current) => ({ ...current, selection: { kind: "list" } }));
    setSaveError(null);
    return true;
  }

  async function deleteSharedNote(id: string): Promise<boolean> {
    if (!notesSessionStore || !selectedDraftId) return false;
    const saveRevision = notesSessionStore.beginSave(selectedDraftId);
    if (saveRevision === null) return false;
    try {
      const { error } = await client
        .from("adhdice_notes")
        .delete()
        .eq("id", id)
        .eq("user_id", currentUser.id)
        .select("id")
        .maybeSingle();
      if (error) {
        const { data: remainingNote, error: reconcileError } = await client
          .from("adhdice_notes")
          .select("id")
          .eq("user_id", currentUser.id)
          .eq("id", id)
          .maybeSingle();
        if (reconcileError || remainingNote) {
          notesSessionStore.saveFailed(selectedDraftId, saveRevision, error.message);
          return false;
        }
      }
      if (!notesSessionStore.removeAfterSave(selectedDraftId, saveRevision)) return false;
      onNotesChange((current) => current.filter((note) => note.id !== id));
      updateView((current) => ({ ...current, selection: { kind: "list" } }));
      setSaveError(null);
      return true;
    } catch (caught) {
      notesSessionStore.saveFailed(selectedDraftId, saveRevision, caught instanceof Error ? caught.message : "Note could not be deleted.");
      return false;
    }
  }

  async function saveLegacyNote(note: Note): Promise<boolean> {
    if (legacyNoteSaving) return false;
    setLegacyNoteSaving(true);
    setSaveError(null);
    let persistenceError = "Note could not be saved. Check your connection and try again.";
    try {
      let savedNote: Note | null = null;
      if (legacyIsNew) {
        const { data, error } = await client
          .from("adhdice_notes")
          .insert({ id: note.id, user_id: currentUser.id, title: note.title, body: note.body, tags: note.tags, linked_task_ids: note.linked_task_ids })
          .select("*")
          .single();
        if (error) persistenceError = error.message;
        savedNote = !error && data ? data : await reconcilePersistedNote(client, currentUser.id, note.id, note);
      } else {
        const { data, error } = await client
          .from("adhdice_notes")
          .update({ title: note.title, body: note.body, tags: note.tags, linked_task_ids: note.linked_task_ids })
          .eq("id", note.id)
          .eq("user_id", currentUser.id)
          .select("*")
          .single();
        if (error) persistenceError = error.message;
        savedNote = !error && data ? data : await reconcilePersistedNote(client, currentUser.id, note.id, note);
      }
      if (!savedNote) {
        setSaveError(persistenceError);
        return false;
      }
      onNotesChange((current) => newestFirst([savedNote!, ...current.filter((entry) => entry.id !== savedNote!.id)]));
      setLegacyEditing(null);
      setLegacyIsNew(false);
      return true;
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Note could not be saved.");
      return false;
    } finally {
      setLegacyNoteSaving(false);
    }
  }

  async function deleteLegacyNote(id: string): Promise<boolean> {
    if (legacyNoteSaving) return false;
    setLegacyNoteSaving(true);
    setSaveError(null);
    try {
      const { error } = await client.from("adhdice_notes").delete().eq("id", id).eq("user_id", currentUser.id);
      if (error) {
        setSaveError(error.message);
        return false;
      }
      onNotesChange((current) => current.filter((note) => note.id !== id));
      setLegacyEditing(null);
      setLegacyIsNew(false);
      return true;
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Note could not be deleted.");
      return false;
    } finally {
      setLegacyNoteSaving(false);
    }
  }

  async function handleQuickCapture() {
    if (isSavingQuickCapture || !quickCapture.trim()) return;
    if (sharedSessionsEnabled && notesSessionStore) {
      let capture = notesSessionStore.getSnapshot(captureDraftId);
      if (!capture || capture.draft.kind !== "quick-capture") return;
      if (!capture.draft.pendingNoteId) {
        const pendingNoteId = createNoteRecordId();
        notesSessionStore.updateDraft(captureDraftId, (current) => current.kind === "quick-capture"
          ? { ...current, pendingNoteId }
          : current);
        capture = notesSessionStore.getSnapshot(captureDraftId);
        if (!capture || capture.draft.kind !== "quick-capture") return;
      }
      const pendingNoteId = capture.draft.pendingNoteId;
      if (!pendingNoteId) return;
      const saveRevision = notesSessionStore.beginSave(captureDraftId);
      if (saveRevision === null) return;
      reportDraftSafety("quick-capture", true);
      const expectedNote = makeEmptyNote(pendingNoteId, currentUser.id);
      expectedNote.title = capture.draft.text.trim();
      try {
        const { data, error } = await client
          .from("adhdice_notes")
          .insert({ id: pendingNoteId, user_id: currentUser.id, title: expectedNote.title, body: "" })
          .select("*")
          .single();
        const savedNote = !error && data ? data : await reconcileQuickCapture(pendingNoteId, expectedNote);
        if (!savedNote) {
          notesSessionStore.saveFailed(captureDraftId, saveRevision, error?.message ?? "Quick Capture could not be saved.");
          return;
        }
        notesSessionStore.saveSucceeded(captureDraftId, saveRevision, { kind: "quick-capture", text: "", pendingNoteId: null });
        onNotesChange((current) => newestFirst([savedNote, ...current.filter((note) => note.id !== savedNote.id)]));
        setWhitespaceQuickCapture("");
        setSaveError(null);
      } catch (caught) {
        notesSessionStore.saveFailed(captureDraftId, saveRevision, caught instanceof Error ? caught.message : "Quick Capture could not be saved.");
      } finally {
        reportDraftSafety("quick-capture", false);
      }
      return;
    }

    if (legacyQuickCaptureSaving) return;
    setLegacyQuickCaptureSaving(true);
    setSaveError(null);
    try {
      const { data, error } = await client
        .from("adhdice_notes")
        .insert({ user_id: currentUser.id, title: quickCapture.trim(), body: "" })
        .select("*")
        .single();
      if (error || !data) {
        setSaveError(error?.message ?? "Quick Capture could not be saved.");
        return;
      }
      onNotesChange((current) => newestFirst([data, ...current.filter((note) => note.id !== data.id)]));
      setLegacyQuickCapture("");
      reportDraftSafety("quick-capture", false);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Quick Capture could not be saved.");
    } finally {
      setLegacyQuickCaptureSaving(false);
    }
  }

  const editorNote = sharedSessionsEnabled
    ? selectedSession?.draft.kind === "note"
      ? selectedSession.draft.note
      : view.selection.kind === "new" ? makeEmptyNote(view.selection.draftId, currentUser.id) : selectedNote
    : legacyEditing;
  const editorIsNew = sharedSessionsEnabled ? view.selection.kind === "new" : legacyIsNew;
  const editorIsSaving = sharedSessionsEnabled ? Boolean(selectedSession?.isSaving) : legacyNoteSaving;
  const editorSaveError = sharedSessionsEnabled
    ? selectedSession?.saveError ?? (isOpenNoteBlockedByDraft ? "Save or discard the current Note draft before opening another Note." : null)
    : saveError;

  if ((sharedSessionsEnabled && view.selection.kind !== "list" && !selectedSession) || (editorNote && !editorNote.id)) {
    return <section className="flex min-h-48 items-center justify-center px-4 text-sm text-[#7d88a1]">Loading Note draft…</section>;
  }

  if (editorNote) {
    return (
      <NoteEditorComponent
        isNew={editorIsNew}
        isSaving={editorIsSaving}
        note={editorNote}
        onDraftSafetyChange={reportNoteEditorDraftSafety}
        onClose={finishEditing}
        onDelete={sharedSessionsEnabled ? deleteSharedNote : deleteLegacyNote}
        onSave={sharedSessionsEnabled ? () => saveSharedNote() : saveLegacyNote}
        saveError={editorSaveError}
        tasks={tasks}
        sessionStore={sharedSessionsEnabled ? notesSessionStore : null}
        sessionDraftId={sharedSessionsEnabled ? selectedDraftId ?? undefined : undefined}
        viewId={sharedSessionsEnabled ? viewId : undefined}
      />
    );
  }

  return (
    <section className="px-4 pb-32">
      <div className="flex items-center justify-between">
        <PageShellHeader actions={<PageShellLayoutControls layout={layout} />} subtitle="Scratch Paper + Knowledge Base + Voice Memos" title="Notes" />
        <button
          className="mb-2 flex h-10 w-10 items-center justify-center rounded-full font-bold text-xl bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]"
          onClick={openNew}
          type="button"
        >
          +
        </button>
      </div>

      <ReorderablePageShells layout={layout} shellsClassName="grid min-w-0 gap-5">
      <PageShell id="notes-scratch-paper" label="Scratch Paper">
      <PageShellSurface className="rounded-[1.5rem] border border-[#e9e3f7] bg-[#f8f6ff] p-4 shadow-[0_18px_45px_rgba(81,61,168,0.1)] dark:border-white/10 dark:bg-white/[0.03]">
      <PageShellBody>
        <ScratchPaperPageSection
          {...scratchPaper}
          onDraftSafetyChange={reportDraftSafety}
          onScratchNoteRevealHandled={handleScratchNoteRevealHandled}
          requestedScratchNoteId={requestedScratchNoteId}
        />
      </PageShellBody>
      </PageShellSurface>
      </PageShell>

      <PageShell id="notes-library" label="Notes Library">
      <PageShellSurface className="rounded-[1.5rem] border border-[#e9e3f7] bg-[#f8f6ff] p-4 shadow-[0_18px_45px_rgba(81,61,168,0.1)] dark:border-white/10 dark:bg-white/[0.03]">
      <PageShellBody>
      <div className="mb-4 flex gap-2 rounded-2xl px-4 py-3 bg-[#f7f5ff] dark:bg-white/5">
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none text-[#27304c] placeholder:text-[#9b9fba] dark:text-white dark:placeholder:text-white/35"
          onKeyDown={(event) => { if (event.key === "Enter") void handleQuickCapture(); }}
          disabled={isSavingQuickCapture}
          onChange={(event) => {
            const value = event.target.value;
            if (sharedSessionsEnabled && notesSessionStore) {
              setWhitespaceQuickCapture(value.trim() ? "" : value);
              notesSessionStore.updateDraft(captureDraftId, (current) => current.kind === "quick-capture"
                ? { ...current, text: value.trim() ? value : "", pendingNoteId: value.trim() ? current.pendingNoteId : null }
                : current);
              reportDraftSafety("quick-capture", false);
            } else {
              setLegacyQuickCapture(value);
              reportDraftSafety("quick-capture", Boolean(value.trim()) || isSavingQuickCapture);
            }
          }}
          placeholder="Quick capture — press Enter to save…"
          value={quickCapture}
        />
        {quickCapture.length > 0 ? (
          <div className="flex shrink-0 gap-2">
            <button
              disabled={isSavingQuickCapture}
              className="ui-pill-button-light"
              onClick={() => {
                if (sharedSessionsEnabled && notesSessionStore) {
                  notesSessionStore.discardDraft(captureDraftId);
                  setWhitespaceQuickCapture("");
                } else setLegacyQuickCapture("");
                setSaveError(null);
                reportDraftSafety("quick-capture", false);
              }}
              type="button"
            >
              Discard
            </button>
            <button
              disabled={isSavingQuickCapture || !quickCapture.trim()}
              className="ui-pill-button-strong-light"
              onClick={() => { void handleQuickCapture(); }}
              type="button"
            >
              {isSavingQuickCapture ? "Saving…" : "Save"}
            </button>
          </div>
        ) : null}
      </div>
      {(sharedSessionsEnabled ? captureSession?.saveError : saveError) && !editorNote ? (
        <p aria-live="polite" className="mb-3 text-sm font-semibold text-[#c64c62] dark:text-[#ffb1c0]" role="alert">
          {sharedSessionsEnabled ? captureSession?.saveError : saveError}
        </p>
      ) : null}

      <div className="mb-3 flex gap-2 rounded-2xl px-4 py-2.5 bg-[#f7f5ff] dark:bg-white/5">
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none text-[#27304c] placeholder:text-[#9b9fba] dark:text-white dark:placeholder:text-white/35"
          onChange={(event) => updateView((current) => ({ ...current, search: event.target.value }))}
          placeholder="Search notes…"
          value={view.search}
        />
      </div>

      {allTags.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => updateView((current) => ({ ...current, activeTag: current.activeTag === tag ? null : tag }))}
              type="button"
              className={`transition ${view.activeTag === tag ? "ui-pill-button-strong-light" : "ui-pill-button-light"}`}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-[#8e88a9] dark:text-white/40">
          {notes.length === 0 ? "No notes yet. Use quick capture above." : "No notes match your filter."}
        </p>
      ) : (
        <div className="columns-2 gap-3">
          {filtered.map((note) => (
            <button
              key={note.id}
              className="mb-3 w-full break-inside-avoid rounded-2xl px-4 py-3 text-left transition hover:opacity-80 bg-[#f7f5ff] dark:bg-white/5"
              onClick={() => openSavedNote(note)}
              type="button"
            >
              {note.title ? <p className="mb-1 text-sm font-semibold leading-snug text-[#17203a] dark:text-white">{note.title}</p> : null}
              {note.body ? <p className="text-xs leading-relaxed line-clamp-4 text-[#707a95] dark:text-white/55">{note.body}</p> : null}
              {note.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {note.tags.map((tag) => (
                    <span key={tag} className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[#ede8ff] text-[#6f57f6] dark:bg-white/10 dark:text-[#cabfff]">{tag}</span>
                  ))}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}
      </PageShellBody>
      </PageShellSurface>
      </PageShell>

      <PageShell id="notes-voice-memos" label="Voice Memos">
      <PageShellSurface className="rounded-[1.5rem] border border-[#e9e3f7] bg-[#f8f6ff] p-4 shadow-[0_18px_45px_rgba(81,61,168,0.1)] dark:border-white/10 dark:bg-white/[0.03]">
      <PageShellBody>
        <VoiceMemoLibrary data={voiceMemos} onOpenSourceNote={setRequestedScratchNoteId} scratchNotes={scratchPaper.notes} />
      </PageShellBody>
      </PageShellSurface>
      </PageShell>
      </ReorderablePageShells>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type NotesPageProps = {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  onDraftSafetyChange: (isUnsafe: boolean) => void;
  onOpenNoteHandled?: () => void;
  openNoteId?: string | null;
  tasks: Task[];
  scratchPaper: ScratchPaperData;
  voiceMemos: VoiceMemoData;
};

export function NotesPageComponent({
  client,
  currentUser,
  onDraftSafetyChange,
  onOpenNoteHandled,
  openNoteId,
  tasks,
  scratchPaper,
  voiceMemos,
}: NotesPageProps) {
  const layout = usePageShellLayout(currentUser.id, "notes", NOTES_PAGE_SHELL_IDS, NOTES_PAGE_SHELL_CANONICAL_LAYOUT.sizes, NOTES_PAGE_SHELL_CANONICAL_LAYOUT);
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<Note | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [quickCapture, setQuickCapture] = useState("");
  const [isSavingQuickCapture, setIsSavingQuickCapture] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [requestedScratchNoteId, setRequestedScratchNoteId] = useState<string | null>(null);
  const unsafeDraftSourcesRef = useRef(new Set<string>());
  const reportDraftSafety = useCallback((source: string, isUnsafe: boolean) => {
    if (isUnsafe) unsafeDraftSourcesRef.current.add(source);
    else unsafeDraftSourcesRef.current.delete(source);
    onDraftSafetyChange(unsafeDraftSourcesRef.current.size > 0);
  }, [onDraftSafetyChange]);
  const handleScratchNoteRevealHandled = useCallback(() => setRequestedScratchNoteId(null), []);

  useEffect(() => {
    void client
      .from("adhdice_notes")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        if (data) setNotes(data);
      });
  }, [client, currentUser.id]);

  useEffect(() => {
    if (!openNoteId || notes.length === 0) {
      return;
    }
    const targetNote = notes.find((note) => note.id === openNoteId);
    if (!targetNote) {
      return;
    }
    setEditing(targetNote);
    setIsNew(false);
    setSaveError(null);
    reportDraftSafety("note-editor", true);
    onOpenNoteHandled?.();
  }, [notes, onOpenNoteHandled, openNoteId, reportDraftSafety]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of n.tags) set.add(t);
    return [...set].sort();
  }, [notes]);

  const filtered = useMemo(
    () =>
      notes.filter((n) => {
        const matchSearch =
          !search ||
          n.title.toLowerCase().includes(search.toLowerCase()) ||
          n.body.toLowerCase().includes(search.toLowerCase());
        const matchTag = !activeTag || n.tags.includes(activeTag);
        return matchSearch && matchTag;
      }),
    [notes, search, activeTag],
  );

  async function handleQuickCapture() {
    if (isSavingQuickCapture || !quickCapture.trim()) return;
    reportDraftSafety("quick-capture", true);
    setIsSavingQuickCapture(true);
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
      setNotes((prev) => [data, ...prev]);
      setQuickCapture("");
      reportDraftSafety("quick-capture", false);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Quick Capture could not be saved.");
    } finally {
      setIsSavingQuickCapture(false);
    }
  }

  async function handleSaveNote(note: Note): Promise<boolean> {
    if (isSavingNote) return false;
    setIsSavingNote(true);
    reportDraftSafety("note-editor", true);
    setSaveError(null);
    try {
      if (isNew) {
        const { data, error } = await client
          .from("adhdice_notes")
          .insert({
            user_id: currentUser.id,
            title: note.title,
            body: note.body,
            tags: note.tags,
            linked_task_ids: note.linked_task_ids,
          })
          .select("*")
          .single();
        if (error || !data) {
          setSaveError(error?.message ?? "Note could not be saved.");
          return false;
        }
        setNotes((prev) => [data, ...prev]);
      } else {
        const { error } = await client
          .from("adhdice_notes")
          .update({
            title: note.title,
            body: note.body,
            tags: note.tags,
            linked_task_ids: note.linked_task_ids,
          })
          .eq("id", note.id);
        if (error) {
          setSaveError(error.message);
          return false;
        }
        setNotes((prev) => prev.map((entry) => (
          entry.id === note.id ? { ...entry, ...note, updated_at: new Date().toISOString() } : entry
        )));
      }
      setEditing(null);
      setIsNew(false);
      reportDraftSafety("note-editor", false);
      return true;
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Note could not be saved.");
      return false;
    } finally {
      setIsSavingNote(false);
    }
  }

  async function handleDeleteNote(id: string): Promise<boolean> {
    if (isSavingNote) return false;
    setIsSavingNote(true);
    reportDraftSafety("note-editor", true);
    setSaveError(null);
    try {
      const { error } = await client.from("adhdice_notes").delete().eq("id", id);
      if (error) {
        setSaveError(error.message);
        return false;
      }
      setNotes((prev) => prev.filter((note) => note.id !== id));
      setEditing(null);
      setIsNew(false);
      reportDraftSafety("note-editor", false);
      return true;
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Note could not be deleted.");
      return false;
    } finally {
      setIsSavingNote(false);
    }
  }

  function openNew() {
    if (isSavingNote) return;
    reportDraftSafety("note-editor", true);
    setSaveError(null);
    setEditing({
      id: "",
      user_id: currentUser.id,
      title: "",
      body: "",
      tags: [],
      linked_task_ids: [],
      created_at: "",
      updated_at: "",
    });
    setIsNew(true);
  }

  if (editing) {
    return (
      <NoteEditorComponent
        isNew={isNew}
        isSaving={isSavingNote}
        note={editing}
        onClose={() => {
          if (isSavingNote) return;
          reportDraftSafety("note-editor", false);
          setEditing(null);
          setIsNew(false);
          setSaveError(null);
        }}
        onDelete={handleDeleteNote}
        onSave={handleSaveNote}
        saveError={saveError}
        tasks={tasks}
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
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleQuickCapture();
          }}
          disabled={isSavingQuickCapture}
          onChange={(e) => {
            const value = e.target.value;
            setQuickCapture(value);
            reportDraftSafety("quick-capture", Boolean(value.trim()) || isSavingQuickCapture);
          }}
          placeholder="Quick capture — press Enter to save…"
          value={quickCapture}
        />
        {quickCapture ? (
          <button
            disabled={isSavingQuickCapture}
            className="ui-pill-button-strong-light"
            onClick={() => {
              void handleQuickCapture();
            }}
            type="button"
          >
            {isSavingQuickCapture ? "Saving…" : "Save"}
          </button>
        ) : null}
      </div>
      {saveError && !editing ? <p aria-live="polite" className="mb-3 text-sm font-semibold text-[#c64c62] dark:text-[#ffb1c0]" role="alert">{saveError}</p> : null}

      <div className="mb-3 flex gap-2 rounded-2xl px-4 py-2.5 bg-[#f7f5ff] dark:bg-white/5">
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none text-[#27304c] placeholder:text-[#9b9fba] dark:text-white dark:placeholder:text-white/35"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes…"
          value={search}
        />
      </div>

      {allTags.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              type="button"
              className={`transition ${activeTag === tag ? "ui-pill-button-strong-light" : "ui-pill-button-light"}`}
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
              onClick={() => {
                if (isSavingNote) return;
                reportDraftSafety("note-editor", true);
                setSaveError(null);
                setEditing(note);
                setIsNew(false);
              }}
              type="button"
            >
              {note.title ? (
                <p className="mb-1 text-sm font-semibold leading-snug text-[#17203a] dark:text-white">
                  {note.title}
                </p>
              ) : null}
              {note.body ? (
                <p className="text-xs leading-relaxed line-clamp-4 text-[#707a95] dark:text-white/55">
                  {note.body}
                </p>
              ) : null}
              {note.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {note.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[#ede8ff] text-[#6f57f6] dark:bg-white/10 dark:text-[#cabfff]"
                    >
                      {t}
                    </span>
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

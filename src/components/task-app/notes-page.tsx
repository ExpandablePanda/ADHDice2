"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { NoteEditorComponent } from "./note-editor";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Note, Task } from "@/lib/database.types";
import { ScratchPaperPageSection, type ScratchPaperData } from "./scratch-paper";

type NotesPageProps = {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  headerNode: ReactNode;
  onOpenNoteHandled?: () => void;
  openNoteId?: string | null;
  tasks: Task[];
  scratchPaper: ScratchPaperData;
};

export function NotesPageComponent({
  client,
  currentUser,
  headerNode,
  onOpenNoteHandled,
  openNoteId,
  tasks,
  scratchPaper,
}: NotesPageProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<Note | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [quickCapture, setQuickCapture] = useState("");

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
    onOpenNoteHandled?.();
  }, [notes, onOpenNoteHandled, openNoteId]);

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
    if (!quickCapture.trim()) return;
    const { data } = await client
      .from("adhdice_notes")
      .insert({ user_id: currentUser.id, title: quickCapture.trim(), body: "" })
      .select("*")
      .single();
    if (data) setNotes((prev) => [data, ...prev]);
    setQuickCapture("");
  }

  async function handleSaveNote(note: Note) {
    if (isNew) {
      const { data } = await client
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
      if (data) setNotes((prev) => [data, ...prev]);
    } else {
      await client
        .from("adhdice_notes")
        .update({
          title: note.title,
          body: note.body,
          tags: note.tags,
          linked_task_ids: note.linked_task_ids,
        })
        .eq("id", note.id);
      setNotes((prev) =>
        prev.map((n) =>
          n.id === note.id ? { ...n, ...note, updated_at: new Date().toISOString() } : n,
        ),
      );
    }
    setEditing(null);
    setIsNew(false);
  }

  async function handleDeleteNote(id: string) {
    await client.from("adhdice_notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setEditing(null);
  }

  function openNew() {
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
        note={editing}
        onClose={() => {
          setEditing(null);
          setIsNew(false);
        }}
        onDelete={handleDeleteNote}
        onSave={handleSaveNote}
        tasks={tasks}
      />
    );
  }

  return (
    <section className="px-4 pb-32">
      <div className="flex items-center justify-between">
        {headerNode}
        <button
          className="mb-2 flex h-10 w-10 items-center justify-center rounded-full font-bold text-xl bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]"
          onClick={openNew}
          type="button"
        >
          +
        </button>
      </div>

      <ScratchPaperPageSection {...scratchPaper} />

      <div className="mb-4 flex gap-2 rounded-2xl px-4 py-3 bg-[#f7f5ff] dark:bg-white/5">
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none text-[#27304c] placeholder:text-[#9b9fba] dark:text-white dark:placeholder:text-white/35"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleQuickCapture();
          }}
          onChange={(e) => setQuickCapture(e.target.value)}
          placeholder="Quick capture — press Enter to save…"
          value={quickCapture}
        />
        {quickCapture ? (
          <button
            className="ui-pill-button-strong-light"
            onClick={() => {
              void handleQuickCapture();
            }}
            type="button"
          >
            Save
          </button>
        ) : null}
      </div>

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
    </section>
  );
}

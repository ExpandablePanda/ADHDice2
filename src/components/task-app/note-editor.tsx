"use client";

import { useState } from "react";
import type { Note, Task } from "@/lib/database.types";

type NoteEditorProps = {
  isNew: boolean;
  note: Note;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onSave: (note: Note) => Promise<void>;
  tasks: Task[];
};

export function NoteEditorComponent({
  isNew,
  note,
  onClose,
  onDelete,
  onSave,
}: NoteEditorProps) {
  const [draft, setDraft] = useState<Note>(note);
  const [tagInput, setTagInput] = useState("");

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !draft.tags.includes(t)) setDraft((d) => ({ ...d, tags: [...d.tags, t] }));
    setTagInput("");
  }

  return (
    <section className="px-4 pb-32">
      <div className="flex items-center gap-3 pt-4 pb-4">
        <button onClick={onClose} type="button" className="ui-pill-button-light">
          ← Back
        </button>
        <div className="flex-1" />
        {!isNew ? (
          <button
            onClick={() => { void onDelete(draft.id); }}
            type="button"
            className="ui-pill-button-danger-light"
          >
            Delete
          </button>
        ) : null}
        <button
          onClick={() => { void onSave(draft); }}
          type="button"
          className="ui-pill-button-strong-light"
        >
          Save
        </button>
      </div>

      <input
        autoFocus
        className="mb-3 w-full border-b-2 bg-transparent pb-2 text-2xl font-bold outline-none border-[#6f57f6] text-[#1e2540] placeholder:text-[#bbb8d0] dark:border-[#cabfff]/50 dark:text-white dark:placeholder:text-white/25"
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        placeholder="Title"
        value={draft.title}
      />

      <textarea
        className="mb-4 min-h-40 w-full resize-y rounded-2xl px-4 py-3 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
        onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
        placeholder="Write something…"
        value={draft.body}
      />

      <div className="mb-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Tags</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {draft.tags.map((t) => (
            <button
              key={t}
              onClick={() => setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }))}
              type="button"
              className="ui-pill-button-strong-light"
            >
              {t} ×
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none bg-[#f7f5ff] text-[#1e2540] dark:bg-white/5 dark:text-white"
            onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add tag…"
            value={tagInput}
          />
          <button
            className="ui-pill-button-strong-light"
            onClick={addTag}
            type="button"
          >
            Add
          </button>
        </div>
      </div>
    </section>
  );
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { areNoteDraftsEqual } from "../src/lib/note-draft-safety.ts";

const notesPageSource = readFileSync(new URL("../src/components/task-app/notes-page.tsx", import.meta.url), "utf8");
const noteEditorSource = readFileSync(new URL("../src/components/task-app/note-editor.tsx", import.meta.url), "utf8");

test("Notes compares existing editor content to its saved baseline", () => {
  const saved = { body: "Saved text", linked_task_ids: ["task-1"], tags: ["idea"], title: "Saved title" };
  assert.equal(areNoteDraftsEqual(saved, saved), true);
  assert.equal(areNoteDraftsEqual(saved, { ...saved, body: "Edited text" }), false);
  assert.equal(areNoteDraftsEqual(saved, { ...saved, tags: ["idea", "next"] }), false);
  assert.equal(areNoteDraftsEqual(saved, { ...saved, body: "Saved text" }), true);
  assert.equal(areNoteDraftsEqual(saved, { ...saved, title: "Saved title" }), true);
});

test("Quick Capture releases on clear or whitespace and keeps failed saves protected", () => {
  assert.match(notesPageSource, /reportDraftSafety\("quick-capture", Boolean\(value\.trim\(\)\) \|\| isSavingQuickCapture\)/);
  assert.match(notesPageSource, /if \(isSavingQuickCapture \|\| !quickCapture\.trim\(\)\) return/);
  assert.match(notesPageSource, /setQuickCapture\(""\);[\s\S]*?reportDraftSafety\("quick-capture", false\)/);
  assert.match(notesPageSource, /setSaveError\(error\?\.message \?\? "Quick Capture could not be saved\."\);\s*return;/);
  assert.match(notesPageSource, /setQuickCapture\(""\);\s*reportDraftSafety\("quick-capture", false\);/);
  assert.match(notesPageSource, />\s*Discard\s*</);
});

test("Note editor revert and Cancel/Discard use one source without hiding pending saves", () => {
  assert.match(noteEditorSource, /!areNoteDraftsEqual\(draft, note\)/);
  assert.match(noteEditorSource, /const isDraftUnsafe = isSaving[\s\S]*?tagInput\.trim\(\)/);
  assert.match(noteEditorSource, /onDraftSafetyChange\(isDraftUnsafe\)/);
  assert.match(noteEditorSource, /isDraftUnsafe && !isSaving \? "Discard Draft" : "← Back"/);
  assert.match(notesPageSource, /const reportNoteEditorDraftSafety = useCallback\(\(isUnsafe: boolean\) => \{\s*reportDraftSafety\("note-editor", isUnsafe\);\s*\}, \[reportDraftSafety\]\)/);
  assert.match(notesPageSource, /onDraftSafetyChange=\{reportNoteEditorDraftSafety\}/);
});

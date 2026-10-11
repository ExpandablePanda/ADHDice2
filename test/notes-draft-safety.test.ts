import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { areNoteDraftsEqual } from "../src/lib/note-draft-safety.ts";

const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const notesPageSource = readFileSync(new URL("../src/components/task-app/notes-page.tsx", import.meta.url), "utf8");
const notesRouteSource = readFileSync(new URL("../src/components/task-app/notes-page-route.tsx", import.meta.url), "utf8");
const noteEditorSource = readFileSync(new URL("../src/components/task-app/note-editor.tsx", import.meta.url), "utf8");

test("Note draft equality includes title, body, tags, and linked Task IDs", () => {
  const saved = { body: "Saved text", linked_task_ids: ["task-1"], tags: ["idea"], title: "Saved title" };
  assert.equal(areNoteDraftsEqual(saved, saved), true);
  assert.equal(areNoteDraftsEqual(saved, { ...saved, body: "Edited text" }), false);
  assert.equal(areNoteDraftsEqual(saved, { ...saved, tags: ["idea", "next"] }), false);
  assert.equal(areNoteDraftsEqual(saved, { ...saved, linked_task_ids: ["task-2"] }), false);
  assert.equal(areNoteDraftsEqual(saved, { ...saved, title: "Changed title" }), false);
});

test("TaskApp owns one lazy Notes collection and one authenticated session authority", () => {
  assert.equal((taskAppSource.match(/\.from\("adhdice_notes"\)/g) ?? []).length, 1);
  assert.match(taskAppSource, /!supabase[\s\S]*activePage !== "Notes"[\s\S]*!currentUserId[\s\S]*notesLoadedOwnerRef\.current === currentUserId[\s\S]*notesLoadingOwnerRef\.current === currentUserId/);
  assert.match(taskAppSource, /createEditingSessionStore<NotesEditingSessionDraft>\(currentUserId \?\? "signed-out", areNotesEditingSessionDraftsEqual\)/);
  assert.match(taskAppSource, /notesSessionStore=\{masterWorkspace\.isEnabled \? notesDraftSessionStore : null\}/);
  assert.match(taskAppSource, /notesView=\{masterWorkspace\.isEnabled \? masterWorkspace\.activeNotesView : undefined\}/);
  assert.match(taskAppSource, /onNotesChange=\{updateNotesCollection\}/);
  assert.match(notesRouteSource, /<NotesPageComponent[\s\S]*?\{\.\.\.props\}/);
  assert.doesNotMatch(notesPageSource, /\.from\("adhdice_notes"\)\s*\.select\("\*"\)\s*\.eq\("user_id", currentUser\.id\)\s*\.order\("updated_at"/);
});

test("same Note edits use the shared snapshot while tab navigation retains selection only", () => {
  assert.match(notesPageSource, /notesSessionStore\.ensureSession\(draftId, note\.id, \{ kind: "note", note \}\)/);
  assert.match(notesPageSource, /notesSessionStore\.attachView\(draftId, viewId\)/);
  assert.match(noteEditorSource, /sessionStore\.subscribeToSession\(sessionDraftId, listener\)/);
  assert.match(noteEditorSource, /sessionStore\.updateDraft\(sessionDraftId/);
  assert.match(notesPageSource, /updateView\(\(current\) => \(\{ \.\.\.current, selection: \{ kind: "saved", noteId: note\.id \} \}\)\)/);
  assert.match(notesPageSource, /selection: \{ kind: "new", draftId: id \}/);
  assert.match(taskAppSource, /protectUnsavedEditingSessions/);
  assert.match(taskAppSource, /notesDraftSessionStore\.hasUnsavedDrafts\(\)/);
});

test("save, discard, and delete reconcile the Note session and preserve failed content", () => {
  assert.match(notesPageSource, /notesSessionStore\.beginSave\(selectedDraftId\)/);
  assert.match(notesPageSource, /notesSessionStore\.saveSucceeded\(selectedDraftId, saveRevision, \{ kind: "note", note: savedNote \}\)/);
  assert.match(notesPageSource, /notesSessionStore\.saveFailed\(selectedDraftId, saveRevision/);
  assert.match(notesPageSource, /notesSessionStore\.discardDraft\(selectedDraftId\)/);
  assert.match(notesPageSource, /notesSessionStore\.removeAfterSave\(selectedDraftId, saveRevision\)/);
  assert.match(notesPageSource, /\.eq\("id", draft\.id\)\s*\.eq\("user_id", currentUser\.id\)/);
  assert.match(notesPageSource, /\.insert\(\{\s*id: draft\.id/);
  assert.match(notesPageSource, /reconcilePersistedNote\(draft\.id, draft\)/);
  assert.match(notesPageSource, /if \(error\) \{[\s\S]*\.select\("id"\)[\s\S]*\.eq\("user_id", currentUser\.id\)[\s\S]*\.eq\("id", id\)/);
});

test("Quick Capture survives tab/page remounts with a separate idempotent session identity", () => {
  assert.match(notesPageSource, /const captureDraftId = `quick-capture:\$\{viewId\}`/);
  assert.match(notesPageSource, /kind: "quick-capture",\s*text: "",\s*pendingNoteId: null/);
  assert.match(notesPageSource, /notesSessionStore\.beginSave\(captureDraftId\)/);
  assert.match(notesPageSource, /notesSessionStore\.saveFailed\(captureDraftId, saveRevision/);
  assert.match(notesPageSource, /notesSessionStore\.saveSucceeded\(captureDraftId, saveRevision, \{ kind: "quick-capture", text: "", pendingNoteId: null \}\)/);
  assert.match(notesPageSource, /const pendingNoteId = createNoteRecordId\(\)/);
  assert.match(notesPageSource, /async function reconcileQuickCapture[\s\S]*\.update\(\{ title: expected\.title/);
  assert.match(notesPageSource, /reconcileQuickCapture\(pendingNoteId, expectedNote\)/);
  assert.match(notesPageSource, /onChange=\{\(event\) => updateView\(\(current\) => \(\{ \.\.\.current, search: event\.target\.value \}\)\)\}/);
  assert.match(notesPageSource, /activeTag: current\.activeTag === tag \? null : tag/);
  assert.match(notesPageSource, />\s*Discard\s*</);
});

test("Master Tabs retain shared Note drafts without a false dirty-navigation warning; legacy guard stays intact", () => {
  assert.match(noteEditorSource, /const isTransitionUnsafe = isSavingNow \|\| Boolean\(tagInput\.trim\(\)\) \|\| \(!hasSharedSession && isDraftDirty\)/);
  assert.match(noteEditorSource, /isDraftUnsafe && !isSavingNow \? "Discard Draft" : "← Back"/);
  assert.match(notesPageSource, /onDraftSafetyChange=\{reportNoteEditorDraftSafety\}/);
  assert.match(notesPageSource, /Boolean\(captureSession\?\.isSaving\)/);
  assert.match(taskAppSource, /return journalDraftSessionStore\.canCloseView\(viewId\) && notesDraftSessionStore\.canCloseView\(viewId\)/);
  assert.match(taskAppSource, /notesDraftSessionStore\.detachView\(viewId\)/);
});

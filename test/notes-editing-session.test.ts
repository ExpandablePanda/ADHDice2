import assert from "node:assert/strict";
import test from "node:test";
import { createEditingSessionStore } from "../src/lib/editing-session-store.ts";
import { areNotesEditingSessionDraftsEqual, createNoteRecordId, type NotesEditingSessionDraft } from "../src/lib/note-draft-safety.ts";
import type { Note } from "../src/lib/database.types.ts";

function note(id: string, title = "Saved") : Note {
  return {
    id,
    user_id: "user-1",
    title,
    body: "Original body",
    tags: ["idea"],
    linked_task_ids: ["task-1"],
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

function createStore() {
  return createEditingSessionStore<NotesEditingSessionDraft>("user-1", areNotesEditingSessionDraftsEqual);
}

test("two Master Tabs resolve one saved Note to a bidirectional shared draft", () => {
  const store = createStore();
  const saved = note("note-1");
  const first = store.ensureSession("note:note-1", "note-1", { kind: "note", note: saved });
  const second = store.ensureSession("note:note-1", "note-1", { kind: "note", note: saved });
  store.attachView(first.draftId, "tab-a");
  store.attachView(second.draftId, "tab-b");

  store.updateDraft("note:note-1", (current) => current.kind === "note"
    ? { ...current, note: { ...current.note, title: "Shared title", body: "Shared body", tags: ["idea", "next"], linked_task_ids: ["task-1", "task-2"] } }
    : current);

  const fromFirst = store.getSnapshot("note:note-1");
  const fromSecond = store.getSnapshot("note:note-1");
  assert.equal(fromFirst?.canonicalRecordId, "note-1");
  assert.equal(fromFirst?.dirty, true);
  assert.equal(fromFirst?.draft.kind, "note");
  assert.deepEqual(fromFirst?.draft.kind === "note" ? fromFirst.draft.note : null, {
    ...saved,
    title: "Shared title",
    body: "Shared body",
    tags: ["idea", "next"],
    linked_task_ids: ["task-1", "task-2"],
  });
  assert.equal(fromSecond?.draft, fromFirst?.draft);
  assert.deepEqual(fromFirst?.viewIds, ["tab-a", "tab-b"]);
});

test("different saved Notes and new Notes keep distinct draft identities", () => {
  const store = createStore();
  const savedSession = store.ensureSession("note:saved", "saved", { kind: "note", note: note("saved") });
  const otherSavedSession = store.ensureSession("note:other", "other", { kind: "note", note: note("other", "Other") });
  const newNoteIdA = createNoteRecordId();
  const newNoteIdB = createNoteRecordId();
  const newSessionA = store.ensureSession(`note:${newNoteIdA}`, newNoteIdA, { kind: "note", note: note(newNoteIdA, "") });
  const newSessionB = store.ensureSession(`note:${newNoteIdB}`, newNoteIdB, { kind: "note", note: note(newNoteIdB, "") });

  assert.notEqual(savedSession.draftId, otherSavedSession.draftId);
  assert.notEqual(newSessionA.draftId, newSessionB.draftId);
  store.updateDraft(savedSession.draftId, (current) => current.kind === "note"
    ? { ...current, note: { ...current.note, title: "Only this Note" } }
    : current);
  assert.equal(store.getSnapshot(otherSavedSession.draftId)?.dirty, false);
  assert.equal(store.getSnapshot(newSessionA.draftId)?.dirty, false);
  assert.equal(store.getSnapshot(newSessionB.draftId)?.dirty, false);
});

test("save, discard, and failed save preserve the right Note baseline", () => {
  const store = createStore();
  store.ensureSession("note:note-1", "note-1", { kind: "note", note: note("note-1") });
  store.updateDraft("note:note-1", (current) => current.kind === "note"
    ? { ...current, note: { ...current.note, body: "Edited" } }
    : current);
  const revision = store.beginSave("note:note-1");
  assert.equal(store.saveFailed("note:note-1", revision!, "offline"), true);
  assert.equal(store.getSnapshot("note:note-1")?.dirty, true);
  assert.equal(store.getSnapshot("note:note-1")?.saveError, "offline");
  assert.equal(store.discardDraft("note:note-1"), true);
  assert.equal(store.getSnapshot("note:note-1")?.dirty, false);
  assert.equal(store.getSnapshot("note:note-1")?.draft.kind === "note" && store.getSnapshot("note:note-1")?.draft.note.body, "Original body");

  store.updateDraft("note:note-1", (current) => current.kind === "note"
    ? { ...current, note: { ...current.note, title: "Saved title" } }
    : current);
  const successfulRevision = store.beginSave("note:note-1");
  assert.equal(store.saveSucceeded("note:note-1", successfulRevision!, { kind: "note", note: note("note-1", "Saved title") }), true);
  assert.equal(store.getSnapshot("note:note-1")?.dirty, false);
  assert.equal(store.getSnapshot("note:note-1")?.baseline.kind === "note" && store.getSnapshot("note:note-1")?.baseline.note.title, "Saved title");
});

test("closing one dirty view preserves a peer, while closing the last dirty view is blocked", () => {
  const store = createStore();
  store.ensureSession("note:note-1", "note-1", { kind: "note", note: note("note-1") });
  store.attachView("note:note-1", "tab-a");
  store.attachView("note:note-1", "tab-b");
  store.updateDraft("note:note-1", (current) => current.kind === "note"
    ? { ...current, note: { ...current.note, body: "In progress" } }
    : current);

  assert.equal(store.canCloseView("tab-a"), true);
  store.detachView("tab-a");
  assert.equal(store.getSnapshot("note:note-1")?.draft.kind === "note" && store.getSnapshot("note:note-1")?.draft.note.body, "In progress");
  assert.equal(store.canCloseView("tab-b"), false);
  store.discardDraft("note:note-1");
  assert.equal(store.canCloseView("tab-b"), true);
});

test("Quick Capture uses per-tab identities separate from saved Note identities", () => {
  const store = createStore();
  const noteSession = store.ensureSession("note:note-1", "note-1", { kind: "note", note: note("note-1") });
  const captureA = store.ensureSession("quick-capture:tab-a", "quick-capture:tab-a", {
    kind: "quick-capture", text: "", pendingNoteId: null,
  });
  const captureB = store.ensureSession("quick-capture:tab-b", "quick-capture:tab-b", {
    kind: "quick-capture", text: "", pendingNoteId: null,
  });
  store.attachView(captureA.draftId, "tab-a");
  store.updateDraft(captureA.draftId, (current) => current.kind === "quick-capture" ? { ...current, text: "Keep this" } : current);
  store.updateDraft(captureA.draftId, (current) => current.kind === "quick-capture" ? { ...current, text: "Keep this " } : current);

  assert.notEqual(captureA.canonicalRecordId, noteSession.canonicalRecordId);
  assert.notEqual(captureA.draftId, captureB.draftId);
  assert.equal(store.getSnapshot(captureB.draftId)?.dirty, false);
  assert.equal(store.getSnapshot(captureA.draftId)?.draft.kind === "quick-capture" && store.getSnapshot(captureA.draftId)?.draft.text, "Keep this ");
  const revision = store.beginSave(captureA.draftId);
  assert.equal(store.saveFailed(captureA.draftId, revision!, "offline"), true);
  assert.equal(store.getSnapshot(captureA.draftId)?.draft.kind === "quick-capture" && store.getSnapshot(captureA.draftId)?.draft.text, "Keep this ");
});

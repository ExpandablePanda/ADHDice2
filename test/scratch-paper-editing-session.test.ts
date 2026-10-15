import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createEditingSessionStore } from "../src/lib/editing-session-store.ts";
import { serializeScratchEditor, setScratchPaperDraftField } from "../src/lib/scratch-paper-editor.ts";
import { parseScratchTaskTokenSegments } from "../src/lib/scratch-paper-task-links.ts";
import {
  areScratchPaperDraftsEqual,
  createScratchPaperRecordId,
  scratchPaperSessionId,
  type ScratchPaperDraftValues,
} from "../src/lib/scratch-paper-draft.ts";
import {
  persistScratchPaperNoteInStages,
  replaceScratchPaperTaskLinksSafely,
  saveScratchPaperEditingSession,
  type ScratchPaperNoteCore,
} from "../src/lib/scratch-paper-save.ts";

const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const scratchPaperSource = readFileSync(new URL("../src/components/task-app/scratch-paper.tsx", import.meta.url), "utf8");
const notesPageSource = readFileSync(new URL("../src/components/task-app/notes-page.tsx", import.meta.url), "utf8");
const scratchHookSource = readFileSync(new URL("../src/hooks/useScratchNotes.ts", import.meta.url), "utf8");

const emptyDraft = (): ScratchPaperDraftValues => ({ body: "", linkedTaskIds: [], title: "" });

function createStore() {
  return createEditingSessionStore<ScratchPaperDraftValues>("user-1", areScratchPaperDraftsEqual);
}

function core(noteId: string, draft: ScratchPaperDraftValues): ScratchPaperNoteCore {
  return {
    body: draft.body.trim(),
    id: noteId,
    title: draft.title.trim() || null,
    user_id: "user-1",
  };
}

function textNode(textContent: string) {
  return { childNodes: [], nodeType: 3, textContent } as unknown as Node;
}

function elementNode(tagName: string, childNodes: Node[] = [], taskToken?: string) {
  return {
    childNodes,
    dataset: taskToken ? { taskToken } : {},
    nodeType: 1,
    tagName,
    textContent: null,
  } as unknown as Node;
}

test("saved Notes, Note cards, current editor, and HUD resolve one canonical Scratch Paper session", () => {
  const store = createStore();
  const saved = { body: "Saved", linkedTaskIds: ["task-1"], title: "Note" };
  const draftId = scratchPaperSessionId("note-1");
  store.ensureSession(draftId, "note-1", saved);
  store.attachView(draftId, "tab-a");
  store.ensureSession(draftId, "note-1", saved);
  store.attachView(draftId, "tab-b");

  store.updateDraft(draftId, (current) => ({
    ...current,
    body: "Shared edit",
    linkedTaskIds: ["task-1", "task-2"],
    title: "Shared title",
  }));

  const shared = store.getSnapshot(draftId);
  assert.equal(shared?.canonicalRecordId, "note-1");
  assert.equal(shared?.dirty, true);
  assert.deepEqual(shared?.draft, {
    body: "Shared edit",
    linkedTaskIds: ["task-1", "task-2"],
    title: "Shared title",
  });
  assert.deepEqual(shared?.viewIds, ["tab-a", "tab-b"]);
});

test("different saved records and per-tab new records keep independent drafts", () => {
  const store = createStore();
  const saved = store.ensureSession(scratchPaperSessionId("note-a"), "note-a", emptyDraft());
  const otherSaved = store.ensureSession(scratchPaperSessionId("note-b"), "note-b", emptyDraft());
  const newIdA = createScratchPaperRecordId();
  const newIdB = createScratchPaperRecordId();
  const newA = store.ensureSession(scratchPaperSessionId(newIdA), newIdA, emptyDraft());
  const newB = store.ensureSession(scratchPaperSessionId(newIdB), newIdB, emptyDraft());

  store.updateDraft(saved.draftId, (current) => ({ ...current, body: "only A" }));
  store.updateDraft(newA.draftId, (current) => ({ ...current, title: "tab A draft" }));

  assert.notEqual(newIdA, newIdB);
  assert.equal(store.getSnapshot(otherSaved.draftId)?.dirty, false);
  assert.equal(store.getSnapshot(newB.draftId)?.dirty, false);
  assert.equal(store.getSnapshot(newA.draftId)?.draft.title, "tab A draft");
});

test("unsubscribe and remount retain a dirty session without rebasing it over refreshed records", () => {
  const store = createStore();
  const draftId = scratchPaperSessionId("note-1");
  store.ensureSession(draftId, "note-1", { body: "Saved", linkedTaskIds: ["task-1"], title: "" });
  store.attachView(draftId, "tab-a");
  store.updateDraft(draftId, (current) => ({ ...current, body: "Keep after navigation" }));
  const unsubscribe = store.subscribeToSession(draftId, () => {});
  unsubscribe();

  store.ensureSession(draftId, "note-1", { body: "Remote refresh", linkedTaskIds: [], title: "Remote" });
  const remounted = store.getSnapshot(draftId);
  assert.equal(remounted?.draft.body, "Keep after navigation");
  assert.equal(remounted?.baseline.body, "Saved");
  assert.equal(remounted?.dirty, true);
});

test("save and discard synchronize the shared baseline and preserve Task links", async () => {
  const store = createStore();
  const draftId = scratchPaperSessionId("note-1");
  store.ensureSession(draftId, "note-1", { body: "Saved", linkedTaskIds: ["task-1"], title: "Note" });
  store.attachView(draftId, "tab-a");
  store.attachView(draftId, "tab-b");
  store.updateDraft(draftId, (current) => ({ ...current, body: "Saved with links", linkedTaskIds: ["task-1", "task-2"] }));
  let written: ScratchPaperDraftValues | null = null;

  const saved = await saveScratchPaperEditingSession({
    createNote: async () => null,
    draftId,
    isNew: false,
    noteId: "note-1",
    sessionStore: store,
    updateNote: async (_noteId, draft) => { written = draft; return true; },
  });

  assert.equal(saved, true);
  assert.deepEqual(written?.linkedTaskIds, ["task-1", "task-2"]);
  assert.equal(store.getSnapshot(draftId)?.dirty, false);
  assert.equal(store.getSnapshot(draftId)?.baseline.body, "Saved with links");

  store.updateDraft(draftId, (current) => ({ ...current, title: "discard me" }));
  assert.equal(store.discardDraft(draftId), true);
  assert.deepEqual(store.getSnapshot(draftId)?.draft.linkedTaskIds, ["task-1", "task-2"]);
  assert.equal(store.getSnapshot(draftId)?.draft.title, "Note");
});

test("failed persistence retains the shared draft and allows retry", async () => {
  const store = createStore();
  const draftId = scratchPaperSessionId("note-1");
  store.ensureSession(draftId, "note-1", emptyDraft());
  store.attachView(draftId, "tab-a");
  store.updateDraft(draftId, (current) => ({ ...current, body: "retry me", linkedTaskIds: ["task-7"] }));

  const firstSave = await saveScratchPaperEditingSession({
    createNote: async () => null,
    draftId,
    isNew: false,
    noteId: "note-1",
    sessionStore: store,
    updateNote: async () => false,
  });
  assert.equal(firstSave, false);
  assert.equal(store.getSnapshot(draftId)?.draft.body, "retry me");
  assert.equal(store.getSnapshot(draftId)?.dirty, true);
  assert.match(store.getSnapshot(draftId)?.saveError ?? "", /could not be saved/);

  const retry = await saveScratchPaperEditingSession({
    createNote: async () => null,
    draftId,
    isNew: false,
    noteId: "note-1",
    sessionStore: store,
    updateNote: async () => true,
  });
  assert.equal(retry, true);
  assert.equal(store.getSnapshot(draftId)?.dirty, false);
});

test("new-note contentEditable input becomes a dirty shared draft and saves once with its title and Task links", async () => {
  const store = createStore();
  const newDraftId = createScratchPaperRecordId();
  const secondTabDraftId = createScratchPaperRecordId();
  const draftId = scratchPaperSessionId(newDraftId);
  const secondDraftId = scratchPaperSessionId(secondTabDraftId);
  const initial = emptyDraft();
  store.ensureSession(draftId, newDraftId, initial);
  store.attachView(draftId, "tab-a");
  store.ensureSession(secondDraftId, secondTabDraftId, initial);
  store.attachView(secondDraftId, "tab-b");

  // ScratchInlineEditor renders text inside a span; browser input adds a Text node there.
  const editor = elementNode("DIV", [
    elementNode("SPAN", [textNode("Actual editor body")]),
    elementNode("DIV", [textNode("second line")]),
    elementNode("SPAN", [], "[[task:task-1|Follow up]]"),
  ]);
  const nextBody = serializeScratchEditor(editor);
  assert.equal(nextBody, "Actual editor body\nsecond line[[task:task-1|Follow up]]");

  setScratchPaperDraftField(store, draftId, newDraftId, initial, "tab-a", "body", nextBody);
  setScratchPaperDraftField(store, draftId, newDraftId, initial, "tab-a", "title", "Editor integration");
  const parsedTaskIds = parseScratchTaskTokenSegments(nextBody)
    .flatMap((segment) => segment.kind === "task" ? [segment.taskId] : []);
  setScratchPaperDraftField(store, draftId, newDraftId, initial, "tab-a", "linkedTaskIds", parsedTaskIds);

  const draftBeforeSave = store.getSnapshot(draftId);
  assert.equal(draftBeforeSave?.dirty, true);
  assert.deepEqual(draftBeforeSave?.draft, {
    body: nextBody,
    linkedTaskIds: ["task-1"],
    title: "Editor integration",
  });
  assert.equal(store.getSnapshot(secondDraftId)?.dirty, false);
  assert.deepEqual(store.getSnapshot(secondDraftId)?.draft, initial);

  const persistedNotes = new Map<string, ScratchPaperNoteCore>();
  const persistedLinks = new Map<string, readonly string[]>();
  const createAttempts: string[] = [];
  let failFirstLinkWrite = true;
  const createNote = async (draft: ScratchPaperDraftValues, noteId: string) => {
    createAttempts.push(noteId);
    const result = await persistScratchPaperNoteInStages({
      draft,
      noteId,
      readNote: async () => persistedNotes.get(noteId) ?? null,
      replaceLinks: async () => {
        if (failFirstLinkWrite) {
          failFirstLinkWrite = false;
          throw new Error("link insert failed");
        }
        persistedLinks.set(noteId, [...draft.linkedTaskIds]);
      },
      userId: "user-1",
      writeNote: async () => {
        if (persistedNotes.has(noteId)) throw new Error("duplicate Note ID");
        const persisted = core(noteId, draft);
        persistedNotes.set(noteId, persisted);
        return persisted;
      },
    });
    return result.ok ? noteId : null;
  };

  const save = () => saveScratchPaperEditingSession({
    createNote,
    draftId,
    isNew: true,
    noteId: newDraftId,
    sessionStore: store,
    updateNote: async () => false,
  });

  assert.equal(await save(), false);
  assert.equal(store.getSnapshot(draftId)?.dirty, true);
  assert.match(store.getSnapshot(draftId)?.saveError ?? "", /could not be saved/);
  assert.equal(persistedNotes.size, 1);

  assert.equal(await save(), true);
  assert.equal(createAttempts.length, 2);
  assert.deepEqual(createAttempts, [newDraftId, newDraftId]);
  assert.equal(persistedNotes.size, 1);
  assert.deepEqual(persistedNotes.get(newDraftId), core(newDraftId, {
    body: nextBody,
    linkedTaskIds: ["task-1"],
    title: "Editor integration",
  }));
  assert.deepEqual(persistedLinks.get(newDraftId), ["task-1"]);
  assert.equal(store.getSnapshot(draftId)?.dirty, false);

  const reopenedStore = createStore();
  const reopenedId = scratchPaperSessionId(newDraftId);
  const reopened = reopenedStore.ensureSession(reopenedId, newDraftId, {
    body: persistedNotes.get(newDraftId)!.body,
    linkedTaskIds: [...(persistedLinks.get(newDraftId) ?? [])],
    title: persistedNotes.get(newDraftId)!.title ?? "",
  });
  assert.equal(reopened.draft.body, "Actual editor body\nsecond line[[task:task-1|Follow up]]");
  assert.equal(reopened.draft.title, "Editor integration");
  assert.deepEqual(reopened.draft.linkedTaskIds, ["task-1"]);
});

test("last dirty view is protected while duplicate views can close", () => {
  const store = createStore();
  const draftId = scratchPaperSessionId("note-1");
  store.ensureSession(draftId, "note-1", emptyDraft());
  store.attachView(draftId, "tab-a");
  store.attachView(draftId, "tab-b");
  store.updateDraft(draftId, (current) => ({ ...current, body: "keep me" }));

  assert.equal(store.canCloseView("tab-a"), true);
  store.detachView("tab-a");
  assert.equal(store.canCloseView("tab-b"), false);
  assert.equal(store.discardDraft(draftId), true);
  assert.equal(store.canCloseView("tab-b"), true);
});

test("two-stage note and link persistence reports partial failure and retries against the fixed Note ID", async () => {
  const draft = { body: "Saved body", linkedTaskIds: ["task-1", "task-2"], title: "Saved title" };
  const noteId = "note-fixed";
  const persistedCore = core(noteId, draft);
  const firstSave = await persistScratchPaperNoteInStages({
    draft,
    noteId,
    readNote: async () => persistedCore,
    replaceLinks: async () => { throw new Error("link insert failed"); },
    userId: "user-1",
    writeNote: async () => persistedCore,
  });
  assert.deepEqual(firstSave, { corePersisted: true, error: "link insert failed", ok: false });

  const retry = await persistScratchPaperNoteInStages({
    draft,
    noteId,
    readNote: async () => persistedCore,
    replaceLinks: async () => {},
    userId: "user-1",
    writeNote: async () => { throw new Error("duplicate Note ID"); },
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.corePersisted, true);
  assert.equal(persistedCore.id, noteId);
});

test("link replacement keeps old links on failed insert and converges safely on retry", async () => {
  let currentLinks = ["task-old"];
  let failInsert = true;
  let failDelete = false;
  const repository = {
    async listTaskIds() { return [...currentLinks]; },
    async insertTaskIds(_noteId: string, _userId: string, taskIds: readonly string[]) {
      if (failInsert) throw new Error("insert failed");
      currentLinks = [...new Set([...currentLinks, ...taskIds])];
    },
    async deleteTaskIds(_noteId: string, _userId: string, taskIds: readonly string[]) {
      if (failDelete) throw new Error("delete failed");
      currentLinks = currentLinks.filter((taskId) => !taskIds.includes(taskId));
    },
  };

  await assert.rejects(replaceScratchPaperTaskLinksSafely("note-1", "user-1", ["task-old", "task-new"], repository), /insert failed/);
  assert.deepEqual(currentLinks, ["task-old"]);

  failInsert = false;
  await replaceScratchPaperTaskLinksSafely("note-1", "user-1", ["task-old", "task-new"], repository);
  assert.deepEqual(currentLinks, ["task-old", "task-new"]);

  failDelete = true;
  await assert.rejects(replaceScratchPaperTaskLinksSafely("note-1", "user-1", ["task-new"], repository), /delete failed/);
  assert.deepEqual(currentLinks, ["task-old", "task-new"]);
  failDelete = false;
  await replaceScratchPaperTaskLinksSafely("note-1", "user-1", ["task-new"], repository);
  assert.deepEqual(currentLinks, ["task-new"]);
});

test("production routes share the store and keep Scratch Paper drafts outside page navigation guards", () => {
  assert.match(taskAppSource, /scratchPaperDraftSessionStore\.canCloseView\(viewId\)/);
  assert.match(taskAppSource, /scratchPaperDraftSessionStore\.hasUnsavedDrafts\(\)/);
  assert.match(scratchPaperSource, /useSyncExternalStore\(subscribe, getSnapshot, getSnapshot\)/);
  assert.match(scratchPaperSource, /scratchPaperSessionId\(note\.id\)/);
  assert.match(scratchPaperSource, /activeNotes\.find\(\(note\) => note\.id === newDraftId\)/);
  assert.match(scratchPaperSource, /saveScratchPaperEditingSession/);
  assert.match(scratchPaperSource, /onInput=\{\(event\) => \{\s*emitEditorChange\(event\.currentTarget, event\.nativeEvent as InputEvent\);/);
  assert.match(scratchPaperSource, /function emitEditorChange\([\s\S]*?const nextBody = serializeScratchEditor\(editor\)/);
  assert.match(scratchPaperSource, /onChange=\{updateBody\}/);
  assert.match(scratchPaperSource, /setScratchPaperDraftField\(editingSessionStore, sessionDraftId, sessionNoteId, initialDraft, editingViewId, field, next\)/);
  assert.match(scratchPaperSource, /const currentDraft = currentSession\?\.draft \?\? localDraft/);
  assert.match(scratchPaperSource, /const isDirty = currentSession\?\.dirty \?\?/);
  assert.match(scratchPaperSource, /currentSession\?\.saveError[\s\S]*?role="alert"/);
  assert.match(scratchPaperSource, /currentNoteId \|\| isDirty \? <TaskTableChipButton[\s\S]*?>Discard Draft/);
  assert.match(scratchPaperSource, /disabled=\{isSaving \|\| \(!currentNoteId && !body\.trim\(\) && !title\.trim\(\) && linkedTaskIds\.length === 0\)\}/);
  assert.match(notesPageSource, /sharedScratchPaperSessionsEnabled \? undefined : reportDraftSafety/);
  assert.match(scratchHookSource, /persistScratchPaperNoteInStages/);
  assert.match(scratchHookSource, /replaceScratchPaperTaskLinksSafely/);
  assert.match(scratchHookSource, /\.from\("adhdice_scratch_note_task_links"\)/);
});

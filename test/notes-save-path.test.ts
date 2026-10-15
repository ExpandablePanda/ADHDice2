import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Note } from "../src/lib/database.types.ts";
import { createEditingSessionStore } from "../src/lib/editing-session-store.ts";
import { areNotesEditingSessionDraftsEqual, type NotesEditingSessionDraft } from "../src/lib/note-draft-safety.ts";
import { saveSharedNoteSession, type SharedNoteSaveClient } from "../src/lib/notes-save.ts";

const notesPageSource = readFileSync(new URL("../src/components/task-app/notes-page.tsx", import.meta.url), "utf8");

type QueryResult = { data: Note | null; error: { code: string; message: string } | null };
type WriteMode = "normal" | "reject" | "commit-error";
type Query = {
  insert(values: Partial<Note>): Query;
  update(values: Partial<Note>): Query;
  select(columns: string): Query;
  eq(column: string, value: string): Query;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
};

function cloneNote(note: Note): Note {
  return { ...note, tags: [...note.tags], linked_task_ids: [...note.linked_task_ids] };
}

function makeNote(id: string, title: string, updatedAt: string): Note {
  return {
    id,
    user_id: "user-1",
    title,
    body: `${title} body`,
    tags: ["idea"],
    linked_task_ids: ["task-1"],
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: updatedAt,
  };
}

function makeMockClient(initialNotes: Note[], modes: { insert?: WriteMode[]; update?: WriteMode[] } = {}) {
  const records = new Map(initialNotes.map((note) => [note.id, cloneNote(note)]));
  const writeModes = { insert: [...(modes.insert ?? [])], update: [...(modes.update ?? [])] };
  const calls = { insert: 0, update: 0, select: 0 };
  let updatedAtCounter = 10;

  function from(table: string) {
    assert.equal(table, "adhdice_notes");
    let operation: "insert" | "update" | "select" = "select";
    let payload: Partial<Note> = {};
    const filters: Array<[string, string]> = [];
    const query: Query = {
      insert(values) {
        operation = "insert";
        payload = values;
        return query;
      },
      update(values) {
        operation = "update";
        payload = values;
        return query;
      },
      select() {
        return query;
      },
      eq(column, value) {
        filters.push([column, value]);
        return query;
      },
      async single() {
        return execute(true);
      },
      async maybeSingle() {
        return execute(false);
      },
    };

    async function execute(single: boolean): Promise<QueryResult> {
      if (operation === "select") calls.select += 1;
      else calls[operation] += 1;
      const matches = [...records.values()].filter((record) => filters.every(([column, value]) => record[column as keyof Note] === value));
      const mode = operation === "select" ? "normal" : writeModes[operation].shift() ?? "normal";

      if (operation === "insert") {
        const id = payload.id;
        if (typeof id !== "string") return { data: null, error: { code: "23502", message: "id is required" } };
        if (records.has(id)) return { data: null, error: { code: "23505", message: "duplicate id" } };
        if (mode !== "reject") {
          const created = {
            ...makeNote(id, payload.title ?? "", `2026-10-${String(updatedAtCounter++).padStart(2, "0")}T00:00:00.000Z`),
            ...payload,
          } as Note;
          records.set(id, cloneNote(created));
          if (mode === "commit-error") return { data: null, error: { code: "NETWORK", message: "response lost after commit" } };
          return { data: cloneNote(created), error: null };
        }
        return { data: null, error: { code: "NETWORK", message: "insert rejected" } };
      }

      const match = matches[0];
      if (!match) return single
        ? { data: null, error: { code: "PGRST116", message: "no rows returned" } }
        : { data: null, error: null };
      if (operation === "select") return { data: cloneNote(match), error: null };
      if (mode === "reject") return { data: null, error: { code: "NETWORK", message: "update rejected" } };

      const updated = {
        ...match,
        ...payload,
        updated_at: `2026-10-${String(updatedAtCounter++).padStart(2, "0")}T00:00:00.000Z`,
      } as Note;
      records.set(updated.id, cloneNote(updated));
      if (mode === "commit-error") return { data: null, error: { code: "NETWORK", message: "response lost after commit" } };
      return { data: cloneNote(updated), error: null };
    }

    return query;
  }

  return {
    client: { from } as unknown as SharedNoteSaveClient,
    records,
    calls,
  };
}

function createStore() {
  return createEditingSessionStore<NotesEditingSessionDraft>("user-1", areNotesEditingSessionDraftsEqual);
}

test("shared save persists Note A, updates the peer session and list, and reopening reads the persisted values", async () => {
  const savedA = makeNote("note-a", "A", "2026-10-02T00:00:00.000Z");
  const savedB = makeNote("note-b", "B", "2026-10-03T00:00:00.000Z");
  const mock = makeMockClient([savedA, savedB]);
  const store = createStore();
  store.ensureSession("note:note-a", "note-a", { kind: "note", note: savedA });
  store.ensureSession("note:note-b", "note-b", { kind: "note", note: savedB });
  store.attachView("note:note-a", "tab-a");
  store.attachView("note:note-a", "tab-b");
  store.updateDraft("note:note-a", (current) => current.kind === "note"
    ? { ...current, note: { ...current.note, title: "A edited", body: "A persisted body", tags: ["idea", "saved"], linked_task_ids: ["task-2"] } }
    : current);
  let notes = [savedB, savedA];
  let collectionCheckPrepared = false;

  const result = await saveSharedNoteSession({
    client: mock.client,
    userId: "user-1",
    sessionStore: store,
    draftId: "note:note-a",
    isNew: false,
    onNotesChange: (update) => { notes = update(notes); },
    onCollectionUpdate: () => { collectionCheckPrepared = true; },
  });

  assert.equal(result.ok, true);
  assert.equal(mock.calls.update, 1);
  assert.equal(mock.calls.insert, 0);
  const persistedA = mock.records.get("note-a")!;
  assert.equal(persistedA.title, "A edited");
  assert.equal(persistedA.body, "A persisted body");
  assert.deepEqual(persistedA.tags, ["idea", "saved"]);
  assert.deepEqual(persistedA.linked_task_ids, ["task-2"]);
  assert.equal(persistedA.created_at, savedA.created_at);
  assert.deepEqual(mock.records.get("note-b"), savedB);

  const peerSession = store.getSnapshot("note:note-a");
  assert.equal(peerSession?.dirty, false);
  assert.equal(peerSession?.draft.kind === "note" && peerSession.draft.note.body, "A persisted body");
  assert.deepEqual(peerSession?.viewIds, ["tab-a", "tab-b"]);
  assert.equal(store.getSnapshot("note:note-b")?.dirty, false);
  assert.equal(collectionCheckPrepared, true);
  assert.deepEqual(notes.map((note) => note.id), ["note-a", "note-b"]);
  assert.equal(notes[0].body, "A persisted body");

  const reopened = store.ensureSession("note:note-a", "note-a", { kind: "note", note: persistedA });
  assert.equal(reopened.dirty, false);
  assert.equal(reopened.draft.kind === "note" && reopened.draft.note.title, "A edited");
  assert.equal(reopened.draft.kind === "note" && reopened.draft.note.body, "A persisted body");
});

test("rejected Supabase update leaves the shared dirty draft and Notes collection unchanged", async () => {
  const saved = makeNote("note-a", "A", "2026-10-02T00:00:00.000Z");
  const mock = makeMockClient([saved], { update: ["reject"] });
  const store = createStore();
  store.ensureSession("note:note-a", "note-a", { kind: "note", note: saved });
  store.attachView("note:note-a", "tab-a");
  store.updateDraft("note:note-a", (current) => current.kind === "note"
    ? { ...current, note: { ...current.note, body: "Keep this failed draft" } }
    : current);
  const originalCollection = [saved];
  let notes = [...originalCollection];

  const result = await saveSharedNoteSession({
    client: mock.client,
    userId: "user-1",
    sessionStore: store,
    draftId: "note:note-a",
    isNew: false,
    onNotesChange: (update) => { notes = update(notes); },
  });

  assert.equal(result.ok, false);
  assert.equal(mock.records.get("note-a")?.body, saved.body);
  assert.equal(store.getSnapshot("note:note-a")?.dirty, true);
  assert.equal(store.getSnapshot("note:note-a")?.isSaving, false);
  assert.equal(store.getSnapshot("note:note-a")?.saveError, "update rejected");
  assert.equal(store.getSnapshot("note:note-a")?.draft.kind === "note" && store.getSnapshot("note:note-a")?.draft.note.body, "Keep this failed draft");
  assert.deepEqual(notes, originalCollection);
  assert.equal(mock.calls.insert, 0);
});

test("failed new Note insert retries with the same identity and cannot create a duplicate", async () => {
  const mock = makeMockClient([], { insert: ["reject", "normal"] });
  const store = createStore();
  const draft: Note = { ...makeNote("draft-a", "New", ""), body: "New body" };
  store.ensureSession("note:draft-a", "draft-a", { kind: "note", note: draft });
  store.attachView("note:draft-a", "tab-a");
  store.updateDraft("note:draft-a", (current) => current.kind === "note"
    ? { ...current, note: { ...current.note, title: "Retry me", body: "Keep same ID" } }
    : current);
  let notes: Note[] = [];
  const save = () => saveSharedNoteSession({
    client: mock.client,
    userId: "user-1",
    sessionStore: store,
    draftId: "note:draft-a",
    isNew: true,
    onNotesChange: (update) => { notes = update(notes); },
  });

  const first = await save();
  assert.equal(first.ok, false);
  assert.equal(store.getSnapshot("note:draft-a")?.dirty, true);
  assert.equal(store.getSnapshot("note:draft-a")?.draft.kind === "note" && store.getSnapshot("note:draft-a")?.draft.note.id, "draft-a");
  const retry = await save();

  assert.equal(retry.ok, true);
  assert.equal(mock.calls.insert, 2);
  assert.equal(mock.records.size, 1);
  assert.equal(mock.records.get("draft-a")?.body, "Keep same ID");
  assert.deepEqual(notes.map((note) => note.id), ["draft-a"]);
});

test("ambiguous successful insert reconciles the persisted row instead of requiring a duplicate retry", async () => {
  const mock = makeMockClient([], { insert: ["commit-error"] });
  const store = createStore();
  const draft = makeNote("draft-a", "New", "");
  store.ensureSession("note:draft-a", "draft-a", { kind: "note", note: draft });
  store.attachView("note:draft-a", "tab-a");
  store.updateDraft("note:draft-a", (current) => current.kind === "note"
    ? { ...current, note: { ...current.note, title: "Committed once" } }
    : current);
  let notes: Note[] = [];

  const result = await saveSharedNoteSession({
    client: mock.client,
    userId: "user-1",
    sessionStore: store,
    draftId: "note:draft-a",
    isNew: true,
    onNotesChange: (update) => { notes = update(notes); },
  });

  assert.equal(result.ok, true);
  assert.equal(mock.calls.insert, 1);
  assert.equal(mock.records.size, 1);
  assert.equal(notes.length, 1);
  assert.equal(store.getSnapshot("note:draft-a")?.dirty, false);
});

test("the rendered Notes editor uses the shared production save pathway", () => {
  assert.match(notesPageSource, /saveSharedNoteSession\(\{/);
  assert.match(notesPageSource, /onSave=\{sharedSessionsEnabled \? \(\) => saveSharedNote\(\) : saveLegacyNote\}/);
  assert.match(notesPageSource, /onNotesChange,/);
});

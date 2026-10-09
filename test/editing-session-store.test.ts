import assert from "node:assert/strict";
import test from "node:test";
import { createEditingSessionStore } from "../src/lib/editing-session-store.ts";

type Draft = { text: string; details: { tags: string[] } };

function createStore(ownerId = "user-1") {
  return createEditingSessionStore<Draft>(ownerId, (left, right) => (
    left.text === right.text && left.details.tags.join("\u0000") === right.details.tags.join("\u0000")
  ));
}

const emptyDraft = (): Draft => ({ text: "", details: { tags: [] } });

test("views of one saved record share one stable session and observe the same immutable draft", () => {
  const store = createStore();
  const first = store.ensureSession("journal-entry:entry-1", "entry-1", emptyDraft());
  const second = store.ensureSession("journal-entry:entry-1", "entry-1", emptyDraft());
  assert.equal(first, second);
  store.attachView(first.draftId, "tab-a");
  store.attachView(second.draftId, "tab-b");

  let firstNotifications = 0;
  let secondNotifications = 0;
  const unsubscribeFirst = store.subscribeToSession(first.draftId, () => { firstNotifications += 1; });
  const unsubscribeSecond = store.subscribeToSession(second.draftId, () => { secondNotifications += 1; });
  store.updateDraft(first.draftId, (current) => ({ ...current, text: "shared edit" }));

  assert.equal(store.getSnapshot("journal-entry:entry-1")?.draft.text, "shared edit");
  assert.equal(store.getSnapshot("journal-entry:entry-1")?.dirty, true);
  assert.equal(firstNotifications, 1);
  assert.equal(secondNotifications, 1);
  assert.throws(() => store.ensureSession("duplicate-session", "entry-1", emptyDraft()), /only own one editing session identity/);
  assert.throws(() => { (store.getSnapshot(first.draftId)!.draft.details.tags as string[]).push("mutate"); }, TypeError);
  unsubscribeFirst();
  unsubscribeSecond();
});

test("independent unsaved records receive distinct identities and survive view unmount/remount", () => {
  const store = createStore();
  const first = store.ensureSession("new:tab-a:one", "unsaved:tab-a:one", emptyDraft());
  const second = store.ensureSession("new:tab-b:one", "unsaved:tab-b:one", emptyDraft());
  store.attachView(first.draftId, "tab-a");
  store.updateDraft(first.draftId, (current) => ({ ...current, text: "retained" }));
  assert.notEqual(first.draftId, second.draftId);

  const beforeUnmount = store.getSnapshot(first.draftId);
  const unsubscribe = store.subscribeToSession(first.draftId, () => {});
  unsubscribe();
  assert.equal(store.getSnapshot(first.draftId), beforeUnmount);
  store.attachView(first.draftId, "tab-a");
  assert.equal(store.getSnapshot(first.draftId)?.draft.text, "retained");
});

test("a clean incoming baseline reconciles, but a dirty draft is never overwritten by refresh", () => {
  const store = createStore();
  store.ensureSession("journal-entry:entry-1", "entry-1", emptyDraft());
  assert.equal(store.rebaseIfClean("journal-entry:entry-1", { text: "remote update", details: { tags: [] } }), true);
  store.updateDraft("journal-entry:entry-1", (current) => ({ ...current, text: "local edit" }));
  assert.equal(store.rebaseIfClean("journal-entry:entry-1", { text: "new remote update", details: { tags: [] } }), false);
  assert.equal(store.getSnapshot("journal-entry:entry-1")?.draft.text, "local edit");
  assert.equal(store.getSnapshot("journal-entry:entry-1")?.baseline.text, "remote update");
});

test("dirty comparison and explicit discard restore the correct baseline", () => {
  const store = createStore();
  store.ensureSession("journal-entry:entry-1", "entry-1", { text: "saved", details: { tags: ["baseline"] } });
  store.updateDraft("journal-entry:entry-1", (current) => ({ ...current, text: "edited" }));
  assert.equal(store.getSnapshot("journal-entry:entry-1")?.dirty, true);
  assert.equal(store.discardDraft("journal-entry:entry-1"), true);
  assert.deepEqual(store.getSnapshot("journal-entry:entry-1")?.draft, { text: "saved", details: { tags: ["baseline"] } });
  assert.equal(store.getSnapshot("journal-entry:entry-1")?.dirty, false);
});

test("pending saves block edits and close of the last dirty view; failures retain content", () => {
  const store = createStore();
  store.ensureSession("journal-entry:entry-1", "entry-1", emptyDraft());
  store.attachView("journal-entry:entry-1", "tab-a");
  store.updateDraft("journal-entry:entry-1", (current) => ({ ...current, text: "keep me" }));
  assert.equal(store.canCloseView("tab-a"), false);
  const saveRevision = store.beginSave("journal-entry:entry-1");
  assert.equal(typeof saveRevision, "number");
  assert.equal(store.updateDraft("journal-entry:entry-1", (current) => ({ ...current, text: "lost edit" })), false);
  assert.equal(store.saveFailed("journal-entry:entry-1", saveRevision!, "offline"), true);
  assert.equal(store.getSnapshot("journal-entry:entry-1")?.draft.text, "keep me");
  assert.equal(store.getSnapshot("journal-entry:entry-1")?.saveError, "offline");
  assert.equal(store.hasUnsavedDrafts(), true);
});

test("save success reconciles draft and baseline and protects sibling views when one closes", () => {
  const store = createStore();
  store.ensureSession("journal-entry:entry-1", "entry-1", emptyDraft());
  store.attachView("journal-entry:entry-1", "tab-a");
  store.attachView("journal-entry:entry-1", "tab-b");
  store.updateDraft("journal-entry:entry-1", (current) => ({ ...current, text: "saved" }));
  const saveRevision = store.beginSave("journal-entry:entry-1");
  assert.equal(store.canCloseView("tab-a"), true);
  store.detachView("tab-a");
  assert.deepEqual(store.getSnapshot("journal-entry:entry-1")?.viewIds, ["tab-b"]);
  assert.equal(store.getSnapshot("journal-entry:entry-1")?.draft.text, "saved");
  assert.equal(store.getSnapshot("journal-entry:entry-1")?.dirty, true);
  assert.equal(store.saveSucceeded("journal-entry:entry-1", saveRevision!, { text: "saved", details: { tags: [] } }), true);
  assert.equal(store.getSnapshot("journal-entry:entry-1")?.dirty, false);
  assert.equal(store.getSnapshot("journal-entry:entry-1")?.baseline.text, "saved");
  assert.equal(store.canCloseView("tab-b"), true);
  assert.equal(store.hasUnsavedDrafts(), false);
});

test("account-scoped stores cannot share or reopen one another's sessions", () => {
  const firstAccount = createStore("user-1");
  const secondAccount = createStore("user-2");
  firstAccount.ensureSession("journal-entry:entry-1", "entry-1", emptyDraft());
  firstAccount.updateDraft("journal-entry:entry-1", (current) => ({ ...current, text: "private" }));
  secondAccount.ensureSession("journal-entry:entry-1", "entry-1", emptyDraft());
  assert.equal(secondAccount.getSnapshot("journal-entry:entry-1")?.draft.text, "");
  assert.equal(secondAccount.ownerId, "user-2");
});

test("reset clears account-owned sessions and notifies subscribers", () => {
  const store = createStore();
  store.ensureSession("journal-entry:entry-1", "entry-1", emptyDraft());
  let notifications = 0;
  let sessionNotifications = 0;
  store.subscribe(() => { notifications += 1; });
  store.subscribeToSession("journal-entry:entry-1", () => { sessionNotifications += 1; });
  store.reset();
  assert.equal(store.getSnapshot("journal-entry:entry-1"), null);
  assert.equal(notifications, 1);
  assert.equal(sessionNotifications, 1);
});

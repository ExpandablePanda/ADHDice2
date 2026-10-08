import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { areScratchPaperDraftsEqual } from "../src/lib/scratch-paper-draft.ts";

const scratchPaperSource = readFileSync(new URL("../src/components/task-app/scratch-paper.tsx", import.meta.url), "utf8");

test("Scratch Paper compares title, body, and linked Task IDs to the persisted baseline", () => {
  const empty = { body: "", linkedTaskIds: [], title: "" };
  assert.equal(areScratchPaperDraftsEqual(empty, empty), true);
  assert.equal(areScratchPaperDraftsEqual(empty, { ...empty, body: "New thought" }), false);
  assert.equal(areScratchPaperDraftsEqual(empty, { ...empty, body: "New thought", title: "Working" }), false);
  assert.equal(areScratchPaperDraftsEqual(empty, { ...empty, body: "   ", title: "  " }), true);

  const saved = { body: "Saved body", linkedTaskIds: ["task-a", "task-b"], title: "Saved title" };
  assert.equal(areScratchPaperDraftsEqual(saved, saved), true);
  assert.equal(areScratchPaperDraftsEqual(saved, { ...saved, body: "Edited body" }), false);
  assert.equal(areScratchPaperDraftsEqual(saved, { ...saved, title: "Edited title" }), false);
  assert.equal(areScratchPaperDraftsEqual(saved, { ...saved, linkedTaskIds: ["task-a"] }), false);
  assert.equal(areScratchPaperDraftsEqual(saved, { ...saved, linkedTaskIds: ["task-b", "task-a"] }), true);
  assert.equal(areScratchPaperDraftsEqual(saved, { ...saved, body: "Edited body" }), false);
  assert.equal(areScratchPaperDraftsEqual(saved, { ...saved, body: "Saved body" }), true);
});

test("current and card Scratch Paper editors report independent comparison and save states", () => {
  assert.match(scratchPaperSource, /const isDirty = !areScratchPaperDraftsEqual\(currentDraft, draftBaseline\)/);
  assert.match(scratchPaperSource, /onDraftSafetyChange\?\.\("scratch-current", isSaving \|\| isDirty\)/);
  assert.match(scratchPaperSource, /const isDirty = !areScratchPaperDraftsEqual\(cardDraft, draftBaseline\)/);
  assert.match(scratchPaperSource, /onDraftSafetyChange\?\.\(`scratch-card:\$\{note\.id\}`, isDraftUnsafe\)/);
  assert.match(scratchPaperSource, /unsafeCardIds\.has\(note\.id\)/);
  assert.match(scratchPaperSource, /if \(saved\) \{\s*setDraftBaseline\(cardDraft\);\s*setIsEditing\(false\);/);
});

test("Discard Draft restores saved Scratch Paper content and task links without persistence", () => {
  const discardStart = scratchPaperSource.indexOf("function discardDraft()", scratchPaperSource.indexOf("function ScratchNoteCard"));
  const discardEnd = scratchPaperSource.indexOf("if (isEditing)", discardStart);
  const discardSource = scratchPaperSource.slice(discardStart, discardEnd);
  assert.match(discardSource, /setTitle\(draftBaseline\.title\)/);
  assert.match(discardSource, /setBody\(draftBaseline\.body\)/);
  assert.match(discardSource, /setLinkedTaskIds\(\[\.\.\.draftBaseline\.linkedTaskIds\]\)/);
  assert.doesNotMatch(discardSource, /onUpdate|onCreate|\.from\(/);
  assert.match(scratchPaperSource, /Discard Draft/);
});

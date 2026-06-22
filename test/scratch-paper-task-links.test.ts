import test from "node:test";
import assert from "node:assert/strict";

import { createTask } from "../src/lib/task-buckets.ts";
import {
  buildScratchTaskLinkToken,
  extractScratchSlashCommand,
  extractScratchSlashCommandFromAnchor,
  filterScratchLinkableTasks,
  parseScratchTaskTokenSegments,
  removeScratchLinkQuery,
  removeScratchTaskToken,
  replaceScratchRangeWithTaskToken,
  stripScratchTaskTokens,
} from "../src/lib/scratch-paper-task-links.ts";

test("scratch paper slash parsing tracks the trailing query only", () => {
  assert.deepEqual(extractScratchSlashCommand("Call /Laundry"), {
    query: "Laundry",
    range: {
      end: 13,
      start: 5,
    },
  });
  assert.equal(extractScratchSlashCommand("https://example.com"), null);
  assert.deepEqual(extractScratchSlashCommand("Line one\n/Today"), {
    query: "Today",
    range: {
      end: 15,
      start: 9,
    },
  });
  assert.deepEqual(extractScratchSlashCommand("Call /Lam tomorrow", 9), {
    query: "Lam",
    range: {
      end: 9,
      start: 5,
    },
  });
});

test("scratch paper slash parsing opens immediately after an inline task chip", () => {
  const task = createTask({ id: "task-1", status: "pending", title: "Test CB" });
  const body = `Test ${buildScratchTaskLinkToken(task)}/Next`;

  assert.deepEqual(extractScratchSlashCommand(body), {
    query: "Next",
    range: {
      end: body.length,
      start: body.length - 5,
    },
  });
});

test("scratch paper anchored slash queries survive contenteditable caret markers and update live", () => {
  const body = `Before\uFEFF/Lam`;
  const slashStart = body.indexOf("/");

  assert.deepEqual(extractScratchSlashCommandFromAnchor(body, slashStart), {
    query: "Lam",
    range: { end: body.length, start: slashStart },
  });
  assert.deepEqual(extractScratchSlashCommandFromAnchor(body.slice(0, -1), slashStart), {
    query: "La",
    range: { end: body.length - 1, start: slashStart },
  });
  assert.equal(extractScratchSlashCommandFromAnchor(body.replace("/", ""), slashStart), null);
});

test("scratch paper task tokens replace slash queries and render back into segments", () => {
  const task = createTask({
    id: "task-1",
    status: "pending",
    title: "Laundry",
  });

  const body = replaceScratchRangeWithTaskToken("Call /Laundry soon", { end: 13, start: 5 }, task);
  const token = buildScratchTaskLinkToken(task);

  assert.equal(body, `Call ${token} soon`);
  assert.deepEqual(parseScratchTaskTokenSegments(body), [
    { kind: "text", text: "Call " },
    { fallbackTitle: "Laundry", kind: "task", taskId: "task-1" },
    { kind: "text", text: " soon" },
  ]);
  assert.equal(removeScratchTaskToken(body, "task-1"), "Call soon");
  assert.equal(stripScratchTaskTokens(body), "Call soon");
  assert.equal(removeScratchLinkQuery("Call /Laundry soon", { end: 13, start: 5 }), "Call soon");
});

test("scratch paper token parsing preserves linked task placement through an edit", () => {
  const task = createTask({ id: "task-1", status: "missed", title: "Lamprey Systems" });
  const original = `Review ${buildScratchTaskLinkToken(task)} tomorrow`;
  const edited = `${original}.`;

  assert.deepEqual(parseScratchTaskTokenSegments(edited), [
    { kind: "text", text: "Review " },
    { fallbackTitle: "Lamprey Systems", kind: "task", taskId: "task-1" },
    { kind: "text", text: " tomorrow." },
  ]);
  assert.equal(replaceScratchRangeWithTaskToken("Review /Lamp tomorrow", { end: 12, start: 7 }, task), original);
});

test("scratch paper task filtering keeps only current title matches", () => {
  const tasks = [
    createTask({ id: "task-1", status: "pending", title: "Laundry" }),
    createTask({ id: "task-2", status: "in_progress", title: "Landing page" }),
    createTask({ id: "task-3", status: "complete", title: "Completed task" }),
    createTask({ id: "task-4", status: "trashed", title: "Trash me" }),
  ];

  assert.deepEqual(
    filterScratchLinkableTasks(tasks, "la", []).map((task) => task.id),
    ["task-1", "task-2"],
  );
  assert.deepEqual(
    filterScratchLinkableTasks(tasks, "lau", ["task-1"]).map((task) => task.id),
    [],
  );
});

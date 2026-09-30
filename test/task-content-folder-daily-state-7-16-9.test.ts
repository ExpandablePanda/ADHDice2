import assert from "node:assert/strict";
import { test } from "node:test";

import type { TaskHistory } from "../src/lib/database.types.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import {
  buildTaskContentFolderMemberSummary,
  type TaskContentFolderMemberFact,
} from "../src/lib/task-content-folders.ts";
import { isTaskCompletedForHistory, isTaskFinishedOnDate } from "../src/lib/task-history.ts";
import { buildTaskTableRow } from "../src/lib/task-table-row.ts";
import type { TaskDisplayStatus } from "../src/lib/task-display-status.ts";

const today = "2026-09-29";
const yesterday = "2026-09-28";
const folders = [
  { id: "parent", user_id: "user-1", name: "Parent", icon_key: "folder", parent_folder_id: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
  { id: "child", user_id: "user-1", name: "Child", icon_key: "folder", parent_folder_id: "parent", created_at: "2026-01-02", updated_at: "2026-01-02" },
];

function historyRow(
  taskId: string,
  status: TaskHistory["status"],
  entryDate = today,
  id = `${taskId}-${entryDate}-${status}`,
  updatedAt = `${entryDate}T12:00:00.000Z`,
): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: updatedAt,
    entry_date: entryDate,
    event_type: status === "complete" ? "completed_permanently" : "status",
    id,
    occurrence_due_on: entryDate,
    occurrence_key: `occurrence:${entryDate}`,
    status,
    task_id: taskId,
    updated_at: updatedAt,
    user_id: "user-1",
    was_completed: isTaskCompletedForHistory(status),
  };
}

function rowFor(taskId: string, displayStatus: TaskDisplayStatus, taskHistory: TaskHistory[]) {
  return buildTaskTableRow(createTask({
    id: taskId,
    status: "pending",
    task_content_folder_id: "parent",
    title: taskId,
  }), {
    focusedTaskIdSet: new Set(),
    linkedNotes: [],
    listDefinitions: [],
    listMemberships: [],
    subtasks: [],
    taskHistory,
    todayDateKey: today,
    displayStatus,
  });
}

function memberFact(
  row: ReturnType<typeof rowFor>,
  folderId = "parent",
): TaskContentFolderMemberFact {
  return {
    id: row.id,
    parent_task_id: row.parent_task_id,
    task_content_folder_id: folderId,
    displayStatus: row.status,
    finishedToday: row.finishedToday,
    isPinned: false,
    isRoutine: false,
    hasAttention: false,
  };
}

test("successful Done, Did My Best, and Complete History outcomes finish the logical date", () => {
  assert.equal(isTaskFinishedOnDate([historyRow("done", "done")], today), true);
  assert.equal(isTaskFinishedOnDate([historyRow("best", "did_my_best")], today), true);
  assert.equal(isTaskFinishedOnDate([historyRow("complete", "complete")], today), true);
});

test("rolled-forward recurring Tasks remain finished today", () => {
  const taskA = rowFor("recurring-a", "upcoming", [historyRow("recurring-a", "done")]);
  const taskB = rowFor("recurring-b", "not_due", [historyRow("recurring-b", "did_my_best")]);

  assert.equal(taskA.finishedToday, true);
  assert.equal(taskB.finishedToday, true);
  assert.equal(buildTaskContentFolderMemberSummary([memberFact(taskA), memberFact(taskB)], "parent", folders).dailyState, "finished");
});

test("a genuinely pending member keeps a rolled-forward successful member open", () => {
  const finished = rowFor("finished", "upcoming", [historyRow("finished", "done")]);
  const open = rowFor("open", "pending", []);
  assert.equal(buildTaskContentFolderMemberSummary([memberFact(finished), memberFact(open)], "parent", folders).dailyState, "open");
});

test("successful History from yesterday does not finish today", () => {
  const row = rowFor("yesterday", "upcoming", [historyRow("yesterday", "done", yesterday)]);
  assert.equal(row.finishedToday, false);
  assert.equal(buildTaskContentFolderMemberSummary([memberFact(row)], "parent", folders).dailyState, "open");
});

test("Missed without a successful outcome remains open", () => {
  const row = rowFor("missed", "missed", [historyRow("missed", "missed")]);
  assert.equal(row.finishedToday, false);
  assert.equal(buildTaskContentFolderMemberSummary([memberFact(row)], "parent", folders).dailyState, "open");
});

test("the freshest same-date History outcome wins over an older success", () => {
  const staleSuccess = historyRow("stale", "done", today, "older-success", `${today}T10:00:00.000Z`);
  const currentNonSuccess = historyRow("stale", "missed", today, "newer-missed", `${today}T11:00:00.000Z`);
  assert.equal(isTaskFinishedOnDate([staleSuccess, currentNonSuccess], today), false);
  const row = rowFor("stale", "missed", [staleSuccess, currentNonSuccess]);
  assert.equal(buildTaskContentFolderMemberSummary([memberFact(row)], "parent", folders).dailyState, "open");
});

test("nested descendant History contributes to both child and ancestor Folder state", () => {
  const descendant = rowFor("descendant", "not_due", [historyRow("descendant", "did_my_best")]);
  const finishedChild = buildTaskContentFolderMemberSummary([memberFact(descendant, "child")], "child", folders);
  const finishedAncestor = buildTaskContentFolderMemberSummary([memberFact(descendant, "child")], "parent", folders);
  assert.equal(finishedChild.dailyState, "finished");
  assert.equal(finishedAncestor.dailyState, "finished");

  const openDescendant = rowFor("open-descendant", "pending", []);
  assert.equal(buildTaskContentFolderMemberSummary([memberFact(openDescendant, "child")], "parent", folders).dailyState, "open");
});

test("archived or trashed members remain neutral even when they have finishedToday facts", () => {
  const archived = { ...memberFact(rowFor("archived", "archived", [])), displayStatus: "archived" as const, finishedToday: true };
  const trashed = { ...memberFact(rowFor("trashed", "trashed", [])), displayStatus: "trashed" as const, finishedToday: true };
  assert.equal(buildTaskContentFolderMemberSummary([archived, trashed], "parent", folders).dailyState, "neutral");
});

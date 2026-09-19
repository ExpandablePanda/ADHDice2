import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildTaskContentFolderAssignmentPatch,
  buildTaskContentFolderPresentation,
  countVisibleTaskContentFolderMembers,
  normalizeTaskContentFolderRow,
  validateTaskContentFolderMembership,
} from "../src/lib/task-content-folders.ts";

const folders = [
  { id: "folder-a", user_id: "user-1", name: "Website Redesign", created_at: "2026-01-01", updated_at: "2026-01-01" },
  { id: "folder-b", user_id: "user-1", name: "Music", created_at: "2026-01-02", updated_at: "2026-01-02" },
];

const task = (id: string, folderId: string | null = null, parentTaskId: string | null = null) => ({
  id,
  parent_task_id: parentTaskId,
  task_content_folder_id: folderId,
});

test("Task Content Folder rows normalize independently from List Folders", () => {
  const folder = normalizeTaskContentFolderRow({ ...folders[0], name: "  Website Redesign  " });
  assert.equal(folder?.name, "Website Redesign");
  assert.equal(normalizeTaskContentFolderRow({ id: "list-folder", name: "List Folder" }), null);
});

test("Folder membership is one direct Folder per top-level Task", () => {
  const folderIds = new Set(folders.map((folder) => folder.id));
  assert.equal(validateTaskContentFolderMembership(task("task-a", "folder-a"), folderIds), null);
  assert.match(validateTaskContentFolderMembership(task("step-a", "folder-a", "task-parent"), folderIds) ?? "", /cannot also be/);
  assert.match(validateTaskContentFolderMembership(task("task-a", "missing"), folderIds) ?? "", /unavailable/);
});

test("Step to Folder assignment detaches once and preserves the Task ID", () => {
  const source = task("same-id", null, "fake-parent");
  assert.deepEqual(buildTaskContentFolderAssignmentPatch(source, "folder-a"), {
    parent_task_id: null,
    task_content_folder_id: "folder-a",
  });
  assert.equal(source.id, "same-id");
});

test("Folder Task to parent clears membership atomically and unlink remains ungrouped", () => {
  assert.deepEqual({ parent_task_id: "parent-id", ...buildTaskContentFolderAssignmentPatch(task("task-a", "folder-a"), null) }, {
    parent_task_id: "parent-id",
    task_content_folder_id: null,
  });
  assert.deepEqual({ parent_task_id: null, task_content_folder_id: null }, { parent_task_id: null, task_content_folder_id: null });
});

test("Folder presentation groups only already-visible sorted Tasks", () => {
  const visible = [task("standalone-first"), task("folder-second", "folder-a"), task("folder-third", "folder-a"), task("other-folder", "folder-b"), task("standalone-last")];
  const presentation = buildTaskContentFolderPresentation(visible, folders);
  assert.deepEqual(presentation.map((block) => block.kind === "folder" ? block.folder.id : block.task.id), ["standalone-first", "folder-a", "folder-b", "standalone-last"]);
  assert.deepEqual(presentation.find((block) => block.kind === "folder" && block.folder.id === "folder-a")?.members.map((member) => member.id), ["folder-second", "folder-third"]);
  assert.equal(countVisibleTaskContentFolderMembers(visible, "folder-a"), 2);
  assert.equal(countVisibleTaskContentFolderMembers(visible.filter((item) => item.id !== "folder-third"), "folder-a"), 1);
});

test("A hidden Folder member is not pulled into a filtered result and collapse does not alter counts", () => {
  const filtered = [task("visible-member", "folder-a")];
  const presentation = buildTaskContentFolderPresentation(filtered, folders);
  const block = presentation.find((item) => item.kind === "folder");
  assert.deepEqual(block?.kind === "folder" ? block.members.map((member) => member.id) : [], ["visible-member"]);
  assert.equal(countVisibleTaskContentFolderMembers(filtered, "folder-a"), 1);
  const collapsedIds = new Set(["folder-a"]);
  assert.equal(countVisibleTaskContentFolderMembers(filtered, "folder-a"), 1);
  assert.deepEqual([...collapsedIds], ["folder-a"]);
});

test("Table and List use the shared Folder projection and the Folder stays outside Task State", () => {
  const table = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
  const list = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
  const domain = readFileSync(new URL("../src/lib/task-content-folders.ts", import.meta.url), "utf8");
  const taskType = readFileSync(new URL("../src/lib/task-type.ts", import.meta.url), "utf8");
  assert.match(table, /buildTaskContentFolderPresentation/);
  assert.match(list, /buildTaskContentFolderPresentation/);
  assert.doesNotMatch(domain, /task-state-engine/);
  assert.doesNotMatch(taskType, /folder/);
});

test("The additive SQL protects ownership, delete behavior, hierarchy, and RLS", () => {
  const sql = readFileSync(new URL("../supabase/add_task_content_folders_7_14_18.sql", import.meta.url), "utf8");
  assert.match(sql, /foreign key \(user_id, task_content_folder_id\)/i);
  assert.match(sql, /on delete set null \(task_content_folder_id\)/i);
  assert.match(sql, /check \(parent_task_id is null or task_content_folder_id is null\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select to authenticated/i);
  assert.match(sql, /for insert to authenticated/i);
  assert.match(sql, /for update to authenticated/i);
  assert.match(sql, /for delete to authenticated/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildTaskContentFolderMemberSummary,
  buildTaskContentFolderPresentation,
  flattenTaskContentFolderPresentation,
  getTaskContentFolderDescendantIds,
  getTaskContentFolderMenuOptions,
  getTaskContentFolderMoveOptions,
  getTaskContentFolderParentForTask,
  normalizeTaskContentFolderRow,
  validateTaskContentFolderParent,
} from "../src/lib/task-content-folders.ts";

const folders = [
  { id: "work", user_id: "user-1", name: "Work", icon_key: "folder", parent_folder_id: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
  { id: "website", user_id: "user-1", name: "Website", icon_key: "folder", parent_folder_id: "work", created_at: "2026-01-02", updated_at: "2026-01-02" },
  { id: "client", user_id: "user-1", name: "Client A", icon_key: "folder", parent_folder_id: "website", created_at: "2026-01-03", updated_at: "2026-01-03" },
  { id: "music", user_id: "user-1", name: "Music", icon_key: "music", parent_folder_id: "work", created_at: "2026-01-04", updated_at: "2026-01-04" },
  { id: "personal", user_id: "user-1", name: "Personal", icon_key: "folder", parent_folder_id: null, created_at: "2026-01-05", updated_at: "2026-01-05" },
];

const task = (id: string, folderId: string | null = null) => ({
  id,
  parent_task_id: null,
  task_content_folder_id: folderId,
});

test("normalization defaults existing flat rows to a root Folder", () => {
  assert.equal(normalizeTaskContentFolderRow({
    id: "root",
    user_id: "user-1",
    name: "Root",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  })?.parent_folder_id, null);
});

test("recursive presentation keeps parent placement, direct order, and contiguous descendants", () => {
  const presentation = buildTaskContentFolderPresentation([
    task("a"),
    task("b", "website"),
    task("d", "client"),
    task("c", "work"),
    task("e"),
  ], folders, { includeEmptyFolders: true });

  assert.deepEqual(presentation.map((node) => node.kind === "task" ? node.task.id : node.folder.id), ["a", "work", "e", "personal"]);
  const work = presentation.find((node) => node.kind === "folder" && node.folder.id === "work");
  assert.equal(work?.kind, "folder");
  if (work?.kind !== "folder") return;
  assert.deepEqual(work.children.map((node) => node.kind === "task" ? node.task.id : node.folder.id), ["website", "c", "music"]);
  const website = work.children.find((node) => node.kind === "folder" && node.folder.id === "website");
  assert.equal(website?.kind, "folder");
  if (website?.kind !== "folder") return;
  assert.deepEqual(website.children.map((node) => node.kind === "task" ? node.task.id : node.folder.id), ["b", "client"]);
  assert.deepEqual(flattenTaskContentFolderPresentation(presentation, new Set(["website"])).map((entry) => entry.kind === "task" ? entry.task.id : `${entry.folder.id}:${entry.visibleTaskCount}`), [
    "a",
    "work:3",
    "website:2",
    "c",
    "music:0",
    "e",
    "personal:0",
  ]);
});

test("filtered recursive projection shows ancestors without unrelated siblings", () => {
  const presentation = buildTaskContentFolderPresentation([task("b", "website")], folders, { includeEmptyFolders: false });
  const entries = flattenTaskContentFolderPresentation(presentation);
  assert.deepEqual(entries.map((entry) => entry.kind === "task" ? entry.task.id : entry.folder.id), ["work", "website", "b"]);
  assert.equal(entries.some((entry) => entry.kind === "folder" && entry.folder.id === "music"), false);
  assert.equal(entries.some((entry) => entry.kind === "task" && entry.task.id === "c"), false);
});

test("collapse is independent and parent collapse hides the complete subtree", () => {
  const presentation = buildTaskContentFolderPresentation([task("b", "website"), task("d", "client"), task("c", "work")], folders);
  assert.deepEqual(flattenTaskContentFolderPresentation(presentation, new Set(["website"])).map((entry) => entry.kind === "task" ? entry.task.id : entry.folder.id), ["work", "website", "c"]);
  assert.deepEqual(flattenTaskContentFolderPresentation(presentation, new Set(["work"])).map((entry) => entry.kind === "task" ? entry.task.id : entry.folder.id), ["work"]);
  assert.deepEqual(flattenTaskContentFolderPresentation(presentation, new Set()).map((entry) => entry.kind === "task" ? entry.task.id : entry.folder.id), ["work", "website", "b", "client", "d", "c"]);
});

test("aggregate actions and counts include every descendant Task", () => {
  const summary = buildTaskContentFolderMemberSummary([
    { ...task("b", "website"), isPinned: true, isRoutine: true, hasAttention: false },
    { ...task("d", "client"), isPinned: false, isRoutine: true, hasAttention: true },
    { ...task("c", "work"), isPinned: true, isRoutine: false, hasAttention: false },
  ], "work", folders);
  assert.deepEqual(summary.memberTaskIds, ["b", "d", "c"]);
  assert.deepEqual(summary.pinnedTaskIds, ["b", "c"]);
  assert.deepEqual(summary.routineTaskIds, ["b", "d"]);
  assert.equal(summary.attentionCount, 1);
  assert.deepEqual(getTaskContentFolderDescendantIds(folders, "work"), new Set(["website", "client", "music"]));
});

test("cycle validation and move options exclude self and descendants", () => {
  assert.match(validateTaskContentFolderParent(folders, "work", "work", "user-1") ?? "", /own parent/);
  assert.match(validateTaskContentFolderParent(folders, "work", "client", "user-1") ?? "", /descendant/);
  assert.match(validateTaskContentFolderParent(folders, "work", "personal", "user-2") ?? "", /unavailable/i);
  assert.equal(validateTaskContentFolderParent(folders, "website", null, "user-1"), null);
  assert.deepEqual(getTaskContentFolderMoveOptions(folders, "website", "user-1"), [
    { id: null, label: "No Parent" },
    { id: "personal", label: "Personal" },
    { id: "work", label: "Work" },
    { id: "music", label: "Work / Music" },
  ]);
});

test("Task Folder menus use paths and Create Folder chooses the direct parent", () => {
  assert.deepEqual(getTaskContentFolderMenuOptions(folders, task("b", "website")).map((option) => option.label), [
    "No Folder",
    "Personal",
    "Work",
    "Work / Music",
    "Work / Website",
    "Work / Website / Client A",
  ]);
  assert.equal(getTaskContentFolderParentForTask(task("b", "website")), "website");
  assert.equal(getTaskContentFolderParentForTask(task("unassigned")), null);
});

test("nested migration and schema define owner scope, cycle protection, and transactional promotion", () => {
  const migration = readFileSync(new URL("../supabase/add_nested_task_content_folders_7_14_27.sql", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  for (const source of [migration, schema]) {
    assert.match(source, /parent_folder_id uuid/);
    assert.match(source, /foreign key \(user_id, parent_folder_id\)/i);
    assert.match(source, /on delete set null/i);
    assert.match(source, /pg_advisory_xact_lock/);
    assert.match(source, /parent_folder_id is null or parent_folder_id <> id/i);
    assert.match(source, /with recursive ancestors/i);
    assert.match(source, /adhdice_validate_task_content_folder_parent/);
  }
  assert.match(migration, /adhdice_delete_task_content_folder/);
  assert.match(migration, /update public\.adhdice_clean_tasks[\s\S]*task_content_folder_id = promoted_parent_id/);
  assert.match(migration, /update public\.adhdice_task_content_folders[\s\S]*parent_folder_id = promoted_parent_id/);
  assert.match(migration, /grant execute on function public\.adhdice_delete_task_content_folder\(uuid\) to authenticated/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { TaskListFolder } from "@/lib/database.types";
import {
  buildAllTaskListDirectory,
  buildPersistedTaskListByEntityId,
  buildTaskListFolderBreadcrumbs,
  buildTaskListFolderCounts,
  buildTaskListFolderTree,
  canMoveFolderInto,
  resolveCurrentTaskListFolder,
} from "@/lib/task-list-folders";
import type { TaskListDefinition } from "@/lib/task-lists";
import { todayISO } from "@/lib/utils";

function folder(id: string, name: string, parentId: string | null, sortOrder: number): TaskListFolder {
  return {
    created_at: "2026-07-26T00:00:00Z",
    id,
    name,
    parent_folder_id: parentId,
    revision: 1,
    sort_order: sortOrder,
    updated_at: "2026-07-26T00:00:00Z",
    user_id: "u1",
  };
}

function list(
  id: `list:${string}`,
  name: string,
  folderId: string | null,
  sortOrder: number,
  membershipMode: TaskListDefinition["membershipMode"] = "manual",
): TaskListDefinition {
  return {
    description: name,
    folderId,
    id,
    isDeletable: true,
    isEditable: true,
    isVisible: true,
    membershipMode,
    name,
    revision: 1,
    rules: null,
    sortOrder,
    type: "custom",
  };
}

const folders = [
  folder("fa", "Projects", null, 1),
  folder("fb", "Home", null, 3),
  folder("fc", "Launch", "fa", 0),
];
const lists = [
  list("list:root-a", "Root A", null, 0),
  list("list:project", "Plan", "fa", 1),
  list("list:launch", "Plan", "fc", 2),
  list("list:root-b", "Root B", null, 2),
  list("list:smart", "Smart", null, 4, "rules"),
];

test("root and nested containers contain every direct list subtype and folder in mixed order", () => {
  const tree = buildTaskListFolderTree(folders, lists);
  assert.deepEqual(
    tree.mixedChildrenByFolderId.get(null)?.map((item) => `${item.kind}:${item.id}`),
    ["list:list:root-a", "folder:fa", "list:list:root-b", "folder:fb", "list:list:smart"],
  );
  assert.deepEqual(
    tree.mixedChildrenByFolderId.get("fa")?.map((item) => `${item.kind}:${item.id}`),
    ["folder:fc", "list:list:project"],
  );
  assert.equal(tree.normalListById.has("list:smart"), true);
});

test("persisted root list lookup is keyed by raw UUID for every custom structural list", () => {
  const customRulesList = list("list:smart", "Smart", null, 4, "rules");
  const byEntityId = buildPersistedTaskListByEntityId([...lists, customRulesList]);
  assert.equal(byEntityId.get("root-a")?.id, "list:root-a");
  assert.equal(byEntityId.get("smart"), customRulesList);
  assert.equal(byEntityId.has("list:root-a"), false);
});

test("tied mixed order uses deterministic entity type then ID fallback", () => {
  const tree = buildTaskListFolderTree(
    [folder("folder-b", "B", null, 1), folder("folder-a", "A", null, 1)],
    [list("list:b", "B", null, 1), list("list:a", "A", null, 1)],
  );
  assert.deepEqual(
    tree.mixedChildrenByFolderId.get(null)?.map((item) => item.id),
    ["folder-a", "folder-b", "list:a", "list:b"],
  );
});

test("folder and list paths, breadcrumbs, and case-insensitive directory search use full hierarchy", () => {
  const tree = buildTaskListFolderTree(folders, lists);
  assert.equal(tree.folderPathById.get("fc"), "Projects / Launch");
  assert.equal(tree.listPathById.get("list:launch"), "Projects / Launch / Plan");
  assert.deepEqual(buildTaskListFolderBreadcrumbs(tree, "fc").map((entry) => entry.id), ["fa", "fc"]);
  assert.deepEqual(
    buildAllTaskListDirectory(tree, lists, "projects / launch").map((entry) => entry.id),
    ["fc", "list:launch"],
  );
  assert.deepEqual(
    buildAllTaskListDirectory(tree, lists, "smart").map((entry) => [entry.kind, entry.id]),
    [["list", "list:smart"]],
  );
});

test("orphaned and cyclic folders and their lists fail safely with diagnostics", () => {
  const corruptFolders = [
    folder("orphan", "Orphan", "missing", 0),
    folder("cycle-a", "A", "cycle-b", 1),
    folder("cycle-b", "B", "cycle-a", 2),
  ];
  const tree = buildTaskListFolderTree(corruptFolders, [list("list:orphan", "Lost", "orphan", 0)]);
  assert.equal(tree.folderById.size, 0);
  assert.equal(tree.normalListById.size, 0);
  assert.ok(tree.issues.some((issue) => issue.kind === "orphan_folder"));
  assert.ok(tree.issues.some((issue) => issue.kind === "cycle"));
  assert.ok(tree.issues.some((issue) => issue.kind === "orphan_list"));
});

test("recursive descendants and unique filtered folder counts share one task union", () => {
  const tree = buildTaskListFolderTree(folders, lists);
  const today = todayISO();
  const facts = [
    { id: "t1", listMemberships: [{ id: "list:project" }, { id: "list:launch" }], task: { due_on: today } },
    { id: "t2", listMemberships: [{ id: "list:launch" }], task: { due_on: "2020-01-01" } },
    { id: "t3", listMemberships: [{ id: "list:root-a" }], task: { due_on: "2026-07-26" } },
  ];
  const counts = buildTaskListFolderCounts(tree, facts, new Set(["t1", "t2"])).get("fa");
  assert.deepEqual(counts, {
    containedListCount: 2,
    dueTodayCount: 1,
    overdueCount: 1,
    visibleTaskCount: 2,
  });
  const filteredCounts = buildTaskListFolderCounts(tree, facts, new Set(["t1"])).get("fa");
  assert.equal(filteredCounts?.visibleTaskCount, 1);
  assert.equal(filteredCounts?.overdueCount, 0);
});

test("folder destinations block self and descendants while allowing parent/root", () => {
  const tree = buildTaskListFolderTree(folders, lists);
  assert.equal(canMoveFolderInto(tree, "fa", "fa"), false);
  assert.equal(canMoveFolderInto(tree, "fa", "fc"), false);
  assert.equal(canMoveFolderInto(tree, "fc", "fb"), true);
  assert.equal(canMoveFolderInto(tree, "fc", null), true);
});

test("remote deletion of an open folder resolves to nearest surviving ancestor without list selection state", () => {
  const previous = folders;
  const nextTree = buildTaskListFolderTree(folders.filter((entry) => entry.id !== "fc"), lists);
  assert.equal(resolveCurrentTaskListFolder("fc", previous, nextTree), "fa");
  const rootTree = buildTaskListFolderTree(folders.filter((entry) => entry.id !== "fa" && entry.id !== "fc"), lists);
  assert.equal(resolveCurrentTaskListFolder("fc", previous, rootTree), null);
});

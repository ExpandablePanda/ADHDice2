import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { TaskListFolder, TaskListRailItem } from "@/lib/database.types";
import {
  buildCanonicalTaskListRailTree,
  buildTaskListRailManifest,
  getTaskListRailItemKey,
  seedMissingTaskListRailPlacements,
} from "@/lib/task-list-rail-placement";
import { getTaskListContainerKey, getTaskListContainerRevision } from "@/lib/task-list-folders";
import { getBuiltInTaskLists, type TaskListDefinition } from "@/lib/task-lists";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const railSource = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");

function folder(id: string, parentFolderId: string | null, sortOrder: number): TaskListFolder {
  return {
    created_at: "2026-07-26T00:00:00Z",
    id,
    name: id,
    parent_folder_id: parentFolderId,
    revision: 1,
    sort_order: sortOrder,
    updated_at: "2026-07-26T00:00:00Z",
    user_id: "user",
  };
}

function list(
  id: TaskListDefinition["id"],
  type: TaskListDefinition["type"],
  membershipMode: TaskListDefinition["membershipMode"],
): TaskListDefinition {
  return {
    description: id,
    folderId: null,
    id,
    isDeletable: type === "custom",
    isEditable: true,
    isVisible: true,
    membershipMode,
    name: id,
    revision: 1,
    rules: null,
    sortOrder: 0,
    type,
  };
}

const rootFolder = folder("10000000-0000-4000-8000-000000000001", null, 0);
const nestedFolder = folder("10000000-0000-4000-8000-000000000002", rootFolder.id, 0);
const customLists = [
  list("list:20000000-0000-4000-8000-000000000001", "smart", "rules"),
  list("list:20000000-0000-4000-8000-000000000002", "custom", "hybrid"),
  list("list:20000000-0000-4000-8000-000000000003", "custom", "manual"),
];
const allLists = [...getBuiltInTaskLists(), ...customLists];

test("every visible list definition and folder receives one stable canonical placement identity", () => {
  const manifest = buildTaskListRailManifest(allLists, [rootFolder, nestedFolder]);
  assert.equal(manifest.length, allLists.length + 2);
  assert.equal(new Set(manifest.map((item) => item.item_key)).size, manifest.length);
  for (const definition of getBuiltInTaskLists()) {
    assert.equal(getTaskListRailItemKey(definition), `system:${definition.id}`);
    assert.equal(manifest.find((item) => item.item_key === `system:${definition.id}`)?.entity_id, null);
  }
  assert.ok(manifest.some((item) => item.item_key === `folder:${rootFolder.id}`));
  assert.ok(manifest.some((item) => item.item_key === customLists[0]!.id));
});

test("saved canonical mixed order is the sole root and folder render order", () => {
  const manifest = buildTaskListRailManifest(allLists, [rootFolder, nestedFolder]);
  const saved = seedMissingTaskListRailPlacements("user", manifest, []).map((item) => ({ ...item }));
  const place = (itemKey: string, container: string | null, order: number) => {
    const item = saved.find((candidate) => candidate.item_key === itemKey)!;
    item.container_folder_id = container;
    item.sort_order = order;
  };
  place("system:all", null, 3);
  place(customLists[0]!.id, null, 0);
  place(`folder:${rootFolder.id}`, null, 1);
  place("system:inbox", rootFolder.id, 1);
  place(customLists[1]!.id, rootFolder.id, 0);
  place(`folder:${nestedFolder.id}`, rootFolder.id, 2);
  const tree = buildCanonicalTaskListRailTree(allLists, [rootFolder, nestedFolder], saved);
  assert.deepEqual(
    tree.mixedChildrenByFolderId.get(null)?.slice(0, 3).map((item) => item.itemKey),
    [customLists[0]!.id, `folder:${rootFolder.id}`, "system:today"],
  );
  assert.deepEqual(
    tree.mixedChildrenByFolderId.get(rootFolder.id)?.map((item) => item.itemKey),
    [customLists[1]!.id, "system:inbox", `folder:${nestedFolder.id}`],
  );
});

test("default reconciliation appends missing keys and never overwrites surviving saved placement", () => {
  const existing: TaskListRailItem = {
    container_folder_id: rootFolder.id,
    created_at: "2026-07-26T00:00:00Z",
    entity_id: null,
    item_key: "system:all",
    item_type: "list",
    sort_order: 7,
    updated_at: "2026-07-26T00:00:00Z",
    user_id: "user",
  };
  const first = seedMissingTaskListRailPlacements("user", buildTaskListRailManifest(allLists, [rootFolder]), [existing]);
  const second = seedMissingTaskListRailPlacements("user", buildTaskListRailManifest(allLists, [rootFolder]), first);
  assert.equal(first.find((item) => item.item_key === "system:all"), existing);
  assert.deepEqual(second, first);
});

test("root identity remains UI __root__ and persisted null with one CAS revision", () => {
  const revision = getTaskListContainerRevision([{
    created_at: "2026-07-26T00:00:00Z",
    folder_id: null,
    id: "root-row",
    revision: 12,
    updated_at: "2026-07-26T00:00:00Z",
    user_id: "user",
  }], null);
  assert.equal(getTaskListContainerKey(null), "__root__");
  assert.equal(revision, 12);
});

test("TaskApp renders canonical placement directly without fixed or movable order branches", () => {
  assert.match(appSource, /buildCanonicalTaskListRailTree/);
  assert.match(appSource, /canonicalTaskListRailTree\.mixedChildrenByFolderId\.get\(folderId\)/);
  assert.match(appSource, /primaryRail: buildStructureOptions\(null\)/);
  assert.doesNotMatch(appSource, /fixedOptions|buildMovableRootTaskListItems/);
  assert.match(appSource, /structuralKey: item\.itemKey/);
  assert.match(appSource, /persistedParentValue: item\.placement\.container_folder_id/);
});

test("all canonical items are structural drag targets and synthetic lists need no raw entity ID", () => {
  assert.doesNotMatch(railSource, /FIXED_RAIL_LIST_IDS|fixed-chip/);
  assert.doesNotMatch(railSource, /if \(!metadata\.entityId\)/);
  assert.match(railSource, /data-rail-drag-id=\{reorderable \? list\.structuralKey : undefined\}/);
  assert.match(railSource, /onMoveStructure\(\s*sourceList!\.structuralKey!/);
  assert.match(railSource, /data-rail-append-index=\{list\.destinationAppendIndex\}/);
  assert.doesNotMatch(railSource, /Number\.MAX_SAFE_INTEGER|Infinity/);
});

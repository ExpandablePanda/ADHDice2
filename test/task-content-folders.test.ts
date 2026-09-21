import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildTaskContentFolderMemberSummary,
  buildTaskContentFolderAssignmentPatch,
  buildTaskContentFolderPresentation,
  countVisibleTaskContentFolderMembers,
  getActuallyEmptyTaskContentFolderIds,
  getTaskContentFolderRoutineToggleTaskIds,
  normalizeTaskContentFolderRow,
  shouldIncludeEmptyTaskContentFolders,
  validateTaskContentFolderMembership,
} from "../src/lib/task-content-folders.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { buildTaskTableRow } from "../src/lib/task-table-row.ts";

const folders = [
  { id: "folder-a", user_id: "user-1", name: "Website Redesign", icon_key: "folder", created_at: "2026-01-01", updated_at: "2026-01-01" },
  { id: "folder-b", user_id: "user-1", name: "Music", icon_key: "music", created_at: "2026-01-02", updated_at: "2026-01-02" },
];

const task = (id: string, folderId: string | null = null, parentTaskId: string | null = null) => ({
  id,
  parent_task_id: parentTaskId,
  task_content_folder_id: folderId,
});

function renderTaskIds(
  presentation: Array<
    | { kind: "task"; task: { id: string } }
    | { kind: "folder"; folder: { id: string }; members: Array<{ id: string }> }
  >,
  collapsedFolderIds = new Set<string>(),
) {
  return presentation.flatMap((block) => {
    if (block.kind === "task") return [block.task.id];
    return collapsedFolderIds.has(block.folder.id) ? [] : block.members.map((member) => member.id);
  });
}

test("Task Content Folder rows normalize independently from List Folders", () => {
  const folder = normalizeTaskContentFolderRow({ ...folders[0], name: "  Website Redesign  " });
  assert.equal(folder?.name, "Website Redesign");
  assert.equal(folder?.icon_key, "folder");
  assert.equal(normalizeTaskContentFolderRow({ ...folders[0], icon_key: undefined })?.icon_key, "folder");
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
  const visible = [
    task("standalone-first"),
    task("folder-second", "folder-a"),
    task("standalone-middle"),
    task("folder-fourth", "folder-a"),
    task("other-folder", "folder-b"),
    task("standalone-last"),
  ];
  const presentation = buildTaskContentFolderPresentation(visible, folders);
  assert.deepEqual(presentation.map((block) => block.kind === "folder" ? block.folder.id : block.task.id), ["standalone-first", "folder-a", "standalone-middle", "folder-b", "standalone-last"]);
  assert.deepEqual(presentation.find((block) => block.kind === "folder" && block.folder.id === "folder-a")?.members.map((member) => member.id), ["folder-second", "folder-fourth"]);
  assert.deepEqual(renderTaskIds(presentation), ["standalone-first", "folder-second", "folder-fourth", "standalone-middle", "other-folder", "standalone-last"]);
  assert.deepEqual(renderTaskIds(presentation, new Set(["folder-a"])), ["standalone-first", "standalone-middle", "other-folder", "standalone-last"]);
  assert.equal(countVisibleTaskContentFolderMembers(visible, "folder-a"), 2);
  assert.equal(countVisibleTaskContentFolderMembers(visible.filter((item) => item.id !== "folder-fourth"), "folder-a"), 1);
});

test("Table row projection preserves Folder membership for shared Table grouping", () => {
  const context = {
    focusedTaskIdSet: new Set<string>(),
    linkedNotes: [],
    listDefinitions: [],
    listMemberships: [],
    subtasks: [],
    taskHistory: [],
    todayDateKey: "2026-01-03",
  };
  const projectedRows = [
    buildTaskTableRow(createTask({
      created_at: "2026-01-03T09:00:00.000Z",
      id: "table-folder-member-a",
      status: "pending",
      sort_order: 1,
      task_content_folder_id: "folder-a",
      title: "Folder member A",
    }), context),
    buildTaskTableRow(createTask({
      created_at: "2026-01-03T09:01:00.000Z",
      id: "table-standalone",
      status: "pending",
      sort_order: 2,
      title: "Standalone",
    }), context),
    buildTaskTableRow(createTask({
      created_at: "2026-01-03T09:02:00.000Z",
      id: "table-folder-member-b",
      status: "pending",
      sort_order: 3,
      task_content_folder_id: "folder-a",
      title: "Folder member B",
    }), context),
  ];

  assert.equal(projectedRows[0]?.task_content_folder_id, "folder-a");

  const presentation = buildTaskContentFolderPresentation(projectedRows, folders);
  assert.deepEqual(
    presentation.map((block) => block.kind === "folder"
      ? { kind: block.kind, id: block.folder.id, members: block.members.map((member) => member.id) }
      : { kind: block.kind, id: block.task.id }),
    [
      { kind: "folder", id: "folder-a", members: ["table-folder-member-a", "table-folder-member-b"] },
      { kind: "task", id: "table-standalone" },
    ],
  );
  assert.deepEqual(renderTaskIds(presentation, new Set(["folder-a"])), ["table-standalone"]);
});

test("Folder members keep their own nested hierarchy while block collapse hides every member", () => {
  const member = { ...task("folder-member", "folder-a"), subtasks: [{ id: "member-step" }] };
  const presentation = buildTaskContentFolderPresentation([member, task("standalone", null)], folders);
  const folderBlock = presentation.find((block) => block.kind === "folder");
  assert.equal(folderBlock?.kind, "folder");
  assert.deepEqual(folderBlock?.kind === "folder" ? folderBlock.members[0].subtasks : [], [{ id: "member-step" }]);
  assert.deepEqual(renderTaskIds(presentation, new Set(["folder-a"])), ["standalone"]);
  assert.deepEqual(renderTaskIds(presentation), ["folder-member", "standalone"]);
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

test("normal browsing keeps truly empty Folders visible across buckets while explicit filters may hide them", () => {
  for (const currentListId of ["all", "today", "routine", "list:custom"]) {
    assert.equal(shouldIncludeEmptyTaskContentFolders({ currentListId }), true);
  }
  assert.equal(shouldIncludeEmptyTaskContentFolders({ hasSearchActive: true }), false);
  assert.equal(shouldIncludeEmptyTaskContentFolders({ hasHierarchyFiltersActive: true }), false);
  assert.equal(shouldIncludeEmptyTaskContentFolders({ hasStructuredFiltersActive: true }), false);
});

test("the All list keeps empty Folder structure visible despite stale hierarchy filters", () => {
  assert.equal(shouldIncludeEmptyTaskContentFolders({
    currentListId: "all",
    hasHierarchyFiltersActive: true,
    hasSearchActive: false,
    hasStructuredFiltersActive: true,
  }), true);
  assert.equal(shouldIncludeEmptyTaskContentFolders({
    currentListId: "all",
    hasHierarchyFiltersActive: true,
    hasSearchActive: true,
    hasStructuredFiltersActive: true,
  }), false);
});

test("search-selection result IDs do not falsely gate empty Folder visibility", () => {
  const searchMatchedStepParentTaskIds = ["today-task-a", "today-task-b"];
  const searchMatchedChildTaskIds = ["today-step-a"];
  const persistentEmptyFolderIds = getActuallyEmptyTaskContentFolderIds([], folders);
  assert.ok(searchMatchedStepParentTaskIds.length > 0 && searchMatchedChildTaskIds.length > 0);
  const normalBrowseIncludesEmptyFolders = shouldIncludeEmptyTaskContentFolders({
    hasHierarchyFiltersActive: false,
    hasSearchActive: false,
  });
  const searchIncludesEmptyFolders = shouldIncludeEmptyTaskContentFolders({
    hasHierarchyFiltersActive: false,
    hasSearchActive: true,
  });
  assert.equal(normalBrowseIncludesEmptyFolders, true);
  assert.equal(searchIncludesEmptyFolders, false);
  assert.equal(
    buildTaskContentFolderPresentation([], folders, {
      includeEmptyFolders: normalBrowseIncludesEmptyFolders,
      persistentEmptyFolderIds,
    }).some((block) => block.kind === "folder" && block.folder.id === "folder-b"),
    true,
  );
  assert.equal(
    buildTaskContentFolderPresentation([], folders, {
      includeEmptyFolders: searchIncludesEmptyFolders,
      persistentEmptyFolderIds,
    }).some((block) => block.kind === "folder" && block.folder.id === "folder-b"),
    false,
  );
});

test("active Folder search keeps a directly matched empty Folder without keeping unrelated empties", () => {
  const persistentEmptyFolderIds = getActuallyEmptyTaskContentFolderIds([], folders);
  const presentation = buildTaskContentFolderPresentation([], folders, {
    includeEmptyFolders: shouldIncludeEmptyTaskContentFolders({ currentListId: "all", hasSearchActive: true }),
    matchedFolderIds: new Set(["folder-a"]),
    persistentEmptyFolderIds,
  });

  assert.deepEqual(
    presentation.filter((block) => block.kind === "folder").map((block) => block.folder.id),
    ["folder-a"],
  );
});

test("actual Folder emptiness uses the broad top-level Task universe and ignores Steps", () => {
  assert.deepEqual(
    getActuallyEmptyTaskContentFolderIds([
      task("visible", "folder-a"),
      task("step", "folder-b", "visible"),
    ], folders),
    new Set(["folder-b"]),
  );
  assert.deepEqual(
    getActuallyEmptyTaskContentFolderIds([task("filtered-out", "folder-a")], folders),
    new Set(["folder-b"]),
  );
});

test("Folder member summaries use all direct members and keep Steps out of bulk state", () => {
  const summary = buildTaskContentFolderMemberSummary([
    { id: "visible", task_content_folder_id: "folder-a", isPinned: true, isRoutine: true, hasAttention: false },
    { id: "hidden", task_content_folder_id: "folder-a", isPinned: false, isRoutine: false, hasAttention: true },
    { id: "step", parent_task_id: "visible", task_content_folder_id: null, isPinned: true, isRoutine: true, hasAttention: true },
  ], "folder-a");

  assert.deepEqual(summary.memberTaskIds, ["visible", "hidden"]);
  assert.deepEqual(summary.pinnedTaskIds, ["visible"]);
  assert.deepEqual(summary.routineTaskIds, ["visible"]);
  assert.equal(summary.anyPinned, true);
  assert.equal(summary.allPinned, false);
  assert.equal(summary.anyRoutine, true);
  assert.equal(summary.allRoutine, false);
  assert.equal(summary.attentionCount, 1);
  assert.deepEqual(getTaskContentFolderRoutineToggleTaskIds(summary), ["hidden"]);
});

test("Folder Routine bulk toggling adds missing direct members and removes all when selected", () => {
  assert.deepEqual(getTaskContentFolderRoutineToggleTaskIds({
    allRoutine: false,
    memberTaskIds: ["task-a", "task-b", "task-c"],
    routineTaskIds: ["task-a"],
  }), ["task-b", "task-c"]);
  assert.deepEqual(getTaskContentFolderRoutineToggleTaskIds({
    allRoutine: true,
    memberTaskIds: ["task-a", "task-b"],
    routineTaskIds: ["task-a", "task-b"],
  }), ["task-a", "task-b"]);
  assert.deepEqual(getTaskContentFolderRoutineToggleTaskIds({
    allRoutine: false,
    memberTaskIds: [],
    routineTaskIds: [],
  }), []);
});

test("An empty Folder does not appear fully pinned or fully in Routine", () => {
  const summary = buildTaskContentFolderMemberSummary([], "folder-a");
  assert.equal(summary.allPinned, false);
  assert.equal(summary.allRoutine, false);
  assert.deepEqual(summary.memberTaskIds, []);
});

test("Table and List use the shared Folder projection and the Folder stays outside Task State", () => {
  const table = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
  const list = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
  const domain = readFileSync(new URL("../src/lib/task-content-folders.ts", import.meta.url), "utf8");
  const tableRow = readFileSync(new URL("../src/lib/task-table-row.ts", import.meta.url), "utf8");
  const taskType = readFileSync(new URL("../src/lib/task-type.ts", import.meta.url), "utf8");
  assert.match(table, /buildTaskContentFolderPresentation/);
  assert.match(list, /buildTaskContentFolderPresentation/);
  assert.match(table, /buildTaskContentFolderMemberSummary/);
  assert.match(list, /buildTaskContentFolderMemberSummary/);
  assert.match(table, /onToggleMemberPinned={onTaskPinToggle}/);
  assert.match(list, /onToggleMemberPinned={tableProps\.onTogglePinned}/);
  assert.match(table, /taskContentFolderPresentation\s*\.flatMap\(\(block\) =>/);
  assert.match(list, /taskContentFolderPresentation\s*\.flatMap\(\(block\) =>/);
  assert.match(table, /block\.members\.map\(\(task\) =>/);
  assert.match(list, /block\.members\.map\(\(task\) =>/);
  assert.match(table, /shouldIncludeEmptyTaskContentFolders/);
  assert.match(list, /shouldIncludeEmptyTaskContentFolders/);
  assert.match(table, /getActuallyEmptyTaskContentFolderIds/);
  assert.match(list, /getActuallyEmptyTaskContentFolderIds/);
  assert.match(table, /persistentEmptyFolderIds/);
  assert.match(list, /persistentEmptyFolderIds/);
  assert.match(table, /currentListId,\s*hasHierarchyFiltersActive: statusFilterActive,/);
  assert.match(list, /currentListId: tableProps\.currentListId \?\? selectedBucket,/);
  assert.match(table, /hasSearchActive: searchActive,/);
  assert.match(list, /hasHierarchyFiltersActive: Boolean\(tableProps\.statusFilterActive\)/);
  assert.match(list, /hasSearchActive: Boolean\(tableProps\.searchActive\)/);
  assert.match(tableRow, /task_content_folder_id: task\.task_content_folder_id/);
  assert.match(table, /task: Pick<PrototypeTaskRow, "id" \| "status" \| "title" \| "task_content_folder_id">/);
  assert.match(table, /option\.id === task\.task_content_folder_id/);
  assert.doesNotMatch(table, /taskContentFolderBlockByFirstTaskId/);
  assert.doesNotMatch(list, /taskContentFolderBlockByFirstTaskId/);
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

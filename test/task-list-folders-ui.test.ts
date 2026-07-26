import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../src/hooks/useTaskListFolderActions.ts", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("../src/components/task-app/task-list-folder-manager.tsx", import.meta.url), "utf8");
const primitivesSource = readFileSync(new URL("../src/components/ui/task-table-primitives.tsx", import.meta.url), "utf8");
const railSource = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

test("workspace loading and realtime share the canonical folder repository refresh path", () => {
  assert.match(workspaceSource, /loadTaskListFolders\(client, userId\)/);
  assert.match(workspaceSource, /setTaskListFolders/);
  assert.match(workspaceSource, /setTaskListContainers/);
  assert.match(workspaceSource, /setTaskListRailItems/);
  assert.match(workspaceSource, /table: "adhdice_task_list_folders"/);
  assert.match(workspaceSource, /table: "adhdice_task_list_containers"/);
  assert.match(workspaceSource, /table: "adhdice_task_list_rail_items"/);
});

test("folder settings receives the canonical TaskApp folder state in scope", () => {
  assert.match(appSource, /<TaskListSettingsModal\s+[\s\S]*?folders=\{taskListFolders\}/);
  assert.doesNotMatch(appSource, /async function migrateLocalTaskFocusDays[\s\S]*folders=\{taskListFolders\}/);
});

test("folder navigation is separate from selectedBucket and All Lists uses the existing selector", () => {
  assert.match(appSource, /const \[currentFolderId, setCurrentFolderId\] = useState<string \| null>\(null\)/);
  assert.match(appSource, /if \(entry\.kind === "folder"\) \{\s*setCurrentFolderId\(entry\.id\);\s*return;/);
  assert.match(appSource, /setCurrentFolderId\(entry\.kind === "list" \? entry\.folderId : null\);\s*setSelectedBucket\(entry\.id\)/);
  assert.doesNotMatch(appSource, /setSelectedFolderBucket/);
});

test("folder items stay out of generic bucket selectors and derived Task filtering", () => {
  assert.doesNotMatch(appSource, /const listPanelProps = \{[\s\S]*?lists: listRailOptions,/);
  assert.doesNotMatch(appSource, /<TasksNonListShell[\s\S]*?lists=\{listRailOptions\}/);
  const derivedStateStart = appSource.indexOf("const taskUiStateForDerivedData = useMemo");
  const derivedStateEnd = appSource.indexOf("const bucketContext = useMemo", derivedStateStart);
  assert.equal(derivedStateStart >= 0 && derivedStateEnd > derivedStateStart, true);
  assert.doesNotMatch(appSource.slice(derivedStateStart, derivedStateEnd), /currentFolderId/);
});

test("pointer and touch drops are the sole authoritative placement controls", () => {
  assert.match(railSource, /data-folder-drop-id/);
  assert.match(railSource, /pointerType === "touch"/);
  assert.match(railSource, /onMoveStructure\(\s*sourceList\.structuralKey!,\s*"list",\s*destination\.destinationContainer,\s*destination\.destinationIndex,\s*\{\s*generationId: drag\.generationId/);
  assert.match(managerSource, /Move every List and folder directly in the canonical rail/);
  assert.doesNotMatch(managerSource, /Move Up|Move Down|Move to Parent|Move to Root|Move Into Folder|MAX_SAFE_INTEGER/);
});

test("folder actions call only the structural repository and refresh on conflicts or failures", () => {
  for (const action of [
    "createTaskListFolder",
    "renameTaskListFolder",
    "moveTaskListRailItem",
    "deleteTaskListFolder",
  ]) {
    assert.match(actionsSource, new RegExp(`${action}\\(`));
  }
  assert.doesNotMatch(actionsSource, /client\.from\(/);
  assert.match(actionsSource, /List organization changed on another device\. Refreshed the latest order\./);
  assert.match(actionsSource, /catch \(error\) \{\s*if \(!isCurrentGeneration\(\)\) return false;\s*await refresh\(\)/);
});

test("folder deletion explicitly promises promotion without deleting lists or Tasks", () => {
  assert.match(managerSource, /Child folders and lists will be promoted\. No lists or Tasks will be deleted\./);
  assert.doesNotMatch(actionsSource, /deleteTaskList\(/);
  assert.doesNotMatch(actionsSource, /adhdice_clean_tasks/);
});

test("root lists and folders share one canonical placement rail", () => {
  assert.match(appSource, /const canonicalTaskListRailTree = useMemo/);
  assert.match(appSource, /primaryRail: buildStructureOptions\(null\)/);
  assert.doesNotMatch(appSource, /const fixedOptions|fixed-chip/);
  assert.doesNotMatch(appSource, /folderRail:|normalRail:/);
});

test("one mixed primary rail precedes each open direct-child rail", () => {
  const hierarchyStart = railSource.indexOf("export function TaskListRailHierarchy");
  const hierarchyEnd = railSource.indexOf("export function TaskOperationsHeader", hierarchyStart);
  const hierarchySource = railSource.slice(hierarchyStart, hierarchyEnd);
  const primaryRailIndex = hierarchySource.indexOf("data-primary-list-rail");
  const contentRailIndex = hierarchySource.indexOf("data-folder-content-rail");
  assert.equal(primaryRailIndex >= 0 && primaryRailIndex < contentRailIndex, true);
  assert.doesNotMatch(hierarchySource, /data-folder-rail|data-normal-list-rail/);
  assert.match(hierarchySource, /openFolderRails\.map\(\(rail, index\) =>/);
  assert.match(hierarchySource, /currentFolderId=\{rail\.folderId\}[\s\S]*?lists=\{rail\.lists\}/);
  assert.match(appSource, /mixedChildrenByFolderId\.get\(folderId\)/);
  assert.doesNotMatch(appSource, /descendantListIdsByFolderId\.get\(currentFolderId\)/);
});

test("folder toggle expands, collapses, switches, and closes descendants without bucket selection", () => {
  assert.match(railSource, /if \(list\.structureKind === "folder"\) \{\s*onOpenFolder\?\.\(list\.id\);\s*\} else \{\s*onSelectBucket\(list\.id\)/);
  assert.match(railSource, /onNavigateFolder\?\.\(currentFolderId === folderId \? collapseToFolderId : folderId\)/);
  assert.match(railSource, /onOpenFolder=\{\(folderId\) => toggleFolder\(folderId, null\)\}/);
  assert.match(railSource, /onOpenFolder=\{\(folderId\) => toggleFolder\(folderId, rail\.folderId\)\}/);
  assert.doesNotMatch(railSource, /onOpenFolder\?\.\(list\.id\);\s*onSelectBucket/);
  assert.doesNotMatch(railSource, />Back</);
  assert.doesNotMatch(railSource, />Root</);
});

test("mixed root and folder reorder use stable item keys for every chip", () => {
  assert.match(railSource, /getStructuralMetadataBlockedReason\(list\) === null[\s\S]*?list\.entityType === list\.structureKind/);
  assert.match(railSource, /const targetIndex = siblingMove\?\.destinationIndex \?\? null/);
  assert.match(railSource, /resolveTaskListRailSiblingMove\(\s*drag\.initialOrderIds,\s*drag\.sourceStructuralKey/);
  assert.match(railSource, /onMoveStructure\(\s*sourceList!\.structuralKey!,\s*sourceList!\.entityType!,\s*currentFolderId \?\? null,\s*targetIndex/);
  assert.match(railSource, /currentFolderId=\{null\}/);
  assert.match(railSource, /currentFolderId=\{rail\.folderId\}/);
  assert.match(railSource, /data-rail-container-key=\{reorderable \? listRailContainerKey : undefined\}/);
  assert.match(railSource, /element\.dataset\.railContainerKey === railContainerKey/);
  assert.match(appSource, /containerKey: getTaskListContainerKey\(folderId\)/);
});

test("rendered normal and folder chips own pointer handlers and grab state on the button", () => {
  const renderedChipStart = railSource.indexOf("<button", railSource.indexOf("const accessibleFolderSummary"));
  const renderedChipEnd = railSource.indexOf("</button>", renderedChipStart);
  const renderedChipSource = railSource.slice(renderedChipStart, renderedChipEnd);
  assert.match(renderedChipSource, /className=\{`\$\{TASK_RAIL_CHIP_BUTTON_CLASS\}/);
  assert.match(renderedChipSource, /data-rail-chip-surface/);
  assert.match(renderedChipSource, /data-rail-drag-id=\{reorderable \? list\.structuralKey : undefined\}/);
  assert.match(renderedChipSource, /data-rail-entity-id=\{reorderable \? list\.entityId : undefined\}/);
  assert.match(renderedChipSource, /onPointerDown=\{\(event\) =>/);
  assert.match(renderedChipSource, /onPointerMove=\{handlePointerMove\}/);
  assert.match(renderedChipSource, /onPointerUp=\{\(event\) =>/);
  assert.match(renderedChipSource, /cursor-grab/);
  assert.match(renderedChipSource, /cursor-grabbing/);
  assert.match(renderedChipSource, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(renderedChipSource, /pointer-events-none cursor-inherit/);
  assert.match(renderedChipSource, /type="button"/);
});

test("folder chip renders only its name and numeric contained-list count", () => {
  const renderedChipStart = railSource.indexOf("<button", railSource.indexOf("const accessibleFolderSummary"));
  const renderedChipEnd = railSource.indexOf("</button>", renderedChipStart);
  const renderedChipSource = railSource.slice(renderedChipStart, renderedChipEnd);
  assert.match(railSource, /const folderCountLabel = list\.folderCounts\s*\? String\(list\.folderCounts\.containedListCount\)/);
  assert.match(renderedChipSource, /\{list\.label\}/);
  assert.match(renderedChipSource, /<span className="ml-1 opacity-70">\{folderCountLabel\}<\/span>/);
  assert.doesNotMatch(renderedChipSource, /containedListCount === 1 \? "list" : "lists"/);
  assert.doesNotMatch(renderedChipSource, />\s*\{folderCountLabel\}\s*(?:list|lists)/);
  assert.match(railSource, /aria-label=\{accessibleFolderSummary \? `\$\{list\.label\}\. \$\{accessibleFolderSummary\}`/);
  assert.match(renderedChipSource, /list\.structureKind === "folder" \? null : <span className="ml-1 opacity-70">\{list\.count\}<\/span>/);
  assert.doesNotMatch(railSource, /containedListCount\}L/);
  assert.doesNotMatch(railSource, /visibleTaskCount\}T/);
  assert.doesNotMatch(railSource, /dueTodayCount\}D/);
  assert.doesNotMatch(railSource, /overdueCount\}O/);
});

test("folder, root-list, nested-list, and system chips share the compact rail variant", () => {
  assert.match(railSource, /const TASK_RAIL_CHIP_BUTTON_CLASS = `\$\{TASK_TABLE_CONTROL_FONT_CLASS\} inline-flex shrink-0 items-center appearance-none border-0 bg-transparent p-0 shadow-none`/);
  assert.match(railSource, /<span className=\{`pointer-events-none cursor-inherit \$\{TASK_TABLE_CHIP_BASE_CLASS\} \$\{selected \? SHARED_CHIP_ACTIVE_CLASS : SHARED_CHIP_MUTED_CLASS\}/);
  assert.match(primitivesSource, /TASK_TABLE_CHIP_BASE_CLASS = `inline-flex items-center justify-center rounded-full border px-2 py-1 whitespace-nowrap/);
  assert.match(railSource, /<TaskListRailHierarchy[\s\S]*?lists=\{lists\}/);
  assert.match(railSource, /currentFolderId=\{rail\.folderId\}[\s\S]*?lists=\{rail\.lists\}/);
  assert.match(railSource, /const reorderable = isRailListReorderable\(list\) && Boolean\(onMoveStructure\)/);
  assert.match(railSource, /return Boolean\(list\.structureKind\)[\s\S]*?getStructuralMetadataBlockedReason\(list\) === null/);
});

test("rail hierarchy keeps compact row spacing without Back or breadcrumb UI", () => {
  assert.match(railSource, /className="flex flex-col gap-1" data-list-rail-hierarchy data-rail-spacing="compact"/);
  assert.match(railSource, /className="flex flex-col gap-1" data-task-rail-filter-stack/);
  assert.doesNotMatch(railSource, />Back</);
  assert.doesNotMatch(railSource, />Root</);
  assert.doesNotMatch(railSource, /data-folder-breadcrumb/);
});

test("rail folders have no overflow action chip and management stays in List Settings", () => {
  assert.doesNotMatch(railSource, /folder actions|<Ellipsis|folderMenuId|onOpenFolderMenu/);
  for (const label of ["New folder name", "Rename", "canonical rail", "Delete this folder"]) {
    assert.match(managerSource, new RegExp(label));
  }
});

test("click threshold, click suppression, and folder center drop preserve distinct intents", () => {
  assert.match(railSource, /if \(distance < DESKTOP_DRAG_THRESHOLD_PX\) return;/);
  assert.match(railSource, /if \(relativeX < targetWidth \* 0\.25\) return "before"/);
  assert.match(railSource, /if \(relativeX >= targetWidth \* 0\.75\) return "after"/);
  assert.match(railSource, /return "inside-folder"/);
  assert.match(railSource, /if \(suppressClickRef\.current\)/);
  assert.match(railSource, /onPointerCancel=\{\(event\) => clearDrag\(false, event\.pointerId, "pointercancel"\)\}/);
  assert.match(railSource, /WebkitUserSelect: draggedListId === list\.structuralKey \? "none" : undefined/);
});

test("failed and conflicted structural moves restore or refresh canonical order", () => {
  assert.match(railSource, /if \(!saved\) \{\s*pendingPersistedOrderRef\.current = null;\s*renderedListsRef\.current = latestListsRef\.current/);
  assert.match(actionsSource, /catch \(error\) \{\s*if \(!isCurrentGeneration\(\)\) return false;\s*await refresh\(\)/);
  assert.match(actionsSource, /List organization changed on another device\. Refreshed the latest order\./);
});

test("All Lists opens the selected folder branch and nested list ancestors", () => {
  assert.match(appSource, /if \(entry\.kind === "folder"\) \{\s*setCurrentFolderId\(entry\.id\);\s*return;/);
  assert.match(appSource, /setCurrentFolderId\(entry\.kind === "list" \? entry\.folderId : null\);\s*setSelectedBucket\(entry\.id\)/);
  assert.match(appSource, /openFolderRails: taskListFolderBreadcrumbs\.map\(\(folder\) =>/);
});

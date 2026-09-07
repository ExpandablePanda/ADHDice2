import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type TestElement = {
  props?: Record<string, unknown>;
  type?: unknown;
};

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const railSource = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/components/task-app/tasks-page-orchestrator.tsx", import.meta.url), "utf8");
const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });

function compileModule(source: string, requireModule: (id: string) => unknown) {
  const testModule = { exports: {} as Record<string, unknown> };
  new vm.Script(ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText).runInNewContext({
    exports: testModule.exports,
    module: testModule,
    require: requireModule,
  });
  return testModule.exports;
}

const railExports = compileModule(railSource, (id) => {
  if (id === "react") {
    return {
      memo: (value: unknown) => value,
      startTransition: (callback: () => void) => callback(),
      useCallback: (value: unknown) => value,
      useEffect: () => undefined,
      useRef: (value: unknown) => ({ current: value }),
      useState: (value: unknown) => [typeof value === "function" ? (value as () => unknown)() : value, () => undefined],
    };
  }
  if (id === "react/jsx-runtime") return { Fragment: Symbol("Fragment"), jsx, jsxs: jsx };
  if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
  if (id === "@/components/ui/task-table-primitives") {
    return {
      TASK_TABLE_ACTIVE_LIST_CHIP_CLASS: "active",
      TASK_TABLE_CHIP_BASE_CLASS: "base",
      TASK_TABLE_CONTROL_FONT_CLASS: "font",
      TASK_TABLE_LIST_CHIP_CLASS: "list",
    };
  }
  if (id === "@/components/ui-system") return { AdhdChip: () => null, AdhdDropdownPanel: () => null };
  if (id === "@/lib/task-list-folders") return { getTaskListContainerKey: (folderId: string | null) => folderId ?? "root" };
  if (id === "@/lib/task-list-rail-order") {
    return {
      getTaskListRailIndicatorLeft: () => 0,
      reorderTaskListRailItemsByStructuralKeys: (lists: unknown[]) => lists,
      resolveTaskListRailCrossContainerMove: () => null,
      resolveTaskListRailSiblingMove: () => null,
    };
  }
  if (id === "@/lib/task-search-controller") return { createTaskSearchCommitController: () => ({ dispose() {}, schedule() {} }) };
  if (id.startsWith("@/")) return {};
  throw new Error(`Unexpected rail dependency: ${id}`);
}) as {
  ReorderableTaskChipRail: (props: Record<string, unknown>) => unknown;
  TaskListRailHierarchy: (props: Record<string, unknown>) => unknown;
  TaskOperationsHeader: (props: Record<string, unknown>) => unknown;
};

const taskPageComponent = () => null;
const workspaceExports = compileModule(workspaceSource, (id) => {
  if (id === "react") {
    return {
      memo: (component: (props: Record<string, unknown>) => unknown, compare: (previous: Record<string, unknown>, next: Record<string, unknown>) => boolean) => {
        const memoized = (props: Record<string, unknown>) => component(props);
        Object.assign(memoized, { compare });
        return memoized;
      },
      useEffect: () => undefined,
      useRef: (value: unknown) => ({ current: value }),
      useState: (value: unknown) => [typeof value === "function" ? (value as () => unknown)() : value, () => undefined],
    };
  }
  if (id === "react/jsx-runtime") return { Fragment: Symbol("Fragment"), jsx, jsxs: jsx };
  if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
  if (id === "./task-page") return { TaskPage: taskPageComponent };
  if (id === "./tasks-page") return {
    TaskOperationsHeader: railExports.TaskOperationsHeader,
  };
  if (id === "./tasks-surface-switch") {
    return {
      TASKS_SURFACE_ACTIVE_CHIP_CLASS: "active",
      TASKS_SURFACE_GROUP_CLASS: "group",
      TASKS_SURFACE_INACTIVE_CHIP_CLASS: "inactive",
      TasksSurfaceSwitch: () => null,
    };
  }
  if (id === "@/components/ui/task-table-primitives") return { TaskTableChipButton: () => null, TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS: "title" };
  if (id === "@/components/ui-system") return { AdhdDropdownPanel: () => null };
  if (id.startsWith("@/")) return {};
  throw new Error(`Unexpected workspace dependency: ${id}`);
}) as {
  TasksWorkspace: ((props: Record<string, unknown>) => unknown) & {
    compare?: (previous: Record<string, unknown>, next: Record<string, unknown>) => boolean;
  };
};

function findElements(node: unknown, predicate: (element: TestElement) => boolean): TestElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findElements(child, predicate));
  if (!node || typeof node !== "object") return [];
  const element = node as TestElement;
  const matches = predicate(element) ? [element] : [];
  return [...matches, ...findElements(element.props?.children, predicate)];
}

const rootLists = [
  { id: "list-1", label: "Inbox", structureKind: "list", count: 2 },
  { id: "folder-a", label: "Projects", structureKind: "folder", folderCounts: { containedListCount: 1, visibleTaskCount: 2, dueTodayCount: 1, overdueCount: 0 } },
];
const folderALists = [
  { id: "list-a", label: "Project tasks", structureKind: "list", count: 1 },
  { id: "folder-b", label: "Nested", structureKind: "folder", folderCounts: { containedListCount: 1, visibleTaskCount: 1, dueTodayCount: 0, overdueCount: 0 } },
];
const folderBLists = [{ id: "list-b", label: "Nested tasks", structureKind: "list", count: 1 }];

function workspaceProps(currentFolderId: string | null, folderBreadcrumbIds: string[], openFolderRails: Array<{ folderId: string; lists: unknown[] }>) {
  const operationsHeaderProps = {
    actionLabel: "Focus",
    activeCount: 1,
    allListDirectoryEntries: [],
    appVersion: "7.6.33",
    archiveCount: 0,
    currentFolderBreadcrumbs: folderBreadcrumbIds.map((id) => ({ id, name: id })),
    currentFolderId,
    filterRowsNode: null,
    hideSearch: false,
    isKeyboardShortcutsMenuOpen: false,
    isRailHidden: false,
    isListColumnMenuOpen: false,
    keyboardShortcutsMenuRef: { current: null },
    listColumnLabels: {},
    listColumnMenuRef: { current: null },
    listColumnPickerColumns: [],
    listVisibleColumns: [],
    lists: rootLists,
    metric: { doneTasks: [], label: "1", percent: 50, remainingTasks: [], summary: "1 task" },
    onCycleMomentum: () => undefined,
    onOpenArchive: () => undefined,
    onOpenComposer: () => undefined,
    onOpenFocusPlanner: () => undefined,
    onOpenImport: () => undefined,
    onOpenListSettings: () => undefined,
    onOpenMomentumDetails: () => undefined,
    onOpenTrash: () => undefined,
    onMoveStructure: undefined,
    onNavigateFolder: () => undefined,
    openFolderRails,
    onSelectBucket: (bucket: string) => bucket,
    onSelectDirectoryEntry: () => undefined,
    onToggleRail: () => undefined,
    onExpandAllColumns: () => undefined,
    onShrinkAllColumns: () => undefined,
    onSearchChange: () => undefined,
    onSearchSubmit: () => undefined,
    onViewChange: () => undefined,
    onToggleKeyboardShortcutsMenu: () => undefined,
    onToggleListColumn: () => undefined,
    onToggleListColumnMenu: () => undefined,
    search: "task",
    selectedBucket: "all",
    shortcuts: [],
    trashCount: 0,
    todayCount: 1,
    view: "list",
  };
  return {
    activeTabId: "tab-1",
    alternateViewPanel: null,
    brainstormWorkspacePanel: null,
    completedMilestonesWorkspacePanel: null,
    listViewPanel: null,
    onAddTab: () => undefined,
    onTimeWorkspacePanel: null,
    onCloseTab: () => undefined,
    onReorderTab: () => undefined,
    onRenameTab: () => undefined,
    onSurfaceChange: () => undefined,
    onTabChange: () => undefined,
    operationsHeaderProps,
    pathsWorkspacePanel: null,
    reportWorkspacePanel: null,
    surface: "tasks",
    tableViewPanel: null,
    tabs: [{ id: "tab-1", label: "Tasks" }],
    view: "list",
  };
}

function renderTaskOperationsHeader(props: Record<string, unknown>) {
  const workspace = workspaceExports.TasksWorkspace;
  const page = findElements(workspace(props), (element) => element.type === taskPageComponent)[0];
  assert.ok(page);
  const header = page.props?.operationsHeader as TestElement;
  assert.equal(header.type, railExports.TaskOperationsHeader);
  const headerTree = railExports.TaskOperationsHeader(header.props ?? {});
  const hierarchy = findElements(headerTree, (element) => element.type === railExports.TaskListRailHierarchy)[0];
  assert.ok(hierarchy);
  return railExports.TaskListRailHierarchy(hierarchy.props ?? {});
}

test("TasksWorkspace rerenders folder rails when only folder navigation identity changes", () => {
  assert.match(workspaceSource, /export function TasksWorkspace\(/);
  assert.doesNotMatch(workspaceSource, /renderRevision|memo\(/);
  const rerender = (props: Record<string, unknown>) => renderTaskOperationsHeader(props);
  const folderRailCount = (tree: unknown) => findElements(tree, (element) => Boolean(element.props?.["data-folder-content-rail"])).length;

  assert.equal(folderRailCount(rerender(workspaceProps(null, [], []))), 0);
  assert.equal(folderRailCount(rerender(workspaceProps("folder-a", ["folder-a"], [{ folderId: "folder-a", lists: folderALists }]))), 1);
  assert.equal(folderRailCount(rerender(workspaceProps("folder-b", ["folder-a", "folder-b"], [
    { folderId: "folder-a", lists: folderALists },
    { folderId: "folder-b", lists: folderBLists },
  ]))), 2);
  assert.equal(folderRailCount(rerender(workspaceProps(null, [], []))), 0);

  const hierarchy = renderTaskOperationsHeader(workspaceProps(null, [], []));
  assert.ok(hierarchy);
  const rootRail = findElements(
    hierarchy,
    (element) => element.type === railExports.ReorderableTaskChipRail,
  )[0];
  assert.ok(rootRail);
  const selectedBuckets: string[] = [];
  const rootRailTree = railExports.ReorderableTaskChipRail({
    ...(rootRail.props ?? {}),
    onSelectBucket: (bucket: string) => selectedBuckets.push(bucket),
  });
  const listButton = findElements(rootRailTree, (element) => element.type === "button")[0];
  assert.ok(listButton);
  (listButton.props?.onClick as ((event: { preventDefault: () => void }) => void) | undefined)?.({ preventDefault() {} });
  assert.deepEqual(selectedBuckets, ["list-1"]);
});

test("Tasks modal flows render outside the memoized canvas boundary", () => {
  const flowLayerStart = appSource.indexOf("const taskWorkspaceFlowLayer");
  const tasksBranchStart = appSource.indexOf(') : activePage === "Tasks" ? (');
  const focusBranchStart = appSource.indexOf(') : activePage === "Focus" ?', tasksBranchStart);
  const workspaceStart = appSource.indexOf("<TasksWorkspace", tasksBranchStart);
  const workspaceEnd = appSource.indexOf("\n            />", workspaceStart);
  assert.ok(flowLayerStart >= 0);
  assert.ok(tasksBranchStart > flowLayerStart);
  assert.ok(focusBranchStart > tasksBranchStart);
  assert.ok(workspaceStart > tasksBranchStart);
  assert.ok(workspaceEnd > workspaceStart);

  const flowLayer = appSource.slice(flowLayerStart, tasksBranchStart);
  const tasksBranch = appSource.slice(tasksBranchStart, focusBranchStart);
  const workspaceInvocation = appSource.slice(workspaceStart, workspaceEnd);
  assert.match(tasksBranch, /\{taskWorkspaceFlowLayer\}\s*<TasksWorkspace/);
  assert.doesNotMatch(workspaceInvocation, /\bflows\s*=/);
  for (const flowProp of [
    "batchDeleteFlow",
    "batchEditFlow",
    "focusPlannerFlow",
    "momentumFlow",
    "taskHistoryFlow",
  ]) {
    assert.match(flowLayer, new RegExp(`${flowProp}=`));
  }

  assert.equal("compare" in workspaceExports.TasksWorkspace, false);

  let canvasRenderCount = 0;
  let flowLayerRenderCount = 0;
  const renderRoot = (props: Record<string, unknown>) => {
    flowLayerRenderCount += 1;
    canvasRenderCount += 1;
    renderTaskOperationsHeader(props);
  };
  renderRoot(workspaceProps(null, [], []));
  renderRoot(workspaceProps("folder-a", ["folder-a"], [{ folderId: "folder-a", lists: folderALists }]));
  renderRoot(workspaceProps(null, [], []));
  renderRoot(workspaceProps("folder-b", ["folder-a", "folder-b"], [
    { folderId: "folder-a", lists: folderALists },
    { folderId: "folder-b", lists: folderBLists },
  ]));
  assert.equal(flowLayerRenderCount, 4);
  assert.equal(canvasRenderCount, 4);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const bottomDockSource = readFileSync(new URL("../src/components/task-app/bottom-dock.tsx", import.meta.url), "utf8");
const tabBarSource = readFileSync(new URL("../src/components/task-app/master-workspace-tab-bar.tsx", import.meta.url), "utf8");
const splitPanelSource = readFileSync(new URL("../src/components/task-app/tasks-split-right-panel.tsx", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../src/hooks/useMasterWorkspaceController.ts", import.meta.url), "utf8");
const taskListAdapterSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const taskTableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/task-app/master-workspace-panel.tsx", import.meta.url), "utf8");
const modalShellSource = readFileSync(new URL("../src/components/modal-shell.tsx", import.meta.url), "utf8");
const homePageSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
const recordsTabSource = readFileSync(new URL("../src/components/task-app/records-tab.tsx", import.meta.url), "utf8");

test("Split Right reuses the Tasks workspace with panel-scoped presentation and selection", () => {
  assert.equal((taskAppSource.match(/useWorkspaceData\(/g) ?? []).length, 1);
  assert.equal((taskAppSource.match(/useTaskUiState\(/g) ?? []).length, 1);
  assert.equal((taskAppSource.match(/useTaskListSelection\(/g) ?? []).length, 2);
  assert.match(taskAppSource, /prepareTaskAppDerivedPresentation\(splitRightTasksUiState/);
  assert.match(taskAppSource, /buildTaskSearchPresentationScope\(stableCanonicalTaskIndex, splitRightTasksUiState/);
  assert.match(taskAppSource, /selectTaskSearchPresentation\([\s\S]*?presentation:\s*splitRightTasksUiState/);
  assert.match(taskAppSource, /buildTaskAppViewReadModel\([\s\S]*?searchSelection:\s*splitRightSearchSelection/);
  assert.match(taskAppSource, /cloneElement\(tasksWorkspace,\s*\{[\s\S]*?tableViewPanel:\s*rightTableViewPanel/);
  assert.match(taskAppSource, /<TasksTableAdapter[\s\S]*?tableProps=\{rightTaskTableProps\}/);
  assert.match(taskAppSource, /<TasksListAdapter/);
  assert.match(taskAppSource, /onDraftEditingChange=\{reportLeftWorkspaceDraft\}/);
  assert.match(taskAppSource, /onDraftEditingChange=\{reportLeftTableDraft\}/);
  assert.match(taskAppSource, /onDraftEditingChange=\{reportLeftListDraft\}/);
  assert.match(taskAppSource, /onDraftEditingChange: reportRightWorkspaceDraft/);
  assert.match(taskAppSource, /onDraftEditingChange=\{reportRightTableDraft\}/);
  assert.match(taskAppSource, /onDraftEditingChange: reportRightListDraft/);
  assert.match(taskAppSource, /onOpenBatchDelete: \(\) => openBatchDeleteModal\(splitRightSelectedTaskIds, rightOwner\)/);
  assert.match(taskAppSource, /onOpenBatchEdit: \(\) => openBatchEditModal\(splitRightSelectedTaskIds, rightOwner\)/);
  assert.match(taskAppSource, /collapsedTaskContentFolderIds: splitRightCollapsedTaskContentFolderIds/);
  assert.match(taskAppSource, /collapsedTaskContentFolderIds: Array\.from\(collapsedIds\)/);
  assert.match(taskAppSource, /selectedTasks: batchModalTasks/);
  assert.match(taskAppSource, /deleteTasks\(batchActionTaskIdsOverride\)/);
  assert.match(taskAppSource, /tabs:\s*splitRightTaskWorkspaceTabsState\.tabs/);
  assert.match(taskAppSource, /onOpenTaskEditor:\s*\(taskId: string, navigationTaskIds\?: string\[\]\) => openSharedTaskEditor\(taskId, \{ owner: rightOwner/);
  assert.match(taskAppSource, /function getTaskEditorOpenBlockMessage\([\s\S]*?hasTaskPanelDraftOutsideOwner\(draftOwnerKeys, ownerKey\)[\s\S]*?other Tasks panel/);
  assert.match(taskAppSource, /updateRightPanelTasksUiState\(splitPanels\.right\.id, splitPanels\.rightTab\.id/);
  assert.match(taskAppSource, /masterWorkspace\.isEnabled\s*\?/);
  assert.match(splitPanelSource, /<MasterWorkspacePanel[\s\S]*?side="left"/);
  assert.match(splitPanelSource, /<MasterWorkspacePanel[\s\S]*?side="right"/);
  assert.match(panelSource, /aria-label=\{`\$\{side === "left" \? "Window 1" : "Window 2"\} workspace`\}/);
  assert.doesNotMatch(taskAppSource, /ReadOnlyTasksPanel/);
  assert.doesNotMatch(splitPanelSource, /read.only|ReadOnlyTasksPanel/);
  assert.doesNotMatch(splitPanelSource, /TaskApp|useWorkspaceData|useTaskUiState/);
});

test("Task draft reporters stay stable across rerenders and clear on state changes or unmount", () => {
  assert.match(taskAppSource, /const reportTaskPanelDraft = useCallback\(/);
  assert.match(taskAppSource, /const reportLeftTableDraft = useCallback\(/);
  assert.match(taskAppSource, /const reportRightTableDraft = useCallback\(/);
  assert.match(taskAppSource, /getTaskPanelDraftSourceKey\(ownerKey, source\)/);
  assert.match(taskListAdapterSource, /onDraftEditingChangeRef\.current = onDraftEditingChange/);
  assert.match(taskListAdapterSource, /useEffect\(\(\) => \(\) => onDraftEditingChangeRef\.current\?\.\(false\), \[\]\)/);
  assert.doesNotMatch(taskListAdapterSource, /useEffect\(\(\) => \(\) => onDraftEditingChange\?\.\(false\), \[onDraftEditingChange\]\)/);
  const listDraftEffectDependencies = taskListAdapterSource.match(/useEffect\(\(\) => \{\s*onDraftEditingChangeRef\.current\?\.\(Boolean\([\s\S]*?\n  \}, \[([^\]]*)\]\);/)?.[1];
  assert.ok(listDraftEffectDependencies);
  assert.doesNotMatch(listDraftEffectDependencies, /onDraftEditingChange/);
  assert.match(taskTableSource, /onUnsafeDraftChangeRef\.current = onUnsafeDraftChange/);
  assert.match(taskTableSource, /useEffect\(\(\) => \(\) => onUnsafeDraftChangeRef\.current\?\.\(false\), \[\]\)/);
  assert.doesNotMatch(taskTableSource, /useEffect\(\(\) => \(\) => onUnsafeDraftChange\?\.\(false\), \[onUnsafeDraftChange\]\)/);
  const tableDraftEffectDependencies = taskTableSource.match(/useEffect\(\(\) => \{\s*onUnsafeDraftChangeRef\.current\?\.\(Boolean\([\s\S]*?\n  \}, \[([^\]]*)\]\);/)?.[1];
  assert.ok(tableDraftEffectDependencies);
  assert.doesNotMatch(tableDraftEffectDependencies, /onUnsafeDraftChange/);
});

test("Master Workspace exposes split navigation in both panels and duplicates any selected page", () => {
  assert.match(tabBarSource, /Split Right/);
  assert.match(tabBarSource, /Close Split/);
  assert.match(taskAppSource, /renderWorkspacePage\(splitPanels\.leftTab\.destination\.page, splitPanels\.left, splitPanels\.leftTab\)/);
  assert.match(taskAppSource, /renderWorkspacePage\(splitPanels\.rightTab\.destination\.page, splitPanels\.right, splitPanels\.rightTab\)/);
  assert.match(taskAppSource, /canActivateTabInPanel\(panel\.id, tabId\)/);
  assert.match(taskAppSource, /openPageTabInPanel\(panel\.id, page\)/);
  assert.match(controllerSource, /const canSplitRight = canNavigate[\s\S]*?currentPanel\.side === "left"[\s\S]*?!workspace\.panels\.some/);
  assert.match(controllerSource, /duplicateFocusedPageIntoRightPanel\(withLiveTasksSnapshot/);
  assert.match(controllerSource, /return activateMasterPanel\(split, panel\.id\)/);
  assert.match(controllerSource, /closeMasterSplitSafely\(withLiveTasksSnapshot, rightPanel\.id, hasUnsafeTasksDraftForSplit\(withLiveTasksSnapshot\), canCloseTargetPanelTab\)/);
  assert.match(controllerSource, /canCloseMasterSplitSafely\(before, hasUnsafeTasksDraftInCurrentSplit, canCloseTargetPanelTab\)/);
  assert.match(controllerSource, /updateMasterTabTasksWorkspace\([\s\S]*?liveTaskWorkspaceTabsState/);
  assert.match(controllerSource, /const updateTasksWorkspace = useCallback/);
});

test("Master Workspace navigation warnings overlay the page without shifting layout", () => {
  assert.match(tabBarSource, /aria-live="polite" className="[^"]*fixed bottom-4/);
});

test("sticky tab controls and Shortcut Mode keep the shared HUD, overlays, and panel docks", () => {
  assert.equal((taskAppSource.match(/<CommandCenterHeader\b/g) ?? []).length, 1);
  assert.equal((taskAppSource.match(/useWorkspaceData\(/g) ?? []).length, 1);
  assert.equal((taskAppSource.match(/useTaskUiState\(/g) ?? []).length, 1);
  assert.match(taskAppSource, /data-app-fixed-header[\s\S]*?renderMasterWorkspaceNavigation\(masterWorkspace\.currentPanel\)/);
  assert.match(taskAppSource, /workspaceTabToggles=\{masterWorkspaceHudTabToggles\}/);
  assert.match(taskAppSource, /panel\.tabsCollapsed \? null :/);
  assert.match(taskAppSource, /aria-expanded=\{expanded\}/);
  assert.match(taskAppSource, /onPanelInteraction=\{masterWorkspaceShortcutMode\.recordPanelInteraction\}/);
  assert.match(panelSource, /shortcutGuide \? \([\s\S]*?absolute inset-x-3 top-3/);
  assert.match(panelSource, /data-master-workspace-overlay-host/);
  assert.match(taskAppSource, /bottomNavigation=\{renderMasterWorkspaceApplicationNavigation\(splitPanels\.left, splitPanels\.leftTab\)\}/);
  assert.match(taskAppSource, /bottomNavigation=\{renderMasterWorkspaceApplicationNavigation\(splitPanels\.right, splitPanels\.rightTab\)\}/);
  assert.match(bottomDockSource, /layoutMode = "viewport"/);
  assert.match(bottomDockSource, /if \(isCollapsed\)[\s\S]*?if \(isPanelScoped\)/);
});

test("split panels render independent application docks alongside the existing tab bars", () => {
  assert.match(taskAppSource, /renderMasterWorkspaceApplicationNavigation\(splitPanels\.left, splitPanels\.leftTab\)/);
  assert.match(taskAppSource, /renderMasterWorkspaceApplicationNavigation\(splitPanels\.right, splitPanels\.rightTab\)/);
  assert.match(taskAppSource, /bottomNavigation: renderMasterWorkspaceApplicationNavigation\(splitPanels\.left, splitPanels\.leftTab\)/);
  assert.match(taskAppSource, /bottomNavigation: renderMasterWorkspaceApplicationNavigation\(splitPanels\.right, splitPanels\.rightTab\)/);
  assert.match(taskAppSource, /layoutMode="panel"/);
  assert.match(taskAppSource, /navigation=\{renderMasterWorkspaceNavigation\(splitPanels\.left\)\}/);
  assert.match(taskAppSource, /navigation=\{renderMasterWorkspaceNavigation\(splitPanels\.right\)\}/);
  assert.match(panelSource, /<div className="shrink-0">\{navigation\}<\/div>/);
  assert.match(panelSource, /\{bottomNavigation\}/);
  assert.doesNotMatch(panelSource, /border-t border-\[#ece8f8\].*bottomNavigation/);
  assert.match(splitPanelSource, /bottomNavigation=\{leftPanel\.bottomNavigation\}/);
  assert.match(splitPanelSource, /bottomNavigation=\{rightPanel\.bottomNavigation\}/);
  assert.match(tabBarSource, /aria-label="Master workspace tabs"/);

  assert.match(taskAppSource, /\{!masterWorkspace\.hasSplit \? \([\s\S]*?<BottomDock[\s\S]*?onNavigate=\{requestPageNavigation\}/);
  assert.match(bottomDockSource, /layoutMode = "viewport"/);
  assert.match(bottomDockSource, /absolute bottom-\[calc\(1rem\+env\(safe-area-inset-bottom\)\)\] left-1\/2 z-20 -translate-x-1\/2/);
  assert.match(bottomDockSource, /pointer-events-none absolute inset-0 z-\[120\]/);
  assert.match(bottomDockSource, /pointer-events-auto select-none/);
  assert.match(bottomDockSource, /fixed inset-x-0/);
  assert.match(bottomDockSource, /aria-label="Collapse navigation"/);
  assert.match(bottomDockSource, /if \(isCollapsed\)[\s\S]*?if \(isPanelScoped\)/);
  assert.match(bottomDockSource, /const \[isCollapsed, setIsCollapsed\] = useState\(false\)/);
  assert.match(bottomDockSource, /if \(!longPressTriggeredRef\.current\) \{\s*collapseDock\(\);/);
  assert.match(bottomDockSource, /if \(!dragRef\.current\?\.moved\) \{[\s\S]*?setIsCollapsed\(false\)/);
  assert.match(bottomDockSource, /setIsCollapsed\(true\)/);
  assert.match(bottomDockSource, /setIsCollapsed\(false\)/);
  assert.match(bottomDockSource, /ResizeObserver[\s\S]*?panelBoundaryRef[\s\S]*?clampBubblePos/);
  assert.match(bottomDockSource, /clampNavigationBubblePosition\(x, y, boundary\?\.clientWidth/);
  assert.match(bottomDockSource, /rect\.left \+ rect\.width \/ 2 - 32 - \(boundaryRect\?\.left \?\? 0\)/);
  assert.match(panelSource, /className="relative isolate flex h-full min-h-0/);
  assert.match(panelSource, /bottomNavigation \? "pb-20"/);
  assert.doesNotMatch(panelSource, /100dvh-18rem/);
  assert.match(splitPanelSource, /grid min-h-0 min-w-0 flex-1 items-stretch/);
  assert.match(taskAppSource, /masterWorkspace\.hasSplit \? "flex min-h-dvh flex-col"/);
  assert.match(taskAppSource, /masterWorkspace\.hasSplit \? "flex min-h-0 flex-1 flex-col" : "pb-28"/);
  assert.match(taskAppSource, /grid min-h-0 min-w-0 flex-1 items-stretch gap-3/);
  assert.match(panelSource, /absolute inset-0 z-\[130\]/);
  assert.match(bottomDockSource, /panelAvailableHeight=\{panelBounds\?\.height\}/);
  assert.equal((taskAppSource.match(/useWorkspaceData\(/g) ?? []).length, 1);
});

test("split application and search navigation route through their owning panel and tab", () => {
  assert.match(taskAppSource, /onNavigate=\{\(page\) => \{ masterWorkspace\.navigatePanelToPage\(panel\.id, page\); \}\}/);
  assert.match(taskAppSource, /onNavigateSearchTarget=\{\(target\) => handleMasterPanelNavigatorSearchTarget\(panel\.id, panelTab\.id, target\)\}/);
  assert.match(taskAppSource, /controller\.updatePanelDestination\(panelId, tabId, action\)/);
  assert.match(taskAppSource, /controller\.updateTasksUiState\(panelId, tabId/);
  assert.match(taskAppSource, /owner:\s*\{\s*masterTabId: tabId,\s*panelId,/);
  assert.match(taskAppSource, /data-master-workspace-panel-id/);
  assert.match(taskAppSource, /scrollElement\.scrollTo\([\s\S]*?shellRect\.top - scrollRect\.top/);
});

test("mixed pages stay in one TaskApp runtime and activate shared page data for either panel", () => {
  assert.equal((taskAppSource.match(/useWorkspaceData\(/g) ?? []).length, 1);
  assert.equal((taskAppSource.match(/useTaskUiState\(/g) ?? []).length, 1);
  assert.match(taskAppSource, /const isMasterPanelPageActive = useCallback/);
  assert.match(taskAppSource, /masterPanelPages\.includes\(page\)/);
  assert.match(taskAppSource, /setMasterPanelPages\(\(current\).*?nextPages/s);
  assert.match(taskAppSource, /masterWorkspace\.hasSplit && !isTasksSplit/);
  assert.doesNotMatch(taskAppSource, /<TaskApp\b/);
});

test("workspace fullscreen overlays are owned by one panel and leave the neighboring panel outside the host", () => {
  assert.match(panelSource, /data-master-workspace-overlay-host=\{id\}/);
  assert.match(panelSource, /className="pointer-events-none absolute inset-0 z-\[130\]"/);
  assert.match(panelSource, /overlayHost \? "absolute" : "fixed"/);
  assert.match(panelSource, /createPortal\(frame, overlayHost\.element\)/);
  assert.match(modalShellSource, /overlayHost\?\.element \?\? document\.body/);
  assert.match(modalShellSource, /\$\{isPanelScoped \? "absolute" : "fixed"\} inset-0/);
  assert.match(modalShellSource, /style=\{isPanelScoped \? \{ maxHeight: "100%" \} : undefined\}/);
  assert.match(modalShellSource, /data-overlay-owner-panel=\{overlayHost\?\.panelId\}/);
  assert.match(taskTableSource, /isPanelScopedTaskOverlay \? "pointer-events-auto absolute inset-0 h-full w-full"/);
  assert.match(taskTableSource, /createPortal\(taskEditorContent, workspaceOverlayHost\.element\)/);
  assert.match(taskAppSource, /taskEditorPanelOwner\?\.panelId/);
  assert.match(taskAppSource, /value=\{workspaceModalOverlayHost\}/);
  assert.match(homePageSource, /<WorkspaceOverlayFrame className="z-\[100\]/);
  assert.doesNotMatch(homePageSource, /fixed inset-0/);
  assert.equal((recordsTabSource.match(/<WorkspaceOverlayFrame/g) ?? []).length, 3);
  assert.doesNotMatch(recordsTabSource, /fixed inset-0/);
  assert.match(recordsTabSource, /panelScoped \? "max-h-full"/);
});

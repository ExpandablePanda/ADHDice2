import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createNavigatorSearchTargets, getNavigatorTaskSearchQuery, isNavigatorTaskSearchQuery, searchNavigatorTargets, toggleNavigatorTaskSearchQuery, type NavigatorSearchTarget } from "@/lib/navigator-search";
import { searchNavigatorTasks } from "@/lib/navigator-task-search";
import { isPageShellLayoutReady, setPageShellLayoutReady, subscribeToPageShellLayoutReadiness } from "@/lib/page-shell-layout";
import type { TaskSearchEntity } from "@/lib/task-search-selector";

const dockItems = ["Home", "Tasks", "Focus", "Health", "Roll", "Achievements", "Games", "Stats", "Notes", "Settings", "Test"] as const;
const healthTabs = ["Today", "Food", "Water", "Fitness", "Journal", "Weight", "Sleep", "Insights", "Awards", "Settings"] as const;
const targets = createNavigatorSearchTargets(dockItems, healthTabs);
const inlineSource = readFileSync(new URL("../src/components/task-app/navigator-search-inline.tsx", import.meta.url), "utf8");
const dockSource = readFileSync(new URL("../src/components/task-app/bottom-dock.tsx", import.meta.url), "utf8");
const adapterSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/components/task-app/settings-page.tsx", import.meta.url), "utf8");
const layoutHookSource = readFileSync(new URL("../src/hooks/usePageShellLayout.ts", import.meta.url), "utf8");
const pageShellLayoutSource = readFileSync(new URL("../src/lib/page-shell-layout.ts", import.meta.url), "utf8");
const globalSource = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const healthPreferenceSource = readFileSync(new URL("../src/lib/health-tab-preference.ts", import.meta.url), "utf8");

function taskEntity(id: string, title: string, ancestorIds: string[] = [], status: TaskSearchEntity["task"]["status"] = "pending"): TaskSearchEntity {
  return {
    ancestorIds,
    displayStatus: status,
    id,
    listIds: ["different-list"],
    rootParentId: ancestorIds[0] ?? id,
    searchDocument: title.toLowerCase(),
    task: { id, status, title, permanently_deleted_at: null } as TaskSearchEntity["task"],
  };
}

function findTarget(query: string) {
  const target = searchNavigatorTargets(query, targets)[0];
  assert.ok(target, `expected a target for ${query}`);
  return target;
}

test("navigation search matches destination titles and aliases without searching user content", () => {
  assert.equal(searchNavigatorTargets("", targets).length, targets.length);
  assert.deepEqual(findTarget("fitness").breadcrumb, ["Health", "Fitness"]);
  assert.deepEqual(findTarget("custom nutrition").action, {
    kind: "page-shell",
    page: "Health",
    pageKey: "health:food",
    shellId: "food-library",
    healthTab: "Food",
  });
  const foodLibraryQueries = [
    "food library",
    "custom nutrition library",
    "nutrition library",
    "nutrition",
    "nutrition import",
    "import custom foods",
    "food import",
    "custom food import",
    "custom foods",
    "foods",
    "recipes",
    "custom recipes",
    "custom meals",
    "saved meals",
  ];
  for (const query of foodLibraryQueries) {
    const match = findTarget(query);
    assert.equal(match.title, "Custom Nutrition Library");
    assert.deepEqual(match.action, {
      kind: "page-shell",
      page: "Health",
      pageKey: "health:food",
      shellId: "food-library",
      healthTab: "Food",
    });
  }
  assert.equal(targets.filter((target) => target.action.kind === "page-shell" && target.action.shellId === "food-library").length, 1);
  const foodResults = searchNavigatorTargets("food", targets);
  assert.equal(foodResults.some((target) => target.title === "Food"), true);
  assert.equal(foodResults.some((target) => target.title === "Custom Nutrition Library"), true);
  assert.deepEqual(findTarget("brain").breadcrumb, ["Tasks", "Brainstorm"]);
  assert.deepEqual(findTarget("timezone").breadcrumb, ["Settings", "Day Reset", "Time Zone"]);
  assert.doesNotMatch(readFileSync(new URL("../src/lib/navigator-search.ts", import.meta.url), "utf8"), /Task\[\]|supabase|from\("/);
});

test("Navigator query syntax selects destination search versus task search", () => {
  assert.equal(searchNavigatorTargets("fitness", targets)[0]?.action.kind, "health-tab");
  assert.equal(isNavigatorTaskSearchQuery("milk"), false);
  assert.equal(isNavigatorTaskSearchQuery("#milk"), true);
  assert.equal(isNavigatorTaskSearchQuery("# milk"), true);
  assert.equal(isNavigatorTaskSearchQuery("  #milk"), true);
  assert.equal(getNavigatorTaskSearchQuery("#milk"), "milk");
  assert.equal(getNavigatorTaskSearchQuery("# milk"), "milk");
  assert.equal(getNavigatorTaskSearchQuery("  #  milk"), "milk");
  assert.equal(isNavigatorTaskSearchQuery(getNavigatorTaskSearchQuery("#milk")), false);
});

test("all-task Navigator search is query-gated and includes the complete canonical hierarchy", () => {
  const entities = [
    taskEntity("parent", "Practice guitar"),
    taskEntity("step", "Change strings", ["parent"]),
    taskEntity("substep", "Order strings online", ["parent", "step"]),
    taskEntity("complete", "Completed practice", [], "complete"),
    taskEntity("archived", "Archived practice", [], "archived"),
    taskEntity("trash", "Trashed practice", [], "trashed"),
    taskEntity("trash-child", "Trashed child practice", ["trash"]),
  ];
  assert.deepEqual(searchNavigatorTasks("", entities), []);
  assert.deepEqual(searchNavigatorTasks("practice guitar", entities)[0]?.action, { kind: "task", page: "Tasks", taskId: "parent" });
  assert.deepEqual(searchNavigatorTasks("change strings", entities)[0]?.breadcrumb, ["Practice guitar"]);
  assert.deepEqual(searchNavigatorTasks("order strings", entities)[0]?.breadcrumb, ["Practice guitar", "Change strings"]);
  assert.equal(searchNavigatorTasks("completed practice", entities)[0]?.action.kind, "task");
  assert.equal(searchNavigatorTasks("archived practice", entities)[0]?.action.kind, "task");
  assert.equal(searchNavigatorTasks("trashed", entities).length, 0);
  assert.equal(searchNavigatorTasks("trashed child", entities).length, 0);
});

test("exact title ranking outranks a keyword-only match", () => {
  const exactTarget: NavigatorSearchTarget = {
    action: { kind: "page", page: "Focus" },
    breadcrumb: ["Focus"],
    id: "exact-focus",
    title: "Focus",
    page: "Focus",
  };
  const keywordTarget: NavigatorSearchTarget = {
    action: { kind: "page", page: "Settings" },
    breadcrumb: ["Settings", "Appearance"],
    id: "keyword-focus",
    keywords: ["focus"],
    title: "Theme",
    page: "Settings",
  };
  assert.equal(searchNavigatorTargets("focus", [keywordTarget, exactTarget])[0], exactTarget);
});

test("Tasks surface and view targets preserve existing routing state", () => {
  assert.deepEqual(findTarget("brain").action, { kind: "tasks-surface", page: "Tasks", surface: "brainstorm" });
  assert.deepEqual(findTarget("table view").action, { kind: "tasks-view", page: "Tasks", surface: "tasks", view: "table" });
  assert.match(appSource, /handleTaskWorkspaceSurfaceChange\(action\.surface\)/);
  assert.match(appSource, /handleTaskWorkspaceSurfaceChange\("tasks"\)/);
  assert.match(appSource, /setTaskUiState\(\(prev\) => \(\{ \.\.\.prev, view: action\.view \}\)\)/);
});

test("Health targets use the canonical shared tab preference", () => {
  assert.deepEqual(findTarget("fitness").action, { kind: "health-tab", page: "Health", tab: "Fitness" });
  assert.match(appSource, /persistHealthTabPreference\(action\.tab\)/);
  assert.match(appSource, /HEALTH_TABS/);
  assert.match(healthPreferenceSource, /export function persistHealthTabPreference/);
});

test("page-shell readiness is shared by page key and notifies pending navigation", () => {
  const pageKey = "test:readiness-contract";
  setPageShellLayoutReady(pageKey, false);
  let notifications = 0;
  const unsubscribe = subscribeToPageShellLayoutReadiness(() => { notifications += 1; });
  assert.equal(isPageShellLayoutReady(pageKey), false);
  setPageShellLayoutReady(pageKey, true);
  assert.equal(isPageShellLayoutReady(pageKey), true);
  setPageShellLayoutReady(pageKey, false);
  assert.equal(isPageShellLayoutReady(pageKey), false);
  assert.equal(notifications, 2);
  unsubscribe();
});

test("Settings targets remain pending through shell hydration and acknowledge after ready geometry", () => {
  assert.deepEqual(findTarget("timezone").action, { kind: "settings-section", page: "Settings", section: "day-reset" });
  assert.deepEqual(findTarget("appearance").action, { kind: "settings-section", page: "Settings", section: "appearance" });
  assert.match(appSource, /setRequestedSettingsSection\(action\.section\)/);
  assert.match(appSource, /requestedSection=\{requestedSettingsSection\}/);
  assert.match(settingsSource, /shell\.scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(settingsSource, /!layout\.isLayoutReady/);
  assert.match(settingsSource, /requestAnimationFrame/);
  assert.ok(settingsSource.indexOf("shell.scrollIntoView") < settingsSource.indexOf("onSectionRequestHandled?."));
  assert.match(settingsSource, /rect\.width <= 0 \|\| rect\.height <= 0/);
  assert.match(settingsSource, /onSectionRequestHandled\?\.\(requestedSection\)/);
  assert.match(settingsSource, /handledSectionRef\.current === requestedSection/);
});

test("shell destinations route to their page and request direct shell reveal", () => {
  assert.deepEqual(findTarget("D20 Sandbox").action, {
    kind: "page-shell",
    page: "Test",
    pageKey: "test:d20",
    shellId: "test-d20-sandbox",
  });
  assert.deepEqual(findTarget("Face Mapping Controls").action, {
    kind: "page-shell",
    page: "Test",
    pageKey: "test:d20",
    shellId: "test-d20-controls",
  });
  assert.match(appSource, /action\.kind === "page-shell"/);
  assert.match(appSource, /setRequestedPageShell\(action\)/);
  assert.match(appSource, /data-page-shell-id=\"\$\{request\.shellId\}\"/);
  assert.match(appSource, /persistHealthTabPreference\(action\.healthTab\)/);
  assert.match(appSource, /const requestedPageShellLayoutReady = useSyncExternalStore/);
  assert.match(appSource, /isPageShellLayoutReady\(requestedPageShell\.pageKey\)/);
  assert.match(appSource, /!requestedPageShellLayoutReady/);
  assert.match(appSource, /shell\.scrollIntoView\(\{ behavior: prefersReducedMotion \? "auto" : "smooth", block: "center" \}\)/);
  assert.match(appSource, /highlightPageShellNavigationTarget\(shell\)/);
  assert.match(appSource, /shell\.setAttribute\("data-page-shell-navigation-target", "true"\)/);
  assert.match(appSource, /window\.setTimeout\(clearPageShellNavigationHighlight/);
  assert.match(appSource, /window\.clearTimeout/);
  assert.match(appSource, /clearPageShellNavigationHighlight\(\)/);
  assert.match(layoutHookSource, /setPageShellLayoutReady\(pageKey, false\)/);
  assert.match(layoutHookSource, /setPageShellLayoutReady\(pageKey, true\)/);
  assert.match(pageShellLayoutSource, /subscribeToPageShellLayoutReadiness/);
  assert.match(globalSource, /\[data-page-shell-navigation-target="true"\]/);
  assert.match(globalSource, /@media \(prefers-reduced-motion: reduce\)/);
});

test("inline search mode enters with an autofocused input and supports keyboard selection", () => {
  assert.match(inlineSource, /placeholder=\{isTaskSearchMode \? "Search all tasks\.\.\." : "Search pages and sections\.\.\."\}/);
  assert.match(inlineSource, /placeholder=\{isTaskSearchMode \? "Search all tasks\.\.\."/);
  assert.match(inlineSource, /Type to search all tasks\./);
  assert.match(inlineSource, /aria-pressed=\{isTaskSearchMode\}/);
  assert.match(inlineSource, /const isTaskSearchMode = isNavigatorTaskSearchQuery\(query\)/);
  assert.match(inlineSource, /searchNavigatorTasks\(getNavigatorTaskSearchQuery\(query\), taskSearchEntities\)/);
  assert.match(inlineSource, /setQuery\(toggleNavigatorTaskSearchQuery\)/);
  assert.match(inlineSource, /<ListTodo aria-hidden="true"/);
  assert.doesNotMatch(inlineSource, /useState\(false\).*isTaskSearchMode/);
  assert.match(inlineSource, /event\.key === "ArrowDown"/);
  assert.match(inlineSource, /event\.key === "ArrowUp"/);
  assert.match(inlineSource, /event\.key === "Enter"/);
  assert.match(inlineSource, /event\.key === "Escape"/);
  assert.match(inlineSource, /No destinations found\./);
  assert.match(inlineSource, /focusDropdownControl\(inputRef\.current\)/);
  assert.match(inlineSource, /onNavigate\(target\);\s*onClose\(\)/);
  assert.doesNotMatch(inlineSource, /ModalShell/);
});

test("task query examples search canonical tasks and the icon toggles the hash", () => {
  const entities = [taskEntity("milk", "Buy milk"), taskEntity("other", "Other task")];
  assert.equal(searchNavigatorTasks(getNavigatorTaskSearchQuery("#milk"), entities)[0]?.action.taskId, "milk");
  assert.equal(searchNavigatorTasks(getNavigatorTaskSearchQuery("# milk"), entities)[0]?.action.taskId, "milk");
  assert.equal(toggleNavigatorTaskSearchQuery("milk"), "#milk");
  assert.equal(toggleNavigatorTaskSearchQuery("#milk"), "milk");
  assert.equal(toggleNavigatorTaskSearchQuery("# milk"), "milk");
});

test("task selection converges with the openTask deep-link path and preserves the current task workspace", () => {
  const bottomDockAdapterSource = adapterSource.slice(adapterSource.indexOf("export function BottomDockAdapter"));
  assert.match(appSource, /const openTaskFromExternalNavigation = useCallback/);
  assert.match(appSource, /openTaskFromExternalNavigation\(requestedTaskId\)/);
  assert.match(appSource, /action\.kind === "task"/);
  assert.match(appSource, /openTaskFromExternalNavigation\(action\.taskId\)/);
  assert.match(appSource, /setActiveTaskWorkspaceTab\(nextTaskWorkspaceTabId\)/);
  assert.match(appSource, /setSharedTaskEditorOverlayTaskId\(taskId\)/);
  assert.match(adapterSource, /taskSearchEntities/);
  assert.match(dockSource, /taskSearchEntities/);
  assert.match(adapterSource, /BottomDockComponent/);
  assert.match(bottomDockAdapterSource, /export function BottomDockAdapter\(\{[\s\S]*?searchTargets,\s*taskSearchEntities,\s*\}: \{/);
  assert.match(bottomDockAdapterSource, /<BottomDockComponent[\s\S]*?searchTargets=\{searchTargets\}[\s\S]*?taskSearchEntities=\{taskSearchEntities\}/);
});

test("expanded dock puts search first and swaps normal controls for inline search mode", () => {
  const searchIndex = dockSource.indexOf('aria-label="Search navigation"');
  const mapIndex = dockSource.indexOf("dockItems.map");
  const collapseIndex = dockSource.indexOf('aria-label="Collapse navigation"');
  assert.ok(searchIndex < mapIndex);
  assert.ok(searchIndex < collapseIndex);
  assert.match(dockSource, /const \[isSearchMode, setIsSearchMode\] = useState\(false\)/);
  assert.match(dockSource, /setIsSearchMode\(true\)/);
  assert.match(dockSource, /\{isSearchMode \? \(/);
  assert.match(dockSource, /onClose=\{\(\) => setIsSearchMode\(false\)\}/);
  assert.match(dockSource, /!isSearchMode && showPlacementMenu/);
  assert.match(dockSource, /onClick=\{\(\) => onNavigate\(item\)\}/);
  assert.match(dockSource, /if \(isCollapsed\) \{/);
  assert.match(dockSource, /onPointerDown=\{startBubbleDrag\}/);
  assert.match(dockSource, /const dockZIndexClass = isSearchMode \? "z-40" : "z-10";/);
  assert.match(dockSource, /fixed inset-x-0 \$\{dockZIndexClass\} min-w-0 px-4/);
  assert.match(dockSource, /fixed left-4 top-4 bottom-4 \$\{dockZIndexClass\}/);
  assert.match(dockSource, /fixed right-4 top-4 bottom-4 \$\{dockZIndexClass\}/);
  assert.match(adapterSource, /onNavigateSearchTarget/);
  assert.match(appSource, /searchTargets=\{navigatorSearchTargets\}/);
  assert.match(appSource, /onNavigateSearchTarget=\{handleNavigatorSearchTarget\}/);
  assert.doesNotMatch(appSource, /NavigatorSearchModal/);
  assert.doesNotMatch(inlineSource, /fixed inset-0/);
});

test("inline results remain attached to each supported dock placement", () => {
  assert.match(inlineSource, /placement === "bottom"/);
  assert.match(inlineSource, /bottom-full left-0 mb-3/);
  assert.match(inlineSource, /placement === "left"/);
  assert.match(inlineSource, /left-full top-0 ml-3/);
  assert.match(inlineSource, /right-full top-0 mr-3/);
});

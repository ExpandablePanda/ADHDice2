import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createNavigatorSearchTargets, searchNavigatorTargets, type NavigatorSearchTarget } from "@/lib/navigator-search";

const dockItems = ["Home", "Tasks", "Focus", "Health", "Roll", "Achievements", "Games", "Stats", "Notes", "Settings", "Test"] as const;
const healthTabs = ["Today", "Food", "Water", "Fitness", "Journal", "Weight", "Sleep", "Insights", "Awards"] as const;
const targets = createNavigatorSearchTargets(dockItems, healthTabs);
const inlineSource = readFileSync(new URL("../src/components/task-app/navigator-search-inline.tsx", import.meta.url), "utf8");
const dockSource = readFileSync(new URL("../src/components/task-app/bottom-dock.tsx", import.meta.url), "utf8");
const adapterSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/components/task-app/settings-page.tsx", import.meta.url), "utf8");
const healthPreferenceSource = readFileSync(new URL("../src/lib/health-tab-preference.ts", import.meta.url), "utf8");

function findTarget(query: string) {
  const target = searchNavigatorTargets(query, targets)[0];
  assert.ok(target, `expected a target for ${query}`);
  return target;
}

test("navigation search matches destination titles and aliases without searching user content", () => {
  assert.equal(searchNavigatorTargets("", targets).length, targets.length);
  assert.deepEqual(findTarget("fitness").breadcrumb, ["Health", "Fitness"]);
  assert.deepEqual(findTarget("brain").breadcrumb, ["Tasks", "Brainstorm"]);
  assert.deepEqual(findTarget("timezone").breadcrumb, ["Settings", "Day Reset", "Time Zone"]);
  assert.doesNotMatch(readFileSync(new URL("../src/lib/navigator-search.ts", import.meta.url), "utf8"), /Task\[\]|supabase|from\("/);
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

test("Settings targets request a mounted section once", () => {
  assert.deepEqual(findTarget("timezone").action, { kind: "settings-section", page: "Settings", section: "day-reset" });
  assert.match(appSource, /setRequestedSettingsSection\(action\.section\)/);
  assert.match(appSource, /requestedSection=\{requestedSettingsSection\}/);
  assert.match(settingsSource, /section\.scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(settingsSource, /onSectionRequestHandled\?\.\(requestedSection\)/);
  assert.match(settingsSource, /handledSectionRef\.current === requestedSection/);
});

test("inline search mode enters with an autofocused input and supports keyboard selection", () => {
  assert.match(inlineSource, /placeholder="Search pages and sections\.\.\."/);
  assert.match(inlineSource, /event\.key === "ArrowDown"/);
  assert.match(inlineSource, /event\.key === "ArrowUp"/);
  assert.match(inlineSource, /event\.key === "Enter"/);
  assert.match(inlineSource, /event\.key === "Escape"/);
  assert.match(inlineSource, /No destinations found\./);
  assert.match(inlineSource, /inputRef\.current\?\.focus\(\)/);
  assert.match(inlineSource, /onNavigate\(target\);\s*onClose\(\)/);
  assert.doesNotMatch(inlineSource, /ModalShell/);
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createNavigatorSearchTargets, searchNavigatorTargets, type NavigatorSearchTarget } from "@/lib/navigator-search";

const dockItems = ["Home", "Tasks", "Focus", "Health", "Roll", "Achievements", "Games", "Stats", "Notes", "Settings", "Test"] as const;
const healthTabs = ["Today", "Food", "Water", "Fitness", "Journal", "Weight", "Sleep", "Insights", "Awards"] as const;
const targets = createNavigatorSearchTargets(dockItems, healthTabs);
const modalSource = readFileSync(new URL("../src/components/task-app/navigator-search-modal.tsx", import.meta.url), "utf8");
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

test("palette keyboard behavior and compact empty state are wired", () => {
  assert.match(modalSource, /placeholder="Search pages and sections\.\.\."/);
  assert.match(modalSource, /event\.key === "ArrowDown"/);
  assert.match(modalSource, /event\.key === "ArrowUp"/);
  assert.match(modalSource, /event\.key === "Enter"/);
  assert.match(modalSource, /event\.key === "Escape"/);
  assert.match(modalSource, /No destinations found\./);
  assert.match(modalSource, /inputRef\.current\?\.focus\(\)/);
  assert.match(modalSource, /onNavigate\(target\)/);
});

test("expanded dock adds search after page icons, while collapsed behavior stays separate", () => {
  const searchIndex = dockSource.indexOf('aria-label="Search navigation"');
  const collapseIndex = dockSource.indexOf('aria-label="Collapse navigation"');
  assert.ok(searchIndex > dockSource.indexOf("dockItems.map"));
  assert.ok(searchIndex < collapseIndex);
  assert.match(dockSource, /onClick=\{\(\) => onNavigate\(item\)\}/);
  assert.match(dockSource, /if \(isCollapsed\) \{/);
  assert.match(adapterSource, /onOpenSearch/);
  assert.match(appSource, /<NavigatorSearchModal/);
});

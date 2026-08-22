import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("inactive Health and Achievements domains do not start remote loading", async () => {
  const [app, health, achievements] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useAchievementProgress.ts", import.meta.url), "utf8"),
  ]);
  assert.match(app, /useHealth\([\s\S]*?activePage === "Health"\)/);
  assert.match(app, /useAchievementProgress\([\s\S]*?activePage === "Achievements" \|\| \(activePage === "Tasks" && taskUiState\.tasksSurface === "report"\)/);
  assert.match(health, /if \(!active\) return/);
  assert.match(achievements, /!requestedUserId \|\| !active/);
});

test("Focus History and full Task History are loaded only for explicit consumers", async () => {
  const [app, focus, workspace] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useFocus.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8"),
  ]);
  assert.match(app, /useFocus\([\s\S]*?activePage === "Focus" \|\| activePage === "Stats" \|\| activePage === "Health"/);
  assert.match(focus, /!historyActive \|\| loadedFocusHistoryUserIdRef\.current === userId/);
  assert.match(workspace, /activePage === "Stats" \|\| activePage === "Games" \|\| activePage === "Achievements"/);
  assert.doesNotMatch(workspace, /window\.setTimeout\([\s\S]*?loadTaskHistory/);
});

test("one canonical full-screen loader gates auth restoration and initial app boot", async () => {
  const source = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const loadingScreen = await readFile(new URL("../src/components/workspace-loading-screen.tsx", import.meta.url), "utf8");

  assert.match(loadingScreen, /Loading\.\.\./);
  assert.match(source, /if \(!isAuthResolved\) \{[\s\S]*?return <WorkspaceLoadingScreen \/>;/);
  assert.match(source, /if \(shouldBlockAuthenticatedAppBody\) \{[\s\S]*?return <WorkspaceLoadingScreen \/>;/);
  assert.doesNotMatch(source, /HudLoadingShell|Syncing your workspace\.\.\.|Loading your workspace\.\.\./);
  assert.doesNotMatch(source, /shouldShowInitialHudLoadingShell/);
});

test("initial boot stays latched while later resume refresh remains non-blocking", async () => {
  const [app, workspace] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8"),
  ]);
  assert.match(app, /if \(isAuthenticatedAppBootReady\) \{[\s\S]*?setHasCompletedInitialAppBoot\(true\);/);
  assert.match(app, /const shouldBlockAuthenticatedAppBody = !hasCompletedInitialAppBoot && !isAuthenticatedAppBootReady;/);
  assert.match(workspace, /runSoftWorkspaceRefresh\(\{ includeSecondaryIfLoaded: true, source: "resume" \}\)/);
});

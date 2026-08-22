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
  const globalStyles = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(loadingScreen, /Loading\.\.\./);
  assert.doesNotMatch(loadingScreen, /animate-pulse/);
  assert.doesNotMatch(loadingScreen, /<h1[\s>]/);
  assert.match(loadingScreen, /strokeDasharray=\{`\$\{LOADING_RING_CIRCUMFERENCE\} \$\{LOADING_RING_CIRCUMFERENCE\}`\}/);
  assert.match(loadingScreen, /const LOADING_RING_CIRCUMFERENCE = 289\.03;/);
  assert.match(loadingScreen, /const LOADING_RING_START_OFFSET = LOADING_RING_CIRCUMFERENCE;/);
  assert.match(loadingScreen, /strokeLinecap="round"/);
  assert.match(loadingScreen, /strokeWidth="7"/);
  assert.match(loadingScreen, /-rotate-90/);
  assert.match(loadingScreen, /workspace-loading-ring-progress/);
  assert.match(loadingScreen, /motion-reduce:animate-none/);
  assert.match(loadingScreen, /data-theme=\{theme\}/);
  assert.doesNotMatch(loadingScreen, /LOADING_RING_STYLE|workspace-loading-ring-start-offset|style=\{/);
  assert.match(globalStyles, /@keyframes workspace-loading-ring[\s\S]*?stroke-dashoffset: 289\.03;[\s\S]*?stroke-dashoffset: 0;[\s\S]*?78\.01%,[\s\S]*?stroke-dashoffset: 289\.03;/);
  assert.doesNotMatch(globalStyles, /workspace-loading-ring-start-offset|stroke-dashoffset: var\(/);
  assert.match(source, /if \(!isAuthResolved\) \{[\s\S]*?return <WorkspaceLoadingScreen theme=\{theme\} \/>;/);
  assert.match(source, /if \(shouldBlockAuthenticatedAppBody\) \{[\s\S]*?return <WorkspaceLoadingScreen theme=\{theme\} \/>;/);
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

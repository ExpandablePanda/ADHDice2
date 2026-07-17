import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const completed = readFileSync(new URL("../src/components/task-app/completed-milestones-workspace.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/task-app/trophy-case/trophy-case-workspace.tsx", import.meta.url), "utf8");
const loader = readFileSync(new URL("../src/components/task-app/trophy-case/trophy-case-renderer-loader.tsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/task-app/trophy-case/trophy-case-canvas.tsx", import.meta.url), "utf8");
const thumbnails = readFileSync(new URL("../src/components/task-app/trophy-case/trophy-thumbnail-generator.ts", import.meta.url), "utf8");

test("Completed Milestones is a single list-first Trophy Gallery without a room mode switch", () => {
  assert.match(completed, /Completed Milestones/);
  assert.match(completed, /TrophyGalleryWorkspace/);
  assert.doesNotMatch(completed, />List</);
  assert.doesNotMatch(completed, />Trophy Case</);
  assert.doesNotMatch(completed, /initialMode|mode ===/);
});

test("Home opens the existing Completed Milestones gallery surface", () => {
  assert.match(home, /View Trophy Gallery/);
  assert.match(app, /onOpenTrophyGallery/);
  assert.match(app, /handleTaskWorkspaceSurfaceChange\("completed_milestones"\)/);
  assert.doesNotMatch(app, /setCompletedMilestonesOpenIntent|onOpenTrophyCase/);
});

test("ordinary rendering avoids Three and mounts one top-level dynamic shared Canvas", () => {
  assert.doesNotMatch(completed, /three|@react-three/);
  assert.doesNotMatch(home, /three|@react-three/);
  assert.match(loader, /dynamic\(\(\) => import\("\.\/trophy-case-canvas"\)/);
  assert.match(loader, /ssr: false/);
  assert.equal((canvas.match(/<Canvas/g) ?? []).length, 1);
  assert.doesNotMatch(canvas, /<View|View\.Port|scissor|getBoundingClientRect/);
  assert.match(workspace, /data-testid="shared-trophy-gallery-canvas"/);
});

test("one rectangular sandbox owns four fixed shared-canvas stages with counts underneath", () => {
  assert.match(workspace, /TROPHY_GALLERY_TIERS\.map/);
  assert.match(workspace, /data-testid="trophy-collection-sandbox"/);
  assert.match(workspace, /data-tier-preview-region=\{tier\}/);
  assert.match(workspace, /sm:aspect-\[4\/1\]/);
  assert.match(workspace, /data-tier-count-control=\{tier\}/);
  assert.match(canvas, /data-preview-layout="one-rectangle-four-fixed-stages"/);
  assert.match(canvas, /getTrophyShowcaseStageLayout/);
  assert.match(canvas, /position=\{stages\[index\]\.position\}/);
  assert.match(canvas, /scale=\{stages\[index\]\.scale\}/);
  assert.doesNotMatch(canvas, /View|scissor|getBoundingClientRect|scroll/);
  assert.doesNotMatch(workspace, /return <button[^;]+aspect-square/s);
});

test("live preview framing is centered, close, and uses profile DPR without CSS backing-buffer scaling", () => {
  assert.match(canvas, /dpr=\{profile\.dpr\}/);
  assert.match(canvas, /PerspectiveCamera makeDefault fov=\{TROPHY_SHOWCASE_CAMERA_FOV\} position=\{\[0, 0, TROPHY_SHOWCASE_CAMERA_DISTANCE\]\}/);
  assert.match(canvas, /scale=\{0\.82\}/);
  assert.match(canvas, /position=\{\[0, -1, 0\]\}/);
  assert.match(canvas, /style=\{\{ inset: 0, pointerEvents: "none", position: "absolute" \}\}/);
});

test("four live trophies rotate safely and pause for hidden documents or reduced motion", () => {
  assert.match(canvas, /TROPHY_GALLERY_TIERS\.map/);
  assert.match(canvas, /document\.visibilityState/);
  assert.match(canvas, /visibilitychange/);
  assert.match(canvas, /frameloop=\{rotationActive \? "always" : "demand"\}/);
  assert.match(canvas, /getTrophyRotationDelta\(rawDelta/);
  assert.match(canvas, /state\.invalidate\(\)/);
  assert.match(canvas, /<TrophyRotationDriver active=\{rotationActive\} controller=\{rotationController\} \/>/);
  assert.match(workspace, /onClick=\{\(\) => selectTier\(tier\)\}/);
  assert.match(workspace, /pointer-events-none absolute inset-0 z-20/);
});

test("all four fixed stages receive centered local rotation with distinct starting angles", () => {
  assert.match(canvas, /TROPHY_GALLERY_TIERS\.map\(\(tier, index\)/);
  assert.match(canvas, /initialAngle=\{index \* 0\.28\}/);
  assert.match(canvas, /rotationController\.register\(index, group\)/);
  assert.match(canvas, /rotation=\{\[0, initialAngle, 0\]\}/);
  assert.match(canvas, /for \(const group of this\.groups\)/);
  assert.match(canvas, /group\.rotation\.y \+= delta/);
});

test("tier and Aura buttons expose pressed state, counts, combined filtering, and All clears collection filters", () => {
  assert.match(workspace, /aria-pressed=\{selected\}/);
  assert.match(workspace, /counts\.tiers\[tier\]/);
  assert.match(workspace, /counts\.auras\[aura\]/);
  assert.match(workspace, /auraFilters: \[\], tierFilters: \[\]/);
  assert.match(workspace, /Showing \{filtered\.length\} of \{counts\.total\}/);
});

test("cards use one cached image per tier with distinct Aura treatments and fallback icon", () => {
  assert.match(thumbnails, /let thumbnailPromise/);
  assert.equal((thumbnails.match(/new THREE\.WebGLRenderer/g) ?? []).length, 1);
  assert.match(thumbnails, /for \(const tier of TROPHY_GALLERY_TIERS\)/);
  assert.match(thumbnails, /renderer\.dispose\(\)/);
  assert.match(workspace, /data-tier-image=\{trophy\.tier\}/);
  assert.match(workspace, /data-aura=\{trophy\.auraKind\}/);
  assert.match(workspace, /trophy\.auraKind === "diamond"/);
  assert.match(workspace, /trophy\.auraKind === "standard"/);
  assert.match(workspace, /<Trophy aria-label=/);
});

test("WebGL and thumbnail failures preserve semantic controls, cards, and polite status", () => {
  assert.match(workspace, /detectWebGL2Support/);
  assert.match(workspace, /TrophyCaseErrorBoundary/);
  assert.match(workspace, /resolveTrophyRendererFallbackReason/);
  assert.match(workspace, /Try Live Trophies/);
  assert.match(workspace, /Keep Static Previews/);
  assert.match(workspace, /renderer-failures:v2/);
  assert.match(workspace, /useStaticTotals/);
  assert.match(workspace, /aria-live="polite"/);
  assert.match(workspace, /All Trophies/);
  assert.match(workspace, /filtered\.map/);
});

test("renderer retry resets its boundary while preserving gallery filter and search state", () => {
  assert.match(workspace, /dispatchRenderer\(\{ type: "manual-retry" \}\)/);
  assert.match(workspace, /resetKey=\{renderer\.retryKey\}/);
  assert.match(workspace, /key=\{renderer\.retryKey\}/);
  assert.doesNotMatch(workspace, /setSearch\(""\)/);
  const retryBody = workspace.match(/function tryLiveTrophies\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.doesNotMatch(retryBody, /auraFilters|tierFilters|setSearch/);
});

test("context loss is prevented, given a restoration window, and can remount the shared renderer", () => {
  assert.match(canvas, /event\.preventDefault\(\)/);
  assert.match(canvas, /webglcontextlost/);
  assert.match(canvas, /webglcontextrestored/);
  assert.match(canvas, /TROPHY_CONTEXT_RESTORE_GRACE_MS/);
  assert.match(workspace, /type: "context-restore-timeout"/);
  assert.match(workspace, /type: "context-restored"/);
});

test("dynamic import and render boundary errors retain concrete fallback reasons", () => {
  assert.match(loader, /TrophyDynamicImportError/);
  assert.match(workspace, /classifyTrophyRendererError\(error\)/);
  assert.match(workspace, /reason: "renderer-error"/);
});

test("room, shelves, pedestal, inspection, and featured trophy are absent from the active gallery path", () => {
  assert.doesNotMatch(workspace, /TrophyRoom|Shelf|pedestal|Feature Trophy|Inspect|cameraTarget/);
  assert.doesNotMatch(canvas, /TrophyRoom|GuidedCamera|OrbitControls|featuredTrophy|pedestal|shelf/i);
});

test("full Milestone details remain usable for linked and deleted-task trophies", () => {
  assert.match(workspace, /onOpenTask\(trophy\.taskId!/);
  assert.match(workspace, /Open full Milestone details/);
  assert.match(workspace, /original task deleted; snapshot retained/);
  assert.match(workspace, /aria-expanded=\{detailOpen\}/);
});

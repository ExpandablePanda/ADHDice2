import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAchievementCelebrationTierTone } from "../src/lib/achievement-celebration-tier-tone.ts";

const modal = readFileSync(new URL("../src/components/task-app/achievement-celebration-modal.tsx", import.meta.url), "utf8");
const trophy = readFileSync(new URL("../src/components/task-app/achievement-celebration-trophy.tsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/task-app/achievement-celebration-trophy-canvas.tsx", import.meta.url), "utf8");
const diceRenderer = readFileSync(new URL("../src/components/dice-3d.tsx", import.meta.url), "utf8");

test("Achievement celebration replaces the generic Trophy icon with the modal dice trophy", () => {
  assert.doesNotMatch(modal, /lucide-react|<Trophy/);
  assert.match(modal, /<AchievementCelebrationTrophy/);
  assert.match(trophy, /data-testid="achievement-celebration-trophy"/);
});

test("Achievement celebration trophy loads the D6 renderer only when a celebration mounts", () => {
  assert.match(trophy, /dynamic\(/);
  assert.match(trophy, /ssr: false/);
  assert.match(trophy, /ErrorBoundary/);
  assert.match(trophy, /AchievementCelebrationTrophyFallback/);
  assert.match(canvas, /D6CalibrationCanvas/);
  assert.match(canvas, /D6_FACE_ROTATION_PRESETS/);
  assert.match(canvas, /ACHIEVEMENT_CELEBRATION_FACE_VALUE = 1/);
});

test("Achievement celebration trophy keeps one bounded centered face-one stage", () => {
  assert.match(trophy, /h-\[88px\] w-\[88px\].*overflow-hidden/s);
  assert.match(canvas, /height=\{88\}/);
  assert.match(canvas, /rotation=\{D6_FACE_ROTATION_PRESETS\[ACHIEVEMENT_CELEBRATION_FACE_VALUE\]\}/);
  assert.match(canvas, /scale=\{1\.16\}/);
  assert.match(diceRenderer, /Canvas camera=\{\{ position: \[0, 0\.25, 7\.9\], fov: 42 \}\}/);
});

test("Achievement celebration trophy uses one canonical tier palette for the Canvas and fallback", () => {
  assert.deepEqual(getAchievementCelebrationTierTone("bronze"), { bodyColor: "#a8663f", borderColor: "#a8663f", pipColor: "#201b2b" });
  assert.deepEqual(getAchievementCelebrationTierTone("silver"), { bodyColor: "#c4c9cf", borderColor: "#c4c9cf", pipColor: "#201b2b" });
  assert.deepEqual(getAchievementCelebrationTierTone("gold"), { bodyColor: "#e2aa2d", borderColor: "#e2aa2d", pipColor: "#201b2b" });
  assert.deepEqual(getAchievementCelebrationTierTone("platinum"), { bodyColor: "#e8f5f7", borderColor: "#abc9d2", pipColor: "#201b2b" });
  assert.deepEqual(getAchievementCelebrationTierTone(null), { bodyColor: "#9ca5b0", borderColor: "#77818d", pipColor: "#ffffff" });
  assert.match(trophy, /getAchievementCelebrationTierTone/);
  assert.match(canvas, /getAchievementCelebrationTierTone/);
  assert.doesNotMatch(`${trophy}\n${canvas}`, /#cbbcff|#9785e6/);
  assert.notDeepEqual(getAchievementCelebrationTierTone("platinum"), getAchievementCelebrationTierTone("silver"));
});

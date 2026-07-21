import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyFocusSandboxSwipe,
  deriveFocusBarState,
  getBoundedFocusSandboxPage,
} from "../src/lib/focus-bars.ts";

const focusBarsSource = readFileSync(new URL("../src/components/focus-bars.tsx", import.meta.url), "utf8");
const focusBarsHelperSource = readFileSync(new URL("../src/lib/focus-bars.ts", import.meta.url), "utf8");
const focusPageSource = readFileSync(new URL("../src/components/focus-page.tsx", import.meta.url), "utf8");
const focusClocksSource = readFileSync(new URL("../src/components/focus-clocks.tsx", import.meta.url), "utf8");

const targetedSession = {
  accumulatedSeconds: 120,
  categoryId: "work",
  countdownTargetSeconds: 600,
  isRunning: true,
  mode: "countdown" as const,
  startTime: 1_000,
};

test("targeted running timer uses authoritative progress", () => {
  const state = deriveFocusBarState(targetedSession, 61_000);
  assert.equal(state.elapsedSeconds, 180);
  assert.equal(state.progressRatio, 0.3);
  assert.equal(state.overtimeSeconds, 0);
});

test("targeted paused timer remains frozen", () => {
  const paused = { ...targetedSession, accumulatedSeconds: 240, isRunning: false };
  assert.deepEqual(deriveFocusBarState(paused, 9_999_000), {
    elapsedSeconds: 240,
    isOpenEnded: false,
    isPaused: true,
    overtimeSeconds: 0,
    progressRatio: 0.4,
    targetSeconds: 600,
  });
});

test("targeted timer reports overtime beyond its marker", () => {
  const state = deriveFocusBarState({ ...targetedSession, accumulatedSeconds: 725, isRunning: false }, 0);
  assert.equal(state.progressRatio, 725 / 600);
  assert.equal(state.overtimeSeconds, 125);
});

test("open-ended timer has no completion percentage", () => {
  const state = deriveFocusBarState({ ...targetedSession, countdownTargetSeconds: null, mode: "countup" }, 61_000);
  assert.equal(state.progressRatio, null);
  assert.equal(state.isOpenEnded, true);
});

test("Focus Bars delegates elapsed time to the authoritative runtime helper", () => {
  assert.match(focusBarsHelperSource, /getAuthoritativeFocusElapsedSeconds\(session, nowMs\)/);
  assert.doesNotMatch(focusBarsSource, /Date\.now\(\)\s*-\s*session\.startTime/);
});

test("Clocks is the default sandbox page", () => {
  assert.match(focusPageSource, /focusSandboxPage, setFocusSandboxPage\] = useState\(0\)/);
  assert.match(focusPageSource, /focusSandboxPage === 0[\s\S]*?<FocusClockRow/);
});

test("previous and next navigation stays bounded to two pages", () => {
  assert.equal(getBoundedFocusSandboxPage(-1), 0);
  assert.equal(getBoundedFocusSandboxPage(0), 0);
  assert.equal(getBoundedFocusSandboxPage(1), 1);
  assert.equal(getBoundedFocusSandboxPage(2), 1);
});

test("a deliberate horizontal swipe changes pages", () => {
  assert.equal(classifyFocusSandboxSwipe(-70, 8), "horizontal");
  assert.match(focusPageSource, /deltaX < 0 \? 1 : -1/);
});

test("vertical, short, and cancelled movement cannot change pages", () => {
  assert.equal(classifyFocusSandboxSwipe(9, 35), "cancelled");
  assert.equal(classifyFocusSandboxSwipe(30, 4), "pending");
  assert.match(focusPageSource, /!swipe\.cancelled/);
  assert.match(focusPageSource, /onPointerCancel=\{clearFocusSandboxSwipe\}/);
});

test("gestures beginning in the mobile clock-scroll region are ignored", () => {
  assert.match(focusClocksSource, /data-focus-clock-scroll-region/);
  assert.match(focusPageSource, /closest\("\[data-focus-clock-scroll-region\]"\)/);
});

test("Focus Bars has a compact empty state", () => {
  assert.match(focusBarsSource, /No active Focus timers/);
  assert.match(focusBarsSource, /Running and paused Focus timers will appear here/);
});

test("Focus Bars failure is isolated and leaves the Clocks pager accessible", () => {
  assert.match(focusPageSource, /<nav[\s\S]*?<FocusBarsErrorBoundary/);
  assert.match(focusPageSource, /Your timers are unchanged; use the pager to return to Clocks/);
  assert.doesNotMatch(focusPageSource, /<FocusBarsErrorBoundary[\s\S]*?<FocusClockRow/);
});

test("Focus Bars accepts no timer mutation, history, or persistence callback", () => {
  const signature = focusBarsSource.match(/export function FocusBars\(\{([\s\S]*?)\}: \{([\s\S]*?)\}\) \{/)?.[0] ?? "";
  assert.match(signature, /activeSessions/);
  assert.match(signature, /categories/);
  assert.doesNotMatch(signature, /on[A-Z]|history|persist|mutat/);
});

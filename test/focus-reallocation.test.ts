import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getFocusReallocationModeStorageKey,
  normalizeFocusReallocationMode,
  readFocusReallocationMode,
  shouldPresentDailySurplusModal,
  shouldShowManualDailySurplusAction,
  writeFocusReallocationMode,
} from "@/lib/focus-reallocation";
import type { PendingFocusDailySurplus } from "@/lib/types";

const focusPageSource = readFileSync(new URL("../src/components/focus-page.tsx", import.meta.url), "utf8");
const focusGoalsPanelSource = readFileSync(new URL("../src/components/focus-goals-panel.tsx", import.meta.url), "utf8");
const useFocusSource = readFileSync(new URL("../src/hooks/useFocus.ts", import.meta.url), "utf8");
const focusGoalsSource = readFileSync(new URL("../src/lib/focus-goals.ts", import.meta.url), "utf8");
const reallocationSource = readFileSync(new URL("../src/lib/focus-reallocation.ts", import.meta.url), "utf8");

const pending: PendingFocusDailySurplus = {
  sourceCategoryId: "source",
  sourceCategoryTitle: "Coding",
  sourceSessionId: "session-1",
  adjustmentDate: "2026-08-23",
  surplusSeconds: 1800,
};

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("Focus reallocation mode accepts only manual and automatic", () => {
  assert.equal(normalizeFocusReallocationMode("manual"), "manual");
  assert.equal(normalizeFocusReallocationMode("automatic"), "automatic");
  assert.equal(normalizeFocusReallocationMode("targetDistributionMode"), "manual");
  assert.equal(normalizeFocusReallocationMode(null), "manual");
});

test("missing and invalid stored Focus reallocation preferences default to manual", () => {
  const storage = new MemoryStorage();
  assert.equal(readFocusReallocationMode("user-a", storage), "manual");
  storage.setItem(getFocusReallocationModeStorageKey("user-a"), "invalid");
  assert.equal(readFocusReallocationMode("user-a", storage), "manual");
});

test("Focus reallocation preference storage is scoped by authenticated user", () => {
  const storage = new MemoryStorage();
  writeFocusReallocationMode("user-a", "automatic", storage);
  writeFocusReallocationMode("user-b", "manual", storage);
  assert.equal(readFocusReallocationMode("user-a", storage), "automatic");
  assert.equal(readFocusReallocationMode("user-b", storage), "manual");
  assert.equal(storage.getItem(getFocusReallocationModeStorageKey("user-a")), "automatic");
  assert.equal(storage.getItem(getFocusReallocationModeStorageKey("user-b")), "manual");
  assert.equal(storage.getItem("adhdice_hud_ui_settings:user-a"), null);
});

test("manual mode leaves surplus detection and pending state available", () => {
  const queueStart = useFocusSource.indexOf("function queueDailySurplusPrompt");
  const queueEnd = useFocusSource.indexOf("async function handleSaveDailyGoalAdjustment", queueStart);
  const queueSource = useFocusSource.slice(queueStart, queueEnd);
  assert.ok(queueStart >= 0 && queueEnd > queueStart);
  assert.doesNotMatch(queueSource, /focusReallocationMode/);
  assert.match(queueSource, /setPendingDailyGoalSurplus\(\{/);
});

test("manual mode with pending data does not automatically present the modal", () => {
  assert.equal(shouldPresentDailySurplusModal("manual", pending, false), false);
  assert.match(focusPageSource, /shouldPresentDailySurplusModal\(focusReallocationMode, pendingDailyGoalSurplus, manualReallocationOpen\)/);
});

test("manual mode with pending data exposes Reallocate and opens the existing modal", () => {
  assert.equal(shouldShowManualDailySurplusAction("manual", pending), true);
  assert.equal(shouldShowManualDailySurplusAction("manual", null), false);
  assert.match(focusGoalsPanelSource, /aria-label="Focus reallocation mode"/);
  assert.match(focusGoalsPanelSource, /<AdhdChip onClick=\{onOpenDailyGoalSurplus\} tone="purple">[\s\S]*?Reallocate/);
  assert.match(focusPageSource, /<DailySurplusReallocationModal/);
  assert.match(focusPageSource, /onOpenDailyGoalSurplus=\{openDailyGoalSurplus\}/);
});

test("automatic mode with pending data presents the existing modal", () => {
  assert.equal(shouldPresentDailySurplusModal("automatic", pending, false), true);
  assert.match(focusPageSource, /DailySurplusReallocationModal/);
});

test("switching manual to automatic presents existing pending data", () => {
  assert.equal(shouldPresentDailySurplusModal("manual", pending, false), false);
  assert.equal(shouldPresentDailySurplusModal("automatic", pending, false), true);
});

test("switching automatic to manual preserves pending data but removes automatic presentation", () => {
  assert.equal(shouldPresentDailySurplusModal("automatic", pending, false), true);
  assert.equal(shouldPresentDailySurplusModal("manual", pending, false), false);
  assert.equal(pending.surplusSeconds, 1800);
  const setterStart = useFocusSource.indexOf("const setFocusReallocationMode");
  const setterEnd = useFocusSource.indexOf("useEffect(() => {", setterStart);
  assert.doesNotMatch(useFocusSource.slice(setterStart, setterEnd), /setPendingDailyGoalSurplus\(null\)/);
});

test("Goal Progress renders connected Manual and Automatic controls", () => {
  assert.match(focusGoalsPanelSource, /aria-label="Focus reallocation mode" className="inline-flex items-center" role="group"/);
  assert.match(focusGoalsPanelSource, /\["manual", "automatic"\] as const/);
  assert.match(focusGoalsPanelSource, /aria-pressed=\{focusReallocationMode === mode\}/);
  assert.match(focusGoalsPanelSource, /getConnectedGoalChipClass\(index, modes.length\)/);
});

test("reallocation mode remains independent from target distribution mode", () => {
  assert.doesNotMatch(reallocationSource, /targetDistributionMode/);
  assert.match(focusGoalsSource, /normalizeDistributionMode\(category\.targetDistributionMode\)/);
});

test("existing adjustment save path remains authoritative", () => {
  assert.match(focusPageSource, /onSave=\{onSaveDailyGoalAdjustment\}/);
  assert.match(useFocusSource, /from\("adhdice_focus_daily_goal_adjustments"\)/);
  assert.match(useFocusSource, /setPendingDailyGoalSurplus\(null\)/);
});

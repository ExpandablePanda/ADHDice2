import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deriveManualDailySurplusOpportunity,
  getFocusReallocationModeStorageKey,
  normalizeFocusReallocationMode,
  readFocusReallocationMode,
  shouldPresentManualDailySurplusModal,
  shouldPresentDailySurplusModal,
  shouldShowManualDailySurplusAction,
  writeFocusReallocationMode,
} from "@/lib/focus-reallocation";
import type { FocusCategory, FocusDailyGoalAdjustment, HistoricalFocusSession, PendingFocusDailySurplus } from "@/lib/types";
import { OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON } from "@/lib/focus-goals";

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

const HOUR = 3600;

function category(overrides: Partial<FocusCategory>): FocusCategory {
  return {
    id: overrides.id ?? "source",
    title: overrides.title ?? "Coding",
    focusType: overrides.focusType ?? "Work",
    focusSubtype: overrides.focusSubtype ?? "Productive",
    focusSubtype2: null,
    color: "#6f57f6",
    icon: "Code",
    weeklyGoalSeconds: 7 * HOUR,
    priorityLevel: 3,
    targetDistributionMode: "auto",
    weekdayTargetSeconds: {},
    countTowardProductiveGoal: true,
    allowDailySurplusReduction: true,
    weeklySurplusCarryoverMode: "off",
    ...overrides,
  };
}

function session(overrides: Partial<HistoricalFocusSession>): HistoricalFocusSession {
  return {
    id: overrides.id ?? "session-1",
    categoryId: overrides.categoryId ?? "source",
    title: overrides.title ?? "Coding",
    date: overrides.date ?? "2026-08-23",
    durationSeconds: overrides.durationSeconds ?? HOUR,
    focusType: overrides.focusType ?? "Work",
    focusSubtype: overrides.focusSubtype ?? "Productive",
    focusSubtype2: null,
  };
}

function adjustment(overrides: Partial<FocusDailyGoalAdjustment>): FocusDailyGoalAdjustment {
  return {
    id: overrides.id ?? "adjustment-1",
    userId: "user-1",
    adjustmentDate: overrides.adjustmentDate ?? "2026-08-23",
    sourceCategoryId: overrides.sourceCategoryId ?? "source",
    targetCategoryId: overrides.targetCategoryId ?? "target",
    sourceSessionId: null,
    reductionSeconds: overrides.reductionSeconds ?? HOUR,
    reason: overrides.reason ?? "daily_surplus_reallocation",
    createdAt: "2026-08-23T12:00:00.000Z",
    updatedAt: "2026-08-23T12:00:00.000Z",
    ...overrides,
  };
}

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

test("Manual availability can use a current-state-derived opportunity after pending is dismissed", () => {
  const derived = deriveManualDailySurplusOpportunity({
    categories: [category({ weeklyGoalSeconds: 7 * HOUR })],
    history: [session({ durationSeconds: 2 * HOUR })],
    todayDate: "2026-08-23",
  });
  assert.ok(derived);
  assert.equal(derived.sourceSessionId, null);
  assert.equal(shouldShowManualDailySurplusAction("manual", null), false);
  assert.equal(shouldShowManualDailySurplusAction("manual", derived), true);
  assert.equal(shouldPresentManualDailySurplusModal("manual", derived, true), true);
  assert.equal(shouldPresentManualDailySurplusModal("manual", derived, false), false);
});

test("derived normal surplus subtracts prior ordinary allocations", () => {
  const opportunity = deriveManualDailySurplusOpportunity({
    adjustments: [adjustment({ reductionSeconds: 20 * 60 })],
    categories: [category({ weeklyGoalSeconds: 7 * HOUR })],
    history: [session({ durationSeconds: 90 * 60 })],
    todayDate: "2026-08-23",
  });
  assert.equal(opportunity?.surplusSeconds, 10 * 60);
});

test("derived normal surplus disappears when fully allocated", () => {
  const opportunity = deriveManualDailySurplusOpportunity({
    adjustments: [adjustment({ reductionSeconds: 30 * 60 })],
    categories: [category({ weeklyGoalSeconds: 7 * HOUR })],
    history: [session({ durationSeconds: 90 * 60 })],
    todayDate: "2026-08-23",
  });
  assert.equal(opportunity, null);
});

test("derived over-weekly opportunity uses the existing source-shift pool", () => {
  const opportunity = deriveManualDailySurplusOpportunity({
    categories: [category({ weeklyGoalSeconds: 7 * HOUR })],
    history: [
      session({ date: "2026-08-17", durationSeconds: 7 * HOUR }),
    ],
    todayDate: "2026-08-23",
  });
  assert.equal(opportunity?.surplusSeconds, HOUR);
  assert.equal(opportunity?.reason, OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON);
  assert.equal(opportunity?.sourceSessionId, null);
});

test("derived over-weekly opportunity advances by the existing shifted amount", () => {
  const opportunity = deriveManualDailySurplusOpportunity({
    adjustments: [adjustment({
      sourceCategoryId: "source",
      targetCategoryId: "target",
      reductionSeconds: 20 * 60,
      reason: OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON,
    })],
    categories: [category({ weeklyGoalSeconds: 7 * HOUR })],
    history: [session({ date: "2026-08-17", durationSeconds: 7 * HOUR })],
    todayDate: "2026-08-23",
  });
  assert.equal(opportunity?.surplusSeconds, HOUR - (20 * 60));
  assert.equal(opportunity?.reason, OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON);
});

test("derived opportunities choose the largest source, then category title", () => {
  const opportunity = deriveManualDailySurplusOpportunity({
    categories: [
      category({ id: "zeta", title: "Zeta", weeklyGoalSeconds: 7 * HOUR }),
      category({ id: "alpha", title: "Alpha", weeklyGoalSeconds: 7 * HOUR }),
    ],
    history: [
      session({ id: "zeta-session", categoryId: "zeta", title: "Zeta", durationSeconds: 90 * 60 }),
      session({ id: "alpha-session", categoryId: "alpha", title: "Alpha", durationSeconds: 90 * 60 }),
    ],
    todayDate: "2026-08-23",
  });
  assert.equal(opportunity?.sourceCategoryId, "alpha");
  assert.equal(opportunity?.surplusSeconds, 30 * 60);
});

test("automatic mode with pending data presents the existing modal", () => {
  assert.equal(shouldPresentDailySurplusModal("automatic", pending, false), true);
  assert.match(focusPageSource, /DailySurplusReallocationModal/);
});

test("automatic mode never presents a derived-only opportunity", () => {
  assert.equal(shouldPresentDailySurplusModal("automatic", null, false), false);
  assert.equal(shouldPresentDailySurplusModal("automatic", null, true), false);
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

test("Manual source and modal wiring use the effective opportunity while Automatic remains pending-only", () => {
  assert.match(focusPageSource, /manualDailySurplusOpportunity = pendingDailyGoalSurplus \?\? derivedManualDailySurplus/);
  assert.match(focusPageSource, /manualDailySurplusOpportunity=\{manualDailySurplusOpportunity\}/);
  assert.match(focusPageSource, /pending=\{modalDailySurplus\}/);
  assert.match(focusPageSource, /shouldPresentDailySurplusModal\(focusReallocationMode, pendingDailyGoalSurplus, manualReallocationOpen\)/);
  assert.match(focusPageSource, /shouldPresentManualDailySurplusModal\(focusReallocationMode, manualDailySurplusOpportunity, manualReallocationOpen\)/);
  assert.match(focusGoalsPanelSource, /shouldShowManualDailySurplusAction\(focusReallocationMode, manualDailySurplusOpportunity\)/);
});

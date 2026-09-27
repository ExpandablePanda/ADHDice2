import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { computeTaskSpecificHistoryStats } from "../src/lib/task-history.ts";
import { resolveTaskHistorySummaryLabels } from "../src/lib/task-history-summary-labels.ts";

const modalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const labelsSource = readFileSync(new URL("../src/lib/task-history-summary-labels.ts", import.meta.url), "utf8");
const task = {
  created_at: "2026-09-01T12:00:00.000Z",
  due_on: "2026-09-20",
  id: "task-history-summary-labels",
  repeat_frequency: "none",
} as never;
const history = [
  { entry_date: "2026-09-18", id: "history-18", status: "done", was_completed: true },
  { entry_date: "2026-09-19", id: "history-19", status: "done", was_completed: true },
  { entry_date: "2026-09-20", id: "history-20", status: "missed", was_completed: false },
] as never;

function resolve(options: Partial<Parameters<typeof resolveTaskHistorySummaryLabels>[0]> = {}) {
  return resolveTaskHistorySummaryLabels({
    canLoadOlderTaskHistory: false,
    hasCompleteSemanticHistory: false,
    taskHistoryLoadStatus: "ready",
    ...options,
  });
}

test("complete semantic History uses normal all-time labels", () => {
  assert.deepEqual(resolve({ hasCompleteSemanticHistory: true }), {
    bestStreakLabel: "Best streak",
    hasCompleteHistoryForSummary: true,
    loggedDaysLabel: "Logged days",
  });
});

test("a ready bounded detail window with no older History uses normal labels", () => {
  assert.deepEqual(resolve({ canLoadOlderTaskHistory: false }), {
    bestStreakLabel: "Best streak",
    hasCompleteHistoryForSummary: true,
    loggedDaysLabel: "Logged days",
  });
});

test("a bounded detail window that can load older History keeps window labels", () => {
  assert.deepEqual(resolve({ canLoadOlderTaskHistory: true }), {
    bestStreakLabel: "Window best streak",
    hasCompleteHistoryForSummary: false,
    loggedDaysLabel: "Window logged days",
  });
});

test("loading and error states never claim complete lifetime History", () => {
  for (const taskHistoryLoadStatus of ["loading", "error"] as const) {
    assert.deepEqual(resolve({ taskHistoryLoadStatus }), {
      bestStreakLabel: "Window best streak",
      hasCompleteHistoryForSummary: false,
      loggedDaysLabel: "Window logged days",
    });
  }
});

test("label completeness does not change Best Streak or Logged Days values", () => {
  const stats = computeTaskSpecificHistoryStats(task, history, "2026-09-23", "2026-09-01");
  assert.equal(stats.bestStreak, 2);
  assert.equal(stats.loggedDays, 3);
  assert.equal(computeTaskSpecificHistoryStats(task, history, "2026-09-23", "2026-09-01").bestStreak, stats.bestStreak);
  assert.equal(computeTaskSpecificHistoryStats(task, history, "2026-09-23", "2026-09-01").loggedDays, stats.loggedDays);
});

test("label resolution is presentation-only and does not add a semantic History fetch", () => {
  assert.doesNotMatch(labelsSource, /loadTaskHistory|fetchAllPagedRows|canonicalHistoryQuery/);
  assert.doesNotMatch(modalSource.slice(modalSource.indexOf("resolveTaskHistorySummaryLabels")), /loadTaskHistory|fetchAllPagedRows|canonicalHistoryQuery/);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { TaskActualTimeEntry } from "../src/lib/database.types.ts";
import { buildTaskDurationEvidence } from "../src/lib/task-duration-evidence.ts";
import { computeLearnedTaskDurationStatistics } from "../src/lib/task-duration-statistics.ts";

function entry(overrides: Partial<TaskActualTimeEntry> = {}): TaskActualTimeEntry {
  return {
    id: crypto.randomUUID(), task_id: "task-a", user_id: "user-a", entry_date: "2026-07-12", title_snapshot: "Task",
    duration_seconds: 60, notes: null, occurrence_key: "occurrence:2026-07-12", occurrence_due_on: "2026-07-12",
    source: "task_timer", estimate_eligible: true, exclusion_reason: null, completion_history_id: "history-a",
    completion_completed_at: "2026-07-12T10:00:00.000Z", created_at: "2026-07-12T10:00:00.000Z", ...overrides,
  };
}

test("sums timer sessions by occurrence and computes latest, average, median, and count", () => {
  const stats = computeLearnedTaskDurationStatistics([
    entry({ duration_seconds: 60 }), entry({ duration_seconds: 120 }),
    entry({ completion_history_id: "history-b", occurrence_key: "occurrence:2026-07-13", duration_seconds: 300, completion_completed_at: "2026-07-13T10:00:00.000Z" }),
    entry({ completion_history_id: "history-c", occurrence_key: "occurrence:2026-07-14", duration_seconds: 600, completion_completed_at: "2026-07-14T10:00:00.000Z" }),
  ]);
  assert.deepEqual(stats, { completedSampleCount: 3, latestSeconds: 600, averageSeconds: 360, typicalSeconds: 300 });
});

test("new manual evidence captures its immutable occurrence identity and is eligible", () => {
  assert.deepEqual(buildTaskDurationEvidence({
    active_occurrence_due_on: "2026-07-12", due_on: "2026-07-10", id: "task-a", repeat_frequency: "daily",
  }, "manual"), {
    estimateEligible: true, occurrenceDueOn: "2026-07-12", occurrenceKey: "occurrence:2026-07-12", source: "manual",
  });
  assert.deepEqual(buildTaskDurationEvidence({
    active_occurrence_due_on: null, due_on: null, id: "task-a", repeat_frequency: "none",
  }, "manual"), {
    estimateEligible: true, occurrenceDueOn: null, occurrenceKey: "lifetime:task-a", source: "manual",
  });
});

test("excludes incomplete, legacy, untrusted manual, and soft-excluded evidence", () => {
  const stats = computeLearnedTaskDurationStatistics([
    entry({ completion_history_id: null }), entry({ source: "manual", estimate_eligible: false }), entry({ source: "legacy" }), entry({ exclusion_reason: "ambiguous" }),
  ]);
  assert.deepEqual(stats, { completedSampleCount: 0, latestSeconds: null, averageSeconds: null, typicalSeconds: null });
});

test("sums trusted manual and timer entries once per completion", () => {
  const stats = computeLearnedTaskDurationStatistics([
    entry({ duration_seconds: 120, source: "manual" }),
    entry({ duration_seconds: 180, source: "task_timer" }),
    entry({ completion_history_id: "history-b", duration_seconds: 60, occurrence_key: "occurrence:2026-07-13", source: "manual", completion_completed_at: "2026-07-13T10:00:00.000Z" }),
  ]);
  assert.deepEqual(stats, { completedSampleCount: 2, latestSeconds: 60, averageSeconds: 180, typicalSeconds: null });
});

test("groups different occurrence-key formats by their shared completion history", () => {
  const stats = computeLearnedTaskDurationStatistics([
    entry({ duration_seconds: 120, occurrence_key: "occurrence:2026-07-13" }),
    entry({ duration_seconds: 180, occurrence_key: "lifetime:task-a" }),
  ]);
  assert.deepEqual(stats, { completedSampleCount: 1, latestSeconds: 300, averageSeconds: 300, typicalSeconds: null });
});

test("keeps parent, Step, and Substep samples independent even with the same occurrence key", () => {
  const stats = computeLearnedTaskDurationStatistics([
    entry({ completion_history_id: "parent-history", task_id: "parent", duration_seconds: 60 }),
    entry({ completion_history_id: "step-history", task_id: "step", duration_seconds: 120 }),
    entry({ completion_history_id: "substep-history", task_id: "substep", duration_seconds: 180 }),
  ]);
  assert.deepEqual(stats, { completedSampleCount: 3, latestSeconds: 60, averageSeconds: 120, typicalSeconds: 120 });
});

test("withholds typical duration until three completed occurrences", () => {
  const stats = computeLearnedTaskDurationStatistics([
    entry({ duration_seconds: 60 }), entry({ completion_history_id: "history-b", occurrence_key: "occurrence:2026-07-13", duration_seconds: 180 }),
  ]);
  assert.equal(stats.typicalSeconds, null);
  assert.equal(stats.completedSampleCount, 2);
});

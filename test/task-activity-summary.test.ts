import assert from "node:assert/strict";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import {
  buildTaskActivitySummaryLegacyOracle,
  compareTaskActivitySummary,
  parseTaskActivitySummaryResponse,
  TaskActivitySummaryError,
  type TaskActivitySummary,
} from "../src/lib/task-activity-summary.ts";
import { fetchTaskActivitySummary, type TaskActivitySummaryClient } from "../src/lib/task-activity-summary-repository.ts";

const TODAY = "2026-09-20";
const EPOCH = "00000000-0000-4000-8000-000000000001";

function task(id: string, parent_task_id: string | null = null, exclude_from_tracking = false): Task {
  return { id, parent_task_id, exclude_from_tracking, permanently_deleted_at: null, title: id } as Task;
}

function history(id: string, task_id: string, entry_date: string, status: TaskHistory["status"]): TaskHistory {
  return {
    id,
    task_id,
    user_id: "user-1",
    entry_date,
    occurrence_key: id,
    occurrence_due_on: entry_date,
    status,
    event_type: status === "complete" ? "completed_permanently" : "status",
    counted_as_due_occurrence: false,
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
    created_at: `${entry_date}T12:00:00Z`,
    updated_at: `${entry_date}T12:00:00Z`,
  };
}

function fixture() {
  const tasks = [
    task("excluded-parent", null, true),
    task("excluded-child", "excluded-parent"),
    task("excluded-step", null, true),
    task("normal"),
    task("normal-2"),
    task("missing-ancestor", "deleted-parent"),
    task("cycle-a", "cycle-b"),
    task("cycle-b", "cycle-a"),
  ];
  const historyRows = [
    history("excluded-parent-history", "excluded-parent", "2026-09-14", "done"),
    history("excluded-child-history", "excluded-child", "2026-09-15", "done"),
    history("excluded-step-history", "excluded-step", "2026-09-16", "complete"),
    history("orphan-history", "deleted-task", "2026-09-13", "done"),
    history("missing-ancestor-history", "missing-ancestor", "2026-09-14", "done"),
    history("normal-14", "normal", "2026-09-14", "done"),
    history("normal-15", "normal", "2026-09-15", "missed"),
    history("normal-16", "normal", "2026-09-16", "done"),
    history("normal-16-missed", "normal-2", "2026-09-16", "missed"),
    history("normal-17", "normal", "2026-09-17", "did_my_best"),
    history("normal-18", "normal", "2026-09-18", "complete"),
    history("normal-19", "normal", "2026-09-19", "done"),
    history("excluded-parent-today", "excluded-parent", TODAY, "done"),
    history("excluded-step-today", "excluded-step", TODAY, "complete"),
  ];
  return { historyRows, tasks };
}

function serverSummaryFromLegacy(legacy: ReturnType<typeof buildTaskActivitySummaryLegacyOracle>): TaskActivitySummary {
  return {
    contract_version: "task-activity-summary-v1",
    as_of_logical_date: legacy.asOfLogicalDate,
    history_sync_epoch: EPOCH,
    history_current_revision: 42,
    history_protocol_version: "task-history-sync-v1",
    tracked: legacy.tracked,
    tracked_recent_completed_counts: legacy.trackedRecentCompletedCounts,
    unfiltered_today_completed_count: legacy.unfilteredTodayCompletedCount,
  };
}

test("legacy oracle preserves exact Stats semantics across empty and mixed History", () => {
  const { historyRows, tasks } = fixture();
  const empty = buildTaskActivitySummaryLegacyOracle([], tasks, TODAY);
  assert.deepEqual(empty.tracked, {
    logged_days: 0,
    completed_days: 0,
    missed_days: 0,
    done_rate: 0,
    current_streak: 0,
    best_streak: 0,
  });
  assert.deepEqual(empty.trackedRecentCompletedCounts.map((entry) => entry.completed_count), [0, 0, 0, 0, 0, 0, 0]);

  const oracle = buildTaskActivitySummaryLegacyOracle(historyRows, tasks, TODAY);
  assert.deepEqual(oracle.tracked, {
    logged_days: 7,
    completed_days: 6,
    missed_days: 1,
    done_rate: 86,
    current_streak: 4,
    best_streak: 4,
  });
  assert.deepEqual(oracle.trackedRecentCompletedCounts.map((entry) => entry.completed_count), [2, 0, 1, 1, 1, 1, 0]);
  assert.equal(oracle.unfilteredTodayCompletedCount, 2);
});

test("tracking exclusions inherit through descendants, direct Steps, and cycles without excluding orphans", () => {
  const { historyRows, tasks } = fixture();
  const oracle = buildTaskActivitySummaryLegacyOracle(historyRows, tasks, TODAY);
  assert.equal(oracle.tracked.logged_days, 7);
  assert.equal(oracle.unfilteredTodayCompletedCount, 2);
  assert.equal(oracle.trackedRecentCompletedCounts.find((entry) => entry.logical_date === "2026-09-16")?.completed_count, 1);
  assert.equal(buildTaskActivitySummaryLegacyOracle(historyRows.filter((entry) => entry.id !== "orphan-history"), tasks, TODAY).tracked.logged_days, 6);
});

test("current streak seeds yesterday when today is unlogged and breaks on an unsuccessful logged today", () => {
  const tasks = [task("normal")];
  const yesterday = [
    history("y-1", "normal", "2026-09-17", "done"),
    history("y-2", "normal", "2026-09-18", "did_my_best"),
    history("y-3", "normal", "2026-09-19", "complete"),
  ];
  assert.equal(buildTaskActivitySummaryLegacyOracle(yesterday, tasks, TODAY).tracked.current_streak, 3);
  assert.equal(buildTaskActivitySummaryLegacyOracle([...yesterday, history("today-missed", "normal", TODAY, "missed")], tasks, TODAY).tracked.current_streak, 0);
});

test("server response parity compares Stats and Games metrics without changing authority", () => {
  const { historyRows, tasks } = fixture();
  const legacy = buildTaskActivitySummaryLegacyOracle(historyRows, tasks, TODAY);
  const summary = parseTaskActivitySummaryResponse(serverSummaryFromLegacy(legacy));
  assert.deepEqual(compareTaskActivitySummary(summary, legacy), { matched: true, mismatchedFields: [] });

  const mismatch = {
    ...summary,
    tracked: { ...summary.tracked, current_streak: summary.tracked.current_streak + 1 },
  };
  assert.deepEqual(compareTaskActivitySummary(mismatch, legacy), {
    matched: false,
    mismatchedFields: ["tracked.current_streak"],
  });
});

test("response normalization enforces the sync fence, seven-date zero fill, and malformed payload rejection", () => {
  const { historyRows, tasks } = fixture();
  const legacy = buildTaskActivitySummaryLegacyOracle(historyRows, tasks, TODAY);
  const normalized = parseTaskActivitySummaryResponse(serverSummaryFromLegacy(legacy));
  assert.equal(normalized.history_current_revision, 42);
  assert.equal(normalized.history_sync_epoch, EPOCH);
  assert.deepEqual(normalized.tracked_recent_completed_counts.map((entry) => entry.logical_date), [
    "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", TODAY,
  ]);

  assert.throws(
    () => parseTaskActivitySummaryResponse({ ...serverSummaryFromLegacy(legacy), tracked_recent_completed_counts: [] }),
    (error: unknown) => error instanceof TaskActivitySummaryError && error.code === "malformed-response",
  );
  assert.throws(
    () => parseTaskActivitySummaryResponse({ ...serverSummaryFromLegacy(legacy), history_current_revision: "42" }),
    (error: unknown) => error instanceof TaskActivitySummaryError && error.code === "malformed-response",
  );
});

test("malformed RPC responses are rejected by the repository contract", async () => {
  const client = {
    rpc: async () => ({ data: { contract_version: "unknown" }, error: null }),
  } as unknown as TaskActivitySummaryClient;
  await assert.rejects(
    () => fetchTaskActivitySummary(client, TODAY),
    (error: unknown) => error instanceof TaskActivitySummaryError && error.code === "malformed-response",
  );
});

test("RPC failure is normalized as a safe repository error", async () => {
  const client = {
    rpc: async () => ({ data: null, error: { message: "summary unavailable" } }),
  } as unknown as TaskActivitySummaryClient;
  await assert.rejects(
    () => fetchTaskActivitySummary(client, TODAY),
    (error: unknown) => error instanceof TaskActivitySummaryError
      && error.code === "rpc-failed"
      && error.message === "summary unavailable",
  );
});

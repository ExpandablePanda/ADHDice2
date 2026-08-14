import assert from "node:assert/strict";
import test from "node:test";

import { buildTaskHistoryRowProjections } from "../src/lib/task-history.ts";
import type { TaskHistory } from "../src/lib/database.types.ts";

function history(entryDate: string, status: TaskHistory["status"], timestamps = true): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: timestamps ? `${entryDate}T12:00:00.000Z` : null,
    entry_date: entryDate,
    event_type: "status",
    id: `history-${entryDate}`,
    occurrence_due_on: entryDate,
    occurrence_key: `task:task-1:occurrence:${entryDate}`,
    status,
    task_id: "task-1",
    updated_at: timestamps ? `${entryDate}T12:00:00.000Z` : null,
    user_id: "user-1",
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
  };
}

function day(state: "done" | "did_my_best" | "missed", obligation: "due" | "overdue" = "overdue") {
  return { state, obligation };
}

test("calculated Missed dates become visible rows without timestamps", () => {
  const rows = buildTaskHistoryRowProjections([], {
    "2026-08-05": day("missed"),
    "2026-08-06": day("missed"),
  });

  assert.deepEqual(rows.map((row) => row.logicalDate), ["2026-08-06", "2026-08-05"]);
  assert.ok(rows.every((row) => row.status === "missed" && row.entry === null && row.isCalculated));
});

test("explicit outcomes retain metadata and merge one row per logical date", () => {
  const rows = buildTaskHistoryRowProjections([
    history("2026-08-05", "missed"),
    history("2026-08-04", "done"),
    history("2026-08-03", "did_my_best"),
  ], {
    "2026-08-05": day("missed"),
    "2026-08-04": day("done", "due"),
    "2026-08-03": day("did_my_best", "due"),
    "2026-08-02": day("missed"),
  });

  assert.deepEqual(rows.map((row) => row.logicalDate), ["2026-08-05", "2026-08-04", "2026-08-03", "2026-08-02"]);
  assert.equal(rows[0]?.entry?.created_at, "2026-08-05T12:00:00.000Z");
  assert.equal(rows[1]?.status, "done");
  assert.equal(rows[2]?.status, "did_my_best");
  assert.equal(rows[3]?.entry, null);
});

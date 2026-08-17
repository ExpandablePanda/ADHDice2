import assert from "node:assert/strict";
import test from "node:test";
import type { TaskHistory } from "../src/lib/database.types.ts";
import { deduplicateTaskHistoryByLogicalDate, fetchTaskHistoryForTaskIdsInBatches } from "../src/lib/task-history.ts";

const VERA_TASK_ID = "81b64697-4291-4d3d-913a-c9d0e2f8d804";
const ROTH_TASK_ID = "27035f67-c008-4e54-9761-c7f01cf0604d";

function history(taskId: string, entryDate: string, provenance: "migration_reconstruction" | "user" = "migration_reconstruction", id = `${taskId}:${entryDate}`) {
  return {
    canonical_fact_id: id,
    canonical_provenance_kind: provenance,
    created_at: `${entryDate}T12:00:00.000Z`,
    entry_date: entryDate,
    id,
    status: "done",
    task_id: taskId,
    updated_at: `${entryDate}T12:00:00.000Z`,
    user_id: "user-1",
  } as TaskHistory;
}

function weeklyHistory(taskId: string, dates: string[]) {
  return dates.map((date, index) => history(taskId, date, index === dates.length - 1 ? "user" : "migration_reconstruction"));
}

test("Vera Reports and Roth Reports rollover reads retain all canonical weekly facts", async () => {
  const veraDates = ["2026-06-01", "2026-06-08", "2026-06-16", "2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10"];
  const rothDates = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10"];
  const rows = [...weeklyHistory(VERA_TASK_ID, veraDates), ...weeklyHistory(ROTH_TASK_ID, rothDates)];

  const result = await fetchTaskHistoryForTaskIdsInBatches([VERA_TASK_ID, ROTH_TASK_ID], async (taskIds) => ({
    data: rows.filter((row) => taskIds.includes(row.task_id)),
    error: null,
  }));

  assert.deepEqual(result[VERA_TASK_ID]?.history.map((row) => row.entry_date).sort(), veraDates.sort());
  assert.deepEqual(result[ROTH_TASK_ID]?.history.map((row) => row.entry_date).sort(), rothDates.sort());
  assert.equal(result[VERA_TASK_ID]?.status, "ready");
  assert.equal(result[ROTH_TASK_ID]?.status, "ready");
});

test("rollover History batches multiple Tasks without one request per Task", async () => {
  const taskIds = Array.from({ length: 205 }, (_, index) => `task-${index}`);
  const requestedBatches: string[][] = [];
  const result = await fetchTaskHistoryForTaskIdsInBatches(taskIds, async (batchTaskIds) => {
    requestedBatches.push(batchTaskIds);
    return { data: batchTaskIds.map((taskId) => history(taskId, "2026-08-10")), error: null };
  });

  assert.equal(requestedBatches.length, 3);
  assert.deepEqual(requestedBatches.map((batch) => batch.length), [100, 100, 5]);
  assert.equal(Object.keys(result).length, taskIds.length);
  assert.equal(result[taskIds[204]]?.history.length, 1);
});

test("canonical History wins over an overlapping legacy row in the rollover read model", () => {
  const legacy = { ...history(VERA_TASK_ID, "2026-08-03", "user", "legacy-row"), canonical_fact_id: null };
  const canonical = history(VERA_TASK_ID, "2026-08-03", "migration_reconstruction", "canonical-row");
  assert.deepEqual(deduplicateTaskHistoryByLogicalDate([legacy, canonical]), [canonical]);
});

test("a failed rollover batch returns errors without creating a ready empty result", async () => {
  const result = await fetchTaskHistoryForTaskIdsInBatches([VERA_TASK_ID], async () => ({
    data: null,
    error: { message: "canonical read failed" },
  }));

  assert.equal(result[VERA_TASK_ID]?.status, "error");
  assert.equal(result[VERA_TASK_ID]?.history, null);
  assert.equal(result[VERA_TASK_ID]?.error, "canonical read failed");
});

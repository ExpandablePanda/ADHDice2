import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTaskHistoryOccurrenceMetadata } from "../src/lib/task-duration-evidence.ts";

const completionSql = readFileSync("supabase/fix_task_duration_completion_occurrences.sql", "utf8");
const taskAppSource = readFileSync("src/components/task-app.tsx", "utf8");

function recurringTask(dueOn: string, activeOccurrenceDueOn: string | null = null) {
  return {
    active_occurrence_due_on: activeOccurrenceDueOn,
    due_on: dueOn,
    id: "task-a",
    repeat_frequency: "daily" as const,
  };
}

test("future-due Done keeps action date separate from the targeted occurrence", () => {
  const historyPayload = {
    entry_date: "2026-07-12",
    ...buildTaskHistoryOccurrenceMetadata(recurringTask("2026-07-13"), "done"),
  };
  assert.deepEqual(historyPayload, {
    entry_date: "2026-07-12",
    occurrence_due_on: "2026-07-13",
    occurrence_key: "occurrence:2026-07-13",
  });
});

test("due-today Done and rollover Did My Best expose the targeted occurrence", () => {
  assert.deepEqual(buildTaskHistoryOccurrenceMetadata(recurringTask("2026-07-12"), "done"), {
    occurrence_due_on: "2026-07-12",
    occurrence_key: "occurrence:2026-07-12",
  });
  assert.deepEqual(buildTaskHistoryOccurrenceMetadata(recurringTask("2026-07-13", "2026-07-13"), "did_my_best"), {
    occurrence_due_on: "2026-07-13",
    occurrence_key: "occurrence:2026-07-13",
  });
});

test("completion SQL captures rollover identity and links by occurrence metadata", () => {
  assert.match(completionSql, /coalesce\(target_task\.active_occurrence_due_on, new\.entry_date\)/);
  assert.match(completionSql, /new\.occurrence_key is not null and evidence\.occurrence_key = new\.occurrence_key/);
  assert.match(completionSql, /history\.occurrence_key = new\.occurrence_key/);
  assert.match(completionSql, /new\.status in \('done', 'did_my_best'\)\s+and new\.was_completed/);
  assert.doesNotMatch(completionSql, /update public\.adhdice_task_history\s+set/);
});

test("manual actual-time persistence does not update the manual estimate", () => {
  const start = taskAppSource.indexOf("async function logActualTimeForTask");
  const end = taskAppSource.indexOf("async function handleActualTimeEntrySave", start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(taskAppSource.slice(start, end), /estimated_minutes/);
});

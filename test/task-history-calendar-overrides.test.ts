import assert from "node:assert/strict";
import test from "node:test";

import { buildManualTaskHistoryOverrideOccurrenceMetadata } from "../src/lib/task-history.ts";
import { resolveTaskHistoryCalendarRead } from "../src/lib/task-state-engine/index.ts";
import { createTask } from "../src/lib/task-buckets.ts";

const recurringTask = {
  id: "task-1",
  repeat_frequency: "daily" as const,
};

test("new recurring calculated date gets selected-date occurrence metadata", () => {
  assert.deepEqual(
    buildManualTaskHistoryOverrideOccurrenceMetadata(recurringTask, "2026-08-03", null),
    {
      occurrence_due_on: "2026-08-03",
      occurrence_key: "task:task-1:occurrence:2026-08-03",
    },
  );
});

test("existing History occurrence metadata is preserved exactly", () => {
  assert.deepEqual(
    buildManualTaskHistoryOverrideOccurrenceMetadata(recurringTask, "2026-08-03", {
      occurrence_due_on: "2026-08-01",
      occurrence_key: "task:task-1:occurrence:2026-08-01",
    }),
    {
      occurrence_due_on: "2026-08-01",
      occurrence_key: "task:task-1:occurrence:2026-08-01",
    },
  );
});

test("No Repeat override metadata does not invent a recurring identity", () => {
  assert.deepEqual(
    buildManualTaskHistoryOverrideOccurrenceMetadata({
      id: "task-1",
      repeat_frequency: "none",
    }, "2026-08-03", null),
    {
      occurrence_due_on: null,
      occurrence_key: null,
    },
  );
});

test("saved Not Due Calendar override is read back into the Effective Timeline", () => {
  const task = createTask({
    created_at: "2026-08-01T12:00:00.000Z",
    due_on: "2026-08-01",
    id: "task-1",
    repeat_frequency: "daily",
    repeat_interval: 1,
    status: "pending",
    title: "Override read",
  });
  const result = resolveTaskHistoryCalendarRead({
    calendarEnd: "2026-08-10",
    calendarOverrides: [{ id: "override-1", logicalDate: "2026-08-05", overrideState: "not_due" }],
    calendarStart: "2026-08-01",
    history: [],
    logicalDayRollover: "00:00",
    now: "2026-08-10T12:00:00.000Z",
    task,
    timezone: "UTC",
  });

  assert.equal(result?.timeline?.days["2026-08-05"]?.state, "not_due");
  assert.equal(result?.timeline?.days["2026-08-05"]?.calendarOverrideId, "override-1");
});

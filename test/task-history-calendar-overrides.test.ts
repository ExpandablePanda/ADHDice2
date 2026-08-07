import assert from "node:assert/strict";
import test from "node:test";

import { buildManualTaskHistoryOverrideOccurrenceMetadata } from "../src/lib/task-history.ts";

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

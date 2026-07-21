import assert from "node:assert/strict";
import test from "node:test";
import { buildRecordEventIdentity, getTaskOccurrenceIdentity } from "../src/lib/records/identity.ts";

test("occurrence identity uses persisted, one-off lifetime, then logical-date precedence", () => {
  const base = { entry_date: "2026-07-01", occurrence_key: null, task_id: "task-1" };
  assert.equal(getTaskOccurrenceIdentity({ ...base, occurrence_key: "occurrence:stored" }, { repeat_frequency: "daily" }), "occurrence:stored");
  assert.equal(getTaskOccurrenceIdentity(base, { repeat_frequency: "none" }), "lifetime:task-1");
  assert.equal(getTaskOccurrenceIdentity(base, { repeat_frequency: "weekly" }), "logical-date:2026-07-01");
});

test("record event identity is deterministic and candidate-sensitive", () => {
  const input = { candidateIdentity: "candidate-a", metricKey: "parent_tasks_day" as const, scopeId: null, scopeKind: "global" as const, value: 3 };
  assert.equal(buildRecordEventIdentity(input), buildRecordEventIdentity(input));
  assert.notEqual(buildRecordEventIdentity(input), buildRecordEventIdentity({ ...input, candidateIdentity: "candidate-b" }));
});

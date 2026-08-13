import assert from "node:assert/strict";
import test from "node:test";

import {
  createTaskRolloverReplayIdentity,
  createTaskRolloverSettingsKey,
  getTaskRolloverStorageKey,
  persistProcessedTaskRolloverKey,
  shouldAttemptTaskRollover,
} from "../src/lib/task-rollover-gate.ts";

test("rollover replay identity is stable for the same planned mutation and revision", () => {
  const input = { canonicalRevision: 4, logicalDayKey: "user-1|2026-08-12|America/New_York|06:00", patch: { status: "missed" }, taskId: "task-1" };
  assert.equal(createTaskRolloverReplayIdentity(input), createTaskRolloverReplayIdentity({ ...input, patch: { status: "missed" } }));
});

test("rollover replay identity changes for a new revision or planned mutation", () => {
  const input = { canonicalRevision: 4, logicalDayKey: "user-1|2026-08-12|America/New_York|06:00", patch: { dueOn: "2026-08-19" }, taskId: "task-1" };
  assert.notEqual(createTaskRolloverReplayIdentity(input), createTaskRolloverReplayIdentity({ ...input, canonicalRevision: 5 }));
  assert.notEqual(createTaskRolloverReplayIdentity(input), createTaskRolloverReplayIdentity({ ...input, patch: { dueOn: "2026-08-20" } }));
});

test("rollover key includes user, logical day, timezone, and configured boundary", () => {
  const base = { logicalDayKey: "2026-08-02", rolloverTime: "06:00", timezone: "America/New_York", userId: "user-1" };
  const key = createTaskRolloverSettingsKey(base);
  assert.equal(key, "user-1|2026-08-02|America/New_York|06:00");
  assert.notEqual(createTaskRolloverSettingsKey({ ...base, timezone: "America/Chicago" }), key);
  assert.notEqual(createTaskRolloverSettingsKey({ ...base, rolloverTime: "04:00" }), key);
});

test("processed rollover keys persist per user and permit a changed settings key", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const key = "user-1|2026-08-02|America/New_York|06:00";
  assert.equal(shouldAttemptTaskRollover(storage, key, "user-1"), true);
  persistProcessedTaskRolloverKey(storage, key, "user-1");
  assert.equal(values.get(getTaskRolloverStorageKey("user-1")), key);
  assert.equal(shouldAttemptTaskRollover(storage, key, "user-1"), false);
  assert.equal(shouldAttemptTaskRollover(storage, `${key}|changed`, "user-1"), true);
});

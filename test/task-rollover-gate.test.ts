import assert from "node:assert/strict";
import test from "node:test";

import {
  createTaskRolloverSettingsKey,
  getTaskRolloverStorageKey,
  persistProcessedTaskRolloverKey,
  shouldAttemptTaskRollover,
} from "../src/lib/task-rollover-gate.ts";

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

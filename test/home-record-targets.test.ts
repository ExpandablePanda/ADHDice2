import assert from "node:assert/strict";
import test from "node:test";
import { HOME_RECORD_METRIC_KEYS } from "../src/lib/home-progress.ts";
import { homeRecordSettingsMatch, loadHomeRecordTargets } from "../src/hooks/useHomeRecordTargets.ts";

function fakeClient(rows: unknown[], error: Error | null = null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const query = {
    select: (...args: unknown[]) => { calls.push({ method: "select", args }); return query; },
    eq: (...args: unknown[]) => { calls.push({ method: "eq", args }); return query; },
    in: (...args: unknown[]) => { calls.push({ method: "in", args }); return Promise.resolve({ data: rows, error }); },
  };
  return {
    client: { from: (...args: unknown[]) => { calls.push({ method: "from", args }); return query; } } as never,
    calls,
  };
}

test("Home target read requests only the three daily metrics and never reconciles", async () => {
  const fake = fakeClient([
    { logical_day_start: "06:00:00", metric_key: "parent_tasks_day", timezone: "America/New_York", value: 12 },
  ]);
  const result = await loadHomeRecordTargets(fake.client, "user-1", { logicalDayStart: "06:00", timezone: "America/New_York" });
  assert.deepEqual(result.targets, { parent_tasks_day: 12 });
  assert.equal(fake.calls.find((call) => call.method === "select")?.args[0], "metric_key,value,timezone,logical_day_start");
  assert.deepEqual(fake.calls.find((call) => call.method === "in")?.args, ["metric_key", [...HOME_RECORD_METRIC_KEYS]]);
  assert.equal(fake.calls.filter((call) => call.method === "from").length, 1);
});

test("record target settings must match timezone and logical-day start", () => {
  const row = { logical_day_start: "06:00:00", timezone: "America/New_York" };
  assert.equal(homeRecordSettingsMatch(row, { logicalDayStart: "06:00", timezone: "America/New_York" }), true);
  assert.equal(homeRecordSettingsMatch(row, { logicalDayStart: "07:00", timezone: "America/New_York" }), false);
  assert.equal(homeRecordSettingsMatch(row, { logicalDayStart: "06:00", timezone: "UTC" }), false);
  assert.equal(homeRecordSettingsMatch({ ...row, logical_day_start: "06:00:30" }, { logicalDayStart: "06:00", timezone: "America/New_York" }), false);
});

test("target query failures stay local to the target loader", async () => {
  const fake = fakeClient([], new Error("query failed"));
  await assert.rejects(loadHomeRecordTargets(fake.client, "user-1", { logicalDayStart: "06:00", timezone: "America/New_York" }), /query failed/);
});

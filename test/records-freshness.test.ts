import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadLatestCompletedRecordsRun } from "../src/lib/record-repository.ts";
import { isRecordsFresh, isRecordsInvalidatedAfter, normalizeRecordsLogicalDayStart, RECORDS_AUTO_REFRESH_INTERVAL_MS } from "../src/lib/records/freshness.ts";
import {
  clearRecordsInvalidation,
  markRecordsInvalidated,
  readRecordsInvalidatedAt,
  readRecordsLocalDetailCache,
  writeRecordsLocalDetailCache,
} from "../src/lib/records/persistent-cache.ts";

const sql = readFileSync(new URL("../supabase/patch_records_freshness_read_7_13_88.sql", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/hooks/useRecords.ts", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
const homeTargets = readFileSync(new URL("../src/hooks/useHomeRecordTargets.ts", import.meta.url), "utf8");
const taskApp = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

function storage(initial: Record<string, string> = {}, options: { failRead?: boolean; failWrite?: boolean } = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    clear: () => values.clear(),
    getItem: (key) => options.failRead ? (() => { throw new Error("storage unavailable"); })() : values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => { if (options.failWrite) throw new Error("quota exceeded"); values.set(key, value); },
  };
}

const now = Date.parse("2026-09-20T12:00:00.000Z");

test("Records uses one 12-hour interval and treats the boundary as stale", () => {
  assert.equal(RECORDS_AUTO_REFRESH_INTERVAL_MS, 12 * 60 * 60 * 1000);
  const calculatedAt = new Date(now - RECORDS_AUTO_REFRESH_INTERVAL_MS + 1).toISOString();
  const boundary = new Date(now - RECORDS_AUTO_REFRESH_INTERVAL_MS).toISOString();
  const older = new Date(now - RECORDS_AUTO_REFRESH_INTERVAL_MS - 1).toISOString();
  assert.equal(isRecordsFresh(calculatedAt, now), true);
  assert.equal(isRecordsFresh(boundary, now), false);
  assert.equal(isRecordsFresh(older, now), false);
});

test("Records freshness normalizes database time values and honors newer invalidation", () => {
  assert.equal(normalizeRecordsLogicalDayStart("06:00:00"), "06:00");
  assert.equal(normalizeRecordsLogicalDayStart("06:00"), "06:00");
  assert.equal(normalizeRecordsLogicalDayStart("06:00:30"), null);
  assert.equal(isRecordsInvalidatedAfter("2026-09-20T10:00:00.000Z", "2026-09-20T10:00:01.000Z"), true);
  assert.equal(isRecordsInvalidatedAfter("2026-09-20T10:00:00.000Z", "2026-09-20T10:00:00.000Z"), false);
});

test("freshness RPC query sends only current settings and maps the narrow row", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: [{ completed_at: "2026-09-20T10:01:00Z", evaluated_at: "2026-09-20T10:00:00Z", logical_day_start: "06:00:00", rules_version: "records-v1", timezone: "America/New_York" }], error: null };
    },
  } as never;
  const result = await loadLatestCompletedRecordsRun(client, { logicalDayStart: "06:00", timezone: "America/New_York" });
  assert.deepEqual(calls, [{ name: "adhdice_get_latest_completed_records_run", args: { p_logical_day_start: "06:00", p_rules_version: "records-v1", p_timezone: "America/New_York" } }]);
  assert.equal(result?.evaluated_at, "2026-09-20T10:00:00Z");
  assert.equal(result?.logical_day_start, "06:00:00");
});

test("freshness migration is a narrow authenticated function, not table SELECT", () => {
  assert.match(sql, /create or replace function public\.adhdice_get_latest_completed_records_run\(\s*p_rules_version text,\s*p_timezone text,\s*p_logical_day_start text\s*\)/);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /run\.user_id = v_user_id/);
  assert.match(sql, /run\.status = 'completed'/);
  assert.match(sql, /run\.rules_version = p_rules_version/);
  assert.match(sql, /run\.timezone = p_timezone/);
  assert.match(sql, /run\.logical_day_start = v_logical_day_start/);
  assert.match(sql, /order by run\.evaluated_at desc, run\.completed_at desc/);
  assert.match(sql, /returns table \(\s*evaluated_at timestamptz,\s*completed_at timestamptz,\s*rules_version text,\s*timezone text,\s*logical_day_start time/s);
  assert.match(sql, /revoke all on function public\.adhdice_get_latest_completed_records_run\(text, text, text\) from public/);
  assert.match(sql, /revoke all on function public\.adhdice_get_latest_completed_records_run\(text, text, text\) from anon/);
  assert.match(sql, /grant execute on function public\.adhdice_get_latest_completed_records_run\(text, text, text\) to authenticated/);
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+table\s+public\.adhdice_record_reconcile_runs/i);
  assert.doesNotMatch(sql, /run_id|manifest_digest|expected_chunk_count/);
});

test("rich detail cache restores only exact calculation identity and fails safely", () => {
  const cache = storage();
  const input = {
    lastCalculatedAt: "2026-09-20T10:00:00.000Z",
    provisionalCandidates: [],
    sessionKey: "user-1:records-v1:America/New_York:06:00",
    taskEvidenceByRecordIdentity: { "parent_tasks_day:global:global": [{ entityKind: "parent", logicalDate: "2026-09-20", occurrenceDueOn: null, occurrenceIdentity: "occurrence-1", outcome: "done", sourceRowId: "history-1", taskId: "task-1", title: "Task 1" }] },
    warnings: ["warning"],
  } as never;
  assert.equal(writeRecordsLocalDetailCache(cache, input), true);
  assert.ok(readRecordsLocalDetailCache(cache, input.sessionKey, input.lastCalculatedAt));
  assert.equal(readRecordsLocalDetailCache(cache, input.sessionKey, "2026-09-20T10:00:01.000Z"), null);
  assert.equal(readRecordsLocalDetailCache(cache, "user-2:records-v1:America/New_York:06:00", input.lastCalculatedAt), null);
  cache.setItem(`adhdice:records:details:v1:${input.sessionKey}`, JSON.stringify({ ...input, schemaVersion: 1, taskEvidenceByRecordIdentity: { malformed: 1 } }));
  assert.equal(readRecordsLocalDetailCache(cache, input.sessionKey, input.lastCalculatedAt), null);
  cache.setItem(`adhdice:records:details:v1:${input.sessionKey}`, "not-json");
  assert.equal(readRecordsLocalDetailCache(cache, input.sessionKey, input.lastCalculatedAt), null);
  assert.equal(writeRecordsLocalDetailCache(storage({}, { failWrite: true }), input), false);
});

test("invalidation markers are user/settings scoped and storage failures are harmless", () => {
  const cache = storage();
  const key = "user-1:records-v1:America/New_York:06:00";
  assert.equal(markRecordsInvalidated(cache, key, "2026-09-20T11:00:00.000Z"), true);
  assert.equal(readRecordsInvalidatedAt(cache, key), "2026-09-20T11:00:00.000Z");
  assert.equal(readRecordsInvalidatedAt(cache, "user-2:records-v1:America/New_York:06:00"), null);
  assert.equal(clearRecordsInvalidation(cache, key), true);
  assert.equal(readRecordsInvalidatedAt(cache, key), null);
  assert.equal(markRecordsInvalidated(storage({}, { failWrite: true }), key), false);
  assert.equal(readRecordsInvalidatedAt(storage({}, { failRead: true }), key), null);
});

test("production bootstrap and loading wiring preserve the narrow boundaries", () => {
  assert.match(hook, /loadLatestCompletedRecordsRun/);
  assert.match(hook, /loadPersistedRecords/);
  assert.match(hook, /recordsRunMatchesSettings/);
  assert.match(hook, /Loading saved Records…/);
  assert.match(hook, /runRecordsPipelineSingleFlight/);
  assert.doesNotMatch(hook, /loadRecordsTasks|loadRecordsTaskHistory|loadRecordsFocusSessions/);
  assert.match(home, /Loading today(?:'|&apos;)s completions…/);
  assert.match(home, /Loading saved Records…/);
  assert.match(home, /recordTargetsRecalculatedAt/);
  assert.match(homeTargets, /recalculated_at/);
  assert.doesNotMatch(homeTargets, /runRecordsPipeline/);
  const bulkStart = taskApp.indexOf("const excludeTasksFromTracking = useCallback");
  const bulkEnd = taskApp.indexOf("const runGuardedTaskRowUpdate", bulkStart);
  const bulk = taskApp.slice(bulkStart, bulkEnd);
  assert.match(bulk, /canonicalTasksRef\.current\.map/);
  assert.doesNotMatch(bulk, /new Map\(tasks\.map/);
  assert.match(bulk, /setTasks\(nextTasks\)/);
  assert.match(bulk, /refreshTaskHistoryStreakSummaries\(nextTasks/);
});

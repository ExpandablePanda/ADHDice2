import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadLatestCompletedRecordsRun } from "../src/lib/record-repository.ts";
import { isRecordsFresh, isRecordsInvalidatedAfter, normalizeRecordsLogicalDayStart, recordsTimestampsMatch, RECORDS_AUTO_REFRESH_INTERVAL_MS } from "../src/lib/records/freshness.ts";
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

function storage(initial: Record<string, string> = {}, options: { failRead?: boolean; failWrite?: boolean; failWriteCount?: number } = {}): Storage {
  const values = new Map(Object.entries(initial));
  let failuresRemaining = options.failWrite ? Number.POSITIVE_INFINITY : options.failWriteCount ?? 0;
  return {
    clear: () => values.clear(),
    getItem: (key) => options.failRead ? (() => { throw new Error("storage unavailable"); })() : values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      if (failuresRemaining > 0) {
        if (Number.isFinite(failuresRemaining)) failuresRemaining -= 1;
        throw new Error("quota exceeded");
      }
      values.set(key, value);
    },
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

test("Records timestamp identity compares exact instants across valid serializations", () => {
  assert.equal(recordsTimestampsMatch("2026-09-20T14:17:52.587Z", "2026-09-20T14:17:52.587+00:00"), true);
  assert.equal(recordsTimestampsMatch("2026-09-20T14:17:52.587Z", "2026-09-20T09:17:52.587-05:00"), true);
  assert.equal(recordsTimestampsMatch("2026-09-20T14:17:52.587Z", "2026-09-20T14:17:52.588Z"), false);
  assert.equal(recordsTimestampsMatch("not-a-timestamp", "not-a-timestamp"), false);
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

test("rich detail cache writes the intended v2 payload and restores exact calculation identity", () => {
  const cache = storage();
  const input = {
    lastCalculatedAt: "2026-09-20T10:00:00.000Z",
    provisionalCandidates: [],
    sessionKey: "user-1:records-v1:America/New_York:06:00",
    taskEvidenceByRecordIdentity: { "parent_tasks_day:global:global": [{ entityKind: "parent", logicalDate: "2026-09-20", occurrenceDueOn: null, occurrenceIdentity: "occurrence-1", outcome: "done", sourceRowId: "history-1", taskId: "task-1", title: "Task 1" }] },
    warnings: ["warning"],
  } as never;
  assert.equal(writeRecordsLocalDetailCache(cache, input), true);
  const raw = cache.getItem(`adhdice:records:details:v2:${input.sessionKey}`);
  assert.ok(raw);
  const persisted = JSON.parse(raw);
  assert.equal(persisted.schemaVersion, 2);
  assert.deepEqual(persisted.taskEvidenceByRecordIdentity, input.taskEvidenceByRecordIdentity);
  assert.deepEqual(persisted.provisionalCandidates, input.provisionalCandidates);
  assert.ok(readRecordsLocalDetailCache(cache, input.sessionKey, input.lastCalculatedAt));
  assert.ok(readRecordsLocalDetailCache(cache, input.sessionKey, "2026-09-20T10:00:00.000+00:00"));
  assert.equal(readRecordsLocalDetailCache(cache, input.sessionKey, "2026-09-20T10:00:01.000Z"), null);
  assert.equal(readRecordsLocalDetailCache(cache, input.sessionKey, "2026-09-20T10:00:00.001Z"), null);
  assert.equal(readRecordsLocalDetailCache(cache, "user-2:records-v1:America/New_York:06:00", input.lastCalculatedAt), null);
  const legacyCache = storage({ [`adhdice:records:details:v1:${input.sessionKey}`]: JSON.stringify({ ...input, schemaVersion: 1, taskEvidenceByRecordIdentity: input.taskEvidenceByRecordIdentity }) });
  assert.equal(readRecordsLocalDetailCache(legacyCache, input.sessionKey, input.lastCalculatedAt), null);
  cache.setItem(`adhdice:records:details:v2:${input.sessionKey}`, JSON.stringify({ ...input, schemaVersion: 2, taskEvidenceByRecordIdentity: { malformed: 1 } }));
  assert.equal(readRecordsLocalDetailCache(cache, input.sessionKey, input.lastCalculatedAt), null);
});

test("rich detail cache never persists current Records or events", () => {
  const cache = storage();
  const input = {
    lastCalculatedAt: "2026-09-20T10:00:00.000Z",
    provisionalCandidates: [],
    sessionKey: "user-1:records-v1:America/New_York:06:00",
    taskEvidenceByRecordIdentity: {},
    warnings: [],
    currentRecords: [{ metric_key: "parent_tasks_day" }],
    events: [{ id: "event-1" }],
  } as never;
  assert.equal(writeRecordsLocalDetailCache(cache, input), true);
  const persisted = JSON.parse(cache.getItem(`adhdice:records:details:v2:${input.sessionKey}`)!);
  assert.equal(Object.hasOwn(persisted, "currentRecords"), false);
  assert.equal(Object.hasOwn(persisted, "events"), false);
});

test("rich detail cache retries an Evidence-only payload after the first write fails", () => {
  const cache = storage({}, { failWriteCount: 1 });
  const input = {
    lastCalculatedAt: "2026-09-20T10:00:00.000Z",
    provisionalCandidates: [{ candidateIdentity: "candidate" }],
    sessionKey: "user-1:records-v1:America/New_York:06:00",
    taskEvidenceByRecordIdentity: { "parent_tasks_day:global:global": [{ entityKind: "parent", logicalDate: "2026-09-20", occurrenceDueOn: null, outcome: "done", occurrenceIdentity: "occurrence-1", sourceRowId: "history-1", taskId: "task-1", title: "Task 1" }] },
    warnings: ["warning"],
  } as never;
  assert.equal(writeRecordsLocalDetailCache(cache, input), true);
  const persisted = JSON.parse(cache.getItem(`adhdice:records:details:v2:${input.sessionKey}`)!);
  assert.deepEqual(persisted.provisionalCandidates, []);
  const restored = readRecordsLocalDetailCache(cache, input.sessionKey, input.lastCalculatedAt);
  assert.deepEqual(restored?.taskEvidenceByRecordIdentity, input.taskEvidenceByRecordIdentity);
  assert.deepEqual(restored?.warnings, input.warnings);
});

test("failure of both rich detail cache writes remains non-fatal", () => {
  const cache = storage({}, { failWrite: true });
  const input = {
    lastCalculatedAt: "2026-09-20T10:00:00.000Z",
    provisionalCandidates: [],
    sessionKey: "user-1:records-v1:America/New_York:06:00",
    taskEvidenceByRecordIdentity: {},
    warnings: [],
  } as never;
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args) => warnings.push(args);
  try {
    assert.equal(writeRecordsLocalDetailCache(cache, input), false);
  } finally {
    console.warn = originalWarn;
  }
  if (process.env.NODE_ENV !== "production") {
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0]?.[0]), /full=.*reduced=.*quota exceeded/);
  }
});

test("missing or invalid rich detail cache keeps the missing-Evidence fallback", () => {
  const cache = storage();
  const sessionKey = "user-1:records-v1:America/New_York:06:00";
  assert.equal(readRecordsLocalDetailCache(cache, sessionKey, "2026-09-20T10:00:00.000Z"), null);
  assert.match(hook, /hasDetailedEvidence: false/);
  assert.match(hook, /taskEvidenceByRecordIdentity: \{\}/);
  assert.match(hook, /readRecordsLocalDetailCache\(getRecordsLocalStorage\(\), sessionKey, evaluatedAt\)/);
  assert.match(hook, /writeRecordsLocalDetailCache\(storage, \{[\s\S]*lastCalculatedAt: refreshResult\.evaluatedAt,[\s\S]*taskEvidenceByRecordIdentity: refreshResult\.taskEvidenceByRecordIdentity,[\s\S]*warnings: refreshResult\.warnings,[\s\S]*\}\)/);
  assert.doesNotMatch(hook, /writeRecordsLocalDetailCache\(storage, \{ \.\.\.refreshResult/);
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

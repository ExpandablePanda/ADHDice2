import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildRecordsSessionCacheKey,
  clearRecordsSessionCache,
  getRecordsSessionSnapshot,
  invalidateRecordsSessionSnapshotsForUser,
  setRecordsSessionSnapshot,
} from "../src/lib/records/session-cache.ts";
import {
  completeRecordsRefresh,
  restoreRecordsSessionSnapshot,
  retainRecordsAfterRefreshFailure,
  type RecordsInternalState,
} from "../src/hooks/useRecords.ts";

const hook = readFileSync(new URL("../src/hooks/useRecords.ts", import.meta.url), "utf8");
const recordsTab = readFileSync(new URL("../src/components/task-app/records-tab.tsx", import.meta.url), "utf8");
const taskApp = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

const baseState: RecordsInternalState = {
  currentRecords: [], error: null, events: [], hasSuccessfulResult: false, isLoading: false,
  isRecalculating: false, lastCalculatedAt: null, ownerUserId: null, progress: null,
  provisionalCandidates: [], sessionKey: null, setupRequired: false, taskEvidenceByRecordIdentity: {}, warnings: [],
};

const refresh = {
  currentRecords: [{ id: "current-record" }] as never[],
  evaluatedAt: "2026-09-19T12:00:00.000Z",
  events: [{ id: "event" }] as never[],
  provisionalCandidates: [{ candidateIdentity: "candidate" }] as never[],
  taskEvidenceByRecordIdentity: { "parent_tasks_week:global:global": [{ taskId: "recurring-task", sourceRowId: "occurrence-1" }] } as never,
  warnings: ["Past hard deletions cannot be reconstructed."],
};

test.afterEach(() => clearRecordsSessionCache());

test("cache keys scope user, rules version, timezone, and logical day start", () => {
  const key = buildRecordsSessionCacheKey({ logicalDayStart: "06:00", timezone: "America/New_York", userId: "user-1" });
  assert.equal(key, "user-1:records-v1:America/New_York:06:00");
  assert.notEqual(key, buildRecordsSessionCacheKey({ logicalDayStart: "06:00", timezone: "America/Los_Angeles", userId: "user-1" }));
  assert.notEqual(key, buildRecordsSessionCacheKey({ logicalDayStart: "04:00", timezone: "America/New_York", userId: "user-1" }));
  assert.notEqual(key, buildRecordsSessionCacheKey({ logicalDayStart: "06:00", timezone: "America/New_York", userId: "user-2" }));
  assert.notEqual(key, buildRecordsSessionCacheKey({ logicalDayStart: "06:00", rulesVersion: "records-v2", timezone: "America/New_York", userId: "user-1" }));
});

test("a successful refresh writes the complete UI snapshot and a matching remount can restore it", () => {
  const key = buildRecordsSessionCacheKey({ logicalDayStart: "06:00", timezone: "America/New_York", userId: "user-1" });
  assert.equal(getRecordsSessionSnapshot(key), null);
  setRecordsSessionSnapshot(key, refresh);
  const snapshot = getRecordsSessionSnapshot(key);
  assert.ok(snapshot);
  assert.equal(snapshot.hasSuccessfulResult, true);
  assert.deepEqual(snapshot.currentRecords, refresh.currentRecords);
  assert.deepEqual(snapshot.events, refresh.events);
  assert.deepEqual(snapshot.provisionalCandidates, refresh.provisionalCandidates);
  assert.deepEqual(snapshot.taskEvidenceByRecordIdentity, refresh.taskEvidenceByRecordIdentity);
  assert.deepEqual(snapshot.warnings, refresh.warnings);
  assert.equal(snapshot.lastCalculatedAt, refresh.evaluatedAt);

  const restored = restoreRecordsSessionSnapshot(baseState, { ownerUserId: "user-1", sessionKey: key, snapshot });
  assert.equal(restored.hasSuccessfulResult, true);
  assert.equal(restored.isLoading, false);
  assert.equal(restored.isRecalculating, false);
  assert.equal(restored.progress, null);
  assert.equal(restored.error, null);
  assert.deepEqual(restored.currentRecords, refresh.currentRecords);
});

test("the hook checks a matching snapshot before starting the pipeline, while first activation and explicit refresh bypass it", () => {
  const lookup = hook.indexOf("getRecordsSessionSnapshot(sessionKey)");
  const pipeline = hook.indexOf("runRecordsPipelineSingleFlight(sessionKey ?? userId");
  assert.ok(lookup >= 0 && lookup < pipeline);
  assert.match(hook, /if \(!explicitRefresh && cached\)/);
  assert.match(hook, /refreshRequestedRef\.current = true/);
  assert.match(hook, /if \(runningRef\.current \|\| !sessionKey\) return/);
});

test("successful refresh replaces the cache, while a failed refresh retains the last successful state and cache", () => {
  const key = buildRecordsSessionCacheKey({ logicalDayStart: "06:00", timezone: "America/New_York", userId: "user-1" });
  setRecordsSessionSnapshot(key, refresh);
  const replacement = { ...refresh, currentRecords: [{ id: "replacement" }] as never[], evaluatedAt: "2026-09-19T13:00:00.000Z" };
  setRecordsSessionSnapshot(key, replacement);
  assert.equal(getRecordsSessionSnapshot(key)?.currentRecords[0]?.id, "replacement");

  const successful = completeRecordsRefresh(baseState, { ...replacement, ownerUserId: "user-1", sessionKey: key });
  const failed = retainRecordsAfterRefreshFailure(successful, { error: "Records could not be recalculated.", ownerUserId: "user-1", setupRequired: false });
  assert.equal(failed.currentRecords[0]?.id, "replacement");
  assert.equal(failed.hasSuccessfulResult, true);
  assert.equal(getRecordsSessionSnapshot(key)?.currentRecords[0]?.id, "replacement");
});

test("tracking invalidation removes every current-user snapshot without touching another user", () => {
  const currentUserKey = buildRecordsSessionCacheKey({ logicalDayStart: "06:00", timezone: "America/New_York", userId: "user-1" });
  const currentUserOtherDayKey = buildRecordsSessionCacheKey({ logicalDayStart: "04:00", timezone: "America/New_York", userId: "user-1" });
  const otherUserKey = buildRecordsSessionCacheKey({ logicalDayStart: "06:00", timezone: "America/New_York", userId: "user-2" });
  setRecordsSessionSnapshot(currentUserKey, refresh);
  setRecordsSessionSnapshot(currentUserOtherDayKey, refresh);
  setRecordsSessionSnapshot(otherUserKey, refresh);

  invalidateRecordsSessionSnapshotsForUser("user-1");

  assert.equal(getRecordsSessionSnapshot(currentUserKey), null);
  assert.equal(getRecordsSessionSnapshot(currentUserOtherDayKey), null);
  assert.ok(getRecordsSessionSnapshot(otherUserKey));
});

test("restoration never brings back transient operation state", () => {
  const key = buildRecordsSessionCacheKey({ logicalDayStart: "06:00", timezone: "America/New_York", userId: "user-1" });
  setRecordsSessionSnapshot(key, refresh);
  const restored = restoreRecordsSessionSnapshot({
    ...baseState,
    error: "old error",
    isLoading: true,
    isRecalculating: true,
    progress: "Uploading Global Task records",
  }, { ownerUserId: "user-1", sessionKey: key, snapshot: getRecordsSessionSnapshot(key)! });
  assert.equal(restored.error, null);
  assert.equal(restored.isLoading, false);
  assert.equal(restored.isRecalculating, false);
  assert.equal(restored.progress, null);
});

test("Home deep-link and Record detail/task click-through remain on the Records projection", () => {
  assert.match(recordsTab, /initialMetricKey/);
  assert.match(recordsTab, /buildCurrentRecordCard\(record, records\.events, records\.taskEvidenceByRecordIdentity\)/);
  assert.match(recordsTab, /onOpenTask\(taskId\)/);
  assert.doesNotMatch(recordsTab, /runRecordsPipeline/);
  assert.match(hook, /latestSessionKeyRef\.current !== sessionKey/);
});

test("TaskApp owns successful tracking invalidation and Record Evidence only refreshes", () => {
  const mutationStart = taskApp.indexOf("const updateTaskTrackingExclusion");
  const mutationEnd = taskApp.indexOf("const runGuardedTaskRowUpdate", mutationStart);
  assert.ok(mutationStart >= 0 && mutationEnd > mutationStart);
  const mutation = taskApp.slice(mutationStart, mutationEnd);
  assert.match(mutation, /setTaskTrackingExclusionRpc\(client, taskId, excluded\)/);
  assert.match(mutation, /invalidateRecordsSessionSnapshotsForUser\(currentUserId\)/);
  assert.match(mutation, /setTasks\(nextTasks\)/);
  assert.match(mutation, /currentUserId/);
  assert.doesNotMatch(mutation, /records\.refresh/);
  assert.doesNotMatch(recordsTab, /invalidateRecordsSessionSnapshot/);
  assert.match(recordsTab, /setDetailRecord\(null\);[\s\S]*records\.refresh\(\);/);
});

test("session cache is memory-only and does not alter persisted evidence or SQL", () => {
  const cache = readFileSync(new URL("../src/lib/records/session-cache.ts", import.meta.url), "utf8");
  assert.doesNotMatch(cache, /localStorage|sessionStorage|indexedDB|supabase|\.sql/);
  assert.doesNotMatch(cache, /sourceRows|identities/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFocusRuntimeRealtimeRow,
  getAuthoritativeFocusElapsedSeconds,
  getAuthoritativeFocusRemainingSeconds,
  isCurrentFocusRuntimeSnapshotRequest,
  isNewerFocusRuntimeSnapshot,
  mapFocusRuntimeRows,
  reconcileFocusRuntimeSnapshot,
  removeFocusRuntimeFromSessions,
} from "@/lib/focus-runtime";

const row = {
  session_id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  runtime_kind: "category" as const,
  category_id: "33333333-3333-4333-8333-333333333333",
  mode: "countdown" as const,
  countdown_target_seconds: 600,
  state: "running" as const,
  current_run_started_at: "2026-07-14T12:00:00.000Z",
  accumulated_seconds: 120,
  revision: 4,
  closed_at: null,
  close_reason: null,
  created_at: "2026-07-14T11:00:00.000Z",
  updated_at: "2026-07-14T12:00:00.000Z",
};

test("authoritative runtime rows retain identity, mode, timing, and revision", () => {
  const mapped = mapFocusRuntimeRows([row])[row.category_id]!;
  assert.equal(mapped.sessionId, row.session_id);
  assert.equal(mapped.mode, "countdown");
  assert.equal(mapped.countdownTargetSeconds, 600);
  assert.equal(mapped.revision, 4);
  assert.equal(getAuthoritativeFocusElapsedSeconds(mapped, Date.parse("2026-07-14T12:01:00.000Z")), 180);
  assert.equal(getAuthoritativeFocusRemainingSeconds(mapped, Date.parse("2026-07-14T12:01:00.000Z")), 420);
});

test("standalone countdown maps to the existing hidden UI slot", () => {
  const mapped = mapFocusRuntimeRows([{ ...row, runtime_kind: "standalone_countdown", category_id: null }]);
  assert.equal(mapped.__adhdice_system_countdown__?.sessionId, row.session_id);
});

test("older hydration cannot replace a newer revision", () => {
  assert.equal(isNewerFocusRuntimeSnapshot({ revision: 3, updatedAt: row.updated_at }, { revision: 4, updatedAt: row.updated_at }), false);
  assert.equal(isNewerFocusRuntimeSnapshot({ revision: 5, updatedAt: row.updated_at }, { revision: 4, updatedAt: row.updated_at }), true);
});

test("countdown remaining time never becomes negative", () => {
  const mapped = mapFocusRuntimeRows([row])[row.category_id]!;
  assert.equal(getAuthoritativeFocusRemainingSeconds(mapped, Date.parse("2026-07-14T12:20:00.000Z")), 0);
});

test("Realtime DELETE removes only the matching stable runtime session", () => {
  const other = { ...row, session_id: "44444444-4444-4444-8444-444444444444", category_id: "55555555-5555-4555-8555-555555555555" };
  const sessions = mapFocusRuntimeRows([row, other]);
  const next = removeFocusRuntimeFromSessions(sessions, { session_id: row.session_id });
  assert.equal(next[row.category_id], undefined);
  assert.equal(next[other.category_id]?.sessionId, other.session_id);
  assert.deepEqual(removeFocusRuntimeFromSessions(next, { session_id: row.session_id }), next);
});

test("legacy DELETE slot fallback and standalone DELETE remove only their intended runtime", () => {
  const standalone = { ...row, session_id: "66666666-6666-4666-8666-666666666666", runtime_kind: "standalone_countdown" as const, category_id: null };
  const sessions = mapFocusRuntimeRows([row, standalone]);
  const categoryRemoved = removeFocusRuntimeFromSessions(sessions, { category_id: row.category_id });
  assert.equal(categoryRemoved[row.category_id], undefined);
  assert.equal(categoryRemoved.__adhdice_system_countdown__?.sessionId, standalone.session_id);
  const standaloneRemoved = removeFocusRuntimeFromSessions(sessions, { runtime_kind: "standalone_countdown" });
  assert.equal(standaloneRemoved.__adhdice_system_countdown__, undefined);
  assert.equal(standaloneRemoved[row.category_id]?.sessionId, row.session_id);
});

test("authoritative snapshots replace stale local runtimes, including empty snapshots", () => {
  const stale = { ...row, session_id: "77777777-7777-4777-8777-777777777777", category_id: "88888888-8888-4888-8888-888888888888" };
  const local = mapFocusRuntimeRows([row, stale]);
  const refreshed = reconcileFocusRuntimeSnapshot([row]);
  assert.equal(refreshed[row.category_id]?.sessionId, local[row.category_id]?.sessionId);
  assert.equal(refreshed[stale.category_id], undefined);
  assert.deepEqual(reconcileFocusRuntimeSnapshot([]), {});
});

test("a newer DELETE generation prevents an older hydration response from resurrecting a runtime", () => {
  const hydrationGeneration = 10;
  const afterDeleteGeneration = 11;
  assert.equal(isCurrentFocusRuntimeSnapshotRequest(hydrationGeneration, afterDeleteGeneration), false);
  assert.equal(isCurrentFocusRuntimeSnapshotRequest(afterDeleteGeneration, afterDeleteGeneration), true);
});

test("legacy hard-delete payloads still converge during deployment compatibility", () => {
  const desktop = mapFocusRuntimeRows([row]);
  const mobile = mapFocusRuntimeRows([row]);
  const server = removeFocusRuntimeFromSessions(desktop, { session_id: row.session_id });
  const mobileAfterDelete = removeFocusRuntimeFromSessions(mobile, { session_id: row.session_id });
  assert.deepEqual(server, {});
  assert.deepEqual(mobileAfterDelete, server);
});

test("closed Realtime UPDATE removes only the matching category runtime", () => {
  const other = { ...row, session_id: "44444444-4444-4444-8444-444444444444", category_id: "55555555-5555-4555-8555-555555555555" };
  const sessions = mapFocusRuntimeRows([row, other]);
  const tombstones = new Map<string, number>();
  const next = applyFocusRuntimeRealtimeRow(sessions, {
    ...row,
    state: "paused",
    current_run_started_at: null,
    revision: 5,
    closed_at: "2026-07-14T12:02:00.000Z",
    close_reason: "reset",
    updated_at: "2026-07-14T12:02:00.000Z",
  }, tombstones);
  assert.equal(next[row.category_id], undefined);
  assert.equal(next[other.category_id]?.sessionId, other.session_id);
  assert.equal(tombstones.get(row.session_id), 5);
});

test("standalone closed UPDATE removes only the standalone runtime", () => {
  const standalone = { ...row, session_id: "66666666-6666-4666-8666-666666666666", runtime_kind: "standalone_countdown" as const, category_id: null };
  const sessions = mapFocusRuntimeRows([row, standalone]);
  const next = applyFocusRuntimeRealtimeRow(sessions, {
    ...standalone,
    revision: 5,
    closed_at: "2026-07-14T12:02:00.000Z",
    close_reason: "stopped",
  }, new Map());
  assert.equal(next.__adhdice_system_countdown__, undefined);
  assert.equal(next[row.category_id]?.sessionId, row.session_id);
});

test("closed rows never hydrate as active and empty/open snapshots still reconcile", () => {
  const closed = { ...row, revision: 5, closed_at: "2026-07-14T12:02:00.000Z", close_reason: "completed" as const };
  assert.deepEqual(reconcileFocusRuntimeSnapshot([closed]), {});
  assert.deepEqual(reconcileFocusRuntimeSnapshot([]), {});
  assert.equal(reconcileFocusRuntimeSnapshot([row])[row.category_id]?.sessionId, row.session_id);
});

test("a closed tombstone rejects older open UPDATEs but permits a new session in the slot", () => {
  const tombstones = new Map<string, number>();
  const closed = { ...row, revision: 5, closed_at: "2026-07-14T12:02:00.000Z", close_reason: "reset" as const };
  const afterClose = applyFocusRuntimeRealtimeRow(mapFocusRuntimeRows([row]), closed, tombstones);
  const afterOlderUpdate = applyFocusRuntimeRealtimeRow(afterClose, { ...row, revision: 4 }, tombstones);
  assert.deepEqual(afterOlderUpdate, {});
  const replacement = { ...row, session_id: "99999999-9999-4999-8999-999999999999", revision: 1 };
  assert.equal(applyFocusRuntimeRealtimeRow(afterOlderUpdate, replacement, tombstones)[row.category_id]?.sessionId, replacement.session_id);
});

test("pause and resume UPDATEs remain revision-ordered live synchronization", () => {
  const tombstones = new Map<string, number>();
  const paused = { ...row, state: "paused" as const, current_run_started_at: null, accumulated_seconds: 180, revision: 5 };
  const afterPause = applyFocusRuntimeRealtimeRow(mapFocusRuntimeRows([row]), paused, tombstones);
  assert.equal(afterPause[row.category_id]?.isRunning, false);
  const resumed = { ...paused, state: "running" as const, current_run_started_at: "2026-07-14T12:03:00.000Z", revision: 6 };
  assert.equal(applyFocusRuntimeRealtimeRow(afterPause, resumed, tombstones)[row.category_id]?.isRunning, true);
});

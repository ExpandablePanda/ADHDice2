import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("simulated cross-device reset converges through an authoritative DELETE", () => {
  const desktop = mapFocusRuntimeRows([row]);
  const mobile = mapFocusRuntimeRows([row]);
  const server = removeFocusRuntimeFromSessions(desktop, { session_id: row.session_id });
  const mobileAfterDelete = removeFocusRuntimeFromSessions(mobile, { session_id: row.session_id });
  assert.deepEqual(server, {});
  assert.deepEqual(mobileAfterDelete, server);
});

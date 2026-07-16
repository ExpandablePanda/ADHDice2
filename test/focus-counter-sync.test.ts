import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAuthoritativeFocusCounterEvent,
  applyAuthoritativeFocusCounterRow,
  buildLegacyFocusCounterSnapshot,
  getFocusCounterBackupStorageKey,
  isCurrentFocusCounterSnapshotRequest,
  reconcileFocusCounterHistorySnapshot,
  reconcileFocusCounterSnapshot,
  shouldNotifyFocusCounterMigrationDivergence,
  type FocusCounterEventRow,
  type FocusCounterRow,
} from "@/lib/focus-counter-sync";

const userId = "22222222-2222-4222-8222-222222222222";
const counterId = "11111111-1111-4111-8111-111111111111";

function counter(overrides: Partial<FocusCounterRow> = {}): FocusCounterRow {
  return {
    id: counterId,
    user_id: userId,
    title: "Water",
    color: "#123456",
    icon: "GlassWater",
    value: 4,
    step: 2,
    goal: 10,
    sort_order: 0,
    revision: 1,
    deleted_at: null,
    created_at: "2026-07-14T12:00:00.000Z",
    updated_at: "2026-07-14T12:00:00.000Z",
    ...overrides,
  };
}

function event(overrides: Partial<FocusCounterEventRow> = {}): FocusCounterEventRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    operation_id: "44444444-4444-4444-8444-444444444444",
    user_id: userId,
    counter_id: counterId,
    event_type: "adjust",
    delta: 2,
    previous_value: 4,
    next_value: 6,
    title_snapshot: "Water",
    step_snapshot: 2,
    payload: null,
    client_created_at: null,
    created_at: "2026-07-14T12:01:00.000Z",
    ...overrides,
  };
}

test("authoritative full and empty snapshots preserve server order and clear stale counters", () => {
  const rows = [counter({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sort_order: 2 }), counter({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sort_order: 1 })];
  assert.deepEqual(reconcileFocusCounterSnapshot(rows).map((item) => item.id), ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]);
  assert.deepEqual(reconcileFocusCounterSnapshot([]), []);
});

test("create and metadata/value updates converge from authoritative rows", () => {
  const created = reconcileFocusCounterSnapshot([counter()]);
  const renamed = applyAuthoritativeFocusCounterRow(created, counter({ title: "Tea", color: "#abcdef", icon: "CupSoda", step: 3, goal: 12, value: -2, revision: 2 }));
  assert.deepEqual(renamed[0], { ...created[0], title: "Tea", color: "#abcdef", icon: "CupSoda", step: 3, goal: 12, value: -2, revision: 2 });
});

test("older Realtime rows and fetch generations cannot overwrite newer state", () => {
  const current = reconcileFocusCounterSnapshot([counter({ value: 8, revision: 4 })]);
  assert.deepEqual(applyAuthoritativeFocusCounterRow(current, counter({ value: 2, revision: 3 })), current);
  assert.equal(isCurrentFocusCounterSnapshotRequest(7, 8), false);
  assert.equal(isCurrentFocusCounterSnapshotRequest(8, 8), true);
});

test("soft delete hides the counter while durable history remains", () => {
  const counters = reconcileFocusCounterSnapshot([counter()]);
  const history = reconcileFocusCounterHistorySnapshot([event()]);
  assert.deepEqual(applyAuthoritativeFocusCounterRow(counters, counter({ deleted_at: "2026-07-14T12:02:00.000Z", revision: 2 })), []);
  assert.deepEqual(history, reconcileFocusCounterHistorySnapshot([event()]));
});

test("increment, decrement, and absolute edits retain server snapshots", () => {
  let history = applyAuthoritativeFocusCounterEvent([], event());
  history = applyAuthoritativeFocusCounterEvent(history, event({
    id: "55555555-5555-4555-8555-555555555555",
    operation_id: "66666666-6666-4666-8666-666666666666",
    event_type: "adjust",
    delta: -2,
    previous_value: 6,
    next_value: 4,
    created_at: "2026-07-14T12:02:00.000Z",
  }));
  history = applyAuthoritativeFocusCounterEvent(history, event({
    id: "77777777-7777-4777-8777-777777777777",
    operation_id: "88888888-8888-4888-8888-888888888888",
    event_type: "set_value",
    delta: -9,
    previous_value: 4,
    next_value: -5,
    created_at: "2026-07-14T12:03:00.000Z",
  }));
  assert.deepEqual(history.map((item) => [item.eventType, item.delta, item.nextValue]), [["set_value", -9, -5], ["adjust", -2, 4], ["adjust", 2, 6]]);
});

test("duplicate event delivery is idempotent", () => {
  const once = applyAuthoritativeFocusCounterEvent([], event());
  const twice = applyAuthoritativeFocusCounterEvent(once, event());
  assert.deepEqual(twice, once);
});

test("legacy snapshot preserves values, negative values, history, and array order", () => {
  const legacyCounters = reconcileFocusCounterSnapshot([
    counter({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", value: -3, sort_order: 0 }),
    counter({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Same title", sort_order: 1 }),
  ]);
  const legacyHistory = reconcileFocusCounterHistorySnapshot([event({ counter_id: legacyCounters[0]!.id })]);
  const snapshot = buildLegacyFocusCounterSnapshot(legacyCounters, legacyHistory);
  assert.deepEqual(snapshot.counters.map((item) => [item.legacyId, item.value]), [[legacyCounters[0]!.id, -3], [legacyCounters[1]!.id, 4]]);
  assert.equal(snapshot.history[0]!.legacyCounterId, legacyCounters[0]!.id);
});

test("divergent-device backups are versioned by user and migration batch", () => {
  assert.notEqual(getFocusCounterBackupStorageKey(userId, "batch-a"), getFocusCounterBackupStorageKey(userId, "batch-b"));
  assert.match(getFocusCounterBackupStorageKey(userId, "batch-a"), new RegExp(userId));
});

test("fresh divergent migrations notify once while replayed results hydrate silently", () => {
  assert.equal(shouldNotifyFocusCounterMigrationDivergence({ local_differed: true, was_replayed: false }), true);
  assert.equal(shouldNotifyFocusCounterMigrationDivergence({ local_differed: true, was_replayed: true }), false);
  assert.equal(shouldNotifyFocusCounterMigrationDivergence({ local_differed: false, was_replayed: false }), false);
});

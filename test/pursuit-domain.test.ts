import assert from "node:assert/strict";
import test from "node:test";
import type { Pursuit, PursuitActivity } from "@/lib/database.types";
import {
  buildPursuitAttentionMap,
  canSetPursuitParent,
  derivePursuitAttention,
  sortPursuitsByAttention,
} from "@/lib/pursuit-domain";

const CONTEXT = {
  dayStartTime: "06:00",
  now: "2026-09-10T16:00:00.000Z",
  timezone: "America/New_York",
  todayKey: "2026-09-10",
};

function pursuit(overrides: Partial<Pursuit> = {}): Pursuit {
  return {
    id: "pursuit-1",
    user_id: "user-1",
    parent_pursuit_id: null,
    title: "Guitar",
    notes: null,
    status: "active",
    revisit_interval_days: null,
    sort_order: 0,
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

function activity(overrides: Partial<PursuitActivity> = {}): PursuitActivity {
  return {
    id: "activity-1",
    user_id: "user-1",
    pursuit_id: "pursuit-1",
    occurred_at: "2026-09-08T12:00:00.000Z",
    duration_seconds: null,
    notes: null,
    created_at: "2026-09-08T12:00:00.000Z",
    updated_at: "2026-09-08T12:00:00.000Z",
    ...overrides,
  };
}

test("Pursuit without a target never needs attention", () => {
  const result = derivePursuitAttention(pursuit(), [], CONTEXT);
  assert.equal(result.needsAttention, false);
  assert.equal(result.attentionRatio, null);
});

test("never-logged Pursuit uses creation date as its baseline", () => {
  const result = derivePursuitAttention(pursuit({ revisit_interval_days: 5 }), [], CONTEXT);
  assert.equal(result.baselineKind, "created");
  assert.equal(result.daysSinceBaseline, 9);
  assert.equal(result.needsAttention, true);
});

test("a target interval is not exceeded at the exact target day", () => {
  const result = derivePursuitAttention(
    pursuit({ created_at: "2026-09-05T12:00:00.000Z", revisit_interval_days: 5 }),
    [],
    CONTEXT,
  );
  assert.equal(result.daysSinceBaseline, 5);
  assert.equal(result.needsAttention, false);
});

test("a target interval is exceeded only after the target day", () => {
  const result = derivePursuitAttention(pursuit({ revisit_interval_days: 5 }), [], CONTEXT);
  assert.equal(result.needsAttention, true);
  assert.equal(result.attentionRatio, 1.8);
});

test("paused and archived Pursuits never surface as attention", () => {
  for (const status of ["paused", "archived"] as const) {
    const result = derivePursuitAttention(pursuit({ revisit_interval_days: 1, status }), [], CONTEXT);
    assert.equal(result.needsAttention, false);
  }
});

test("attention ordering is deterministic by ratio, then title, then id", () => {
  const rows = sortPursuitsByAttention([
    derivePursuitAttention(pursuit({ id: "b", title: "Piano", revisit_interval_days: 3 }), [], CONTEXT),
    derivePursuitAttention(pursuit({ id: "a", title: "Guitar", revisit_interval_days: 5 }), [], CONTEXT),
  ]);
  assert.deepEqual(rows.map((row) => row.pursuit.id), ["b", "a"]);
});

test("activity updates last activity, logical recency, and session count", () => {
  const result = derivePursuitAttention(
    pursuit({ revisit_interval_days: 3 }),
    [
      activity({ id: "old", occurred_at: "2026-09-01T12:00:00.000Z" }),
      activity({ id: "new", occurred_at: "2026-09-07T12:00:00.000Z" }),
    ],
    CONTEXT,
  );
  assert.equal(result.lastActivityAt, "2026-09-07T12:00:00.000Z");
  assert.equal(result.activityCount, 2);
  assert.equal(result.daysSinceBaseline, 3);
  assert.equal(result.needsAttention, false);
});

test("self-parenting and cyclic Pursuit hierarchy changes are rejected", () => {
  const parent = pursuit({ id: "parent", title: "Guitar" });
  const child = pursuit({ id: "child", title: "Technique", parent_pursuit_id: "parent" });
  const pursuits = [parent, child];
  assert.equal(canSetPursuitParent(pursuits, "parent", "parent"), false);
  assert.equal(canSetPursuitParent(pursuits, "parent", "child"), false);
  assert.equal(canSetPursuitParent(pursuits, "child", null), true);
});

test("attention map derives independent rows for each Pursuit", () => {
  const rows = buildPursuitAttentionMap(
    [pursuit({ id: "one", revisit_interval_days: 1 }), pursuit({ id: "two", revisit_interval_days: null })],
    [activity({ id: "one-activity", pursuit_id: "one" })],
    CONTEXT,
  );
  assert.equal(rows.get("one")?.activityCount, 1);
  assert.equal(rows.get("two")?.activityCount, 0);
  assert.equal(rows.get("two")?.needsAttention, false);
});

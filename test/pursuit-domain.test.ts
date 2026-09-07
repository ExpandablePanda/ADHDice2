import assert from "node:assert/strict";
import test from "node:test";
import type { Pursuit, PursuitActivity, Task } from "@/lib/database.types";
import {
  buildPursuitAttentionMap,
  buildPursuitWorkspaceIndex,
  canSetPursuitParent,
  derivePursuitCompletionSummary,
  derivePursuitNextTargetLogicalDay,
  derivePursuitAttention,
  filterPursuitsForTaskWorkspace,
  filterPursuitsByTitle,
  formatPursuitLastCompletion,
  formatPursuitAttentionReason,
  formatPursuitTargetLabel,
  getPursuitLogicalDay,
  getPursuitSearchContextTaskIds,
  getPursuitTimestampForLogicalDay,
  mergeTaskRowsWithPursuitSearchContext,
  shouldRenderTaskPursuitChildren,
  sortPursuitsByAttention,
  validatePursuitParentSelection,
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
    parent_task_id: null,
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

test("next target is absent without a revisit interval", () => {
  const result = derivePursuitAttention(pursuit(), [], CONTEXT);
  assert.equal(result.nextTargetLogicalDay, null);
});

test("never-completed Pursuits derive their target from the creation logical day", () => {
  const target = derivePursuitNextTargetLogicalDay(
    pursuit({ created_at: "2026-09-05T09:30:00.000Z", revisit_interval_days: 5 }),
    { lastCompletedLogicalDay: null },
    CONTEXT,
  );
  assert.equal(target, "2026-09-09");
});

test("completed Pursuits derive their target from the last completed logical day", () => {
  const target = derivePursuitNextTargetLogicalDay(
    pursuit({ revisit_interval_days: 7 }),
    { lastCompletedLogicalDay: "2026-09-08" },
    CONTEXT,
  );
  assert.equal(target, "2026-09-15");
});

test("target labels distinguish today, future, and past logical days", () => {
  assert.equal(formatPursuitTargetLabel("2026-09-10", "2026-09-10", CONTEXT.timezone), "Target Sep 10");
  assert.equal(formatPursuitTargetLabel("2026-09-14", "2026-09-10", CONTEXT.timezone), "Target in 4d");
  assert.equal(formatPursuitTargetLabel("2026-09-08", "2026-09-10", CONTEXT.timezone), "Target Sep 8");
});

test("target presentation preserves the logical day across timezone offsets", () => {
  assert.equal(formatPursuitTargetLabel("2026-09-10", "2026-09-10", "Pacific/Kiritimati"), "Target Sep 10");
  assert.equal(formatPursuitTargetLabel("2026-09-08", "2026-09-10", "Pacific/Pago_Pago"), "Target Sep 8");
  const attention = derivePursuitAttention(pursuit({ revisit_interval_days: 5 }), [], CONTEXT);
  assert.equal(formatPursuitAttentionReason(attention, CONTEXT.timezone), "Target Sep 6 · 4 days past target");
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

test("Pursuit parent validation keeps parent kinds mutually exclusive and task-owned", () => {
  const pursuits = [pursuit({ id: "root" })];
  assert.equal(
    validatePursuitParentSelection(pursuits, "child", "root", "task-1", new Set(["task-1"])),
    "A Pursuit can have a Pursuit parent or a Task parent, not both.",
  );
  assert.equal(
    validatePursuitParentSelection(pursuits, "child", null, "other-user-task", new Set(["task-1"])),
    "That Task parent does not belong to this user or no longer exists.",
  );
  assert.equal(validatePursuitParentSelection(pursuits, "child", null, "task-1", new Set(["task-1"])), null);
});

test("mixed Pursuit workspace rows preserve Task parents and recursive Pursuit descendants", () => {
  const rows = buildPursuitWorkspaceIndex([
    pursuit({ id: "top", title: "Guitar" }),
    pursuit({ id: "top-child", title: "Technique", parent_pursuit_id: "top" }),
    pursuit({ id: "task-child", title: "Improve technique", parent_task_id: "task-1" }),
    pursuit({ id: "task-grandchild", title: "Breath control", parent_pursuit_id: "task-child" }),
  ]);
  assert.deepEqual(rows.topLevel.map((row) => [row.pursuit.id, row.depth]), [["top", 0], ["top-child", 1]]);
  assert.deepEqual(rows.byTaskId.get("task-1")?.map((row) => [row.pursuit.id, row.depth]), [["task-child", 0], ["task-grandchild", 1]]);
});

test("Pursuit title search keeps matching rows and their Pursuit ancestors", () => {
  const results = filterPursuitsByTitle([
    pursuit({ id: "root", title: "Guitar" }),
    pursuit({ id: "child", title: "Fingerstyle", parent_pursuit_id: "root" }),
    pursuit({ id: "other", title: "Piano" }),
  ], "finger");
  assert.deepEqual(results.map((entry) => entry.id), ["root", "child"]);
});

test("Pursuit title search preserves the minimum owning Task context without matching the Task", () => {
  const results = [
    pursuit({ id: "task-root", title: "Improve Vocal Technique", parent_task_id: "task-1" }),
    pursuit({ id: "task-child", title: "Breath control", parent_pursuit_id: "task-root" }),
    pursuit({ id: "other-task", title: "Piano practice", parent_task_id: "task-2" }),
  ];

  assert.deepEqual(getPursuitSearchContextTaskIds(results, "vocal"), ["task-1"]);
  assert.deepEqual(
    mergeTaskRowsWithPursuitSearchContext(
      [{ id: "task-2" } as Task],
      [{ id: "task-1" } as Task],
    ).map((task) => task.id),
    ["task-2", "task-1"],
  );
});

test("Task disclosure controls Task-owned Pursuit children while preserving recursive rows", () => {
  const rows = buildPursuitWorkspaceIndex([
    pursuit({ id: "task-root", parent_task_id: "task-1" }),
    pursuit({ id: "task-child", parent_pursuit_id: "task-root" }),
  ]).byTaskId.get("task-1") ?? [];

  assert.equal(shouldRenderTaskPursuitChildren(false, rows), false);
  assert.equal(shouldRenderTaskPursuitChildren(true, rows), true);
  assert.deepEqual(rows.map((row) => row.pursuit.id), ["task-root", "task-child"]);
});

test("a direct Task match preserves all Task-owned Pursuit descendants as context", () => {
  const results = filterPursuitsForTaskWorkspace([
    pursuit({ id: "root", title: "Improve guitar", parent_task_id: "task-1" }),
    pursuit({ id: "child", title: "Fingerstyle", parent_pursuit_id: "root" }),
    pursuit({ id: "grandchild", title: "Arpeggios", parent_pursuit_id: "child" }),
    pursuit({ id: "other", title: "Piano", parent_task_id: "task-2" }),
  ], "record demo", new Set(["task-1"]));
  assert.deepEqual(results.map((entry) => entry.id), ["root", "child", "grandchild"]);
});

function activityOn(logicalDay: string, id: string) {
  return activity({
    id,
    occurred_at: `${logicalDay}T12:00:00.000Z`,
    created_at: `${logicalDay}T12:00:00.000Z`,
    updated_at: `${logicalDay}T12:00:00.000Z`,
  });
}

test("Pursuit completion summary counts unique logical days and derives streaks", () => {
  const summary = derivePursuitCompletionSummary([
    activityOn("2026-09-08", "old"),
    activityOn("2026-09-09", "yesterday"),
    activityOn("2026-09-10", "today-1"),
    activityOn("2026-09-10", "today-2"),
    activityOn("2026-09-11", "future"),
  ], CONTEXT);
  assert.equal(summary.lastCompletedLogicalDay, "2026-09-10");
  assert.equal(summary.completedToday, true);
  assert.equal(summary.currentStreak, 3);
  assert.equal(summary.bestStreak, 3);
  assert.equal(summary.totalCompletedDays, 3);
  assert.deepEqual(summary.completedLogicalDays, ["2026-09-08", "2026-09-09", "2026-09-10"]);
  assert.equal(formatPursuitLastCompletion(summary), "Done today");
});

test("Pursuit streaks break across missing logical days and never use creation as completion", () => {
  const summary = derivePursuitCompletionSummary([
    activityOn("2026-09-05", "first"),
    activityOn("2026-09-06", "second"),
    activityOn("2026-09-08", "third"),
  ], CONTEXT);
  assert.equal(summary.currentStreak, 0);
  assert.equal(summary.bestStreak, 2);
  assert.equal(summary.daysSinceCompletion, 2);
  assert.equal(formatPursuitLastCompletion(summary), "Last done 2 days ago");
  const never = derivePursuitCompletionSummary([], CONTEXT);
  assert.equal(never.lastCompletedLogicalDay, null);
  assert.equal(never.daysSinceCompletion, null);
  assert.equal(formatPursuitLastCompletion(never), "Never done");
});

test("Pursuit completion correction timestamps round-trip through the logical day", () => {
  const timestamp = getPursuitTimestampForLogicalDay("2026-09-09", CONTEXT);
  assert.equal(getPursuitLogicalDay(timestamp, CONTEXT), "2026-09-09");
  assert.equal(getPursuitLogicalDay("2026-09-11T09:30:00.000Z", CONTEXT), "2026-09-10");
  assert.equal(getPursuitLogicalDay("2026-09-11T10:01:00.000Z", CONTEXT), "2026-09-11");
});

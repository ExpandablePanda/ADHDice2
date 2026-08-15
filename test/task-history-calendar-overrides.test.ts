import assert from "node:assert/strict";
import test from "node:test";

import { buildManualTaskHistoryOverrideOccurrenceMetadata } from "../src/lib/task-history.ts";
import { computeTaskEffectiveTimelineStreaks, resolveTaskHistoryCalendarRead } from "../src/lib/task-state-engine/index.ts";
import { createTask } from "../src/lib/task-buckets.ts";

const recurringTask = {
  id: "task-1",
  repeat_frequency: "daily" as const,
};

test("new recurring calculated date gets selected-date occurrence metadata", () => {
  assert.deepEqual(
    buildManualTaskHistoryOverrideOccurrenceMetadata(recurringTask, "2026-08-03", null),
    {
      occurrence_due_on: "2026-08-03",
      occurrence_key: "task:task-1:occurrence:2026-08-03",
    },
  );
});

test("existing History occurrence metadata is preserved exactly", () => {
  assert.deepEqual(
    buildManualTaskHistoryOverrideOccurrenceMetadata(recurringTask, "2026-08-03", {
      occurrence_due_on: "2026-08-01",
      occurrence_key: "task:task-1:occurrence:2026-08-01",
    }),
    {
      occurrence_due_on: "2026-08-01",
      occurrence_key: "task:task-1:occurrence:2026-08-01",
    },
  );
});

test("No Repeat override metadata does not invent a recurring identity", () => {
  assert.deepEqual(
    buildManualTaskHistoryOverrideOccurrenceMetadata({
      id: "task-1",
      repeat_frequency: "none",
    }, "2026-08-03", null),
    {
      occurrence_due_on: null,
      occurrence_key: null,
    },
  );
});

test("saved Not Due Calendar override is read back into the Effective Timeline", () => {
  const task = createTask({
    created_at: "2026-08-01T12:00:00.000Z",
    due_on: "2026-08-01",
    id: "task-1",
    repeat_frequency: "daily",
    repeat_interval: 1,
    status: "pending",
    title: "Override read",
  });
  const result = resolveTaskHistoryCalendarRead({
    calendarEnd: "2026-08-10",
    calendarOverrides: [{ id: "override-1", logicalDate: "2026-08-05", overrideState: "not_due" }],
    calendarStart: "2026-08-01",
    history: [],
    logicalDayRollover: "00:00",
    now: "2026-08-10T12:00:00.000Z",
    task,
    timezone: "UTC",
  });

  assert.equal(result?.timeline?.days["2026-08-05"]?.state, "not_due");
  assert.equal(result?.timeline?.days["2026-08-05"]?.calendarOverrideId, "override-1");
});

test("Task History read stats recalculate Current and Longest Missed Streak after active Not Due", () => {
  const task = createTask({
    created_at: "2026-08-01T12:00:00.000Z",
    due_on: "2026-08-10",
    id: "task-streak-override",
    repeat_frequency: "daily",
    repeat_interval: 1,
    status: "pending",
    title: "Updates",
  });
  const input = {
    calendarEnd: "2026-08-14",
    calendarStart: "2026-08-10",
    history: [],
    logicalDayRollover: "00:00",
    now: "2026-08-14T12:00:00.000Z",
    task,
    timezone: "UTC",
  };
  const before = resolveTaskHistoryCalendarRead(input);
  const after = resolveTaskHistoryCalendarRead({
    ...input,
    calendarOverrides: [{ id: "override-12", logicalDate: "2026-08-12", overrideState: "not_due" }],
  });
  const displayedStats = computeTaskEffectiveTimelineStreaks(after?.timeline?.days ?? {}, "2026-08-14");

  assert.equal(before?.states["2026-08-12"], "missed");
  assert.equal(before?.timeline?.currentMissedStreak, 4);
  assert.equal(before?.timeline?.longestMissedStreak, 4);
  assert.equal(after?.states["2026-08-12"], "not_due");
  assert.equal(displayedStats.currentMissedStreak, 1);
  assert.equal(displayedStats.longestMissedStreak, 2);
  assert.equal(after?.states["2026-08-14"], "open");
});

test("Updates regression: manual Not Due at 8/9 ends the older missed run", () => {
  const task = createTask({
    created_at: "2026-08-01T12:00:00.000Z",
    due_on: "2026-07-20",
    id: "task-updates",
    repeat_frequency: "daily",
    repeat_interval: 1,
    status: "pending",
    title: "Updates",
  });
  const input = {
    calendarEnd: "2026-08-14",
    calendarStart: "2026-07-20",
    history: [],
    logicalDayRollover: "00:00",
    now: "2026-08-14T12:00:00.000Z",
    task,
    timezone: "UTC",
  };
  const before = resolveTaskHistoryCalendarRead(input);
  const result = resolveTaskHistoryCalendarRead({
    ...input,
    calendarOverrides: [{ id: "override-09", logicalDate: "2026-08-09", overrideState: "not_due" }],
  });
  const streaks = computeTaskEffectiveTimelineStreaks(result?.timeline?.days ?? {}, "2026-08-14");

  assert.ok((before?.timeline?.currentMissedStreak ?? 0) > 4);
  assert.equal(result?.timeline?.days["2026-08-08"]?.state, "missed");
  assert.equal(result?.timeline?.days["2026-08-09"]?.state, "not_due");
  assert.equal(result?.timeline?.days["2026-08-09"]?.calendarOverrideId, "override-09");
  assert.equal(streaks.currentMissedStreak, 4);
  assert.equal(streaks.longestMissedStreak, 20);
});

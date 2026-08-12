import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "../src/lib/database.types.ts";
import { projectTaskWithCanonicalScheduleBoundary } from "../src/lib/task-state-canonical/schedule-projection.ts";
import type { CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";

test("latest canonical schedule boundary drives the visible repeat projection", () => {
  const task = {
    id: "task-1",
    due_on: "2026-08-11",
    due_time: null,
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
  } as unknown as Task;
  const boundary = {
    schedule_model: "fixed",
    repeat_frequency: "weekly",
    repeat_interval: 1,
    repeat_days_of_week: [2, 4],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    due_time: "09:30",
  } as unknown as CanonicalTaskScheduleBoundary;
  const projected = projectTaskWithCanonicalScheduleBoundary(task, boundary);
  assert.equal(projected.repeat_frequency, "weekly");
  assert.deepEqual(projected.repeat_days_of_week, [2, 4]);
  assert.equal(projected.due_time, "09:30");
});

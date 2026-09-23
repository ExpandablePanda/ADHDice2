import assert from "node:assert/strict";
import test from "node:test";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { collapseTaskHistory } from "../src/lib/records/evaluator.ts";
import { buildTaskHistoryStreakSummaryMap } from "../src/lib/task-history-streak-summaries.ts";
import {
  buildEffectiveTrackingExclusionSet,
  filterTrackedTaskHistory,
  isTaskEffectivelyExcludedFromTracking,
  resolveTaskTrackingExclusion,
} from "../src/lib/task-tracking.ts";

function task(id: string, parent_task_id: string | null = null, exclude_from_tracking = false): Task {
  return { id, parent_task_id, exclude_from_tracking, title: id } as Task;
}

function history(id: string, task_id: string): TaskHistory {
  return { id, task_id, user_id: "user-1", entry_date: "2026-09-19", occurrence_key: id, occurrence_due_on: "2026-09-19", status: "done", event_type: "status", counted_as_due_occurrence: false, was_completed: true, created_at: "2026-09-19T12:00:00Z", updated_at: "2026-09-19T12:00:00Z" };
}

test("tracking exclusion inherits downward without changing siblings or ancestors", () => {
  const tasks = [task("parent"), task("excluded-step", "parent", true), task("grandchild", "excluded-step"), task("sibling", "parent")];
  const excluded = buildEffectiveTrackingExclusionSet(tasks);
  assert.deepEqual([...excluded].sort(), ["excluded-step", "grandchild"]);
  assert.equal(isTaskEffectivelyExcludedFromTracking(task("parent"), tasks), false);
  assert.equal(isTaskEffectivelyExcludedFromTracking(task("sibling", "parent"), tasks), false);
});

test("malformed parent cycles terminate and still honor a direct exclusion", () => {
  const tasks = [task("a", "b"), task("b", "a", true), task("c", "a")];
  assert.deepEqual([...buildEffectiveTrackingExclusionSet(tasks)].sort(), ["a", "b", "c"]);
});

test("bounded projection tracking resolution inherits excluded parents and grandparents", () => {
  const parent = task("parent", null, true);
  const step = task("step", "parent");
  const substep = task("substep", "step");
  const tasks = [parent, step, substep];
  assert.deepEqual(resolveTaskTrackingExclusion(step, [step, parent]), { status: "resolved", excluded: true });
  assert.deepEqual(resolveTaskTrackingExclusion(substep, tasks), { status: "resolved", excluded: true });
  assert.deepEqual(resolveTaskTrackingExclusion(task("ordinary", null), [task("ordinary")]), { status: "resolved", excluded: false });
});

test("bounded projection tracking resolution fails closed on missing ancestors and cycles", () => {
  assert.equal(resolveTaskTrackingExclusion(task("child", "missing"), [task("child", "missing")]).status, "unavailable");
  assert.equal(resolveTaskTrackingExclusion(task("a", "b"), [task("a", "b"), task("b", "a")]).status, "unavailable");
});

test("Records collapse filters effective exclusion while retaining History input", () => {
  const tasks = [task("parent"), task("child", "parent", true)];
  const rows = [history("parent-history", "parent"), history("child-history", "child")];
  assert.equal(filterTrackedTaskHistory(rows, tasks).length, 1);
  assert.deepEqual(collapseTaskHistory({ taskHistory: rows, tasks }).map((row) => row.task.id), ["parent"]);
});

test("inherited exclusion zeroes current and missed streak summaries while History remains available", () => {
  const parent = createTask({ created_at: "2026-09-01T12:00:00Z", exclude_from_tracking: true, id: "parent", sort_order: 1, status: "done", title: "Parent" });
  const child = createTask({ created_at: "2026-09-01T12:00:00Z", id: "child", parent_task_id: "parent", sort_order: 2, status: "done", title: "Child" });
  const summaries = buildTaskHistoryStreakSummaryMap([parent, child], [history("child-history", "child")], "2026-09-19", { compatibilityOnly: true });
  assert.equal(summaries.parent.currentStreak, 0);
  assert.equal(summaries.child.currentStreak, 0);
  assert.equal(summaries.child.missedStreak, 0);
  assert.equal(summaries.child.lastDoneDate, "2026-09-19");
});

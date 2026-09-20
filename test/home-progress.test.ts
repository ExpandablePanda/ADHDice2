import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { buildHomeDailyProgress, buildHomeRecordChases } from "../src/lib/home-progress.ts";

function task(id: string, parentTaskId: string | null = null): Task {
  return { id, parent_task_id: parentTaskId, repeat_frequency: "daily", title: id, user_id: "user-1" } as Task;
}

function history(id: string, taskId: string, status: TaskHistory["status"], extra: Partial<TaskHistory> = {}): TaskHistory {
  return {
    counted_as_due_occurrence: false,
    created_at: "2026-09-19T12:00:00Z",
    entry_date: "2026-09-19",
    event_type: "status",
    id,
    occurrence_due_on: "2026-09-19",
    occurrence_key: id,
    status,
    task_id: taskId,
    updated_at: "2026-09-19T12:00:00Z",
    user_id: "user-1",
    was_completed: status === "done",
    ...extra,
  };
}

function progress(tasks: Task[], rows: TaskHistory[], todayKey = "2026-09-19") {
  return buildHomeDailyProgress({
    taskHistoryByTaskId: Object.groupBy(rows, (row) => row.task_id),
    tasks,
    todayKey,
  });
}

test("no completed History today produces a zero summary", () => {
  assert.deepEqual(progress([task("a")], [history("old", "a", "done", { entry_date: "2026-09-18" })]), {
    parentTasks: 0,
    permanentCompletes: 0,
    recordLiveValues: { parent_tasks_day: 0, permanent_completes_day: 0, steps_day: 0 },
    steps: 0,
    total: 0,
  });
});

test("parent and Step successes are mutually exclusive categories", () => {
  const result = progress([task("parent"), task("step", "parent")], [
    history("parent-row", "parent", "done"),
    history("step-row", "step", "did_my_best"),
  ]);
  assert.equal(result.total, 2);
  assert.equal(result.parentTasks, 1);
  assert.equal(result.steps, 1);
  assert.deepEqual(result.recordLiveValues, { parent_tasks_day: 1, permanent_completes_day: 0, steps_day: 1 });
});

test("permanent Complete counts as one completed entity and as a secondary detail", () => {
  const result = progress([task("parent")], [
    history("permanent", "parent", "complete", { event_type: "completed_permanently" }),
  ]);
  assert.equal(result.total, 1);
  assert.equal(result.parentTasks, 1);
  assert.equal(result.permanentCompletes, 1);
  assert.equal(result.recordLiveValues.permanent_completes_day, 1);
  assert.equal(result.recordLiveValues.parent_tasks_day, 0);
});

test("ordinary success plus permanent Complete counts once in the unique summary", () => {
  const result = progress([task("parent")], [
    history("ordinary", "parent", "done"),
    history("permanent", "parent", "complete", { event_type: "completed_permanently" }),
  ]);
  assert.equal(result.total, 1);
  assert.equal(result.parentTasks, 1);
  assert.equal(result.permanentCompletes, 1);
  assert.equal(result.recordLiveValues.parent_tasks_day, 1);
  assert.equal(result.recordLiveValues.permanent_completes_day, 1);
});

test("record live values remain occurrence-based even when the Home summary is unique-entity based", () => {
  const result = progress([task("parent")], [
    history("ordinary-a", "parent", "done"),
    history("ordinary-b", "parent", "done"),
  ]);
  assert.equal(result.total, 1);
  assert.equal(result.recordLiveValues.parent_tasks_day, 2);
});

test("record chase states calculate below, tied, new, and first-record messages", () => {
  const liveValues = { parent_tasks_day: 8, steps_day: 12, permanent_completes_day: 15 } as const;
  const rows = buildHomeRecordChases(liveValues, { parent_tasks_day: 12, steps_day: 12, permanent_completes_day: 13 });
  assert.equal(rows.find((row) => row.metricKey === "parent_tasks_day")?.message, "5 more to beat it");
  assert.equal(rows.find((row) => row.metricKey === "steps_day")?.message, "Tied record — 1 more to break it");
  assert.equal(rows.find((row) => row.metricKey === "permanent_completes_day")?.message, "NEW RECORD · +2");
  assert.equal(buildHomeRecordChases(liveValues, {}).find((row) => row.metricKey === "parent_tasks_day")?.message, "Setting your first record");
});

test("record chase sorting puts new and tied records first, then closest active chases", () => {
  const rows = buildHomeRecordChases(
    { parent_tasks_day: 4, steps_day: 2, permanent_completes_day: 0 },
    { parent_tasks_day: 5, steps_day: 4, permanent_completes_day: 2 },
  );
  assert.deepEqual(rows.map((row) => row.metricKey), ["parent_tasks_day", "steps_day", "permanent_completes_day"]);
  assert.equal(rows[0].message, "2 more to beat it");
  assert.equal(rows[1].message, "3 more to beat it");
  assert.equal(rows[2].message, "3 more to beat it");
});

test("Home production wiring keeps History readiness separate from the record target query", () => {
  const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const targetSource = readFileSync(new URL("../src/hooks/useHomeRecordTargets.ts", import.meta.url), "utf8");
  assert.match(homeSource, /Daily Tasks Completed/);
  assert.match(homeSource, /Records to Beat/);
  assert.match(homeSource, /!isTaskHistoryLoaded/);
  assert.match(taskAppSource, /taskHistoryByTaskId, tasks, todayKey/);
  assert.match(taskAppSource, /isTaskHistoryLoaded=\{isTaskHistoryLoaded\}/);
  assert.match(targetSource, /select\("metric_key,value,timezone,logical_day_start"\)/);
  assert.match(targetSource, /\.in\("metric_key", \[\.\.\.HOME_RECORD_METRIC_KEYS\]\)/);
  assert.doesNotMatch(targetSource, /runRecordsPipeline/);
});

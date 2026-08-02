import assert from "node:assert/strict";
import test from "node:test";

import {
  combineProjectionRevisions,
  createProjectionDomainRevision,
  createStableTaskProjectionCache,
  createTaskDerivationRevisionKey,
} from "../src/lib/stable-task-projection.ts";
import { projectTasksForActiveStatusRead } from "../src/lib/task-state-engine/read-authority.ts";
import type { Task } from "../src/lib/database.types.ts";
import { createStableTaskRowModelCache, snapshotBuildTaskTableRowDebugCount } from "../src/lib/task-table-row.ts";

function task(overrides: Partial<Task> = {}): Task {
  return {
    active_occurrence_due_on: null, active_status_logical_date: null, actual_seconds: 0,
    completed_at: null, created_at: "2026-08-02T12:00:00.000Z", due_on: null, due_time: null,
    energy: "medium", estimated_minutes: null, external_link_label: null, external_link_url: null,
    id: "task-1", is_important: false, is_urgent: false, notes: null, one_step_at_a_time: false,
    parent_task_id: null, pin_order: null, pinned_at: null, priority: "normal", repeat_day_of_month: null,
    repeat_days_of_week: [], repeat_frequency: "none", repeat_interval: 1, repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null, repeat_monthly_weekday: null, revision: 1, scheduled_on: null, sort_order: 0,
    status: "pending", subtasks_auto_reset: false, tags: [], title: "Projection", trashed_at: null,
    updated_at: "2026-08-02T12:00:00.000Z", user_id: "user-1", ...overrides,
  };
}

test("canonical projection cache ignores search, page, editor, and minute-only state", () => {
  const cache = createStableTaskProjectionCache();
  const tasks = [task()];
  const taskRevision = createProjectionDomainRevision("tasks", tasks);
  const statusRevision = createProjectionDomainRevision("status", { "task-1": "pending" });
  const canonicalRevision = combineProjectionRevisions(taskRevision, statusRevision);
  let builds = 0;
  const project = (state: { activePage: string; editorId: string | null; minute: number; search: string }) => {
    void state;
    return cache.getOrCreate("canonical-entities", canonicalRevision, () => {
      builds += 1;
      return projectTasksForActiveStatusRead(tasks, { "task-1": "pending" });
    });
  };

  const first = project({ activePage: "Tasks", editorId: null, minute: 10, search: "" });
  assert.strictEqual(project({ activePage: "Home", editorId: "task-1", minute: 11, search: "proj" }), first);
  assert.equal(builds, 1);
  assert.strictEqual(first[0], tasks[0]);
});

test("equivalent hydration payloads reuse projection and Task-domain changes rebuild it", () => {
  const cache = createStableTaskProjectionCache();
  const original = [task()];
  const equivalent = [{ ...task(), tags: [] }];
  const changed = [task({ revision: 2, title: "Changed", updated_at: "2026-08-02T12:01:00.000Z" })];
  const originalRevision = createProjectionDomainRevision("tasks", original);
  assert.equal(createProjectionDomainRevision("tasks", equivalent), originalRevision);

  let builds = 0;
  const get = (tasks: Task[]) => cache.getOrCreate(
    "canonical-entities",
    createProjectionDomainRevision("tasks", tasks),
    () => ({ builds: ++builds }),
  );
  const first = get(original);
  assert.strictEqual(get(equivalent), first);
  assert.notStrictEqual(get(changed), first);
  assert.equal(builds, 2);
});

test("identical derivation keys reuse the prior result without a new derivation", () => {
  const cache = createStableTaskProjectionCache();
  const keyInput = {
    historyRevision: "history:1",
    listRevision: "list:1",
    queryRevision: "query:1",
    settingsRevision: "settings:1",
    taskRevision: "tasks:1",
    viewRevision: "view:1",
  };
  const key = createTaskDerivationRevisionKey(keyInput);
  let runs = 0;
  const first = cache.getOrCreate("complete-derived", key, () => ({ run: ++runs }));
  const repeated = cache.getOrCreate("complete-derived", createTaskDerivationRevisionKey({ ...keyInput }), () => ({ run: ++runs }));

  assert.strictEqual(repeated, first);
  assert.equal(runs, 1);
  assert.notEqual(createTaskDerivationRevisionKey({ ...keyInput, queryRevision: "query:2" }), key);
});

test("query and editor changes do not recompute stable workspace facts", () => {
  const cache = createStableTaskProjectionCache();
  const workspaceRevision = combineProjectionRevisions("tasks:1", "history:1", "lists:1", "settings:1");
  let builds = 0;
  const select = (query: string, editorId: string | null) => {
    void query;
    void editorId;
    return cache.getOrCreate("workspace-facts", workspaceRevision, () => ({ build: ++builds }));
  };
  const first = select("", null);

  assert.strictEqual(select("projection", "task-1"), first);
  assert.equal(builds, 1);
});

test("stable List View row models reuse unchanged task revisions", () => {
  const cache = createStableTaskRowModelCache();
  const baseTask = task();
  const context = {
    focusedTaskIdSet: new Set<string>(),
    linkedNotes: [],
    listDefinitions: [],
    listMemberships: [],
    subtasks: [],
    taskHistory: [],
    todayDateKey: "2026-08-02",
  };
  const before = snapshotBuildTaskTableRowDebugCount();
  const first = cache.getOrCreate(baseTask, context);
  const repeated = cache.getOrCreate({ ...baseTask, tags: [] }, { ...context, linkedNotes: [] });

  assert.strictEqual(repeated, first);
  assert.equal(snapshotBuildTaskTableRowDebugCount() - before, process.env.NODE_ENV === "production" ? 0 : 1);
  assert.notStrictEqual(cache.getOrCreate(task({ revision: 2, title: "Changed" }), context), first);
});

test("Unscheduled calendar and Archive book glyphs remain distinct", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(
    new URL("../src/components/task-app/task-status-ui.tsx", import.meta.url),
    "utf8",
  ));
  assert.match(source, /status === "unscheduled"[\s\S]*?inline-flex h-4 w-4[\s\S]*?leading-\[0\][\s\S]*?<CalendarDays/);
  assert.match(source, /CalendarDays className=\{`\$\{size === "sm" \? "h-2\.5 w-2\.5" : "h-3 w-3"\}/);
  assert.match(source, /return <BookOpen className=\{iconSize\} \/>/);
});

test("normal Task status surfaces route outcomes through the shared action path", async () => {
  const fs = await import("node:fs/promises");
  const app = await fs.readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const table = await fs.readFile(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");

  assert.match(app, /<TaskHomePage[\s\S]*?onSetStatus=\{\(task, status\) => \{ void updateTaskStatus\(task, status\); \}\}/);
  assert.match(app, /requestedEngineOutcome[\s\S]*?updateTaskStatus\(savedTask, requestedEngineOutcome\)/);
  assert.ok((app.match(/void updateTaskStatus\(task, status\);/g) ?? []).length >= 7);
  assert.match(table, /resolveTableActionTargetTaskIds\(taskId\)[\s\S]*?onTaskStatusChange\?\.\(targetTaskId, status/);
});

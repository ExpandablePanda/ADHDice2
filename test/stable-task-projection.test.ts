import assert from "node:assert/strict";
import test from "node:test";

import {
  combineProjectionRevisions,
  createProjectionDomainRevision,
  createStableTaskProjectionCache,
  createTaskDerivationRevisionKey,
} from "../src/lib/stable-task-projection.ts";
import {
  projectTasksForActiveStatusRead,
  resolveActiveTaskStatusesIncrementally,
  resolveActiveTaskStatusesIncrementallyChunked,
} from "../src/lib/task-state-engine/read-authority.ts";
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

function canonicalTask(overrides: Partial<Task> = {}) {
  const source = task({
    due_on: "2026-09-08",
    repeat_frequency: "none",
    ...overrides,
  });
  return {
    ...source,
    canonicalization_status: "canonical_proven" as const,
    container_state: "active" as const,
    entity_kind: "parent" as const,
    terminal_state: "active" as const,
    workflow_logical_date: null,
    workflow_state: "none" as const,
    canonical_schedule_boundary: {
      anchor_confidence: "proven",
      anchor_date: source.due_on,
      boundary_sequence: 1,
      boundary_type: "initial",
      day_start_time: "00:00",
      due_time: source.due_time,
      effective_from_logical_date: "2026-09-01",
      entity_id: source.id,
      entity_kind: "parent",
      id: `boundary-${source.id}`,
      repeat_day_of_month: source.repeat_day_of_month,
      repeat_days_of_week: source.repeat_days_of_week,
      repeat_frequency: source.repeat_frequency === "none" ? "none" : source.repeat_frequency,
      repeat_interval: source.repeat_interval,
      repeat_monthly_mode: source.repeat_monthly_mode,
      repeat_monthly_ordinal: source.repeat_monthly_ordinal,
      repeat_monthly_weekday: source.repeat_monthly_weekday,
      schedule_model: source.due_on ? "one_time" : "unscheduled",
      one_time_due_on: source.due_on,
    } as never,
  } as Task & { canonical_schedule_boundary: Record<string, unknown> };
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

test("incremental Active Status evaluates only changed Task and History identities", () => {
  const cache = createStableTaskProjectionCache();
  const tasks = [canonicalTask({ id: "task-a" }), canonicalTask({ id: "task-b" }), canonicalTask({ id: "task-c" })];
  const input = {
    behaviorPolicyRevisions: { task: [] },
    historyByTaskId: { "task-a": [], "task-b": [], "task-c": [] },
    logicalDayRollover: "00:00",
    now: "2026-09-09T12:00:00.000Z",
    tasks,
    timezone: "UTC",
  };

  const first = resolveActiveTaskStatusesIncrementally(input, cache);
  assert.deepEqual([first.evaluatedTasks, first.reusedTasks], [3, 0]);

  const changedTask = canonicalTask({ id: "task-a", due_on: "2026-09-10" });
  const second = resolveActiveTaskStatusesIncrementally({
    ...input,
    historyByTaskId: { ...input.historyByTaskId, "task-a": [] },
    tasks: [changedTask, tasks[1]!, tasks[2]!],
  }, cache);
  assert.deepEqual([second.evaluatedTasks, second.reusedTasks], [1, 2]);

  const historyChange = {
    counted_as_due_occurrence: true,
    created_at: "2026-09-09T12:00:00.000Z",
    entry_date: "2026-09-09",
    event_type: "status" as const,
    id: "history-a",
    occurrence_due_on: "2026-09-08",
    occurrence_key: "task:task-a:occurrence:2026-09-08",
    status: "done" as const,
    task_id: "task-a",
    updated_at: "2026-09-09T12:00:00.000Z",
    user_id: "user-1",
    was_completed: true,
  };
  const third = resolveActiveTaskStatusesIncrementally({
    ...input,
    historyByTaskId: { ...input.historyByTaskId, "task-a": [historyChange] },
    tasks,
  }, cache);
  assert.deepEqual([third.evaluatedTasks, third.reusedTasks], [1, 2]);
});

test("global Active Status chunking yields and matches the canonical result", async () => {
  const tasks = ["task-a", "task-b", "task-c", "task-d"].map((id) => canonicalTask({ id }));
  const input = {
    behaviorPolicyRevisions: { task: [] },
    historyByTaskId: Object.fromEntries(tasks.map((candidate) => [candidate.id, []])),
    logicalDayRollover: "00:00",
    now: "2026-09-09T12:00:00.000Z",
    tasks,
    timezone: "UTC",
  };
  const expected = resolveActiveTaskStatusesIncrementally(input, createStableTaskProjectionCache());
  let clock = 0;
  let yields = 0;
  const actual = await resolveActiveTaskStatusesIncrementallyChunked(input, createStableTaskProjectionCache(), {
    budgetMs: 1,
    now: () => clock++,
    yieldToBrowser: async () => { yields += 1; },
  });

  assert.ok(yields > 0);
  assert.ok(actual.chunks > 1);
  assert.equal(actual.completed, true);
  assert.deepEqual(actual.statusesByTaskId, expected.statusesByTaskId);
  assert.deepEqual(actual.dueOnByTaskId, expected.dueOnByTaskId);
});

test("incomplete Active Status work does not expose its partial map", async () => {
  const tasks = [canonicalTask({ id: "task-a" }), canonicalTask({ id: "task-b" })];
  let current = true;
  const result = await resolveActiveTaskStatusesIncrementallyChunked({
    behaviorPolicyRevisions: { task: [] },
    historyByTaskId: { "task-a": [], "task-b": [] },
    logicalDayRollover: "00:00",
    now: "2026-09-09T12:00:00.000Z",
    tasks,
    timezone: "UTC",
  }, createStableTaskProjectionCache(), {
    budgetMs: 0,
    now: () => 0,
    isCurrent: () => current,
    yieldToBrowser: async () => { current = false; },
  });

  assert.equal(result.completed, false);
  assert.deepEqual(result.statusesByTaskId, {});
  assert.deepEqual(result.dueOnByTaskId, {});
});

test("Active Status ignores reward and streak-only policy changes but honors unresolved-occurrence changes", () => {
  const cache = createStableTaskProjectionCache();
  const tasks = [canonicalTask({ id: "task-a" }), canonicalTask({ id: "task-b" })];
  const base = {
    behaviorProfiles: {
      task: {
        id: "policy",
        missedStreakOnUnhandled: "increment" as const,
        positiveStreakOnUnhandled: "break" as const,
        rewards: "enabled" as const,
        unresolvedOccurrence: "missed" as const,
      },
    },
    historyByTaskId: { "task-a": [], "task-b": [] },
    logicalDayRollover: "00:00",
    now: "2026-09-09T12:00:00.000Z",
    tasks,
    timezone: "UTC",
  };
  resolveActiveTaskStatusesIncrementally(base, cache);

  const rewardChange = resolveActiveTaskStatusesIncrementally({
    ...base,
    behaviorProfiles: { task: { ...base.behaviorProfiles.task, rewards: "disabled" } },
  }, cache);
  assert.deepEqual([rewardChange.evaluatedTasks, rewardChange.reusedTasks], [0, 2]);

  const streakChange = resolveActiveTaskStatusesIncrementally({
    ...base,
    behaviorProfiles: { task: { ...base.behaviorProfiles.task, positiveStreakOnUnhandled: "preserve" } },
  }, cache);
  assert.deepEqual([streakChange.evaluatedTasks, streakChange.reusedTasks], [0, 2]);

  const activeStatusChange = resolveActiveTaskStatusesIncrementally({
    ...base,
    behaviorProfiles: { task: { ...base.behaviorProfiles.task, unresolvedOccurrence: "blank" } },
  }, cache);
  assert.deepEqual([activeStatusChange.evaluatedTasks, activeStatusChange.reusedTasks], [2, 0]);
});

test("canonical due changes invalidate the shared presentation projection even when status is unchanged", () => {
  const cache = createStableTaskProjectionCache();
  const tasks = [task({ due_on: "2026-09-06" })];
  const status = { "task-1": "upcoming" as const };
  const beforeDue = { "task-1": "2026-09-06" };
  const afterDue = { "task-1": "2026-09-13" };
  const revision = (dueOnByTaskId: Record<string, string | null>) => createProjectionDomainRevision("active-task-read", {
    dueOnByTaskId,
    statusesByTaskId: status,
  });
  const first = cache.getOrCreate("canonical-entities", revision(beforeDue), () => projectTasksForActiveStatusRead(tasks, status, beforeDue));
  const second = cache.getOrCreate("canonical-entities", revision(afterDue), () => projectTasksForActiveStatusRead(tasks, status, afterDue));

  assert.notStrictEqual(second, first);
  assert.equal(second[0]?.due_on, "2026-09-13");
  assert.equal(tasks[0]?.due_on, "2026-09-06");
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
  assert.match(source, /status === "unscheduled"[\s\S]*?return <CalendarDays className=\{iconSize\} \/>/);
  assert.match(source, /status === "upcoming"[\s\S]*?return <Clock className=\{iconSize\} \/>/);
  assert.doesNotMatch(source, /status === "unscheduled"[\s\S]*?inline-flex h-4 w-4/);
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

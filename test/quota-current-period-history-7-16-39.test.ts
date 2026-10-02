import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import {
  fetchQuotaCurrentPeriodHistory,
  getActiveQuotaTaskContextKey,
  getActiveQuotaTaskIds,
  getQuotaCurrentPeriodHistoryWindow,
  type QuotaCurrentPeriodHistoryClient,
} from "../src/lib/quota-current-period-history-repository.ts";
import { createQuotaCurrentPeriodHistoryRuntime } from "../src/lib/quota-current-period-history-runtime.ts";
import { buildTaskAppStructuralData } from "../src/lib/task-app-derived.ts";
import { formatRepeatCompactLabel } from "../src/lib/task-repeat.ts";
import { buildTaskTableRow, type TaskTableRowContext } from "../src/lib/task-table-row.ts";
import { quotaProgressForTask } from "../src/lib/task-state-engine/quota.ts";

const LOGICAL_DATE = "2026-10-01";

function quotaTask(overrides: Partial<Task> = {}): Task {
  return createTask({
    created_at: "2026-09-01T12:00:00.000Z",
    id: "quota-task",
    repeat_frequency: "per_week",
    repeat_quota_count: 3,
    sort_order: 0,
    status: "pending",
    title: "Quota task",
    ...overrides,
  });
}

function historyRow(taskId: string, logicalDate: string, status: TaskHistory["status"] = "done"): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${logicalDate}T12:00:00.000Z`,
    entry_date: logicalDate,
    event_type: status === "complete" ? "completed_permanently" : "status",
    id: `${taskId}:${logicalDate}:${status}`,
    occurrence_due_on: logicalDate,
    occurrence_key: `occurrence:${taskId}:${logicalDate}`,
    status,
    task_id: taskId,
    updated_at: `${logicalDate}T12:00:00.000Z`,
    user_id: "user-1",
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
  };
}

function rowContext(
  task: Task,
  quotaHistory: TaskHistory[],
  isReady: boolean,
  fullHistory: TaskHistory[] = [],
): TaskTableRowContext {
  return {
    focusedTaskIdSet: new Set(),
    linkedNotes: [],
    listDefinitions: [],
    listMemberships: [],
    quotaCurrentPeriodHistory: quotaHistory,
    isQuotaCurrentPeriodHistoryReady: isReady,
    subtasks: [],
    taskHistory: fullHistory,
    todayDateKey: LOGICAL_DATE,
  };
}

function canonicalFact(taskId: string, logicalDate: string, outcome: "done" | "did_my_best" | "missed" = "done") {
  return {
    actor_id: null,
    actor_kind: "user",
    command_id: null,
    created_at: `${logicalDate}T12:00:00.000Z`,
    day_start_time: "00:00:00",
    effective_due_on: logicalDate,
    entity_id: taskId,
    entity_kind: "parent",
    event_kind: "explicit_outcome",
    id: `${taskId}:${logicalDate}:${outcome}`,
    idempotence_identity: `${taskId}:${logicalDate}:${outcome}`,
    logical_date: logicalDate,
    logical_day_settings_revision: 1,
    occurrence_id: `${taskId}:${logicalDate}`,
    outcome,
    provenance_kind: "runtime_command",
    recurrence_source_fingerprint: null,
    revision: 1,
    schedule_boundary_id: null,
    scheduled_due_on: logicalDate,
    source: "test",
    source_legacy_history_id: null,
    timezone: "UTC",
    updated_at: `${logicalDate}T12:00:00.000Z`,
    user_id: "user-1",
  };
}

function fakeHistoryClient(rows: readonly unknown[], calls: string[]) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "in", "gte", "lte", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push(`${method}:${JSON.stringify(args)}`);
      return builder;
    };
  }
  builder.range = (...args: unknown[]) => {
    calls.push(`range:${JSON.stringify(args)}`);
    return Promise.resolve({ data: rows, error: null });
  };
  return {
    from(table: string) {
      calls.push(`from:${table}`);
      return builder;
    },
  } as unknown as QuotaCurrentPeriodHistoryClient;
}

test("bounded quota History queries one common week/month window and groups canonical rows", async () => {
  const calls: string[] = [];
  const result = await fetchQuotaCurrentPeriodHistory(fakeHistoryClient([
    canonicalFact("quota-task", "2026-09-28"),
    canonicalFact("quota-task", "2026-09-29", "did_my_best"),
    canonicalFact("quota-task", "2026-10-01"),
  ], calls), {
    logicalDate: LOGICAL_DATE,
    ownerId: "user-1",
    taskIds: ["quota-task", "step-task"],
  });

  assert.deepEqual(getQuotaCurrentPeriodHistoryWindow(LOGICAL_DATE), {
    endDate: LOGICAL_DATE,
    startDate: "2026-09-28",
  });
  assert.equal(calls.filter((call) => call === "from:adhdice_task_history_facts").length, 1);
  assert.ok(calls.includes('eq:["user_id","user-1"]'));
  assert.ok(calls.includes('in:["entity_id",["quota-task","step-task"]]'));
  assert.ok(calls.includes('gte:["logical_date","2026-09-28"]'));
  assert.ok(calls.includes('lte:["logical_date","2026-10-01"]'));
  assert.equal(result["quota-task"].length, 3);
  assert.deepEqual(result["step-task"], []);
});

test("the exact QA case uses bounded History when the lazy full-History cache is empty", () => {
  const task = quotaTask();
  const canonicalHistory = [
    historyRow(task.id, "2026-09-27"),
    historyRow(task.id, "2026-09-28"),
    historyRow(task.id, "2026-09-29"),
    historyRow(task.id, "2026-09-30"),
    historyRow(task.id, "2026-10-01"),
  ];
  const boundedHistory = canonicalHistory.filter((row) => row.entry_date >= "2026-09-28");
  const row = buildTaskTableRow(task, rowContext(task, boundedHistory, true));

  assert.deepEqual(row.repeatQuotaProgress, {
    denominator: 3,
    numerator: 4,
    period: "week",
    periodKey: "2026-09-28",
  });
  assert.equal(formatRepeatCompactLabel(
    task.repeat_frequency,
    task.repeat_interval,
    task.repeat_days_of_week,
    task.repeat_monthly_mode,
    task.repeat_monthly_ordinal,
    task.repeat_monthly_weekday,
    task.repeat_day_of_month,
    task.repeat_quota_count,
    task.repeat_quota_balance_enabled,
    task.repeat_quota_balance,
    row.repeatQuotaProgress,
  ), "3 Per Week · 4/3");
});

test("loading omits progress while a ready empty period renders a genuine 0/3", () => {
  const task = quotaTask();
  const loadedRows = [historyRow(task.id, "2026-09-28")];
  const loadingRow = buildTaskTableRow(task, rowContext(task, loadedRows, false));
  const emptyReadyRow = buildTaskTableRow(task, rowContext(task, [], true));

  assert.equal(loadingRow.repeatQuotaProgress, null);
  assert.equal(emptyReadyRow.repeatQuotaProgress?.numerator, 0);
  assert.equal(emptyReadyRow.repeatQuotaProgress?.denominator, 3);
});

test("full History loaded or absent produces identical quota progress", () => {
  const task = quotaTask();
  const boundedRows = [historyRow(task.id, "2026-09-28"), historyRow(task.id, "2026-09-29")];
  const notLoaded = buildTaskTableRow(task, rowContext(task, boundedRows, true, []));
  const fullLoaded = buildTaskTableRow(task, rowContext(task, boundedRows, true, [
    historyRow(task.id, "2026-09-27"),
    ...boundedRows,
  ]));

  assert.deepEqual(notLoaded.repeatQuotaProgress, fullLoaded.repeatQuotaProgress);
});

test("Steps use the same bounded authority as parent rows", () => {
  const parent = quotaTask({ id: "parent", title: "Parent" });
  const step = quotaTask({ id: "step", parent_task_id: parent.id, title: "Step" });
  const structuralData = buildTaskAppStructuralData({
    focusedTaskIds: [],
    isQuotaCurrentPeriodHistoryReady: true,
    quotaCurrentPeriodHistoryByTaskId: {
      [step.id]: [historyRow(step.id, "2026-09-28"), historyRow(step.id, "2026-09-29")],
    },
    taskHistoryByTaskId: {},
    tasks: [parent, step],
    todayDateKey: LOGICAL_DATE,
  });

  assert.equal(structuralData.childTaskPreviewByParentTaskId[parent.id].items[0].repeatQuotaProgress?.numerator, 2);
  assert.equal(structuralData.childTaskPreviewByParentTaskId[parent.id].items[0].repeatQuotaProgress?.denominator, 3);
});

test("ordinary recurrence and terminal quota Tasks are not in the bounded read set or readout", () => {
  const ordinary = quotaTask({ id: "ordinary", repeat_frequency: "daily", repeat_quota_count: null });
  const terminal = quotaTask({ id: "terminal", status: "complete" });
  assert.deepEqual(getActiveQuotaTaskIds([ordinary, terminal], LOGICAL_DATE), []);
  assert.equal(buildTaskTableRow(ordinary, rowContext(ordinary, [], true)).repeatQuotaProgress, null);
  assert.equal(buildTaskTableRow(terminal, rowContext(terminal, [], true)).repeatQuotaProgress, null);
});

test("quota recurrence, count, and boundary changes invalidate the shared read context", () => {
  const task = quotaTask();
  const weeklyKey = getActiveQuotaTaskContextKey([task], LOGICAL_DATE);
  const monthlyKey = getActiveQuotaTaskContextKey([{ ...task, repeat_frequency: "per_month" }], LOGICAL_DATE);
  const countKey = getActiveQuotaTaskContextKey([{ ...task, repeat_quota_count: 4 }], LOGICAL_DATE);
  const boundaryKey = getActiveQuotaTaskContextKey([{
    ...task,
    canonical_schedule_boundary: {
      effective_from_logical_date: "2026-10-01",
      repeat_frequency: "per_week",
    },
  }], LOGICAL_DATE);

  assert.notEqual(weeklyKey, monthlyKey);
  assert.notEqual(weeklyKey, countKey);
  assert.notEqual(weeklyKey, boundaryKey);
});

test("runtime distinguishes loading from ready empty and resets on logical-day rollover", async () => {
  const states: string[] = [];
  let rows = [canonicalFact("quota-task", "2026-10-01")];
  const client = fakeHistoryClient(rows, []);
  const runtime = createQuotaCurrentPeriodHistoryRuntime((state) => states.push(state.status));

  await runtime.request({
    client,
    logicalDate: "2026-10-01",
    ownerId: "user-1",
    reason: "test",
    taskIds: ["quota-task"],
    workspaceGeneration: 1,
  });
  assert.equal(runtime.getState().status, "ready");
  assert.equal(runtime.getState().rowsByTaskId["quota-task"].length, 1);
  assert.deepEqual(states, ["idle", "loading", "ready"]);

  rows = [];
  await runtime.request({
    client: fakeHistoryClient(rows, []),
    logicalDate: "2026-10-05",
    ownerId: "user-1",
    reason: "logical-day",
    taskIds: ["quota-task"],
    workspaceGeneration: 1,
  }, { force: true });
  assert.equal(runtime.getState().status, "ready");
  assert.equal(runtime.getState().window?.startDate, "2026-10-01");
  assert.deepEqual(runtime.getState().rowsByTaskId["quota-task"], []);
});

test("forced bounded refreshes reconcile History INSERT, UPDATE, date move, and DELETE", async () => {
  const task = quotaTask();
  let facts = [canonicalFact(task.id, "2026-09-28")];
  const runtime = createQuotaCurrentPeriodHistoryRuntime(() => undefined);
  const readProgress = () => quotaProgressForTask({
    task,
    logicalDate: LOGICAL_DATE,
    history: runtime.getState().rowsByTaskId[task.id].map((row) => ({
      logicalDate: row.entry_date,
      outcome: row.status as "done" | "did_my_best" | "missed",
    })),
  });
  const refresh = async () => runtime.request({
    client: fakeHistoryClient(facts, []),
    logicalDate: LOGICAL_DATE,
    ownerId: "user-1",
    reason: "history-realtime",
    taskIds: [task.id],
    workspaceGeneration: 1,
  }, { force: true });

  await refresh();
  assert.equal(readProgress()?.numerator, 1);

  facts = [canonicalFact(task.id, "2026-09-28", "missed")];
  await refresh();
  assert.equal(readProgress()?.numerator, 0);

  facts = [canonicalFact(task.id, "2026-09-29")];
  await refresh();
  assert.equal(readProgress()?.numerator, 1);

  facts = [];
  await refresh();
  assert.equal(readProgress()?.numerator, 0);
});

test("bounded rows are retained by the shared query but quota math resets weekly and monthly periods", async () => {
  const task = quotaTask();
  const runtime = createQuotaCurrentPeriodHistoryRuntime(() => undefined);
  const refresh = (logicalDate: string, facts: readonly unknown[]) => runtime.request({
    client: fakeHistoryClient(facts, []),
    logicalDate,
    ownerId: "user-1",
    reason: "logical-day",
    taskIds: [task.id],
    workspaceGeneration: 1,
  }, { force: true });

  await refresh("2026-10-01", [canonicalFact(task.id, "2026-10-01")]);
  assert.equal(quotaProgressForTask({
    task,
    logicalDate: "2026-10-01",
    history: runtime.getState().rowsByTaskId[task.id].map((row) => ({ logicalDate: row.entry_date, outcome: row.status as "done" })),
  })?.numerator, 1);

  await refresh("2026-10-05", [canonicalFact(task.id, "2026-10-01")]);
  assert.equal(quotaProgressForTask({
    task,
    logicalDate: "2026-10-05",
    history: runtime.getState().rowsByTaskId[task.id].map((row) => ({ logicalDate: row.entry_date, outcome: row.status as "done" })),
  })?.numerator, 0);

  const monthlyTask = quotaTask({ id: "monthly", repeat_frequency: "per_month" });
  await refresh("2026-10-01", [canonicalFact(monthlyTask.id, "2026-09-30")]);
  const monthlyRows = await fetchQuotaCurrentPeriodHistory(fakeHistoryClient([
    canonicalFact(monthlyTask.id, "2026-09-30"),
  ], []), {
    logicalDate: "2026-10-01",
    ownerId: "user-1",
    taskIds: [monthlyTask.id],
  });
  assert.equal(quotaProgressForTask({
    task: monthlyTask,
    logicalDate: "2026-10-01",
    history: monthlyRows[monthlyTask.id].map((row) => ({ logicalDate: row.entry_date, outcome: row.status as "done" })),
  })?.numerator, 0);
});

test("History Realtime and direct mutation paths refresh the bounded authority without full bootstrap", () => {
  const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");

  assert.match(workspaceSource, /requestQuotaCurrentPeriodHistory\("history-realtime", \{ force: true, taskId \}\)/);
  assert.match(workspaceSource, /refreshQuotaCurrentPeriodHistory = useCallback/);
  assert.match(taskAppSource, /refreshQuotaCurrentPeriodHistory\("history-mutation-settled", taskId\)/);
  assert.match(taskAppSource, /quotaCurrentPeriodHistoryByTaskId/);
  assert.match(listSource, /quotaCurrentPeriodHistoryByTaskId/);
  assert.match(listSource, /isQuotaCurrentPeriodHistoryReady/);
  assert.doesNotMatch(workspaceSource, /loadTaskHistoryForTasks\([^)]*quota/);
});

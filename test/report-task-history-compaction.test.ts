import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildUnifiedReportReadModel, type UnifiedReportSourceRows } from "../src/lib/unified-report-read-model.ts";
import { loadReportReadModel, readReportTaskHistory } from "../supabase/functions/report-read/domain.ts";

const PAGE_SIZE = 1000;

const boundedRequest = {
  endDateKey: "2026-09-03",
  startDateKey: "2026-09-01",
  todayDateKey: "2026-09-03",
};

function source(overrides: Partial<UnifiedReportSourceRows> = {}): UnifiedReportSourceRows {
  return {
    checkIns: [],
    endDateKey: boundedRequest.endDateKey,
    focusCategories: [],
    focusSessions: [],
    history: [],
    meals: [],
    metrics: [],
    profile: null,
    records: [],
    signalOccurrences: [],
    signalValues: [],
    signals: [],
    startDateKey: boundedRequest.startDateKey,
    symptomEntries: [],
    symptoms: [],
    tasks: [],
    todayDateKey: boundedRequest.todayDateKey,
    water: [],
    weight: [],
    workouts: [],
    ...overrides,
  };
}

function fakeReportClient(
  historyPages: unknown[][] = [[]],
  options: { rpcErrors?: unknown[]; tasks?: unknown[] } = {},
) {
  const fromTables: string[] = [];
  const rpcCalls: Array<{ args: Record<string, unknown>; functionName: string }> = [];
  const rpcRanges: Array<{ from: number; to: number }> = [];
  const client = {
    from(table: string) {
      fromTables.push(table);
      const tableRows = table === "adhdice_clean_tasks" ? options.tasks ?? [] : [];
      const query = {
        eq: () => query,
        gte: () => query,
        in: () => query,
        lte: () => query,
        order: () => query,
        range: async (from: number, to: number) => ({ data: tableRows.slice(from, to + 1), error: null }),
        select: () => query,
      };
      return query;
    },
    rpc(functionName: string, args: Record<string, unknown>) {
      rpcCalls.push({ args, functionName });
      let offset = 0;
      const builder = {
        range(from: number, to: number) {
          rpcRanges.push({ from, to });
          offset = from;
          return builder;
        },
        then(onFulfilled: (value: { data: unknown[]; error: unknown | null }) => unknown, onRejected?: (reason: unknown) => unknown) {
          const page = Math.floor(offset / PAGE_SIZE);
          return Promise.resolve({ data: historyPages[page] ?? [], error: options.rpcErrors?.[page] ?? null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  } as Parameters<typeof loadReportReadModel>[0];
  return { client, fromTables, rpcCalls, rpcRanges };
}

test("bounded report History reads use the compact RPC instead of paged full-history reads", async () => {
  const harness = fakeReportClient([
    [
      { entity_id: "task-1", logical_date: "2026-08-31", outcome: "missed", updated_at: "2026-08-31T12:00:00Z" },
      { entity_id: "task-1", logical_date: "2026-09-01", outcome: "done", updated_at: "2026-09-01T12:00:00Z" },
    ],
  ]);
  await loadReportReadModel(harness.client, "user-1", boundedRequest);
  assert.deepEqual(harness.rpcCalls, [{
    args: { p_end_date: "2026-09-03", p_start_date: "2026-09-01" },
    functionName: "adhdice_get_report_task_history",
  }]);
  assert.deepEqual(harness.rpcRanges, [{ from: 0, to: PAGE_SIZE - 1 }]);
  assert.equal(harness.fromTables.includes("adhdice_task_history_facts"), false);
});

test("compact RPC requests a second page when the first page is exactly full", async () => {
  const firstPage = Array.from({ length: PAGE_SIZE }, (_, index) => ({
    entity_id: `task-${index}`,
    logical_date: "2026-09-01",
    outcome: "done",
    updated_at: "2026-09-01T12:00:00Z",
  }));
  const harness = fakeReportClient([firstPage, []]);
  const rows = await readReportTaskHistory(harness.client, "user-1", boundedRequest);
  assert.equal(rows.length, PAGE_SIZE);
  assert.deepEqual(harness.rpcRanges, [
    { from: 0, to: PAGE_SIZE - 1 },
    { from: PAGE_SIZE, to: PAGE_SIZE * 2 - 1 },
  ]);
});

test("compact RPC accumulates pages in order and stops at the first short page", async () => {
  const pages = [
    Array.from({ length: PAGE_SIZE }, (_, index) => ({ entity_id: `task-${index}`, logical_date: "2026-08-05", outcome: "missed", updated_at: "2026-08-05T12:00:00Z" })),
    Array.from({ length: PAGE_SIZE }, (_, index) => ({ entity_id: `task-${PAGE_SIZE + index}`, logical_date: "2026-08-20", outcome: "done", updated_at: "2026-08-20T12:00:00Z" })),
    [{ entity_id: "task-2000", logical_date: "2026-09-03", outcome: "complete", updated_at: "2026-09-03T12:00:00Z" }],
  ];
  const harness = fakeReportClient(pages);
  const rows = await readReportTaskHistory(harness.client, "user-1", { ...boundedRequest, startDateKey: "2026-08-05" });
  assert.equal(rows.length, PAGE_SIZE * 2 + 1);
  assert.deepEqual(rows, pages.flat());
  assert.deepEqual(harness.rpcRanges, [
    { from: 0, to: PAGE_SIZE - 1 },
    { from: PAGE_SIZE, to: PAGE_SIZE * 2 - 1 },
    { from: PAGE_SIZE * 2, to: PAGE_SIZE * 3 - 1 },
  ]);
});

test("30-day compact report data beyond page 1 preserves New Misses and Total Misses", async () => {
  const thirtyDayRequest = { endDateKey: "2026-09-03", startDateKey: "2026-08-05", todayDateKey: "2026-09-03" };
  const pageOne = Array.from({ length: PAGE_SIZE }, (_, index) => ({
    entity_id: `unloaded-task-${index}`,
    logical_date: "2026-08-05",
    outcome: "missed",
    updated_at: "2026-08-05T12:00:00Z",
  }));
  const pageTwo = [
    { entity_id: "late-task", logical_date: "2026-08-20", outcome: "missed", updated_at: "2026-08-20T12:00:00Z" },
    ...Array.from({ length: PAGE_SIZE - 1 }, (_, index) => ({
      entity_id: `unloaded-task-two-${index}`,
      logical_date: "2026-08-20",
      outcome: "missed",
      updated_at: "2026-08-20T12:00:00Z",
    })),
  ];
  const pageThree = [{ entity_id: "late-task", logical_date: "2026-09-03", outcome: "done", updated_at: "2026-09-03T12:00:00Z" }];
  const harness = fakeReportClient([pageOne, pageTwo, pageThree], {
    tasks: [{ id: "late-task", parent_task_id: null, title: "Late Task" }],
  });
  const report = await loadReportReadModel(harness.client, "user-1", thirtyDayRequest);
  const missDay = report.tasks.days.find((day) => day.dateKey === "2026-08-20");
  const doneDay = report.tasks.days.find((day) => day.dateKey === "2026-09-03");
  assert.deepEqual(missDay?.newMisses, ["Late Task"]);
  assert.equal(missDay?.totalMisses, 1);
  assert.deepEqual(doneDay?.done, ["Late Task"]);
  assert.equal(doneDay?.totalMisses, 0);
  assert.deepEqual(harness.rpcRanges, [
    { from: 0, to: PAGE_SIZE - 1 },
    { from: PAGE_SIZE, to: PAGE_SIZE * 2 - 1 },
    { from: PAGE_SIZE * 2, to: PAGE_SIZE * 3 - 1 },
  ]);
});

test("a failed compact RPC page rejects the report instead of returning partial History", async () => {
  const firstPage = Array.from({ length: PAGE_SIZE }, (_, index) => ({
    entity_id: `task-${index}`,
    logical_date: "2026-09-01",
    outcome: "done",
    updated_at: "2026-09-01T12:00:00Z",
  }));
  const harness = fakeReportClient([firstPage, []], { rpcErrors: [null, new Error("page 2 failed")] });
  await assert.rejects(loadReportReadModel(harness.client, "user-1", boundedRequest), /page 2 failed/);
  assert.deepEqual(harness.rpcRanges, [
    { from: 0, to: PAGE_SIZE - 1 },
    { from: PAGE_SIZE, to: PAGE_SIZE * 2 - 1 },
  ]);
});

test("All Available retains the full canonical History fallback", async () => {
  const harness = fakeReportClient();
  await loadReportReadModel(harness.client, "user-2", { ...boundedRequest, endDateKey: null, startDateKey: null });
  assert.equal(harness.rpcCalls.length, 0);
  assert.equal(harness.fromTables.includes("adhdice_task_history_facts"), true);
});

test("compact baseline plus selected-range facts matches the previous full-history report model", () => {
  const tasks = [
    { id: "parent", parent_task_id: null, title: "Parent" },
    { id: "step", parent_task_id: "parent", title: "Completed step" },
    { id: "substep", parent_task_id: "step", title: "New miss" },
    { id: "new-task", parent_task_id: null, title: "New task" },
    { id: "multi", parent_task_id: null, title: "Multiple outcomes" },
    { id: "same-day", parent_task_id: null, title: "Same-day latest" },
  ];
  const rangeHistory = [
    { entity_id: "step", logical_date: "2026-09-01", outcome: "done", updated_at: "2026-09-01T12:00:00Z" },
    { entity_id: "new-task", logical_date: "2026-09-01", outcome: "missed", updated_at: "2026-09-01T12:00:00Z" },
    { entity_id: "substep", logical_date: "2026-09-02", outcome: "missed", updated_at: "2026-09-02T12:00:00Z" },
    { entity_id: "multi", logical_date: "2026-09-02", outcome: "did_my_best", updated_at: "2026-09-02T12:00:00Z" },
    { entity_id: "new-task", logical_date: "2026-09-03", outcome: "done", updated_at: "2026-09-03T12:00:00Z" },
  ];
  const baseline = [
    { entity_id: "parent", logical_date: "2026-08-30", outcome: "missed", updated_at: "2026-08-30T12:00:00Z" },
    { entity_id: "step", logical_date: "2026-08-30", outcome: "missed", updated_at: "2026-08-30T12:00:00Z" },
    { entity_id: "substep", logical_date: "2026-08-30", outcome: "done", updated_at: "2026-08-30T12:00:00Z" },
    { entity_id: "multi", logical_date: "2026-08-28", outcome: "done", updated_at: "2026-08-28T12:00:00Z" },
    { entity_id: "multi", logical_date: "2026-08-30", outcome: "missed", updated_at: "2026-08-30T12:00:00Z" },
  ];
  const sameDayBaseline = [
    { entity_id: "same-day", logical_date: "2026-08-30", outcome: "missed", updated_at: "2026-08-30T10:00:00Z" },
    { entity_id: "same-day", logical_date: "2026-08-30", outcome: "done", updated_at: "2026-08-30T12:00:00Z" },
  ];
  const full = buildUnifiedReportReadModel(source({ history: [...baseline, ...sameDayBaseline, ...rangeHistory], tasks }));
  const compact = buildUnifiedReportReadModel(source({ history: [...baseline.filter((entry) => entry.logical_date === "2026-08-30" || entry.entity_id !== "multi"), sameDayBaseline[1], ...rangeHistory], tasks }));
  assert.deepEqual(compact.tasks.days, full.tasks.days);
  assert.deepEqual(compact.tasks.totals, full.tasks.totals);
  assert.deepEqual(compact.tasks.days.map((day) => ({ date: day.dateKey, newMisses: day.newMisses, totalMisses: day.totalMisses })), [
    { date: "2026-09-01", newMisses: ["New task"], totalMisses: 3 },
    { date: "2026-09-02", newMisses: ["Parent > Completed step > New miss"], totalMisses: 3 },
    { date: "2026-09-03", newMisses: [], totalMisses: 2 },
  ]);
});

test("History RPC source preserves owner scoping and deterministic latest-baseline ordering", () => {
  const sql = readFileSync(new URL("../supabase/patch_report_task_history_compaction_7_15_58.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.adhdice_get_report_task_history\(\s*p_start_date date,\s*p_end_date date/s);
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /fact\.user_id = v_user_id/);
  assert.match(sql, /fact\.logical_date < p_start_date/);
  assert.match(sql, /fact\.logical_date >= p_start_date/);
  assert.match(sql, /fact\.logical_date <= p_end_date/);
  assert.match(sql, /order by fact\.logical_date desc, fact\.updated_at desc, fact\.id desc/);
  assert.match(sql, /revoke all on function public\.adhdice_get_report_task_history\(date, date\)\s+from public, anon, authenticated/s);
  assert.match(sql, /grant execute on function public\.adhdice_get_report_task_history\(date, date\)\s+to authenticated/s);
});

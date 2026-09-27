import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { shiftDateKey } from "../src/lib/date-key.ts";
import { getStatsProductivityTaskCounts, getStatsTaskActivityMetrics } from "../src/lib/task-activity-summary-consumers.ts";
import type { TaskActivitySummaryClient } from "../src/lib/task-activity-summary-repository.ts";
import { createTaskActivitySummaryRuntime } from "../src/lib/task-activity-summary-runtime.ts";

const TODAY = "2026-09-20";
const EPOCH = "00000000-0000-4000-8000-000000000001";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => { resolve = promiseResolve; });
  return { promise, resolve };
}

function summary(asOfLogicalDate: string, revision: number, counts = [1, 2, 3, 4, 5, 6, 7]): Record<string, unknown> {
  const dates = Array.from({ length: 7 }, (_, index) => shiftDateKey(asOfLogicalDate, index - 6));
  return {
    contract_version: "task-activity-summary-v1",
    as_of_logical_date: asOfLogicalDate,
    history_sync_epoch: EPOCH,
    history_current_revision: revision,
    history_protocol_version: "task-history-sync-v1",
    tracked: {
      logged_days: 10,
      completed_days: 9,
      missed_days: 1,
      done_rate: 90,
      current_streak: 8,
      best_streak: 12,
    },
    tracked_recent_completed_counts: dates.map((logical_date, index) => ({ logical_date, completed_count: counts[index] ?? 0 })),
    unfiltered_today_completed_count: 11,
  };
}

function rpcClient(handler: (logicalDate: string) => Promise<unknown> | unknown) {
  return {
    rpc: async (_name: string, args: { p_as_of: string }) => ({ data: await handler(args.p_as_of), error: null }),
  } as unknown as TaskActivitySummaryClient;
}

const [statsSource, consumerSource, gamesSource, appSource, workspaceSource] = await Promise.all([
  readFile(new URL("../src/components/task-app/stats-page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/task-activity-summary-consumers.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/games-page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8"),
]);

test("Stats consumes summary streak, rate, today, and seven-day server counts", () => {
  const metrics = getStatsTaskActivityMetrics(summary(TODAY, 42) as never, TODAY);
  assert.deepEqual(metrics, { bestStreak: 12, currentStreak: 8, doneRate: 90, todayDone: 7, weekDone: 28 });
  assert.match(consumerSource, /summary\.tracked_recent_completed_counts/);
  assert.match(consumerSource, /summary\.tracked\.current_streak/);
  assert.match(consumerSource, /summary\.tracked\.best_streak/);
  assert.match(consumerSource, /summary\.tracked\.done_rate/);
  assert.doesNotMatch(statsSource, /taskHistory/);
});

test("Stats seven-day productivity uses server Task counts plus existing Focus minutes", () => {
  const counts = getStatsProductivityTaskCounts(summary(TODAY, 42) as never, TODAY);
  assert.deepEqual(counts.map((entry) => entry.completedCount), [1, 2, 3, 4, 5, 6, 7]);
  assert.match(statsSource, /const done = taskCounts\?\.\[index\]\?\.completedCount/);
  assert.match(statsSource, /const focusSeconds = focusHistory/);
  assert.match(statsSource, /done \* 10 \+ Math\.floor\(focusSeconds \/ 60\)/);
});

test("Games receives the intentionally unfiltered server credit count", () => {
  assert.match(gamesSource, /todayCompletedCount: number \| null/);
  assert.match(gamesSource, /const todayCredits = todayCompletedCount \?\? 0/);
  assert.doesNotMatch(gamesSource, /taskHistory|entry_date|todayISO/);
  assert.match(appSource, /todayCompletedCount=\{taskActivitySummary\?\.unfiltered_today_completed_count \?\? null\}/);
});

test("HUD global streak comes from the Task Activity Summary", () => {
  assert.match(appSource, /currentStreak=\{taskActivitySummary\?\.tracked\.current_streak \?\? 0\}/);
  assert.doesNotMatch(appSource, /currentStreak=\{taskHistoryStats\.currentStreak\}/);
});

test("Stats, Games, and Achievements page entry no longer requests full Task History", () => {
  const pageEffectStart = workspaceSource.indexOf("activePageRef.current = activePage;");
  const pageEffectEnd = workspaceSource.indexOf("useEffect(() => {\n    tasksRef.current = tasks;", pageEffectStart);
  const pageEffect = workspaceSource.slice(pageEffectStart, pageEffectEnd);
  assert.doesNotMatch(pageEffect, /loadFullTaskHistory|loadTaskHistory/);

  const coreLoader = workspaceSource.slice(workspaceSource.indexOf("async function loadCoreWorkspaceData"), workspaceSource.indexOf("const requestCoreWorkspaceRefresh"));
  assert.doesNotMatch(coreLoader, /activePageRef\.current === "Stats"|activePageRef\.current === "Games"|activePageRef\.current === "Achievements"/);
  assert.match(workspaceSource, /loadFullTaskHistoryRef\.current = \(\) => loadTaskHistory/);
  assert.match(workspaceSource, /async function loadTaskHistory\(/);
});

test("The compact summary refreshes from existing mutation and reconciliation seams", () => {
  assert.match(appSource, /refreshTaskActivitySummary\("history-mutation-settled"\)/);
  assert.match(workspaceSource, /reason: `workspace-\$\{source\}`/);
  assert.match(workspaceSource, /reason: "rollover-reconciliation"/);
  assert.match(workspaceSource, /reason: "realtime-gap-recovery"/);
  assert.match(workspaceSource, /reason: "history-realtime"/);
  assert.doesNotMatch(workspaceSource, /setInterval\([^\n]*taskActivitySummary/);
});

test("Concurrent same-owner/day summary reads are single-flight", async () => {
  const read = deferred<unknown>();
  let calls = 0;
  const client = rpcClient(async () => {
    calls += 1;
    return await read.promise;
  });
  const states: Array<{ summary: unknown; status: string }> = [];
  const runtime = createTaskActivitySummaryRuntime((state) => states.push({ summary: state.summary, status: state.status }));
  const request = { client, logicalDate: TODAY, ownerId: "owner-1", reason: "test", workspaceGeneration: 1 };
  const first = runtime.request(request);
  const joined = runtime.request(request);
  assert.strictEqual(joined, first);
  assert.equal(calls, 1);
  read.resolve(summary(TODAY, 1));
  await Promise.all([first, joined]);
  assert.equal(runtime.getState().status, "ready");
  assert.ok(states.some((state) => state.summary !== null && state.status === "ready"));
});

test("Summary results are fenced by owner, logical date, and workspace generation", async () => {
  const first = deferred<unknown>();
  const second = deferred<unknown>();
  const client = rpcClient(async (logicalDate) => logicalDate === TODAY ? await first.promise : await second.promise);
  const runtime = createTaskActivitySummaryRuntime(() => undefined);
  const firstRequest = runtime.request({ client, logicalDate: TODAY, ownerId: "owner-1", reason: "old", workspaceGeneration: 1 });
  const secondRequest = runtime.request({ client, logicalDate: "2026-09-21", ownerId: "owner-2", reason: "new", workspaceGeneration: 2 });
  assert.equal(runtime.getState().summary, null);
  first.resolve(summary(TODAY, 1));
  await Promise.resolve();
  second.resolve(summary("2026-09-21", 2));
  await Promise.all([firstRequest, secondRequest]);
  assert.equal(runtime.getState().ownerId, "owner-2");
  assert.equal(runtime.getState().logicalDate, "2026-09-21");
  assert.equal(runtime.getState().summary?.history_current_revision, 2);
});

test("A same-owner/day refresh failure retains the last-known-good summary", async () => {
  let shouldFail = false;
  const client = rpcClient(async (logicalDate) => {
    if (shouldFail) throw new Error("temporary RPC failure");
    return summary(logicalDate, 3);
  });
  const runtime = createTaskActivitySummaryRuntime(() => undefined);
  const request = { client, logicalDate: TODAY, ownerId: "owner-1", reason: "test", workspaceGeneration: 1 };
  await runtime.request(request);
  shouldFail = true;
  await runtime.request(request, { force: true });
  assert.equal(runtime.getState().status, "error");
  assert.equal(runtime.getState().error, "temporary RPC failure");
  assert.equal(runtime.getState().summary?.history_current_revision, 3);
});

test("A different owner or logical date cannot inherit the previous summary", async () => {
  const second = deferred<unknown>();
  const client = rpcClient(async (logicalDate) => logicalDate === TODAY ? summary(TODAY, 4) : await second.promise);
  const runtime = createTaskActivitySummaryRuntime(() => undefined);
  await runtime.request({ client, logicalDate: TODAY, ownerId: "owner-1", reason: "first", workspaceGeneration: 1 });
  const nextRequest = runtime.request({ client, logicalDate: "2026-09-21", ownerId: "owner-1", reason: "new-day", workspaceGeneration: 1 });
  assert.equal(runtime.getState().summary, null);
  second.resolve(summary("2026-09-21", 5));
  await nextRequest;
  assert.equal(runtime.getState().summary?.history_current_revision, 5);
});

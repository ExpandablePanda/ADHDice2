import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  fetchHomeCurrentDayHistory,
  HOME_CURRENT_DAY_SUCCESSFUL_OUTCOMES,
  type HomeCurrentDayHistoryClient,
} from "../src/lib/home-current-day-history-repository.ts";
import { createHomeCurrentDayHistoryRuntime } from "../src/lib/home-current-day-history-runtime.ts";

const TODAY = "2026-09-26";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => { resolve = promiseResolve; });
  return { promise, resolve };
}

function canonicalFact(input: { entityId: string; id: string; logicalDate?: string; outcome: string }) {
  return {
    actor_id: null,
    actor_kind: "user",
    command_id: null,
    created_at: "2026-09-26T12:00:00Z",
    day_start_time: "06:00",
    effective_due_on: TODAY,
    entity_id: input.entityId,
    entity_kind: "parent",
    event_kind: input.outcome === "complete" ? "terminal_complete" : "explicit_outcome",
    id: input.id,
    idempotence_identity: input.id,
    logical_date: input.logicalDate ?? TODAY,
    logical_day_settings_revision: 1,
    occurrence_id: null,
    provenance_kind: "user",
    recurrence_source_fingerprint: null,
    revision: 1,
    schedule_boundary_id: null,
    scheduled_due_on: TODAY,
    source: "test",
    source_legacy_history_id: null,
    timezone: "America/New_York",
    updated_at: "2026-09-26T12:00:00Z",
    user_id: "owner-1",
    outcome: input.outcome,
  };
}

function queryClient(
  handler: (filters: Record<string, unknown>) => Promise<{ data: unknown[] | null; error: { message: string } | null }>,
  calls: Array<{ method: string; column?: string; value?: unknown }>,
) {
  return {
    from(table: string) {
      calls.push({ method: "from", value: table });
      const filters: Record<string, unknown> = {};
      const query = {
        select(columns: string) {
          calls.push({ method: "select", value: columns });
          return query;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          calls.push({ method: "eq", column, value });
          return query;
        },
        in(column: string, value: unknown) {
          filters[column] = value;
          calls.push({ method: "in", column, value });
          return query;
        },
        order(column: string) {
          calls.push({ method: "order", column });
          return query;
        },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          return handler(filters).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as HomeCurrentDayHistoryClient;
}

test("Home current-day read is one owner/date/success-outcome canonical query", async () => {
  const calls: Array<{ method: string; column?: string; value?: unknown }> = [];
  const client = queryClient(async () => ({
    data: [canonicalFact({ entityId: "task-1", id: "fact-1", outcome: "done" })],
    error: null,
  }), calls);

  const rows = await fetchHomeCurrentDayHistory(client, { logicalDate: TODAY, ownerId: "owner-1" });

  assert.equal(rows.length, 1);
  assert.deepEqual(calls.filter((call) => call.method === "from"), [{ method: "from", value: "adhdice_task_history_facts" }]);
  assert.deepEqual(calls.filter((call) => call.method === "eq"), [
    { method: "eq", column: "user_id", value: "owner-1" },
    { method: "eq", column: "logical_date", value: TODAY },
  ]);
  assert.deepEqual(calls.find((call) => call.method === "in"), {
    method: "in",
    column: "outcome",
    value: [...HOME_CURRENT_DAY_SUCCESSFUL_OUTCOMES],
  });
  assert.equal(calls.filter((call) => call.method === "from").length, 1);
  assert.equal(rows[0]?.task_id, "task-1");
  assert.equal(rows[0]?.event_type, "status");
});

test("Home runtime single-flights same-context reads and never owns full semantic History", async () => {
  const read = deferred<{ data: unknown[]; error: null }>();
  let calls = 0;
  const client = queryClient(async () => {
    calls += 1;
    return await read.promise;
  }, []);
  const runtime = createHomeCurrentDayHistoryRuntime(() => undefined);
  const request = { client, logicalDate: TODAY, ownerId: "owner-1", reason: "home", workspaceGeneration: 4 };
  const first = runtime.request(request);
  const joined = runtime.request(request);
  assert.strictEqual(first, joined);
  await Promise.resolve();
  assert.equal(calls, 1);
  read.resolve({ data: [canonicalFact({ entityId: "task-1", id: "fact-1", outcome: "done" })], error: null });
  await Promise.all([first, joined]);
  assert.equal(runtime.getState().status, "ready");
  assert.equal(runtime.getState().rows.length, 1);
  assert.equal(runtime.getState().workspaceGeneration, 4);
});

test("Home runtime discards stale owner/day/generation results and invalidates prior-day rows", async () => {
  const oldRead = deferred<{ data: unknown[]; error: null }>();
  const newRead = deferred<{ data: unknown[]; error: null }>();
  const client = queryClient(async (filters) => filters.logical_date === TODAY ? await oldRead.promise : await newRead.promise, []);
  const runtime = createHomeCurrentDayHistoryRuntime(() => undefined);
  const oldRequest = runtime.request({ client, logicalDate: TODAY, ownerId: "owner-1", reason: "old", workspaceGeneration: 1 });
  const newRequest = runtime.request({ client, logicalDate: "2026-09-27", ownerId: "owner-2", reason: "new", workspaceGeneration: 2 });
  oldRead.resolve({ data: [canonicalFact({ entityId: "old", id: "old-fact", outcome: "done" })], error: null });
  await Promise.resolve();
  assert.equal(runtime.getState().rows.length, 0);
  newRead.resolve({ data: [canonicalFact({ entityId: "new", id: "new-fact", logicalDate: "2026-09-27", outcome: "complete" })], error: null });
  await Promise.all([oldRequest, newRequest]);
  assert.equal(runtime.getState().ownerId, "owner-2");
  assert.equal(runtime.getState().logicalDate, "2026-09-27");
  assert.equal(runtime.getState().workspaceGeneration, 2);
  assert.equal(runtime.getState().rows[0]?.task_id, "new");

  runtime.invalidate({ logicalDate: "2026-09-28", ownerId: "owner-2", workspaceGeneration: 2 });
  assert.equal(runtime.getState().status, "idle");
  assert.equal(runtime.getState().rows.length, 0);
});

test("Home runtime retains same-owner/day last-known-good rows on refresh error", async () => {
  let shouldFail = false;
  const client = queryClient(async () => {
    if (shouldFail) return { data: null, error: { message: "temporary read failure" } };
    return { data: [canonicalFact({ entityId: "task-1", id: "fact-1", outcome: "did_my_best" })], error: null };
  }, []);
  const runtime = createHomeCurrentDayHistoryRuntime(() => undefined);
  const request = { client, logicalDate: TODAY, ownerId: "owner-1", reason: "home", workspaceGeneration: 1 };
  await runtime.request(request);
  shouldFail = true;
  await runtime.request(request, { force: true });
  assert.equal(runtime.getState().status, "error");
  assert.equal(runtime.getState().error, "temporary read failure");
  assert.equal(runtime.getState().rows[0]?.status, "did_my_best");
});

test("Home production wiring uses bounded readiness and preserves the explicit full-History infrastructure", async () => {
  const [appSource, homeSource, workspaceSource, runtimeSource] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/home-current-day-history-runtime.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workspaceSource, /homeCurrentDayHistoryRuntimeRef/);
  assert.match(workspaceSource, /activePage === "Home".*homeCurrentDayHistoryRequestRef/s);
  assert.match(workspaceSource, /reason: "logical-day"/);
  assert.match(workspaceSource, /reason: "history-realtime"/);
  assert.match(workspaceSource, /`workspace-\$\{source\}`/);
  assert.match(workspaceSource, /reason: "realtime-gap-recovery"/);
  assert.match(workspaceSource, /homeCurrentDayHistoryRuntimeRef\.current\?\.clear\(\)/);
  assert.match(appSource, /refreshHomeCurrentDayHistory\("history-mutation-settled"\)/);
  assert.match(appSource, /homeCurrentDayHistoryRows/);
  assert.match(appSource, /isFullTaskHistoryLoaded/);
  assert.doesNotMatch(homeSource, /isFullTaskHistoryLoaded/);
  assert.doesNotMatch(runtimeSource, /fullTaskHistory|isFullTaskHistoryLoaded|setFullTaskHistoryLoadedUserId/);
  assert.match(workspaceSource, /loadFullTaskHistoryRef\.current = \(\) => loadTaskHistory/);
});

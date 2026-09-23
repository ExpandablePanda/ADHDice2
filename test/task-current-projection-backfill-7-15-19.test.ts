import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  loadMissingCurrentProjectionCandidates,
  parseCurrentProjectionBackfillRequest,
  runCurrentProjectionBackfill,
  type BackfillAdminClient,
  type BackfillQuery,
} from "../supabase/functions/task-current-projection-backfill/domain.ts";

const backfillSource = readFileSync(new URL("../supabase/functions/task-current-projection-backfill/index.ts", import.meta.url), "utf8");
const domainSource = readFileSync(new URL("../supabase/functions/task-current-projection-backfill/domain.ts", import.meta.url), "utf8");
const remainingCountMigration = readFileSync(new URL("../supabase/patch_task_current_projection_backfill_remaining_count_7_15_21.sql", import.meta.url), "utf8");
const operatorSource = readFileSync(new URL("../src/lib/task-current-projection-backfill-operator.ts", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/components/task-app/settings-page.tsx", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

const afterTaskId = "00000000-0000-4000-8000-000000000010";
const taskIds = [
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
];

type QueryCall = { table: string; operation: string; value?: unknown };

function query(data: unknown, calls: QueryCall[], table: string, error: { message: string } | null = null): BackfillQuery {
  const current = {} as BackfillQuery;
  Object.assign(current, {
    select: (value: string) => {
      calls.push({ table, operation: "select", value });
      return current;
    },
    eq: (column: string, value: string) => {
      calls.push({ table, operation: `eq:${column}`, value });
      return current;
    },
    is: (column: string, value: null) => {
      calls.push({ table, operation: `is:${column}`, value });
      return current;
    },
    in: (column: string, value: string[]) => {
      calls.push({ table, operation: `in:${column}`, value });
      return current;
    },
    gt: (column: string, value: string) => {
      calls.push({ table, operation: `gt:${column}`, value });
      return current;
    },
    not: (column: string, operator: string, value: string) => {
      calls.push({ table, operation: `not:${column}:${operator}`, value });
      return current;
    },
    order: (column: string, value: { ascending: boolean }) => {
      calls.push({ table, operation: `order:${column}`, value });
      return current;
    },
    limit: (value: number) => {
      calls.push({ table, operation: "limit", value });
      return current;
    },
    then: (onfulfilled: (value: { data: unknown; error: { message: string } | null }) => unknown, onrejected?: (reason: unknown) => unknown) => (
      Promise.resolve({ data, error }).then(onfulfilled, onrejected)
    ),
  });
  return current;
}

function adminClient(input: {
  projectionRows?: unknown[];
  taskRows?: unknown[];
  remainingCount?: number;
  calls?: QueryCall[];
} = {}): BackfillAdminClient {
  const calls = input.calls ?? [];
  return {
    from(table) {
      return query(
        table === "adhdice_task_current_projections"
          ? input.projectionRows ?? []
          : input.taskRows ?? taskIds.map((id) => ({ id })),
        calls,
        table,
      );
    },
    rpc: async (functionName) => {
      assert.equal(functionName, "adhdice_count_missing_task_current_projections");
      return { data: input.remainingCount ?? 0, error: null };
    },
  };
}

test("backfill request validation defaults to ten, rejects malformed bounds, and ignores no caller owner", () => {
  assert.deepEqual(parseCurrentProjectionBackfillRequest({}), { limit: 10, afterTaskId: null });
  assert.deepEqual(parseCurrentProjectionBackfillRequest({ limit: 1, afterTaskId }), { limit: 1, afterTaskId });
  assert.equal(parseCurrentProjectionBackfillRequest({ limit: 0 }), null);
  assert.equal(parseCurrentProjectionBackfillRequest({ limit: 11 }), null);
  assert.equal(parseCurrentProjectionBackfillRequest({ limit: "10" }), null);
  assert.equal(parseCurrentProjectionBackfillRequest({ afterTaskId: "not-a-uuid" }), null);
  assert.equal(parseCurrentProjectionBackfillRequest({ user_id: "another-user" }), null);
});

test("Edge boundary requires verified user auth, POST, no-store, and never accepts a request owner", () => {
  assert.match(backfillSource, /withSupabase\(\{ auth: "user" \}/);
  assert.match(backfillSource, /if \(request\.method !== "POST"\)/);
  assert.match(backfillSource, /const userId = userIdFromContext\(context\)/);
  assert.match(backfillSource, /if \(!userId\) return json\(\{ error: \{ code: "authentication_failure"/);
  assert.match(backfillSource, /Cache-Control.*no-store/);
  assert.doesNotMatch(backfillSource, /body\.user_id|userId\s*=\s*body/);
  assert.doesNotMatch(backfillSource, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
});

test("candidate selection is owner scoped, canonical-runtime eligible, missing-only, and keyset ordered", async () => {
  const calls: QueryCall[] = [];
  const candidates = await loadMissingCurrentProjectionCandidates(adminClient({
    calls,
    projectionRows: [{ entity_id: "00000000-0000-4000-8000-000000000005" }],
    taskRows: taskIds.map((id) => ({ id })),
  }), "owner-1", { limit: 2, afterTaskId });

  assert.deepEqual(candidates, taskIds);
  const taskCalls = calls.filter((call) => call.table === "adhdice_clean_tasks");
  assert.deepEqual(taskCalls.find((call) => call.operation === "eq:user_id")?.value, "owner-1");
  assert.deepEqual(taskCalls.find((call) => call.operation === "is:permanently_deleted_at")?.value, null);
  assert.deepEqual(taskCalls.find((call) => call.operation === "eq:canonicalization_status")?.value, "canonical_runtime");
  assert.deepEqual(taskCalls.find((call) => call.operation === "in:entity_kind")?.value, ["parent", "step", "substep"]);
  assert.deepEqual(taskCalls.find((call) => call.operation === "gt:id")?.value, afterTaskId);
  assert.match(String(taskCalls.find((call) => call.operation === "not:id:in")?.value), /00000000-0000-4000-8000-000000000005/);
  assert.deepEqual(taskCalls.find((call) => call.operation === "order:id")?.value, { ascending: true });
  assert.deepEqual(taskCalls.find((call) => call.operation === "limit")?.value, 2);
});

test("backfill rebuilds serially, retries stale fences once, and continues after a failed Task", async () => {
  let active = 0;
  let maximumActive = 0;
  const callsByTask = new Map<string, number>();
  const logs: unknown[] = [];
  const response = await runCurrentProjectionBackfill({
    adminClient: adminClient({ taskRows: taskIds.map((id) => ({ id })) }),
    userId: "owner-1",
    request: { limit: 3, afterTaskId: null },
    now: (() => {
      let tick = 100;
      return () => tick += 7;
    })(),
    logSummary: (summary) => logs.push(summary),
    rebuild: async ({ taskId }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      const count = (callsByTask.get(taskId) ?? 0) + 1;
      callsByTask.set(taskId, count);
      if (taskId === taskIds[0] && count === 1) {
        return { status: "retryable", reason: "stale_projection_fence", message: "stale" };
      }
      if (taskId === taskIds[1]) {
        return { status: "failed", reason: "projection_write_failed", message: "failed" };
      }
      return { status: "written", projection: {} as never, writerResult: null };
    },
  });

  assert.equal(maximumActive, 1);
  assert.deepEqual([...callsByTask.values()], [2, 1, 1]);
  assert.equal(response.candidateCount, 3);
  assert.equal(response.writtenCount, 2);
  assert.equal(response.failedCount, 1);
  assert.equal(response.retryCount, 1);
  assert.equal(response.remainingCount, 0);
  assert.equal(response.nextCursor, taskIds[2]);
  assert.deepEqual(response.results, [
    { taskId: taskIds[0], status: "written" },
    { taskId: taskIds[1], status: "failed", reason: "projection_write_failed" },
    { taskId: taskIds[2], status: "written" },
  ]);
  assert.equal(logs.length, 1);
});

test("backfill reuses the trusted rebuild only and does not add canonical mutation or broad History reads", () => {
  assert.match(domainSource, /rebuildCurrentTaskProjection/);
  assert.doesNotMatch(domainSource, /adhdice_execute_task_state_command|adhdice_create_canonical_task|adhdice_task_history_facts|adhdice_task_command_operations/);
  assert.doesNotMatch(backfillSource, /\.insert\(|\.update\(|\.delete\(/);
});

test("remaining count is a narrow owner-scoped missing-projection contract", () => {
  assert.match(domainSource, /adhdice_count_missing_task_current_projections/);
  assert.match(domainSource, /remainingCount/);
  assert.match(remainingCountMigration, /task\.user_id = p_user_id/);
  assert.match(remainingCountMigration, /task\.permanently_deleted_at is null/);
  assert.match(remainingCountMigration, /task\.canonicalization_status = 'canonical_runtime'/);
  assert.match(remainingCountMigration, /task\.entity_kind in \('parent', 'step', 'substep'\)/);
  assert.match(remainingCountMigration, /not exists\s*\(\s*select 1[\s\S]*adhdice_task_current_projections/);
  assert.doesNotMatch(remainingCountMigration, /adhdice_task_history_facts|adhdice_task_command_operations/);
  assert.match(remainingCountMigration, /grant execute on function public\.adhdice_count_missing_task_current_projections\(uuid\) to service_role/);
});

test("the manual trigger is production-gated, uses the existing client, and is click-only", () => {
  assert.match(settingsSource, /process\.env\.NODE_ENV !== "production"/);
  assert.match(operatorSource, /task-current-projection-backfill/);
  assert.match(operatorSource, /CURRENT_PROJECTION_BACKFILL_BATCH_SIZE = 10/);
  assert.match(settingsSource, /Backfill 10 Projections/);
  assert.match(settingsSource, /disabled=\{isBackfillingProjections \|\| isRolloverActive\}/);
  assert.match(taskAppSource, /client=\{supabase\}/);
  assert.match(settingsSource, /onClick=\{\(\) => \{ void handleProjectionBackfill\(1\); \}\}/);
});

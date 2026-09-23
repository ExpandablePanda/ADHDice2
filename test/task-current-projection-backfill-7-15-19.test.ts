import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  loadMissingCurrentProjectionCandidates,
  parseCurrentProjectionBackfillRequest,
  runCurrentProjectionBackfill,
  type BackfillAdminClient,
} from "../supabase/functions/task-current-projection-backfill/domain.ts";

const backfillSource = readFileSync(new URL("../supabase/functions/task-current-projection-backfill/index.ts", import.meta.url), "utf8");
const domainSource = readFileSync(new URL("../supabase/functions/task-current-projection-backfill/domain.ts", import.meta.url), "utf8");
const remainingCountMigration = readFileSync(new URL("../supabase/patch_task_current_projection_backfill_remaining_count_7_15_21.sql", import.meta.url), "utf8");
const candidateMigration = readFileSync(new URL("../supabase/patch_task_current_projection_backfill_candidates_7_15_23.sql", import.meta.url), "utf8");
const operatorSource = readFileSync(new URL("../src/lib/task-current-projection-backfill-operator.ts", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/components/task-app/settings-page.tsx", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

const afterTaskId = "00000000-0000-4000-8000-000000000010";
const taskIds = [
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
];

type RpcCall = { functionName: string; args: Record<string, unknown> };

function adminClient(input: {
  candidateRows?: unknown[];
  remainingCount?: number;
  rpcCalls?: RpcCall[];
} = {}): BackfillAdminClient {
  return {
    rpc: async (functionName, args) => {
      input.rpcCalls?.push({ functionName, args });
      if (functionName === "adhdice_list_missing_task_current_projection_candidates") {
        return { data: input.candidateRows ?? taskIds.map((id) => ({ id })), error: null };
      }
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

test("zero existing projections return the first ten candidates through one bounded RPC", async () => {
  const firstTen = Array.from({ length: 10 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  }));
  const rpcCalls: RpcCall[] = [];
  const candidates = await loadMissingCurrentProjectionCandidates(adminClient({
    candidateRows: firstTen,
    rpcCalls,
  }), "owner-1", { limit: 10, afterTaskId: null });

  assert.deepEqual(candidates, firstTen.map((row) => row.id));
  assert.deepEqual(rpcCalls, [{
    functionName: "adhdice_list_missing_task_current_projection_candidates",
    args: { p_user_id: "owner-1", p_limit: 10, p_after_task_id: null },
  }]);
});

test("hundreds of existing projections still use one RPC and never serialize projection IDs", async () => {
  const existingProjectionIds = Array.from({ length: 382 }, (_, index) => (
    `00000000-0000-4000-8000-${String(index + 500).padStart(12, "0")}`
  ));
  const rpcCalls: RpcCall[] = [];
  const candidates = await loadMissingCurrentProjectionCandidates(adminClient({
    candidateRows: [{ id: taskIds[0] }],
    rpcCalls,
  }), "owner-1", { limit: 1, afterTaskId });

  assert.deepEqual(candidates, [taskIds[0]]);
  assert.equal(rpcCalls.length, 1);
  const serializedArgs = JSON.stringify(rpcCalls[0]?.args);
  assert.equal(existingProjectionIds.some((id) => serializedArgs.includes(id)), false);
  assert.deepEqual(rpcCalls[0]?.args, {
    p_user_id: "owner-1",
    p_limit: 1,
    p_after_task_id: afterTaskId,
  });
  assert.doesNotMatch(domainSource, /existingEntityIds|adhdice_task_current_projections|\.not\(/);
  assert.doesNotMatch(domainSource, /from\("adhdice_clean_tasks"\)/);
});

test("candidate RPC owns ordering, eligibility, exclusion, grants, and fail-closed prerequisites", () => {
  assert.match(candidateMigration, /create or replace function public\.adhdice_list_missing_task_current_projection_candidates\(/i);
  assert.match(candidateMigration, /p_user_id uuid[\s\S]*p_limit integer[\s\S]*p_after_task_id uuid default null/i);
  assert.match(candidateMigration, /current_user <> 'service_role'/i);
  assert.match(candidateMigration, /p_limit is null or p_limit < 1 or p_limit > 10/i);
  assert.match(candidateMigration, /task\.user_id = p_user_id/i);
  assert.match(candidateMigration, /task\.permanently_deleted_at is null/i);
  assert.match(candidateMigration, /task\.canonicalization_status = 'canonical_runtime'/i);
  assert.match(candidateMigration, /task\.entity_kind in \('parent', 'step', 'substep'\)/i);
  assert.match(candidateMigration, /p_after_task_id is null or task\.id > p_after_task_id/i);
  const exclusionClause = candidateMigration.match(/and not exists\s*\([\s\S]*?\)\s*order by task\.id asc/i)?.[0] ?? "";
  assert.match(exclusionClause, /adhdice_task_current_projections[\s\S]*projection\.user_id = task\.user_id[\s\S]*projection\.entity_id = task\.id/i);
  assert.doesNotMatch(exclusionClause, /validity/i);
  assert.match(candidateMigration, /order by task\.id asc/i);
  assert.match(candidateMigration, /limit p_limit/i);
  assert.match(candidateMigration, /revoke all on function public\.adhdice_list_missing_task_current_projection_candidates\(uuid, integer, uuid\)\s+from public, anon, authenticated/i);
  assert.match(candidateMigration, /grant execute on function public\.adhdice_list_missing_task_current_projection_candidates\(uuid, integer, uuid\)\s+to service_role/i);
  assert.doesNotMatch(candidateMigration, /create index/i);
  assert.doesNotMatch(candidateMigration, /adhdice_task_history_facts|adhdice_task_command_operations|adhdice_upsert_task_current_projection/i);
});

test("candidate RPC request preserves exact owner, limit, and afterTaskId contract", async () => {
  const rpcCalls: RpcCall[] = [];
  await loadMissingCurrentProjectionCandidates(adminClient({
    candidateRows: taskIds.slice(0, 2).map((id) => ({ id })),
    rpcCalls,
  }), "owner-1", { limit: 2, afterTaskId });

  assert.deepEqual(rpcCalls[0]?.args, {
    p_user_id: "owner-1",
    p_limit: 2,
    p_after_task_id: afterTaskId,
  });
});

test("backfill rebuilds serially, retries stale fences once, and continues after a failed Task", async () => {
  let active = 0;
  let maximumActive = 0;
  const callsByTask = new Map<string, number>();
  const logs: unknown[] = [];
  const response = await runCurrentProjectionBackfill({
    adminClient: adminClient({ candidateRows: taskIds.map((id) => ({ id })) }),
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

test("no candidates returns an empty batch without rebuilding and preserves remaining-count authority", async () => {
  let rebuildCount = 0;
  const response = await runCurrentProjectionBackfill({
    adminClient: adminClient({ candidateRows: [], remainingCount: 0 }),
    userId: "owner-1",
    request: { limit: 10, afterTaskId: null },
    rebuild: async () => {
      rebuildCount += 1;
      return { status: "written", projection: {} as never, writerResult: null };
    },
  });

  assert.equal(rebuildCount, 0);
  assert.equal(response.candidateCount, 0);
  assert.equal(response.writtenCount, 0);
  assert.equal(response.failedCount, 0);
  assert.equal(response.remainingCount, 0);
  assert.equal(response.nextCursor, null);
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/patch_bulk_task_tracking_exclusion_7_13_87.sql", import.meta.url), "utf8");
const mutations = readFileSync(new URL("../src/lib/task-db-mutations.ts", import.meta.url), "utf8");
const taskApp = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

function extractFunction(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = source.indexOf("$function$;", start);
  assert.ok(end > start, `unterminated ${name}`);
  return source.slice(start, end + "$function$;".length);
}

const rpc = extractFunction(migration, "adhdice_exclude_tasks_from_tracking");

test("7.13.87 bulk RPC is authenticated, bounded, deduplicated, and atomic", () => {
  assert.match(migration, /^-- ADHDice 7\.13\.87/m);
  assert.match(rpc, /p_task_ids uuid\[\][\s\S]*returns setof public\.adhdice_clean_tasks/i);
  assert.match(rpc, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(rpc, /p_task_ids is null|cardinality\(p_task_ids\).*0/i);
  assert.match(rpc, /array_position\(p_task_ids, null\)/i);
  assert.match(rpc, /select distinct task_id[\s\S]*unnest\(p_task_ids\)/i);
  assert.match(rpc, /cardinality\(v_task_ids\) > 200/i);
  assert.match(rpc, /permanently_deleted_at is null[\s\S]*for update/i);
  assert.match(rpc, /not owned by the authenticated user or has been permanently deleted/i);
  assert.doesNotMatch(rpc, /task\.status\s*[=!]/i);
  assert.match(migration, /revoke all on function public\.adhdice_exclude_tasks_from_tracking\(uuid\[\]\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.adhdice_exclude_tasks_from_tracking\(uuid\[\]\) to authenticated/i);
});

test("bulk RPC changes only direct flags, returns authoritative revisions, and reconciles once", () => {
  assert.match(rpc, /exclude_from_tracking is distinct from true/);
  assert.match(rpc, /revision = task\.revision \+ 1/);
  assert.match(rpc, /task\.id = any\(v_changed_task_ids\)/);
  assert.match(rpc, /entitlement\.state = 'pending'/i);
  assert.match(rpc, /set state = 'blocked'/i);
  assert.doesNotMatch(rpc, /entitlement\.state = 'fulfilled'\s*[,)]/i);
  assert.match(rpc, /state = 'blocked'/i);
  assert.match(rpc, /source_kind = 'task_history'[\s\S]*is_currently_qualifying = false/);
  assert.match(rpc, /source_kind = 'step_set'[\s\S]*step_occurrence_ids/);
  assert.equal((rpc.match(/adhdice_evaluate_achievements\(/g) ?? []).length, 1);
  assert.match(rpc, /bulk-evaluation:/);
  assert.match(rpc, /return query[\s\S]*select task\.\*[\s\S]*array_position\(v_task_ids, task\.id\)/i);
  assert.doesNotMatch(rpc, /adhdice_set_task_tracking_exclusion/);
  assert.doesNotMatch(rpc, /update public\.adhdice_task_history_facts|delete from public\.adhdice_task_history/i);
  assert.doesNotMatch(rpc, /delete from public\.adhdice_(?:task_reward|achievement)/i);
});

test("client bulk exclusion performs one bulk RPC and never loops the single-Task mutation", () => {
  const start = mutations.indexOf("export async function excludeTasksFromTracking");
  const end = mutations.indexOf("\n}\n", start);
  assert.ok(start >= 0 && end > start);
  const helper = mutations.slice(start, end);
  assert.match(helper, /new Set\(taskIds\)/);
  assert.match(helper, /client\.rpc\("adhdice_exclude_tasks_from_tracking"/);
  assert.doesNotMatch(helper, /setTaskTrackingExclusion\(/);
  assert.doesNotMatch(helper, /for\s*\(|forEach|Promise\.all/);
});

test("TaskApp bulk reconciliation merges rows and invalidates Records and streaks once", () => {
  const start = taskApp.indexOf("const excludeTasksFromTracking = useCallback");
  const end = taskApp.indexOf("const runGuardedTaskRowUpdate", start);
  assert.ok(start >= 0 && end > start);
  const bulk = taskApp.slice(start, end);
  assert.match(bulk, /excludeTasksFromTrackingRpc\(client, taskIds\)/);
  assert.match(bulk, /setTasks\(nextTasks\)/);
  assert.equal((bulk.match(/invalidateRecordsSessionSnapshotsForUser\(currentUserId\)/g) ?? []).length, 1);
  assert.equal((bulk.match(/refreshTaskHistoryStreakSummaries\(nextTasks/g) ?? []).length, 1);
  assert.doesNotMatch(bulk, /setTaskTrackingExclusionRpc/);
});

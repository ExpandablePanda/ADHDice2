import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fetchAllPagedRows, SUPABASE_READ_PAGE_SIZE } from "../src/lib/paginated-read.ts";

const workspaceData = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const rewardController = readFileSync(new URL("../src/hooks/useTaskRewardController.ts", import.meta.url), "utf8");
const health = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const focus = readFileSync(new URL("../src/hooks/useFocus.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/patch_supabase_scale_hardening_7_15_61.sql", import.meta.url), "utf8");
const appVersion = readFileSync(new URL("../src/lib/app-version.ts", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const packageLock = readFileSync(new URL("../package-lock.json", import.meta.url), "utf8");
const publicVersion = readFileSync(new URL("../public/app-version.json", import.meta.url), "utf8");
const currentState = readFileSync(new URL("../docs/CURRENT_STATE.md", import.meta.url), "utf8");

test("7.15.61 keeps the command read compact, owner-scoped, and semantically exact", () => {
  assert.match(workspaceData, /adhdice_get_latest_manual_task_commands/);
  assert.doesNotMatch(workspaceData, /from\("adhdice_task_command_operations"\)/);
  assert.match(workspaceData, /\.rpc\("adhdice_get_latest_manual_task_commands"[\s\S]*\.range\(from, to\)/);
  assert.match(migration, /create or replace function public\.adhdice_get_latest_manual_task_commands\(\s*p_entity_ids uuid\[\]/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = public, pg_temp/i);
  assert.match(migration, /operation\.user_id = v_user_id/);
  assert.match(migration, /operation\.state = 'committed'/);
  assert.match(migration, /operation\.source_kind = 'runtime'/);
  assert.match(migration, /operation\.requested_logical_date is not null/);
  assert.match(migration, /operation\.id desc/);
  assert.match(migration, /revoke all on function public\.adhdice_get_latest_manual_task_commands\(uuid\[\]\)/i);
  assert.match(migration, /grant execute on function public\.adhdice_get_latest_manual_task_commands\(uuid\[\]\)\s+to authenticated/i);
});

test("7.15.61 paginates every >1000 linked custom-food history row without partial success", async () => {
  const rows = Array.from({ length: 2001 }, (_, index) => ({ id: `meal-${index}` }));
  const ranges: Array<[number, number]> = [];
  const result = await fetchAllPagedRows(
    async (from, to) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    },
    SUPABASE_READ_PAGE_SIZE,
  );

  assert.equal(result.error, null);
  assert.deepEqual(result.data, rows);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(new Set((result.data ?? []).map((row) => row.id)).size, 2001);
  assert.match(health, /updatePreviousFoodLogs[\s\S]*fetchAllPagedRows/);
  assert.match(health, /\.eq\("source_food_id", food\.id\)/);
  assert.match(health, /\.eq\("user_id", userId\)/);
});

test("7.15.61 hardens Task, projection, boundary, reward, Health, and Focus page reads", () => {
  assert.match(workspaceData, /order\("id", \{ ascending: true \}\)/);
  assert.match(workspaceData, /loadAllTaskRows[\s\S]*fetchAllPagedRows/);
  assert.match(workspaceData, /loadLatestTaskScheduleBoundaries[\s\S]*fetchAllPagedRows/);
  assert.match(workspaceData, /loadAllCurrentTaskProjections[\s\S]*fetchAllPagedRows/);
  assert.match(workspaceData, /neq\("display_status", "trashed"\)/);
  assert.match(workspaceData, /isActiveCanonicalTaskEntityRow\(task\)/);
  assert.match(workspaceData, /source === "initial" \|\| source === "manual"/);
  assert.match(workspaceData, /scope=task-authority/);

  assert.match(rewardController, /fetchAllPagedRows/);
  assert.match(rewardController, /\.order\("created_at", \{ ascending: true \}\)/);
  assert.match(rewardController, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(rewardController, /\.is\("claimed_operation_id", null\)/);
  assert.match(rewardController, /queueLoadInFlightRef/);

  assert.match(health, /fetchAllPagedRows/);
  assert.match(health, /adhdice_health_meal_entries.*select\("id,user_id,entry_date/);
  assert.match(health, /healthRemoteAuthorityRef/);
  assert.match(health, /healthHydrationInFlightRef/);
  assert.match(health, /cachedRemoteAuthority/);
  assert.match(health, /function refreshHealth/);

  assert.match(focus, /!historyActive/);
  assert.match(focus, /focusHistoryLoadInFlightRef/);
  assert.match(focus, /select\("id,user_id,category_id,title_snapshot,focus_type_snapshot,focus_subtype_snapshot,focus_subtype_2_snapshot,session_date,duration_seconds,notes,started_at,ended_at,source,runtime_session_id,created_at"\)/);
  assert.match(focus, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(focus, /fetchAllPagedRows/);
});

test("7.15.61 migration limits database work to additive scale/RLS/index changes", () => {
  assert.match(migration, /create or replace function public\.adhdice_get_latest_task_schedule_boundaries/i);
  assert.match(migration, /order by latest_boundary\.entity_id/i);
  assert.match(migration, /create index if not exists adhdice_health_meal_entries_user_source_food_idx[\s\S]*\(user_id, source_food_id\)/i);
  for (const policy of [
    "Users can read their own clean tasks",
    "Users can create their own clean tasks",
    "Users can update their own clean tasks",
    "Users can delete their own clean tasks",
    "Users can read their own focus sessions",
    "Users can create their own focus sessions",
    "Users can update their own focus sessions",
    "Users can delete their own focus sessions",
    "Users can manage their own health meal entries",
    "Users can read own pending reward dice items",
  ]) {
    assert.match(migration, new RegExp(`create policy "${policy}"[\\s\\S]*\\(select auth\\.uid\\(\\)\\)`, "i"), policy);
  }
  assert.doesNotMatch(migration, /\b(delete from|truncate|drop table)\b/i);
});

test("7.16.0 version surfaces and current-state release note are aligned", () => {
  assert.match(appVersion, /APP_VERSION = "7\.16\.0"/);
  assert.match(packageJson, /"version": "7\.16\.0"/);
  assert.match(packageLock, /"version": "7\.16\.0"/);
  assert.match(publicVersion, /"version": "7\.16\.0"/);
  assert.match(currentState, /Current working app version: `7\.16\.0`/);
  assert.match(currentState, /7\.15\.61 Supabase scale hardening and refresh diet/);
});

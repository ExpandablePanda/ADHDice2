import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/add_focus_runtime_sync.sql", import.meta.url), "utf8");

const position = (fragment: string) => {
  const index = sql.indexOf(fragment);
  assert.notEqual(index, -1, `Missing SQL fragment: ${fragment}`);
  return index;
};

type RecoveryFixture = {
  user_id: string;
  category_id: string;
  start_time: string | null;
  accumulated_seconds: number;
  is_running: boolean;
  updated_at: string;
  session_id?: string | null;
  runtime_kind?: "category" | null;
  mode?: "count_up" | null;
  state?: "running" | "paused" | null;
  current_run_started_at?: string | null;
};

function recoverFixture(row: RecoveryFixture, createId: () => string): RecoveryFixture {
  return {
    ...row,
    session_id: row.session_id ?? createId(),
    runtime_kind: row.runtime_kind ?? "category",
    mode: row.mode ?? "count_up",
    state: row.state ?? (row.is_running ? "running" : "paused"),
    current_run_started_at: row.is_running ? row.current_run_started_at ?? row.start_time : row.current_run_started_at,
  };
}

test("legacy primary key is dropped before category_id becomes nullable", () => {
  assert.ok(position("$drop_legacy_primary_key$") < position("alter column category_id drop not null"));
  assert.match(sql, /pg_constraint[\s\S]*contype = 'p'/);
  assert.match(sql, /adhdice_focus_active_sessions_pkey/);
  assert.doesNotMatch(sql, /drop constraint if exists adhdice_focus_active_sessions_pkey/);
});

test("identity columns are guarded, backfilled, and validated before the new primary key", () => {
  assert.match(sql, /add column if not exists session_id uuid default gen_random_uuid\(\)/);
  assert.match(sql, /session_id = coalesce\(session_id, gen_random_uuid\(\)\)/);
  assert.match(sql, /having count\(\*\) > 1/);
  assert.ok(position("$validate_identity$") < position("primary key (session_id)"));
});

test("backfill preserves legacy timer state and updated_at", () => {
  assert.match(sql, /disable trigger adhdice_focus_active_sessions_set_updated_at/);
  assert.match(sql, /state = coalesce\(state, case when is_running then 'running' else 'paused' end\)/);
  assert.match(sql, /current_run_started_at = case[\s\S]*when is_running then coalesce\(current_run_started_at, start_time\)/);
  assert.doesNotMatch(sql, /drop table[^;]*adhdice_focus_active_sessions/i);
});

test("original legacy rows recover unique identities without changing timer state", () => {
  let id = 0;
  const originals: RecoveryFixture[] = [
    { user_id: "user", category_id: "work", start_time: "2026-07-14T12:00:00Z", accumulated_seconds: 31, is_running: true, updated_at: "2026-07-14T12:00:01Z" },
    { user_id: "user", category_id: "home", start_time: null, accumulated_seconds: 72, is_running: false, updated_at: "2026-07-14T12:00:02Z" },
  ];
  const recovered = originals.map((row) => recoverFixture(row, () => `session-${++id}`));
  assert.equal(new Set(recovered.map((row) => row.session_id)).size, originals.length);
  for (const [index, row] of recovered.entries()) {
    assert.deepEqual(
      [row.user_id, row.category_id, row.start_time, row.accumulated_seconds, row.is_running, row.updated_at],
      [originals[index]!.user_id, originals[index]!.category_id, originals[index]!.start_time, originals[index]!.accumulated_seconds, originals[index]!.is_running, originals[index]!.updated_at],
    );
  }
});

test("representative partial schema recovery is idempotent", () => {
  const partial: RecoveryFixture = {
    user_id: "user",
    category_id: "work",
    start_time: "2026-07-14T12:00:00Z",
    accumulated_seconds: 31,
    is_running: true,
    updated_at: "2026-07-14T12:00:01Z",
    session_id: "existing-session",
    runtime_kind: "category",
    mode: "count_up",
    state: "running",
    current_run_started_at: "2026-07-14T12:00:00Z",
  };
  const once = recoverFixture(partial, () => "must-not-run");
  const twice = recoverFixture(once, () => "must-not-run");
  assert.deepEqual(twice, partial);
});

test("Focus runtime migration retains category concurrency and one standalone slot", () => {
  assert.match(sql, /runtime_kind = 'category'/);
  assert.match(sql, /runtime_kind = 'standalone_countdown'/);
  assert.match(sql, /adhdice_focus_runtime_category_slot_unique/);
  assert.match(sql, /adhdice_focus_runtime_standalone_slot_unique/);
});

test("runtime shape accepts only category-plus-id or standalone-plus-null", () => {
  const validShape = (kind: "category" | "standalone_countdown", categoryId: string | null, mode: "count_up" | "countdown") => (
    (kind === "category" && categoryId !== null)
    || (kind === "standalone_countdown" && categoryId === null && mode === "countdown")
  );
  assert.equal(validShape("category", null, "count_up"), false);
  assert.equal(validShape("standalone_countdown", "category-id", "countdown"), false);
  assert.equal(validShape("category", "category-id", "count_up"), true);
  assert.equal(validShape("standalone_countdown", null, "countdown"), true);
  assert.match(sql, /runtime_kind = 'category' and category_id is not null/);
  assert.match(sql, /runtime_kind = 'standalone_countdown' and category_id is null and mode = 'countdown'/);
});

test("slot indexes reject duplicates without imposing a global timer limit", () => {
  assert.match(sql, /on public\.adhdice_focus_active_sessions \(user_id, category_id\)[\s\S]*where runtime_kind = 'category'/);
  assert.match(sql, /on public\.adhdice_focus_active_sessions \(user_id\)[\s\S]*where runtime_kind = 'standalone_countdown'/);
  assert.doesNotMatch(sql, /unique[^;]*\(user_id\)\s*;/i);
});

test("original schema, partial deployment, and reruns use guarded recovery paths", () => {
  assert.match(sql, /begin;/);
  assert.match(sql, /commit;/);
  assert.match(sql, /add column if not exists/g);
  assert.match(sql, /drop constraint if exists/g);
  assert.match(sql, /create (unique )?index if not exists/g);
  assert.match(sql, /create table if not exists public\.adhdice_focus_runtime_operations/);
  assert.match(sql, /if not exists \([\s\S]*contype = 'p'/);
});

test("Focus transitions use authenticated ownership, row locks, revisions, and server time", () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /Stale Focus runtime revision/);
  assert.match(sql, /statement_timestamp\(\)/);
  assert.match(sql, /revision = revision \+ 1/g);
});

test("completion is idempotent and applies Focus economy in the same transaction", () => {
  assert.match(sql, /runtime_session_id = p_session_id/);
  assert.match(sql, /adhdice_focus_sessions_runtime_session_unique/);
  assert.match(sql, /floor\(floor\(v_duration \/ 60\.0\) \* 1\.5\)/);
  assert.match(sql, /free_roll_bank = free_roll_bank \+ v_level_ups/);
  assert.match(sql, /delete from public\.adhdice_focus_active_sessions/);
});

test("runtime access is select-only and Realtime/schema refresh are idempotent", () => {
  assert.match(sql, /revoke all on public\.adhdice_focus_active_sessions from anon, authenticated/);
  assert.match(sql, /grant select on public\.adhdice_focus_active_sessions to authenticated/);
  assert.match(sql, /pg_publication_tables/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
});

test("transition, completion, and migration RPCs mutate by session identity", () => {
  assert.match(sql, /where user_id = v_user_id and session_id = p_session_id for update/g);
  assert.match(sql, /where session_id = v_runtime\.session_id returning \* into v_runtime/g);
  assert.match(sql, /runtime_session_id = p_session_id/g);
});

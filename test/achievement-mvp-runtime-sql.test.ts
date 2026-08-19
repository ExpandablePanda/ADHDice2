import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildTaskAchievementLogicalDedupeKey } from "../src/lib/achievements-mvp/identity.ts";

const migration = readFileSync(new URL("../supabase/add_achievement_mvp_runtime.sql", import.meta.url), "utf8");
const digestFixMigration = readFileSync(new URL("../supabase/fix_achievement_digest_schema_6_29_46.sql", import.meta.url), "utf8");
const stepSetFixMigration = readFileSync(new URL("../supabase/fix_achievement_step_set_requalification_6_29_48.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const taskCaptureStart = migration.indexOf("create or replace function public.adhdice_capture_task_achievement_occurrence");
const taskCaptureFunction = migration.slice(
  taskCaptureStart,
  migration.indexOf("$function$;", taskCaptureStart) + "$function$;".length,
);
const extractStepSetRefreshFunction = (sql: string) => {
  const start = sql.indexOf("create or replace function public.adhdice_refresh_achievement_step_set");
  const end = sql.indexOf("$function$;", start) + "$function$;".length;
  return sql.slice(start, end);
};

test("runtime migration is represented exactly in the consolidated schema", () => {
  assert.equal(schema.includes(migration.trim()), true);
});

test("Achievement digest calls are schema-qualified and compatible with an empty search path", () => {
  const achievementSql = [migration, digestFixMigration, schema];
  const unqualifiedDigest = /(^|[^A-Za-z0-9_.])digest\s*\(/gm;

  for (const sql of achievementSql) {
    assert.doesNotMatch(sql, unqualifiedDigest);
  }

  assert.match(migration, /set search_path = ''[\s\S]*extensions\.digest\(v_occurrence_ids::text, 'sha256'::text\)/);
  assert.match(migration, /extensions\.digest\(v_set_key::text, 'sha256'::text\)/);
  assert.match(migration, /extensions\.digest\(required_tracks::text, 'sha256'::text\)/);
});

test("digest forward migration is idempotent and represented exactly in the consolidated schema", () => {
  assert.equal(schema.includes(digestFixMigration.trim()), true);
  assert.match(digestFixMigration, /foreach v_signature in array array\[/);
  assert.match(digestFixMigration, /pg_get_functiondef\(v_target\)/);
  assert.match(digestFixMigration, /extensions\.digest\(v_occurrence_ids::text, ''sha256''::text\)/);
  assert.match(digestFixMigration, /extensions\.digest\(v_set_key::text, ''sha256''::text\)/);
  assert.match(digestFixMigration, /extensions\.digest\(required_tracks::text, ''sha256''::text\)/);
  assert.match(digestFixMigration, /execute v_rewritten/);
  assert.doesNotMatch(digestFixMigration, /\b(delete|truncate)\s+from\b/i);
});

test("digest forward migration checks every canonical prerequisite signature", () => {
  const checkedSignatures = [...digestFixMigration.matchAll(/'public\.(adhdice_[a-z_]+\([^']+\))'/g)]
    .map((match) => `public.${match[1]}`);

  assert.deepEqual(checkedSignatures, [
    "public.adhdice_refresh_achievement_step_set(uuid,uuid)",
    "public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamp with time zone)",
  ]);
  assert.match(migration, /function public\.adhdice_refresh_achievement_step_set\(p_user_id uuid, p_root_parent_id uuid\)/);
  assert.match(migration, /function public\.adhdice_rebuild_achievement_progress\(\s*p_user_id uuid, p_run_id uuid, p_awarded_at timestamptz\s*\)/);
  assert.doesNotMatch(digestFixMigration, /adhdice_refresh_achievement_step_set\(uuid\)'/);
});

test("digest forward migration validates every prerequisite before schema mutation", () => {
  const replacementLoop = digestFixMigration.indexOf("foreach v_target in array v_targets loop");
  const firstExecute = digestFixMigration.indexOf("execute v_rewritten");

  assert.ok(replacementLoop > digestFixMigration.indexOf("to_regprocedure(v_signature)"));
  assert.ok(replacementLoop > digestFixMigration.indexOf("v_targets := array_append"));
  assert.ok(firstExecute > replacementLoop);
  assert.equal(digestFixMigration.slice(0, replacementLoop).includes("execute "), false);
});

test("Step-set requalification forward migration exactly replaces the canonical function without data mutation", () => {
  const canonicalFunction = extractStepSetRefreshFunction(migration);
  const forwardFunction = extractStepSetRefreshFunction(stepSetFixMigration);

  assert.equal(schema.includes(stepSetFixMigration.trim()), true);
  assert.equal(forwardFunction, canonicalFunction);
  assert.match(forwardFunction, /language plpgsql security definer\s+set search_path = ''/);
  assert.match(stepSetFixMigration, /^begin;[\s\S]*notify pgrst, 'reload schema';\s*commit;\s*$/m);
  assert.doesNotMatch(stepSetFixMigration, /\b(delete|truncate|alter)\s+(?:table|from)\b/i);
});

test("Step-set refresh uses current membership and qualifying Step occurrences without live status gating", () => {
  const refreshFunction = extractStepSetRefreshFunction(migration);

  assert.match(refreshFunction, /with recursive steps as \([\s\S]*parent_task_id = p_root_parent_id/);
  assert.match(refreshFunction, /from public\.adhdice_achievement_occurrences occ join steps on steps\.id = occ\.entity_id/);
  assert.match(refreshFunction, /where is_currently_qualifying/);
  assert.match(refreshFunction, /v_occurrence_count <> v_step_count then return null/);
  assert.doesNotMatch(refreshFunction, /steps\.status/);
  assert.doesNotMatch(refreshFunction, /status::text in \('done', 'complete', 'did_my_best'\)/);
  assert.match(refreshFunction, /outcome_snapshot[\s\S]*p_root_parent_id, v_title, 'done'/);
  assert.match(refreshFunction, /on conflict \(user_id, dedupe_key\) do update set is_currently_qualifying = true/);
});

test("canonical Task History facts and completed Focus sessions capture through database triggers", () => {
  assert.match(migration, /after insert or update of entity_id, entity_kind, logical_date, outcome, event_kind,[\s\S]*on public\.adhdice_task_history_facts/);
  assert.match(migration, /after insert or update of duration_seconds, session_date, title_snapshot, ended_at[\s\S]*on public\.adhdice_focus_sessions/);
  assert.doesNotMatch(migration, /adhdice_task_subtasks/);
  assert.match(migration, /drop trigger if exists adhdice_capture_task_achievement_runtime on public\.adhdice_task_history;/);
  assert.match(migration, /drop trigger if exists adhdice_deactivate_deleted_task_achievement_runtime on public\.adhdice_task_history;/);
  assert.match(migration, /after delete on public\.adhdice_task_history_facts/);
  assert.match(migration, /after delete on public\.adhdice_focus_sessions/);
  assert.match(migration, /not exists \(select 1 from public\.adhdice_clean_tasks where id=old\.entity_id/);
  assert.match(schema, /after insert or update of status, was_completed, occurrence_key, occurrence_due_on\s+on public\.adhdice_task_history[\s\S]*adhdice_link_task_duration_evidence/);
});

test("activation uses source creation and stored logical-date gates", () => {
  assert.match(migration, /new\.source_created_at < v_profile\.activated_at/);
  assert.match(migration, /v_history\.created_at < v_profile\.activated_at/);
  assert.match(migration, /v_session\.created_at < v_profile\.activated_at/);
  assert.match(migration, /v_history\.logical_date < public\.adhdice_achievement_logical_date/);
  assert.match(migration, /v_session\.session_date < public\.adhdice_achievement_logical_date/);
});

test("evaluation is locked, monotonic, and notification-idempotent", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_user_id::text \|\| ':achievement-evaluation'/);
  assert.match(migration, /on conflict \(user_id, track_id, tier\) do nothing/);
  assert.match(migration, /on conflict \(user_id, collection_id, mastery_version\) do nothing/);
  assert.match(migration, /on conflict \(user_id, dedupe_key\) do nothing/g);
  assert.doesNotMatch(migration, /delete from public\.adhdice_achievement_(tier_awards|collection_awards)/);
});

test("canonical History SQL identity formula preserves the Task Achievement namespace", () => {
  assert.equal(
    buildTaskAchievementLogicalDedupeKey({ entityKind: "parent_task", entryDate: "2026-07-17", occurrenceKey: "occurrence:2026-07-17", repeatFrequency: "daily", taskId: "task-a" }),
    "occurrence:v1:task_history:parent_task:task-a:occurrence%3A2026-07-17",
  );
  assert.match(taskCaptureFunction, /v_history public\.adhdice_task_history_facts%rowtype/);
  assert.match(taskCaptureFunction, /v_history\.outcome in \('done', 'complete', 'did_my_best'\)/);
  assert.match(taskCaptureFunction, /v_canonical_occurrence_key/);
  assert.match(taskCaptureFunction, /when v_history\.event_kind = 'terminal_complete' then 'lifetime:' \|\| v_history\.entity_id::text/);
  assert.match(taskCaptureFunction, /else 'logical-date:' \|\| v_history\.logical_date::text/);
  assert.match(taskCaptureFunction, /v_dedupe_key := 'occurrence:v1:task_history:' \|\| v_entity_kind \|\| ':' \|\| v_history\.entity_id::text \|\| ':' \|\| v_logical_occurrence_part/);
  assert.match(taskCaptureFunction, /source_id = v_history\.id::text/);
  assert.match(taskCaptureFunction, /source_kind = 'task_history'/);
  assert.doesNotMatch(taskCaptureFunction, /adhdice_task_history(?!_facts)/);
  assert.doesNotMatch(taskCaptureFunction, /v_dedupe_key := 'occurrence:v1:task_history:' \|\| v_source_key/);
});

test("recalculation is cursor-based, bounded, retryable, and uses the same capture functions", () => {
  assert.match(migration, /adhdice_recalculate_achievements\([\s\S]*p_cursor jsonb[\s\S]*p_batch_size integer/);
  assert.match(migration, /limit p_batch_size\+1/);
  assert.match(migration, /adhdice_capture_task_achievement_occurrence\(v_record\.source_id\)/);
  assert.match(migration, /adhdice_capture_focus_achievement_occurrence\(v_record\.source_id\)/);
  assert.match(migration, /from public\.adhdice_task_history_facts fact/);
  assert.doesNotMatch(migration.slice(migration.indexOf("create or replace function public.adhdice_recalculate_achievements")), /from public\.adhdice_task_history history/);
  assert.match(migration, /'has_more',v_has_more,'next_cursor',v_next_cursor/);
});

test("all 18 tracks and exact Focus thresholds are present in server evaluation", () => {
  const trackRows = [...migration.matchAll(/\('([a-z_]+)','bronze',/g)].map((match) => match[1]);
  assert.equal(new Set(trackRows).size, 18);
  assert.match(migration, /\('broken_clock','bronze',14400,1\)/);
  assert.match(migration, /\('locked_in','platinum',3600000,4\)/);
  assert.match(migration, /active_duration_seconds >= 600/);
  assert.match(migration, /sum\(active_duration_seconds\) >= 1800/);
});

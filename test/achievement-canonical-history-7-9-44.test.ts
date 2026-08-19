import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync("supabase/add_achievement_mvp_runtime.sql", "utf8");
const patch = readFileSync("supabase/patch_achievement_canonical_history_7_9_44.sql", "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");
const renamedParameter = ["p_history", "fact_id"].join("_");

function extractFunction(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = sql.indexOf("$function$;", start) + "$function$;".length;
  return sql.slice(start, end);
}

const capture = extractFunction(runtime, "adhdice_capture_task_achievement_occurrence");
const patchCapture = extractFunction(patch, "adhdice_capture_task_achievement_occurrence");
const trigger = extractFunction(runtime, "adhdice_capture_and_evaluate_achievement_source");
const deactivate = extractFunction(runtime, "adhdice_deactivate_deleted_achievement_source");
const recalculate = extractFunction(runtime, "adhdice_recalculate_achievements");
const reconcile = patch.slice(patch.indexOf("do $reconcile$"), patch.indexOf("$reconcile$;") + "$reconcile$;".length);
const runtimeTaskSource = recalculate.slice(recalculate.indexOf("with sources as"), recalculate.indexOf("union all"));

function assertReducedTaskSourcePredicate(source: string) {
  assert.match(source, /fact\.outcome\s+in\s*\('done',\s*'complete',\s*'did_my_best'\)/);
  assert.match(source, /or\s+exists\s*\([\s\S]*occurrence\.user_id\s*=\s*fact\.user_id/);
  assert.match(source, /occurrence\.source_kind\s*=\s*'task_history'/);
  assert.match(source, /occurrence\.source_id\s*=\s*fact\.id::text/);
  assert.match(source, /fact\.source_legacy_history_id\s+is\s+not\s+null[\s\S]*occurrence\.source_id\s*=\s*fact\.source_legacy_history_id::text/);
  assert.match(source, /occurrence\.source_snapshot->>'history_fact_id'\s*=\s*fact\.id::text/);
  assert.match(source, /occurrence\.entity_id\s*=\s*fact\.entity_id\s+and\s+occurrence\.logical_date\s*=\s*fact\.logical_date/);
  assert.match(source, /and\s*\(\s*fact\.outcome[\s\S]*or\s+exists/);
}

test("Task Achievement capture preserves the PostgreSQL-compatible parameter name", () => {
  assert.match(capture, /create or replace function public\.adhdice_capture_task_achievement_occurrence\(p_history_id uuid\)/);
  assert.match(patchCapture, /create or replace function public\.adhdice_capture_task_achievement_occurrence\(p_history_id uuid\)/);
  assert.match(runtime, /legacy p_history_id name is intentional[\s\S]*cannot rename an input parameter/);
  assert.match(patch, /legacy p_history_id name is intentional[\s\S]*cannot rename an input parameter/);
  assert.match(capture, /v_history public\.adhdice_task_history_facts%rowtype/);
  assert.match(capture, /from public\.adhdice_task_history_facts where id = p_history_id/);
  assert.match(patchCapture, /from public\.adhdice_task_history_facts where id = p_history_id/);
  assert.match(schema, /create or replace function public\.adhdice_capture_task_achievement_occurrence\(p_history_id uuid\)/);
  assert.doesNotMatch(capture, new RegExp(renamedParameter));
  assert.doesNotMatch(patchCapture, new RegExp(renamedParameter));
  assert.match(capture, /set source_id = v_history\.id::text/);
  assert.match(capture, /source_kind = 'task_history'/);
  assert.doesNotMatch(capture, /adhdice_task_history(?!_facts)/);
});

test("canonical outcome qualification is closed over the three successful outcomes", () => {
  assert.match(capture, /v_qualified := v_history\.outcome in \('done', 'complete', 'did_my_best'\)/);
  assert.match(capture, /is_currently_qualifying = v_qualified/);
  assert.match(runtime, /outcome_snapshot in \('done', 'complete', 'did_my_best', 'missed', 'delayed'\)/);
});

test("existing occurrences use ordered A/B/C source precedence before Task/date fallback", () => {
  assert.match(capture, /source_legacy_history_id/);
  assert.match(capture, /occurrence\.entity_id\s*=\s*v_history\.entity_id\s+and\s+occurrence\.logical_date\s*=\s*v_history\.logical_date/);
  assert.match(capture, /v_match_tier integer := 0/);
  assert.match(capture, /Ambiguous Achievement tier A mapping/);
  assert.match(capture, /Ambiguous Achievement tier B mapping/);
  assert.match(capture, /Ambiguous Achievement tier C mapping/);
  assert.match(capture, /v_match_tier = 0 and v_history\.source_legacy_history_id/);
  assert.match(capture, /v_match_tier = 0[\s\S]*source_snapshot->>'history_fact_id'[\s\S]*v_match_tier = 0[\s\S]*entity_id = v_history\.entity_id/);
  assert.doesNotMatch(capture, /and \([\s\S]*source_id = v_history\.id::text[\s\S]*logical_date = v_history\.logical_date[\s\S]*\);/);
  assert.match(capture, /if v_existing\.id is not null then[\s\S]*set source_id = v_history\.id::text/);
  assert.doesNotMatch(capture, /Ambiguous Achievement logical mapping/);
});

test("Tier E only resolves an exact canonical logical identity after zero-row Tier D", () => {
  const dedupeIndex = capture.indexOf("v_dedupe_key :=");
  const tierEIndex = capture.indexOf("-- Tier E is a logical-identity bridge");
  const insertIndex = capture.indexOf("insert into public.adhdice_achievement_occurrences");
  assert.ok(dedupeIndex >= 0 && tierEIndex > dedupeIndex && tierEIndex < insertIndex);
  assert.match(capture, /if v_match_tier = 0 and v_match_count = 0 and not v_fallback_ambiguous then/);
  assert.match(capture, /occurrence\.dedupe_key = v_dedupe_key/);
  assert.match(capture, /Ambiguous Achievement tier E mapping/);
  assert.match(capture, /v_match_tier := 5/);
  assert.match(capture, /if v_existing\.id is not null then[\s\S]*set source_id = v_history\.id::text/);
});

test("repeated terminal completions reuse one lifetime occurrence without overriding Tier D ambiguity", () => {
  const tierDIndex = capture.indexOf("v_fallback_ambiguous := v_match_count > 1;");
  const tierEIndex = capture.indexOf("-- Tier E is a logical-identity bridge");
  assert.ok(tierDIndex >= 0 && tierEIndex > tierDIndex);
  assert.match(capture, /when v_history\.event_kind = 'terminal_complete' then 'lifetime:' \|\| v_history\.entity_id::text/);
  assert.match(capture, /v_dedupe_key := 'occurrence:v1:task_history:' \|\| v_entity_kind/);
  assert.match(capture, /if v_match_tier = 0 and v_match_count = 0 and not v_fallback_ambiguous then/);
  assert.match(capture, /where occurrence\.id = v_existing\.id[\s\S]*returning occurrence\.id into v_occurrence_id/);
  assert.doesNotMatch(capture.slice(tierEIndex, insertIndex(capture)), /delete from public\.adhdice_achievement_occurrences/);
});

test("Tier E preserves the existing row identity and dedupe key across SQL definitions", () => {
  const existingUpdateStart = capture.indexOf("if v_existing.id is not null then\n    update public.adhdice_achievement_occurrences occurrence");
  const existingUpdate = capture.slice(existingUpdateStart, insertIndex(capture));
  assert.equal(patchCapture, capture);
  assert.match(existingUpdate, /where occurrence\.id = v_existing\.id/);
  assert.doesNotMatch(existingUpdate, /dedupe_key\s*=/);
});

function insertIndex(sql: string) {
  return sql.indexOf("insert into public.adhdice_achievement_occurrences");
}

test("strong matches win over same-date siblings and dequalify stale evidence without deletion", () => {
  const firstCleanup = capture.indexOf("'superseded_by_history_fact_id'");
  assert.ok(firstCleanup > 0);
  assert.match(capture.slice(firstCleanup), /stale_same_day_evidence', true/);
  assert.match(capture, /sibling\.id <> v_occurrence_id/);
  assert.match(capture, /set is_currently_qualifying = false/);
  assert.doesNotMatch(capture, /delete from public\.adhdice_achievement_occurrences/);
  assert.doesNotMatch(capture, /delete from public\.adhdice_achievement_(tier_awards|collection_awards|notifications)/);
});

test("true Task/date ambiguity preserves stale rows and creates a canonical fallback occurrence", () => {
  assert.match(capture, /v_fallback_ambiguous boolean := false/);
  assert.match(capture, /v_fallback_ambiguous := v_match_count > 1/);
  assert.match(capture, /if not v_qualified and not v_fallback_ambiguous then/);
  assert.match(capture, /v_profile\.catalog_version, v_qualified/);
  assert.match(capture, /v_history\.occurrence_id is not null/);
  assert.match(capture, /else 'logical-date:' \|\| v_history\.logical_date::text/);
  assert.match(capture, /logical_dedupe_key', coalesce\(v_existing\.dedupe_key, v_dedupe_key\)/);
});

test("canonical source identity, dedupe identity, awards, and reruns remain protected", () => {
  assert.match(capture, /set source_id = v_history\.id::text/);
  assert.match(capture, /logical_dedupe_key', coalesce\(v_existing\.dedupe_key, v_dedupe_key\)/);
  assert.match(runtime, /on conflict \(user_id, source_kind, source_id\)/);
  assert.doesNotMatch(patch, /delete from public\.adhdice_achievement_(tier_awards|collection_awards|notifications)/);
  assert.match(patch, /achievement-canonical-history-7\.9\.46/);
});

test("canonical occurrence evidence wins over mutable Task recurrence", () => {
  assert.match(capture, /from public\.adhdice_task_occurrences occurrence/);
  assert.match(capture, /when nullif\(btrim\(v_canonical_occurrence_key\), ''\) is not null/);
  assert.match(capture, /when v_history\.event_kind = 'terminal_complete' then 'lifetime:'/);
  assert.match(capture, /else 'logical-date:' \|\| v_history\.logical_date::text/);
  assert.doesNotMatch(capture, /v_task\.repeat_frequency/);
});

test("contradictory canonical outcomes and missing live facts cannot remain current", () => {
  assert.match(capture, /outcome_snapshot = v_history\.outcome,[\s\S]*is_currently_qualifying = v_qualified/);
  assert.match(recalculate, /not exists \([\s\S]*from public\.adhdice_task_history_facts fact[\s\S]*fact\.logical_date=occurrence\.logical_date/);
  assert.doesNotMatch(recalculate, /from public\.adhdice_task_history history/);
});

test("deleted Task achievement history is preserved while canonical source evidence can migrate", () => {
  assert.match(capture, /Deleted Tasks retain their Achievement-owned history and awards/);
  assert.match(capture, /'deleted_task_preserved', true/);
  assert.match(deactivate, /not exists \(select 1 from public\.adhdice_clean_tasks where id=old\.entity_id/);
  assert.match(deactivate, /return old/);
});

test("canonical INSERT/UPDATE and DELETE triggers drive capture, evaluation, and Step-set refresh", () => {
  assert.match(trigger, /tg_table_name='adhdice_task_history_facts'/);
  assert.match(trigger, /adhdice_capture_task_achievement_occurrence\(new\.id\)/);
  assert.match(trigger, /adhdice_refresh_achievement_step_set/);
  assert.match(runtime, /on public\.adhdice_task_history_facts for each row\s+execute function public\.adhdice_capture_and_evaluate_achievement_source/);
  assert.match(runtime, /after delete on public\.adhdice_task_history_facts for each row/);
  assert.match(deactivate, /adhdice_evaluate_achievements/);
});

test("Focus capture remains on Focus sessions and old History duration integration remains", () => {
  const focusCapture = extractFunction(runtime, "adhdice_capture_focus_achievement_occurrence");
  assert.match(focusCapture, /public\.adhdice_focus_sessions/);
  assert.match(runtime, /on public\.adhdice_focus_sessions for each row/);
  assert.match(schema, /adhdice_link_task_duration_evidence/);
  assert.match(schema, /on public\.adhdice_task_history/);
});

test("recalculation is canonical-only, resumable, Step-set-aware, and award-preserving", () => {
  assert.match(recalculate, /from public\.adhdice_task_history_facts fact/);
  assert.match(recalculate, /limit p_batch_size\+1/);
  assert.match(recalculate, /adhdice_refresh_achievement_step_set/);
  assert.match(recalculate, /adhdice_rebuild_achievement_progress/);
  assert.doesNotMatch(recalculate, /delete from public\.adhdice_achievement_(tier_awards|collection_awards|notifications)/);
});

test("one-time reconciliation and resumable Task sources use the reduced evidence predicate", () => {
  assertReducedTaskSourcePredicate(reconcile);
  assertReducedTaskSourcePredicate(runtimeTaskSource);
  assert.match(reconcile, /adhdice_capture_task_achievement_occurrence\(v_record\.id\)/);
  assert.match(runtimeTaskSource, /fact\.id\s+source_id/);
  assert.doesNotMatch(patch, /\b(?:8245|717|7528|730|1500)\b/);
});

test("Focus-source selection and cursor semantics remain unchanged while Task sources narrow", () => {
  assert.match(recalculate, /select session\.created_at,'focus_session',session\.id[\s\S]*where session\.user_id=v_user_id and session\.created_at>=v_profile\.activated_at[\s\S]*session\.session_date>=public\.adhdice_achievement_logical_date/);
  assert.match(recalculate, /where \(created_at,source_kind,source_id\)>\(v_last_created_at,v_last_kind,v_last_id\)/);
  assert.match(recalculate, /order by created_at,source_kind,source_id limit p_batch_size\+1/);
});

test("7.9.48 reconciliation derives missed evidence and is idempotent without hardcoded live counts", () => {
  assert.match(patch, /for v_record in[\s\S]*from public\.adhdice_task_history_facts fact/);
  assert.match(patch, /adhdice_capture_task_achievement_occurrence\(v_record\.id\)/);
  assert.match(patch, /achievement-canonical-history-7\.9\.46/);
  assert.doesNotMatch(patch, /\b214\b|\b572\b|\b517\b|\b70\b/);
  assert.match(runtime, /on conflict \(user_id, track_id, tier\) do nothing/);
  assert.match(runtime, /on conflict \(user_id, collection_id, mastery_version\) do nothing/);
});

test("old Achievement triggers are explicitly removed without dropping the legacy table", () => {
  assert.match(patch, /drop trigger if exists adhdice_capture_task_achievement_runtime on public\.adhdice_task_history/);
  assert.match(patch, /drop trigger if exists adhdice_deactivate_deleted_task_achievement_runtime on public\.adhdice_task_history/);
  assert.doesNotMatch(patch, /drop table public\.adhdice_task_history/);
  assert.doesNotMatch(patch, /drop trigger if exists adhddice_link_task_duration_evidence/);
});

test("runtime and consolidated schema stay aligned", () => {
  assert.equal(schema.includes(runtime.trim()), true);
});

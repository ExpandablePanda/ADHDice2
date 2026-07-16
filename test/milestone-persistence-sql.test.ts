import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/add_milestones_foundation.sql", import.meta.url), "utf8");

test("Milestone migration creates the isolated persistence tables and identity constraints", () => {
  assert.match(sql, /create table if not exists public\.adhdice_milestones/i);
  assert.match(sql, /task_id uuid references public\.adhdice_clean_tasks\(id\) on delete set null/i);
  assert.match(sql, /create unique index if not exists adhdice_milestones_task_identity_unique[\s\S]*where task_id is not null/i);
  assert.match(sql, /current_aura_deadline = current_target_date \+ 3/i);
  assert.match(sql, /create table if not exists public\.adhdice_milestone_events/i);
  assert.match(sql, /unique \(user_id, operation_id, event_type\)/i);
  assert.match(sql, /create table if not exists public\.adhdice_milestone_reminders/i);
  assert.match(sql, /unique \(milestone_id, kind, schedule_version\)/i);
});

test("Milestone tables expose read-only authenticated RLS while mutations stay RPC-only", () => {
  assert.match(sql, /alter table public\.adhdice_milestones enable row level security/i);
  assert.match(sql, /on public\.adhdice_milestones for select[\s\S]*auth\.uid\(\) = user_id/i);
  assert.match(sql, /revoke all on public\.adhdice_milestones from anon, authenticated/i);
  assert.doesNotMatch(sql, /on public\.adhdice_milestones for (insert|update|delete)/i);
  assert.doesNotMatch(sql, /on public\.adhdice_milestone_events for (insert|update|delete)/i);
});

test("lock RPC validates task state, computes aura dates, appends events, and schedules reminders", () => {
  assert.match(sql, /create or replace function public\.adhdice_lock_milestone/i);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /from public\.adhdice_clean_tasks[\s\S]*for update/i);
  assert.match(sql, /v_task\.parent_task_id is not null/i);
  assert.match(sql, /v_task\.repeat_frequency::text not in \('none', 'daily_until_complete'\)/i);
  assert.match(sql, /v_task\.status::text in \('complete', 'archived', 'trashed'\)/i);
  assert.match(sql, /p_selected_target_date \+ 3/i);
  assert.match(sql, /p_allowed_target_date_min <> v_local_date \+ 1/i);
  assert.match(sql, /greatest\(7, ceil\(\(p_recommended_target_date - v_local_date\) \* 0\.25\)::integer\)/i);
  assert.match(sql, /'promoted'[\s\S]*'recommendation_generated'[\s\S]*'locked'/i);
  assert.match(sql, /'seven_days'[\s\S]*'three_days'[\s\S]*'target_day'[\s\S]*'final_aura_day'/i);
});

test("correction RPC is revision-checked, one-time, 24-hour limited, and retry-safe", () => {
  assert.match(sql, /create or replace function public\.adhdice_correct_milestone_setup/i);
  assert.match(sql, /event\.event_type = 'corrected'[\s\S]*if found then[\s\S]*return v_after/i);
  assert.match(sql, /Operation ID was already used for another Milestone mutation/i);
  assert.match(sql, /v_before\.revision <> p_expected_revision/i);
  assert.match(sql, /v_before\.setup_correction_used/i);
  assert.match(sql, /v_before\.locked_at \+ interval '24 hours'/i);
  assert.match(sql, /revision = revision \+ 1/i);
  assert.match(sql, /setup_correction_used = true/i);
  assert.match(sql, /status = 'canceled'[\s\S]*status = 'pending'/i);
  assert.match(sql, /coalesce\(max\(schedule_version\), 1\) \+ 1/i);
});

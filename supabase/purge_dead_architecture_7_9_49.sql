-- ADHDice 7.9.49: retire obsolete legacy History, duration-learning, and
-- completed Task State migration support.  This is intentionally destructive:
-- approved obsolete data is not copied or archived.
--
-- Apply only after reviewing the live dependency audit.  No live SQL is
-- applied by this source change.
begin;

-- Remove every known trigger that targets the retiring legacy History path.
drop trigger if exists adhdice_capture_task_achievement_runtime on public.adhdice_task_history;
drop trigger if exists adhdice_deactivate_deleted_task_achievement_runtime on public.adhdice_task_history;
drop trigger if exists adhdice_task_history_set_updated_at on public.adhdice_task_history;
drop trigger if exists adhdice_capture_task_history_occurrence on public.adhdice_task_history;
drop trigger if exists adhdice_link_task_timer_duration_evidence on public.adhdice_task_history;
drop trigger if exists adhdice_link_task_duration_evidence on public.adhdice_task_history;
drop trigger if exists adhdice_link_inserted_task_duration_evidence on public.adhdice_task_actual_time_entries;

-- Remove old publication wiring before removing the tables, when present.
do $publication$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_task_history'
  ) then
    alter publication supabase_realtime drop table public.adhdice_task_history;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_task_actual_time_entries'
  ) then
    alter publication supabase_realtime drop table public.adhdice_task_actual_time_entries;
  end if;
end;
$publication$;

-- These functions have no current runtime caller.  Keep signatures explicit so
-- an unexpected overload or dependency fails the migration rather than being
-- silently left behind.
drop function if exists public.adhdice_link_inserted_task_duration_evidence();
drop function if exists public.adhdice_link_task_duration_evidence();
drop function if exists public.adhdice_link_task_timer_duration_evidence();
drop function if exists public.adhdice_capture_task_history_occurrence();
drop function if exists public.adhdice_migration_backfill_entity(uuid, uuid, text, timestamptz, jsonb, jsonb);
drop function if exists public.adhdice_migration_finalize_user(uuid, uuid, text, text, text, jsonb, jsonb);
drop function if exists public.adhdice_rollback_legacy_history_promotion(uuid, uuid, integer, text, text);

-- Retire the old History and duration-learning tables.  These drops are
-- deliberately use plain drops: an unexpected inbound dependency must abort.
drop policy if exists "Users can read their own task history" on public.adhdice_task_history;
drop policy if exists "Users can create their own task history" on public.adhdice_task_history;
drop policy if exists "Users can update their own task history" on public.adhdice_task_history;
drop policy if exists "Users can delete their own task history" on public.adhdice_task_history;
drop policy if exists "Users can read their own task actual time entries" on public.adhdice_task_actual_time_entries;
drop policy if exists "Users can create their own task actual time entries" on public.adhdice_task_actual_time_entries;
drop policy if exists "Users can update their own task actual time entries" on public.adhdice_task_actual_time_entries;
drop policy if exists "Users can delete their own task actual time entries" on public.adhdice_task_actual_time_entries;
drop index if exists public.adhdice_task_history_user_date_idx;
drop index if exists public.adhdice_task_actual_time_entries_user_task_date_idx;
drop index if exists public.adhdice_task_actual_time_entries_learning_idx;
drop table if exists public.adhdice_task_actual_time_entries;
drop table if exists public.adhdice_task_history;

-- Retire migration-only state and evidence after its functions are gone.
drop table if exists public.adhdice_task_state_migration_issues;
drop table if exists public.adhdice_task_state_migration_entities;
drop table if exists public.adhdice_task_state_migrations;
drop table if exists public.adhdice_task_legacy_history_evidence;
drop table if exists public.adhdice_task_state_migration_schema_contract;
drop schema if exists adhdice_migration_private;

-- These zero-use tables have no current frontend, Edge, SQL, or FK consumer.
-- IF EXISTS keeps the purge valid against a fresh current schema; dependencies
-- still fail because dependent objects are not silently removed.
drop policy if exists "Users manage own prize board" on public.adhdice_prize_board;
drop index if exists public.adhdice_prize_board_user_idx;
drop table if exists public.adhdice_prize_board;
drop table if exists public.user_tasks;
drop table if exists public.user_focus;
drop table if exists public.user_dice;
drop table if exists public.user_notes;
drop table if exists public.user_economy;

commit;

-- ADHDice 7.15.16 Current Task projection deployment verification.
--
-- Read-only verification for the later manual install. Run only after the
-- 7.15.12, 7.15.14, and 7.15.15 source migrations have been reviewed and
-- applied intentionally. This script never inserts, updates, deletes, or
-- backfills data.

select
  to_regclass('public.adhdice_task_current_projections') is not null
    as projection_table_exists,
  to_regclass('public.adhdice_task_history_sync_state') is not null
    as history_sync_state_exists,
  to_regclass('public.adhdice_task_history_changes') is not null
    as history_change_ledger_exists;

select
  count(*) as projection_rows_before_backfill,
  count(*) = 0 as expected_zero_before_backfill
from public.adhdice_task_current_projections;

select exists (
  select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace table_schema on table_schema.oid = table_row.relnamespace
    join pg_proc trigger_function on trigger_function.oid = trigger_row.tgfoid
   where not trigger_row.tgisinternal
     and table_schema.nspname = 'public'
     and table_row.relname = 'adhdice_clean_tasks'
     and trigger_row.tgname = 'adhdice_clean_tasks_invalidate_task_current_projection'
     and trigger_function.proname = 'adhdice_invalidate_task_current_projection_on_canonical_revision'
     and pg_get_triggerdef(trigger_row.oid) ilike '%after update of canonical_revision%'
     and pg_get_triggerdef(trigger_row.oid) ilike '%when%canonical_revision%is distinct from%'
) as canonical_revision_invalidation_trigger_exists;

select
  to_regprocedure('public.adhdice_upsert_task_current_projection(uuid, jsonb)') is not null
    as trusted_projection_writer_exists,
  to_regprocedure('public.adhdice_get_task_current_projection_source_fences(uuid, uuid, date)') is not null
    as trusted_source_fence_function_exists,
  case
    when to_regprocedure('public.adhdice_execute_task_state_command(uuid, jsonb)') is null then false
    else position(
      'adhdice_task_current_projections'
      in pg_get_functiondef('public.adhdice_execute_task_state_command(uuid, jsonb)'::regprocedure)
    ) = 0
  end as command_rpc_is_projection_agnostic;

select
  has_table_privilege('authenticated', 'public.adhdice_task_current_projections', 'SELECT')
    as authenticated_can_select_projection,
  not has_table_privilege('anon', 'public.adhdice_task_current_projections', 'SELECT')
    as anon_cannot_select_projection,
  not has_table_privilege('authenticated', 'public.adhdice_task_current_projections', 'INSERT')
    as authenticated_cannot_insert_projection,
  not has_table_privilege('authenticated', 'public.adhdice_task_current_projections', 'UPDATE')
    as authenticated_cannot_update_projection,
  not has_table_privilege('authenticated', 'public.adhdice_task_current_projections', 'DELETE')
    as authenticated_cannot_delete_projection;

select
  has_function_privilege(
    'service_role',
    'public.adhdice_upsert_task_current_projection(uuid, jsonb)',
    'EXECUTE'
  ) as service_role_can_write_projection,
  not has_function_privilege(
    'authenticated',
    'public.adhdice_upsert_task_current_projection(uuid, jsonb)',
    'EXECUTE'
  ) as authenticated_cannot_write_projection,
  not has_function_privilege(
    'anon',
    'public.adhdice_upsert_task_current_projection(uuid, jsonb)',
    'EXECUTE'
  ) as anon_cannot_write_projection,
  has_function_privilege(
    'service_role',
    'public.adhdice_get_task_current_projection_source_fences(uuid, uuid, date)',
    'EXECUTE'
  ) as service_role_can_read_source_fences,
  not has_function_privilege(
    'authenticated',
    'public.adhdice_get_task_current_projection_source_fences(uuid, uuid, date)',
    'EXECUTE'
  ) as authenticated_cannot_read_source_fences,
  not has_function_privilege(
    'anon',
    'public.adhdice_get_task_current_projection_source_fences(uuid, uuid, date)',
    'EXECUTE'
  ) as anon_cannot_read_source_fences;

select
  exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'adhdice_task_current_projections'
       and indexname = 'adhdice_task_current_projections_identity_key'
  ) as projection_identity_index_exists,
  exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'adhdice_task_current_projections'
       and indexname = 'adhdice_task_current_projections_reconciliation_idx'
  ) as projection_reconciliation_index_exists,
  exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'adhdice_task_history_changes'
       and indexname = 'adhdice_task_history_changes_entity_sequence_idx'
  ) as history_entity_frontier_index_exists;

select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'adhdice_task_history_sync_state'
       and column_name = 'protocol_version'
  ) as history_sync_protocol_column_exists,
  exists (
    select 1
      from pg_constraint constraint_row
      join pg_class table_row on table_row.oid = constraint_row.conrelid
      join pg_namespace table_schema on table_schema.oid = table_row.relnamespace
     where table_schema.nspname = 'public'
       and table_row.relname = 'adhdice_task_history_sync_state'
       and pg_get_constraintdef(constraint_row.oid) ilike '%protocol_version = ''task-history-sync-v1''%'
  ) as history_sync_protocol_version_expected,
  to_regprocedure('public.adhdice_get_task_history_delta(text, uuid, bigint)') is not null
    as history_delta_protocol_function_exists,
  exists (
    select 1
      from pg_constraint constraint_row
      join pg_class table_row on table_row.oid = constraint_row.conrelid
      join pg_namespace table_schema on table_schema.oid = table_row.relnamespace
     where table_schema.nspname = 'public'
       and table_row.relname = 'adhdice_task_current_projections'
       and pg_get_constraintdef(constraint_row.oid) ilike '%projection_schema_version = ''task-current-projection-schema-v1''%'
  ) as projection_schema_version_expected,
  exists (
    select 1
      from pg_constraint constraint_row
      join pg_class table_row on table_row.oid = constraint_row.conrelid
      join pg_namespace table_schema on table_schema.oid = table_row.relnamespace
     where table_schema.nspname = 'public'
       and table_row.relname = 'adhdice_task_current_projections'
       and pg_get_constraintdef(constraint_row.oid) ilike '%projection_algorithm_version = ''task-current-projection-algorithm-v1''%'
  ) as projection_algorithm_version_expected;

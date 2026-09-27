-- ADHDice 7.15.25 Current Task projection consumer cutover verification.
-- Read-only. This does not backfill or mutate projection/canonical state.

select
  count(*) as publication_table_matches,
  count(*) = 1 as projection_table_appears_once
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'adhdice_task_current_projections';

with eligible_tasks as (
  select task.user_id, task.id as entity_id
    from public.adhdice_clean_tasks task
   where task.permanently_deleted_at is null
     and task.canonicalization_status = 'canonical_runtime'
     and task.entity_kind in ('parent', 'step', 'substep')
), projection_counts as (
  select
    count(*) filter (where projection.validity = 'valid') as valid_count,
    count(*) filter (where projection.validity = 'repair_required') as repair_required_count,
    count(*) filter (where projection.validity = 'unavailable') as unavailable_count,
    count(*) filter (where projection.entity_id is null) as missing_count
    from eligible_tasks eligible
    left join public.adhdice_task_current_projections projection
      on projection.user_id = eligible.user_id
     and projection.entity_id = eligible.entity_id
)
select * from projection_counts;

with eligible_tasks as (
  select
    task.user_id,
    task.id as entity_id,
    task.entity_kind,
    task.canonical_revision,
    profile.settings_revision,
    sync_state.sync_epoch,
    public.adhdice_effective_logical_date(
      statement_timestamp(),
      coalesce(nullif(profile.timezone, ''), 'America/New_York'),
      coalesce(nullif(profile.day_start_time::text, ''), '06:00')
    ) as projected_logical_date
    from public.adhdice_clean_tasks task
    join public.adhdice_user_profiles profile on profile.user_id = task.user_id
    join public.adhdice_task_history_sync_state sync_state on sync_state.user_id = task.user_id
   where task.permanently_deleted_at is null
     and task.canonicalization_status = 'canonical_runtime'
     and task.entity_kind in ('parent', 'step', 'substep')
     and sync_state.protocol_version = 'task-history-sync-v1'
), freshness as (
  select
    eligible.*,
    projection.canonical_task_revision = eligible.canonical_revision as canonical_revision_match,
    projection.history_sync_epoch = eligible.sync_epoch as history_sync_epoch_match,
    projection.logical_day_settings_revision = eligible.settings_revision as settings_revision_match,
    projection.projected_logical_date = eligible.projected_logical_date as logical_date_match,
    projection.projection_schema_version = 'task-current-projection-schema-v1' as schema_version_match,
    projection.projection_algorithm_version = 'task-current-projection-algorithm-v1' as algorithm_version_match
    from eligible_tasks eligible
    left join public.adhdice_task_current_projections projection
      on projection.user_id = eligible.user_id
     and projection.entity_id = eligible.entity_id
     and projection.entity_kind = eligible.entity_kind
)
select
  count(*) as eligible_rows,
  count(*) filter (where canonical_revision_match) as canonical_revision_matches,
  count(*) filter (where history_sync_epoch_match) as history_sync_epoch_matches,
  count(*) filter (where settings_revision_match) as settings_revision_matches,
  count(*) filter (where logical_date_match) as logical_date_matches,
  count(*) filter (where schema_version_match) as schema_version_matches,
  count(*) filter (where algorithm_version_match) as algorithm_version_matches
from freshness;

-- ADHDice 7.9.33 read-only post-copy verification.
-- Every *_violation count should be zero after authorized execution.
with legacy_only as (
  select legacy.id, legacy.user_id, legacy.task_id, legacy.entry_date, legacy.status::text as outcome,
    legacy.occurrence_due_on, task.entity_kind, profile.timezone, profile.day_start_time, profile.settings_revision
  from public.adhdice_task_history legacy
  join public.adhdice_clean_tasks task on task.user_id = legacy.user_id and task.id = legacy.task_id
  left join public.adhdice_user_profiles profile on profile.user_id = legacy.user_id
  left join public.adhdice_task_history_facts fact
    on fact.user_id = legacy.user_id and fact.entity_id = legacy.task_id and fact.logical_date = legacy.entry_date
  where fact.id is null
), copied as (
  select
    fact.*, legacy.id as legacy_id, legacy.task_id as legacy_task_id,
    legacy.entry_date as legacy_entry_date, legacy.status::text as legacy_outcome,
    legacy.occurrence_due_on as legacy_occurrence_due_on
  from public.adhdice_task_history_facts fact
  left join public.adhdice_task_history legacy
    on legacy.user_id = fact.user_id and legacy.id = fact.source_legacy_history_id
  where fact.source = 'legacy_history_copy_7_9_33'
), metrics as (
  select
    (select count(*) from legacy_only
      where outcome in ('done', 'did_my_best', 'missed', 'delayed', 'complete')
        and entity_kind in ('parent', 'step', 'substep')
        and timezone is not null and day_start_time is not null and settings_revision >= 1
    ) as remaining_eligible_legacy_only_rows,
    count(*) filter (where legacy_id is null) as missing_legacy_source_violations,
    count(*) filter (where legacy_task_id is distinct from entity_id or legacy_entry_date is distinct from logical_date or legacy_outcome is distinct from outcome::text) as source_identity_violations,
    count(*) filter (where scheduled_due_on is distinct from legacy_occurrence_due_on) as explicit_metadata_violations,
    count(*) filter (where occurrence_id is not null or schedule_boundary_id is not null or recurrence_source_fingerprint is not null or effective_due_on is not null) as fabricated_recurrence_metadata_violations,
    count(*) filter (where event_kind <> 'migration_reconstruction' or provenance_kind <> 'migration_reconstruction' or actor_kind <> 'migration' or migration_operation_id is null or command_id is not null) as migration_provenance_violations
  from copied
), duplicate_sources as (
  select count(*) as duplicate_source_fact_violations
  from (
    select user_id, source_legacy_history_id
    from public.adhdice_task_history_facts
    where source = 'legacy_history_copy_7_9_33'
    group by user_id, source_legacy_history_id
    having count(*) <> 1
  ) duplicates
), rewards as (
  select count(*) as migrated_reward_violations
  from public.adhdice_task_reward_entitlements entitlement
  join public.adhdice_task_history_facts fact
    on fact.user_id = entitlement.user_id and fact.id = entitlement.canonical_history_id
  where fact.source = 'legacy_history_copy_7_9_33'
), task_state as (
  select count(*) as task_state_fingerprint_violations
  from public.adhdice_task_migration_operations operation
  where operation.operation_identity = 'legacy-history-copy-7.9.33:' || operation.user_id::text
    and operation.state = 'committed'
    and operation.result_references->>'task_snapshot_fingerprint' is distinct from (
      select 'md5-' || md5(coalesce(string_agg(task.id::text || ':' || to_jsonb(task)::text, ',' order by task.id), ''))
      from public.adhdice_clean_tasks task
      where task.user_id = operation.user_id
        and exists (
          select 1 from public.adhdice_task_history_facts fact
          where fact.user_id = task.user_id and fact.entity_id = task.id and fact.source = 'legacy_history_copy_7_9_33'
        )
    )
)
select metrics.*, duplicate_sources.*, rewards.*, task_state.*
from metrics cross join duplicate_sources cross join rewards cross join task_state;

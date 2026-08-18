-- ADHDice 7.9.31 read-only post-copy verification.
-- Expected immediately after an authorized execution: every *_violation count is zero.
with confirmed_task_ids(task_id) as (
  values
    ('8416da45-0dec-49a2-8821-1780af3899a1'::uuid), ('27f7e8e5-062b-40fb-97cb-8d32ddbe8f00'::uuid),
    ('3dc5251e-eb70-4d11-95fe-f130fcbd3596'::uuid), ('89d9cdbf-be07-44e8-ace9-186a3bd6d372'::uuid),
    ('d9653a25-68e5-4882-8beb-855dc1d1c7eb'::uuid), ('b58b602d-80ad-4b7e-a17f-3fb3d5c617d2'::uuid),
    ('f9dbf05c-a4fa-46d2-8370-c7d6443afb0b'::uuid), ('f9b4ab17-7094-49bf-9bdc-262f4078907b'::uuid),
    ('f38746b0-c731-424c-a31a-1640252172c2'::uuid), ('1a5bb729-ec0e-4848-895f-0ff5af28bc15'::uuid),
    ('13f04487-30dd-4af6-be05-231ed3c285de'::uuid), ('df4ef91d-fcee-4411-970c-0c1cf9520ff5'::uuid)
), scoped as (
  select
    legacy.id as legacy_source_id,
    legacy.user_id as source_user_id,
    legacy.task_id as source_task_id,
    legacy.entry_date as source_entry_date,
    legacy.status::text as source_outcome,
    legacy.occurrence_due_on as source_occurrence_due_on,
    fact.id as canonical_fact_id,
    fact.logical_date as canonical_logical_date,
    fact.outcome as canonical_outcome,
    fact.event_kind,
    fact.occurrence_id,
    fact.scheduled_due_on,
    fact.effective_due_on,
    fact.schedule_boundary_id,
    fact.recurrence_source_fingerprint,
    fact.provenance_kind,
    fact.actor_kind,
    fact.source,
    fact.command_id,
    fact.migration_operation_id,
    fact.source_legacy_history_id as canonical_source_legacy_history_id
  from confirmed_task_ids confirmed
  join public.adhdice_clean_tasks task on task.id = confirmed.task_id
  join public.adhdice_task_history legacy on legacy.task_id = task.id and legacy.user_id = task.user_id
  left join public.adhdice_task_history_facts fact
    on fact.user_id = legacy.user_id and fact.entity_id = legacy.task_id and fact.logical_date = legacy.entry_date
  where legacy.status::text in ('done', 'did_my_best', 'missed', 'delayed', 'complete')
), metrics as (
  select
    count(*) filter (where canonical_fact_id is null) as remaining_eligible_legacy_only_rows,
    count(*) filter (
      where source = 'legacy_history_copy_7_9_31'
        and (canonical_outcome::text is distinct from source_outcome
          or canonical_logical_date is distinct from source_entry_date
          or canonical_source_legacy_history_id is distinct from legacy_source_id)
    ) as source_identity_violations,
    count(*) filter (
      where source = 'legacy_history_copy_7_9_31'
        and scheduled_due_on is distinct from source_occurrence_due_on
    ) as occurrence_due_on_violations,
    count(*) filter (
      where source = 'legacy_history_copy_7_9_31'
        and (occurrence_id is not null
          or schedule_boundary_id is not null
          or recurrence_source_fingerprint is not null
          or effective_due_on is not null)
    ) as fabricated_recurrence_metadata_violations,
    count(*) filter (
      where source = 'legacy_history_copy_7_9_31'
        and (event_kind <> 'migration_reconstruction'
          or provenance_kind <> 'migration_reconstruction'
          or actor_kind <> 'migration'
          or migration_operation_id is null
          or command_id is not null)
    ) as migration_provenance_violations,
    count(*) filter (
      where source = 'legacy_history_copy_7_9_31'
        and canonical_outcome = 'delayed'
        and effective_due_on is not null
    ) as migrated_delayed_effective_date_violations
  from scoped
), unintended as (
  select count(*) as unintended_migration_fact_violations
  from public.adhdice_task_history_facts fact
  left join public.adhdice_task_history legacy
    on legacy.user_id = fact.user_id and legacy.id = fact.source_legacy_history_id
  left join confirmed_task_ids confirmed on confirmed.task_id = fact.entity_id
  where fact.source = 'legacy_history_copy_7_9_31'
    and (confirmed.task_id is null
      or legacy.id is null
      or legacy.task_id <> fact.entity_id
      or legacy.entry_date <> fact.logical_date
      or legacy.status::text <> fact.outcome::text)
), duplicate_sources as (
  select count(*) as duplicate_source_fact_violations
  from (
    select fact.user_id, fact.source_legacy_history_id
    from public.adhdice_task_history_facts fact
    where fact.source = 'legacy_history_copy_7_9_31'
    group by fact.user_id, fact.source_legacy_history_id
    having count(*) <> 1
  ) duplicates
), rewards as (
  select count(*) as migrated_reward_violations
  from public.adhdice_task_reward_entitlements entitlement
  join public.adhdice_task_history_facts fact
    on fact.user_id = entitlement.user_id and fact.id = entitlement.canonical_history_id
  where fact.source = 'legacy_history_copy_7_9_31'
), task_state as (
  select count(*) as task_state_fingerprint_violations
  from public.adhdice_task_migration_operations operation
  where operation.operation_identity = 'legacy-history-copy-7.9.31:' || operation.user_id::text
    and operation.state = 'committed'
    and operation.result_references->>'task_snapshot_fingerprint' is distinct from (
      select 'md5-' || md5(string_agg(task.id::text || ':' || to_jsonb(task)::text, ',' order by task.id))
      from public.adhdice_clean_tasks task
      join confirmed_task_ids confirmed on confirmed.task_id = task.id
      where task.user_id = operation.user_id
        and exists (
          select 1 from scoped source_row
          where source_row.source_user_id = task.user_id and source_row.source_task_id = task.id
            and source_row.source = 'legacy_history_copy_7_9_31'
        )
    )
)
select metrics.*, unintended.*, duplicate_sources.*, rewards.*, task_state.*
from metrics cross join unintended cross join duplicate_sources cross join rewards cross join task_state;

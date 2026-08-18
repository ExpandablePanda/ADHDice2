-- ADHDice 7.9.30 read-only post-migration verification.
-- Expected after an approved execution: remaining_candidates = 0,
-- malformed_migration_facts = 0, and unintended_migration_facts = 0.
with confirmed_task_ids(task_id) as (
  values
    ('8416da45-0dec-49a2-8821-1780af3899a1'::uuid), ('27f7e8e5-062b-40fb-97cb-8d32ddbe8f00'::uuid),
    ('3dc5251e-eb70-4d11-95fe-f130fcbd3596'::uuid), ('89d9cdbf-be07-44e8-ace9-186a3bd6d372'::uuid),
    ('d9653a25-68e5-4882-8beb-855dc1d1c7eb'::uuid), ('b58b602d-80ad-4b7e-a17f-3fb3d5c617d2'::uuid),
    ('f9dbf05c-a4fa-46d2-8370-c7d6443afb0b'::uuid), ('f9b4ab17-7094-49bf-9bdc-262f4078907b'::uuid),
    ('f38746b0-c731-424c-a31a-1640252172c2'::uuid), ('1a5bb729-ec0e-4848-895f-0ff5af28bc15'::uuid),
    ('13f04487-30dd-4af6-be05-231ed3c285de'::uuid), ('df4ef91d-fcee-4411-970c-0c1cf9520ff5'::uuid)
), scoped as (
  select legacy.*, fact.id as canonical_fact_id, fact.outcome as canonical_outcome,
    fact.provenance_kind, fact.actor_kind, fact.source, fact.source_legacy_history_id
  from confirmed_task_ids confirmed
  join public.adhdice_clean_tasks task on task.id = confirmed.task_id
  join public.adhdice_task_history legacy on legacy.task_id = task.id and legacy.user_id = task.user_id
  left join public.adhdice_task_history_facts fact
    on fact.user_id = legacy.user_id and fact.entity_id = legacy.task_id and fact.logical_date = legacy.entry_date
), metrics as (
  select
    count(*) filter (where canonical_fact_id is null) as remaining_candidates,
    count(*) filter (where canonical_fact_id is not null) as canonical_coverage,
    count(*) filter (
      where source = 'legacy_history_canonicalization_7_9_30'
        and (canonical_outcome::text is distinct from status::text
          or source_legacy_history_id is distinct from id
          or provenance_kind <> 'migration_reconstruction'
          or actor_kind <> 'migration')
    ) as malformed_migration_facts,
    count(*) filter (
      where canonical_fact_id is not null
        and source <> 'legacy_history_canonicalization_7_9_30'
    ) as preexisting_canonical_facts_preserved
  from scoped
), unintended as (
  select count(*) as unintended_migration_facts
  from public.adhdice_task_history_facts fact
  left join public.adhdice_task_history legacy
    on legacy.user_id = fact.user_id and legacy.id = fact.source_legacy_history_id
  left join confirmed_task_ids confirmed on confirmed.task_id = fact.entity_id
  where fact.source = 'legacy_history_canonicalization_7_9_30'
    and (confirmed.task_id is null
      or legacy.id is null
      or legacy.task_id <> fact.entity_id
      or legacy.entry_date <> fact.logical_date
      or legacy.status::text <> fact.outcome::text)
)
select metrics.*, unintended.unintended_migration_facts
from metrics cross join unintended;

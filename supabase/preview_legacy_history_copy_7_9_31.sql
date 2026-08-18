-- ADHDice 7.9.31 read-only preview for the exact approved legacy History copy.
-- SOURCE ONLY: this report performs no writes.
with confirmed_task_ids(task_id) as (
  values
    ('8416da45-0dec-49a2-8821-1780af3899a1'::uuid),
    ('27f7e8e5-062b-40fb-97cb-8d32ddbe8f00'::uuid),
    ('3dc5251e-eb70-4d11-95fe-f130fcbd3596'::uuid),
    ('89d9cdbf-be07-44e8-ace9-186a3bd6d372'::uuid),
    ('d9653a25-68e5-4882-8beb-855dc1d1c7eb'::uuid),
    ('b58b602d-80ad-4b7e-a17f-3fb3d5c617d2'::uuid),
    ('f9dbf05c-a4fa-46d2-8370-c7d6443afb0b'::uuid),
    ('f9b4ab17-7094-49bf-9bdc-262f4078907b'::uuid),
    ('f38746b0-c731-424c-a31a-1640252172c2'::uuid),
    ('1a5bb729-ec0e-4848-895f-0ff5af28bc15'::uuid),
    ('13f04487-30dd-4af6-be05-231ed3c285de'::uuid),
    ('df4ef91d-fcee-4411-970c-0c1cf9520ff5'::uuid)
), scoped as (
  select
    legacy.id as source_legacy_history_id,
    legacy.user_id,
    legacy.task_id,
    legacy.entry_date as logical_date,
    legacy.status::text as outcome,
    legacy.occurrence_due_on,
    task.entity_kind,
    profile.timezone,
    profile.day_start_time,
    profile.settings_revision,
    fact.id as canonical_fact_id,
    fact.outcome::text as canonical_outcome
  from confirmed_task_ids confirmed
  join public.adhdice_clean_tasks task on task.id = confirmed.task_id
  join public.adhdice_task_history legacy
    on legacy.task_id = task.id and legacy.user_id = task.user_id
  left join public.adhdice_user_profiles profile on profile.user_id = legacy.user_id
  left join public.adhdice_task_history_facts fact
    on fact.user_id = legacy.user_id
   and fact.entity_id = legacy.task_id
   and fact.logical_date = legacy.entry_date
)
select
  source_legacy_history_id,
  user_id,
  task_id,
  logical_date,
  outcome,
  occurrence_due_on,
  canonical_fact_id,
  canonical_outcome,
  case
    when canonical_fact_id is not null then 'CANONICAL_EXISTS_WINS'
    when outcome not in ('done', 'did_my_best', 'missed', 'delayed', 'complete') then 'BLOCKED_UNSUPPORTED_OUTCOME'
    when entity_kind not in ('parent', 'step', 'substep') then 'BLOCKED_ENTITY_KIND'
    when timezone is null or day_start_time is null or settings_revision is null or settings_revision < 1 then 'BLOCKED_PROFILE_METADATA'
    else 'ELIGIBLE_COPY'
  end as disposition
from scoped
order by task_id, logical_date, source_legacy_history_id;

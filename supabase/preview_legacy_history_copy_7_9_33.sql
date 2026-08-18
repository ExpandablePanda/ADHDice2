-- ADHDice 7.9.33 read-only preview for the final legacy History copy.
-- SOURCE ONLY: this report performs no writes and re-queries live rows when run.
with legacy_only as (
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
  from public.adhdice_task_history legacy
  join public.adhdice_clean_tasks task
    on task.user_id = legacy.user_id and task.id = legacy.task_id
  left join public.adhdice_user_profiles profile on profile.user_id = legacy.user_id
  left join public.adhdice_task_history_facts fact
    on fact.user_id = legacy.user_id
   and fact.entity_id = legacy.task_id
   and fact.logical_date = legacy.entry_date
  where fact.id is null
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
    when outcome not in ('done', 'did_my_best', 'missed', 'delayed', 'complete') then 'BLOCKED_UNSUPPORTED_OUTCOME'
    when entity_kind not in ('parent', 'step', 'substep') then 'BLOCKED_ENTITY_KIND'
    when timezone is null or day_start_time is null or settings_revision is null or settings_revision < 1 then 'BLOCKED_PROFILE_METADATA'
    else 'ELIGIBLE_COPY'
  end as disposition
from legacy_only
order by user_id, task_id, logical_date, source_legacy_history_id;

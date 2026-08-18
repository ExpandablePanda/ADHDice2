-- ADHDice 7.9.34 read-only preview for active Task canonical initialization.
-- SOURCE ONLY: this report performs no writes and selects dynamically from
-- canonicalization_status = legacy_uninitialized at execution time.

with raw_candidates as (
  select
    task.user_id,
    task.id as task_id,
    task.title,
    task.status::text as raw_status,
    task.parent_task_id,
    task.due_on,
    task.due_time,
    task.repeat_frequency::text as raw_repeat_frequency,
    task.repeat_interval,
    task.repeat_days_of_week,
    task.repeat_day_of_month,
    coalesce(task.repeat_monthly_mode::text, 'day_of_month') as raw_repeat_monthly_mode,
    task.repeat_monthly_ordinal::text as raw_repeat_monthly_ordinal,
    task.repeat_monthly_weekday,
    task.canonicalization_status,
    task.revision as source_task_revision,
    profile.timezone,
    profile.day_start_time,
    profile.settings_revision,
    case
      when task.parent_task_id is null then 'parent'
      when parent_task.id is null then null
      when parent_task.parent_task_id is null then 'step'
      else 'substep'
    end as entity_kind,
    case
      when task.repeat_frequency::text = 'none' and task.due_on is null then 'unscheduled'
      when task.repeat_frequency::text = 'none' and task.due_on is not null then 'one_time'
      when task.repeat_frequency::text in ('daily', 'custom', 'daily_until_complete')
        and task.repeat_interval is not null and task.repeat_interval >= 1 then 'rolling'
      when task.repeat_frequency::text = 'weekly'
        and task.repeat_interval is not null and task.repeat_interval >= 1
        and coalesce(cardinality(task.repeat_days_of_week), 0) > 0
        and coalesce(task.repeat_days_of_week, '{}'::smallint[]) <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
        and (select count(*) = count(distinct weekday) from unnest(coalesce(task.repeat_days_of_week, '{}'::smallint[])) weekday)
        then 'fixed'
      when task.repeat_frequency::text = 'weekly'
        and task.repeat_interval is not null and task.repeat_interval >= 1
        and coalesce(cardinality(task.repeat_days_of_week), 0) = 0
        and task.due_on is not null then 'fixed'
      when task.repeat_frequency::text = 'monthly'
        and task.repeat_interval is not null and task.repeat_interval >= 1
        and coalesce(task.repeat_monthly_mode::text, 'day_of_month') = 'day_of_month'
        and (task.repeat_day_of_month between 1 and 31 or (task.repeat_day_of_month is null and task.due_on is not null))
        and task.repeat_monthly_ordinal is null and task.repeat_monthly_weekday is null then 'fixed'
      when task.repeat_frequency::text = 'monthly'
        and task.repeat_interval is not null and task.repeat_interval >= 1
        and task.repeat_monthly_mode::text = 'ordinal_weekday'
        and task.repeat_monthly_ordinal::text in ('first', 'second', 'third', 'fourth', 'last')
        and task.repeat_monthly_weekday between 0 and 6
        and task.repeat_day_of_month is null then 'fixed'
      else 'ambiguous'
    end as schedule_model
  from public.adhdice_clean_tasks task
  left join public.adhdice_clean_tasks parent
    on parent.user_id = task.user_id and parent.id = task.parent_task_id
  left join public.adhdice_user_profiles profile on profile.user_id = task.user_id
  where task.canonicalization_status = 'legacy_uninitialized'
), normalized as (
  select
    candidate.*,
    case
      when candidate.schedule_model in ('unscheduled', 'one_time') then 'none'
      else candidate.raw_repeat_frequency
    end as repeat_frequency,
    case
      when candidate.schedule_model in ('unscheduled', 'one_time') then 1
      else candidate.repeat_interval
    end as repeat_interval_normalized,
    case
      when candidate.raw_repeat_frequency = 'weekly' and coalesce(cardinality(candidate.repeat_days_of_week), 0) = 0
        then array[extract(dow from candidate.due_on)::smallint]
      when candidate.schedule_model = 'fixed' and candidate.raw_repeat_frequency = 'weekly'
        then candidate.repeat_days_of_week
      else '{}'::smallint[]
    end as repeat_days_of_week_normalized,
    case
      when candidate.raw_repeat_frequency = 'monthly'
        and candidate.raw_repeat_monthly_mode = 'day_of_month'
        and candidate.repeat_day_of_month is null
        then extract(day from candidate.due_on)::integer
      when candidate.raw_repeat_frequency = 'monthly' and candidate.raw_repeat_monthly_mode = 'day_of_month'
        then candidate.repeat_day_of_month
      else null
    end as repeat_day_of_month_normalized,
    case when candidate.raw_repeat_frequency = 'monthly' then candidate.raw_repeat_monthly_mode else 'day_of_month' end as repeat_monthly_mode,
    case when candidate.raw_repeat_frequency = 'monthly' and candidate.raw_repeat_monthly_mode = 'ordinal_weekday' then candidate.raw_repeat_monthly_ordinal else null end as repeat_monthly_ordinal,
    case when candidate.raw_repeat_frequency = 'monthly' and candidate.raw_repeat_monthly_mode = 'ordinal_weekday' then candidate.repeat_monthly_weekday else null end as repeat_monthly_weekday,
    case when candidate.schedule_model = 'one_time' then candidate.due_on else null end as one_time_due_on,
    case when candidate.schedule_model in ('rolling', 'fixed') then candidate.due_on else null end as anchor_date
  from raw_candidates candidate
)
select
  user_id,
  task_id,
  title,
  raw_status,
  canonicalization_status,
  entity_kind,
  schedule_model,
  repeat_frequency,
  repeat_interval_normalized as repeat_interval,
  repeat_days_of_week_normalized as repeat_days_of_week,
  repeat_day_of_month_normalized as repeat_day_of_month,
  repeat_monthly_mode,
  repeat_monthly_ordinal,
  repeat_monthly_weekday,
  one_time_due_on,
  due_time,
  anchor_date,
  current_date as effective_from_logical_date,
  case when anchor_date is null then 'unknown' else 'migration_prospective' end as anchor_kind,
  case when anchor_date is null then 'unavailable' else 'high_confidence' end as anchor_confidence,
  timezone,
  day_start_time,
  settings_revision,
  source_task_revision,
  case
    when raw_status in ('complete', 'archived', 'trashed') then 'SKIP_NONACTIVE_CANONICAL_LIFECYCLE'
    when entity_kind is null then 'BLOCKED_HIERARCHY'
    when timezone is null or char_length(trim(timezone)) = 0 or day_start_time is null or settings_revision is null or settings_revision < 1 then 'BLOCKED_PROFILE_METADATA'
    when schedule_model = 'ambiguous' then 'BLOCKED_UNSUPPORTED_SCHEDULE'
    else 'ELIGIBLE_INITIALIZE'
  end as disposition
from normalized
order by user_id, task_id;

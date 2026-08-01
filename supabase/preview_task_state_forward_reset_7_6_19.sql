-- ADHDice 7.6.20 safe preview for the exact 26 re-advanced cursors identified in 7.6.19.
-- Three exact weekly Monday rows advanced twice; the other 23 advanced once.
-- This file has no persistent mutation and always ends with ROLLBACK.

begin;

create temporary table adhdice_task_state_forward_reset_7_6_19_snapshot
on commit drop
as
with
expected_raw(
  task_id, expected_readvanced_due_on, expected_revision, corrected_due_on,
  recurrence_type, recurrence_interval, recurrence_weekdays, repeat_day_of_month,
  repeat_monthly_mode, repeat_monthly_ordinal, repeat_monthly_weekday
) as (
  values
    ('01eda993-ddfc-4fb1-b817-1fb986d1b7b2'::uuid, date '2026-09-01', 84, date '2026-08-04', 'monthly', 1, array[]::smallint[], null::integer, 'ordinal_weekday', 'first', 2),
    ('058390ab-cc42-49ec-a458-8da05773732b'::uuid, date '2026-08-17', 71, date '2026-08-03', 'weekly', 1, array[1]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('09180da0-58bb-46e4-8ec2-53c1cc4d2f21'::uuid, date '2026-08-04', 85, date '2026-08-03', 'weekly', 1, array[1,2,3,4,5]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('0c3ccc7b-fcce-4a6a-aa77-9c5cfd471fc7'::uuid, date '2026-08-10', 59, date '2026-08-03', 'weekly', 1, array[1]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('27035f67-c008-4e54-9761-c7f01cf0604d'::uuid, date '2026-08-10', 65, date '2026-08-03', 'weekly', 1, array[1]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('40dfaed0-4c1c-4ab0-a930-3bc0accbed94'::uuid, date '2026-08-10', 65, date '2026-08-03', 'weekly', 1, array[1]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('46c06353-7930-4ed3-9449-4ae2084ffa57'::uuid, date '2026-08-13', 66, date '2026-08-06', 'weekly', 1, array[4]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('52e90aba-364a-4b9f-8c03-e512a099fe44'::uuid, date '2026-08-11', 63, date '2026-08-04', 'weekly', 1, array[2]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('723be9b2-64c0-43a9-b49a-5b7f648f57ea'::uuid, date '2026-08-04', 132, date '2026-08-03', 'weekly', 1, array[1,2,3,4,5]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('7fb30d0c-1d12-4c3e-9c82-f39a82ff6055'::uuid, date '2026-08-04', 96, date '2026-08-03', 'weekly', 1, array[1,2,3,4,5]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('81b64697-4291-4d3d-913a-c9d0e2f8d804'::uuid, date '2026-08-10', 65, date '2026-08-03', 'weekly', 1, array[1]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('87a9e225-b385-44c7-b336-c3b9c6c5ea1b'::uuid, date '2026-08-10', 66, date '2026-08-03', 'weekly', 1, array[1]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('8b50fb4b-a634-4c15-afb3-70307ebc528a'::uuid, date '2026-08-17', 67, date '2026-08-03', 'weekly', 1, array[1]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('8ee7441c-2e4d-439a-be7f-d1e19fdb2a41'::uuid, date '2026-08-10', 65, date '2026-08-03', 'weekly', 1, array[1]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('96d688b4-54f5-4884-9971-38b43cba4aa5'::uuid, date '2026-08-10', 66, date '2026-08-03', 'weekly', 1, array[1]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('9f69b644-4943-4329-9162-53fefe1bc7dc'::uuid, date '2026-09-07', 56, date '2026-08-03', 'monthly', 1, array[]::smallint[], null::integer, 'ordinal_weekday', 'first', 1),
    ('a1eb2348-99ed-42bd-867b-ceb246128066'::uuid, date '2026-08-04', 114, date '2026-08-03', 'weekly', 1, array[1,2,3,4,5]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('a3e34bd7-35dd-44b0-82e0-7677c957c5f0'::uuid, date '2026-08-14', 62, date '2026-08-07', 'weekly', 1, array[5]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('b421f72a-2745-46df-81a1-d8c8416e1951'::uuid, date '2026-08-10', 65, date '2026-08-03', 'weekly', 1, array[1]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('b4940db0-5217-4f53-99d0-60e46933e58e'::uuid, date '2026-08-04', 107, date '2026-08-03', 'weekly', 1, array[1,2,3,4,5]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('c48c40ee-296a-4bd5-aec4-eec75ccf48ba'::uuid, date '2026-08-12', 56, date '2026-08-05', 'weekly', 1, array[]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('c72a281c-5932-4b7b-8e49-4ee4397acf6e'::uuid, date '2026-08-04', 81, date '2026-08-03', 'weekly', 1, array[1,2,3,4,5]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('d5d2d1ba-94f1-47d3-a7af-11fd3f208db1'::uuid, date '2026-08-17', 67, date '2026-08-03', 'weekly', 1, array[1]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('dba6e6d4-981f-4941-a5c9-e78e8def250f'::uuid, date '2026-08-14', 86, date '2026-08-07', 'weekly', 1, array[]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('df4ef91d-fcee-4411-970c-0c1cf9520ff5'::uuid, date '2026-08-09', 66, date '2026-08-02', 'weekly', 1, array[0]::smallint[], null::integer, 'day_of_month', null::text, null::integer),
    ('f4e11d51-6bba-4eff-a05f-7c2e81f19a92'::uuid, date '2026-08-04', 92, date '2026-08-03', 'weekly', 1, array[1,2,3,4,5]::smallint[], null::integer, 'day_of_month', null::text, null::integer)
),
expected as (
  select
    expected_raw.*,
    count(*) over (partition by task_id) as expected_id_count,
    case when task_id = any(array[
      '058390ab-cc42-49ec-a458-8da05773732b'::uuid,
      '8b50fb4b-a634-4c15-afb3-70307ebc528a'::uuid,
      'd5d2d1ba-94f1-47d3-a7af-11fd3f208db1'::uuid
    ]) then 2 else 1 end as expected_transition_count
  from expected_raw
),
observed as (
  select
    expected.*,
    task.id as found_task_id,
    task.user_id,
    task.title,
    task.status::text as current_status,
    task.due_on as current_due_on,
    task.revision as current_revision,
    task.trashed_at,
    task.repeat_frequency::text as current_recurrence_type,
    task.repeat_interval as current_recurrence_interval,
    task.repeat_days_of_week as current_recurrence_weekdays,
    task.repeat_day_of_month as current_repeat_day_of_month,
    task.repeat_monthly_mode::text as current_repeat_monthly_mode,
    task.repeat_monthly_ordinal::text as current_repeat_monthly_ordinal,
    task.repeat_monthly_weekday as current_repeat_monthly_weekday,
    case when task.id is null then null::date else public.adhdice_effective_logical_date(
      statement_timestamp(),
      coalesce(nullif(profile.timezone, ''), 'America/New_York'),
      coalesce(nullif(profile.day_start_time, ''), '06:00')
    ) end as logical_date
  from expected
  left join public.adhdice_clean_tasks as task on task.id = expected.task_id
  left join public.adhdice_user_profiles as profile on profile.user_id = task.user_id
),
schedule_candidates as (
  select observed.task_id, candidate.occurrence_date
  from observed
  cross join lateral generate_series(
    observed.corrected_due_on,
    observed.expected_readvanced_due_on,
    interval '1 day'
  ) as generated(value)
  cross join lateral (select generated.value::date as occurrence_date) as candidate
  cross join lateral (
    select (date_trunc('month', candidate.occurrence_date) + interval '1 month - 1 day')::date as month_end_date
  ) as month_boundary
  where
    (
      observed.recurrence_type = 'weekly'
      and extract(dow from candidate.occurrence_date)::smallint = any(
        case when cardinality(observed.recurrence_weekdays) = 0
          then array[extract(dow from observed.corrected_due_on)::smallint]
          else observed.recurrence_weekdays
        end
      )
      and mod(
        ((candidate.occurrence_date - extract(dow from candidate.occurrence_date)::integer)
          - (observed.corrected_due_on - extract(dow from observed.corrected_due_on)::integer)) / 7,
        observed.recurrence_interval
      ) = 0
    )
    or (
      observed.recurrence_type = 'monthly'
      and mod(
        (extract(year from candidate.occurrence_date)::integer - extract(year from observed.corrected_due_on)::integer) * 12
          + extract(month from candidate.occurrence_date)::integer - extract(month from observed.corrected_due_on)::integer,
        observed.recurrence_interval
      ) = 0
      and observed.repeat_monthly_mode = 'ordinal_weekday'
      and candidate.occurrence_date = case
        when observed.repeat_monthly_ordinal = 'last' then
          month_boundary.month_end_date - mod(
            extract(dow from month_boundary.month_end_date)::integer - observed.repeat_monthly_weekday + 7,
            7
          )
        else (
          date_trunc('month', candidate.occurrence_date)::date
          + mod(observed.repeat_monthly_weekday - extract(dow from date_trunc('month', candidate.occurrence_date))::integer + 7, 7)
          + 7 * (array_position(array['first', 'second', 'third', 'fourth'], observed.repeat_monthly_ordinal) - 1)
        )::date
      end
    )
),
checked as (
  select
    observed.*,
    found_task_id is not null as task_exists,
    expected_id_count = 1 as expected_id_is_unique,
    found_task_id is not null and current_status not in ('complete', 'archived', 'trashed') and trashed_at is null as active_recurring_lifecycle,
    current_recurrence_type = recurrence_type
      and current_recurrence_interval = recurrence_interval
      and current_recurrence_weekdays is not distinct from recurrence_weekdays
      and current_repeat_day_of_month is not distinct from repeat_day_of_month
      and current_repeat_monthly_mode is not distinct from repeat_monthly_mode
      and current_repeat_monthly_ordinal is not distinct from repeat_monthly_ordinal
      and current_repeat_monthly_weekday is not distinct from repeat_monthly_weekday
      as recurrence_configuration_unchanged,
    corrected_due_on >= logical_date
      and (select min(occurrence_date) from schedule_candidates where task_id = observed.task_id) = corrected_due_on
      as corrected_forward_boundary_valid,
    (select count(*) from schedule_candidates
      where task_id = observed.task_id and occurrence_date > corrected_due_on)
      = expected_transition_count
      and (select max(occurrence_date) from schedule_candidates
        where task_id = observed.task_id and occurrence_date > corrected_due_on)
        = expected_readvanced_due_on
      as exact_expected_recurrence_transitions
  from observed
),
evaluated as (
  select
    checked.*,
    task_exists and expected_id_is_unique and active_recurring_lifecycle
      and recurrence_configuration_unchanged and corrected_forward_boundary_valid
      and exact_expected_recurrence_transitions
      and current_due_on = expected_readvanced_due_on
      and current_revision = expected_revision
      as eligible,
    task_exists and expected_id_is_unique and active_recurring_lifecycle
      and recurrence_configuration_unchanged
      and current_due_on = corrected_due_on
      and current_revision = expected_revision + 1
      as unchanged
  from checked
)
select
  evaluated.*,
  case when eligible then 'eligible' when unchanged then 'unchanged' when not task_exists then 'missing' else 'skipped' end as correction_classification,
  case
    when not task_exists then 'task not found'
    when not expected_id_is_unique then 'task ID is duplicated in correction scope'
    when not active_recurring_lifecycle then 'Complete, Archived, or Trashed lifecycle is excluded'
    when not recurrence_configuration_unchanged then 'recurrence configuration changed after the live snapshot'
    when current_due_on = corrected_due_on and current_revision = expected_revision + 1 then null
    when not corrected_forward_boundary_valid then 'corrected due_on is no longer a valid forward recurrence boundary'
    when current_due_on <> expected_readvanced_due_on then 'due_on no longer matches the exact re-advanced live output'
    when current_revision <> expected_revision then 'revision no longer matches the latest live output'
    when not exact_expected_recurrence_transitions then 'live dates do not match the exact per-row configured recurrence transition count'
    else null
  end as skip_reason
from evaluated;

-- READ-ONLY PREVIEW. Expect 26 eligible before correction, then 26 unchanged after it.
select
  task_id, title, current_due_on, expected_readvanced_due_on, corrected_due_on,
  current_revision, expected_revision, expected_transition_count, logical_date, recurrence_type, recurrence_interval,
  recurrence_weekdays, repeat_day_of_month, repeat_monthly_mode,
  repeat_monthly_ordinal, repeat_monthly_weekday, eligible, unchanged, skip_reason,
  count(*) over () as expected,
  count(*) filter (where eligible) over () as eligible_count,
  count(*) filter (where unchanged) over () as unchanged_count,
  count(*) filter (where correction_classification = 'skipped') over () as skipped,
  count(*) filter (where correction_classification = 'missing') over () as missing
from adhdice_task_state_forward_reset_7_6_19_snapshot
order by task_id;

rollback;

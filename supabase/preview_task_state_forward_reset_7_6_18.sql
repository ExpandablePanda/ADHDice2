-- ADHDice 7.6.18 forward-only recurring-date reset: PREVIEW ONLY.
--
-- This companion file contains no persistent update. It creates the same
-- transaction-local snapshot as the guarded patch, returns the full preview and
-- summary counts, then rolls back so the temporary snapshot is discarded.
-- History, rewards, streaks, lifecycle, recurrence, Archive, and Trash are never
-- written.

begin;

create temporary table adhdice_task_state_forward_reset_7_6_18_snapshot
on commit drop
as
with
affected_raw(task_id, expected_corrupted_due_on) as (
  values
    ('96d688b4-54f5-4884-9971-38b43cba4aa5'::uuid, date '2027-05-31'),
    ('40dfaed0-4c1c-4ab0-a930-3bc0accbed94'::uuid, date '2027-05-31'),
    ('b421f72a-2745-46df-81a1-d8c8416e1951'::uuid, date '2027-05-31'),
    ('87a9e225-b385-44c7-b336-c3b9c6c5ea1b'::uuid, date '2027-05-31'),
    ('8ee7441c-2e4d-439a-be7f-d1e19fdb2a41'::uuid, date '2027-05-31'),
    ('81b64697-4291-4d3d-913a-c9d0e2f8d804'::uuid, date '2027-05-31'),
    ('27035f67-c008-4e54-9761-c7f01cf0604d'::uuid, date '2027-05-31'),
    ('0c3ccc7b-fcce-4a6a-aa77-9c5cfd471fc7'::uuid, date '2027-05-31'),
    ('723be9b2-64c0-43a9-b49a-5b7f648f57ea'::uuid, date '2026-10-01'),
    ('a1eb2348-99ed-42bd-867b-ceb246128066'::uuid, date '2026-10-01'),
    ('b4940db0-5217-4f53-99d0-60e46933e58e'::uuid, date '2026-10-01'),
    ('09180da0-58bb-46e4-8ec2-53c1cc4d2f21'::uuid, date '2026-10-01'),
    ('7fb30d0c-1d12-4c3e-9c82-f39a82ff6055'::uuid, date '2026-10-01'),
    ('f4e11d51-6bba-4eff-a05f-7c2e81f19a92'::uuid, date '2026-10-01'),
    ('c72a281c-5932-4b7b-8e49-4ee4397acf6e'::uuid, date '2026-10-01'),
    ('058390ab-cc42-49ec-a458-8da05773732b'::uuid, date '2027-06-07'),
    ('8b50fb4b-a634-4c15-afb3-70307ebc528a'::uuid, date '2027-06-07'),
    ('d5d2d1ba-94f1-47d3-a7af-11fd3f208db1'::uuid, date '2027-06-07'),
    ('df4ef91d-fcee-4411-970c-0c1cf9520ff5'::uuid, date '2027-05-30'),
    ('dba6e6d4-981f-4941-a5c9-e78e8def250f'::uuid, date '2027-05-28'),
    ('a3e34bd7-35dd-44b0-82e0-7677c957c5f0'::uuid, date '2027-05-28'),
    ('713cfd40-287c-4531-bba5-46d9f6f2a496'::uuid, date '2027-10-24'),
    ('a415dc65-b841-448b-b8a8-4b299987cb8a'::uuid, date '2027-06-24'),
    ('01eda993-ddfc-4fb1-b817-1fb986d1b7b2'::uuid, date '2027-11-02'),
    ('52e90aba-364a-4b9f-8c03-e512a099fe44'::uuid, date '2027-06-01'),
    ('46c06353-7930-4ed3-9449-4ae2084ffa57'::uuid, date '2027-06-03'),
    ('c48c40ee-296a-4bd5-aec4-eec75ccf48ba'::uuid, date '2027-06-02'),
    ('9f69b644-4943-4329-9162-53fefe1bc7dc'::uuid, date '2027-11-01')
),
affected as (
  select
    task_id,
    expected_corrupted_due_on,
    count(*) over (partition by task_id) as affected_id_count
  from affected_raw
),
observed as (
  select
    affected.task_id,
    affected.expected_corrupted_due_on,
    affected.affected_id_count,
    task.id as found_task_id,
    task.user_id,
    task.title,
    task.status::text as current_status,
    task.due_on as current_due_on,
    task.repeat_frequency::text as recurrence_type,
    task.repeat_interval as recurrence_interval,
    task.repeat_days_of_week as recurrence_weekdays,
    task.repeat_day_of_month,
    task.repeat_monthly_mode::text as repeat_monthly_mode,
    task.repeat_monthly_ordinal::text as repeat_monthly_ordinal,
    task.repeat_monthly_weekday,
    task.revision,
    task.updated_at,
    task.trashed_at,
    coalesce(nullif(profile.timezone, ''), 'America/New_York') as timezone,
    coalesce(nullif(profile.day_start_time, ''), '06:00') as rollover_time
  from affected
  left join public.adhdice_clean_tasks as task
    on task.id = affected.task_id
  left join public.adhdice_user_profiles as profile
    on profile.user_id = task.user_id
),
bounded as (
  select
    observed.*,
    case
      when found_task_id is null then null::date
      else public.adhdice_effective_logical_date(
        statement_timestamp(),
        timezone,
        rollover_time
      )
    end as logical_date,
    jsonb_build_object(
      'frequency', recurrence_type,
      'interval', recurrence_interval,
      'weekdays', recurrence_weekdays,
      'dayOfMonth', repeat_day_of_month,
      'monthlyMode', repeat_monthly_mode,
      'monthlyOrdinal', repeat_monthly_ordinal,
      'monthlyWeekday', repeat_monthly_weekday
    ) as recurrence_configuration
  from observed
),
validity as (
  select
    bounded.*,
    found_task_id is not null as task_exists,
    affected_id_count = 1 as affected_id_is_unique,
    found_task_id is not null
      and current_status not in ('complete', 'archived', 'trashed')
      and trashed_at is null
      as active_recurring_lifecycle,
    found_task_id is not null
      and recurrence_type in ('weekly', 'monthly')
      and recurrence_interval >= 1
      and current_due_on is not null
      and (
        (
          recurrence_type = 'weekly'
          and not exists (
            select 1
            from unnest(recurrence_weekdays) as weekday(value)
            where weekday.value < 0 or weekday.value > 6
          )
        )
        or (
          recurrence_type = 'monthly'
          and (
            (
              repeat_monthly_mode = 'day_of_month'
              and coalesce(repeat_day_of_month, extract(day from current_due_on)::integer) between 1 and 31
              and repeat_monthly_ordinal is null
              and repeat_monthly_weekday is null
            )
            or (
              repeat_monthly_mode = 'ordinal_weekday'
              and repeat_monthly_ordinal in ('first', 'second', 'third', 'fourth', 'last')
              and repeat_monthly_weekday between 0 and 6
            )
          )
        )
      )
      as recurrence_configuration_valid,
    found_task_id is not null
      and current_due_on = expected_corrupted_due_on
      as current_date_is_affected_corruption
  from bounded
),
explicit_consumed as (
  select distinct
    history.task_id,
    history.occurrence_due_on as occurrence_date
  from public.adhdice_task_history as history
  join validity
    on validity.found_task_id = history.task_id
   and validity.user_id = history.user_id
  where history.status::text in ('done', 'did_my_best', 'complete')
    and history.counted_as_due_occurrence
    and history.occurrence_due_on is not null
    and (
      nullif(btrim(history.occurrence_key), '') is null
      or history.occurrence_key = 'occurrence:' || history.occurrence_due_on::text
      or history.occurrence_key = 'task:' || history.task_id::text || ':occurrence:' || history.occurrence_due_on::text
    )
),
schedule_candidates as (
  select
    validity.task_id,
    candidate.occurrence_date
  from validity
  cross join lateral generate_series(
    validity.logical_date,
    validity.logical_date + 3660,
    interval '1 day'
  ) as generated(value)
  cross join lateral (
    select generated.value::date as occurrence_date
  ) as candidate
  cross join lateral (
    select make_date(
      extract(year from candidate.occurrence_date)::integer,
      extract(month from candidate.occurrence_date)::integer,
      extract(day from (date_trunc('month', candidate.occurrence_date) + interval '1 month - 1 day'))::integer
    ) as month_end_date
  ) as month_boundary
  where validity.recurrence_configuration_valid
    and (
      (
        validity.recurrence_type = 'weekly'
        and extract(dow from candidate.occurrence_date)::smallint = any(
          case
            when cardinality(validity.recurrence_weekdays) = 0
              then array[extract(dow from validity.current_due_on)::smallint]
            else validity.recurrence_weekdays
          end
        )
        and mod(
          ((candidate.occurrence_date - extract(dow from candidate.occurrence_date)::integer)
            - (validity.current_due_on - extract(dow from validity.current_due_on)::integer)) / 7,
          validity.recurrence_interval
        ) = 0
      )
      or (
        validity.recurrence_type = 'monthly'
        and mod(
          (
            extract(year from candidate.occurrence_date)::integer
            - extract(year from validity.current_due_on)::integer
          ) * 12
          + extract(month from candidate.occurrence_date)::integer
          - extract(month from validity.current_due_on)::integer,
          validity.recurrence_interval
        ) = 0
        and (
          (
            validity.repeat_monthly_mode = 'ordinal_weekday'
            and validity.repeat_monthly_ordinal = 'last'
            and candidate.occurrence_date = month_boundary.month_end_date - mod(
              extract(dow from month_boundary.month_end_date)::integer
              - validity.repeat_monthly_weekday
              + 7,
              7
            )
          )
          or (
            validity.repeat_monthly_mode = 'ordinal_weekday'
            and validity.repeat_monthly_ordinal <> 'last'
            and candidate.occurrence_date = (
              date_trunc('month', candidate.occurrence_date)::date
              + mod(
                validity.repeat_monthly_weekday
                - extract(dow from date_trunc('month', candidate.occurrence_date))::integer
                + 7,
                7
              )
              + 7 * (
                array_position(
                  array['first', 'second', 'third', 'fourth'],
                  validity.repeat_monthly_ordinal::text
                ) - 1
              )
            )::date
          )
          or (
            validity.repeat_monthly_mode = 'day_of_month'
            and candidate.occurrence_date = make_date(
              extract(year from candidate.occurrence_date)::integer,
              extract(month from candidate.occurrence_date)::integer,
              least(
                coalesce(validity.repeat_day_of_month, extract(day from validity.current_due_on)::integer),
                extract(day from month_boundary.month_end_date)::integer
              )
            )
          )
        )
      )
    )
),
proposals as (
  select
    validity.*,
    min(candidate.occurrence_date) filter (
      where consumed.occurrence_date is null
    ) as proposed_forward_due_on,
    array_agg(candidate.occurrence_date order by candidate.occurrence_date) filter (
      where consumed.occurrence_date is not null
    ) as explicit_future_occurrences_consumed
  from validity
  left join schedule_candidates as candidate
    on candidate.task_id = validity.task_id
  left join explicit_consumed as consumed
    on consumed.task_id = candidate.task_id
   and consumed.occurrence_date = candidate.occurrence_date
  group by
    validity.task_id,
    validity.expected_corrupted_due_on,
    validity.affected_id_count,
    validity.found_task_id,
    validity.user_id,
    validity.title,
    validity.current_status,
    validity.current_due_on,
    validity.recurrence_type,
    validity.recurrence_interval,
    validity.recurrence_weekdays,
    validity.repeat_day_of_month,
    validity.repeat_monthly_mode,
    validity.repeat_monthly_ordinal,
    validity.repeat_monthly_weekday,
    validity.revision,
    validity.updated_at,
    validity.trashed_at,
    validity.timezone,
    validity.rollover_time,
    validity.logical_date,
    validity.recurrence_configuration,
    validity.task_exists,
    validity.affected_id_is_unique,
    validity.active_recurring_lifecycle,
    validity.recurrence_configuration_valid,
    validity.current_date_is_affected_corruption
),
evaluated as (
  select
    proposals.*,
    proposed_forward_due_on is not null
      and proposed_forward_due_on >= logical_date
      and exists (
        select 1
        from schedule_candidates as valid_candidate
        where valid_candidate.task_id = proposals.task_id
          and valid_candidate.occurrence_date = proposals.proposed_forward_due_on
      )
      as proposed_date_valid_under_recurrence,
    task_exists
      and affected_id_is_unique
      and active_recurring_lifecycle
      and recurrence_configuration_valid
      and current_date_is_affected_corruption
      and proposed_forward_due_on is not null
      and proposed_forward_due_on >= logical_date
      and proposed_forward_due_on < current_due_on
      and exists (
        select 1
        from schedule_candidates as valid_candidate
        where valid_candidate.task_id = proposals.task_id
          and valid_candidate.occurrence_date = proposals.proposed_forward_due_on
      )
      as eligible
  from proposals
)
select
  evaluated.*,
  case
    when not task_exists then 'missing'
    when proposed_forward_due_on is not null and current_due_on = proposed_forward_due_on then 'unchanged'
    when eligible then 'eligible'
    else 'skipped'
  end as repair_classification,
  case
    when not task_exists then 'affected task not found'
    when not affected_id_is_unique then 'affected task ID is duplicated'
    when current_status = 'complete' then 'Complete lifecycle is excluded'
    when current_status = 'archived' then 'Archived lifecycle is excluded'
    when current_status = 'trashed' or trashed_at is not null then 'Trashed lifecycle is excluded'
    when not recurrence_configuration_valid then 'unsupported or invalid current recurrence configuration'
    when proposed_forward_due_on is null then 'no valid unconsumed occurrence found within the bounded horizon'
    when current_due_on = proposed_forward_due_on then null
    when not current_date_is_affected_corruption then 'current due_on no longer matches the exact affected corruption snapshot'
    when not proposed_date_valid_under_recurrence then 'proposed date is invalid under the current recurrence'
    when proposed_forward_due_on < logical_date then 'proposed date is earlier than the forward-reset boundary'
    when proposed_forward_due_on >= current_due_on then 'forward reset would not move the corrupted date backward'
    else null
  end as skip_reason,
  case
    when coalesce(cardinality(explicit_future_occurrences_consumed), 0) > 0
      then 'advanced past explicitly consumed successful occurrence identity'
    else 'first valid occurrence on or after the current logical date'
  end as repair_reason
from evaluated;

-- 1. READ-ONLY PREVIEW. Review every row and the repeated summary counts.
select
  task_id,
  title,
  current_due_on,
  proposed_forward_due_on,
  logical_date,
  recurrence_configuration,
  explicit_future_occurrences_consumed,
  repair_reason,
  revision as current_revision,
  eligible,
  skip_reason,
  count(*) over () as expected,
  count(*) filter (where task_exists) over () as found,
  count(*) filter (where eligible) over () as eligible_count,
  count(*) filter (where repair_classification = 'unchanged') over () as unchanged,
  count(*) filter (where repair_classification = 'skipped') over () as skipped,
  count(*) filter (where repair_classification = 'missing') over () as missing
from adhdice_task_state_forward_reset_7_6_18_snapshot
order by task_id;

rollback;

-- ADHDice 7.6.17 recurring-date repair dry run.
-- This diagnostic is intentionally limited to CTEs and one read-only query.

with expected_raw (
  task_id,
  expected_corrupted_due_on,
  proposed_repaired_due_on,
  expected_repeat_frequency,
  expected_repeat_interval,
  expected_repeat_days_of_week
) as (
  values
    ('96d688b4-54f5-4884-9971-38b43cba4aa5'::uuid, date '2027-05-31', date '2026-08-03', 'weekly', 1, array[1]::smallint[]),
    ('40dfaed0-4c1c-4ab0-a930-3bc0accbed94'::uuid, date '2027-05-31', date '2026-08-03', 'weekly', 1, array[1]::smallint[]),
    ('b421f72a-2745-46df-81a1-d8c8416e1951'::uuid, date '2027-05-31', date '2026-08-03', 'weekly', 1, array[1]::smallint[]),
    ('8ee7441c-2e4d-439a-be7f-d1e19fdb2a41'::uuid, date '2027-05-31', date '2026-08-03', 'weekly', 1, array[1]::smallint[]),
    ('81b64697-4291-4d3d-913a-c9d0e2f8d804'::uuid, date '2027-05-31', date '2026-08-03', 'weekly', 1, array[1]::smallint[]),
    ('27035f67-c008-4e54-9761-c7f01cf0604d'::uuid, date '2027-05-31', date '2026-08-03', 'weekly', 1, array[1]::smallint[]),
    ('058390ab-cc42-49ec-a458-8da05773732b'::uuid, date '2027-06-07', date '2026-08-10', 'weekly', 1, array[1]::smallint[]),
    ('8b50fb4b-a634-4c15-afb3-70307ebc528a'::uuid, date '2027-06-07', date '2026-08-10', 'weekly', 1, array[1]::smallint[]),
    ('d5d2d1ba-94f1-47d3-a7af-11fd3f208db1'::uuid, date '2027-06-07', date '2026-08-10', 'weekly', 1, array[1]::smallint[]),
    ('52e90aba-364a-4b9f-8c03-e512a099fe44'::uuid, date '2027-06-01', date '2026-08-04', 'weekly', 1, array[2]::smallint[]),
    ('46c06353-7930-4ed3-9449-4ae2084ffa57'::uuid, date '2027-06-03', date '2026-08-06', 'weekly', 1, array[4]::smallint[])
),
expected as (
  select
    expected_raw.*,
    count(*) over (partition by task_id) as expected_id_count
  from expected_raw
),
observed as (
  select
    expected.*,
    task.id as found_task_id,
    task.title,
    task.user_id,
    task.status::text as current_status,
    task.due_on as current_due_on,
    task.repeat_frequency::text as recurrence_type,
    task.repeat_interval as recurrence_interval,
    task.repeat_days_of_week as configured_weekdays,
    task.repeat_day_of_month,
    task.repeat_monthly_mode::text as repeat_monthly_mode,
    task.repeat_monthly_ordinal::text as repeat_monthly_ordinal,
    task.repeat_monthly_weekday,
    task.revision,
    task.updated_at,
    task.trashed_at
  from expected
  left join public.adhdice_clean_tasks as task
    on task.id = expected.task_id
),
checked as (
  select
    observed.*,
    found_task_id is not null as task_exists,
    found_task_id is not null
      and current_due_on = expected_corrupted_due_on as current_date_matches_expected_corruption,
    found_task_id is not null
      and recurrence_type = expected_repeat_frequency
      and recurrence_interval = expected_repeat_interval
      and configured_weekdays = expected_repeat_days_of_week
      and repeat_day_of_month is null
      and repeat_monthly_mode = 'day_of_month'
      and repeat_monthly_ordinal is null
      and repeat_monthly_weekday is null
      as recurrence_configuration_matches_report,
    found_task_id is not null
      and recurrence_type = 'weekly'
      and recurrence_interval = 1
      and extract(dow from proposed_repaired_due_on)::smallint = any(configured_weekdays)
      as recurrence_supports_proposed_date,
    found_task_id is not null
      and recurrence_type <> 'none'
      and current_status not in ('complete', 'archived', 'trashed')
      and trashed_at is null
      as active_recurring_task,
    expected_id_count = 1 as expected_id_is_unique
  from observed
),
evaluated as (
  select
    checked.*,
    task_exists
      and current_date_matches_expected_corruption
      and recurrence_configuration_matches_report
      and recurrence_supports_proposed_date
      and active_recurring_task
      and expected_id_is_unique
      as safe_to_repair
  from checked
)
select
  task_id,
  title,
  user_id,
  current_status,
  current_due_on,
  expected_corrupted_due_on,
  proposed_repaired_due_on,
  recurrence_type,
  recurrence_interval,
  configured_weekdays,
  repeat_day_of_month,
  repeat_monthly_mode,
  repeat_monthly_ordinal,
  repeat_monthly_weekday,
  revision,
  updated_at,
  task_exists,
  current_date_matches_expected_corruption,
  recurrence_configuration_matches_report,
  recurrence_supports_proposed_date,
  active_recurring_task,
  expected_id_is_unique,
  safe_to_repair,
  count(*) over () as expected_tasks,
  count(*) filter (where task_exists) over () as found_tasks,
  count(*) filter (where not task_exists) over () as missing_tasks,
  count(*) filter (where current_date_matches_expected_corruption) over () as exact_current_date_matches,
  count(*) filter (where recurrence_configuration_matches_report and recurrence_supports_proposed_date) over () as recurrence_matches,
  count(*) filter (where safe_to_repair) over () as safe_repair_candidates,
  count(*) filter (where not safe_to_repair) over () as unsafe_candidates
from evaluated
order by proposed_repaired_due_on, task_id;

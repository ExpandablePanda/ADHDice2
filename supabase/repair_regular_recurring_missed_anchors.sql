-- Manual 6.29.1 repair for regular recurring rows advanced by the rollover regression.
-- This file is never executed by the app. Run the preview by itself first, inspect
-- every row, then run the repair statement only after the preview is approved.

-- READ-ONLY PREVIEW
with recursive
history_summary as (
  select
    task.id as task_id,
    task.user_id,
    task.title,
    task.repeat_frequency,
    task.repeat_interval,
    task.repeat_days_of_week,
    task.repeat_day_of_month,
    task.status as current_status,
    task.due_on as current_due_on,
    max(history.entry_date) as latest_history_date,
    max(history.entry_date) filter (
      where history.status <> 'missed'
        or history.was_completed
        or history.event_type <> 'status'
        or history.counted_as_due_occurrence
    ) as last_resolving_or_ambiguous_date
  from public.adhdice_clean_tasks as task
  join public.adhdice_task_history as history
    on history.task_id = task.id
   and history.user_id = task.user_id
  where task.repeat_frequency not in ('none', 'daily_until_complete')
    and task.status in ('pending', 'missed', 'upcoming', 'not_due')
    and task.due_on is not null
    and task.completed_at is null
    and task.trashed_at is null
    and task.active_status_logical_date is null
    and task.active_occurrence_due_on is null
  group by
    task.id,
    task.user_id,
    task.title,
    task.repeat_frequency,
    task.repeat_interval,
    task.repeat_days_of_week,
    task.repeat_day_of_month,
    task.status,
    task.due_on
),
candidate_rows as (
  select
    summary.*,
    min(history.entry_date) as proposed_due_on,
    max(history.entry_date) as latest_missed_date,
    count(*)::integer as trailing_missed_count
  from history_summary as summary
  join public.adhdice_task_history as history
    on history.task_id = summary.task_id
   and history.user_id = summary.user_id
   and (
     summary.last_resolving_or_ambiguous_date is null
     or history.entry_date > summary.last_resolving_or_ambiguous_date
   )
  where history.status = 'missed'
    and not history.was_completed
    and history.event_type = 'status'
    and not history.counted_as_due_occurrence
  group by
    summary.task_id,
    summary.user_id,
    summary.title,
    summary.repeat_frequency,
    summary.repeat_interval,
    summary.repeat_days_of_week,
    summary.repeat_day_of_month,
    summary.current_status,
    summary.current_due_on,
    summary.latest_history_date,
    summary.last_resolving_or_ambiguous_date
),
expected_occurrences as (
  select candidate.task_id, candidate.user_id, candidate.proposed_due_on as occurrence_date
  from candidate_rows as candidate

  union all

  select
    expected.task_id,
    expected.user_id,
    public.adhdice_task_next_due_date(
      candidate.repeat_frequency,
      candidate.repeat_interval,
      candidate.repeat_days_of_week,
      candidate.repeat_day_of_month,
      expected.occurrence_date
    ) as occurrence_date
  from expected_occurrences as expected
  join candidate_rows as candidate
    on candidate.task_id = expected.task_id
   and candidate.user_id = expected.user_id
  where public.adhdice_task_next_due_date(
      candidate.repeat_frequency,
      candidate.repeat_interval,
      candidate.repeat_days_of_week,
      candidate.repeat_day_of_month,
      expected.occurrence_date
    ) > expected.occurrence_date
    and public.adhdice_task_next_due_date(
      candidate.repeat_frequency,
      candidate.repeat_interval,
      candidate.repeat_days_of_week,
      candidate.repeat_day_of_month,
      expected.occurrence_date
    ) < candidate.current_due_on
),
qualified_rows as (
  select candidate.*
  from candidate_rows as candidate
  where candidate.latest_history_date = candidate.latest_missed_date
    and candidate.current_due_on = public.adhdice_task_next_due_date(
      candidate.repeat_frequency,
      candidate.repeat_interval,
      candidate.repeat_days_of_week,
      candidate.repeat_day_of_month,
      candidate.latest_missed_date
    )
    and candidate.proposed_due_on < candidate.current_due_on
    and not exists (
      select 1
      from public.adhdice_task_history as later_resolution
      where later_resolution.task_id = candidate.task_id
        and later_resolution.user_id = candidate.user_id
        and later_resolution.entry_date > candidate.proposed_due_on
        and (
          later_resolution.status <> 'missed'
          or later_resolution.was_completed
          or later_resolution.event_type <> 'status'
          or later_resolution.counted_as_due_occurrence
        )
    )
    and not exists (
      select 1
      from expected_occurrences as expected
      where expected.task_id = candidate.task_id
        and expected.user_id = candidate.user_id
        and not exists (
          select 1
          from public.adhdice_task_history as missed_history
          where missed_history.task_id = candidate.task_id
            and missed_history.user_id = candidate.user_id
            and missed_history.entry_date = expected.occurrence_date
            and missed_history.status = 'missed'
            and not missed_history.was_completed
            and missed_history.event_type = 'status'
            and not missed_history.counted_as_due_occurrence
        )
    )
    and not exists (
      select 1
      from public.adhdice_task_history as unexpected_history
      where unexpected_history.task_id = candidate.task_id
        and unexpected_history.user_id = candidate.user_id
        and unexpected_history.entry_date >= candidate.proposed_due_on
        and unexpected_history.entry_date < candidate.current_due_on
        and not exists (
          select 1
          from expected_occurrences as expected
          where expected.task_id = candidate.task_id
            and expected.user_id = candidate.user_id
            and expected.occurrence_date = unexpected_history.entry_date
        )
    )
    and not exists (
      select 1
      from public.adhdice_task_history as current_or_future_history
      where current_or_future_history.task_id = candidate.task_id
        and current_or_future_history.user_id = candidate.user_id
        and current_or_future_history.entry_date >= candidate.current_due_on
    )
)
select
  user_id,
  task_id,
  title,
  repeat_frequency as recurrence_type,
  current_status,
  current_due_on,
  'missed'::public.adhdice_clean_task_status as proposed_status,
  proposed_due_on,
  trailing_missed_count,
  'regular recurrence advanced to its next occurrence while every occurrence in the current trailing history sequence remains unresolved Missed'::text as qualification_reason
from qualified_rows
order by user_id, proposed_due_on, title, task_id;

-- MUTATING REPAIR: run only after separately running and approving the preview above.
with recursive
history_summary as (
  select
    task.id as task_id,
    task.user_id,
    task.repeat_frequency,
    task.repeat_interval,
    task.repeat_days_of_week,
    task.repeat_day_of_month,
    task.status as current_status,
    task.due_on as current_due_on,
    max(history.entry_date) as latest_history_date,
    max(history.entry_date) filter (
      where history.status <> 'missed'
        or history.was_completed
        or history.event_type <> 'status'
        or history.counted_as_due_occurrence
    ) as last_resolving_or_ambiguous_date
  from public.adhdice_clean_tasks as task
  join public.adhdice_task_history as history
    on history.task_id = task.id
   and history.user_id = task.user_id
  where task.repeat_frequency not in ('none', 'daily_until_complete')
    and task.status in ('pending', 'missed', 'upcoming', 'not_due')
    and task.due_on is not null
    and task.completed_at is null
    and task.trashed_at is null
    and task.active_status_logical_date is null
    and task.active_occurrence_due_on is null
  group by
    task.id,
    task.user_id,
    task.repeat_frequency,
    task.repeat_interval,
    task.repeat_days_of_week,
    task.repeat_day_of_month,
    task.status,
    task.due_on
),
candidate_rows as (
  select
    summary.*,
    min(history.entry_date) as proposed_due_on,
    max(history.entry_date) as latest_missed_date
  from history_summary as summary
  join public.adhdice_task_history as history
    on history.task_id = summary.task_id
   and history.user_id = summary.user_id
   and (
     summary.last_resolving_or_ambiguous_date is null
     or history.entry_date > summary.last_resolving_or_ambiguous_date
   )
  where history.status = 'missed'
    and not history.was_completed
    and history.event_type = 'status'
    and not history.counted_as_due_occurrence
  group by
    summary.task_id,
    summary.user_id,
    summary.repeat_frequency,
    summary.repeat_interval,
    summary.repeat_days_of_week,
    summary.repeat_day_of_month,
    summary.current_status,
    summary.current_due_on,
    summary.latest_history_date,
    summary.last_resolving_or_ambiguous_date
),
expected_occurrences as (
  select candidate.task_id, candidate.user_id, candidate.proposed_due_on as occurrence_date
  from candidate_rows as candidate

  union all

  select
    expected.task_id,
    expected.user_id,
    public.adhdice_task_next_due_date(
      candidate.repeat_frequency,
      candidate.repeat_interval,
      candidate.repeat_days_of_week,
      candidate.repeat_day_of_month,
      expected.occurrence_date
    ) as occurrence_date
  from expected_occurrences as expected
  join candidate_rows as candidate
    on candidate.task_id = expected.task_id
   and candidate.user_id = expected.user_id
  where public.adhdice_task_next_due_date(
      candidate.repeat_frequency,
      candidate.repeat_interval,
      candidate.repeat_days_of_week,
      candidate.repeat_day_of_month,
      expected.occurrence_date
    ) > expected.occurrence_date
    and public.adhdice_task_next_due_date(
      candidate.repeat_frequency,
      candidate.repeat_interval,
      candidate.repeat_days_of_week,
      candidate.repeat_day_of_month,
      expected.occurrence_date
    ) < candidate.current_due_on
),
qualified_rows as (
  select candidate.*
  from candidate_rows as candidate
  where candidate.latest_history_date = candidate.latest_missed_date
    and candidate.current_due_on = public.adhdice_task_next_due_date(
      candidate.repeat_frequency,
      candidate.repeat_interval,
      candidate.repeat_days_of_week,
      candidate.repeat_day_of_month,
      candidate.latest_missed_date
    )
    and candidate.proposed_due_on < candidate.current_due_on
    and not exists (
      select 1
      from public.adhdice_task_history as later_resolution
      where later_resolution.task_id = candidate.task_id
        and later_resolution.user_id = candidate.user_id
        and later_resolution.entry_date > candidate.proposed_due_on
        and (
          later_resolution.status <> 'missed'
          or later_resolution.was_completed
          or later_resolution.event_type <> 'status'
          or later_resolution.counted_as_due_occurrence
        )
    )
    and not exists (
      select 1
      from expected_occurrences as expected
      where expected.task_id = candidate.task_id
        and expected.user_id = candidate.user_id
        and not exists (
          select 1
          from public.adhdice_task_history as missed_history
          where missed_history.task_id = candidate.task_id
            and missed_history.user_id = candidate.user_id
            and missed_history.entry_date = expected.occurrence_date
            and missed_history.status = 'missed'
            and not missed_history.was_completed
            and missed_history.event_type = 'status'
            and not missed_history.counted_as_due_occurrence
        )
    )
    and not exists (
      select 1
      from public.adhdice_task_history as unexpected_history
      where unexpected_history.task_id = candidate.task_id
        and unexpected_history.user_id = candidate.user_id
        and unexpected_history.entry_date >= candidate.proposed_due_on
        and unexpected_history.entry_date < candidate.current_due_on
        and not exists (
          select 1
          from expected_occurrences as expected
          where expected.task_id = candidate.task_id
            and expected.user_id = candidate.user_id
            and expected.occurrence_date = unexpected_history.entry_date
        )
    )
    and not exists (
      select 1
      from public.adhdice_task_history as current_or_future_history
      where current_or_future_history.task_id = candidate.task_id
        and current_or_future_history.user_id = candidate.user_id
        and current_or_future_history.entry_date >= candidate.current_due_on
    )
)
update public.adhdice_clean_tasks as task
set
  status = 'missed',
  due_on = qualified.proposed_due_on
from qualified_rows as qualified
where task.id = qualified.task_id
  and task.user_id = qualified.user_id
  and task.status = qualified.current_status
  and task.due_on = qualified.current_due_on
returning task.user_id, task.id, task.title, task.status, task.due_on;

-- ADHDice 7.15.44 server Task activity summary foundation.
--
-- Source-only forward patch. Canonical Task History remains authoritative;
-- this function is a compact read model for later consumers and 7.15.44
-- shadow parity only. Do not apply without explicit live SQL authorization.

begin;

create or replace function public.adhdice_get_task_activity_summary(
  p_as_of date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_state public.adhdice_task_history_sync_state%rowtype;
  v_summary jsonb;
begin
  if v_user_id is null then
    raise exception 'Task activity summary requires an authenticated owner.'
      using errcode = '28000';
  end if;
  if p_as_of is null then
    raise exception 'Task activity summary requires an as-of logical date.'
      using errcode = '22023';
  end if;

  -- The sync state row is read in the same stable function snapshot as the
  -- canonical facts. It is a freshness fence, not a second data authority.
  select state.*
    into v_state
   from public.adhdice_task_history_sync_state state
   where state.user_id = v_user_id;
  if not found then
    raise exception 'Task History sync state is unavailable for this owner.'
      using errcode = 'P0002';
  end if;

  with recursive
  current_tasks as (
    select task.id, task.parent_task_id, task.exclude_from_tracking
      from public.adhdice_clean_tasks task
     where task.user_id = v_user_id
       and task.permanently_deleted_at is null
  ),
  excluded_walk(id, path) as (
    select task.id, array[task.id]::uuid[]
      from current_tasks task
     where task.exclude_from_tracking is true
    union all
    select child.id, excluded_walk.path || child.id
      from excluded_walk
      join current_tasks child on child.parent_task_id = excluded_walk.id
     where not child.id = any(excluded_walk.path)
  ),
  excluded_task_ids as (
    select distinct excluded_walk.id
      from excluded_walk
  ),
  tracked_history as (
    select fact.entity_id, fact.logical_date, fact.outcome
      from public.adhdice_task_history_facts fact
     where fact.user_id = v_user_id
       and fact.logical_date <= p_as_of
       and not exists (
         select 1
           from excluded_task_ids excluded
          where excluded.id = fact.entity_id
       )
  ),
  tracked_days as (
    select tracked.logical_date,
           bool_or(tracked.outcome in ('done', 'did_my_best', 'complete')) as completed
      from tracked_history tracked
     group by tracked.logical_date
  ),
  completed_dates as (
    select tracked_days.logical_date
      from tracked_days
     where tracked_days.completed
  ),
  completed_islands as (
    select completed_dates.logical_date,
           completed_dates.logical_date
             - row_number() over (order by completed_dates.logical_date)::integer as island_key
      from completed_dates
  ),
  completed_island_lengths as (
    select completed_islands.island_key,
           count(*)::integer as island_length
      from completed_islands
     group by completed_islands.island_key
  ),
  logged_days as (
    select count(*)::integer as count
      from tracked_days
  ),
  completed_day_totals as (
    select count(*)::integer as count
      from completed_dates
  ),
  streak_seed as (
    select case
      when exists (select 1 from tracked_days where tracked_days.logical_date = p_as_of)
        then p_as_of
      else (select max(tracked_days.logical_date) from tracked_days)
    end as logical_date
  ),
  current_streak as (
    select case
      when streak_seed.logical_date is null then 0
      when not exists (
        select 1
          from completed_dates
         where completed_dates.logical_date = streak_seed.logical_date
      ) then 0
      else coalesce((
        select completed_island_lengths.island_length
          from completed_islands
          join completed_island_lengths
            on completed_island_lengths.island_key = completed_islands.island_key
         where completed_islands.logical_date = streak_seed.logical_date
      ), 0)
    end::integer as count
      from streak_seed
  ),
  recent_dates as (
    select (p_as_of - offsets.offset_value::integer) as logical_date
      from generate_series(0, 6) as offsets(offset_value)
  ),
  recent_counts as (
    select recent_dates.logical_date,
           count(tracked_history.entity_id) filter (
             where tracked_history.outcome in ('done', 'did_my_best', 'complete')
           )::integer as completed_count
      from recent_dates
      left join tracked_history on tracked_history.logical_date = recent_dates.logical_date
     group by recent_dates.logical_date
  ),
  metrics as (
    select logged_days.count as logged_days,
           completed_day_totals.count as completed_days,
           logged_days.count - completed_day_totals.count as missed_days,
           case
             when logged_days.count = 0 then 0
             else round((completed_day_totals.count::numeric / logged_days.count::numeric) * 100)::integer
           end as done_rate,
           current_streak.count as current_streak,
           coalesce((select max(completed_island_lengths.island_length) from completed_island_lengths), 0)::integer as best_streak
      from logged_days
      cross join completed_day_totals
      cross join current_streak
  )
  select jsonb_build_object(
    'contract_version', 'task-activity-summary-v1',
    'as_of_logical_date', p_as_of,
    'history_sync_epoch', v_state.sync_epoch,
    'history_current_revision', v_state.current_revision,
    'history_protocol_version', v_state.protocol_version,
    'tracked', jsonb_build_object(
      'logged_days', metrics.logged_days,
      'completed_days', metrics.completed_days,
      'missed_days', metrics.missed_days,
      'done_rate', metrics.done_rate,
      'current_streak', metrics.current_streak,
      'best_streak', metrics.best_streak
    ),
    'tracked_recent_completed_counts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'logical_date', recent_counts.logical_date,
          'completed_count', recent_counts.completed_count
        ) order by recent_counts.logical_date
      )
      from recent_counts
    ), '[]'::jsonb),
    'unfiltered_today_completed_count', (
      select count(*)::integer
        from public.adhdice_task_history_facts fact
       where fact.user_id = v_user_id
         and fact.logical_date = p_as_of
         and fact.outcome in ('done', 'did_my_best', 'complete')
    )
  )
    into v_summary
    from metrics;

  return v_summary;
end;
$function$;

revoke all on function public.adhdice_get_task_activity_summary(date)
  from public, anon, authenticated;
grant execute on function public.adhdice_get_task_activity_summary(date)
  to authenticated;

notify pgrst, 'reload schema';

commit;

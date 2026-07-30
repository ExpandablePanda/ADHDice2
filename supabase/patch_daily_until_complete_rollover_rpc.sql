-- Manual 6.7.7 patch.
-- Run this in the Supabase SQL editor after the 6.7.6 enum/history-contract SQL
-- has already been applied. This file is not executed automatically by the app.
--
-- Purpose:
-- 1. Teach the shared next-due helper that daily_until_complete advances like daily.
-- 2. Teach the canonical rollover RPC to backfill each overdue scheduled occurrence for
--    daily_until_complete and advance the live cursor without crossing the logical day.
-- 3. Keep interval and ordinal-monthly cadence calculations aligned with the client.

alter table public.adhdice_clean_tasks
  add column if not exists active_status_logical_date date,
  add column if not exists active_occurrence_due_on date;

create or replace function public.adhdice_task_next_due_date(
  p_repeat_frequency public.adhdice_clean_task_repeat_frequency,
  p_repeat_interval integer,
  p_repeat_days_of_week smallint[],
  p_repeat_day_of_month integer,
  p_reference_date date,
  p_repeat_monthly_mode public.adhdice_clean_task_repeat_monthly_mode,
  p_repeat_monthly_ordinal public.adhdice_clean_task_repeat_monthly_ordinal,
  p_repeat_monthly_weekday smallint
)
returns date
language plpgsql
immutable
as $$
declare
  v_interval integer := greatest(coalesce(p_repeat_interval, 1), 1);
  v_base_date date := p_reference_date;
  v_base_dow integer := extract(dow from v_base_date);
  v_next_dow integer;
  v_first_dow integer;
  v_days_until integer;
  v_target_day integer;
  v_target_month date;
  v_max_day integer;
  v_first_weekday integer;
  v_ordinal_offset integer;
begin
  if p_repeat_frequency = 'none' then
    return null;
  end if;

  if p_repeat_frequency in ('daily', 'daily_until_complete', 'custom') then
    return v_base_date + v_interval;
  end if;

  if p_repeat_frequency = 'weekly' then
    if coalesce(array_length(p_repeat_days_of_week, 1), 0) = 0 then
      return v_base_date + (7 * v_interval);
    end if;

    select min(day_value)
      into v_next_dow
      from unnest(p_repeat_days_of_week) as day_value
      where day_value > v_base_dow;

    select min(day_value)
      into v_first_dow
      from unnest(p_repeat_days_of_week) as day_value;

    if v_next_dow is not null then
      v_days_until := v_next_dow - v_base_dow;
    else
      v_days_until := (7 * v_interval) - (v_base_dow - coalesce(v_first_dow, v_base_dow));
    end if;

    return v_base_date + v_days_until;
  end if;

  if p_repeat_frequency = 'monthly' then
    v_target_month := (date_trunc('month', v_base_date)::date + interval '1 month' * v_interval)::date;
    v_max_day := extract(day from ((date_trunc('month', v_target_month)::date + interval '1 month - 1 day')::date))::integer;
    if p_repeat_monthly_mode = 'ordinal_weekday'
      and p_repeat_monthly_ordinal is not null
      and p_repeat_monthly_weekday is not null
    then
      if p_repeat_monthly_ordinal = 'last' then
        return (v_target_month + (v_max_day - 1))
          - ((extract(dow from (v_target_month + (v_max_day - 1)))::integer - p_repeat_monthly_weekday + 7) % 7);
      end if;

      v_first_weekday := extract(dow from v_target_month)::integer;
      v_ordinal_offset := case p_repeat_monthly_ordinal
        when 'first' then 0
        when 'second' then 1
        when 'third' then 2
        when 'fourth' then 3
      end;
      return v_target_month
        + ((p_repeat_monthly_weekday - v_first_weekday + 7) % 7)
        + (v_ordinal_offset * 7);
    end if;

    v_target_day := greatest(coalesce(p_repeat_day_of_month, extract(day from v_base_date)::integer), 1);
    return make_date(
      extract(year from v_target_month)::integer,
      extract(month from v_target_month)::integer,
      least(v_target_day, v_max_day)
    );
  end if;

  return null;
end;
$$;

create or replace function public.adhdice_reconcile_task_rollover(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns table (
  processed_date date,
  changed_task_count integer,
  inserted_history_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.adhdice_user_profiles%rowtype;
  v_timezone text;
  v_day_start_time text;
  v_effective_date date;
  v_rollover_date date;
  v_local_now timestamp without time zone;
  v_local_now_time time;
  v_changed_task_count integer := 0;
  v_inserted_history_count integer := 0;
  v_task public.adhdice_clean_tasks%rowtype;
  v_due_on date;
  v_history_date date;
  v_latest_history_date date;
  v_next_status public.adhdice_clean_task_status;
  v_row_count integer;
  v_achievement_evaluation jsonb;
  v_achievement_operation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if auth.uid() <> p_user_id then
    raise exception 'Not authorized to reconcile another user''s task rollover.';
  end if;

  perform set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true);
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select *
    into v_profile
    from public.adhdice_user_profiles
    where user_id = p_user_id;

  v_timezone := coalesce(nullif(v_profile.timezone, ''), 'America/New_York');
  v_day_start_time := coalesce(nullif(v_profile.day_start_time, ''), '06:00');
  v_local_now := p_now at time zone v_timezone;
  v_local_now_time := v_local_now::time;
  v_effective_date := public.adhdice_effective_logical_date(p_now, v_timezone, v_day_start_time);
  v_rollover_date := v_effective_date - 1;

  if exists (
    select 1
      from public.adhdice_task_rollover_ledger
      where user_id = p_user_id
        and logical_date = v_effective_date
  ) then
    return query select v_effective_date, 0, 0;
    return;
  end if;

  for v_task in
    select *
      from public.adhdice_clean_tasks
      where user_id = p_user_id
        and status <> 'archived'
        and (
          (due_on is not null and due_on <= v_rollover_date)
          or (
            status = 'in_progress'
            and active_status_logical_date is not null
            and active_status_logical_date <= v_rollover_date
          )
        )
      order by coalesce(active_status_logical_date, due_on) asc, created_at asc
  loop
    if v_task.status = 'in_progress'
      and v_task.active_status_logical_date is not null
      and v_task.active_status_logical_date <= v_rollover_date
    then
      insert into public.adhdice_task_history (
        task_id,
        user_id,
        entry_date,
        status,
        was_completed,
        event_type,
        counted_as_due_occurrence,
        occurrence_key,
        occurrence_due_on
      )
      values (
        v_task.id,
        p_user_id,
        v_task.active_status_logical_date,
        'did_my_best',
        true,
        'status',
        true,
        case
          when v_task.repeat_frequency = 'none' then 'lifetime:' || v_task.id::text
          else 'occurrence:' || coalesce(v_task.active_occurrence_due_on, v_task.due_on, v_task.active_status_logical_date)::text
        end,
        case
          when v_task.repeat_frequency = 'none' then null
          else coalesce(v_task.active_occurrence_due_on, v_task.due_on, v_task.active_status_logical_date)
        end
      )
      on conflict (user_id, task_id, entry_date) do nothing;

      get diagnostics v_row_count = row_count;
      v_inserted_history_count := v_inserted_history_count + v_row_count;

      if v_task.repeat_frequency = 'none' then
        update public.adhdice_clean_tasks
          set
            status = 'did_my_best',
            completed_at = coalesce(completed_at, p_now),
            active_status_logical_date = null,
            active_occurrence_due_on = null
          where id = v_task.id
            and user_id = p_user_id;
      else
        v_due_on := public.adhdice_task_next_due_date(
          v_task.repeat_frequency,
          v_task.repeat_interval,
          v_task.repeat_days_of_week,
          v_task.repeat_day_of_month,
          v_task.active_status_logical_date,
          v_task.repeat_monthly_mode,
          v_task.repeat_monthly_ordinal,
          v_task.repeat_monthly_weekday
        );
        v_next_status := public.adhdice_resolve_recurring_due_status(
          v_due_on,
          v_task.due_time,
          v_effective_date,
          v_local_now_time
        );

        update public.adhdice_clean_tasks
          set
            due_on = v_due_on,
            status = v_next_status,
            completed_at = null,
            active_status_logical_date = null,
            active_occurrence_due_on = null
          where id = v_task.id
            and user_id = p_user_id;
      end if;

      get diagnostics v_row_count = row_count;
      v_changed_task_count := v_changed_task_count + v_row_count;
      continue;
    end if;

    -- A success may be recorded before its scheduled weekly occurrence. Its
    -- canonical identity, rather than the action entry_date, resolves that
    -- occurrence and lets rollover safely finish an interrupted finalization.
    if v_task.repeat_frequency <> 'none'
      and v_task.due_on is not null
      and v_task.status not in ('archived', 'trashed', 'complete')
      and exists (
        select 1
          from public.adhdice_task_history as history
          where history.user_id = p_user_id
            and history.task_id = v_task.id
            and history.status in ('done', 'did_my_best')
            and history.was_completed
            and (
              history.occurrence_key = 'occurrence:' || v_task.due_on::text
              or history.occurrence_due_on = v_task.due_on
            )
      )
    then
      select max(history.entry_date)
        into v_latest_history_date
        from public.adhdice_task_history as history
        where history.user_id = p_user_id
          and history.task_id = v_task.id
          and history.status in ('done', 'did_my_best')
          and history.was_completed
          and (
            history.occurrence_key = 'occurrence:' || v_task.due_on::text
            or history.occurrence_due_on = v_task.due_on
          );
      v_due_on := public.adhdice_task_next_due_date(
        v_task.repeat_frequency,
        v_task.repeat_interval,
        v_task.repeat_days_of_week,
        v_task.repeat_day_of_month,
        v_latest_history_date,
        v_task.repeat_monthly_mode,
        v_task.repeat_monthly_ordinal,
        v_task.repeat_monthly_weekday
      );
      v_next_status := public.adhdice_resolve_recurring_due_status(
        v_due_on,
        v_task.due_time,
        v_effective_date,
        v_local_now_time
      );

      update public.adhdice_clean_tasks
        set
          due_on = v_due_on,
          status = v_next_status,
          completed_at = null,
          active_status_logical_date = null,
          active_occurrence_due_on = null
        where id = v_task.id
          and user_id = p_user_id
          and (
            due_on is distinct from v_due_on
            or status is distinct from v_next_status
            or completed_at is not null
            or active_status_logical_date is not null
            or active_occurrence_due_on is not null
          );

      get diagnostics v_row_count = row_count;
      v_changed_task_count := v_changed_task_count + v_row_count;
      continue;
    end if;

    if v_task.status not in ('pending', 'in_progress', 'delayed', 'missed', 'upcoming', 'not_due') then
      continue;
    end if;

    -- Once the initial due boundary has passed unresolved, cadence no longer
    -- spaces Missed days. Each completed logical day is materialized while
    -- due_on remains frozen at the unresolved boundary.
    v_history_date := v_task.due_on;
    while v_history_date is not null and v_history_date <= v_rollover_date loop
      insert into public.adhdice_task_history (
        task_id,
        user_id,
        entry_date,
        status,
        was_completed,
        occurrence_key
      )
      values (
        v_task.id,
        p_user_id,
        v_history_date,
        'missed',
        false,
        'derived-missed:' || v_task.due_on::text
      )
      on conflict (user_id, task_id, entry_date) do nothing;

      get diagnostics v_row_count = row_count;
      v_inserted_history_count := v_inserted_history_count + v_row_count;
      v_history_date := v_history_date + 1;
    end loop;

    update public.adhdice_clean_tasks
      set
        status = 'missed',
        completed_at = null,
        active_status_logical_date = null,
        active_occurrence_due_on = null
      where id = v_task.id
        and user_id = p_user_id
        and (
          status is distinct from 'missed'
          or completed_at is not null
          or active_status_logical_date is not null
          or active_occurrence_due_on is not null
        );

    get diagnostics v_row_count = row_count;
    v_changed_task_count := v_changed_task_count + v_row_count;
  end loop;

  perform set_config('adhdice.achievement_deferred_user_id', '', true);
  v_achievement_operation_id := md5('task-rollover:' || p_user_id::text || ':' || v_effective_date::text)::uuid;
  v_achievement_evaluation := public.adhdice_evaluate_achievements(
    p_user_id,
    v_achievement_operation_id,
    'immediate'
  );
  if coalesce(v_achievement_evaluation->>'status', '') not in ('completed', 'inactive') then
    raise exception 'Final Achievement evaluation failed with status % and code %.',
      coalesce(v_achievement_evaluation->>'status', 'missing'),
      coalesce(v_achievement_evaluation->>'error_code', 'unknown');
  end if;

  insert into public.adhdice_task_rollover_ledger (user_id, logical_date)
  values (p_user_id, v_effective_date)
  on conflict (user_id, logical_date) do nothing;

  return query select v_effective_date, v_changed_task_count, v_inserted_history_count;
end;
$$;

revoke execute on function public.adhdice_reconcile_task_rollover(uuid, timestamptz) from public;
revoke execute on function public.adhdice_reconcile_task_rollover(uuid, timestamptz) from anon;
grant execute on function public.adhdice_reconcile_task_rollover(uuid, timestamptz) to authenticated;

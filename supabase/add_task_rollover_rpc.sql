alter table public.adhdice_user_profiles
  add column if not exists timezone text not null default 'America/New_York';

create table if not exists public.adhdice_task_rollover_ledger (
  user_id uuid not null references auth.users(id) on delete cascade,
  logical_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, logical_date)
);

alter table public.adhdice_task_rollover_ledger enable row level security;

drop policy if exists "Users can read their own task rollover ledger" on public.adhdice_task_rollover_ledger;
drop policy if exists "Users can create their own task rollover ledger" on public.adhdice_task_rollover_ledger;

create policy "Users can read their own task rollover ledger"
  on public.adhdice_task_rollover_ledger
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own task rollover ledger"
  on public.adhdice_task_rollover_ledger
  for insert
  with check (auth.uid() = user_id);

create or replace function public.adhdice_effective_logical_date(
  p_now timestamptz,
  p_timezone text,
  p_day_start_time text
)
returns date
language sql
stable
as $$
  with local_now as (
    select
      (p_now at time zone coalesce(nullif(p_timezone, ''), 'America/New_York')) as ts,
      coalesce(nullif(p_day_start_time, ''), '06:00')::time as day_start_time
  )
  select
    case
      when (ts::time < day_start_time) then (ts::date - 1)
      else ts::date
    end
  from local_now;
$$;

create or replace function public.adhdice_task_next_due_date(
  p_repeat_frequency public.adhdice_clean_task_repeat_frequency,
  p_repeat_interval integer,
  p_repeat_days_of_week smallint[],
  p_repeat_day_of_month integer,
  p_reference_date date
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
begin
  if p_repeat_frequency = 'none' then
    return null;
  end if;

  if p_repeat_frequency = 'daily' or p_repeat_frequency = 'custom' then
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
    v_target_day := coalesce(p_repeat_day_of_month, extract(day from v_base_date)::integer);
    v_target_month := (date_trunc('month', v_base_date)::date + make_interval(months => v_interval))::date;
    v_max_day := extract(day from ((date_trunc('month', v_target_month)::date + interval '1 month - 1 day')))::integer;
    return make_date(
      extract(year from v_target_month)::integer,
      extract(month from v_target_month)::integer,
      least(v_target_day, v_max_day)
    );
  end if;

  return v_base_date + v_interval;
end;
$$;

create or replace function public.adhdice_resolve_recurring_due_status(
  p_due_on date,
  p_due_time time,
  p_effective_date date,
  p_local_now_time time
)
returns public.adhdice_clean_task_status
language plpgsql
immutable
as $$
begin
  if p_due_on is null then
    return 'not_due';
  end if;

  if p_due_on > p_effective_date then
    return 'not_due';
  end if;

  if p_due_on = p_effective_date and p_due_time is not null and p_due_time > p_local_now_time then
    return 'upcoming';
  end if;

  return 'pending';
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
  v_next_due date;
  v_next_status public.adhdice_clean_task_status;
  v_resolution public.adhdice_clean_task_status;
  v_processed_any boolean;
  v_row_count integer;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Not authorized to reconcile another user''s task rollover.';
  end if;

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
        and due_on is not null
        and status <> 'archived'
        and due_on <= v_rollover_date
      order by due_on asc, created_at asc
  loop
    if v_task.repeat_frequency = 'none' then
      if v_task.status not in ('pending', 'in_progress', 'upcoming', 'not_due') then
        continue;
      end if;

      v_resolution := case when v_task.status = 'in_progress' then 'did_my_best' else 'missed' end;

      insert into public.adhdice_task_history (
        task_id,
        user_id,
        entry_date,
        status,
        was_completed
      )
      values (
        v_task.id,
        p_user_id,
        v_task.due_on,
        v_resolution,
        (v_resolution in ('done', 'did_my_best'))
      )
      on conflict (user_id, task_id, entry_date) do update
        set
          status = excluded.status,
          was_completed = excluded.was_completed,
          updated_at = now();

      v_inserted_history_count := v_inserted_history_count + 1;

      update public.adhdice_clean_tasks
        set
          status = v_resolution,
          completed_at = case
            when v_resolution = 'did_my_best' then coalesce(completed_at, p_now)
            else completed_at
          end
        where id = v_task.id
          and user_id = p_user_id
          and (
            status is distinct from v_resolution
            or (v_resolution = 'did_my_best' and completed_at is null)
          );

      get diagnostics v_row_count = row_count;
      v_changed_task_count := v_changed_task_count + v_row_count;
      continue;
    end if;

    if v_task.status not in ('pending', 'in_progress', 'missed', 'upcoming', 'not_due') then
      continue;
    end if;

    v_due_on := v_task.due_on;
    v_processed_any := false;

    while v_due_on is not null and v_due_on <= v_rollover_date loop
      v_resolution := case
        when v_task.status = 'in_progress' and not v_processed_any then 'did_my_best'
        else 'missed'
      end;

      insert into public.adhdice_task_history (
        task_id,
        user_id,
        entry_date,
        status,
        was_completed
      )
      values (
        v_task.id,
        p_user_id,
        v_due_on,
        v_resolution,
        (v_resolution in ('done', 'did_my_best'))
      )
      on conflict (user_id, task_id, entry_date) do update
        set
          status = excluded.status,
          was_completed = excluded.was_completed,
          updated_at = now();

      v_inserted_history_count := v_inserted_history_count + 1;
      v_processed_any := true;
      v_due_on := public.adhdice_task_next_due_date(
        v_task.repeat_frequency,
        v_task.repeat_interval,
        v_task.repeat_days_of_week,
        v_task.repeat_day_of_month,
        v_due_on
      );
    end loop;

    if not v_processed_any then
      continue;
    end if;

    if v_task.status = 'in_progress' then
      v_next_status := public.adhdice_resolve_recurring_due_status(
        v_due_on,
        v_task.due_time,
        v_effective_date,
        v_local_now_time
      );
    else
      v_next_status := 'missed';
    end if;

    update public.adhdice_clean_tasks
      set
        due_on = v_due_on,
        status = v_next_status,
        completed_at = null
      where id = v_task.id
        and user_id = p_user_id
        and (
          due_on is distinct from v_due_on
          or status is distinct from v_next_status
          or completed_at is not null
        );

    get diagnostics v_row_count = row_count;
    v_changed_task_count := v_changed_task_count + v_row_count;
  end loop;

  insert into public.adhdice_task_rollover_ledger (user_id, logical_date)
  values (p_user_id, v_effective_date)
  on conflict (user_id, logical_date) do nothing;

  return query select v_effective_date, v_changed_task_count, v_inserted_history_count;
end;
$$;

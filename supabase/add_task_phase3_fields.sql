do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'adhdice_clean_task_repeat_frequency'
  ) then
    create type public.adhdice_clean_task_repeat_frequency as enum ('none', 'daily', 'weekly', 'monthly', 'custom');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'adhdice_clean_task_status_v2'
  ) then
    create type public.adhdice_clean_task_status_v2 as enum ('pending', 'in_progress', 'done', 'missed', 'did_my_best', 'upcoming', 'not_due', 'archived');
  end if;
end
$$;

alter table public.adhdice_clean_tasks
  alter column status drop default;

alter table public.adhdice_clean_tasks
  alter column status type public.adhdice_clean_task_status_v2
  using (
    case status::text
      when 'active' then 'pending'
      when 'done' then 'done'
      when 'archived' then 'archived'
      else 'pending'
    end
  )::public.adhdice_clean_task_status_v2;

alter table public.adhdice_clean_tasks
  alter column status set default 'pending';

drop type if exists public.adhdice_clean_task_status;
alter type public.adhdice_clean_task_status_v2 rename to adhdice_clean_task_status;

alter table public.adhdice_clean_tasks
  add column if not exists is_urgent boolean not null default false,
  add column if not exists is_important boolean not null default false,
  add column if not exists due_time time,
  add column if not exists estimated_minutes integer,
  add column if not exists tags text[] not null default '{}',
  add column if not exists external_link_label text,
  add column if not exists external_link_url text,
  add column if not exists one_step_at_a_time boolean not null default false,
  add column if not exists repeat_frequency public.adhdice_clean_task_repeat_frequency not null default 'none',
  add column if not exists repeat_interval integer not null default 1,
  add column if not exists repeat_days_of_week smallint[] not null default '{}',
  add column if not exists repeat_day_of_month integer;

alter table public.adhdice_clean_tasks
  drop constraint if exists adhdice_clean_tasks_estimated_minutes_check,
  add constraint adhdice_clean_tasks_estimated_minutes_check
    check (estimated_minutes is null or estimated_minutes > 0),
  drop constraint if exists adhdice_clean_tasks_repeat_interval_check,
  add constraint adhdice_clean_tasks_repeat_interval_check
    check (repeat_interval > 0),
  drop constraint if exists adhdice_clean_tasks_repeat_day_of_month_check,
  add constraint adhdice_clean_tasks_repeat_day_of_month_check
    check (repeat_day_of_month is null or (repeat_day_of_month >= 1 and repeat_day_of_month <= 31));

create index if not exists adhdice_clean_tasks_user_due_idx
  on public.adhdice_clean_tasks (user_id, due_on, due_time);

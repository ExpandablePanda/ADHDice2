create table if not exists public.adhdice_task_active_timers (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  title_snapshot text not null check (char_length(trim(title_snapshot)) > 0),
  start_time timestamptz,
  accumulated_seconds integer not null default 0 check (accumulated_seconds >= 0),
  started_actual_seconds integer not null default 0 check (started_actual_seconds >= 0),
  is_running boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

create index if not exists adhdice_task_active_timers_user_created_idx
  on public.adhdice_task_active_timers (user_id, created_at asc, updated_at desc);

alter table public.adhdice_task_active_timers enable row level security;

drop policy if exists "Users can read their own active task timers" on public.adhdice_task_active_timers;
drop policy if exists "Users can create their own active task timers" on public.adhdice_task_active_timers;
drop policy if exists "Users can update their own active task timers" on public.adhdice_task_active_timers;
drop policy if exists "Users can delete their own active task timers" on public.adhdice_task_active_timers;

create policy "Users can read their own active task timers"
  on public.adhdice_task_active_timers
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own active task timers"
  on public.adhdice_task_active_timers
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own active task timers"
  on public.adhdice_task_active_timers
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own active task timers"
  on public.adhdice_task_active_timers
  for delete
  using (auth.uid() = user_id);

drop trigger if exists adhdice_task_active_timers_set_updated_at on public.adhdice_task_active_timers;

create trigger adhdice_task_active_timers_set_updated_at
  before update on public.adhdice_task_active_timers
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_task_active_timers;

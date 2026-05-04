create table if not exists public.adhdice_task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  status public.adhdice_clean_task_status not null,
  was_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, task_id, entry_date)
);

create index if not exists adhdice_task_history_user_date_idx
  on public.adhdice_task_history (user_id, entry_date desc, created_at desc);

alter table public.adhdice_task_history enable row level security;

drop policy if exists "Users can read their own task history" on public.adhdice_task_history;
drop policy if exists "Users can create their own task history" on public.adhdice_task_history;
drop policy if exists "Users can update their own task history" on public.adhdice_task_history;
drop policy if exists "Users can delete their own task history" on public.adhdice_task_history;

create policy "Users can read their own task history"
  on public.adhdice_task_history
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own task history"
  on public.adhdice_task_history
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task history"
  on public.adhdice_task_history
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own task history"
  on public.adhdice_task_history
  for delete
  using (auth.uid() = user_id);

drop trigger if exists adhdice_task_history_set_updated_at on public.adhdice_task_history;

create trigger adhdice_task_history_set_updated_at
  before update on public.adhdice_task_history
  for each row
  execute function public.adhdice_clean_set_updated_at();

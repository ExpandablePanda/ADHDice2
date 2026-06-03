create table if not exists public.adhdice_task_actual_time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  title_snapshot text not null check (char_length(trim(title_snapshot)) > 0),
  duration_seconds integer not null check (duration_seconds > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists adhdice_task_actual_time_entries_user_task_date_idx
  on public.adhdice_task_actual_time_entries (user_id, task_id, entry_date desc, created_at desc);

alter table public.adhdice_task_actual_time_entries enable row level security;

drop policy if exists "Users can read their own task actual time entries" on public.adhdice_task_actual_time_entries;
drop policy if exists "Users can create their own task actual time entries" on public.adhdice_task_actual_time_entries;
drop policy if exists "Users can update their own task actual time entries" on public.adhdice_task_actual_time_entries;
drop policy if exists "Users can delete their own task actual time entries" on public.adhdice_task_actual_time_entries;

create policy "Users can read their own task actual time entries"
  on public.adhdice_task_actual_time_entries
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own task actual time entries"
  on public.adhdice_task_actual_time_entries
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task actual time entries"
  on public.adhdice_task_actual_time_entries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own task actual time entries"
  on public.adhdice_task_actual_time_entries
  for delete
  using (auth.uid() = user_id);

alter publication supabase_realtime add table public.adhdice_task_actual_time_entries;

create extension if not exists pgcrypto;

create type public.adhdice_clean_task_status as enum ('active', 'done', 'archived');
create type public.adhdice_clean_task_priority as enum ('low', 'normal', 'high');
create type public.adhdice_clean_task_energy as enum ('low', 'medium', 'high');

create table public.adhdice_clean_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  notes text,
  status public.adhdice_clean_task_status not null default 'active',
  priority public.adhdice_clean_task_priority not null default 'normal',
  energy public.adhdice_clean_task_energy not null default 'medium',
  due_on date,
  sort_order bigint not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index adhdice_clean_tasks_user_status_sort_idx
  on public.adhdice_clean_tasks (user_id, status, sort_order, created_at desc);

alter table public.adhdice_clean_tasks enable row level security;

create policy "Users can read their own clean tasks"
  on public.adhdice_clean_tasks
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own clean tasks"
  on public.adhdice_clean_tasks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own clean tasks"
  on public.adhdice_clean_tasks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own clean tasks"
  on public.adhdice_clean_tasks
  for delete
  using (auth.uid() = user_id);

create or replace function public.adhdice_clean_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger adhdice_clean_tasks_set_updated_at
  before update on public.adhdice_clean_tasks
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_clean_tasks;

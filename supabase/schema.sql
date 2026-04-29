create extension if not exists pgcrypto;

create type public.task_status as enum ('active', 'done', 'archived');
create type public.task_priority as enum ('low', 'normal', 'high');
create type public.task_energy as enum ('low', 'medium', 'high');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  notes text,
  status public.task_status not null default 'active',
  priority public.task_priority not null default 'normal',
  energy public.task_energy not null default 'medium',
  due_on date,
  sort_order bigint not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_status_sort_idx
  on public.tasks (user_id, status, sort_order, created_at desc);

alter table public.tasks enable row level security;

create policy "Users can read their own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "Users can create their own tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tasks"
  on public.tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own tasks"
  on public.tasks for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row
  execute function public.set_updated_at();

alter publication supabase_realtime add table public.tasks;

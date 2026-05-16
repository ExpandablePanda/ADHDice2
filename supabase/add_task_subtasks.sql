do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'adhdice_clean_task_subtask_status'
  ) then
    create type public.adhdice_clean_task_subtask_status as enum ('pending', 'in_progress', 'done', 'missed', 'did_my_best', 'upcoming', 'not_due');
  end if;
end
$$;

alter table public.adhdice_clean_tasks
  add column if not exists subtasks_auto_reset boolean not null default false;

create table if not exists public.adhdice_task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  status public.adhdice_clean_task_subtask_status not null default 'pending',
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adhdice_task_subtasks_task_sort_idx
  on public.adhdice_task_subtasks (task_id, sort_order, created_at asc);

alter table public.adhdice_task_subtasks enable row level security;

create policy "Users can read their own task subtasks"
  on public.adhdice_task_subtasks
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own task subtasks"
  on public.adhdice_task_subtasks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task subtasks"
  on public.adhdice_task_subtasks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own task subtasks"
  on public.adhdice_task_subtasks
  for delete
  using (auth.uid() = user_id);

create trigger adhdice_task_subtasks_set_updated_at
  before update on public.adhdice_task_subtasks
  for each row
  execute function public.adhdice_clean_set_updated_at();

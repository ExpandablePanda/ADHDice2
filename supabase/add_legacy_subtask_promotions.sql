create table if not exists public.adhdice_legacy_subtask_promotions (
  legacy_subtask_id uuid primary key references public.adhdice_task_subtasks(id) on delete cascade,
  task_id uuid not null unique references public.adhdice_clean_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adhdice_legacy_subtask_promotions_user_idx
  on public.adhdice_legacy_subtask_promotions (user_id, created_at desc);

alter table public.adhdice_legacy_subtask_promotions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_legacy_subtask_promotions'
      and policyname = 'Users can read their own legacy subtask promotions'
  ) then
    create policy "Users can read their own legacy subtask promotions"
      on public.adhdice_legacy_subtask_promotions
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_legacy_subtask_promotions'
      and policyname = 'Users can create their own legacy subtask promotions'
  ) then
    create policy "Users can create their own legacy subtask promotions"
      on public.adhdice_legacy_subtask_promotions
      for insert
      with check (
        auth.uid() = adhdice_legacy_subtask_promotions.user_id
        and exists (
          select 1
          from public.adhdice_task_subtasks legacy_subtask
          where legacy_subtask.id = adhdice_legacy_subtask_promotions.legacy_subtask_id
            and legacy_subtask.user_id = auth.uid()
            and legacy_subtask.user_id = adhdice_legacy_subtask_promotions.user_id
        )
        and exists (
          select 1
          from public.adhdice_clean_tasks promoted_task
          where promoted_task.id = adhdice_legacy_subtask_promotions.task_id
            and promoted_task.user_id = auth.uid()
            and promoted_task.user_id = adhdice_legacy_subtask_promotions.user_id
        )
      );
  end if;
end
$$;

drop trigger if exists adhdice_legacy_subtask_promotions_set_updated_at
  on public.adhdice_legacy_subtask_promotions;

create trigger adhdice_legacy_subtask_promotions_set_updated_at
  before update on public.adhdice_legacy_subtask_promotions
  for each row
  execute function public.adhdice_clean_set_updated_at();

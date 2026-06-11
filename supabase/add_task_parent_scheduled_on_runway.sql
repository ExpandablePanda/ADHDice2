alter table public.adhdice_clean_tasks
  add column if not exists parent_task_id uuid references public.adhdice_clean_tasks(id) on delete cascade;

alter table public.adhdice_clean_tasks
  add column if not exists scheduled_on date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'adhdice_clean_tasks_parent_task_not_self'
      and conrelid = 'public.adhdice_clean_tasks'::regclass
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_parent_task_not_self
      check (parent_task_id is null or parent_task_id <> id);
  end if;
end
$$;

create index if not exists adhdice_clean_tasks_parent_task_idx
  on public.adhdice_clean_tasks (parent_task_id);

update public.adhdice_clean_tasks
set scheduled_on = due_on
where scheduled_on is null
  and due_on is not null;

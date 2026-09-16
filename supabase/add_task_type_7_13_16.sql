-- ADHDice 7.13.16: persisted TaskType metadata.
-- Authored for review/application; do not run against live Supabase automatically.

alter table if exists public.adhdice_clean_tasks
  add column if not exists task_type text;

update public.adhdice_clean_tasks
set task_type = 'task'
where task_type is null;

alter table if exists public.adhdice_clean_tasks
  alter column task_type set default 'task',
  alter column task_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_task_type_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_task_type_check
      check (task_type in ('task', 'pursuit', 'goal', 'custom'));
  end if;
end;
$$;

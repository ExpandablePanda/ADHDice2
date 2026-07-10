alter table public.adhdice_clean_tasks
  alter column priority_level set default 0;

alter table public.adhdice_clean_tasks
  drop constraint if exists adhdice_clean_tasks_priority_level_check;

alter table public.adhdice_clean_tasks
  add constraint adhdice_clean_tasks_priority_level_check
  check (priority_level between 0 and 5);

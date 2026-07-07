alter table public.adhdice_clean_tasks
  add column if not exists priority_level integer;

update public.adhdice_clean_tasks
set priority_level = case
  when is_urgent = true then 5
  when is_important = true then 4
  when priority = 'high' then 4
  when priority = 'normal' then 3
  when priority = 'low' then 2
  else 3
end
where priority_level is null
   or priority_level < 1
   or priority_level > 5;

alter table public.adhdice_clean_tasks
  alter column priority_level set default 3;

update public.adhdice_clean_tasks
set priority_level = 3
where priority_level is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'adhdice_clean_tasks_priority_level_check'
      and conrelid = 'public.adhdice_clean_tasks'::regclass
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_priority_level_check
      check (priority_level between 1 and 5);
  end if;
end $$;

alter table public.adhdice_clean_tasks
  alter column priority_level set not null;

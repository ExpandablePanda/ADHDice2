alter table public.adhdice_clean_tasks
  add column if not exists revision integer;

update public.adhdice_clean_tasks
set revision = 1
where revision is null;

alter table public.adhdice_clean_tasks
  alter column revision set default 1;

alter table public.adhdice_clean_tasks
  alter column revision set not null;

create or replace function public.adhdice_clean_tasks_bump_revision()
returns trigger
language plpgsql
as $$
begin
  if row(new.*) is distinct from row(old.*) then
    new.revision = old.revision + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists adhdice_clean_tasks_bump_revision
  on public.adhdice_clean_tasks;

create trigger adhdice_clean_tasks_bump_revision
  before update on public.adhdice_clean_tasks
  for each row
  execute function public.adhdice_clean_tasks_bump_revision();

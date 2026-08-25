begin;

alter table public.adhdice_health_exercises
  add column if not exists sort_order integer;

with ordered_exercises as (
  select
    id,
    row_number() over (
      partition by user_id
      order by lower(trim(name)), created_at, id
    ) - 1 as next_sort_order
  from public.adhdice_health_exercises
  where sort_order is null
)
update public.adhdice_health_exercises as exercises
set sort_order = ordered_exercises.next_sort_order
from ordered_exercises
where exercises.id = ordered_exercises.id
  and exercises.sort_order is null;

alter table public.adhdice_health_exercises
  alter column sort_order set default 0,
  alter column sort_order set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.adhdice_health_exercises'::regclass
      and conname = 'adhdice_health_exercises_sort_order_check'
  ) then
    alter table public.adhdice_health_exercises
      add constraint adhdice_health_exercises_sort_order_check check (sort_order >= 0);
  end if;
end
$$;

create index if not exists adhdice_health_exercises_user_active_order_idx
  on public.adhdice_health_exercises (user_id, archived_at, sort_order, created_at, id);

notify pgrst, 'reload schema';

commit;

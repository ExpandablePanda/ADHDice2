begin;

alter table if exists public.adhdice_health_profiles
  add column if not exists workout_title_options text[] default '{}';

update public.adhdice_health_profiles
set workout_title_options = '{}'
where workout_title_options is null;

alter table if exists public.adhdice_health_profiles
  alter column workout_title_options set default '{}',
  alter column workout_title_options set not null;

notify pgrst, 'reload schema';

commit;

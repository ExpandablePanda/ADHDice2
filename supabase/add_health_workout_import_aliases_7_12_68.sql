begin;

alter table if exists public.adhdice_health_profiles
  add column if not exists workout_import_aliases jsonb default '{}'::jsonb;

update public.adhdice_health_profiles
set workout_import_aliases = '{}'::jsonb
where workout_import_aliases is null
   or jsonb_typeof(workout_import_aliases) <> 'object';

alter table if exists public.adhdice_health_profiles
  alter column workout_import_aliases set default '{}'::jsonb,
  alter column workout_import_aliases set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'adhdice_health_profiles_workout_import_aliases_object_check'
      and conrelid = 'public.adhdice_health_profiles'::regclass
  ) then
    alter table public.adhdice_health_profiles
      add constraint adhdice_health_profiles_workout_import_aliases_object_check
      check (jsonb_typeof(workout_import_aliases) = 'object');
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

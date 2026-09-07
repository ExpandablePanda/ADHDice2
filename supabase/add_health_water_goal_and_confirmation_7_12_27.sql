begin;

alter table if exists public.adhdice_health_profiles
  add column if not exists water_goal_ml numeric null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'adhdice_health_profiles_water_goal_ml_positive_check'
      and conrelid = 'public.adhdice_health_profiles'::regclass
  ) then
    alter table public.adhdice_health_profiles
      add constraint adhdice_health_profiles_water_goal_ml_positive_check
      check (water_goal_ml is null or water_goal_ml > 0);
  end if;
end
$$;

do $$
declare
  added_column boolean := false;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'adhdice_health_water_entries'
      and column_name = 'confirmed_at'
  ) then
    alter table public.adhdice_health_water_entries
      add column confirmed_at timestamptz null;
    added_column := true;
  end if;

  if added_column then
    update public.adhdice_health_water_entries
    set confirmed_at = coalesce(logged_at, created_at)
    where confirmed_at is null;
  end if;
end
$$;

alter table if exists public.adhdice_health_water_entries
  alter column confirmed_at set default now();

notify pgrst, 'reload schema';

commit;

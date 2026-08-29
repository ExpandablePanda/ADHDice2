alter table if exists public.adhdice_health_profiles
  add column if not exists add_active_energy_to_calorie_goal boolean default false;

update public.adhdice_health_profiles
set add_active_energy_to_calorie_goal = false
where add_active_energy_to_calorie_goal is null;

alter table public.adhdice_health_profiles
  alter column add_active_energy_to_calorie_goal set default false;

alter table public.adhdice_health_profiles
  alter column add_active_energy_to_calorie_goal set not null;

notify pgrst, 'reload schema';

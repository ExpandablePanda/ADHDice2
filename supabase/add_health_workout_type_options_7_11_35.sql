begin;

alter table if exists public.adhdice_health_profiles
  add column if not exists workout_type_options text[]
    default array['Walking', 'Running', 'Strength Training', 'Cycling', 'Cardio', 'Stretching', 'Sports', 'Standing', 'Other']::text[];

update public.adhdice_health_profiles
set workout_type_options = array['Walking', 'Running', 'Strength Training', 'Cycling', 'Cardio', 'Stretching', 'Sports', 'Standing', 'Other']::text[]
where workout_type_options is null or cardinality(workout_type_options) = 0;

alter table if exists public.adhdice_health_profiles
  alter column workout_type_options set default array['Walking', 'Running', 'Strength Training', 'Cycling', 'Cardio', 'Stretching', 'Sports', 'Standing', 'Other']::text[],
  alter column workout_type_options set not null;

notify pgrst, 'reload schema';

commit;

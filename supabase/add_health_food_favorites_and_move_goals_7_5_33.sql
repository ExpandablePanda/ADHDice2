begin;

alter table public.adhdice_health_food_library
  add column if not exists is_favorite boolean not null default false;

alter table public.adhdice_health_profiles
  add column if not exists movement_goal_calories integer
  check (movement_goal_calories is null or movement_goal_calories >= 0),
  add column if not exists movement_goal_minutes integer
  check (movement_goal_minutes is null or movement_goal_minutes >= 0);

notify pgrst, 'reload schema';

commit;

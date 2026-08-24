begin;

-- The canonical workout remains the session authority.  This owner-scoped
-- unique key enables child relationships without creating another session row.
create unique index if not exists adhdice_health_workouts_user_id_id_idx
  on public.adhdice_health_workouts (user_id, id);

create table if not exists public.adhdice_health_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  default_measurement text not null check (default_measurement in ('reps', 'duration')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.adhdice_health_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null,
  exercise_id uuid not null,
  exercise_name text not null check (char_length(trim(exercise_name)) > 0),
  measurement_type text not null check (measurement_type in ('reps', 'duration')),
  sort_order integer not null default 0 check (sort_order >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, workout_id)
    references public.adhdice_health_workouts (user_id, id)
    on delete cascade,
  foreign key (user_id, exercise_id)
    references public.adhdice_health_exercises (user_id, id)
    on delete restrict
);

create table if not exists public.adhdice_health_workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_exercise_id uuid not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  reps integer,
  duration_seconds integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (
    (reps is not null and reps > 0 and duration_seconds is null)
    or (reps is null and duration_seconds is not null and duration_seconds > 0)
  ),
  foreign key (user_id, workout_exercise_id)
    references public.adhdice_health_workout_exercises (user_id, id)
    on delete cascade
);

create index if not exists adhdice_health_exercises_user_active_name_idx
  on public.adhdice_health_exercises (user_id, archived_at, name);
create index if not exists adhdice_health_workout_exercises_user_workout_order_idx
  on public.adhdice_health_workout_exercises (user_id, workout_id, sort_order, created_at);
create index if not exists adhdice_health_workout_sets_user_exercise_order_idx
  on public.adhdice_health_workout_sets (user_id, workout_exercise_id, sort_order, created_at);

alter table public.adhdice_health_exercises enable row level security;
alter table public.adhdice_health_workout_exercises enable row level security;
alter table public.adhdice_health_workout_sets enable row level security;

revoke all on table public.adhdice_health_exercises from anon;
revoke all on table public.adhdice_health_workout_exercises from anon;
revoke all on table public.adhdice_health_workout_sets from anon;
grant select, insert, update, delete on table public.adhdice_health_exercises to authenticated;
grant select, insert, update, delete on table public.adhdice_health_workout_exercises to authenticated;
grant select, insert, update, delete on table public.adhdice_health_workout_sets to authenticated;

drop policy if exists "Users can manage their own health exercises"
  on public.adhdice_health_exercises;
create policy "Users can manage their own health exercises"
  on public.adhdice_health_exercises
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own health workout exercises"
  on public.adhdice_health_workout_exercises;
create policy "Users can manage their own health workout exercises"
  on public.adhdice_health_workout_exercises
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own health workout sets"
  on public.adhdice_health_workout_sets;
create policy "Users can manage their own health workout sets"
  on public.adhdice_health_workout_sets
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists adhdice_health_exercises_set_updated_at
  on public.adhdice_health_exercises;
create trigger adhdice_health_exercises_set_updated_at
  before update on public.adhdice_health_exercises
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_workout_exercises_set_updated_at
  on public.adhdice_health_workout_exercises;
create trigger adhdice_health_workout_exercises_set_updated_at
  before update on public.adhdice_health_workout_exercises
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_workout_sets_set_updated_at
  on public.adhdice_health_workout_sets;
create trigger adhdice_health_workout_sets_set_updated_at
  before update on public.adhdice_health_workout_sets
  for each row
  execute function public.adhdice_clean_set_updated_at();

notify pgrst, 'reload schema';

commit;

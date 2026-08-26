begin;

create table if not exists public.adhdice_health_fitness_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null,
  metric text not null check (metric in ('single_set_reps', 'session_total_reps', 'longest_set_duration', 'session_total_duration')),
  title text not null check (char_length(trim(title)) > 0),
  target integer not null check (target > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, exercise_id)
    references public.adhdice_health_exercises (user_id, id)
    on delete restrict
);

create table if not exists public.adhdice_health_fitness_goal_levels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  label text not null check (char_length(trim(label)) > 0),
  target integer not null check (target > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, goal_id, target),
  foreign key (user_id, goal_id)
    references public.adhdice_health_fitness_goals (user_id, id)
    on delete cascade
);

create index if not exists adhdice_health_fitness_goals_user_active_created_idx
  on public.adhdice_health_fitness_goals (user_id, archived_at, created_at);
create index if not exists adhdice_health_fitness_goals_user_exercise_idx
  on public.adhdice_health_fitness_goals (user_id, exercise_id);
create index if not exists adhdice_health_fitness_goal_levels_user_goal_order_idx
  on public.adhdice_health_fitness_goal_levels (user_id, goal_id, sort_order, created_at);

alter table public.adhdice_health_fitness_goals enable row level security;
alter table public.adhdice_health_fitness_goal_levels enable row level security;

revoke all on table public.adhdice_health_fitness_goals from anon;
revoke all on table public.adhdice_health_fitness_goals from authenticated;
revoke all on table public.adhdice_health_fitness_goal_levels from anon;
revoke all on table public.adhdice_health_fitness_goal_levels from authenticated;
grant select, insert, update, delete on table public.adhdice_health_fitness_goals to authenticated;
grant select, insert, update, delete on table public.adhdice_health_fitness_goal_levels to authenticated;

drop policy if exists "Users can manage their own health fitness goals"
  on public.adhdice_health_fitness_goals;
create policy "Users can manage their own health fitness goals"
  on public.adhdice_health_fitness_goals
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own health fitness goal levels"
  on public.adhdice_health_fitness_goal_levels;
create policy "Users can manage their own health fitness goal levels"
  on public.adhdice_health_fitness_goal_levels
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists adhdice_health_fitness_goals_set_updated_at
  on public.adhdice_health_fitness_goals;
create trigger adhdice_health_fitness_goals_set_updated_at
  before update on public.adhdice_health_fitness_goals
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_fitness_goal_levels_set_updated_at
  on public.adhdice_health_fitness_goal_levels;
create trigger adhdice_health_fitness_goal_levels_set_updated_at
  before update on public.adhdice_health_fitness_goal_levels
  for each row
  execute function public.adhdice_clean_set_updated_at();

notify pgrst, 'reload schema';

commit;

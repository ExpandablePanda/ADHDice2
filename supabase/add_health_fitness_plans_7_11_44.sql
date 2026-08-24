begin;

-- The composite keys below make ownership part of every relationship.  The
-- existing workout primary key remains authoritative; this unique index only
-- enables an owner-scoped foreign key from the link table.
create unique index if not exists adhdice_health_workouts_user_id_id_idx
  on public.adhdice_health_workouts (user_id, id);

create table if not exists public.adhdice_health_fitness_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  starts_on date not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.adhdice_health_fitness_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  workout_type text not null check (char_length(trim(workout_type)) > 0),
  title text,
  expected_duration_seconds integer check (expected_duration_seconds is null or expected_duration_seconds > 0),
  notes text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, plan_id)
    references public.adhdice_health_fitness_plans (user_id, id)
    on delete restrict
);

create table if not exists public.adhdice_health_workout_plan_item_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null,
  plan_item_id uuid not null,
  created_at timestamptz not null default now(),
  unique (workout_id, plan_item_id),
  foreign key (user_id, workout_id)
    references public.adhdice_health_workouts (user_id, id)
    on delete cascade,
  foreign key (user_id, plan_item_id)
    references public.adhdice_health_fitness_plan_items (user_id, id)
    on delete restrict
);

create index if not exists adhdice_health_fitness_plans_user_active_idx
  on public.adhdice_health_fitness_plans (user_id, archived_at, starts_on);

create index if not exists adhdice_health_fitness_plan_items_user_schedule_idx
  on public.adhdice_health_fitness_plan_items (user_id, plan_id, archived_at, day_of_week, sort_order);

create index if not exists adhdice_health_workout_plan_item_links_user_workout_idx
  on public.adhdice_health_workout_plan_item_links (user_id, workout_id);

create index if not exists adhdice_health_workout_plan_item_links_user_plan_item_idx
  on public.adhdice_health_workout_plan_item_links (user_id, plan_item_id);

alter table public.adhdice_health_fitness_plans enable row level security;
alter table public.adhdice_health_fitness_plan_items enable row level security;
alter table public.adhdice_health_workout_plan_item_links enable row level security;

revoke all on table public.adhdice_health_fitness_plans from anon;
revoke all on table public.adhdice_health_fitness_plan_items from anon;
revoke all on table public.adhdice_health_workout_plan_item_links from anon;
grant select, insert, update, delete on table public.adhdice_health_fitness_plans to authenticated;
grant select, insert, update, delete on table public.adhdice_health_fitness_plan_items to authenticated;
grant select, insert, update, delete on table public.adhdice_health_workout_plan_item_links to authenticated;

drop policy if exists "Users can manage their own health fitness plans"
  on public.adhdice_health_fitness_plans;
create policy "Users can manage their own health fitness plans"
  on public.adhdice_health_fitness_plans
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own health fitness plan items"
  on public.adhdice_health_fitness_plan_items;
create policy "Users can manage their own health fitness plan items"
  on public.adhdice_health_fitness_plan_items
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own health workout plan item links"
  on public.adhdice_health_workout_plan_item_links;
create policy "Users can manage their own health workout plan item links"
  on public.adhdice_health_workout_plan_item_links
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists adhdice_health_fitness_plans_set_updated_at
  on public.adhdice_health_fitness_plans;
create trigger adhdice_health_fitness_plans_set_updated_at
  before update on public.adhdice_health_fitness_plans
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_fitness_plan_items_set_updated_at
  on public.adhdice_health_fitness_plan_items;
create trigger adhdice_health_fitness_plan_items_set_updated_at
  before update on public.adhdice_health_fitness_plan_items
  for each row
  execute function public.adhdice_clean_set_updated_at();

notify pgrst, 'reload schema';

commit;

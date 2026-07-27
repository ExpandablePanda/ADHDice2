begin;

create table if not exists public.adhdice_health_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  notes text not null default '',
  servings numeric(7,2) not null default 1 check (servings > 0),
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adhdice_health_saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  default_meal_slot text not null default 'breakfast'
    check (default_meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adhdice_health_water_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  logged_at timestamptz not null default now(),
  amount numeric(8,2) not null check (amount > 0),
  unit text not null check (unit in ('cup', 'fl_oz')),
  amount_ml numeric(10,2) not null check (amount_ml > 0),
  created_at timestamptz not null default now()
);

create index if not exists adhdice_health_recipes_user_updated_idx
  on public.adhdice_health_recipes (user_id, updated_at desc);
create index if not exists adhdice_health_saved_meals_user_updated_idx
  on public.adhdice_health_saved_meals (user_id, updated_at desc);
create index if not exists adhdice_health_water_entries_user_date_idx
  on public.adhdice_health_water_entries (user_id, entry_date desc, logged_at desc);

alter table public.adhdice_health_recipes enable row level security;
alter table public.adhdice_health_saved_meals enable row level security;
alter table public.adhdice_health_water_entries enable row level security;

drop policy if exists "Users can manage their own health recipes" on public.adhdice_health_recipes;
create policy "Users can manage their own health recipes"
  on public.adhdice_health_recipes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own health saved meals" on public.adhdice_health_saved_meals;
create policy "Users can manage their own health saved meals"
  on public.adhdice_health_saved_meals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own health water entries" on public.adhdice_health_water_entries;
create policy "Users can manage their own health water entries"
  on public.adhdice_health_water_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists adhdice_health_recipes_set_updated_at on public.adhdice_health_recipes;
create trigger adhdice_health_recipes_set_updated_at
  before update on public.adhdice_health_recipes
  for each row execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_saved_meals_set_updated_at on public.adhdice_health_saved_meals;
create trigger adhdice_health_saved_meals_set_updated_at
  before update on public.adhdice_health_saved_meals
  for each row execute function public.adhdice_clean_set_updated_at();

-- The Health hook loads and mutates these tables directly and does not subscribe
-- to realtime changes. Avoid publication changes inside a DO function, which can
-- roll back the whole migration on hosted PostgreSQL.
notify pgrst, 'reload schema';

commit;

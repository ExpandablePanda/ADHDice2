create table if not exists public.adhdice_health_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_weight_unit text not null default 'lb' check (preferred_weight_unit in ('lb', 'kg')),
  calorie_goal integer check (calorie_goal is null or calorie_goal >= 0),
  protein_goal_grams integer check (protein_goal_grams is null or protein_goal_grams >= 0),
  carbs_goal_grams integer check (carbs_goal_grams is null or carbs_goal_grams >= 0),
  fat_goal_grams integer check (fat_goal_grams is null or fat_goal_grams >= 0),
  movement_goal integer check (movement_goal is null or movement_goal >= 0),
  movement_goal_calories integer check (movement_goal_calories is null or movement_goal_calories >= 0),
  movement_goal_minutes integer check (movement_goal_minutes is null or movement_goal_minutes >= 0),
  sleep_goal_minutes integer check (sleep_goal_minutes is null or sleep_goal_minutes >= 0),
  target_weight_kg numeric(7,2) check (target_weight_kg is null or target_weight_kg > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adhdice_health_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  mood_score integer check (mood_score is null or (mood_score >= 1 and mood_score <= 5)),
  energy_score integer check (energy_score is null or (energy_score >= 1 and energy_score <= 5)),
  symptom_tags text[] not null default '{}',
  reflection text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create table if not exists public.adhdice_health_food_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_name text not null check (char_length(trim(food_name)) > 0),
  brand_name text,
  serving_label text,
  calories integer not null default 0 check (calories >= 0),
  protein_g numeric(7,2) check (protein_g is null or protein_g >= 0),
  carbs_g numeric(7,2) check (carbs_g is null or carbs_g >= 0),
  fat_g numeric(7,2) check (fat_g is null or fat_g >= 0),
  barcode text,
  provider text not null default 'manual',
  provider_item_id text,
  attribution text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adhdice_health_meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  logged_at timestamptz not null default now(),
  food_name text not null check (char_length(trim(food_name)) > 0),
  brand_name text,
  serving_label text,
  calories integer not null default 0 check (calories >= 0),
  protein_g numeric(7,2) check (protein_g is null or protein_g >= 0),
  carbs_g numeric(7,2) check (carbs_g is null or carbs_g >= 0),
  fat_g numeric(7,2) check (fat_g is null or fat_g >= 0),
  barcode text,
  provider text not null default 'manual',
  provider_item_id text,
  attribution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adhdice_health_weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  logged_at timestamptz not null default now(),
  weight_kg numeric(7,2) not null check (weight_kg > 0),
  source text not null default 'manual' check (source in ('manual', 'apple_health_import')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adhdice_health_metric_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_type text not null check (metric_type in ('steps', 'active_energy_kcal', 'exercise_minutes', 'sleep_minutes', 'body_mass_kg')),
  metric_date date not null,
  metric_value numeric(10,2) not null check (metric_value >= 0),
  source text not null default 'apple_health_import' check (source in ('apple_health_import', 'manual')),
  source_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_fingerprint)
);

create table if not exists public.adhdice_health_import_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  imported_count integer not null default 0 check (imported_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  import_start_date date,
  import_end_date date,
  summary_text text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.adhdice_health_achievement_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_code text not null check (achievement_code in ('first_check_in', 'seven_gentle_days', 'nourishment_notes', 'scale_awareness', 'connected_care', 'rest_noticed', 'motion_noticed', 'care_week', 'care_month')),
  title text not null,
  description text not null,
  awarded_points integer not null default 0 check (awarded_points >= 0),
  awarded_xp integer not null default 0 check (awarded_xp >= 0),
  awarded_tokens integer not null default 0 check (awarded_tokens >= 0),
  earned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, achievement_code)
);

create index if not exists adhdice_health_checkins_user_date_idx
  on public.adhdice_health_checkins (user_id, entry_date desc, updated_at desc);
create index if not exists adhdice_health_food_library_user_updated_idx
  on public.adhdice_health_food_library (user_id, updated_at desc, created_at desc);
create index if not exists adhdice_health_meal_entries_user_date_idx
  on public.adhdice_health_meal_entries (user_id, entry_date desc, logged_at desc);
create index if not exists adhdice_health_weight_entries_user_date_idx
  on public.adhdice_health_weight_entries (user_id, entry_date desc, logged_at desc);
create index if not exists adhdice_health_metric_entries_user_date_idx
  on public.adhdice_health_metric_entries (user_id, metric_date desc, metric_type);
create index if not exists adhdice_health_import_audits_user_started_idx
  on public.adhdice_health_import_audits (user_id, started_at desc);
create index if not exists adhdice_health_achievement_awards_user_earned_idx
  on public.adhdice_health_achievement_awards (user_id, earned_at desc);

alter table public.adhdice_health_profiles enable row level security;
alter table public.adhdice_health_checkins enable row level security;
alter table public.adhdice_health_food_library enable row level security;
alter table public.adhdice_health_meal_entries enable row level security;
alter table public.adhdice_health_weight_entries enable row level security;
alter table public.adhdice_health_metric_entries enable row level security;
alter table public.adhdice_health_import_audits enable row level security;
alter table public.adhdice_health_achievement_awards enable row level security;

drop policy if exists "Users can read their own health profiles"
  on public.adhdice_health_profiles;
create policy "Users can read their own health profiles"
  on public.adhdice_health_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own health profiles"
  on public.adhdice_health_profiles;
create policy "Users can create their own health profiles"
  on public.adhdice_health_profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own health profiles"
  on public.adhdice_health_profiles;
create policy "Users can update their own health profiles"
  on public.adhdice_health_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own health profiles"
  on public.adhdice_health_profiles;
create policy "Users can delete their own health profiles"
  on public.adhdice_health_profiles
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can manage their own health check-ins"
  on public.adhdice_health_checkins;
create policy "Users can manage their own health check-ins"
  on public.adhdice_health_checkins
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own health food library"
  on public.adhdice_health_food_library;
create policy "Users can manage their own health food library"
  on public.adhdice_health_food_library
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own health meal entries"
  on public.adhdice_health_meal_entries;
create policy "Users can manage their own health meal entries"
  on public.adhdice_health_meal_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own health weight entries"
  on public.adhdice_health_weight_entries;
create policy "Users can manage their own health weight entries"
  on public.adhdice_health_weight_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own health metric entries"
  on public.adhdice_health_metric_entries;
create policy "Users can manage their own health metric entries"
  on public.adhdice_health_metric_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own health import audits"
  on public.adhdice_health_import_audits;
create policy "Users can manage their own health import audits"
  on public.adhdice_health_import_audits
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own health achievement awards"
  on public.adhdice_health_achievement_awards;
create policy "Users can manage their own health achievement awards"
  on public.adhdice_health_achievement_awards
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.adhdice_clean_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists adhdice_health_profiles_set_updated_at
  on public.adhdice_health_profiles;
create trigger adhdice_health_profiles_set_updated_at
  before update on public.adhdice_health_profiles
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_checkins_set_updated_at
  on public.adhdice_health_checkins;
create trigger adhdice_health_checkins_set_updated_at
  before update on public.adhdice_health_checkins
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_food_library_set_updated_at
  on public.adhdice_health_food_library;
create trigger adhdice_health_food_library_set_updated_at
  before update on public.adhdice_health_food_library
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_meal_entries_set_updated_at
  on public.adhdice_health_meal_entries;
create trigger adhdice_health_meal_entries_set_updated_at
  before update on public.adhdice_health_meal_entries
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_weight_entries_set_updated_at
  on public.adhdice_health_weight_entries;
create trigger adhdice_health_weight_entries_set_updated_at
  before update on public.adhdice_health_weight_entries
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_metric_entries_set_updated_at
  on public.adhdice_health_metric_entries;
create trigger adhdice_health_metric_entries_set_updated_at
  before update on public.adhdice_health_metric_entries
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_health_profiles;
alter publication supabase_realtime add table public.adhdice_health_checkins;
alter publication supabase_realtime add table public.adhdice_health_food_library;
alter publication supabase_realtime add table public.adhdice_health_meal_entries;
alter publication supabase_realtime add table public.adhdice_health_weight_entries;
alter publication supabase_realtime add table public.adhdice_health_metric_entries;
alter publication supabase_realtime add table public.adhdice_health_import_audits;
alter publication supabase_realtime add table public.adhdice_health_achievement_awards;

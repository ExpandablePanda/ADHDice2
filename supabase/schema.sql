create extension if not exists pgcrypto;

create type public.adhdice_clean_task_status as enum ('pending', 'in_progress', 'done', 'missed', 'did_my_best', 'upcoming', 'not_due', 'delayed', 'archived', 'trashed', 'complete');
create type public.adhdice_clean_task_priority as enum ('low', 'normal', 'high');
create type public.adhdice_clean_task_energy as enum ('none', 'low', 'medium', 'high');
create type public.adhdice_clean_task_repeat_frequency as enum ('none', 'daily', 'weekly', 'monthly', 'custom', 'daily_until_complete');
create type public.adhdice_clean_task_repeat_monthly_mode as enum ('day_of_month', 'ordinal_weekday');
create type public.adhdice_clean_task_repeat_monthly_ordinal as enum ('first', 'second', 'third', 'fourth', 'last');
create type public.adhdice_clean_task_subtask_status as enum ('pending', 'in_progress', 'done', 'missed', 'did_my_best', 'upcoming', 'not_due');
create type public.adhdice_clean_focus_source as enum ('timer', 'manual', 'import');

create table public.adhdice_clean_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_task_id uuid references public.adhdice_clean_tasks(id) on delete cascade,
  revision integer not null default 1,
  title text not null check (char_length(trim(title)) > 0),
  notes text,
  status public.adhdice_clean_task_status not null default 'pending',
  priority public.adhdice_clean_task_priority not null default 'normal',
  priority_level integer not null default 0 check (priority_level between 0 and 5),
  energy public.adhdice_clean_task_energy not null default 'none',
  is_urgent boolean not null default false,
  is_important boolean not null default false,
  due_on date,
  active_status_logical_date date,
  active_occurrence_due_on date,
  scheduled_on date,
  due_time time,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  actual_seconds integer not null default 0 check (actual_seconds >= 0),
  tags text[] not null default '{}',
  external_link_label text,
  external_link_url text,
  one_step_at_a_time boolean not null default false,
  subtasks_auto_reset boolean not null default false,
  repeat_frequency public.adhdice_clean_task_repeat_frequency not null default 'none',
  repeat_interval integer not null default 1 check (repeat_interval > 0),
  repeat_days_of_week smallint[] not null default '{}',
  repeat_day_of_month integer check (repeat_day_of_month is null or (repeat_day_of_month >= 1 and repeat_day_of_month <= 31)),
  repeat_monthly_mode public.adhdice_clean_task_repeat_monthly_mode not null default 'day_of_month',
  repeat_monthly_ordinal public.adhdice_clean_task_repeat_monthly_ordinal,
  repeat_monthly_weekday smallint check (repeat_monthly_weekday is null or (repeat_monthly_weekday >= 0 and repeat_monthly_weekday <= 6)),
  pinned_at timestamptz,
  pin_order integer,
  sort_order bigint not null default 0,
  completed_at timestamptz,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_clean_tasks_repeat_monthly_ordinal_fields_check
    check (
      (repeat_monthly_mode = 'day_of_month' and repeat_monthly_ordinal is null and repeat_monthly_weekday is null)
      or (repeat_monthly_mode = 'ordinal_weekday' and repeat_monthly_ordinal is not null and repeat_monthly_weekday is not null)
    ),
  constraint adhdice_clean_tasks_parent_task_not_self
    check (parent_task_id is null or parent_task_id <> id)
);

create table public.adhdice_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_src text,
  logo_src text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.adhdice_focus_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  focus_type text not null check (char_length(trim(focus_type)) > 0),
  focus_subtype text,
  focus_subtype_2 text,
  color text not null check (char_length(trim(color)) > 0),
  icon text not null check (char_length(trim(icon)) > 0),
  daily_goal_seconds integer check (daily_goal_seconds is null or daily_goal_seconds >= 0),
  weekly_goal_seconds integer check (weekly_goal_seconds is null or weekly_goal_seconds >= 0),
  priority_level smallint not null default 3 check (priority_level between 1 and 5),
  target_distribution_mode text not null default 'auto' check (target_distribution_mode in ('auto', 'manual')),
  weekday_target_seconds jsonb not null default '{}'::jsonb,
  count_toward_productive_goal boolean,
  allow_daily_surplus_reduction boolean,
  weekly_surplus_carryover_mode text not null default 'off' check (weekly_surplus_carryover_mode in ('off', 'cap25', 'cap50', 'full')),
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.adhdice_focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.adhdice_focus_categories(id) on delete set null,
  title_snapshot text not null check (char_length(trim(title_snapshot)) > 0),
  focus_type_snapshot text not null check (char_length(trim(focus_type_snapshot)) > 0),
  focus_subtype_snapshot text,
  focus_subtype_2_snapshot text,
  session_date date not null,
  duration_seconds integer not null check (duration_seconds > 0),
  notes text,
  started_at timestamptz,
  ended_at timestamptz,
  source public.adhdice_clean_focus_source not null default 'timer',
  created_at timestamptz not null default now()
);

create table public.adhdice_focus_active_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.adhdice_focus_categories(id) on delete cascade,
  start_time timestamptz,
  accumulated_seconds integer not null default 0 check (accumulated_seconds >= 0),
  is_running boolean not null default false,
  occurrence_key text,
  occurrence_due_on date,
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

create table public.adhdice_focus_daily_goal_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  adjustment_date date not null,
  source_category_id uuid not null references public.adhdice_focus_categories(id) on delete cascade,
  target_category_id uuid not null references public.adhdice_focus_categories(id) on delete cascade,
  source_session_id uuid references public.adhdice_focus_sessions(id) on delete set null,
  reduction_seconds integer not null check (reduction_seconds > 0),
  reason text not null default 'daily_surplus_reallocation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_category_id <> target_category_id)
);

create table public.adhdice_task_active_timers (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  title_snapshot text not null check (char_length(trim(title_snapshot)) > 0),
  start_time timestamptz,
  accumulated_seconds integer not null default 0 check (accumulated_seconds >= 0),
  started_actual_seconds integer not null default 0 check (started_actual_seconds >= 0),
  is_running boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

create table public.adhdice_task_focus_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  focus_date date not null,
  task_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, focus_date)
);

create table public.adhdice_task_lists (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  built_in_key text,
  name text not null check (char_length(trim(name)) > 0),
  list_type text not null default 'custom' check (list_type in ('system', 'smart', 'custom')),
  membership_mode text not null default 'manual' check (membership_mode in ('manual', 'rules', 'hybrid')),
  is_deletable boolean not null default true,
  is_editable boolean not null default true,
  is_visible boolean not null default true,
  sort_order bigint not null default 0,
  rules_json text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.adhdice_task_list_manual_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  list_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, task_id, list_id)
);

create table public.adhdice_task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  occurrence_key text,
  occurrence_due_on date,
  status public.adhdice_clean_task_status not null,
  was_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, task_id, entry_date)
);

create table public.adhdice_task_actual_time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  title_snapshot text not null check (char_length(trim(title_snapshot)) > 0),
  duration_seconds integer not null check (duration_seconds > 0),
  notes text,
  occurrence_key text,
  occurrence_due_on date,
  source text not null default 'legacy' check (source in ('task_timer', 'manual', 'import', 'legacy')),
  estimate_eligible boolean not null default false,
  exclusion_reason text,
  completion_history_id uuid references public.adhdice_task_history(id) on delete set null,
  completion_completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.adhdice_task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  status public.adhdice_clean_task_subtask_status not null default 'pending',
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.adhdice_legacy_subtask_promotions (
  legacy_subtask_id uuid primary key references public.adhdice_task_subtasks(id) on delete cascade,
  task_id uuid not null unique references public.adhdice_clean_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.adhdice_task_grid_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  layout_json text not null default '[]',
  updated_at timestamptz not null default now()
);

create table public.adhdice_on_time_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_state jsonb not null default '{"schemaVersion":1,"destinationLabel":"","arriveAt":null,"timezone":"UTC","travelMinutes":null,"arrivalBufferMinutes":0,"items":[],"clientUpdatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb,
  client_updated_at timestamptz not null default '1970-01-01T00:00:00Z'::timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_on_time_plans_plan_state_object check (jsonb_typeof(plan_state) = 'object')
);

create table public.adhdice_brainstorm_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source_markdown text not null default '',
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  constraint adhdice_brainstorm_state_answers_object check (jsonb_typeof(answers) = 'object')
);

create table public.adhdice_health_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_weight_unit text not null default 'lb' check (preferred_weight_unit in ('lb', 'kg')),
  calorie_goal integer check (calorie_goal is null or calorie_goal >= 0),
  protein_goal_grams integer check (protein_goal_grams is null or protein_goal_grams >= 0),
  carbs_goal_grams integer check (carbs_goal_grams is null or carbs_goal_grams >= 0),
  fat_goal_grams integer check (fat_goal_grams is null or fat_goal_grams >= 0),
  movement_goal integer check (movement_goal is null or movement_goal >= 0),
  sleep_goal_minutes integer check (sleep_goal_minutes is null or sleep_goal_minutes >= 0),
  target_weight_kg numeric(7,2) check (target_weight_kg is null or target_weight_kg > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.adhdice_health_checkins (
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

create table public.adhdice_health_food_library (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.adhdice_health_meal_entries (
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

create table public.adhdice_health_weight_entries (
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

create table public.adhdice_health_metric_entries (
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

create table public.adhdice_health_import_audits (
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

create table public.adhdice_health_achievement_awards (
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

create index adhdice_clean_tasks_user_status_sort_idx
  on public.adhdice_clean_tasks (user_id, status, sort_order, created_at desc);
create index adhdice_clean_tasks_user_due_idx
  on public.adhdice_clean_tasks (user_id, due_on, due_time);
create index adhdice_clean_tasks_parent_task_idx
  on public.adhdice_clean_tasks (parent_task_id);
create index adhdice_clean_tasks_user_pinned_idx
  on public.adhdice_clean_tasks (user_id, pinned_at desc nulls last, pin_order asc nulls last);
create index adhdice_user_profiles_updated_at_idx
  on public.adhdice_user_profiles (updated_at desc);
create index adhdice_focus_categories_user_sort_idx
  on public.adhdice_focus_categories (user_id, sort_order, created_at desc);
create index adhdice_focus_sessions_user_date_idx
  on public.adhdice_focus_sessions (user_id, session_date desc, created_at desc);
create index adhdice_focus_active_sessions_user_updated_idx
  on public.adhdice_focus_active_sessions (user_id, updated_at desc);
create index adhdice_focus_daily_goal_adjustments_user_date_idx
  on public.adhdice_focus_daily_goal_adjustments (user_id, adjustment_date desc, created_at desc);
create index adhdice_focus_daily_goal_adjustments_target_idx
  on public.adhdice_focus_daily_goal_adjustments (user_id, target_category_id, adjustment_date desc);
create index adhdice_task_active_timers_user_created_idx
  on public.adhdice_task_active_timers (user_id, created_at asc, updated_at desc);
create index adhdice_task_focus_days_user_date_idx
  on public.adhdice_task_focus_days (user_id, focus_date desc);
create index adhdice_task_lists_user_sort_idx
  on public.adhdice_task_lists (user_id, sort_order, created_at);
create index adhdice_task_list_manual_memberships_user_task_idx
  on public.adhdice_task_list_manual_memberships (user_id, task_id, list_id);
create index adhdice_task_history_user_date_idx
  on public.adhdice_task_history (user_id, entry_date desc, created_at desc);
create index adhdice_task_actual_time_entries_user_task_date_idx
  on public.adhdice_task_actual_time_entries (user_id, task_id, entry_date desc, created_at desc);
create index adhdice_task_actual_time_entries_learning_idx
  on public.adhdice_task_actual_time_entries (user_id, task_id, occurrence_key)
  where estimate_eligible and exclusion_reason is null and completion_history_id is not null;
create index adhdice_task_subtasks_task_sort_idx
  on public.adhdice_task_subtasks (task_id, sort_order, created_at asc);
create index adhdice_legacy_subtask_promotions_user_idx
  on public.adhdice_legacy_subtask_promotions (user_id, created_at desc);
create index adhdice_task_grid_layouts_updated_at_idx
  on public.adhdice_task_grid_layouts (updated_at desc);
create index adhdice_health_checkins_user_date_idx
  on public.adhdice_health_checkins (user_id, entry_date desc, updated_at desc);
create index adhdice_health_food_library_user_updated_idx
  on public.adhdice_health_food_library (user_id, updated_at desc, created_at desc);
create index adhdice_health_meal_entries_user_date_idx
  on public.adhdice_health_meal_entries (user_id, entry_date desc, logged_at desc);
create index adhdice_health_weight_entries_user_date_idx
  on public.adhdice_health_weight_entries (user_id, entry_date desc, logged_at desc);
create index adhdice_health_metric_entries_user_date_idx
  on public.adhdice_health_metric_entries (user_id, metric_date desc, metric_type);
create index adhdice_health_import_audits_user_started_idx
  on public.adhdice_health_import_audits (user_id, started_at desc);
create index adhdice_health_achievement_awards_user_earned_idx
  on public.adhdice_health_achievement_awards (user_id, earned_at desc);

alter table public.adhdice_clean_tasks enable row level security;
alter table public.adhdice_user_profiles enable row level security;
alter table public.adhdice_focus_categories enable row level security;
alter table public.adhdice_focus_sessions enable row level security;
alter table public.adhdice_focus_active_sessions enable row level security;
alter table public.adhdice_focus_daily_goal_adjustments enable row level security;
alter table public.adhdice_task_active_timers enable row level security;
alter table public.adhdice_task_focus_days enable row level security;
alter table public.adhdice_task_lists enable row level security;
alter table public.adhdice_task_list_manual_memberships enable row level security;
alter table public.adhdice_task_history enable row level security;
alter table public.adhdice_task_actual_time_entries enable row level security;
alter table public.adhdice_task_subtasks enable row level security;
alter table public.adhdice_legacy_subtask_promotions enable row level security;
alter table public.adhdice_task_grid_layouts enable row level security;
alter table public.adhdice_on_time_plans enable row level security;
alter table public.adhdice_brainstorm_state enable row level security;
alter table public.adhdice_health_profiles enable row level security;
alter table public.adhdice_health_checkins enable row level security;
alter table public.adhdice_health_food_library enable row level security;
alter table public.adhdice_health_meal_entries enable row level security;
alter table public.adhdice_health_weight_entries enable row level security;
alter table public.adhdice_health_metric_entries enable row level security;
alter table public.adhdice_health_import_audits enable row level security;
alter table public.adhdice_health_achievement_awards enable row level security;

create policy "Users can read their own clean tasks"
  on public.adhdice_clean_tasks
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own clean tasks"
  on public.adhdice_clean_tasks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own clean tasks"
  on public.adhdice_clean_tasks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own clean tasks"
  on public.adhdice_clean_tasks
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own profiles"
  on public.adhdice_user_profiles
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own profiles"
  on public.adhdice_user_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profiles"
  on public.adhdice_user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read their own focus categories"
  on public.adhdice_focus_categories
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own focus categories"
  on public.adhdice_focus_categories
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own focus categories"
  on public.adhdice_focus_categories
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own focus categories"
  on public.adhdice_focus_categories
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own focus sessions"
  on public.adhdice_focus_sessions
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own focus sessions"
  on public.adhdice_focus_sessions
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own focus sessions"
  on public.adhdice_focus_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own focus sessions"
  on public.adhdice_focus_sessions
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own active focus sessions"
  on public.adhdice_focus_active_sessions
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own active focus sessions"
  on public.adhdice_focus_active_sessions
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own active focus sessions"
  on public.adhdice_focus_active_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own active focus sessions"
  on public.adhdice_focus_active_sessions
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own active task timers"
  on public.adhdice_task_active_timers
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own active task timers"
  on public.adhdice_task_active_timers
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own active task timers"
  on public.adhdice_task_active_timers
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own active task timers"
  on public.adhdice_task_active_timers
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own task focus days"
  on public.adhdice_task_focus_days
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own task focus days"
  on public.adhdice_task_focus_days
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task focus days"
  on public.adhdice_task_focus_days
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own task focus days"
  on public.adhdice_task_focus_days
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own task lists"
  on public.adhdice_task_lists
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own task lists"
  on public.adhdice_task_lists
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task lists"
  on public.adhdice_task_lists
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own task lists"
  on public.adhdice_task_lists
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own task list memberships"
  on public.adhdice_task_list_manual_memberships
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own task list memberships"
  on public.adhdice_task_list_manual_memberships
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task list memberships"
  on public.adhdice_task_list_manual_memberships
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own task list memberships"
  on public.adhdice_task_list_manual_memberships
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own task history"
  on public.adhdice_task_history
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own task history"
  on public.adhdice_task_history
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task history"
  on public.adhdice_task_history
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own task history"
  on public.adhdice_task_history
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own task actual time entries"
  on public.adhdice_task_actual_time_entries
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own task actual time entries"
  on public.adhdice_task_actual_time_entries
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task actual time entries"
  on public.adhdice_task_actual_time_entries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own task actual time entries"
  on public.adhdice_task_actual_time_entries
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own task subtasks"
  on public.adhdice_task_subtasks
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own task subtasks"
  on public.adhdice_task_subtasks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task subtasks"
  on public.adhdice_task_subtasks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own task subtasks"
  on public.adhdice_task_subtasks
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own legacy subtask promotions"
  on public.adhdice_legacy_subtask_promotions
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own legacy subtask promotions"
  on public.adhdice_legacy_subtask_promotions
  for insert
  with check (
    auth.uid() = adhdice_legacy_subtask_promotions.user_id
    and exists (
      select 1
      from public.adhdice_task_subtasks legacy_subtask
      where legacy_subtask.id = adhdice_legacy_subtask_promotions.legacy_subtask_id
        and legacy_subtask.user_id = auth.uid()
        and legacy_subtask.user_id = adhdice_legacy_subtask_promotions.user_id
    )
    and exists (
      select 1
      from public.adhdice_clean_tasks promoted_task
      where promoted_task.id = adhdice_legacy_subtask_promotions.task_id
        and promoted_task.user_id = auth.uid()
        and promoted_task.user_id = adhdice_legacy_subtask_promotions.user_id
    )
  );

create policy "Users can read their own task grid layouts"
  on public.adhdice_task_grid_layouts
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own task grid layouts"
  on public.adhdice_task_grid_layouts
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task grid layouts"
  on public.adhdice_task_grid_layouts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own task grid layouts"
  on public.adhdice_task_grid_layouts
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own On-Time plan"
  on public.adhdice_on_time_plans for select using (auth.uid() = user_id);
create policy "Users can create their own On-Time plan"
  on public.adhdice_on_time_plans for insert with check (auth.uid() = user_id);
create policy "Users can update their own On-Time plan"
  on public.adhdice_on_time_plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own On-Time plan"
  on public.adhdice_on_time_plans for delete using (auth.uid() = user_id);

create policy "Users can read their own Brainstorm state"
  on public.adhdice_brainstorm_state for select using (auth.uid() = user_id);
create policy "Users can create their own Brainstorm state"
  on public.adhdice_brainstorm_state for insert with check (auth.uid() = user_id);
create policy "Users can update their own Brainstorm state"
  on public.adhdice_brainstorm_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own Brainstorm state"
  on public.adhdice_brainstorm_state for delete using (auth.uid() = user_id);

create policy "Users can read their own health profiles"
  on public.adhdice_health_profiles
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own health profiles"
  on public.adhdice_health_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own health profiles"
  on public.adhdice_health_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own health profiles"
  on public.adhdice_health_profiles
  for delete
  using (auth.uid() = user_id);

create policy "Users can manage their own health check-ins"
  on public.adhdice_health_checkins
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health food library"
  on public.adhdice_health_food_library
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health meal entries"
  on public.adhdice_health_meal_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health weight entries"
  on public.adhdice_health_weight_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health metric entries"
  on public.adhdice_health_metric_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health import audits"
  on public.adhdice_health_import_audits
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

create or replace function public.adhdice_clean_tasks_bump_revision()
returns trigger
language plpgsql
as $$
begin
  if row(new.*) is distinct from row(old.*) then
    new.revision = old.revision + 1;
  end if;
  return new;
end;
$$;

create or replace function public.adhdice_capture_task_history_occurrence()
returns trigger
language plpgsql
as $$
declare
  target_task public.adhdice_clean_tasks%rowtype;
begin
  if new.status in ('done', 'did_my_best')
    and new.was_completed
    and new.occurrence_key is null then
    select * into target_task
      from public.adhdice_clean_tasks
      where id = new.task_id and user_id = new.user_id;

    if found then
      if target_task.repeat_frequency = 'none' then
        new.occurrence_key = 'lifetime:' || new.task_id::text;
        new.occurrence_due_on = null;
      else
        new.occurrence_due_on = coalesce(target_task.active_occurrence_due_on, new.entry_date);
        if new.occurrence_due_on is not null then
          new.occurrence_key = 'occurrence:' || new.occurrence_due_on::text;
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.adhdice_link_task_duration_evidence()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('done', 'did_my_best') and new.was_completed then
    update public.adhdice_task_actual_time_entries as evidence
      set completion_history_id = new.id,
          completion_completed_at = new.updated_at
      where evidence.user_id = new.user_id
        and evidence.task_id = new.task_id
        and evidence.source in ('task_timer', 'manual')
        and evidence.estimate_eligible
        and evidence.exclusion_reason is null
        and evidence.completion_history_id is null
        and (
          (new.occurrence_key is not null and evidence.occurrence_key = new.occurrence_key)
          or (
            new.occurrence_key is null
            and evidence.occurrence_key in ('occurrence:' || new.entry_date::text, 'lifetime:' || new.task_id::text)
          )
        );
  end if;
  return new;
end;
$$;

create or replace function public.adhdice_link_inserted_task_duration_evidence()
returns trigger
language plpgsql
as $$
declare
  matching_completion public.adhdice_task_history%rowtype;
begin
  if new.source in ('task_timer', 'manual')
    and new.estimate_eligible
    and new.exclusion_reason is null
    and new.completion_history_id is null
    and new.occurrence_key is not null then
    select * into matching_completion
      from public.adhdice_task_history as history
      where history.user_id = new.user_id
        and history.task_id = new.task_id
        and history.status in ('done', 'did_my_best')
        and history.was_completed
        and (
          history.occurrence_key = new.occurrence_key
          or (
            history.occurrence_key is null
            and new.occurrence_key in ('occurrence:' || history.entry_date::text, 'lifetime:' || history.task_id::text)
          )
        )
      order by history.updated_at desc
      limit 1;

    if found then
      new.completion_history_id = matching_completion.id;
      new.completion_completed_at = matching_completion.updated_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger adhdice_clean_tasks_bump_revision
  before update on public.adhdice_clean_tasks
  for each row
  execute function public.adhdice_clean_tasks_bump_revision();

create trigger adhdice_clean_tasks_set_updated_at
  before update on public.adhdice_clean_tasks
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_user_profiles_set_updated_at
  before update on public.adhdice_user_profiles
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_focus_categories_set_updated_at
  before update on public.adhdice_focus_categories
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_focus_active_sessions_set_updated_at
  before update on public.adhdice_focus_active_sessions
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_focus_daily_goal_adjustments_set_updated_at
  before update on public.adhdice_focus_daily_goal_adjustments
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_task_active_timers_set_updated_at
  before update on public.adhdice_task_active_timers
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_task_focus_days_set_updated_at
  before update on public.adhdice_task_focus_days
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_task_lists_set_updated_at
  before update on public.adhdice_task_lists
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_task_history_set_updated_at
  before update on public.adhdice_task_history
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_capture_task_history_occurrence
  before insert or update of status, was_completed, occurrence_key, occurrence_due_on on public.adhdice_task_history
  for each row execute function public.adhdice_capture_task_history_occurrence();

create trigger adhdice_link_task_duration_evidence
  after insert or update of status, was_completed, occurrence_key, occurrence_due_on on public.adhdice_task_history
  for each row execute function public.adhdice_link_task_duration_evidence();

create trigger adhdice_link_inserted_task_duration_evidence
  before insert on public.adhdice_task_actual_time_entries
  for each row execute function public.adhdice_link_inserted_task_duration_evidence();

create trigger adhdice_task_subtasks_set_updated_at
  before update on public.adhdice_task_subtasks
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_legacy_subtask_promotions_set_updated_at
  before update on public.adhdice_legacy_subtask_promotions
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_task_grid_layouts_set_updated_at
  before update on public.adhdice_task_grid_layouts
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_on_time_plans_set_updated_at
  before update on public.adhdice_on_time_plans
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_brainstorm_state_set_updated_at
  before update on public.adhdice_brainstorm_state
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_profiles_set_updated_at
  before update on public.adhdice_health_profiles
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_checkins_set_updated_at
  before update on public.adhdice_health_checkins
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_food_library_set_updated_at
  before update on public.adhdice_health_food_library
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_meal_entries_set_updated_at
  before update on public.adhdice_health_meal_entries
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_weight_entries_set_updated_at
  before update on public.adhdice_health_weight_entries
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_metric_entries_set_updated_at
  before update on public.adhdice_health_metric_entries
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_clean_tasks;
alter publication supabase_realtime add table public.adhdice_user_profiles;
alter publication supabase_realtime add table public.adhdice_focus_categories;
alter publication supabase_realtime add table public.adhdice_focus_sessions;
alter publication supabase_realtime add table public.adhdice_focus_active_sessions;
alter publication supabase_realtime add table public.adhdice_focus_daily_goal_adjustments;
alter publication supabase_realtime add table public.adhdice_task_active_timers;
alter publication supabase_realtime add table public.adhdice_task_focus_days;
alter publication supabase_realtime add table public.adhdice_task_lists;
alter publication supabase_realtime add table public.adhdice_task_list_manual_memberships;
alter publication supabase_realtime add table public.adhdice_task_history;
alter publication supabase_realtime add table public.adhdice_task_actual_time_entries;
alter publication supabase_realtime add table public.adhdice_task_subtasks;
alter publication supabase_realtime add table public.adhdice_task_grid_layouts;
alter publication supabase_realtime add table public.adhdice_on_time_plans;
alter publication supabase_realtime add table public.adhdice_brainstorm_state;
alter publication supabase_realtime add table public.adhdice_health_profiles;
alter publication supabase_realtime add table public.adhdice_health_checkins;
alter publication supabase_realtime add table public.adhdice_health_food_library;
alter publication supabase_realtime add table public.adhdice_health_meal_entries;
alter publication supabase_realtime add table public.adhdice_health_weight_entries;
alter publication supabase_realtime add table public.adhdice_health_metric_entries;
alter publication supabase_realtime add table public.adhdice_health_import_audits;
alter publication supabase_realtime add table public.adhdice_health_achievement_awards;

-- Milestones persistence and authoritative setup operations.

create table if not exists public.adhdice_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.adhdice_clean_tasks(id) on delete set null,
  task_title_snapshot text not null check (char_length(trim(task_title_snapshot)) > 0),
  revision bigint not null default 0 check (revision >= 0),
  status text not null check (status in ('active', 'completed', 'abandoned')),
  task_trashed_at timestamptz,
  last_restored_at timestamptz,
  rules_version text not null check (char_length(trim(rules_version)) > 0),
  questions_version text not null check (char_length(trim(questions_version)) > 0),
  answers_snapshot jsonb not null check (jsonb_typeof(answers_snapshot) = 'object'),
  recommendation_snapshot jsonb not null check (jsonb_typeof(recommendation_snapshot) = 'object'),
  recommended_tier text not null check (recommended_tier in ('bronze', 'silver', 'gold', 'platinum')),
  recommended_target_date date not null,
  allowed_target_date_min date not null,
  allowed_target_date_max date not null,
  deadline_kind text not null check (deadline_kind in ('none', 'preferred', 'firm')),
  external_deadline date,
  feasibility_warning text,
  rules_explanation text not null check (char_length(trim(rules_explanation)) > 0),
  initial_locked_tier text not null check (initial_locked_tier in ('bronze', 'silver', 'gold', 'platinum')),
  initial_locked_target_date date not null,
  initial_aura_deadline date not null,
  current_tier text not null check (current_tier in ('bronze', 'silver', 'gold', 'platinum')),
  current_target_date date not null,
  current_aura_deadline date not null,
  tier_raise_explanation text,
  setup_correction_used boolean not null default false,
  setup_corrected_at timestamptz,
  completion_timezone text not null check (char_length(trim(completion_timezone)) > 0),
  completion_timing text check (completion_timing is null or completion_timing in ('on_time', 'grace_period', 'late')),
  completion_date_key date,
  pre_completion_task_snapshot jsonb check (pre_completion_task_snapshot is null or jsonb_typeof(pre_completion_task_snapshot) = 'object'),
  trophy_awarded_at timestamptz,
  trophy_revoked_at timestamptz,
  aura_kind text check (aura_kind is null or aura_kind in ('none', 'standard', 'diamond')),
  aura_awarded_at timestamptz,
  aura_revoked_at timestamptz,
  abandoned_at timestamptz,
  abandonment_reason text,
  promoted_at timestamptz not null default now(),
  locked_at timestamptz not null default now(),
  completed_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_milestones_date_range_check check (
    allowed_target_date_min <= recommended_target_date
    and recommended_target_date <= allowed_target_date_max
    and allowed_target_date_min <= current_target_date
    and current_target_date <= allowed_target_date_max
  ),
  constraint adhdice_milestones_aura_dates_check check (
    initial_aura_deadline = initial_locked_target_date + 3
    and current_aura_deadline = current_target_date + 3
  ),
  constraint adhdice_milestones_deadline_shape_check check (
    (deadline_kind = 'none' and external_deadline is null)
    or (deadline_kind in ('preferred', 'firm') and external_deadline is not null)
  ),
  constraint adhdice_milestones_firm_deadline_check check (
    deadline_kind <> 'firm'
    or (recommended_target_date = external_deadline and current_target_date = external_deadline)
  ),
  constraint adhdice_milestones_tier_raise_explanation_check check (
    case current_tier
      when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 when 'platinum' then 4
    end <= case recommended_tier
      when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 when 'platinum' then 4
    end
    or char_length(trim(coalesce(tier_raise_explanation, ''))) > 0
  ),
  constraint adhdice_milestones_diamond_check check (
    aura_kind <> 'diamond' or current_tier = 'platinum'
  ),
  constraint adhdice_milestones_correction_check check (
    setup_correction_used = (setup_corrected_at is not null)
  ),
  constraint adhdice_milestones_award_shape_check check (
    (trophy_revoked_at is null or trophy_awarded_at is not null)
    and (aura_revoked_at is null or aura_awarded_at is not null)
    and (
      (aura_kind is null and aura_awarded_at is null)
      or (aura_kind = 'none' and aura_awarded_at is null)
      or (aura_kind in ('standard', 'diamond') and aura_awarded_at is not null)
    )
  ),
  constraint adhdice_milestones_lifecycle_check check (
    (
      status = 'active'
      and abandoned_at is null
      and completed_at is null
      and completion_timing is null
      and completion_date_key is null
      and (trophy_awarded_at is null or trophy_revoked_at is not null)
      and (aura_awarded_at is null or aura_revoked_at is not null)
    )
    or (
      status = 'completed'
      and abandoned_at is null
      and completed_at is not null
      and completion_timing is not null
      and completion_date_key is not null
      and pre_completion_task_snapshot is not null
      and trophy_awarded_at is not null
      and trophy_revoked_at is null
      and aura_kind is not null
      and aura_revoked_at is null
    )
    or (
      status = 'abandoned'
      and abandoned_at is not null
      and completed_at is null
      and completion_timing is null
      and completion_date_key is null
      and (trophy_awarded_at is null or trophy_revoked_at is not null)
      and (aura_awarded_at is null or aura_revoked_at is not null)
    )
  )
);

create unique index if not exists adhdice_milestones_task_identity_unique
  on public.adhdice_milestones (task_id)
  where task_id is not null;

create index if not exists adhdice_milestones_user_status_target_idx
  on public.adhdice_milestones (user_id, status, current_target_date, created_at);

create table if not exists public.adhdice_milestone_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_id uuid not null references public.adhdice_milestones(id) on delete restrict,
  task_id uuid references public.adhdice_clean_tasks(id) on delete set null,
  event_type text not null check (event_type in (
    'promoted',
    'recommendation_generated',
    'locked',
    'corrected',
    'tier_raised',
    'completed_on_time',
    'completed_grace_period',
    'completed_late',
    'award_granted',
    'award_revoked',
    'completion_reversed',
    'abandoned',
    'task_trashed',
    'task_restored',
    'task_deleted_permanently'
  )),
  previous_state jsonb check (previous_state is null or jsonb_typeof(previous_state) = 'object'),
  next_state jsonb check (next_state is null or jsonb_typeof(next_state) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, operation_id, event_type)
);

create index if not exists adhdice_milestone_events_user_occurred_idx
  on public.adhdice_milestone_events (user_id, occurred_at desc, created_at desc);
create index if not exists adhdice_milestone_events_milestone_occurred_idx
  on public.adhdice_milestone_events (milestone_id, occurred_at desc, created_at desc);

create table if not exists public.adhdice_milestone_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_id uuid not null references public.adhdice_milestones(id) on delete cascade,
  kind text not null check (kind in ('seven_days', 'three_days', 'target_day', 'final_aura_day')),
  schedule_version integer not null default 1 check (schedule_version > 0),
  scheduled_date date not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'dismissed', 'canceled', 'skipped')),
  delivered_at timestamptz,
  dismissed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (milestone_id, kind, schedule_version),
  constraint adhdice_milestone_reminders_delivery_shape_check check (
    (status = 'pending' and delivered_at is null and dismissed_at is null and canceled_at is null)
    or (status = 'delivered' and delivered_at is not null and dismissed_at is null and canceled_at is null)
    or (status = 'dismissed' and delivered_at is not null and dismissed_at is not null and canceled_at is null)
    or (status = 'canceled' and canceled_at is not null)
    or (status = 'skipped' and delivered_at is null and dismissed_at is null and canceled_at is null)
  )
);

create index if not exists adhdice_milestone_reminders_user_schedule_idx
  on public.adhdice_milestone_reminders (user_id, status, scheduled_date, created_at);

alter table public.adhdice_milestones enable row level security;
alter table public.adhdice_milestone_events enable row level security;
alter table public.adhdice_milestone_reminders enable row level security;

drop policy if exists "Users can read their own Milestones" on public.adhdice_milestones;
create policy "Users can read their own Milestones"
  on public.adhdice_milestones for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own Milestone events" on public.adhdice_milestone_events;
create policy "Users can read their own Milestone events"
  on public.adhdice_milestone_events for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own Milestone reminders" on public.adhdice_milestone_reminders;
create policy "Users can read their own Milestone reminders"
  on public.adhdice_milestone_reminders for select
  using (auth.uid() = user_id);

revoke all on public.adhdice_milestones from anon, authenticated;
revoke all on public.adhdice_milestone_events from anon, authenticated;
revoke all on public.adhdice_milestone_reminders from anon, authenticated;
grant select on public.adhdice_milestones to authenticated;
grant select on public.adhdice_milestone_events to authenticated;
grant select on public.adhdice_milestone_reminders to authenticated;

drop trigger if exists adhdice_milestones_set_updated_at on public.adhdice_milestones;
create trigger adhdice_milestones_set_updated_at
  before update on public.adhdice_milestones
  for each row execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_milestone_reminders_set_updated_at on public.adhdice_milestone_reminders;
create trigger adhdice_milestone_reminders_set_updated_at
  before update on public.adhdice_milestone_reminders
  for each row execute function public.adhdice_clean_set_updated_at();

create or replace function public.adhdice_lock_milestone(
  p_task_id uuid,
  p_expected_task_revision integer,
  p_operation_id uuid,
  p_questions_version text,
  p_rules_version text,
  p_answers_snapshot jsonb,
  p_recommendation_snapshot jsonb,
  p_recommended_tier text,
  p_recommended_target_date date,
  p_allowed_target_date_min date,
  p_allowed_target_date_max date,
  p_selected_tier text,
  p_selected_target_date date,
  p_deadline_kind text,
  p_external_deadline date,
  p_feasibility_warning text,
  p_rules_explanation text,
  p_tier_raise_explanation text,
  p_completion_timezone text
)
returns public.adhdice_milestones
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_task public.adhdice_clean_tasks%rowtype;
  v_milestone public.adhdice_milestones%rowtype;
  v_local_date date;
  v_expected_extension_days integer;
  v_selected_tier_rank integer;
  v_recommended_tier_rank integer;
  v_event_metadata jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_task_id is null or p_operation_id is null then raise exception 'Task and operation IDs are required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));

  select milestone.* into v_milestone
  from public.adhdice_milestone_events event
  join public.adhdice_milestones milestone on milestone.id = event.milestone_id
  where event.user_id = v_user_id
    and event.operation_id = p_operation_id
    and event.event_type = 'locked'
  limit 1;
  if found then
    if v_milestone.task_id is distinct from p_task_id then
      raise exception 'Operation ID was already used for a different Milestone lock';
    end if;
    return v_milestone;
  end if;
  if exists (
    select 1 from public.adhdice_milestone_events
    where user_id = v_user_id and operation_id = p_operation_id
  ) then
    raise exception 'Operation ID was already used for another Milestone mutation';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_completion_timezone) then
    raise exception 'A valid IANA timezone is required';
  end if;
  v_local_date := (clock_timestamp() at time zone p_completion_timezone)::date;

  select * into v_task
  from public.adhdice_clean_tasks
  where id = p_task_id
  for update;
  if not found then raise exception 'Task not found'; end if;
  if v_task.user_id <> v_user_id then raise exception 'Task ownership mismatch'; end if;
  if p_expected_task_revision is null or v_task.revision <> p_expected_task_revision then
    raise exception 'Task revision conflict';
  end if;
  if v_task.parent_task_id is not null then raise exception 'Steps and Substeps must be detached before Milestone promotion'; end if;
  if v_task.repeat_frequency::text not in ('none', 'daily_until_complete') then raise exception 'Indefinitely recurring tasks are not eligible for Milestones'; end if;
  if v_task.status::text in ('complete', 'archived', 'trashed') then raise exception 'Closed tasks are not eligible for Milestones'; end if;
  if exists (select 1 from public.adhdice_milestones where task_id = p_task_id) then raise exception 'This task already has a Milestone identity'; end if;

  if p_questions_version is null or char_length(trim(p_questions_version)) = 0
    or p_rules_version is null or char_length(trim(p_rules_version)) = 0 then
    raise exception 'Questions and rules versions are required';
  end if;
  if p_answers_snapshot is null or jsonb_typeof(p_answers_snapshot) <> 'object'
    or p_recommendation_snapshot is null or jsonb_typeof(p_recommendation_snapshot) <> 'object' then
    raise exception 'Milestone snapshots must be JSON objects';
  end if;
  if p_recommended_tier not in ('bronze', 'silver', 'gold', 'platinum')
    or p_selected_tier not in ('bronze', 'silver', 'gold', 'platinum') then
    raise exception 'Invalid Milestone tier';
  end if;
  if p_deadline_kind not in ('none', 'preferred', 'firm') then raise exception 'Invalid deadline kind'; end if;
  if (p_deadline_kind = 'none' and p_external_deadline is not null)
    or (p_deadline_kind in ('preferred', 'firm') and p_external_deadline is null) then
    raise exception 'External deadline does not match deadline kind';
  end if;
  if p_recommended_target_date < v_local_date + 1 then
    raise exception 'The recommended Milestone target must be tomorrow or later';
  end if;
  v_expected_extension_days := least(
    90,
    greatest(7, ceil((p_recommended_target_date - v_local_date) * 0.25)::integer)
  );
  if p_allowed_target_date_min <> v_local_date + 1
    or p_allowed_target_date_max <> p_recommended_target_date + v_expected_extension_days
    or p_allowed_target_date_min > p_recommended_target_date
    or p_recommended_target_date > p_allowed_target_date_max
    or p_selected_target_date < p_allowed_target_date_min
    or p_selected_target_date > p_allowed_target_date_max then
    raise exception 'Milestone target dates are outside the authoritative allowed range';
  end if;
  if p_deadline_kind = 'firm'
    and (p_recommended_target_date <> p_external_deadline or p_selected_target_date <> p_external_deadline) then
    raise exception 'A firm external deadline must remain the Milestone target';
  end if;
  if char_length(trim(coalesce(p_rules_explanation, ''))) = 0 then raise exception 'Rules explanation is required'; end if;

  v_selected_tier_rank := case p_selected_tier when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 else 4 end;
  v_recommended_tier_rank := case p_recommended_tier when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 else 4 end;
  if v_selected_tier_rank > v_recommended_tier_rank
    and char_length(trim(coalesce(p_tier_raise_explanation, ''))) = 0 then
    raise exception 'Raising the recommended tier requires an explanation';
  end if;

  insert into public.adhdice_milestones (
    user_id, task_id, task_title_snapshot, status,
    rules_version, questions_version, answers_snapshot, recommendation_snapshot,
    recommended_tier, recommended_target_date, allowed_target_date_min, allowed_target_date_max,
    deadline_kind, external_deadline, feasibility_warning, rules_explanation,
    initial_locked_tier, initial_locked_target_date, initial_aura_deadline,
    current_tier, current_target_date, current_aura_deadline,
    tier_raise_explanation, completion_timezone
  ) values (
    v_user_id, v_task.id, v_task.title, 'active',
    trim(p_rules_version), trim(p_questions_version), p_answers_snapshot, p_recommendation_snapshot,
    p_recommended_tier, p_recommended_target_date, p_allowed_target_date_min, p_allowed_target_date_max,
    p_deadline_kind, p_external_deadline, nullif(trim(coalesce(p_feasibility_warning, '')), ''), trim(p_rules_explanation),
    p_selected_tier, p_selected_target_date, p_selected_target_date + 3,
    p_selected_tier, p_selected_target_date, p_selected_target_date + 3,
    case when v_selected_tier_rank > v_recommended_tier_rank then trim(p_tier_raise_explanation) else null end,
    p_completion_timezone
  ) returning * into v_milestone;

  v_event_metadata := jsonb_build_object(
    'questions_version', v_milestone.questions_version,
    'rules_version', v_milestone.rules_version,
    'task_revision', v_task.revision
  );

  insert into public.adhdice_milestone_events (
    operation_id, user_id, milestone_id, task_id, event_type, next_state, metadata
  ) values
    (p_operation_id, v_user_id, v_milestone.id, v_task.id, 'promoted', jsonb_build_object('task_id', v_task.id, 'task_title', v_task.title), v_event_metadata),
    (p_operation_id, v_user_id, v_milestone.id, v_task.id, 'recommendation_generated', p_recommendation_snapshot, v_event_metadata),
    (p_operation_id, v_user_id, v_milestone.id, v_task.id, 'locked', to_jsonb(v_milestone), v_event_metadata);

  if v_selected_tier_rank > v_recommended_tier_rank then
    insert into public.adhdice_milestone_events (
      operation_id, user_id, milestone_id, task_id, event_type, previous_state, next_state, metadata
    ) values (
      p_operation_id, v_user_id, v_milestone.id, v_task.id, 'tier_raised',
      jsonb_build_object('tier', p_recommended_tier),
      jsonb_build_object('tier', p_selected_tier),
      jsonb_build_object('explanation', trim(p_tier_raise_explanation), 'phase', 'lock')
    );
  end if;

  insert into public.adhdice_milestone_reminders (
    user_id, milestone_id, kind, schedule_version, scheduled_date, status
  )
  select
    v_user_id,
    v_milestone.id,
    schedule.kind,
    1,
    schedule.scheduled_date,
    case when schedule.scheduled_date < v_local_date then 'skipped' else 'pending' end
  from (values
    ('seven_days', p_selected_target_date - 7),
    ('three_days', p_selected_target_date - 3),
    ('target_day', p_selected_target_date),
    ('final_aura_day', p_selected_target_date + 3)
  ) as schedule(kind, scheduled_date);

  return v_milestone;
end;
$function$;

create or replace function public.adhdice_correct_milestone_setup(
  p_milestone_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_corrected_tier text,
  p_corrected_target_date date,
  p_tier_raise_explanation text
)
returns public.adhdice_milestones
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_before public.adhdice_milestones%rowtype;
  v_after public.adhdice_milestones%rowtype;
  v_current_tier_rank integer;
  v_corrected_tier_rank integer;
  v_recommended_tier_rank integer;
  v_schedule_version integer;
  v_local_date date;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_milestone_id is null or p_operation_id is null then raise exception 'Milestone and operation IDs are required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));

  select milestone.* into v_after
  from public.adhdice_milestone_events event
  join public.adhdice_milestones milestone on milestone.id = event.milestone_id
  where event.user_id = v_user_id
    and event.operation_id = p_operation_id
    and event.event_type = 'corrected'
  limit 1;
  if found then
    if v_after.id <> p_milestone_id then
      raise exception 'Operation ID was already used for a different Milestone correction';
    end if;
    return v_after;
  end if;
  if exists (
    select 1 from public.adhdice_milestone_events
    where user_id = v_user_id and operation_id = p_operation_id
  ) then
    raise exception 'Operation ID was already used for another Milestone mutation';
  end if;

  select * into v_before
  from public.adhdice_milestones
  where id = p_milestone_id
  for update;
  if not found then raise exception 'Milestone not found'; end if;
  if v_before.user_id <> v_user_id then raise exception 'Milestone ownership mismatch'; end if;
  if p_expected_revision is null or v_before.revision <> p_expected_revision then raise exception 'Milestone revision conflict'; end if;
  if v_before.status <> 'active' then raise exception 'Only active Milestones can receive a setup correction'; end if;
  if v_before.setup_correction_used then raise exception 'The one setup correction has already been used'; end if;
  if clock_timestamp() > v_before.locked_at + interval '24 hours' then raise exception 'The setup correction window has expired'; end if;
  if p_corrected_tier not in ('bronze', 'silver', 'gold', 'platinum') then raise exception 'Invalid Milestone tier'; end if;
  if p_corrected_target_date < v_before.allowed_target_date_min
    or p_corrected_target_date > v_before.allowed_target_date_max then
    raise exception 'Corrected target is outside the locked adjustment range';
  end if;
  if v_before.deadline_kind = 'firm' and p_corrected_target_date <> v_before.external_deadline then
    raise exception 'A firm external deadline must remain the Milestone target';
  end if;
  if p_corrected_tier = v_before.current_tier
    and p_corrected_target_date = v_before.current_target_date then
    raise exception 'A setup correction must change the tier, target date, or both';
  end if;

  v_current_tier_rank := case v_before.current_tier when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 else 4 end;
  v_corrected_tier_rank := case p_corrected_tier when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 else 4 end;
  v_recommended_tier_rank := case v_before.recommended_tier when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 else 4 end;
  if v_corrected_tier_rank > v_recommended_tier_rank
    and char_length(trim(coalesce(p_tier_raise_explanation, ''))) = 0 then
    raise exception 'Raising the recommended tier requires an explanation';
  end if;

  update public.adhdice_milestones
  set
    revision = revision + 1,
    current_tier = p_corrected_tier,
    current_target_date = p_corrected_target_date,
    current_aura_deadline = p_corrected_target_date + 3,
    tier_raise_explanation = case
      when v_corrected_tier_rank > v_recommended_tier_rank then trim(p_tier_raise_explanation)
      else null
    end,
    setup_correction_used = true,
    setup_corrected_at = clock_timestamp()
  where id = v_before.id
  returning * into v_after;

  insert into public.adhdice_milestone_events (
    operation_id, user_id, milestone_id, task_id, event_type, previous_state, next_state,
    metadata, occurred_at
  ) values (
    p_operation_id, v_user_id, v_after.id, v_after.task_id, 'corrected',
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('correction_window_started_at', v_before.locked_at),
    v_after.setup_corrected_at
  );

  if v_corrected_tier_rank > v_current_tier_rank then
    insert into public.adhdice_milestone_events (
      operation_id, user_id, milestone_id, task_id, event_type, previous_state, next_state,
      metadata, occurred_at
    ) values (
      p_operation_id, v_user_id, v_after.id, v_after.task_id, 'tier_raised',
      jsonb_build_object('tier', v_before.current_tier),
      jsonb_build_object('tier', v_after.current_tier),
      jsonb_build_object('explanation', nullif(trim(coalesce(p_tier_raise_explanation, '')), ''), 'phase', 'correction'),
      v_after.setup_corrected_at
    );
  end if;

  select coalesce(max(schedule_version), 1) + 1 into v_schedule_version
  from public.adhdice_milestone_reminders
  where milestone_id = v_before.id;

  update public.adhdice_milestone_reminders
  set status = 'canceled', canceled_at = clock_timestamp()
  where milestone_id = v_before.id
    and schedule_version = v_schedule_version - 1
    and status = 'pending';

  v_local_date := (clock_timestamp() at time zone v_before.completion_timezone)::date;
  insert into public.adhdice_milestone_reminders (
    user_id, milestone_id, kind, schedule_version, scheduled_date, status
  )
  select
    v_user_id,
    v_before.id,
    schedule.kind,
    v_schedule_version,
    schedule.scheduled_date,
    case when schedule.scheduled_date < v_local_date then 'skipped' else 'pending' end
  from (values
    ('seven_days', p_corrected_target_date - 7),
    ('three_days', p_corrected_target_date - 3),
    ('target_day', p_corrected_target_date),
    ('final_aura_day', p_corrected_target_date + 3)
  ) as schedule(kind, scheduled_date);

  return v_after;
end;
$function$;

revoke all on function public.adhdice_lock_milestone(uuid, integer, uuid, text, text, jsonb, jsonb, text, date, date, date, text, date, text, date, text, text, text, text) from public, anon;
revoke all on function public.adhdice_correct_milestone_setup(uuid, bigint, uuid, text, date, text) from public, anon;
grant execute on function public.adhdice_lock_milestone(uuid, integer, uuid, text, text, jsonb, jsonb, text, date, date, date, text, date, text, date, text, text, text, text) to authenticated;
grant execute on function public.adhdice_correct_milestone_setup(uuid, bigint, uuid, text, date, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_milestones'
  ) then alter publication supabase_realtime add table public.adhdice_milestones; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_milestone_events'
  ) then alter publication supabase_realtime add table public.adhdice_milestone_events; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_milestone_reminders'
  ) then alter publication supabase_realtime add table public.adhdice_milestone_reminders; end if;
end;
$$;

notify pgrst, 'reload schema';

-- ADHDice Achievements MVP foundation.
-- Catalog/runtime evaluation remains source-controlled and is not wired to live activity in this migration.
begin;

create table if not exists public.adhdice_achievement_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  activation_operation_id uuid not null,
  activated_at timestamptz not null,
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  rules_version text not null check (char_length(trim(rules_version)) > 0),
  launch_mastery_version text not null check (char_length(trim(launch_mastery_version)) > 0),
  timezone text not null check (char_length(trim(timezone)) > 0),
  logical_day_start time without time zone not null default time '06:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, activation_operation_id)
);

create table if not exists public.adhdice_achievement_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  source_kind text not null check (source_kind in ('task_history', 'focus_session', 'focus_runtime')),
  source_id text not null check (char_length(trim(source_id)) > 0),
  source_occurrence_key text not null check (char_length(trim(source_occurrence_key)) > 0),
  dedupe_key text not null check (char_length(trim(dedupe_key)) > 0),
  first_qualified_at timestamptz not null,
  logical_date date not null,
  week_key date not null,
  week_start_date date not null,
  week_end_date date not null,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  month_start_date date not null,
  month_end_date date not null,
  timezone text not null check (char_length(trim(timezone)) > 0),
  logical_day_start time without time zone not null,
  entity_kind text not null check (entity_kind in ('parent_task', 'step', 'focus_session', 'focus_runtime')),
  entity_id uuid,
  root_parent_id uuid,
  title_snapshot text,
  outcome_snapshot text check (outcome_snapshot is null or outcome_snapshot in ('done', 'complete', 'did_my_best')),
  active_duration_seconds bigint check (active_duration_seconds is null or active_duration_seconds > 0),
  evaluator_version text not null check (char_length(trim(evaluator_version)) > 0),
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  created_at timestamptz not null default now(),
  constraint adhdice_achievement_occurrences_snapshot_check check (
    outcome_snapshot is not null or active_duration_seconds is not null
  ),
  constraint adhdice_achievement_occurrences_week_check check (
    week_key = week_start_date and week_end_date = week_start_date + 6
  ),
  constraint adhdice_achievement_occurrences_month_check check (
    month_start_date <= logical_date and logical_date <= month_end_date
  ),
  unique (id, user_id),
  unique (user_id, dedupe_key),
  unique (user_id, source_kind, source_id, source_occurrence_key)
);

create index if not exists adhdice_achievement_occurrences_user_logical_date_idx
  on public.adhdice_achievement_occurrences (user_id, logical_date desc, first_qualified_at desc);
create index if not exists adhdice_achievement_occurrences_user_week_idx
  on public.adhdice_achievement_occurrences (user_id, week_key, entity_kind);
create index if not exists adhdice_achievement_occurrences_user_month_idx
  on public.adhdice_achievement_occurrences (user_id, month_key, entity_kind);

create or replace function public.adhdice_validate_achievement_occurrence_activation()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_activated_at timestamptz;
begin
  select activated_at into v_activated_at
  from public.adhdice_achievement_profiles
  where user_id = new.user_id;
  if v_activated_at is null or new.first_qualified_at < v_activated_at then
    raise exception using errcode = '23514', message = 'Achievement occurrences must be post-activation.';
  end if;
  return new;
end;
$function$;

drop trigger if exists adhdice_achievement_occurrences_post_activation on public.adhdice_achievement_occurrences;
create trigger adhdice_achievement_occurrences_post_activation
  before insert on public.adhdice_achievement_occurrences
  for each row execute function public.adhdice_validate_achievement_occurrence_activation();

create table if not exists public.adhdice_achievement_occurrence_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  occurrence_id uuid not null,
  track_id text not null check (char_length(trim(track_id)) > 0),
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  matched_at timestamptz not null default now(),
  foreign key (occurrence_id, user_id)
    references public.adhdice_achievement_occurrences(id, user_id) on delete cascade,
  unique (occurrence_id, track_id)
);

create index if not exists adhdice_achievement_occurrence_matches_user_track_idx
  on public.adhdice_achievement_occurrence_matches (user_id, track_id, matched_at desc);

create table if not exists public.adhdice_achievement_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  track_id text not null check (char_length(trim(track_id)) > 0),
  current_value bigint not null default 0 check (current_value >= 0),
  current_streak bigint not null default 0 check (current_streak >= 0),
  best_streak bigint not null default 0 check (best_streak >= current_streak),
  current_streak_start date,
  current_streak_end date,
  best_streak_start date,
  best_streak_end date,
  source_watermark jsonb not null default '{}'::jsonb check (jsonb_typeof(source_watermark) = 'object'),
  recalculation_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(recalculation_metadata) = 'object'),
  evaluator_version text not null check (char_length(trim(evaluator_version)) > 0),
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  last_recalculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, track_id)
);

create table if not exists public.adhdice_achievement_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  mode text not null check (mode in ('immediate', 'recalculation')),
  status text not null,
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  rules_version text not null check (char_length(trim(rules_version)) > 0),
  cursor_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(cursor_metadata) = 'object'),
  window_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(window_metadata) = 'object'),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  error_message text check (error_message is null or char_length(error_message) <= 500),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint adhdice_achievement_evaluation_runs_status_check check (
    (status = 'running' and completed_at is null and error_code is null and error_message is null)
    or (status = 'completed' and completed_at is not null and error_code is null and error_message is null)
    or (status = 'failed' and completed_at is not null and error_code is not null)
  ),
  unique (id, user_id),
  unique (user_id, operation_id)
);

create index if not exists adhdice_achievement_evaluation_runs_user_started_idx
  on public.adhdice_achievement_evaluation_runs (user_id, started_at desc);

create table if not exists public.adhdice_achievement_tier_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  track_id text not null check (char_length(trim(track_id)) > 0),
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  award_key text not null check (char_length(trim(award_key)) > 0),
  earned_at timestamptz not null,
  triggering_occurrence_id uuid,
  evaluation_run_id uuid,
  evaluator_version text not null check (char_length(trim(evaluator_version)) > 0),
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  created_at timestamptz not null default now(),
  foreign key (triggering_occurrence_id, user_id)
    references public.adhdice_achievement_occurrences(id, user_id) on delete restrict,
  foreign key (evaluation_run_id, user_id)
    references public.adhdice_achievement_evaluation_runs(id, user_id) on delete restrict,
  unique (id, user_id),
  unique (user_id, track_id, tier),
  unique (user_id, award_key)
);

create index if not exists adhdice_achievement_tier_awards_user_earned_idx
  on public.adhdice_achievement_tier_awards (user_id, earned_at desc);

create table if not exists public.adhdice_achievement_collection_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  collection_id text not null check (char_length(trim(collection_id)) > 0),
  mastery_version text not null check (char_length(trim(mastery_version)) > 0),
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  award_key text not null check (char_length(trim(award_key)) > 0),
  required_track_ids_snapshot jsonb not null check (
    jsonb_typeof(required_track_ids_snapshot) = 'array'
    and jsonb_array_length(required_track_ids_snapshot) > 0
  ),
  required_tracks_fingerprint text not null check (char_length(trim(required_tracks_fingerprint)) > 0),
  earned_at timestamptz not null,
  evaluation_run_id uuid,
  created_at timestamptz not null default now(),
  foreign key (evaluation_run_id, user_id)
    references public.adhdice_achievement_evaluation_runs(id, user_id) on delete restrict,
  unique (id, user_id),
  unique (user_id, collection_id, mastery_version),
  unique (user_id, award_key)
);

create index if not exists adhdice_achievement_collection_awards_user_earned_idx
  on public.adhdice_achievement_collection_awards (user_id, earned_at desc);

create table if not exists public.adhdice_achievement_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  award_kind text not null check (award_kind in ('tier', 'collection')),
  tier_award_id uuid,
  collection_award_id uuid,
  dedupe_key text not null check (char_length(trim(dedupe_key)) > 0),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  seen_at timestamptz,
  constraint adhdice_achievement_notifications_award_check check (
    (award_kind = 'tier' and tier_award_id is not null and collection_award_id is null)
    or (award_kind = 'collection' and collection_award_id is not null and tier_award_id is null)
  ),
  constraint adhdice_achievement_notifications_status_check check (
    (status = 'pending' and delivered_at is null and seen_at is null)
    or (status = 'delivered' and delivered_at is not null and seen_at is null)
    or (status = 'seen' and delivered_at is not null and seen_at is not null)
  ),
  foreign key (tier_award_id, user_id)
    references public.adhdice_achievement_tier_awards(id, user_id) on delete restrict,
  foreign key (collection_award_id, user_id)
    references public.adhdice_achievement_collection_awards(id, user_id) on delete restrict,
  unique (user_id, dedupe_key)
);

create index if not exists adhdice_achievement_notifications_user_status_idx
  on public.adhdice_achievement_notifications (user_id, status, created_at);

drop trigger if exists adhdice_achievement_profiles_set_updated_at on public.adhdice_achievement_profiles;
create trigger adhdice_achievement_profiles_set_updated_at
  before update on public.adhdice_achievement_profiles
  for each row execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_achievement_progress_set_updated_at on public.adhdice_achievement_progress;
create trigger adhdice_achievement_progress_set_updated_at
  before update on public.adhdice_achievement_progress
  for each row execute function public.adhdice_clean_set_updated_at();

create or replace function public.adhdice_reject_permanent_achievement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception using
    errcode = '55000',
    message = 'Earned Achievement awards and Collection mastery are permanent.';
end;
$function$;

drop trigger if exists adhdice_achievement_tier_awards_permanent on public.adhdice_achievement_tier_awards;
create trigger adhdice_achievement_tier_awards_permanent
  before update or delete on public.adhdice_achievement_tier_awards
  for each row execute function public.adhdice_reject_permanent_achievement_mutation();

drop trigger if exists adhdice_achievement_collection_awards_permanent on public.adhdice_achievement_collection_awards;
create trigger adhdice_achievement_collection_awards_permanent
  before update or delete on public.adhdice_achievement_collection_awards
  for each row execute function public.adhdice_reject_permanent_achievement_mutation();

create or replace function public.adhdice_activate_achievement_profile(
  p_operation_id uuid,
  p_catalog_version text,
  p_rules_version text,
  p_launch_mastery_version text,
  p_timezone text,
  p_logical_day_start time without time zone default time '06:00'
)
returns public.adhdice_achievement_profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile public.adhdice_achievement_profiles%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null then raise exception 'Operation ID is required'; end if;
  if nullif(trim(p_catalog_version), '') is null
    or nullif(trim(p_rules_version), '') is null
    or nullif(trim(p_launch_mastery_version), '') is null then
    raise exception 'Catalog, rules, and launch mastery versions are required';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Achievement timezone must be a valid IANA timezone';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':achievement-activation', 0));
  select * into v_profile
  from public.adhdice_achievement_profiles
  where user_id = v_user_id;
  if found then return v_profile; end if;

  insert into public.adhdice_achievement_profiles (
    user_id, activation_operation_id, activated_at, catalog_version, rules_version,
    launch_mastery_version, timezone, logical_day_start
  ) values (
    v_user_id, p_operation_id, clock_timestamp(), trim(p_catalog_version), trim(p_rules_version),
    trim(p_launch_mastery_version), p_timezone, p_logical_day_start
  ) returning * into v_profile;
  return v_profile;
end;
$function$;

create or replace function public.adhdice_claim_achievement_notifications(
  p_limit integer default 10
)
returns setof public.adhdice_achievement_notifications
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  return query
  with selected as (
    select notification.id
    from public.adhdice_achievement_notifications notification
    where notification.user_id = v_user_id
      and notification.status = 'pending'
    order by notification.created_at, notification.id
    for update skip locked
    limit v_limit
  ), transitioned as (
    update public.adhdice_achievement_notifications notification
    set status = 'delivered',
      delivered_at = coalesce(notification.delivered_at, pg_catalog.clock_timestamp())
    from selected
    where notification.id = selected.id
      and notification.user_id = v_user_id
      and notification.status = 'pending'
    returning notification.*
  )
  select transitioned.*
  from transitioned
  order by transitioned.created_at, transitioned.id;
end;
$function$;

create or replace function public.adhdice_mark_achievement_notification_seen(
  p_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_notification public.adhdice_achievement_notifications%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_notification_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'result', 'not_found', 'notification', null);
  end if;

  select notification.*
  into v_notification
  from public.adhdice_achievement_notifications notification
  where notification.id = p_notification_id
    and notification.user_id = v_user_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'result', 'not_found', 'notification', null);
  end if;
  if v_notification.status = 'seen' then
    return pg_catalog.jsonb_build_object('success', true, 'result', 'already_seen', 'notification', pg_catalog.to_jsonb(v_notification));
  end if;
  if v_notification.status <> 'delivered' then
    return pg_catalog.jsonb_build_object('success', false, 'result', 'not_delivered', 'notification', pg_catalog.to_jsonb(v_notification));
  end if;

  update public.adhdice_achievement_notifications notification
  set status = 'seen',
    seen_at = coalesce(notification.seen_at, pg_catalog.clock_timestamp())
  where notification.id = v_notification.id
    and notification.user_id = v_user_id
    and notification.status = 'delivered'
  returning notification.* into v_notification;

  return pg_catalog.jsonb_build_object('success', true, 'result', 'seen', 'notification', pg_catalog.to_jsonb(v_notification));
end;
$function$;

alter table public.adhdice_achievement_profiles enable row level security;
alter table public.adhdice_achievement_occurrences enable row level security;
alter table public.adhdice_achievement_occurrence_matches enable row level security;
alter table public.adhdice_achievement_progress enable row level security;
alter table public.adhdice_achievement_tier_awards enable row level security;
alter table public.adhdice_achievement_collection_awards enable row level security;
alter table public.adhdice_achievement_notifications enable row level security;
alter table public.adhdice_achievement_evaluation_runs enable row level security;

drop policy if exists "Users can read own Achievement profile" on public.adhdice_achievement_profiles;
create policy "Users can read own Achievement profile" on public.adhdice_achievement_profiles
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement occurrences" on public.adhdice_achievement_occurrences;
create policy "Users can read own Achievement occurrences" on public.adhdice_achievement_occurrences
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement occurrence matches" on public.adhdice_achievement_occurrence_matches;
create policy "Users can read own Achievement occurrence matches" on public.adhdice_achievement_occurrence_matches
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement progress" on public.adhdice_achievement_progress;
create policy "Users can read own Achievement progress" on public.adhdice_achievement_progress
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement tier awards" on public.adhdice_achievement_tier_awards;
create policy "Users can read own Achievement tier awards" on public.adhdice_achievement_tier_awards
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement Collection awards" on public.adhdice_achievement_collection_awards;
create policy "Users can read own Achievement Collection awards" on public.adhdice_achievement_collection_awards
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement notifications" on public.adhdice_achievement_notifications;
create policy "Users can read own Achievement notifications" on public.adhdice_achievement_notifications
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement evaluation runs" on public.adhdice_achievement_evaluation_runs;
create policy "Users can read own Achievement evaluation runs" on public.adhdice_achievement_evaluation_runs
  for select using (auth.uid() = user_id);

revoke all on public.adhdice_achievement_profiles from anon, authenticated;
revoke all on public.adhdice_achievement_occurrences from anon, authenticated;
revoke all on public.adhdice_achievement_occurrence_matches from anon, authenticated;
revoke all on public.adhdice_achievement_progress from anon, authenticated;
revoke all on public.adhdice_achievement_tier_awards from anon, authenticated;
revoke all on public.adhdice_achievement_collection_awards from anon, authenticated;
revoke all on public.adhdice_achievement_notifications from anon, authenticated;
revoke all on public.adhdice_achievement_evaluation_runs from anon, authenticated;

grant select on public.adhdice_achievement_profiles to authenticated;
grant select on public.adhdice_achievement_occurrences to authenticated;
grant select on public.adhdice_achievement_occurrence_matches to authenticated;
grant select on public.adhdice_achievement_progress to authenticated;
grant select on public.adhdice_achievement_tier_awards to authenticated;
grant select on public.adhdice_achievement_collection_awards to authenticated;
grant select on public.adhdice_achievement_notifications to authenticated;
grant select on public.adhdice_achievement_evaluation_runs to authenticated;

revoke all on function public.adhdice_activate_achievement_profile(uuid, text, text, text, text, time without time zone) from public, anon;
grant execute on function public.adhdice_activate_achievement_profile(uuid, text, text, text, text, time without time zone) to authenticated;
revoke all on function public.adhdice_claim_achievement_notifications(integer) from public, anon;
grant execute on function public.adhdice_claim_achievement_notifications(integer) to authenticated;
revoke all on function public.adhdice_mark_achievement_notification_seen(uuid) from public, anon;
grant execute on function public.adhdice_mark_achievement_notification_seen(uuid) to authenticated;

do $publication$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_achievement_profiles') then
    alter publication supabase_realtime add table public.adhdice_achievement_profiles;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_achievement_progress') then
    alter publication supabase_realtime add table public.adhdice_achievement_progress;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_achievement_tier_awards') then
    alter publication supabase_realtime add table public.adhdice_achievement_tier_awards;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_achievement_collection_awards') then
    alter publication supabase_realtime add table public.adhdice_achievement_collection_awards;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_achievement_notifications') then
    alter publication supabase_realtime add table public.adhdice_achievement_notifications;
  end if;
end;
$publication$;

notify pgrst, 'reload schema';
commit;

-- ADHDice 6.29.49 secure Achievement notification delivery contract.
-- Apply after add_achievement_mvp_foundation.sql. No production execution is implied.
begin;

create or replace function public.adhdice_claim_achievement_notifications(
  p_limit integer default 10
)
returns setof public.adhdice_achievement_notifications
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  return query
  with selected as (
    select notification.id
    from public.adhdice_achievement_notifications notification
    where notification.user_id = v_user_id
      and notification.status = 'pending'
    order by notification.created_at, notification.id
    for update skip locked
    limit v_limit
  ), transitioned as (
    update public.adhdice_achievement_notifications notification
    set status = 'delivered',
      delivered_at = coalesce(notification.delivered_at, pg_catalog.clock_timestamp())
    from selected
    where notification.id = selected.id
      and notification.user_id = v_user_id
      and notification.status = 'pending'
    returning notification.*
  )
  select transitioned.*
  from transitioned
  order by transitioned.created_at, transitioned.id;
end;
$function$;

create or replace function public.adhdice_mark_achievement_notification_seen(
  p_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_notification public.adhdice_achievement_notifications%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_notification_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'result', 'not_found', 'notification', null);
  end if;

  select notification.*
  into v_notification
  from public.adhdice_achievement_notifications notification
  where notification.id = p_notification_id
    and notification.user_id = v_user_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'result', 'not_found', 'notification', null);
  end if;
  if v_notification.status = 'seen' then
    return pg_catalog.jsonb_build_object('success', true, 'result', 'already_seen', 'notification', pg_catalog.to_jsonb(v_notification));
  end if;
  if v_notification.status <> 'delivered' then
    return pg_catalog.jsonb_build_object('success', false, 'result', 'not_delivered', 'notification', pg_catalog.to_jsonb(v_notification));
  end if;

  update public.adhdice_achievement_notifications notification
  set status = 'seen',
    seen_at = coalesce(notification.seen_at, pg_catalog.clock_timestamp())
  where notification.id = v_notification.id
    and notification.user_id = v_user_id
    and notification.status = 'delivered'
  returning notification.* into v_notification;

  return pg_catalog.jsonb_build_object('success', true, 'result', 'seen', 'notification', pg_catalog.to_jsonb(v_notification));
end;
$function$;

revoke all on function public.adhdice_claim_achievement_notifications(integer) from public, anon;
grant execute on function public.adhdice_claim_achievement_notifications(integer) to authenticated;
revoke all on function public.adhdice_mark_achievement_notification_seen(uuid) from public, anon;
grant execute on function public.adhdice_mark_achievement_notification_seen(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

-- ADHDice 6.29.50 fixes the Achievement notification claim limit clamp.
-- Apply after add_achievement_notification_delivery_6_29_49.sql. No production execution is implied.
begin;

create or replace function public.adhdice_claim_achievement_notifications(
  p_limit integer default 10
)
returns setof public.adhdice_achievement_notifications
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  return query
  with selected as (
    select notification.id
    from public.adhdice_achievement_notifications notification
    where notification.user_id = v_user_id
      and notification.status = 'pending'
    order by notification.created_at, notification.id
    for update skip locked
    limit v_limit
  ), transitioned as (
    update public.adhdice_achievement_notifications notification
    set status = 'delivered',
      delivered_at = coalesce(notification.delivered_at, pg_catalog.clock_timestamp())
    from selected
    where notification.id = selected.id
      and notification.user_id = v_user_id
      and notification.status = 'pending'
    returning notification.*
  )
  select transitioned.*
  from transitioned
  order by transitioned.created_at, transitioned.id;
end;
$function$;

revoke all on function public.adhdice_claim_achievement_notifications(integer) from public, anon;
grant execute on function public.adhdice_claim_achievement_notifications(integer) to authenticated;

notify pgrst, 'reload schema';
commit;

-- ADHDice Achievements MVP authoritative capture, evaluation, and resumable recalculation.
-- Apply after add_achievement_mvp_foundation.sql. No production execution is implied.
begin;

alter table public.adhdice_achievement_occurrences
  add column if not exists source_created_at timestamptz,
  add column if not exists is_currently_qualifying boolean not null default true,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

alter table public.adhdice_achievement_occurrences
  drop constraint if exists adhdice_achievement_occurrences_source_kind_check,
  add constraint adhdice_achievement_occurrences_source_kind_check
    check (source_kind in ('task_history', 'focus_session', 'step_set')),
  drop constraint if exists adhdice_achievement_occurrences_entity_kind_check,
  add constraint adhdice_achievement_occurrences_entity_kind_check
    check (entity_kind in ('parent_task', 'step', 'focus_session', 'parent_step_set'));

create unique index if not exists adhdice_achievement_occurrences_source_record_unique
  on public.adhdice_achievement_occurrences (user_id, source_kind, source_id);
create index if not exists adhdice_achievement_occurrences_active_kind_idx
  on public.adhdice_achievement_occurrences (user_id, entity_kind, logical_date)
  where is_currently_qualifying;

comment on column public.adhdice_achievement_occurrences.source_created_at is
  'Original source-row creation time. Eligibility uses this field, never a later edit time.';
comment on column public.adhdice_achievement_occurrences.source_snapshot is
  'Frozen source evidence. Step-set rows include the exact sorted Step and constituent occurrence IDs.';

create or replace function public.adhdice_achievement_logical_date(
  p_timestamp timestamptz,
  p_timezone text,
  p_logical_day_start time without time zone
) returns date
language sql stable strict
set search_path = ''
as $function$
  select ((p_timestamp at time zone p_timezone) - p_logical_day_start)::date
$function$;

create or replace function public.adhdice_validate_achievement_occurrence_activation()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_activation_logical_date date;
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id = new.user_id;
  if not found then
    raise exception using errcode = '23514', message = 'An activated Achievement profile is required.';
  end if;
  v_activation_logical_date := public.adhdice_achievement_logical_date(
    v_profile.activated_at, v_profile.timezone, v_profile.logical_day_start
  );
  if new.source_created_at is null
    or new.source_created_at < v_profile.activated_at
    or new.first_qualified_at < v_profile.activated_at
    or new.logical_date < v_activation_logical_date then
    raise exception using errcode = '23514', message = 'Achievement occurrences must be genuinely post-activation.';
  end if;
  return new;
end;
$function$;

drop trigger if exists adhdice_achievement_occurrences_post_activation on public.adhdice_achievement_occurrences;
create trigger adhdice_achievement_occurrences_post_activation
  before insert or update of source_created_at, first_qualified_at, logical_date
  on public.adhdice_achievement_occurrences
  for each row execute function public.adhdice_validate_achievement_occurrence_activation();

create or replace function public.adhdice_achievement_root_parent(p_task_id uuid, p_user_id uuid)
returns uuid
language sql stable
set search_path = ''
as $function$
  with recursive ancestors as (
    select task.id, task.parent_task_id, 0 as depth
    from public.adhdice_clean_tasks task
    where task.id = p_task_id and task.user_id = p_user_id
    union all
    select parent.id, parent.parent_task_id, child.depth + 1
    from public.adhdice_clean_tasks parent
    join ancestors child on child.parent_task_id = parent.id
    where parent.user_id = p_user_id and child.depth < 64
  )
  select id from ancestors order by depth desc limit 1
$function$;

create or replace function public.adhdice_capture_task_achievement_occurrence(p_history_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_history public.adhdice_task_history%rowtype;
  v_task public.adhdice_clean_tasks%rowtype;
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_occurrence_id uuid;
  v_source_key text;
  v_dedupe_key text;
  v_entity_kind text;
  v_logical_occurrence_part text;
  v_root_id uuid;
  v_qualified boolean;
begin
  select * into v_history from public.adhdice_task_history where id = p_history_id;
  if not found then return null; end if;
  select * into v_profile from public.adhdice_achievement_profiles where user_id = v_history.user_id;
  if not found then return null; end if;
  select * into v_task from public.adhdice_clean_tasks where id = v_history.task_id and user_id = v_history.user_id;
  if not found then return null; end if;
  v_entity_kind := case when v_task.parent_task_id is null then 'parent_task' else 'step' end;
  -- Keep source-row identity separate from logical Achievement identity.
  -- source_id is the exact adhdice_task_history.id; dedupe_key is one countable
  -- Task/Step occurrence. Fallback order matches src/lib/achievements-mvp/identity.ts:
  -- occurrence_key -> lifetime:<task-id> for one-offs -> logical-date:<entry-date>.
  v_logical_occurrence_part := case
    when nullif(btrim(v_history.occurrence_key), '') is not null then v_history.occurrence_key
    when v_task.repeat_frequency = 'none' then 'lifetime:' || v_history.task_id::text
    else 'logical-date:' || v_history.entry_date::text
  end;
  v_source_key := 'task:' || v_history.task_id::text || ':' || v_logical_occurrence_part;
  v_dedupe_key := 'occurrence:v1:task_history:' || v_entity_kind || ':' || v_history.task_id::text || ':' || v_logical_occurrence_part;
  v_qualified := v_history.status::text in ('done', 'complete', 'did_my_best');
  perform pg_advisory_xact_lock(hashtextextended(v_history.user_id::text || ':achievement-source:' || v_history.id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_history.user_id::text || ':achievement-occurrence:' || v_dedupe_key, 0));

  if v_history.created_at < v_profile.activated_at
    or v_history.entry_date < public.adhdice_achievement_logical_date(v_profile.activated_at, v_profile.timezone, v_profile.logical_day_start) then
    update public.adhdice_achievement_occurrences
      set is_currently_qualifying = false
      where user_id = v_history.user_id and source_kind = 'task_history' and source_id = v_history.id::text;
    return null;
  end if;

  if not v_qualified then
    update public.adhdice_achievement_occurrences
      set is_currently_qualifying = false,
          source_snapshot = source_snapshot || jsonb_build_object('last_corrected_status', v_history.status::text, 'last_corrected_at', v_history.updated_at)
      where user_id = v_history.user_id and source_kind = 'task_history' and source_id = v_history.id::text
      returning id into v_occurrence_id;
    return v_occurrence_id;
  end if;

  v_root_id := public.adhdice_achievement_root_parent(v_history.task_id, v_history.user_id);
  update public.adhdice_achievement_occurrences
    set source_occurrence_key = v_source_key,
        first_qualified_at = least(public.adhdice_achievement_occurrences.first_qualified_at, v_history.updated_at),
        title_snapshot = v_task.title,
        outcome_snapshot = v_history.status::text,
        is_currently_qualifying = true,
        source_created_at = least(coalesce(public.adhdice_achievement_occurrences.source_created_at, v_history.created_at), v_history.created_at),
        source_snapshot = jsonb_build_object('history_id', public.adhdice_achievement_occurrences.source_id, 'task_id', v_task.id, 'occurrence_key', v_history.occurrence_key,
          'occurrence_due_on', v_history.occurrence_due_on, 'entry_date', v_history.entry_date,
          'parent_task_id', v_task.parent_task_id, 'root_parent_id', v_root_id,
          'latest_history_id', v_history.id, 'logical_dedupe_key', v_dedupe_key),
        evaluator_version = 'achievements-evaluator-v1',
        catalog_version = v_profile.catalog_version
    where user_id = v_history.user_id and dedupe_key = v_dedupe_key
    returning id into v_occurrence_id;
  if v_occurrence_id is not null then return v_occurrence_id; end if;

  update public.adhdice_achievement_occurrences
    set source_occurrence_key = v_source_key,
        dedupe_key = v_dedupe_key,
        source_created_at = v_history.created_at,
        first_qualified_at = least(public.adhdice_achievement_occurrences.first_qualified_at, v_history.updated_at),
        logical_date = v_history.entry_date,
        week_key = v_history.entry_date - extract(isodow from v_history.entry_date)::integer + 1,
        week_start_date = v_history.entry_date - extract(isodow from v_history.entry_date)::integer + 1,
        week_end_date = v_history.entry_date - extract(isodow from v_history.entry_date)::integer + 7,
        month_key = to_char(v_history.entry_date, 'YYYY-MM'),
        month_start_date = date_trunc('month', v_history.entry_date)::date,
        month_end_date = (date_trunc('month', v_history.entry_date) + interval '1 month - 1 day')::date,
        entity_kind = v_entity_kind,
        entity_id = v_task.id,
        root_parent_id = case when v_task.parent_task_id is null then v_task.id else v_root_id end,
        title_snapshot = v_task.title,
        outcome_snapshot = v_history.status::text,
        is_currently_qualifying = true,
        source_snapshot = jsonb_build_object('history_id', v_history.id, 'task_id', v_task.id, 'occurrence_key', v_history.occurrence_key,
          'occurrence_due_on', v_history.occurrence_due_on, 'entry_date', v_history.entry_date,
          'parent_task_id', v_task.parent_task_id, 'root_parent_id', v_root_id,
          'logical_dedupe_key', v_dedupe_key),
        evaluator_version = 'achievements-evaluator-v1',
        catalog_version = v_profile.catalog_version
    where user_id = v_history.user_id and source_kind = 'task_history' and source_id = v_history.id::text
    returning id into v_occurrence_id;
  if v_occurrence_id is not null then return v_occurrence_id; end if;

  insert into public.adhdice_achievement_occurrences (
    user_id, source_kind, source_id, source_occurrence_key, dedupe_key,
    source_created_at, first_qualified_at, logical_date, week_key, week_start_date, week_end_date,
    month_key, month_start_date, month_end_date, timezone, logical_day_start,
    entity_kind, entity_id, root_parent_id, title_snapshot, outcome_snapshot,
    evaluator_version, catalog_version, is_currently_qualifying, source_snapshot
  ) values (
    v_history.user_id, 'task_history', v_history.id::text, v_source_key, v_dedupe_key,
    v_history.created_at, v_history.updated_at, v_history.entry_date,
    v_history.entry_date - extract(isodow from v_history.entry_date)::integer + 1,
    v_history.entry_date - extract(isodow from v_history.entry_date)::integer + 1,
    v_history.entry_date - extract(isodow from v_history.entry_date)::integer + 7,
    to_char(v_history.entry_date, 'YYYY-MM'), date_trunc('month', v_history.entry_date)::date,
    (date_trunc('month', v_history.entry_date) + interval '1 month - 1 day')::date,
    v_profile.timezone, v_profile.logical_day_start,
    v_entity_kind,
    v_task.id, case when v_task.parent_task_id is null then v_task.id else v_root_id end,
    v_task.title, v_history.status::text, 'achievements-evaluator-v1', v_profile.catalog_version, true,
    jsonb_build_object('history_id', v_history.id, 'task_id', v_task.id, 'occurrence_key', v_history.occurrence_key,
      'occurrence_due_on', v_history.occurrence_due_on, 'entry_date', v_history.entry_date,
      'parent_task_id', v_task.parent_task_id, 'root_parent_id', v_root_id,
      'logical_dedupe_key', v_dedupe_key)
  )
  on conflict (user_id, dedupe_key) do update set
    source_occurrence_key = excluded.source_occurrence_key,
    first_qualified_at = least(public.adhdice_achievement_occurrences.first_qualified_at, excluded.first_qualified_at),
    title_snapshot = excluded.title_snapshot,
    outcome_snapshot = excluded.outcome_snapshot,
    is_currently_qualifying = true,
    source_created_at = least(coalesce(public.adhdice_achievement_occurrences.source_created_at, excluded.source_created_at), excluded.source_created_at),
    source_snapshot = excluded.source_snapshot || jsonb_build_object('canonical_history_id', public.adhdice_achievement_occurrences.source_id, 'latest_history_id', excluded.source_id),
    evaluator_version = excluded.evaluator_version,
    catalog_version = excluded.catalog_version
  returning id into v_occurrence_id;
  return v_occurrence_id;
end;
$function$;

create or replace function public.adhdice_capture_focus_achievement_occurrence(p_session_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_session public.adhdice_focus_sessions%rowtype;
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_occurrence_id uuid;
begin
  select * into v_session from public.adhdice_focus_sessions where id = p_session_id;
  if not found then return null; end if;
  select * into v_profile from public.adhdice_achievement_profiles where user_id = v_session.user_id;
  if not found or v_session.created_at < v_profile.activated_at
    or v_session.session_date < public.adhdice_achievement_logical_date(v_profile.activated_at, v_profile.timezone, v_profile.logical_day_start)
    or v_session.duration_seconds < 1 then return null; end if;

  insert into public.adhdice_achievement_occurrences (
    user_id, source_kind, source_id, source_occurrence_key, dedupe_key,
    source_created_at, first_qualified_at, logical_date, week_key, week_start_date, week_end_date,
    month_key, month_start_date, month_end_date, timezone, logical_day_start,
    entity_kind, entity_id, title_snapshot, active_duration_seconds,
    evaluator_version, catalog_version, is_currently_qualifying, source_snapshot
  ) values (
    v_session.user_id, 'focus_session', v_session.id::text, 'focus-session:' || v_session.id::text,
    'occurrence:v1:focus_session:focus-session:' || v_session.id::text,
    v_session.created_at, v_session.created_at, v_session.session_date,
    v_session.session_date - extract(isodow from v_session.session_date)::integer + 1,
    v_session.session_date - extract(isodow from v_session.session_date)::integer + 1,
    v_session.session_date - extract(isodow from v_session.session_date)::integer + 7,
    to_char(v_session.session_date, 'YYYY-MM'), date_trunc('month', v_session.session_date)::date,
    (date_trunc('month', v_session.session_date) + interval '1 month - 1 day')::date,
    v_profile.timezone, v_profile.logical_day_start, 'focus_session', v_session.id,
    v_session.title_snapshot, v_session.duration_seconds, 'achievements-evaluator-v1', v_profile.catalog_version, true,
    jsonb_build_object('session_id', v_session.id, 'source', v_session.source, 'started_at', v_session.started_at,
      'ended_at', v_session.ended_at, 'session_date', v_session.session_date)
  )
  on conflict (user_id, source_kind, source_id) do update set
    active_duration_seconds = excluded.active_duration_seconds,
    title_snapshot = excluded.title_snapshot,
    source_snapshot = excluded.source_snapshot,
    is_currently_qualifying = true,
    evaluator_version = excluded.evaluator_version,
    catalog_version = excluded.catalog_version
  returning id into v_occurrence_id;
  return v_occurrence_id;
end;
$function$;

create or replace function public.adhdice_refresh_achievement_step_set(p_user_id uuid, p_root_parent_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_step_count integer;
  v_occurrence_count integer;
  v_step_ids jsonb;
  v_occurrence_ids jsonb;
  v_set_key text;
  v_qualified_at timestamptz;
  v_logical_date date;
  v_occurrence_id uuid;
  v_title text;
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id = p_user_id;
  if not found then return null; end if;
  update public.adhdice_achievement_occurrences step_set
    set is_currently_qualifying = false
    where step_set.user_id = p_user_id
      and step_set.source_kind = 'step_set'
      and step_set.root_parent_id = p_root_parent_id
      and step_set.is_currently_qualifying
      and exists (
        select 1
        from jsonb_array_elements_text(step_set.source_snapshot->'step_occurrence_ids') constituent(occurrence_id)
        join public.adhdice_achievement_occurrences source_occurrence
          on source_occurrence.id = constituent.occurrence_id::uuid
        where not source_occurrence.is_currently_qualifying
      );
  with recursive steps as (
    select id, parent_task_id from public.adhdice_clean_tasks
    where user_id = p_user_id and parent_task_id = p_root_parent_id
    union all
    select child.id, child.parent_task_id from public.adhdice_clean_tasks child
    join steps parent on child.parent_task_id = parent.id where child.user_id = p_user_id
  ), latest_candidate as (
    select distinct on (occ.entity_id) occ.entity_id, occ.id, occ.first_qualified_at, occ.logical_date,
      occ.is_currently_qualifying
    from public.adhdice_achievement_occurrences occ join steps on steps.id = occ.entity_id
    where occ.user_id = p_user_id and occ.entity_kind = 'step'
    order by occ.entity_id, occ.first_qualified_at desc, occ.id
  ), latest as (
    select entity_id, id, first_qualified_at, logical_date from latest_candidate
    where is_currently_qualifying
  )
  select (select count(*) from steps), count(latest.id),
    (select jsonb_agg(id order by id::text) from steps),
    jsonb_agg(latest.id order by latest.id::text), max(latest.first_qualified_at), max(latest.logical_date)
  into v_step_count, v_occurrence_count, v_step_ids, v_occurrence_ids, v_qualified_at, v_logical_date
  from latest;
  if v_step_count = 0 or v_occurrence_count <> v_step_count then return null; end if;
  v_set_key := 'parent-step-set:v1:' || p_root_parent_id::text || ':' || encode(extensions.digest(v_occurrence_ids::text, 'sha256'::text), 'hex');
  select title into v_title from public.adhdice_clean_tasks where id = p_root_parent_id and user_id = p_user_id;
  insert into public.adhdice_achievement_occurrences (
    user_id, source_kind, source_id, source_occurrence_key, dedupe_key, source_created_at,
    first_qualified_at, logical_date, week_key, week_start_date, week_end_date,
    month_key, month_start_date, month_end_date, timezone, logical_day_start,
    entity_kind, entity_id, root_parent_id, title_snapshot, outcome_snapshot,
    evaluator_version, catalog_version, source_snapshot
  ) values (
    p_user_id, 'step_set', encode(extensions.digest(v_set_key::text, 'sha256'::text), 'hex'), v_set_key,
    'occurrence:v1:step_set:' || v_set_key, v_qualified_at, v_qualified_at, v_logical_date,
    v_logical_date - extract(isodow from v_logical_date)::integer + 1,
    v_logical_date - extract(isodow from v_logical_date)::integer + 1,
    v_logical_date - extract(isodow from v_logical_date)::integer + 7,
    to_char(v_logical_date, 'YYYY-MM'), date_trunc('month', v_logical_date)::date,
    (date_trunc('month', v_logical_date) + interval '1 month - 1 day')::date,
    v_profile.timezone, v_profile.logical_day_start, 'parent_step_set', p_root_parent_id,
    p_root_parent_id, v_title, 'done', 'achievements-evaluator-v1', v_profile.catalog_version,
    jsonb_build_object('step_ids', v_step_ids, 'step_occurrence_ids', v_occurrence_ids)
  ) on conflict (user_id, dedupe_key) do update set is_currently_qualifying = true
  returning id into v_occurrence_id;
  return v_occurrence_id;
end;
$function$;

create or replace function public.adhdice_achievement_streak_metadata(
  p_user_id uuid, p_mode text, p_as_of date
) returns jsonb
language plpgsql stable
set search_path = ''
as $function$
declare v_result jsonb;
begin
  with qualified_days as (
    select logical_date from public.adhdice_achievement_occurrences
    where user_id = p_user_id and is_currently_qualifying and (
      (p_mode = 'parent' and entity_kind = 'parent_task') or
      (p_mode = 'moving' and entity_kind in ('parent_task', 'step'))
    ) group by logical_date
    union
    select logical_date from public.adhdice_achievement_occurrences
    where user_id = p_user_id and is_currently_qualifying and p_mode = 'focus' and entity_kind = 'focus_session'
    group by logical_date having sum(active_duration_seconds) >= 1800
  ), numbered as (
    select logical_date, logical_date - row_number() over (order by logical_date)::integer as run_key from qualified_days
  ), runs as (
    select min(logical_date) start_date, max(logical_date) end_date, count(*)::bigint length
    from numbered group by run_key
  ), best as (
    select * from runs order by length desc, end_date asc limit 1
  ), current_run as (
    select * from runs where end_date >= p_as_of - 1 order by end_date desc limit 1
  )
  select jsonb_build_object(
    'best', coalesce((select length from best), 0),
    'best_start', (select start_date from best), 'best_end', (select end_date from best),
    'current', coalesce((select length from current_run), 0),
    'current_start', (select start_date from current_run), 'current_end', (select end_date from current_run),
    'runs', coalesce((select jsonb_agg(jsonb_build_object('start',start_date,'end',end_date,'length',length) order by start_date) from runs), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.adhdice_achievement_thresholds()
returns table(track_id text, tier text, threshold_value bigint, tier_order integer)
language sql immutable
set search_path = ''
as $function$
  select * from (values
    ('i_can_count_to_ten','bronze',50,1),('i_can_count_to_ten','silver',100,2),('i_can_count_to_ten','gold',150,3),('i_can_count_to_ten','platinum',200,4),
    ('fifty_two_each_year','bronze',100,1),('fifty_two_each_year','silver',150,2),('fifty_two_each_year','gold',200,3),('fifty_two_each_year','platinum',250,4),
    ('twelve_each_year','bronze',500,1),('twelve_each_year','silver',600,2),('twelve_each_year','gold',800,3),('twelve_each_year','platinum',1000,4),
    ('count_on_me','bronze',1000,1),('count_on_me','silver',2000,2),('count_on_me','gold',3000,3),('count_on_me','platinum',6000,4),
    ('first_step','bronze',30,1),('first_step','silver',60,2),('first_step','gold',90,3),('first_step','platinum',100,4),
    ('second_step','bronze',100,1),('second_step','silver',200,2),('second_step','gold',300,3),('second_step','platinum',500,4),
    ('third_step','bronze',1000,1),('third_step','silver',2000,2),('third_step','gold',3000,3),('third_step','platinum',5000,4),
    ('last_step','bronze',1,1),('last_step','silver',50,2),('last_step','gold',75,3),('last_step','platinum',150,4),
    ('broken_clock','bronze',14400,1),('broken_clock','silver',28800,2),('broken_clock','gold',36000,3),('broken_clock','platinum',43200,4),
    ('overtime','bronze',72000,1),('overtime','silver',108000,2),('overtime','gold',144000,3),('overtime','platinum',180000,4),
    ('february_challenge','bronze',288000,1),('february_challenge','silver',432000,2),('february_challenge','gold',576000,3),('february_challenge','platinum',648000,4),
    ('locked_in','bronze',360000,1),('locked_in','silver',900000,2),('locked_in','gold',1800000,3),('locked_in','platinum',3600000,4),
    ('staring_contest','bronze',7200,1),('staring_contest','silver',10800,2),('staring_contest','gold',14400,3),('staring_contest','platinum',18000,4),
    ('session_possible','bronze',100,1),('session_possible','silver',250,2),('session_possible','gold',500,3),('session_possible','platinum',1000,4),
    ('do_something','bronze',3,1),('do_something','silver',7,2),('do_something','gold',30,3),('do_something','platinum',90,4),
    ('dont_get_distracted','bronze',3,1),('dont_get_distracted','silver',7,2),('dont_get_distracted','gold',30,3),('dont_get_distracted','platinum',90,4),
    ('this_week_on_the_streak','bronze',1,1),('this_week_on_the_streak','silver',2,2),('this_week_on_the_streak','gold',3,3),('this_week_on_the_streak','platinum',4,4),
    ('keep_it_moving','bronze',7,1),('keep_it_moving','silver',14,2),('keep_it_moving','gold',30,3),('keep_it_moving','platinum',90,4)
  ) threshold(track_id, tier, threshold_value, tier_order)
$function$;

create or replace function public.adhdice_rebuild_achievement_progress(
  p_user_id uuid, p_run_id uuid, p_awarded_at timestamptz
) returns void
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_today date;
  v_parent_streak jsonb;
  v_focus_streak jsonb;
  v_moving_streak jsonb;
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id = p_user_id;
  if not found then return; end if;
  v_today := public.adhdice_achievement_logical_date(clock_timestamp(), v_profile.timezone, v_profile.logical_day_start);
  v_parent_streak := public.adhdice_achievement_streak_metadata(p_user_id, 'parent', v_today);
  v_focus_streak := public.adhdice_achievement_streak_metadata(p_user_id, 'focus', v_today);
  v_moving_streak := public.adhdice_achievement_streak_metadata(p_user_id, 'moving', v_today);

  delete from public.adhdice_achievement_occurrence_matches where user_id = p_user_id;
  insert into public.adhdice_achievement_occurrence_matches (user_id, occurrence_id, track_id, catalog_version)
  select occurrence.user_id, occurrence.id, track.track_id, v_profile.catalog_version
  from public.adhdice_achievement_occurrences occurrence
  cross join lateral (values
    ('count_on_me'),('i_can_count_to_ten'),('fifty_two_each_year'),('twelve_each_year'),('do_something'),('this_week_on_the_streak'),('keep_it_moving')
  ) track(track_id)
  where occurrence.user_id = p_user_id and occurrence.is_currently_qualifying and occurrence.entity_kind = 'parent_task'
  union all
  select occurrence.user_id, occurrence.id, track.track_id, v_profile.catalog_version
  from public.adhdice_achievement_occurrences occurrence
  cross join lateral (values ('first_step'),('second_step'),('third_step'),('keep_it_moving')) track(track_id)
  where occurrence.user_id = p_user_id and occurrence.is_currently_qualifying and occurrence.entity_kind = 'step'
  union all
  select occurrence.user_id, occurrence.id, track.track_id, v_profile.catalog_version
  from public.adhdice_achievement_occurrences occurrence
  cross join lateral (values ('broken_clock'),('overtime'),('february_challenge'),('locked_in'),('staring_contest'),('session_possible'),('dont_get_distracted')) track(track_id)
  where occurrence.user_id = p_user_id and occurrence.is_currently_qualifying and occurrence.entity_kind = 'focus_session'
  union all
  select occurrence.user_id, occurrence.id, 'last_step', v_profile.catalog_version
  from public.adhdice_achievement_occurrences occurrence
  where occurrence.user_id = p_user_id and occurrence.is_currently_qualifying and occurrence.entity_kind = 'parent_step_set'
  on conflict (occurrence_id, track_id) do nothing;

  with values_by_track(track_id, current_value, streak) as (
    values
      ('i_can_count_to_ten', (select count(*) from (select logical_date from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_task' group by logical_date having count(*) >= 10) x), null::jsonb),
      ('fifty_two_each_year', coalesce((select max(total) from (select count(*) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_task' group by week_key) x),0), null),
      ('twelve_each_year', coalesce((select max(total) from (select count(*) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_task' group by month_key) x),0), null),
      ('count_on_me', (select count(*) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_task'), null),
      ('first_step', coalesce((select max(total) from (select count(*) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='step' group by logical_date) x),0), null),
      ('second_step', coalesce((select max(total) from (select count(*) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='step' group by week_key) x),0), null),
      ('third_step', (select count(*) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='step'), null),
      ('last_step', (select count(*) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_step_set'), null),
      ('broken_clock', coalesce((select max(total) from (select sum(active_duration_seconds) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session' group by logical_date) x),0), null),
      ('overtime', coalesce((select max(total) from (select sum(active_duration_seconds) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session' group by week_key) x),0), null),
      ('february_challenge', coalesce((select max(total) from (select sum(active_duration_seconds) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session' group by month_key) x),0), null),
      ('locked_in', coalesce((select sum(active_duration_seconds) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session'),0), null),
      ('staring_contest', coalesce((select max(active_duration_seconds) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session'),0), null),
      ('session_possible', (select count(*) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session' and active_duration_seconds >= 600), null),
      ('do_something', (v_parent_streak->>'best')::bigint, v_parent_streak),
      ('dont_get_distracted', (v_focus_streak->>'best')::bigint, v_focus_streak),
      ('this_week_on_the_streak', (select count(*) from (select week_key from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_task' and week_end_date < v_today group by week_key having count(distinct logical_date)=7) x), null),
      ('keep_it_moving', (v_moving_streak->>'best')::bigint, v_moving_streak)
  )
  insert into public.adhdice_achievement_progress (
    user_id, track_id, current_value, current_streak, best_streak,
    current_streak_start, current_streak_end, best_streak_start, best_streak_end,
    source_watermark, recalculation_metadata, evaluator_version, catalog_version, last_recalculated_at
  ) select p_user_id, track_id, current_value,
    coalesce((streak->>'current')::bigint,0), coalesce((streak->>'best')::bigint,0),
    (streak->>'current_start')::date, (streak->>'current_end')::date,
    (streak->>'best_start')::date, (streak->>'best_end')::date,
    jsonb_build_object('occurrence_count',(select count(*) from public.adhdice_achievement_occurrences where user_id=p_user_id)),
    jsonb_build_object('run_id',p_run_id,'streak_runs',coalesce(streak->'runs','[]'::jsonb)),
    'achievements-evaluator-v1', v_profile.catalog_version, p_awarded_at
  from values_by_track
  on conflict (user_id, track_id) do update set
    current_value=excluded.current_value, current_streak=excluded.current_streak, best_streak=excluded.best_streak,
    current_streak_start=excluded.current_streak_start, current_streak_end=excluded.current_streak_end,
    best_streak_start=excluded.best_streak_start, best_streak_end=excluded.best_streak_end,
    source_watermark=excluded.source_watermark, recalculation_metadata=excluded.recalculation_metadata,
    evaluator_version=excluded.evaluator_version, catalog_version=excluded.catalog_version,
    last_recalculated_at=excluded.last_recalculated_at;

  insert into public.adhdice_achievement_tier_awards (
    user_id, track_id, tier, award_key, earned_at, evaluation_run_id, evaluator_version, catalog_version
  ) select p_user_id, threshold.track_id, threshold.tier,
    'tier-award:v1:' || threshold.track_id || ':' || threshold.tier,
    p_awarded_at + (threshold.tier_order * interval '1 microsecond'), p_run_id,
    'achievements-evaluator-v1', v_profile.catalog_version
  from public.adhdice_achievement_thresholds() threshold
  join public.adhdice_achievement_progress progress
    on progress.user_id=p_user_id and progress.track_id=threshold.track_id
  where progress.current_value >= threshold.threshold_value
  order by threshold.track_id, threshold.tier_order
  on conflict (user_id, track_id, tier) do nothing;

  insert into public.adhdice_achievement_collection_awards (
    user_id, collection_id, mastery_version, catalog_version, award_key,
    required_track_ids_snapshot, required_tracks_fingerprint, earned_at, evaluation_run_id
  )
  select p_user_id, collection_id, v_profile.launch_mastery_version, v_profile.catalog_version,
    'collection-award:v1:' || collection_id || ':' || v_profile.launch_mastery_version,
    required_tracks, encode(extensions.digest(required_tracks::text, 'sha256'::text), 'hex'), p_awarded_at + interval '10 microseconds', p_run_id
  from (values
    ('you_can_count_on_me', '["i_can_count_to_ten","fifty_two_each_year","twelve_each_year","count_on_me"]'::jsonb),
    ('one_step_at_a_time', '["first_step","second_step","third_step","last_step"]'::jsonb),
    ('clocked_in', '["broken_clock","overtime","february_challenge","locked_in","staring_contest","session_possible"]'::jsonb),
    ('were_going_streaking', '["do_something","dont_get_distracted","this_week_on_the_streak","keep_it_moving"]'::jsonb)
  ) collection(collection_id, required_tracks)
  where not exists (
    select 1 from jsonb_array_elements_text(required_tracks) required(track_id)
    where not exists (select 1 from public.adhdice_achievement_tier_awards award
      where award.user_id=p_user_id and award.track_id=required.track_id and award.tier='platinum')
  ) on conflict (user_id, collection_id, mastery_version) do nothing;

  insert into public.adhdice_achievement_notifications (user_id, award_kind, tier_award_id, dedupe_key)
  select p_user_id, 'tier', id, 'notification:v1:' || award_key
  from public.adhdice_achievement_tier_awards where user_id=p_user_id
  on conflict (user_id, dedupe_key) do nothing;
  insert into public.adhdice_achievement_notifications (user_id, award_kind, collection_award_id, dedupe_key)
  select p_user_id, 'collection', id, 'notification:v1:' || award_key
  from public.adhdice_achievement_collection_awards where user_id=p_user_id
  on conflict (user_id, dedupe_key) do nothing;
end;
$function$;

create or replace function public.adhdice_evaluate_achievements(
  p_user_id uuid, p_operation_id uuid, p_mode text default 'immediate'
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_run public.adhdice_achievement_evaluation_runs%rowtype;
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id=p_user_id;
  if not found then return jsonb_build_object('status','inactive'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':achievement-evaluation',0));
  select * into v_run from public.adhdice_achievement_evaluation_runs where user_id=p_user_id and operation_id=p_operation_id;
  if found and v_run.status='completed' then return jsonb_build_object('status','completed','run_id',v_run.id,'replayed',true); end if;
  insert into public.adhdice_achievement_evaluation_runs (
    operation_id,user_id,mode,status,catalog_version,rules_version
  ) values (p_operation_id,p_user_id,p_mode,'running',v_profile.catalog_version,v_profile.rules_version)
  on conflict (user_id,operation_id) do update set status='running',completed_at=null,error_code=null,error_message=null
  returning * into v_run;
  begin
    perform public.adhdice_rebuild_achievement_progress(p_user_id,v_run.id,v_now);
    update public.adhdice_achievement_evaluation_runs set status='completed',completed_at=clock_timestamp()
      where id=v_run.id;
    return jsonb_build_object('status','completed','run_id',v_run.id,'replayed',false);
  exception when others then
    update public.adhdice_achievement_evaluation_runs set status='failed',completed_at=clock_timestamp(),
      error_code=left(sqlstate,80),error_message=left(sqlerrm,500) where id=v_run.id;
    return jsonb_build_object('status','failed','error_code',sqlstate);
  end;
end;
$function$;

create or replace function public.adhdice_record_achievement_evaluation_failure(
  p_user_id uuid, p_operation_id uuid, p_mode text, p_error_code text, p_error_message text
) returns void
language plpgsql security definer
set search_path = ''
as $function$
declare v_profile public.adhdice_achievement_profiles%rowtype;
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id=p_user_id;
  if not found then return; end if;
  insert into public.adhdice_achievement_evaluation_runs (
    operation_id,user_id,mode,status,catalog_version,rules_version,error_code,error_message,completed_at
  ) values (
    p_operation_id,p_user_id,p_mode,'failed',v_profile.catalog_version,v_profile.rules_version,
    left(coalesce(p_error_code,'P0001'),80),left(coalesce(p_error_message,'Achievement evaluation failed.'),500),clock_timestamp()
  ) on conflict (user_id,operation_id) do update set
    status='failed',completed_at=excluded.completed_at,error_code=excluded.error_code,error_message=excluded.error_message;
end;
$function$;

create or replace function public.adhdice_capture_and_evaluate_achievement_source()
returns trigger
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_operation_id uuid;
  v_occurrence_id uuid;
  v_root_id uuid;
begin
  v_user_id := new.user_id;
  v_operation_id := md5(tg_table_name || ':' || new.id::text || ':' || to_jsonb(new)::text)::uuid;
  begin
    if tg_table_name='adhdice_task_history' then
      v_occurrence_id := public.adhdice_capture_task_achievement_occurrence(new.id);
      if v_occurrence_id is not null then
        select root_parent_id into v_root_id from public.adhdice_achievement_occurrences where id=v_occurrence_id;
        if v_root_id is not null then perform public.adhdice_refresh_achievement_step_set(v_user_id,v_root_id); end if;
      end if;
    else
      perform public.adhdice_capture_focus_achievement_occurrence(new.id);
    end if;
    perform public.adhdice_evaluate_achievements(v_user_id,v_operation_id,'immediate');
  exception when others then
    -- Source history remains authoritative; a later resumable recalculation repairs capture.
    perform public.adhdice_record_achievement_evaluation_failure(v_user_id,v_operation_id,'immediate',sqlstate,sqlerrm);
  end;
  return new;
end;
$function$;

drop trigger if exists adhdice_capture_task_achievement_runtime on public.adhdice_task_history;
create trigger adhdice_capture_task_achievement_runtime
  after insert or update of status, was_completed, occurrence_key, occurrence_due_on
  on public.adhdice_task_history for each row
  execute function public.adhdice_capture_and_evaluate_achievement_source();

drop trigger if exists adhdice_capture_focus_achievement_runtime on public.adhdice_focus_sessions;
create trigger adhdice_capture_focus_achievement_runtime
  after insert or update of duration_seconds, session_date, title_snapshot, ended_at
  on public.adhdice_focus_sessions for each row
  execute function public.adhdice_capture_and_evaluate_achievement_source();

create or replace function public.adhdice_deactivate_deleted_achievement_source()
returns trigger
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_operation_id uuid := md5(tg_table_name || ':delete:' || old.id::text || ':' || to_jsonb(old)::text)::uuid;
  v_occurrence public.adhdice_achievement_occurrences%rowtype;
begin
  begin
    if tg_table_name = 'adhdice_task_history'
      and not exists (select 1 from public.adhdice_clean_tasks where id=old.task_id and user_id=old.user_id) then
      return old;
    end if;
    select * into v_occurrence from public.adhdice_achievement_occurrences
      where user_id=old.user_id
        and source_kind=case when tg_table_name='adhdice_task_history' then 'task_history' else 'focus_session' end
        and source_id=old.id::text;
    if found then
      update public.adhdice_achievement_occurrences set is_currently_qualifying=false where id=v_occurrence.id;
      if v_occurrence.root_parent_id is not null then
        perform public.adhdice_refresh_achievement_step_set(old.user_id,v_occurrence.root_parent_id);
      end if;
      perform public.adhdice_evaluate_achievements(old.user_id,v_operation_id,'immediate');
    end if;
  exception when others then
    perform public.adhdice_record_achievement_evaluation_failure(old.user_id,v_operation_id,'immediate',sqlstate,sqlerrm);
  end;
  return old;
end;
$function$;

drop trigger if exists adhdice_deactivate_deleted_task_achievement_runtime on public.adhdice_task_history;
create trigger adhdice_deactivate_deleted_task_achievement_runtime
  after delete on public.adhdice_task_history for each row
  execute function public.adhdice_deactivate_deleted_achievement_source();
drop trigger if exists adhdice_deactivate_deleted_focus_achievement_runtime on public.adhdice_focus_sessions;
create trigger adhdice_deactivate_deleted_focus_achievement_runtime
  after delete on public.adhdice_focus_sessions for each row
  execute function public.adhdice_deactivate_deleted_achievement_source();

create or replace function public.adhdice_recalculate_achievements(
  p_operation_id uuid, p_cursor jsonb default '{}'::jsonb, p_batch_size integer default 500
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_run public.adhdice_achievement_evaluation_runs%rowtype;
  v_record record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_last_created_at timestamptz := coalesce((p_cursor->>'created_at')::timestamptz,'-infinity'::timestamptz);
  v_last_kind text := coalesce(p_cursor->>'source_kind','');
  v_last_id uuid := coalesce((p_cursor->>'source_id')::uuid,'00000000-0000-0000-0000-000000000000'::uuid);
  v_next_cursor jsonb := p_cursor;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null or p_batch_size < 1 or p_batch_size > 2000 then raise exception 'Invalid recalculation request'; end if;
  select * into v_profile from public.adhdice_achievement_profiles where user_id=v_user_id;
  if not found then raise exception 'Achievement profile is not activated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':achievement-evaluation',0));
  insert into public.adhdice_achievement_evaluation_runs (
    operation_id,user_id,mode,status,catalog_version,rules_version,cursor_metadata,window_metadata
  ) values (
    p_operation_id,v_user_id,'recalculation','running',v_profile.catalog_version,v_profile.rules_version,p_cursor,
    jsonb_build_object('activated_at',v_profile.activated_at,'activation_logical_date',
      public.adhdice_achievement_logical_date(v_profile.activated_at,v_profile.timezone,v_profile.logical_day_start))
  )
  on conflict (user_id,operation_id) do update set status='running',completed_at=null,error_code=null,error_message=null,
    cursor_metadata=p_cursor,window_metadata=excluded.window_metadata
  returning * into v_run;

  begin
  update public.adhdice_achievement_occurrences occurrence set is_currently_qualifying=false
    where occurrence.user_id=v_user_id and occurrence.source_kind='focus_session'
      and not exists (select 1 from public.adhdice_focus_sessions session where session.id=occurrence.source_id::uuid and session.user_id=v_user_id);
  update public.adhdice_achievement_occurrences occurrence set is_currently_qualifying=false
    where occurrence.user_id=v_user_id and occurrence.source_kind='task_history'
      and exists (select 1 from public.adhdice_clean_tasks task where task.id=occurrence.entity_id and task.user_id=v_user_id)
      and not exists (select 1 from public.adhdice_task_history history where history.id=occurrence.source_id::uuid and history.user_id=v_user_id);
  for v_record in
    with sources as (
      select history.created_at,'task_history'::text source_kind,history.id source_id
      from public.adhdice_task_history history
      where history.user_id=v_user_id and history.created_at>=v_profile.activated_at
        and history.entry_date>=public.adhdice_achievement_logical_date(v_profile.activated_at,v_profile.timezone,v_profile.logical_day_start)
      union all
      select session.created_at,'focus_session',session.id
      from public.adhdice_focus_sessions session
      where session.user_id=v_user_id and session.created_at>=v_profile.activated_at
        and session.session_date>=public.adhdice_achievement_logical_date(v_profile.activated_at,v_profile.timezone,v_profile.logical_day_start)
    )
    select * from sources
    where (created_at,source_kind,source_id)>(v_last_created_at,v_last_kind,v_last_id)
    order by created_at,source_kind,source_id limit p_batch_size+1
  loop
    if v_count=p_batch_size then v_has_more:=true; exit; end if;
    if v_record.source_kind='task_history' then
      perform public.adhdice_capture_task_achievement_occurrence(v_record.source_id);
    else perform public.adhdice_capture_focus_achievement_occurrence(v_record.source_id); end if;
    v_count:=v_count+1;
    v_next_cursor:=jsonb_build_object('created_at',v_record.created_at,'source_kind',v_record.source_kind,'source_id',v_record.source_id);
  end loop;

  for v_record in select distinct root_parent_id from public.adhdice_achievement_occurrences
    where user_id=v_user_id and entity_kind='step' and is_currently_qualifying and root_parent_id is not null
  loop perform public.adhdice_refresh_achievement_step_set(v_user_id,v_record.root_parent_id); end loop;
  perform public.adhdice_rebuild_achievement_progress(v_user_id,v_run.id,clock_timestamp());
  update public.adhdice_achievement_evaluation_runs set cursor_metadata=v_next_cursor,
    status=case when v_has_more then 'running' else 'completed' end,
    completed_at=case when v_has_more then null else clock_timestamp() end
  where id=v_run.id;
  return jsonb_build_object('status',case when v_has_more then 'running' else 'completed' end,
    'run_id',v_run.id,'processed',v_count,'has_more',v_has_more,'next_cursor',v_next_cursor);
  exception when others then
    update public.adhdice_achievement_evaluation_runs
    set status='failed',completed_at=clock_timestamp(),error_code=left(sqlstate,80),error_message=left(sqlerrm,500)
    where id=v_run.id;
    return jsonb_build_object('status','failed','error_code',sqlstate);
  end;
end;
$function$;

revoke all on function public.adhdice_recalculate_achievements(uuid,jsonb,integer) from public,anon;
grant execute on function public.adhdice_recalculate_achievements(uuid,jsonb,integer) to authenticated;
revoke all on function public.adhdice_evaluate_achievements(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.adhdice_capture_task_achievement_occurrence(uuid) from public,anon,authenticated;
revoke all on function public.adhdice_capture_focus_achievement_occurrence(uuid) from public,anon,authenticated;
revoke all on function public.adhdice_achievement_root_parent(uuid,uuid) from public,anon,authenticated;
revoke all on function public.adhdice_refresh_achievement_step_set(uuid,uuid) from public,anon,authenticated;
revoke all on function public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.adhdice_record_achievement_evaluation_failure(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.adhdice_capture_and_evaluate_achievement_source() from public,anon,authenticated;
revoke all on function public.adhdice_deactivate_deleted_achievement_source() from public,anon,authenticated;

notify pgrst, 'reload schema';
commit;

-- Qualify Achievement runtime pgcrypto calls for functions with an empty search path.
-- Apply after add_achievement_mvp_foundation.sql and add_achievement_mvp_runtime.sql.
-- Safe to reapply: CREATE OR REPLACE preserves tables, rows, ownership, and grants.
begin;

do $migration$
declare
  v_signature text;
  v_target regprocedure;
  v_targets regprocedure[] := array[]::regprocedure[];
  v_definition text;
  v_rewritten text;
begin
  foreach v_signature in array array[
    'public.adhdice_refresh_achievement_step_set(uuid,uuid)',
    'public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamp with time zone)'
  ] loop
    v_target := to_regprocedure(v_signature);
    if v_target is null then
      raise exception 'Required Achievement runtime function is missing: %', v_signature;
    end if;
    v_targets := array_append(v_targets, v_target);
  end loop;

  foreach v_target in array v_targets loop
    v_signature := v_target::text;
    select pg_get_functiondef(v_target) into v_definition;
    v_rewritten := regexp_replace(
      v_definition,
      '(^|[^[:alnum:]_.])digest[[:space:]]*\(',
      '\1extensions.digest(',
      'g'
    );
    v_rewritten := replace(
      replace(
        replace(
          v_rewritten,
          'extensions.digest(v_occurrence_ids::text, ''sha256'')',
          'extensions.digest(v_occurrence_ids::text, ''sha256''::text)'
        ),
        'extensions.digest(v_set_key, ''sha256'')',
        'extensions.digest(v_set_key::text, ''sha256''::text)'
      ),
      'extensions.digest(required_tracks::text,''sha256'')',
      'extensions.digest(required_tracks::text, ''sha256''::text)'
    );

    if v_rewritten ~ '(^|[^[:alnum:]_.])digest[[:space:]]*\(' then
      raise exception 'Unqualified digest call remains in %', v_signature;
    end if;

    execute v_rewritten;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
commit;

-- Restore parent Step-set qualification from authoritative current Step occurrences.
-- Apply after add_achievement_mvp_runtime.sql.
-- Safe to reapply: CREATE OR REPLACE preserves existing rows, ownership, and grants.
begin;

create or replace function public.adhdice_refresh_achievement_step_set(p_user_id uuid, p_root_parent_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_step_count integer;
  v_occurrence_count integer;
  v_step_ids jsonb;
  v_occurrence_ids jsonb;
  v_set_key text;
  v_qualified_at timestamptz;
  v_logical_date date;
  v_occurrence_id uuid;
  v_title text;
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id = p_user_id;
  if not found then return null; end if;
  update public.adhdice_achievement_occurrences step_set
    set is_currently_qualifying = false
    where step_set.user_id = p_user_id
      and step_set.source_kind = 'step_set'
      and step_set.root_parent_id = p_root_parent_id
      and step_set.is_currently_qualifying
      and exists (
        select 1
        from jsonb_array_elements_text(step_set.source_snapshot->'step_occurrence_ids') constituent(occurrence_id)
        join public.adhdice_achievement_occurrences source_occurrence
          on source_occurrence.id = constituent.occurrence_id::uuid
        where not source_occurrence.is_currently_qualifying
      );
  with recursive steps as (
    select id, parent_task_id from public.adhdice_clean_tasks
    where user_id = p_user_id and parent_task_id = p_root_parent_id
    union all
    select child.id, child.parent_task_id from public.adhdice_clean_tasks child
    join steps parent on child.parent_task_id = parent.id where child.user_id = p_user_id
  ), latest_candidate as (
    select distinct on (occ.entity_id) occ.entity_id, occ.id, occ.first_qualified_at, occ.logical_date,
      occ.is_currently_qualifying
    from public.adhdice_achievement_occurrences occ join steps on steps.id = occ.entity_id
    where occ.user_id = p_user_id and occ.entity_kind = 'step'
    order by occ.entity_id, occ.first_qualified_at desc, occ.id
  ), latest as (
    select entity_id, id, first_qualified_at, logical_date from latest_candidate
    where is_currently_qualifying
  )
  select (select count(*) from steps), count(latest.id),
    (select jsonb_agg(id order by id::text) from steps),
    jsonb_agg(latest.id order by latest.id::text), max(latest.first_qualified_at), max(latest.logical_date)
  into v_step_count, v_occurrence_count, v_step_ids, v_occurrence_ids, v_qualified_at, v_logical_date
  from latest;
  if v_step_count = 0 or v_occurrence_count <> v_step_count then return null; end if;
  v_set_key := 'parent-step-set:v1:' || p_root_parent_id::text || ':' || encode(extensions.digest(v_occurrence_ids::text, 'sha256'::text), 'hex');
  select title into v_title from public.adhdice_clean_tasks where id = p_root_parent_id and user_id = p_user_id;
  insert into public.adhdice_achievement_occurrences (
    user_id, source_kind, source_id, source_occurrence_key, dedupe_key, source_created_at,
    first_qualified_at, logical_date, week_key, week_start_date, week_end_date,
    month_key, month_start_date, month_end_date, timezone, logical_day_start,
    entity_kind, entity_id, root_parent_id, title_snapshot, outcome_snapshot,
    evaluator_version, catalog_version, source_snapshot
  ) values (
    p_user_id, 'step_set', encode(extensions.digest(v_set_key::text, 'sha256'::text), 'hex'), v_set_key,
    'occurrence:v1:step_set:' || v_set_key, v_qualified_at, v_qualified_at, v_logical_date,
    v_logical_date - extract(isodow from v_logical_date)::integer + 1,
    v_logical_date - extract(isodow from v_logical_date)::integer + 1,
    v_logical_date - extract(isodow from v_logical_date)::integer + 7,
    to_char(v_logical_date, 'YYYY-MM'), date_trunc('month', v_logical_date)::date,
    (date_trunc('month', v_logical_date) + interval '1 month - 1 day')::date,
    v_profile.timezone, v_profile.logical_day_start, 'parent_step_set', p_root_parent_id,
    p_root_parent_id, v_title, 'done', 'achievements-evaluator-v1', v_profile.catalog_version,
    jsonb_build_object('step_ids', v_step_ids, 'step_occurrence_ids', v_occurrence_ids)
  ) on conflict (user_id, dedupe_key) do update set is_currently_qualifying = true
  returning id into v_occurrence_id;
  return v_occurrence_id;
end;
$function$;

notify pgrst, 'reload schema';
commit;

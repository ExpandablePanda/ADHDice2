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

create extension if not exists pgcrypto;

create type public.adhdice_clean_task_status as enum ('pending', 'in_progress', 'done', 'missed', 'did_my_best', 'upcoming', 'not_due', 'delayed', 'archived', 'trashed', 'complete');
create type public.adhdice_clean_task_priority as enum ('low', 'normal', 'high');
create type public.adhdice_clean_task_energy as enum ('none', 'low', 'medium', 'high');
create type public.adhdice_clean_task_repeat_frequency as enum ('none', 'daily', 'weekly', 'monthly', 'custom', 'daily_until_complete');
create type public.adhdice_clean_task_repeat_monthly_mode as enum ('day_of_month', 'ordinal_weekday');
create type public.adhdice_clean_task_repeat_monthly_ordinal as enum ('first', 'second', 'third', 'fourth', 'last');
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

create table public.adhdice_task_list_folders (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  parent_folder_id uuid,
  sort_order bigint not null default 0,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint adhdice_task_list_folders_name_check
    check (name = trim(name) and char_length(name) between 1 and 120),
  constraint adhdice_task_list_folders_not_self_check
    check (parent_folder_id is null or parent_folder_id <> id),
  constraint adhdice_task_list_folders_parent_fkey
    foreign key (user_id, parent_folder_id)
    references public.adhdice_task_list_folders(user_id, id)
    on delete restrict
);

create table public.adhdice_task_list_containers (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  folder_id uuid,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint adhdice_task_list_containers_folder_fkey
    foreign key (user_id, folder_id)
    references public.adhdice_task_list_folders(user_id, id)
    on delete restrict,
  unique (user_id, folder_id)
);

create table public.adhdice_task_lists (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  built_in_key text,
  folder_id uuid,
  name text not null check (char_length(trim(name)) > 0),
  list_type text not null default 'custom' check (list_type in ('system', 'smart', 'custom')),
  membership_mode text not null default 'manual' check (membership_mode in ('manual', 'rules', 'hybrid')),
  is_deletable boolean not null default true,
  is_editable boolean not null default true,
  is_visible boolean not null default true,
  revision bigint not null default 0,
  sort_order bigint not null default 0,
  rules_json text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint adhdice_task_lists_folder_fkey
    foreign key (user_id, folder_id)
    references public.adhdice_task_list_folders(user_id, id)
    on delete restrict
);

create table public.adhdice_task_list_rail_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  item_type text not null check (item_type in ('list', 'folder')),
  entity_id uuid,
  container_folder_id uuid,
  sort_order integer not null default 0 check (sort_order between 0 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key),
  constraint adhdice_task_list_rail_items_container_fk
    foreign key (user_id, container_folder_id)
    references public.adhdice_task_list_folders(user_id, id)
    on delete restrict,
  constraint adhdice_task_list_rail_items_identity_check check (
    (item_type = 'folder' and entity_id is not null and item_key = 'folder:' || entity_id::text)
    or
    (item_type = 'list' and (
      (entity_id is null and item_key like 'system:%')
      or (entity_id is not null and item_key = 'list:' || entity_id::text)
    ))
  )
);

create table public.adhdice_task_list_manual_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  list_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, task_id, list_id)
);

create table public.adhdice_record_current (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rules_version text not null check (rules_version ~ '^records-v[1-9][0-9]*$'),
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  scope_kind text not null check (scope_kind in ('global', 'task')),
  scope_id text,
  title_snapshot text,
  value bigint not null check (value >= 0),
  unit text not null check (unit in ('tasks', 'steps', 'days', 'seconds', 'sessions', 'occurrences')),
  credited_date date not null,
  period_key text,
  period_start date,
  period_end date,
  candidate_identity text not null check (char_length(candidate_identity) between 1 and 1000),
  first_achieved_at timestamptz not null,
  evidence_fingerprint text not null check (char_length(evidence_fingerprint) between 1 and 200),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  timezone text not null check (char_length(timezone) between 1 and 100),
  logical_day_start time not null,
  recalculated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope_kind = 'global' and scope_id is null) or (scope_kind = 'task' and nullif(btrim(scope_id), '') is not null)),
  check ((period_start is null and period_end is null) or (period_start is not null and period_end is not null and period_end >= period_start))
);

create table public.adhdice_record_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rules_version text not null check (rules_version ~ '^records-v[1-9][0-9]*$'),
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  scope_kind text not null check (scope_kind in ('global', 'task')),
  scope_id text,
  title_snapshot text,
  event_kind text not null check (event_kind in ('break', 'tie')),
  value bigint not null check (value >= 0),
  unit text not null check (unit in ('tasks', 'steps', 'days', 'seconds', 'sessions', 'occurrences')),
  credited_date date not null,
  period_key text,
  period_start date,
  period_end date,
  event_identity text not null check (char_length(event_identity) between 1 and 200),
  candidate_identity text not null check (char_length(candidate_identity) between 1 and 1000),
  evidence_fingerprint text not null check (char_length(evidence_fingerprint) between 1 and 200),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  first_qualified_at timestamptz not null,
  first_achieved_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 100),
  logical_day_start time not null,
  validity_state text not null default 'valid' check (validity_state in ('valid', 'invalid', 'superseded')),
  invalidated_at timestamptz,
  invalidation_reason text,
  superseded_by_event_identity text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, rules_version, event_identity),
  check ((scope_kind = 'global' and scope_id is null) or (scope_kind = 'task' and nullif(btrim(scope_id), '') is not null)),
  check ((period_start is null and period_end is null) or (period_start is not null and period_end is not null and period_end >= period_start))
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

create table public.adhdice_home_todo_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"schemaVersion":1,"taskIds":[],"clientUpdatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb,
  client_updated_at timestamptz not null default '1970-01-01T00:00:00Z'::timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_home_todo_state_object check (jsonb_typeof(state) = 'object')
);

create table public.adhdice_brainstorm_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source_markdown text not null default '',
  answers jsonb not null default '{}'::jsonb,
  qa_state jsonb not null default '{"schemaVersion":1,"activeSessionId":null,"sessions":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  constraint adhdice_brainstorm_state_answers_object check (jsonb_typeof(answers) = 'object'),
  constraint adhdice_brainstorm_state_qa_state_object check (jsonb_typeof(qa_state) = 'object')
);

create table public.adhdice_health_profiles (
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
  workout_type_options text[] not null default array['Walking', 'Running', 'Strength Training', 'Cycling', 'Cardio', 'Stretching', 'Sports', 'Standing', 'Other']::text[],
  workout_title_options text[] not null default '{}',
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
  category text,
  food_category text not null default 'Uncategorized'
    check (char_length(trim(food_category)) > 0),
  serving_label text,
  serving_size text,
  serving_quantity numeric not null default 1
    check (serving_quantity > 0),
  serving_unit text not null default 'serving'
    check (char_length(trim(serving_unit)) > 0),
  serving_measure_value numeric
    check (serving_measure_value is null or serving_measure_value > 0),
  serving_measure_unit text
    check (serving_measure_unit is null or serving_measure_unit in ('g', 'oz', 'ml', 'fl_oz')),
  serving_weight_amount numeric(9,2)
    check (serving_weight_amount is null or serving_weight_amount > 0),
  serving_weight_unit text
    check (serving_weight_unit is null or serving_weight_unit in ('g', 'oz', 'fl_oz')),
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

create table public.adhdice_health_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  notes text not null default '',
  servings numeric(7,2) not null default 1 check (servings > 0),
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.adhdice_health_saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  default_meal_slot text not null default 'breakfast'
    check (default_meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.adhdice_health_water_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  logged_at timestamptz not null default now(),
  amount numeric(8,2) not null check (amount > 0),
  unit text not null check (unit in ('cup', 'fl_oz')),
  amount_ml numeric(10,2) not null check (amount_ml > 0),
  created_at timestamptz not null default now()
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
  source_food_id text,
  consumed_quantity numeric
    check (consumed_quantity is null or consumed_quantity > 0),
  consumed_unit text
    check (consumed_unit is null or char_length(trim(consumed_unit)) > 0),
  serving_fraction numeric
    check (serving_fraction is null or serving_fraction > 0),
  food_snapshot jsonb,
  nutrition_snapshot jsonb,
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

create table public.adhdice_health_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null check (duration_seconds > 0),
  title text not null check (char_length(trim(title)) > 0),
  workout_type text not null check (char_length(trim(workout_type)) > 0),
  active_calories numeric check (active_calories is null or active_calories >= 0),
  notes text not null default '',
  source text not null default 'manual',
  source_external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.adhdice_health_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  default_measurement text not null check (default_measurement in ('reps', 'duration')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.adhdice_health_workout_exercises (
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

create table public.adhdice_health_workout_sets (
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

create table public.adhdice_health_fitness_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  starts_on date not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.adhdice_health_fitness_plan_items (
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

create table public.adhdice_health_workout_plan_item_links (
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
create index adhdice_task_list_folders_container_order_idx
  on public.adhdice_task_list_folders (user_id, parent_folder_id, sort_order, id);
create unique index adhdice_task_list_containers_root_uidx
  on public.adhdice_task_list_containers (user_id)
  where folder_id is null;
create index adhdice_task_lists_container_order_idx
  on public.adhdice_task_lists (user_id, folder_id, sort_order, id);
create index adhdice_task_list_rail_items_container_order_idx
  on public.adhdice_task_list_rail_items (user_id, container_folder_id, sort_order, item_key);
create index adhdice_task_list_manual_memberships_user_task_idx
  on public.adhdice_task_list_manual_memberships (user_id, task_id, list_id);
create unique index adhdice_record_current_owner_scope_uidx
  on public.adhdice_record_current (user_id, rules_version, metric_key, scope_kind, coalesce(scope_id, ''));
create index adhdice_record_current_owner_idx
  on public.adhdice_record_current (user_id, rules_version, metric_key);
create index adhdice_record_events_owner_history_idx
  on public.adhdice_record_events (user_id, rules_version, validity_state, credited_date desc, created_at desc);
create index adhdice_record_events_owner_scope_idx
  on public.adhdice_record_events (user_id, metric_key, scope_kind, scope_id);
create index adhdice_record_events_owner_valid_identity_idx
  on public.adhdice_record_events (user_id, rules_version, event_identity)
  where validity_state = 'valid';
create index adhdice_task_grid_layouts_updated_at_idx
  on public.adhdice_task_grid_layouts (updated_at desc);
create index adhdice_health_checkins_user_date_idx
  on public.adhdice_health_checkins (user_id, entry_date desc, updated_at desc);
create index adhdice_health_food_library_user_updated_idx
  on public.adhdice_health_food_library (user_id, updated_at desc, created_at desc);
create index adhdice_health_recipes_user_updated_idx
  on public.adhdice_health_recipes (user_id, updated_at desc);
create index adhdice_health_saved_meals_user_updated_idx
  on public.adhdice_health_saved_meals (user_id, updated_at desc);
create index adhdice_health_water_entries_user_date_idx
  on public.adhdice_health_water_entries (user_id, entry_date desc, logged_at desc);
create index adhdice_health_meal_entries_user_date_idx
  on public.adhdice_health_meal_entries (user_id, entry_date desc, logged_at desc);
create index adhdice_health_weight_entries_user_date_idx
  on public.adhdice_health_weight_entries (user_id, entry_date desc, logged_at desc);
create index adhdice_health_metric_entries_user_date_idx
  on public.adhdice_health_metric_entries (user_id, metric_date desc, metric_type);
create index adhdice_health_workouts_user_date_idx
  on public.adhdice_health_workouts (user_id, workout_date desc, started_at desc, created_at desc);
create unique index adhdice_health_workouts_user_source_external_id_idx
  on public.adhdice_health_workouts (user_id, source, source_external_id)
  where source_external_id is not null;
create index adhdice_health_exercises_user_active_name_idx
  on public.adhdice_health_exercises (user_id, archived_at, name);
create index adhdice_health_workout_exercises_user_workout_order_idx
  on public.adhdice_health_workout_exercises (user_id, workout_id, sort_order, created_at);
create index adhdice_health_workout_sets_user_exercise_order_idx
  on public.adhdice_health_workout_sets (user_id, workout_exercise_id, sort_order, created_at);
create index adhdice_health_fitness_plans_user_active_idx
  on public.adhdice_health_fitness_plans (user_id, archived_at, starts_on);
create index adhdice_health_fitness_plan_items_user_schedule_idx
  on public.adhdice_health_fitness_plan_items (user_id, plan_id, archived_at, day_of_week, sort_order);
create index adhdice_health_workout_plan_item_links_user_workout_idx
  on public.adhdice_health_workout_plan_item_links (user_id, workout_id);
create index adhdice_health_workout_plan_item_links_user_plan_item_idx
  on public.adhdice_health_workout_plan_item_links (user_id, plan_item_id);
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
alter table public.adhdice_task_list_folders enable row level security;
alter table public.adhdice_task_list_rail_items enable row level security;
alter table public.adhdice_task_list_rail_items force row level security;
alter table public.adhdice_task_list_containers enable row level security;
alter table public.adhdice_task_list_manual_memberships enable row level security;
alter table public.adhdice_record_current enable row level security;
alter table public.adhdice_record_events enable row level security;
alter table public.adhdice_task_grid_layouts enable row level security;
alter table public.adhdice_on_time_plans enable row level security;
alter table public.adhdice_home_todo_state enable row level security;
alter table public.adhdice_brainstorm_state enable row level security;
alter table public.adhdice_health_profiles enable row level security;
alter table public.adhdice_health_checkins enable row level security;
alter table public.adhdice_health_food_library enable row level security;
alter table public.adhdice_health_recipes enable row level security;
alter table public.adhdice_health_saved_meals enable row level security;
alter table public.adhdice_health_water_entries enable row level security;
alter table public.adhdice_health_meal_entries enable row level security;
alter table public.adhdice_health_weight_entries enable row level security;
alter table public.adhdice_health_metric_entries enable row level security;
alter table public.adhdice_health_workouts enable row level security;
alter table public.adhdice_health_exercises enable row level security;
alter table public.adhdice_health_workout_exercises enable row level security;
alter table public.adhdice_health_workout_sets enable row level security;
alter table public.adhdice_health_fitness_plans enable row level security;
alter table public.adhdice_health_fitness_plan_items enable row level security;
alter table public.adhdice_health_workout_plan_item_links enable row level security;
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

create policy "Users can read their own task list folders"
  on public.adhdice_task_list_folders
  for select
  using (auth.uid() = user_id);

create policy "task list rail items owner select"
  on public.adhdice_task_list_rail_items
  for select to authenticated
  using (auth.uid() = user_id);

create policy "task list rail items owner insert"
  on public.adhdice_task_list_rail_items
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "task list rail items owner update"
  on public.adhdice_task_list_rail_items
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "task list rail items owner delete"
  on public.adhdice_task_list_rail_items
  for delete to authenticated
  using (auth.uid() = user_id);

create policy "Users can read their own task list containers"
  on public.adhdice_task_list_containers
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

create policy "Users can read their own current records"
  on public.adhdice_record_current for select using (auth.uid() = user_id);

create policy "Users can read their own record events"
  on public.adhdice_record_events for select using (auth.uid() = user_id);

revoke all on table public.adhdice_record_current from anon, authenticated;
revoke all on table public.adhdice_record_events from anon, authenticated;
grant select on table public.adhdice_record_current to authenticated;
grant select on table public.adhdice_record_events to authenticated;

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

create policy "Users can read their own Home todo state"
  on public.adhdice_home_todo_state for select using (auth.uid() = user_id);
create policy "Users can create their own Home todo state"
  on public.adhdice_home_todo_state for insert with check (auth.uid() = user_id);
create policy "Users can update their own Home todo state"
  on public.adhdice_home_todo_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own Home todo state"
  on public.adhdice_home_todo_state for delete using (auth.uid() = user_id);

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

create policy "Users can manage their own health recipes"
  on public.adhdice_health_recipes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health saved meals"
  on public.adhdice_health_saved_meals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health water entries"
  on public.adhdice_health_water_entries
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

create policy "Users can manage their own health workouts"
  on public.adhdice_health_workouts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health exercises"
  on public.adhdice_health_exercises
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health workout exercises"
  on public.adhdice_health_workout_exercises
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health workout sets"
  on public.adhdice_health_workout_sets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health fitness plans"
  on public.adhdice_health_fitness_plans
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health fitness plan items"
  on public.adhdice_health_fitness_plan_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own health workout plan item links"
  on public.adhdice_health_workout_plan_item_links
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

create trigger adhdice_task_list_folders_set_updated_at
  before update on public.adhdice_task_list_folders
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_task_list_containers_set_updated_at
  before update on public.adhdice_task_list_containers
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

create trigger adhdice_home_todo_state_set_updated_at
  before update on public.adhdice_home_todo_state
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

create trigger adhdice_health_recipes_set_updated_at
  before update on public.adhdice_health_recipes
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_saved_meals_set_updated_at
  before update on public.adhdice_health_saved_meals
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

create trigger adhdice_health_workouts_set_updated_at
  before update on public.adhdice_health_workouts
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_exercises_set_updated_at
  before update on public.adhdice_health_exercises
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_workout_exercises_set_updated_at
  before update on public.adhdice_health_workout_exercises
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_workout_sets_set_updated_at
  before update on public.adhdice_health_workout_sets
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_fitness_plans_set_updated_at
  before update on public.adhdice_health_fitness_plans
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_health_fitness_plan_items_set_updated_at
  before update on public.adhdice_health_fitness_plan_items
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
alter publication supabase_realtime add table public.adhdice_task_list_folders;
alter publication supabase_realtime add table public.adhdice_task_list_containers;
alter publication supabase_realtime add table public.adhdice_task_list_rail_items;
alter publication supabase_realtime add table public.adhdice_task_list_manual_memberships;
alter publication supabase_realtime add table public.adhdice_task_grid_layouts;
alter publication supabase_realtime add table public.adhdice_on_time_plans;
alter publication supabase_realtime add table public.adhdice_home_todo_state;
alter publication supabase_realtime add table public.adhdice_brainstorm_state;
alter publication supabase_realtime add table public.adhdice_health_profiles;
alter publication supabase_realtime add table public.adhdice_health_checkins;
alter publication supabase_realtime add table public.adhdice_health_food_library;
alter publication supabase_realtime add table public.adhdice_health_recipes;
alter publication supabase_realtime add table public.adhdice_health_saved_meals;
alter publication supabase_realtime add table public.adhdice_health_water_entries;
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

drop function if exists public.adhdice_reconcile_records(jsonb);

do $drop_records_reconciliation_overloads$
declare
  v_function record;
begin
  for v_function in
    select namespace.nspname, procedure.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'adhdice_reconcile_records',
        'adhdice_begin_records_reconciliation',
        'adhdice_upload_records_reconciliation_chunk',
        'adhdice_finalize_records_reconciliation'
      )
  loop
    execute pg_catalog.format('drop function %I.%I(%s)', v_function.nspname, v_function.proname, v_function.identity_arguments);
  end loop;
end;
$drop_records_reconciliation_overloads$;

create table if not exists public.adhdice_record_reconcile_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  manifest_schema_version integer not null check (manifest_schema_version = 1),
  evidence_schema_version integer not null check (evidence_schema_version = 2),
  rules_version text not null check (rules_version ~ '^records-v[1-9][0-9]*$'),
  manifest_digest text not null check (manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  evaluation_digest text not null check (evaluation_digest ~ '^sha256:[0-9a-f]{64}$'),
  expected_partitions jsonb not null check (jsonb_typeof(expected_partitions) = 'array'),
  expected_chunk_count integer not null check (expected_chunk_count between 0 and 10000),
  expected_current_row_count integer not null check (expected_current_row_count between 0 and 10000),
  expected_event_row_count integer not null check (expected_event_row_count between 0 and 100000),
  evaluated_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 100),
  logical_day_start time not null,
  status text not null default 'uploading' check (status in ('uploading', 'completed', 'invalid')),
  expires_at timestamptz not null default (now() + interval '45 minutes'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index if not exists adhdice_record_reconcile_runs_owner_active_uidx
  on public.adhdice_record_reconcile_runs (user_id) where status = 'uploading';
create index if not exists adhdice_record_reconcile_runs_expiry_idx
  on public.adhdice_record_reconcile_runs (expires_at) where status = 'uploading';

create table if not exists public.adhdice_record_reconcile_chunks (
  run_id uuid not null,
  user_id uuid not null,
  row_kind text not null check (row_kind in ('current', 'event')),
  section_key text not null check (section_key in ('global_tasks', 'streaks', 'focus', 'per_task', 'record_history')),
  chunk_index integer not null check (chunk_index >= 0),
  chunk_digest text not null check (chunk_digest ~ '^sha256:[0-9a-f]{64}$'),
  row_count integer not null check (row_count > 0),
  envelope_bytes integer not null check (envelope_bytes > 0 and envelope_bytes <= 1048576),
  received_at timestamptz not null default now(),
  primary key (run_id, row_kind, section_key, chunk_index),
  foreign key (run_id, user_id) references public.adhdice_record_reconcile_runs(id, user_id) on delete cascade
);

create table if not exists public.adhdice_record_current_stage (
  run_id uuid not null,
  user_id uuid not null,
  record_identity text not null,
  metric_key text not null,
  scope_kind text not null,
  scope_id text,
  title_snapshot text,
  value bigint not null,
  unit text not null,
  credited_date date not null,
  period_key text,
  period_start date,
  period_end date,
  candidate_identity text not null,
  first_achieved_at timestamptz not null,
  evidence_fingerprint text not null,
  evidence_snapshot jsonb not null,
  primary key (run_id, record_identity),
  foreign key (run_id, user_id) references public.adhdice_record_reconcile_runs(id, user_id) on delete cascade
);
create unique index if not exists adhdice_record_current_stage_scope_uidx
  on public.adhdice_record_current_stage (run_id, metric_key, scope_kind, coalesce(scope_id, ''));

create table if not exists public.adhdice_record_event_stage (
  run_id uuid not null,
  user_id uuid not null,
  record_identity text not null,
  metric_key text not null,
  scope_kind text not null,
  scope_id text,
  title_snapshot text,
  event_kind text not null,
  value bigint not null,
  unit text not null,
  credited_date date not null,
  period_key text,
  period_start date,
  period_end date,
  event_identity text not null,
  candidate_identity text not null,
  evidence_fingerprint text not null,
  evidence_snapshot jsonb not null,
  first_qualified_at timestamptz not null,
  first_achieved_at timestamptz not null,
  primary key (run_id, record_identity),
  foreign key (run_id, user_id) references public.adhdice_record_reconcile_runs(id, user_id) on delete cascade
);
create unique index if not exists adhdice_record_event_stage_identity_uidx
  on public.adhdice_record_event_stage (run_id, event_identity);

alter table public.adhdice_record_reconcile_runs enable row level security;
alter table public.adhdice_record_reconcile_chunks enable row level security;
alter table public.adhdice_record_current_stage enable row level security;
alter table public.adhdice_record_event_stage enable row level security;

drop policy if exists "Users own their Records reconcile runs" on public.adhdice_record_reconcile_runs;
create policy "Users own their Records reconcile runs" on public.adhdice_record_reconcile_runs
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users own their Records reconcile chunks" on public.adhdice_record_reconcile_chunks;
create policy "Users own their Records reconcile chunks" on public.adhdice_record_reconcile_chunks
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users own their Records current stage" on public.adhdice_record_current_stage;
create policy "Users own their Records current stage" on public.adhdice_record_current_stage
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users own their Records event stage" on public.adhdice_record_event_stage;
create policy "Users own their Records event stage" on public.adhdice_record_event_stage
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.adhdice_record_reconcile_runs from public, anon, authenticated;
revoke all on table public.adhdice_record_reconcile_chunks from public, anon, authenticated;
revoke all on table public.adhdice_record_current_stage from public, anon, authenticated;
revoke all on table public.adhdice_record_event_stage from public, anon, authenticated;

-- Preserve every legacy row while replacing only oversized evidence JSON with a compact marker.
update public.adhdice_record_current
set evidence_snapshot = pg_catalog.jsonb_build_object(
  'schemaVersion', 2,
  'kind', 'legacy_compacted',
  'evidenceDigest', evidence_fingerprint,
  'evidenceCount', 0
), updated_at = now()
where pg_catalog.octet_length(evidence_snapshot::text) >= 8192;

update public.adhdice_record_events
set evidence_snapshot = pg_catalog.jsonb_build_object(
  'schemaVersion', 2,
  'kind', 'legacy_compacted',
  'evidenceDigest', evidence_fingerprint,
  'evidenceCount', 0
), updated_at = now()
where pg_catalog.octet_length(evidence_snapshot::text) >= 8192;

create function public.adhdice_begin_records_reconciliation(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.adhdice_record_reconcile_runs%rowtype;
  v_received jsonb;
  v_partitions jsonb := p_payload->'expected_partitions';
  v_now timestamptz := clock_timestamp();
  v_evaluated_at timestamptz;
  v_day_start time;
  v_expected_chunk_count integer;
  v_expected_current_row_count integer;
  v_expected_event_row_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if coalesce(pg_catalog.jsonb_typeof(p_payload), '') <> 'object'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'manifest_schema_version'), '') <> 'number'
    or (p_payload->>'manifest_schema_version') <> '1'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'evidence_schema_version'), '') <> 'number'
    or (p_payload->>'evidence_schema_version') <> '2'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'rules_version'), '') <> 'string'
    or coalesce(p_payload->>'rules_version', '') !~ '^records-v[1-9][0-9]*$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'manifest_digest'), '') <> 'string'
    or coalesce(p_payload->>'manifest_digest', '') !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'evaluation_digest'), '') <> 'string'
    or coalesce(p_payload->>'evaluation_digest', '') !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(pg_catalog.jsonb_typeof(v_partitions), '') <> 'array'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'timezone'), '') <> 'string'
    or coalesce(p_payload->>'timezone', '') = '' or char_length(p_payload->>'timezone') > 100
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'logical_day_start'), '') <> 'string'
    or coalesce(p_payload->>'logical_day_start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'evaluated_at'), '') <> 'string'
    or coalesce(p_payload->>'evaluated_at', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'expected_chunk_count'), '') <> 'number'
    or coalesce(p_payload->>'expected_chunk_count', '') !~ '^[0-9]{1,5}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'expected_current_row_count'), '') <> 'number'
    or coalesce(p_payload->>'expected_current_row_count', '') !~ '^[0-9]{1,5}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'expected_event_row_count'), '') <> 'number'
    or coalesce(p_payload->>'expected_event_row_count', '') !~ '^[0-9]{1,6}$' then
    raise exception 'Invalid Records reconciliation manifest.' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(v_partitions) <> 5 then
    raise exception 'Invalid Records reconciliation partition count.' using errcode = '22023';
  end if;

  begin
    v_evaluated_at := (p_payload->>'evaluated_at')::timestamptz;
    v_day_start := (p_payload->>'logical_day_start')::time;
    v_expected_chunk_count := (p_payload->>'expected_chunk_count')::integer;
    v_expected_current_row_count := (p_payload->>'expected_current_row_count')::integer;
    v_expected_event_row_count := (p_payload->>'expected_event_row_count')::integer;
  exception when data_exception then
    raise exception 'Invalid Records reconciliation manifest values.' using errcode = '22023';
  end;
  if v_expected_chunk_count > 10000 or v_expected_current_row_count > 10000 or v_expected_event_row_count > 100000 then
    raise exception 'Invalid Records reconciliation manifest totals.' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_partitions) as partition(value)
    where coalesce(pg_catalog.jsonb_typeof(partition.value), '') <> 'object'
      or coalesce(pg_catalog.jsonb_typeof(partition.value->'row_kind'), '') <> 'string'
      or coalesce(pg_catalog.jsonb_typeof(partition.value->'section_key'), '') <> 'string'
      or coalesce(pg_catalog.jsonb_typeof(partition.value->'chunk_count'), '') <> 'number'
      or coalesce(partition.value->>'chunk_count', '') !~ '^[0-9]{1,5}$'
      or coalesce(pg_catalog.jsonb_typeof(partition.value->'row_count'), '') <> 'number'
      or coalesce(partition.value->>'row_count', '') !~ '^[0-9]{1,6}$'
      or case when coalesce(partition.value->>'chunk_count', '') ~ '^[0-9]{1,5}$' then (partition.value->>'chunk_count')::numeric > 10000 else false end
      or case when coalesce(partition.value->>'row_count', '') ~ '^[0-9]{1,6}$' then (partition.value->>'row_count')::numeric > 100000 else false end
  ) then
    raise exception 'Invalid Records reconciliation partition values.' using errcode = '22023';
  end if;

  begin
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(v_partitions) as partition(row_kind text, section_key text, chunk_count integer, row_count integer)
      where partition.row_kind not in ('current', 'event')
        or partition.section_key not in ('global_tasks', 'streaks', 'focus', 'per_task', 'record_history')
        or (partition.row_kind = 'event') <> (partition.section_key = 'record_history')
        or partition.chunk_count < 0 or partition.row_count < 0
        or (partition.chunk_count = 0) <> (partition.row_count = 0)
    ) or exists (
      select 1 from pg_catalog.jsonb_to_recordset(v_partitions) as partition(row_kind text, section_key text, chunk_count integer, row_count integer)
      group by row_kind, section_key having count(*) > 1
    ) or (select coalesce(sum(chunk_count), 0) from pg_catalog.jsonb_to_recordset(v_partitions) as partition(chunk_count integer)) <> v_expected_chunk_count
      or (select coalesce(sum(row_count), 0) from pg_catalog.jsonb_to_recordset(v_partitions) as partition(row_kind text, row_count integer) where row_kind = 'current') <> v_expected_current_row_count
      or (select coalesce(sum(row_count), 0) from pg_catalog.jsonb_to_recordset(v_partitions) as partition(row_kind text, row_count integer) where row_kind = 'event') <> v_expected_event_row_count then
      raise exception 'Invalid Records reconciliation partitions.' using errcode = '22023';
    end if;
  exception when data_exception then
    raise exception 'Invalid Records reconciliation partitions.' using errcode = '22023';
  end;

  delete from public.adhdice_record_reconcile_runs
  where user_id = v_user_id and status = 'uploading' and expires_at <= v_now;

  select * into v_run
  from public.adhdice_record_reconcile_runs
  where user_id = v_user_id and status = 'uploading'
  for update;

  if found and v_run.manifest_digest <> p_payload->>'manifest_digest' then
    return pg_catalog.jsonb_build_object('status', 'busy');
  end if;

  if not found then
    begin
      insert into public.adhdice_record_reconcile_runs (
        user_id, manifest_schema_version, evidence_schema_version, rules_version,
        manifest_digest, evaluation_digest, expected_partitions, expected_chunk_count,
        expected_current_row_count, expected_event_row_count, evaluated_at, timezone, logical_day_start,
        expires_at
      ) values (
        v_user_id, 1, 2, p_payload->>'rules_version', p_payload->>'manifest_digest',
        p_payload->>'evaluation_digest', v_partitions, v_expected_chunk_count,
        v_expected_current_row_count, v_expected_event_row_count,
        v_evaluated_at, p_payload->>'timezone', v_day_start,
        v_now + interval '45 minutes'
      ) returning * into v_run;
    exception when unique_violation then
      select * into v_run from public.adhdice_record_reconcile_runs
      where user_id = v_user_id and status = 'uploading' for update;
      if not found or v_run.manifest_digest <> p_payload->>'manifest_digest' then
        return pg_catalog.jsonb_build_object('status', 'busy');
      end if;
    end;
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'row_kind', chunk.row_kind, 'section_key', chunk.section_key,
    'chunk_index', chunk.chunk_index, 'chunk_digest', chunk.chunk_digest
  ) order by chunk.row_kind, chunk.section_key, chunk.chunk_index), '[]'::jsonb)
  into v_received
  from public.adhdice_record_reconcile_chunks chunk
  where chunk.run_id = v_run.id and chunk.user_id = v_user_id;

  return pg_catalog.jsonb_build_object(
    'status', case when pg_catalog.jsonb_array_length(v_received) = 0 then 'ready' else 'resume' end,
    'run_id', v_run.id,
    'received_chunks', v_received,
    'expected_chunk_count', v_run.expected_chunk_count,
    'expected_current_row_count', v_run.expected_current_row_count,
    'expected_event_row_count', v_run.expected_event_row_count
  );
end;
$function$;

create function public.adhdice_upload_records_reconciliation_chunk(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_run_id uuid;
  v_run public.adhdice_record_reconcile_runs%rowtype;
  v_existing_digest text;
  v_row_kind text := p_payload->>'row_kind';
  v_section_key text := p_payload->>'section_key';
  v_chunk_index integer;
  v_row_count integer;
  v_inserted integer;
  v_envelope_bytes integer := pg_catalog.octet_length(p_payload::text);
  v_partition jsonb;
  v_partition_chunk_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if coalesce(pg_catalog.jsonb_typeof(p_payload), '') <> 'object' or v_envelope_bytes > 1048576
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'run_id'), '') <> 'string'
    or coalesce(p_payload->>'run_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'row_kind'), '') <> 'string'
    or v_row_kind not in ('current', 'event')
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'section_key'), '') <> 'string'
    or v_section_key not in ('global_tasks', 'streaks', 'focus', 'per_task', 'record_history')
    or (v_row_kind = 'event') <> (v_section_key = 'record_history')
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'chunk_index'), '') <> 'number'
    or coalesce(p_payload->>'chunk_index', '') !~ '^[0-9]{1,5}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'row_count'), '') <> 'number'
    or coalesce(p_payload->>'row_count', '') !~ '^[0-9]{1,5}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'chunk_digest'), '') <> 'string'
    or coalesce(p_payload->>'chunk_digest', '') !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'rows'), '') <> 'array' then
    raise exception 'Invalid Records chunk envelope.' using errcode = '22023';
  end if;
  begin
    v_run_id := (p_payload->>'run_id')::uuid;
    v_chunk_index := (p_payload->>'chunk_index')::integer;
    v_row_count := (p_payload->>'row_count')::integer;
  exception when data_exception then
    raise exception 'Invalid Records chunk envelope values.' using errcode = '22023';
  end;
  if v_chunk_index > 10000 or v_row_count <= 0 or v_row_count > 10000
    or v_row_count <> pg_catalog.jsonb_array_length(p_payload->'rows') then
    raise exception 'Invalid Records chunk row count.' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_payload->'rows') as row_item(value)
    where coalesce(pg_catalog.jsonb_typeof(row_item.value), '') <> 'object'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'record_identity'), '') <> 'string'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'value'), '') <> 'number'
      or coalesce(row_item.value->>'value', '') !~ '^[0-9]{1,19}$'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'evidence_fingerprint'), '') <> 'string'
      or coalesce(row_item.value->>'evidence_fingerprint', '') !~ '^sha256:[0-9a-f]{64}$'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'evidence_snapshot'), '') <> 'object'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'evidence_snapshot'->'schemaVersion'), '') <> 'number'
      or row_item.value->'evidence_snapshot'->>'schemaVersion' <> '2'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'evidence_snapshot'->'evidenceCount'), '') <> 'number'
      or coalesce(row_item.value->'evidence_snapshot'->>'evidenceCount', '') !~ '^[0-9]{1,6}$'
  ) then
    raise exception 'Invalid Records compact row values.' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_payload->'rows') as row_item(value)
    where coalesce(pg_catalog.jsonb_typeof(row_item.value->'credited_date'), '') <> 'string'
      or coalesce(row_item.value->>'credited_date', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'period_start'), 'null') not in ('null', 'string')
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'period_end'), 'null') not in ('null', 'string')
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'period_start') = 'string', false)
        <> coalesce(pg_catalog.jsonb_typeof(row_item.value->'period_end') = 'string', false)
      or (pg_catalog.jsonb_typeof(row_item.value->'period_start') = 'string'
        and row_item.value->>'period_start' !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
      or (pg_catalog.jsonb_typeof(row_item.value->'period_end') = 'string'
        and row_item.value->>'period_end' !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'first_achieved_at'), '') <> 'string'
      or coalesce(row_item.value->>'first_achieved_at', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
      or (v_row_kind = 'event' and (
        coalesce(pg_catalog.jsonb_typeof(row_item.value->'first_qualified_at'), '') <> 'string'
        or coalesce(row_item.value->>'first_qualified_at', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
      ))
  ) then
    raise exception 'Invalid Records chunk row.' using errcode = '22023';
  end if;

  select * into v_run from public.adhdice_record_reconcile_runs
  where id = v_run_id and user_id = v_user_id and status = 'uploading' for update;
  if not found then raise exception 'Records reconciliation run is unavailable.' using errcode = '22023'; end if;
  if v_run.expires_at <= clock_timestamp() then
    delete from public.adhdice_record_reconcile_runs where id = v_run.id;
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;

  select partition.value into v_partition
  from pg_catalog.jsonb_array_elements(v_run.expected_partitions) partition
  where partition.value->>'row_kind' = v_row_kind and partition.value->>'section_key' = v_section_key;
  if v_partition is null or coalesce(v_partition->>'chunk_count', '') !~ '^[0-9]{1,5}$' then
    raise exception 'Records chunk is outside the manifest.' using errcode = '22023';
  end if;
  begin
    v_partition_chunk_count := (v_partition->>'chunk_count')::integer;
  exception when data_exception then
    raise exception 'Records chunk is outside the manifest.' using errcode = '22023';
  end;
  if v_chunk_index >= v_partition_chunk_count then
    raise exception 'Records chunk is outside the manifest.' using errcode = '22023';
  end if;

  select chunk_digest into v_existing_digest
  from public.adhdice_record_reconcile_chunks
  where run_id = v_run_id and row_kind = v_row_kind and section_key = v_section_key and chunk_index = v_chunk_index;
  if found then
    if v_existing_digest = p_payload->>'chunk_digest' then
      return pg_catalog.jsonb_build_object('status', 'already_received');
    end if;
    raise exception 'Records chunk index was already received with a different digest.' using errcode = '23505';
  end if;

  begin
    if v_row_kind = 'current' then
      insert into public.adhdice_record_current_stage (
        run_id, user_id, record_identity, metric_key, scope_kind, scope_id, title_snapshot, value, unit,
        credited_date, period_key, period_start, period_end, candidate_identity, first_achieved_at,
        evidence_fingerprint, evidence_snapshot
      )
      select v_run_id, v_user_id, item.record_identity, item.metric_key, item.scope_kind, nullif(item.scope_id, ''),
        nullif(item.title_snapshot, ''), item.value::bigint, item.unit, item.credited_date::date,
        nullif(item.period_key, ''), item.period_start::date, item.period_end::date, item.candidate_identity,
        item.first_achieved_at::timestamptz, item.evidence_fingerprint, item.evidence_snapshot
      from pg_catalog.jsonb_to_recordset(p_payload->'rows') as item(
        record_identity text, metric_key text, scope_kind text, scope_id text, title_snapshot text,
        value text, unit text, credited_date text, period_key text, period_start text, period_end text,
        candidate_identity text, first_achieved_at text, evidence_fingerprint text, evidence_snapshot jsonb
      )
      where item.record_identity = item.metric_key || ':' || item.scope_kind || ':' || coalesce(nullif(item.scope_id, ''), 'global')
        and item.metric_key in ('parent_tasks_day','parent_tasks_week','parent_tasks_month','permanent_completes_day','steps_day','steps_week','steps_month','parent_completion_day_streak','step_completion_day_streak','combined_completion_day_streak','focus_active_day_streak','longest_focus_session','focus_duration_day','focus_duration_week','focus_duration_month','focus_sessions_day','task_occurrence_streak','task_biggest_comeback')
        and item.scope_kind in ('global', 'task')
        and ((item.scope_kind = 'global' and nullif(item.scope_id, '') is null) or (item.scope_kind = 'task' and nullif(item.scope_id, '') is not null))
        and item.value ~ '^[0-9]{1,19}$' and item.unit in ('tasks','steps','days','seconds','sessions','occurrences')
        and item.credited_date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
        and (item.period_start is null) = (item.period_end is null)
        and (item.period_start is null or (item.period_start ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' and item.period_end ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'))
        and char_length(item.candidate_identity) between 1 and 1000
        and item.first_achieved_at ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
        and item.evidence_fingerprint ~ '^sha256:[0-9a-f]{64}$'
        and pg_catalog.jsonb_typeof(item.evidence_snapshot) = 'object'
        and item.evidence_snapshot->>'schemaVersion' = '2'
        and item.evidence_snapshot->>'evidenceDigest' = item.evidence_fingerprint
        and pg_catalog.octet_length(item.evidence_snapshot::text) < 8192;
    else
      insert into public.adhdice_record_event_stage (
        run_id, user_id, record_identity, metric_key, scope_kind, scope_id, title_snapshot, event_kind,
        value, unit, credited_date, period_key, period_start, period_end, event_identity, candidate_identity,
        evidence_fingerprint, evidence_snapshot, first_qualified_at, first_achieved_at
      )
      select v_run_id, v_user_id, item.record_identity, item.metric_key, item.scope_kind, nullif(item.scope_id, ''),
        nullif(item.title_snapshot, ''), item.event_kind, item.value::bigint, item.unit, item.credited_date::date,
        nullif(item.period_key, ''), item.period_start::date, item.period_end::date, item.event_identity,
        item.candidate_identity, item.evidence_fingerprint, item.evidence_snapshot,
        item.first_qualified_at::timestamptz, item.first_achieved_at::timestamptz
      from pg_catalog.jsonb_to_recordset(p_payload->'rows') as item(
        record_identity text, metric_key text, scope_kind text, scope_id text, title_snapshot text,
        event_kind text, value text, unit text, credited_date text, period_key text, period_start text,
        period_end text, event_identity text, candidate_identity text, evidence_fingerprint text,
        evidence_snapshot jsonb, first_qualified_at text, first_achieved_at text
      )
      where item.record_identity = item.event_identity and item.event_identity ~ '^fnv1a64:[0-9a-f]{16}$'
        and item.metric_key in ('parent_tasks_day','parent_tasks_week','parent_tasks_month','permanent_completes_day','steps_day','steps_week','steps_month','parent_completion_day_streak','step_completion_day_streak','combined_completion_day_streak','focus_active_day_streak','longest_focus_session','focus_duration_day','focus_duration_week','focus_duration_month','focus_sessions_day','task_occurrence_streak','task_biggest_comeback')
        and item.scope_kind in ('global', 'task') and item.event_kind in ('break', 'tie')
        and ((item.scope_kind = 'global' and nullif(item.scope_id, '') is null) or (item.scope_kind = 'task' and nullif(item.scope_id, '') is not null))
        and item.value ~ '^[0-9]{1,19}$' and item.unit in ('tasks','steps','days','seconds','sessions','occurrences')
        and item.credited_date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
        and (item.period_start is null) = (item.period_end is null)
        and (item.period_start is null or (item.period_start ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' and item.period_end ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'))
        and char_length(item.candidate_identity) between 1 and 1000
        and item.first_qualified_at ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
        and item.first_achieved_at ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
        and item.evidence_fingerprint ~ '^sha256:[0-9a-f]{64}$'
        and pg_catalog.jsonb_typeof(item.evidence_snapshot) = 'object'
        and item.evidence_snapshot->>'schemaVersion' = '2'
        and item.evidence_snapshot->>'evidenceDigest' = item.evidence_fingerprint
        and pg_catalog.octet_length(item.evidence_snapshot::text) < 8192;
    end if;
    get diagnostics v_inserted = row_count;
    if v_inserted <> v_row_count then raise exception 'Invalid Records chunk row.' using errcode = '22023'; end if;

    insert into public.adhdice_record_reconcile_chunks (
      run_id, user_id, row_kind, section_key, chunk_index, chunk_digest, row_count, envelope_bytes
    ) values (
      v_run_id, v_user_id, v_row_kind, v_section_key, v_chunk_index,
      p_payload->>'chunk_digest', v_row_count, v_envelope_bytes
    );
  exception when unique_violation then
    raise exception 'Duplicate Records identity across chunks.' using errcode = '23505';
  when data_exception then
    raise exception 'Invalid Records chunk row.' using errcode = '22023';
  end;

  update public.adhdice_record_reconcile_runs set updated_at = clock_timestamp()
  where id = v_run_id;
  return pg_catalog.jsonb_build_object('status', 'ok', 'chunk_index', v_chunk_index);
end;
$function$;

create function public.adhdice_finalize_records_reconciliation(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_run_id uuid;
  v_run public.adhdice_record_reconcile_runs%rowtype;
  v_current_count integer;
  v_event_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if coalesce(pg_catalog.jsonb_typeof(p_payload), '') <> 'object'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'run_id'), '') <> 'string'
    or coalesce(p_payload->>'run_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'manifest_digest'), '') <> 'string'
    or coalesce(p_payload->>'manifest_digest', '') !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'Invalid Records finalization payload.' using errcode = '22023';
  end if;
  begin
    v_run_id := (p_payload->>'run_id')::uuid;
  exception when data_exception then
    raise exception 'Invalid Records finalization run ID.' using errcode = '22023';
  end;

  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('adhdice:records:' || v_user_id::text, 0)) then
    return pg_catalog.jsonb_build_object('status', 'busy');
  end if;

  select * into v_run from public.adhdice_record_reconcile_runs
  where id = v_run_id and user_id = v_user_id and status = 'uploading' for update;
  if not found then raise exception 'Records reconciliation run is unavailable.' using errcode = '22023'; end if;
  if v_run.manifest_digest <> p_payload->>'manifest_digest' then
    raise exception 'Records reconciliation manifest mismatch.' using errcode = '22023';
  end if;
  if v_run.expires_at <= clock_timestamp() then
    delete from public.adhdice_record_reconcile_runs where id = v_run.id;
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;

  begin
    select count(*)::integer into v_current_count from public.adhdice_record_current_stage where run_id = v_run_id;
    select count(*)::integer into v_event_count from public.adhdice_record_event_stage where run_id = v_run_id;
    if v_current_count <> v_run.expected_current_row_count or v_event_count <> v_run.expected_event_row_count
      or (select count(*) from public.adhdice_record_reconcile_chunks where run_id = v_run_id) <> v_run.expected_chunk_count
      or exists (
        select 1
        from pg_catalog.jsonb_to_recordset(v_run.expected_partitions) as expected(row_kind text, section_key text, chunk_count integer, row_count integer)
        left join (
          select row_kind, section_key, count(*)::integer as chunk_count, sum(row_count)::integer as row_count
          from public.adhdice_record_reconcile_chunks where run_id = v_run_id group by row_kind, section_key
        ) received using (row_kind, section_key)
        where coalesce(received.chunk_count, 0) <> expected.chunk_count or coalesce(received.row_count, 0) <> expected.row_count
      ) then
      raise exception 'Records reconciliation is incomplete.' using errcode = '22023';
    end if;
  exception when data_exception then
    raise exception 'Records reconciliation is incomplete.' using errcode = '22023';
  end;

  insert into public.adhdice_record_current (
    user_id, rules_version, metric_key, scope_kind, scope_id, title_snapshot, value, unit,
    credited_date, period_key, period_start, period_end, candidate_identity, first_achieved_at,
    evidence_fingerprint, evidence_snapshot, timezone, logical_day_start, recalculated_at
  )
  select v_user_id, v_run.rules_version, metric_key, scope_kind, scope_id, title_snapshot, value, unit,
    credited_date, period_key, period_start, period_end, candidate_identity, first_achieved_at,
    evidence_fingerprint, evidence_snapshot, v_run.timezone, v_run.logical_day_start, v_run.evaluated_at
  from public.adhdice_record_current_stage where run_id = v_run_id
  on conflict (user_id, rules_version, metric_key, scope_kind, (coalesce(scope_id, ''))) do update set
    title_snapshot = excluded.title_snapshot, value = excluded.value, unit = excluded.unit,
    credited_date = excluded.credited_date, period_key = excluded.period_key,
    period_start = excluded.period_start, period_end = excluded.period_end,
    candidate_identity = excluded.candidate_identity,
    first_achieved_at = case
      when adhdice_record_current.candidate_identity = excluded.candidate_identity
        and adhdice_record_current.value = excluded.value
      then adhdice_record_current.first_achieved_at
      else excluded.first_achieved_at
    end,
    evidence_snapshot = case when adhdice_record_current.evidence_fingerprint is distinct from excluded.evidence_fingerprint then excluded.evidence_snapshot else adhdice_record_current.evidence_snapshot end,
    evidence_fingerprint = excluded.evidence_fingerprint, timezone = excluded.timezone,
    logical_day_start = excluded.logical_day_start, recalculated_at = excluded.recalculated_at, updated_at = now();

  delete from public.adhdice_record_current current_record
  where current_record.user_id = v_user_id and current_record.rules_version = v_run.rules_version
    and not exists (
      select 1 from public.adhdice_record_current_stage staged
      where staged.run_id = v_run_id
        and staged.record_identity = current_record.metric_key || ':' || current_record.scope_kind || ':' || coalesce(current_record.scope_id, 'global')
    );

  insert into public.adhdice_record_events (
    user_id, rules_version, metric_key, scope_kind, scope_id, title_snapshot, event_kind, value, unit,
    credited_date, period_key, period_start, period_end, event_identity, candidate_identity,
    evidence_fingerprint, evidence_snapshot, first_qualified_at, first_achieved_at,
    timezone, logical_day_start, validity_state
  )
  select v_user_id, v_run.rules_version, metric_key, scope_kind, scope_id, title_snapshot, event_kind, value, unit,
    credited_date, period_key, period_start, period_end, event_identity, candidate_identity,
    evidence_fingerprint, evidence_snapshot, first_qualified_at, first_achieved_at,
    v_run.timezone, v_run.logical_day_start, 'valid'
  from public.adhdice_record_event_stage where run_id = v_run_id
  on conflict (user_id, rules_version, event_identity) do update set
    metric_key = excluded.metric_key, scope_kind = excluded.scope_kind, scope_id = excluded.scope_id,
    title_snapshot = excluded.title_snapshot, event_kind = excluded.event_kind, value = excluded.value,
    unit = excluded.unit, credited_date = excluded.credited_date, period_key = excluded.period_key,
    period_start = excluded.period_start, period_end = excluded.period_end,
    candidate_identity = excluded.candidate_identity,
    evidence_snapshot = case when adhdice_record_events.evidence_fingerprint is distinct from excluded.evidence_fingerprint then excluded.evidence_snapshot else adhdice_record_events.evidence_snapshot end,
    evidence_fingerprint = excluded.evidence_fingerprint, timezone = excluded.timezone,
    logical_day_start = excluded.logical_day_start, validity_state = 'valid', invalidated_at = null,
    invalidation_reason = null, superseded_by_event_identity = null, updated_at = now();

  update public.adhdice_record_events event
  set validity_state = 'invalid', invalidated_at = v_run.evaluated_at,
    invalidation_reason = 'absent_from_complete_recalculation', updated_at = now()
  where event.user_id = v_user_id and event.rules_version = v_run.rules_version and event.validity_state = 'valid'
    and not exists (
      select 1 from public.adhdice_record_event_stage staged
      where staged.run_id = v_run_id and staged.event_identity = event.event_identity
    );

  update public.adhdice_record_reconcile_runs
  set status = 'completed', completed_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = v_run_id;
  delete from public.adhdice_record_reconcile_chunks where run_id = v_run_id;
  delete from public.adhdice_record_current_stage where run_id = v_run_id;
  delete from public.adhdice_record_event_stage where run_id = v_run_id;

  return pg_catalog.jsonb_build_object(
    'status', 'ok', 'current_count', v_current_count, 'event_count', v_event_count,
    'evaluated_at', v_run.evaluated_at
  );
end;
$function$;

revoke all on function public.adhdice_begin_records_reconciliation(jsonb) from public, anon;
revoke all on function public.adhdice_upload_records_reconciliation_chunk(jsonb) from public, anon;
revoke all on function public.adhdice_finalize_records_reconciliation(jsonb) from public, anon;
grant execute on function public.adhdice_begin_records_reconciliation(jsonb) to authenticated;
grant execute on function public.adhdice_upload_records_reconciliation_chunk(jsonb) to authenticated;
grant execute on function public.adhdice_finalize_records_reconciliation(jsonb) to authenticated;

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
  source_kind text not null check (source_kind in ('task_history', 'focus_session', 'step_set')),
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
  entity_kind text not null check (entity_kind in ('parent_task', 'step', 'focus_session', 'parent_step_set')),
  entity_id uuid,
  root_parent_id uuid,
  title_snapshot text,
  outcome_snapshot text check (outcome_snapshot is null or outcome_snapshot in ('done', 'complete', 'did_my_best', 'missed', 'delayed')),
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

create or replace function public.adhdice_guard_task_list_folder_cycle()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.parent_folder_id is null then return new; end if;
  if new.parent_folder_id = new.id then
    raise exception 'A folder cannot parent itself';
  end if;
  if exists (
    with recursive ancestors as (
      select folder.id, folder.parent_folder_id
      from public.adhdice_task_list_folders folder
      where folder.user_id = new.user_id and folder.id = new.parent_folder_id
      union
      select parent.id, parent.parent_folder_id
      from public.adhdice_task_list_folders parent
      join ancestors child on child.parent_folder_id = parent.id
      where parent.user_id = new.user_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A folder cannot move into its descendant';
  end if;
  return new;
end;
$function$;

create trigger adhdice_task_list_folders_guard_cycle
  before insert or update of user_id, id, parent_folder_id
  on public.adhdice_task_list_folders
  for each row execute function public.adhdice_guard_task_list_folder_cycle();

create or replace function public.adhdice_guard_task_list_folder_eligibility()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.folder_id is not null
    and not (
      new.list_type = 'custom'
      and new.membership_mode = 'manual'
      and new.built_in_key is null
      and new.id like 'list:%'
    )
  then
    raise exception 'Only user-created normal lists can be placed in folders';
  end if;
  return new;
end;
$function$;

create trigger adhdice_task_lists_guard_folder_eligibility
  before insert or update of folder_id, list_type, membership_mode, built_in_key, id
  on public.adhdice_task_lists
  for each row execute function public.adhdice_guard_task_list_folder_eligibility();

create or replace function public.adhdice_normalize_task_list_container(
  p_user_id uuid,
  p_folder_id uuid
)
returns void
language plpgsql
set search_path = ''
as $function$
begin
  with mixed as (
    select 'folder'::text as entity_type, folder.id::text as entity_id,
      folder.sort_order, folder.created_at
    from public.adhdice_task_list_folders folder
    where folder.user_id = p_user_id
      and folder.parent_folder_id is not distinct from p_folder_id
    union all
    select 'list', list_row.id, list_row.sort_order, list_row.created_at
    from public.adhdice_task_lists list_row
    where list_row.user_id = p_user_id
      and list_row.folder_id is not distinct from p_folder_id
  ),
  ranked as (
    select entity_type, entity_id,
      row_number() over (order by sort_order, entity_type, entity_id) - 1 as next_sort_order
    from mixed
  )
  update public.adhdice_task_list_folders target
  set sort_order = ranked.next_sort_order
  from ranked
  where ranked.entity_type = 'folder'
    and target.user_id = p_user_id
    and target.id::text = ranked.entity_id;

  with mixed as (
    select 'folder'::text as entity_type, folder.id::text as entity_id,
      folder.sort_order, folder.created_at
    from public.adhdice_task_list_folders folder
    where folder.user_id = p_user_id
      and folder.parent_folder_id is not distinct from p_folder_id
    union all
    select 'list', list_row.id, list_row.sort_order, list_row.created_at
    from public.adhdice_task_lists list_row
    where list_row.user_id = p_user_id
      and list_row.folder_id is not distinct from p_folder_id
  ),
  ranked as (
    select entity_type, entity_id,
      row_number() over (order by sort_order, entity_type, entity_id) - 1 as next_sort_order
    from mixed
  )
  update public.adhdice_task_lists target
  set sort_order = ranked.next_sort_order
  from ranked
  where ranked.entity_type = 'list'
    and target.user_id = p_user_id
    and target.id = ranked.entity_id;
end;
$function$;

create or replace function public.adhdice_assert_task_list_container_revision(
  p_user_id uuid,
  p_folder_id uuid,
  p_expected_revision bigint
)
returns bigint
language plpgsql
set search_path = ''
as $function$
declare
  v_revision bigint;
begin
  insert into public.adhdice_task_list_containers (user_id, folder_id)
  values (p_user_id, p_folder_id)
  on conflict do nothing;
  select container.revision into v_revision
  from public.adhdice_task_list_containers container
  where container.user_id = p_user_id
    and container.folder_id is not distinct from p_folder_id
  for update;
  if v_revision is null or p_expected_revision is null or v_revision <> p_expected_revision then
    raise exception using errcode = '40001',
      message = 'ADHDICE_LIST_FOLDER_REVISION_CONFLICT';
  end if;
  return v_revision;
end;
$function$;

create or replace function public.adhdice_mutate_task_list_structure(
  p_action text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_folder_id uuid;
  v_list_id text;
  v_source_folder_id uuid;
  v_destination_folder_id uuid;
  v_parent_folder_id uuid;
  v_expected_source_revision bigint;
  v_expected_destination_revision bigint;
  v_target_index bigint;
  v_item_count bigint;
  v_child_count bigint;
  v_deleted_position bigint;
  v_next_revision bigint;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;

  if p_action = 'create_folder' then
    v_destination_folder_id := nullif(p_payload->>'parent_folder_id', '')::uuid;
    if v_destination_folder_id is not null and not exists (
      select 1 from public.adhdice_task_list_folders
      where user_id = v_user_id and id = v_destination_folder_id
    ) then raise exception 'Folder destination was not found'; end if;
    perform public.adhdice_assert_task_list_container_revision(
      v_user_id, v_destination_folder_id,
      (p_payload->>'expected_container_revision')::bigint
    );
    select count(*) into v_target_index from (
      select id::text from public.adhdice_task_list_folders
      where user_id = v_user_id
        and parent_folder_id is not distinct from v_destination_folder_id
      union all
      select id from public.adhdice_task_lists
      where user_id = v_user_id
        and folder_id is not distinct from v_destination_folder_id
    ) siblings;
    insert into public.adhdice_task_list_folders (
      user_id, name, parent_folder_id, sort_order
    ) values (
      v_user_id, trim(p_payload->>'name'), v_destination_folder_id, v_target_index
    ) returning id into v_folder_id;
    insert into public.adhdice_task_list_containers (user_id, folder_id)
    values (v_user_id, v_folder_id);
    perform public.adhdice_normalize_task_list_container(v_user_id, v_destination_folder_id);
    update public.adhdice_task_list_containers
    set revision = revision + 1, updated_at = now()
    where user_id = v_user_id
      and folder_id is not distinct from v_destination_folder_id
    returning revision into v_next_revision;
    return jsonb_build_object(
      'status', 'ok', 'folder_id', v_folder_id,
      'destination_revision', v_next_revision
    );
  elsif p_action = 'rename_folder' then
    v_folder_id := (p_payload->>'folder_id')::uuid;
    update public.adhdice_task_list_folders
    set name = trim(p_payload->>'name'), revision = revision + 1, updated_at = now()
    where user_id = v_user_id and id = v_folder_id
      and revision = (p_payload->>'expected_folder_revision')::bigint
    returning revision into v_next_revision;
    if v_next_revision is null then
      raise exception using errcode = '40001',
        message = 'ADHDICE_LIST_FOLDER_REVISION_CONFLICT';
    end if;
    return jsonb_build_object(
      'status', 'ok', 'folder_id', v_folder_id,
      'folder_revision', v_next_revision
    );
  elsif p_action in ('move_folder', 'move_list') then
    v_destination_folder_id := nullif(p_payload->>'destination_folder_id', '')::uuid;
    v_target_index := greatest(0, (p_payload->>'target_index')::bigint);
    v_expected_source_revision := (p_payload->>'expected_source_revision')::bigint;
    v_expected_destination_revision := (p_payload->>'expected_destination_revision')::bigint;
    if v_destination_folder_id is not null and not exists (
      select 1 from public.adhdice_task_list_folders
      where user_id = v_user_id and id = v_destination_folder_id
    ) then raise exception 'Folder destination was not found'; end if;

    if p_action = 'move_folder' then
      v_folder_id := (p_payload->>'folder_id')::uuid;
      select parent_folder_id into v_source_folder_id
      from public.adhdice_task_list_folders
      where user_id = v_user_id and id = v_folder_id
      for update;
      if not found then raise exception 'Folder was not found'; end if;
      if v_destination_folder_id = v_folder_id then
        raise exception 'A folder cannot parent itself';
      end if;
      if v_destination_folder_id is not null and exists (
        with recursive descendants as (
          select child.id
          from public.adhdice_task_list_folders child
          where child.user_id = v_user_id and child.parent_folder_id = v_folder_id
          union
          select child.id
          from public.adhdice_task_list_folders child
          join descendants parent on child.parent_folder_id = parent.id
          where child.user_id = v_user_id
        )
        select 1 from descendants where id = v_destination_folder_id
      ) then raise exception 'A folder cannot move into its descendant'; end if;
    else
      v_list_id := p_payload->>'list_id';
      select folder_id into v_source_folder_id
      from public.adhdice_task_lists
      where user_id = v_user_id and id = v_list_id
        and list_type = 'custom' and membership_mode = 'manual'
        and built_in_key is null and id like 'list:%'
      for update;
      if not found then
        raise exception 'Only user-created normal lists can be moved into folders';
      end if;
    end if;

    if v_source_folder_id is not distinct from v_destination_folder_id then
      if v_expected_source_revision <> v_expected_destination_revision then
        raise exception using errcode = '40001',
          message = 'ADHDICE_LIST_FOLDER_REVISION_CONFLICT';
      end if;
      perform public.adhdice_assert_task_list_container_revision(
        v_user_id, v_source_folder_id, v_expected_source_revision
      );
    else
      perform public.adhdice_assert_task_list_container_revision(
        v_user_id, v_source_folder_id, v_expected_source_revision
      );
      perform public.adhdice_assert_task_list_container_revision(
        v_user_id, v_destination_folder_id, v_expected_destination_revision
      );
    end if;

    if p_action = 'move_folder' then
      update public.adhdice_task_list_folders
      set parent_folder_id = v_destination_folder_id,
        sort_order = 9223372036854775807, revision = revision + 1, updated_at = now()
      where user_id = v_user_id and id = v_folder_id;
    else
      update public.adhdice_task_lists
      set folder_id = v_destination_folder_id,
        sort_order = 9223372036854775807, revision = revision + 1, updated_at = now()
      where user_id = v_user_id and id = v_list_id;
    end if;
    if v_source_folder_id is distinct from v_destination_folder_id then
      perform public.adhdice_normalize_task_list_container(v_user_id, v_source_folder_id);
    end if;
    perform public.adhdice_normalize_task_list_container(v_user_id, v_destination_folder_id);
    select count(*) - 1 into v_item_count from (
      select id::text from public.adhdice_task_list_folders
      where user_id = v_user_id
        and parent_folder_id is not distinct from v_destination_folder_id
      union all
      select id from public.adhdice_task_lists
      where user_id = v_user_id
        and folder_id is not distinct from v_destination_folder_id
    ) siblings;
    v_target_index := least(v_target_index, greatest(v_item_count, 0));
    update public.adhdice_task_list_folders
    set sort_order = sort_order + 1
    where user_id = v_user_id
      and parent_folder_id is not distinct from v_destination_folder_id
      and sort_order >= v_target_index
      and (p_action <> 'move_folder' or id <> v_folder_id);
    update public.adhdice_task_lists
    set sort_order = sort_order + 1
    where user_id = v_user_id
      and folder_id is not distinct from v_destination_folder_id
      and sort_order >= v_target_index
      and (p_action <> 'move_list' or id <> v_list_id);
    if p_action = 'move_folder' then
      update public.adhdice_task_list_folders set sort_order = v_target_index
      where user_id = v_user_id and id = v_folder_id;
    else
      update public.adhdice_task_lists set sort_order = v_target_index
      where user_id = v_user_id and id = v_list_id;
    end if;
    perform public.adhdice_normalize_task_list_container(v_user_id, v_destination_folder_id);
    update public.adhdice_task_list_containers
    set revision = revision + 1, updated_at = now()
    where user_id = v_user_id
      and (
        folder_id is not distinct from v_source_folder_id
        or folder_id is not distinct from v_destination_folder_id
      );
    return jsonb_build_object('status', 'ok');
  elsif p_action = 'delete_folder' then
    v_folder_id := (p_payload->>'folder_id')::uuid;
    select parent_folder_id, sort_order into v_parent_folder_id, v_deleted_position
    from public.adhdice_task_list_folders
    where user_id = v_user_id and id = v_folder_id
    for update;
    if not found then raise exception 'Folder was not found'; end if;
    perform public.adhdice_assert_task_list_container_revision(
      v_user_id, v_parent_folder_id,
      (p_payload->>'expected_parent_revision')::bigint
    );
    perform public.adhdice_assert_task_list_container_revision(
      v_user_id, v_folder_id,
      (p_payload->>'expected_contents_revision')::bigint
    );
    perform public.adhdice_normalize_task_list_container(v_user_id, v_parent_folder_id);
    perform public.adhdice_normalize_task_list_container(v_user_id, v_folder_id);
    select sort_order into v_deleted_position
    from public.adhdice_task_list_folders
    where user_id = v_user_id and id = v_folder_id;
    select count(*) into v_child_count from (
      select id::text from public.adhdice_task_list_folders
      where user_id = v_user_id and parent_folder_id = v_folder_id
      union all
      select id from public.adhdice_task_lists
      where user_id = v_user_id and folder_id = v_folder_id
    ) children;
    update public.adhdice_task_list_folders
    set sort_order = sort_order + v_child_count - 1
    where user_id = v_user_id
      and parent_folder_id is not distinct from v_parent_folder_id
      and id <> v_folder_id and sort_order > v_deleted_position;
    update public.adhdice_task_lists
    set sort_order = sort_order + v_child_count - 1
    where user_id = v_user_id
      and folder_id is not distinct from v_parent_folder_id
      and sort_order > v_deleted_position;
    update public.adhdice_task_list_folders
    set parent_folder_id = v_parent_folder_id,
      sort_order = v_deleted_position + sort_order,
      revision = revision + 1, updated_at = now()
    where user_id = v_user_id and parent_folder_id = v_folder_id;
    update public.adhdice_task_lists
    set folder_id = v_parent_folder_id,
      sort_order = v_deleted_position + sort_order,
      revision = revision + 1, updated_at = now()
    where user_id = v_user_id and folder_id = v_folder_id;
    delete from public.adhdice_task_list_containers
    where user_id = v_user_id and folder_id = v_folder_id;
    delete from public.adhdice_task_list_folders
    where user_id = v_user_id and id = v_folder_id;
    perform public.adhdice_normalize_task_list_container(v_user_id, v_parent_folder_id);
    update public.adhdice_task_list_containers
    set revision = revision + 1, updated_at = now()
    where user_id = v_user_id
      and folder_id is not distinct from v_parent_folder_id
    returning revision into v_next_revision;
    return jsonb_build_object('status', 'ok', 'destination_revision', v_next_revision);
  end if;
  raise exception 'Unknown task-list structure action';
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid task-list structure payload';
end;
$function$;

revoke all on public.adhdice_task_list_folders from anon, authenticated;
revoke all on public.adhdice_task_list_containers from anon, authenticated;
grant select on public.adhdice_task_list_folders to authenticated;
grant select on public.adhdice_task_list_containers to authenticated;
grant select, insert, update, delete on public.adhdice_task_list_rail_items to authenticated;
revoke all on function public.adhdice_normalize_task_list_container(uuid, uuid) from public, anon, authenticated;
revoke all on function public.adhdice_assert_task_list_container_revision(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.adhdice_mutate_task_list_structure(text, jsonb) from public, anon;
grant execute on function public.adhdice_mutate_task_list_structure(text, jsonb) to authenticated;

-- Canonical List Rail placement source for fresh databases. Persisted positions and
-- compatibility mirrors are always contiguous integers.
create or replace function public.adhdice_reconcile_task_list_rail_items(p_manifest jsonb)
returns setof public.adhdice_task_list_rail_items
language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_item_key text;
  v_item_type text;
  v_entity_id uuid;
  v_container_folder_id uuid;
  v_default_sort_order integer;
  v_next_order integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 7422));
  if jsonb_typeof(p_manifest) <> 'array' or jsonb_array_length(p_manifest) > 512 then
    raise exception 'Invalid rail manifest.' using errcode = '22023';
  end if;
  insert into public.adhdice_task_list_containers (user_id, folder_id)
  values (v_user_id, null) on conflict do nothing;
  for v_item in
    select definition
    from jsonb_array_elements(p_manifest) with ordinality manifest(definition, ordinal)
    order by ordinal
  loop
    if jsonb_typeof(v_item->'default_sort_order') <> 'number' then
      raise exception 'Rail manifest sort order must be a bounded integer.' using errcode = '22023';
    end if;
    if (v_item->'default_sort_order')::numeric <> trunc((v_item->'default_sort_order')::numeric)
      or (v_item->'default_sort_order')::numeric not between 0 and 1000000 then
      raise exception 'Rail manifest sort order must be a bounded integer.' using errcode = '22023';
    end if;
    v_default_sort_order := (v_item->'default_sort_order')::numeric::integer;
    v_item_key := v_item->>'item_key';
    v_item_type := v_item->>'item_type';
    v_entity_id := nullif(v_item->>'entity_id', '')::uuid;
    v_container_folder_id := nullif(v_item->>'default_container_folder_id', '')::uuid;
    if v_item_type not in ('list', 'folder')
      or v_item_key is null
      or (v_item_type = 'folder' and (v_entity_id is null or v_item_key <> 'folder:' || v_entity_id::text))
      or (v_item_type = 'list' and v_entity_id is null and v_item_key not like 'system:%')
      or (v_item_type = 'list' and v_entity_id is not null and v_item_key <> 'list:' || v_entity_id::text)
    then
      raise exception 'Invalid rail manifest identity.' using errcode = '22023';
    end if;
    if v_container_folder_id is not null and not exists (
      select 1 from public.adhdice_task_list_folders
      where user_id = v_user_id and id = v_container_folder_id
    ) then
      v_container_folder_id := null;
    end if;
    insert into public.adhdice_task_list_containers (user_id, folder_id)
    values (v_user_id, v_container_folder_id) on conflict do nothing;
    perform 1 from public.adhdice_task_list_containers
    where user_id = v_user_id and folder_id is not distinct from v_container_folder_id
    for update;
    select least(1000000, coalesce(max(sort_order) + 1, 0)) into v_next_order
    from public.adhdice_task_list_rail_items
    where user_id = v_user_id and container_folder_id is not distinct from v_container_folder_id;
    insert into public.adhdice_task_list_rail_items (
      user_id, item_key, item_type, entity_id, container_folder_id, sort_order
    ) values (
      v_user_id, v_item_key, v_item_type, v_entity_id, v_container_folder_id, v_next_order
    ) on conflict (user_id, item_key) do nothing;
  end loop;
  return query
  select saved.* from public.adhdice_task_list_rail_items saved
  where saved.user_id = v_user_id
    and exists (
      select 1 from jsonb_array_elements(p_manifest) definition
      where definition->>'item_key' = saved.item_key
    )
  order by saved.container_folder_id nulls first, saved.sort_order, saved.item_key;
end;
$function$;

create or replace function public.adhdice_mutate_task_list_rail_placement(p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item_key text := p_payload->>'item_key';
  v_item_type text;
  v_entity_id uuid;
  v_source_folder_id uuid;
  v_destination_folder_id uuid := nullif(p_payload->>'destination_container_folder_id', '')::uuid;
  v_expected_source_revision bigint := (p_payload->>'expected_source_revision')::bigint;
  v_expected_destination_revision bigint := (p_payload->>'expected_destination_revision')::bigint;
  v_source_revision bigint;
  v_destination_revision bigint;
  v_target_index integer := (p_payload->>'target_index')::integer;
  v_destination_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 7422));
  if v_expected_source_revision is null or v_expected_destination_revision is null then
    raise exception 'Expected source and destination revisions are required.' using errcode = '22023';
  end if;
  if v_target_index is null or v_target_index < 0 or v_target_index > 1000000 then
    raise exception 'Destination index must be a bounded integer.' using errcode = '22023';
  end if;
  select item_type, entity_id, container_folder_id
  into v_item_type, v_entity_id, v_source_folder_id
  from public.adhdice_task_list_rail_items
  where user_id = v_user_id and item_key = v_item_key
  for update;
  if not found then raise exception 'Unknown rail item.' using errcode = 'P0002'; end if;
  if v_destination_folder_id is not null and not exists (
    select 1 from public.adhdice_task_list_folders
    where user_id = v_user_id and id = v_destination_folder_id
  ) then
    raise exception 'Unknown destination folder.' using errcode = '23503';
  end if;
  if v_item_type = 'folder' then
    if v_destination_folder_id = v_entity_id then
      raise exception 'A folder cannot contain itself.' using errcode = '23514';
    end if;
    if v_destination_folder_id is not null and exists (
      with recursive descendants(id) as (
        select id from public.adhdice_task_list_folders
        where user_id = v_user_id and parent_folder_id = v_entity_id
        union all
        select child.id from public.adhdice_task_list_folders child
        join descendants parent on child.parent_folder_id = parent.id
        where child.user_id = v_user_id
      )
      select 1 from descendants where id = v_destination_folder_id
    ) then
      raise exception 'A folder cycle is not allowed.' using errcode = '23514';
    end if;
  end if;
  insert into public.adhdice_task_list_containers (user_id, folder_id)
  values (v_user_id, v_source_folder_id), (v_user_id, v_destination_folder_id)
  on conflict do nothing;
  perform 1 from public.adhdice_task_list_containers
  where user_id = v_user_id and (
    folder_id is not distinct from v_source_folder_id
    or folder_id is not distinct from v_destination_folder_id
  )
  order by coalesce(folder_id::text, '') for update;
  select revision into v_source_revision from public.adhdice_task_list_containers
  where user_id = v_user_id and folder_id is not distinct from v_source_folder_id;
  select revision into v_destination_revision from public.adhdice_task_list_containers
  where user_id = v_user_id and folder_id is not distinct from v_destination_folder_id;
  if v_source_revision <> v_expected_source_revision
    or v_destination_revision <> v_expected_destination_revision
  then
    return jsonb_build_object(
      'status', 'conflict', 'code', 'ADHDICE_LIST_FOLDER_REVISION_CONFLICT',
      'source_revision', v_source_revision, 'destination_revision', v_destination_revision
    );
  end if;
  select count(*)::integer into v_destination_count
  from public.adhdice_task_list_rail_items
  where user_id = v_user_id
    and container_folder_id is not distinct from v_destination_folder_id
    and item_key <> v_item_key;
  if v_target_index > v_destination_count then
    raise exception 'Destination index is outside sibling bounds.' using errcode = '22023';
  end if;
  update public.adhdice_task_list_rail_items
  set container_folder_id = v_destination_folder_id, updated_at = now()
  where user_id = v_user_id and item_key = v_item_key;
  with ranked as (
    select item_key, row_number() over (order by sort_order, item_key) - 1 as next_order
    from public.adhdice_task_list_rail_items
    where user_id = v_user_id
      and container_folder_id is not distinct from v_source_folder_id
      and item_key <> v_item_key
  )
  update public.adhdice_task_list_rail_items saved
  set sort_order = ranked.next_order::integer, updated_at = now()
  from ranked where saved.user_id = v_user_id and saved.item_key = ranked.item_key;
  with ranked as (
    select item_key, row_number() over (order by sort_order, item_key) - 1 as next_order
    from public.adhdice_task_list_rail_items
    where user_id = v_user_id
      and container_folder_id is not distinct from v_destination_folder_id
      and item_key <> v_item_key
  )
  update public.adhdice_task_list_rail_items saved
  set sort_order = (
    ranked.next_order + case when ranked.next_order >= v_target_index then 1 else 0 end
  )::integer, updated_at = now()
  from ranked where saved.user_id = v_user_id and saved.item_key = ranked.item_key;
  update public.adhdice_task_list_rail_items
  set sort_order = v_target_index, updated_at = now()
  where user_id = v_user_id and item_key = v_item_key;
  update public.adhdice_task_list_folders folder
  set parent_folder_id = placement.container_folder_id,
      sort_order = placement.sort_order,
      revision = folder.revision + case when placement.item_key = v_item_key then 1 else 0 end,
      updated_at = now()
  from public.adhdice_task_list_rail_items placement
  where placement.user_id = v_user_id and placement.item_type = 'folder'
    and placement.entity_id = folder.id and folder.user_id = v_user_id
    and (
      placement.container_folder_id is not distinct from v_source_folder_id
      or placement.container_folder_id is not distinct from v_destination_folder_id
    );
  update public.adhdice_task_lists list_row
  set folder_id = placement.container_folder_id,
      sort_order = placement.sort_order,
      revision = list_row.revision + case when placement.item_key = v_item_key then 1 else 0 end,
      updated_at = now()
  from public.adhdice_task_list_rail_items placement
  where placement.user_id = v_user_id and placement.item_type = 'list'
    and placement.entity_id is not null
    and regexp_replace(list_row.id, '^list:', '') = placement.entity_id::text
    and list_row.user_id = v_user_id
    and (
      placement.container_folder_id is not distinct from v_source_folder_id
      or placement.container_folder_id is not distinct from v_destination_folder_id
    );
  update public.adhdice_task_list_containers
  set revision = revision + 1, updated_at = now()
  where user_id = v_user_id and (
    folder_id is not distinct from v_source_folder_id
    or folder_id is not distinct from v_destination_folder_id
  );
  return jsonb_build_object(
    'status', 'ok', 'item_key', v_item_key,
    'source_container_folder_id', v_source_folder_id,
    'destination_container_folder_id', v_destination_folder_id,
    'target_index', v_target_index
  );
end;
$function$;

revoke all on function public.adhdice_reconcile_task_list_rail_items(jsonb) from public, anon;
grant execute on function public.adhdice_reconcile_task_list_rail_items(jsonb) to authenticated;
revoke all on function public.adhdice_mutate_task_list_rail_placement(jsonb) from public, anon;
grant execute on function public.adhdice_mutate_task_list_rail_placement(jsonb) to authenticated;

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

alter table public.adhdice_achievement_occurrences
  drop constraint if exists adhdice_achievement_occurrences_outcome_snapshot_check,
  add constraint adhdice_achievement_occurrences_outcome_snapshot_check
    check (outcome_snapshot is null or outcome_snapshot in ('done', 'complete', 'did_my_best', 'missed', 'delayed')),
  drop constraint if exists adhdice_achievement_occurrences_snapshot_check,
  add constraint adhdice_achievement_occurrences_snapshot_check
    check (outcome_snapshot is not null or active_duration_seconds is not null or not is_currently_qualifying);

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

-- The legacy p_history_id name is intentional: PostgreSQL CREATE OR REPLACE
-- cannot rename an input parameter. It identifies adhdice_task_history_facts.id.
create or replace function public.adhdice_capture_task_achievement_occurrence(p_history_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_history public.adhdice_task_history_facts%rowtype;
  v_task public.adhdice_clean_tasks%rowtype;
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_existing public.adhdice_achievement_occurrences%rowtype;
  v_occurrence_id uuid;
  v_match_count integer := 0;
  v_match_tier integer := 0;
  v_fallback_ambiguous boolean := false;
  v_canonical_occurrence_key text;
  v_source_key text;
  v_dedupe_key text;
  v_entity_kind text;
  v_logical_occurrence_part text;
  v_root_id uuid;
  v_qualified boolean;
  v_snapshot jsonb;
begin
  select * into v_history from public.adhdice_task_history_facts where id = p_history_id;
  if not found then return null; end if;
  select * into v_profile from public.adhdice_achievement_profiles where user_id = v_history.user_id;
  if not found then return null; end if;

  -- Resolve one evidence tier at a time. A strong source match wins even when
  -- stale Task/date siblings also exist; only ambiguity within that tier is
  -- an error.
  select count(*) into v_match_count
  from public.adhdice_achievement_occurrences occurrence
  where occurrence.user_id = v_history.user_id
    and occurrence.source_kind = 'task_history'
    and occurrence.source_id = v_history.id::text;
  if v_match_count > 1 then
    raise exception 'Ambiguous Achievement tier A mapping for canonical History fact %.', v_history.id;
  end if;
  if v_match_count = 1 then
    v_match_tier := 1;
    select * into v_existing
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.source_id = v_history.id::text;
  end if;

  if v_match_tier = 0 and v_history.source_legacy_history_id is not null then
    select count(*) into v_match_count
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.source_id = v_history.source_legacy_history_id::text;
    if v_match_count > 1 then
      raise exception 'Ambiguous Achievement tier B mapping for canonical History fact %.', v_history.id;
    end if;
    if v_match_count = 1 then
      v_match_tier := 2;
      select * into v_existing
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = v_history.user_id
        and occurrence.source_kind = 'task_history'
        and occurrence.source_id = v_history.source_legacy_history_id::text;
    end if;
  end if;

  if v_match_tier = 0 then
    select count(*) into v_match_count
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.source_snapshot->>'history_fact_id' = v_history.id::text;
    if v_match_count > 1 then
      raise exception 'Ambiguous Achievement tier C mapping for canonical History fact %.', v_history.id;
    end if;
    if v_match_count = 1 then
      v_match_tier := 3;
      select * into v_existing
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = v_history.user_id
        and occurrence.source_kind = 'task_history'
        and occurrence.source_snapshot->>'history_fact_id' = v_history.id::text;
    end if;
  end if;

  if v_match_tier = 0 then
    select count(*) into v_match_count
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.entity_id = v_history.entity_id
      and occurrence.logical_date = v_history.logical_date;
    v_match_tier := case when v_match_count > 0 then 4 else 0 end;
    v_fallback_ambiguous := v_match_count > 1;
    if v_match_count = 1 then
      select * into v_existing
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = v_history.user_id
        and occurrence.source_kind = 'task_history'
        and occurrence.entity_id = v_history.entity_id
        and occurrence.logical_date = v_history.logical_date;
    end if;
  end if;

  if v_history.occurrence_id is not null then
    select occurrence.occurrence_key into v_canonical_occurrence_key
    from public.adhdice_task_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.id = v_history.occurrence_id
      and occurrence.entity_id = v_history.entity_id;
    if not found then
      raise exception 'Canonical occurrence % for History fact % could not be resolved.', v_history.occurrence_id, v_history.id;
    end if;
  end if;

  v_entity_kind := case when v_history.entity_kind = 'parent' then 'parent_task' else 'step' end;
  -- Canonical occurrence evidence wins. A terminal completion is the only
  -- canonical fact that establishes a lifetime one-time identity without an
  -- occurrence row; otherwise logical-date is the fail-closed fallback.
  v_logical_occurrence_part := case
    when nullif(btrim(v_canonical_occurrence_key), '') is not null then v_canonical_occurrence_key
    when v_history.event_kind = 'terminal_complete' then 'lifetime:' || v_history.entity_id::text
    else 'logical-date:' || v_history.logical_date::text
  end;
  v_source_key := 'task:' || v_history.entity_id::text || ':' || v_logical_occurrence_part;
  v_dedupe_key := 'occurrence:v1:task_history:' || v_entity_kind || ':' || v_history.entity_id::text || ':' || v_logical_occurrence_part;
  v_qualified := v_history.outcome in ('done', 'complete', 'did_my_best');

  perform pg_advisory_xact_lock(hashtextextended(v_history.user_id::text || ':achievement-source:' || v_history.id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_history.user_id::text || ':achievement-occurrence:' || v_dedupe_key, 0));

  -- Tier E is a logical-identity bridge for an existing lifetime occurrence
  -- whose physical/source evidence predates this canonical History fact. It is
  -- deliberately unavailable when Tier D found stale same-Task/date siblings:
  -- true Tier D ambiguity must create the canonical fallback occurrence rather
  -- than selecting one sibling by a similar logical identity.
  if v_match_tier = 0 and v_match_count = 0 and not v_fallback_ambiguous then
    select count(*) into v_match_count
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.dedupe_key = v_dedupe_key;
    if v_match_count > 1 then
      raise exception 'Ambiguous Achievement tier E mapping for canonical History fact %.', v_history.id;
    end if;
    if v_match_count = 1 then
      v_match_tier := 5;
      select * into v_existing
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = v_history.user_id
        and occurrence.source_kind = 'task_history'
        and occurrence.dedupe_key = v_dedupe_key;
    end if;
  end if;

  select * into v_task
  from public.adhdice_clean_tasks
  where id = v_history.entity_id and user_id = v_history.user_id;
  if not found then
    -- Deleted Tasks retain their Achievement-owned history and awards. If a
    -- canonical fact still identifies an existing occurrence, only migrate
    -- physical source evidence; never require the deleted Task to reappear.
    if v_existing.id is not null then
      update public.adhdice_achievement_occurrences
      set source_id = v_history.id::text,
          outcome_snapshot = v_history.outcome,
          source_snapshot = jsonb_build_object(
            'history_fact_id', v_history.id, 'task_id', v_history.entity_id,
            'entity_id', v_history.entity_id, 'entity_kind', v_history.entity_kind,
            'logical_date', v_history.logical_date, 'outcome', v_history.outcome,
            'event_kind', v_history.event_kind, 'occurrence_id', v_history.occurrence_id,
            'occurrence_key', v_canonical_occurrence_key,
            'scheduled_due_on', v_history.scheduled_due_on, 'effective_due_on', v_history.effective_due_on,
            'schedule_boundary_id', v_history.schedule_boundary_id,
            'recurrence_source_fingerprint', v_history.recurrence_source_fingerprint,
            'provenance_kind', v_history.provenance_kind, 'actor_kind', v_history.actor_kind,
            'actor_id', v_history.actor_id, 'source', v_history.source,
            'created_at', v_history.created_at, 'updated_at', v_history.updated_at,
            'deleted_task_preserved', true
          )
      where id = v_existing.id
      returning id into v_occurrence_id;
      return v_occurrence_id;
    end if;
    return null;
  end if;

  v_root_id := public.adhdice_achievement_root_parent(v_history.entity_id, v_history.user_id);
  v_snapshot := jsonb_build_object(
    'history_fact_id', v_history.id, 'task_id', v_history.entity_id,
    'entity_id', v_history.entity_id, 'entity_kind', v_history.entity_kind,
    'logical_date', v_history.logical_date, 'outcome', v_history.outcome,
    'event_kind', v_history.event_kind, 'occurrence_id', v_history.occurrence_id,
    'occurrence_key', v_canonical_occurrence_key,
    'scheduled_due_on', v_history.scheduled_due_on, 'effective_due_on', v_history.effective_due_on,
    'schedule_boundary_id', v_history.schedule_boundary_id,
    'recurrence_source_fingerprint', v_history.recurrence_source_fingerprint,
    'provenance_kind', v_history.provenance_kind, 'actor_kind', v_history.actor_kind,
    'actor_id', v_history.actor_id, 'source', v_history.source,
    'created_at', v_history.created_at, 'updated_at', v_history.updated_at,
    'parent_task_id', v_task.parent_task_id, 'root_parent_id', v_root_id,
    'logical_dedupe_key', coalesce(v_existing.dedupe_key, v_dedupe_key)
  );

  if v_history.created_at < v_profile.activated_at
    or v_history.logical_date < public.adhdice_achievement_logical_date(v_profile.activated_at, v_profile.timezone, v_profile.logical_day_start) then
    if v_existing.id is null then return null; end if;
    update public.adhdice_achievement_occurrences
    set source_id = v_history.id::text, outcome_snapshot = v_history.outcome,
        is_currently_qualifying = false, source_snapshot = v_snapshot
    where id = v_existing.id
    returning id into v_occurrence_id;
    update public.adhdice_achievement_occurrences sibling
    set is_currently_qualifying = false,
        source_snapshot = sibling.source_snapshot || jsonb_build_object(
          'superseded_by_history_fact_id', v_history.id,
          'canonical_reconciled_at', clock_timestamp(),
          'stale_same_day_evidence', true
        )
    where sibling.user_id = v_history.user_id
      and sibling.source_kind = 'task_history'
      and sibling.entity_id = v_history.entity_id
      and sibling.logical_date = v_history.logical_date
      and sibling.id <> v_occurrence_id;
    return v_occurrence_id;
  end if;

  if v_existing.id is not null then
    update public.adhdice_achievement_occurrences occurrence
    set source_id = v_history.id::text,
        source_created_at = v_history.created_at,
        first_qualified_at = case when v_qualified
          then least(occurrence.first_qualified_at, v_history.updated_at)
          else occurrence.first_qualified_at end,
        logical_date = v_history.logical_date,
        week_key = v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 1,
        week_start_date = v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 1,
        week_end_date = v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 7,
        month_key = to_char(v_history.logical_date, 'YYYY-MM'),
        month_start_date = date_trunc('month', v_history.logical_date)::date,
        month_end_date = (date_trunc('month', v_history.logical_date) + interval '1 month - 1 day')::date,
        entity_kind = v_entity_kind, entity_id = v_task.id,
        root_parent_id = case when v_task.parent_task_id is null then v_task.id else v_root_id end,
        title_snapshot = v_task.title, outcome_snapshot = v_history.outcome,
        is_currently_qualifying = v_qualified, source_snapshot = v_snapshot,
        evaluator_version = 'achievements-evaluator-v1', catalog_version = v_profile.catalog_version
    where occurrence.id = v_existing.id
    returning occurrence.id into v_occurrence_id;
    update public.adhdice_achievement_occurrences sibling
    set is_currently_qualifying = false,
        source_snapshot = sibling.source_snapshot || jsonb_build_object(
          'superseded_by_history_fact_id', v_history.id,
          'canonical_reconciled_at', clock_timestamp(),
          'stale_same_day_evidence', true
        )
    where sibling.user_id = v_history.user_id
      and sibling.source_kind = 'task_history'
      and sibling.entity_id = v_history.entity_id
      and sibling.logical_date = v_history.logical_date
      and sibling.id <> v_occurrence_id;
    return v_occurrence_id;
  end if;

  if not v_qualified and not v_fallback_ambiguous then
    update public.adhdice_achievement_occurrences sibling
    set is_currently_qualifying = false,
        source_snapshot = sibling.source_snapshot || jsonb_build_object(
          'superseded_by_history_fact_id', v_history.id,
          'canonical_reconciled_at', clock_timestamp(),
          'stale_same_day_evidence', true
        )
    where sibling.user_id = v_history.user_id
      and sibling.source_kind = 'task_history'
      and sibling.entity_id = v_history.entity_id
      and sibling.logical_date = v_history.logical_date;
    return null;
  end if;

  insert into public.adhdice_achievement_occurrences (
    user_id, source_kind, source_id, source_occurrence_key, dedupe_key,
    source_created_at, first_qualified_at, logical_date, week_key, week_start_date, week_end_date,
    month_key, month_start_date, month_end_date, timezone, logical_day_start,
    entity_kind, entity_id, root_parent_id, title_snapshot, outcome_snapshot,
    evaluator_version, catalog_version, is_currently_qualifying, source_snapshot
  ) values (
    v_history.user_id, 'task_history', v_history.id::text, v_source_key, v_dedupe_key,
    v_history.created_at, v_history.updated_at, v_history.logical_date,
    v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 1,
    v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 1,
    v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 7,
    to_char(v_history.logical_date, 'YYYY-MM'), date_trunc('month', v_history.logical_date)::date,
    (date_trunc('month', v_history.logical_date) + interval '1 month - 1 day')::date,
    v_profile.timezone, v_profile.logical_day_start,
    v_entity_kind,
    v_task.id, case when v_task.parent_task_id is null then v_task.id else v_root_id end,
    v_task.title, v_history.outcome, 'achievements-evaluator-v1', v_profile.catalog_version, v_qualified,
    v_snapshot
  )
  returning id into v_occurrence_id;
  update public.adhdice_achievement_occurrences sibling
  set is_currently_qualifying = false,
      source_snapshot = sibling.source_snapshot || jsonb_build_object(
        'superseded_by_history_fact_id', v_history.id,
        'canonical_reconciled_at', clock_timestamp(),
        'stale_same_day_evidence', true
      )
  where sibling.user_id = v_history.user_id
    and sibling.source_kind = 'task_history'
    and sibling.entity_id = v_history.entity_id
    and sibling.logical_date = v_history.logical_date
    and sibling.id <> v_occurrence_id;
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
  v_deferred_user_id text;
  v_is_deferred boolean;
begin
  v_user_id := new.user_id;
  v_deferred_user_id := current_setting('adhdice.achievement_deferred_user_id', true);
  v_is_deferred := coalesce(v_deferred_user_id = v_user_id::text, false);
  v_operation_id := md5(tg_table_name || ':' || new.id::text || ':' || to_jsonb(new)::text)::uuid;
  begin
    if tg_table_name='adhdice_task_history_facts' then
      v_occurrence_id := public.adhdice_capture_task_achievement_occurrence(new.id);
      if v_occurrence_id is not null then
        select root_parent_id into v_root_id from public.adhdice_achievement_occurrences where id=v_occurrence_id;
        if v_root_id is not null then perform public.adhdice_refresh_achievement_step_set(v_user_id,v_root_id); end if;
      end if;
    else
      perform public.adhdice_capture_focus_achievement_occurrence(new.id);
    end if;
    if not v_is_deferred then
      perform public.adhdice_evaluate_achievements(v_user_id,v_operation_id,'immediate');
    end if;
  exception when others then
    if v_is_deferred then
      raise;
    end if;
    -- Source history remains authoritative; a later resumable recalculation repairs capture.
    perform public.adhdice_record_achievement_evaluation_failure(v_user_id,v_operation_id,'immediate',sqlstate,sqlerrm);
  end;
  return new;
end;
$function$;

create trigger adhdice_capture_task_achievement_runtime
  after insert or update of entity_id, entity_kind, logical_date, outcome, event_kind,
    occurrence_id, scheduled_due_on, effective_due_on, schedule_boundary_id,
    provenance_kind, actor_kind, actor_id, source, source_legacy_history_id
  on public.adhdice_task_history_facts for each row
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
  v_match_count integer := 0;
begin
  begin
    if tg_table_name = 'adhdice_task_history_facts'
      and not exists (select 1 from public.adhdice_clean_tasks where id=old.entity_id and user_id=old.user_id) then
      return old;
    end if;
    if tg_table_name = 'adhdice_task_history_facts' then
      select count(*) into v_match_count
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = old.user_id
        and occurrence.source_kind = 'task_history'
        and (
          occurrence.source_id = old.id::text
          or occurrence.source_snapshot->>'history_fact_id' = old.id::text
          or (occurrence.entity_id = old.entity_id and occurrence.logical_date = old.logical_date)
        );
      if v_match_count > 1 then
        raise exception 'Ambiguous Achievement mapping for deleted canonical History fact %.', old.id;
      end if;
      if v_match_count = 1 then
        select * into v_occurrence
        from public.adhdice_achievement_occurrences occurrence
        where occurrence.user_id = old.user_id
          and occurrence.source_kind = 'task_history'
          and (
            occurrence.source_id = old.id::text
            or occurrence.source_snapshot->>'history_fact_id' = old.id::text
            or (occurrence.entity_id = old.entity_id and occurrence.logical_date = old.logical_date)
          );
      end if;
    else
      select * into v_occurrence from public.adhdice_achievement_occurrences
        where user_id=old.user_id and source_kind='focus_session' and source_id=old.id::text;
    end if;
    if v_occurrence.id is not null then
      update public.adhdice_achievement_occurrences
      set is_currently_qualifying=false,
          source_snapshot = source_snapshot || jsonb_build_object('source_deleted_at', clock_timestamp())
      where id=v_occurrence.id;
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

create trigger adhdice_deactivate_deleted_task_achievement_runtime
  after delete on public.adhdice_task_history_facts for each row
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
      and not exists (
        select 1
        from public.adhdice_task_history_facts fact
        join public.adhdice_achievement_profiles profile on profile.user_id=fact.user_id
        where fact.user_id=v_user_id and fact.entity_id=occurrence.entity_id and fact.logical_date=occurrence.logical_date
          and fact.created_at>=profile.activated_at
          and fact.logical_date>=public.adhdice_achievement_logical_date(profile.activated_at,profile.timezone,profile.logical_day_start)
      );
  for v_record in
    with sources as (
      select fact.created_at,'task_history'::text source_kind,fact.id source_id
      from public.adhdice_task_history_facts fact
      where fact.user_id=v_user_id and fact.created_at>=v_profile.activated_at
        and fact.logical_date>=public.adhdice_achievement_logical_date(v_profile.activated_at,v_profile.timezone,v_profile.logical_day_start)
        and (
          fact.outcome in ('done','complete','did_my_best')
          or exists (
            select 1
            from public.adhdice_achievement_occurrences occurrence
            where occurrence.user_id=fact.user_id
              and occurrence.source_kind='task_history'
              and (
                occurrence.source_id=fact.id::text
                or (fact.source_legacy_history_id is not null and occurrence.source_id=fact.source_legacy_history_id::text)
                or occurrence.source_snapshot->>'history_fact_id'=fact.id::text
                or (occurrence.entity_id=fact.entity_id and occurrence.logical_date=fact.logical_date)
              )
          )
        )
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

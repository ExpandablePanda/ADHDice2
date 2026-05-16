create extension if not exists pgcrypto;

create type public.adhdice_clean_task_status as enum ('pending', 'in_progress', 'done', 'missed', 'did_my_best', 'upcoming', 'not_due', 'archived');
create type public.adhdice_clean_task_priority as enum ('low', 'normal', 'high');
create type public.adhdice_clean_task_energy as enum ('none', 'low', 'medium', 'high');
create type public.adhdice_clean_task_repeat_frequency as enum ('none', 'daily', 'weekly', 'monthly', 'custom');
create type public.adhdice_clean_task_subtask_status as enum ('pending', 'in_progress', 'done', 'missed', 'did_my_best', 'upcoming', 'not_due');
create type public.adhdice_clean_focus_source as enum ('timer', 'manual', 'import');

create table public.adhdice_clean_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  notes text,
  status public.adhdice_clean_task_status not null default 'pending',
  priority public.adhdice_clean_task_priority not null default 'normal',
  energy public.adhdice_clean_task_energy not null default 'none',
  is_urgent boolean not null default false,
  is_important boolean not null default false,
  due_on date,
  due_time time,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  tags text[] not null default '{}',
  external_link_label text,
  external_link_url text,
  one_step_at_a_time boolean not null default false,
  subtasks_auto_reset boolean not null default false,
  repeat_frequency public.adhdice_clean_task_repeat_frequency not null default 'none',
  repeat_interval integer not null default 1 check (repeat_interval > 0),
  repeat_days_of_week smallint[] not null default '{}',
  repeat_day_of_month integer check (repeat_day_of_month is null or (repeat_day_of_month >= 1 and repeat_day_of_month <= 31)),
  sort_order bigint not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

create table public.adhdice_task_focus_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  focus_date date not null,
  task_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, focus_date)
);

create table public.adhdice_task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  status public.adhdice_clean_task_status not null,
  was_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, task_id, entry_date)
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

create table public.adhdice_task_grid_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  layout_json text not null default '[]',
  updated_at timestamptz not null default now()
);

create index adhdice_clean_tasks_user_status_sort_idx
  on public.adhdice_clean_tasks (user_id, status, sort_order, created_at desc);
create index adhdice_clean_tasks_user_due_idx
  on public.adhdice_clean_tasks (user_id, due_on, due_time);
create index adhdice_user_profiles_updated_at_idx
  on public.adhdice_user_profiles (updated_at desc);
create index adhdice_focus_categories_user_sort_idx
  on public.adhdice_focus_categories (user_id, sort_order, created_at desc);
create index adhdice_focus_sessions_user_date_idx
  on public.adhdice_focus_sessions (user_id, session_date desc, created_at desc);
create index adhdice_focus_active_sessions_user_updated_idx
  on public.adhdice_focus_active_sessions (user_id, updated_at desc);
create index adhdice_task_focus_days_user_date_idx
  on public.adhdice_task_focus_days (user_id, focus_date desc);
create index adhdice_task_history_user_date_idx
  on public.adhdice_task_history (user_id, entry_date desc, created_at desc);
create index adhdice_task_subtasks_task_sort_idx
  on public.adhdice_task_subtasks (task_id, sort_order, created_at asc);
create index adhdice_task_grid_layouts_updated_at_idx
  on public.adhdice_task_grid_layouts (updated_at desc);

alter table public.adhdice_clean_tasks enable row level security;
alter table public.adhdice_user_profiles enable row level security;
alter table public.adhdice_focus_categories enable row level security;
alter table public.adhdice_focus_sessions enable row level security;
alter table public.adhdice_focus_active_sessions enable row level security;
alter table public.adhdice_task_focus_days enable row level security;
alter table public.adhdice_task_history enable row level security;
alter table public.adhdice_task_subtasks enable row level security;
alter table public.adhdice_task_grid_layouts enable row level security;

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

create or replace function public.adhdice_clean_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

create trigger adhdice_task_focus_days_set_updated_at
  before update on public.adhdice_task_focus_days
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_task_history_set_updated_at
  before update on public.adhdice_task_history
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_task_subtasks_set_updated_at
  before update on public.adhdice_task_subtasks
  for each row
  execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_task_grid_layouts_set_updated_at
  before update on public.adhdice_task_grid_layouts
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_clean_tasks;
alter publication supabase_realtime add table public.adhdice_focus_categories;
alter publication supabase_realtime add table public.adhdice_focus_sessions;
alter publication supabase_realtime add table public.adhdice_focus_active_sessions;
alter publication supabase_realtime add table public.adhdice_task_focus_days;
alter publication supabase_realtime add table public.adhdice_task_history;
alter publication supabase_realtime add table public.adhdice_task_subtasks;
alter publication supabase_realtime add table public.adhdice_task_grid_layouts;

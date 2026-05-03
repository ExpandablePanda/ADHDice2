drop table if exists public.adhdice_focus_active_sessions;
drop table if exists public.adhdice_focus_sessions;
drop table if exists public.adhdice_focus_categories;
drop table if exists public.adhdice_task_focus_days;
drop table if exists public.adhdice_task_grid_layouts;

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

create table public.adhdice_task_grid_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  layout_json text not null default '[]',
  updated_at timestamptz not null default now()
);

create index adhdice_focus_categories_user_sort_idx
  on public.adhdice_focus_categories (user_id, sort_order, created_at desc);
create index adhdice_focus_sessions_user_date_idx
  on public.adhdice_focus_sessions (user_id, session_date desc, created_at desc);
create index adhdice_focus_sessions_user_title_idx
  on public.adhdice_focus_sessions (user_id, title_snapshot);
create index adhdice_focus_active_sessions_user_updated_idx
  on public.adhdice_focus_active_sessions (user_id, updated_at desc);
create index adhdice_task_focus_days_user_date_idx
  on public.adhdice_task_focus_days (user_id, focus_date desc);
create index adhdice_task_grid_layouts_updated_at_idx
  on public.adhdice_task_grid_layouts (updated_at desc);

alter table public.adhdice_focus_categories enable row level security;
alter table public.adhdice_focus_sessions enable row level security;
alter table public.adhdice_focus_active_sessions enable row level security;
alter table public.adhdice_task_focus_days enable row level security;
alter table public.adhdice_task_grid_layouts enable row level security;

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

create trigger adhdice_task_grid_layouts_set_updated_at
  before update on public.adhdice_task_grid_layouts
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_focus_categories;
alter publication supabase_realtime add table public.adhdice_focus_sessions;
alter publication supabase_realtime add table public.adhdice_focus_active_sessions;
alter publication supabase_realtime add table public.adhdice_task_focus_days;
alter publication supabase_realtime add table public.adhdice_task_grid_layouts;

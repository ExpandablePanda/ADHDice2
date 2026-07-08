alter table public.adhdice_focus_categories
  add column if not exists priority_level smallint not null default 3 check (priority_level between 1 and 5),
  add column if not exists target_distribution_mode text not null default 'auto' check (target_distribution_mode in ('auto', 'manual')),
  add column if not exists weekday_target_seconds jsonb not null default '{}'::jsonb,
  add column if not exists count_toward_productive_goal boolean,
  add column if not exists allow_daily_surplus_reduction boolean,
  add column if not exists weekly_surplus_carryover_mode text not null default 'off' check (weekly_surplus_carryover_mode in ('off', 'cap25', 'cap50', 'full'));

create table if not exists public.adhdice_focus_daily_goal_adjustments (
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

create index if not exists adhdice_focus_daily_goal_adjustments_user_date_idx
  on public.adhdice_focus_daily_goal_adjustments (user_id, adjustment_date desc, created_at desc);

create index if not exists adhdice_focus_daily_goal_adjustments_target_idx
  on public.adhdice_focus_daily_goal_adjustments (user_id, target_category_id, adjustment_date desc);

alter table public.adhdice_focus_daily_goal_adjustments enable row level security;

drop policy if exists "Users can read their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments;
create policy "Users can read their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments;
create policy "Users can create their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments;
create policy "Users can update their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments;
create policy "Users can delete their own focus daily goal adjustments"
  on public.adhdice_focus_daily_goal_adjustments
  for delete
  using (auth.uid() = user_id);

drop trigger if exists adhdice_focus_daily_goal_adjustments_set_updated_at
  on public.adhdice_focus_daily_goal_adjustments;
create trigger adhdice_focus_daily_goal_adjustments_set_updated_at
  before update on public.adhdice_focus_daily_goal_adjustments
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_focus_daily_goal_adjustments;

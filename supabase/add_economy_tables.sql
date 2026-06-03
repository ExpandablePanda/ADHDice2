-- Economy backbone migration
-- Adds RPG economy columns to existing user profiles table,
-- then creates task_events and point_ledger tables.

-- 1. Extend adhdice_user_profiles with economy fields
alter table public.adhdice_user_profiles
  add column if not exists level integer not null default 1,
  add column if not exists xp integer not null default 0,
  add column if not exists points integer not null default 0,
  add column if not exists tokens integer not null default 0;

-- 2. Task events — one row per meaningful task action
create table if not exists public.adhdice_task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  event_type text not null check (event_type in ('completed', 'missed', 'streak_bonus')),
  awarded_points integer not null default 0,
  awarded_xp integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists adhdice_task_events_user_idx on public.adhdice_task_events(user_id);
create index if not exists adhdice_task_events_task_idx on public.adhdice_task_events(task_id);

alter table public.adhdice_task_events enable row level security;
create policy "Users manage own task events"
  on public.adhdice_task_events for all
  using (auth.uid() = user_id);

-- 3. Point ledger — append-only audit trail of every balance change
create table if not exists public.adhdice_point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  balance_after integer not null,
  source text not null check (source in ('task', 'focus', 'roll', 'manual', 'system', 'health')),
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists adhdice_point_ledger_user_idx on public.adhdice_point_ledger(user_id);

alter table public.adhdice_point_ledger enable row level security;
create policy "Users manage own ledger"
  on public.adhdice_point_ledger for all
  using (auth.uid() = user_id);

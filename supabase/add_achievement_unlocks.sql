-- Achievement unlock persistence
-- Stores one row per earned face or charged die so XP can be awarded once.

create table if not exists public.adhdice_achievement_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  achievement_kind text not null check (achievement_kind in ('face', 'charged_die')),
  set_code text not null,
  face_level integer check (face_level between 1 and 6),
  title text not null,
  description text not null,
  encouragement text not null,
  reward_xp integer not null default 0 check (reward_xp >= 0),
  earned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create index if not exists adhdice_achievement_unlocks_user_earned_idx
  on public.adhdice_achievement_unlocks(user_id, earned_at desc, created_at desc);

alter table public.adhdice_achievement_unlocks enable row level security;

create policy "Users can read own achievement unlocks"
  on public.adhdice_achievement_unlocks
  for select
  using (auth.uid() = user_id);

create policy "Users can append own achievement unlocks"
  on public.adhdice_achievement_unlocks
  for insert
  with check (auth.uid() = user_id);

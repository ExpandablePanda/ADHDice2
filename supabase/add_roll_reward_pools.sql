-- Roll rewards v2
-- Separates pool-driven roll rewards from token-based vault prizes.

create table if not exists public.adhdice_roll_reward_pool_prizes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null check (tier in ('small', 'big')),
  name text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adhdice_roll_reward_pool_prizes_user_idx
  on public.adhdice_roll_reward_pool_prizes(user_id, tier, sort_order, created_at);

alter table public.adhdice_roll_reward_pool_prizes enable row level security;

drop policy if exists "Users manage own roll reward pool prizes" on public.adhdice_roll_reward_pool_prizes;
create policy "Users manage own roll reward pool prizes"
  on public.adhdice_roll_reward_pool_prizes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

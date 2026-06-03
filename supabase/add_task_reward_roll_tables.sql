-- Task reward roll persistence
-- Stores full task-completion reward breakdowns and per-task daily claims.

create table if not exists public.adhdice_task_reward_rolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_date date not null,
  mode text not null check (mode in ('single', 'batch')),
  streak_tier_label text,
  streak_length integer not null default 0 check (streak_length >= 0),
  eligible_task_count integer not null check (eligible_task_count > 0),
  base_rolls jsonb not null default '[]'::jsonb,
  base_points integer not null check (base_points >= 0),
  multiplier_roll integer not null check (multiplier_roll >= 1 and multiplier_roll <= 6),
  final_points integer not null check (final_points >= 0),
  awarded_xp integer not null check (awarded_xp >= 0),
  awarded_tokens integer not null check (awarded_tokens >= 0),
  created_at timestamptz not null default now()
);

create index if not exists adhdice_task_reward_rolls_user_date_idx
  on public.adhdice_task_reward_rolls(user_id, reward_date desc, created_at desc);

alter table public.adhdice_task_reward_rolls enable row level security;

create policy "Users can read own task reward rolls"
  on public.adhdice_task_reward_rolls
  for select
  using (auth.uid() = user_id);

create policy "Users can append own task reward rolls"
  on public.adhdice_task_reward_rolls
  for insert
  with check (auth.uid() = user_id);

create table if not exists public.adhdice_task_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  reward_roll_id uuid not null references public.adhdice_task_reward_rolls(id) on delete cascade,
  reward_date date not null,
  awarded_token boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, task_id, reward_date)
);

create index if not exists adhdice_task_reward_claims_user_date_idx
  on public.adhdice_task_reward_claims(user_id, reward_date desc, created_at desc);

create index if not exists adhdice_task_reward_claims_task_idx
  on public.adhdice_task_reward_claims(task_id);

alter table public.adhdice_task_reward_claims enable row level security;

create policy "Users can read own task reward claims"
  on public.adhdice_task_reward_claims
  for select
  using (auth.uid() = user_id);

create policy "Users can append own task reward claims"
  on public.adhdice_task_reward_claims
  for insert
  with check (auth.uid() = user_id);

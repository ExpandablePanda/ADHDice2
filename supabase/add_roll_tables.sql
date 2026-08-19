-- Roll system migration
-- Prize board cells and roll history.

-- Roll history — one row per roll
create table if not exists public.adhdice_roll_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  roll_result integer not null check (roll_result between 1 and 20),
  points_spent integer not null default 50,
  prize_label text,
  rolled_at timestamptz not null default now()
);

create index if not exists adhdice_roll_history_user_idx on public.adhdice_roll_history(user_id);

alter table public.adhdice_roll_history enable row level security;
create policy "Users manage own roll history"
  on public.adhdice_roll_history for all
  using (auth.uid() = user_id);

-- Roll system migration
-- Prize board cells and roll history.

-- 1. Prize board — 20 cells per user, each can have a custom label
create table if not exists public.adhdice_prize_board (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cell_number integer not null check (cell_number between 1 and 20),
  label text not null default '',
  is_claimed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cell_number)
);

create index if not exists adhdice_prize_board_user_idx on public.adhdice_prize_board(user_id);

alter table public.adhdice_prize_board enable row level security;
create policy "Users manage own prize board"
  on public.adhdice_prize_board for all
  using (auth.uid() = user_id);

-- 2. Roll history — one row per roll
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

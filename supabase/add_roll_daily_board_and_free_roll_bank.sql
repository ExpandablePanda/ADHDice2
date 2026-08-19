alter table public.adhdice_user_profiles
  add column if not exists free_roll_bank integer not null default 0 check (free_roll_bank >= 0);

create table if not exists public.adhdice_roll_daily_boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  board_date date not null,
  assignments_json text not null default '[]',
  claimed_prize_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, board_date)
);

create index if not exists adhdice_roll_daily_boards_user_idx
  on public.adhdice_roll_daily_boards(user_id, board_date desc);

alter table public.adhdice_roll_daily_boards enable row level security;

drop policy if exists "Users manage own daily roll boards" on public.adhdice_roll_daily_boards;
create policy "Users manage own daily roll boards"
  on public.adhdice_roll_daily_boards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.adhdice_user_profiles
  add column if not exists free_roll_bank integer not null default 0 check (free_roll_bank >= 0);

create table if not exists public.adhdice_roll_master_prizes (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adhdice_roll_master_prizes_sort_idx
  on public.adhdice_roll_master_prizes(is_active, sort_order, created_at);

alter table public.adhdice_roll_master_prizes enable row level security;

drop policy if exists "Authenticated users read roll master prizes" on public.adhdice_roll_master_prizes;
create policy "Authenticated users read roll master prizes"
  on public.adhdice_roll_master_prizes for select
  using (auth.uid() is not null);

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

delete from public.adhdice_roll_master_prizes;

insert into public.adhdice_roll_master_prizes (name, sort_order, is_active)
values
  ('Bank a free roll', 0, true),
  ('Bank 2 free rolls', 1, true),
  ('Bank 3 free rolls', 2, true),
  ('If Next Roll is Over 17 - Bank 5 Rolls', 3, true),
  ('Choose Any Small Prize', 4, true),
  ('1 Token', 5, true),
  ('2 Tokens', 6, true),
  ('3 Tokens', 7, true),
  ('4 Tokens', 8, true),
  ('5 Tokens', 9, true),
  ('Choose Any Big Prize', 10, true),
  ('If Next Roll is Over 17 - 10 Tokens', 11, true);

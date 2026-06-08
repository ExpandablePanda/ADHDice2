create table if not exists public.adhdice_roll_prize_basket (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prize_name text not null default '',
  prize_tier text not null check (prize_tier in ('small', 'big', 'master')),
  quantity integer not null default 1 check (quantity > 0),
  source_label text,
  roll_result integer check (roll_result between 1 and 20),
  is_claimed boolean not null default false,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adhdice_roll_prize_basket_user_idx
  on public.adhdice_roll_prize_basket(user_id, is_claimed, created_at desc);

alter table public.adhdice_roll_prize_basket enable row level security;

drop policy if exists "Users manage own roll prize basket" on public.adhdice_roll_prize_basket;
create policy "Users manage own roll prize basket"
  on public.adhdice_roll_prize_basket for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

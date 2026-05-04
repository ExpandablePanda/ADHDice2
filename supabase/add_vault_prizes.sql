-- Vault prizes migration

create table if not exists public.adhdice_vault_prizes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  tier text not null default 'small' check (tier in ('small', 'big', 'master')),
  token_cost integer not null default 10,
  linked_task_ids text[] not null default '{}',
  is_claimed boolean not null default false,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adhdice_vault_prizes_user_idx on public.adhdice_vault_prizes(user_id);

alter table public.adhdice_vault_prizes enable row level security;
create policy "Users manage own vault prizes"
  on public.adhdice_vault_prizes for all
  using (auth.uid() = user_id);

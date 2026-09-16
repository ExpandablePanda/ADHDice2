-- ADHDice 7.13.0: additive Pursuit and Pursuit Activity foundation.
-- Authored only. Apply manually after review; this migration is not run by the app.

begin;

create table if not exists public.adhdice_pursuits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_pursuit_id uuid,
  title text not null check (char_length(trim(title)) > 0),
  notes text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  revisit_interval_days integer check (revisit_interval_days is null or revisit_interval_days > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint adhdice_pursuits_parent_fk
    foreign key (user_id, parent_pursuit_id)
    references public.adhdice_pursuits (user_id, id)
    on delete restrict
);

create table if not exists public.adhdice_pursuit_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pursuit_id uuid not null,
  occurred_at timestamptz not null default now(),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint adhdice_pursuit_activities_pursuit_fk
    foreign key (user_id, pursuit_id)
    references public.adhdice_pursuits (user_id, id)
    on delete cascade
);

create index if not exists adhdice_pursuits_user_parent_idx
  on public.adhdice_pursuits (user_id, parent_pursuit_id, sort_order, created_at desc);
create index if not exists adhdice_pursuits_user_status_idx
  on public.adhdice_pursuits (user_id, status, sort_order, created_at desc);
create index if not exists adhdice_pursuit_activities_user_recent_idx
  on public.adhdice_pursuit_activities (user_id, occurred_at desc, created_at desc);
create index if not exists adhdice_pursuit_activities_pursuit_recent_idx
  on public.adhdice_pursuit_activities (user_id, pursuit_id, occurred_at desc, created_at desc);

alter table public.adhdice_pursuits enable row level security;
alter table public.adhdice_pursuit_activities enable row level security;

revoke all on table public.adhdice_pursuits from anon, authenticated;
revoke all on table public.adhdice_pursuit_activities from anon, authenticated;
grant select, insert, update, delete on table public.adhdice_pursuits to authenticated;
grant select, insert, update, delete on table public.adhdice_pursuit_activities to authenticated;

drop policy if exists "Users can manage their own pursuits" on public.adhdice_pursuits;
create policy "Users can manage their own pursuits"
  on public.adhdice_pursuits
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own pursuit activities" on public.adhdice_pursuit_activities;
create policy "Users can manage their own pursuit activities"
  on public.adhdice_pursuit_activities
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists adhdice_pursuits_set_updated_at on public.adhdice_pursuits;
create trigger adhdice_pursuits_set_updated_at
  before update on public.adhdice_pursuits
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_pursuit_activities_set_updated_at on public.adhdice_pursuit_activities;
create trigger adhdice_pursuit_activities_set_updated_at
  before update on public.adhdice_pursuit_activities
  for each row
  execute function public.adhdice_clean_set_updated_at();

notify pgrst, 'reload schema';

commit;

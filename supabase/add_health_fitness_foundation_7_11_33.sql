begin;

create table if not exists public.adhdice_health_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null check (duration_seconds > 0),
  title text not null check (char_length(trim(title)) > 0),
  workout_type text not null check (char_length(trim(workout_type)) > 0),
  active_calories numeric check (active_calories is null or active_calories >= 0),
  notes text not null default '',
  source text not null default 'manual',
  source_external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adhdice_health_workouts_user_date_idx
  on public.adhdice_health_workouts (user_id, workout_date desc, started_at desc, created_at desc);

create unique index if not exists adhdice_health_workouts_user_source_external_id_idx
  on public.adhdice_health_workouts (user_id, source, source_external_id)
  where source_external_id is not null;

alter table public.adhdice_health_workouts enable row level security;

revoke all on table public.adhdice_health_workouts from anon;
grant select, insert, update, delete on table public.adhdice_health_workouts to authenticated;

drop policy if exists "Users can manage their own health workouts"
  on public.adhdice_health_workouts;
create policy "Users can manage their own health workouts"
  on public.adhdice_health_workouts
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists adhdice_health_workouts_set_updated_at
  on public.adhdice_health_workouts;
create trigger adhdice_health_workouts_set_updated_at
  before update on public.adhdice_health_workouts
  for each row
  execute function public.adhdice_clean_set_updated_at();

notify pgrst, 'reload schema';

commit;

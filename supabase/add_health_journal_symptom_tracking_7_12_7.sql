begin;

alter table public.adhdice_health_checkins
  drop constraint if exists adhdice_health_checkins_mood_score_check;
alter table public.adhdice_health_checkins
  drop constraint if exists adhdice_health_checkins_energy_score_check;
alter table public.adhdice_health_checkins
  drop constraint if exists adhdice_health_checkins_mood_score_range_check;
alter table public.adhdice_health_checkins
  drop constraint if exists adhdice_health_checkins_energy_score_range_check;
alter table public.adhdice_health_checkins
  add constraint adhdice_health_checkins_mood_score_range_check
    check (mood_score is null or (mood_score >= 1 and mood_score <= 10));
alter table public.adhdice_health_checkins
  add constraint adhdice_health_checkins_energy_score_range_check
    check (energy_score is null or (energy_score >= 1 and energy_score <= 10));

create table if not exists public.adhdice_health_symptoms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (
    char_length(trim(name)) > 0
    and name = regexp_replace(trim(name), '\s+', ' ', 'g')
  ),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.adhdice_health_symptom_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symptom_id uuid not null,
  entry_date date not null,
  logged_at timestamptz not null default now(),
  severity integer not null check (severity >= 1 and severity <= 10),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, symptom_id)
    references public.adhdice_health_symptoms (user_id, id)
    on delete restrict
);

create unique index if not exists adhdice_health_symptoms_user_active_name_uidx
  on public.adhdice_health_symptoms (user_id, lower(regexp_replace(trim(name), '\s+', ' ', 'g')))
  where archived_at is null;
create index if not exists adhdice_health_symptoms_user_active_name_idx
  on public.adhdice_health_symptoms (user_id, archived_at, name, created_at);
create index if not exists adhdice_health_symptom_entries_user_date_idx
  on public.adhdice_health_symptom_entries (user_id, entry_date desc, logged_at desc, created_at desc);

alter table public.adhdice_health_symptoms enable row level security;
alter table public.adhdice_health_symptom_entries enable row level security;

revoke all on table public.adhdice_health_symptoms from anon, authenticated;
revoke all on table public.adhdice_health_symptom_entries from anon, authenticated;
grant select, insert, update on table public.adhdice_health_symptoms to authenticated;
grant select, insert, update, delete on table public.adhdice_health_symptom_entries to authenticated;

drop policy if exists "Users can read their own health symptoms"
  on public.adhdice_health_symptoms;
create policy "Users can read their own health symptoms"
  on public.adhdice_health_symptoms
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own health symptoms"
  on public.adhdice_health_symptoms;
create policy "Users can create their own health symptoms"
  on public.adhdice_health_symptoms
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own health symptoms"
  on public.adhdice_health_symptoms;
create policy "Users can update their own health symptoms"
  on public.adhdice_health_symptoms
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own health symptom entries"
  on public.adhdice_health_symptom_entries;
create policy "Users can read their own health symptom entries"
  on public.adhdice_health_symptom_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own health symptom entries"
  on public.adhdice_health_symptom_entries;
create policy "Users can create their own health symptom entries"
  on public.adhdice_health_symptom_entries
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own health symptom entries"
  on public.adhdice_health_symptom_entries;
create policy "Users can update their own health symptom entries"
  on public.adhdice_health_symptom_entries
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own health symptom entries"
  on public.adhdice_health_symptom_entries;
create policy "Users can delete their own health symptom entries"
  on public.adhdice_health_symptom_entries
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists adhdice_health_symptoms_set_updated_at
  on public.adhdice_health_symptoms;
create trigger adhdice_health_symptoms_set_updated_at
  before update on public.adhdice_health_symptoms
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_symptom_entries_set_updated_at
  on public.adhdice_health_symptom_entries;
create trigger adhdice_health_symptom_entries_set_updated_at
  before update on public.adhdice_health_symptom_entries
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_health_symptoms;
alter publication supabase_realtime add table public.adhdice_health_symptom_entries;

notify pgrst, 'reload schema';

commit;

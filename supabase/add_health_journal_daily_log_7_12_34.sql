-- ADHDice 7.12.34: Journal Entry and customizable Daily Log foundation.
-- Authored only. Apply manually after review; this migration is not run by the app.

begin;

alter table public.adhdice_health_checkins
  add column if not exists stress_score integer,
  add column if not exists clarity_score integer;

alter table public.adhdice_health_checkins
  drop constraint if exists adhdice_health_checkins_stress_score_range_check,
  drop constraint if exists adhdice_health_checkins_clarity_score_range_check;

alter table public.adhdice_health_checkins
  add constraint adhdice_health_checkins_stress_score_range_check
    check (stress_score is null or (stress_score >= 1 and stress_score <= 10)),
  add constraint adhdice_health_checkins_clarity_score_range_check
    check (clarity_score is null or (clarity_score >= 1 and clarity_score <= 10));

create unique index if not exists adhdice_health_checkins_user_id_uidx
  on public.adhdice_health_checkins (user_id, id);

create table if not exists public.adhdice_health_journal_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('symptom', 'emotion', 'other')),
  symptom_id uuid,
  name text,
  low_label text not null default 'None' check (char_length(trim(low_label)) > 0),
  high_label text not null default 'Extreme' check (char_length(trim(high_label)) > 0),
  in_template boolean not null default false,
  template_sort_order integer,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint adhdice_health_journal_signals_identity_check check (
    (kind = 'symptom' and symptom_id is not null and name is null)
    or (kind in ('emotion', 'other') and symptom_id is null and name is not null and char_length(trim(name)) > 0)
  ),
  constraint adhdice_health_journal_signals_symptom_fk
    foreign key (user_id, symptom_id)
    references public.adhdice_health_symptoms (user_id, id)
    on delete restrict
);

create table if not exists public.adhdice_health_journal_signal_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journal_entry_id uuid not null,
  signal_id uuid not null,
  score integer not null check (score >= 0 and score <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, journal_entry_id, signal_id),
  constraint adhdice_health_journal_signal_values_entry_fk
    foreign key (user_id, journal_entry_id)
    references public.adhdice_health_checkins (user_id, id)
    on delete cascade,
  constraint adhdice_health_journal_signal_values_signal_fk
    foreign key (user_id, signal_id)
    references public.adhdice_health_journal_signals (user_id, id)
    on delete restrict
);

alter table public.adhdice_health_symptom_entries
  add column if not exists journal_entry_id uuid;

alter table public.adhdice_health_symptom_entries
  drop constraint if exists adhdice_health_symptom_entries_journal_entry_fk;

alter table public.adhdice_health_symptom_entries
  add constraint adhdice_health_symptom_entries_journal_entry_fk
    foreign key (user_id, journal_entry_id)
    references public.adhdice_health_checkins (user_id, id)
    on delete cascade;

create index if not exists adhdice_health_journal_signals_user_template_idx
  on public.adhdice_health_journal_signals (user_id, archived_at, in_template, template_sort_order, created_at);
create index if not exists adhdice_health_journal_signal_values_user_entry_idx
  on public.adhdice_health_journal_signal_values (user_id, journal_entry_id, signal_id);
create index if not exists adhdice_health_symptom_entries_user_journal_idx
  on public.adhdice_health_symptom_entries (user_id, journal_entry_id, logged_at desc);

alter table public.adhdice_health_journal_signals enable row level security;
alter table public.adhdice_health_journal_signal_values enable row level security;

revoke all on table public.adhdice_health_journal_signals from anon, authenticated;
revoke all on table public.adhdice_health_journal_signal_values from anon, authenticated;
grant select, insert, update, delete on table public.adhdice_health_journal_signals to authenticated;
grant select, insert, update, delete on table public.adhdice_health_journal_signal_values to authenticated;

drop policy if exists "Users can read their own health journal signals"
  on public.adhdice_health_journal_signals;
create policy "Users can read their own health journal signals"
  on public.adhdice_health_journal_signals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own health journal signals"
  on public.adhdice_health_journal_signals;
create policy "Users can create their own health journal signals"
  on public.adhdice_health_journal_signals
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own health journal signals"
  on public.adhdice_health_journal_signals;
create policy "Users can update their own health journal signals"
  on public.adhdice_health_journal_signals
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own health journal signals"
  on public.adhdice_health_journal_signals;
create policy "Users can delete their own health journal signals"
  on public.adhdice_health_journal_signals
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own health journal signal values"
  on public.adhdice_health_journal_signal_values;
create policy "Users can read their own health journal signal values"
  on public.adhdice_health_journal_signal_values
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own health journal signal values"
  on public.adhdice_health_journal_signal_values;
create policy "Users can create their own health journal signal values"
  on public.adhdice_health_journal_signal_values
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own health journal signal values"
  on public.adhdice_health_journal_signal_values;
create policy "Users can update their own health journal signal values"
  on public.adhdice_health_journal_signal_values
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own health journal signal values"
  on public.adhdice_health_journal_signal_values;
create policy "Users can delete their own health journal signal values"
  on public.adhdice_health_journal_signal_values
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists adhdice_health_journal_signals_set_updated_at
  on public.adhdice_health_journal_signals;
create trigger adhdice_health_journal_signals_set_updated_at
  before update on public.adhdice_health_journal_signals
  for each row
  execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_health_journal_signal_values_set_updated_at
  on public.adhdice_health_journal_signal_values;
create trigger adhdice_health_journal_signal_values_set_updated_at
  before update on public.adhdice_health_journal_signal_values
  for each row
  execute function public.adhdice_clean_set_updated_at();

notify pgrst, 'reload schema';

commit;

-- ADHDice 7.12.41: Journal snapshots are identified by id and may share a date.
-- This migration is authored source only. Do not apply remotely as part of this ticket.

begin;

alter table public.adhdice_health_checkins
  add column if not exists entry_time time without time zone;

-- The database cannot safely infer each user's historical client timezone. UTC
-- time-of-day is therefore a deterministic fallback; newly written rows use
-- the user's local entry time from the Journal editor.
update public.adhdice_health_checkins
set entry_time = (created_at at time zone 'UTC')::time
where entry_time is null;

alter table public.adhdice_health_checkins
  alter column entry_time set not null;

alter table public.adhdice_health_checkins
  drop constraint if exists adhdice_health_checkins_user_id_entry_date_key;

drop index if exists public.adhdice_health_checkins_user_date_idx;

create index if not exists adhdice_health_checkins_user_date_idx
  on public.adhdice_health_checkins (user_id, entry_date desc, entry_time desc, created_at desc);

create table if not exists public.adhdice_health_journal_signal_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journal_entry_id uuid not null,
  signal_id uuid not null,
  entry_date date not null,
  occurred_at timestamptz not null,
  score integer not null check (score between 1 and 10),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint adhdice_health_journal_signal_occurrences_entry_fk
    foreign key (user_id, journal_entry_id)
    references public.adhdice_health_checkins (user_id, id)
    on delete cascade,
  constraint adhdice_health_journal_signal_occurrences_signal_fk
    foreign key (user_id, signal_id)
    references public.adhdice_health_journal_signals (user_id, id)
    on delete restrict
);

create index if not exists adhdice_health_journal_signal_occurrences_user_date_idx
  on public.adhdice_health_journal_signal_occurrences (user_id, entry_date desc, occurred_at desc);
create index if not exists adhdice_health_journal_signal_occurrences_journal_idx
  on public.adhdice_health_journal_signal_occurrences (journal_entry_id, occurred_at);
create index if not exists adhdice_health_journal_signal_occurrences_signal_idx
  on public.adhdice_health_journal_signal_occurrences (signal_id, occurred_at);

alter table public.adhdice_health_journal_signal_occurrences enable row level security;
revoke all on table public.adhdice_health_journal_signal_occurrences from anon, authenticated;
grant select, insert, update, delete on table public.adhdice_health_journal_signal_occurrences to authenticated;

create policy "Users can read their own health journal signal occurrences"
  on public.adhdice_health_journal_signal_occurrences
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create their own health journal signal occurrences"
  on public.adhdice_health_journal_signal_occurrences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own health journal signal occurrences"
  on public.adhdice_health_journal_signal_occurrences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own health journal signal occurrences"
  on public.adhdice_health_journal_signal_occurrences
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger adhdice_health_journal_signal_occurrences_set_updated_at
  before update on public.adhdice_health_journal_signal_occurrences
  for each row
  execute function public.adhdice_clean_set_updated_at();

notify pgrst, 'reload schema';

commit;

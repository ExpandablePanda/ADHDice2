-- ADHDice 7.16.112: Preserve explicit approximate-time flags for Journal Events.
-- This migration is authored source only. Do not apply remotely as part of this ticket.

begin;

alter table public.adhdice_health_symptom_entries
  add column if not exists time_is_estimated boolean not null default false;

alter table public.adhdice_health_journal_signal_occurrences
  add column if not exists time_is_estimated boolean not null default false;

notify pgrst, 'reload schema';

commit;

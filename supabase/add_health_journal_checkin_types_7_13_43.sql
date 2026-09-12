-- ADHDice 7.13.43: type-driven Journal entries and historical check-in answers.
-- Authored source only. Apply manually after review; this migration is not run by the app.

begin;

alter table public.adhdice_health_profiles
  add column if not exists journal_questions jsonb not null default '[]'::jsonb;

alter table public.adhdice_health_profiles
  drop constraint if exists adhdice_health_profiles_journal_questions_array_check;

alter table public.adhdice_health_profiles
  add constraint adhdice_health_profiles_journal_questions_array_check
    check (jsonb_typeof(journal_questions) = 'array');

alter table public.adhdice_health_checkins
  add column if not exists entry_type text;

alter table public.adhdice_health_checkins
  add column if not exists structured_answers jsonb not null default '{}'::jsonb;

alter table public.adhdice_health_checkins
  drop constraint if exists adhdice_health_checkins_entry_type_check;

alter table public.adhdice_health_checkins
  add constraint adhdice_health_checkins_entry_type_check
    check (entry_type is null or entry_type in ('start_of_day', 'end_of_day', 'event'));

alter table public.adhdice_health_checkins
  drop constraint if exists adhdice_health_checkins_structured_answers_object_check;

alter table public.adhdice_health_checkins
  add constraint adhdice_health_checkins_structured_answers_object_check
    check (jsonb_typeof(structured_answers) = 'object');

notify pgrst, 'reload schema';

commit;

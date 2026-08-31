-- ADHDice 7.12.37: persistent colors for Journal-native Feelings.
-- Authored only. Apply manually after review; this migration is not run by the app.

begin;

alter table public.adhdice_health_journal_signals
  add column if not exists color text;

update public.adhdice_health_journal_signals
set color = null
where kind = 'symptom'
  and color is not null;

update public.adhdice_health_journal_signals
set color = '#6f57f6'
where kind in ('emotion', 'other')
  and (color is null or color !~ '^#[0-9A-Fa-f]{6}$');

alter table public.adhdice_health_journal_signals
  drop constraint if exists adhdice_health_journal_signals_color_check;

alter table public.adhdice_health_journal_signals
  add constraint adhdice_health_journal_signals_color_check check (
    (kind = 'symptom' and color is null)
    or (kind in ('emotion', 'other') and color is not null and color ~ '^#[0-9A-Fa-f]{6}$')
  );

notify pgrst, 'reload schema';

commit;

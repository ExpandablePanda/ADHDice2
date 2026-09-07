-- ADHDice 7.12.35: full editable Journal Feeling scale labels.
-- Authored only. Apply manually after review; this migration is not run by the app.

begin;

alter table public.adhdice_health_journal_signals
  add column if not exists scale_labels text[];

update public.adhdice_health_journal_signals
set scale_labels = case kind
  when 'symptom' then array[
    coalesce(nullif(trim(low_label), ''), 'None'),
    'Barely noticeable',
    'Very mild',
    'Mild',
    'Mild to moderate',
    'Moderate',
    'Moderately strong',
    'Strong',
    'Severe',
    'Very severe',
    coalesce(nullif(trim(high_label), ''), 'Extreme')
  ]::text[]
  when 'emotion' then array[
    coalesce(nullif(trim(low_label), ''), 'None'),
    'Barely',
    'Very slight',
    'Slight',
    'Mild',
    'Moderate',
    'Noticeable',
    'Strong',
    'Very strong',
    'Intense',
    coalesce(nullif(trim(high_label), ''), 'Extreme')
  ]::text[]
  else array[
    coalesce(nullif(trim(low_label), ''), 'None'),
    'Very low',
    'Low',
    'Slightly low',
    'Below average',
    'Moderate',
    'Above average',
    'High',
    'Very high',
    'Intense',
    coalesce(nullif(trim(high_label), ''), 'Extreme')
  ]::text[]
end
where scale_labels is null or cardinality(scale_labels) <> 11;

alter table public.adhdice_health_journal_signals
  alter column scale_labels set default array['None', 'Barely', 'Very slight', 'Slight', 'Mild', 'Moderate', 'Noticeable', 'Strong', 'Very strong', 'Intense', 'Extreme']::text[],
  alter column scale_labels set not null;

update public.adhdice_health_journal_signals
set low_label = scale_labels[1],
    high_label = scale_labels[11]
where scale_labels is not null and cardinality(scale_labels) = 11;

alter table public.adhdice_health_journal_signals
  drop constraint if exists adhdice_health_journal_signals_scale_labels_length_check;

alter table public.adhdice_health_journal_signals
  add constraint adhdice_health_journal_signals_scale_labels_length_check
    check (cardinality(scale_labels) = 11);

notify pgrst, 'reload schema';

commit;

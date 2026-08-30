begin;

alter table public.adhdice_health_symptoms
  add column if not exists color text;

update public.adhdice_health_symptoms
set color = '#6f57f6'
where color is null
   or color !~ '^#[0-9A-Fa-f]{6}$';

alter table public.adhdice_health_symptoms
  alter column color set default '#6f57f6',
  alter column color set not null;

alter table public.adhdice_health_symptoms
  drop constraint if exists adhdice_health_symptoms_color_hex_check;
alter table public.adhdice_health_symptoms
  add constraint adhdice_health_symptoms_color_hex_check
  check (color ~ '^#[0-9A-Fa-f]{6}$');

notify pgrst, 'reload schema';

commit;

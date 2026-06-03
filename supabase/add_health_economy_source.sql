alter table public.adhdice_point_ledger
  drop constraint if exists adhdice_point_ledger_source_check;

alter table public.adhdice_point_ledger
  add constraint adhdice_point_ledger_source_check
  check (source in ('task', 'focus', 'roll', 'manual', 'system', 'health'));

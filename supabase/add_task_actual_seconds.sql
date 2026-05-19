alter table public.adhdice_clean_tasks
  add column if not exists actual_seconds integer not null default 0
  check (actual_seconds >= 0);

alter table public.adhdice_clean_tasks
  add column if not exists pinned_at timestamptz,
  add column if not exists pin_order integer;

create index if not exists adhdice_clean_tasks_user_pinned_idx
  on public.adhdice_clean_tasks (user_id, pinned_at desc nulls last, pin_order asc nulls last);

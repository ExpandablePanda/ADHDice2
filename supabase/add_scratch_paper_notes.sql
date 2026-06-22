create table if not exists public.adhdice_scratch_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  body text not null default '',
  status text not null default 'active' check (status in ('active', 'resolved', 'trashed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  trashed_at timestamptz
);

create table if not exists public.adhdice_scratch_note_task_links (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.adhdice_scratch_notes(id) on delete cascade,
  task_id uuid not null references public.adhdice_clean_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (note_id, task_id)
);

create index if not exists adhdice_scratch_notes_user_status_updated_idx
  on public.adhdice_scratch_notes (user_id, status, updated_at desc);

create index if not exists adhdice_scratch_note_task_links_user_note_idx
  on public.adhdice_scratch_note_task_links (user_id, note_id);

alter table public.adhdice_scratch_notes enable row level security;
alter table public.adhdice_scratch_note_task_links enable row level security;

drop policy if exists "Users manage own scratch notes" on public.adhdice_scratch_notes;
create policy "Users manage own scratch notes"
  on public.adhdice_scratch_notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own scratch note task links" on public.adhdice_scratch_note_task_links;
create policy "Users manage own scratch note task links"
  on public.adhdice_scratch_note_task_links
  for all
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.adhdice_scratch_notes note
      where note.id = note_id
        and note.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.adhdice_scratch_notes note
      where note.id = note_id
        and note.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.adhdice_clean_tasks task
      where task.id = task_id
        and task.user_id = auth.uid()
    )
  );

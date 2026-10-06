-- ADHDice 7.16.93 Voice Memo V1.
-- Source-only migration: review and apply through the authorized Supabase workflow.

create table if not exists public.adhdice_voice_memos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds integer not null check (duration_seconds >= 0),
  origin_kind text not null check (origin_kind in ('home_scratchpad', 'scratch_note', 'memo_library')),
  scratch_note_id uuid references public.adhdice_scratch_notes(id) on delete set null,
  transcript text,
  transcribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path like (user_id::text || '/%')),
  check (origin_kind = 'scratch_note' or scratch_note_id is null)
);

create index if not exists adhdice_voice_memos_user_created_idx
  on public.adhdice_voice_memos (user_id, created_at desc);

create index if not exists adhdice_voice_memos_user_scratch_note_created_idx
  on public.adhdice_voice_memos (user_id, scratch_note_id, created_at desc);

alter table public.adhdice_voice_memos enable row level security;

drop policy if exists "Users select own voice memos" on public.adhdice_voice_memos;
create policy "Users select own voice memos"
  on public.adhdice_voice_memos
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own voice memos" on public.adhdice_voice_memos;
create policy "Users insert own voice memos"
  on public.adhdice_voice_memos
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      scratch_note_id is null
      or exists (
        select 1
        from public.adhdice_scratch_notes note
        where note.id = scratch_note_id
          and note.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users update own voice memos" on public.adhdice_voice_memos;
create policy "Users update own voice memos"
  on public.adhdice_voice_memos
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      scratch_note_id is null
      or exists (
        select 1
        from public.adhdice_scratch_notes note
        where note.id = scratch_note_id
          and note.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users delete own voice memos" on public.adhdice_voice_memos;
create policy "Users delete own voice memos"
  on public.adhdice_voice_memos
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.adhdice_voice_memos from anon;
grant select, insert, update, delete on table public.adhdice_voice_memos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'adhdice-voice-memos',
  'adhdice-voice-memos',
  false,
  10485760,
  array[
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users select own ADHDice Voice Memo objects" on storage.objects;
create policy "Users select own ADHDice Voice Memo objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'adhdice-voice-memos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users insert own ADHDice Voice Memo objects" on storage.objects;
create policy "Users insert own ADHDice Voice Memo objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'adhdice-voice-memos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users delete own ADHDice Voice Memo objects" on storage.objects;
create policy "Users delete own ADHDice Voice Memo objects"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'adhdice-voice-memos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

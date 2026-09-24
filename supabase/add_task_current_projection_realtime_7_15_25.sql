-- ADHDice 7.15.25 Current Task projection Realtime publication.
--
-- Forward, publication-only patch for the first browser current-read consumer
-- cutover. This does not create, update, delete, backfill, or recalculate any
-- projection rows and does not recreate supabase_realtime.

begin;

do $guard$
begin
  if to_regclass('public.adhdice_task_current_projections') is null then
    raise exception '7.15.25 projection Realtime requires the projection table.';
  end if;

  if not exists (
    select 1
      from pg_publication
     where pubname = 'supabase_realtime'
  ) then
    raise exception '7.15.25 projection Realtime requires supabase_realtime.';
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'adhdice_task_current_projections'
  ) then
    alter publication supabase_realtime
      add table public.adhdice_task_current_projections;
  end if;
end;
$guard$;

commit;

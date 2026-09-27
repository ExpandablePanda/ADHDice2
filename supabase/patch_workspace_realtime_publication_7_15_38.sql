-- ADHDice 7.15.38 workspace Postgres Changes publication contract repair.
--
-- Keep the shared workspace channel's table bindings and the live
-- supabase_realtime publication one-to-one. This is intentionally additive:
-- it does not recreate the publication, remove existing tables, or change row
-- data, RLS, or table behavior.

begin;

do $$
declare
  table_name text;
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception '7.15.38 workspace Realtime repair requires supabase_realtime';
  end if;

  foreach table_name in array array[
    'adhdice_task_list_folders',
    'adhdice_task_content_folders',
    'adhdice_task_list_containers',
    'adhdice_task_list_rail_items',
    'adhdice_focus_categories',
    'adhdice_task_focus_days',
    'adhdice_task_lists',
    'adhdice_task_list_manual_memberships',
    'adhdice_notes',
    'adhdice_task_history_facts'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null
       and not exists (
         select 1
         from pg_publication_rel publication_relation
         join pg_class relation on relation.oid = publication_relation.prrelid
         join pg_namespace namespace on namespace.oid = relation.relnamespace
         join pg_publication publication on publication.oid = publication_relation.prpubid
         where publication.pubname = 'supabase_realtime'
           and namespace.nspname = 'public'
           and relation.relname = table_name
       ) then
      execute format(
        'alter publication supabase_realtime add table %I.%I',
        'public',
        table_name
      );
    end if;
  end loop;
end
$$;

commit;

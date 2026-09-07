-- ADHDice 7.12.43: every Feeling Occurrence belongs to a Journal Entry.
-- Authored source only. Do not apply remotely as part of this ticket.

begin;

-- Existing orphaned rows are confirmed test data and have no safe owner to infer.
delete from public.adhdice_health_symptom_entries
 where journal_entry_id is null;

alter table public.adhdice_health_symptom_entries
  alter column journal_entry_id set not null;

-- Fail closed if the Journal ownership FK was changed or removed upstream.
do $function$
declare
  v_delete_action "char";
begin
  select constraint_ref.confdeltype
    into v_delete_action
    from pg_constraint as constraint_ref
    join pg_class as table_ref on table_ref.oid = constraint_ref.conrelid
    join pg_namespace as namespace_ref on namespace_ref.oid = table_ref.relnamespace
   where namespace_ref.nspname = 'public'
     and table_ref.relname = 'adhdice_health_symptom_entries'
     and constraint_ref.conname = 'adhdice_health_symptom_entries_journal_entry_fk';

  if v_delete_action is distinct from 'c' then
    raise exception 'Expected Journal ownership FK with ON DELETE CASCADE was not found';
  end if;
end;
$function$;

notify pgrst, 'reload schema';

commit;

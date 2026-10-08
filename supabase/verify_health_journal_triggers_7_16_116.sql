-- Read-only verification for add_health_journal_triggers_7_16_116.sql.
-- Run manually after applying the migration; this file performs no writes.

select c.relname as table_name, c.relrowsecurity as row_security_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'adhdice_health_journal_triggers',
    'adhdice_health_journal_trigger_links'
  )
  and c.relkind = 'r'
order by c.relname;

select tc.table_name, tc.constraint_name, tc.constraint_type
from information_schema.table_constraints tc
where tc.constraint_schema = 'public'
  and tc.table_name in (
    'adhdice_health_journal_triggers',
    'adhdice_health_journal_trigger_links'
  )
order by tc.table_name, tc.constraint_type, tc.constraint_name;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'adhdice_health_journal_triggers',
    'adhdice_health_journal_trigger_links'
  )
order by tablename, indexname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'adhdice_health_journal_triggers',
    'adhdice_health_journal_trigger_links'
  )
order by tablename, policyname;

select conrelid::regclass as table_name, conname, confrelid::regclass as referenced_table,
       confdeltype as delete_action, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid in (
    'public.adhdice_health_journal_triggers'::regclass,
    'public.adhdice_health_journal_trigger_links'::regclass
  )
  and contype = 'f'
order by table_name, conname;

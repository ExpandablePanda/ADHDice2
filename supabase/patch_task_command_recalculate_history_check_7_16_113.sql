-- ADHDice 7.16.113: allow canonical History recalculation command operations.
-- Source-only migration. Do not execute or deploy from this workspace.
-- Validate the existing constraint before replacing it; no operation rows are
-- changed by this migration.

begin;

do $migration$
declare
  constraint_definition text;
  constraint_column smallint[];
  command_type_column smallint;
  actual_command_types text[];
  expected_command_types constant text[] := array[
    'set_outcome', 'clear_outcome', 'complete_task', 'delay_occurrence',
    'set_due_date', 'set_repeat', 'calendar_override', 'clear_quota_balance',
    'archive_task', 'trash_task', 'restore_task', 'start_in_progress',
    'clear_in_progress', 'reconcile_rollover', 'hierarchy_change'
  ];
begin
  if to_regclass('public.adhdice_task_command_operations') is null then
    raise exception 'The canonical Task command operations table is required before 7.16.113.';
  end if;

  select pg_get_constraintdef(constraint_row.oid), constraint_row.conkey,
         command_column.attnum
    into constraint_definition, constraint_column, command_type_column
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    join pg_attribute command_column
      on command_column.attrelid = table_row.oid
     and command_column.attname = 'command_type'
     and not command_column.attisdropped
   where schema_row.nspname = 'public'
     and table_row.relname = 'adhdice_task_command_operations'
     and constraint_row.conname = 'adhdice_task_command_operations_command_type_check'
     and constraint_row.contype = 'c';

  if constraint_definition is null then
    raise exception 'The expected command_type CHECK constraint is missing.';
  end if;
  if constraint_column <> array[command_type_column]::smallint[] then
    raise exception 'The command_type CHECK constraint unexpectedly covers other columns.';
  end if;
  if constraint_definition !~* '^CHECK\s*\(\s*\(?\s*command_type\s*=\s*ANY\s*\(\s*ARRAY\s*\[.*\]\s*(::text\[\])?\s*\)\s*\)?\s*\)$' then
    raise exception 'The command_type CHECK constraint definition differs unexpectedly: %', constraint_definition;
  end if;

  select array_agg(match[1] order by match[1])
    into actual_command_types
    from regexp_matches(constraint_definition, '''([^'']+)''', 'g') as matches(match);

  if actual_command_types is distinct from (
    select array_agg(command_type order by command_type)
      from unnest(expected_command_types) as allowed(command_type)
  ) then
    raise exception 'The allowed command_type values differ from the expected prior list: %', actual_command_types;
  end if;

  alter table public.adhdice_task_command_operations
    drop constraint adhdice_task_command_operations_command_type_check;
  alter table public.adhdice_task_command_operations
    add constraint adhdice_task_command_operations_command_type_check check (command_type in (
      'set_outcome', 'clear_outcome', 'complete_task', 'delay_occurrence',
      'set_due_date', 'set_repeat', 'calendar_override', 'clear_quota_balance',
      'archive_task', 'trash_task', 'restore_task', 'start_in_progress',
      'clear_in_progress', 'reconcile_rollover', 'hierarchy_change',
      'recalculate_history'
    ));
end;
$migration$;

commit;

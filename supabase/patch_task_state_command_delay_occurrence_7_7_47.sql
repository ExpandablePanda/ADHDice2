-- ADHDice 7.7.47 canonical Delay contract correction.
-- Apply after add_task_state_command_rpc.sql. This updates only the stale
-- Delay payload predicate on the installed function; it does not execute the
-- command RPC or alter any canonical data.

do $migration$
declare
  v_definition text;
  v_old text := $$or v_effective_override = '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_occurrence <> '{}'::jsonb or v_calendar_override <> '{}'::jsonb$$;
  v_new text := $$or v_effective_override = '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_occurrence = '{}'::jsonb or v_calendar_override <> '{}'::jsonb$$;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'adhdice_execute_task_state_command'
     and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_command jsonb';

  if v_definition is null then
    raise exception 'Canonical Task State command RPC is not installed.';
  end if;
  if position(v_old in v_definition) = 0 then
    raise exception 'Canonical Delay payload predicate was not found.';
  end if;

  execute replace(v_definition, v_old, v_new);
end;
$migration$;

revoke all on function public.adhdice_execute_task_state_command(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_execute_task_state_command(uuid, jsonb) to service_role;

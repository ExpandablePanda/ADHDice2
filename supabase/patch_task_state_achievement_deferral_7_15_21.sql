-- ADHDice 7.15.21 canonical Task State Achievement-deferral correction.
-- Source-only forward patch. It changes only the existing command RPC's
-- transaction-local deferral contract; it does not rewrite Achievement
-- qualification, occurrence identity, source capture, tiers, progress, or
-- reward semantics.

begin;

do $guard$
begin
  if to_regprocedure('public.adhdice_execute_task_state_command(uuid,jsonb)') is null then
    raise exception 'Canonical Task State command RPC is not installed.';
  end if;
  if to_regprocedure('public.adhdice_execute_task_state_command_deferred_achievements(uuid,jsonb)') is null then
    raise exception 'Deferred Achievement command wrapper is not installed.';
  end if;
  if to_regprocedure('public.adhdice_finalize_task_history_batch_achievements(uuid,uuid)') is null then
    raise exception 'Achievement finalizer RPC is not installed.';
  end if;
end;
$guard$;

do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_match_count integer;
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
  if position('v_achievement_deferred_for_command' in v_definition) > 0 then
    raise exception '7.15.21 Achievement-deferral correction already appears to be installed.';
  end if;

  v_old := $old$v_operation_is_new[[:space:]]+boolean[[:space:]]*:=[[:space:]]*false;$old$;
  v_new := $new$v_operation_is_new boolean := false;
  v_achievement_deferred_user_id text;
  v_achievement_deferred_for_command boolean := false;$new$;
  select count(*) into v_match_count from regexp_matches(v_definition, v_old, 'gi');
  if v_match_count <> 1 then
    raise exception '7.15.21 Achievement declaration anchor was not found exactly once (found % matches).', v_match_count;
  end if;
  v_definition := regexp_replace(v_definition, v_old, v_new, 'gi');

  v_old := $old$begin[[:space:]]+if[[:space:]]+current_user[[:space:]]*<>[[:space:]]*'service_role'[[:space:]]+then$old$;
  v_new := $new$begin
  v_achievement_deferred_user_id := current_setting('adhdice.achievement_deferred_user_id', true);
  v_achievement_deferred_for_command := coalesce(v_achievement_deferred_user_id = p_user_id::text, false);

  if current_user <> 'service_role' then$new$;
  select count(*) into v_match_count from regexp_matches(v_definition, v_old, 'gi');
  if v_match_count <> 1 then
    raise exception '7.15.21 Achievement entry anchor was not found exactly once (found % matches).', v_match_count;
  end if;
  v_definition := regexp_replace(v_definition, v_old, v_new, 'gi');

  v_old := $old$if[[:space:]]+jsonb_array_length\(v_automatic_history_facts\)[[:space:]]*>[[:space:]]*0[[:space:]]+then[[:space:]]+perform[[:space:]]+set_config\('adhdice.achievement_deferred_user_id',[[:space:]]*p_user_id::text,[[:space:]]*true\);[[:space:]]+end[[:space:]]+if;$old$;
  v_new := $new$if jsonb_array_length(v_automatic_history_facts) > 0
     and not v_achievement_deferred_for_command then
    perform set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true);
  end if;$new$;
  select count(*) into v_match_count from regexp_matches(v_definition, v_old, 'gi');
  if v_match_count <> 1 then
    raise exception '7.15.21 Achievement loop anchor was not found exactly once (found % matches).', v_match_count;
  end if;
  v_definition := regexp_replace(v_definition, v_old, v_new, 'gi');

  v_old := $old$if[[:space:]]+jsonb_array_length\(v_automatic_history_facts\)[[:space:]]*>[[:space:]]*0[[:space:]]+then[\s\S]*?perform[[:space:]]+set_config\('adhdice.achievement_deferred_user_id',[[:space:]]*''[[:space:]]*,[[:space:]]*true\);$old$;
  v_new := $new$if jsonb_array_length(v_automatic_history_facts) > 0
     and not v_achievement_deferred_for_command then
    -- Keep the deferral transaction-local and restore the caller's marker
    -- before the one strict final evaluation. An outer same-user deferral is
    -- preserved for the caller; a different-user marker is never treated as a
    -- deferral for this command.
    perform set_config('adhdice.achievement_deferred_user_id', coalesce(v_achievement_deferred_user_id, ''), true);$new$;
  select count(*) into v_match_count from regexp_matches(v_definition, v_old, 'gi');
  if v_match_count <> 1 then
    raise exception '7.15.21 Achievement finalization anchor was not found exactly once (found % matches).', v_match_count;
  end if;
  v_definition := regexp_replace(v_definition, v_old, v_new, 'gi');

  execute v_definition;
end;
$migration$;

revoke all on function public.adhdice_execute_task_state_command(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_execute_task_state_command(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;

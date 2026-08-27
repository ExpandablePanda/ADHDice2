-- ADHDice 7.11.77 canonical Task State Achievement-evaluation deferral.
-- SOURCE ONLY: this forward patch does not execute the RPC, deploy an Edge
-- Function, apply a migration, or mutate Task/History/reward data.
-- Apply only after explicit production approval and source review.
--
-- Schedule replay still writes the same server-derived automatic History
-- facts. This patch only reuses the established transaction-local rollover
-- deferral so the History trigger captures every source and refreshes every
-- Step set without repeating the full Achievement evaluation per row.

begin;

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

  v_old := $old$if[[:space:]]+v_command_type[[:space:]]+not[[:space:]]+in[[:space:]]*\([[:space:]]*'reconcile_rollover'[[:space:]]*,[[:space:]]*'set_due_date'[[:space:]]*,[[:space:]]*'set_repeat'[[:space:]]*\)[[:space:]]+and[[:space:]]+v_automatic_history_facts[[:space:]]*<>[[:space:]]*'\[\]'[[:space:]]*::[[:space:]]*jsonb[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[[:space:]]+'Only trusted schedule replay or rollover may create automatic History facts\.'[[:space:]]+using[[:space:]]+errcode[[:space:]]*=[[:space:]]*'42501'[[:space:]]*;[[:space:]]*end[[:space:]]+if[[:space:]]*;$old$;
  select count(*)
    into v_match_count
    from regexp_matches(v_definition, v_old, 'gi');
  if v_match_count <> 1 then
    raise exception '7.11.77 schedule replay prerequisite was not found exactly once (found % matches).', v_match_count;
  end if;

  v_old := $old$  v_reward_streak_fact record;
  v_operation_is_new boolean := false;$old$;
  v_new := $new$  v_reward_streak_fact record;
  v_achievement_evaluation jsonb;
  v_achievement_operation_id uuid;
  v_operation_is_new boolean := false;$new$;
  v_match_count := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  if v_match_count <> 1 then
    raise exception '7.11.77 Achievement declaration anchor was not found exactly once (found % matches).', v_match_count;
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$for[[:space:]]+v_automatic_history[[:space:]]+in[[:space:]]+select[[:space:]]+value[[:space:]]+from[[:space:]]+jsonb_array_elements[[:space:]]*\([[:space:]]*v_automatic_history_facts[[:space:]]*\)[[:space:]]+loop$old$;
  v_new := $new$  if jsonb_array_length(v_automatic_history_facts) > 0 then
    perform set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true);
  end if;

  for v_automatic_history in
    select value from jsonb_array_elements(v_automatic_history_facts)
  loop$new$;
  select count(*)
    into v_match_count
    from regexp_matches(v_definition, v_old, 'gi');
  if v_match_count <> 1 then
    raise exception '7.11.77 automatic History loop anchor was not found exactly once (found % matches).', v_match_count;
  end if;
  v_definition := regexp_replace(v_definition, v_old, v_new, 'gi');

  v_old := $old$end[[:space:]]+loop;[[:space:]]*if[[:space:]]+v_calendar_override[[:space:]]*<>[[:space:]]*'\{\}'[[:space:]]*::[[:space:]]*jsonb[[:space:]]+then$old$;
  v_new := $new$  end loop;

  if jsonb_array_length(v_automatic_history_facts) > 0 then
    -- Clear before the final evaluation so this setting cannot leak. A
    -- transaction rollback also restores the prior local setting.
    perform set_config('adhdice.achievement_deferred_user_id', '', true);
    v_achievement_operation_id := md5('task-state-command-achievement-evaluation:' || p_user_id::text || ':' || v_command_id::text)::uuid;
    v_achievement_evaluation := public.adhdice_evaluate_achievements(
      p_user_id,
      v_achievement_operation_id,
      'immediate'
    );
    if coalesce(v_achievement_evaluation->>'status', '') not in ('completed', 'inactive') then
      raise exception 'Final Achievement evaluation failed with status % and code %.',
        coalesce(v_achievement_evaluation->>'status', 'missing'),
        coalesce(v_achievement_evaluation->>'error_code', 'unknown');
    end if;
  end if;

  if v_calendar_override <> '{}'::jsonb then$new$;
  select count(*)
    into v_match_count
    from regexp_matches(v_definition, v_old, 'gi');
  if v_match_count <> 1 then
    raise exception '7.11.77 Achievement finalization anchor was not found exactly once (found % matches).', v_match_count;
  end if;
  v_definition := regexp_replace(v_definition, v_old, v_new, 'gi');

  execute v_definition;
end;
$migration$;

revoke all on function public.adhdice_execute_task_state_command(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_execute_task_state_command(uuid, jsonb) to service_role;

commit;

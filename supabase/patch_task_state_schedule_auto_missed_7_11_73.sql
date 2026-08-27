-- ADHDice 7.11.73 schedule-replay automatic Missed correction.
-- SOURCE ONLY: this forward patch does not execute the RPC, deploy an Edge
-- Function, apply a migration, or mutate Task/History/reward data.
-- Apply only after explicit production approval and source review.

do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
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

  v_old := $old$  if v_command_type <> 'reconcile_rollover' and v_automatic_history_facts <> '[]'::jsonb then
    raise exception 'Only trusted rollover may create automatic History facts.'
      using errcode = '42501';
  end if;$old$;
  v_new := $new$  if v_command_type not in ('reconcile_rollover', 'set_due_date', 'set_repeat')
     and v_automatic_history_facts <> '[]'::jsonb then
    raise exception 'Only trusted schedule replay or rollover may create automatic History facts.'
      using errcode = '42501';
  end if;$new$;
  if position(v_old in v_definition) = 0 then
    raise exception '7.9.20 automatic History command guard was not found.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  if v_automatic_history_delete_ids <> '[]'::jsonb then$old$;
  v_new := $new$  -- A trusted schedule replay may persist only server-derived,
  -- past Missed facts tied to the schedule boundary inserted by this same
  -- command. This structural guard leaves recurrence semantics to the Edge
  -- planner and keeps automatic backfill in one canonical transaction.
  if v_command_type in ('set_due_date', 'set_repeat')
     and v_automatic_history_facts <> '[]'::jsonb then
    if v_source_kind <> 'runtime'
       or v_schedule = '{}'::jsonb
       or v_payload ? 'reward_program_version'
       or nullif(v_schedule->>'id', '') is null
       or nullif(v_schedule->>'effective_from_logical_date', '') is null
       or (v_schedule->>'effective_from_logical_date')::date > (v_logical_day_context->>'logical_date')::date
       or v_schedule->>'schedule_model' = 'unscheduled' then
      raise exception 'Automatic schedule replay requires a past, scheduled boundary without reward data.'
        using errcode = '22023';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(v_automatic_history_facts) as automatic_fact(value)
       where value->>'outcome' <> 'missed'
          or value->>'event_kind' <> 'authorized_automation'
          or nullif(value->>'logical_date', '') is null
          or (value->>'logical_date')::date >= (v_logical_day_context->>'logical_date')::date
          or nullif(value->>'scheduled_due_on', '') is null
          or (value->>'scheduled_due_on')::date > (value->>'logical_date')::date
          or nullif(value->>'occurrence_id', '') is not null
          or nullif(value->>'effective_due_on', '') is not null
          or nullif(value->>'schedule_boundary_id', '') is null
          or value->>'schedule_boundary_id' <> v_schedule->>'id'
    ) then
      raise exception 'Automatic schedule replay facts require past Missed rows tied to the new boundary.'
        using errcode = '22023';
    end if;
  end if;

  if v_automatic_history_delete_ids <> '[]'::jsonb then$new$;
  if position(v_old in v_definition) = 0 then
    raise exception '7.11.73 automatic schedule History validation anchor was not found.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  execute v_definition;
end;
$migration$;

revoke all on function public.adhdice_execute_task_state_command(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_execute_task_state_command(uuid, jsonb) to service_role;

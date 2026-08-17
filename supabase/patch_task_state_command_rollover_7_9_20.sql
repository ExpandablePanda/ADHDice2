-- ADHDice 7.9.20 canonical automatic rollover correction.
-- Apply after add_task_state_command_rpc.sql (and prior command-RPC patches).
-- This forward-only patch changes only reconcile_rollover validation and its
-- server-owned automation provenance. It does not execute the RPC, deploy an
-- Edge Function, or mutate Task/History/reward data.

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

  v_old := $old$if v_source_kind <> 'runtime' then
    raise exception 'The runtime RPC accepts source_kind=runtime only (backend invocation).'
      using errcode = '42501';
  end if;$old$;
  v_new := $new$if v_source_kind <> 'runtime'
     and not (v_command_type = 'reconcile_rollover' and v_source_kind = 'authorized_automation') then
    raise exception 'The runtime RPC accepts source_kind=runtime, except for the trusted automatic rollover provenance.'
      using errcode = '42501';
  end if;$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'The canonical command source-kind guard was not found.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$coalesce(nullif(v_history->>'provenance_kind', ''), 'user') <> 'user'$old$;
  v_new := $new$coalesce(nullif(v_history->>'provenance_kind', ''), (case when v_command_type = 'reconcile_rollover' then 'authorized_automation' else 'user' end))
       <> (case when v_command_type = 'reconcile_rollover' then 'authorized_automation' else 'user' end)$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'The server-owned History provenance guard was not found.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$nullif(v_history->>'actor_kind', '') is not null and v_history->>'actor_kind' <> 'user'$old$;
  v_new := $new$nullif(v_history->>'actor_kind', '') is not null
        and v_history->>'actor_kind' <> (case when v_command_type = 'reconcile_rollover' then 'authorized_automation' else 'user' end)$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'The server-owned History actor guard was not found.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$elsif v_command_type = 'reconcile_rollover' then
    if v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version' then
      raise exception 'Rollover cannot carry History, schedule, occurrence, delay, Calendar, or reward mutations.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'workflow_state', 'workflow_started_at',
                        'workflow_logical_date', 'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision')
    ) then
      raise exception 'Rollover carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
    if v_history <> '{}'::jsonb or (v_payload->>'synthetic_did_my_best')::boolean is true then
      raise exception 'Rollover cannot persist a History fact or synthesize Did My Best.'
        using errcode = '22023';
    end if;
  end if;$old$;
  v_new := $new$elsif v_command_type = 'reconcile_rollover' then
    if v_occurrence <> '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'::jsonb then
      raise exception 'Rollover cannot carry schedule, occurrence, delay, or Calendar mutations.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'workflow_state', 'workflow_started_at',
                        'workflow_logical_date', 'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision')
    ) then
      raise exception 'Rollover carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
    if (v_payload->>'synthetic_did_my_best')::boolean is true then
      raise exception 'Rollover cannot carry a client synthetic Did My Best marker.'
        using errcode = '22023';
    end if;
  end if;$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'The pre-lock rollover guard was not found.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  -- Rollover is deliberately a projection/reconciliation command.  It may
  -- clear stale workflow state, but it cannot insert synthetic DMB or routine
  -- calculated Missed facts.  Explicit Missed remains a set_outcome command.
  if v_command_type = 'reconcile_rollover'
     and v_history <> '{}'::jsonb then
    raise exception 'Rollover cannot persist a History fact.'
      using errcode = '22023';
  end if;
  if v_command_type = 'reconcile_rollover'
     and (v_payload->>'synthetic_did_my_best')::boolean is true then
    raise exception 'Rollover cannot synthesize Did My Best.'
      using errcode = '22023';
  end if;$old$;
  v_new := $new$  -- Automatic rollover is a narrow trusted exception to the old no-History
  -- rule. The server-derived payload may finalize only the stale In Progress
  -- workflow's own logical date as authorized-automation Did My Best. A
  -- no-History rollover may only clear that stale workflow or be a no-op.
  if v_command_type = 'reconcile_rollover' then
    if v_logical_day_context->>'logical_date' is distinct from public.adhdice_effective_logical_date(
      clock_timestamp(), v_profile_timezone, v_profile_day_start_time
    )::text then
      raise exception 'Rollover logical-day context is not current.' using errcode = '40001';
    end if;
    if v_history = '{}'::jsonb then
      if v_payload ? 'reward_program_version' then
        raise exception 'Rollover cannot carry reward data without its automatic Did My Best History fact.' using errcode = '22023';
      end if;
      if v_task.workflow_state = 'in_progress' then
        if v_task.workflow_logical_date is null
           or v_task.workflow_logical_date >= public.adhdice_effective_logical_date(clock_timestamp(), v_profile_timezone, v_profile_day_start_time)
           or v_task_patch->>'workflow_state' <> 'none'
           or nullif(v_task_patch->>'workflow_logical_date', '') is not null
           or nullif(v_task_patch->>'workflow_occurrence_id', '') is not null
           or nullif(v_task_patch->>'workflow_command_id', '') is not null
           or (v_task_patch->>'workflow_revision')::bigint is distinct from coalesce(v_task.workflow_revision, 1) + 1 then
          raise exception 'Rollover may clear only a stale canonical In Progress workflow.' using errcode = '22023';
        end if;
      elsif exists (select 1 from jsonb_object_keys(v_task_patch) as patch_key(key) where key <> 'canonicalization_status') then
        raise exception 'A no-op rollover cannot carry a Task State mutation.' using errcode = '22023';
      end if;
    else
      if v_source_kind <> 'authorized_automation'
         or v_history->>'outcome' <> 'did_my_best'
         or v_history->>'event_kind' <> 'authorized_automation'
         or v_history->>'logical_date' is null
         or v_task.workflow_state <> 'in_progress'
         or v_task.workflow_logical_date is null
         or (v_history->>'logical_date')::date is distinct from v_task.workflow_logical_date
         or v_task.workflow_logical_date >= public.adhdice_effective_logical_date(clock_timestamp(), v_profile_timezone, v_profile_day_start_time)
         or v_payload->>'reward_program_version' <> 'task-reward-v1'
         or v_projection->>'status' = 'in_progress'
         or nullif(v_projection->>'active_status_logical_date', '') is not null
         or nullif(v_projection->>'active_occurrence_due_on', '') is not null
         or v_task_patch->>'workflow_state' <> 'none'
         or nullif(v_task_patch->>'workflow_logical_date', '') is not null
         or nullif(v_task_patch->>'workflow_occurrence_id', '') is not null
         or nullif(v_task_patch->>'workflow_command_id', '') is not null
         or (v_task_patch->>'workflow_revision')::bigint is distinct from coalesce(v_task.workflow_revision, 1) + 1 then
        raise exception 'Automatic rollover must finalize only the stale workflow as Did My Best and clear it.' using errcode = '22023';
      end if;
      if nullif(v_history->>'occurrence_id', '')::uuid is distinct from v_task.workflow_occurrence_id then
        raise exception 'Automatic rollover History must use the stale workflow occurrence identity.' using errcode = '22023';
      end if;
      if v_task.workflow_occurrence_id is null
         and nullif(v_history->>'scheduled_due_on', '') is not null then
        raise exception 'Automatic rollover without a workflow occurrence cannot carry a scheduled due date.' using errcode = '22023';
      end if;
      if v_task.workflow_occurrence_id is not null and not exists (
        select 1 from public.adhdice_task_occurrences occurrence
         where occurrence.user_id = p_user_id and occurrence.entity_id = v_entity_id
           and occurrence.id = v_task.workflow_occurrence_id
           and occurrence.scheduled_due_on = nullif(v_history->>'scheduled_due_on', '')::date
      ) then
        raise exception 'Automatic rollover History occurrence evidence is not owned by the Task.' using errcode = '23503';
      end if;
    end if;
  end if;$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'The post-lock rollover guard was not found.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$v_history := jsonb_set(v_history, '{provenance_kind}', to_jsonb('user'::text), true);
    v_history := jsonb_set(v_history, '{actor_kind}', to_jsonb('user'::text), true);
    v_history := jsonb_set(v_history, '{actor_id}', to_jsonb(p_user_id), true);$old$;
  v_new := $new$v_history := jsonb_set(v_history, '{provenance_kind}', to_jsonb(case when v_source_kind = 'authorized_automation' then 'authorized_automation' else 'user' end), true);
    v_history := jsonb_set(v_history, '{actor_kind}', to_jsonb(case when v_source_kind = 'authorized_automation' then 'authorized_automation' else 'user' end), true);
    v_history := jsonb_set(v_history, '{actor_id}', case when v_source_kind = 'authorized_automation' then 'null'::jsonb else to_jsonb(p_user_id) end, true);$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'The server-owned History provenance block was not found.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$      'handled_success',$old$;
  v_new := $new$      case when v_source_kind = 'authorized_automation' then 'authorized_automation' else 'handled_success' end,$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'The reward entitlement provenance field was not found.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  execute v_definition;
end;
$migration$;

revoke all on function public.adhdice_execute_task_state_command(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_execute_task_state_command(uuid, jsonb) to service_role;

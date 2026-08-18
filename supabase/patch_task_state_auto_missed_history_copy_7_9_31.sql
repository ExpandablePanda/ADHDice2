-- ADHDice 7.9.31 forward patch from the installed 7.9.20 Task State RPC baseline.
-- SOURCE ONLY: this file does not execute the RPC, deploy Edge, copy History,
-- or mutate Tasks/History/rewards. Apply only after explicit production approval.

alter table public.adhdice_task_history_facts
  drop constraint adhdice_task_history_facts_event_kind_check;
alter table public.adhdice_task_history_facts
  add constraint adhdice_task_history_facts_event_kind_check check (event_kind in (
    'explicit_outcome', 'terminal_complete', 'delay_audit',
    'correction', 'authorized_automation', 'migration_reconstruction'
  ));

alter table public.adhdice_task_history_facts
  drop constraint adhdice_task_history_facts_effective_date_check;
alter table public.adhdice_task_history_facts
  add constraint adhdice_task_history_facts_effective_date_check check (
    (
      outcome = 'delayed'
      and (
        (effective_due_on is not null and effective_due_on > logical_date)
        or (
          effective_due_on is null
          and event_kind = 'migration_reconstruction'
          and provenance_kind = 'migration_reconstruction'
          and actor_kind = 'migration'
          and migration_operation_id is not null
          and source_legacy_history_id is not null
        )
      )
    )
    or (
      outcome <> 'delayed'
      and (effective_due_on is null or event_kind = 'correction')
    )
  );

do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_start integer;
  v_finish integer;
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

  v_old := $old$  v_history jsonb;$old$;
  v_new := $new$  v_history jsonb;
  v_automatic_history_facts jsonb;
  v_automatic_history_delete_ids jsonb;
  v_automatic_history jsonb;$new$;
  if position(v_old in v_definition) = 0 then raise exception '7.9.20 History declarations were not found.'; end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  v_history_id uuid;$old$;
  v_new := $new$  v_history_id uuid;
  v_automatic_history_ids jsonb := '[]'::jsonb;$new$;
  if position(v_old in v_definition) = 0 then raise exception '7.9.20 History ID declaration was not found.'; end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  v_history := coalesce(v_payload->'history_fact', '{}'::jsonb);$old$;
  v_new := $new$  v_history := coalesce(v_payload->'history_fact', '{}'::jsonb);
  v_automatic_history_facts := coalesce(v_payload->'automatic_history_facts', '[]'::jsonb);
  v_automatic_history_delete_ids := coalesce(v_payload->'automatic_history_delete_ids', '[]'::jsonb);$new$;
  if position(v_old in v_definition) = 0 then raise exception '7.9.20 History payload initialization was not found.'; end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$     or jsonb_typeof(v_history) <> 'object'
     or jsonb_typeof(v_occurrence) <> 'object'$old$;
  v_new := $new$     or jsonb_typeof(v_history) <> 'object'
     or jsonb_typeof(v_automatic_history_facts) <> 'array'
     or jsonb_typeof(v_automatic_history_delete_ids) <> 'array'
     or jsonb_typeof(v_occurrence) <> 'object'$new$;
  if position(v_old in v_definition) = 0 then raise exception '7.9.20 payload type guard was not found.'; end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$      'task_patch', 'compatibility_projection', 'history_fact', 'occurrence',$old$;
  v_new := $new$      'task_patch', 'compatibility_projection', 'history_fact', 'automatic_history_facts',
      'automatic_history_delete_ids', 'occurrence',$new$;
  if position(v_old in v_definition) = 0 then raise exception '7.9.20 payload key allowlist was not found.'; end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  if v_command_type = 'hierarchy_change' then$old$;
  v_new := $new$  if exists (
    select 1
      from jsonb_array_elements(v_automatic_history_facts) as automatic_fact(value)
     where jsonb_typeof(value) <> 'object'
        or value->>'provenance_kind' <> 'authorized_automation'
        or value->>'actor_kind' <> 'authorized_automation'
        or nullif(value->>'actor_id', '') is not null
        or nullif(value->>'migration_operation_id', '') is not null
        or nullif(value->>'source_legacy_history_id', '') is not null
        or value->>'source' <> 'task_state_command'
  ) then
    raise exception 'Automatic History provenance is server-owned.' using errcode = '42501';
  end if;
  if v_command_type <> 'reconcile_rollover' and v_automatic_history_facts <> '[]'::jsonb then
    raise exception 'Only trusted rollover may create automatic History facts.' using errcode = '42501';
  end if;
  if v_command_type <> 'set_outcome' and v_automatic_history_delete_ids <> '[]'::jsonb then
    raise exception 'Only a manual outcome correction may reconcile dependent automatic History.' using errcode = '42501';
  end if;

  if v_command_type = 'hierarchy_change' then$new$;
  if position(v_old in v_definition) = 0 then raise exception '7.9.20 hierarchy guard anchor was not found.'; end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'workflow_state', 'workflow_started_at',$old$;
  v_new := $new$    if v_automatic_history_delete_ids <> '[]'::jsonb
       and (v_history->>'outcome' not in ('done', 'did_my_best')
            or nullif(v_history->>'scheduled_due_on', '') is null) then
      raise exception 'Dependent automatic History reconciliation requires a successful occurrence correction.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'workflow_state', 'workflow_started_at',$new$;
  if position(v_old in v_definition) = 0 then raise exception '7.9.20 set_outcome Task patch guard was not found.'; end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$    if (v_payload->>'synthetic_did_my_best')::boolean is true then
      raise exception 'Rollover cannot carry a client synthetic Did My Best marker.'
        using errcode = '22023';
    end if;
  end if;$old$;
  v_new := $new$    if (v_payload->>'synthetic_did_my_best')::boolean is true then
      raise exception 'Rollover cannot carry a client synthetic Did My Best marker.'
        using errcode = '22023';
    end if;
    if v_history <> '{}'::jsonb and v_automatic_history_facts <> '[]'::jsonb then
      raise exception 'One rollover cannot mix stale-workflow completion with automatic Missed recovery.' using errcode = '22023';
    end if;
  end if;$new$;
  if position(v_old in v_definition) = 0 then raise exception '7.9.20 rollover pre-lock guard was not found.'; end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_start := position('  -- Automatic rollover is a narrow trusted exception to the old no-History' in v_definition);
  v_finish := position('  if v_projection->>''status'' is null' in v_definition);
  if v_start = 0 or v_finish <= v_start then raise exception '7.9.20 rollover validation block was not found.'; end if;
  v_new := $new$  -- Automatic rollover is a narrow trusted History writer. The server-derived
  -- payload may either finalize one stale In Progress workflow as Did My Best,
  -- or materialize passed scheduled obligations as automatic Missed. It cannot
  -- mix those operations or materialize the current open logical day.
  if v_command_type = 'reconcile_rollover' then
    if v_logical_day_context->>'logical_date' is distinct from public.adhdice_effective_logical_date(
      clock_timestamp(), v_profile_timezone, v_profile_day_start_time
    )::text then
      raise exception 'Rollover logical-day context is not current.' using errcode = '40001';
    end if;
    if v_history = '{}'::jsonb and v_automatic_history_facts = '[]'::jsonb then
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
    elsif v_history <> '{}'::jsonb then
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
      if v_task.workflow_occurrence_id is null and nullif(v_history->>'scheduled_due_on', '') is not null then
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
    else
      if v_source_kind <> 'authorized_automation'
         or v_payload ? 'reward_program_version'
         or v_task.workflow_state = 'in_progress'
         or jsonb_array_length(v_automatic_history_facts) = 0 then
        raise exception 'Automatic Missed recovery requires a non-workflow authorized rollover without reward data.' using errcode = '22023';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_automatic_history_facts) as automatic_fact(value)
         where value->>'outcome' <> 'missed'
            or value->>'event_kind' <> 'authorized_automation'
            or nullif(value->>'logical_date', '') is null
            or (value->>'logical_date')::date >= public.adhdice_effective_logical_date(clock_timestamp(), v_profile_timezone, v_profile_day_start_time)
            or nullif(value->>'scheduled_due_on', '') is null
            or (value->>'scheduled_due_on')::date > (value->>'logical_date')::date
            or nullif(value->>'occurrence_id', '') is not null
            or nullif(value->>'effective_due_on', '') is not null
            or nullif(value->>'schedule_boundary_id', '') is null
            or not exists (
              select 1 from public.adhdice_task_schedule_boundaries boundary
               where boundary.user_id = p_user_id and boundary.entity_id = v_entity_id
                 and boundary.id = (value->>'schedule_boundary_id')::uuid
                 and boundary.boundary_sequence = v_current_boundary_sequence
                 and boundary.schedule_model <> 'unscheduled'
            )
      ) then
        raise exception 'Automatic Missed facts require past, owned, currently scheduled boundary evidence.' using errcode = '23503';
      end if;
    end if;
  end if;

  if v_automatic_history_delete_ids <> '[]'::jsonb then
    if exists (
      select 1 from jsonb_array_elements_text(v_automatic_history_delete_ids) as requested(id)
      left join public.adhdice_task_history_facts fact
        on fact.user_id = p_user_id and fact.entity_id = v_entity_id and fact.id = requested.id::uuid
      where fact.id is null
         or fact.provenance_kind <> 'authorized_automation'
         or fact.actor_kind <> 'authorized_automation'
         or fact.outcome <> 'missed'
         or fact.logical_date <= (v_history->>'logical_date')::date
         or fact.scheduled_due_on is distinct from nullif(v_history->>'scheduled_due_on', '')::date
         or exists (
           select 1 from public.adhdice_task_reward_entitlements entitlement
            where entitlement.user_id = fact.user_id and entitlement.canonical_history_id = fact.id
         )
    ) or not exists (
      select 1 from public.adhdice_task_schedule_boundaries boundary
       where boundary.user_id = p_user_id and boundary.entity_id = v_entity_id
         and boundary.boundary_sequence = v_current_boundary_sequence
         and boundary.schedule_model = 'rolling' and boundary.repeat_interval > 1
    ) then
      raise exception 'Dependent automatic History deletion is not proven safe.' using errcode = '55000';
    end if;
  end if;

$new$;
  v_definition := left(v_definition, v_start - 1) || v_new || substr(v_definition, v_finish);

  v_old := $old$  if v_command_type = 'clear_outcome' then$old$;
  v_new := $new$  if v_automatic_history_delete_ids <> '[]'::jsonb then
    update public.adhdice_task_occurrences occurrence
       set resolution_state = 'unresolved', resolved_logical_date = null,
           resolved_outcome = null, resolved_history_id = null,
           revision = occurrence.revision + 1, updated_at = now()
     where occurrence.user_id = p_user_id and occurrence.entity_id = v_entity_id
       and occurrence.resolved_history_id in (
         select value::uuid from jsonb_array_elements_text(v_automatic_history_delete_ids)
       );
    delete from public.adhdice_task_history_facts fact
     where fact.user_id = p_user_id and fact.entity_id = v_entity_id
       and fact.id in (select value::uuid from jsonb_array_elements_text(v_automatic_history_delete_ids));
  end if;

  if v_command_type = 'clear_outcome' then$new$;
  if position(v_old in v_definition) = 0 then raise exception '7.9.20 clear_outcome anchor was not found.'; end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  if v_calendar_override <> '{}'::jsonb then$old$;
  v_new := $new$  for v_automatic_history in select value from jsonb_array_elements(v_automatic_history_facts)
  loop
    v_automatic_history := jsonb_set(v_automatic_history, '{id}', to_jsonb(gen_random_uuid()), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{user_id}', to_jsonb(p_user_id), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{entity_id}', to_jsonb(v_entity_id), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{entity_kind}', to_jsonb(v_entity_kind), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{provenance_kind}', to_jsonb('authorized_automation'::text), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{actor_kind}', to_jsonb('authorized_automation'::text), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{actor_id}', 'null'::jsonb, true);
    v_automatic_history := jsonb_set(v_automatic_history, '{source}', to_jsonb('task_state_command'::text), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{logical_day_settings_revision}', to_jsonb(v_profile_settings_revision), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{timezone}', to_jsonb(v_profile_timezone), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{day_start_time}', to_jsonb(v_profile_day_start_time), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{command_id}', to_jsonb(v_command_id), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{idempotence_identity}',
      to_jsonb(v_idempotence_identity || ':history:' || (v_automatic_history->>'logical_date') || ':missed'), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{migration_operation_id}', 'null'::jsonb, true);
    v_automatic_history := jsonb_set(v_automatic_history, '{source_legacy_history_id}', 'null'::jsonb, true);
    v_automatic_history := jsonb_set(v_automatic_history, '{revision}', to_jsonb(1), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{created_at}', to_jsonb(now()), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{updated_at}', to_jsonb(now()), true);
    insert into public.adhdice_task_history_facts
    select (jsonb_populate_record(null::public.adhdice_task_history_facts, v_automatic_history)).*
    on conflict (user_id, entity_id, logical_date) do nothing returning * into v_history_row;
    if not found then
      select * into v_history_row from public.adhdice_task_history_facts fact
       where fact.user_id = p_user_id and fact.entity_id = v_entity_id
         and fact.logical_date = (v_automatic_history->>'logical_date')::date for update;
      if v_history_row.provenance_kind <> 'authorized_automation'
         or v_history_row.actor_kind <> 'authorized_automation'
         or v_history_row.outcome <> 'missed'
         or v_history_row.scheduled_due_on is distinct from (v_automatic_history->>'scheduled_due_on')::date
         or v_history_row.schedule_boundary_id is distinct from (v_automatic_history->>'schedule_boundary_id')::uuid then
        raise exception 'Automatic Missed conflicts with an existing canonical History fact.' using errcode = '23505';
      end if;
    end if;
    v_automatic_history_ids := v_automatic_history_ids || to_jsonb(v_history_row.id);
  end loop;

  if v_calendar_override <> '{}'::jsonb then$new$;
  if position(v_old in v_definition) = 0 then raise exception '7.9.20 Calendar override anchor was not found.'; end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$    'history_fact_id', v_history_id,
    'schedule_boundary_id', v_schedule_id,$old$;
  v_new := $new$    'history_fact_id', v_history_id,
    'history_fact_ids', v_automatic_history_ids,
    'schedule_boundary_id', v_schedule_id,$new$;
  if position(v_old in v_definition) = 0 then raise exception '7.9.20 result History fields were not found.'; end if;
  v_definition := replace(v_definition, v_old, v_new);

  execute v_definition;
end;
$migration$;

revoke all on function public.adhdice_execute_task_state_command(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_execute_task_state_command(uuid, jsonb) to service_role;

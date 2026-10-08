-- ADHDice 7.16.111: bounded Calendar History recomputation.
--
-- Source-only migration. Do not execute or deploy from this workspace.
-- The trusted Edge planner supplies only a replay date and server-derived
-- retirement lists. This RPC validates those lists again while the canonical
-- Task row is locked, supersedes obsolete Missed occurrences, retires active
-- Calendar overrides without deleting their audit rows, reconciles automatic
-- Missed facts, and commits the complete range atomically.

begin;

do $rpc$
declare
  definition text;
begin
  if to_regprocedure('public.adhdice_execute_task_state_command(uuid,jsonb)') is null then
    raise exception 'The canonical Task State command RPC is required before 7.16.111.';
  end if;
  definition := pg_get_functiondef('public.adhdice_execute_task_state_command(uuid,jsonb)'::regprocedure);

  definition := replace(
    definition,
    $needle$  v_history_fact_delete_ids jsonb;
  v_automatic_history jsonb;$needle$,
    $replacement$  v_history_fact_delete_ids jsonb;
  v_recalculate_history_delete_ids jsonb;
  v_recalculate_calendar_override_ids jsonb;
  v_recalculate_from_logical_date date;
  v_automatic_history jsonb;$replacement$
  );
  definition := replace(
    definition,
    $needle$  if v_automatic_history_delete_ids <> '[]'::jsonb then
    update public.adhdice_task_occurrences occurrence
       set resolution_state = 'unresolved',$needle$,
    $replacement$  if v_recalculate_history_delete_ids <> '[]'::jsonb then
    update public.adhdice_task_occurrences occurrence
       set resolution_state = 'superseded',
           resolved_history_id = null,
           revision = occurrence.revision + 1,
           updated_at = now()
     where occurrence.user_id = p_user_id
       and occurrence.entity_id = v_entity_id
       and occurrence.resolved_history_id in (
         select value::uuid from jsonb_array_elements_text(v_recalculate_history_delete_ids)
       );
    update public.adhdice_task_occurrence_effective_overrides override_row
       set history_id = null,
           updated_at = now()
     where override_row.user_id = p_user_id
       and override_row.entity_id = v_entity_id
       and override_row.history_id in (
         select value::uuid from jsonb_array_elements_text(v_recalculate_history_delete_ids)
       );
    delete from public.adhdice_task_history_facts fact
     where fact.user_id = p_user_id
       and fact.entity_id = v_entity_id
       and fact.id in (
         select value::uuid from jsonb_array_elements_text(v_recalculate_history_delete_ids)
       );
  end if;
  if v_recalculate_calendar_override_ids <> '[]'::jsonb then
    update public.adhdice_task_calendar_overrides calendar_override
       set is_active = false,
           cleared_at = now(),
           cleared_by_command_id = v_command_id,
           revision = calendar_override.revision + 1,
           updated_at = now()
     where calendar_override.user_id = p_user_id
       and calendar_override.entity_id = v_entity_id
       and calendar_override.id in (
         select value::uuid from jsonb_array_elements_text(v_recalculate_calendar_override_ids)
       )
       and calendar_override.is_active;
  end if;
  if v_automatic_history_delete_ids <> '[]'::jsonb then
    update public.adhdice_task_occurrences occurrence
       set resolution_state = 'unresolved',$replacement$
  );
  definition := replace(
    definition,
    $needle$  if jsonb_array_length(v_automatic_history_facts) > 0
     and not v_achievement_deferred_for_command then
    perform set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true);$needle$,
    $replacement$  if (jsonb_array_length(v_automatic_history_facts) > 0
       or v_recalculate_history_delete_ids <> '[]'::jsonb
       or v_history_fact_delete_ids <> '[]'::jsonb)
     and not v_achievement_deferred_for_command then
    perform set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true);$replacement$
  );
  definition := replace(
    definition,
    $needle$  if jsonb_array_length(v_automatic_history_facts) > 0
     and not v_achievement_deferred_for_command then
    -- Keep the deferral transaction-local and restore the caller's marker$needle$,
    $replacement$  if (jsonb_array_length(v_automatic_history_facts) > 0
       or v_recalculate_history_delete_ids <> '[]'::jsonb
       or v_history_fact_delete_ids <> '[]'::jsonb)
     and not v_achievement_deferred_for_command then
    -- Keep the deferral transaction-local and restore the caller's marker$replacement$
  );
  definition := replace(
    definition,
    $needle$          || coalesce(v_history_fact_delete_ids, '[]'::jsonb)
        ) value$needle$,
    $replacement$          || coalesce(v_history_fact_delete_ids, '[]'::jsonb)
          || coalesce(v_recalculate_history_delete_ids, '[]'::jsonb)
        ) value$replacement$
  );
  definition := replace(
    definition,
    $needle$    'history_fact_delete_ids', v_automatic_history_delete_ids || v_history_fact_delete_ids,$needle$,
    $replacement$    'history_fact_delete_ids', v_automatic_history_delete_ids || v_history_fact_delete_ids || v_recalculate_history_delete_ids,
    'recalculate_history_delete_ids', v_recalculate_history_delete_ids,$replacement$
  );

  definition := replace(
    definition,
    $needle$  elsif v_command_type = 'clear_outcome' then$needle$,
    $replacement$  elsif v_command_type = 'recalculate_history' then
    if v_history <> '{}'::jsonb
       or v_occurrence <> '{}'::jsonb
       or v_schedule <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb
       or v_calendar_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version'
       or v_recalculate_from_logical_date is null then
      raise exception 'Historical recalculation command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status')
    ) then
      raise exception 'Historical recalculation carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'clear_outcome' then$replacement$
  );
  definition := replace(
    definition,
    $needle$  if v_projection->>'status' is null
     or v_projection->>'due_on' is null and not (v_projection ? 'due_on')$needle$,
    $replacement$  if v_command_type = 'recalculate_history' then
    if v_task.repeat_frequency in ('per_week', 'per_month') then
      raise exception 'Historical recalculation for quota recurrence is not supported yet.'
        using errcode = '0A000';
    end if;
    if v_recalculate_from_logical_date > public.adhdice_effective_logical_date(
      clock_timestamp(), v_profile_timezone, v_profile_day_start_time
    )::date then
      raise exception 'Historical recalculation is unavailable for future logical dates.'
        using errcode = '22023';
    end if;
    if exists (
      select 1
        from jsonb_array_elements_text(v_recalculate_history_delete_ids) as requested(id)
        left join public.adhdice_task_history_facts fact
          on fact.user_id = p_user_id
         and fact.entity_id = v_entity_id
         and fact.id = requested.id::uuid
       where fact.id is null
          or fact.logical_date < v_recalculate_from_logical_date
          or fact.outcome <> 'missed'
    ) then
      raise exception 'Historical recalculation may retire only owned Missed History facts from its replay date.'
        using errcode = '55000';
    end if;
    if exists (
      select 1
        from jsonb_array_elements_text(v_recalculate_history_delete_ids) as requested(id)
        join public.adhdice_task_reward_entitlements entitlement
          on entitlement.user_id = p_user_id
         and entitlement.canonical_history_id = requested.id::uuid
    ) then
      raise exception 'Historical recalculation cannot retire a History fact with a reward entitlement.'
        using errcode = '55000';
    end if;
    if exists (
      select 1
        from jsonb_array_elements_text(v_recalculate_calendar_override_ids) as requested(id)
        left join public.adhdice_task_calendar_overrides calendar_override
          on calendar_override.user_id = p_user_id
         and calendar_override.entity_id = v_entity_id
         and calendar_override.id = requested.id::uuid
       where calendar_override.id is null
          or not calendar_override.is_active
          or calendar_override.logical_date < v_recalculate_from_logical_date
    ) then
      raise exception 'Historical recalculation may retire only active owned Calendar overrides from its replay date.'
        using errcode = '55000';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(v_automatic_history_facts) as automatic_fact(value)
       where value->>'outcome' <> 'missed'
          or value->>'event_kind' <> 'authorized_automation'
          or nullif(value->>'logical_date', '') is null
          or (value->>'logical_date')::date < v_recalculate_from_logical_date
          or (value->>'logical_date')::date >= public.adhdice_effective_logical_date(
            clock_timestamp(), v_profile_timezone, v_profile_day_start_time
          )::date
          or nullif(value->>'scheduled_due_on', '') is null
          or (value->>'scheduled_due_on')::date > (value->>'logical_date')::date
          or nullif(value->>'occurrence_id', '') is not null
          or nullif(value->>'effective_due_on', '') is not null
          or nullif(value->>'schedule_boundary_id', '') is null
          or not exists (
            select 1
              from public.adhdice_task_schedule_boundaries boundary
             where boundary.user_id = p_user_id
               and boundary.entity_id = v_entity_id
               and boundary.id = (value->>'schedule_boundary_id')::uuid
               and boundary.boundary_sequence = v_current_boundary_sequence
               and boundary.schedule_model <> 'unscheduled'
          )
    ) then
      raise exception 'Historical recalculation Missed facts require past, owned, current schedule evidence.'
        using errcode = '23503';
    end if;
  end if;

  if v_projection->>'status' is null
     or v_projection->>'due_on' is null and not (v_projection ? 'due_on')$replacement$
  );
  definition := replace(
    definition,
    $needle$  v_history_fact_delete_ids := coalesce(v_payload->'history_fact_delete_ids', '[]'::jsonb);
  v_occurrence := coalesce(v_payload->'occurrence', '{}'::jsonb);$needle$,
    $replacement$  v_history_fact_delete_ids := coalesce(v_payload->'history_fact_delete_ids', '[]'::jsonb);
  v_recalculate_history_delete_ids := coalesce(v_payload->'recalculate_history_delete_ids', '[]'::jsonb);
  v_recalculate_calendar_override_ids := coalesce(v_payload->'recalculate_calendar_override_ids', '[]'::jsonb);
  v_recalculate_from_logical_date := nullif(v_payload->>'recalculate_from_logical_date', '')::date;
  v_occurrence := coalesce(v_payload->'occurrence', '{}'::jsonb);$replacement$
  );
  definition := replace(
    definition,
    $needle$     or jsonb_typeof(v_history_fact_delete_ids) <> 'array'
     or jsonb_typeof(v_occurrence) <> 'object'$needle$,
    $replacement$     or jsonb_typeof(v_history_fact_delete_ids) <> 'array'
     or jsonb_typeof(v_recalculate_history_delete_ids) <> 'array'
     or jsonb_typeof(v_recalculate_calendar_override_ids) <> 'array'
     or jsonb_typeof(v_occurrence) <> 'object'$replacement$
  );
  definition := replace(
    definition,
    $needle$      'automatic_history_delete_ids', 'history_fact_delete_ids', 'occurrence',$needle$,
    $replacement$       'automatic_history_delete_ids', 'history_fact_delete_ids',
      'recalculate_history_delete_ids', 'recalculate_calendar_override_ids',
      'recalculate_from_logical_date', 'occurrence',$replacement$
  );
  definition := replace(
    definition,
    $needle$       'reconcile_rollover', 'clear_quota_balance', 'hierarchy_change'$needle$,
    $replacement$       'reconcile_rollover', 'recalculate_history', 'clear_quota_balance', 'hierarchy_change'$replacement$
  );
  definition := replace(
    definition,
    $needle$  if v_command_type not in ('reconcile_rollover', 'set_due_date', 'set_repeat')
     and v_automatic_history_facts <> '[]'::jsonb then$needle$,
    $replacement$  if v_command_type not in ('reconcile_rollover', 'set_due_date', 'set_repeat', 'recalculate_history')
     and v_automatic_history_facts <> '[]'::jsonb then$replacement$
  );
  definition := replace(
    definition,
    $needle$  if v_command_type <> 'calendar_override' and v_history_fact_delete_ids <> '[]'::jsonb then
    raise exception 'Only the canonical Calendar override planner may retire same-date replaceable History.'
      using errcode = '42501';
  end if;$needle$,
    $replacement$  if v_command_type <> 'calendar_override' and v_history_fact_delete_ids <> '[]'::jsonb then
    raise exception 'Only the canonical Calendar override planner may retire same-date replaceable History.'
      using errcode = '42501';
  end if;
  if v_command_type <> 'recalculate_history'
     and (v_recalculate_history_delete_ids <> '[]'::jsonb
       or v_recalculate_calendar_override_ids <> '[]'::jsonb
       or v_payload ? 'recalculate_from_logical_date') then
    raise exception 'Only the canonical historical recalculation planner may supply bounded replay retirement data.'
      using errcode = '42501';
  end if;$replacement$
  );

  if position($assert$  v_recalculate_history_delete_ids jsonb;$assert$ in definition) = 0
     or position($assert$  v_recalculate_calendar_override_ids jsonb;$assert$ in definition) = 0
     or position($assert$  v_recalculate_from_logical_date date;$assert$ in definition) = 0
     or position($assert$  v_recalculate_history_delete_ids := coalesce(v_payload->'recalculate_history_delete_ids', '[]'::jsonb);$assert$ in definition) = 0
     or position($assert$  v_recalculate_calendar_override_ids := coalesce(v_payload->'recalculate_calendar_override_ids', '[]'::jsonb);$assert$ in definition) = 0
     or position($assert$  v_recalculate_from_logical_date := nullif(v_payload->>'recalculate_from_logical_date', '')::date;$assert$ in definition) = 0
     or position($assert$'recalculate_history', 'clear_quota_balance'$assert$ in definition) = 0
     or position($assert$elsif v_command_type = 'recalculate_history' then$assert$ in definition) = 0
     or position($assert$Historical recalculation for quota recurrence is not supported yet.$assert$ in definition) = 0
     or position($assert$Historical recalculation may retire only owned Missed History facts from its replay date.$assert$ in definition) = 0
     or position($assert$Historical recalculation may retire only active owned Calendar overrides from its replay date.$assert$ in definition) = 0
     or position($assert$set resolution_state = 'superseded',$assert$ in definition) = 0
     or position($assert$resolved_history_id = null,$assert$ in definition) = 0
     or position($assert$set is_active = false,$assert$ in definition) = 0
     or position($assert$'recalculate_history_delete_ids', v_recalculate_history_delete_ids$assert$ in definition) = 0 then
    raise exception 'Could not patch the canonical Task State command RPC for bounded Calendar History recalculation.';
  end if;

  execute definition;
end;
$rpc$;

commit;

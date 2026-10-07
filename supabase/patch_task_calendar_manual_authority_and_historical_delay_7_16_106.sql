-- ADHDice 7.16.106: canonical Calendar manual authority and historical Delay.
--
-- Source-only migration. Do not execute or deploy from this workspace.
-- The trusted Edge planner supplies a narrow, server-derived History retirement
-- list for Calendar overrides; this RPC validates it again while holding the
-- Task transaction lock and retires it before inserting the override.

begin;

do $rpc$
declare
  definition text;
begin
  if to_regprocedure('public.adhdice_execute_task_state_command(uuid,jsonb)') is null then
    raise exception 'The canonical Task State command RPC is required before 7.16.106.';
  end if;
  definition := pg_get_functiondef('public.adhdice_execute_task_state_command(uuid,jsonb)'::regprocedure);

  definition := replace(
    definition,
    $needle$  v_automatic_history_delete_ids jsonb;
  v_automatic_history jsonb;$needle$,
    $replacement$  v_automatic_history_delete_ids jsonb;
  v_history_fact_delete_ids jsonb;
  v_automatic_history jsonb;$replacement$
  );
  definition := replace(
    definition,
    $needle$  v_automatic_history_delete_ids := coalesce(v_payload->'automatic_history_delete_ids', '[]'::jsonb);
  v_occurrence := coalesce(v_payload->'occurrence', '{}'::jsonb);$needle$,
    $replacement$  v_automatic_history_delete_ids := coalesce(v_payload->'automatic_history_delete_ids', '[]'::jsonb);
  v_history_fact_delete_ids := coalesce(v_payload->'history_fact_delete_ids', '[]'::jsonb);
  v_occurrence := coalesce(v_payload->'occurrence', '{}'::jsonb);$replacement$
  );
  definition := replace(
    definition,
    $needle$     or jsonb_typeof(v_automatic_history_delete_ids) <> 'array'
     or jsonb_typeof(v_occurrence) <> 'object'$needle$,
    $replacement$     or jsonb_typeof(v_automatic_history_delete_ids) <> 'array'
     or jsonb_typeof(v_history_fact_delete_ids) <> 'array'
     or jsonb_typeof(v_occurrence) <> 'object'$replacement$
  );
  definition := replace(
    definition,
    $needle$      'automatic_history_delete_ids', 'occurrence',$needle$,
    $replacement$      'automatic_history_delete_ids', 'history_fact_delete_ids', 'occurrence',$replacement$
  );
  definition := replace(
    definition,
    $needle$  if v_command_type <> 'set_outcome' and v_automatic_history_delete_ids <> '[]'::jsonb then
    raise exception 'Only a manual outcome correction may reconcile dependent automatic History.'
      using errcode = '42501';
  end if;$needle$,
    $replacement$  if v_command_type <> 'set_outcome' and v_automatic_history_delete_ids <> '[]'::jsonb then
    raise exception 'Only a manual outcome correction may reconcile dependent automatic History.'
      using errcode = '42501';
  end if;
  if v_command_type <> 'calendar_override' and v_history_fact_delete_ids <> '[]'::jsonb then
    raise exception 'Only the canonical Calendar override planner may retire same-date replaceable History.'
      using errcode = '42501';
  end if;$replacement$
  );
  definition := replace(
    definition,
    $needle$  if v_projection->>'status' is null
     or v_projection->>'due_on' is null and not (v_projection ? 'due_on')$needle$,
    $replacement$  if v_history_fact_delete_ids <> '[]'::jsonb then
    if jsonb_array_length(v_history_fact_delete_ids) <> 1
       or exists (
         select 1
           from jsonb_array_elements_text(v_history_fact_delete_ids) as requested(id)
           left join public.adhdice_task_history_facts fact
             on fact.user_id = p_user_id
            and fact.entity_id = v_entity_id
            and fact.id = requested.id::uuid
          where fact.id is null
             or fact.logical_date is distinct from nullif(v_calendar_override->>'logical_date', '')::date
             or fact.outcome not in ('done', 'did_my_best', 'missed')
       )
       or exists (
         select 1
           from public.adhdice_task_history_facts fact
          where fact.user_id = p_user_id
            and fact.entity_id = v_entity_id
            and fact.logical_date = nullif(v_calendar_override->>'logical_date', '')::date
            and fact.outcome in ('complete', 'delayed')
       )
       or exists (
         select 1
           from public.adhdice_task_history_facts fact
          where fact.user_id = p_user_id
            and fact.entity_id = v_entity_id
            and fact.logical_date = nullif(v_calendar_override->>'logical_date', '')::date
            and fact.outcome in ('done', 'did_my_best', 'missed')
            and fact.id not in (
              select value::uuid from jsonb_array_elements_text(v_history_fact_delete_ids)
            )
       ) then
      raise exception 'Calendar override History retirement is not a server-planned same-date replaceable fact.'
        using errcode = '55000';
    end if;
  end if;
  if exists (
    select 1
      from public.adhdice_task_history_facts fact
     where fact.user_id = p_user_id
       and fact.entity_id = v_entity_id
       and fact.logical_date = nullif(v_calendar_override->>'logical_date', '')::date
       and fact.outcome in ('complete', 'delayed')
  ) then
    raise exception 'Complete and Delayed History facts cannot be replaced by a Calendar override.'
      using errcode = '55000';
  end if;

  if v_projection->>'status' is null
     or v_projection->>'due_on' is null and not (v_projection ? 'due_on')$replacement$
  );
  definition := replace(
    definition,
    $needle$  if v_automatic_history_delete_ids <> '[]'::jsonb then
    update public.adhdice_task_occurrences occurrence$needle$,
    $replacement$  if v_history_fact_delete_ids <> '[]'::jsonb then
    update public.adhdice_task_occurrences occurrence
       set resolution_state = 'unresolved',
           resolved_logical_date = null,
           resolved_outcome = null,
           resolved_history_id = null,
           revision = occurrence.revision + 1,
           updated_at = now()
     where occurrence.user_id = p_user_id
       and occurrence.entity_id = v_entity_id
       and occurrence.resolved_history_id in (
         select value::uuid from jsonb_array_elements_text(v_history_fact_delete_ids)
       );
    update public.adhdice_task_occurrence_effective_overrides override_row
       set history_id = null,
           updated_at = now()
     where override_row.user_id = p_user_id
       and override_row.entity_id = v_entity_id
       and override_row.history_id in (
         select value::uuid from jsonb_array_elements_text(v_history_fact_delete_ids)
       );
    delete from public.adhdice_task_history_facts fact
     where fact.user_id = p_user_id
       and fact.entity_id = v_entity_id
       and fact.id in (
         select value::uuid from jsonb_array_elements_text(v_history_fact_delete_ids)
       );
  end if;$replacement$
  );
  definition := replace(
    definition,
    $needle$          || coalesce(v_automatic_history_delete_ids, '[]'::jsonb)
        ) value$needle$,
    $replacement$          || coalesce(v_automatic_history_delete_ids, '[]'::jsonb)
          || coalesce(v_history_fact_delete_ids, '[]'::jsonb)
        ) value$replacement$
  );
  definition := replace(
    definition,
    $needle$    'history_fact_delete_ids', v_automatic_history_delete_ids,$needle$,
    $replacement$    'history_fact_delete_ids', v_automatic_history_delete_ids || v_history_fact_delete_ids,$replacement$
  );

  if position($assert$  v_history_fact_delete_ids jsonb;$assert$ in definition) = 0
     or position($assert$v_history_fact_delete_ids := coalesce(v_payload->'history_fact_delete_ids', '[]'::jsonb);$assert$ in definition) = 0
     or position($assert$or jsonb_typeof(v_history_fact_delete_ids) <> 'array'$assert$ in definition) = 0
     or position($assert$'automatic_history_delete_ids', 'history_fact_delete_ids', 'occurrence'$assert$ in definition) = 0
     or position($assert$if v_command_type <> 'calendar_override' and v_history_fact_delete_ids <> '[]'::jsonb then$assert$ in definition) = 0
     or position($assert$Calendar override History retirement is not a server-planned same-date replaceable fact.$assert$ in definition) = 0
     or position($assert$Complete and Delayed History facts cannot be replaced by a Calendar override.$assert$ in definition) = 0
     or position($assert$update public.adhdice_task_occurrences occurrence
       set resolution_state = 'unresolved',$assert$ in definition) = 0
     or position($assert$update public.adhdice_task_occurrence_effective_overrides override_row
       set history_id = null,$assert$ in definition) = 0
     or position($assert$delete from public.adhdice_task_history_facts fact$assert$ in definition) = 0
     or position($assert$|| coalesce(v_history_fact_delete_ids, '[]'::jsonb)
        ) value$assert$ in definition) = 0
     or position($assert$'history_fact_delete_ids', v_automatic_history_delete_ids || v_history_fact_delete_ids$assert$ in definition) = 0 then
    raise exception 'Could not patch the canonical Task State command RPC for Calendar manual authority.';
  end if;
  execute definition;
end;
$rpc$;

commit;

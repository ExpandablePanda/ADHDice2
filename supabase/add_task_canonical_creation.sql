-- ADHDice 7.7.39 / M3B: trusted canonical Task creation.
--
-- This is intentionally a narrow service-role-only creation RPC.  It is not a
-- general canonical patch surface and it does not create History or rewards.
-- The authenticated Edge function derives the owner and sends a validated
-- TypeScript creation plan.  This function inserts the Task and its initial
-- schedule boundary in one transaction.

create or replace function public.adhdice_create_canonical_task(
  p_user_id uuid,
  p_plan jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_task_input public.adhdice_clean_tasks%rowtype;
  v_task public.adhdice_clean_tasks%rowtype;
  v_profile public.adhdice_user_profiles%rowtype;
  v_canonical jsonb;
  v_schedule jsonb;
  v_parent_task public.adhdice_clean_tasks%rowtype;
  v_boundary_id uuid;
  v_now timestamptz := clock_timestamp();
  v_entity_kind text;
  v_terminal_state text;
  v_container_state text;
  v_prior_container_state text;
  v_prior_container_state_status text;
  v_workflow_state text;
  v_workflow_revision bigint;
  v_canonical_revision bigint;
  v_effective_from date;
  v_schedule_model text;
  v_repeat_frequency text;
  v_repeat_interval integer;
  v_repeat_days smallint[];
  v_repeat_day_of_month integer;
  v_repeat_monthly_mode text;
  v_repeat_monthly_ordinal text;
  v_repeat_monthly_weekday smallint;
  v_one_time_due_on date;
  v_due_time time;
  v_anchor_date date;
  v_anchor_kind text;
  v_anchor_confidence text;
  v_historical_scope_known boolean;
  v_prospective_only boolean;
  v_settings_revision bigint;
  v_timezone text;
  v_day_start_time time;
  v_source text;
begin
  if current_user <> 'service_role' then
    raise exception 'Canonical Task creation requires the trusted service-role boundary.'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Canonical Task creation owner is required.' using errcode = '22023';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'Canonical Task creation plan must be an object.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_plan) as key_name(key)
    where key not in ('task', 'canonical', 'schedule')
  ) then
    raise exception 'Canonical Task creation plan contains unsupported fields.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan->'task') <> 'object'
     or jsonb_typeof(p_plan->'canonical') <> 'object'
     or jsonb_typeof(p_plan->'schedule') <> 'object' then
    raise exception 'Canonical Task creation plan is incomplete.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_plan->'task') as key_name(key)
    where key not in (
      'parent_task_id', 'title', 'notes', 'status', 'priority', 'priority_level', 'energy',
      'is_urgent', 'is_important', 'due_on', 'active_status_logical_date', 'active_occurrence_due_on',
      'scheduled_on', 'due_time', 'estimated_minutes', 'actual_seconds', 'tags', 'external_link_label',
      'external_link_url', 'one_step_at_a_time', 'subtasks_auto_reset', 'repeat_frequency',
      'repeat_interval', 'repeat_days_of_week', 'repeat_day_of_month', 'repeat_monthly_mode',
      'repeat_monthly_ordinal', 'repeat_monthly_weekday', 'pinned_at', 'pin_order', 'sort_order',
      'completed_at', 'trashed_at'
    )
  ) then
    raise exception 'Canonical Task creation task input contains privileged or unsupported fields.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_plan->'canonical') as key_name(key)
    where key not in (
      'entity_kind', 'terminal_state', 'container_state', 'prior_container_state',
      'prior_container_state_status', 'workflow_state', 'workflow_revision', 'canonical_revision'
    )
  ) then
    raise exception 'Canonical Task creation canonical input contains unsupported fields.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_plan->'schedule') as key_name(key)
    where key not in (
      'effective_from_logical_date', 'schedule_model', 'repeat_frequency', 'repeat_interval',
      'repeat_days_of_week', 'repeat_day_of_month', 'repeat_monthly_mode', 'repeat_monthly_ordinal',
      'repeat_monthly_weekday', 'one_time_due_on', 'due_time', 'anchor_date', 'anchor_kind',
      'anchor_confidence', 'historical_scope_known', 'prospective_only', 'logical_day_settings_revision',
      'timezone', 'day_start_time', 'source'
    )
  ) then
    raise exception 'Canonical Task creation schedule input contains unsupported fields.' using errcode = '22023';
  end if;

  select * into v_profile
  from public.adhdice_user_profiles
  where user_id = p_user_id;
  if not found then
    raise exception 'Canonical logical-day profile is unavailable.' using errcode = '22023';
  end if;

  v_task_input := jsonb_populate_record(null::public.adhdice_clean_tasks, p_plan->'task');
  if nullif(btrim(v_task_input.title), '') is null then
    raise exception 'A non-empty Task title is required.' using errcode = '22023';
  end if;
  if coalesce(v_task_input.status, 'pending'::public.adhdice_clean_task_status)
      not in ('pending', 'upcoming', 'not_due', 'archived') then
    raise exception 'This Task snapshot cannot be initialized without handled provenance.' using errcode = '22023';
  end if;
  if v_task_input.completed_at is not null or v_task_input.trashed_at is not null then
    raise exception 'Terminal or Trash timestamps require canonical provenance.' using errcode = '22023';
  end if;
  if v_task_input.active_status_logical_date is not null or v_task_input.active_occurrence_due_on is not null then
    raise exception 'Initial canonical Task status projections must be null.' using errcode = '22023';
  end if;

  v_canonical := p_plan->'canonical';
  v_entity_kind := v_canonical->>'entity_kind';
  v_terminal_state := v_canonical->>'terminal_state';
  v_container_state := v_canonical->>'container_state';
  v_prior_container_state := v_canonical->>'prior_container_state';
  v_prior_container_state_status := v_canonical->>'prior_container_state_status';
  v_workflow_state := v_canonical->>'workflow_state';
  v_workflow_revision := (v_canonical->>'workflow_revision')::bigint;
  v_canonical_revision := (v_canonical->>'canonical_revision')::bigint;

  if v_entity_kind not in ('parent', 'step', 'substep')
     or v_terminal_state <> 'active'
     or v_workflow_state <> 'none'
     or v_workflow_revision <> 1
     or v_canonical_revision <> 1
     or v_prior_container_state is not null
     or v_prior_container_state_status <> 'not_applicable' then
    raise exception 'Initial canonical Task state is invalid.' using errcode = '22023';
  end if;
  if v_container_state not in ('active', 'archived') then
    raise exception 'Initial canonical Task container state is invalid.' using errcode = '22023';
  end if;
  if (v_task_input.status = 'archived' and v_container_state <> 'archived')
     or (v_task_input.status is distinct from 'archived' and v_container_state <> 'active') then
    raise exception 'Initial canonical container state does not match the Task snapshot.' using errcode = '22023';
  end if;

  if v_task_input.parent_task_id is null then
    if v_entity_kind <> 'parent' then
      raise exception 'A root Task must use the parent canonical entity kind.' using errcode = '22023';
    end if;
  else
    select * into v_parent_task
    from public.adhdice_clean_tasks
    where user_id = p_user_id and id = v_task_input.parent_task_id;
    if not found then
      raise exception 'The Task parent was not found for this owner.' using errcode = '23503';
    end if;
    if (v_parent_task.parent_task_id is null and v_entity_kind <> 'step')
       or (v_parent_task.parent_task_id is not null and v_entity_kind <> 'substep') then
      raise exception 'The canonical Task entity kind does not match its parent relationship.' using errcode = '22023';
    end if;
  end if;

  v_schedule := p_plan->'schedule';
  if jsonb_typeof(v_schedule->'repeat_days_of_week') <> 'array' then
    raise exception 'Canonical Task repeat weekdays must be an array.' using errcode = '22023';
  end if;
  v_effective_from := (v_schedule->>'effective_from_logical_date')::date;
  v_schedule_model := v_schedule->>'schedule_model';
  v_repeat_frequency := v_schedule->>'repeat_frequency';
  v_repeat_interval := (v_schedule->>'repeat_interval')::integer;
  v_repeat_days := array(
    select value::smallint
    from jsonb_array_elements_text(v_schedule->'repeat_days_of_week') as item(value)
  );
  v_repeat_day_of_month := nullif(v_schedule->>'repeat_day_of_month', '')::integer;
  v_repeat_monthly_mode := v_schedule->>'repeat_monthly_mode';
  v_repeat_monthly_ordinal := v_schedule->>'repeat_monthly_ordinal';
  v_repeat_monthly_weekday := nullif(v_schedule->>'repeat_monthly_weekday', '')::smallint;
  v_one_time_due_on := nullif(v_schedule->>'one_time_due_on', '')::date;
  v_due_time := nullif(v_schedule->>'due_time', '')::time;
  v_anchor_date := nullif(v_schedule->>'anchor_date', '')::date;
  v_anchor_kind := v_schedule->>'anchor_kind';
  v_anchor_confidence := v_schedule->>'anchor_confidence';
  v_historical_scope_known := (v_schedule->>'historical_scope_known')::boolean;
  v_prospective_only := (v_schedule->>'prospective_only')::boolean;
  v_settings_revision := (v_schedule->>'logical_day_settings_revision')::bigint;
  v_timezone := v_schedule->>'timezone';
  v_day_start_time := (v_schedule->>'day_start_time')::time;
  v_source := v_schedule->>'source';

  if v_schedule_model not in ('unscheduled', 'one_time', 'rolling', 'fixed')
     or v_repeat_frequency not in ('none', 'daily', 'weekly', 'monthly', 'custom', 'daily_until_complete')
     or v_repeat_interval < 1
     or cardinality(v_repeat_days) > 7
     or not (v_repeat_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
     or v_repeat_monthly_mode not in ('day_of_month', 'ordinal_weekday')
     or (v_repeat_monthly_ordinal is not null and v_repeat_monthly_ordinal not in ('first', 'second', 'third', 'fourth', 'last'))
     or (v_repeat_monthly_weekday is not null and v_repeat_monthly_weekday not between 0 and 6)
     or v_anchor_kind not in ('user_selected', 'unknown')
     or v_anchor_confidence not in ('proven', 'unavailable')
     or v_source not in ('task_creation', 'task_import') then
    raise exception 'Canonical Task schedule is invalid.' using errcode = '22023';
  end if;
  if (v_schedule_model = 'unscheduled' and (v_repeat_frequency <> 'none' or v_one_time_due_on is not null or v_anchor_date is not null))
     or (v_schedule_model = 'one_time' and (v_repeat_frequency <> 'none' or v_one_time_due_on is null))
     or (v_schedule_model in ('rolling', 'fixed') and v_repeat_frequency = 'none') then
    raise exception 'Canonical Task schedule model does not match its repeat metadata.' using errcode = '22023';
  end if;
  if (v_anchor_confidence = 'proven' and v_anchor_date is null)
     or (v_anchor_confidence = 'unavailable' and v_anchor_date is not null)
     or (v_anchor_kind = 'unknown' and v_anchor_date is not null) then
    raise exception 'Canonical Task schedule anchor is invalid.' using errcode = '22023';
  end if;
  if v_historical_scope_known is distinct from false or v_prospective_only is distinct from true then
    raise exception 'New Task schedule provenance must be prospective and retain no invented historical scope.' using errcode = '22023';
  end if;
  if v_timezone is distinct from v_profile.timezone
     or v_day_start_time is distinct from v_profile.day_start_time::time
     or v_settings_revision is distinct from v_profile.settings_revision then
    raise exception 'Canonical logical-day settings do not match the owner profile.' using errcode = '22023';
  end if;

  insert into public.adhdice_clean_tasks (
    user_id, parent_task_id, revision, title, notes, status, priority, priority_level, energy,
    is_urgent, is_important, due_on, active_status_logical_date, active_occurrence_due_on,
    scheduled_on, due_time, estimated_minutes, actual_seconds, tags, external_link_label,
    external_link_url, one_step_at_a_time, subtasks_auto_reset, repeat_frequency, repeat_interval,
    repeat_days_of_week, repeat_day_of_month, repeat_monthly_mode, repeat_monthly_ordinal,
    repeat_monthly_weekday, pinned_at, pin_order, sort_order, completed_at, trashed_at,
    canonicalization_status, entity_kind, terminal_state, container_state, prior_container_state,
    prior_container_state_status, terminal_completed_at, container_trashed_at, workflow_state,
    workflow_started_at, workflow_logical_date, workflow_occurrence_id, workflow_command_id,
    workflow_revision, canonical_revision, canonical_created_at, canonical_updated_at,
    projection_source_canonical_revision, projection_source_fingerprint, projection_version
  )
  values (
    p_user_id, v_task_input.parent_task_id, 1, btrim(v_task_input.title), v_task_input.notes,
    coalesce(v_task_input.status, 'pending'::public.adhdice_clean_task_status),
    coalesce(v_task_input.priority, 'normal'::public.adhdice_clean_task_priority),
    coalesce(v_task_input.priority_level, 0), coalesce(v_task_input.energy, 'none'::public.adhdice_clean_task_energy),
    coalesce(v_task_input.is_urgent, false), coalesce(v_task_input.is_important, false), v_task_input.due_on,
    null, null, v_task_input.scheduled_on, v_task_input.due_time, v_task_input.estimated_minutes,
    coalesce(v_task_input.actual_seconds, 0), coalesce(v_task_input.tags, '{}'::text[]),
    v_task_input.external_link_label, v_task_input.external_link_url,
    coalesce(v_task_input.one_step_at_a_time, false), coalesce(v_task_input.subtasks_auto_reset, false),
    coalesce(v_task_input.repeat_frequency, 'none'::public.adhdice_clean_task_repeat_frequency),
    coalesce(v_task_input.repeat_interval, 1), coalesce(v_task_input.repeat_days_of_week, '{}'::smallint[]),
    v_task_input.repeat_day_of_month, coalesce(v_task_input.repeat_monthly_mode, 'day_of_month'::public.adhdice_clean_task_repeat_monthly_mode),
    v_task_input.repeat_monthly_ordinal, v_task_input.repeat_monthly_weekday, v_task_input.pinned_at,
    v_task_input.pin_order, coalesce(v_task_input.sort_order, 0), null, null,
    'canonical_runtime', v_entity_kind, v_terminal_state, v_container_state, null, v_prior_container_state_status,
    null, null, v_workflow_state, null, null, null, null, v_workflow_revision, v_canonical_revision,
    v_now, v_now, v_canonical_revision, 'canonical-task-create-v1:' || md5(p_plan::text), 'task-state-create-v1'
  )
  returning * into v_task;

  insert into public.adhdice_task_schedule_boundaries (
    user_id, entity_id, entity_kind, effective_from_logical_date, boundary_sequence, boundary_type,
    schedule_model, repeat_frequency, repeat_interval, repeat_days_of_week, repeat_day_of_month,
    repeat_monthly_mode, repeat_monthly_ordinal, repeat_monthly_weekday, one_time_due_on, due_time,
    anchor_date, anchor_kind, anchor_confidence, historical_scope_known, prospective_only,
    prior_boundary_id, affected_occurrence_id, logical_day_settings_revision, timezone, day_start_time,
    actor_kind, actor_id, source, command_id, idempotence_identity, migration_operation_id,
    migration_version, classifier_version, schema_contract_version, source_task_revision, revision,
    created_at, updated_at
  )
  values (
    p_user_id, v_task.id, v_entity_kind, v_effective_from, 1, 'initial', v_schedule_model,
    v_repeat_frequency, v_repeat_interval, v_repeat_days, v_repeat_day_of_month, v_repeat_monthly_mode,
    v_repeat_monthly_ordinal, v_repeat_monthly_weekday, v_one_time_due_on, v_due_time, v_anchor_date,
    v_anchor_kind, v_anchor_confidence, v_historical_scope_known, v_prospective_only, null, null,
    v_settings_revision, v_timezone, v_day_start_time, 'user', p_user_id, v_source, null,
    'task-create:' || v_task.id::text, null, null, null, 'task-state-schema-v1', 1, 1, v_now, v_now
  )
  returning id into v_boundary_id;

  return jsonb_build_object(
    'task', to_jsonb(v_task),
    'schedule_boundary_id', v_boundary_id
  );
end;
$function$;

revoke all on function public.adhdice_create_canonical_task(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_create_canonical_task(uuid, jsonb) to service_role;

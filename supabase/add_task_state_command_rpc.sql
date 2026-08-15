-- M3A: canonical Task State command persistence foundation.
--
-- Authored for separate review and deployment.  This file is intentionally
-- not executed by M3A.  The trusted Edge Function calls this backend-only
-- transaction.  The TypeScript command planner owns business-state
-- planning; this RPC owns the transaction, ownership, revision, idempotence,
-- canonical writes, compatibility projection, and reward-entitlement fence.
-- One function invocation is one database transaction.  No external calls or
-- legacy reward claims occur while the task row is locked.

create or replace function public.adhdice_execute_task_state_command(
  p_user_id uuid,
  p_command jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_command_id uuid;
  v_entity_id uuid;
  v_entity_kind text;
  v_command_type text;
  v_idempotence_identity text;
  v_accepted_payload_digest text;
  v_source_kind text;
  v_logical_day_context jsonb;
  v_payload jsonb;
  v_task_patch jsonb;
  v_projection jsonb;
  v_history jsonb;
  v_occurrence jsonb;
  v_schedule jsonb;
  v_effective_override jsonb;
  v_calendar_override jsonb;
  v_expected_entity_revision bigint;
  v_expected_boundary_sequence bigint;
  v_current_boundary_sequence bigint;
  v_task public.adhdice_clean_tasks%rowtype;
  v_operation public.adhdice_task_command_operations%rowtype;
  v_history_row public.adhdice_task_history_facts%rowtype;
  v_occurrence_row public.adhdice_task_occurrences%rowtype;
  v_schedule_id uuid;
  v_occurrence_id uuid;
  v_prior_history_occurrence_id uuid;
  v_history_id uuid;
  v_effective_override_id uuid;
  v_calendar_override_id uuid;
  v_reward_entitlement_id uuid;
  v_next_revision bigint;
  v_projection_status text;
  v_projection_due_on date;
  v_profile_timezone text;
  v_profile_day_start_time text;
  v_profile_settings_revision bigint;
  v_result jsonb;
  v_reward_program_version text;
  v_reward_event_identity text;
  v_operation_is_new boolean := false;
begin
  -- Only the trusted Edge Function's secret-key backend role may invoke this
  -- invoker function.  User ownership is established by the Edge Function
  -- from verified Auth claims, not by a browser-supplied body field.
  if current_user <> 'service_role' then
    raise exception 'Task State command RPC is backend-only.'
      using errcode = '42501';
  end if;

  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception 'Task State command must be a JSON object.'
      using errcode = '22023';
  end if;

  v_command_id := nullif(p_command->>'command_id', '')::uuid;
  v_entity_id := nullif(p_command->>'entity_id', '')::uuid;
  v_entity_kind := nullif(p_command->>'entity_kind', '');
  v_command_type := nullif(p_command->>'command_type', '');
  v_idempotence_identity := nullif(p_command->>'idempotence_identity', '');
  v_accepted_payload_digest := nullif(p_command->>'accepted_payload_digest', '');
  v_source_kind := coalesce(nullif(p_command->>'source_kind', ''), 'runtime');
  v_logical_day_context := coalesce(p_command->'logical_day_context', '{}'::jsonb);
  v_payload := coalesce(p_command->'payload', '{}'::jsonb);
  v_task_patch := coalesce(v_payload->'task_patch', '{}'::jsonb);
  v_projection := coalesce(v_payload->'compatibility_projection', '{}'::jsonb);
  v_history := coalesce(v_payload->'history_fact', '{}'::jsonb);
  v_occurrence := coalesce(v_payload->'occurrence', '{}'::jsonb);
  v_schedule := coalesce(v_payload->'schedule_boundary', '{}'::jsonb);
  v_effective_override := coalesce(v_payload->'occurrence_effective_override', '{}'::jsonb);
  v_calendar_override := coalesce(v_payload->'calendar_override', '{}'::jsonb);
  v_expected_entity_revision := nullif(p_command->>'expected_entity_revision', '')::bigint;
  v_expected_boundary_sequence := nullif(p_command->>'expected_boundary_sequence', '')::bigint;

  if v_source_kind <> 'runtime' then
    raise exception 'The runtime RPC accepts source_kind=runtime only (backend invocation).'
      using errcode = '42501';
  end if;

  if v_command_id is null
     or v_entity_id is null
     or v_entity_kind not in ('parent', 'step', 'substep')
     or v_command_type not in (
       'set_outcome', 'clear_outcome', 'complete_task', 'delay_occurrence',
       'set_due_date', 'set_repeat', 'calendar_override', 'archive_task',
       'trash_task', 'restore_task', 'start_in_progress', 'clear_in_progress',
       'reconcile_rollover', 'hierarchy_change'
     )
     or v_idempotence_identity is null
     or v_accepted_payload_digest is null
     or v_accepted_payload_digest !~ '^sha256-[0-9a-f]{64}$'
     or v_expected_entity_revision is null
     or v_expected_entity_revision < 1 then
    raise exception 'Task State command envelope is incomplete or invalid.'
      using errcode = '22023';
  end if;

  -- The Edge Function is the only caller allowed to build this payload.  Keep
  -- the SQL checks structural: they reject impossible planner output without
  -- reimplementing recurrence or Task State semantics.
  if jsonb_typeof(v_payload) <> 'object'
     or jsonb_typeof(v_logical_day_context) <> 'object'
     or jsonb_typeof(v_task_patch) <> 'object'
     or jsonb_typeof(v_projection) <> 'object'
     or jsonb_typeof(v_history) <> 'object'
     or jsonb_typeof(v_occurrence) <> 'object'
     or jsonb_typeof(v_schedule) <> 'object'
     or jsonb_typeof(v_effective_override) <> 'object'
     or jsonb_typeof(v_calendar_override) <> 'object' then
    raise exception 'Task State command payload sections must be JSON objects.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_object_keys(v_payload) as payload_key(key)
    where key not in (
      'task_patch', 'compatibility_projection', 'history_fact', 'occurrence',
      'schedule_boundary', 'occurrence_effective_override', 'calendar_override',
      'reward_program_version', 'occurrence_key', 'clear_logical_date', 'manual_action'
    )
  ) then
    raise exception 'Task State command payload contains an unknown section.'
      using errcode = '22023';
  end if;

  -- Runtime provenance is server-owned.  Reject a spoof before any replay
  -- operation is claimed, then overwrite the accepted values again below.
  if coalesce(nullif(v_history->>'provenance_kind', ''), 'user') <> 'user'
     or coalesce(nullif(v_occurrence->>'provenance_kind', ''), 'user') <> 'user'
     or coalesce(nullif(v_effective_override->>'provenance_kind', ''), 'user') <> 'user'
     or coalesce(nullif(v_calendar_override->>'provenance_kind', ''), 'manual') <> 'manual'
     or nullif(v_schedule->>'actor_kind', '') is not null and v_schedule->>'actor_kind' <> 'user'
     or nullif(v_occurrence->>'actor_kind', '') is not null and v_occurrence->>'actor_kind' <> 'user'
     or nullif(v_effective_override->>'actor_kind', '') is not null and v_effective_override->>'actor_kind' <> 'user'
     or nullif(v_history->>'actor_kind', '') is not null and v_history->>'actor_kind' <> 'user'
     or nullif(v_calendar_override->>'actor_kind', '') is not null and v_calendar_override->>'actor_kind' <> 'user'
     or nullif(v_history->>'migration_operation_id', '') is not null
     or nullif(v_occurrence->>'migration_operation_id', '') is not null
     or nullif(v_effective_override->>'migration_operation_id', '') is not null
     or nullif(v_calendar_override->>'migration_operation_id', '') is not null
     or nullif(v_schedule->>'migration_operation_id', '') is not null
     or nullif(v_history->>'source_legacy_history_id', '') is not null
     or nullif(v_schedule->>'source', '') is not null and v_schedule->>'source' <> 'task_state_command'
     or nullif(v_occurrence->>'source', '') is not null and v_occurrence->>'source' <> 'task_state_command'
     or nullif(v_effective_override->>'source', '') is not null and v_effective_override->>'source' <> 'task_state_command'
     or nullif(v_history->>'source', '') is not null and v_history->>'source' <> 'task_state_command'
     or nullif(v_calendar_override->>'source', '') is not null and v_calendar_override->>'source' <> 'task_state_command' then
    raise exception 'Runtime Task State provenance is server-owned.'
      using errcode = '42501';
  end if;

  if v_command_type = 'hierarchy_change' then
    raise exception 'This Task State command type has no trusted planner boundary.'
      using errcode = '0A000';
  end if;

  if v_command_type in ('archive_task', 'trash_task', 'restore_task') then
    if v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version' then
      raise exception 'Lifecycle commands cannot carry History, schedule, occurrence, delay, Calendar, or reward mutations.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'terminal_state', 'container_state', 'prior_container_state',
                        'prior_container_state_status', 'container_trashed_at')
    ) then
      raise exception 'Lifecycle command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'set_outcome' then
    if v_history = '{}'::jsonb or v_schedule <> '{}'::jsonb or v_effective_override <> '{}'::jsonb
       or v_calendar_override <> '{}'::jsonb or (v_payload ? 'reward_program_version' and v_history->>'outcome' = 'missed') then
      raise exception 'Outcome command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if v_history->>'outcome' not in ('done', 'did_my_best', 'missed')
       or v_history->>'event_kind' <> 'explicit_outcome' then
      raise exception 'Outcome command must carry one explicit outcome History fact.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'workflow_state', 'workflow_started_at',
                        'workflow_logical_date', 'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision')
    ) then
      raise exception 'Outcome command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'complete_task' then
    if v_history = '{}'::jsonb or v_history->>'outcome' <> 'complete'
       or v_history->>'event_kind' <> 'terminal_complete'
       or v_schedule <> '{}'::jsonb or v_effective_override <> '{}'::jsonb
       or v_calendar_override <> '{}'::jsonb or (v_payload ? 'reward_program_version') = false then
      raise exception 'Complete command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'terminal_state', 'terminal_completed_at', 'container_state',
                        'workflow_state', 'workflow_started_at', 'workflow_logical_date',
                        'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision')
    ) then
      raise exception 'Complete command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'delay_occurrence' then
    if v_history = '{}'::jsonb or v_history->>'outcome' <> 'delayed'
       or v_history->>'event_kind' <> 'delay_audit'
       or v_effective_override = '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_occurrence = '{}'::jsonb or v_calendar_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version' then
      raise exception 'Delay command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status')
    ) then
      raise exception 'Delay command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type in ('set_due_date', 'set_repeat') then
    if v_schedule = '{}'::jsonb or v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version' then
      raise exception 'Schedule command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status')
    ) then
      raise exception 'Schedule command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'calendar_override' then
    if v_calendar_override = '{}'::jsonb or v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb
       or v_schedule <> '{}'::jsonb or v_effective_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version' then
      raise exception 'Calendar override command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status')
    ) then
      raise exception 'Calendar command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'clear_outcome' then
    if v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'
       or v_payload ? 'reward_program_version'
       or not (v_payload ? 'clear_logical_date')
       or nullif(v_payload->>'clear_logical_date', '') is null then
      raise exception 'Clear outcome command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status')
    ) then
      raise exception 'Clear outcome command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type in ('start_in_progress', 'clear_in_progress') then
    if v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version' then
      raise exception 'Workflow command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'workflow_state', 'workflow_started_at',
                        'workflow_logical_date', 'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision')
    ) then
      raise exception 'Workflow command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
    if v_command_type = 'start_in_progress'
       and (v_task_patch->>'workflow_state' <> 'in_progress'
            or nullif(v_task_patch->>'workflow_started_at', '') is null
            or nullif(v_task_patch->>'workflow_logical_date', '') is null) then
      raise exception 'start_in_progress requires a compatible workflow patch.'
        using errcode = '22023';
    end if;
    if v_command_type = 'clear_in_progress'
       and (v_task_patch->>'workflow_state' <> 'none'
            or nullif(v_task_patch->>'workflow_started_at', '') is not null
            or nullif(v_task_patch->>'workflow_logical_date', '') is not null
            or nullif(v_task_patch->>'workflow_occurrence_id', '') is not null) then
      raise exception 'clear_in_progress requires a compatible workflow patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'reconcile_rollover' then
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
  end if;

  -- Serialize the two replay identities before the read/claim sequence.  The
  -- advisory locks are transaction-scoped and namespaced so equivalent first
  -- calls cannot both observe an absent operation and race the unique keys.
  -- The unique constraints remain the durable fence; ON CONFLICT plus the
  -- re-read below also handles a competing writer outside this function.
  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':task-state-idempotence:' || v_idempotence_identity,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':task-state-command:' || v_command_id::text,
    0
  ));

  -- Lock command identity before the entity.  Duplicate command ID and
  -- idempotence identity are both replay keys; a committed result is returned
  -- without reapplying any canonical write.
  select * into v_operation
    from public.adhdice_task_command_operations
   where user_id = p_user_id
     and idempotence_identity = v_idempotence_identity
   for update;
  if not found then
    select * into v_operation
      from public.adhdice_task_command_operations
     where user_id = p_user_id
       and command_id = v_command_id
     for update;
  end if;

  if not found then
    insert into public.adhdice_task_command_operations (
    user_id,
    entity_id,
    entity_kind,
    command_id,
    command_type,
    idempotence_identity,
    accepted_payload_digest,
    logical_day_context_identity,
    requested_logical_date,
    requested_occurrence_key,
    expected_entity_revision,
    expected_boundary_sequence,
    state,
    result_references,
    source_kind,
    schema_contract_version
  ) values (
    p_user_id,
    v_entity_id,
    v_entity_kind,
    v_command_id,
    v_command_type,
    v_idempotence_identity,
    v_accepted_payload_digest,
    nullif(v_logical_day_context->>'identity', ''),
    nullif(v_logical_day_context->>'logical_date', '')::date,
    nullif(v_payload->>'occurrence_key', ''),
    v_expected_entity_revision,
    v_expected_boundary_sequence,
    'accepted',
    '{}'::jsonb,
    v_source_kind,
    'task-state-schema-v1'
    )
    on conflict do nothing
    returning * into v_operation;

    if found then
      v_operation_is_new := true;
    else
      -- A concurrent or separately authorized writer claimed a replay key.
      -- Re-read it under row lock so equivalent requests replay while a
      -- mismatched payload receives the explicit identity-reuse error below.
      select * into v_operation
        from public.adhdice_task_command_operations
       where user_id = p_user_id
         and (idempotence_identity = v_idempotence_identity or command_id = v_command_id)
       order by case when idempotence_identity = v_idempotence_identity then 0 else 1 end
       limit 1
       for update;
      if not found then
        raise exception 'Task State command could not claim its replay identity.'
          using errcode = '40001';
      end if;
    end if;
  end if;

  if not v_operation_is_new then
    if v_operation.command_id is distinct from v_command_id
       or v_operation.idempotence_identity is distinct from v_idempotence_identity
       or v_operation.accepted_payload_digest is distinct from v_accepted_payload_digest then
      raise exception 'Command identity was reused with a different payload.'
        using errcode = '40001';
    end if;
    if v_operation.state in ('committed', 'rejected') then
      return v_operation.result_references || jsonb_build_object('was_replayed', true);
    end if;
    raise exception 'The command is already being processed.'
      using errcode = '40001';
  end if;

  -- The canonical Task row is the sole entity lock.  Compatibility status and
  -- due_on are applied only after this canonical revision check and never
  -- participate in deciding the canonical transition.
  select * into v_task
    from public.adhdice_clean_tasks
   where user_id = p_user_id
     and id = v_entity_id
   for update;
  if not found then
    v_result := jsonb_build_object(
      'command_id', v_command_id,
      'state', 'rejected',
      'conflict_code', 'TASK_NOT_FOUND',
      'expected_revision', v_expected_entity_revision,
      'next_revision', null
    );
    update public.adhdice_task_command_operations
       set state = 'rejected',
           conflict_code = 'TASK_NOT_FOUND',
           result_digest = md5(v_result::text),
           result_references = v_result,
           completed_at = now()
     where user_id = p_user_id and command_id = v_command_id;
    return v_result || jsonb_build_object('was_replayed', false);
  end if;

  if v_task.canonicalization_status not in ('canonical_proven', 'canonical_runtime')
     or v_task.canonical_revision is null then
    v_result := jsonb_build_object(
      'command_id', v_command_id,
      'state', 'rejected',
      'conflict_code', 'CANONICAL_STATE_UNAVAILABLE',
      'expected_revision', v_expected_entity_revision,
      'next_revision', v_task.canonical_revision
    );
    update public.adhdice_task_command_operations
       set state = 'rejected',
           conflict_code = 'CANONICAL_STATE_UNAVAILABLE',
           result_digest = md5(v_result::text),
           result_references = v_result,
           completed_at = now()
     where user_id = p_user_id and command_id = v_command_id;
    return v_result || jsonb_build_object('was_replayed', false);
  end if;

  select timezone, day_start_time::text, settings_revision
    into v_profile_timezone, v_profile_day_start_time, v_profile_settings_revision
    from public.adhdice_user_profiles
   where user_id = p_user_id;
  if not found or v_profile_timezone is null or v_profile_day_start_time is null
     or v_profile_settings_revision is null or v_profile_settings_revision < 1 then
    raise exception 'Canonical logical-day profile is unavailable.'
      using errcode = '55000';
  end if;
  v_logical_day_context := jsonb_set(v_logical_day_context, '{timezone}', to_jsonb(v_profile_timezone), true);
  v_logical_day_context := jsonb_set(v_logical_day_context, '{day_start_time}', to_jsonb(v_profile_day_start_time), true);
  v_logical_day_context := jsonb_set(v_logical_day_context, '{settings_revision}', to_jsonb(v_profile_settings_revision), true);

  if v_task.entity_kind is distinct from v_entity_kind then
    v_result := jsonb_build_object(
      'command_id', v_command_id,
      'state', 'rejected',
      'conflict_code', 'ENTITY_KIND_MISMATCH',
      'expected_revision', v_expected_entity_revision,
      'next_revision', v_task.canonical_revision
    );
    update public.adhdice_task_command_operations
       set state = 'rejected',
           conflict_code = 'ENTITY_KIND_MISMATCH',
           result_digest = md5(v_result::text),
           result_references = v_result,
           completed_at = now()
     where user_id = p_user_id and command_id = v_command_id;
    return v_result || jsonb_build_object('was_replayed', false);
  end if;

  if v_task.canonical_revision is distinct from v_expected_entity_revision then
    v_result := jsonb_build_object(
      'command_id', v_command_id,
      'state', 'rejected',
      'conflict_code', 'STALE_REVISION',
      'expected_revision', v_expected_entity_revision,
      'next_revision', v_task.canonical_revision
    );
    update public.adhdice_task_command_operations
       set state = 'rejected',
           conflict_code = 'STALE_REVISION',
           result_digest = md5(v_result::text),
           result_references = v_result,
           completed_at = now()
     where user_id = p_user_id and command_id = v_command_id;
    return v_result || jsonb_build_object('was_replayed', false);
  end if;

  -- canonical_revision is the entity-wide fence.  History and occurrence
  -- collection revision aggregates are intentionally not runtime fences:
  -- inserting a new revision-1 row does not create a monotonic generation.
  -- boundary_sequence remains valid because schedule boundaries are append-only.
  select coalesce(max(boundary_sequence), 0)
    into v_current_boundary_sequence
    from public.adhdice_task_schedule_boundaries
   where user_id = p_user_id and entity_id = v_entity_id;

  if v_expected_boundary_sequence is not null
     and v_expected_boundary_sequence is distinct from v_current_boundary_sequence then
    v_result := jsonb_build_object(
      'command_id', v_command_id,
      'state', 'rejected',
      'conflict_code', 'STALE_BOUNDARY_SEQUENCE',
      'expected_revision', v_expected_entity_revision,
      'next_revision', v_task.canonical_revision
    );
    update public.adhdice_task_command_operations
       set state = 'rejected',
           conflict_code = 'STALE_BOUNDARY_SEQUENCE',
           result_digest = md5(v_result::text),
           result_references = v_result,
           completed_at = now()
     where user_id = p_user_id and command_id = v_command_id;
    return v_result || jsonb_build_object('was_replayed', false);
  end if;

  -- Rollover is deliberately a projection/reconciliation command.  It may
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
  end if;

  if v_projection->>'status' is null
     or v_projection->>'due_on' is null and not (v_projection ? 'due_on')
     or v_projection->>'status' = 'unscheduled' then
    raise exception 'Canonical commands require a normalized persisted compatibility projection.'
      using errcode = '22023';
  end if;
  v_projection_status := v_projection->>'status';
  v_projection_due_on := nullif(v_projection->>'due_on', '')::date;
  if v_projection_status not in (
    'pending', 'done', 'missed', 'did_my_best', 'upcoming', 'not_due',
    'delayed', 'archived', 'trashed', 'complete', 'in_progress'
  ) then
    raise exception 'Compatibility status is not a supported persisted projection.'
      using errcode = '22023';
  end if;
  if v_projection_status = 'in_progress' and v_command_type <> 'start_in_progress' then
    raise exception 'Only start_in_progress may persist an in_progress compatibility projection.'
      using errcode = '22023';
  end if;
  if v_command_type = 'start_in_progress' and v_projection_status <> 'in_progress' then
    raise exception 'start_in_progress requires an in_progress compatibility projection.'
      using errcode = '22023';
  end if;

  v_next_revision := v_task.canonical_revision + 1;

  if v_command_type = 'start_in_progress' then
    v_task_patch := jsonb_set(v_task_patch, '{workflow_command_id}', to_jsonb(v_command_id), true);
    v_task_patch := jsonb_set(v_task_patch, '{workflow_started_at}', to_jsonb(now()), true);
    v_task_patch := jsonb_set(v_task_patch, '{workflow_logical_date}', to_jsonb(nullif(v_logical_day_context->>'logical_date', '')::date), true);
  elsif v_command_type in ('set_outcome', 'complete_task', 'clear_in_progress') then
    v_task_patch := jsonb_set(v_task_patch, '{workflow_command_id}', 'null'::jsonb, true);
  end if;
  if v_command_type in ('set_outcome', 'complete_task', 'start_in_progress', 'clear_in_progress') then
    v_task_patch := jsonb_set(v_task_patch, '{workflow_revision}', to_jsonb(coalesce(v_task.workflow_revision, 0) + 1), true);
  end if;
  update public.adhdice_clean_tasks
     set canonicalization_status = case
       when v_task.canonicalization_status = 'canonical_proven' then 'canonical_runtime'
       else v_task.canonicalization_status
     end,
         terminal_state = case when v_task_patch ? 'terminal_state' then v_task_patch->>'terminal_state' else terminal_state end,
         container_state = case when v_task_patch ? 'container_state' then v_task_patch->>'container_state' else container_state end,
         prior_container_state = case when v_task_patch ? 'prior_container_state' then nullif(v_task_patch->>'prior_container_state', '') else prior_container_state end,
         prior_container_state_status = case when v_task_patch ? 'prior_container_state_status' then v_task_patch->>'prior_container_state_status' else prior_container_state_status end,
         terminal_completed_at = case when v_task_patch ? 'terminal_completed_at' then nullif(v_task_patch->>'terminal_completed_at', '')::timestamptz else terminal_completed_at end,
         container_trashed_at = case when v_task_patch ? 'container_trashed_at' then nullif(v_task_patch->>'container_trashed_at', '')::timestamptz else container_trashed_at end,
         workflow_state = case when v_task_patch ? 'workflow_state' then v_task_patch->>'workflow_state' else workflow_state end,
         workflow_started_at = case when v_task_patch ? 'workflow_started_at' then nullif(v_task_patch->>'workflow_started_at', '')::timestamptz else workflow_started_at end,
         workflow_logical_date = case when v_task_patch ? 'workflow_logical_date' then nullif(v_task_patch->>'workflow_logical_date', '')::date else workflow_logical_date end,
         workflow_occurrence_id = case when v_task_patch ? 'workflow_occurrence_id' then nullif(v_task_patch->>'workflow_occurrence_id', '')::uuid else workflow_occurrence_id end,
         workflow_command_id = case when v_task_patch ? 'workflow_command_id' then nullif(v_task_patch->>'workflow_command_id', '')::uuid else workflow_command_id end,
         workflow_revision = case when v_task_patch ? 'workflow_revision' then (v_task_patch->>'workflow_revision')::bigint else workflow_revision end,
         status = v_projection_status::public.adhdice_clean_task_status,
         due_on = v_projection_due_on,
         completed_at = case when v_projection ? 'completed_at' then nullif(v_projection->>'completed_at', '')::timestamptz else completed_at end,
         active_status_logical_date = case when v_projection ? 'active_status_logical_date' then nullif(v_projection->>'active_status_logical_date', '')::date else active_status_logical_date end,
         active_occurrence_due_on = case when v_projection ? 'active_occurrence_due_on' then nullif(v_projection->>'active_occurrence_due_on', '')::date else active_occurrence_due_on end,
         canonical_revision = v_next_revision,
         canonical_updated_at = now(),
         projection_source_canonical_revision = v_next_revision,
         projection_source_fingerprint = v_accepted_payload_digest,
         projection_version = 'task-state-projection-v1',
         revision = revision + 1,
         updated_at = now()
   where user_id = p_user_id and id = v_entity_id;

  -- Schedule boundaries are append-only canonical schedule authority.  The
  -- planner supplies a complete schema-aligned row; server-owned identity and
  -- owner/command columns are overwritten before the insert.
  if v_schedule <> '{}'::jsonb then
    v_schedule := jsonb_set(v_schedule, '{id}', to_jsonb(coalesce(nullif(v_schedule->>'id', '')::uuid, gen_random_uuid())), true);
    v_schedule := jsonb_set(v_schedule, '{user_id}', to_jsonb(p_user_id), true);
    v_schedule := jsonb_set(v_schedule, '{entity_id}', to_jsonb(v_entity_id), true);
    v_schedule := jsonb_set(v_schedule, '{entity_kind}', to_jsonb(v_entity_kind), true);
    v_schedule := jsonb_set(v_schedule, '{actor_kind}', to_jsonb('user'::text), true);
    v_schedule := jsonb_set(v_schedule, '{actor_id}', to_jsonb(p_user_id), true);
    v_schedule := jsonb_set(v_schedule, '{source}', to_jsonb('task_state_command'::text), true);
    v_schedule := jsonb_set(v_schedule, '{command_id}', to_jsonb(v_command_id), true);
    v_schedule := jsonb_set(v_schedule, '{idempotence_identity}', to_jsonb(v_idempotence_identity), true);
    v_schedule := jsonb_set(v_schedule, '{migration_operation_id}', 'null'::jsonb, true);
    v_schedule := jsonb_set(v_schedule, '{migration_version}', 'null'::jsonb, true);
    v_schedule := jsonb_set(v_schedule, '{classifier_version}', 'null'::jsonb, true);
    v_schedule := jsonb_set(v_schedule, '{logical_day_settings_revision}', to_jsonb(v_profile_settings_revision), true);
    v_schedule := jsonb_set(v_schedule, '{timezone}', to_jsonb(v_profile_timezone), true);
    v_schedule := jsonb_set(v_schedule, '{day_start_time}', to_jsonb(v_profile_day_start_time), true);
    v_schedule := jsonb_set(v_schedule, '{source_task_revision}', to_jsonb(v_task.revision), true);
    v_schedule := jsonb_set(v_schedule, '{revision}', to_jsonb(1), true);
    v_schedule := jsonb_set(v_schedule, '{schema_contract_version}', to_jsonb('task-state-schema-v1'::text), true);
    v_schedule := jsonb_set(v_schedule, '{created_at}', to_jsonb(now()), true);
    v_schedule := jsonb_set(v_schedule, '{updated_at}', to_jsonb(now()), true);
    insert into public.adhdice_task_schedule_boundaries
    select (jsonb_populate_record(null::public.adhdice_task_schedule_boundaries, v_schedule)).*;
    v_schedule_id := (v_schedule->>'id')::uuid;
  end if;

  -- An occurrence is inserted only when a command needs durable occurrence
  -- identity.  Delay and handled outcomes never replace that identity.
  if v_occurrence <> '{}'::jsonb then
    v_occurrence := jsonb_set(v_occurrence, '{id}', to_jsonb(coalesce(nullif(v_occurrence->>'id', '')::uuid, gen_random_uuid())), true);
    v_occurrence := jsonb_set(v_occurrence, '{user_id}', to_jsonb(p_user_id), true);
    v_occurrence := jsonb_set(v_occurrence, '{entity_id}', to_jsonb(v_entity_id), true);
    v_occurrence := jsonb_set(v_occurrence, '{entity_kind}', to_jsonb(v_entity_kind), true);
    v_occurrence := jsonb_set(v_occurrence, '{provenance_kind}', to_jsonb('user'::text), true);
    v_occurrence := jsonb_set(v_occurrence, '{actor_kind}', to_jsonb('user'::text), true);
    v_occurrence := jsonb_set(v_occurrence, '{actor_id}', to_jsonb(p_user_id), true);
    v_occurrence := jsonb_set(v_occurrence, '{source}', to_jsonb('task_state_command'::text), true);
    v_occurrence := jsonb_set(v_occurrence, '{command_id}', to_jsonb(v_command_id), true);
    v_occurrence := jsonb_set(v_occurrence, '{migration_operation_id}', 'null'::jsonb, true);
    v_occurrence := jsonb_set(v_occurrence, '{revision}', to_jsonb(1), true);
    v_occurrence := jsonb_set(v_occurrence, '{created_at}', to_jsonb(now()), true);
    v_occurrence := jsonb_set(v_occurrence, '{updated_at}', to_jsonb(now()), true);
    insert into public.adhdice_task_occurrences
    select (jsonb_populate_record(null::public.adhdice_task_occurrences, v_occurrence)).*
    on conflict (user_id, id) do nothing;
    v_occurrence_id := (v_occurrence->>'id')::uuid;
  end if;

  if nullif(v_history->>'occurrence_id', '') is not null then
    v_occurrence_id := (v_history->>'occurrence_id')::uuid;
    select * into v_occurrence_row
      from public.adhdice_task_occurrences
     where user_id = p_user_id and id = v_occurrence_id and entity_id = v_entity_id
     for update;
    if not found then
      raise exception 'History fact occurrence is not owned by the Task entity.'
        using errcode = '23503';
    end if;
  end if;

  if v_effective_override <> '{}'::jsonb then
    if v_schedule_id is null then
      v_schedule_id := nullif(v_effective_override->>'schedule_boundary_id', '')::uuid;
      select id into v_schedule_id
        from public.adhdice_task_schedule_boundaries
       where user_id = p_user_id and entity_id = v_entity_id and id = v_schedule_id;
      if not found then
        raise exception 'An effective-date override requires an owned schedule boundary.'
          using errcode = '23503';
      end if;
    end if;
    v_effective_override := jsonb_set(v_effective_override, '{id}', to_jsonb(coalesce(nullif(v_effective_override->>'id', '')::uuid, gen_random_uuid())), true);
    v_effective_override := jsonb_set(v_effective_override, '{user_id}', to_jsonb(p_user_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{entity_id}', to_jsonb(v_entity_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{occurrence_id}', to_jsonb(v_occurrence_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{schedule_boundary_id}', to_jsonb(v_schedule_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{provenance_kind}', to_jsonb('user'::text), true);
    v_effective_override := jsonb_set(v_effective_override, '{actor_kind}', to_jsonb('user'::text), true);
    v_effective_override := jsonb_set(v_effective_override, '{actor_id}', to_jsonb(p_user_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{source}', to_jsonb('task_state_command'::text), true);
    v_effective_override := jsonb_set(v_effective_override, '{command_id}', to_jsonb(v_command_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{idempotence_identity}', to_jsonb(v_idempotence_identity), true);
    v_effective_override := jsonb_set(v_effective_override, '{migration_operation_id}', 'null'::jsonb, true);
    v_effective_override := jsonb_set(v_effective_override, '{accepted_payload_digest}', to_jsonb(v_accepted_payload_digest), true);
    v_effective_override := jsonb_set(v_effective_override, '{revision}', to_jsonb(1), true);
    v_effective_override := jsonb_set(v_effective_override, '{created_at}', to_jsonb(now()), true);
    v_effective_override := jsonb_set(v_effective_override, '{updated_at}', to_jsonb(now()), true);
    insert into public.adhdice_task_occurrence_effective_overrides
    select (jsonb_populate_record(null::public.adhdice_task_occurrence_effective_overrides, v_effective_override)).*;
    v_effective_override_id := (v_effective_override->>'id')::uuid;
  end if;

  if v_command_type = 'clear_outcome' then
    if exists (
      select 1
        from public.adhdice_task_reward_entitlements entitlement
       where entitlement.user_id = p_user_id
         and entitlement.entity_id = v_entity_id
         and entitlement.logical_date = (v_payload->>'clear_logical_date')::date
    ) then
      raise exception 'A canonical reward entitlement references this outcome; clearing it would invalidate reward provenance.'
        using errcode = '55000';
    end if;
    update public.adhdice_task_occurrences occurrence
       set resolution_state = 'unresolved',
           resolved_logical_date = null,
           resolved_outcome = null,
           resolved_history_id = null,
           revision = occurrence.revision + 1,
           updated_at = now()
     where occurrence.user_id = p_user_id
       and occurrence.entity_id = v_entity_id
       and occurrence.resolved_logical_date = (v_payload->>'clear_logical_date')::date;
    update public.adhdice_task_occurrence_effective_overrides override_row
       set history_id = null,
           updated_at = now()
     where override_row.user_id = p_user_id
       and override_row.entity_id = v_entity_id
       and override_row.history_id in (
         select fact.id
           from public.adhdice_task_history_facts fact
          where fact.user_id = p_user_id
            and fact.entity_id = v_entity_id
            and fact.logical_date = (v_payload->>'clear_logical_date')::date
       );
    update public.adhdice_task_calendar_overrides calendar_override_row
       set is_active = false,
           cleared_at = now(),
           cleared_by_command_id = v_command_id,
           revision = calendar_override_row.revision + 1,
           updated_at = now()
     where calendar_override_row.user_id = p_user_id
       and calendar_override_row.entity_id = v_entity_id
       and calendar_override_row.logical_date = (v_payload->>'clear_logical_date')::date
       and calendar_override_row.is_active;
    delete from public.adhdice_task_history_facts
     where user_id = p_user_id
       and entity_id = v_entity_id
       and logical_date = (v_payload->>'clear_logical_date')::date;
  elsif v_history <> '{}'::jsonb then
    select fact.occurrence_id
      into v_prior_history_occurrence_id
      from public.adhdice_task_history_facts fact
     where fact.user_id = p_user_id
       and fact.entity_id = v_entity_id
       and fact.logical_date = nullif(v_history->>'logical_date', '')::date
     for update;
    v_history := jsonb_set(v_history, '{id}', to_jsonb(coalesce(nullif(v_history->>'id', '')::uuid, gen_random_uuid())), true);
    v_history := jsonb_set(v_history, '{user_id}', to_jsonb(p_user_id), true);
    v_history := jsonb_set(v_history, '{entity_id}', to_jsonb(v_entity_id), true);
    v_history := jsonb_set(v_history, '{entity_kind}', to_jsonb(v_entity_kind), true);
    v_history := jsonb_set(v_history, '{provenance_kind}', to_jsonb('user'::text), true);
    v_history := jsonb_set(v_history, '{actor_kind}', to_jsonb('user'::text), true);
    v_history := jsonb_set(v_history, '{actor_id}', to_jsonb(p_user_id), true);
    v_history := jsonb_set(v_history, '{source}', to_jsonb('task_state_command'::text), true);
    v_history := jsonb_set(v_history, '{logical_day_settings_revision}', to_jsonb(v_profile_settings_revision), true);
    v_history := jsonb_set(v_history, '{timezone}', to_jsonb(v_profile_timezone), true);
    v_history := jsonb_set(v_history, '{day_start_time}', to_jsonb(v_profile_day_start_time), true);
    v_history := jsonb_set(v_history, '{command_id}', to_jsonb(v_command_id), true);
    v_history := jsonb_set(v_history, '{idempotence_identity}', to_jsonb(v_idempotence_identity || ':history:' || (v_history->>'logical_date') || ':' || (v_history->>'outcome')), true);
    v_history := jsonb_set(v_history, '{migration_operation_id}', 'null'::jsonb, true);
    v_history := jsonb_set(v_history, '{source_legacy_history_id}', 'null'::jsonb, true);
    v_history := jsonb_set(v_history, '{revision}', to_jsonb(1), true);
    v_history := jsonb_set(v_history, '{created_at}', to_jsonb(now()), true);
    v_history := jsonb_set(v_history, '{updated_at}', to_jsonb(now()), true);
    if v_schedule_id is not null then
      v_history := jsonb_set(v_history, '{schedule_boundary_id}', to_jsonb(v_schedule_id), true);
    end if;
    if v_occurrence_id is not null then
      v_history := jsonb_set(v_history, '{occurrence_id}', to_jsonb(v_occurrence_id), true);
    end if;
    insert into public.adhdice_task_history_facts
    select (jsonb_populate_record(null::public.adhdice_task_history_facts, v_history)).*
    on conflict (user_id, entity_id, logical_date) do update
      set outcome = excluded.outcome,
          event_kind = excluded.event_kind,
          occurrence_id = excluded.occurrence_id,
          scheduled_due_on = excluded.scheduled_due_on,
          effective_due_on = excluded.effective_due_on,
          schedule_boundary_id = excluded.schedule_boundary_id,
          recurrence_source_fingerprint = excluded.recurrence_source_fingerprint,
          provenance_kind = excluded.provenance_kind,
          actor_kind = excluded.actor_kind,
          actor_id = excluded.actor_id,
          source = excluded.source,
          logical_day_settings_revision = excluded.logical_day_settings_revision,
          timezone = excluded.timezone,
          day_start_time = excluded.day_start_time,
          command_id = excluded.command_id,
          idempotence_identity = excluded.idempotence_identity,
          migration_operation_id = excluded.migration_operation_id,
          source_legacy_history_id = excluded.source_legacy_history_id,
          revision = public.adhdice_task_history_facts.revision + 1,
          updated_at = now()
    returning * into v_history_row;
    v_history_id := v_history_row.id;

    if v_prior_history_occurrence_id is not null
       and v_prior_history_occurrence_id is distinct from v_history_row.occurrence_id then
      update public.adhdice_task_occurrences prior_occurrence
         set resolution_state = 'unresolved',
             resolved_logical_date = null,
             resolved_outcome = null,
             resolved_history_id = null,
             revision = prior_occurrence.revision + 1,
             updated_at = now()
       where prior_occurrence.user_id = p_user_id
         and prior_occurrence.id = v_prior_history_occurrence_id
         and prior_occurrence.entity_id = v_entity_id
         and prior_occurrence.resolved_history_id = v_history_id;
    end if;

    if v_occurrence_id is not null then
      update public.adhdice_task_occurrences
         set resolution_state = 'resolved',
             resolved_logical_date = v_history_row.logical_date,
             resolved_outcome = v_history_row.outcome,
             resolved_history_id = v_history_id,
             revision = revision + 1,
             updated_at = now()
       where user_id = p_user_id and id = v_occurrence_id and entity_id = v_entity_id;
    end if;
    if v_effective_override_id is not null then
      update public.adhdice_task_occurrence_effective_overrides
         set history_id = v_history_id,
             updated_at = now()
       where user_id = p_user_id and id = v_effective_override_id;
    end if;
  end if;

  if v_calendar_override <> '{}'::jsonb then
    -- Replaceable instructions retire the prior active row in this same
    -- transaction, preserving it as audit history and keeping the active
    -- unique key clear before the new row is inserted.
    update public.adhdice_task_calendar_overrides existing_override
       set is_active = false,
           cleared_at = now(),
           cleared_by_command_id = v_command_id,
           revision = existing_override.revision + 1,
           updated_at = now()
     where existing_override.user_id = p_user_id
       and existing_override.entity_id = v_entity_id
       and existing_override.logical_date = nullif(v_calendar_override->>'logical_date', '')::date
       and existing_override.is_active;
    v_calendar_override := jsonb_set(v_calendar_override, '{id}', to_jsonb(coalesce(nullif(v_calendar_override->>'id', '')::uuid, gen_random_uuid())), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{user_id}', to_jsonb(p_user_id), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{entity_id}', to_jsonb(v_entity_id), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{entity_kind}', to_jsonb(v_entity_kind), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{provenance_kind}', to_jsonb('manual'::text), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{actor_kind}', to_jsonb('user'::text), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{actor_id}', to_jsonb(p_user_id), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{source}', to_jsonb('task_state_command'::text), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{command_id}', to_jsonb(v_command_id), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{idempotence_identity}', to_jsonb(v_idempotence_identity), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{migration_operation_id}', 'null'::jsonb, true);
    v_calendar_override := jsonb_set(v_calendar_override, '{revision}', to_jsonb(1), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{created_at}', to_jsonb(now()), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{updated_at}', to_jsonb(now()), true);
    insert into public.adhdice_task_calendar_overrides
    select (jsonb_populate_record(null::public.adhdice_task_calendar_overrides, v_calendar_override)).*;
    v_calendar_override_id := (v_calendar_override->>'id')::uuid;
  end if;

  -- The entitlement is canonical and unique per entity/logical date/program.
  -- Legacy reward claims are deliberately not consulted or written here.
  if v_history_id is not null and v_history_row.outcome in ('done', 'did_my_best', 'complete') then
    v_reward_program_version := coalesce(nullif(v_payload->>'reward_program_version', ''), 'task-reward-v1');
    v_reward_event_identity := 'task-reward-entitlement:' || v_entity_id::text || ':' || v_history_row.logical_date::text || ':' || v_reward_program_version;
    insert into public.adhdice_task_reward_entitlements (
      user_id,
      entity_id,
      entity_kind,
      logical_date,
      reward_program_version,
      canonical_history_id,
      canonical_command_id,
      canonical_event_identity,
      outcome_snapshot,
      effective_obligation_identity,
      eligibility_kind,
      entitlement_source_kind,
      state
    ) values (
      p_user_id,
      v_entity_id,
      v_entity_kind,
      v_history_row.logical_date,
      v_reward_program_version,
      v_history_id,
      v_command_id,
      v_reward_event_identity,
      v_history_row.outcome,
      coalesce(v_history_row.occurrence_id::text, v_history_row.scheduled_due_on::text),
      'handled_success',
      'runtime_command',
      'pending'
    )
    on conflict (user_id, entity_id, logical_date, reward_program_version) do nothing
    returning id into v_reward_entitlement_id;
    if v_reward_entitlement_id is null then
      select id into v_reward_entitlement_id
        from public.adhdice_task_reward_entitlements
       where user_id = p_user_id
         and entity_id = v_entity_id
         and logical_date = v_history_row.logical_date
         and reward_program_version = v_reward_program_version;
    end if;
  end if;

  v_result := jsonb_build_object(
    'command_id', v_command_id,
    'state', 'committed',
    'conflict_code', null,
    'expected_revision', v_expected_entity_revision,
    'next_revision', v_next_revision,
    'task_id', v_entity_id,
    'history_fact_id', v_history_id,
    'schedule_boundary_id', v_schedule_id,
    'occurrence_id', v_occurrence_id,
    'effective_override_id', v_effective_override_id,
    'calendar_override_id', v_calendar_override_id,
    'manual_action', nullif(v_payload->>'manual_action', ''),
    'reward_entitlement_id', v_reward_entitlement_id,
    'compatibility_projection', v_projection,
    'canonical_task_patch', v_task_patch
  );

  -- The operation becomes committed only after every canonical write and the
  -- compatibility projection have succeeded in this same transaction.
  update public.adhdice_task_command_operations
     set state = 'committed',
         result_digest = md5(v_result::text),
         result_references = v_result,
         completed_at = now()
   where user_id = p_user_id and command_id = v_command_id;

  return v_result || jsonb_build_object('was_replayed', false);
end;
$function$;

revoke all on function public.adhdice_execute_task_state_command(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_execute_task_state_command(uuid, jsonb) to service_role;

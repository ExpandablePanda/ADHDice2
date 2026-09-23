-- ADHDice 7.15.14 Current Task projection persistence protocol.
--
-- Source-only contract. Apply only after the 7.15.12 projection table exists
-- and only with explicit live-SQL authorization. This file does not invoke the
-- canonical command, backfill projections, deploy Edge code, or alter any
-- canonical Task/History fact.

begin;

-- The trusted writer is a narrow service-role boundary. It accepts a complete
-- calculator result, proves the source fences against current canonical rows,
-- and never calculates Task State or writes canonical facts.
create or replace function public.adhdice_upsert_task_current_projection(
  p_user_id uuid,
  p_projection jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_candidate public.adhdice_task_current_projections%rowtype;
  v_task public.adhdice_clean_tasks%rowtype;
  v_sync_epoch uuid;
  v_profile_timezone text;
  v_profile_day_start_time text;
  v_profile_settings_revision bigint;
  v_latest_history_revision bigint;
  v_written jsonb;
begin
  if current_user <> 'service_role' then
    raise exception 'Current Task projection writer is backend-only.'
      using errcode = '42501';
  end if;

  if p_user_id is null
     or p_projection is null
     or jsonb_typeof(p_projection) <> 'object' then
    raise exception 'Current Task projection candidate must be a JSON object.'
      using errcode = '22023';
  end if;

  if p_projection->>'validity' is distinct from 'valid' then
    raise exception 'Current Task projection writer accepts only valid candidates.'
      using errcode = '22023';
  end if;

  begin
    v_candidate := jsonb_populate_record(
      null::public.adhdice_task_current_projections,
      p_projection
    );
  exception when others then
    raise exception 'Current Task projection candidate is malformed.'
      using errcode = '22023';
  end;

  if v_candidate.user_id is distinct from p_user_id
     or v_candidate.entity_id is null
     or v_candidate.entity_kind is null then
    raise exception 'Current Task projection owner or identity does not match the writer request.'
      using errcode = '42501';
  end if;

  select * into v_task
    from public.adhdice_clean_tasks task
   where task.user_id = p_user_id
     and task.id = v_candidate.entity_id
     and task.permanently_deleted_at is null;
  if not found then
    raise exception 'Current Task projection Task is missing or not owned by the writer request.'
      using errcode = '42501';
  end if;
  if v_candidate.entity_kind is distinct from v_task.entity_kind then
    raise exception 'Current Task projection entity kind does not match the canonical Task.'
      using errcode = '42501';
  end if;
  if v_candidate.canonical_task_revision is distinct from v_task.canonical_revision then
    raise exception 'Current Task projection canonical Task revision is stale.'
      using errcode = '40001';
  end if;

  select state.sync_epoch
    into v_sync_epoch
    from public.adhdice_task_history_sync_state state
   where state.user_id = p_user_id;
  if not found or v_candidate.history_sync_epoch is distinct from v_sync_epoch then
    raise exception 'Current Task projection History sync epoch is stale.'
      using errcode = '40001';
  end if;

  select coalesce(max(changes.sequence), 0)
    into v_latest_history_revision
    from public.adhdice_task_history_changes changes
   where changes.user_id = p_user_id
     and changes.entity_id = v_candidate.entity_id;
  if v_candidate.history_source_revision is distinct from v_latest_history_revision then
    raise exception 'Current Task projection entity History frontier is stale.'
      using errcode = '40001';
  end if;

  select profile.timezone, profile.day_start_time::text, profile.settings_revision
    into v_profile_timezone, v_profile_day_start_time, v_profile_settings_revision
    from public.adhdice_user_profiles profile
   where profile.user_id = p_user_id;
  if not found
     or v_profile_timezone is null
     or v_profile_day_start_time is null
     or v_profile_settings_revision is null
     or v_profile_settings_revision < 1 then
    raise exception 'Current Task projection logical-day authority is unavailable.'
      using errcode = '55000';
  end if;
  if v_candidate.logical_day_settings_revision is distinct from v_profile_settings_revision then
    raise exception 'Current Task projection logical-day settings revision is stale.'
      using errcode = '40001';
  end if;
  if v_candidate.projected_logical_date is distinct from public.adhdice_effective_logical_date(
    pg_catalog.clock_timestamp(),
    v_profile_timezone,
    v_profile_day_start_time
  ) then
    raise exception 'Current Task projection logical date is stale.'
      using errcode = '40001';
  end if;

  if v_candidate.projection_schema_version is distinct from 'task-current-projection-schema-v1'
     or v_candidate.projection_algorithm_version is distinct from 'task-current-projection-algorithm-v1' then
    raise exception 'Current Task projection version is unsupported.'
      using errcode = '22023';
  end if;
  if v_candidate.history_source_fingerprint is null
     or v_candidate.history_source_fingerprint !~ '^sha256:[0-9a-f]{64}$'
     or v_candidate.schedule_boundary_revision is null
     or v_candidate.schedule_boundary_revision !~ '^sha256:[0-9a-f]{64}$'
     or v_candidate.behavior_policy_revision is null
     or v_candidate.behavior_policy_revision !~ '^sha256:[0-9a-f]{64}$'
     or v_candidate.source_fingerprint is null
     or v_candidate.source_fingerprint !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'Current Task projection fingerprint contract is malformed.'
      using errcode = '22023';
  end if;

  -- The updated_at fence makes a retry with the same candidate idempotent,
  -- while preventing an older valid candidate from replacing a newer row.
  insert into public.adhdice_task_current_projections as projection
  select v_candidate.*
  on conflict (user_id, entity_id) do update
     set entity_kind = excluded.entity_kind,
         display_status = excluded.display_status,
         current_effective_due_on = excluded.current_effective_due_on,
         next_due_on = excluded.next_due_on,
         active_occurrence_id = excluded.active_occurrence_id,
         active_occurrence_status = excluded.active_occurrence_status,
         handled_current_logical_day = excluded.handled_current_logical_day,
         last_handled_logical_date = excluded.last_handled_logical_date,
         last_handled_at = excluded.last_handled_at,
         last_done_logical_date = excluded.last_done_logical_date,
         last_done_at = excluded.last_done_at,
         current_positive_streak = excluded.current_positive_streak,
         current_missed_streak = excluded.current_missed_streak,
         canonical_task_revision = excluded.canonical_task_revision,
         history_sync_epoch = excluded.history_sync_epoch,
         history_source_revision = excluded.history_source_revision,
         history_source_fingerprint = excluded.history_source_fingerprint,
         schedule_boundary_revision = excluded.schedule_boundary_revision,
         behavior_policy_revision = excluded.behavior_policy_revision,
         logical_day_settings_revision = excluded.logical_day_settings_revision,
         projected_logical_date = excluded.projected_logical_date,
         projection_schema_version = excluded.projection_schema_version,
         projection_algorithm_version = excluded.projection_algorithm_version,
         source_fingerprint = excluded.source_fingerprint,
         validity = 'valid',
         updated_at = excluded.updated_at
   where projection.updated_at <= excluded.updated_at
  returning to_jsonb(projection.*) into v_written;

  if not found then
    raise exception 'Current Task projection candidate is older than the stored projection.'
      using errcode = '40001';
  end if;
  return v_written;
end;
$function$;

revoke all on function public.adhdice_upsert_task_current_projection(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.adhdice_upsert_task_current_projection(uuid, jsonb)
  to service_role;

-- Forward patch for an already-installed command RPC. The base source above
-- carries the same invalidation block; this patch changes only the installed
-- function definition when a later deployment is explicitly authorized.
do $migration$
declare
  v_definition text;
  v_marker text := '7.15.14: invalidate the existing entity projection';
  v_old text := $$  update public.adhdice_clean_tasks
     set canonicalization_status = case$$;
  v_new text := $$  -- 7.15.14: invalidate the existing entity projection in
  -- this canonical transaction before the Task facts commit. A semantic
  -- no-op rollover has no projection-input mutation and is left untouched.
  if v_command_type <> 'reconcile_rollover'
     or v_history <> '{}'::jsonb
     or v_automatic_history_facts <> '[]'::jsonb
     or v_automatic_history_delete_ids <> '[]'::jsonb
     or v_occurrence <> '{}'::jsonb
     or v_schedule <> '{}'::jsonb
     or v_effective_override <> '{}'::jsonb
     or v_calendar_override <> '{}'::jsonb
     or exists (
       select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
        where patch_key.key <> 'canonicalization_status'
     ) then
    update public.adhdice_task_current_projections
       set validity = 'repair_required', updated_at = now()
     where user_id = p_user_id and entity_id = v_entity_id;
  end if;

  update public.adhdice_clean_tasks
     set canonicalization_status = case$$;
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
  if position(v_marker in v_definition) > 0 then
    null;
  elsif position(v_old in v_definition) = 0 then
    raise exception 'Canonical Task projection invalidation anchor was not found.';
  else
    execute replace(v_definition, v_old, v_new);
  end if;
end;
$migration$;

revoke all on function public.adhdice_execute_task_state_command(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.adhdice_execute_task_state_command(uuid, jsonb)
  to service_role;

commit;

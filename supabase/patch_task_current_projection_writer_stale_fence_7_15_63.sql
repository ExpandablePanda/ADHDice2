-- ADHDice 7.15.63 Current Task Projection writer stale-fence SQLSTATE repair.
--
-- Source-only migration. This is the current writer definition after
-- patch_task_current_projection_v3_7_15_33.sql. It changes only the
-- application-level stale/race exception code from PostgreSQL's
-- serialization_failure code to P0001, while retaining every validation,
-- source-fence check, version safeguard, permission, and write branch.

begin;

do $guard$
begin
  if to_regclass('public.adhdice_task_current_projections') is null then
    raise exception 'Current Task projection writer repair requires the projection table.';
  end if;
  if to_regprocedure('public.adhdice_get_task_current_projection_source_fences(uuid, uuid, date)') is null then
    raise exception 'Current Task projection writer repair requires the source-fence function.';
  end if;
end;
$guard$;

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
  v_source_fences record;
  v_written jsonb;
begin
  if current_user <> 'service_role' then
    raise exception 'Current Task projection writer is backend-only.' using errcode = '42501';
  end if;
  if p_user_id is null or p_projection is null or jsonb_typeof(p_projection) <> 'object' then
    raise exception 'Current Task projection candidate must be a JSON object.' using errcode = '22023';
  end if;
  if p_projection->>'validity' is distinct from 'valid' then
    raise exception 'Current Task projection writer accepts only valid candidates.' using errcode = '22023';
  end if;
  begin
    v_candidate := jsonb_populate_record(null::public.adhdice_task_current_projections, p_projection);
  exception when others then
    raise exception 'Current Task projection candidate is malformed.' using errcode = '22023';
  end;
  if v_candidate.user_id is distinct from p_user_id
     or v_candidate.entity_id is null
     or v_candidate.entity_kind is null then
    raise exception 'Current Task projection owner or identity does not match the writer request.' using errcode = '42501';
  end if;
  if not (
    (v_candidate.projection_schema_version = 'task-current-projection-schema-v1'
      and v_candidate.projection_algorithm_version = 'task-current-projection-algorithm-v1')
    or (v_candidate.projection_schema_version = 'task-current-projection-schema-v2'
      and v_candidate.projection_algorithm_version in ('task-current-projection-algorithm-v2', 'task-current-projection-algorithm-v3'))
  ) then
    raise exception 'Current Task projection version pair is unsupported.' using errcode = '22023';
  end if;
  if v_candidate.projection_schema_version = 'task-current-projection-schema-v1'
     and (v_candidate.last_handled_at_kind is not null or v_candidate.last_done_at_kind is not null) then
    raise exception 'Current Task projection V1 candidates cannot contain timestamp kinds.' using errcode = '22023';
  end if;
  if v_candidate.projection_schema_version = 'task-current-projection-schema-v2'
     and not (
       (
         v_candidate.last_handled_logical_date is null
         and v_candidate.last_handled_at is null
         and v_candidate.last_handled_at_kind is null
       ) or (
         v_candidate.last_handled_logical_date is not null
         and v_candidate.last_handled_at is not null
         and v_candidate.last_handled_at_kind = 'event_instant'
       ) or (
         v_candidate.last_handled_logical_date is not null
         and v_candidate.last_handled_at is null
         and v_candidate.last_handled_at_kind = 'logical_day_presentation'
       )
     )
     or not (
       (
         v_candidate.last_done_logical_date is null
         and v_candidate.last_done_at is null
         and v_candidate.last_done_at_kind is null
       ) or (
         v_candidate.last_done_logical_date is not null
         and v_candidate.last_done_at is not null
         and v_candidate.last_done_at_kind = 'event_instant'
       ) or (
         v_candidate.last_done_logical_date is not null
         and v_candidate.last_done_at is null
         and v_candidate.last_done_at_kind = 'logical_day_presentation'
       )
     ) then
    raise exception 'Current Task projection V2 timestamp-kind consistency is invalid.' using errcode = '22023';
  end if;
  select * into v_task
    from public.adhdice_clean_tasks task
   where task.user_id = p_user_id
     and task.id = v_candidate.entity_id
     and task.permanently_deleted_at is null;
  if not found then
    raise exception 'Current Task projection Task is missing or not owned by the writer request.' using errcode = '42501';
  end if;
  if v_candidate.entity_kind is distinct from v_task.entity_kind then
    raise exception 'Current Task projection entity kind does not match the canonical Task.' using errcode = '42501';
  end if;
  if v_candidate.canonical_task_revision is distinct from v_task.canonical_revision then
    raise exception 'Current Task projection canonical Task revision is stale.' using errcode = 'P0001';
  end if;
  select state.sync_epoch into v_sync_epoch
    from public.adhdice_task_history_sync_state state
   where state.user_id = p_user_id;
  if not found or v_candidate.history_sync_epoch is distinct from v_sync_epoch then
    raise exception 'Current Task projection History sync epoch is stale.' using errcode = 'P0001';
  end if;
  select coalesce(max(changes.sequence), 0) into v_latest_history_revision
    from public.adhdice_task_history_changes changes
   where changes.user_id = p_user_id
     and changes.entity_id = v_candidate.entity_id;
  if v_candidate.history_source_revision is distinct from v_latest_history_revision then
    raise exception 'Current Task projection entity History frontier is stale.' using errcode = 'P0001';
  end if;
  select profile.timezone, profile.day_start_time::text, profile.settings_revision
    into v_profile_timezone, v_profile_day_start_time, v_profile_settings_revision
    from public.adhdice_user_profiles profile
   where profile.user_id = p_user_id;
  if not found or v_profile_timezone is null or v_profile_day_start_time is null
     or v_profile_settings_revision is null or v_profile_settings_revision < 1 then
    raise exception 'Current Task projection logical-day authority is unavailable.' using errcode = '55000';
  end if;
  if v_candidate.logical_day_settings_revision is distinct from v_profile_settings_revision then
    raise exception 'Current Task projection logical-day settings revision is stale.' using errcode = 'P0001';
  end if;
  if v_candidate.projected_logical_date is distinct from public.adhdice_effective_logical_date(
    pg_catalog.clock_timestamp(), v_profile_timezone, v_profile_day_start_time
  ) then
    raise exception 'Current Task projection logical date is stale.' using errcode = 'P0001';
  end if;
  if v_candidate.history_source_fingerprint is null
     or v_candidate.history_source_fingerprint !~ '^sha256:[0-9a-f]{64}$'
     or v_candidate.schedule_boundary_revision is null
     or v_candidate.schedule_boundary_revision !~ '^sha256:[0-9a-f]{64}$'
     or v_candidate.behavior_policy_revision is null
     or v_candidate.behavior_policy_revision !~ '^sha256:[0-9a-f]{64}$'
     or v_candidate.source_fingerprint is null
     or v_candidate.source_fingerprint !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'Current Task projection fingerprint contract is malformed.' using errcode = '22023';
  end if;
  select fences.schedule_boundary_revision, fences.behavior_policy_revision
    into v_source_fences
    from public.adhdice_get_task_current_projection_source_fences(
      p_user_id, v_candidate.entity_id, v_candidate.projected_logical_date
    ) fences;
  if not found
     or v_candidate.schedule_boundary_revision is distinct from v_source_fences.schedule_boundary_revision
     or v_candidate.behavior_policy_revision is distinct from v_source_fences.behavior_policy_revision then
    raise exception 'Current Task projection schedule or behavior source fence is stale.' using errcode = 'P0001';
  end if;
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
         last_handled_at_kind = excluded.last_handled_at_kind,
         last_done_logical_date = excluded.last_done_logical_date,
         last_done_at = excluded.last_done_at,
         last_done_at_kind = excluded.last_done_at_kind,
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
     and not (
       (projection.projection_schema_version = 'task-current-projection-schema-v2'
        and projection.projection_algorithm_version in ('task-current-projection-algorithm-v2', 'task-current-projection-algorithm-v3')
        and excluded.projection_schema_version = 'task-current-projection-schema-v1'
        and excluded.projection_algorithm_version = 'task-current-projection-algorithm-v1')
       or (projection.projection_schema_version = 'task-current-projection-schema-v2'
        and projection.projection_algorithm_version = 'task-current-projection-algorithm-v3'
        and excluded.projection_schema_version = 'task-current-projection-schema-v2'
        and excluded.projection_algorithm_version = 'task-current-projection-algorithm-v2')
     )
  returning pg_catalog.to_jsonb(projection.*) into v_written;
  if not found then
    raise exception 'Current Task projection candidate is older than the stored projection or would downgrade the current algorithm.' using errcode = 'P0001';
  end if;
  return v_written;
end;
$function$;

revoke all on function public.adhdice_upsert_task_current_projection(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.adhdice_upsert_task_current_projection(uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;

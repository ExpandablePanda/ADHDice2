-- ADHDice 7.15.30 Current Task Projection V2 contract and controlled rebuild.
--
-- Additive migration. Existing V1 rows remain untouched and readable. This
-- file does not rebuild projections or change canonical Task/History facts.

begin;

do $guard$
begin
  if to_regclass('public.adhdice_task_current_projections') is null then
    raise exception 'Current Task projection V2 requires the existing projection table.';
  end if;
end;
$guard$;

alter table public.adhdice_task_current_projections
  add column if not exists last_handled_at_kind text,
  add column if not exists last_done_at_kind text;

-- The original inline CHECK names are truncated by PostgreSQL. Remove only
-- those two version checks; all other writer/invalidation constraints remain.
alter table public.adhdice_task_current_projections
  drop constraint if exists adhdice_task_current_projection_projection_schema_version_check,
  drop constraint if exists adhdice_task_current_project_projection_algorithm_version_check,
  drop constraint if exists adhdice_task_current_projection_schema_version_allowed,
  drop constraint if exists adhdice_task_current_projection_algorithm_version_allowed,
  drop constraint if exists adhdice_task_current_projection_version_pair_check,
  drop constraint if exists adhdice_task_current_projection_timestamp_kind_allowed,
  drop constraint if exists adhdice_task_current_projection_timestamp_consistency_check;

alter table public.adhdice_task_current_projections
  add constraint adhdice_task_current_projection_schema_version_allowed
    check (projection_schema_version in ('task-current-projection-schema-v1', 'task-current-projection-schema-v2')),
  add constraint adhdice_task_current_projection_algorithm_version_allowed
    check (projection_algorithm_version in ('task-current-projection-algorithm-v1', 'task-current-projection-algorithm-v2')),
  add constraint adhdice_task_current_projection_version_pair_check
    check (
      (projection_schema_version = 'task-current-projection-schema-v1'
        and projection_algorithm_version = 'task-current-projection-algorithm-v1')
      or (projection_schema_version = 'task-current-projection-schema-v2'
        and projection_algorithm_version = 'task-current-projection-algorithm-v2')
    ),
  add constraint adhdice_task_current_projection_timestamp_kind_allowed
    check (
      (last_handled_at_kind is null or last_handled_at_kind in ('event_instant', 'logical_day_presentation'))
      and (last_done_at_kind is null or last_done_at_kind in ('event_instant', 'logical_day_presentation'))
    ),
  add constraint adhdice_task_current_projection_timestamp_consistency_check
    check (
      (
        projection_schema_version = 'task-current-projection-schema-v1'
        and projection_algorithm_version = 'task-current-projection-algorithm-v1'
        and last_handled_at_kind is null
        and last_done_at_kind is null
      )
      or (
        projection_schema_version = 'task-current-projection-schema-v2'
        and projection_algorithm_version = 'task-current-projection-algorithm-v2'
        and (
          (last_handled_logical_date is null and last_handled_at is null and last_handled_at_kind is null)
          or (last_handled_logical_date is not null and last_handled_at is not null and last_handled_at_kind = 'event_instant')
          or (last_handled_logical_date is not null and last_handled_at is null and last_handled_at_kind = 'logical_day_presentation')
        )
        and (
          (last_done_logical_date is null and last_done_at is null and last_done_at_kind is null)
          or (last_done_logical_date is not null and last_done_at is not null and last_done_at_kind = 'event_instant')
          or (last_done_logical_date is not null and last_done_at is null and last_done_at_kind = 'logical_day_presentation')
        )
      )
    );

-- The trusted writer accepts the exact V1 pair during the deployment
-- transition and the exact V2 pair after the calculator is deployed. V1
-- candidates can never replace a stored V2 row for the same entity.
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

  if not (
    (v_candidate.projection_schema_version = 'task-current-projection-schema-v1'
      and v_candidate.projection_algorithm_version = 'task-current-projection-algorithm-v1')
    or (v_candidate.projection_schema_version = 'task-current-projection-schema-v2'
      and v_candidate.projection_algorithm_version = 'task-current-projection-algorithm-v2')
  ) then
    raise exception 'Current Task projection version pair is unsupported.'
      using errcode = '22023';
  end if;

  if v_candidate.projection_schema_version = 'task-current-projection-schema-v1'
     and (v_candidate.last_handled_at_kind is not null or v_candidate.last_done_at_kind is not null) then
    raise exception 'Current Task projection V1 candidates cannot contain timestamp kinds.'
      using errcode = '22023';
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
    raise exception 'Current Task projection V2 timestamp-kind consistency is invalid.'
      using errcode = '22023';
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

  select fences.schedule_boundary_revision, fences.behavior_policy_revision
    into v_source_fences
    from public.adhdice_get_task_current_projection_source_fences(
      p_user_id,
      v_candidate.entity_id,
      v_candidate.projected_logical_date
    ) fences;
  if not found
     or v_candidate.schedule_boundary_revision is distinct from v_source_fences.schedule_boundary_revision
     or v_candidate.behavior_policy_revision is distinct from v_source_fences.behavior_policy_revision then
    raise exception 'Current Task projection schedule or behavior source fence is stale.'
      using errcode = '40001';
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
       projection.projection_schema_version = 'task-current-projection-schema-v2'
       and projection.projection_algorithm_version = 'task-current-projection-algorithm-v2'
       and excluded.projection_schema_version = 'task-current-projection-schema-v1'
       and excluded.projection_algorithm_version = 'task-current-projection-algorithm-v1'
     )
  returning pg_catalog.to_jsonb(projection.*) into v_written;

  if not found then
    raise exception 'Current Task projection candidate is older than the stored projection or would downgrade V2.'
      using errcode = '40001';
  end if;
  return v_written;
end;
$function$;

revoke all on function public.adhdice_upsert_task_current_projection(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.adhdice_upsert_task_current_projection(uuid, jsonb)
  to service_role;

-- Explicit V2 rebuild semantics. The original missing-only functions remain
-- available for historical regression coverage but are no longer used by the
-- V2 operator.
create or replace function public.adhdice_list_task_current_projection_rebuild_candidates(
  p_user_id uuid,
  p_limit integer,
  p_after_task_id uuid default null
)
returns table (id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if current_user <> 'service_role' then
    raise exception 'Current Task projection V2 candidates are backend-only.'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'A user is required.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'Current Task projection V2 candidate limit must be between 1 and 10.'
      using errcode = '22023';
  end if;

  return query
  select task.id
    from public.adhdice_clean_tasks task
   where task.user_id = p_user_id
     and task.permanently_deleted_at is null
     and task.canonicalization_status = 'canonical_runtime'
     and task.entity_kind in ('parent', 'step', 'substep')
     and (p_after_task_id is null or task.id > p_after_task_id)
     and (
       not exists (
         select 1
           from public.adhdice_task_current_projections projection
          where projection.user_id = task.user_id
            and projection.entity_id = task.id
       )
       or exists (
         select 1
           from public.adhdice_task_current_projections projection
          where projection.user_id = task.user_id
            and projection.entity_id = task.id
            and (
              projection.validity <> 'valid'
              or projection.projection_schema_version <> 'task-current-projection-schema-v2'
              or projection.projection_algorithm_version <> 'task-current-projection-algorithm-v2'
            )
       )
     )
   order by task.id asc
   limit p_limit;
end;
$function$;

revoke all on function public.adhdice_list_task_current_projection_rebuild_candidates(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.adhdice_list_task_current_projection_rebuild_candidates(uuid, integer, uuid)
  to service_role;

create or replace function public.adhdice_count_task_current_projection_rebuild_candidates(
  p_user_id uuid
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if current_user <> 'service_role' then
    raise exception 'Current Task projection V2 count is backend-only.'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'A user is required.' using errcode = '22023';
  end if;

  return (
    select count(*)
      from public.adhdice_clean_tasks task
     where task.user_id = p_user_id
       and task.permanently_deleted_at is null
       and task.canonicalization_status = 'canonical_runtime'
       and task.entity_kind in ('parent', 'step', 'substep')
       and (
         not exists (
           select 1
             from public.adhdice_task_current_projections projection
            where projection.user_id = task.user_id
              and projection.entity_id = task.id
         )
         or exists (
           select 1
             from public.adhdice_task_current_projections projection
            where projection.user_id = task.user_id
              and projection.entity_id = task.id
              and (
                projection.validity <> 'valid'
                or projection.projection_schema_version <> 'task-current-projection-schema-v2'
                or projection.projection_algorithm_version <> 'task-current-projection-algorithm-v2'
              )
         )
       )
  );
end;
$function$;

revoke all on function public.adhdice_count_task_current_projection_rebuild_candidates(uuid)
  from public, anon, authenticated;
grant execute on function public.adhdice_count_task_current_projection_rebuild_candidates(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;

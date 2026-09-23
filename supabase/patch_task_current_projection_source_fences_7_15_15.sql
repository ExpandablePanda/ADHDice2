-- ADHDice 7.15.15 Current Task projection source-fence authority.
--
-- Source-only contract. Apply only after the 7.15.12 projection table and
-- 7.15.14 persistence protocol exist, and only with explicit live-SQL
-- authorization. This patch does not calculate Task State, write canonical
-- facts, backfill projections, deploy Edge code, or cut over runtime reads.

begin;

create extension if not exists pgcrypto;

-- This helper hashes only canonical source identity/semantic rows. It is not a
-- Task State evaluator. The projected logical date is supplied by the trusted
-- rebuild path so future policy rows which cannot affect today's projection do
-- not invalidate the current row.
create or replace function public.adhdice_get_task_current_projection_source_fences(
  p_user_id uuid,
  p_entity_id uuid,
  p_projected_logical_date date
)
returns table(
  schedule_boundary_revision text,
  behavior_policy_revision text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_task public.adhdice_clean_tasks%rowtype;
  v_schedule_payload jsonb;
  v_behavior_payload jsonb;
begin
  if current_user <> 'service_role' then
    raise exception 'Current Task projection source fences are backend-only.'
      using errcode = '42501';
  end if;
  if p_user_id is null or p_entity_id is null or p_projected_logical_date is null then
    raise exception 'Current Task projection source-fence identity is required.'
      using errcode = '22023';
  end if;

  select task.* into v_task
    from public.adhdice_clean_tasks task
   where task.user_id = p_user_id
     and task.id = p_entity_id
     and task.permanently_deleted_at is null;
  if not found then
    raise exception 'Current Task projection source-fence Task is missing or not owned by the backend request.'
      using errcode = '42501';
  end if;

  v_schedule_payload := pg_catalog.jsonb_build_object(
    'version', 'task-current-projection-schedule-fence-v2',
    'user_id', p_user_id,
    'entity_id', p_entity_id,
    'boundaries', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(boundary) - array['created_at', 'updated_at']::text[]
        order by boundary.boundary_sequence, boundary.id
      )
        from public.adhdice_task_schedule_boundaries boundary
       where boundary.user_id = p_user_id
         and boundary.entity_id = p_entity_id
    ), '[]'::jsonb),
    'occurrences', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(occurrence) - array['created_at', 'updated_at']::text[]
        order by occurrence.scheduled_due_on, occurrence.id
      )
        from public.adhdice_task_occurrences occurrence
       where occurrence.user_id = p_user_id
         and occurrence.entity_id = p_entity_id
         and occurrence.resolution_state <> 'superseded'
    ), '[]'::jsonb),
    'occurrence_effective_overrides', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(override_row) - array['created_at', 'updated_at']::text[]
        order by override_row.action_logical_date, override_row.override_sequence, override_row.id
      )
        from public.adhdice_task_occurrence_effective_overrides override_row
       where override_row.user_id = p_user_id
         and override_row.entity_id = p_entity_id
    ), '[]'::jsonb),
    'active_calendar_overrides', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(calendar_row) - array['created_at', 'updated_at']::text[]
        order by calendar_row.logical_date, calendar_row.id
      )
        from public.adhdice_task_calendar_overrides calendar_row
       where calendar_row.user_id = p_user_id
         and calendar_row.entity_id = p_entity_id
         and calendar_row.is_active
    ), '[]'::jsonb)
  );

  with relevant_selections as (
    select selection.*
      from public.adhdice_task_behavior_selections selection
     where selection.user_id = p_user_id
       and selection.task_id = p_entity_id
       and (
         selection.effective_from_logical_date <= p_projected_logical_date
         or selection.effective_from_logical_date = (
           select min(first_selection.effective_from_logical_date)
             from public.adhdice_task_behavior_selections first_selection
            where first_selection.user_id = p_user_id
              and first_selection.task_id = p_entity_id
         )
       )
  ), relevant_rulesets as (
    select v_task.custom_ruleset_id as ruleset_id
     where v_task.custom_ruleset_id is not null
    union
    select selection.custom_ruleset_id
      from relevant_selections selection
     where selection.custom_ruleset_id is not null
  )
  select pg_catalog.jsonb_build_object(
    'version', 'task-current-projection-behavior-fence-v2',
    'user_id', p_user_id,
    'entity_id', p_entity_id,
    'projected_logical_date', p_projected_logical_date,
    'task_identity', pg_catalog.jsonb_build_object(
      'task_type', v_task.task_type,
      'custom_ruleset_id', v_task.custom_ruleset_id
    ),
    'selections', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(selection) - array['created_at', 'updated_at']::text[]
        order by selection.effective_from_logical_date, selection.id
      )
        from relevant_selections selection
    ), '[]'::jsonb),
    'task_type_behavior_profiles', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(profile) - array['created_at', 'updated_at']::text[]
        order by profile.task_type, profile.effective_from_logical_date
      )
        from public.adhdice_task_type_behavior_profiles profile
       where profile.user_id = p_user_id
         and profile.task_type = 'task'
         and (
           profile.effective_from_logical_date <= p_projected_logical_date
           or profile.effective_from_logical_date = (
             select min(first_profile.effective_from_logical_date)
               from public.adhdice_task_type_behavior_profiles first_profile
              where first_profile.user_id = p_user_id
                and first_profile.task_type = 'task'
           )
         )
         and (
           v_task.task_type = 'task'
           or exists (
             select 1
               from relevant_selections selection
              where selection.task_type = 'task'
           )
         )
    ), '[]'::jsonb),
    'named_custom_ruleset_identities', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', ruleset.id,
          'user_id', ruleset.user_id,
          'task_type', ruleset.task_type,
          'deleted_at', ruleset.deleted_at
        )
        order by ruleset.id
      )
        from public.adhdice_custom_behavior_rulesets ruleset
       where ruleset.user_id = p_user_id
         and ruleset.id in (select relevant_rulesets.ruleset_id from relevant_rulesets)
    ), '[]'::jsonb),
    'named_custom_ruleset_revisions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(revision) - array['created_at', 'updated_at']::text[]
        order by revision.ruleset_id, revision.effective_from_logical_date
      )
        from public.adhdice_custom_behavior_ruleset_revisions revision
       where revision.ruleset_id in (select relevant_rulesets.ruleset_id from relevant_rulesets)
         and (
           revision.effective_from_logical_date <= p_projected_logical_date
           or revision.effective_from_logical_date = (
             select min(first_revision.effective_from_logical_date)
               from public.adhdice_custom_behavior_ruleset_revisions first_revision
              where first_revision.ruleset_id = revision.ruleset_id
           )
         )
    ), '[]'::jsonb)
  ) into v_behavior_payload;

  return query
  select 'sha256:' || pg_catalog.encode(
           extensions.digest(v_schedule_payload::text, 'sha256'::text),
           'hex'
         ),
         'sha256:' || pg_catalog.encode(
           extensions.digest(v_behavior_payload::text, 'sha256'::text),
           'hex'
         );
end;
$function$;

revoke all on function public.adhdice_get_task_current_projection_source_fences(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.adhdice_get_task_current_projection_source_fences(uuid, uuid, date)
  to service_role;

-- Replace the 7.15.14 writer so the candidate carries the exact database
-- snapshot used by the trusted source-fence authority. The check is placed
-- immediately before the upsert; a schedule/behavior race is retryable.
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
  returning pg_catalog.to_jsonb(projection.*) into v_written;

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

notify pgrst, 'reload schema';

commit;

-- ADHDice 7.15.24 Current Task projection freshness/invalidation matrix.
--
-- Forward SQL patch. Apply only after the 7.15.12 projection table, the
-- 7.15.14 persistence contract, the 7.15.15 source-fence authority, and the
-- 7.15.6 History sync ledger exist. This patch only invalidates existing
-- projection rows; it does not create rows, calculate projections, write
-- canonical Task/History state, backfill, or cut over consumers.

begin;

do $$
begin
  if to_regclass('public.adhdice_task_current_projections') is null
     or to_regclass('public.adhdice_clean_tasks') is null
     or to_regclass('public.adhdice_task_history_facts') is null
     or to_regclass('public.adhdice_task_schedule_boundaries') is null
     or to_regclass('public.adhdice_task_occurrences') is null
     or to_regclass('public.adhdice_task_occurrence_effective_overrides') is null
     or to_regclass('public.adhdice_task_calendar_overrides') is null
     or to_regclass('public.adhdice_task_behavior_selections') is null
     or to_regclass('public.adhdice_task_type_behavior_profiles') is null
     or to_regclass('public.adhdice_custom_behavior_rulesets') is null
     or to_regclass('public.adhdice_custom_behavior_ruleset_revisions') is null
     or to_regclass('public.adhdice_task_history_sync_state') is null
     or to_regclass('public.adhdice_user_profiles') is null then
    raise exception '7.15.24 projection invalidation prerequisites are missing.';
  end if;

  if to_regprocedure('public.adhdice_upsert_task_current_projection(uuid,jsonb)') is null
     or to_regprocedure('public.adhdice_get_task_current_projection_source_fences(uuid,uuid,date)') is null
     or to_regprocedure('public.adhdice_task_effectively_excluded_from_tracking(uuid,uuid)') is null then
    raise exception '7.15.24 trusted projection source-fence prerequisites are missing.';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'adhdice_clean_tasks_invalidate_task_current_projection'
       and tgrelid = 'public.adhdice_clean_tasks'::regclass
       and not tgisinternal
  ) then
    raise exception '7.15.24 canonical-revision invalidation trigger is missing.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'adhdice_clean_tasks'
       and column_name in ('id', 'user_id', 'parent_task_id', 'exclude_from_tracking')
     having count(*) = 4
  ) then
    raise exception '7.15.24 clean Task identity/hierarchy columns are missing.';
  end if;

  if (
    select count(distinct table_name) from information_schema.columns
     where table_schema = 'public'
       and table_name in (
         'adhdice_task_history_facts',
         'adhdice_task_schedule_boundaries',
         'adhdice_task_occurrences',
         'adhdice_task_occurrence_effective_overrides',
         'adhdice_task_calendar_overrides'
       )
       and column_name in ('user_id', 'entity_id')
  ) <> 5 then
    raise exception '7.15.24 entity-scoped source identity columns are missing.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'adhdice_task_behavior_selections'
       and column_name in ('user_id', 'task_id')
     having count(*) = 2
  ) then
    raise exception '7.15.24 behavior-selection identity columns are missing.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'adhdice_task_history_sync_state'
       and column_name in ('user_id', 'sync_epoch', 'protocol_version')
     having count(*) = 3
  ) then
    raise exception '7.15.24 History sync authority columns are missing.';
  end if;
end;
$$;

-- The source fence remains the trusted semantic authority. Its behavior fence
-- now includes the complete bounded tracking ancestry so a direct exclusion or
-- hierarchy move cannot let an old child candidate pass the writer check.
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
  v_tracking_payload jsonb;
  v_tracking_malformed boolean;
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

  with recursive ancestry as (
    select task.id,
           task.user_id,
           task.parent_task_id,
           task.exclude_from_tracking,
           array[task.id]::uuid[] as path,
           false as cycle_detected,
           0 as depth
      from public.adhdice_clean_tasks task
     where task.user_id = p_user_id
       and task.id = p_entity_id
    union all
    select parent.id,
           parent.user_id,
           parent.parent_task_id,
           parent.exclude_from_tracking,
           ancestry.path || parent.id,
           parent.id = any(ancestry.path),
           ancestry.depth + 1
      from ancestry
      join public.adhdice_clean_tasks parent
        on parent.user_id = p_user_id
       and parent.id = ancestry.parent_task_id
     where ancestry.parent_task_id is not null
       and not ancestry.cycle_detected
       and ancestry.depth < 256
  )
  select
    coalesce(bool_or(
      ancestry.cycle_detected
      or (ancestry.parent_task_id is not null and not exists (
        select 1
          from public.adhdice_clean_tasks missing_parent
         where missing_parent.user_id = p_user_id
           and missing_parent.id = ancestry.parent_task_id
      ))
      or (ancestry.depth >= 256 and ancestry.parent_task_id is not null)
    ), false),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', ancestry.id,
        'parent_task_id', ancestry.parent_task_id,
        'exclude_from_tracking', ancestry.exclude_from_tracking
      ) order by ancestry.depth
    ), '[]'::jsonb)
    into v_tracking_malformed, v_tracking_payload
    from ancestry;

  if v_tracking_malformed then
    raise exception 'Current Task projection tracking hierarchy is malformed.'
      using errcode = '55000';
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
    'version', 'task-current-projection-behavior-fence-v3',
    'user_id', p_user_id,
    'entity_id', p_entity_id,
    'projected_logical_date', p_projected_logical_date,
    'tracking_ancestry', v_tracking_payload,
    'effective_tracking_exclusion', exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_tracking_payload) as ancestry_row(row_json)
       where (ancestry_row.row_json->>'exclude_from_tracking')::boolean is true
    ),
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

-- These helpers only mark rows that already exist. They never insert or
-- calculate projection values and are safe for trigger use under RLS.
create or replace function public.adhdice_invalidate_task_current_projection_entity(
  p_user_id uuid,
  p_entity_id uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $function$
  update public.adhdice_task_current_projections
     set validity = 'repair_required',
         updated_at = now()
   where user_id = p_user_id
     and entity_id = p_entity_id;
$function$;

create or replace function public.adhdice_invalidate_task_current_projection_owner(
  p_user_id uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $function$
  update public.adhdice_task_current_projections
     set validity = 'repair_required',
         updated_at = now()
   where user_id = p_user_id;
$function$;

-- A malformed owner hierarchy fails closed to owner-wide repair. The normal
-- path updates only the moved Task subtree, including descendants whose own
-- canonical_revision did not change.
create or replace function public.adhdice_invalidate_task_current_projection_subtree(
  p_user_id uuid,
  p_root_task_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_malformed boolean;
begin
  if p_user_id is null or p_root_task_id is null then
    return;
  end if;

  with recursive ancestry as (
    select task.id as start_id,
           task.id as current_id,
           task.parent_task_id,
           array[task.id]::uuid[] as path,
           false as cycle_detected,
           0 as depth
      from public.adhdice_clean_tasks task
     where task.user_id = p_user_id
    union all
    select ancestry.start_id,
           parent.id,
           parent.parent_task_id,
           ancestry.path || parent.id,
           parent.id = any(ancestry.path),
           ancestry.depth + 1
      from ancestry
      join public.adhdice_clean_tasks parent
        on parent.user_id = p_user_id
       and parent.id = ancestry.parent_task_id
     where ancestry.parent_task_id is not null
       and not ancestry.cycle_detected
       and ancestry.depth < 256
  )
  select
    not exists (
      select 1 from public.adhdice_clean_tasks root
       where root.user_id = p_user_id
         and root.id = p_root_task_id
    )
    or exists (
      select 1
        from public.adhdice_clean_tasks orphan
       where orphan.user_id = p_user_id
         and orphan.parent_task_id is not null
         and not exists (
           select 1
             from public.adhdice_clean_tasks parent
            where parent.user_id = p_user_id
              and parent.id = orphan.parent_task_id
         )
    )
    or coalesce(bool_or(
      ancestry.cycle_detected
      or (ancestry.depth >= 256 and ancestry.parent_task_id is not null)
    ), false)
    into v_malformed
    from ancestry;

  if v_malformed then
    perform public.adhdice_invalidate_task_current_projection_owner(p_user_id);
    return;
  end if;

  with recursive subtree as (
    select task.id,
           array[task.id]::uuid[] as path,
           false as cycle_detected,
           0 as depth
      from public.adhdice_clean_tasks task
     where task.user_id = p_user_id
       and task.id = p_root_task_id
    union all
    select child.id,
           subtree.path || child.id,
           child.id = any(subtree.path),
           subtree.depth + 1
      from subtree
      join public.adhdice_clean_tasks child
        on child.user_id = p_user_id
       and child.parent_task_id = subtree.id
     where not subtree.cycle_detected
       and subtree.depth < 256
  )
  update public.adhdice_task_current_projections projection
     set validity = 'repair_required',
         updated_at = now()
   where projection.user_id = p_user_id
     and projection.entity_id in (select subtree.id from subtree);
end;
$function$;

revoke all on function public.adhdice_invalidate_task_current_projection_entity(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.adhdice_invalidate_task_current_projection_owner(uuid)
  from public, anon, authenticated;
revoke all on function public.adhdice_invalidate_task_current_projection_subtree(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.adhdice_invalidate_task_current_projection_entity(uuid, uuid)
  to service_role;
grant execute on function public.adhdice_invalidate_task_current_projection_owner(uuid)
  to service_role;
grant execute on function public.adhdice_invalidate_task_current_projection_subtree(uuid, uuid)
  to service_role;

create or replace function public.adhdice_invalidate_task_current_projection_entity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.adhdice_invalidate_task_current_projection_entity(old.user_id, old.entity_id);
    return old;
  end if;

  perform public.adhdice_invalidate_task_current_projection_entity(new.user_id, new.entity_id);
  if tg_op = 'UPDATE'
     and (old.user_id is distinct from new.user_id or old.entity_id is distinct from new.entity_id) then
    perform public.adhdice_invalidate_task_current_projection_entity(old.user_id, old.entity_id);
  end if;
  return new;
end;
$function$;

create or replace function public.adhdice_invalidate_task_current_projection_behavior_selection_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.adhdice_invalidate_task_current_projection_entity(old.user_id, old.task_id);
    return old;
  end if;

  perform public.adhdice_invalidate_task_current_projection_entity(new.user_id, new.task_id);
  if tg_op = 'UPDATE'
     and (old.user_id is distinct from new.user_id or old.task_id is distinct from new.task_id) then
    perform public.adhdice_invalidate_task_current_projection_entity(old.user_id, old.task_id);
  end if;
  return new;
end;
$function$;

create or replace function public.adhdice_invalidate_task_current_projection_owner_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.adhdice_invalidate_task_current_projection_owner(old.user_id);
    return old;
  end if;
  if tg_op = 'UPDATE' then
    perform public.adhdice_invalidate_task_current_projection_owner(old.user_id);
  end if;
  perform public.adhdice_invalidate_task_current_projection_owner(new.user_id);
  return new;
end;
$function$;

create or replace function public.adhdice_invalidate_task_current_projection_history_sync_state_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.adhdice_invalidate_task_current_projection_owner(old.user_id);
    return old;
  end if;
  if tg_op = 'UPDATE'
     and old.user_id is not distinct from new.user_id
     and old.sync_epoch is not distinct from new.sync_epoch
     and old.protocol_version is not distinct from new.protocol_version then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    perform public.adhdice_invalidate_task_current_projection_owner(old.user_id);
  end if;
  perform public.adhdice_invalidate_task_current_projection_owner(new.user_id);
  return new;
end;
$function$;

create or replace function public.adhdice_invalidate_task_current_projection_profile_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.adhdice_invalidate_task_current_projection_owner(old.user_id);
    return old;
  end if;
  if tg_op = 'UPDATE'
     and old.user_id is not distinct from new.user_id
     and old.timezone is not distinct from new.timezone
     and old.day_start_time is not distinct from new.day_start_time
     and old.settings_revision is not distinct from new.settings_revision then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    perform public.adhdice_invalidate_task_current_projection_owner(old.user_id);
  end if;
  perform public.adhdice_invalidate_task_current_projection_owner(new.user_id);
  return new;
end;
$function$;

create or replace function public.adhdice_invalidate_task_current_projection_ruleset_revision_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_old_user_id uuid;
  v_new_user_id uuid;
begin
  if tg_op <> 'INSERT' then
    select ruleset.user_id into v_old_user_id
      from public.adhdice_custom_behavior_rulesets ruleset
     where ruleset.id = old.ruleset_id;
    perform public.adhdice_invalidate_task_current_projection_owner(v_old_user_id);
  end if;
  if tg_op <> 'DELETE' then
    select ruleset.user_id into v_new_user_id
      from public.adhdice_custom_behavior_rulesets ruleset
     where ruleset.id = new.ruleset_id;
    perform public.adhdice_invalidate_task_current_projection_owner(v_new_user_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create or replace function public.adhdice_invalidate_task_current_projection_clean_task_behavior_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if old.task_type is not distinct from new.task_type
     and old.custom_ruleset_id is not distinct from new.custom_ruleset_id then
    return new;
  end if;
  perform public.adhdice_invalidate_task_current_projection_entity(new.user_id, new.id);
  if old.user_id is distinct from new.user_id or old.id is distinct from new.id then
    perform public.adhdice_invalidate_task_current_projection_entity(old.user_id, old.id);
  end if;
  return new;
end;
$function$;

create or replace function public.adhdice_invalidate_task_current_projection_clean_task_subtree_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if old.parent_task_id is not distinct from new.parent_task_id
     and old.exclude_from_tracking is not distinct from new.exclude_from_tracking then
    return new;
  end if;
  perform public.adhdice_invalidate_task_current_projection_subtree(new.user_id, new.id);
  if old.user_id is distinct from new.user_id or old.id is distinct from new.id then
    perform public.adhdice_invalidate_task_current_projection_subtree(old.user_id, old.id);
  end if;
  return new;
end;
$function$;

revoke all on function public.adhdice_invalidate_task_current_projection_entity_trigger()
  from public, anon, authenticated;
revoke all on function public.adhdice_invalidate_task_current_projection_behavior_selection_trigger()
  from public, anon, authenticated;
revoke all on function public.adhdice_invalidate_task_current_projection_owner_trigger()
  from public, anon, authenticated;
revoke all on function public.adhdice_invalidate_task_current_projection_history_sync_state_trigger()
  from public, anon, authenticated;
revoke all on function public.adhdice_invalidate_task_current_projection_profile_trigger()
  from public, anon, authenticated;
revoke all on function public.adhdice_invalidate_task_current_projection_ruleset_revision_trigger()
  from public, anon, authenticated;
revoke all on function public.adhdice_invalidate_task_current_projection_clean_task_behavior_trigger()
  from public, anon, authenticated;
revoke all on function public.adhdice_invalidate_task_current_projection_clean_task_subtree_trigger()
  from public, anon, authenticated;

drop trigger if exists adhdice_task_history_facts_invalidate_task_current_projection
  on public.adhdice_task_history_facts;
create trigger adhdice_task_history_facts_invalidate_task_current_projection
after insert or update or delete on public.adhdice_task_history_facts
for each row execute function public.adhdice_invalidate_task_current_projection_entity_trigger();

drop trigger if exists adhdice_task_schedule_boundaries_invalidate_task_current_projection
  on public.adhdice_task_schedule_boundaries;
create trigger adhdice_task_schedule_boundaries_invalidate_task_current_projection
after insert or update or delete on public.adhdice_task_schedule_boundaries
for each row execute function public.adhdice_invalidate_task_current_projection_entity_trigger();

drop trigger if exists adhdice_task_occurrences_invalidate_task_current_projection
  on public.adhdice_task_occurrences;
create trigger adhdice_task_occurrences_invalidate_task_current_projection
after insert or update or delete on public.adhdice_task_occurrences
for each row execute function public.adhdice_invalidate_task_current_projection_entity_trigger();

drop trigger if exists adhdice_task_occurrence_effective_overrides_invalidate_task_current_projection
  on public.adhdice_task_occurrence_effective_overrides;
create trigger adhdice_task_occurrence_effective_overrides_invalidate_task_current_projection
after insert or update or delete on public.adhdice_task_occurrence_effective_overrides
for each row execute function public.adhdice_invalidate_task_current_projection_entity_trigger();

drop trigger if exists adhdice_task_calendar_overrides_invalidate_task_current_projection
  on public.adhdice_task_calendar_overrides;
create trigger adhdice_task_calendar_overrides_invalidate_task_current_projection
after insert or update or delete on public.adhdice_task_calendar_overrides
for each row execute function public.adhdice_invalidate_task_current_projection_entity_trigger();

drop trigger if exists adhdice_task_behavior_selections_invalidate_task_current_projection
  on public.adhdice_task_behavior_selections;
create trigger adhdice_task_behavior_selections_invalidate_task_current_projection
after insert or update or delete on public.adhdice_task_behavior_selections
for each row execute function public.adhdice_invalidate_task_current_projection_behavior_selection_trigger();

drop trigger if exists adhdice_task_type_behavior_profiles_invalidate_task_current_projection_owner
  on public.adhdice_task_type_behavior_profiles;
create trigger adhdice_task_type_behavior_profiles_invalidate_task_current_projection_owner
after insert or update or delete on public.adhdice_task_type_behavior_profiles
for each row execute function public.adhdice_invalidate_task_current_projection_owner_trigger();

drop trigger if exists adhdice_custom_behavior_rulesets_invalidate_task_current_projection_owner
  on public.adhdice_custom_behavior_rulesets;
create trigger adhdice_custom_behavior_rulesets_invalidate_task_current_projection_owner
after insert or update or delete on public.adhdice_custom_behavior_rulesets
for each row execute function public.adhdice_invalidate_task_current_projection_owner_trigger();

drop trigger if exists adhdice_custom_behavior_ruleset_revisions_invalidate_task_current_projection_owner
  on public.adhdice_custom_behavior_ruleset_revisions;
create trigger adhdice_custom_behavior_ruleset_revisions_invalidate_task_current_projection_owner
after insert or update or delete on public.adhdice_custom_behavior_ruleset_revisions
for each row execute function public.adhdice_invalidate_task_current_projection_ruleset_revision_trigger();

drop trigger if exists adhdice_user_profiles_invalidate_task_current_projection_owner
  on public.adhdice_user_profiles;
create trigger adhdice_user_profiles_invalidate_task_current_projection_owner
after insert or update or delete on public.adhdice_user_profiles
for each row execute function public.adhdice_invalidate_task_current_projection_profile_trigger();

drop trigger if exists adhdice_task_history_sync_state_invalidate_task_current_projection_owner
  on public.adhdice_task_history_sync_state;
create trigger adhdice_task_history_sync_state_invalidate_task_current_projection_owner
after insert or update or delete on public.adhdice_task_history_sync_state
for each row execute function public.adhdice_invalidate_task_current_projection_history_sync_state_trigger();

drop trigger if exists adhdice_clean_tasks_invalidate_task_current_projection_behavior
  on public.adhdice_clean_tasks;
create trigger adhdice_clean_tasks_invalidate_task_current_projection_behavior
after update of task_type, custom_ruleset_id on public.adhdice_clean_tasks
for each row execute function public.adhdice_invalidate_task_current_projection_clean_task_behavior_trigger();

drop trigger if exists adhdice_clean_tasks_invalidate_task_current_projection_tracking_subtree
  on public.adhdice_clean_tasks;
create trigger adhdice_clean_tasks_invalidate_task_current_projection_tracking_subtree
after update of parent_task_id, exclude_from_tracking on public.adhdice_clean_tasks
for each row execute function public.adhdice_invalidate_task_current_projection_clean_task_subtree_trigger();

notify pgrst, 'reload schema';

commit;

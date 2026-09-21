-- ADHDice 7.13.87: atomically exclude multiple Tasks from tracking.
-- Authored source only. Do not apply or deploy from this change; manual Supabase
-- migration is required before bulk-exclusion browser QA.
begin;

create or replace function public.adhdice_exclude_tasks_from_tracking(
  p_task_ids uuid[]
)
returns setof public.adhdice_clean_tasks
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_task_ids uuid[];
  v_changed_task_ids uuid[] := '{}'::uuid[];
  v_task_id uuid;
  v_task public.adhdice_clean_tasks%rowtype;
  v_evaluation jsonb;
  v_evaluation_operation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_task_ids is null or coalesce(pg_catalog.cardinality(p_task_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'At least one Task ID is required.';
  end if;
  if pg_catalog.array_position(p_task_ids, null) is not null then
    raise exception using errcode = '22023', message = 'Task IDs cannot contain null values.';
  end if;

  -- Deduplicate before applying the hard request bound. Duplicate evidence rows
  -- therefore never cause a valid Task selection to exceed the limit.
  select pg_catalog.array_agg(input.task_id order by input.task_id)
  into v_task_ids
  from (
    select distinct task_id
    from pg_catalog.unnest(p_task_ids) as requested(task_id)
  ) input;

  if pg_catalog.cardinality(v_task_ids) > 200 then
    raise exception using errcode = '22023', message = 'A maximum of 200 Tasks may be excluded at once.';
  end if;

  -- Validate and lock every requested row before changing any direct flag. Any
  -- missing, foreign-user, or permanently tombstoned Task aborts the whole
  -- transaction rather than allowing a partial bulk mutation.
  for v_task_id in
    select input.task_id
    from pg_catalog.unnest(v_task_ids) as input(task_id)
    order by input.task_id
  loop
    select task.*
    into v_task
    from public.adhdice_clean_tasks task
    where task.id = v_task_id
      and task.user_id = v_user_id
      and task.permanently_deleted_at is null
    for update;

    if not found then
      raise exception using
        errcode = '42501',
        message = 'A requested Task is not owned by the authenticated user or has been permanently deleted.';
    end if;
  end loop;

  select coalesce(
    pg_catalog.array_agg(task.id order by task.id) filter (where task.exclude_from_tracking is distinct from true),
    '{}'::uuid[]
  )
  into v_changed_task_ids
  from public.adhdice_clean_tasks task
  where task.user_id = v_user_id
    and task.id = any(v_task_ids)
    and task.permanently_deleted_at is null;

  update public.adhdice_clean_tasks task
  set exclude_from_tracking = true,
      revision = task.revision + 1,
      updated_at = pg_catalog.now()
  where task.user_id = v_user_id
    and task.id = any(v_changed_task_ids)
    and task.exclude_from_tracking is distinct from true;

  -- Resolve the final hierarchy once. This blocks only still-pending
  -- entitlements affected by direct or inherited exclusion and never rewrites
  -- fulfilled rewards, claimed dice, XP, points, tokens, or History.
  update public.adhdice_task_reward_entitlements entitlement
  set state = 'blocked',
      updated_at = pg_catalog.now()
  where entitlement.user_id = v_user_id
    and entitlement.state = 'pending'
    and public.adhdice_task_effectively_excluded_from_tracking(v_user_id, entitlement.entity_id);

  if pg_catalog.cardinality(v_changed_task_ids) > 0
    and exists (
      select 1
      from public.adhdice_achievement_profiles profile
      where profile.user_id = v_user_id
    ) then
    -- Dequalify all affected Task-derived source evidence after the final
    -- hierarchy state is visible. Focus evidence never enters these branches.
    update public.adhdice_achievement_occurrences occurrence
    set is_currently_qualifying = false
    where occurrence.user_id = v_user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.entity_id is not null
      and public.adhdice_task_effectively_excluded_from_tracking(v_user_id, occurrence.entity_id);

    update public.adhdice_achievement_occurrences step_set
    set is_currently_qualifying = false
    where step_set.user_id = v_user_id
      and step_set.source_kind = 'step_set'
      and (
        (
          step_set.root_parent_id is not null
          and public.adhdice_task_effectively_excluded_from_tracking(v_user_id, step_set.root_parent_id)
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements_text(
            case
              when pg_catalog.jsonb_typeof(step_set.source_snapshot->'step_occurrence_ids') = 'array'
                then step_set.source_snapshot->'step_occurrence_ids'
              else '[]'::jsonb
            end
          ) as constituent(occurrence_id)
          join public.adhdice_achievement_occurrences source_occurrence
            on source_occurrence.user_id = v_user_id
           and source_occurrence.id = constituent.occurrence_id::uuid
          where source_occurrence.entity_id is not null
            and public.adhdice_task_effectively_excluded_from_tracking(
              v_user_id,
              source_occurrence.entity_id
            )
        )
      );

    -- The changed direct IDs and their final revisions make this one operation
    -- identity fresh for every successful bulk mutation without copying the
    -- canonical Achievement evaluator.
    select pg_catalog.md5(
      'task-tracking-exclusion:bulk-evaluation:' || v_user_id::text || ':' ||
      coalesce(
        (
          select pg_catalog.string_agg(task.id::text || ':' || task.revision::text, ',' order by task.id)
          from public.adhdice_clean_tasks task
          where task.user_id = v_user_id
            and task.id = any(v_changed_task_ids)
        ),
        ''
      )
    )::uuid
    into v_evaluation_operation_id;

    v_evaluation := public.adhdice_evaluate_achievements(
      v_user_id,
      v_evaluation_operation_id,
      'immediate'
    );
    if coalesce(v_evaluation->>'status', '') not in ('completed', 'inactive') then
      raise exception using
        errcode = 'P0001',
        message = 'Achievement evaluation failed while excluding Tasks from tracking.';
    end if;
  end if;

  -- Return authoritative rows, including unchanged requested rows, so the
  -- browser can reconcile its canonical Task snapshot without guessing
  -- revisions or refetching each Task separately. The deduplicated ID order
  -- is deterministic because v_task_ids was sorted above.
  return query
  select task.*
  from public.adhdice_clean_tasks task
  where task.user_id = v_user_id
    and task.id = any(v_task_ids)
    and task.permanently_deleted_at is null
  order by pg_catalog.array_position(v_task_ids, task.id);
end;
$function$;

revoke all on function public.adhdice_exclude_tasks_from_tracking(uuid[]) from public, anon;
grant execute on function public.adhdice_exclude_tasks_from_tracking(uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;

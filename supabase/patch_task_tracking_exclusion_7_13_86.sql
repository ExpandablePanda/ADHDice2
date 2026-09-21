-- ADHDice 7.13.86: finalize Task tracking exclusion Achievement identities and Records cache correction.
-- Authored source only. Do not apply or deploy from this change; manual Supabase
-- migration is required before browser QA.
begin;

alter table public.adhdice_clean_tasks
  add column if not exists exclude_from_tracking boolean not null default false;

create index if not exists adhdice_clean_tasks_tracking_parent_idx
  on public.adhdice_clean_tasks (user_id, parent_task_id)
  where permanently_deleted_at is null;

-- Internal authority for direct and inherited exclusion. The helper is only
-- reached by SECURITY DEFINER RPCs/triggers, not by browser callers.
create or replace function public.adhdice_task_effectively_excluded_from_tracking(
  p_user_id uuid,
  p_task_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with recursive ancestry as (
    select task.id,
           task.user_id,
           task.parent_task_id,
           task.exclude_from_tracking,
           array[task.id]::uuid[] as path
    from public.adhdice_clean_tasks task
    where task.id = p_task_id
      and task.user_id = p_user_id
    union all
    select parent.id,
           parent.user_id,
           parent.parent_task_id,
           parent.exclude_from_tracking,
           ancestry.path || parent.id
    from ancestry
    join public.adhdice_clean_tasks parent
      on parent.id = ancestry.parent_task_id
     and parent.user_id = ancestry.user_id
    where not parent.id = any(ancestry.path)
  )
  select exists (
    select 1 from ancestry where exclude_from_tracking is true
  );
$function$;

revoke all on function public.adhdice_task_effectively_excluded_from_tracking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.adhdice_task_effectively_excluded_from_tracking(uuid, uuid) to service_role;

-- This guard is the authoritative Achievement occurrence boundary. The
-- canonical History capture function may still request qualification, but an
-- excluded Task-derived row is forced non-qualifying before any evaluator can
-- observe it. Focus occurrences do not enter either exclusion branch.
create or replace function public.adhdice_guard_tracking_excluded_achievement_occurrence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.is_currently_qualifying is not true then
    return new;
  end if;

  if new.source_kind = 'task_history'
    and new.entity_id is not null
    and public.adhdice_task_effectively_excluded_from_tracking(new.user_id, new.entity_id) then
    new.is_currently_qualifying := false;
  elsif new.source_kind = 'step_set'
    and (
      (
        new.root_parent_id is not null
        and public.adhdice_task_effectively_excluded_from_tracking(new.user_id, new.root_parent_id)
      )
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(
          case
            when pg_catalog.jsonb_typeof(new.source_snapshot->'step_occurrence_ids') = 'array'
              then new.source_snapshot->'step_occurrence_ids'
            else '[]'::jsonb
          end
        ) as constituent(occurrence_id)
        join public.adhdice_achievement_occurrences source_occurrence
          on source_occurrence.user_id = new.user_id
         and source_occurrence.id = constituent.occurrence_id::uuid
        where source_occurrence.entity_id is not null
          and public.adhdice_task_effectively_excluded_from_tracking(
            new.user_id,
            source_occurrence.entity_id
          )
      )
    ) then
    new.is_currently_qualifying := false;
  end if;

  return new;
end;
$function$;

drop trigger if exists adhdice_guard_tracking_excluded_achievement_occurrence
  on public.adhdice_achievement_occurrences;
create trigger adhdice_guard_tracking_excluded_achievement_occurrence
  before insert or update
  on public.adhdice_achievement_occurrences
  for each row
  execute function public.adhdice_guard_tracking_excluded_achievement_occurrence();

-- 7.13.84's AFTER-History cleanup strategy is intentionally removed. Any
-- previously installed copy is safe to remove before installing the guard.
drop trigger if exists adhdice_deactivate_excluded_task_achievement_source
  on public.adhdice_task_history_facts;
drop function if exists public.adhdice_deactivate_excluded_task_achievement_source();

create or replace function public.adhdice_block_excluded_task_reward_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if public.adhdice_task_effectively_excluded_from_tracking(new.user_id, new.entity_id) then
    return null;
  end if;
  return new;
end;
$function$;

drop trigger if exists adhdice_block_excluded_task_reward_entitlement on public.adhdice_task_reward_entitlements;
create trigger adhdice_block_excluded_task_reward_entitlement
  before insert on public.adhdice_task_reward_entitlements
  for each row execute function public.adhdice_block_excluded_task_reward_entitlement();

create or replace function public.adhdice_guard_excluded_task_reward_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.state = 'fulfilled'
    and old.state is distinct from 'fulfilled'
    and public.adhdice_task_effectively_excluded_from_tracking(new.user_id, new.entity_id) then
    raise exception using
      errcode = '55000',
      message = 'The canonical reward entitlement is excluded from tracking and cannot be fulfilled.';
  end if;
  return new;
end;
$function$;

drop trigger if exists adhdice_guard_excluded_task_reward_fulfillment on public.adhdice_task_reward_entitlements;
create trigger adhdice_guard_excluded_task_reward_fulfillment
  before update of state on public.adhdice_task_reward_entitlements
  for each row execute function public.adhdice_guard_excluded_task_reward_fulfillment();

create or replace function public.adhdice_set_task_tracking_exclusion(
  p_task_id uuid,
  p_excluded boolean
)
returns public.adhdice_clean_tasks
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_excluded boolean := coalesce(p_excluded, false);
  v_task public.adhdice_clean_tasks%rowtype;
  v_cursor jsonb := '{}'::jsonb;
  v_next_cursor jsonb;
  v_recalculation jsonb;
  v_evaluation jsonb;
  v_recalculation_operation_id uuid;
  v_evaluation_operation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_task_id is null then
    raise exception using errcode = '22023', message = 'A Task ID is required.';
  end if;

  select task.* into v_task
  from public.adhdice_clean_tasks task
  where task.id = p_task_id
    and task.user_id = v_user_id
    and task.permanently_deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'The Task is not owned by the authenticated user or has been permanently deleted.';
  end if;

  update public.adhdice_clean_tasks task
  set exclude_from_tracking = v_excluded,
      revision = task.revision + 1,
      updated_at = pg_catalog.now()
  where task.id = p_task_id
    and task.user_id = v_user_id
  returning task.* into v_task;

  -- The direct field is the only business attribute changed here. Existing
  -- History, fulfilled entitlements, grants, dice, XP, points, and tokens are
  -- intentionally preserved. Pending entitlements remain blocked after later
  -- re-inclusion because exclusion never changes them back to pending.
  update public.adhdice_task_reward_entitlements entitlement
  set state = 'blocked', updated_at = pg_catalog.now()
  where entitlement.user_id = v_user_id
    and entitlement.state = 'pending'
    and public.adhdice_task_effectively_excluded_from_tracking(v_user_id, entitlement.entity_id);

  if exists (
    select 1 from public.adhdice_achievement_profiles profile where profile.user_id = v_user_id
  ) then
    if v_excluded then
      -- Correct all Task-derived source evidence before asking the canonical
      -- evaluator to rebuild current progress. Permanent awards are not
      -- deleted or revoked.
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

      v_evaluation_operation_id := pg_catalog.md5(
        'task-tracking-exclusion:evaluation:' || v_user_id::text || ':' || p_task_id::text || ':' || v_task.revision::text || ':true'
      )::uuid;
      v_evaluation := public.adhdice_evaluate_achievements(
        v_user_id,
        v_evaluation_operation_id,
        'immediate'
      );
      if coalesce(v_evaluation->>'status', '') not in ('completed', 'inactive') then
        raise exception using
          errcode = 'P0001',
          message = 'Achievement evaluation failed while excluding the Task.';
      end if;
    else
      -- Re-inclusion replays every canonical source through the existing
      -- cursor-based capture architecture. One operation identity is reused
      -- across all bounded batches; an incomplete or failed replay cannot be
      -- mistaken for a completed recalculation.
      v_recalculation_operation_id := pg_catalog.md5(
        'task-tracking-exclusion:recalculation:' || v_user_id::text || ':' || p_task_id::text || ':' || v_task.revision::text
      )::uuid;
      loop
        v_recalculation := public.adhdice_recalculate_achievements(
          v_recalculation_operation_id,
          v_cursor,
          2000
        );
        if v_recalculation->>'status' = 'failed' then
          raise exception using
            errcode = 'P0001',
            message = 'Achievement recalculation failed while re-including the Task.';
        end if;
        if v_recalculation->>'status' = 'completed' then
          exit;
        end if;
        if v_recalculation->>'status' <> 'running' then
          raise exception using
            errcode = 'P0001',
            message = 'Achievement recalculation returned an unexpected status while re-including the Task.';
        end if;
        v_next_cursor := coalesce(v_recalculation->'next_cursor', '{}'::jsonb);
        if v_next_cursor = v_cursor then
          raise exception using
            errcode = 'P0001',
            message = 'Achievement recalculation did not advance its cursor while re-including the Task.';
        end if;
        v_cursor := v_next_cursor;
      end loop;

      v_evaluation_operation_id := pg_catalog.md5(
        'task-tracking-exclusion:evaluation:' || v_user_id::text || ':' || p_task_id::text || ':' || v_task.revision::text || ':false'
      )::uuid;
      v_evaluation := public.adhdice_evaluate_achievements(
        v_user_id,
        v_evaluation_operation_id,
        'recalculation'
      );
      if coalesce(v_evaluation->>'status', '') not in ('completed', 'inactive') then
        raise exception using
          errcode = 'P0001',
          message = 'Achievement evaluation failed after re-including the Task.';
      end if;
    end if;
  end if;

  return v_task;
end;
$function$;

revoke all on function public.adhdice_set_task_tracking_exclusion(uuid, boolean) from public, anon;
grant execute on function public.adhdice_set_task_tracking_exclusion(uuid, boolean) to authenticated;
revoke all on function public.adhdice_guard_tracking_excluded_achievement_occurrence() from public, anon, authenticated;
revoke all on function public.adhdice_block_excluded_task_reward_entitlement() from public, anon, authenticated;
revoke all on function public.adhdice_guard_excluded_task_reward_fulfillment() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- ADHDice 7.13.84: direct Task tracking exclusion with inherited read semantics.
-- Authored source only. Do not apply or deploy from this change; manual Supabase
-- migration is required before browser QA.
begin;

alter table public.adhdice_clean_tasks
  add column if not exists exclude_from_tracking boolean not null default false;

create index if not exists adhdice_clean_tasks_tracking_parent_idx
  on public.adhdice_clean_tasks (user_id, parent_task_id)
  where permanently_deleted_at is null;

create or replace function public.adhdice_task_effectively_excluded_from_tracking(
  p_user_id uuid,
  p_task_id uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
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

revoke all on function public.adhdice_task_effectively_excluded_from_tracking(uuid, uuid) from public, anon;
grant execute on function public.adhdice_task_effectively_excluded_from_tracking(uuid, uuid) to authenticated, service_role;

create or replace function public.adhdice_block_excluded_task_reward_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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

create or replace function public.adhdice_deactivate_excluded_task_achievement_source()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if public.adhdice_task_effectively_excluded_from_tracking(new.user_id, new.entity_id) then
    update public.adhdice_achievement_occurrences occurrence
    set is_currently_qualifying = false
    where occurrence.user_id = new.user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.entity_id = new.entity_id;

    update public.adhdice_achievement_occurrences step_set
    set is_currently_qualifying = false
    where step_set.user_id = new.user_id
      and step_set.source_kind = 'step_set'
      and (
        public.adhdice_task_effectively_excluded_from_tracking(new.user_id, step_set.root_parent_id)
        or exists (
          select 1
          from jsonb_array_elements_text(step_set.source_snapshot->'step_occurrence_ids') constituent(occurrence_id)
          join public.adhdice_achievement_occurrences source_occurrence
            on source_occurrence.id = constituent.occurrence_id::uuid
          where public.adhdice_task_effectively_excluded_from_tracking(new.user_id, source_occurrence.entity_id)
        )
      );
  end if;
  return new;
end;
$function$;

drop trigger if exists adhdice_deactivate_excluded_task_achievement_source on public.adhdice_task_history_facts;
create trigger adhdice_deactivate_excluded_task_achievement_source
  after insert or update of entity_id, entity_kind, logical_date, outcome, event_kind,
    occurrence_id, scheduled_due_on, effective_due_on, schedule_boundary_id,
    provenance_kind, actor_kind, actor_id, source, source_legacy_history_id
  on public.adhdice_task_history_facts
  for each row execute function public.adhdice_deactivate_excluded_task_achievement_source();

create or replace function public.adhdice_set_task_tracking_exclusion(
  p_task_id uuid,
  p_excluded boolean
)
returns public.adhdice_clean_tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_task public.adhdice_clean_tasks%rowtype;
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
  set exclude_from_tracking = coalesce(p_excluded, false),
      revision = task.revision + 1,
      updated_at = now()
  where task.id = p_task_id
    and task.user_id = v_user_id
  returning task.* into v_task;

  -- The direct field is the only business attribute changed here. Existing
  -- History, fulfilled entitlements, grants, dice, XP, points, and tokens are
  -- intentionally preserved. Pending entitlements are obligations, not awards,
  -- so an exclusion blocks them without clawing anything back.
  update public.adhdice_task_reward_entitlements entitlement
  set state = 'blocked', updated_at = now()
  where entitlement.user_id = v_user_id
    and entitlement.state = 'pending'
    and public.adhdice_task_effectively_excluded_from_tracking(v_user_id, entitlement.entity_id);

  -- Rebuild current Achievement evidence/progress when the runtime is present.
  -- Permanent tier/collection awards are not deleted or revoked.
  if to_regclass('public.adhdice_achievement_profiles') is not null
    and exists (select 1 from public.adhdice_achievement_profiles where user_id = v_user_id) then
    perform public.adhdice_recalculate_achievements(gen_random_uuid(), '{}'::jsonb, 2000);
  end if;

  if coalesce(p_excluded, false) then
    update public.adhdice_achievement_occurrences occurrence
    set is_currently_qualifying = false
    where occurrence.user_id = v_user_id
      and occurrence.source_kind = 'task_history'
      and public.adhdice_task_effectively_excluded_from_tracking(v_user_id, occurrence.entity_id);

    update public.adhdice_achievement_occurrences step_set
    set is_currently_qualifying = false
    where step_set.user_id = v_user_id
      and step_set.source_kind = 'step_set'
      and (
        public.adhdice_task_effectively_excluded_from_tracking(v_user_id, step_set.root_parent_id)
        or exists (
          select 1
          from jsonb_array_elements_text(step_set.source_snapshot->'step_occurrence_ids') constituent(occurrence_id)
          join public.adhdice_achievement_occurrences source_occurrence
            on source_occurrence.id = constituent.occurrence_id::uuid
          where public.adhdice_task_effectively_excluded_from_tracking(v_user_id, source_occurrence.entity_id)
        )
      );
  end if;

  return v_task;
end;
$function$;

revoke all on function public.adhdice_set_task_tracking_exclusion(uuid, boolean) from public, anon;
grant execute on function public.adhdice_set_task_tracking_exclusion(uuid, boolean) to authenticated;
revoke all on function public.adhdice_block_excluded_task_reward_entitlement() from public, anon, authenticated;
revoke all on function public.adhdice_guard_excluded_task_reward_fulfillment() from public, anon, authenticated;
revoke all on function public.adhdice_deactivate_excluded_task_achievement_source() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;

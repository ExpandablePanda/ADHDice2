begin;

-- 7.9.42: Milestone Task State canonicalization.
--
-- This trusted backend wrapper deliberately does not plan or persist Task
-- State. It invokes the existing backend-only canonical executor in the same
-- transaction, then commits only Milestone metadata and presentation facts.
-- The Edge Function is the only caller; browser clients never call this RPC.

do $contract$
begin
  if to_regclass('public.adhdice_milestones') is null
    or to_regclass('public.adhdice_milestone_events') is null
    or to_regclass('public.adhdice_milestone_reminders') is null
    or to_regclass('public.adhdice_task_command_operations') is null
    or to_regprocedure('public.adhdice_execute_task_state_command(uuid,jsonb)') is null then
    raise exception 'Canonical Task State and Milestone foundations are required before 7.9.42';
  end if;
end
$contract$;

-- Canonical completion no longer requires a broad Task snapshot. Existing
-- historical completed rows remain valid because the other Milestone award
-- and completion fields continue to be enforced.
alter table public.adhdice_milestones
  drop constraint if exists adhdice_milestones_lifecycle_check;
alter table public.adhdice_milestones
  add constraint adhdice_milestones_lifecycle_check check (
    (
      status = 'active'
      and abandoned_at is null
      and completed_at is null
      and completion_timing is null
      and completion_date_key is null
      and (trophy_awarded_at is null or trophy_revoked_at is not null)
      and (aura_awarded_at is null or aura_revoked_at is not null)
    )
    or (
      status = 'completed'
      and abandoned_at is null
      and completed_at is not null
      and completion_timing is not null
      and completion_date_key is not null
      and trophy_awarded_at is not null
      and trophy_revoked_at is null
      and aura_kind is not null
      and aura_revoked_at is null
    )
    or (
      status = 'abandoned'
      and abandoned_at is not null
      and completed_at is null
      and completion_timing is null
      and completion_date_key is null
      and (trophy_awarded_at is null or trophy_revoked_at is not null)
      and (aura_awarded_at is null or aura_revoked_at is not null)
    )
  );

create or replace function public.adhdice_execute_milestone_task_state_command(
  p_user_id uuid,
  p_command jsonb,
  p_milestone_id uuid,
  p_expected_milestone_revision bigint,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_command_result jsonb;
  v_command_type text := nullif(p_command->>'command_type', '');
  v_entity_id uuid := nullif(p_command->>'entity_id', '')::uuid;
  v_task public.adhdice_clean_tasks%rowtype;
  v_milestone public.adhdice_milestones%rowtype;
  v_now timestamptz := clock_timestamp();
  v_completion_date date;
  v_timing text;
  v_aura text;
  v_event_type text;
  v_local_date date;
  v_schedule_version integer;
begin
  if current_user <> 'service_role' then
    raise exception 'Milestone Task State orchestration is backend-only.' using errcode = '42501';
  end if;
  if p_user_id is null or p_command is null or p_milestone_id is null or p_operation_id is null then
    raise exception 'Milestone Task State orchestration arguments are required.' using errcode = '22023';
  end if;
  if v_command_type not in ('complete_task', 'trash_task', 'restore_task') then
    raise exception 'Milestone orchestration supports only Complete, Trash, and Restore.' using errcode = '22023';
  end if;
  if v_entity_id is null then
    raise exception 'Canonical Task entity_id is required.' using errcode = '22023';
  end if;

  -- Lock and validate only the Milestone metadata before entering the
  -- canonical executor. The Task row remains owned by that executor.
  select * into v_milestone
    from public.adhdice_milestones
   where id = p_milestone_id and user_id = p_user_id
   for update;
  if not found then raise exception 'Milestone not found'; end if;
  if not exists (
    select 1 from public.adhdice_milestone_events
     where user_id = p_user_id
       and milestone_id = v_milestone.id
       and operation_id = p_operation_id
       and event_type in ('completed_on_time', 'completed_grace_period', 'completed_late', 'task_trashed', 'task_restored')
  ) and (p_expected_milestone_revision is null
     or v_milestone.revision <> p_expected_milestone_revision) then
    raise exception 'Milestone revision conflict';
  end if;
  if v_milestone.task_id is distinct from v_entity_id then
    raise exception 'Task is not attached to this Milestone';
  end if;

  select * into v_task
    from public.adhdice_clean_tasks
   where id = v_entity_id and user_id = p_user_id
   for update;
  if not found then raise exception 'Task not found'; end if;
  if v_task.entity_kind is distinct from 'parent'
     or v_task.parent_task_id is not null then
    raise exception 'Milestone Tasks must remain top-level canonical parent entities';
  end if;

  if v_command_type = 'complete_task' and v_milestone.status <> 'active' then
    raise exception 'Milestone must be active';
  end if;
  if v_command_type = 'trash_task' and v_milestone.task_trashed_at is not null then
    raise exception 'Task is already in Milestone Trash';
  end if;
  if v_command_type = 'restore_task'
     and (v_milestone.task_trashed_at is null or v_milestone.status = 'completed') then
    raise exception 'Task is not in Milestone Trash state';
  end if;

  -- This is the sole Task State transition. If metadata fails below, the
  -- surrounding transaction rolls back this canonical command as well.
  v_command_result := public.adhdice_execute_task_state_command(p_user_id, p_command);
  if coalesce(v_command_result->>'state', '') <> 'committed' then
    return v_command_result;
  end if;

  select * into v_task
    from public.adhdice_clean_tasks
   where id = v_entity_id and user_id = p_user_id;
  if not found then raise exception 'Canonical Task disappeared after transition'; end if;

  -- A replayed canonical command is complete only when its Milestone event is
  -- already present. This prevents an unpaired canonical transition.
  if exists (
    select 1 from public.adhdice_milestone_events
     where user_id = p_user_id
       and milestone_id = v_milestone.id
       and operation_id = p_operation_id
       and event_type in ('completed_on_time', 'completed_grace_period', 'completed_late', 'task_trashed', 'task_restored')
  ) then
    select * into v_milestone from public.adhdice_milestones where id = v_milestone.id;
    update public.adhdice_task_command_operations
       set result_references = result_references || jsonb_build_object(
         'task_row', to_jsonb(v_task),
         'milestone_row', to_jsonb(v_milestone),
         'created_transition', false
       )
     where user_id = p_user_id
       and command_id = (v_command_result->>'command_id')::uuid;
    return v_command_result || jsonb_build_object(
      'task_row', to_jsonb(v_task),
      'milestone_row', to_jsonb(v_milestone),
      'created_transition', false
    );
  end if;

  if v_command_type = 'complete_task' then
    if v_task.terminal_state is distinct from 'permanently_complete'
       or v_task.status is distinct from 'complete' then
      raise exception 'Canonical Complete did not produce a terminal Task';
    end if;
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_milestone.completion_timezone) then
      raise exception 'Milestone completion timezone is invalid';
    end if;
    v_completion_date := (v_now at time zone v_milestone.completion_timezone)::date;
    v_timing := case
      when v_completion_date <= v_milestone.current_target_date then 'on_time'
      when v_completion_date <= v_milestone.current_aura_deadline then 'grace_period'
      else 'late'
    end;
    v_aura := case
      when v_timing = 'late' then 'none'
      when v_milestone.current_tier = 'platinum' then 'diamond'
      else 'standard'
    end;
    v_event_type := case v_timing
      when 'on_time' then 'completed_on_time'
      when 'grace_period' then 'completed_grace_period'
      else 'completed_late'
    end;
    update public.adhdice_milestones set
      status = 'completed',
      completion_timing = v_timing,
      completion_date_key = v_completion_date,
      completed_at = v_now,
      -- Broad Task restoration is intentionally retired. The nullable field
      -- remains for historical schema compatibility only.
      pre_completion_task_snapshot = null,
      trophy_awarded_at = v_now,
      trophy_revoked_at = null,
      aura_kind = v_aura,
      aura_awarded_at = case when v_aura = 'none' then null else v_now end,
      aura_revoked_at = null,
      revision = revision + 1
    where id = v_milestone.id
    returning * into v_milestone;
    update public.adhdice_milestone_reminders
       set status = 'canceled', canceled_at = v_now
     where milestone_id = v_milestone.id and status = 'pending';
    insert into public.adhdice_milestone_events (
      operation_id, user_id, milestone_id, task_id, event_type, next_state, metadata
    ) values
      (p_operation_id, p_user_id, v_milestone.id, v_task.id, v_event_type,
       to_jsonb(v_milestone), jsonb_build_object('completion_date_key', v_completion_date)),
      (p_operation_id, p_user_id, v_milestone.id, v_task.id, 'award_granted',
       jsonb_build_object('tier', v_milestone.current_tier, 'aura_kind', v_aura),
       jsonb_build_object('bonus_xp', 0, 'bonus_dice_rolls', 0));
  elsif v_command_type = 'trash_task' then
    if v_task.container_state is distinct from 'trashed' or v_task.status is distinct from 'trashed' then
      raise exception 'Canonical Trash did not produce a trashed Task';
    end if;
    update public.adhdice_milestones set
      task_trashed_at = coalesce(v_task.container_trashed_at, v_now),
      revision = revision + 1
    where id = v_milestone.id
    returning * into v_milestone;
    update public.adhdice_milestone_reminders
       set status = 'canceled', canceled_at = v_now
     where milestone_id = v_milestone.id and status = 'pending';
    insert into public.adhdice_milestone_events (operation_id, user_id, milestone_id, task_id, event_type, next_state)
      values (p_operation_id, p_user_id, v_milestone.id, v_task.id, 'task_trashed', to_jsonb(v_milestone));
  else
    if v_task.container_state is distinct from 'active' or v_task.status is distinct from 'pending' then
      raise exception 'Canonical Restore did not produce an active Task';
    end if;
    update public.adhdice_milestones set
      task_trashed_at = null,
      last_restored_at = v_now,
      revision = revision + 1
    where id = v_milestone.id
    returning * into v_milestone;
    if v_milestone.status = 'active' then
      v_local_date := (v_now at time zone v_milestone.completion_timezone)::date;
      select coalesce(max(schedule_version), 0) + 1 into v_schedule_version
        from public.adhdice_milestone_reminders where milestone_id = v_milestone.id;
      insert into public.adhdice_milestone_reminders (user_id, milestone_id, kind, schedule_version, scheduled_date, status)
      select p_user_id, v_milestone.id, schedule.kind, v_schedule_version, schedule.scheduled_date, 'pending'
        from (values
          ('seven_days', v_milestone.current_target_date - 7),
          ('three_days', v_milestone.current_target_date - 3),
          ('target_day', v_milestone.current_target_date),
          ('final_aura_day', v_milestone.current_aura_deadline)
        ) schedule(kind, scheduled_date)
       where schedule.scheduled_date >= v_local_date;
    end if;
    insert into public.adhdice_milestone_events (operation_id, user_id, milestone_id, task_id, event_type, next_state)
      values (p_operation_id, p_user_id, v_milestone.id, v_task.id, 'task_restored', to_jsonb(v_milestone));
  end if;

  -- Preserve the complete orchestration result in the canonical operation's
  -- replay envelope. This is response metadata only; the canonical command
  -- remains the sole writer of Task State and canonical History.
  update public.adhdice_task_command_operations
     set result_references = result_references || jsonb_build_object(
       'task_row', to_jsonb(v_task),
       'milestone_row', to_jsonb(v_milestone),
       'created_transition', true
     )
   where user_id = p_user_id
     and command_id = (v_command_result->>'command_id')::uuid;

  return v_command_result || jsonb_build_object(
    'task_row', to_jsonb(v_task),
    'milestone_row', to_jsonb(v_milestone),
    'created_transition', true
  );
end;
$function$;

revoke all on function public.adhdice_execute_milestone_task_state_command(uuid, jsonb, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.adhdice_execute_milestone_task_state_command(uuid, jsonb, uuid, bigint, uuid) to service_role;

-- The old RPCs were alternate Task State authorities. Remove the routes after
-- the new backend-only wrapper is available. Dependencies are left explicit.
drop function if exists public.adhdice_complete_milestone(uuid, uuid, integer, bigint, uuid);
drop function if exists public.adhdice_trash_milestone_task(uuid, uuid, integer, bigint, uuid);
drop function if exists public.adhdice_restore_milestone_task(uuid, uuid, integer, bigint, uuid);
drop function if exists public.adhdice_delete_milestone_task_permanently(uuid, uuid, integer, bigint, uuid);

-- Canonical Task State has no reopen/reverse-terminal command yet. Keep the
-- name only as a safe, explicit blocker for old callers; it never restores a
-- Task snapshot or touches either History table.
create or replace function public.adhdice_reverse_milestone_completion(
  p_task_id uuid,
  p_milestone_id uuid,
  p_expected_task_revision integer,
  p_expected_milestone_revision bigint,
  p_operation_id uuid
)
returns table(task_row jsonb, milestone_row jsonb, created_transition boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  raise exception 'Canonical Task State does not support reopening a permanently Complete Task; no Milestone reverse transition was applied.' using errcode = '0A000';
end;
$function$;

revoke all on function public.adhdice_reverse_milestone_completion(uuid, uuid, integer, bigint, uuid) from public, anon, authenticated;
grant execute on function public.adhdice_reverse_milestone_completion(uuid, uuid, integer, bigint, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

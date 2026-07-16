begin;

-- Ticket 3: atomic Milestone completion, reversal, abandonment, and task lifecycle.
-- Rerunnable against the manually applied Ticket 1 foundation.

do $migration_contract$
begin
  if to_regclass('public.adhdice_milestones') is null
    or to_regclass('public.adhdice_milestone_events') is null
    or to_regclass('public.adhdice_milestone_reminders') is null then
    raise exception 'Milestones Ticket 1 foundation is required before Ticket 3';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'adhdice_task_history'
      and column_name = 'event_type'
  ) then
    raise exception 'Permanent-completion task history contract is required before Milestones Ticket 3';
  end if;
end
$migration_contract$;

create or replace function public.adhdice_complete_milestone(
  p_task_id uuid,
  p_milestone_id uuid,
  p_expected_task_revision integer,
  p_expected_milestone_revision bigint,
  p_operation_id uuid
)
returns table(task_row jsonb, milestone_row jsonb, created_transition boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_task public.adhdice_clean_tasks%rowtype;
  v_milestone public.adhdice_milestones%rowtype;
  v_prior_history jsonb;
  v_snapshot jsonb;
  v_now timestamptz := clock_timestamp();
  v_completion_date date;
  v_timing text;
  v_aura text;
  v_event_type text;
  v_counted boolean;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_task_id is null or p_milestone_id is null or p_operation_id is null then
    raise exception 'Task, Milestone, and operation IDs are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));

  select m.* into v_milestone
  from public.adhdice_milestone_events e
  join public.adhdice_milestones m on m.id = e.milestone_id
  where e.user_id = v_user_id and e.operation_id = p_operation_id
    and e.event_type in ('completed_on_time', 'completed_grace_period', 'completed_late')
  limit 1;
  if found then
    if v_milestone.id <> p_milestone_id
      or v_milestone.task_id is distinct from p_task_id then
      raise exception 'Operation ID was already used for a different Milestone completion';
    end if;
    select * into v_task from public.adhdice_clean_tasks
      where id = p_task_id and user_id = v_user_id;
    return query select to_jsonb(v_task), to_jsonb(v_milestone), false;
    return;
  end if;
  if exists (select 1 from public.adhdice_milestone_events where user_id = v_user_id and operation_id = p_operation_id) then
    raise exception 'Operation ID was already used for another Milestone mutation';
  end if;

  select * into v_task from public.adhdice_clean_tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  select * into v_milestone from public.adhdice_milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found'; end if;
  if v_task.user_id <> v_user_id or v_milestone.user_id <> v_user_id then raise exception 'Ownership mismatch'; end if;
  if p_expected_task_revision is null or v_task.revision <> p_expected_task_revision then raise exception 'Task revision conflict'; end if;
  if p_expected_milestone_revision is null or v_milestone.revision <> p_expected_milestone_revision then raise exception 'Milestone revision conflict'; end if;
  if v_milestone.status <> 'active' then raise exception 'Milestone must be active'; end if;
  if v_milestone.task_trashed_at is not null then raise exception 'A trashed Milestone task cannot be completed'; end if;
  if v_milestone.task_id is distinct from v_task.id then raise exception 'Task is not attached to this Milestone'; end if;
  if v_task.parent_task_id is not null or v_task.repeat_frequency::text not in ('none', 'daily_until_complete') then
    raise exception 'Task is no longer eligible for Milestone completion';
  end if;
  if v_task.status::text in ('complete', 'archived', 'trashed') then raise exception 'Task is already closed'; end if;
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
  v_counted := v_task.repeat_frequency::text = 'none'
    or (v_task.due_on is not null and v_task.due_on <= v_completion_date);

  select to_jsonb(h) into v_prior_history
  from public.adhdice_task_history h
  where h.user_id = v_user_id and h.task_id = v_task.id and h.entry_date = v_completion_date
  for update;
  v_snapshot := jsonb_build_object('task', to_jsonb(v_task), 'history', v_prior_history);

  update public.adhdice_clean_tasks set
    status = 'complete',
    completed_at = coalesce(v_task.completed_at, v_now),
    repeat_frequency = 'none', repeat_interval = 1,
    repeat_days_of_week = '{}', repeat_day_of_month = null,
    active_status_logical_date = null, active_occurrence_due_on = null,
    trashed_at = null
  where id = v_task.id
  returning * into v_task;

  insert into public.adhdice_task_history (
    task_id, user_id, entry_date, status, event_type,
    counted_as_due_occurrence, was_completed, occurrence_key, occurrence_due_on
  ) values (
    v_task.id, v_user_id, v_completion_date, 'complete', 'completed_permanently',
    v_counted, v_counted, null, null
  ) on conflict (user_id, task_id, entry_date) do update set
    status = excluded.status, event_type = excluded.event_type,
    counted_as_due_occurrence = excluded.counted_as_due_occurrence,
    was_completed = excluded.was_completed,
    occurrence_key = null, occurrence_due_on = null;

  update public.adhdice_milestones set
    status = 'completed', completion_timing = v_timing,
    completion_date_key = v_completion_date, completed_at = v_now,
    pre_completion_task_snapshot = v_snapshot,
    trophy_awarded_at = v_now, trophy_revoked_at = null,
    aura_kind = v_aura,
    aura_awarded_at = case when v_aura = 'none' then null else v_now end,
    aura_revoked_at = null,
    revision = revision + 1
  where id = v_milestone.id
  returning * into v_milestone;

  update public.adhdice_milestone_reminders set status = 'canceled', canceled_at = v_now
  where milestone_id = v_milestone.id and status = 'pending';

  insert into public.adhdice_milestone_events (
    operation_id, user_id, milestone_id, task_id, event_type, next_state, metadata
  ) values
    (p_operation_id, v_user_id, v_milestone.id, v_task.id, v_event_type,
      to_jsonb(v_milestone), jsonb_build_object('completion_date_key', v_completion_date)),
    (p_operation_id, v_user_id, v_milestone.id, v_task.id, 'award_granted',
      jsonb_build_object('tier', v_milestone.current_tier, 'aura_kind', v_aura),
      jsonb_build_object('bonus_xp', 0, 'bonus_dice_rolls', 0));

  return query select to_jsonb(v_task), to_jsonb(v_milestone), true;
end;
$function$;

create or replace function public.adhdice_reverse_milestone_completion(
  p_task_id uuid,
  p_milestone_id uuid,
  p_expected_task_revision integer,
  p_expected_milestone_revision bigint,
  p_operation_id uuid
)
returns table(task_row jsonb, milestone_row jsonb, created_transition boolean)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_task public.adhdice_clean_tasks%rowtype;
  v_restore public.adhdice_clean_tasks%rowtype;
  v_milestone public.adhdice_milestones%rowtype;
  v_snapshot jsonb;
  v_history jsonb;
  v_now timestamptz := clock_timestamp();
  v_local_date date;
  v_schedule_version integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_task_id is null or p_milestone_id is null or p_operation_id is null then raise exception 'Task, Milestone, and operation IDs are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));
  select m.* into v_milestone from public.adhdice_milestone_events e
    join public.adhdice_milestones m on m.id = e.milestone_id
    where e.user_id = v_user_id and e.operation_id = p_operation_id and e.event_type = 'completion_reversed' limit 1;
  if found then
    if v_milestone.id <> p_milestone_id or v_milestone.task_id is distinct from p_task_id then raise exception 'Operation ID was already used for a different reversal'; end if;
    select * into v_task from public.adhdice_clean_tasks where id = p_task_id and user_id = v_user_id;
    return query select to_jsonb(v_task), to_jsonb(v_milestone), false; return;
  end if;
  if exists (select 1 from public.adhdice_milestone_events where user_id = v_user_id and operation_id = p_operation_id) then raise exception 'Operation ID was already used for another Milestone mutation'; end if;

  select * into v_task from public.adhdice_clean_tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  select * into v_milestone from public.adhdice_milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found'; end if;
  if v_task.user_id <> v_user_id or v_milestone.user_id <> v_user_id then raise exception 'Ownership mismatch'; end if;
  if p_expected_task_revision is null or v_task.revision <> p_expected_task_revision then raise exception 'Task revision conflict'; end if;
  if p_expected_milestone_revision is null or v_milestone.revision <> p_expected_milestone_revision then raise exception 'Milestone revision conflict'; end if;
  if v_milestone.status <> 'completed' then raise exception 'Milestone must be completed'; end if;
  if v_milestone.task_id is distinct from v_task.id then raise exception 'Task is not attached to this Milestone'; end if;
  v_snapshot := v_milestone.pre_completion_task_snapshot;
  if v_snapshot is null or jsonb_typeof(v_snapshot->'task') is distinct from 'object' then raise exception 'Valid pre-completion task snapshot is required'; end if;
  select * into v_restore from jsonb_populate_record(null::public.adhdice_clean_tasks, v_snapshot->'task');
  if v_restore.id is distinct from v_task.id or v_restore.user_id is distinct from v_user_id then raise exception 'Pre-completion task snapshot identity mismatch'; end if;

  update public.adhdice_clean_tasks set
    parent_task_id = v_restore.parent_task_id, title = v_restore.title, notes = v_restore.notes,
    status = v_restore.status, priority = v_restore.priority, priority_level = v_restore.priority_level,
    energy = v_restore.energy, is_urgent = v_restore.is_urgent, is_important = v_restore.is_important,
    due_on = v_restore.due_on, active_status_logical_date = v_restore.active_status_logical_date,
    active_occurrence_due_on = v_restore.active_occurrence_due_on, scheduled_on = v_restore.scheduled_on,
    due_time = v_restore.due_time, estimated_minutes = v_restore.estimated_minutes,
    actual_seconds = v_restore.actual_seconds, tags = v_restore.tags,
    external_link_label = v_restore.external_link_label, external_link_url = v_restore.external_link_url,
    one_step_at_a_time = v_restore.one_step_at_a_time, subtasks_auto_reset = v_restore.subtasks_auto_reset,
    repeat_frequency = v_restore.repeat_frequency, repeat_interval = v_restore.repeat_interval,
    repeat_days_of_week = v_restore.repeat_days_of_week, repeat_day_of_month = v_restore.repeat_day_of_month,
    repeat_monthly_mode = v_restore.repeat_monthly_mode, repeat_monthly_ordinal = v_restore.repeat_monthly_ordinal,
    repeat_monthly_weekday = v_restore.repeat_monthly_weekday, pinned_at = v_restore.pinned_at,
    pin_order = v_restore.pin_order, sort_order = v_restore.sort_order,
    completed_at = v_restore.completed_at, trashed_at = v_restore.trashed_at
  where id = v_task.id returning * into v_task;

  v_history := v_snapshot->'history';
  if v_history is null or v_history = 'null'::jsonb then
    delete from public.adhdice_task_history
      where user_id = v_user_id and task_id = v_task.id
        and entry_date = v_milestone.completion_date_key and event_type = 'completed_permanently';
  else
    insert into public.adhdice_task_history (
      task_id, user_id, entry_date, occurrence_key, occurrence_due_on,
      status, event_type, counted_as_due_occurrence, was_completed
    ) values (
      v_task.id, v_user_id, (v_history->>'entry_date')::date,
      v_history->>'occurrence_key', (v_history->>'occurrence_due_on')::date,
      (v_history->>'status')::public.adhdice_clean_task_status,
      v_history->>'event_type', (v_history->>'counted_as_due_occurrence')::boolean,
      (v_history->>'was_completed')::boolean
    ) on conflict (user_id, task_id, entry_date) do update set
      occurrence_key = excluded.occurrence_key, occurrence_due_on = excluded.occurrence_due_on,
      status = excluded.status, event_type = excluded.event_type,
      counted_as_due_occurrence = excluded.counted_as_due_occurrence,
      was_completed = excluded.was_completed;
  end if;

  update public.adhdice_milestones set
    status = 'active', completion_timing = null, completion_date_key = null, completed_at = null,
    trophy_revoked_at = v_now,
    aura_revoked_at = case when aura_awarded_at is null then null else v_now end,
    reversed_at = v_now, revision = revision + 1
  where id = v_milestone.id returning * into v_milestone;

  update public.adhdice_milestone_reminders set status = 'canceled', canceled_at = v_now
    where milestone_id = v_milestone.id and status = 'pending';
  v_local_date := (v_now at time zone v_milestone.completion_timezone)::date;
  select coalesce(max(schedule_version), 0) + 1 into v_schedule_version
    from public.adhdice_milestone_reminders where milestone_id = v_milestone.id;
  insert into public.adhdice_milestone_reminders (user_id, milestone_id, kind, schedule_version, scheduled_date, status)
  select v_user_id, v_milestone.id, s.kind, v_schedule_version, s.scheduled_date, 'pending'
  from (values
    ('seven_days', v_milestone.current_target_date - 7),
    ('three_days', v_milestone.current_target_date - 3),
    ('target_day', v_milestone.current_target_date),
    ('final_aura_day', v_milestone.current_aura_deadline)
  ) s(kind, scheduled_date) where s.scheduled_date >= v_local_date;

  insert into public.adhdice_milestone_events (operation_id, user_id, milestone_id, task_id, event_type, next_state)
  values
    (p_operation_id, v_user_id, v_milestone.id, v_task.id, 'award_revoked', jsonb_build_object('trophy_revoked_at', v_now, 'aura_revoked_at', v_milestone.aura_revoked_at)),
    (p_operation_id, v_user_id, v_milestone.id, v_task.id, 'completion_reversed', to_jsonb(v_milestone));
  return query select to_jsonb(v_task), to_jsonb(v_milestone), true;
end;
$function$;

create or replace function public.adhdice_abandon_milestone(
  p_milestone_id uuid, p_expected_milestone_revision bigint,
  p_operation_id uuid, p_reason text default null
)
returns table(milestone_row jsonb, created_transition boolean)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid(); v_milestone public.adhdice_milestones%rowtype; v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_milestone_id is null or p_operation_id is null then raise exception 'Milestone and operation IDs are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));
  select m.* into v_milestone from public.adhdice_milestone_events e join public.adhdice_milestones m on m.id=e.milestone_id
    where e.user_id=v_user_id and e.operation_id=p_operation_id and e.event_type='abandoned'
      and e.metadata->>'mutation'='abandon' limit 1;
  if found then
    if v_milestone.id <> p_milestone_id then raise exception 'Operation ID was already used for a different abandonment'; end if;
    return query select to_jsonb(v_milestone), false; return;
  end if;
  if exists (select 1 from public.adhdice_milestone_events where user_id=v_user_id and operation_id=p_operation_id) then raise exception 'Operation ID was already used for another Milestone mutation'; end if;
  select * into v_milestone from public.adhdice_milestones where id=p_milestone_id for update;
  if not found then raise exception 'Milestone not found'; end if;
  if v_milestone.user_id <> v_user_id then raise exception 'Ownership mismatch'; end if;
  if p_expected_milestone_revision is null or v_milestone.revision <> p_expected_milestone_revision then raise exception 'Milestone revision conflict'; end if;
  if v_milestone.status <> 'active' then raise exception 'Only an active Milestone can be abandoned'; end if;
  update public.adhdice_milestones set status='abandoned', abandoned_at=v_now,
    abandonment_reason=nullif(trim(coalesce(p_reason,'')),''), revision=revision+1
    where id=v_milestone.id returning * into v_milestone;
  update public.adhdice_milestone_reminders set status='canceled', canceled_at=v_now where milestone_id=v_milestone.id and status='pending';
  insert into public.adhdice_milestone_events(operation_id,user_id,milestone_id,task_id,event_type,next_state,metadata)
    values(p_operation_id,v_user_id,v_milestone.id,v_milestone.task_id,'abandoned',to_jsonb(v_milestone),jsonb_build_object('mutation','abandon'));
  return query select to_jsonb(v_milestone), true;
end;
$function$;

create or replace function public.adhdice_trash_milestone_task(
  p_task_id uuid, p_milestone_id uuid, p_expected_task_revision integer,
  p_expected_milestone_revision bigint, p_operation_id uuid
)
returns table(task_row jsonb, milestone_row jsonb, created_transition boolean)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid:=auth.uid(); v_task public.adhdice_clean_tasks%rowtype; v_milestone public.adhdice_milestones%rowtype; v_now timestamptz:=clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_task_id is null or p_milestone_id is null or p_operation_id is null then raise exception 'Task, Milestone, and operation IDs are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text||':'||p_operation_id::text,0));
  select m.* into v_milestone from public.adhdice_milestone_events e join public.adhdice_milestones m on m.id=e.milestone_id
    where e.user_id=v_user_id and e.operation_id=p_operation_id and e.event_type='task_trashed' limit 1;
  if found then
    if v_milestone.id<>p_milestone_id or v_milestone.task_id is distinct from p_task_id then raise exception 'Operation ID was already used for a different task Trash'; end if;
    select * into v_task from public.adhdice_clean_tasks where id=p_task_id and user_id=v_user_id;
    return query select to_jsonb(v_task),to_jsonb(v_milestone),false; return;
  end if;
  if exists(select 1 from public.adhdice_milestone_events where user_id=v_user_id and operation_id=p_operation_id) then raise exception 'Operation ID was already used for another Milestone mutation'; end if;
  select * into v_task from public.adhdice_clean_tasks where id=p_task_id for update;
  select * into v_milestone from public.adhdice_milestones where id=p_milestone_id for update;
  if v_task.id is null or v_milestone.id is null then raise exception 'Task or Milestone not found'; end if;
  if v_task.user_id<>v_user_id or v_milestone.user_id<>v_user_id then raise exception 'Ownership mismatch'; end if;
  if p_expected_task_revision is null or v_task.revision<>p_expected_task_revision then raise exception 'Task revision conflict'; end if;
  if p_expected_milestone_revision is null or v_milestone.revision<>p_expected_milestone_revision then raise exception 'Milestone revision conflict'; end if;
  if v_milestone.task_id is distinct from v_task.id then raise exception 'Task is not attached to this Milestone'; end if;
  if v_task.status='trashed' then raise exception 'Task is already trashed'; end if;
  update public.adhdice_clean_tasks set status='trashed',completed_at=null,trashed_at=v_now where id=v_task.id returning * into v_task;
  update public.adhdice_milestones set task_trashed_at=v_now,revision=revision+1 where id=v_milestone.id returning * into v_milestone;
  update public.adhdice_milestone_reminders set status='canceled',canceled_at=v_now where milestone_id=v_milestone.id and status='pending';
  insert into public.adhdice_milestone_events(operation_id,user_id,milestone_id,task_id,event_type,next_state)
    values(p_operation_id,v_user_id,v_milestone.id,v_task.id,'task_trashed',to_jsonb(v_milestone));
  return query select to_jsonb(v_task),to_jsonb(v_milestone),true;
end;
$function$;

create or replace function public.adhdice_restore_milestone_task(
  p_task_id uuid, p_milestone_id uuid, p_expected_task_revision integer,
  p_expected_milestone_revision bigint, p_operation_id uuid
)
returns table(task_row jsonb, milestone_row jsonb, created_transition boolean)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid:=auth.uid(); v_task public.adhdice_clean_tasks%rowtype; v_milestone public.adhdice_milestones%rowtype;
  v_now timestamptz:=clock_timestamp(); v_local_date date; v_schedule_version integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_task_id is null or p_milestone_id is null or p_operation_id is null then raise exception 'Task, Milestone, and operation IDs are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text||':'||p_operation_id::text,0));
  select m.* into v_milestone from public.adhdice_milestone_events e join public.adhdice_milestones m on m.id=e.milestone_id
    where e.user_id=v_user_id and e.operation_id=p_operation_id and e.event_type='task_restored' limit 1;
  if found then
    if v_milestone.id<>p_milestone_id or v_milestone.task_id is distinct from p_task_id then raise exception 'Operation ID was already used for a different task restore'; end if;
    select * into v_task from public.adhdice_clean_tasks where id=p_task_id and user_id=v_user_id;
    return query select to_jsonb(v_task),to_jsonb(v_milestone),false; return;
  end if;
  if exists(select 1 from public.adhdice_milestone_events where user_id=v_user_id and operation_id=p_operation_id) then raise exception 'Operation ID was already used for another Milestone mutation'; end if;
  select * into v_task from public.adhdice_clean_tasks where id=p_task_id for update;
  select * into v_milestone from public.adhdice_milestones where id=p_milestone_id for update;
  if v_task.id is null or v_milestone.id is null then raise exception 'Task or Milestone not found'; end if;
  if v_task.user_id<>v_user_id or v_milestone.user_id<>v_user_id then raise exception 'Ownership mismatch'; end if;
  if p_expected_task_revision is null or v_task.revision<>p_expected_task_revision then raise exception 'Task revision conflict'; end if;
  if p_expected_milestone_revision is null or v_milestone.revision<>p_expected_milestone_revision then raise exception 'Milestone revision conflict'; end if;
  if v_milestone.task_id is distinct from v_task.id or v_task.status<>'trashed' or v_milestone.task_trashed_at is null then raise exception 'Task is not in Milestone Trash state'; end if;
  update public.adhdice_clean_tasks set status='pending',completed_at=null,trashed_at=null where id=v_task.id returning * into v_task;
  update public.adhdice_milestones set task_trashed_at=null,last_restored_at=v_now,revision=revision+1 where id=v_milestone.id returning * into v_milestone;
  if v_milestone.status='active' then
    v_local_date:=(v_now at time zone v_milestone.completion_timezone)::date;
    select coalesce(max(schedule_version),0)+1 into v_schedule_version from public.adhdice_milestone_reminders where milestone_id=v_milestone.id;
    insert into public.adhdice_milestone_reminders(user_id,milestone_id,kind,schedule_version,scheduled_date,status)
    select v_user_id,v_milestone.id,s.kind,v_schedule_version,s.scheduled_date,'pending'
    from (values ('seven_days',v_milestone.current_target_date-7),('three_days',v_milestone.current_target_date-3),('target_day',v_milestone.current_target_date),('final_aura_day',v_milestone.current_aura_deadline)) s(kind,scheduled_date)
    where s.scheduled_date>=v_local_date;
  end if;
  insert into public.adhdice_milestone_events(operation_id,user_id,milestone_id,task_id,event_type,next_state)
    values(p_operation_id,v_user_id,v_milestone.id,v_task.id,'task_restored',to_jsonb(v_milestone));
  return query select to_jsonb(v_task),to_jsonb(v_milestone),true;
end;
$function$;

create or replace function public.adhdice_delete_milestone_task_permanently(
  p_task_id uuid, p_milestone_id uuid, p_expected_task_revision integer,
  p_expected_milestone_revision bigint, p_operation_id uuid
)
returns table(task_row jsonb, milestone_row jsonb, created_transition boolean)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid:=auth.uid(); v_task public.adhdice_clean_tasks%rowtype; v_milestone public.adhdice_milestones%rowtype;
  v_now timestamptz:=clock_timestamp(); v_deleted_task jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_task_id is null or p_milestone_id is null or p_operation_id is null then raise exception 'Task, Milestone, and operation IDs are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text||':'||p_operation_id::text,0));
  select m.* into v_milestone from public.adhdice_milestone_events e join public.adhdice_milestones m on m.id=e.milestone_id
    where e.user_id=v_user_id and e.operation_id=p_operation_id and e.event_type='task_deleted_permanently' limit 1;
  if found then
    if v_milestone.id<>p_milestone_id then raise exception 'Operation ID was already used for a different permanent deletion'; end if;
    return query select null::jsonb,to_jsonb(v_milestone),false; return;
  end if;
  if exists(select 1 from public.adhdice_milestone_events where user_id=v_user_id and operation_id=p_operation_id) then raise exception 'Operation ID was already used for another Milestone mutation'; end if;
  select * into v_task from public.adhdice_clean_tasks where id=p_task_id for update;
  select * into v_milestone from public.adhdice_milestones where id=p_milestone_id for update;
  if v_task.id is null or v_milestone.id is null then raise exception 'Task or Milestone not found'; end if;
  if v_task.user_id<>v_user_id or v_milestone.user_id<>v_user_id then raise exception 'Ownership mismatch'; end if;
  if p_expected_task_revision is null or v_task.revision<>p_expected_task_revision then raise exception 'Task revision conflict'; end if;
  if p_expected_milestone_revision is null or v_milestone.revision<>p_expected_milestone_revision then raise exception 'Milestone revision conflict'; end if;
  if v_milestone.task_id is distinct from v_task.id or v_task.status<>'trashed' or v_milestone.task_trashed_at is null then raise exception 'Only the attached trashed task can be permanently deleted'; end if;
  v_deleted_task:=to_jsonb(v_task);
  if v_milestone.status='active' then
    update public.adhdice_milestones set status='abandoned',abandoned_at=v_now,
      abandonment_reason='task_deleted_permanently',revision=revision+1 where id=v_milestone.id returning * into v_milestone;
    update public.adhdice_milestone_reminders set status='canceled',canceled_at=v_now where milestone_id=v_milestone.id and status='pending';
    insert into public.adhdice_milestone_events(operation_id,user_id,milestone_id,task_id,event_type,next_state,metadata)
      values(p_operation_id,v_user_id,v_milestone.id,v_task.id,'abandoned',to_jsonb(v_milestone),jsonb_build_object('mutation','delete_task_permanently'));
  end if;
  insert into public.adhdice_milestone_events(operation_id,user_id,milestone_id,task_id,event_type,next_state)
    values(p_operation_id,v_user_id,v_milestone.id,v_task.id,'task_deleted_permanently',jsonb_build_object('task_title_snapshot',v_milestone.task_title_snapshot));
  delete from public.adhdice_clean_tasks where id=v_task.id;
  select * into v_milestone from public.adhdice_milestones where id=p_milestone_id;
  return query select v_deleted_task,to_jsonb(v_milestone),true;
end;
$function$;

revoke all on function public.adhdice_complete_milestone(uuid,uuid,integer,bigint,uuid) from public, anon;
revoke all on function public.adhdice_reverse_milestone_completion(uuid,uuid,integer,bigint,uuid) from public, anon;
revoke all on function public.adhdice_abandon_milestone(uuid,bigint,uuid,text) from public, anon;
revoke all on function public.adhdice_trash_milestone_task(uuid,uuid,integer,bigint,uuid) from public, anon;
revoke all on function public.adhdice_restore_milestone_task(uuid,uuid,integer,bigint,uuid) from public, anon;
revoke all on function public.adhdice_delete_milestone_task_permanently(uuid,uuid,integer,bigint,uuid) from public, anon;
grant execute on function public.adhdice_complete_milestone(uuid,uuid,integer,bigint,uuid) to authenticated;
grant execute on function public.adhdice_reverse_milestone_completion(uuid,uuid,integer,bigint,uuid) to authenticated;
grant execute on function public.adhdice_abandon_milestone(uuid,bigint,uuid,text) to authenticated;
grant execute on function public.adhdice_trash_milestone_task(uuid,uuid,integer,bigint,uuid) to authenticated;
grant execute on function public.adhdice_restore_milestone_task(uuid,uuid,integer,bigint,uuid) to authenticated;
grant execute on function public.adhdice_delete_milestone_task_permanently(uuid,uuid,integer,bigint,uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

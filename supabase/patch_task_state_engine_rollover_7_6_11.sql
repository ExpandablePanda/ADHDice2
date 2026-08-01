-- ADHDice 7.6.11 manual corrective install.
-- Apply after patch_task_state_engine_rollover_7_6_10.sql. This retains its
-- set-based writes while deferring per-row achievement evaluation to one final
-- strict evaluation for the engine rollover transaction.

drop function if exists public.adhdice_apply_task_state_engine_rollover(uuid, jsonb, timestamptz);

create function public.adhdice_apply_task_state_engine_rollover(
  p_user_id uuid,
  p_plan jsonb,
  p_now timestamptz default now()
)
returns table (
  changed_task_count integer,
  inserted_history_count integer,
  deduplicated_outcome_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed integer := 0;
  v_inserted integer := 0;
  v_deduplicated integer := 0;
  v_achievement_evaluation jsonb;
  v_achievement_operation_id uuid;
  v_operation_logical_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if auth.uid() <> p_user_id then raise exception 'Not authorized to reconcile another user''s task rollover.'; end if;
  if jsonb_typeof(p_plan) <> 'array' then raise exception 'p_plan must be an array.'; end if;
  if jsonb_array_length(p_plan) > 5000 then raise exception 'p_plan exceeds the 5000-task rollover limit.'; end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  create temporary table pg_temp.adhdice_rollover_tasks (
    task_id uuid primary key,
    expected_revision integer not null,
    patch jsonb not null,
    history jsonb not null
  ) on commit drop;
  create temporary table pg_temp.adhdice_rollover_history (
    task_id uuid not null,
    logical_date date not null,
    outcome text not null,
    occurrence_identity text,
    primary key (task_id, logical_date)
  ) on commit drop;
  create temporary table pg_temp.adhdice_rollover_eligible_tasks (
    task_id uuid primary key,
    expected_revision integer not null,
    patch jsonb not null
  ) on commit drop;

  insert into pg_temp.adhdice_rollover_tasks (task_id, expected_revision, patch, history)
  select source."taskId", source."expectedRevision", coalesce(source.patch, '{}'::jsonb), coalesce(source.history, '[]'::jsonb)
  from jsonb_to_recordset(p_plan) as source("taskId" uuid, "expectedRevision" integer, patch jsonb, history jsonb);

  insert into pg_temp.adhdice_rollover_history (task_id, logical_date, outcome, occurrence_identity)
  select task.task_id, source."logicalDate", source.outcome, nullif(source."occurrenceIdentity", '')
  from pg_temp.adhdice_rollover_tasks task
  cross join lateral jsonb_to_recordset(task.history) as source(
    "logicalDate" date,
    outcome text,
    "occurrenceIdentity" text
  );

  if exists (
    select 1 from pg_temp.adhdice_rollover_tasks
    where patch ? 'status'
      and (patch->>'status') not in ('unscheduled', 'pending', 'in_progress', 'done', 'missed', 'did_my_best', 'upcoming', 'not_due', 'delayed', 'complete')
  ) then
    raise exception 'Unsupported task status in engine rollover plan.';
  end if;
  if exists (
    select 1 from pg_temp.adhdice_rollover_history
    where outcome not in ('done', 'did_my_best', 'missed', 'delayed', 'complete')
  ) then
    raise exception 'Unsupported History outcome in engine rollover plan.';
  end if;

  insert into pg_temp.adhdice_rollover_eligible_tasks (task_id, expected_revision, patch)
  select task.id, plan.expected_revision, plan.patch
  from pg_temp.adhdice_rollover_tasks plan
  join public.adhdice_clean_tasks task
    on task.id = plan.task_id and task.user_id = p_user_id
  where task.status not in ('archived', 'trashed')
    and task.revision = plan.expected_revision
    and not exists (
      select 1
      from pg_temp.adhdice_rollover_history proposed
      join public.adhdice_task_history existing
        on existing.user_id = p_user_id
       and existing.task_id = proposed.task_id
       and existing.entry_date = proposed.logical_date
       and existing.status is distinct from proposed.outcome::public.adhdice_clean_task_status
      where proposed.task_id = task.id
    )
  for update of task;

  -- The installed History trigger still captures every occurrence and refreshes
  -- its Step set. The transaction-local marker skips only its full evaluation.
  perform set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true);
  with inserted as (
    insert into public.adhdice_task_history (
      task_id, user_id, entry_date, status, was_completed,
      occurrence_key, occurrence_due_on, counted_as_due_occurrence
    )
    select proposed.task_id, p_user_id, proposed.logical_date,
      proposed.outcome::public.adhdice_clean_task_status,
      proposed.outcome in ('done', 'did_my_best', 'complete'),
      proposed.occurrence_identity,
      case when proposed.occurrence_identity ~ '\\d{4}-\\d{2}-\\d{2}$'
        then right(proposed.occurrence_identity, 10)::date else null end,
      proposed.occurrence_identity is not null
    from pg_temp.adhdice_rollover_history proposed
    join pg_temp.adhdice_rollover_eligible_tasks eligible using (task_id)
    on conflict (user_id, task_id, entry_date) do nothing
    returning task_id, entry_date
  )
  select count(*) into v_inserted from inserted;

  select count(*) - v_inserted into v_deduplicated
  from pg_temp.adhdice_rollover_history proposed
  join pg_temp.adhdice_rollover_eligible_tasks eligible using (task_id);

  update public.adhdice_clean_tasks task
  set
    status = case when eligible.patch ? 'status'
      then case when eligible.patch->>'status' = 'unscheduled' then 'pending'::public.adhdice_clean_task_status
        else (eligible.patch->>'status')::public.adhdice_clean_task_status end
      else task.status end,
    due_on = case when eligible.patch ? 'dueOn' then nullif(eligible.patch->>'dueOn', '')::date else task.due_on end,
    completed_at = case when eligible.patch ? 'completedAt' then nullif(eligible.patch->>'completedAt', '')::timestamptz else task.completed_at end,
    active_status_logical_date = case when eligible.patch ? 'activeStatusLogicalDate' then nullif(eligible.patch->>'activeStatusLogicalDate', '')::date else task.active_status_logical_date end,
    active_occurrence_due_on = case when eligible.patch ? 'activeOccurrenceDueOn' then nullif(eligible.patch->>'activeOccurrenceDueOn', '')::date else task.active_occurrence_due_on end,
    revision = task.revision + 1,
    updated_at = p_now
  from pg_temp.adhdice_rollover_eligible_tasks eligible
  where task.id = eligible.task_id
    and task.user_id = p_user_id
    and task.revision = eligible.expected_revision
    and eligible.patch <> '{}'::jsonb;
  get diagnostics v_changed = row_count;

  -- Clear before the final evaluation so this setting cannot leak. A stable
  -- operation ID makes repeated logical-day engine rollovers idempotent.
  perform set_config('adhdice.achievement_deferred_user_id', '', true);
  select coalesce(max(logical_date), (p_now at time zone 'UTC')::date)
    into v_operation_logical_date
    from pg_temp.adhdice_rollover_history;
  v_achievement_operation_id := md5('task-state-engine-rollover:' || p_user_id::text || ':' || v_operation_logical_date::text)::uuid;
  v_achievement_evaluation := public.adhdice_evaluate_achievements(
    p_user_id,
    v_achievement_operation_id,
    'immediate'
  );
  if coalesce(v_achievement_evaluation->>'status', '') not in ('completed', 'inactive') then
    raise exception 'Final Achievement evaluation failed with status % and code %.',
      coalesce(v_achievement_evaluation->>'status', 'missing'),
      coalesce(v_achievement_evaluation->>'error_code', 'unknown');
  end if;

  return query select v_changed, v_inserted, v_deduplicated;
end;
$$;

revoke execute on function public.adhdice_apply_task_state_engine_rollover(uuid, jsonb, timestamptz) from public;
revoke execute on function public.adhdice_apply_task_state_engine_rollover(uuid, jsonb, timestamptz) from anon;
grant execute on function public.adhdice_apply_task_state_engine_rollover(uuid, jsonb, timestamptz) to authenticated;

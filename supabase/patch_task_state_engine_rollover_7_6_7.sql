-- ADHDice 7.6.7 manual install.
-- Apply after patch_daily_until_complete_rollover_rpc.sql. This is the atomic
-- persistence boundary for plans made from already-loaded Task State Engine data.
-- The client retains adhdice_reconcile_task_rollover as a fallback until this is installed.

create or replace function public.adhdice_apply_task_state_engine_rollover(
  p_user_id uuid,
  p_plan jsonb,
  p_now timestamptz default now()
)
returns table (changed_task_count integer, inserted_history_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_history jsonb;
  v_task public.adhdice_clean_tasks%rowtype;
  v_changed integer := 0;
  v_inserted integer := 0;
  v_row_count integer;
  v_conflict boolean;
  v_patch jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if auth.uid() <> p_user_id then raise exception 'Not authorized to reconcile another user''s task rollover.'; end if;
  if jsonb_typeof(p_plan) <> 'array' then raise exception 'p_plan must be an array.'; end if;

  -- Multiple tabs/devices serialize here. Client single-flight only avoids local noise.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  for v_item in select value from jsonb_array_elements(p_plan)
  loop
    select * into v_task from public.adhdice_clean_tasks
      where id = (v_item->>'taskId')::uuid and user_id = p_user_id
      for update;
    if not found or v_task.status in ('archived', 'trashed')
      or v_task.revision <> coalesce((v_item->>'expectedRevision')::integer, -1) then
      continue;
    end if;

    -- Explicit History is authoritative. A stale plan must never overwrite it.
    v_conflict := false;
    for v_history in select value from jsonb_array_elements(coalesce(v_item->'history', '[]'::jsonb))
    loop
      if exists (
        select 1 from public.adhdice_task_history h
        where h.user_id = p_user_id and h.task_id = v_task.id
          and h.entry_date = (v_history->>'logicalDate')::date
          and h.status is distinct from (v_history->>'outcome')::public.adhdice_clean_task_status
      ) then v_conflict := true; exit; end if;
    end loop;
    if v_conflict then continue; end if;

    for v_history in select value from jsonb_array_elements(coalesce(v_item->'history', '[]'::jsonb))
    loop
      insert into public.adhdice_task_history (
        task_id, user_id, entry_date, status, was_completed,
        occurrence_key, occurrence_due_on, counted_as_due_occurrence
      ) values (
        v_task.id, p_user_id, (v_history->>'logicalDate')::date,
        (v_history->>'outcome')::public.adhdice_clean_task_status,
        (v_history->>'outcome') in ('done', 'did_my_best', 'complete'),
        nullif(v_history->>'occurrenceIdentity', ''),
        case when coalesce(v_history->>'occurrenceIdentity', '') ~ '\\d{4}-\\d{2}-\\d{2}$'
          then right(v_history->>'occurrenceIdentity', 10)::date else null end,
        coalesce(v_history->>'occurrenceIdentity', '') <> ''
      ) on conflict (user_id, task_id, entry_date) do nothing;
      get diagnostics v_row_count = row_count;
      v_inserted := v_inserted + v_row_count;
    end loop;

    v_patch := coalesce(v_item->'patch', '{}'::jsonb);
    update public.adhdice_clean_tasks set
      status = case when v_patch ? 'status' then (v_patch->>'status')::public.adhdice_clean_task_status else status end,
      due_on = case when v_patch ? 'dueOn' then nullif(v_patch->>'dueOn', '')::date else due_on end,
      completed_at = case when v_patch ? 'completedAt' then nullif(v_patch->>'completedAt', '')::timestamptz else completed_at end,
      active_status_logical_date = case when v_patch ? 'activeStatusLogicalDate' then nullif(v_patch->>'activeStatusLogicalDate', '')::date else active_status_logical_date end,
      active_occurrence_due_on = case when v_patch ? 'activeOccurrenceDueOn' then nullif(v_patch->>'activeOccurrenceDueOn', '')::date else active_occurrence_due_on end,
      revision = revision + 1,
      updated_at = p_now
    where id = v_task.id and user_id = p_user_id
      and revision = (v_item->>'expectedRevision')::integer;
    get diagnostics v_row_count = row_count;
    v_changed := v_changed + v_row_count;
  end loop;
  return query select v_changed, v_inserted;
end;
$$;

revoke execute on function public.adhdice_apply_task_state_engine_rollover(uuid, jsonb, timestamptz) from public;
revoke execute on function public.adhdice_apply_task_state_engine_rollover(uuid, jsonb, timestamptz) from anon;
grant execute on function public.adhdice_apply_task_state_engine_rollover(uuid, jsonb, timestamptz) to authenticated;

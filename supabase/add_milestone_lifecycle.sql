begin;

-- Milestone metadata-only lifecycle foundation.
-- Task State transitions are supplied by
-- patch_milestone_canonicalization_7_9_42.sql. This file intentionally does
-- not write adhdice_clean_tasks or either Task History table.

do $contract$
begin
  if to_regclass('public.adhdice_milestones') is null
    or to_regclass('public.adhdice_milestone_events') is null
    or to_regclass('public.adhdice_milestone_reminders') is null then
    raise exception 'Milestones foundation is required before the metadata lifecycle';
  end if;
end
$contract$;

create or replace function public.adhdice_abandon_milestone(
  p_milestone_id uuid,
  p_expected_milestone_revision bigint,
  p_operation_id uuid,
  p_reason text default null
)
returns table(milestone_row jsonb, created_transition boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_milestone public.adhdice_milestones%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_milestone_id is null or p_operation_id is null then
    raise exception 'Milestone and operation IDs are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));
  select m.* into v_milestone
    from public.adhdice_milestone_events e
    join public.adhdice_milestones m on m.id = e.milestone_id
   where e.user_id = v_user_id
     and e.operation_id = p_operation_id
     and e.event_type = 'abandoned'
     and e.metadata->>'mutation' = 'abandon'
   limit 1;
  if found then
    if v_milestone.id <> p_milestone_id then
      raise exception 'Operation ID was already used for a different abandonment';
    end if;
    return query select to_jsonb(v_milestone), false;
    return;
  end if;
  if exists (select 1 from public.adhdice_milestone_events where user_id = v_user_id and operation_id = p_operation_id) then
    raise exception 'Operation ID was already used for another Milestone mutation';
  end if;
  select * into v_milestone
    from public.adhdice_milestones
   where id = p_milestone_id
   for update;
  if not found then raise exception 'Milestone not found'; end if;
  if v_milestone.user_id <> v_user_id then raise exception 'Ownership mismatch'; end if;
  if p_expected_milestone_revision is null or v_milestone.revision <> p_expected_milestone_revision then
    raise exception 'Milestone revision conflict';
  end if;
  if v_milestone.status <> 'active' then raise exception 'Only an active Milestone can be abandoned'; end if;

  update public.adhdice_milestones
     set status = 'abandoned',
         abandoned_at = v_now,
         abandonment_reason = nullif(trim(coalesce(p_reason, '')), ''),
         revision = revision + 1
   where id = v_milestone.id
   returning * into v_milestone;
  update public.adhdice_milestone_reminders
     set status = 'canceled', canceled_at = v_now
   where milestone_id = v_milestone.id and status = 'pending';
  insert into public.adhdice_milestone_events (
    operation_id, user_id, milestone_id, task_id, event_type, next_state, metadata
  ) values (
    p_operation_id, v_user_id, v_milestone.id, v_milestone.task_id, 'abandoned',
    to_jsonb(v_milestone), jsonb_build_object('mutation', 'abandon')
  );
  return query select to_jsonb(v_milestone), true;
end;
$function$;

revoke all on function public.adhdice_abandon_milestone(uuid, bigint, uuid, text) from public, anon;
grant execute on function public.adhdice_abandon_milestone(uuid, bigint, uuid, text) to authenticated;

commit;

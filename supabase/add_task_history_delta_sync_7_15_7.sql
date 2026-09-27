-- ADHDice 7.15.7 canonical Task History delta read protocol.
-- Source-only additive SQL. Apply manually only after review; this file is not
-- executed against live Supabase by the application or test suite.

begin;

create or replace function public.adhdice_get_task_history_delta(
  p_expected_protocol_version text,
  p_expected_sync_epoch uuid,
  p_from_revision bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_state public.adhdice_task_history_sync_state%rowtype;
  v_to_revision bigint;
  v_expected_count bigint;
  v_actual_count bigint;
  v_first_sequence bigint;
  v_last_sequence bigint;
  v_changes jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Task History delta requires an authenticated owner.'
      using errcode = '28000';
  end if;

  if p_expected_protocol_version is distinct from 'task-history-sync-v1' then
    raise exception 'Unsupported Task History sync protocol.'
      using errcode = '22023';
  end if;

  if p_from_revision is null or p_from_revision < 0 then
    raise exception 'Task History delta fromRevision must be non-negative.'
      using errcode = '22023';
  end if;

  -- The state row is the revision fence. FOR SHARE conflicts with the
  -- trigger's state-row update while requiring only the client's SELECT grant.
  select *
    into v_state
    from public.adhdice_task_history_sync_state state
   where state.user_id = v_user_id
   for share;

  if not found then
    raise exception 'Task History sync state is unavailable for this owner.'
      using errcode = 'P0002';
  end if;
  if v_state.protocol_version <> 'task-history-sync-v1' then
    raise exception 'Stored Task History sync protocol is unsupported.'
      using errcode = '22023';
  end if;
  if p_expected_sync_epoch is null or v_state.sync_epoch is distinct from p_expected_sync_epoch then
    raise exception 'Task History sync epoch does not match.'
      using errcode = '40001';
  end if;
  if p_from_revision > v_state.current_revision then
    raise exception 'Task History delta starts ahead of the server revision.'
      using errcode = '40001';
  end if;

  v_to_revision := v_state.current_revision;
  v_expected_count := v_to_revision - p_from_revision;
  select count(*), min(changes.sequence), max(changes.sequence)
    into v_actual_count, v_first_sequence, v_last_sequence
    from public.adhdice_task_history_changes changes
   where changes.user_id = v_user_id
     and changes.sequence > p_from_revision
     and changes.sequence <= v_to_revision;

  if coalesce(v_actual_count, 0) <> v_expected_count
     or (
       v_expected_count > 0
       and (v_first_sequence <> p_from_revision + 1 or v_last_sequence <> v_to_revision)
     )
     or exists (
       select 1
         from pg_catalog.generate_series(p_from_revision + 1, v_to_revision) expected(sequence)
        where not exists (
          select 1
            from public.adhdice_task_history_changes changes
           where changes.user_id = v_user_id
             and changes.sequence = expected.sequence
        )
     ) then
    raise exception 'Task History change ledger continuity is incomplete.'
      using errcode = 'XX001';
  end if;

  -- Validate every final upsert against the canonical authority before
  -- constructing the response. A missing row is never represented as a null
  -- payload because that would make the client reconstruct correctness.
  if exists (
    with final_changes as (
      select distinct on (changes.history_fact_id)
        changes.history_fact_id,
        changes.operation
        from public.adhdice_task_history_changes changes
       where changes.user_id = v_user_id
         and changes.sequence > p_from_revision
         and changes.sequence <= v_to_revision
       order by changes.history_fact_id, changes.sequence desc
    )
    select 1
      from final_changes
     where final_changes.operation = 'upsert'
       and not exists (
         select 1
           from public.adhdice_task_history_facts facts
          where facts.user_id = v_user_id
            and facts.id = final_changes.history_fact_id
       )
  ) then
    raise exception 'Task History delta upsert has no current canonical fact.'
      using errcode = 'XX002';
  end if;

  select coalesce(
    jsonb_agg(
      case
        when final_changes.operation = 'upsert' then jsonb_build_object(
          'operation', 'upsert',
          'historyFactId', final_changes.history_fact_id,
          'entityId', final_changes.entity_id,
          'logicalDate', final_changes.logical_date,
          'fact', to_jsonb(facts)
        )
        else jsonb_build_object(
          'operation', 'delete',
          'historyFactId', final_changes.history_fact_id,
          'entityId', final_changes.entity_id,
          'logicalDate', final_changes.logical_date
        )
      end
      order by final_changes.sequence
    ),
    '[]'::jsonb
  )
    into v_changes
    from (
      select distinct on (changes.history_fact_id)
        changes.history_fact_id,
        changes.entity_id,
        changes.logical_date,
        changes.operation,
        changes.sequence
        from public.adhdice_task_history_changes changes
       where changes.user_id = v_user_id
         and changes.sequence > p_from_revision
         and changes.sequence <= v_to_revision
       order by changes.history_fact_id, changes.sequence desc
    ) final_changes
    left join public.adhdice_task_history_facts facts
      on facts.user_id = v_user_id
     and facts.id = final_changes.history_fact_id;

  return jsonb_build_object(
    'protocolVersion', v_state.protocol_version,
    'syncEpoch', v_state.sync_epoch,
    'fromRevision', p_from_revision,
    'toRevision', v_to_revision,
    'continuity', jsonb_build_object(
      'isContiguous', true,
      'firstRevision', case when v_expected_count = 0 then null else p_from_revision + 1 end,
      'lastRevision', case when v_expected_count = 0 then null else v_to_revision end
    ),
    'completeness', jsonb_build_object(
      'isComplete', true,
      'scope', 'canonical-task-history'
    ),
    'changes', v_changes
  );
end;
$function$;

revoke all on function public.adhdice_get_task_history_delta(text, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.adhdice_get_task_history_delta(text, uuid, bigint)
  to authenticated;

notify pgrst, 'reload schema';

commit;

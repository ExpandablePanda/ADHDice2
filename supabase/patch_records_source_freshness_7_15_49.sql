-- ADHDice 7.15.49 Records source-certified freshness and valid-only event bootstrap.
-- Source-only forward patch. Do not apply without explicit live SQL authorization.

begin;

alter table public.adhdice_record_reconcile_runs
  add column if not exists source_state jsonb;

do $constraint$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.adhdice_record_reconcile_runs'::regclass
       and conname = 'adhdice_record_reconcile_runs_source_state_check'
  ) then
    alter table public.adhdice_record_reconcile_runs
      add constraint adhdice_record_reconcile_runs_source_state_check
      check (
        source_state is null
        or (
          pg_catalog.jsonb_typeof(source_state) = 'object'
          and coalesce(source_state->>'schema_version', '') = 'records-source-state-v1'
          and coalesce(source_state->>'history_sync_epoch', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and coalesce(source_state->>'history_revision', '') ~ '^[0-9]+$'
          and coalesce(source_state->>'task_row_count', '') ~ '^[0-9]+$'
          and coalesce(source_state->>'task_digest', '') ~ '^sha256:[0-9a-f]{64}$'
          and coalesce(source_state->>'focus_row_count', '') ~ '^[0-9]+$'
          and coalesce(source_state->>'focus_digest', '') ~ '^sha256:[0-9a-f]{64}$'
        )
      );
  end if;
end;
$constraint$;

-- This helper is owner-checked even though the reconciliation RPCs use the
-- existing definer path. It is callable only for auth.uid(), never for an
-- arbitrary caller-supplied owner.
create or replace function public.adhdice_records_source_state_for_owner(
  p_user_id uuid
)
returns jsonb
stable
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_state public.adhdice_task_history_sync_state%rowtype;
  v_task_row_count integer;
  v_task_digest text;
  v_focus_row_count integer;
  v_focus_digest text;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Records source state requires the authenticated owner.' using errcode = '42501';
  end if;

  select state.*
    into v_state
    from public.adhdice_task_history_sync_state state
   where state.user_id = p_user_id;
  if not found then
    raise exception 'Task History sync state is unavailable for this owner.' using errcode = 'P0002';
  end if;

  with task_rows as (
    select task.id::text as sort_key,
           pg_catalog.jsonb_build_array(
             task.id,
             task.parent_task_id,
             task.title,
             task.repeat_frequency::text,
             task.exclude_from_tracking
           ) as row_value
      from public.adhdice_clean_tasks task
     where task.user_id = p_user_id
       and task.permanently_deleted_at is null
  )
  select count(*)::integer,
         'sha256:' || pg_catalog.encode(
           extensions.digest(
             coalesce(pg_catalog.jsonb_agg(task_rows.row_value order by task_rows.sort_key), '[]'::jsonb)::text,
             'sha256'::text
           ),
           'hex'
         )
    into v_task_row_count, v_task_digest
    from task_rows;

  with focus_rows as (
    select session.id::text as sort_key,
           pg_catalog.jsonb_build_array(
             session.id,
             session.category_id,
             session.title_snapshot,
             session.session_date,
             session.duration_seconds,
             session.started_at,
             session.ended_at,
             session.source::text,
             session.runtime_session_id,
             session.created_at
           ) as row_value
      from public.adhdice_focus_sessions session
     where session.user_id = p_user_id
  )
  select count(*)::integer,
         'sha256:' || pg_catalog.encode(
           extensions.digest(
             coalesce(pg_catalog.jsonb_agg(focus_rows.row_value order by focus_rows.sort_key), '[]'::jsonb)::text,
             'sha256'::text
           ),
           'hex'
         )
    into v_focus_row_count, v_focus_digest
    from focus_rows;

  return pg_catalog.jsonb_build_object(
    'schema_version', 'records-source-state-v1',
    'history_sync_epoch', v_state.sync_epoch,
    'history_revision', v_state.current_revision,
    'task_row_count', v_task_row_count,
    'task_digest', v_task_digest,
    'focus_row_count', v_focus_row_count,
    'focus_digest', v_focus_digest
  );
end;
$function$;

revoke all on function public.adhdice_records_source_state_for_owner(uuid) from public, anon;
grant execute on function public.adhdice_records_source_state_for_owner(uuid) to authenticated;

create or replace function public.adhdice_get_records_source_state()
returns jsonb
stable
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Records source state requires an authenticated owner.' using errcode = '42501';
  end if;
  return public.adhdice_records_source_state_for_owner(v_user_id);
end;
$function$;

revoke all on function public.adhdice_get_records_source_state() from public, anon;
grant execute on function public.adhdice_get_records_source_state() to authenticated;

create or replace function public.adhdice_begin_records_reconciliation(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.adhdice_record_reconcile_runs%rowtype;
  v_received jsonb;
  v_partitions jsonb := p_payload->'expected_partitions';
  v_source_state jsonb := p_payload->'source_state';
  v_now timestamptz := clock_timestamp();
  v_evaluated_at timestamptz;
  v_day_start time;
  v_expected_chunk_count integer;
  v_expected_current_row_count integer;
  v_expected_event_row_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if coalesce(pg_catalog.jsonb_typeof(p_payload), '') <> 'object'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'manifest_schema_version'), '') <> 'number'
    or (p_payload->>'manifest_schema_version') <> '1'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'evidence_schema_version'), '') <> 'number'
    or (p_payload->>'evidence_schema_version') <> '2'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'rules_version'), '') <> 'string'
    or coalesce(p_payload->>'rules_version', '') !~ '^records-v[1-9][0-9]*$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'manifest_digest'), '') <> 'string'
    or coalesce(p_payload->>'manifest_digest', '') !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'evaluation_digest'), '') <> 'string'
    or coalesce(p_payload->>'evaluation_digest', '') !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(pg_catalog.jsonb_typeof(v_partitions), '') <> 'array'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'timezone'), '') <> 'string'
    or coalesce(p_payload->>'timezone', '') = '' or char_length(p_payload->>'timezone') > 100
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'logical_day_start'), '') <> 'string'
    or coalesce(p_payload->>'logical_day_start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'evaluated_at'), '') <> 'string'
    or coalesce(p_payload->>'evaluated_at', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'expected_chunk_count'), '') <> 'number'
    or coalesce(p_payload->>'expected_chunk_count', '') !~ '^[0-9]{1,5}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'expected_current_row_count'), '') <> 'number'
    or coalesce(p_payload->>'expected_current_row_count', '') !~ '^[0-9]{1,5}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'expected_event_row_count'), '') <> 'number'
    or coalesce(p_payload->>'expected_event_row_count', '') !~ '^[0-9]{1,6}$'
    or (v_source_state is not null and (
      pg_catalog.jsonb_typeof(v_source_state) <> 'object'
      or coalesce(v_source_state->>'schema_version', '') <> 'records-source-state-v1'
      or coalesce(v_source_state->>'history_sync_epoch', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(v_source_state->>'history_revision', '') !~ '^[0-9]+$'
      or coalesce(v_source_state->>'task_row_count', '') !~ '^[0-9]+$'
      or coalesce(v_source_state->>'task_digest', '') !~ '^sha256:[0-9a-f]{64}$'
      or coalesce(v_source_state->>'focus_row_count', '') !~ '^[0-9]+$'
      or coalesce(v_source_state->>'focus_digest', '') !~ '^sha256:[0-9a-f]{64}$'
    )) then
    raise exception 'Invalid Records reconciliation manifest.' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(v_partitions) <> 5 then
    raise exception 'Invalid Records reconciliation partition count.' using errcode = '22023';
  end if;

  begin
    v_evaluated_at := (p_payload->>'evaluated_at')::timestamptz;
    v_day_start := (p_payload->>'logical_day_start')::time;
    v_expected_chunk_count := (p_payload->>'expected_chunk_count')::integer;
    v_expected_current_row_count := (p_payload->>'expected_current_row_count')::integer;
    v_expected_event_row_count := (p_payload->>'expected_event_row_count')::integer;
  exception when data_exception then
    raise exception 'Invalid Records reconciliation manifest values.' using errcode = '22023';
  end;
  if v_expected_chunk_count > 10000 or v_expected_current_row_count > 10000 or v_expected_event_row_count > 100000 then
    raise exception 'Invalid Records reconciliation manifest totals.' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_partitions) as partition(value)
    where coalesce(pg_catalog.jsonb_typeof(partition.value), '') <> 'object'
      or coalesce(pg_catalog.jsonb_typeof(partition.value->'row_kind'), '') <> 'string'
      or coalesce(pg_catalog.jsonb_typeof(partition.value->'section_key'), '') <> 'string'
      or coalesce(pg_catalog.jsonb_typeof(partition.value->'chunk_count'), '') <> 'number'
      or coalesce(partition.value->>'chunk_count', '') !~ '^[0-9]{1,5}$'
      or coalesce(pg_catalog.jsonb_typeof(partition.value->'row_count'), '') <> 'number'
      or coalesce(partition.value->>'row_count', '') !~ '^[0-9]{1,6}$'
      or case when coalesce(partition.value->>'chunk_count', '') ~ '^[0-9]{1,5}$' then (partition.value->>'chunk_count')::numeric > 10000 else false end
      or case when coalesce(partition.value->>'row_count', '') ~ '^[0-9]{1,6}$' then (partition.value->>'row_count')::numeric > 100000 else false end
  ) then
    raise exception 'Invalid Records reconciliation partition values.' using errcode = '22023';
  end if;

  begin
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(v_partitions) as partition(row_kind text, section_key text, chunk_count integer, row_count integer)
      where partition.row_kind not in ('current', 'event')
        or partition.section_key not in ('global_tasks', 'streaks', 'focus', 'per_task', 'record_history')
        or (partition.row_kind = 'event') <> (partition.section_key = 'record_history')
        or partition.chunk_count < 0 or partition.row_count < 0
        or (partition.chunk_count = 0) <> (partition.row_count = 0)
    ) or exists (
      select 1 from pg_catalog.jsonb_to_recordset(v_partitions) as partition(row_kind text, section_key text, chunk_count integer, row_count integer)
      group by row_kind, section_key having count(*) > 1
    ) or (select coalesce(sum(chunk_count), 0) from pg_catalog.jsonb_to_recordset(v_partitions) as partition(chunk_count integer)) <> v_expected_chunk_count
      or (select coalesce(sum(row_count), 0) from pg_catalog.jsonb_to_recordset(v_partitions) as partition(row_kind text, row_count integer) where row_kind = 'current') <> v_expected_current_row_count
      or (select coalesce(sum(row_count), 0) from pg_catalog.jsonb_to_recordset(v_partitions) as partition(row_kind text, row_count integer) where row_kind = 'event') <> v_expected_event_row_count then
      raise exception 'Invalid Records reconciliation partitions.' using errcode = '22023';
    end if;
  exception when data_exception then
    raise exception 'Invalid Records reconciliation partitions.' using errcode = '22023';
  end;

  delete from public.adhdice_record_reconcile_runs
  where user_id = v_user_id and status = 'uploading' and expires_at <= v_now;

  select * into v_run
  from public.adhdice_record_reconcile_runs
  where user_id = v_user_id and status = 'uploading'
  for update;

  if found and v_run.manifest_digest <> p_payload->>'manifest_digest' then
    return pg_catalog.jsonb_build_object('status', 'busy');
  end if;

  if not found then
    begin
      insert into public.adhdice_record_reconcile_runs (
        user_id, manifest_schema_version, evidence_schema_version, rules_version,
        manifest_digest, evaluation_digest, expected_partitions, expected_chunk_count,
        expected_current_row_count, expected_event_row_count, evaluated_at, timezone, logical_day_start,
        source_state, expires_at
      ) values (
        v_user_id, 1, 2, p_payload->>'rules_version', p_payload->>'manifest_digest',
        p_payload->>'evaluation_digest', v_partitions, v_expected_chunk_count,
        v_expected_current_row_count, v_expected_event_row_count,
        v_evaluated_at, p_payload->>'timezone', v_day_start, v_source_state,
        v_now + interval '45 minutes'
      ) returning * into v_run;
    exception when unique_violation then
      select * into v_run from public.adhdice_record_reconcile_runs
      where user_id = v_user_id and status = 'uploading' for update;
      if not found or v_run.manifest_digest <> p_payload->>'manifest_digest' then
        return pg_catalog.jsonb_build_object('status', 'busy');
      end if;
    end;
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'row_kind', chunk.row_kind, 'section_key', chunk.section_key,
    'chunk_index', chunk.chunk_index, 'chunk_digest', chunk.chunk_digest
  ) order by chunk.row_kind, chunk.section_key, chunk.chunk_index), '[]'::jsonb)
  into v_received
  from public.adhdice_record_reconcile_chunks chunk
  where chunk.run_id = v_run.id and chunk.user_id = v_user_id;

  return pg_catalog.jsonb_build_object(
    'status', case when pg_catalog.jsonb_array_length(v_received) = 0 then 'ready' else 'resume' end,
    'run_id', v_run.id,
    'received_chunks', v_received,
    'expected_chunk_count', v_run.expected_chunk_count,
    'expected_current_row_count', v_run.expected_current_row_count,
    'expected_event_row_count', v_run.expected_event_row_count
  );
end;
$function$;

create or replace function public.adhdice_finalize_records_reconciliation(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_run_id uuid;
  v_run public.adhdice_record_reconcile_runs%rowtype;
  v_current_count integer;
  v_event_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if coalesce(pg_catalog.jsonb_typeof(p_payload), '') <> 'object'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'run_id'), '') <> 'string'
    or coalesce(p_payload->>'run_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'manifest_digest'), '') <> 'string'
    or coalesce(p_payload->>'manifest_digest', '') !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'Invalid Records finalization payload.' using errcode = '22023';
  end if;
  begin
    v_run_id := (p_payload->>'run_id')::uuid;
  exception when data_exception then
    raise exception 'Invalid Records finalization run ID.' using errcode = '22023';
  end;

  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('adhdice:records:' || v_user_id::text, 0)) then
    return pg_catalog.jsonb_build_object('status', 'busy');
  end if;

  select * into v_run from public.adhdice_record_reconcile_runs
  where id = v_run_id and user_id = v_user_id and status = 'uploading' for update;
  if not found then raise exception 'Records reconciliation run is unavailable.' using errcode = '22023'; end if;
  if v_run.manifest_digest <> p_payload->>'manifest_digest' then
    raise exception 'Records reconciliation manifest mismatch.' using errcode = '22023';
  end if;
  if v_run.expires_at <= clock_timestamp() then
    delete from public.adhdice_record_reconcile_runs where id = v_run.id;
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;

  begin
    select count(*)::integer into v_current_count from public.adhdice_record_current_stage where run_id = v_run_id;
    select count(*)::integer into v_event_count from public.adhdice_record_event_stage where run_id = v_run_id;
    if v_current_count <> v_run.expected_current_row_count or v_event_count <> v_run.expected_event_row_count
      or (select count(*) from public.adhdice_record_reconcile_chunks where run_id = v_run_id) <> v_run.expected_chunk_count
      or exists (
        select 1
        from pg_catalog.jsonb_to_recordset(v_run.expected_partitions) as expected(row_kind text, section_key text, chunk_count integer, row_count integer)
        left join (
          select row_kind, section_key, count(*)::integer as chunk_count, sum(row_count)::integer as row_count
          from public.adhdice_record_reconcile_chunks where run_id = v_run_id group by row_kind, section_key
        ) received using (row_kind, section_key)
        where coalesce(received.chunk_count, 0) <> expected.chunk_count or coalesce(received.row_count, 0) <> expected.row_count
      ) then
      raise exception 'Records reconciliation is incomplete.' using errcode = '22023';
    end if;
  exception when data_exception then
    raise exception 'Records reconciliation is incomplete.' using errcode = '22023';
  end;

  -- The browser fence is checked again on the server immediately before
  -- publishing. A source change rolls back the whole finalization transaction.
  if v_run.source_state is not null
    and v_run.source_state is distinct from public.adhdice_records_source_state_for_owner(v_user_id) then
    raise exception 'Records source data changed during reconciliation; retry required.' using errcode = '40001';
  end if;

  insert into public.adhdice_record_current (
    user_id, rules_version, metric_key, scope_kind, scope_id, title_snapshot, value, unit,
    credited_date, period_key, period_start, period_end, candidate_identity, first_achieved_at,
    evidence_fingerprint, evidence_snapshot, timezone, logical_day_start, recalculated_at
  )
  select v_user_id, v_run.rules_version, metric_key, scope_kind, scope_id, title_snapshot, value, unit,
    credited_date, period_key, period_start, period_end, candidate_identity, first_achieved_at,
    evidence_fingerprint, evidence_snapshot, v_run.timezone, v_run.logical_day_start, v_run.evaluated_at
  from public.adhdice_record_current_stage where run_id = v_run_id
  on conflict (user_id, rules_version, metric_key, scope_kind, (coalesce(scope_id, ''))) do update set
    title_snapshot = excluded.title_snapshot, value = excluded.value, unit = excluded.unit,
    credited_date = excluded.credited_date, period_key = excluded.period_key,
    period_start = excluded.period_start, period_end = excluded.period_end,
    candidate_identity = excluded.candidate_identity,
    first_achieved_at = case
      when adhdice_record_current.candidate_identity = excluded.candidate_identity
        and adhdice_record_current.value = excluded.value
      then adhdice_record_current.first_achieved_at
      else excluded.first_achieved_at
    end,
    evidence_snapshot = case when adhdice_record_current.evidence_fingerprint is distinct from excluded.evidence_fingerprint then excluded.evidence_snapshot else adhdice_record_current.evidence_snapshot end,
    evidence_fingerprint = excluded.evidence_fingerprint, timezone = excluded.timezone,
    logical_day_start = excluded.logical_day_start, recalculated_at = excluded.recalculated_at, updated_at = now();

  delete from public.adhdice_record_current current_record
  where current_record.user_id = v_user_id and current_record.rules_version = v_run.rules_version
    and not exists (
      select 1 from public.adhdice_record_current_stage staged
      where staged.run_id = v_run_id
        and staged.record_identity = current_record.metric_key || ':' || current_record.scope_kind || ':' || coalesce(current_record.scope_id, 'global')
    );

  insert into public.adhdice_record_events (
    user_id, rules_version, metric_key, scope_kind, scope_id, title_snapshot, event_kind, value, unit,
    credited_date, period_key, period_start, period_end, event_identity, candidate_identity,
    evidence_fingerprint, evidence_snapshot, first_qualified_at, first_achieved_at,
    timezone, logical_day_start, validity_state
  )
  select v_user_id, v_run.rules_version, metric_key, scope_kind, scope_id, title_snapshot, event_kind, value, unit,
    credited_date, period_key, period_start, period_end, event_identity, candidate_identity,
    evidence_fingerprint, evidence_snapshot, first_qualified_at, first_achieved_at,
    v_run.timezone, v_run.logical_day_start, 'valid'
  from public.adhdice_record_event_stage where run_id = v_run_id
  on conflict (user_id, rules_version, event_identity) do update set
    metric_key = excluded.metric_key, scope_kind = excluded.scope_kind, scope_id = excluded.scope_id,
    title_snapshot = excluded.title_snapshot, event_kind = excluded.event_kind, value = excluded.value,
    unit = excluded.unit, credited_date = excluded.credited_date, period_key = excluded.period_key,
    period_start = excluded.period_start, period_end = excluded.period_end,
    candidate_identity = excluded.candidate_identity,
    evidence_snapshot = case when adhdice_record_events.evidence_fingerprint is distinct from excluded.evidence_fingerprint then excluded.evidence_snapshot else adhdice_record_events.evidence_snapshot end,
    evidence_fingerprint = excluded.evidence_fingerprint, timezone = excluded.timezone,
    logical_day_start = excluded.logical_day_start, validity_state = 'valid', invalidated_at = null,
    invalidation_reason = null, superseded_by_event_identity = null, updated_at = now();

  update public.adhdice_record_events event
  set validity_state = 'invalid', invalidated_at = v_run.evaluated_at,
    invalidation_reason = 'absent_from_complete_recalculation', updated_at = now()
  where event.user_id = v_user_id and event.rules_version = v_run.rules_version and event.validity_state = 'valid'
    and not exists (
      select 1 from public.adhdice_record_event_stage staged
      where staged.run_id = v_run_id and staged.event_identity = event.event_identity
    );

  update public.adhdice_record_reconcile_runs
  set status = 'completed', completed_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = v_run_id;
  delete from public.adhdice_record_reconcile_chunks where run_id = v_run_id;
  delete from public.adhdice_record_current_stage where run_id = v_run_id;
  delete from public.adhdice_record_event_stage where run_id = v_run_id;

  return pg_catalog.jsonb_build_object(
    'status', 'ok', 'current_count', v_current_count, 'event_count', v_event_count,
    'evaluated_at', v_run.evaluated_at
  );
end;
$function$;

-- The 7.13.88 read RPC returned a narrower table shape. PostgreSQL cannot
-- replace a function while changing its composite return type, so replace it
-- explicitly inside this transaction.
drop function if exists public.adhdice_get_latest_completed_records_run(text, text, text);

create function public.adhdice_get_latest_completed_records_run(
  p_rules_version text,
  p_timezone text,
  p_logical_day_start text
)
returns table (
  evaluated_at timestamptz,
  completed_at timestamptz,
  rules_version text,
  timezone text,
  logical_day_start time,
  source_state jsonb
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_logical_day_start time;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  begin
    v_logical_day_start := p_logical_day_start::time;
  exception when data_exception then
    raise exception 'Invalid logical day start.' using errcode = '22023';
  end;
  return query
  select run.evaluated_at, run.completed_at, run.rules_version, run.timezone,
         run.logical_day_start, run.source_state
    from public.adhdice_record_reconcile_runs run
   where run.user_id = v_user_id
     and run.status = 'completed'
     and run.rules_version = p_rules_version
     and run.timezone = p_timezone
     and run.logical_day_start = v_logical_day_start
   order by run.evaluated_at desc, run.completed_at desc nulls last
   limit 1;
end;
$function$;

revoke all on function public.adhdice_begin_records_reconciliation(jsonb) from public, anon;
revoke all on function public.adhdice_finalize_records_reconciliation(jsonb) from public, anon;
revoke all on function public.adhdice_get_latest_completed_records_run(text, text, text) from public, anon;
grant execute on function public.adhdice_begin_records_reconciliation(jsonb) to authenticated;
grant execute on function public.adhdice_finalize_records_reconciliation(jsonb) to authenticated;
grant execute on function public.adhdice_get_latest_completed_records_run(text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;

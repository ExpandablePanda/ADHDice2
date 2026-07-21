begin;

create unique index if not exists adhdice_record_current_owner_scope_uidx
  on public.adhdice_record_current (user_id, rules_version, metric_key, scope_kind, coalesce(scope_id, ''));
create index if not exists adhdice_record_events_owner_valid_identity_idx
  on public.adhdice_record_events (user_id, rules_version, event_identity)
  where validity_state = 'valid';

create or replace function public.adhdice_reconcile_records(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_rules_version text := nullif(btrim(p_payload->>'rules_version'), '');
  v_timezone text := nullif(btrim(p_payload->>'timezone'), '');
  v_day_start text := nullif(btrim(p_payload->>'logical_day_start'), '');
  v_evaluated_at timestamptz;
  v_current_count integer;
  v_event_count integer;
  v_input_index integer;
  v_item jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if jsonb_typeof(p_payload) <> 'object'
    or v_rules_version !~ '^records-v[1-9][0-9]*$'
    or v_timezone is null or char_length(v_timezone) > 100
    or v_day_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or jsonb_typeof(p_payload->'current_records') <> 'array'
    or jsonb_typeof(p_payload->'events') <> 'array'
    or jsonb_array_length(p_payload->'current_records') > 10000
    or jsonb_array_length(p_payload->'events') > 100000 then
    raise exception 'Invalid Records recalculation payload.' using errcode = '22023';
  end if;
  begin
    v_evaluated_at := (p_payload->>'evaluated_at')::timestamptz;
    if v_evaluated_at is null then raise exception 'invalid timestamp'; end if;
  exception when others then
    raise exception 'Invalid Records evaluation timestamp.' using errcode = '22023';
  end;

  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('adhdice:records:' || v_user_id::text, 0)) then
    return pg_catalog.jsonb_build_object('status', 'busy');
  end if;

  create temporary table pg_temp.adhdice_records_current_input (
    metric_key text, scope_kind text, scope_id text, title_snapshot text, value_text text,
    unit text, credited_date_text text, period_key text, period_start_text text, period_end_text text,
    candidate_identity text, first_achieved_at_text text, evidence_fingerprint text, evidence_snapshot jsonb
  ) on commit drop;
  create temporary table pg_temp.adhdice_records_event_input (
    metric_key text, scope_kind text, scope_id text, title_snapshot text, event_kind text, value_text text,
    unit text, credited_date_text text, period_key text, period_start_text text, period_end_text text,
    event_identity text, candidate_identity text, evidence_fingerprint text, evidence_snapshot jsonb,
    first_qualified_at_text text, first_achieved_at_text text
  ) on commit drop;

  insert into pg_temp.adhdice_records_current_input
  select metric_key, scope_kind, nullif(scope_id, ''), nullif(title_snapshot, ''), value, unit,
    credited_date, nullif(period_key, ''), nullif(period_start, ''), nullif(period_end, ''),
    candidate_identity, first_achieved_at, evidence_fingerprint, null::jsonb
  from pg_catalog.jsonb_to_recordset(p_payload->'current_records') as item(
    metric_key text, scope_kind text, scope_id text, title_snapshot text, value text, unit text,
    credited_date text, period_key text, period_start text, period_end text, candidate_identity text,
    first_achieved_at text, evidence_fingerprint text
  );
  insert into pg_temp.adhdice_records_event_input
  select metric_key, scope_kind, nullif(scope_id, ''), nullif(title_snapshot, ''), event_kind, value, unit,
    credited_date, nullif(period_key, ''), nullif(period_start, ''), nullif(period_end, ''), event_identity,
    candidate_identity, evidence_fingerprint, null::jsonb, first_qualified_at, first_achieved_at
  from pg_catalog.jsonb_to_recordset(p_payload->'events') as item(
    metric_key text, scope_kind text, scope_id text, title_snapshot text, event_kind text, value text, unit text,
    credited_date text, period_key text, period_start text, period_end text, event_identity text,
    candidate_identity text, evidence_fingerprint text,
    first_qualified_at text, first_achieved_at text
  );

  create index on pg_temp.adhdice_records_current_input (metric_key, scope_kind, (coalesce(scope_id, '')));
  create index on pg_temp.adhdice_records_event_input (event_identity);

  for v_input_index in 0..pg_catalog.jsonb_array_length(p_payload->'current_records') - 1 loop
    v_item := p_payload->'current_records'->v_input_index;
    update pg_temp.adhdice_records_current_input input
    set evidence_snapshot = v_item->'evidence_snapshot'
    where input.metric_key = v_item->>'metric_key'
      and input.scope_kind = v_item->>'scope_kind'
      and pg_catalog.coalesce(input.scope_id, '') = pg_catalog.coalesce(v_item->>'scope_id', '');
  end loop;
  for v_input_index in 0..pg_catalog.jsonb_array_length(p_payload->'events') - 1 loop
    v_item := p_payload->'events'->v_input_index;
    update pg_temp.adhdice_records_event_input input
    set evidence_snapshot = v_item->'evidence_snapshot'
    where input.event_identity = v_item->>'event_identity';
  end loop;

  if exists (
    select 1 from pg_temp.adhdice_records_current_input
    where coalesce(metric_key, '') !~ '^[a-z][a-z0-9_]{2,79}$'
      or coalesce(scope_kind, '') not in ('global', 'task')
      or (scope_kind = 'global' and scope_id is not null)
      or (scope_kind = 'task' and nullif(btrim(scope_id), '') is null)
      or coalesce(value_text, '') !~ '^[0-9]+$'
      or coalesce(unit, '') not in ('tasks', 'steps', 'days', 'seconds', 'sessions', 'occurrences')
      or coalesce(credited_date_text, '') !~ '^\d{4}-\d{2}-\d{2}$'
      or (period_start_text is null) <> (period_end_text is null)
      or coalesce(candidate_identity, '') = '' or char_length(candidate_identity) > 1000
      or coalesce(first_achieved_at_text, '') = ''
      or coalesce(evidence_fingerprint, '') = '' or char_length(evidence_fingerprint) > 200
      or jsonb_typeof(evidence_snapshot) <> 'object'
  ) or exists (
    select 1 from pg_temp.adhdice_records_current_input
    group by metric_key, scope_kind, coalesce(scope_id, '') having count(*) > 1
  ) then
    raise exception 'Invalid current Record entry.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_temp.adhdice_records_event_input
    where coalesce(metric_key, '') !~ '^[a-z][a-z0-9_]{2,79}$'
      or coalesce(scope_kind, '') not in ('global', 'task')
      or (scope_kind = 'global' and scope_id is not null)
      or (scope_kind = 'task' and nullif(btrim(scope_id), '') is null)
      or coalesce(event_kind, '') not in ('break', 'tie')
      or coalesce(value_text, '') !~ '^[0-9]+$'
      or coalesce(unit, '') not in ('tasks', 'steps', 'days', 'seconds', 'sessions', 'occurrences')
      or coalesce(credited_date_text, '') !~ '^\d{4}-\d{2}-\d{2}$'
      or (period_start_text is null) <> (period_end_text is null)
      or coalesce(event_identity, '') = '' or char_length(event_identity) > 200
      or coalesce(candidate_identity, '') = '' or char_length(candidate_identity) > 1000
      or coalesce(evidence_fingerprint, '') = '' or char_length(evidence_fingerprint) > 200
      or jsonb_typeof(evidence_snapshot) <> 'object'
      or coalesce(first_qualified_at_text, '') = '' or coalesce(first_achieved_at_text, '') = ''
  ) or exists (
    select 1 from pg_temp.adhdice_records_event_input group by event_identity having count(*) > 1
  ) then
    raise exception 'Invalid Record event entry.' using errcode = '22023';
  end if;
  begin
    perform value_text::bigint, credited_date_text::date, period_start_text::date,
      period_end_text::date, first_achieved_at_text::timestamptz
    from pg_temp.adhdice_records_current_input;
    perform value_text::bigint, credited_date_text::date, period_start_text::date,
      period_end_text::date, first_qualified_at_text::timestamptz, first_achieved_at_text::timestamptz
    from pg_temp.adhdice_records_event_input;
    if exists (select 1 from pg_temp.adhdice_records_current_input where period_end_text::date < period_start_text::date)
      or exists (select 1 from pg_temp.adhdice_records_event_input where period_end_text::date < period_start_text::date) then
      raise exception 'invalid period';
    end if;
  exception when others then
    raise exception 'Invalid Records entry value.' using errcode = '22023';
  end;

  create unique index on pg_temp.adhdice_records_current_input (metric_key, scope_kind, (coalesce(scope_id, '')));
  create unique index on pg_temp.adhdice_records_event_input (event_identity);

  begin
    insert into public.adhdice_record_current (
      user_id, rules_version, metric_key, scope_kind, scope_id, title_snapshot, value, unit,
      credited_date, period_key, period_start, period_end, candidate_identity, first_achieved_at,
      evidence_fingerprint, evidence_snapshot, timezone, logical_day_start, recalculated_at
    )
    select v_user_id, v_rules_version, metric_key, scope_kind, scope_id, title_snapshot, value_text::bigint, unit,
      credited_date_text::date, period_key, period_start_text::date, period_end_text::date, candidate_identity,
      first_achieved_at_text::timestamptz, evidence_fingerprint, evidence_snapshot, v_timezone, v_day_start::time, v_evaluated_at
    from pg_temp.adhdice_records_current_input
    on conflict (user_id, rules_version, metric_key, scope_kind, (coalesce(scope_id, ''))) do update set
      title_snapshot = excluded.title_snapshot, value = excluded.value, unit = excluded.unit,
      credited_date = excluded.credited_date, period_key = excluded.period_key, period_start = excluded.period_start,
      period_end = excluded.period_end, candidate_identity = excluded.candidate_identity,
      first_achieved_at = least(adhdice_record_current.first_achieved_at, excluded.first_achieved_at),
      evidence_snapshot = case
        when adhdice_record_current.evidence_fingerprint is distinct from excluded.evidence_fingerprint
          then excluded.evidence_snapshot
        else adhdice_record_current.evidence_snapshot
      end,
      evidence_fingerprint = excluded.evidence_fingerprint,
      timezone = excluded.timezone, logical_day_start = excluded.logical_day_start,
      recalculated_at = excluded.recalculated_at, updated_at = now();
  exception
    when query_canceled then raise exception using errcode = '57014', message = 'Records current-record upsert timed out.';
    when others then raise exception using errcode = SQLSTATE, message = 'Records current-record upsert failed.';
  end;

  begin
    delete from public.adhdice_record_current current_record
    where current_record.user_id = v_user_id and current_record.rules_version = v_rules_version
      and not exists (
        select 1 from pg_temp.adhdice_records_current_input input
        where input.metric_key = current_record.metric_key and input.scope_kind = current_record.scope_kind
          and coalesce(input.scope_id, '') = coalesce(current_record.scope_id, '')
      );
  exception
    when query_canceled then raise exception using errcode = '57014', message = 'Records current-record cleanup timed out.';
    when others then raise exception using errcode = SQLSTATE, message = 'Records current-record cleanup failed.';
  end;

  begin
    insert into public.adhdice_record_events (
      user_id, rules_version, metric_key, scope_kind, scope_id, title_snapshot, event_kind, value, unit,
      credited_date, period_key, period_start, period_end, event_identity, candidate_identity,
      evidence_fingerprint, evidence_snapshot, first_qualified_at, first_achieved_at,
      timezone, logical_day_start, validity_state
    )
    select v_user_id, v_rules_version, metric_key, scope_kind, scope_id, title_snapshot, event_kind, value_text::bigint, unit,
      credited_date_text::date, period_key, period_start_text::date, period_end_text::date, event_identity,
      candidate_identity, evidence_fingerprint, evidence_snapshot, first_qualified_at_text::timestamptz,
      first_achieved_at_text::timestamptz, v_timezone, v_day_start::time, 'valid'
    from pg_temp.adhdice_records_event_input
    on conflict (user_id, rules_version, event_identity) do update set
      metric_key = excluded.metric_key, scope_kind = excluded.scope_kind, scope_id = excluded.scope_id,
      title_snapshot = excluded.title_snapshot, event_kind = excluded.event_kind, value = excluded.value, unit = excluded.unit,
      credited_date = excluded.credited_date, period_key = excluded.period_key, period_start = excluded.period_start,
      period_end = excluded.period_end, candidate_identity = excluded.candidate_identity,
      evidence_snapshot = case
        when adhdice_record_events.evidence_fingerprint is distinct from excluded.evidence_fingerprint
          then excluded.evidence_snapshot
        else adhdice_record_events.evidence_snapshot
      end,
      evidence_fingerprint = excluded.evidence_fingerprint,
      timezone = excluded.timezone, logical_day_start = excluded.logical_day_start,
      validity_state = 'valid', invalidated_at = null, invalidation_reason = null,
      superseded_by_event_identity = null, updated_at = now();
  exception
    when query_canceled then raise exception using errcode = '57014', message = 'Records event upsert timed out.';
    when others then raise exception using errcode = SQLSTATE, message = 'Records event upsert failed.';
  end;

  begin
    update public.adhdice_record_events event
    set validity_state = 'invalid', invalidated_at = v_evaluated_at,
      invalidation_reason = 'absent_from_complete_recalculation', updated_at = now()
    where event.user_id = v_user_id and event.rules_version = v_rules_version and event.validity_state = 'valid'
      and not exists (
        select 1 from pg_temp.adhdice_records_event_input input where input.event_identity = event.event_identity
      );
  exception
    when query_canceled then raise exception using errcode = '57014', message = 'Records event invalidation timed out.';
    when others then raise exception using errcode = SQLSTATE, message = 'Records event invalidation failed.';
  end;

  select count(*)::integer into v_current_count from pg_temp.adhdice_records_current_input;
  select count(*)::integer into v_event_count from pg_temp.adhdice_records_event_input;
  return pg_catalog.jsonb_build_object('status', 'ok', 'current_count', v_current_count, 'event_count', v_event_count, 'evaluated_at', v_evaluated_at);
end;
$function$;

revoke all on function public.adhdice_reconcile_records(jsonb) from public, anon;
grant execute on function public.adhdice_reconcile_records(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

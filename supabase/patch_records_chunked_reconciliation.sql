-- ADHDice 7.2.24: compact, resumable, chunked Records reconciliation.
-- Apply manually in Supabase SQL Editor. This file intentionally does not alter statement_timeout.
begin;

drop function if exists public.adhdice_reconcile_records(jsonb);

do $drop_records_reconciliation_overloads$
declare
  v_function record;
begin
  for v_function in
    select namespace.nspname, procedure.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'adhdice_reconcile_records',
        'adhdice_begin_records_reconciliation',
        'adhdice_upload_records_reconciliation_chunk',
        'adhdice_finalize_records_reconciliation'
      )
  loop
    execute pg_catalog.format('drop function %I.%I(%s)', v_function.nspname, v_function.proname, v_function.identity_arguments);
  end loop;
end;
$drop_records_reconciliation_overloads$;

create table if not exists public.adhdice_record_reconcile_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  manifest_schema_version integer not null check (manifest_schema_version = 1),
  evidence_schema_version integer not null check (evidence_schema_version = 2),
  rules_version text not null check (rules_version ~ '^records-v[1-9][0-9]*$'),
  manifest_digest text not null check (manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  evaluation_digest text not null check (evaluation_digest ~ '^sha256:[0-9a-f]{64}$'),
  expected_partitions jsonb not null check (jsonb_typeof(expected_partitions) = 'array'),
  expected_chunk_count integer not null check (expected_chunk_count between 0 and 10000),
  expected_current_row_count integer not null check (expected_current_row_count between 0 and 10000),
  expected_event_row_count integer not null check (expected_event_row_count between 0 and 100000),
  evaluated_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 100),
  logical_day_start time not null,
  status text not null default 'uploading' check (status in ('uploading', 'completed', 'invalid')),
  expires_at timestamptz not null default (now() + interval '45 minutes'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index if not exists adhdice_record_reconcile_runs_owner_active_uidx
  on public.adhdice_record_reconcile_runs (user_id) where status = 'uploading';
create index if not exists adhdice_record_reconcile_runs_expiry_idx
  on public.adhdice_record_reconcile_runs (expires_at) where status = 'uploading';

create table if not exists public.adhdice_record_reconcile_chunks (
  run_id uuid not null,
  user_id uuid not null,
  row_kind text not null check (row_kind in ('current', 'event')),
  section_key text not null check (section_key in ('global_tasks', 'streaks', 'focus', 'per_task', 'record_history')),
  chunk_index integer not null check (chunk_index >= 0),
  chunk_digest text not null check (chunk_digest ~ '^sha256:[0-9a-f]{64}$'),
  row_count integer not null check (row_count > 0),
  envelope_bytes integer not null check (envelope_bytes > 0 and envelope_bytes <= 1048576),
  received_at timestamptz not null default now(),
  primary key (run_id, row_kind, section_key, chunk_index),
  foreign key (run_id, user_id) references public.adhdice_record_reconcile_runs(id, user_id) on delete cascade
);

create table if not exists public.adhdice_record_current_stage (
  run_id uuid not null,
  user_id uuid not null,
  record_identity text not null,
  metric_key text not null,
  scope_kind text not null,
  scope_id text,
  title_snapshot text,
  value bigint not null,
  unit text not null,
  credited_date date not null,
  period_key text,
  period_start date,
  period_end date,
  candidate_identity text not null,
  first_achieved_at timestamptz not null,
  evidence_fingerprint text not null,
  evidence_snapshot jsonb not null,
  primary key (run_id, record_identity),
  foreign key (run_id, user_id) references public.adhdice_record_reconcile_runs(id, user_id) on delete cascade
);
create unique index if not exists adhdice_record_current_stage_scope_uidx
  on public.adhdice_record_current_stage (run_id, metric_key, scope_kind, coalesce(scope_id, ''));

create table if not exists public.adhdice_record_event_stage (
  run_id uuid not null,
  user_id uuid not null,
  record_identity text not null,
  metric_key text not null,
  scope_kind text not null,
  scope_id text,
  title_snapshot text,
  event_kind text not null,
  value bigint not null,
  unit text not null,
  credited_date date not null,
  period_key text,
  period_start date,
  period_end date,
  event_identity text not null,
  candidate_identity text not null,
  evidence_fingerprint text not null,
  evidence_snapshot jsonb not null,
  first_qualified_at timestamptz not null,
  first_achieved_at timestamptz not null,
  primary key (run_id, record_identity),
  foreign key (run_id, user_id) references public.adhdice_record_reconcile_runs(id, user_id) on delete cascade
);
create unique index if not exists adhdice_record_event_stage_identity_uidx
  on public.adhdice_record_event_stage (run_id, event_identity);

alter table public.adhdice_record_reconcile_runs enable row level security;
alter table public.adhdice_record_reconcile_chunks enable row level security;
alter table public.adhdice_record_current_stage enable row level security;
alter table public.adhdice_record_event_stage enable row level security;

drop policy if exists "Users own their Records reconcile runs" on public.adhdice_record_reconcile_runs;
create policy "Users own their Records reconcile runs" on public.adhdice_record_reconcile_runs
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users own their Records reconcile chunks" on public.adhdice_record_reconcile_chunks;
create policy "Users own their Records reconcile chunks" on public.adhdice_record_reconcile_chunks
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users own their Records current stage" on public.adhdice_record_current_stage;
create policy "Users own their Records current stage" on public.adhdice_record_current_stage
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users own their Records event stage" on public.adhdice_record_event_stage;
create policy "Users own their Records event stage" on public.adhdice_record_event_stage
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.adhdice_record_reconcile_runs from public, anon, authenticated;
revoke all on table public.adhdice_record_reconcile_chunks from public, anon, authenticated;
revoke all on table public.adhdice_record_current_stage from public, anon, authenticated;
revoke all on table public.adhdice_record_event_stage from public, anon, authenticated;

-- Preserve every legacy row while replacing only oversized evidence JSON with a compact marker.
update public.adhdice_record_current
set evidence_snapshot = pg_catalog.jsonb_build_object(
  'schemaVersion', 2,
  'kind', 'legacy_compacted',
  'evidenceDigest', evidence_fingerprint,
  'evidenceCount', 0
), updated_at = now()
where pg_catalog.octet_length(evidence_snapshot::text) >= 8192;

update public.adhdice_record_events
set evidence_snapshot = pg_catalog.jsonb_build_object(
  'schemaVersion', 2,
  'kind', 'legacy_compacted',
  'evidenceDigest', evidence_fingerprint,
  'evidenceCount', 0
), updated_at = now()
where pg_catalog.octet_length(evidence_snapshot::text) >= 8192;

create function public.adhdice_begin_records_reconciliation(p_payload jsonb)
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
  v_now timestamptz := clock_timestamp();
  v_evaluated_at timestamptz;
  v_day_start time;
  v_expected_chunk_count integer;
  v_expected_current_row_count integer;
  v_expected_event_row_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if pg_catalog.jsonb_typeof(p_payload) <> 'object'
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
    or coalesce(p_payload->>'logical_day_start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'evaluated_at'), '') <> 'string'
    or coalesce(p_payload->>'evaluated_at', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'expected_chunk_count'), '') <> 'number'
    or coalesce(p_payload->>'expected_chunk_count', '') !~ '^[0-9]{1,5}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'expected_current_row_count'), '') <> 'number'
    or coalesce(p_payload->>'expected_current_row_count', '') !~ '^[0-9]{1,5}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'expected_event_row_count'), '') <> 'number'
    or coalesce(p_payload->>'expected_event_row_count', '') !~ '^[0-9]{1,6}$' then
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
    where pg_catalog.jsonb_typeof(partition.value) <> 'object'
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
        expires_at
      ) values (
        v_user_id, 1, 2, p_payload->>'rules_version', p_payload->>'manifest_digest',
        p_payload->>'evaluation_digest', v_partitions, v_expected_chunk_count,
        v_expected_current_row_count, v_expected_event_row_count,
        v_evaluated_at, p_payload->>'timezone', v_day_start,
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

create function public.adhdice_upload_records_reconciliation_chunk(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_run_id uuid;
  v_run public.adhdice_record_reconcile_runs%rowtype;
  v_existing_digest text;
  v_row_kind text := p_payload->>'row_kind';
  v_section_key text := p_payload->>'section_key';
  v_chunk_index integer;
  v_row_count integer;
  v_inserted integer;
  v_envelope_bytes integer := pg_catalog.octet_length(p_payload::text);
  v_partition jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' or v_envelope_bytes > 1048576
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'run_id'), '') <> 'string'
    or coalesce(p_payload->>'run_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'row_kind'), '') <> 'string'
    or v_row_kind not in ('current', 'event')
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'section_key'), '') <> 'string'
    or v_section_key not in ('global_tasks', 'streaks', 'focus', 'per_task', 'record_history')
    or (v_row_kind = 'event') <> (v_section_key = 'record_history')
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'chunk_index'), '') <> 'number'
    or coalesce(p_payload->>'chunk_index', '') !~ '^[0-9]{1,5}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'row_count'), '') <> 'number'
    or coalesce(p_payload->>'row_count', '') !~ '^[0-9]{1,5}$'
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'chunk_digest'), '') <> 'string'
    or coalesce(p_payload->>'chunk_digest', '') !~ '^sha256:[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(p_payload->'rows') <> 'array' then
    raise exception 'Invalid Records chunk envelope.' using errcode = '22023';
  end if;
  begin
    v_run_id := (p_payload->>'run_id')::uuid;
    v_chunk_index := (p_payload->>'chunk_index')::integer;
    v_row_count := (p_payload->>'row_count')::integer;
  exception when data_exception then
    raise exception 'Invalid Records chunk envelope values.' using errcode = '22023';
  end;
  if v_chunk_index > 10000 or v_row_count <= 0 or v_row_count > 10000
    or v_row_count <> pg_catalog.jsonb_array_length(p_payload->'rows') then
    raise exception 'Invalid Records chunk row count.' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_payload->'rows') as row_item(value)
    where pg_catalog.jsonb_typeof(row_item.value) <> 'object'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'record_identity'), '') <> 'string'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'value'), '') <> 'number'
      or coalesce(row_item.value->>'value', '') !~ '^[0-9]{1,19}$'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'evidence_fingerprint'), '') <> 'string'
      or coalesce(row_item.value->>'evidence_fingerprint', '') !~ '^sha256:[0-9a-f]{64}$'
      or pg_catalog.jsonb_typeof(row_item.value->'evidence_snapshot') <> 'object'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'evidence_snapshot'->'schemaVersion'), '') <> 'number'
      or row_item.value->'evidence_snapshot'->>'schemaVersion' <> '2'
      or coalesce(pg_catalog.jsonb_typeof(row_item.value->'evidence_snapshot'->'evidenceCount'), '') <> 'number'
      or coalesce(row_item.value->'evidence_snapshot'->>'evidenceCount', '') !~ '^[0-9]{1,6}$'
  ) then
    raise exception 'Invalid Records compact row values.' using errcode = '22023';
  end if;

  select * into v_run from public.adhdice_record_reconcile_runs
  where id = v_run_id and user_id = v_user_id and status = 'uploading' for update;
  if not found then raise exception 'Records reconciliation run is unavailable.' using errcode = '22023'; end if;
  if v_run.expires_at <= clock_timestamp() then
    delete from public.adhdice_record_reconcile_runs where id = v_run.id;
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;

  select partition.value into v_partition
  from pg_catalog.jsonb_array_elements(v_run.expected_partitions) partition
  where partition.value->>'row_kind' = v_row_kind and partition.value->>'section_key' = v_section_key;
  if v_partition is null or v_chunk_index >= (v_partition->>'chunk_count')::integer then
    raise exception 'Records chunk is outside the manifest.' using errcode = '22023';
  end if;

  select chunk_digest into v_existing_digest
  from public.adhdice_record_reconcile_chunks
  where run_id = v_run_id and row_kind = v_row_kind and section_key = v_section_key and chunk_index = v_chunk_index;
  if found then
    if v_existing_digest = p_payload->>'chunk_digest' then
      return pg_catalog.jsonb_build_object('status', 'already_received');
    end if;
    raise exception 'Records chunk index was already received with a different digest.' using errcode = '23505';
  end if;

  begin
    if v_row_kind = 'current' then
      insert into public.adhdice_record_current_stage (
        run_id, user_id, record_identity, metric_key, scope_kind, scope_id, title_snapshot, value, unit,
        credited_date, period_key, period_start, period_end, candidate_identity, first_achieved_at,
        evidence_fingerprint, evidence_snapshot
      )
      select v_run_id, v_user_id, item.record_identity, item.metric_key, item.scope_kind, nullif(item.scope_id, ''),
        nullif(item.title_snapshot, ''), item.value::bigint, item.unit, item.credited_date::date,
        nullif(item.period_key, ''), item.period_start::date, item.period_end::date, item.candidate_identity,
        item.first_achieved_at::timestamptz, item.evidence_fingerprint, item.evidence_snapshot
      from pg_catalog.jsonb_to_recordset(p_payload->'rows') as item(
        record_identity text, metric_key text, scope_kind text, scope_id text, title_snapshot text,
        value text, unit text, credited_date text, period_key text, period_start text, period_end text,
        candidate_identity text, first_achieved_at text, evidence_fingerprint text, evidence_snapshot jsonb
      )
      where item.record_identity = item.metric_key || ':' || item.scope_kind || ':' || coalesce(nullif(item.scope_id, ''), 'global')
        and item.metric_key in ('parent_tasks_day','parent_tasks_week','parent_tasks_month','permanent_completes_day','steps_day','steps_week','steps_month','parent_completion_day_streak','step_completion_day_streak','combined_completion_day_streak','focus_active_day_streak','longest_focus_session','focus_duration_day','focus_duration_week','focus_duration_month','focus_sessions_day','task_occurrence_streak','task_biggest_comeback')
        and item.scope_kind in ('global', 'task')
        and ((item.scope_kind = 'global' and nullif(item.scope_id, '') is null) or (item.scope_kind = 'task' and nullif(item.scope_id, '') is not null))
        and item.value ~ '^[0-9]{1,19}$' and item.unit in ('tasks','steps','days','seconds','sessions','occurrences')
        and item.credited_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and (item.period_start is null) = (item.period_end is null)
        and (item.period_start is null or (item.period_start ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and item.period_end ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
        and char_length(item.candidate_identity) between 1 and 1000
        and item.first_achieved_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
        and item.evidence_fingerprint ~ '^sha256:[0-9a-f]{64}$'
        and pg_catalog.jsonb_typeof(item.evidence_snapshot) = 'object'
        and item.evidence_snapshot->>'schemaVersion' = '2'
        and item.evidence_snapshot->>'evidenceDigest' = item.evidence_fingerprint
        and pg_catalog.octet_length(item.evidence_snapshot::text) < 8192;
    else
      insert into public.adhdice_record_event_stage (
        run_id, user_id, record_identity, metric_key, scope_kind, scope_id, title_snapshot, event_kind,
        value, unit, credited_date, period_key, period_start, period_end, event_identity, candidate_identity,
        evidence_fingerprint, evidence_snapshot, first_qualified_at, first_achieved_at
      )
      select v_run_id, v_user_id, item.record_identity, item.metric_key, item.scope_kind, nullif(item.scope_id, ''),
        nullif(item.title_snapshot, ''), item.event_kind, item.value::bigint, item.unit, item.credited_date::date,
        nullif(item.period_key, ''), item.period_start::date, item.period_end::date, item.event_identity,
        item.candidate_identity, item.evidence_fingerprint, item.evidence_snapshot,
        item.first_qualified_at::timestamptz, item.first_achieved_at::timestamptz
      from pg_catalog.jsonb_to_recordset(p_payload->'rows') as item(
        record_identity text, metric_key text, scope_kind text, scope_id text, title_snapshot text,
        event_kind text, value text, unit text, credited_date text, period_key text, period_start text,
        period_end text, event_identity text, candidate_identity text, evidence_fingerprint text,
        evidence_snapshot jsonb, first_qualified_at text, first_achieved_at text
      )
      where item.record_identity = item.event_identity and item.event_identity ~ '^fnv1a64:[0-9a-f]{16}$'
        and item.metric_key in ('parent_tasks_day','parent_tasks_week','parent_tasks_month','permanent_completes_day','steps_day','steps_week','steps_month','parent_completion_day_streak','step_completion_day_streak','combined_completion_day_streak','focus_active_day_streak','longest_focus_session','focus_duration_day','focus_duration_week','focus_duration_month','focus_sessions_day','task_occurrence_streak','task_biggest_comeback')
        and item.scope_kind in ('global', 'task') and item.event_kind in ('break', 'tie')
        and ((item.scope_kind = 'global' and nullif(item.scope_id, '') is null) or (item.scope_kind = 'task' and nullif(item.scope_id, '') is not null))
        and item.value ~ '^[0-9]{1,19}$' and item.unit in ('tasks','steps','days','seconds','sessions','occurrences')
        and item.credited_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and (item.period_start is null) = (item.period_end is null)
        and (item.period_start is null or (item.period_start ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and item.period_end ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
        and char_length(item.candidate_identity) between 1 and 1000
        and item.first_qualified_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
        and item.first_achieved_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
        and item.evidence_fingerprint ~ '^sha256:[0-9a-f]{64}$'
        and pg_catalog.jsonb_typeof(item.evidence_snapshot) = 'object'
        and item.evidence_snapshot->>'schemaVersion' = '2'
        and item.evidence_snapshot->>'evidenceDigest' = item.evidence_fingerprint
        and pg_catalog.octet_length(item.evidence_snapshot::text) < 8192;
    end if;
    get diagnostics v_inserted = row_count;
    if v_inserted <> v_row_count then raise exception 'Invalid Records chunk row.' using errcode = '22023'; end if;

    insert into public.adhdice_record_reconcile_chunks (
      run_id, user_id, row_kind, section_key, chunk_index, chunk_digest, row_count, envelope_bytes
    ) values (
      v_run_id, v_user_id, v_row_kind, v_section_key, v_chunk_index,
      p_payload->>'chunk_digest', v_row_count, v_envelope_bytes
    );
  exception when unique_violation then
    raise exception 'Duplicate Records identity across chunks.' using errcode = '23505';
  when data_exception then
    raise exception 'Invalid Records chunk row.' using errcode = '22023';
  end;

  update public.adhdice_record_reconcile_runs set updated_at = clock_timestamp()
  where id = v_run_id;
  return pg_catalog.jsonb_build_object('status', 'ok', 'chunk_index', v_chunk_index);
end;
$function$;

create function public.adhdice_finalize_records_reconciliation(p_payload jsonb)
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
  if pg_catalog.jsonb_typeof(p_payload) <> 'object'
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

  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('adhdice:records:' || v_user_id::text, 0)) then
    return pg_catalog.jsonb_build_object('status', 'busy');
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
    first_achieved_at = least(adhdice_record_current.first_achieved_at, excluded.first_achieved_at),
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

revoke all on function public.adhdice_begin_records_reconciliation(jsonb) from public, anon;
revoke all on function public.adhdice_upload_records_reconciliation_chunk(jsonb) from public, anon;
revoke all on function public.adhdice_finalize_records_reconciliation(jsonb) from public, anon;
grant execute on function public.adhdice_begin_records_reconciliation(jsonb) to authenticated;
grant execute on function public.adhdice_upload_records_reconciliation_chunk(jsonb) to authenticated;
grant execute on function public.adhdice_finalize_records_reconciliation(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

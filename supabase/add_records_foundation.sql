begin;

create table if not exists public.adhdice_record_current (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rules_version text not null check (rules_version ~ '^records-v[1-9][0-9]*$'),
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  scope_kind text not null check (scope_kind in ('global', 'task')),
  scope_id text,
  title_snapshot text,
  value bigint not null check (value >= 0),
  unit text not null check (unit in ('tasks', 'steps', 'days', 'seconds', 'sessions', 'occurrences')),
  credited_date date not null,
  period_key text,
  period_start date,
  period_end date,
  candidate_identity text not null check (char_length(candidate_identity) between 1 and 1000),
  first_achieved_at timestamptz not null,
  evidence_fingerprint text not null check (char_length(evidence_fingerprint) between 1 and 200),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  timezone text not null check (char_length(timezone) between 1 and 100),
  logical_day_start time not null,
  recalculated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope_kind = 'global' and scope_id is null) or (scope_kind = 'task' and nullif(btrim(scope_id), '') is not null)),
  check ((period_start is null and period_end is null) or (period_start is not null and period_end is not null and period_end >= period_start))
);

create unique index if not exists adhdice_record_current_owner_scope_uidx
  on public.adhdice_record_current (user_id, rules_version, metric_key, scope_kind, coalesce(scope_id, ''));
create index if not exists adhdice_record_current_owner_idx
  on public.adhdice_record_current (user_id, rules_version, metric_key);

create table if not exists public.adhdice_record_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rules_version text not null check (rules_version ~ '^records-v[1-9][0-9]*$'),
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  scope_kind text not null check (scope_kind in ('global', 'task')),
  scope_id text,
  title_snapshot text,
  event_kind text not null check (event_kind in ('break', 'tie')),
  value bigint not null check (value >= 0),
  unit text not null check (unit in ('tasks', 'steps', 'days', 'seconds', 'sessions', 'occurrences')),
  credited_date date not null,
  period_key text,
  period_start date,
  period_end date,
  event_identity text not null check (char_length(event_identity) between 1 and 200),
  candidate_identity text not null check (char_length(candidate_identity) between 1 and 1000),
  evidence_fingerprint text not null check (char_length(evidence_fingerprint) between 1 and 200),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  first_qualified_at timestamptz not null,
  first_achieved_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 100),
  logical_day_start time not null,
  validity_state text not null default 'valid' check (validity_state in ('valid', 'invalid', 'superseded')),
  invalidated_at timestamptz,
  invalidation_reason text,
  superseded_by_event_identity text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, rules_version, event_identity),
  check ((scope_kind = 'global' and scope_id is null) or (scope_kind = 'task' and nullif(btrim(scope_id), '') is not null)),
  check ((period_start is null and period_end is null) or (period_start is not null and period_end is not null and period_end >= period_start))
);

create index if not exists adhdice_record_events_owner_history_idx
  on public.adhdice_record_events (user_id, rules_version, validity_state, credited_date desc, created_at desc);
create index if not exists adhdice_record_events_owner_scope_idx
  on public.adhdice_record_events (user_id, metric_key, scope_kind, scope_id);

alter table public.adhdice_record_current enable row level security;
alter table public.adhdice_record_events enable row level security;

drop policy if exists "Users can read their own current records" on public.adhdice_record_current;
create policy "Users can read their own current records" on public.adhdice_record_current
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read their own record events" on public.adhdice_record_events;
create policy "Users can read their own record events" on public.adhdice_record_events
  for select using (auth.uid() = user_id);

revoke all on table public.adhdice_record_current from anon, authenticated;
revoke all on table public.adhdice_record_events from anon, authenticated;
grant select on table public.adhdice_record_current to authenticated;
grant select on table public.adhdice_record_events to authenticated;

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
  v_item jsonb;
  v_current_count integer := 0;
  v_event_count integer := 0;
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
  exception when others then
    raise exception 'Invalid Records evaluation timestamp.' using errcode = '22023';
  end;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('adhdice:records:' || v_user_id::text, 0));

  delete from public.adhdice_record_current where user_id = v_user_id and rules_version = v_rules_version;
  for v_item in select value from jsonb_array_elements(p_payload->'current_records') loop
    if jsonb_typeof(v_item) <> 'object'
      or coalesce(v_item->>'metric_key', '') !~ '^[a-z][a-z0-9_]{2,79}$'
      or coalesce(v_item->>'scope_kind', '') not in ('global', 'task')
      or coalesce(v_item->>'unit', '') not in ('tasks', 'steps', 'days', 'seconds', 'sessions', 'occurrences')
      or jsonb_typeof(v_item->'evidence_snapshot') <> 'object'
      or coalesce(v_item->>'candidate_identity', '') = '' then
      raise exception 'Invalid current Record entry.' using errcode = '22023';
    end if;
    insert into public.adhdice_record_current (
      user_id, rules_version, metric_key, scope_kind, scope_id, title_snapshot, value, unit,
      credited_date, period_key, period_start, period_end, candidate_identity, first_achieved_at,
      evidence_fingerprint, evidence_snapshot, timezone, logical_day_start, recalculated_at
    ) values (
      v_user_id, v_rules_version, v_item->>'metric_key', v_item->>'scope_kind', nullif(v_item->>'scope_id', ''), nullif(v_item->>'title_snapshot', ''),
      (v_item->>'value')::bigint, v_item->>'unit', (v_item->>'credited_date')::date, nullif(v_item->>'period_key', ''),
      nullif(v_item->>'period_start', '')::date, nullif(v_item->>'period_end', '')::date, v_item->>'candidate_identity',
      (v_item->>'first_achieved_at')::timestamptz, v_item->>'evidence_fingerprint', v_item->'evidence_snapshot', v_timezone, v_day_start::time, v_evaluated_at
    );
    v_current_count := v_current_count + 1;
  end loop;

  update public.adhdice_record_events set
    validity_state = 'invalid', invalidated_at = v_evaluated_at,
    invalidation_reason = 'absent_from_complete_recalculation', updated_at = now()
  where user_id = v_user_id and rules_version = v_rules_version and validity_state = 'valid';

  for v_item in select value from jsonb_array_elements(p_payload->'events') loop
    if jsonb_typeof(v_item) <> 'object'
      or coalesce(v_item->>'metric_key', '') !~ '^[a-z][a-z0-9_]{2,79}$'
      or coalesce(v_item->>'scope_kind', '') not in ('global', 'task')
      or coalesce(v_item->>'event_kind', '') not in ('break', 'tie')
      or coalesce(v_item->>'unit', '') not in ('tasks', 'steps', 'days', 'seconds', 'sessions', 'occurrences')
      or jsonb_typeof(v_item->'evidence_snapshot') <> 'object'
      or coalesce(v_item->>'event_identity', '') = '' then
      raise exception 'Invalid Record event entry.' using errcode = '22023';
    end if;
    insert into public.adhdice_record_events (
      user_id, rules_version, metric_key, scope_kind, scope_id, title_snapshot, event_kind, value, unit,
      credited_date, period_key, period_start, period_end, event_identity, candidate_identity,
      evidence_fingerprint, evidence_snapshot, first_qualified_at, first_achieved_at,
      timezone, logical_day_start, validity_state
    ) values (
      v_user_id, v_rules_version, v_item->>'metric_key', v_item->>'scope_kind', nullif(v_item->>'scope_id', ''), nullif(v_item->>'title_snapshot', ''),
      v_item->>'event_kind', (v_item->>'value')::bigint, v_item->>'unit', (v_item->>'credited_date')::date,
      nullif(v_item->>'period_key', ''), nullif(v_item->>'period_start', '')::date, nullif(v_item->>'period_end', '')::date,
      v_item->>'event_identity', v_item->>'candidate_identity', v_item->>'evidence_fingerprint', v_item->'evidence_snapshot',
      (v_item->>'first_qualified_at')::timestamptz, (v_item->>'first_achieved_at')::timestamptz,
      v_timezone, v_day_start::time, 'valid'
    ) on conflict (user_id, rules_version, event_identity) do update set
      metric_key = excluded.metric_key, scope_kind = excluded.scope_kind, scope_id = excluded.scope_id,
      title_snapshot = excluded.title_snapshot, event_kind = excluded.event_kind, value = excluded.value, unit = excluded.unit,
      credited_date = excluded.credited_date, period_key = excluded.period_key, period_start = excluded.period_start, period_end = excluded.period_end,
      candidate_identity = excluded.candidate_identity, evidence_fingerprint = excluded.evidence_fingerprint,
      evidence_snapshot = excluded.evidence_snapshot, timezone = excluded.timezone, logical_day_start = excluded.logical_day_start,
      validity_state = 'valid', invalidated_at = null, invalidation_reason = null, superseded_by_event_identity = null, updated_at = now();
    v_event_count := v_event_count + 1;
  end loop;

  return jsonb_build_object('current_count', v_current_count, 'event_count', v_event_count, 'evaluated_at', v_evaluated_at);
end;
$function$;

revoke all on function public.adhdice_reconcile_records(jsonb) from public, anon;
grant execute on function public.adhdice_reconcile_records(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

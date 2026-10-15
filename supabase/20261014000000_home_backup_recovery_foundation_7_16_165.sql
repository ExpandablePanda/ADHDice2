begin;

-- Shared, private recovery storage. Payload access is only available through
-- owner-scoped SECURITY DEFINER functions below.
alter table public.adhdice_home_todo_state
  add column if not exists state_revision bigint not null default 1,
  add column if not exists restore_generation bigint not null default 0;

alter table public.adhdice_home_todo_state
  drop constraint if exists adhdice_home_todo_state_revision_positive,
  add constraint adhdice_home_todo_state_revision_positive check (state_revision > 0),
  drop constraint if exists adhdice_home_todo_state_restore_generation_nonnegative,
  add constraint adhdice_home_todo_state_restore_generation_nonnegative check (restore_generation >= 0);

drop policy if exists "Users can create their own Home todo state" on public.adhdice_home_todo_state;
drop policy if exists "Users can update their own Home todo state" on public.adhdice_home_todo_state;
drop policy if exists "Users can delete their own Home todo state" on public.adhdice_home_todo_state;
revoke insert, update, delete on public.adhdice_home_todo_state from public, anon, authenticated;
grant select on public.adhdice_home_todo_state to authenticated;

create table if not exists public.adhdice_recovery_settings (
  singleton boolean primary key default true check (singleton),
  max_recovery_bytes bigint not null default 52428800 check (max_recovery_bytes > 0),
  warning_recovery_bytes bigint not null default 41943040 check (warning_recovery_bytes >= 0 and warning_recovery_bytes < max_recovery_bytes),
  max_database_bytes bigint not null default 419430400 check (max_database_bytes > 0),
  max_recovery_points integer not null default 10 check (max_recovery_points > 0),
  checkpoint_interval interval not null default interval '4 hours' check (checkpoint_interval > interval '0')
);

insert into public.adhdice_recovery_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.adhdice_recovery_points (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  app_version text not null,
  schema_version integer not null default 1 check (schema_version = 1),
  trigger_type text not null check (trigger_type in ('scheduled', 'manual', 'protected')),
  domain_manifest jsonb not null,
  payload jsonb not null,
  payload_schema_version integer not null default 1 check (payload_schema_version = 1),
  payload_bytes bigint not null check (payload_bytes >= 0),
  checksum_algorithm text not null default 'sha256' check (checksum_algorithm = 'sha256'),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'corrupt')),
  is_protected boolean not null default false,
  protected_at timestamptz,
  protected_reason text,
  constraint adhdice_recovery_points_manifest_object check (jsonb_typeof(domain_manifest) = 'object'),
  constraint adhdice_recovery_points_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint adhdice_recovery_points_protection_metadata check (
    (is_protected and protected_at is not null and nullif(trim(protected_reason), '') is not null)
    or (not is_protected and protected_at is null and protected_reason is null)
  )
);

create index if not exists adhdice_recovery_points_owner_created_idx
  on public.adhdice_recovery_points (owner_id, created_at desc, id desc);
create index if not exists adhdice_recovery_points_owner_retention_idx
  on public.adhdice_recovery_points (owner_id, created_at, id)
  where not is_protected;

create table if not exists public.adhdice_recovery_status (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  last_attempt_at timestamptz,
  last_attempt_trigger text check (last_attempt_trigger in ('scheduled', 'manual', 'protected')),
  last_attempt_result text check (last_attempt_result in ('created', 'unchanged', 'failed', 'not_due', 'no_state')),
  last_failure_at timestamptz,
  last_failure_reason text,
  last_scheduled_attempt_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.adhdice_recovery_settings enable row level security;
alter table public.adhdice_recovery_points enable row level security;
alter table public.adhdice_recovery_status enable row level security;
revoke all on public.adhdice_recovery_settings, public.adhdice_recovery_points, public.adhdice_recovery_status
  from public, anon, authenticated, service_role;

create or replace function public.adhdice_home_recovery_state_compatible(p_state jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
  v_schema integer;
  v_key text;
begin
  if jsonb_typeof(p_state) is distinct from 'object'
     or jsonb_typeof(p_state->'taskIds') is distinct from 'array'
     or coalesce(p_state->>'schemaVersion', '') !~ '^[1-8]$' then
    return false;
  end if;
  v_schema := (p_state->>'schemaVersion')::integer;
  if v_schema < 1 or v_schema > 8 then return false; end if;
  if p_state ? 'clientUpdatedAt' and jsonb_typeof(p_state->'clientUpdatedAt') is distinct from 'string' then
    return false;
  end if;

  foreach v_key in array array['taskIds', 'urgentTaskIds', 'routineTaskIds'] loop
    if p_state ? v_key then
      if jsonb_typeof(p_state->v_key) is distinct from 'array' then return false; end if;
      if exists (
        select 1
        from jsonb_array_elements(p_state->v_key) as item(value)
        where jsonb_typeof(item.value) is distinct from 'string'
           or item.value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) then return false; end if;
    end if;
  end loop;

  if p_state ? 'taskDayOffsets' then
    if jsonb_typeof(p_state->'taskDayOffsets') is distinct from 'object'
       or exists (
         select 1 from jsonb_each(p_state->'taskDayOffsets') as entry(key, value)
         where entry.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            or jsonb_typeof(entry.value) is distinct from 'number'
            or (entry.value #>> '{}')::numeric <> trunc((entry.value #>> '{}')::numeric)
            or (entry.value #>> '{}')::numeric < 0
            or (entry.value #>> '{}')::numeric > 7
       ) then return false; end if;
  end if;
  if p_state ? 'routineSectionIdByTaskId' then
    if jsonb_typeof(p_state->'routineSectionIdByTaskId') is distinct from 'object'
       or exists (
         select 1 from jsonb_each(p_state->'routineSectionIdByTaskId') as entry(key, value)
         where entry.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            or jsonb_typeof(entry.value) is distinct from 'string'
       ) then return false; end if;
  end if;

  if p_state ? 'routineSections' and jsonb_typeof(p_state->'routineSections') is distinct from 'array' then
    return false;
  end if;
  if p_state ? 'routineSections' and exists (
    select 1
    from jsonb_array_elements(p_state->'routineSections') as section(value)
    where jsonb_typeof(section.value) is distinct from 'object'
       or jsonb_typeof(section.value->'id') is distinct from 'string'
       or jsonb_typeof(section.value->'name') is distinct from 'string'
  ) then return false; end if;
  if p_state ? 'scratchpadItems' and jsonb_typeof(p_state->'scratchpadItems') is distinct from 'array' then
    return false;
  end if;
  if p_state ? 'scratchpadItems' and exists (
    select 1
    from jsonb_array_elements(p_state->'scratchpadItems') as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
       or jsonb_typeof(item.value->'id') is distinct from 'string'
       or jsonb_typeof(item.value->'text') is distinct from 'string'
       or jsonb_typeof(item.value->'createdAt') is distinct from 'string'
  ) then return false; end if;
  if p_state ? 'scratchpadText' and jsonb_typeof(p_state->'scratchpadText') is distinct from 'string' then
    return false;
  end if;
  if p_state ? 'tasksPerDay' and jsonb_typeof(p_state->'tasksPerDay') is distinct from 'number' then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$function$;

create or replace function public.adhdice_home_recovery_payload_valid(p_payload jsonb, p_manifest jsonb, p_payload_schema_version integer)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $function$
  select coalesce(p_payload_schema_version = 1
    and jsonb_typeof(p_payload) = 'object'
    and jsonb_typeof(p_manifest) = 'object'
    and p_manifest ? 'homeTodo'
    and jsonb_typeof(p_manifest->'homeTodo') = 'object'
    and p_manifest->'homeTodo'->>'schemaVersion' ~ '^[1-8]$'
    and p_payload ? 'homeTodo'
    and jsonb_typeof(p_payload->'homeTodo') = 'object'
    and p_payload->'homeTodo' ? 'state'
    and p_manifest->'homeTodo'->>'schemaVersion' = p_payload->'homeTodo'->'state'->>'schemaVersion'
    and public.adhdice_home_recovery_state_compatible(p_payload->'homeTodo'->'state'), false);
$function$;

create or replace function public.adhdice_home_recovery_point_integrity_valid(
  p_payload jsonb,
  p_manifest jsonb,
  p_payload_schema_version integer,
  p_payload_bytes bigint,
  p_checksum text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $function$
  select coalesce(public.adhdice_home_recovery_payload_valid(p_payload, p_manifest, p_payload_schema_version)
    and p_payload_bytes = octet_length(convert_to(p_payload::text, 'UTF8'))
    and p_checksum = encode(pg_catalog.sha256(convert_to(p_payload::text, 'UTF8')), 'hex'), false);
$function$;

create or replace function public.adhdice_home_recovery_missing_task_ids(p_owner_id uuid, p_state jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with referenced(task_id) as (
    select value #>> '{}'
    from jsonb_array_elements(coalesce(p_state->'taskIds', '[]'::jsonb))
    union
    select value #>> '{}'
    from jsonb_array_elements(coalesce(p_state->'urgentTaskIds', '[]'::jsonb))
    union
    select value #>> '{}'
    from jsonb_array_elements(coalesce(p_state->'routineTaskIds', '[]'::jsonb))
    union
    select key
    from jsonb_each(coalesce(p_state->'taskDayOffsets', '{}'::jsonb))
    union
    select key
    from jsonb_each(coalesce(p_state->'routineSectionIdByTaskId', '{}'::jsonb))
  )
  select coalesce(jsonb_agg(to_jsonb(missing.task_id) order by missing.task_id), '[]'::jsonb)
  from (
    select distinct referenced.task_id
    from referenced
    left join public.adhdice_clean_tasks task
      on task.id = referenced.task_id::uuid
     and task.user_id = p_owner_id
    where task.id is null
  ) missing;
$function$;

create or replace function public.adhdice_home_recovery_record_attempt(
  p_owner_id uuid,
  p_trigger text,
  p_result text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
begin
  insert into public.adhdice_recovery_status (
    owner_id, last_attempt_at, last_attempt_trigger, last_attempt_result,
    last_failure_at, last_failure_reason, last_scheduled_attempt_at, updated_at
  )
  values (
    p_owner_id, v_now, p_trigger, p_result,
    case when p_result = 'failed' then v_now end,
    case when p_result = 'failed' then left(coalesce(p_reason, 'unspecified failure'), 500) end,
    case when p_trigger = 'scheduled' then v_now end,
    v_now
  )
  on conflict (owner_id) do update
  set last_attempt_at = excluded.last_attempt_at,
      last_attempt_trigger = excluded.last_attempt_trigger,
      last_attempt_result = excluded.last_attempt_result,
      last_failure_at = case when excluded.last_attempt_result = 'failed' then excluded.last_failure_at else public.adhdice_recovery_status.last_failure_at end,
      last_failure_reason = case when excluded.last_attempt_result = 'failed' then excluded.last_failure_reason else public.adhdice_recovery_status.last_failure_reason end,
      last_scheduled_attempt_at = case when excluded.last_attempt_trigger = 'scheduled' then excluded.last_scheduled_attempt_at else public.adhdice_recovery_status.last_scheduled_attempt_at end,
      updated_at = excluded.updated_at;
end;
$function$;

create or replace function public.adhdice_home_recovery_checkpoint_due(p_owner_id uuid, p_at timestamptz default clock_timestamp())
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(status.last_scheduled_attempt_at <= p_at - settings.checkpoint_interval, true)
  from public.adhdice_recovery_settings settings
  left join public.adhdice_recovery_status status on status.owner_id = p_owner_id
  where settings.singleton;
$function$;

create or replace function public.adhdice_capture_home_recovery_point(
  p_owner_id uuid,
  p_trigger text,
  p_app_version text default '7.16.165',
  p_protected_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_state jsonb;
  v_point public.adhdice_recovery_points%rowtype;
  v_previous public.adhdice_recovery_points%rowtype;
  v_settings public.adhdice_recovery_settings%rowtype;
  v_manifest jsonb;
  v_payload jsonb;
  v_checksum text;
  v_payload_bytes bigint;
  v_table_bytes bigint;
  v_database_bytes bigint;
  v_retire_id uuid;
  v_reason text;
  v_now timestamptz := clock_timestamp();
begin
  begin
    if p_trigger not in ('scheduled', 'manual', 'protected') then
      raise exception 'unsupported_trigger';
    end if;
    if p_app_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
      raise exception 'invalid_app_version';
    end if;
    if p_trigger = 'protected' and nullif(trim(p_protected_reason), '') is null then
      raise exception 'protected_reason_required';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(731655, 1);
    perform pg_catalog.pg_advisory_xact_lock(731655, hashtext(p_owner_id::text));
    select * into strict v_settings from public.adhdice_recovery_settings where singleton;

    if p_trigger = 'scheduled'
       and not public.adhdice_home_recovery_checkpoint_due(p_owner_id, v_now) then
      perform public.adhdice_home_recovery_record_attempt(p_owner_id, p_trigger, 'not_due');
      return jsonb_build_object('status', 'not_due');
    end if;

    select state into v_state
    from public.adhdice_home_todo_state
    where user_id = p_owner_id
    for share;
    if not found then
      perform public.adhdice_home_recovery_record_attempt(p_owner_id, p_trigger, 'no_state', 'No authoritative Home Todo state exists.');
      return jsonb_build_object('status', 'no_state');
    end if;
    if not public.adhdice_home_recovery_state_compatible(v_state) then
      raise exception 'invalid_home_state_schema';
    end if;

    v_manifest := jsonb_build_object('homeTodo', jsonb_build_object('schemaVersion', (v_state->>'schemaVersion')::integer));
    v_payload := jsonb_build_object('homeTodo', jsonb_build_object('state', v_state));
    v_payload_bytes := octet_length(convert_to(v_payload::text, 'UTF8'));
    v_checksum := encode(pg_catalog.sha256(convert_to(v_payload::text, 'UTF8')), 'hex');

    select * into v_previous
    from public.adhdice_recovery_points point
    where point.owner_id = p_owner_id
      and point.verification_status = 'verified'
      and point.schema_version = 1
      and point.domain_manifest ? 'homeTodo'
    order by point.created_at desc, point.id desc
    limit 1;
    if found
       and public.adhdice_home_recovery_point_integrity_valid(
         v_previous.payload, v_previous.domain_manifest, v_previous.payload_schema_version,
         v_previous.payload_bytes, v_previous.checksum
       )
       and v_previous.payload->'homeTodo'->'state' = v_state then
      if p_trigger = 'protected' and not v_previous.is_protected then
        update public.adhdice_recovery_points
          set is_protected = true, protected_at = v_now,
              protected_reason = left(trim(p_protected_reason), 200)
          where id = v_previous.id and owner_id = p_owner_id;
      end if;
      perform public.adhdice_home_recovery_record_attempt(p_owner_id, p_trigger, 'unchanged');
      return jsonb_build_object(
        'status', 'unchanged',
        'recovery_point_id', v_previous.id,
        'is_protected', p_trigger = 'protected' or v_previous.is_protected
      );
    end if;

    select pg_catalog.pg_database_size(current_database()) into v_database_bytes;
    if v_database_bytes >= v_settings.max_database_bytes then
      raise exception 'database_capacity_reached';
    end if;

    insert into public.adhdice_recovery_points (
      owner_id, app_version, schema_version, trigger_type, domain_manifest,
      payload, payload_schema_version, payload_bytes, checksum_algorithm,
      checksum, verification_status, is_protected, protected_at, protected_reason
    )
    values (
      p_owner_id, p_app_version, 1, p_trigger, v_manifest,
      v_payload, 1, v_payload_bytes, 'sha256',
      v_checksum, 'pending', p_trigger = 'protected',
      case when p_trigger = 'protected' then v_now end,
      case when p_trigger = 'protected' then left(trim(p_protected_reason), 200) end
    )
    returning * into v_point;

    if not public.adhdice_home_recovery_point_integrity_valid(
      v_point.payload, v_point.domain_manifest, v_point.payload_schema_version,
      v_point.payload_bytes, v_point.checksum
    ) then
      raise exception 'snapshot_verification_failed';
    end if;
    update public.adhdice_recovery_points
      set verification_status = 'verified'
      where id = v_point.id and owner_id = p_owner_id;

    loop
      exit when (select count(*) from public.adhdice_recovery_points where owner_id = p_owner_id)
        <= v_settings.max_recovery_points;
      select id into v_retire_id
      from public.adhdice_recovery_points
      where owner_id = p_owner_id and id <> v_point.id and not is_protected
      order by created_at, id
      for update skip locked
      limit 1;
      if v_retire_id is null then
        raise exception 'retention_blocked_by_protected_points';
      end if;
      delete from public.adhdice_recovery_points where id = v_retire_id and owner_id = p_owner_id;
      v_retire_id := null;
    end loop;

    select pg_catalog.pg_total_relation_size('public.adhdice_recovery_points'::regclass)
      into v_table_bytes;
    if v_table_bytes > v_settings.max_recovery_bytes then
      raise exception 'recovery_storage_limit_reached';
    end if;
    select pg_catalog.pg_database_size(current_database()) into v_database_bytes;
    if v_database_bytes >= v_settings.max_database_bytes then
      raise exception 'database_capacity_reached';
    end if;

    perform public.adhdice_home_recovery_record_attempt(p_owner_id, p_trigger, 'created');
    return jsonb_build_object(
      'status', 'created',
      'recovery_point_id', v_point.id,
      'payload_bytes', v_payload_bytes,
      'recovery_table_bytes', v_table_bytes,
      'database_bytes', v_database_bytes
    );
  exception when others then
    -- Preserve the previous valid point and record only a bounded failure reason.
    v_reason := sqlerrm;
    perform public.adhdice_home_recovery_record_attempt(
      p_owner_id, p_trigger, 'failed',
      case when v_reason = '' then 'capture_failed' else v_reason end
    );
    return jsonb_build_object('status', 'failed', 'reason', left(v_reason, 500));
  end;
end;
$function$;

create or replace function public.save_home_todo_state(
  p_state jsonb,
  p_client_updated_at timestamptz,
  p_expected_restore_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid := auth.uid();
  v_current public.adhdice_home_todo_state%rowtype;
  v_saved public.adhdice_home_todo_state%rowtype;
begin
  if v_owner_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_expected_restore_generation is null or not public.adhdice_home_recovery_state_compatible(p_state) then
    raise exception 'invalid_home_state' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(731655, hashtext(v_owner_id::text));
  select * into v_current
  from public.adhdice_home_todo_state
  where user_id = v_owner_id
  for update;
  if found then
    if v_current.restore_generation <> p_expected_restore_generation then
      return jsonb_build_object(
        'status', 'restore_conflict',
        'state', v_current.state,
        'client_updated_at', v_current.client_updated_at,
        'state_revision', v_current.state_revision,
        'restore_generation', v_current.restore_generation
      );
    end if;
    update public.adhdice_home_todo_state
      set state = p_state,
          client_updated_at = p_client_updated_at,
          state_revision = state_revision + 1,
          updated_at = clock_timestamp()
      where user_id = v_owner_id
      returning * into v_saved;
  else
    if p_expected_restore_generation <> 0 then
      return jsonb_build_object('status', 'restore_conflict', 'state', null, 'state_revision', null, 'restore_generation', 0);
    end if;
    insert into public.adhdice_home_todo_state (
      user_id, state, client_updated_at, state_revision, restore_generation, updated_at
    )
    values (v_owner_id, p_state, p_client_updated_at, 1, 0, clock_timestamp())
    returning * into v_saved;
  end if;
  return jsonb_build_object(
    'status', 'saved',
    'state', v_saved.state,
    'client_updated_at', v_saved.client_updated_at,
    'state_revision', v_saved.state_revision,
    'restore_generation', v_saved.restore_generation
  );
end;
$function$;

create or replace function public.create_home_recovery_point(p_app_version text default '7.16.165')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  return public.adhdice_capture_home_recovery_point(v_owner_id, 'manual', p_app_version);
end;
$function$;

create or replace function public.list_home_recovery_points(p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', point.id,
      'created_at', point.created_at,
      'app_version', point.app_version,
      'schema_version', point.schema_version,
      'trigger_type', point.trigger_type,
      'domain_manifest', point.domain_manifest,
      'payload_schema_version', point.payload_schema_version,
      'payload_bytes', point.payload_bytes,
      'checksum_algorithm', point.checksum_algorithm,
      'verification_status', point.verification_status,
      'is_protected', point.is_protected,
      'protected_at', point.protected_at,
      'protected_reason', point.protected_reason
    ) order by point.created_at desc, point.id desc)
    from (
      select *
      from public.adhdice_recovery_points
      where owner_id = v_owner_id
      order by created_at desc, id desc
      limit greatest(1, least(coalesce(p_limit, 10), 10))
    ) point
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.preview_home_recovery_point(p_recovery_point_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid := auth.uid();
  v_point public.adhdice_recovery_points%rowtype;
  v_current public.adhdice_home_todo_state%rowtype;
  v_integrity_valid boolean;
  v_compatible boolean;
  v_missing_task_ids jsonb := '[]'::jsonb;
begin
  if v_owner_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_point
  from public.adhdice_recovery_points
  where id = p_recovery_point_id and owner_id = v_owner_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  v_integrity_valid := public.adhdice_home_recovery_point_integrity_valid(
    v_point.payload, v_point.domain_manifest, v_point.payload_schema_version,
    v_point.payload_bytes, v_point.checksum
  );
  v_compatible := v_point.schema_version = 1
    and v_point.verification_status = 'verified'
    and v_integrity_valid
    and v_point.domain_manifest->'homeTodo'->>'schemaVersion' ~ '^[1-8]$';
  if v_compatible then
    v_missing_task_ids := public.adhdice_home_recovery_missing_task_ids(
      v_owner_id, v_point.payload->'homeTodo'->'state'
    );
  end if;
  select * into v_current from public.adhdice_home_todo_state where user_id = v_owner_id;
  return jsonb_build_object(
    'status', 'preview',
    'id', v_point.id,
    'created_at', v_point.created_at,
    'app_version', v_point.app_version,
    'schema_version', v_point.schema_version,
    'trigger_type', v_point.trigger_type,
    'domain_manifest', v_point.domain_manifest,
    'payload_bytes', v_point.payload_bytes,
    'verification_status', v_point.verification_status,
    'is_protected', v_point.is_protected,
    'integrity_valid', v_integrity_valid,
    'schema_compatible', v_compatible,
    'home_state', case when v_integrity_valid then v_point.payload->'homeTodo'->'state' else null end,
    'missing_task_ids', v_missing_task_ids,
    'restorable', v_compatible and jsonb_array_length(v_missing_task_ids) = 0,
    'current_state_revision', v_current.state_revision,
    'current_restore_generation', coalesce(v_current.restore_generation, 0),
    'current_client_updated_at', v_current.client_updated_at
  );
end;
$function$;

create or replace function public.restore_home_recovery_point(
  p_recovery_point_id uuid,
  p_expected_state_revision bigint,
  p_expected_restore_generation bigint,
  p_confirm_restore boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid := auth.uid();
  v_current public.adhdice_home_todo_state%rowtype;
  v_point public.adhdice_recovery_points%rowtype;
  v_missing_task_ids jsonb;
  v_restore_time timestamptz := clock_timestamp();
  v_restored_state jsonb;
  v_pre_restore jsonb;
  v_saved public.adhdice_home_todo_state%rowtype;
begin
  if v_owner_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_confirm_restore is distinct from true then
    return jsonb_build_object('status', 'confirmation_required');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(731655, 1);
  perform pg_catalog.pg_advisory_xact_lock(731655, hashtext(v_owner_id::text));

  select * into v_current
  from public.adhdice_home_todo_state
  where user_id = v_owner_id
  for update;
  if found then
    if p_expected_state_revision is distinct from v_current.state_revision
       or p_expected_restore_generation is distinct from v_current.restore_generation then
      return jsonb_build_object(
        'status', 'restore_conflict',
        'current_state_revision', v_current.state_revision,
        'current_restore_generation', v_current.restore_generation,
        'current_client_updated_at', v_current.client_updated_at
      );
    end if;
  elsif p_expected_state_revision is not null or coalesce(p_expected_restore_generation, 0) <> 0 then
    return jsonb_build_object(
      'status', 'restore_conflict',
      'current_state_revision', null,
      'current_restore_generation', 0
    );
  end if;

  select * into v_point
  from public.adhdice_recovery_points
  where id = p_recovery_point_id and owner_id = v_owner_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_point.schema_version <> 1
     or v_point.verification_status <> 'verified'
     or not public.adhdice_home_recovery_point_integrity_valid(
       v_point.payload, v_point.domain_manifest, v_point.payload_schema_version,
       v_point.payload_bytes, v_point.checksum
     ) then
    return jsonb_build_object('status', 'invalid_recovery_point');
  end if;

  v_missing_task_ids := public.adhdice_home_recovery_missing_task_ids(
    v_owner_id, v_point.payload->'homeTodo'->'state'
  );
  if jsonb_array_length(v_missing_task_ids) > 0 then
    return jsonb_build_object('status', 'missing_task_references', 'missing_task_ids', v_missing_task_ids);
  end if;

  if v_current.user_id is not null then
    v_pre_restore := public.adhdice_capture_home_recovery_point(
      v_owner_id, 'protected', '7.16.165', 'pre_restore'
    );
  end if;

  v_restored_state := jsonb_set(
    v_point.payload->'homeTodo'->'state',
    '{clientUpdatedAt}',
    to_jsonb(v_restore_time::text),
    true
  );
  if v_current.user_id is not null then
    update public.adhdice_home_todo_state
      set state = v_restored_state,
          client_updated_at = v_restore_time,
          state_revision = state_revision + 1,
          restore_generation = restore_generation + 1,
          updated_at = v_restore_time
      where user_id = v_owner_id
      returning * into v_saved;
  else
    insert into public.adhdice_home_todo_state (
      user_id, state, client_updated_at, state_revision, restore_generation, updated_at
    )
    values (v_owner_id, v_restored_state, v_restore_time, 1, 1, v_restore_time)
    returning * into v_saved;
  end if;
  return jsonb_build_object(
    'status', 'restored',
    'state', v_saved.state,
    'client_updated_at', v_saved.client_updated_at,
    'state_revision', v_saved.state_revision,
    'restore_generation', v_saved.restore_generation,
    'pre_restore_checkpoint', coalesce(v_pre_restore, jsonb_build_object('status', 'not_available'))
  );
end;
$function$;

create or replace function public.home_recovery_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid := auth.uid();
  v_settings public.adhdice_recovery_settings%rowtype;
  v_status public.adhdice_recovery_status%rowtype;
  v_recovery_bytes bigint;
  v_database_bytes bigint;
begin
  if v_owner_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into strict v_settings from public.adhdice_recovery_settings where singleton;
  select * into v_status from public.adhdice_recovery_status where owner_id = v_owner_id;
  select pg_catalog.pg_total_relation_size('public.adhdice_recovery_points'::regclass) into v_recovery_bytes;
  select pg_catalog.pg_database_size(current_database()) into v_database_bytes;
  return jsonb_build_object(
    'recovery_storage_bytes', v_recovery_bytes,
    'recovery_warning_bytes', v_settings.warning_recovery_bytes,
    'recovery_limit_bytes', v_settings.max_recovery_bytes,
    'recovery_warning', v_recovery_bytes >= v_settings.warning_recovery_bytes,
    'recovery_capacity_exhausted', v_recovery_bytes >= v_settings.max_recovery_bytes,
    'database_bytes', v_database_bytes,
    'database_capture_suspended', v_database_bytes >= v_settings.max_database_bytes,
    'database_limit_bytes', v_settings.max_database_bytes,
    'recovery_point_count', (select count(*) from public.adhdice_recovery_points where owner_id = v_owner_id),
    'max_recovery_points', v_settings.max_recovery_points,
    'latest_successful_point_at', (
      select max(created_at) from public.adhdice_recovery_points
      where owner_id = v_owner_id and verification_status = 'verified'
    ),
    'latest_attempt_at', v_status.last_attempt_at,
    'latest_attempt_trigger', v_status.last_attempt_trigger,
    'latest_attempt_result', v_status.last_attempt_result,
    'latest_failure_at', v_status.last_failure_at,
    'latest_failure_reason', v_status.last_failure_reason,
    'last_scheduled_attempt_at', v_status.last_scheduled_attempt_at
  );
end;
$function$;

create or replace function public.run_home_recovery_checkpoint_cycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid;
  v_result jsonb;
  v_created integer := 0;
  v_unchanged integer := 0;
  v_failed integer := 0;
  v_started_at timestamptz := clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(731655, 1);
  for v_owner_id in
    select user_id from public.adhdice_home_todo_state order by user_id
  loop
    if not public.adhdice_home_recovery_checkpoint_due(v_owner_id, v_started_at) then
      continue;
    end if;
    v_result := public.adhdice_capture_home_recovery_point(v_owner_id, 'scheduled', '7.16.165');
    case v_result->>'status'
      when 'created' then v_created := v_created + 1;
      when 'unchanged' then v_unchanged := v_unchanged + 1;
      else v_failed := v_failed + 1;
    end case;
  end loop;
  return jsonb_build_object(
    'started_at', v_started_at,
    'created', v_created,
    'unchanged', v_unchanged,
    'failed', v_failed
  );
end;
$function$;

revoke all on function public.adhdice_home_recovery_state_compatible(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.adhdice_home_recovery_payload_valid(jsonb, jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.adhdice_home_recovery_point_integrity_valid(jsonb, jsonb, integer, bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.adhdice_home_recovery_missing_task_ids(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.adhdice_home_recovery_record_attempt(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.adhdice_home_recovery_checkpoint_due(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.adhdice_capture_home_recovery_point(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.run_home_recovery_checkpoint_cycle() from public, anon, authenticated, service_role;
revoke all on function public.save_home_todo_state(jsonb, timestamptz, bigint) from public, anon;
revoke all on function public.create_home_recovery_point(text) from public, anon;
revoke all on function public.list_home_recovery_points(integer) from public, anon;
revoke all on function public.preview_home_recovery_point(uuid) from public, anon;
revoke all on function public.restore_home_recovery_point(uuid, bigint, bigint, boolean) from public, anon;
revoke all on function public.home_recovery_status() from public, anon;

grant execute on function public.save_home_todo_state(jsonb, timestamptz, bigint) to authenticated;
grant execute on function public.create_home_recovery_point(text) to authenticated;
grant execute on function public.list_home_recovery_points(integer) to authenticated;
grant execute on function public.preview_home_recovery_point(uuid) to authenticated;
grant execute on function public.restore_home_recovery_point(uuid, bigint, bigint, boolean) to authenticated;
grant execute on function public.home_recovery_status() to authenticated;

notify pgrst, 'reload schema';
commit;

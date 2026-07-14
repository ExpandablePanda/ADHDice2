begin;

create table if not exists public.adhdice_focus_counters (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  color text not null,
  icon text not null,
  value bigint not null default 0,
  step bigint not null check (step > 0),
  goal bigint not null check (goal > 0),
  sort_order bigint not null,
  revision bigint not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adhdice_focus_counter_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  counter_id uuid not null references public.adhdice_focus_counters(id),
  event_type text not null check (event_type in ('create', 'adjust', 'set_value', 'update', 'delete', 'migrate')),
  delta bigint,
  previous_value bigint,
  next_value bigint,
  title_snapshot text,
  step_snapshot bigint,
  payload jsonb,
  client_created_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, operation_id)
);

create table if not exists public.adhdice_focus_counter_migrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_installation_id uuid not null,
  migration_batch_id uuid not null,
  submitted_snapshot jsonb not null,
  status text not null check (status in ('processing', 'migrated', 'server_adopted')),
  local_differed boolean not null default false,
  result_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_installation_id, migration_batch_id)
);

create index if not exists adhdice_focus_counters_active_order_idx
  on public.adhdice_focus_counters (user_id, deleted_at, sort_order, id);
create index if not exists adhdice_focus_counter_events_counter_created_idx
  on public.adhdice_focus_counter_events (user_id, counter_id, created_at desc);
create unique index if not exists adhdice_focus_counter_events_operation_unique
  on public.adhdice_focus_counter_events (user_id, operation_id);
create unique index if not exists adhdice_focus_counter_migrations_batch_unique
  on public.adhdice_focus_counter_migrations (user_id, device_installation_id, migration_batch_id);

alter table public.adhdice_focus_counters enable row level security;
alter table public.adhdice_focus_counter_events enable row level security;
alter table public.adhdice_focus_counter_migrations enable row level security;

drop policy if exists "Users can read their own Focus counters" on public.adhdice_focus_counters;
create policy "Users can read their own Focus counters"
  on public.adhdice_focus_counters for select using (auth.uid() = user_id);
drop policy if exists "Users can read their own Focus counter events" on public.adhdice_focus_counter_events;
create policy "Users can read their own Focus counter events"
  on public.adhdice_focus_counter_events for select using (auth.uid() = user_id);
drop policy if exists "Users can read their own Focus counter migrations" on public.adhdice_focus_counter_migrations;
create policy "Users can read their own Focus counter migrations"
  on public.adhdice_focus_counter_migrations for select using (auth.uid() = user_id);

revoke all on public.adhdice_focus_counters from anon, authenticated;
revoke all on public.adhdice_focus_counter_events from anon, authenticated;
revoke all on public.adhdice_focus_counter_migrations from anon, authenticated;
grant select on public.adhdice_focus_counters to authenticated;
grant select on public.adhdice_focus_counter_events to authenticated;
grant select on public.adhdice_focus_counter_migrations to authenticated;

create or replace function public.adhdice_mutate_focus_counter(
  p_operation_id uuid,
  p_counter_id uuid,
  p_expected_revision bigint,
  p_action text,
  p_action_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_counter public.adhdice_focus_counters%rowtype;
  v_event public.adhdice_focus_counter_events%rowtype;
  v_previous_value bigint;
  v_delta bigint;
  v_event_type text;
  v_sort_order bigint;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null or p_action not in ('create', 'adjust', 'set_value', 'update', 'delete') then
    raise exception 'Invalid Focus counter mutation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));
  select * into v_event
  from public.adhdice_focus_counter_events
  where user_id = v_user_id and operation_id = p_operation_id;
  if found then
    return jsonb_build_object(
      'ok', true,
      'was_replayed', true,
      'counter', v_event.payload -> 'result_counter',
      'event', to_jsonb(v_event)
    );
  end if;

  if p_counter_id is null then raise exception 'Counter ID required'; end if;

  if p_action = 'create' then
    select coalesce(min(sort_order), 0) - 1 into v_sort_order
    from public.adhdice_focus_counters where user_id = v_user_id and deleted_at is null;
    begin
      insert into public.adhdice_focus_counters (
        id, user_id, title, color, icon, value, step, goal, sort_order
      ) values (
        p_counter_id,
        v_user_id,
        coalesce(nullif(btrim(p_action_payload ->> 'title'), ''), 'Counter'),
        coalesce(nullif(btrim(p_action_payload ->> 'color'), ''), '#6f57f6'),
        coalesce(nullif(btrim(p_action_payload ->> 'icon'), ''), 'Hash'),
        coalesce((p_action_payload ->> 'value')::bigint, 0),
        greatest(1, coalesce((p_action_payload ->> 'step')::bigint, 1)),
        greatest(1, coalesce((p_action_payload ->> 'goal')::bigint, 10)),
        v_sort_order
      ) returning * into v_counter;
    exception when unique_violation then
      select * into v_counter from public.adhdice_focus_counters
      where user_id = v_user_id and id = p_counter_id;
      if not found then raise; end if;
      return jsonb_build_object('ok', false, 'conflict', true, 'counter', to_jsonb(v_counter));
    end;
    v_previous_value := 0;
    v_delta := v_counter.value;
    v_event_type := 'create';
  else
    select * into v_counter from public.adhdice_focus_counters
    where user_id = v_user_id and id = p_counter_id for update;
    if not found or v_counter.deleted_at is not null then
      return jsonb_build_object('ok', false, 'conflict', true, 'counter', null);
    end if;
    v_previous_value := v_counter.value;

    if p_action = 'adjust' then
      if coalesce((p_action_payload ->> 'direction')::integer, 0) not in (-1, 1) then
        raise exception 'Focus counter direction must be -1 or 1';
      end if;
      v_delta := v_counter.step * (p_action_payload ->> 'direction')::integer;
      update public.adhdice_focus_counters
      set value = value + v_delta, revision = revision + 1, updated_at = statement_timestamp()
      where id = v_counter.id returning * into v_counter;
      v_event_type := 'adjust';
    elsif p_action in ('set_value', 'update') then
      if p_expected_revision is null or p_expected_revision <> v_counter.revision then
        return jsonb_build_object('ok', false, 'conflict', true, 'counter', to_jsonb(v_counter));
      end if;
      update public.adhdice_focus_counters
      set
        title = case when p_action_payload ? 'title' then coalesce(nullif(btrim(p_action_payload ->> 'title'), ''), title) else title end,
        color = case when p_action_payload ? 'color' then coalesce(nullif(btrim(p_action_payload ->> 'color'), ''), color) else color end,
        icon = case when p_action_payload ? 'icon' then coalesce(nullif(btrim(p_action_payload ->> 'icon'), ''), icon) else icon end,
        step = case when p_action_payload ? 'step' then greatest(1, (p_action_payload ->> 'step')::bigint) else step end,
        goal = case when p_action_payload ? 'goal' then greatest(1, (p_action_payload ->> 'goal')::bigint) else goal end,
        value = case when p_action_payload ? 'value' then (p_action_payload ->> 'value')::bigint else value end,
        revision = revision + 1,
        updated_at = statement_timestamp()
      where id = v_counter.id returning * into v_counter;
      v_delta := v_counter.value - v_previous_value;
      v_event_type := case when p_action = 'set_value' or p_action_payload ? 'value' then 'set_value' else 'update' end;
    elsif p_action = 'delete' then
      if p_expected_revision is null or p_expected_revision <> v_counter.revision then
        return jsonb_build_object('ok', false, 'conflict', true, 'counter', to_jsonb(v_counter));
      end if;
      update public.adhdice_focus_counters
      set deleted_at = statement_timestamp(), revision = revision + 1, updated_at = statement_timestamp()
      where id = v_counter.id returning * into v_counter;
      v_delta := null;
      v_event_type := 'delete';
    end if;
  end if;

  insert into public.adhdice_focus_counter_events (
    operation_id, user_id, counter_id, event_type, delta, previous_value, next_value,
    title_snapshot, step_snapshot, payload, client_created_at
  ) values (
    p_operation_id, v_user_id, v_counter.id, v_event_type, v_delta,
    case when v_event_type in ('create', 'adjust', 'set_value') then v_previous_value else null end,
    case when v_event_type in ('create', 'adjust', 'set_value') then v_counter.value else null end,
    v_counter.title, v_counter.step,
    jsonb_build_object('request', coalesce(p_action_payload, '{}'::jsonb), 'result_counter', to_jsonb(v_counter)),
    nullif(p_action_payload ->> 'client_created_at', '')::timestamptz
  ) returning * into v_event;

  v_result := jsonb_build_object('ok', true, 'was_replayed', false, 'counter', to_jsonb(v_counter), 'event', to_jsonb(v_event));
  return v_result;
end;
$function$;

create or replace function public.adhdice_migrate_focus_counters(
  p_device_installation_id uuid,
  p_migration_batch_id uuid,
  p_submitted_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_migration public.adhdice_focus_counter_migrations%rowtype;
  v_counter public.adhdice_focus_counters%rowtype;
  v_counter_json jsonb;
  v_history_json jsonb;
  v_ordinality bigint;
  v_counter_count bigint;
  v_legacy_id_map jsonb := '{}'::jsonb;
  v_server_shape jsonb;
  v_local_shape jsonb;
  v_local_differed boolean := false;
  v_status text;
  v_result jsonb;
  v_server_counter_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_device_installation_id is null or p_migration_batch_id is null or p_submitted_snapshot is null then
    raise exception 'Invalid Focus counter migration request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  select * into v_migration from public.adhdice_focus_counter_migrations
  where user_id = v_user_id
    and device_installation_id = p_device_installation_id
    and migration_batch_id = p_migration_batch_id;
  if found and v_migration.result_payload is not null then
    return v_migration.result_payload || jsonb_build_object('was_replayed', true);
  end if;

  if not found then
    insert into public.adhdice_focus_counter_migrations (
      user_id, device_installation_id, migration_batch_id, submitted_snapshot, status
    ) values (v_user_id, p_device_installation_id, p_migration_batch_id, p_submitted_snapshot, 'processing')
    returning * into v_migration;
  end if;

  select count(*) into v_counter_count from public.adhdice_focus_counters where user_id = v_user_id;
  if v_counter_count = 0 then
    for v_counter_json, v_ordinality in
      select value, ordinality from jsonb_array_elements(coalesce(p_submitted_snapshot -> 'counters', '[]'::jsonb)) with ordinality
    loop
      v_server_counter_id := gen_random_uuid();
      insert into public.adhdice_focus_counters (
        id, user_id, title, color, icon, value, step, goal, sort_order, created_at, updated_at
      ) values (
        v_server_counter_id, v_user_id,
        coalesce(nullif(btrim(v_counter_json ->> 'title'), ''), 'Counter'),
        coalesce(nullif(btrim(v_counter_json ->> 'color'), ''), '#6f57f6'),
        coalesce(nullif(btrim(v_counter_json ->> 'icon'), ''), 'Hash'),
        coalesce((v_counter_json ->> 'value')::bigint, 0),
        greatest(1, coalesce((v_counter_json ->> 'step')::bigint, 1)),
        greatest(1, coalesce((v_counter_json ->> 'goal')::bigint, 10)),
        v_ordinality - 1,
        coalesce(nullif(v_counter_json ->> 'createdAt', '')::timestamptz, statement_timestamp()),
        coalesce(nullif(v_counter_json ->> 'updatedAt', '')::timestamptz, statement_timestamp())
      ) returning * into v_counter;
      v_legacy_id_map := v_legacy_id_map || jsonb_build_object(v_counter_json ->> 'legacyId', v_counter.id);
      insert into public.adhdice_focus_counter_events (
        operation_id, user_id, counter_id, event_type, delta, previous_value, next_value,
        title_snapshot, step_snapshot, payload, client_created_at
      ) values (
        gen_random_uuid(), v_user_id, v_counter.id, 'migrate', v_counter.value, 0, v_counter.value,
        v_counter.title, v_counter.step,
        jsonb_build_object('legacy_counter_id', v_counter_json ->> 'legacyId', 'migration_batch_id', p_migration_batch_id),
        nullif(v_counter_json ->> 'createdAt', '')::timestamptz
      );
    end loop;

    for v_history_json in
      select value from jsonb_array_elements(coalesce(p_submitted_snapshot -> 'history', '[]'::jsonb))
    loop
      v_server_counter_id := (v_legacy_id_map ->> (v_history_json ->> 'legacyCounterId'))::uuid;
      if v_server_counter_id is null then continue; end if;
      insert into public.adhdice_focus_counter_events (
        operation_id, user_id, counter_id, event_type, delta, previous_value, next_value,
        title_snapshot, step_snapshot, payload, client_created_at
      ) values (
        gen_random_uuid(), v_user_id, v_server_counter_id, 'migrate',
        coalesce((v_history_json ->> 'delta')::bigint, 0),
        (v_history_json ->> 'previousValue')::bigint,
        (v_history_json ->> 'nextValue')::bigint,
        coalesce(nullif(v_history_json ->> 'counterTitleSnapshot', ''), 'Counter'),
        greatest(1, coalesce((v_history_json ->> 'stepSnapshot')::bigint, 1)),
        jsonb_build_object('legacy_event_id', v_history_json ->> 'legacyId', 'migration_batch_id', p_migration_batch_id),
        nullif(v_history_json ->> 'createdAt', '')::timestamptz
      );
    end loop;
    v_status := 'migrated';
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'color', color, 'icon', icon, 'value', value, 'step', step, 'goal', goal
    ) order by sort_order, id), '[]'::jsonb) into v_server_shape
    from public.adhdice_focus_counters where user_id = v_user_id and deleted_at is null;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', value ->> 'legacyId', 'title', value ->> 'title', 'color', value ->> 'color', 'icon', value ->> 'icon',
      'value', coalesce((value ->> 'value')::bigint, 0),
      'step', greatest(1, coalesce((value ->> 'step')::bigint, 1)),
      'goal', greatest(1, coalesce((value ->> 'goal')::bigint, 10))
    ) order by ordinality), '[]'::jsonb) into v_local_shape
    from jsonb_array_elements(coalesce(p_submitted_snapshot -> 'counters', '[]'::jsonb)) with ordinality;
    v_local_differed := jsonb_array_length(v_local_shape) > 0 and v_local_shape is distinct from v_server_shape;
    v_status := 'server_adopted';
  end if;

  select jsonb_build_object(
    'ok', true,
    'status', v_status,
    'local_differed', v_local_differed,
    'legacy_id_map', v_legacy_id_map,
    'counters', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order, c.id) from public.adhdice_focus_counters c where c.user_id = v_user_id and c.deleted_at is null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by coalesce(e.client_created_at, e.created_at) desc, e.id desc) from public.adhdice_focus_counter_events e where e.user_id = v_user_id), '[]'::jsonb),
    'was_replayed', false
  ) into v_result;

  update public.adhdice_focus_counter_migrations
  set status = v_status, local_differed = v_local_differed, result_payload = v_result, updated_at = statement_timestamp()
  where id = v_migration.id;
  return v_result;
end;
$function$;

revoke all on function public.adhdice_mutate_focus_counter(uuid, uuid, bigint, text, jsonb) from public, anon;
revoke all on function public.adhdice_migrate_focus_counters(uuid, uuid, jsonb) from public, anon;
grant execute on function public.adhdice_mutate_focus_counter(uuid, uuid, bigint, text, jsonb) to authenticated;
grant execute on function public.adhdice_migrate_focus_counters(uuid, uuid, jsonb) to authenticated;

do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_focus_counters'
  ) then alter publication supabase_realtime add table public.adhdice_focus_counters; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_focus_counter_events'
  ) then alter publication supabase_realtime add table public.adhdice_focus_counter_events; end if;
end;
$publication$;

notify pgrst, 'reload schema';
commit;

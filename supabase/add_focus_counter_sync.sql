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
  event_type text not null check (event_type in ('create', 'adjust', 'set_value', 'update', 'delete')),
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

create index if not exists adhdice_focus_counters_active_order_idx on public.adhdice_focus_counters (user_id, deleted_at, sort_order, id);
create index if not exists adhdice_focus_counter_events_counter_created_idx on public.adhdice_focus_counter_events (user_id, counter_id, created_at desc);
create unique index if not exists adhdice_focus_counter_events_operation_unique on public.adhdice_focus_counter_events (user_id, operation_id);

alter table public.adhdice_focus_counters enable row level security;
alter table public.adhdice_focus_counter_events enable row level security;
drop policy if exists "Users can read their own Focus counters" on public.adhdice_focus_counters;
create policy "Users can read their own Focus counters" on public.adhdice_focus_counters for select using (auth.uid() = user_id);
drop policy if exists "Users can read their own Focus counter events" on public.adhdice_focus_counter_events;
create policy "Users can read their own Focus counter events" on public.adhdice_focus_counter_events for select using (auth.uid() = user_id);
revoke all on public.adhdice_focus_counters from anon, authenticated;
revoke all on public.adhdice_focus_counter_events from anon, authenticated;
grant select on public.adhdice_focus_counters to authenticated;
grant select on public.adhdice_focus_counter_events to authenticated;

create or replace function public.adhdice_mutate_focus_counter(p_operation_id uuid, p_counter_id uuid, p_expected_revision bigint, p_action text, p_action_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_counter public.adhdice_focus_counters%rowtype;
  v_event public.adhdice_focus_counter_events%rowtype;
  v_previous_value bigint;
  v_delta bigint;
  v_event_type text;
  v_sort_order bigint;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null or p_action not in ('create', 'adjust', 'set_value', 'update', 'delete') then raise exception 'Invalid Focus counter mutation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));
  select * into v_event from public.adhdice_focus_counter_events where user_id = v_user_id and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'was_replayed', true, 'counter', v_event.payload -> 'result_counter', 'event', to_jsonb(v_event)); end if;
  if p_counter_id is null then raise exception 'Counter ID required'; end if;
  if p_action = 'create' then
    select coalesce(min(sort_order), 0) - 1 into v_sort_order from public.adhdice_focus_counters where user_id = v_user_id and deleted_at is null;
    insert into public.adhdice_focus_counters (id, user_id, title, color, icon, value, step, goal, sort_order)
    values (p_counter_id, v_user_id, coalesce(nullif(btrim(p_action_payload ->> 'title'), ''), 'Counter'), coalesce(nullif(btrim(p_action_payload ->> 'color'), ''), '#6f57f6'), coalesce(nullif(btrim(p_action_payload ->> 'icon'), ''), 'Hash'), coalesce((p_action_payload ->> 'value')::bigint, 0), greatest(1, coalesce((p_action_payload ->> 'step')::bigint, 1)), greatest(1, coalesce((p_action_payload ->> 'goal')::bigint, 10)), v_sort_order) returning * into v_counter;
    v_previous_value := 0; v_delta := v_counter.value; v_event_type := 'create';
  else
    select * into v_counter from public.adhdice_focus_counters where user_id = v_user_id and id = p_counter_id for update;
    if not found or v_counter.deleted_at is not null then return jsonb_build_object('ok', false, 'conflict', true, 'counter', null); end if;
    v_previous_value := v_counter.value;
    if p_action = 'adjust' then
      if coalesce((p_action_payload ->> 'direction')::integer, 0) not in (-1, 1) then raise exception 'Focus counter direction must be -1 or 1'; end if;
      v_delta := v_counter.step * (p_action_payload ->> 'direction')::integer;
      update public.adhdice_focus_counters set value = value + v_delta, revision = revision + 1, updated_at = statement_timestamp() where id = v_counter.id returning * into v_counter;
      v_event_type := 'adjust';
    elsif p_action in ('set_value', 'update') then
      if p_expected_revision is null or p_expected_revision <> v_counter.revision then return jsonb_build_object('ok', false, 'conflict', true, 'counter', to_jsonb(v_counter)); end if;
      update public.adhdice_focus_counters set title = case when p_action_payload ? 'title' then coalesce(nullif(btrim(p_action_payload ->> 'title'), ''), title) else title end, color = case when p_action_payload ? 'color' then coalesce(nullif(btrim(p_action_payload ->> 'color'), ''), color) else color end, icon = case when p_action_payload ? 'icon' then coalesce(nullif(btrim(p_action_payload ->> 'icon'), ''), icon) else icon end, step = case when p_action_payload ? 'step' then greatest(1, (p_action_payload ->> 'step')::bigint) else step end, goal = case when p_action_payload ? 'goal' then greatest(1, (p_action_payload ->> 'goal')::bigint) else goal end, value = case when p_action_payload ? 'value' then (p_action_payload ->> 'value')::bigint else value end, revision = revision + 1, updated_at = statement_timestamp() where id = v_counter.id returning * into v_counter;
      v_delta := v_counter.value - v_previous_value; v_event_type := case when p_action = 'set_value' or p_action_payload ? 'value' then 'set_value' else 'update' end;
    elsif p_action = 'delete' then
      if p_expected_revision is null or p_expected_revision <> v_counter.revision then return jsonb_build_object('ok', false, 'conflict', true, 'counter', to_jsonb(v_counter)); end if;
      update public.adhdice_focus_counters set deleted_at = statement_timestamp(), revision = revision + 1, updated_at = statement_timestamp() where id = v_counter.id returning * into v_counter;
      v_delta := null; v_event_type := 'delete';
    end if;
  end if;
  insert into public.adhdice_focus_counter_events (operation_id, user_id, counter_id, event_type, delta, previous_value, next_value, title_snapshot, step_snapshot, payload, client_created_at)
  values (p_operation_id, v_user_id, v_counter.id, v_event_type, v_delta, case when v_event_type in ('create', 'adjust', 'set_value') then v_previous_value else null end, case when v_event_type in ('create', 'adjust', 'set_value') then v_counter.value else null end, v_counter.title, v_counter.step, jsonb_build_object('request', coalesce(p_action_payload, '{}'::jsonb), 'result_counter', to_jsonb(v_counter)), nullif(p_action_payload ->> 'client_created_at', '')::timestamptz) returning * into v_event;
  return jsonb_build_object('ok', true, 'was_replayed', false, 'counter', to_jsonb(v_counter), 'event', to_jsonb(v_event));
end;
$function$;

revoke all on function public.adhdice_mutate_focus_counter(uuid, uuid, bigint, text, jsonb) from public, anon;
grant execute on function public.adhdice_mutate_focus_counter(uuid, uuid, bigint, text, jsonb) to authenticated;
do $publication$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_focus_counters') then alter publication supabase_realtime add table public.adhdice_focus_counters; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_focus_counter_events') then alter publication supabase_realtime add table public.adhdice_focus_counter_events; end if;
end;
$publication$;
notify pgrst, 'reload schema';
commit;

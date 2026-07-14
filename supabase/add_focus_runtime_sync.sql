-- 6.29.10: recoverable server-authoritative Focus timer runtime migration.
-- Apply manually. Safe for the legacy schema, a partially applied 6.29.9 schema,
-- and repeated execution. Existing active category rows are retained in place.

begin;

alter table public.adhdice_focus_active_sessions
  add column if not exists session_id uuid default gen_random_uuid(),
  add column if not exists runtime_kind text default 'category',
  add column if not exists mode text default 'count_up',
  add column if not exists mode_authoritative boolean not null default false,
  add column if not exists countdown_target_seconds integer,
  add column if not exists state text,
  add column if not exists current_run_started_at timestamptz,
  add column if not exists revision bigint not null default 1,
  add column if not exists created_at timestamptz not null default now();

-- Backfill without advancing updated_at. The legacy updated-at trigger otherwise
-- makes a schema migration look like a user timer transition.
do $backfill$
declare
  v_has_updated_at_trigger boolean;
begin
  select exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.adhdice_focus_active_sessions'::regclass
      and tgname = 'adhdice_focus_active_sessions_set_updated_at'
      and not tgisinternal
  ) into v_has_updated_at_trigger;

  if v_has_updated_at_trigger then
    alter table public.adhdice_focus_active_sessions
      disable trigger adhdice_focus_active_sessions_set_updated_at;
  end if;

  update public.adhdice_focus_active_sessions
  set session_id = coalesce(session_id, gen_random_uuid()),
      runtime_kind = coalesce(runtime_kind, 'category'),
      mode = coalesce(mode, 'count_up'),
      state = coalesce(state, case when is_running then 'running' else 'paused' end),
      current_run_started_at = case
        when is_running then coalesce(current_run_started_at, start_time)
        else current_run_started_at
      end
  where session_id is null
     or runtime_kind is null
     or mode is null
     or state is null
     or (current_run_started_at is null and is_running);

  if v_has_updated_at_trigger then
    alter table public.adhdice_focus_active_sessions
      enable trigger adhdice_focus_active_sessions_set_updated_at;
  end if;
end;
$backfill$;

do $validate_identity$
begin
  if exists (
    select 1 from public.adhdice_focus_active_sessions where session_id is null
  ) then
    raise exception 'Focus runtime migration could not backfill every session_id.';
  end if;

  if exists (
    select session_id
    from public.adhdice_focus_active_sessions
    group by session_id
    having count(*) > 1
  ) then
    raise exception 'Focus runtime migration found duplicate session_id values.';
  end if;
end;
$validate_identity$;

alter table public.adhdice_focus_active_sessions
  alter column session_id set not null,
  alter column session_id set default gen_random_uuid(),
  alter column runtime_kind set not null,
  alter column runtime_kind set default 'category',
  alter column mode set not null,
  alter column mode set default 'count_up',
  alter column state set not null,
  alter column state set default 'paused';

-- The deployed legacy primary key is (user_id, category_id). PostgreSQL will not
-- permit category_id to become nullable until that constraint is removed.
do $drop_legacy_primary_key$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_record.conname, pg_get_constraintdef(constraint_record.oid) as definition
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.adhdice_focus_active_sessions'::regclass
      and constraint_record.contype = 'p'
  loop
    if v_constraint.definition <> 'PRIMARY KEY (session_id)' then
      execute format(
        'alter table public.adhdice_focus_active_sessions drop constraint %I',
        v_constraint.conname
      );
    end if;
  end loop;
end;
$drop_legacy_primary_key$;

alter table public.adhdice_focus_active_sessions
  alter column category_id drop not null;

do $add_session_primary_key$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.adhdice_focus_active_sessions'::regclass
      and contype = 'p'
  ) then
    alter table public.adhdice_focus_active_sessions
      add constraint adhdice_focus_active_sessions_pkey primary key (session_id);
  end if;
end;
$add_session_primary_key$;

alter table public.adhdice_focus_active_sessions drop constraint if exists adhdice_focus_runtime_kind_check;
alter table public.adhdice_focus_active_sessions add constraint adhdice_focus_runtime_kind_check
  check (runtime_kind in ('category', 'standalone_countdown'));
alter table public.adhdice_focus_active_sessions drop constraint if exists adhdice_focus_runtime_mode_check;
alter table public.adhdice_focus_active_sessions add constraint adhdice_focus_runtime_mode_check
  check (mode in ('count_up', 'countdown'));
alter table public.adhdice_focus_active_sessions drop constraint if exists adhdice_focus_runtime_state_check;
alter table public.adhdice_focus_active_sessions add constraint adhdice_focus_runtime_state_check
  check (state in ('running', 'paused'));
alter table public.adhdice_focus_active_sessions drop constraint if exists adhddice_focus_runtime_shape_check;
alter table public.adhdice_focus_active_sessions drop constraint if exists adhdice_focus_runtime_shape_check;
alter table public.adhdice_focus_active_sessions add constraint adhdice_focus_runtime_shape_check check (
  (runtime_kind = 'category' and category_id is not null)
  or (runtime_kind = 'standalone_countdown' and category_id is null and mode = 'countdown')
);
alter table public.adhdice_focus_active_sessions drop constraint if exists adhdice_focus_runtime_countdown_check;
alter table public.adhdice_focus_active_sessions add constraint adhdice_focus_runtime_countdown_check check (
  (mode = 'count_up' and countdown_target_seconds is null)
  or (mode = 'countdown' and countdown_target_seconds is not null and countdown_target_seconds >= 60)
  or (mode = 'countdown' and countdown_target_seconds is null and state = 'paused')
);
create unique index if not exists adhdice_focus_runtime_category_slot_unique
  on public.adhdice_focus_active_sessions (user_id, category_id)
  where runtime_kind = 'category';
create unique index if not exists adhdice_focus_runtime_standalone_slot_unique
  on public.adhdice_focus_active_sessions (user_id)
  where runtime_kind = 'standalone_countdown';

alter table public.adhdice_focus_sessions
  add column if not exists runtime_session_id uuid;
create unique index if not exists adhdice_focus_sessions_runtime_session_unique
  on public.adhdice_focus_sessions (runtime_session_id)
  where runtime_session_id is not null;

create table if not exists public.adhdice_focus_runtime_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  operation_kind text not null,
  runtime_session_id uuid,
  result_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.adhdice_focus_active_sessions enable row level security;
alter table public.adhdice_focus_runtime_operations enable row level security;
drop policy if exists "Users can read their own focus runtime operations" on public.adhdice_focus_runtime_operations;
create policy "Users can read their own focus runtime operations"
  on public.adhdice_focus_runtime_operations for select using (auth.uid() = user_id);

revoke all on public.adhdice_focus_active_sessions from anon, authenticated;
revoke all on public.adhdice_focus_runtime_operations from anon, authenticated;
grant select on public.adhdice_focus_active_sessions to authenticated;
grant select on public.adhdice_focus_runtime_operations to authenticated;

create or replace function public.adhdice_focus_runtime_payload(p_runtime public.adhdice_focus_active_sessions)
returns jsonb language sql stable set search_path = '' as $body$
  select to_jsonb(p_runtime) - 'start_time' - 'is_running' - 'occurrence_key' - 'occurrence_due_on' - 'mode_authoritative';
$body$;

create or replace function public.adhdice_transition_focus_runtime(
  p_operation_id uuid,
  p_action text,
  p_session_id uuid default null,
  p_expected_revision bigint default null,
  p_runtime_kind text default null,
  p_category_id uuid default null,
  p_mode text default null,
  p_countdown_target_seconds integer default null,
  p_start boolean default false,
  p_delta_seconds integer default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $body$
declare
  v_user_id uuid := auth.uid();
  v_runtime public.adhdice_focus_active_sessions%rowtype;
  v_existing public.adhdice_focus_runtime_operations%rowtype;
  v_now timestamptz := statement_timestamp();
  v_elapsed integer;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  select * into v_existing from public.adhdice_focus_runtime_operations
    where user_id = v_user_id and operation_id = p_operation_id;
  if found then return v_existing.result_payload; end if;

  if p_action = 'create' then
    if p_runtime_kind not in ('category', 'standalone_countdown') then
      raise exception using errcode = '22023', message = 'Invalid Focus runtime kind.';
    end if;
    if p_runtime_kind = 'category' and not exists (
      select 1 from public.adhdice_focus_categories category
      where category.id = p_category_id and category.user_id = v_user_id
    ) then
      raise exception using errcode = '42501', message = 'Focus category is not owned by the authenticated user.';
    end if;
    insert into public.adhdice_focus_active_sessions (
      session_id, user_id, runtime_kind, category_id, mode, mode_authoritative,
      countdown_target_seconds, state, current_run_started_at, start_time,
      accumulated_seconds, is_running, revision, created_at, updated_at
    ) values (
      coalesce(p_session_id, gen_random_uuid()), v_user_id, p_runtime_kind,
      case when p_runtime_kind = 'category' then p_category_id else null end,
      coalesce(p_mode, case when p_runtime_kind = 'standalone_countdown' then 'countdown' else 'count_up' end), true,
      p_countdown_target_seconds, case when p_start then 'running' else 'paused' end,
      case when p_start then v_now else null end, case when p_start then v_now else null end,
      0, p_start, 1, v_now, v_now
    ) returning * into v_runtime;
  else
    select * into v_runtime from public.adhdice_focus_active_sessions
      where user_id = v_user_id and session_id = p_session_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Focus runtime no longer exists.'; end if;
    if p_expected_revision is null or v_runtime.revision <> p_expected_revision then
      raise exception using errcode = '40001', message = 'Stale Focus runtime revision.',
        detail = public.adhdice_focus_runtime_payload(v_runtime)::text;
    end if;
    v_elapsed := v_runtime.accumulated_seconds + case
      when v_runtime.state = 'running' and v_runtime.current_run_started_at is not null
      then greatest(0, floor(extract(epoch from (v_now - v_runtime.current_run_started_at)))::integer)
      else 0 end;

    if p_action = 'pause' then
      update public.adhdice_focus_active_sessions set accumulated_seconds = v_elapsed,
        state = 'paused', current_run_started_at = null, start_time = null, is_running = false,
        revision = revision + 1, updated_at = v_now where session_id = v_runtime.session_id returning * into v_runtime;
    elsif p_action = 'resume' then
      if v_runtime.mode = 'countdown' and v_runtime.countdown_target_seconds is null then
        raise exception using errcode = '22023', message = 'Choose a countdown duration before starting.';
      end if;
      update public.adhdice_focus_active_sessions set state = 'running', current_run_started_at = v_now,
        start_time = v_now, is_running = true, revision = revision + 1, updated_at = v_now
        where session_id = v_runtime.session_id returning * into v_runtime;
    elsif p_action = 'configure' then
      update public.adhdice_focus_active_sessions set
        mode = 'countdown', mode_authoritative = true,
        countdown_target_seconds = greatest(60, p_countdown_target_seconds),
        accumulated_seconds = case when p_start then 0 else least(v_elapsed, greatest(60, p_countdown_target_seconds)) end,
        state = case when p_start or v_runtime.state = 'running' then 'running' else 'paused' end,
        current_run_started_at = case when p_start or v_runtime.state = 'running' then v_now else null end,
        start_time = case when p_start or v_runtime.state = 'running' then v_now else null end,
        is_running = p_start or v_runtime.state = 'running', revision = revision + 1, updated_at = v_now
        where session_id = v_runtime.session_id returning * into v_runtime;
    elsif p_action = 'adjust' then
      update public.adhdice_focus_active_sessions set
        accumulated_seconds = case when v_runtime.mode = 'count_up' then greatest(0, v_elapsed + p_delta_seconds) else v_elapsed end,
        countdown_target_seconds = case when v_runtime.mode = 'countdown' then greatest(60, v_runtime.countdown_target_seconds + p_delta_seconds) else null end,
        current_run_started_at = case when v_runtime.state = 'running' then v_now else null end,
        start_time = case when v_runtime.state = 'running' then v_now else null end,
        revision = revision + 1, updated_at = v_now
        where session_id = v_runtime.session_id returning * into v_runtime;
    elsif p_action = 'reset' then
      update public.adhdice_focus_active_sessions set accumulated_seconds = 0,
        state = case when v_runtime.mode = 'countdown' and v_runtime.countdown_target_seconds is not null then 'running' else 'paused' end,
        current_run_started_at = case when v_runtime.mode = 'countdown' and v_runtime.countdown_target_seconds is not null then v_now else null end,
        start_time = case when v_runtime.mode = 'countdown' and v_runtime.countdown_target_seconds is not null then v_now else null end,
        is_running = v_runtime.mode = 'countdown' and v_runtime.countdown_target_seconds is not null,
        revision = revision + 1, updated_at = v_now where session_id = v_runtime.session_id returning * into v_runtime;
    elsif p_action = 'delete' then
      delete from public.adhdice_focus_active_sessions where session_id = v_runtime.session_id;
      v_result := jsonb_build_object('runtime', null, 'deleted_session_id', v_runtime.session_id);
    else
      raise exception using errcode = '22023', message = 'Invalid Focus runtime transition.';
    end if;
  end if;

  if v_result is null then v_result := jsonb_build_object('runtime', public.adhdice_focus_runtime_payload(v_runtime)); end if;
  insert into public.adhdice_focus_runtime_operations (user_id, operation_id, operation_kind, runtime_session_id, result_payload)
    values (v_user_id, p_operation_id, p_action, coalesce(v_runtime.session_id, p_session_id), v_result);
  return v_result;
exception when unique_violation then
  select result_payload into v_result from public.adhdice_focus_runtime_operations
    where user_id = v_user_id and operation_id = p_operation_id;
  if v_result is not null then return v_result; end if;
  raise;
end;
$body$;

create or replace function public.adhdice_complete_focus_runtime(
  p_operation_id uuid,
  p_session_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_focus_type text,
  p_focus_subtype text default null,
  p_focus_subtype_2 text default null,
  p_notes text default null,
  p_session_date date default current_date
) returns jsonb
language plpgsql security definer set search_path = '' as $body$
declare
  v_user_id uuid := auth.uid();
  v_runtime public.adhdice_focus_active_sessions%rowtype;
  v_completed public.adhdice_focus_sessions%rowtype;
  v_existing public.adhdice_focus_runtime_operations%rowtype;
  v_profile public.adhdice_user_profiles%rowtype;
  v_now timestamptz := statement_timestamp();
  v_duration integer;
  v_xp integer;
  v_previous_level integer;
  v_next_level integer;
  v_level_ups integer;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  select * into v_existing from public.adhdice_focus_runtime_operations
    where user_id = v_user_id and operation_id = p_operation_id;
  if found then return v_existing.result_payload; end if;

  select * into v_completed from public.adhdice_focus_sessions
    where user_id = v_user_id and runtime_session_id = p_session_id;
  if found then
    v_result := jsonb_build_object('runtime', null, 'completed_session', to_jsonb(v_completed), 'was_replayed', true);
    insert into public.adhdice_focus_runtime_operations (user_id, operation_id, operation_kind, runtime_session_id, result_payload)
      values (v_user_id, p_operation_id, 'complete', p_session_id, v_result);
    return v_result;
  end if;

  select * into v_runtime from public.adhdice_focus_active_sessions
    where user_id = v_user_id and session_id = p_session_id for update;
  if not found then
    select * into v_completed from public.adhdice_focus_sessions
      where user_id = v_user_id and runtime_session_id = p_session_id;
    if found then
      v_result := jsonb_build_object('runtime', null, 'completed_session', to_jsonb(v_completed), 'was_replayed', true);
      insert into public.adhdice_focus_runtime_operations (user_id, operation_id, operation_kind, runtime_session_id, result_payload)
        values (v_user_id, p_operation_id, 'complete', p_session_id, v_result);
      return v_result;
    end if;
    raise exception using errcode = 'P0002', message = 'Focus runtime no longer exists.';
  end if;
  if v_runtime.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Stale Focus runtime revision.', detail = public.adhdice_focus_runtime_payload(v_runtime)::text;
  end if;
  v_duration := v_runtime.accumulated_seconds + case
    when v_runtime.state = 'running' and v_runtime.current_run_started_at is not null
    then greatest(0, floor(extract(epoch from (v_now - v_runtime.current_run_started_at)))::integer)
    else 0 end;
  if v_runtime.mode = 'countdown' and v_runtime.countdown_target_seconds is not null then
    v_duration := least(v_duration, v_runtime.countdown_target_seconds);
  end if;
  if v_duration < 1 then raise exception using errcode = '22023', message = 'Focus runtime has no completed duration.'; end if;

  insert into public.adhdice_focus_sessions (
    user_id, category_id, title_snapshot, focus_type_snapshot, focus_subtype_snapshot,
    focus_subtype_2_snapshot, session_date, duration_seconds, notes, started_at, ended_at, source, runtime_session_id
  ) values (
    v_user_id, v_runtime.category_id, coalesce(nullif(btrim(p_title), ''), 'Untitled Session'),
    coalesce(nullif(btrim(p_focus_type), ''), 'Work'), nullif(btrim(p_focus_subtype), ''), nullif(btrim(p_focus_subtype_2), ''),
    coalesce(p_session_date, current_date), v_duration, nullif(p_notes, ''), v_runtime.created_at, v_now, 'timer', v_runtime.session_id
  ) returning * into v_completed;

  v_xp := floor(floor(v_duration / 60.0) * 1.5)::integer;
  if v_xp > 0 then
    insert into public.adhdice_user_profiles (user_id) values (v_user_id) on conflict (user_id) do nothing;
    select * into v_profile from public.adhdice_user_profiles where user_id = v_user_id for update;
    v_previous_level := public.adhdice_level_from_xp(v_profile.xp);
    v_next_level := public.adhdice_level_from_xp(v_profile.xp + v_xp);
    v_level_ups := greatest(v_next_level - v_previous_level, 0);
    update public.adhdice_user_profiles set xp = xp + v_xp, level = v_next_level,
      tokens = tokens + v_level_ups, free_roll_bank = free_roll_bank + v_level_ups
      where user_id = v_user_id returning * into v_profile;
    insert into public.adhdice_point_ledger (user_id, delta, reason, balance_after, source, ref_id)
      values (v_user_id, 0, 'Focus session: ' || floor(v_duration / 60.0)::integer || 'm', v_profile.points, 'focus', v_completed.id);
  end if;

  delete from public.adhdice_focus_active_sessions where session_id = v_runtime.session_id;
  v_result := jsonb_build_object('runtime', null, 'completed_session', to_jsonb(v_completed), 'was_replayed', false);
  insert into public.adhdice_focus_runtime_operations (user_id, operation_id, operation_kind, runtime_session_id, result_payload)
    values (v_user_id, p_operation_id, 'complete', p_session_id, v_result);
  return v_result;
exception when unique_violation then
  select * into v_completed from public.adhdice_focus_sessions where user_id = v_user_id and runtime_session_id = p_session_id;
  if found then return jsonb_build_object('runtime', null, 'completed_session', to_jsonb(v_completed), 'was_replayed', true); end if;
  raise;
end;
$body$;

create or replace function public.adhdice_migrate_focus_runtime(
  p_operation_id uuid,
  p_runtime_kind text,
  p_category_id uuid default null,
  p_session_id uuid default null,
  p_expected_revision bigint default null,
  p_mode text default 'countdown',
  p_countdown_target_seconds integer default null,
  p_legacy_started_at timestamptz default null,
  p_legacy_accumulated_seconds integer default 0,
  p_legacy_is_running boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $body$
declare
  v_user_id uuid := auth.uid();
  v_runtime public.adhdice_focus_active_sessions%rowtype;
  v_existing public.adhdice_focus_runtime_operations%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  select * into v_existing from public.adhdice_focus_runtime_operations where user_id = v_user_id and operation_id = p_operation_id;
  if found then return v_existing.result_payload; end if;

  if p_runtime_kind = 'standalone_countdown' then
    select * into v_runtime from public.adhdice_focus_active_sessions
      where user_id = v_user_id and runtime_kind = 'standalone_countdown' for update;
    if not found then
      insert into public.adhdice_focus_active_sessions (
        session_id, user_id, runtime_kind, category_id, mode, mode_authoritative, countdown_target_seconds,
        state, current_run_started_at, start_time, accumulated_seconds, is_running, revision
      ) values (
        coalesce(p_session_id, gen_random_uuid()), v_user_id, 'standalone_countdown', null, 'countdown', true,
        greatest(60, p_countdown_target_seconds), case when p_legacy_is_running then 'running' else 'paused' end,
        case when p_legacy_is_running then p_legacy_started_at else null end,
        case when p_legacy_is_running then p_legacy_started_at else null end,
        greatest(0, p_legacy_accumulated_seconds), p_legacy_is_running, 1
      ) returning * into v_runtime;
    end if;
  elsif p_runtime_kind = 'category' then
    select * into v_runtime from public.adhdice_focus_active_sessions
      where user_id = v_user_id and runtime_kind = 'category' and category_id = p_category_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Matching category runtime no longer exists.'; end if;
    if not v_runtime.mode_authoritative and v_runtime.session_id = p_session_id and v_runtime.revision = p_expected_revision then
      update public.adhdice_focus_active_sessions set mode = p_mode, mode_authoritative = true,
        countdown_target_seconds = case when p_mode = 'countdown' then greatest(60, p_countdown_target_seconds) else null end,
        revision = revision + 1, updated_at = statement_timestamp()
        where session_id = v_runtime.session_id returning * into v_runtime;
    end if;
  else
    raise exception using errcode = '22023', message = 'Invalid legacy Focus runtime kind.';
  end if;

  v_result := jsonb_build_object('runtime', public.adhdice_focus_runtime_payload(v_runtime));
  insert into public.adhdice_focus_runtime_operations (user_id, operation_id, operation_kind, runtime_session_id, result_payload)
    values (v_user_id, p_operation_id, 'migrate', v_runtime.session_id, v_result);
  return v_result;
end;
$body$;

revoke all on function public.adhdice_focus_runtime_payload(public.adhdice_focus_active_sessions) from public, anon, authenticated;
revoke all on function public.adhdice_transition_focus_runtime(uuid, text, uuid, bigint, text, uuid, text, integer, boolean, integer) from public, anon;
revoke all on function public.adhdice_complete_focus_runtime(uuid, uuid, bigint, text, text, text, text, text, date) from public, anon;
revoke all on function public.adhdice_migrate_focus_runtime(uuid, text, uuid, uuid, bigint, text, integer, timestamptz, integer, boolean) from public, anon;
grant execute on function public.adhdice_transition_focus_runtime(uuid, text, uuid, bigint, text, uuid, text, integer, boolean, integer) to authenticated;
grant execute on function public.adhdice_complete_focus_runtime(uuid, uuid, bigint, text, text, text, text, text, date) to authenticated;
grant execute on function public.adhdice_migrate_focus_runtime(uuid, text, uuid, uuid, bigint, text, integer, timestamptz, integer, boolean) to authenticated;

do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'adhdice_focus_active_sessions'
  ) then alter publication supabase_realtime add table public.adhdice_focus_active_sessions; end if;
end;
$publication$;

notify pgrst, 'reload schema';

commit;

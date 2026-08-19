-- ADHDice Achievements MVP authoritative capture, evaluation, and resumable recalculation.
-- Apply after add_achievement_mvp_foundation.sql. No production execution is implied.
begin;

alter table public.adhdice_achievement_occurrences
  add column if not exists source_created_at timestamptz,
  add column if not exists is_currently_qualifying boolean not null default true,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

alter table public.adhdice_achievement_occurrences
  drop constraint if exists adhdice_achievement_occurrences_source_kind_check,
  add constraint adhdice_achievement_occurrences_source_kind_check
    check (source_kind in ('task_history', 'focus_session', 'step_set')),
  drop constraint if exists adhdice_achievement_occurrences_entity_kind_check,
  add constraint adhdice_achievement_occurrences_entity_kind_check
    check (entity_kind in ('parent_task', 'step', 'focus_session', 'parent_step_set'));

alter table public.adhdice_achievement_occurrences
  drop constraint if exists adhdice_achievement_occurrences_outcome_snapshot_check,
  add constraint adhdice_achievement_occurrences_outcome_snapshot_check
    check (outcome_snapshot is null or outcome_snapshot in ('done', 'complete', 'did_my_best', 'missed', 'delayed')),
  drop constraint if exists adhdice_achievement_occurrences_snapshot_check,
  add constraint adhdice_achievement_occurrences_snapshot_check
    check (outcome_snapshot is not null or active_duration_seconds is not null or not is_currently_qualifying);

create unique index if not exists adhdice_achievement_occurrences_source_record_unique
  on public.adhdice_achievement_occurrences (user_id, source_kind, source_id);
create index if not exists adhdice_achievement_occurrences_active_kind_idx
  on public.adhdice_achievement_occurrences (user_id, entity_kind, logical_date)
  where is_currently_qualifying;

comment on column public.adhdice_achievement_occurrences.source_created_at is
  'Original source-row creation time. Eligibility uses this field, never a later edit time.';
comment on column public.adhdice_achievement_occurrences.source_snapshot is
  'Frozen source evidence. Step-set rows include the exact sorted Step and constituent occurrence IDs.';

create or replace function public.adhdice_achievement_logical_date(
  p_timestamp timestamptz,
  p_timezone text,
  p_logical_day_start time without time zone
) returns date
language sql stable strict
set search_path = ''
as $function$
  select ((p_timestamp at time zone p_timezone) - p_logical_day_start)::date
$function$;

create or replace function public.adhdice_validate_achievement_occurrence_activation()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_activation_logical_date date;
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id = new.user_id;
  if not found then
    raise exception using errcode = '23514', message = 'An activated Achievement profile is required.';
  end if;
  v_activation_logical_date := public.adhdice_achievement_logical_date(
    v_profile.activated_at, v_profile.timezone, v_profile.logical_day_start
  );
  if new.source_created_at is null
    or new.source_created_at < v_profile.activated_at
    or new.first_qualified_at < v_profile.activated_at
    or new.logical_date < v_activation_logical_date then
    raise exception using errcode = '23514', message = 'Achievement occurrences must be genuinely post-activation.';
  end if;
  return new;
end;
$function$;

drop trigger if exists adhdice_achievement_occurrences_post_activation on public.adhdice_achievement_occurrences;
create trigger adhdice_achievement_occurrences_post_activation
  before insert or update of source_created_at, first_qualified_at, logical_date
  on public.adhdice_achievement_occurrences
  for each row execute function public.adhdice_validate_achievement_occurrence_activation();

create or replace function public.adhdice_achievement_root_parent(p_task_id uuid, p_user_id uuid)
returns uuid
language sql stable
set search_path = ''
as $function$
  with recursive ancestors as (
    select task.id, task.parent_task_id, 0 as depth
    from public.adhdice_clean_tasks task
    where task.id = p_task_id and task.user_id = p_user_id
    union all
    select parent.id, parent.parent_task_id, child.depth + 1
    from public.adhdice_clean_tasks parent
    join ancestors child on child.parent_task_id = parent.id
    where parent.user_id = p_user_id and child.depth < 64
  )
  select id from ancestors order by depth desc limit 1
$function$;

create or replace function public.adhdice_capture_task_achievement_occurrence(p_history_fact_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_history public.adhdice_task_history_facts%rowtype;
  v_task public.adhdice_clean_tasks%rowtype;
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_existing public.adhdice_achievement_occurrences%rowtype;
  v_occurrence_id uuid;
  v_match_count integer := 0;
  v_match_tier integer := 0;
  v_fallback_ambiguous boolean := false;
  v_canonical_occurrence_key text;
  v_source_key text;
  v_dedupe_key text;
  v_entity_kind text;
  v_logical_occurrence_part text;
  v_root_id uuid;
  v_qualified boolean;
  v_snapshot jsonb;
begin
  select * into v_history from public.adhdice_task_history_facts where id = p_history_fact_id;
  if not found then return null; end if;
  select * into v_profile from public.adhdice_achievement_profiles where user_id = v_history.user_id;
  if not found then return null; end if;

  -- Resolve one evidence tier at a time. A strong source match wins even when
  -- stale Task/date siblings also exist; only ambiguity within that tier is
  -- an error.
  select count(*) into v_match_count
  from public.adhdice_achievement_occurrences occurrence
  where occurrence.user_id = v_history.user_id
    and occurrence.source_kind = 'task_history'
    and occurrence.source_id = v_history.id::text;
  if v_match_count > 1 then
    raise exception 'Ambiguous Achievement tier A mapping for canonical History fact %.', v_history.id;
  end if;
  if v_match_count = 1 then
    v_match_tier := 1;
    select * into v_existing
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.source_id = v_history.id::text;
  end if;

  if v_match_tier = 0 and v_history.source_legacy_history_id is not null then
    select count(*) into v_match_count
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.source_id = v_history.source_legacy_history_id::text;
    if v_match_count > 1 then
      raise exception 'Ambiguous Achievement tier B mapping for canonical History fact %.', v_history.id;
    end if;
    if v_match_count = 1 then
      v_match_tier := 2;
      select * into v_existing
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = v_history.user_id
        and occurrence.source_kind = 'task_history'
        and occurrence.source_id = v_history.source_legacy_history_id::text;
    end if;
  end if;

  if v_match_tier = 0 then
    select count(*) into v_match_count
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.source_snapshot->>'history_fact_id' = v_history.id::text;
    if v_match_count > 1 then
      raise exception 'Ambiguous Achievement tier C mapping for canonical History fact %.', v_history.id;
    end if;
    if v_match_count = 1 then
      v_match_tier := 3;
      select * into v_existing
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = v_history.user_id
        and occurrence.source_kind = 'task_history'
        and occurrence.source_snapshot->>'history_fact_id' = v_history.id::text;
    end if;
  end if;

  if v_match_tier = 0 then
    select count(*) into v_match_count
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.entity_id = v_history.entity_id
      and occurrence.logical_date = v_history.logical_date;
    v_match_tier := case when v_match_count > 0 then 4 else 0 end;
    v_fallback_ambiguous := v_match_count > 1;
    if v_match_count = 1 then
      select * into v_existing
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = v_history.user_id
        and occurrence.source_kind = 'task_history'
        and occurrence.entity_id = v_history.entity_id
        and occurrence.logical_date = v_history.logical_date;
    end if;
  end if;

  if v_history.occurrence_id is not null then
    select occurrence.occurrence_key into v_canonical_occurrence_key
    from public.adhdice_task_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.id = v_history.occurrence_id
      and occurrence.entity_id = v_history.entity_id;
    if not found then
      raise exception 'Canonical occurrence % for History fact % could not be resolved.', v_history.occurrence_id, v_history.id;
    end if;
  end if;

  v_entity_kind := case when v_history.entity_kind = 'parent' then 'parent_task' else 'step' end;
  -- Canonical occurrence evidence wins. A terminal completion is the only
  -- canonical fact that establishes a lifetime one-time identity without an
  -- occurrence row; otherwise logical-date is the fail-closed fallback.
  v_logical_occurrence_part := case
    when nullif(btrim(v_canonical_occurrence_key), '') is not null then v_canonical_occurrence_key
    when v_history.event_kind = 'terminal_complete' then 'lifetime:' || v_history.entity_id::text
    else 'logical-date:' || v_history.logical_date::text
  end;
  v_source_key := 'task:' || v_history.entity_id::text || ':' || v_logical_occurrence_part;
  v_dedupe_key := 'occurrence:v1:task_history:' || v_entity_kind || ':' || v_history.entity_id::text || ':' || v_logical_occurrence_part;
  v_qualified := v_history.outcome in ('done', 'complete', 'did_my_best');
  perform pg_advisory_xact_lock(hashtextextended(v_history.user_id::text || ':achievement-source:' || v_history.id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_history.user_id::text || ':achievement-occurrence:' || v_dedupe_key, 0));

  select * into v_task
  from public.adhdice_clean_tasks
  where id = v_history.entity_id and user_id = v_history.user_id;
  if not found then
    -- Deleted Tasks retain their Achievement-owned history and awards. If a
    -- canonical fact still identifies an existing occurrence, only migrate
    -- physical source evidence; never require the deleted Task to reappear.
    if v_existing.id is not null then
      update public.adhdice_achievement_occurrences
      set source_id = v_history.id::text,
          outcome_snapshot = v_history.outcome,
          source_snapshot = jsonb_build_object(
            'history_fact_id', v_history.id, 'task_id', v_history.entity_id,
            'entity_id', v_history.entity_id, 'entity_kind', v_history.entity_kind,
            'logical_date', v_history.logical_date, 'outcome', v_history.outcome,
            'event_kind', v_history.event_kind, 'occurrence_id', v_history.occurrence_id,
            'occurrence_key', v_canonical_occurrence_key,
            'scheduled_due_on', v_history.scheduled_due_on, 'effective_due_on', v_history.effective_due_on,
            'schedule_boundary_id', v_history.schedule_boundary_id,
            'recurrence_source_fingerprint', v_history.recurrence_source_fingerprint,
            'provenance_kind', v_history.provenance_kind, 'actor_kind', v_history.actor_kind,
            'actor_id', v_history.actor_id, 'source', v_history.source,
            'created_at', v_history.created_at, 'updated_at', v_history.updated_at,
            'deleted_task_preserved', true
          )
      where id = v_existing.id
      returning id into v_occurrence_id;
      return v_occurrence_id;
    end if;
    return null;
  end if;

  v_root_id := public.adhdice_achievement_root_parent(v_history.entity_id, v_history.user_id);
  v_snapshot := jsonb_build_object(
    'history_fact_id', v_history.id, 'task_id', v_history.entity_id,
    'entity_id', v_history.entity_id, 'entity_kind', v_history.entity_kind,
    'logical_date', v_history.logical_date, 'outcome', v_history.outcome,
    'event_kind', v_history.event_kind, 'occurrence_id', v_history.occurrence_id,
    'occurrence_key', v_canonical_occurrence_key,
    'scheduled_due_on', v_history.scheduled_due_on, 'effective_due_on', v_history.effective_due_on,
    'schedule_boundary_id', v_history.schedule_boundary_id,
    'recurrence_source_fingerprint', v_history.recurrence_source_fingerprint,
    'provenance_kind', v_history.provenance_kind, 'actor_kind', v_history.actor_kind,
    'actor_id', v_history.actor_id, 'source', v_history.source,
    'created_at', v_history.created_at, 'updated_at', v_history.updated_at,
    'parent_task_id', v_task.parent_task_id, 'root_parent_id', v_root_id,
    'logical_dedupe_key', coalesce(v_existing.dedupe_key, v_dedupe_key)
  );

  if v_history.created_at < v_profile.activated_at
    or v_history.logical_date < public.adhdice_achievement_logical_date(v_profile.activated_at, v_profile.timezone, v_profile.logical_day_start) then
    if v_existing.id is null then return null; end if;
    update public.adhdice_achievement_occurrences
    set source_id = v_history.id::text, outcome_snapshot = v_history.outcome,
        is_currently_qualifying = false, source_snapshot = v_snapshot
    where id = v_existing.id
    returning id into v_occurrence_id;
    update public.adhdice_achievement_occurrences sibling
    set is_currently_qualifying = false,
        source_snapshot = sibling.source_snapshot || jsonb_build_object(
          'superseded_by_history_fact_id', v_history.id,
          'canonical_reconciled_at', clock_timestamp(),
          'stale_same_day_evidence', true
        )
    where sibling.user_id = v_history.user_id
      and sibling.source_kind = 'task_history'
      and sibling.entity_id = v_history.entity_id
      and sibling.logical_date = v_history.logical_date
      and sibling.id <> v_occurrence_id;
    return v_occurrence_id;
  end if;

  if v_existing.id is not null then
    update public.adhdice_achievement_occurrences occurrence
    set source_id = v_history.id::text,
        source_created_at = v_history.created_at,
        first_qualified_at = case when v_qualified
          then least(occurrence.first_qualified_at, v_history.updated_at)
          else occurrence.first_qualified_at end,
        logical_date = v_history.logical_date,
        week_key = v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 1,
        week_start_date = v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 1,
        week_end_date = v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 7,
        month_key = to_char(v_history.logical_date, 'YYYY-MM'),
        month_start_date = date_trunc('month', v_history.logical_date)::date,
        month_end_date = (date_trunc('month', v_history.logical_date) + interval '1 month - 1 day')::date,
        entity_kind = v_entity_kind, entity_id = v_task.id,
        root_parent_id = case when v_task.parent_task_id is null then v_task.id else v_root_id end,
        title_snapshot = v_task.title, outcome_snapshot = v_history.outcome,
        is_currently_qualifying = v_qualified, source_snapshot = v_snapshot,
        evaluator_version = 'achievements-evaluator-v1', catalog_version = v_profile.catalog_version
    where occurrence.id = v_existing.id
    returning occurrence.id into v_occurrence_id;
    update public.adhdice_achievement_occurrences sibling
    set is_currently_qualifying = false,
        source_snapshot = sibling.source_snapshot || jsonb_build_object(
          'superseded_by_history_fact_id', v_history.id,
          'canonical_reconciled_at', clock_timestamp(),
          'stale_same_day_evidence', true
        )
    where sibling.user_id = v_history.user_id
      and sibling.source_kind = 'task_history'
      and sibling.entity_id = v_history.entity_id
      and sibling.logical_date = v_history.logical_date
      and sibling.id <> v_occurrence_id;
    return v_occurrence_id;
  end if;

  if not v_qualified and not v_fallback_ambiguous then
    update public.adhdice_achievement_occurrences sibling
    set is_currently_qualifying = false,
        source_snapshot = sibling.source_snapshot || jsonb_build_object(
          'superseded_by_history_fact_id', v_history.id,
          'canonical_reconciled_at', clock_timestamp(),
          'stale_same_day_evidence', true
        )
    where sibling.user_id = v_history.user_id
      and sibling.source_kind = 'task_history'
      and sibling.entity_id = v_history.entity_id
      and sibling.logical_date = v_history.logical_date;
    return null;
  end if;

  insert into public.adhdice_achievement_occurrences (
    user_id, source_kind, source_id, source_occurrence_key, dedupe_key,
    source_created_at, first_qualified_at, logical_date, week_key, week_start_date, week_end_date,
    month_key, month_start_date, month_end_date, timezone, logical_day_start,
    entity_kind, entity_id, root_parent_id, title_snapshot, outcome_snapshot,
    evaluator_version, catalog_version, is_currently_qualifying, source_snapshot
  ) values (
    v_history.user_id, 'task_history', v_history.id::text, v_source_key, v_dedupe_key,
    v_history.created_at, v_history.updated_at, v_history.logical_date,
    v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 1,
    v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 1,
    v_history.logical_date - extract(isodow from v_history.logical_date)::integer + 7,
    to_char(v_history.logical_date, 'YYYY-MM'), date_trunc('month', v_history.logical_date)::date,
    (date_trunc('month', v_history.logical_date) + interval '1 month - 1 day')::date,
    v_profile.timezone, v_profile.logical_day_start,
    v_entity_kind,
    v_task.id, case when v_task.parent_task_id is null then v_task.id else v_root_id end,
    v_task.title, v_history.outcome, 'achievements-evaluator-v1', v_profile.catalog_version, v_qualified,
    v_snapshot
  )
  returning id into v_occurrence_id;
  update public.adhdice_achievement_occurrences sibling
  set is_currently_qualifying = false,
      source_snapshot = sibling.source_snapshot || jsonb_build_object(
        'superseded_by_history_fact_id', v_history.id,
        'canonical_reconciled_at', clock_timestamp(),
        'stale_same_day_evidence', true
      )
  where sibling.user_id = v_history.user_id
    and sibling.source_kind = 'task_history'
    and sibling.entity_id = v_history.entity_id
    and sibling.logical_date = v_history.logical_date
    and sibling.id <> v_occurrence_id;
  return v_occurrence_id;
end;
$function$;

create or replace function public.adhdice_capture_focus_achievement_occurrence(p_session_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_session public.adhdice_focus_sessions%rowtype;
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_occurrence_id uuid;
begin
  select * into v_session from public.adhdice_focus_sessions where id = p_session_id;
  if not found then return null; end if;
  select * into v_profile from public.adhdice_achievement_profiles where user_id = v_session.user_id;
  if not found or v_session.created_at < v_profile.activated_at
    or v_session.session_date < public.adhdice_achievement_logical_date(v_profile.activated_at, v_profile.timezone, v_profile.logical_day_start)
    or v_session.duration_seconds < 1 then return null; end if;

  insert into public.adhdice_achievement_occurrences (
    user_id, source_kind, source_id, source_occurrence_key, dedupe_key,
    source_created_at, first_qualified_at, logical_date, week_key, week_start_date, week_end_date,
    month_key, month_start_date, month_end_date, timezone, logical_day_start,
    entity_kind, entity_id, title_snapshot, active_duration_seconds,
    evaluator_version, catalog_version, is_currently_qualifying, source_snapshot
  ) values (
    v_session.user_id, 'focus_session', v_session.id::text, 'focus-session:' || v_session.id::text,
    'occurrence:v1:focus_session:focus-session:' || v_session.id::text,
    v_session.created_at, v_session.created_at, v_session.session_date,
    v_session.session_date - extract(isodow from v_session.session_date)::integer + 1,
    v_session.session_date - extract(isodow from v_session.session_date)::integer + 1,
    v_session.session_date - extract(isodow from v_session.session_date)::integer + 7,
    to_char(v_session.session_date, 'YYYY-MM'), date_trunc('month', v_session.session_date)::date,
    (date_trunc('month', v_session.session_date) + interval '1 month - 1 day')::date,
    v_profile.timezone, v_profile.logical_day_start, 'focus_session', v_session.id,
    v_session.title_snapshot, v_session.duration_seconds, 'achievements-evaluator-v1', v_profile.catalog_version, true,
    jsonb_build_object('session_id', v_session.id, 'source', v_session.source, 'started_at', v_session.started_at,
      'ended_at', v_session.ended_at, 'session_date', v_session.session_date)
  )
  on conflict (user_id, source_kind, source_id) do update set
    active_duration_seconds = excluded.active_duration_seconds,
    title_snapshot = excluded.title_snapshot,
    source_snapshot = excluded.source_snapshot,
    is_currently_qualifying = true,
    evaluator_version = excluded.evaluator_version,
    catalog_version = excluded.catalog_version
  returning id into v_occurrence_id;
  return v_occurrence_id;
end;
$function$;

create or replace function public.adhdice_refresh_achievement_step_set(p_user_id uuid, p_root_parent_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_step_count integer;
  v_occurrence_count integer;
  v_step_ids jsonb;
  v_occurrence_ids jsonb;
  v_set_key text;
  v_qualified_at timestamptz;
  v_logical_date date;
  v_occurrence_id uuid;
  v_title text;
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id = p_user_id;
  if not found then return null; end if;
  update public.adhdice_achievement_occurrences step_set
    set is_currently_qualifying = false
    where step_set.user_id = p_user_id
      and step_set.source_kind = 'step_set'
      and step_set.root_parent_id = p_root_parent_id
      and step_set.is_currently_qualifying
      and exists (
        select 1
        from jsonb_array_elements_text(step_set.source_snapshot->'step_occurrence_ids') constituent(occurrence_id)
        join public.adhdice_achievement_occurrences source_occurrence
          on source_occurrence.id = constituent.occurrence_id::uuid
        where not source_occurrence.is_currently_qualifying
      );
  with recursive steps as (
    select id, parent_task_id from public.adhdice_clean_tasks
    where user_id = p_user_id and parent_task_id = p_root_parent_id
    union all
    select child.id, child.parent_task_id from public.adhdice_clean_tasks child
    join steps parent on child.parent_task_id = parent.id where child.user_id = p_user_id
  ), latest_candidate as (
    select distinct on (occ.entity_id) occ.entity_id, occ.id, occ.first_qualified_at, occ.logical_date,
      occ.is_currently_qualifying
    from public.adhdice_achievement_occurrences occ join steps on steps.id = occ.entity_id
    where occ.user_id = p_user_id and occ.entity_kind = 'step'
    order by occ.entity_id, occ.first_qualified_at desc, occ.id
  ), latest as (
    select entity_id, id, first_qualified_at, logical_date from latest_candidate
    where is_currently_qualifying
  )
  select (select count(*) from steps), count(latest.id),
    (select jsonb_agg(id order by id::text) from steps),
    jsonb_agg(latest.id order by latest.id::text), max(latest.first_qualified_at), max(latest.logical_date)
  into v_step_count, v_occurrence_count, v_step_ids, v_occurrence_ids, v_qualified_at, v_logical_date
  from latest;
  if v_step_count = 0 or v_occurrence_count <> v_step_count then return null; end if;
  v_set_key := 'parent-step-set:v1:' || p_root_parent_id::text || ':' || encode(extensions.digest(v_occurrence_ids::text, 'sha256'::text), 'hex');
  select title into v_title from public.adhdice_clean_tasks where id = p_root_parent_id and user_id = p_user_id;
  insert into public.adhdice_achievement_occurrences (
    user_id, source_kind, source_id, source_occurrence_key, dedupe_key, source_created_at,
    first_qualified_at, logical_date, week_key, week_start_date, week_end_date,
    month_key, month_start_date, month_end_date, timezone, logical_day_start,
    entity_kind, entity_id, root_parent_id, title_snapshot, outcome_snapshot,
    evaluator_version, catalog_version, source_snapshot
  ) values (
    p_user_id, 'step_set', encode(extensions.digest(v_set_key::text, 'sha256'::text), 'hex'), v_set_key,
    'occurrence:v1:step_set:' || v_set_key, v_qualified_at, v_qualified_at, v_logical_date,
    v_logical_date - extract(isodow from v_logical_date)::integer + 1,
    v_logical_date - extract(isodow from v_logical_date)::integer + 1,
    v_logical_date - extract(isodow from v_logical_date)::integer + 7,
    to_char(v_logical_date, 'YYYY-MM'), date_trunc('month', v_logical_date)::date,
    (date_trunc('month', v_logical_date) + interval '1 month - 1 day')::date,
    v_profile.timezone, v_profile.logical_day_start, 'parent_step_set', p_root_parent_id,
    p_root_parent_id, v_title, 'done', 'achievements-evaluator-v1', v_profile.catalog_version,
    jsonb_build_object('step_ids', v_step_ids, 'step_occurrence_ids', v_occurrence_ids)
  ) on conflict (user_id, dedupe_key) do update set is_currently_qualifying = true
  returning id into v_occurrence_id;
  return v_occurrence_id;
end;
$function$;

create or replace function public.adhdice_achievement_streak_metadata(
  p_user_id uuid, p_mode text, p_as_of date
) returns jsonb
language plpgsql stable
set search_path = ''
as $function$
declare v_result jsonb;
begin
  with qualified_days as (
    select logical_date from public.adhdice_achievement_occurrences
    where user_id = p_user_id and is_currently_qualifying and (
      (p_mode = 'parent' and entity_kind = 'parent_task') or
      (p_mode = 'moving' and entity_kind in ('parent_task', 'step'))
    ) group by logical_date
    union
    select logical_date from public.adhdice_achievement_occurrences
    where user_id = p_user_id and is_currently_qualifying and p_mode = 'focus' and entity_kind = 'focus_session'
    group by logical_date having sum(active_duration_seconds) >= 1800
  ), numbered as (
    select logical_date, logical_date - row_number() over (order by logical_date)::integer as run_key from qualified_days
  ), runs as (
    select min(logical_date) start_date, max(logical_date) end_date, count(*)::bigint length
    from numbered group by run_key
  ), best as (
    select * from runs order by length desc, end_date asc limit 1
  ), current_run as (
    select * from runs where end_date >= p_as_of - 1 order by end_date desc limit 1
  )
  select jsonb_build_object(
    'best', coalesce((select length from best), 0),
    'best_start', (select start_date from best), 'best_end', (select end_date from best),
    'current', coalesce((select length from current_run), 0),
    'current_start', (select start_date from current_run), 'current_end', (select end_date from current_run),
    'runs', coalesce((select jsonb_agg(jsonb_build_object('start',start_date,'end',end_date,'length',length) order by start_date) from runs), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.adhdice_achievement_thresholds()
returns table(track_id text, tier text, threshold_value bigint, tier_order integer)
language sql immutable
set search_path = ''
as $function$
  select * from (values
    ('i_can_count_to_ten','bronze',50,1),('i_can_count_to_ten','silver',100,2),('i_can_count_to_ten','gold',150,3),('i_can_count_to_ten','platinum',200,4),
    ('fifty_two_each_year','bronze',100,1),('fifty_two_each_year','silver',150,2),('fifty_two_each_year','gold',200,3),('fifty_two_each_year','platinum',250,4),
    ('twelve_each_year','bronze',500,1),('twelve_each_year','silver',600,2),('twelve_each_year','gold',800,3),('twelve_each_year','platinum',1000,4),
    ('count_on_me','bronze',1000,1),('count_on_me','silver',2000,2),('count_on_me','gold',3000,3),('count_on_me','platinum',6000,4),
    ('first_step','bronze',30,1),('first_step','silver',60,2),('first_step','gold',90,3),('first_step','platinum',100,4),
    ('second_step','bronze',100,1),('second_step','silver',200,2),('second_step','gold',300,3),('second_step','platinum',500,4),
    ('third_step','bronze',1000,1),('third_step','silver',2000,2),('third_step','gold',3000,3),('third_step','platinum',5000,4),
    ('last_step','bronze',1,1),('last_step','silver',50,2),('last_step','gold',75,3),('last_step','platinum',150,4),
    ('broken_clock','bronze',14400,1),('broken_clock','silver',28800,2),('broken_clock','gold',36000,3),('broken_clock','platinum',43200,4),
    ('overtime','bronze',72000,1),('overtime','silver',108000,2),('overtime','gold',144000,3),('overtime','platinum',180000,4),
    ('february_challenge','bronze',288000,1),('february_challenge','silver',432000,2),('february_challenge','gold',576000,3),('february_challenge','platinum',648000,4),
    ('locked_in','bronze',360000,1),('locked_in','silver',900000,2),('locked_in','gold',1800000,3),('locked_in','platinum',3600000,4),
    ('staring_contest','bronze',7200,1),('staring_contest','silver',10800,2),('staring_contest','gold',14400,3),('staring_contest','platinum',18000,4),
    ('session_possible','bronze',100,1),('session_possible','silver',250,2),('session_possible','gold',500,3),('session_possible','platinum',1000,4),
    ('do_something','bronze',3,1),('do_something','silver',7,2),('do_something','gold',30,3),('do_something','platinum',90,4),
    ('dont_get_distracted','bronze',3,1),('dont_get_distracted','silver',7,2),('dont_get_distracted','gold',30,3),('dont_get_distracted','platinum',90,4),
    ('this_week_on_the_streak','bronze',1,1),('this_week_on_the_streak','silver',2,2),('this_week_on_the_streak','gold',3,3),('this_week_on_the_streak','platinum',4,4),
    ('keep_it_moving','bronze',7,1),('keep_it_moving','silver',14,2),('keep_it_moving','gold',30,3),('keep_it_moving','platinum',90,4)
  ) threshold(track_id, tier, threshold_value, tier_order)
$function$;

create or replace function public.adhdice_rebuild_achievement_progress(
  p_user_id uuid, p_run_id uuid, p_awarded_at timestamptz
) returns void
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_today date;
  v_parent_streak jsonb;
  v_focus_streak jsonb;
  v_moving_streak jsonb;
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id = p_user_id;
  if not found then return; end if;
  v_today := public.adhdice_achievement_logical_date(clock_timestamp(), v_profile.timezone, v_profile.logical_day_start);
  v_parent_streak := public.adhdice_achievement_streak_metadata(p_user_id, 'parent', v_today);
  v_focus_streak := public.adhdice_achievement_streak_metadata(p_user_id, 'focus', v_today);
  v_moving_streak := public.adhdice_achievement_streak_metadata(p_user_id, 'moving', v_today);

  delete from public.adhdice_achievement_occurrence_matches where user_id = p_user_id;
  insert into public.adhdice_achievement_occurrence_matches (user_id, occurrence_id, track_id, catalog_version)
  select occurrence.user_id, occurrence.id, track.track_id, v_profile.catalog_version
  from public.adhdice_achievement_occurrences occurrence
  cross join lateral (values
    ('count_on_me'),('i_can_count_to_ten'),('fifty_two_each_year'),('twelve_each_year'),('do_something'),('this_week_on_the_streak'),('keep_it_moving')
  ) track(track_id)
  where occurrence.user_id = p_user_id and occurrence.is_currently_qualifying and occurrence.entity_kind = 'parent_task'
  union all
  select occurrence.user_id, occurrence.id, track.track_id, v_profile.catalog_version
  from public.adhdice_achievement_occurrences occurrence
  cross join lateral (values ('first_step'),('second_step'),('third_step'),('keep_it_moving')) track(track_id)
  where occurrence.user_id = p_user_id and occurrence.is_currently_qualifying and occurrence.entity_kind = 'step'
  union all
  select occurrence.user_id, occurrence.id, track.track_id, v_profile.catalog_version
  from public.adhdice_achievement_occurrences occurrence
  cross join lateral (values ('broken_clock'),('overtime'),('february_challenge'),('locked_in'),('staring_contest'),('session_possible'),('dont_get_distracted')) track(track_id)
  where occurrence.user_id = p_user_id and occurrence.is_currently_qualifying and occurrence.entity_kind = 'focus_session'
  union all
  select occurrence.user_id, occurrence.id, 'last_step', v_profile.catalog_version
  from public.adhdice_achievement_occurrences occurrence
  where occurrence.user_id = p_user_id and occurrence.is_currently_qualifying and occurrence.entity_kind = 'parent_step_set'
  on conflict (occurrence_id, track_id) do nothing;

  with values_by_track(track_id, current_value, streak) as (
    values
      ('i_can_count_to_ten', (select count(*) from (select logical_date from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_task' group by logical_date having count(*) >= 10) x), null::jsonb),
      ('fifty_two_each_year', coalesce((select max(total) from (select count(*) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_task' group by week_key) x),0), null),
      ('twelve_each_year', coalesce((select max(total) from (select count(*) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_task' group by month_key) x),0), null),
      ('count_on_me', (select count(*) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_task'), null),
      ('first_step', coalesce((select max(total) from (select count(*) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='step' group by logical_date) x),0), null),
      ('second_step', coalesce((select max(total) from (select count(*) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='step' group by week_key) x),0), null),
      ('third_step', (select count(*) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='step'), null),
      ('last_step', (select count(*) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_step_set'), null),
      ('broken_clock', coalesce((select max(total) from (select sum(active_duration_seconds) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session' group by logical_date) x),0), null),
      ('overtime', coalesce((select max(total) from (select sum(active_duration_seconds) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session' group by week_key) x),0), null),
      ('february_challenge', coalesce((select max(total) from (select sum(active_duration_seconds) total from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session' group by month_key) x),0), null),
      ('locked_in', coalesce((select sum(active_duration_seconds) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session'),0), null),
      ('staring_contest', coalesce((select max(active_duration_seconds) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session'),0), null),
      ('session_possible', (select count(*) from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='focus_session' and active_duration_seconds >= 600), null),
      ('do_something', (v_parent_streak->>'best')::bigint, v_parent_streak),
      ('dont_get_distracted', (v_focus_streak->>'best')::bigint, v_focus_streak),
      ('this_week_on_the_streak', (select count(*) from (select week_key from public.adhdice_achievement_occurrences where user_id=p_user_id and is_currently_qualifying and entity_kind='parent_task' and week_end_date < v_today group by week_key having count(distinct logical_date)=7) x), null),
      ('keep_it_moving', (v_moving_streak->>'best')::bigint, v_moving_streak)
  )
  insert into public.adhdice_achievement_progress (
    user_id, track_id, current_value, current_streak, best_streak,
    current_streak_start, current_streak_end, best_streak_start, best_streak_end,
    source_watermark, recalculation_metadata, evaluator_version, catalog_version, last_recalculated_at
  ) select p_user_id, track_id, current_value,
    coalesce((streak->>'current')::bigint,0), coalesce((streak->>'best')::bigint,0),
    (streak->>'current_start')::date, (streak->>'current_end')::date,
    (streak->>'best_start')::date, (streak->>'best_end')::date,
    jsonb_build_object('occurrence_count',(select count(*) from public.adhdice_achievement_occurrences where user_id=p_user_id)),
    jsonb_build_object('run_id',p_run_id,'streak_runs',coalesce(streak->'runs','[]'::jsonb)),
    'achievements-evaluator-v1', v_profile.catalog_version, p_awarded_at
  from values_by_track
  on conflict (user_id, track_id) do update set
    current_value=excluded.current_value, current_streak=excluded.current_streak, best_streak=excluded.best_streak,
    current_streak_start=excluded.current_streak_start, current_streak_end=excluded.current_streak_end,
    best_streak_start=excluded.best_streak_start, best_streak_end=excluded.best_streak_end,
    source_watermark=excluded.source_watermark, recalculation_metadata=excluded.recalculation_metadata,
    evaluator_version=excluded.evaluator_version, catalog_version=excluded.catalog_version,
    last_recalculated_at=excluded.last_recalculated_at;

  insert into public.adhdice_achievement_tier_awards (
    user_id, track_id, tier, award_key, earned_at, evaluation_run_id, evaluator_version, catalog_version
  ) select p_user_id, threshold.track_id, threshold.tier,
    'tier-award:v1:' || threshold.track_id || ':' || threshold.tier,
    p_awarded_at + (threshold.tier_order * interval '1 microsecond'), p_run_id,
    'achievements-evaluator-v1', v_profile.catalog_version
  from public.adhdice_achievement_thresholds() threshold
  join public.adhdice_achievement_progress progress
    on progress.user_id=p_user_id and progress.track_id=threshold.track_id
  where progress.current_value >= threshold.threshold_value
  order by threshold.track_id, threshold.tier_order
  on conflict (user_id, track_id, tier) do nothing;

  insert into public.adhdice_achievement_collection_awards (
    user_id, collection_id, mastery_version, catalog_version, award_key,
    required_track_ids_snapshot, required_tracks_fingerprint, earned_at, evaluation_run_id
  )
  select p_user_id, collection_id, v_profile.launch_mastery_version, v_profile.catalog_version,
    'collection-award:v1:' || collection_id || ':' || v_profile.launch_mastery_version,
    required_tracks, encode(extensions.digest(required_tracks::text, 'sha256'::text), 'hex'), p_awarded_at + interval '10 microseconds', p_run_id
  from (values
    ('you_can_count_on_me', '["i_can_count_to_ten","fifty_two_each_year","twelve_each_year","count_on_me"]'::jsonb),
    ('one_step_at_a_time', '["first_step","second_step","third_step","last_step"]'::jsonb),
    ('clocked_in', '["broken_clock","overtime","february_challenge","locked_in","staring_contest","session_possible"]'::jsonb),
    ('were_going_streaking', '["do_something","dont_get_distracted","this_week_on_the_streak","keep_it_moving"]'::jsonb)
  ) collection(collection_id, required_tracks)
  where not exists (
    select 1 from jsonb_array_elements_text(required_tracks) required(track_id)
    where not exists (select 1 from public.adhdice_achievement_tier_awards award
      where award.user_id=p_user_id and award.track_id=required.track_id and award.tier='platinum')
  ) on conflict (user_id, collection_id, mastery_version) do nothing;

  insert into public.adhdice_achievement_notifications (user_id, award_kind, tier_award_id, dedupe_key)
  select p_user_id, 'tier', id, 'notification:v1:' || award_key
  from public.adhdice_achievement_tier_awards where user_id=p_user_id
  on conflict (user_id, dedupe_key) do nothing;
  insert into public.adhdice_achievement_notifications (user_id, award_kind, collection_award_id, dedupe_key)
  select p_user_id, 'collection', id, 'notification:v1:' || award_key
  from public.adhdice_achievement_collection_awards where user_id=p_user_id
  on conflict (user_id, dedupe_key) do nothing;
end;
$function$;

create or replace function public.adhdice_evaluate_achievements(
  p_user_id uuid, p_operation_id uuid, p_mode text default 'immediate'
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_run public.adhdice_achievement_evaluation_runs%rowtype;
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id=p_user_id;
  if not found then return jsonb_build_object('status','inactive'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':achievement-evaluation',0));
  select * into v_run from public.adhdice_achievement_evaluation_runs where user_id=p_user_id and operation_id=p_operation_id;
  if found and v_run.status='completed' then return jsonb_build_object('status','completed','run_id',v_run.id,'replayed',true); end if;
  insert into public.adhdice_achievement_evaluation_runs (
    operation_id,user_id,mode,status,catalog_version,rules_version
  ) values (p_operation_id,p_user_id,p_mode,'running',v_profile.catalog_version,v_profile.rules_version)
  on conflict (user_id,operation_id) do update set status='running',completed_at=null,error_code=null,error_message=null
  returning * into v_run;
  begin
    perform public.adhdice_rebuild_achievement_progress(p_user_id,v_run.id,v_now);
    update public.adhdice_achievement_evaluation_runs set status='completed',completed_at=clock_timestamp()
      where id=v_run.id;
    return jsonb_build_object('status','completed','run_id',v_run.id,'replayed',false);
  exception when others then
    update public.adhdice_achievement_evaluation_runs set status='failed',completed_at=clock_timestamp(),
      error_code=left(sqlstate,80),error_message=left(sqlerrm,500) where id=v_run.id;
    return jsonb_build_object('status','failed','error_code',sqlstate);
  end;
end;
$function$;

create or replace function public.adhdice_record_achievement_evaluation_failure(
  p_user_id uuid, p_operation_id uuid, p_mode text, p_error_code text, p_error_message text
) returns void
language plpgsql security definer
set search_path = ''
as $function$
declare v_profile public.adhdice_achievement_profiles%rowtype;
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id=p_user_id;
  if not found then return; end if;
  insert into public.adhdice_achievement_evaluation_runs (
    operation_id,user_id,mode,status,catalog_version,rules_version,error_code,error_message,completed_at
  ) values (
    p_operation_id,p_user_id,p_mode,'failed',v_profile.catalog_version,v_profile.rules_version,
    left(coalesce(p_error_code,'P0001'),80),left(coalesce(p_error_message,'Achievement evaluation failed.'),500),clock_timestamp()
  ) on conflict (user_id,operation_id) do update set
    status='failed',completed_at=excluded.completed_at,error_code=excluded.error_code,error_message=excluded.error_message;
end;
$function$;

create or replace function public.adhdice_capture_and_evaluate_achievement_source()
returns trigger
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_operation_id uuid;
  v_occurrence_id uuid;
  v_root_id uuid;
  v_deferred_user_id text;
  v_is_deferred boolean;
begin
  v_user_id := new.user_id;
  v_deferred_user_id := current_setting('adhdice.achievement_deferred_user_id', true);
  v_is_deferred := coalesce(v_deferred_user_id = v_user_id::text, false);
  v_operation_id := md5(tg_table_name || ':' || new.id::text || ':' || to_jsonb(new)::text)::uuid;
  begin
    if tg_table_name='adhdice_task_history_facts' then
      v_occurrence_id := public.adhdice_capture_task_achievement_occurrence(new.id);
      if v_occurrence_id is not null then
        select root_parent_id into v_root_id from public.adhdice_achievement_occurrences where id=v_occurrence_id;
        if v_root_id is not null then perform public.adhdice_refresh_achievement_step_set(v_user_id,v_root_id); end if;
      end if;
    else
      perform public.adhdice_capture_focus_achievement_occurrence(new.id);
    end if;
    if not v_is_deferred then
      perform public.adhdice_evaluate_achievements(v_user_id,v_operation_id,'immediate');
    end if;
  exception when others then
    if v_is_deferred then
      raise;
    end if;
    -- Source history remains authoritative; a later resumable recalculation repairs capture.
    perform public.adhdice_record_achievement_evaluation_failure(v_user_id,v_operation_id,'immediate',sqlstate,sqlerrm);
  end;
  return new;
end;
$function$;

drop trigger if exists adhdice_capture_task_achievement_runtime on public.adhdice_task_history;
create trigger adhdice_capture_task_achievement_runtime
  after insert or update of entity_id, entity_kind, logical_date, outcome, event_kind,
    occurrence_id, scheduled_due_on, effective_due_on, schedule_boundary_id,
    provenance_kind, actor_kind, actor_id, source, source_legacy_history_id
  on public.adhdice_task_history_facts for each row
  execute function public.adhdice_capture_and_evaluate_achievement_source();

drop trigger if exists adhdice_capture_focus_achievement_runtime on public.adhdice_focus_sessions;
create trigger adhdice_capture_focus_achievement_runtime
  after insert or update of duration_seconds, session_date, title_snapshot, ended_at
  on public.adhdice_focus_sessions for each row
  execute function public.adhdice_capture_and_evaluate_achievement_source();

create or replace function public.adhdice_deactivate_deleted_achievement_source()
returns trigger
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_operation_id uuid := md5(tg_table_name || ':delete:' || old.id::text || ':' || to_jsonb(old)::text)::uuid;
  v_occurrence public.adhdice_achievement_occurrences%rowtype;
  v_match_count integer := 0;
begin
  begin
    if tg_table_name = 'adhdice_task_history_facts'
      and not exists (select 1 from public.adhdice_clean_tasks where id=old.entity_id and user_id=old.user_id) then
      return old;
    end if;
    if tg_table_name = 'adhdice_task_history_facts' then
      select count(*) into v_match_count
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = old.user_id
        and occurrence.source_kind = 'task_history'
        and (
          occurrence.source_id = old.id::text
          or occurrence.source_snapshot->>'history_fact_id' = old.id::text
          or (occurrence.entity_id = old.entity_id and occurrence.logical_date = old.logical_date)
        );
      if v_match_count > 1 then
        raise exception 'Ambiguous Achievement mapping for deleted canonical History fact %.', old.id;
      end if;
      if v_match_count = 1 then
        select * into v_occurrence
        from public.adhdice_achievement_occurrences occurrence
        where occurrence.user_id = old.user_id
          and occurrence.source_kind = 'task_history'
          and (
            occurrence.source_id = old.id::text
            or occurrence.source_snapshot->>'history_fact_id' = old.id::text
            or (occurrence.entity_id = old.entity_id and occurrence.logical_date = old.logical_date)
          );
      end if;
    else
      select * into v_occurrence from public.adhdice_achievement_occurrences
        where user_id=old.user_id and source_kind='focus_session' and source_id=old.id::text;
    end if;
    if v_occurrence.id is not null then
      update public.adhdice_achievement_occurrences
      set is_currently_qualifying=false,
          source_snapshot = source_snapshot || jsonb_build_object('source_deleted_at', clock_timestamp())
      where id=v_occurrence.id;
      if v_occurrence.root_parent_id is not null then
        perform public.adhdice_refresh_achievement_step_set(old.user_id,v_occurrence.root_parent_id);
      end if;
      perform public.adhdice_evaluate_achievements(old.user_id,v_operation_id,'immediate');
    end if;
  exception when others then
    perform public.adhdice_record_achievement_evaluation_failure(old.user_id,v_operation_id,'immediate',sqlstate,sqlerrm);
  end;
  return old;
end;
$function$;

drop trigger if exists adhdice_deactivate_deleted_task_achievement_runtime on public.adhdice_task_history;
create trigger adhdice_deactivate_deleted_task_achievement_runtime
  after delete on public.adhdice_task_history_facts for each row
  execute function public.adhdice_deactivate_deleted_achievement_source();
drop trigger if exists adhdice_deactivate_deleted_focus_achievement_runtime on public.adhdice_focus_sessions;
create trigger adhdice_deactivate_deleted_focus_achievement_runtime
  after delete on public.adhdice_focus_sessions for each row
  execute function public.adhdice_deactivate_deleted_achievement_source();

create or replace function public.adhdice_recalculate_achievements(
  p_operation_id uuid, p_cursor jsonb default '{}'::jsonb, p_batch_size integer default 500
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_run public.adhdice_achievement_evaluation_runs%rowtype;
  v_record record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_last_created_at timestamptz := coalesce((p_cursor->>'created_at')::timestamptz,'-infinity'::timestamptz);
  v_last_kind text := coalesce(p_cursor->>'source_kind','');
  v_last_id uuid := coalesce((p_cursor->>'source_id')::uuid,'00000000-0000-0000-0000-000000000000'::uuid);
  v_next_cursor jsonb := p_cursor;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null or p_batch_size < 1 or p_batch_size > 2000 then raise exception 'Invalid recalculation request'; end if;
  select * into v_profile from public.adhdice_achievement_profiles where user_id=v_user_id;
  if not found then raise exception 'Achievement profile is not activated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':achievement-evaluation',0));
  insert into public.adhdice_achievement_evaluation_runs (
    operation_id,user_id,mode,status,catalog_version,rules_version,cursor_metadata,window_metadata
  ) values (
    p_operation_id,v_user_id,'recalculation','running',v_profile.catalog_version,v_profile.rules_version,p_cursor,
    jsonb_build_object('activated_at',v_profile.activated_at,'activation_logical_date',
      public.adhdice_achievement_logical_date(v_profile.activated_at,v_profile.timezone,v_profile.logical_day_start))
  )
  on conflict (user_id,operation_id) do update set status='running',completed_at=null,error_code=null,error_message=null,
    cursor_metadata=p_cursor,window_metadata=excluded.window_metadata
  returning * into v_run;

  begin
  update public.adhdice_achievement_occurrences occurrence set is_currently_qualifying=false
    where occurrence.user_id=v_user_id and occurrence.source_kind='focus_session'
      and not exists (select 1 from public.adhdice_focus_sessions session where session.id=occurrence.source_id::uuid and session.user_id=v_user_id);
  update public.adhdice_achievement_occurrences occurrence set is_currently_qualifying=false
    where occurrence.user_id=v_user_id and occurrence.source_kind='task_history'
      and exists (select 1 from public.adhdice_clean_tasks task where task.id=occurrence.entity_id and task.user_id=v_user_id)
      and not exists (
        select 1
        from public.adhdice_task_history_facts fact
        join public.adhdice_achievement_profiles profile on profile.user_id=fact.user_id
        where fact.user_id=v_user_id and fact.entity_id=occurrence.entity_id and fact.logical_date=occurrence.logical_date
          and fact.created_at>=profile.activated_at
          and fact.logical_date>=public.adhdice_achievement_logical_date(profile.activated_at,profile.timezone,profile.logical_day_start)
      );
  for v_record in
    with sources as (
      select fact.created_at,'task_history'::text source_kind,fact.id source_id
      from public.adhdice_task_history_facts fact
      where fact.user_id=v_user_id and fact.created_at>=v_profile.activated_at
        and fact.logical_date>=public.adhdice_achievement_logical_date(v_profile.activated_at,v_profile.timezone,v_profile.logical_day_start)
      union all
      select session.created_at,'focus_session',session.id
      from public.adhdice_focus_sessions session
      where session.user_id=v_user_id and session.created_at>=v_profile.activated_at
        and session.session_date>=public.adhdice_achievement_logical_date(v_profile.activated_at,v_profile.timezone,v_profile.logical_day_start)
    )
    select * from sources
    where (created_at,source_kind,source_id)>(v_last_created_at,v_last_kind,v_last_id)
    order by created_at,source_kind,source_id limit p_batch_size+1
  loop
    if v_count=p_batch_size then v_has_more:=true; exit; end if;
    if v_record.source_kind='task_history' then
      perform public.adhdice_capture_task_achievement_occurrence(v_record.source_id);
    else perform public.adhdice_capture_focus_achievement_occurrence(v_record.source_id); end if;
    v_count:=v_count+1;
    v_next_cursor:=jsonb_build_object('created_at',v_record.created_at,'source_kind',v_record.source_kind,'source_id',v_record.source_id);
  end loop;

  for v_record in select distinct root_parent_id from public.adhdice_achievement_occurrences
    where user_id=v_user_id and entity_kind='step' and is_currently_qualifying and root_parent_id is not null
  loop perform public.adhdice_refresh_achievement_step_set(v_user_id,v_record.root_parent_id); end loop;
  perform public.adhdice_rebuild_achievement_progress(v_user_id,v_run.id,clock_timestamp());
  update public.adhdice_achievement_evaluation_runs set cursor_metadata=v_next_cursor,
    status=case when v_has_more then 'running' else 'completed' end,
    completed_at=case when v_has_more then null else clock_timestamp() end
  where id=v_run.id;
  return jsonb_build_object('status',case when v_has_more then 'running' else 'completed' end,
    'run_id',v_run.id,'processed',v_count,'has_more',v_has_more,'next_cursor',v_next_cursor);
  exception when others then
    update public.adhdice_achievement_evaluation_runs
    set status='failed',completed_at=clock_timestamp(),error_code=left(sqlstate,80),error_message=left(sqlerrm,500)
    where id=v_run.id;
    return jsonb_build_object('status','failed','error_code',sqlstate);
  end;
end;
$function$;

revoke all on function public.adhdice_recalculate_achievements(uuid,jsonb,integer) from public,anon;
grant execute on function public.adhdice_recalculate_achievements(uuid,jsonb,integer) to authenticated;
revoke all on function public.adhdice_evaluate_achievements(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.adhdice_capture_task_achievement_occurrence(uuid) from public,anon,authenticated;
revoke all on function public.adhdice_capture_focus_achievement_occurrence(uuid) from public,anon,authenticated;
revoke all on function public.adhdice_achievement_root_parent(uuid,uuid) from public,anon,authenticated;
revoke all on function public.adhdice_refresh_achievement_step_set(uuid,uuid) from public,anon,authenticated;
revoke all on function public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.adhdice_record_achievement_evaluation_failure(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.adhdice_capture_and_evaluate_achievement_source() from public,anon,authenticated;
revoke all on function public.adhdice_deactivate_deleted_achievement_source() from public,anon,authenticated;

notify pgrst, 'reload schema';
commit;

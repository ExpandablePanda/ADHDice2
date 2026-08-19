-- ADHDice Achievement canonical History cleanup for 7.9.46.
-- Replaces Task Achievement's legacy History source with adhdice_task_history_facts.
-- Apply after the canonical Task History schema and Achievement runtime definitions.
-- No production execution is implied by this source file.
begin;

alter table public.adhdice_achievement_occurrences
  drop constraint if exists adhdice_achievement_occurrences_outcome_snapshot_check,
  add constraint adhdice_achievement_occurrences_outcome_snapshot_check
    check (outcome_snapshot is null or outcome_snapshot in ('done', 'complete', 'did_my_best', 'missed', 'delayed')),
  drop constraint if exists adhdice_achievement_occurrences_snapshot_check,
  add constraint adhdice_achievement_occurrences_snapshot_check
    check (outcome_snapshot is not null or active_duration_seconds is not null or not is_currently_qualifying);

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

  -- Tier E is a logical-identity bridge for an existing lifetime occurrence
  -- whose physical/source evidence predates this canonical History fact. It is
  -- deliberately unavailable when Tier D found stale same-Task/date siblings:
  -- true Tier D ambiguity must create the canonical fallback occurrence rather
  -- than selecting one sibling by a similar logical identity.
  if v_match_tier = 0 and v_match_count = 0 and not v_fallback_ambiguous then
    select count(*) into v_match_count
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = v_history.user_id
      and occurrence.source_kind = 'task_history'
      and occurrence.dedupe_key = v_dedupe_key;
    if v_match_count > 1 then
      raise exception 'Ambiguous Achievement tier E mapping for canonical History fact %.', v_history.id;
    end if;
    if v_match_count = 1 then
      v_match_tier := 5;
      select * into v_existing
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = v_history.user_id
        and occurrence.source_kind = 'task_history'
        and occurrence.dedupe_key = v_dedupe_key;
    end if;
  end if;

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

do $reconcile$
declare
  v_record record;
  v_occurrence_id uuid;
  v_root_id uuid;
begin
  -- Live Tasks cannot retain current qualification without canonical Task/date evidence.
  update public.adhdice_achievement_occurrences occurrence
  set is_currently_qualifying = false,
      source_snapshot = occurrence.source_snapshot || jsonb_build_object('reconciled_without_canonical_fact_at', clock_timestamp())
  where occurrence.source_kind = 'task_history'
    and exists (select 1 from public.adhdice_clean_tasks task
      where task.id = occurrence.entity_id and task.user_id = occurrence.user_id)
    and not exists (select 1
      from public.adhdice_task_history_facts fact
      join public.adhdice_achievement_profiles profile on profile.user_id = fact.user_id
      where fact.user_id = occurrence.user_id
        and fact.entity_id = occurrence.entity_id
        and fact.logical_date = occurrence.logical_date
        and fact.created_at >= profile.activated_at
        and fact.logical_date >= public.adhdice_achievement_logical_date(profile.activated_at, profile.timezone, profile.logical_day_start));

  for v_record in
    select fact.id, fact.user_id
    from public.adhdice_task_history_facts fact
    join public.adhdice_achievement_profiles profile on profile.user_id = fact.user_id
    where fact.created_at >= profile.activated_at
      and fact.logical_date >= public.adhdice_achievement_logical_date(profile.activated_at, profile.timezone, profile.logical_day_start)
    order by fact.created_at, fact.id
  loop
    v_occurrence_id := public.adhdice_capture_task_achievement_occurrence(v_record.id);
    if v_occurrence_id is not null then
      select root_parent_id into v_root_id
      from public.adhdice_achievement_occurrences where id = v_occurrence_id;
      if v_root_id is not null then
        perform public.adhdice_refresh_achievement_step_set(v_record.user_id, v_root_id);
      end if;
    end if;
  end loop;

  for v_record in
    select distinct user_id from public.adhdice_achievement_profiles
  loop
    perform public.adhdice_evaluate_achievements(
      v_record.user_id,
      md5('achievement-canonical-history-7.9.46:' || v_record.user_id::text)::uuid,
      'recalculation'
    );
  end loop;
end;
$reconcile$;

notify pgrst, 'reload schema';
commit;

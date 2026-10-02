-- ADHDice 7.16.35 incremental Achievement runtime cutover.
-- SOURCE ONLY: do not apply automatically, deploy an Edge Function, or mutate
-- production Task, History, Achievement, reward, or notification data.
-- Apply only after the 7.16.34 foundation and explicit production approval.
--
-- Required production order:
--   1. 7.16.34 incremental Achievement foundation
--   2. 7.16.35 incremental runtime cutover
--   3. live verification
--
-- The full evaluator/rebuild remains available as the explicit repair and
-- reference path. Ordinary source mutations use only this bounded path.

begin;

do $guard$
begin
  if to_regprocedure('public.adhdice_achievement_track_dependencies()') is null
     or to_regprocedure('public.adhdice_sync_achievement_occurrence_matches(uuid[])') is null
     or to_regprocedure('public.adhdice_rebuild_achievement_progress_for_tracks(uuid,text[],uuid,timestamptz)') is null then
    raise exception '7.16.34 incremental Achievement foundation is not installed.';
  end if;
  if to_regprocedure('public.adhdice_capture_task_achievement_occurrence(uuid)') is null
     or to_regprocedure('public.adhdice_capture_focus_achievement_occurrence(uuid)') is null
     or to_regprocedure('public.adhdice_refresh_achievement_step_set(uuid,uuid)') is null
     or to_regprocedure('public.adhdice_record_achievement_evaluation_failure(uuid,uuid,text,text,text)') is null
     or to_regprocedure('public.adhdice_evaluate_achievements(uuid,uuid,text)') is null then
    raise exception 'Active Achievement source/evaluator functions are not installed.';
  end if;
  if to_regprocedure('public.adhdice_execute_task_state_command(uuid,jsonb)') is null then
    raise exception 'Canonical Task State command RPC is not installed.';
  end if;
  if to_regprocedure('public.adhdice_execute_task_state_command_deferred_achievements(uuid,jsonb)') is null
     or to_regprocedure('public.adhdice_finalize_task_history_batch_achievements(uuid,uuid)') is null then
    raise exception 'History batch Achievement boundary is not installed.';
  end if;
end;
$guard$;

-- Resolve every occurrence whose match state may have changed. History source
-- IDs cover the canonical fact; entity/date and superseded snapshot checks
-- cover same-day siblings; root IDs cover both invalidated and newly created
-- Step-set occurrences. Explicit occurrence IDs are required for deleted
-- source rows, which no longer exist to resolve by source ID.
create or replace function public.adhdice_resolve_achievement_affected_occurrence_ids(
  p_user_id uuid,
  p_history_fact_ids uuid[] default '{}'::uuid[],
  p_focus_session_ids uuid[] default '{}'::uuid[],
  p_occurrence_ids uuid[] default '{}'::uuid[],
  p_root_parent_ids uuid[] default '{}'::uuid[]
) returns uuid[]
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_occurrence_ids uuid[];
begin
  if p_user_id is null then
    raise exception 'An Achievement source owner is required.' using errcode = '22023';
  end if;

  with requested_history as (
    select fact.id, fact.entity_id, fact.logical_date, fact.source_legacy_history_id
    from public.adhdice_task_history_facts fact
    where fact.user_id = p_user_id
      and fact.id = any(coalesce(p_history_fact_ids, '{}'::uuid[]))
  ), direct_occurrences as (
    select occurrence.id, occurrence.root_parent_id, occurrence.entity_kind, occurrence.source_kind
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = p_user_id
      and (
        occurrence.id = any(coalesce(p_occurrence_ids, '{}'::uuid[]))
        or (
          occurrence.source_kind = 'task_history'
          and (
            exists (
              select 1
              from requested_history history
              where occurrence.source_id in (history.id::text, history.source_legacy_history_id::text)
                 or occurrence.source_snapshot->>'history_fact_id' = history.id::text
                 or occurrence.source_snapshot->>'superseded_by_history_fact_id' = history.id::text
                 or (occurrence.entity_id = history.entity_id and occurrence.logical_date = history.logical_date)
            )
            or occurrence.source_id in (
              select history_fact_id::text
              from unnest(coalesce(p_history_fact_ids, '{}'::uuid[])) history(history_fact_id)
            )
          )
        )
        or (
          occurrence.source_kind = 'focus_session'
          and occurrence.source_id in (
            select focus_session_id::text
            from unnest(coalesce(p_focus_session_ids, '{}'::uuid[])) focus(focus_session_id)
          )
        )
      )
  ), affected_roots as (
    select root_parent_id
    from direct_occurrences
    where root_parent_id is not null
      and (entity_kind = 'step' or source_kind = 'step_set')
    union
    select root_parent_id
    from unnest(coalesce(p_root_parent_ids, '{}'::uuid[])) roots(root_parent_id)
    where root_parent_id is not null
  ), all_affected as (
    select id
    from direct_occurrences
    union
    select occurrence.id
    from public.adhdice_achievement_occurrences occurrence
    join affected_roots root on root.root_parent_id = occurrence.root_parent_id
    where occurrence.user_id = p_user_id
      and occurrence.source_kind = 'step_set'
  )
  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_occurrence_ids
  from (select distinct id from all_affected) affected;

  if pg_catalog.cardinality(v_occurrence_ids) > 500 then
    raise exception 'Incremental Achievement source changes exceed the 500-occurrence bound.' using errcode = '22023';
  end if;
  return v_occurrence_ids;
end;
$function$;

-- One evaluation-run/idempotency/advisory-lock boundary for bounded source
-- reconciliation. Track IDs are derived from the central dependency authority
-- even when an occurrence has just become non-qualifying, so stale matches and
-- decreased progress are reconciled for the correct tracks.
create or replace function public.adhdice_evaluate_achievements_incremental(
  p_user_id uuid,
  p_occurrence_ids uuid[],
  p_operation_id uuid,
  p_mode text default 'immediate'
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_run public.adhdice_achievement_evaluation_runs%rowtype;
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_occurrence_ids uuid[] := '{}'::uuid[];
  v_track_ids text[] := '{}'::text[];
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_operation_id is null then
    raise exception 'An Achievement user and operation are required.' using errcode = '22023';
  end if;
  if p_mode not in ('immediate', 'recalculation') then
    raise exception 'Unsupported incremental Achievement evaluation mode.' using errcode = '22023';
  end if;

  select * into v_profile
  from public.adhdice_achievement_profiles
  where user_id = p_user_id;
  if not found then
    return jsonb_build_object('status', 'inactive');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':achievement-evaluation', 0));
  select * into v_run
  from public.adhdice_achievement_evaluation_runs
  where user_id = p_user_id and operation_id = p_operation_id;
  if found and v_run.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'run_id', v_run.id, 'replayed', true);
  end if;

  insert into public.adhdice_achievement_evaluation_runs (
    operation_id, user_id, mode, status, catalog_version, rules_version
  ) values (
    p_operation_id, p_user_id, p_mode, 'running', v_profile.catalog_version, v_profile.rules_version
  ) on conflict (user_id, operation_id) do update set
    status = 'running', completed_at = null, error_code = null, error_message = null,
    mode = excluded.mode, catalog_version = excluded.catalog_version, rules_version = excluded.rules_version
  returning * into v_run;

  begin
    select coalesce(array_agg(distinct occurrence.id order by occurrence.id), '{}'::uuid[])
      into v_occurrence_ids
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.user_id = p_user_id
      and occurrence.id = any(coalesce(p_occurrence_ids, '{}'::uuid[]));

    if pg_catalog.cardinality(v_occurrence_ids) > 500 then
      raise exception 'Incremental Achievement evaluation exceeds the 500-occurrence bound.' using errcode = '22023';
    end if;

    perform public.adhdice_sync_achievement_occurrence_matches(v_occurrence_ids);

    select coalesce(array_agg(distinct dependency.track_id order by dependency.track_id), '{}'::text[])
      into v_track_ids
    from public.adhdice_achievement_occurrences occurrence
    join public.adhdice_achievement_track_dependencies() dependency
      on dependency.entity_kind = occurrence.entity_kind
    where occurrence.user_id = p_user_id
      and occurrence.id = any(v_occurrence_ids);

    if pg_catalog.cardinality(v_track_ids) > 0 then
      perform public.adhdice_rebuild_achievement_progress_for_tracks(
        p_user_id, v_track_ids, v_run.id, v_now
      );
    end if;

    update public.adhdice_achievement_evaluation_runs
    set status = 'completed', completed_at = clock_timestamp(),
        window_metadata = jsonb_build_object(
          'incremental', true,
          'occurrence_count', pg_catalog.cardinality(v_occurrence_ids),
          'track_ids', to_jsonb(v_track_ids)
        )
    where id = v_run.id;
    return jsonb_build_object(
      'status', 'completed', 'run_id', v_run.id, 'replayed', false,
      'occurrence_count', pg_catalog.cardinality(v_occurrence_ids),
      'track_ids', to_jsonb(v_track_ids)
    );
  exception when others then
    update public.adhdice_achievement_evaluation_runs
    set status = 'failed', completed_at = clock_timestamp(),
        error_code = left(sqlstate, 80), error_message = left(sqlerrm, 500)
    where id = v_run.id;
    return jsonb_build_object('status', 'failed', 'run_id', v_run.id, 'error_code', sqlstate);
  end;
end;
$function$;

create or replace function public.adhdice_evaluate_achievements_incremental_for_history_facts(
  p_user_id uuid,
  p_history_fact_ids uuid[],
  p_operation_id uuid,
  p_mode text default 'immediate'
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_occurrence_ids uuid[];
begin
  v_occurrence_ids := public.adhdice_resolve_achievement_affected_occurrence_ids(
    p_user_id, p_history_fact_ids, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[]
  );
  return public.adhdice_evaluate_achievements_incremental(
    p_user_id, v_occurrence_ids, p_operation_id, p_mode
  );
end;
$function$;

-- Normal source mutations now reconcile only their complete bounded source set.
-- The trigger still captures source evidence first and still defers the
-- evaluator when a batch/rollover transaction sets its transaction-local flag.
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
  v_before_ids uuid[] := '{}'::uuid[];
  v_after_ids uuid[] := '{}'::uuid[];
  v_affected_ids uuid[] := '{}'::uuid[];
  v_evaluation jsonb;
  v_deferred_user_id text;
  v_is_deferred boolean;
begin
  v_user_id := new.user_id;
  v_deferred_user_id := current_setting('adhdice.achievement_deferred_user_id', true);
  v_is_deferred := coalesce(v_deferred_user_id = v_user_id::text, false);
  v_operation_id := md5(tg_table_name || ':' || new.id::text || ':' || to_jsonb(new)::text)::uuid;
  begin
    if tg_table_name = 'adhdice_task_history_facts' then
      v_before_ids := public.adhdice_resolve_achievement_affected_occurrence_ids(
        v_user_id, array[new.id]::uuid[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[]
      );
      v_occurrence_id := public.adhdice_capture_task_achievement_occurrence(new.id);
      if v_occurrence_id is not null then
        select root_parent_id into v_root_id
        from public.adhdice_achievement_occurrences
        where id = v_occurrence_id and user_id = v_user_id;
      end if;
      if v_root_id is null and new.entity_kind <> 'parent' then
        v_root_id := public.adhdice_achievement_root_parent(new.entity_id, v_user_id);
      end if;
      if v_root_id is not null and new.entity_kind <> 'parent' then
        perform public.adhdice_refresh_achievement_step_set(v_user_id, v_root_id);
      end if;
      v_after_ids := public.adhdice_resolve_achievement_affected_occurrence_ids(
        v_user_id, array[new.id]::uuid[], '{}'::uuid[],
        case when v_occurrence_id is null then '{}'::uuid[] else array[v_occurrence_id] end,
        case when v_root_id is null or new.entity_kind = 'parent' then '{}'::uuid[] else array[v_root_id] end
      );
    else
      v_before_ids := public.adhdice_resolve_achievement_affected_occurrence_ids(
        v_user_id, '{}'::uuid[], array[new.id]::uuid[], '{}'::uuid[], '{}'::uuid[]
      );
      v_occurrence_id := public.adhdice_capture_focus_achievement_occurrence(new.id);
      if v_occurrence_id is null then
        select id into v_occurrence_id
        from public.adhdice_achievement_occurrences
        where user_id = v_user_id and source_kind = 'focus_session' and source_id = new.id::text
        order by id
        limit 1;
        if v_occurrence_id is not null then
          update public.adhdice_achievement_occurrences
          set is_currently_qualifying = false,
              source_snapshot = source_snapshot || jsonb_build_object('source_no_longer_qualifying_at', clock_timestamp())
          where id = v_occurrence_id and user_id = v_user_id;
        end if;
      end if;
      v_after_ids := public.adhdice_resolve_achievement_affected_occurrence_ids(
        v_user_id, '{}'::uuid[], array[new.id]::uuid[],
        case when v_occurrence_id is null then '{}'::uuid[] else array[v_occurrence_id] end,
        '{}'::uuid[]
      );
    end if;
    v_affected_ids := coalesce(v_before_ids, '{}'::uuid[]) || coalesce(v_after_ids, '{}'::uuid[]);
    if not v_is_deferred then
      v_evaluation := public.adhdice_evaluate_achievements_incremental(
        v_user_id, v_affected_ids, v_operation_id, 'immediate'
      );
      if coalesce(v_evaluation->>'status', '') not in ('completed', 'inactive') then
        raise exception 'Incremental Achievement evaluation failed with status % and code %.',
          coalesce(v_evaluation->>'status', 'missing'), coalesce(v_evaluation->>'error_code', 'unknown');
      end if;
    end if;
  exception when others then
    if v_is_deferred then
      raise;
    end if;
    perform public.adhdice_record_achievement_evaluation_failure(
      v_user_id, v_operation_id, 'immediate', sqlstate, sqlerrm
    );
  end;
  return new;
end;
$function$;

-- Deleted source rows are resolved before mutation by explicit occurrence ID;
-- the post-refresh resolution also includes all affected Step-set versions.
create or replace function public.adhdice_deactivate_deleted_achievement_source()
returns trigger
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_operation_id uuid := md5(tg_table_name || ':delete:' || old.id::text || ':' || to_jsonb(old)::text)::uuid;
  v_occurrence public.adhdice_achievement_occurrences%rowtype;
  v_root_id uuid;
  v_match_count integer := 0;
  v_before_ids uuid[] := '{}'::uuid[];
  v_after_ids uuid[] := '{}'::uuid[];
  v_affected_ids uuid[] := '{}'::uuid[];
  v_refresh_step_set boolean := false;
  v_evaluation jsonb;
begin
  begin
    if tg_table_name = 'adhdice_task_history_facts' then
      if not exists (
        select 1 from public.adhdice_clean_tasks
        where id = old.entity_id and user_id = old.user_id
      ) then
        return old;
      end if;
    end if;

    if tg_table_name = 'adhdice_task_history_facts' then
      select * into v_occurrence
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = old.user_id
        and occurrence.source_kind = 'task_history'
        and occurrence.source_id = old.id::text
      order by occurrence.id
      limit 1;
      if v_occurrence.id is null then
        select * into v_occurrence
        from public.adhdice_achievement_occurrences occurrence
        where occurrence.user_id = old.user_id
          and occurrence.source_kind = 'task_history'
          and occurrence.source_snapshot->>'history_fact_id' = old.id::text
        order by occurrence.id
        limit 1;
      end if;
      if v_occurrence.id is null then
        select count(*) into v_match_count
        from public.adhdice_achievement_occurrences occurrence
        where occurrence.user_id = old.user_id
          and occurrence.source_kind = 'task_history'
          and occurrence.entity_id = old.entity_id
          and occurrence.logical_date = old.logical_date;
        if v_match_count > 1 then
          raise exception 'Ambiguous Achievement mapping for deleted canonical History fact %.', old.id;
        end if;
        if v_match_count = 1 then
          select * into v_occurrence
          from public.adhdice_achievement_occurrences occurrence
          where occurrence.user_id = old.user_id
            and occurrence.source_kind = 'task_history'
            and occurrence.entity_id = old.entity_id
            and occurrence.logical_date = old.logical_date
          order by occurrence.id
          limit 1;
        end if;
      end if;
    else
      select * into v_occurrence
      from public.adhdice_achievement_occurrences occurrence
      where occurrence.user_id = old.user_id
        and occurrence.source_kind = 'focus_session'
        and occurrence.source_id = old.id::text
      order by occurrence.id
      limit 1;
    end if;

    if v_occurrence.id is null then
      return old;
    end if;

    v_root_id := v_occurrence.root_parent_id;
    if tg_table_name = 'adhdice_task_history_facts' then
      v_refresh_step_set := old.entity_kind <> 'parent';
    end if;
    v_before_ids := public.adhdice_resolve_achievement_affected_occurrence_ids(
      old.user_id, '{}'::uuid[], '{}'::uuid[], array[v_occurrence.id],
      case when v_root_id is null or not v_refresh_step_set then '{}'::uuid[] else array[v_root_id] end
    );
    update public.adhdice_achievement_occurrences
    set is_currently_qualifying = false,
        source_snapshot = source_snapshot || jsonb_build_object('source_deleted_at', clock_timestamp())
    where id = v_occurrence.id and user_id = old.user_id;
      if v_root_id is not null and v_refresh_step_set then
      perform public.adhdice_refresh_achievement_step_set(old.user_id, v_root_id);
    end if;
    v_after_ids := public.adhdice_resolve_achievement_affected_occurrence_ids(
      old.user_id, '{}'::uuid[], '{}'::uuid[], array[v_occurrence.id],
      case when v_root_id is null or not v_refresh_step_set then '{}'::uuid[] else array[v_root_id] end
    );
    v_affected_ids := coalesce(v_before_ids, '{}'::uuid[]) || coalesce(v_after_ids, '{}'::uuid[]);
    v_evaluation := public.adhdice_evaluate_achievements_incremental(
      old.user_id, v_affected_ids, v_operation_id, 'immediate'
    );
    if coalesce(v_evaluation->>'status', '') not in ('completed', 'inactive') then
      raise exception 'Incremental Achievement evaluation failed with status % and code %.',
        coalesce(v_evaluation->>'status', 'missing'), coalesce(v_evaluation->>'error_code', 'unknown');
    end if;
  exception when others then
    perform public.adhdice_record_achievement_evaluation_failure(
      old.user_id, v_operation_id, 'immediate', sqlstate, sqlerrm
    );
  end;
  return old;
end;
$function$;

-- The bounded finalizer receives only committed History facts from the Edge
-- batch/rollover coordinator. Keep the old two-argument symbol fail-closed so
-- a stale caller cannot silently trigger a global rebuild.
create or replace function public.adhdice_finalize_task_history_batch_achievements(
  p_user_id uuid,
  p_operation_id uuid
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
begin
  raise exception 'Bounded committed History fact IDs are required for Achievement finalization.' using errcode = '22023';
end;
$function$;

create or replace function public.adhdice_finalize_task_history_batch_achievements(
  p_user_id uuid,
  p_operation_id uuid,
  p_history_fact_ids uuid[]
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
begin
  if p_user_id is null or p_operation_id is null then
    raise exception 'A user and Achievement operation are required.' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(coalesce(p_history_fact_ids, '{}'::uuid[])) = 0 then
    raise exception 'At least one committed History fact ID is required for Achievement finalization.' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(coalesce(p_history_fact_ids, '{}'::uuid[])) > 500 then
    raise exception 'Achievement finalization exceeds the 500 History fact bound.' using errcode = '22023';
  end if;
  return public.adhdice_evaluate_achievements_incremental_for_history_facts(
    p_user_id, coalesce(p_history_fact_ids, '{}'::uuid[]), p_operation_id, 'immediate'
  );
end;
$function$;

-- Automatic History created inside a canonical Task State command is already
-- committed in that transaction. Replace only its old final evaluator call;
-- the command still retains its existing strict failure semantics.
do $command_patch$
declare
  v_definition text;
  v_old constant text := $old$
    v_achievement_evaluation := public.adhdice_evaluate_achievements(
      p_user_id,
      v_achievement_operation_id,
      'immediate'
    );$old$;
  v_new constant text := $new$
    v_achievement_evaluation := public.adhdice_evaluate_achievements_incremental_for_history_facts(
      p_user_id,
      array(
        select value::uuid
        from jsonb_array_elements_text(
          (case when v_history_id is null then '[]'::jsonb else jsonb_build_array(v_history_id) end)
          || coalesce(v_automatic_history_ids, '[]'::jsonb)
          || coalesce(v_automatic_history_delete_ids, '[]'::jsonb)
        ) value
      ),
      v_achievement_operation_id,
      'immediate'
    );$new$;
  v_match_count integer;
begin
  select pg_get_functiondef('public.adhdice_execute_task_state_command(uuid,jsonb)'::regprocedure)
    into v_definition;
  v_match_count := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  if v_match_count <> 1 then
    raise exception 'Expected one automatic-History Achievement evaluator call; found %.', v_match_count;
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$command_patch$;

do $command_result_patch$
declare
  v_definition text;
  v_old constant text := $old$'history_fact_ids', v_automatic_history_ids,$old$;
  v_new constant text := $new$'history_fact_ids', v_automatic_history_ids,
    'history_fact_delete_ids', v_automatic_history_delete_ids,$new$;
  v_match_count integer;
begin
  select pg_get_functiondef('public.adhdice_execute_task_state_command(uuid,jsonb)'::regprocedure)
    into v_definition;
  v_match_count := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  if v_match_count <> 1 then
    raise exception 'Expected one Task State History result ID block; found %.', v_match_count;
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$command_result_patch$;

revoke all on function public.adhdice_resolve_achievement_affected_occurrence_ids(uuid,uuid[],uuid[],uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.adhdice_resolve_achievement_affected_occurrence_ids(uuid,uuid[],uuid[],uuid[],uuid[]) to service_role;
revoke all on function public.adhdice_evaluate_achievements_incremental(uuid,uuid[],uuid, text) from public, anon, authenticated;
grant execute on function public.adhdice_evaluate_achievements_incremental(uuid,uuid[],uuid, text) to service_role;
revoke all on function public.adhdice_evaluate_achievements_incremental_for_history_facts(uuid,uuid[],uuid,text) from public, anon, authenticated;
grant execute on function public.adhdice_evaluate_achievements_incremental_for_history_facts(uuid,uuid[],uuid,text) to service_role;
revoke all on function public.adhdice_finalize_task_history_batch_achievements(uuid,uuid) from public, anon, authenticated;
grant execute on function public.adhdice_finalize_task_history_batch_achievements(uuid,uuid) to service_role;
revoke all on function public.adhdice_finalize_task_history_batch_achievements(uuid,uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.adhdice_finalize_task_history_batch_achievements(uuid,uuid,uuid[]) to service_role;

notify pgrst, 'reload schema';
commit;

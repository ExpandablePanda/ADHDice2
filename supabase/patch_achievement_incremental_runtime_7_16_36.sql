-- ADHDice 7.16.36 deferred deleted-source Achievement correction.
-- SOURCE ONLY: do not apply automatically, deploy an Edge Function, or mutate
-- production Task, History, Achievement, reward, or notification data.
-- Apply only after the 7.16.34 foundation, 7.16.35 runtime cutover, and
-- explicit production approval.
--
-- Required production order:
--   1. 7.16.34 incremental Achievement foundation
--   2. 7.16.35 incremental runtime cutover
--   3. 7.16.36 deferred deleted-source correction
--   4. Edge deployment
--   5. live verification

begin;

do $guard$
begin
  if to_regprocedure('public.adhdice_achievement_track_dependencies()') is null
     or to_regprocedure('public.adhdice_sync_achievement_occurrence_matches(uuid[])') is null
     or to_regprocedure('public.adhdice_rebuild_achievement_progress_for_tracks(uuid,text[],uuid,timestamptz)') is null
     or to_regprocedure('public.adhdice_evaluate_achievements_incremental(uuid,uuid[],uuid,text)') is null
     or to_regprocedure('public.adhdice_deactivate_deleted_achievement_source()') is null then
    raise exception '7.16.35 incremental Achievement runtime is not installed.';
  end if;
end;
$guard$;

-- Deleted source rows are resolved before mutation by explicit occurrence ID;
-- the post-refresh resolution also includes all affected Step-set versions.
-- Match the insert/update trigger's transaction-local deferral contract so a
-- canonical Task State batch records source evidence now and evaluates once
-- from its later bounded finalizer.
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
  v_deferred_user_id text;
  v_is_deferred boolean;
begin
  v_deferred_user_id := current_setting('adhdice.achievement_deferred_user_id', true);
  v_is_deferred := coalesce(v_deferred_user_id = old.user_id::text, false);
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
    if not v_is_deferred then
      v_evaluation := public.adhdice_evaluate_achievements_incremental(
        old.user_id, v_affected_ids, v_operation_id, 'immediate'
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
      old.user_id, v_operation_id, 'immediate', sqlstate, sqlerrm
    );
  end;
  return old;
end;
$function$;

revoke all on function public.adhdice_deactivate_deleted_achievement_source() from public, anon, authenticated;

commit;

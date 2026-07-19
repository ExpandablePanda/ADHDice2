-- ADHDice 7.1.0 pre-commit QA correction.
-- Preserve per-row Achievement source capture during Task rollover while deferring
-- the full progress rebuild to one strict, user-scoped transaction finalization.
-- Apply second, after fix_recurring_rollover_history_replay_7_1_0.sql.
-- Do not reapply older rollover patches afterward; they replace this function body.
begin;

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
    if tg_table_name='adhdice_task_history' then
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

do $migration$
declare
  v_target regprocedure := to_regprocedure('public.adhdice_reconcile_task_rollover(uuid,timestamp with time zone)');
  v_definition text;
  v_rewritten text;
  v_match_count integer;
  v_before_declarations constant text := $before_declarations$  v_processed_any boolean;
  v_row_count integer;
begin$before_declarations$;
  v_after_declarations constant text := $after_declarations$  v_processed_any boolean;
  v_row_count integer;
  v_achievement_evaluation jsonb;
  v_achievement_operation_id uuid;
begin$after_declarations$;
  v_before_lock constant text := $before_lock$  if auth.uid() <> p_user_id then
    raise exception 'Not authorized to reconcile another user''s task rollover.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));$before_lock$;
  v_after_lock constant text := $after_lock$  if auth.uid() <> p_user_id then
    raise exception 'Not authorized to reconcile another user''s task rollover.';
  end if;

  perform set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true);
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));$after_lock$;
  v_before_ledger constant text := $before_ledger$  insert into public.adhdice_task_rollover_ledger (user_id, logical_date)
  values (p_user_id, v_effective_date)
  on conflict (user_id, logical_date) do nothing;$before_ledger$;
  v_after_ledger constant text := $after_ledger$  perform set_config('adhdice.achievement_deferred_user_id', '', true);
  v_achievement_operation_id := md5('task-rollover:' || p_user_id::text || ':' || v_effective_date::text)::uuid;
  v_achievement_evaluation := public.adhdice_evaluate_achievements(
    p_user_id,
    v_achievement_operation_id,
    'immediate'
  );
  if coalesce(v_achievement_evaluation->>'status', '') not in ('completed', 'inactive') then
    raise exception 'Final Achievement evaluation failed with status % and code %.',
      coalesce(v_achievement_evaluation->>'status', 'missing'),
      coalesce(v_achievement_evaluation->>'error_code', 'unknown');
  end if;

  insert into public.adhdice_task_rollover_ledger (user_id, logical_date)
  values (p_user_id, v_effective_date)
  on conflict (user_id, logical_date) do nothing;$after_ledger$;
begin
  if v_target is null then
    raise exception 'Missing prerequisite public.adhdice_reconcile_task_rollover(uuid,timestamptz).';
  end if;

  v_definition := pg_get_functiondef(v_target);
  if position('on conflict (user_id, task_id, entry_date) do nothing;' in v_definition) = 0 then
    raise exception 'Apply fix_recurring_rollover_history_replay_7_1_0.sql before this migration.';
  end if;

  v_match_count := (length(v_definition) - length(replace(v_definition, v_before_declarations, ''))) / length(v_before_declarations);
  if v_match_count <> 1 then
    raise exception 'Expected one rollover declaration block; found %.', v_match_count;
  end if;
  v_rewritten := replace(v_definition, v_before_declarations, v_after_declarations);

  v_match_count := (length(v_rewritten) - length(replace(v_rewritten, v_before_lock, ''))) / length(v_before_lock);
  if v_match_count <> 1 then
    raise exception 'Expected one rollover ownership/lock block; found %.', v_match_count;
  end if;
  v_rewritten := replace(v_rewritten, v_before_lock, v_after_lock);

  v_match_count := (length(v_rewritten) - length(replace(v_rewritten, v_before_ledger, ''))) / length(v_before_ledger);
  if v_match_count <> 1 then
    raise exception 'Expected one rollover ledger block; found %.', v_match_count;
  end if;
  v_rewritten := replace(v_rewritten, v_before_ledger, v_after_ledger);

  execute v_rewritten;
end;
$migration$;

notify pgrst, 'reload schema';
commit;

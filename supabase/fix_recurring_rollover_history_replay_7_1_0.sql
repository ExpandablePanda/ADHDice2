-- ADHDice 7.1.0 pre-commit QA correction.
-- Replace only the regular-recurring history write inside the installed rollover
-- function. Existing history rows remain authoritative and fire no UPDATE triggers.
-- Apply this migration first, then defer_rollover_achievement_evaluation_7_1_0.sql.
-- Do not reapply older rollover patches after this ordered pair.
begin;

do $migration$
declare
  v_target regprocedure := to_regprocedure('public.adhdice_reconcile_task_rollover(uuid,timestamp with time zone)');
  v_definition text;
  v_rewritten text;
  v_match_count integer;
  v_before constant text := $before$    v_due_on := v_task.due_on;
    v_processed_any := false;

    while v_due_on is not null and v_due_on <= v_rollover_date loop
      v_resolution := case
        when v_task.status = 'in_progress' and not v_processed_any then 'did_my_best'
        else 'missed'
      end;

      insert into public.adhdice_task_history (
        task_id,
        user_id,
        entry_date,
        status,
        was_completed
      )
      values (
        v_task.id,
        p_user_id,
        v_due_on,
        v_resolution,
        (v_resolution in ('done', 'did_my_best'))
      )
      on conflict (user_id, task_id, entry_date) do update
        set
          status = excluded.status,
          was_completed = excluded.was_completed,
          updated_at = now();

      v_inserted_history_count := v_inserted_history_count + 1;
      v_processed_any := true;$before$;
  v_after constant text := $after$    v_due_on := v_task.due_on;
    v_processed_any := false;

    while v_due_on is not null and v_due_on <= v_rollover_date loop
      v_resolution := case
        when v_task.status = 'in_progress' and not v_processed_any then 'did_my_best'
        else 'missed'
      end;

      insert into public.adhdice_task_history (
        task_id,
        user_id,
        entry_date,
        status,
        was_completed
      )
      values (
        v_task.id,
        p_user_id,
        v_due_on,
        v_resolution,
        (v_resolution in ('done', 'did_my_best'))
      )
      on conflict (user_id, task_id, entry_date) do nothing;

      get diagnostics v_row_count = row_count;
      v_inserted_history_count := v_inserted_history_count + v_row_count;
      v_processed_any := true;$after$;
begin
  if v_target is null then
    raise exception 'Missing prerequisite public.adhdice_reconcile_task_rollover(uuid,timestamptz).';
  end if;

  v_definition := pg_get_functiondef(v_target);
  v_match_count := (length(v_definition) - length(replace(v_definition, v_before, ''))) / length(v_before);
  if v_match_count <> 1 then
    raise exception 'Expected exactly one canonical regular-recurring rollover history block; found %.', v_match_count;
  end if;

  v_rewritten := replace(v_definition, v_before, v_after);
  execute v_rewritten;
end;
$migration$;

notify pgrst, 'reload schema';
commit;

-- ADHDice 7.16.33 Achievement rebuild temp-table alias correction.
-- SOURCE ONLY: this forward patch changes only the installed Achievement
-- rebuild function definition. It does not execute the function, deploy an
-- Edge Function, or mutate History, Achievement, reward, or notification data.
-- Apply only after explicit production approval and source review.

begin;

do $guard$
begin
  if to_regprocedure('public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz)') is null then
    raise exception 'Achievement progress rebuild function is not installed.';
  end if;
end;
$guard$;

do $migration$
declare
  v_definition text;
  v_old text := 'max(occurrence.occurrence_count)';
  v_match_count integer;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'adhdice_rebuild_achievement_progress'
     and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_run_id uuid, p_awarded_at timestamp with time zone';

  if v_definition is null then
    raise exception 'Achievement progress rebuild function is not installed.';
  end if;

  v_match_count := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  if v_match_count <> 1 then
    raise exception '7.16.33 occurrence-count alias anchor was not found exactly once (found % matches).', v_match_count;
  end if;

  execute replace(v_definition, v_old, 'max(occurrence_count)');
end;
$migration$;

revoke all on function public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;

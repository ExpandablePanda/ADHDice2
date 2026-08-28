-- ADHDice 7.11.84 History outcome batch Achievement boundary.
-- SOURCE ONLY: do not apply automatically, deploy an Edge Function, or mutate
-- production Task, History, Achievement, or reward data.
-- Apply only after explicit production approval and source review.

begin;

do $guard$
begin
  if to_regprocedure('public.adhdice_execute_task_state_command(uuid,jsonb)') is null then
    raise exception 'Canonical Task State command RPC is not installed.';
  end if;
  if to_regprocedure('public.adhdice_evaluate_achievements(uuid,uuid,text)') is null then
    raise exception 'Achievement evaluator RPC is not installed.';
  end if;
end;
$guard$;

create or replace function public.adhdice_execute_task_state_command_deferred_achievements(
  p_user_id uuid,
  p_command jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_user_id is null or p_command is null then
    raise exception 'A user and canonical command are required.' using errcode = '22023';
  end if;
  -- This setting is transaction-local. The canonical History trigger still
  -- captures source evidence and refreshes Step-set evidence, while skipping
  -- only the repeated full Achievement evaluation for this child command.
  perform set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true);
  return public.adhdice_execute_task_state_command(p_user_id, p_command);
end;
$function$;

create or replace function public.adhdice_finalize_task_history_batch_achievements(
  p_user_id uuid,
  p_operation_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_user_id is null or p_operation_id is null then
    raise exception 'A user and Achievement operation are required.' using errcode = '22023';
  end if;
  -- The deterministic operation identity makes a failed finalization safe to
  -- retry without creating a second evaluation run.
  return public.adhdice_evaluate_achievements(p_user_id, p_operation_id, 'immediate');
end;
$function$;

revoke all on function public.adhdice_execute_task_state_command_deferred_achievements(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_execute_task_state_command_deferred_achievements(uuid, jsonb) to service_role;
revoke all on function public.adhdice_finalize_task_history_batch_achievements(uuid, uuid) from public, anon, authenticated;
grant execute on function public.adhdice_finalize_task_history_batch_achievements(uuid, uuid) to service_role;

commit;

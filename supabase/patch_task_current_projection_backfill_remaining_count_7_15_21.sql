-- ADHDice 7.15.21 authoritative Current Task Projection backfill count.
-- Source-only forward patch. Apply only after the reviewed precheck confirms
-- the projection table and the canonical-runtime eligibility contract.

begin;

create or replace function public.adhdice_count_missing_task_current_projections(
  p_user_id uuid
) returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_count bigint;
begin
  if current_user <> 'service_role' then
    raise exception 'Current projection backfill count is backend-only.'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'A user is required.' using errcode = '22023';
  end if;

  select count(*)
    into v_count
    from public.adhdice_clean_tasks task
   where task.user_id = p_user_id
     and task.permanently_deleted_at is null
     and task.canonicalization_status = 'canonical_runtime'
     and task.entity_kind in ('parent', 'step', 'substep')
     and not exists (
       select 1
         from public.adhdice_task_current_projections projection
        where projection.user_id = task.user_id
          and projection.entity_id = task.id
     );

  return v_count;
end;
$function$;

revoke all on function public.adhdice_count_missing_task_current_projections(uuid) from public, anon, authenticated;
grant execute on function public.adhdice_count_missing_task_current_projections(uuid) to service_role;

notify pgrst, 'reload schema';
commit;

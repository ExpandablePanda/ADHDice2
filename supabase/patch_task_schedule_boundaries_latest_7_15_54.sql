-- ADHDice 7.15.54 bulk latest canonical Task schedule-boundary read.
-- Source-only forward patch. Do not apply without explicit live SQL authorization.

begin;

create or replace function public.adhdice_get_latest_task_schedule_boundaries(
  p_entity_ids uuid[]
)
returns setof public.adhdice_task_schedule_boundaries
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Latest Task schedule boundaries require an authenticated owner.'
      using errcode = '28000';
  end if;

  return query
    select latest_boundary.*
      from (
        select distinct on (boundary.entity_id) boundary.*
          from public.adhdice_task_schedule_boundaries boundary
         where boundary.user_id = v_user_id
           and boundary.entity_id = any(coalesce(p_entity_ids, '{}'::uuid[]))
         order by boundary.entity_id, boundary.boundary_sequence desc, boundary.id asc
      ) latest_boundary;
end;
$function$;

revoke all on function public.adhdice_get_latest_task_schedule_boundaries(uuid[])
  from public, anon, authenticated;
grant execute on function public.adhdice_get_latest_task_schedule_boundaries(uuid[])
  to authenticated;

commit;

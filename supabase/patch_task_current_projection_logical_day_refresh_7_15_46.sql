-- ADHDice 7.15.46 Current Task Projection logical-day refresh candidates.
--
-- The trusted backfill/rebuild boundary already owns projection calculation and
-- persistence. This patch only extends its backend candidate predicate so a
-- valid projection from an earlier logical day is rebuilt for the owner's
-- current logical day. It never writes projections or canonical facts here.

begin;

do $guard$
begin
  if to_regclass('public.adhdice_task_current_projections') is null
     or to_regclass('public.adhdice_clean_tasks') is null
     or to_regclass('public.adhdice_user_profiles') is null then
    raise exception '7.15.46 logical-day projection refresh prerequisites are missing.';
  end if;

  if to_regprocedure('public.adhdice_list_task_current_projection_rebuild_candidates(uuid,integer,uuid)') is null
     or to_regprocedure('public.adhdice_count_task_current_projection_rebuild_candidates(uuid)') is null then
    raise exception '7.15.46 trusted projection candidate prerequisites are missing.';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'adhdice_user_profiles'
       and column_name in ('user_id', 'timezone', 'day_start_time')
     having count(*) = 3
  ) then
    raise exception '7.15.46 logical-day profile columns are missing.';
  end if;
end;
$guard$;

create or replace function public.adhdice_list_task_current_projection_rebuild_candidates(
  p_user_id uuid,
  p_limit integer,
  p_after_task_id uuid default null
)
returns table (id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_profile_timezone text;
  v_profile_day_start_time text;
  v_current_logical_date date;
begin
  if current_user <> 'service_role' then
    raise exception 'Current Task projection logical-day candidates are backend-only.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'A user is required.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'Current Task projection candidate limit must be between 1 and 10.' using errcode = '22023';
  end if;

  select profile.timezone, profile.day_start_time::text
    into v_profile_timezone, v_profile_day_start_time
    from public.adhdice_user_profiles profile
   where profile.user_id = p_user_id;
  if not found or v_profile_timezone is null or v_profile_day_start_time is null then
    raise exception 'Current Task projection logical-day profile is unavailable.' using errcode = '55000';
  end if;
  v_current_logical_date := public.adhdice_effective_logical_date(
    pg_catalog.clock_timestamp(),
    v_profile_timezone,
    v_profile_day_start_time
  );

  return query
  select task.id
    from public.adhdice_clean_tasks task
   where task.user_id = p_user_id
     and task.permanently_deleted_at is null
     and task.canonicalization_status = 'canonical_runtime'
     and task.entity_kind in ('parent', 'step', 'substep')
     and (p_after_task_id is null or task.id > p_after_task_id)
     and (
       not exists (
         select 1
           from public.adhdice_task_current_projections projection
          where projection.user_id = task.user_id
            and projection.entity_id = task.id
       )
       or exists (
         select 1
           from public.adhdice_task_current_projections projection
          where projection.user_id = task.user_id
            and projection.entity_id = task.id
            and (
              projection.validity <> 'valid'
              or projection.projection_schema_version <> 'task-current-projection-schema-v2'
              or projection.projection_algorithm_version <> 'task-current-projection-algorithm-v3'
              or projection.projected_logical_date is distinct from v_current_logical_date
            )
       )
     )
   order by task.id asc
   limit p_limit;
end;
$function$;

revoke all on function public.adhdice_list_task_current_projection_rebuild_candidates(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.adhdice_list_task_current_projection_rebuild_candidates(uuid, integer, uuid)
  to service_role;

create or replace function public.adhdice_count_task_current_projection_rebuild_candidates(
  p_user_id uuid
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_profile_timezone text;
  v_profile_day_start_time text;
  v_current_logical_date date;
begin
  if current_user <> 'service_role' then
    raise exception 'Current Task projection logical-day count is backend-only.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'A user is required.' using errcode = '22023';
  end if;

  select profile.timezone, profile.day_start_time::text
    into v_profile_timezone, v_profile_day_start_time
    from public.adhdice_user_profiles profile
   where profile.user_id = p_user_id;
  if not found or v_profile_timezone is null or v_profile_day_start_time is null then
    raise exception 'Current Task projection logical-day profile is unavailable.' using errcode = '55000';
  end if;
  v_current_logical_date := public.adhdice_effective_logical_date(
    pg_catalog.clock_timestamp(),
    v_profile_timezone,
    v_profile_day_start_time
  );

  return (
    select count(*)
      from public.adhdice_clean_tasks task
     where task.user_id = p_user_id
       and task.permanently_deleted_at is null
       and task.canonicalization_status = 'canonical_runtime'
       and task.entity_kind in ('parent', 'step', 'substep')
       and (
         not exists (
           select 1
             from public.adhdice_task_current_projections projection
            where projection.user_id = task.user_id
              and projection.entity_id = task.id
         )
         or exists (
           select 1
             from public.adhdice_task_current_projections projection
            where projection.user_id = task.user_id
              and projection.entity_id = task.id
              and (
                projection.validity <> 'valid'
                or projection.projection_schema_version <> 'task-current-projection-schema-v2'
                or projection.projection_algorithm_version <> 'task-current-projection-algorithm-v3'
                or projection.projected_logical_date is distinct from v_current_logical_date
              )
         )
       )
  );
end;
$function$;

revoke all on function public.adhdice_count_task_current_projection_rebuild_candidates(uuid)
  from public, anon, authenticated;
grant execute on function public.adhdice_count_task_current_projection_rebuild_candidates(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;

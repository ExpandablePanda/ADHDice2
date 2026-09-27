-- ADHDice 7.15.23 backend-only Current Task Projection candidate selection.
-- Apply only after the projection schema and authoritative missing-count RPC
-- are present. This patch does not backfill rows or change projection
-- semantics.

begin;

do $guard$
begin
  if to_regclass('public.adhdice_clean_tasks') is null then
    raise exception 'Current projection candidate RPC requires adhdice_clean_tasks.';
  end if;
  if to_regclass('public.adhdice_task_current_projections') is null then
    raise exception 'Current projection candidate RPC requires adhdice_task_current_projections.';
  end if;
  if to_regprocedure('public.adhdice_count_missing_task_current_projections(uuid)') is null then
    raise exception 'Current projection candidate RPC requires the authoritative missing-count RPC.';
  end if;
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'adhdice_clean_tasks'
       and column_name in (
         'id', 'user_id', 'permanently_deleted_at',
         'canonicalization_status', 'entity_kind'
       )
     group by table_schema, table_name
    having count(*) = 5
  ) then
    raise exception 'Current projection candidate RPC requires the canonical Task eligibility columns.';
  end if;
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'adhdice_task_current_projections'
       and column_name in ('user_id', 'entity_id')
     group by table_schema, table_name
    having count(*) = 2
  ) then
    raise exception 'Current projection candidate RPC requires owner/entity projection identity columns.';
  end if;
  if not exists (
    select 1
      from pg_constraint constraint_row
      join pg_class table_row on table_row.oid = constraint_row.conrelid
      join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
     where schema_row.nspname = 'public'
       and table_row.relname = 'adhdice_task_current_projections'
       and constraint_row.conname = 'adhdice_task_current_projections_identity_key'
       and constraint_row.contype in ('p', 'u')
  ) then
    raise exception 'Current projection candidate RPC requires the owner/entity projection identity constraint.';
  end if;
end;
$guard$;

create or replace function public.adhdice_list_missing_task_current_projection_candidates(
  p_user_id uuid,
  p_limit integer,
  p_after_task_id uuid default null
)
returns table (id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if current_user <> 'service_role' then
    raise exception 'Current projection candidates are backend-only.'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'A user is required.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'Current projection candidate limit must be between 1 and 10.'
      using errcode = '22023';
  end if;

  return query
  select task.id
    from public.adhdice_clean_tasks task
   where task.user_id = p_user_id
     and task.permanently_deleted_at is null
     and task.canonicalization_status = 'canonical_runtime'
     and task.entity_kind in ('parent', 'step', 'substep')
     and (p_after_task_id is null or task.id > p_after_task_id)
     and not exists (
       select 1
         from public.adhdice_task_current_projections projection
        where projection.user_id = task.user_id
          and projection.entity_id = task.id
     )
   order by task.id asc
   limit p_limit;
end;
$function$;

revoke all on function public.adhdice_list_missing_task_current_projection_candidates(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.adhdice_list_missing_task_current_projection_candidates(uuid, integer, uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;

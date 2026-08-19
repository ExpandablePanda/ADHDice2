-- ADHDice 7.9.54: preserve canonical Task evidence when users permanently
-- delete a row from Trash.  This is a tombstone, not a physical DELETE.

alter table public.adhdice_clean_tasks
  add column if not exists permanently_deleted_at timestamptz;

create index if not exists adhdice_clean_tasks_visible_owner_idx
  on public.adhdice_clean_tasks (user_id, permanently_deleted_at, status, sort_order);

create or replace function public.adhdice_mark_tasks_permanently_deleted(p_task_ids uuid[])
returns setof uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_task_ids is null or cardinality(p_task_ids) = 0 then
    return;
  end if;

  if cardinality(p_task_ids) > 5000 then
    raise exception 'Too many Tasks were supplied for one permanent-delete operation.' using errcode = '22023';
  end if;

  return query
    update public.adhdice_clean_tasks as task
    set permanently_deleted_at = clock_timestamp()
    where task.user_id = v_user_id
      and task.id = any(p_task_ids)
      and task.status = 'trashed'
      and task.permanently_deleted_at is null
      and (task.container_state is null or task.container_state = 'trashed')
    returning task.id;
end;
$function$;

revoke all on function public.adhdice_mark_tasks_permanently_deleted(uuid[]) from public, anon;
grant execute on function public.adhdice_mark_tasks_permanently_deleted(uuid[]) to authenticated;

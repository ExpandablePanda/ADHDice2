-- ADHDice 7.14.33: canonical Task hierarchy membership mutation.
--
-- This is intentionally a separate authority from generic Task updates. It
-- owns parent_task_id and task_content_folder_id together, validates the
-- owner-scoped graph, and returns the committed Task row. It never writes
-- History facts or schedule boundaries.

create or replace function public.adhdice_move_task_hierarchy(
  p_task_id uuid,
  p_expected_revision integer,
  p_expected_canonical_revision bigint,
  p_new_parent_task_id uuid,
  p_new_task_content_folder_id uuid
)
returns setof public.adhdice_clean_tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_owner_id uuid := auth.uid();
  v_task public.adhdice_clean_tasks%rowtype;
  v_parent public.adhdice_clean_tasks%rowtype;
  v_parent_cursor uuid;
  v_visited_task_ids uuid[];
  v_next_entity_kind text;
  v_next_canonical_revision bigint;
begin
  if v_owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_new_parent_task_id is not null and p_new_task_content_folder_id is not null then
    raise exception 'A Task cannot have both a parent Task and a Task Content Folder.'
      using errcode = '23514';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'A current Task revision is required.' using errcode = '22023';
  end if;

  select task.*
    into v_task
    from public.adhdice_clean_tasks as task
   where task.user_id = v_owner_id
     and task.id = p_task_id
   for update;

  if not found then
    raise exception 'Task not found or unavailable.' using errcode = 'P0002';
  end if;

  if v_task.revision is distinct from p_expected_revision then
    raise exception 'Task hierarchy is stale; refresh before moving it.'
      using errcode = '40001';
  end if;

  if v_task.canonical_revision is null then
    if p_expected_canonical_revision is not null then
      raise exception 'The expected canonical revision does not match this legacy Task.'
        using errcode = '40001';
    end if;
  elsif v_task.canonical_revision is distinct from p_expected_canonical_revision then
    raise exception 'Task canonical hierarchy is stale; refresh before moving it.'
      using errcode = '40001';
  end if;

  -- Existing malformed ancestry is not silently repaired by a move. Walk the
  -- source chain while locked so the browser and database enforce the same
  -- invalid-hierarchy boundary.
  v_parent_cursor := v_task.parent_task_id;
  v_visited_task_ids := array[p_task_id]::uuid[];
  while v_parent_cursor is not null loop
    if v_parent_cursor = any(v_visited_task_ids) then
      raise exception 'The current Task hierarchy contains a cycle.' using errcode = '23514';
    end if;
    v_visited_task_ids := array_append(v_visited_task_ids, v_parent_cursor);
    select task.parent_task_id
      into v_parent_cursor
      from public.adhdice_clean_tasks as task
     where task.user_id = v_owner_id
       and task.id = v_parent_cursor
     for share;
    if not found then
      raise exception 'The current Task hierarchy contains a missing parent.' using errcode = '23514';
    end if;
  end loop;

  if p_new_parent_task_id is null then
    v_next_entity_kind := 'parent';
  else
    if p_new_parent_task_id = p_task_id then
      raise exception 'A Task cannot become its own parent.' using errcode = '23514';
    end if;

    select task.*
      into v_parent
      from public.adhdice_clean_tasks as task
     where task.user_id = v_owner_id
       and task.id = p_new_parent_task_id
     for update;

    if not found then
      raise exception 'The destination parent Task is not available.' using errcode = '23503';
    end if;

    -- The destination cannot be this Task or any descendant. Also reject a
    -- malformed destination ancestry instead of creating a deeper corruption.
    v_parent_cursor := v_parent.parent_task_id;
    v_visited_task_ids := array[p_new_parent_task_id]::uuid[];
    while v_parent_cursor is not null loop
      if v_parent_cursor = p_task_id then
        raise exception 'A Task cannot move into one of its own descendants.' using errcode = '23514';
      end if;
      if v_parent_cursor = any(v_visited_task_ids) then
        raise exception 'The destination Task hierarchy contains a cycle.' using errcode = '23514';
      end if;
      v_visited_task_ids := array_append(v_visited_task_ids, v_parent_cursor);
      select task.parent_task_id
        into v_parent_cursor
        from public.adhdice_clean_tasks as task
       where task.user_id = v_owner_id
         and task.id = v_parent_cursor
       for share;
      if not found then
        raise exception 'The destination Task hierarchy contains a missing parent.' using errcode = '23514';
      end if;
    end loop;

    v_next_entity_kind := case
      when v_parent.parent_task_id is null then 'step'
      else 'substep'
    end;
  end if;

  if p_new_task_content_folder_id is not null
     and not exists (
       select 1
         from public.adhdice_task_content_folders as folder
        where folder.user_id = v_owner_id
          and folder.id = p_new_task_content_folder_id
     ) then
    raise exception 'The destination Task Content Folder is not available.' using errcode = '23503';
  end if;

  -- A retried request with the same committed destination is a safe no-op. It
  -- still passed the revision fence above, so it cannot hide a newer write.
  if v_task.parent_task_id is not distinct from p_new_parent_task_id
     and v_task.task_content_folder_id is not distinct from p_new_task_content_folder_id then
    return next v_task;
    return;
  end if;

  v_next_canonical_revision := case
    when v_task.canonical_revision is null then null
    else v_task.canonical_revision + 1
  end;

  update public.adhdice_clean_tasks as task
     set parent_task_id = p_new_parent_task_id,
         task_content_folder_id = p_new_task_content_folder_id,
         canonicalization_status = case
           when task.canonical_revision is not null
                and task.canonicalization_status = 'canonical_proven' then 'canonical_runtime'
           else task.canonicalization_status
         end,
         entity_kind = case
           when task.canonical_revision is not null then v_next_entity_kind
           else task.entity_kind
         end,
         canonical_revision = v_next_canonical_revision,
         canonical_updated_at = case
           when task.canonical_revision is not null then now()
           else task.canonical_updated_at
         end,
         projection_source_canonical_revision = v_next_canonical_revision,
         projection_source_fingerprint = case
           when task.canonical_revision is not null then md5(concat_ws(
             ':',
             'task-hierarchy-v1',
             p_task_id::text,
             coalesce(p_new_parent_task_id::text, ''),
             coalesce(p_new_task_content_folder_id::text, ''),
             v_next_entity_kind,
             v_next_canonical_revision::text
           ))
           else task.projection_source_fingerprint
         end,
         projection_version = case
           when task.canonical_revision is not null then 'task-state-projection-v1'
           else task.projection_version
         end
   where task.user_id = v_owner_id
     and task.id = p_task_id
  returning task.* into v_task;

  return next v_task;
end;
$function$;

revoke all on function public.adhdice_move_task_hierarchy(uuid, integer, bigint, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.adhdice_move_task_hierarchy(uuid, integer, bigint, uuid, uuid)
  to authenticated;

-- Folder deletion also changes direct Task membership. Keep that bulk
-- operation atomic while routing each Task row through the same authority.
create or replace function public.adhdice_delete_task_content_folder(p_folder_id uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_owner_id uuid := auth.uid();
  v_promoted_parent_id uuid;
  v_deleted_count integer;
  v_task public.adhdice_clean_tasks%rowtype;
begin
  if v_owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner_id::text, 0));

  select folder.parent_folder_id
    into v_promoted_parent_id
    from public.adhdice_task_content_folders as folder
   where folder.id = p_folder_id
     and folder.user_id = v_owner_id
   for update;

  if not found then
    raise exception 'Folder not found or unavailable.' using errcode = 'P0002';
  end if;

  if v_promoted_parent_id is not null and not exists (
    select 1
      from public.adhdice_task_content_folders as parent
     where parent.id = v_promoted_parent_id
       and parent.user_id = v_owner_id
  ) then
    raise exception 'Folder parent is unavailable.' using errcode = '23503';
  end if;

  for v_task in
    select task.*
      from public.adhdice_clean_tasks as task
     where task.user_id = v_owner_id
       and task.task_content_folder_id = p_folder_id
     for update
  loop
    perform public.adhdice_move_task_hierarchy(
      v_task.id,
      v_task.revision,
      v_task.canonical_revision,
      null,
      v_promoted_parent_id
    );
  end loop;

  update public.adhdice_task_content_folders
     set parent_folder_id = v_promoted_parent_id,
         updated_at = now()
   where user_id = v_owner_id
     and parent_folder_id = p_folder_id;

  delete from public.adhdice_task_content_folders
   where id = p_folder_id
     and user_id = v_owner_id;
  get diagnostics v_deleted_count = row_count;

  return v_deleted_count = 1;
end;
$function$;

revoke all on function public.adhdice_delete_task_content_folder(uuid)
  from public, anon, authenticated;
grant execute on function public.adhdice_delete_task_content_folder(uuid)
  to authenticated;

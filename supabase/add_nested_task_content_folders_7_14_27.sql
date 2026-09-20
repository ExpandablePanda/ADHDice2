-- ADHDice 7.14.27: add owner-scoped nested Task Content Folders.
-- Additive and rerunnable. Folders remain organizational containers, not Tasks.

alter table public.adhdice_task_content_folders
  add column if not exists parent_folder_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.adhdice_task_content_folders'::regclass
      and conname = 'adhdice_task_content_folders_parent_not_self_check'
  ) then
    alter table public.adhdice_task_content_folders
      add constraint adhdice_task_content_folders_parent_not_self_check
      check (parent_folder_id is null or parent_folder_id <> id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.adhdice_task_content_folders'::regclass
      and conname = 'adhdice_task_content_folders_parent_owner_fkey'
  ) then
    alter table public.adhdice_task_content_folders
      add constraint adhdice_task_content_folders_parent_owner_fkey
      foreign key (user_id, parent_folder_id)
      references public.adhdice_task_content_folders(user_id, id)
      on delete set null (parent_folder_id);
  end if;
end
$$;

create index if not exists adhdice_task_content_folders_parent_idx
  on public.adhdice_task_content_folders (user_id, parent_folder_id, created_at, id);

create or replace function public.adhdice_validate_task_content_folder_parent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));

  if new.parent_folder_id is null then
    return new;
  end if;

  if new.parent_folder_id = new.id then
    raise exception 'A Task Content Folder cannot be its own parent.' using errcode = '23514';
  end if;

  if exists (
    with recursive ancestors(id, parent_folder_id, path) as (
      select folder.id, folder.parent_folder_id, array[folder.id]::uuid[]
      from public.adhdice_task_content_folders as folder
      where folder.user_id = new.user_id
        and folder.id = new.parent_folder_id
      union all
      select parent.id, parent.parent_folder_id, ancestors.path || parent.id
      from public.adhdice_task_content_folders as parent
      join ancestors on ancestors.parent_folder_id = parent.id
        and parent.user_id = new.user_id
      where not parent.id = any(ancestors.path)
    )
    select 1
    from ancestors
    where ancestors.id = new.id
  ) then
    raise exception 'A Task Content Folder cannot be moved inside its descendant.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists adhdice_task_content_folders_parent_guard
  on public.adhdice_task_content_folders;
create trigger adhdice_task_content_folders_parent_guard
  before insert or update of user_id, parent_folder_id
  on public.adhdice_task_content_folders
  for each row
  execute function public.adhdice_validate_task_content_folder_parent();

create or replace function public.adhdice_delete_task_content_folder(p_folder_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  owner_id uuid := (select auth.uid());
  promoted_parent_id uuid;
  deleted_count integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));

  select folder.parent_folder_id
  into promoted_parent_id
  from public.adhdice_task_content_folders as folder
  where folder.id = p_folder_id
    and folder.user_id = owner_id
  for update;

  if not found then
    raise exception 'Folder not found or unavailable.' using errcode = 'P0002';
  end if;

  if promoted_parent_id is not null and not exists (
    select 1
    from public.adhdice_task_content_folders as parent
    where parent.id = promoted_parent_id
      and parent.user_id = owner_id
  ) then
    raise exception 'Folder parent is unavailable.' using errcode = '23503';
  end if;

  update public.adhdice_clean_tasks
  set task_content_folder_id = promoted_parent_id,
      updated_at = now()
  where user_id = owner_id
    and task_content_folder_id = p_folder_id;

  update public.adhdice_task_content_folders
  set parent_folder_id = promoted_parent_id,
      updated_at = now()
  where user_id = owner_id
    and parent_folder_id = p_folder_id;

  delete from public.adhdice_task_content_folders
  where id = p_folder_id
    and user_id = owner_id;
  get diagnostics deleted_count = row_count;

  return deleted_count = 1;
end;
$$;

revoke all on function public.adhdice_delete_task_content_folder(uuid) from public, anon, authenticated;
grant execute on function public.adhdice_delete_task_content_folder(uuid) to authenticated;

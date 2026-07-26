begin;

create table public.adhdice_task_list_folders (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  parent_folder_id uuid,
  sort_order bigint not null default 0,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint adhdice_task_list_folders_name_check
    check (name = trim(name) and char_length(name) between 1 and 120),
  constraint adhdice_task_list_folders_not_self_check
    check (parent_folder_id is null or parent_folder_id <> id),
  constraint adhdice_task_list_folders_parent_fkey
    foreign key (user_id, parent_folder_id)
    references public.adhdice_task_list_folders(user_id, id)
    on delete restrict
);

create table public.adhdice_task_list_containers (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  folder_id uuid,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint adhdice_task_list_containers_folder_fkey
    foreign key (user_id, folder_id)
    references public.adhdice_task_list_folders(user_id, id)
    on delete restrict,
  unique (user_id, folder_id)
);

create unique index adhdice_task_list_containers_root_uidx
  on public.adhdice_task_list_containers (user_id)
  where folder_id is null;

alter table public.adhdice_task_lists
  add column folder_id uuid,
  add column revision bigint not null default 0,
  add constraint adhdice_task_lists_folder_fkey
    foreign key (user_id, folder_id)
    references public.adhdice_task_list_folders(user_id, id)
    on delete restrict;

update public.adhdice_task_lists
set folder_id = null
where folder_id is not null;

with invalid_users as (
  select user_id
  from public.adhdice_task_lists
  group by user_id
  having count(distinct sort_order) <> count(*)
     or min(sort_order) <> 0
     or max(sort_order) <> count(*) - 1
),
normalized as (
  select lists.user_id, lists.id,
    row_number() over (
      partition by lists.user_id
      order by lists.sort_order, lists.id
    ) - 1 as next_sort_order
  from public.adhdice_task_lists lists
  join invalid_users on invalid_users.user_id = lists.user_id
)
update public.adhdice_task_lists target
set sort_order = normalized.next_sort_order
from normalized
where target.user_id = normalized.user_id
  and target.id = normalized.id;

do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select lists.user_id
    from public.adhdice_task_lists lists
    group by lists.user_id
  loop
    insert into public.adhdice_task_list_containers (user_id, folder_id)
    values (v_user_id, null)
    on conflict do nothing;
  end loop;
end
$$;

create index adhdice_task_list_folders_container_order_idx
  on public.adhdice_task_list_folders (user_id, parent_folder_id, sort_order, id);

drop index if exists public.adhdice_task_lists_user_sort_idx;
create index adhdice_task_lists_container_order_idx
  on public.adhdice_task_lists (user_id, folder_id, sort_order, id);

create or replace function public.adhdice_guard_task_list_folder_cycle()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.parent_folder_id is null then
    return new;
  end if;

  if new.parent_folder_id = new.id then
    raise exception 'A folder cannot parent itself';
  end if;

  if exists (
    with recursive ancestors as (
      select folder.id, folder.parent_folder_id
      from public.adhdice_task_list_folders folder
      where folder.user_id = new.user_id
        and folder.id = new.parent_folder_id
      union
      select parent.id, parent.parent_folder_id
      from public.adhdice_task_list_folders parent
      join ancestors child on child.parent_folder_id = parent.id
      where parent.user_id = new.user_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A folder cannot move into its descendant';
  end if;

  return new;
end;
$function$;

create trigger adhdice_task_list_folders_guard_cycle
  before insert or update of user_id, id, parent_folder_id
  on public.adhdice_task_list_folders
  for each row execute function public.adhdice_guard_task_list_folder_cycle();

create or replace function public.adhdice_guard_task_list_folder_eligibility()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.folder_id is not null
    and not (
      new.list_type = 'custom'
      and new.membership_mode = 'manual'
      and new.built_in_key is null
      and new.id like 'list:%'
    )
  then
    raise exception 'Only user-created normal lists can be placed in folders';
  end if;
  return new;
end;
$function$;

create trigger adhdice_task_lists_guard_folder_eligibility
  before insert or update of folder_id, list_type, membership_mode, built_in_key, id
  on public.adhdice_task_lists
  for each row execute function public.adhdice_guard_task_list_folder_eligibility();

create or replace function public.adhdice_normalize_task_list_container(
  p_user_id uuid,
  p_folder_id uuid
)
returns void
language plpgsql
set search_path = ''
as $function$
begin
  with mixed as (
    select 'folder'::text as entity_type, folder.id::text as entity_id,
      folder.sort_order, folder.created_at
    from public.adhdice_task_list_folders folder
    where folder.user_id = p_user_id
      and folder.parent_folder_id is not distinct from p_folder_id
    union all
    select 'list', list_row.id, list_row.sort_order, list_row.created_at
    from public.adhdice_task_lists list_row
    where list_row.user_id = p_user_id
      and list_row.folder_id is not distinct from p_folder_id
  ),
  ranked as (
    select entity_type, entity_id,
      row_number() over (
        order by sort_order, entity_type, entity_id
      ) - 1 as next_sort_order
    from mixed
  )
  update public.adhdice_task_list_folders target
  set sort_order = ranked.next_sort_order
  from ranked
  where ranked.entity_type = 'folder'
    and target.user_id = p_user_id
    and target.id::text = ranked.entity_id;

  with mixed as (
    select 'folder'::text as entity_type, folder.id::text as entity_id,
      folder.sort_order, folder.created_at
    from public.adhdice_task_list_folders folder
    where folder.user_id = p_user_id
      and folder.parent_folder_id is not distinct from p_folder_id
    union all
    select 'list', list_row.id, list_row.sort_order, list_row.created_at
    from public.adhdice_task_lists list_row
    where list_row.user_id = p_user_id
      and list_row.folder_id is not distinct from p_folder_id
  ),
  ranked as (
    select entity_type, entity_id,
      row_number() over (
        order by sort_order, entity_type, entity_id
      ) - 1 as next_sort_order
    from mixed
  )
  update public.adhdice_task_lists target
  set sort_order = ranked.next_sort_order
  from ranked
  where ranked.entity_type = 'list'
    and target.user_id = p_user_id
    and target.id = ranked.entity_id;
end;
$function$;

create or replace function public.adhdice_assert_task_list_container_revision(
  p_user_id uuid,
  p_folder_id uuid,
  p_expected_revision bigint
)
returns bigint
language plpgsql
set search_path = ''
as $function$
declare
  v_revision bigint;
begin
  insert into public.adhdice_task_list_containers (user_id, folder_id)
  values (p_user_id, p_folder_id)
  on conflict do nothing;

  select container.revision
  into v_revision
  from public.adhdice_task_list_containers container
  where container.user_id = p_user_id
    and container.folder_id is not distinct from p_folder_id
  for update;

  if v_revision is null or p_expected_revision is null or v_revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'ADHDICE_LIST_FOLDER_REVISION_CONFLICT';
  end if;

  return v_revision;
end;
$function$;

create or replace function public.adhdice_mutate_task_list_structure(
  p_action text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_folder_id uuid;
  v_list_id text;
  v_source_folder_id uuid;
  v_destination_folder_id uuid;
  v_parent_folder_id uuid;
  v_expected_source_revision bigint;
  v_expected_destination_revision bigint;
  v_expected_folder_revision bigint;
  v_target_index bigint;
  v_item_count bigint;
  v_child_count bigint;
  v_deleted_position bigint;
  v_folder_revision bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_action = 'create_folder' then
    v_destination_folder_id := nullif(p_payload->>'parent_folder_id', '')::uuid;
    v_expected_destination_revision := (p_payload->>'expected_container_revision')::bigint;

    if v_destination_folder_id is not null and not exists (
      select 1 from public.adhdice_task_list_folders
      where user_id = v_user_id and id = v_destination_folder_id
    ) then
      raise exception 'Folder destination was not found';
    end if;

    perform public.adhdice_assert_task_list_container_revision(
      v_user_id, v_destination_folder_id, v_expected_destination_revision
    );

    select count(*) into v_target_index
    from (
      select id::text from public.adhdice_task_list_folders
      where user_id = v_user_id
        and parent_folder_id is not distinct from v_destination_folder_id
      union all
      select id from public.adhdice_task_lists
      where user_id = v_user_id
        and folder_id is not distinct from v_destination_folder_id
    ) siblings;

    insert into public.adhdice_task_list_folders (
      user_id, name, parent_folder_id, sort_order
    ) values (
      v_user_id, trim(p_payload->>'name'), v_destination_folder_id, v_target_index
    ) returning id into v_folder_id;

    insert into public.adhdice_task_list_containers (user_id, folder_id)
    values (v_user_id, v_folder_id);

    perform public.adhdice_normalize_task_list_container(v_user_id, v_destination_folder_id);

    update public.adhdice_task_list_containers
    set revision = revision + 1, updated_at = now()
    where user_id = v_user_id
      and folder_id is not distinct from v_destination_folder_id
    returning revision into v_folder_revision;

    return jsonb_build_object(
      'status', 'ok', 'folder_id', v_folder_id,
      'destination_revision', v_folder_revision
    );
  elsif p_action = 'rename_folder' then
    v_folder_id := (p_payload->>'folder_id')::uuid;
    v_expected_folder_revision := (p_payload->>'expected_folder_revision')::bigint;

    update public.adhdice_task_list_folders
    set name = trim(p_payload->>'name'),
      revision = revision + 1,
      updated_at = now()
    where user_id = v_user_id
      and id = v_folder_id
      and revision = v_expected_folder_revision
    returning revision into v_folder_revision;

    if v_folder_revision is null then
      raise exception using
        errcode = '40001',
        message = 'ADHDICE_LIST_FOLDER_REVISION_CONFLICT';
    end if;

    return jsonb_build_object(
      'status', 'ok', 'folder_id', v_folder_id,
      'folder_revision', v_folder_revision
    );
  elsif p_action in ('move_folder', 'move_list') then
    v_destination_folder_id := nullif(p_payload->>'destination_folder_id', '')::uuid;
    v_target_index := greatest(0, (p_payload->>'target_index')::bigint);
    v_expected_source_revision := (p_payload->>'expected_source_revision')::bigint;
    v_expected_destination_revision := (p_payload->>'expected_destination_revision')::bigint;

    if v_destination_folder_id is not null and not exists (
      select 1 from public.adhdice_task_list_folders
      where user_id = v_user_id and id = v_destination_folder_id
    ) then
      raise exception 'Folder destination was not found';
    end if;

    if p_action = 'move_folder' then
      v_folder_id := (p_payload->>'folder_id')::uuid;
      select parent_folder_id into v_source_folder_id
      from public.adhdice_task_list_folders
      where user_id = v_user_id and id = v_folder_id
      for update;
      if not found then raise exception 'Folder was not found'; end if;

      if v_destination_folder_id = v_folder_id then
        raise exception 'A folder cannot parent itself';
      end if;
      if v_destination_folder_id is not null and exists (
        with recursive descendants as (
          select child.id
          from public.adhdice_task_list_folders child
          where child.user_id = v_user_id
            and child.parent_folder_id = v_folder_id
          union
          select child.id
          from public.adhdice_task_list_folders child
          join descendants parent on child.parent_folder_id = parent.id
          where child.user_id = v_user_id
        )
        select 1 from descendants where id = v_destination_folder_id
      ) then
        raise exception 'A folder cannot move into its descendant';
      end if;
    else
      v_list_id := p_payload->>'list_id';
      select folder_id into v_source_folder_id
      from public.adhdice_task_lists
      where user_id = v_user_id
        and id = v_list_id
        and list_type = 'custom'
        and membership_mode = 'manual'
        and built_in_key is null
        and id like 'list:%'
      for update;
      if not found then
        raise exception 'Only user-created normal lists can be moved into folders';
      end if;
    end if;

    if v_source_folder_id is not distinct from v_destination_folder_id then
      if v_expected_source_revision <> v_expected_destination_revision then
        raise exception using
          errcode = '40001',
          message = 'ADHDICE_LIST_FOLDER_REVISION_CONFLICT';
      end if;
      perform public.adhdice_assert_task_list_container_revision(
        v_user_id, v_source_folder_id, v_expected_source_revision
      );
    else
      perform public.adhdice_assert_task_list_container_revision(
        v_user_id, v_source_folder_id, v_expected_source_revision
      );
      perform public.adhdice_assert_task_list_container_revision(
        v_user_id, v_destination_folder_id, v_expected_destination_revision
      );
    end if;

    if p_action = 'move_folder' then
      update public.adhdice_task_list_folders
      set parent_folder_id = v_destination_folder_id,
        sort_order = 9223372036854775807,
        revision = revision + 1,
        updated_at = now()
      where user_id = v_user_id and id = v_folder_id;
    else
      update public.adhdice_task_lists
      set folder_id = v_destination_folder_id,
        sort_order = 9223372036854775807,
        revision = revision + 1,
        updated_at = now()
      where user_id = v_user_id and id = v_list_id;
    end if;

    if v_source_folder_id is distinct from v_destination_folder_id then
      perform public.adhdice_normalize_task_list_container(v_user_id, v_source_folder_id);
    end if;
    perform public.adhdice_normalize_task_list_container(v_user_id, v_destination_folder_id);

    select count(*) - 1 into v_item_count
    from (
      select id::text, 'folder'::text as entity_type
      from public.adhdice_task_list_folders
      where user_id = v_user_id
        and parent_folder_id is not distinct from v_destination_folder_id
      union all
      select id, 'list'
      from public.adhdice_task_lists
      where user_id = v_user_id
        and folder_id is not distinct from v_destination_folder_id
    ) siblings;
    v_target_index := least(v_target_index, greatest(v_item_count, 0));

    update public.adhdice_task_list_folders
    set sort_order = sort_order + 1
    where user_id = v_user_id
      and parent_folder_id is not distinct from v_destination_folder_id
      and sort_order >= v_target_index
      and (p_action <> 'move_folder' or id <> v_folder_id);
    update public.adhdice_task_lists
    set sort_order = sort_order + 1
    where user_id = v_user_id
      and folder_id is not distinct from v_destination_folder_id
      and sort_order >= v_target_index
      and (p_action <> 'move_list' or id <> v_list_id);

    if p_action = 'move_folder' then
      update public.adhdice_task_list_folders
      set sort_order = v_target_index
      where user_id = v_user_id and id = v_folder_id;
    else
      update public.adhdice_task_lists
      set sort_order = v_target_index
      where user_id = v_user_id and id = v_list_id;
    end if;
    perform public.adhdice_normalize_task_list_container(v_user_id, v_destination_folder_id);

    update public.adhdice_task_list_containers
    set revision = revision + 1, updated_at = now()
    where user_id = v_user_id
      and (
        folder_id is not distinct from v_source_folder_id
        or folder_id is not distinct from v_destination_folder_id
      );

    return jsonb_build_object('status', 'ok');
  elsif p_action = 'delete_folder' then
    v_folder_id := (p_payload->>'folder_id')::uuid;
    v_expected_source_revision := (p_payload->>'expected_parent_revision')::bigint;
    v_expected_destination_revision := (p_payload->>'expected_contents_revision')::bigint;

    select parent_folder_id, sort_order
    into v_parent_folder_id, v_deleted_position
    from public.adhdice_task_list_folders
    where user_id = v_user_id and id = v_folder_id
    for update;
    if not found then raise exception 'Folder was not found'; end if;

    perform public.adhdice_assert_task_list_container_revision(
      v_user_id, v_parent_folder_id, v_expected_source_revision
    );
    perform public.adhdice_assert_task_list_container_revision(
      v_user_id, v_folder_id, v_expected_destination_revision
    );
    perform public.adhdice_normalize_task_list_container(v_user_id, v_parent_folder_id);
    perform public.adhdice_normalize_task_list_container(v_user_id, v_folder_id);

    select sort_order into v_deleted_position
    from public.adhdice_task_list_folders
    where user_id = v_user_id and id = v_folder_id;

    select count(*) into v_child_count
    from (
      select id::text from public.adhdice_task_list_folders
      where user_id = v_user_id and parent_folder_id = v_folder_id
      union all
      select id from public.adhdice_task_lists
      where user_id = v_user_id and folder_id = v_folder_id
    ) children;

    update public.adhdice_task_list_folders
    set sort_order = sort_order + v_child_count - 1
    where user_id = v_user_id
      and parent_folder_id is not distinct from v_parent_folder_id
      and id <> v_folder_id
      and sort_order > v_deleted_position;
    update public.adhdice_task_lists
    set sort_order = sort_order + v_child_count - 1
    where user_id = v_user_id
      and folder_id is not distinct from v_parent_folder_id
      and sort_order > v_deleted_position;

    update public.adhdice_task_list_folders
    set parent_folder_id = v_parent_folder_id,
      sort_order = v_deleted_position + sort_order,
      revision = revision + 1,
      updated_at = now()
    where user_id = v_user_id and parent_folder_id = v_folder_id;
    update public.adhdice_task_lists
    set folder_id = v_parent_folder_id,
      sort_order = v_deleted_position + sort_order,
      revision = revision + 1,
      updated_at = now()
    where user_id = v_user_id and folder_id = v_folder_id;

    delete from public.adhdice_task_list_containers
    where user_id = v_user_id and folder_id = v_folder_id;
    delete from public.adhdice_task_list_folders
    where user_id = v_user_id and id = v_folder_id;

    perform public.adhdice_normalize_task_list_container(v_user_id, v_parent_folder_id);
    update public.adhdice_task_list_containers
    set revision = revision + 1, updated_at = now()
    where user_id = v_user_id
      and folder_id is not distinct from v_parent_folder_id
    returning revision into v_folder_revision;

    return jsonb_build_object(
      'status', 'ok', 'destination_revision', v_folder_revision
    );
  end if;

  raise exception 'Unknown task-list structure action';
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid task-list structure payload';
end;
$function$;

alter table public.adhdice_task_list_folders enable row level security;
alter table public.adhdice_task_list_containers enable row level security;

create policy "Users can read their own task list folders"
  on public.adhdice_task_list_folders for select
  using (auth.uid() = user_id);

create policy "Users can read their own task list containers"
  on public.adhdice_task_list_containers for select
  using (auth.uid() = user_id);

revoke all on public.adhdice_task_list_folders from anon, authenticated;
revoke all on public.adhdice_task_list_containers from anon, authenticated;
grant select on public.adhdice_task_list_folders to authenticated;
grant select on public.adhdice_task_list_containers to authenticated;

revoke all on function public.adhdice_normalize_task_list_container(uuid, uuid) from public, anon, authenticated;
revoke all on function public.adhdice_assert_task_list_container_revision(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.adhdice_mutate_task_list_structure(text, jsonb) from public, anon;
grant execute on function public.adhdice_mutate_task_list_structure(text, jsonb) to authenticated;

create trigger adhdice_task_list_folders_set_updated_at
  before update on public.adhdice_task_list_folders
  for each row execute function public.adhdice_clean_set_updated_at();

create trigger adhdice_task_list_containers_set_updated_at
  before update on public.adhdice_task_list_containers
  for each row execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_task_list_folders;
alter publication supabase_realtime add table public.adhdice_task_list_containers;

notify pgrst, 'reload schema';

commit;

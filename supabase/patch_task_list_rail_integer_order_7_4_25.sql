-- ADHDice 7.4.25: integer-only canonical List Rail ordering.
-- Forward patch for databases where add_task_list_rail_placement_7_4_22.sql is already applied.
-- Apply manually in Supabase.

begin;

lock table public.adhdice_task_list_rail_items in share row exclusive mode;
lock table public.adhdice_task_lists in share row exclusive mode;
lock table public.adhdice_task_list_folders in share row exclusive mode;

-- Preserve every current location while normalizing each container to 0..n-1.
with ranked as (
  select
    user_id,
    item_key,
    row_number() over (
      partition by user_id, container_folder_id
      order by sort_order, item_key
    ) - 1 as next_sort_order
  from public.adhdice_task_list_rail_items
)
update public.adhdice_task_list_rail_items placement
set sort_order = ranked.next_sort_order::integer,
    updated_at = now()
from ranked
where placement.user_id = ranked.user_id
  and placement.item_key = ranked.item_key
  and placement.sort_order <> ranked.next_sort_order;

-- Canonical placement remains authoritative for integer compatibility mirrors.
update public.adhdice_task_list_folders folder
set parent_folder_id = placement.container_folder_id,
    sort_order = placement.sort_order,
    updated_at = now()
from public.adhdice_task_list_rail_items placement
where placement.user_id = folder.user_id
  and placement.item_type = 'folder'
  and placement.entity_id = folder.id
  and (
    folder.parent_folder_id is distinct from placement.container_folder_id
    or folder.sort_order <> placement.sort_order
  );

update public.adhdice_task_lists list_row
set folder_id = placement.container_folder_id,
    sort_order = placement.sort_order,
    updated_at = now()
from public.adhdice_task_list_rail_items placement
where placement.user_id = list_row.user_id
  and placement.item_type = 'list'
  and placement.entity_id is not null
  and regexp_replace(list_row.id, '^list:', '') = placement.entity_id::text
  and (
    list_row.folder_id is distinct from placement.container_folder_id
    or list_row.sort_order <> placement.sort_order
  );

-- Deployment normalization invalidates stale CAS snapshots exactly once.
update public.adhdice_task_list_containers container_row
set revision = container_row.revision + 1,
    updated_at = now()
where exists (
  select 1
  from public.adhdice_task_list_rail_items placement
  where placement.user_id = container_row.user_id
    and placement.container_folder_id is not distinct from container_row.folder_id
);

create or replace function public.adhdice_reconcile_task_list_rail_items(
  p_manifest jsonb
)
returns setof public.adhdice_task_list_rail_items
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_item_key text;
  v_item_type text;
  v_entity_id uuid;
  v_container_folder_id uuid;
  v_default_sort_order integer;
  v_inserted integer;
  v_next_order integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 7422)
  );
  if jsonb_typeof(p_manifest) <> 'array' or jsonb_array_length(p_manifest) > 512 then
    raise exception 'Invalid rail manifest.' using errcode = '22023';
  end if;

  insert into public.adhdice_task_list_containers (user_id, folder_id)
  values (v_user_id, null)
  on conflict do nothing;

  for v_item in
    select definition
    from jsonb_array_elements(p_manifest) with ordinality manifest(definition, ordinal)
    order by ordinal
  loop
    v_item_key := v_item->>'item_key';
    v_item_type := v_item->>'item_type';
    v_entity_id := nullif(v_item->>'entity_id', '')::uuid;
    v_container_folder_id := nullif(v_item->>'default_container_folder_id', '')::uuid;

    if jsonb_typeof(v_item->'default_sort_order') <> 'number' then
      raise exception 'Rail manifest sort order must be a bounded integer.' using errcode = '22023';
    end if;
    if (v_item->'default_sort_order')::numeric <> trunc((v_item->'default_sort_order')::numeric)
      or (v_item->'default_sort_order')::numeric not between 0 and 1000000 then
      raise exception 'Rail manifest sort order must be a bounded integer.' using errcode = '22023';
    end if;
    v_default_sort_order := (v_item->'default_sort_order')::numeric::integer;

    if v_item_type not in ('list', 'folder')
      or v_item_key is null
      or (v_item_type = 'folder' and (v_entity_id is null or v_item_key <> 'folder:' || v_entity_id::text))
      or (v_item_type = 'list' and v_entity_id is null and v_item_key not like 'system:%')
      or (v_item_type = 'list' and v_entity_id is not null and v_item_key <> 'list:' || v_entity_id::text)
    then
      raise exception 'Invalid rail manifest identity.' using errcode = '22023';
    end if;
    if v_container_folder_id is not null and not exists (
      select 1
      from public.adhdice_task_list_folders
      where user_id = v_user_id and id = v_container_folder_id
    ) then
      v_container_folder_id := null;
    end if;

    insert into public.adhdice_task_list_containers (user_id, folder_id)
    values (v_user_id, v_container_folder_id)
    on conflict do nothing;
    perform 1
    from public.adhdice_task_list_containers
    where user_id = v_user_id
      and folder_id is not distinct from v_container_folder_id
    for update;

    select least(1000000, coalesce(max(sort_order) + 1, 0))
    into v_next_order
    from public.adhdice_task_list_rail_items
    where user_id = v_user_id
      and container_folder_id is not distinct from v_container_folder_id;

    insert into public.adhdice_task_list_rail_items (
      user_id, item_key, item_type, entity_id, container_folder_id, sort_order
    )
    values (
      v_user_id, v_item_key, v_item_type, v_entity_id,
      v_container_folder_id, v_next_order
    )
    on conflict (user_id, item_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      update public.adhdice_task_list_containers
      set revision = revision + 1, updated_at = now()
      where user_id = v_user_id
        and folder_id is not distinct from v_container_folder_id;
    end if;
  end loop;

  return query
  select saved.*
  from public.adhdice_task_list_rail_items saved
  where saved.user_id = v_user_id
    and exists (
      select 1
      from jsonb_array_elements(p_manifest) definition
      where definition->>'item_key' = saved.item_key
    )
  order by saved.container_folder_id nulls first, saved.sort_order, saved.item_key;
end;
$$;

revoke all on function public.adhdice_reconcile_task_list_rail_items(jsonb) from public, anon;
grant execute on function public.adhdice_reconcile_task_list_rail_items(jsonb) to authenticated;

create or replace function public.adhdice_mutate_task_list_rail_placement(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item_key text := p_payload->>'item_key';
  v_item_type text;
  v_entity_id uuid;
  v_source_folder_id uuid;
  v_destination_folder_id uuid := nullif(p_payload->>'destination_container_folder_id', '')::uuid;
  v_expected_source_revision bigint := (p_payload->>'expected_source_revision')::bigint;
  v_expected_destination_revision bigint := (p_payload->>'expected_destination_revision')::bigint;
  v_source_revision bigint;
  v_destination_revision bigint;
  v_target_index integer := (p_payload->>'target_index')::integer;
  v_destination_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 7422)
  );
  if v_expected_source_revision is null or v_expected_destination_revision is null then
    raise exception 'Expected source and destination revisions are required.' using errcode = '22023';
  end if;
  if v_target_index is null or v_target_index < 0 or v_target_index > 1000000 then
    raise exception 'Destination index must be a bounded integer.' using errcode = '22023';
  end if;

  select item_type, entity_id, container_folder_id
  into v_item_type, v_entity_id, v_source_folder_id
  from public.adhdice_task_list_rail_items
  where user_id = v_user_id and item_key = v_item_key
  for update;
  if not found then
    raise exception 'Unknown rail item.' using errcode = 'P0002';
  end if;

  if v_destination_folder_id is not null and not exists (
    select 1
    from public.adhdice_task_list_folders
    where user_id = v_user_id and id = v_destination_folder_id
  ) then
    raise exception 'Unknown destination folder.' using errcode = '23503';
  end if;

  if v_item_type = 'folder' then
    if v_destination_folder_id = v_entity_id then
      raise exception 'A folder cannot contain itself.' using errcode = '23514';
    end if;
    if v_destination_folder_id is not null and exists (
      with recursive descendants(id) as (
        select id
        from public.adhdice_task_list_folders
        where user_id = v_user_id and parent_folder_id = v_entity_id
        union all
        select child.id
        from public.adhdice_task_list_folders child
        join descendants parent on child.parent_folder_id = parent.id
        where child.user_id = v_user_id
      )
      select 1 from descendants where id = v_destination_folder_id
    ) then
      raise exception 'A folder cycle is not allowed.' using errcode = '23514';
    end if;
  end if;

  insert into public.adhdice_task_list_containers (user_id, folder_id)
  values (v_user_id, v_source_folder_id), (v_user_id, v_destination_folder_id)
  on conflict do nothing;

  perform 1
  from public.adhdice_task_list_containers
  where user_id = v_user_id
    and (
      folder_id is not distinct from v_source_folder_id
      or folder_id is not distinct from v_destination_folder_id
    )
  order by coalesce(folder_id::text, '')
  for update;

  select revision into v_source_revision
  from public.adhdice_task_list_containers
  where user_id = v_user_id and folder_id is not distinct from v_source_folder_id;
  select revision into v_destination_revision
  from public.adhdice_task_list_containers
  where user_id = v_user_id and folder_id is not distinct from v_destination_folder_id;

  if v_source_revision <> v_expected_source_revision
    or v_destination_revision <> v_expected_destination_revision
  then
    return jsonb_build_object(
      'status', 'conflict',
      'code', 'ADHDICE_LIST_FOLDER_REVISION_CONFLICT',
      'source_revision', v_source_revision,
      'destination_revision', v_destination_revision
    );
  end if;

  select count(*)::integer into v_destination_count
  from public.adhdice_task_list_rail_items
  where user_id = v_user_id
    and container_folder_id is not distinct from v_destination_folder_id
    and item_key <> v_item_key;
  if v_target_index > v_destination_count then
    raise exception 'Destination index is outside sibling bounds.' using errcode = '22023';
  end if;

  update public.adhdice_task_list_rail_items
  set container_folder_id = v_destination_folder_id,
      updated_at = now()
  where user_id = v_user_id and item_key = v_item_key;

  with ranked as (
    select item_key, row_number() over (order by sort_order, item_key) - 1 as next_order
    from public.adhdice_task_list_rail_items
    where user_id = v_user_id
      and container_folder_id is not distinct from v_source_folder_id
      and item_key <> v_item_key
  )
  update public.adhdice_task_list_rail_items saved
  set sort_order = ranked.next_order::integer, updated_at = now()
  from ranked
  where saved.user_id = v_user_id and saved.item_key = ranked.item_key;

  with ranked as (
    select item_key, row_number() over (order by sort_order, item_key) - 1 as next_order
    from public.adhdice_task_list_rail_items
    where user_id = v_user_id
      and container_folder_id is not distinct from v_destination_folder_id
      and item_key <> v_item_key
  )
  update public.adhdice_task_list_rail_items saved
  set sort_order = (
        ranked.next_order
        + case when ranked.next_order >= v_target_index then 1 else 0 end
      )::integer,
      updated_at = now()
  from ranked
  where saved.user_id = v_user_id and saved.item_key = ranked.item_key;

  update public.adhdice_task_list_rail_items
  set sort_order = v_target_index, updated_at = now()
  where user_id = v_user_id and item_key = v_item_key;

  update public.adhdice_task_list_folders folder
  set parent_folder_id = placement.container_folder_id,
      sort_order = placement.sort_order,
      revision = folder.revision + case when placement.item_key = v_item_key then 1 else 0 end,
      updated_at = now()
  from public.adhdice_task_list_rail_items placement
  where placement.user_id = v_user_id
    and placement.item_type = 'folder'
    and placement.entity_id = folder.id
    and folder.user_id = v_user_id
    and (
      placement.container_folder_id is not distinct from v_source_folder_id
      or placement.container_folder_id is not distinct from v_destination_folder_id
    );

  update public.adhdice_task_lists list_row
  set folder_id = placement.container_folder_id,
      sort_order = placement.sort_order,
      revision = list_row.revision + case when placement.item_key = v_item_key then 1 else 0 end,
      updated_at = now()
  from public.adhdice_task_list_rail_items placement
  where placement.user_id = v_user_id
    and placement.item_type = 'list'
    and placement.entity_id is not null
    and regexp_replace(list_row.id, '^list:', '') = placement.entity_id::text
    and list_row.user_id = v_user_id
    and (
      placement.container_folder_id is not distinct from v_source_folder_id
      or placement.container_folder_id is not distinct from v_destination_folder_id
    );

  update public.adhdice_task_list_containers
  set revision = revision + 1, updated_at = now()
  where user_id = v_user_id
    and (
      folder_id is not distinct from v_source_folder_id
      or folder_id is not distinct from v_destination_folder_id
    );

  return jsonb_build_object(
    'status', 'ok',
    'item_key', v_item_key,
    'source_container_folder_id', v_source_folder_id,
    'destination_container_folder_id', v_destination_folder_id,
    'target_index', v_target_index
  );
end;
$$;

revoke all on function public.adhdice_mutate_task_list_rail_placement(jsonb) from public, anon;
grant execute on function public.adhdice_mutate_task_list_rail_placement(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

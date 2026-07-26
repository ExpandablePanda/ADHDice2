-- ADHDice 7.4.22: canonical List Rail placement.
-- Forward migration. Extends (does not replace) add_task_list_folders_7_4_10.sql.
-- Apply manually in Supabase before browser QA.

begin;

create table if not exists public.adhdice_task_list_rail_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  item_type text not null check (item_type in ('list', 'folder')),
  entity_id uuid,
  container_folder_id uuid,
  sort_order integer not null default 0
    check (sort_order between 0 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key),
  constraint adhdice_task_list_rail_items_container_fk
    foreign key (user_id, container_folder_id)
    references public.adhdice_task_list_folders(user_id, id)
    on delete restrict,
  constraint adhdice_task_list_rail_items_identity_check check (
    (item_type = 'folder' and entity_id is not null and item_key = 'folder:' || entity_id::text)
    or
    (item_type = 'list' and (
      (entity_id is null and item_key like 'system:%')
      or (entity_id is not null and item_key = 'list:' || entity_id::text)
    ))
  )
);

create index if not exists adhdice_task_list_rail_items_container_order_idx
  on public.adhdice_task_list_rail_items
  (user_id, container_folder_id, sort_order, item_key);

alter table public.adhdice_task_list_rail_items enable row level security;
alter table public.adhdice_task_list_rail_items force row level security;

drop policy if exists "task list rail items owner select" on public.adhdice_task_list_rail_items;
create policy "task list rail items owner select"
  on public.adhdice_task_list_rail_items
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "task list rail items owner insert" on public.adhdice_task_list_rail_items;
create policy "task list rail items owner insert"
  on public.adhdice_task_list_rail_items
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "task list rail items owner update" on public.adhdice_task_list_rail_items;
create policy "task list rail items owner update"
  on public.adhdice_task_list_rail_items
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "task list rail items owner delete" on public.adhdice_task_list_rail_items;
create policy "task list rail items owner delete"
  on public.adhdice_task_list_rail_items
  for delete to authenticated
  using (auth.uid() = user_id);

revoke all on public.adhdice_task_list_rail_items from public, anon;
grant select, insert, update, delete on public.adhdice_task_list_rail_items to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'adhdice_task_list_rail_items'
    )
  then
    alter publication supabase_realtime add table public.adhdice_task_list_rail_items;
  end if;
end;
$$;

-- Root containers must exist even for accounts that have never created a list.
insert into public.adhdice_task_list_containers (user_id, folder_id)
select users.user_id, null
from (
  select id as user_id from auth.users
  union
  select user_id from public.adhdice_task_lists
  union
  select user_id from public.adhdice_task_list_folders
) users
on conflict do nothing;

insert into public.adhdice_task_list_containers (user_id, folder_id)
select user_id, id
from public.adhdice_task_list_folders
on conflict do nothing;

-- Preserve existing nested folder placement.
insert into public.adhdice_task_list_rail_items (
  user_id, item_key, item_type, entity_id, container_folder_id, sort_order
)
select
  folder.user_id,
  'folder:' || folder.id::text,
  'folder',
  folder.id,
  folder.parent_folder_id,
  least(1000000::bigint, greatest(0::bigint, folder.sort_order))::integer
from public.adhdice_task_list_folders folder
on conflict (user_id, item_key) do nothing;

-- Preserve database-backed list placement. Built-in overrides keep stable system keys.
insert into public.adhdice_task_list_rail_items (
  user_id, item_key, item_type, entity_id, container_folder_id, sort_order
)
select
  list_row.user_id,
  case
    when list_row.built_in_key is not null then 'system:' || list_row.built_in_key
    when list_row.id in (
      'all', 'inbox', 'today', 'milestones', 'focus', 'priority_1_2',
      'priority_3_4', 'priority_5', 'routine', 'quick_wins', 'recurring',
      'waiting', 'later', 'done', 'missed'
    ) then 'system:' || list_row.id
    else 'list:' || regexp_replace(list_row.id, '^list:', '')
  end,
  'list',
  case
    when list_row.built_in_key is not null then null
    when list_row.id in (
      'all', 'inbox', 'today', 'milestones', 'focus', 'priority_1_2',
      'priority_3_4', 'priority_5', 'routine', 'quick_wins', 'recurring',
      'waiting', 'later', 'done', 'missed'
    ) then null
    else regexp_replace(list_row.id, '^list:', '')::uuid
  end,
  list_row.folder_id,
  least(1000000::bigint, greatest(0::bigint, list_row.sort_order))::integer
from public.adhdice_task_lists list_row
where list_row.built_in_key is not null
   or list_row.id in (
     'all', 'inbox', 'today', 'milestones', 'focus', 'priority_1_2',
     'priority_3_4', 'priority_5', 'routine', 'quick_wins', 'recurring',
     'waiting', 'later', 'done', 'missed'
   )
   or regexp_replace(list_row.id, '^list:', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (user_id, item_key) do nothing;

-- 7.4.10 allowed only manual custom lists in folders. Placement subtype is now irrelevant.
create or replace function public.adhdice_guard_task_list_folder_eligibility()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  return new;
end;
$$;

-- Seed synthetic lists once. Saved placement wins forever after this insert.
with default_lists(item_key, default_order) as (
  values
    ('system:all', 0), ('system:inbox', 1), ('system:today', 2),
    ('system:milestones', 3), ('system:focus', 4), ('system:priority_1_2', 5),
    ('system:priority_3_4', 6), ('system:priority_5', 7), ('system:routine', 8),
    ('system:quick_wins', 9), ('system:recurring', 10), ('system:waiting', 11),
    ('system:later', 12), ('system:done', 13), ('system:missed', 14)
), owners as (
  select id as user_id from auth.users
)
insert into public.adhdice_task_list_rail_items (
  user_id, item_key, item_type, entity_id, container_folder_id, sort_order
)
select owner.user_id, definition.item_key, 'list', null, null, definition.default_order
from owners owner
cross join default_lists definition
on conflict (user_id, item_key) do nothing;

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

  -- Non-manifest rows are ignored here so a stale client cannot erase a newly
  -- created list. Database delete triggers retire genuinely deleted entities.

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
      select 1 from public.adhdice_task_list_folders
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
      select 1 from jsonb_array_elements(p_manifest) definition
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
    raise exception 'Destination index must be bounded.' using errcode = '22023';
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
    select 1 from public.adhdice_task_list_folders
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
        select id from public.adhdice_task_list_folders
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

  -- Consistent lock ordering prevents cross-container deadlocks.
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

  -- Canonical placement is authoritative; legacy columns are compatibility mirrors only.
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

-- Creation/deletion compatibility: all placement updates after creation use the canonical RPC.
create or replace function public.adhdice_seed_created_task_list_rail_item()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item_key text;
  v_entity_id uuid;
  v_next_order integer;
begin
  if new.built_in_key is not null then
    v_item_key := 'system:' || new.built_in_key;
    v_entity_id := null;
  elsif regexp_replace(new.id, '^list:', '') ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_entity_id := regexp_replace(new.id, '^list:', '')::uuid;
    v_item_key := 'list:' || v_entity_id::text;
  else
    return new;
  end if;
  select least(1000000, coalesce(max(sort_order) + 1, 0)) into v_next_order
  from public.adhdice_task_list_rail_items
  where user_id = new.user_id and container_folder_id is not distinct from new.folder_id;
  insert into public.adhdice_task_list_rail_items (
    user_id, item_key, item_type, entity_id, container_folder_id, sort_order
  ) values (new.user_id, v_item_key, 'list', v_entity_id, new.folder_id, v_next_order)
  on conflict (user_id, item_key) do nothing;
  update public.adhdice_task_list_containers
  set revision = revision + 1, updated_at = now()
  where user_id = new.user_id and folder_id is not distinct from new.folder_id;
  return new;
end;
$$;

drop trigger if exists adhdice_seed_created_task_list_rail_item on public.adhdice_task_lists;
create trigger adhdice_seed_created_task_list_rail_item
after insert on public.adhdice_task_lists
for each row execute function public.adhdice_seed_created_task_list_rail_item();

create or replace function public.adhdice_remove_deleted_task_list_rail_item()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item_key text;
begin
  v_item_key := case
    when old.built_in_key is not null then 'system:' || old.built_in_key
    when regexp_replace(old.id, '^list:', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then 'list:' || regexp_replace(old.id, '^list:', '')
    else 'system:' || old.id
  end;
  delete from public.adhdice_task_list_rail_items
  where user_id = old.user_id and item_key = v_item_key;
  with ranked as (
    select item_key, row_number() over (order by sort_order, item_key) - 1 as next_order
    from public.adhdice_task_list_rail_items
    where user_id = old.user_id
      and container_folder_id is not distinct from old.folder_id
  )
  update public.adhdice_task_list_rail_items placement
  set sort_order = ranked.next_order::integer, updated_at = now()
  from ranked
  where placement.user_id = old.user_id and placement.item_key = ranked.item_key;
  update public.adhdice_task_list_containers
  set revision = revision + 1, updated_at = now()
  where user_id = old.user_id and folder_id is not distinct from old.folder_id;
  return old;
end;
$$;

drop trigger if exists adhdice_remove_deleted_task_list_rail_item on public.adhdice_task_lists;
create trigger adhdice_remove_deleted_task_list_rail_item
after delete on public.adhdice_task_lists
for each row execute function public.adhdice_remove_deleted_task_list_rail_item();

create or replace function public.adhdice_seed_created_task_list_folder_rail_item()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.adhdice_task_list_rail_items
  set sort_order = least(1000000, sort_order + 1), updated_at = now()
  where user_id = new.user_id
    and container_folder_id is not distinct from new.parent_folder_id
    and sort_order >= least(1000000::bigint, greatest(0::bigint, new.sort_order))::integer;
  insert into public.adhdice_task_list_rail_items (
    user_id, item_key, item_type, entity_id, container_folder_id, sort_order
  ) values (
    new.user_id, 'folder:' || new.id::text, 'folder', new.id,
    new.parent_folder_id,
    least(1000000::bigint, greatest(0::bigint, new.sort_order))::integer
  )
  on conflict (user_id, item_key) do nothing;
  return new;
end;
$$;

drop trigger if exists adhdice_seed_created_task_list_folder_rail_item on public.adhdice_task_list_folders;
create trigger adhdice_seed_created_task_list_folder_rail_item
after insert on public.adhdice_task_list_folders
for each row execute function public.adhdice_seed_created_task_list_folder_rail_item();

create or replace function public.adhdice_promote_deleted_task_list_folder_rail_items()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_child_count integer;
begin
  select count(*)::integer into v_child_count
  from public.adhdice_task_list_rail_items
  where user_id = old.user_id and container_folder_id = old.id;
  update public.adhdice_task_list_rail_items
  set sort_order = greatest(0, sort_order + v_child_count - 1),
      updated_at = now()
  where user_id = old.user_id
    and container_folder_id is not distinct from old.parent_folder_id
    and item_key <> 'folder:' || old.id::text
    and sort_order > old.sort_order;
  update public.adhdice_task_list_rail_items
  set container_folder_id = old.parent_folder_id,
      sort_order = least(
        1000000::bigint,
        greatest(0::bigint, old.sort_order + sort_order::bigint)
      )::integer,
      updated_at = now()
  where user_id = old.user_id and container_folder_id = old.id;
  delete from public.adhdice_task_list_rail_items
  where user_id = old.user_id and item_key = 'folder:' || old.id::text;
  with ranked as (
    select item_key, row_number() over (order by sort_order, item_key) - 1 as next_order
    from public.adhdice_task_list_rail_items
    where user_id = old.user_id
      and container_folder_id is not distinct from old.parent_folder_id
  )
  update public.adhdice_task_list_rail_items placement
  set sort_order = ranked.next_order::integer, updated_at = now()
  from ranked
  where placement.user_id = old.user_id and placement.item_key = ranked.item_key;
  return old;
end;
$$;

drop trigger if exists adhdice_promote_deleted_task_list_folder_rail_items on public.adhdice_task_list_folders;
create trigger adhdice_promote_deleted_task_list_folder_rail_items
before delete on public.adhdice_task_list_folders
for each row execute function public.adhdice_promote_deleted_task_list_folder_rail_items();

commit;

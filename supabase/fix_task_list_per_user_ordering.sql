begin;

do $$
begin
  if exists (
    select 1
    from public.adhdice_task_lists
    group by user_id, id
    having count(*) > 1
  ) then
    raise exception 'Cannot migrate adhdice_task_lists: duplicate (user_id, id) rows exist';
  end if;
end
$$;

alter table public.adhdice_task_lists
  drop constraint adhdice_task_lists_pkey;

alter table public.adhdice_task_lists
  add constraint adhdice_task_lists_pkey primary key (user_id, id);

create or replace function public.reorder_task_lists(ordered_list_ids text[])
returns setof public.adhdice_task_lists
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  submitted_count integer;
  permitted_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if ordered_list_ids is null or coalesce(array_length(ordered_list_ids, 1), 0) = 0 then
    raise exception 'At least one task-list ID is required';
  end if;

  select count(*), count(distinct list_id)
  into submitted_count, permitted_count
  from unnest(ordered_list_ids) as submitted(list_id);

  if submitted_count <> permitted_count then
    raise exception 'Task-list order contains duplicate IDs';
  end if;

  if 'routine' = any(ordered_list_ids) then
    raise exception 'Routine is fixed outside the primary task-list order';
  end if;

  with canonical(id) as (
    values
      ('all'), ('inbox'), ('today'), ('focus'), ('priority_1_2'),
      ('priority_3_4'), ('priority_5'), ('routine'), ('quick_wins'),
      ('recurring'), ('waiting'), ('later'), ('done'), ('missed')
  )
  select count(*)
  into permitted_count
  from unnest(ordered_list_ids) as submitted(list_id)
  where exists (select 1 from canonical where canonical.id = submitted.list_id)
     or exists (
       select 1
       from public.adhdice_task_lists existing
       where existing.user_id = current_user_id
         and existing.id = submitted.list_id
         and existing.list_type = 'custom'
         and submitted.list_id like 'list:%'
     );

  if permitted_count <> submitted_count then
    raise exception 'Task-list order contains an unpermitted ID';
  end if;

  insert into public.adhdice_task_lists (
    user_id, id, built_in_key, name, list_type, membership_mode,
    is_deletable, is_editable, is_visible, sort_order, rules_json
  )
  select
    current_user_id,
    canonical.id,
    canonical.id,
    canonical.name,
    canonical.list_type,
    canonical.membership_mode,
    false,
    true,
    true,
    submitted.ordinality - 1,
    null
  from unnest(ordered_list_ids) with ordinality as submitted(id, ordinality)
  join (values
    ('all', 'All', 'system', 'manual'),
    ('inbox', 'Inbox', 'system', 'rules'),
    ('today', 'Today', 'system', 'rules'),
    ('focus', 'Focus', 'smart', 'rules'),
    ('priority_1_2', 'Priority 1-2', 'smart', 'rules'),
    ('priority_3_4', 'Priority 3-4', 'smart', 'rules'),
    ('priority_5', 'Priority 5', 'smart', 'rules'),
    ('quick_wins', 'Quick Wins', 'system', 'manual'),
    ('recurring', 'Recurring', 'system', 'rules'),
    ('waiting', 'Waiting', 'system', 'rules'),
    ('later', 'Later', 'system', 'manual'),
    ('done', 'Done', 'system', 'rules'),
    ('missed', 'Missed', 'system', 'rules')
  ) as canonical(id, name, list_type, membership_mode) on canonical.id = submitted.id
  on conflict (user_id, id) do nothing;

  with complete_order as (
    select submitted.id, submitted.ordinality::bigint - 1 as sort_order
    from unnest(ordered_list_ids) with ordinality as submitted(id, ordinality)
    union all
    select existing.id,
      array_length(ordered_list_ids, 1)::bigint
        + row_number() over (order by existing.sort_order, existing.created_at, existing.id) - 1
    from public.adhdice_task_lists existing
    where existing.user_id = current_user_id
      and existing.id <> 'routine'
      and not (existing.id = any(ordered_list_ids))
  )
  update public.adhdice_task_lists target
  set sort_order = complete_order.sort_order
  from complete_order
  where target.user_id = current_user_id
    and target.id = complete_order.id;

  if not found then
    raise exception 'Task-list reorder affected no rows';
  end if;

  return query
  select lists.*
  from public.adhdice_task_lists lists
  where lists.user_id = current_user_id
  order by lists.sort_order, lists.created_at, lists.id;
end;
$$;

revoke all on function public.reorder_task_lists(text[]) from public;
grant execute on function public.reorder_task_lists(text[]) to authenticated;

commit;

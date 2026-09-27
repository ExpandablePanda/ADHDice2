-- ADHDice 7.15.61 Supabase scale hardening.
-- Source-only migration. Review and apply through the normal Supabase release
-- process; this file is intentionally not executed by the browser or tests.

begin;

create or replace function public.adhdice_get_latest_manual_task_commands(
  p_entity_ids uuid[]
)
returns table (
  id uuid,
  user_id uuid,
  entity_id uuid,
  command_type text,
  requested_logical_date date,
  state text,
  result_references jsonb,
  source_kind text,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Latest manual Task commands require an authenticated owner.'
      using errcode = '28000';
  end if;

  return query
    select latest.id,
           latest.user_id,
           latest.entity_id,
           latest.command_type,
           latest.requested_logical_date,
           latest.state,
           latest.result_references,
           latest.source_kind,
           latest.created_at,
           latest.completed_at
      from (
        select distinct on (operation.entity_id)
               operation.id,
               operation.user_id,
               operation.entity_id,
               operation.command_type,
               operation.requested_logical_date,
               operation.state,
               operation.result_references,
               operation.source_kind,
               operation.created_at,
               operation.completed_at
          from public.adhdice_task_command_operations operation
         where operation.user_id = v_user_id
           and operation.entity_id = any(coalesce(p_entity_ids, '{}'::uuid[]))
           and operation.state = 'committed'
           and operation.source_kind = 'runtime'
           and operation.requested_logical_date is not null
           and (
             operation.command_type in (
               'set_outcome',
               'clear_outcome',
               'complete_task',
               'delay_occurrence',
               'calendar_override',
               'archive_task',
               'trash_task',
               'restore_task',
               'start_in_progress',
               'clear_in_progress'
             )
             or (
               operation.command_type = 'set_due_date'
               and operation.result_references->>'manual_action' = 'unscheduled_status'
             )
           )
         order by operation.entity_id,
                  operation.requested_logical_date desc,
                  coalesce(operation.completed_at, operation.created_at) desc,
                  operation.id desc
      ) latest
     order by latest.entity_id;
end;
$function$;

revoke all on function public.adhdice_get_latest_manual_task_commands(uuid[])
  from public, anon, authenticated;
grant execute on function public.adhdice_get_latest_manual_task_commands(uuid[])
  to authenticated;

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
      ) latest_boundary
     order by latest_boundary.entity_id;
end;
$function$;

revoke all on function public.adhdice_get_latest_task_schedule_boundaries(uuid[])
  from public, anon, authenticated;
grant execute on function public.adhdice_get_latest_task_schedule_boundaries(uuid[])
  to authenticated;

create index if not exists adhdice_health_meal_entries_user_source_food_idx
  on public.adhdice_health_meal_entries (user_id, source_food_id);

drop policy if exists "Users can read their own clean tasks" on public.adhdice_clean_tasks;
create policy "Users can read their own clean tasks"
  on public.adhdice_clean_tasks
  for select
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own clean tasks" on public.adhdice_clean_tasks;
create policy "Users can create their own clean tasks"
  on public.adhdice_clean_tasks
  for insert
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own clean tasks" on public.adhdice_clean_tasks;
create policy "Users can update their own clean tasks"
  on public.adhdice_clean_tasks
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own clean tasks" on public.adhdice_clean_tasks;
create policy "Users can delete their own clean tasks"
  on public.adhdice_clean_tasks
  for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own focus sessions" on public.adhdice_focus_sessions;
create policy "Users can read their own focus sessions"
  on public.adhdice_focus_sessions
  for select
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own focus sessions" on public.adhdice_focus_sessions;
create policy "Users can create their own focus sessions"
  on public.adhdice_focus_sessions
  for insert
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own focus sessions" on public.adhdice_focus_sessions;
create policy "Users can update their own focus sessions"
  on public.adhdice_focus_sessions
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own focus sessions" on public.adhdice_focus_sessions;
create policy "Users can delete their own focus sessions"
  on public.adhdice_focus_sessions
  for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own health meal entries" on public.adhdice_health_meal_entries;
create policy "Users can manage their own health meal entries"
  on public.adhdice_health_meal_entries
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read own pending reward dice items" on public.adhdice_pending_reward_dice_items;
create policy "Users can read own pending reward dice items"
  on public.adhdice_pending_reward_dice_items
  for select
  using ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';

commit;

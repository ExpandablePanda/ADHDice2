-- ADHDice 7.13.36: qualify ruleset columns in the named Custom ruleset delete RPC.
-- SOURCE ONLY: author for review/application; do not apply to live Supabase automatically.
-- This preserves the 7.13.35 permanently-deleted Task tombstone guard and soft-delete semantics.

create or replace function public.adhdice_delete_custom_behavior_ruleset(
  p_ruleset_id uuid
)
returns table(
  ruleset_id uuid,
  ruleset_name text,
  deleted_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_ruleset public.adhdice_custom_behavior_rulesets%rowtype;
  v_assigned_task_count integer;
begin
  if auth.uid() is null then
    raise exception 'Custom ruleset deletion requires an authenticated owner.'
      using errcode = '42501';
  end if;

  select * into v_ruleset
    from public.adhdice_custom_behavior_rulesets
   where id = p_ruleset_id
     and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'Custom ruleset was not found or is not owned by the authenticated user.'
      using errcode = 'P0002';
  end if;
  if v_ruleset.deleted_at is not null then
    raise exception 'Custom ruleset is already deleted.'
      using errcode = 'P0002';
  end if;

  select count(*)::integer into v_assigned_task_count
    from public.adhdice_clean_tasks task
   where task.user_id = auth.uid()
     and task.custom_ruleset_id = p_ruleset_id
     and task.permanently_deleted_at is null;
  if v_assigned_task_count > 0 then
    raise exception '% is currently assigned to % Task%. Change those Tasks to another type or ruleset before deleting it.',
      v_ruleset.name,
      v_assigned_task_count,
      case when v_assigned_task_count = 1 then '' else 's' end
      using errcode = '23514';
  end if;

  return query
  update public.adhdice_custom_behavior_rulesets as ruleset
     set deleted_at = now(),
         updated_at = now()
   where ruleset.id = p_ruleset_id
     and ruleset.user_id = auth.uid()
     and ruleset.deleted_at is null
  returning ruleset.id, ruleset.name, ruleset.deleted_at;
end;
$function$;

revoke all on function public.adhdice_delete_custom_behavior_ruleset(uuid) from public, anon, authenticated;
grant execute on function public.adhdice_delete_custom_behavior_ruleset(uuid) to authenticated;

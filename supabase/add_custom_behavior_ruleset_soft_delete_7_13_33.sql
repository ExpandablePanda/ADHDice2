-- ADHDice 7.13.33: tombstone named Custom behavior rulesets.
-- SOURCE ONLY: author for review/application; do not apply to live Supabase automatically.
-- Historical revisions, behavior selections, and Task History remain untouched.

alter table if exists public.adhdice_custom_behavior_rulesets
  add column if not exists deleted_at timestamptz null;

-- All new/current references must point at an active identity. Existing
-- effective-dated rows remain readable because this guard only protects writes.
create or replace function public.adhdice_validate_active_custom_behavior_ruleset_reference()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if new.custom_ruleset_id is null then
    return new;
  end if;
  if not exists (
    select 1
      from public.adhdice_custom_behavior_rulesets ruleset
     where ruleset.user_id = new.user_id
       and ruleset.id = new.custom_ruleset_id
       and ruleset.task_type = 'custom'
       and ruleset.deleted_at is null
  ) then
    raise exception 'The named Custom ruleset is missing, not owned by the owner, or has been deleted.'
      using errcode = '23503';
  end if;
  return new;
end;
$function$;

revoke all on function public.adhdice_validate_active_custom_behavior_ruleset_reference() from public, anon, authenticated;

drop trigger if exists adhdice_validate_active_custom_ruleset_task_reference
  on public.adhdice_clean_tasks;
create trigger adhdice_validate_active_custom_ruleset_task_reference
  before insert or update of custom_ruleset_id
  on public.adhdice_clean_tasks
  for each row execute function public.adhdice_validate_active_custom_behavior_ruleset_reference();

drop trigger if exists adhdice_validate_active_custom_ruleset_selection_reference
  on public.adhdice_task_behavior_selections;
create trigger adhdice_validate_active_custom_ruleset_selection_reference
  before insert or update of custom_ruleset_id
  on public.adhdice_task_behavior_selections
  for each row execute function public.adhdice_validate_active_custom_behavior_ruleset_reference();

-- User-facing deletion is a tombstone, not a physical delete. The row lock
-- makes the current-assignment check and tombstone one owner-scoped operation;
-- restrictive foreign keys and the active-reference trigger preserve the same
-- invariant for concurrent assignment attempts.
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
     and task.custom_ruleset_id = p_ruleset_id;
  if v_assigned_task_count > 0 then
    raise exception '% is currently assigned to % Task%. Change those Tasks to another type or ruleset before deleting it.',
      v_ruleset.name,
      v_assigned_task_count,
      case when v_assigned_task_count = 1 then '' else 's' end
      using errcode = '23514';
  end if;

  return query
  update public.adhdice_custom_behavior_rulesets
     set deleted_at = now(),
         updated_at = now()
   where id = p_ruleset_id
     and user_id = auth.uid()
     and deleted_at is null
  returning id, name, deleted_at;
end;
$function$;

revoke all on function public.adhdice_delete_custom_behavior_ruleset(uuid) from public, anon, authenticated;
grant execute on function public.adhdice_delete_custom_behavior_ruleset(uuid) to authenticated;

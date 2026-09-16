-- ADHDice 7.13.58: remove the obsolete anonymous Custom Default state.
-- SOURCE ONLY: inspect and apply separately; this migration is not run by Codex.
-- Named Custom Task Type identities, revisions, and named selections remain intact.

begin;

do $preconditions$
begin
  if to_regclass('public.adhdice_clean_tasks') is null
     or to_regclass('public.adhdice_task_behavior_selections') is null
     or to_regclass('public.adhdice_task_type_behavior_profiles') is null then
    raise exception '7.13.58 requires the Task, behavior selection, and TaskType profile tables.';
  end if;
end;
$preconditions$;

lock table
  public.adhdice_clean_tasks,
  public.adhdice_task_behavior_selections,
  public.adhdice_task_type_behavior_profiles
  in share row exclusive mode;

-- The projection guard normally requires the canonical mutation authority.
-- This migration is the explicit, owner-independent data repair authority.
select set_config('adhdice.task_behavior_selection_authority', '1', true);

update public.adhdice_clean_tasks
   set task_type = 'task',
       custom_ruleset_id = null
 where task_type = 'custom'
   and custom_ruleset_id is null;

update public.adhdice_task_behavior_selections
   set task_type = 'task',
       custom_ruleset_id = null,
       updated_at = clock_timestamp()
 where task_type = 'custom'
   and custom_ruleset_id is null;

delete from public.adhdice_task_type_behavior_profiles
 where task_type = 'custom';

alter table public.adhdice_clean_tasks
  drop constraint if exists adhdice_clean_tasks_custom_ruleset_task_type_check;
alter table public.adhdice_clean_tasks
  add constraint adhdice_clean_tasks_custom_ruleset_task_type_check
  check (
    (task_type = 'custom' and custom_ruleset_id is not null)
    or (task_type in ('task', 'goal') and custom_ruleset_id is null)
  );

alter table public.adhdice_task_behavior_selections
  drop constraint if exists adhdice_task_behavior_selections_custom_ruleset_task_type_check;
alter table public.adhdice_task_behavior_selections
  add constraint adhdice_task_behavior_selections_custom_ruleset_task_type_check
  check (
    (task_type = 'custom' and custom_ruleset_id is not null)
    or (task_type in ('task', 'goal') and custom_ruleset_id is null)
  );

alter table public.adhdice_task_type_behavior_profiles
  drop constraint if exists adhdice_task_type_behavior_profiles_task_type_check;
alter table public.adhdice_task_type_behavior_profiles
  add constraint adhdice_task_type_behavior_profiles_task_type_check
  check (task_type in ('task', 'goal'));

do $postconditions$
begin
  if exists (
    select 1
      from public.adhdice_clean_tasks
     where task_type = 'custom' and custom_ruleset_id is null
  ) then
    raise exception '7.13.58 left anonymous custom Task assignments behind.';
  end if;
  if exists (
    select 1
      from public.adhdice_task_behavior_selections
     where task_type = 'custom' and custom_ruleset_id is null
  ) then
    raise exception '7.13.58 left anonymous custom behavior selections behind.';
  end if;
  if exists (
    select 1
      from public.adhdice_task_type_behavior_profiles
     where task_type = 'custom'
  ) then
    raise exception '7.13.58 left generic custom behavior profiles behind.';
  end if;
end;
$postconditions$;

commit;

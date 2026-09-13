-- ADHDice 7.13.54: retire the Pursuit experiment.
--
-- Pursuit rows are test data, not a compatibility surface.  This migration
-- deletes only structurally identified Pursuit records and Task rows whose
-- stored task_type is exactly 'pursuit'.  It performs no title/name matching,
-- conversion, history translation, or snapshot creation.
--
-- Dependency order was checked against the canonical Task State foreign keys:
-- clear Task -> occurrence/command references, remove Task-owned history,
-- occurrences, boundaries, rewards, and selections, then remove the Task.

begin;

do $guard$
begin
  if to_regclass('public.adhdice_clean_tasks') is null then
    raise exception 'Pursuit retirement requires public.adhdice_clean_tasks.';
  end if;
end;
$guard$;

create temporary table adhdice_retired_pursuit_tasks (
  user_id uuid not null,
  task_id uuid not null,
  primary key (user_id, task_id)
) on commit drop;

insert into pg_temp.adhdice_retired_pursuit_tasks (user_id, task_id)
select user_id, id
from public.adhdice_clean_tasks
where task_type = 'pursuit';

-- Standalone Pursuit activity/history is test data and is deleted before the
-- parent table.  TRUNCATE handles the experiment's self-referential parent FK
-- without touching any shared Task table.
do $cleanup_pursuits$
begin
  if to_regclass('public.adhdice_pursuit_activities') is not null then
    execute 'truncate table public.adhdice_pursuit_activities';
  end if;
  if to_regclass('public.adhdice_pursuits') is not null then
    execute 'truncate table public.adhdice_pursuits';
  end if;
end;
$cleanup_pursuits$;

-- Preserve any non-Pursuit Task child as a normal Task by detaching it before
-- deleting a Pursuit-typed parent.  Pursuit-typed children remain in the
-- exact target set and are deleted with the experiment data.
update public.adhdice_clean_tasks child
set parent_task_id = null
where exists (
  select 1
  from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = child.user_id
    and target.task_id = child.parent_task_id
)
and not exists (
  select 1
  from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = child.user_id
    and target.task_id = child.id
);

-- Remove legacy and auxiliary Task-owned records where the table exists in
-- the deployed project version.  These statements are deliberately keyed by
-- Task identity and never by free-form title text.
do $legacy_dependencies$
begin
  if to_regclass('public.adhdice_task_events') is not null then
    execute 'delete from public.adhdice_task_events event using pg_temp.adhdice_retired_pursuit_tasks target where event.task_id = target.task_id and event.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_reward_claims') is not null then
    execute 'delete from public.adhdice_task_reward_claims claim using pg_temp.adhdice_retired_pursuit_tasks target where claim.task_id = target.task_id and claim.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_active_timers') is not null then
    execute 'delete from public.adhdice_task_active_timers timer using pg_temp.adhdice_retired_pursuit_tasks target where timer.task_id = target.task_id and timer.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_list_manual_memberships') is not null then
    execute 'delete from public.adhdice_task_list_manual_memberships membership using pg_temp.adhdice_retired_pursuit_tasks target where membership.task_id = target.task_id and membership.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_scratch_note_task_links') is not null then
    execute 'delete from public.adhdice_scratch_note_task_links link using pg_temp.adhdice_retired_pursuit_tasks target where link.task_id = target.task_id and link.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_custom_ruleset_assignments') is not null then
    execute 'delete from public.adhdice_task_custom_ruleset_assignments assignment using pg_temp.adhdice_retired_pursuit_tasks target where assignment.task_id = target.task_id and assignment.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_behavior_selections') is not null then
    execute 'delete from public.adhdice_task_behavior_selections selection using pg_temp.adhdice_retired_pursuit_tasks target where selection.task_id = target.task_id and selection.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_history') is not null then
    execute 'delete from public.adhdice_task_history history using pg_temp.adhdice_retired_pursuit_tasks target where history.task_id = target.task_id and history.user_id = target.user_id';
  end if;
end;
$legacy_dependencies$;

-- Remove only retired Task IDs from shared focus-day arrays.
do $focus_cleanup$
begin
  if to_regclass('public.adhdice_task_focus_days') is not null then
    execute $sql$
      update public.adhdice_task_focus_days focus
      set task_ids = coalesce(
        (
          select array_agg(ids.task_id order by ids.ordinality)
          from unnest(focus.task_ids) with ordinality as ids(task_id, ordinality)
          where not exists (
            select 1
            from pg_temp.adhdice_retired_pursuit_tasks target
            where target.user_id = focus.user_id
              and target.task_id = ids.task_id
          )
        ),
        '{}'::uuid[]
      )
      where exists (
        select 1
        from pg_temp.adhdice_retired_pursuit_tasks target
        where target.user_id = focus.user_id
          and target.task_id = any(focus.task_ids)
      )
    $sql$;
  end if;
end;
$focus_cleanup$;

-- Canonical Task State dependency order.  Nullable cross-links are cleared
-- first because canonical foreign keys intentionally use ON DELETE RESTRICT.
update public.adhdice_clean_tasks task
set workflow_occurrence_id = null,
    workflow_command_id = null
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = task.user_id and target.task_id = task.id
);

delete from public.adhdice_task_occurrence_effective_overrides override
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = override.user_id and target.task_id = override.entity_id
);

delete from public.adhdice_task_calendar_overrides override
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = override.user_id and target.task_id = override.entity_id
);

delete from public.adhdice_task_reward_claim_consumptions consumption
where exists (
  select 1
  from public.adhdice_task_reward_grants grant_row
  join public.adhdice_task_reward_entitlements entitlement
    on entitlement.user_id = grant_row.user_id
   and entitlement.id = grant_row.entitlement_id
  join pg_temp.adhdice_retired_pursuit_tasks target
    on target.user_id = entitlement.user_id
   and target.task_id = entitlement.entity_id
  where grant_row.user_id = consumption.user_id
    and grant_row.id = consumption.grant_id
);

delete from public.adhdice_task_reward_grants grant_row
where exists (
  select 1
  from public.adhdice_task_reward_entitlements entitlement
  join pg_temp.adhdice_retired_pursuit_tasks target
    on target.user_id = entitlement.user_id
   and target.task_id = entitlement.entity_id
  where grant_row.user_id = entitlement.user_id
    and grant_row.entitlement_id = entitlement.id
);

delete from public.adhdice_task_reward_entitlements entitlement
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = entitlement.user_id and target.task_id = entitlement.entity_id
);

update public.adhdice_task_schedule_boundaries boundary
set prior_boundary_id = null,
    affected_occurrence_id = null,
    command_id = null
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = boundary.user_id and target.task_id = boundary.entity_id
);

update public.adhdice_task_history_facts history
set occurrence_id = null,
    schedule_boundary_id = null,
    command_id = null
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = history.user_id and target.task_id = history.entity_id
);

update public.adhdice_task_occurrences occurrence
set resolved_history_id = null,
    command_id = null
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = occurrence.user_id and target.task_id = occurrence.entity_id
);

delete from public.adhdice_task_history_facts history
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = history.user_id and target.task_id = history.entity_id
);

delete from public.adhdice_task_occurrences occurrence
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = occurrence.user_id and target.task_id = occurrence.entity_id
);

delete from public.adhdice_task_schedule_boundaries boundary
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = boundary.user_id and target.task_id = boundary.entity_id
);

delete from public.adhdice_task_command_operations command
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = command.user_id and target.task_id = command.entity_id
);

delete from public.adhdice_clean_tasks task
where exists (
  select 1 from pg_temp.adhdice_retired_pursuit_tasks target
  where target.user_id = task.user_id and target.task_id = task.id
);

-- Remove any remaining Task-engine policy rows that explicitly belonged to
-- the retired Task Type.  Goal policy rows remain available for legacy reads.
delete from public.adhdice_task_type_behavior_profiles
where task_type = 'pursuit';

delete from public.adhdice_task_behavior_selections
where task_type = 'pursuit';

-- The application and the consolidated schema now accept only Task, Goal
-- (legacy reads), and Custom.  Goal rows are intentionally retained.
alter table public.adhdice_clean_tasks
  drop constraint if exists adhdice_clean_tasks_task_type_check;
alter table public.adhdice_clean_tasks
  add constraint adhdice_clean_tasks_task_type_check
  check (task_type in ('task', 'goal', 'custom'));

alter table public.adhdice_task_type_behavior_profiles
  drop constraint if exists adhdice_task_type_behavior_profiles_task_type_check;
alter table public.adhdice_task_type_behavior_profiles
  add constraint adhdice_task_type_behavior_profiles_task_type_check
  check (task_type in ('task', 'goal', 'custom'));

alter table public.adhdice_task_behavior_selections
  drop constraint if exists adhdice_task_behavior_selections_task_type_check;
alter table public.adhdice_task_behavior_selections
  add constraint adhdice_task_behavior_selections_task_type_check
  check (task_type in ('task', 'goal', 'custom'));

drop table if exists public.adhdice_pursuit_activities;
drop table if exists public.adhdice_pursuits;

do $postconditions$
begin
  if exists (select 1 from public.adhdice_clean_tasks where task_type = 'pursuit') then
    raise exception 'Pursuit retirement left task_type=pursuit rows behind.';
  end if;
  if to_regclass('public.adhdice_pursuits') is not null
     or to_regclass('public.adhdice_pursuit_activities') is not null then
    raise exception 'Pursuit retirement left standalone persistence behind.';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';
commit;

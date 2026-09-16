-- ADHDice 7.13.61: fully retire the Goal Task Type.
-- SOURCE ONLY: inspect and apply separately; this migration is not run by Codex.
--
-- The sole remaining Goal Task is disposable authorized test data.  This is a
-- deliberately one-time, fail-closed cleanup: it deletes only the exact live
-- shape approved for this ticket and never maps, archives, or translates it.
-- Canonical Task State dependencies are removed in the proven 7.13.56 order.

begin;

do $preconditions$
begin
  if to_regclass('public.adhdice_clean_tasks') is null
     or to_regclass('public.adhdice_task_type_behavior_profiles') is null
     or to_regclass('public.adhdice_task_behavior_selections') is null
     or to_regclass('public.adhdice_task_occurrence_effective_overrides') is null
     or to_regclass('public.adhdice_task_calendar_overrides') is null
     or to_regclass('public.adhdice_task_reward_claim_consumptions') is null
     or to_regclass('public.adhdice_task_reward_grants') is null
     or to_regclass('public.adhdice_task_reward_entitlements') is null
     or to_regclass('public.adhdice_task_occurrences') is null
     or to_regclass('public.adhdice_task_schedule_boundaries') is null
     or to_regclass('public.adhdice_task_history_facts') is null
     or to_regclass('public.adhdice_task_command_operations') is null then
    raise exception '7.13.61 requires the current Task, policy, and canonical Task State tables.';
  end if;
end;
$preconditions$;

lock table
  public.adhdice_clean_tasks,
  public.adhdice_task_type_behavior_profiles,
  public.adhdice_task_behavior_selections,
  public.adhdice_task_occurrence_effective_overrides,
  public.adhdice_task_calendar_overrides,
  public.adhdice_task_reward_claim_consumptions,
  public.adhdice_task_reward_grants,
  public.adhdice_task_reward_entitlements,
  public.adhdice_task_occurrences,
  public.adhdice_task_schedule_boundaries,
  public.adhdice_task_history_facts,
  public.adhdice_task_command_operations
  in share row exclusive mode;

do $guard$
declare
  goal_count bigint;
  authorized_goal_count bigint;
begin
  select count(*) into goal_count
  from public.adhdice_clean_tasks
  where task_type = 'goal';

  if goal_count <> 1 then
    raise exception '7.13.61 expected exactly one Goal Task, found %; no Goal data was deleted.', goal_count;
  end if;

  select count(*) into authorized_goal_count
  from public.adhdice_clean_tasks
  where task_type = 'goal'
    and title = 'Test'
    and status = 'trashed';

  if authorized_goal_count <> 1 then
    raise exception '7.13.61 expected the sole Goal Task to be title Test and trashed; no Goal data was deleted.';
  end if;
end;
$guard$;

create temporary table adhdice_retired_goal_tasks (
  user_id uuid not null,
  task_id uuid not null,
  primary key (user_id, task_id)
) on commit drop;

insert into pg_temp.adhdice_retired_goal_tasks (user_id, task_id)
select user_id, id
from public.adhdice_clean_tasks
where task_type = 'goal'
  and title = 'Test'
  and status = 'trashed';

-- Preserve any non-Goal child as an ordinary Task by detaching it before the
-- target parent is deleted.  A Goal-typed child would have failed the exact
-- one-Goal guard above and therefore cannot be deleted by this migration.
update public.adhdice_clean_tasks child
set parent_task_id = null
where exists (
  select 1
  from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = child.user_id
    and target.task_id = child.parent_task_id
)
and not exists (
  select 1
  from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = child.user_id
    and target.task_id = child.id
);

-- Remove legacy and auxiliary Task-owned records where the table exists in the
-- deployed project version.  Every delete is keyed by Task identity.
do $legacy_dependencies$
begin
  if to_regclass('public.adhdice_task_events') is not null then
    execute 'delete from public.adhdice_task_events event using pg_temp.adhdice_retired_goal_tasks target where event.task_id = target.task_id and event.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_reward_claims') is not null then
    execute 'delete from public.adhdice_task_reward_claims claim using pg_temp.adhdice_retired_goal_tasks target where claim.task_id = target.task_id and claim.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_active_timers') is not null then
    execute 'delete from public.adhdice_task_active_timers timer using pg_temp.adhdice_retired_goal_tasks target where timer.task_id = target.task_id and timer.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_list_manual_memberships') is not null then
    execute 'delete from public.adhdice_task_list_manual_memberships membership using pg_temp.adhdice_retired_goal_tasks target where membership.task_id = target.task_id and membership.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_scratch_note_task_links') is not null then
    execute 'delete from public.adhdice_scratch_note_task_links link using pg_temp.adhdice_retired_goal_tasks target where link.task_id = target.task_id and link.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_custom_ruleset_assignments') is not null then
    execute 'delete from public.adhdice_task_custom_ruleset_assignments assignment using pg_temp.adhdice_retired_goal_tasks target where assignment.task_id = target.task_id and assignment.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_behavior_selections') is not null then
    execute 'delete from public.adhdice_task_behavior_selections selection using pg_temp.adhdice_retired_goal_tasks target where selection.task_id = target.task_id and selection.user_id = target.user_id';
  end if;
  if to_regclass('public.adhdice_task_history') is not null then
    execute 'delete from public.adhdice_task_history history using pg_temp.adhdice_retired_goal_tasks target where history.task_id = target.task_id and history.user_id = target.user_id';
  end if;
end;
$legacy_dependencies$;

-- Remove only retired Task IDs from shared Focus-day arrays.
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
            from pg_temp.adhdice_retired_goal_tasks target
            where target.user_id = focus.user_id
              and target.task_id = ids.task_id
          )
        ),
        '{}'::uuid[]
      )
      where exists (
        select 1
        from pg_temp.adhdice_retired_goal_tasks target
        where target.user_id = focus.user_id
          and target.task_id = any(focus.task_ids)
      )
    $sql$;
  end if;
end;
$focus_cleanup$;

-- Canonical Task State dependency order.  Clear only incoming workflow
-- pointers and delete disposable state rows without creating invalid shapes.
update public.adhdice_clean_tasks task
set workflow_occurrence_id = null,
    workflow_command_id = null
where exists (
  select 1 from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = task.user_id and target.task_id = task.id
);

delete from public.adhdice_task_occurrence_effective_overrides override
where exists (
  select 1 from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = override.user_id and target.task_id = override.entity_id
);

delete from public.adhdice_task_calendar_overrides override
where exists (
  select 1 from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = override.user_id and target.task_id = override.entity_id
);

delete from public.adhdice_task_reward_claim_consumptions consumption
where exists (
  select 1
  from public.adhdice_task_reward_grants grant_row
  join public.adhdice_task_reward_entitlements entitlement
    on entitlement.user_id = grant_row.user_id
   and entitlement.id = grant_row.entitlement_id
  join pg_temp.adhdice_retired_goal_tasks target
    on target.user_id = entitlement.user_id
   and target.task_id = entitlement.entity_id
  where grant_row.user_id = consumption.user_id
    and grant_row.id = consumption.grant_id
);

delete from public.adhdice_task_reward_grants grant_row
where exists (
  select 1
  from public.adhdice_task_reward_entitlements entitlement
  join pg_temp.adhdice_retired_goal_tasks target
    on target.user_id = entitlement.user_id
   and target.task_id = entitlement.entity_id
  where grant_row.user_id = entitlement.user_id
    and grant_row.entitlement_id = entitlement.id
);

delete from public.adhdice_task_reward_entitlements entitlement
where exists (
  select 1 from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = entitlement.user_id and target.task_id = entitlement.entity_id
);

-- Break only the occurrence -> history cycle.  The occurrence is disposable,
-- so its outgoing command reference does not need to be rewritten.
update public.adhdice_task_occurrences occurrence
set resolved_history_id = null
where exists (
  select 1 from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = occurrence.user_id and target.task_id = occurrence.entity_id
);

-- Remove the boundary -> occurrence incoming reference before deleting the
-- occurrence.  Prior-boundary and command references remain intact until the
-- disposable boundary row is deleted.
update public.adhdice_task_schedule_boundaries boundary
set affected_occurrence_id = null
where exists (
  select 1 from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = boundary.user_id and target.task_id = boundary.entity_id
);

delete from public.adhdice_task_history_facts history
where exists (
  select 1 from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = history.user_id and target.task_id = history.entity_id
);

delete from public.adhdice_task_occurrences occurrence
where exists (
  select 1 from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = occurrence.user_id and target.task_id = occurrence.entity_id
);

-- Schedule boundaries self-reference through prior_boundary_id.  Delete target
-- boundaries newest to oldest so each sequence child disappears first.
do $boundary_cleanup$
declare
  boundary_row record;
begin
  for boundary_row in
    select boundary.user_id, boundary.id
    from public.adhdice_task_schedule_boundaries boundary
    join pg_temp.adhdice_retired_goal_tasks target
      on target.user_id = boundary.user_id
     and target.task_id = boundary.entity_id
    order by boundary.user_id, boundary.entity_id, boundary.boundary_sequence desc
  loop
    delete from public.adhdice_task_schedule_boundaries boundary
    where boundary.user_id = boundary_row.user_id
      and boundary.id = boundary_row.id;
  end loop;
end;
$boundary_cleanup$;

delete from public.adhdice_task_command_operations command
where exists (
  select 1 from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = command.user_id and target.task_id = command.entity_id
);

delete from public.adhdice_clean_tasks task
where exists (
  select 1 from pg_temp.adhdice_retired_goal_tasks target
  where target.user_id = task.user_id and target.task_id = task.id
);

-- Remove any policy/selection rows that are structurally typed as Goal,
-- including any residue not linked to the deleted Task.
delete from public.adhdice_task_type_behavior_profiles
where task_type = 'goal';

delete from public.adhdice_task_behavior_selections
where task_type = 'goal';

-- The application and current schema now accept only Task and named Custom.
alter table public.adhdice_clean_tasks
  drop constraint if exists adhdice_clean_tasks_task_type_check,
  drop constraint if exists adhdice_clean_tasks_custom_ruleset_task_type_check;
alter table public.adhdice_clean_tasks
  add constraint adhdice_clean_tasks_task_type_check
    check (task_type in ('task', 'custom')),
  add constraint adhdice_clean_tasks_custom_ruleset_task_type_check
    check (
      (task_type = 'custom' and custom_ruleset_id is not null)
      or (task_type = 'task' and custom_ruleset_id is null)
    );

alter table public.adhdice_task_type_behavior_profiles
  drop constraint if exists adhdice_task_type_behavior_profiles_task_type_check;
alter table public.adhdice_task_type_behavior_profiles
  add constraint adhdice_task_type_behavior_profiles_task_type_check
    check (task_type in ('task', 'custom'));

alter table public.adhdice_task_behavior_selections
  drop constraint if exists adhdice_task_behavior_selections_task_type_check,
  drop constraint if exists adhdice_task_behavior_selections_custom_ruleset_task_type_check;
alter table public.adhdice_task_behavior_selections
  add constraint adhdice_task_behavior_selections_task_type_check
    check (task_type in ('task', 'custom')),
  add constraint adhdice_task_behavior_selections_custom_ruleset_task_type_check
    check (
      (task_type = 'custom' and custom_ruleset_id is not null)
      or (task_type = 'task' and custom_ruleset_id is null)
    );

create or replace function public.adhdice_validate_task_behavior_selection()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if not exists (
    select 1 from public.adhdice_clean_tasks task
    where task.user_id = new.user_id and task.id = new.task_id
  ) then
    raise exception 'Behavior selection Task does not belong to the selection owner.' using errcode = '23503';
  end if;
  if new.task_type not in ('task', 'custom') then
    raise exception 'Behavior selection TaskType is invalid.' using errcode = '23514';
  end if;
  if new.custom_ruleset_id is not null and new.task_type <> 'custom' then
    raise exception 'Only Custom behavior selections may consume a named Custom ruleset.' using errcode = '23514';
  end if;
  if new.task_type = 'custom' and new.custom_ruleset_id is null then
    raise exception 'Custom behavior selections require a named Custom Task Type.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

do $postconditions$
begin
  if exists (select 1 from public.adhdice_clean_tasks where task_type = 'goal') then
    raise exception '7.13.61 left task_type=goal Task rows behind.';
  end if;
  if exists (select 1 from public.adhdice_task_type_behavior_profiles where task_type = 'goal') then
    raise exception '7.13.61 left task_type=goal behavior profile rows behind.';
  end if;
  if exists (select 1 from public.adhdice_task_behavior_selections where task_type = 'goal') then
    raise exception '7.13.61 left task_type=goal behavior selection rows behind.';
  end if;
  if exists (
    select 1 from public.adhdice_clean_tasks
    where (task_type = 'custom' and custom_ruleset_id is null)
       or (task_type = 'task' and custom_ruleset_id is not null)
  ) then
    raise exception '7.13.61 left an invalid Task/custom-ruleset assignment behind.';
  end if;
  if exists (
    select 1 from public.adhdice_task_behavior_selections
    where (task_type = 'custom' and custom_ruleset_id is null)
       or (task_type = 'task' and custom_ruleset_id is not null)
  ) then
    raise exception '7.13.61 left an invalid behavior selection/custom-ruleset assignment behind.';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';
commit;

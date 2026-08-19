-- ADHDice 7.9.50 one-time operator reset.
--
-- Review this file and replace the sentinel TARGET_USER_ID below with exactly
-- one approved auth user UUID before execution.  The sentinel deliberately
-- fails closed.  This file is not application startup code and must not be
-- installed as a user-facing reset feature.
--
-- The reset is transactional and user-scoped.  It contains no live UUID,
-- broad table reset, or implicit dependency action.  Run only after the DDL
-- artifact and the operator's pre-reset audit have been reviewed.

begin;

create temporary table _adhdice_fresh_start_target (
  user_id uuid primary key,
  reset_at timestamptz not null default clock_timestamp()
) on commit drop;

-- REQUIRED OPERATOR EDIT: replace this sentinel with TARGET_USER_ID.
insert into _adhdice_fresh_start_target (user_id)
values ('00000000-0000-0000-0000-000000000000'::uuid);

do $guard$
declare
  v_target_user_id uuid;
begin
  select user_id into v_target_user_id from _adhdice_fresh_start_target;
  if v_target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'TARGET_USER_ID sentinel was not replaced.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.adhdice_user_profiles profile
    where profile.user_id = v_target_user_id
    for update
  ) then
    raise exception 'TARGET_USER_ID has no profile; no reset was performed.' using errcode = '22023';
  end if;
end;
$guard$;

select pg_advisory_xact_lock(
  hashtextextended('adhdice:fresh-start:' || user_id::text, 0)
)
from _adhdice_fresh_start_target;

-- Clear references while the old Task IDs still exist.  Note bodies, titles,
-- tags, and Scratch Note rows remain.
update public.adhdice_notes
set linked_task_ids = array[]::text[], updated_at = clock_timestamp()
where user_id = (select user_id from _adhdice_fresh_start_target);

delete from public.adhdice_scratch_note_task_links
where user_id = (select user_id from _adhdice_fresh_start_target);

delete from public.adhdice_task_list_manual_memberships
where user_id = (select user_id from _adhdice_fresh_start_target);

-- Reset Task-dependent feature state without removing its tables.
update public.adhdice_home_todo_state
set state = '{"schemaVersion":1,"taskIds":[],"clientUpdatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb,
    client_updated_at = '1970-01-01T00:00:00Z'::timestamptz,
    updated_at = clock_timestamp()
where user_id = (select user_id from _adhdice_fresh_start_target);

update public.adhdice_on_time_plans
set plan_state = '{"schemaVersion":1,"destinationLabel":"","arriveAt":null,"timezone":"UTC","travelMinutes":null,"arrivalBufferMinutes":0,"items":[],"clientUpdatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb,
    client_updated_at = '1970-01-01T00:00:00Z'::timestamptz,
    updated_at = clock_timestamp()
where user_id = (select user_id from _adhdice_fresh_start_target);

-- Remove Task-linked milestones before their RESTRICT event relationship is
-- encountered, then remove all milestone metadata for this owner.
delete from public.adhdice_milestone_reminders
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_milestone_events
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_milestones
where user_id = (select user_id from _adhdice_fresh_start_target);

-- Achievement history starts at a new activation epoch.  Delete dependent
-- award/notification rows before occurrence evidence, preserving the profile
-- catalog/rules/timezone/logical-day fields.
delete from public.adhdice_achievement_notifications
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_achievement_tier_awards
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_achievement_collection_awards
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_achievement_occurrence_matches
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_achievement_progress
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_achievement_evaluation_runs
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_achievement_occurrences
where user_id = (select user_id from _adhdice_fresh_start_target);

update public.adhdice_achievement_profiles profile
set activation_operation_id = gen_random_uuid(),
    activated_at = (select reset_at from _adhdice_fresh_start_target),
    updated_at = clock_timestamp()
where profile.user_id = (select user_id from _adhdice_fresh_start_target);

-- Clear Records staging/reconciliation state before the derived rows.
delete from public.adhdice_record_reconcile_chunks
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_record_current_stage
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_record_event_stage
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_record_reconcile_runs
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_record_current
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_record_events
where user_id = (select user_id from _adhdice_fresh_start_target);

-- Remove both current canonical reward history and the still-supported legacy
-- Task reward claim path.  The tables/functions remain for new data.
delete from public.adhdice_task_reward_claim_consumptions
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_task_reward_grants
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_task_reward_entitlements
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_task_reward_claims
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_task_reward_rolls
where user_id = (select user_id from _adhdice_fresh_start_target);

delete from public.adhdice_pending_reward_dice_items
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_pending_reward_dice_operations
where user_id = (select user_id from _adhdice_fresh_start_target);
update public.adhdice_pending_reward_dice
set pending_dice = 0,
    revision = 0,
    updated_at = clock_timestamp()
where user_id = (select user_id from _adhdice_fresh_start_target);

delete from public.adhdice_roll_history
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_roll_daily_boards
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_roll_prize_basket
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_roll_reward_pool_prizes
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_vault_prizes
where user_id = (select user_id from _adhdice_fresh_start_target);

-- Task-derived economy evidence is historical data and is not preserved.
delete from public.adhdice_task_events
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_point_ledger
where user_id = (select user_id from _adhdice_fresh_start_target);
update public.adhdice_user_profiles
set level = 1,
    xp = 0,
    points = 0,
    tokens = 0,
    free_roll_bank = 0,
    updated_at = clock_timestamp()
where user_id = (select user_id from _adhdice_fresh_start_target);

-- Remove direct Task references and old Task/subtask rows before canonical
-- Task State rows.  Nulling self-references avoids relying on schema actions.
delete from public.adhdice_task_active_timers
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_task_focus_days
where user_id = (select user_id from _adhdice_fresh_start_target);

-- Canonical Task State has deliberate RESTRICT relationships, including two
-- cross-links between History and occurrences.  Break only those old-user
-- links, then delete from the leaves toward clean_tasks.
update public.adhdice_task_occurrences
set resolved_history_id = null
where user_id = (select user_id from _adhdice_fresh_start_target);
update public.adhdice_task_history_facts
set occurrence_id = null,
    schedule_boundary_id = null,
    command_id = null
where user_id = (select user_id from _adhdice_fresh_start_target);
update public.adhdice_task_occurrence_effective_overrides
set history_id = null,
    prior_override_id = null,
    prior_override_sequence = null,
    command_id = null
where user_id = (select user_id from _adhdice_fresh_start_target);
update public.adhdice_task_schedule_boundaries
set affected_occurrence_id = null,
    prior_boundary_id = null,
    command_id = null
where user_id = (select user_id from _adhdice_fresh_start_target);
update public.adhdice_task_calendar_overrides
set cleared_by_command_id = null,
    command_id = null
where user_id = (select user_id from _adhdice_fresh_start_target);

delete from public.adhdice_task_occurrence_effective_overrides
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_task_history_facts
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_task_occurrences
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_task_schedule_boundaries
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_task_calendar_overrides
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_task_command_operations
where user_id = (select user_id from _adhdice_fresh_start_target);

update public.adhdice_clean_tasks
set parent_task_id = null,
    workflow_occurrence_id = null,
    workflow_command_id = null
where user_id = (select user_id from _adhdice_fresh_start_target);
delete from public.adhdice_clean_tasks
where user_id = (select user_id from _adhdice_fresh_start_target);

-- Optional pre-7.9.49 rollover ledger: clear it only if that old object is
-- present, and still bind the dynamic statement to the one target user.
do $optional_ledger$
declare
  v_target_user_id uuid := (select user_id from _adhdice_fresh_start_target);
begin
  if to_regclass('public.adhdice_task_rollover_ledger') is not null then
    execute 'delete from public.adhdice_task_rollover_ledger where user_id = $1'
      using v_target_user_id;
  end if;
end;
$optional_ledger$;

-- Postconditions: no reset-domain rows or Task references remain for the
-- target.  Preserved Focus/Health/list architecture is never written above.
do $postconditions$
declare
  v_target_user_id uuid := (select user_id from _adhdice_fresh_start_target);
  v_remaining bigint;
begin
  select count(*) into v_remaining from public.adhdice_clean_tasks where user_id = v_target_user_id;
  if v_remaining <> 0 then raise exception 'Fresh-start postcondition failed: Tasks remain.'; end if;
  select count(*) into v_remaining from public.adhdice_task_history_facts where user_id = v_target_user_id;
  if v_remaining <> 0 then raise exception 'Fresh-start postcondition failed: canonical History remains.'; end if;
  select count(*) into v_remaining from public.adhdice_task_command_operations where user_id = v_target_user_id;
  if v_remaining <> 0 then raise exception 'Fresh-start postcondition failed: command operations remain.'; end if;
  select count(*) into v_remaining from public.adhdice_achievement_occurrences where user_id = v_target_user_id;
  if v_remaining <> 0 then raise exception 'Fresh-start postcondition failed: Achievement occurrences remain.'; end if;
  select count(*) into v_remaining from public.adhdice_record_current where user_id = v_target_user_id;
  if v_remaining <> 0 then raise exception 'Fresh-start postcondition failed: current Records remain.'; end if;
  select count(*) into v_remaining from public.adhdice_point_ledger where user_id = v_target_user_id;
  if v_remaining <> 0 then raise exception 'Fresh-start postcondition failed: point ledger remains.'; end if;
  select pending_dice into v_remaining from public.adhdice_pending_reward_dice where user_id = v_target_user_id;
  if found and v_remaining <> 0 then raise exception 'Fresh-start postcondition failed: pending dice remain.'; end if;
end;
$postconditions$;

commit;

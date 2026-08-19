-- 7.9.50: retire approved dead tables and completed migration plumbing.
-- Review and apply this migration explicitly. It is intentionally not run here.
begin;

-- Replace the current claim function before removing its obsolete dependency.
create or replace function public.adhdice_claim_pending_reward_dice(p_operation_id uuid)
returns table (pending_dice integer, revision bigint, updated_at timestamptz, result_payload jsonb, was_replayed boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account public.adhdice_pending_reward_dice%rowtype;
  v_existing public.adhdice_pending_reward_dice_operations%rowtype;
  v_profile public.adhdice_user_profiles%rowtype;
  v_item public.adhdice_pending_reward_dice_items%rowtype;
  v_reward jsonb;
  v_resolutions jsonb := '[]'::jsonb;
  v_base_rolls jsonb;
  v_roll integer;
  v_base_points integer;
  v_multiplier integer;
  v_final_points integer;
  v_awarded_xp integer;
  v_awarded_tokens integer;
  v_total_points integer := 0;
  v_total_xp integer := 0;
  v_total_tokens integer := 0;
  v_task_count integer;
  v_roll_id uuid;
  v_claim jsonb;
  v_reason text;
  v_index integer;
  v_new_level integer := 1;
  v_threshold integer := 100;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if p_operation_id is null then raise exception using errcode = '22023', message = 'A claim operation ID is required.'; end if;
  insert into public.adhdice_pending_reward_dice (user_id) values (v_user_id) on conflict (user_id) do nothing;
  select account.* into v_account from public.adhdice_pending_reward_dice account where account.user_id = v_user_id for update;
  select operation.* into v_existing from public.adhdice_pending_reward_dice_operations operation where operation.user_id = v_user_id and operation.operation_id = p_operation_id::text;
  if found then
    if v_existing.operation_type <> 'claim' then raise exception using errcode = '22023', message = 'The operation ID was already used for another operation type.'; end if;
    return query select (v_existing.result_payload ->> 'pendingDice')::integer, (v_existing.result_payload ->> 'revision')::bigint, (v_existing.result_payload ->> 'updatedAt')::timestamptz, v_existing.result_payload, true;
    return;
  end if;
  if v_account.pending_dice <= 0 then raise exception using errcode = 'P0001', message = 'There are no pending reward dice to claim.'; end if;
  if coalesce((select sum(item.dice_count) from public.adhdice_pending_reward_dice_items item where item.user_id = v_user_id and item.claimed_operation_id is null), 0) <> v_account.pending_dice then raise exception using errcode = 'P0001', message = 'Pending reward inventory is inconsistent; no dice were consumed.'; end if;
  select profile.* into v_profile from public.adhdice_user_profiles profile where profile.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'User profile is unavailable.'; end if;
  for v_item in select item.* from public.adhdice_pending_reward_dice_items item where item.user_id = v_user_id and item.claimed_operation_id is null order by item.created_at, item.id loop
    v_reward := v_item.reward_payload || jsonb_build_object('diceCount', v_item.dice_count);
    v_base_rolls := '[]'::jsonb;
    v_base_points := 0;
    for v_index in 1..v_item.dice_count loop
      v_roll := floor(random() * 6)::integer + 1;
      v_base_rolls := v_base_rolls || jsonb_build_array(v_roll);
      v_base_points := v_base_points + v_roll;
    end loop;
    v_multiplier := floor(random() * 6)::integer + 1;
    v_final_points := v_base_points * v_multiplier;
    v_awarded_xp := ceil(v_final_points / 2.0)::integer;
    v_task_count := greatest(coalesce(jsonb_array_length(v_reward -> 'tasks'), 0), 1);
    v_awarded_tokens := case when v_reward ->> 'kind' = 'legacy_fallback' then 0 else v_task_count end;
    v_reason := case when v_reward ->> 'mode' = 'batch' then 'Batch reward roll for ' || v_task_count || ' tasks' else 'Task reward roll: ' || coalesce(v_reward #>> '{claimRefs,0,title}', v_reward #>> '{tasks,0,title}', 'Completed task') end;
    insert into public.adhdice_task_reward_rolls (user_id, reward_date, mode, streak_tier_label, streak_length, eligible_task_count, base_rolls, base_points, multiplier_roll, final_points, awarded_xp, awarded_tokens)
    values (v_user_id, coalesce((v_reward ->> 'rewardDate')::date, current_date), case when v_reward ->> 'mode' = 'batch' then 'batch' else 'single' end, v_reward #>> '{tier,label}', greatest(coalesce((v_reward ->> 'streakLength')::integer, 0), 0), v_task_count, v_base_rolls, v_base_points, v_multiplier, v_final_points, v_awarded_xp, v_awarded_tokens) returning id into v_roll_id;
    if v_reward ->> 'kind' is distinct from 'legacy_fallback' then
      for v_claim in select value from jsonb_array_elements(v_reward -> 'claimRefs') loop
        -- Deleting the source Task must not invalidate earned pending dice.
        if exists (select 1 from public.adhdice_clean_tasks task where task.id = (v_claim ->> 'taskId')::uuid and task.user_id = v_user_id) then
          insert into public.adhdice_task_reward_claims (user_id, task_id, reward_roll_id, reward_date, awarded_token)
          values (v_user_id, (v_claim ->> 'taskId')::uuid, v_roll_id, coalesce((v_reward ->> 'rewardDate')::date, current_date), true);
        end if;
      end loop;
    end if;
    v_total_points := v_total_points + v_final_points;
    v_total_xp := v_total_xp + v_awarded_xp;
    v_total_tokens := v_total_tokens + v_awarded_tokens;
    insert into public.adhdice_point_ledger (user_id, delta, reason, balance_after, source, ref_id) values (v_user_id, v_final_points, v_reason, v_profile.points + v_total_points, 'task', p_operation_id);
    update public.adhdice_pending_reward_dice_items item set claimed_operation_id = p_operation_id::text where item.id = v_item.id;
    v_resolutions := v_resolutions || jsonb_build_array(v_reward || jsonb_build_object('awardedTokens', v_awarded_tokens, 'basePoints', v_base_points, 'baseRolls', v_base_rolls, 'finalPoints', v_final_points, 'multiplierRoll', v_multiplier, 'xp', v_awarded_xp));
  end loop;
  while v_profile.xp + v_total_xp >= v_threshold loop
    v_new_level := v_new_level + 1;
    v_threshold := 100 + ((v_new_level - 1) * 200);
  end loop;
  update public.adhdice_user_profiles profile set points = profile.points + v_total_points, xp = profile.xp + v_total_xp, level = v_new_level, tokens = profile.tokens + v_total_tokens where profile.user_id = v_user_id returning profile.* into v_profile;
  update public.adhdice_pending_reward_dice account set pending_dice = 0, revision = account.revision + 1, updated_at = now() where account.user_id = v_user_id returning account.* into v_account;
  v_result := jsonb_build_object('resolutions', v_resolutions, 'pendingDice', v_account.pending_dice, 'revision', v_account.revision, 'updatedAt', v_account.updated_at, 'economy', jsonb_build_object('points', v_profile.points, 'xp', v_profile.xp, 'level', v_profile.level, 'tokens', v_profile.tokens));
  insert into public.adhdice_pending_reward_dice_operations (user_id, operation_id, operation_type, request_payload, result_payload) values (v_user_id, p_operation_id::text, 'claim', jsonb_build_object('claimedDice', v_account.pending_dice + coalesce((select sum(item.dice_count) from public.adhdice_pending_reward_dice_items item where item.user_id = v_user_id and item.claimed_operation_id = p_operation_id::text), 0)), v_result);
  return query select v_account.pending_dice, v_account.revision, v_account.updated_at, v_result, false;
end;
$$;

drop function if exists public.adhdice_award_pending_reward_dice(text, uuid, uuid, date, integer, jsonb);
drop function if exists public.adhdice_migrate_pending_reward_dice(text, integer, jsonb);
drop function if exists public.adhdice_migrate_focus_counters(uuid, uuid, jsonb);

alter table public.adhdice_task_reward_claims drop constraint if exists adhdice_task_reward_claims_subtask_id_fkey;
delete from public.adhdice_task_reward_claims where subtask_id is not null;
drop index if exists public.adhdice_task_reward_claims_task_day_unique;
drop index if exists public.adhdice_task_reward_claims_subtask_day_unique;
drop index if exists public.adhdice_task_reward_claims_subtask_idx;
alter table public.adhdice_task_reward_claims drop column if exists subtask_id;
create unique index if not exists adhdice_task_reward_claims_task_day_unique
  on public.adhdice_task_reward_claims (user_id, task_id, reward_date);

drop policy if exists "Users can create their own legacy subtask promotions" on public.adhdice_legacy_subtask_promotions;
drop policy if exists "Users can read their own legacy subtask promotions" on public.adhdice_legacy_subtask_promotions;
drop trigger if exists adhdice_legacy_subtask_promotions_set_updated_at on public.adhdice_legacy_subtask_promotions;
alter table public.adhdice_legacy_subtask_promotions drop constraint if exists adhdice_legacy_subtask_promotions_legacy_subtask_id_fkey;
alter table public.adhdice_legacy_subtask_promotions drop constraint if exists adhdice_legacy_subtask_promotions_task_id_fkey;
alter table public.adhdice_legacy_subtask_promotions drop constraint if exists adhdice_legacy_subtask_promotions_user_id_fkey;

drop policy if exists "Users can create their own task subtasks" on public.adhdice_task_subtasks;
drop policy if exists "Users can delete their own task subtasks" on public.adhdice_task_subtasks;
drop policy if exists "Users can read their own task subtasks" on public.adhdice_task_subtasks;
drop policy if exists "Users can update their own task subtasks" on public.adhdice_task_subtasks;
drop trigger if exists adhdice_task_subtasks_set_updated_at on public.adhdice_task_subtasks;
alter table public.adhdice_task_subtasks drop constraint if exists adhdice_task_subtasks_parent_subtask_id_fkey;
alter table public.adhdice_task_subtasks drop constraint if exists adhdice_task_subtasks_task_id_fkey;
alter table public.adhdice_task_subtasks drop constraint if exists adhdice_task_subtasks_user_id_fkey;

drop policy if exists "Users can read their own Focus counter migrations" on public.adhdice_focus_counter_migrations;
alter table public.adhdice_focus_counter_migrations drop constraint if exists adhdice_focus_counter_migrations_user_id_fkey;

drop policy if exists "Users can read their own achievement unlocks" on public.adhdice_achievement_unlocks;
drop policy if exists "Users can append their own achievement unlocks" on public.adhdice_achievement_unlocks;
alter table public.adhdice_achievement_unlocks drop constraint if exists adhdice_achievement_unlocks_user_id_fkey;

drop policy if exists "Authenticated users read roll master prizes" on public.adhdice_roll_master_prizes;

drop policy if exists "Users manage own roll board assignments" on public.adhdice_roll_board_assignments;
alter table public.adhdice_roll_board_assignments drop constraint if exists adhdice_roll_board_assignments_user_id_fkey;

drop table if exists public.adhdice_legacy_subtask_promotions;
drop table if exists public.adhdice_task_subtasks;
drop table if exists public.adhdice_focus_counter_migrations;
drop table if exists public.adhdice_achievement_unlocks;
drop table if exists public.adhdice_roll_board_assignments;
drop table if exists public.adhdice_roll_master_prizes;

revoke all on function public.adhdice_claim_pending_reward_dice(uuid) from public, anon;
grant execute on function public.adhdice_claim_pending_reward_dice(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

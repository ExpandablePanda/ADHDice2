-- 7.7.35: trusted fulfillment bridge for canonical reward entitlements.
-- Review this file before installation. It is intentionally authored only;
-- do not execute or deploy it as part of the source correction.

-- The 7.7.34 overload accepted browser-derived reward authority. Remove it
-- before installing the minimal entitlement-only contract below.
revoke all on function public.adhdice_fulfill_canonical_reward_entitlement(uuid, integer, jsonb) from public, anon, authenticated;
drop function if exists public.adhdice_fulfill_canonical_reward_entitlement(uuid, integer, jsonb);

create or replace function public.adhdice_fulfill_canonical_reward_entitlement(
  p_entitlement_id uuid
)
returns table (
  pending_dice integer,
  revision bigint,
  updated_at timestamptz,
  result_payload jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entitlement public.adhdice_task_reward_entitlements%rowtype;
  v_task public.adhdice_clean_tasks%rowtype;
  v_fact public.adhdice_task_history_facts%rowtype;
  v_grant public.adhdice_task_reward_grants%rowtype;
  v_account public.adhdice_pending_reward_dice%rowtype;
  v_existing public.adhdice_pending_reward_dice_operations%rowtype;
  v_streak_fact record;
  v_streak integer := 0;
  v_dice_count integer;
  v_operation_id text := 'canonical-entitlement:' || p_entitlement_id::text;
  v_tier jsonb;
  v_payload jsonb;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_entitlement_id is null then
    raise exception using errcode = '22023', message = 'A canonical reward entitlement ID is required.';
  end if;

  -- The owned entitlement is the serialization and idempotence boundary.
  -- Lock it before inspecting the operation so concurrent first fulfillment
  -- requests cannot both pass the replay check.
  select entitlement.* into v_entitlement
  from public.adhdice_task_reward_entitlements entitlement
  where entitlement.id = p_entitlement_id
    and entitlement.user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'The canonical reward entitlement is not owned by the authenticated user.';
  end if;
  if v_entitlement.state = 'blocked' then
    raise exception using errcode = '55000', message = 'The canonical reward entitlement is blocked and cannot be fulfilled.';
  end if;

  -- Only a canonical operation with the same entitlement marker may replay.
  -- This prevents a browser-supplied legacy award operation from occupying
  -- the deterministic canonical identity and becoming trusted here.
  select operation.* into v_existing
  from public.adhdice_pending_reward_dice_operations operation
  where operation.user_id = v_user_id
    and operation.operation_id = v_operation_id
  for update;
  if found then
    if v_existing.operation_type <> 'award'
      or v_existing.request_payload ->> 'canonicalEntitlementId' is distinct from p_entitlement_id::text then
      raise exception using errcode = '55000', message = 'The canonical entitlement operation identity is already occupied by another reward operation.';
    end if;
    return query select
      (v_existing.result_payload ->> 'pendingDice')::integer,
      (v_existing.result_payload ->> 'revision')::bigint,
      (v_existing.result_payload ->> 'updatedAt')::timestamptz,
      v_existing.result_payload,
      true;
    return;
  end if;

  if v_entitlement.state = 'fulfilled' then
    raise exception using errcode = '55000', message = 'The canonical reward entitlement is fulfilled but its replay result is unavailable.';
  end if;
  if v_entitlement.state <> 'pending' then
    raise exception using errcode = '22023', message = 'The canonical reward entitlement is not valid for fulfillment.';
  end if;

  -- Exact provenance is required. The entitlement's referenced fact, not any
  -- other successful fact for the Task, is the eligibility authority.
  select fact.* into v_fact
  from public.adhdice_task_history_facts fact
  where fact.user_id = v_user_id
    and fact.id = v_entitlement.canonical_history_id
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'The canonical reward entitlement references no owned canonical History fact.';
  end if;
  if v_fact.entity_id is distinct from v_entitlement.entity_id
    or v_fact.entity_kind is distinct from v_entitlement.entity_kind
    or v_fact.logical_date is distinct from v_entitlement.logical_date
    or v_fact.outcome is distinct from v_entitlement.outcome_snapshot then
    raise exception using errcode = '55000', message = 'The canonical reward entitlement provenance does not match its exact History fact.';
  end if;
  if v_fact.outcome not in ('done', 'did_my_best', 'complete') then
    raise exception using errcode = '22023', message = 'Only successful canonical outcomes can fulfill a reward entitlement.';
  end if;

  select task.* into v_task
  from public.adhdice_clean_tasks task
  where task.id = v_entitlement.entity_id
    and task.user_id = v_user_id
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'The canonical reward Task is not owned by the authenticated user.';
  end if;

  -- Streaks count successful logged occurrences, in canonical History order.
  -- Calendar-date adjacency is deliberately not required: scheduled weekly
  -- and monthly occurrences may be separated by ordinary calendar days.
  -- Any explicit non-successful fact, including Missed, breaks the streak.
  -- A one-time Task is limited to one successful occurrence by definition.
  if v_task.repeat_frequency = 'none' then
    v_streak := 1;
  else
    for v_streak_fact in
      select fact.outcome
      from public.adhdice_task_history_facts fact
      where fact.user_id = v_user_id
        and fact.entity_id = v_entitlement.entity_id
        and fact.logical_date <= v_entitlement.logical_date
      order by fact.logical_date desc, fact.updated_at desc, fact.id desc
    loop
      exit when v_streak_fact.outcome not in ('done', 'did_my_best', 'complete');
      v_streak := v_streak + 1;
    end loop;
  end if;
  if v_streak < 1 then
    raise exception using errcode = '22023', message = 'The canonical entitlement has no successful canonical History streak.';
  end if;

  v_dice_count := case
    when v_streak <= 1 then 1
    when v_streak = 2 then 2
    when v_streak <= 6 then 3
    when v_streak <= 13 then 4
    when v_streak <= 29 then 5
    else 6
  end;
  v_tier := case
    when v_streak <= 1 then jsonb_build_object('id', 'on_time', 'label', 'On-Time', 'minStreak', 0, 'maxStreak', 1, 'diceCount', 1)
    when v_streak = 2 then jsonb_build_object('id', 'two_day', 'label', '2 Day Streak', 'minStreak', 2, 'maxStreak', 2, 'diceCount', 2)
    when v_streak <= 6 then jsonb_build_object('id', 'three_to_six_day', 'label', '3-6 Day Streak', 'minStreak', 3, 'maxStreak', 6, 'diceCount', 3)
    when v_streak <= 13 then jsonb_build_object('id', 'seven_day', 'label', '7 Day Streak', 'minStreak', 7, 'maxStreak', 13, 'diceCount', 4)
    when v_streak <= 29 then jsonb_build_object('id', 'fourteen_day', 'label', '14 Day Streak', 'minStreak', 14, 'maxStreak', 29, 'diceCount', 5)
    else jsonb_build_object('id', 'thirty_plus_day', 'label', '30+ Day Streak', 'minStreak', 30, 'maxStreak', null, 'diceCount', 6)
  end;

  -- The pending-reward payload is entirely server-built and contains exactly
  -- one entitlement, one claim reference, and one Task. The claim RPC can
  -- therefore derive one token-generating Task and the server dice count.
  v_payload := jsonb_build_object(
    'canonicalEntitlementId', p_entitlement_id,
    'claimRefs', jsonb_build_array(jsonb_build_object(
      'subtaskId', null,
      'taskId', v_task.id,
      'title', v_task.title
    )),
    'createdAt', now(),
    'diceCount', v_dice_count,
    'mode', 'single',
    'rewardDate', v_entitlement.logical_date,
    'streakLength', v_streak,
    'tasks', jsonb_build_array(jsonb_build_object(
      'id', v_task.id,
      'title', v_task.title
    )),
    'tier', v_tier
  );

  insert into public.adhdice_pending_reward_dice (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;
  select account.* into v_account
  from public.adhdice_pending_reward_dice account
  where account.user_id = v_user_id
  for update;

  select grant_row.* into v_grant
  from public.adhdice_task_reward_grants grant_row
  where grant_row.user_id = v_user_id
    and grant_row.entitlement_id = p_entitlement_id
    and grant_row.grant_kind = 'banked_roll'
  for update;
  if found then
    raise exception using errcode = '55000', message = 'The canonical reward grant exists but its replay result is unavailable.';
  end if;

  insert into public.adhdice_task_reward_grants (
    user_id, entitlement_id, grant_operation_identity, grant_kind, units, grant_payload, state, applied_at
  ) values (
    v_user_id, p_entitlement_id, v_operation_id, 'banked_roll', v_dice_count, v_payload, 'applied', now()
  ) returning * into v_grant;

  insert into public.adhdice_pending_reward_dice_items (
    user_id, source_operation_id, source_item_index, dice_count, reward_payload
  ) values (
    v_user_id, v_operation_id, 0, v_dice_count, v_payload
  );
  update public.adhdice_pending_reward_dice account
  set pending_dice = account.pending_dice + v_dice_count,
      revision = account.revision + 1,
      updated_at = now()
  where account.user_id = v_user_id
  returning account.* into v_account;

  update public.adhdice_task_reward_entitlements entitlement
  set state = 'fulfilled',
      fulfilled_at = coalesce(entitlement.fulfilled_at, now()),
      updated_at = now()
  where entitlement.user_id = v_user_id
    and entitlement.id = p_entitlement_id;

  v_result := jsonb_build_object(
    'awardedDice', v_dice_count,
    'canonicalEntitlementId', p_entitlement_id,
    'pendingDice', v_account.pending_dice,
    'revision', v_account.revision,
    'updatedAt', v_account.updated_at
  );
  insert into public.adhdice_pending_reward_dice_operations (
    user_id, operation_id, operation_type, request_payload, result_payload
  ) values (
    v_user_id,
    v_operation_id,
    'award',
    jsonb_build_object('canonicalEntitlementId', p_entitlement_id, 'source', 'canonical_reward_entitlement'),
    v_result
  );

  return query select v_account.pending_dice, v_account.revision, v_account.updated_at, v_result, false;
end;
$$;

revoke all on function public.adhdice_fulfill_canonical_reward_entitlement(uuid) from public, anon;
grant execute on function public.adhdice_fulfill_canonical_reward_entitlement(uuid) to authenticated;

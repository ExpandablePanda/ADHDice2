-- 7.7.36: trusted fulfillment bridge for canonical reward entitlements.
-- Review this file before installation. It is intentionally authored only;
-- do not execute or deploy it as part of the source correction.

-- The 7.7.34 overload accepted browser-derived reward authority. Remove it
-- before installing the minimal entitlement-only contract below.
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
  v_grant public.adhdice_task_reward_grants%rowtype;
  v_account public.adhdice_pending_reward_dice%rowtype;
  v_existing public.adhdice_pending_reward_dice_operations%rowtype;
  v_dice_count integer;
  v_operation_id text := 'canonical-entitlement:' || p_entitlement_id::text;
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

  -- Fulfillment trusts only the immutable entitlement snapshot. History may
  -- have been replaced or cleared since the reward was earned.
  if v_entitlement.outcome_snapshot not in ('done', 'did_my_best', 'complete') then
    raise exception using errcode = '22023', message = 'Only successful original outcomes can fulfill a reward entitlement.';
  end if;
  if v_entitlement.reward_units_snapshot is null or v_entitlement.reward_units_snapshot <= 0 then
    raise exception using errcode = '22023', message = 'The canonical reward entitlement has no valid positive reward snapshot.';
  end if;

  select task.* into v_task
  from public.adhdice_clean_tasks task
  where task.id = v_entitlement.entity_id
    and task.user_id = v_user_id
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'The canonical reward Task is not owned by the authenticated user.';
  end if;

  v_dice_count := v_entitlement.reward_units_snapshot;

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
    'tasks', jsonb_build_array(jsonb_build_object(
      'id', v_task.id,
      'title', v_task.title
    )),
    'tier', null
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

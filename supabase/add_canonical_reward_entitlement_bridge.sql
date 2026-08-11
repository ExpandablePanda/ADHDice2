-- 7.7.34: trusted fulfillment bridge for canonical reward entitlements.
-- Review this file before installation. It is intentionally authored only;
-- ChatGPT must not execute or deploy it as part of the 7.7.34 client change.

create or replace function public.adhdice_fulfill_canonical_reward_entitlement(
  p_entitlement_id uuid,
  p_streak_length integer,
  p_reward_payload jsonb
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
  v_grant public.adhdice_task_reward_grants%rowtype;
  v_account public.adhdice_pending_reward_dice%rowtype;
  v_existing public.adhdice_pending_reward_dice_operations%rowtype;
  v_fact record;
  v_cursor date;
  v_streak integer := 0;
  v_dice_count integer;
  v_operation_id text := 'canonical-entitlement:' || p_entitlement_id::text;
  v_payload jsonb;
  v_result jsonb;
  v_inserted boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_entitlement_id is null or p_streak_length is null or p_streak_length < 0
    or p_reward_payload is null or jsonb_typeof(p_reward_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'The canonical reward fulfillment payload is invalid.';
  end if;

  select operation.* into v_existing
  from public.adhdice_pending_reward_dice_operations operation
  where operation.user_id = v_user_id and operation.operation_id = v_operation_id
  for update;
  if found then
    if v_existing.operation_type <> 'award' then
      raise exception using errcode = '22023', message = 'The canonical entitlement operation ID was already used for another operation type.';
    end if;
    return query select
      (v_existing.result_payload ->> 'pendingDice')::integer,
      (v_existing.result_payload ->> 'revision')::bigint,
      (v_existing.result_payload ->> 'updatedAt')::timestamptz,
      v_existing.result_payload,
      true;
    return;
  end if;

  select entitlement.* into v_entitlement
  from public.adhdice_task_reward_entitlements entitlement
  where entitlement.id = p_entitlement_id and entitlement.user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'The canonical reward entitlement is not owned by the authenticated user.';
  end if;
  if v_entitlement.outcome_snapshot not in ('done', 'did_my_best', 'complete') then
    raise exception using errcode = '22023', message = 'Only successful canonical outcomes can fulfill a reward entitlement.';
  end if;
  if p_reward_payload #>> '{claimRefs,0,taskId}' is distinct from v_entitlement.entity_id::text
    or p_reward_payload #>> '{tasks,0,id}' is distinct from v_entitlement.entity_id::text
    or (p_reward_payload ->> 'rewardDate')::date is distinct from v_entitlement.logical_date then
    raise exception using errcode = '22023', message = 'The reward payload does not match the canonical entitlement.';
  end if;

  -- The canonical facts are the sole eligibility source. The streak is read
  -- from explicit canonical successful facts; legacy History and legacy claim
  -- rows are deliberately not consulted by this bridge.
  for v_fact in
    select distinct on (fact.logical_date) fact.logical_date, fact.outcome
    from public.adhdice_task_history_facts fact
    where fact.user_id = v_user_id
      and fact.entity_id = v_entitlement.entity_id
      and fact.logical_date <= v_entitlement.logical_date
    order by fact.logical_date desc, fact.updated_at desc, fact.id desc
  loop
    exit when v_fact.outcome not in ('done', 'did_my_best', 'complete');
    if v_streak = 0 then
      v_streak := 1;
    elsif v_fact.logical_date = v_cursor - 1 then
      v_streak := v_streak + 1;
    else
      exit;
    end if;
    v_cursor := v_fact.logical_date;
  end loop;
  if v_streak = 0 then
    raise exception using errcode = '22023', message = 'The canonical entitlement has no successful canonical History fact.';
  end if;

  v_dice_count := case
    when v_streak <= 1 then 1
    when v_streak = 2 then 2
    when v_streak <= 6 then 3
    when v_streak <= 13 then 4
    when v_streak <= 29 then 5
    else 6
  end;
  v_payload := p_reward_payload || jsonb_build_object(
    'canonicalEntitlementId', p_entitlement_id,
    'diceCount', v_dice_count,
    'streakLength', v_streak
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

  if not found then
    insert into public.adhdice_task_reward_grants (
      user_id, entitlement_id, grant_operation_identity, grant_kind, units, grant_payload, state, applied_at
    ) values (
      v_user_id, p_entitlement_id, v_operation_id, 'banked_roll', v_dice_count, v_payload, 'applied', now()
    )
    returning * into v_grant;
    v_inserted := true;

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
  end if;

  update public.adhdice_task_reward_entitlements entitlement
  set state = 'fulfilled', fulfilled_at = coalesce(entitlement.fulfilled_at, now()), updated_at = now()
  where entitlement.user_id = v_user_id and entitlement.id = p_entitlement_id;

  v_result := jsonb_build_object(
    'awardedDice', case when v_inserted then v_dice_count else 0 end,
    'canonicalEntitlementId', p_entitlement_id,
    'pendingDice', v_account.pending_dice,
    'revision', v_account.revision,
    'updatedAt', v_account.updated_at
  );
  insert into public.adhdice_pending_reward_dice_operations (
    user_id, operation_id, operation_type, request_payload, result_payload
  ) values (
    v_user_id, v_operation_id, 'award', jsonb_build_object('entitlementId', p_entitlement_id), v_result
  );

  return query select v_account.pending_dice, v_account.revision, v_account.updated_at, v_result, false;
end;
$$;

revoke all on function public.adhdice_fulfill_canonical_reward_entitlement(uuid, integer, jsonb) from public, anon;
grant execute on function public.adhdice_fulfill_canonical_reward_entitlement(uuid, integer, jsonb) to authenticated;

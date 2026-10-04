-- ADHDice 7.16.80: fence pending dice reset against the exact opened bank snapshot.
-- Source-only forward correction. Do not apply without explicit live SQL authorization.

begin;

-- 7.16.79 created a zero-argument overload. Retire it whether or not that
-- unapplied patch was installed before this correction is reviewed.
drop function if exists public.adhdice_reset_pending_reward_dice();

create or replace function public.adhdice_reset_pending_reward_dice(
  p_expected_revision bigint,
  p_expected_pending_dice integer
)
returns table (pending_dice integer, revision bigint, updated_at timestamptz, discarded_dice integer)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_account public.adhdice_pending_reward_dice%rowtype;
  v_inventory_dice integer := 0;
  v_discarded_dice integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_expected_revision is null or p_expected_pending_dice is null or p_expected_pending_dice < 0 then
    raise exception using errcode = '22023', message = 'An expected pending reward bank snapshot is required.';
  end if;

  insert into public.adhdice_pending_reward_dice (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select account.*
    into v_account
    from public.adhdice_pending_reward_dice account
   where account.user_id = v_user_id
   for update;

  if v_account.revision <> p_expected_revision or v_account.pending_dice <> p_expected_pending_dice then
    raise exception using errcode = 'P0001', message = 'Pending rewards changed before reset. Review the updated bank and try again.';
  end if;

  select coalesce(sum(item.dice_count), 0)::integer
    into v_inventory_dice
    from public.adhdice_pending_reward_dice_items item
   where item.user_id = v_user_id
     and item.claimed_operation_id is null;

  if v_inventory_dice <> p_expected_pending_dice then
    raise exception using errcode = 'P0001', message = 'Pending reward inventory is inconsistent; no dice were discarded.';
  end if;

  with deleted_items as (
    delete from public.adhdice_pending_reward_dice_items item
     where item.user_id = v_user_id
       and item.claimed_operation_id is null
    returning item.dice_count
  )
  select coalesce(sum(deleted_items.dice_count), 0)::integer
    into v_discarded_dice
    from deleted_items;

  if v_discarded_dice <> p_expected_pending_dice then
    raise exception using errcode = 'P0001', message = 'Pending reward inventory changed during reset; no dice were discarded.';
  end if;

  update public.adhdice_pending_reward_dice account
     set pending_dice = 0,
         revision = account.revision + 1,
         updated_at = now()
   where account.user_id = v_user_id
  returning account.* into v_account;

  return query
  select v_account.pending_dice, v_account.revision, v_account.updated_at, v_discarded_dice;
end;
$function$;

revoke all on function public.adhdice_reset_pending_reward_dice(bigint, integer) from public, anon;
grant execute on function public.adhdice_reset_pending_reward_dice(bigint, integer) to authenticated;

notify pgrst, 'reload schema';

commit;

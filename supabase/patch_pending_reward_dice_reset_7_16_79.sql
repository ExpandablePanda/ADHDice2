-- ADHDice 7.16.79: atomically discard the authenticated user's unclaimed pending reward bank.
-- Source-only forward patch. Do not apply without explicit live SQL authorization.

begin;

create or replace function public.adhdice_reset_pending_reward_dice()
returns table (pending_dice integer, revision bigint, updated_at timestamptz, discarded_dice integer)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_account public.adhdice_pending_reward_dice%rowtype;
  v_discarded_dice integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  insert into public.adhdice_pending_reward_dice (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select account.*
    into v_account
    from public.adhdice_pending_reward_dice account
   where account.user_id = v_user_id
   for update;

  with deleted_items as (
    delete from public.adhdice_pending_reward_dice_items item
     where item.user_id = v_user_id
       and item.claimed_operation_id is null
    returning item.dice_count
  )
  select coalesce(sum(deleted_items.dice_count), 0)::integer
    into v_discarded_dice
    from deleted_items;

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

revoke all on function public.adhdice_reset_pending_reward_dice() from public, anon;
grant execute on function public.adhdice_reset_pending_reward_dice() to authenticated;

notify pgrst, 'reload schema';

commit;

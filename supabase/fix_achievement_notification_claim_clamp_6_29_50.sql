-- ADHDice 6.29.50 fixes the Achievement notification claim limit clamp.
-- Apply after add_achievement_notification_delivery_6_29_49.sql. No production execution is implied.
begin;

create or replace function public.adhdice_claim_achievement_notifications(
  p_limit integer default 10
)
returns setof public.adhdice_achievement_notifications
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  return query
  with selected as (
    select notification.id
    from public.adhdice_achievement_notifications notification
    where notification.user_id = v_user_id
      and notification.status = 'pending'
    order by notification.created_at, notification.id
    for update skip locked
    limit v_limit
  ), transitioned as (
    update public.adhdice_achievement_notifications notification
    set status = 'delivered',
      delivered_at = coalesce(notification.delivered_at, pg_catalog.clock_timestamp())
    from selected
    where notification.id = selected.id
      and notification.user_id = v_user_id
      and notification.status = 'pending'
    returning notification.*
  )
  select transitioned.*
  from transitioned
  order by transitioned.created_at, transitioned.id;
end;
$function$;

revoke all on function public.adhdice_claim_achievement_notifications(integer) from public, anon;
grant execute on function public.adhdice_claim_achievement_notifications(integer) to authenticated;

notify pgrst, 'reload schema';
commit;

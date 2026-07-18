-- ADHDice 6.29.49 secure Achievement notification delivery contract.
-- Apply after add_achievement_mvp_foundation.sql. No production execution is implied.
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

create or replace function public.adhdice_mark_achievement_notification_seen(
  p_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_notification public.adhdice_achievement_notifications%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_notification_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'result', 'not_found', 'notification', null);
  end if;

  select notification.*
  into v_notification
  from public.adhdice_achievement_notifications notification
  where notification.id = p_notification_id
    and notification.user_id = v_user_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'result', 'not_found', 'notification', null);
  end if;
  if v_notification.status = 'seen' then
    return pg_catalog.jsonb_build_object('success', true, 'result', 'already_seen', 'notification', pg_catalog.to_jsonb(v_notification));
  end if;
  if v_notification.status <> 'delivered' then
    return pg_catalog.jsonb_build_object('success', false, 'result', 'not_delivered', 'notification', pg_catalog.to_jsonb(v_notification));
  end if;

  update public.adhdice_achievement_notifications notification
  set status = 'seen',
    seen_at = coalesce(notification.seen_at, pg_catalog.clock_timestamp())
  where notification.id = v_notification.id
    and notification.user_id = v_user_id
    and notification.status = 'delivered'
  returning notification.* into v_notification;

  return pg_catalog.jsonb_build_object('success', true, 'result', 'seen', 'notification', pg_catalog.to_jsonb(v_notification));
end;
$function$;

revoke all on function public.adhdice_claim_achievement_notifications(integer) from public, anon;
grant execute on function public.adhdice_claim_achievement_notifications(integer) to authenticated;
revoke all on function public.adhdice_mark_achievement_notification_seen(uuid) from public, anon;
grant execute on function public.adhdice_mark_achievement_notification_seen(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

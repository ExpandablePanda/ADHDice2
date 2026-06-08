create or replace function public.adhdice_claim_health_achievement(
  p_user_id uuid,
  p_achievement_code text,
  p_title text,
  p_description text,
  p_awarded_points integer,
  p_awarded_xp integer,
  p_awarded_tokens integer,
  p_earned_at timestamptz default now()
)
returns table (
  award_id uuid,
  created boolean,
  points integer,
  xp integer,
  level integer,
  tokens integer,
  earned_at timestamptz
)
language plpgsql
as $body$
declare
  v_award public.adhdice_health_achievement_awards%rowtype;
  v_profile public.adhdice_user_profiles%rowtype;
  v_previous_level integer;
  v_next_level integer;
  v_level_ups integer;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Not authorized to claim this health achievement.';
  end if;

  insert into public.adhdice_health_achievement_awards (
    user_id, achievement_code, title, description,
    awarded_points, awarded_xp, awarded_tokens, earned_at
  )
  values (
    p_user_id, p_achievement_code, p_title, p_description,
    p_awarded_points, p_awarded_xp, p_awarded_tokens, p_earned_at
  )
  on conflict (user_id, achievement_code) do nothing
  returning * into v_award;

  insert into public.adhdice_user_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select *
    into v_profile
    from public.adhdice_user_profiles
    where user_id = p_user_id
    for update;

  if v_award.id is null then
    return query select
      null::uuid, false, v_profile.points, v_profile.xp,
      v_profile.level, v_profile.tokens, null::timestamptz;
    return;
  end if;

  v_previous_level := public.adhdice_level_from_xp(v_profile.xp);
  v_next_level := public.adhdice_level_from_xp(v_profile.xp + p_awarded_xp);
  v_level_ups := greatest(v_next_level - v_previous_level, 0);

  update public.adhdice_user_profiles
    set
      points = public.adhdice_user_profiles.points + p_awarded_points,
      xp = public.adhdice_user_profiles.xp + p_awarded_xp,
      level = v_next_level,
      tokens = public.adhdice_user_profiles.tokens + p_awarded_tokens + v_level_ups,
      free_roll_bank = public.adhdice_user_profiles.free_roll_bank + v_level_ups
    where user_id = p_user_id
    returning * into v_profile;

  insert into public.adhdice_point_ledger (
    user_id, delta, reason, balance_after, source, ref_id
  )
  values (
    p_user_id, p_awarded_points, 'Health achievement: ' || p_title,
    v_profile.points, 'health', v_award.id
  );

  return query select
    v_award.id, true, v_profile.points, v_profile.xp,
    v_profile.level, v_profile.tokens, v_award.earned_at;
end;
$body$;

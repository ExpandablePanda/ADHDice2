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
as $$
declare
  v_award public.adhdice_health_achievement_awards%rowtype;
  v_profile public.adhdice_user_profiles%rowtype;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Not authorized to claim this health achievement.';
  end if;

  insert into public.adhdice_health_achievement_awards (
    user_id,
    achievement_code,
    title,
    description,
    awarded_points,
    awarded_xp,
    awarded_tokens,
    earned_at
  )
  values (
    p_user_id,
    p_achievement_code,
    p_title,
    p_description,
    p_awarded_points,
    p_awarded_xp,
    p_awarded_tokens,
    p_earned_at
  )
  on conflict (user_id, achievement_code) do nothing
  returning * into v_award;

  if v_award.id is null then
    select *
      into v_profile
      from public.adhdice_user_profiles
      where user_id = p_user_id;

    return query
      select
        null::uuid,
        false,
        coalesce(v_profile.points, 0),
        coalesce(v_profile.xp, 0),
        coalesce(v_profile.level, 1),
        coalesce(v_profile.tokens, 0),
        null::timestamptz;
    return;
  end if;

  insert into public.adhdice_user_profiles (
    user_id,
    points,
    xp,
    level,
    tokens
  )
  values (
    p_user_id,
    p_awarded_points,
    p_awarded_xp,
    floor(p_awarded_xp / 100.0)::integer + 1,
    p_awarded_tokens
  )
  on conflict (user_id) do update
    set
      points = public.adhdice_user_profiles.points + p_awarded_points,
      xp = public.adhdice_user_profiles.xp + p_awarded_xp,
      level = floor((public.adhdice_user_profiles.xp + p_awarded_xp) / 100.0)::integer + 1,
      tokens = public.adhdice_user_profiles.tokens + p_awarded_tokens
  returning * into v_profile;

  insert into public.adhdice_point_ledger (
    user_id,
    delta,
    reason,
    balance_after,
    source,
    ref_id
  )
  values (
    p_user_id,
    p_awarded_points,
    'Health achievement: ' || p_title,
    coalesce(v_profile.points, 0),
    'health',
    v_award.id
  );

  return query
    select
      v_award.id,
      true,
      coalesce(v_profile.points, 0),
      coalesce(v_profile.xp, 0),
      coalesce(v_profile.level, 1),
      coalesce(v_profile.tokens, 0),
      v_award.earned_at;
end;
$$;

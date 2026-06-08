begin;

do $health_reward_test$
declare
  v_user_id uuid;
  v_achievement_code text := 'first_check_in';
  v_first_claim record;
  v_duplicate_claim record;
  v_profile public.adhdice_user_profiles%rowtype;
begin
  select user_id
    into v_user_id
    from public.adhdice_user_profiles
    order by created_at
    limit 1;

  if v_user_id is null then
    raise exception 'Health reward smoke test needs at least one user profile.';
  end if;

  update public.adhdice_user_profiles
    set
      points = 0,
      xp = 90,
      level = 1,
      tokens = 0,
      free_roll_bank = 0
    where user_id = v_user_id;

  delete from public.adhdice_health_achievement_awards
    where user_id = v_user_id
      and achievement_code = v_achievement_code;

  select *
    into v_first_claim
    from public.adhdice_claim_health_achievement(
      v_user_id,
      v_achievement_code,
      'Health level economy smoke test',
      'Rolled back after verification.',
      5,
      20,
      2,
      now()
    );

  select *
    into v_profile
    from public.adhdice_user_profiles
    where user_id = v_user_id;

  if v_first_claim.created is distinct from true
    or v_profile.points <> 5
    or v_profile.xp <> 110
    or v_profile.level <> 2
    or v_profile.tokens <> 3
    or v_profile.free_roll_bank <> 1
  then
    raise exception
      'First claim failed: created %, points %, xp %, level %, tokens %, free rolls %',
      v_first_claim.created,
      v_profile.points,
      v_profile.xp,
      v_profile.level,
      v_profile.tokens,
      v_profile.free_roll_bank;
  end if;

  select *
    into v_duplicate_claim
    from public.adhdice_claim_health_achievement(
      v_user_id,
      v_achievement_code,
      'Health level economy smoke test',
      'Rolled back after verification.',
      5,
      20,
      2,
      now()
    );

  select *
    into v_profile
    from public.adhdice_user_profiles
    where user_id = v_user_id;

  if v_duplicate_claim.created is distinct from false
    or v_profile.points <> 5
    or v_profile.xp <> 110
    or v_profile.level <> 2
    or v_profile.tokens <> 3
    or v_profile.free_roll_bank <> 1
  then
    raise exception
      'Duplicate claim changed economy: created %, points %, xp %, level %, tokens %, free rolls %',
      v_duplicate_claim.created,
      v_profile.points,
      v_profile.xp,
      v_profile.level,
      v_profile.tokens,
      v_profile.free_roll_bank;
  end if;

  raise notice 'PASS: health level economy and duplicate-claim protection are correct.';
end;
$health_reward_test$;

rollback;

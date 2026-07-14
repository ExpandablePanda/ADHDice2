-- 6.29.6: atomic, idempotent dice payment and roll creation.
-- Apply manually in Supabase before deploying the 6.29.6 client.

alter table public.adhdice_roll_history
  add column if not exists operation_id uuid,
  add column if not exists reward_free_rolls integer not null default 0 check (reward_free_rolls >= 0),
  add column if not exists reward_tokens integer not null default 0 check (reward_tokens >= 0),
  add column if not exists reward_applied boolean not null default false;

create unique index if not exists adhdice_roll_history_user_operation_unique
  on public.adhdice_roll_history (user_id, operation_id)
  where operation_id is not null;

create or replace function public.adhdice_execute_roll(
  p_operation_id uuid,
  p_point_cost integer,
  p_requested_result integer,
  p_free_roll_award integer default 0,
  p_token_award integer default 0
)
returns table (
  operation_id uuid,
  history_id uuid,
  roll_result integer,
  points_spent integer,
  free_roll_bank integer,
  points integer,
  xp integer,
  level integer,
  tokens integer,
  profile_updated_at timestamptz,
  rolled_at timestamptz,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.adhdice_user_profiles%rowtype;
  v_history public.adhdice_roll_history%rowtype;
  v_points_spent integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to roll.';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'A roll operation ID is required.';
  end if;
  if p_point_cost < 0 then
    raise exception using errcode = '22023', message = 'Roll point cost cannot be negative.';
  end if;
  if p_requested_result < 1 or p_requested_result > 20 then
    raise exception using errcode = '22023', message = 'Roll result must be between 1 and 20.';
  end if;
  if p_free_roll_award < 0 or p_token_award < 0 then
    raise exception using errcode = '22023', message = 'Roll rewards cannot be negative.';
  end if;

  select profile.*
    into v_profile
    from public.adhdice_user_profiles as profile
   where profile.user_id = v_user_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'User profile is unavailable.';
  end if;

  select history.*
    into v_history
    from public.adhdice_roll_history as history
   where history.user_id = v_user_id
     and history.operation_id = p_operation_id;

  if found then
    if p_free_roll_award > 0 or p_token_award > 0 then
      if v_history.reward_applied then
        if v_history.reward_free_rolls <> p_free_roll_award or v_history.reward_tokens <> p_token_award then
          raise exception using errcode = 'P0001', message = 'This roll operation already has a different reward result.';
        end if;
      else
        update public.adhdice_user_profiles as profile
           set free_roll_bank = profile.free_roll_bank + p_free_roll_award,
               tokens = profile.tokens + p_token_award
         where profile.user_id = v_user_id
         returning profile.* into v_profile;

        update public.adhdice_roll_history as history
           set reward_free_rolls = p_free_roll_award,
               reward_tokens = p_token_award,
               reward_applied = true
         where history.id = v_history.id
         returning history.* into v_history;
      end if;
    end if;

    return query select
      v_history.operation_id,
      v_history.id,
      v_history.roll_result,
      v_history.points_spent,
      v_profile.free_roll_bank,
      v_profile.points,
      v_profile.xp,
      v_profile.level,
      v_profile.tokens,
      v_profile.updated_at,
      v_history.rolled_at,
      true;
    return;
  end if;

  if p_point_cost > 0 and v_profile.free_roll_bank > 0 then
    update public.adhdice_user_profiles as profile
       set free_roll_bank = profile.free_roll_bank - 1
     where profile.user_id = v_user_id
     returning profile.* into v_profile;
  elsif p_point_cost > 0 then
    if v_profile.points < p_point_cost then
      raise exception using errcode = 'P0001', message = 'Not enough free rolls or points.';
    end if;

    v_points_spent := p_point_cost;
    update public.adhdice_user_profiles as profile
       set points = profile.points - p_point_cost
     where profile.user_id = v_user_id
     returning profile.* into v_profile;

    insert into public.adhdice_point_ledger (
      user_id,
      delta,
      reason,
      balance_after,
      source,
      ref_id
    ) values (
      v_user_id,
      -p_point_cost,
      'Dice roll',
      v_profile.points,
      'roll',
      p_operation_id
    );
  end if;

  if p_free_roll_award > 0 or p_token_award > 0 then
    update public.adhdice_user_profiles as profile
       set free_roll_bank = profile.free_roll_bank + p_free_roll_award,
           tokens = profile.tokens + p_token_award
     where profile.user_id = v_user_id
     returning profile.* into v_profile;
  end if;

  insert into public.adhdice_roll_history (
    user_id,
    operation_id,
    roll_result,
    points_spent,
    prize_label,
    reward_free_rolls,
    reward_tokens,
    reward_applied
  ) values (
    v_user_id,
    p_operation_id,
    p_requested_result,
    v_points_spent,
    null,
    p_free_roll_award,
    p_token_award,
    p_free_roll_award > 0 or p_token_award > 0
  )
  returning * into v_history;

  return query select
    v_history.operation_id,
    v_history.id,
    v_history.roll_result,
    v_history.points_spent,
    v_profile.free_roll_bank,
    v_profile.points,
    v_profile.xp,
    v_profile.level,
    v_profile.tokens,
    v_profile.updated_at,
    v_history.rolled_at,
    false;
end;
$$;

revoke all on function public.adhdice_execute_roll(uuid, integer, integer, integer, integer) from public;
revoke all on function public.adhdice_execute_roll(uuid, integer, integer, integer, integer) from anon;
grant execute on function public.adhdice_execute_roll(uuid, integer, integer, integer, integer) to authenticated;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'adhdice_user_profiles'
  ) then
    alter publication supabase_realtime add table public.adhdice_user_profiles;
  end if;
end;
$$;

notify pgrst, 'reload schema';

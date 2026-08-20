-- 7.10.3: make canonical Task rewards permanent while History remains editable.
-- Reviewed migration only. Do not apply to live Supabase as part of this ticket.

begin;

alter table public.adhdice_task_reward_entitlements
  add column if not exists reward_units_snapshot integer;

-- The stronger Task/logical-day identity must be proven before replacing the
-- existing program-version identity. Never delete or merge unexpected rows.
do $migration$
begin
  if exists (
    select 1
      from public.adhdice_task_reward_entitlements
     group by user_id, entity_id, logical_date
    having count(*) > 1
  ) then
    raise exception '7.10.3 cannot replace reward identity: duplicate Task/logical-day entitlements exist.'
      using errcode = '23505';
  end if;
end;
$migration$;

-- Backfill every existing entitlement before the History FK is relaxed. A
-- fulfilled entitlement must have exactly one positive canonical grant. A
-- pending entitlement derives the same streak tier used by the current
-- fulfillment RPC while its original History fact still exists.
do $migration$
declare
  v_entitlement public.adhdice_task_reward_entitlements%rowtype;
  v_task public.adhdice_clean_tasks%rowtype;
  v_fact public.adhdice_task_history_facts%rowtype;
  v_streak_fact record;
  v_grant_count integer;
  v_grant_units integer;
  v_streak integer;
  v_reward_units integer;
begin
  for v_entitlement in
    select entitlement.*
      from public.adhdice_task_reward_entitlements entitlement
     where entitlement.reward_units_snapshot is null
     order by entitlement.created_at, entitlement.id
  loop
    if v_entitlement.state = 'fulfilled' then
      select count(*)::integer, max(grant_row.units)::integer
        into v_grant_count, v_grant_units
        from public.adhdice_task_reward_grants grant_row
       where grant_row.user_id = v_entitlement.user_id
         and grant_row.entitlement_id = v_entitlement.id
         and grant_row.grant_kind = 'banked_roll';
      if v_grant_count <> 1 or v_grant_units is null or v_grant_units <= 0 then
        raise exception '7.10.3 cannot backfill fulfilled entitlement % from one positive canonical grant.', v_entitlement.id
          using errcode = '23514';
      end if;
      update public.adhdice_task_reward_entitlements
         set reward_units_snapshot = v_grant_units,
             updated_at = now()
       where id = v_entitlement.id and user_id = v_entitlement.user_id;
      continue;
    end if;

    if v_entitlement.state <> 'pending' then
      raise exception '7.10.3 cannot backfill unsupported entitlement state % for %.', v_entitlement.state, v_entitlement.id
        using errcode = '23514';
    end if;
    if v_entitlement.canonical_history_id is null then
      raise exception '7.10.3 cannot backfill pending entitlement % without its original History fact.', v_entitlement.id
        using errcode = '23514';
    end if;

    select fact.* into v_fact
      from public.adhdice_task_history_facts fact
     where fact.user_id = v_entitlement.user_id
       and fact.id = v_entitlement.canonical_history_id;
    if not found
       or v_fact.entity_id is distinct from v_entitlement.entity_id
       or v_fact.logical_date is distinct from v_entitlement.logical_date
       or v_fact.outcome is distinct from v_entitlement.outcome_snapshot
       or v_fact.outcome not in ('done', 'did_my_best', 'complete') then
      raise exception '7.10.3 cannot backfill pending entitlement % from matching successful History.', v_entitlement.id
        using errcode = '23514';
    end if;

    select task.* into v_task
      from public.adhdice_clean_tasks task
     where task.user_id = v_entitlement.user_id
       and task.id = v_entitlement.entity_id;
    if not found then
      raise exception '7.10.3 cannot backfill entitlement % without its owned Task.', v_entitlement.id
        using errcode = '23514';
    end if;

    v_streak := 0;
    if v_task.repeat_frequency = 'none' then
      v_streak := 1;
    else
      for v_streak_fact in
        select fact.outcome
          from public.adhdice_task_history_facts fact
         where fact.user_id = v_entitlement.user_id
           and fact.entity_id = v_entitlement.entity_id
           and fact.logical_date <= v_entitlement.logical_date
         order by fact.logical_date desc, fact.updated_at desc, fact.id desc
      loop
        exit when v_streak_fact.outcome not in ('done', 'did_my_best', 'complete');
        v_streak := v_streak + 1;
      end loop;
    end if;
    if v_streak < 1 then
      raise exception '7.10.3 cannot backfill pending entitlement % with a positive reward calculation.', v_entitlement.id
        using errcode = '23514';
    end if;
    v_reward_units := case
      when v_streak <= 1 then 1
      when v_streak = 2 then 2
      when v_streak <= 6 then 3
      when v_streak <= 13 then 4
      when v_streak <= 29 then 5
      else 6
    end;
    update public.adhdice_task_reward_entitlements
       set reward_units_snapshot = v_reward_units,
           updated_at = now()
     where id = v_entitlement.id and user_id = v_entitlement.user_id;
  end loop;

  if exists (
    select 1
      from public.adhdice_task_reward_entitlements
     where reward_units_snapshot is null or reward_units_snapshot <= 0
  ) then
    raise exception '7.10.3 cannot enforce reward snapshots: an entitlement remains without a positive value.'
      using errcode = '23514';
  end if;
end;
$migration$;

alter table public.adhdice_task_reward_entitlements
  alter column reward_units_snapshot set not null;

alter table public.adhdice_task_reward_entitlements
  alter column canonical_history_id drop not null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'adhdice_task_reward_entitlements_reward_units_snapshot_check'
  ) then
    alter table public.adhdice_task_reward_entitlements
      add constraint adhdice_task_reward_entitlements_reward_units_snapshot_check
      check (reward_units_snapshot > 0);
  end if;
end;
$migration$;

alter table public.adhdice_task_reward_entitlements
  drop constraint if exists adhdice_task_reward_entitlements_identity_key;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'adhdice_task_reward_entitlements_identity_key'
  ) then
    alter table public.adhdice_task_reward_entitlements
      add constraint adhdice_task_reward_entitlements_identity_key
      unique (user_id, entity_id, logical_date);
  end if;
end;
$migration$;

alter table public.adhdice_task_reward_entitlements
  drop constraint if exists adhdice_task_reward_entitlements_history_fkey;
alter table public.adhdice_task_reward_entitlements
  add constraint adhdice_task_reward_entitlements_history_fkey
  foreign key (user_id, canonical_history_id)
  references public.adhdice_task_history_facts (user_id, id)
  on delete set null (canonical_history_id);

commit;

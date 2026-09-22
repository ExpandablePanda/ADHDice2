-- ADHDice 7.15.6 canonical Task History synchronization metadata.
--
-- This is source-only infrastructure for a future History delta transport.
-- It does not backfill the change ledger, expose a delta endpoint, or change
-- canonical Task State command semantics. Apply only with explicit live SQL
-- authorization.

begin;

create extension if not exists pgcrypto;

create table if not exists public.adhdice_task_history_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_revision bigint not null default 0
    check (current_revision >= 0),
  sync_epoch uuid not null default gen_random_uuid(),
  protocol_version text not null default 'task-history-sync-v1'
    check (protocol_version = 'task-history-sync-v1'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adhdice_task_history_changes (
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence bigint not null check (sequence >= 1),
  history_fact_id uuid not null,
  entity_id uuid not null,
  logical_date date not null,
  operation text not null check (operation in ('upsert', 'delete')),
  row_revision bigint,
  changed_at timestamptz not null default now(),
  primary key (user_id, sequence)
);

create index if not exists adhdice_task_history_changes_history_fact_sequence_idx
  on public.adhdice_task_history_changes (user_id, history_fact_id, sequence);

-- Existing History predates the ledger. Seed only the per-user state and leave
-- current_revision at zero; the trigger starts the ledger at installation time.
insert into public.adhdice_task_history_sync_state (user_id, current_revision, sync_epoch, protocol_version)
select users.id, 0, gen_random_uuid(), 'task-history-sync-v1'
from auth.users users
on conflict (user_id) do nothing;

create or replace function public.adhdice_capture_task_history_sync_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sequence bigint;
begin
  -- A true no-op UPDATE is not a History change. The canonical table's
  -- existing updated_at trigger changes only that server-managed timestamp;
  -- exclude it so a redundant SQL update remains a no-op here.
  if tg_op = 'UPDATE'
     and (pg_catalog.to_jsonb(old) - 'updated_at') is not distinct from
         (pg_catalog.to_jsonb(new) - 'updated_at') then
    return new;
  end if;

  -- Cascading auth.users deletion removes all metadata with the user. Do not
  -- try to append a durable ledger row whose user FK is being removed.
  if tg_op = 'DELETE' then
    if exists (select 1 from auth.users users where users.id = old.user_id) then
      insert into public.adhdice_task_history_sync_state (user_id)
      values (old.user_id)
      on conflict (user_id) do nothing;

      select state.current_revision + 1
        into v_sequence
        from public.adhdice_task_history_sync_state state
       where state.user_id = old.user_id
       for update;

      update public.adhdice_task_history_sync_state
         set current_revision = v_sequence,
             updated_at = pg_catalog.clock_timestamp()
       where user_id = old.user_id;

      insert into public.adhdice_task_history_changes (
        user_id, sequence, history_fact_id, entity_id, logical_date,
        operation, row_revision, changed_at
      ) values (
        old.user_id, v_sequence, old.id, old.entity_id, old.logical_date,
        'delete', old.revision, pg_catalog.clock_timestamp()
      );
    end if;
    return old;
  end if;

  -- If cache placement identity changes, first remove the old placement and
  -- then publish the new one. This preserves correctness for operational SQL
  -- that changes user_id, id, entity_id, or logical_date.
  if tg_op = 'UPDATE'
     and (
       old.user_id is distinct from new.user_id
       or old.id is distinct from new.id
       or old.entity_id is distinct from new.entity_id
       or old.logical_date is distinct from new.logical_date
     )
     and exists (select 1 from auth.users users where users.id = old.user_id) then
    insert into public.adhdice_task_history_sync_state (user_id)
    values (old.user_id)
    on conflict (user_id) do nothing;

    select state.current_revision + 1
      into v_sequence
      from public.adhdice_task_history_sync_state state
     where state.user_id = old.user_id
     for update;

    update public.adhdice_task_history_sync_state
       set current_revision = v_sequence,
           updated_at = pg_catalog.clock_timestamp()
     where user_id = old.user_id;

    insert into public.adhdice_task_history_changes (
      user_id, sequence, history_fact_id, entity_id, logical_date,
      operation, row_revision, changed_at
    ) values (
      old.user_id, v_sequence, old.id, old.entity_id, old.logical_date,
      'delete', old.revision, pg_catalog.clock_timestamp()
    );
  end if;

  -- INSERT and ordinary UPDATE each publish one upsert. On an identity
  -- UPDATE this is the second event, after the old-placement delete above.
  insert into public.adhdice_task_history_sync_state (user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;

  select state.current_revision + 1
    into v_sequence
    from public.adhdice_task_history_sync_state state
   where state.user_id = new.user_id
   for update;

  update public.adhdice_task_history_sync_state
     set current_revision = v_sequence,
         updated_at = pg_catalog.clock_timestamp()
   where user_id = new.user_id;

  insert into public.adhdice_task_history_changes (
    user_id, sequence, history_fact_id, entity_id, logical_date,
    operation, row_revision, changed_at
  ) values (
    new.user_id, v_sequence, new.id, new.entity_id, new.logical_date,
    'upsert', new.revision, pg_catalog.clock_timestamp()
  );

  return new;
end;
$function$;

revoke all on function public.adhdice_capture_task_history_sync_change() from public, anon, authenticated;

drop trigger if exists adhdice_capture_task_history_sync_change
  on public.adhdice_task_history_facts;
-- AFTER is intentional: INSERT ... ON CONFLICT DO UPDATE must emit only the
-- final UPDATE event, not an extra event for the proposed INSERT.
create trigger adhdice_capture_task_history_sync_change
  after insert or update or delete
  on public.adhdice_task_history_facts
  for each row execute function public.adhdice_capture_task_history_sync_change();

alter table public.adhdice_task_history_sync_state enable row level security;
alter table public.adhdice_task_history_changes enable row level security;

drop policy if exists "Users can read their own Task History sync state"
  on public.adhdice_task_history_sync_state;
create policy "Users can read their own Task History sync state"
  on public.adhdice_task_history_sync_state
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own Task History changes"
  on public.adhdice_task_history_changes;
create policy "Users can read their own Task History changes"
  on public.adhdice_task_history_changes
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.adhdice_task_history_sync_state from public, anon, authenticated;
revoke all on table public.adhdice_task_history_changes from public, anon, authenticated;
grant select on table public.adhdice_task_history_sync_state to authenticated;
grant select on table public.adhdice_task_history_changes to authenticated;

commit;

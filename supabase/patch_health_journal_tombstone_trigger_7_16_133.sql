-- ADHDice 7.16.133: avoid child-only field access on Journal check-in rows.
-- Authored source only. Do not apply without review and explicit authorization.

begin;

create schema if not exists private;

create or replace function private.adhdice_guard_health_journal_record_tombstone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_record_id uuid;
  v_entity text := tg_argv[0];
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_record_id := old.id;
  else
    v_user_id := new.user_id;
    v_record_id := new.id;
    if tg_op = 'UPDATE' and (old.user_id is distinct from new.user_id or old.id is distinct from new.id) then
      raise exception using
        errcode = '23514',
        message = 'Journal record owner and ID are immutable.';
    end if;
    if tg_op = 'UPDATE' and v_entity in ('signal_value', 'signal_occurrence', 'symptom_entry') then
      if old.journal_entry_id is distinct from new.journal_entry_id then
        raise exception using
          errcode = '23514',
          message = 'Journal child occurrence ownership is immutable.';
      end if;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || v_entity || ':' || v_record_id::text, 0)
  );

  if tg_op = 'DELETE' then
    -- During auth.users deletion, its row is already gone when cascading
    -- Journal deletes run. FOR KEY SHARE serializes ordinary Journal deletes
    -- against a concurrent account deletion.
    perform 1
      from auth.users as account_user
     where account_user.id = v_user_id
       for key share;

    if found then
      insert into public.adhdice_health_journal_record_tombstones (user_id, entity, record_id)
      values (v_user_id, v_entity, v_record_id)
      on conflict (user_id, entity, record_id) do nothing;
    end if;
    return old;
  end if;

  if exists (
    select 1
      from public.adhdice_health_journal_record_tombstones as tombstone
     where tombstone.user_id = v_user_id
       and tombstone.entity = v_entity
       and tombstone.record_id = v_record_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'This Journal record was deleted and cannot be restored.';
  end if;

  return new;
end;
$function$;

revoke all on function private.adhdice_guard_health_journal_record_tombstone() from public, anon, authenticated;

commit;

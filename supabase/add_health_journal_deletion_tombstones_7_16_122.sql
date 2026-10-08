-- ADHDice 7.16.122: make Journal deletion durable across stale clients.
-- Authored source only. Do not apply without review and explicit authorization.

begin;

create schema if not exists private;

create table if not exists public.adhdice_health_journal_record_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null check (entity in (
    'checkin',
    'signal',
    'signal_value',
    'signal_occurrence',
    'symptom',
    'symptom_entry'
  )),
  record_id uuid not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, entity, record_id)
);

alter table public.adhdice_health_journal_record_tombstones enable row level security;
revoke all on table public.adhdice_health_journal_record_tombstones from anon, authenticated;

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
    if tg_op = 'UPDATE'
       and v_entity in ('signal_value', 'signal_occurrence', 'symptom_entry')
       and old.journal_entry_id is distinct from new.journal_entry_id then
      raise exception using
        errcode = '23514',
        message = 'Journal child occurrence ownership is immutable.';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || v_entity || ':' || v_record_id::text, 0)
  );

  if tg_op = 'DELETE' then
    insert into public.adhdice_health_journal_record_tombstones (user_id, entity, record_id)
    values (v_user_id, v_entity, v_record_id)
    on conflict (user_id, entity, record_id) do nothing;
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

drop trigger if exists adhdice_health_checkins_tombstone_guard on public.adhdice_health_checkins;
create trigger adhdice_health_checkins_tombstone_guard
  before insert or update or delete on public.adhdice_health_checkins
  for each row execute function private.adhdice_guard_health_journal_record_tombstone('checkin');

drop trigger if exists adhdice_health_journal_signals_tombstone_guard on public.adhdice_health_journal_signals;
create trigger adhdice_health_journal_signals_tombstone_guard
  before insert or update or delete on public.adhdice_health_journal_signals
  for each row execute function private.adhdice_guard_health_journal_record_tombstone('signal');

drop trigger if exists adhdice_health_journal_signal_values_tombstone_guard on public.adhdice_health_journal_signal_values;
create trigger adhdice_health_journal_signal_values_tombstone_guard
  before insert or update or delete on public.adhdice_health_journal_signal_values
  for each row execute function private.adhdice_guard_health_journal_record_tombstone('signal_value');

drop trigger if exists adhdice_health_journal_signal_occurrences_tombstone_guard on public.adhdice_health_journal_signal_occurrences;
create trigger adhdice_health_journal_signal_occurrences_tombstone_guard
  before insert or update or delete on public.adhdice_health_journal_signal_occurrences
  for each row execute function private.adhdice_guard_health_journal_record_tombstone('signal_occurrence');

drop trigger if exists adhdice_health_symptoms_tombstone_guard on public.adhdice_health_symptoms;
create trigger adhdice_health_symptoms_tombstone_guard
  before insert or update or delete on public.adhdice_health_symptoms
  for each row execute function private.adhdice_guard_health_journal_record_tombstone('symptom');

drop trigger if exists adhdice_health_symptom_entries_tombstone_guard on public.adhdice_health_symptom_entries;
create trigger adhdice_health_symptom_entries_tombstone_guard
  before insert or update or delete on public.adhdice_health_symptom_entries
  for each row execute function private.adhdice_guard_health_journal_record_tombstone('symptom_entry');

create or replace function public.adhdice_delete_health_journal_record(
  p_entity text,
  p_record_id uuid,
  p_journal_entry_id uuid default null
)
returns table (id uuid, tombstoned boolean, deleted boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_existing_parent_id uuid;
  v_deleted_id uuid;
  v_is_child boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_entity not in ('checkin', 'signal', 'signal_value', 'signal_occurrence', 'symptom_entry')
     or p_record_id is null then
    raise exception using errcode = '22023', message = 'Journal deletion target is invalid.';
  end if;

  v_is_child := p_entity in ('signal_value', 'signal_occurrence', 'symptom_entry');
  if not v_is_child and p_journal_entry_id is not null then
    raise exception using errcode = '22023', message = 'Only Journal Feeling records can include a parent Journal Entry ID.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_entity || ':' || p_record_id::text, 0)
  );

  if p_entity = 'signal_value' then
    select row.journal_entry_id into v_existing_parent_id
      from public.adhdice_health_journal_signal_values as row
     where row.id = p_record_id and row.user_id = v_user_id;
  elsif p_entity = 'signal_occurrence' then
    select row.journal_entry_id into v_existing_parent_id
      from public.adhdice_health_journal_signal_occurrences as row
     where row.id = p_record_id and row.user_id = v_user_id;
  elsif p_entity = 'symptom_entry' then
    select row.journal_entry_id into v_existing_parent_id
      from public.adhdice_health_symptom_entries as row
     where row.id = p_record_id and row.user_id = v_user_id;
  end if;

  if v_is_child and p_journal_entry_id is not null
     and v_existing_parent_id is not null
     and v_existing_parent_id is distinct from p_journal_entry_id then
    raise exception using errcode = '42501', message = 'Feeling record belongs to another Journal Entry.';
  end if;

  insert into public.adhdice_health_journal_record_tombstones (user_id, entity, record_id)
  values (v_user_id, p_entity, p_record_id)
  on conflict (user_id, entity, record_id) do nothing;

  if p_entity = 'checkin' then
    delete from public.adhdice_health_checkins as row
     where row.id = p_record_id and row.user_id = v_user_id
     returning row.id into v_deleted_id;
  elsif p_entity = 'signal' then
    delete from public.adhdice_health_journal_signals as row
     where row.id = p_record_id and row.user_id = v_user_id
     returning row.id into v_deleted_id;
  elsif p_entity = 'signal_value' then
    delete from public.adhdice_health_journal_signal_values as row
     where row.id = p_record_id and row.user_id = v_user_id
       and (p_journal_entry_id is null or row.journal_entry_id = p_journal_entry_id)
     returning row.id into v_deleted_id;
  elsif p_entity = 'signal_occurrence' then
    delete from public.adhdice_health_journal_signal_occurrences as row
     where row.id = p_record_id and row.user_id = v_user_id
       and (p_journal_entry_id is null or row.journal_entry_id = p_journal_entry_id)
     returning row.id into v_deleted_id;
  else
    delete from public.adhdice_health_symptom_entries as row
     where row.id = p_record_id and row.user_id = v_user_id
       and (p_journal_entry_id is null or row.journal_entry_id = p_journal_entry_id)
     returning row.id into v_deleted_id;
  end if;

  return query select p_record_id, true, v_deleted_id is not null;
end;
$function$;

revoke all on function public.adhdice_delete_health_journal_record(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.adhdice_delete_health_journal_record(text, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Integration regression test for add_health_journal_deletion_tombstones_7_16_122.sql.
-- Run only against an isolated local Supabase test database; the transaction rolls back.
begin;

create temporary table health_journal_tombstone_test_ids on commit drop as
select
  gen_random_uuid() as user_id,
  gen_random_uuid() as other_user_id,
  gen_random_uuid() as account_deletion_user_id,
  gen_random_uuid() as parent_id,
  gen_random_uuid() as other_parent_id,
  gen_random_uuid() as other_user_parent_id,
  gen_random_uuid() as account_deletion_parent_id,
  gen_random_uuid() as fresh_parent_id,
  gen_random_uuid() as signal_id,
  gen_random_uuid() as symptom_id,
  gen_random_uuid() as account_deletion_signal_id,
  gen_random_uuid() as account_deletion_symptom_id,
  gen_random_uuid() as signal_value_id,
  gen_random_uuid() as signal_occurrence_id,
  gen_random_uuid() as symptom_entry_id,
  gen_random_uuid() as account_deletion_signal_value_id,
  gen_random_uuid() as account_deletion_signal_occurrence_id,
  gen_random_uuid() as account_deletion_symptom_entry_id;

grant select on table pg_temp.health_journal_tombstone_test_ids to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
select user_id, 'authenticated', 'authenticated', user_id::text || '@journal-tombstone.test', '', now(), now()
  from pg_temp.health_journal_tombstone_test_ids
union all
select other_user_id, 'authenticated', 'authenticated', other_user_id::text || '@journal-tombstone.test', '', now(), now()
  from pg_temp.health_journal_tombstone_test_ids;
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
select account_deletion_user_id, 'authenticated', 'authenticated', account_deletion_user_id::text || '@journal-tombstone.test', '', now(), now()
  from pg_temp.health_journal_tombstone_test_ids;

insert into public.adhdice_health_checkins (id, user_id, entry_date, entry_time, entry_type)
select parent_id, user_id, date '2026-10-08', time '10:00', 'event'
  from pg_temp.health_journal_tombstone_test_ids
union all
select other_parent_id, user_id, date '2026-10-08', time '11:00', 'event'
  from pg_temp.health_journal_tombstone_test_ids
union all
select other_user_parent_id, other_user_id, date '2026-10-08', time '12:00', 'event'
  from pg_temp.health_journal_tombstone_test_ids;
insert into public.adhdice_health_checkins (id, user_id, entry_date, entry_time, entry_type)
select account_deletion_parent_id, account_deletion_user_id, date '2026-10-08', time '16:00', 'event'
  from pg_temp.health_journal_tombstone_test_ids;

insert into public.adhdice_health_journal_signals (id, user_id, kind, name, color, scale_labels)
select signal_id, user_id, 'emotion', 'Tombstone test', '#7863d2', array['0','1','2','3','4','5','6','7','8','9','10']::text[]
  from pg_temp.health_journal_tombstone_test_ids;
insert into public.adhdice_health_journal_signals (id, user_id, kind, name, color, scale_labels)
select account_deletion_signal_id, account_deletion_user_id, 'emotion', 'Account deletion test', '#7863d2', array['0','1','2','3','4','5','6','7','8','9','10']::text[]
  from pg_temp.health_journal_tombstone_test_ids;

insert into public.adhdice_health_symptoms (id, user_id, name, color)
select symptom_id, user_id, 'Tombstone symptom', '#7863d2'
  from pg_temp.health_journal_tombstone_test_ids;
insert into public.adhdice_health_symptoms (id, user_id, name, color)
select account_deletion_symptom_id, account_deletion_user_id, 'Account deletion symptom', '#7863d2'
  from pg_temp.health_journal_tombstone_test_ids;

insert into public.adhdice_health_journal_signal_values (id, user_id, journal_entry_id, signal_id, score)
select signal_value_id, user_id, parent_id, signal_id, 6
  from pg_temp.health_journal_tombstone_test_ids;
insert into public.adhdice_health_journal_signal_values (id, user_id, journal_entry_id, signal_id, score)
select account_deletion_signal_value_id, account_deletion_user_id, account_deletion_parent_id, account_deletion_signal_id, 6
  from pg_temp.health_journal_tombstone_test_ids;

insert into public.adhdice_health_journal_signal_occurrences (id, user_id, journal_entry_id, signal_id, entry_date, occurred_at, score)
select signal_occurrence_id, user_id, parent_id, signal_id, date '2026-10-08', timestamptz '2026-10-08 10:00:00+00', 6
  from pg_temp.health_journal_tombstone_test_ids;
insert into public.adhdice_health_journal_signal_occurrences (id, user_id, journal_entry_id, signal_id, entry_date, occurred_at, score)
select account_deletion_signal_occurrence_id, account_deletion_user_id, account_deletion_parent_id, account_deletion_signal_id, date '2026-10-08', timestamptz '2026-10-08 16:00:00+00', 6
  from pg_temp.health_journal_tombstone_test_ids;

insert into public.adhdice_health_symptom_entries (id, user_id, symptom_id, journal_entry_id, entry_date, severity)
select symptom_entry_id, user_id, symptom_id, parent_id, date '2026-10-08', 3
  from pg_temp.health_journal_tombstone_test_ids;
insert into public.adhdice_health_symptom_entries (id, user_id, symptom_id, journal_entry_id, entry_date, severity)
select account_deletion_symptom_entry_id, account_deletion_user_id, account_deletion_symptom_id, account_deletion_parent_id, date '2026-10-08', 3
  from pg_temp.health_journal_tombstone_test_ids;

set local role authenticated;
select set_config('request.jwt.claim.sub', user_id::text, true)
  from pg_temp.health_journal_tombstone_test_ids;

do $journal_tombstone_assertions$
declare
  v_ids record;
  v_result record;
begin
  select * into v_ids from pg_temp.health_journal_tombstone_test_ids;

  begin
    update public.adhdice_health_journal_signal_occurrences
       set journal_entry_id = v_ids.other_parent_id
     where id = v_ids.signal_occurrence_id and user_id = v_ids.user_id;
    raise exception 'A Feeling occurrence was moved across Journal Entries.';
  exception when check_violation then
    null;
  end;

  select * into v_result
    from public.adhdice_delete_health_journal_record('checkin', v_ids.parent_id, null);
  if v_result.id is distinct from v_ids.parent_id or v_result.tombstoned is distinct from true or v_result.deleted is distinct from true then
    raise exception 'Journal Entry deletion did not atomically confirm the tombstone and deletion.';
  end if;

  select * into v_result
    from public.adhdice_delete_health_journal_record('checkin', v_ids.parent_id, null);
  if v_result.tombstoned is distinct from true or v_result.deleted is distinct from false then
    raise exception 'Repeated Journal deletion was not idempotent.';
  end if;

  begin
    insert into public.adhdice_health_checkins (id, user_id, entry_date, entry_time, entry_type)
    values (v_ids.parent_id, v_ids.user_id, date '2026-10-08', time '13:00', 'event');
    raise exception 'A tombstoned Journal Entry ID was restored.';
  exception when check_violation then
    null;
  end;

  delete from public.adhdice_health_checkins
   where id = v_ids.other_parent_id and user_id = v_ids.user_id;
  if not found then
    raise exception 'Direct Journal Entry deletion did not find its owner-scoped row.';
  end if;
  begin
    insert into public.adhdice_health_checkins (id, user_id, entry_date, entry_time, entry_type)
    values (v_ids.other_parent_id, v_ids.user_id, date '2026-10-08', time '14:00', 'event');
    raise exception 'A direct-delete tombstone did not block a stale create.';
  exception when check_violation then
    null;
  end;

  insert into public.adhdice_health_checkins (id, user_id, entry_date, entry_time, entry_type)
  values (v_ids.fresh_parent_id, v_ids.user_id, date '2026-10-08', time '15:00', 'event');

  begin
    insert into public.adhdice_health_journal_signal_values (id, user_id, journal_entry_id, signal_id, score)
    values (v_ids.signal_value_id, v_ids.user_id, v_ids.other_parent_id, v_ids.signal_id, 7);
    raise exception 'A cascaded-deleted Feeling value ID was restored under another Entry.';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.adhdice_health_journal_signal_occurrences (id, user_id, journal_entry_id, signal_id, entry_date, occurred_at, score)
    values (v_ids.signal_occurrence_id, v_ids.user_id, v_ids.other_parent_id, v_ids.signal_id, date '2026-10-08', timestamptz '2026-10-08 13:00:00+00', 7);
    raise exception 'A cascaded-deleted Feeling occurrence ID was restored under another Entry.';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.adhdice_health_symptom_entries (id, user_id, symptom_id, journal_entry_id, entry_date, severity)
    values (v_ids.symptom_entry_id, v_ids.user_id, v_ids.symptom_id, v_ids.other_parent_id, date '2026-10-08', 4);
    raise exception 'A cascaded-deleted Symptom occurrence ID was restored under another Entry.';
  exception when check_violation then
    null;
  end;

  select * into v_result
    from public.adhdice_delete_health_journal_record('checkin', v_ids.other_user_parent_id, null);
  if v_result.deleted is distinct from false or v_result.tombstoned is distinct from true then
    raise exception 'Cross-user deletion did not return an owner-scoped idempotent tombstone.';
  end if;
end;
$journal_tombstone_assertions$;

reset role;

do $journal_tombstone_owner_assertions$
declare
  v_ids record;
begin
  select * into v_ids from pg_temp.health_journal_tombstone_test_ids;
  if not exists (
    select 1 from public.adhdice_health_checkins
     where id = v_ids.other_user_parent_id and user_id = v_ids.other_user_id
  ) then
    raise exception 'A user deleted another owner''s Journal Entry.';
  end if;
  if not exists (
    select 1 from public.adhdice_health_journal_record_tombstones
     where user_id = v_ids.user_id and entity = 'checkin' and record_id = v_ids.parent_id
  ) then
    raise exception 'The explicit Journal Entry tombstone is missing.';
  end if;
  if not exists (
    select 1 from public.adhdice_health_journal_record_tombstones
     where user_id = v_ids.user_id and entity = 'signal_value' and record_id = v_ids.signal_value_id
  ) or not exists (
    select 1 from public.adhdice_health_journal_record_tombstones
     where user_id = v_ids.user_id and entity = 'signal_occurrence' and record_id = v_ids.signal_occurrence_id
  ) or not exists (
    select 1 from public.adhdice_health_journal_record_tombstones
     where user_id = v_ids.user_id and entity = 'symptom_entry' and record_id = v_ids.symptom_entry_id
  ) then
    raise exception 'Parent deletion did not tombstone all cascaded Feeling and Symptom rows.';
  end if;
end;
$journal_tombstone_owner_assertions$;

do $journal_account_delete_assertions$
declare
  v_ids record;
begin
  select * into v_ids from pg_temp.health_journal_tombstone_test_ids;

  if not exists (select 1 from public.adhdice_health_checkins where id = v_ids.account_deletion_parent_id and user_id = v_ids.account_deletion_user_id)
     or not exists (select 1 from public.adhdice_health_journal_signals where id = v_ids.account_deletion_signal_id and user_id = v_ids.account_deletion_user_id)
     or not exists (select 1 from public.adhdice_health_journal_signal_values where id = v_ids.account_deletion_signal_value_id and user_id = v_ids.account_deletion_user_id)
     or not exists (select 1 from public.adhdice_health_journal_signal_occurrences where id = v_ids.account_deletion_signal_occurrence_id and user_id = v_ids.account_deletion_user_id)
     or not exists (select 1 from public.adhdice_health_symptoms where id = v_ids.account_deletion_symptom_id and user_id = v_ids.account_deletion_user_id)
     or not exists (select 1 from public.adhdice_health_symptom_entries where id = v_ids.account_deletion_symptom_entry_id and user_id = v_ids.account_deletion_user_id) then
    raise exception 'The account deletion fixture did not populate all six Journal tables.';
  end if;

  delete from auth.users where id = v_ids.account_deletion_user_id;
  if not found then
    raise exception 'The populated Journal test account was not deleted.';
  end if;

  if exists (select 1 from public.adhdice_health_checkins where user_id = v_ids.account_deletion_user_id)
     or exists (select 1 from public.adhdice_health_journal_signals where user_id = v_ids.account_deletion_user_id)
     or exists (select 1 from public.adhdice_health_journal_signal_values where user_id = v_ids.account_deletion_user_id)
     or exists (select 1 from public.adhdice_health_journal_signal_occurrences where user_id = v_ids.account_deletion_user_id)
     or exists (select 1 from public.adhdice_health_symptoms where user_id = v_ids.account_deletion_user_id)
     or exists (select 1 from public.adhdice_health_symptom_entries where user_id = v_ids.account_deletion_user_id) then
    raise exception 'Journal rows remained after full account deletion.';
  end if;

  if exists (
    select 1 from public.adhdice_health_journal_record_tombstones
     where user_id = v_ids.account_deletion_user_id
  ) then
    raise exception 'Tombstones remained after their owning account was deleted.';
  end if;
end;
$journal_account_delete_assertions$;

rollback;

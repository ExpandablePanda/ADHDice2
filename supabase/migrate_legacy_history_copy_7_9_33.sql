-- RETIRED / HISTORICAL ONLY / DO NOT APPLY.
-- ADHDice 7.9.33 forward-only literal legacy History copy.
-- SOURCE ONLY: do not apply without reviewed preview and explicit production authorization.
-- The candidate set is intentionally dynamic: it re-queries every legacy-only
-- date at execution time and does not encode a row or Task-count invariant.
begin;

create temporary table adhdice_7_9_33_legacy_only on commit drop as
select
  legacy.id as source_legacy_history_id,
  legacy.user_id,
  legacy.task_id as entity_id,
  task.entity_kind,
  legacy.entry_date as logical_date,
  legacy.status::text as outcome,
  legacy.occurrence_due_on as scheduled_due_on,
  profile.timezone,
  profile.day_start_time,
  profile.settings_revision
from public.adhdice_task_history legacy
join public.adhdice_clean_tasks task
  on task.user_id = legacy.user_id and task.id = legacy.task_id
left join public.adhdice_user_profiles profile on profile.user_id = legacy.user_id
left join public.adhdice_task_history_facts fact
  on fact.user_id = legacy.user_id
 and fact.entity_id = legacy.task_id
 and fact.logical_date = legacy.entry_date
where fact.id is null;

create temporary table adhdice_7_9_33_legacy_candidates on commit drop as
select *
from adhdice_7_9_33_legacy_only
where outcome in ('done', 'did_my_best', 'missed', 'delayed', 'complete')
  and entity_kind in ('parent', 'step', 'substep')
  and timezone is not null
  and day_start_time is not null
  and settings_revision is not null
  and settings_revision >= 1;

create temporary table adhdice_7_9_33_task_snapshots on commit drop as
select task.user_id, task.id as task_id, to_jsonb(task) as task_snapshot
from public.adhdice_clean_tasks task
where task.id in (select distinct entity_id from adhdice_7_9_33_legacy_candidates);

do $migration$
declare
  v_user_id uuid;
  v_operation_id uuid;
  v_candidate_count integer;
  v_inserted_count integer;
  v_input_fingerprint text;
  v_task_snapshot_fingerprint text;
begin
  if exists (
    select 1
    from adhdice_7_9_33_legacy_only
    where outcome not in ('done', 'did_my_best', 'missed', 'delayed', 'complete')
       or entity_kind not in ('parent', 'step', 'substep')
       or timezone is null
       or day_start_time is null
       or settings_revision is null
       or settings_revision < 1
  ) then
    raise exception 'Legacy History copy encountered an unsupported legacy-only row.' using errcode = '55000';
  end if;

  for v_user_id in
    select distinct user_id from adhdice_7_9_33_legacy_candidates order by user_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':legacy-history-copy-7.9.33', 0));

    select
      count(*),
      'md5-' || md5(coalesce(string_agg(
        source_legacy_history_id::text || ':' || entity_id::text || ':' || logical_date::text || ':' || outcome || ':' || coalesce(scheduled_due_on::text, 'null'),
        ',' order by entity_id, logical_date, source_legacy_history_id
      ), ''))
      into v_candidate_count, v_input_fingerprint
      from adhdice_7_9_33_legacy_candidates
     where user_id = v_user_id;

    select 'md5-' || md5(coalesce(string_agg(task_id::text || ':' || task_snapshot::text, ',' order by task_id), ''))
      into v_task_snapshot_fingerprint
      from adhdice_7_9_33_task_snapshots
     where user_id = v_user_id;

    insert into public.adhdice_task_migration_operations (
      user_id, entity_id, operation_kind, operation_identity, input_fingerprint,
      state, result_fingerprint, result_references, migration_version,
      classifier_version, schema_contract_version, error_code, error_message
    ) values (
      v_user_id, null, 'backfill', 'legacy-history-copy-7.9.33:' || v_user_id::text,
      v_input_fingerprint, 'started', null, '{}'::jsonb,
      'legacy-history-copy-7.9.33', 'exact-task-id-copy-v1', 'task-state-schema-v1', null, null
    )
    on conflict (user_id, operation_identity) do update
      set input_fingerprint = excluded.input_fingerprint,
          state = 'started', result_fingerprint = null, result_references = '{}'::jsonb,
          error_code = null, error_message = null, completed_at = null
    returning id into v_operation_id;

    insert into public.adhdice_task_history_facts (
      user_id, entity_id, entity_kind, logical_date, outcome, event_kind,
      occurrence_id, scheduled_due_on, effective_due_on, schedule_boundary_id,
      recurrence_source_fingerprint, provenance_kind, actor_kind, actor_id, source,
      logical_day_settings_revision, timezone, day_start_time, command_id,
      idempotence_identity, migration_operation_id, source_legacy_history_id, revision
    )
    select
      candidate.user_id, candidate.entity_id, candidate.entity_kind, candidate.logical_date,
      candidate.outcome, 'migration_reconstruction',
      null, candidate.scheduled_due_on, null, null,
      null, 'migration_reconstruction', 'migration', null, 'legacy_history_copy_7_9_33',
      candidate.settings_revision, candidate.timezone, candidate.day_start_time::time, null,
      'legacy-history-copy-7.9.33:' || candidate.source_legacy_history_id::text,
      v_operation_id, candidate.source_legacy_history_id, 1
    from adhdice_7_9_33_legacy_candidates candidate
    where candidate.user_id = v_user_id
    on conflict (user_id, entity_id, logical_date) do nothing;
    get diagnostics v_inserted_count = row_count;

    if v_inserted_count <> v_candidate_count then
      raise exception 'A canonical History conflict appeared during legacy copy; no rows were committed.' using errcode = '23505';
    end if;

    if exists (
      select 1
      from adhdice_7_9_33_legacy_candidates candidate
      join public.adhdice_task_history_facts fact
        on fact.user_id = candidate.user_id
       and fact.entity_id = candidate.entity_id
       and fact.logical_date = candidate.logical_date
      where candidate.user_id = v_user_id
        and (fact.outcome::text is distinct from candidate.outcome
          or fact.event_kind <> 'migration_reconstruction'
          or fact.scheduled_due_on is distinct from candidate.scheduled_due_on
          or fact.effective_due_on is not null
          or fact.occurrence_id is not null
          or fact.schedule_boundary_id is not null
          or fact.recurrence_source_fingerprint is not null
          or fact.provenance_kind <> 'migration_reconstruction'
          or fact.actor_kind <> 'migration'
          or fact.migration_operation_id is distinct from v_operation_id
          or fact.source_legacy_history_id is distinct from candidate.source_legacy_history_id)
    ) then
      raise exception 'A copied canonical History fact does not exactly match its legacy source.' using errcode = '55000';
    end if;

    if exists (
      select 1
      from adhdice_7_9_33_task_snapshots snapshot
      join public.adhdice_clean_tasks task
        on task.user_id = snapshot.user_id and task.id = snapshot.task_id
      where snapshot.user_id = v_user_id and to_jsonb(task) is distinct from snapshot.task_snapshot
    ) then
      raise exception 'Legacy History copy altered Task state; no rows were committed.' using errcode = '55000';
    end if;

    update public.adhdice_task_migration_operations
       set state = 'committed',
           result_fingerprint = v_input_fingerprint,
           result_references = jsonb_build_object(
             'candidate_count', v_candidate_count,
             'inserted_count', v_inserted_count,
             'task_snapshot_fingerprint', v_task_snapshot_fingerprint
           ),
           completed_at = now()
     where user_id = v_user_id and id = v_operation_id;
  end loop;
end;
$migration$;

commit;

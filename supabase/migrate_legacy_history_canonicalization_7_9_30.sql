-- ADHDice 7.9.30 forward-only legacy History canonicalization preparation.
-- SOURCE ONLY: do not apply without a reviewed preview and explicit approval.
-- Exact Task IDs are the authority. Candidate counts are always re-queried.
begin;

create temporary table adhdice_7_9_30_legacy_candidates on commit drop as
with confirmed_task_ids(task_id) as (
  values
    ('8416da45-0dec-49a2-8821-1780af3899a1'::uuid),
    ('27f7e8e5-062b-40fb-97cb-8d32ddbe8f00'::uuid),
    ('3dc5251e-eb70-4d11-95fe-f130fcbd3596'::uuid),
    ('89d9cdbf-be07-44e8-ace9-186a3bd6d372'::uuid),
    ('d9653a25-68e5-4882-8beb-855dc1d1c7eb'::uuid),
    ('b58b602d-80ad-4b7e-a17f-3fb3d5c617d2'::uuid),
    ('f9dbf05c-a4fa-46d2-8370-c7d6443afb0b'::uuid),
    ('f9b4ab17-7094-49bf-9bdc-262f4078907b'::uuid),
    ('f38746b0-c731-424c-a31a-1640252172c2'::uuid),
    ('1a5bb729-ec0e-4848-895f-0ff5af28bc15'::uuid),
    ('13f04487-30dd-4af6-be05-231ed3c285de'::uuid),
    ('df4ef91d-fcee-4411-970c-0c1cf9520ff5'::uuid)
)
select
  legacy.id as source_legacy_history_id,
  legacy.user_id,
  legacy.task_id as entity_id,
  task.entity_kind,
  legacy.entry_date as logical_date,
  legacy.status::text as outcome,
  profile.timezone,
  profile.day_start_time,
  profile.settings_revision
from confirmed_task_ids confirmed
join public.adhdice_clean_tasks task on task.id = confirmed.task_id
join public.adhdice_task_history legacy
  on legacy.task_id = task.id and legacy.user_id = task.user_id
join public.adhdice_user_profiles profile on profile.user_id = legacy.user_id
left join public.adhdice_task_history_facts fact
  on fact.user_id = legacy.user_id
 and fact.entity_id = legacy.task_id
 and fact.logical_date = legacy.entry_date
where fact.id is null
  and legacy.status::text in ('done', 'did_my_best', 'missed', 'complete')
  and task.entity_kind in ('parent', 'step', 'substep');

do $migration$
declare
  v_user_id uuid;
  v_operation_id uuid;
  v_candidate_count integer;
  v_inserted_count integer;
  v_input_fingerprint text;
begin
  if exists (
    with confirmed_task_ids(task_id) as (
      values
        ('8416da45-0dec-49a2-8821-1780af3899a1'::uuid), ('27f7e8e5-062b-40fb-97cb-8d32ddbe8f00'::uuid),
        ('3dc5251e-eb70-4d11-95fe-f130fcbd3596'::uuid), ('89d9cdbf-be07-44e8-ace9-186a3bd6d372'::uuid),
        ('d9653a25-68e5-4882-8beb-855dc1d1c7eb'::uuid), ('b58b602d-80ad-4b7e-a17f-3fb3d5c617d2'::uuid),
        ('f9dbf05c-a4fa-46d2-8370-c7d6443afb0b'::uuid), ('f9b4ab17-7094-49bf-9bdc-262f4078907b'::uuid),
        ('f38746b0-c731-424c-a31a-1640252172c2'::uuid), ('1a5bb729-ec0e-4848-895f-0ff5af28bc15'::uuid),
        ('13f04487-30dd-4af6-be05-231ed3c285de'::uuid), ('df4ef91d-fcee-4411-970c-0c1cf9520ff5'::uuid)
    )
    select 1
    from confirmed_task_ids confirmed
    join public.adhdice_clean_tasks task on task.id = confirmed.task_id
    join public.adhdice_task_history legacy on legacy.task_id = task.id and legacy.user_id = task.user_id
    left join public.adhdice_task_history_facts fact
      on fact.user_id = legacy.user_id and fact.entity_id = legacy.task_id and fact.logical_date = legacy.entry_date
    left join public.adhdice_user_profiles profile on profile.user_id = legacy.user_id
    where fact.id is null
      and (legacy.status::text not in ('done', 'did_my_best', 'missed', 'complete')
        or task.entity_kind not in ('parent', 'step', 'substep')
        or profile.user_id is null
        or profile.timezone is null
        or profile.day_start_time is null
        or profile.settings_revision is null
        or profile.settings_revision < 1)
  ) then
    raise exception 'Legacy History canonicalization encountered an unsupported legacy-only row.' using errcode = '55000';
  end if;

  for v_user_id in select distinct user_id from adhdice_7_9_30_legacy_candidates order by user_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':legacy-history-canonicalization-7.9.30', 0));
    select count(*), 'md5-' || md5(string_agg(source_legacy_history_id::text || ':' || entity_id::text || ':' || logical_date::text || ':' || outcome, ',' order by entity_id, logical_date, source_legacy_history_id))
      into v_candidate_count, v_input_fingerprint
      from adhdice_7_9_30_legacy_candidates where user_id = v_user_id;

    insert into public.adhdice_task_migration_operations (
      user_id, entity_id, operation_kind, operation_identity, input_fingerprint,
      state, result_fingerprint, result_references, migration_version,
      classifier_version, schema_contract_version, error_code, error_message
    ) values (
      v_user_id, null, 'backfill', 'legacy-history-canonicalization-7.9.30:' || v_user_id::text,
      v_input_fingerprint, 'started', null, '{}'::jsonb,
      'legacy-history-canonicalization-7.9.30', 'exact-task-id-v1', 'task-state-schema-v1', null, null
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
      candidate.outcome,
      case when candidate.outcome = 'complete' then 'terminal_complete' else 'explicit_outcome' end,
      null, null, null, null, null, 'migration_reconstruction', 'migration', null,
      'legacy_history_canonicalization_7_9_30', candidate.settings_revision,
      candidate.timezone, candidate.day_start_time, null,
      'legacy-history-canonicalization-7.9.30:' || candidate.source_legacy_history_id::text,
      v_operation_id, candidate.source_legacy_history_id, 1
    from adhdice_7_9_30_legacy_candidates candidate
    where candidate.user_id = v_user_id
    on conflict (user_id, entity_id, logical_date) do nothing;
    get diagnostics v_inserted_count = row_count;

    if exists (
      select 1 from adhdice_7_9_30_legacy_candidates candidate
      left join public.adhdice_task_history_facts fact
        on fact.user_id = candidate.user_id
       and fact.entity_id = candidate.entity_id
       and fact.logical_date = candidate.logical_date
      where candidate.user_id = v_user_id
        and (fact.id is null
          or fact.source_legacy_history_id is distinct from candidate.source_legacy_history_id
          or fact.outcome::text is distinct from candidate.outcome
          or fact.provenance_kind <> 'migration_reconstruction'
          or fact.actor_kind <> 'migration')
    ) then
      raise exception 'A canonical History conflict appeared during migration; no rows were committed.' using errcode = '23505';
    end if;

    update public.adhdice_task_migration_operations
       set state = 'committed',
           result_fingerprint = v_input_fingerprint,
           result_references = jsonb_build_object(
             'candidate_count', v_candidate_count,
             'inserted_count', v_inserted_count,
             'exact_task_id_count', 12
           ),
           completed_at = now()
     where user_id = v_user_id and id = v_operation_id;
  end loop;
end;
$migration$;

commit;

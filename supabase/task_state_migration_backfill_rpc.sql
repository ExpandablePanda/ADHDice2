-- M2 only: privileged, owner-scoped snapshot backfill write path.
--
-- This artifact is intentionally not executed by this ticket.  It owns no
-- runtime command behavior and is not a general Task patch endpoint.  The
-- TypeScript worker proves the owner with a user access token, then calls
-- these SECURITY INVOKER functions through a separately held service-role
-- credential.  The functions accept only a validated, classifier-produced
-- snapshot plan and one user/entity scope.

create or replace function public.adhdice_migration_backfill_entity(
  p_user_id uuid,
  p_lease_token uuid,
  p_lease_owner text,
  p_lease_expires_at timestamptz,
  p_plan jsonb,
  p_source_guard jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_task public.adhdice_clean_tasks%rowtype;
  v_profile public.adhdice_user_profiles%rowtype;
  v_entity_id uuid := nullif(p_plan->>'entityId', '')::uuid;
  v_operation_id uuid;
  v_existing_state text;
  v_existing_input text;
  v_existing_result jsonb;
  v_existing_entity_id uuid;
  v_boundary_id uuid;
  v_history_id uuid;
  v_source_history public.adhdice_task_history%rowtype;
  v_item jsonb;
  v_fact jsonb;
  v_issue jsonb;
  v_evidence jsonb;
  v_history_count integer;
  v_history_updated_at timestamptz;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if current_user <> 'service_role' then
    raise exception 'M2 backfill requires the service_role database role'
      using errcode = '42501';
  end if;
  if p_user_id is null or p_lease_token is null or nullif(trim(p_lease_owner), '') is null then
    raise exception 'M2 backfill requires an owner, lease token, and lease owner'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan) <> 'object' or jsonb_typeof(p_source_guard) <> 'object' then
    raise exception 'M2 backfill plan and source guard must be JSON objects'
      using errcode = '22023';
  end if;
  if p_plan->>'userId' is distinct from p_user_id::text then
    raise exception 'M2 backfill plan owner does not match the requested owner'
      using errcode = '42501';
  end if;
  if p_plan->>'migrationVersion' is distinct from 'task-state-migration-v1'
     or p_plan->>'classifierVersion' is distinct from 'task-state-classifier-v2'
     or p_plan->>'schemaContractVersion' is distinct from 'task-state-schema-v1'
     or p_plan->>'backfillVersion' is distinct from 'task-state-migration-backfill-v1'
     or p_plan->>'rewardProgramVersion' is distinct from 'task-reward-v1'
     or nullif(trim(p_plan->>'operationIdentity'), '') is null
     or nullif(trim(p_plan->>'inputFingerprint'), '') is null
     or p_source_guard->>'sourceFingerprint' is distinct from p_plan->>'inputFingerprint' then
    raise exception 'M2 backfill version contract mismatch'
      using errcode = '22023';
  end if;
  if v_entity_id is not null
     and p_plan->>'operationIdentity' not like 'm2:backfill:' || v_entity_id::text || ':%' then
    raise exception 'M2 operation identity is outside the requested Task scope'
      using errcode = '42501';
  end if;
  if v_entity_id is null
     and p_plan->>'operationIdentity' not like 'm2:orphan-history:%' then
    raise exception 'M2 orphan operation identity is invalid'
      using errcode = '42501';
  end if;

  -- Resolve the operation before locking or validating the mutable legacy
  -- Task row.  A committed replay must be a true no-op even though M2's own
  -- Task update triggers changed revision and updated_at after the first run.
  select state, input_fingerprint, result_references, id, entity_id
    into v_existing_state, v_existing_input, v_existing_result, v_operation_id, v_existing_entity_id
  from public.adhdice_task_migration_operations
  where user_id = p_user_id
    and operation_identity = p_plan->>'operationIdentity'
  for update;
  if found then
    if v_existing_entity_id is distinct from v_entity_id then
      raise exception 'operation identity is bound to a different Task scope'
        using errcode = '42501';
    end if;
    if v_existing_input is distinct from p_plan->>'inputFingerprint' then
      raise exception 'operation identity was reused with a different source fingerprint'
        using errcode = '40001';
    end if;
    if v_existing_state = 'committed' then
      return jsonb_build_object(
        'state', 'already_committed',
        'operation_id', v_operation_id,
        'result_references', coalesce(v_existing_result, '{}'::jsonb)
      );
    end if;
    if v_existing_state = 'failed_permanent' then
      raise exception 'previous M2 operation is permanently failed'
        using errcode = '55000';
    end if;
  end if;

  if p_lease_expires_at is null or p_lease_expires_at <= v_now then
    raise exception 'M2 backfill lease must expire in the future'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.adhdice_task_state_schema_contract
    where contract_key = 'canonical_task_state'
      and schema_contract_version = 'task-state-schema-v1'
  ) or not exists (
    select 1 from public.adhdice_task_state_migration_schema_contract
    where contract_key = 'migration_support'
      and schema_contract_version = 'task-state-schema-v1'
      and migration_support_version = 'task-state-migration-v1'
  ) then
    raise exception 'required Task State schema/support contract is not installed'
      using errcode = '55000';
  end if;

  if v_entity_id is not null then
    select * into v_task
    from public.adhdice_clean_tasks
    where user_id = p_user_id and id = v_entity_id
    for update;
    if not found then
      raise exception 'Task is not owned by the requested migration user'
        using errcode = '42501';
    end if;
    if jsonb_typeof(p_plan->'taskSnapshot') <> 'object'
       or p_plan->'taskSnapshot'->>'id' is distinct from v_task.id::text
       or p_plan->'taskSnapshot'->>'user_id' is distinct from p_user_id::text
       or p_plan->'taskSnapshot'->>'status' is distinct from v_task.status
       or p_plan->'taskSnapshot'->>'revision' is distinct from v_task.revision::text
       or p_plan->'taskSnapshot'->>'updated_at' is null
       or (p_plan->'taskSnapshot'->>'updated_at')::timestamptz is distinct from v_task.updated_at
       or nullif(p_plan->'taskSnapshot'->>'parent_task_id', '')::uuid is distinct from v_task.parent_task_id then
      raise exception 'M2 Task plan is not bound to the locked current Task snapshot'
        using errcode = '40001';
    end if;
    if p_source_guard->>'taskRevision' is not null
       and v_task.revision is distinct from (p_source_guard->>'taskRevision')::integer then
      raise exception 'Task source revision changed before backfill'
        using errcode = '40001';
    end if;
    if p_source_guard->>'taskUpdatedAt' is not null
       and v_task.updated_at <> (p_source_guard->>'taskUpdatedAt')::timestamptz then
      raise exception 'Task source timestamp changed before backfill'
        using errcode = '40001';
    end if;
    if v_task.parent_task_id is not null and not exists (
      select 1 from public.adhdice_clean_tasks parent_task
      where parent_task.user_id = p_user_id
        and parent_task.id = v_task.parent_task_id
    ) then
      raise exception 'Task hierarchy crosses the requested owner boundary'
        using errcode = '42501';
    end if;
    select count(*)::integer, max(updated_at)
      into v_history_count, v_history_updated_at
    from public.adhdice_task_history
    where user_id = p_user_id and task_id = v_entity_id;
    if p_source_guard->>'historyCount' is not null
       and v_history_count <> (p_source_guard->>'historyCount')::integer then
      raise exception 'Task History source changed before backfill'
        using errcode = '40001';
    end if;
    if p_source_guard->>'historyUpdatedAtMax' is not null
       and coalesce(v_history_updated_at, '-infinity'::timestamptz) <> (p_source_guard->>'historyUpdatedAtMax')::timestamptz then
      raise exception 'Task History timestamp changed before backfill'
        using errcode = '40001';
    end if;
    select * into v_profile
    from public.adhdice_user_profiles
    where user_id = p_user_id
    for share;
    if not found then
      raise exception 'Logical-day profile is missing for the migration owner'
        using errcode = '55000';
    end if;
    if p_source_guard->>'profileSettingsRevision' is not null
       and v_profile.settings_revision is distinct from (p_source_guard->>'profileSettingsRevision')::bigint then
      raise exception 'Profile logical-day settings changed before backfill'
        using errcode = '40001';
    end if;
  end if;

  insert into public.adhdice_task_state_migrations (
    user_id, migration_version, classifier_version, schema_contract_version,
    reward_program_version, state, last_successful_stage, source_fingerprint,
    snapshot_taken_at, lease_token, lease_owner, lease_acquired_at,
    lease_expires_at, counts, diagnostic_summary
  ) values (
    p_user_id, p_plan->>'migrationVersion', p_plan->>'classifierVersion',
    p_plan->>'schemaContractVersion', p_plan->>'rewardProgramVersion',
    'classified', 'M1', p_plan->>'inputFingerprint', v_now, p_lease_token,
    p_lease_owner, v_now, p_lease_expires_at, '{}'::jsonb, '{}'::jsonb
  )
  on conflict (user_id) do update set
    migration_version = excluded.migration_version,
    classifier_version = excluded.classifier_version,
    schema_contract_version = excluded.schema_contract_version,
    reward_program_version = excluded.reward_program_version,
    source_fingerprint = excluded.source_fingerprint,
    snapshot_taken_at = excluded.snapshot_taken_at,
    lease_token = excluded.lease_token,
    lease_owner = excluded.lease_owner,
    lease_acquired_at = excluded.lease_acquired_at,
    lease_expires_at = excluded.lease_expires_at
  where public.adhdice_task_state_migrations.lease_token is null
     or public.adhdice_task_state_migrations.lease_expires_at < v_now
     or (public.adhdice_task_state_migrations.lease_token = p_lease_token
       and public.adhdice_task_state_migrations.lease_owner = p_lease_owner);

  if not exists (
    select 1 from public.adhdice_task_state_migrations
    where user_id = p_user_id
      and lease_token = p_lease_token
      and lease_owner = p_lease_owner
  ) then
    raise exception 'another migration worker owns the live user lease'
      using errcode = '55P03';
  end if;

  if v_entity_id is not null
     and v_operation_id is null
     and exists (
       select 1
       from public.adhdice_clean_tasks task
       where task.user_id = p_user_id
         and task.id = v_entity_id
         and task.canonicalization_status = 'canonical_proven'
     ) then
    raise exception 'Task already has canonical facts from another M2 operation'
      using errcode = '40001';
  end if;

  if v_operation_id is null then
    insert into public.adhdice_task_migration_operations (
      user_id, entity_id, operation_kind, operation_identity,
      input_fingerprint, state, result_references, migration_version,
      classifier_version, schema_contract_version
    ) values (
      p_user_id, v_entity_id, 'backfill', p_plan->>'operationIdentity',
      p_plan->>'inputFingerprint', 'started', '{}'::jsonb,
      p_plan->>'migrationVersion', p_plan->>'classifierVersion',
      p_plan->>'schemaContractVersion'
    ) returning id into v_operation_id;
  else
    update public.adhdice_task_migration_operations
    set state = 'started', error_code = null, error_message = null,
        completed_at = null
    where user_id = p_user_id and id = v_operation_id;
  end if;

  for v_evidence in select value from jsonb_array_elements(coalesce(p_plan->'legacyHistoryEvidence', '[]'::jsonb)) loop
    if nullif(v_evidence->>'sourceHistoryId', '') is null
       or nullif(v_evidence->>'legacyEntryDate', '') is null
       or nullif(v_evidence->>'legacyStatus', '') is null
       or nullif(v_evidence->>'legacyEventType', '') is null
       or v_evidence->>'legacyCountedAsDueOccurrence' is null
       or v_evidence->>'legacyWasCompleted' is null
       or nullif(v_evidence->>'legacyCreatedAt', '') is null
       or nullif(v_evidence->>'legacyUpdatedAt', '') is null
       or jsonb_typeof(v_evidence->'sourceSnapshot') <> 'object' then
      raise exception 'legacy History evidence is missing a required source value'
        using errcode = '22023';
    end if;
    select * into v_source_history
    from public.adhdice_task_history history
    where history.id = (v_evidence->>'sourceHistoryId')::uuid
      and history.user_id = p_user_id;
    if not found then
      raise exception 'legacy History evidence is outside the requested owner scope'
        using errcode = '42501';
    end if;
    if nullif(v_evidence->>'entityId', '')::uuid is distinct from v_source_history.task_id
       or (v_evidence->>'legacyEntryDate')::date is distinct from v_source_history.entry_date
       or v_evidence->>'legacyStatus' is distinct from v_source_history.status
       or v_evidence->>'legacyEventType' is distinct from v_source_history.event_type
       or v_evidence->>'legacyOccurrenceKey' is distinct from v_source_history.occurrence_key
       or nullif(v_evidence->>'legacyOccurrenceDueOn', '')::date is distinct from v_source_history.occurrence_due_on
       or (v_evidence->>'legacyCountedAsDueOccurrence')::boolean is distinct from v_source_history.counted_as_due_occurrence
       or (v_evidence->>'legacyWasCompleted')::boolean is distinct from v_source_history.was_completed
       or (v_evidence->>'legacyCreatedAt')::timestamptz is distinct from v_source_history.created_at
       or (v_evidence->>'legacyUpdatedAt')::timestamptz is distinct from v_source_history.updated_at
       or v_evidence->'sourceSnapshot'->>'id' is distinct from v_source_history.id::text
       or v_evidence->'sourceSnapshot'->>'task_id' is distinct from v_source_history.task_id::text
       or v_evidence->'sourceSnapshot'->>'entry_date' is distinct from v_source_history.entry_date::text
       or v_evidence->'sourceSnapshot'->>'status' is distinct from v_source_history.status
       or v_evidence->'sourceSnapshot'->>'event_type' is distinct from v_source_history.event_type
       or v_evidence->'sourceSnapshot'->>'occurrence_key' is distinct from v_source_history.occurrence_key
       or nullif(v_evidence->'sourceSnapshot'->>'occurrence_due_on', '')::date is distinct from v_source_history.occurrence_due_on
       or (v_evidence->'sourceSnapshot'->>'counted_as_due_occurrence')::boolean is distinct from v_source_history.counted_as_due_occurrence
       or (v_evidence->'sourceSnapshot'->>'was_completed')::boolean is distinct from v_source_history.was_completed
       or (v_evidence->'sourceSnapshot'->>'created_at')::timestamptz is distinct from v_source_history.created_at
       or (v_evidence->'sourceSnapshot'->>'updated_at')::timestamptz is distinct from v_source_history.updated_at then
      raise exception 'legacy History evidence does not match the locked source row'
        using errcode = '40001';
    end if;
    insert into public.adhdice_task_legacy_history_evidence (
      source_history_id, user_id, entity_id, legacy_entry_date, legacy_status,
      legacy_event_type, legacy_occurrence_key, legacy_occurrence_due_on,
      legacy_counted_as_due_occurrence, legacy_was_completed, legacy_created_at,
      legacy_updated_at, source_kind, classification, confidence,
      source_operation, source_snapshot, migration_operation_id,
      migration_version, classifier_version, schema_contract_version
    ) values (
      (v_evidence->>'sourceHistoryId')::uuid, p_user_id,
      nullif(v_evidence->>'entityId', '')::uuid,
      (v_evidence->>'legacyEntryDate')::date, v_evidence->>'legacyStatus',
      v_evidence->>'legacyEventType', v_evidence->>'legacyOccurrenceKey',
      nullif(v_evidence->>'legacyOccurrenceDueOn', '')::date,
      (v_evidence->>'legacyCountedAsDueOccurrence')::boolean,
      (v_evidence->>'legacyWasCompleted')::boolean,
      (v_evidence->>'legacyCreatedAt')::timestamptz,
      (v_evidence->>'legacyUpdatedAt')::timestamptz,
      v_evidence->>'sourceKind', v_evidence->>'classification',
      v_evidence->>'confidence', v_evidence->>'sourceOperation',
      v_evidence->'sourceSnapshot', v_operation_id,
      p_plan->>'migrationVersion', p_plan->>'classifierVersion',
      p_plan->>'schemaContractVersion'
    ) on conflict (user_id, source_history_id) do update set
      entity_id = excluded.entity_id,
      legacy_entry_date = excluded.legacy_entry_date,
      legacy_status = excluded.legacy_status,
      legacy_event_type = excluded.legacy_event_type,
      legacy_occurrence_key = excluded.legacy_occurrence_key,
      legacy_occurrence_due_on = excluded.legacy_occurrence_due_on,
      legacy_counted_as_due_occurrence = excluded.legacy_counted_as_due_occurrence,
      legacy_was_completed = excluded.legacy_was_completed,
      legacy_created_at = excluded.legacy_created_at,
      legacy_updated_at = excluded.legacy_updated_at,
      classification = excluded.classification,
      confidence = excluded.confidence,
      source_operation = excluded.source_operation,
      source_snapshot = excluded.source_snapshot,
      migration_operation_id = excluded.migration_operation_id,
      migration_version = excluded.migration_version,
      classifier_version = excluded.classifier_version,
      schema_contract_version = excluded.schema_contract_version,
      updated_at = v_now;
  end loop;

  for v_issue in select value from jsonb_array_elements(coalesce(p_plan->'issues', '[]'::jsonb)) loop
    insert into public.adhdice_task_state_migration_issues (
      user_id, entity_id, category, severity, classification,
      evidence_snapshot, evidence_fingerprint, scope_identity,
      migration_version, classifier_version, schema_contract_version,
      source_operation
    ) values (
      p_user_id, v_entity_id, v_issue->>'category', v_issue->>'severity',
      v_issue->>'classification', coalesce(v_issue->'evidenceSnapshot', '{}'::jsonb),
      v_issue->>'evidenceFingerprint', v_issue->>'scopeIdentity',
      p_plan->>'migrationVersion', p_plan->>'classifierVersion',
      p_plan->>'schemaContractVersion', v_issue->>'sourceOperation'
    ) on conflict (
      user_id, scope_identity, category, evidence_fingerprint, classifier_version
    ) do update set
      severity = excluded.severity,
      classification = excluded.classification,
      evidence_snapshot = excluded.evidence_snapshot,
      source_operation = excluded.source_operation,
      updated_at = v_now;
  end loop;

  if v_entity_id is not null and coalesce((p_plan->>'ready')::boolean, false) then
    if jsonb_typeof(p_plan->'canonicalTask') <> 'object' then
      raise exception 'ready M2 plan is missing the canonical Task write'
        using errcode = '22023';
    end if;
    if jsonb_typeof(p_plan->'scheduleBoundary') <> 'object'
       and not (
         p_plan->'canonicalTask'->>'terminalState' = 'permanently_complete'
         or p_plan->'canonicalTask'->>'containerState' in ('archived', 'trashed')
       ) then
      raise exception 'active ready M2 plan is missing its schedule boundary'
        using errcode = '22023';
    end if;
    if jsonb_typeof(p_plan->'scheduleBoundary') <> 'object'
       and not exists (
         select 1
         from jsonb_array_elements(coalesce(p_plan->'issues', '[]'::jsonb)) item
         where item->>'severity' = 'warning'
           and item->>'classification' in (
             'TRASHED_SCHEDULE_REPAIR_REQUIRED_BEFORE_RESTORE',
             'INACTIVE_SCHEDULE_REPAIR_REQUIRED_BEFORE_REACTIVATION'
           )
       ) then
      raise exception 'inactive ready M2 plan without a boundary must carry an explicit schedule-repair warning'
        using errcode = '22023';
    end if;
    if jsonb_typeof(p_plan->'scheduleBoundary') = 'object'
       and (p_plan->'scheduleBoundary'->>'idempotenceIdentity' is distinct from 'm2:boundary:' || v_entity_id::text || ':1'
         or p_plan->'scheduleBoundary'->>'actorKind' is not null
            and p_plan->'scheduleBoundary'->>'actorKind' <> 'migration'
         or p_plan->'scheduleBoundary'->>'prospectiveOnly' <> 'true'
         or p_plan->'scheduleBoundary'->>'historicalScopeKnown' <> 'false'
         or p_plan->'scheduleBoundary'->>'sourceTaskRevision' is distinct from v_task.revision::text) then
      raise exception 'M2 schedule boundary is not a prospective current-snapshot boundary'
        using errcode = '22023';
    end if;
    if p_plan->'canonicalTask'->>'terminalState' is distinct from case when v_task.status = 'complete' then 'permanently_complete' else 'active' end
       or nullif(p_plan->'canonicalTask'->>'terminalCompletedAt', '')::timestamptz is distinct from case when v_task.status = 'complete' then v_task.completed_at else null end
       or p_plan->'canonicalTask'->>'containerState' is distinct from case when v_task.status = 'archived' then 'archived' when v_task.status = 'trashed' then 'trashed' else 'active' end
       or nullif(p_plan->'canonicalTask'->>'containerTrashedAt', '')::timestamptz is distinct from case when v_task.status = 'trashed' then v_task.trashed_at else null end
       or nullif(p_plan->'canonicalTask'->>'priorContainerState', '') is distinct from case when v_task.status = 'trashed' then v_task.prior_container_state else null end
       or p_plan->'canonicalTask'->>'priorContainerStateStatus' is distinct from case when v_task.status <> 'trashed' then 'not_applicable' when v_task.prior_container_state is null then 'unknown' else 'proven' end then
      raise exception 'M2 canonical Task plan is not bound to current terminal/container state'
        using errcode = '40001';
    end if;
    if jsonb_typeof(p_plan->'scheduleBoundary') = 'object'
       and (p_plan->'scheduleBoundary'->>'scheduleModel' is distinct from case
      when v_task.repeat_frequency = 'none' and v_task.due_on is null then 'unscheduled'
      when v_task.repeat_frequency = 'none' and v_task.due_on is not null then 'one_time'
      when v_task.repeat_frequency in ('daily', 'custom', 'daily_until_complete') then 'rolling'
      when v_task.repeat_frequency in ('weekly', 'monthly') then 'fixed'
      else 'ambiguous'
    end
       or p_plan->'scheduleBoundary'->>'repeatFrequency' is distinct from case when v_task.repeat_frequency in ('none') then 'none' else v_task.repeat_frequency end
       or (p_plan->'scheduleBoundary'->>'repeatInterval')::integer is distinct from coalesce(v_task.repeat_interval, 1)
       or nullif(p_plan->'scheduleBoundary'->>'oneTimeDueOn', '')::date is distinct from case when v_task.repeat_frequency = 'none' then v_task.due_on else null end
       or nullif(p_plan->'scheduleBoundary'->>'anchorDate', '')::date is distinct from case when v_task.repeat_frequency <> 'none' then v_task.due_on else null end
       or nullif(p_plan->'scheduleBoundary'->>'dueTime', '')::time is distinct from v_task.due_time) then
      raise exception 'M2 schedule boundary is not bound to the current Task schedule configuration'
        using errcode = '40001';
    end if;
    if v_task.status <> 'in_progress'
       and (p_plan->'canonicalTask'->>'workflowState' <> 'none'
         or nullif(p_plan->'canonicalTask'->>'workflowStartedAt', '') is not null
         or nullif(p_plan->'canonicalTask'->>'workflowLogicalDate', '') is not null
         or nullif(p_plan->'canonicalTask'->>'workflowOccurrenceId', '') is not null
         or nullif(p_plan->'canonicalTask'->>'workflowCommandId', '') is not null) then
      raise exception 'M2 workflow provenance cannot be fabricated for a non-In Progress Task'
        using errcode = '40001';
    end if;
    if v_task.status = 'in_progress'
       and (p_plan->'canonicalTask'->>'workflowState' <> 'in_progress'
         or nullif(p_plan->'canonicalTask'->>'workflowLogicalDate', '')::date is distinct from v_task.workflow_logical_date
         or nullif(p_plan->'canonicalTask'->>'workflowStartedAt', '')::timestamptz is distinct from v_task.workflow_started_at
         or nullif(p_plan->'canonicalTask'->>'workflowCommandId', '')::uuid is distinct from v_task.workflow_command_id) then
      raise exception 'M2 In Progress plan is not bound to current canonical workflow references'
        using errcode = '40001';
    end if;
    if jsonb_typeof(p_plan->'scheduleBoundary') = 'object' then
      select id into v_boundary_id
      from public.adhdice_task_schedule_boundaries
      where user_id = p_user_id and entity_id = v_entity_id and boundary_sequence = 1;
      if found then
        if not exists (
          select 1 from public.adhdice_task_schedule_boundaries
          where user_id = p_user_id and id = v_boundary_id
            and idempotence_identity = p_plan->'scheduleBoundary'->>'idempotenceIdentity'
        ) then
          raise exception 'initial schedule boundary already exists with a different identity'
            using errcode = '40001';
        end if;
      else
        insert into public.adhdice_task_schedule_boundaries (
        user_id, entity_id, entity_kind, effective_from_logical_date,
        boundary_sequence, boundary_type, schedule_model, repeat_frequency,
        repeat_interval, repeat_days_of_week, repeat_day_of_month,
        repeat_monthly_mode, repeat_monthly_ordinal, repeat_monthly_weekday,
        one_time_due_on, due_time, anchor_date, anchor_kind, anchor_confidence,
        historical_scope_known, prospective_only, logical_day_settings_revision,
        timezone, day_start_time, actor_kind, actor_id, source, idempotence_identity,
        migration_operation_id, migration_version, classifier_version,
        schema_contract_version, source_task_revision
        ) values (
        p_user_id, v_entity_id, p_plan->'canonicalTask'->>'entityKind',
        (p_plan->'scheduleBoundary'->>'effectiveFromLogicalDate')::date, 1,
        'initial', p_plan->'scheduleBoundary'->>'scheduleModel',
        p_plan->'scheduleBoundary'->>'repeatFrequency',
        (p_plan->'scheduleBoundary'->>'repeatInterval')::integer,
        array(select jsonb_array_elements_text(p_plan->'scheduleBoundary'->'repeatDaysOfWeek'))::smallint[],
        nullif(p_plan->'scheduleBoundary'->>'repeatDayOfMonth', '')::integer,
        p_plan->'scheduleBoundary'->>'repeatMonthlyMode',
        nullif(p_plan->'scheduleBoundary'->>'repeatMonthlyOrdinal', ''),
        nullif(p_plan->'scheduleBoundary'->>'repeatMonthlyWeekday', '')::smallint,
        nullif(p_plan->'scheduleBoundary'->>'oneTimeDueOn', '')::date,
        nullif(p_plan->'scheduleBoundary'->>'dueTime', '')::time,
        nullif(p_plan->'scheduleBoundary'->>'anchorDate', '')::date,
        p_plan->'scheduleBoundary'->>'anchorKind',
        p_plan->'scheduleBoundary'->>'anchorConfidence',
        false, true, v_profile.settings_revision, v_profile.timezone,
        v_profile.day_start_time::time, 'migration', null,
        'task-state-migration-backfill',
        p_plan->'scheduleBoundary'->>'idempotenceIdentity', v_operation_id,
        p_plan->>'migrationVersion', p_plan->>'classifierVersion',
        p_plan->>'schemaContractVersion',
        nullif(p_plan->'scheduleBoundary'->>'sourceTaskRevision', '')::bigint
        ) returning id into v_boundary_id;
      end if;
    end if;

    if p_plan->'canonicalTask'->>'workflowState' = 'in_progress' then
      if not exists (
        select 1 from public.adhdice_task_command_operations
        where user_id = p_user_id
          and command_id = (p_plan->'canonicalTask'->>'workflowCommandId')::uuid
      ) then
        raise exception 'current In Progress state references no canonical command'
          using errcode = '55000';
      end if;
      if nullif(p_plan->'canonicalTask'->>'workflowOccurrenceId', '') is not null
         and not exists (
           select 1 from public.adhdice_task_occurrences
           where user_id = p_user_id
             and id = (p_plan->'canonicalTask'->>'workflowOccurrenceId')::uuid
         ) then
        raise exception 'current In Progress state references no canonical occurrence'
          using errcode = '55000';
      end if;
    end if;

    update public.adhdice_clean_tasks
    set canonicalization_status = 'canonical_proven',
        entity_kind = p_plan->'canonicalTask'->>'entityKind',
        terminal_state = p_plan->'canonicalTask'->>'terminalState',
        container_state = p_plan->'canonicalTask'->>'containerState',
        prior_container_state = nullif(p_plan->'canonicalTask'->>'priorContainerState', ''),
        prior_container_state_status = p_plan->'canonicalTask'->>'priorContainerStateStatus',
        terminal_completed_at = nullif(p_plan->'canonicalTask'->>'terminalCompletedAt', '')::timestamptz,
        container_trashed_at = nullif(p_plan->'canonicalTask'->>'containerTrashedAt', '')::timestamptz,
        workflow_state = p_plan->'canonicalTask'->>'workflowState',
        workflow_started_at = nullif(p_plan->'canonicalTask'->>'workflowStartedAt', '')::timestamptz,
        workflow_logical_date = nullif(p_plan->'canonicalTask'->>'workflowLogicalDate', '')::date,
        workflow_occurrence_id = nullif(p_plan->'canonicalTask'->>'workflowOccurrenceId', '')::uuid,
        workflow_command_id = nullif(p_plan->'canonicalTask'->>'workflowCommandId', '')::uuid,
        workflow_revision = 1,
        canonical_revision = 1,
        canonical_created_at = (p_plan->'canonicalTask'->>'canonicalCreatedAt')::timestamptz,
        canonical_updated_at = (p_plan->'canonicalTask'->>'canonicalUpdatedAt')::timestamptz
    where user_id = p_user_id and id = v_entity_id;

  for v_fact in select value from jsonb_array_elements(coalesce(p_plan->'currentDayHistoryFacts', '[]'::jsonb)) loop
      if v_fact->>'outcome' not in ('done', 'did_my_best')
         or v_fact->>'logicalDate' is distinct from p_plan->>'logicalDate'
         or v_fact->>'logicalDate' !~ '^\d{4}-\d{2}-\d{2}$'
         or (
           nullif(v_fact->>'sourceLegacyHistoryId', '') is null
           and (
             v_task.status is distinct from v_fact->>'outcome'
             or v_task.active_status_logical_date is distinct from (v_fact->>'logicalDate')::date
           )
         ) then
        raise exception 'current-day History fact is not bound to the locked handled Task state'
          using errcode = '40001';
      end if;
      if nullif(v_fact->>'sourceLegacyHistoryId', '') is not null and not exists (
        select 1
        from public.adhdice_task_history history
        where history.id = (v_fact->>'sourceLegacyHistoryId')::uuid
          and history.user_id = p_user_id
          and history.task_id = v_entity_id
          and history.entry_date = (v_fact->>'logicalDate')::date
          and history.status = v_fact->>'outcome'
      ) then
        raise exception 'current-day History fact source evidence is not bound to the requested owner, Task, date, and outcome'
          using errcode = '42501';
      end if;
      select id into v_history_id
      from public.adhdice_task_history_facts
      where user_id = p_user_id and entity_id = v_entity_id
        and logical_date = (v_fact->>'logicalDate')::date;
      if found then
        if not exists (
          select 1 from public.adhdice_task_history_facts
          where user_id = p_user_id and id = v_history_id
            and migration_operation_id = v_operation_id
            and idempotence_identity = v_fact->>'idempotenceIdentity'
        ) then
      raise exception 'current-day canonical History already exists with a different identity'
        using errcode = '40001';
      end if;
    else
      insert into public.adhdice_task_history_facts (
          user_id, entity_id, entity_kind, logical_date, outcome, event_kind,
          schedule_boundary_id, recurrence_source_fingerprint, provenance_kind,
          actor_kind, source, logical_day_settings_revision, timezone,
          day_start_time, idempotence_identity, migration_operation_id,
          source_legacy_history_id
        ) values (
          p_user_id, v_entity_id, p_plan->'canonicalTask'->>'entityKind',
          (v_fact->>'logicalDate')::date, v_fact->>'outcome', 'explicit_outcome',
          v_boundary_id, p_plan->>'inputFingerprint', 'migration_reconstruction',
          'migration', 'task-state-migration-current-day', v_profile.settings_revision,
          v_profile.timezone, v_profile.day_start_time::time,
          v_fact->>'idempotenceIdentity', v_operation_id,
          nullif(v_fact->>'sourceLegacyHistoryId', '')::uuid
        ) returning id into v_history_id;
      end if;
    end loop;
  else
    if v_entity_id is not null and exists (
      select 1 from public.adhdice_clean_tasks
      where user_id = p_user_id and id = v_entity_id
        and canonicalization_status = 'canonical_proven'
    ) then
      raise exception 'a previously proven Task cannot be downgraded by an unresolved source snapshot'
        using errcode = '40001';
    end if;
    if v_entity_id is not null then
      update public.adhdice_clean_tasks
      set canonicalization_status = 'needs_attention'
      where user_id = p_user_id and id = v_entity_id
        and canonicalization_status <> 'canonical_proven';
    end if;
  end if;

  if v_entity_id is not null then
    insert into public.adhdice_task_state_migration_entities (
      user_id, entity_id, entity_kind, state, migration_version,
      classifier_version, schema_contract_version, source_revision,
      source_fingerprint, canonical_revision, blocking_issue_count,
      classification, stage_counts, last_successful_stage, forward_only_at,
      last_operation_id
    ) values (
      p_user_id, v_entity_id, coalesce(p_plan->'classification', '{}'::jsonb)->>'entityKind',
      case when coalesce((p_plan->>'ready')::boolean, false) then 'canonical_backfilled' else 'needs_attention' end,
      p_plan->>'migrationVersion', p_plan->>'classifierVersion',
      p_plan->>'schemaContractVersion',
      nullif(p_plan->'sourceGuard'->>'taskRevision', '')::bigint,
      p_plan->>'inputFingerprint',
      case when coalesce((p_plan->>'ready')::boolean, false) then 1 else null end,
      (select count(*)::integer from jsonb_array_elements(coalesce(p_plan->'issues', '[]'::jsonb)) item where item->>'severity' = 'blocking'),
      coalesce(p_plan->'classification', '{}'::jsonb),
      coalesce(p_plan->'stageCounts', '{}'::jsonb),
      case when coalesce((p_plan->>'ready')::boolean, false) then 'M2' else null end,
      case when coalesce((p_plan->>'ready')::boolean, false) then v_now else null end,
      v_operation_id
    ) on conflict (user_id, entity_id) do update set
      entity_kind = excluded.entity_kind,
      state = excluded.state,
      migration_version = excluded.migration_version,
      classifier_version = excluded.classifier_version,
      schema_contract_version = excluded.schema_contract_version,
      source_revision = excluded.source_revision,
      source_fingerprint = excluded.source_fingerprint,
      canonical_revision = excluded.canonical_revision,
      blocking_issue_count = excluded.blocking_issue_count,
      classification = excluded.classification,
      stage_counts = excluded.stage_counts,
      last_successful_stage = excluded.last_successful_stage,
      forward_only_at = excluded.forward_only_at,
      last_operation_id = excluded.last_operation_id,
      updated_at = v_now;
  end if;

  v_result := jsonb_build_object(
    'state', 'committed',
    'operation_id', v_operation_id,
    'entity_id', v_entity_id,
    'required_writes_complete', coalesce((p_plan->>'ready')::boolean, false),
    'boundary_id', v_boundary_id,
    'history_fact_id', v_history_id,
    'legacy_history_evidence_count', jsonb_array_length(coalesce(p_plan->'legacyHistoryEvidence', '[]'::jsonb)),
    'occurrence_count', 0,
    'delay_override_count', 0,
    'reward_object_count', 0
  );
  update public.adhdice_task_migration_operations
  set state = 'committed', result_fingerprint = p_plan->>'inputFingerprint',
      result_references = v_result, completed_at = v_now
  where user_id = p_user_id and id = v_operation_id;
  return v_result;
end;
$function$;

create or replace function public.adhdice_migration_finalize_user(
  p_user_id uuid,
  p_lease_token uuid,
  p_lease_owner text,
  p_source_fingerprint text,
  p_state text,
  p_counts jsonb,
  p_diagnostic_summary jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_migration public.adhdice_task_state_migrations%rowtype;
  v_missing_entities integer;
  v_missing_boundaries integer;
  v_now timestamptz := clock_timestamp();
begin
  if current_user <> 'service_role' then
    raise exception 'M2 finalization requires the service_role database role'
      using errcode = '42501';
  end if;
  if p_state not in ('canonical_backfilled', 'needs_attention')
     or nullif(trim(p_source_fingerprint), '') is null
     or jsonb_typeof(p_counts) <> 'object'
     or jsonb_typeof(p_diagnostic_summary) <> 'object' then
    raise exception 'invalid M2 finalization contract'
      using errcode = '22023';
  end if;
  select * into v_migration
  from public.adhdice_task_state_migrations
  where user_id = p_user_id
  for update;
  if not found or v_migration.lease_token <> p_lease_token or v_migration.lease_owner <> p_lease_owner then
    raise exception 'M2 finalization lease is not owned by this worker'
      using errcode = '55P03';
  end if;
  if v_migration.lease_expires_at is null or v_migration.lease_expires_at <= v_now then
    raise exception 'M2 finalization lease has expired'
      using errcode = '55P03';
  end if;
  select count(*)::integer into v_missing_entities
  from public.adhdice_clean_tasks task
  where task.user_id = p_user_id
    and not exists (
      select 1 from public.adhdice_task_state_migration_entities entity
      where entity.user_id = p_user_id and entity.entity_id = task.id
    );
  if v_missing_entities > 0 then
    raise exception 'M2 finalization is missing migration entity markers: %', v_missing_entities
      using errcode = '55000';
  end if;
  select count(*)::integer into v_missing_boundaries
  from public.adhdice_clean_tasks task
  where task.user_id = p_user_id
    and task.canonicalization_status = 'canonical_proven'
    and task.terminal_state <> 'permanently_complete'
    and task.container_state not in ('archived', 'trashed')
    and not exists (
      select 1 from public.adhdice_task_schedule_boundaries boundary
      where boundary.user_id = p_user_id and boundary.entity_id = task.id
    );
  if v_missing_boundaries > 0 then
    raise exception 'M2 finalization is missing canonical schedule boundaries: %', v_missing_boundaries
      using errcode = '55000';
  end if;
  update public.adhdice_task_state_migrations
  set state = p_state,
      last_successful_stage = 'M2',
      source_fingerprint = p_source_fingerprint,
      counts = p_counts,
      diagnostic_summary = p_diagnostic_summary,
      forward_only_at = case when p_state = 'canonical_backfilled' then v_now else null end,
      lease_token = null,
      lease_owner = null,
      lease_acquired_at = null,
      lease_expires_at = null,
      updated_at = v_now
  where user_id = p_user_id;
  return jsonb_build_object('state', p_state, 'user_id', p_user_id, 'last_successful_stage', 'M2');
end;
$function$;

revoke all on function public.adhdice_migration_backfill_entity(uuid, uuid, text, timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.adhdice_migration_backfill_entity(uuid, uuid, text, timestamptz, jsonb, jsonb)
  to service_role;

revoke all on function public.adhdice_migration_finalize_user(uuid, uuid, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.adhdice_migration_finalize_user(uuid, uuid, text, text, text, jsonb, jsonb)
  to service_role;

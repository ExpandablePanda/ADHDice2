-- M2/M3 read-only verification contract.
--
-- Run this artifact with a read-only database connection after the bounded
-- backfill.  It intentionally contains no INSERT, UPDATE, DELETE, DDL, RPC,
-- or transaction-control statement.  Every row is a clear PASS/FAIL result;
-- any non-zero violation_count blocks migration-stage completion.

with checks as (
  select
    'no_cross_user_canonical_relationships'::text as check_name,
    case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
    count(*)::bigint as violation_count,
    'canonical child rows must reference a Task owned by the same user'::text as details
  from (
    select boundary.id
    from public.adhdice_task_schedule_boundaries boundary
    left join public.adhdice_clean_tasks task
      on task.user_id = boundary.user_id and task.id = boundary.entity_id
    where task.id is null
    union all
    select occurrence.id
    from public.adhdice_task_occurrences occurrence
    left join public.adhdice_clean_tasks task
      on task.user_id = occurrence.user_id and task.id = occurrence.entity_id
    where task.id is null
    union all
    select fact.id
    from public.adhdice_task_history_facts fact
    left join public.adhdice_clean_tasks task
      on task.user_id = fact.user_id and task.id = fact.entity_id
    where task.id is null
    union all
    select entity.entity_id
    from public.adhdice_task_state_migration_entities entity
    left join public.adhdice_clean_tasks task
      on task.user_id = entity.user_id and task.id = entity.entity_id
    where task.id is null
  ) violations

  union all
  select 'no_duplicate_schedule_boundary_identity', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'one boundary sequence is allowed per owner/entity'::text
  from (
    select user_id::text, entity_id::text, boundary_sequence::text
    from public.adhdice_task_schedule_boundaries
    group by user_id, entity_id, boundary_sequence
    having count(*) > 1
    union all
    select user_id::text, idempotence_identity, null::text
    from public.adhdice_task_schedule_boundaries
    group by user_id, idempotence_identity
    having count(*) > 1
  ) violations

  union all
  select 'no_duplicate_canonical_history_entity_date', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'canonical History is unique by owner/entity/logical date'::text
  from (
    select user_id, entity_id, logical_date
    from public.adhdice_task_history_facts
    group by user_id, entity_id, logical_date
    having count(*) > 1
  ) violations

  union all
  select 'no_duplicate_occurrence_natural_key', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'occurrences are unique by owner/entity/scheduled date and occurrence key'::text
  from (
    select user_id, entity_id::text || ':' || scheduled_due_on::text as natural_key
    from public.adhdice_task_occurrences
    group by user_id, entity_id, scheduled_due_on
    having count(*) > 1
    union all
    select user_id, occurrence_key as natural_key
    from public.adhdice_task_occurrences
    group by user_id, occurrence_key
    having count(*) > 1
  ) violations

  union all
  select 'no_migration_automatic_missed_reconstruction', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'migration must not create a canonical Missed fact'::text
  from public.adhdice_task_history_facts fact
  where fact.provenance_kind = 'migration_reconstruction'
    and fact.outcome = 'missed'

  union all
  select 'no_migration_reward_objects', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'M2 creates no migration reward entitlement, grant, or claim consumption'::text
  from (
    select entitlement.id
    from public.adhdice_task_reward_entitlements entitlement
    where entitlement.migration_operation_id is not null
    union all
    select grant_row.id
    from public.adhdice_task_reward_grants grant_row
    join public.adhdice_task_reward_entitlements entitlement
      on entitlement.user_id = grant_row.user_id and entitlement.id = grant_row.entitlement_id
    where entitlement.migration_operation_id is not null
    union all
    select consumption.id
    from public.adhdice_task_reward_claim_consumptions consumption
    join public.adhdice_task_reward_grants grant_row
      on grant_row.user_id = consumption.user_id and grant_row.id = consumption.grant_id
    join public.adhdice_task_reward_entitlements entitlement
      on entitlement.user_id = grant_row.user_id and entitlement.id = grant_row.entitlement_id
    where entitlement.migration_operation_id is not null
  ) violations

  union all
  select 'no_migration_reward_operation_counts', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'every committed M2 operation must report zero reward objects'::text
  from public.adhdice_task_migration_operations operation
  where operation.operation_kind = 'backfill'
    and operation.state = 'committed'
    and coalesce((operation.result_references->>'reward_object_count')::integer, 0) <> 0

  union all
  select 'canonical_proven_tasks_have_complete_semantics', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'canonical_proven rows must satisfy the required Task semantic set'::text
  from public.adhdice_clean_tasks task
  where task.canonicalization_status = 'canonical_proven'
    and (
      task.entity_kind is null or task.terminal_state is null or task.container_state is null
      or task.prior_container_state_status is null or task.workflow_state is null
      or task.workflow_revision is null or task.canonical_revision is null
      or task.canonical_created_at is null or task.canonical_updated_at is null
      or (task.terminal_state = 'permanently_complete' and task.terminal_completed_at is null)
      or (task.terminal_state = 'active' and task.terminal_completed_at is not null)
      or (task.container_state = 'trashed' and task.container_trashed_at is null)
      or (task.container_state <> 'trashed' and task.container_trashed_at is not null)
      or (task.workflow_state = 'in_progress' and (task.workflow_started_at is null or task.workflow_logical_date is null or task.workflow_command_id is null))
      or (task.workflow_state = 'none' and (task.workflow_started_at is not null or task.workflow_logical_date is not null or task.workflow_occurrence_id is not null or task.workflow_command_id is not null))
    )

  union all
  select 'canonical_proven_tasks_have_migration_provenance', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'every canonical Task must have a committed M2 operation and entity marker'::text
  from public.adhdice_clean_tasks task
  left join public.adhdice_task_state_migration_entities entity
    on entity.user_id = task.user_id and entity.entity_id = task.id
  left join public.adhdice_task_migration_operations operation
    on operation.user_id = entity.user_id and operation.id = entity.last_operation_id
  where task.canonicalization_status = 'canonical_proven'
    and (coalesce(entity.state, '') <> 'canonical_backfilled' or entity.source_fingerprint is null or coalesce(operation.state, '') <> 'committed')

  union all
  select 'no_canonical_task_with_unresolved_required_state', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'needs-attention Tasks cannot be marked canonical_proven'::text
  from public.adhdice_clean_tasks task
  left join public.adhdice_task_state_migration_entities entity
    on entity.user_id = task.user_id and entity.entity_id = task.id
  where task.canonicalization_status = 'canonical_proven'
    and (coalesce(entity.state, '') = 'needs_attention' or coalesce(entity.blocking_issue_count, 0) > 0)

  union all
  select 'legacy_history_source_identity_preserved', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'every owner-scoped legacy History source row must have evidence'::text
  from public.adhdice_task_history history
  left join public.adhdice_task_legacy_history_evidence evidence
    on evidence.user_id = history.user_id and evidence.source_history_id = history.id
  where evidence.id is null

  union all
  select 'owner_history_exclusions_have_no_canonical_reconstruction', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'excluded legacy History remains evidence only'::text
  from public.adhdice_task_history_facts fact
  join public.adhdice_task_state_migration_entities entity
    on entity.user_id = fact.user_id and entity.entity_id = fact.entity_id
  where entity.classification->>'historyDisposition' = 'owner_approved_excluded'
    and fact.provenance_kind = 'migration_reconstruction'

  union all
  select 'migration_boundaries_are_prospective', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'M2 boundaries must not claim historical schedule authority'::text
  from public.adhdice_task_schedule_boundaries boundary
  where boundary.actor_kind = 'migration'
    and (boundary.historical_scope_known or not boundary.prospective_only)

  union all
  select 'task_entity_identity_count_unchanged', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'every current owner Task must have exactly one migration entity marker'::text
  from public.adhdice_clean_tasks task
  left join public.adhdice_task_state_migration_entities entity
    on entity.user_id = task.user_id and entity.entity_id = task.id
  where entity.entity_id is null

  union all
  select 'source_fingerprints_reconcile_stage_markers', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'M2 state/entity markers require non-null fingerprints and M2 stage'::text
  from (
    select user_id from public.adhdice_task_state_migrations
    where state = 'canonical_backfilled' and source_fingerprint is null
    union all
    select user_id from public.adhdice_task_state_migration_entities
    where state = 'canonical_backfilled' and (source_fingerprint is null or last_successful_stage <> 'M2')
    union all
    select entity.user_id
    from public.adhdice_task_state_migration_entities entity
    left join public.adhdice_task_migration_operations operation
      on operation.user_id = entity.user_id and operation.id = entity.last_operation_id
    where entity.state = 'canonical_backfilled'
      and (operation.input_fingerprint is distinct from entity.source_fingerprint
        or operation.result_fingerprint is distinct from entity.source_fingerprint)
  ) violations

  union all
  select 'committed_operations_have_required_writes', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*)::bigint,
    'a committed operation may not claim writes that are absent'::text
  from public.adhdice_task_migration_operations operation
  left join public.adhdice_clean_tasks task
    on task.user_id = operation.user_id and task.id = operation.entity_id
  left join public.adhdice_task_schedule_boundaries boundary
    on boundary.user_id = operation.user_id and boundary.entity_id = operation.entity_id
  where operation.operation_kind = 'backfill'
    and operation.state = 'committed'
    and operation.result_references->>'required_writes_complete' = 'true'
    and (task.canonicalization_status <> 'canonical_proven' or boundary.id is null)
)
select check_name, result, violation_count, details
from checks
order by check_name;

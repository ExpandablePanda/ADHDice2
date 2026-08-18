-- ADHDice 7.9.34 read-only post-initialization verifier.
-- Every *_violations count should be zero after authorized execution.

with active_legacy as (
  select task.user_id, task.id as task_id
  from public.adhdice_clean_tasks task
  where task.canonicalization_status = 'legacy_uninitialized'
    and task.status::text not in ('complete', 'archived', 'trashed')
), canonical_active as (
  select task.*
  from public.adhdice_clean_tasks task
  where task.canonicalization_status in ('canonical_proven', 'canonical_runtime')
    and task.terminal_state = 'active'
    and task.container_state = 'active'
), initialized_operations as (
  select operation.*
  from public.adhdice_task_migration_operations operation
  where operation.migration_version = 'task-state-initialization-7.9.34'
), initialized_tasks as (
  select task.*
  from public.adhdice_clean_tasks task
  join initialized_operations operation
    on operation.user_id = task.user_id
   and operation.entity_id = task.id
), migration_boundaries as (
  select
    task.repeat_frequency::text as raw_repeat_frequency,
    task.due_on,
    task.repeat_interval as raw_repeat_interval,
    task.repeat_days_of_week as raw_repeat_days_of_week,
    task.repeat_day_of_month as raw_repeat_day_of_month,
    task.repeat_monthly_mode::text as raw_repeat_monthly_mode,
    task.repeat_monthly_ordinal::text as raw_repeat_monthly_ordinal,
    task.repeat_monthly_weekday as raw_repeat_monthly_weekday,
    boundary.*
  from public.adhdice_clean_tasks task
  join initialized_operations operation on operation.user_id = task.user_id and operation.entity_id = task.id
  join public.adhdice_task_schedule_boundaries boundary
    on boundary.user_id = task.user_id
   and boundary.entity_id = task.id
   and boundary.migration_operation_id = operation.id
), schedule_translation as (
  select count(*) filter (where coalesce(not (
    (schedule_model = 'unscheduled' and raw_repeat_frequency = 'none' and due_on is null
      and repeat_frequency = 'none' and repeat_interval = 1 and repeat_days_of_week = '{}'::smallint[]
      and repeat_day_of_month is null and one_time_due_on is null and anchor_date is null)
    or (schedule_model = 'one_time' and raw_repeat_frequency = 'none' and due_on is not null
      and repeat_frequency = 'none' and repeat_interval = 1 and repeat_days_of_week = '{}'
      and one_time_due_on = due_on and anchor_date is null)
    or (schedule_model = 'rolling' and raw_repeat_frequency in ('daily', 'custom', 'daily_until_complete')
      and repeat_frequency = raw_repeat_frequency and repeat_interval = raw_repeat_interval
      and repeat_days_of_week = '{}'::smallint[] and repeat_day_of_month is null
      and one_time_due_on is null and anchor_date is not distinct from due_on)
    or (schedule_model = 'fixed' and raw_repeat_frequency = 'weekly'
      and repeat_frequency = 'weekly' and repeat_interval = raw_repeat_interval
      and repeat_days_of_week = case when coalesce(cardinality(raw_repeat_days_of_week), 0) = 0
        then array[extract(dow from due_on)::smallint] else raw_repeat_days_of_week end
      and repeat_day_of_month is null and one_time_due_on is null and anchor_date is not distinct from due_on)
    or (schedule_model = 'fixed' and raw_repeat_frequency = 'monthly'
      and repeat_frequency = 'monthly' and repeat_interval = raw_repeat_interval
      and repeat_days_of_week = '{}'::smallint[]
      and repeat_monthly_mode = coalesce(raw_repeat_monthly_mode, 'day_of_month')
      and repeat_day_of_month is not distinct from case when coalesce(raw_repeat_monthly_mode, 'day_of_month') = 'day_of_month'
        then coalesce(raw_repeat_day_of_month, extract(day from due_on)::integer) else null end
      and repeat_monthly_ordinal is not distinct from case when raw_repeat_monthly_mode = 'ordinal_weekday'
        then raw_repeat_monthly_ordinal else null end
      and repeat_monthly_weekday is not distinct from case when raw_repeat_monthly_mode = 'ordinal_weekday'
        then raw_repeat_monthly_weekday else null end
      and one_time_due_on is null and anchor_date is not distinct from due_on)
  ), true)) as current_schedule_translation_violations
  from migration_boundaries
), metrics as (
  select
    (select count(*) from active_legacy) as remaining_active_legacy_uninitialized_violations,
    (select count(*) from canonical_active task
      where not exists (
        select 1 from public.adhdice_task_schedule_boundaries boundary
        where boundary.user_id = task.user_id and boundary.entity_id = task.id
      )) as active_canonical_missing_boundary_violations,
    (select count(*) from initialized_tasks task
      where task.canonicalization_status <> 'canonical_proven'
         or task.entity_kind is null
         or task.terminal_state <> 'active'
         or task.container_state <> 'active'
         or task.workflow_state <> 'none'
         or task.workflow_started_at is not null
         or task.workflow_logical_date is not null
         or task.workflow_occurrence_id is not null
         or task.workflow_command_id is not null
         or task.workflow_revision <> 1
         or task.canonical_revision <> 1) as initialized_canonical_semantics_violations,
    (select count(*) from public.adhdice_task_schedule_boundaries boundary
      join initialized_operations operation on operation.user_id = boundary.user_id and operation.id = boundary.migration_operation_id
      where boundary.actor_kind <> 'migration'
         or boundary.source <> 'task_state_canonical_initialization_7_9_34'
         or boundary.migration_version <> 'task-state-initialization-7.9.34'
         or boundary.classifier_version <> 'current-task-schedule-v1'
         or boundary.schema_contract_version <> 'task-state-schema-v1'
         or boundary.historical_scope_known
         or not boundary.prospective_only
         or boundary.boundary_sequence <> 1
         or boundary.boundary_type <> 'initial'
         or boundary.prior_boundary_id is not null
         or boundary.affected_occurrence_id is not null) as boundary_provenance_violations,
    (select count(*) from initialized_operations operation where operation.state <> 'committed') as uncommitted_operation_violations,
    (select current_schedule_translation_violations from schedule_translation) as current_schedule_translation_violations,
    (select count(*) from initialized_operations operation
      where coalesce((operation.result_references->>'history_rows_created')::integer, -1) <> 0
         or coalesce((operation.result_references->>'occurrence_rows_created')::integer, -1) <> 0
         or coalesce((operation.result_references->>'calendar_override_rows_created')::integer, -1) <> 0
         or coalesce((operation.result_references->>'reward_rows_created')::integer, -1) <> 0) as operation_side_effect_violations,
    (select count(*) from public.adhdice_task_history_facts fact
      join initialized_operations operation on operation.user_id = fact.user_id and operation.id = fact.migration_operation_id) as migration_history_violations,
    (select count(*) from public.adhdice_task_occurrences occurrence
      join initialized_operations operation on operation.user_id = occurrence.user_id and operation.id = occurrence.migration_operation_id) as migration_occurrence_violations,
    (select count(*) from public.adhdice_task_calendar_overrides override
      join initialized_operations operation on operation.user_id = override.user_id and operation.id = override.migration_operation_id) as migration_calendar_override_violations,
    (select count(*) from public.adhdice_task_reward_entitlements reward
      join initialized_operations operation on operation.user_id = reward.user_id and operation.id = reward.migration_operation_id) as migration_reward_violations
)
select metrics.*,
  case when remaining_active_legacy_uninitialized_violations = 0
    and active_canonical_missing_boundary_violations = 0
    and initialized_canonical_semantics_violations = 0
    and boundary_provenance_violations = 0
    and uncommitted_operation_violations = 0
    and current_schedule_translation_violations = 0
    and operation_side_effect_violations = 0
    and migration_history_violations = 0
    and migration_occurrence_violations = 0
    and migration_calendar_override_violations = 0
    and migration_reward_violations = 0
    then 'PASS' else 'FAIL' end as overall_status
from metrics;

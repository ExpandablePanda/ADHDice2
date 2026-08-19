-- ADHDice 7.9.50: retire completed Task migration provenance.
--
-- Historical canonical Task rows are removed by the separate operator reset
-- artifact.  Current Task creation and command paths are runtime-owned and do
-- not require migration_operation_id, migration_version, or classifier_version.
-- Keep adhdice_task_state_schema_contract and all canonical Task State tables.
-- This is DDL only; it does not reset or delete user data.

begin;

alter table public.adhdice_task_schedule_boundaries
  drop constraint if exists adhdice_task_schedule_boundaries_migration_operation_fkey;
alter table public.adhdice_task_occurrences
  drop constraint if exists adhdice_task_occurrences_migration_operation_fkey;
alter table public.adhdice_task_occurrence_effective_overrides
  drop constraint if exists adhdice_task_occurrence_effective_overrides_operation_fkey;
alter table public.adhdice_task_history_facts
  drop constraint if exists adhdice_task_history_facts_migration_operation_fkey;
alter table public.adhdice_task_calendar_overrides
  drop constraint if exists adhdice_task_calendar_overrides_migration_operation_fkey;
alter table public.adhdice_task_reward_entitlements
  drop constraint if exists adhdice_task_reward_entitlements_migration_operation_fkey;

-- These checks encode the retired migration-only column contract and must be
-- removed before the columns can be dropped.
alter table public.adhdice_task_schedule_boundaries
  drop constraint if exists adhdice_task_schedule_boundaries_migration_provenance_check;
alter table public.adhdice_task_history_facts
  drop constraint if exists adhdice_task_history_facts_effective_date_check,
  drop constraint if exists adhdice_task_history_facts_runtime_provenance_check;

drop index if exists public.adhdice_task_schedule_boundaries_migration_operation_idx;
drop index if exists public.adhdice_task_occurrences_migration_operation_idx;
drop index if exists public.adhdice_task_occurrence_effective_overrides_migration_operation_idx;
drop index if exists public.adhdice_task_history_facts_migration_operation_idx;
drop index if exists public.adhdice_task_calendar_overrides_migration_operation_idx;
drop index if exists public.adhdice_task_reward_entitlements_migration_operation_idx;

alter table public.adhdice_task_schedule_boundaries
  drop column if exists migration_operation_id,
  drop column if exists migration_version,
  drop column if exists classifier_version;
alter table public.adhdice_task_occurrences
  drop column if exists migration_operation_id;
alter table public.adhdice_task_occurrence_effective_overrides
  drop column if exists migration_operation_id;
alter table public.adhdice_task_history_facts
  drop column if exists migration_operation_id;
alter table public.adhdice_task_calendar_overrides
  drop column if exists migration_operation_id;

alter table public.adhdice_task_reward_entitlements
  drop constraint if exists adhdice_task_reward_entitlements_source_check;
alter table public.adhdice_task_reward_entitlements
  drop column if exists migration_operation_id;
alter table public.adhdice_task_reward_entitlements
  add constraint adhdice_task_reward_entitlements_source_check
  check (
    entitlement_source_kind = 'runtime_command'
    and canonical_command_id is not null
  );

drop table if exists public.adhdice_task_migration_operations;

commit;

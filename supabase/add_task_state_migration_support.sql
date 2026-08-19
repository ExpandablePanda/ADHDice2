-- Canonical Task State provenance ledger.
-- The migration/backfill tables and workers were retired in 7.9.49.  This
-- file intentionally keeps only the operation ledger because current
-- canonical rows still retain migration_operation_id provenance references.

create table if not exists public.adhdice_task_migration_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid,
  operation_kind text not null check (operation_kind in (
    'classify', 'backfill', 'delta', 'verify', 'projection_rebuild',
    'stage_advance'
  )),
  operation_identity text not null
    check (char_length(trim(operation_identity)) > 0),
  input_fingerprint text not null
    check (char_length(trim(input_fingerprint)) > 0),
  state text not null check (state in (
    'started', 'committed', 'failed_retryable', 'failed_permanent'
  )),
  result_fingerprint text
    check (result_fingerprint is null or char_length(trim(result_fingerprint)) > 0),
  result_references jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_references) = 'object'),
  migration_version text not null
    check (char_length(trim(migration_version)) > 0),
  classifier_version text not null
    check (char_length(trim(classifier_version)) > 0),
  schema_contract_version text not null
    check (schema_contract_version = 'task-state-schema-v1'),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint adhdice_task_migration_operations_owner_id_key
    unique (user_id, id),
  constraint adhdice_task_migration_operations_identity_key
    unique (user_id, operation_identity)
);

do $ddl$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_task_schedule_boundaries'::regclass
      and conname = 'adhdice_task_schedule_boundaries_migration_operation_fkey'
  ) then
    alter table public.adhdice_task_schedule_boundaries
      add constraint adhdice_task_schedule_boundaries_migration_operation_fkey
      foreign key (user_id, migration_operation_id)
      references public.adhdice_task_migration_operations (user_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_task_occurrences'::regclass
      and conname = 'adhdice_task_occurrences_migration_operation_fkey'
  ) then
    alter table public.adhdice_task_occurrences
      add constraint adhdice_task_occurrences_migration_operation_fkey
      foreign key (user_id, migration_operation_id)
      references public.adhdice_task_migration_operations (user_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_task_occurrence_effective_overrides'::regclass
      and conname in (
        'adhdice_task_occurrence_effective_overrides_migration_operation',
        'adhdice_task_occurrence_effective_overrides_operation_fkey'
      )
  ) then
    alter table public.adhdice_task_occurrence_effective_overrides
      add constraint adhdice_task_occurrence_effective_overrides_operation_fkey
      foreign key (user_id, migration_operation_id)
      references public.adhdice_task_migration_operations (user_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_task_history_facts'::regclass
      and conname = 'adhdice_task_history_facts_migration_operation_fkey'
  ) then
    alter table public.adhdice_task_history_facts
      add constraint adhdice_task_history_facts_migration_operation_fkey
      foreign key (user_id, migration_operation_id)
      references public.adhdice_task_migration_operations (user_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_task_calendar_overrides'::regclass
      and conname = 'adhdice_task_calendar_overrides_migration_operation_fkey'
  ) then
    alter table public.adhdice_task_calendar_overrides
      add constraint adhdice_task_calendar_overrides_migration_operation_fkey
      foreign key (user_id, migration_operation_id)
      references public.adhdice_task_migration_operations (user_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_task_reward_entitlements'::regclass
      and conname = 'adhdice_task_reward_entitlements_migration_operation_fkey'
  ) then
    alter table public.adhdice_task_reward_entitlements
      add constraint adhdice_task_reward_entitlements_migration_operation_fkey
      foreign key (user_id, migration_operation_id)
      references public.adhdice_task_migration_operations (user_id, id)
      on delete restrict;
  end if;
end;
$ddl$;

create index if not exists adhdice_task_migration_operations_state_idx
  on public.adhdice_task_migration_operations (user_id, state, created_at);
create index if not exists adhdice_task_schedule_boundaries_migration_operation_idx
  on public.adhdice_task_schedule_boundaries (user_id, migration_operation_id)
  where migration_operation_id is not null;
create index if not exists adhdice_task_occurrences_migration_operation_idx
  on public.adhdice_task_occurrences (user_id, migration_operation_id)
  where migration_operation_id is not null;
create index if not exists adhdice_task_occurrence_effective_overrides_migration_operation_idx
  on public.adhdice_task_occurrence_effective_overrides (user_id, migration_operation_id)
  where migration_operation_id is not null;
create index if not exists adhdice_task_history_facts_migration_operation_idx
  on public.adhdice_task_history_facts (user_id, migration_operation_id)
  where migration_operation_id is not null;
create index if not exists adhdice_task_calendar_overrides_migration_operation_idx
  on public.adhdice_task_calendar_overrides (user_id, migration_operation_id)
  where migration_operation_id is not null;
create index if not exists adhdice_task_reward_entitlements_migration_operation_idx
  on public.adhdice_task_reward_entitlements (user_id, migration_operation_id)
  where migration_operation_id is not null;

alter table public.adhdice_task_migration_operations enable row level security;
revoke all on table public.adhdice_task_migration_operations from public, anon, authenticated;

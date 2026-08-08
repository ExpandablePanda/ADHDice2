-- Phase 1E-2B-1 / M1-M2: migration-support schema.
--
-- This artifact preserves migration evidence and restartable migration
-- bookkeeping.  It does not classify or backfill business data, create
-- canonical Task commands, or install runtime/cutover behavior.

-- Reserve an unexposed namespace for future migration-only helpers.  This
-- schema-only ticket intentionally installs no SECURITY DEFINER functions.
create schema if not exists adhdice_migration_private;
revoke all on schema adhdice_migration_private from public, anon, authenticated;

-- The canonical schema contract is owned by 1E-2A.  This marker records the
-- migration-support artifact version without changing that canonical marker.
create table if not exists public.adhdice_task_state_migration_schema_contract (
  contract_key text primary key,
  schema_contract_version text not null
    check (schema_contract_version = 'task-state-schema-v1'),
  migration_support_version text not null
    check (migration_support_version = 'task-state-migration-v1'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.adhdice_task_state_migration_schema_contract (
  contract_key,
  schema_contract_version,
  migration_support_version
)
values (
  'migration_support',
  'task-state-schema-v1',
  'task-state-migration-v1'
)
on conflict (contract_key) do nothing;

-- The operation ledger is created before the deferred provenance FKs.  Its
-- entity_id is raw migration scope, not an asserted canonical Task identity.
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

-- Raw legacy History evidence is deliberately less constrained than
-- canonical facts.  Orphaned and cross-user source identities remain
-- inspectable instead of being rejected by speculative FKs.
create table if not exists public.adhdice_task_legacy_history_evidence (
  id uuid primary key default gen_random_uuid(),
  source_history_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid,
  legacy_entry_date date not null,
  legacy_status text not null,
  legacy_event_type text not null,
  legacy_occurrence_key text,
  legacy_occurrence_due_on date,
  legacy_counted_as_due_occurrence boolean not null,
  legacy_was_completed boolean not null,
  legacy_created_at timestamptz not null,
  legacy_updated_at timestamptz not null,
  source_kind text not null check (source_kind in (
    'adhdice_task_history', 'legacy_rollover',
    'legacy_reward_reconciliation', 'unknown'
  )),
  classification text not null check (classification in (
    'automatic_missed', 'explicit_missed', 'ambiguous',
    'legacy_rollover', 'legacy_reward_reconciliation', 'other'
  )),
  confidence text not null check (confidence in (
    'proven', 'high_confidence', 'medium_confidence', 'low', 'unavailable'
  )),
  source_operation text,
  source_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_snapshot) = 'object'),
  migration_operation_id uuid,
  migration_version text not null
    check (char_length(trim(migration_version)) > 0),
  classifier_version text not null
    check (char_length(trim(classifier_version)) > 0),
  schema_contract_version text not null
    check (schema_contract_version = 'task-state-schema-v1'),
  retained_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_task_legacy_history_evidence_source_key
    unique (user_id, source_history_id)
);

create table if not exists public.adhdice_task_state_migrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  migration_version text not null
    check (char_length(trim(migration_version)) > 0),
  classifier_version text not null
    check (char_length(trim(classifier_version)) > 0),
  schema_contract_version text not null
    check (schema_contract_version = 'task-state-schema-v1'),
  reward_program_version text not null
    check (char_length(trim(reward_program_version)) > 0),
  state text not null check (state in (
    'not_started', 'classified', 'canonical_backfilled', 'shadow_verified',
    'command_cutover', 'complete', 'needs_attention'
  )),
  last_successful_stage text not null check (last_successful_stage in (
    'M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'
  )),
  source_fingerprint text,
  snapshot_taken_at timestamptz,
  lease_token uuid,
  lease_owner text,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  forward_only_at timestamptz,
  counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(counts) = 'object'),
  diagnostic_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(diagnostic_summary) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adhdice_task_state_migration_entities (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  entity_kind text not null check (entity_kind in ('parent', 'step', 'substep')),
  state text not null check (state in (
    'not_started', 'classified', 'canonical_backfilled', 'shadow_verified',
    'command_cutover', 'complete', 'needs_attention'
  )),
  migration_version text not null
    check (char_length(trim(migration_version)) > 0),
  classifier_version text not null
    check (char_length(trim(classifier_version)) > 0),
  source_revision bigint
    check (source_revision is null or source_revision >= 1),
  source_fingerprint text,
  canonical_revision bigint
    check (canonical_revision is null or canonical_revision >= 1),
  blocking_issue_count integer not null default 0
    check (blocking_issue_count >= 0),
  classification jsonb not null default '{}'::jsonb
    check (jsonb_typeof(classification) = 'object'),
  stage_counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(stage_counts) = 'object'),
  last_successful_stage text check (last_successful_stage is null or last_successful_stage in (
    'M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'
  )),
  forward_only_at timestamptz,
  last_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_task_state_migration_entities_pk
    primary key (user_id, entity_id)
);

-- Issue identity is evidence identity, not canonical identity.  In
-- particular, entity_id and source_history_id intentionally remain raw UUIDs
-- so orphan and cross-user source evidence can be recorded.
create table if not exists public.adhdice_task_state_migration_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid,
  source_history_id uuid,
  category text not null check (category in (
    'anchor_unknown', 'schedule_boundary_contradiction', 'delay_origin_unknown',
    'complete_contradiction', 'trash_prior_container_unknown',
    'in_progress_stale', 'hierarchy_orphan', 'hierarchy_cycle',
    'cross_user_reference', 'legacy_subtask_unmapped',
    'legacy_subtask_duplicate', 'reward_ambiguous', 'malformed_repeat',
    'orphan_history', 'orphan_effect', 'projection_contradiction'
  )),
  severity text not null check (severity in ('info', 'warning', 'blocking')),
  classification text not null
    check (char_length(trim(classification)) > 0),
  evidence_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_snapshot) = 'object'),
  evidence_fingerprint text not null
    check (char_length(trim(evidence_fingerprint)) > 0),
  scope_identity text not null
    check (char_length(trim(scope_identity)) > 0),
  migration_version text not null
    check (char_length(trim(migration_version)) > 0),
  classifier_version text not null
    check (char_length(trim(classifier_version)) > 0),
  schema_contract_version text not null
    check (schema_contract_version = 'task-state-schema-v1'),
  source_operation text,
  resolved_at timestamptz,
  resolution_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_task_state_migration_issues_identity_key
    unique (
      user_id,
      scope_identity,
      category,
      evidence_fingerprint,
      classifier_version
    )
);

-- Add all owner-safe relationships only after both the migration-operation
-- parent and every canonical child table exist.  No user_id-only UUID FK is
-- used for migration provenance.
do $ddl$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_task_state_migration_entities'::regclass
      and conname = 'adhdice_task_state_migration_entities_task_fkey'
  ) then
    alter table public.adhdice_task_state_migration_entities
      add constraint adhdice_task_state_migration_entities_task_fkey
      foreign key (user_id, entity_id)
      references public.adhdice_clean_tasks (user_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_task_legacy_history_evidence'::regclass
      and conname = 'adhdice_task_legacy_history_evidence_operation_fkey'
  ) then
    alter table public.adhdice_task_legacy_history_evidence
      add constraint adhdice_task_legacy_history_evidence_operation_fkey
      foreign key (user_id, migration_operation_id)
      references public.adhdice_task_migration_operations (user_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_task_state_migration_entities'::regclass
      and conname = 'adhdice_task_state_migration_entities_operation_fkey'
  ) then
    alter table public.adhdice_task_state_migration_entities
      add constraint adhdice_task_state_migration_entities_operation_fkey
      foreign key (user_id, last_operation_id)
      references public.adhdice_task_migration_operations (user_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_task_state_migration_issues'::regclass
      and conname = 'adhdice_task_state_migration_issues_operation_fkey'
  ) then
    alter table public.adhdice_task_state_migration_issues
      add constraint adhdice_task_state_migration_issues_operation_fkey
      foreign key (user_id, resolution_operation_id)
      references public.adhdice_task_migration_operations (user_id, id)
      on delete restrict;
  end if;

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
      and conname = 'adhdice_task_occurrence_effective_overrides_migration_operation_fkey'
  ) then
    alter table public.adhdice_task_occurrence_effective_overrides
      add constraint adhdice_task_occurrence_effective_overrides_migration_operation_fkey
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

create index if not exists adhdice_task_legacy_history_evidence_classification_idx
  on public.adhdice_task_legacy_history_evidence
    (user_id, classification, legacy_entry_date desc);
create index if not exists adhdice_task_legacy_history_evidence_entity_idx
  on public.adhdice_task_legacy_history_evidence
    (user_id, entity_id, legacy_entry_date desc);
create index if not exists adhdice_task_legacy_history_evidence_unresolved_idx
  on public.adhdice_task_legacy_history_evidence
    (user_id, legacy_entry_date desc)
  where classification = 'ambiguous' or confidence = 'unavailable';
create index if not exists adhdice_task_legacy_history_evidence_operation_idx
  on public.adhdice_task_legacy_history_evidence (user_id, migration_operation_id)
  where migration_operation_id is not null;

create index if not exists adhdice_task_state_migrations_state_updated_idx
  on public.adhdice_task_state_migrations (state, updated_at);
create index if not exists adhdice_task_state_migrations_lease_expires_idx
  on public.adhdice_task_state_migrations (lease_expires_at);
create index if not exists adhdice_task_state_migrations_version_idx
  on public.adhdice_task_state_migrations (migration_version, classifier_version);

create index if not exists adhdice_task_state_migration_entities_state_updated_idx
  on public.adhdice_task_state_migration_entities (user_id, state, updated_at);
create index if not exists adhdice_task_state_migration_entities_blocking_idx
  on public.adhdice_task_state_migration_entities (user_id, blocking_issue_count desc);
create index if not exists adhdice_task_state_migration_entities_kind_idx
  on public.adhdice_task_state_migration_entities (user_id, entity_kind);
create index if not exists adhdice_task_state_migration_entities_operation_idx
  on public.adhdice_task_state_migration_entities (user_id, last_operation_id)
  where last_operation_id is not null;

create index if not exists adhdice_task_state_migration_issues_blocking_idx
  on public.adhdice_task_state_migration_issues (user_id, severity, resolved_at)
  where severity = 'blocking' and resolved_at is null;
create index if not exists adhdice_task_state_migration_issues_unresolved_category_idx
  on public.adhdice_task_state_migration_issues (category, resolved_at)
  where resolved_at is null;
create index if not exists adhdice_task_state_migration_issues_operation_idx
  on public.adhdice_task_state_migration_issues (user_id, resolution_operation_id)
  where resolution_operation_id is not null;

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

alter table public.adhdice_task_state_migration_schema_contract enable row level security;
alter table public.adhdice_task_migration_operations enable row level security;
alter table public.adhdice_task_legacy_history_evidence enable row level security;
alter table public.adhdice_task_state_migrations enable row level security;
alter table public.adhdice_task_state_migration_entities enable row level security;
alter table public.adhdice_task_state_migration_issues enable row level security;

drop policy if exists "Users can read migration History evidence"
  on public.adhdice_task_legacy_history_evidence;
create policy "Users can read migration History evidence"
  on public.adhdice_task_legacy_history_evidence
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read migration state"
  on public.adhdice_task_state_migrations;
create policy "Users can read migration state"
  on public.adhdice_task_state_migrations
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read migration entity state"
  on public.adhdice_task_state_migration_entities;
create policy "Users can read migration entity state"
  on public.adhdice_task_state_migration_entities
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read migration issues"
  on public.adhdice_task_state_migration_issues;
create policy "Users can read migration issues"
  on public.adhdice_task_state_migration_issues
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.adhdice_task_state_migration_schema_contract
  from public, anon, authenticated;
revoke all on table public.adhdice_task_migration_operations
  from public, anon, authenticated;
revoke all on table public.adhdice_task_legacy_history_evidence
  from public, anon, authenticated;
revoke all on table public.adhdice_task_state_migrations
  from public, anon, authenticated;
revoke all on table public.adhdice_task_state_migration_entities
  from public, anon, authenticated;
revoke all on table public.adhdice_task_state_migration_issues
  from public, anon, authenticated;

grant select on table public.adhdice_task_legacy_history_evidence to authenticated;
grant select on table public.adhdice_task_state_migrations to authenticated;
grant select on table public.adhdice_task_state_migration_entities to authenticated;
grant select on table public.adhdice_task_state_migration_issues to authenticated;

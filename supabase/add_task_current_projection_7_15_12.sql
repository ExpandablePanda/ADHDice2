-- ADHDice 7.15.12 current Task read projection physical contract.
--
-- Source-only additive SQL. This migration is intentionally not applied by
-- the browser runtime, test suite, or Codex run. It establishes storage for a
-- future trusted command/rebuild writer; it does not backfill or cut over any
-- current read path.

begin;

-- The existing user-scoped History ledger already records the affected entity
-- on every change. This index makes the latest entity frontier a bounded
-- lookup instead of a scan of the owner's entire change ledger.
create index if not exists adhdice_task_history_changes_entity_sequence_idx
  on public.adhdice_task_history_changes (user_id, entity_id, sequence desc);

create table if not exists public.adhdice_task_current_projections (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  entity_kind text not null check (entity_kind in ('parent', 'step', 'substep')),

  display_status text not null check (display_status in (
    'pending', 'in_progress', 'done', 'did_my_best', 'missed',
    'upcoming', 'not_due', 'delayed', 'unscheduled', 'archived',
    'trashed', 'complete'
  )),
  current_effective_due_on date,
  next_due_on date,
  active_occurrence_id uuid,
  active_occurrence_status text not null default 'none' check (
    active_occurrence_status in ('none', 'open', 'overdue', 'delayed', 'handled', 'terminated')
  ),
  handled_current_logical_day boolean not null,
  last_handled_logical_date date,
  last_handled_at timestamptz,
  last_done_logical_date date,
  last_done_at timestamptz,
  current_positive_streak integer not null default 0 check (current_positive_streak >= 0),
  current_missed_streak integer not null default 0 check (current_missed_streak >= 0),

  canonical_task_revision bigint not null check (canonical_task_revision >= 1),
  history_sync_epoch uuid not null,
  history_source_revision bigint not null check (history_source_revision >= 0),
  history_source_fingerprint text not null check (
    history_source_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  schedule_boundary_revision text not null check (
    schedule_boundary_revision ~ '^sha256:[0-9a-f]{64}$'
  ),
  behavior_policy_revision text not null check (
    behavior_policy_revision ~ '^sha256:[0-9a-f]{64}$'
  ),
  logical_day_settings_revision bigint not null check (logical_day_settings_revision >= 1),
  projected_logical_date date not null,
  projection_schema_version text not null check (
    projection_schema_version = 'task-current-projection-schema-v1'
  ),
  projection_algorithm_version text not null check (
    projection_algorithm_version = 'task-current-projection-algorithm-v1'
  ),
  source_fingerprint text not null check (
    source_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  validity text not null default 'unavailable' check (
    validity in ('valid', 'repair_required', 'unavailable')
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_task_current_projections_identity_key
    primary key (user_id, entity_id),
  constraint adhdice_task_current_projections_entity_fkey
    foreign key (user_id, entity_id)
    references public.adhdice_clean_tasks (user_id, id)
    on delete cascade
);

-- Candidate scans are limited to this owner's stale/repairable rows. Due and
-- frontier indexes are deliberately deferred until a reconciler query proves
-- that they are needed.
create index if not exists adhdice_task_current_projections_reconciliation_idx
  on public.adhdice_task_current_projections (user_id, validity, projected_logical_date, entity_id);

alter table public.adhdice_task_current_projections enable row level security;

drop policy if exists "Users can read their own current Task projections"
  on public.adhdice_task_current_projections;
create policy "Users can read their own current Task projections"
  on public.adhdice_task_current_projections
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Browser clients receive read-only access. The trusted command/rebuild
-- boundary is expected to use service_role or a separately secured
-- SECURITY DEFINER writer; no authenticated INSERT/UPDATE/DELETE policy is
-- installed here.
revoke all on table public.adhdice_task_current_projections from public, anon, authenticated;
grant select on table public.adhdice_task_current_projections to authenticated;
grant all on table public.adhdice_task_current_projections to service_role;

notify pgrst, 'reload schema';

commit;

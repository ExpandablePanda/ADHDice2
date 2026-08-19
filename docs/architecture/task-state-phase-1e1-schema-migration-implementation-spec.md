# Phase 1E-1: Schema / Migration Implementation Specification

## Status, scope, and locked inputs

This document is the implementation specification for the future canonical Task State storage migration on codex/chatgpt-diagnostic-branch.

It translates the locked decisions in:

- [Phase 0 inventory](task-state-phase-0-inventory.md)
- [Phase 1A core model](task-state-phase-1a-core-model.md)
- [Phase 1B-1 recurrence transitions](task-state-phase-1b1-recurrence-transitions.md)
- [Phase 1B-2A workflow and lifecycle transitions](task-state-phase-1b2a-workflow-lifecycle-transitions.md)
- [Phase 1B-2B rollover and reward semantics](task-state-phase-1b2b-rollover-reward-semantics.md)
- [Phase 1C command/read/output contract](task-state-phase-1c-command-read-output-contract.md)
- [Phase 1D-1 persistence/storage contract](task-state-phase-1d1-persistence-storage-contract.md)
- [Phase 1D-2 migration/cutover design](task-state-phase-1d2-migration-cutover-design.md)

This is a documentation-only specification. It does not create SQL, change the checked-in schema, execute SQL, access live Supabase, change production code/tests/UI/generated types/version surfaces, implement repositories, or begin runtime cutover.

The physical names, columns, constraints, ownership rules, migration algorithms, transaction boundaries, verification artifacts, and gates below are locked engineering decisions for the next implementation tickets. They do not reopen Phase 1B product semantics.

No new product decisions are required by Phase 1E-1. Database names, SQL syntax, indexes, RLS implementation, migration batches, and transaction design are engineering decisions.

## 1. Re-audit of checked-in current schema

The audit used checked-in source only. A checked-in patch is not evidence that its SQL is deployed.

### 1.1 Current base names and conventions

supabase/schema.sql currently defines:

- public.adhdice_clean_tasks with UUID id, user_id, self-referential parent_task_id, integer revision, created_at, updated_at, the overloaded status enum, repeat fields, due_on, scheduled_on, active_status_logical_date, active_occurrence_due_on, completed_at, and trashed_at.
- public.adhdice_task_history with UUID id, task_id, user_id, entry_date, optional occurrence_key and occurrence_due_on, enum status, event_type, counted_as_due_occurrence, was_completed, timestamps, and unique (user_id, task_id, entry_date).
- canonical same-table child storage through `adhdice_clean_tasks.parent_task_id`.
- public.adhdice_user_profiles, extended by patches with timezone, text day_start_time, economy fields, and settings fields.
- public.adhdice_task_events, public.adhdice_point_ledger, public.adhdice_task_reward_rolls, public.adhdice_task_reward_claims, public.adhdice_pending_reward_dice, public.adhdice_pending_reward_dice_operations, and public.adhdice_pending_reward_dice_items for current economy/reward paths.
- Achievement persistence keyed to current adhdice_task_history rows, including adhdice_capture_task_achievement_occurrence(uuid) and the task-history achievement trigger.

Current base enums include adhdice_clean_task_status, adhdice_clean_task_repeat_frequency, adhdice_clean_task_repeat_monthly_mode, and adhdice_clean_task_repeat_monthly_ordinal. New canonical axes use text plus explicit CHECK constraints rather than adding another PostgreSQL enum family.

Current ownership policies use auth.uid() = user_id; the target policies must use TO authenticated plus (select auth.uid()) ownership predicates and both USING and WITH CHECK on updates. Existing revision behavior is adhdice_clean_tasks_bump_revision() before updates, with adhdice_clean_set_updated_at() triggers for timestamps.

### 1.2 Current checked-in patches and RPC evidence

The audit included Task/revision/repeat/history patches, add_task_rollover_rpc.sql, patch_secure_task_rollover_rpc.sql, the patch_task_state_engine_rollover_7_6_* series, patch_daily_until_complete_rollover_rpc.sql, reward/economy/pending-dice patches, achievement capture/evaluation patches, profile settings patches, and Subtask/promotion patches.

The relevant current names include:

- adhdice_reconcile_task_rollover(uuid, timestamptz) and its helper functions;
- adhdice_apply_task_state_engine_rollover(uuid, jsonb, timestamptz);
- adhdice_claim_pending_reward_dice(uuid);
- adhdice_execute_roll(...);
- adhdice_capture_task_achievement_occurrence(uuid) and achievement runtime triggers; and
- adhdice_clean_tasks_bump_revision() plus History occurrence/duration triggers.

The current named index convention includes the canonical Task, History, schedule, and reward indexes. The base Task and History primary/foreign keys are mostly inline unnamed constraints; the current History uniqueness is an inline unique (user_id, task_id, entry_date). New canonical objects therefore use explicit names in the future SQL artifact and retain the adhdice_ prefix.

These remain legacy/compatibility evidence until the retirement gates in §33 pass. No checked-in function is assumed deployed.

## 2. Target physical model and naming decision

The target uses the existing public schema and the project adhdice_ naming style. The model is one canonical Task Entity plus immutable or explicitly replaceable fact stores. New canonical tables are not a second universal event stream.

### 2.1 Target structures

| Physical structure | Role | Authority |
|---|---|---|
| adhdice_clean_tasks additions | Canonical current identity, hierarchy, lifecycle, container, and workflow; existing descriptive fields remain canonical metadata | Canonical current entity |
| adhdice_user_profiles.settings_revision | Durable logical-day settings generation | Canonical settings revision |
| adhdice_task_schedule_boundaries | Full immutable effective-dated schedule snapshots | Canonical schedule definition/history |
| adhdice_task_occurrences | Materialized-on-demand immutable scheduled origins | Canonical occurrence identity |
| adhdice_task_occurrence_effective_overrides | Append-only scheduled-origin to effective-date movement | Canonical Delay/correction effect |
| adhdice_task_history_facts | New one-row-per-entity/logical-date explicit History authority | Canonical explicit outcome |
| adhdice_task_legacy_history_evidence | Raw/classified current History evidence, especially automatic Missed | Compatibility evidence only |
| adhdice_task_calendar_overrides | Active date-scoped scheduling-state correction | Canonical Calendar override |
| adhdice_task_command_operations | Compact runtime command/replay ledger | Operational/idempotence fact |
| adhdice_task_reward_entitlements | One handled-success entitlement per entity/date/program | Canonical economy eligibility |
| adhdice_task_reward_grants | One downstream banked-roll grant per entitlement | Canonical effect/idempotence fact |
| adhdice_task_reward_claim_consumptions | Later consumption of one stable grant | Canonical effect fact |
| adhdice_task_state_migrations | Per-user migration stage and lease | Operational migration state |
| adhdice_task_state_migration_entities | Per-entity classification/backfill/cutover state | Operational migration state |
| adhdice_task_state_migration_issues | Migration-only ambiguity and needs-attention evidence | Migration evidence, not general diagnostics |
| adhdice_task_migration_operations | Restartable, deterministic migration operation ledger | Operational/idempotence fact |

The current adhdice_task_history is not upgraded in place for initial canonical cutover. The target is option B from the Phase 1E-1 request: introduce adhdice_task_history_facts, preserve adhdice_task_history as a legacy source/evidence table, and copy every source row needed for audit into adhdice_task_legacy_history_evidence. This avoids promoting mixed automatic/explicit rows before classification and does not break current achievement consumers during the compatibility window.

### 2.2 Common physical conventions

- Every new user-owned row has user_id uuid not null references auth.users(id) on delete cascade.
- Every Task fact has entity_id uuid not null and a composite owner relationship to adhdice_clean_tasks(user_id, id). The Task table must therefore gain unique (user_id, id) before child composite foreign keys are added.
- UUID primary keys use gen_random_uuid() unless a table deliberately uses (user_id, entity_id) or another natural composite key.
- All timestamps are timestamptz not null default now() unless the field is an action/transition timestamp that is nullable by state or a Task canonical timestamp held nullable during the M1 bootstrap.
- All mutable canonical fact rows have revision bigint not null default 1 check (revision >= 1) and an updated_at trigger once canonicalized. Immutable boundary/occurrence/override rows retain updated_at for operational freshness but are never semantically updated. The Task canonical revision/timestamps are nullable and explicitly initialized during the bootstrap-safe proven backfill, then tightened under §3.2.
- New string discriminators are text not null with exact allow-list checks. No free-form status string is canonical.
- All provenance strings are non-empty and versioned. Migration rows must carry migration_version, classifier_version, and schema_contract_version.
- M1 has one explicit bootstrap exception to the general `not null` rule: canonical semantic columns added to the existing `adhdice_clean_tasks` rows are nullable and have no semantic defaults until proven backfill completes. A non-semantic `canonicalization_status` marker distinguishes legacy-uninitialized rows from genuinely canonical rows; it is migration metadata, never a Task-state axis or read authority.
- A canonical runtime insert must provide its canonical semantic values explicitly. Defaults and `NOT NULL` tightening for the bootstrap columns are a later, separately verified step after the relevant legacy population has no uninitialized or unresolved rows.
- created_at/updated_at are timing/audit fields, not semantic replacement identity. Command or migration identities are required for new writes.

## 3. Exact adhdice_clean_tasks changes

### 3.1 Canonical additions

Add the following columns to adhdice_clean_tasks:

| Column | Type/nullability/default | Constraint and meaning |
|---|---|---|
| canonicalization_status | text not null default 'legacy_uninitialized' | CHECK (canonicalization_status in ('legacy_uninitialized','canonical_proven','canonical_runtime','needs_attention')); migration/authority marker only, never a Task-state axis |
| entity_kind | text | M1 bootstrap-nullable; once canonicalized, CHECK (entity_kind in ('parent','step','substep')); derived during migration from same-table depth and explicit legacy mapping, then canonical for the entity |
| terminal_state | text | M1 bootstrap-nullable; once canonicalized, CHECK (terminal_state in ('active','permanently_complete')) |
| container_state | text | M1 bootstrap-nullable; once canonicalized, CHECK (container_state in ('active','archived','trashed')) |
| prior_container_state | text | CHECK (prior_container_state is null or prior_container_state in ('active','archived')); restore evidence, not a guess |
| prior_container_state_status | text | M1 bootstrap-nullable; once canonicalized, CHECK (prior_container_state_status in ('not_applicable','proven','unknown','contradictory')); while trashed it is proven, unknown, or contradictory; proven requires prior_container_state |
| terminal_completed_at | timestamptz | Canonical terminal transition timestamp; only non-null for permanently_complete |
| container_trashed_at | timestamptz | Canonical current Trash transition timestamp; nullable unless container_state='trashed' |
| workflow_state | text | M1 bootstrap-nullable; once canonicalized, CHECK (workflow_state in ('none','in_progress')) |
| workflow_started_at | timestamptz | Required for workflow_state='in_progress' |
| workflow_logical_date | date | Required for workflow_state='in_progress' |
| workflow_occurrence_id | uuid | Nullable current occurrence reference; deferred owner-safe FK `(user_id, workflow_occurrence_id) -> adhdice_task_occurrences(user_id, id)` |
| workflow_command_id | uuid | Command that established the current workflow state; nullable only when workflow is none |
| workflow_revision | bigint | M1 bootstrap-nullable; once canonicalized, CHECK (workflow_revision >= 1); increments on workflow changes |
| canonical_revision | bigint | M1 bootstrap-nullable; once canonicalized, CHECK (canonical_revision >= 1); increments on semantic entity/lifecycle/container/workflow changes, not projection repair |
| canonical_created_at | timestamptz | M1 bootstrap-nullable; explicit canonical migration/live boundary timestamp; current created_at remains source timing |
| canonical_updated_at | timestamptz | M1 bootstrap-nullable; explicit canonical semantic update timestamp |
| projection_source_canonical_revision | bigint | Revision used for compatibility projections; nullable before bootstrap |
| projection_source_fingerprint | text | Canonical source digest for projection detection |
| projection_version | text | Projection contract version; required together with projection source fields |

The retained Task Entity columns are the existing id uuid primary key, user_id uuid not null, parent_task_id uuid nullable, title text not null, notes text nullable, priority enum, priority_level integer, energy enum, is_urgent boolean, is_important boolean, estimated_minutes integer nullable, actual_seconds integer, tags text array, external link fields, one_step_at_a_time boolean, subtasks_auto_reset boolean, pinned_at timestamptz, pin_order integer, sort_order bigint, created_at timestamptz, and updated_at timestamptz. The existing schedule/projection/lifecycle columns are retained and classified in §3.4. No retained descriptive field changes ownership or nullability in the first canonical schema artifact.

Add unique (user_id, id) for composite owner foreign keys. M1 adds only the bootstrap-safe shape: the semantic additions above remain nullable and do not default existing rows to parent, active, none, or any other canonical value. The `canonicalization_status` default is safe because it records that canonicalization has not happened; it is not a semantic Task fact.

M1 may install NULL-tolerant allow-list checks (`column is null or column in (...)`) so malformed non-null values are rejected without rejecting legacy rows. Inter-column semantic checks are evaluated only when `canonicalization_status` is canonical, and the following are the tightened canonical form after the row is canonicalized:

~~~text
terminal_state = active OR terminal_completed_at IS NOT NULL
terminal_state = permanently_complete OR terminal_completed_at IS NULL
workflow_state = 'none' OR (workflow_started_at IS NOT NULL AND workflow_logical_date IS NOT NULL AND workflow_command_id IS NOT NULL)
workflow_state = 'in_progress' OR (workflow_started_at IS NULL AND workflow_logical_date IS NULL AND workflow_occurrence_id IS NULL AND workflow_command_id IS NULL)
container_state <> trashed OR container_trashed_at IS NOT NULL
container_state = trashed OR container_trashed_at IS NULL
prior_container_state_status = proven -> prior_container_state IS NOT NULL
prior_container_state_status = not_applicable -> container_state <> trashed
~~~

The existing self-parent check remains. The migration classifier must additionally reject cross-user parents and cycles; a database recursive trigger is not the canonical hierarchy operation.

### 3.2 Canonicalization bootstrap and tightening

The staged physical contract is:

1. **M1 schema/bootstrap state.** Add `canonicalization_status` with default `legacy_uninitialized`, add the canonical semantic Task columns as nullable with no semantic defaults, and leave existing legacy columns untouched. Existing rows therefore remain distinguishable: their canonical semantic columns are null and their marker is `legacy_uninitialized`. M1 does not claim that any such row is a canonical parent, active Task, unscheduled Task, or workflow-none Task. New canonical rows must supply all required semantic values explicitly; the bootstrap default must not be used as a runtime insert shortcut.
2. **Proven backfill initialization.** For a row whose complete canonical identity, lifecycle/container, and workflow interpretation is `PROVEN` or `HIGH` under the Phase 1D-2 promotion rules, one migration operation writes the full required canonical set, explicit revisions/timestamps, and `canonicalization_status='canonical_proven'`. A row with unresolved or contradictory required facts remains `canonicalization_status='needs_attention'` with those unresolved semantic columns null; its proven sub-facts live in the migration classification/evidence, not in a partially authoritative Task row. The migration never fills an unresolved field with a semantic default.
3. **Canonical runtime state.** A canonical command-created Task writes the same complete semantic set and uses `canonicalization_status='canonical_runtime'`; a runtime command may transition a proven row to that marker. Runtime commands cannot operate as canonical authority on `legacy_uninitialized` or `needs_attention` rows without an explicit, separately authorized migration/repair path.
4. **Later tightening.** Only after the relevant population has no `legacy_uninitialized` or `needs_attention` rows and the M2 verification proves complete initialization may a later schema step add `NOT NULL`, semantic checks, and any desired canonical-only defaults. Tightening is not part of the bootstrap deployment if it would reject or reinterpret unresolved legacy rows. `canonicalization_status` remains provenance/operational metadata and is never consulted as a competing Task-state authority.

### 3.3 Owner-safe composite-key contract

Every new user-owned canonical relationship that carries both `user_id` and another row identity uses a matching composite key. Referenced canonical tables expose `UNIQUE (user_id, id)` before these FKs are added; `adhdice_clean_tasks` already has the same required unique key after the Task foundation step. RLS is defense in depth and cannot substitute for these constraints.

| Child/reference | Required owner-safe relationship |
|---|---|
| Task `workflow_occurrence_id` | `(user_id, workflow_occurrence_id) -> adhdice_task_occurrences(user_id, id)`; nullable only when workflow is none |
| Schedule boundary `entity_id`, `prior_boundary_id`, `affected_occurrence_id` | `(user_id, entity_id) -> adhdice_clean_tasks(user_id, id)`; `(user_id, prior_boundary_id) -> adhdice_task_schedule_boundaries(user_id, id)`; `(user_id, affected_occurrence_id) -> adhdice_task_occurrences(user_id, id)` |
| Occurrence `entity_id`, `source_boundary_id`, `resolved_history_id` | `(user_id, entity_id) -> adhdice_clean_tasks(user_id, id)`; `(user_id, source_boundary_id) -> adhdice_task_schedule_boundaries(user_id, id)`; `(user_id, resolved_history_id) -> adhdice_task_history_facts(user_id, id)` |
| Effective override `entity_id`, `occurrence_id`, `schedule_boundary_id`, `prior_override_id`, `history_id` | Composite FKs to `adhdice_clean_tasks`, `adhdice_task_occurrences`, `adhdice_task_schedule_boundaries`, the same override table, and `adhdice_task_history_facts` respectively; prior override also carries the same occurrence scope and predecessor sequence |
| Canonical History `entity_id`, `occurrence_id`, `schedule_boundary_id` | Composite FKs to `adhdice_clean_tasks`, `adhdice_task_occurrences`, and `adhdice_task_schedule_boundaries`; `source_legacy_history_id` intentionally has no restrictive canonical FK so orphan legacy evidence survives |
| Calendar override `entity_id`, command references | Composite FK to `adhdice_clean_tasks`; nullable runtime `command_id` and `cleared_by_command_id` use `(user_id, command_id) -> adhdice_task_command_operations(user_id, command_id)` |
| Command operation `entity_id` | Nullable user-level command scope; when present, `(user_id, entity_id) -> adhdice_clean_tasks(user_id, id)` |
| Reward entitlement `entity_id`, `canonical_history_id`, `canonical_command_id` | Composite FKs to `adhdice_clean_tasks`, `adhdice_task_history_facts`, and `(user_id, command_id) -> adhdice_task_command_operations(user_id, command_id)`; the command FK is nullable only for migration bootstrap under §11.1 |
| Reward grant `entitlement_id` | `(user_id, entitlement_id) -> adhdice_task_reward_entitlements(user_id, id)` |
| Reward claim consumption `grant_id` | `(user_id, grant_id) -> adhdice_task_reward_grants(user_id, id)` |

The same composite pattern applies to runtime command references on boundaries, occurrences, effective overrides, and canonical History. Migration provenance references are operational, not user commands: `migration_operation_id` remains nullable on canonical tables in 1E-2A and receives its matching `(user_id, migration_operation_id)` FK when 1E-2B creates the migration operation table. No canonical relationship may use a user_id-only FK plus an independently trusted UUID.

### 3.4 Existing field classification

| Existing field | Initial target state | Compatibility projection | Canonical replacement/retirement gate |
|---|---|---|---|
| status | Untouched; preserve enum and current readers | terminal_state + container_state + derived active schedule + workflow_state mapped to the legacy enum | Projection-only immediately; retire after all readers consume canonical projections |
| due_on | Untouched; nullable | Current effective obligation date when one exists | Guarded projection only; retire after schedule/occurrence readers converge |
| scheduled_on | Untouched | None unless a specific legacy reader still needs it | Legacy evidence; retire after its callers are removed |
| repeat_frequency | Untouched | Current boundary’s repeat family | Boundary snapshot is canonical; retire as authority after schedule command/read cutover |
| repeat_interval | Untouched | Current boundary interval | Same as repeat_frequency |
| repeat_days_of_week | Untouched | Current boundary weekday set | Same as repeat_frequency |
| repeat_day_of_month | Untouched | Current boundary monthly day | Same as repeat_frequency |
| repeat_monthly_mode | Untouched | Current boundary monthly mode | Same as repeat_frequency |
| repeat_monthly_ordinal | Untouched | Current boundary ordinal | Same as repeat_frequency |
| repeat_monthly_weekday | Untouched | Current boundary weekday | Same as repeat_frequency |
| active_status_logical_date | Untouched | Workflow logical date only when canonical workflow proves it | Never general Task state; retire after workflow readers converge |
| active_occurrence_due_on | Untouched | Current canonical occurrence scheduled date only when proven | Projection-only; retire after occurrence consumers converge |
| completed_at | Untouched | terminal_completed_at | Projection-only; retire after terminal readers converge |
| trashed_at | Untouched | container_trashed_at | Projection-only; retire after container readers converge |

No old field is removed in the initial schema implementation.

## 4. adhdice_task_schedule_boundaries

This is the immutable full-snapshot schedule table. It owns recurrence configuration and anchor provenance; adhdice_clean_tasks repeat fields are only the current compatibility projection.

### 4.1 Columns and constraints

| Column | Type/nullability/default | Exact rule |
|---|---|---|
| id | uuid primary key default gen_random_uuid() | Boundary identity |
| user_id | uuid not null | Composite FK to Task owner |
| entity_id | uuid not null | Composite FK to Task owner |
| entity_kind | text not null | Parent/step/substep snapshot; must match Task |
| effective_from_logical_date | date not null | First logical date governed by this full snapshot |
| boundary_sequence | bigint not null | check (boundary_sequence >= 1); strictly increasing per entity |
| boundary_type | text not null | initial, due_date_change, repeat_change, delay, correction, or reopen |
| schedule_model | text not null | unscheduled, one_time, rolling, or fixed |
| repeat_frequency | text not null | none, daily, weekly, monthly, custom, or daily_until_complete |
| repeat_interval | integer not null default 1 | check (repeat_interval > 0) |
| repeat_days_of_week | smallint[] not null default '{}' | Every value 0–6; cardinality 0–7 |
| repeat_day_of_month | integer | Null or 1–31 |
| repeat_monthly_mode | text not null default 'day_of_month' | day_of_month or ordinal_weekday |
| repeat_monthly_ordinal | text | Null or first, second, third, fourth, last |
| repeat_monthly_weekday | smallint | Null or 0–6 |
| one_time_due_on | date | Required only for one_time; null otherwise |
| due_time | time without time zone | Optional within-day presentation/validation constraint |
| anchor_date | date | Stable recurrence basis; null for unscheduled and only when unavailable |
| anchor_kind | text not null | user_selected, first_schedule_boundary, reconstructed, migration_prospective, or unknown |
| anchor_confidence | text not null | proven, high_confidence, ambiguous, or unavailable |
| historical_scope_known | boolean not null | False for a prospective boundary |
| prospective_only | boolean not null default false | Must imply historical_scope_known=false |
| prior_boundary_id | uuid | Owner-safe self-FK `(user_id, prior_boundary_id) -> adhdice_task_schedule_boundaries(user_id, id)`; null only for initial boundary |
| affected_occurrence_id | uuid | Nullable for Delay boundary; deferred owner-safe FK `(user_id, affected_occurrence_id) -> adhdice_task_occurrences(user_id, id)` |
| logical_day_settings_revision | bigint not null | Profile settings generation used to accept the boundary |
| timezone | text not null | IANA timezone snapshot; validated by command/function against pg_timezone_names |
| day_start_time | time without time zone not null | Logical-day boundary snapshot |
| actor_kind | text not null | user, authorized_automation, migration, or repair |
| actor_id | uuid | Required for user/repair; null for migration/authorized server automation where no user actor exists |
| source | text not null | Non-empty source label |
| command_id | uuid | Runtime command identity, nullable for migration initial boundary |
| idempotence_identity | text not null | Stable retry identity for runtime or migration append |
| migration_operation_id | uuid | Nullable for live commands; source migration operation when backfilled |
| migration_version | text | Required when actor_kind='migration' |
| classifier_version | text | Required when actor_kind='migration' |
| schema_contract_version | text not null | Canonical storage contract version |
| source_task_revision | bigint | Legacy Task revision/fingerprint evidence |
| revision | bigint not null default 1 | Immutable row revision marker |
| created_at, updated_at | timestamptz not null default now() | Timestamp policy |

Unique constraints and checks:

- unique (user_id, entity_id, boundary_sequence) prevents conflicting same-sequence boundaries.
- unique (user_id, id) supports composite child references.
- `prior_boundary_id` and `affected_occurrence_id` are added as matching `(user_id, id)` composite FKs after all referenced tables exist; a user_id-only FK is insufficient.
- schedule_model='unscheduled' requires repeat_frequency='none', one_time_due_on is null, and anchor_date is null.
- schedule_model='one_time' requires repeat_frequency='none' and one_time_due_on is not null.
- schedule_model in ('rolling','fixed') requires repeat_frequency <> 'none'.
- repeat_monthly_mode='day_of_month' requires null ordinal and weekday; ordinal_weekday requires both.
- anchor_confidence in ('proven','high_confidence') requires anchor_date is not null; anchor_kind='unknown' requires null anchor.
- prospective_only implies historical_scope_known=false.
- boundary_type='initial' requires prior_boundary_id is null; all other types require a prior boundary after the initial bootstrap.

The implementation must validate strict sequence/effective-date ordering in the command/RPC transaction. A BEFORE business trigger must not invent or reorder boundaries.

### 4.2 Indexes, ordering, deletion, and RLS

Required indexes:

- (user_id, entity_id, effective_from_logical_date desc, boundary_sequence desc) for replay;
- (user_id, entity_id, boundary_sequence desc) for latest-boundary reads;
- (user_id, schedule_model, effective_from_logical_date) for bounded migration/reporting; and
- (user_id, entity_id, prior_boundary_id) for ancestry checks.

Boundaries are ordered by boundary_sequence; effective_from_logical_date must be nondecreasing for one entity. A future boundary can share a logical date only when sequence and command identity distinguish a valid same-day transition. FK to Task is on delete restrict; Trash does not touch boundaries. RLS is enabled. Authenticated clients receive owner-scoped SELECT; inserts/updates/deletes are RPC-only and denied directly. Migration functions use the private migration role, not client-supplied ownership.

## 5. adhdice_task_occurrences

Occurrences are materialized on demand, never for every future calculated fixed date.

| Column | Type/nullability/default | Exact rule |
|---|---|---|
| id | uuid primary key default gen_random_uuid() | Stable UUID occurrence identity |
| user_id, entity_id, entity_kind | owner-scoped UUID/text | Composite FK to Task; kind must match Task |
| occurrence_key | text not null | Must equal task:{entity_id}:occurrence:{scheduled_due_on} |
| scheduled_due_on | date not null | Immutable original scheduled origin |
| source_boundary_id | uuid not null | Owner-safe composite FK `(user_id, source_boundary_id) -> adhdice_task_schedule_boundaries(user_id, id)` that established the origin |
| recurrence_source_fingerprint | text not null | Rule/anchor digest |
| origin_kind | text not null | proven, reconstructed, or legacy_ambiguous |
| origin_confidence | text not null | proven, high_confidence, ambiguous, or unavailable |
| provenance_kind, actor_kind, actor_id, source | provenance fields | Source and actor evidence |
| materialization_reason | text not null | explicit_outcome, delay, complete, migration_reconstruction, manual_correction, or required_command_state |
| resolution_state | text not null default 'unresolved' | unresolved, resolved, or superseded |
| resolved_logical_date | date | Required when resolved |
| resolved_outcome | text | Null or done, did_my_best, missed, delayed, complete |
| resolved_history_id | uuid | Deferred owner-safe composite FK `(user_id, resolved_history_id) -> adhdice_task_history_facts(user_id, id)` |
| command_id, migration_operation_id | uuid | Runtime/migration provenance; runtime command reference uses `(user_id, command_id)`, while migration provenance is linked by 1E-2B |
| revision | bigint not null default 1 | check (revision >= 1) |
| created_at, updated_at | timestamptz not null default now() | Timing/audit |

Use unique (user_id, entity_id, scheduled_due_on), unique (user_id, occurrence_key), unique (user_id, id), and unique (user_id, id, scheduled_due_on). The first enforces the current same-day identity contract; the second makes deterministic retry lookup cheap; the third supports owner-safe child references; the fourth supports date-matching composite FKs from effective overrides and History. The source boundary FK is restricted. Occurrence FK from workflow/history/override is restricted; no future projection inserts one.

Required indexes are (user_id, entity_id, scheduled_due_on), (user_id, entity_id, resolution_state, scheduled_due_on), (user_id, source_boundary_id), and (user_id, occurrence_key). RLS is owner-scoped select; mutations are command/RPC-only.

## 6. adhdice_task_occurrence_effective_overrides

This is append-only. scheduled_due_on is copied for constraint/reference verification and never replaced by effective_due_on.

| Column | Type/nullability/default | Exact rule |
|---|---|---|
| id | UUID PK | Override identity |
| user_id, entity_id, occurrence_id | UUID not null | Owner-scoped composite FKs |
| scheduled_due_on | date not null | Must match the referenced occurrence through `(user_id, occurrence_id, scheduled_due_on) -> adhdice_task_occurrences(user_id, id, scheduled_due_on)` |
| effective_due_on | date not null | Must be strictly after action_logical_date |
| action_logical_date | date not null | Logical date of Delay/correction |
| delay_kind | text not null | delay or correction |
| override_sequence | bigint not null | Deterministic append order per occurrence; CHECK (override_sequence >= 1) and unique with `(user_id, occurrence_id)` |
| prior_override_id | UUID | Owner-safe self-reference to the previous override for this occurrence; null for sequence 1 |
| prior_override_sequence | bigint | Previous sequence; null for sequence 1 and otherwise exactly `override_sequence - 1` |
| schedule_boundary_id | UUID not null | Owner-safe composite FK `(user_id, schedule_boundary_id) -> adhdice_task_schedule_boundaries(user_id, id)` under which movement was accepted |
| history_id | UUID | Nullable owner-safe composite FK `(user_id, history_id) -> adhdice_task_history_facts(user_id, id)` for the Delayed audit row |
| provenance_kind, actor_kind, actor_id, source | provenance fields | Required source evidence |
| command_id, idempotence_identity, migration_operation_id | UUID/text/UUID | Runtime/migration identity; `idempotence_identity` and `accepted_payload_digest` are required for every append |
| accepted_payload_digest | text not null | Digest of the accepted Delay/correction request or migration input; same identity with a different digest is rejected |
| revision | bigint not null default 1 | Immutable row revision marker; never business ordering |
| created_at, updated_at | timestamptz | Timing/audit |

Use unique (user_id, occurrence_id, idempotence_identity) for runtime and migration retry, unique (user_id, occurrence_id, override_sequence) for deterministic per-occurrence order, unique (user_id, occurrence_id, id) for the prior-override FK, and unique (user_id, id) for general owner-safe references. Add a composite FK `(user_id, occurrence_id, scheduled_due_on) -> adhdice_task_occurrences(user_id, id, scheduled_due_on)` plus `(user_id, occurrence_id, prior_override_id) -> adhdice_task_occurrence_effective_overrides(user_id, occurrence_id, id)` and `(user_id, occurrence_id, prior_override_sequence) -> adhdice_task_occurrence_effective_overrides(user_id, occurrence_id, override_sequence)`. Sequence 1 requires null prior fields; every later row requires both prior fields and `prior_override_sequence = override_sequence - 1`, with composite self-FKs proving the same user, occurrence, and predecessor. The current override is the row with the greatest `override_sequence`; `created_at` is audit timing only and never business ordering. Repeated Delay with the same identity and digest returns the existing row; the same identity with a different digest is rejected. A different concurrent request must lock the occurrence/current predecessor and supply the expected latest occurrence revision/override sequence; a stale expected state returns a conflict and appends nothing. A migration retry uses the same deterministic operation identity, input digest, and expected predecessor; it replays the existing row or returns a conflict and never allocates a second sequence for the same operation. RLS is owner-scoped select and RPC-only mutation. FK to Task and occurrence is restrict; Trash/restore leaves overrides intact.

## 7. adhdice_task_history_facts — canonical explicit History

The new table is the canonical History authority. It is a replaceable current fact, not append-only event sourcing. adhdice_task_command_operations stores the before/after digest and replacement/clear evidence.

| Column | Type/nullability/default | Exact rule |
|---|---|---|
| id | UUID PK | Stable current fact row |
| user_id, entity_id, entity_kind | owner-scoped | Composite FK to Task; kind must match |
| logical_date | date not null | Explicit outcome date |
| outcome | text not null | done, did_my_best, missed, delayed, or complete |
| event_kind | text not null | explicit_outcome, terminal_complete, delay_audit, correction, or authorized_automation |
| occurrence_id | UUID | Nullable safe origin reference; when present, owner-safe composite FK with scheduled_due_on to `adhdice_task_occurrences` |
| scheduled_due_on | date | Nullable only when origin is unavailable; required with occurrence_id |
| effective_due_on | date | Required for canonical delayed; otherwise null unless a correction explicitly records it |
| schedule_boundary_id | UUID | Owner-safe composite FK `(user_id, schedule_boundary_id) -> adhdice_task_schedule_boundaries(user_id, id)` used for interpretation |
| recurrence_source_fingerprint | text | Snapshot/digest when recurrence applies |
| provenance_kind | text not null | user, authorized_automation, migration_reconstruction, or repair |
| actor_kind, actor_id, source | source fields | User/automation/migration evidence |
| logical_day_settings_revision | bigint not null | Profile generation |
| timezone | text not null | Context snapshot |
| day_start_time | time without time zone not null | Context snapshot |
| command_id, idempotence_identity, migration_operation_id | UUID/text/UUID | Runtime/migration identity; runtime command reference is owner-safe and migration provenance is linked by 1E-2B |
| source_legacy_history_id | UUID | Raw source row identity; no cascade FK |
| revision | bigint not null default 1 | Replace/clear expected revision |
| created_at, updated_at | timestamptz | Timing/audit |

Constraints:

- unique (user_id, entity_id, logical_date) is the one authoritative explicit outcome rule.
- unique (user_id, id) supports owner-safe references.
- `(user_id, entity_id)` and `(user_id, schedule_boundary_id)` are owner-safe composite FKs when the references are present. When `occurrence_id` is present, `(user_id, occurrence_id, scheduled_due_on)` references the matching occurrence key; a nullable occurrence reference is allowed only for the explicitly origin-unavailable cases in this table.
- event_kind='terminal_complete' requires outcome='complete'; event_kind='delay_audit' requires outcome='delayed'.
- outcome='delayed' requires effective_due_on is not null and effective_due_on > logical_date.
- occurrence_id is not null requires scheduled_due_on is not null; no occurrence is assigned merely because due_on is present.
- outcome='complete' does not itself prove lifecycle unless the same command transaction updates the Task terminal axis.
- There is no automatic_missed canonical value and no calculated Missed insert path.
- Runtime/authorized-repair canonical facts require a non-null command_id and a null migration_operation_id; migration_reconstruction facts require a non-null migration_operation_id and a null command_id. `idempotence_identity` is required in either case. Migration provenance never fabricates a user command.

Create indexes (user_id, entity_id, logical_date desc), (user_id, logical_date desc, updated_at desc), (user_id, occurrence_id), and (user_id, command_id). Replace updates require expected row revision or absent-row proof. Clear physically removes the current fact through the canonical command and records the prior digest/result in the command ledger; it does not create a Missed row.

## 8. adhdice_task_legacy_history_evidence

Every current adhdice_task_history row needed for migration is copied here before canonical History uniqueness is enforced. This table is never read as canonical Task History.

| Column | Type/nullability/default | Exact rule |
|---|---|---|
| id | UUID PK | Evidence row identity |
| source_history_id | UUID not null | Original adhdice_task_history.id; unique per source/user |
| user_id, entity_id | UUID | Owner and raw Task identity; entity_id nullable only for orphan evidence |
| legacy_entry_date | date not null | Original entry_date |
| legacy_status | text not null | Original enum rendered as text |
| legacy_event_type | text not null | Original event_type |
| legacy_occurrence_key, legacy_occurrence_due_on | text/date | Original values |
| legacy_counted_as_due_occurrence, legacy_was_completed | boolean not null | Original booleans |
| legacy_created_at, legacy_updated_at | timestamptz not null | Original timestamps |
| source_kind | text not null | adhdice_task_history, legacy_rollover, legacy_reward_reconciliation, or unknown |
| classification | text not null | automatic_missed, explicit_missed, ambiguous, legacy_rollover, legacy_reward_reconciliation, or other |
| confidence | text not null | proven, high_confidence, medium_confidence, low, or unavailable |
| source_operation | text | RPC/patch/writer clue when uniquely known |
| source_snapshot | jsonb not null default '{}' | Exact raw evidence copy |
| migration_operation_id | UUID | Backfill operation |
| migration_version, classifier_version, schema_contract_version | text | Version proof |
| retained_at | timestamptz not null default now() | Evidence retention marker |
| created_at, updated_at | timestamptz | Store timing |

Use unique (user_id, source_history_id) and indexes (user_id, classification, legacy_entry_date desc), (user_id, entity_id, legacy_entry_date desc), and unresolved/ambiguous partial indexes. FK to the current Task is not required for orphan preservation; if present for safe rows it is on delete set null. RLS allows owner-scoped select only; migration/admin writes are private.

Classification is authoritative for migration behavior: automatic_missed is compatibility evidence, explicit_missed may backfill canonical Missed only when provenance is proven, and ambiguous never silently becomes canonical outcome.

## 9. adhdice_task_calendar_overrides

This table stores date-scoped scheduling state, not outcomes.

| Column | Type/nullability/default | Exact rule |
|---|---|---|
| id | UUID PK | Override identity |
| user_id, entity_id, entity_kind | owner-scoped | Composite Task FK and kind check |
| logical_date | date not null | Date scope |
| override_state | text not null | unscheduled, not_due, or due_open |
| reason | text | Optional non-empty explanation |
| is_active | boolean not null default true | Current active marker |
| cleared_at | timestamptz | Required when inactive |
| cleared_by_command_id | UUID | Nullable owner-safe composite FK `(user_id, cleared_by_command_id) -> adhdice_task_command_operations(user_id, command_id)` |
| provenance_kind, actor_kind, actor_id, source | source fields | Manual, authorized repair, or migration |
| command_id, idempotence_identity, migration_operation_id | UUID/text/UUID | Retry/source evidence |
| revision | bigint not null default 1 | Active replacement/clear revision |
| created_at, updated_at | timestamptz | Timing |

Use a unique partial index on (user_id, entity_id, logical_date) where is_active. The Task and nullable runtime command references use owner-safe composite FKs. A clear marks the row inactive and retains it; it never writes History or changes Repeat. Required indexes are active entity/date, user/date, and unresolved migration source. RLS is owner-scoped select; mutations are command/RPC-only.

## 10. Command-operation ledger: adhdice_task_command_operations

This is compact replay/idempotence storage, not universal event sourcing.

| Column | Type/nullability/default | Exact rule |
|---|---|---|
| id | UUID PK | Operation row identity |
| user_id | UUID not null | Owner |
| entity_id | UUID | Nullable for user-level rollover/settings command |
| entity_kind | text | Null only for user-level command |
| command_id | UUID not null | Client/runtime command identity |
| command_type | text not null | set_outcome, clear_outcome, complete_task, delay_occurrence, set_due_date, set_repeat, calendar_override, archive_task, trash_task, restore_task, start_in_progress, clear_in_progress, reconcile_rollover, or hierarchy_change |
| idempotence_identity | text not null | Stable retry identity |
| accepted_payload_digest | text not null | Exact payload digest |
| logical_day_context_identity | text | Context identity for state-sensitive commands |
| requested_logical_date, requested_occurrence_key | date/text | Requested scope |
| expected revisions | bigint nullable fields | expected_entity_revision, expected_history_revision, expected_boundary_sequence, expected_occurrence_revision |
| expected_facts_fingerprint | text | Narrower proof when multiple facts participate |
| state | text not null default accepted | accepted, rejected, committed, failed_retryable, failed_permanent, or needs_explicit_resolution |
| result_digest | text | Deterministic result digest |
| result_references | jsonb | Fact IDs and after-state references; object only |
| conflict_code | text | Stale/ownership/ambiguity diagnostic code |
| source_kind | text not null | runtime, authorized_automation, or repair |
| schema_contract_version | text not null | Command contract version |
| created_at, completed_at | timestamptz | Completion nullable until terminal state |

Use unique (user_id, id), unique (user_id, idempotence_identity), and unique (user_id, command_id). The `(user_id, command_id)` key is the parent key for owner-safe command references. Same identity plus same payload/proof returns the stored result. Same identity with a different payload is rejected. A command row is required for every canonical state-changing runtime command and not required for pure reads or calculated Missed evaluation. Migration operations use the separate migration ledger and never fabricate user commands.

Required indexes: (user_id, command_id), (user_id, entity_id, created_at desc), (user_id, state, created_at), and (user_id, requested_logical_date). RLS is owner-scoped select only; runtime mutations execute through authenticated RPCs with server-owned user_id.

## 11. Reward entitlement, grant, and claim storage

### 11.1 adhdice_task_reward_entitlements

This is the canonical handled-success entitlement. It is committed atomically with the successful canonical Task/History transition for runtime commands, or created by the private migration path only when the historical bootstrap evidence rules below are satisfied.

| Column | Type/nullability/default | Exact rule |
|---|---|---|
| id | UUID PK | Entitlement identity |
| user_id, entity_id, entity_kind | owner-scoped | Parent/step/substep checked against Task |
| logical_date | date not null | Reward scope |
| reward_program_version | text not null | Program identity; version changes create a new uniqueness namespace |
| canonical_history_id | UUID not null | Canonical success source |
| canonical_command_id | UUID | Runtime success command source; null only for `migration_bootstrap` |
| canonical_event_identity | text not null | Stable source identity |
| outcome_snapshot | text not null | done, did_my_best, or complete |
| effective_obligation_identity | text | Current effective grouping identity when applicable |
| eligibility_kind | text not null | handled_success or authorized_automation |
| entitlement_source_kind | text not null | `runtime_command` or `migration_bootstrap` |
| state | text not null default pending | pending, fulfilled, or blocked |
| migration_operation_id | UUID | Non-null only for `migration_bootstrap`; never a command identity |
| created_at, updated_at, fulfilled_at | timestamps | Fulfillment nullable |

Unique (user_id, id) supports owner-safe child references. Unique (user_id, entity_id, logical_date, reward_program_version) is immutable even after reversal, claim, or status correction. Done, Did My Best, and Complete share this key. No entitlement is created for Delay, Missed, calculated Missed, In Progress, Archive, Trash, or time passage. A blocked runtime entitlement remains unique and must be explicitly resolved, never duplicated. The exact source checks are: `entitlement_source_kind='runtime_command'` requires `canonical_command_id is not null and migration_operation_id is null`; `entitlement_source_kind='migration_bootstrap'` requires `canonical_command_id is null and migration_operation_id is not null`. `canonical_history_id` is always required and owner-safe; migration bootstrap therefore points to a canonical History fact that itself records migration provenance, not to a fabricated command.

Historical reward evidence may produce a migration-bootstrap entitlement only when all of the following are true: (1) the matching canonical History row is an explicit handled-success outcome for the same owner, entity, logical date, and outcome, with no unresolved contradiction; (2) its source History classification is `PROVEN` or `CANONICAL_RECONSTRUCTABLE` under the locked Phase 1D-2 rules, and the resulting canonical History row records migration provenance; (3) a legacy claim/roll/effect or pending-reward operation uniquely proves the same owner/entity/date and reward-program scope, with a stable source operation/effect identity; and (4) the migration operation records the source fingerprint and evidence snapshot. A success History row without unique economy evidence, a status-only row, a pending balance without source mapping, or an ambiguous/owner-mismatched claim creates migration evidence/issues only and no entitlement. A consumed mapping may preserve `fulfilled`; a proven pending mapping may create `pending`; migration creates no grant, bank item, or new claim.

Required indexes: uniqueness key, (user_id, state, created_at), (user_id, entity_id, logical_date desc), and (user_id, canonical_command_id). Composite FKs to Task and canonical History are restrict; the nullable runtime command reference is the owner-safe composite FK described above. RLS is owner-scoped select and RPC-only state changes.

### 11.2 adhdice_task_reward_grants

The target uses a new canonical grant record. Existing pending-dice/banked-roll structures cannot supply the required entitlement FK, stable one-per-entitlement identity, program version, and retry state without becoming a second ambiguous authority.

| Column | Type/nullability/default | Exact rule |
|---|---|---|
| id | UUID PK | Grant identity |
| user_id | UUID not null | Owner |
| entitlement_id | UUID not null | Owner-safe composite FK `(user_id, entitlement_id) -> adhdice_task_reward_entitlements(user_id, id)`, restrict |
| grant_operation_identity | text not null | Stable retry identity |
| grant_kind | text not null default banked_roll | Only banked_roll in this phase |
| units | integer not null default 1 | Positive grant count |
| grant_payload | jsonb not null default '{}' | Deterministic reward payload/object |
| state | text not null default pending | pending, applied, failed, or reconciled |
| last_error_code, last_error_message | text | Retry evidence |
| economy_reference | text | Existing bank/roll/ledger identity when applied |
| created_at, applied_at, updated_at | timestamps | Effect timing |

Use unique (user_id, id), unique (user_id, entitlement_id, grant_kind), and unique (user_id, grant_operation_identity). One entitlement produces at most one normal grant. Grant application is separate and retryable; it never changes Task, History, recurrence, lifecycle, or projections. Existing adhdice_pending_reward_dice* remains an operational queue/evidence adapter, not the canonical grant identity.

### 11.3 adhdice_task_reward_claim_consumptions

The existing adhdice_task_reward_claims remains legacy compatibility/effect evidence. Add a distinct canonical consumption table:

| Column | Type/nullability/default | Exact rule |
|---|---|---|
| id | UUID PK | Consumption identity |
| user_id | UUID not null | Owner |
| grant_id | UUID not null | Owner-safe composite FK `(user_id, grant_id) -> adhdice_task_reward_grants(user_id, id)`, restrict |
| claim_operation_identity | text not null | Stable retry identity |
| state | text not null default pending | pending, consumed, or failed |
| economy_reference | text | Point/roll/bank effect identity |
| error_code, error_message | text | Retry evidence |
| created_at, consumed_at, updated_at | timestamps | Timing |

Use unique (user_id, id), unique (user_id, grant_id), and unique (user_id, claim_operation_identity). Existing claims map as consumed only when owner, entity/date, roll/effect, and promotion evidence uniquely prove the mapping. Ambiguous claims remain evidence and block new grant for the affected scope. A claim is never proof of Task success by itself.

## 12. Profile logical-day revision

Keep adhdice_user_profiles as the canonical current source. Add:

~~~text
settings_revision bigint not null default 1 check (settings_revision >= 1)
~~~

Retain timezone text not null and day_start_time text not null default '06:00' in their current physical form during the first migration. Add a format check for day_start_time (HH:MM or HH:MM:SS with valid ranges). IANA timezone validity is enforced by canonical command/RPC validation against pg_timezone_names, not a cross-catalog CHECK. Any timezone/day-start change increments settings_revision in the same profile transaction.

The canonical logical-day context identity is the deterministic digest of user_id + settings_revision + timezone + day_start_time + evaluated_logical_date. Boundaries, History, commands, and entitlements store the revision and timezone/day-start snapshot. Local storage remains display startup fallback only and never outranks profile persistence or authorizes mutation.

## 13. Migration state, operations, and needs-attention evidence

### 13.1 adhdice_task_state_migrations — one row per user

Primary key is user_id. Columns:

~~~text
user_id uuid references auth.users(id) on delete cascade
migration_version text not null
classifier_version text not null
schema_contract_version text not null
reward_program_version text not null
state text not null check (state in ('not_started','classified','canonical_backfilled','shadow_verified','command_cutover','complete','needs_attention'))
last_successful_stage text not null
source_fingerprint text
snapshot_taken_at timestamptz
lease_token uuid
lease_owner text
lease_acquired_at timestamptz
lease_expires_at timestamptz
forward_only_at timestamptz
counts jsonb not null default '{}'
diagnostic_summary jsonb not null default '{}'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
~~~

last_successful_stage is one of M0, M1, M2, M3, M4, M5, M6, M7, M8, or M9. Lease ownership is operational and never Task truth. Unique user primary key prevents duplicate account state. Required indexes are (state, updated_at), (lease_expires_at), and (migration_version, classifier_version).

### 13.2 adhdice_task_state_migration_entities — one row per user/entity

Primary key (user_id, entity_id) with the required composite FK `(user_id, entity_id) -> adhdice_clean_tasks(user_id, id)`. Columns:

~~~text
entity_kind text not null
state text not null using the same seven-state allow-list
migration_version text not null
classifier_version text not null
source_revision bigint
source_fingerprint text
canonical_revision bigint
blocking_issue_count integer not null default 0 check (blocking_issue_count >= 0)
classification jsonb not null default '{}'
stage_counts jsonb not null default '{}'
last_successful_stage text
forward_only_at timestamptz
last_operation_id uuid
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
~~~

Use indexes (user_id, state, updated_at), (user_id, blocking_issue_count desc), and (user_id, entity_kind). `last_operation_id` uses `(user_id, last_operation_id) -> adhdice_task_migration_operations(user_id, id)` once 1E-2B creates that parent key. A user may be command_cutover for proven entities while another entity is needs_attention.

### 13.3 adhdice_task_state_migration_issues — migration-only evidence

Use a small migration-only table, not a general TaskStateDiagnostic store. Columns:

~~~text
id uuid primary key default gen_random_uuid()
user_id uuid not null
entity_id uuid
source_history_id uuid
category text not null check (category in (
  'anchor_unknown','schedule_boundary_contradiction','delay_origin_unknown',
  'complete_contradiction','trash_prior_container_unknown','in_progress_stale',
  'hierarchy_orphan','hierarchy_cycle','cross_user_reference',
  'legacy_subtask_unmapped','legacy_subtask_duplicate','reward_ambiguous',
  'malformed_repeat','orphan_history','orphan_effect','projection_contradiction'
))
severity text not null check (severity in ('info','warning','blocking'))
classification text not null
evidence_snapshot jsonb not null default '{}'
evidence_fingerprint text not null
scope_identity text not null
classifier_version text not null
source_operation text
resolved_at timestamptz
resolution_operation_id uuid
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
~~~

Use unique (user_id, scope_identity, category, evidence_fingerprint, classifier_version), where scope_identity is equal to entity UUID or user scope. `entity_id` and `source_history_id` intentionally have no restrictive canonical FK: issue rows must preserve orphan/cross-user evidence. `resolution_operation_id` uses the owner-safe `(user_id, resolution_operation_id) -> adhdice_task_migration_operations(user_id, id)` FK once 1E-2B creates that parent key. Index unresolved blocking rows by (user_id, severity, resolved_at) and (category, resolved_at).

### 13.4 adhdice_task_migration_operations

Columns:

~~~text
id uuid primary key default gen_random_uuid()
user_id uuid not null
entity_id uuid
operation_kind text not null check (operation_kind in ('classify','backfill','delta','verify','projection_rebuild','stage_advance'))
operation_identity text not null
input_fingerprint text not null
state text not null check (state in ('started','committed','failed_retryable','failed_permanent'))
result_fingerprint text
result_references jsonb not null default '{}'
migration_version text not null
classifier_version text not null
schema_contract_version text not null
error_code text
error_message text
created_at timestamptz not null default now()
completed_at timestamptz
~~~

Use unique (user_id, id) for owner-safe migration-operation references and unique (user_id, operation_identity) to make batches restartable. Migration operation IDs are never written as user command identities. Canonical rows that carry `migration_operation_id` receive the matching `(user_id, migration_operation_id) -> adhdice_task_migration_operations(user_id, id)` FK in 1E-2B; the operation table remains operational provenance, not a canonical Task-state authority.

All migration tables enable RLS. Authenticated users may read their own report/state rows only if the future product exposes them; they have no direct write grants. Private migration functions/scripts own writes. Any SECURITY DEFINER function must live outside the exposed schema, set a fixed search path, validate auth.uid() or a controlled migration role, and have explicit execute grants.

## 14. Classifier/dry-run implementation artifact

The primary M0 artifact is a read-only TypeScript script:

~~~text
scripts/task-state-migration-dry-run.ts
~~~

It loads owner-scoped Task, current History, legacy Subtask/promotion, profile logical-day, reward/economy, and known rollover evidence in bounded batches; applies one versioned pure classifier; emits JSON/JSONL; and performs no writes. A future SQL view/function may support set-based extraction, but it is not the primary classifier because the high-risk rules require source-aware deterministic TypeScript classification and the current schema is not guaranteed deployed.

The script must support --user-id, bounded --batch-size, --classifier-version, --schema-contract-version, and an output path. It must reject a live write mode. The report contains both per-user and per-entity records.

The global report is the same versioned shape with userId omitted and aggregate counts plus userCount, classifiedUserCount, commandCutoverEligibleUserCount, and blockedUserCount. Global counts must equal the sum of per-user records, and the script must emit both scopes for every run.

### 14.1 Per-user report shape

~~~json
{
  "reportVersion": "task-state-migration-dry-run-v1",
  "migrationVersion": "task-state-migration-v1",
  "classifierVersion": "task-state-classifier-v1",
  "schemaContractVersion": "task-state-schema-v1",
  "generatedAt": "...",
  "userId": "...",
  "sourceFingerprints": {"tasks": "...", "history": "...", "rewards": "..."},
  "counts": {
    "taskEntities": 0,
    "hierarchy": {"parent": 0, "step": 0, "substep": 0, "orphan": 0, "cycle": 0},
    "scheduleModels": {"unscheduled": 0, "one_time": 0, "rolling": 0, "fixed": 0, "ambiguous": 0},
    "anchors": {"proven": 0, "reconstructable": 0, "prospective": 0, "ambiguous": 0},
    "history": {"explicit": 0, "automaticMissed": 0, "ambiguous": 0, "contradictory": 0},
    "occurrences": {"proven": 0, "reconstructable": 0, "ambiguous": 0},
    "delay": {"safe": 0, "ambiguous": 0},
    "completeContradictions": 0,
    "archiveTrash": {"proven": 0, "priorUnknown": 0, "contradictory": 0},
    "inProgress": {"valid": 0, "stale": 0, "contradictory": 0},
    "rewards": {"mapped": 0, "consumed": 0, "pending": 0, "ambiguous": 0},
    "legacySubtasks": {"promoted": 0, "unpromoted": 0, "nested": 0, "orphan": 0, "duplicate": 0},
    "orphanReferences": 0,
    "projectionMismatches": 0,
    "needsAttention": 0
  },
  "eligibility": {"safePercent": 0, "blockedEntityCount": 0, "commandCutoverEligible": false}
}
~~~

### 14.2 Per-entity report shape

Each entity record must include:

~~~json
{
  "userId": "...",
  "entityId": "...",
  "entityKind": "parent|step|substep",
  "parentEntityId": "...",
  "scheduleModel": "unscheduled|one_time|rolling|fixed|ambiguous",
  "anchor": {"classification": "proven|reconstructable|prospective|ambiguous", "confidence": "...", "date": null, "evidence": []},
  "historyClassifications": [],
  "occurrenceClassifications": [],
  "delayState": "none|safe|ambiguous",
  "lifecycleState": {"terminal": "...", "container": "...", "priorContainer": "proven|unknown|contradictory"},
  "workflowState": "none|valid_in_progress|stale|contradictory",
  "rewardBootstrapState": "none|consumed_proven|pending_proven|safe|ambiguous",
  "migrationEligibility": "safe|partial|needs_attention|blocked",
  "blockingIssueCodes": [],
  "sourceFingerprints": {}
}
~~~

## 15. Exact classifier algorithms

The classifier is read-only and conservative. Missing reliable evidence produces ambiguous, not invented SQL logic.

### 15.1 Schedule model

~~~text
if repeat_frequency = 'none' and due_on is null -> unscheduled / proven
if repeat_frequency = 'none' and due_on is not null -> one_time / proven
if repeat_frequency in ('daily','custom','daily_until_complete') and fields valid -> rolling / proven family
if repeat_frequency = 'weekly' and weekdays/interval valid -> fixed / proven family
if repeat_frequency = 'monthly' and monthly rule valid -> fixed / proven family
otherwise -> ambiguous or invalid; preserve the raw configuration
~~~

The selector wins over stale extra fields. delayed, complete, archived, and trashed do not create a fifth schedule model.

### 15.2 Anchor and prospective boundary

Evidence precedence is: exact valid occurrence plus matching schedule boundary; unique reconstruction from complete History/rule sequence; otherwise a safe prospective boundary from migration logical date/current valid forward configuration. due_on may seed a current rolling cursor only when proven as unresolved current obligation; it never becomes historical anchor evidence. Multiple plausible anchors remain ambiguous.

A prospective boundary requires valid owner/entity, valid recurrence fields, no contradictory future evidence, lifecycle-safe future evaluation, unique current/future cursor or user-selected future due date, no unresolved Delay origin needed for the first obligation, valid profile context, historical_scope_known=false, and preserved pre-boundary evidence.

### 15.3 History classification

- Explicit command or uniquely source-proven user/authorized action for Done, Did My Best, Delay, Missed, or Complete -> canonical candidate with proven/high confidence.
- event_type=completed_permanently plus status=complete, owner-safe Task, and no contradiction -> explicit Complete candidate and terminal candidate.
- Done/DMB/Delayed with no command identity can be promoted only when the writer context and chronology exclude automatic rollover; confidence is at most high.
- Missed linked to rollover ledger/RPC evidence -> automatic_missed compatibility evidence.
- Missed with both manual and automatic writers plausible -> ambiguous; never canonicalized by timestamp.
- Broken owner/task relation -> orphan evidence only.
- Multiple explicit assertions for one entity/date without replacement proof -> contradictory; never choose newest timestamp alone.

### 15.4 Automatic Missed

Automatic Missed is classified only from unique rollover operation/ledger/writer evidence or a closed-due-date chronology that uniquely implies the automatic writer. status, counted_as_due_occurrence, was_completed, occurrence_key, and timestamps alone never prove user intent. Calculated Missed after migration is derived and produces no row.

### 15.5 Complete

event_type=completed_permanently + status=complete is strong Complete evidence. status=complete or completed_at without matching Complete History is projection-only/ambiguous and cannot create terminal state. Complete plus Archive is terminal plus archived; Complete plus Trash is terminal plus trashed. Complete followed by later active History without explicit reopen is contradictory and blocks terminal-sensitive cutover.

### 15.6 Delay

Safe Delay requires proven origin occurrence/scheduled date, proven target, action logical date, target strictly after action date, and no conflicting later boundary. The delayed origin remains the same occurrence. A future due_on without origin proof is ambiguous evidence only. Fixed same-date collision preserves both origins and derives one effective grouping; it does not merge canonical occurrence rows.

### 15.7 In Progress

Valid In Progress requires current status/active evidence, a valid current logical date, and a matching proven current occurrence when an occurrence is claimed. Stale prior-day In Progress is preserved as evidence; it never becomes Did My Best. In Progress on archived/trashed/terminal Task is contradictory and lifecycle precedence wins.

### 15.8 Hierarchy

Use same-table parent_task_id and owner-safe recursive traversal. Null parent at depth zero is parent; depth one is step; depth two or greater is substep. Cross-user parent, missing parent, cycle, and ambiguous title-based equivalence are needs-attention. No promotion mapping or separate-child compatibility path remains supported.

### 15.9 Rewards

Map a claim as consumed only with owner-safe canonical entity/date identity and a stable reward roll/effect. Pending dice is pending effect evidence only. A success History with no canonical entitlement/grant proof creates no historical entitlement. An ambiguous claim blocks a new grant for that entity/date. Reversal never reopens uniqueness and never claws back consumed economy.

## 16. Backfill and prospective normalization

### 16.0 Approved M2 snapshot policy

M2 is a forward snapshot cutover. The current persisted Task snapshot is the
authority for current terminal/container/workflow state and for the initial
current/future schedule boundary. Historical legacy History is copied as raw
evidence, but exhaustive reconstruction of old recurrence anchors, occurrence
identity, Delay chains, workflow transitions, command identities, Missed
provenance, or reward economics is not a cutover requirement. When a legacy
provenance value is not trustworthy, the migration records unknown/needs-
attention evidence instead of inventing a value; only the minimum current-day
handled fact needed to preserve today's behavior may be materialized.

### 16.1 Backfill order

The implementation order is:

1. User profile settings and migration context.
2. Task identity and same-table hierarchy.
3. Legacy Subtask mapping candidates.
4. Schedule model and initial full boundary.
5. Anchor classification and eligible prospective boundary.
6. Proven/reconstructable materialized occurrences.
7. Legacy History evidence and classification.
8. Canonical explicit History facts.
9. Delay effective overrides.
10. Terminal/container/workflow axes.
11. Uniquely proven Calendar overrides.
12. Reward entitlement bootstrap from proven consumed/pending evidence; no grant/bank creation.
13. Guarded compatibility projection rebuild.
14. Per-entity/user migration markers and report closure.

Each step reads only prior-authoritative inputs, writes deterministic operation identities, is restartable, and emits set-based verification counts. A failed row is retried or marked needs-attention; the batch never infers completion from partial row count.

### 16.2 Prospective boundary

When the historical anchor cannot be recovered but future scheduling is deterministic, create an initial adhdice_task_schedule_boundaries row with anchor_kind='migration_prospective', anchor_confidence='high_confidence' only for the future basis, historical_scope_known=false, prospective_only=true, effective_from_logical_date at the migration boundary or later proven date, and migration provenance. It must not rewrite old History or claim historical anchor certainty.

## 17. Migration lease and consistency mechanism

Use the hybrid required by Phase 1D-2: per-user migration lease plus a short write gate, one consistent snapshot, and a final delta pass.

### 17.1 Lease contract

- Lease row: adhdice_task_state_migrations.user_id.
- Lease key: user UUID; a future implementation may additionally take a transaction advisory lock on hashtextextended('adhdice-task-state-migration:' || user_id, 0) while the stage transaction is open.
- Acquisition atomically sets lease_token, lease_owner, lease_acquired_at, and lease_expires_at only when no live lease exists or the existing lease is expired.
- Renewal requires the same token and owner. Expiry is bounded and never silently transfers work.
- A second worker retries with backoff or reports the user as queued; it does not steal a live lease.
- If the lease expires, the worker marks the operation retryable, releases no canonical rows, and restarts from the last committed entity operation.
- Reads remain available. State-sensitive writes for the user are queued/rejected with a visible migration-gate result during the critical backfill interval. If an existing legacy writer cannot honor the gate, that user is excluded or placed in an explicit short write window.

### 17.2 Snapshot/delta algorithm

1. Acquire user lease/write gate.
2. Snapshot Task, History, hierarchy, profile, reward/economy source revisions/fingerprints.
3. Classify and backfill bounded entities with migration operation identities.
4. Re-read all participating revisions/fingerprints.
5. Retry changed entities from the newer snapshot; do not append invented historical boundary rows.
6. Run a final delta pass for Task, History, hierarchy, profile, reward claim/effect, and promotion changes.
7. Verify no relevant revision changed across the final pass.
8. Commit entity markers and then user stage; release lease.

If every live writer participates in the gate, the delta pass is still required for changes queued just before acquisition and for external/admin effects. If a writer cannot participate, the user cannot be marked clean.

The alternatives were evaluated as follows: a full maintenance/read-only window is safest but unnecessarily disruptive; a delta pass without a shared gate is unsafe while direct legacy writers remain reachable; universal dual-write is not realistic across the current History, rollover, reward, and Subtask writers; the selected per-user lease plus short gate, consistent snapshot, and delta pass is the smallest safe mechanism that preserves availability for other users and makes non-participating writers explicit failures.

## 18. Planned SQL/script artifacts

These files are planned only; none is created by Phase 1E-1.

| Artifact | Stage | Purpose | Idempotence/write/rollback |
|---|---|---|---|
| supabase/add_task_state_canonical_schema.sql | M1 / 1E-2A | Canonical Task/profile bootstrap foundation plus canonical fact/effect/command/reward structures, owner-safe base FKs, checks, RLS, grants, indexes, helpers, and schema marker | DDL rerunnable with guarded names; schema-only; no migration tables/functions and no data writes; rollback is disabling runtime, not dropping data |
| scripts/task-state-migration-dry-run.ts | M0 | Read-only classifier/report | No writes; rerunnable; report artifact only |
| supabase/add_task_state_migration_support.sql | M1/M2 / 1E-2B | Legacy History evidence plus migration state/entity/issue/operation tables, migration-only owner-safe references, and private classifier/backfill support scaffolding | DDL plus safe support functions; rerunnable; no canonical fact/effect/command/reward ownership and no business data deletion |
| scripts/task-state-migration-backfill.ts | M2 | Bounded lease/snapshot/backfill/delta orchestration | Deterministic operation IDs; data-writing; retryable; rollback leaves canonical rows |
| supabase/verify_task_state_schema.sql | M1 | Read-only deployment-proof assertions for structure, RLS, grants, and signatures | Read-only; rerunnable; no rollback needed |
| supabase/verify_task_state_migration.sql | M2/M3 | Read-only integrity, provenance, ownership, and no-loss assertions | Read-only; report failure blocks stage advance |
| scripts/task-state-shadow-report.ts | M3 | Compare legacy-visible and canonical EffectiveTaskState | Read-only; mismatch report; no runtime writes |
| supabase/add_task_state_command_rpcs.sql | M4 | Narrow transactional user command functions | Idempotent by command ledger; runtime rollback uses canonical compatibility adapter |
| supabase/add_task_state_projection_sync.sql | M5 | Canonical-to-legacy projection/rebuild functions | Guarded/retryable; never mutates canonical truth on projection failure |
| supabase/add_task_state_cutover_support.sql | M6-M8 | Temporary gates, canonical rollover, legacy disable/retirement probes | Idempotent operational functions; rollback disables gates without deleting canonical rows |

The first SQL file after approval is exactly supabase/add_task_state_canonical_schema.sql. It owns 1E-2A only: the canonical Task/profile foundation, canonical fact/effect/command/reward tables, their owner-safe composite keys/FKs, bootstrap-safe constraints, RLS/grants, immutable timestamp/revision helpers, and schema version marker. It does not create `adhdice_task_state_migrations`, `adhdice_task_state_migration_entities`, `adhdice_task_state_migration_issues`, or `adhdice_task_migration_operations`; it does not create migration functions/classifier machinery, backfill data, alter runtime writers, implement command semantics, or execute live migration. Its nullable `migration_operation_id` provenance columns are allowed to exist without a parent FK until 1E-2B creates that operational parent table.

supabase/add_task_state_migration_support.sql owns 1E-2B only: `adhdice_task_legacy_history_evidence`, the four migration state/entity/issue/operation structures, their migration-only indexes/RLS/grants, private lease/classifier/backfill support functions, and the deferred owner-safe `(user_id, migration_operation_id)` provenance FKs from canonical rows where appropriate. It does not create or redefine canonical Task/fact/effect/command/reward tables, alter product semantics, or perform a backfill merely because its support structures exist. The TypeScript dry-run/backfill scripts remain separate artifacts with the write boundaries in this table.

## 19. DDL ordering and constraint strategy

The two SQL artifacts have separate DDL orders:

**1E-2A — `add_task_state_canonical_schema.sql`:**

1. Create/reuse the required extension and canonical schema contract marker.
2. Add the Task/profile bootstrap columns, `canonicalization_status`, and Task owner unique key without semantic defaults on legacy rows.
3. Create schedule boundaries, occurrences, effective-date overrides, canonical History facts, Calendar overrides, the command ledger, and reward entitlements/grants/claim consumptions.
4. Add the required unique keys, indexes, bootstrap-safe checks, and all immediate owner-safe canonical composite FKs. Add deferred/circular FKs after every referenced canonical table exists. Runtime canonical writes must satisfy these constraints immediately.
5. Enable RLS, create policies, revoke direct mutation grants, grant owner-scoped select/execute, and add only timestamp/revision/projection-support triggers and the canonical schema marker.

1E-2A does not create migration state tables, migration operation parents, migration functions, classifiers, or backfill writes. Canonical tables may carry nullable `migration_operation_id` columns without an FK until 1E-2B.

**1E-2B — `add_task_state_migration_support.sql`:**

1. Create `adhdice_task_legacy_history_evidence` plus migration state, entity, issue, and operation structures with their private-role RLS/grants and indexes.
2. Add owner-safe migration-operation keys/FKs and the deferred migration provenance FKs from canonical rows; preserve nullable/orphan issue evidence where the source identity is not proven.
3. Add only private lease/classifier/backfill support functions and migration schema markers. No function writes canonical business facts merely because the support artifact is installed.

M1 verification occurs after 1E-2A and before any M2 backfill. Data-dependent validation and proven backfill occur only in the later migration stages. `NOT VALID` is permitted only for FKs/checks that inspect pre-existing legacy data; validation is a separate gate. `CREATE INDEX CONCURRENTLY` is required for large live tables where deployment tooling permits it; unique indexes must be validated before backfill stage advance.

## 20. Transaction boundaries

### 20.1 Per-user migration

Do not use one all-users transaction. Use one bounded user/entity operation transaction for each deterministic batch: acquire/verify lease, read consistent source, write canonical rows, write migration operation result, and update entity marker. User-level stage advancement is a separate short transaction after all entity batches and verification pass.

### 20.2 SetOutcome

One canonical transaction commits command operation, History replace, safe occurrence resolution, required boundary/cursor canonical facts, workflow termination, and the reward entitlement for a handled success. Entitlement is deliberately atomic with canonical successful History because a committed success must never lose eventual eligibility after a crash. Grant/bank/claim effects are downstream and retryable.

### 20.3 Complete

One canonical transaction commits Complete History, terminal permanently_complete, occurrence resolution, workflow termination, recurrence termination boundary/projection, command result, and the one handled-success entitlement for that logical date. Archive/container state is included only when explicitly part of the command.

### 20.4 Delay

One transaction commits Delayed History, occurrence effective override, boundary reference, origin/effective proof, and command result. It creates no entitlement.

### 20.5 Calendar/lifecycle/workflow

Calendar create/replace/clear is one command transaction over the active override and command ledger. Archive/Trash/restore is one transaction over container axis, prior-container evidence, workflow termination, canonical revision, and command evidence. Start/Clear In Progress is one transaction over workflow columns and command evidence; it creates no History or reward.

### 20.6 Projection and reward effects

Compatibility projections run after canonical commit in a separate retryable transaction. Projection failure is a non-business failure, is recorded, and cannot change canonical Task/History/entitlement truth. Grant application and claim consumption each use their own stable operation transaction. Reward failure never rolls back canonical Task truth.

## 21. RLS and ownership model

Enable RLS on every new public table. For each user-readable table, policies target authenticated and use (select auth.uid()) = user_id. Every update policy has both USING and WITH CHECK. No policy uses deprecated auth.role().

Composite owner FKs are required for every listed canonical relationship, not only for rows that have `entity_id`: workflow occurrence, boundary ancestry/occurrence, occurrence source/history, effective override occurrence/boundary/prior/history, canonical History occurrence/boundary, entitlement History/command, grant entitlement, and claim grant. Every referenced canonical table exposes `UNIQUE (user_id, id)` (and the command ledger exposes `UNIQUE (user_id, command_id)`). The policy is defense in depth, not the only owner check. `entity_kind` is verified against the Task row by RPC or a safe relational check, never trusted from client payload.

Policy matrix:

| Table | Authenticated select | Direct insert/update/delete | Privileged path |
|---|---|---|---|
| Task entity/profile | Own rows | Existing compatibility grants remain during transition; canonical semantic writes use RPC | Canonical command/projection functions |
| Boundaries/occurrences/overrides/History/Calendar | Own owner-scoped rows | None | Canonical command RPCs or migration role |
| Command ledger/reward tables | Own rows needed for read/claim UI | None | Canonical command/effect RPCs |
| Legacy History evidence | Own evidence only if exposed | None | Migration role |
| Migration state/entities/issues | Own read-only report if exposed | None | Private migration role/functions |
| Migration operations | No client access by default | None | Private migration role |

All public functions have explicit REVOKE/GRANT rules. Runtime RPCs derive owner from auth.uid() and verify any requested entity belongs to that user. Migration functions are in a non-exposed schema or have a controlled migration role; a SECURITY DEFINER function is allowed only there with fixed search path and explicit identity validation.

## 22. FK, hard-delete, Trash, and retention behavior

Trash is a canonical container transition, not deletion. Trash preserves boundaries, History, occurrences, overrides, workflow evidence, entitlements, grants, claims, and migration evidence.

New canonical child FKs to Task, History, occurrence, entitlement, and grant use ON DELETE RESTRICT so a hard delete cannot silently destroy economic/audit truth. Existing legacy FK cascades remain untouched during the initial migration. A future hard-delete/retention operation must explicitly handle or retain these restricted facts; it is not part of the first SQL file.

The exact initial delete policy is: boundaries, occurrences, effective overrides, canonical History, and Calendar overrides restrict Task deletion; command operations preserve entity_id as audit text/nullable identity and do not cascade; reward entitlements, grants, and claim consumptions restrict deletion; per-user migration state cascades only with auth user deletion; per-entity migration state may be retained with a nullable raw entity identity if the later retention operation requires it; and legacy History evidence uses no restrictive Task FK so orphan evidence survives. Achievement, point-ledger, roll, and old claim records remain retained compatibility/economic facts and are not deleted by Task Trash. No retention duration or destructive cleanup is invented here.

## 23. Index plan

Required indexes, in addition to primary/unique constraints:

- Task: (user_id, entity_kind, container_state, terminal_state), (user_id, parent_task_id, sort_order, id).
- Boundaries: (user_id, entity_id, effective_from_logical_date desc, boundary_sequence desc), (user_id, entity_id, boundary_sequence desc).
- Occurrences: (user_id, entity_id, scheduled_due_on), (user_id, entity_id, resolution_state, scheduled_due_on), (user_id, occurrence_key).
- Effective overrides: (user_id, occurrence_id, override_sequence desc), (user_id, entity_id, effective_due_on).
- History facts: (user_id, entity_id, logical_date desc), (user_id, logical_date desc, updated_at desc), (user_id, occurrence_id).
- Legacy evidence: (user_id, classification, legacy_entry_date desc), (user_id, entity_id, legacy_entry_date desc), unresolved partial index.
- Calendar: active partial (user_id, entity_id, logical_date), (user_id, logical_date desc).
- Commands: (user_id, command_id), (user_id, entity_id, created_at desc), (user_id, state, created_at).
- Reward: entitlement uniqueness and (user_id, state, created_at), grants (user_id, entitlement_id), claims (user_id, grant_id).
- Migration: (state, updated_at), (user_id, state, updated_at), unresolved issue (user_id, severity, resolved_at), operation (user_id, operation_identity).

Do not add indexes for hypothetical future queries or calculated future occurrences.

## 24. Trigger policy

### Retain during compatibility

- adhdice_clean_set_updated_at() for timestamps;
- adhdice_clean_tasks_bump_revision() for the old projection row, with canonical revision owned by command code;
- existing History occurrence/duration triggers while adhdice_task_history remains a legacy reader/source; and
- current achievement capture triggers only for legacy History compatibility during the transition.

### Add for the target

- updated_at maintenance triggers on mutable canonical tables;
- no business trigger for schedule evaluation, recurrence, Missed, Complete, Delay, reward banking, or workflow conversion;
- no trigger that trusts client user_id instead of composite FKs/RPC owner validation.

Canonical commands/RPCs own all multi-fact semantics. Achievement capture from canonical History is a downstream explicit operation after canonical commit, with its own source identity and retry; it is not a trigger that can veto Task truth. Existing legacy triggers retire only after their specific gates pass.

## 25. Canonical command/RPC boundary

Future runtime repositories call narrow RPCs, not one universal mutation function. Every function accepts p_command_id, p_idempotence_identity, expected revisions/fingerprints, logical-day context, and a canonical payload; owner comes from auth.uid().

| Conceptual RPC | Inputs | Atomic facts | Output |
|---|---|---|---|
| adhdice_task_set_outcome | entity, logical date, outcome, occurrence/effective target, revision proof, command identity | History, occurrence resolution, rolling/fixed transition as applicable, workflow clear, reward entitlement for success | TaskCommandResult with after state, fact refs, entitlement ref |
| adhdice_task_complete | entity, logical date, occurrence, revision proof, command identity | Complete History, terminal state, recurrence termination, occurrence/workflow, entitlement | after state and all refs |
| adhdice_task_delay_occurrence | occurrence, target date, action context, revision proof, command identity | Delayed History, effective override, boundary reference | origin/effective result |
| adhdice_task_set_schedule | full boundary snapshot, effective logical date, expected boundary sequence | New immutable boundary and guarded projections | boundary result |
| adhdice_task_set_calendar_override | entity/date/state, expected override revision, command identity | create/replace active override | override result |
| adhdice_task_clear_calendar_override | entity/date, expected override revision | deactivate active override | cleared result |
| adhdice_task_set_container | archive/trash/restore plus prior evidence | container axis, workflow termination, prior restore evidence | lifecycle result |
| adhdice_task_set_workflow | start/clear, logical date/occurrence, workflow revision | workflow fields only | workflow result |
| adhdice_task_reconcile_rollover | user/context, bounded entity set, projection/effect intent | no new ordinary Missed; only guarded projection/effect reconciliation | per-entity no-op/repair results |

Stale revision returns a structured conflict and no write. Same command retry returns the recorded result. Conflicting payload under an existing idempotence key returns rejection. RPCs never silently fall back to legacy writers.

Reward grant/claim RPCs are separate: adhdice_task_apply_reward_grant and adhdice_task_consume_reward_claim operate only on entitlement/grant/claim/economy records and cannot update Task/History/schedule fields.

## 26. Migration function boundary

Migration functions are separate from user runtime commands. Planned functions, whether implemented as private-schema SQL functions or called by the TypeScript orchestrator:

- adhdice_migration_read_classification — read-only bounded classification support;
- adhdice_migration_begin_user_lease / adhdice_migration_renew_user_lease — lease ownership;
- adhdice_migration_backfill_user_batch — one deterministic bounded batch;
- adhdice_migration_apply_delta — changed-revision reconciliation;
- adhdice_migration_verify_user — set-based assertions/report;
- adhdice_migration_advance_entity_stage and adhdice_migration_advance_user_stage — guarded markers; and
- adhdice_migration_extract_issues — unresolved issue/report extraction.

They must accept migration version, classifier version, contract version, lease token, source fingerprint, and operation identity. They must not accept a client owner or alter canonical facts outside the leased user/entity scope.

## 27. Projection synchronization

The direction is always:

~~~text
canonical Task/History/schedule/lifecycle/workflow facts
    -> guarded compatibility projection writer
    -> status, due_on, active fields, completed_at, trashed_at
~~~

The projection writer may update only:

~~~text
status
due_on
active_status_logical_date
active_occurrence_due_on
completed_at
trashed_at
repeat_frequency
repeat_interval
repeat_days_of_week
repeat_day_of_month
repeat_monthly_mode
repeat_monthly_ordinal
repeat_monthly_weekday
~~~

The schedule list is included only while old readers need it; canonical boundary remains authority. Each projection update supplies expected canonical_revision, projection_source_fingerprint, and old Task revision. A mismatch becomes a retryable projection conflict. Projection failure is recorded, does not create History/reward, and is repaired by adhdice_task_rebuild_compatibility_projection or the bounded script. Legacy writers cannot mutate canonical facts by changing a projection.

## 28. Canonical read adapter

readTaskState() for one entity must load, owner-scoped and using stable revision/fingerprint joins:

1. Task entity row and canonical lifecycle/container/workflow fields.
2. Latest boundary at or before requested logical date plus prior relevant boundaries around the range.
3. Explicit History facts in the requested replay range.
4. Materialized occurrences and effective overrides for those History rows/current obligation.
5. Active Calendar override for requested date.
6. Profile timezone/day-start/settings revision.
7. Migration issue/evidence only when a diagnostic or unsupported-origin decision requires it.
8. Reward entitlement state when the caller requests eligibility/effect output.

For Table/List, use batch loading by (user_id, entity_id[]): one Task query, one boundary query ordered by entity/date/sequence, one History query, one occurrence query, one override query, one Calendar query, and one reward query, then group in memory. Do not issue one query per entity. Future projected occurrences remain calculated.

## 29. Database types implementation plan

After the final SQL is authored and deployed, regenerate/update (in an authorized later ticket):

- src/lib/database.types.ts table row/insert/update surfaces;
- Task adapters for canonical lifecycle/entity/workflow fields;
- engine canonical input types for boundary/occurrence/History/override facts;
- repository row/result types and TaskCommandResult mappings;
- migration report, marker, issue, and operation types; and
- reward entitlement/grant/claim types.

Do not hand-edit generated database types in Phase 1E-1. Current Task, TaskHistory, TaskRewardClaim, pending-dice, and profile types remain untouched.

## 30. M0/M1/M2 verification artifacts

### 30.1 M0 dry-run review

Go/no-go review requires the report in §14 to show per-user candidate count, needs-attention count, safe canonicalization percentage, high-risk categories, reward ambiguity, hierarchy ambiguity, and per-Task blocking codes. A nonzero ambiguity count is acceptable only when each row has a classified code/evidence snapshot.

### 30.2 M1 schema deployment proof

supabase/verify_task_state_schema.sql must assert, read-only:

- every target table and column exists with expected type/nullability/default;
- PKs, composite owner FKs, self-FKs, unique constraints, partial unique indexes, and required indexes exist;
- all target CHECK constraints exist with expected allow-lists;
- RLS is enabled on every target public table;
- policies use owner predicates and update WITH CHECK;
- direct mutation grants are absent where RPC-only is specified;
- expected function/RPC signatures and schema contract marker exist; and
- no M2 write runs until every assertion passes.

### 30.3 M2 backfill verification

supabase/verify_task_state_migration.sql must assert:

- no duplicate entity mapping or cross-user reference;
- no duplicate canonical History entity/date;
- no occurrence natural-key duplicate;
- no effective override without occurrence;
- no automatic Missed in canonical History;
- no Complete terminal mismatch among proven rows;
- no reward entitlement duplicate;
- every canonical migrated row has migration provenance;
- no banked roll/grant was created by migration;
- every ambiguous source is represented in evidence/issues;
- migration markers do not claim complete with unresolved blocking issues; and
- compatibility projection mismatches are classified and repairable.

## 31. M3 shadow-read specification

The existing read-only shadow infrastructure must compare canonical versus legacy-visible results for:

- active terminal/container/workflow state;
- current effective obligation and due/effective cursor;
- Calendar states, including future fixed schedule membership;
- positive and Missed streaks;
- lifecycle/container/workflow precedence;
- reward eligibility/entitlement state; and
- projection fields.

Comparison records include user/entity, context identity, source revision fingerprints, legacy state, canonical EffectiveTaskState, projection state, mismatch class, confidence, diagnostic IDs, block flag, and timestamp. Expected intentional differences include calculated Missed versus legacy automatic Missed rows, prospective-boundary historical uncertainty, and canonical lifecycle axes that a single old status cannot represent. Unexplained occurrence consumption, reward duplication, owner mismatch, or terminal contradiction blocks cutover.

## 32. Cutover gates and forward-only marker

Use the smallest temporary gate set:

~~~text
canonical_storage_enabled
canonical_read_enabled
canonical_commands_enabled
canonical_rewards_enabled
canonical_rollover_enabled
legacy_fallback_enabled
~~~

Order: storage -> dry-run -> migration support -> canonical proven backfill -> shadow reads -> command families -> compatibility projection -> rewards -> rollover -> read cutover -> legacy writer disablement. legacy_fallback_enabled is temporary and must be scoped to unmigrated/unsupported entities, never silently selected after a canonical command/projection failure.

The forward-only marker is adhdice_task_state_migrations.forward_only_at, plus per-entity forward_only_at. Set it when an entity/account receives any canonical-only fact not losslessly representable by the old schema: a schedule boundary change, Calendar override, Delay override, canonical occurrence identity, canonical entitlement/grant, or command-ledger-backed write. After that point rollback may use a canonical-to-legacy adapter and projections, but may not pretend the old schema is complete authority or delete canonical facts.

Gate behavior:

- disabling canonical_read_enabled before forward-only uses legacy compatibility for entities without canonical-only facts;
- disabling it after forward-only uses canonical compatibility read, not raw status;
- disabling canonical_commands_enabled stops new canonical writes and queues/rejects state-sensitive writes visibly;
- disabling canonical_rewards_enabled stops grant processing but leaves entitlements pending/retryable;
- disabling canonical_rollover_enabled stops coordination only; reads remain reconstructable;
- disabling legacy_fallback_enabled must fail visibly for an unmigrated/unsupported entity, never write a mixed authority.

Rollback never deletes canonical migrated data.

## 33. Legacy writer retirement map

| Legacy writer/helper | Current responsibility | Canonical replacement | Disable stage | Retirement verification | Rollback implication |
|---|---|---|---|---|---|
| getTaskDisplayStatus* / task-cockpit calculators | Composite display/status calculation | Canonical read projection | After M3/read cutover | All active readers receive canonical state; no raw fallback | Keep read adapter only |
| resolveLiveTaskStatusFromHistory | History-driven live status/due mutation/read | Canonical History command/read authority | After M4 | No direct History writer recalculates Task fields | Canonical adapter required |
| task-repeat recurrence mutation helpers | Repeat/due recurrence mutation | Schedule boundary command | After schedule command parity | Every caller routes through boundary RPC | Formatting-only helper may remain |
| Automatic Missed writer / reconcileOverdueTaskMisses() | Time-driven Missed rows | Derived Missed reader | After M3/M7 | No ordinary automatic History writer; replay parity | Never re-enable as repair |
| adhdice_reconcile_task_rollover | Legacy rollover Task/History mutation | Canonical rollover coordinator | After M7 deployment proof | Live signature/version, no-op replay, offline/multi-day proof | Leave compatibility operation only if isolated |
| Engine rollover automatic-History behavior | Client plan application | Canonical read/projection/effect reconciliation | After M7 | No ordinary Missed rows; idempotent projections | Canonical facts remain |
| finalizeRecurringTasks() Task mutations | Reward-owned recurrence/status/child reset | Canonical command; explicit child-reset owner | After reward/recurrence parity | No reward caller changes Task recurrence/status | Reward retry cannot mutate Task |
| Legacy Subtask status authority | Separate child lifecycle/status | Same-table canonical Task Entity | After hierarchy/reward/history mapping | Every active child mapped/classified | Keep evidence/read adapter |
| Generic occurrence-sensitive updateTask paths | Direct Task/History/projection patching | Narrow canonical command RPCs | Per command-family cutover | Caller matrix has no raw occurrence writer | Reject unsupported mutation |
| Direct History live-status reconciliation | History insert/update plus Task field repair | Canonical History command plus projection sync | After History command cutover | Projection is one-way and guarded | Repair projection only |

## 34. SQL artifact dependency graph

~~~mermaid
flowchart TD
  A["add_task_state_canonical_schema.sql"] --> B["add_task_state_migration_support.sql"]
  B --> C["task-state-migration-dry-run.ts"]
  C --> D["task-state-migration-backfill.ts"]
  D --> E["verify_task_state_migration.sql"]
  E --> F["task-state-shadow-report.ts"]
  F --> G["add_task_state_command_rpcs.sql"]
  G --> H["add_task_state_projection_sync.sql"]
  H --> I["add_task_state_cutover_support.sql"]
  I --> J["legacy writer retirement gates"]
~~~

verify_task_state_schema.sql is a gate immediately after A and before C/D. No node authorizes the next node merely because a file exists; deployment proof and runtime caller proof are required.

## 35. Failure-mode table

| Failure | Safe response |
|---|---|
| SQL file partially deployed | Stop at M1, inspect deployment state, do not rerun blindly; complete idempotently or leave unused structures. |
| RLS missing | M1 fails; revoke exposure/stop runtime; no backfill. |
| Backfill interrupted | Keep committed bounded operations; mark current operation retryable; resume from operation identity. |
| Backfill retried | Same input fingerprint returns existing result; uniqueness prevents duplicate facts. |
| Lease expires | Stop worker, mark retryable, reacquire; never continue under stale token. |
| Task changes mid-migration | Revision/fingerprint mismatch causes entity retry/delta; no invented historical boundary. |
| History changes mid-migration | Reclassify newer source; preserve explicit replacement; do not duplicate canonical date. |
| Reward claim occurs mid-migration | Gate/queue or reconcile by stable claim/effect identity; no second entitlement/grant. |
| Canonical projection write fails | Canonical truth remains committed; record projection issue; retry guarded rebuild. |
| Command commits but reward bank fails | Entitlement/grant remains pending/failed retryable; Task truth is not rolled back. |
| Classifier version changes | New classifier version creates new result/operation; old report remains immutable. |
| Canonical/legacy shadow mismatch | Classify expected vs unexplained; block only affected gate/fact; no automatic repair. |
| Legacy RPC missing | Compatibility deployment proof fails; do not silently use another writer. |
| Canonical RPC missing | Canonical command gate fails closed; no raw patch fallback. |
| Cross-user/orphan source | Preserve evidence, reject canonical relationship, mark blocking issue. |
| Ambiguous Trash prior container | Keep trashed; restore requires explicit resolution. |
| Stale In Progress | Preserve workflow evidence; do not synthesize DMB or reward. |

## 36. No-data-loss checklist

Before any future SQL/backfill approval, verify that the plan preserves:

- every explicit History row and replacement/clear evidence;
- every ambiguous/automatic History source row and classification;
- reward claims, pending items, rolls, bank/economy references, and consumed proof;
- Task UUIDs and user ownership;
- same-table and legacy hierarchy mappings, including orphan/cycle evidence;
- Complete evidence and contradictory later rows;
- Delay origin/target evidence and fixed collision candidates;
- recurrence configuration and all current Repeat fields;
- Trash timestamp and prior-container evidence/unknown state;
- timezone/day-start settings and settings revisions;
- source revisions/fingerprints, migration operation identities, and classifier versions; and
- existing compatibility projections until all readers retire.

## 37. Recommended implementation ticket sequence after approval

Each ticket is independently reviewable and must not combine schema, runtime, and live deployment.

1. 1E-2A — Canonical schema foundation. Author add_task_state_canonical_schema.sql, including Task/profile columns, tables, FKs/checks/indexes/RLS, and M1 schema marker only.
2. 1E-2B — Migration support and read-only classifier. Add migration support SQL and task-state-migration-dry-run.ts; produce M0 report without writes.
3. 1E-2C — Safe canonical backfill. Implement lease/snapshot/bounded operations/delta pass; run only after M0/M1 approval.
4. 1E-2D — Verification query artifact. Author schema/migration verification queries and reconciliation report; no runtime cutover.
5. 1E-2E — Canonical repository/types. Generate database types after deployed SQL proof and implement read adapters, still behind storage gate.
6. 1E-2F — Shadow canonical reads. Compare canonical/legacy state with semantic mismatch fixtures; no visible authority change.
7. 1E-2G — Narrow command RPCs. Implement SetOutcome, Complete, Delay, schedule, Calendar, lifecycle, and workflow transactions one family at a time.
8. 1E-2H — Compatibility projection sync. Make canonical-to-legacy projection guarded/retryable; remove reverse authority.
9. 1E-2I — Reward entitlement/effect integration. Commit entitlement atomically with success, then grant/claim retry paths; preserve existing economy records.
10. 1E-2J — Canonical rollover and gate deployment. Implement read/projection/effect reconciliation, prove deployment/signatures/no-op replay, then enable canonical rollover.
11. 1E-2K — Read/command cutover and legacy retirement. Disable legacy writers only after the exact gates in §33 and browser/live deployment review.

## 38. SQL implementation readiness

**YES.** The target is precise enough to author the first schema SQL file without another product or architecture decision.

The next artifact is exactly:

~~~text
supabase/add_task_state_canonical_schema.sql
~~~

It is allowed to contain only the M1 schema foundation: canonical Task/profile columns, target tables, exact constraints/FKs/indexes, RLS/grants, timestamp/revision helpers, and the schema contract marker. It is not allowed to backfill data, change runtime behavior, implement repositories/commands, execute SQL against a live project, or retire legacy writers.

## 39. Product decisions and scope confirmation

No new product decisions are required by Phase 1E-1. The document preserves the locked semantics:

- four schedule models;
- stable anchor separate from moving due_on;
- explicit History separate from calculated Missed;
- Delay origin separate from effective date;
- independent terminal/container/workflow axes;
- Complete as terminal and handled-success outcome;
- one entity/date/program entitlement for Done, Did My Best, or Complete;
- Parent, Step, and Substep independence; and
- rollover as coordination, not truth creation.

Production code, tests, checked-in schema, SQL files, live Supabase data/RPCs, generated database types, UI, runtime behavior, repositories, version surfaces, and cutover were untouched by this phase. Only the authorized documentation file was added.

## 40. Verification record

Required verification for this documentation-only phase:

- git diff --check;
- normal cached whitespace check if the file is staged; and
- final git status confirming only the authorized file is staged.

Do not run tests, lint, build, typecheck, browser automation, dev server, SQL, or Supabase for this phase.
